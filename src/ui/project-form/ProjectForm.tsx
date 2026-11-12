// Dane projektu: geometria, wysokości, ściany, fundament, dach, betonowania, otwory.

import type { ProjectInput } from '../../model/project'
import type { ConcretePourParams } from '../../engine/concrete'
import { levelList } from '../../engine/levels'
import { projectBase } from '../../engine/stages/common'
import { roofOf } from '../../engine/stages/sszRoof'
import { Check, NumField, Section, Select, TextField, fmtQty } from '../common/fields'
import { OpeningsEditor } from './OpeningsEditor'
import { RoomsEditor } from './RoomsEditor'

export type Update = (fn: (p: ProjectInput) => void) => void

const CM = { unit: 'cm', scale: 100 }

function PourFields({ title, pp, set }: { title: string; pp: ConcretePourParams; set: (fn: (pp: ConcretePourParams) => void) => void }) {
  return (
    <div className="pour">
      <h3>{title}</h3>
      <TextField label="Klasa betonu" value={pp.concreteClass} onChange={(v) => set((x) => { x.concreteClass = v })} />
      <NumField label="Naddatek objętości" unit="%" value={pp.extraPercent} onChange={(v) => set((x) => { x.extraPercent = v ?? 0 })} />
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
  const base = projectBase(project)
  const roof = roofOf(project).roof
  const wl = base.wallLayers?.value
  const f = project.foundation

  return (
    <div className="form-grid">
      <Section title="Projekt">
        <TextField label="Nazwa projektu" value={project.name} onChange={(v) => update((p) => { p.name = v })} />
        <NumField label="Rezerwa na nieprzewidziane" unit="%" value={project.reservePercent} onChange={(v) => update((p) => { p.reservePercent = v ?? 0 })} />
      </Section>

      <Section title="1. Geometria (wymiary wewnętrzne)">
        <NumField label="Długość wewnętrzna" {...CM} required value={project.footprint.length} onChange={(v) => update((p) => { p.footprint.length = v ?? 0 })} />
        <NumField label="Szerokość wewnętrzna" {...CM} required value={project.footprint.width} onChange={(v) => update((p) => { p.footprint.width = v ?? 0 })} />
        <NumField label="Ściana nośna — grubość" {...CM} value={project.wallThickness} onChange={(v) => update((p) => { p.wallThickness = v ?? 0.24 })} />
        <NumField label="EPS elewacja" {...CM} value={project.facadeInsulation} onChange={(v) => update((p) => { p.facadeInsulation = v ?? 0 })} />
        <NumField label="XPS fundament" {...CM} value={project.foundationInsulation} onChange={(v) => update((p) => { p.foundationInsulation = v ?? 0 })} />
        <p className="calc">
          Obwód w osi: <b>{fmtQty(base.pOs.value)} m</b>, pole wewn.: <b>{fmtQty(base.aWew.value)} m²</b>, wymiary zewn.:{' '}
          <b>
            {fmtQty(base.geo.outerDimensions.value.length)} × {fmtQty(base.geo.outerDimensions.value.width)} m
          </b>
        </p>
      </Section>

      <Section title="2. Wysokości (±0 = gotowa posadzka)" note="Warstwy podłogi podajesz Ty — od nich liczona jest wysokość ścian.">
        <NumField label="Wysokość w świetle (posadzka → sufit)" {...CM} value={project.clearHeight} onChange={(v) => update((p) => { p.clearHeight = v ?? 2.7 })} />
        <NumField label="Izolacja na chudziaku" {...CM} required value={project.floorLayers.insulation} onChange={(v) => update((p) => { p.floorLayers.insulation = v })} />
        <NumField label="Wylewka" {...CM} required value={project.floorLayers.screed} onChange={(v) => update((p) => { p.floorLayers.screed = v })} />
        <NumField label="Płytka / panel" {...CM} required value={project.floorLayers.finish} onChange={(v) => update((p) => { p.floorLayers.finish = v })} />
        <NumField label="Chudziak — grubość" {...CM} value={project.slabThickness} onChange={(v) => update((p) => { p.slabThickness = v ?? 0.1 })} />
        <NumField label="Sufit: płyta GK" {...CM} value={project.ceiling.board} onChange={(v) => update((p) => { p.ceiling.board = v ?? 0 })} />
        <NumField label="Sufit: stelaż (2 × profil)" {...CM} value={project.ceiling.grid} onChange={(v) => update((p) => { p.ceiling.grid = v ?? 0 })} />
        <NumField label="Sufit: pustka nad profilami" {...CM} value={project.ceiling.voidAbove} onChange={(v) => update((p) => { p.ceiling.voidAbove = v ?? 0 })} />
      </Section>

      <Section title="3. Ściany nośne">
        <NumField label="Bloczek — długość" {...CM} required value={project.wall.blockLength} onChange={(v) => update((p) => { p.wall.blockLength = v })} />
        <NumField label="Bloczek — wysokość" {...CM} required value={project.wall.blockHeight} onChange={(v) => update((p) => { p.wall.blockHeight = v })} />
        <NumField label="Spoina" {...CM} value={project.wall.jointThickness} onChange={(v) => update((p) => { p.wall.jointThickness = v ?? 0 })} />
        <NumField label="Warstwa wyrównawcza" {...CM} value={project.wall.levelingLayer} onChange={(v) => update((p) => { p.wall.levelingLayer = v ?? 0 })} />
        <NumField label="Wieniec — wysokość minimalna" {...CM} value={project.wall.ringBeamMin} onChange={(v) => update((p) => { p.wall.ringBeamMin = v ?? 0.25 })} />
        <NumField label="Reszta dokładana do wieńca (maks.)" {...CM} value={project.wall.maxRingBeamExtension} onChange={(v) => update((p) => { p.wall.maxRingBeamExtension = v ?? 0 })} />
        <div className="calc levels">
          {wl ? (
            <>
              Góra wieńca ścian: <b>+{fmtQty(base.ringTop.value * 100, 1)} cm</b>; warstw pełnych: <b>{wl.fullLayers}</b>
              {wl.cutLayerHeight > 0 && <>, warstwa docinana: <b>{fmtQty(wl.cutLayerHeight * 100, 1)} cm</b></>}; wieniec:{' '}
              <b>{fmtQty(wl.ringBeamHeight * 100, 1)} cm</b>
            </>
          ) : (
            <span className="todo-inline">Uzupełnij: {base.wallMissing.join(', ')}</span>
          )}
        </div>
      </Section>

      <Section title="4. Ściany działowe">
        <NumField label="Długość ścian działowych" unit="m" required value={project.partitions.length} onChange={(v) => update((p) => { p.partitions.length = v })} />
        <NumField label="Wysokość (puste = od chudziaka do sufitu)" {...CM} value={project.partitions.height} onChange={(v) => update((p) => { p.partitions.height = v })} />
        <NumField label="Bloczek — długość" {...CM} required value={project.partitionBlock.blockLength} onChange={(v) => update((p) => { p.partitionBlock.blockLength = v })} />
        <NumField label="Bloczek — wysokość" {...CM} required value={project.partitionBlock.blockHeight} onChange={(v) => update((p) => { p.partitionBlock.blockHeight = v })} />
        <NumField label="Spoina" {...CM} value={project.partitionBlock.jointThickness} onChange={(v) => update((p) => { p.partitionBlock.jointThickness = v ?? 0 })} />
      </Section>

      <Section title="5. Fundament" note="Wymiary ławy i bloczka fundamentowego podajesz Ty.">
        <NumField label="Ława — szerokość" {...CM} required value={f.footingWidth} onChange={(v) => update((p) => { p.foundation.footingWidth = v })} />
        <NumField label="Ława — wysokość" {...CM} required value={f.footingHeight} onChange={(v) => update((p) => { p.foundation.footingHeight = v })} />
        <NumField label="Bloczek fund. — długość" {...CM} required value={f.blockLength} onChange={(v) => update((p) => { p.foundation.blockLength = v })} />
        <NumField label="Bloczek fund. — szerokość (= grubość ściany i wieńca)" {...CM} required value={f.blockWidth} onChange={(v) => update((p) => { p.foundation.blockWidth = v })} />
        <NumField label="Bloczek fund. — wysokość" {...CM} required value={f.blockHeight} onChange={(v) => update((p) => { p.foundation.blockHeight = v })} />
        <NumField label="Spoina" {...CM} required value={f.jointThickness} onChange={(v) => update((p) => { p.foundation.jointThickness = v })} />
        <NumField label="Liczba warstw bloczków" unit="szt" required value={f.layers} onChange={(v) => update((p) => { p.foundation.layers = v === null ? null : Math.round(v) })} />
        <NumField label="Wieniec fund. — wysokość" {...CM} value={f.ringBeamHeight} onChange={(v) => update((p) => { p.foundation.ringBeamHeight = v ?? 0.25 })} />
        {base.levels ? (
          <ul className="calc level-list">
            {levelList(base.levels, base.ringTop.value).map((l) => (
              <li key={l.label}>
                <b>{l.text}</b> {l.label}
              </li>
            ))}
          </ul>
        ) : (
          <p className="calc todo-inline">Schemat poziomów — uzupełnij: {base.levelsMissing.join(', ')}</p>
        )}
      </Section>

      <Section title="6. Dach">
        <NumField label="Kąt nachylenia" unit="°" required value={project.roof.pitchDeg} onChange={(v) => update((p) => { p.roof.pitchDeg = v })} />
        <NumField label="Okap boczny (od lica EPS)" {...CM} required value={project.roof.eaveOverhang} onChange={(v) => update((p) => { p.roof.eaveOverhang = v })} />
        <NumField label="Okap szczytowy (od lica EPS)" {...CM} required value={project.roof.gableOverhang} onChange={(v) => update((p) => { p.roof.gableOverhang = v })} />
        <Check label="Kalenica równolegle do dłuższego boku" checked={project.roof.ridgeAlongLonger} onChange={(v) => update((p) => { p.roof.ridgeAlongLonger = v })} />
        <NumField label="Rozstaw wiązarów" {...CM} value={project.roof.trussSpacing} onChange={(v) => update((p) => { p.roof.trussSpacing = v ?? 0.9 })} />
        <NumField label="Liczba wiązarów (puste = z rozstawu)" unit="szt" value={project.roof.trussCount} onChange={(v) => update((p) => { p.roof.trussCount = v })} />
        {roof && (
          <p className="calc">
            Połać s = <b>{fmtQty(roof.slope)} m</b>, kalenica R = <b>{fmtQty(roof.ridgeLength)} m</b>, dach = <b>{fmtQty(roof.totalArea)} m²</b>, kalenica{' '}
            <b>+{fmtQty((base.ringTop.value + roof.ridgeRise) * 100, 0)} cm</b> (bez grubości pokrycia)
          </p>
        )}
      </Section>

      <Section title="7. Betonowania">
        <PourFields title="Ławy" pp={project.concrete.footing} set={(fn) => update((p) => fn(p.concrete.footing))} />
        <PourFields title="Wieniec fundamentowy" pp={project.concrete.foundationRingBeam} set={(fn) => update((p) => fn(p.concrete.foundationRingBeam))} />
        <PourFields title="Chudziak" pp={project.concrete.slab} set={(fn) => update((p) => fn(p.concrete.slab))} />
        <PourFields title="Wieniec ścian" pp={project.concrete.wallRingBeam} set={(fn) => update((p) => fn(p.concrete.wallRingBeam))} />
      </Section>

      <section className="card wide">
        <h2>8. Otwory</h2>
        <OpeningsEditor openings={project.openings} update={update} />
      </section>

      <section className="card wide">
        <h2>9. Pomieszczenia</h2>
        <RoomsEditor project={project} update={update} />
      </section>

      <Section title="10. Sufit — rozmieszczenie profili" note="Profile główne wzdłuż dłuższego boku pomieszczenia, nośne krzyżowo; płyty prostopadle do nośnych.">
        <NumField label="Profile główne — rozstaw" {...CM} value={project.ceilingRules.mainSpacing} onChange={(v) => update((p) => { p.ceilingRules.mainSpacing = v ?? 1 })} />
        <NumField label="Profile główne — skrajny od ściany" {...CM} value={project.ceilingRules.mainEdge} onChange={(v) => update((p) => { p.ceilingRules.mainEdge = v ?? 0.15 })} />
        <NumField label="Wieszaki — rozstaw (ciężkie płyty 75)" {...CM} value={project.ceilingRules.hangerSpacing} onChange={(v) => update((p) => { p.ceilingRules.hangerSpacing = v ?? 0.9 })} />
        <NumField label="Wieszaki — skrajny od ściany" {...CM} value={project.ceilingRules.hangerEdge} onChange={(v) => update((p) => { p.ceilingRules.hangerEdge = v ?? 0.4 })} />
        <NumField label="Profile nośne — rozstaw" {...CM} value={project.ceilingRules.carrierSpacing} onChange={(v) => update((p) => { p.ceilingRules.carrierSpacing = v ?? 0.4 })} />
        <NumField label="Profile nośne — skrajny od ściany" {...CM} value={project.ceilingRules.carrierEdge} onChange={(v) => update((p) => { p.ceilingRules.carrierEdge = v ?? 0.1 })} />
        <NumField label="Kołki UD27 — rozstaw" {...CM} value={project.ceilingRules.udAnchorSpacing} onChange={(v) => update((p) => { p.ceilingRules.udAnchorSpacing = v ?? 0.6 })} />
      </Section>
    </div>
  )
}
