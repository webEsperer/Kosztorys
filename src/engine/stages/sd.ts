// SD — stan deweloperski (CLAUDE.md „SD — Stan deweloperski”).

import type { ProjectInput } from '../../model/project'
import { type ItemSpec, need } from '../items'
import { type Computed, clean, fmt } from '../trace'
import { computed, makeBuilder, projectBase } from './common'

export function buildSD(project: ProjectInput): { items: ItemSpec[] } {
  const b = makeBuilder(project, 'SD')
  const { P, item } = b
  const items: ItemSpec[] = []
  const { geo, aWew } = projectBase(project)
  const pWew = geo.interiorPerimeter.value
  const h = project.clearHeight
  const ext = project.openings.filter((o) => o.wall === 'zewnętrzna')
  const part = project.openings.filter((o) => o.wall === 'działowa')
  const area = (os: typeof ext) => clean(os.reduce((a, o) => a + o.width * o.height * o.count, 0))

  // Wylewka
  {
    const id = 'sd-wylewka'
    const sc = project.floorLayers.screed
    const q = sc === null ? aWew : { ...aWew, trace: [...aWew.trace, { label: 'Informacyjnie — objętość wylewki', formula: 'A_wew × grubość', values: `${fmt(aWew.value)} × ${fmt(sc)}`, result: clean(aWew.value * sc), unit: 'm³' }] }
    items.push(item({ id, category: 'Posadzki', kind: 'service', name: 'Wylewka cementowa (usługa z materiałem)', unit: 'm2', quantity: q }))
  }

  // Tynki wewnętrzne
  {
    const id = 'sd-tynki'
    const params = {
      reveals: P(id, 'reveals', 'Dolicz ościeża (1 = tak)', 0, ''),
      revealDepth: P(id, 'revealDepth', 'Głębokość ościeża', project.wallThickness, 'm'),
    }
    const missing: string[] = []
    if (project.partitions.length === null) missing.push('długość ścian działowych (mb)')
    let quantity: Computed | null = null
    if (project.partitions.length !== null) {
      const extWalls = clean(pWew * h - area(ext))
      const partWalls = clean(2 * project.partitions.length * h - 2 * area(part))
      const withReveals = (params.reveals.value ?? 0) >= 1
      const rev = withReveals ? clean(ext.reduce((a, o) => a + (2 * o.height + o.width) * o.count, 0) * (params.revealDepth.value ?? 0)) : 0
      const total = clean(extWalls + partWalls + rev)
      quantity = {
        value: total,
        unit: 'm²',
        trace: [
          { label: 'Ściany zewnętrzne od środka', formula: 'P_wew × h − otwory', values: `${fmt(pWew)} × ${fmt(h)} − ${fmt(area(ext))}`, result: extWalls, unit: 'm²' },
          { label: 'Ściany działowe obustronnie', formula: '2 × mb × h − 2 × otwory', values: `2 × ${fmt(project.partitions.length)} × ${fmt(h)} − 2 × ${fmt(area(part))}`, result: partWalls, unit: 'm²' },
          ...(withReveals ? [{ label: 'Ościeża', formula: 'Σ (2h + w) × liczba × głębokość', values: fmt(rev), result: rev, unit: 'm²' }] : []),
          { label: 'Tynki razem', formula: 'suma', values: `${fmt(extWalls)} + ${fmt(partWalls)}${withReveals ? ` + ${fmt(rev)}` : ''}`, result: total, unit: 'm²' },
        ],
      }
    }
    items.push(item({ id, category: 'Tynki i gładzie', kind: 'service', name: 'Tynki wewnętrzne (usługa z materiałem)', unit: 'm2', params, missing, quantity }))
  }
  items.push(item({ id: 'sd-gladz-sufit', category: 'Tynki i gładzie', kind: 'service', name: 'Szpachlowanie / gładź sufitu GK', unit: 'm2', quantity: computed('Sufit', 'A_wew', fmt(aWew.value), aWew.value, 'm²') }))

  // Parapety wewnętrzne
  {
    const id = 'sd-parapety-wew'
    const params = { ext: P(id, 'ext', 'Wysunięcie parapetu w bok (z każdej strony)', 0, 'm') }
    const missing: string[] = []
    const e = need(params, 'ext', missing)
    const windows = project.openings.filter((o) => o.type === 'okno')
    const v = e !== null ? clean(windows.reduce((a, o) => a + (o.width + 2 * e) * o.count, 0)) : null
    items.push(
      item({
        id,
        category: 'Parapety',
        kind: 'material',
        name: 'Parapety wewnętrzne',
        unit: 'mb',
        params,
        missing,
        quantity: v !== null && windows.length ? computed('Parapety wewnętrzne', 'Σ (szer. + 2 × wysunięcie) × liczba', windows.map((o) => `(${fmt(o.width)} + 2 × ${fmt(e!)}) × ${o.count}`).join(' + '), v, 'm') : null,
        ...(windows.length ? {} : { note: 'brak okien na liście otworów' }),
      }),
    )
  }
  return { items }
}
