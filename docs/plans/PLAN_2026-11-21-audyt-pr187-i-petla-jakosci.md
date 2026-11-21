# Plan sesji 2026-11-21 — Audyt PR #187 i pętla jakości (ADR 0020 / ADR 0021)

- **Gałąź sesji:** `arena/c2635cc8-mtg`
- **Baza (`main`):** `c1324c07e6b970c52796ff90844a77e2339312b3` (scalenie PR #187)
- **Tryb:** ADR 0020 (PR na starcie → pełny audyt PR #187 → inkrementalne commity) +
  ADR 0021 (pętla jakości przy braku wskazania konkretnego zadania w prompcie
  „Kontynuujemy projekt.” — nie wymyślam nowego batcha kart, karty tylko z listy
  właściciela lub z niedokończonego planu; kolekcja kończy się na 665 = Batch 74
  zamknięty w PR #187).

## Rozpoznanie bazowe (zweryfikowane na `c1324c07`)

- PR #187 (`arena/b87ffeb4-mtg`, scalony 2026-11-16) to **175 plików**: 24 pliki
  `src/` + 101 plików `test/` + talie/docs/snapshoty. Zamyka **cały Batch 74**
  (karty 656–665) + **PMSSB-91** (strojenie bota) + pętlę jakości.
- Zmienione `src/` w PR #187 (do audytu): `cards/card-data.js`, `cards/mana-costs-data.js`,
  `cards/registry.js`, `controllers/heuristic-bot.js`, `controllers/heuristic-params.js`,
  `engine/{attachments,combat,effect-intent,effects,fingerprint,game-state,identity,permanents,players,state-based,tokens,triggers}.js`,
  `protocol/types.js`, `table/{art-showcase,index.html,main,mana-wizard,render,session}.js`.
- Nowe mechaniki wdrożone w PR #187 (Etapy 2A–2D): `gain_life` z `scope:'each_opponent'`
  + `amountFrom:'damageAmount'`; `cant_be_blocked` z `applyTo:'self'` (bez `requiresTarget`);
  **Raid** (`playersAttackedThisTurn`, czyszczone w cleanup) + obrażenia `cantBePrevented`;
  **Gylwain Role tokens** + SBA CR 303.7 (max 1 własna Rola na permanente) + modalny
  trigger wejścia; **Rad counters** (CR 729.1) + batchowany trigger „one or more nonland
  cards are milled” z `oncePerTurn`.
- Bramy raportowane w PR #187 (do powtórzenia): `npm test` fast ~10 532/10 533
  (1 czerwony: E5/1 — test skanujący własny wzorzec, klasa jak `docs/PROJECT_HISTORY.md`),
  slow 282/282, `npm run build` ~79 modułów / ~5978 kB, `node tools/cr-numery.mjs` OK,
  `bot-scoring-snapshot` 4/4 bez regeneracji, `bot-tie-audit --gry=2` RC=0.
- **Bramka sesji:** powtórzyć `npm test` (fast) + `npm run build` na `c1324c07` jako
  punkt odniesienia przed jakąkolwiek zmianą (wynik w `.arena/baseline-test.log`).

## Etapy pracy i kolejność commitów

### E0. Plan i PR na starcie (ADR 0020 A) — ten commit
- [x] Spisanie planu w `docs/plans/PLAN_2026-11-21-audyt-pr187-i-petla-jakosci.md`.
- [x] Push gałęzi `arena/c2635cc8-mtg` i otwarcie PR na GitHubie przed jakimkolwiek kodowaniem.

### E1. Pełny audyt techniczny PR #187 (ADR 0020 B / ADR 0016)
- [ ] Inwentarz 175/175 plików (`pulls/187/files` vs `^diff --git ` w `gh pr diff 187`)
  → `docs/audits/PR187_MAPA_PLIKOW_2026-11-21.md` (L190: kotwica `^diff --git `,
  wewnętrzne `+diff --git` w plikach `.patch` NIE są plikami PR).
- [ ] Przegląd `src/engine/` zmian w PR #187: zgodność z CR MtG, ADR 0002 (zero
  wyjątków po nazwie/ID karty), ADR 0017 (`PlayerView`), determinizm (ADR 0005),
  spójność oferty i walidacji (L48). Szczególny nacisk na nowe mechaniki:
  - `effects.js`: `gain_life` (`each_opponent` + `amountFrom:'damageAmount'`),
    `cant_be_blocked` (`applyTo:'self'`), `raid` + `cantBePrevented`.
  - `engine/combat.js`: `playersAttackedThisTurn` ustawiane/zerowane, kolejność.
  - `engine/triggers.js` + `engine/state-based.js`: Role SBA CR 303.7, Rad counters,
    batchowany mill-trigger `oncePerTurn`.
  - `engine/tokens.js` + `engine/attachments.js`: Role tokens, `attachToTriggeringObject`.
- [ ] Przegląd `src/cards/card-data.js` (10 definicji 656–665) wobec ADR 0022 (100%
  Oracle) i snapshotów `docs/cards/scryfall-<slug>.json`; weryfikacja `limitations: []`.
- [ ] Przegląd `src/controllers/heuristic-bot.js` + `heuristic-params.js` (PMSSB-91,
  F-91/1..5): poprawność generyczna, brak specjalnych przypadków po `cardId`, spójność
  z `test/audyt-pmssb91-batch74.test.js` i golden-masterem `bot-scoring-snapshot`.
- [ ] Przegląd `src/table/*.js` (render Rad panel, Role, raid, Gylwain modal) pod kątem
  FoW (ADR 0003), etykiet PL i interakcji UI.
- [ ] Przegląd testów dodanych/zmodyfikowanych (Etapy 2A–2D, `real-cards-batch74`,
  `audyt-pmssb91-batch74`, przelosowane golden-mastery L25) oraz sond mutacyjnych.
- [ ] Zapis raportu `docs/audits/AUDYT_PR187_2026-11-21.md` + aktualizacja opisu PR.

### E2. Naprawy znalezisk z audytu PR #187
- [ ] Każde znalezisko z E1 (`F-187/x`) naprawione u root cause, z testem RED→GREEN i
  weryfikacją mutacyjną jako **osobny, samodzielnie zielony commit**
  (`npm test` + `npm run build` + `git push`).

### E3. Pętla jakości (ADR 0021 pkt 4)
- [ ] Audyt Żywym Testerem (`tools/table-tester/`) po `npm run build`: partie na
  taliach zawierających karty Batcha 74 — detektory (0 zgłoszeń), niewycenione ruchy
  (0), błędy runtime (0); osie: (1) bezsensowne działania bota, (2) kompletność logu/
  modału „Ruch przeciwnika”, (3) ptaszki wyciszenia auto-pass.
- [ ] Audyt zgodności z CR / przegląd ścieżek silnika (`state-based.js`, `combat.js`,
  `triggers.js`, `effects.js`, `attachments.js`, `abilities.js`) — polowanie na
  niespójności innymi ścieżkami niż poprzednia sesja.
- [ ] Nie wymyślam nowego batcha kart (ADR 0021 pkt 4c).

### E4. Bramy końcowe i domknięcie sesji
- [ ] Pełna brama `npm run test:all` (cicho do `.arena/`), `npm run build`,
  `node tools/cr-numery.mjs`, `node tools/bot-tie-audit.mjs --gry=2`,
  `test/dokumentacja-budzet-lektury.test.js`.
- [ ] Aktualizacja dokumentacji (`docs/PROJECT_HISTORY.md`, `docs/setup/HANDOFF_2026-11-21.md`,
  odhaczenie tego planu, aktualizacja opisu PR).
- [ ] Weryfikacja `git status` (czysto) i przekazanie raportu końcowego (bez merge — ADR 0007).

## Ryzyka i pułapki
- Budżet lektury startowej ≤ 100 000 tokenów (strażnik `test/dokumentacja-budzet-lektury.test.js`);
  przed dopisaniem do `docs/LESSONS.md` — kondensacja starych wpisów (PR #93 / L66).
- `tools/table-tester/` czyta `dist/mtg-table.html`, nie `src/` (L76) — po każdej zmianie
  w `src/` wymagane `npm run build`.
- Testy uruchamiać zawsze z przekierowaniem do `.arena/` (ENVIRONMENT §5a); zakaz pełnego
  wyjścia pakietu do czatu.
- Zmiany regułowe wymagają dosłownego tekstu CR/rulingów przed kodowaniem (ADR 0030) — uwaga
  na listę dozwolonych hostów (tylko GitHub + `fetch_page`).
- Push tylko przyrostowo, nigdy force push (ADR 0020 D); przed puszem `git log --oneline -3`
  + `git status` + `git fetch origin <gałąź>` i porównanie HEAD..FETCH_HEAD.
