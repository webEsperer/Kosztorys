// Panel pozycji: „Jak to policzono” (trace), cena, parametry, wybory, włącz/wyłącz, przeniesienie do etapu.

import { type ItemCutting, type ItemResult, type Stage, UNIT_LABEL, perUnitLabel } from '../../engine/items'
import { useState } from 'react'
import { CuttingPlan } from '../cutting/CuttingPlan'
import { STAGE_LABEL, STAGES } from '../../engine/estimate'
import { formatPLN } from '../../engine/money'
import { fmt } from '../../engine/trace'
import { Check, NumField, fmtQty } from '../common/fields'
import type { Update } from '../project-form/ProjectForm'
import type { ProjectInput } from '../../model/project'
import { kindForItem, type RoofElementKind } from '../roof-view/links'
import { CustomItemFields } from './CustomItemFields'

const PRICE_UNIT: Record<ItemResult['spec']['priceBasis'], (r: ItemResult) => string> = {
  perUnit: (r) => `zł/${r.chargedUnit}`,
  perPack: (r) => `zł/${r.spec.packaging?.packUnit ?? 'op.'}`,
  lumpSum: () => 'zł (kwota)',
}

/** Wybór wariantu cięcia (OSB — wybiera użytkownik; papa — domyślnie mniej rolek) i rysunek planu cięcia. */
function CuttingSection({ c, project, update }: { c: ItemCutting; project: ProjectInput; update: Update }) {
  const [preview, setPreview] = useState<'A' | 'B'>(c.used ?? c.result.cheaper ?? c.result.best.key)
  const chosen = project.choices[c.choiceKey]
  const shownKey = c.used ?? preview
  const shown = c.result[shownKey] ?? c.result.best
  const unit = c.userMustChoose ? 'płyt' : 'rolek'
  const setChoice = (v: 'A' | 'B' | null) => update((p) => { p.choices[c.choiceKey] = v })
  return (
    <div className="ip-cutting">
      <div className="ip-choice">
        <span>{c.userMustChoose ? 'Wariant cięcia OSB (wybierasz Ty):' : 'Wariant cięcia papy:'}</span>
        {!c.userMustChoose && (
          <button className={`btn${chosen === null ? ' on' : ''}`} onClick={() => setChoice(null)}>
            Automatycznie (mniej rolek)
          </button>
        )}
        {(['A', 'B'] as const).map((v) => {
          const r = c.result[v]
          return (
            <button key={v} className={`btn${chosen === v ? ' on' : ''}`} disabled={!r} title={r ? undefined : 'pas szerszy niż arkusz w tym kierunku'} onClick={() => { setChoice(v); setPreview(v) }}>
              {v} {v === 'A' ? 'wzdłuż' : 'w poprzek'}
              {r && <span className="muted"> — {r.sheets} {unit}, {r.joints} łączeń</span>}
            </button>
          )
        })}
      </div>
      {!c.userMustChoose && c.result.jointsWarning && <p className="ip-note">⚠ {c.result.jointsWarning}</p>}
      {c.used === null && (
        <p className="muted small">
          Podgląd planu:{' '}
          {(['A', 'B'] as const).filter((v) => c.result[v]).map((v) => (
            <button key={v} className={`btn btn-small${preview === v ? ' on' : ''}`} onClick={() => setPreview(v)}>
              wariant {v}
            </button>
          ))}
        </p>
      )}
      <details className="ip-plan" open>
        <summary>Plan cięcia — wariant {shown.key}{c.used === null ? ' (podgląd, jeszcze nie wybrany)' : ''}</summary>
        <CuttingPlan result={c.result} variant={shown} chosen={c.used === shown.key} sheet={c.sheet} stripWidth={c.stripWidth} segments={c.segments} sheetName={c.userMustChoose ? 'Płyta' : 'Rolka'} />
      </details>
    </div>
  )
}

