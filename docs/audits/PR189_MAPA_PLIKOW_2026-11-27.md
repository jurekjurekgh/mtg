# Mapa plików PR #189 (2026-11-27)

- **Audytowany PR:** #189 („Audyt PR #188 i pętla jakości (sesja 2026-11-21)",
  `arena/03166ca3-mtg`, scalony 2026-11-27 06:38 UTC, squash `dd1f587`).
- **Metoda (L190):** REST `pulls/189/files?per_page=100 --paginate` = **64 pliki**;
  `gh pr diff 189` kotwiczony `^diff --git ` = **64 bloki** — inwentarz zgadza się
  z REST, brak zagnieżdżonych patchy. Commity: **22** (REST `pulls/189/commits`),
  pełna liczba z obiektu PR.
- **Fazy PR:** faza 1 = sesja audytu #188 + pętla jakości (2026-11-21, commity
  `5d4f4b3`→`46b1e61`); faza 2 = zgłoszenia właściciela 2026-11-21→25.11
  (F1/F2/F3, G, H, J+Moldgraf, J2, fix pauzy 79892; commity `56b473e`→`41bf639`).

## Kod źródłowy (9 plików, +586/−93)

| Plik | Hunks | Zmiana (zlecenie) |
|---|---|---|
| `src/engine/mana-cost.js` | 2 | **F3**: `matchColorRequirements` — backtracking permutacji → algorytm Kuhna (augmenting paths, O(req·units·edges)); porządek „od najbardziej restrykcyjnych" zachowany (determinizm ADR 0005) |
| `src/controllers/heuristic-bot.js` | 22 | **J-Moldgraf**: `etbEnterBonusValue` — `mill_cards`/`mill_from_bottom` przez `selfMillValue`/`foeMillValue` (parametr `miller`, cel-gracz odwraca stronę); **J2**: `commandSelfDrain` + `libraryDrainVeto` (jedna podłoga `libraryDrainFloor: 10` PO drenażu + reguły rodzinne), wchłonięte `selfMillFloorVeto`/`symmetricDrainVeto`/`springbloomDrainVeto`/próg lootu; `libraryDrainTax` — jednorazowy mill z ETB idzie weto, dobór zostaje przy progu deck-outu; **G**: `counterReflexSacrificePending` + `deficientCounterReflexSacrifice` (refleks licznikowy — poświęcaj tylko ułomki); **H**: `stackRemovalDuplicationPenalty` (dubel removalu na MOIM stosie, CR 608.2b); **J**: `attachTargetDisabled` + kara w 4 gałęziach (aura/equip/licznik-pump/pump wielocelowy); bounce Wroga czyta ETB z `miller: 'foe'` |
| `src/controllers/heuristic-params.js` | 3 | 4 nowe pokrętła: `counterReflexSacrificeGuard: 1`, `stackRemovalDuplicationPenalty: 20`, `disabledAttachTargetPenalty: 1000`, `libraryDrainFloor: 10` (wszystkie z komentarzem zgłoszenia i drogą anty-over-fix ×0) |
| `src/table/no-combination-rows.js` | 2 | **F1**: wykrywanie PEŁNEGO krzyża wymiarów skalarnych (podzbiory 2–4 wymiarów, produkt == rozmiar grupy == liczba joints → throw); wyjątek `allowScalarProduct` tylko dla okna rzutu (M300) |
| `src/table/multi-target.js` | 2 | **F1**: `sacrificeCastPlanOf(commands, { altPayAmount })` — grupy mieszane (ofiary + `payAltCost`) tworzą PLAN grupowy; `ALT_PAY_ROW_ID`; `commandForSacrificeSelection({ payAlt })` szuka komendy w legalnych (L48) |
| `src/table/mana-wizard.js` | 1 | **F2**: `paymentDescriptorOf` — wariant `payAltCost` liczy PEŁNĄ kwotę (baza + `{N}` z `additionalCost.orPayMana`), fail-closed `null` bez kwoty |
| `src/table/choice-request.js` | 5 | przekazanie `ALT_PAY_ROW_ID` do `commandForSacrificeSelection`; `assertNoCombinationRows(..., { allowScalarProduct: castWindowMode })`; nagłówek sekcji kosztu dla grupy mieszanej |
| `src/table/main.js` | 3 | **F1**: kwota `orPayMana` z pełnego stanu → plan; **F2**: `opts.altPayAmount` dla kreatora many; **79892**: odprysk gestu na „Rozumiem"/X (`botMoveFreshOpen`, `MODAL_OPEN_GUARD_MS`, `age >= 0` dla zegara testowego) |
| `src/table/session.js` | 1 | **79892**: `recheckAutoPass` — no-op przy `awaitingBotAck` (pauza granicy tury nie zjada się przez przełącznik wyciszenia) |

