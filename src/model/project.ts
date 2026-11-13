// Dane projektu (wejście kreatora + nadpisania użytkownika). Wymiary w metrach, kwoty w groszach.

import type { ConcretePourParams } from '../engine/concrete'
import { defaultPourParams, FOOTING_EXTRA_PERCENT, RING_BEAM_EXTRA_PERCENT, SLAB_EXTRA_PERCENT } from '../engine/concrete'
import type { Grosze } from '../engine/money'
import type { Stage } from '../engine/items'
import type { CustomItem } from '../engine/stages/custom'
import type { CeilingBuildUp } from '../engine/levels'
import { DEFAULT_CEILING_BUILD_UP } from '../engine/levels'
import type { DoorLeafMap, LintelSize, Opening } from '../engine/openings'
import { DEFAULT_DOOR_MAP, DEFAULT_LINTEL_TABLE } from '../engine/openings'
import type { Dormer } from '../engine/roof'
import type { CeilingRules, Room } from '../engine/ceiling'
import { DEFAULT_CEILING_RULES } from '../engine/ceiling'

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

/** Warstwy podłogi na chudziaku — podaje użytkownik (null = uzupełnij). */
export interface FloorLayersInput {
  /** Izolacja (EPS) na chudziaku [m]. */
  insulation: number | null
  /** Wylewka [m]. */
  screed: number | null
  /** Wykończenie: płytka / panel [m]. */
  finish: number | null
}

/** Ściany murowane (nośne / działowe): wymiary bloczka podaje użytkownik. */
export interface WallBlockInput {
  blockLength: number | null
  blockHeight: number | null
  /** Spoina [m] (cienka spoina — 0). */
  jointThickness: number
}

export interface WallInput extends WallBlockInput {
  /** Warstwa wyrównawcza pod pierwszą warstwą [m]. */
  levelingLayer: number
  /** Minimalna wysokość wieńca ścian [m] (np. 0,25). */
  ringBeamMin: number
  /** Reszta do tej wysokości dokładana do wieńca; większa → warstwa docinana [m]. */
  maxRingBeamExtension: number
}

export interface ProjectInput {
  name: string
  /** Wymiary wewnętrzne prostokąta [m]. */
  footprint: { length: number; width: number }
  wallThickness: number
  /** EPS elewacji [m] — na ścianach na całej wysokości, na ścianach szczytowych do linii okapu. */
  facadeInsulation: number
  /**
   * Szczyty główne nad linią okapu: boazeria na łatach; `insulated` — pod boazerią wełna skalna
   * o grubości `woolThickness` [m] (domyślnie tak, 0,20). Szczyty daszków — wybór przy daszku.
   */
  gables: { insulated: boolean; woolThickness: number }
  foundationInsulation: number
  /** Wysokość w świetle: gotowa posadzka → gotowy sufit [m]. */
  clearHeight: number
  floorLayers: FloorLayersInput
  /**
   * Ręczne nadpisanie góry wieńca ścian nośnych od gotowej posadzki [m]. null (domyślnie) = liczona:
   * w świetle + GK + stelaż + pustka. Mur stoi na chudziaku; warstwy i wieniec wg levels.ts.
   */
  wallHeight: number | null
  /** Sufit podwieszany: GK + stelaż + pustka — wyznacza górę wieńca ścian nośnych. */
  ceiling: CeilingBuildUp
  slabThickness: number
  wall: WallInput
  partitionBlock: WallBlockInput
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
  /** Edytor rzutu: minimalny filar przy narożniku i między otworami [m]. */
  planRules: { minPier: number }
  /** Pomieszczenia (prostokąty, wymiary wewnętrzne) — sufit, obwody, taśmy liczone per pomieszczenie. */
  rooms: Room[]
  /** Zasady rozmieszczenia profili i wieszaków sufitu. */
  ceilingRules: CeilingRules
  /**
   * Ściany działowe: suma mb; pierwsza warstwa na chudziaku. Wysokość od gotowej posadzki (wg użytkownika):
   * ponad górną krawędź profili GK = h_światło + GK + stelaż + `topMargin` (3 cm), nie wyżej niż wieniec.
   * `heightAboveFloor` — ręcznie (null = liczona); `height` — ręcznie cała wysokość muru od chudziaka (null = liczona).
   */
  partitions: { length: number | null; height: number | null; heightAboveFloor: number | null; topMargin: number }
  /** Wybory użytkownika (np. wariant cięcia OSB). */
  choices: {
    /** Wariant cięcia OSB szalunku wieńca fundamentowego — wybiera użytkownik. */
    foundationRingBeamOsbVariant: 'A' | 'B' | null
    /** Wariant cięcia OSB szalunku wieńca ścian — wybiera użytkownik. */
    wallRingBeamOsbVariant: 'A' | 'B' | null
    /** Wariant cięcia papy pod ściany fundamentowe; null = automatycznie (mniej rolek). */
    foundationFeltVariant: 'A' | 'B' | null
    /** Wariant cięcia papy pod ściany nośne; null = automatycznie (mniej rolek). */
    wallFeltVariant: 'A' | 'B' | null
  }
  /** Nadpisania parametrów pozycji: itemParams[idPozycji][klucz] = wartość. */
  itemParams: Record<string, Record<string, number | null>>
  /** Ceny jednostkowe (brutto) wg id pozycji. */
  prices: Record<string, Grosze | null>
  /** Włączenie / wyłączenie pozycji wg id (nadpisuje domyślne). */
  enabled: Record<string, boolean>
  /** Rozliczenie kwotą za całość zamiast stawki za h / dobę (np. praca koparki) wg id pozycji. */
  lumpSumBilling: Record<string, boolean>
  /** Drewno rozliczane za m³ zamiast za szt / mb wg id pozycji. */
  timberBilling: Record<string, boolean>
  /** Materiał sypki (piasek) zamawiany w tonach zamiast w m³ wg id pozycji. */
  tonnesBilling?: Record<string, boolean>
  /**
   * Sekcje wyłączone z liczenia (wg użytkownika: „co, jeśli tego nie zrobię”): klucz `ETAP|kategoria`,
   * `ETAP|*` = cały etap. Pozycje zachowują swoje ceny i włączenie — po ponownym włączeniu sekcji wracają.
   */
  excludedSections?: Record<string, boolean>
  /** Wykonane przekształcenia starszych zapisów (upgradeProject), np. `pexPerMb`. */
  migrations?: Record<string, boolean>
  /** Przeniesienie pozycji do innego etapu wg id. */
  stageOverride: Record<string, Stage>
  /** Rezerwa na nieprzewidziane wydatki: % od sumy etapów (domyślnie 10). */
  reservePercent: number
  /** Własne pozycje użytkownika. */
  customItems: CustomItem[]
  /** VAT do podglądu netto (ceny wpisywane są brutto); null — bez podglądu. */
  vatPercent: number | null
}

