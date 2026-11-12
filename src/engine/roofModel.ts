// Model geometryczny dachu do rysunków (SVG 3D, rzut, później three.js) — z wyników roof.ts.
// Komponenty niczego nie przeliczają: rysują połacie, krawędzie i wymiary z tego modułu.
//
// Układ [m]: x wzdłuż kalenicy (0…R, z okapami szczytowymi), y w poprzek (0 = okap przedni, D = okap tylny,
// D = B_z + 2 × okap boczny), z w górę od poziomu okapu głównego.

import type { Dormer, RoofInput, RoofResult } from './roof'
import { clean } from './trace'

export type V3 = [number, number, number]

export interface RoofFace {
  id: string
  label: string
  kind: 'main' | 'dormer' | 'gable' | 'dormerGable'
  points: V3[]
  /** Normalna zewnętrzna (jednostkowa). */
  normal: V3
  /** Powierzchnia rzeczywista [m²]. */
  area: number
  dormerId?: string
}

export type RoofEdgeKind = 'eave' | 'ridge' | 'valley' | 'verge'

export interface RoofEdge {
  id: string
  label: string
  kind: RoofEdgeKind
  points: [V3, V3]
  length: number
  dormerId?: string
}

export interface PlanDim {
  label: string
  a: [number, number]
  b: [number, number]
  /** Odsunięcie linii wymiarowej (w rzucie, prostopadle) [m]. */
  offset: number
}

export interface RoofModel {
  length: number
  depth: number
  ridgeHeight: number
  faces: RoofFace[]
  edges: RoofEdge[]
  dims: PlanDim[]
  /** Obrys ścian (lico EPS) w rzucie. */
  wallOutline: [number, number][]
}

const rad = (d: number) => (d * Math.PI) / 180

function sub(a: V3, b: V3): V3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}
function cross(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}
function len(a: V3): number {
  return Math.hypot(a[0], a[1], a[2])
}

/** Pole wielokąta płaskiego w 3D (wzór Newella). */
export function polygonArea(pts: V3[]): number {
  let n: V3 = [0, 0, 0]
  for (let i = 0; i < pts.length; i++) {
    const c = cross(pts[i], pts[(i + 1) % pts.length])
    n = [n[0] + c[0], n[1] + c[1], n[2] + c[2]]
  }
  return clean(len(n) / 2)
}

function edge(id: string, label: string, kind: RoofEdgeKind, a: V3, b: V3, dormerId?: string): RoofEdge {
  return { id, label, kind, points: [a, b], length: clean(len(sub(b, a))), ...(dormerId ? { dormerId } : {}) }
}

