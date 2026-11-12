// Rysunki objaśniające wymiary daszku z koszami (b, w, β, Δh, położenie, szer. ściany szczytu, d, x0, T).
// Rysunki są schematyczne (stałe proporcje) — nie liczą niczego, tylko pokazują, co oznacza każde pole.
// `active` — wymiar podświetlany, gdy użytkownik jest w odpowiadającym mu polu formularza.

export type DormerDimKey = 'b' | 'w' | 'beta' | 'dh' | 'position' | 'wallWidth'

type DimProps = {
  x1: number
  y1: number
  x2: number
  y2: number
  label: string
  /** położenie etykiety względem linii: dla poziomych 'above'/'below', dla pionowych 'right'/'left' */
  at?: 'above' | 'below' | 'right' | 'left'
  on?: boolean
  dim?: boolean
}

/** Linia wymiarowa z ukośnymi kreskami na końcach (jak na rysunku technicznym). */
function Dim({ x1, y1, x2, y2, label, at = 'above', on, dim }: DimProps) {
  const vertical = x1 === x2
  const tick = (x: number, y: number) => <line x1={x - 4} y1={y + 4} x2={x + 4} y2={y - 4} />
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  const tx = vertical ? (at === 'left' ? x1 - 6 : x1 + 6) : mx
  const ty = vertical ? my + 4 : at === 'below' ? y1 + 14 : y1 - 5
  const anchor = vertical ? (at === 'left' ? 'end' : 'start') : 'middle'
  return (
    <g className={`dh-dim${on ? ' on' : ''}${dim ? ' calc' : ''}`}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} />
      {tick(x1, y1)}
      {tick(x2, y2)}
      <text x={tx} y={ty} textAnchor={anchor}>
        {label}
      </text>
    </g>
  )
}

