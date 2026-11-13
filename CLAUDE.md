# CLAUDE.md — Kalkulator kosztów budowy domu jednorodzinnego

## Cel projektu

Aplikacja na telefon i komputer do liczenia **ilości materiałów** i **kosztów** budowy parterowego domu
jednorodzinnego z dachem dwuspadowym na wiązarach.
Użytkownik podaje wymiary wewnętrzne budynku w rzucie poziomym i kilka parametrów. Aplikacja wylicza materiały,
robociznę/sprzęt i koszty w podziale na:

1. **Stan surowy otwarty (SSO)**
2. **Stan surowy zamknięty (SSZ)**
3. **Stan deweloperski (SD)**
4. **Koszty ogólne budowy** (kwoty wpisywane ręcznie: geodeta, kierownik budowy, przyłącza, narzędzia…)

Użytkownik wpisuje cenę jednostkową (za szt., mb, m², m³, kg, t, rolkę, paczkę, worek, wiadro, puszkę, godzinę,
dobę, kurs lub kwotę ryczałtową). Aplikacja pokazuje ilość, koszt każdej pozycji, sumę etapu i sumę całej budowy.

**Najważniejsza zasada: każde obliczenie musi być przejrzyste.** Każda pozycja ma podgląd „Jak to policzono”:
wzór, podstawione dane, kroki pośrednie, naddatek, zaokrąglenie, koszt.

## Język i konwencje

- Interfejs, nazwy materiałów, komunikaty i opisy obliczeń: **po polsku**.
- Kod (zmienne, funkcje, typy): po angielsku; komentarze mogą być po polsku.
- Wymiary w UI wprowadzane w **cm** (domyślnie) lub m; grubości materiałów w mm lub cm. W silniku zawsze metry.
- Pieniądze: liczba całkowita **groszy**. Waluta PLN, format `12 345,67 zł`.
- Liczby w UI w formacie polskim (przecinek dziesiętny, spacja tysięcy).
- Ceny brutto; opcjonalne pole VAT (8% / 23%) do podglądu netto.
- **Wartości domyślne niepewne** (zużycia z kart producentów) mają wartość `null` i pozycja jest oznaczona
  „uzupełnij” — aplikacja nie liczy jej kosztu, dopóki użytkownik nie poda wartości. Nie wymyślaj zużyć.
- Wartości domyślne pewne (masa stali, wymiary H+H itp.) są wpisane, ale zawsze edytowalne.

## Stos technologiczny

- **PWA**: React + TypeScript + Vite — jedna aplikacja w przeglądarce na komputerze i telefonie,
  instalowalna na ekranie głównym, działająca offline.
- Zapisy: IndexedDB (Dexie). Brak backendu.
- PWA bez dodatkowych bibliotek: `pwa-plugin.ts` generuje przy buildzie `sw.js` (precache wszystkich plików,
  wersja z hasha listy plików), `public/manifest.webmanifest` + ikony; SW rejestrowany tylko w produkcji.
- Testy: Vitest (silnik), Testing Library (UI).
- Eksport/import projektu: JSON. Eksport zestawień: CSV i PDF/druk. Eksport zestawienia otworów dla producenta stolarki.
- Rysunki pomocnicze (plan cięcia płyt OSB i pasów papy, schemat poziomów): SVG generowane w aplikacji.
- Układ: telefon — etapy jako zakładki, pozycje jako karty z rozwijanym trace;
  komputer — tabela + panel boczny „Jak to policzono”.

## Architektura

```
src/
  engine/              # CZYSTA logika — zero importów z React/UI
    geometry.ts        # obwody (wew./oś/zew.), pola, poziomy wysokościowe
    levels.ts          # schemat wysokości: posadzka, chudziak, wieńce, liczba warstw bloczków
    rebar.ts           # zbrojenie: pręty podłużne, strzemiona, zakłady, masa
    cutting.ts         # cięcie pasów z arkuszy/rolek (OSB, papa) — plan cięcia
    concrete.ts        # betonowania: objętość, kursy gruszki, pompa
    openings.ts        # otwory, nadproża, lista drzwi, eksport dla producenta stolarki
    roof.ts            # połać, pokrycie, łaty/kontrłaty, obróbki, podbitka
    facade.ts          # EPS do linii okapu, szczyty z wełną i boazerią
    ceiling.ts         # sufit podwieszany krzyżowy GK
    stages/            # definicje pozycji domyślnych
      sso.ts
      ssz.ts
      sd.ts
      general.ts       # koszty ogólne (ryczałty)
    trace.ts           # typy i helpery kroków obliczeń
    money.ts           # grosze, zaokrąglenia
  model/               # typy danych projektu
  storage/             # IndexedDB, import/eksport
  ui/
tests/engine/          # testy z ręcznie policzonymi przykładami
```

Zasady:
- `engine/` testowalny bez przeglądarki.
- Każda funkcja licząca zwraca **wynik + trace**, nigdy samą liczbę.
- Wszystkie współczynniki są parametrami (projektu lub pozycji), nie stałymi w kodzie.
- Każda pozycja ma pole `stage`, a UI pozwala **przenieść pozycję do innego etapu**.

## Dane wejściowe — kreator projektu

### 1. Geometria (wymiary wewnętrzne w rzucie)
- Tryb podstawowy: prostokąt `długość wew. × szerokość wew.` (np. 1200 × 900 cm).
- Tryb rozszerzony: obrys prostokątny wielokątny (lista odcinków). Dach liczony tylko dla prostokąta —
  przy wielokącie aplikacja prosi o ręczne wymiary dachu.
- Kierunek kalenicy: równolegle do dłuższego boku (domyślnie) lub krótszego.
- Ściany działowe: suma mb, wysokość.
- Opcjonalnie lista pomieszczeń (nazwa, wymiary) — do podłóg, sufitów, tynków per pomieszczenie.

### 2. Wysokości (poziom ±0 = gotowa posadzka)
| Parametr | Domyślnie |
|---|---|
| Wysokość w świetle (gotowa posadzka → gotowy sufit) | 270 cm |
| Warstwy podłogi na chudziaku: izolacja + wylewka + płytka/panel | **podaje użytkownik** (np. 15 + 6,5 + 1,5 = 23 cm) |
| Góra chudziaka = góra wieńca fundamentowego | − suma warstw podłogi (np. −23 cm) |
| Sufit podwieszany: płyta GK 1,2 + stelaż krzyżowy 2 × 3 cm + pustka 15 cm (dojście wkrętarką do wieszaków) | 22,2 cm |
| **Wysokość ścian nośnych: gotowa posadzka → góra wieńca** (konstrukcja dachu na wieńcu, sufit pod nią) | **podaje użytkownik** (podpowiedź: w świetle + warstwy sufitu, np. 270 + 22,2 = +292,2 cm; ostrzeżenie, gdy nad sufitem mniej miejsca niż GK + stelaż + pustka) |
| Ściany działowe od gotowej posadzki (pierwsza warstwa na chudziaku): ponad stelaż GK, nie wyżej niż wieniec | w świetle + GK + stelaż + zapas 2 cm = 279,2 cm (+ warstwy podłogi) |
| Wieniec ścian minimalny | 25 cm |
| Grubość chudziaka | 10 cm |
| Kąt nachylenia dachu | podaje użytkownik |
| Okap boczny (poziomo od lica gotowego EPS) | podaje użytkownik |
| Okap szczytowy (poziomo od lica gotowego EPS) | podaje użytkownik |

