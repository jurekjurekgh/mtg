# PLAN 2026-08-08 — Gather token count, modal Choose one labels, mana icons line-break

## Kontekst

Właściciel zgłosił trzy uwagi po testach na iPadzie z PR #34:

1. **A — Gather the Townsfolk** — w opisie rozstrzygnięcia rzucenia karty UI mówi „Tworzysz token 1/1" (nominalnie), ale faktycznie tworzone są **dwa tokeny** (przy życiu > 5) lub **pięć tokenów** (fateful hour, życie ≤ 5). W logu i na stole widać prawidłową liczbę, więc sama mechanika działa, ale opis kłamie. To regresja opisu w `describeSpellEffects` / `describeEffect` w `src/table/render.js`.

2. **B — Your Temple is Under Attack** — modal „Choose one" ma dwa warianty z nazwami na karcie ("Pray for Protection" / "Strike a Deal"), ale w opcjach wyboru UI pokazuje tylko efekty (np. „Stwórz 1/1" albo „Dobierz 2 karty"). Gracz nie wie, który wariant jest który, bo oba mają tę samą listę efektów w polskim opisie (albo bardzo podobną). To samo dotyczy 3 innych kart modalnych w katalogu:
   - `aerith-rescue-mission` — „Take the Elevator" / „Take 59 Flights of Stairs"
   - `your-temple-is-under-attack` — „Pray for Protection" / „Strike a Deal"
   - `ruinous-rampage` — „Ruinous Rampage" (nazwa karty jako nazwa trybu) / „Exile all artifacts with mana value 3 or less" (brak nazwy własnej)
   - `youre-confronted-by-robbers` — „Stall for Time" / „Call for Aid"
   Brak pola `name` w deskryptorze `spell.modes[i]` i nieobsłużone w `commandLabel`.

3. **C — Ikony kosztów many łamią tekst w opcjach wyboru** — w `dist/mtg-table.html` `.ms { display: inline-flex; ... }` (ikony symboli many w `mana-icons.js`). W wąskim buttonie `.action` (`display: flex; align-items: center; gap: 8px`) długi `commandLabel` z ikonami łamie się tuż obok ikony, przez co tekst wygląda „dziwnie" (ikona zostaje sama w linii albo tekst się łamie w nieintuicyjnym miejscu).

## Rozpoznanie (przed planem)

**Silnik opisu (`src/table/render.js`):**

- `describeSpellEffects(spell)` (linia 130–144): generuje string efektów czaru dla wiersza karty w panelu. Dla `create_token` zwraca `Stwórz ${power}/${toughness} ${name}` — **nie uwzględnia `amount` ani fateful hour**.
- `describeEffect(e)` (linia 233–256): generuje opis jednego efektu w opisie zdolności aktywowanej. Dla `create_token` zwraca `stwórz token ${name}` — **nie uwzględnia `amount`**.

**Silnik modalny (`src/engine/effects.js`, `src/engine/spells.js`):**

- `cast_permanent` z `modes` akceptuje pole `modeIndex` (który tryb wybrano). `legalSpellCasts` emituje warianty dla każdego trybu osobno, z `modeIndex` w komendzie.
- Brak pola `name` w trybie — tryby identyfikowane tylko indeksem.

**Modalne w katalogu (`src/cards/card-data.js`):**

- 4 karty z `spell.modes`:
  - linia 1598 — `aerith-rescue-mission` (FIN): "Take the Elevator" / "Take 59 Flights of Stairs"
  - linia 2201 — `your-temple-is-under-attack` (CLB): "Pray for Protection" / "Strike a Deal"
  - linia 2576 — `ruinous-rampage` (EOE): "Ruinous Rampage" (== nazwa karty) / brak nazwy własnej (drugi tryb bez nazwy)
  - linia 2724 — `youre-confronted-by-robbers` (CLB): "Stall for Time" / "Call for Aid"
- Wszystkie 4 z `oracleText` zawierającym nazwy trybów (po "•" przed efektami).

