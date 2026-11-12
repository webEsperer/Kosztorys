// Cięcie pasów z arkuszy i rolek (OSB na szalunek wieńca, papa pod ściany itp.).
// Czyste dane — rysunek SVG planu cięcia buduje UI z wyniku tej funkcji.
//
// Wariant A: pasy wzdłuż dłuższego boku arkusza → ⌊krótszy / pas⌋ pasów o długości dłuższego boku.
// Wariant B: pasy wzdłuż krótszego boku → ⌊dłuższy / pas⌋ pasów o długości krótszego boku.
// Odcinki ścian pokrywane pasami; resztki pasów wykorzystywane na kolejne odcinki (odcinki od najdłuższego,
// najpierw resztka mieszcząca cały brakujący kawałek, potem całe pasy, potem największa resztka ≥ min. kawałka).
// Wybór: wariant z mniejszą liczbą arkuszy; przy remisie — mniej łączeń.
// Wymiary w metrach.

import { type TraceStep, ceilSafe, clean, floorSafe, fmt } from './trace'

export interface CutSegment {
  id: string
  label: string
  /** Długość odcinka do pokrycia pasem [m]. */
  length: number
}

export interface CuttingInput {
  /** Nazwa materiału do opisów, np. „płyta OSB”, „rolka papy”. */
  material: string
  /** Jednostka zakupu w dopełniaczu l. mn. / mianowniku, np. 'płyta' | 'rolka'. */
  sheetUnit: string
  /** Wymiary arkusza / rolki [m] (kolejność dowolna). */
  sheet: { width: number; length: number }
  /** Szerokość pasa [m]. */
  stripWidth: number
  segments: CutSegment[]
  /** Najkrótszy kawałek, który opłaca się wstawić z resztki [m] (parametr). */
  minPieceLength: number
  /** Zakład na łączeniu kawałków w jednym odcinku [m] (OSB: 0; papa: wg producenta). */
  jointOverlap: number
}

export const DEFAULT_MIN_PIECE = 0.3

export interface CutPiece {
  segmentId: string
  /** Kawałek liczony od początku pasa [m]. */
  from: number
  length: number
}

export interface CutStrip {
  /** Numer arkusza (0…) i pasa w arkuszu (0…). */
  sheet: number
  slot: number
  pieces: CutPiece[]
  /** Pozostała długość pasa [m] (odpad, jeśli nie wykorzystana). */
  remaining: number
}

export interface CuttingVariant {
  key: 'A' | 'B'
  /** 'wzdłuż' — pasy wzdłuż dłuższego boku; 'w poprzek' — wzdłuż krótszego. */
  direction: 'wzdłuż' | 'w poprzek'
  stripsPerSheet: number
  stripLength: number
  /** Szerokość reszty arkusza po wycięciu pasów (odpad) [m]. */
  restWidth: number
  strips: CutStrip[]
  sheets: number
  /** Łączenia (kawałki ponad pierwszy w każdym odcinku). */
  joints: number
  sheetArea: number
  totalArea: number
  usedArea: number
  wasteArea: number
  wastePercent: number
  /** Instrukcja cięcia, np. „tnij płytę 250 × 125 cm na 3 pasy po 35 cm wzdłuż, reszta 20 cm – odpad”. */
  instruction: string
  trace: TraceStep[]
}

export interface CuttingResult {
  /** Długość do pokrycia (z zakładami na łączeniach wariantu najlepszego) [m]. */
  totalSegmentLength: number
  A: CuttingVariant | null
  B: CuttingVariant | null
  best: CuttingVariant
  trace: TraceStep[]
}

const EPS = 1e-9

function cm(m: number): string {
  return fmt(clean(m * 100), 1)
}

interface Leftover {
  strip: CutStrip
}

