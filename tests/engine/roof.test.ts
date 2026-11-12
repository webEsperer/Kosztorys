import { describe, expect, it } from 'vitest'
import { computeDormer, computeRoof, trussCount, type Dormer, type RoofInput } from '../../src/engine/roof'

// Przykład referencyjny: 12 × 9 m wew., ściana 0,24, EPS 0,20 → L_z = 12,88, B_z = 9,88; α = 35°, okapy 0,60.
const BASE: RoofInput = { outerLength: 12.88, outerWidth: 9.88, ridgeAlongLonger: true, pitchDeg: 35, eaveOverhang: 0.6, gableOverhang: 0.6, dormers: [] }
const cos35 = Math.cos((35 * Math.PI) / 180)

const DORMER: Dormer = { id: 'D1', b: 4, w: 2, betaDeg: 45, dh: 0, side: 'przód', position: 4, gableFinish: 'EPS' }

describe('roof — dach główny', () => {
  const r = computeRoof(BASE)

  it('s = (9,88/2 + 0,6) / cos 35° = 5,54 / 0,81915 = 6,7631 m', () => {
    expect(r.slope).toBeCloseTo(5.54 / cos35, 6)
  })

  it('R = 12,88 + 2 × 0,6 = 14,08 m; A = 2 × s × R ≈ 190,45 m²', () => {
    expect(r.ridgeLength).toBe(14.08)
    expect(r.mainArea).toBeCloseTo((2 * 5.54 * 14.08) / cos35, 5)
    expect(r.totalArea).toBeCloseTo(190.45, 2)
  })

  it('okapy 2R = 28,16; wiatrownice 4s; kalenica R', () => {
    expect(r.eavesLength).toBe(28.16)
    expect(r.vergesLength).toBeCloseTo(4 * r.slope, 5)
    expect(r.ridgesLength).toBe(14.08)
  })

  it('kalenica wzdłuż krótszego boku zamienia L i B', () => {
    const k = computeRoof({ ...BASE, ridgeAlongLonger: false })
    expect(k.span).toBe(12.88)
    expect(k.ridgeLength).toBe(9.88 + 1.2)
  })

  it('wiązary co 90 cm: ⌈12,88 / 0,9⌉ + 1 = 16', () => {
    expect(trussCount(12.88, 0.9).value).toBe(16)
  })
})

describe('roof — daszek z koszami (test z CLAUDE.md)', () => {
  it('b = 4, w = 2, α = 35°, β = 45°, Δh = 0: d ≈ 2,86, T ≈ 5,71, daszek ≈ 19,4, kosz ≈ 4,0', () => {
    const d = computeDormer(35, DORMER)
    expect(d.x0).toBe(0)
    expect(d.d).toBeCloseTo(2.856, 3)
    expect(d.T).toBeCloseTo(5.713, 3)
    expect(d.area).toBeCloseTo(19.39, 2)
    expect(d.valley).toBeCloseTo(4.02, 2)
    expect(d.ridge).toBeCloseTo(4.856, 3)
    expect(d.eaves).toBe(4)
    expect(d.verges).toBeCloseTo(4 / Math.cos(Math.PI / 4), 5)
  })

  it('ubytek połaci głównej = T / cos α ≈ 7,0 m²', () => {
    const r0 = computeRoof(BASE)
    const r1 = computeRoof({ ...BASE, dormers: [DORMER] })
    expect(r0.mainArea - r1.mainArea).toBeCloseTo(5.713 / cos35, 2)
    expect(r0.mainArea - r1.mainArea).toBeCloseTo(6.97, 1)
  })

  it('β = α = 35°: przyrost dachu = b · w / cos α = 8 / cos 35° ≈ 9,77 m²', () => {
    const r0 = computeRoof(BASE)
    const r1 = computeRoof({ ...BASE, dormers: [{ ...DORMER, betaDeg: 35 }] })
    expect(r1.totalArea - r0.totalArea).toBeCloseTo(8 / cos35, 5)
    expect(r1.totalArea - r0.totalArea).toBeCloseTo(9.77, 2)
  })

  it('okap główny skracany o b, dochodzą okapy daszku 2 × (w + x0)', () => {
    const r1 = computeRoof({ ...BASE, dormers: [DORMER] })
    expect(r1.eavesLength).toBe(28.16 - 4 + 4)
    expect(r1.valleysLength).toBeCloseTo(2 * 4.02, 1)
  })

  it('Δh > 0: x0 = Δh / tan α, kosze z odcinkami x0', () => {
    const d = computeDormer(35, { ...DORMER, dh: 0.5 })
    expect(d.x0).toBeCloseTo(0.5 / Math.tan((35 * Math.PI) / 180), 6)
    expect(d.valleysTotal).toBeCloseTo(2 * (d.valley + d.x0), 6)
    expect(d.T).toBeCloseTo(4 * d.x0 + (4 * d.d) / 2, 6)
  })

  it('Δh < 0: nie liczymy — daszek do ręcznego podania', () => {
    const r = computeRoof({ ...BASE, dormers: [{ ...DORMER, dh: -0.3 }] })
    expect(r.manualDormers).toEqual(['D1'])
    expect(r.dormers).toHaveLength(0)
  })

  it('trójkąt szczytu daszku: b_ściany² / 4 · tan β', () => {
    expect(computeDormer(35, { ...DORMER, wallWidth: 3 }).gableArea).toBeCloseTo((9 / 4) * 1, 6)
  })
})
