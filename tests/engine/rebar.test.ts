import { describe, expect, it } from 'vitest'
import {
  computeRebarCost,
  computeRebarElement,
  defaultFootingRebar,
  defaultRingBeamRebar,
} from '../../src/engine/rebar'
import { renderTrace } from '../../src/engine/trace'

// Przykład referencyjny 12 × 9 m, ściana 0,24: P_oś = 42,96 m.
const P_OS = 42.96

describe('rebar — ławy 0,60 × 0,40 (przykład), 4 × Ø12, Ø6 co 30 cm, c = 5 cm', () => {
  const r = computeRebarElement('Ławy', P_OS, defaultFootingRebar(0.6, 0.4))

  it('pręty podłużne: ⌈42,96 / 11,4⌉ = 4 na linię × 4 linie = 16', () => {
    expect(r.segmentsPerLine).toBe(4)
    expect(r.longitudinalBars).toBe(16)
  })

  it('narożne: 4 × 4 = 16 szt po 1,2 m, 10 z pręta → 2 pręty', () => {
    expect(r.cornerPieces).toBe(16)
    expect(r.cornerBars).toBe(2)
  })

  it('strzemię: 2·0,5 + 2·0,3 + 0,16 = 1,76 m; ⌈143,2⌉ + 1 = 145 szt', () => {
    expect(r.stirrupLength).toBe(1.76)
    expect(r.stirrupCount).toBe(145)
    expect(r.stirrupNetMeters).toBe(255.2)
    expect(r.stirrupBars).toBe(25) // 6 strzemion z pręta → ⌈145 / 6⌉ = 25
  })

  it('masa: Ø12 18 × 12 × 0,888 = 191,808 kg; Ø6 25 × 12 × 0,222 = 66,6 kg', () => {
    expect(r.byDiameter).toEqual([
      { diameter: 12, bars: 18, meters: 216, massKg: 191.808 },
      { diameter: 6, bars: 25, meters: 300, massKg: 66.6 },
    ])
    expect(r.totalMassKg).toBe(258.408)
  })

  it('trace zawiera kroki zgodne z wynikiem', () => {
    const t = renderTrace(r.trace)
    expect(t).toContain('⌈42,96 / (12 − 0,6)⌉')
    expect(t).toContain('258,408 kg')
  })
})

describe('rebar — wieniec fundamentowy 0,24 × 0,25, Ø6 co 25 cm, c = 3 cm', () => {
  const r = computeRebarElement('Wieniec fund.', P_OS, defaultRingBeamRebar(0.24, 0.25))

  it('strzemię 2·0,18 + 2·0,19 + 0,16 = 0,90 m; ⌈171,84⌉ + 1 = 173 szt; 13 z pręta → 14 prętów', () => {
    expect(r.stirrupLength).toBe(0.9)
    expect(r.stirrupCount).toBe(173)
    expect(r.stirrupBars).toBe(14)
    expect(r.byDiameter.find((x) => x.diameter === 6)?.massKg).toBe(37.296)
  })
})

describe('rebar — zakłady i skrajne przypadki', () => {
  it('linia równa wielokrotności (l − zakład): 22,8 m → 2 odcinki', () => {
    const r = computeRebarElement('x', 22.8, defaultRingBeamRebar(0.24, 0.24))
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
    // 191,808 × 4,50 = 863,136 → 863,14 zł; 66,6 × 5,00 = 333,00 zł
    expect(c.lines.map((l) => l.costGrosze)).toEqual([86314, 33300, null])
    expect(c.tieWireKg).toBeNull()
    expect(c.complete).toBe(false)
  })

  it('za pręt i drut 1%: 2,58408 kg', () => {
    const c = computeRebarCost(r, {
      basis: 'pręt',
      prices: { 12: 5500, 6: 1500 },
      tieWirePercent: 1,
      tieWirePricePerKgGrosze: 1500,
    })
    // 18 × 55 = 990 zł; 25 × 15 = 375 zł; drut 2,58408 × 15 = 38,76 zł
    expect(c.tieWireKg).toBe(2.58408)
    expect(c.totalGrosze).toBe(99000 + 37500 + 3876)
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
