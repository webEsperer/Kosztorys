import { describe, expect, it } from 'vitest'
import {
  computeRebarCost,
  computeRebarElement,
  defaultFootingRebar,
  defaultRingBeamRebar,
  lapLength,
  sideStirrupPositions,
  summarizeRebar,
} from '../../src/engine/rebar'
import { renderTrace } from '../../src/engine/trace'

// Przykład referencyjny 12 × 9 m, ściana 0,24 → boki w osi: 9,24 / 12,24 / 9,24 / 12,24 (obwód 42,96 m).
// Pręty handlowe 6 m, zakład = zakotwienie = ramię eLki = 50d = 0,6 m.
const SIDES = [9.24, 12.24, 9.24, 12.24]

describe('rebar — pręty główne Ø12 (ława 60 × 40, przykład)', () => {
  const p = defaultFootingRebar(0.6, 0.4)
  const r = computeRebarElement('Ławy', SIDES, p)

  it('50d dla Ø12 = 0,6 m', () => {
    expect(lapLength(p)).toBe(0.6)
  })

  it('bok 12,24: ⌈12,24/6⌉ − 1 = 2 zakłady → 12,24 + 2 × 0,6 + 2 × 0,6 = 14,64 m', () => {
    expect(r.sides[1]).toMatchObject({ length: 12.24, laps: 2, lineLength: 14.64 })
  })

  it('bok 9,24: 1 zakład → 9,24 + 0,6 + 1,2 = 11,04 m', () => {
    expect(r.sides[0]).toMatchObject({ length: 9.24, laps: 1, lineLength: 11.04 })
  })

  it('bok dokładnie 6 m — bez zakładu; 6,01 m — 1 zakład', () => {
    expect(computeRebarElement('x', [6, 6, 6, 6], p).sides[0].laps).toBe(0)
    expect(computeRebarElement('x', [6.01, 6, 6.01, 6], p).sides[0].laps).toBe(1)
  })

  it('pręty główne: 4 × (2 × 14,64 + 2 × 11,04) = 4 × 51,36 = 205,44 m', () => {
    expect(r.longitudinalNetMeters).toBe(205.44)
  })

  it('eLki: 4 rogi × 4 szt × 1,2 m = 19,2 m (4,8 m na róg)', () => {
    expect(r.cornerPieces).toBe(16)
    expect(r.cornerPieceLength).toBe(1.2)
    expect(r.cornerNetMeters).toBe(19.2)
  })

  it('Ø12 razem 224,64 m → ⌈37,44⌉ = 38 prętów 6 m = 228 m = 202,464 kg', () => {
    expect(r.byDiameter[0]).toEqual({ diameter: 12, netMeters: 224.64, bars: 38, meters: 228, massKg: 202.464 })
  })
})

describe('rebar — strzemiona Ø6', () => {
  const p = defaultFootingRebar(0.6, 0.4)

  it('strefa 1 m co 10 cm (10 szt), środek co 25 cm: bok 12,24 → 10 + 40 + 10 = 60', () => {
    const pos = sideStirrupPositions(12.24, p)
    expect(pos).toHaveLength(60)
    expect(pos.slice(0, 10)).toEqual([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1])
    expect(pos.at(-1)).toBe(12.14)
    // środek 10,24 m: ⌈40,96⌉ − 1 = 40 strzemion co 10,24 / 41 = 0,2498 m
    expect(pos[10]).toBeCloseTo(1 + 10.24 / 41, 6)
  })

  it('bok 9,24 → 10 + (⌈28,96⌉ − 1 = 28) + 10 = 48', () => {
    expect(sideStirrupPositions(9.24, p)).toHaveLength(48)
  })

  it('bok krótszy niż 2 strefy (1,5 m): cały co 10 cm → ⌈15⌉ − 1 = 14', () => {
    expect(sideStirrupPositions(1.5, p)).toHaveLength(14)
  })

  it('ława: strzemię 2·0,5 + 2·0,3 + 0,14 = 1,74 m; 2·60 + 2·48 + 4 naroża = 220 szt = 382,8 m', () => {
    const r = computeRebarElement('Ławy', SIDES, p)
    expect(r.stirrupLength).toBe(1.74)
    expect(r.stirrupCount).toBe(220)
    expect(r.stirrupNetMeters).toBe(382.8)
    expect(r.byDiameter[1]).toEqual({ diameter: 6, netMeters: 382.8, bars: 64, meters: 384, massKg: 85.248 })
    expect(r.totalMassKg).toBe(287.712)
  })

  it('wieniec fund. 24 × 25, c = 3: strzemię 2·0,18 + 2·0,19 + 0,14 = 0,88 m; 193,6 m → 33 pręty', () => {
    const r = computeRebarElement('Wieniec fund.', SIDES, defaultRingBeamRebar(0.24, 0.25))
    expect(r.stirrupLength).toBe(0.88)
    expect(r.byDiameter[1]).toEqual({ diameter: 6, netMeters: 193.6, bars: 33, meters: 198, massKg: 43.956 })
  })

  it('trace pokazuje reguły', () => {
    const t = renderTrace(computeRebarElement('Ławy', SIDES, p).trace)
    expect(t).toContain('12,24 + 2 × 0,6 + 2 × 0,6')
    expect(t).toContain('4 × 4 × 2 × 0,6')
    expect(t).toContain('⌈224,64 / 6⌉')
    expect(t).toContain('287,712 kg')
  })
})

