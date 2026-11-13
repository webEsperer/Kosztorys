// Dane projektu: geometria, wysokości, ściany, fundament, dach, betonowania, otwory.

import type { ProjectInput } from '../../model/project'
import type { ConcretePourParams } from '../../engine/concrete'
import { gableSpanInterior, projectBase } from '../../engine/stages/common'
import { roofOf } from '../../engine/stages/sszRoof'
import { gableWallsGross } from '../../engine/facade'
import { Check, NumField, Section, Select, TextField, fmtQty } from '../common/fields'
import { OpeningsEditor } from './OpeningsEditor'
import { ErrorBoundary } from '../common/ErrorBoundary'
import { RoomsEditor } from './RoomsEditor'
import { DormersEditor } from './DormersEditor'
import { LevelsDiagram } from './LevelsDiagram'

export type Update = (fn: (p: ProjectInput) => void) => void

const CM = { unit: 'cm', scale: 100 }

function PourFields({ title, pp, set }: { title: string; pp: ConcretePourParams; set: (fn: (pp: ConcretePourParams) => void) => void }) {
  return (
    <div className="pour">
      <h3>{title}</h3>
      <TextField label="Klasa betonu" value={pp.concreteClass} onChange={(v) => set((x) => { x.concreteClass = v })} />
      <NumField nonNegative allowEmpty={false} label="Zapas betonu" unit="%" value={pp.extraPercent} onChange={(v) => set((x) => { x.extraPercent = v ?? 0 })} />
      <NumField positive allowEmpty={false} label="Zamówienie zaokrąglone w górę do" unit="m³" value={pp.orderStep ?? 0.5} onChange={(v) => set((x) => { x.orderStep = v ?? 0.5 })} />
      <Select
        label="Transport"
        value={pp.transport.mode}
        options={[
          { value: 'perTrip', label: 'za kurs gruszki' },
          { value: 'perM3', label: 'za m³' },
          { value: 'included', label: 'wliczony w cenę betonu' },
        ]}
        onChange={(m) =>
          set((x) => {
            x.transport = m === 'perTrip' ? { mode: 'perTrip', truckCapacityM3: 8, pricePerTripGrosze: null } : m === 'perM3' ? { mode: 'perM3', pricePerM3Grosze: null } : { mode: 'included' }
          })
        }
      />
      {pp.transport.mode === 'perTrip' && (
        <NumField
          positive
          allowEmpty={false}
          label="Pojemność gruszki"
          unit="m³"
          value={pp.transport.truckCapacityM3}
          onChange={(v) => set((x) => { if (x.transport.mode === 'perTrip') x.transport.truckCapacityM3 = v ?? 8 })}
        />
      )}
      <Check label="Potrzebna pompa (wynajem — kwota w kosztorysie)" checked={pp.pump.enabled} onChange={(v) => set((x) => { x.pump.enabled = v })} />
      {pp.fibers && <Check label="Włókna kupowane osobno" checked={pp.fibers.enabled} onChange={(v) => set((x) => { if (x.fibers) x.fibers.enabled = v })} />}
    </div>
  )
}

