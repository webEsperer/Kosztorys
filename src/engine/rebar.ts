// Zbrojenie elementów liniowych (ławy, wieniec fundamentowy, wieniec ścian) — wg wytycznych użytkownika:
//
// Pręty główne (Ø12):
//  • zakład wzdłużny 50d (Ø12 → 60 cm): na każdym boku (odcinku prostym) doliczany przy przekroczeniu
//    każdych l_pręta metrów: n_zakł = ⌈L_boku / l_pręta⌉ − 1 (część wspólna liczona raz, nie ×2);
//  • zakotwienie w narożu: każdy pręt dochodzący do naroża ma +50d (60 cm) zagięcia — 2 końce na bok;
//  • dodatkowo eLki w każdym narożu: ramiona 50d + 50d (120 cm), po jednej na każdy pręt główny (4 szt/róg).
// Strzemiona (Ø6):
//  • wymiar = przekrój − otulina z każdej strony (ława 5 cm, wieniec 3 cm);
//  • długość = obwód zredukowanego prostokąta + 14 cm na haki (zamki);
//  • rozstaw na odcinkach prostych 25 cm, w strefie 1 m od każdego rogu (w każdą stronę) co 10 cm.
// Zakup: suma metrów bieżących danej średnicy / długość pręta handlowego (6 m), zaokrąglone w górę.
//
// UWAGA (do UI): zbrojenie przyjęte orientacyjnie, ostateczne wg projektu konstruktora.
// Wymiary w metrach, średnice w mm, kwoty w groszach.

import { type CostLine, type Grosze, costLine, sumCosts } from './money'
import { type TraceStep, ceilSafe, clean, fmt } from './trace'
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
  /** Otulina c [m] (z każdej strony). */
  cover: number
  /** Liczba prętów głównych. */
  longitudinalCount: number
  /** Średnica prętów głównych [mm]. */
  longitudinalDiameter: number
  /** Krotność średnicy dla zakładu, zakotwienia i ramienia eLki (50 → 50d). */
  lapFactor: number
  /** Długość handlowa pręta [m] (skład: 6 m dla wszystkich średnic). */
  barLength: number
  /** eLki na róg (domyślnie = liczba prętów głównych). */
  cornerBarsPerCorner: number
  /** Średnica strzemion [mm]. */
  stirrupDiameter: number
  /** Rozstaw strzemion na odcinkach prostych [m]. */
  stirrupSpacing: number
  /** Długość strefy zagęszczenia od każdego rogu, w każdą stronę [m]. */
  cornerZoneLength: number
  /** Rozstaw strzemion w strefie naroża [m]. */
  cornerZoneSpacing: number
  /** Zapas na haki (zamki) na jedno strzemię, łącznie [m]. */
  stirrupHookAllowance: number
  /** Masy kg/m wg średnicy. */
  massPerMeter: Record<number, number>
}

const COMMON = {
  longitudinalCount: 4,
  longitudinalDiameter: 12,
  lapFactor: 50,
  barLength: 6,
  cornerBarsPerCorner: 4,
  stirrupDiameter: 6,
  stirrupSpacing: 0.25,
  cornerZoneLength: 1.0,
  cornerZoneSpacing: 0.1,
  stirrupHookAllowance: 0.14,
  massPerMeter: DEFAULT_REBAR_MASS,
}

/** Ława (na chudziaku): 4 × Ø12, Ø6 co 25 cm (naroża co 10 cm), otulina 5 cm. Przekrój podaje użytkownik. */
export function defaultFootingRebar(width: number, height: number): RebarElementParams {
  return { ...COMMON, width, height, cover: 0.05 }
}

/** Wieniec (fundamentowy lub ścian): 4 × Ø12, Ø6 co 25 cm (naroża co 10 cm), otulina 3 cm. */
export function defaultRingBeamRebar(width: number, height: number): RebarElementParams {
  return { ...COMMON, width, height, cover: 0.03 }
}

/** Zakład = zakotwienie = ramię eLki = 50d. */
export function lapLength(p: RebarElementParams): number {
  return clean((p.lapFactor * p.longitudinalDiameter) / 1000)
}

