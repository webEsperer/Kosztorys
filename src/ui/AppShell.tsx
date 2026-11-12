// Powłoka aplikacji: projekty (IndexedDB), autozapis, zakładki etapów, podsumowanie, „do uzupełnienia”.

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { computeEstimate, STAGE_LABEL, STAGES } from '../engine/estimate'
import type { Stage } from '../engine/items'
import { formatPLN } from '../engine/money'
import { newProject, type ProjectInput } from '../model/project'
import { deleteProject, exportJson, importJson, listProjects, newId, saveProject, upgradeProject, type StoredProject } from '../storage/db'
import { StageView } from './estimate/StageView'
import { Summary, TodoList } from './estimate/Summary'
import { ProjectForm } from './project-form/ProjectForm'
import { ExportView } from './export/ExportView'
import { RoofView } from './roof-view/RoofView'
import { PlanEditor } from './plan-editor/PlanEditor'
import type { RoofElementKind } from './roof-view/links'
import './app.css'

const House3D = lazy(() => import('./house-3d/House3D').then((m) => ({ default: m.House3D })))
const FoundationViewer = lazy(() => import('./foundation-view/FoundationViewer').then((m) => ({ default: m.FoundationViewer })))

type Tab = 'dane' | 'rzut' | Stage | 'podsumowanie' | 'braki' | 'dach' | 'dom3d' | 'eksport' | 'fundament'

const TAB_LABEL: Record<Tab, string> = {
  dane: 'Dane projektu',
  rzut: 'Rzut',
  SSO: 'SSO',
  SSZ: 'SSZ',
  SD: 'SD',
  OGOLNE: 'Ogólne',
  podsumowanie: 'Podsumowanie',
  braki: 'Do uzupełnienia',
  dach: 'Dach',
  dom3d: 'Dom 3D',
  eksport: 'Eksport',
  fundament: 'Fundament 3D',
}