function runVariant(input: CuttingInput, key: 'A' | 'B'): CuttingVariant | null {
  const long = Math.max(input.sheet.width, input.sheet.length)
  const short = Math.min(input.sheet.width, input.sheet.length)
  const across = key === 'A' ? short : long
  const stripLength = key === 'A' ? long : short
  const k = floorSafe(across / input.stripWidth)
  if (k < 1) return null
  const restWidth = clean(across - k * input.stripWidth)
  const S = stripLength
  const minPiece = input.minPieceLength
  const overlap = input.jointOverlap
  if (!(overlap >= 0 && overlap < S)) throw new Error('Zakład na łączeniu musi być ≥ 0 i krótszy od pasa.')

  const strips: CutStrip[] = []
  const newStrip = (): CutStrip => {
    const n = strips.length
    const s: CutStrip = { sheet: Math.floor(n / k), slot: n % k, pieces: [], remaining: S }
    strips.push(s)
    return s
  }
  const place = (s: CutStrip, segmentId: string, len: number) => {
    s.pieces.push({ segmentId, from: clean(S - s.remaining), length: clean(len) })
    s.remaining = clean(s.remaining - len)
  }
  const leftovers = (): Leftover[] => strips.filter((s) => s.remaining > EPS).map((strip) => ({ strip }))

  let joints = 0
  const sorted = [...input.segments].sort((a, b) => b.length - a.length)
  for (const seg of sorted) {
    let need = seg.length
    let pieces = 0
    const added = () => {
      pieces++
      if (pieces > 1) joints++
    }
    while (need > EPS) {
      // kolejny kawałek (poza pierwszym) wymaga zakładu
      const want = pieces > 0 ? need + overlap : need
      // a) resztka mieszcząca cały kawałek — najmniejsza wystarczająca
      const fit = leftovers()
        .filter((l) => l.strip.remaining >= want - EPS)
        .sort((x, y) => x.strip.remaining - y.strip.remaining)[0]
      if (fit) {
        place(fit.strip, seg.id, want)
        added()
        need = 0
        break
      }
      // b) cały nowy pas
      if (want >= S - EPS) {
        place(newStrip(), seg.id, S)
        added()
        need = clean(want - S)
        continue
      }
      // c) największa resztka ≥ min. kawałka (i dłuższa niż zakład — inaczej nic nie pokrywa)
      const big = leftovers()
        .filter((l) => l.strip.remaining >= minPiece - EPS && l.strip.remaining > overlap + EPS)
        .sort((x, y) => y.strip.remaining - x.strip.remaining)[0]
      if (big) {
        const len = big.strip.remaining
        place(big.strip, seg.id, len)
        added()
        need = clean(want - len)
        continue
      }
      // d) nowy pas na resztę
      place(newStrip(), seg.id, want)
      added()
      need = 0
    }
  }

  const sheets = Math.ceil(strips.length / k)
  const sheetArea = clean(long * short)
  const totalArea = clean(sheets * sheetArea)
  const usedArea = clean(strips.reduce((a, s) => a + s.pieces.reduce((b, p) => b + p.length, 0), 0) * input.stripWidth)
  const wasteArea = clean(totalArea - usedArea)
  const wastePercent = totalArea > 0 ? clean((wasteArea / totalArea) * 100) : 0
  const dirText = key === 'A' ? 'wzdłuż' : 'w poprzek'
  const instruction =
    `tnij ${input.material} ${cm(long)} × ${cm(short)} cm na ${k} ${k === 1 ? 'pas' : k < 5 ? 'pasy' : 'pasów'} ` +
    `po ${cm(input.stripWidth)} cm ${dirText} (dł. pasa ${cm(S)} cm)` +
    (restWidth > EPS ? `, reszta ${cm(restWidth)} cm – odpad` : ', bez reszty')

  const usedLen = clean(usedArea / input.stripWidth)
  const trace: TraceStep[] = [
    {
      label: `Wariant ${key}: pasy ${dirText}`,
      formula: key === 'A' ? 'k = ⌊krótszy bok / pas⌋' : 'k = ⌊dłuższy bok / pas⌋',
      values: `⌊${fmt(across)} / ${fmt(input.stripWidth)}⌋ = ⌊${fmt(across / input.stripWidth)}⌋`,
      result: k,
      unit: 'pasy/arkusz',
      note: `pas ${cm(input.stripWidth)} × ${cm(S)} cm; reszta ${cm(restWidth)} cm`,
    },
    {
      label: `Wariant ${key}: pasy zużyte`,
      formula: 'odcinki od najdłuższego, resztki pasów na kolejne odcinki',
      values: `${fmt(usedLen)} m pasa (w tym zakłady), ${joints} łączeń`,
      result: strips.length,
      unit: 'pasów',
    },
    {
      label: `Wariant ${key}: liczba arkuszy`,
      formula: '⌈pasy / k⌉',
      values: `⌈${strips.length} / ${k}⌉`,
      result: sheets,
      unit: input.sheetUnit,
    },
    {
      label: `Wariant ${key}: odpad`,
      formula: 'arkusze × pole − pole pasów',
      values: `${sheets} × ${fmt(sheetArea)} − ${fmt(usedLen)} × ${fmt(input.stripWidth)}`,
      result: wasteArea,
      unit: 'm²',
      note: `${fmt(wastePercent, 1)}%`,
    },
  ]

  return {
    key,
    direction: dirText,
    stripsPerSheet: k,
    stripLength: S,
    restWidth,
    strips,
    sheets,
    joints,
    sheetArea,
    totalArea,
    usedArea,
    wasteArea,
    wastePercent,
    instruction,
    trace,
  }
}