Aplikacja rysuje **schemat poziomów** (przekrój) z wyliczonymi rzędnymi i pokazuje wyliczoną wysokość budynku
(kalenica), aby użytkownik mógł zweryfikować dane.

### 3. Grubości ścian i izolacji
- Ściana nośna: H+H Gold 24 cm. Ściana fundamentowa: grubość wg wymiaru bloczka (podaje użytkownik).
- **Wymiary bloczków ścian nośnych i działowych (dł. × wys., spoina) podaje użytkownik** — liczba sztuk na m²
  wynika z wymiarów: `1 / ((dł. + spoina) × (wys. + spoina))` (np. 59 × 24 cm → 7,062 szt/m²).
- XPS fundament 10 cm, EPS elewacja 20 cm.

### 4. Otwory
Lista typów otworów: `typ (okno / drzwi zewnętrzne / brama / drzwi wewnętrzne), szerokość, wysokość, liczba,
ściana (zewnętrzna / szczyt / działowa), oznaczenie (O1, D1…)`.

Do kosztorysu wystarczy typ + liczba. **Każdy otwór jest wyszczególniony** (wg użytkownika): w trace każdej pozycji, od której się odejmuje
(mur nośny, szczyt, działowy, EPS, tynk) osobny krok na otwór (oznaczenie, typ, pomieszczenie, wymiary, pole) i na jego
nadproże, potem suma; pod listą otworów tabela „co odejmujemy i od czego” (`openingDeductions`). Do wizualizacji każdy egzemplarz otworu ma dodatkowo **położenie**:
- `wallId` — która ściana (ściany obrysu numerowane od narożnika lewego dolnego, zgodnie z ruchem wskazówek zegara;
  ściany działowe — własne id),
- `offset` — odległość od wewnętrznego narożnika ściany do krawędzi otworu (cm),
- `sillHeight` — wysokość parapetu od gotowej posadzki (cm; drzwi = 0),
- `side` — dla drzwi kierunek otwierania (lewe/prawe, do wewnątrz/na zewnątrz), opcjonalnie.
Otwory bez położenia liczą się w kosztorysie normalnie, a wizualizacja pokazuje je na liście „do rozmieszczenia”.

**Edytor rzutu (ui/plan-editor/):** rzut ścian z góry; kliknięcie ściany → „dodaj okno/drzwi”; przeciąganie otworu
wzdłuż ściany; wymiary od narożnika i między otworami pokazywane na bieżąco; wpisanie dokładnej wartości w cm;
kontrola kolizji (otwór na otworze, za blisko narożnika — minimalny filar parametrem, domyślnie 25 cm).
Zrobione (zakładka „Rzut”): ściany zewnętrzne S1–S4; okna w szczytach i drzwi w ścianach działowych trafiają
na listę „do rozmieszczenia” (ściany działowe nie mają jeszcze geometrii — kolejna wersja). Domyślny parapet okna 90 cm
(do zmiany), drzwi 0.

**Import z CAD (etap późniejszy):**
- Obsługujemy **DXF** (format tekstowy, biblioteka `dxf-parser`). **DWG nie czytamy w przeglądarce** — użytkownik
  zapisuje rzut z programu CAD jako DXF albo konwertuje DWG → DXF darmowym ODA File Converter.
- Kreator importu: wybór jednostek rysunku (mm/cm/m), wybór warstw ze ścianami i z oknami/drzwiami,
  podgląd rozpoznanych elementów na rzucie; użytkownik zatwierdza lub poprawia przed zapisem.
- Rozpoznawanie: obrys wewnętrzny ścian zewnętrznych z linii/polilinii; okna i drzwi z bloków (INSERT) —
  nazwa bloku, punkt wstawienia, obrót i skala → szerokość, ściana, offset; wysokości otworów i parapetów
  uzupełnia użytkownik (w rzucie 2D ich nie ma), chyba że blok ma atrybuty z wymiarami.
- Import zawsze kończy się w edytorze rzutu — nic nie trafia do kosztorysu bez zatwierdzenia.

## Wzory geometryczne (geometry.ts)

Dla obrysu prostokątnego wielokątnego (liczba narożników wypukłych − wklęsłych = 4):
`P(d) = P_wew + 8·d`, gdzie `d` = odsunięcie od lica wewnętrznego na zewnątrz.
- obwód w osi ściany grubości `t`: `P_oś = P_wew + 4·t`
- obwód lica zewnętrznego ściany: `P_zew = P_wew + 8·t`
- obwód lica zewnętrznego EPS grubości `e`: `P_wew + 8·(t + e)`
- lica ławy szerokości `b` (oś ławy = oś ściany): `P_oś ± 4·b`
- do powierzchni izolacji liczonej „na płasko” używaj obwodu w połowie grubości warstwy.

Pole wewnętrzne `A_wew` = suma pól (prostokąt: dł × szer). Wymiary zewnętrzne (prostokąt):
`L_z = L_wew + 2t + 2e`, `B_z = B_wew + 2t + 2e`.

## Model pozycji

```ts
type Unit = 'szt' | 'mb' | 'm2' | 'm3' | 'kg' | 't' | 'l' | 'h' | 'doba' | 'kurs' | 'kpl' | 'ryczałt';
type PackUnit = 'rolka' | 'paczka' | 'worek' | 'wiadro' | 'puszka' | 'płyta' | 'pręt' | 'bęben' | 'szt';

interface Item {
  id: string;
  stage: 'SSO' | 'SSZ' | 'SD' | 'OGOLNE';
  category: string;                 // np. "Fundamenty", "Zbrojenie ław", "Dach – pokrycie"
  kind: 'material' | 'service' | 'equipment' | 'lumpSum';
  name: string;
  unit: Unit;                       // jednostka ilości wyliczonej
  quantity: Computed;               // wynik + trace
  packaging?: { packUnit: PackUnit; perPack: number | null; packLabel: string }; // np. 1 paczka = 3 m²
  wastePercent: number;
  priceBasis: 'perUnit' | 'perPack' | 'lumpSum';
  unitPriceGrosze: number | null;
  params: Record<string, Param>;    // edytowalne współczynniki tej pozycji
  isCustom: boolean;
  enabled: boolean;
  note?: string;
}
```

Ilość do zakupu = `ceil(ilość × (1 + odpad) / perPack)` opakowań; koszt = opakowania × cena (lub ilość × cena).

## Śledzenie obliczeń (trace) — wymóg kluczowy

Krok: `{ label, formula, values, result, unit }`. Kroki odwołujące się do wielkości pochodnych (obwód, poziomy,
liczba warstw) są klikalne. Przykład:

```
Bloczki H+H Gold 24 — ściany nośne
1. Obwód w osi = 4200 cm + 4 × 24 cm = 4296 cm = 42,96 m
2. Wysokość murowana = 2,64 m (11 warstw × 0,24 m — patrz „Poziomy”)
3. Pow. brutto = 42,96 × 2,64 = 113,41 m²
4. Otwory + nadproża = 21,30 m²
5. Pow. netto = 92,11 m²
6. Ilość = 92,11 × 7,06 szt/m² = 650,3 szt; odpad +3% → 669,8 → 670 szt
7. Koszt = 670 × 31,00 zł = 20 770,00 zł
```

