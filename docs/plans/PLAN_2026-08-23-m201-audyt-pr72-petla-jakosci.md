# PLAN M201 — audyt PR #72 + pętla jakości (2026-08-23)

Sesja: gałąź `arena/01a0300c-mtg`, PR sesji: #73 (do uzupełnienia numerem).
Tryb: ADR 0020 (PR → audyt poprzedniego PR → inkrementalne commity),
ADR 0021 (pętla domyślna — prompt „kontynuujemy” nie nazywa tematu).

## Stan wejściowy (zmierzony, nie przepisany z handoffu)

- `npm test` **3023/3023**, `npm run build` **53 moduły / 2561.2 kB**.
- `main` = `68be815` „M200: sesja — audyt PR #70 (M187–M199) + pętla jakości (#72)”.
- Poprzedni scalony PR: **#72** (25 plików: engine, bot, table, testy, dokumenty).

## Etapy

### A. Plan + PR (ADR 0020 A) — ten commit
Kryterium: plan w repo, PR otwarty na GitHubie przed kodowaniem.

### B. Audyt PR #72 (ADR 0020 B / ADR 0016)
Przegląd KAŻDEGO zmienionego pliku #72 pod kątem:
1. poprawności zmian w engine (reguły, stan, FoW, determinizm),
2. zgodności zachowań z Oracle/CR (L57 — regułę czytam u źródła, zanim
   uznam coś za błąd),
3. generyczności mechanik (ADR 0002 — zero rozpoznawania kart po nazwie),
4. jakości testów (czy pinują zachowanie, czy tylko implementację; próba
   mutacyjna dla każdego nowego znaleziska).
Wynik: `docs/audits/AUDYT_PR72_2026-08-23.md` + streszczenie w opisie PR.
Kryterium ukończenia: raport w repo, każde znalezisko z werdyktem
(błąd / poprawne / do decyzji właściciela).

### C. Naprawy znalezisk audytu
Każda naprawa: test RED → fix → GREEN, `npm test` + `npm run build`,
osobny commit i push.

### D. Otwarte pozycje z kolejki M200 (jeśli potwierdzone u źródła)
- **U2** (audyt PR #68): `epicCastOffers` na ścieżce EPIC nie filtruje
  `additionalCost`.
- **O1** (z N3): nadwyżka trample BLOKERA — CR 702.19 mówi o atakującym;
  przed jakąkolwiek zmianą weryfikuję regułę u źródła (L57) i dopiero
  wtedy decyduję, czy to błąd, czy poprawne zachowanie.

### E. Pętla jakości Żywym Testerem (priorytet z handoffu M200)
`npm run build` + `npm i` w `tools/table-tester`, przebiegi profilami
(greedy/explorer/defensive/random/impatient) na taliach batchy 46–48.
Trzy osie audytu wg `docs/setup/TESTER_STOLU.md`. Znaleziska → naprawa
u root cause + detektor/test regresyjny.

### F. Zamknięcie sesji
`docs/PROJECT_STATE.md`, `docs/setup/HANDOFF_2026-08-23-m201.md`, lekcje
w `docs/LESSONS.md` (jeśli nowa klasa), kumulacyjny opis PR, blok
przekazania w czacie.

## Ryzyka / pułapki

- Reset workspace w trakcie sesji → pushuję po każdym zielonym commicie
  (`docs/setup/ENVIRONMENT.md` §2).
- Polskie znaki: edycje dokumentów przez `python3`/heredoc, nie `edit_file`.
- Pełne B0 tylko na komendę właściciela (ADR 0018) — do PR wystarczy
  `node --test test/bot-benchmark.test.js`.
- L57: zgłoszenie/hipoteza o regule ≠ reguła. Najpierw Oracle/CR.

## Dziennik wykonania

- [x] A — plan + PR (#73)
- [x] B — audyt PR #72 → `docs/audits/AUDYT_PR72_2026-08-23.md` (N1, N2, O2)
- [x] C — naprawy: N1 (debug `process.env` w bocie + strażnik grafu modułów),
      N2 (trigger „you're dealt combat damage” raz na komendę)
- [x] C2 — zgłoszenia właściciela F / M / M2 (M: fix LKI; F, M2: werdykt
      regułowy + testy pinujące)
- [x] D — U2 (błąd reguł, naprawiony) / O1 (teza odrzucona u źródła — testy pinujące)
- [ ] E — Żywy Tester
- [x] F — zamknięcie (PROJECT_STATE, handoff, opis PR)

## Wykonanie (dziennik)

1. **N1 (krytyczne)** — `process.env` + ID karty w `scoreCommand`; artefakt
   przeglądarkowy wywracałby się na pierwszym ruchu bota. Fix + strażnik
   skanujący WSZYSTKIE moduły artefaktu (globalne Node, debug, `dist`).
   Lekcja L58.
2. **N2** — ruling WotC zweryfikowany u źródła (L57); grupowanie triggera
   per poszkodowany gracz w komendzie.
3. **M (zgłoszenie właściciela)** — „cel: ?” na stosie: rejestr LKI
   (CR 603.10) zapisywany w `moveObjectDirectly`, czytany centralnie
   w `nameOfObject`.
4. **F, M2** — werdykt „silnik zgodny z Oracle/CR” poparty pomiarem
   (fuzz 25 partii / 2165 okien) i testami pinującymi.

5. **U2** — CR 601.2h/118.5: darmowy rzut płaci koszty dodatkowe
   (`freeCastAdditionalCostVariants` + `payFreeCastAdditionalCost`
   w epic/suspend/rebound); granica: koszt „discard N”.
6. **O1** — CR 702.19a zweryfikowane u źródła: trample blokera NIE przelewa
   nadwyżki. Zamiast zmiany — testy pinujące (L57 §2).
7. **E (Żywy Tester)** — NIEWYKONANE: `tools/table-tester` wymaga `npm i`
   (jsdom), a egress HTTPS sandboxa jest zablokowany (ENVIRONMENT §4).
   Zamiast tego audyt zachowań prowadzony był fuzzem sesji headless
   (własne przebiegi `createSession` — tą drogą znaleziono repro błędu M).
