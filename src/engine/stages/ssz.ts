// SSZ — stan surowy zamknięty: pozycje domyślne (CLAUDE.md, sekcja „SSZ”).
// Ściany nośne, wieniec ścian, otwory i nadproża, ściany działowe, drzwi wewnętrzne, dach (sszRoof.ts).

import type { ProjectInput } from '../../model/project'
import { linearElementVolume } from '../concrete'
import { computeCutting, DEFAULT_FELT_OVERLAP, DEFAULT_MIN_PIECE, formworkSegmentsRect } from '../cutting'
import { GEOMETRY_REFS } from '../geometry'
import { type ItemSpec, type Param, need } from '../items'
import { computeWallLayers, floorBuildUp } from '../levels'
import {
  DEFAULT_INTERIOR_DOOR_HEIGHT,
  interiorDoors,
  lintelSchedule,
  type LintelSchedule,
  type Opening,
  openingsArea,
  sillLength,
} from '../openings'
import { computeRebarElement, defaultRingBeamRebar } from '../rebar'
import { type Computed, type TraceStep, clean, fmt } from '../trace'
import { type Builder, computed, lumpItem, makeBuilder, pourItems, projectBase, rebarItems } from './common'
import { buildSSO } from './sso'
import { roofItems } from './sszRoof'

/** Gęstość bloczków H+H Gold 590 × 240 / 590 × 120 (wys. 240): 7,06 szt/m². */
export const HH_BLOCKS_PER_M2 = 7.06

function cmLabel(m: number): string {
  return String(Math.round(m * 100))
}

/** Bloczki muru: (brutto − otwory − nadproża) × szt/m², odpad 3%. */
function wallBlocksItem(
  b: Builder,
  id: string,
  category: string,
  name: string,
  gross: Computed | null,
  grossMissing: string[],
  openings: Opening[],
  lintels: (h: number | null) => LintelSchedule,
): { item: ItemSpec; netArea: Computed | null; lintelHeight: Param } {
  const params = {
    perM2: b.P(id, 'perM2', 'Bloczków na m²', HH_BLOCKS_PER_M2, 'szt/m²'),
    lintelHeight: b.P(id, 'lintelHeight', 'Wysokość nadproża systemowego', null, 'm', 'z karty nadproża (do odjęcia od muru)'),
  }
  const missing = [...grossMissing]
  const perM2 = need(params, 'perM2', missing)
  const lh = need(params, 'lintelHeight', missing)
  const ls = lintels(lh)
  if (ls.tooWide.length) missing.push(`nadproże indywidualne dla: ${ls.tooWide.map((o) => o.mark).join(', ')} (powierzchnia do odjęcia)`)
  let netArea: Computed | null = null
  let quantity: Computed | null = null
  if (gross && perM2 !== null && ls.area !== null) {
    const op = openingsArea('Otwory w ścianie', openings)
    const net = clean(gross.value - op.value - ls.area)
    const lintelStep: TraceStep = {
      label: 'Nadproża (do odjęcia)',
      formula: 'Σ dł. nadproża × wys. × liczba otworów',
      values: `${fmt(ls.area)} m² (wys. ${fmt(lh!)} m; nadproża obok siebie na grubości ściany liczone raz)`,
      result: ls.area,
      unit: 'm²',
    }
    netArea = {
      value: net,
      unit: 'm²',
      trace: [
        ...gross.trace,
        ...op.trace,
        lintelStep,
        { label: 'Powierzchnia netto', formula: 'brutto − otwory − nadproża', values: `${fmt(gross.value)} − ${fmt(op.value)} − ${fmt(ls.area)}`, result: net, unit: 'm²' },
      ],
    }
    const pcs = clean(net * perM2)
    quantity = { value: pcs, unit: 'szt', trace: [...netArea.trace, { label: 'Bloczki', formula: 'A_netto × szt/m²', values: `${fmt(net)} × ${fmt(perM2)}`, result: pcs, unit: 'szt' }] }
  }
  const item = b.item({ id, category, kind: 'material', name, unit: 'szt', params, missing, quantity, wastePercent: 3 })
  return { item, netArea, lintelHeight: params.lintelHeight }
}

/** Klej / zaprawa na m² muru: kg = A × zużycie → worki. */
function perAreaBagItem(b: Builder, id: string, category: string, name: string, area: Computed | null, areaMissing: string[], what: string): ItemSpec {
  const params = {
    kgPerM2: b.P(id, 'kgPerM2', `Zużycie ${what}`, null, 'kg/m²', 'z karty produktu'),
    bag: b.P(id, 'bag', 'Masa worka', null, 'kg'),
  }
  const missing = [...areaMissing]
  const c = need(params, 'kgPerM2', missing)
  const bag = params.bag.value
  if (bag === null) missing.push(params.bag.label)
  return b.item({
    id,
    category,
    kind: 'material',
    name,
    unit: 'kg',
    params,
    missing,
    packaging: { packUnit: 'worek', perPack: bag, packLabel: bag === null ? 'worek' : `worek ${fmt(bag)} kg` },
    priceBasis: 'perPack',
    quantity: area && c !== null ? { value: clean(area.value * c), unit: 'kg', trace: [...area.trace, { label: what, formula: 'A × zużycie', values: `${fmt(area.value)} × ${fmt(c)}`, result: clean(area.value * c), unit: 'kg' }] } : null,
  })
}

