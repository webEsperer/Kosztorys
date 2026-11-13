import { describe, expect, it } from 'vitest'
import { newProject, type ProjectInput } from '../../src/model/project'
import { buildSSZ } from '../../src/engine/stages/ssz'
import { computeItem, type ItemSpec } from '../../src/engine/items'

// Przykład 12 × 9 m, ściana 0,24, EPS 0,20, α = 35°, okapy 0,60 → s = 6,7631, R = 14,08, A ≈ 190,45 m².
function example(): ProjectInput {
  const p = newProject('Przykład')
  p.roof = { ...p.roof, pitchDeg: 35, eaveOverhang: 0.6, gableOverhang: 0.6 }
  // ilości łat i kontrłat sprawdzane w mb (domyślnie za m³ netto — test w timber.test.ts)
  p.timberBilling = { 'ssz-laty': false, 'ssz-kontrlaty': false }
  return p
}
const byId = (items: ItemSpec[], id: string): ItemSpec => {
  const it = items.find((i) => i.id === id)
  if (!it) throw new Error(`brak ${id}`)
  return it
}

describe('SSZ dach — bez kąta i okapów', () => {
  it('pozycje dachu czekają na dane', () => {
    const items = buildSSZ(newProject()).items
    expect(byId(items, 'ssz-membrana').missing).toEqual(expect.arrayContaining(['kąt nachylenia dachu', 'okap boczny', 'okap szczytowy']))
  })
})

describe('SSZ dach — przykład', () => {
  const p = example()
  const items = buildSSZ(p).items

  it('membrana: 190,45 m² × 1,10 / 75 m² → 3 rolki', () => {
    const q = buildSSZ({ ...p, itemParams: { 'ssz-membrana': { m2PerRoll: 75 } } }).items
    const r = computeItem(byId(q, 'ssz-membrana'), 30000)
    expect(r.spec.quantity?.value).toBeCloseTo(190.45, 2)
    expect(r.packs).toBe(3)
  })

  it('kontrłaty: 2 × 16 wiązarów × 6,7631 = 216,42 mb', () => {
    expect(byId(items, 'ssz-kontrlaty').quantity?.value).toBeCloseTo(216.42, 2)
  })

  it('łaty co 33 cm: (⌈20,49⌉ + 1 = 22 rzędy) × 2 × 14,08 = 619,52 mb', () => {
    expect(byId(items, 'ssz-laty').missing).toContain('Rozstaw łat')
    const q = buildSSZ({ ...p, itemParams: { 'ssz-laty': { spacing: 0.33 } } }).items
    expect(byId(q, 'ssz-laty').quantity?.value).toBe(619.52)
  })

  it('okapy 28,16 mb: rynny, pasy, grzebień, deski czołowe; haki ⌈46,93⌉ + 2 = 49', () => {
    for (const id of ['ssz-rynny', 'ssz-pas-nadrynnowy', 'ssz-pas-podrynnowy', 'ssz-grzebien', 'ssz-deski-czolowe']) {
      expect(byId(items, id).quantity?.value).toBe(28.16)
    }
    expect(byId(items, 'ssz-haki').quantity?.value).toBe(49)
  })

  it('gąsiory 2,5 szt/mb: ⌈14,08 × 2,5⌉ = 36; początkowy 1, końcowy 1', () => {
    const q = buildSSZ({ ...p, itemParams: { 'ssz-gasiory': { perMb: 2.5 } } }).items
    expect(byId(q, 'ssz-gasiory').quantity?.value).toBe(36)
    expect(byId(items, 'ssz-gasior-poczatkowy').quantity?.value).toBe(1)
  })

  it('struktonit: deska 20 cm, na styk → 1 rząd, 3,33 szt/mb × 28,16 mb = 93,87 → +10% = 104 szt; wkręty 208', () => {
    const q = buildSSZ({ ...p, itemParams: { 'ssz-struktonit': { boardH: 0.2, sideOverlap: 0, topOverlap: 0 } } }).items
    const s = computeItem(byId(q, 'ssz-struktonit'), null)
    expect(s.spec.quantity?.value).toBeCloseTo(93.8667, 3)
    expect(Math.ceil(s.quantityWithWaste!)).toBe(104)
    expect(byId(q, 'ssz-struktonit-wkrety').quantity?.value).toBe(208)
  })

  it('daszek b = 4, w = 2, β = 45°: kosze ≈ 8,04 mb, odpad dachówki 12%, okapy bez zmian (−4 + 4)', () => {
    const q = buildSSZ({
      ...p,
      roof: { ...p.roof, dormers: [{ id: 'D1', b: 4, w: 2, betaDeg: 45, dh: 0, side: 'przód', position: 4, gableFinish: 'EPS' }] },
    }).items
    expect(byId(q, 'ssz-blacha-koszowa').quantity?.value).toBeCloseTo(8.04, 1)
    expect(byId(q, 'ssz-dachowka').wastePercent).toBe(12)
    expect(byId(q, 'ssz-rynny').quantity?.value).toBe(28.16)
    expect(byId(q, 'ssz-daszki-konstrukcja').enabled).toBe(true)
    expect(byId(q, 'ssz-gasior-poczatkowy').quantity?.value).toBe(2)
  })
})
