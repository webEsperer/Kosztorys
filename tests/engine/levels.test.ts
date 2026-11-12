import { describe, expect, it } from 'vitest'
import {
  computeFoundationLevels,
  computeLevels,
  computeWallLayers,
  DEFAULT_LEVELS,
  DEFAULT_WALL_LAYERS,
  floorBuildUp,
  levelList,
  type LevelsInput,
} from '../../src/engine/levels'
import { renderTrace } from '../../src/engine/trace'

// Ściana fundamentowa: PRZYKŁADOWE dane testowe (w aplikacji podaje je użytkownik):
// bloczek wys. 12 cm + spoina 1 cm, 5 warstw, ława wys. 40 cm.
const REF_INPUT: LevelsInput = {
  ...DEFAULT_LEVELS,
  foundation: {
    ...DEFAULT_LEVELS.foundation,
    blockHeight: 0.12,
    jointThickness: 0.01,
    layers: 5,
    footingHeight: 0.4,
  },
}

describe('levels — posadzka i chudziak', () => {
  it('warstwy podłogi: 0,15 + 0,065 + 0,015 = 0,23 m', () => {
    expect(floorBuildUp(DEFAULT_LEVELS.floorLayers).value).toBe(0.23)
  })

  it('rzędne domyślne: chudziak −0,23 / −0,33, sufit +2,70, działowe 2,93 m', () => {
    const r = computeLevels(REF_INPUT)
    expect(r.slabTop.value).toBe(-0.23)
    expect(r.slabBottom.value).toBe(-0.33)
    expect(r.ceiling.value).toBe(2.7)
    expect(r.partitionWallHeight.value).toBe(2.93)
  })
})

describe('levels — warstwy H+H (góra wieńca fund. −0,23)', () => {
  it('reszta 0 (dane domyślne, góra wieńca +2,89): 12 warstw, wieniec 24 cm', () => {
    // H = 2,89 + 0,23 = 3,12; n = floor(2,88 / 0,24) = 12; r = 3,12 − 2,88 − 0,24 = 0
    const r = computeWallLayers(2.89, -0.23, DEFAULT_WALL_LAYERS).value
    expect(r.grossHeight).toBe(3.12)
    expect(r.fullLayers).toBe(12)
    expect(r.remainder).toBe(0)
    expect(r.cutLayerHeight).toBe(0)
    expect(r.ringBeamHeight).toBe(0.24)
    expect(r.masonryHeight).toBe(2.88)
    expect(r.ringBeamBottom).toBe(2.65)
  })

  it('reszta 3 cm (góra wieńca +2,92): dołożona do wieńca → 27 cm', () => {
    // H = 3,15; n = floor(2,91 / 0,24) = floor(12,125) = 12; r = 3,15 − 2,88 − 0,24 = 0,03
    const r = computeWallLayers(2.92, -0.23, DEFAULT_WALL_LAYERS).value
    expect(r.fullLayers).toBe(12)
    expect(r.remainder).toBe(0.03)
    expect(r.cutLayerHeight).toBe(0)
    expect(r.ringBeamHeight).toBe(0.27)
    expect(r.masonryHeight).toBe(2.88)
  })

  it('reszta równa limitowi 10 cm (góra +2,99): jeszcze dołożona do wieńca → 34 cm', () => {
    const r = computeWallLayers(2.99, -0.23, DEFAULT_WALL_LAYERS).value
    expect(r.remainder).toBe(0.1)
    expect(r.cutLayerHeight).toBe(0)
    expect(r.ringBeamHeight).toBe(0.34)
  })

  it('reszta 14 cm > limit (góra +3,03): warstwa docinana 14 cm, wieniec 24 cm', () => {
    // H = 3,26; n = floor(3,02 / 0,24) = floor(12,58) = 12; r = 3,26 − 2,88 − 0,24 = 0,14
    const r = computeWallLayers(3.03, -0.23, DEFAULT_WALL_LAYERS).value
    expect(r.fullLayers).toBe(12)
    expect(r.remainder).toBe(0.14)
    expect(r.cutLayerHeight).toBe(0.14)
    expect(r.ringBeamHeight).toBe(0.24)
    expect(r.masonryHeight).toBe(3.02)
    expect(r.ringBeamBottom).toBe(2.79)
  })

  it('warstwa wyrównawcza 2 cm: 11 warstw + docinka 22 cm', () => {
    // H = 3,12 − 0,02 = 3,10; n = floor(2,86 / 0,24) = 11; r = 3,10 − 2,64 − 0,24 = 0,22
    const r = computeWallLayers(2.89, -0.23, { ...DEFAULT_WALL_LAYERS, levelingLayer: 0.02 }).value
    expect(r.height).toBe(3.1)
    expect(r.fullLayers).toBe(11)
    expect(r.cutLayerHeight).toBe(0.22)
    expect(r.ringBeamHeight).toBe(0.24)
    expect(r.masonryHeight).toBe(2.86)
  })

  it('spoina 2 mm: h_w = 0,242; 11 warstw + docinka 21,8 cm', () => {
    // n = floor(2,88 / 0,242) = floor(11,90) = 11; r = 3,12 − 2,662 − 0,24 = 0,218
    const r = computeWallLayers(2.89, -0.23, { ...DEFAULT_WALL_LAYERS, jointThickness: 0.002 }).value
    expect(r.layerHeight).toBe(0.242)
    expect(r.fullLayers).toBe(11)
    expect(r.remainder).toBe(0.218)
    expect(r.cutLayerHeight).toBe(0.218)
  })

  it('trace dla danych domyślnych', () => {
    const r = computeWallLayers(2.89, -0.23, DEFAULT_WALL_LAYERS)
    expect(renderTrace(r.trace)).toBe(
      [
        '1. Wysokość od góry wieńca fund. do góry wieńca ścian: H₀ = z_wś − z_wf = 2,89 − (−0,23) = 3,12 m  [→ levels.gora_wienca_fund]',
        '2. Wysokość po odjęciu warstwy wyrównawczej: H = H₀ − g_wyr = 3,12 − 0 = 3,12 m',
        '3. Wysokość jednej warstwy: h_w = h_bloczka + spoina = 0,24 + 0 = 0,24 m',
        '4. Liczba pełnych warstw: n = floor((H − w_min) / h_w) = floor((3,12 − 0,24) / 0,24) = floor(12) = 12 warstw',
        '5. Reszta: r = H − n·h_w − w_min = 3,12 − 12 × 0,24 − 0,24 = 0 m',
        '6. Decyzja: r ≤ maks. dołożenie do wieńca = 0 ≤ 0,1 = reszta 0 — brak docinki, wieniec minimalny',
        '7. Wysokość wieńca ścian: h_wś = w_min + r = 0,24 + 0 = 0,24 m',
        '8. Wysokość murowana z bloczków: h_mur = n·h_w + docinka = 12 × 0,24 + 0 = 2,88 m',
        '9. Rzędna spodu wieńca ścian: z = z_wś − h_wś = 2,89 − 0,24 = 2,65 m',
      ].join('\n'),
    )
  })

  it('trace przy warstwie docinanej pokazuje decyzję i wysokość docinki', () => {
    const text = renderTrace(computeWallLayers(3.03, -0.23, DEFAULT_WALL_LAYERS).trace)
    expect(text).toContain('0,14 > 0,1 = dodatkowa warstwa docinana o wysokości 0,14 m')
    expect(text).toContain('h_mur = n·h_w + docinka = 12 × 0,24 + 0,14 = 3,02 m')
  })

  it('odrzuca ścianę niższą niż minimalny wieniec', () => {
    expect(() => computeWallLayers(0, -0.1, DEFAULT_WALL_LAYERS)).toThrow()
  })
})

