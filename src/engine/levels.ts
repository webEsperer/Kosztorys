// Schemat wysokości (poziom ±0 = gotowa posadzka): posadzka, chudziak, wieńce,
// liczba warstw bloczków ścian nośnych i fundamentowych. Wszystkie wymiary w metrach.

import { type Computed, type TraceStep, type Traced, clean, floorSafe, fmt, fmtLevel, fmtP } from './trace'

export const LEVEL_REFS = {
  floorBuildUp: 'levels.warstwy_podlogi',
  foundationRingBeamTop: 'levels.gora_wienca_fund',
  wallLayers: 'levels.warstwy_HH',
  foundation: 'levels.fundament',
} as const

/** Warstwy podłogi na chudziaku. */
export interface FloorLayers {
  /** EPS podłogowy [m]. */
  insulation: number
  /** Wylewka [m]. */
  screed: number
  /** Wykończenie (panele/płytki) [m]. */
  finish: number
}

/** Parametry warstw ścian nośnych (H+H). */
export interface WallLayerParams {
  /** Wysokość bloczka [m] (H+H Gold 240 mm → 0,24). */
  blockHeight: number
  /** Grubość spoiny poziomej [m] (cienka spoina — domyślnie 0). */
  jointThickness: number
  /** Warstwa wyrównawcza pod pierwszą warstwą [m]. */
  levelingLayer: number
  /** Minimalna wysokość wieńca ścian [m]. */
  ringBeamMin: number
  /** Maksymalne dołożenie reszty do wieńca [m]; większa reszta → warstwa docinana. */
  maxRingBeamExtension: number
}

/** Parametry ściany fundamentowej — wymiar bloczka podaje użytkownik. */
export interface FoundationParams {
  /** Wysokość bloczka fundamentowego [m]. */
  blockHeight: number
  /** Grubość spoiny [m]. */
  jointThickness: number
  /** Liczba warstw bloczków. */
  layers: number
  /** Wysokość wieńca fundamentowego [m] (domyślnie 0,25). */
  ringBeamHeight: number
  /** Górna część ławy w szalunku z desek, ponad dnem wykopu [m] (domyślnie 0,12). */
  footingFormworkHeight: number
  /** Wysokość ławy [m]; null = jeszcze nie podana (spód ławy nie jest liczony). */
  footingHeight: number | null
}

export interface LevelsInput {
  /** Wysokość w świetle: posadzka → gotowy sufit [m]. */
  clearHeight: number
  /** Rzędna góry wieńca ścian nośnych [m]. */
  wallRingBeamTop: number
  floorLayers: FloorLayers
  /** Grubość chudziaka [m]. */
  slabThickness: number
  wall: WallLayerParams
  foundation: FoundationParams
}

export const DEFAULT_FLOOR_LAYERS: FloorLayers = { insulation: 0.15, screed: 0.065, finish: 0.015 }

export const DEFAULT_WALL_LAYERS: WallLayerParams = {
  blockHeight: 0.24,
  jointThickness: 0,
  levelingLayer: 0,
  ringBeamMin: 0.24,
  maxRingBeamExtension: 0.1,
}

/** Domyślne wartości pewne; wymiar bloczka fundamentowego i liczbę warstw podaje użytkownik. */
export const DEFAULT_LEVELS: Omit<LevelsInput, 'foundation'> & {
  foundation: Pick<FoundationParams, 'ringBeamHeight' | 'footingFormworkHeight'>
} = {
  clearHeight: 2.7,
  wallRingBeamTop: 2.89,
  floorLayers: DEFAULT_FLOOR_LAYERS,
  slabThickness: 0.1,
  wall: DEFAULT_WALL_LAYERS,
  foundation: { ringBeamHeight: 0.25, footingFormworkHeight: 0.12 },
}

/** Warstwy sufitu podwieszanego (od gotowego sufitu w górę do spodu konstrukcji dachu = góra wieńca ścian). */
export interface CeilingBuildUp {
  /** Płyta GK [m] (domyślnie 0,012). */
  board: number
  /** Stelaż krzyżowy: 2 × profil 3 cm [m] (domyślnie 0,06). */
  grid: number
  /** Pustka nad profilami — dojście wkrętarką do wieszaków [m] (domyślnie 0,15). */
  voidAbove: number
}

