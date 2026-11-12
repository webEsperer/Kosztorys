import { describe, expect, it } from 'vitest'
import { computeRebarElement, defaultFootingRebar, defaultRingBeamRebar } from '../../src/engine/rebar'
import { barInset, layoutRebarPlan, loopPolyline, pointOnLoop, type AxisRect } from '../../src/engine/rebarLayout'
import { buildFoundationSection } from '../../src/engine/foundationSection'
import { computeLevels, DEFAULT_LEVELS } from '../../src/engine/levels'

// Prostokąt osi ścian: 12,24 × 9,24 m (12 × 9 wewnątrz + ściana 0,24) → obwód 42,96 m.
const AXIS: AxisRect = { length: 12.24, width: 9.24 }
const P_OS = 42.96

function pathLength(pts: { x: number; y: number }[]): number {
  let s = 0
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
  return s
}

describe('rebarLayout — obwód', () => {
  it('narożniki zgodnie z ruchem wskazówek zegara od lewego dolnego', () => {
    expect(pointOnLoop(AXIS, 0)).toEqual({ x: 0, y: 0 })
    expect(pointOnLoop(AXIS, 9.24)).toEqual({ x: 0, y: 9.24 })
    expect(pointOnLoop(AXIS, 21.48)).toEqual({ x: 12.24, y: 9.24 })
    expect(pointOnLoop(AXIS, 30.72)).toEqual({ x: 12.24, y: 0 })
    expect(pointOnLoop(AXIS, P_OS + 1)).toEqual({ x: 0, y: 1 })
  })

  it('odsunięcie na zewnątrz na lewym boku: x = −offset', () => {
    expect(pointOnLoop(AXIS, 4, 0.2)).toEqual({ x: -0.2, y: 4 })
  })

  it('łamana przez narożnik zawiera narożnik; długość w osi = s1 − s0', () => {
    const pts = loopPolyline(AXIS, 8, 11)
    expect(pts).toContainEqual({ x: 0, y: 9.24 })
    expect(pathLength(pts)).toBeCloseTo(3, 9)
  })

  it('łamana przez początek obwodu (zawinięcie)', () => {
    const pts = loopPolyline(AXIS, P_OS - 1, P_OS + 1)
    expect(pts).toContainEqual({ x: 0, y: 0 })
    expect(pathLength(pts)).toBeCloseTo(2, 9)
  })
})

describe('rebarLayout — ławy: rozłożenie zgodne z obliczeniem', () => {
  const p = defaultFootingRebar(0.6, 0.4)
  const res = computeRebarElement('Ławy', P_OS, p)
  const lay = layoutRebarPlan(AXIS, p, res)

  it('4 linie × 8 prętów = 32 = liczba z kosztorysu', () => {
    expect(lay.lines).toHaveLength(4)
    expect(lay.lines.reduce((s, l) => s + l.bars.length, 0)).toBe(res.longitudinalBars)
  })

  it('w każdej linii 7 prętów po 6 m i ostatni docięty: 42,96 + 0,6 − 7 × 5,4 = 5,76 m', () => {
    for (const l of lay.lines) {
      expect(l.bars.slice(0, 7).every((b) => b.length === 6 && !b.isCut)).toBe(true)
      expect(l.bars[7].length).toBe(5.76)
      expect(l.bars[7].isCut).toBe(true)
      expect(l.laps).toHaveLength(8)
    }
  })

  it('długość wbudowana z rozłożenia = metry wbudowane z kosztorysu (bez narożnych)', () => {
    const laid = lay.lines.reduce((s, l) => s + l.bars.reduce((a, b) => a + b.length, 0), 0)
    expect(laid).toBeCloseTo(4 * (P_OS + 8 * 0.6), 9) // 191,04 m
  })

  it('linie: dolne/górne, zewnętrzne/wewnętrzne, odsunięte o b/2 − (c + ½Ø6 + ½Ø12) = 0,241 m', () => {
    expect(barInset(p)).toBe(0.059)
    expect(lay.lines.map((l) => [l.level, l.side, l.offset])).toEqual([
      ['dolny', 'zewnętrzny', 0.241],
      ['dolny', 'wewnętrzny', -0.241],
      ['górny', 'zewnętrzny', 0.241],
      ['górny', 'wewnętrzny', -0.241],
    ])
  })

  it('zakłady linii przesunięte o krok/4 = 1,35 m', () => {
    expect(lay.lines.map((l) => l.start)).toEqual([0, 1.35, 2.7, 4.05])
  })

  it('16 prętów narożnych, strzemiona: 144 rozłożone + 1 zapas wg wzoru', () => {
    expect(lay.cornerBars).toHaveLength(res.cornerPieces)
    expect(lay.stirrups).toHaveLength(144)
    expect(lay.stirrupSpare).toBe(1)
    expect(lay.stirrupActualSpacing).toBeCloseTo(0.298333, 6)
  })

  it('odrzuca prostokąt niezgodny z długością linii', () => {
    expect(() => layoutRebarPlan({ length: 12, width: 9 }, p, res)).toThrow()
  })
})