function download(name: string, text: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export function AppShell() {
  const [projects, setProjects] = useState<StoredProject[]>([])
  const [id, setId] = useState<string | null>(null)
  const [project, setProject] = useState<ProjectInput | null>(null)
  const [tab, setTab] = useState<Tab>('dane')
  const [selected, setSelected] = useState<string | null>(null)
  const [roofHighlight, setRoofHighlight] = useState<RoofElementKind | null>(null)
  const [saved, setSaved] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => setProjects(await listProjects()), [])

  // Start: ostatni projekt albo nowy
  useEffect(() => {
    ;(async () => {
      const list = await listProjects()
      if (list.length) {
        setProjects(list)
        setId(list[0].id)
        setProject(upgradeProject(list[0].data))
      } else {
        const p = newProject('Mój dom')
        const nid = newId()
        await saveProject(nid, p)
        setId(nid)
        setProject(p)
        await refresh()
      }
    })().catch((e) => setError(String(e)))
  }, [refresh])

  // Autozapis (z opóźnieniem)
  useEffect(() => {
    if (!project || !id || saved) return
    const t = setTimeout(() => {
      saveProject(id, project)
        .then(() => {
          setSaved(true)
          return refresh()
        })
        .catch((e) => setError(String(e)))
    }, 500)
    return () => clearTimeout(t)
  }, [project, id, saved, refresh])

  const update = useCallback((fn: (p: ProjectInput) => void) => {
    setProject((prev) => {
      if (!prev) return prev
      const next = structuredClone(prev)
      fn(next)
      return next
    })
    setSaved(false)
  }, [])

  const estimate = useMemo(() => {
    if (!project) return null
    try {
      return computeEstimate(project)
    } catch (e) {
      return e instanceof Error ? e : new Error(String(e))
    }
  }, [project])

  const open = async (pid: string) => {
    const sp = projects.find((p) => p.id === pid)
    if (!sp) return
    setId(pid)
    setProject(upgradeProject(sp.data))
    setSelected(null)
    setSaved(true)
  }
  const create = async (p: ProjectInput) => {
    const nid = newId()
    await saveProject(nid, p)
    await refresh()
    setId(nid)
    setProject(p)
    setSelected(null)
    setSaved(true)
    setTab('dane')
  }

  if (!project || !estimate) return <p className="loading">Wczytywanie…</p>

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">Kosztorys domu</div>
        <select className="proj-select" value={id ?? ''} onChange={(e) => open(e.target.value)} aria-label="Projekt">
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <div className="top-actions">
          <button className="btn" onClick={() => create(newProject('Nowy projekt'))}>
            Nowy
          </button>
          <button className="btn" onClick={() => create({ ...structuredClone(project), name: `${project.name} (wariant)` })}>
            Duplikuj
          </button>
          <button className="btn" onClick={() => download(`${project.name}.json`, exportJson(project))}>
            Eksport JSON
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            Import JSON
          </button>
          <button
            className="btn danger"
            onClick={async () => {
              if (!id || !confirm(`Usunąć projekt „${project.name}”?`)) return
              await deleteProject(id)
              const list = await listProjects()
              setProjects(list)
              if (list.length) await open(list[0].id)
              else await create(newProject('Mój dom'))
            }}
          >
            Usuń
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f) return
              try {
                await create(importJson(await f.text()))
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err))
              }
            }}
          />
        </div>
        <div className="total">
          {estimate instanceof Error ? '—' : formatPLN(estimate.totalGrosze)}
          <span className="muted small">{saved ? 'zapisano' : 'zapisywanie…'}</span>
        </div>
      </header>

      {error && (
        <p className="error-bar" onClick={() => setError(null)}>
          {error} (kliknij, aby zamknąć)
        </p>
      )}

      <nav className="tabs" role="tablist">
        {(['dane', 'rzut', ...STAGES, 'podsumowanie', 'braki', 'dach', 'dom3d', 'eksport', 'fundament'] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => { setTab(t); setSelected(null); setRoofHighlight(null) }}>
            {TAB_LABEL[t]}
            {!(estimate instanceof Error) && STAGES.includes(t as Stage) && (
              <span className="tab-sum">{formatPLN(estimate.stages.find((s) => s.stage === t)!.totalGrosze)}</span>
            )}
            {t === 'braki' && !(estimate instanceof Error) && estimate.todo.length > 0 && <span className="badge warn">{estimate.todo.length}</span>}
          </button>
        ))}
      </nav>

      <main className="content">
        {estimate instanceof Error ? (
          <>
            <p className="error-bar">Błąd obliczeń: {estimate.message}</p>
            <ProjectForm project={project} update={update} />
          </>
        ) : tab === 'dane' ? (
          <ProjectForm project={project} update={update} />
        ) : STAGES.includes(tab as Stage) ? (
          <StageView
            stage={tab as Stage}
            estimate={estimate}
            project={project}
            update={update}
            selected={selected}
            onSelect={setSelected}
            onShowRoof={(k) => {
              setRoofHighlight(k)
              setTab('dach')
            }}
          />
        ) : tab === 'podsumowanie' ? (
          <Summary estimate={estimate} onOpen={(st) => setTab(st)} vatPercent={project.vatPercent} />
        ) : tab === 'braki' ? (
          <TodoList
            estimate={estimate}
            onOpenItem={(st, iid) => {
              setTab(st)
              setSelected(iid)
            }}
          />
        ) : tab === 'rzut' ? (
          <PlanEditor project={project} update={update} />
        ) : tab === 'dach' ? (
          <RoofView
            project={project}
            estimate={estimate}
            highlight={roofHighlight}
            onOpenItem={(st, iid) => {
              setTab(st)
              setSelected(iid)
            }}
          />
        ) : tab === 'dom3d' ? (
          <Suspense fallback={<p className="loading">Ładowanie modelu 3D…</p>}>
            <House3D
              project={project}
              estimate={estimate}
              onOpenItem={(st, iid) => {
                setTab(st)
                setSelected(iid)
              }}
            />
          </Suspense>
        ) : tab === 'eksport' ? (
          <ExportView estimate={estimate} project={project} />
        ) : (
          <Suspense fallback={<p className="loading">Ładowanie wizualizacji…</p>}>
            <FoundationViewer />
          </Suspense>
        )}
      </main>
      <footer className="foot muted small">Ceny brutto. {STAGE_LABEL.SSO} → {STAGE_LABEL.SD}: ilości wg CLAUDE.md, każda pozycja ma „Jak to policzono”.</footer>
    </div>
  )
}
