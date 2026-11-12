// Model 3D domu — czyste dane (bez three.js): bryły ścian z otworami, okna/drzwi, posadzka, dach z połaciami
// i daszkami (z roof.ts / roofModel.ts), szczyty, podbitka. Komponenty tylko renderują.
//
// Układ budynku [m]: x wzdłuż długości wewnętrznej L (0…L), y wzdłuż szerokości B (0…B), z w górę (±0 = posadzka).
// Ściana S1 lewa (x < 0), S2 górna (y > B), S3 prawa (x > L), S4 dolna (y < 0) — jak w edytorze rzutu.

import type { ProjectInput } from '../model/project'
import { layoutOpenings, type PlacedOpening } from './openingsLayout'
import { buildRoofModel, type RoofFace, type V3 } from './roofModel'
import { projectBase } from './stages/common'
import { roofOf } from './stages/sszRoof'
import { clean } from './trace'

export type BoxKind = 'wall' | 'eps' | 'floor' | 'glass' | 'frame' | 'door' | 'sill'

export interface Box3 {
  id: string
  kind: BoxKind
  /** Środek i wymiary prostopadłościanu w układzie budynku. */
  center: V3
  size: V3
  /** Element źródłowy (np. ściana S2, otwór O1#0). */
  ref: string
}

export type PolyKind = RoofFace['kind'] | 'gableWall' | 'soffit'

export interface Poly3 {
  id: string
  kind: PolyKind
  label: string
  points: V3[]
  normal: V3
}

export interface HouseModel {
  boxes: Box3[]
  polys: Poly3[]
  /** Zakres modelu (do kamery). */
  bounds: { min: V3; max: V3 }
  /** Poziom terenu przyjęty na rysunku (dół EPS). */
  groundZ: number
  ringTop: number
  ridgeZ: number | null
  missing: string[]
}

interface Interval {
  a: number
  b: number
  z0: number
  z1: number
}

/** Prostokąt ściany [u0,u1]×[z0,z1] pomniejszony o otwory → lista prostokątów (kolumny między krawędziami otworów). */
export function wallPieces(u0: number, u1: number, z0: number, z1: number, holes: Interval[]): Interval[] {
  const cuts = [u0, u1, ...holes.flatMap((h) => [Math.max(u0, h.a), Math.min(u1, h.b)])].filter((v) => v >= u0 && v <= u1)
  const xs = [...new Set(cuts.map((v) => clean(v)))].sort((p, q) => p - q)
  const out: Interval[] = []
  for (let i = 0; i < xs.length - 1; i++) {
    const a = xs[i]
    const b = xs[i + 1]
    if (b - a < 1e-6) continue
    const mid = (a + b) / 2
    const over = holes.filter((h) => h.a <= mid && h.b >= mid).map((h) => [Math.max(z0, h.z0), Math.min(z1, h.z1)] as const).sort((p, q) => p[0] - q[0])
    let z = z0
    for (const [h0, h1] of over) {
      if (h0 > z + 1e-6) out.push({ a, b, z0: z, z1: h0 })
      z = Math.max(z, h1)
    }
    if (z1 > z + 1e-6) out.push({ a, b, z0: z, z1 })
  }
  return out
}

