import { describe, expect, it } from 'vitest'
import { newProject, type ProjectInput } from '../../src/model/project'
import { buildSSZ } from '../../src/engine/stages/ssz'
import { computeItem, type ItemSpec } from '../../src/engine/items'
import { computeCeilingRooms, DEFAULT_CEILING_RULES, linesAcross, roomCeiling } from '../../src/engine/ceiling'

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

describe('ceiling — zasady rozmieszczenia (per pomieszczenie)', () => {
  const R = DEFAULT_CEILING_RULES

  it('linie: skrajne od ściany, między nimi co ≤ rozstaw', () => {
    expect(linesAcross(9, 0.15, 1)).toBe(10) // ⌈8,7⌉ + 1
    expect(linesAcross(12, 0.4, 0.9)).toBe(14) // ⌈12,44⌉ + 1
    expect(linesAcross(12, 0.1, 0.4)).toBe(31) // ⌈29,5⌉ + 1
    expect(linesAcross(0.25, 0.15, 1)).toBe(1)
  })

  it('cały parter 12 × 9: główne 10 linii × 14 wieszaków = 140; nośne 31 linii; krzyżowe 310; kołki UD ⌈42 / 0,6⌉ = 70; 8 rzędów płyt', () => {
    const r = roomCeiling({ id: 'x', name: 'Parter', length: 12, width: 9 }, R)
    expect([r.mainLines, r.hangersPerLine, r.hangers, r.carrierLines, r.cross, r.udAnchors, r.boardRows]).toEqual([10, 14, 140, 31, 310, 70, 8])
    expect([r.mainLength, r.carrierLength]).toEqual([12, 9])
  })

  it('dwa pomieszczenia: salon 6 × 4,5 i pokój 3,5 × 2,8 → suma', () => {
    const t = computeCeilingRooms(
      [
        { id: 's', name: 'Salon', length: 6, width: 4.5 },
        { id: 'p', name: 'Pokój', length: 2.8, width: 3.5 },
      ],
      R,
    )
    // salon: główne ⌈4,2⌉ + 1 = 6, wieszaki 6 × (⌈5,78⌉ + 1 = 7) = 42, nośne ⌈14,5⌉ + 1 = 16, krzyżowe 96, kołki 35
    // pokój: główne ⌈2,5⌉ + 1 = 4, wieszaki 4 × (⌈3⌉ + 1 = 4) = 16, nośne ⌈8,25⌉ + 1 = 10, krzyżowe 40, kołki 21
    expect(t.hangers.value).toBe(58)
    expect(t.cross.value).toBe(136)
    expect(t.udAnchors.value).toBe(56)
    expect(t.area.value).toBe(36.8)
    expect(t.perimeter.value).toBe(33.6)
    expect(t.cdSegments).toHaveLength(6 + 16 + 4 + 10)
    expect(t.boardSegments).toHaveLength(4 + 3)
  })

  it('ciężkie płyty: wieszaki co 75 cm', () => {
    const r = roomCeiling({ id: 'x', name: 'P', length: 12, width: 9 }, { ...R, hangerSpacing: 0.75 })
    expect(r.hangersPerLine).toBe(16) // ⌈14,93⌉ + 1
  })
})

describe('SSZ — sufit, elewacja, podłoga (przykład)', () => {
  const p = example()
  const items = buildSSZ(p).items

  it('płyty GK 120 × 260: 8 rzędów × 12 m, resztki ≥ 40 cm na kolejne rzędy → 37 płyt (kontrolnie 108 / 3,12 = 34,6)', () => {
    expect(byId(items, 'ssz-sufit-gk').quantity?.value).toBe(37)
  })

  it('wieszaki 140, łączniki krzyżowe 310, kołki UD 70 (bez listy pomieszczeń — oznaczone do uzupełnienia)', () => {
    expect(byId(items, 'ssz-sufit-wieszaki').quantity?.value).toBe(140)
    expect(byId(items, 'ssz-sufit-laczniki-krzyzowe').quantity?.value).toBe(310)
    expect(byId(items, 'ssz-sufit-kolki-ud').quantity?.value).toBe(70)
    expect(byId(items, 'ssz-sufit-wieszaki').missing[0]).toContain('lista pomieszczeń')
  })

  it('profile CD60: bez długości → uzupełnij; przy 3 m: 10 × 4 + 31 × 3 = 133 profile, łączniki wzdłużne 10 × 3 + 31 × 2 = 92', () => {
    expect(byId(items, 'ssz-sufit-cd60').missing).toContain('Długość profilu CD60')
    const q = buildSSZ({ ...p, itemParams: { 'ssz-sufit-cd60': { profileLength: 3 } } }).items
    expect(byId(q, 'ssz-sufit-cd60').quantity?.value).toBe(133)
    expect(byId(q, 'ssz-sufit-laczniki-wzdluzne').quantity?.value).toBe(92)
  })

  it('z listą pomieszczeń: obwody z pomieszczeń, brak oznaczenia „lista pomieszczeń”', () => {
    const q = buildSSZ({
      ...p,
      rooms: [
        { id: 's', name: 'Salon', length: 6, width: 4.5 },
        { id: 'k', name: 'Pokój', length: 2.8, width: 3.5 },
      ],
    }).items
    expect(byId(q, 'ssz-sufit-wieszaki').quantity?.value).toBe(58)
    expect(byId(q, 'ssz-sufit-wieszaki').missing).toEqual([])
    expect(byId(q, 'ssz-sufit-ud27').quantity?.value).toBe(33.6)
  })

  it('UD27 bez listy pomieszczeń = 42 + 2 × 30 = 102 mb', () => {
    expect(byId(items, 'ssz-sufit-ud27').quantity?.value).toBe(102)
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
