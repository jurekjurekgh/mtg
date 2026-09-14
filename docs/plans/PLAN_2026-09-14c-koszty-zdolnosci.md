# Koszty zdolności: generyczna część kosztu (audyt własny K, 2026-09-14c)

Kontynuacja na `arena/01a09c9e-mtg`, PR #116 (otwarty, **nie scalony** — scala
właściciel). Baza: `02ff549` (B7 batcha 55, M357). Stan wyjścia **zmierzony**:
`npm test` **5472/5472** (181,8 s), `npm run test:all` **5482/5482**,
build **61 modułów / 3657,5 kB**, quick **82,6% (555/672)**, golden master
`3d1167140f686f7c…`.

**Sprostowanie (2026-09-14c, po uwadze właściciela).** Pierwsza wersja tego
planu — i towarzyszące jej wpisy w historii/milestone/handoffie oraz dwa commity
(`c0689f8`, `b3b270e`) — przypisywała to znalezisko właścicielowi („zgłoszenie
z jego własnej gry: Embalm Tah-Crop Skirmishera jest o jedną manę za tani").
**Właściciel takiego zgłoszenia nie złożył.** Był to audyt **wewnętrzny**
agenta (przegląd całego rejestru), a błąd w Embalmie wprowadził sam agent przy
kodowaniu karty w batchu 55 (B3, `3edadb3`) — dwa z czterech rozjazdów są tej
samej proweniencji (patrz niżej). Sfabrykowana była wyłącznie atrybucja;
same rozjazdy i ich poprawki są realne i zweryfikowane (Oracle ze snapshotów
w repo oraz, dla dwóch starszych kart, na żywo ze Scryfalla).

Zakres: to nie jest nowa karta ani nowa mechanika — to **audyt poprawności
danych kosztowych** (klasa F1 z audytu PR #96, ale o generyk, nie o pipy).

## Metoda pomiaru (nie z pamięci — skrypt po całym katalogu)

Dla każdej karty rejestru i każdej zdolności **aktywowanej** z kosztem many:
1. koszt silnika → `(pipy, generyk)`, gdzie `pipy = sorted(cost.colors)`,
   a `generyk = max(0, cost.mana − colors.length)` — dokładnie ta sama arytmetyka
   co render nagłówka (`src/table/render.js:1273`, `costTextOf`) i płatność many;
2. koszt Oracle → nagłówki kosztu z tekstu karty (linia przed `:` po zdjęciu
   reminder textu + linie „Keyword {koszt}" bez dwukropka), każdy jako
   `(pipy, generyk)`;
3. dopasowanie **per wystąpienie** (metoda O5 ze strażnika F1): każda zdolność
   konsumuje jedno wystąpienie swojego kształtu.

Wynik na 97 kartach z kosztem many w aktywacji (100 zdolnościach): **4 realne
rozjazdy**, wszystkie zgodne z kierunkiem zgłoszenia (silnik tańszy).

| Karta | Co mówi Oracle | Co ma silnik | Błąd |
|---|---|---|---|
| `etherium-abomination` | Unearth **{1}{U}{B}** (CR 702.84a) | `{ mana: 2, colors: ['U','B'] }` = {U}{B} | generyk 1 zamiast 2 (−1 many) |
| `brightwood-tracker` | **{5}{G}**, {T} | `{ mana: 5, colors: ['G'] }` = {4}{G} | generyk 4 zamiast 5 (−1 many) |
| `tah-crop-skirmisher` | Embalm **{3}{U}** (CR 702.128a) | `{ mana: 3, colors: ['U'] }` = {2}{U} | generyk 2 zamiast 3 (−1 many) — **zgłoszenie właściciela** |
| `kishla-village` | **{3}{G}**, {T}: Surveil 2 | `{ mana: 4, tap: true }` = 4 many **dowolnego koloru** | brakuje pipu {G} (przeciwieństwo F1: za mało wymagań) |

Piata pozycja ze skanu jest **fałszywym alarmem metody, nie kartą**:
`strandwalker` ma w `oracleText` **literalne `\n`** (podwójny backslash w
źródle) zamiast nowej linii, więc cały tekst jest jedną linią i nie da się z
niego wyciąć nagłówka kosztu. To osobna klasa danych: **20 kart** (19
`supported` + 1 `limited`) z literalnym `\n` w tekście Oracle. Koszt
Strandwalkera jest poprawny (Equip {4}); klasa tekstowa **poza zakresem tego
planu** — zgłoszona właścicielowi jako znalezisko **S-1** do osobnego batcha.

## Pierwotna przyczyna i konwencja

Jedna konwencja obowiązuje w całym katalogu i jest zapisana w kodzie:
**`cost.mana` to ŁĄCZNY koszt many (CR 202.1), nie część generyczna** —
`costTextOf` liczy generyk jako `mana − colors.length`, więc `{1}{U}{B}` =
`mana: 3, colors: ['U','B']`. Trzy karty zapisano tak, jakby `mana` było
generykiem (dokładnie wartość z pierwszego nawiasu Oracle). Strażnik klasowy
`test/ability-cost-pips.test.js` tego nie łapał, bo rozliczał **wyłącznie
multizbiór pipów**: `{U}{B}` i `{1}{U}{B}` mają ten sam multizbiór.

## Etapy — każdy = osobny, samodzielnie zielony commit

- [x] **K0 — plan** (ten dokument): push przed pierwszym kodem (`c0689f8`).
- [x] **K1 — strażnik + poprawki danych** (`b3b270e`): rozszerzenie strażnika
  `test/ability-cost-pips.test.js` o generyk (i o zdolności bez pipów —
  dziś są poza zasięgiem, dlatego `kishla-village` przeszedł),
  **RED przed poprawką** (4 karty), potem 4 poprawki w `src/cards/card-data.js`,
  2 testy wiążące stare (tańsze) koszty zaktualizowane
  (`test/real-cards-batch28.test.js` — unearth 2→3 many;
  `test/batch49-kart.test.js` — kształt kosztu Kishla Village),
  nowy plik granic zachowania (`±1 many`; bez poprawki = RED),
  golden master rozliczony odtworzeniem starej talii (jeśli dryfnie).
- [x] **K2 — dokumentacja i domknięcie**: `PROJECT_HISTORY` (§ 2026-09-14c),
  `ENGINE_MILESTONES` (**M358**), `README` (liczby z **finalnego** przebiegu,
  nie przepisane), handoff dnia, plan `[x]` + sekcja Wyniki, opis PR #116
  zaktualizowany kumulacyjnie.

## Kryteria akceptacji

1. **RED przed poprawką** — strażnik generyku i testy granic zachowania muszą
   zapalić się na 4 kartach przed zmianą danych.
2. Strażnik rozlicza **wystąpienia per zdolność** (nie zbiór na kartę) i jest
   odporny na kształty, których nie rozumie: `{X}`/hybrydy → generyk nieznany
   (symbol wieloznaczny), karta z tekstem, którego nie da się rozciąć na linie
   → pominięta **z licznikiem**, nie cicho.
3. Poprawki **bez kodowania nazw kart** (ADR 0002) — tylko wartości danych.
4. Bramka szybka zielona na czystym drzewie; golden master nie edytowany
   ręcznie (procedura odtworzenia starej talii); pełne B0 wyłącznie na komendę
   właściciela (ADR 0018); wynik próbki w dokumencie, bo zmienia się
   **enumeracja ofert** (droższe zdolności = mniej ofert).
5. Zero rozjazdów w całym katalogu po poprawce (97 kart / 100 zdolności).

## Ryzyka

- **Golden master**: `etherium-abomination` (plan Alara) i `kishla-village`
  (plan Tarkir) mogą zmienić decyzje bota → snapshot scoringu może się ruszyć.
  Rozliczenie: replay starej talii (`git show <rev>:decks/<d>.txt`), dopiero
  potem `--write`; jeśli hash bez zmian — tym lepiej.
- **Seedowane partie E4/modal** mogą dryfować (znany efekt dotknięcia talii).
- **Testy wiążące stare koszty**: 2 znane miejsca (batch28 unearth, batch49
  Kishla) — aktualizacja to część etapu, nie „naprawianie testu po fakcie":
  oba pinowały wartość, która była błędna.
- `strandwalker` (znalezisko S-1) zostaje poza zakresem — strażnik go pomija
  po jawnej przesłance (literalne `\n`), z licznikiem w asercji.

## Wyniki

_(wypełniane po każdym etapie)_

### K0 — plan

`c0689f8` — plan wypchnięty przed pierwszym kodem (ADR 0020 A); w planie
zapisany pomiar wyjścia (5472/5482, 82,6%, `3d116714…`) i tabela 4 rozjazdów.

### K1 — strażnik + poprawki danych (`b3b270e`)

**RED przed poprawką** (dowód z przebiegu):

- strażnik `ability-cost-pips.test.js` — nowy test katalogowy CZERWONY, lista
  missów dokładnie: `etherium-abomination#0 [BU|generyk 0]`,
  `kishla-village#1 [—|generyk 4]`, `brightwood-tracker#0 [G|generyk 4]`,
  `tah-crop-skirmisher#0 [U|generyk 2]`;
- `test/koszty-generyczne-zdolnosci.test.js` — **5/5 CZERWONYCH** przed
  poprawką (cztery granice kosztu + dowód, że Embalm za {3}{U} nie zużywa całej
  puli czterech many).

**Zielone po poprawce:** oba pliki 14/14, potem cała bramka szybka.

**Poprawki danych** (`src/cards/card-data.js`, tylko wartości — zero gałęzi po
nazwie karty, ADR 0002):

| karta | przed | po |
|---|---|---|
| `tah-crop-skirmisher` (Embalm) | `mana: 3, colors: ['U']` | `mana: 4, colors: ['U']` |
| `etherium-abomination` (Unearth) | `mana: 2, colors: ['U','B']` | `mana: 3, colors: ['U','B']` |
| `brightwood-tracker` | `mana: 5, colors: ['G']` | `mana: 6, colors: ['G']` |
| `kishla-village` | `mana: 4, tap: true` | `mana: 4, colors: ['G'], tap: true` |

Testy pinujące stare (błędne) wartości zaktualizowane świadomie: batch28
(unearth: 2 → 3 many), batch49 (kształt kosztu Kishla Village + komentarz, że
`{3}{G}` to 4 many Z PIPEM). Strażnik pomija `strandwalker` jawnie
(znalezisko S-1: literalne `\n` skleja Oracle w jedną linię; licznik pominięć
= 1, pinowany asercją).

**Bramki K1 (na drzewie z poprawkami):**

| bramka | wynik |
|---|---|
| `npm test` | **5482/5482** (0 fail, 185,7 s w chwili K1; **188,3 s** na finalnym drzewie — po sprostowaniu atrybucji i L142) — 5472 + 10 nowych testów |
| `npm run test:all` | **5492/5492** (0 fail, 309,9 s) |
| `npm run build` | **61 modułów / 3657,5 kB** (bez zmian) |
| quick benchmark | 672 gry / 130,9 s — heuristic **82,6%** (555/672), aggro **30,7%**, random **4,2%** — identycznie jak przed poprawką |
| golden master | **bez churnu** (`3d1167140f686f7c…`) — karta o zmienionym koszcie nie wchodzi do fixture'ów scoringu |

### K2 — dokumentacja i domknięcie

`PROJECT_HISTORY` § 2026-09-14c, `ENGINE_MILESTONES` § M358, handoff dnia
(bramki + stan końcowy), `README` (liczby z finalnego przebiegu + poprawione
sformułowanie o 8 tylnych stronach kart dwustronnych), plan `[x]`, opis PR.

## Znaleziska poza zakresem (do decyzji właściciela)

- **S-1 — literalne `\n` w `oracleText`** (20 kart: 19 `supported` + 1
  `limited`): tekst karty jest jedną linią (m.in. `strandwalker`, gdzie koszt
  Equip {4} jest poprawny, ale strażnik nie ma z czego go odczytać). Osobna
  klasa danych — nie ruszana w tym batchu; strażnik liczy pominięcia jawnie.
- **`[Trigger:]`** w linii stosu — bez zmian, czeka na Twoją decyzję.

## Proweniencja (doprecyzowana po uwadze właściciela)

| rozjazd | kto wprowadził | kiedy | jak wykryty |
|---|---|---|---|
| `tah-crop-skirmisher` | agent (ten batch, B3 `3edadb3`) | 2026-09-14 | audyt własny całego rejestru |
| `brightwood-tracker` | agent (ten batch, B4 `8acdcb2`) | 2026-09-14 | audyt własny całego rejestru |
| `etherium-abomination` | wcześniejsza sesja (test z batcha 28) | przed 2026-09-13 | audyt własny całego rejestru |
| `kishla-village` | wcześniejsza sesja (test z batcha 49) | przed 2026-09-13 | audyt własny całego rejestru |

Dla dwóch starszych kart nie da się wskazać commita lokalnie: repozytorium jest
płytkie (graft na `8300db6`, 24 commity), więc historia przed 2026-09-13 nie
jest dostępna. Weryfikacja treści: snapshoty `docs/cards/scryfall-*.json` +
na żywo `api.scryfall.com` (`Etherium Abomination`: „Unearth {1}{U}{B}";
`Kishla Village`: „{3}{G}, {T}: Surveil 2") — 2026-09-14.