/** Zestawienie dla jednej średnicy. */
export interface RebarByDiameter {
  diameter: number
  /** mb wbudowane (suma wg reguł: pręty z zakładami i zakotwieniami, eLki, strzemiona). */
  netMeters: number
  /** Liczba prętów handlowych do zakupu: ⌈mb / l_pręta⌉. */
  bars: number
  /** mb do zakupu (pręty × długość handlowa). */
  meters: number
  /** Masa do zakupu [kg]. */
  massKg: number
}

export interface RebarSide {
  /** Długość boku w osi [m]. */
  length: number
  /** Liczba zakładów na boku. */
  laps: number
  /** Długość jednej linii pręta na boku: L + n_zakł × zakład + 2 × zakotwienie. */
  lineLength: number
  /** Położenia strzemion na boku (odległość od naroża początkowego, bez samych naroży). */
  stirrupPositions: number[]
}

export interface RebarElementResult {
  name: string
  barLength: number
  lap: number
  sides: RebarSide[]
  corners: number
  /** mb prętów głównych (bez eLek). */
  longitudinalNetMeters: number
  cornerPieces: number
  cornerPieceLength: number
  cornerNetMeters: number
  stirrupLength: number
  stirrupCount: number
  stirrupNetMeters: number
  byDiameter: RebarByDiameter[]
  totalMassKg: number
  trace: TraceStep[]
}

function assertPositive(name: string, x: number): void {
  if (!(x > 0)) throw new Error(`${name} musi być większe od zera (podano ${x}).`)
}

function massOf(p: RebarElementParams, diameter: number): number {
  const m = p.massPerMeter[diameter]
  if (!(m > 0)) throw new Error(`Brak masy 1 mb dla pręta Ø${diameter}.`)
  return m
}

/**
 * Położenia strzemion na jednym boku (bez naroży — strzemię w narożu liczone osobno, 1 na róg).
 * Strefy przy obu narożach: m = ⌈z / s_n⌉ strzemion równo do granicy strefy;
 * środek: ⌈L_śr / s⌉ − 1 strzemion równo między granicami stref.
 * Bok krótszy niż 2 strefy: cały co s_n.
 */
export function sideStirrupPositions(sideLength: number, p: RebarElementParams): number[] {
  const L = sideLength
  const z = p.cornerZoneLength
  const sz = p.cornerZoneSpacing
  const s = p.stirrupSpacing
  const out: number[] = []
  if (L <= 2 * z + 1e-9) {
    const n = ceilSafe(L / sz) - 1
    for (let k = 1; k <= n; k++) out.push(clean((L * k) / (n + 1)))
    return out
  }
  const m = ceilSafe(z / sz)
  for (let k = 1; k <= m; k++) out.push(clean((z * k) / m))
  const mid = L - 2 * z
  const nm = ceilSafe(mid / s) - 1
  for (let k = 1; k <= nm; k++) out.push(clean(z + (mid * k) / (nm + 1)))
  for (let k = m; k >= 1; k--) out.push(clean(L - (z * k) / m))
  return out
}

/**
 * Zbrojenie elementu liniowego biegnącego po zamkniętym obrysie o bokach `sides` (długości w osi).
 * Liczba naroży = liczba boków.
 */
