# PLAN 2026-08-14 — M91: uwagi z testów właściciela (A–D)

**Gałąź sesji:** `arena/01a000df-mtg` (kontynuacja PR #52 — ta sama sesja,
te same commity dopisywane do istniejącego PR zgodnie z AGENTS.md).
**Baza:** M90 (`5dc676a`), `npm test` 1556/0, build 50 / 1627.5 kB.

## Zgłoszenia właściciela

### A. Bot rzuca Inspire Awe we własnej turze i atakuje w prewencję
**Objaw:** bot rzucił Inspire Awe („prevent all combat damage this turn except
by enchanted/enchantment creatures"), po czym zaatakował WSZYSTKIMI stworami.
Żaden nie zadał obrażeń (prewencja działa też na jego atak), a wszystkie
zostały tapnięte. Właściciel: „Ten Inspire Awe ma sens rzucać w turze
przeciwnika, jak ja atakuję, a nie w swojej."

**Dwa osobne błędy heurystyki:**
- A1 — bot atakuje, choć `state.preventCombatExceptEnchanted` jest aktywne
  i jego atakujący nie są zaczarowani → atak zawsze zadaje 0 obrażeń;
- A2 — bot rzuca globalną prewencję obrażeń bojowych we WŁASNEJ turze
  (fog działa na własne obrażenia — wartość ma tylko w turze przeciwnika).

**Ścieżka:** `src/controllers/heuristic-bot.js` (scoring `declare_attackers`
i wycena rzutu czaru), `src/engine/combat.js` (`preventCombatExceptEnchanted`),
`playerView` — **flaga prewencji NIE jest w PlayerView**, więc bot (kontroler
dostaje widok, nie stan — granica architektury) nie ma jak jej uwzględnić.
To root cause A1: brakujące dane w widoku, nie „głupota" bota.

### B. Brak ptaszka pomijania przy czarach z opcjami
**Objaw:** Village Rites (dodatkowy koszt: poświęć stwora → warianty)
i Bone Splinters (warianty celu) nie mają ptaszka „nie przerywaj auto-passu".
Właściciel: „pewnie wszystkie czary modalne (z opcjami)".

**Root cause (hipoteza do potwierdzenia):** ptaszek renderowany jest
w `render.js` tylko dla wpisów BEZ `entry.request` (pojedyncza komenda) oraz
w `choice-request.js` przy opcjach WEWNĄTRZ otwartego wizarda. Grupa wariantów
w panelu akcji to jeden przycisk „Wybierz: …" (`entry.request`) — i ten
przycisk ptaszka nie dostaje. Gracz musi więc otworzyć modal, żeby wyciszyć
czar, co przeczy sensowi funkcji (chce pomijać BEZ otwierania).

**Fix:** ptaszek również przy przycisku grupy — klucz wyciszenia musi wtedy
obejmować WSZYSTKIE warianty grupy (inaczej wyciszenie jednego wariantu nie
wycisza czaru). Wymaga klucza grupowego w `session.commandOptionKey`
albo wyciszania po zbiorze kluczy opcji grupy.

### C. Bot niszczy własny artefakt-ląd (Great Furnace → Shatter)
**Objaw:** bot wystawił Great Furnace (artefaktowy ląd), a w następnej turze
zniszczył go własnym Shatterem. Czysta strata tempa i zasobu.

**Root cause (hipoteza):** wycena celów czarów typu „destroy target artifact"
nie odróżnia artefaktów WŁASNYCH od przeciwnika (albo nie ma innego legalnego
celu i bot i tak rzuca, zamiast wstrzymać czar).
**Ścieżka:** `src/controllers/heuristic-bot.js` — scoring `cast_spell`
z efektem destrukcyjnym i wyborem celu.

### D. Ruinous Rampage — brak informacji o wybranym trybie
**Objaw:** bot rzucił Ruinous Rampage (modal: 3 obrażenia każdemu przeciwnikowi
albo wygnanie artefaktów MV≤3); ani log, ani modal „Ruch przeciwnika" nie
mówią, KTÓRY tryb wybrał i jak się rozstrzygnął.

**Root cause:** `describeEvent` dla `spell_cast` i `spell_resolved` nie czyta
`modeIndex` / nazwy trybu (`spell.modes[i].name`), mimo że engine je zna.
**Ścieżka:** `src/table/session.js` (`describeEvent`), zdarzenia w
`src/engine/spells.js` (czy niosą `modeIndex`).

## Kolejność prac (od najprostszych, z testem RED przed każdym fixem)

1. Plan (ten plik) — commit.
2. **D** (log trybu modalnego) — najmniejsze ryzyko, czysty UI.
3. **B** (ptaszek przy grupie wariantów) — UI + klucz wyciszenia.
4. **C** (bot nie niszczy własnych permanentów) — heurystyka, wymaga benchmarku.
5. **A** (prewencja w PlayerView + A1/A2 w bocie) — największe: zmiana widoku
   gracza + dwie reguły heurystyki; wymaga pełnego `npm test` i benchmarku.
6. `npm test` + `npm run build` + benchmark (bot zmieniony w C i A!).
7. Żywy Tester — weryfikacja z perspektywy gracza.
8. Aktualizacja `PROJECT_STATE.md` + handoff, dopisanie do PR #52.

## Definition of Done

- Każdy z A–D ma test RED→GREEN i naprawę u root cause (bez maskowania,
  bez warunków na nazwę karty — ADR 0002).
- `npm test` zielone (≥1556 + nowe), `npm run build` OK.
- Benchmark bez niedokończonych partii, progi `0.78 / 0.57` utrzymane
  (bot zmieniany w C i A).
- Dokumentacja zaktualizowana, commity dopisane do PR #52.

## Podsumowanie wykonania

Wykonane etapy: 1–8 (wszystkie). Cztery zgłoszenia = cztery naprawy u root
cause, każda RED→GREEN.

**D — nazwa trybu czaru modalnego.** Engine znał `modeIndex`, ale zdarzenia nie
niosły nazwy trybu, a `describeGameEvent` (czysta funkcja bez rejestru) nie
miała jak jej odczytać. `spell_cast`/`spell_resolved` niosą teraz `modeName`
(z `spell.modes[i].name`), log dopisuje „— tryb: X". Potwierdzone Żywym
Testerem: „Nieprzyjaciel rzuca Ruinous Rampage — tryb: Wygnaj artefakty".
Test: `test/modal-spell-log.test.js` (4).

**B — ptaszek przy grupach wariantów.** `render.js` rysował ptaszek tylko dla
wpisów bez `entry.request`, więc czar z wariantami (Village Rites, Bone
Splinters, każdy modalny) — jeden przycisk „Wybierz:" — nie dało się wyciszyć
z panelu. Przycisk grupy ma teraz ptaszek, a przełączenie obejmuje WSZYSTKIE
warianty grupy (częściowe wyciszenie zostawiłoby czar przerywający auto-pass).
Test: `test/choice-group-ignore.test.js` (4).

**C — bot niszczył własny permanent.** Scoring `cast_spell` nie miał ŻADNEJ
wyceny efektów usuwających (`destroy_permanent`, `exile_permanent`,
`bounce_permanent`, ...), więc Shatter na własny Great Furnace wyglądał tak
samo dobrze jak na artefakt wroga. Reguła generyczna (ADR 0002): własny
permanent −90, permanent przeciwnika +22 i skalowanie wartością celu.
Test: `test/bot-no-self-removal.test.js` (4).

**A — Inspire Awe: dwa błędy.**
- A1 (root cause architektoniczny): `state.preventCombatExceptEnchanted` NIE
  było w PlayerView. Kontroler dostaje widok, nie stan (granica z AGENTS.md),
  więc bot nie miał fizycznej możliwości zauważyć, że jego atak zada 0
  obrażeń. Widok niesie flagę; heurystyka zeruje ocenę ataku, gdy żaden
  atakujący nie przebija prewencji (nie jest zaczarowany ani nie jest
  enchantment-creature — warunek identyczny jak w `combat.js`).
- A2: globalny fog działa na obie strony, więc we własnej turze kasuje własny
  atak — kara −80 w swojej turze, premia w turze przeciwnika skalowana realnym
  zagrożeniem. Przy okazji PlayerView oznacza atakujących (`attacking`) —
  informacja publiczna w MtG, bez której nie dało się ocenić wartości obrony.
Test: `test/bot-combat-prevention.test.js` (7).

**Weryfikacja końcowa:** `npm test` **1575/0** (1556 → 1575, +19),
`npm run build` 50 modułów / **1633.6 kB**, `test/bot-benchmark.test.js` 7/0.
Benchmark 12 seedów — bot **SILNIEJSZY** niż przed zmianami: heuristic
**96.1% vs random** (było 95.8%), **65.2% vs aggro** (było 63.5%), aggro 92.0%
vs random; progi `0.78 / 0.57` utrzymane. Żywy Tester: 4 partie do końca
(green/red, spellslinger/red, innistrad/wiedzmin, mechanicy/ostrza), zero
odrzuceń, tryb modalny widoczny w modalu „Ruch przeciwnika".
