// Dom 3D — etap 1: bryła z obliczeń (engine/model3d.ts). Komponent tylko renderuje.
// Układ budynku (x, y, z↑) → three.js (x, z, −y).

import { useEffect, useMemo, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { BufferGeometry, DoubleSide, Float32BufferAttribute, ShapeUtils, Vector2, Vector3 } from 'three'
import { buildHouseModel, type Box3, type Poly3 } from '../../engine/model3d'
import type { V3 } from '../../engine/roofModel'
import type { Estimate } from '../../engine/estimate'
import type { Stage } from '../../engine/items'
import { formatPLN } from '../../engine/money'
import type { ProjectInput } from '../../model/project'
import { fmtQty } from '../common/fields'
import { itemQtyText } from '../common/itemText'
import { ELEMENT_ITEMS } from '../roof-view/links'
import './house-3d.css'

const T = ([x, y, z]: V3): [number, number, number] => [x, z, -y]

const COLOR: Record<string, string> = {
  wall: '#d9d4c7',
  eps: '#f1efe8',
  glass: '#9cc7e6',
  frame: '#3b3f46',
  door: '#8b5a2b',
  sill: '#9aa0a6',
  floor: '#d8cfc0',
  main: '#b5523b',
  dormer: '#b5523b',
  dormerGable: '#f1efe8',
  gableWall: '#c49a6c',
  soffit: '#e8dcc8',
}

const LINKS: Record<string, { label: string; items: string[] }> = {
  wall: { label: 'Ściana zewnętrzna', items: ['ssz-hh-bloczki', 'ssz-hh-klej', 'ssz-eps', 'ssz-eps-tynk'] },
  eps: { label: 'Elewacja (EPS)', items: ['ssz-eps', 'ssz-eps-klej', 'ssz-eps-siatka', 'ssz-eps-tynk'] },
  glass: { label: 'Okno', items: ['ssz-stolarka-okna', 'ssz-parapety-zew', 'ssz-eps-apu'] },
  frame: { label: 'Stolarka', items: ['ssz-stolarka-okna', 'ssz-stolarka-drzwi-zew'] },
  sill: { label: 'Parapet zewnętrzny', items: ['ssz-parapety-zew'] },
  door: { label: 'Drzwi zewnętrzne', items: ['ssz-stolarka-drzwi-zew'] },
  floor: { label: 'Posadzka', items: ['sd-wylewka', 'ssz-eps-podlogowy'] },
  main: { label: 'Połać dachu', items: ELEMENT_ITEMS.main },
  dormer: { label: 'Połać daszku', items: ELEMENT_ITEMS.dormer },
  dormerGable: { label: 'Szczyt daszku', items: ELEMENT_ITEMS.dormerGable },
  gableWall: { label: 'Szczyt (wełna + boazeria)', items: ELEMENT_ITEMS.gable },
  soffit: { label: 'Podbitka', items: ['ssz-podbitka', 'ssz-podbitka-ruszt', 'ssz-podbitka-kratki'] },
}

type View = 'lot' | 'przod' | 'bok' | 'gora'
type Sel = { kind: string; id: string; ref: string } | null

/** Triangulacja płaskiego wielokąta (może być wklęsły — wycięcia pod daszki). */
function polyGeometry(p: Poly3): BufferGeometry {
  const n = new Vector3(...T(p.normal)).normalize()
  const pts = p.points.map((q) => new Vector3(...T(q)))
  const u = new Vector3().subVectors(pts[1], pts[0]).normalize()
  const v = new Vector3().crossVectors(n, u).normalize()
  const flat = pts.map((q) => new Vector2(q.dot(u), q.dot(v)))
  const tris = ShapeUtils.triangulateShape(flat, [])
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pts.flatMap((q) => [q.x, q.y, q.z]), 3))
  g.setIndex(tris.flat())
  g.computeVertexNormals()
  return g
}

function CameraRig({ view, center, size, version }: { view: View; center: Vector3; size: number; version: number }) {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as unknown as { target: Vector3; update: () => void } | null
  useEffect(() => {
    const d = size * 1.35
    const pos: Record<View, [number, number, number]> = {
      lot: [center.x - d * 0.75, center.y + d * 0.7, center.z + d * 0.9],
      przod: [center.x, center.y + size * 0.15, center.z + d * 1.1],
      bok: [center.x - d * 1.1, center.y + size * 0.15, center.z],
      gora: [center.x, center.y + d * 1.6, center.z + 0.001],
    }
    camera.position.set(...pos[view])
    camera.lookAt(center)
    if (controls) {
      controls.target.copy(center)
      controls.update()
    }
  }, [camera, controls, view, center, size, version])
  return null
}