export const DEFAULT_CEILING_BUILD_UP: CeilingBuildUp = { board: 0.012, grid: 0.06, voidAbove: 0.15 }

/**
 * Góra wieńca ścian nośnych = gotowy sufit + GK + stelaż + pustka.
 * (Wiązary/konstrukcja dachu opiera się na wieńcu, sufit wisi pod nią.)
 */
export function wallRingBeamTopFromCeiling(clearHeight: number, c: CeilingBuildUp): Computed {
  const value = clean(clearHeight + c.board + c.grid + c.voidAbove)
  return {
    value,
    unit: 'm',
    trace: [
      {
        label: 'Rzędna góry wieńca ścian',
        formula: 'h_światło + GK + stelaż + pustka',
        values: `${fmt(clearHeight)} + ${fmt(c.board)} + ${fmt(c.grid)} + ${fmt(c.voidAbove)}`,
        result: value,
        unit: 'm',
        note: 'sufit podwieszany pod konstrukcją dachu opartą na wieńcu',
      },
    ],
  }
}

/** Grubość warstw podłogi na chudziaku (domyślnie 0,23 m). */
export function floorBuildUp(l: FloorLayers): Computed {
  const value = clean(l.insulation + l.screed + l.finish)
  return {
    value,
    unit: 'm',
    trace: [
      {
        label: 'Warstwy podłogi na chudziaku',
        formula: 'g_p = EPS + wylewka + wykończenie',
        values: `${fmt(l.insulation)} + ${fmt(l.screed)} + ${fmt(l.finish)}`,
        result: value,
        unit: 'm',
      },
    ],
  }
}

export interface WallLayersResult {
  /** Wysokość od góry wieńca fund. do góry wieńca ścian [m]. */
  grossHeight: number
  /** Wysokość do rozdzielenia na warstwy i wieniec (po odjęciu warstwy wyrównawczej) [m]. */
  height: number
  /** Wysokość jednej warstwy z spoiną [m]. */
  layerHeight: number
  /** Liczba pełnych warstw bloczków. */
  fullLayers: number
  /** Reszta po pełnych warstwach i minimalnym wieńcu [m]. */
  remainder: number
  /** Wysokość warstwy docinanej (0, gdy brak) [m]. */
  cutLayerHeight: number
  /** Końcowa wysokość wieńca [m]. */
  ringBeamHeight: number
  /** Wysokość murowana z bloczków: n·h_w + docinka [m]. */
  masonryHeight: number
  /** Rzędna spodu wieńca ścian [m]. */
  ringBeamBottom: number
}

/**
 * Liczba warstw bloczków ściany nośnej i wysokość wieńca.
 *   H = (góra wieńca ścian − góra wieńca fund.) − warstwa wyrównawcza
 *   n = floor((H − wieniec_min) / h_w)
 *   r = H − n·h_w − wieniec_min
 *   r ≤ maks. dołożenie → wieniec = wieniec_min + r; inaczej warstwa docinana r, wieniec = wieniec_min
 */
