// Przekrój pionowy fundamentu — tylko rysuje dane z engine/foundationSection.ts.
// Wycinek elementu ma głębokość SLICE (w głąb ekranu), więc po obróceniu widać pręty i kolejne strzemiona.

import { useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Edges, Line, OrbitControls } from '@react-three/drei'
import { DoubleSide } from 'three'
import type { FoundationSection, SectionMaterial } from '../../engine/foundationSection'
import {
  FitCamera,
  LabelOverlay,
  LabelProjector,
  type Region,
  type SceneLabel,
  level,
  pl,
  scenePalette,
  usePrefersDark,
} from './sceneUtils'

const SLICE = 1.0

const MATERIAL_COLOR: Record<SectionMaterial, { color: string; opacity: number }> = {
  beton: { color: '#9aa0a6', opacity: 0.32 },
  bloczek: { color: '#b9a98f', opacity: 0.9 },
  zaprawa: { color: '#d8d2c4', opacity: 0.9 },
  xps: { color: '#f2a7c3', opacity: 0.85 },
  eps: { color: '#f4f4f0', opacity: 0.9 },
  hh: { color: '#e9e5dc', opacity: 0.9 },
  piasek: { color: '#e8cf8f', opacity: 0.75 },
  wylewka: { color: '#c7c9cc', opacity: 0.9 },
  wykonczenie: { color: '#a77b4f', opacity: 0.95 },
  grunt: { color: '#8a6f4d', opacity: 0.5 },
}

const INLINE_LABELS: Record<string, string> = {
  lawa: 'Ława',
  wieniec: 'Wieniec',
  'piasek-gora': 'Zasypka piaskowa',
  chudziak: 'Chudziak',
  'eps-podl': 'EPS + wylewka + wykończenie',
}

const LEGEND: { material: SectionMaterial; label: string }[] = [
  { material: 'beton', label: 'beton (ława, wieniec, chudziak)' },
  { material: 'bloczek', label: 'bloczki fundamentowe' },
  { material: 'xps', label: 'XPS' },
  { material: 'eps', label: 'EPS' },
  { material: 'hh', label: 'H+H' },
  { material: 'piasek', label: 'zasypka' },
]

const BAR_COLOR = '#c0392b'
const STIRRUP_COLOR = '#1f6feb'

type Focus = 'calosc' | 'lawa' | 'wieniec'

