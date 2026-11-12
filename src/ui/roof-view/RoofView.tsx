// Widok dachu (wzorzec: docs/prototyp-dach.html): aksonometria SVG 3D + rzut z góry z wymiarami.
// Geometria z engine/roofModel.ts (z wyników roof.ts) — komponent niczego nie przelicza.

import { useMemo, useRef, useState, type PointerEvent as RPE } from 'react'
import type { Estimate } from '../../engine/estimate'
import { formatPLN } from '../../engine/money'
import { buildRoofModel, type RoofModel, type V3 } from '../../engine/roofModel'
import { roofOf } from '../../engine/stages/sszRoof'
import type { Stage } from '../../engine/items'
import type { ProjectInput } from '../../model/project'
import { fmtQty } from '../common/fields'
import { itemQtyText } from '../common/itemText'
import { ELEMENT_ITEMS, ELEMENT_LABEL, type RoofElementKind } from './links'
import './roof-view.css'

const PH = (30 * Math.PI) / 180
const LIGHT = (() => {
  const v: V3 = [-0.45, -0.65, 0.62]
  const m = Math.hypot(...v)
  return v.map((x) => x / m) as V3
})()
const FILL: Record<string, string> = { main: '#F0997B', dormer: '#5DCAA5', gable: '#B4B2A9', dormerGable: '#B4B2A9' }
const RED = '#E24B4A'

type Sel = { kind: RoofElementKind; id: string } | null

function download(name: string, blob: Blob) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

function svgText(el: SVGSVGElement | null): string {
  if (!el) return ''
  const clone = el.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.querySelectorAll('[data-hit]').forEach((n) => n.remove())
  return clone.outerHTML
}

async function exportPng(el: SVGSVGElement | null, name: string) {
  if (!el) return
  const vb = el.viewBox.baseVal
  const img = new Image()
  const url = URL.createObjectURL(new Blob([svgText(el)], { type: 'image/svg+xml' }))
  await new Promise((res, rej) => {
    img.onload = res
    img.onerror = rej
    img.src = url
  })
  const scale = 2
  const c = document.createElement('canvas')
  c.width = vb.width * scale
  c.height = vb.height * scale
  const g = c.getContext('2d')!
  g.fillStyle = '#fff'
  g.fillRect(0, 0, c.width, c.height)
  g.drawImage(img, 0, 0, c.width, c.height)
  URL.revokeObjectURL(url)
  c.toBlob((b) => b && download(name, b), 'image/png')
}

