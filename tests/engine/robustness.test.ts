// Odporność na złe dane: zero, wartość ujemna albo ogromna w dowolnym parametrze pozycji nie może przerwać
// obliczeń — pozycja ma dostać komunikat „uzupełnij / popraw”, a reszta kosztorysu liczyć się dalej.
import { describe, expect, it } from 'vitest'
import { newProject } from '../../src/model/project'
import { applyTemplate, builtInTemplate } from '../../src/model/template'
import { computeEstimate } from '../../src/engine/estimate'
import { buildSSO } from '../../src/engine/stages/sso'
import { buildSSZ } from '../../src/engine/stages/ssz'
import { buildSD } from '../../src/engine/stages/sd'
import { buildGeneral } from '../../src/engine/stages/general'

function filledProject() {
  const p = applyTemplate(newProject(), builtInTemplate(newProject()))
  p.roof.dormers = [{ id: 'D1', b: 4, w: 2, betaDeg: 30, dh: 0, side: 'przód', position: 3, gableFinish: 'boazeria', wallWidth: 3.5 }]
  p.choices = { foundationRingBeamOsbVariant: 'A', wallRingBeamOsbVariant: 'A', foundationFeltVariant: null, wallFeltVariant: null }
  const all = () => [...buildSSO(p).items, ...buildSSZ(p).items, ...buildSD(p).items, ...buildGeneral(p).items]
  for (let pass = 0; pass < 4; pass++)
    for (const it of all())
      for (const [k, prm] of Object.entries(it.params))
        if (prm.value === null && prm.raw === undefined)
          p.itemParams[it.id] = { ...(p.itemParams[it.id] ?? {}), [k]: k === 'stripWidth' ? 0.4 : k.startsWith('sheet') || k.startsWith('roll') ? 1.25 : 1 }
  return { p, all }
}

describe('odporność na złe wartości parametrów', () => {
  it('papa: długość rolki 0 → pozycja „popraw”, kosztorys liczy się dalej', () => {
    const p = applyTemplate(newProject(), builtInTemplate(newProject()))
    p.itemParams['ssz-papa-sciany'] = { rollWidth: 1, rollLength: 0, stripWidth: 0.4 }
    const it = buildSSZ(p).items.find((i) => i.id === 'ssz-papa-sciany')!
    expect(it.quantity).toBeNull()
    expect(it.missing).toContain('Długość rolki papy — wartość musi być większa od zera')
    expect(it.params.rollLength.raw).toBe(0)
    expect(() => computeEstimate(p)).not.toThrow()
  })

  it('pas szerszy niż rolka → komunikat przy pozycji zamiast błędu', () => {
    const p = applyTemplate(newProject(), builtInTemplate(newProject()))
    p.itemParams['ssz-papa-sciany'] = { rollWidth: 0.3, rollLength: 0.3, stripWidth: 0.4 }
    const it = buildSSZ(p).items.find((i) => i.id === 'ssz-papa-sciany')!
    expect(it.missing.some((m) => m.startsWith('popraw dane:'))).toBe(true)
  })

  it('każdy parametr pozycji = 0 / −1 / 10⁶ → bez wyjątku', () => {
    const { p, all } = filledProject()
    const fails: string[] = []
    for (const it of all())
      for (const k of Object.keys(it.params))
        for (const v of [0, -1, 1e6]) {
          const q = structuredClone(p)
          q.itemParams[it.id] = { ...(q.itemParams[it.id] ?? {}), [k]: v }
          try {
            computeEstimate(q)
          } catch (e) {
            fails.push(`${it.id}.${k}=${v}: ${e}`)
          }
        }
    expect(fails).toEqual([])
  }, 60000)
})
