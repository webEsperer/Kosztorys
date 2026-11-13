// Edytor rzutu: ściany z góry, dodawanie okien/drzwi kliknięciem ściany, przeciąganie wzdłuż ściany,
// wymiary łańcuchowe na żywo, dokładne wartości w cm, kontrola kolizji (engine/openingsLayout.ts).

import { useMemo, useRef, useState, type PointerEvent as RPE } from 'react'
import type { Opening, OpeningPlacement, OpeningType } from '../../engine/openings'
import { layoutOpenings, nearestWall, type WallSeg } from '../../engine/openingsLayout'
import type { ProjectInput } from '../../model/project'
import { NumField, fmtQty } from '../common/fields'
import type { Update } from '../project-form/ProjectForm'
import './plan-editor.css'

type Key = { openingId: string; index: number }
type Menu = { wallId: string; s: number; x: number; y: number } | null

const SIDES: { value: NonNullable<OpeningPlacement['side']>; label: string }[] = [
  { value: 'lewe-do-wewnątrz', label: 'lewe, do wewnątrz' },
  { value: 'prawe-do-wewnątrz', label: 'prawe, do wewnątrz' },
  { value: 'lewe-na-zewnątrz', label: 'lewe, na zewnątrz' },
  { value: 'prawe-na-zewnątrz', label: 'prawe, na zewnątrz' },
]

const defaultSill = (t: OpeningType) => (t === 'okno' ? 0.9 : 0)
const round1cm = (v: number) => Math.round(v * 100) / 100

