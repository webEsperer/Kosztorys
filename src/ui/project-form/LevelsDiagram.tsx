// Schemat poziomów (przekrój przez ścianę zewnętrzną) — rzędne z engine (projectBase / computeLevels).

import type { ProjectInput } from '../../model/project'
import { projectBase } from '../../engine/stages/common'
import { roofOf } from '../../engine/stages/sszRoof'
import { fmtQty } from '../common/fields'

const lv = (z: number) => (Math.abs(z) < 1e-9 ? '±0,00' : `${z > 0 ? '+' : '−'}${Math.abs(z).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 3 })}`)

export function LevelsDiagram({ project }: { project: ProjectInput }) {
  const base = projectBase(project)
  const L = base.levels
  if (!L) return <p className="calc todo-inline">Schemat poziomów — uzupełnij: {base.levelsMissing.join(', ')}</p>
  const f = L.foundation.value
  const w = L.wallLayers.value
  const fl = base.floor!
  const ringTop = base.ringTop.value
  const roof = roofOf(project).roof
  const ridge = roof ? ringTop + roof.ridgeRise : null
  const zTop = (ridge ?? ringTop) + 0.3
  const zBot = (f.footingBottom ?? f.footingTop - 0.4) - 0.2
  const H = 640
  const sc = H / (zTop - zBot)
  const Y = (z: number) => (zTop - z) * sc
  const W = 420
  // poziomo [m]: ściana 0…t, wnętrze t…t+1,6; ława szersza
  const t = project.wallThickness
  const e = project.facadeInsulation
  const xs = 150 / 1.2
  const X = (x: number) => 16 + (x + e + 0.7) * xs
  const fw = project.foundation.footingWidth ?? 0.6
  const tf = project.foundation.blockWidth ?? t
  const inner = 1.6
  const rect = (x0: number, z0: number, x1: number, z1: number, cls: string, key: string) => (
    <rect key={key} x={X(x0)} y={Y(z1)} width={(x1 - x0) * xs} height={Math.max(0.5, (z1 - z0) * sc)} className={cls} />
  )
  const course = (project.wall.blockHeight ?? 0.24) + project.wall.jointThickness
  const fCourse = (project.foundation.blockHeight ?? 0.12) + (project.foundation.jointThickness ?? 0)
  const slabTop = L.slabTop.value
  const ceilBoard = L.ceiling.value + project.ceiling.board
  const ceilGrid = ceilBoard + project.ceiling.grid
  const marks: [number, string][] = [
    ...(ridge !== null ? ([[ridge, 'kalenica (bez pokrycia)']] as [number, string][]) : []),
    [ringTop, 'góra wieńca ścian'],
    [w.ringBeamBottom, `spód wieńca (${fmtQty(w.ringBeamHeight * 100, 1)} cm)`],
    [L.ceiling.value, 'gotowy sufit'],
    [0, 'gotowa posadzka'],
    [slabTop, 'góra chudziaka = wieńca fund.'],
    [f.ringBeamBottom, 'spód wieńca fund.'],
    [f.footingTop, 'góra ławy'],
    [f.excavationBottom, 'dno wykopu'],
    ...(f.footingBottom !== null ? ([[f.footingBottom, 'spód ławy']] as [number, string][]) : []),
  ]
  // etykiety rzędnych bez nakładania się
  const labelY: number[] = []
  for (const [z] of marks) {
    let y = Y(z)
    const prev = labelY[labelY.length - 1]
    if (prev !== undefined && y - prev < 13) y = prev + 13
    labelY.push(y)
  }
  const wallCourses = Array.from({ length: w.fullLayers }, (_, i) => slabTop + project.wall.levelingLayer + i * course)
  const fundCourses = Array.from({ length: project.foundation.layers ?? 0 }, (_, i) => f.footingTop + i * fCourse)
  marks.sort((a, b) => b[0] - a[0])
  const xLab = X(t + inner) + 14

  return (
    <figure className="levels-diagram">
      <svg viewBox={`0 0 ${W + 190} ${H}`} width="100%" role="img" aria-label="Schemat poziomów">
        {/* grunt / wykop */}
        <line x1={X(-e - 0.6)} y1={Y(f.excavationBottom)} x2={X(t + inner)} y2={Y(f.excavationBottom)} className="ld-ground" />
        {/* ława */}
        {f.footingBottom !== null && rect(t / 2 - fw / 2, f.footingBottom, t / 2 + fw / 2, f.footingTop, 'ld-concrete', 'lawa')}
        {/* bloczki fundamentowe */}
        {fundCourses.map((z, i) => rect(t / 2 - tf / 2, z, t / 2 + tf / 2, z + fCourse, 'ld-block', `fb${i}`))}
        {rect(t / 2 - tf / 2, f.ringBeamBottom, t / 2 + tf / 2, slabTop, 'ld-concrete', 'wf')}
        {/* XPS */}
        {rect(t / 2 - tf / 2 - project.foundationInsulation, f.footingTop, t / 2 - tf / 2, slabTop - 0.03, 'ld-xps', 'xps')}
        {/* wnętrze: zasypka, chudziak, warstwy podłogi */}
        {rect(t / 2 + tf / 2, f.excavationBottom, t + inner, L.slabBottom.value, 'ld-sand', 'piasek')}
        {rect(t / 2 + tf / 2, L.slabBottom.value, t + inner, slabTop, 'ld-concrete', 'chudziak')}
        {rect(t, slabTop, t + inner, slabTop + fl.insulation, 'ld-eps', 'eps-p')}
        {rect(t, slabTop + fl.insulation, t + inner, slabTop + fl.insulation + fl.screed, 'ld-screed', 'wylewka')}
        {rect(t, -fl.finish, t + inner, 0, 'ld-finish', 'wyk')}
        {/* ściana: warstwy bloczków + docinka + wieniec */}
        {wallCourses.map((z, i) => rect(0, z, t, z + course, 'ld-hh', `hh${i}`))}
        {w.cutLayerHeight > 0 && rect(0, w.ringBeamBottom - w.cutLayerHeight, t, w.ringBeamBottom, 'ld-hh-cut', 'cut')}
        {rect(0, w.ringBeamBottom, t, ringTop, 'ld-concrete', 'ws')}
        {/* EPS elewacji */}
        {rect(-e, slabTop - 0.03, 0, ringTop, 'ld-eps', 'eps-e')}
        {/* sufit: GK, stelaż, pustka */}
        {rect(t, L.ceiling.value, t + inner, ceilBoard, 'ld-gk', 'gk')}
        {rect(t, ceilBoard, t + inner, ceilGrid, 'ld-grid', 'stelaz')}
        {/* dach (szkic) */}
        {ridge !== null && <polyline points={`${X(-e - 0.6)},${Y(ringTop - 0.3)} ${X(t + inner)},${Y(ringTop + (inner + e + 0.6) * Math.tan(((project.roof.pitchDeg ?? 0) * Math.PI) / 180))}`} className="ld-roof" />}
        {/* rzędne */}
        {marks.map(([z, label], i) => (
          <g key={label} className="ld-mark">
            <line x1={X(-e - 0.6)} y1={Y(z)} x2={xLab - 4} y2={Y(z)} />
            <line x1={xLab - 4} y1={Y(z)} x2={xLab} y2={labelY[i]} />
            <text x={xLab + 2} y={labelY[i] + 4}>
              <tspan className="ld-z">{lv(z)}</tspan> {label}
            </text>
          </g>
        ))}
        <text x={X(t / 2)} y={Y((slabTop + w.ringBeamBottom) / 2)} className="ld-note" textAnchor="middle" transform={`rotate(-90 ${X(t / 2)} ${Y((slabTop + w.ringBeamBottom) / 2)})`}>
          {w.fullLayers} × {fmtQty(course * 100, 1)} cm{w.cutLayerHeight > 0 ? ` + docinka ${fmtQty(w.cutLayerHeight * 100, 1)}` : ''}
        </text>
      </svg>
      <figcaption className="muted small">
        Przekrój przez ścianę zewnętrzną (skala pionowa {fmtQty(1 / sc * 100, 1)} cm/px). Wysokość budynku do kalenicy: {ridge !== null ? `${fmtQty((ridge - f.excavationBottom) , 2)} m od dna wykopu, ${fmtQty(ridge, 2)} m od posadzki` : 'podaj dach'}.
      </figcaption>
    </figure>
  )
}
