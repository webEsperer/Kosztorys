import { describe, expect, it } from 'vitest'
import { newProject, type ProjectInput } from '../../src/model/project'
import { buildSSZ } from '../../src/engine/stages/ssz'
import { computeItem, type ItemSpec } from '../../src/engine/items'
import { renderTrace } from '../../src/engine/trace'
import { selectLintel, DEFAULT_LINTEL_TABLE } from '../../src/engine/openings'

// Przykład 12 × 9 m, ściana 0,24 (P_oś = 42,96). Otwory PRZYKŁADOWE.
function example(): ProjectInput {
  const p = newProject('Przykład 12 × 9')
  p.floorLayers = { insulation: 0.15, screed: 0.065, finish: 0.015 }
  p.wall = { ...p.wall, blockLength: 0.59, blockHeight: 0.24 }
  p.partitionBlock = { blockLength: 0.59, blockHeight: 0.24, jointThickness: 0 }
  p.foundation = { ...p.foundation, blockLength: 0.38, blockWidth: 0.24, blockHeight: 0.12, jointThickness: 0.01, layers: 5, footingWidth: 0.6, footingHeight: 0.4 }
  p.openings = [
    { id: 'o1', mark: 'O1', type: 'okno', width: 1.5, height: 1.5, count: 4, wall: 'zewnętrzna' },
    { id: 'o2', mark: 'O2', type: 'okno', width: 0.9, height: 1.5, count: 2, wall: 'zewnętrzna' },
    { id: 'd1', mark: 'D1', type: 'drzwi zewnętrzne', width: 1.0, height: 2.1, count: 1, wall: 'zewnętrzna' },
    { id: 'd2', mark: 'D2', type: 'drzwi wewnętrzne', width: 0.9, height: 2.07, count: 3, wall: 'działowa' },
    { id: 'd3', mark: 'D3', type: 'drzwi wewnętrzne', width: 0.8, height: 2.07, count: 2, wall: 'działowa' },
    { id: 'd4', mark: 'D4', type: 'drzwi wewnętrzne', width: 1.1, height: 2.07, count: 1, wall: 'działowa' },
  ]
  p.partitions = { length: 30, height: null, heightAboveFloor: 2.8, topMargin: 0.02 }
  p.wallHeight = 2.922
  p.roof = { ...p.roof, pitchDeg: 35 }
  return p
}

const GABLES_35 = (2 * 9.48 * 9.48 / 4) * Math.tan((35 * Math.PI) / 180)

function byId(items: ItemSpec[], id: string): ItemSpec {
  const it = items.find((i) => i.id === id)
  if (!it) throw new Error(`brak pozycji ${id}; są: ${items.map((i) => i.id).join(', ')}`)
  return it
}

describe('openings — dobór nadproża', () => {
  it('najkrótsze z maks. otworem ≥ szerokość', () => {
    expect(selectLintel(1.0, DEFAULT_LINTEL_TABLE)?.length).toBe(1.25)
    expect(selectLintel(1.01, DEFAULT_LINTEL_TABLE)?.length).toBe(1.25)
    expect(selectLintel(1.02, DEFAULT_LINTEL_TABLE)?.length).toBe(1.5)
    expect(selectLintel(2.75, DEFAULT_LINTEL_TABLE)?.length).toBe(3)
    expect(selectLintel(2.8, DEFAULT_LINTEL_TABLE)).toBeNull()
  })
})

