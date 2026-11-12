import { describe, expect, it } from 'vitest'
import { buildHouseModel, wallPieces } from '../../src/engine/model3d'
import { newProject } from '../../src/model/project'

function example() {
  const p = newProject()
  p.floorLayers = { insulation: 0.15, screed: 0.065, finish: 0.015 }
  p.roof = { ...p.roof, pitchDeg: 35, eaveOverhang: 0.6, gableOverhang: 0.6 }
  p.openings = [
    {
      id: 'o1',
      mark: 'O1',
      type: 'okno',
      width: 1.5,
      height: 1.5,
      count: 2,
      wall: 'zewnętrzna',
      placements: [
        { wallId: 'S2', offset: 1, sillHeight: 0.9 },
        { wallId: 'S4', offset: 2, sillHeight: 0.9 },
      ],
    },
    { id: 'd1', mark: 'D1', type: 'drzwi zewnętrzne', width: 1, height: 2.1, count: 1, wall: 'zewnętrzna', placements: [{ wallId: 'S1', offset: 3, sillHeight: 0 }] },
  ]
  return p
}

const area = (ps: { a: number; b: number; z0: number; z1: number }[]) => ps.reduce((s, p) => s + (p.b - p.a) * (p.z1 - p.z0), 0)

describe('model3d — ściany z otworami', () => {
  it('pole kawałków = prostokąt − otwory', () => {
    const ps = wallPieces(0, 10, 0, 3, [
      { a: 1, b: 2.5, z0: 0.9, z1: 2.4 },
      { a: 5, b: 6, z0: 0, z1: 2.1 },
    ])
    expect(area(ps)).toBeCloseTo(30 - 1.5 * 1.5 - 1 * 2.1, 9)
  })

  it('ściany modelu: mur od góry chudziaka (−0,23) do góry wieńca (+2,922); powierzchnia muru = brutto − otwory', () => {
    const m = buildHouseModel(example())
    const walls = m.boxes.filter((b) => b.kind === 'wall')
    expect(Math.min(...walls.map((b) => b.center[2] - b.size[2] / 2))).toBeCloseTo(-0.23, 9)
    expect(Math.max(...walls.map((b) => b.center[2] + b.size[2] / 2))).toBeCloseTo(2.922, 9)
    // pole lica: S2/S4 po długości (z narożnikami) — liczymy po rzucie na kierunek ściany
    const face = walls.reduce((s, b) => s + (b.ref === 'S1' || b.ref === 'S3' ? b.size[1] : b.size[0]) * b.size[2], 0)
    const H = 2.922 + 0.23
    const gross = 2 * (12 + 0.48) * H + 2 * 9 * H
    expect(face).toBeCloseTo(gross - 2 * 1.5 * 1.5 - 1 * 2.1, 6)
  })

  it('okna mają szybę, ramę i parapet; drzwi — skrzydło', () => {
    const m = buildHouseModel(example())
    expect(m.boxes.filter((b) => b.kind === 'glass')).toHaveLength(2)
    expect(m.boxes.filter((b) => b.kind === 'sill')).toHaveLength(2)
    expect(m.boxes.filter((b) => b.kind === 'door')).toHaveLength(1)
  })

  it('dach: kalenica +2,922 + 5,54 × tan 35° ≈ +6,801; szczyty i podbitka', () => {
    const m = buildHouseModel(example())
    expect(m.ridgeZ).toBeCloseTo(2.922 + 5.54 * Math.tan((35 * Math.PI) / 180), 6)
    expect(m.polys.filter((p) => p.kind === 'main')).toHaveLength(2)
    expect(m.polys.filter((p) => p.kind === 'gableWall')).toHaveLength(2)
    expect(m.polys.filter((p) => p.kind === 'soffit')).toHaveLength(2)
    const maxZ = Math.max(...m.polys.flatMap((p) => p.points.map((q) => q[2])))
    expect(maxZ).toBeCloseTo(m.ridgeZ!, 6)
  })

  it('bez dachu i warstw podłogi — lista braków, ściany na przyjętym poziomie', () => {
    const m = buildHouseModel(newProject())
    expect(m.missing).toEqual(expect.arrayContaining(['kąt nachylenia dachu', 'grubość wylewki']))
    expect(m.polys).toHaveLength(0)
  })
})
