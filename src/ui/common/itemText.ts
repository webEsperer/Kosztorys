// Wspólny opis ilości pozycji w UI (lista, panele rysunków, wydruk).

import { type ItemResult, UNIT_LABEL } from '../../engine/items'
import { fmtQty } from './fields'

/** Ilość w jednostce pozycji (z odpadem; sztuki zaokrąglone) + opakowania, gdy są znane. */
export function itemQtyText(r: ItemResult): string {
  const s = r.spec
  if (s.priceBasis === 'lumpSum') return 'ryczałt'
  if (!s.quantity) return 'uzupełnij'
  const q = !s.packaging && r.chargedQuantity !== null ? r.chargedQuantity : (r.quantityWithWaste ?? s.quantity.value)
  const base = `${fmtQty(q)} ${UNIT_LABEL[s.unit]}`
  return s.packaging && r.packs !== null ? `${base} (${r.packs} × ${s.packaging.packUnit})` : base
}
