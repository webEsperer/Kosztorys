// Szablon nowego projektu: stałe ustawienia użytkownika wpisywane do każdego nowego projektu.
// Wartości w projekcie zawsze można zmienić — szablon tylko wypełnia pola na starcie.

import type { CeilingBuildUp } from '../engine/levels'
import type { FloorLayersInput, ProjectInput } from './project'

export interface ProjectTemplate {
  /** Bloczek fundamentowy [m] (null = uzupełnij). */
  foundationBlock: { blockLength: number | null; blockWidth: number | null; blockHeight: number | null; jointThickness: number | null }
  floorLayers: FloorLayersInput
  ceiling: CeilingBuildUp
  roof: { pitchDeg: number | null; eaveOverhang: number | null; gableOverhang: number | null }
}

/** Szablon wbudowany: bloczek fundamentowy 38 × 24 × 12 cm (wg użytkownika); reszta z wartości domyślnych projektu. */
export function builtInTemplate(base: ProjectInput): ProjectTemplate {
  return {
    foundationBlock: { blockLength: 0.38, blockWidth: 0.24, blockHeight: 0.12, jointThickness: base.foundation.jointThickness },
    floorLayers: { ...base.floorLayers },
    ceiling: { ...base.ceiling },
    roof: { pitchDeg: base.roof.pitchDeg, eaveOverhang: base.roof.eaveOverhang, gableOverhang: base.roof.gableOverhang },
  }
}

/** Ustawienia do zapamiętania, wzięte z bieżącego projektu. */
export function templateFrom(p: ProjectInput): ProjectTemplate {
  const f = p.foundation
  return {
    foundationBlock: { blockLength: f.blockLength, blockWidth: f.blockWidth, blockHeight: f.blockHeight, jointThickness: f.jointThickness },
    floorLayers: { ...p.floorLayers },
    ceiling: { ...p.ceiling },
    roof: { pitchDeg: p.roof.pitchDeg, eaveOverhang: p.roof.eaveOverhang, gableOverhang: p.roof.gableOverhang },
  }
}

/** Nowy projekt z wpisanymi ustawieniami szablonu (kopia — projekt można dalej dowolnie zmieniać). */
export function applyTemplate(p: ProjectInput, t: ProjectTemplate): ProjectInput {
  const next = structuredClone(p)
  next.foundation = { ...next.foundation, ...t.foundationBlock }
  next.floorLayers = { ...t.floorLayers }
  next.ceiling = { ...t.ceiling }
  next.roof = { ...next.roof, ...t.roof }
  return next
}

/** Opis szablonu do potwierdzenia / podpowiedzi w UI. */
export function describeTemplate(t: ProjectTemplate): string[] {
  const cm = (v: number | null) => (v === null ? '—' : String(Math.round(v * 1000) / 10).replace('.', ','))
  const b = t.foundationBlock
  const fl = t.floorLayers
  const c = t.ceiling
  return [
    `bloczek fundamentowy ${cm(b.blockLength)} × ${cm(b.blockWidth)} × ${cm(b.blockHeight)} cm, spoina ${cm(b.jointThickness)} cm`,
    `warstwy podłogi: izolacja ${cm(fl.insulation)} + wylewka ${cm(fl.screed)} + wykończenie ${cm(fl.finish)} cm`,
    `sufit: GK ${cm(c.board)} + stelaż ${cm(c.grid)} + pustka ${cm(c.voidAbove)} cm`,
    `dach: kąt ${t.roof.pitchDeg === null ? '—' : String(t.roof.pitchDeg).replace('.', ',')}°, okap boczny ${cm(t.roof.eaveOverhang)} cm, okap szczytowy ${cm(t.roof.gableOverhang)} cm`,
  ]
}
