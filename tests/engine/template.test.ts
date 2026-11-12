import { describe, expect, it } from 'vitest'
import { newProject } from '../../src/model/project'
import { applyTemplate, builtInTemplate, describeTemplate, mergeTemplate, templateFrom, USER_OPENINGS } from '../../src/model/template'
import { buildSSZ } from '../../src/engine/stages/ssz'
import { openingsArea } from '../../src/engine/openings'

describe('szablon nowego projektu — dane domu użytkownika', () => {
  const p = applyTemplate(newProject(), builtInTemplate(newProject()))

  it('bloczki: fund. 38 × 24 × 12, nośny 59 × 24, działowy 59 × 24', () => {
    expect(p.foundation).toMatchObject({ blockLength: 0.38, blockWidth: 0.24, blockHeight: 0.12 })
    expect(p.wall).toMatchObject({ blockLength: 0.59, blockHeight: 0.24 })
    expect(p.partitionBlock).toMatchObject({ blockLength: 0.59, blockHeight: 0.24 })
    expect(p.foundation.jointThickness).toBe(0.015)
    expect(p.floorLayers).toEqual({ insulation: 0.15, screed: 0.07, finish: null }) // wykończenie — uzupełnia użytkownik
  })

  it('ściany nośne 2,80 od posadzki, działowe 47 mb, dach 30°, okapy 60 cm', () => {
    expect(p.wallHeight).toBe(2.8)
    expect(p.partitions).toMatchObject({ length: 47, heightAboveFloor: null, topMargin: 0.02 })
    expect(p.roof).toMatchObject({ pitchDeg: 30, eaveOverhang: 0.6, gableOverhang: 0.6 })
  })

  it('otwory: okna 18,25 m², drzwi zewn. 1,0 × 2,3 × 2 + 1,8 × 2,3 = 8,74 m², drzwi wewn. 6 × 0,8 × 2 + 0,6 × 2 = 10,8 m²', () => {
    const area = (f: (o: (typeof USER_OPENINGS)[number]) => boolean) => openingsArea('x', USER_OPENINGS.filter(f)).value
    expect(area((o) => o.type === 'okno')).toBeCloseTo(18.25, 6)
    expect(area((o) => o.type === 'drzwi zewnętrzne')).toBeCloseTo(8.74, 6)
    expect(area((o) => o.type === 'drzwi wewnętrzne')).toBeCloseTo(10.8, 6)
  })

  it('projekt z szablonu jest edytowalny i niezależny od szablonu', () => {
    const q = applyTemplate(newProject(), builtInTemplate(newProject()))
    q.openings[0].width = 2
    q.openings.pop()
    expect(USER_OPENINGS[0].width).toBe(1.5)
    expect(USER_OPENINGS).toHaveLength(19)
    expect(buildSSZ(q).items.length).toBeGreaterThan(0)
  })

  it('zapisany szablon: puste pola nie kasują wbudowanych; wartości podane — wygrywają', () => {
    const src = newProject('Mój')
    src.floorLayers = { insulation: 0.15, screed: 0.065, finish: 0.015 }
    src.roof = { ...src.roof, pitchDeg: null, eaveOverhang: 0.5 }
    const t = mergeTemplate(builtInTemplate(newProject()), templateFrom(src))
    expect(t.floorLayers).toEqual(src.floorLayers)
    expect(t.roof).toMatchObject({ pitchDeg: 30, eaveOverhang: 0.5, gableOverhang: 0.6 })
    expect(t.wallBlock.blockLength).toBe(0.59)
    expect(describeTemplate(t)[0]).toBe('bloczek fundamentowy 38 × 24 × 12 cm, spoina 1,5 cm')
  })
})
