// SSZ — sufit podwieszany GK z ociepleniem, elewacja (EPS, szczyty, podbitka), podłoga na gruncie i instalacje.

import type { ProjectInput } from '../../model/project'
import { computeCeilingRooms } from '../ceiling'
import { computeCutting, DEFAULT_MIN_PIECE } from '../cutting'
import { computeFacade, gableFacade, soffitArea } from '../facade'
import { type ItemKind, type ItemSpec, type PackUnit, type Unit, UNIT_LABEL, need } from '../items'
import { type Computed, ceilSafe, clean, fmt } from '../trace'
import { type Builder, attempt, computed, gableSpanInterior, lumpItem, projectBase } from './common'
import { roofOf } from './sszRoof'

interface ConsumptionOpts {
  /** Zużycie na jednostkę podstawy (null = uzupełnij); undefined = ilość = podstawa. */
  rate?: { label: string; unit: string; value: number | null; note?: string }
  unit: Unit
  /** Opakowanie: zawartość w jednostce pozycji (null = uzupełnij). */
  pack?: { packUnit: PackUnit; label: string; value: number | null }
  waste?: number
  kind?: ItemKind
  enabled?: boolean
  note?: string
}

/** Pozycja „podstawa × zużycie → opakowania”. */
function consumptionItem(b: Builder, id: string, category: string, name: string, base: Computed | null, baseMissing: string[], o: ConsumptionOpts): ItemSpec {
  const params: ItemSpec['params'] = {}
  const missing = [...baseMissing]
  let rate: number | null = 1
  if (o.rate) {
    params.rate = b.P(id, 'rate', o.rate.label, o.rate.value, o.rate.unit, o.rate.note)
    rate = need(params, 'rate', missing)
  }
  let perPack: number | null = null
  if (o.pack) {
    params.perPack = b.P(id, 'perPack', o.pack.label, o.pack.value, UNIT_LABEL[o.unit])
    perPack = params.perPack.value
    if (perPack === null) missing.push(o.pack.label)
  }
  let quantity: Computed | null = null
  if (base && rate !== null) {
    quantity = o.rate
      ? { value: clean(base.value * rate), unit: UNIT_LABEL[o.unit], trace: [...base.trace, { label: name, formula: 'podstawa × zużycie', values: `${fmt(base.value)} × ${fmt(rate)}`, result: clean(base.value * rate), unit: UNIT_LABEL[o.unit] }] }
      : base
  }
  return b.item({
    id,
    category,
    kind: o.kind ?? 'material',
    name,
    unit: o.unit,
    params,
    missing,
    quantity,
    wastePercent: o.waste ?? 0,
    ...(o.pack ? { packaging: { packUnit: o.pack.packUnit, perPack, packLabel: perPack === null ? o.pack.packUnit : `${o.pack.packUnit} = ${fmt(perPack)} ${UNIT_LABEL[o.unit]}` }, priceBasis: 'perPack' as const } : {}),
    ...(o.enabled === false ? { enabled: false } : {}),
    ...(o.note ? { note: o.note } : {}),
  })
}

