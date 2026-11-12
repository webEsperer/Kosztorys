// Elewacja: EPS do linii podbitki, szczyty z wełną i boazerią, podbitka (CLAUDE.md „Elewacja”).
// Wymiary w metrach.

import type { Opening } from './openings'
import type { RoofResult } from './roof'
import { type Computed, type TraceStep, clean, fmt } from './trace'

export interface FacadeInput {
  /** Obwód wewnętrzny P_wew [m]. */
  interiorPerimeter: number
  wallThickness: number
  eps: number
  /** Rzędna dołu EPS (= góra XPS) [m]. */
  epsBottom: number
  /** Rzędna linii podbitki [m]. */
  soffitLevel: number
  /** Otwory w ścianach zewnętrznych (bez szczytów). */
  wallOpenings: Opening[]
}

export interface FacadeResult {
  height: Computed
  midPerimeter: Computed
  grossArea: Computed
  openingsArea: number
  netArea: Computed
  /** Listwa startowa — obwód lica zewnętrznego ściany (pod EPS). */
  startRail: Computed
  /** Narożniki z siatką: 4 naroża × wysokość + ościeża (2h + w na otwór). */
  cornerBeads: Computed
  /** Listwy APU: obwody okien i drzwi. */
  apu: Computed
  /** Obwody otworów (do ościeży). */
  openingPerimeters: number
}

const st = (label: string, formula: string, values: string, result: number, unit: string): TraceStep => ({ label, formula, values, result: clean(result), unit })

export function computeFacade(i: FacadeInput): FacadeResult {
  const h = clean(i.soffitLevel - i.epsBottom)
  const height: Computed = { value: h, unit: 'm', trace: [st('Wysokość EPS', 'linia podbitki − dół EPS', `${fmt(i.soffitLevel)} − (${fmt(i.epsBottom)})`, h, 'm')] }
  const per = clean(i.interiorPerimeter + 8 * (i.wallThickness + i.eps / 2))
  const midPerimeter: Computed = { value: per, unit: 'm', trace: [st('Obwód w połowie EPS', 'P_wew + 8·(t + e/2)', `${fmt(i.interiorPerimeter)} + 8 × (${fmt(i.wallThickness)} + ${fmt(i.eps)} / 2)`, per, 'm')] }
  const gross = clean(per * h)
  const grossArea: Computed = { value: gross, unit: 'm²', trace: [...midPerimeter.trace, ...height.trace, st('Powierzchnia EPS brutto', 'obwód × wysokość', `${fmt(per)} × ${fmt(h)}`, gross, 'm²')] }
  const op = clean(i.wallOpenings.reduce((a, o) => a + o.width * o.height * o.count, 0))
  const net = clean(gross - op)
  const netArea: Computed = {
    value: net,
    unit: 'm²',
    trace: [
      ...grossArea.trace,
      st('Otwory', 'Σ szer × wys × liczba', i.wallOpenings.map((o) => `${o.mark}: ${fmt(o.width)} × ${fmt(o.height)} × ${o.count}`).join(' + ') || '0', op, 'm²'),
      st('Powierzchnia EPS netto', 'brutto − otwory', `${fmt(gross)} − ${fmt(op)}`, net, 'm²'),
    ],
  }
  const outer = clean(i.interiorPerimeter + 8 * i.wallThickness)
  const startRail: Computed = { value: outer, unit: 'm', trace: [st('Listwa startowa', 'P_wew + 8·t (lico zewn. ściany)', `${fmt(i.interiorPerimeter)} + 8 × ${fmt(i.wallThickness)}`, outer, 'm')] }
  const reveals = clean(i.wallOpenings.reduce((a, o) => a + (2 * o.height + o.width) * o.count, 0))
  const cb = clean(4 * h + reveals)
  const cornerBeads: Computed = { value: cb, unit: 'm', trace: [st('Narożniki z siatką', '4 × wysokość + Σ (2h + w) × liczba', `4 × ${fmt(h)} + ${fmt(reveals)}`, cb, 'm')] }
  const perims = clean(i.wallOpenings.reduce((a, o) => a + 2 * (o.width + o.height) * o.count, 0))
  const apu: Computed = { value: perims, unit: 'm', trace: [st('Listwy APU', 'Σ 2 × (w + h) × liczba', i.wallOpenings.map((o) => `2 × (${fmt(o.width)} + ${fmt(o.height)}) × ${o.count}`).join(' + ') || '0', perims, 'm')] }
  return { height, midPerimeter, grossArea, openingsArea: op, netArea, startRail, cornerBeads, apu, openingPerimeters: perims }
}

/** Szczyty (2 szt.) nad linią okapu: B_z² / 4 × tan α każdy, minus okna w szczytach. */
export function gablesArea(span: number, pitchDeg: number, gableOpenings: Opening[]): Computed {
  const one = clean(((span * span) / 4) * Math.tan((pitchDeg * Math.PI) / 180))
  const op = clean(gableOpenings.reduce((a, o) => a + o.width * o.height * o.count, 0))
  const v = clean(2 * one - op)
  return {
    value: v,
    unit: 'm²',
    trace: [
      st('Szczyt (jeden)', 'B_z² / 4 × tan α', `${fmt(span)}² / 4 × tan ${fmt(pitchDeg)}°`, one, 'm²'),
      st('Szczyty netto', '2 × szczyt − okna w szczytach', `2 × ${fmt(one)} − ${fmt(op)}`, v, 'm²'),
    ],
  }
}

/** Podbitka: okapy boczne 2 × R × okap_b + szczytowe 4 × s × okap_s − narożniki (liczone podwójnie). */
export function soffitArea(roof: RoofResult, eaveOverhang: number, gableOverhang: number, pitchDeg: number): Computed {
  const side = clean(2 * roof.ridgeLength * eaveOverhang)
  const gable = clean(4 * roof.slope * gableOverhang)
  const corners = clean((4 * eaveOverhang * gableOverhang) / Math.cos((pitchDeg * Math.PI) / 180))
  const v = clean(side + gable - corners)
  return {
    value: v,
    unit: 'm²',
    trace: [
      st('Podbitka — okapy boczne', '2 × R × okap boczny', `2 × ${fmt(roof.ridgeLength)} × ${fmt(eaveOverhang)}`, side, 'm²'),
      st('Podbitka — okapy szczytowe', '4 × s × okap szczytowy', `4 × ${fmt(roof.slope)} × ${fmt(gableOverhang)}`, gable, 'm²'),
      st('Narożniki (policzone podwójnie)', '4 × okap_b / cos α × okap_s', `4 × ${fmt(eaveOverhang)} / cos ${fmt(pitchDeg)}° × ${fmt(gableOverhang)}`, corners, 'm²'),
      st('Podbitka', 'boczne + szczytowe − narożniki', `${fmt(side)} + ${fmt(gable)} − ${fmt(corners)}`, v, 'm²'),
    ],
  }
}