/** Pozycje nadproży wg długości (+ ryczałt dla otworów za szerokich). */
function lintelItems(b: Builder, prefix: string, category: string, label: string, ls: LintelSchedule): ItemSpec[] {
  const out = ls.byLength.map((x) =>
    b.item({
      id: `${prefix}-${cmLabel(x.length)}`,
      category,
      kind: 'material',
      name: `Nadproże systemowe ${label} ${fmt(x.length)} m`,
      unit: 'szt',
      quantity: { value: x.count, unit: 'szt', trace: ls.trace.filter((s) => s.values.includes(`→ ${fmt(clean(x.length * 100), 1)} cm`)) },
    }),
  )
  if (ls.tooWide.length) {
    out.push(lumpItem(b, `${prefix}-indywidualne`, category, `Nadproża indywidualne (${ls.tooWide.map((o) => o.mark).join(', ')})`, true, 'otwór szerszy niż największe nadproże systemowe — belka/wieniec wg konstruktora'))
  }
  return out
}

export function buildSSZ(project: ProjectInput): { items: ItemSpec[] } {
  const b = makeBuilder(project, 'SSZ')
  const { P, item } = b
  const items: ItemSpec[] = []
  const { pOs, axis, sides } = projectBase(project)
  const t = project.wallThickness

  const fb = floorBuildUp(project.floorLayers)
  const slabTop = clean(-fb.value)
  const wl = computeWallLayers(project.wallRingBeamTop, slabTop, project.wall)

  const extOpenings = project.openings.filter((o) => o.wall === 'zewnętrzna')
  const partOpenings = project.openings.filter((o) => o.wall === 'działowa')

  // ── Ściany nośne
  const C1 = 'Ściany nośne'
  {
    const id = 'ssz-papa-sciany'
    const params = {
      stripWidth: P(id, 'stripWidth', 'Szerokość pasa papy pod ściany', 0.4, 'm'),
      rollWidth: P(id, 'rollWidth', 'Szerokość rolki papy', project.itemParams['sso-sf-papa']?.rollWidth ?? null, 'm'),
      rollLength: P(id, 'rollLength', 'Długość rolki papy', project.itemParams['sso-sf-papa']?.rollLength ?? null, 'm'),
      overlap: P(id, 'overlap', 'Zakład papy na łączeniu', DEFAULT_FELT_OVERLAP, 'm', '30 cm ± 10 cm'),
      minPiece: P(id, 'minPiece', 'Min. kawałek z resztki', DEFAULT_MIN_PIECE, 'm'),
    }
    const missing: string[] = []
    const sw = need(params, 'stripWidth', missing)
    const rw = need(params, 'rollWidth', missing)
    const rl = need(params, 'rollLength', missing)
    const ov = need(params, 'overlap', missing)
    const mp = need(params, 'minPiece', missing)
    let quantity: Computed | null = null
    if (sw !== null && rw !== null && rl !== null && ov !== null && mp !== null) {
      const cut = computeCutting({
        material: 'rolkę papy',
        sheetUnit: 'rolek',
        sheet: { width: rw, length: rl },
        stripWidth: sw,
        segments: sides.map((L, i) => ({ id: `b${i + 1}`, label: `bok ${i + 1}`, length: L })),
        minPieceLength: mp,
        jointOverlap: ov,
      })
      quantity = { value: cut.best.sheets, unit: 'szt', trace: cut.trace }
    }
    items.push(item({ id, category: C1, kind: 'material', name: 'Papa pod ściany nośne (rolki)', unit: 'szt', params, missing, quantity }))
  }
  {
    const base = computed('Podstawa pierwszej warstwy', 'P_oś × t', `${fmt(pOs.value)} × ${fmt(t)}`, pOs.value * t, 'm²', GEOMETRY_REFS.axisPerimeter)
    items.push(perAreaBagItem(b, 'ssz-zaprawa-wyrownawcza', C1, 'Zaprawa cementowa — warstwa wyrównawcza pierwszej warstwy', base, [], 'zaprawy'))
  }
  const hhGross: Computed = {
    value: clean(pOs.value * wl.value.masonryHeight),
    unit: 'm²',
    trace: [
      ...wl.trace.filter((s) => !/^Rzędna|^Wysokość wieńca/.test(s.label)),
      {
        label: 'Powierzchnia muru brutto',
        formula: 'P_oś × (n × h_warstwy + docinka)',
        values: `${fmt(pOs.value)} × ${fmt(wl.value.masonryHeight)}`,
        result: clean(pOs.value * wl.value.masonryHeight),
        unit: 'm²',
        ref: GEOMETRY_REFS.axisPerimeter,
      },
    ],
  }
  const extLintelsPer = P('ssz-nadproza-zew', 'perOpening', 'Nadproży na otwór (ściana 24 cm)', 2, 'szt')
  const extLintels = (h: number | null) => lintelSchedule(extOpenings, project.lintels.exterior, extLintelsPer.value ?? 2, h)
  const hh = wallBlocksItem(b, 'ssz-hh-bloczki', C1, 'Bloczki H+H Gold 590 × 240 × 240 mm', hhGross, [], extOpenings, extLintels)
  items.push(hh.item)
  items.push(perAreaBagItem(b, 'ssz-hh-klej', C1, 'Klej do cienkich spoin — ściany nośne', hh.netArea, hh.item.missing, 'kleju'))

  // ── Wieniec ścian nośnych
  const C2 = 'Wieniec ścian nośnych'
  const rbh = wl.value.ringBeamHeight
  const rbVol = linearElementVolume('wieniec ścian', pOs.value, t, rbh)
  rbVol.trace.unshift(...wl.trace.filter((s) => /wieni/i.test(s.label)))
  items.push(...pourItems(b, 'ssz-ws', C2, 'wieniec ścian nośnych', rbVol, [], project.concrete.wallRingBeam))
  const rp = defaultRingBeamRebar(t, rbh)
  items.push(...rebarItems(b, 'ssz-ws', 'Zbrojenie wieńca ścian', computeRebarElement('wieniec ścian', sides, rp), [], rp.massPerMeter, rp.barLength))
  {
    const id = 'ssz-ws-osb'
    const fundOsb = project.itemParams['sso-wf-osb'] ?? {}
    const params = {
      sheetLength: P(id, 'sheetLength', 'Płyta OSB — długość (kupowana)', fundOsb.sheetLength ?? null, 'm'),
      sheetWidth: P(id, 'sheetWidth', 'Płyta OSB — szerokość (kupowana)', fundOsb.sheetWidth ?? null, 'm'),
      overlap: P(id, 'overlap', 'Zakład szalunku na bloczki', 0.1, 'm'),
      minPiece: P(id, 'minPiece', 'Min. kawałek z resztki', DEFAULT_MIN_PIECE, 'm'),
      reuse: P(id, 'reuse', 'Użyj płyt z wieńca fundamentowego (1 = tak)', 0, '', 'zmniejsza zakup o płyty kupione na wieniec fundamentowy'),
    }
    const missing: string[] = []
    const sl = need(params, 'sheetLength', missing)
    const sw = need(params, 'sheetWidth', missing)
    const ov = need(params, 'overlap', missing)
    const mp = need(params, 'minPiece', missing)
    const reuse = (params.reuse.value ?? 0) >= 1
    const variant = project.choices.wallRingBeamOsbVariant
    let quantity: Computed | null = null
    let note: string | undefined
    if (sl !== null && sw !== null && ov !== null && mp !== null) {
      const cut = computeCutting({
        material: 'płytę OSB',
        sheetUnit: 'płyt',
        sheet: { width: sw, length: sl },
        stripWidth: clean(rbh + ov),
        segments: formworkSegmentsRect(axis.length, axis.width, t),
        minPieceLength: mp,
        jointOverlap: 0,
      })
      note = cut.jointsWarning ?? undefined
      const v = variant ? cut[variant] : null
      if (variant === null) missing.push('wybór wariantu cięcia OSB (A lub B)')
      else if (v === null) missing.push(`wariant ${variant} niemożliwy dla tej płyty — wybierz drugi`)
      if (v) {
        const trace: TraceStep[] = [...cut.trace, { label: 'Wariant wybrany przez użytkownika', formula: '', values: v.instruction, result: v.sheets, unit: 'płyt' }]
        let n = v.sheets
        if (reuse) {
          const fundQ = buildSSO(project).items.find((i) => i.id === 'sso-wf-osb')?.quantity ?? null
          if (fundQ === null) missing.push('płyty z wieńca fundamentowego (najpierw policz tamtą pozycję)')
          else {
            n = Math.max(0, v.sheets - fundQ.value)
            trace.push({ label: 'Płyty z wieńca fundamentowego', formula: 'max(0, potrzebne − odzyskane)', values: `max(0, ${v.sheets} − ${fundQ.value})`, result: n, unit: 'płyt' })
          }
        }
        quantity = { value: n, unit: 'szt', trace }
      }
    }
    items.push(item({ id, category: C2, kind: 'material', name: 'Płyty OSB — szalunek wieńca ścian', unit: 'szt', params, missing, quantity, ...(note ? { note } : {}) }))
  }

  // ── Otwory zewnętrzne i nadproża
  const C3 = 'Otwory zewnętrzne i nadproża'
  items.push(...lintelItems(b, 'ssz-nadproza-zew', C3, '11,5 cm', extLintels(null)))
  items.push(lumpItem(b, 'ssz-stolarka-okna', C3, 'Stolarka okienna (wycena producenta)'))
  items.push(lumpItem(b, 'ssz-stolarka-drzwi-zew', C3, 'Drzwi zewnętrzne (wycena producenta)'))
  items.push(lumpItem(b, 'ssz-brama', C3, 'Brama garażowa (wycena producenta)', project.openings.some((o) => o.type === 'brama')))
  {
    const id = 'ssz-parapety-zew'
    const params = { ext: P(id, 'ext', 'Wysunięcie parapetu w bok (z każdej strony)', 0.03, 'm') }
    const missing: string[] = []
    const e = need(params, 'ext', missing)
    const windows = project.openings.filter((o) => o.type === 'okno' && o.wall !== 'działowa')
    items.push(item({ id, category: C3, kind: 'material', name: 'Parapety zewnętrzne', unit: 'mb', params, missing, quantity: e !== null && windows.length ? sillLength(windows, e) : null, ...(windows.length ? {} : { note: 'brak okien na liście otworów' }) }))
  }

  // ── Ściany działowe
  const C4 = 'Ściany działowe'
  const partMissing: string[] = []
  if (project.partitions.length === null) partMissing.push('długość ścian działowych (mb)')
  const partH = project.partitions.height ?? clean(project.clearHeight + fb.value)
  const partGross: Computed | null =
    project.partitions.length !== null
      ? computed(
          'Powierzchnia ścian działowych brutto',
          'mb × wysokość (od chudziaka do sufitu)',
          `${fmt(project.partitions.length)} × ${fmt(partH)}`,
          project.partitions.length * partH,
          'm²',
        )
      : null
  const partLintelsPer = P('ssz-nadproza-dz', 'perOpening', 'Nadproży na otwór (ściana 12 cm)', 1, 'szt')
  const partLintels = (h: number | null) => lintelSchedule(partOpenings, project.lintels.partition, partLintelsPer.value ?? 1, h)
  const part = wallBlocksItem(b, 'ssz-dz-bloczki', C4, 'Bloczki H+H Gold 590 × 120 × 240 mm — ściany działowe', partGross, partMissing, partOpenings, partLintels)
  items.push(part.item)
  items.push(perAreaBagItem(b, 'ssz-dz-klej', C4, 'Klej do cienkich spoin — ściany działowe', part.netArea, part.item.missing, 'kleju'))
  items.push(...lintelItems(b, 'ssz-nadproza-dz', C4, '12 cm (sprawdź tabelę dostawcy)', partLintels(null)))

  // ── Drzwi wewnętrzne
  const C5 = 'Drzwi wewnętrzne'
  const doors = interiorDoors(project.openings, project.doorMap)
  for (const g of doors.groups) {
    const leaf = cmLabel(g.leaf)
    const hNote = Math.abs(g.height - DEFAULT_INTERIOR_DOOR_HEIGHT) > 1e-6 ? ` (otwór wys. ${fmt(g.height)} m)` : ''
    const tr: TraceStep[] = [
      { label: `Drzwi ${leaf}`, formula: 'otwór → skrzydło', values: `otwór ${cmLabel(g.openingWidth)} cm → skrzydło ${leaf}; ${g.marks.join(', ')}`, result: g.count, unit: 'szt' },
    ]
    items.push(item({ id: `ssz-drzwi-${leaf}`, category: C5, kind: 'material', name: `Drzwi wewnętrzne ${leaf}${hNote}`, unit: 'szt', quantity: { value: g.count, unit: 'szt', trace: tr } }))
    items.push(item({ id: `ssz-oscieznica-${leaf}`, category: C5, kind: 'material', name: `Ościeżnica ${leaf}${hNote}`, unit: 'szt', quantity: { value: g.count, unit: 'szt', trace: tr } }))
  }
  if (doors.unmapped.length) {
    items.push(
      item({
        id: 'ssz-drzwi-niezmapowane',
        category: C5,
        kind: 'material',
        name: 'Drzwi wewnętrzne — otwory bez przypisanego skrzydła',
        unit: 'szt',
        quantity: null,
        missing: doors.unmapped.map((o) => `skrzydło dla otworu ${o.mark} (${cmLabel(o.width)} cm) — dodaj do mapowania`),
      }),
    )
  }

  // ── Dach
  items.push(...roofItems(b, project))

  return { items }
}
