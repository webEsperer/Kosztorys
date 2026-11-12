// Szalunek wieńca z OSB: parametry płyty i pasa → plan cięcia (engine/cutting.ts).

import { useMemo, useState } from 'react'
import { computeCutting, DEFAULT_MIN_PIECE, formworkSegmentsRect } from '../../engine/cutting'
import { renderTrace } from '../../engine/trace'
import { CuttingPlan } from './CuttingPlan'

export function FormworkOsb({
  title,
  axis,
  beamWidth,
  beamHeight,
}: {
  title: string
  axis: { length: number; width: number }
  beamWidth: number
  beamHeight: number
}) {
  const [sheetCm, setSheetCm] = useState({ length: 250, width: 125 })
  const [overlapCm, setOverlapCm] = useState(10)
  const [minPieceCm, setMinPieceCm] = useState(DEFAULT_MIN_PIECE * 100)
  const [show, setShow] = useState<'best' | 'A' | 'B'>('best')

  const calc = useMemo(() => {
    try {
      const segments = formworkSegmentsRect(axis.length, axis.width, beamWidth)
      const stripWidth = beamHeight + overlapCm / 100
      const sheet = { width: sheetCm.width / 100, length: sheetCm.length / 100 }
      const result = computeCutting({
        material: 'płytę OSB',
        sheetUnit: 'płyt',
        sheet,
        stripWidth,
        segments,
        minPieceLength: minPieceCm / 100,
        jointOverlap: 0,
      })
      return { ok: true as const, segments, stripWidth, sheet, result }
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) }
    }
  }, [axis.length, axis.width, beamWidth, beamHeight, sheetCm, overlapCm, minPieceCm])

  const num = (v: number, set: (n: number) => void) => (
    <input type="number" inputMode="decimal" value={v} onChange={(e) => set(Number(e.target.value))} />
  )

  return (
    <div className="fv-osb">
      <h2 className="fv-osb-title">{title}</h2>
      <div className="fv-osb-form">
        <label>
          Płyta OSB {num(sheetCm.length, (n) => setSheetCm({ ...sheetCm, length: n }))} ×{' '}
          {num(sheetCm.width, (n) => setSheetCm({ ...sheetCm, width: n }))} cm
        </label>
        <label>
          Zakład na bloczki {num(overlapCm, setOverlapCm)} cm
        </label>
        <label>
          Min. kawałek z resztki {num(minPieceCm, setMinPieceCm)} cm
        </label>
      </div>
      {!calc.ok ? (
        <p className="fv-error">{calc.error}</p>
      ) : (
        <>
          <p className="fv-note">
            Pas = wysokość wieńca {Math.round(beamHeight * 100)} cm + zakład {overlapCm} cm = {Math.round(calc.stripWidth * 1000) / 10} cm;
            szalunek obustronny: {calc.segments.length} odcinków, razem {calc.result.totalSegmentLength.toLocaleString('pl-PL')} m.
          </p>
          <div className="fv-seg" role="group" aria-label="Wariant cięcia">
            {(
              [
                ['best', `Najlepszy (${calc.result.best.key})`],
                ['A', calc.result.A ? `A — wzdłuż: ${calc.result.A.sheets} płyt` : 'A — niemożliwy'],
                ['B', calc.result.B ? `B — w poprzek: ${calc.result.B.sheets} płyt` : 'B — niemożliwy'],
              ] as const
            ).map(([k, t]) => (
              <button
                key={k}
                className={show === k ? 'on' : ''}
                disabled={(k === 'A' && !calc.result.A) || (k === 'B' && !calc.result.B)}
                onClick={() => setShow(k)}
              >
                {t}
              </button>
            ))}
          </div>
          <CuttingPlan
            result={calc.result}
            variant={show === 'best' ? calc.result.best : (calc.result[show] ?? calc.result.best)}
            sheet={calc.sheet}
            stripWidth={calc.stripWidth}
            segments={calc.segments}
          />
          <details className="fv-el">
            <summary>Jak to policzono</summary>
            <pre className="fv-trace">{renderTrace(calc.result.trace)}</pre>
          </details>
        </>
      )}
    </div>
  )
}