export function ProjectForm({ project, update }: { project: ProjectInput; update: Update }) {
  // Obliczenia pomocnicze (podgląd) — błąd nie może wywrócić formularza
  let base: ReturnType<typeof projectBase> | null = null
  let calcError: string | null = null
  try {
    base = projectBase(project)
  } catch (e) {
    calcError = e instanceof Error ? e.message : String(e)
  }
  const roof = base ? roofOf(project).roof : null
  const f = project.foundation
  const gableSpan = gableSpanInterior(project)
  const gables = project.roof.pitchDeg !== null && project.roof.pitchDeg > 0 && project.roof.pitchDeg < 90 ? gableWallsGross(gableSpan, project.wallThickness, project.roof.pitchDeg) : null
  const gableBase = gableSpan + 2 * project.wallThickness
  const gableHeight = project.roof.pitchDeg !== null ? (gableBase / 2) * Math.tan((project.roof.pitchDeg * Math.PI) / 180) : 0

  return (
    <div className="form-grid">
      <Section title="Projekt">
        <TextField label="Nazwa projektu" value={project.name} onChange={(v) => update((p) => { p.name = v })} />
        <NumField nonNegative allowEmpty={false} label="Rezerwa na nieprzewidziane" unit="%" value={project.reservePercent} onChange={(v) => update((p) => { p.reservePercent = v ?? 0 })} />
        <Select
          label="VAT — podgląd netto (ceny wpisujesz brutto)"
          value={String(project.vatPercent ?? '')}
          options={[
            { value: '', label: 'bez podglądu' },
            { value: '8', label: '8%' },
            { value: '23', label: '23%' },
          ]}
          onChange={(v) => update((p) => { p.vatPercent = v === '' ? null : Number(v) })}
        />
      </Section>

      <Section title="1. Geometria (wymiary wewnętrzne)">
        <NumField positive allowEmpty={false} label="Długość wewnętrzna" {...CM} required value={project.footprint.length} onChange={(v) => update((p) => { p.footprint.length = v ?? p.footprint.length })} />
        <NumField positive allowEmpty={false} label="Szerokość wewnętrzna" {...CM} required value={project.footprint.width} onChange={(v) => update((p) => { p.footprint.width = v ?? p.footprint.width })} />
        <NumField positive allowEmpty={false} label="Ściana nośna — grubość" {...CM} value={project.wallThickness} onChange={(v) => update((p) => { p.wallThickness = v ?? 0.24 })} />
        <NumField nonNegative allowEmpty={false} label="EPS elewacja (ściany; szczyty do linii okapu)" {...CM} value={project.facadeInsulation} onChange={(v) => update((p) => { p.facadeInsulation = v ?? 0 })} />
        <Check label="Szczyty nad okapem ocieplone wełną skalną (pod boazerią)" checked={project.gables.insulated} onChange={(v) => update((p) => { p.gables.insulated = v })} />
        {project.gables.insulated && (
          <NumField positive allowEmpty={false} label="Wełna na szczytach — grubość" {...CM} value={project.gables.woolThickness} onChange={(v) => update((p) => { p.gables.woolThickness = v ?? 0.2 })} />
        )}
        <NumField nonNegative allowEmpty={false} label="XPS fundament" {...CM} value={project.foundationInsulation} onChange={(v) => update((p) => { p.foundationInsulation = v ?? 0 })} />
        {base ? (
          <p className="calc">
            Obwód w osi: <b>{fmtQty(base.pOs.value)} m</b>, pole wewn.: <b>{fmtQty(base.aWew.value)} m²</b>, wymiary zewn.:{' '}
            <b>
              {fmtQty(base.geo.outerDimensions.value.length)} × {fmtQty(base.geo.outerDimensions.value.width)} m
            </b>
          </p>
        ) : (
          <p className="calc todo-inline">Nie można policzyć: {calcError}</p>
        )}
      </Section>

      <Section title="2. Wysokości (±0 = gotowa posadzka)" note="Warstwy podłogi i sufitu podajesz Ty — z nich program liczy wysokość ścian (mur stoi na chudziaku).">
        <NumField positive allowEmpty={false} label="Wysokość w świetle (posadzka → sufit)" {...CM} value={project.clearHeight} onChange={(v) => update((p) => { p.clearHeight = v ?? 2.7 })} />
        <NumField nonNegative label="Izolacja na chudziaku" {...CM} required value={project.floorLayers.insulation} onChange={(v) => update((p) => { p.floorLayers.insulation = v })} />
        <NumField nonNegative label="Wylewka" {...CM} required value={project.floorLayers.screed} onChange={(v) => update((p) => { p.floorLayers.screed = v })} />
        <NumField nonNegative label="Płytka / panel" {...CM} required value={project.floorLayers.finish} onChange={(v) => update((p) => { p.floorLayers.finish = v })} />
        <NumField positive allowEmpty={false} label="Chudziak — grubość" {...CM} value={project.slabThickness} onChange={(v) => update((p) => { p.slabThickness = v ?? 0.1 })} />
        <NumField nonNegative allowEmpty={false} label="Sufit: płyta GK" {...CM} value={project.ceiling.board} onChange={(v) => update((p) => { p.ceiling.board = v ?? 0 })} />
        <NumField nonNegative allowEmpty={false} label="Sufit: stelaż (2 × profil)" {...CM} value={project.ceiling.grid} onChange={(v) => update((p) => { p.ceiling.grid = v ?? 0 })} />
        <NumField nonNegative allowEmpty={false} label="Sufit: pustka nad profilami" {...CM} value={project.ceiling.voidAbove} onChange={(v) => update((p) => { p.ceiling.voidAbove = v ?? 0 })} />
      </Section>

      <Section title="3. Ściany nośne">
        <NumField positive label="Bloczek — długość" {...CM} required value={project.wall.blockLength} onChange={(v) => update((p) => { p.wall.blockLength = v })} />
        <NumField positive label="Bloczek — wysokość" {...CM} required value={project.wall.blockHeight} onChange={(v) => update((p) => { p.wall.blockHeight = v })} />
        <NumField nonNegative allowEmpty={false} label="Spoina" {...CM} value={project.wall.jointThickness} onChange={(v) => update((p) => { p.wall.jointThickness = v ?? 0 })} />
        <NumField nonNegative allowEmpty={false} label="Warstwa wyrównawcza" {...CM} value={project.wall.levelingLayer} onChange={(v) => update((p) => { p.wall.levelingLayer = v ?? 0 })} />
        <NumField positive allowEmpty={false} label="Wieniec — wysokość minimalna" {...CM} value={project.wall.ringBeamMin} onChange={(v) => update((p) => { p.wall.ringBeamMin = v ?? 0.25 })} />
        <NumField nonNegative allowEmpty={false} label="Reszta dokładana do wieńca (maks.)" {...CM} value={project.wall.maxRingBeamExtension} onChange={(v) => update((p) => { p.wall.maxRingBeamExtension = v ?? 0 })} />
        {base && <WallHeightBreakdown project={project} base={base} update={update} calcError={calcError} />}
        <div className="calc">
          {gables ? (
            <>
              Ściany szczytowe na wieńcu (2 szt.): podstawa <b>{fmtQty(gableBase, 2)} m</b>, wysokość{' '}
              <b>{fmtQty(gableHeight, 2)} m</b>, razem <b>{fmtQty(gables.value, 2)} m²</b> brutto — doliczone do bloczków ścian nośnych
            </>
          ) : (
            <span className="todo-inline">Ściany szczytowe: podaj kąt nachylenia dachu</span>
          )}
        </div>
      </Section>

      <Section title="4. Ściany działowe">
        <NumField positive label="Długość ścian działowych" unit="m" required value={project.partitions.length} onChange={(v) => update((p) => { p.partitions.length = v })} />
        <NumField nonNegative allowEmpty={false} label="Ściana wyżej niż górna krawędź profili GK o" {...CM} value={project.partitions.topMargin} onChange={(v) => update((p) => { p.partitions.topMargin = v ?? 0.03 })} />
        {base && <PartitionHeightBreakdown project={project} base={base} update={update} />}
        <NumField positive label="Bloczek — długość" {...CM} required value={project.partitionBlock.blockLength} onChange={(v) => update((p) => { p.partitionBlock.blockLength = v })} />
        <NumField positive label="Bloczek — wysokość" {...CM} required value={project.partitionBlock.blockHeight} onChange={(v) => update((p) => { p.partitionBlock.blockHeight = v })} />
        <NumField nonNegative allowEmpty={false} label="Spoina" {...CM} value={project.partitionBlock.jointThickness} onChange={(v) => update((p) => { p.partitionBlock.jointThickness = v ?? 0 })} />
      </Section>

      <Section title="5. Fundament" note="Wymiary ławy i bloczka fundamentowego podajesz Ty.">
        <NumField positive label="Ława — szerokość" {...CM} required value={f.footingWidth} onChange={(v) => update((p) => { p.foundation.footingWidth = v })} />
        <NumField positive label="Ława — wysokość" {...CM} required value={f.footingHeight} onChange={(v) => update((p) => { p.foundation.footingHeight = v })} />
        <NumField positive label="Bloczek fund. — długość" {...CM} required value={f.blockLength} onChange={(v) => update((p) => { p.foundation.blockLength = v })} />
        <NumField positive label="Bloczek fund. — szerokość (= grubość ściany i wieńca)" {...CM} required value={f.blockWidth} onChange={(v) => update((p) => { p.foundation.blockWidth = v })} />
        <NumField positive label="Bloczek fund. — wysokość" {...CM} required value={f.blockHeight} onChange={(v) => update((p) => { p.foundation.blockHeight = v })} />
        <NumField nonNegative label="Spoina" {...CM} required value={f.jointThickness} onChange={(v) => update((p) => { p.foundation.jointThickness = v })} />
        <NumField positive label="Liczba warstw bloczków" unit="szt" required value={f.layers} onChange={(v) => update((p) => { p.foundation.layers = v === null ? null : Math.round(v) })} />
        <NumField positive allowEmpty={false} label="Wieniec fund. — wysokość" {...CM} value={f.ringBeamHeight} onChange={(v) => update((p) => { p.foundation.ringBeamHeight = v ?? 0.25 })} />
      </Section>

      <section className="card span2">
        <h2>Schemat poziomów (kontrola danych)</h2>
        <ErrorBoundary inline resetKey={project}>
          <LevelsDiagram project={project} />
        </ErrorBoundary>
      </section>

      <section className="card wide">
        <h2>6. Dach</h2>
        <div className="fields roof-fields">
        <NumField positive label="Kąt nachylenia" unit="°" required value={project.roof.pitchDeg} onChange={(v) => update((p) => { p.roof.pitchDeg = v })} />
        <NumField nonNegative label="Okap boczny (od lica EPS)" {...CM} required value={project.roof.eaveOverhang} onChange={(v) => update((p) => { p.roof.eaveOverhang = v })} />
        <NumField nonNegative label="Okap szczytowy (od lica EPS)" {...CM} required value={project.roof.gableOverhang} onChange={(v) => update((p) => { p.roof.gableOverhang = v })} />
        <Check label="Kalenica równolegle do dłuższego boku" checked={project.roof.ridgeAlongLonger} onChange={(v) => update((p) => { p.roof.ridgeAlongLonger = v })} />
        <NumField positive allowEmpty={false} label="Rozstaw wiązarów" {...CM} value={project.roof.trussSpacing} onChange={(v) => update((p) => { p.roof.trussSpacing = v ?? 0.9 })} />
        <NumField positive label="Liczba wiązarów (puste = z rozstawu)" unit="szt" value={project.roof.trussCount} onChange={(v) => update((p) => { p.roof.trussCount = v })} />
        {roof && base && (
          <p className="calc">
            Połać s = <b>{fmtQty(roof.slope)} m</b>, kalenica R = <b>{fmtQty(roof.ridgeLength)} m</b>, dach = <b>{fmtQty(roof.totalArea)} m²</b>, kalenica{' '}
            <b>+{fmtQty((base.ringTop.value + roof.ridgeRise) * 100, 0)} cm</b> (bez grubości pokrycia)
          </p>
        )}
              </div>
        <ErrorBoundary inline resetKey={project}>
          <DormersEditor project={project} update={update} />
        </ErrorBoundary>
      </section>

      <Section title="7. Betonowania">
        <PourFields title="Ławy" pp={project.concrete.footing} set={(fn) => update((p) => fn(p.concrete.footing))} />
        <PourFields title="Wieniec fundamentowy" pp={project.concrete.foundationRingBeam} set={(fn) => update((p) => fn(p.concrete.foundationRingBeam))} />
        <PourFields title="Chudziak" pp={project.concrete.slab} set={(fn) => update((p) => fn(p.concrete.slab))} />
        <PourFields title="Wieniec ścian" pp={project.concrete.wallRingBeam} set={(fn) => update((p) => fn(p.concrete.wallRingBeam))} />
      </Section>

      <section className="card wide">
        <h2>8. Otwory</h2>
        <OpeningsEditor project={project} update={update} />
      </section>

      <section className="card wide">
        <h2>9. Pomieszczenia</h2>
        <RoomsEditor project={project} update={update} />
      </section>

      <Section title="10. Sufit — rozmieszczenie profili" note="Profile główne wzdłuż dłuższego boku pomieszczenia, nośne krzyżowo; płyty prostopadle do nośnych.">
        <NumField positive allowEmpty={false} label="Profile główne — rozstaw" {...CM} value={project.ceilingRules.mainSpacing} onChange={(v) => update((p) => { p.ceilingRules.mainSpacing = v ?? 1 })} />
        <NumField nonNegative allowEmpty={false} label="Profile główne — skrajny od ściany" {...CM} value={project.ceilingRules.mainEdge} onChange={(v) => update((p) => { p.ceilingRules.mainEdge = v ?? 0.15 })} />
        <NumField positive allowEmpty={false} label="Wieszaki — rozstaw (ciężkie płyty 75)" {...CM} value={project.ceilingRules.hangerSpacing} onChange={(v) => update((p) => { p.ceilingRules.hangerSpacing = v ?? 0.9 })} />
        <NumField nonNegative allowEmpty={false} label="Wieszaki — skrajny od ściany" {...CM} value={project.ceilingRules.hangerEdge} onChange={(v) => update((p) => { p.ceilingRules.hangerEdge = v ?? 0.4 })} />
        <NumField positive allowEmpty={false} label="Profile nośne — rozstaw" {...CM} value={project.ceilingRules.carrierSpacing} onChange={(v) => update((p) => { p.ceilingRules.carrierSpacing = v ?? 0.4 })} />
        <NumField nonNegative allowEmpty={false} label="Profile nośne — skrajny od ściany" {...CM} value={project.ceilingRules.carrierEdge} onChange={(v) => update((p) => { p.ceilingRules.carrierEdge = v ?? 0.1 })} />
        <NumField positive allowEmpty={false} label="Kołki UD27 — rozstaw" {...CM} value={project.ceilingRules.udAnchorSpacing} onChange={(v) => update((p) => { p.ceilingRules.udAnchorSpacing = v ?? 0.6 })} />
      </Section>
    </div>
  )
}

