# PLAN 2026-09-25g — audyt PR #139 + pętla jakości (kontynuacja bez nazwanego tematu)

- **Wejście:** prompt „Kontynuujemy projekt.” bez nazwanego tematu → po lekturze
  obowiązkowej (AGENTS.md → ADR-y 0001–0030 → LESSONS.md L1–L171 →
  ENVIRONMENT.md → PR #139 → HANDOFF_2026-09-25d) obowiązuje **ADR 0021**
  (pętla domyślna): PR na starcie → audyt poprzedniego scalonego PR →
  niedokończony plan → pętla jakości. Pytanie o kolejkę zabronione.
- **Stan main:** `605a8dc` (squash #139). Baseline zmierzony w tej sesji:
  `npm test` **6607/6607** (0 fail), `npm run build` **61 modułów / 4299,4 kB**
  — zgodne z opisem PR #139.
- **Niedokończony plan na main:** BRAK — PLAN_2026-09-25f zrealizowany w #139
  (commity cbbe906, 56e7502, 15a79dc). Po audycie wchodzi pętla jakości.

## Etap 1 — PR na starcie (ADR 0020 A) ✓ ten plik

Kryterium: gałąź `arena/01a0d980-mtg` wypchnięta, PR do `main` otwarty
przed jakimkolwiek kodowaniem.

## Etap 2 — audyt PR #139 (ADR 0020 B)

**Audytowany:** #139 (squash `605a8dc`, baza `3f1af5e`), 5 plików, +784/−18:
`docs/audits/AUDYT_PR138_2026-09-25.md` (raport), `docs/plans/PLAN_…25f…`
(plan C2), `src/table/gestures.js` (+100/−15, sedno), `src/table/choice-request.js`
(+11/−3, modal przez gest), `test/uwaga-z-gry-C2-ptaszek-2026-09-25.test.js`
(352 linie, 11 pinów). Bez batcha kart, bez zmian silnika (ADR 0029/0022
trywialnie spełnione); zmiana UI — ADR 0030 nie wymaga cytatów CR.

Metoda (jak #138: każdy plik diffu czytany wobec `3f1af5e`):

1. **Logika `gestures.js`:** `honestHitTarget` (elementFromPoint + fallback),
   `forwardTapToIsland`, gałąź `islandStart` (zwolnienie na wyspie / w przycisku /
   poza przyciskiem), gałąź press-z-opcji (zwolnienie nad wyspą = toggle bez
   progu slop), ścieżka `click` (`handled`, klawiatura `detail === 0`).
   Edge cases do rozstrzygnięcia: podwójne przełączenie (natywny click +
   forward), zwolnienie poza przyciskiem przy press-z-opcji, press z opcji A
   zwolniony nad wyspą opcji B, multidotyk.
2. **`choice-request.js`:** modal przez `installPressActivation` — pojedyncza
   odpowiedź (pointerup + click), brak regresji klawiatury i wywołań testowych.
3. **Weryfikacja mutacyjna pinów C2 (L13/L159 — kierunek PRZED naprawą):**
   - M-A: `gestures.js` ← stan `3f1af5e` + testy C2@HEAD → oczekiwane RED
     C2/1, C2/1b(?), C2/2, C2/3, C2/5; zielone C2/4, C2/6, C2/7, C2/8, C2/9, C2/10.
   - M-B: `choice-request.js` ← stan `3f1af5e` → oczekiwane RED tylko C2/10
     (pin integracji modalu — potwierdza/obala hipotezę „regex jako jedyny pin”).
   - Po każdej mutacji: `node --check`, przywrócenie KOPIĄ (L136 — nie gitem),
     `git status` czysty.
4. **Bramki na `605a8dc`:** `npm test` (zmierzone: 6607/6607) + `npm run build`
   (61/4299,4 kB) + `node --test test/bot-benchmark.test.js` (ADR 0016;
   zmiana nie dotyka silnika/bota, więc potwierdzenie audytowe, nie rekalibracja).
5. **Zgodność z ADR:** 0002 (brak gałęzi po nazwie karty w UI-gescie),
   0005 (determinizm — brak RNG w gescie), 0011/L58 (kod przeglądarkowy:
   brak `process`/Node-globali w zmienionych modułach), 0018 (progi nietknięte).
6. **Proces:** sesja e/f nie zostawiła `HANDOFF_2026-09-25e/f.md` — odnotować
   jako obserwację (ciągłość przez opis PR #139, ale luka w sekwencji handoffów).

Kryterium: raport `docs/audits/AUDYT_PR139_2026-09-25.md`, wynik w opisie PR.
Znalezione błędy blokujące → naprawa od razu (AGENTS.md); nieblokujące → § uwag.

## Etap 3 — pętla jakości (ADR 0021 pkt 4)

Dopiero po domkniętym audycie, dopóki właściciel nie wskaże tematu:

- (a) Żywy Tester z perspektywy gracza (artefakt przebudowany przed pomiarem;
  transkrypty w /tmp; odczyt ręczny wzdłuż osi TESTER_STOLU.md). **Nie powtarzać
  seedów 91 i 15 jako dowodu czystości** (handoff 25d). Zakaz wymyślania batcha.
- (b) Polowanie na niezgodności z CR innymi ścieżkami niż sesja 25e/f
  (tam: gest UI; tu: silnik/reguły). Każde znalezisko: repro headless PRZED
  naprawą (L11), cytat CR z bieżącego wydania (ADR 0030, L164), naprawa
  u root cause, strażnik klasowy, weryfikacja mutacyjna (L13).
- (c) Bez nowej lekcji LESSONS, chyba że klasa jest NOWA — rejestr powyżej
  progu 100k (sesja 25d też nie dopisała); obserwacje jednorazowe do raportu.

Kryterium: każdy krok = osobny commit (testy + build) + push od razu.

## Kolejność commitów

1. Ten plan → push → PR (ADR 0020 A). 
2. Raport audytu `AUDYT_PR139_…` → push.
3. Kroki pętli jakości, każdy osobno → push po każdym.
4. Finał: `PROJECT_HISTORY.md` + `HANDOFF_2026-09-25g.md`, opis PR, blok
   przekazania w czacie.

## Ryzyka

- Brak Chromium w sandboxie → weryfikacji przeglądarkowej z #139 nie da się
  powtórzyć; audyt gestu jest statyczny + stubowy (MiniEl). Uczciwie odnotować
  jako granicę audytu, nie lukę PR.
- `C2/10` (regex na źródło) to pin implementacji (L160) — mutacja M-B pokaże,
  czy jest jedynym wiązaniem modalu z gestem; jeśli tak → obserwacja, nie błąd.
- Reset workspace w trakcie (ENVIRONMENT §2): praca tylko przyrostowo,
  push po każdym commicie, przed pushem HEAD + diff vs remote, nigdy force.
