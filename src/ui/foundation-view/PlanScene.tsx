// Rzut z góry zbrojenia elementu (ława / wieniec) — rysuje dane z engine/rebarLayout.ts.

import { useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Line, OrbitControls } from '@react-three/drei'
import type { AxisRect, LaidBar, Pt2, RebarPlanLayout } from '../../engine/rebarLayout'
import {
  FitCamera,
  LabelOverlay,
  LabelProjector,
  type Region,
  type SceneLabel,
  pl,
  scenePalette,
  usePrefersDark,
} from './sceneUtils'

/** Kolejne pręty w linii na przemian — żeby było widać, gdzie kończy się jeden, a zaczyna drugi. */
const BAR_COLORS = ['#1c7ed6', '#2b8a3e']
const LAP_COLOR = '#e03131'
const CORNER_COLOR = '#9c36b5'
const ANCHOR_COLOR = '#f59f00'
const STIRRUP_COLOR = '#9aa0a6'
const STIRRUP_DENSE_COLOR = '#495057'

type V3 = [number, number, number]
const v = (p: Pt2, z = 0): V3 => [p.x, p.y, z]

export interface PlanElement {
  key: string
  name: string
  layout: RebarPlanLayout
}

function midOf(points: Pt2[]): Pt2 {
  // środek łamanej po długości
  let total = 0
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
  let acc = 0
  for (let i = 1; i < points.length; i++) {
    const seg = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
    if (acc + seg >= total / 2) {
      const u = seg > 0 ? (total / 2 - acc) / seg : 0
      return { x: points[i - 1].x + (points[i].x - points[i - 1].x) * u, y: points[i - 1].y + (points[i].y - points[i - 1].y) * u }
    }
    acc += seg
  }
  return points[0]
}

