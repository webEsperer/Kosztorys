import { describe, expect, it } from 'vitest'
import { newProject } from '../../src/model/project'
import { computeEstimate } from '../../src/engine/estimate'
import { estimateCsv, openingSchedule, openingsCsv } from '../../src/engine/exportData'

function example() {
  const p = newProject('Dom; „testowy”')
  p.openings = [
    { id: 'o1', mark: 'O1', type: 'okno', width: 1.5, height: 1.5, count: 4, wall: 'zewnętrzna', room: 'Salon' },
    { id: 'd1', mark: 'D1', type: 'drzwi zewnętrzne', width: 1.0, height: 2.1, count: 1, wall: 'zewnętrzna' },
    { id: 'd2', mark: 'D2', type: 'drzwi wewnętrzne', width: 0.9, height: 2.07, count: 3, wall: 'działowa' },
  ]
  p.prices = { 'sso-kanalizacja': 800050 }
  return p
}

describe('eksport CSV kosztorysu', () => {
  const p = example()
  const csv = estimateCsv(computeEstimate(p), p)

  it('BOM, separator ;, przecinek dziesiętny', () => {
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv).toContain('Kanalizacja podposadzkowa (całość);;ryczałt;;;1;ryczałt;8000,5;8000,5;')
  })

  it('pola ze średnikiem/cudzysłowem w cudzysłowach', () => {
    expect(csv).toContain('Kosztorys;"Dom; „testowy”"')
  })

  it('sumy etapów i RAZEM z rezerwą 10%', () => {
    expect(csv).toContain('Suma etapów;;;;;;;;8000,5;')
    expect(csv).toContain('RAZEM;;;;;;;;8800,55;kosztorys niepełny')
  })
})

describe('zestawienie otworów dla producenta', () => {
  it('bez drzwi wewnętrznych (domyślnie), wymiary w cm', () => {
    const rows = openingSchedule(example())
    expect(rows).toEqual([
      { lp: 1, mark: 'O1', type: 'okno', widthCm: 150, heightCm: 150, count: 4, room: 'Salon' },
      { lp: 2, mark: 'D1', type: 'drzwi zewnętrzne', widthCm: 100, heightCm: 210, count: 1, room: '' },
    ])
  })
  it('z drzwiami wewnętrznymi na życzenie', () => {
    expect(openingSchedule(example(), true)).toHaveLength(3)
  })
  it('CSV: nagłówki i wiersze', () => {
    const csv = openingsCsv(example())
    expect(csv).toContain('Lp.;Oznaczenie;Typ;Szerokość otworu [cm];Wysokość otworu [cm];Ilość;Pomieszczenie;Typ otwierania;Kolor;Uwagi')
    expect(csv).toContain('1;O1;okno;150;150;4;Salon;;;')
  })
})
