import { describe, expect, it } from 'vitest'
import {
  computeConcretePour,
  defaultPourParams,
  linearElementVolume,
  slabVolume,
  type ConcretePourParams,
} from '../../src/engine/concrete'
import { renderTrace } from '../../src/engine/trace'

// Przykład referencyjny: 12,00 × 9,00 m wewnątrz, ściana 0,24 m
// P_oś = 42 + 4 × 0,24 = 42,96 m; A_wew = 108 m².
const P_OS = 42.96
const A_WEW = 108

describe('concrete — objętości elementów', () => {
  it('ławy 0,60 × 0,40 (przykład): 42,96 × 0,6 × 0,4 = 10,3104 m³', () => {
    expect(linearElementVolume('ławy', P_OS, 0.6, 0.4).value).toBe(10.3104)
  })

  it('wieniec fundamentowy 0,24 × 0,25: 2,5776 m³', () => {
    expect(linearElementVolume('wieniec fund.', P_OS, 0.24, 0.25).value).toBe(2.5776)
  })

  it('wieniec ścian 0,24 × 0,24: 2,474496 m³', () => {
    expect(linearElementVolume('wieniec ścian', P_OS, 0.24, 0.24).value).toBe(2.474496)
  })

  it('chudziak 108 × 0,10 = 10,8 m³', () => {
    expect(slabVolume('chudziak', A_WEW, 0.1).value).toBe(10.8)
  })

  it('odrzuca zerowe wymiary', () => {
    expect(() => linearElementVolume('x', P_OS, 0, 0.4)).toThrow()
  })
})

describe('concrete — betonowanie', () => {
  const footings = linearElementVolume('ławy', P_OS, 0.6, 0.4)

  it('domyślnie: naddatek 3%, transport za kurs (8 m³), bez cen → niepełne', () => {
    const r = computeConcretePour('Ławy', footings, defaultPourParams('C20/25'))
    // 10,3104 × 1,03 = 10,619712 m³; kursy = ⌈10,619712 / 8⌉ = 2
    expect(r.orderedVolume.value).toBe(10.619712)
    expect(r.trips?.value).toBe(2)
    expect(r.complete).toBe(false)
    expect(r.totalGrosze).toBe(0)
  })

  it('z cenami: beton 420 zł/m³, kurs 250 zł, pompa 600 zł + 10 zł/m³', () => {
    const p: ConcretePourParams = {
      ...defaultPourParams('C20/25'),
      pricePerM3Grosze: 42000,
      transport: { mode: 'perTrip', truckCapacityM3: 8, pricePerTripGrosze: 25000 },
      pump: { enabled: true, rentalGrosze: 60000, perM3Grosze: 1000 },
    }
    const r = computeConcretePour('Ławy', footings, p)
    // beton: 10,619712 × 420 = 4460,27904 → 4460,28 zł
    // transport: 2 × 250 = 500 zł; pompa: 600 + 10,619712 × 10 = 600 + 106,20 zł
    expect(r.lines.map((l) => l.costGrosze)).toEqual([446028, 50000, 60000, 10620])
    expect(r.totalGrosze).toBe(566648)
    expect(r.complete).toBe(true)
    expect(renderTrace(r.trace)).toContain('5 666,48 zł')
  })

  it('transport za m³ — brak kursów', () => {
    const p: ConcretePourParams = {
      ...defaultPourParams('C20/25'),
      pricePerM3Grosze: 42000,
      transport: { mode: 'perM3', pricePerM3Grosze: 3000 },
    }
    const r = computeConcretePour('Ławy', footings, p)
    expect(r.trips).toBeNull()
    expect(r.lines[1].costGrosze).toBe(31859) // 10,619712 × 30 zł = 318,59 zł
  })

  it('pełna gruszka: 8 m³ dokładnie → 1 kurs', () => {
    const v = slabVolume('test', 80, 0.1)
    const r = computeConcretePour('Test', v, { ...defaultPourParams('C8/10'), extraPercent: 0 })
    expect(r.trips?.value).toBe(1)
  })

  it('pompa za godziny bez podanych godzin → uzupełnij', () => {
    const p: ConcretePourParams = {
      ...defaultPourParams('C20/25'),
      pump: { enabled: true, rentalGrosze: 50000, perHourGrosze: 30000, hours: null },
    }
    const r = computeConcretePour('Ławy', footings, p)
    const hoursLine = r.lines.find((l) => l.label === 'Pompa — godziny pracy')
    expect(hoursLine?.quantity).toBeNull()
    expect(hoursLine?.costGrosze).toBeNull()
  })

  it('chudziak z włóknami osobno: dozowanie null → uzupełnij; 2 kg/m³ → 22,248 kg', () => {
    const v = slabVolume('chudziak', A_WEW, 0.1)
    const base = defaultPourParams('C12/15')
    const r1 = computeConcretePour('Chudziak', v, {
      ...base,
      fibers: { enabled: true, kgPerM3: null, pricePerKgGrosze: 2000 },
    })
    expect(r1.fibersKg?.value).toBeNull()
    expect(r1.trips?.value).toBe(2) // 10,8 × 1,03 = 11,124 m³ → ⌈1,39⌉ = 2

    const r2 = computeConcretePour('Chudziak', v, {
      ...base,
      fibers: { enabled: true, kgPerM3: 2, pricePerKgGrosze: 2000 },
    })
    expect(r2.fibersKg?.value).toBe(22.248)
    expect(r2.lines.at(-1)?.costGrosze).toBe(44496)
  })
})