export function computeWallLayers(
  wallRingBeamTop: number,
  foundationRingBeamTop: number,
  p: WallLayerParams,
): Traced<WallLayersResult> {
  if (!(p.blockHeight > 0)) throw new Error('Wysokość bloczka musi być większa od zera.')
  if (p.jointThickness < 0 || p.levelingLayer < 0 || p.maxRingBeamExtension < 0)
    throw new Error('Spoina, warstwa wyrównawcza i dołożenie do wieńca nie mogą być ujemne.')

  const grossHeight = clean(wallRingBeamTop - foundationRingBeamTop)
  const height = clean(grossHeight - p.levelingLayer)
  if (height < p.ringBeamMin)
    throw new Error('Wysokość ściany jest mniejsza niż minimalna wysokość wieńca — sprawdź rzędne.')
  const layerHeight = clean(p.blockHeight + p.jointThickness)
  const fullLayers = floorSafe(clean((height - p.ringBeamMin) / layerHeight))
  const remainder = clean(height - fullLayers * layerHeight - p.ringBeamMin)
  const addToRing = remainder <= p.maxRingBeamExtension + 1e-9
  const cutLayerHeight = addToRing ? 0 : remainder
  const ringBeamHeight = addToRing ? clean(p.ringBeamMin + remainder) : p.ringBeamMin
  const masonryHeight = clean(fullLayers * layerHeight + cutLayerHeight)
  const ringBeamBottom = clean(wallRingBeamTop - ringBeamHeight)

  const trace: TraceStep[] = [
    {
      label: 'Wysokość od góry wieńca fund. do góry wieńca ścian',
      formula: 'H₀ = z_wś − z_wf',
      values: `${fmt(wallRingBeamTop)} − ${fmtP(foundationRingBeamTop)}`,
      result: grossHeight,
      unit: 'm',
      ref: LEVEL_REFS.foundationRingBeamTop,
    },
    {
      label: 'Wysokość po odjęciu warstwy wyrównawczej',
      formula: 'H = H₀ − g_wyr',
      values: `${fmt(grossHeight)} − ${fmt(p.levelingLayer)}`,
      result: height,
      unit: 'm',
    },
    {
      label: 'Wysokość jednej warstwy',
      formula: 'h_w = h_bloczka + spoina',
      values: `${fmt(p.blockHeight)} + ${fmt(p.jointThickness)}`,
      result: layerHeight,
      unit: 'm',
    },
    {
      label: 'Liczba pełnych warstw',
      formula: 'n = floor((H − w_min) / h_w)',
      values: `floor((${fmt(height)} − ${fmt(p.ringBeamMin)}) / ${fmt(layerHeight)}) = floor(${fmt(
        (height - p.ringBeamMin) / layerHeight,
        4,
      )})`,
      result: fullLayers,
      unit: 'warstw',
    },
    {
      label: 'Reszta',
      formula: 'r = H − n·h_w − w_min',
      values: `${fmt(height)} − ${fullLayers} × ${fmt(layerHeight)} − ${fmt(p.ringBeamMin)}`,
      result: remainder,
      unit: 'm',
    },
    addToRing
      ? {
          label: 'Decyzja',
          formula: 'r ≤ maks. dołożenie do wieńca',
          values: `${fmt(remainder)} ≤ ${fmt(p.maxRingBeamExtension)}`,
          result:
            remainder === 0 ? 'reszta 0 — brak docinki, wieniec minimalny' : 'reszta dołożona do wieńca, bez docinki',
          unit: '',
        }
      : {
          label: 'Decyzja',
          formula: 'r > maks. dołożenie do wieńca',
          values: `${fmt(remainder)} > ${fmt(p.maxRingBeamExtension)}`,
          result: `dodatkowa warstwa docinana o wysokości ${fmt(remainder)} m`,
          unit: '',
          note:
            p.jointThickness > 0
              ? `wysokość docinki zawiera spoinę ${fmt(p.jointThickness)} m — bloczek ciąć na ${fmt(
                  remainder - p.jointThickness,
                )} m`
              : undefined,
        },
    {
      label: 'Wysokość wieńca ścian',
      formula: addToRing ? 'h_wś = w_min + r' : 'h_wś = w_min',
      values: addToRing ? `${fmt(p.ringBeamMin)} + ${fmt(remainder)}` : fmt(p.ringBeamMin),
      result: ringBeamHeight,
      unit: 'm',
    },
    {
      label: 'Wysokość murowana z bloczków',
      formula: 'h_mur = n·h_w + docinka',
      values: `${fullLayers} × ${fmt(layerHeight)} + ${fmt(cutLayerHeight)}`,
      result: masonryHeight,
      unit: 'm',
    },
    {
      label: 'Rzędna spodu wieńca ścian',
      formula: 'z = z_wś − h_wś',
      values: `${fmt(wallRingBeamTop)} − ${fmt(ringBeamHeight)}`,
      result: ringBeamBottom,
      unit: 'm',
    },
  ]

  return {
    value: {
      grossHeight,
      height,
      layerHeight,
      fullLayers,
      remainder,
      cutLayerHeight,
      ringBeamHeight,
      masonryHeight,
      ringBeamBottom,
    },
    trace,
  }
}