describe('levels — fundament (przykład: 5 warstw × (12 + 1) cm, ława 40 cm)', () => {
  it('h_ściany_fund = 5 × 0,13 + 0,25 = 0,90 m; góra ławy −1,13; dno wykopu −1,25; spód ławy −1,53', () => {
    const r = computeFoundationLevels(-0.23, REF_INPUT.foundation).value
    expect(r.masonryHeight).toBe(0.65)
    expect(r.wallHeight).toBe(0.9)
    expect(r.ringBeamBottom).toBe(-0.48)
    expect(r.footingTop).toBe(-1.13)
    expect(r.excavationBottom).toBe(-1.25)
    expect(r.footingBottom).toBe(-1.53)
  })

  it('bez wysokości ławy spód ławy = null', () => {
    const r = computeFoundationLevels(-0.23, { ...REF_INPUT.foundation, footingHeight: null })
    expect(r.value.footingBottom).toBeNull()
    expect(r.trace).toHaveLength(4)
  })

  it('odrzuca brak bloczka i ułamkową liczbę warstw', () => {
    expect(() => computeFoundationLevels(-0.23, { ...REF_INPUT.foundation, blockHeight: 0 })).toThrow()
    expect(() => computeFoundationLevels(-0.23, { ...REF_INPUT.foundation, layers: 4.5 })).toThrow()
  })
})

describe('levels — lista rzędnych do schematu', () => {
  it('zawiera rzędne od góry wieńca do spodu ławy', () => {
    const r = computeLevels(REF_INPUT)
    expect(levelList(r, REF_INPUT.wallRingBeamTop).map((x) => `${x.label}: ${x.text}`)).toEqual([
      'Góra wieńca ścian: +2,89',
      'Spód wieńca ścian: +2,65',
      'Gotowy sufit: +2,7',
      'Gotowa posadzka: ±0',
      'Góra chudziaka / wieńca fund.: −0,23',
      'Spód chudziaka: −0,33',
      'Spód wieńca fund.: −0,48',
      'Góra ławy: −1,13',
      'Dno wykopu: −1,25',
      'Spód ławy: −1,53',
    ])
  })
})
