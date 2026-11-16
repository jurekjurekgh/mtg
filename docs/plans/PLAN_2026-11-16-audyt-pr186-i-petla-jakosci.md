# Plan sesji 2026-11-16 — Audyt PR #186 i pętla jakości (ADR 0020 / ADR 0021)

- **Gałąź sesji:** `arena/b87ffeb4-mtg`
- **Baza (`main`):** `c9a2200d712de03e4caba1fb66c740196e6efb77` (scalenie PR #186)
- **Tryb:** ADR 0020 (PR na starcie → pełny audyt PR #186 → inkrementalne commity) + ADR 0021 (pętla jakości przy braku wskazania konkretnego zadania w prompcie „Kontynuujemy projekt.”).

## Rozpoznanie bazowe (zweryfikowane na `c9a2200`)

- `npm test` (fast): **10 437 / 10 437** (fail 0, skipped 0, EXIT 0)
- `npm run build`: **79 modułów / 5920.2 kB** (EXIT 0)
- `node --test test/dokumentacja-budzet-lektury.test.js`: **2 / 2** (zapas budżetu lektury **220 tokenów**, 99 780 / 100 000 — przed dopisaniem nowej lekcji do `docs/LESSONS.md` obowiązkowa kondensacja zgodnie z PR #93 / L66!)
- PR #186: 62 zmienione pliki (zgodne z `pulls/186/files` i `gh pr diff 186`), scalony `2026-11-16T14:39:13Z`.

## Etapy pracy i kolejność commitów

### E0. Plan i PR na starcie (ADR 0020 A) — ten commit
- [x] Spisanie planu w `docs/plans/PLAN_2026-11-16-audyt-pr186-i-petla-jakosci.md`
- [x] Push gałęzi `arena/b87ffeb4-mtg` i otwarcie PR na GitHubie przed jakimkolwiek kodowaniem (PR #187).

### E1. Pełny audyt techniczny PR #186 (ADR 0020 B / ADR 0016)
- [x] Inwentarz 62/62 plików (L190: `pulls/186/files` vs `^diff --git ` w diffie PR #186) → `docs/audits/PR186_MAPA_PLIKOW_2026-11-16.md`.
- [x] Przegląd wszystkich zmian w `src/engine/` (`abilities.js`, `combat.js`, `deck.js`, `effects.js`, `game-state.js`, `permanents.js`, `spells.js`, `triggers.js`): zgodność z CR MtG, ADR 0002 (zero wyjątków po nazwie/ID karty), ADR 0017 (`PlayerView`), determinizm (ADR 0005), spójność oferty i walidacji (L48).
- [x] Przegląd zmian w `src/cards/` (`card-data.js`, `materialize.js`, `registry.js`) wobec ADR 0022 (100% Oracle) i ADR 0028 (`rulings` w snapshotach).
- [x] Przegląd zmian w `src/controllers/heuristic-bot.js` (naprawy z audytu PR #185 + 9 napraw z pętli PMSSB-90): poprawność generyczna, brak pokręteł w `heuristic-params.js`, spójność z testami i golden-masterem.
- [x] Przegląd zmian w `src/table/` (`choice-request.js`, `main.js`, `multi-target.js`, `render.js`) pod kątem FoW (ADR 0003), etykiet i interakcji UI.
- [x] Przegląd testów dodanych/zmodyfikowanych w PR #186 oraz sond mutacyjnych dla kluczowych napraw silnika i bota.
- [x] Zapis raportu `docs/audits/AUDYT_PR186_2026-11-16.md` + aktualizacja opisu PR (osobny commit `7b7ba5f`).

### E2. Naprawy znalezisk z audytu PR #186
- [x] Każde znalezisko z E1 (`F-186/1` `73a7028`, `F-186/2` `9cb93d6`, `F-186/3` `cab0d5e`) naprawione u root cause, z testem RED→GREEN i weryfikacją mutacyjną jako **osobny, samodzielnie zielony commit** (`npm test` + `npm run build` + `git push`).

### E3. Pętla jakości (ADR 0021 pkt 4 + otwarte punkty `HANDOFF_2026-11-16-pmssb90.md`)
- [x] Naprawa otwartego punktu root-cause **F-90/12** (`b05da03` — `hasPendingAbilityTwin()` po `entry.abilityEffects` ze stosu dla różnych indeksów zdolności tej samej karty, m.in. Bladewheel Chariot `#0`/`#1`).
- [x] Audyt Żywym Testerem (`tools/table-tester/`) po zbudowaniu `dist/mtg-table.html`: 8 partii × 400 kroków na świeżych parach talii — 0 zgłoszeń detektorów, 0 niewycenionych ruchów, 0 błędów runtime.
- [x] Audyt zgodności z CR / przegląd ścieżek silnika (`state-based.js`, `combat.js`, `turn.js`, `attachments.js`, `abilities.js`) — brak nowych defektów regułowych.
- [x] Kondensacja budżetu lektury (`900ac5e` — `docs/LESSONS.md`, zapas zwiększony z 220 do ~2,5 tys. tokenów przy zachowaniu wszystkich nagłówków `## L<nr>`).

### E4. Bramy końcowe i domknięcie sesji
- [x] Uruchomienie pełnej bramy `npm run test:all` (cicho do `.arena/`), `npm run build`, `node tools/cr-numery.mjs`, `node tools/bot-tie-audit.mjs --gry=2`, `test/dokumentacja-budzet-lektury.test.js`.
- [x] Aktualizacja dokumentacji (`docs/PROJECT_HISTORY.md`, `docs/setup/HANDOFF_2026-11-16-audyt-pr186.md`, odhaczenie tego planu, aktualizacja opisu PR).
- [x] Weryfikacja `git status` (czysto, brak tymczasowych plików/talii) i przekazanie raportu końcowego (bez merge — ADR 0007).

## Ryzyka i pułapki
- Budżet lektury startowej na progu: **99 780 / 100 000** tokenów (zapas 220 tokenów). Nie dopisywać do `docs/LESSONS.md` bez uprzedniego skrócenia starych wpisów.
- `tools/table-tester/` czyta `dist/mtg-table.html`, nie `src/` (L76) — po każdej zmianie w `src/` wymagane `npm run build`.
- Testy uruchamiać zawsze z przekierowaniem do `.arena/` (ENVIRONMENT §5a).
- Każda zmiana regułowa wymaga pobrania dosłownego tekstu CR/rulingów online przed kodowaniem (ADR 0030) — uwaga na listę dozwolonych hostów sieciowych w sandboxie (tylko `github.com`, `codeload.github.com`, `api.github.com`, `registry.npmjs.org`, `pypi.org`, `files.pythonhosted.org`, plus `fetch_page`).
