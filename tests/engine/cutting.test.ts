import { describe, expect, it } from 'vitest'
import {
  computeCutting,
  DEFAULT_FELT_OVERLAP,
  DEFAULT_MIN_PIECE,
  FELT_OVERLAP_RANGE,
  formworkSegmentsRect,
  sheetsFromArea,
  type CuttingInput,
} from '../../src/engine/cutting'
import { renderTrace } from '../../src/engine/trace'

// Szalunek wieńca fundamentowego, przykład 12 × 9 m: oś 12,24 × 9,24, wieniec 0,24 →
// lica zewn. 12,48 / 9,48, wewn. 12,00 / 9,00 (po 2 szt) → razem 85,92 m.
// Pas = 25 cm wieńca + 10 cm zakładu na bloczki = 35 cm. Płyta OSB 250 × 125 cm.
const SEGMENTS = formworkSegmentsRect(12.24, 9.24, 0.24)
const OSB: CuttingInput = {
  material: 'płytę OSB',
  sheetUnit: 'płyt',
  sheet: { width: 1.25, length: 2.5 },
  stripWidth: 0.35,
  segments: SEGMENTS,
  minPieceLength: DEFAULT_MIN_PIECE,
  jointOverlap: 0,
}

describe('cutting — odcinki szalunku', () => {
  it('lica zewn. 12,48 / 9,48 i wewn. 12,00 / 9,00; suma 85,92 m', () => {
    expect(SEGMENTS.map((s) => s.length)).toEqual([9.48, 12.48, 9.48, 12.48, 9, 12, 9, 12])
    expect(computeCutting(OSB).totalSegmentLength).toBe(85.92)
  })
})

describe('cutting — OSB 250 × 125, pas 35 cm', () => {
  const r = computeCutting(OSB)

  it('wariant A (wzdłuż): ⌊125 / 35⌋ = 3 pasy po 250 cm, reszta 20 cm', () => {
    expect(r.A).toMatchObject({ stripsPerSheet: 3, stripLength: 2.5, restWidth: 0.2 })
    expect(r.A!.instruction).toBe('tnij płytę OSB 250 × 125 cm na 3 pasy po 35 cm wzdłuż (dł. pasa 250 cm), reszta 20 cm – odpad')
  })

  it('wariant A: 35 pasów (≥ ⌈85,92 / 2,5⌉ = 35) → ⌈35 / 3⌉ = 12 płyt', () => {
    expect(r.A!.strips).toHaveLength(35)
    expect(r.A!.sheets).toBe(12)
    // 12 × 3,125 − 85,92 × 0,35 = 37,5 − 30,072 = 7,428 m²
    expect(r.A!.wasteArea).toBe(7.428)
  })

  it('wariant B (w poprzek): ⌊250 / 35⌋ = 7 pasów po 125 cm, reszta 5 cm → 10 płyt', () => {
    expect(r.B).toMatchObject({ stripsPerSheet: 7, stripLength: 1.25, restWidth: 0.05 })
    // dolna granica ⌈85,92 / 1,25⌉ = 69 pasów → co najmniej ⌈69 / 7⌉ = 10 płyt
    expect(r.B!.sheets).toBe(10)
    expect(r.B!.wasteArea).toBe(1.178) // 31,25 − 30,072
  })

  it('B tańszy (mniej płyt), ale ~2× więcej łączeń → ostrzeżenie', () => {
    expect(r.best.key).toBe('B')
    expect(r.cheaper).toBe('B')
    expect(r.B!.joints).toBeGreaterThan(r.A!.joints)
    expect(r.jointsWarning).toContain('Wariant B jest tańszy (10 zamiast 12 płyt)')
    expect(r.jointsWarning).toContain('2 × więcej łączeń')
    expect(renderTrace(r.trace)).toContain('A: 12 płyt')
  })

  it('każdy pas mieści się w długości, a suma kawałków każdego odcinka = jego długość', () => {
    for (const v of [r.A!, r.B!]) {
      for (const s of v.strips) {
        const used = s.pieces.reduce((a, p) => a + p.length, 0)
        expect(used + s.remaining).toBeCloseTo(v.stripLength, 9)
      }
      for (const seg of SEGMENTS) {
        const sum = v.strips.flatMap((s) => s.pieces).filter((p) => p.segmentId === seg.id).reduce((a, p) => a + p.length, 0)
        expect(sum).toBeCloseTo(seg.length, 9)
      }
    }
  })

  it('arkusze numerowane: pas n → arkusz ⌊n / k⌋', () => {
    expect(r.A!.strips[3]).toMatchObject({ sheet: 1, slot: 0 })
  })
})

