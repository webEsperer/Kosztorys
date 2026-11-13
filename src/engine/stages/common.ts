// Wspólne pomocniki definicji pozycji (wszystkie etapy).

import type { ProjectInput } from '../../model/project'
import { type ConcretePourParams, computeConcretePour } from '../concrete'
import { computeGeometry, type GeometryResult } from '../geometry'
import { computeCutting, type CuttingInput } from '../cutting'
import { type ItemCutting, type ItemKind, type ItemSpec, type Packaging, type Param, type PriceBasis, type Stage, type Unit, manualQuantity, need, param, validateParam, UNIT_LABEL } from '../items'
import {
  computeLevels,
  computeWallLayers,
  DEFAULT_LEVELS,
  type FloorLayers,
  floorBuildUp,
  type LevelsResult,
  partitionHeightAboveFloor,
  partitionWallHeight,
  wallRingBeamTopFromCeiling,
  wallRingBeamTopFromInput,
  type WallLayerParams,
  type WallLayersResult,
} from '../levels'
import { REBAR_WARNING, type RebarElementResult } from '../rebar'
import { type AxisRect, rectSides } from '../rebarLayout'
import { type Computed, type TraceStep, type Traced, clean, fmt } from '../trace'

export type Builder = ReturnType<typeof makeBuilder>
// ─── pomocnicze ─────────────────────────────────────────────────────────────

export interface ItemInit {
  id: string
  category: string
  kind: ItemKind
  name: string
  unit: Unit
  quantity: Computed | null
  params?: Record<string, Param>
  missing?: string[]
  packaging?: Packaging
  wastePercent?: number
  priceBasis?: PriceBasis
  chargeFullPacks?: boolean
  enabled?: boolean
  note?: string
  cutting?: ItemCutting
}

/**
 * Parametry, które muszą być > 0: wymiary arkuszy/rolek/desek/profili, rozstawy, zawartość opakowań, przekroje.
 * Pozostałe parametry mogą być 0 (zakłady, wysunięcia, przełączniki 0/1, odpad…), ale nigdy ujemne.
 */
export const POSITIVE_PARAM_KEYS = new Set([
  'stakeThickness', 'cleatWidth', 'cleatThickness', 'fasciaW', 'fasciaT',
  'bag', 'boardH', 'boardLength', 'boardThickness', 'boardWidth', 'bucket', 'cleatLength', 'coil', 'compaction', 'drum',
  'h', 'w', 'm2PerCan', 'mbPerCan', 'beadsPerBoard', 'orderStep', 'orderStepT', 'density', 'm2PerRoll', 'perPack', 'profileLength', 'rollLength', 'rollWidth', 'sheetLength', 'sheetWidth',
  'spacing', 'sx', 'sy', 'stakeLength', 'stakeWidth', 'stripWidth', 'tile',
])

export function makeBuilder(project: ProjectInput, stage: Stage = 'SSO') {
  /** Parametr z wartością domyślną, nadpisany przez użytkownika (project.itemParams). */
  const P = (itemId: string, key: string, label: string, def: number | null, unit: string, note?: string): Param => {
    const o = project.itemParams[itemId]
    const v = o && key in o ? o[key] : def
    return validateParam({ ...param(label, v, unit, note), min: POSITIVE_PARAM_KEYS.has(key) ? 'positive' : 'nonNegative' })
  }
  const item = (i: ItemInit): ItemSpec => ({
    id: i.id,
    stage,
    category: i.category,
    kind: i.kind,
    name: i.name,
    unit: i.unit,
    quantity: i.quantity,
    ...(i.packaging ? { packaging: i.packaging } : {}),
    wastePercent: i.wastePercent ?? 0,
    priceBasis: i.priceBasis ?? 'perUnit',
    ...(i.chargeFullPacks ? { chargeFullPacks: true } : {}),
    params: i.params ?? {},
    missing: i.missing ?? [],
    isCustom: false,
    enabled: project.enabled[i.id] ?? i.enabled ?? true,
    ...(i.note ? { note: i.note } : {}),
    ...(i.cutting ? { cutting: i.cutting } : {}),
  })
  return { P, item, project }
}

/**
 * Papa z rolki cięta na pasy: domyślnie wariant z mniejszą liczbą rolek (przy remisie mniej łączeń),
 * użytkownik może go zmienić (`project.choices[choiceKey]`).
 */
