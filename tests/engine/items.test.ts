import { describe, expect, it } from 'vitest'
import { computeItem, sumItems, type ItemSpec } from '../../src/engine/items'

function spec(over: Partial<ItemSpec>): ItemSpec {
  return {
    id: 'x',
    stage: 'SSO',
    category: 'Test',
    kind: 'material',
    name: 'Pozycja',
    unit: 'm2',
    quantity: { value: 10, unit: 'm²', trace: [{ label: 'q', formula: '', values: '', result: 10, unit: 'm²' }] },
    wastePercent: 0,
    priceBasis: 'perUnit',
    params: {},
    missing: [],
    isCustom: false,
    enabled: true,
    ...over,
  }
}

describe('items — computeItem', () => {
  it('za jednostkę z odpadem: 10 m² × 1,1 × 12,50 zł = 137,50 zł', () => {
    const r = computeItem(spec({ wastePercent: 10 }), 1250)
    expect(r.quantityWithWaste).toBe(11)
    expect(r.costGrosze).toBe(13750)
    expect(r.missing).toEqual([])
  })

  it('za opakowanie: ⌈11 / 3⌉ = 4 paczki × 80 zł', () => {
    const r = computeItem(spec({ wastePercent: 10, priceBasis: 'perPack', packaging: { packUnit: 'paczka', perPack: 3, packLabel: 'paczka = 3 m²' } }), 8000)
    expect(r.packs).toBe(4)
    expect(r.chargedUnit).toBe('paczka')
    expect(r.costGrosze).toBe(32000)
  })

  it('opakowanie bez zawartości → brak + koszt null', () => {
    const r = computeItem(spec({ priceBasis: 'perPack', packaging: { packUnit: 'wiadro', perPack: null, packLabel: 'wiadro' } }), 5000)
    expect(r.costGrosze).toBeNull()
    expect(r.missing).toContain('zawartość opakowania (wiadro)')
  })

  it('ryczałt: koszt = kwota; bez kwoty → uzupełnij', () => {
    expect(computeItem(spec({ priceBasis: 'lumpSum', quantity: null }), 150000).costGrosze).toBe(150000)
    expect(computeItem(spec({ priceBasis: 'lumpSum', quantity: null }), null).missing).toContain('kwota')
  })

  it('pozycja wyłączona: koszt 0, bez braków', () => {
    const r = computeItem(spec({ enabled: false }), null)
    expect(r.costGrosze).toBe(0)
    expect(sumItems([r]).complete).toBe(true)
  })
})
