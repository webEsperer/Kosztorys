import { describe, expect, it } from 'vitest'
import { newProject, type ProjectInput } from '../../src/model/project'
import { buildAllItems, computeEstimate } from '../../src/engine/estimate'
import { buildSD } from '../../src/engine/stages/sd'
import { buildGeneral } from '../../src/engine/stages/general'

function example(): ProjectInput {
  const p = newProject('Przykład')
  p.partitions = { length: 30, height: null }
  p.openings = [
    { id: 'o1', mark: 'O1', type: 'okno', width: 1.5, height: 1.5, count: 4, wall: 'zewnętrzna' },
    { id: 'd1', mark: 'D1', type: 'drzwi zewnętrzne', width: 1.0, height: 2.1, count: 1, wall: 'zewnętrzna' },
    { id: 'd2', mark: 'D2', type: 'drzwi wewnętrzne', width: 0.9, height: 2.07, count: 3, wall: 'działowa' },
  ]
  return p
}

describe('SD', () => {
  const items = buildSD(example()).items
  const get = (id: string) => items.find((i) => i.id === id)!

  it('tynki: 42 × 2,7 − 11,1 + 2 × 30 × 2,7 − 2 × 5,589 = 253,122 m²', () => {
    expect(get('sd-tynki').quantity?.value).toBe(253.122)
  })
  it('wylewka i gładź sufitu = A_wew = 108 m²; wylewka 6,5 cm = 7,02 m³ informacyjnie', () => {
    expect(get('sd-wylewka').quantity?.value).toBe(108)
    expect(get('sd-wylewka').quantity?.trace.at(-1)?.result).toBe(7.02)
    expect(get('sd-gladz-sufit').quantity?.value).toBe(108)
  })
  it('parapety wewnętrzne: 1,5 × 4 = 6 mb', () => {
    expect(get('sd-parapety-wew').quantity?.value).toBe(6)
  })
})

describe('Koszty ogólne', () => {
  it('ryczałty; fotowoltaika domyślnie wyłączona', () => {
    const items = buildGeneral(newProject()).items
    expect(items.every((i) => i.stage === 'OGOLNE')).toBe(true)
    expect(items.find((i) => i.id === 'og-fotowoltaika')?.enabled).toBe(false)
    expect(items.find((i) => i.id === 'og-kierownik')?.priceBasis).toBe('lumpSum')
  })
})

describe('Kosztorys całości', () => {
  it('unikalne id pozycji we wszystkich etapach', () => {
    const all = buildAllItems(example())
    expect(new Set(all.map((i) => i.id)).size).toBe(all.length)
  })

  it('sumy etapów, rezerwa 10%, udziały i koszt na m²', () => {
    const p = example()
    p.prices = { 'og-kierownik': 500000, 'sd-wylewka': 5000, 'sso-kanalizacja': 800000 }
    const e = computeEstimate(p)
    const st = Object.fromEntries(e.stages.map((s) => [s.stage, s.totalGrosze]))
    expect(st.OGOLNE).toBe(500000)
    expect(st.SD).toBe(540000) // 108 m² × 50 zł
    expect(st.SSO).toBe(800000)
    expect(e.subtotalGrosze).toBe(1840000)
    expect(e.reserveGrosze).toBe(184000)
    expect(e.totalGrosze).toBe(2024000)
    expect(e.perM2Grosze).toBe(Math.round(2024000 / 108))
    expect(e.shares.SSO).toBeCloseTo((800000 / 1840000) * 100, 6)
    expect(e.complete).toBe(false)
    expect(e.todo.some((t) => t.itemId === 'og-geotechnika' && t.missing.includes('kwota'))).toBe(true)
  })

  it('przeniesienie pozycji do innego etapu (drzwi wewnętrzne → SD)', () => {
    const p = example()
    p.stageOverride = { 'ssz-drzwi-80': 'SD' }
    p.prices = { 'ssz-drzwi-80': 60000 }
    const e = computeEstimate(p)
    const d = e.items.find((r) => r.spec.id === 'ssz-drzwi-80')!
    expect(d.spec.stage).toBe('SD')
    expect(e.stages.find((s) => s.stage === 'SD')!.totalGrosze).toBe(180000)
    expect(e.stages.find((s) => s.stage === 'SD')!.byKind.material).toBe(180000)
  })

  it('pozycja wyłączona nie trafia do „do uzupełnienia”', () => {
    const p = example()
    const before = computeEstimate(p).todo.some((t) => t.itemId === 'og-ogrodzenie')
    p.enabled = { 'og-ogrodzenie': false }
    expect(before).toBe(true)
    expect(computeEstimate(p).todo.some((t) => t.itemId === 'og-ogrodzenie')).toBe(false)
  })
})
