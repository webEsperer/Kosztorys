// Betonowania: ławy, wieniec fundamentowy, chudziak, wieniec ścian.
// Każde betonowanie ma osobno: objętość (+ naddatek), klasę, cenę betonu, transport, pompę.
// Wymiary w metrach, kwoty w groszach.

import { type CostLine, type Grosze, costLine, formatPLN, sumCosts } from './money'
import { type Computed, type TraceStep, type Traced, ceilSafe, clean, fmt } from './trace'
import { GEOMETRY_REFS } from './geometry'

// ─── Objętości elementów ────────────────────────────────────────────────────

function assertPositive(name: string, x: number): void {
  if (!(x > 0)) throw new Error(`${name} musi być większe od zera (podano ${x}).`)
}

/** Element liniowy (ława, wieniec): V = L × b × h, L = obwód w osi. */
export function linearElementVolume(label: string, length: number, width: number, height: number): Computed {
  assertPositive('Długość elementu', length)
  assertPositive('Szerokość elementu', width)
  assertPositive('Wysokość elementu', height)
  const value = clean(length * width * height)
  return {
    value,
    unit: 'm³',
    trace: [
      {
        label: `Objętość — ${label}`,
        formula: 'V = P_oś × b × h',
        values: `${fmt(length)} × ${fmt(width)} × ${fmt(height)}`,
        result: value,
        unit: 'm³',
        ref: GEOMETRY_REFS.axisPerimeter,
      },
    ],
  }
}

/** Płyta (chudziak): V = A × grubość. */
export function slabVolume(label: string, area: number, thickness: number): Computed {
  assertPositive('Powierzchnia płyty', area)
  assertPositive('Grubość płyty', thickness)
  const value = clean(area * thickness)
  return {
    value,
    unit: 'm³',
    trace: [
      {
        label: `Objętość — ${label}`,
        formula: 'V = A_wew × g',
        values: `${fmt(area)} × ${fmt(thickness)}`,
        result: value,
        unit: 'm³',
        ref: GEOMETRY_REFS.interiorArea,
      },
    ],
  }
}

// ─── Parametry betonowania ──────────────────────────────────────────────────

export type ConcreteTransport =
  /** Transport wliczony w cenę betonu. */
  | { mode: 'included' }
  /** Transport za m³ zamówionego betonu. */
  | { mode: 'perM3'; pricePerM3Grosze: Grosze | null }
  /** Transport za kurs: kursy = ⌈V / pojemność gruszki⌉. */
  | { mode: 'perTrip'; truckCapacityM3: number; pricePerTripGrosze: Grosze | null }

export interface ConcretePump {
  enabled: boolean
  /** Ryczałt za podjazd pompy. */
  setupGrosze: Grosze | null
  /** Opcjonalnie: dopłata za m³ pompowanego betonu. */
  perM3Grosze?: Grosze | null
  /** Opcjonalnie: cena za godzinę pracy pompy… */
  perHourGrosze?: Grosze | null
  /** …i liczba godzin (podaje użytkownik). */
  hours?: number | null
}

/** Włókna zbrojące kupowane osobno (np. do chudziaka). */
export interface ConcreteFibers {
  enabled: boolean
  /** Dozowanie kg/m³ — z karty producenta włókien (`null` = uzupełnij). */
  kgPerM3: number | null
  pricePerKgGrosze: Grosze | null
}

export interface ConcretePourParams {
  /** Naddatek objętości [%] (domyślnie 3). */
  extraPercent: number
  /** Klasa betonu — opis, np. „C20/25”. */
  concreteClass: string
  /** Cena betonu za m³ (brutto). */
  pricePerM3Grosze: Grosze | null
  transport: ConcreteTransport
  pump: ConcretePump
  fibers?: ConcreteFibers
}

export const DEFAULT_TRUCK_CAPACITY_M3 = 8
export const DEFAULT_CONCRETE_EXTRA_PERCENT = 3

export function defaultPourParams(concreteClass: string): ConcretePourParams {
  return {
    extraPercent: DEFAULT_CONCRETE_EXTRA_PERCENT,
    concreteClass,
    pricePerM3Grosze: null,
    transport: { mode: 'perTrip', truckCapacityM3: DEFAULT_TRUCK_CAPACITY_M3, pricePerTripGrosze: null },
    pump: { enabled: false, setupGrosze: null },
  }
}

// ─── Wynik betonowania ──────────────────────────────────────────────────────

