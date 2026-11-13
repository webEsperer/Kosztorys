// Powłoka aplikacji: projekty (IndexedDB), autozapis, zakładki etapów, podsumowanie, „do uzupełnienia”.

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { computeEstimate, STAGE_LABEL, STAGES } from '../engine/estimate'
import type { Stage } from '../engine/items'
import { formatPLN } from '../engine/money'
import { newProject, type ProjectInput } from '../model/project'
import { deleteProject, exportJson, importJson, listProjects, loadTemplate, newId, saveProject, saveTemplate, upgradeProject, type StoredProject } from '../storage/db'
import { applyTemplate, describeTemplate, templateFrom } from '../model/template'
import { StageView } from './estimate/StageView'
import { ErrorBoundary } from './common/ErrorBoundary'
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
  // Poprzednia wersja projektu — do „Cofnij ostatnią zmianę”, gdy widok się wywróci
  const undoRef = useRef<ProjectInput | null>(null)
  // Pasek zakładek przyklejony do góry: chowa się przy przewijaniu w dół, wraca przy przewijaniu w górę (wg użytkownika).
  const [tabsHidden, setTabsHidden] = useState(false)
  useEffect(() => {
    let last = window.scrollY
    const onScroll = () => {
      const y = window.scrollY
      const dy = y - last
      if (Math.abs(dy) < 6) return
      setTabsHidden(dy > 0 && y > 120)
      last = y
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

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
        const p = applyTemplate(newProject('Mój dom'), await loadTemplate())
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
      undoRef.current = prev
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

  const open = async (pid: string, list: StoredProject[] = projects) => {
    const sp = list.find((p) => p.id === pid)
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
          <button className="btn" title="Nowy projekt z Twoimi ustawieniami domyślnymi (bloczek fund., podłoga, sufit, dach)" onClick={async () => create(applyTemplate(newProject('Nowy projekt'), await loadTemplate()))}>
            Nowy
          </button>
          <button
            className="btn"
            title="Zapamiętaj z tego projektu bloczki, wysokości ścian, ściany działowe, podłogę, sufit, dach i otwory dla nowych projektów"
            onClick={async () => {
              const t = templateFrom(project)
              if (!confirm(`Zapamiętać jako domyślne dla nowych projektów?\n\n• ${describeTemplate(t).join('\n• ')}\n\nIstniejące projekty się nie zmienią. W każdym projekcie wartości można dalej zmieniać.`)) return
              try {
                await saveTemplate(t)
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err))
              }
            }}
          >
            Ustaw jako domyślne
          </button>
          <button
            className="btn"
            title="Wpisz ustawienia domyślne (bloczki, wysokości, ściany działowe, podłoga, sufit, dach, otwory) do tego projektu"
            onClick={async () => {
              try {
                const t = await loadTemplate()
                if (!confirm(`Wpisać ustawienia domyślne do projektu „${project.name}”?\n\n• ${describeTemplate(t).join('\n• ')}\n\nUWAGA: lista otworów tego projektu zostanie zastąpiona. Wymiary domu, fundament (warstwy, ława) i ceny zostają.`)) return
                update((p) => Object.assign(p, applyTemplate(p, t)))
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err))
              }
            }}
          >
            Wczytaj domyślne
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
              if (list.length) await open(list[0].id, list)
              else await create(applyTemplate(newProject('Mój dom'), await loadTemplate()))
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

      <nav className={`tabs${tabsHidden ? ' tabs-hidden' : ''}`} role="tablist" onFocusCapture={() => setTabsHidden(false)}>
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
        <ErrorBoundary
          resetKey={project}
          action={
            undoRef.current
              ? {
                  label: 'Cofnij ostatnią zmianę',
                  onClick: () => {
                    if (undoRef.current) {
                      setProject(undoRef.current)
                      setSaved(false)
                    }
                  },
                }
              : undefined
          }
        >
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
            <FoundationViewer project={project} update={update} />
          </Suspense>
        )}
        </ErrorBoundary>
      </main>
      <footer className="foot muted small">Ceny brutto. {STAGE_LABEL.SSO} → {STAGE_LABEL.SD}: ilości wg CLAUDE.md, każda pozycja ma „Jak to policzono”.</footer>
    </div>
  )
}