function BoxMesh({ b, onPick, hot }: { b: Box3; onPick: (b: Box3) => void; hot: boolean }) {
  const glass = b.kind === 'glass'
  return (
    <mesh
      position={T(b.center)}
      castShadow={!glass}
      receiveShadow
      onClick={(e) => {
        e.stopPropagation()
        onPick(b)
      }}
    >
      <boxGeometry args={[b.size[0], b.size[2], b.size[1]]} />
      <meshStandardMaterial color={hot ? '#4dabf7' : COLOR[b.kind]} transparent={glass} opacity={glass ? 0.45 : 1} roughness={glass ? 0.1 : 0.85} metalness={glass ? 0.2 : 0} />
    </mesh>
  )
}

export function House3D({ project, estimate, onOpenItem }: { project: ProjectInput; estimate: Estimate; onOpenItem: (stage: Stage, id: string) => void }) {
  const model = useMemo(() => buildHouseModel(project), [project])
  const geoms = useMemo(() => model.polys.map((p) => ({ p, g: polyGeometry(p) })), [model])
  const [view, setView] = useState<View>('lot')
  const [version, setVersion] = useState(0)
  const [sel, setSel] = useState<Sel>(null)

  const { min, max } = model.bounds
  const center = useMemo(() => new Vector3(...T([(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2])), [min, max])
  const size = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2])
  const link = sel ? LINKS[sel.kind] : null
  const linked = link ? link.items.map((id) => estimate.items.find((r) => r.spec.id === id)).filter((r) => r !== undefined) : []

  return (
    <div className="house3d">
      <div className="rv-toolbar">
        {(
          [
            ['lot', 'Z lotu ptaka'],
            ['przod', 'Z przodu'],
            ['bok', 'Z boku'],
            ['gora', 'Z góry'],
          ] as const
        ).map(([v, l]) => (
          <button key={v} className={`btn${view === v ? ' on' : ''}`} onClick={() => { setView(v); setVersion((x) => x + 1) }}>
            {l}
          </button>
        ))}
        <span className="muted small">
          Kalenica {model.ridgeZ !== null ? `+${fmtQty(model.ridgeZ, 2)} m` : '—'}, wieniec +{fmtQty(model.ringTop, 3)} m. Przeciągnij — obrót, kółko — zoom, prawy przycisk — przesuwanie.
        </span>
      </div>
      {model.missing.length > 0 && <p className="warn-list">⚠ Model uproszczony — uzupełnij w „Dane projektu”: {model.missing.join(', ')}</p>}
      <div className="house3d-canvas">
        <Canvas shadows camera={{ fov: 40, near: 0.1, far: 500, position: [20, 15, 20] }} dpr={[1, 2]} onPointerMissed={() => setSel(null)}>
          <color attach="background" args={['#dfe9f3']} />
          <hemisphereLight args={['#ffffff', '#7fa66a', 0.75]} />
          <directionalLight position={[center.x - size, center.y + size * 1.5, center.z + size * 0.8]} intensity={1.6} castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-normalBias={0.04} shadow-camera-left={-size} shadow-camera-right={size} shadow-camera-top={size} shadow-camera-bottom={-size} />
          <OrbitControls makeDefault enableDamping={false} maxPolarAngle={Math.PI / 2 - 0.02} />
          <CameraRig view={view} center={center} size={size} version={version} />
          {/* teren */}
          <mesh position={[center.x, model.groundZ - 0.005, center.z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[size * 6, size * 6]} />
            <meshStandardMaterial color="#8db37a" roughness={1} />
          </mesh>
          {model.boxes.map((b) => (
            <BoxMesh key={b.id} b={b} hot={sel !== null && sel.ref === b.ref && sel.kind === b.kind} onPick={(x) => setSel({ kind: x.kind, id: x.id, ref: x.ref })} />
          ))}
          {geoms.map(({ p, g }) => (
            <mesh
              key={p.id}
              geometry={g}
              castShadow
              receiveShadow
              onClick={(e) => {
                e.stopPropagation()
                setSel({ kind: p.kind, id: p.id, ref: p.id })
              }}
            >
              <meshStandardMaterial color={sel?.id === p.id ? '#4dabf7' : COLOR[p.kind]} side={DoubleSide} roughness={0.9} />
            </mesh>
          ))}
        </Canvas>
      </div>
      {sel && link && (
        <section className="card rv-panel">
          <div className="ip-head">
            <h2>
              {link.label} <span className="muted small">({sel.ref})</span>
            </h2>
            <button className="btn-icon" onClick={() => setSel(null)} title="Zamknij">
              ✕
            </button>
          </div>
          <ul className="rv-items">
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
