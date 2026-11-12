import { describe, expect, it } from 'vitest'
import {
  costLine,
  formatPLN,
  multiply,
  netFromGross,
  packsNeeded,
  sumCosts,
  toGrosze,
  withWaste,
} from '../../src/engine/money'

describe('money — grosze i format', () => {
  it('złote → grosze bez błędów zmiennoprzecinkowych', () => {
    expect(toGrosze(31)).toBe(3100)
    expect(toGrosze(0.1 + 0.2)).toBe(30)
    expect(toGrosze(19.99)).toBe(1999)
  })

  it('format polski: spacja tysięcy, przecinek, „zł”', () => {
    expect(formatPLN(1234567)).toBe('12 345,67 zł')
    expect(formatPLN(5)).toBe('0,05 zł')
    expect(formatPLN(2077000)).toBe('20 770,00 zł')
    expect(formatPLN(-150)).toBe('−1,50 zł')
  })

  it('odrzuca ułamki groszy', () => {
    expect(() => formatPLN(1.5)).toThrow()
  })

  it('ilość × cena zaokrąglone do grosza', () => {
    expect(multiply(670, 3100)).toBe(2077000) // przykład z CLAUDE.md: 670 × 31,00 zł
    expect(multiply(10.619712, 42000)).toBe(446028) // 10,619712 m³ × 420 zł = 4460,279 zł
  })

  it('netto z brutto (VAT 23% i 8%)', () => {
    expect(netFromGross(12300, 23)).toBe(10000)
    expect(netFromGross(10800, 8)).toBe(10000)
  })
})

describe('money — odpad i opakowania', () => {
  it('przykład H+H: 650,3 szt +3% → 669,8 → 670 szt', () => {
    const q = withWaste(650.3, 3, 'szt')
    expect(q.value).toBeCloseTo(669.809, 6)
    expect(packsNeeded(q.value, 1, 'szt', 'szt').value).toBe(670)
  })

  it('pełne opakowanie bez szumu: 12 m² / 3 m² = 4 paczki', () => {
    expect(packsNeeded(0.1 * 120, 3, 'm²', 'paczka').value).toBe(4)
    expect(packsNeeded(12.01, 3, 'm²', 'paczka').value).toBe(5)
  })
})

describe('money — pozycja kosztowa', () => {
  it('brak ceny → koszt null, trace „uzupełnij cenę”', () => {
    const l = costLine('Beton', 10, 'm³', null)
    expect(l.costGrosze).toBeNull()
    expect(l.trace[0].result).toBe('uzupełnij cenę')
  })

  it('suma oznacza niepełność przy brakującej cenie', () => {
    const s = sumCosts([costLine('A', 2, 'szt', 100), costLine('B', 1, 'szt', null)])
    expect(s.total).toBe(200)
    expect(s.complete).toBe(false)
  })
})