export function computeCutting(input: CuttingInput): CuttingResult {
  if (!(input.sheet.width > 0 && input.sheet.length > 0)) throw new Error('Podaj wymiary arkusza / rolki.')
  if (!(input.stripWidth > 0)) throw new Error('Szerokość pasa musi być większa od zera.')
  if (!(input.minPieceLength >= 0)) throw new Error('Minimalny kawałek nie może być ujemny.')
  if (input.segments.length === 0) throw new Error('Brak odcinków do pokrycia.')
  input.segments.forEach((s) => {
    if (!(s.length > 0)) throw new Error(`Odcinek „${s.label}” musi mieć długość > 0.`)
  })

  const A = runVariant(input, 'A')
  const B = runVariant(input, 'B')
  const candidates = [A, B].filter((v): v is CuttingVariant => v !== null)
  if (candidates.length === 0) throw new Error('Pas jest szerszy niż arkusz — nie da się go wyciąć.')
  const best = candidates.reduce((x, y) => (y.sheets < x.sheets || (y.sheets === x.sheets && y.joints < x.joints) ? y : x))
  const totalSegmentLength = clean(input.segments.reduce((a, s) => a + s.length, 0))

  const trace: TraceStep[] = [
    {
      label: 'Długość odcinków do pokrycia',
      formula: 'Σ odcinków',
      values: input.segments.map((s) => fmt(s.length)).join(' + '),
      result: totalSegmentLength,
      unit: 'm',
    },
    ...(A?.trace ?? []),
    ...(B?.trace ?? []),
    {
      label: 'Wybrany wariant',
      formula: 'mniej arkuszy (przy remisie mniej łączeń)',
      values: candidates.map((v) => `${v.key}: ${v.sheets} ${input.sheetUnit}, ${v.joints} łączeń`).join('; '),
      result: `${best.key} — ${best.instruction}`,
      unit: '',
    },
  ]

  return { totalSegmentLength, A, B, best, trace }
}

/** Liczba arkuszy z samej powierzchni (gdy rolka podana tylko jako m², bez wymiarów): ⌈A_potrz / A_arkusza⌉. */
export function sheetsFromArea(neededArea: number, sheetArea: number, unit: string): { value: number; trace: TraceStep[] } {
  if (!(sheetArea > 0)) throw new Error('Powierzchnia arkusza / rolki musi być większa od zera.')
  const value = ceilSafe(neededArea / sheetArea)
  return {
    value,
    trace: [
      {
        label: 'Liczba z powierzchni (bez planu cięcia)',
        formula: '⌈A_potrz / A_arkusza⌉',
        values: `⌈${fmt(neededArea)} / ${fmt(sheetArea)}⌉`,
        result: value,
        unit,
        note: 'podaj wymiary rolki, żeby policzyć z planem cięcia',
      },
    ],
  }
}

/** Odcinki szalunku obustronnego elementu po prostokątnym obrysie osi (lico zewn. i wewn. każdego boku). */
export function formworkSegmentsRect(axisLength: number, axisWidth: number, elementWidth: number): CutSegment[] {
  const outL = clean(axisLength + elementWidth)
  const outB = clean(axisWidth + elementWidth)
  const inL = clean(axisLength - elementWidth)
  const inB = clean(axisWidth - elementWidth)
  if (!(inL > 0 && inB > 0)) throw new Error('Element jest szerszy niż pozwala obrys.')
  const names = ['lewy', 'górny', 'prawy', 'dolny']
  const out: CutSegment[] = []
  names.forEach((n, i) => out.push({ id: `zew-${i + 1}`, label: `bok ${n} — zewn.`, length: i % 2 === 0 ? outB : outL }))
  names.forEach((n, i) => out.push({ id: `wew-${i + 1}`, label: `bok ${n} — wewn.`, length: i % 2 === 0 ? inB : inL }))
  return out
}