export function RoofView({
  project,
  estimate,
  highlight,
  onOpenItem,
}: {
  project: ProjectInput
  estimate: Estimate
  highlight: RoofElementKind | null
  onOpenItem: (stage: Stage, id: string) => void
}) {
  const { roof, input, missing, warnings } = roofOf(project)
  const model = useMemo(() => (roof && input ? buildRoofModel(input, roof) : null), [roof, input])
  const [rot, setRot] = useState(-35)
  const [zoom, setZoom] = useState(1)
  const [labels, setLabels] = useState(true)
  const [sel, setSel] = useState<Sel>(highlight ? { kind: highlight, id: '*' } : null)
  const v3Ref = useRef<SVGSVGElement>(null)
  const planRef = useRef<SVGSVGElement>(null)
  const drag = useRef<{ x: number; rot: number; pts: Map<number, number>; dist: number | null; zoom: number } | null>(null)

  if (!roof || !input || !model) {
    return (
      <section className="card">
        <h2>Dach</h2>
        <p className="todo-inline">Uzupełnij w „Dane projektu → Dach”: {missing.join(', ')}</p>
      </section>
    )
  }

  const activeKind = sel?.kind ?? null
  const isHot = (kind: RoofElementKind, id: string) => sel !== null && sel.kind === kind && (sel.id === '*' || sel.id === id)
  const linked = activeKind ? ELEMENT_ITEMS[activeKind].map((id) => estimate.items.find((r) => r.spec.id === id)).filter((r) => r !== undefined) : []

  // ── Aksonometria
  const t = (rot * Math.PI) / 180
  const ct = Math.cos(t)
  const st = Math.sin(t)
  const minY = Math.min(0, ...input.dormers.filter((d) => d.side === 'przód').map((d) => -d.w))
  const maxY = Math.max(model.depth, ...input.dormers.filter((d) => d.side === 'tył').map((d) => model.depth + d.w))
  const cx = model.length / 2
  const cy = (minY + maxY) / 2
  const vd: V3 = [-Math.cos(PH) * st, -Math.cos(PH) * ct, Math.sin(PH)]
  const pr = ([x, y, z]: V3): V3 => {
    const X = x - cx
    const Y = y - cy
    const Xr = X * ct - Y * st
    const Yr = X * st + Y * ct
    return [Xr, -Yr * Math.sin(PH) - z * Math.cos(PH), Yr * Math.cos(PH) - z * Math.sin(PH)]
  }
  const W3 = 680
  const H3 = 340
  const all = model.faces.flatMap((f) => f.points.map(pr))
  const mnx = Math.min(...all.map((q) => q[0]))
  const mxx = Math.max(...all.map((q) => q[0]))
  const mny = Math.min(...all.map((q) => q[1]))
  const mxy = Math.max(...all.map((q) => q[1]))
  const s3 = Math.min((W3 - 40) / (mxx - mnx), (H3 - 40) / (mxy - mny)) * zoom
  const ox = W3 / 2 - (s3 * (mnx + mxx)) / 2
  const oy = H3 / 2 - (s3 * (mny + mxy)) / 2
  const P = (q: V3) => {
    const r = pr(q)
    return [ox + s3 * r[0], oy + s3 * r[1]] as const
  }
  const pts = (ps: V3[]) => ps.map((q) => P(q).map((n) => n.toFixed(1)).join(',')).join(' ')
  const shade = (n: V3) => Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2])
  const visible = model.faces
    .filter((f) => f.normal[0] * vd[0] + f.normal[1] * vd[1] + f.normal[2] * vd[2] > 0.001)
    .map((f) => ({ f, dp: f.points.reduce((u, q) => u + pr(q)[2], 0) / f.points.length }))
    .sort((a, b) => b.dp - a.dp)
  const visIds = new Set(visible.map((v) => v.f.id))
  const centroid = (ps: V3[]): V3 => ps.reduce((a, p) => [a[0] + p[0] / ps.length, a[1] + p[1] / ps.length, a[2] + p[2] / ps.length], [0, 0, 0] as V3)

  const onDown = (e: RPE<SVGSVGElement>) => {
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    const d = drag.current ?? { x: e.clientX, rot, pts: new Map(), dist: null, zoom }
    d.pts.set(e.pointerId, e.clientX)
    d.x = e.clientX
    d.rot = rot
    d.zoom = zoom
    drag.current = d
  }
  const onMove = (e: RPE<SVGSVGElement>) => {
    const d = drag.current
    if (!d) return
    d.pts.set(e.pointerId, e.clientX)
    if (d.pts.size === 2) {
      const [a, b] = [...d.pts.values()]
      const dist = Math.abs(a - b)
      if (d.dist === null) d.dist = dist
      else setZoom(Math.min(4, Math.max(0.4, (d.zoom * dist) / Math.max(1, d.dist))))
      return
    }
    setRot(Math.max(-180, Math.min(180, d.rot + (e.clientX - d.x) * 0.4)))
  }
  const onUp = (e: RPE<SVGSVGElement>) => {
    drag.current?.pts.delete(e.pointerId)
    if (!drag.current || drag.current.pts.size === 0) drag.current = null
  }

  // ── Rzut z góry
  const WP = 680
  const pad = 2.2
  const pMinX = -pad
  const pMaxX = model.length + pad
  const pMinY = minY - pad
  const pMaxY = maxY + pad
  const sp = WP / (pMaxX - pMinX)
  const HP = Math.round((pMaxY - pMinY) * sp)
  const X = (x: number) => (x - pMinX) * sp
  const Y = (y: number) => (pMaxY - y) * sp
  const xy = (q: V3 | [number, number]) => `${X(q[0]).toFixed(1)},${Y(q[1]).toFixed(1)}`

  const valleys = model.edges.filter((e) => e.kind === 'valley')
  const mainFaces = model.faces.filter((f) => f.kind === 'main')

  const choose = (kind: RoofElementKind, id: string) => setSel(sel && sel.kind === kind && sel.id === id ? null : { kind, id })

  return (
    <div className="roof-view">
      <div className="rv-toolbar">
        <label className="nf-check">
          Obrót
          <input type="range" min={-180} max={180} value={rot} onChange={(e) => setRot(+e.target.value)} />
          <span className="muted small">{Math.round(rot)}°</span>
        </label>
        <button className="btn" onClick={() => setZoom((z) => Math.min(4, z * 1.25))}>
          +
        </button>
        <button className="btn" onClick={() => setZoom((z) => Math.max(0.4, z / 1.25))}>
          −
        </button>
        <button className="btn" onClick={() => { setRot(-35); setZoom(1) }}>
          Widok domyślny
        </button>
        <label className="nf-check">
          <input type="checkbox" checked={labels} onChange={(e) => setLabels(e.target.checked)} /> etykiety
        </label>
        <span className="rv-sep" />
        <button className="btn" onClick={() => download('dach-3d.svg', new Blob([svgText(v3Ref.current)], { type: 'image/svg+xml' }))}>
          3D → SVG
        </button>
        <button className="btn" onClick={() => exportPng(v3Ref.current, 'dach-3d.png')}>
          3D → PNG
        </button>
        <button className="btn" onClick={() => download('dach-rzut.svg', new Blob([svgText(planRef.current)], { type: 'image/svg+xml' }))}>
          Rzut → SVG
        </button>
        <button className="btn" onClick={() => exportPng(planRef.current, 'dach-rzut.png')}>
          Rzut → PNG
        </button>
      </div>
      {warnings.length > 0 && (
        <ul className="warn-list">
          {warnings.map((w) => (
            <li key={w}>⚠ {w}</li>
          ))}
        </ul>
      )}

      <div className="rv-grid">
        <section className="card rv-3d">
          <svg
            ref={v3Ref}
            viewBox={`0 0 ${W3} ${H3}`}
            width="100%"
            className="rv-svg"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onWheel={(e) => setZoom((z) => Math.min(4, Math.max(0.4, z * (e.deltaY < 0 ? 1.1 : 0.9))))}
          >
            {visible.map(({ f }) => (
              <g key={f.id} className="rv-hit" onClick={() => choose(f.kind, f.id)}>
                <polygon points={pts(f.points)} fill={FILL[f.kind]} stroke="#444441" strokeWidth={0.8} strokeLinejoin="round" />
                <polygon points={pts(f.points)} fill="#000" opacity={((1 - shade(f.normal)) * 0.35).toFixed(2)} />
                {isHot(f.kind, f.id) && <polygon points={pts(f.points)} fill="#1f6feb" opacity={0.25} stroke="#1f6feb" strokeWidth={2} />}
              </g>
            ))}
            {model.edges
              .filter((e) => e.kind === 'valley' || e.kind === 'ridge' || isHot(e.kind, e.id))
              .map((e) => {
                const [a, b] = e.points.map(P)
                const hot = isHot(e.kind, e.id)
                return (
                  <g key={e.id} className="rv-hit" onClick={() => choose(e.kind, e.id)}>
                    <line data-hit x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="transparent" strokeWidth={12} />
                    <line
                      x1={a[0]}
                      y1={a[1]}
                      x2={b[0]}
                      y2={b[1]}
                      stroke={hot ? '#1f6feb' : e.kind === 'valley' ? RED : '#7a2e14'}
                      strokeWidth={e.kind === 'valley' || hot ? 3 : 1.6}
                      strokeDasharray={e.kind === 'ridge' && !hot ? '6 4' : undefined}
                      strokeLinecap="round"
                    />
                  </g>
                )
              })}
            {labels &&
              mainFaces
                .filter((f) => visIds.has(f.id))
                .map((f) => {
                  // środek prostokąta połaci (bez wycięć pod daszki): narożniki okapu i kalenicy
                  const corners = [f.points[0], ...f.points.slice(-3)]
                  const [x, y] = P(centroid(corners))
                  return (
                    <text key={`l-${f.id}`} x={x} y={y} className="rv-label" textAnchor="middle">
                      {f.label} = {fmtQty(f.area, 1)} m²
                    </text>
                  )
                })}
            {labels &&
              roof.dormers.map((d) => {
                const ridge = model.edges.find((e) => e.id === `${d.id}-kalenica`)
                if (!ridge) return null
                const [x, y] = P(ridge.points[0])
                return (
                  <text key={`ld-${d.id}`} x={x} y={y - 8} className="rv-label" textAnchor="middle">
                    {d.id} = {fmtQty(d.area, 1)} m²
                  </text>
                )
              })}
            {labels &&
              model.edges
                .filter((e) => e.kind === 'valley' || (e.kind === 'ridge' && !e.dormerId))
                .map((e) => {
                  const [x, y] = P(centroid(e.points))
                  return (
                    <text key={`le-${e.id}`} x={x + 6} y={y - 4} className="rv-label rv-label-edge">
                      {e.label} = {fmtQty(e.length)} m
                    </text>
                  )
                })}
          </svg>
          <p className="muted small">Przeciągnij — obrót; kółko / szczypanie / +− — zoom. Kliknij połać, kosz lub kalenicę.</p>
        </section>

        <section className="card rv-plan">
          <svg ref={planRef} viewBox={`0 0 ${WP} ${HP}`} width="100%" className="rv-svg">
            <defs>
              <pattern id="rv-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="6" stroke="#0F6E56" strokeWidth="1" />
              </pattern>
              <marker id="rv-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="#993C1D" />
              </marker>
            </defs>
            {/* połacie w rzucie */}
            {model.faces
              .filter((f) => f.kind === 'main' || f.kind === 'dormer')
              .map((f) => (
                <polygon
                  key={f.id}
                  className="rv-hit"
                  points={f.points.map(xy).join(' ')}
                  fill={f.kind === 'main' ? '#FAECE7' : '#9FE1CB'}
                  stroke={isHot(f.kind, f.id) ? '#1f6feb' : f.kind === 'main' ? '#D85A30' : '#0F6E56'}
                  strokeWidth={isHot(f.kind, f.id) ? 2.5 : 1}
                  onClick={() => choose(f.kind, f.id)}
                />
              ))}
            {/* trójkąty T (przejęte z połaci głównej) */}
            {roof.dormers.map((r) => {
              const dm = input.dormers.find((d) => d.id === r.id)!
              const f = dm.side === 'przód'
              const yy = (v: number) => (f ? v : model.depth - v)
              const tri: [number, number][] = [
                [dm.position, yy(0)],
                [dm.position, yy(r.x0)],
                [dm.position + dm.b / 2, yy(r.x0 + r.d)],
                [dm.position + dm.b, yy(r.x0)],
                [dm.position + dm.b, yy(0)],
              ]
              return <polygon key={`T-${r.id}`} points={tri.map(xy).join(' ')} fill="url(#rv-hatch)" stroke="none" opacity={0.6} />
            })}
            {/* obrys ścian (lico EPS) */}
            <polygon points={model.wallOutline.map(xy).join(' ')} fill="none" stroke="#5f5e5a" strokeDasharray="5 4" strokeWidth={1} />
            {/* krawędzie */}
            {model.edges.map((e) => {
              const [a, b] = e.points
              const hot = isHot(e.kind, e.id)
              const style =
                e.kind === 'valley'
                  ? { stroke: RED, strokeWidth: 2.5 }
                  : e.kind === 'ridge'
                    ? { stroke: '#993C1D', strokeWidth: 1.4, strokeDasharray: '6 4' }
                    : { stroke: '#7a2e14', strokeWidth: 1 }
              return (
                <g key={e.id} className="rv-hit" onClick={() => choose(e.kind, e.id)}>
                  <line data-hit x1={X(a[0])} y1={Y(a[1])} x2={X(b[0])} y2={Y(b[1])} stroke="transparent" strokeWidth={10} />
                  <line x1={X(a[0])} y1={Y(a[1])} x2={X(b[0])} y2={Y(b[1])} {...style} {...(hot ? { stroke: '#1f6feb', strokeWidth: 3 } : {})} />
                </g>
              )
            })}
            {/* kierunek spadku */}
            {[0.2, 0.8].flatMap((fx) =>
              [
                [model.depth / 2 - 0.4, model.depth / 2 - 2.2],
                [model.depth / 2 + 0.4, model.depth / 2 + 2.2],
              ].map(([y1, y2], k) => (
                <line key={`ar-${fx}-${k}`} x1={X(model.length * fx)} y1={Y(y1)} x2={X(model.length * fx)} y2={Y(y2)} stroke="#993C1D" strokeWidth={1.2} markerEnd="url(#rv-arrow)" />
              )),
            )}
            {/* etykiety koszy */}
            {labels &&
              valleys.map((e) => {
                const m = [(e.points[0][0] + e.points[1][0]) / 2, (e.points[0][1] + e.points[1][1]) / 2] as const
                return (
                  <text key={`lv-${e.id}`} x={X(m[0]) + 5} y={Y(m[1])} className="rv-label rv-label-edge">
                    {e.label} {fmtQty(e.length)} m
                  </text>
                )
              })}
            {/* wymiary */}
            {model.dims.map((d, i) => {
              const ax = X(d.a[0])
              const ay = Y(d.a[1])
              const bx = X(d.b[0])
              const by = Y(d.b[1])
              const ux = bx - ax
              const uy = by - ay
              const l = Math.hypot(ux, uy) || 1
              const nx = -uy / l
              const ny = ux / l
              const o = d.offset * sp
              const a2 = [ax + nx * o, ay + ny * o]
              const b2 = [bx + nx * o, by + ny * o]
              const mx = (a2[0] + b2[0]) / 2
              const my = (a2[1] + b2[1]) / 2
              const angle = (Math.atan2(uy, ux) * 180) / Math.PI
              const rotA = angle > 90 || angle < -90 ? angle + 180 : angle
              return (
                <g key={`d-${i}`} className="rv-dim">
                  <line x1={ax} y1={ay} x2={a2[0]} y2={a2[1]} />
                  <line x1={bx} y1={by} x2={b2[0]} y2={b2[1]} />
                  <line x1={a2[0]} y1={a2[1]} x2={b2[0]} y2={b2[1]} markerStart="url(#rv-arrow)" markerEnd="url(#rv-arrow)" />
                  <text x={mx} y={my - 3} textAnchor="middle" transform={`rotate(${rotA} ${mx} ${my})`}>
                    {d.label}
                  </text>
                </g>
              )
            })}
          </svg>
          <RoofTable model={model} roofArea={roof.totalArea} valleysTotal={roof.valleysLength} ridges={roof.ridgesLength} eaves={roof.eavesLength} verges={roof.vergesLength} />
        </section>
      </div>

      {sel && (
        <section className="card rv-panel">
          <div className="ip-head">
            <h2>
              {ELEMENT_LABEL[sel.kind]}
              {sel.id !== '*' && ` — ${elementInfo(model, sel.id)}`}
            </h2>
            <button className="btn-icon" onClick={() => setSel(null)} title="Zamknij">
              ✕
            </button>
          </div>
          <p className="muted small">Pozycje kosztorysu wynikające z tego elementu:</p>
          <ul className="rv-items">
            {linked.length === 0 && <li className="muted">— (pozycje wyłączone lub brak daszków)</li>}
            {linked.map((r) => (
              <li key={r!.spec.id}>
                <button className="link" onClick={() => onOpenItem(r!.spec.stage, r!.spec.id)}>
                  {r!.spec.name}
                </button>
                <span className="muted small">
                  {' '}
                  — {itemQtyText(r!)}
                  {r!.costGrosze !== null && `, ${formatPLN(r!.costGrosze)}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function elementInfo(model: RoofModel, id: string): string {
  const f = model.faces.find((x) => x.id === id)
  if (f) return `${f.label}: ${fmtQty(f.area, 2)} m²`
  const e = model.edges.find((x) => x.id === id)
  if (e) return `${e.label}: ${fmtQty(e.length, 2)} m`
  return id
}

function RoofTable({ model, roofArea, valleysTotal, ridges, eaves, verges }: { model: RoofModel; roofArea: number; valleysTotal: number; ridges: number; eaves: number; verges: number }) {
  const valleys = model.edges.filter((e) => e.kind === 'valley')
  return (
    <table className="sum-table rv-table">
      <tbody>
        {model.faces
          .filter((f) => f.kind === 'main' || f.kind === 'dormer')
          .map((f) => (
            <tr key={f.id}>
              <th>Połać {f.label}</th>
              <td>{fmtQty(f.area)} m²</td>
            </tr>
          ))}
        <tr className="grand">
          <th>Dach razem</th>
          <td>{fmtQty(roofArea)} m²</td>
        </tr>
        <tr>
          <th>Kosze ({valleys.length} szt)</th>
          <td>{fmtQty(valleysTotal)} m</td>
        </tr>
        <tr>
          <th>Kalenice</th>
          <td>{fmtQty(ridges)} m</td>
        </tr>
        <tr>
          <th>Okapy</th>
          <td>{fmtQty(eaves)} m</td>
        </tr>
        <tr>
          <th>Wiatrownice</th>
          <td>{fmtQty(verges)} m</td>
        </tr>
      </tbody>
    </table>
  )
}
