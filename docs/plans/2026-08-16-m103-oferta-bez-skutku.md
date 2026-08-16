# M103 — automatyzacja wzorca „oferta bez skutku" + audyt aur i zdolności celowanych

Cel sesji (kontynuacja handoffu M102, gałąź `arena/01a00a83-mtg`): wykonać
„następne kroki" z M102:

1. **Benchmark do przeliczenia** — U8/U9 z M102 zmieniły enumerację ofert,
   więc boty widzą inną przestrzeń decyzji. Baseline: `tools/b1-final-2026-08-15.*`.
2. **Automatyzacja wzorca „oferta bez skutku"** w detektorach Żywego Testera
   (L15: dotąd wymagał ręcznego czytania transkryptów, jest w pełni algorytmiczny).
3. **Audyt aur i zdolności celowanych** pod tym samym kątem co equip (U9).

## Krok 1 — benchmark po U8/U9 (i ponownie po A2)

Pełne B0 (23 400 meczów, konfiguracja identyczna z baseline'em: boty
aggro/heuristic/random, 12 talii, 50 seedów, baza 1000, limit 8000 komend).
**Wynik po U8/U9** (przed A2): aggro 59,4% → 58,8%, heuristic 77,6% → 77,5%,
random 13,0% → 13,7% — hierarchia zachowana, 0 niedokończonych. Ruch zgodny
z oczekiwaniem (mniejsza przestrzeń ofert, random zyskuje najwięcej).
A2 (Bladed Sentinel / Death-Hood Cobra / Stirring Bard) też zmienia
enumerację ofert i dotyczy talii benchmarku, więc baseline został
**przeliczony drugi raz** — ostateczne liczby w `tools/b1-final-2026-08-16.*`
(nadpisane po zakończeniu drugiego przebiegu).

## Krok 2 — sonda „oferta bez skutku" (nowa oś `noop`)

### Projekt

Nowa oś audytu detektorów (kategoria `noop`) mierzy wzorzec U8/U9/U10
mechanicznie, zamiast czytać transkrypty:

- `src/table/noop-probe.js` — sonda `probeCommandEffect(state, cmd)`:
  wykonuje komendę z panelu na KLONIE stanu (structuredClone) z w pełni
  PASYWNYM przeciwnikiem (polityka: zawsze pass), dogrywa jej obiekty do
  zejścia ze stosu i porównuje fingerprint stanu przed/po
  (`diffFingerprintPaths`). Wynik klasyfikuje zmiany:
  - `changed` — czy fingerprint w ogóle się zmienił,
  - `effectDiffs` — różnice POZA kosztami (priorytet/fazy `turn.*`,
    tapnięcia `objects[n].tapped`, życie `players[i].life`, pula many
    `players[i].mana/manaPool`),
  - kierunki tapnięć z podziałem na własne lądy / własne nie-lądy /
    przeciwnika (tapnięcie cudzego stwora to SKUTEK, nie koszt),
  - `manaChanged`, `humanLifeDelta`,
  - `fizzle` — obiekt komendy fizzlował przy pasywnym przeciwniku (U8),
  - `costSignature` — jakiego rodzaju koszt ma komenda (mana/tap/tapCreature/life).
- `src/table/session.js` — `debugFingerprint()` i `probeCommandEffect(optionKey)`
  (mapowanie klucza `commandOptionKey` na komendę z `legalCommands`).
- `src/table/render.js` — każdy przycisk akcji niesie `data-option-key`
  (dla grup: klucz pierwszej opcji — to, co kliknie gracz zachłanny).
- `src/table/main.js` — mostek `window.__mtgDebug` włączany WYŁĄCZNIE, gdy
  artefakt otwarto z `?tester=1` (normalna gra nie eksponuje stanu silnika).
- `tools/table-tester/run-game.mjs` — przy każdym kliknięciu panelu: sonda
  PRZED kliknięciem (na klonie — nie dotyka partii) + fingerprint przed/po
  dla `applied` (kliknięcie odrzucone przez UI nie jest dowodem na nic);
  rekordy `{ label, applied, probe }` do `probeRecords`.
