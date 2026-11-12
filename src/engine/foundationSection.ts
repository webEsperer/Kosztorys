// Przekrój pionowy przez fundament i podłogę na gruncie (do rysunku). Czyste dane — bez three.js.
// Współrzędne przekroju [m]: x poziomo, 0 = oś ściany, ujemne = na zewnątrz budynku;
// z = rzędna (±0 = gotowa posadzka).

import type { FloorLayers, FoundationLevelsResult } from './levels'
import type { RebarElementParams } from './rebar'
import { type Pt2, barInset } from './rebarLayout'
import { clean } from './trace'

export type SectionMaterial =
  | 'beton'
  | 'bloczek'
  | 'zaprawa'
  | 'xps'
  | 'eps'
  | 'hh'
  | 'piasek'
  | 'wylewka'
  | 'wykonczenie'
  | 'grunt'

export interface SectionRect {
  id: string
  label: string
  material: SectionMaterial
  x0: number
  x1: number
  z0: number
  z1: number
}

export interface SectionBar {
  element: 'lawa' | 'wieniec'
  x: number
  z: number
  /** Średnica [mm]. */
  diameter: number
  label: string
}

export interface SectionStirrup {
  element: 'lawa' | 'wieniec'
  diameter: number
  /** Oś strzemienia (zamknięty prostokąt) + haki. */
  loop: Pt2[]
  hooks: [Pt2, Pt2][]
  /** Rozstaw wzdłuż elementu [m]. */
  spacing: number
}

export interface SectionDim {
  /** Wymiar poziomy (wzdłuż x) albo pionowy (wzdłuż z). */
  dir: 'h' | 'v'
  a: number
  b: number
  /** Położenie linii wymiarowej (z dla poziomego, x dla pionowego). */
  at: number
  label: string
}

export interface SectionLevel {
  z: number
  label: string
}

export interface FoundationSection {
  rects: SectionRect[]
  bars: SectionBar[]
  stirrups: SectionStirrup[]
  dims: SectionDim[]
  levels: SectionLevel[]
  /** Zakres rysunku. */
  bounds: { x0: number; x1: number; z0: number; z1: number }
}

export interface FoundationSectionInput {
  /** Grubość ściany nośnej H+H [m]. */
  wallThickness: number
  /** Grubość EPS elewacji [m]. */
  facadeInsulation: number
  /** Grubość XPS na fundamencie [m]. */
  foundationInsulation: number
  /** Grubość ściany fundamentowej (szerokość bloczka) [m]. */
  foundationWallThickness: number
  blockHeight: number
  jointThickness: number
  layers: number
  footingWidth: number
  footingHeight: number
  ringBeamWidth: number
  ringBeamHeight: number
  slabThickness: number
  floorLayers: FloorLayers
  /** Rzędna góry wieńca fund. = góra chudziaka. */
  slabTop: number
  foundation: FoundationLevelsResult
  footingRebar: RebarElementParams
  ringBeamRebar: RebarElementParams
  /** XPS kończy się tyle poniżej góry wieńca fund. [m] (domyślnie 0,03). */
  xpsTopGap: number
}