**UI akcji (`src/table/render.js` `commandLabel` + `dist/mtg-table.html`):**

- `commandLabel(cmd, ...)` (linia 313–436) zwraca string HTML z ikonami `manaCostHtml`. Dla `cast_permanent` z `modeIndex` zwraca `Rzuć: NazwaKarty (koszt {X})` — **nie uwzględnia nazwy trybu**.
- `.action` button w `dist/mtg-table.html` (linia 378–386): `display: flex; align-items: center; gap: 8px`. Długi `commandLabel` z `manaCostHtml` (wewnątrz HTML buttona jako inline content) nie jest flex-itemem (button ma `display: flex`, ale TREŚĆ buttona to inline content wewnątrz flex-itemu), więc tekst wewnątrz powinien się łamać normalnie.
- `.ms` w `mana-icons.js` / `dist/mtg-table.html` (linia 56–65): `display: inline-flex; align-items: center; justify-content: center; width: 1.25em; height: 1.25em; border-radius: 50%; ... margin: 0 1px; vertical-align: -0.12em; position: relative;`. Inline-flex traktowane jako litera, więc łamanie linii może zachodzić **przed** lub **po** ikonie — i to jest ten „dziwny" break.

## Cel

1. **A. Gather the Townsfolk** — `describeSpellEffects` i `describeEffect` pokazują liczbę tokenów (z uwzględnieniem fateful hour przy nazwie karty / description).
2. **B. Modalne Choose one** — każdy tryb ma pole `name` (z `oracleText`); `commandLabel` pokazuje nazwę trybu w ofercie akcji.
3. **C. Ikony many** — `white-space: nowrap` na `.ms` (ikona trzyma się sąsiedniego tekstu, nie jest rozrywana przez łamanie linii).

## Zakres (3 commity po planie)

### Commit 1 — `feat: opis create_token uwzględnia amount (A) + fateful hour w renderze`

**`src/table/render.js`:**
- `describeSpellEffects`: dla `create_token` z `amount > 1` zwraca `Stwórz ${amount}× token ${power}/${toughness} ${name}`. Np. Gather the Townsfolk (amount=2, fateful hour) → "Stwórz 2× token 1/1 Human". Dla amount=1 (np. ETB Crested Herdcaller tworzy jeden 3/3) → bez zmian.
- `describeEffect`: analogicznie — `stwórz ${amount ?? 1}× token ${name}` dla amount>1.
- **Fateful hour w opisie:** rozważamy dwa podejścia:
  1. **Minimalistyczny**: pokaż `amount` (nominalna wartość z definicji, np. 2 dla Gather the Townsfolk). Boty i tak rozstrzygają fateful hour dynamicznie (CR 702.86), a UI wyświetla tylko nominalną wartość. Rzeczywista liczba tokenów pojawia się w logu (`token_created` × N). Taki opis jest zgodny z kartą (Oracle text mówi "Create two 1/1 ...; fateful hour ... create five of those tokens instead").
  2. **Pełny**: opis zawiera "2 tokeny (5 tokenów przy życiu ≤ 5)". Realistycznie dłuższy opis, ale informuje gracza o fateful hour w opisie karty.
- **Decyzja: podejście 2** — właściciel chce widzieć faktyczny efekt. Tekst rozszerzony o " (5 przy życiu ≤ 5)" dla kart z `ifLifeAtMost`.

**`test/real-cards-batch8.test.js` (zaktualizowany):**
- Dodany test: `describeSpellEffects` dla Gather the Townsfolk zwraca "Stwórz 2× token 1/1 Human (5 przy życiu ≤ 5)" albo podobne.

**Build:**
- `npm test` → 1029/1029 (1 nowy test).
- `npm run build` → 49 modułów / ~1095.5 kB.

### Commit 2 — `feat: tryby modalne Choose one mają nazwy (B)`