export interface FoundationLevelsResult {
  /** Wysokość ściany fundamentowej z wieńcem [m]. */
  wallHeight: number
  /** Wysokość samych warstw bloczków [m]. */
  masonryHeight: number
  ringBeamBottom: number
  footingTop: number
  excavationBottom: number
  /** null, gdy wysokość ławy nie jest podana. */
  footingBottom: number | null
}

/**
 * Poziomy fundamentu:
 *   h_ściany_fund = n × (h_bloczka + spoina) + h_wieńca_fund
 *   góra ławy = góra wieńca fund. − h_ściany_fund
 *   dno wykopu = góra ławy − górna część ławy w szalunku (12 cm)
 */
export function computeFoundationLevels(
  foundationRingBeamTop: number,
  p: FoundationParams,
): Traced<FoundationLevelsResult> {
  if (!(p.blockHeight > 0)) throw new Error('Podaj wysokość bloczka fundamentowego.')
  if (!Number.isInteger(p.layers) || p.layers < 0) throw new Error('Liczba warstw musi być liczbą całkowitą ≥ 0.')
  if (!(p.ringBeamHeight > 0)) throw new Error('Wysokość wieńca fundamentowego musi być większa od zera.')

  const course = clean(p.blockHeight + p.jointThickness)
  const masonryHeight = clean(p.layers * course)
  const wallHeight = clean(masonryHeight + p.ringBeamHeight)
  const ringBeamBottom = clean(foundationRingBeamTop - p.ringBeamHeight)
  const footingTop = clean(foundationRingBeamTop - wallHeight)
  const excavationBottom = clean(footingTop - p.footingFormworkHeight)
  const footingBottom = p.footingHeight == null ? null : clean(footingTop - p.footingHeight)

  const trace: TraceStep[] = [
    {
      label: 'Wysokość ściany fundamentowej z wieńcem',
      formula: 'h_sf = n × (h_bloczka + spoina) + h_wf',
      values: `${p.layers} × (${fmt(p.blockHeight)} + ${fmt(p.jointThickness)}) + ${fmt(p.ringBeamHeight)}`,
      result: wallHeight,
      unit: 'm',
    },
    {
      label: 'Rzędna spodu wieńca fundamentowego',
      formula: 'z = z_wf − h_wf',
      values: `${fmt(foundationRingBeamTop)} − ${fmt(p.ringBeamHeight)}`,
      result: ringBeamBottom,
      unit: 'm',
      ref: LEVEL_REFS.foundationRingBeamTop,
    },
    {
      label: 'Rzędna góry ławy',
      formula: 'z_ł = z_wf − h_sf',
      values: `${fmt(foundationRingBeamTop)} − ${fmt(wallHeight)}`,
      result: footingTop,
      unit: 'm',
      ref: LEVEL_REFS.foundationRingBeamTop,
    },
    {
      label: 'Rzędna dna wykopu',
      formula: 'z_dw = z_ł − h_szal',
      values: `${fmt(footingTop)} − ${fmt(p.footingFormworkHeight)}`,
      result: excavationBottom,
      unit: 'm',
      note: 'górna część ławy w szalunku z desek, ponad dnem wykopu',
    },
  ]
  if (footingBottom != null) {
    trace.push({
      label: 'Rzędna spodu ławy',
      formula: 'z = z_ł − h_ł',
      values: `${fmt(footingTop)} − ${fmt(p.footingHeight!)}`,
      result: footingBottom,
      unit: 'm',
    })
  }

  return {
    value: { wallHeight, masonryHeight, ringBeamBottom, footingTop, excavationBottom, footingBottom },
    trace,
  }
}

