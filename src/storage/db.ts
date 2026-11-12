// Zapis projektów w przeglądarce (IndexedDB przez Dexie) + import/eksport JSON.

import Dexie, { type Table } from 'dexie'
import { newProject, type ProjectInput } from '../model/project'
import { builtInTemplate, mergeTemplate, type ProjectTemplate } from '../model/template'

export interface StoredProject {
  id: string
  name: string
  updatedAt: number
  data: ProjectInput
}

interface Setting {
  key: string
  value: unknown
}

class KosztorysDB extends Dexie {
  projects!: Table<StoredProject, string>
  settings!: Table<Setting, string>
  constructor() {
    super('kosztorys')
    this.version(1).stores({ projects: 'id, name, updatedAt' })
    this.version(2).stores({ projects: 'id, name, updatedAt', settings: 'key' })
  }
}

export const db = new KosztorysDB()

/** Szablon nowego projektu zapisany przez użytkownika; brak → szablon wbudowany. */
// Klucz v2: szablon wbudowany z danymi domu użytkownika (2026-11-12) ma pierwszeństwo przed zapisami sprzed tej zmiany.
const TEMPLATE_KEY = 'template-v2'

export async function loadTemplate(): Promise<ProjectTemplate> {
  const s = await db.settings.get(TEMPLATE_KEY)
  return mergeTemplate(builtInTemplate(newProject()), s?.value as Partial<ProjectTemplate> | undefined)
}

export async function saveTemplate(t: ProjectTemplate): Promise<void> {
  await db.settings.put({ key: TEMPLATE_KEY, value: t })
}

export function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `p-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/** Uzupełnia brakujące pola starszych zapisów wartościami domyślnymi (migracja „miękka”). */
export function upgradeProject(data: Partial<ProjectInput>): ProjectInput {
  const base = newProject(data.name ?? 'Projekt')
  const merged = { ...base, ...data } as ProjectInput
  merged.foundation = { ...base.foundation, ...(data.foundation ?? {}) }
  merged.floorLayers = { ...base.floorLayers, ...(data.floorLayers ?? {}) }
  merged.ceiling = { ...base.ceiling, ...(data.ceiling ?? {}) }
  merged.wall = { ...base.wall, ...(data.wall ?? {}) }
  merged.partitionBlock = { ...base.partitionBlock, ...(data.partitionBlock ?? {}) }
  merged.roof = { ...base.roof, ...(data.roof ?? {}) }
  merged.partitions = { ...base.partitions, ...(data.partitions ?? {}) }
  merged.choices = { ...base.choices, ...(data.choices ?? {}) }
  merged.concrete = { ...base.concrete, ...(data.concrete ?? {}) }
  merged.ceilingRules = { ...base.ceilingRules, ...(data.ceilingRules ?? {}) }
  merged.planRules = { ...base.planRules, ...(data.planRules ?? {}) }
  merged.gables = { ...base.gables, ...(data.gables ?? {}) }
  // Starsze zapisy: szczyt daszku „boazeria” oznaczał wełnę + boazerię.
  merged.roof.dormers = merged.roof.dormers.map((d) => (d.gableInsulation === undefined && d.gableFinish === 'boazeria' ? { ...d, gableInsulation: true } : d))
  // Starsze zapisy liczyły górę wieńca z wysokości w świetle + warstw sufitu — zachowaj tę wartość.
  if (data.wallHeight === undefined) {
    const c = merged.ceiling
    merged.wallHeight = Math.round((merged.clearHeight + c.board + c.grid + c.voidAbove) * 1e6) / 1e6
  }
  return merged
}

export async function listProjects(): Promise<StoredProject[]> {
  return db.projects.orderBy('updatedAt').reverse().toArray()
}

export async function saveProject(id: string, data: ProjectInput): Promise<void> {
  await db.projects.put({ id, name: data.name, updatedAt: Date.now(), data })
}

export async function deleteProject(id: string): Promise<void> {
  await db.projects.delete(id)
}

export function exportJson(data: ProjectInput): string {
  return JSON.stringify({ format: 'kosztorys-domu', version: 1, project: data }, null, 2)
}

export function importJson(text: string): ProjectInput {
  const raw = JSON.parse(text)
  const data = raw?.format === 'kosztorys-domu' ? raw.project : raw
  if (!data || typeof data !== 'object' || !('footprint' in data)) throw new Error('To nie jest plik projektu kosztorysu.')
  return upgradeProject(data)
}