export function feltRolls(
  project: ProjectInput,
  choiceKey: 'foundationFeltVariant' | 'wallFeltVariant',
  input: Omit<CuttingInput, 'material' | 'sheetUnit'>,
): { quantity: Computed; cutting: ItemCutting; note?: string } {
  const cut = computeCutting({ ...input, material: 'rolkę papy', sheetUnit: 'rolek' })
  const choice = project.choices[choiceKey] ?? null
  const picked = choice ? cut[choice] : null
  const used = picked ?? cut.best
  const trace: TraceStep[] = [...cut.trace]
  let note: string | undefined
  if (choice && picked && picked.key !== cut.best.key) {
    trace.push({ label: 'Wariant zmieniony przez użytkownika', formula: '', values: picked.instruction, result: picked.sheets, unit: 'rolek' })
  } else if (choice && !picked) {
    note = `Wariant ${choice} niemożliwy dla tej rolki (pas szerszy niż rolka w tym kierunku) — przyjęto wariant ${cut.best.key}.`
    trace.push({ label: 'Wariant wybrany przez użytkownika niemożliwy', formula: '', values: `przyjęto ${cut.best.key}`, result: cut.best.sheets, unit: 'rolek' })
  }
  return {
    quantity: { value: used.sheets, unit: 'szt', trace },
    cutting: { result: cut, sheet: input.sheet, stripWidth: input.stripWidth, segments: input.segments, used: used.key, choiceKey, userMustChoose: false },
    ...(note ? { note } : {}),
  }
}

export function computed(label: string, formula: string, values: string, value: number, unit: string, ref?: string): Computed {
  const v = clean(value)
  return { value: v, unit, trace: [{ label, formula, values, result: v, unit, ...(ref ? { ref } : {}) }] }
}

/** Pozycja ręczna: ilość × cena (np. godziny pracy koparki). */
export function manualItem(b: Builder, id: string, category: string, kind: ItemKind, name: string, unit: Unit, qtyLabel: string, enabled = true): ItemSpec {
  const params = { qty: b.P(id, 'qty', qtyLabel, null, unit) }
  // Usługi i sprzęt (koparka, zagęszczarka…) można rozliczyć kwotą za całość zamiast stawki za h / dobę.
  const allowLumpSum = kind === 'service' || kind === 'equipment'
  const lumpSum = allowLumpSum && b.project.lumpSumBilling?.[id] === true
  const missing: string[] = []
  const v = lumpSum ? params.qty.value : need(params, 'qty', missing)
  const spec = b.item({ id, category, kind, name, unit, params, missing, quantity: manualQuantity(qtyLabel, v, unit), enabled, ...(lumpSum ? { priceBasis: 'lumpSum' as const } : {}) })
  return { ...spec, manualQty: { key: 'qty', allowLumpSum, lumpSum } }
}

/** Pozycja ryczałtowa: kwota wpisana ręcznie. */
export function lumpItem(b: Builder, id: string, category: string, name: string, enabled = true, note?: string): ItemSpec {
  return b.item({ id, category, kind: 'lumpSum', name, unit: 'ryczałt', quantity: null, priceBasis: 'lumpSum', enabled, ...(note ? { note } : {}) })
}

