// Pozycje kosztorysu: model i uniwersalne liczenie ilość → odpad → opakowania → koszt (z trace).
// Definicje pozycji domyślnych są w engine/stages/*.ts; tu tylko wspólna mechanika.

import type { CutSegment, CuttingResult } from './cutting'
import { type Grosze, formatPLN, multiply } from './money'
import { type Computed, type TraceStep, ceilSafe, clean, fmt } from './trace'

export type Stage = 'SSO' | 'SSZ' | 'SD' | 'OGOLNE'
export type Unit = 'szt' | 'mb' | 'm2' | 'm3' | 'kg' | 't' | 'l' | 'h' | 'doba' | 'kurs' | 'kpl' | 'ryczałt'
export type PackUnit = 'rolka' | 'paczka' | 'worek' | 'wiadro' | 'puszka' | 'płyta' | 'pręt' | 'bęben' | 'szt'
export type ItemKind = 'material' | 'service' | 'equipment' | 'lumpSum'
export type PriceBasis = 'perUnit' | 'perPack' | 'lumpSum'

export const UNIT_LABEL: Record<Unit, string> = {
  szt: 'szt',
  mb: 'mb',
  m2: 'm²',
  m3: 'm³',
  kg: 'kg',
  t: 't',
  l: 'l',
  h: 'h',
  doba: 'doba',
  kurs: 'kurs',
  kpl: 'kpl',
  ryczałt: 'ryczałt',
}

/** Jednostki liczone w całości — ilość do zapłaty zaokrąglana w górę. */
export const COUNTED_UNITS: Unit[] = ['szt', 'kurs', 'kpl']

/** Edytowalny współczynnik pozycji. `null` = niepewny — „uzupełnij”. */
export interface Param {
  label: string
  /** Wartość do obliczeń (null = uzupełnij albo wartość niepoprawna — patrz `error`). */
  value: number | null
  unit: string
  note?: string
  /** Dopuszczalny zakres: 'positive' (> 0, np. wymiary, rozstawy, opakowania) albo 'nonNegative' (≥ 0). */
  min?: 'positive' | 'nonNegative'
  /** Wartość wpisana, ale niepoprawna (np. 0 jako długość rolki) — nie trafia do obliczeń. */
  error?: string
  /** Wartość wpisana przez użytkownika (pokazywana w polu, także gdy niepoprawna). */
  raw?: number | null
}

/** Sprawdza zakres wartości parametru; niepoprawna → value null + opis błędu (zamiast wywracać obliczenia). */
export function validateParam(p: Param): Param {
  const v = p.value
  if (v === null || p.min === undefined) return p
  const bad = !Number.isFinite(v) || v < 0 || (p.min === 'positive' && v === 0)
  if (!bad) return p
  return { ...p, value: null, raw: v, error: p.min === 'positive' ? 'wartość musi być większa od zera' : 'wartość nie może być ujemna' }
}

export interface Packaging {
  packUnit: PackUnit
  /** Ilość (w jednostce pozycji) w jednym opakowaniu; `null` = uzupełnij. */
  perPack: number | null
  /** Opis opakowania, np. „paczka = 3 m²”, „pręt 6 m”. */
  packLabel: string
}

/** Dane planu cięcia pasów (OSB, papa) — do rysunku w panelu pozycji. */
export interface ItemCutting {
  result: CuttingResult
  sheet: { width: number; length: number }
  stripWidth: number
  segments: CutSegment[]
  /** Wariant, który trafił do kosztorysu; null — jeszcze nie wybrany (OSB). */
  used: 'A' | 'B' | null
  /** Klucz wyboru wariantu w `project.choices`. */
  choiceKey: CuttingChoiceKey
  /** true — wariant musi wybrać użytkownik (OSB); false — domyślnie mniej arkuszy (papa). */
  userMustChoose: boolean
}

export type CuttingChoiceKey = 'foundationRingBeamOsbVariant' | 'wallRingBeamOsbVariant' | 'foundationFeltVariant' | 'wallFeltVariant'

