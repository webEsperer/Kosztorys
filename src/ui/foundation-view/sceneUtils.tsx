import { type ReactNode, type RefObject, useEffect, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Vector3 } from 'three'

// ─── Etykiety HTML nad kanwą ────────────────────────────────────────────────
// Zamiast drei <Html> (osobny root React na każdą etykietę — problemy z React 19):
// zwykłe elementy DOM w nakładce, a komponent w kanwie co klatkę przelicza ich położenie.

export interface SceneLabel {
  id: string
  pos: [number, number, number]
  content: ReactNode
  className?: string
}

export type LabelRefs = RefObject<Map<string, HTMLDivElement>>

const tmp = new Vector3()

/** Wewnątrz <Canvas>: rzutuje położenia etykiet na ekran. */
export function LabelProjector({ labels, refs }: { labels: SceneLabel[]; refs: LabelRefs }) {
  useFrame(({ camera, size }) => {
    const map = refs.current
    if (!map) return
    for (const l of labels) {
      const el = map.get(l.id)
      if (!el) continue
      tmp.set(l.pos[0], l.pos[1], l.pos[2]).project(camera)
      const x = ((tmp.x + 1) / 2) * size.width
      const y = ((1 - tmp.y) / 2) * size.height
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`
      el.style.visibility = tmp.z > 1 || tmp.z < -1 ? 'hidden' : 'visible'
    }
  })
  return null
}

/** Poza <Canvas> (w tym samym kontenerze position: relative): warstwa z etykietami. */
export function LabelOverlay({ labels, refs }: { labels: SceneLabel[]; refs: LabelRefs }) {
  return (
    <div className="fv-overlay" aria-hidden="true">
      {labels.map((l) => (
        <div
          key={l.id}
          className="fv-anchor"
          style={{ visibility: 'hidden' }}
          ref={(el) => {
            const map = refs.current
            if (!map) return
            if (el) map.set(l.id, el)
            else map.delete(l.id)
          }}
        >
          <div className={l.className}>{l.content}</div>
        </div>
      ))}
    </div>
  )
}

export interface Region {
  x0: number
  x1: number
  y0: number
  y1: number
}

/** Ustawia kamerę ortograficzną na wprost (oś Z) tak, żeby region mieścił się w kadrze. */
export function FitCamera({ region, version }: { region: Region; version: number }) {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const controls = useThree((s) => s.controls) as unknown as { target: { set: (x: number, y: number, z: number) => void }; update: () => void } | null
  useEffect(() => {
    const cx = (region.x0 + region.x1) / 2
    const cy = (region.y0 + region.y1) / 2
    const w = Math.max(region.x1 - region.x0, 1e-3)
    const h = Math.max(region.y1 - region.y0, 1e-3)
    camera.position.set(cx, cy, 50)
    camera.up.set(0, 1, 0)
    camera.zoom = Math.min(size.width / w, size.height / h) * 0.92
    camera.lookAt(cx, cy, 0)
    camera.updateProjectionMatrix()
    if (controls) {
      controls.target.set(cx, cy, 0)
      controls.update()
    }
  }, [camera, controls, size.width, size.height, region.x0, region.x1, region.y0, region.y1, version])
  return null
}

export function usePrefersDark(): boolean {
  const q = '(prefers-color-scheme: dark)'
  const [dark, setDark] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(q).matches)
  useEffect(() => {
    const m = window.matchMedia?.(q)
    if (!m) return
    const on = () => setDark(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return dark
}

export interface ScenePalette {
  background: string
  ink: string
  muted: string
  label: string
}

export function scenePalette(dark: boolean): ScenePalette {
  return dark
    ? { background: '#1b1d22', ink: '#d9dbe0', muted: '#7d8089', label: '#e8e8ea' }
    : { background: '#ffffff', ink: '#2a2a2e', muted: '#9a9aa2', label: '#1d1d1f' }
}

/** Liczba w formacie polskim. */
export function pl(x: number, d = 2): string {
  return x.toLocaleString('pl-PL', { maximumFractionDigits: d, minimumFractionDigits: 0 })
}

export function level(z: number): string {
  if (Math.abs(z) < 1e-9) return '±0,00'
  return (z > 0 ? '+' : '−') + Math.abs(z).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 3 })
}