/** Betonowanie → pozycje: beton, transport, pompa, (włókna). */
export function pourItems(
  b: Builder,
  prefix: string,
  category: string,
  name: string,
  volume: Computed | null,
  volumeMissing: string[],
  pp: ConcretePourParams,
): ItemSpec[] {
  const pour = volume ? computeConcretePour(name, volume, pp) : null
  const out: ItemSpec[] = []
  out.push(
    b.item({
      id: `${prefix}-beton`,
      category,
      kind: 'material',
      name: `Beton ${pp.concreteClass} — ${name}`,
      unit: 'm3',
      quantity: pour ? pour.orderedVolume : null,
      missing: [...volumeMissing],
      note: pour
        ? `${fmt(pour.volume.value, 2)} m³ + ${fmt(pp.extraPercent)}% = ${fmt(pour.withReserve, 2)} m³ → zamawiasz ${fmt(pour.orderedVolume.value)} m³${
            pour.alternativeOrder !== null ? ` lub ${fmt(pour.alternativeOrder)} m³` : ''
          }`
        : `zapas ${fmt(pp.extraPercent)}%, zamówienie zaokrąglone w górę do ${fmt(pp.orderStep ?? 0.5)} m³`,
    }),
  )
  if (pp.transport.mode === 'perTrip') {
    out.push(
      b.item({
        id: `${prefix}-transport`,
        category,
        kind: 'service',
        name: `Transport betonu — ${name} (gruszka ${fmt(pp.transport.truckCapacityM3)} m³)`,
        unit: 'kurs',
        quantity: pour?.trips ? { value: pour.trips.value, unit: 'kurs', trace: [...pour.orderedVolume.trace, ...pour.trips.trace] } : null,
        missing: [...volumeMissing],
      }),
    )
  } else if (pp.transport.mode === 'perM3') {
    out.push(
      b.item({
        id: `${prefix}-transport`,
        category,
        kind: 'service',
        name: `Transport betonu — ${name}`,
        unit: 'm3',
        quantity: pour ? pour.orderedVolume : null,
        missing: [...volumeMissing],
      }),
    )
  }
  out.push(
    b.item({
      id: `${prefix}-pompa`,
      category,
      kind: 'equipment',
      name: `Pompa do betonu (wynajem) — ${name}`,
      unit: 'ryczałt',
      quantity: null,
      priceBasis: 'lumpSum',
      enabled: pp.pump.enabled,
    }),
  )
  if (pp.fibers?.enabled) {
    const id = `${prefix}-wlokna`
    const params = { kgPerM3: b.P(id, 'kgPerM3', 'Dozowanie włókien', pp.fibers.kgPerM3, 'kg/m³', 'z karty producenta włókien') }
    const missing = [...volumeMissing]
    const dose = need(params, 'kgPerM3', missing)
    out.push(
      b.item({
        id,
        category,
        kind: 'material',
        name: `Włókna zbrojące — ${name}`,
        unit: 'kg',
        params,
        missing,
        quantity:
          pour && dose !== null
            ? computed('Włókna', 'V_z × dozowanie', `${fmt(pour.orderedVolume.value)} × ${fmt(dose)}`, pour.orderedVolume.value * dose, 'kg')
            : null,
      }),
    )
  }
  return out
}

/** Zbrojenie elementu → pozycje stali (kg, ważone w pełnych prętach) i drut wiązałkowy. */
export function rebarItems(
  b: Builder,
  prefix: string,
  category: string,
  res: RebarElementResult | null,
  resMissing: string[],
  massPerMeter: Record<number, number>,
  barLength: number,
): ItemSpec[] {
  const out: ItemSpec[] = []
  const diameters = res ? res.byDiameter.map((x) => x.diameter) : [12, 6]
  for (const d of diameters) {
    const x = res?.byDiameter.find((y) => y.diameter === d) ?? null
    const k = massPerMeter[d]
    out.push(
      b.item({
        id: `${prefix}-stal${d}`,
        category,
        kind: 'material',
        name: `Stal Ø${d} — ${res?.name ?? category}`,
        unit: 'kg',
        quantity: x
          ? {
              value: clean(x.netMeters * k),
              unit: 'kg',
              trace: [
                ...res!.trace.filter(
                  (s) =>
                    (s.label.includes(`Ø${d}`) || (d === 6 && s.label.toLowerCase().includes('strzemion'))) &&
                    !s.label.startsWith('Masa') &&
                    !s.label.includes('do kupienia'),
                ),
                { label: `Ø${d} — masa wbudowana`, formula: 'mb × kg/m', values: `${fmt(x.netMeters)} × ${fmt(k)}`, result: clean(x.netMeters * k), unit: 'kg' },
              ],
            }
          : null,
        packaging: { packUnit: 'pręt', perPack: clean(barLength * k), packLabel: `pręt ${fmt(barLength)} m = ${fmt(barLength * k)} kg` },
        chargeFullPacks: true,
        missing: [...resMissing],
        note: REBAR_WARNING,
      }),
    )
  }
  const id = `${prefix}-drut`
  const params = { pct: b.P(id, 'pct', 'Drut wiązałkowy — % masy stali', null, '%') }
  const missing = [...resMissing]
  const pct = need(params, 'pct', missing)
  out.push(
    b.item({
      id,
      category,
      kind: 'material',
      name: `Drut wiązałkowy — ${res?.name ?? category}`,
      unit: 'kg',
      params,
      missing,
      quantity:
        res && pct !== null
          ? computed('Drut wiązałkowy', 'm_stali × %', `${fmt(res.totalMassKg)} × ${fmt(pct)}%`, (res.totalMassKg * pct) / 100, 'kg')
          : null,
    }),
  )
  return out
}


// ─── Wielkości bazowe projektu ──────────────────────────────────────────────