export interface LevelsResult {
  floorBuildUp: Computed
  /** Góra chudziaka = góra wieńca fundamentowego. */
  slabTop: Computed
  slabBottom: Computed
  ceiling: Computed
  /** Wysokość ścian działowych od chudziaka do sufitu (domyślnie 2,93 m). */
  partitionWallHeight: Computed
  wallLayers: Traced<WallLayersResult>
  foundation: Traced<FoundationLevelsResult>
}

/** Pełny schemat poziomów budynku. */
export function computeLevels(input: LevelsInput): LevelsResult {
  const fb = floorBuildUp(input.floorLayers)
  const slabTopValue = clean(-fb.value)
  const slabTop: Computed = {
    value: slabTopValue,
    unit: 'm',
    trace: [
      {
        label: 'Góra chudziaka = góra wieńca fundamentowego',
        formula: 'z_wf = ±0 − g_p',
        values: `0 − ${fmt(fb.value)}`,
        result: slabTopValue,
        unit: 'm',
        ref: LEVEL_REFS.floorBuildUp,
      },
    ],
  }
  const slabBottomValue = clean(slabTopValue - input.slabThickness)
  const slabBottom: Computed = {
    value: slabBottomValue,
    unit: 'm',
    trace: [
      {
        label: 'Spód chudziaka',
        formula: 'z = z_wf − g_ch',
        values: `${fmt(slabTopValue)} − ${fmt(input.slabThickness)}`,
        result: slabBottomValue,
        unit: 'm',
        ref: LEVEL_REFS.foundationRingBeamTop,
      },
    ],
  }
  const ceiling: Computed = {
    value: input.clearHeight,
    unit: 'm',
    trace: [
      {
        label: 'Rzędna gotowego sufitu',
        formula: 'z_suf = ±0 + h_światło',
        values: `0 + ${fmt(input.clearHeight)}`,
        result: input.clearHeight,
        unit: 'm',
      },
    ],
  }
  const partitionValue = clean(input.clearHeight + fb.value)
  const partitionWallHeight: Computed = {
    value: partitionValue,
    unit: 'm',
    trace: [
      {
        label: 'Wysokość ścian działowych (chudziak → sufit)',
        formula: 'h_dz = h_światło + g_p',
        values: `${fmt(input.clearHeight)} + ${fmt(fb.value)}`,
        result: partitionValue,
        unit: 'm',
        ref: LEVEL_REFS.floorBuildUp,
      },
    ],
  }
  if (input.wallRingBeamTop <= input.clearHeight)
    throw new Error('Góra wieńca ścian musi być powyżej gotowego sufitu.')

  return {
    floorBuildUp: fb,
    slabTop,
    slabBottom,
    ceiling,
    partitionWallHeight,
    wallLayers: computeWallLayers(input.wallRingBeamTop, slabTopValue, input.wall),
    foundation: computeFoundationLevels(slabTopValue, input.foundation),
  }
}

/** Lista rzędnych do schematu poziomów (od góry). */
export function levelList(r: LevelsResult, wallRingBeamTop: number): { label: string; level: number; text: string }[] {
  const rows: { label: string; level: number }[] = [
    { label: 'Góra wieńca ścian', level: wallRingBeamTop },
    { label: 'Spód wieńca ścian', level: r.wallLayers.value.ringBeamBottom },
    { label: 'Gotowy sufit', level: r.ceiling.value },
    { label: 'Gotowa posadzka', level: 0 },
    { label: 'Góra chudziaka / wieńca fund.', level: r.slabTop.value },
    { label: 'Spód chudziaka', level: r.slabBottom.value },
    { label: 'Spód wieńca fund.', level: r.foundation.value.ringBeamBottom },
    { label: 'Góra ławy', level: r.foundation.value.footingTop },
    { label: 'Dno wykopu', level: r.foundation.value.excavationBottom },
  ]
  if (r.foundation.value.footingBottom != null)
    rows.push({ label: 'Spód ławy', level: r.foundation.value.footingBottom })
  return rows.map((x) => ({ ...x, text: fmtLevel(x.level) }))
}
