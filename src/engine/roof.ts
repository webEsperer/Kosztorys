// Dach dwuspadowy na prostokącie + dobudowane daszki dwuspadowe połączone koszowo.
// Liczymy w rzucie z góry: pow. połaci = pow. rzutu / cos(kąt). Wymiary w metrach, kąty w stopniach.

import { type TraceStep, clean, fmt } from './trace'

export interface Dormer {
  id: string
  /** Szerokość daszku w rzucie (z okapami szczytowymi daszku) [m]. */
  b: number
  /** Wysięg poza linię okapu głównego (poziomo) [m]. */
  w: number
  /** Kąt nachylenia daszku [°]. */
  betaDeg: number
  /** Różnica wysokości okapu daszku względem okapu głównego [m] (dodatnia = wyżej). */
  dh: number
  /** Strona okapowa budynku. */
  side: 'przód' | 'tył'
  /** Odległość daszku od narożnika (do kontroli kolizji) [m]. */
  position: number
  /** Szczyt daszku: EPS jak ściany albo jak szczyty główne (wełna + boazeria). */
  gableFinish: 'EPS' | 'boazeria'
  /** Szerokość ściany szczytowej daszku (bez okapów) [m] — do elewacji. */
  wallWidth?: number
}

export interface RoofInput {
  /** Wymiary zewnętrzne budynku z izolacją [m]. */
  outerLength: number
  outerWidth: number
  /** Kalenica równolegle do dłuższego boku (domyślnie) albo krótszego. */
  ridgeAlongLonger: boolean
  pitchDeg: number
  /** Okap boczny i szczytowy, poziomo od lica gotowego EPS [m]. */
  eaveOverhang: number
  gableOverhang: number
  dormers: Dormer[]
}

export interface DormerResult {
  id: string
  x0: number
  d: number
  T: number
  area: number
  /** Długość jednego kosza (bez odcinka x0). */
  valley: number
  /** Łączna długość obu koszy (z odcinkami x0 dla Δh > 0). */
  valleysTotal: number
  ridge: number
  /** Okapy daszku (oba). */
  eaves: number
  /** Wiatrownice / dachówki krawędziowe daszku. */
  verges: number
  /** Trójkąt szczytu daszku (bez okapów) [m²] — do elewacji; null gdy brak szerokości ściany. */
  gableArea: number | null
  trace: TraceStep[]
}

export interface RoofResult {
  /** Długość połaci (okap → kalenica) s. */
  slope: number
  /** Długość kalenicy / okapu R. */
  ridgeLength: number
  /** Szerokość budynku prostopadle do kalenicy B_z. */
  span: number
  /** Długość budynku wzdłuż kalenicy L_z. */
  length: number
  /** Rzut połaci głównych [m²] (przed odjęciem daszków). */
  mainPlan: number
  /** Powierzchnia połaci głównych po odjęciu przejętych trójkątów [m²]. */
  mainArea: number
  dormers: DormerResult[]
  /** Daszki z Δh < 0 — do ręcznego podania. */
  manualDormers: string[]
  totalArea: number
  /** Okapy łącznie (główny skrócony o b daszków + okapy daszków). */
  eavesLength: number
  /** Wiatrownice łącznie (4 × s + daszki). */
  vergesLength: number
  /** Kalenice łącznie (główna + daszki). */
  ridgesLength: number
  /** Kosze łącznie. */
  valleysLength: number
  /** Wysokość kalenicy nad okapem (bez grubości pokrycia) [m]. */
  ridgeRise: number
  trace: TraceStep[]
}

const rad = (deg: number) => (deg * Math.PI) / 180

