// Lista typów otworów: typ, wymiary, liczba, ściana, oznaczenie.

import type { Opening, OpeningType, OpeningWall } from '../../engine/openings'
import { NumField, fmtQty } from '../common/fields'
import type { Update } from './ProjectForm'

const TYPES: OpeningType[] = ['okno', 'drzwi zewnętrzne', 'brama', 'drzwi wewnętrzne']
const WALLS: OpeningWall[] = ['zewnętrzna', 'szczyt', 'działowa']

function nextMark(openings: Opening[], type: OpeningType): string {
  const prefix = type === 'okno' ? 'O' : type === 'brama' ? 'B' : 'D'
  let n = 1
  while (openings.some((o) => o.mark === `${prefix}${n}`)) n++
  return `${prefix}${n}`
}

export function OpeningsEditor({ openings, update }: { openings: Opening[]; update: Update }) {
  const add = (type: OpeningType) =>
    update((p) => {
      p.openings.push({
        id: `op-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        mark: nextMark(p.openings, type),
        type,
        width: type === 'drzwi wewnętrzne' ? 0.9 : type === 'brama' ? 2.5 : 1.0,
        height: type === 'drzwi wewnętrzne' ? 2.07 : type === 'okno' ? 1.5 : type === 'brama' ? 2.2 : 2.1,
        count: 1,
        wall: type === 'drzwi wewnętrzne' ? 'działowa' : 'zewnętrzna',
      })
    })
  const set = (id: string, fn: (o: Opening) => void) =>
    update((p) => {
      const o = p.openings.find((x) => x.id === id)
      if (o) fn(o)
    })
  const total = openings.filter((o) => o.wall === 'zewnętrzna').reduce((a, o) => a + o.width * o.height * o.count, 0)

  return (
    <div className="openings">
      {openings.length === 0 && <p className="muted">Brak otworów. Dodaj okna i drzwi — odejmą się od murów i elewacji.</p>}
      {openings.map((o) => (
        <div key={o.id} className="opening-row">
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
          <NumField label="Szerokość" unit="cm" scale={100} width={64} value={o.width} onChange={(v) => set(o.id, (x) => { x.width = v ?? 0 })} />
          <NumField label="Wysokość" unit="cm" scale={100} width={64} value={o.height} onChange={(v) => set(o.id, (x) => { x.height = v ?? 0 })} />
          <NumField label="Liczba" unit="szt" width={44} value={o.count} onChange={(v) => set(o.id, (x) => { x.count = Math.max(0, Math.round(v ?? 0)) })} />
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
      ))}
      <div className="row-actions">
        {TYPES.map((t) => (
          <button key={t} className="btn" onClick={() => add(t)}>
            + {t}
          </button>
        ))}
      </div>
      <p className="calc">Otwory w ścianach zewnętrznych: {fmtQty(total)} m²</p>
    </div>
  )
}
