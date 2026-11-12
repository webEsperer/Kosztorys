// Rozłożenie zbrojenia na rzucie (do rysunku). Czyste dane — bez three.js.
// Liczby (pręty na linię, narożne, strzemiona) pochodzą z computeRebarElement,
// tu tylko ustawiamy je w przestrzeni, żeby rysunek pokazywał dokładnie to, co policzono.
//
// Układ współrzędnych rzutu [m]: początek w lewym dolnym narożniku prostokąta osi ścian,
// x w prawo (długość L), y w górę (szerokość B). Obwód idzie od narożnika lewego dolnego
// zgodnie z ruchem wskazówek zegara (jak numeracja ścian w CLAUDE.md): lewa → górna → prawa → dolna.

import type { RebarElementParams, RebarElementResult } from './rebar'
import { clean } from './trace'

export interface Pt2 {
  x: number
  y: number
}

/** Prostokąt osi elementu (np. oś ściany = oś ławy). */
export interface AxisRect {
  /** Długość w osi [m] (wzdłuż x). */
  length: number
  /** Szerokość w osi [m] (wzdłuż y). */
  width: number
}

export function loopPerimeter(r: AxisRect): number {
  return clean(2 * (r.length + r.width))
}

/** Odległości narożników po obwodzie: LD, LG, PG, PD (start = 0). */
function cornerDistances(r: AxisRect): number[] {
  return [0, r.width, r.width + r.length, 2 * r.width + r.length]
}

const CORNERS = (r: AxisRect): Pt2[] => [
  { x: 0, y: 0 },
  { x: 0, y: r.width },
  { x: r.length, y: r.width },
  { x: r.length, y: 0 },
]

/** Normalne zewnętrzne boków: lewy, górny, prawy, dolny. */
const SIDE_NORMALS: Pt2[] = [
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 1, y: 0 },
  { x: 0, y: -1 },
]

function mod(a: number, n: number): number {
  return ((a % n) + n) % n
}

/** Punkt na obwodzie w odległości s, odsunięty o `offset` na zewnątrz (ujemny = do wewnątrz). */
export function pointOnLoop(r: AxisRect, s: number, offset = 0): Pt2 {
  const P = loopPerimeter(r)
  const t = mod(s, P)
  const cd = cornerDistances(r)
  const corners = CORNERS(r)
  let side = 3
  for (let i = 0; i < 4; i++) {
    const end = i < 3 ? cd[i + 1] : P
    if (t < end - 1e-12) {
      side = i
      break
    }
  }
  const a = corners[side]
  const b = corners[(side + 1) % 4]
  const len = side % 2 === 0 ? r.width : r.length
  const u = (t - cd[side]) / len
  const n = SIDE_NORMALS[side]
  return { x: clean(a.x + (b.x - a.x) * u + n.x * offset), y: clean(a.y + (b.y - a.y) * u + n.y * offset) }
}

/** Narożnik i odsunięty narożnik (przecięcie boków odsuniętych o offset). */
function cornerPoint(r: AxisRect, i: number, offset: number): Pt2 {
  const c = CORNERS(r)[i]
  const nPrev = SIDE_NORMALS[(i + 3) % 4]
  const nNext = SIDE_NORMALS[i]
  return { x: clean(c.x + (nPrev.x + nNext.x) * offset), y: clean(c.y + (nPrev.y + nNext.y) * offset) }
}

/** Łamana wzdłuż obwodu od s0 do s1 (s1 > s0, może przekraczać obwód), z narożnikami po drodze. */
export function loopPolyline(r: AxisRect, s0: number, s1: number, offset = 0): Pt2[] {
  const P = loopPerimeter(r)
  const pts: Pt2[] = [pointOnLoop(r, s0, offset)]
  const cd = cornerDistances(r)
  const kStart = Math.floor(s0 / P) - 1
  const kEnd = Math.ceil(s1 / P) + 1
  const crossings: { s: number; i: number }[] = []
  for (let k = kStart; k <= kEnd; k++) {
    for (let i = 0; i < 4; i++) {
      const s = cd[i] + k * P
      if (s > s0 + 1e-9 && s < s1 - 1e-9) crossings.push({ s, i })
    }
  }
  crossings.sort((a, b) => a.s - b.s)
  for (const c of crossings) pts.push(cornerPoint(r, c.i, offset))
  pts.push(pointOnLoop(r, s1, offset))
  return pts
}

// ─── Rozłożenie prętów ──────────────────────────────────────────────────────

export interface LaidBar {
  /** Numer linii (1…n) i numer pręta w linii (1…k). */
  line: number
  index: number
  /** Początek i koniec po obwodzie [m] (koniec może przekraczać obwód — zawinięcie). */
  s0: number
  s1: number
  /** Długość pręta [m] (ostatni w linii może być docięty). */
  length: number
  /** Czy pręt jest docięty (krótszy niż handlowy). */
  isCut: boolean
  points: Pt2[]
}

export interface LapZone {
  line: number
  s0: number
  s1: number
  points: Pt2[]
}

export interface BarLine {
  line: number
  /** 'dolny' | 'górny' — położenie w przekroju. */
  level: 'dolny' | 'górny'
  /** 'zewnętrzny' | 'wewnętrzny' — strona względem osi. */
  side: 'zewnętrzny' | 'wewnętrzny'
  /** Odsunięcie od osi w rzucie [m] (+ na zewnątrz). */
  offset: number
  /** Przesunięcie początku linii po obwodzie [m] — zakłady sąsiednich linii nie w jednym miejscu. */
  start: number
  bars: LaidBar[]
  laps: LapZone[]
}