- `tools/table-tester/detectors.mjs` — `detectNoEffectOffers(probeRecords)`
  (kategoria `noop`), czysta funkcja:
  1. `!changed` → „kliknięcie nie zmienia stanu gry",
  2. `fizzle` → „pewna strata — fizzle już przy pasywnym przeciwniku",
  3. `effectDiffs` puste + zmiana wyłącznie o opłacony koszt (zgodny
     z `costSignature`) → „jedyna zmiana to zapłacony koszt".
  Bramki fałszywych alarmów: etykiety produkcji many (mana to efekt poza
  fingerprint), pass/concede/wznowienie, tapnięcia/untapnięcia cudzych
  permanentów, zysk życia.

### Testy (RED→GREEN)

- `test/noop-probe.test.js` — 13 testów sondy i dyfu (m.in. U9 z puli many
  i z landów, U8 Bone Splinters → fizzle, realny buff, zdolność many).
- `test/table-tester-detectors.test.js` — 11 testów klasyfikacji `noop`
  (w tym ochrona przed fałszywymi alarmami i wpięcie w `runDetectors`).

### Weryfikacja

1. Pełny pakiet testów (docelowo 1869/1869).
2. End-to-end Żywy Tester na zbudowanym artefakcie (`?tester=1`): sondy
   działają (31 sond/partię), na naprawionym silniku `noop` milczy.
3. **Weryfikacja mutacyjna ZALICZONA**: cofnięcie bramki U9 (equip na
   obecnego nosiciela) + przebudowa → Żywy Tester zgłosił dokładnie
   „Wyposaż: Greatsword of Tyr → Furious Forebear" i „→ Expose to Daylight"
   jako oferty bez skutku; po przywróceniu naprawy — cisza.

## Krok 3 — aury i zdolności celowane (macierz Żywego Testera)

W katalogu nie ma kart z efektem „attach target Aura" (re-pin) — aury
(bestow/z ręki) zawsze tworzą NOWY permanent, więc ta klasa nie występuje.
Macierz talii z detektorem `noop` (8 kombinacji × 3 profile × 2 seedy)
wyłowiła DWA realne znaleziska, oba naprawione u root cause:

| # | Objaw | Root cause | Test |
|---|---|---|---|
| A1 | Fałszywy alarm sondy: aktywacja craftu (Lodestone Needle) wyglądała na „sam koszt" | `stateFingerprint` pomijał 36 pól wstrzymujących grę (m.in. `pendingCraftExile`) — stany różniące się oczekującą decyzją były „identyczne" | `test/fingerprint.test.js` (2) |
| A2 | Prawdziwy no-op w ofercie: `{W}: zdobądź czujność` (Bladed Sentinel) oferowane, gdy stwór już ją ma — 3 aktywacje w jednej turze | `legalActivatedAbilities` nie sprawdzało, czy nadawane keywordy już są (engine deduplikuje granty przez Set) | `test/bug-hunt-2026-08-16-noop.test.js` (7) |
| A3 | Fałszywy alarm sondy: Welder Automaton „1 obrażenie każdemu przeciwnikowi" wyglądał na „sam koszt" | sonda śledziła wyłącznie życie GRACZA sondy; spadek życia PRZECIWNIKA wpadał do ścieżek pomijanych. Życie przeciwnika to zawsze skutek | `test/noop-probe.test.js` (+1) |

A2 naprawiony wzorcem U9 (oferta chowana, execute przyjmuje — legalne wg
CR; anty-over-fix: Soulbright Flamekin z `onNthResolve` zostaje oferowany).
A3 naprawiony w sondzie (życie przeciwnika → effectDiffs) — engine bez zmian,
więc benchmark nie wymagał trzeciego przebiegu.

## Wyniki sesji

(Uzupełnić po zakończeniu benchmarku i finalnej macierzy.)
