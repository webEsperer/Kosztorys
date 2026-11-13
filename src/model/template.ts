// Szablon nowego projektu: stałe ustawienia użytkownika wpisywane do każdego nowego projektu.
// Wartości w projekcie zawsze można zmienić — szablon tylko wypełnia pola na starcie.

import type { CeilingBuildUp } from '../engine/levels'
import type { Opening } from '../engine/openings'
import type { FloorLayersInput, ProjectInput, WallBlockInput } from './project'

export interface ProjectTemplate {
  /** Bloczek fundamentowy [m] (null = uzupełnij). */
  foundationBlock: { blockLength: number | null; blockWidth: number | null; blockHeight: number | null; jointThickness: number | null }
  /** Fundament: ława (szer. × wys.), liczba warstw bloczków, wieniec fund.; chudziak (góra = góra wieńca fund.) [m]. */
  foundation: { footingWidth: number | null; footingHeight: number | null; layers: number | null; ringBeamHeight: number; slabThickness: number }
  /** Bloczek ścian nośnych i działowych [m]. */
  wallBlock: WallBlockInput
  partitionBlock: WallBlockInput
  /** Wysokość ścian nośnych: gotowa posadzka → góra wieńca [m]. */
  wallHeight: number | null
  /** Ściany działowe: mb i wysokość murowania od gotowej posadzki [m]. */
  partitions: { length: number | null; heightAboveFloor: number | null; topMargin: number }
  floorLayers: FloorLayersInput
  ceiling: CeilingBuildUp
  roof: { pitchDeg: number | null; eaveOverhang: number | null; gableOverhang: number | null }
  /** Otwory (okna, drzwi zewnętrzne, drzwi wewnętrzne). */
  openings: Opening[]
}

const ext = (id: string, mark: string, type: Opening['type'], width: number, height: number, room: string): Opening => ({ id, mark, type, width, height, count: 1, wall: 'zewnętrzna', room })
const int = (id: string, mark: string, width: number, room: string): Opening => ({ id, mark, type: 'drzwi wewnętrzne', width, height: 2.0, count: 1, wall: 'działowa', room })

/** Otwory domu użytkownika (zestawienie z 2026-11-12). */
export const USER_OPENINGS: Opening[] = [
  ext('t-o1', 'O1', 'okno', 1.5, 1.5, 'Sypialnia 1'),
  ext('t-o2', 'O2', 'okno', 1.5, 1.5, 'Sypialnia 2'),
  ext('t-o3', 'O3', 'okno', 1.5, 1.5, 'Sypialnia 3 (ściana boczna)'),
  ext('t-o4', 'O4', 'okno', 1.2, 1.5, 'Gabinet'),
  ext('t-o5', 'O5', 'okno', 1.4, 2.3, 'Salon (FIX + uchylne)'), // szer. 1,40 × wys. 2,30 (poprawka użytkownika)
  ext('t-o6', 'O6', 'okno', 1.8, 1.2, 'Kuchnia (ściana boczna)'),
  ext('t-o7', 'O7', 'okno', 1.5, 1.2, 'Kuchnia (ściana z wejściem)'),
  ext('t-o8', 'O8', 'okno', 1.5, 1.2, 'Kotłownia'),
  ext('t-o9', 'O9', 'okno', 1.2, 0.6, 'Łazienka'),
  ext('t-d1', 'D1', 'drzwi zewnętrzne', 1.0, 2.3, 'Wejście (wiatrołap)'),
  ext('t-d2', 'D2', 'drzwi zewnętrzne', 1.8, 2.3, 'Drzwi tarasowe (jadalnia)'),
  ext('t-d3', 'D3', 'drzwi zewnętrzne', 1.0, 2.3, 'Kotłownia'),
  int('t-d4', 'D4', 0.8, 'Sypialnia 1'),
  int('t-d5', 'D5', 0.8, 'Sypialnia 2'),
  int('t-d6', 'D6', 0.8, 'Sypialnia 3'),
  int('t-d7', 'D7', 0.8, 'Łazienka'),
  int('t-d8', 'D8', 0.8, 'Gabinet'),
  int('t-d9', 'D9', 0.8, 'Wiatrołap → korytarz'),
  int('t-d10', 'D10', 0.7, 'Schowek'), // powiększony z 60 do 70 cm (wg użytkownika) → drzwi 60
]