export interface CornerBar {
  corner: number
  line: number
  points: Pt2[]
  length: number
}

export interface StirrupMark {
  index: number
  s: number
  points: [Pt2, Pt2]
}

export interface RebarPlanLayout {
  perimeter: number
  /** Krok pręta po obwodzie: l_pręta − zakład. */
  step: number
  lines: BarLine[]
  cornerBars: CornerBar[]
  stirrups: StirrupMark[]
  /** Rzeczywisty rozstaw strzemion na zamkniętym obwodzie. */
  stirrupActualSpacing: number
  /** Strzemiona „zapasowe” wynikające z wzoru ⌈L/s⌉ + 1 na obwodzie zamkniętym. */
  stirrupSpare: number
  /** Obrys elementu (lico zewnętrzne i wewnętrzne). */
  outline: { outer: Pt2[]; inner: Pt2[] }
}

/** Odsunięcie osi pręta podłużnego od lica: otulina (oś strzemienia) + ½Ø strzemienia + ½Ø pręta. */
export function barInset(p: RebarElementParams): number {
  return clean(p.cover + p.stirrupDiameter / 2000 + p.longitudinalDiameter / 2000)
}

/**
 * Rozkłada zbrojenie elementu liniowego na obwodzie prostokąta osi.
 * 4 linie prętów: dolne i górne, zewnętrzne i wewnętrzne. Linie 1…n mają początki przesunięte
 * o krok/n, żeby zakłady nie wypadały w jednym przekroju.
 */
export function layoutRebarPlan(r: AxisRect, p: RebarElementParams, res: RebarElementResult): RebarPlanLayout {
  const P = loopPerimeter(r)
  if (Math.abs(P - res.lineLength) > 1e-6) {
    throw new Error(`Obwód prostokąta osi (${P}) różni się od długości linii zbrojenia (${res.lineLength}).`)
  }
  const step = clean(p.barLength - p.lapLength)
  const n = res.segmentsPerLine
  const off = clean(p.width / 2 - barInset(p))

  const lineDefs: Omit<BarLine, 'start' | 'bars' | 'laps' | 'line'>[] = []
  const levels: ('dolny' | 'górny')[] = ['dolny', 'górny']
  const perLevel = Math.max(1, Math.round(p.longitudinalCount / 2))
  for (let k = 0; k < p.longitudinalCount; k++) {
    const level = levels[Math.floor(k / perLevel)] ?? 'górny'
    const j = k % perLevel
    // przy 2 prętach na poziom: zewnętrzny i wewnętrzny; przy więcej — rozłożone równo
    const o = perLevel === 1 ? 0 : off - (2 * off * j) / (perLevel - 1)
    lineDefs.push({ level, side: o >= 0 ? 'zewnętrzny' : 'wewnętrzny', offset: clean(o) })
  }

  const lines: BarLine[] = lineDefs.map((d, k) => {
    const start = clean((k * step) / p.longitudinalCount)
    const bars: LaidBar[] = []
    const laps: LapZone[] = []
    for (let i = 0; i < n; i++) {
      const s0 = start + i * step
      const isLast = i === n - 1
      // Ostatni pręt zamyka obwód: kończy się zakładem na pierwszym pręcie.
      const s1 = isLast ? start + P + p.lapLength : s0 + p.barLength
      const length = clean(s1 - s0)
      bars.push({
        line: k + 1,
        index: i + 1,
        s0: clean(s0),
        s1: clean(s1),
        length,
        isCut: length < p.barLength - 1e-9,
        points: loopPolyline(r, s0, s1, d.offset),
      })
      // zakład na końcu pręta (z następnym lub — dla ostatniego — z pierwszym)
      const l0 = s1 - p.lapLength
      laps.push({ line: k + 1, s0: clean(l0), s1: clean(s1), points: loopPolyline(r, l0, s1, d.offset) })
    }
    return { line: k + 1, ...d, start, bars, laps }
  })

  // Pręty narożne „L”: po jednym na każdą linię (gdy szt/naroże = liczba linii), ramiona po ½ długości.
  const cornerBars: CornerBar[] = []
  const cd = cornerDistances(r)
  const leg = p.cornerBarLength / 2
  for (let c = 0; c < p.corners && c < 4; c++) {
    for (let m = 0; m < p.cornerBarsPerCorner; m++) {
      const lineDef = lines[m % lines.length]
      cornerBars.push({
        corner: c + 1,
        line: lineDef.line,
        length: p.cornerBarLength,
        points: loopPolyline(r, cd[c] - leg + (c === 0 ? P : 0), cd[c] + leg + (c === 0 ? P : 0), lineDef.offset),
      })
    }
  }

  // Strzemiona: na obwodzie zamkniętym ⌈L/s⌉ sztuk wystarcza; wzór daje +1 — pokazujemy jako zapas.
  const placed = Math.max(1, res.stirrupCount - 1)
  const actual = clean(P / placed)
  const half = clean(p.width / 2 - p.cover)
  const stirrups: StirrupMark[] = []
  for (let i = 0; i < placed; i++) {
    const s = (i + 0.5) * actual
    stirrups.push({ index: i + 1, s: clean(s), points: [pointOnLoop(r, s, half), pointOnLoop(r, s, -half)] })
  }

  const outline = {
    outer: [0, 1, 2, 3].map((i) => cornerPoint(r, i, p.width / 2)),
    inner: [0, 1, 2, 3].map((i) => cornerPoint(r, i, -p.width / 2)),
  }

  return {
    perimeter: P,
    step,
    lines,
    cornerBars,
    stirrups,
    stirrupActualSpacing: actual,
    stirrupSpare: res.stirrupCount - placed,
    outline,
  }
}