export interface ProjectBase {
  geo: GeometryResult
  pOs: Computed
  aWew: Computed
  /** Prostokąt osi ścian nośnych. */
  axis: AxisRect
  /** Boki w osi: lewy, górny, prawy, dolny. */
  sides: number[]
  /** Warstwy podłogi (gdy podane wszystkie). */
  floor: FloorLayers | null
  floorMissing: string[]
  /** Grubość warstw podłogi (z trace) i rzędna góry chudziaka = góry wieńca fund. */
  floorBuild: Computed | null
  slabTop: number | null
  /**
   * Rzędna góry wieńca ścian = w świetle + GK + stelaż + pustka (liczona); wysokość ręczna (legacy) — nadpisanie.
   */
  ringTop: Computed
  /** Podpowiedź: wysokość w świetle + GK + stelaż + pustka. */
  ringTopHint: Computed
  wallHeightMissing: string[]
  /** Wysokość ścian działowych od gotowej posadzki (z sufitu GK + zapas albo ręcznie). */
  partitionAbove: Computed
  /** Wysokość muru ścian działowych od chudziaka (null — brak warstw podłogi). */
  partitionHeight: Computed | null
  /** Warstwy bloczków ścian nośnych i wieniec ścian. */
  wallLayers: Traced<WallLayersResult> | null
  wallMissing: string[]
  levels: LevelsResult | null
  levelsMissing: string[]
}

/** Gęstość bloczków z wymiarów: 1 / ((dł. + spoina) × (wys. + spoina)). */
export function blocksPerM2(b: { blockLength: number | null; blockHeight: number | null; jointThickness: number }): number | null {
  if (b.blockLength === null || b.blockHeight === null) return null
  return clean(1 / ((b.blockLength + b.jointThickness) * (b.blockHeight + b.jointThickness)))
}

export function projectBase(project: ProjectInput): ProjectBase {
  const f = project.foundation
  const t = project.wallThickness
  const geo = computeGeometry({
    footprint: { kind: 'rect', length: project.footprint.length, width: project.footprint.width },
    wallThickness: t,
    facadeInsulation: project.facadeInsulation,
  })
  const axis = { length: clean(project.footprint.length + t), width: clean(project.footprint.width + t) }

  const fl = project.floorLayers
  const floorMissing: string[] = []
  if (fl.insulation === null) floorMissing.push('grubość izolacji na chudziaku')
  if (fl.screed === null) floorMissing.push('grubość wylewki')
  if (fl.finish === null) floorMissing.push('grubość wykończenia podłogi (płytka / panel)')
  const floor: FloorLayers | null = floorMissing.length ? null : { insulation: fl.insulation!, screed: fl.screed!, finish: fl.finish! }
  const floorBuild = floor ? floorBuildUp(floor) : null
  const slabTop = floorBuild ? clean(-floorBuild.value) : null

  const ringTopHint = wallRingBeamTopFromCeiling(project.clearHeight, project.ceiling)
  const wallHeightMissing: string[] = []
  // Góra wieńca ścian = w świetle + GK + stelaż + pustka (wg użytkownika); wartość ręczna — tylko nadpisanie.
  const wh = project.wallHeight ?? null
  if (wh !== null && !(wh > project.clearHeight)) wallHeightMissing.push('wysokość ścian nośnych (ręczna) większa niż wysokość w świetle')
  const ringTop = wh === null || wallHeightMissing.length ? ringTopHint : wallRingBeamTopFromInput(wh, project.clearHeight, project.ceiling)
  const pp = project.partitions
  const partitionAbove: Computed =
    pp.heightAboveFloor !== null && pp.heightAboveFloor !== undefined
      ? computed('Ściany działowe — wysokość od gotowej posadzki', 'podana ręcznie', fmt(pp.heightAboveFloor), pp.heightAboveFloor, 'm')
      : partitionHeightAboveFloor(project.clearHeight, project.ceiling, pp.topMargin ?? 0.03, wallHeightMissing.length ? null : ringTop.value)
  const partitionHeight: Computed | null = floorBuild
    ? (() => {
        const h = partitionWallHeight(partitionAbove.value, floorBuild)
        return { ...h, trace: [...partitionAbove.trace, ...h.trace] }
      })()
    : null
  const w = project.wall
  const wallMissing = [...floorMissing, ...wallHeightMissing]
  if (w.blockHeight === null) wallMissing.push('wysokość bloczka ściany nośnej')
  const wallParams: WallLayerParams | null =
    w.blockHeight === null
      ? null
      : { blockHeight: w.blockHeight, jointThickness: w.jointThickness, levelingLayer: w.levelingLayer, ringBeamMin: w.ringBeamMin, maxRingBeamExtension: w.maxRingBeamExtension }
  let wallLayers: Traced<WallLayersResult> | null = null
  if (slabTop !== null && wallParams) {
    const wl = computeWallLayers(ringTop.value, slabTop, wallParams)
    wallLayers = { value: wl.value, trace: [...floorBuild!.trace, ...ringTop.trace, ...wl.trace] }
  }

  const levelsMissing: string[] = [...floorMissing]
  if (f.blockHeight === null) levelsMissing.push('wysokość bloczka fundamentowego')
  if (f.jointThickness === null) levelsMissing.push('grubość spoiny bloczków fundamentowych')
  if (f.layers === null) levelsMissing.push('liczba warstw bloczków fundamentowych')
  if (w.blockHeight === null) levelsMissing.push('wysokość bloczka ściany nośnej')
  const levels: LevelsResult | null =
    levelsMissing.length === 0
      ? computeLevels({
          ...DEFAULT_LEVELS,
          clearHeight: project.clearHeight,
          wallRingBeamTop: ringTop.value,
          partitionHeightAboveFloor: partitionAbove.value,
          floorLayers: floor!,
          slabThickness: project.slabThickness,
          wall: wallParams!,
          foundation: {
            blockHeight: f.blockHeight!,
            jointThickness: f.jointThickness!,
            layers: f.layers!,
            ringBeamHeight: f.ringBeamHeight,
            footingFormworkHeight: f.footingFormworkHeight,
            footingHeight: f.footingHeight,
          },
        })
      : null
  return { geo, pOs: geo.axisPerimeter, aWew: geo.interiorArea, axis, sides: rectSides(axis), floor, floorMissing, floorBuild, slabTop, ringTop, ringTopHint, wallHeightMissing, partitionAbove, partitionHeight, wallLayers, wallMissing, levels, levelsMissing }
}