## Betonowania (wspólny moduł concrete.ts)

Każde betonowanie (ławy, wieniec fundamentowy, chudziak, wieniec ścian) ma osobno:
- objętość m³ + **zapas** (wg użytkownika: **ławy w gruncie 10%, wieńce 5%**, chudziak 3%), potem **zamówienie
  zaokrąglone w górę do 0,5 m³** (parametr); gdy pełne m³ w dół nadal ≥ objętość bez zapasu — pokazywana druga możliwość.
  Przykłady: ławy 9,2 + 10% = 10,12 → zamawiasz 10,5 m³ lub 10 m³; wieniec 9,2 + 5% = 9,66 → zamawiasz 10 m³.
  Koszt betonu, transportu (kursy) i pompy za m³ liczony od objętości zamówionej. Klasa betonu (opis), cena betonu za m³,
- transport: za m³ **albo** za kurs (`kursy = ceil(V / pojemność gruszki)`, domyślnie 8 m³),
- pompa: przełącznik „potrzebna pompa” + cena (ryczałt za podjazd + opcjonalnie za m³ lub za godzinę).
Chudziak: beton z włóknami zbrojącymi (cena m³ z włóknami od dostawcy; opcjonalnie włókna osobno kg/m³).

## Zbrojenie (rebar.ts) — reguły użytkownika (sztywne), zbrojenie do zastąpienia projektem

**Uwaga w UI: zbrojenie przyjęte orientacyjnie, ostateczne wg projektu konstruktora.**

| Element | Pręty główne | Strzemiona (odcinki proste / naroża) | Otulina |
|---|---|---|---|
| Ławy fundamentowe (na chudziaku) | 4 × Ø12 | Ø6 co 25 cm / co 10 cm | 5 cm |
| Wieniec fundamentowy | 4 × Ø12 | Ø6 co 25 cm / co 10 cm | 3 cm |
| Wieniec ścian nośnych | 4 × Ø12 | Ø6 co 25 cm / co 10 cm | 3 cm |

Liczymy **po bokach** obrysu (odcinki proste w osi elementu, od naroża do naroża); liczba naroży = liczba boków.
Pręty handlowe **6 m dla wszystkich średnic** (parametr; tak sprzedaje skład — decyzja użytkownika,
nadrzędna wobec „12 m” z wytycznych zbrojenia).

**Pręty główne (Ø12):**
- Zakład wzdłużny = 50d (Ø12 → 60 cm), liczony raz (część wspólna, nie ×2). Na każdym boku:
  `n_zakł = ceil(L_boku / 6) − 1` („dolicz 60 cm przy przekroczeniu każdych 6 m”).
- Zakotwienie w narożu: **każdy pręt dochodzący do naroża ma +50d (60 cm)** zagięcia — 2 końce na bok.
- Jedna linia na boku: `l = L_boku + n_zakł × 0,6 + 2 × 0,6`; razem `Σ l × 4 pręty`.
- **Dodatkowo eLki** w każdym narożu (i skrzyżowaniu T): ramiona 50d + 50d = 120 cm, po jednej na każdy pręt
  główny → 4 szt × 1,2 m = 4,8 mb na róg. (Decyzja użytkownika: eLki **i** zakotwienie 60 cm na pręcie.)

**Strzemiona (Ø6):**
- Wymiar = przekrój − otulina z każdej strony; długość drutu = `2·(b − 2c) + 2·(h − 2c) + 14 cm` (haki/zamki).
- Rozstaw na odcinkach prostych 25 cm (parametr); **w strefie 1 m od każdego rogu (w każdą stronę) co 10 cm**.
- Na boku: `2 × ceil(1,0 / 0,10)` w strefach + `ceil((L − 2) / 0,25) − 1` w środku (równo rozłożone);
  bok krótszy niż 2 m — cały co 10 cm: `ceil(L / 0,10) − 1`; plus **1 strzemię w każdym narożu**.

**Zakup:** suma mb danej średnicy → `ceil(mb / 6)` prętów handlowych (osobno dla elementu i dla całej budowy
z sumy mb); masa = pręty × 6 m × kg/m. Masa: Ø6 = 0,222 kg/m, Ø8 = 0,395, Ø10 = 0,617, Ø12 = 0,888 kg/m.
- Wynik osobno dla każdego elementu i zbiorczo: dla każdej średnicy **mb wbudowane** i **pręty / mb do kupienia**,
  masa; cena za kg, za tonę lub za pręt (wybór). Drut wiązałkowy: % masy stali (parametr, `null` = uzupełnij).
- Przykład 12 × 9 m (boki w osi 12,24 / 9,24), ława 60 × 40: Ø12 = 4 × 51,36 + 19,2 = 224,64 m → 38 prętów;
  strzemiona 220 szt × 1,74 m = 382,8 m → 64 pręty Ø6.

**Wizualizacja (ui/foundation-view/):** przekrój pionowy fundamentu (wycinek 3D, R3F) i rzut rozłożenia zbrojenia
(kawałki prętów, zakłady, zakotwienia, eLki, strzemiona) — dane z `engine/rebarLayout.ts` i
`engine/foundationSection.ts`; etykiety jako nakładka DOM (nie drei `<Html>` — problemy z React 19).

## Cięcie pasów z arkuszy i rolek (cutting.ts)

Jedna funkcja dla OSB, papy itp.: dane `arkusz/rolka (szer × dł)`, `szerokość pasa`, lista odcinków ścian.
- Wariant A: pasy wzdłuż dłuższego boku (`floor(szer / pas)` pasów na arkusz).
- Wariant B: pasy wzdłuż krótszego boku (`floor(dł / pas)` pasów).
- Odcinki ścian pokrywane pasami; reszty wykorzystywane na kolejne odcinki (first-fit decreasing).
- Algorytm: odcinki od najdłuższego; dla brakującego kawałka najpierw najmniejsza resztka, która go zmieści,
  potem całe pasy, potem największa resztka ≥ **min. kawałka** (parametr, domyślnie 30 cm — założenie,
  do potwierdzenia), na końcu nowy pas. **Zakład na łączeniu** kawałków w odcinku — parametr:
  OSB 0; **papa 30 cm (± 10 cm, edytowalny 20–40 cm)** — wg użytkownika.
- **Wymiar płyty OSB / rolki podaje zawsze użytkownik** (taki, jaki kupuje) — brak wartości domyślnej,
  pozycja „uzupełnij”, dopóki nie poda.
- **OSB: użytkownik wybiera wariant** (A lub B) — aplikacja liczy oba i nie wybiera sama; do kosztorysu trafia
  dopiero wybrany. Przy wariancie tańszym (mniej płyt), który ma więcej łączeń, ostrzeżenie: „Wariant X jest
  tańszy (…), ale ma N łączeń zamiast M (ok. 2 × więcej) — szalunek może się rozejść w wielu miejscach”.
  (np. OSB 250 × 125, 12 × 9 m: A = 12 płyt / 32 łączenia, B = 10 płyt / 65 łączeń).
  Papa: wariant z mniejszą liczbą rolek (przy remisie — mniej łączeń) jako domyślny, do zmiany.
