import { describe, expect, it } from 'vitest'
import { newProject, type ProjectInput } from '../../src/model/project'
import { buildSSO } from '../../src/engine/stages/sso'
import { computeItem, sumItems, type ItemSpec } from '../../src/engine/items'
import { renderTrace } from '../../src/engine/trace'

// Przykład referencyjny 12 × 9 m, ściana 0,24 (P_oś = 42,96, A_wew = 108).
// Dane PRZYKŁADOWE fundamentu: bloczek 38 × 24 × 12 cm, spoina 1 cm, 5 warstw, ława 60 × 40.
function example(): ProjectInput {
  const p = newProject('Przykład 12 × 9')
  p.floorLayers = { insulation: 0.15, screed: 0.065, finish: 0.015 }
  p.wall = { ...p.wall, blockLength: 0.59, blockHeight: 0.24 }
  p.partitionBlock = { blockLength: 0.59, blockHeight: 0.24, jointThickness: 0 }
  p.foundation = { ...p.foundation, blockLength: 0.38, blockWidth: 0.24, blockHeight: 0.12, jointThickness: 0.01, layers: 5, footingWidth: 0.6, footingHeight: 0.4 }
  return p
}

function byId(items: ItemSpec[], id: string): ItemSpec {
  const it = items.find((i) => i.id === id)
  if (!it) throw new Error(`brak pozycji ${id}`)
  return it
}

describe('SSO — nowy projekt bez danych fundamentu', () => {
  const { items } = buildSSO(newProject())

  it('pozycje zależne od fundamentu mają braki, a nie zmyślone wartości', () => {
    expect(byId(items, 'sso-lawy-beton').quantity).toBeNull()
    expect(byId(items, 'sso-lawy-beton').missing).toContain('szerokość ławy')
    expect(byId(items, 'sso-sf-bloczki').missing).toContain('długość bloczka fundamentowego')
  })

  it('chudziak liczy się od razu: 108 × 0,10 = 10,8 → 11,124 m³, 2 kursy', () => {
    expect(byId(items, 'sso-chudziak-beton').quantity?.value).toBe(11.124)
    expect(byId(items, 'sso-chudziak-transport').quantity?.value).toBe(2)
  })

  it('wszystkie pozycje mają etap SSO i unikalne id', () => {
    expect(items.every((i) => i.stage === 'SSO')).toBe(true)
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length)
  })
})