describe('cutting — papa pod ściany: rolka 1 × 10 m, pas 40 cm, boki osi', () => {
  const papa: CuttingInput = {
    material: 'rolkę papy',
    sheetUnit: 'rolek',
    sheet: { width: 1, length: 10 },
    stripWidth: 0.4,
    segments: [9.24, 12.24, 9.24, 12.24].map((length, i) => ({ id: `b${i + 1}`, label: `bok ${i + 1}`, length })),
    minPieceLength: DEFAULT_MIN_PIECE,
    jointOverlap: 0,
  }

  it('A: 2 pasy 10 m, reszta 20 cm; resztki użyte → 5 pasów → 3 rolki', () => {
    const r = computeCutting(papa)
    expect(r.A).toMatchObject({ stripsPerSheet: 2, restWidth: 0.2 })
    expect(r.A!.strips).toHaveLength(5)
    expect(r.A!.sheets).toBe(3)
  })

  it('B: 25 pasów po 1 m; 12 + 1 + 12 + 9 + 9 = 43 pasy → 2 rolki → wybrany B', () => {
    const r = computeCutting(papa)
    expect(r.B!.strips).toHaveLength(43)
    expect(r.B!.sheets).toBe(2)
    expect(r.best.key).toBe('B')
  })

  it('zakład 10 cm na łączeniach wydłuża zużycie pasa', () => {
    const r0 = computeCutting(papa)
    const r1 = computeCutting({ ...papa, jointOverlap: 0.1 })
    const len = (v: typeof r0.A) => v!.strips.reduce((a, s) => a + s.pieces.reduce((b, p) => b + p.length, 0), 0)
    expect(len(r1.A)).toBeCloseTo(len(r0.A) + 0.1 * r1.A!.joints, 9)
  })
})

describe('cutting — przypadki brzegowe', () => {
  it('pas szerszy niż krótszy bok → tylko wariant B', () => {
    const r = computeCutting({ ...OSB, stripWidth: 1.3 })
    expect(r.A).toBeNull()
    expect(r.best.key).toBe('B')
  })

  it('pas szerszy niż arkusz → błąd', () => {
    expect(() => computeCutting({ ...OSB, stripWidth: 3 })).toThrow()
  })

  it('remis arkuszy → mniej łączeń', () => {
    // 1 odcinek 2 m: A — 1 pas 2,5 m (0 łączeń), B — 2 pasy 1,25 (1 łączenie); oba 1 płyta
    const r = computeCutting({ ...OSB, segments: [{ id: 'x', label: 'x', length: 2 }] })
    expect(r.A!.sheets).toBe(1)
    expect(r.B!.sheets).toBe(1)
    expect(r.best.key).toBe('A')
  })

  it('remis → brak „tańszego” i brak ostrzeżenia', () => {
    const r = computeCutting({ ...OSB, segments: [{ id: 'x', label: 'x', length: 2 }] })
    expect(r.cheaper).toBeNull()
    expect(r.jointsWarning).toBeNull()
  })

  it('zakład papy domyślnie 30 cm (zakres 20–40 cm)', () => {
    expect(DEFAULT_FELT_OVERLAP).toBe(0.3)
    expect(FELT_OVERLAP_RANGE).toEqual({ min: 0.2, max: 0.4 })
  })

  it('liczba rolek z samej powierzchni: ⌈17,18 / 10⌉ = 2', () => {
    expect(sheetsFromArea(17.184, 10, 'rolek').value).toBe(2)
  })
})
