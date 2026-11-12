// Typy i helpery śledzenia obliczeń („Jak to policzono”).
// Każda funkcja licząca w engine/ zwraca wynik + trace, nigdy samą liczbę.

/** Pojedynczy krok obliczeń. */
export interface TraceStep {
  /** Opis kroku po polsku, np. „Obwód w osi ściany”. */
  label: string
  /** Wzór symboliczny, np. „P_oś = P_wew + 4·t”. */
  formula: string
  /** Wzór z podstawionymi wartościami, np. „42 + 4 × 0,24”. */
  values: string
  /** Wynik liczbowy kroku (lub tekst przy krokach decyzyjnych). */
  result: number | string
  /** Jednostka wyniku. */
  unit: string
  /** Identyfikator wielkości pochodnej, do której krok się odwołuje (klikalny w UI). */
  ref?: string
  /** Dodatkowy komentarz / przyjęte założenie. */
  note?: string
}

/** Wynik dowolnego typu z trace. */
export interface Traced<T> {
  value: T
  trace: TraceStep[]
}

/** Wynik liczbowy z jednostką i trace. */
export interface Computed extends Traced<number> {
  unit: string
}

const EPS = 1e-9

/** Usuwa szum zmiennoprzecinkowy (dokładność 0,001 mm dla metrów). */
export function clean(x: number): number {
  const r = Math.round(x * 1e6) / 1e6
  return Object.is(r, -0) ? 0 : r
}

/** floor odporny na szum, np. floor(11,9999999999) → 12. */
export function floorSafe(x: number): number {
  return Math.floor(x + EPS)
}

/** ceil odporny na szum, np. ceil(12,0000000001) → 12. */
export function ceilSafe(x: number): number {
  return Math.ceil(x - EPS)
}

/**
 * Liczba w formacie polskim: przecinek dziesiętny, spacja tysięcy,
 * do `maxDecimals` miejsc po przecinku, bez zbędnych zer na końcu.
 */
export function fmt(x: number, maxDecimals = 3): string {
  const rounded = Number(x.toFixed(maxDecimals))
  const v = Object.is(rounded, -0) ? 0 : rounded
  const negative = v < 0
  const [intPart, decPart] = Math.abs(v).toFixed(maxDecimals).split('.')
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  const dec = decPart ? decPart.replace(/0+$/, '') : ''
  return (negative ? '−' : '') + grouped + (dec ? ',' + dec : '')
}

/** Jak fmt, ale ujemne w nawiasie — do wstawiania w wyrażenia („2,89 − (−0,23)”). */
export function fmtP(x: number, maxDecimals = 3): string {
  const s = fmt(x, maxDecimals)
  return s.startsWith('−') ? `(${s})` : s
}

/** Rzędna ze znakiem: +2,89 / −0,23 / ±0. */
export function fmtLevel(x: number, maxDecimals = 3): string {
  const s = fmt(x, maxDecimals)
  if (s === '0') return '±0'
  return s.startsWith('−') ? s : '+' + s
}

/** Tekstowa postać trace (do podglądu, testów i eksportu). */
export function renderTrace(steps: TraceStep[]): string {
  return steps
    .map((s, i) => {
      const res = typeof s.result === 'number' ? `${fmt(s.result)} ${s.unit}`.trim() : s.result
      let line = `${i + 1}. ${s.label}: ${s.formula} = ${s.values} = ${res}`
      if (s.ref) line += `  [→ ${s.ref}]`
      if (s.note) line += `\n   (${s.note})`
      return line
    })
    .join('\n')
}