/** Rozpisanie wysokości ścian działowych krok po kroku (wg użytkownika: 3 cm ponad górną krawędź profili GK). */
function PartitionHeightBreakdown({ project, base, update }: { project: ProjectInput; base: ReturnType<typeof projectBase>; update: Update }) {
  const cm = (m: number) => fmtQty(m * 100, 1)
  const pp = project.partitions
  const manual = pp.heightAboveFloor !== null || pp.height !== null
  const fl = project.floorLayers
  const over = base.wallHeightMissing.length === 0 && base.partitionAbove.value > base.ringTop.value + 1e-9
  return (
    <div className="calc partition-breakdown">
      {manual ? (
        <p>
          Wysokość wpisana wcześniej ręcznie:{' '}
          <b>{pp.height !== null ? `${cm(pp.height)} cm muru od chudziaka` : `${cm(pp.heightAboveFloor!)} cm od posadzki`}</b>{' '}
          <button className="btn" onClick={() => update((p) => { p.partitions.heightAboveFloor = null; p.partitions.height = null })}>
            Licz automatycznie
          </button>
        </p>
      ) : (
        <table className="sum-table breakdown">
          <tbody>
            <tr><th>Gotowa posadzka → gotowy sufit (w świetle)</th><td>{cm(project.clearHeight)} cm</td></tr>
            <tr><th>+ płyta GK</th><td>{cm(project.ceiling.board)} cm</td></tr>
            <tr><th>+ stelaż (do górnej krawędzi profili)</th><td>{cm(project.ceiling.grid)} cm</td></tr>
            <tr><th>+ ściana wyżej niż profile o</th><td>{cm(pp.topMargin)} cm</td></tr>
            <tr><th><b>= wysokość od gotowej posadzki</b></th><td><b>{cm(base.partitionAbove.value)} cm</b></td></tr>
            {base.floorBuild && base.partitionHeight ? (
              <>
                <tr>
                  <th>+ warstwy pod posadzką do chudziaka (izolacja {cm(fl.insulation ?? 0)} + wylewka {cm(fl.screed ?? 0)} + wykończenie {cm(fl.finish ?? 0)})</th>
                  <td>{cm(base.floorBuild.value)} cm</td>
                </tr>
                <tr><th><b>= wysokość muru od chudziaka</b> (pierwsza warstwa na chudziaku)</th><td><b>{cm(base.partitionHeight.value)} cm</b></td></tr>
              </>
            ) : (
              <tr><th className="todo-inline">Wysokość muru od chudziaka: uzupełnij warstwy podłogi</th><td /></tr>
            )}
          </tbody>
        </table>
      )}
      {over && (
        <p className="todo-inline">
          Uwaga: ściana działowa ({cm(base.partitionAbove.value)} cm) wychodzi ponad górę wieńca ścian nośnych ({cm(base.ringTop.value)} cm od posadzki) o{' '}
          {cm(base.partitionAbove.value - base.ringTop.value)} cm.
        </p>
      )}
    </div>
  )
}

