// Geometria rzutu: obwody (wewnętrzny, w osi, zewnętrzne), pola, wymiary zewnętrzne.
// Wszystkie wymiary w metrach.
//
// Dla obrysu prostokątnego wielokątnego (narożniki wypukłe − wklęsłe = 4):
//   P(d) = P_wew + 8·d, gdzie d = odsunięcie od lica wewnętrznego na zewnątrz.
// Na razie obsługiwany jest prostokąt; funkcje obwodów przyjmują P_wew jako liczbę,
// więc zadziałają też dla wielokąta, gdy dojdzie tryb rozszerzony.

import { type Computed, type Traced, clean, fmt, fmtP } from './trace'

export interface RectFootprint {
  kind: 'rect'
  /** Długość wewnętrzna [m]. */
  length: number
  /** Szerokość wewnętrzna [m]. */
  width: number
}

export type Footprint = RectFootprint

/** Identyfikatory wielkości pochodnych (do klikalnych odwołań w trace). */
export const GEOMETRY_REFS = {
  interiorPerimeter: 'geometry.P_wew',
  interiorArea: 'geometry.A_wew',
  axisPerimeter: 'geometry.P_os',
} as const

function assertPositive(name: string, x: number): void {
  if (!(x > 0)) throw new Error(`${name} musi być większe od zera (podano ${x}).`)
}

function assertNonNegative(name: string, x: number): void {
  if (!(x >= 0)) throw new Error(`${name} nie może być ujemne (podano ${x}).`)
}

/** Obwód wewnętrzny P_wew. */
export function interiorPerimeter(f: Footprint): Computed {
  assertPositive('Długość wewnętrzna', f.length)
  assertPositive('Szerokość wewnętrzna', f.width)
  const value = clean(2 * (f.length + f.width))
  return {
    value,
    unit: 'm',
    trace: [
      {
        label: 'Obwód wewnętrzny',
        formula: 'P_wew = 2 × (L_wew + B_wew)',
        values: `2 × (${fmt(f.length)} + ${fmt(f.width)})`,
        result: value,
        unit: 'm',
      },
    ],
  }
}

/** Pole wewnętrzne A_wew. */
export function interiorArea(f: Footprint): Computed {
  assertPositive('Długość wewnętrzna', f.length)
  assertPositive('Szerokość wewnętrzna', f.width)
  const value = clean(f.length * f.width)
  return {
    value,
    unit: 'm²',
    trace: [
      {
        label: 'Pole wewnętrzne',
        formula: 'A_wew = L_wew × B_wew',
        values: `${fmt(f.length)} × ${fmt(f.width)}`,
        result: value,
        unit: 'm²',
      },
    ],
  }
}

/** Obwód linii odsuniętej o d od lica wewnętrznego: P(d) = P_wew + 8·d. */
export function perimeterAtOffset(pWew: number, d: number, label = 'Obwód w odsunięciu d'): Computed {
  assertPositive('Obwód wewnętrzny', pWew)
  const value = clean(pWew + 8 * d)
  return {
    value,
    unit: 'm',
    trace: [
      {
        label,
        formula: 'P(d) = P_wew + 8·d',
        values: `${fmt(pWew)} + 8 × ${fmtP(d)}`,
        result: value,
        unit: 'm',
        ref: GEOMETRY_REFS.interiorPerimeter,
      },
    ],
  }
}

/** Obwód w osi ściany grubości t: P_oś = P_wew + 4·t. */
export function axisPerimeter(pWew: number, t: number): Computed {
  assertPositive('Grubość ściany', t)
  const value = clean(pWew + 4 * t)
  return {
    value,
    unit: 'm',
    trace: [
      {
        label: 'Obwód w osi ściany',
        formula: 'P_oś = P_wew + 4·t',
        values: `${fmt(pWew)} + 4 × ${fmt(t)}`,
        result: value,
        unit: 'm',
        ref: GEOMETRY_REFS.interiorPerimeter,
      },
    ],
  }
}

/** Obwód lica zewnętrznego ściany: P_zew = P_wew + 8·t. */
export function outerWallPerimeter(pWew: number, t: number): Computed {
  assertPositive('Grubość ściany', t)
  const value = clean(pWew + 8 * t)
  return {
    value,
    unit: 'm',
    trace: [
      {
        label: 'Obwód lica zewnętrznego ściany',
        formula: 'P_zew = P_wew + 8·t',
        values: `${fmt(pWew)} + 8 × ${fmt(t)}`,
        result: value,
        unit: 'm',
        ref: GEOMETRY_REFS.interiorPerimeter,
      },
    ],
  }
}

/** Obwód lica zewnętrznego EPS grubości e: P_EPS = P_wew + 8·(t + e). */
export function insulationOuterPerimeter(pWew: number, t: number, e: number): Computed {
  assertPositive('Grubość ściany', t)
  assertNonNegative('Grubość izolacji', e)
  const value = clean(pWew + 8 * (t + e))
  return {
    value,
    unit: 'm',
    trace: [
      {
        label: 'Obwód lica zewnętrznego izolacji',
        formula: 'P_iz = P_wew + 8·(t + e)',
        values: `${fmt(pWew)} + 8 × (${fmt(t)} + ${fmt(e)})`,
        result: value,
        unit: 'm',
        ref: GEOMETRY_REFS.interiorPerimeter,
      },
    ],
  }
}