**`src/cards/card-data.js`:**
- 4 karty modalne: każdy `spell.modes[i]` dostaje pole `name` z `oracleText`:
  - `aerith-rescue-mission`: `name: 'Take the Elevator'` / `name: 'Take 59 Flights of Stairs'`.
  - `your-temple-is-under-attack`: `name: 'Pray for Protection'` / `name: 'Strike a Deal'`.
  - `ruinous-rampage`: `name: 'Ruinous Rampage'` (pierwszy tryb, nazwa karty jako nazwa trybu) / `name: 'Exile Artifacts'` (drugi tryb, opisowy skrót; nie ma nazwy w Oracle, więc syntetycznie na podstawie opisu — „Exile all artifacts with mana value 3 or less" → „Exile Artifacts").
  - `youre-confronted-by-robbers`: `name: 'Stall for Time'` / `name: 'Call for Aid'`.
- Komentarz w `defineCard` dla każdej karty z odwołaniem do nazwy w `oracleText`.

**`src/table/render.js` `commandLabel`:**
- Dla `cast_permanent` z `modeIndex` i `card.spell.modes[modeIndex].name`: zwraca `Rzuć: NazwaKarty — NazwaTrybu (koszt {X})`. Bez nazwy trybu → bez zmian.
- Przy `legalSpellCasts` warianty z różnymi `modeIndex` (ale tą samą kartą) są grupowane w ChoiceRequest (`spell:${objectId}`), więc modal pokazuje oba warianty w jednym panelu — z nazwami trybów.

**`docs/PROJECT_STATE.md` + `docs/ENGINE_MILESTONES.md`:**
- Sekcja/krótki wpis o nowej konwencji `spell.modes[i].name` (analogicznie do `token_human.name` w `create_token`).

**Testy:**
- Nowe w `test/real-cards-batch20.test.js` (albo nowy plik `test/modal-modes-names.test.js`): assert, że `cast_permanent` z `modeIndex` ma `name` w `commandLabel`, że 4 karty modalne w katalogu mają `name` w każdym trybie (walidacja regresji).

**Build:**
- `npm test` → 1031/1031 (+2).
- `npm run build` → 49 modułów / ~1095.5 kB.

### Commit 3 — `fix: ikony many nie łamią tekstu w przyciskach (C)`

**`dist/mtg-table.html` (CSS):**
- `.ms` dostaje `white-space: nowrap;` — ikona zawsze trzyma się sąsiedniego tekstu, nie jest rozrywana przez łamanie linii. Reguła CSS jest wbudowana w `dist/mtg-table.html` (single-file artifact, ADR 0011), więc aktualizacja to wklejenie tej właściwości do istniejącej reguły `.ms` (linia 56).
- Alternatywnie: `display: inline-block` z `line-height: 1.25em` zamiast `inline-flex` — uprości layout, ale zmieni wygląd hybryd (conic-gradient z `--ms-a`/`--ms-b` w pseudo-elementach `i`). Bezpieczniej: dodać `white-space: nowrap` i ewentualnie `flex-shrink: 0` (ikona nie kurczy się).
- Źródło CSS jest w `tools/build.mjs`? Sprawdzić — w `src/table/mana-icons.js` jest helper, ale **CSS jest inline w dist** (`dist/mtg-table.html` ma `.ms` style z `mana-icons.js` lub z osobnego CSS). Trzeba upewnić się, że build regeneruje CSS.

**`tools/build.mjs` (jeśli CSS jest w nim):**
- Dodać `white-space: nowrap; flex-shrink: 0;` do reguły `.ms`.

**`src/table/mana-icons.js` (jeśli CSS jest tam w jakiejś formie):**
- Dodać regułę do stałej (np. eksportowanej jako string).

**Test:**
- Test integracyjny w `test/table-ui.test.js` (render `.action` button z `commandLabel` zawierającym ikony `manaCostHtml`) — sprawdzenie, że przyciski nie mają dziwnych wrapów. Wizualne sprawdzenie CSS (unit test nie weryfikuje layoutu, więc test musi być manualny).

**Build:**
- `npm test` → 1031/1031 (bez zmian).
- `npm run build` → 49 modułów / ~1095.5 kB (z CSS).

