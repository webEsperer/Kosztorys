// Daszki dwuspadowe połączone koszowo: dodawanie/usuwanie, parametry, kontrola kolizji, wyniki z roof.ts.

import type { Dormer } from '../../engine/roof'
import type { ProjectInput } from '../../model/project'
import { roofOf } from '../../engine/stages/sszRoof'
import { NumField, fmtQty } from '../common/fields'
import type { Update } from './ProjectForm'
import { useState, type FocusEvent } from 'react'
import { DormerHelp, type DormerDimKey } from './DormerHelp'

export function DormersEditor({ project, update }: { project: ProjectInput; update: Update }) {
  const { roof, warnings } = roofOf(project)
  // wymiar podświetlany na rysunku — wg pola, w którym jest kursor
  const [active, setActive] = useState<DormerDimKey | null>(null)
  const onFocus = (e: FocusEvent<HTMLElement>) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-dim]')
    setActive((el?.dataset.dim as DormerDimKey | undefined) ?? null)
  }
  const onBlur = () => setActive(null)
  const dormers = project.roof.dormers
  const set = (id: string, fn: (d: Dormer) => void) =>
    update((p) => {
      const d = p.roof.dormers.find((x) => x.id === id)
      if (d) fn(d)
    })
  const nextId = () => {
    let n = 1
    while (dormers.some((d) => d.id === `D${n}`)) n++
    return `D${n}`
  }

  return (
    <div className="dormers">
      <h3>Daszki z koszami</h3>
      {dormers.length === 0 && <p className="muted small">Brak daszków. Daszek: dwuspadowy, prostopadły do kalenicy głównej, łączony z połacią dwoma koszami.</p>}
      {dormers.length > 0 && <DormerHelp active={active} />}
      {dormers.map((d) => {
        const r = roof?.dormers.find((x) => x.id === d.id)
        return (
          <div key={d.id} className="opening-row dormer-row" onFocusCapture={onFocus} onBlurCapture={onBlur}>
            <b className="dormer-id">{d.id}</b>
            <span className="dim-field" data-dim="b">
              <NumField positive allowEmpty={false} label="b — szer. z okapami" unit="cm" scale={100} width={64} value={d.b} onChange={(v) => set(d.id, (x) => { x.b = v ?? 0 })} />
            </span>
            <span className="dim-field" data-dim="w">
              <NumField allowEmpty={false} label="w — wysięg za okap" unit="cm" scale={100} width={64} value={d.w} onChange={(v) => set(d.id, (x) => { x.w = v ?? 0 })} />
            </span>
            <span className="dim-field" data-dim="beta">
              <NumField positive allowEmpty={false} label="β — kąt" unit="°" width={48} value={d.betaDeg} onChange={(v) => set(d.id, (x) => { x.betaDeg = v ?? 0 })} />
            </span>
            <span className="dim-field" data-dim="dh">
              <NumField allowEmpty={false} label="Δh okapu" unit="cm" scale={100} width={56} value={d.dh} onChange={(v) => set(d.id, (x) => { x.dh = v ?? 0 })} />
            </span>
            <label className="nf">
              <span className="nf-label">Strona</span>
              <span className="nf-box">
                <select value={d.side} onChange={(e) => set(d.id, (x) => { x.side = e.target.value as Dormer['side'] })}>
                  <option value="przód">przód</option>
                  <option value="tył">tył</option>
                </select>
              </span>
            </label>
            <span className="dim-field" data-dim="position">
              <NumField allowEmpty={false} label="Położenie od początku okapu" unit="cm" scale={100} width={64} value={d.position} onChange={(v) => set(d.id, (x) => { x.position = v ?? 0 })} />
            </span>
            <label className="nf">
              <span className="nf-label">Szczyt daszku</span>
              <span className="nf-box">
                <select value={d.gableFinish} onChange={(e) => set(d.id, (x) => { x.gableFinish = e.target.value as Dormer['gableFinish'] })}>
                  <option value="EPS">EPS jak ściany</option>
                  <option value="boazeria">wełna + boazeria</option>
                </select>
              </span>
            </label>
            <span className="dim-field" data-dim="wallWidth">
              <NumField positive label="Szer. ściany szczytu" unit="cm" scale={100} width={64} value={d.wallWidth ?? null} onChange={(v) => set(d.id, (x) => { x.wallWidth = v ?? undefined })} />
            </span>
            <button className="btn-icon" title="Usuń daszek" onClick={() => update((p) => { p.roof.dormers = p.roof.dormers.filter((x) => x.id !== d.id) })}>
              ✕
            </button>
            {r && (
              <p className="calc dormer-calc">
                d = {fmtQty(r.d)} m, x0 = {fmtQty(r.x0)} m, T = {fmtQty(r.T)} m², daszek = <b>{fmtQty(r.area)} m²</b>, kosz = <b>{fmtQty(r.valley)} m</b> × 2, kalenica {fmtQty(r.ridge)} m
              </p>
            )}
          </div>
        )
      })}
      {warnings.length > 0 && (
        <ul className="warn-list">
          {warnings.map((w) => (
            <li key={w}>⚠ {w}</li>
          ))}
        </ul>
      )}
      <div className="row-actions">
        <button
          className="btn"
          onClick={() =>
            update((p) => {
              p.roof.dormers.push({ id: nextId(), b: 4, w: 2, betaDeg: p.roof.pitchDeg ?? 35, dh: 0, side: 'przód', position: 1, gableFinish: 'EPS' })
            })
          }
        >
          + daszek
        </button>
      </div>
    </div>
  )
}
