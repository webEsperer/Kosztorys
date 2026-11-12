// Sufit podwieszany krzyżowy GK — liczony per pomieszczenie wg zasad użytkownika, potem sumowany.
//
// • Obrysówka UD27: obwód pomieszczenia; kołki co 60 cm; taśma akustyczna pod profilem.
// • Profile główne (górne) CD60: co 100 cm, skrajne max 15 cm od ściany; wiszą na wieszakach.
// • Wieszaki: co 90 cm wzdłuż profilu głównego (75 cm przy ciężkich płytach), skrajne max 40 cm od ściany.
// • Profile nośne (dolne) CD60: co 40 cm, krzyżowo pod głównymi, skrajne ok. 10 cm od ściany.
// • Łączniki krzyżowe: na każdym skrzyżowaniu (główne × nośne).
// • Płyty GK 120 cm: dłuższym bokiem PROSTOPADLE do profili nośnych, mijanka spoin ≥ 40 cm;
//   przykręcane tylko do profili nośnych (nigdy do UD).
// Układ: profile główne równolegle do dłuższego boku pomieszczenia, nośne — do krótszego (krótsze nośne
// = mniej łączeń), płyty dłuższym bokiem wzdłuż dłuższego boku pomieszczenia.
// Wymiary w metrach.

import { type Computed, type TraceStep, ceilSafe, clean, fmt } from './trace'

export interface Room {
  id: string
  name: string
  /** Wymiary wewnętrzne pomieszczenia [m] (prostokąt). */
  length: number
  width: number
}

export interface CeilingRules {
  mainSpacing: number
  mainEdge: number
  hangerSpacing: number
  hangerEdge: number
  carrierSpacing: number
  carrierEdge: number
  udAnchorSpacing: number
  boardWidth: number
}

export const DEFAULT_CEILING_RULES: CeilingRules = {
  mainSpacing: 1.0,
  mainEdge: 0.15,
  hangerSpacing: 0.9,
  hangerEdge: 0.4,
  carrierSpacing: 0.4,
  carrierEdge: 0.1,
  udAnchorSpacing: 0.6,
  boardWidth: 1.2,
}

/** Liczba linii na rozpiętości: skrajne `edge` od ścian, między nimi co ≤ `spacing`. */
export function linesAcross(span: number, edge: number, spacing: number): number {
  if (!(spacing > 0)) throw new Error('Rozstaw profili/wieszaków musi być większy od zera.')
  if (span <= 2 * edge + 1e-9) return 1
  return ceilSafe((span - 2 * edge) / spacing) + 1
}

export interface RoomCeiling {
  room: Room
  /** Dłuższy i krótszy bok. */
  long: number
  short: number
  area: number
  perimeter: number
  /** Profile główne: liczba linii (wzdłuż dłuższego boku) i długość linii. */
  mainLines: number
  mainLength: number
  hangersPerLine: number
  hangers: number
  /** Profile nośne: liczba linii (wzdłuż krótszego boku) i długość linii. */
  carrierLines: number
  carrierLength: number
  cross: number
  udAnchors: number
  /** Rzędy płyt GK (pas 120 cm wzdłuż dłuższego boku). */
  boardRows: number
  trace: TraceStep[]
}

