// SSZ — dach: konstrukcja, pokrycie, obróbki, orynnowanie, daszki z koszami (CLAUDE.md „Dach — …”).

import type { ProjectInput } from '../../model/project'
import { computeGeometry } from '../geometry'
import { type ItemSpec, need } from '../items'
import { computeRoof, dormerWarnings, type RoofInput, type RoofResult, trussCount } from '../roof'
import { type Computed, type TraceStep, ceilSafe, clean, fmt } from '../trace'
import { type Builder, computed, lumpItem, manualItem } from './common'

export function roofOf(project: ProjectInput): { roof: RoofResult | null; input: RoofInput | null; missing: string[]; trace: TraceStep[]; warnings: string[] } {
  const r = project.roof
  const missing: string[] = []
  if (r.pitchDeg === null) missing.push('kąt nachylenia dachu')
  if (r.eaveOverhang === null) missing.push('okap boczny')
  if (r.gableOverhang === null) missing.push('okap szczytowy')
  if (missing.length) return { roof: null, input: null, missing, trace: [], warnings: [] }
  try {
    return roofOfValid(project)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { roof: null, input: null, missing: [msg], trace: [], warnings: [msg] }
  }
}

function roofOfValid(project: ProjectInput): { roof: RoofResult; input: RoofInput; missing: string[]; trace: TraceStep[]; warnings: string[] } {
  const r = project.roof
  const missing: string[] = []
  const geo = computeGeometry({
    footprint: { kind: 'rect', length: project.footprint.length, width: project.footprint.width },
    wallThickness: project.wallThickness,
    facadeInsulation: project.facadeInsulation,
  })
  const od = geo.outerDimensions
  const input: RoofInput = {
    outerLength: od.value.length,
    outerWidth: od.value.width,
    ridgeAlongLonger: r.ridgeAlongLonger,
    pitchDeg: r.pitchDeg!,
    eaveOverhang: r.eaveOverhang!,
    gableOverhang: r.gableOverhang!,
    dormers: r.dormers,
  }
  const roof = computeRoof(input)
  for (const id of roof.manualDormers) missing.push(`daszek ${id} (Δh < 0): powierzchnia i kosze do podania ręcznie`)
  return { roof, input, missing, trace: [...od.trace, ...roof.trace], warnings: dormerWarnings(input, roof) }
}

