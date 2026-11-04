# HANDOFF 2026-11-04 — zgłoszenie C: Magma Pummeler

## Stan

- Gałąź `arena/5d931b5a-mtg`, PR #179 (draft). Kod naprawy: `2964407`; dokumentacja domyka zgłoszenie C.
- Właściciel: bot ma wybrać cel, któremu obrażenia refleksu Magma Pummeler będą śmiertelne (z obrażeniami już oznaczonymi w walce), a gdy takiego celu nie ma — przeciwnika. Nie wybieramy największego ciała „na chip”.
- Przyczyna: oferta `resolve_trigger_target` nie przekazywała kontekstu zdarzenia do `resolveDamageAmount`, więc `amountFromContext:'countersRemoved'` nie trafiało do `cmd.damage`. Bot omijał wspólną `damageTargetValue` i wracał do rozmiaru celu.
- Naprawa: w `src/engine/game-state.js` oferta przekazuje `pending.extra` jako kontekst i używa LKI źródła (`pending.sourceLki`), tak samo jak rozstrzygnięcie i `legalTriggerTargetCandidates`. Bez zmiany `damageTargetValue`, bez rozpoznawania nazwy karty, bez zmiany zasad silnika i legalnych celów człowieka.

## Dowody

- NOWE testy: `test/zgloszenie-c-magma-lethal.test.js` (C/1–C/6, realne karty i komendy). RED **0/6** → GREEN **6/6**; mutacja usuwająca kontekst z resolvera oferty **0/6**.
- Sonda: `.arena/checkpoint/c-magma-probe.mjs`. PRZED wszystkie cztery scenariusze wybierały `big` bez `damage`; PO: Shock 3 liczniki → `small` (2), Shock 1 licznik po śmierci źródła → `small` (1), walka 3 liczniki → ranny `att` (3), walka 2 liczniki → `p2` (2).
- Pokrewne: **95/95** (Warmaker F, Molten Nursery V, A29 Magma, O3 counter_removed, batch70, real-cards-batch70, golden-master). Golden-master **bez dryfu**.
- Bramy: fast **9970/9970** (177,9 s), build **77 modułów / 5691,7 kB**; pełny `test:all` **10238/10238** (585,4 s), 0 fail / 0 skip.
- Benchmark ukierunkowany `kaldheim` (heuristic–aggro, 8 seedów, 16 meczów): PRZED i PO 75,0 % heuristic — mała próbka, bez regresji; dowodem zmiany są scenariusze C, nie win-rate. Pełnego B0 nie uruchamiano.

## Granice i następne kroki

- Bez scalania, force-push, nowych kart, pełnego B0 i eksperymentów `NIE_WDRAZAC`. Budżet lektury startowej niepodniesiony.
- Po pushu: potwierdzić CI HEAD i `mergeable_state`, zaktualizować wiersz CI w treści PR #179.
- Wspólny checkpoint ADR 0032 pozostaje wdrożony; historyczne pole `pendingDeathTriggerBatch` / flaga `deathBatch` nadal czekają na osobną migrację nazw (poza zakresem C).
