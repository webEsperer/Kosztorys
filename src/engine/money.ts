// Pieniądze: liczby całkowite groszy, waluta PLN.
// Ceny w aplikacji są brutto; netto tylko do podglądu (VAT 8% / 23%).

import { type TraceStep, type Traced, ceilSafe, clean, fmt } from './trace'

/** Kwota w groszach (liczba całkowita). */
export type Grosze = number

/** Złote → grosze (zaokrąglenie do pełnego grosza). */
export function toGrosze(zl: number): Grosze {
  return Math.round(zl * 100)
}

/** Grosze → złote (liczba). */
export function toZloty(g: Grosze): number {
  return g / 100
}

/** Format polski: „12 345,67 zł”. */
export function formatPLN(g: Grosze): string {
  if (!Number.isInteger(g)) throw new Error(`Kwota musi być liczbą całkowitą groszy (podano ${g}).`)
  const negative = g < 0
  const abs = Math.abs(g)
  const zl = Math.floor(abs / 100)
  const gr = abs % 100
  const grouped = String(zl).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return `${negative ? '−' : ''}${grouped},${String(gr).padStart(2, '0')} zł`
}

/** Ilość × cena jednostkowa → grosze (zaokrąglenie do pełnego grosza). */
export function multiply(quantity: number, unitPriceGrosze: Grosze): Grosze {
  return Math.round(clean(quantity) * unitPriceGrosze)
}

/** Kwota netto z brutto: brutto / (1 + VAT). */
export function netFromGross(gross: Grosze, vatPercent: number): Grosze {
  return Math.round(gross / (1 + vatPercent / 100))
}

/** Ilość do zakupu z odpadem (przed podziałem na opakowania): q × (1 + odpad%). */
export function withWaste(quantity: number, wastePercent: number, unit: string, label = 'Ilość z odpadem'): Traced<number> {
  const value = clean(quantity * (1 + wastePercent / 100))
  return {
    value,
    trace: [
      {
        label,
        formula: 'q_z = q × (1 + odpad)',
        values: `${fmt(quantity)} × (1 + ${fmt(wastePercent)}%)`,
        result: value,
        unit,
      },
    ],
  }
}

/** Liczba opakowań: ceil(ilość / ilość w opakowaniu). */
export function packsNeeded(quantity: number, perPack: number, unit: string, packLabel: string): Traced<number> {
  if (!(perPack > 0)) throw new Error(`Ilość w opakowaniu musi być większa od zera (podano ${perPack}).`)
  const value = ceilSafe(quantity / perPack)
  return {
    value,
    trace: [
      {
        label: 'Liczba opakowań',
        formula: `n = ⌈q / q_op⌉`,
        values: `⌈${fmt(quantity)} ${unit} / ${fmt(perPack)} ${unit}/${packLabel}⌉ = ⌈${fmt(quantity / perPack)}⌉`,
        result: value,
        unit: packLabel,
      },
    ],
  }
}

/**
 * Pozycja kosztowa: ilość × cena. Cena `null` → koszt `null` („uzupełnij cenę”).
 * Ilość `null` (np. nieznane zużycie) → koszt `null`.
 */
export interface CostLine {
  label: string
  quantity: number | null
  unit: string
  unitPriceGrosze: Grosze | null
  costGrosze: Grosze | null
  trace: TraceStep[]
}

export function costLine(
  label: string,
  quantity: number | null,
  unit: string,
  unitPriceGrosze: Grosze | null,
  priceUnit = unit,
): CostLine {
  let costGrosze: Grosze | null = null
  const trace: TraceStep[] = []
  if (quantity === null) {
    trace.push({ label: `Koszt — ${label}`, formula: 'K = q × c', values: 'brak ilości', result: 'uzupełnij', unit: '' })
  } else if (unitPriceGrosze === null) {
    trace.push({ label: `Koszt — ${label}`, formula: 'K = q × c', values: `${fmt(quantity)} ${unit} × ?`, result: 'uzupełnij cenę', unit: '' })
  } else {
    costGrosze = multiply(quantity, unitPriceGrosze)
    trace.push({
      label: `Koszt — ${label}`,
      formula: 'K = q × c',
      values: `${fmt(quantity)} ${unit} × ${formatPLN(unitPriceGrosze)}/${priceUnit}`,
      result: formatPLN(costGrosze),
      unit: '',
    })
  }
  return { label, quantity, unit, unitPriceGrosze, costGrosze, trace }
}

/** Suma znanych kosztów; `complete = false`, jeśli którakolwiek pozycja nie ma kosztu (brak ceny/ilości). */
export function sumCosts(lines: { costGrosze: Grosze | null }[]): { total: Grosze; complete: boolean } {
  let total = 0
  let complete = true
  for (const l of lines) {
    if (l.costGrosze === null) complete = false
    else total += l.costGrosze
  }
  return { total, complete }
}
