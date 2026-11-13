// Podgląd fundamentu: przekrój pionowy i rzut zbrojenia. Wszystkie liczby z engine/, wymiary z danych projektu.

import { useMemo, useState } from 'react'
import type { ProjectInput } from '../../model/project'
import type { Update } from '../project-form/ProjectForm'
import { NumField } from '../common/fields'
import { computeGeometry } from '../../engine/geometry'
import { computeLevels, DEFAULT_LEVELS } from '../../engine/levels'
import {
  computeRebarElement,
  defaultFootingRebar,
  defaultRingBeamRebar,
  REBAR_WARNING,
  summarizeRebar,
  type RebarElementResult,
} from '../../engine/rebar'
import { layoutRebarPlan, rectSides, type AxisRect } from '../../engine/rebarLayout'
import { buildFoundationSection } from '../../engine/foundationSection'
import { SectionScene } from './SectionScene'
import { PlanScene, type PlanElement } from './PlanScene'
import { FormworkOsb } from '../cutting/FormworkOsb'
import { pl } from './sceneUtils'
import './foundation-view.css'

/** Pole formularza powiązane z danymi projektu (wartości w metrach; w polu cm). */
interface Field {
  label: string
  unit: 'cm' | 'szt'
  get: (p: ProjectInput) => number | null
  set: (p: ProjectInput, v: number | null) => void
  /** Pole wymagane do rysunku (null = uzupełnij). */
  required?: boolean
  /** Puste pole niedozwolone (wartość zawsze jest). */
  noEmpty?: boolean
  step?: number
}

// Wspólne z „Danymi projektu” — zmiana tutaj zmienia projekt i kosztorys (i odwrotnie).
const FIELDS: Field[] = [
  { label: 'Długość wewn.', unit: 'cm', get: (p) => p.footprint.length, set: (p, v) => { p.footprint.length = v ?? p.footprint.length }, noEmpty: true },
  { label: 'Szerokość wewn.', unit: 'cm', get: (p) => p.footprint.width, set: (p, v) => { p.footprint.width = v ?? p.footprint.width }, noEmpty: true },
  { label: 'Ściana nośna', unit: 'cm', get: (p) => p.wallThickness, set: (p, v) => { p.wallThickness = v ?? p.wallThickness }, noEmpty: true },
  { label: 'Ława — szerokość', unit: 'cm', get: (p) => p.foundation.footingWidth, set: (p, v) => { p.foundation.footingWidth = v }, required: true },
  { label: 'Ława — wysokość', unit: 'cm', get: (p) => p.foundation.footingHeight, set: (p, v) => { p.foundation.footingHeight = v }, required: true },
  { label: 'Ściana fund. — grubość (szer. bloczka)', unit: 'cm', get: (p) => p.foundation.blockWidth, set: (p, v) => { p.foundation.blockWidth = v }, required: true },
  { label: 'Bloczek fund. — wysokość', unit: 'cm', get: (p) => p.foundation.blockHeight, set: (p, v) => { p.foundation.blockHeight = v }, required: true, step: 0.5 },
  { label: 'Spoina', unit: 'cm', get: (p) => p.foundation.jointThickness, set: (p, v) => { p.foundation.jointThickness = v }, required: true, step: 0.1 },
  { label: 'Warstwy bloczków', unit: 'szt', get: (p) => p.foundation.layers, set: (p, v) => { p.foundation.layers = v === null ? null : Math.round(v) }, required: true },
  { label: 'Wieniec fund. — wysokość', unit: 'cm', get: (p) => p.foundation.ringBeamHeight, set: (p, v) => { p.foundation.ringBeamHeight = v ?? p.foundation.ringBeamHeight }, noEmpty: true },
]

type Tab = 'przekroj' | 'rzut' | 'osb'

