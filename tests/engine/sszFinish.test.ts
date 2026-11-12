import { describe, expect, it } from 'vitest'
import { newProject, type ProjectInput } from '../../src/model/project'
import { buildSSZ } from '../../src/engine/stages/ssz'
import { computeItem, type ItemSpec } from '../../src/engine/items'
import { computeCeiling } from '../../src/engine/ceiling'

// Przykład 12 × 9 m (A_wew = 108, P_wew = 42), ściana 0,24, EPS 0,20; dach 35°, okapy 0,60.
function example(): ProjectInput {
  const p = newProject('Przykład')
  p.floorLayers = { insulation: 0.15, screed: 0.065, finish: 0.015 }
  p.wall = { ...p.wall, blockLength: 0.59, blockHeight: 0.24 }
  p.partitionBlock = { blockLength: 0.59, blockHeight: 0.24, jointThickness: 0 }
  p.roof = { ...p.roof, pitchDeg: 35, eaveOverhang: 0.6, gableOverhang: 0.6 }
  p.partitions = { length: 30, height: null }
  p.openings = [
    { id: 'o1', mark: 'O1', type: 'okno', width: 1.5, height: 1.5, count: 4, wall: 'zewnętrzna' },
    { id: 'd1', mark: 'D1', type: 'drzwi zewnętrzne', width: 1.0, height: 2.1, count: 1, wall: 'zewnętrzna' },
    { id: 'o3', mark: 'O3', type: 'okno', width: 0.6, height: 0.6, count: 1, wall: 'szczyt' },
  ]
  return p
}
const byId = (items: ItemSpec[], id: string): ItemSpec => {
  const it = items.find((i) => i.id === id)
  if (!it) throw new Error(`brak ${id}`)
  return it
}

describe('ceiling — sufit krzyżowy', () => {
  const c = computeCeiling({ length: 12, width: 9, mainSpacing: 1, carrierSpacing: 0.5 })
  it('CD główne 108 mb, nośne 216 mb; wieszaki ⌈120⌉ = 120; krzyżowe 216', () => {
    expect(c.mainMb.value).toBe(108)
    expect(c.carrierMb.value).toBe(216)
    expect(c.hangers.value).toBe(120)
    expect(c.crossConnectors.value).toBe(216)
  })
  it('łączniki wzdłużne przy profilach 4 m: 9 × (3 − 1) + 24 × (3 − 1) = 66', () => {
    expect(c.lengthConnectors(4).value).toBe(66)
  })
})

describe('SSZ — sufit, elewacja, podłoga (przykład)', () => {
  const p = example()
  const items = buildSSZ(p).items

  it('płyty GK: 108 × 1,1 / 3,12 → ⌈38,08⌉ = 39 płyt', () => {
    expect(computeItem(byId(items, 'ssz-sufit-gk'), 4000).packs).toBe(39)
  })

  it('profile CD60: bez długości profilu → uzupełnij; przy 4 m główne ⌈108 / 4⌉ = 27', () => {
    expect(byId(items, 'ssz-sufit-cd-glowne').missing).toContain('Długość profilu CD60')
    const q = buildSSZ({ ...p, itemParams: { 'ssz-sufit-cd-glowne': { profileLength: 4 } } }).items
    expect(byId(q, 'ssz-sufit-cd-glowne').quantity?.value).toBe(27)
  })

  it('UD30 = obwody pomieszczeń 42 + 2 × 30 = 102 mb', () => {
    expect(byId(items, 'ssz-sufit-ud30').quantity?.value).toBe(102)
  })

  it('EPS: obwód 42 + 8 × 0,34 = 44,72; wys. 2,922 − (−0,26) = 3,182; brutto 142,29904 − otwory 11,1 = 131,19904 m²', () => {
    expect(byId(items, 'ssz-eps').quantity?.value).toBe(131.19904)
  })

  it('narożniki z siatką: 4 × 3,182 + O1 4 × (3 + 1,5) + D1 (4,2 + 1) = 35,928 mb; APU 30,2 mb', () => {
    expect(byId(items, 'ssz-eps-narozniki').quantity?.value).toBe(35.928)
    expect(byId(items, 'ssz-eps-apu').quantity?.value).toBe(30.2) // 2 × 3 × 4 + 2 × 3,1
    expect(byId(items, 'ssz-eps-listwa-startowa').quantity?.value).toBe(43.92)
  })

  it('szczyty: 2 × 9,88² / 4 × tan 35° − 0,36 ≈ 33,81 m²', () => {
    const one = (9.88 * 9.88) / 4 * Math.tan((35 * Math.PI) / 180)
    expect(byId(items, 'ssz-szczyt-welna').quantity?.value).toBeCloseTo(2 * one - 0.36, 4)
  })

  it('podbitka: 2 × 14,08 × 0,6 + 4 × 6,7631 × 0,6 − 4 × 0,6 / cos 35° × 0,6', () => {
    const cos35 = Math.cos((35 * Math.PI) / 180)
    const exp = 2 * 14.08 * 0.6 + 4 * (5.54 / cos35) * 0.6 - (4 * 0.6 * 0.6) / cos35
    expect(byId(items, 'ssz-podbitka').quantity?.value).toBeCloseTo(exp, 4)
  })

  it('EPS podłogowy 3 × 108 = 324 m²; PEX domyślnie 800 m = 4 zwoje; YDYp 600 m = 6 bębnów', () => {
    expect(byId(items, 'ssz-eps-podlogowy').quantity?.value).toBe(324)
    expect(computeItem(byId(items, 'ssz-pex'), null).packs).toBe(4)
    expect(computeItem(byId(items, 'ssz-ydyp-25'), null).packs).toBe(6)
    expect(byId(items, 'ssz-zlaczki-podlogowki').quantity?.value).toBe(22)
  })

  it('unikalne id w całym SSZ', () => {
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length)
  })
})
