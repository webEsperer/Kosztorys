// Zbrojenie elementów liniowych (ławy, wieniec fundamentowy, wieniec ścian).
// UWAGA (do UI): zbrojenie przyjęte orientacyjnie, ostateczne wg projektu konstruktora.
// Wymiary w metrach, średnice w mm, kwoty w groszach.

import { type CostLine, type Grosze, costLine, sumCosts } from './money'
import { type TraceStep, ceilSafe, clean, floorSafe, fmt } from './trace'
import { GEOMETRY_REFS } from './geometry'

export const REBAR_WARNING = 'Zbrojenie przyjęte orientacyjnie, ostateczne wg projektu konstruktora.'

/** Masa 1 mb pręta [kg/m] wg średnicy [mm]. */
export const DEFAULT_REBAR_MASS: Record<number, number> = {
  6: 0.222,
  8: 0.395,
  10: 0.617,
  12: 0.888,
}

export interface RebarElementParams {
  /** Szerokość przekroju b [m]. */
  width: number
  /** Wysokość przekroju h [m]. */
  height: number
  /** Otulina c [m]. */
  cover: number
  /** Liczba prętów podłużnych. */
  longitudinalCount: number
  /** Średnica prętów podłużnych [mm]. */
  longitudinalDiameter: number
  /** Średnica strzemion [mm]. */
  stirrupDiameter: number
  /** Rozstaw strzemion [m]. */
  stirrupSpacing: number
  /** Długość haka strzemienia [m] (2 haki na strzemię). */
  stirrupHook: number
  /** Długość handlowa pręta [m]. */
  barLength: number
  /** Długość zakładu [m]. */
  lapLength: number
  /** Liczba naroży (prostokąt: 4). */
  corners: number
  /** Dodatkowe pręty narożne „L” — sztuk na naroże. */
  cornerBarsPerCorner: number
  /** Długość pręta narożnego [m]. */
  cornerBarLength: number
  /** Masy kg/m wg średnicy. */
  massPerMeter: Record<number, number>
}

const COMMON = {
  longitudinalCount: 4,
  longitudinalDiameter: 12,
  stirrupDiameter: 6,
  stirrupHook: 0.08,
  barLength: 12,
  lapLength: 0.6,
  corners: 4,
  cornerBarsPerCorner: 4,
  cornerBarLength: 1.2,
  massPerMeter: DEFAULT_REBAR_MASS,
}

/** Ławy: 4 × Ø12, Ø6 co 30 cm, otulina 5 cm. Przekrój ławy podaje użytkownik. */
export function defaultFootingRebar(width: number, height: number): RebarElementParams {
  return { ...COMMON, width, height, cover: 0.05, stirrupSpacing: 0.3 }
}

/** Wieniec (fundamentowy lub ścian): 4 × Ø12, Ø6 co 25 cm, otulina 3 cm. */
export function defaultRingBeamRebar(width: number, height: number): RebarElementParams {
  return { ...COMMON, width, height, cover: 0.03, stirrupSpacing: 0.25 }
}

/** Zestawienie dla jednej średnicy. */
export interface RebarByDiameter {
  diameter: number
  /** Liczba prętów handlowych do zakupu. */
  bars: number
  /** mb do zakupu (pręty × długość handlowa). */
  meters: number
  /** Masa do zakupu [kg]. */
  massKg: number
}

export interface RebarElementResult {
  name: string
  lineLength: number
  /** Odcinki (pręty handlowe) na jedną linię prętów podłużnych. */
  segmentsPerLine: number
  longitudinalBars: number
  cornerPieces: number
  cornerBars: number
  stirrupLength: number
  stirrupCount: number
  stirrupNetMeters: number
  stirrupBars: number
  /** Zestawienie zakupowe wg średnic. */
  byDiameter: RebarByDiameter[]
  totalMassKg: number
  trace: TraceStep[]
}

function assertPositive(name: string, x: number): void {
  if (!(x > 0)) throw new Error(`${name} musi być większe od zera (podano ${x}).`)
}

function massOf(params: RebarElementParams, diameter: number): number {
  const m = params.massPerMeter[diameter]
  if (!(m > 0)) throw new Error(`Brak masy 1 mb dla pręta Ø${diameter}.`)
  return m
}