/** Pozycja z wyliczoną ilością (bez ceny). */
export interface ItemSpec {
  id: string
  stage: Stage
  category: string
  kind: ItemKind
  name: string
  unit: Unit
  /** Ilość z trace; `null` — brak danych (powód w `missing`). */
  quantity: Computed | null
  packaging?: Packaging
  wastePercent: number
  priceBasis: PriceBasis
  /**
   * Cena za jednostkę, ale płaci się za całe opakowania (np. stal za kg ważona w prętach):
   * ilość do zapłaty = opakowania × zawartość opakowania.
   */
  chargeFullPacks?: boolean
  params: Record<string, Param>
  /** Czego brakuje do policzenia ilości (lista „do uzupełnienia”). */
  missing: string[]
  isCustom: boolean
  enabled: boolean
  note?: string
  /** Plan cięcia (pozycje liczone modułem cięcia pasów). */
  cutting?: ItemCutting
}

/** Pozycja z kosztem. */
export interface ItemResult {
  spec: ItemSpec
  /** Ilość z odpadem (w jednostce pozycji). */
  quantityWithWaste: number | null
  /** Liczba opakowań (gdy pozycja ma opakowanie). */
  packs: number | null
  /** Ilość, za którą się płaci, i jej jednostka (np. 38 prętów, 202,46 kg, 1 ryczałt). */
  chargedQuantity: number | null
  chargedUnit: string
  unitPriceGrosze: Grosze | null
  costGrosze: Grosze | null
  /** Wszystkie braki: dane, zużycia, cena. */
  missing: string[]
  trace: TraceStep[]
}

/** Skrót do tworzenia parametru. */
export function param(label: string, value: number | null, unit: string, note?: string): Param {
  return note === undefined ? { label, value, unit } : { label, value, unit, note }
}

/** Wartość parametru albo dopisanie braku. */
export function need(params: Record<string, Param>, key: string, missing: string[]): number | null {
  const p = params[key]
  if (!p) throw new Error(`Brak parametru „${key}”.`)
  if (p.value === null) missing.push(p.error ? `${p.label} — ${p.error}` : p.label)
  return p.value
}

/** Ilość wpisywana ręcznie (godziny, doby, kwota itp.) jako Computed. */
export function manualQuantity(label: string, value: number | null, unit: string): Computed | null {
  if (value === null) return null
  return { value, unit, trace: [{ label, formula: 'podaje użytkownik', values: fmt(value), result: value, unit }] }
}

