# Plan 2026-09-14f — boty uczą się mulliganować (zgłoszenie właściciela)

**Wyzwalacz:** właściciel: „Kilka talii podejrzanie często startuje bez lądów".
Pomiar `tools/deck-land-ratio.mjs` (commit 31f51a7): WSZYSTKIE 24 talie spełniają
regułę 1:2 (M132 — co najmniej 1 ląd na 2 nielandy; udział lądów 33,3–41,7%).
Symulacja 2000 rozdań/talia przez prawdziwą ścieżkę silnika: częstość rąk
0-lądowych zgodna z teorią (max 3,58% — talie na progu 33,3%); tasowanie
i rozdanie uczciwe. Rzeczywisty wzmacniacz objawu: **boty NIGDY nie biorą
mulligana** (heuristic-bot `finish(cmd.keep ? 50 : 0)`; aggro-bot bierze
pierwszy wariant = keep) — ręka 0-1 lądów jest grana do końca.

**Decyzja właściciela (2026-09-14):** bot z ręką 0–1 lądów bierze mulligana.
Talie zostają bez zmian (reguła 1:2 trzymana z konstrukcji generatora).

## Zakres i kolejność

- [x] E1 — engine: warianty `resolve_mulligan_choice` niosą jawny licznik
      `mulligans` (informacja publiczna — jak licznik mulliganów w UI).
- [x] E2 — heuristic-bot: keep ⇔ (≥2 lądy w ręce ∨ już 2 mulligany — cap);
      `resolve_mulligan_bottom_choice`: trzymaj lądy, oddawaj najdroższe czary.
- [x] E3 — aggro-bot: ten sam wyzwalacz i cap; ta sama reguła odkładania.
      random-bot bez zmian (szumowa linia bazowa).
- [x] E4 — testy: nowy `test/bot-mulligan.test.js` (wyzwalacz 0/1/2 lądów,
      cap, wybór spodu bez lądów, payload licznika); regeneracja golden-mastera
      śladu bota (`node tools/bot-scoring-snapshot.mjs --write`) z przeglądem
      diffu; `npm test`; `npm run test:all`; benchmark `--quick` i porównanie
      z bazą 82,6% (555/672) — zmiana POLITYKI bota jest świadoma i liczona.
- [x] E5 — dowód end-to-end Żywym Testerem (seed, w którym bot bierze
      mulligana; log „bierze mulligan (1)”; partia dochodzi do upkeepu);
      dokumentacja (PROJECT_HISTORY, README — liczby benchmarku, budżet
      lektury nienaruszony); opis PR #118.

## Granice

- Bez zmian w taliach (`decks/`), generatorze ani regule M132.
- Bez zmian w silnikowych zasadach mulligana (CR 103.4 już zaimplementowany).
- Bez nowego ADR — to polityka kontrolera, nie decyzja architektoniczna.
- Lektura startowa nie rośnie (budżet 100k tokenów — LESSONS nienaruszony,
  chyba że za cenę kondensacji innej lekcji).
- Mulligan człowieka w UI bez zmian.

## Bramki

- `npm test` zielone; `npm run test:all` zielone.
- Golden-master śladu bota zregenerowany wyłącznie na decyzjach mulligana.
- Benchmark quick policzony; regresja `REGRESSION_CONFIG` zielona.
- Żywy Tester: detektory 0 zgłoszeń na partii z mulliganem bota.
