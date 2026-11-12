// Dane projektu (wejście kreatora + nadpisania użytkownika). Wymiary w metrach, kwoty w groszach.

import type { ConcretePourParams } from '../engine/concrete'
import { defaultPourParams } from '../engine/concrete'
import type { Grosze } from '../engine/money'
import type { FloorLayers, WallLayerParams } from '../engine/levels'
import { DEFAULT_FLOOR_LAYERS, DEFAULT_WALL_LAYERS } from '../engine/levels'
import type { DoorLeafMap, LintelSize, Opening } from '../engine/openings'
import { DEFAULT_DOOR_MAP, DEFAULT_LINTEL_TABLE } from '../engine/openings'
import type { Dormer } from '../engine/roof'

export interface FoundationInput {
  /** Bloczek fundamentowy — wymiary podaje użytkownik (null = uzupełnij). */
  blockLength: number | null
  blockWidth: number | null
  blockHeight: number | null
  jointThickness: number | null
  layers: number | null
  /** Ława — przekrój podaje użytkownik. */
  footingWidth: number | null
  footingHeight: number | null
  /** Wysokość wieńca fundamentowego (domyślnie 0,25). */
  ringBeamHeight: number
  /** Górna część ławy w szalunku z desek (domyślnie 0,12). */
  footingFormworkHeight: number
}

export interface ProjectInput {
  name: string
  /** Wymiary wewnętrzne prostokąta [m]. */
  footprint: { length: number; width: number }
  wallThickness: number
  facadeInsulation: number
  foundationInsulation: number
  clearHeight: number
  wallRingBeamTop: number
  floorLayers: FloorLayers
  slabThickness: number
  wall: WallLayerParams
  foundation: FoundationInput
  concrete: {
    footing: ConcretePourParams
    foundationRingBeam: ConcretePourParams
    slab: ConcretePourParams
    wallRingBeam: ConcretePourParams
  }
  /** Otwory (okna, drzwi, bramy) — typ, wymiary, liczba, ściana. */
  openings: Opening[]
  /** Nadproża systemowe: tabela dla ścian nośnych (115 mm) i działowych (120 mm — sprawdź u dostawcy). */
  lintels: { exterior: LintelSize[]; partition: LintelSize[] }
  /** Mapowanie otwór → skrzydło drzwi wewnętrznych. */
  doorMap: DoorLeafMap[]
  /** Dach: kąt i okapy podaje użytkownik (null = uzupełnij). */
  roof: {
    pitchDeg: number | null
    /** Okap boczny / szczytowy — poziomo od lica gotowego EPS [m]. */
    eaveOverhang: number | null
    gableOverhang: number | null
    ridgeAlongLonger: boolean
    /** Rozstaw wiązarów [m] (domyślnie 0,9) albo liczba podana przez użytkownika. */
    trussSpacing: number
    trussCount: number | null
    dormers: Dormer[]
  }
  /** Ściany działowe: suma mb; wysokość null = od chudziaka do sufitu (z poziomów). */
  partitions: { length: number | null; height: number | null }
  /** Wybory użytkownika (np. wariant cięcia OSB). */
  choices: {
    /** Wariant cięcia OSB szalunku wieńca fundamentowego — wybiera użytkownik. */
    foundationRingBeamOsbVariant: 'A' | 'B' | null
    /** Wariant cięcia OSB szalunku wieńca ścian — wybiera użytkownik. */
    wallRingBeamOsbVariant: 'A' | 'B' | null
  }
  /** Nadpisania parametrów pozycji: itemParams[idPozycji][klucz] = wartość. */
  itemParams: Record<string, Record<string, number | null>>
  /** Ceny jednostkowe (brutto) wg id pozycji. */
  prices: Record<string, Grosze | null>
  /** Włączenie / wyłączenie pozycji wg id (nadpisuje domyślne). */
  enabled: Record<string, boolean>
}

export function newProject(name = 'Nowy projekt'): ProjectInput {
  return {
    name,
    footprint: { length: 12, width: 9 },
    wallThickness: 0.24,
    facadeInsulation: 0.2,
    foundationInsulation: 0.1,
    clearHeight: 2.7,
    wallRingBeamTop: 2.89,
    floorLayers: DEFAULT_FLOOR_LAYERS,
    slabThickness: 0.1,
    wall: DEFAULT_WALL_LAYERS,
    foundation: {
      blockLength: null,
      blockWidth: null,
      blockHeight: null,
      jointThickness: null,
      layers: null,
      footingWidth: null,
      footingHeight: null,
      ringBeamHeight: 0.25,
      footingFormworkHeight: 0.12,
    },
    concrete: {
      footing: defaultPourParams('C20/25'),
      foundationRingBeam: defaultPourParams('C20/25'),
      slab: { ...defaultPourParams('C12/15 z włóknami'), fibers: { enabled: false, kgPerM3: null, pricePerKgGrosze: null } },
      wallRingBeam: defaultPourParams('C20/25'),
    },
    openings: [],
    lintels: { exterior: DEFAULT_LINTEL_TABLE, partition: DEFAULT_LINTEL_TABLE },
    doorMap: DEFAULT_DOOR_MAP,
    roof: { pitchDeg: null, eaveOverhang: null, gableOverhang: null, ridgeAlongLonger: true, trussSpacing: 0.9, trussCount: null, dormers: [] },
    partitions: { length: null, height: null },
    choices: { foundationRingBeamOsbVariant: null, wallRingBeamOsbVariant: null },
    itemParams: {},
    prices: {},
    enabled: {},
  }
}