/** Rozpiętość wewnętrzna pod ścianami szczytowymi (bok prostopadły do kalenicy) [m]. */
export function gableSpanInterior(project: ProjectInput): number {
  const { length, width } = project.footprint
  return project.roof.ridgeAlongLonger ? Math.min(length, width) : Math.max(length, width)
}

/**
 * Uruchamia obliczenie, które może odrzucić dane (np. pas szerszy niż rolka) — zamiast przerywać cały kosztorys,
 * dopisuje komunikat do braków pozycji i zwraca null.
 */
export function attempt<T>(fn: () => T, missing: string[]): T | null {
  try {
    return fn()
  } catch (e) {
    missing.push(`popraw dane: ${e instanceof Error ? e.message : String(e)}`)
    return null
  }
}

// ─── Drewno: rozliczenie za szt / mb albo za m³ ──────────────────────────────

interface TimberSection {
  /** Parametry przekroju dodawane do pozycji tylko przy rozliczeniu za m³ (np. grubość palika). */
  defs: { key: string; label: string; def: number | null }[]
  /** Klucze parametrów (pozycji lub defs) potrzebnych do m³ na jednostkę. */
  uses: string[]
  formula: string
}

/** Przekroje pozycji z drewna (bez boazerii). m³ na jednostkę = iloczyn wymiarów z `uses`. */
export const TIMBER_SECTIONS: Record<string, TimberSection> = {
  'sso-lawy-deski': { defs: [], uses: ['boardLength', 'boardWidth', 'boardThickness'], formula: 'dł. × szer. × gr. deski' },
  'sso-lawy-paliki': {
    defs: [{ key: 'stakeThickness', label: 'Grubość palika', def: null }],
    uses: ['stakeLength', 'stakeWidth', 'stakeThickness'],
    formula: 'dł. × szer. × gr. palika',
  },
  'sso-lawy-deseczki': {
    defs: [
      { key: 'cleatWidth', label: 'Deska na deseczki — szerokość', def: 0.12 },
      { key: 'cleatThickness', label: 'Deska na deseczki — grubość', def: 0.025 },
    ],
    uses: ['boardLength', 'cleatWidth', 'cleatThickness'],
    formula: 'dł. × szer. × gr. deski',
  },
  'ssz-kontrlaty': { defs: [], uses: ['w', 'h'], formula: 'szer. × gr. kontrłaty (na mb)' },
  'ssz-laty': { defs: [], uses: ['w', 'h'], formula: 'szer. × gr. łaty (na mb)' },
  'ssz-deski-czolowe': {
    defs: [
      { key: 'fasciaW', label: 'Deska czołowa — szerokość (wysokość deski)', def: null },
      { key: 'fasciaT', label: 'Deska czołowa — grubość', def: null },
    ],
    uses: ['fasciaW', 'fasciaT'],
    formula: 'szer. × gr. deski (na mb)',
  },
  'ssz-szczyt-laty-pionowe': {
    defs: [
      { key: 'w', label: 'Łata — szerokość', def: null },
      { key: 'h', label: 'Łata — grubość', def: null },
    ],
    uses: ['w', 'h'],
    formula: 'szer. × gr. łaty (na mb)',
  },
  'ssz-szczyt-laty-poziome': {
    defs: [
      { key: 'w', label: 'Łata — szerokość', def: null },
      { key: 'h', label: 'Łata — grubość', def: null },
    ],
    uses: ['w', 'h'],
    formula: 'szer. × gr. łaty (na mb)',
  },
  'ssz-podbitka-ruszt': {
    defs: [
      { key: 'w', label: 'Łata rusztu — szerokość', def: null },
      { key: 'h', label: 'Łata rusztu — grubość', def: null },
    ],
    uses: ['w', 'h'],
    formula: 'szer. × gr. łaty (na mb)',
  },
}

