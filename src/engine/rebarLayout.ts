// Rozłożenie zbrojenia na rzucie (do rysunku). Czyste dane — bez three.js.
// Liczby (zakłady na bokach, zakotwienia, eLki, strzemiona) pochodzą z computeRebarElement,
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

/** Boki prostokąta w kolejności obwodu: lewy, górny, prawy, dolny. */
export function rectSides(r: AxisRect): number[] {
  return [r.width, r.length, r.width, r.length]
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

/** Narożnik odsunięty o offset (przecięcie boków odsuniętych). */
function cornerPoint(r: AxisRect, i: number, offset: number): Pt2 {
  const c = CORNERS(r)[i]
  const nPrev = SIDE_NORMALS[(i + 3) % 4]
  const nNext = SIDE_NORMALS[i]
  return { x: clean(c.x + (nPrev.x + nNext.x) * offset), y: clean(c.y + (nPrev.y + nNext.y) * offset) }
}

/** Łamana wzdłuż obwodu od s0 do s1 (s1 > s0, może wychodzić poza [0, P]), z narożnikami po drodze. */
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
  /** Numer linii (1…n), boku (1…4) i pręta na boku (1…k). */
  line: number
  side: number
  index: number
  /** Początek i koniec po obwodzie [m]. */
  s0: number
  s1: number
  length: number
  /** Kawałek dłuższy niż pręt handlowy (reguła zakładów nie wystarcza — trzeba dodatkowego łączenia). */
  exceedsBar: boolean
  points: Pt2[]
}

export interface LoopZone {
  line: number
  side: number
  s0: number
  s1: number
  points: Pt2[]
}

export interface BarLine {
  line: number
  /** Położenie w przekroju. */
  level: 'dolny' | 'górny'
  /** Strona względem osi. */
  side: 'zewnętrzny' | 'wewnętrzny'
  /** Odsunięcie od osi w rzucie [m] (+ na zewnątrz). */
  offset: number
  bars: LaidBar[]
  laps: LoopZone[]
  /** Zakotwienia 50d za narożem (zagięta końcówka pręta). */
  anchors: LoopZone[]
}

export interface CornerBar {
  corner: number
  line: number
  points: Pt2[]
  length: number
}

export interface StirrupMark {
  index: number
  /** Strzemię w narożu / w strefie zagęszczenia / na odcinku prostym. */
  zone: 'naroże' | 'strefa' | 'prosty'
  s: number
  points: [Pt2, Pt2]
}

export interface RebarPlanLayout {
  perimeter: number
  lines: BarLine[]
  cornerBars: CornerBar[]
  stirrups: StirrupMark[]
  /** Obrys elementu (lico zewnętrzne i wewnętrzne). */
  outline: { outer: Pt2[]; inner: Pt2[] }
}

/** Odsunięcie osi pręta głównego od lica: otulina (oś strzemienia) + ½Ø strzemienia + ½Ø pręta. */
export function barInset(p: RebarElementParams): number {
  return clean(p.cover + p.stirrupDiameter / 2000 + p.longitudinalDiameter / 2000)
}

/**
 * Rozkłada zbrojenie na obwodzie prostokąta osi.
 * Na każdym boku linia pręta biegnie od zakotwienia za narożem początkowym do zakotwienia za narożem
 * końcowym i jest dzielona na (n_zakł + 1) równych kawałków zachodzących na siebie o zakład.
 */