describe('SSZ — ściany nośne', () => {
  const p = example()
  const { items } = buildSSZ(p)

  it('bloczki H+H: wysokość nadproża domyślnie 24 cm (wg użytkownika), bez braków', () => {
    expect(byId(items, 'ssz-hh-bloczki').params.lintelHeight.value).toBe(0.24)
    expect(byId(items, 'ssz-hh-bloczki').missing).toEqual([])
  })

  it('poziomy: góra wieńca 2,70 + 0,012 + 0,06 + 0,15 = 2,922; 12 warstw; reszta 2,2 cm ≤ 4 cm → wieniec 27,2 cm', () => {
    const it = byId(items, 'ssz-ws-beton')
    const t = renderTrace(it.quantity!.trace)
    expect(t).toContain('2,922')
    expect(t).toContain('Liczba pełnych warstw')
  })

  it('reszta > 4 cm → warstwa docinana, wieniec 25 cm (wysokość ścian 2,972 m od posadzki)', () => {
    // góra wieńca 2,972; H = 3,202; n = ⌊2,952 / 0,24⌋ = 12; r = 3,202 − 2,88 − 0,25 = 0,072 > 0,04
    const q = buildSSZ({ ...p, wallHeight: 2.972 }).items
    const v = byId(q, 'ssz-ws-beton').quantity!.value
    expect(v).toBe(3) // 2,5776 + 5% = 2,70648 → 3 m³
  })

  it('bez warstw podłogi lub wymiarów bloczka → uzupełnij', () => {
    const q = buildSSZ(newProject()).items
    expect(byId(q, 'ssz-hh-bloczki').missing).toEqual(expect.arrayContaining(['wysokość ścian nośnych (posadzka → góra wieńca)', 'kąt nachylenia dachu (ściany szczytowe)', 'grubość izolacji na chudziaku', 'grubość wylewki', 'grubość wykończenia podłogi (płytka / panel)', 'długość bloczka', 'wysokość bloczka']))
    expect(byId(q, 'ssz-ws-beton').quantity).toBeNull()
  })

  it('bloczki z wymiarów 59 × 24: 1 / (0,59 × 0,24) = 7,0621 szt/m²; 42,96 × 2,88 + szczyty 31,464 − 13,8 − 2,82', () => {
    const q = buildSSZ({ ...p, itemParams: { 'ssz-hh-bloczki': { lintelHeight: 0.24 } } }).items
    const it = byId(q, 'ssz-hh-bloczki')
    expect(it.params.perM2.value).toBeCloseTo(7.062147, 6)
    const net = 107.1048 + GABLES_35
    expect(it.quantity?.value).toBeCloseTo(net * 7.062147, 4)
    const t = renderTrace(it.quantity!.trace)
    expect(t).toContain('123,725') // mur do wieńca
    expect(t).toContain('Ściany szczytowe główne')
    expect(t).toContain('Liczba pełnych warstw')
    expect(computeItem(it, null).quantityWithWaste).toBeCloseTo(net * 7.062147 * 1.03, 3)
  })

  it('ściany szczytowe: b = 9 + 2 × 0,24 = 9,48 m; 2 × 9,48² / 4 × tan 35° ≈ 31,464 m²; okno w szczycie odjęte z nadprożem', () => {
    expect(GABLES_35).toBeCloseTo(31.464, 3)
    const withWindow = { ...p, openings: [...p.openings, { id: 'o3', mark: 'O3', type: 'okno' as const, width: 0.9, height: 1.2, count: 1, wall: 'szczyt' as const }], itemParams: { 'ssz-hh-bloczki': { lintelHeight: 0.24 } } }
    const it = byId(buildSSZ(withWindow).items, 'ssz-hh-bloczki')
    // okno 0,9 × 1,2 = 1,08 m²; nadproże 1,25 m × 0,24 (2 szt. obok siebie liczone raz) = 0,3 m²
    expect(it.quantity?.value).toBeCloseTo((107.1048 + GABLES_35 - 1.08 - 0.3) * 7.062147, 4)
    expect(byId(buildSSZ(withWindow).items, 'ssz-nadproza-zew-125').quantity?.value).toBeGreaterThan(byId(buildSSZ(p).items, 'ssz-nadproza-zew-125').quantity?.value ?? 0)
  })

  it('bez kąta dachu → bloczki ścian nośnych „uzupełnij”', () => {
    const it = byId(buildSSZ({ ...p, roof: { ...p.roof, pitchDeg: null } }).items, 'ssz-hh-bloczki')
    expect(it.missing).toContain('kąt nachylenia dachu (ściany szczytowe)')
    expect(it.quantity).toBeNull()
  })

  it('nadproża zewn.: O1 1,5 → 2,0 m (4 × 2 = 8), O2 0,9 i D1 1,0 → 1,25 m (2 × 2 + 1 × 2 = 6)', () => {
    expect(byId(items, 'ssz-nadproza-zew-125').quantity?.value).toBe(6)
    expect(byId(items, 'ssz-nadproza-zew-200').quantity?.value).toBe(8)
  })

  it('parapety: (1,5 + 0,06) × 4 + (0,9 + 0,06) × 2 = 8,16 mb', () => {
    expect(byId(items, 'ssz-parapety-zew').quantity?.value).toBe(8.16)
  })
})