/**
 * Zbrojenie elementu liniowego o długości `lineLength` (obwód w osi elementu).
 * Masa liczona z długości zakupowej (całe pręty handlowe) — tyle waży stal na wadze w składzie.
 */
export function computeRebarElement(name: string, lineLength: number, p: RebarElementParams): RebarElementResult {
  assertPositive('Długość linii', lineLength)
  assertPositive('Długość pręta handlowego', p.barLength)
  assertPositive('Rozstaw strzemion', p.stirrupSpacing)
  if (!(p.lapLength >= 0 && p.lapLength < p.barLength)) {
    throw new Error(`Zakład musi być mniejszy od długości pręta (podano ${p.lapLength}).`)
  }
  const trace: TraceStep[] = []
  const D = p.longitudinalDiameter
  const d = p.stirrupDiameter

  // 1. Pręty podłużne
  const effective = clean(p.barLength - p.lapLength)
  const segmentsPerLine = ceilSafe(lineLength / effective)
  trace.push({
    label: `Pręty Ø${D} na jedną linię`,
    formula: 'n = ⌈L / (l_pręta − zakład)⌉',
    values: `⌈${fmt(lineLength)} / (${fmt(p.barLength)} − ${fmt(p.lapLength)})⌉ = ⌈${fmt(lineLength / effective)}⌉`,
    result: segmentsPerLine,
    unit: 'szt',
    ref: GEOMETRY_REFS.axisPerimeter,
  })
  const longitudinalBars = segmentsPerLine * p.longitudinalCount
  trace.push({
    label: `Pręty podłużne Ø${D}`,
    formula: 'n_podł = n × liczba linii',
    values: `${segmentsPerLine} × ${p.longitudinalCount}`,
    result: longitudinalBars,
    unit: 'szt',
  })

  // 2. Pręty narożne „L”
  const cornerPieces = p.corners * p.cornerBarsPerCorner
  let cornerBars = 0
  if (cornerPieces > 0) {
    assertPositive('Długość pręta narożnego', p.cornerBarLength)
    const perBar = floorSafe(p.barLength / p.cornerBarLength)
    if (perBar < 1) throw new Error('Pręt narożny dłuższy niż pręt handlowy.')
    cornerBars = ceilSafe(cornerPieces / perBar)
    trace.push({
      label: `Pręty narożne „L” Ø${D}`,
      formula: 'k = naroża × szt/naroże; pręty = ⌈k / ⌊l_pręta / l_L⌋⌉',
      values: `${p.corners} × ${p.cornerBarsPerCorner} = ${cornerPieces} szt po ${fmt(p.cornerBarLength)} m; ⌈${cornerPieces} / ⌊${fmt(p.barLength)} / ${fmt(p.cornerBarLength)}⌋⌉ = ⌈${cornerPieces} / ${perBar}⌉`,
      result: cornerBars,
      unit: 'szt',
    })
  }

  // 3. Strzemiona
  const inW = clean(p.width - 2 * p.cover)
  const inH = clean(p.height - 2 * p.cover)
  if (!(inW > 0 && inH > 0)) throw new Error('Otulina za duża w stosunku do przekroju elementu.')
  const stirrupLength = clean(2 * inW + 2 * inH + 2 * p.stirrupHook)
  trace.push({
    label: `Długość strzemienia Ø${d}`,
    formula: 'l_s = 2·(b − 2c) + 2·(h − 2c) + 2 × hak',
    values: `2 × (${fmt(p.width)} − 2 × ${fmt(p.cover)}) + 2 × (${fmt(p.height)} − 2 × ${fmt(p.cover)}) + 2 × ${fmt(p.stirrupHook)}`,
    result: stirrupLength,
    unit: 'm',
  })
  const stirrupCount = ceilSafe(lineLength / p.stirrupSpacing) + 1
  trace.push({
    label: 'Liczba strzemion',
    formula: 'n_s = ⌈L / rozstaw⌉ + 1',
    values: `⌈${fmt(lineLength)} / ${fmt(p.stirrupSpacing)}⌉ + 1 = ⌈${fmt(lineLength / p.stirrupSpacing)}⌉ + 1`,
    result: stirrupCount,
    unit: 'szt',
  })
  const stirrupNetMeters = clean(stirrupCount * stirrupLength)
  trace.push({
    label: 'Długość strzemion (netto)',
    formula: 'n_s × l_s',
    values: `${stirrupCount} × ${fmt(stirrupLength)}`,
    result: stirrupNetMeters,
    unit: 'm',
  })
  const stirrupsPerBar = floorSafe(p.barLength / stirrupLength)
  if (stirrupsPerBar < 1) throw new Error('Strzemię dłuższe niż pręt handlowy.')
  const stirrupBars = ceilSafe(stirrupCount / stirrupsPerBar)
  trace.push({
    label: `Pręty Ø${d} na strzemiona`,
    formula: '⌈n_s / ⌊l_pręta / l_s⌋⌉',
    values: `⌈${stirrupCount} / ⌊${fmt(p.barLength)} / ${fmt(stirrupLength)}⌋⌉ = ⌈${stirrupCount} / ${stirrupsPerBar}⌉`,
    result: stirrupBars,
    unit: 'szt',
    note: 'reszty z prętów (krótsze niż strzemię) traktowane jako odpad',
  })

  // 4. Zestawienie wg średnic + masa
  const counts = new Map<number, number>()
  counts.set(D, longitudinalBars + cornerBars)
  counts.set(d, (counts.get(d) ?? 0) + stirrupBars)
  const byDiameter: RebarByDiameter[] = [...counts.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([diameter, bars]) => {
      const meters = clean(bars * p.barLength)
      const kgPerM = massOf(p, diameter)
      const massKg = clean(meters * kgPerM)
      trace.push({
        label: `Masa Ø${diameter}`,
        formula: 'm = pręty × l_pręta × kg/m',
        values: `${bars} × ${fmt(p.barLength)} × ${fmt(kgPerM)}`,
        result: massKg,
        unit: 'kg',
      })
      return { diameter, bars, meters, massKg }
    })
  const totalMassKg = clean(byDiameter.reduce((s, x) => s + x.massKg, 0))
  trace.push({
    label: `Masa stali — ${name}`,
    formula: 'Σ m',
    values: byDiameter.map((x) => fmt(x.massKg)).join(' + '),
    result: totalMassKg,
    unit: 'kg',
  })

  return {
    name,
    lineLength,
    segmentsPerLine,
    longitudinalBars,
    cornerPieces,
    cornerBars,
    stirrupLength,
    stirrupCount,
    stirrupNetMeters,
    stirrupBars,
    byDiameter,
    totalMassKg,
    trace,
  }
}

