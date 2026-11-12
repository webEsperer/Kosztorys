// Pola formularzy: liczby w formacie polskim (przecinek), puste = null („uzupełnij”).

import { useEffect, useState, type ReactNode } from 'react'

export function fmtNum(x: number | null | undefined, maxDec = 3): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return ''
  return x.toLocaleString('pl-PL', { maximumFractionDigits: maxDec, useGrouping: false })
}

export function fmtQty(x: number | null | undefined, maxDec = 2): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return '—'
  return x.toLocaleString('pl-PL', { maximumFractionDigits: maxDec })
}

export function parseNum(s: string): number | null {
  const t = s.replace(/\s/g, '').replace(',', '.')
  if (t === '' || t === '-') return null
  const v = Number(t)
  return Number.isFinite(v) ? v : null
}

/**
 * Pole liczbowe. `scale` — przelicznik wartości do wyświetlenia (np. m → cm: 100).
 * Puste pole = null (gdy `allowEmpty`). `positive` — wartość musi być > 0.
 * Wartość niepoprawna (np. pusta, gdy pustej nie wolno, albo 0 przy `positive`) NIE jest zapisywana —
 * pole świeci na czerwono, a po wyjściu z pola wraca ostatnia poprawna wartość.
 */
export function NumField({
  label,
  value,
  onChange,
  unit,
  scale = 1,
  hint,
  required = false,
  placeholder,
  width,
  positive = false,
  allowEmpty = true,
}: {
  label: ReactNode
  value: number | null
  onChange: (v: number | null) => void
  unit?: string
  scale?: number
  hint?: string
  required?: boolean
  placeholder?: string
  width?: number
  positive?: boolean
  allowEmpty?: boolean
}) {
  const shown = value === null ? '' : fmtNum(Math.round(value * scale * 1e6) / 1e6, 4)
  const [text, setText] = useState(shown)
  const [focused, setFocused] = useState(false)
  const [invalid, setInvalid] = useState<string | null>(null)
  // wartość sprzed edycji — przywracana, gdy pole (bez pustych) zostanie wyczyszczone
  const [before, setBefore] = useState<number | null>(value)
  useEffect(() => {
    if (!focused) setText(shown)
  }, [shown, focused])
  const missing = required && value === null
  return (
    <label className={`nf${missing ? ' nf-missing' : ''}${invalid ? ' nf-invalid' : ''}`} title={invalid ?? hint}>
      <span className="nf-label">{label}</span>
      <span className="nf-box">
        <input
          type="text"
          inputMode="decimal"
          value={text}
          placeholder={placeholder ?? (required ? 'uzupełnij' : '')}
          style={width ? { width } : undefined}
          onFocus={() => {
            setFocused(true)
            setBefore(value)
          }}
          onBlur={() => {
            setFocused(false)
            setInvalid(null)
            setText(shown)
          }}
          onChange={(e) => {
            setText(e.target.value)
            if (e.target.value.trim() === '') {
              if (allowEmpty) {
                setInvalid(null)
                onChange(null)
              } else {
                setInvalid('Wpisz wartość')
                if (before !== null && before !== value) onChange(before)
              }
              return
            }
            const v = parseNum(e.target.value)
            if (v === null) {
              setInvalid('To nie jest liczba')
              return
            }
            if (positive && v <= 0) {
              setInvalid('Wartość musi być większa od zera')
              return
            }
            setInvalid(null)
            onChange(Math.round((v / scale) * 1e9) / 1e9)
          }}
        />
        {unit && <em>{unit}</em>}
      </span>
      {invalid && <span className="nf-error">{invalid}</span>}
    </label>
  )
}

export function TextField({ label, value, onChange }: { label: ReactNode; value: string; onChange: (v: string) => void }) {
  return (
    <label className="nf">
      <span className="nf-label">{label}</span>
      <span className="nf-box">
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} />
      </span>
    </label>
  )
}

export function Check({ label, checked, onChange }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="nf-check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /> {label}
    </label>
  )
}

export function Select<T extends string>({ label, value, options, onChange }: { label: ReactNode; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <label className="nf">
      <span className="nf-label">{label}</span>
      <span className="nf-box">
        <select value={value} onChange={(e) => onChange(e.target.value as T)}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </span>
    </label>
  )
}

export function Section({ title, children, note }: { title: string; children: ReactNode; note?: ReactNode }) {
  return (
    <section className="card">
      <h2>{title}</h2>
      {note && <p className="muted small">{note}</p>}
      <div className="fields">{children}</div>
    </section>
  )
}