export function PlanScene({ axis, elements }: { axis: AxisRect; elements: PlanElement[] }) {
  const dark = usePrefersDark()
  const pal = scenePalette(dark)
  const [elKey, setElKey] = useState(elements[0].key)
  const [layer, setLayer] = useState<'dolny' | 'górny'>('dolny')
  const [showStirrups, setShowStirrups] = useState(true)
  const [showNumbers, setShowNumbers] = useState(true)
  const [version, setVersion] = useState(0)
  const [hover, setHover] = useState<string | null>(null)
  const labelRefs = useRef(new Map<string, HTMLDivElement>())

  const el = elements.find((e) => e.key === elKey) ?? elements[0]
  const lay = el.layout
  const lines = lay.lines.filter((l) => l.level === layer)
  const lineIds = new Set(lines.map((l) => l.line))
  const corners = lay.cornerBars.filter((c) => lineIds.has(c.line))

  const region: Region = useMemo(() => {
    const xs = lay.outline.outer.map((p) => p.x)
    const ys = lay.outline.outer.map((p) => p.y)
    const m = 1.0
    return { x0: Math.min(...xs) - m, x1: Math.max(...xs) + m, y0: Math.min(...ys) - m, y1: Math.max(...ys) + m }
  }, [lay])

  const barInfo = (b: LaidBar) => {
    const l = lay.lines[b.line - 1]
    const onSide = l.bars.filter((x) => x.side === b.side).length
    return `Linia ${b.line} (${l.level}, ${l.side}), bok ${b.side} — kawałek ${b.index}/${onSide}: długość ${pl(b.length)} m${b.exceedsBar ? ' — UWAGA: dłuższy niż pręt handlowy' : ''}`
  }

  const labels: SceneLabel[] = useMemo(() => {
    const out: SceneLabel[] = [
      { id: 'side-l', pos: [-0.75, axis.width / 2, 0], className: 'fv-label fv-dim', content: `oś ${pl(axis.width)} m` },
      { id: 'side-t', pos: [axis.length / 2, axis.width + 0.7, 0], className: 'fv-label fv-dim', content: `oś ${pl(axis.length)} m` },
      { id: 'side-r', pos: [axis.length + 0.75, axis.width / 2, 0], className: 'fv-label fv-dim', content: `oś ${pl(axis.width)} m` },
      { id: 'side-b', pos: [axis.length / 2, -0.7, 0], className: 'fv-label fv-dim', content: `oś ${pl(axis.length)} m` },
      { id: 'start', pos: [-0.35, -0.35, 0], className: 'fv-label fv-start', content: 'start obwodu ↻' },
    ]
    if (showNumbers) {
      for (const l of lines) {
        for (const b of l.bars) {
          out.push({
            id: `n-${l.line}-${b.side}-${b.index}`,
            pos: v(midOf(b.points), 0.03),
            className: `fv-tag${l.offset < 0 ? ' fv-tag-in' : ''}`,
            content: `${l.line}.${b.side}.${b.index}`,
          })
        }
      }
    }
    return out
  }, [axis, lines, showNumbers])

  return (
    <div className="fv-scene">
      <div className="fv-toolbar">
        <div className="fv-seg" role="group" aria-label="Element">
          {elements.map((e) => (
            <button key={e.key} className={elKey === e.key ? 'on' : ''} onClick={() => setElKey(e.key)}>
              {e.name}
            </button>
          ))}
        </div>
        <div className="fv-seg" role="group" aria-label="Warstwa prętów">
          {(['dolny', 'górny'] as const).map((k) => (
            <button key={k} className={layer === k ? 'on' : ''} onClick={() => setLayer(k)}>
              pręty {k === 'dolny' ? 'dolne' : 'górne'}
            </button>
          ))}
        </div>
        <label className="fv-check">
          <input type="checkbox" checked={showStirrups} onChange={(e) => setShowStirrups(e.target.checked)} /> strzemiona
        </label>
        <label className="fv-check">
          <input type="checkbox" checked={showNumbers} onChange={(e) => setShowNumbers(e.target.checked)} /> numery prętów
        </label>
        <button onClick={() => setVersion((x) => x + 1)}>Cały rzut</button>
      </div>
      <div className="fv-canvas" style={{ color: pal.label }}>
        <Canvas orthographic camera={{ position: [0, 0, 50], near: 0.01, far: 200, zoom: 40 }} dpr={[1, 2]}>
          <color attach="background" args={[pal.background]} />
          <OrbitControls makeDefault enableRotate={false} screenSpacePanning enableDamping={false} />
          <FitCamera region={region} version={version} />
          <LabelProjector labels={labels} refs={labelRefs} />

          {/* Obrys elementu i oś ściany */}
          <Line points={[...lay.outline.outer, lay.outline.outer[0]].map((p) => v(p, -0.02))} color={pal.ink} lineWidth={1.2} />
          <Line points={[...lay.outline.inner, lay.outline.inner[0]].map((p) => v(p, -0.02))} color={pal.ink} lineWidth={1.2} />
          <Line
            points={[[0, 0, -0.02], [0, axis.width, -0.02], [axis.length, axis.width, -0.02], [axis.length, 0, -0.02], [0, 0, -0.02]]}
            color={pal.muted}
            lineWidth={0.8}
            dashed
            dashSize={0.3}
            gapSize={0.15}
          />

          {showStirrups &&
            lay.stirrups.map((s) => (
              <Line
                key={`s-${s.index}`}
                points={s.points.map((p) => v(p, -0.01))}
                color={s.zone === 'prosty' ? STIRRUP_COLOR : STIRRUP_DENSE_COLOR}
                lineWidth={s.zone === 'prosty' ? 0.8 : 1}
              />
            ))}

          {lines.flatMap((l) =>
            l.bars.map((b) => (
              <Line
                key={`b-${l.line}-${b.side}-${b.index}`}
                points={b.points.map((p) => v(p, 0))}
                color={BAR_COLORS[(b.index - 1) % 2]}
                lineWidth={3}
                onPointerOver={(e) => { e.stopPropagation(); setHover(barInfo(b)) }}
                onPointerOut={() => setHover(null)}
              />
            )),
          )}

          {lines.flatMap((l) =>
            l.laps.map((z, i) => (
              <Line
                key={`z-${l.line}-${i}`}
                points={z.points.map((p) => v(p, 0.01))}
                color={LAP_COLOR}
                lineWidth={7}
                transparent
                opacity={0.8}
                onPointerOver={(e) => { e.stopPropagation(); setHover(`Zakład linii ${l.line}: od ${pl(z.s0)} do ${pl(z.s1)} m po obwodzie (${pl((z.s1 - z.s0) * 100, 0)} cm)`) }}
                onPointerOut={() => setHover(null)}
              />
            )),
          )}

          {lines.flatMap((l) =>
            l.anchors.map((a, i) => (
              <Line
                key={`a-${l.line}-${i}`}
                points={a.points.map((p) => v(p, 0.015))}
                color={ANCHOR_COLOR}
                lineWidth={6}
                transparent
                opacity={0.85}
                onPointerOver={(e) => { e.stopPropagation(); setHover(`Zakotwienie pręta z boku ${a.side} (linia ${l.line}): ${pl((a.s1 - a.s0) * 100, 0)} cm zagięte za narożem`) }}
                onPointerOut={() => setHover(null)}
              />
            )),
          )}

          {corners.map((c, i) => (
            <Line
              key={`c-${i}`}
              points={c.points.map((p) => v(p, 0.02))}
              color={CORNER_COLOR}
              lineWidth={4}
              onPointerOver={(e) => { e.stopPropagation(); setHover(`Pręt narożny „L” — naroże ${c.corner}, linia ${c.line}: ${pl(c.length)} m (ramiona po ${pl(c.length / 2)} m)`) }}
              onPointerOut={() => setHover(null)}
            />
          ))}
        </Canvas>
        <LabelOverlay labels={labels} refs={labelRefs} />
        {hover && <div className="fv-hover">{hover}</div>}
      </div>
      <ul className="fv-legend">
        <li>
          <span className="fv-swatch" style={{ background: BAR_COLORS[0] }} />
          <span className="fv-swatch" style={{ background: BAR_COLORS[1] }} />
          kolejne kawałki pręta
        </li>
        <li>
          <span className="fv-swatch" style={{ background: LAP_COLOR }} />
          zakład 50d
        </li>
        <li>
          <span className="fv-swatch" style={{ background: ANCHOR_COLOR }} />
          zakotwienie 50d za narożem
        </li>
        <li>
          <span className="fv-swatch" style={{ background: CORNER_COLOR }} />
          eLka 2 × 50d
        </li>
        <li>
          <span className="fv-swatch" style={{ background: STIRRUP_DENSE_COLOR }} />
          <span className="fv-swatch" style={{ background: STIRRUP_COLOR }} />
          strzemiona: naroża i strefy 1 m / odcinki proste ({lay.stirrups.length} szt)
        </li>
      </ul>
      <p className="fv-hint">
        Numer: linia.bok.kawałek; linia zewnętrzna — numery nad prętem, wewnętrzna — pod prętem. Najedź na pręt, zakład lub pręt narożny — szczegóły. Kółko/szczypanie — zoom, przeciąganie — przesuwanie.
      </p>
    </div>
  )
}
