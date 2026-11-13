// Zakładka etapu: pozycje pogrupowane w kategorie, cena w wierszu, panel „Jak to policzono”.

import { useEffect, useRef } from 'react'
import type { Estimate } from '../../engine/estimate'
import { STAGE_LABEL, isSectionExcluded, sectionKey } from '../../engine/estimate'
import { type ItemResult, type Stage, UNIT_LABEL, perUnitLabel, priceKey } from '../../engine/items'
import { formatPLN } from '../../engine/money'
import type { ProjectInput } from '../../model/project'
import { NumField, fmtQty, useFoldState } from '../common/fields'
import type { ReactNode } from 'react'

/** Przełącznik „liczona / nie liczona” sekcji (wg użytkownika: zobaczyć kwotę bez danego zakresu prac). */
function SectionSwitch({ on, disabled, title, onClick }: { on: boolean; disabled?: boolean; title?: string; onClick: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled} className={`sec-switch${on ? ' on' : ''}`} title={title ?? (on ? 'Wyłącz z liczenia' : 'Włącz do liczenia')} onClick={onClick}>
      <span className="sec-switch-track" aria-hidden="true">
        <span className="sec-switch-thumb" />
      </span>
      <span className="sec-switch-label">{on ? 'liczona' : 'nie liczona'}</span>
    </button>
  )
}

/** Kategoria pozycji — zwijana kliknięciem w nagłówek (suma widoczna także po zwinięciu). */
function Category({
  foldKey,
  title,
  sum,
  count,
  excluded,
  stageExcluded,
  onToggleExcluded,
  children,
}: {
  foldKey: string
  title: string
  sum: string
  count: number
  excluded: boolean
  stageExcluded: boolean
  onToggleExcluded: () => void
  children: ReactNode
}) {
  const [open, toggle] = useFoldState(foldKey)
  return (
    <section className={`cat${open ? '' : ' folded'}${excluded ? ' cat-excluded' : ''}`}>
      <h3>
        <button type="button" className="fold-head" aria-expanded={open} onClick={toggle}>
          <span className="chev" aria-hidden="true" />
          <span className="fold-title">
            {title}
            {!open && <span className="muted small"> · {count} poz.</span>}
          </span>
          <span className="fold-aside" title={excluded ? 'Sekcja nie wchodzi do sumy — tyle by kosztowała' : undefined}>
            {excluded ? <s>{sum}</s> : sum}
          </span>
        </button>
        <SectionSwitch on={!excluded} disabled={stageExcluded} title={stageExcluded ? 'Cały etap jest wyłączony z liczenia' : undefined} onClick={onToggleExcluded} />
      </h3>
      {open && children}
    </section>
  )
}
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
  const stageExcluded = !!project.excludedSections?.[sectionKey(stage, '*')]
  const toggleSection = (category: string) =>
    update((p) => {
      const key = sectionKey(stage, category)
      const ex = { ...(p.excludedSections ?? {}) }
      if (ex[key]) delete ex[key]
      else ex[key] = true
      p.excludedSections = ex
    })
  // Szczegóły pozycji w okienku (pop-up) — strona pod spodem nie przewija się i nie skacze (wg użytkownika).
  const open = sel !== null
  const dialogRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const body = document.body
    const prevOverflow = body.style.overflow
    const prevPad = body.style.paddingRight
    const sbw = window.innerWidth - document.documentElement.clientWidth
    body.style.overflow = 'hidden'
    if (sbw > 0) body.style.paddingRight = `${sbw}px`
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onSelect(null) }
    window.addEventListener('keydown', onKey)
    dialogRef.current?.focus({ preventScroll: true })
    return () => {
      body.style.overflow = prevOverflow
      body.style.paddingRight = prevPad
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onSelect])

  return (
    <div className="stage">
      <div className="stage-list">
        <div className="stage-head">
          <h2>{STAGE_LABEL[stage]}</h2>
          <SectionSwitch on={!stageExcluded} title={stageExcluded ? 'Włącz cały etap do liczenia' : 'Wyłącz cały etap z liczenia'} onClick={() => toggleSection('*')} />
          <div className="stage-total">
            {formatPLN(summary.totalGrosze)}
            {!summary.complete && <span className="badge warn">{summary.missingCount} do uzupełnienia</span>}
            {summary.excludedGrosze > 0 && (
              <span className="muted small excluded-note">sekcje nie liczone: {formatPLN(summary.excludedGrosze)}</span>
            )}
          </div>
        </div>
        {cats.map((c) => {
          const items = rows.filter((r) => r.spec.category === c)
          const sum = items.reduce((a, r) => a + (r.spec.enabled ? (r.costGrosze ?? 0) : 0), 0)
          const excluded = isSectionExcluded(project, stage, c)
          return (
            <Category
              key={c}
              foldKey={`etap:${stage}:${c}`}
              title={c}
              sum={formatPLN(sum)}
              count={items.length}
              excluded={excluded}
              stageExcluded={stageExcluded}
              onToggleExcluded={() => toggleSection(c)}
            >
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
                            <option value="unit">zł/{perUnitLabel(s.timber.baseUnit)}</option>
                            <option value="m3">zł/m³</option>
                          </select>
                        )}
                        {s.bulk && (
                          <select
                            className="billing"
                            title="Piasek: zamówienie w m³ albo w tonach"
                            value={s.bulk.tonnes ? 't' : 'm3'}
                            onChange={(e) => update((p) => { p.tonnesBilling = { ...(p.tonnesBilling ?? {}), [s.id]: e.target.value === 't' } })}
                          >
                            <option value="m3">za m³</option>
                            <option value="t">za tonę</option>
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
                          unit={s.priceBasis === 'lumpSum' ? 'zł' : s.priceBasis === 'perPack' ? `zł/${s.packaging?.packUnit}` : `zł${s.netPrice ? ' netto' : ''}/${r.chargedUnit}`}
                          width={78}
                          value={project.prices[priceKey(s)] == null ? null : project.prices[priceKey(s)]! / 100}
                          placeholder="cena"
                          onChange={(v) => update((p) => { p.prices[priceKey(s)] = v === null ? null : Math.round(v * 100) })}
                        />
                      </div>
                      <div className="r-cost">
                        {!s.enabled ? 'wyłączona' : r.costGrosze === null ? '—' : r.excluded ? <s title="Sekcja nie liczona">{formatPLN(r.costGrosze)}</s> : formatPLN(r.costGrosze)}
                      </div>
                    </div>
                  )
                })}
              </div>
            </Category>
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
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onSelect(null) }}>
          <div ref={dialogRef} className="modal" role="dialog" aria-modal="true" aria-label={sel.spec.name} tabIndex={-1}>
            <ItemPanel r={sel} project={project} update={update} onClose={() => onSelect(null)} onShowRoof={onShowRoof} />
          </div>
        </div>
      )}
    </div>
  )
}
