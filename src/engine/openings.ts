// Otwory: pola do odjęcia od muru, nadproża systemowe, lista drzwi wewnętrznych, parapety.
// Wymiary w metrach.

import { type Computed, type TraceStep, clean, fmt } from './trace'

export type OpeningType = 'okno' | 'drzwi zewnętrzne' | 'brama' | 'drzwi wewnętrzne'
export type OpeningWall = 'zewnętrzna' | 'szczyt' | 'działowa'

/** Położenie egzemplarza otworu (do wizualizacji; kosztorys go nie wymaga). */
export interface OpeningPlacement {
  wallId: string
  /** Od wewnętrznego narożnika ściany do krawędzi otworu [m]. */
  offset: number
  /** Wysokość parapetu od gotowej posadzki [m]; drzwi = 0. */
  sillHeight: number
  side?: 'lewe-do-wewnątrz' | 'prawe-do-wewnątrz' | 'lewe-na-zewnątrz' | 'prawe-na-zewnątrz'
}

export interface Opening {
  id: string
  /** Oznaczenie, np. O1, D1. */
  mark: string
  type: OpeningType
  width: number
  height: number
  count: number
  wall: OpeningWall
  /** Pomieszczenie (do zestawienia dla producenta). */
  room?: string
  placements?: OpeningPlacement[]
}

/** Nadproże systemowe: długość i maksymalna szerokość otworu. */
export interface LintelSize {
  length: number
  maxOpening: number
}

/** Tabela domyślna z cennika H+H (szer. 115 mm) — sprawdź u dostawcy. */
export const DEFAULT_LINTEL_TABLE: LintelSize[] = [
  { length: 1.25, maxOpening: 1.01 },
  { length: 1.5, maxOpening: 1.25 },
  { length: 2.0, maxOpening: 1.75 },
  { length: 2.5, maxOpening: 2.25 },
  { length: 3.0, maxOpening: 2.75 },
]

/** Mapowanie otwór → skrzydło drzwi wewnętrznych [m]. */
export interface DoorLeafMap {
  opening: number
  leaf: number
}

export const DEFAULT_DOOR_MAP: DoorLeafMap[] = [
  { opening: 0.7, leaf: 0.6 },
  { opening: 0.8, leaf: 0.7 },
  { opening: 0.9, leaf: 0.8 },
  { opening: 1.0, leaf: 0.9 },
]

export const DEFAULT_INTERIOR_DOOR_HEIGHT = 2.07

function cm(m: number): string {
  return fmt(clean(m * 100), 1)
}

/** Pole otworów (Σ szer × wys × liczba). */
export function openingsArea(label: string, openings: Opening[]): Computed {
  const value = clean(openings.reduce((a, o) => a + o.width * o.height * o.count, 0))
  return {
    value,
    unit: 'm²',
    trace: [
      {
        label,
        formula: 'Σ szer × wys × liczba',
        values: openings.length ? openings.map((o) => `${o.mark}: ${fmt(o.width)} × ${fmt(o.height)} × ${o.count}`).join(' + ') : 'brak otworów',
        result: value,
        unit: 'm²',
      },
    ],
  }
}

/** Najkrótsze nadproże, którego „maks. otwór” ≥ szerokość otworu; null — otwór za szeroki. */
export function selectLintel(width: number, table: LintelSize[]): LintelSize | null {
  const sorted = [...table].sort((a, b) => a.length - b.length)
  return sorted.find((l) => l.maxOpening >= width - 1e-9) ?? null
}

export interface LintelSchedule {
  /** Liczba nadproży wg długości. */
  byLength: { length: number; count: number }[]
  /** Otwory za szerokie na nadproże systemowe. */
  tooWide: Opening[]
  /** Pole nadproży do odjęcia od muru (długość × wysokość, raz na otwór); null — brak wysokości nadproża. */
  area: number | null
  trace: TraceStep[]
}

/**
 * Zestawienie nadproży dla otworów. `perOpening` — sztuk na otwór (ściana 24 cm → 2 × 11,5 cm).
 * Pole do odjęcia od muru liczone raz na otwór (nadproża leżą obok siebie na grubości ściany).
 */
export function lintelSchedule(openings: Opening[], table: LintelSize[], perOpening: number, lintelHeight: number | null): LintelSchedule {
  const counts = new Map<number, number>()
  const tooWide: Opening[] = []
  const trace: TraceStep[] = []
  let area = 0
  for (const o of openings) {
    const l = selectLintel(o.width, table)
    if (!l) {
      tooWide.push(o)
      trace.push({
        label: `Nadproże ${o.mark}`,
        formula: 'najkrótsze z maks. otworem ≥ szer.',
        values: `szer. ${cm(o.width)} cm > ${cm(Math.max(...table.map((t) => t.maxOpening)))} cm`,
        result: 'za szeroki — nadproże indywidualne',
        unit: '',
      })
      continue
    }
    const n = o.count * perOpening
    counts.set(l.length, (counts.get(l.length) ?? 0) + n)
    if (lintelHeight !== null) area += l.length * lintelHeight * o.count
    trace.push({
      label: `Nadproże ${o.mark}`,
      formula: 'najkrótsze z maks. otworem ≥ szer.; szt = liczba × na otwór',
      values: `szer. ${cm(o.width)} cm → ${cm(l.length)} cm (maks. ${cm(l.maxOpening)} cm); ${o.count} × ${perOpening}`,
      result: n,
      unit: 'szt',
    })
  }
  const byLength = [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([length, count]) => ({ length, count }))
  return { byLength, tooWide, area: lintelHeight === null ? null : clean(area), trace }
}

export interface InteriorDoorGroup {
  leaf: number
  openingWidth: number
  height: number
  count: number
  marks: string[]
}

/** Lista drzwi wewnętrznych: otwór → skrzydło (np. „Drzwi 80 — 4 szt.”). */
export function interiorDoors(openings: Opening[], map: DoorLeafMap[]): { groups: InteriorDoorGroup[]; unmapped: Opening[] } {
  const groups = new Map<string, InteriorDoorGroup>()
  const unmapped: Opening[] = []
  for (const o of openings.filter((x) => x.type === 'drzwi wewnętrzne')) {
    const m = map.find((x) => Math.abs(x.opening - o.width) < 1e-6)
    if (!m) {
      unmapped.push(o)
      continue
    }
    const key = `${m.leaf}-${o.height}`
    const g = groups.get(key) ?? { leaf: m.leaf, openingWidth: o.width, height: o.height, count: 0, marks: [] }
    g.count += o.count
    g.marks.push(o.mark)
    groups.set(key, g)
  }
  return { groups: [...groups.values()].sort((a, b) => a.leaf - b.leaf), unmapped }
}

/** Parapety zewnętrzne: Σ (szer. okna + 2 × wysunięcie) × liczba. */
export function sillLength(windows: Opening[], sideExtension: number): Computed {
  const value = clean(windows.reduce((a, o) => a + (o.width + 2 * sideExtension) * o.count, 0))
  return {
    value,
    unit: 'm',
    trace: [
      {
        label: 'Parapety zewnętrzne',
        formula: 'Σ (szer. + 2 × wysunięcie) × liczba',
        values: windows.length ? windows.map((o) => `(${fmt(o.width)} + 2 × ${fmt(sideExtension)}) × ${o.count}`).join(' + ') : 'brak okien',
        result: value,
        unit: 'm',
      },
    ],
  }
}