describe('foundationSection — przekrój', () => {
  const lv = computeLevels({
    ...DEFAULT_LEVELS,
    foundation: { ...DEFAULT_LEVELS.foundation, blockHeight: 0.12, jointThickness: 0.01, layers: 5, footingHeight: 0.4 },
  })
  const s = buildFoundationSection({
    wallThickness: 0.24,
    facadeInsulation: 0.2,
    foundationInsulation: 0.1,
    foundationWallThickness: 0.24,
    blockHeight: 0.12,
    jointThickness: 0.01,
    layers: 5,
    footingWidth: 0.6,
    footingHeight: 0.4,
    ringBeamWidth: 0.24,
    ringBeamHeight: 0.25,
    slabThickness: 0.1,
    floorLayers: DEFAULT_LEVELS.floorLayers,
    slabTop: lv.slabTop.value,
    foundation: lv.foundation.value,
    footingRebar: defaultFootingRebar(0.6, 0.4),
    ringBeamRebar: defaultRingBeamRebar(0.24, 0.25),
    xpsTopGap: 0.03,
  })

  it('rzędne: góra ławy −1,13, spód −1,53, wieniec −0,48…−0,23', () => {
    const lawa = s.rects.find((r) => r.id === 'lawa')!
    expect([lawa.z0, lawa.z1]).toEqual([-1.53, -1.13])
    const w = s.rects.find((r) => r.id === 'wieniec')!
    expect([w.z0, w.z1]).toEqual([-0.48, -0.23])
    expect(s.rects.filter((r) => r.material === 'bloczek')).toHaveLength(5)
  })

  it('pręty ławy: dolne na −1,53 + 0,059, górne na −1,13 − 0,059', () => {
    const lawa = s.bars.filter((b) => b.element === 'lawa')
    expect(lawa).toHaveLength(4)
    expect(lawa.map((b) => [b.x, b.z])).toEqual([
      [-0.241, -1.471],
      [0.241, -1.471],
      [-0.241, -1.189],
      [0.241, -1.189],
    ])
  })

  it('zasypka nie nachodzi na ławę: obok ławy od dna wykopu −1,25 do góry ławy −1,13', () => {
    const dol = s.rects.find((r) => r.id === 'piasek-dol')!
    expect([dol.x0, dol.z0, dol.z1]).toEqual([0.3, -1.25, -1.13])
    const gora = s.rects.find((r) => r.id === 'piasek-gora')!
    expect([gora.x0, gora.z0, gora.z1]).toEqual([0.12, -1.13, -0.33])
  })

  it('XPS od góry ławy do 3 cm poniżej góry wieńca', () => {
    const x = s.rects.find((r) => r.id === 'xps')!
    expect([x.z0, x.z1]).toEqual([-1.13, -0.26])
  })
})
