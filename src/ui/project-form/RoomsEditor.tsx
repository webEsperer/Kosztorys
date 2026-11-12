// Pomieszczenia (prostokąty) — sufit, obwody i taśmy liczone per pomieszczenie.

import type { ProjectInput } from '../../model/project'
import { NumField, fmtQty } from '../common/fields'
import type { Update } from './ProjectForm'

export function RoomsEditor({ project, update }: { project: ProjectInput; update: Update }) {
  const rooms = project.rooms
  const area = rooms.reduce((a, r) => a + r.length * r.width, 0)
  const aWew = project.footprint.length * project.footprint.width
  const set = (id: string, fn: (r: ProjectInput['rooms'][number]) => void) =>
    update((p) => {
      const r = p.rooms.find((x) => x.id === id)
      if (r) fn(r)
    })
  return (
    <div className="openings">
      {rooms.length === 0 && (
        <p className="muted">
          Brak pomieszczeń — sufit liczony dla całego parteru (przybliżenie). Dodaj pomieszczenia albo prześlij rzut PDF w czacie, a wymiary zostaną wpisane.
        </p>
      )}
      {rooms.map((r) => (
        <div key={r.id} className="opening-row">
          <label className="nf">
            <span className="nf-label">Nazwa</span>
            <span className="nf-box">
              <input type="text" value={r.name} style={{ width: 150 }} onChange={(e) => set(r.id, (x) => { x.name = e.target.value })} />
            </span>
          </label>
          <NumField label="Długość" unit="cm" scale={100} width={70} value={r.length} onChange={(v) => set(r.id, (x) => { x.length = v ?? 0 })} />
          <NumField label="Szerokość" unit="cm" scale={100} width={70} value={r.width} onChange={(v) => set(r.id, (x) => { x.width = v ?? 0 })} />
          <span className="muted small">{fmtQty(r.length * r.width)} m²</span>
          <button className="btn-icon" title="Usuń pomieszczenie" onClick={() => update((p) => { p.rooms = p.rooms.filter((x) => x.id !== r.id) })}>
            ✕
          </button>
        </div>
      ))}
      <div className="row-actions">
        <button
          className="btn"
          onClick={() =>
            update((p) => {
              p.rooms.push({ id: `r-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: `Pomieszczenie ${p.rooms.length + 1}`, length: 3, width: 3 })
            })
          }
        >
          + pomieszczenie
        </button>
      </div>
      {rooms.length > 0 && (
        <p className="calc">
          Suma pomieszczeń: <b>{fmtQty(area)} m²</b> (wnętrze budynku {fmtQty(aWew)} m²; różnica {fmtQty(aWew - area)} m² — ściany działowe)
        </p>
      )}
    </div>
  )
}