describe('SSO — przykład z danymi fundamentu', () => {
  const p = example()
  const { items, context } = buildSSO(p)

  it('poziomy: h_ściany fund. = 5 × 0,13 + 0,25 = 0,90; dno wykopu −1,25', () => {
    expect(context.levels?.foundation.value.wallHeight).toBe(0.9)
    expect(context.levels?.foundation.value.excavationBottom).toBe(-1.25)
  })

  it('ławy: beton 10,619712 m³, 2 kursy; pompa wyłączona', () => {
    expect(byId(items, 'sso-lawy-beton').quantity?.value).toBe(10.619712)
    expect(byId(items, 'sso-lawy-transport').quantity?.value).toBe(2)
    expect(byId(items, 'sso-lawy-pompa').enabled).toBe(false)
  })

  it('deski: szer. null → uzupełnij; po podaniu 15 cm: 1 rząd × ⌈85,92 / 4⌉ = 22 szt', () => {
    expect(byId(items, 'sso-lawy-deski').missing).toContain('Szerokość deski')
    const q = buildSSO({ ...p, itemParams: { 'sso-lawy-deski': { boardWidth: 0.15 } } }).items
    const d = byId(q, 'sso-lawy-deski')
    expect(d.quantity?.value).toBe(22)
    expect(renderTrace(d.quantity!.trace)).toContain('0,33 m³') // 22 × 4 × 0,15 × 0,025
  })

  it('paliki co 1 m: ⌈85,92⌉ = 86', () => {
    expect(byId(items, 'sso-lawy-paliki').quantity?.value).toBe(86)
  })

  it('stal ław Ø12: 224,64 mb × 0,888 = 199,48 kg → 38 prętów 6 m; Ø6: 382,8 mb → 64 pręty', () => {
    const s12 = computeItem(byId(items, 'sso-lawy-stal12'), 450)
    expect(s12.spec.quantity?.value).toBe(199.48032)
    expect(s12.packs).toBe(38)
    expect(s12.chargedQuantity).toBe(202.464) // 38 × 5,328 kg — płaci się za pełne pręty
    expect(s12.costGrosze).toBe(91109)
    expect(computeItem(byId(items, 'sso-lawy-stal6'), 500).packs).toBe(64)
  })

  it('bloczki: 5 × ⌈42,96 / 0,39⌉ = 5 × 111 = 555, +3% → 571,65 → do zapłaty 572 szt', () => {
    const r = computeItem(byId(items, 'sso-sf-bloczki'), 600)
    expect(r.spec.quantity?.value).toBe(555)
    expect(r.quantityWithWaste).toBe(571.65)
    expect(r.chargedQuantity).toBe(572)
    expect(r.costGrosze).toBe(572 * 600)
  })

  it('hydroizolacja: pow. 2 × 42,96 × 0,90 = 77,328 m² (zużycia null → uzupełnij)', () => {
    const it = byId(items, 'sso-sf-hydro')
    expect(it.quantity).toBeNull()
    expect(it.missing).toEqual(expect.arrayContaining(['Liczba warstw hydroizolacji', 'Zużycie na warstwę', 'Wielkość wiadra']))
    const q = buildSSO({ ...p, itemParams: { 'sso-sf-hydro': { layers: 2, kgPerM2: 1, bucket: 20 } } }).items
    const r = computeItem(byId(q, 'sso-sf-hydro'), 10000)
    expect(r.spec.quantity?.value).toBe(154.656)
    expect(r.packs).toBe(8) // ⌈154,656 / 20⌉
  })

  it('XPS: obwód 42,96 + 4·0,24 + 4·0,10 = 44,32 m × 0,87 m = 38,5584 m²', () => {
    expect(byId(items, 'sso-sf-xps').quantity?.value).toBe(38.5584)
  })

  it('wieniec fund.: beton 2,5776 × 1,03 = 2,654928 m³; 1 kurs; stal Ø12 38 prętów, Ø6 33', () => {
    expect(byId(items, 'sso-wf-beton').quantity?.value).toBe(2.654928)
    expect(byId(items, 'sso-wf-transport').quantity?.value).toBe(1)
    expect(computeItem(byId(items, 'sso-wf-stal12'), null).packs).toBe(38)
    expect(computeItem(byId(items, 'sso-wf-stal6'), null).packs).toBe(33)
  })

  it('OSB: bez wymiaru płyty i wyboru wariantu → uzupełnij; po podaniu i wyborze B → 10 płyt', () => {
    expect(byId(items, 'sso-wf-osb').missing).toContain('Płyta OSB — długość (kupowana)')
    const withSheet = { ...p, itemParams: { 'sso-wf-osb': { sheetLength: 2.5, sheetWidth: 1.25 } } }
    const noChoice = byId(buildSSO(withSheet).items, 'sso-wf-osb')
    expect(noChoice.missing).toContain('wybór wariantu cięcia OSB (A lub B)')
    expect(noChoice.note).toContain('Wariant B jest tańszy')
    const chosenB = byId(buildSSO({ ...withSheet, choices: { ...p.choices, foundationRingBeamOsbVariant: 'B' } }).items, 'sso-wf-osb')
    expect(chosenB.quantity?.value).toBe(10)
    const chosenA = byId(buildSSO({ ...withSheet, choices: { ...p.choices, foundationRingBeamOsbVariant: 'A' } }).items, 'sso-wf-osb')
    expect(chosenA.quantity?.value).toBe(12)
  })

  it('zasypka: (−0,33 − (−1,25)) = 0,92 m; 108 × 0,92 × 1,2 = 119,232 m³', () => {
    expect(byId(items, 'sso-zasypka').quantity?.value).toBe(119.232)
  })

  it('papa pod bloczki: rolka 1 × 10 m, pas 40 cm, zakład 30 cm → najmniej rolek', () => {
    const q = buildSSO({ ...p, itemParams: { 'sso-sf-papa': { stripWidth: 0.4, rollWidth: 1, rollLength: 10 } } }).items
    const papa = byId(q, 'sso-sf-papa')
    expect(papa.quantity?.value).toBeGreaterThanOrEqual(2)
    expect(renderTrace(papa.quantity!.trace)).toContain('Wybrany wariant')
    // plan cięcia dołączony do pozycji; domyślnie wariant z mniejszą liczbą rolek
    const c = papa.cutting!
    expect(c.used).toBe(c.result.best.key)
    expect(c.userMustChoose).toBe(false)
    expect(papa.quantity!.value).toBe(c.result.best.sheets)
  })

  it('papa pod bloczki: użytkownik zmienia wariant → ilość z wybranego wariantu, krok w trace', () => {
    const base = { ...p, itemParams: { 'sso-sf-papa': { stripWidth: 0.4, rollWidth: 1, rollLength: 10 } } }
    const best = byId(buildSSO(base).items, 'sso-sf-papa').cutting!.result.best.key
    const other = best === 'A' ? 'B' : 'A'
    const papa = byId(buildSSO({ ...base, choices: { ...base.choices, foundationFeltVariant: other } }).items, 'sso-sf-papa')
    expect(papa.cutting!.used).toBe(other)
    expect(papa.quantity!.value).toBe(papa.cutting!.result[other]!.sheets)
    expect(renderTrace(papa.quantity!.trace)).toContain('Wariant zmieniony przez użytkownika')
  })

  it('suma: pozycje bez ceny → niepełna; ryczałt z kwotą liczy się', () => {
    const results = items.map((i) => computeItem(i, i.id === 'sso-kanalizacja' ? 800000 : null))
    const s = sumItems(results)
    expect(s.complete).toBe(false)
    expect(s.totalGrosze).toBe(800000)
  })
})