function rebarInRect(
  element: 'lawa' | 'wieniec',
  xc: number,
  w: number,
  z0: number,
  h: number,
  p: RebarElementParams,
): { bars: SectionBar[]; stirrup: SectionStirrup } {
  const c = p.cover
  const inset = barInset(p)
  const xL = xc - w / 2
  const xR = xc + w / 2
  const D = p.longitudinalDiameter
  const perLevel = Math.max(1, Math.round(p.longitudinalCount / 2))
  const bars: SectionBar[] = []
  const name = element === 'lawa' ? 'ława' : 'wieniec'
  for (const [lvl, z] of [
    ['dolny', z0 + inset],
    ['górny', z0 + h - inset],
  ] as const) {
    for (let j = 0; j < perLevel; j++) {
      const x = perLevel === 1 ? xc : xL + inset + ((w - 2 * inset) * j) / (perLevel - 1)
      bars.push({ element, x: clean(x), z: clean(z), diameter: D, label: `${name}: Ø${D} ${lvl}` })
    }
  }
  const loop: Pt2[] = [
    { x: xL + c, y: z0 + c },
    { x: xR - c, y: z0 + c },
    { x: xR - c, y: z0 + h - c },
    { x: xL + c, y: z0 + h - c },
    { x: xL + c, y: z0 + c },
  ]
  // Haki 135° w górnym zewnętrznym narożniku, zagięte do wnętrza przekroju.
  const hk = p.stirrupHook / Math.SQRT2
  const corner = { x: xL + c, y: z0 + h - c }
  const hooks: [Pt2, Pt2][] = [
    [corner, { x: corner.x + hk, y: corner.y - hk }],
    [
      { x: corner.x + 0.006, y: corner.y },
      { x: corner.x + 0.006 + hk, y: corner.y - hk },
    ],
  ]
  return {
    bars,
    stirrup: { element, diameter: p.stirrupDiameter, loop, hooks, spacing: p.stirrupSpacing },
  }
}