/**
 * Szablon wbudowany — dane domu użytkownika: bloczek fund. 38 × 24 × 12, nośny 59 × 24 (ściana 24),
 * działowy 59 × 24 (ściana 12), ściany nośne 2,80 m od posadzki, działowe 47 mb, dach 30°, okapy 60 cm, otwory.
 * Spoina fund. 1,5 cm, podłoga: EPS 15 cm (3 × 5) + wylewka 7 cm + płytka z klejem 2 cm (razem 24 cm).
 */
export function builtInTemplate(base: ProjectInput): ProjectTemplate {
  return {
    foundationBlock: { blockLength: 0.38, blockWidth: 0.24, blockHeight: 0.12, jointThickness: 0.015 },
    // ława 50 × 40 cm, 6 warstw bloczków, wieniec fund. 25 cm, chudziak 10 cm na równo z wieńcem (wg użytkownika)
    foundation: { footingWidth: 0.5, footingHeight: 0.4, layers: 6, ringBeamHeight: 0.25, slabThickness: 0.1 },
    wallBlock: { blockLength: 0.59, blockHeight: 0.24, jointThickness: base.wall.jointThickness },
    partitionBlock: { blockLength: 0.59, blockHeight: 0.24, jointThickness: base.partitionBlock.jointThickness },
    wallHeight: null, // liczona: 270 + 1,2 + 6 + 15 = 292,2 cm
    partitions: { length: 47, heightAboveFloor: null, topMargin: base.partitions.topMargin },
    // podłoga: EPS 3 × 5 cm = 15 cm, wylewka 7 cm, płytka z klejem 2 cm
    floorLayers: { insulation: 0.15, screed: 0.07, finish: 0.02 },
    ceiling: { ...base.ceiling },
    roof: { pitchDeg: 30, eaveOverhang: 0.6, gableOverhang: 0.6 },
    openings: structuredClone(USER_OPENINGS),
  }
}

/** Ustawienia do zapamiętania, wzięte z bieżącego projektu. */
export function templateFrom(p: ProjectInput): ProjectTemplate {
  const f = p.foundation
  return {
    foundationBlock: { blockLength: f.blockLength, blockWidth: f.blockWidth, blockHeight: f.blockHeight, jointThickness: f.jointThickness },
    foundation: { footingWidth: f.footingWidth, footingHeight: f.footingHeight, layers: f.layers, ringBeamHeight: f.ringBeamHeight, slabThickness: p.slabThickness },
    wallBlock: { blockLength: p.wall.blockLength, blockHeight: p.wall.blockHeight, jointThickness: p.wall.jointThickness },
    partitionBlock: { ...p.partitionBlock },
    wallHeight: p.wallHeight,
    partitions: { length: p.partitions.length, heightAboveFloor: p.partitions.heightAboveFloor, topMargin: p.partitions.topMargin },
    floorLayers: { ...p.floorLayers },
    ceiling: { ...p.ceiling },
    roof: { pitchDeg: p.roof.pitchDeg, eaveOverhang: p.roof.eaveOverhang, gableOverhang: p.roof.gableOverhang },
    openings: structuredClone(p.openings),
  }
}

/** Łączy zapisany szablon z wbudowanym: puste (null) pola zapisanego nie kasują wartości wbudowanych. */
export function mergeTemplate(builtIn: ProjectTemplate, saved: Partial<ProjectTemplate> | undefined): ProjectTemplate {
  if (!saved) return builtIn
  const m = <T extends object>(a: T, b: Partial<T> | undefined): T => {
    const out = { ...a }
    for (const [k, v] of Object.entries(b ?? {})) if (v !== null && v !== undefined) (out as Record<string, unknown>)[k] = v
    return out
  }
  return {
    foundationBlock: m(builtIn.foundationBlock, saved.foundationBlock),
    foundation: m(builtIn.foundation, saved.foundation),
    wallBlock: m(builtIn.wallBlock, saved.wallBlock),
    partitionBlock: m(builtIn.partitionBlock, saved.partitionBlock),
    wallHeight: saved.wallHeight ?? null,
    partitions: m(builtIn.partitions, saved.partitions),
    floorLayers: m(builtIn.floorLayers, saved.floorLayers),
    ceiling: m(builtIn.ceiling, saved.ceiling),
    roof: m(builtIn.roof, saved.roof),
    openings: saved.openings ?? builtIn.openings,
  }
}

