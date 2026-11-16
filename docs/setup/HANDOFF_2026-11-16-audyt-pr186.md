# Handoff — Audyt techniczny PR #186 (PMSSB-90) i pętla jakości (2026-11-16)

Sesja: `arena/b87ffeb4-mtg`, PR **#187** (baza `main`: `c9a2200` = scalenie PR #186).
Poprzedni handoff: `docs/setup/HANDOFF_2026-11-16-pmssb90.md`. Ten plik daje punkt zaczepienia dla kolejnej sesji — nie jest źródłem zasad (zasady: `AGENTS.md`, ADR-y, `docs/LESSONS.md`, `docs/setup/ENVIRONMENT.md`).

## 1. Co ta sesja zrobiła (ADR 0020 / ADR 0021)

1. **E0 — plan i PR na starcie (`b999ba3`):** `docs/plans/PLAN_2026-11-16-audyt-pr186-i-petla-jakosci.md` + PR #187 na bazie `c9a2200`.
2. **E1 — pełny audyt techniczny PR #186 (`7b7ba5f`):**
   - `docs/audits/PR186_MAPA_PLIKOW_2026-11-16.md` — zweryfikowany 1:1 inwentarz 62/62 plików (`pulls/186/files` vs `^diff --git `).
   - `docs/audits/AUDYT_PR186_2026-11-16.md` — pełny przegląd zmian `src/engine/`, `src/cards/`, `src/controllers/heuristic-bot.js`, `src/table/` i testów; znaleziono i zreprodukowano 3 luki (`F-186/1`..`F-186/3`).
3. **E2 — naprawy z audytu (każda jako osobny, zielony commit z testem RED→GREEN):**
   - `73a7028` **F-186/1** (`src/engine/combat.js`): maksymalne skojarzenie dwudzielne (`augment()`) w `maximalRequiredBlocks` / `requiredBlockerChoices` zamiast zachłannego wyboru pierwszego atakującego w kolejności tablicy (CR 509.1c). Test: `test/audyt-pr186-f1-maximal-required-slots.test.js` (3 testy).
   - `9cb93d6` **F-186/2** (`src/controllers/heuristic-bot.js`): usunięcie podwójnego liczenia statycznego pumpu już przypiętego sprzętu w `equipmentHoldValue` (`bodyDelta`, gdy `bodyScore` już zawiera `effectivePower/Toughness`). Test: `test/audyt-pr186-f2-equipped-static-double.test.js` (3 testy).
   - `cab0d5e` **F-186/3** (`src/controllers/heuristic-bot.js`): `mustBlockEnchantedValue` wymaga ≥2 legalnych blokerów (z wyłączeniem `cantBlockAlone`), gdy gospodarz ma `menace` (CR 702.111b + CR 509.1c). Uwaga CR 2026-11-06: w tym wydaniu CR `702.110` to Exploit, a Menace to **702.111b** (zweryfikowane strażnikami `cr-numery-*`). Test: `test/audyt-pr186-f3-must-block-menace.test.js` (2 testy).
4. **E3 — pętla jakości:**
   - `b05da03` **F-90/12** (`src/controllers/heuristic-bot.js`): domknięcie punktu #3 z kolejki `HANDOFF_2026-11-16-pmssb90.md` §3 — wspólny helper `hasPendingAbilityTwin()` porównuje `entry.abilityEffects` ze stosu (ADR 0017) zamiast samego `abilityIndex` (`Bladewheel Chariot` `#0` vs `#1`), bez fałszywego blokowania różnych grantów (`lifelink` vs `flying`). Test: `test/audyt-pr186-f90-12-pending-twin-effects.test.js` (3 testy).
   - **Żywy Tester (`tools/table-tester/`):** 8 partii × 400 kroków na świeżych parach talii po pełnym buildzie (`dist/mtg-table.html`) — 0 zgłoszeń detektorów, 0 niewycenionych ruchów, 0 błędów runtime.
   - `900ac5e` **Budżet lektury (`docs/LESSONS.md`):** kondensacja zduplikowanych `**Przypadek:**` dla wpisów mających pełną narrację w `docs/LESSONS_PRZYPADKI.md` (wszystkie nagłówki `## L<nr>` zachowane; zapas budżetu wzrósł z 220 do ~2,5 tys. tokenów).

## 2. Bramy i stan artefaktów

- `src/controllers/heuristic-params.js` **nietknięty** (zero nowych pokręteł).
- `npm test` (fast) po ostatnim commicie kodowym (`b05da03`): **10 448 / 10 448**, `fail 0`, `skipped 0`.
- `npm run build` po `b05da03`: **79 modułów / 5923,5 kB**, EXIT 0.
- `node tools/cr-numery.mjs`: **OK** (561 unikalnych numerów w 6817 cytatach wobec 581 zweryfikowanych).
- `node tools/bot-tie-audit.mjs --gry=2`: EXIT 0 (**24 partie, 11 364 decyzje, `single 0`, `tie_top 569`, `tie_all 0`**, GROZY `block=2 / attack=9 / cast_spell=3` — profil bez zmian).
- `node --test test/dokumentacja-budzet-lektury.test.js`: **2 / 2** po kondensacji `docs/LESSONS.md`.
- Pełna brama końcowa (`npm run test:all` + `npm run build`) uruchomiona na końcowym commicie dokumentacyjnym — wynik z dokładnymi liczbami odnotowany w opisie PR #187 i w raporcie końcowym sesji.

## 3. Rozstrzygnięte decyzje właściciela (usunięte z backlogu, 2026-11-16)

1. **Synergia grobowa (`selfMillValue`, `surveil`/`explore` `graveSynergy`, `F-90/5b`, `F-90/6`):**
   po doprecyzowaniu właściciel zdecydował przywrócić dotychczasową synergię grobową (`selfMillGraveSynergy` `+6`, `millReanimateBonus: 15`, `surveilGraveSynergyPerSource: 2`), ale z twardym progiem bezpieczeństwa **≥25 kart w własnej bibliotece** (`GRAVE_SYNERGY_MIN_LIBRARY = 25`, wspólna bramka `allowsGraveSynergyMill()` w `src/controllers/heuristic-bot.js`). Przy `<25` kartach w bibliotece bot nie wrzuca świadomie kart do grobu pod Gray Slaada, reanimację ani delve; przy `≥25` działa jak dotychczas (piny: `test/audyt-pmssb20-mill.test.js`, `test/audyt-pmssb24-scry.test.js`). `F-90/5b` i `F-90/6` (nowy model progów Threshold/delirium) zamknięte i usunięte z backlogu.
2. **`declare_attackers` vs CR 508.1 (kolejność priorytetu w silniku):** decyzja właściciela — zostaje tak jak jest (zamknięte).
3. **`F-90/10` (trwały trigger na permanencie vs paliwo z ręki):** decyzja właściciela — zostaje tak jak jest, tj. wypłata tymczasowa (np. prowess) skaluje się paliwem z ręki, a trwały trigger na permanencie nie jest bramkowany chwilowym stanem ręki (zamknięte i zamrożone w pinach `10a/10b`).

Kolejka otwartych wątpliwości z audytu PR #186 i PMSSB-90 jest **pusta**.
