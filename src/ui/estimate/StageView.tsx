// Zakładka etapu: pozycje pogrupowane w kategorie, cena w wierszu, panel „Jak to policzono”.

import { useEffect, useRef } from 'react'
import type { Estimate } from '../../engine/estimate'
import { STAGE_LABEL } from '../../engine/estimate'
import { type ItemResult, type Stage, UNIT_LABEL } from '../../engine/items'
import { formatPLN } from '../../engine/money'
import type { ProjectInput } from '../../model/project'
import { NumField, fmtQty } from '../common/fields'
import type { Update } from '../project-form/ProjectForm'
import { ItemPanel } from './ItemPanel'
import type { RoofElementKind } from '../roof-view/links'

function qtyText(r: ItemResult): string {
  const s = r.spec
  if (s.priceBasis === 'lumpSum') return 'kwota'
  if (s.quantity === null) return '—'
  const q = !s.packaging && r.chargedQuantity !== null ? r.chargedQuantity : (r.quantityWithWaste ?? s.quantity.value)
  return `${fmtQty(q)} ${UNIT_LABEL[s.unit]}`
}

function packText(r: ItemResult): string {
  if (!r.spec.packaging) return ''
  if (r.packs === null) return `? ${r.spec.packaging.packUnit}`
  return `${r.packs} × ${r.spec.packaging.packLabel}`
}

export function StageView({
  stage,
  estimate,
  project,
  update,
  selected,
  onSelect,
  onShowRoof,
}: {
  stage: Stage
  estimate: Estimate
  project: ProjectInput
  update: Update
  selected: string | null
  onSelect: (id: string | null) => void
  onShowRoof?: (kind: RoofElementKind) => void
}) {
  const rows = estimate.items.filter((r) => r.spec.stage === stage)
  const summary = estimate.stages.find((s) => s.stage === stage)!
  const cats: string[] = []
  for (const r of rows) if (!cats.includes(r.spec.category)) cats.push(r.spec.category)
  const sel = rows.find((r) => r.spec.id === selected) ?? null
  const panelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (sel && window.matchMedia('(max-width: 1100px)').matches) panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [sel])

  return (
    <div className={`stage${sel ? ' with-panel' : ''}`}>
      <div className="stage-list">
        <div className="stage-head">
          <h2>{STAGE_LABEL[stage]}</h2>
          <div className="stage-total">
            {formatPLN(summary.totalGrosze)}
            {!summary.complete && <span className="badge warn">{summary.missingCount} do uzupełnienia</span>}
          </div>
        </div>
        {cats.map((c) => {
          const items = rows.filter((r) => r.spec.category === c)
          const sum = items.reduce((a, r) => a + (r.spec.enabled ? (r.costGrosze ?? 0) : 0), 0)
          return (
            <section key={c} className="cat">
              <h3>
                <span>{c}</span>
                <span>{formatPLN(sum)}</span>
              </h3>
              <div className="rows">
                {items.map((r) => {
                  const s = r.spec
                  const missing = s.enabled && (r.missing.length > 0 || r.costGrosze === null)
                  return (
                    <div
                      key={s.id}
                      className={`row${selected === s.id ? ' sel' : ''}${s.enabled ? '' : ' off'}`}
                      onClick={() => onSelect(selected === s.id ? null : s.id)}
                    >
                      <div className="r-name">
                        {s.name}
                        {missing && <span className="dot" title={r.missing.join(', ')} />}
                      </div>
                      <div className="r-qty">{qtyText(r)}</div>
                      <div className="r-pack muted">{packText(r)}</div>
                      <div className="r-price" onClick={(e) => e.stopPropagation()}>
                        <NumField
                          label=""
                          unit={s.priceBasis === 'lumpSum' ? 'zł' : s.priceBasis === 'perPack' ? `zł/${s.packaging?.packUnit}` : `zł/${r.chargedUnit}`}
                          width={78}
                          value={project.prices[s.id] == null ? null : project.prices[s.id]! / 100}
                          placeholder="cena"
                          onChange={(v) => update((p) => { p.prices[s.id] = v === null ? null : Math.round(v * 100) })}
                        />
                      </div>
                      <div className="r-cost">{s.enabled ? (r.costGrosze === null ? '—' : formatPLN(r.costGrosze)) : 'wyłączona'}</div>
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
      {sel && (
        <div ref={panelRef} className="stage-panel">
          <ItemPanel r={sel} project={project} update={update} onClose={() => onSelect(null)} onShowRoof={onShowRoof} />
        </div>
      )}
    </div>
  )
}