/** Wysokość ścian nośnych krok po kroku: sufit → góra wieńca → od chudziaka → warstwy bloczków i wieniec. */
function WallHeightBreakdown({ project, base, update, calcError }: { project: ProjectInput; base: ReturnType<typeof projectBase>; update: Update; calcError: string | null }) {
  const cm = (m: number) => fmtQty(m * 100, 1)
  const wl = base.wallLayers?.value
  const c = project.ceiling
  const w = project.wall
  return (
    <div className="calc wall-breakdown">
      {project.wallHeight !== null ? (
        <p>
          Góra wieńca wpisana wcześniej ręcznie: <b>+{cm(project.wallHeight)} cm</b> (z sufitu wyszłoby +{cm(base.ringTopHint.value)} cm){' '}
          <button className="btn" onClick={() => update((p) => { p.wallHeight = null })}>
            Licz automatycznie
          </button>
        </p>
      ) : null}
      <table className="sum-table breakdown">
        <tbody>
          {project.wallHeight === null && (
            <>
              <tr><th>Gotowa posadzka → gotowy sufit (w świetle)</th><td>{cm(project.clearHeight)} cm</td></tr>
              <tr><th>+ płyta GK + stelaż + pustka nad profilami</th><td>{cm(c.board)} + {cm(c.grid)} + {cm(c.voidAbove)} cm</td></tr>
            </>
          )}
          <tr><th><b>= góra wieńca ścian nośnych</b> (od gotowej posadzki)</th><td><b>+{cm(base.ringTop.value)} cm</b></td></tr>
          {wl && base.floorBuild ? (
            <>
              <tr><th>+ warstwy pod posadzką do chudziaka (pierwsza warstwa bloczków stoi na chudziaku)</th><td>{cm(base.floorBuild.value)} cm</td></tr>
              <tr><th><b>= od chudziaka do góry wieńca</b>{w.levelingLayer > 0 ? ` (− warstwa wyrównawcza ${cm(w.levelingLayer)} cm)` : ''}</th><td><b>{cm(wl.height)} cm</b></td></tr>
              <tr><th>Pełne warstwy bloczków: {wl.fullLayers} × {cm(wl.layerHeight)} cm</th><td>{cm(wl.fullLayers * wl.layerHeight)} cm</td></tr>
              <tr>
                <th>
                  Reszta ponad warstwy i wieniec {cm(w.ringBeamMin)} cm{' '}
                  {wl.cutLayerHeight > 0
                    ? `— więcej niż ${cm(w.maxRingBeamExtension)} cm → warstwa bloczków docinana`
                    : wl.remainder > 0
                      ? `— do ${cm(w.maxRingBeamExtension)} cm → dokładana do wieńca`
                      : '— brak'}
                </th>
                <td>{cm(wl.remainder)} cm</td>
              </tr>
              {wl.cutLayerHeight > 0 && <tr><th>Warstwa docinana</th><td>{cm(wl.cutLayerHeight)} cm</td></tr>}
              <tr><th><b>Mur z bloczków</b> (od chudziaka; od posadzki do +{cm(wl.ringBeamBottom)} cm)</th><td><b>{cm(wl.masonryHeight)} cm</b></td></tr>
              <tr><th><b>Wieniec</b> (min. {cm(w.ringBeamMin)}, maks. {cm(w.ringBeamMin + w.maxRingBeamExtension)} cm)</th><td><b>{cm(wl.ringBeamHeight)} cm</b></td></tr>
            </>
          ) : (
            <tr><th className="todo-inline">{calcError ?? `Uzupełnij: ${base.wallMissing.join(', ')}`}</th><td /></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
