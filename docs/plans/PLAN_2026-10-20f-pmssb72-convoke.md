# PMSSB-72 — convoke (Kavu Primarch, batch 69)

Data: 2026-10-20. Gałąź: `arena/3ce2ec34-mtg` (PR #168). Procedura: `docs/PMSSB.md`.
Rejestr: wiersz „convoke” (`docs/PMSSB.md`), luka z batcha 69.

> **Korekta 2026-10-21 (audyt PR #168/A-12):** historyczna polityka
> „warianty minimalne; gdy mana wystarcza, nie pokazuj convoke” poniżej
> ograniczała legalną decyzję. CR 702.51a (wydanie 2026-09-25) pozwala
> tapnąć stwory ZAMIAST zapłacić dowolną część kosztu maną nawet wtedy,
> gdy mana jest dostępna. Gracz może zachować ją na kolejny czar; zwykły
> rzut pozostaje. Generator ofert obsługuje dobrowolne podzbiory w swoim
> dotychczasowym deterministycznym limicie 64 (L19); duża plansza nadal
> może nie pokazać wszystkich kombinacji. A-12 ma piny na pojedyncze i
> pełne convoke przy 4 manach, wycenę i watchdog wydajności. Poniższe
> pomiary, cele i RED-y pozostają historycznym zapisem etapu PMSSB-72.

## Uwaga o kolejności

Procedura każe commitować plan PRZED kodem. Ten plan powstał po tym, jak
część kodu (funkcja `convokePaymentVariants`, wycena bota, UI) była już w
drzewie roboczym po przerwanej sesji. Dlatego plan jest zapisany razem z
wynikami i nie udaje, że było inaczej. Testy RED zostały sprawdzone na
kodzie sprzed zmiany (patrz niżej).

## Problem (pomiar PRZED)

Sonda `.arena/probe-convoke.mjs`, prawdziwy silnik, `legalCommands`:

- Kavu Primarch ({3}{G}, convoke), 2 many + dwa stwory (Tuskguard Captain G,
  Makindi Aeronaut W): **0 ofert** `cast_permanent(kav)`.
- 4 many: 1 oferta, bez convoke.
- Test batcha 69 wołał `execute({ convokePayments })` ręcznie, poza pętlą gry.

Zasada CR 702.51a: stwór tapuje się, płacąc {1} albo jeden pip koloru swojego
koloru. Koszt karty (łącznie z kickerem) jest liczony przed convoke (ruling
Scryfall: convoke nie zmienia mana value).

## Audyt

(a) Wspólna miara: wariant convoke musi być tym samym wyborem, który waliduje
`castPermanent` (`resources.js`, walidacja `convokePayments`). Generator
używa tej samej reguły (`convokePaymentVariants`).

(b) Wymiar kosztu czaru: bot liczy koszt jako `koszt − zniżki + pipy`. Stwory
zastępują manę, więc wycena odejmuje jednostki convoke, a każdy tapnięty
stwór dostaje karę `convokeTapPenalty` (utracona tura: atak/blok).

(c) Anty-over-fix: gdy zwykła mana wystarcza, NIE ma wariantów convoke
(minimalność). Stwory nie tapują się bez potrzeby. Zwykły rzut zostaje.

## Wdrożenie

- `src/engine/resources.js`: `convokePaymentVariants(state, playerId, object,
  totalMana, requirements, purpose)` — tylko minimalne warianty
  `[{creatureId, color}]`, `color` = `'generic'` albo kolor kosztu.
- `src/engine/game-state.js`: `legalCommands` dla `cast_permanent` dorzuca
  warianty convoke, także wariant kicked (koszt + kicker, pipy kickera).
- `src/controllers/heuristic-params.js`: `convokeTapPenalty = 4` (pokrętło,
  0 = bez kary).
- `src/controllers/heuristic-bot.js`: wycena rzutu dodaje
  `creatureManaCostWeight` za każdy stwór i odejmuje `convokeTapPenalty`.
- `src/table/render.js`, `src/table/main.js`: grupa wyboru
  `permanent-convoke:<objectId>:<kicked>`; etykieta z nazwami stworów
  („Zagraj tapując na convoke: …”). Wybór należy do gracza.
- `src/table/mana-wizard.js`: wariant convoke pyta tylko o resztę many
  (`totalNeeded − stwory`, pip koloru zapłacony stworem znika z wymagań).

## RED→GREEN

`test/audyt-pmssb72-convoke.test.js` (8 testów). Na kodzie sprzed zmiany
(`game-state.js` z HEAD): 5 czerwonych (oferty ×3, kreator, bot), 3 zielone
(anty-over-fix, brak stworów, stapowany stwór — zachowanie bez zmian, pin).

## Ewaluacja

- `npm test` (fast): 8580/8580 zielone.
- `build`: exit 0.
- Golden (`test/bot-scoring-snapshot.test.js`, w `test:all`): hash ZMIENIONY
  (`7510ba436292c802…` → `62bda00e…`). Ślad: 2 partie (dominaria-brg|mirrodin-wu,
  seedy 1000 i 1001), 3 decyzje z nowymi opcjami convoke, 0 zmienionych wyborów.
  Fixture NIE zregenerowany — procedura każe zatrzymać się przy zmianie hasha.
- Tie-audit i mirror: do wykonania po decyzji o golden.

## Wynik

- Convoke działa w pętli gry: oferty `cast_permanent` z `convokePayments`
  (także kicked), gracz wybiera stwory w panelu, kreator płaci resztę many.
- Bot: wycena z wymiarem kosztu (mana − stwory) i karą za tapnięcie
  zależną od wartości ciała (`convokeTapPenalty`, pokrętło).
- Otwarte: decyzja o nowym fixture golden (zmiana hasha, wybory bez zmian).