/** Daszek: x0, d, T, powierzchnia, kosze, kalenica, okapy, wiatrownice. */
export function computeDormer(alphaDeg: number, dm: Dormer): DormerResult {
  if (!(dm.b > 0 && dm.w >= 0)) throw new Error(`Daszek ${dm.id}: podaj szerokość b > 0 i wysięg w ≥ 0.`)
  if (!(dm.betaDeg > 0 && dm.betaDeg < 90)) throw new Error(`Daszek ${dm.id}: kąt β musi być między 0 a 90°.`)
  if (dm.dh < 0) throw new Error(`Daszek ${dm.id}: Δh < 0 — podaj powierzchnię i kosze ręcznie.`)
  const ta = Math.tan(rad(alphaDeg))
  const tb = Math.tan(rad(dm.betaDeg))
  const h2 = dm.b / 2
  const x0 = clean(dm.dh / ta)
  const d = clean((h2 * tb) / ta)
  const T = clean(dm.b * x0 + (dm.b * d) / 2)
  const area = clean((dm.b * dm.w + T) / Math.cos(rad(dm.betaDeg)))
  const valley = clean(Math.sqrt(h2 * h2 + d * d + (h2 * tb) ** 2))
  const valleysTotal = clean(2 * (valley + x0))
  const ridge = clean(dm.w + x0 + d)
  const eaves = clean(2 * (dm.w + x0))
  const verges = clean((2 * h2) / Math.cos(rad(dm.betaDeg)))
  const gableArea = dm.wallWidth ? clean(((dm.wallWidth * dm.wallWidth) / 4) * tb) : null
  const n = `Daszek ${dm.id}`
  const trace: TraceStep[] = [
    { label: `${n}: początek koszy za okapem`, formula: 'x0 = Δh / tan α', values: `${fmt(dm.dh)} / tan ${fmt(alphaDeg)}°`, result: x0, unit: 'm' },
    { label: `${n}: wejście kalenicy w połać`, formula: 'd = (b/2) · tan β / tan α', values: `${fmt(h2)} × tan ${fmt(dm.betaDeg)}° / tan ${fmt(alphaDeg)}°`, result: d, unit: 'm' },
    { label: `${n}: rzut przejęty z połaci głównej`, formula: 'T = b · x0 + b · d / 2', values: `${fmt(dm.b)} × ${fmt(x0)} + ${fmt(dm.b)} × ${fmt(d)} / 2`, result: T, unit: 'm²' },
    { label: `${n}: powierzchnia daszku`, formula: 'A = (b · w + T) / cos β', values: `(${fmt(dm.b)} × ${fmt(dm.w)} + ${fmt(T)}) / cos ${fmt(dm.betaDeg)}°`, result: area, unit: 'm²' },
    { label: `${n}: kosz (każdy z 2)`, formula: '√((b/2)² + d² + ((b/2)·tan β)²)', values: `√(${fmt(h2)}² + ${fmt(d)}² + ${fmt(h2 * tb)}²)`, result: valley, unit: 'm' },
    { label: `${n}: kalenica daszku`, formula: 'w + x0 + d', values: `${fmt(dm.w)} + ${fmt(x0)} + ${fmt(d)}`, result: ridge, unit: 'm' },
    { label: `${n}: okapy daszku`, formula: '2 × (w + x0)', values: `2 × (${fmt(dm.w)} + ${fmt(x0)})`, result: eaves, unit: 'm' },
    { label: `${n}: wiatrownice daszku`, formula: '2 × (b/2) / cos β', values: `2 × ${fmt(h2)} / cos ${fmt(dm.betaDeg)}°`, result: verges, unit: 'm' },
  ]
  if (x0 > 0) trace.splice(5, 0, { label: `${n}: kosze z odcinkami x0`, formula: '2 × (kosz + x0)', values: `2 × (${fmt(valley)} + ${fmt(x0)})`, result: valleysTotal, unit: 'm' })
  return { id: dm.id, x0, d, T, area, valley, valleysTotal, ridge, eaves, verges, gableArea, trace }
}