export function PlanEditor({ project, update }: { project: ProjectInput; update: Update }) {
  const L = project.footprint.length
  const B = project.footprint.width
  const t = project.wallThickness
  const e = project.facadeInsulation
  const minPier = project.planRules.minPier
  const layout = useMemo(() => layoutOpenings(project.openings, L, B, minPier), [project.openings, L, B, minPier])
  const [sel, setSel] = useState<Key | null>(null)
  const [menu, setMenu] = useState<Menu>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<{ key: Key; grab: number } | null>(null)

  // Skala i transformacja: rzut (x w prawo, y w górę) → SVG
  const W = 900
  const margin = t + e + 1.6
  const s = W / (L + 2 * margin)
  const H = (B + 2 * margin) * s
  const X = (x: number) => (x + margin) * s
  const Y = (y: number) => (B + margin - y) * s
  const toPlan = (clientX: number, clientY: number): [number, number] => {
    const svg = svgRef.current!
    const r = svg.getBoundingClientRect()
    const vx = ((clientX - r.left) / r.width) * W
    const vy = ((clientY - r.top) / r.height) * H
    return [vx / s - margin, B + margin - vy / s]
  }

  const issueKeys = new Set(layout.issues.map((i) => i.key))
  const selOpening = sel ? project.openings.find((o) => o.id === sel.openingId) : undefined
  const selPlacement = selOpening?.placements?.[sel!.index]

  const setPlacement = (k: Key, fn: (p: OpeningPlacement, o: Opening) => void) =>
    update((p) => {
      const o = p.openings.find((x) => x.id === k.openingId)
      const pl = o?.placements?.[k.index]
      if (o && pl) fn(pl, o)
    })

  const placeAt = (wall: WallSeg, sAlong: number, opening: Opening | null, newType?: OpeningType) => {
    // id i indeks ustalone przed aktualizacją (funkcja aktualizacji musi być czysta)
    const newId = `op-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const targetId = opening ? opening.id : newId
    const index = opening ? (opening.placements?.length ?? 0) : 0
    update((p) => {
      let o = opening ? p.openings.find((x) => x.id === opening.id) : undefined
      if (!o && newType) {
        const prefix = newType === 'okno' ? 'O' : newType === 'brama' ? 'B' : 'D'
        let n = 1
        while (p.openings.some((x) => x.mark === `${prefix}${n}`)) n++
        o = {
          id: newId,
          mark: `${prefix}${n}`,
          type: newType,
          width: newType === 'okno' ? 1.0 : newType === 'brama' ? 2.5 : 1.0,
          height: newType === 'okno' ? 1.5 : newType === 'brama' ? 2.2 : 2.1,
          count: 0,
          wall: 'zewnętrzna',
          placements: [],
        }
        p.openings.push(o)
      }
      if (!o) return
      const placements = (o.placements ??= [])
      if (placements.length >= o.count) o.count = placements.length + 1
      const offset = round1cm(Math.max(0, Math.min(wall.length - o.width, sAlong - o.width / 2)))
      placements.push({ wallId: wall.id, offset, sillHeight: defaultSill(o.type), ...(o.type !== 'okno' ? { side: 'lewe-do-wewnątrz' as const } : {}) })
    })
    setSel({ openingId: targetId, index })
  }

  const onWallClick = (ev: React.MouseEvent, wall: WallSeg) => {
    const [x, y] = toPlan(ev.clientX, ev.clientY)
    const n = nearestWall([wall], x, y)
    const r = svgRef.current!.getBoundingClientRect()
    setMenu({ wallId: wall.id, s: n.s, x: ev.clientX - r.left, y: ev.clientY - r.top })
    setSel(null)
  }

  const onOpDown = (ev: RPE<SVGGElement>, key: Key, offset: number) => {
    ev.stopPropagation()
    ;(ev.currentTarget as Element).setPointerCapture?.(ev.pointerId)
    const [x, y] = toPlan(ev.clientX, ev.clientY)
    const wallId = project.openings.find((o) => o.id === key.openingId)?.placements?.[key.index]?.wallId
    const w = layout.walls.find((w) => w.id === wallId)!
    dragRef.current = { key, grab: nearestWall([w], x, y).s - offset }
    setSel(key)
    setMenu(null)
  }
  const onMove = (ev: RPE<SVGSVGElement>) => {
    const d = dragRef.current
    if (!d) return
    const [x, y] = toPlan(ev.clientX, ev.clientY)
    const n = nearestWall(layout.walls, x, y)
    setPlacement(d.key, (pl, o) => {
      pl.wallId = n.wall.id
      pl.offset = round1cm(Math.max(0, Math.min(n.wall.length - o.width, n.s - d.grab)))
    })
  }
  const onUp = () => {
    dragRef.current = null
  }

  const menuWall = menu ? layout.walls.find((w) => w.id === menu.wallId)! : null
  const placeable = layout.unplaced.filter((u) => !u.reason)

  return (
    <div className="plan-editor">
      <div className="pe-main card">
        <div className="pe-head">
          <h2>Rzut — rozmieszczenie otworów</h2>
          <NumField nonNegative allowEmpty={false} label="Minimalny filar" unit="cm" scale={100} width={56} value={minPier} onChange={(v) => update((p) => { p.planRules.minPier = v ?? 0.25 })} />
        </div>
        <p className="muted small">Kliknij ścianę, aby dodać okno lub drzwi. Przeciągnij otwór wzdłuż ściany (także na inną ścianę). Wymiary od narożnika i między otworami — w cm.</p>
        <div className="pe-canvas">
          <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%" className="pe-svg" onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onClick={() => setMenu(null)}>
            {/* EPS + mur */}
            <rect x={X(-t - e)} y={Y(B + t + e)} width={(L + 2 * (t + e)) * s} height={(B + 2 * (t + e)) * s} className="pe-eps" />
            <rect x={X(-t)} y={Y(B + t)} width={(L + 2 * t) * s} height={(B + 2 * t) * s} className="pe-wall" />
            <rect x={X(0)} y={Y(B)} width={L * s} height={B * s} className="pe-inside" />
            {/* strefy kliknięcia ścian */}
            {layout.walls.map((w) => {
              const horiz = w.dir[1] === 0
              const x0 = Math.min(w.start[0], w.start[0] + w.dir[0] * w.length)
              const y0 = Math.min(w.start[1], w.start[1] + w.dir[1] * w.length)
              const rx = horiz ? X(x0) : w.out[0] < 0 ? X(-t) : X(L)
              const ry = horiz ? (w.out[1] > 0 ? Y(B + t) : Y(0)) : Y(y0 + w.length)
              return (
                <rect
                  key={w.id}
                  className="pe-wallhit"
                  x={rx}
                  y={ry}
                  width={horiz ? w.length * s : t * s}
                  height={horiz ? t * s : w.length * s}
                  onClick={(ev) => {
                    ev.stopPropagation()
                    onWallClick(ev, w)
                  }}
                >
                  <title>{w.label} — kliknij, aby dodać otwór</title>
                </rect>
              )
            })}
            {/* etykiety ścian */}
            {layout.walls.map((w) => {
              const mid = [w.start[0] + (w.dir[0] * w.length) / 2 - w.out[0] * 0.35, w.start[1] + (w.dir[1] * w.length) / 2 - w.out[1] * 0.35]
              return (
                <text key={`wl-${w.id}`} x={X(mid[0])} y={Y(mid[1])} className="pe-walllabel" textAnchor="middle" dominantBaseline="middle">
                  {w.id} · {fmtQty(w.length * 100, 0)} cm
                </text>
              )
            })}
            {/* otwory */}
            {layout.placed.map((p) => {
              const w = layout.walls.find((x) => x.id === p.wallId)!
              const horiz = w.dir[1] === 0
              const xa = Math.min(p.a[0], p.b[0])
              const ya = Math.min(p.a[1], p.b[1])
              const rx = horiz ? X(xa) : w.out[0] < 0 ? X(-t) : X(L)
              const ry = horiz ? (w.out[1] > 0 ? Y(B + t) : Y(0)) : Y(ya + p.width)
              const rw = horiz ? p.width * s : t * s
              const rh = horiz ? t * s : p.width * s
              const key: Key = { openingId: p.openingId, index: p.index }
              const isSel = sel && sel.openingId === p.openingId && sel.index === p.index
              const bad = issueKeys.has(p.key)
              const pl = project.openings.find((o) => o.id === p.openingId)?.placements?.[p.index]
              const isDoor = p.type !== 'okno'
              // łuk skrzydła drzwi (do wewnątrz / na zewnątrz)
              const inward = !pl?.side || pl.side.endsWith('do-wewnątrz')
              const leftHinge = !pl?.side || pl.side.startsWith('lewe')
              const hinge = leftHinge ? p.a : p.b
              const tip = leftHinge ? p.b : p.a
              const nIn: [number, number] = inward ? [-w.out[0], -w.out[1]] : [w.out[0] * (1 + (t + e) / Math.max(p.width, 0.01)), w.out[1] * (1 + (t + e) / Math.max(p.width, 0.01))]
              const base: [number, number] = inward ? hinge : [hinge[0] + w.out[0] * t, hinge[1] + w.out[1] * t]
              const open: [number, number] = [base[0] + nIn[0] * p.width, base[1] + nIn[1] * p.width]
              const tipB: [number, number] = inward ? tip : [tip[0] + w.out[0] * t, tip[1] + w.out[1] * t]
              return (
                <g key={p.key} className={`pe-op${isSel ? ' sel' : ''}${bad ? ' bad' : ''}`} onPointerDown={(ev) => onOpDown(ev, key, p.offset)} onClick={(ev) => ev.stopPropagation()}>
                  <rect x={rx} y={ry} width={rw} height={rh} className="pe-gap" />
                  {!isDoor ? (
                    horiz ? (
                      <>
                        <line x1={rx} y1={ry + rh * 0.4} x2={rx + rw} y2={ry + rh * 0.4} />
                        <line x1={rx} y1={ry + rh * 0.6} x2={rx + rw} y2={ry + rh * 0.6} />
                      </>
                    ) : (
                      <>
                        <line x1={rx + rw * 0.4} y1={ry} x2={rx + rw * 0.4} y2={ry + rh} />
                        <line x1={rx + rw * 0.6} y1={ry} x2={rx + rw * 0.6} y2={ry + rh} />
                      </>
                    )
                  ) : (
                    <>
                      <line x1={X(base[0])} y1={Y(base[1])} x2={X(open[0])} y2={Y(open[1])} />
                      <path d={`M ${X(open[0])} ${Y(open[1])} A ${p.width * s} ${p.width * s} 0 0 ${arcSweep(base, open, tipB)} ${X(tipB[0])} ${Y(tipB[1])}`} className="pe-swing" />
                    </>
                  )}
                  <text x={rx + rw / 2} y={ry + rh / 2} className="pe-mark" textAnchor="middle" dominantBaseline="middle">
                    {p.mark}
                  </text>
                </g>
              )
            })}
            {/* wymiary łańcuchowe */}
            {layout.chains.map((c, i) => {
              const w = layout.walls.find((x) => x.id === c.wallId)!
              const off = t + e + 0.45
              const pa = [w.start[0] + w.dir[0] * c.from + w.out[0] * off, w.start[1] + w.dir[1] * c.from + w.out[1] * off]
              const pb = [w.start[0] + w.dir[0] * c.to + w.out[0] * off, w.start[1] + w.dir[1] * c.to + w.out[1] * off]
              const horiz = w.dir[1] === 0
              const mx = (X(pa[0]) + X(pb[0])) / 2
              const my = (Y(pa[1]) + Y(pb[1])) / 2
              const tick = 4
              return (
                <g key={`ch-${i}`} className={`pe-dim ${c.kind}`}>
                  <line x1={X(pa[0])} y1={Y(pa[1])} x2={X(pb[0])} y2={Y(pb[1])} />
                  {[pa, pb].map((q, k) => (
                    <line key={k} x1={X(q[0]) - (horiz ? 0 : tick)} y1={Y(q[1]) - (horiz ? tick : 0)} x2={X(q[0]) + (horiz ? 0 : tick)} y2={Y(q[1]) + (horiz ? tick : 0)} />
                  ))}
                  <text x={mx} y={my - (horiz ? 4 : 0)} textAnchor="middle" transform={horiz ? undefined : `rotate(-90 ${mx} ${my})`} dy={horiz ? 0 : -4}>
                    {c.label}
                  </text>
                </g>
              )
            })}
          </svg>
          {menu && menuWall && (
            <div className="pe-menu" style={{ left: menu.x, top: menu.y }} onClick={(ev) => ev.stopPropagation()}>
              <div className="muted small">
                {menuWall.label}, {fmtQty(menu.s * 100, 0)} cm od narożnika
              </div>
              {project.openings
                .filter((o) => o.wall === 'zewnętrzna')
                .map((o) => {
                  const left = placeable.find((u) => u.openingId === o.id)?.missing ?? 0
                  return (
                    <button key={o.id} className="btn" onClick={() => { placeAt(menuWall, menu.s, o); setMenu(null) }}>
                      {o.mark} — {o.type} {fmtQty(o.width * 100, 0)} × {fmtQty(o.height * 100, 0)} {left > 0 ? `(zostało ${left})` : '(kolejna szt., +1 do listy)'}
                    </button>
                  )
                })}
              {(['okno', 'drzwi zewnętrzne', 'brama'] as const).map((tp) => (
                <button key={tp} className="btn" onClick={() => { placeAt(menuWall, menu.s, null, tp); setMenu(null) }}>
                  + nowe: {tp}
                </button>
              ))}
              <button className="btn-icon" onClick={() => setMenu(null)}>
                anuluj
              </button>
            </div>
          )}
        </div>
        {layout.issues.length > 0 && (
          <ul className="warn-list">
            {layout.issues.map((i, k) => (
              <li key={k}>⚠ {i.message}</li>
            ))}
          </ul>
        )}
      </div>

      <aside className="pe-side">
        {selOpening && selPlacement ? (
          <section className="card">
            <div className="ip-head">
              <h2>
                {selOpening.mark} — {selOpening.type}
              </h2>
              <button className="btn-icon" onClick={() => setSel(null)} title="Zamknij">
                ✕
              </button>
            </div>
            <p className="muted small">
              Otwór {fmtQty(selOpening.width * 100, 1)} × {fmtQty(selOpening.height * 100, 1)} cm (wymiary typu — zmiana w „Dane projektu → Otwory” dotyczy wszystkich egzemplarzy).
            </p>
            <div className="fields">
              <label className="nf">
                <span className="nf-label">Ściana</span>
                <span className="nf-box">
                  <select value={selPlacement.wallId} onChange={(ev) => setPlacement(sel!, (pl) => { pl.wallId = ev.target.value })}>
                    {layout.walls.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.label}
                      </option>
                    ))}
                  </select>
                </span>
              </label>
              <NumField nonNegative allowEmpty={false} label="Od narożnika do krawędzi otworu" unit="cm" scale={100} value={selPlacement.offset} onChange={(v) => setPlacement(sel!, (pl) => { pl.offset = v ?? 0 })} />
              <NumField nonNegative allowEmpty={false} label="Wysokość parapetu od posadzki" unit="cm" scale={100} value={selPlacement.sillHeight} onChange={(v) => setPlacement(sel!, (pl) => { pl.sillHeight = v ?? 0 })} />
              {selOpening.type !== 'okno' && (
                <label className="nf">
                  <span className="nf-label">Otwieranie</span>
                  <span className="nf-box">
                    <select value={selPlacement.side ?? 'lewe-do-wewnątrz'} onChange={(ev) => setPlacement(sel!, (pl) => { pl.side = ev.target.value as OpeningPlacement['side'] })}>
                      {SIDES.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </span>
                </label>
              )}
            </div>
            <div className="row-actions">
              <button
                className="btn danger"
                onClick={() => {
                  update((p) => {
                    const o = p.openings.find((x) => x.id === sel!.openingId)
                    o?.placements?.splice(sel!.index, 1)
                  })
                  setSel(null)
                }}
              >
                Usuń z rzutu
              </button>
            </div>
          </section>
        ) : (
          <section className="card">
            <h2>Do rozmieszczenia</h2>
            {layout.unplaced.length === 0 ? (
              <p className="muted small">Wszystkie otwory rozmieszczone.</p>
            ) : (
              <ul className="pe-unplaced">
                {layout.unplaced.map((u) => (
                  <li key={u.openingId}>
                    <b>{u.mark}</b> {u.type} — {u.missing} szt.
                    {u.reason && <div className="muted small">{u.reason}</div>}
                  </li>
                ))}
              </ul>
            )}
            <p className="muted small">Otwory bez położenia liczą się w kosztorysie normalnie.</p>
          </section>
        )}
      </aside>
    </div>
  )
}

/** Kierunek łuku skrzydła (flaga sweep SVG) — zależny od orientacji w układzie ekranowym (y w dół). */
function arcSweep(base: [number, number], open: [number, number], tip: [number, number]): 0 | 1 {
  const ax = open[0] - base[0]
  const ay = -(open[1] - base[1])
  const bx = tip[0] - base[0]
  const by = -(tip[1] - base[1])
  return ax * by - ay * bx > 0 ? 1 : 0
}
