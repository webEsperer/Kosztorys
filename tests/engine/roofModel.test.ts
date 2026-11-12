import { describe, expect, it } from 'vitest'
import { computeRoof, type Dormer, type RoofInput } from '../../src/engine/roof'
import { buildRoofModel, polygonArea } from '../../src/engine/roofModel'

const BASE: RoofInput = { outerLength: 12.88, outerWidth: 9.88, ridgeAlongLonger: true, pitchDeg: 35, eaveOverhang: 0.6, gableOverhang: 0.6, dormers: [] }
const D1: Dormer = { id: 'D1', b: 4, w: 2, betaDeg: 45, dh: 0, side: 'przód', position: 4, gableFinish: 'EPS' }

describe('roofModel — zgodność rysunku z kosztorysem', () => {
  it('pole wielokąta (Newell): prostokąt 2 × 2√2 nachylony pod 45° = 4√2', () => {
    expect(polygonArea([[0, 0, 0], [2, 0, 0], [2, 2, 2], [0, 2, 2]])).toBeCloseTo(2 * Math.hypot(2, 2), 6)
  })

  it('bez daszków: P1 + P2 = powierzchnia dachu z roof.ts; kalenica = R', () => {
    const r = computeRoof(BASE)
    const m = buildRoofModel(BASE, r)
    const main = m.faces.filter((f) => f.kind === 'main')
    expect(main).toHaveLength(2)
    expect(main[0].area + main[1].area).toBeCloseTo(r.totalArea, 5)
    expect(m.edges.find((e) => e.kind === 'ridge')!.length).toBe(14.08)
  })

  it('z daszkiem (b = 4, w = 2, β = 45°): połacie główne i daszek = wartości z kosztorysu; 2 kosze po 4,02 m', () => {
    const i = { ...BASE, dormers: [D1] }
    const r = computeRoof(i)
    const m = buildRoofModel(i, r)
    const main = m.faces.filter((f) => f.kind === 'main').reduce((a, f) => a + f.area, 0)
    const dorm = m.faces.filter((f) => f.kind === 'dormer').reduce((a, f) => a + f.area, 0)
    expect(main).toBeCloseTo(r.mainArea, 4)
    expect(dorm).toBeCloseTo(r.dormers[0].area, 4)
    const valleys = m.edges.filter((e) => e.kind === 'valley')
    expect(valleys.map((v) => v.label)).toEqual(['K1', 'K2'])
    valleys.forEach((v) => expect(v.length).toBeCloseTo(r.dormers[0].valley, 6))
    const eaves = m.edges.filter((e) => e.kind === 'eave').reduce((a, e) => a + e.length, 0)
    expect(eaves).toBeCloseTo(r.eavesLength, 6)
  })

  it('daszek z tyłu i Δh > 0 — zgodność powierzchni', () => {
    const i = { ...BASE, dormers: [{ ...D1, side: 'tył' as const, dh: 0.4 }] }
    const r = computeRoof(i)
    const m = buildRoofModel(i, r)
    const dorm = m.faces.filter((f) => f.kind === 'dormer').reduce((a, f) => a + f.area, 0)
    const main = m.faces.filter((f) => f.kind === 'main').reduce((a, f) => a + f.area, 0)
    expect(dorm).toBeCloseTo(r.dormers[0].area, 4)
    expect(main).toBeCloseTo(r.mainArea, 4)
    expect(m.faces.find((f) => f.id === 'D1-l')!.points.every((p) => p[1] > m.depth / 2)).toBe(true) // daszek po stronie tylnej
  })
})