export function ItemPanel({
  r,
  project,
  update,
  onClose,
  onShowRoof,
}: {
  r: ItemResult
  project: ProjectInput
  update: Update
  onClose: () => void
  onShowRoof?: (kind: RoofElementKind) => void
}) {
  const s = r.spec
  const roofKind = kindForItem(s.id)
  return (
    <aside className="item-panel" aria-label="Szczegóły pozycji">
      <div className="ip-head">
        <div>
          <div className="muted small">{s.category}</div>
          <h2>{s.name}</h2>
        </div>
        <button className="btn-icon" onClick={onClose} title="Zamknij">
          ✕
        </button>
      </div>

      {s.note && <p className="ip-note">{s.note}</p>}
      {roofKind && onShowRoof && (
        <p>
          <button className="btn" onClick={() => onShowRoof(roofKind)}>
            Pokaż na rysunku dachu
          </button>
        </p>
      )}

      {s.isCustom && (() => {
        const ci = project.customItems.find((c) => c.id === s.id)
        return ci ? <CustomItemFields item={ci} update={update} onDeleted={onClose} /> : null
      })()}

      {s.manualQty?.allowLumpSum && (
        <div className="ip-row">
          <Check
            label={`Rozliczenie kwotą za całość (zamiast stawki za ${perUnitLabel(s.unit)})`}
            checked={s.manualQty.lumpSum}
            onChange={(v) => update((p) => { p.lumpSumBilling = { ...(p.lumpSumBilling ?? {}), [s.id]: v } })}
          />
          {s.manualQty.lumpSum && <span className="muted small"> liczba {UNIT_LABEL[s.unit]} — tylko informacyjnie</span>}
        </div>
      )}
      <div className="fields">
        <NumField nonNegative
          label="Cena"
          unit={PRICE_UNIT[s.priceBasis](r)}
          required
          value={project.prices[s.id] == null ? null : project.prices[s.id]! / 100}
          onChange={(v) => update((p) => { p.prices[s.id] = v === null ? null : Math.round(v * 100) })}
        />
        {Object.entries(s.params).map(([key, prm]) => {
          const isM = prm.unit === 'm'
          return (
            <NumField
              key={key}
              label={prm.label}
              hint={prm.note}
              unit={isM ? 'cm' : prm.unit}
              scale={isM ? 100 : 1}
              required={prm.value === null}
              value={prm.raw !== undefined ? prm.raw : prm.value}
              positive={prm.min === 'positive'}
              nonNegative={prm.min === 'nonNegative'}
              error={prm.error}
              onChange={(v) =>
                update((p) => {
                  p.itemParams[s.id] = { ...(p.itemParams[s.id] ?? {}), [key]: v }
                })
              }
            />
          )
        })}
      </div>

      {s.cutting && <CuttingSection c={s.cutting} project={project} update={update} />}

      <div className="ip-row">
        <Check
          label="Pozycja włączona"
          checked={s.enabled}
          onChange={(v) =>
            update((p) => {
              const ci = p.customItems.find((c) => c.id === s.id)
              if (ci) ci.enabled = v
              else p.enabled[s.id] = v
            })
          }
        />
        <label className="nf">
          <span className="nf-label">Etap</span>
          <span className="nf-box">
            <select
              value={s.stage}
              onChange={(e) =>
                update((p) => {
                  p.stageOverride[s.id] = e.target.value as Stage
                })
              }
            >
              {STAGES.map((st) => (
                <option key={st} value={st}>
                  {STAGE_LABEL[st]}
                </option>
              ))}
            </select>
          </span>
        </label>
      </div>

      {r.missing.length > 0 && (
        <div className="ip-missing">
          <b>Do uzupełnienia:</b> {r.missing.join(', ')}
        </div>
      )}

      <h3>Jak to policzono</h3>
      <ol className="trace">
        {r.trace.map((t, i) => (
          <li key={i}>
            <div className="tr-label">{t.label}</div>
            <div className="tr-calc">
              {t.formula && <span className="tr-formula">{t.formula}</span>}
              {t.values && <span className="tr-values">= {t.values}</span>}
              <span className="tr-result">= {typeof t.result === 'number' ? `${fmt(t.result)} ${t.unit}`.trim() : t.result}</span>
            </div>
            {t.note && <div className="tr-note">{t.note}</div>}
          </li>
        ))}
      </ol>
      {r.costGrosze !== null && (
        <p className="ip-total">
          Wartość: <b>{formatPLN(r.costGrosze)}</b>
          {r.chargedQuantity !== null && (
            <span className="muted">
              {' '}
              ({fmtQty(r.chargedQuantity)} {r.chargedUnit})
            </span>
          )}
        </p>
      )}
    </aside>
  )
}
