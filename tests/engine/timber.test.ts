// Drewno: rozliczenie za szt / mb albo za m³ (wg użytkownika) — ilość m³ z wymiarów albo wpisana ręcznie.
import { describe, expect, it } from 'vitest'
import { newProject } from '../../src/model/project'
import { applyTemplate, builtInTemplate } from '../../src/model/template'
import { buildSSO } from '../../src/engine/stages/sso'
import { buildSSZ } from '../../src/engine/stages/ssz'
import { computeEstimate } from '../../src/engine/estimate'
import { computeItem } from '../../src/engine/items'
import { TIMBER_M3_NET_DEFAULT, TIMBER_SECTIONS } from '../../src/engine/stages/common'

const house = () => applyTemplate(newProject(), builtInTemplate(newProject()))
const find = (items: { id: string }[], id: string) => items.find((i) => i.id === id) as ReturnType<typeof buildSSO>['items'][number]

describe('drewno za m³', () => {
  it('domyślnie: szalunek ław, łaty, kontrłaty za m³ netto; reszta drewna za szt / mb', () => {
    const p = house()
    const all = [...buildSSO(p).items, ...buildSSZ(p).items]
    for (const id of Object.keys(TIMBER_SECTIONS)) {
      const net = TIMBER_M3_NET_DEFAULT.has(id)
      expect(find(all, id).timber, id).toMatchObject({ m3: net })
      expect(find(all, id).netPrice?.vatPercent, id).toBe(net ? 23 : undefined)
    }
    expect(find(all, 'ssz-szczyt-boazeria').timber).toBeUndefined()
    expect(find(all, 'sso-lawy-deski').unit).toBe('m3')
    expect(find(all, 'ssz-deski-czolowe').unit).toBe('mb')
  })

  it('deski szalunkowe: 43 szt × (2 × 0,12 × 0,025 = 0,006 m³) = 0,258 m³; koszt = m³ × cena', () => {
    const p = { ...house(), timberBilling: { 'sso-lawy-deski': true } }
    const it = find(buildSSO(p).items, 'sso-lawy-deski')
    expect(it.unit).toBe('m3')
    expect(it.quantity?.value).toBeCloseTo(0.258, 9)
    expect(it.timber).toMatchObject({ m3: true, baseUnit: 'szt', manual: null })
    // cena netto 2000 zł/m³ + VAT 23% = 2460 zł/m³ brutto; 0,258 × 2460 = 634,68 zł
    expect(computeItem(it, 200000).costGrosze).toBe(63468)
  })

  it('m³ wpisane ręcznie ma pierwszeństwo przed wymiarami', () => {
    const p = { ...house(), timberBilling: { 'sso-lawy-deski': true }, itemParams: { 'sso-lawy-deski': { m3: 0.4 } } }
    const it = find(buildSSO(p).items, 'sso-lawy-deski')
    expect(it.quantity?.value).toBe(0.4)
    expect(it.timber?.fromDims).toBeCloseTo(0.258, 9)
  })

  it('paliki: grubość nieznana → uzupełnij; po podaniu 5 cm: 172 × 0,5 × 0,05 × 0,05 = 0,215 m³', () => {
    const p = { ...house(), timberBilling: { 'sso-lawy-paliki': true } }
    const a = find(buildSSO(p).items, 'sso-lawy-paliki')
    expect(a.quantity).toBeNull()
    expect(a.missing).toContain('Grubość palika')
    const b = find(buildSSO({ ...p, itemParams: { 'sso-lawy-paliki': { stakeThickness: 0.05 } } }).items, 'sso-lawy-paliki')
    expect(b.quantity?.value).toBeCloseTo(172 * 0.5 * 0.05 * 0.05, 9)
  })

  it('kontrłaty 3,2 × 5 cm: mb × 0,0016 m³/mb', () => {
    const p = house()
    const mb = find(buildSSZ({ ...p, timberBilling: { 'ssz-kontrlaty': false } }).items, 'ssz-kontrlaty').quantity!.value
    const it = find(buildSSZ({ ...p, timberBilling: { 'ssz-kontrlaty': true } }).items, 'ssz-kontrlaty')
    expect(it.quantity?.value).toBeCloseTo(mb * 0.05 * 0.032, 5)
  })

  it('wszystkie pozycje drewna za m³ — kosztorys liczy się bez błędu', () => {
    const p = { ...house(), timberBilling: Object.fromEntries(Object.keys(TIMBER_SECTIONS).map((k) => [k, true])) }
    expect(() => computeEstimate(p)).not.toThrow()
  })
})
