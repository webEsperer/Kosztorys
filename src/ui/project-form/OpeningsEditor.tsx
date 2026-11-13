// Lista typów otworów: typ, wymiary, liczba, ściana, oznaczenie.

import type { ProjectInput } from '../../model/project'
import { type Opening, type OpeningType, type OpeningWall, OPENING_DEDUCTIONS, openingDeductions } from '../../engine/openings'
import { FoldRow, NumField, fmtQty } from '../common/fields'
import { useState } from 'react'
import type { Update } from './ProjectForm'

const TYPES: OpeningType[] = ['okno', 'drzwi zewnętrzne', 'brama', 'drzwi wewnętrzne']
const WALLS: OpeningWall[] = ['zewnętrzna', 'szczyt', 'działowa']

function nextMark(openings: Opening[], type: OpeningType): string {
  const prefix = type === 'okno' ? 'O' : type === 'brama' ? 'B' : 'D'
  let n = 1
  while (openings.some((o) => o.mark === `${prefix}${n}`)) n++
  return `${prefix}${n}`
}

export function OpeningsEditor({ project, update }: { project: ProjectInput; update: Update }) {
  const openings = project.openings
  const [justAdded, setJustAdded] = useState<string | null>(null)
  const add = (type: OpeningType) => {
    const id = `op-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    setJustAdded(id)
    update((p) => {
      p.openings.push({
        id,
        mark: nextMark(p.openings, type),
        type,
        width: type === 'drzwi wewnętrzne' ? 0.9 : type === 'brama' ? 2.5 : 1.0,
        height: type === 'drzwi wewnętrzne' ? 2.07 : type === 'okno' ? 1.5 : type === 'brama' ? 2.2 : 2.1,
        count: 1,
        wall: type === 'drzwi wewnętrzne' ? 'działowa' : 'zewnętrzna',
      })
    })
  }
  const set = (id: string, fn: (o: Opening) => void) =>
    update((p) => {
      const o = p.openings.find((x) => x.id === id)
      if (o) fn(o)
    })
  const perExt = project.itemParams['ssz-nadproza-zew']?.perOpening ?? 2
  const perPart = project.itemParams['ssz-nadproza-dz']?.perOpening ?? 1
  const ded = openingDeductions(openings, project.lintels, { exterior: perExt, partition: perPart })

  return (
    <div className="openings">
      {openings.length === 0 && <p className="muted">Brak otworów. Dodaj okna i drzwi — odejmą się od murów i elewacji.</p>}
      {openings.length > 0 && (
        <p className="muted small">
          {openings.length} typów otworów, razem {openings.reduce((a, o) => a + o.count, 0)} szt. Kliknij wiersz, żeby go rozwinąć i edytować.
        </p>
      )}
      {openings.map((o) => (
        <FoldRow
          key={o.id}
          defaultOpen={o.id === justAdded}
          summary={
            <span className="fold-sum">
              <b>{o.mark}</b>
              <span>{o.type}</span>
              <span>
                {fmtQty(o.width * 100, 1)} × {fmtQty(o.height * 100, 1)} cm
              </span>
              <span>{o.count} szt</span>
              <span className="muted">{o.wall}</span>
              {o.room && <span className="muted">{o.room}</span>}
            </span>
          }
        >
        <div className="opening-row">
          <label className="nf">
            <span className="nf-label">Oznaczenie</span>
            <span className="nf-box">
              <input type="text" value={o.mark} style={{ width: 56 }} onChange={(e) => set(o.id, (x) => { x.mark = e.target.value })} />
            </span>
          </label>
          <label className="nf">
            <span className="nf-label">Typ</span>
            <span className="nf-box">
              <select value={o.type} onChange={(e) => set(o.id, (x) => { x.type = e.target.value as OpeningType })}>
                {TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </span>
          </label>
          <NumField positive allowEmpty={false} label="Szerokość" unit="cm" scale={100} width={64} value={o.width} onChange={(v) => set(o.id, (x) => { x.width = v ?? 0 })} />
          <NumField positive allowEmpty={false} label="Wysokość" unit="cm" scale={100} width={64} value={o.height} onChange={(v) => set(o.id, (x) => { x.height = v ?? 0 })} />
          <NumField nonNegative allowEmpty={false} label="Liczba" unit="szt" width={44} value={o.count} onChange={(v) => set(o.id, (x) => { x.count = Math.max(0, Math.round(v ?? 0)) })} />
          <label className="nf">
            <span className="nf-label">Ściana</span>
            <span className="nf-box">
              <select value={o.wall} onChange={(e) => set(o.id, (x) => { x.wall = e.target.value as OpeningWall })}>
                {WALLS.map((w) => (
                  <option key={w}>{w}</option>
                ))}
              </select>
            </span>
          </label>
          <label className="nf">
            <span className="nf-label">Pomieszczenie</span>
            <span className="nf-box">
              <input type="text" value={o.room ?? ''} style={{ width: 110 }} onChange={(e) => set(o.id, (x) => { x.room = e.target.value })} />
            </span>
          </label>
          <button className="btn-icon" title="Usuń otwór" onClick={() => update((p) => { p.openings = p.openings.filter((x) => x.id !== o.id) })}>
            ✕
          </button>
        </div>
        </FoldRow>
      ))}
      <div className="row-actions">
        {TYPES.map((t) => (
          <button key={t} className="btn" onClick={() => add(t)}>
            + {t}
          </button>
        ))}
      </div>
      {openings.length > 0 && (
        <details className="fold-section">
          <summary>Zestawienie otworów — co odejmujemy i od czego</summary>
          <OpeningsSummary rows={ded.rows} totals={ded.totals} />
        </details>
      )}
    </div>
  )
}

const WALL_TITLE: Record<OpeningWall, string> = {
  zewnętrzna: 'Ściany zewnętrzne (nośne)',
  szczyt: 'Ściany szczytowe',
  działowa: 'Ściany działowe',
}

/** Zestawienie: każdy otwór, pole, nadproże i od czego jest odejmowany. */
function OpeningsSummary({ rows, totals }: { rows: ReturnType<typeof openingDeductions>['rows']; totals: Record<OpeningWall, number> }) {
  return (
    <div className="openings-summary">
      {WALLS.filter((w) => rows.some((r) => r.opening.wall === w)).map((w) => {
        const rs = rows.filter((r) => r.opening.wall === w)
        return (
          <div key={w} className="os-group">
            <table className="sum-table">
              <thead>
                <tr>
                  <th>{WALL_TITLE[w]}</th>
                  <th>Pomieszczenie</th>
                  <th>Szer. × wys.</th>
                  <th>Szt</th>
                  <th>Pole</th>
                  <th>Nadproże</th>
                </tr>
              </thead>
              <tbody>
                {rs.map((r) => (
                  <tr key={r.opening.id}>
                    <th>
                      {r.opening.mark} {r.opening.type}
                    </th>
                    <td className="os-room">{r.opening.room ?? ''}</td>
                    <td>
                      {fmtQty(r.opening.width * 100, 0)} × {fmtQty(r.opening.height * 100, 0)} cm
                    </td>
                    <td>{r.opening.count}</td>
                    <td>{fmtQty(r.area)} m²</td>
                    <td>{r.lintel ? `${fmtQty(r.lintel.length * 100, 0)} cm × ${r.lintel.pieces} szt` : <span className="todo-inline">indywidualne</span>}</td>
                  </tr>
                ))}
                <tr className="os-total">
                  <th>Razem</th>
                  <td />
                  <td />
                  <td>{rs.reduce((s, r) => s + r.opening.count, 0)}</td>
                  <td>
                    <b>{fmtQty(totals[w])} m²</b>
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
            <p className="muted small">Odejmowane od: {OPENING_DEDUCTIONS[w].join('; ')}.</p>
          </div>
        )
      })}
      <p className="muted small">
        Pole otworu = szerokość × wysokość × liczba. Od muru odejmowane są też nadproża (dł. × wysokość nadproża z parametru pozycji bloczków).
        Szczegóły każdego odejmowania — w „Jak to policzono” danej pozycji.
      </p>
    </div>
  )
}
