# PLAN 2026-08-08 — Kolejne luki: „any color” bezbarwnie oraz „tap creature” deterministycznie

## Kontekst

Po wyczyszczeniu 7 przestarzałych wpisów (highland, rupture, kor, pilgrims, fiery, moonlit, rage — commit f08335a) nadal w `src/cards/card-data.js` widnieje ~15 wpisów `limitations` z frazą `pula many jest bezbarwna` / `bezbarwna bez wyboru koloru` oraz `tapuje deterministycznie pierwszego`.

Stan po M41 (kolorowa pula) + mana-sources.js:
- `MANA_SOURCE_MAP` już definiuje poprawne kolory dla źródeł `any` (rupture-spire, holdout-settlement, dragonbroods-relic, token_treasure, token_treasure z Marut) oraz `U/R` (prismari-campus), `R/W` (raucous-carnival), `WURBG` itd.
- `getSourceForObject` dla landów czyta kolory z **efektywnych podtypów podstawowych** (CR 305.6) — ląd zmieniony na Forest produkuje G.
- `add_mana` w `effects.js` przekazuje `src.colors` do `addMana` — jednostka `WUBRG` (any) i `UR` (Prismari) trafiają do kolorowej puli z kluczem `manaUnitKey` i mogą opłacić dowolny pip pasującego koloru (sprawdzone w `canPayColoredCost`).

Wniosek: opisy „any color = 1 bezbarwna” są **przestarzałe** dla źródeł już poprawnie zmapowanych. Pozostawienie ich wprowadza w błąd — silnik już płaci pipy kolorową maną (T3 fix), a testy B0 nie wykazują regresji.

Druga klasa luk — `tapCreature` — nadal deterministyczna (ADR 0005: bierze pierwszego nietapniętego). W MtG gracz **wybiera** którego stwora tapnąć. Dotyczy:
- `holdout-settlement` — `{T}, Tap an untapped creature you control: Add one mana of any color`
- `dragonbroods-relic` — to samo
- `wedgelight-rammer` — `Tap another creature you control` dla Station (już deterministycznie, ale gracz powinien wybierać)

Obie klasy są generyczne (dotyczą wielu kart) i mają ten sam wzorzec naprawy co poprzednie `resolve_*` — blokująca decyzja gracza.

## Cel

- **Dokumentacja:** usunąć przestarzałe wpisy `limitations` o „pula bezbarwna” dla źródeł, które już produkują kolorową manę (rupture, prismari-campus, holdout-settlement, dragonbroods-relic, raucous-carnival, fake-your-own-death/Treasure, marut, ewentualnie seers-lantern jeśli {C} — zostaje bo {C} to bezbarwna słusznie).
- **Engine (następny commit po doc):** zamienić koszt `tapCreature` / `tapAnotherCreature` na wybór gracza (`resolve_tap_creature_choice`), analogicznie do `resolve_search_choice`. W tej sesji — **tylko dokumentacja**, engine w kolejnym kroku (żeby nie mieszać zmian).

## Zakres (2 commity)

### Commit 1 — dokumentacja (ten plan + czyszczenie limitacji)

- `src/cards/card-data.js`:
  - `rupture-spire`: już ma 1 wpis any-color bezbarwna — **usunąć** (teraz any → WUBRG, test kolorowej płatności przechodzi)
  - `prismari-campus`: usunąć pierwszy wpis `Add {U} or {R} = 1 bezbarwna` (zostaje drugi o scry)
  - `holdout-settlement`: usunąć pierwszy wpis `any color bezbarwna` (zostaje drugi o tap deterministycznie — na razie, do engine fix)
  - `dragonbroods-relic`: usunąć pierwszą część `pula bezbarwna: koszt {3}{W}{U}{B}{R}{G}=8 … any color bezbarwna` — zostaje druga część o celu `any target` deterministycznie
  - `raucous-carnival`: usunąć `Add {R} or {W} = 1 bezbarwna` → `[]`
  - `fake-your-own-death`: usunąć pierwszą część `Treasure any color bezbarwna` — zostaje druga o LKI
  - `marut`: usunąć drugą część `one mana of any color ze Skarba = 1 bezbarwna` — zostaje pierwsza o puli treasure
  - `esper-stormblade` / `sweet-oblivion` / `village-rites` itp. z `hybrid bezbarwna` — **nie ruszać** w tym commicie (hybryda wymaga osobnej weryfikacji kosztów many — zostaje)
- Weryfikacja: `npm test` 1025, `npm run build` 49 modułów; `grep bezbarwna` spada z ~12 do ~4 (tylko świadome uproszczenia gdzie colorless jest poprawne lub hybryda)

### Commit 2 — engine (następna sesja / drugi commit tej sesji jeśli czas pozwoli)

- Wprowadzić `pendingTapCreatureChoice` + `resolve_tap_creature_choice` (jak `resolve_search_choice`):
  - `abilities.js` — `performTapCreatureCost` kolejkuje decyzję zamiast tapować pierwszego
  - `game-state.js` — bramka, oferta `legalCommands`, `firstPendingDecisionPlayerId`, `playerView` sekwencyjnie
  - `heuristic-bot.js` / `aggro-bot.js` — deterministycznie pierwszy (zachowanie wstecznie zgodne)
  - `render.js` — `commandLabel` dla `resolve_tap_creature_choice`
  - Usunąć wtedy drugie wpisy `tapuje deterministycznie` z `holdout`, `dragonbroods`, `wedgelight`
- Testy: `test/tap-creature-choice.test.js` + rozszerzenie `real-cards-batch5` (Holdout) i `real-cards-batch9` (Relic)

## Kolejność

1. Ten plan (commit plan)
2. Commit doc — czyszczenie 6–7 wpisów `limitations` o any-color
3. Push + update PR #33
4. (Opcjonalnie w tej samej sesji) Commit engine dla tapCreature — jeśli właściciel potwierdzi priorytet

## Ryzyka

- Usunięcie wpisu o any-color jest bezpieczne tylko gdy `MANA_SOURCE_MAP` ma poprawne kolory — zweryfikowane wyżej; produkcja many już kolorowa, więc testy B0 nie regresują.
- Nie usuwamy wpisów o hybrydzie/phyrexian — te koszty są złożone i wymagają osobnej ścieżki `effectiveSpellManaCost` (już częściowo poprawne, ale opis „2 bezbarwne” może być nadal nieprecyzyjny — zostaje).
- Edycja `card-data.js` z polskimi znakami — tylko `python3`.

## Poza zakresem

- Batch 22, backend FoW, wybór koloru dla „any color” w locie (jeśli kiedyś land miałby produkować wybrany kolor jako jednostkę 1-kolorową zamiast WUBRG — obecnie WUBRG jest poprawne per CR, bo jednostka any-color może opłacić dowolny pip)
