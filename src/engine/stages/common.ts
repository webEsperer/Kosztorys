// Wspólne pomocniki definicji pozycji (wszystkie etapy).

import type { ProjectInput } from '../../model/project'
import { type ConcretePourParams, computeConcretePour } from '../concrete'
import { computeGeometry, type GeometryResult } from '../geometry'
import { computeCutting, type CuttingInput } from '../cutting'
import { type ItemCutting, type ItemKind, type ItemSpec, type Packaging, type Param, type PriceBasis, type Stage, type Unit, manualQuantity, need, param } from '../items'
import {
  computeLevels,
  computeWallLayers,
  DEFAULT_LEVELS,
  type FloorLayers,
  floorBuildUp,
  type LevelsResult,
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

export function makeBuilder(project: ProjectInput, stage: Stage = 'SSO') {
  /** Parametr z wartością domyślną, nadpisany przez użytkownika (project.itemParams). */
  const P = (itemId: string, key: string, label: string, def: number | null, unit: string, note?: string): Param => {
    const o = project.itemParams[itemId]
    const v = o && key in o ? o[key] : def
    return param(label, v, unit, note)
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
  return { P, item }
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
  const missing: string[] = []
  const v = need(params, 'qty', missing)
  return b.item({ id, category, kind, name, unit, params, missing, quantity: manualQuantity(qtyLabel, v, unit), enabled })
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
      note: `naddatek ${fmt(pp.extraPercent)}% wliczony w objętość do zamówienia`,
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
   * Rzędna góry wieńca ścian = wysokość ścian nośnych podana przez użytkownika.
   * Gdy jej brak (wallHeightMissing) — podpowiedź z sufitu, tylko do rysunków; pozycje są „uzupełnij”.
   */
  ringTop: Computed
  /** Podpowiedź: wysokość w świetle + GK + stelaż + pustka. */
  ringTopHint: Computed
  wallHeightMissing: string[]
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
  const wh = project.wallHeight
  if (wh === null || wh === undefined) wallHeightMissing.push('wysokość ścian nośnych (posadzka → góra wieńca)')
  else if (!(wh > project.clearHeight)) wallHeightMissing.push('wysokość ścian nośnych większa niż wysokość w świetle')
  const ringTop = wallHeightMissing.length ? ringTopHint : wallRingBeamTopFromInput(wh!, project.clearHeight, project.ceiling)
  const partitionHeight = floorBuild ? partitionWallHeight(project.partitions.heightAboveFloor ?? 2.8, floorBuild) : null
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
          partitionHeightAboveFloor: project.partitions.heightAboveFloor ?? 2.8,
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
  return { geo, pOs: geo.axisPerimeter, aWew: geo.interiorArea, axis, sides: rectSides(axis), floor, floorMissing, floorBuild, slabTop, ringTop, ringTopHint, wallHeightMissing, partitionHeight, wallLayers, wallMissing, levels, levelsMissing }
}

/** Rozpiętość wewnętrzna pod ścianami szczytowymi (bok prostopadły do kalenicy) [m]. */
export function gableSpanInterior(project: ProjectInput): number {
  const { length, width } = project.footprint
  return project.roof.ridgeAlongLonger ? Math.min(length, width) : Math.max(length, width)
}