export function SectionScene({ section }: { section: FoundationSection }) {
  const dark = usePrefersDark()
  const pal = scenePalette(dark)
  const [focus, setFocus] = useState<Focus>('calosc')
  const [showLabels, setShowLabels] = useState(true)
  const [version, setVersion] = useState(0)
  const [hover, setHover] = useState<string | null>(null)
  const labelRefs = useRef(new Map<string, HTMLDivElement>())

  const region: Region = useMemo(() => {
    const b = section.bounds
    if (focus === 'calosc') return { x0: b.x0, x1: b.x1 + 0.9, y0: b.z0, y1: b.z1 }
    const r = section.rects.find((x) => x.id === focus)!
    const m = 0.12
    return { x0: r.x0 - m, x1: r.x1 + m, y0: r.z0 - m, y1: r.z1 + m }
  }, [section, focus])

  const labels: SceneLabel[] = useMemo(() => {
    if (!showLabels) return []
    const out: SceneLabel[] = []
    const xl = section.bounds.x1 + 0.05
    for (const l of section.levels) {
      out.push({
        id: `lv-${l.label}`,
        pos: [xl + 0.27, l.z, 0.01],
        className: 'fv-label fv-level',
        content: (
          <>
            <b>{level(l.z)}</b> {l.label}
          </>
        ),
      })
    }
    section.dims.forEach((d, i) => {
      const mid: [number, number, number] = d.dir === 'h' ? [(d.a + d.b) / 2, d.at, 0.01] : [d.at, (d.a + d.b) / 2, 0.01]
      out.push({ id: `dim-${i}`, pos: mid, className: 'fv-label fv-dim', content: d.label })
    })
    for (const r of section.rects) {
      const text = INLINE_LABELS[r.id]
      if (!text) continue
      const inside = r.id === 'lawa' || r.id === 'wieniec'
      out.push({
        id: `name-${r.id}`,
        pos: inside ? [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, 0.01] : [r.x1 - 0.02, (r.z0 + r.z1) / 2, 0.01],
        className: `fv-label fv-name ${inside ? 'fv-c' : 'fv-right'}`,
        content: text,
      })
    }
    return out
  }, [section, showLabels])

  const stirrupDepths = (spacing: number) => {
    const out: number[] = []
    for (let d = 0.04; d < SLICE; d += spacing) out.push(-d)
    return out
  }

  return (
    <div className="fv-scene">
      <div className="fv-toolbar">
        <div className="fv-seg" role="group" aria-label="Przybliżenie">
          {(
            [
              ['calosc', 'Cały przekrój'],
              ['lawa', 'Ława'],
              ['wieniec', 'Wieniec fund.'],
            ] as const
          ).map(([k, t]) => (
            <button key={k} className={focus === k ? 'on' : ''} onClick={() => { setFocus(k); setVersion((v) => v + 1) }}>
              {t}
            </button>
          ))}
        </div>
        <label className="fv-check">
          <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} /> etykiety
        </label>
        <button onClick={() => setVersion((v) => v + 1)}>Widok na wprost</button>
      </div>
      <div className="fv-canvas" style={{ color: pal.label }}>
        <Canvas orthographic camera={{ position: [0, 0, 50], near: 0.01, far: 200, zoom: 100 }} dpr={[1, 2]}>
          <color attach="background" args={[pal.background]} />
          <ambientLight intensity={0.9} />
          <directionalLight position={[2, 3, 5]} intensity={0.8} />
          <OrbitControls makeDefault enableDamping={false} />
          <FitCamera region={region} version={version} />
          <LabelProjector labels={labels} refs={labelRefs} />

          {section.rects.map((r) => {
            const m = MATERIAL_COLOR[r.material]
            const w = r.x1 - r.x0
            const h = r.z1 - r.z0
            if (w <= 0 || h <= 0) return null
            return (
              <mesh key={r.id} position={[(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, -SLICE / 2]}>
                <boxGeometry args={[w, h, SLICE]} />
                <meshStandardMaterial color={m.color} transparent opacity={m.opacity} depthWrite={m.opacity > 0.8} side={DoubleSide} />
                <Edges color={pal.ink} threshold={1} />
              </mesh>
            )
          })}

          {/* Pręty podłużne — walce wzdłuż elementu, na przekroju widać je jako koła */}
          {section.bars.map((b, i) => (
            <mesh
              key={`bar-${i}`}
              position={[b.x, b.z, -SLICE / 2]}
              rotation={[Math.PI / 2, 0, 0]}
              renderOrder={2}
              onPointerOver={(e) => { e.stopPropagation(); setHover(`${b.label} — oś pręta: x = ${pl(b.x * 100, 1)} cm od osi ściany, rzędna ${level(b.z)}`) }}
              onPointerOut={() => setHover(null)}
            >
              <cylinderGeometry args={[b.diameter / 2000, b.diameter / 2000, SLICE, 20]} />
              <meshStandardMaterial color={BAR_COLOR} />
            </mesh>
          ))}

          {/* Strzemiona w kolejnych przekrojach wycinka (pierwsze — w płaszczyźnie przekroju) */}
          {section.stirrups.flatMap((s, si) =>
            stirrupDepths(s.spacing).map((d, di) => (
              <group key={`st-${si}-${di}`}>
                <Line
                  points={s.loop.map((p) => [p.x, p.y, d] as [number, number, number])}
                  color={STIRRUP_COLOR}
                  lineWidth={di === 0 ? 2.5 : 1.2}
                  transparent
                  opacity={di === 0 ? 1 : 0.55}
                />
                {s.hooks.map((hk, hi) => (
                  <Line key={hi} points={hk.map((p) => [p.x, p.y, d] as [number, number, number])} color={STIRRUP_COLOR} lineWidth={di === 0 ? 2.5 : 1.2} />
                ))}
              </group>
            )),
          )}

          {/* Rzędne */}
          {section.levels.map((l) => {
            const x0 = section.bounds.x1 + 0.05
            return (
              <group key={l.label}>
                <Line points={[[x0, l.z, 0.01], [x0 + 0.25, l.z, 0.01]]} color={pal.ink} lineWidth={1} />
                <Line points={[[x0, l.z, 0.01], [x0 + 0.04, l.z + 0.04, 0.01], [x0 + 0.08, l.z, 0.01]]} color={pal.ink} lineWidth={1} />
              </group>
            )
          })}

          {/* Linie wymiarowe */}
          {section.dims.map((d, i) => {
            const pts: [number, number, number][] =
              d.dir === 'h' ? [[d.a, d.at, 0.01], [d.b, d.at, 0.01]] : [[d.at, d.a, 0.01], [d.at, d.b, 0.01]]
            const t = 0.02
            const ticks: [number, number, number][][] =
              d.dir === 'h'
                ? [[[d.a, d.at - t, 0.01], [d.a, d.at + t, 0.01]], [[d.b, d.at - t, 0.01], [d.b, d.at + t, 0.01]]]
                : [[[d.at - t, d.a, 0.01], [d.at + t, d.a, 0.01]], [[d.at - t, d.b, 0.01], [d.at + t, d.b, 0.01]]]
            return (
              <group key={`dim-${i}`}>
                <Line points={pts} color={pal.muted} lineWidth={1} />
                {ticks.map((tk, k) => (
                  <Line key={k} points={tk} color={pal.muted} lineWidth={1} />
                ))}
              </group>
            )
          })}
        </Canvas>
        <LabelOverlay labels={labels} refs={labelRefs} />
        {hover && <div className="fv-hover">{hover}</div>}
      </div>
      <ul className="fv-legend">
        {LEGEND.map((l) => (
          <li key={l.material}>
            <span className="fv-swatch" style={{ background: MATERIAL_COLOR[l.material].color }} />
            {l.label}
          </li>
        ))}
        <li>
          <span className="fv-swatch fv-round" style={{ background: BAR_COLOR }} />
          pręty podłużne
        </li>
        <li>
          <span className="fv-swatch fv-ring" style={{ borderColor: STIRRUP_COLOR }} />
          strzemiona
        </li>
      </ul>
      <p className="fv-hint">
        Przeciągnij, żeby obrócić wycinek (1 m elementu) — widać pręty podłużne i kolejne strzemiona. Kółko/szczypanie — zoom. Najedź na pręt — szczegóły.
      </p>
    </div>
  )
}