/** Buduje model dachu. Daszki z Δh < 0 (do ręcznego podania) pomijane. */
export function buildRoofModel(input: RoofInput, r: RoofResult): RoofModel {
  const L = r.ridgeLength
  const run = clean(r.span / 2 + input.eaveOverhang)
  const D = clean(2 * run)
  const ta = Math.tan(rad(input.pitchDeg))
  const H = clean(run * ta)
  const sa = Math.sin(rad(input.pitchDeg))
  const ca = Math.cos(rad(input.pitchDeg))

  const valid = input.dormers.filter((d) => d.dh >= 0 && r.dormers.some((x) => x.id === d.id))
  const faces: RoofFace[] = []
  const edges: RoofEdge[] = []
  let kNo = 0

  for (const side of ['przód', 'tył'] as const) {
    // Geometria liczona dla przodu; tył = odbicie y → D − y.
    const m = (p: V3): V3 => (side === 'przód' ? p : [p[0], D - p[1], p[2]])
    const ds = valid.filter((d) => d.side === side).sort((a, b) => a.position - b.position)
    const pts: V3[] = [[0, 0, 0]]
    let eaveStart = 0
    for (const dm of ds) {
      const res = r.dormers.find((x) => x.id === dm.id)!
      const tb = Math.tan(rad(dm.betaDeg))
      const x1 = dm.position
      const x2 = dm.position + dm.b
      const xc = dm.position + dm.b / 2
      const hd = clean(dm.dh + (dm.b / 2) * tb)
      const yV = res.x0 + res.d
      pts.push([x1, 0, 0], [x1, res.x0, dm.dh], [xc, yV, hd], [x2, res.x0, dm.dh], [x2, 0, 0])
      edges.push(edge(`${side}-okap-${dm.id}-l`, 'Okap główny', 'eave', m([eaveStart, 0, 0]), m([x1, 0, 0])))
      eaveStart = x2
      // Daszek: połacie, szczyt, krawędzie
      const sb = Math.sin(rad(dm.betaDeg))
      const cb = Math.cos(rad(dm.betaDeg))
      const left: V3[] = [[x1, -dm.w, dm.dh], [x1, res.x0, dm.dh], [xc, yV, hd], [xc, -dm.w, hd]]
      const right: V3[] = [[x2, -dm.w, dm.dh], [xc, -dm.w, hd], [xc, yV, hd], [x2, res.x0, dm.dh]]
      const gable: V3[] = [[x1, -dm.w, dm.dh], [x2, -dm.w, dm.dh], [xc, -dm.w, hd]]
      const ny = side === 'przód' ? 1 : -1
      faces.push(
        { id: `${dm.id}-l`, label: `${dm.id} lewa`, kind: 'dormer', points: left.map(m), normal: [-sb, 0, cb], area: polygonArea(left), dormerId: dm.id },
        { id: `${dm.id}-p`, label: `${dm.id} prawa`, kind: 'dormer', points: right.map(m), normal: [sb, 0, cb], area: polygonArea(right), dormerId: dm.id },
        { id: `${dm.id}-szczyt`, label: `${dm.id} szczyt`, kind: 'dormerGable', points: gable.map(m), normal: [0, -ny, 0], area: polygonArea(gable), dormerId: dm.id },
      )
      kNo++
      edges.push(edge(`K${kNo}`, `K${kNo}`, 'valley', m([x1, res.x0, dm.dh]), m([xc, yV, hd]), dm.id))
      kNo++
      edges.push(edge(`K${kNo}`, `K${kNo}`, 'valley', m([x2, res.x0, dm.dh]), m([xc, yV, hd]), dm.id))
      edges.push(edge(`${dm.id}-kalenica`, `Kalenica ${dm.id}`, 'ridge', m([xc, -dm.w, hd]), m([xc, yV, hd]), dm.id))
      edges.push(edge(`${dm.id}-okap-l`, `Okap ${dm.id}`, 'eave', m([x1, -dm.w, dm.dh]), m([x1, res.x0, dm.dh]), dm.id))
      edges.push(edge(`${dm.id}-okap-p`, `Okap ${dm.id}`, 'eave', m([x2, -dm.w, dm.dh]), m([x2, res.x0, dm.dh]), dm.id))
      edges.push(edge(`${dm.id}-wiatr-l`, `Wiatrownica ${dm.id}`, 'verge', m([x1, -dm.w, dm.dh]), m([xc, -dm.w, hd]), dm.id))
      edges.push(edge(`${dm.id}-wiatr-p`, `Wiatrownica ${dm.id}`, 'verge', m([x2, -dm.w, dm.dh]), m([xc, -dm.w, hd]), dm.id))
    }
    pts.push([L, 0, 0], [L, run, H], [0, run, H])
    edges.push(edge(`${side}-okap-end`, 'Okap główny', 'eave', m([eaveStart, 0, 0]), m([L, 0, 0])))
    faces.push({
      id: side === 'przód' ? 'P1' : 'P2',
      label: side === 'przód' ? 'P1' : 'P2',
      kind: 'main',
      points: pts.map(m),
      normal: side === 'przód' ? [0, -sa, ca] : [0, sa, ca],
      area: polygonArea(pts),
    })
    edges.push(edge(`${side}-wiatr-l`, 'Wiatrownica', 'verge', m([0, 0, 0]), m([0, run, H])))
    edges.push(edge(`${side}-wiatr-p`, 'Wiatrownica', 'verge', m([L, 0, 0]), m([L, run, H])))
  }
  edges.push(edge('kalenica', 'Kalenica', 'ridge', [0, run, H], [L, run, H]))
  faces.push(
    { id: 'szczyt-l', label: 'Szczyt lewy', kind: 'gable', points: [[0, 0, 0], [0, D, 0], [0, run, H]], normal: [-1, 0, 0], area: clean(run * H) },
    { id: 'szczyt-p', label: 'Szczyt prawy', kind: 'gable', points: [[L, 0, 0], [L, run, H], [L, D, 0]], normal: [1, 0, 0], area: clean(run * H) },
  )

  // Wymiary w rzucie
  const go = input.gableOverhang
  const eo = input.eaveOverhang
  const dims: PlanDim[] = [
    { label: `R = ${fmtM(L)}`, a: [0, D], b: [L, D], offset: 1.2 },
    { label: `D = ${fmtM(D)}`, a: [L, 0], b: [L, D], offset: 1.2 },
    { label: `okap szczyt. ${fmtM(go)}`, a: [0, D], b: [go, D], offset: 0.6 },
    { label: `okap bocz. ${fmtM(eo)}`, a: [0, D - eo], b: [0, D], offset: -0.6 },
  ]
  for (const dm of valid) {
    const res = r.dormers.find((x) => x.id === dm.id)!
    const f = dm.side === 'przód'
    const yE = f ? 0 : D
    const out = f ? -dm.w : D + dm.w
    dims.push({ label: `${dm.id}: b = ${fmtM(dm.b)}`, a: [dm.position, out], b: [dm.position + dm.b, out], offset: f ? -0.6 : 0.6 })
    dims.push({ label: `w = ${fmtM(dm.w)}`, a: [dm.position + dm.b, yE], b: [dm.position + dm.b, out], offset: 0.5 })
    dims.push({ label: `d = ${fmtM(res.d)}`, a: [dm.position + dm.b / 2, f ? res.x0 : D - res.x0], b: [dm.position + dm.b / 2, f ? res.x0 + res.d : D - res.x0 - res.d], offset: 0.4 })
    dims.push({ label: `od narożnika ${fmtM(dm.position)}`, a: [0, yE], b: [dm.position, yE], offset: f ? -0.4 : 0.4 })
  }
  const wallOutline: [number, number][] = [
    [go, eo],
    [L - go, eo],
    [L - go, D - eo],
    [go, D - eo],
  ]
  return { length: L, depth: D, ridgeHeight: H, faces, edges, dims, wallOutline }
}

function fmtM(x: number): string {
  return `${x.toLocaleString('pl-PL', { maximumFractionDigits: 2 })} m`
}

export function dormerById(input: RoofInput, id: string): Dormer | undefined {
  return input.dormers.find((d) => d.id === id)
}
