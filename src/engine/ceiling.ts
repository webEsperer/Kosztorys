// Sufit podwieszany krzyżowy GK (CLAUDE.md „Sufit podwieszany krzyżowy GK + ocieplenie”).
// Prostokąt: profile główne równolegle do długości L, nośne równolegle do szerokości B. Wymiary w metrach.

import { type Computed, ceilSafe, clean, fmt } from './trace'

export interface CeilingInput {
  /** Wymiary wnętrza (prostokąt) [m]. */
  length: number
  width: number
  /** Rozstaw profili głównych (domyślnie 1,0) i nośnych (0,5) [m]. */
  mainSpacing: number
  carrierSpacing: number
}

export interface CeilingResult {
  area: Computed
  mainMb: Computed
  carrierMb: Computed
  hangers: Computed
  crossConnectors: Computed
  /** Łączniki wzdłużne (wymagają długości profilu). */
  lengthConnectors: (profileLength: number) => Computed
  /** Liczba profili CD60 danej długości. */
  profiles: (mb: number, profileLength: number, label: string) => Computed
}

const c = (label: string, formula: string, values: string, value: number, unit: string): Computed => {
  const v = clean(value)
  return { value: v, unit, trace: [{ label, formula, values, result: v, unit }] }
}

export function computeCeiling(i: CeilingInput): CeilingResult {
  const A = clean(i.length * i.width)
  const area = c('Powierzchnia sufitu', 'A = L × B', `${fmt(i.length)} × ${fmt(i.width)}`, A, 'm²')
  const mainMb = c('Profile CD60 główne', 'A / rozstaw główne', `${fmt(A)} / ${fmt(i.mainSpacing)}`, A / i.mainSpacing, 'm')
  const carrierMb = c('Profile CD60 nośne', 'A / rozstaw nośne', `${fmt(A)} / ${fmt(i.carrierSpacing)}`, A / i.carrierSpacing, 'm')
  const hangers = c('Wieszaki', '⌈A / (rozstaw główne × 0,9)⌉', `⌈${fmt(A)} / (${fmt(i.mainSpacing)} × 0,9)⌉`, ceilSafe(A / (i.mainSpacing * 0.9)), 'szt')
  const crossConnectors = c('Łączniki krzyżowe', '⌈A / (rozstaw główne × rozstaw nośne)⌉', `⌈${fmt(A)} / (${fmt(i.mainSpacing)} × ${fmt(i.carrierSpacing)})⌉`, ceilSafe(A / (i.mainSpacing * i.carrierSpacing)), 'szt')
  const lengthConnectors = (pl: number): Computed => {
    const rowsMain = ceilSafe(i.width / i.mainSpacing)
    const rowsCarrier = ceilSafe(i.length / i.carrierSpacing)
    const jMain = Math.max(0, ceilSafe(i.length / pl) - 1)
    const jCarrier = Math.max(0, ceilSafe(i.width / pl) - 1)
    const n = rowsMain * jMain + rowsCarrier * jCarrier
    return c(
      'Łączniki wzdłużne',
      '⌈B / s_gł⌉ × (⌈L / l_prof⌉ − 1) + ⌈L / s_noś⌉ × (⌈B / l_prof⌉ − 1)',
      `${rowsMain} × ${jMain} + ${rowsCarrier} × ${jCarrier}`,
      n,
      'szt',
    )
  }
  const profiles = (mb: number, pl: number, label: string): Computed => c(label, '⌈mb / dł. profilu⌉', `⌈${fmt(mb)} / ${fmt(pl)}⌉`, ceilSafe(mb / pl), 'szt')
  return { area, mainMb, carrierMb, hangers, crossConnectors, lengthConnectors, profiles }
}
