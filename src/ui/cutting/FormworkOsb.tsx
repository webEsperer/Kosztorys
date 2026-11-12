// Szalunek wieńca z OSB: użytkownik podaje wymiar płyty, którą kupuje → dwa warianty cięcia (engine/cutting.ts)
// do wyboru przez użytkownika; przy tańszym wariancie z większą liczbą łączeń — ostrzeżenie.

import { useMemo, useState } from 'react'
import { computeCutting, DEFAULT_MIN_PIECE, formworkSegmentsRect, type CuttingVariant } from '../../engine/cutting'
import { renderTrace } from '../../engine/trace'
import { CuttingPlan } from './CuttingPlan'

type Choice = 'A' | 'B'

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
  // Wymiar płyty — zawsze od użytkownika (taki, jaki kupuje); brak wartości domyślnej.
  const [sheetCm, setSheetCm] = useState<{ length: string; width: string }>({ length: '', width: '' })
  const [overlapCm, setOverlapCm] = useState(10)
  const [minPieceCm, setMinPieceCm] = useState(DEFAULT_MIN_PIECE * 100)
  const [chosen, setChosen] = useState<Choice | null>(null)
  const [preview, setPreview] = useState<Choice>('A')

  const sheetL = Number(sheetCm.length.replace(',', '.'))
  const sheetW = Number(sheetCm.width.replace(',', '.'))
  const sheetGiven = sheetL > 0 && sheetW > 0

  const calc = useMemo(() => {
    if (!sheetGiven) return null
    try {
      const segments = formworkSegmentsRect(axis.length, axis.width, beamWidth)
      const stripWidth = beamHeight + overlapCm / 100
      const sheet = { width: sheetW / 100, length: sheetL / 100 }
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
  }, [sheetGiven, sheetL, sheetW, axis.length, axis.width, beamWidth, beamHeight, overlapCm, minPieceCm])

  const shown: CuttingVariant | null = calc?.ok
    ? (calc.result[chosen ?? preview] ?? calc.result.A ?? calc.result.B)
    : null

  return (
    <div className="fv-osb">
      <h2 className="fv-osb-title">{title}</h2>
      <div className="fv-osb-form">
        <label>
          Płyta OSB, którą kupujesz{' '}
          <input
            type="text"
            inputMode="decimal"
            placeholder="dł."
            value={sheetCm.length}
            onChange={(e) => { setSheetCm({ ...sheetCm, length: e.target.value }); setChosen(null) }}
          />{' '}
          ×{' '}
          <input
            type="text"
            inputMode="decimal"
            placeholder="szer."
            value={sheetCm.width}
            onChange={(e) => { setSheetCm({ ...sheetCm, width: e.target.value }); setChosen(null) }}
          />{' '}
          cm
        </label>
        <label>
          Zakład na bloczki{' '}
          <input type="number" inputMode="decimal" value={overlapCm} onChange={(e) => { setOverlapCm(Number(e.target.value)); setChosen(null) }} /> cm
        </label>
        <label>
          Min. kawałek z resztki{' '}
          <input type="number" inputMode="decimal" value={minPieceCm} onChange={(e) => { setMinPieceCm(Number(e.target.value)); setChosen(null) }} /> cm
        </label>
      </div>

      {!sheetGiven ? (
        <p className="fv-todo">Uzupełnij: podaj wymiar płyty OSB, którą kupujesz — na tej podstawie policzę dwa warianty cięcia.</p>
      ) : !calc?.ok ? (
        <p className="fv-error">{calc?.error}</p>
      ) : (
        <>
          <p className="fv-note">
            Pas = wysokość wieńca {Math.round(beamHeight * 100)} cm + zakład {overlapCm} cm = {Math.round(calc.stripWidth * 1000) / 10} cm;
            szalunek obustronny: {calc.segments.length} odcinków, razem {calc.result.totalSegmentLength.toLocaleString('pl-PL')} m.
          </p>

          <div className="fv-variants">
            {(['A', 'B'] as const).map((k) => {
              const v = calc.result[k]
              return (
                <div key={k} className={`fv-variant${chosen === k ? ' chosen' : ''}${!chosen && preview === k ? ' previewed' : ''}`}>
                  <div className="fv-variant-head">
                    <b>Wariant {k} — pasy {k === 'A' ? 'wzdłuż' : 'w poprzek'}</b>
                    {calc.result.cheaper === k && <span className="fv-badge">tańszy</span>}
                    {chosen === k && <span className="fv-badge fv-badge-ok">wybrany</span>}
                  </div>
                  {v ? (
                    <>
                      <p>{v.instruction}</p>
                      <p>
                        <b>{v.sheets} płyt</b>, łączeń {v.joints}, odpad {v.wasteArea.toLocaleString('pl-PL')} m² (
                        {v.wastePercent.toLocaleString('pl-PL', { maximumFractionDigits: 1 })}%)
                      </p>
                      <div className="fv-variant-actions">
                        <button onClick={() => setPreview(k)} disabled={chosen !== null}>Pokaż plan</button>
                        <button className="fv-primary" onClick={() => { setChosen(k); setPreview(k) }}>
                          Wybieram wariant {k}
                        </button>
                      </div>
                    </>
                  ) : (
                    <p>Niemożliwy — pas szerszy niż płyta w tym kierunku.</p>
                  )}
                </div>
              )
            })}
          </div>

          {calc.result.jointsWarning && <p className="fv-warn fv-warn-block">⚠ {calc.result.jointsWarning}</p>}
          {!chosen && <p className="fv-todo">Wybierz wariant — dopiero wtedy liczba płyt trafi do kosztorysu.</p>}
          {chosen && (
            <p className="fv-note">
              Do kosztorysu: <b>{calc.result[chosen]!.sheets} płyt OSB {sheetCm.length} × {sheetCm.width} cm</b> (wariant {chosen}).{' '}
              <button className="fv-link" onClick={() => setChosen(null)}>zmień wybór</button>
            </p>
          )}

          {shown && (
            <CuttingPlan
              result={calc.result}
              variant={shown}
              chosen={chosen === shown.key}
              sheet={calc.sheet}
              stripWidth={calc.stripWidth}
              segments={calc.segments}
            />
          )}
          <details className="fv-el">
            <summary>Jak to policzono</summary>
            <pre className="fv-trace">{renderTrace(calc.result.trace)}</pre>
          </details>
        </>
      )}
    </div>
  )
}