## Kolejność w PR

1. **commit 1** — plan (ten plik).
2. **commit 2** — A: opis create_token (token count + fateful hour).
3. **commit 3** — B: nazwy trybów modalnych.
4. **commit 4** — C: CSS ikon many.
5. **commit 5** — docs (M51 + HANDOFF).

## Ryzyka

- **A**: fateful hour dotyczy na razie jednej karty (Gather the Townsfolk). Jeśli w przyszłości powstaną inne karty z `ifLifeAtMost`, render musi obsłużyć wariant. Test z prawidłowym napisem.
- **B**: dodanie `name` do trybów nie zmienia silnika (pole opcjonalne). Jeśli `commandLabel` nie obsługuje `modeIndex` w wariancie modalnym, modal pokaże dwa warianty bez rozróżnienia — ale to lepsze niż obecny stan. Weryfikacja testu.
- **C**: CSS w `dist/mtg-table.html` jest inline (single-file artifact). Build musi regenerować CSS z `mana-icons.js` lub z innego źródła. Weryfikacja, czy `tools/build.mjs` to robi. Jeśli ręcznie dodane do dist, to PR zmienia tylko dist — wtedy przy następnym buildzie zmiana zniknie (ryzyko regresji).

## Poza zakresem

- Animacja tokenów na stole (właściciel nie zgłosił).
- Inne tryby modalne „modal dual" (główne + dodatkowy efekt, jak w Aerith) — poza zakresem.
- Inne karty z fateful hour (np. okazjonalne) — poza zakresem.

## Podsumowanie wykonania (2026-08-08, PR #35)

**Commity sesji (4 + docs):**
1. `5233a76` — plan sesji (ten plik, wg AGENTS.md).
2. `3e2c124` — `feat: opis create_token uwzględnia amount (A) + fateful hour w renderze`.
3. `8458a0c` — `feat: modalne Choose one — nazwy trybów widoczne w etykiecie akcji (B)`.
4. `10305eb` — `fix: ikony many nie łamią tekstu w przyciskach akcji (C)`.
5. `38c8a03` — `docs: M51 — UX i18n: token count, modal labels, ikony many (HANDOFF 2026-08-08b)`.

**Wynik:**
- `npm test` → **1039/1039 zielonych** (było 1028 przed sesją; +11 nowych: 5 spell-effect-description, 6 modal-mode-name).
- `npm run build` → **49 modułów / 1098.5 kB** (było 49 / 1095.3 kB; +3.2 kB na komentarze i nowe pliki).
- B0 (pełny benchmark) NIE był uruchamiany — zmiany to UI/etykiety (żadna mechanika ani zachowanie bota się nie zmieniło); boty biorą pierwszą ofertę `pendingTriggerTargets` jak dotąd.

**Kluczowe decyzje dla właściciela (podjęte w sesji):**
- Plan 5-commitowy (plan + feat A + feat B + fix C + docs) — zgodnie z AGENTS.md.
- Zmiana CSS `.ms`: inline-block + nowrap + flex-shrink:0 + margin 0 2px (z inline-flex). Weryfikacja wizualna: patrz oryginalny screenshot iPada w zgłoszeniu (przycisk „Rzuć: Your Temple Is Under Attack (koszt 2 {W}) → cel: Nieprzyjaciel" — ikona {W} zostawała sama w linii, `)` uciekał do następnej). Po commicie: ikona trzyma się sąsiedniego tekstu.
- Nowa konwencja `spell.modes[i].name` dla kart modalnych — wszystkie 4 karty modalne w katalogu zaktualizowane. Przyszłe karty modalne w batchu powinny mieć tę właściwość ustawioną (dodano dopisek w commit message).
- Zgodnie z AGENTS.md i właścicielskim workflow: każde zadanie = 1 PR sesji. PR #35 czeka na scalenie. PR #34 (M50 Saga Mesmerize) nadal oczekuje na scalenie z poprzedniej sesji.
