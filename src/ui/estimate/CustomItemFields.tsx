// Edycja własnej pozycji (panel pozycji): nazwa, kategoria, rodzaj, jednostka, ilość lub wymiary, opakowanie.

import type { ItemKind, PackUnit, PriceBasis, Unit } from '../../engine/items'
import { UNIT_LABEL } from '../../engine/items'
import { DIM_UNITS, type CustomItem } from '../../engine/stages/custom'
import type { ProjectInput } from '../../model/project'
import { NumField, Select, TextField } from '../common/fields'
import type { Update } from '../project-form/ProjectForm'

const UNITS = Object.keys(UNIT_LABEL) as Unit[]
const PACKS: PackUnit[] = ['paczka', 'rolka', 'worek', 'wiadro', 'puszka', 'płyta', 'pręt', 'bęben', 'szt']
const KINDS: { value: ItemKind; label: string }[] = [
  { value: 'material', label: 'materiał' },
  { value: 'service', label: 'usługa' },
  { value: 'equipment', label: 'sprzęt' },
  { value: 'lumpSum', label: 'ryczałt' },
]

export function CustomItemFields({ item, update, onDeleted }: { item: CustomItem; update: Update; onDeleted: () => void }) {
  const set = (fn: (c: CustomItem) => void) =>
    update((p: ProjectInput) => {
      const c = p.customItems.find((x) => x.id === item.id)
      if (c) fn(c)
    })
  const dims = item.mode === 'dims' && DIM_UNITS.includes(item.unit)
  const lump = item.priceBasis === 'lumpSum'
  return (
    <div className="custom-fields">
      <div className="fields">
        <TextField label="Nazwa" value={item.name} onChange={(v) => set((c) => { c.name = v })} />
        <TextField label="Kategoria" value={item.category} onChange={(v) => set((c) => { c.category = v })} />
        <Select label="Rodzaj" value={item.kind} options={KINDS} onChange={(v) => set((c) => { c.kind = v; if (v === 'lumpSum') c.priceBasis = 'lumpSum'; else if (c.priceBasis === 'lumpSum') c.priceBasis = 'perUnit' })} />
        {!lump && (
          <>
            <Select label="Jednostka" value={item.unit} options={UNITS.filter((u) => u !== 'ryczałt').map((u) => ({ value: u, label: UNIT_LABEL[u] }))} onChange={(v) => set((c) => { c.unit = v; if (!DIM_UNITS.includes(v)) c.mode = 'manual' })} />
            {DIM_UNITS.includes(item.unit) && (
              <Select
                label="Ilość"
                value={item.mode}
                options={[
                  { value: 'dims', label: 'z wymiarów' },
                  { value: 'manual', label: 'wpisana ręcznie' },
                ]}
                onChange={(v) => set((c) => { c.mode = v })}
              />
            )}
            {dims ? (
              <>
                <NumField nonNegative label="Długość" unit="cm" scale={100} required value={item.length} onChange={(v) => set((c) => { c.length = v })} />
                {item.unit !== 'mb' && <NumField nonNegative label="Szerokość" unit="cm" scale={100} required value={item.width} onChange={(v) => set((c) => { c.width = v })} />}
                {item.unit === 'm3' && <NumField nonNegative label="Wysokość" unit="cm" scale={100} required value={item.height} onChange={(v) => set((c) => { c.height = v })} />}
              </>
            ) : (
              <NumField nonNegative label="Ilość" unit={UNIT_LABEL[item.unit]} required value={item.quantity} onChange={(v) => set((c) => { c.quantity = v })} />
            )}
            <NumField nonNegative label="Liczba sztuk (mnożnik)" unit="×" value={item.count} onChange={(v) => set((c) => { c.count = v ?? 1 })} />
            <NumField nonNegative label="Odpad" unit="%" value={item.wastePercent} onChange={(v) => set((c) => { c.wastePercent = v ?? 0 })} />
            <Select
              label="Opakowanie"
              value={(item.packaging?.packUnit ?? '') as PackUnit | ''}
              options={[{ value: '' as const, label: 'brak' }, ...PACKS.map((p) => ({ value: p, label: p }))]}
              onChange={(v) =>
                set((c) => {
                  c.packaging = v ? { packUnit: v as PackUnit, perPack: c.packaging?.perPack ?? null } : null
                  if (!v && c.priceBasis === 'perPack') c.priceBasis = 'perUnit'
                })
              }
            />
            {item.packaging && (
              <>
                <NumField positive label={`Zawartość opakowania (${UNIT_LABEL[item.unit]})`} required value={item.packaging.perPack} onChange={(v) => set((c) => { if (c.packaging) c.packaging.perPack = v })} />
                <Select<PriceBasis>
                  label="Cena za"
                  value={item.priceBasis === 'perPack' ? 'perPack' : 'perUnit'}
                  options={[
                    { value: 'perPack', label: `opakowanie (${item.packaging.packUnit})` },
                    { value: 'perUnit', label: `jednostkę (${UNIT_LABEL[item.unit]})` },
                  ]}
                  onChange={(v) => set((c) => { c.priceBasis = v })}
                />
              </>
            )}
          </>
        )}
        <TextField label="Uwagi" value={item.note ?? ''} onChange={(v) => set((c) => { c.note = v || undefined })} />
      </div>
      <div className="row-actions">
        <button
          className="btn danger"
          onClick={() => {
            if (!confirm(`Usunąć pozycję „${item.name}”?`)) return
            update((p) => {
              p.customItems = p.customItems.filter((x) => x.id !== item.id)
              delete p.prices[item.id]
              delete p.stageOverride[item.id]
            })
            onDeleted()
          }}
        >
          Usuń pozycję
        </button>
      </div>
    </div>
  )
}