/** Nowy projekt z wpisanymi ustawieniami szablonu (kopia — projekt można dalej dowolnie zmieniać). */
export function applyTemplate(p: ProjectInput, t: ProjectTemplate): ProjectInput {
  const next = structuredClone(p)
  const { slabThickness, ...fnd } = t.foundation
  next.foundation = { ...next.foundation, ...t.foundationBlock, ...fnd }
  next.slabThickness = slabThickness
  next.wall = { ...next.wall, ...t.wallBlock }
  next.partitionBlock = { ...t.partitionBlock }
  next.wallHeight = t.wallHeight
  next.partitions = { ...next.partitions, ...t.partitions }
  next.floorLayers = { ...t.floorLayers }
  next.ceiling = { ...t.ceiling }
  next.roof = { ...next.roof, ...t.roof }
  next.openings = structuredClone(t.openings)
  return next
}

/** Opis szablonu do potwierdzenia / podpowiedzi w UI. */
export function describeTemplate(t: ProjectTemplate): string[] {
  const cm = (v: number | null) => (v === null ? '—' : String(Math.round(v * 1000) / 10).replace('.', ','))
  const b = t.foundationBlock
  const fl = t.floorLayers
  const c = t.ceiling
  const nExt = t.openings.filter((o) => o.wall !== 'działowa').reduce((s, o) => s + o.count, 0)
  const nInt = t.openings.filter((o) => o.wall === 'działowa').reduce((s, o) => s + o.count, 0)
  return [
    `bloczek fundamentowy ${cm(b.blockLength)} × ${cm(b.blockWidth)} × ${cm(b.blockHeight)} cm, spoina ${cm(b.jointThickness)} cm`,
    `ława ${cm(t.foundation.footingWidth)} × ${cm(t.foundation.footingHeight)} cm, ${t.foundation.layers ?? '—'} warstw bloczków fund., wieniec fund. ${cm(t.foundation.ringBeamHeight)} cm, chudziak ${cm(t.foundation.slabThickness)} cm`,
    `bloczek nośny dł. ${cm(t.wallBlock.blockLength)} × wys. ${cm(t.wallBlock.blockHeight)} cm, działowy dł. ${cm(t.partitionBlock.blockLength)} × wys. ${cm(t.partitionBlock.blockHeight)} cm`,
    `ściany nośne ${t.wallHeight === null ? 'z sufitu (w świetle + GK + stelaż + pustka)' : `${cm(t.wallHeight)} cm od posadzki`}; działowe ${t.partitions.length === null ? '—' : String(t.partitions.length).replace('.', ',')} mb, wysokość ${t.partitions.heightAboveFloor === null ? `ponad stelaż GK + ${cm(t.partitions.topMargin)} cm` : `${cm(t.partitions.heightAboveFloor)} cm`}`,
    `warstwy podłogi: izolacja ${cm(fl.insulation)} + wylewka ${cm(fl.screed)} + wykończenie ${cm(fl.finish)} cm`,
    `sufit: GK ${cm(c.board)} + stelaż ${cm(c.grid)} + pustka ${cm(c.voidAbove)} cm`,
    `dach: kąt ${t.roof.pitchDeg === null ? '—' : String(t.roof.pitchDeg).replace('.', ',')}°, okap boczny ${cm(t.roof.eaveOverhang)} cm, okap szczytowy ${cm(t.roof.gableOverhang)} cm`,
    `otwory: ${nExt} w ścianach zewnętrznych, ${nInt} drzwi wewnętrznych`,
  ]
}
