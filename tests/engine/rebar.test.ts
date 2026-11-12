import { describe, expect, it } from 'vitest'
import {
  computeRebarCost,
  computeRebarElement,
  defaultFootingRebar,
  defaultRingBeamRebar,
  summarizeRebar,
} from '../../src/engine/rebar'
import { renderTrace } from '../../src/engine/trace'

// Przykład referencyjny 12 × 9 m, ściana 0,24: P_oś = 42,96 m. Pręty handlowe 6 m, zakład 0,6 m.
const P_OS = 42.96

describe('rebar — ławy 0,60 × 0,40 (przykład), 4 × Ø12, Ø6 co 30 cm, c = 5 cm', () => {
  const r = computeRebarElement('Ławy', P_OS, defaultFootingRebar(0.6, 0.4))

  it('pręty podłużne: ⌈42,96 / 5,4⌉ = ⌈7,96⌉ = 8 na linię × 4 linie = 32', () => {
    expect(r.segmentsPerLine).toBe(8)
    expect(r.longitudinalBars).toBe(32)
  })

  it('narożne: 4 × 4 = 16 szt po 1,2 m, 5 z pręta 6 m → 4 pręty', () => {
    expect(r.cornerPieces).toBe(16)
    expect(r.cornerBars).toBe(4)
  })

  it('strzemię: 2·0,5 + 2·0,3 + 0,16 = 1,76 m; ⌈143,2⌉ + 1 = 145 szt; 3 z pręta → 49 prętów', () => {
    expect(r.stirrupLength).toBe(1.76)
    expect(r.stirrupCount).toBe(145)
    expect(r.stirrupNetMeters).toBe(255.2)
    expect(r.stirrupBars).toBe(49)
  })

  it('Ø12: wbudowane 4 × (42,96 + 8 × 0,6) + 19,2 = 210,24 m; zakup 36 × 6 = 216 m = 191,808 kg', () => {
    expect(r.byDiameter[0]).toEqual({ diameter: 12, bars: 36, netMeters: 210.24, meters: 216, massKg: 191.808 })
  })

  it('Ø6: wbudowane 255,2 m; zakup 49 × 6 = 294 m = 65,268 kg', () => {
    expect(r.byDiameter[1]).toEqual({ diameter: 6, bars: 49, netMeters: 255.2, meters: 294, massKg: 65.268 })
    expect(r.totalMassKg).toBe(257.076)
  })

  it('trace zawiera kroki zgodne z wynikiem', () => {
    const t = renderTrace(r.trace)
    expect(t).toContain('⌈42,96 / (6 − 0,6)⌉')
    expect(t).toContain('210,24 m; 36 × 6 m')
    expect(t).toContain('257,076 kg')
  })
})

describe('rebar — wieniec fundamentowy 0,24 × 0,25, Ø6 co 25 cm, c = 3 cm', () => {
  const r = computeRebarElement('Wieniec fund.', P_OS, defaultRingBeamRebar(0.24, 0.25))

  it('strzemię 0,90 m; 173 szt; 6 z pręta → 29 prętów = 174 m, wbudowane 155,7 m', () => {
    expect(r.stirrupLength).toBe(0.9)
    expect(r.stirrupCount).toBe(173)
    expect(r.stirrupBars).toBe(29)
    expect(r.byDiameter[1]).toEqual({ diameter: 6, bars: 29, netMeters: 155.7, meters: 174, massKg: 38.628 })
  })
})

describe('rebar — zestawienie zbiorcze: ławy + wieniec fund. + wieniec ścian (0,24 × 0,24)', () => {
  const s = summarizeRebar([
    computeRebarElement('Ławy', P_OS, defaultFootingRebar(0.6, 0.4)),
    computeRebarElement('Wieniec fund.', P_OS, defaultRingBeamRebar(0.24, 0.25)),
    computeRebarElement('Wieniec ścian', P_OS, defaultRingBeamRebar(0.24, 0.24)),
  ])

  it('Ø12: 3 × 210,24 = 630,72 m wbudowane; 108 prętów = 648 m', () => {
    expect(s.byDiameter[0]).toEqual({ diameter: 12, bars: 108, netMeters: 630.72, meters: 648, massKg: 575.424 })
  })

  it('Ø6: 255,2 + 155,7 + 152,24 = 563,14 m wbudowane; 49 + 29 + 29 = 107 prętów = 642 m', () => {
    expect(s.byDiameter[1]).toEqual({ diameter: 6, bars: 107, netMeters: 563.14, meters: 642, massKg: 142.524 })
    expect(s.totalMassKg).toBe(717.948)
    expect(renderTrace(s.trace)).toContain('563,14 m wbudowane, 107 prętów = 642 m do kupienia')
  })
})

describe('rebar — zakłady i skrajne przypadki', () => {
  it('linia równa wielokrotności (l − zakład): 10,8 m → 2 odcinki', () => {
    const r = computeRebarElement('x', 10.8, defaultRingBeamRebar(0.24, 0.24))
    expect(r.segmentsPerLine).toBe(2)
  })

  it('bez prętów narożnych', () => {
    const r = computeRebarElement('x', P_OS, { ...defaultRingBeamRebar(0.24, 0.24), cornerBarsPerCorner: 0 })
    expect(r.cornerBars).toBe(0)
  })

  it('odrzuca otulinę większą niż przekrój', () => {
    expect(() => computeRebarElement('x', P_OS, { ...defaultRingBeamRebar(0.24, 0.24), cover: 0.13 })).toThrow()
  })
})

describe('rebar — koszt', () => {
  const r = computeRebarElement('Ławy', P_OS, defaultFootingRebar(0.6, 0.4))

  it('za kg: Ø12 4,50 zł/kg, Ø6 5,00 zł/kg; drut null → niepełne', () => {
    const c = computeRebarCost(r, {
      basis: 'kg',
      prices: { 12: 450, 6: 500 },
      tieWirePercent: null,
      tieWirePricePerKgGrosze: 1500,
    })
    // 191,808 × 4,50 = 863,136 → 863,14 zł; 65,268 × 5,00 = 326,34 zł
    expect(c.lines.map((l) => l.costGrosze)).toEqual([86314, 32634, null])
    expect(c.tieWireKg).toBeNull()
    expect(c.complete).toBe(false)
  })

  it('za pręt i drut 1%: 2,57076 kg', () => {
    const c = computeRebarCost(r, {
      basis: 'pręt',
      prices: { 12: 2800, 6: 800 },
      tieWirePercent: 1,
      tieWirePricePerKgGrosze: 1500,
    })
    // 36 × 28 = 1008 zł; 49 × 8 = 392 zł; drut 2,57076 × 15 = 38,5614 → 38,56 zł
    expect(c.tieWireKg).toBe(2.57076)
    expect(c.totalGrosze).toBe(100800 + 39200 + 3856)
    expect(c.complete).toBe(true)
  })

  it('za tonę: 0,191808 t × 4500 zł', () => {
    const c = computeRebarCost(r, {
      basis: 't',
      prices: { 12: 450000, 6: null },
      tieWirePercent: null,
      tieWirePricePerKgGrosze: null,
    })
    expect(c.lines[0].quantity).toBe(0.191808)
    expect(c.lines[0].costGrosze).toBe(86314)
  })
})
