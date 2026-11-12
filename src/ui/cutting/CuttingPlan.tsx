// Plan cięcia arkuszy (SVG) — rysuje wynik engine/cutting.ts, niczego nie przelicza.

import type { CutSegment, CuttingResult, CuttingVariant } from '../../engine/cutting'
import './cutting.css'

const PALETTE = ['#4dabf7', '#69db7c', '#ffd43b', '#ff8787', '#b197fc', '#63e6be', '#ffa94d', '#f783ac']

function cm(m: number): string {
  return (Math.round(m * 1000) / 10).toLocaleString('pl-PL', { maximumFractionDigits: 1 })
}

export function CuttingPlan({
  result,
  variant,
  chosen = false,
  sheet,
  stripWidth,
  segments,
}: {
  result: CuttingResult
  variant: CuttingVariant
  chosen?: boolean
  sheet: { width: number; length: number }
  stripWidth: number
  segments: CutSegment[]
}) {
  const long = Math.max(sheet.width, sheet.length)
  const short = Math.min(sheet.width, sheet.length)
  const color = new Map(segments.map((s, i) => [s.id, PALETTE[i % PALETTE.length]]))
  const label = new Map(segments.map((s) => [s.id, s.label]))
  const sheets = Array.from({ length: variant.sheets }, (_, i) => variant.strips.filter((s) => s.sheet === i))
  const W = 260
  const scale = W / long
  const H = short * scale

  return (
    <div className="cp">
      <p className="cp-instr">
        <b>Wariant {variant.key}:</b> {variant.instruction}.{' '}
        {variant.sheets} szt, łączeń {variant.joints}, odpad {variant.wasteArea.toLocaleString('pl-PL')} m² (
        {variant.wastePercent.toLocaleString('pl-PL', { maximumFractionDigits: 1 })}%)
        {chosen && <span className="cp-best">wybrany</span>}
        {result.cheaper === variant.key && <span className="cp-best cp-cheap">tańszy</span>}
      </p>
      <div className="cp-grid">
        {sheets.map((strips, si) => (
          <figure key={si} className="cp-sheet">
            <svg viewBox={`-1 -1 ${W + 2} ${H + 2}`} width="100%" role="img" aria-label={`Arkusz ${si + 1}`}>
              <defs>
                <pattern id={`hatch-${si}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <line x1="0" y1="0" x2="0" y2="6" className="cp-hatch" />
                </pattern>
              </defs>
              <rect x={0} y={0} width={W} height={H} fill={`url(#hatch-${si})`} className="cp-frame" />
              {Array.from({ length: variant.stripsPerSheet }, (_, slot) => {
                const st = strips.find((s) => s.slot === slot)
                // A: pasy poziome (wzdłuż dłuższego boku); B: pasy pionowe (wzdłuż krótszego)
                const sx = variant.key === 'A' ? 0 : slot * stripWidth * scale
                const sy = variant.key === 'A' ? slot * stripWidth * scale : 0
                const sw = variant.key === 'A' ? W : stripWidth * scale
                const sh = variant.key === 'A' ? stripWidth * scale : H
                return (
                  <g key={slot}>
                    <rect x={sx} y={sy} width={sw} height={sh} className="cp-strip" />
                    {st?.pieces.map((p, pi) => {
                      const px = variant.key === 'A' ? p.from * scale : sx
                      const py = variant.key === 'A' ? sy : p.from * scale
                      const pw = variant.key === 'A' ? p.length * scale : sw
                      const ph = variant.key === 'A' ? sh : p.length * scale
                      return (
                        <g key={pi}>
                          <rect x={px} y={py} width={pw} height={ph} fill={color.get(p.segmentId)} className="cp-piece">
                            <title>{`${label.get(p.segmentId)}: ${cm(p.length)} cm`}</title>
                          </rect>
                          {(variant.key === 'A' ? pw : ph) > 24 && (
                            <text
                              x={px + pw / 2}
                              y={py + ph / 2}
                              className="cp-text"
                              transform={variant.key === 'B' ? `rotate(-90 ${px + pw / 2} ${py + ph / 2})` : undefined}
                            >
                              {cm(p.length)}
                            </text>
                          )}
                        </g>
                      )
                    })}
                  </g>
                )
              })}
            </svg>
            <figcaption>
              Arkusz {si + 1}
              {strips.length < variant.stripsPerSheet && ` — ${variant.stripsPerSheet - strips.length} pas(y) niewykorzystane`}
            </figcaption>
          </figure>
        ))}
      </div>
      <ul className="cp-legend">
        {segments.map((s) => (
          <li key={s.id}>
            <span style={{ background: color.get(s.id) }} />
            {s.label} — {cm(s.length)} cm
          </li>
        ))}
        <li>
          <span className="cp-waste" />
          odpad
        </li>
      </ul>
    </div>
  )
}
