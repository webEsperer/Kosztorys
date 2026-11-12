// SSZ — sufit podwieszany GK z ociepleniem, elewacja (EPS, szczyty, podbitka), podłoga na gruncie i instalacje.

import type { ProjectInput } from '../../model/project'
import { computeCeiling } from '../ceiling'
import { computeFacade, gablesArea, soffitArea } from '../facade'
import { type ItemKind, type ItemSpec, type PackUnit, type Unit, UNIT_LABEL, need } from '../items'
import { floorBuildUp } from '../levels'
import { type Computed, ceilSafe, clean, fmt } from '../trace'
import { type Builder, computed, lumpItem, projectBase } from './common'
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
  const { geo, aWew } = projectBase(project)
  const pWew = geo.interiorPerimeter.value
  const L = project.footprint.length
  const B = project.footprint.width
  const partLen = project.partitions.length

  // Obwody pomieszczeń: P_wew + 2 × ściany działowe (obie strony)
  const roomsPerimeter: Computed = partLen !== null
    ? computed('Obwody pomieszczeń', 'P_wew + 2 × mb ścian działowych', `${fmt(pWew)} + 2 × ${fmt(partLen)}`, pWew + 2 * partLen, 'm')
    : computed('Obwody pomieszczeń', 'P_wew (bez ścian działowych — nie podano)', fmt(pWew), pWew, 'm')
  const roomsMissing = partLen === null ? ['długość ścian działowych (obwody pomieszczeń)'] : []

  // ── Sufit podwieszany GK + ocieplenie
  const C1 = 'Sufit podwieszany GK + ocieplenie'
  const ms = b.P('ssz-sufit-cd-glowne', 'spacing', 'Rozstaw profili głównych', 1.0, 'm')
  const cs = b.P('ssz-sufit-cd-nosne', 'spacing', 'Rozstaw profili nośnych', 0.5, 'm')
  const ceil = computeCeiling({ length: L, width: B, mainSpacing: ms.value ?? 1, carrierSpacing: cs.value ?? 0.5 })
  const plParam = (id: string) => b.P(id, 'profileLength', 'Długość profilu CD60', null, 'm', '3 m lub 4 m')
  for (const [id, name, mb, sp] of [
    ['ssz-sufit-cd-glowne', 'Profile CD60 główne', ceil.mainMb, ms],
    ['ssz-sufit-cd-nosne', 'Profile CD60 nośne', ceil.carrierMb, cs],
  ] as const) {
    const params = { spacing: sp, profileLength: plParam(id) }
    const missing: string[] = []
    const pl = need(params, 'profileLength', missing)
    out.push(b.item({ id, category: C1, kind: 'material', name, unit: 'szt', params, missing, quantity: pl !== null ? { ...ceil.profiles(mb.value, pl, name), trace: [...ceil.area.trace, ...mb.trace, ...ceil.profiles(mb.value, pl, name).trace] } : null }))
  }
  out.push(consumptionItem(b, 'ssz-sufit-ud30', C1, 'Profile UD30 (obwody pomieszczeń)', roomsPerimeter, roomsMissing, { unit: 'mb' }))
  out.push(b.item({ id: 'ssz-sufit-wieszaki', category: C1, kind: 'material', name: 'Wieszaki (noniusz/ES)', unit: 'szt', quantity: ceil.hangers }))
  out.push(b.item({ id: 'ssz-sufit-laczniki-krzyzowe', category: C1, kind: 'material', name: 'Łączniki krzyżowe', unit: 'szt', quantity: ceil.crossConnectors }))
  {
    const id = 'ssz-sufit-laczniki-wzdluzne'
    const pl = b.P('ssz-sufit-cd-glowne', 'profileLength', 'Długość profilu CD60', null, 'm')
    out.push(b.item({ id, category: C1, kind: 'material', name: 'Łączniki wzdłużne CD60', unit: 'szt', missing: pl.value === null ? [pl.label] : [], quantity: pl.value !== null ? ceil.lengthConnectors(pl.value) : null }))
  }
  out.push(b.item({ id: 'ssz-sufit-gk', category: C1, kind: 'material', name: 'Płyty GK 120 × 260 cm', unit: 'm2', quantity: ceil.area, wastePercent: 10, packaging: { packUnit: 'płyta', perPack: 3.12, packLabel: 'płyta = 3,12 m²' }, priceBasis: 'perPack' }))
  out.push(consumptionItem(b, 'ssz-sufit-wkrety-gk', C1, 'Wkręty do GK', ceil.area, [], { unit: 'szt', rate: { label: 'Wkrętów na m²', unit: 'szt/m²', value: null } }))
  out.push(consumptionItem(b, 'ssz-sufit-kolki-ud', C1, 'Kołki do UD30', roomsPerimeter, roomsMissing, { unit: 'szt', rate: { label: 'Kołków na mb UD30', unit: 'szt/mb', value: null } }))
  out.push(consumptionItem(b, 'ssz-sufit-tasma', C1, 'Taśma do spoin GK', ceil.area, [], { unit: 'mb', rate: { label: 'Taśmy na m² sufitu', unit: 'mb/m²', value: null } }))
  out.push(consumptionItem(b, 'ssz-sufit-masa', C1, 'Masa szpachlowa do spoin', ceil.area, [], { unit: 'kg', rate: { label: 'Zużycie masy', unit: 'kg/m²', value: null }, pack: { packUnit: 'worek', label: 'Masa w worku', value: null } }))
  out.push(consumptionItem(b, 'ssz-sufit-welna', C1, 'Wełna mineralna na sufit', ceil.area, [], { unit: 'm2', rate: { label: 'Liczba warstw wełny', unit: 'szt', value: null, note: 'grubość warstwy wg produktu' }, pack: { packUnit: 'paczka', label: 'm² w paczce wełny', value: null } }))
  out.push(consumptionItem(b, 'ssz-sufit-paroizolacja', C1, 'Paroizolacja (folia)', ceil.area, [], { unit: 'm2', waste: 10, pack: { packUnit: 'rolka', label: 'm² w rolce folii', value: null }, note: 'A × 1,1 (zakłady)' }))
  out.push(consumptionItem(b, 'ssz-sufit-paroizolacja-tasma', C1, 'Taśma do paroizolacji', roomsPerimeter, roomsMissing, { unit: 'mb', pack: { packUnit: 'rolka', label: 'mb taśmy w rolce', value: null } }))

  // ── Elewacja
  const C2 = 'Elewacja — EPS'
  const slabTop = clean(-floorBuildUp(project.floorLayers).value)
  const fac = computeFacade({
    interiorPerimeter: pWew,
    wallThickness: project.wallThickness,
    eps: project.facadeInsulation,
    epsBottom: clean(slabTop - 0.03),
    soffitLevel: clean(project.wallRingBeamTop + (b.P('ssz-eps', 'soffitAbove', 'Linia podbitki nad górą wieńca', 0, 'm').value ?? 0)),
    wallOpenings: project.openings.filter((o) => o.wall === 'zewnętrzna'),
  })
  out.push(consumptionItem(b, 'ssz-eps', C2, `EPS ${fmt(project.facadeInsulation * 100)} cm — elewacja`, fac.netArea, [], { unit: 'm2', pack: { packUnit: 'paczka', label: 'm² w paczce EPS', value: null } }))
  out.push(consumptionItem(b, 'ssz-eps-klej', C2, 'Klej do EPS', fac.netArea, [], { unit: 'kg', rate: { label: 'Zużycie kleju do EPS', unit: 'kg/m²', value: null }, pack: { packUnit: 'worek', label: 'Klej w worku', value: null } }))
  out.push(consumptionItem(b, 'ssz-eps-klej-siatka', C2, 'Klej do zatapiania siatki', fac.netArea, [], { unit: 'kg', rate: { label: 'Zużycie kleju do siatki', unit: 'kg/m²', value: null }, pack: { packUnit: 'worek', label: 'Klej w worku', value: null } }))
  out.push(consumptionItem(b, 'ssz-eps-siatka', C2, 'Siatka elewacyjna', fac.netArea, [], { unit: 'm2', waste: 10, pack: { packUnit: 'rolka', label: 'm² w rolce siatki', value: null } }))
  out.push(consumptionItem(b, 'ssz-eps-kolki', C2, 'Kołki do EPS 20 cm', fac.netArea, [], { unit: 'szt', rate: { label: 'Kołków na m²', unit: 'szt/m²', value: null }, pack: { packUnit: 'paczka', label: 'Kołków w paczce', value: null } }))
  out.push(consumptionItem(b, 'ssz-eps-grunt', C2, 'Grunt pod tynk', fac.netArea, [], { unit: 'kg', rate: { label: 'Zużycie gruntu', unit: 'kg/m²', value: null }, pack: { packUnit: 'wiadro', label: 'Grunt w wiadrze', value: null } }))
  out.push(consumptionItem(b, 'ssz-eps-tynk', C2, 'Tynk cienkowarstwowy', fac.netArea, [], { unit: 'kg', rate: { label: 'Zużycie tynku', unit: 'kg/m²', value: null }, pack: { packUnit: 'wiadro', label: 'Tynk w wiadrze', value: null } }))
  out.push(consumptionItem(b, 'ssz-eps-listwa-startowa', C2, 'Listwa startowa', fac.startRail, [], { unit: 'mb' }))
  out.push(consumptionItem(b, 'ssz-eps-narozniki', C2, 'Narożniki z siatką (naroża + ościeża)', fac.cornerBeads, [], { unit: 'mb' }))
  out.push(consumptionItem(b, 'ssz-eps-apu', C2, 'Listwy APU (obwody okien i drzwi)', fac.apu, [], { unit: 'mb' }))
  out.push(consumptionItem(b, 'ssz-eps-oscieza', C2, 'Ościeża — XPS/EPS cienki', fac.apu, [], { unit: 'm2', rate: { label: 'Głębokość ościeża', unit: 'm', value: null } }))

  // ── Szczyty i podbitka
  const C3 = 'Elewacja — szczyty i podbitka'
  const { roof, missing: roofMissing } = roofOf(project)
  const boazeriaDormers = roof ? roof.dormers.filter((d) => project.roof.dormers.find((x) => x.id === d.id)?.gableFinish === 'boazeria') : []
  const dormerGableMissing = boazeriaDormers.filter((d) => d.gableArea === null).map((d) => `szerokość ściany szczytu daszku ${d.id}`)
  const gable: Computed | null = roof
    ? (() => {
        const g = gablesArea(roof.span, project.roof.pitchDeg!, project.openings.filter((o) => o.wall === 'szczyt'))
        const extra = clean(boazeriaDormers.reduce((s, d) => s + (d.gableArea ?? 0), 0))
        return extra > 0 ? { ...g, value: clean(g.value + extra), trace: [...g.trace, { label: 'Szczyty daszków (boazeria)', formula: 'Σ b_ściany² / 4 · tan β', values: fmt(extra), result: extra, unit: 'm²' }] } : g
      })()
    : null
  const gM = [...roofMissing, ...dormerGableMissing]
  const sp = (id: string, key: string, label: string) => b.P(id, key, label, null, 'm')
  {
    const id = 'ssz-szczyt-wsporniki'
    const params = { sx: sp(id, 'sx', 'Rozstaw wsporników poziomo'), sy: sp(id, 'sy', 'Rozstaw wsporników pionowo') }
    const missing = [...gM]
    const sx = need(params, 'sx', missing)
    const sy = need(params, 'sy', missing)
    let quantity: Computed | null = null
    if (gable && sx !== null && sy !== null) {
      const w = computed('Wsporniki', '⌈A / (s_x × s_y)⌉', `⌈${fmt(gable.value)} / (${fmt(sx)} × ${fmt(sy)})⌉`, ceilSafe(gable.value / (sx * sy)), 'szt')
      quantity = { ...w, trace: [...gable.trace, ...w.trace] }
    }
    out.push(b.item({ id, category: C3, kind: 'material', name: 'Wsporniki elewacyjne (szczyty)', unit: 'szt', params, missing, quantity }))
  }
  out.push(consumptionItem(b, 'ssz-szczyt-welna', C3, 'Wełna skalna fasadowa (szczyty)', gable, gM, { unit: 'm2', pack: { packUnit: 'paczka', label: 'm² w paczce wełny', value: null } }))
  out.push(consumptionItem(b, 'ssz-szczyt-laczniki', C3, 'Łączniki talerzykowe do wełny', gable, gM, { unit: 'szt', rate: { label: 'Łączników na m²', unit: 'szt/m²', value: null } }))
  out.push(consumptionItem(b, 'ssz-szczyt-membrana', C3, 'Membrana wiatroizolacyjna fasadowa (UV)', gable, gM, { unit: 'm2', waste: 10, pack: { packUnit: 'rolka', label: 'm² w rolce membrany', value: null } }))
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
    const params = { mb: b.P(id, 'mb', 'Rura PEX 16 — długość', 800, 'm', `kontrolnie A_wew × 6,7 = ${fmt(clean(aWew.value * 6.7))} m (rozstaw 15 cm)`) }
    const missing: string[] = []
    const v = need(params, 'mb', missing)
    const pack = b.P(id, 'coil', 'Metrów w zwoju', 200, 'm')
    out.push(
      b.item({
        id,
        category: C5,
        kind: 'material',
        name: 'Rura PEX 16 do podłogówki',
        unit: 'mb',
        params: { ...params, coil: pack },
        missing,
        quantity: v !== null ? { value: v, unit: 'm', trace: [{ label: 'Rura PEX', formula: 'podaje użytkownik', values: fmt(v), result: v, unit: 'm' }, { label: 'Kontrolnie', formula: 'A_wew × 6,7 mb/m²', values: `${fmt(aWew.value)} × 6,7`, result: clean(aWew.value * 6.7), unit: 'm' }] } : null,
        packaging: { packUnit: 'szt', perPack: pack.value, packLabel: `zwój ${fmt(pack.value ?? 0)} m` },
        priceBasis: 'perPack',
      }),
    )
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