describe('rebar — zestawienie zbiorcze: ława + wieniec fund. + wieniec ścian (24 × 24)', () => {
  const s = summarizeRebar([
    computeRebarElement('Ławy', SIDES, defaultFootingRebar(0.6, 0.4)),
    computeRebarElement('Wieniec fund.', SIDES, defaultRingBeamRebar(0.24, 0.25)),
    computeRebarElement('Wieniec ścian', SIDES, defaultRingBeamRebar(0.24, 0.24)),
  ])

  it('Ø12: 3 × 224,64 = 673,92 m → ⌈112,32⌉ = 113 prętów = 678 m', () => {
    expect(s.byDiameter[0]).toEqual({ diameter: 12, netMeters: 673.92, bars: 113, meters: 678, massKg: 602.064 })
  })

  it('Ø6: 382,8 + 193,6 + 189,2 = 765,6 m → ⌈127,6⌉ = 128 prętów = 768 m', () => {
    expect(s.byDiameter[1]).toEqual({ diameter: 6, netMeters: 765.6, bars: 128, meters: 768, massKg: 170.496 })
    expect(s.totalMassKg).toBe(772.56)
  })
})

describe('rebar — walidacja', () => {
  it('odrzuca otulinę większą niż przekrój', () => {
    expect(() => computeRebarElement('x', SIDES, { ...defaultRingBeamRebar(0.24, 0.24), cover: 0.13 })).toThrow()
  })
  it('odrzuca obrys z mniej niż 3 bokami', () => {
    expect(() => computeRebarElement('x', [5, 5], defaultRingBeamRebar(0.24, 0.24))).toThrow()
  })
})

describe('rebar — koszt (ława)', () => {
  const r = computeRebarElement('Ławy', SIDES, defaultFootingRebar(0.6, 0.4))

  it('za kg: Ø12 4,50 zł/kg, Ø6 5,00 zł/kg; drut null → niepełne', () => {
    const c = computeRebarCost(r, { basis: 'kg', prices: { 12: 450, 6: 500 }, tieWirePercent: null, tieWirePricePerKgGrosze: 1500 })
    // 202,464 × 4,50 = 911,088 → 911,09 zł; 85,248 × 5,00 = 426,24 zł
    expect(c.lines.map((l) => l.costGrosze)).toEqual([91109, 42624, null])
    expect(c.complete).toBe(false)
  })

  it('za pręt i drut 1%: 38 × 28 + 64 × 8 + 2,87712 kg × 15 zł', () => {
    const c = computeRebarCost(r, { basis: 'pręt', prices: { 12: 2800, 6: 800 }, tieWirePercent: 1, tieWirePricePerKgGrosze: 1500 })
    expect(c.tieWireKg).toBe(2.87712)
    expect(c.totalGrosze).toBe(106400 + 51200 + 4316)
    expect(c.complete).toBe(true)
  })

  it('za tonę: 0,202464 t × 4500 zł', () => {
    const c = computeRebarCost(r, { basis: 't', prices: { 12: 450000, 6: null }, tieWirePercent: null, tieWirePricePerKgGrosze: null })
    expect(c.lines[0].quantity).toBe(0.202464)
    expect(c.lines[0].costGrosze).toBe(91109)
  })
})
