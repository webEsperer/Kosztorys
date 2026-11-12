import { describe, expect, it } from 'vitest'
import { ceilSafe, clean, floorSafe, fmt, fmtLevel, fmtP } from '../../src/engine/trace'

describe('trace — formatowanie liczb', () => {
  it('format polski: przecinek, spacja tysięcy, bez zbędnych zer', () => {
    expect(fmt(12345.678, 2)).toBe('12 345,68')
    expect(fmt(42.96)).toBe('42,96')
    expect(fmt(42)).toBe('42')
    expect(fmt(0.065)).toBe('0,065')
    expect(fmt(-0.23)).toBe('−0,23')
    expect(fmt(-0.0000001)).toBe('0')
  })

  it('wartości ujemne w nawiasie i rzędne ze znakiem', () => {
    expect(fmtP(-0.23)).toBe('(−0,23)')
    expect(fmtP(0.23)).toBe('0,23')
    expect(fmtLevel(2.89)).toBe('+2,89')
    expect(fmtLevel(-0.23)).toBe('−0,23')
    expect(fmtLevel(0)).toBe('±0')
  })

  it('clean / floorSafe / ceilSafe usuwają szum zmiennoprzecinkowy', () => {
    expect(clean(0.1 + 0.2)).toBe(0.3)
    expect(floorSafe((3.12 - 0.24) / 0.24)).toBe(12)
    expect(ceilSafe(0.1 * 3 * 10)).toBe(3)
  })
})
