// Zakładka etapu: pozycje pogrupowane w kategorie, cena w wierszu, panel „Jak to policzono”.

import { useEffect, useRef } from 'react'
import type { Estimate } from '../../engine/estimate'
import { STAGE_LABEL } from '../../engine/estimate'
import { type ItemResult, type Stage, UNIT_LABEL, perUnitLabel } from '../../engine/items'
import { formatPLN } from '../../engine/money'
import type { ProjectInput } from '../../model/project'
import { NumField, fmtQty } from '../common/fields'
import type { Update } from '../project-form/ProjectForm'
import { ItemPanel } from './ItemPanel'
import { newCustomItem } from '../../engine/stages/custom'
import type { RoofElementKind } from '../roof-view/links'

function qtyText(r: ItemResult): string {
  const s = r.spec
  if (s.priceBasis === 'lumpSum') return s.quantity ? `${fmtQty(s.quantity.value)} ${UNIT_LABEL[s.unit]} (kwota)` : 'kwota'
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
                      {s.manualQty ? (
                        <div className="r-qty r-qty-input" onClick={(e) => e.stopPropagation()}>
                          <NumField
                            nonNegative
                            label=""
                            unit={UNIT_LABEL[s.unit]}
                            width={52}
                            placeholder={s.manualQty.lumpSum ? 'opcj.' : 'ile?'}
                            required={!s.manualQty.lumpSum}
                            value={s.params[s.manualQty.key]?.raw !== undefined ? s.params[s.manualQty.key].raw! : (s.params[s.manualQty.key]?.value ?? null)}
                            onChange={(v) => update((p) => { p.itemParams[s.id] = { ...(p.itemParams[s.id] ?? {}), [s.manualQty!.key]: v } })}
                          />
                        </div>
                      ) : s.timber?.m3 ? (
                        <div className="r-qty r-qty-input" onClick={(e) => e.stopPropagation()} title="m³ wpisane ręcznie; puste = z wymiarów">
                          <NumField
                            nonNegative
                            label=""
                            unit="m³"
                            width={60}
                            placeholder={s.timber.fromDims !== null ? fmtQty(s.timber.fromDims, 3) : 'ile?'}
                            value={s.timber.manual}
                            onChange={(v) => update((p) => { p.itemParams[s.id] = { ...(p.itemParams[s.id] ?? {}), m3: v } })}
                          />
                        </div>
                      ) : (
                        <div className="r-qty">{qtyText(r)}</div>
                      )}
                      <div className="r-pack muted">{packText(r)}</div>
                      <div className="r-price" onClick={(e) => e.stopPropagation()}>
                        {s.timber && (
                          <select
                            className="billing"
                            title="Drewno: rozliczenie za sztukę / mb albo za m³"
                            value={s.timber.m3 ? 'm3' : 'unit'}
                            onChange={(e) => update((p) => { p.timberBilling = { ...(p.timberBilling ?? {}), [s.id]: e.target.value === 'm3' } })}
                          >
                            <option value="unit">za {perUnitLabel(s.timber.baseUnit)}</option>
                            <option value="m3">za m³</option>
                          </select>
                        )}
                        {s.manualQty?.allowLumpSum && (
                          <select
                            className="billing"
                            title="Sposób rozliczenia"
                            value={s.manualQty.lumpSum ? 'lump' : 'unit'}
                            onChange={(e) => update((p) => { p.lumpSumBilling = { ...(p.lumpSumBilling ?? {}), [s.id]: e.target.value === 'lump' } })}
                          >
                            <option value="unit">za {perUnitLabel(s.unit)}</option>
                            <option value="lump">za całość</option>
                          </select>
                        )}
                        <NumField nonNegative
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
        <div className="row-actions">
          <button
            className="btn"
            onClick={() => {
              const id = `wl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
              update((p) => {
                p.customItems.push(newCustomItem(stage, id))
              })
              onSelect(id)
            }}
          >
            + Własna pozycja
          </button>
        </div>
      </div>
      {sel && (
        <div ref={panelRef} className="stage-panel">
          <ItemPanel r={sel} project={project} update={update} onClose={() => onSelect(null)} onShowRoof={onShowRoof} />
        </div>
      )}
    </div>
  )
}