export function layoutRebarPlan(r: AxisRect, p: RebarElementParams, res: RebarElementResult): RebarPlanLayout {
  const sides = rectSides(r)
  if (res.sides.length !== 4 || res.sides.some((s, i) => Math.abs(s.length - sides[i]) > 1e-6)) {
    throw new Error('Boki obrysu nie zgadzają się z bokami użytymi w obliczeniu zbrojenia.')
  }
  const P = loopPerimeter(r)
  const cd = cornerDistances(r)
  const lap = res.lap
  const off = clean(p.width / 2 - barInset(p))

  const perLevel = Math.max(1, Math.round(p.longitudinalCount / 2))
  const lines: BarLine[] = []
  for (let k = 0; k < p.longitudinalCount; k++) {
    const level: 'dolny' | 'górny' = k < perLevel ? 'dolny' : 'górny'
    const j = k % perLevel
    const o = clean(perLevel === 1 ? 0 : off - (2 * off * j) / (perLevel - 1))
    const bars: LaidBar[] = []
    const laps: LoopZone[] = []
    const anchors: LoopZone[] = []
    res.sides.forEach((sd, i) => {
      const runStart = cd[i] - lap
      const runEnd = cd[i] + sd.length + lap
      const pieces = sd.laps + 1
      const pl = clean(sd.lineLength / pieces)
      for (let q = 0; q < pieces; q++) {
        const s0 = runStart + q * (pl - lap)
        const s1 = q === pieces - 1 ? runEnd : s0 + pl
        bars.push({
          line: k + 1,
          side: i + 1,
          index: q + 1,
          s0: clean(s0),
          s1: clean(s1),
          length: clean(s1 - s0),
          exceedsBar: s1 - s0 > p.barLength + 1e-9,
          points: loopPolyline(r, s0, s1, o),
        })
        if (q > 0) {
          const z0 = s0
          const z1 = s0 + lap
          laps.push({ line: k + 1, side: i + 1, s0: clean(z0), s1: clean(z1), points: loopPolyline(r, z0, z1, o) })
        }
      }
      anchors.push({ line: k + 1, side: i + 1, s0: clean(runStart), s1: cd[i], points: loopPolyline(r, runStart, cd[i], o) })
      anchors.push({
        line: k + 1,
        side: i + 1,
        s0: cd[i] + sd.length,
        s1: clean(runEnd),
        points: loopPolyline(r, cd[i] + sd.length, runEnd, o),
      })
    })
    lines.push({ line: k + 1, level, side: o >= 0 ? 'zewnętrzny' : 'wewnętrzny', offset: o, bars, laps, anchors })
  }

  // eLki: po jednej na każdą linię w każdym narożu, ramiona po 50d.
  const cornerBars: CornerBar[] = []
  for (let c = 0; c < 4; c++) {
    for (let m = 0; m < p.cornerBarsPerCorner; m++) {
      const ln = lines[m % lines.length]
      const sc = c === 0 ? P : cd[c]
      cornerBars.push({ corner: c + 1, line: ln.line, length: res.cornerPieceLength, points: loopPolyline(r, sc - lap, sc + lap, ln.offset) })
    }
  }

  // Strzemiona: 1 w każdym narożu (po przekątnej) + położenia z obliczenia na bokach.
  const half = clean(p.width / 2 - p.cover)
  const stirrups: StirrupMark[] = []
  let idx = 0
  res.sides.forEach((sd, i) => {
    stirrups.push({ index: ++idx, zone: 'naroże', s: cd[i], points: [cornerPoint(r, i, half), cornerPoint(r, i, -half)] })
    for (const pos of sd.stirrupPositions) {
      const inZone = pos <= p.cornerZoneLength + 1e-9 || pos >= sd.length - p.cornerZoneLength - 1e-9
      const s = cd[i] + pos
      stirrups.push({
        index: ++idx,
        zone: inZone ? 'strefa' : 'prosty',
        s: clean(s),
        points: [pointOnLoop(r, s, half), pointOnLoop(r, s, -half)],
      })
    }
  })

  const outline = {
    outer: [0, 1, 2, 3].map((i) => cornerPoint(r, i, p.width / 2)),
    inner: [0, 1, 2, 3].map((i) => cornerPoint(r, i, -p.width / 2)),
  }

  return { perimeter: P, lines, cornerBars, stirrups, outline }
}