/** Liczy koszt pozycji: ilość × (1 + odpad) → opakowania → koszt. */
export function computeItem(spec: ItemSpec, unitPriceGrosze: Grosze | null): ItemResult {
  const u = UNIT_LABEL[spec.unit]
  const missing = [...spec.missing]
  const trace: TraceStep[] = []
  const base = {
    spec,
    quantityWithWaste: null as number | null,
    packs: null as number | null,
    chargedQuantity: null as number | null,
    chargedUnit: u,
    unitPriceGrosze,
    costGrosze: null as Grosze | null,
    missing,
    trace,
  }

  if (!spec.enabled) {
    return { ...base, missing: [], costGrosze: 0, trace: [{ label: 'Pozycja wyłączona', formula: '', values: '', result: 0, unit: '' }] }
  }

  // Ryczałt: koszt = kwota (ilość nieistotna)
  if (spec.priceBasis === 'lumpSum') {
    if (unitPriceGrosze === null) missing.push('kwota')
    const cost = unitPriceGrosze
    trace.push({
      label: `Koszt — ${spec.name}`,
      formula: 'kwota ryczałtowa',
      values: cost === null ? '?' : formatPLN(cost),
      result: cost === null ? 'uzupełnij kwotę' : formatPLN(cost),
      unit: '',
    })
    return { ...base, chargedQuantity: 1, chargedUnit: 'ryczałt', costGrosze: cost }
  }

  if (spec.quantity === null) {
    trace.push({ label: `Ilość — ${spec.name}`, formula: '', values: 'brak danych', result: 'uzupełnij', unit: '' })
    if (unitPriceGrosze === null) missing.push('cena')
    return base
  }
  trace.push(...spec.quantity.trace)

  const q = spec.quantity.value
  const qW = clean(q * (1 + spec.wastePercent / 100))
  if (spec.wastePercent !== 0) {
    trace.push({
      label: 'Ilość z odpadem',
      formula: 'q × (1 + odpad)',
      values: `${fmt(q)} × (1 + ${fmt(spec.wastePercent)}%)`,
      result: qW,
      unit: u,
    })
  }

  let packs: number | null = null
  if (spec.packaging) {
    const per = spec.packaging.perPack
    if (per === null) {
      missing.push(`zawartość opakowania (${spec.packaging.packUnit})`)
    } else {
      packs = ceilSafe(qW / per)
      trace.push({
        label: `Liczba opakowań (${spec.packaging.packLabel})`,
        formula: '⌈q / zawartość⌉',
        values: `⌈${fmt(qW)} / ${fmt(per)}⌉ = ⌈${fmt(qW / per)}⌉`,
        result: packs,
        unit: spec.packaging.packUnit,
      })
    }
  }

  let charged: number | null
  let chargedUnit = u
  if (spec.priceBasis === 'perPack') {
    if (!spec.packaging) throw new Error(`Pozycja „${spec.name}”: cena za opakowanie bez opakowania.`)
    charged = packs
    chargedUnit = spec.packaging.packUnit
  } else if (spec.chargeFullPacks && spec.packaging) {
    charged = packs === null || spec.packaging.perPack === null ? null : clean(packs * spec.packaging.perPack)
    if (charged !== null) {
      trace.push({
        label: 'Ilość do zapłaty (pełne opakowania)',
        formula: 'opakowania × zawartość',
        values: `${packs} × ${fmt(spec.packaging.perPack ?? 0)}`,
        result: charged,
        unit: u,
      })
    }
  } else if (!spec.packaging && COUNTED_UNITS.includes(spec.unit) && !Number.isInteger(qW)) {
    // Sztuki, kursy, komplety kupuje się w całości.
    charged = ceilSafe(qW)
    trace.push({ label: 'Zaokrąglenie do pełnych sztuk', formula: '⌈q⌉', values: `⌈${fmt(qW)}⌉`, result: charged, unit: u })
  } else {
    charged = qW
  }

  let cost: Grosze | null = null
  if (unitPriceGrosze === null) missing.push('cena')
  if (charged !== null && unitPriceGrosze !== null) {
    cost = multiply(charged, unitPriceGrosze)
    trace.push({
      label: `Koszt — ${spec.name}`,
      formula: 'K = ilość × cena',
      values: `${fmt(charged)} ${chargedUnit} × ${formatPLN(unitPriceGrosze)}/${chargedUnit}`,
      result: formatPLN(cost),
      unit: '',
    })
  } else {
    trace.push({
      label: `Koszt — ${spec.name}`,
      formula: 'K = ilość × cena',
      values: `${charged === null ? '?' : fmt(charged)} ${chargedUnit} × ${unitPriceGrosze === null ? '?' : formatPLN(unitPriceGrosze)}`,
      result: 'uzupełnij',
      unit: '',
    })
  }

  return { ...base, quantityWithWaste: qW, packs, chargedQuantity: charged, chargedUnit, costGrosze: cost }
}

/** Suma etapu / kategorii; `complete = false`, gdy któraś włączona pozycja ma braki. */
export function sumItems(results: ItemResult[]): { totalGrosze: Grosze; complete: boolean; missingCount: number } {
  let total = 0
  let missingCount = 0
  for (const r of results) {
    if (!r.spec.enabled) continue
    if (r.costGrosze !== null) total += r.costGrosze
    if (r.missing.length > 0 || r.costGrosze === null) missingCount++
  }
  return { totalGrosze: total, complete: missingCount === 0, missingCount }
}
