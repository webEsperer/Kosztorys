// Podgląd fundamentu: przekrój pionowy i rzut zbrojenia. Wszystkie liczby z engine/.

import { useMemo, useState } from 'react'
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
import { layoutRebarPlan, type AxisRect } from '../../engine/rebarLayout'
import { buildFoundationSection } from '../../engine/foundationSection'
import { SectionScene } from './SectionScene'
import { PlanScene, type PlanElement } from './PlanScene'
import { pl } from './sceneUtils'
import './foundation-view.css'

interface FormCm {
  lengthIn: number
  widthIn: number
  wall: number
  footingWidth: number
  footingHeight: number
  fwThickness: number
  blockHeight: number
  joint: number
  layers: number
  ringBeamHeight: number
}

// Wymiary ławy i bloczka fundamentowego to dane PRZYKŁADOWE — w projekcie podaje je użytkownik.
const INITIAL: FormCm = {
  lengthIn: 1200,
  widthIn: 900,
  wall: 24,
  footingWidth: 60,
  footingHeight: 40,
  fwThickness: 24,
  blockHeight: 12,
  joint: 1,
  layers: 5,
  ringBeamHeight: 25,
}

const FIELDS: { key: keyof FormCm; label: string; unit: string; step?: number }[] = [
  { key: 'lengthIn', label: 'Długość wewn.', unit: 'cm' },
  { key: 'widthIn', label: 'Szerokość wewn.', unit: 'cm' },
  { key: 'wall', label: 'Ściana nośna', unit: 'cm' },
  { key: 'footingWidth', label: 'Ława — szerokość', unit: 'cm' },
  { key: 'footingHeight', label: 'Ława — wysokość', unit: 'cm' },
  { key: 'fwThickness', label: 'Ściana fund. — grubość', unit: 'cm' },
  { key: 'blockHeight', label: 'Bloczek fund. — wysokość', unit: 'cm', step: 0.5 },
  { key: 'joint', label: 'Spoina', unit: 'cm', step: 0.1 },
  { key: 'layers', label: 'Warstwy bloczków', unit: 'szt' },
  { key: 'ringBeamHeight', label: 'Wieniec fund. — wysokość', unit: 'cm' },
]

type Tab = 'przekroj' | 'rzut'

export function FoundationViewer() {
  const [form, setForm] = useState<FormCm>(INITIAL)
  const [tab, setTab] = useState<Tab>('przekroj')

  const model = useMemo(() => {
    try {
      const m = (x: number) => x / 100
      const t = m(form.wall)
      const geo = computeGeometry({
        footprint: { kind: 'rect', length: m(form.lengthIn), width: m(form.widthIn) },
        wallThickness: t,
        facadeInsulation: 0.2,
      })
      const lv = computeLevels({
        ...DEFAULT_LEVELS,
        foundation: {
          ...DEFAULT_LEVELS.foundation,
          blockHeight: m(form.blockHeight),
          jointThickness: m(form.joint),
          layers: Math.round(form.layers),
          ringBeamHeight: m(form.ringBeamHeight),
          footingHeight: m(form.footingHeight),
        },
      })
      const axis: AxisRect = { length: m(form.lengthIn) + t, width: m(form.widthIn) + t }
      const pOs = geo.axisPerimeter.value
      const footP = defaultFootingRebar(m(form.footingWidth), m(form.footingHeight))
      const ringP = defaultRingBeamRebar(m(form.fwThickness), m(form.ringBeamHeight))
      const footR = computeRebarElement('Ławy', pOs, footP)
      const ringR = computeRebarElement('Wieniec fundamentowy', pOs, ringP)
      const section = buildFoundationSection({
        wallThickness: t,
        facadeInsulation: 0.2,
        foundationInsulation: 0.1,
        foundationWallThickness: m(form.fwThickness),
        blockHeight: m(form.blockHeight),
        jointThickness: m(form.joint),
        layers: Math.round(form.layers),
        footingWidth: m(form.footingWidth),
        footingHeight: m(form.footingHeight),
        ringBeamWidth: m(form.fwThickness),
        ringBeamHeight: m(form.ringBeamHeight),
        slabThickness: DEFAULT_LEVELS.slabThickness,
        floorLayers: DEFAULT_LEVELS.floorLayers,
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
      return { ok: true as const, pOs, axis, section, elements, results: [footR, ringR], summary: summarizeRebar([footR, ringR]) }
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) }
    }
  }, [form])

  return (
    <div className="fv">
      <header className="fv-head">
        <h1>Fundament — przekrój i zbrojenie</h1>
        <p className="fv-warn">{REBAR_WARNING}</p>
      </header>

      <div className="fv-body">
        <aside className="fv-side">
          <h2>Parametry</h2>
          <p className="fv-note">Wymiary ławy i bloczka fundamentowego są przykładowe — wpisz swoje.</p>
          <div className="fv-form">
            {FIELDS.map((f) => (
              <label key={f.key}>
                <span>{f.label}</span>
                <span className="fv-input">
                  <input
                    type="number"
                    inputMode="decimal"
                    step={f.step ?? 1}
                    value={form[f.key]}
                    onChange={(e) => setForm({ ...form, [f.key]: Number(e.target.value) })}
                  />
                  <em>{f.unit}</em>
                </span>
              </label>
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
          </div>
          {!model.ok ? (
            <p className="fv-error">{model.error}</p>
          ) : tab === 'przekroj' ? (
            <SectionScene section={model.section} />
          ) : (
            <PlanScene axis={model.axis} elements={model.elements} />
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
        {r.name}: {r.longitudinalBars + r.cornerBars} × Ø12, {r.stirrupBars} × Ø6
      </summary>
      <ul>
        <li>Obwód w osi: {pl(r.lineLength)} m</li>
        <li>Pręty na linię: {r.segmentsPerLine} (× 4 linie = {r.longitudinalBars})</li>
        <li>Pręty narożne „L”: {r.cornerPieces} szt → {r.cornerBars} prętów 6 m</li>
        <li>
          Strzemiona: {r.stirrupCount} szt × {pl(r.stirrupLength)} m = {pl(r.stirrupNetMeters)} m → {r.stirrupBars} prętów 6 m
        </li>
      </ul>
    </details>
  )
}