export function computeRoof(i: RoofInput): RoofResult {
  if (!(i.pitchDeg > 0 && i.pitchDeg < 90)) throw new Error('Kąt dachu musi być między 0 a 90°.')
  if (!(i.eaveOverhang >= 0 && i.gableOverhang >= 0)) throw new Error('Okapy nie mogą być ujemne.')
  const longer = Math.max(i.outerLength, i.outerWidth)
  const shorter = Math.min(i.outerLength, i.outerWidth)
  const length = i.ridgeAlongLonger ? longer : shorter
  const span = i.ridgeAlongLonger ? shorter : longer
  const a = rad(i.pitchDeg)
  const run = clean(span / 2 + i.eaveOverhang)
  const slope = clean(run / Math.cos(a))
  const ridgeLength = clean(length + 2 * i.gableOverhang)
  const mainPlan = clean(2 * run * ridgeLength)
  const trace: TraceStep[] = [
    { label: 'Połać — długość okap → kalenica', formula: 's = (B_z/2 + okap boczny) / cos α', values: `(${fmt(span)} / 2 + ${fmt(i.eaveOverhang)}) / cos ${fmt(i.pitchDeg)}°`, result: slope, unit: 'm' },
    { label: 'Długość kalenicy / okapu', formula: 'R = L_z + 2 × okap szczytowy', values: `${fmt(length)} + 2 × ${fmt(i.gableOverhang)}`, result: ridgeLength, unit: 'm' },
  ]

  const dormers: DormerResult[] = []
  const manualDormers: string[] = []
  for (const dm of i.dormers) {
    if (dm.dh < 0) {
      manualDormers.push(dm.id)
      continue
    }
    const r = computeDormer(i.pitchDeg, dm)
    dormers.push(r)
    trace.push(...r.trace)
  }
  const sumT = clean(dormers.reduce((s, d) => s + d.T, 0))
  const mainArea = clean((mainPlan - sumT) / Math.cos(a))
  trace.push(
    dormers.length
      ? { label: 'Połacie główne', formula: 'A = (2 · s_rzut · R − Σ T) / cos α', values: `(${fmt(mainPlan)} − ${fmt(sumT)}) / cos ${fmt(i.pitchDeg)}°`, result: mainArea, unit: 'm²' }
      : { label: 'Połacie główne', formula: 'A = 2 × s × R', values: `2 × ${fmt(slope)} × ${fmt(ridgeLength)}`, result: mainArea, unit: 'm²' },
  )
  const totalArea = clean(mainArea + dormers.reduce((s, d) => s + d.area, 0))
  if (dormers.length) {
    trace.push({ label: 'Dach razem', formula: 'A_główna + Σ A_daszków', values: `${fmt(mainArea)} + ${dormers.map((d) => fmt(d.area)).join(' + ')}`, result: totalArea, unit: 'm²' })
  }
  const sumB = clean(i.dormers.filter((d) => d.dh >= 0).reduce((s, d) => s + d.b, 0))
  const eavesLength = clean(2 * ridgeLength - sumB + dormers.reduce((s, d) => s + d.eaves, 0))
  const vergesLength = clean(4 * slope + dormers.reduce((s, d) => s + d.verges, 0))
  const ridgesLength = clean(ridgeLength + dormers.reduce((s, d) => s + d.ridge, 0))
  const valleysLength = clean(dormers.reduce((s, d) => s + d.valleysTotal, 0))
  trace.push(
    { label: 'Okapy łącznie', formula: '2R − Σ b + Σ okapy daszków', values: `2 × ${fmt(ridgeLength)} − ${fmt(sumB)} + ${fmt(eavesLength - 2 * ridgeLength + sumB)}`, result: eavesLength, unit: 'm' },
    { label: 'Wiatrownice łącznie', formula: '4 × s + Σ daszków', values: `4 × ${fmt(slope)}${dormers.length ? ` + ${dormers.map((d) => fmt(d.verges)).join(' + ')}` : ''}`, result: vergesLength, unit: 'm' },
  )
  return {
    slope,
    ridgeLength,
    span,
    length,
    mainPlan,
    mainArea,
    dormers,
    manualDormers,
    totalArea,
    eavesLength,
    vergesLength,
    ridgesLength,
    valleysLength,
    ridgeRise: clean(run * Math.tan(a)),
    trace,
  }
}

/** Liczba wiązarów z rozstawu: ⌈L_z / rozstaw⌉ + 1. */
export function trussCount(length: number, spacing: number): { value: number; trace: TraceStep[] } {
  const value = Math.ceil(length / spacing - 1e-9) + 1
  return {
    value,
    trace: [{ label: 'Liczba wiązarów', formula: '⌈L_z / rozstaw⌉ + 1', values: `⌈${fmt(length)} / ${fmt(spacing)}⌉ + 1`, result: value, unit: 'szt' }],
  }
}
