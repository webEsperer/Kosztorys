import { describe, expect, it } from 'vitest'
import type { Opening } from '../../src/engine/openings'
import { exteriorWalls, layoutOpenings, nearestWall } from '../../src/engine/openingsLayout'

const O1 = (placements: Opening['placements'], count = 2): Opening => ({ id: 'o1', mark: 'O1', type: 'okno', width: 1.5, height: 1.5, count, wall: 'zewnętrzna', placements })

describe('openingsLayout — ściany i położenia', () => {
  it('ściany od lewego dolnego zgodnie z ruchem wskazówek zegara', () => {
    const w = exteriorWalls(12, 9)
    expect(w.map((x) => [x.id, x.length, x.start])).toEqual([
      ['S1', 9, [0, 0]],
      ['S2', 12, [0, 9]],
      ['S3', 9, [12, 9]],
      ['S4', 12, [12, 0]],
    ])
  })

  it('okno na S2 w odl. 1 m: krawędzie (1; 9) – (2,5; 9); wymiary łańcuchowe 100 / 150 / 950 cm', () => {
    const l = layoutOpenings([O1([{ wallId: 'S2', offset: 1, sillHeight: 0.9 }], 1)], 12, 9, 0.25)
    expect(l.placed[0].a).toEqual([1, 9])
    expect(l.placed[0].b).toEqual([2.5, 9])
    expect(l.chains.filter((c) => c.wallId === 'S2').map((c) => c.label)).toEqual(['100', '150', '950'])
    expect(l.issues).toEqual([])
  })

  it('S4 biegnie od prawej do lewej: offset 1 m → krawędzie (11; 0) – (9,5; 0)', () => {
    const l = layoutOpenings([O1([{ wallId: 'S4', offset: 1, sillHeight: 0.9 }], 1)], 12, 9, 0.25)
    expect([l.placed[0].a, l.placed[0].b]).toEqual([[11, 0], [9.5, 0]])
  })

  it('nierozmieszczone egzemplarze trafiają na listę „do rozmieszczenia”', () => {
    const l = layoutOpenings([O1([{ wallId: 'S2', offset: 1, sillHeight: 0.9 }], 3)], 12, 9, 0.25)
    expect(l.unplaced).toEqual([{ openingId: 'o1', mark: 'O1', type: 'okno', missing: 2 }])
  })
})

describe('openingsLayout — kolizje (filar 25 cm)', () => {
  it('za blisko narożnika (20 cm)', () => {
    const l = layoutOpenings([O1([{ wallId: 'S1', offset: 0.2, sillHeight: 0.9 }], 1)], 12, 9, 0.25)
    expect(l.issues[0].message).toContain('za blisko narożnika')
  })
  it('za blisko narożnika końcowego i poza ścianą', () => {
    expect(layoutOpenings([O1([{ wallId: 'S1', offset: 7.4, sillHeight: 0.9 }], 1)], 12, 9, 0.25).issues[0].message).toContain('za blisko')
    expect(layoutOpenings([O1([{ wallId: 'S1', offset: 8, sillHeight: 0.9 }], 1)], 12, 9, 0.25).issues[0].message).toContain('poza ścianę')
  })
  it('otwór na otworze i za wąski filar między otworami', () => {
    const over = layoutOpenings([O1([{ wallId: 'S2', offset: 1, sillHeight: 0.9 }, { wallId: 'S2', offset: 2, sillHeight: 0.9 }])], 12, 9, 0.25)
    expect(over.issues[0].message).toContain('nachodzą')
    const narrow = layoutOpenings([O1([{ wallId: 'S2', offset: 1, sillHeight: 0.9 }, { wallId: 'S2', offset: 2.6, sillHeight: 0.9 }])], 12, 9, 0.25)
    expect(narrow.issues[0].message).toContain('filar 10 cm')
  })
  it('więcej położeń niż sztuk na liście', () => {
    const l = layoutOpenings([O1([{ wallId: 'S2', offset: 1, sillHeight: 0.9 }, { wallId: 'S2', offset: 5, sillHeight: 0.9 }], 1)], 12, 9, 0.25)
    expect(l.issues.some((i) => i.message.includes('rozmieszczono 2'))).toBe(true)
  })
})

describe('nearestWall', () => {
  it('punkt przy ścianie górnej → S2, położenie wzdłuż', () => {
    const r = nearestWall(exteriorWalls(12, 9), 4, 9.1)
    expect(r.wall.id).toBe('S2')
    expect(r.s).toBeCloseTo(4, 9)
  })
})
