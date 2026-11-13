// Kosztorys całej budowy: pozycje wszystkich etapów, ceny, przeniesienia między etapami,
// sumy etapów (z podziałem na kategorie i rodzaje), rezerwa, koszt na m², lista „do uzupełnienia”.

import type { ProjectInput } from '../model/project'
import { type ItemKind, type ItemResult, type ItemSpec, type Stage, computeItem, priceKey, sumItems } from './items'
import type { Grosze } from './money'
import { buildGeneral } from './stages/general'
import { buildSD } from './stages/sd'
import { buildSSO } from './stages/sso'
import { buildSSZ } from './stages/ssz'
import { buildCustom } from './stages/custom'
import { projectBase } from './stages/common'

export const STAGES: Stage[] = ['SSO', 'SSZ', 'SD', 'OGOLNE']
export const STAGE_LABEL: Record<Stage, string> = {
  SSO: 'Stan surowy otwarty',
  SSZ: 'Stan surowy zamknięty',
  SD: 'Stan deweloperski',
  OGOLNE: 'Koszty ogólne budowy',
}
export const KIND_LABEL: Record<ItemKind, string> = {
  material: 'materiały',
  service: 'usługi',
  equipment: 'sprzęt',
  lumpSum: 'ryczałty',
}

export interface StageSummary {
  stage: Stage
  totalGrosze: Grosze
  complete: boolean
  missingCount: number
  byCategory: { category: string; totalGrosze: Grosze }[]
  byKind: Record<ItemKind, Grosze>
}

export interface TodoEntry {
  itemId: string
  stage: Stage
  category: string
  name: string
  missing: string[]
}

export interface Estimate {
  items: ItemResult[]
  stages: StageSummary[]
  /** Suma etapów (bez rezerwy). */
  subtotalGrosze: Grosze
  reservePercent: number
  reserveGrosze: Grosze
  totalGrosze: Grosze
  /** Udział % etapu w sumie etapów. */
  shares: Record<Stage, number>
  /** Koszt na m² powierzchni (A_wew — przybliżenie powierzchni użytkowej). */
  perM2Grosze: Grosze | null
  area: number
  todo: TodoEntry[]
  complete: boolean
}

/** Wszystkie pozycje (przed cenami) z przeniesieniami między etapami. */
export function buildAllItems(project: ProjectInput): ItemSpec[] {
  const all = [...buildSSO(project).items, ...buildSSZ(project).items, ...buildSD(project).items, ...buildGeneral(project).items, ...buildCustom(project.customItems)]
  return all.map((i) => (project.stageOverride[i.id] ? { ...i, stage: project.stageOverride[i.id] } : i))
}

export function computeEstimate(project: ProjectInput): Estimate {
  const items = buildAllItems(project).map((s) => computeItem(s, project.prices[priceKey(s)] ?? null))
  const stages: StageSummary[] = STAGES.map((stage) => {
    const rs = items.filter((r) => r.spec.stage === stage)
    const s = sumItems(rs)
    const cats = new Map<string, Grosze>()
    const byKind: Record<ItemKind, Grosze> = { material: 0, service: 0, equipment: 0, lumpSum: 0 }
    for (const r of rs) {
      if (!r.spec.enabled) continue
      const c = r.costGrosze ?? 0
      cats.set(r.spec.category, (cats.get(r.spec.category) ?? 0) + c)
      byKind[r.spec.kind] += c
    }
    return {
      stage,
      totalGrosze: s.totalGrosze,
      complete: s.complete,
      missingCount: s.missingCount,
      byCategory: [...cats.entries()].map(([category, totalGrosze]) => ({ category, totalGrosze })),
      byKind,
    }
  })
  const subtotal = stages.reduce((a, s) => a + s.totalGrosze, 0)
  const reserve = Math.round((subtotal * project.reservePercent) / 100)
  const total = subtotal + reserve
  const shares = Object.fromEntries(stages.map((s) => [s.stage, subtotal > 0 ? (s.totalGrosze / subtotal) * 100 : 0])) as Record<Stage, number>
  const area = projectBase(project).aWew.value
  const todo: TodoEntry[] = items
    .filter((r) => r.spec.enabled && (r.missing.length > 0 || r.costGrosze === null))
    .map((r) => ({ itemId: r.spec.id, stage: r.spec.stage, category: r.spec.category, name: r.spec.name, missing: r.missing.length ? r.missing : ['cena'] }))
  return {
    items,
    stages,
    subtotalGrosze: subtotal,
    reservePercent: project.reservePercent,
    reserveGrosze: reserve,
    totalGrosze: total,
    shares,
    perM2Grosze: area > 0 ? Math.round(total / area) : null,
    area,
    todo,
    complete: todo.length === 0,
  }
}