export function buildFoundationSection(i: FoundationSectionInput): FoundationSection {
  const f = i.foundation
  if (f.footingBottom == null) throw new Error('Podaj wysokość ławy, żeby narysować przekrój.')
  const rects: SectionRect[] = []
  const tf = i.foundationWallThickness
  const t = i.wallThickness
  const outerWallFace = -tf / 2
  const zSlabTop = i.slabTop
  const zSlabBottom = clean(zSlabTop - i.slabThickness)
  const xIn = Math.max(i.footingWidth / 2, tf / 2) + 0.9

  // Ława
  rects.push({
    id: 'lawa',
    label: 'Ława fundamentowa',
    material: 'beton',
    x0: -i.footingWidth / 2,
    x1: i.footingWidth / 2,
    z0: f.footingBottom,
    z1: f.footingTop,
  })
  // Bloczki fundamentowe (warstwy + spoiny)
  for (let k = 0; k < i.layers; k++) {
    const zj = clean(f.footingTop + k * (i.blockHeight + i.jointThickness))
    if (i.jointThickness > 0) {
      rects.push({
        id: `spoina-${k + 1}`,
        label: 'Zaprawa',
        material: 'zaprawa',
        x0: -tf / 2,
        x1: tf / 2,
        z0: zj,
        z1: clean(zj + i.jointThickness),
      })
    }
    rects.push({
      id: `bloczek-${k + 1}`,
      label: `Bloczek fundamentowy — warstwa ${k + 1}`,
      material: 'bloczek',
      x0: -tf / 2,
      x1: tf / 2,
      z0: clean(zj + i.jointThickness),
      z1: clean(zj + i.jointThickness + i.blockHeight),
    })
  }
  // Wieniec fundamentowy (oś = oś ściany)
  rects.push({
    id: 'wieniec',
    label: 'Wieniec fundamentowy',
    material: 'beton',
    x0: -i.ringBeamWidth / 2,
    x1: i.ringBeamWidth / 2,
    z0: f.ringBeamBottom,
    z1: zSlabTop,
  })
  // Początek ściany H+H (fragment) i EPS elewacji
  rects.push({ id: 'hh', label: 'Ściana H+H (fragment)', material: 'hh', x0: -t / 2, x1: t / 2, z0: zSlabTop, z1: 0.3 })
  const xpsTop = clean(zSlabTop - i.xpsTopGap)
  rects.push({
    id: 'eps',
    label: 'EPS elewacja (fragment)',
    material: 'eps',
    x0: -t / 2 - i.facadeInsulation,
    x1: -t / 2,
    z0: xpsTop,
    z1: 0.3,
  })
  // XPS na ścianie fundamentowej: od góry ławy do 3 cm poniżej góry wieńca
  rects.push({
    id: 'xps',
    label: 'XPS fundament',
    material: 'xps',
    x0: outerWallFace - i.foundationInsulation,
    x1: outerWallFace,
    z0: f.footingTop,
    z1: xpsTop,
  })
  // Wnętrze: zasypka, chudziak, warstwy podłogi
  // Zasypka od dna wykopu: obok ławy (do góry ławy), a wyżej — od lica ściany fundamentowej.
  rects.push({
    id: 'piasek-dol',
    label: 'Zasypka piaskowa (zagęszczona)',
    material: 'piasek',
    x0: Math.max(i.footingWidth / 2, tf / 2),
    x1: xIn,
    z0: f.excavationBottom,
    z1: f.footingTop,
  })
  rects.push({
    id: 'piasek-gora',
    label: 'Zasypka piaskowa (zagęszczona)',
    material: 'piasek',
    x0: tf / 2,
    x1: xIn,
    z0: f.footingTop,
    z1: zSlabBottom,
  })
  rects.push({ id: 'chudziak', label: 'Chudziak', material: 'beton', x0: tf / 2, x1: xIn, z0: zSlabBottom, z1: zSlabTop })
  const zEps = clean(zSlabTop + i.floorLayers.insulation)
  const zScreed = clean(zEps + i.floorLayers.screed)
  rects.push({ id: 'eps-podl', label: 'EPS podłogowy', material: 'eps', x0: t / 2, x1: xIn, z0: zSlabTop, z1: zEps })
  rects.push({ id: 'wylewka', label: 'Wylewka', material: 'wylewka', x0: t / 2, x1: xIn, z0: zEps, z1: zScreed })
  rects.push({ id: 'wykonczenie', label: 'Wykończenie podłogi', material: 'wykonczenie', x0: t / 2, x1: xIn, z0: zScreed, z1: 0 })

  // Zbrojenie
  const lawa = rebarInRect('lawa', 0, i.footingWidth, f.footingBottom, i.footingHeight, i.footingRebar)
  const wieniec = rebarInRect('wieniec', 0, i.ringBeamWidth, f.ringBeamBottom, i.ringBeamHeight, i.ringBeamRebar)

  // Wymiary
  const xDimR = Math.max(i.footingWidth / 2, tf / 2) + 0.12
  const dims: SectionDim[] = [
    { dir: 'h', a: -i.footingWidth / 2, b: i.footingWidth / 2, at: f.footingBottom - 0.1, label: `b = ${cm(i.footingWidth)}` },
    { dir: 'v', a: f.footingBottom, b: f.footingTop, at: -i.footingWidth / 2 - 0.12, label: `h = ${cm(i.footingHeight)}` },
    { dir: 'v', a: f.footingTop, b: f.ringBeamBottom, at: -tf / 2 - i.foundationInsulation - 0.12, label: `${i.layers} × ${cm(i.blockHeight + i.jointThickness)}` },
    { dir: 'v', a: f.ringBeamBottom, b: zSlabTop, at: -tf / 2 - i.foundationInsulation - 0.12, label: cm(i.ringBeamHeight) },
    { dir: 'h', a: -tf / 2, b: tf / 2, at: f.footingTop + 0.06, label: cm(tf) },
    { dir: 'v', a: f.footingBottom, b: f.footingBottom + i.footingRebar.cover, at: xDimR, label: `c = ${cm(i.footingRebar.cover)}` },
  ]

  const levels: SectionLevel[] = [
    { z: 0, label: 'gotowa posadzka' },
    { z: zSlabTop, label: 'góra wieńca fund. = góra chudziaka' },
    { z: zSlabBottom, label: 'spód chudziaka' },
    { z: f.ringBeamBottom, label: 'spód wieńca fund.' },
    { z: f.footingTop, label: 'góra ławy' },
    { z: f.excavationBottom, label: 'dno wykopu' },
    { z: f.footingBottom, label: 'spód ławy' },
  ]

  return {
    rects,
    bars: [...lawa.bars, ...wieniec.bars],
    stirrups: [lawa.stirrup, wieniec.stirrup],
    dims,
    levels,
    bounds: {
      x0: -tf / 2 - i.foundationInsulation - 0.35,
      x1: xIn,
      z0: f.footingBottom - 0.25,
      z1: 0.35,
    },
  }
}

function cm(m: number): string {
  return `${String(clean(m * 100)).replace('.', ',')} cm`
}