export function computeRebarElement(name: string, sides: number[], p: RebarElementParams): RebarElementResult {
  if (sides.length < 3) throw new Error('Obrys musi mieć co najmniej 3 boki.')
  sides.forEach((L) => assertPositive('Długość boku', L))
  assertPositive('Długość pręta handlowego', p.barLength)
  assertPositive('Rozstaw strzemion', p.stirrupSpacing)
  assertPositive('Rozstaw strzemion w narożu', p.cornerZoneSpacing)
  const trace: TraceStep[] = []
  const D = p.longitudinalDiameter
  const d = p.stirrupDiameter
  const lap = lapLength(p)
  if (!(lap < p.barLength)) throw new Error('Zakład musi być krótszy od pręta handlowego.')

  trace.push({
    label: `Zakład / zakotwienie / ramię eLki Ø${D}`,
    formula: `${fmt(p.lapFactor)}d`,
    values: `${fmt(p.lapFactor)} × ${D} mm`,
    result: lap,
    unit: 'm',
  })

  // 1. Pręty główne — po bokach
  const corners = sides.length
  const sideResults: RebarSide[] = sides.map((L, i) => {
    const laps = ceilSafe(L / p.barLength) - 1
    const lineLength = clean(L + laps * lap + 2 * lap)
    trace.push({
      label: `Bok ${i + 1}: jedna linia Ø${D}`,
      formula: 'l = L + n_zakł × zakład + 2 × zakotwienie;  n_zakł = ⌈L / l_pręta⌉ − 1',
      values: `${fmt(L)} + ${laps} × ${fmt(lap)} + 2 × ${fmt(lap)}  (n_zakł = ⌈${fmt(L)} / ${fmt(p.barLength)}⌉ − 1 = ${laps})`,
      result: lineLength,
      unit: 'm',
      ref: GEOMETRY_REFS.axisPerimeter,
    })
    return { length: L, laps, lineLength, stirrupPositions: sideStirrupPositions(L, p) }
  })
  const perLine = clean(sideResults.reduce((a, s) => a + s.lineLength, 0))
  const longitudinalNetMeters = clean(perLine * p.longitudinalCount)
  trace.push({
    label: `Pręty główne Ø${D} — razem`,
    formula: 'Σ l_boków × liczba prętów',
    values: `${fmt(perLine)} × ${p.longitudinalCount}`,
    result: longitudinalNetMeters,
    unit: 'm',
  })

  // 2. eLki
  const cornerPieces = corners * p.cornerBarsPerCorner
  const cornerPieceLength = clean(2 * lap)
  const cornerNetMeters = clean(cornerPieces * cornerPieceLength)
  trace.push({
    label: `eLki narożne Ø${D}`,
    formula: 'naroża × szt/róg × 2 × 50d',
    values: `${corners} × ${p.cornerBarsPerCorner} × 2 × ${fmt(lap)}`,
    result: cornerNetMeters,
    unit: 'm',
  })

  // 3. Strzemiona
  const inW = clean(p.width - 2 * p.cover)
  const inH = clean(p.height - 2 * p.cover)
  if (!(inW > 0 && inH > 0)) throw new Error('Otulina za duża w stosunku do przekroju elementu.')
  const stirrupLength = clean(2 * inW + 2 * inH + p.stirrupHookAllowance)
  trace.push({
    label: `Długość strzemienia Ø${d}`,
    formula: 'l_s = 2·(b − 2c) + 2·(h − 2c) + zapas na haki',
    values: `2 × (${fmt(p.width)} − 2 × ${fmt(p.cover)}) + 2 × (${fmt(p.height)} − 2 × ${fmt(p.cover)}) + ${fmt(p.stirrupHookAllowance)}`,
    result: stirrupLength,
    unit: 'm',
  })
  sideResults.forEach((s, i) => {
    const zoneCount = s.length <= 2 * p.cornerZoneLength + 1e-9 ? 0 : ceilSafe(p.cornerZoneLength / p.cornerZoneSpacing)
    trace.push({
      label: `Bok ${i + 1}: strzemiona`,
      formula: zoneCount
        ? '2 × ⌈z / s_n⌉ + (⌈(L − 2z) / s⌉ − 1)'
        : '⌈L / s_n⌉ − 1 (bok krótszy niż 2 strefy naroży)',
      values: zoneCount
        ? `2 × ⌈${fmt(p.cornerZoneLength)} / ${fmt(p.cornerZoneSpacing)}⌉ + (⌈${fmt(s.length - 2 * p.cornerZoneLength)} / ${fmt(p.stirrupSpacing)}⌉ − 1)`
        : `⌈${fmt(s.length)} / ${fmt(p.cornerZoneSpacing)}⌉ − 1`,
      result: s.stirrupPositions.length,
      unit: 'szt',
    })
  })
  const stirrupCount = sideResults.reduce((a, s) => a + s.stirrupPositions.length, 0) + corners
  trace.push({
    label: 'Liczba strzemion',
    formula: 'Σ boki + 1 w każdym narożu',
    values: `${sideResults.map((s) => s.stirrupPositions.length).join(' + ')} + ${corners}`,
    result: stirrupCount,
    unit: 'szt',
    note: `strefy ${fmt(p.cornerZoneLength)} m od rogów co ${fmt(p.cornerZoneSpacing * 100)} cm, poza nimi co ${fmt(p.stirrupSpacing * 100)} cm`,
  })
  const stirrupNetMeters = clean(stirrupCount * stirrupLength)
  trace.push({
    label: `Strzemiona Ø${d} — razem`,
    formula: 'n_s × l_s',
    values: `${stirrupCount} × ${fmt(stirrupLength)}`,
    result: stirrupNetMeters,
    unit: 'm',
  })

  // 4. Zakup wg średnic: ⌈mb / l_pręta⌉
  const nets = new Map<number, number>()
  nets.set(D, clean(longitudinalNetMeters + cornerNetMeters))
  nets.set(d, clean((nets.get(d) ?? 0) + stirrupNetMeters))
  const byDiameter = [...nets.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([diameter, net]) => {
      const x = purchase(diameter, net, p.barLength, massOf(p, diameter))
      trace.push(...x.trace)
      return x.value
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
    barLength: p.barLength,
    lap,
    sides: sideResults,
    corners,
    longitudinalNetMeters,
    cornerPieces,
    cornerPieceLength,
    cornerNetMeters,
    stirrupLength,
    stirrupCount,
    stirrupNetMeters,
    byDiameter,
    totalMassKg,
    trace,
  }
}

function purchase(
  diameter: number,
  netMeters: number,
  barLength: number,
  kgPerM: number,
): { value: RebarByDiameter; trace: TraceStep[] } {
  const bars = ceilSafe(netMeters / barLength)
  const meters = clean(bars * barLength)
  const massKg = clean(meters * kgPerM)
  return {
    value: { diameter, netMeters, bars, meters, massKg },
    trace: [
      {
        label: `Ø${diameter} — pręty do kupienia`,
        formula: '⌈mb / l_pręta⌉',
        values: `⌈${fmt(netMeters)} / ${fmt(barLength)}⌉ = ⌈${fmt(netMeters / barLength)}⌉`,
        result: bars,
        unit: 'szt',
      },
      {
        label: `Masa Ø${diameter}`,
        formula: 'm = pręty × l_pręta × kg/m',
        values: `${bars} × ${fmt(barLength)} × ${fmt(kgPerM)}`,
        result: massKg,
        unit: 'kg',
      },
    ],
  }
}

// ─── Zestawienie zbiorcze (cała budowa) ─────────────────────────────────────

export interface RebarSummary {
  byDiameter: RebarByDiameter[]
  totalMassKg: number
  trace: TraceStep[]
}

/** Suma mb wg średnic ze wszystkich elementów, a z niej pręty do kupienia: ⌈Σ mb / l_pręta⌉. */
export function summarizeRebar(elements: RebarElementResult[], massPerMeter = DEFAULT_REBAR_MASS): RebarSummary {
  if (elements.length === 0) return { byDiameter: [], totalMassKg: 0, trace: [] }
  const barLength = elements[0].barLength
  if (elements.some((e) => e.barLength !== barLength)) throw new Error('Elementy mają różne długości prętów handlowych.')
  const nets = new Map<number, number[]>()
  for (const el of elements) for (const x of el.byDiameter) nets.set(x.diameter, [...(nets.get(x.diameter) ?? []), x.netMeters])
  const trace: TraceStep[] = []
  const byDiameter = [...nets.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([diameter, parts]) => {
      const net = clean(parts.reduce((a, b) => a + b, 0))
      trace.push({
        label: `Ø${diameter} — mb razem`,
        formula: 'Σ mb elementów',
        values: parts.map((x) => fmt(x)).join(' + '),
        result: net,
        unit: 'm',
      })
      const kg = massPerMeter[diameter]
      if (!(kg > 0)) throw new Error(`Brak masy 1 mb dla pręta Ø${diameter}.`)
      const x = purchase(diameter, net, barLength, kg)
      trace.push(...x.trace)
      return x.value
    })
  const totalMassKg = clean(byDiameter.reduce((s, x) => s + x.massKg, 0))
  return { byDiameter, totalMassKg, trace }
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

export function computeRebarCost(
  r: { name: string; byDiameter: RebarByDiameter[]; totalMassKg: number },
  pricing: RebarPricing,
): RebarCostResult {
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