// ─── Koszt ──────────────────────────────────────────────────────────────────

export type RebarPriceBasis = 'kg' | 't' | 'pręt'

export interface RebarPricing {
  basis: RebarPriceBasis
  /** Cena wg średnicy, w jednostce `basis` (`null` = uzupełnij). */
  prices: Record<number, Grosze | null>
  /** Drut wiązałkowy: % masy stali (`null` = uzupełnij). */
  tieWirePercent: number | null
  tieWirePricePerKgGrosze: Grosze | null
}

export interface RebarCostResult {
  lines: CostLine[]
  tieWireKg: number | null
  totalGrosze: Grosze
  complete: boolean
}

export function computeRebarCost(r: RebarElementResult, pricing: RebarPricing): RebarCostResult {
  const lines: CostLine[] = r.byDiameter.map((x) => {
    const price = pricing.prices[x.diameter] ?? null
    const label = `Stal Ø${x.diameter} — ${r.name}`
    if (pricing.basis === 'pręt') return costLine(label, x.bars, 'szt', price, 'pręt')
    if (pricing.basis === 't') return costLine(label, clean(x.massKg / 1000), 't', price)
    return costLine(label, x.massKg, 'kg', price)
  })

  const pct = pricing.tieWirePercent
  const tieWireKg = pct === null ? null : clean(r.totalMassKg * (pct / 100))
  const wire = costLine(`Drut wiązałkowy — ${r.name}`, tieWireKg, 'kg', pricing.tieWirePricePerKgGrosze)
  wire.trace.unshift({
    label: 'Drut wiązałkowy',
    formula: 'm_d = m_stali × %',
    values: pct === null ? `${fmt(r.totalMassKg)} kg × ?%` : `${fmt(r.totalMassKg)} × ${fmt(pct)}%`,
    result: tieWireKg === null ? 'uzupełnij %' : tieWireKg,
    unit: tieWireKg === null ? '' : 'kg',
  })
  lines.push(wire)

  const { total, complete } = sumCosts(lines)
  return { lines, tieWireKg, totalGrosze: total, complete }
}
