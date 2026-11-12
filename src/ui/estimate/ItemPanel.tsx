// Panel pozycji: „Jak to policzono” (trace), cena, parametry, wybory, włącz/wyłącz, przeniesienie do etapu.

import type { ItemResult, Stage } from '../../engine/items'
import { STAGE_LABEL, STAGES } from '../../engine/estimate'
import { formatPLN } from '../../engine/money'
import { fmt } from '../../engine/trace'
import { Check, NumField, fmtQty } from '../common/fields'
import type { Update } from '../project-form/ProjectForm'
import type { ProjectInput } from '../../model/project'
import { kindForItem, type RoofElementKind } from '../roof-view/links'

const PRICE_UNIT: Record<ItemResult['spec']['priceBasis'], (r: ItemResult) => string> = {
  perUnit: (r) => `zł/${r.chargedUnit}`,
  perPack: (r) => `zł/${r.spec.packaging?.packUnit ?? 'op.'}`,
  lumpSum: () => 'zł (kwota)',
}

/** Pozycje z wyborem wariantu cięcia OSB. */
const OSB_CHOICE: Record<string, keyof ProjectInput['choices']> = {
  'sso-wf-osb': 'foundationRingBeamOsbVariant',
  'ssz-ws-osb': 'wallRingBeamOsbVariant',
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
  const choiceKey = OSB_CHOICE[s.id]
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

      <div className="fields">
        <NumField
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
              value={prm.value}
              onChange={(v) =>
                update((p) => {
                  p.itemParams[s.id] = { ...(p.itemParams[s.id] ?? {}), [key]: v }
                })
              }
            />
          )
        })}
      </div>

      {choiceKey && (
        <div className="ip-choice">
          <span>Wariant cięcia OSB (wybierasz Ty):</span>
          {(['A', 'B'] as const).map((v) => (
            <button key={v} className={`btn${project.choices[choiceKey] === v ? ' on' : ''}`} onClick={() => update((p) => { p.choices[choiceKey] = v })}>
              Wariant {v} {v === 'A' ? '(wzdłuż)' : '(w poprzek)'}
            </button>
          ))}
          <span className="muted small">Plan cięcia i porównanie — w trace poniżej oraz w zakładce „Fundament 3D → Szalunek OSB”.</span>
        </div>
      )}

      <div className="ip-row">
        <Check label="Pozycja włączona" checked={s.enabled} onChange={(v) => update((p) => { p.enabled[s.id] = v })} />
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