export function buildHouseModel(project: ProjectInput): HouseModel {
  const missing: string[] = []
  const base = projectBase(project)
  const L = project.footprint.length
  const B = project.footprint.width
  const t = project.wallThickness
  const e = project.facadeInsulation
  const ringTop = base.ringTop.value
  if (base.slabTop === null) missing.push(...base.floorMissing)
  const slabTop = base.slabTop ?? -0.23
  const epsBottom = clean(slabTop - 0.03)
  const boxes: Box3[] = []
  const polys: Poly3[] = []

  // ── Ściany z otworami (mur + EPS)
  const layout = layoutOpenings(project.openings, L, B, project.planRules.minPier)
  const byWall = (id: string) => layout.placed.filter((p) => p.wallId === id)
  // u: współrzędna wzdłuż osi x (S2, S4) lub y (S1, S3); otwór z offsetu i kierunku ściany
  const holeU = (p: PlacedOpening): [number, number] => {
    switch (p.wallId) {
      case 'S1':
        return [p.offset, p.offset + p.width]
      case 'S2':
        return [p.offset, p.offset + p.width]
      case 'S3':
        return [B - p.offset - p.width, B - p.offset]
      default:
        return [L - p.offset - p.width, L - p.offset]
    }
  }
  const holes = (id: string): Interval[] =>
    byWall(id).map((p) => {
      const [a, b] = holeU(p)
      return { a, b, z0: p.sillHeight, z1: p.sillHeight + p.height }
    })

  type WallDef = { id: string; axis: 'x' | 'y'; u0: number; u1: number; d0: number; d1: number; e0: number; e1: number; eu0: number; eu1: number }
  // d — współrzędna prostopadła muru (od lica wewn. do zewn.), e — warstwy EPS
  const walls: WallDef[] = [
    { id: 'S1', axis: 'y', u0: 0, u1: B, d0: -t, d1: 0, e0: -t - e, e1: -t, eu0: -t, eu1: B + t },
    { id: 'S2', axis: 'x', u0: -t, u1: L + t, d0: B, d1: B + t, e0: B + t, e1: B + t + e, eu0: -t - e, eu1: L + t + e },
    { id: 'S3', axis: 'y', u0: 0, u1: B, d0: L, d1: L + t, e0: L + t, e1: L + t + e, eu0: -t, eu1: B + t },
    { id: 'S4', axis: 'x', u0: -t, u1: L + t, d0: -t, d1: 0, e0: -t - e, e1: -t, eu0: -t - e, eu1: L + t + e },
  ]
  const pushBox = (id: string, kind: BoxKind, axis: 'x' | 'y', u: [number, number], d: [number, number], z: [number, number], ref: string) => {
    const cu = (u[0] + u[1]) / 2
    const cd = (d[0] + d[1]) / 2
    const cz = (z[0] + z[1]) / 2
    const su = u[1] - u[0]
    const sd = d[1] - d[0]
    const sz = z[1] - z[0]
    boxes.push({
      id,
      kind,
      ref,
      center: axis === 'x' ? [cu, cd, cz] : [cd, cu, cz],
      size: axis === 'x' ? [su, sd, sz] : [sd, su, sz],
    })
  }
  for (const w of walls) {
    const hs = holes(w.id)
    wallPieces(w.u0, w.u1, slabTop, ringTop, hs).forEach((p, i) => pushBox(`${w.id}-mur-${i}`, 'wall', w.axis, [p.a, p.b], [w.d0, w.d1], [p.z0, p.z1], w.id))
    wallPieces(w.eu0, w.eu1, epsBottom, ringTop, hs).forEach((p, i) => pushBox(`${w.id}-eps-${i}`, 'eps', w.axis, [p.a, p.b], [w.e0, w.e1], [p.z0, p.z1], w.id))
    // stolarka w środku grubości muru
    for (const p of byWall(w.id)) {
      const [a, b] = holeU(p)
      const mid = (w.d0 + w.d1) / 2
      const fr = 0.07
      const z0 = p.sillHeight
      const z1 = p.sillHeight + p.height
      if (p.type === 'okno') {
        pushBox(`${p.key}-szyba`, 'glass', w.axis, [a + fr, b - fr], [mid - 0.012, mid + 0.012], [z0 + fr, z1 - fr], p.key)
        pushBox(`${p.key}-rama-d`, 'frame', w.axis, [a, b], [mid - 0.04, mid + 0.04], [z0, z0 + fr], p.key)
        pushBox(`${p.key}-rama-g`, 'frame', w.axis, [a, b], [mid - 0.04, mid + 0.04], [z1 - fr, z1], p.key)
        pushBox(`${p.key}-rama-l`, 'frame', w.axis, [a, a + fr], [mid - 0.04, mid + 0.04], [z0 + fr, z1 - fr], p.key)
        pushBox(`${p.key}-rama-p`, 'frame', w.axis, [b - fr, b], [mid - 0.04, mid + 0.04], [z0 + fr, z1 - fr], p.key)
        // parapet zewnętrzny: od muru do lica EPS + 4 cm
        const outer = w.e1 > w.d1 ? [w.d1, w.e1 + 0.04] : [w.e0 - 0.04, w.d0]
        pushBox(`${p.key}-parapet`, 'sill', w.axis, [a - 0.03, b + 0.03], [outer[0], outer[1]], [z0 - 0.03, z0], p.key)
      } else {
        pushBox(`${p.key}-skrzydlo`, 'door', w.axis, [a + 0.05, b - 0.05], [mid - 0.025, mid + 0.025], [z0, z1 - 0.05], p.key)
        pushBox(`${p.key}-oscieznica`, 'frame', w.axis, [a, b], [mid - 0.04, mid + 0.04], [z1 - 0.05, z1], p.key)
      }
    }
  }
  // posadzka
  boxes.push({ id: 'posadzka', kind: 'floor', ref: 'posadzka', center: [L / 2, B / 2, -0.01], size: [L, B, 0.02] })

  // ── Dach, szczyty, podbitka
  let ridgeZ: number | null = null
  const { roof, input, missing: roofMissing } = roofOf(project)
  if (!roof || !input) missing.push(...roofMissing)
  else {
    const rm = buildRoofModel(input, roof)
    const Lz = L + 2 * (t + e)
    const ridgeAlongX = Math.abs(roof.length - Lz) < 1e-6
    const go = input.gableOverhang
    const eo = input.eaveOverhang
    const off = t + e
    // roof (x wzdłuż kalenicy, y w poprzek, z od okapu) → budynek
    const map = ([rx, ry, rz]: V3): V3 =>
      ridgeAlongX ? [rx - go - off, ry - eo - off, rz + ringTop] : [L + off + eo - ry, rx - go - off, rz + ringTop]
    const mapN = ([nx, ny, nz]: V3): V3 => (ridgeAlongX ? [nx, ny, nz] : [-ny, nx, nz])
    for (const f of rm.faces) {
      if (f.kind === 'gable') continue // szczyty rysowane w płaszczyźnie ściany (niżej)
      polys.push({ id: f.id, kind: f.kind, label: f.label, points: f.points.map(map), normal: mapN(f.normal) })
    }
    ridgeZ = clean(ringTop + rm.ridgeHeight)
    // ściany szczytowe (pięciokąty w płaszczyźnie lica EPS): od wieńca do spodu połaci
    const tan = Math.tan((input.pitchDeg * Math.PI) / 180)
    const half = roof.span / 2
    const atWall = ringTop + eo * tan
    const apex = ringTop + (half + eo) * tan
    if (ridgeAlongX) {
      for (const [x, nx, id] of [
        [-off, -1, 'szczyt-l'],
        [L + off, 1, 'szczyt-p'],
      ] as const) {
        polys.push({
          id,
          kind: 'gableWall',
          label: id === 'szczyt-l' ? 'Szczyt lewy' : 'Szczyt prawy',
          points: [[x, -off, ringTop], [x, B + off, ringTop], [x, B + off, atWall], [x, B / 2, apex], [x, -off, atWall]],
          normal: [nx, 0, 0],
        })
      }
      // podbitka okapów (przód / tył) na poziomie wieńca
      polys.push({ id: 'podbitka-przod', kind: 'soffit', label: 'Podbitka', points: [[-off - go, -off - eo, ringTop], [L + off + go, -off - eo, ringTop], [L + off + go, -off, ringTop], [-off - go, -off, ringTop]], normal: [0, 0, -1] })
      polys.push({ id: 'podbitka-tyl', kind: 'soffit', label: 'Podbitka', points: [[-off - go, B + off, ringTop], [L + off + go, B + off, ringTop], [L + off + go, B + off + eo, ringTop], [-off - go, B + off + eo, ringTop]], normal: [0, 0, -1] })
    } else {
      for (const [y, ny, id] of [
        [-off, -1, 'szczyt-l'],
        [B + off, 1, 'szczyt-p'],
      ] as const) {
        polys.push({
          id,
          kind: 'gableWall',
          label: id === 'szczyt-l' ? 'Szczyt dolny' : 'Szczyt górny',
          points: [[-off, y, ringTop], [L + off, y, ringTop], [L + off, y, atWall], [L / 2, y, apex], [-off, y, atWall]],
          normal: [0, ny, 0],
        })
      }
      polys.push({ id: 'podbitka-przod', kind: 'soffit', label: 'Podbitka', points: [[L + off, -off - go, ringTop], [L + off + eo, -off - go, ringTop], [L + off + eo, B + off + go, ringTop], [L + off, B + off + go, ringTop]], normal: [0, 0, -1] })
      polys.push({ id: 'podbitka-tyl', kind: 'soffit', label: 'Podbitka', points: [[-off - eo, -off - go, ringTop], [-off, -off - go, ringTop], [-off, B + off + go, ringTop], [-off - eo, B + off + go, ringTop]], normal: [0, 0, -1] })
    }
  }

  const pts: V3[] = [...boxes.flatMap((b) => [sub(b.center, half3(b.size)), add(b.center, half3(b.size))]), ...polys.flatMap((p) => p.points)]
  const min: V3 = [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.min(...pts.map((p) => p[2]))]
  const max: V3 = [Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[2]))]
  return { boxes, polys, bounds: { min, max }, groundZ: epsBottom, ringTop, ridgeZ, missing }
}

const half3 = (s: V3): V3 => [s[0] / 2, s[1] / 2, s[2] / 2]
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
