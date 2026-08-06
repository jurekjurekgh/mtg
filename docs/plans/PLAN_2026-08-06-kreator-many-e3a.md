# Plan: Rozszerzenie kreatora many (E.3a) — źródła nie-lądowe + tryby kosztów

- **Data:** 2026-08-06
- **Sesja:** `arena/019fd8a4-mtg`
- **Zadanie z handoffu** (`HANDOFF_2026-08-06.md`, „Co dalej"):
  > Rozszerzenie kreatora many (E.3a) o **źródła nie-lądowe** (zdolności many
  > permanentów) i **tryby kosztów** (morph/escape/cleave/{X}/bestow) — obecnie
  > poza zakresem kreatora (auto-tap / aktywacja przed rzutem jak dotąd).
- **Punkty wyjścia:** `src/table/mana-wizard.js`, `src/table/main.js`
  (`play`, `manaWizardFor`, `refreshManaWizard`), `test/table-mana-wizard.test.js`.

## Kontekst (co już działa)

Kreator many (M37, PR #29) otwiera się, gdy płatność za rzut ma **≥2 warianty**
tapowania źródeł (`countPaymentVariants`), i pozwala graczowi tapować **po jednym
źródle** (`tap_for_mana`), doliczając do puli, aż suma pokryje koszt — wtedy
wstrzymana komenda rzutu odpala się sama. `paymentDescriptorOf` wyciąga z komendy
`{totalNeeded, requirements, costStr}`; `wizardProgress` liczy postęp z puli i
pokrycia kolorów; `renderManaWizard` rysuje modal.

**Świadome ograniczenia (do zniesienia):**
1. `paymentDescriptorOf` zwraca `null` dla `cast_cleave`, `cast_escape`,
   `cast_permanent` z `bestow`/`faceDown` oraz kosztów z `{X}` — te rzuty
   spadają na auto-tap M34 (gracz nie wybiera, których landów tapować).
2. Źródła many = tylko **lądy** (`untappedLandSourcesOf`). Zdolności many na
   innych permanentach (Apprentice Wizard, Seer's Lantern, Dragonbroods' Relic,
   Scorned Villager/Moonscarred Werewolf, token Treasure) gracz aktywuje
   **PRZED** rzutem ręcznie.

## Model kolorów many (kluczowy dla zakresu)

Pula many w engine jest **bezbarwna** (liczba). Kolorowy koszt jest sprawdzany
**statycznie** (`hasColorForObject` → `allControlledManaSources` via
`MANA_SOURCE_MAP`), a `spendMana` auto-tapuje landy do sumy. Kreator to warstwa
UX: pozwala **wybrać, których źródeł** użyć (zachowanie landów na przyszłość,
świadome poświęcenie Skarbu), nie zmieniając legalności. Zatem:
- kreator dotyka **wyłącznie gracza-ludzka** (ścieżka `main.js:play`);
- boty (`heuristic-bot`/`aggro-bot`) idą przez `session.apply` i **nigdy** przez
  kreator → **brak wpływu na benchmark B0, progi regresji bez zmian.**

## Część B — tryby kosztów (morph/escape/cleave/{X}/bestow)

**Cel:** `paymentDescriptorOf` rozpoznaje wszystkie komendy rzutu, więc
niejednoznaczna kolorowa płatność za cleave/escape/bestow otwiera kreator
(zamiast cichego auto-tapu). Morph (bezbarwny {3}) i {X} pozostają poza
kreatorem (brak wyboru koloru) — obsługa jawna i udokumentowana.

Koszty alternatywne z `session.state` (liczby, **bez** obniżek CR 601.2f —
`castCleave`/`castEscape`/`castAuraSpell(bestow)` nie wołają `reduceGenericCost`):
- `cast_cleave` → `object.spell.cleave.manaCost` (obiekt w ręce — widok niesie
  `spell.cleave`).
- `cast_escape` → `object.spell.escape.cost` (obiekt w **grobie** — widok grobu
  NIE niesie `spell`; main.js czyta z `session.state` i podaje przez `opts`).
- `cast_permanent{bestow:true}` → `object.bestow.cost` (widok ręki niesie `bestow`).
- `cast_permanent{faceDown:true}` (morph) → `object.morph.cost`, `requirements=[]`
  (bezbarwny, CR 702.36) → kreator się nie otworzy (0 wariantów koloru) —
  `paymentDescriptorOf` zwraca deskryptor z pustymi wymaganiami; `countPaymentVariants`
  daje 1.
- `{X}` — brak rzutów-czarów z `{X}` w katalogu (tylko zdolności, poza zakresem);
  zachowujemy defencyjne `null` przy `{X}` w `MANA_COSTS[cardId]`.

Wymagania kolorów dla cleave/escape/bestow = pipy kolorowe z
`parseManaCost(MANA_COSTS[cardId])` (spójne z `hasColorForObject` w engine).
`generic = totalNeeded − requirements.length`; `effectiveGeneric` NIE skraca
tych kosztów (brak obniżek).

### Zmiany (cz. B)
- `src/table/mana-wizard.js`: `paymentDescriptorOf` — nowe gałęzie po
  `WIZARD_CAST_TYPES` (rozszerzyć o `cast_cleave`, `cast_escape`); `opts.escapeCost`
  (liczba z state) dla escape; `opts.modeLabel` („Cleave"/„Escape"/„Bestow") do
  `costStr`. `cmd.xValue`/`{X}`/morph → deskryptor z `requirements=[]` lub `null`.
- `src/table/main.js`: `manaWizardFor` — dla `cast_cleave`/`cast_escape`/`cast_escape`
  czyta koszt z `session.state` i przekazuje przez `opts` (jak dziś
  `effectiveGeneric`).
- `test/table-mana-wizard.test.js`: deskryptory cleave/bestow z fakeView (ręka
  niesie deskryptory), escape przez `opts.escapeCost`, morph → 0 wymagań.

## Część A — źródła nie-lądowe (zdolności many permanentów)

**Cel:** kreator oferuje, oprócz landów, **nietapnięte permanenty z zdolnością
produkującą manę** (Apprentice Wizard, Seer's Lantern, Dragonbroods' Relic,
Scorned Villager/Moonscarred, token Treasure). Gracz tapuje je w kreatorze jak
landy; kreator wysyła `activate_ability` (nie `tap_for_mana`).

Źródła nie-lądowe mają różne koszty aktywacji (netGain = produkcja − koszt many):
- Seer's Lantern `{T}`: +1; Scorned Villager `{T}`: +1; Moonscarred `{T}`: +2;
  Apprentice Wizard `{U},{T}`: **net +2** (−1 +3); token Treasure `{T},Sacrifice`:
  +1 (znika); Dragonbroods' Relic `{T},Tap creature`: +1 (tapuje stwora).
- **Żadna** zdolność many nie ma celu → komenda `{type:'activate_ability',
  objectId, abilityIndex}` (bez targets).
- Kolory z `MANA_SOURCE_MAP` (spójne z `allControlledManaSources`).

### Projekt (cz. A)
1. **main.js** buduje listę źródeł z `view.legalCommands` (tylko `activate_ability`,
   bo gwarantują legalność/timing/opłacalność) + dopasowanie do `session.state`:
   czy `object.abilities[abilityIndex].effect` to `add_mana`. Każde źródło:
   `{id, cardId, name, colors, amount: netGain, command}`.
   `netGain = (efekt.amount) − (ability.cost.mana ?? 0)`.
2. **mana-wizard.js**: funkcje źródłowe przyjmują połączoną listę
   (`sources = [...landSources, ...nonLandSources]`) zamiast liczyć same z widoku.
   - `wizardProgress(view, playerId, descriptor, sources?)` — `sources` opcjonalne
     (domyślnie `untappedLandSourcesOf(view)` — kompatybilność wsteczna testów).
   - `renderManaWizard` — przycisk źródła niesie `command` (nie tylko id);
     etykieta pokazuje nazwę + kolory + „(+N)".
3. **main.js** `refreshManaWizard` → `onTapSource(source)` wysyła `source.command`
   (`tap_for_mana` dla landów, `activate_ability` dla reszty). Po komendzie
   `refreshManaWizard()` czyta znowu widok (Treasure zniknął, pool wzrósł o netGain).

### Skutki uboczne (akceptowane, udokumentowane)
- `activate_ability` Apprentice Wizard kosztuje 1 many z puli (net +2) — kreator
  czyta **rzeczywistą** pulę po każdej komendzie (`wizardProgress`), więc postęp
  jest poprawny mimo netGain.
- Dragonbroods' Relic / Holdout-style: tapuje deterministycznie stwora (jak
  wszędzie w engine, ADR 0005).
- Token Treasure: poświęcenie jest nieodwracalne (jak ręczna aktywacja) —
  kreator tego nie cofa (Anuluj zostawia manę w puli, jak dotąd).

### Testy (cz. A)
- `nonLandManaSources`: czysta funkcja w main.js (wyciągnięta/testowana) — Apprentice
  net +2, Treasure +1, Seer's Lantern +1, filtry (tylko add_mana, tylko legalne).
- `countPaymentVariants` / `wizardProgress` z połączoną listą — warianty z dorkami.
- `renderManaWizard` — przycisk niesie `command`; klik wysyła activate_ability.
- Integracja (mini-DOM w `test/table-ui.test.js`): Apprentice Wizard + drogi czar
  → kreator oferuje dorka; tapnięcie dorka daje manę; rzut się odpala.

## Kryteria ukończenia

- [x] `npm test` zielone (rosnące o testy cz. B i cz. A) — **887/887**.
- [x] `npm run build` przechodzi (modułowa liczba bez zmian — czysta warstwa
  stołu) — **48 modułów / 901,6 kB**.
- [x] Brak zmian engine'u/protokołu (`src/engine/**`, `src/protocol/**` nietknięte).
- [x] Boty nietknięte → **B0 niewymagany** (kreator = tylko ścieżka gracza).
- [x] Polski w UI/logu (etykiety źródeł, trybów kosztów).

## Podsumowanie wykonania

Obie części wdrożone w osobnych, zielonych commitach:

- **cz. 1 (508eef1) — tryby kosztów:** `paymentDescriptorOf` rozpoznaje
  `cast_cleave`/`cast_escape`/`cast_permanent{bestow}`/`morph`. Koszt
  alternatywny = liczba z deskryptora (bez obniżek); kolory z bazowego
  `MANA_COSTS[cardId]`. main.js podaje `opts.escapeCost` z `session.state`
  (widok grobów nie niesie `spell.escape`). +6 testów.
- **cz. 2 (0877445) — źródła nie-lądowe:** `manaSourcesOf` (lądy +
  `activate_ability` dorków/reliktów/Skarbów z `legalCommands` + `abilityInfo`
  z pełnego stanu, netGain = produkcja − koszt), `controlledManaSourcesOf`
  (pokrycie kolorów spójne z `hasColorForObject`), `wizardProgress` przyjmuje
  listę źródeł, render „+N". `startGame` zamyka kreator (nowa gra resetuje
  wstrzymany rzut). Harness `pickActionButton` prowadzi otwarty kreator. +6
  testów.
- **cz. 3 (ten commit) — docs:** wpis M40 w `PROJECT_STATE.md`, to podsumowanie.

Kluczowa decyzja projektowa (skorygowana po uwadze właściciela): pokrycie
kolorów liczone ze źródeł TAPNIĘTYCH w sesji kreatora (`committed`), a NIE ze
wszystkich kontrolowanych — manę płaci się TAPUJĄC źródło, nie samym jego
kontrolowaniem (jak forestwalk). main.js prowadzi listę `committed`; pierwotna
wersja (cz. 2) liczyła wszystkie kontrolowane źródła, powielając engine'owy
nonsens statycznego checku kolorów — cz. 4 to naprawia.

Resztowe ograniczenie engine (NIE naprawione w tej sesji): statyczny check
kolorów engine (`hasColorForObject`/`allControlledManaSources`, pula bezbarwna)
liczy też źródła tapnięte — jest konieczny dla przepływu „tapuj-potem-rzuć"
kreatora, ale auto-tap M34 może dzięki niemu opłacić pip koloru z generycznego
źródła. Kreator tego NIE powiela (wymusza tapnięcie kolorowego źródła);
pełna naprawa to priorytetyzacja kolorowych źródeł w `spendMana` — osobne
zadanie (wymaga przepuszczenia requirements przez ścieżki rzutów + pomiaru B0).

## Kolejność commitów

1. **cz. 0** — ten plan (mini-roadmapa).
2. **cz. 1** — tryby kosztów (cz. B): `paymentDescriptorOf` + `manaWizardFor` + testy.
3. **cz. 2** — źródła nie-lądowe (cz. A): lista źródeł + `wizardProgress`/render +
   main.js `onTapSource` + testy.
4. **cz. 3** — docs: wpis w `PROJECT_STATE.md`/`ENGINE_MILESTONES.md`, aktualizacja
   komentarza ograniczeń w `mana-wizard.js`.

## Ryzyka / pułapki

- **`paymentDescriptorOf` czyta z widoku**, ale widok **grobów** nie niesie
  `spell.escape` → escape musi brać koszt z `session.state` (opts), jak
  `effectiveGeneric`. Testy fakeView: ręka niesie deskryptory, grób nie.
- **netGain** Apprentice Wizard (+2, nie +3) — pomyłka psuje `countPaymentVariants`
  (kreator nie otworzy się / otworzy się źle). Test na netGain obowiązkowy.
- **Aktywacja dorka kosztuje manę z puli** — `wizardProgress` czyta pool, więc OK,
  ale `countPaymentVariants` (decyzja OTWORZENIA) musi używać netGain, nie amount.
- **edit_file nie łapie polskich znaków** → edycje PL tekstu przez `python3`
  (`io.open(..., encoding='utf-8')`); komunikaty commitów plikiem w `/home/user`.
- **Token GH potrafi umrzeć** → commit+push zaraz po każdym fragmencie.
- **Fresh clone** → `git fetch origin <gałąź>` + `git reset --mixed FETCH_HEAD`.