- Wynik: liczba arkuszy, odpad m² i %, **rysunek SVG planu cięcia**
  („tnij płytę 250×125 na 3 pasy po 35 cm wzdłuż, reszta 20 cm – odpad”).

## Poziomy i warstwy (levels.ts)

**Fundament:** `h_ściany_fund = n_warstw × (h_bloczka + spoina) + h_wieńca_fund (25 cm)`.
Góra ławy = −23 cm − h_ściany_fund. Dno wykopu = góra ławy − 12 cm (górne 12 cm ławy w szalunku z desek).

**Ściany nośne:** liczone od dołu (wg użytkownika): góra chudziaka = −(izolacja + wylewka + wykończenie);
góra wieńca ścian = wysokość ścian nośnych podana przez użytkownika (od gotowej posadzki).
Przykład: od −23 do +292,2 = 315,2 cm.
- `H = (góra wieńca − góra chudziaka) − warstwa wyrównawcza pierwszej warstwy (parametr, domyślnie 0)`
- `n = floor((H − wieniec_min) / h_warstwy)`, gdzie `h_warstwy` = wys. bloczka (+ spoina), `wieniec_min` = 25 cm
- reszta `r = H − n·h_warstwy − wieniec_min`
- jeśli `r ≤ maks. dołożenie do wieńca` (parametr, **domyślnie 4 cm** — wg użytkownika) → wieniec = `wieniec_min + r`
  (przykład: 12 warstw × 24, r = 2,2 cm → wieniec 27,2 cm)
- w przeciwnym razie → dodatkowa warstwa docinana o wysokości `r`, wieniec = `wieniec_min`
- trace pokazuje: liczbę warstw, wysokość docinki, końcową wysokość wieńca.

---

# Pozycje domyślne

Oznaczenia: **[licz]** — ilość liczy aplikacja; **[ręcznie]** — użytkownik podaje ilość lub kwotę.

## SSO — Stan surowy otwarty

### Roboty ziemne i sprzęt
- Praca koparki — wykop [ręcznie: godziny] × cena/h
- Praca koparki — zasypanie [ręcznie: godziny] × cena/h
- Wynajem zagęszczarki [ręcznie: doby] × cena/doba
- Opcjonalnie: wywóz nadmiaru ziemi [ręcznie]

### Ławy fundamentowe
- Parametry: szerokość `b`, wysokość `h` ławy; opcjonalnie ławy pod ścianami wewnętrznymi (mb).
- Beton ław [licz]: `P_oś × b × h` → moduł betonowania.
- Deski szalunkowe [licz]: górne 12 cm ławy po obu stronach; długość = `(P_oś + 4b) + (P_oś − 4b)`;
  **wg użytkownika: jedna warstwa, deska 12 × 2,5 cm, dł. 2 m** (parametry); wynik w szt., mb i m³.
- **Paliki zabezpieczające** [licz] (wg użytkownika): 50 × 5 cm, **co 1 m po 2 szt. (para)** osobno na obwodzie
  zewnętrznym i wewnętrznym ław: `pary = ⌈P_ł,zew / 1⌉ + ⌈P_ł,wew / 1⌉`, paliki = 2 × pary.
- **Deseczki 40 × 12 × 2,5 cm** przykręcane do każdej pary palików [licz]: 1 na parę, docinane z desek 2 m
  (5 z deski) → liczba desek.
- Zbrojenie ław [licz] — patrz moduł zbrojenia.

### Ściany fundamentowe
- Parametry bloczka: długość, szerokość, wysokość, grubość spoiny; liczba warstw.
- Bloczki [licz]: `n_warstw × ceil(P_oś / (dł_bloczka + spoina))` + odpad.
- Zaprawa murarska [licz]: worki — zużycie na m² lub m³ muru `null` (uzupełnij).
- Papa na ławie pod bloczki [licz]: pas o szerokości (parametr) × `P_oś`; rolka podana jako
  m² lub szer × dł → moduł cięcia pasów → liczba rolek.
- Hydroizolacja (dysperbit/masa) [licz]: strona wewnętrzna i zewnętrzna ściany fundamentowej (bloczki + wieniec);
  `pow = (P_oś − 2t + P_oś + 2t) × h_ściany_fund` (oznaczenie: lica wg wzoru `P(d)`), liczba warstw, zużycie kg/m²
  na warstwę, wielkość wiadra → liczba wiader.
- XPS 10 cm na zewnątrz [licz]: od góry ławy do 3 cm poniżej góry wieńca fundamentowego;
  `pow = obwód w połowie XPS × wysokość`; płyta (wymiary brytu) i liczba płyt w paczce → m²/paczkę → liczba paczek.
- Pianoklej do XPS [licz]: m² na puszkę (parametr) → liczba puszek.
- Opcjonalnie (wyłączone): folia kubełkowa na XPS.

### Wieniec fundamentowy (domyślnie 25 cm)
- Beton [licz]: `P_oś × t_f × 0,25`, **t_f = szerokość bloczka fundamentowego** (wg użytkownika) → moduł betonowania.
- Zbrojenie wieńca fundamentowego [licz].
- Szalunek z OSB [licz]: obie strony; pas = wysokość wieńca + zakład na bloczki (parametr, domyślnie 10 cm);
  płyta np. 250 × 125 cm → moduł cięcia → liczba płyt, plan cięcia, koszt.

### Zasypka wewnątrz fundamentów
- Piasek [licz]: od dna wykopu (12 cm poniżej góry ławy) do górnej krawędzi ściany fundamentowej łącznie
  z wieńcem, minus 10 cm na chudziak (= spód chudziaka) — wg użytkownika;
  `wys = 0,12 + n_warstw·(h_bloczka + spoina) + h_wieńca − g_chudziaka` (spoiny wliczone; przykład 0,92 m);
  `pow = A_wew` (wnętrze ścian fundamentowych, minus ławy wewnętrzne jeśli są);
  `V_luźny = pow × wys × współczynnik zagęszczenia` (parametr, domyślnie 1,2 — do weryfikacji z dostawcą);
  cena za m³ lub tonę z transportem (przelicznik t/m³ parametr).

### Chudziak (10 cm, beton z włóknami)
- Beton [licz]: `A_wew × 0,10` → moduł betonowania.

### Kanalizacja i przejścia
- Kanalizacja podposadzkowa [ręcznie: kwota za całość].
- Rury osłonowe przejść przez fundament (woda, prąd) [ręcznie].
- Uziom fundamentowy: bednarka ocynkowana mb ≈ `P_oś` + wyprowadzenia [licz], złącza krzyżowe [ręcznie].

## SSZ — Stan surowy zamknięty

### Ściany nośne
- Papa pod ściany nośne [licz]: pas szer. 40 cm (parametr) × `P_oś` → moduł cięcia z rolki → liczba rolek.
- Warstwa wyrównawcza pierwszej warstwy: zaprawa cementowa [licz] — zużycie `null` (uzupełnij).
- Bloczki ścian nośnych (np. **H+H Gold 590 × 240 × 240 mm**; wymiary od użytkownika → szt/m²) [licz]:
  `P_oś × (n·h_warstwy + docinka) + ściany szczytowe − otwory (także okna w szczytach) − nadproża`.
