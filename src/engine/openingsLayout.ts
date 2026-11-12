// Rozmieszczenie otworów na rzucie: ściany obrysu, położenia egzemplarzy, wymiary łańcuchowe, kolizje.
// Ściany obrysu numerowane od narożnika lewego dolnego, zgodnie z ruchem wskazówek zegara:
// S1 lewa (w górę), S2 górna (w prawo), S3 prawa (w dół), S4 dolna (w lewo).
// offset = odległość od wewnętrznego narożnika początku ściany do krawędzi otworu. Wymiary w metrach.

import type { Opening } from './openings'
import { clean, fmt } from './trace'

export interface WallSeg {
  id: string
  label: string
  /** Długość ściany po stronie wewnętrznej [m]. */
  length: number
  /** Narożnik początkowy (wewnętrzny) i kierunek wzdłuż ściany, w rzucie (x w prawo, y w górę). */
  start: [number, number]
  dir: [number, number]
  /** Normalna na zewnątrz budynku. */
  out: [number, number]
}

export function exteriorWalls(length: number, width: number): WallSeg[] {
  return [
    { id: 'S1', label: 'Ściana 1 (lewa)', length: width, start: [0, 0], dir: [0, 1], out: [-1, 0] },
    { id: 'S2', label: 'Ściana 2 (górna)', length, start: [0, width], dir: [1, 0], out: [0, 1] },
    { id: 'S3', label: 'Ściana 3 (prawa)', length: width, start: [length, width], dir: [0, -1], out: [1, 0] },
    { id: 'S4', label: 'Ściana 4 (dolna)', length, start: [length, 0], dir: [-1, 0], out: [0, -1] },
  ]
}

export interface PlacedOpening {
  /** Klucz egzemplarza: id otworu + indeks położenia. */
  key: string
  openingId: string
  index: number
  mark: string
  type: Opening['type']
  wallId: string
  offset: number
  width: number
  height: number
  sillHeight: number
  /** Punkty krawędzi otworu na licu wewnętrznym ściany. */
  a: [number, number]
  b: [number, number]
}

export interface LayoutIssue {
  key: string
  wallId: string
  message: string
}

export interface ChainDim {
  wallId: string
  from: number
  to: number
  label: string
  kind: 'pier' | 'opening'
}

export interface UnplacedEntry {
  openingId: string
  mark: string
  type: Opening['type']
  missing: number
  reason?: string
}

export interface OpeningsLayout {
  walls: WallSeg[]
  placed: PlacedOpening[]
  issues: LayoutIssue[]
  chains: ChainDim[]
  unplaced: UnplacedEntry[]
}

function at(w: WallSeg, s: number): [number, number] {
  return [clean(w.start[0] + w.dir[0] * s), clean(w.start[1] + w.dir[1] * s)]
}

export function layoutOpenings(openings: Opening[], length: number, width: number, minPier: number): OpeningsLayout {
  const walls = exteriorWalls(length, width)
  const placed: PlacedOpening[] = []
  const unplaced: UnplacedEntry[] = []
  const issues: LayoutIssue[] = []
  for (const o of openings) {
    const ps = o.placements ?? []
    if (o.wall !== 'zewnętrzna') {
      const reason = o.wall === 'działowa' ? 'ściany działowe — rozmieszczenie w kolejnej wersji' : 'okno w szczycie (nad okapem) — nie występuje na rzucie ścian'
      if (o.count > 0) unplaced.push({ openingId: o.id, mark: o.mark, type: o.type, missing: o.count, reason })
      continue
    }
    ps.forEach((p, index) => {
      const w = walls.find((x) => x.id === p.wallId)
      const key = `${o.id}#${index}`
      if (!w) {
        issues.push({ key, wallId: p.wallId, message: `${o.mark}: nieznana ściana ${p.wallId}.` })
        return
      }
      placed.push({ key, openingId: o.id, index, mark: o.mark, type: o.type, wallId: w.id, offset: p.offset, width: o.width, height: o.height, sillHeight: p.sillHeight, a: at(w, p.offset), b: at(w, p.offset + o.width) })
    })
    if (ps.length > o.count) issues.push({ key: `${o.id}#*`, wallId: '', message: `${o.mark}: rozmieszczono ${ps.length} szt., a na liście jest ${o.count}.` })
    if (ps.length < o.count) unplaced.push({ openingId: o.id, mark: o.mark, type: o.type, missing: o.count - ps.length })
  }

  const chains: ChainDim[] = []
  for (const w of walls) {
    const on = placed.filter((p) => p.wallId === w.id).sort((a, b) => a.offset - b.offset)
    let cursor = 0
    on.forEach((p, i) => {
      const end = clean(p.offset + p.width)
      if (p.offset < minPier - 1e-9) issues.push({ key: p.key, wallId: w.id, message: `${p.mark} (${w.id}): za blisko narożnika — ${fmt(p.offset * 100, 1)} cm < filar ${fmt(minPier * 100, 1)} cm.` })
      if (end > w.length - minPier + 1e-9) {
        issues.push({
          key: p.key,
          wallId: w.id,
          message: end > w.length + 1e-9 ? `${p.mark} (${w.id}): wychodzi poza ścianę.` : `${p.mark} (${w.id}): za blisko narożnika — ${fmt((w.length - end) * 100, 1)} cm < filar ${fmt(minPier * 100, 1)} cm.`,
        })
      }
      if (i > 0) {
        const prev = on[i - 1]
        const gap = clean(p.offset - (prev.offset + prev.width))
        if (gap < -1e-9) issues.push({ key: p.key, wallId: w.id, message: `${prev.mark} i ${p.mark} (${w.id}): otwory nachodzą na siebie.` })
        else if (gap < minPier - 1e-9) issues.push({ key: p.key, wallId: w.id, message: `${prev.mark} i ${p.mark} (${w.id}): filar ${fmt(gap * 100, 1)} cm < ${fmt(minPier * 100, 1)} cm.` })
      }
      if (p.offset > cursor + 1e-9) chains.push({ wallId: w.id, from: cursor, to: p.offset, label: fmt(clean((p.offset - cursor) * 100), 1), kind: 'pier' })
      chains.push({ wallId: w.id, from: p.offset, to: end, label: fmt(clean(p.width * 100), 1), kind: 'opening' })
      cursor = Math.max(cursor, end)
    })
    if (on.length && w.length > cursor + 1e-9) chains.push({ wallId: w.id, from: cursor, to: w.length, label: fmt(clean((w.length - cursor) * 100), 1), kind: 'pier' })
  }
  return { walls, placed, issues, chains, unplaced }
}

/** Najbliższa ściana do punktu (rzut) i położenie wzdłuż niej — do klikania/przeciągania. */
export function nearestWall(walls: WallSeg[], x: number, y: number): { wall: WallSeg; s: number; dist: number } {
  let best = { wall: walls[0], s: 0, dist: Infinity }
  for (const w of walls) {
    const rx = x - w.start[0]
    const ry = y - w.start[1]
    const s = Math.max(0, Math.min(w.length, rx * w.dir[0] + ry * w.dir[1]))
    const px = w.start[0] + w.dir[0] * s
    const py = w.start[1] + w.dir[1] * s
    const dist = Math.hypot(x - px, y - py)
    if (dist < best.dist) best = { wall: w, s, dist }
  }
  return best
}