describe('SSZ — wieniec ścian', () => {
  const p = example()
  const { items } = buildSSZ(p)

  it('wieniec 27,2 cm: 42,96 × 0,24 × 0,272 = 2,804429 + 5% = 2,94465 → zamawiasz 3 m³, 1 kurs', () => {
    expect(byId(items, 'ssz-ws-beton').quantity?.value).toBe(3)
    expect(byId(items, 'ssz-ws-transport').quantity?.value).toBe(1)
  })

  it('stal: Ø12 38 prętów; strzemię 2·0,18 + 2·0,212 + 0,14 = 0,924 × 220 = 203,28 mb → 34 pręty Ø6', () => {
    expect(computeItem(byId(items, 'ssz-ws-stal12'), null).packs).toBe(38)
    expect(computeItem(byId(items, 'ssz-ws-stal6'), null).packs).toBe(34)
  })

  it('OSB: wymiar płyty przejęty z wieńca fund.; bez wyboru wariantu → uzupełnij; odzysk płyt zmniejsza zakup', () => {
    const withSheet = { ...p, itemParams: { 'sso-wf-osb': { sheetLength: 2.5, sheetWidth: 1.25 } } }
    const noChoice = byId(buildSSZ(withSheet).items, 'ssz-ws-osb')
    expect(noChoice.params.sheetLength.value).toBe(2.5)
    expect(noChoice.missing).toContain('wybór wariantu cięcia OSB (A lub B)')
    const chosen = { ...withSheet, choices: { ...p.choices, foundationRingBeamOsbVariant: 'A' as const, wallRingBeamOsbVariant: 'A' as const } }
    const full = byId(buildSSZ(chosen).items, 'ssz-ws-osb').quantity!.value
    const reused = byId(buildSSZ({ ...chosen, itemParams: { ...chosen.itemParams, 'ssz-ws-osb': { reuse: 1 } } }).items, 'ssz-ws-osb')
    expect(reused.quantity!.value).toBe(Math.max(0, full - 12))
    expect(renderTrace(reused.quantity!.trace)).toContain('Płyty z wieńca fundamentowego')
  })
})

describe('SSZ — ściany działowe i drzwi', () => {
  const p = example()
  const { items } = buildSSZ(p)

  it('działowe ponad stelaż GK: 2,70 + 0,012 + 0,06 + 0,02 = 2,792 od posadzki; mur 2,792 + 0,23 = 3,022 m', () => {
    const q = buildSSZ({ ...p, partitions: { ...p.partitions, heightAboveFloor: null }, itemParams: { 'ssz-dz-bloczki': { lintelHeight: 0.24 } } }).items
    expect(byId(q, 'ssz-dz-bloczki').quantity?.value).toBeCloseTo((30 * 3.022 - 11.178 - 1.86) * 7.062147, 4)
    const t = renderTrace(byId(q, 'ssz-dz-bloczki').quantity!.trace)
    expect(t).toContain('ponad górną krawędź profili GK')
    const r = buildSSZ({ ...p, partitions: { ...p.partitions, heightAboveFloor: null, topMargin: 0.01 }, itemParams: { 'ssz-dz-bloczki': { lintelHeight: 0.24 } } }).items
    expect(byId(r, 'ssz-dz-bloczki').quantity?.value).toBeCloseTo((30 * 3.012 - 11.178 - 1.86) * 7.062147, 4)
  })

  it('działowe ręcznie: 30 × (2,80 + 0,23) − 11,178 − 1,86 = 77,862 m² × 7,0621 (murowane do 2,80 od posadzki, start na chudziaku)', () => {
    const q = buildSSZ({ ...p, itemParams: { 'ssz-dz-bloczki': { lintelHeight: 0.24 } } }).items
    expect(byId(q, 'ssz-dz-bloczki').quantity?.value).toBeCloseTo(77.862 * 7.062147, 4)
    expect(renderTrace(byId(q, 'ssz-dz-bloczki').quantity!.trace)).toContain('Wysokość muru ścian działowych')
    const r = buildSSZ({ ...p, partitions: { ...p.partitions, heightAboveFloor: 2.7 }, itemParams: { 'ssz-dz-bloczki': { lintelHeight: 0.24 } } }).items
    expect(byId(r, 'ssz-dz-bloczki').quantity?.value).toBeCloseTo(74.862 * 7.062147, 4)
  })

  it('nadproża działowe (1 na otwór): 1,25 m × 5, 1,5 m × 1', () => {
    expect(byId(items, 'ssz-nadproza-dz-125').quantity?.value).toBe(5)
    expect(byId(items, 'ssz-nadproza-dz-150').quantity?.value).toBe(1)
  })

  it('drzwi: otwór 90 → Drzwi 80 × 3, otwór 80 → Drzwi 70 × 2; otwór 110 — brak mapowania', () => {
    expect(byId(items, 'ssz-drzwi-80').quantity?.value).toBe(3)
    expect(byId(items, 'ssz-oscieznica-80').quantity?.value).toBe(3)
    expect(byId(items, 'ssz-drzwi-70').quantity?.value).toBe(2)
    expect(byId(items, 'ssz-drzwi-niezmapowane').missing[0]).toContain('D4')
  })

  it('brak długości działowych → uzupełnij', () => {
    const q = buildSSZ({ ...p, partitions: { length: null, height: null, heightAboveFloor: 2.8, topMargin: 0.02 } }).items
    expect(byId(q, 'ssz-dz-bloczki').missing).toContain('długość ścian działowych (mb)')
  })

  it('etap SSZ i unikalne id', () => {
    expect(items.every((i) => i.stage === 'SSZ')).toBe(true)
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length)
  })
})