- **Ściany szczytowe główne (2 szt.)** — murowane na wieńcu ścian nośnych (wg użytkownika): trójkąt o podstawie
  `b = B_wew + 2t` (lico zewnętrzne muru, ściany prostopadłe do kalenicy) i wysokości `b/2 · tan α`;
  `A = 2 × b² / 4 · tan α` (bez odliczenia wieńca skośnego). Doliczane do bloczków i kleju ścian nośnych;
  okna w szczytach odejmowane razem z nadprożami. Elewacja szczytów (wełna, boazeria) — z `B_z` (lico EPS).
- Klej do cienkich spoin [licz] — zużycie `null` (uzupełnij z karty kleju).

### Wieniec ścian nośnych
- Wysokość wg levels.ts (dopasowana do warstw).
- Beton [licz]: `P_oś × 0,24 × h_wieńca` → moduł betonowania.
- Zbrojenie [licz].
- Szalunek [licz]: OSB tą samą metodą cięcia; opcja „użyj płyt z wieńca fundamentowego” (zmniejsza zakup).

### Otwory zewnętrzne i nadproża
- Okna, drzwi zewnętrzne, brama: lista z wymiarami → pole do odjęcia od muru.
- **Nadproża systemowe H+H** [licz]: dla otworu wybierz najkrótsze nadproże, którego „maks. otwór” ≥ szerokość.
  Tabela domyślna (z cennika H+H, szer. 115 mm — sprawdź u dostawcy):

  | Długość | Maks. otwór |
  |---|---|
  | 1,25 m | 1,01 m |
  | 1,50 m | 1,25 m |
  | 2,00 m | 1,75 m |
  | 2,50 m | 2,25 m |
  | 3,00 m | 2,75 m |

  Ściana 24 cm → 2 szt na otwór (parametr). Wynik: liczba szt. każdej długości i koszt.
  **Wysokość nadproża 24 cm** (wg użytkownika; parametr) — pole nadproży odejmowane od muru nośnego i działowego.
- Stolarka okienna i drzwi zewnętrzne [ręcznie: kwota z wyceny producenta].
- **Eksport zestawienia otworów dla producenta** (CSV + PDF): lp., oznaczenie, szerokość × wysokość otworu,
  ilość, pomieszczenie, typ otwierania, kolor, uwagi (pola do uzupełnienia), data, nazwa projektu.
- Parapety zewnętrzne [licz: mb = szerokości okien + 2 × 3 cm].

### Ściany działowe
- Dane: mb ścian; pierwsza warstwa stoi na chudziaku. **Wysokość od gotowej posadzki (wg użytkownika): ponad górną
  krawędź stelaża GK, ale nie wyżej niż wieniec** — `h_światło + GK + stelaż + zapas` (zapas 1–2 cm, domyślnie 2 cm):
  270 + 1,2 + 6 + 2 = 279,2 cm; mur od chudziaka = to + warstwy podłogi (np. 302,2 cm). Ostrzeżenie, gdy wyżej niż
  góra wieńca. Wysokość od posadzki lub cały mur można podać ręcznie; otwory drzwiowe.
- Bloczki (np. **H+H Gold 590 × 120 × 240 mm**; wymiary od użytkownika → szt/m²) [licz] (netto po odjęciu
  otworów i nadproży).
- Klej [licz] — zużycie `null`.
- Nadproża [licz]: ten sam algorytm, szerokość 120 mm, 1 szt na otwór (parametr, sprawdź tabelę dostawcy).
- **Lista drzwi wewnętrznych** [licz]: mapowanie otwór → skrzydło (parametr): otwór 70 → drzwi 60, 80 → 70,
  90 → 80, 100 → 90 (wysokość otworu domyślnie 207 cm). Wynik: „Drzwi 80 – 4 szt.” + ościeżnice; cena za typ.

### Dach — konstrukcja
- Wiązary z montażem [ręcznie: kwota od firmy].
- Liczba wiązarów: podana lub z rozstawu (`ceil(L_z / rozstaw) + 1`, rozstaw domyślnie 90 cm).
- Kominy: liczba × cena kompletu [ręcznie].

### Dach — pokrycie (roof.ts)
- Połać: `s = (B_z/2 + okap_boczny) / cos α`, `R = L_z + 2 × okap_szczytowy`, `A_dachu = 2 × s × R`.
- Membrana dachowa [licz]: `A × (1 + zakłady 10%)` / m² w rolce.
- Kontrłaty [licz]: `2 × N_wiązarów × s` mb; przekrój domyślnie 3,2 × 5 cm → m³.
- Łaty [licz]: rzędy = `ceil(s / rozstaw_łat) + 1` na połać, `mb = 2 × rzędy × R`; rozstaw z karty dachówki
  (`null` = uzupełnij); przekrój domyślnie 4 × 6 cm → m³.
- Dachówka [licz]: `A × szt/m²` (zużycie `null` = uzupełnij).
- Gąsiory [licz]: `R × szt/mb` + gąsior początkowy i końcowy.
- Dachówki krawędziowe lub wiatrownice blaszane [licz]: `4 × s` mb.
- Pas nadrynnowy, pas podrynnowy [licz]: `2 × R` mb każdy.
- Grzebień okapowy (wróblownica) [licz]: `2 × R` mb.
- Taśma kalenicowa, uchwyty łaty kalenicowej [licz]: `R` mb.
- Deski czołowe [licz]: `2 × R` mb (+ deski wiatrowe na szczytach `4 × s` — opcja).
- Struktonit (płytki włóknocementowe Cedral, domyślnie 30 × 30 cm, gr. 4 mm, sprzedawane na sztuki)
  na deski czołowe [licz]:
  - parametry: wymiar płytki, wysokość deski czołowej, szerokość krycia w poziomie (płytka − zakład boczny),
    wysokość krycia rzędu (płytka − zakład górny), zakłady `null` = uzupełnij lub 0 dla układu na styk;
  - `rzędy = ceil(wys_deski / wys_krycia)`, `szt_na_mb = rzędy / szer_krycia`;
  - `szt = mb_desek × szt_na_mb × (1 + odpad 10%)` → sztuki; mb desek = `2 × R`
    (+ opcja: deski wiatrowe na szczytach `4 × s`);
  - gwoździe/wkręty nierdzewne [licz]: szt na płytkę (parametr, domyślnie 2);
  - trace pokazuje rzędy, sztuki na mb i całość.
- Rynny `2 × R` mb, haki co 60 cm, rury spustowe (liczba × wysokość), narożniki/lejki/zaślepki [licz/ręcznie].
- Obróbki blacharskie [ręcznie: liczba × cena za obróbkę], w tym obróbki kominów.
- Ławy kominiarskie (podesty) i stopnie kominiarskie [ręcznie: liczba szt × cena].
- Opcjonalnie (wyłączone): wkręty/klamry do dachówek, okna dachowe.

### Dach — dobudowane daszki dwuspadowe połączone koszowo (roof.ts, opcja)

Użytkownik może dodać **dowolną liczbę** małych daszków dwuspadowych, prostopadłych do kalenicy głównej,
połączonych z połacią główną dwoma koszami. Liczymy w rzucie z góry: `pow. połaci = pow. rzutu / cos(kąt)`;
kosze dzielą rzut między połać główną a daszek.

