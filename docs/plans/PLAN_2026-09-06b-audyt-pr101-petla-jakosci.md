# PLAN 2026-09-06 (sesja 01a07711) — audyt PR #101 + pętla jakości

Sesja: gałąź `arena/01a07711-mtg`, 1 sesja = 1 gałąź = 1 PR (ADR 0013/0020).
Start: `main` = `6ce4cab` (squash merge PR #101, 32 pliki, +1684/−268),
`npm test` **4506/4506** (zmierzone na starcie), `npm run build` 59 modułów /
3318,6 kB (zmierzone).

## Zakres

1. **Audyt poprzedniego PR (ADR 0020 B)** — PR #101 „audyt PR #100 + pętla
   jakości; faza 2: usunięcie karty-sondy i ADR 0029" → wynik w
   `docs/audits/AUDYT_PR101_2026-09-06.md`.
2. **Pętla jakości (ADR 0021 4)** — audyt Żywym Testerem + polowanie na CR
   ścieżką inną niż poprzednie sesje + naprawy u root cause.
3. **Bez nowych kart** (ADR 0021 4c, ADR 0029). Pełny B0 tylko na jawną
   komendę właściciela (ADR 0018).

## Etapy (kolejność commitów)

### E1. Audyt PR #101 → `docs/audits/AUDYT_PR101_2026-09-06.md`
Kryterium ukończenia: każdy zmieniony plik źródłowy (engine/table/bot/cards)
przeglągnięty w diffie; każde znalezisko ze statusem POTWIERDZONE /
ODRZUCONE / OBSERWACJA i pomiarem; próbka weryfikacji mutacyjnej RED→GREEN
na nowych testach (m305–m308, prowenicja) — czy testy testują to, co
deklarują (L13). Bez pełnego B0 (ADR 0018); dopuszczalne potwierdzenie:
`npm test` + `node --test test/bot-benchmark.test.js`.

Obszary z PR #101 do prześwietlenia:
- **A1 → `decisionCandidateCard`**: jedno źródło kandydata (payload decyzji);
  nowe pola widoku `pendingSatyrLook.cards` i `pendingRevealExile.handCards`
  — FoW z obu stron (decydent widzi, wróg nie); czy żaden inny konsument nie
  został na starym (inertnym) źródle; strażnik źródła w m305/5.
- **A2 → `singleTargetPlanOf`** (`liczbaWariantow !== targets.length`) +
  wspólne `SEARCH_DESTINATION_LABELS` (L41) — czy etykieta i tytuł nie
  rozjadą się ponownie.
- **A3 → `effectiveTypesOf`** — czy wszystkie miejsca tamtej klasy
  (operator warunkowy w łańcuchu `??`) zostały przejrzane.
- **A4 → okno vigilance** — dokładnie `declare_attackers`; gate `m221d`
  nietknięty.
- **A8 → `landLossValue`** — kolory przez `getSourceForObject`, pipy przez
  `coloredPipsOf`, cap 16; czy projekcja remisów nosi fakty (nie tożsamość).
- **Faza 2 → usunięcie Stifle**: kompletność cięcia (definicja, klucz
  `MANA_COSTS`, snapshot Scryfall, `plan`/`decks/wiedzmin.txt`, testy
  pinujące nazwę — L134); strażnik `proweniencja-katalogu.test.js`
  (5 asercji) — weryfikacja mutacyjna fałszywką.
- **Żywy Tester → `__mtgDebug.gameOver()`** (L133) — mostek zamiast drugiej
  kopii scrapingu.
- Positive signals: grzechotka `block` 4→6 (przyczyna zmierzona per para —
  sprawdzić czy opis zgadza się z pomiarem).

### E2. Naprawy z audytu (jeśli są)
Każda: test RED → naprawa u root cause → GREEN → osobny commit (ADR 0020 C).

### E3. Pętla jakości (ADR 0021 4a/4b)
- (a) Żywy Tester: partie na aktualnym buildzie (`npm run build` PRZED
  biegiem — Tester mierzy `dist/`, L76); trzy osie audytu z TESTER_STOLU.md;
  każda klasa znaleziona ręcznie = nowy detektor (L27).
- (b) Ścieżka CR inna niż sesje #100/#101 (remisy bota, kontrakty zdarzeń):
  kandydaci — detektory `tools/event-contract-audit.mjs` na nowych
  emiterach; skan rozjazdów oferta↔walidacja (L48); pary wymóg×zakaz
  (deadlock reguł, L108).
- Kryterium: każde znalezisko ma repro headless przed naprawą (L11),
  strażnik klasowy + weryfikacja mutacyjna (L13).

### E4. Domknięcie
- `npm test` + `npm run build` zielone przed każdym commitem i na końcu.
- `docs/PROJECT_HISTORY.md`, `docs/setup/HANDOFF_2026-09-06c.md`,
  kumulatywny opis PR; liczby „bieżącego stanu" mierzone na końcu (L92).
- Budżet lektury startowej: nowe wpisy LESSONS wymagają kondensacji innych
  (próg 100k nietknięty — handoff 2026-09-06b podaje ~99,8k/100k).

## Ryzyka / pułapki

- Zmiana `playerView`/wycen = ryzyko golden-mastera i grzechotek → pełny
  `npm test` przed commitem; zmianę wagowej wyceny przypisuj trzema drzewami
  (L124) zanim podniesiesz próg.
- Każdy commit pushowany od razu (ADR 0020 C/D); przed pushem
  `git fetch origin arena/01a07711-mtg` + porównanie `HEAD..FETCH_HEAD` /
  `FETCH_HEAD..HEAD`; nigdy `--force`.
- Komunikaty commitów przez plik poza repo (`/home/user/msg.txt`); polskie
  znaki przez `python3` + `pathlib` (ENVIRONMENT §4).
- Żywy Tester wymaga świeżego `npm run build` i `npm i` w
  `tools/table-tester` przy pierwszym biegu.
- Katalog kart nie rośnie (ADR 0029); brak nośnika mechaniki = karta
  syntetyczna w pliku testu.
