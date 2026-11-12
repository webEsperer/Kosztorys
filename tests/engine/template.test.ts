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
    expect(p.foundation).toMatchObject({ footingWidth: 0.5, footingHeight: 0.4, layers: 6, ringBeamHeight: 0.25 })
    expect(p.slabThickness).toBe(0.1)
    expect(p.floorLayers).toEqual({ insulation: 0.15, screed: 0.07, finish: 0.02 })
  })

  it('ściany nośne 2,80 od posadzki, działowe 47 mb, dach 30°, okapy 60 cm', () => {
    expect(p.wallHeight).toBe(2.8)
    expect(p.partitions).toMatchObject({ length: 47, heightAboveFloor: null, topMargin: 0.02 })
    expect(p.roof).toMatchObject({ pitchDeg: 30, eaveOverhang: 0.6, gableOverhang: 0.6 })
  })

  it('otwory: okna 18,25 m², drzwi zewn. 1,0 × 2,3 × 2 + 1,8 × 2,3 = 8,74 m², drzwi wewn. 6 × 0,8 × 2 + 0,7 × 2 = 11,0 m²', () => {
    const area = (f: (o: (typeof USER_OPENINGS)[number]) => boolean) => openingsArea('x', USER_OPENINGS.filter(f)).value
    expect(area((o) => o.type === 'okno')).toBeCloseTo(18.25, 6)
    expect(area((o) => o.type === 'drzwi zewnętrzne')).toBeCloseTo(8.74, 6)
    expect(area((o) => o.type === 'drzwi wewnętrzne')).toBeCloseTo(11.0, 6)
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

describe('otwory — wyszczególnienie odejmowania', () => {
  const p = applyTemplate(newProject(), builtInTemplate(newProject()))

  it('każdy otwór osobno w „Jak to policzono” bloczków ścian nośnych, z pomieszczeniem i nadprożem', async () => {
    const { renderTrace } = await import('../../src/engine/trace')
    const it = buildSSZ({ ...p, itemParams: { 'ssz-hh-bloczki': { lintelHeight: 0.24 } } }).items.find((i) => i.id === 'ssz-hh-bloczki')!
    const t = renderTrace(it.quantity!.trace)
    expect(t).toContain('O1 okno — Sypialnia 1')
    expect(t).toContain('D2 drzwi zewnętrzne — Drzwi tarasowe (jadalnia)')
    expect(t).toContain('Nadproże O5 okno — Salon')
    expect(t).not.toContain('D4 drzwi wewnętrzne') // drzwi wewnętrzne nie odejmują się od muru nośnego
  })

  it('zestawienie: pola wg ścian; schowek 70 → nadproże 1,25 m; od czego odejmowane', async () => {
    const { openingDeductions, DEFAULT_LINTEL_TABLE } = await import('../../src/engine/openings')
    const d = openingDeductions(p.openings, { exterior: DEFAULT_LINTEL_TABLE, partition: DEFAULT_LINTEL_TABLE }, { exterior: 2, partition: 1 })
    expect(d.totals['zewnętrzna']).toBeCloseTo(18.25 + 8.74, 6)
    expect(d.totals['działowa']).toBeCloseTo(11.0, 6)
    const schowek = d.rows.find((r) => r.opening.mark === 'D10')!
    expect(schowek.lintel).toEqual({ length: 1.25, pieces: 1 })
    expect(schowek.deductedFrom.join(' ')).toContain('tynk wewnętrzny (2 strony)')
  })

  it('schowek 70 → drzwi 60; wszystkie drzwi wewnętrzne przypisane', async () => {
    const { interiorDoors, DEFAULT_DOOR_MAP, openingDeductions, DEFAULT_LINTEL_TABLE } = await import('../../src/engine/openings')
    const r = interiorDoors(p.openings, DEFAULT_DOOR_MAP)
    expect(r.unmapped).toEqual([])
    const o5 = p.openings.find((o) => o.mark === 'O5')!
    expect([o5.width, o5.height]).toEqual([1.4, 2.3])
    const d = openingDeductions(p.openings, { exterior: DEFAULT_LINTEL_TABLE, partition: DEFAULT_LINTEL_TABLE }, { exterior: 2, partition: 1 })
    expect(d.rows.find((x) => x.opening.mark === 'O5')!.lintel).toEqual({ length: 2, pieces: 2 }) // 1,40 > 1,25 → nadproże 2,00 m
    expect(r.groups.map((g) => [g.leaf, g.count])).toEqual([[0.6, 1], [0.7, 6]])
  })
})

describe('dom użytkownika — poziomy fundamentu', () => {
  it('ściana fund. 6 × (12 + 1,5) + 25 = 106 cm; góra ławy −24 − 106 = −130 cm; dno wykopu −142 cm; spód ławy −170 cm', async () => {
    const { projectBase } = await import('../../src/engine/stages/common')
    const p = applyTemplate(newProject(), builtInTemplate(newProject()))
    const L = projectBase(p).levels!.foundation.value
    expect(L.wallHeight).toBeCloseTo(1.06, 9)
    expect(L.footingTop).toBeCloseTo(-1.3, 9)
    expect(L.excavationBottom).toBeCloseTo(-1.42, 9)
    expect(L.footingBottom).toBeCloseTo(-1.7, 9)
  })
})