**Dane dla każdego daszku:**
| Parametr | Opis |
|---|---|
| `b` | szerokość daszku w rzucie, razem z okapami szczytowymi daszku |
| `w` | wysięg daszku poza linię okapu głównego (poziomo) |
| `β` | kąt nachylenia daszku |
| `Δh` | różnica wysokości okapu daszku względem okapu głównego (domyślnie 0; dodatnia = wyżej) |
| strona | po której stronie okapowej budynku (daszek nie może wychodzić ze szczytu) |
| położenie | odległość od narożnika (tylko do kontroli, czy mieści się na połaci i nie koliduje z innym) |

**Wzory (α = kąt dachu głównego):**
1. Początek koszy za linią okapu głównego: `x0 = Δh / tan α` (dla `Δh = 0` → `x0 = 0`).
2. Wejście kalenicy daszku w połać główną: `d = (b/2) · tan β / tan α`.
3. Powierzchnia rzutu przejęta z połaci głównej: `T = b · x0 + b · d / 2`.
4. Połać główna: `A_główna = (rzut_główny − Σ T) / cos α`.
5. Daszek: `A_daszek = (b · w + T) / cos β`.
6. Dla `β = α` i `Δh = 0`: `d = b/2`, przyrost dachu = `b · w / cos α` (test kontrolny).
7. `Δh < 0` (okap daszku niżej niż główny): nie liczymy automatycznie — komunikat z prośbą o ręczne
   podanie powierzchni daszku i długości koszy.

**Elementy dodatkowe wyliczane z tych danych:**
- Kosze (2 szt. na daszek): długość każdego `√((b/2)² + d² + ((b/2) · tan β)²)`
  (dla `Δh > 0` dodatkowo odcinek prosty `x0` przy okapie) → blacha koszowa mb, taśma/uszczelka koszowa mb.
- Kalenica daszku: `w + x0 + d` → gąsiory, taśma kalenicowa.
- Okapy daszku: `2 × (w + x0)` → rynny, pas nadrynnowy, pas podrynnowy, grzebień okapowy, deski czołowe, struktonit.
- Okap główny skracany o `b` w miejscu daszku (rynny, pasy, grzebień, deski czołowe głównej połaci).
- Wiatrownice / dachówki krawędziowe daszku: `2 × (b/2) / cos β`.
- Membrana, łaty, kontrłaty, dachówki daszku liczone z `A_daszek` (rozstaw łat jak na dachu głównym).
- Konstrukcja daszku (wiązary/krokwie) — kwota ręczna, jak dla dachu głównego.
- Odpad dachówki przy koszach: domyślnie 12% dla połaci z koszami (parametr) zamiast odpadu standardowego.
- Szczyt daszku: powierzchnia trójkąta `b_ściany² / 4 · tan β` (bez okapów) do elewacji — użytkownik wybiera,
  czy jest wykończony EPS czy jak szczyty główne (wełna + boazeria).

**Trace** pokazuje: d, x0, T, powierzchnię przejętą z połaci głównej, powierzchnię daszku, długości koszy.

### Wizualizacja dachu (ui/roof-view/)

Wzorzec działania: **`docs/prototyp-dach.html`** (otwórz w przeglądarce). Przenieś z niego metodę rysowania
do komponentów React, ale **geometria ma pochodzić z `engine/roof.ts`** — rysunek i kosztorys używają tych samych
liczb, komponent niczego nie przelicza samodzielnie. `roof.ts` zwraca listę połaci (wielokąty 3D + normalne),
krawędzi (typ: okap, kalenica, kosz, wiatrownica) i wymiarów.

