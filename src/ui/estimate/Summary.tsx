// Podsumowanie całości i lista „do uzupełnienia”.

import { KIND_LABEL, STAGE_LABEL, type Estimate } from '../../engine/estimate'
import type { ItemKind, Stage } from '../../engine/items'
import { formatPLN, netFromGross } from '../../engine/money'
import { Card, fmtQty } from '../common/fields'

export function Summary({ estimate, onOpen, vatPercent }: { estimate: Estimate; onOpen: (stage: Stage) => void; vatPercent: number | null }) {
  return (
    <div className="summary">
      <Card title="Podsumowanie budowy" foldKey="podsum:budowa">
        <table className="sum-table">
          <thead>
            <tr>
              <th>Etap</th>
              <th>Suma</th>
              <th>Udział</th>
              <th>Braki</th>
            </tr>
          </thead>
          <tbody>
            {estimate.stages.map((s) => (
              <tr key={s.stage} onClick={() => onOpen(s.stage)} className="clickable">
                <th>{STAGE_LABEL[s.stage]}</th>
                <td>
                  {formatPLN(s.totalGrosze)}
                  {s.excludedGrosze > 0 && (
                    <div className="muted small" title="Sekcje wyłączone z liczenia — tyle by kosztowały">
                      nie liczone: <s>{formatPLN(s.excludedGrosze)}</s>
                    </div>
                  )}
                </td>
                <td>{fmtQty(estimate.shares[s.stage], 1)}%</td>
                <td>{s.missingCount ? <span className="badge warn">{s.missingCount}</span> : <span className="badge ok">komplet</span>}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th>Suma etapów</th>
              <td>{formatPLN(estimate.subtotalGrosze)}</td>
              <td colSpan={2} />
            </tr>
            <tr>
              <th>Rezerwa {fmtQty(estimate.reservePercent)}%</th>
              <td>{formatPLN(estimate.reserveGrosze)}</td>
              <td colSpan={2} />
            </tr>
            <tr className="grand">
              <th>Razem</th>
              <td>{formatPLN(estimate.totalGrosze)}</td>
              <td colSpan={2}>
                {estimate.perM2Grosze !== null && (
                  <span className="muted">
                    {formatPLN(estimate.perM2Grosze)}/m² ({fmtQty(estimate.area)} m² wewn.)
                  </span>
                )}
              </td>
            </tr>
            {vatPercent !== null && (
              <tr>
                <th>Netto (VAT {vatPercent}%) — podgląd</th>
                <td>{formatPLN(netFromGross(estimate.totalGrosze, vatPercent))}</td>
                <td colSpan={2} className="muted small">
                  VAT: {formatPLN(estimate.totalGrosze - netFromGross(estimate.totalGrosze, vatPercent))}
                </td>
              </tr>
            )}
          </tfoot>
        </table>
        {(() => {
          const ex = estimate.stages.reduce((a, s) => a + s.excludedGrosze, 0)
          if (ex <= 0) return null
          const full = estimate.subtotalGrosze + ex
          const fullTotal = full + Math.round((full * estimate.reservePercent) / 100)
          return (
            <p className="muted small">
              Sekcje wyłączone z liczenia kosztowałyby {formatPLN(ex)} (z rezerwą {formatPLN(fullTotal - estimate.totalGrosze)}) — razem z nimi budowa: {formatPLN(fullTotal)}.
            </p>
          )
        })()}
        {!estimate.complete && <p className="warn-text">Kosztorys niepełny — {estimate.todo.length} pozycji bez ceny lub danych (poniżej).</p>}
      </Card>

      <Card title="Podział na rodzaje" foldKey="podsum:rodzaje">
        <table className="sum-table">
          <thead>
            <tr>
              <th>Etap</th>
              {(Object.keys(KIND_LABEL) as ItemKind[]).map((k) => (
                <th key={k}>{KIND_LABEL[k]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {estimate.stages.map((s) => (
              <tr key={s.stage}>
                <th>{s.stage}</th>
                {(Object.keys(KIND_LABEL) as ItemKind[]).map((k) => (
                  <td key={k}>{formatPLN(s.byKind[k])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

export function TodoList({ estimate, onOpenItem }: { estimate: Estimate; onOpenItem: (stage: Stage, id: string) => void }) {
  if (estimate.todo.length === 0) return <p className="card">Wszystko uzupełnione.</p>
  const stages = [...new Set(estimate.todo.map((t) => t.stage))]
  return (
    <div className="todo">
      {stages.map((st) => (
        <Card key={st} title={<>{STAGE_LABEL[st]} <span className="badge warn">{estimate.todo.filter((t) => t.stage === st).length}</span></>} foldKey={`braki:${st}`}>
          <ul>
            {estimate.todo
              .filter((t) => t.stage === st)
              .map((t) => (
                <li key={t.itemId}>
                  <button className="link" onClick={() => onOpenItem(t.stage, t.itemId)}>
                    {t.name}
                  </button>
                  <span className="muted small"> — {t.missing.join(', ')}</span>
                </li>
              ))}
          </ul>
        </Card>
      ))}
    </div>
  )
}