/**
 * Obwód w połowie grubości warstwy izolacji (do powierzchni liczonej „na płasko”).
 * Warstwa zaczyna się w odsunięciu `start` od lica wewnętrznego (np. t — lico zewnętrzne ściany)
 * i ma grubość `thickness`: P_śr = P_wew + 8·(start + thickness/2).
 */
export function layerMidPerimeter(
  pWew: number,
  start: number,
  thickness: number,
  label = 'Obwód w połowie grubości warstwy',
): Computed {
  assertNonNegative('Odsunięcie warstwy', start)
  assertPositive('Grubość warstwy', thickness)
  const value = clean(pWew + 8 * (start + thickness / 2))
  return {
    value,
    unit: 'm',
    trace: [
      {
        label,
        formula: 'P_śr = P_wew + 8·(d₀ + g/2)',
        values: `${fmt(pWew)} + 8 × (${fmt(start)} + ${fmt(thickness)} / 2)`,
        result: value,
        unit: 'm',
        ref: GEOMETRY_REFS.interiorPerimeter,
      },
    ],
  }
}

/** Obwody lic ławy szerokości b (oś ławy = oś ściany): P_oś ± 4·b. */
export function footingFacePerimeters(pAxis: number, b: number): Traced<{ outer: number; inner: number }> {
  assertPositive('Szerokość ławy', b)
  const outer = clean(pAxis + 4 * b)
  const inner = clean(pAxis - 4 * b)
  if (!(inner > 0)) throw new Error('Ława jest szersza niż pozwala obrys budynku.')
  return {
    value: { outer, inner },
    trace: [
      {
        label: 'Obwód zewnętrznego lica ławy',
        formula: 'P_ł,zew = P_oś + 4·b',
        values: `${fmt(pAxis)} + 4 × ${fmt(b)}`,
        result: outer,
        unit: 'm',
        ref: GEOMETRY_REFS.axisPerimeter,
      },
      {
        label: 'Obwód wewnętrznego lica ławy',
        formula: 'P_ł,wew = P_oś − 4·b',
        values: `${fmt(pAxis)} − 4 × ${fmt(b)}`,
        result: inner,
        unit: 'm',
        ref: GEOMETRY_REFS.axisPerimeter,
      },
    ],
  }
}

/** Wymiary zewnętrzne prostokąta (z izolacją): L_z = L_wew + 2t + 2e, B_z = B_wew + 2t + 2e. */
export function outerDimensions(
  f: RectFootprint,
  t: number,
  e: number,
): Traced<{ length: number; width: number }> {
  assertPositive('Grubość ściany', t)
  assertNonNegative('Grubość izolacji', e)
  const length = clean(f.length + 2 * t + 2 * e)
  const width = clean(f.width + 2 * t + 2 * e)
  return {
    value: { length, width },
    trace: [
      {
        label: 'Długość zewnętrzna (z izolacją)',
        formula: 'L_z = L_wew + 2·t + 2·e',
        values: `${fmt(f.length)} + 2 × ${fmt(t)} + 2 × ${fmt(e)}`,
        result: length,
        unit: 'm',
      },
      {
        label: 'Szerokość zewnętrzna (z izolacją)',
        formula: 'B_z = B_wew + 2·t + 2·e',
        values: `${fmt(f.width)} + 2 × ${fmt(t)} + 2 × ${fmt(e)}`,
        result: width,
        unit: 'm',
      },
    ],
  }
}

export interface GeometryInput {
  footprint: RectFootprint
  /** Grubość ściany nośnej t [m] (H+H Gold 24 → 0,24). */
  wallThickness: number
  /** Grubość EPS na elewacji e [m] (domyślnie 0,20). */
  facadeInsulation: number
}

export interface GeometryResult {
  interiorPerimeter: Computed
  interiorArea: Computed
  axisPerimeter: Computed
  outerWallPerimeter: Computed
  insulationOuterPerimeter: Computed
  outerDimensions: Traced<{ length: number; width: number }>
}

/** Wszystkie podstawowe wielkości geometryczne budynku. */
export function computeGeometry(input: GeometryInput): GeometryResult {
  const { footprint, wallThickness: t, facadeInsulation: e } = input
  const pWew = interiorPerimeter(footprint)
  return {
    interiorPerimeter: pWew,
    interiorArea: interiorArea(footprint),
    axisPerimeter: axisPerimeter(pWew.value, t),
    outerWallPerimeter: outerWallPerimeter(pWew.value, t),
    insulationOuterPerimeter: insulationOuterPerimeter(pWew.value, t, e),
    outerDimensions: outerDimensions(footprint, t, e),
  }
}