**Widok 3D (SVG, bez dodatkowych bibliotek na start):**
- rzutowanie aksonometryczne, sortowanie ścian od najdalszej (painter's algorithm), ukrywanie ścian odwróconych
  od widza (back-face culling), cieniowanie płaskie wg normalnej — jak w prototypie;
- obrót przeciąganiem myszą/palcem + suwak; zoom kółkiem/szczypaniem; przycisk „widok domyślny”;
- kolory: połać główna, daszki, szczyty, kosze (czerwone), kalenice (przerywane);
- etykiety na rysunku: numery połaci z powierzchnią (P1 = 61,2 m²), numery koszy z długością
  (K1 = 4,03 m), kalenice z długością; przełącznik „pokaż/ukryj etykiety”.

**Rzut z góry (SVG) z wymiarowaniem:**
- linie wymiarowe jak na rysunku technicznym: L, D, okapy boczne i szczytowe, dla każdego daszku b, w, d, x0
  oraz odległość daszku od narożnika;
- obrys ścian (lico EPS) przerywaną linią pod obrysem dachu, żeby było widać okapy;
- trójkąt T zakreskowany, kosze oznaczone K1, K2…, kalenice, kierunek spadku połaci (strzałki);
- tabelka obok: liczba koszy, suma długości koszy, kalenice, okapy, wiatrownice, powierzchnie połaci.

**Interakcja z kosztorysem:**
- kliknięcie elementu na rysunku (połać, kosz, kalenica, okap) → podświetlenie i panel z trace oraz listą pozycji
  materiałowych, które z niego wynikają (np. kosz → blacha koszowa, taśma koszowa);
- kliknięcie pozycji w kosztorysie (np. „Blacha koszowa”) → podświetlenie odpowiednich elementów na rysunku;
- zmiana parametrów w formularzu → rysunek i kosztorys odświeżają się na żywo;
- wiele daszków: dodawanie/usuwanie, przesuwanie wzdłuż okapu; kontrola kolizji (daszki nachodzące na siebie,
  daszek wychodzący poza połać, kalenica daszku ponad kalenicą główną) z komunikatem przy rysunku.

**Eksport:** rzut z wymiarami i widok 3D jako PNG/SVG, dołączane do eksportu PDF kosztorysu.

## Wizualizacja 3D domu (ui/house-3d/) — po kosztorysie i widoku dachu SVG

Cel: prawie realistyczny model domu w przeglądarce, **budowany w całości z parametrów projektu**
(geometria, poziomy, otwory z położeniem, dach z daszkami, elewacja). Zmiana parametru → model przebudowuje się.

**Technologia:** React Three Fiber + `@react-three/drei`. Geometria budowana w module `engine/model3d.ts`
(czyste dane: bryły, otwory, połacie — bez three.js), a komponenty tylko je renderują.

**Etapy:**
1. ✅ (zrobione — zakładka „Dom 3D”, `engine/model3d.ts`) **Bryła z obliczeń:** ściany z grubością muru + EPS, otwory w ścianach (wycięcia), wieniec, dach z połaciami
   i daszkami (z `roof.ts`), szczyty, okapy, podbitka. Proste kolory. Kamera orbitująca, zoom, widoki: z przodu,
   z boku, z góry, z lotu ptaka.
2. **Materiały PBR:** tynk elewacyjny, dachówka (tekstura z mapą normalnych, kierunek zgodny ze spadkiem połaci),
   pionowa boazeria na szczytach, blacha (rynny, obróbki), struktonit na deskach czołowych, szkło.
   Tekstury CC0 z ambientCG / Poly Haven w `public/textures/` (z plikiem LICENSE z informacją o źródle).
   Wybór kolorów elewacji, dachówki i stolarki w UI.
3. **Światło i cienie:** oświetlenie HDRI nieba, cienie słoneczne, ambient occlusion, tone mapping.
   **Słońce wg daty i godziny** dla lokalizacji projektu (domyślnie Ełk, ok. 53,8° N, 22,4° E) i obrotu budynku
   względem północy — suwak godziny i kalendarz, podgląd nasłonecznienia okien.
4. **Detale:** okna w głębi muru z ramą i szybą, parapety zewnętrzne, drzwi, rynny i rury spustowe,
   kominy, teren (trawa, opaska), cokół z XPS.
5. **Opcjonalnie:** tryb VR (WebXR, przycisk „Wejdź do VR”), eksport modelu do glTF (do Blendera).

**Wydajność:** automatyczne obniżenie jakości na słabszych urządzeniach (rozdzielczość cieni, rozmiar tekstur,
wyłączenie AO); model ładowany dopiero po wejściu w zakładkę 3D (lazy loading), żeby nie spowalniać kosztorysu.

**Spójność z kosztorysem:** kliknięcie elementu w 3D (połać, okno, ściana) pokazuje odpowiadające pozycje
kosztorysu i ich trace — tak jak w widoku dachu SVG.

### Sufit podwieszany krzyżowy GK + ocieplenie (ceiling.ts) — zasady użytkownika
Liczony **per pomieszczenie** (lista pomieszczeń: nazwa, dł., szer.; bez listy — cały parter jako przybliżenie
oznaczone „uzupełnij”), potem sumowany. Wymiary pomieszczeń można odczytać z rzutu PDF przesłanego w czacie.
Układ: profile główne wzdłuż dłuższego boku pomieszczenia, nośne krzyżowo (wzdłuż krótszego).
`linie = ceil((rozpiętość − 2 × skrajny) / rozstaw) + 1`.
- Obrysówka **UD27** [licz]: obwody pomieszczeń; profile 3 m lub 4 m (`null` = uzupełnij), łączone na styk →
  `ceil(Σ obwodów / dł. profilu)`; **taśma akustyczna** pod UD = obwody; **kołki szybkiego montażu co 60 cm**.
- Profile **główne (górne) CD60**: co 100 cm, skrajne max 15 cm od ściany; wiszą na wieszakach.
- **Wieszaki**: co 90 cm wzdłuż profilu głównego (ciężkie płyty — 75 cm), skrajne max 40 cm od ściany;
  `wieszaki = linie główne × wieszaki na linii`; mocowanie: do betonu tylko stalowe dyble (nigdy plastikowe).
- Profile **nośne (dolne) CD60**: co 40 cm, skrajne ok. 10 cm od ściany.
- **Łączniki krzyżowe** = główne × nośne (każde skrzyżowanie).
- Profile CD60 2,6 / 3 / 4 m (`null` = uzupełnij; blacha 0,6 mm): linie cięte z profili handlowych modułem cięcia
  (resztki na kolejne linie) → liczba profili; **łączniki wzdłużne** = łączenia kawałków w liniach.
- **Płyty GK** 120 cm × 2,0 / 2,6 / 3,0 m (domyślnie 2,6), gr. 12,5 mm: dłuższym bokiem prostopadle do profili
  nośnych; rzędy = `ceil(krótszy bok / 1,2)`, każdy rząd długości dłuższego boku cięty z płyt; resztki ≥ 40 cm
  (mijanka spoin) na kolejne rzędy. Płyty tylko do profili nośnych — nigdy do UD27 (dylatacja).
- Wkręty do GK, taśma, masa szpachlowa — zużycia `null` (uzupełnij).
- Wełna mineralna na sufit [licz]: m², grubość/warstwy (parametr), m² w paczce.
- Paroizolacja [licz]: `A × 1,1` m² + taśma mb.
- Przykład 12 × 9 m (bez podziału): 10 linii głównych × 14 = 140 wieszaków, 31 nośnych, 310 łączników
  krzyżowych, 70 kołków; CD60 3 m → 133 profile, 92 łączniki wzdłużne; GK 2,6 m → 37 płyt.

### Elewacja (facade.ts)
- EPS 20 cm [licz]: od góry XPS (−26 cm) do linii podbitki (parametr: wysokość nad górą wieńca, domyślnie 0);
  `pow = obwód w połowie EPS × wysokość − otwory`; paczki z m²/paczkę.
- Klej do EPS, klej do siatki, siatka (`× 1,1`), kołki (dł. pod 20 cm), grunt, tynk cienkowarstwowy
  — zużycia `null` (uzupełnij); listwa startowa [licz: obwód], narożniki z siatką [licz: naroża budynku + ościeża],
  listwy APU [licz: obwody okien], ościeża — XPS/EPS cienki [licz: obwody otworów × głębokość].
- **Wg użytkownika:** EPS 20 cm na ścianach na całej wysokości, na ścianach szczytowych **tylko do linii okapu**;
  powyżej szczyty główne: **wełna skalna 20 cm + boazeria** (przełącznik „szczyty ocieplone”, grubość wełny — parametr).
  **Szczyty daszków: domyślnie sama boazeria bez ocieplenia**; przy daszku wybór: sama boazeria / wełna + boazeria / EPS
  (EPS doliczany do EPS elewacji).
- Szczyty (2 szt.) nad linią okapu: `pow_szczytu = b² / 4 × tan α`, `b = B_wew + 2t + 2·g_wełny` (bez ocieplenia:
  `B_wew + 2t`), minus okna w szczytach. Wełna, łączniki, wsporniki, membrana — tylko powierzchnia ocieplona
  (bez ocieplenia pozycje wyłączone); boazeria, łaty, wkręty, impregnat — wszystkie szczyty w boazerii:
  - wsporniki elewacyjne [licz: siatka rozstawów, parametr] + łączniki mocujące [licz],
  - wełna skalna fasadowa [licz] + łączniki talerzykowe [licz],
  - membrana wiatroizolacyjna fasadowa (odporna na UV) [licz: `× 1,1`] + taśma,
  - łaty pionowe nośne na wspornikach + łaty poziome pod pionową boazerię [licz: mb z rozstawów],
  - boazeria (deska elewacyjna pionowa) [licz: `pow × (1 + 10%)`],
  - wkręty nierdzewne do desek [licz], siatka przeciw owadom góra/dół [licz: mb],
  - okapnik/listwa przejścia EPS–drewno [licz: `2 × B_z`], impregnat/olej [licz: zużycie `null`].
- Podbitka [licz]: okapy boczne `2 × R × okap_boczny` + szczytowe `4 × s × okap_szczytowy − narożniki`;
  materiał podbitki m² + ruszt mb + kratki wentylacyjne.

### Podłoga na gruncie i instalacje
- Folia PE pod styropian [licz]: `A_wew × 1,15` + wywinięcie na ściany.
- EPS podłogowy 3 × 5 cm [licz]: `3 × A_wew` m² → paczki.
- Mata/folia systemowa do podłogówki [licz]: `A_wew × 1,05` → rolki.
- Taśma dylatacyjna przyścienna [licz]: obwody pomieszczeń.
- Rura PEX 16 [ręcznie, domyślnie 800 m] → zwoje (np. 200 m); kontrolnie aplikacja pokazuje szacunek
  `A_wew × 6,7 mb/m²` (rozstaw 15 cm).
- Spinki do rur [licz]: mb PEX × szt/mb (parametr).
- Rozdzielacz podłogówki 11 obwodów + szafka + złączki (2 na obwód) [licz/ręcznie].
- Rozdzielacz wody użytkowej [ręcznie] + rury i kształtki wod-kan [ręcznie].
- Przewód YDYp 3 × 2,5 — 600 m, YDYp 3 × 1,5 — 400 m [domyślne ilości, edytowalne] → bębny 100 m.
- Puszki, peszle, rozdzielnica elektryczna z zabezpieczeniami [ręcznie].
- Wentylacja/rekuperacja [ręcznie, opcjonalnie].

## SD — Stan deweloperski

- Wylewka cementowa [licz: m² = `A_wew`; usługa: cena za m²]; informacyjnie objętość przy 6,5 cm.
- Tynki wewnętrzne [licz: m²; usługa: cena za m²]:
  ściany zewnętrzne od środka `P_wew × 2,70` − otwory + ściany działowe obustronnie `2 × mb × 2,70` − otwory × 2
  (+ opcjonalnie ościeża).
- Szpachlowanie/gładź sufitu GK [licz: m² = pow. sufitu].
- Parapety wewnętrzne [licz: mb].
- Drzwi wewnętrzne z ościeżnicami [z listy drzwi; cena za typ] — opcjonalnie tutaj zamiast SSZ.

## Koszty ogólne budowy (kwoty ręczne)

- Kotłownia: kocioł/piec na pellet lub pompa ciepła, bufor, zasobnik/boiler CWU, zbiornik wyrównawczy,
  falownik, osprzęt, montaż.
- Geodeta: mapa do celów projektowych, wytyczenie budynku i osi, inwentaryzacja powykonawcza.
- Projekt domu i adaptacja, badania geotechniczne gruntu, pozwolenie/zgłoszenie, dziennik budowy.
- Kierownik budowy.
- Przyłącze prądu (+ prąd budowlany i zużycie), przyłącze wody lub studnia głębinowa, kanalizacja zewnętrzna
  (szambo/oczyszczalnia/przyłącze).
- Ogrodzenie, brama wjazdowa, utwardzenie dojazdu.
- Opaska wokół domu, odprowadzenie wody z rynien (studnia chłonna), taras, schody zewnętrzne.
- Instalacja odgromowa, fotowoltaika (opcjonalnie).
- Odbiory i pomiary: kominiarski, pomiary elektryczne, odbiór budynku.
- Narzędzia: wkrętarka, szlifierka, poziomice, rusztowanie itp.; wypożyczenia sprzętu (cena za dobę × doby).
- Drobne materiały: wkręty do drewna, wkręty/łączniki do betonu komórkowego, kotwy, pianka, silikony, folie.
- Zaplecze budowy: toaleta przenośna, kontener na odpady, woda budowlana.
- Ubezpieczenie budowy.
- **Rezerwa na nieprzewidziane wydatki**: % od sumy wszystkich etapów (domyślnie 10%).

## Funkcje aplikacji

1. Kreator projektu: geometria → wysokości → grubości → otwory → kontrola schematu poziomów.
2. Zakładki etapów z tabelą: nazwa, ilość, jednostka, opakowania, cena, wartość, „szczegóły”.
3. **Dodawanie własnej pozycji** w każdym etapie: nazwa, kategoria, jednostka, wymiary (dł./szer./wys.)
   lub ilość ręczna, liczba sztuk, opakowanie, cena — ilość z wymiarów zależnie od jednostki
   (mb → dł., m² → dł. × szer., m³ → dł. × szer. × wys.), z trace jak dla pozycji domyślnych.
4. Edycja/wyłączanie/usuwanie pozycji, edycja współczynników, przenoszenie między etapami.
5. Lista „do uzupełnienia”: wszystkie pozycje bez ceny lub ze zużyciem `null`.
6. Podsumowanie każdego etapu (suma, podział na kategorie: materiały / usługi / sprzęt)
   i całości (suma etapów, udział %, koszt na m² powierzchni użytkowej, rezerwa).
7. Plan cięcia OSB i papy (SVG), schemat poziomów (SVG).
8. Wiele projektów, duplikowanie (warianty), import/eksport JSON, eksport CSV/PDF, zestawienie otworów dla producenta.
9. **Ustawienia domyślne nowych projektów** (`model/template.ts`, zapis w IndexedDB): przycisk „Ustaw jako domyślne”
   zapamiętuje z bieżącego projektu bloczek fundamentowy, warstwy podłogi, sufit, kąt dachu i okapy; „Nowy” je wpisuje.
   Szablon wbudowany = **dom użytkownika** (`builtInTemplate`): bloczek fund. 38 × 24 × 12, nośny 59 × 24 (ściana 24),
   działowy 59 × 24 (ściana 12), spoina fund. 1,5 cm, ława 50 × 40 cm, 6 warstw bloczków fund., wieniec fund. 25 cm, chudziak 10 cm (góra = góra wieńca), podłoga EPS 3 × 5 = 15 cm + wylewka 7 cm + płytka z klejem 2 cm = 24 cm,
   ściany nośne 2,80 m od gotowej posadzki, działowe 47 mb (wysokość ponad stelaż GK + 2 cm), dach 30°, okapy 60 cm
   (poziomo od lica elewacji), otwory: 9 okien, 3 drzwi zewn., 7 drzwi wewn. (`USER_OPENINGS`).
   „Wczytaj domyślne” wpisuje szablon do bieżącego projektu. Wartości w projekcie zawsze edytowalne.

## Testy

- Przykład referencyjny do testów: dom prostokątny 12,00 × 9,00 m wewnątrz, ściana 24 cm, EPS 20 cm,
  kąt dachu 35°, okapy 60 cm. Każdy wzór ma test z wynikiem policzonym ręcznie.
- Testy levels.ts: przypadki z resztą 0, 3 cm (dokładana do wieńca) i większą niż limit (warstwa docinana).
- Testy cutting.ts: oba warianty cięcia, wykorzystanie resztek.
- Testy daszku z koszami: `b = 4 m, w = 2 m, α = 35°, β = 45°, Δh = 0` → `d ≈ 2,86 m`, `T ≈ 5,71 m²`,
  daszek ≈ 19,4 m², ubytek połaci głównej ≈ 7,0 m², kosz ≈ 4,0 m każdy;
  oraz `β = α = 35°` → przyrost dachu = `8 / cos 35° ≈ 9,77 m²`.
- Testy rebar.ts: liczba prętów z zakładami, strzemiona, masy.
- Testy groszowe i zaokrągleń do opakowań; trace zgodny z wynikiem.
- Przed zakończeniem zadania: `npm test` i `npm run build`.

## Sposób pracy z Claude Code

- Kolejność: geometry/levels → concrete/rebar/cutting → pozycje SSO → SSZ → SD → ogólne → UI → eksporty.
- Nie zmieniaj wzorów ani domyślnych wartości bez wyjaśnienia, skąd pochodzi zmiana.
- Gdy wzór budowlany jest niejednoznaczny — zapytaj użytkownika, a przyjęte założenie opisz w trace.
- Małe, działające kroki; po każdym: co zrobione, jak sprawdzić.