export function finishItems(b: Builder, project: ProjectInput): ItemSpec[] {
  const out: ItemSpec[] = []
  const { geo, aWew, slabTop, ringTop, floorMissing, wallHeightMissing } = projectBase(project)
  const pWew = geo.interiorPerimeter.value
  const L = project.footprint.length
  const B = project.footprint.width
  const partLen = project.partitions.length
  const rules = project.ceilingRules

  // Pomieszczenia: lista użytkownika albo cały parter (przybliżenie — oznaczone do uzupełnienia)
  const rooms = project.rooms.length ? project.rooms : [{ id: 'parter', name: 'Cały parter', length: L, width: B }]
  const noRooms = project.rooms.length === 0
  const ceil = computeCeilingRooms(rooms, rules)
  const roomsNote = noRooms ? ['lista pomieszczeń (sufit liczony dla całego parteru bez podziału)'] : []

  // Obwody pomieszczeń: suma obwodów pomieszczeń; bez listy — P_wew + 2 × ściany działowe
  const roomsPerimeter: Computed = !noRooms
    ? ceil.perimeter
    : partLen !== null
      ? computed('Obwody pomieszczeń', 'P_wew + 2 × mb ścian działowych', `${fmt(pWew)} + 2 × ${fmt(partLen)}`, pWew + 2 * partLen, 'm')
      : computed('Obwody pomieszczeń', 'P_wew (bez ścian działowych — nie podano)', fmt(pWew), pWew, 'm')
  const roomsMissing = noRooms && partLen === null ? ['długość ścian działowych (obwody pomieszczeń)'] : []

  // ── Sufit podwieszany GK + ocieplenie (per pomieszczenie, sumowane)
  const C1 = 'Sufit podwieszany GK + ocieplenie'
  {
    const id = 'ssz-sufit-cd60'
    const params = {
      profileLength: b.P(id, 'profileLength', 'Długość profilu CD60', null, 'm', '2,6 / 3 / 4 m; blacha 0,6 mm'),
      minPiece: b.P(id, 'minPiece', 'Min. kawałek z resztki', DEFAULT_MIN_PIECE, 'm'),
    }
    const missing = [...roomsNote]
    const pl = need(params, 'profileLength', missing)
    let quantity: Computed | null = null
    let joints: Computed | null = null
    if (pl !== null) attempt(() => {
      const cut = computeCutting({
        material: 'profil CD60',
        sheetUnit: 'profili',
        sheet: { width: 0.06, length: pl },
        stripWidth: 0.06,
        segments: ceil.cdSegments,
        minPieceLength: params.minPiece.value ?? 0,
        jointOverlap: 0,
      })
      const v = cut.A
      if (!v) throw new Error('profil nie mieści się w wariancie cięcia')
      const mb = clean(ceil.cdSegments.reduce((a, s) => a + s.length, 0))
      const base = [...ceil.rooms.flatMap((r) => r.trace), { label: 'Profile CD60 — długość linii', formula: 'Σ (główne × L + nośne × B)', values: `${ceil.cdSegments.length} linii`, result: mb, unit: 'm' }]
      quantity = { value: v.sheets, unit: 'szt', trace: [...base, { label: 'Profile CD60', formula: 'cięcie z profili handlowych, resztki na kolejne linie', values: `${fmt(mb)} m z profili ${fmt(pl)} m`, result: v.sheets, unit: 'szt' }] }
      joints = { value: v.joints, unit: 'szt', trace: [...base, { label: 'Łączniki wzdłużne', formula: 'łączenia kawałków w liniach', values: `profil ${fmt(pl)} m`, result: v.joints, unit: 'szt' }] }
    }, missing)
    out.push(b.item({ id, category: C1, kind: 'material', name: 'Profile CD60 (główne i nośne)', unit: 'szt', params, missing, quantity }))
    out.push(b.item({ id: 'ssz-sufit-laczniki-wzdluzne', category: C1, kind: 'material', name: 'Łączniki wzdłużne CD60', unit: 'szt', missing: pl === null ? [params.profileLength.label] : [], quantity: joints }))
  }
  {
    const id = 'ssz-sufit-ud27'
    const params = { profileLength: b.P(id, 'profileLength', 'Długość profilu UD27', null, 'm', '3 m lub 4 m; łączone na styk') }
    const missing = [...roomsNote, ...roomsMissing]
    const pl = need(params, 'profileLength', missing)
    out.push(
      b.item({
        id,
        category: C1,
        kind: 'material',
        name: 'Profile przyścienne UD27 (obrysówka)',
        unit: 'mb',
        params,
        missing,
        quantity: roomsPerimeter,
        packaging: { packUnit: 'szt', perPack: pl, packLabel: pl === null ? 'profil' : `profil ${fmt(pl)} m` },
        priceBasis: 'perPack',
      }),
    )
  }
  out.push(consumptionItem(b, 'ssz-sufit-tasma-akustyczna', C1, 'Taśma akustyczna pod UD27', roomsPerimeter, [...roomsNote, ...roomsMissing], { unit: 'mb', pack: { packUnit: 'rolka', label: 'mb taśmy w rolce', value: null } }))
  out.push(b.item({ id: 'ssz-sufit-kolki-ud', category: C1, kind: 'material', name: 'Kołki szybkiego montażu do UD27 (co 60 cm)', unit: 'szt', missing: roomsNote, quantity: ceil.udAnchors }))
  out.push(b.item({ id: 'ssz-sufit-wieszaki', category: C1, kind: 'material', name: `Wieszaki (co ${fmt(rules.hangerSpacing * 100)} cm)`, unit: 'szt', missing: roomsNote, quantity: ceil.hangers }))
  out.push(b.item({ id: 'ssz-sufit-mocowanie-wieszakow', category: C1, kind: 'material', name: 'Mocowanie wieszaków (dyble stalowe do betonu / wkręty do drewna)', unit: 'szt', missing: roomsNote, quantity: ceil.hangers, note: 'do betonu tylko stalowe dyble — nigdy plastikowe kołki' }))
  out.push(b.item({ id: 'ssz-sufit-laczniki-krzyzowe', category: C1, kind: 'material', name: 'Łączniki krzyżowe', unit: 'szt', missing: roomsNote, quantity: ceil.cross }))
  {
    const id = 'ssz-sufit-gk'
    const params = {
      boardLength: b.P(id, 'boardLength', 'Długość płyty GK', 2.6, 'm', '2,0 / 2,6 / 3,0 m; szer. 120 cm, gr. 12,5 mm'),
      minPiece: b.P(id, 'minPiece', 'Min. kawałek z resztki (mijanka spoin)', 0.4, 'm'),
    }
    const missing = [...roomsNote]
    const bl = need(params, 'boardLength', missing)
    let quantity: Computed | null = null
    if (bl !== null) attempt(() => {
      const cut = computeCutting({
        material: 'płytę GK',
        sheetUnit: 'płyt',
        sheet: { width: rules.boardWidth, length: bl },
        stripWidth: rules.boardWidth,
        segments: ceil.boardSegments,
        minPieceLength: params.minPiece.value ?? 0,
        jointOverlap: 0,
      })
      const v = cut.A
      if (!v) throw new Error('pas płyty nie mieści się w płycie — sprawdź szerokość płyty GK')
      quantity = {
        value: v.sheets,
        unit: 'szt',
        trace: [
          ...ceil.rooms.flatMap((r) => r.trace.filter((t) => t.label.includes('rzędy płyt') || t.label.includes('wymiary'))),
          { label: 'Płyty GK', formula: 'rzędy × dł. pomieszczenia z płyt handlowych; resztki ≥ min. kawałka na kolejne rzędy', values: `${ceil.boardSegments.length} rzędów, płyta ${fmt(rules.boardWidth)} × ${fmt(bl)} m`, result: v.sheets, unit: 'szt' },
          { label: 'Kontrolnie z powierzchni', formula: 'A / pole płyty', values: `${fmt(ceil.area.value)} / ${fmt(rules.boardWidth * bl)}`, result: clean(ceil.area.value / (rules.boardWidth * bl)), unit: 'szt', note: 'ostatni rząd w pomieszczeniu docinany wzdłuż — reszta pasa to odpad' },
        ],
      }
    }, missing)
    out.push(b.item({ id, category: C1, kind: 'material', name: 'Płyty GK 12,5 mm', unit: 'szt', params, missing, quantity, note: 'przykręcane tylko do profili nośnych CD60 — nigdy do UD27 (dylatacja na obwodzie)' }))
  }
  out.push(consumptionItem(b, 'ssz-sufit-wkrety-gk', C1, 'Wkręty do GK', ceil.area, roomsNote, { unit: 'szt', rate: { label: 'Wkrętów na m²', unit: 'szt/m²', value: null } }))
  out.push(consumptionItem(b, 'ssz-sufit-tasma', C1, 'Taśma do spoin GK', ceil.area, roomsNote, { unit: 'mb', rate: { label: 'Taśmy na m² sufitu', unit: 'mb/m²', value: null } }))
  out.push(consumptionItem(b, 'ssz-sufit-masa', C1, 'Masa szpachlowa do spoin', ceil.area, roomsNote, { unit: 'kg', rate: { label: 'Zużycie masy', unit: 'kg/m²', value: null }, pack: { packUnit: 'worek', label: 'Masa w worku', value: null } }))
  out.push(consumptionItem(b, 'ssz-sufit-welna', C1, 'Wełna mineralna na sufit', ceil.area, roomsNote, { unit: 'm2', rate: { label: 'Liczba warstw wełny', unit: 'szt', value: null, note: 'grubość warstwy wg produktu' }, pack: { packUnit: 'paczka', label: 'm² w paczce wełny', value: null } }))
  out.push(consumptionItem(b, 'ssz-sufit-paroizolacja', C1, 'Paroizolacja (folia)', ceil.area, roomsNote, { unit: 'm2', waste: 10, pack: { packUnit: 'rolka', label: 'm² w rolce folii', value: null }, note: 'A × 1,1 (zakłady)' }))
  out.push(consumptionItem(b, 'ssz-sufit-paroizolacja-tasma', C1, 'Taśma do paroizolacji', roomsPerimeter, roomsMissing, { unit: 'mb', pack: { packUnit: 'rolka', label: 'mb taśmy w rolce', value: null } }))

  // ── Elewacja
  const C2 = 'Elewacja — EPS'
  const soffitAbove = b.P('ssz-eps', 'soffitAbove', 'Linia podbitki nad górą wieńca', 0, 'm').value ?? 0
  const facRaw =
    slabTop === null || wallHeightMissing.length
      ? null
      : computeFacade({
          interiorPerimeter: pWew,
          wallThickness: project.wallThickness,
          eps: project.facadeInsulation,
          epsBottom: clean(slabTop - 0.03),
          soffitLevel: clean(ringTop.value + soffitAbove),
          wallOpenings: project.openings.filter((o) => o.wall === 'zewnętrzna'),
        })
  const withRing = (c: Computed | undefined): Computed | null => (c ? { ...c, trace: [...ringTop.trace, ...c.trace] } : null)
  // Szczyty daszków wykończone EPS (jak ściany) — doliczone do EPS elewacji.
  const { roof: roofForEps, missing: roofMissingEps } = roofOf(project)
  const epsDormerIds = project.roof.dormers.filter((d) => d.gableFinish === 'EPS').map((d) => d.id)
  const epsDormers = (roofForEps?.dormers ?? []).filter((d) => epsDormerIds.includes(d.id))
  const epsDormerMissing = [
    ...(epsDormerIds.length && !roofForEps ? roofMissingEps : []),
    ...epsDormers.filter((d) => d.gableArea === null).map((d) => `szerokość ściany szczytu daszku ${d.id}`),
  ]
  const epsDormerArea = clean(epsDormers.reduce((s, d) => s + (d.gableArea ?? 0), 0))
  const wallEps = withRing(facRaw?.netArea)
  const netWithDormers: Computed | null =
    wallEps && epsDormerArea > 0
      ? {
          ...wallEps,
          value: clean(wallEps.value + epsDormerArea),
          trace: [
            ...wallEps.trace,
            { label: 'Szczyty daszków w EPS', formula: 'Σ b_ściany² / 4 · tan β', values: epsDormers.map((d) => `${d.id}: ${fmt(d.gableArea ?? 0)}`).join(' + '), result: epsDormerArea, unit: 'm²' },
            { label: 'EPS razem', formula: 'ściany + szczyty daszków', values: `${fmt(wallEps.value)} + ${fmt(epsDormerArea)}`, result: clean(wallEps.value + epsDormerArea), unit: 'm²' },
          ],
        }
      : wallEps
  const fac = {
    netArea: netWithDormers,
    startRail: facRaw?.startRail ?? null,
    cornerBeads: withRing(facRaw?.cornerBeads),
    apu: facRaw?.apu ?? null,
  }
  const fM = [...floorMissing, ...wallHeightMissing, ...epsDormerMissing]
  out.push(consumptionItem(b, 'ssz-eps', C2, `EPS ${fmt(project.facadeInsulation * 100)} cm — elewacja`, fac.netArea, fM, { unit: 'm2', pack: { packUnit: 'paczka', label: 'm² w paczce EPS', value: null } }))
  out.push(consumptionItem(b, 'ssz-eps-klej', C2, 'Klej do EPS', fac.netArea, fM, { unit: 'kg', rate: { label: 'Zużycie kleju do EPS', unit: 'kg/m²', value: null }, pack: { packUnit: 'worek', label: 'Klej w worku', value: null } }))
  out.push(consumptionItem(b, 'ssz-eps-klej-siatka', C2, 'Klej do zatapiania siatki', fac.netArea, fM, { unit: 'kg', rate: { label: 'Zużycie kleju do siatki', unit: 'kg/m²', value: null }, pack: { packUnit: 'worek', label: 'Klej w worku', value: null } }))
  out.push(consumptionItem(b, 'ssz-eps-siatka', C2, 'Siatka elewacyjna', fac.netArea, fM, { unit: 'm2', waste: 10, pack: { packUnit: 'rolka', label: 'm² w rolce siatki', value: null } }))
  out.push(consumptionItem(b, 'ssz-eps-kolki', C2, 'Kołki do EPS 20 cm', fac.netArea, fM, { unit: 'szt', rate: { label: 'Kołków na m²', unit: 'szt/m²', value: null }, pack: { packUnit: 'paczka', label: 'Kołków w paczce', value: null } }))
  out.push(consumptionItem(b, 'ssz-eps-grunt', C2, 'Grunt pod tynk', fac.netArea, fM, { unit: 'kg', rate: { label: 'Zużycie gruntu', unit: 'kg/m²', value: null }, pack: { packUnit: 'wiadro', label: 'Grunt w wiadrze', value: null } }))
  out.push(consumptionItem(b, 'ssz-eps-tynk', C2, 'Tynk cienkowarstwowy', fac.netArea, fM, { unit: 'kg', rate: { label: 'Zużycie tynku', unit: 'kg/m²', value: null }, pack: { packUnit: 'wiadro', label: 'Tynk w wiadrze', value: null } }))
  out.push(consumptionItem(b, 'ssz-eps-listwa-startowa', C2, 'Listwa startowa', fac.startRail, fM, { unit: 'mb' }))
  out.push(consumptionItem(b, 'ssz-eps-narozniki', C2, 'Narożniki z siatką (naroża + ościeża)', fac.cornerBeads, fM, { unit: 'mb' }))
  out.push(consumptionItem(b, 'ssz-eps-apu', C2, 'Listwy APU (obwody okien i drzwi)', fac.apu, fM, { unit: 'mb' }))
  out.push(consumptionItem(b, 'ssz-eps-oscieza', C2, 'Ościeża — XPS/EPS cienki', fac.apu, fM, { unit: 'm2', rate: { label: 'Głębokość ościeża', unit: 'm', value: null } }))

  // ── Szczyty i podbitka
  const C3 = 'Elewacja — szczyty i podbitka'
  const { roof, missing: roofMissing } = roofOf(project)
  const dormerInput = (id: string) => project.roof.dormers.find((x) => x.id === id)
  const boazeriaDormers = roof ? roof.dormers.filter((d) => dormerInput(d.id)?.gableFinish === 'boazeria') : []
  const dormerGableMissing = boazeriaDormers.filter((d) => d.gableArea === null).map((d) => `szerokość ściany szczytu daszku ${d.id}`)
  const gf = roof
    ? gableFacade({
        interiorSpan: gableSpanInterior(project),
        wallThickness: project.wallThickness,
        pitchDeg: project.roof.pitchDeg!,
        insulated: project.gables.insulated,
        woolThickness: project.gables.woolThickness,
        gableOpenings: project.openings.filter((o) => o.wall === 'szczyt'),
        dormers: boazeriaDormers.filter((d) => d.gableArea !== null).map((d) => ({ id: d.id, area: d.gableArea!, insulated: dormerInput(d.id)?.gableInsulation === true })),
      })
    : null
  /** Boazeria, łaty, wkręty, impregnat — wszystkie szczyty w boazerii. */
  const gable: Computed | null = gf?.cladding ?? null
  /** Wełna, łączniki, wsporniki, membrana — tylko szczyty ocieplone. */
  const woolArea: Computed | null = gf?.wool ?? null
  const noWool = gf !== null && gf.wool.value <= 0
  const woolNote = noWool ? 'brak ocieplonych szczytów — włącz ocieplenie szczytów w danych projektu lub przy daszku' : undefined
  const gM = [...roofMissing, ...dormerGableMissing]
  const sp = (id: string, key: string, label: string) => b.P(id, key, label, null, 'm')
  {
    const id = 'ssz-szczyt-wsporniki'
    const params = { sx: sp(id, 'sx', 'Rozstaw wsporników poziomo'), sy: sp(id, 'sy', 'Rozstaw wsporników pionowo') }
    const missing = [...gM]
    const sx = need(params, 'sx', missing)
    const sy = need(params, 'sy', missing)
    let quantity: Computed | null = null
    if (woolArea && sx !== null && sy !== null) {
      const w = computed('Wsporniki', '⌈A_wełny / (s_x × s_y)⌉', `⌈${fmt(woolArea.value)} / (${fmt(sx)} × ${fmt(sy)})⌉`, ceilSafe(woolArea.value / (sx * sy)), 'szt')
      quantity = { ...w, trace: [...woolArea.trace, ...w.trace] }
    }
    out.push(b.item({ id, category: C3, kind: 'material', name: 'Wsporniki elewacyjne (szczyty ocieplone)', unit: 'szt', params, missing, quantity, ...(noWool ? { enabled: false, note: woolNote } : {}) }))
  }
  const woolOpts = noWool ? { enabled: false, note: woolNote } : {}
  const woolCm = fmt(project.gables.woolThickness * 100, 1)
  out.push(consumptionItem(b, 'ssz-szczyt-welna', C3, `Wełna skalna fasadowa ${woolCm} cm (szczyty)`, woolArea, gM, { unit: 'm2', pack: { packUnit: 'paczka', label: 'm² w paczce wełny', value: null }, ...woolOpts }))
  out.push(consumptionItem(b, 'ssz-szczyt-laczniki', C3, 'Łączniki talerzykowe do wełny', woolArea, gM, { unit: 'szt', rate: { label: 'Łączników na m²', unit: 'szt/m²', value: null }, ...woolOpts }))
  out.push(consumptionItem(b, 'ssz-szczyt-membrana', C3, 'Membrana wiatroizolacyjna fasadowa (UV) — na wełnę', woolArea, gM, { unit: 'm2', waste: 10, pack: { packUnit: 'rolka', label: 'm² w rolce membrany', value: null }, ...woolOpts }))
  out.push(consumptionItem(b, 'ssz-szczyt-laty-pionowe', C3, 'Łaty pionowe nośne', gable, gM, { unit: 'mb', rate: { label: 'mb łat na m² (1 / rozstaw)', unit: 'mb/m²', value: null } }))
  out.push(consumptionItem(b, 'ssz-szczyt-laty-poziome', C3, 'Łaty poziome pod boazerię', gable, gM, { unit: 'mb', rate: { label: 'mb łat na m² (1 / rozstaw)', unit: 'mb/m²', value: null } }))
  out.push(consumptionItem(b, 'ssz-szczyt-boazeria', C3, 'Boazeria — deska elewacyjna pionowa', gable, gM, { unit: 'm2', waste: 10 }))
  out.push(consumptionItem(b, 'ssz-szczyt-wkrety', C3, 'Wkręty nierdzewne do desek', gable, gM, { unit: 'szt', rate: { label: 'Wkrętów na m²', unit: 'szt/m²', value: null } }))
  out.push(
    consumptionItem(
      b,
      'ssz-szczyt-siatka-owady',
      C3,
      'Siatka przeciw owadom (góra/dół szczytów)',
      roof ? computed('Siatka przeciw owadom', '2 × (B_z + 2 × (B_z/2) / cos α)', `2 × (${fmt(roof.span)} + ${fmt(roof.span)} / cos ${fmt(project.roof.pitchDeg!)}°)`, 2 * (roof.span + roof.span / Math.cos((project.roof.pitchDeg! * Math.PI) / 180)), 'm') : null,
      roofMissing,
      { unit: 'mb' },
    ),
  )
  out.push(consumptionItem(b, 'ssz-szczyt-okapnik', C3, 'Okapnik / listwa przejścia EPS–drewno', roof ? computed('Okapnik', '2 × B_z', `2 × ${fmt(roof.span)}`, 2 * roof.span, 'm') : null, roofMissing, { unit: 'mb' }))
  out.push(consumptionItem(b, 'ssz-szczyt-impregnat', C3, 'Impregnat / olej do boazerii', gable, gM, { unit: 'l', rate: { label: 'Zużycie impregnatu', unit: 'l/m²', value: null }, pack: { packUnit: 'puszka', label: 'Litrów w puszce', value: null } }))
  const soffit = roof ? soffitArea(roof, project.roof.eaveOverhang!, project.roof.gableOverhang!, project.roof.pitchDeg!) : null
  out.push(consumptionItem(b, 'ssz-podbitka', C3, 'Podbitka — materiał', soffit, roofMissing, { unit: 'm2' }))
  out.push(consumptionItem(b, 'ssz-podbitka-ruszt', C3, 'Podbitka — ruszt', soffit, roofMissing, { unit: 'mb', rate: { label: 'mb rusztu na m²', unit: 'mb/m²', value: null } }))
  {
    const id = 'ssz-podbitka-kratki'
    const params = { qty: b.P(id, 'qty', 'Liczba kratek wentylacyjnych', null, 'szt') }
    const missing: string[] = []
    const v = need(params, 'qty', missing)
    out.push(b.item({ id, category: C3, kind: 'material', name: 'Kratki wentylacyjne podbitki', unit: 'szt', params, missing, quantity: v !== null ? computed('Kratki', 'podaje użytkownik', fmt(v), v, 'szt') : null }))
  }

  // ── Podłoga na gruncie i instalacje
  const C4 = 'Podłoga na gruncie'
  {
    const id = 'ssz-folia-pe'
    const params = { upturn: b.P(id, 'upturn', 'Wywinięcie folii na ściany', null, 'm') }
    const missing: string[] = []
    const u = need(params, 'upturn', missing)
    out.push(
      b.item({
        id,
        category: C4,
        kind: 'material',
        name: 'Folia PE pod styropian',
        unit: 'm2',
        params,
        missing,
        quantity: u !== null ? computed('Folia PE', 'A_wew × 1,15 + obwody × wywinięcie', `${fmt(aWew.value)} × 1,15 + ${fmt(roomsPerimeter.value)} × ${fmt(u)}`, aWew.value * 1.15 + roomsPerimeter.value * u, 'm²') : null,
      }),
    )
  }
  out.push(consumptionItem(b, 'ssz-eps-podlogowy', C4, 'EPS podłogowy 3 × 5 cm', aWew, [], { unit: 'm2', rate: { label: 'Liczba warstw EPS', unit: 'szt', value: 3 }, pack: { packUnit: 'paczka', label: 'm² w paczce EPS', value: null } }))
  out.push(consumptionItem(b, 'ssz-mata-podlogowka', C4, 'Mata/folia systemowa do podłogówki', aWew, [], { unit: 'm2', waste: 5, pack: { packUnit: 'rolka', label: 'm² w rolce maty', value: null } }))
  out.push(consumptionItem(b, 'ssz-tasma-dylatacyjna', C4, 'Taśma dylatacyjna przyścienna', roomsPerimeter, roomsMissing, { unit: 'mb', pack: { packUnit: 'rolka', label: 'mb w rolce taśmy', value: null } }))

  const C5 = 'Instalacje'
  {
    const id = 'ssz-pex'
    // Wg użytkownika: ilość rury (mb) wpisuje użytkownik w wierszu, cena za mb (bez zwojów).
    const params = { mb: b.P(id, 'mb', 'Rura PEX 16 — ile metrów', null, 'mb', `kontrolnie A_wew × 6,7 = ${fmt(clean(aWew.value * 6.7))} m (rozstaw 15 cm)`) }
    const missing: string[] = []
    const v = need(params, 'mb', missing)
    const spec = b.item({
      id,
      category: C5,
      kind: 'material',
      name: 'Rura PEX 16 do podłogówki',
      unit: 'mb',
      params,
      missing,
      quantity: v !== null ? { value: v, unit: 'm', trace: [{ label: 'Rura PEX', formula: 'podaje użytkownik', values: fmt(v), result: v, unit: 'm' }, { label: 'Kontrolnie (rozstaw 15 cm)', formula: 'A_wew × 6,7 mb/m²', values: `${fmt(aWew.value)} × 6,7`, result: clean(aWew.value * 6.7), unit: 'm' }] } : null,
      note: `Wpisz, ile metrów rury potrzebujesz (z projektu instalacji), i cenę za mb. Kontrolnie: ${fmt(clean(aWew.value * 6.7))} m przy rozstawie 15 cm.`,
    })
    out.push({ ...spec, manualQty: { key: 'mb', allowLumpSum: false, lumpSum: false } })
    const pexBase = v !== null ? computed('Rura PEX', 'podaje użytkownik', fmt(v), v, 'm') : null
    out.push(consumptionItem(b, 'ssz-spinki', C5, 'Spinki do rur', pexBase, missing, { unit: 'szt', rate: { label: 'Spinek na mb rury', unit: 'szt/mb', value: null } }))
  }
  out.push(lumpItem(b, 'ssz-rozdzielacz-podlogowki', C5, 'Rozdzielacz podłogówki 11 obwodów + szafka'))
  {
    const id = 'ssz-zlaczki-podlogowki'
    const params = { circuits: b.P(id, 'circuits', 'Liczba obwodów', 11, 'szt'), per: b.P(id, 'per', 'Złączek na obwód', 2, 'szt') }
    const missing: string[] = []
    const n = need(params, 'circuits', missing)
    const k = need(params, 'per', missing)
    out.push(b.item({ id, category: C5, kind: 'material', name: 'Złączki do rozdzielacza', unit: 'szt', params, missing, quantity: n !== null && k !== null ? computed('Złączki', 'obwody × na obwód', `${fmt(n)} × ${fmt(k)}`, n * k, 'szt') : null }))
  }
  out.push(lumpItem(b, 'ssz-rozdzielacz-wody', C5, 'Rozdzielacz wody użytkowej'))
  out.push(lumpItem(b, 'ssz-wod-kan', C5, 'Rury i kształtki wod-kan'))
  for (const [id, name, def] of [
    ['ssz-ydyp-25', 'Przewód YDYp 3 × 2,5', 600],
    ['ssz-ydyp-15', 'Przewód YDYp 3 × 1,5', 400],
  ] as const) {
    const params = { mb: b.P(id, 'mb', `${name} — długość`, def, 'm'), drum: b.P(id, 'drum', 'Metrów w bębnie', 100, 'm') }
    const missing: string[] = []
    const v = need(params, 'mb', missing)
    out.push(
      b.item({
        id,
        category: C5,
        kind: 'material',
        name,
        unit: 'mb',
        params,
        missing,
        quantity: v !== null ? computed(name, 'podaje użytkownik (domyślnie)', fmt(v), v, 'm') : null,
        packaging: { packUnit: 'bęben', perPack: params.drum.value, packLabel: `bęben ${fmt(params.drum.value ?? 0)} m` },
        priceBasis: 'perPack',
      }),
    )
  }
  out.push(lumpItem(b, 'ssz-puszki-peszle', C5, 'Puszki, peszle, osprzęt elektryczny'))
  out.push(lumpItem(b, 'ssz-rozdzielnica', C5, 'Rozdzielnica elektryczna z zabezpieczeniami'))
  out.push(lumpItem(b, 'ssz-rekuperacja', C5, 'Wentylacja / rekuperacja', false))
  return out
}