export interface ConcretePourResult {
  name: string
  concreteClass: string
  /** Objętość geometryczna. */
  volume: Computed
  /** Objętość do zamówienia (z naddatkiem). */
  orderedVolume: Computed
  /** Liczba kursów gruszki (gdy transport za kurs). */
  trips: Traced<number> | null
  /** Masa włókien (gdy kupowane osobno). */
  fibersKg: Traced<number | null> | null
  lines: CostLine[]
  totalGrosze: Grosze
  /** false — któraś pozycja nie ma ceny lub ilości (lista „do uzupełnienia”). */
  complete: boolean
  trace: TraceStep[]
}

/** Pełne wyliczenie jednego betonowania: objętość, kursy, beton, transport, pompa, włókna. */
export function computeConcretePour(name: string, volume: Computed, p: ConcretePourParams): ConcretePourResult {
  if (!(p.extraPercent >= 0)) throw new Error(`Naddatek betonu nie może być ujemny (podano ${p.extraPercent}).`)

  const ordered = clean(volume.value * (1 + p.extraPercent / 100))
  const orderedVolume: Computed = {
    value: ordered,
    unit: 'm³',
    trace: [
      ...volume.trace,
      {
        label: 'Objętość do zamówienia',
        formula: 'V_z = V × (1 + naddatek)',
        values: `${fmt(volume.value)} × (1 + ${fmt(p.extraPercent)}%)`,
        result: ordered,
        unit: 'm³',
      },
    ],
  }

  const lines: CostLine[] = []
  lines.push(costLine(`Beton ${p.concreteClass}`, ordered, 'm³', p.pricePerM3Grosze))

  let trips: Traced<number> | null = null
  const t = p.transport
  if (t.mode === 'perM3') {
    lines.push(costLine('Transport betonu', ordered, 'm³', t.pricePerM3Grosze))
  } else if (t.mode === 'perTrip') {
    assertPositive('Pojemność gruszki', t.truckCapacityM3)
    const n = ceilSafe(ordered / t.truckCapacityM3)
    trips = {
      value: n,
      trace: [
        {
          label: 'Liczba kursów gruszki',
          formula: 'n = ⌈V_z / pojemność⌉',
          values: `⌈${fmt(ordered)} / ${fmt(t.truckCapacityM3)}⌉ = ⌈${fmt(ordered / t.truckCapacityM3)}⌉`,
          result: n,
          unit: 'kurs',
        },
      ],
    }
    const line = costLine('Transport betonu', n, 'kurs', t.pricePerTripGrosze)
    line.trace = [...trips.trace, ...line.trace]
    lines.push(line)
  }

  if (p.pump.enabled) {
    lines.push(costLine('Pompa — podjazd', 1, 'ryczałt', p.pump.setupGrosze))
    if (p.pump.perM3Grosze !== undefined) {
      lines.push(costLine('Pompa — za m³', ordered, 'm³', p.pump.perM3Grosze))
    }
    if (p.pump.perHourGrosze !== undefined) {
      lines.push(costLine('Pompa — godziny pracy', p.pump.hours ?? null, 'h', p.pump.perHourGrosze))
    }
  }

  let fibersKg: Traced<number | null> | null = null
  if (p.fibers?.enabled) {
    const kgPerM3 = p.fibers.kgPerM3
    const kg = kgPerM3 === null ? null : clean(ordered * kgPerM3)
    fibersKg = {
      value: kg,
      trace: [
        {
          label: 'Włókna zbrojące',
          formula: 'm = V_z × dozowanie',
          values: kgPerM3 === null ? `${fmt(ordered)} m³ × ? kg/m³` : `${fmt(ordered)} × ${fmt(kgPerM3)}`,
          result: kg === null ? 'uzupełnij dozowanie (karta producenta)' : kg,
          unit: kg === null ? '' : 'kg',
        },
      ],
    }
    const line = costLine('Włókna zbrojące', kg, 'kg', p.fibers.pricePerKgGrosze)
    line.trace = [...fibersKg.trace, ...line.trace]
    lines.push(line)
  }

  const { total, complete } = sumCosts(lines)
  const trace: TraceStep[] = [
    ...orderedVolume.trace,
    ...lines.flatMap((l) => l.trace),
    {
      label: `Razem — ${name}`,
      formula: 'Σ K',
      values: lines.map((l) => (l.costGrosze === null ? '?' : formatPLN(l.costGrosze))).join(' + '),
      result: complete ? formatPLN(total) : `${formatPLN(total)} (niepełne — uzupełnij ceny)`,
      unit: '',
    },
  ]

  return {
    name,
    concreteClass: p.concreteClass,
    volume,
    orderedVolume,
    trips,
    fibersKg,
    lines,
    totalGrosze: total,
    complete,
    trace,
  }
}
