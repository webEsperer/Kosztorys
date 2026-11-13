// Eksport: CSV kosztorysu, zestawienie otworów (CSV + druk), wydruk kosztorysu (PDF przez okno drukowania).

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { STAGE_LABEL, STAGES, type Estimate } from '../../engine/estimate'
import { estimateCsv, OPENING_COLUMNS, openingSchedule, openingsCsv } from '../../engine/exportData'
import { formatPLN } from '../../engine/money'
import type { ProjectInput } from '../../model/project'
import { Card, Check, fmtQty } from '../common/fields'
import { itemQtyText } from '../common/itemText'

function download(name: string, text: string, type = 'text/csv;charset=utf-8') {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '_')

type PrintKind = 'kosztorys' | 'otwory' | null

export function ExportView({ estimate, project }: { estimate: Estimate; project: ProjectInput }) {
  const [interior, setInterior] = useState(false)
  const [withTrace, setWithTrace] = useState(false)
  const [printing, setPrinting] = useState<PrintKind>(null)

  useEffect(() => {
    if (!printing) return
    const done = () => setPrinting(null)
    window.addEventListener('afterprint', done)
    const t = setTimeout(() => window.print(), 50)
    return () => {
      clearTimeout(t)
      window.removeEventListener('afterprint', done)
    }
  }, [printing])

  const date = new Date().toLocaleDateString('pl-PL')
  const rows = openingSchedule(project, interior)

  return (
    <div className="form-grid">
      <Card title="Kosztorys" foldKey="eksport:Kosztorys">
        <p className="muted small">CSV otwiera się w Excelu (separator „;”, przecinek dziesiętny). Wydruk: w oknie drukowania wybierz „Zapisz jako PDF”.</p>
        <div className="row-actions">
          <button className="btn" onClick={() => download(`${safe(project.name)} — kosztorys.csv`, estimateCsv(estimate, project))}>
            Pobierz CSV
          </button>
          <button className="btn" onClick={() => setPrinting('kosztorys')}>
            Drukuj / PDF
          </button>
        </div>
        <Check label="Dołącz „Jak to policzono” do wydruku" checked={withTrace} onChange={setWithTrace} />
      </Card>

      <Card title="Zestawienie otworów dla producenta" foldKey="eksport:Zestawienie otworów dla producenta">
        <p className="muted small">Wymiary otworów w murze. Kolumny „Typ otwierania”, „Kolor”, „Uwagi” — do uzupełnienia u producenta.</p>
        <Check label="Dołącz drzwi wewnętrzne" checked={interior} onChange={setInterior} />
        <div className="row-actions">
          <button className="btn" disabled={!rows.length} onClick={() => download(`${safe(project.name)} — otwory.csv`, openingsCsv(project, interior))}>
            Pobierz CSV
          </button>
          <button className="btn" disabled={!rows.length} onClick={() => setPrinting('otwory')}>
            Drukuj / PDF
          </button>
        </div>
        {!rows.length && <p className="todo-inline small">Brak otworów — dodaj je w „Dane projektu → Otwory”.</p>}
      </Card>

      <Card title="Projekt (kopia zapasowa)" foldKey="eksport:Projekt (kopia zapasowa)">
        <p className="muted small">Pełne dane projektu do przeniesienia na inne urządzenie — przycisk „Eksport JSON” na górze.</p>
      </Card>

      {printing &&
        createPortal(
          <div className="print-area">
            {printing === 'kosztorys' ? (
              <PrintEstimate estimate={estimate} project={project} date={date} withTrace={withTrace} />
            ) : (
              <>
                <h1>Zestawienie otworów — {project.name}</h1>
                <p>Data: {date}. Wymiary otworów w murze (w świetle); wymiar stolarki ustala producent z luzem montażowym.</p>
                <table>
                  <thead>
                    <tr>
                      {OPENING_COLUMNS.map((c) => (
                        <th key={c}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.lp}>
                        <td>{r.lp}</td>
                        <td>{r.mark}</td>
                        <td>{r.type}</td>
                        <td>{fmtQty(r.widthCm, 1)}</td>
                        <td>{fmtQty(r.heightCm, 1)}</td>
                        <td>{r.count}</td>
                        <td>{r.room}</td>
                        <td />
                        <td />
                        <td />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>,
          document.body,
        )}
    </div>
  )
}

function PrintEstimate({ estimate, project, date, withTrace }: { estimate: Estimate; project: ProjectInput; date: string; withTrace: boolean }) {
  return (
    <>
      <h1>Kosztorys — {project.name}</h1>
      <p>
        Data: {date}. Ceny brutto. Budynek {fmtQty(project.footprint.length)} × {fmtQty(project.footprint.width)} m (wymiary wewnętrzne).
      </p>
      <table>
        <tbody>
          {estimate.stages.map((s) => (
            <tr key={s.stage}>
              <th>{STAGE_LABEL[s.stage]}</th>
              <td className="num">{formatPLN(s.totalGrosze)}</td>
              <td>{s.complete ? '' : `${s.missingCount} do uzupełnienia`}</td>
            </tr>
          ))}
          <tr>
            <th>Rezerwa {fmtQty(estimate.reservePercent)}%</th>
            <td className="num">{formatPLN(estimate.reserveGrosze)}</td>
            <td />
          </tr>
          <tr className="grand">
            <th>Razem</th>
            <td className="num">{formatPLN(estimate.totalGrosze)}</td>
            <td>{estimate.perM2Grosze !== null && `${formatPLN(estimate.perM2Grosze)}/m²`}</td>
          </tr>
        </tbody>
      </table>
      {STAGES.map((st) => {
        const items = estimate.items.filter((r) => r.spec.stage === st && r.spec.enabled && !r.excluded)
        return (
          <section key={st} className="print-stage">
            <h2>{STAGE_LABEL[st]}</h2>
            <table>
              <thead>
                <tr>
                  <th>Pozycja</th>
                  <th>Ilość</th>
                  <th>Opakowania</th>
                  <th>Cena</th>
                  <th>Wartość</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.spec.id}>
                    <td>
                      <div className="pc">{r.spec.category}</div>
                      {r.spec.name}
                      {r.missing.length > 0 && <div className="pm">uzupełnij: {r.missing.join(', ')}</div>}
                      {withTrace && r.spec.quantity && (
                        <ol className="pt">
                          {r.trace.map((t, i) => (
                            <li key={i}>
                              {t.label}: {t.formula} {t.values && `= ${t.values}`} = {typeof t.result === 'number' ? `${fmtQty(t.result, 3)} ${t.unit}` : t.result}
                            </li>
                          ))}
                        </ol>
                      )}
                    </td>
                    <td className="num">{itemQtyText(r).replace(/ \(.*\)$/, '')}</td>
                    <td>{r.spec.packaging && r.packs !== null ? `${r.packs} × ${r.spec.packaging.packLabel}` : ''}</td>
                    <td className="num">{r.unitPriceGrosze === null ? '—' : formatPLN(r.unitPriceGrosze)}</td>
                    <td className="num">{r.costGrosze === null ? '—' : formatPLN(r.costGrosze)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )
      })}
    </>
  )
}