export function FoundationViewer({ project, update }: { project: ProjectInput; update: Update }) {
  const [tab, setTab] = useState<Tab>('przekroj')

  const model = useMemo(() => {
    const f = project.foundation
    const fl = project.floorLayers
    const missing: string[] = []
    if (f.footingWidth === null) missing.push('szerokość ławy')
    if (f.footingHeight === null) missing.push('wysokość ławy')
    if (f.blockWidth === null) missing.push('grubość ściany fundamentowej (szerokość bloczka)')
    if (f.blockHeight === null) missing.push('wysokość bloczka fundamentowego')
    if (f.jointThickness === null) missing.push('spoina bloczków fundamentowych')
    if (f.layers === null) missing.push('liczba warstw bloczków')
    if (fl.insulation === null || fl.screed === null || fl.finish === null) missing.push('warstwy podłogi (Dane projektu → 2. Wysokości)')
    if (missing.length) return { ok: false as const, error: `Uzupełnij: ${missing.join(', ')}` }
    try {
      const t = project.wallThickness
      const fw = f.blockWidth!
      const geo = computeGeometry({
        footprint: { kind: 'rect', length: project.footprint.length, width: project.footprint.width },
        wallThickness: t,
        facadeInsulation: project.facadeInsulation,
      })
      const floorLayers = { insulation: fl.insulation!, screed: fl.screed!, finish: fl.finish! }
      const lv = computeLevels({
        ...DEFAULT_LEVELS,
        clearHeight: project.clearHeight,
        floorLayers,
        slabThickness: project.slabThickness,
        foundation: {
          blockHeight: f.blockHeight!,
          jointThickness: f.jointThickness!,
          layers: f.layers!,
          ringBeamHeight: f.ringBeamHeight,
          footingFormworkHeight: f.footingFormworkHeight,
          footingHeight: f.footingHeight,
        },
      })
      const axis: AxisRect = { length: project.footprint.length + t, width: project.footprint.width + t }
      const pOs = geo.axisPerimeter.value
      const footP = defaultFootingRebar(f.footingWidth!, f.footingHeight!)
      const ringP = defaultRingBeamRebar(fw, f.ringBeamHeight)
      const sides = rectSides(axis)
      const footR = computeRebarElement('Ławy', sides, footP)
      const ringR = computeRebarElement('Wieniec fundamentowy', sides, ringP)
      const section = buildFoundationSection({
        wallThickness: t,
        facadeInsulation: project.facadeInsulation,
        foundationInsulation: project.foundationInsulation,
        foundationWallThickness: fw,
        blockHeight: f.blockHeight!,
        jointThickness: f.jointThickness!,
        layers: f.layers!,
        footingWidth: f.footingWidth!,
        footingHeight: f.footingHeight!,
        ringBeamWidth: fw,
        ringBeamHeight: f.ringBeamHeight,
        slabThickness: project.slabThickness,
        floorLayers,
        slabTop: lv.slabTop.value,
        foundation: lv.foundation.value,
        footingRebar: footP,
        ringBeamRebar: ringP,
        xpsTopGap: 0.03,
      })
      const elements: PlanElement[] = [
        { key: 'lawa', name: 'Ława', layout: layoutRebarPlan(axis, footP, footR) },
        { key: 'wieniec', name: 'Wieniec fund.', layout: layoutRebarPlan(axis, ringP, ringR) },
      ]
      const ringBeam = { width: fw, height: f.ringBeamHeight }
      return { ok: true as const, pOs, axis, ringBeam, section, elements, results: [footR, ringR], summary: summarizeRebar([footR, ringR]) }
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) }
    }
  }, [project])

  return (
    <div className="fv">
      <header className="fv-head">
        <h1>Fundament — przekrój i zbrojenie</h1>
        <p className="fv-warn">{REBAR_WARNING}</p>
      </header>

      <div className="fv-body">
        <aside className="fv-side">
          <h2>Parametry</h2>
          <p className="fv-note">Wymiary wspólne z „Danymi projektu” — zmiana tutaj zmienia też projekt i kosztorys.</p>
          <div className="fv-form">
            {FIELDS.map((fd) => (
              <NumField
                key={fd.label}
                label={fd.label}
                unit={fd.unit}
                scale={fd.unit === 'cm' ? 100 : 1}
                positive={fd.unit === 'cm' && fd.label !== 'Spoina'}
                nonNegative
                required={fd.required}
                allowEmpty={!fd.noEmpty}
                value={fd.get(project)}
                onChange={(v) => update((p) => fd.set(p, v))}
              />
            ))}
          </div>

          {model.ok && (
            <>
              <h2>Zestawienie stali</h2>
              <table className="fv-table">
                <thead>
                  <tr>
                    <th />
                    <th>wbudowane</th>
                    <th>pręty 6 m</th>
                    <th>do kupienia</th>
                    <th>masa</th>
                  </tr>
                </thead>
                <tbody>
                  {model.summary.byDiameter.map((d) => (
                    <tr key={d.diameter}>
                      <th>Ø{d.diameter}</th>
                      <td>{pl(d.netMeters)} m</td>
                      <td>{d.bars} szt</td>
                      <td>{pl(d.meters)} m</td>
                      <td>{pl(d.massKg, 1)} kg</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {model.results.map((r) => (
                <ElementSummary key={r.name} r={r} />
              ))}
            </>
          )}
        </aside>

        <main className="fv-main">
          <div className="fv-tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'przekroj'} className={tab === 'przekroj' ? 'on' : ''} onClick={() => setTab('przekroj')}>
              Przekrój pionowy
            </button>
            <button role="tab" aria-selected={tab === 'rzut'} className={tab === 'rzut' ? 'on' : ''} onClick={() => setTab('rzut')}>
              Rzut zbrojenia
            </button>
            <button role="tab" aria-selected={tab === 'osb'} className={tab === 'osb' ? 'on' : ''} onClick={() => setTab('osb')}>
              Szalunek OSB
            </button>
          </div>
          {!model.ok ? (
            <p className="fv-error">{model.error}</p>
          ) : tab === 'przekroj' ? (
            <SectionScene section={model.section} />
          ) : tab === 'rzut' ? (
            <PlanScene axis={model.axis} elements={model.elements} />
          ) : (
            <FormworkOsb
              title="Szalunek wieńca fundamentowego — plan cięcia OSB"
              axis={model.axis}
              beamWidth={model.ringBeam.width}
              beamHeight={model.ringBeam.height}
            />
          )}
        </main>
      </div>
    </div>
  )
}

function ElementSummary({ r }: { r: RebarElementResult }) {
  return (
    <details className="fv-el">
      <summary>
        {r.name}: {r.byDiameter.map((d) => `${d.bars} × Ø${d.diameter}`).join(', ')}
      </summary>
      <ul>
        {r.sides.map((s, i) => (
          <li key={i}>
            Bok {i + 1} ({pl(s.length)} m): {s.laps} zakł., linia {pl(s.lineLength)} m, {s.stirrupPositions.length} strzemion
          </li>
        ))}
        <li>Pręty główne: {pl(r.longitudinalNetMeters)} m</li>
        <li>
          eLki: {r.cornerPieces} × {pl(r.cornerPieceLength)} m = {pl(r.cornerNetMeters)} m
        </li>
        <li>
          Strzemiona: {r.stirrupCount} szt × {pl(r.stirrupLength)} m = {pl(r.stirrupNetMeters)} m
        </li>
      </ul>
    </details>
  )
}
