import { describe, expect, it } from 'vitest'
import { buildCustom, newCustomItem, type CustomItem } from '../../src/engine/stages/custom'
import { computeItem } from '../../src/engine/items'
import { computeEstimate } from '../../src/engine/estimate'
import { newProject } from '../../src/model/project'
import { renderTrace } from '../../src/engine/trace'

const base = (over: Partial<CustomItem>): CustomItem => ({ ...newCustomItem('SD', 'c1'), ...over })

describe('własne pozycje', () => {
  it('ręczna ilość × liczba: 12 szt × 2 = 24 szt', () => {
    const [s] = buildCustom([base({ quantity: 12, count: 2 })])
    expect(s.quantity?.value).toBe(24)
    expect(s.isCustom).toBe(true)
  })

  it('mb z wymiaru: 3,5 m × 4 = 14 mb', () => {
    const [s] = buildCustom([base({ unit: 'mb', mode: 'dims', length: 3.5, count: 4 })])
    expect(s.quantity?.value).toBe(14)
  })

  it('m² z wymiarów: 4 × 2,5 × 2 = 20 m²; trace z wzorem', () => {
    const [s] = buildCustom([base({ unit: 'm2', mode: 'dims', length: 4, width: 2.5, count: 2, name: 'Płytki łazienka' })])
    expect(s.quantity?.value).toBe(20)
    expect(renderTrace(s.quantity!.trace)).toContain('dł. × szer. × liczba = 4 × 2,5 × 2')
  })

  it('m³ z wymiarów: 2 × 0,5 × 0,3 = 0,3 m³', () => {
    const [s] = buildCustom([base({ unit: 'm3', mode: 'dims', length: 2, width: 0.5, height: 0.3 })])
    expect(s.quantity?.value).toBe(0.3)
  })

  it('brak wymiaru → uzupełnij', () => {
    const [s] = buildCustom([base({ unit: 'm2', mode: 'dims', length: 4 })])
    expect(s.quantity).toBeNull()
    expect(s.missing).toContain('szerokość')
  })

  it('opakowanie i odpad: 20 m² × 1,1 / 2 m² → 11 paczek × 90 zł', () => {
    const [s] = buildCustom([base({ unit: 'm2', mode: 'dims', length: 4, width: 2.5, count: 2, wastePercent: 10, packaging: { packUnit: 'paczka', perPack: 2 }, priceBasis: 'perPack' })])
    const r = computeItem(s, 9000)
    expect(r.packs).toBe(11)
    expect(r.costGrosze).toBe(99000)
  })

  it('ryczałt', () => {
    const [s] = buildCustom([base({ priceBasis: 'lumpSum' })])
    expect(computeItem(s, 150000).costGrosze).toBe(150000)
  })

  it('wchodzi do sumy etapu w kosztorysie', () => {
    const p = newProject()
    p.customItems = [base({ quantity: 10, unit: 'szt', stage: 'SD' })]
    p.prices = { c1: 2500 }
    const e = computeEstimate(p)
    expect(e.stages.find((s) => s.stage === 'SD')!.totalGrosze).toBe(25000)
  })
})