/** Linia pomocnicza (przedłużenie wymiarowe). */
const Ext = ({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) => <line className="dh-ext" x1={x1} y1={y1} x2={x2} y2={y2} />

function PlanView({ active }: { active: DormerDimKey | null }) {
  return (
    <figure>
      <svg viewBox="0 0 520 290" role="img" aria-label="Rzut z góry: daszek na połaci głównej">
        <defs>
          <pattern id="dh-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" className="dh-hatch" />
          </pattern>
        </defs>
        {/* połać główna (przednia) */}
        <rect className="dh-roof" x="20" y="40" width="480" height="130" />
        <line className="dh-ridge" x1="20" y1="40" x2="500" y2="40" />
        <text className="dh-note" x="26" y="34">
          kalenica główna
        </text>
        {/* daszek */}
        <polygon className="dh-dormer" points="200,250 200,170 260,110 320,170 320,250" />
        <polygon fill="url(#dh-hatch)" points="200,170 260,110 320,170" />
        <line className="dh-ridge" x1="260" y1="110" x2="260" y2="250" />
        <line className="dh-valley" x1="200" y1="170" x2="260" y2="110" />
        <line className="dh-valley" x1="320" y1="170" x2="260" y2="110" />
        {/* okap główny — przerwany w miejscu daszku */}
        <line className="dh-eave" x1="20" y1="170" x2="200" y2="170" />
        <line className="dh-eave" x1="320" y1="170" x2="500" y2="170" />
        <line className="dh-eave" x1="200" y1="250" x2="320" y2="250" />
        {/* ściany (lico EPS) pod dachem */}
        <path className="dh-wall" d="M45 40 V150 H215 V235 H305 V150 H475 V40" />
        <text className="dh-note" x="380" y="105">
          połać główna
        </text>
        <text className="dh-note" x="390" y="186">
          okap główny
        </text>
        <text className="dh-note" x="52" y="143">
          lico ściany (EPS)
        </text>
        <text className="dh-valley-t" x="214" y="132">
          K1
        </text>
        <text className="dh-valley-t" x="290" y="132">
          K2
        </text>
        <text className="dh-note strong" x="260" y="162" textAnchor="middle">
          T
        </text>
        <text className="dh-note" x="266" y="225">
          daszek
        </text>

        {/* położenie od krawędzi dachu */}
        <Ext x1={20} y1={170} x2={20} y2={210} />
        <Ext x1={200} y1={250} x2={200} y2={205} />
        <Dim x1={20} y1={205} x2={200} y2={205} label="położenie od początku okapu" on={active === 'position'} />
        {/* b */}
        <Ext x1={200} y1={250} x2={200} y2={280} />
        <Ext x1={320} y1={250} x2={320} y2={280} />
        <Dim x1={200} y1={275} x2={320} y2={275} label="b — szerokość z okapami" on={active === 'b'} />
        {/* w, d */}
        <Ext x1={320} y1={170} x2={360} y2={170} />
        <Ext x1={320} y1={250} x2={360} y2={250} />
        <Ext x1={260} y1={110} x2={360} y2={110} />
        <Dim x1={355} y1={170} x2={355} y2={250} label="w — wysięg za okap główny" on={active === 'w'} />
        <Dim x1={355} y1={110} x2={355} y2={170} label="d (liczy aplikacja)" dim />
      </svg>
      <figcaption>Rzut z góry. Kosze K1, K2 (czerwone) biegną od okapu głównego do kalenicy daszku. Zakreskowany trójkąt T to część połaci głównej przykryta daszkiem.</figcaption>
    </figure>
  )
}

function FrontView({ active }: { active: DormerDimKey | null }) {
  // daszek widziany od czoła (od strony jego szczytu); β rysowane ok. 40°
  return (
    <figure>
      <svg viewBox="0 0 330 260" role="img" aria-label="Widok od czoła daszku">
        <polygon className="dh-wall-fill" points="60,215 60,153 150,78 240,153 240,215" />
        <line className="dh-eave-main" x1="10" y1="195" x2="320" y2="195" />
        <text className="dh-note" x="12" y="190">
          okap główny
        </text>
        <polyline className="dh-dormer-line" points="40,170 150,78 260,170" />
        <text className="dh-note" x="150" y="140" textAnchor="middle">
          szczyt daszku
        </text>
        {/* β */}
        <line className="dh-ext" x1="40" y1="170" x2="95" y2="170" />
        <path className={`dh-angle${active === 'beta' ? ' on' : ''}`} d="M80 170 A40 40 0 0 0 70.6 144.3" />
        <text className={`dh-angle-t${active === 'beta' ? ' on' : ''}`} x="86" y="162">
          β
        </text>
        {/* Δh */}
        <Ext x1={260} y1={170} x2={300} y2={170} />
        <Dim x1={295} y1={170} x2={295} y2={195} label="Δh" on={active === 'dh'} />
        {/* szerokość ściany */}
        <Dim x1={60} y1={208} x2={240} y2={208} label="szer. ściany szczytu" on={active === 'wallWidth'} />
        {/* b */}
        <Ext x1={40} y1={170} x2={40} y2={250} />
        <Ext x1={260} y1={170} x2={260} y2={250} />
        <Dim x1={40} y1={240} x2={260} y2={240} label="b — szerokość z okapami" on={active === 'b'} />
      </svg>
      <figcaption>
        Widok od czoła daszku. <b>β</b> — kąt daszku. <b>Δh</b> — o ile okap daszku jest wyżej od okapu głównego (0 = na tej samej wysokości). Szer. ściany szczytu (bez okapów) służy tylko do policzenia elewacji szczytu daszku.
      </figcaption>
    </figure>
  )
}

function SideView({ active }: { active: DormerDimKey | null }) {
  // przekrój wzdłuż kalenicy daszku; α ≈ 35°, okap główny w (260,180), okap daszku Δh = 15 wyżej
  return (
    <figure>
      <svg viewBox="0 0 380 240" role="img" aria-label="Przekrój wzdłuż kalenicy daszku">
        <line className="dh-roof-line" x1="260" y1="180" x2="40" y2="26" />
        <text className="dh-note" x="150" y="48">
          połać główna
        </text>
        <polygon className="dh-dormer" points="167,115 330,115 330,165 238.6,165" />
        <line className="dh-ridge" x1="167" y1="115" x2="330" y2="115" />
        <text className="dh-note" x="250" y="110">
          kalenica daszku
        </text>
        <line className="dh-eave-main" x1="240" y1="180" x2="370" y2="180" />
        <text className="dh-note" x="300" y="195">
          okap główny
        </text>
        {/* α */}
        <line className="dh-ext" x1="100" y1="68" x2="150" y2="68" />
        <path className="dh-angle" d="M130 68 A30 30 0 0 1 124.6 85.2" />
        <text className="dh-angle-t" x="134" y="84">
          α
        </text>
        {/* d, x0 */}
        <Ext x1={167} y1={115} x2={167} y2={90} />
        <Ext x1={238.6} y1={165} x2={238.6} y2={90} />
        <Ext x1={260} y1={180} x2={260} y2={90} />
        <Dim x1={167} y1={95} x2={238.6} y2={95} label="d" dim />
        <Dim x1={238.6} y1={95} x2={260} y2={95} label="x0" dim />
        {/* w */}
        <Ext x1={260} y1={180} x2={260} y2={225} />
        <Ext x1={330} y1={165} x2={330} y2={225} />
        <Dim x1={260} y1={220} x2={330} y2={220} label="w" on={active === 'w'} />
        {/* Δh */}
        <Ext x1={330} y1={165} x2={365} y2={165} />
        <Dim x1={360} y1={165} x2={360} y2={180} label="Δh" at="left" on={active === 'dh'} />
      </svg>
      <figcaption>
        Przekrój wzdłuż kalenicy daszku. <b>w</b> mierzymy poziomo od okapu głównego do końca okapu daszku. <b>d</b> i <b>x0</b> liczy aplikacja: x0 = Δh / tg α (przy Δh = 0 → 0).
      </figcaption>
    </figure>
  )
}

export function DormerHelp({ active }: { active: DormerDimKey | null }) {
  return (
    <details className="dormer-help" open>
      <summary>Co oznaczają wymiary daszku? (rysunek)</summary>
      <div className="dormer-help-figs">
        <PlanView active={active} />
        <FrontView active={active} />
        <SideView active={active} />
      </div>
      <ul className="small dormer-help-legend">
        <li>
          <b>b</b> — szerokość daszku w rzucie <b>razem z okapami szczytowymi daszku</b> (od krawędzi do krawędzi dachówek).
        </li>
        <li>
          <b>w</b> — o ile daszek wystaje poza linię okapu głównego, poziomo.
        </li>
        <li>
          <b>β</b> — kąt nachylenia połaci daszku; <b>α</b> — kąt dachu głównego (z danych dachu).
        </li>
        <li>
          <b>Δh</b> — różnica wysokości okapu daszku względem okapu głównego; dodatnia = wyżej. Wartości ujemnej aplikacja nie liczy.
        </li>
        <li>
          <b>Położenie</b> — odległość od początku okapu głównego (krawędź dachu razem z okapem szczytowym) do krawędzi daszku; tylko do kontroli kolizji i rysunku.
        </li>
        <li>
          <b>Strona</b> — przód lub tył budynku (strony okapowe); daszek nie może wychodzić ze szczytu.
        </li>
      </ul>
      <p className="small muted">Kliknij pole w formularzu — odpowiadający mu wymiar podświetli się na rysunku.</p>
    </details>
  )
}
