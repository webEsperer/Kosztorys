// Powiązania elementów rysunku dachu z pozycjami kosztorysu (w obie strony).

import type { RoofEdgeKind, RoofFace } from '../../engine/roofModel'

export type RoofElementKind = RoofEdgeKind | RoofFace['kind']

export const ELEMENT_ITEMS: Record<RoofElementKind, string[]> = {
  valley: ['ssz-blacha-koszowa', 'ssz-tasma-koszowa'],
  ridge: ['ssz-gasiory', 'ssz-gasior-poczatkowy', 'ssz-gasior-koncowy', 'ssz-tasma-kalenicowa', 'ssz-uchwyty-laty-kalenicowej'],
  eave: ['ssz-rynny', 'ssz-haki', 'ssz-pas-nadrynnowy', 'ssz-pas-podrynnowy', 'ssz-grzebien', 'ssz-deski-czolowe', 'ssz-struktonit'],
  verge: ['ssz-krawedziowe'],
  main: ['ssz-membrana', 'ssz-kontrlaty', 'ssz-laty', 'ssz-dachowka'],
  dormer: ['ssz-membrana', 'ssz-kontrlaty', 'ssz-laty', 'ssz-dachowka', 'ssz-daszki-konstrukcja'],
  gable: ['ssz-szczyt-welna', 'ssz-szczyt-membrana', 'ssz-szczyt-boazeria', 'ssz-szczyt-wsporniki'],
  dormerGable: ['ssz-eps', 'ssz-szczyt-boazeria'],
}

export const ELEMENT_LABEL: Record<RoofElementKind, string> = {
  valley: 'Kosze',
  ridge: 'Kalenice',
  eave: 'Okapy',
  verge: 'Wiatrownice / krawędzie',
  main: 'Połacie główne',
  dormer: 'Połacie daszków',
  gable: 'Szczyty',
  dormerGable: 'Szczyty daszków',
}

/** Pozycja kosztorysu → rodzaj elementu na rysunku (do podświetlenia). */
export function kindForItem(itemId: string): RoofElementKind | null {
  for (const [k, ids] of Object.entries(ELEMENT_ITEMS) as [RoofElementKind, string[]][]) {
    if (k === 'dormer' || k === 'dormerGable') continue
    if (ids.includes(itemId)) return k
  }
  return null
}
