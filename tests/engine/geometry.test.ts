import { describe, expect, it } from 'vitest'
import {
  axisPerimeter,
  computeGeometry,
  footingFacePerimeters,
  insulationOuterPerimeter,
  interiorArea,
  interiorPerimeter,
  layerMidPerimeter,
  outerDimensions,
  outerWallPerimeter,
  perimeterAtOffset,
  type RectFootprint,
} from '../../src/engine/geometry'
import { renderTrace } from '../../src/engine/trace'

// Przykład referencyjny z CLAUDE.md: 12,00 × 9,00 m wewnątrz, ściana 24 cm, EPS 20 cm.
const REF: RectFootprint = { kind: 'rect', length: 12, width: 9 }
const T = 0.24
const E = 0.2

describe('geometry — przykład referencyjny 12 × 9 m', () => {
  it('obwód wewnętrzny: 2 × (12 + 9) = 42 m', () => {
    const r = interiorPerimeter(REF)
    expect(r.value).toBe(42)
    expect(r.unit).toBe('m')
  })

  it('pole wewnętrzne: 12 × 9 = 108 m²', () => {
    const r = interiorArea(REF)
    expect(r.value).toBe(108)
    expect(r.unit).toBe('m²')
  })

  it('obwód w osi: 42 + 4 × 0,24 = 42,96 m', () => {
    expect(axisPerimeter(42, T).value).toBe(42.96)
  })

  it('obwód lica zewnętrznego ściany: 42 + 8 × 0,24 = 43,92 m', () => {
    expect(outerWallPerimeter(42, T).value).toBe(43.92)
  })

  it('obwód lica zewnętrznego EPS: 42 + 8 × (0,24 + 0,20) = 45,52 m', () => {
    expect(insulationOuterPerimeter(42, T, E).value).toBe(45.52)
  })

  it('obwód w połowie EPS: 42 + 8 × (0,24 + 0,10) = 44,72 m', () => {
    expect(layerMidPerimeter(42, T, E).value).toBe(44.72)
  })

  it('P(d) jest zgodne z obwodem w osi dla d = t/2', () => {
    expect(perimeterAtOffset(42, T / 2).value).toBe(axisPerimeter(42, T).value)
  })

  it('P(d) dla prostokąta = obwód prostokąta powiększonego o d z każdej strony', () => {
    const d = 0.44
    const direct = 2 * (12 + 2 * d + (9 + 2 * d))
    expect(perimeterAtOffset(42, d).value).toBeCloseTo(direct, 9)
  })

  it('lica ławy b = 0,60: 42,96 ± 4 × 0,60 = 45,36 / 40,56 m', () => {
    const r = footingFacePerimeters(42.96, 0.6)
    expect(r.value.outer).toBe(45.36)
    expect(r.value.inner).toBe(40.56)
  })

  it('wymiary zewnętrzne: 12 + 0,48 + 0,40 = 12,88 m; 9 + 0,48 + 0,40 = 9,88 m', () => {
    const r = outerDimensions(REF, T, E)
    expect(r.value).toEqual({ length: 12.88, width: 9.88 })
  })

  it('computeGeometry zbiera wszystkie wielkości', () => {
    const g = computeGeometry({ footprint: REF, wallThickness: T, facadeInsulation: E })
    expect(g.interiorPerimeter.value).toBe(42)
    expect(g.interiorArea.value).toBe(108)
    expect(g.axisPerimeter.value).toBe(42.96)
    expect(g.outerWallPerimeter.value).toBe(43.92)
    expect(g.insulationOuterPerimeter.value).toBe(45.52)
    expect(g.outerDimensions.value).toEqual({ length: 12.88, width: 9.88 })
  })

  it('trace obwodu w osi jest zgodny z wynikiem i odwołuje się do P_wew', () => {
    const r = axisPerimeter(42, T)
    expect(renderTrace(r.trace)).toBe(
      '1. Obwód w osi ściany: P_oś = P_wew + 4·t = 42 + 4 × 0,24 = 42,96 m  [→ geometry.P_wew]',
    )
    expect(r.trace.at(-1)!.result).toBe(r.value)
  })

  it('odrzuca błędne dane', () => {
    expect(() => interiorPerimeter({ kind: 'rect', length: 0, width: 9 })).toThrow()
    expect(() => axisPerimeter(42, -0.24)).toThrow()
    expect(() => footingFacePerimeters(4, 2)).toThrow()
  })
})
