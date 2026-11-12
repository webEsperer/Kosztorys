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

/**
 * Murowane ściany szczytowe główne (2 szt.) — trójkąt stojący na górze wieńca ścian nośnych.
 *   podstawa b = B_wew + 2·t (lico zewnętrzne muru, ściany prostopadłe do kalenicy)
 *   wysokość h = b/2 · tan α;  A_szczytu = b² / 4 · tan α;  razem 2 × A_szczytu (brutto, przed odjęciem okien)
 * Założenie: trójkąt pełny do linii połaci, bez odliczenia wieńca skośnego/kotwienia wiązarów.
 */
export function gableWallsGross(interiorSpan: number, wallThickness: number, pitchDeg: number): Computed {
  const base = clean(interiorSpan + 2 * wallThickness)
  const tan = Math.tan((pitchDeg * Math.PI) / 180)
  const h = clean((base / 2) * tan)
  const one = clean(((base * base) / 4) * tan)
  const v = clean(2 * one)
  return {
    value: v,
    unit: 'm²',
    trace: [
      st('Szczyt — podstawa (na wieńcu, lico zewn. muru)', 'b = B_wew + 2·t', `${fmt(interiorSpan)} + 2 × ${fmt(wallThickness)}`, base, 'm'),
      st('Szczyt — wysokość w kalenicy', 'h = b/2 × tan α', `${fmt(base)} / 2 × tan ${fmt(pitchDeg)}°`, h, 'm'),
      st('Ściana szczytowa (jedna)', 'b² / 4 × tan α', `${fmt(base)}² / 4 × tan ${fmt(pitchDeg)}°`, one, 'm²'),
      {
        ...st('Ściany szczytowe główne (2 szt.)', '2 × szczyt', `2 × ${fmt(one)}`, v, 'm²'),
        note: 'trójkąt od góry wieńca do linii połaci; bez odliczenia wieńca skośnego',
      },
    ],
  }
}

export interface GableFacadeInput {
  /** Rozpiętość wewnętrzna pod szczytem (bok prostopadły do kalenicy) [m]. */
  interiorSpan: number
  wallThickness: number
  pitchDeg: number
  /** Szczyty główne ocieplone wełną? */
  insulated: boolean
  /** Grubość wełny [m]. */
  woolThickness: number
  gableOpenings: Opening[]
  /** Szczyty daszków wykończone boazerią: pole trójkąta i czy ocieplone wełną. */
  dormers: { id: string; area: number; insulated: boolean }[]
}

export interface GableFacadeResult {
  /** Powierzchnia boazerii (szczyty główne + daszki w boazerii) [m²]. */
  cladding: Computed
  /** Powierzchnia ocieplona wełną (szczyty główne, jeśli ocieplone + daszki z wełną) [m²]. */
  wool: Computed
}

/**
 * Elewacja szczytów nad linią okapu (EPS ścian kończy się na linii okapu):
 *   szczyty główne: b = B_wew + 2·t + 2·g_wełny (bez wełny: B_wew + 2·t); 2 × b² / 4 · tan α − okna w szczytach
 *   + szczyty daszków w boazerii (z wełną lub bez).
 */
export function gableFacade(i: GableFacadeInput): GableFacadeResult {
  const w = i.insulated ? i.woolThickness : 0
  const base = clean(i.interiorSpan + 2 * i.wallThickness + 2 * w)
  const tan = Math.tan((i.pitchDeg * Math.PI) / 180)
  const one = clean(((base * base) / 4) * tan)
  const op = clean(i.gableOpenings.reduce((a, o) => a + o.width * o.height * o.count, 0))
  const main = clean(2 * one - op)
  const mainTrace: TraceStep[] = [
    i.insulated
      ? st('Szczyt — podstawa (lico wełny)', 'b = B_wew + 2·t + 2·g_wełny', `${fmt(i.interiorSpan)} + 2 × ${fmt(i.wallThickness)} + 2 × ${fmt(w)}`, base, 'm')
      : st('Szczyt — podstawa (lico muru, bez ocieplenia)', 'b = B_wew + 2·t', `${fmt(i.interiorSpan)} + 2 × ${fmt(i.wallThickness)}`, base, 'm'),
    st('Szczyt (jeden) nad linią okapu', 'b² / 4 × tan α', `${fmt(base)}² / 4 × tan ${fmt(i.pitchDeg)}°`, one, 'm²'),
    {
      ...st('Szczyty główne netto', '2 × szczyt − okna w szczytach', `2 × ${fmt(one)} − ${fmt(op)}`, main, 'm²'),
      note: `poniżej linii okapu EPS jak na ścianach; powyżej ${i.insulated ? `wełna skalna ${fmt(w * 100, 1)} cm + boazeria` : 'sama boazeria (bez ocieplenia)'}`,
    },
  ]
  const dAll = i.dormers
  const dIns = i.dormers.filter((d) => d.insulated)
  const sum = (xs: { area: number }[]) => clean(xs.reduce((s, d) => s + d.area, 0))
  const dormerStep = (xs: { id: string; area: number }[], label: string): TraceStep[] =>
    xs.length ? [st(label, 'Σ b_ściany² / 4 · tan β', xs.map((d) => `${d.id}: ${fmt(d.area)}`).join(' + '), sum(xs), 'm²')] : []

  const cl = clean(main + sum(dAll))
  const cladding: Computed = {
    value: cl,
    unit: 'm²',
    trace: [...mainTrace, ...dormerStep(dAll, 'Szczyty daszków w boazerii'), ...(dAll.length ? [st('Boazeria razem', 'szczyty główne + daszki', `${fmt(main)} + ${fmt(sum(dAll))}`, cl, 'm²')] : [])],
  }
  const mainWool = i.insulated ? main : 0
  const wl = clean(mainWool + sum(dIns))
  const wool: Computed = {
    value: wl,
    unit: 'm²',
    trace: [
      ...(i.insulated ? mainTrace : [st('Szczyty główne', 'bez ocieplenia (wybór użytkownika)', '0', 0, 'm²')]),
      ...dormerStep(dIns, 'Szczyty daszków z wełną'),
      ...(dIns.length ? [st('Wełna razem', 'szczyty główne + daszki z wełną', `${fmt(mainWool)} + ${fmt(sum(dIns))}`, wl, 'm²')] : []),
    ],
  }
  return { cladding, wool }
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
