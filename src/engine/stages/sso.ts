// SSO — stan surowy otwarty: pozycje domyślne (CLAUDE.md, sekcja „SSO”).
// Każda pozycja: ilość z trace albo lista braków („uzupełnij”). Ceny — osobno (project.prices).

import type { ProjectInput } from '../../model/project'
import { linearElementVolume, slabVolume } from '../concrete'
import { computeCutting, DEFAULT_MIN_PIECE, DEFAULT_FELT_OVERLAP, formworkSegmentsRect } from '../cutting'
import { footingFacePerimeters, GEOMETRY_REFS } from '../geometry'
import { type ItemCutting, type ItemSpec, need } from '../items'
import type { LevelsResult } from '../levels'
import { computeRebarElement, defaultFootingRebar, defaultRingBeamRebar } from '../rebar'
import { type Computed, ceilSafe, clean, fmt } from '../trace'
import { applyTimber, attempt, computed, feltRolls, lumpItem, makeBuilder, manualItem, pourItems, projectBase, rebarItems } from './common'

// ─── SSO ────────────────────────────────────────────────────────────────────

export interface SSOContext {
  levels: LevelsResult | null
  levelsMissing: string[]
}

export function buildSSO(project: ProjectInput): { items: ItemSpec[]; context: SSOContext } {
  const b = makeBuilder(project)
  const { P, item } = b
  const f = project.foundation
  const items: ItemSpec[] = []
  // Geometria i poziomy (poziomy fundamentu wymagają danych bloczka)
  const { pOs, aWew, axis, sides, levels, levelsMissing } = projectBase(project)
  const fl = levels?.foundation.value ?? null

  // ── Roboty ziemne i sprzęt
  const C0 = 'Roboty ziemne i sprzęt'
  items.push(manualItem(b, 'sso-koparka-wykop', C0, 'equipment', 'Praca koparki — wykop', 'h', 'Godziny pracy koparki (wykop)'))
  items.push(manualItem(b, 'sso-koparka-zasyp', C0, 'equipment', 'Praca koparki — zasypanie', 'h', 'Godziny pracy koparki (zasypanie)'))
  items.push(manualItem(b, 'sso-zageszczarka', C0, 'equipment', 'Wynajem zagęszczarki', 'doba', 'Liczba dób wynajmu zagęszczarki'))
  items.push(lumpItem(b, 'sso-wywoz-ziemi', C0, 'Wywóz nadmiaru ziemi', false))

  // ── Ławy fundamentowe
  const C1 = 'Ławy fundamentowe'
  const footMissing: string[] = []
  if (f.footingWidth === null) footMissing.push('szerokość ławy')
  if (f.footingHeight === null) footMissing.push('wysokość ławy')
  const fb = f.footingWidth
  const fh = f.footingHeight
  const footVol = fb !== null && fh !== null ? linearElementVolume('ławy', pOs.value, fb, fh) : null
  items.push(...pourItems(b, 'sso-lawy', C1, 'ławy fundamentowe', footVol, footMissing, project.concrete.footing))

  {
    const id = 'sso-lawy-deski'
    const params = {
      boardWidth: P(id, 'boardWidth', 'Szerokość deski', 0.12, 'm', 'jedna warstwa deski 12 cm (górne 12 cm ławy w szalunku) — wg użytkownika'),
      boardThickness: P(id, 'boardThickness', 'Grubość deski', 0.025, 'm'),
      boardLength: P(id, 'boardLength', 'Długość handlowa deski', 2, 'm', 'wg użytkownika: deski 2 m'),
    }
    const missing = [...footMissing]
    const bw = need(params, 'boardWidth', missing)
    const bt = need(params, 'boardThickness', missing)
    const bl = need(params, 'boardLength', missing)
    let quantity: Computed | null = null
    if (fb !== null && bw !== null && bt !== null && bl !== null) {
      const faces = footingFacePerimeters(pOs.value, fb)
      const total = clean(faces.value.outer + faces.value.inner)
      const rows = ceilSafe(f.footingFormworkHeight / bw)
      const perRow = ceilSafe(total / bl)
      const pcs = rows * perRow
      const m3 = clean(pcs * bl * bw * bt)
      quantity = {
        value: pcs,
        unit: 'szt',
        trace: [
          ...faces.trace,
          { label: 'Długość szalunku (obie strony)', formula: '(P_oś + 4b) + (P_oś − 4b)', values: `${fmt(faces.value.outer)} + ${fmt(faces.value.inner)}`, result: total, unit: 'm' },
          { label: 'Rzędy desek', formula: '⌈h_szal / szer. deski⌉', values: `⌈${fmt(f.footingFormworkHeight)} / ${fmt(bw)}⌉`, result: rows, unit: '' },
          { label: 'Deski', formula: 'rzędy × ⌈L / dł. deski⌉', values: `${rows} × ⌈${fmt(total)} / ${fmt(bl)}⌉`, result: pcs, unit: 'szt' },
          { label: 'Deski — informacyjnie', formula: 'szt × dł. ; szt × dł. × szer. × gr.', values: `${fmt(pcs * bl)} mb; ${fmt(pcs)} × ${fmt(bl)} × ${fmt(bw)} × ${fmt(bt)}`, result: m3, unit: 'm³' },
        ],
      }
    }
    items.push(item({ id, category: C1, kind: 'material', name: 'Deski szalunkowe ław (zewn. i wewn. obwód)', unit: 'szt', params, missing, quantity }))
  }
  // Paliki zabezpieczające: co 1 m po 2 szt. (para) na obwodzie zewnętrznym i wewnętrznym ław;
  // każda para spięta deseczką 40 × 12 × 2,5 cm (wg użytkownika).
  const stakeParams = {
    spacing: P('sso-lawy-paliki', 'spacing', 'Rozstaw par palików', 1.0, 'm'),
    perPoint: P('sso-lawy-paliki', 'perPoint', 'Palików w punkcie (para)', 2, 'szt'),
    stakeLength: P('sso-lawy-paliki', 'stakeLength', 'Długość palika', 0.5, 'm'),
    stakeWidth: P('sso-lawy-paliki', 'stakeWidth', 'Szerokość palika', 0.05, 'm'),
  }
  const stakeMissing = [...footMissing]
  const stSp = need(stakeParams, 'spacing', stakeMissing)
  const stPer = need(stakeParams, 'perPoint', stakeMissing)
  const stLen = stakeParams.stakeLength.value
  const stW = stakeParams.stakeWidth.value
  const stakePoints: Computed | null =
    fb !== null && stSp !== null
      ? (() => {
          const faces = footingFacePerimeters(pOs.value, fb)
          const no = ceilSafe(clean(faces.value.outer / stSp))
          const ni = ceilSafe(clean(faces.value.inner / stSp))
          return {
            value: no + ni,
            unit: 'szt',
            trace: [
              ...faces.trace,
              { label: 'Punkty (pary palików) — obwód zewnętrzny', formula: '⌈P_zew. ławy / rozstaw⌉', values: `⌈${fmt(faces.value.outer)} / ${fmt(stSp)}⌉`, result: no, unit: 'szt' },
              { label: 'Punkty (pary palików) — obwód wewnętrzny', formula: '⌈P_wew. ławy / rozstaw⌉', values: `⌈${fmt(faces.value.inner)} / ${fmt(stSp)}⌉`, result: ni, unit: 'szt' },
              { label: 'Punkty razem', formula: 'zewn. + wewn.', values: `${no} + ${ni}`, result: no + ni, unit: 'szt' },
            ],
          }
        })()
      : null
  {
    const quantity: Computed | null =
      stakePoints && stPer !== null
        ? {
            value: stakePoints.value * stPer,
            unit: 'szt',
            trace: [
              ...stakePoints.trace,
              { label: 'Paliki', formula: 'punkty × palików w punkcie', values: `${stakePoints.value} × ${stPer}`, result: stakePoints.value * stPer, unit: 'szt' },
              ...(stLen !== null
                ? [{ label: 'Paliki — informacyjnie', formula: 'szt × długość', values: `${stakePoints.value * stPer} × ${fmt(stLen)}${stW !== null ? ` (palik ${fmt(stW * 100, 1)} cm szer.)` : ''}`, result: clean(stakePoints.value * stPer * stLen), unit: 'mb' }]
                : []),
            ],
          }
        : null
    items.push(item({ id: 'sso-lawy-paliki', category: C1, kind: 'material', name: 'Paliki zabezpieczające szalunek ław (50 cm)', unit: 'szt', params: stakeParams, missing: stakeMissing, quantity }))
  }
  {
    const id = 'sso-lawy-deseczki'
    const params = {
      perPoint: P(id, 'perPoint', 'Deseczek na parę palików', 1, 'szt'),
      cleatLength: P(id, 'cleatLength', 'Długość deseczki', 0.4, 'm', 'deseczka 40 × 12 × 2,5 cm'),
      boardLength: P(id, 'boardLength', 'Docinane z deski o długości', 2, 'm', 'ta sama deska 12 × 2,5 cm co szalunek'),
    }
    const missing = [...stakeMissing]
    const per = need(params, 'perPoint', missing)
    const cl = need(params, 'cleatLength', missing)
    const bl = need(params, 'boardLength', missing)
    let quantity: Computed | null = null
    if (stakePoints && per !== null && cl !== null && bl !== null) {
      const n = stakePoints.value * per
      const fromBoard = Math.floor(clean(bl / cl))
      const boards = fromBoard > 0 ? ceilSafe(n / fromBoard) : 0
      quantity = {
        value: boards,
        unit: 'szt',
        trace: [
          ...stakePoints.trace,
          { label: 'Deseczki 40 cm', formula: 'punkty × deseczek na parę', values: `${stakePoints.value} × ${per}`, result: n, unit: 'szt' },
          { label: 'Deseczek z jednej deski', formula: '⌊dł. deski / dł. deseczki⌋', values: `⌊${fmt(bl)} / ${fmt(cl)}⌋`, result: fromBoard, unit: 'szt' },
          { label: 'Deski na deseczki', formula: '⌈deseczki / z jednej deski⌉', values: `⌈${n} / ${fromBoard}⌉`, result: boards, unit: 'szt' },
        ],
      }
    }
    items.push(item({ id, category: C1, kind: 'material', name: 'Deski na deseczki łączące paliki (docinane na 40 cm)', unit: 'szt', params, missing, quantity }))
  }
  const footRebar = fb !== null && fh !== null ? computeRebarElement('ławy', sides, defaultFootingRebar(fb, fh)) : null
  const fp = defaultFootingRebar(1, 1)
  items.push(...rebarItems(b, 'sso-lawy', 'Zbrojenie ław', footRebar, footMissing, fp.massPerMeter, fp.barLength))

  // ── Ściany fundamentowe
  const C2 = 'Ściany fundamentowe'
  const wallArea: Computed | null =
    f.blockHeight !== null && f.jointThickness !== null && f.layers !== null
      ? computed(
          'Powierzchnia muru fundamentowego',
          'P_oś × n × (h_bl + spoina)',
          `${fmt(pOs.value)} × ${f.layers} × (${fmt(f.blockHeight)} + ${fmt(f.jointThickness)})`,
          pOs.value * f.layers * (f.blockHeight + f.jointThickness),
          'm²',
          GEOMETRY_REFS.axisPerimeter,
        )
      : null
  {
    const id = 'sso-sf-bloczki'
    const missing: string[] = []
    if (f.blockLength === null) missing.push('długość bloczka fundamentowego')
    if (f.jointThickness === null) missing.push('grubość spoiny bloczków fundamentowych')
    if (f.layers === null) missing.push('liczba warstw bloczków fundamentowych')
    let quantity: Computed | null = null
    if (f.blockLength !== null && f.jointThickness !== null && f.layers !== null) {
      const perLayer = ceilSafe(pOs.value / (f.blockLength + f.jointThickness))
      quantity = {
        value: f.layers * perLayer,
        unit: 'szt',
        trace: [
          { label: 'Bloczki w warstwie', formula: '⌈P_oś / (dł. bloczka + spoina)⌉', values: `⌈${fmt(pOs.value)} / (${fmt(f.blockLength)} + ${fmt(f.jointThickness)})⌉`, result: perLayer, unit: 'szt', ref: GEOMETRY_REFS.axisPerimeter },
          { label: 'Bloczki fundamentowe', formula: 'n_warstw × bloczki w warstwie', values: `${f.layers} × ${perLayer}`, result: f.layers * perLayer, unit: 'szt' },
        ],
      }
    }
    items.push(item({ id, category: C2, kind: 'material', name: 'Bloczki fundamentowe', unit: 'szt', missing, quantity, wastePercent: 3, note: 'odpad 3% jak w przykładzie H+H z CLAUDE.md — zmień wg potrzeb' }))
  }
  {
    const id = 'sso-sf-zaprawa'
    const params = {
      kgPerM2: P(id, 'kgPerM2', 'Zużycie zaprawy', null, 'kg/m² muru', 'z karty zaprawy'),
      bag: P(id, 'bag', 'Masa worka', null, 'kg'),
    }
    const missing = [...levelsMissing]
    const c = need(params, 'kgPerM2', missing)
    const bag = params.bag.value
    if (bag === null) missing.push(params.bag.label)
    items.push(
      item({
        id,
        category: C2,
        kind: 'material',
        name: 'Zaprawa murarska — ściany fundamentowe',
        unit: 'kg',
        params,
        missing,
        packaging: { packUnit: 'worek', perPack: bag, packLabel: bag === null ? 'worek' : `worek ${fmt(bag)} kg` },
        priceBasis: 'perPack',
        quantity: wallArea && c !== null ? { value: clean(wallArea.value * c), unit: 'kg', trace: [...wallArea.trace, { label: 'Zaprawa', formula: 'A × zużycie', values: `${fmt(wallArea.value)} × ${fmt(c)}`, result: clean(wallArea.value * c), unit: 'kg' }] } : null,
      }),
    )
  }
  {
    const id = 'sso-sf-papa'
    const params = {
      stripWidth: P(id, 'stripWidth', 'Szerokość pasa papy pod bloczki', null, 'm'),
      rollWidth: P(id, 'rollWidth', 'Szerokość rolki papy', null, 'm'),
      rollLength: P(id, 'rollLength', 'Długość rolki papy', null, 'm'),
      overlap: P(id, 'overlap', 'Zakład papy na łączeniu', DEFAULT_FELT_OVERLAP, 'm', '30 cm ± 10 cm'),
      minPiece: P(id, 'minPiece', 'Min. kawałek z resztki', DEFAULT_MIN_PIECE, 'm'),
    }
    const missing: string[] = []
    const sw = need(params, 'stripWidth', missing)
    const rw = need(params, 'rollWidth', missing)
    const rl = need(params, 'rollLength', missing)
    const ov = need(params, 'overlap', missing)
    const mp = need(params, 'minPiece', missing)
    const felt =
      sw !== null && rw !== null && rl !== null && ov !== null && mp !== null
        ? attempt(
            () =>
              feltRolls(project, 'foundationFeltVariant', {
                sheet: { width: rw, length: rl },
                stripWidth: sw,
                segments: sides.map((L, i) => ({ id: `b${i + 1}`, label: `bok ${i + 1}`, length: L })),
                minPieceLength: mp,
                jointOverlap: ov,
              }),
            missing,
          )
        : null
    items.push(item({ id, category: C2, kind: 'material', name: 'Papa na ławie pod bloczki (rolki)', unit: 'szt', params, missing, quantity: felt?.quantity ?? null, ...(felt ? { cutting: felt.cutting } : {}), ...(felt?.note ? { note: felt.note } : {}) }))
  }
  const hSf = fl ? fl.wallHeight : null
  {
    const id = 'sso-sf-hydro'
    const params = {
      layers: P(id, 'layers', 'Liczba warstw hydroizolacji', null, 'szt'),
      kgPerM2: P(id, 'kgPerM2', 'Zużycie na warstwę', null, 'kg/m²', 'z karty produktu'),
      bucket: P(id, 'bucket', 'Wielkość wiadra', null, 'kg'),
    }
    const missing = [...levelsMissing]
    const n = need(params, 'layers', missing)
    const c = need(params, 'kgPerM2', missing)
    const bucket = params.bucket.value
    if (bucket === null) missing.push(params.bucket.label)
    let quantity: Computed | null = null
    if (hSf !== null && n !== null && c !== null) {
      const area = clean((pOs.value - 2 * (f.blockWidth ?? 0) + pOs.value + 2 * (f.blockWidth ?? 0)) * hSf)
      const kg = clean(area * n * c)
      quantity = {
        value: kg,
        unit: 'kg',
        trace: [
          { label: 'Powierzchnia hydroizolacji (obie strony)', formula: '(P_oś − 2t_f + P_oś + 2t_f) × h_sf', values: `2 × ${fmt(pOs.value)} × ${fmt(hSf)}`, result: area, unit: 'm²', ref: GEOMETRY_REFS.axisPerimeter },
          { label: 'Masa hydroizolacji', formula: 'A × warstwy × zużycie', values: `${fmt(area)} × ${fmt(n)} × ${fmt(c)}`, result: kg, unit: 'kg' },
        ],
      }
    }
    items.push(
      item({
        id,
        category: C2,
        kind: 'material',
        name: 'Hydroizolacja ścian fundamentowych (dysperbit/masa)',
        unit: 'kg',
        params,
        missing,
        packaging: { packUnit: 'wiadro', perPack: bucket, packLabel: bucket === null ? 'wiadro' : `wiadro ${fmt(bucket)} kg` },
        priceBasis: 'perPack',
        quantity,
      }),
    )
  }
  // XPS: od góry ławy do 3 cm poniżej góry wieńca fund.; obwód w połowie grubości XPS
  const xpsGapId = 'sso-sf-xps'
  const xpsParams = {
    gap: P(xpsGapId, 'gap', 'XPS kończy się poniżej góry wieńca fund.', 0.03, 'm'),
    boardLength: P(xpsGapId, 'boardLength', 'Płyta XPS — długość', null, 'm'),
    boardWidth: P(xpsGapId, 'boardWidth', 'Płyta XPS — szerokość', null, 'm'),
    perPack: P(xpsGapId, 'perPack', 'Płyt w paczce', null, 'szt'),
  }
  const xpsMissing = [...levelsMissing]
  if (f.blockWidth === null) xpsMissing.push('grubość ściany fundamentowej (szerokość bloczka)')
  const gap = need(xpsParams, 'gap', xpsMissing)
  const xpsArea: Computed | null =
    hSf !== null && f.blockWidth !== null && gap !== null
      ? (() => {
          const h = clean(hSf - gap)
          const per = clean(pOs.value + 4 * f.blockWidth + 4 * project.foundationInsulation)
          const a = clean(per * h)
          return {
            value: a,
            unit: 'm²',
            trace: [
              { label: 'Wysokość XPS', formula: 'h_sf − odstęp', values: `${fmt(hSf)} − ${fmt(gap)}`, result: h, unit: 'm' },
              { label: 'Obwód w połowie grubości XPS', formula: 'P_oś + 4·t_f + 4·e_xps', values: `${fmt(pOs.value)} + 4 × ${fmt(f.blockWidth)} + 4 × ${fmt(project.foundationInsulation)}`, result: per, unit: 'm', ref: GEOMETRY_REFS.axisPerimeter },
              { label: 'Powierzchnia XPS', formula: 'obwód × wysokość', values: `${fmt(per)} × ${fmt(h)}`, result: a, unit: 'm²' },
            ],
          }
        })()
      : null
  {
    const bl = need(xpsParams, 'boardLength', xpsMissing)
    const bw = need(xpsParams, 'boardWidth', xpsMissing)
    const pp = need(xpsParams, 'perPack', xpsMissing)
    const perPack = bl !== null && bw !== null && pp !== null ? clean(bl * bw * pp) : null
    items.push(
      item({
        id: xpsGapId,
        category: C2,
        kind: 'material',
        name: `XPS ${fmt(project.foundationInsulation * 100)} cm na ścianę fundamentową`,
        unit: 'm2',
        params: xpsParams,
        missing: xpsMissing,
        packaging: { packUnit: 'paczka', perPack, packLabel: perPack === null ? 'paczka' : `paczka = ${fmt(perPack)} m²` },
        priceBasis: 'perPack',
        quantity: xpsArea,
      }),
    )
  }
  {
    const id = 'sso-sf-pianoklej'
    const params = { m2PerCan: P(id, 'm2PerCan', 'Wydajność puszki', null, 'm²/puszka', 'z karty pianokleju') }
    const missing = [...xpsMissing.filter((m) => !m.startsWith('Płyt'))]
    const per = need(params, 'm2PerCan', missing)
    items.push(
      item({
        id,
        category: C2,
        kind: 'material',
        name: 'Pianoklej do XPS',
        unit: 'm2',
        params,
        missing,
        packaging: { packUnit: 'puszka', perPack: per, packLabel: per === null ? 'puszka' : `puszka = ${fmt(per)} m²` },
        priceBasis: 'perPack',
        quantity: xpsArea,
      }),
    )
  }
  items.push(item({ id: 'sso-sf-folia-kubelkowa', category: C2, kind: 'material', name: 'Folia kubełkowa na XPS', unit: 'm2', quantity: xpsArea, missing: [...xpsMissing.filter((m) => !m.startsWith('Płyt'))], enabled: false }))

  // ── Wieniec fundamentowy
  const C3 = 'Wieniec fundamentowy'
  const rbMissing: string[] = []
  if (f.blockWidth === null) rbMissing.push('grubość ściany fundamentowej (szerokość bloczka) = szerokość wieńca')
  const rbw = f.blockWidth
  const rbh = f.ringBeamHeight
  const rbVol = rbw !== null ? linearElementVolume('wieniec fundamentowy', pOs.value, rbw, rbh) : null
  items.push(...pourItems(b, 'sso-wf', C3, 'wieniec fundamentowy', rbVol, rbMissing, project.concrete.foundationRingBeam))
  const rbRebar = rbw !== null ? computeRebarElement('wieniec fundamentowy', sides, defaultRingBeamRebar(rbw, rbh)) : null
  items.push(...rebarItems(b, 'sso-wf', 'Zbrojenie wieńca fundamentowego', rbRebar, rbMissing, fp.massPerMeter, fp.barLength))
  {
    const id = 'sso-wf-osb'
    const params = {
      sheetLength: P(id, 'sheetLength', 'Płyta OSB — długość (kupowana)', null, 'm'),
      sheetWidth: P(id, 'sheetWidth', 'Płyta OSB — szerokość (kupowana)', null, 'm'),
      overlap: P(id, 'overlap', 'Zakład szalunku na bloczki', 0.1, 'm'),
      minPiece: P(id, 'minPiece', 'Min. kawałek z resztki', DEFAULT_MIN_PIECE, 'm'),
    }
    const missing = [...rbMissing]
    const sl = need(params, 'sheetLength', missing)
    const sw = need(params, 'sheetWidth', missing)
    const ov = need(params, 'overlap', missing)
    const mp = need(params, 'minPiece', missing)
    const variant = project.choices.foundationRingBeamOsbVariant
    let quantity: Computed | null = null
    let note: string | undefined
    let cutting: ItemCutting | undefined
    if (rbw !== null && sl !== null && sw !== null && ov !== null && mp !== null) attempt(() => {
      const cut = computeCutting({
        material: 'płytę OSB',
        sheetUnit: 'płyt',
        sheet: { width: sw, length: sl },
        stripWidth: clean(rbh + ov),
        segments: formworkSegmentsRect(axis.length, axis.width, rbw),
        minPieceLength: mp,
        jointOverlap: 0,
      })
      note = cut.jointsWarning ?? undefined
      const v = variant ? cut[variant] : null
      if (variant === null) missing.push('wybór wariantu cięcia OSB (A lub B)')
      else if (v === null) missing.push(`wariant ${variant} niemożliwy dla tej płyty — wybierz drugi`)
      if (v) quantity = { value: v.sheets, unit: 'szt', trace: [...cut.trace, { label: 'Wariant wybrany przez użytkownika', formula: '', values: v.instruction, result: v.sheets, unit: 'płyt' }] }
      cutting = { result: cut, sheet: { width: sw, length: sl }, stripWidth: clean(rbh + ov), segments: formworkSegmentsRect(axis.length, axis.width, rbw), used: v ? v.key : null, choiceKey: 'foundationRingBeamOsbVariant', userMustChoose: true }
    }, missing)
    items.push(item({ id, category: C3, kind: 'material', name: 'Płyty OSB — szalunek wieńca fundamentowego', unit: 'szt', params, missing, quantity, ...(note ? { note } : {}), ...(cutting ? { cutting } : {}) }))
  }

  // ── Zasypka wewnątrz fundamentów
  const C4 = 'Zasypka wewnątrz fundamentów'
  {
    const id = 'sso-zasypka'
    const params = { compaction: P(id, 'compaction', 'Współczynnik zagęszczenia', 1.2, '', 'do weryfikacji z dostawcą') }
    const missing = [...levelsMissing]
    const k = need(params, 'compaction', missing)
    let quantity: Computed | null = null
    if (levels && fl && k !== null) {
      const h = clean(levels.slabBottom.value - fl.excavationBottom)
      const v = clean(aWew.value * h * k)
      quantity = {
        value: v,
        unit: 'm³',
        trace: [
          {
            label: 'Wysokość zasypki',
            formula: '0,12 + n × (h_bl + spoina) + h_wieńca − g_chudziaka',
            values: `${fmt(f.footingFormworkHeight)} + ${f.layers} × (${fmt(f.blockHeight!)} + ${fmt(f.jointThickness!)}) + ${fmt(f.ringBeamHeight)} − ${fmt(project.slabThickness)}`,
            result: h,
            unit: 'm',
            note: 'od dna wykopu (12 cm pod górą ławy) do góry ściany fund. z wieńcem, minus chudziak',
          },
          { label: 'Objętość luźna', formula: 'A_wew × h × k_zag', values: `${fmt(aWew.value)} × ${fmt(h)} × ${fmt(k)}`, result: v, unit: 'm³', ref: GEOMETRY_REFS.interiorArea },
        ],
      }
    }
    items.push(item({ id, category: C4, kind: 'material', name: 'Piasek — zasypka wewnątrz fundamentów (z transportem)', unit: 'm3', params, missing, quantity }))
  }

  // ── Chudziak
  const C5 = 'Chudziak'
  items.push(...pourItems(b, 'sso-chudziak', C5, 'chudziak', slabVolume('chudziak', aWew.value, project.slabThickness), [], project.concrete.slab))

  // ── Kanalizacja i przejścia
  const C6 = 'Kanalizacja i przejścia'
  items.push(lumpItem(b, 'sso-kanalizacja', C6, 'Kanalizacja podposadzkowa (całość)'))
  items.push(lumpItem(b, 'sso-rury-oslonowe', C6, 'Rury osłonowe przejść przez fundament (woda, prąd)'))
  {
    const id = 'sso-bednarka'
    const params = {
      leads: P(id, 'leads', 'Liczba wyprowadzeń uziomu', null, 'szt'),
      leadLength: P(id, 'leadLength', 'Długość wyprowadzenia', null, 'm'),
    }
    const missing: string[] = []
    const n = need(params, 'leads', missing)
    const l = need(params, 'leadLength', missing)
    items.push(
      item({
        id,
        category: C6,
        kind: 'material',
        name: 'Uziom fundamentowy — bednarka ocynkowana',
        unit: 'mb',
        params,
        missing,
        quantity: n !== null && l !== null ? computed('Bednarka', 'P_oś + wyprowadzenia × długość', `${fmt(pOs.value)} + ${fmt(n)} × ${fmt(l)}`, pOs.value + n * l, 'm', GEOMETRY_REFS.axisPerimeter) : null,
      }),
    )
  }
  items.push(manualItem(b, 'sso-zlacza', C6, 'material', 'Złącza krzyżowe do bednarki', 'szt', 'Liczba złączy'))

  return { items: applyTimber(b, items), context: { levels, levelsMissing } }
}
