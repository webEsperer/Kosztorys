// Własne pozycje użytkownika (w każdym etapie): ilość ręczna albo z wymiarów zależnie od jednostki
// (mb → dł., m² → dł. × szer., m³ → dł. × szer. × wys.) × liczba sztuk — z trace jak pozycje domyślne.

import type { ItemKind, ItemSpec, PackUnit, PriceBasis, Stage, Unit } from '../items'
import { UNIT_LABEL } from '../items'
import { type Computed, clean, fmt } from '../trace'

export interface CustomItem {
  id: string
  stage: Stage
  category: string
  name: string
  kind: ItemKind
  unit: Unit
  /** 'dims' — ilość z wymiarów (dla mb, m², m³); 'manual' — ilość wpisana. */
  mode: 'dims' | 'manual'
  quantity: number | null
  length: number | null
  width: number | null
  height: number | null
  /** Liczba sztuk (mnożnik). */
  count: number
  packaging: { packUnit: PackUnit; perPack: number | null } | null
  wastePercent: number
  priceBasis: PriceBasis
  enabled: boolean
  note?: string
}

/** Jednostki, dla których ilość można policzyć z wymiarów. */
export const DIM_UNITS: Unit[] = ['mb', 'm2', 'm3']

export function newCustomItem(stage: Stage, id: string): CustomItem {
  return {
    id,
    stage,
    category: 'Własne pozycje',
    name: 'Nowa pozycja',
    kind: 'material',
    unit: 'szt',
    mode: 'manual',
    quantity: null,
    length: null,
    width: null,
    height: null,
    count: 1,
    packaging: null,
    wastePercent: 0,
    priceBasis: 'perUnit',
    enabled: true,
  }
}

function customQuantity(c: CustomItem, missing: string[]): Computed | null {
  const u = UNIT_LABEL[c.unit]
  const n = c.count
  if (c.priceBasis === 'lumpSum') return null
  if (c.mode === 'dims' && DIM_UNITS.includes(c.unit)) {
    const need = (v: number | null, label: string) => {
      if (v === null) missing.push(label)
      return v
    }
    const L = need(c.length, 'długość')
    const W = c.unit !== 'mb' ? need(c.width, 'szerokość') : 1
    const H = c.unit === 'm3' ? need(c.height, 'wysokość') : 1
    if (L === null || W === null || H === null) return null
    const one = clean(L * W * H)
    const value = clean(one * n)
    const formula = c.unit === 'mb' ? 'dł. × liczba' : c.unit === 'm2' ? 'dł. × szer. × liczba' : 'dł. × szer. × wys. × liczba'
    const values = c.unit === 'mb' ? `${fmt(L)} × ${n}` : c.unit === 'm2' ? `${fmt(L)} × ${fmt(W)} × ${n}` : `${fmt(L)} × ${fmt(W)} × ${fmt(H)} × ${n}`
    return { value, unit: u, trace: [{ label: c.name, formula, values, result: value, unit: u }] }
  }
  if (c.quantity === null) {
    missing.push('ilość')
    return null
  }
  const value = clean(c.quantity * n)
  return {
    value,
    unit: u,
    trace: [{ label: c.name, formula: n === 1 ? 'podaje użytkownik' : 'ilość × liczba', values: n === 1 ? fmt(c.quantity) : `${fmt(c.quantity)} × ${n}`, result: value, unit: u }],
  }
}

export function buildCustom(items: CustomItem[]): ItemSpec[] {
  return items.map((c) => {
    const missing: string[] = []
    const quantity = customQuantity(c, missing)
    if (c.packaging && c.packaging.perPack === null) missing.push(`zawartość opakowania (${c.packaging.packUnit})`)
    return {
      id: c.id,
      stage: c.stage,
      category: c.category || 'Własne pozycje',
      kind: c.kind,
      name: c.name || 'Pozycja bez nazwy',
      unit: c.unit,
      quantity,
      ...(c.packaging ? { packaging: { packUnit: c.packaging.packUnit, perPack: c.packaging.perPack, packLabel: c.packaging.perPack === null ? c.packaging.packUnit : `${c.packaging.packUnit} = ${fmt(c.packaging.perPack)} ${UNIT_LABEL[c.unit]}` } } : {}),
      wastePercent: c.wastePercent,
      priceBasis: c.packaging ? c.priceBasis : c.priceBasis === 'perPack' ? 'perUnit' : c.priceBasis,
      params: {},
      missing: missing.filter((m) => !m.startsWith('zawartość')),
      isCustom: true,
      enabled: c.enabled,
      ...(c.note ? { note: c.note } : {}),
    }
  })
}