export function roofItems(b: Builder, project: ProjectInput): ItemSpec[] {
  const { P, item } = b
  const out: ItemSpec[] = []
  const { roof, missing: roofMissing, trace: roofTrace } = roofOf(project)
  const nD = roof?.dormers.length ?? 0
  const dormerArea = roof ? clean(roof.dormers.reduce((s, d) => s + d.area, 0)) : 0
  const q = (label: string, formula: string, values: string, value: number, unit: string): Computed => {
    const c = computed(label, formula, values, value, unit)
    return { ...c, trace: [...roofTrace, ...c.trace] }
  }

  // ── Konstrukcja
  const C1 = 'Dach — konstrukcja'
  const n =
    roof === null
      ? null
      : project.roof.trussCount !== null
        ? { value: project.roof.trussCount, trace: [{ label: 'Liczba wiązarów', formula: 'podaje użytkownik', values: '', result: project.roof.trussCount, unit: 'szt' }] as TraceStep[] }
        : trussCount(roof.length, project.roof.trussSpacing)
  out.push(lumpItem(b, 'ssz-wiazary', C1, 'Wiązary z montażem (kwota od firmy)', true, n ? `liczba wiązarów: ${n.value} szt (rozstaw ${fmt(project.roof.trussSpacing)} m)` : undefined))
  out.push(lumpItem(b, 'ssz-daszki-konstrukcja', C1, 'Konstrukcja daszków (wiązary/krokwie)', nD > 0))
  out.push(manualItem(b, 'ssz-kominy', C1, 'material', 'Kominy — komplet', 'szt', 'Liczba kominów'))

  // ── Pokrycie
  const C2 = 'Dach — pokrycie'
  const area = roof ? q('Powierzchnia dachu', 'A_główna + Σ A_daszków', `${fmt(roof.mainArea)} + ${fmt(dormerArea)}`, roof.totalArea, 'm²') : null
  {
    const id = 'ssz-membrana'
    const params = { m2PerRoll: P(id, 'm2PerRoll', 'm² w rolce membrany', null, 'm²') }
    const missing = [...roofMissing]
    const per = need(params, 'm2PerRoll', missing)
    out.push(
      item({
        id,
        category: C2,
        kind: 'material',
        name: 'Membrana dachowa',
        unit: 'm2',
        params,
        missing,
        quantity: area,
        wastePercent: 10,
        packaging: { packUnit: 'rolka', perPack: per, packLabel: per === null ? 'rolka' : `rolka = ${fmt(per)} m²` },
        priceBasis: 'perPack',
        note: 'odpad = zakłady 10%',
      }),
    )
  }
  {
    const id = 'ssz-kontrlaty'
    const params = {
      w: P(id, 'w', 'Kontrłata — szerokość', 0.05, 'm'),
      h: P(id, 'h', 'Kontrłata — grubość', 0.032, 'm'),
    }
    const missing = [...roofMissing]
    let quantity: Computed | null = null
    if (roof && n) {
      const main = clean(2 * n.value * roof.slope)
      const dorm = clean(dormerArea / project.roof.trussSpacing)
      const mb = clean(main + dorm)
      const m3 = clean(mb * (params.w.value ?? 0) * (params.h.value ?? 0))
      quantity = {
        value: mb,
        unit: 'mb',
        trace: [
          ...roofTrace,
          ...n.trace,
          { label: 'Kontrłaty — połacie główne', formula: '2 × N_wiązarów × s', values: `2 × ${n.value} × ${fmt(roof.slope)}`, result: main, unit: 'm' },
          ...(nD ? [{ label: 'Kontrłaty — daszki', formula: 'Σ A_daszków / rozstaw wiązarów', values: `${fmt(dormerArea)} / ${fmt(project.roof.trussSpacing)}`, result: dorm, unit: 'm' }] : []),
          { label: 'Kontrłaty — informacyjnie', formula: 'mb × szer. × gr.', values: `${fmt(mb)} × ${fmt(params.w.value ?? 0)} × ${fmt(params.h.value ?? 0)}`, result: m3, unit: 'm³' },
        ],
      }
    }
    out.push(item({ id, category: C2, kind: 'material', name: 'Kontrłaty 3,2 × 5 cm', unit: 'mb', params, missing, quantity }))
  }
  {
    const id = 'ssz-laty'
    const params = {
      spacing: P(id, 'spacing', 'Rozstaw łat', null, 'm', 'z karty dachówki'),
      w: P(id, 'w', 'Łata — szerokość', 0.06, 'm'),
      h: P(id, 'h', 'Łata — grubość', 0.04, 'm'),
    }
    const missing = [...roofMissing]
    const sp = need(params, 'spacing', missing)
    let quantity: Computed | null = null
    if (roof && sp !== null) {
      const rows = ceilSafe(roof.slope / sp) + 1
      const main = clean(2 * rows * roof.ridgeLength)
      const dorm = clean(dormerArea / sp)
      const mb = clean(main + dorm)
      const m3 = clean(mb * (params.w.value ?? 0) * (params.h.value ?? 0))
      quantity = {
        value: mb,
        unit: 'mb',
        trace: [
          ...roofTrace,
          { label: 'Rzędy łat na połać', formula: '⌈s / rozstaw⌉ + 1', values: `⌈${fmt(roof.slope)} / ${fmt(sp)}⌉ + 1`, result: rows, unit: '' },
          { label: 'Łaty — połacie główne', formula: '2 × rzędy × R', values: `2 × ${rows} × ${fmt(roof.ridgeLength)}`, result: main, unit: 'm' },
          ...(nD ? [{ label: 'Łaty — daszki', formula: 'Σ A_daszków / rozstaw', values: `${fmt(dormerArea)} / ${fmt(sp)}`, result: dorm, unit: 'm' }] : []),
          { label: 'Łaty — informacyjnie', formula: 'mb × szer. × gr.', values: `${fmt(mb)} × ${fmt(params.w.value ?? 0)} × ${fmt(params.h.value ?? 0)}`, result: m3, unit: 'm³' },
        ],
      }
    }
    out.push(item({ id, category: C2, kind: 'material', name: 'Łaty 4 × 6 cm', unit: 'mb', params, missing, quantity }))
  }
  {
    const id = 'ssz-dachowka'
    const params = {
      perM2: P(id, 'perM2', 'Zużycie dachówki', null, 'szt/m²', 'z karty dachówki'),
      waste: P(id, 'waste', 'Odpad dachówki', nD ? 12 : 0, '%', nD ? 'połacie z koszami — 12%' : 'odpad standardowy'),
    }
    const missing = [...roofMissing]
    const c = need(params, 'perM2', missing)
    out.push(
      item({
        id,
        category: C2,
        kind: 'material',
        name: 'Dachówka',
        unit: 'szt',
        params,
        missing,
        wastePercent: params.waste.value ?? 0,
        quantity: area && c !== null ? { value: clean(area.value * c), unit: 'szt', trace: [...area.trace, { label: 'Dachówki', formula: 'A × szt/m²', values: `${fmt(area.value)} × ${fmt(c)}`, result: clean(area.value * c), unit: 'szt' }] } : null,
      }),
    )
  }
  {
    const id = 'ssz-gasiory'
    const params = { perMb: P(id, 'perMb', 'Gąsiorów na mb kalenicy', null, 'szt/mb', 'z karty gąsiora') }
    const missing = [...roofMissing]
    const c = need(params, 'perMb', missing)
    out.push(
      item({
        id,
        category: C2,
        kind: 'material',
        name: 'Gąsiory',
        unit: 'szt',
        params,
        missing,
        quantity: roof && c !== null ? q('Gąsiory', 'Σ kalenic × szt/mb', `${fmt(roof.ridgesLength)} × ${fmt(c)}`, Math.ceil(roof.ridgesLength * c - 1e-9), 'szt') : null,
      }),
    )
  }
  out.push(item({ id: 'ssz-gasior-poczatkowy', category: C2, kind: 'material', name: 'Gąsior początkowy', unit: 'szt', missing: [...roofMissing], quantity: roof ? q('Gąsior początkowy', '1 + liczba daszków', `1 + ${nD}`, 1 + nD, 'szt') : null }))
  out.push(item({ id: 'ssz-gasior-koncowy', category: C2, kind: 'material', name: 'Gąsior końcowy', unit: 'szt', missing: [...roofMissing], quantity: roof ? q('Gąsior końcowy', 'kalenica główna', '1', 1, 'szt') : null }))
  const vq = roof ? q('Krawędzie szczytowe', '4 × s + Σ daszków', fmt(roof.vergesLength), roof.vergesLength, 'm') : null
  out.push(item({ id: 'ssz-krawedziowe', category: C2, kind: 'material', name: 'Dachówki krawędziowe / wiatrownice blaszane', unit: 'mb', missing: [...roofMissing], quantity: vq }))
  const eq = roof ? q('Okapy', '2R − Σ b + Σ okapy daszków', fmt(roof.eavesLength), roof.eavesLength, 'm') : null
  out.push(item({ id: 'ssz-pas-nadrynnowy', category: C2, kind: 'material', name: 'Pas nadrynnowy', unit: 'mb', missing: [...roofMissing], quantity: eq }))
  out.push(item({ id: 'ssz-pas-podrynnowy', category: C2, kind: 'material', name: 'Pas podrynnowy', unit: 'mb', missing: [...roofMissing], quantity: eq }))
  out.push(item({ id: 'ssz-grzebien', category: C2, kind: 'material', name: 'Grzebień okapowy (wróblownica)', unit: 'mb', missing: [...roofMissing], quantity: eq }))
  const rq = roof ? q('Kalenice', 'R + Σ kalenic daszków', fmt(roof.ridgesLength), roof.ridgesLength, 'm') : null
  out.push(item({ id: 'ssz-tasma-kalenicowa', category: C2, kind: 'material', name: 'Taśma kalenicowa', unit: 'mb', missing: [...roofMissing], quantity: rq }))
  {
    const id = 'ssz-uchwyty-laty-kalenicowej'
    const params = { spacing: P(id, 'spacing', 'Rozstaw uchwytów łaty kalenicowej', null, 'm', 'zwykle przy każdej parze krokwi/wiązarów') }
    const missing = [...roofMissing]
    const sp = need(params, 'spacing', missing)
    out.push(
      item({
        id,
        category: C2,
        kind: 'material',
        name: 'Uchwyty łaty kalenicowej',
        unit: 'szt',
        params,
        missing,
        quantity: roof && sp !== null ? q('Uchwyty', '⌈Σ kalenic / rozstaw⌉ + liczba kalenic', `⌈${fmt(roof.ridgesLength)} / ${fmt(sp)}⌉ + ${1 + nD}`, ceilSafe(roof.ridgesLength / sp) + 1 + nD, 'szt') : null,
      }),
    )
  }

  // Deski czołowe i struktonit
  const C3 = 'Dach — deski czołowe i struktonit'
  const fasciaParams = { verge: P('ssz-deski-czolowe', 'verge', 'Deski wiatrowe na szczytach (1 = tak)', 0, '') }
  const withVerge = (fasciaParams.verge.value ?? 0) >= 1
  const fasciaMb = roof ? clean(roof.eavesLength + (withVerge ? roof.vergesLength : 0)) : null
  const fq = roof ? q('Deski czołowe', withVerge ? 'okapy + deski wiatrowe' : 'okapy', withVerge ? `${fmt(roof.eavesLength)} + ${fmt(roof.vergesLength)}` : fmt(roof.eavesLength), fasciaMb!, 'm') : null
  out.push(item({ id: 'ssz-deski-czolowe', category: C3, kind: 'material', name: 'Deski czołowe', unit: 'mb', params: fasciaParams, missing: [...roofMissing], quantity: fq }))
  let tilesQ: number | null = null
  {
    const id = 'ssz-struktonit'
    const params = {
      tile: P(id, 'tile', 'Płytka Cedral (bok kwadratu)', 0.3, 'm'),
      boardH: P(id, 'boardH', 'Wysokość deski czołowej', null, 'm'),
      sideOverlap: P(id, 'sideOverlap', 'Zakład boczny', null, 'm', '0 dla układu na styk'),
      topOverlap: P(id, 'topOverlap', 'Zakład górny', null, 'm', '0 dla układu na styk'),
    }
    const missing = [...roofMissing]
    const tile = need(params, 'tile', missing)
    const bh = need(params, 'boardH', missing)
    const so = need(params, 'sideOverlap', missing)
    const to = need(params, 'topOverlap', missing)
    let quantity: Computed | null = null
    if (fq && tile !== null && bh !== null && so !== null && to !== null) {
      const coverH = clean(tile - to)
      const coverW = clean(tile - so)
      const rows = ceilSafe(bh / coverH)
      const perMb = clean(rows / coverW)
      const pcs = clean(fq.value * perMb)
      tilesQ = Math.ceil(pcs * 1.1 - 1e-9)
      quantity = {
        value: pcs,
        unit: 'szt',
        trace: [
          ...fq.trace,
          { label: 'Rzędy płytek', formula: '⌈wys. deski / (płytka − zakład górny)⌉', values: `⌈${fmt(bh)} / ${fmt(coverH)}⌉`, result: rows, unit: '' },
          { label: 'Płytek na mb', formula: 'rzędy / (płytka − zakład boczny)', values: `${rows} / ${fmt(coverW)}`, result: perMb, unit: 'szt/mb' },
          { label: 'Płytki', formula: 'mb × szt/mb', values: `${fmt(fq.value)} × ${fmt(perMb)}`, result: pcs, unit: 'szt' },
        ],
      }
    }
    out.push(item({ id, category: C3, kind: 'material', name: 'Struktonit — płytki Cedral 30 × 30 cm, gr. 4 mm', unit: 'szt', params, missing, quantity, wastePercent: 10 }))
  }
  {
    const id = 'ssz-struktonit-wkrety'
    const params = { perTile: P(id, 'perTile', 'Gwoździ/wkrętów na płytkę', 2, 'szt') }
    const missing = [...roofMissing]
    const k = need(params, 'perTile', missing)
    if (tilesQ === null) missing.push('ilość płytek struktonitu')
    out.push(item({ id, category: C3, kind: 'material', name: 'Gwoździe/wkręty nierdzewne do struktonitu', unit: 'szt', params, missing, quantity: tilesQ !== null && k !== null ? computed('Wkręty', 'płytki (z odpadem) × szt/płytkę', `${tilesQ} × ${fmt(k)}`, tilesQ * k, 'szt') : null }))
  }

  // Orynnowanie
  const C4 = 'Dach — orynnowanie'
  out.push(item({ id: 'ssz-rynny', category: C4, kind: 'material', name: 'Rynny', unit: 'mb', missing: [...roofMissing], quantity: eq }))
  {
    const id = 'ssz-haki'
    const params = { spacing: P(id, 'spacing', 'Rozstaw haków', 0.6, 'm') }
    const missing = [...roofMissing]
    const sp = need(params, 'spacing', missing)
    const runs = 2 + 2 * nD
    out.push(
      item({
        id,
        category: C4,
        kind: 'material',
        name: 'Haki rynnowe',
        unit: 'szt',
        params,
        missing,
        quantity: roof && sp !== null ? q('Haki', '⌈okapy / rozstaw⌉ + odcinki rynien', `⌈${fmt(roof.eavesLength)} / ${fmt(sp)}⌉ + ${runs}`, ceilSafe(roof.eavesLength / sp) + runs, 'szt') : null,
      }),
    )
  }
  {
    const id = 'ssz-rury-spustowe'
    const params = { count: P(id, 'count', 'Liczba rur spustowych', null, 'szt'), height: P(id, 'height', 'Wysokość rury spustowej', null, 'm') }
    const missing: string[] = []
    const c = need(params, 'count', missing)
    const h = need(params, 'height', missing)
    out.push(item({ id, category: C4, kind: 'material', name: 'Rury spustowe', unit: 'mb', params, missing, quantity: c !== null && h !== null ? computed('Rury spustowe', 'liczba × wysokość', `${fmt(c)} × ${fmt(h)}`, c * h, 'm') : null }))
  }
  out.push(lumpItem(b, 'ssz-orynnowanie-akcesoria', C4, 'Narożniki, lejki, zaślepki, złączki rynnowe'))

  // Obróbki i daszki
  const C5 = 'Dach — obróbki'
  out.push(lumpItem(b, 'ssz-obrobki', C5, 'Obróbki blacharskie (liczba × cena)'))
  out.push(lumpItem(b, 'ssz-obrobki-kominow', C5, 'Obróbki kominów'))
  if (nD > 0 && roof) {
    const vq2 = q('Kosze', 'Σ kosze daszków', fmt(roof.valleysLength), roof.valleysLength, 'm')
    out.push(item({ id: 'ssz-blacha-koszowa', category: C5, kind: 'material', name: 'Blacha koszowa', unit: 'mb', quantity: vq2 }))
    out.push(item({ id: 'ssz-tasma-koszowa', category: C5, kind: 'material', name: 'Taśma / uszczelka koszowa', unit: 'mb', quantity: vq2 }))
  }
  out.push(lumpItem(b, 'ssz-klamry', C5, 'Wkręty/klamry do dachówek', false))
  // Komunikacja kominiarska: ławy (podesty) przy kominie i stopnie na połaci — liczby podaje użytkownik
  out.push(manualItem(b, 'ssz-lawy-kominiarskie', C5, 'material', 'Ławy kominiarskie (podesty) z mocowaniami', 'szt', 'Liczba ław kominiarskich'))
  out.push(manualItem(b, 'ssz-stopnie-kominiarskie', C5, 'material', 'Stopnie kominiarskie z mocowaniami', 'szt', 'Liczba stopni kominiarskich'))
  out.push(lumpItem(b, 'ssz-okna-dachowe', C5, 'Okna dachowe', false))
  return out
}
