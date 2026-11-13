// Eksporty: CSV kosztorysu i zestawienie otworów dla producenta stolarki (czyste dane / tekst).
// CSV w formacie dla polskiego Excela: separator „;”, przecinek dziesiętny, BOM UTF-8.

import type { ProjectInput } from '../model/project'
import { STAGE_LABEL, STAGES, type Estimate } from './estimate'
import { UNIT_LABEL } from './items'
import type { OpeningType } from './openings'

const BOM = '﻿'

function cell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return ''
  const s = typeof v === 'number' ? v.toLocaleString('pl-PL', { maximumFractionDigits: 3, useGrouping: false }) : v
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function toCsv(rows: (string | number | null | undefined)[][]): string {
  return BOM + rows.map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n'
}

const zl = (g: number | null) => (g === null ? null : g / 100)

/** Kosztorys: wszystkie pozycje z ilościami, opakowaniami, ceną i wartością + sumy etapów. */
export function estimateCsv(e: Estimate, project: ProjectInput): string {
  const rows: (string | number | null)[][] = [
    ['Kosztorys', project.name],
    ['Data', new Date().toLocaleDateString('pl-PL')],
    [],
    ['Etap', 'Kategoria', 'Pozycja', 'Ilość', 'Jedn.', 'Opakowania', 'Jedn. opak.', 'Ilość do zapłaty', 'Jedn. zapłaty', 'Cena [zł]', 'Wartość [zł]', 'Uwagi / braki'],
  ]
  for (const st of STAGES) {
    for (const r of e.items.filter((x) => x.spec.stage === st && x.spec.enabled && !x.excluded)) {
      const s = r.spec
      rows.push([
        STAGE_LABEL[st],
        s.category,
        s.name,
        s.priceBasis === 'lumpSum' ? null : (r.quantityWithWaste ?? null),
        s.priceBasis === 'lumpSum' ? 'ryczałt' : UNIT_LABEL[s.unit],
        r.packs,
        s.packaging?.packUnit ?? null,
        r.chargedQuantity,
        r.chargedUnit,
        zl(r.unitPriceGrosze),
        zl(r.costGrosze),
        r.missing.length ? `uzupełnij: ${r.missing.join(', ')}` : (s.note ?? null),
      ])
    }
  }
  rows.push([])
  for (const s of e.stages) rows.push([STAGE_LABEL[s.stage], null, 'Suma etapu', null, null, null, null, null, null, null, zl(s.totalGrosze), s.complete ? null : `${s.missingCount} do uzupełnienia`])
  rows.push([null, null, 'Suma etapów', null, null, null, null, null, null, null, zl(e.subtotalGrosze), null])
  rows.push([null, null, `Rezerwa ${e.reservePercent}%`, null, null, null, null, null, null, null, zl(e.reserveGrosze), null])
  rows.push([null, null, 'RAZEM', null, null, null, null, null, null, null, zl(e.totalGrosze), e.complete ? null : 'kosztorys niepełny'])
  return toCsv(rows)
}

export interface OpeningScheduleRow {
  lp: number
  mark: string
  type: OpeningType
  /** Wymiary otworu w cm. */
  widthCm: number
  heightCm: number
  count: number
  room: string
}

/** Zestawienie otworów zewnętrznych (okna, drzwi zewnętrzne, bramy) dla producenta stolarki. */
export function openingSchedule(project: ProjectInput, includeInterior = false): OpeningScheduleRow[] {
  return project.openings
    .filter((o) => includeInterior || o.type !== 'drzwi wewnętrzne')
    .map((o, i) => ({
      lp: i + 1,
      mark: o.mark,
      type: o.type,
      widthCm: Math.round(o.width * 1000) / 10,
      heightCm: Math.round(o.height * 1000) / 10,
      count: o.count,
      room: o.room ?? '',
    }))
}

export const OPENING_COLUMNS = ['Lp.', 'Oznaczenie', 'Typ', 'Szerokość otworu [cm]', 'Wysokość otworu [cm]', 'Ilość', 'Pomieszczenie', 'Typ otwierania', 'Kolor', 'Uwagi'] as const

export function openingsCsv(project: ProjectInput, includeInterior = false): string {
  const rows: (string | number | null)[][] = [
    ['Zestawienie otworów dla producenta stolarki'],
    ['Projekt', project.name],
    ['Data', new Date().toLocaleDateString('pl-PL')],
    ['Wymiary otworów w murze (w świetle) — producent ustala wymiar stolarki z luzem montażowym.'],
    [],
    [...OPENING_COLUMNS],
    ...openingSchedule(project, includeInterior).map((r) => [r.lp, r.mark, r.type, r.widthCm, r.heightCm, r.count, r.room, '', '', '']),
  ]
  return toCsv(rows)
}