/**
 * Pozycje z drewna: domyślnie za szt / mb; gdy użytkownik wybierze „za m³” (project.timberBilling[id]) —
 * ilość w m³ = ilość × m³ na jednostkę (z wymiarów) albo m³ wpisane ręcznie (parametr `m3`).
 */
export function applyTimber(b: Builder, items: ItemSpec[]): ItemSpec[] {
  return items.map((spec) => {
    const sec = TIMBER_SECTIONS[spec.id]
    if (!sec) return spec
    const m3Mode = b.project.timberBilling?.[spec.id] === true
    if (!m3Mode) return { ...spec, timber: { m3: false, baseUnit: spec.unit, fromDims: null, manual: null } }
    const extra: Record<string, Param> = {}
    for (const d of sec.defs) if (!(d.key in spec.params)) extra[d.key] = b.P(spec.id, d.key, d.label, d.def, 'm')
    const manualP = b.P(spec.id, 'm3', 'Drewno — ilość wpisana ręcznie (puste = z wymiarów)', null, 'm³')
    const params: Record<string, Param> = { ...spec.params, ...extra, m3: manualP }
    const secMissing: string[] = []
    const vals = sec.uses.map((k) => {
      const p = params[k]
      if (!p || p.value === null) secMissing.push(p ? (p.error ? `${p.label} — ${p.error}` : p.label) : k)
      return p?.value ?? null
    })
    const perUnit = vals.every((v) => v !== null) ? clean((vals as number[]).reduce((a, v) => a * v, 1)) : null
    const baseLabel = UNIT_LABEL[spec.unit]
    const fromDims = spec.quantity && perUnit !== null ? clean(spec.quantity.value * perUnit) : null
    let quantity: Computed | null = null
    let missing: string[]
    if (manualP.value !== null) {
      quantity = { value: manualP.value, unit: 'm³', trace: [{ label: 'Drewno — ilość podana przez użytkownika', formula: 'wpisane ręcznie', values: fmt(manualP.value), result: manualP.value, unit: 'm³', ...(fromDims !== null ? { note: `z wymiarów wyszłoby ${fmt(fromDims, 4)} m³` } : {}) }] }
      missing = []
    } else {
      missing = [...spec.missing, ...secMissing]
      if (spec.quantity && perUnit !== null) {
        quantity = {
          value: fromDims!,
          unit: 'm³',
          trace: [
            ...spec.quantity.trace,
            { label: `Drewno — m³ na 1 ${baseLabel}`, formula: sec.formula, values: sec.uses.map((k) => fmt(params[k].value!)).join(' × '), result: perUnit, unit: `m³/${baseLabel}` },
            { label: 'Drewno — ilość w m³', formula: `${baseLabel} × m³/${baseLabel}`, values: `${fmt(spec.quantity.value)} × ${fmt(perUnit, 6)}`, result: fromDims!, unit: 'm³' },
          ],
        }
      }
    }
    const { packaging: _p, chargeFullPacks: _c, ...rest } = spec
    return { ...rest, unit: 'm3' as Unit, quantity, params, missing, priceBasis: 'perUnit' as const, timber: { m3: true, baseUnit: spec.unit, fromDims, manual: manualP.value } }
  })
}