## Testy (48 plików, +2362/−117)

**Nowe (10):** `f1-modal-permutacji-zaplata` (+264), `repro-79892-ui` (+300 — REPRO
na prawdziwym `main.js`, Mini-DOM, talie właściciela warhammer-wrg vs innistrad-wu),
`zgloszenie-j-containment-equip` (+235), `zgloszenie-g-glorifier-poswiecenie` (+171),
`f2-kreator-zaplaty-alt-pay` (+168), `zgloszenie-h-epic-dwa-remowale` (+127),
`zgloszenie-j-moldgraf-selfmill` (+108), `f3-match-color-wis-permutacje` (+95),
`zgloszenie-j2-jedna-bramka-drenazu` (+88), `surowy-slug-kafel-katalog` (+187, faza 1).

**Zmienione „wg mandatu J2" (podłoga PO drenażu) — fixture bibliotek podbite
5/10 → 12 z komentarzem korekty:** `m169`, `m202-g`, `m218`, `m258`, `m280`,
`audyt-batch53-cr1-cr7`, `batch52-bot-wycena`, `batch60-bot-wycena`, `uwaga-j-debuff-bloker-save`,
`pmssb3-draw-wave-a/b`, `pmssb4`, `pmssb6`, `audyt-pmssb15/19/20/34/59`,
`audyt-pr121`, `bot-owner-reports`, `d3` (atak → weto zamiast kary, ta sama decyzja),
`znaleziska-c` (lib7→21), `zgloszenie-b/rt/e/uwaga-village-rites/uwaga-veiled` (pin
cloak lib10 PRE→POST), `zgloszenie-o` (pasmo → podłoga), `zgloszenie-inspiration`
(fixture `fillLibrary` z realną kartą — ID/16), `batch29` (grupa mieszana → plan
grupowy, F1), `m257r5` (+65/−34 — fallback permutacyjny Lash → kreator grupowy),
`table-ui` (+69/−5 — akcje sterownika przechodzą bramkę odprysku przez mock zegara),
`panel-rozgrywka` (guard `recheckAutoPass`).

**Fixture:** `test/fixtures/bot-scoring-snapshot.json` — świadoma regeneracja po
G+H+J+J2 (`fa4ae83`, zgodna z rejestrem REJESTR w `test/bot-scoring-snapshot.test.js`).

## Dokumenty (7 plików, +206/−2)

`docs/PMSSB.md` (+75: definicja pętli „osąd pro-playera, nie checka"),
`docs/PROJECT_HISTORY.md` (wpis fazy 1), `docs/audits/AUDYT_PR188_2026-11-21.md`,
`docs/audits/PR188_MAPA_PLIKOW_2026-11-21.md`, `docs/plans/PLAN_2026-11-21-*`,
`docs/setup/HANDOFF_2026-11-21-audyt-pr188.md`, `docs/cards/HOW_TO_ADD_CARD.md`
(odsyłacz do definicji PMSSB).

**Luka dokumentacyjna (znalezisko audytu W1):** faza 2 (zgłoszenia 23–25.11)
ma ślad wyłącznie w body PR #189 — brak wpisu `docs/PROJECT_HISTORY.md` i brak
M467 w `docs/ENGINE_MILESTONES.md`. Naprawa: osobny commit tej sesji.
