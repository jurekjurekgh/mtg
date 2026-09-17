# Plan 2026-09-17 — audyt PR #124 + pętla jakości (ADR 0020/0021)

Sesja: „Kontynuujemy projekt." — prompt bez nazwanego tematu → tryb obowiązkowy
ADR 0020 (PR → audyt poprzedniego PR → inkrementalne commity) + pętla domyślna
ADR 0021 §4. Gałąź sesji: `arena/01a0ae26-mtg`, bazowy HEAD: `e4befba`
(squash PR #124 = stan `main` na starcie; historia pogłębiona `git fetch
--deepen=200`, rodzic squasha `1521ac8` dostępny lokalnie).

## Rozpoznanie (stan na start, zmierzony)

- `npm test` **5638/5638**, 0 fail (~181 s) — zgadza się z README/handoffem
  2026-09-16 (brak dryfu liczb).
- Otwartego PR brak; ostatni scalony PR to **#124** (`arena/01a0aac8-mtg`,
  20 commitów, 32 pliki, +1751/−72, scalony 2026-09-17T06:55Z).
- Niedokończonego planu na `main` brak: `PLAN_2026-09-16d-*` ma wszystkie etapy
  `[x]`; plany 16a/16b/16c (challenge Brąz/Srebro/Złoto) domknięte.
- Pozycje otwarte z audytów #121/#123 domknięte w #124 (O1–O5);
  pełne B0 wyłącznie na komendę właściciela (ADR 0018).
- Poprzednia sesja szła ścieżką „odznaki regułowe" (M359–M361) + znaleziska
  właściciela; pętla jakości tej sesji musi iść INNĄ ścieżką (ADR 0021 §4b).

## Etapy

- [x] **E0 — plan sesji** (ten plik, commit 1, PR na GitHubie przed kodowaniem
  — ADR 0020 A).
- [x] **E1 — pełny audyt PR #124** (raport `docs/audits/AUDYT_PR124_2026-09-17.md`, werdykt APPROVE; sondy mutacyjne V1/V2 potwierdzone) (ADR 0020 B / 0016): przegląd KAŻDEGO
  zmienionego pliku stanem po PR wobec stanu na jego starcie, w szczególności:
  - `src/engine/game-state.js` — A1 dowody SBA w cleanupie
    (`cleanupEventIsSbaEvidence`, CR 514.3a), `purpose`/`sourceCardId` w
    `pendingColorChoice` (dwie ścieżki: `playLand` i `resolveAuraSpell`),
    `chosenColor` w `playerView`, pełna tablica `effects` w
    `pendingOptionalTrigger` (O2 z #121);
  - `src/engine/fingerprint.js` — `pendingCombatSecondPass` (czy faktycznie
    blokada rundy passów i czy nie ma dalszych blokad poza
    `firstPendingDecision`);
  - `src/engine/effects.js`, `src/engine/spells.js` — union „{G} lub wybrany
    kolor" (`chosenColor` w `add_mana`), czy każda ścieżka produkcji many
    czyta to samo źródło (L41/L107);
  - `src/table/*` (session/render/main/choice-request) — numeracja kopii nazw
    (`battlefieldNameNumbers`, `nameOrdinalSuffix`), `chosenColorBadge`,
    etykiety wyboru koloru, FoW (czy nazwy/numeracja nie ujawniają zakrytych
    kart — L141);
  - `tools/generate-plan-decks.mjs` — O1 `landSplit` bez pipów (jawny błąd,
    brak regresji 24 talii);
  - 14 plików testowych — czy testy mierzą to, co deklarują (RED→GREEN,
    mutacje L13), czy nie ma pinów na jedną kartę tam, gdzie potrzebny jest
    skan klasowy;
  - spójność dokumentacji (README/handoff/PH/audyt #123).
  Kryterium: raport `docs/audits/AUDYT_PR124_2026-09-17.md` z werdyktem i
  weryfikacją mutacyjną znalezisk.
- [x] **E2 — naprawy znalezisk** (O1 z raportu: numeracja kopii grupuje po nazwie WYŚWIETLANEJ — `battlefieldNameNumbers(objects, displayedNameOf)`, sesja podaje resolver lustrzany wobec `nameOfObject`; testy N8 jednostka + sesja RED→GREEN, 2 mutacje L13 RED) u root cause (AGENTS.md), każda z testem
  RED→GREEN i mutacją L13, osobnym commitem i pushem (ADR 0020 C).
- [x] **E3 — pętla jakości** (ADR 0021 §4b, inna ścieżka niż poprzednia
  sesja): wybrana ścieżka (a) — Żywy Tester. Znalezisko: tester nie znał
  warstwy wysoko-graficznej (`#art-showcase`, hi-gfx domyślnie ON), która
  pauzuje grę (`awaitingArtAck`) — każdy rzut z ilustracją kończył partię
  fałszywym `[STOP]` i fałszywym detektorem „sam Poddaj partię" (identycznie
  na #123 i #124 → luka NARZĘDZIA). Naprawa w `tools/table-tester/run-game.mjs`
  (`closeArtShowcase`: gest + fallback Escape), strażnik
  `test/e3-zywy-tester-warstwa-grafik.test.js` (6 testów, 2 mutacje RED),
  dokumentacja w TESTER_STOLU + README narzędzia. Pomiar: 4 partie po 400
  kroków (seeds 2026/7/42, profile greedy/explorer) kończą się naturalnie,
  **0 zgłoszeń detektorów**.
- [x] **E4 — domknięcie sesji**: liczby zmierzone na finalnym HEAD
  (`npm test` 5646/5646, `npm run test:all` 5656/5656, build 63 moduły /
  3759,9 kB, `bot-benchmark` 10/10), README/PH/`HANDOFF_2026-09-17.md`/opis PR.

## Kolejność commitów (plan)

1. E0 plan → 2. E1 raport audytu (osobno od napraw) → 3. E2 naprawy (osobno
per znalezisko) → 4. E3 pętla jakości (osobno per znalezisko) → 5. E4
domknięcie dokumentacji.

## Ryzyka i pułapki

- Shallow clone: historia `main` wymaga `git fetch --deepen` (zrobione);
  diff PR #124 liczONY jako `git diff 1521ac8 e4befba`, nie `git show`.
- `gh pr view` bez `--json` pada na GraphQL Projects (classic) — używać
  `--json`/`gh api` (ENVIRONMENT §3).
- Testy UI mają własny harness DOM (bez jsdom w rdzeniu); nie wprowadzać
  jsdom do testów core.
- FoW przy numeracji nazw (L141): numer porządkowy to POCHODNA informacji —
  każda zmiana numeracji wymaga testu nierożróżnialności zakrytych kart.
- Pliki z polskim tekstem edytować przez `python3`/`pathlib` (ENVIRONMENT §4);
  komunikaty commitów trzymać poza repo (`.arena/`).
- Pełne B0 tylko na wyraźną komendę właściciela (ADR 0018) — dla PR wystarcza
  profil szybki.
