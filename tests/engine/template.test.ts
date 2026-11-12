import { describe, expect, it } from 'vitest'
import { newProject } from '../../src/model/project'
import { applyTemplate, builtInTemplate, describeTemplate, templateFrom } from '../../src/model/template'

describe('szablon nowego projektu', () => {
  it('wbudowany: bloczek fundamentowy 38 × 24 × 12 cm', () => {
    const p = applyTemplate(newProject(), builtInTemplate(newProject()))
    expect(p.foundation).toMatchObject({ blockLength: 0.38, blockWidth: 0.24, blockHeight: 0.12 })
    expect(p.floorLayers.insulation).toBeNull() // nie zgadujemy — uzupełnia użytkownik
  })

  it('zapamiętane z projektu → wpisane do nowego; nowy projekt dalej edytowalny i niezależny', () => {
    const src = newProject('Mój')
    src.foundation = { ...src.foundation, blockLength: 0.38, blockWidth: 0.24, blockHeight: 0.12, jointThickness: 0.01, layers: 5 }
    src.floorLayers = { insulation: 0.15, screed: 0.065, finish: 0.015 }
    src.ceiling = { board: 0.0125, grid: 0.06, voidAbove: 0.15 }
    src.roof = { ...src.roof, pitchDeg: 35, eaveOverhang: 0.6, gableOverhang: 0.5 }
    src.footprint = { length: 15, width: 10 }
    const t = templateFrom(src)
    const p = applyTemplate(newProject('Nowy'), t)
    expect(p.floorLayers).toEqual(src.floorLayers)
    expect(p.ceiling).toEqual(src.ceiling)
    expect(p.roof).toMatchObject({ pitchDeg: 35, eaveOverhang: 0.6, gableOverhang: 0.5 })
    expect(p.foundation).toMatchObject({ blockLength: 0.38, jointThickness: 0.01, layers: null }) // liczba warstw — nie z szablonu
    expect(p.footprint).toEqual({ length: 12, width: 9 }) // wymiary domu — nie z szablonu
    p.floorLayers.screed = 0.07
    expect(t.floorLayers.screed).toBe(0.065)
    expect(describeTemplate(t)[0]).toBe('bloczek fundamentowy 38 × 24 × 12 cm, spoina 1 cm')
  })
})
