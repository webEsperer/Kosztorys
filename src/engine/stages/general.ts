// Koszty ogólne budowy — kwoty wpisywane ręcznie (CLAUDE.md „Koszty ogólne budowy”).
// Rezerwa na nieprzewidziane wydatki liczona w estimate.ts (% od sumy etapów).

import type { ProjectInput } from '../../model/project'
import type { ItemSpec } from '../items'
import { lumpItem, makeBuilder, manualItem } from './common'

const GROUPS: { category: string; items: [id: string, name: string, enabled?: boolean][] }[] = [
  {
    category: 'Kotłownia',
    items: [
      ['og-kociol', 'Kocioł na pellet lub pompa ciepła'],
      ['og-bufor', 'Bufor'],
      ['og-cwu', 'Zasobnik / boiler CWU'],
      ['og-zbiornik-wyrownawczy', 'Zbiornik wyrównawczy'],
      ['og-falownik', 'Falownik'],
      ['og-kotlownia-osprzet', 'Osprzęt kotłowni'],
      ['og-kotlownia-montaz', 'Montaż kotłowni'],
    ],
  },
  {
    category: 'Geodeta',
    items: [
      ['og-mapa', 'Mapa do celów projektowych'],
      ['og-wytyczenie', 'Wytyczenie budynku i osi'],
      ['og-inwentaryzacja', 'Inwentaryzacja powykonawcza'],
    ],
  },
  {
    category: 'Projekt i formalności',
    items: [
      ['og-projekt', 'Projekt domu i adaptacja'],
      ['og-geotechnika', 'Badania geotechniczne gruntu'],
      ['og-pozwolenie', 'Pozwolenie / zgłoszenie'],
      ['og-dziennik', 'Dziennik budowy'],
      ['og-kierownik', 'Kierownik budowy'],
    ],
  },
  {
    category: 'Przyłącza i media',
    items: [
      ['og-przylacze-pradu', 'Przyłącze prądu'],
      ['og-prad-budowlany', 'Prąd budowlany i zużycie'],
      ['og-woda', 'Przyłącze wody lub studnia głębinowa'],
      ['og-kanalizacja-zew', 'Kanalizacja zewnętrzna (szambo / oczyszczalnia / przyłącze)'],
    ],
  },
  {
    category: 'Zagospodarowanie działki',
    items: [
      ['og-ogrodzenie', 'Ogrodzenie'],
      ['og-brama-wjazdowa', 'Brama wjazdowa'],
      ['og-dojazd', 'Utwardzenie dojazdu'],
      ['og-opaska', 'Opaska wokół domu'],
      ['og-studnia-chlonna', 'Odprowadzenie wody z rynien (studnia chłonna)'],
      ['og-taras', 'Taras'],
      ['og-schody-zew', 'Schody zewnętrzne'],
    ],
  },
  {
    category: 'Instalacje dodatkowe',
    items: [
      ['og-odgromowa', 'Instalacja odgromowa'],
      ['og-fotowoltaika', 'Fotowoltaika', false],
    ],
  },
  {
    category: 'Odbiory i pomiary',
    items: [
      ['og-odbior-kominiarski', 'Odbiór kominiarski'],
      ['og-pomiary-elektryczne', 'Pomiary elektryczne'],
      ['og-odbior-budynku', 'Odbiór budynku'],
    ],
  },
  {
    category: 'Narzędzia i drobne materiały',
    items: [
      ['og-narzedzia', 'Narzędzia (wkrętarka, szlifierka, poziomice, rusztowanie…)'],
      ['og-wkrety-drewno', 'Wkręty do drewna'],
      ['og-laczniki-gazobeton', 'Wkręty / łączniki do betonu komórkowego'],
      ['og-kotwy', 'Kotwy'],
      ['og-pianka', 'Pianka montażowa'],
      ['og-silikony', 'Silikony'],
      ['og-folie', 'Folie budowlane'],
    ],
  },
  {
    category: 'Zaplecze budowy',
    items: [
      ['og-toaleta', 'Toaleta przenośna'],
      ['og-kontener', 'Kontener na odpady'],
      ['og-woda-budowlana', 'Woda budowlana'],
      ['og-ubezpieczenie', 'Ubezpieczenie budowy'],
    ],
  },
]

export function buildGeneral(project: ProjectInput): { items: ItemSpec[] } {
  const b = makeBuilder(project, 'OGOLNE')
  const items: ItemSpec[] = []
  for (const g of GROUPS) {
    for (const [id, name, enabled] of g.items) items.push(lumpItem(b, id, g.category, name, enabled ?? true))
    if (g.category === 'Narzędzia i drobne materiały') {
      items.push(manualItem(b, 'og-wypozyczenia', g.category, 'equipment', 'Wypożyczenia sprzętu (cena za dobę × doby)', 'doba', 'Liczba dób wypożyczeń'))
    }
  }
  return { items }
}