export function roomCeiling(room: Room, r: CeilingRules): RoomCeiling {
  if (!(room.length > 0 && room.width > 0)) throw new Error(`Pomieszczenie „${room.name}”: podaj wymiary > 0.`)
  const long = Math.max(room.length, room.width)
  const short = Math.min(room.length, room.width)
  const area = clean(long * short)
  const perimeter = clean(2 * (long + short))
  const mainLines = linesAcross(short, r.mainEdge, r.mainSpacing)
  const hangersPerLine = linesAcross(long, r.hangerEdge, r.hangerSpacing)
  const carrierLines = linesAcross(long, r.carrierEdge, r.carrierSpacing)
  const cross = mainLines * carrierLines
  const udAnchors = ceilSafe(perimeter / r.udAnchorSpacing)
  const boardRows = ceilSafe(short / r.boardWidth)
  const n = room.name
  const lines = (span: number, edge: number, sp: number, k: number) =>
    span <= 2 * edge + 1e-9 ? `${fmt(span)} ≤ 2 × ${fmt(edge)} → 1` : `⌈(${fmt(span)} − 2 × ${fmt(edge)}) / ${fmt(sp)}⌉ + 1 = ${k}`
  const trace: TraceStep[] = [
    { label: `${n}: wymiary`, formula: 'dł. × szer.; obwód', values: `${fmt(long)} × ${fmt(short)}; 2 × (${fmt(long)} + ${fmt(short)})`, result: `${fmt(area)} m², obwód ${fmt(perimeter)} m`, unit: '' },
    { label: `${n}: profile główne (wzdłuż ${fmt(long)} m)`, formula: '⌈(B − 2 × skraj) / rozstaw⌉ + 1', values: lines(short, r.mainEdge, r.mainSpacing, mainLines), result: mainLines, unit: 'linii' },
    { label: `${n}: wieszaki na profilu głównym`, formula: '⌈(L − 2 × skraj) / rozstaw⌉ + 1', values: lines(long, r.hangerEdge, r.hangerSpacing, hangersPerLine), result: hangersPerLine, unit: 'szt' },
    { label: `${n}: wieszaki`, formula: 'linie główne × wieszaki na linii', values: `${mainLines} × ${hangersPerLine}`, result: mainLines * hangersPerLine, unit: 'szt' },
    { label: `${n}: profile nośne (wzdłuż ${fmt(short)} m)`, formula: '⌈(L − 2 × skraj) / rozstaw⌉ + 1', values: lines(long, r.carrierEdge, r.carrierSpacing, carrierLines), result: carrierLines, unit: 'linii' },
    { label: `${n}: łączniki krzyżowe`, formula: 'główne × nośne', values: `${mainLines} × ${carrierLines}`, result: cross, unit: 'szt' },
    { label: `${n}: kołki UD27`, formula: '⌈obwód / rozstaw⌉', values: `⌈${fmt(perimeter)} / ${fmt(r.udAnchorSpacing)}⌉`, result: udAnchors, unit: 'szt' },
    { label: `${n}: rzędy płyt GK`, formula: '⌈B / szer. płyty⌉', values: `⌈${fmt(short)} / ${fmt(r.boardWidth)}⌉`, result: boardRows, unit: 'rzędów' },
  ]
  return { room, long, short, area, perimeter, mainLines, mainLength: long, hangersPerLine, hangers: mainLines * hangersPerLine, carrierLines, carrierLength: short, cross, udAnchors, boardRows, trace }
}

export interface CeilingTotals {
  rooms: RoomCeiling[]
  area: Computed
  perimeter: Computed
  hangers: Computed
  cross: Computed
  udAnchors: Computed
  /** Odcinki profili CD60 (do cięcia z profili handlowych). */
  cdSegments: { id: string; label: string; length: number }[]
  /** Rzędy płyt (do cięcia z płyt handlowych). */
  boardSegments: { id: string; label: string; length: number }[]
}

function sum(label: string, rooms: RoomCeiling[], pick: (r: RoomCeiling) => number, unit: string): Computed {
  const v = clean(rooms.reduce((a, r) => a + pick(r), 0))
  return {
    value: v,
    unit,
    trace: [...rooms.flatMap((r) => r.trace), { label, formula: 'Σ pomieszczeń', values: rooms.map((r) => fmt(pick(r))).join(' + '), result: v, unit }],
  }
}

export function computeCeilingRooms(rooms: Room[], rules: CeilingRules): CeilingTotals {
  const rc = rooms.map((r) => roomCeiling(r, rules))
  const cdSegments = rc.flatMap((r) => [
    ...Array.from({ length: r.mainLines }, (_, i) => ({ id: `${r.room.id}-g${i + 1}`, label: `${r.room.name}: główny ${i + 1}`, length: r.mainLength })),
    ...Array.from({ length: r.carrierLines }, (_, i) => ({ id: `${r.room.id}-n${i + 1}`, label: `${r.room.name}: nośny ${i + 1}`, length: r.carrierLength })),
  ])
  const boardSegments = rc.flatMap((r) => Array.from({ length: r.boardRows }, (_, i) => ({ id: `${r.room.id}-p${i + 1}`, label: `${r.room.name}: rząd ${i + 1}`, length: r.long })))
  return {
    rooms: rc,
    area: sum('Powierzchnia sufitów', rc, (r) => r.area, 'm²'),
    perimeter: sum('Obwody pomieszczeń', rc, (r) => r.perimeter, 'm'),
    hangers: sum('Wieszaki', rc, (r) => r.hangers, 'szt'),
    cross: sum('Łączniki krzyżowe', rc, (r) => r.cross, 'szt'),
    udAnchors: sum('Kołki UD27', rc, (r) => r.udAnchors, 'szt'),
    cdSegments,
    boardSegments,
  }
}