export function newProject(name = 'Nowy projekt'): ProjectInput {
  return {
    name,
    footprint: { length: 12, width: 9 },
    wallThickness: 0.24,
    facadeInsulation: 0.2,
    gables: { insulated: true, woolThickness: 0.2 },
    foundationInsulation: 0.1,
    clearHeight: 2.7,
    wallHeight: null,
    floorLayers: { insulation: null, screed: null, finish: null },
    ceiling: DEFAULT_CEILING_BUILD_UP,
    slabThickness: 0.1,
    wall: { blockLength: null, blockHeight: null, jointThickness: 0, levelingLayer: 0, ringBeamMin: 0.25, maxRingBeamExtension: 0.04 },
    partitionBlock: { blockLength: null, blockHeight: null, jointThickness: 0 },
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
      footing: defaultPourParams('C20/25', FOOTING_EXTRA_PERCENT),
      foundationRingBeam: defaultPourParams('C20/25', RING_BEAM_EXTRA_PERCENT),
      slab: { ...defaultPourParams('C12/15 z włóknami', SLAB_EXTRA_PERCENT), fibers: { enabled: false, kgPerM3: null, pricePerKgGrosze: null } },
      wallRingBeam: defaultPourParams('C20/25', RING_BEAM_EXTRA_PERCENT),
    },
    openings: [],
    lintels: { exterior: DEFAULT_LINTEL_TABLE, partition: DEFAULT_LINTEL_TABLE },
    doorMap: DEFAULT_DOOR_MAP,
    roof: { pitchDeg: null, eaveOverhang: null, gableOverhang: null, ridgeAlongLonger: true, trussSpacing: 0.9, trussCount: null, dormers: [] },
    planRules: { minPier: 0.25 },
    rooms: [],
    ceilingRules: DEFAULT_CEILING_RULES,
    partitions: { length: null, height: null, heightAboveFloor: null, topMargin: 0.03 },
    choices: { foundationRingBeamOsbVariant: null, wallRingBeamOsbVariant: null, foundationFeltVariant: null, wallFeltVariant: null },
    itemParams: {},
    prices: {},
    enabled: {},
    stageOverride: {},
    lumpSumBilling: {},
    timberBilling: {},
    tonnesBilling: {},
    reservePercent: 10,
    migrations: { pexPerMb: true },
    customItems: [],
    vatPercent: null,
  }
}
