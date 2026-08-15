# PLAN M100 — audyt PR #52 + panel „Rozgrywka" (dawniej „Ruch przeciwnika")

**Data:** 2026-08-15 · **Gałąź:** `arena/01a0046e-mtg` · **Sesja:** M100

## Zadanie (pierwszy prompt sesji, decyzje właściciela)

0. **Obowiązkowy audyt poprzedniego PR.** Uwaga właściciela: reguła ma być
   jasno zalecona w dokumentacji. **Jest** — AGENTS.md ma sekcję
   „Obowiązkowy audyt poprzedniego PR na starcie sesji", formalizuje ją
   ADR 0016 (pkt A). Nie dopisujemy nic; wykonujemy.
1. **Poszerzenie treści panelu „Ruch przeciwnika" i zmiana nazwy na
   „Rozgrywka"** — panel pokazuje już nie tylko ruchy przeciwnika, ale i moje.
   Właściciel chce tam dodatkowo widzieć:
   - **dobrane przez gracza karty**,
   - **rozstrzygnięte czary — moje i przeciwnika**,
   - **zrealizowane czary modalne (wybór trybu) — moje i przeciwnika**,
   - **nazwy kart z czarów typu scry i podobnych, manipulujących biblioteką**
     (wyłącznie te nie objęte FoW),
   - **inne logiczne, istotne zagrania gracza i przeciwnika**.

## Stan na starcie (zmierzony wg L7, nie przyjęty z handoffu)

- `main` = `075a79f` (squash PR #52: M90–M99). Potwierdzone w repo:
  plan M99, `test/reveal-exile-log-null.test.js`,
  `test/bot-spell-resolution-in-modal.test.js`, profil `impatient`.
- `npm test` **1677/0** · `npm run build` **50 modułów / 1649.8 kB** — zgodnie
  z handoffem.
- Mechanizm panelu (rozpoznanie kodu): `session.botMoves` +
  `noteBotMove(e)` w `src/table/session.js`, z bramką `botActing` (M75),
  `botStackObjects` (M99 — rozstrzygnięcia czarów bota po passie gracza) i
  raportem walki (M79/B1). Treść filtruje `showBotMoves` (M97: same fazy to
  szum, nagłówki tur zostają — decyzja właściciela).

## Decyzje projektowe (do ewentualnej korekty właściciela)

- **„Dobrane karty" = dobrania z efektów** (`source: 'effect'`), nie z kroku
  dobierania — krok draw jest szumem od M34/M89 (oś 2 w TESTER_STOLU,
  potwierdzone decyzjami właściciela).
- **FoW ponad wszystko:** nazwy kart pokazujemy tylko dla informacji, do
  których człowiek jest uprawniony: (a) jego własne podejrzenia biblioteki
  (scry/surveil/look — on je widział przy decyzji), (b) karty jawne publicznie
  (reveal, grób, stos, wygnanie twarzą w górę). Dla ruchów bota z ukrytych
  stref — sam fakt bez nazw.
- **Częstotliwość modala bez zmian** — pokazuje się przy dotychczasowych
  pauzach (zwrot sterowania do gracza). Treść szersza, nie częstsza.
- **Historia dokumentów zostaje nietknięta:** stare wpisy `PROJECT_STATE.md`
  i starych planów mówiące o „Ruchu przeciwnika" opisują przeszłość — nową
  nazwę stosujemy w treściach aktualnych (UI, TESTER_STOLU, tester).

## Etapy (każdy = samodzielnie zielony commit)

### E0 — audyt PR #52 (ADR 0016, bez pełnego B0)

- [ ] `git show 075a79f --stat` + przegląd diffów `src/engine/`, `src/protocol/`,
      `src/controllers/`, `src/table/` (M90 B/C1 + crashe, M92 PlayerView,
      M95 CR, M96 scoring bota, M99 modal/log).
- [ ] PR #52 nie miał batcha kart — potwierdzić brak zmian w
      `src/cards/card-data.js` / `docs/cards/` (jeśli są, zweryfikować wg Oracle).
- [ ] Mechaniki generyczne — brak specjalnych przypadków po nazwie/ID karty
      (ADR 0002).
- [ ] Potwierdzenie: `npm test` + `node --test test/bot-benchmark.test.js`.
- [ ] Wnioski: ten plan + `docs/PROJECT_STATE.md`.

### E1 — rename „Ruch przeciwnika" → „Rozgrywka"

- [ ] Teksty UI (session.js/render.js/main.js — tytuł modala i ewentualne
      etykiety przycisków).
- [ ] Testy: pliki z listy grep (`bot-move-tokens`, `curate-modal`,
      `modal-spell-log`, `bot-spell-resolution-in-modal`, `table-ux-m18`,
      `session-autopass`, `session-bot-pausa`, `audit-m96-tester`,
      `audit-pr44-fixes`).
- [ ] Tester: `extract.mjs` (tytuł modala w transkrypcie), `detectors.mjs`,
      `run-game.mjs`, README — bez rozjazdu wyników detektorów między trybami.
- [ ] Dokumenty aktualne: TESTER_STOLU (oś 2), ewentualnie LESSONS/AGENTS,
      jeśli nazwa występuje jako odniesienie do żywego elementu.
- [ ] **E1b (refactor identyfikatorów, osobny commit):** `botMoves` → nazwa
      symetryczna (bufor ma trzymać ruchy obu stron), `noteBotMove` →
      neutralna. Czysty rename, zero zmiany zachowania, pełny `npm test`.

### E2 — rozstrzygnięte czary obu graczy (+ modalne z trybem)

- [ ] Uogólnić `botStackObjects` → znane obiekty stosu **obu** kontrolerów;
      `spell_resolved` (z `modeName` dla czarów modalnych — dane już w
      zdarzeniu od M91/D) trafia do modala niezależnie od rzucającego.
- [ ] Efekty rozstrzygnięcia (obrażenia, pump, destroy, token…) — pokrycie
      symetryczne gracz/bot (bot ma je od M99; dodać gałąź gracza).
- [ ] Testy: rozszerzyć `bot-spell-resolution-in-modal` lub nowy plik —
      mój czar rozstrzygnięty po passie bota widoczny w „Rozgrywce".

### E3 — dobrane karty gracza z efektów

- [ ] `card_drawn` z `source: 'effect'` dla człowieka → wpis w modalu
      (z nazwą karty, jeśli zdarzenie ją niesie dla właściciela ręki;
      sprawdzić dane zdarzenia i dopiąć wg L6, jeśli brak).
- [ ] `draw_step` pozostaje szumem (test strażnika).

### E4 — nazwy kart z manipulacji biblioteką (spoza FoW)

- [ ] Inwentaryzacja zdarzeń: scry/surveil, reveal (Dreams), mill (grób =
      strefa publiczna), clash, Epic Experiment, typecycling/search z reveal,
      Stomping Slabs (ma `revealedNames`), Fertile Thicket, Index.
- [ ] Uzupełnić dane zdarzeń engine, gdzie brakuje (L6), z bramką FoW:
      nazwy tylko dla (a) własnych podejrzeń człowieka, (b) kart jawnych.
- [ ] Dla bota: sam fakt („Nieprzyjaciel przegląda wierzch biblioteki") —
      bez nazw z ukrytej strefy (test braku wycieku).

### E5 — symetria innych istotnych zagrań

- [ ] `land_played`, `ability_activated` gracza, wejścia permanentów,
      transformacje — ta sama ścieżka co bot (tam, gdzie zdarzenie jest
      istotne dla bota, jest istotne dla gracza).
- [ ] Walka: raport już zbiera bloki/obrażenia/śmierci (M79/B1) — upewnić
      się, że dotyczy też ataków gracza.

### E6 — weryfikacja Żywym Testerem (L13: OBIE tryby logowania)

- [ ] Kilka partii matrycowo (różne talie/profile), `--quiet` i
      `--snapshot-every 1` — detektory bez rozjazdu.
- [ ] Transkrypty potwierdzające nowe treści w modalu — fragmenty w opisie PR.

### E7 — dokumenty i domknięcie

- [ ] `PROJECT_STATE.md` — wpis M100 (+ uzupełnić brakujące wpisy M98/M99,
      jeśli audyt potwierdzi brak — patrz E0).
- [ ] `TESTER_STOLU.md` — nazwa „Rozgrywka" i zakres osi 2 po zmianach.
- [ ] `docs/setup/HANDOFF_2026-08-15.md` + blok przekazania w czacie.
- [ ] Opis PR — kumulatywny.

## Pułapki / ryzyka

- **Wyciek FoW przez modal** — test regresyjny typu „modal nie niesie nazwy
  karty dobranej przez bota" obok istniejących testów wycieku widoku.
- **Szum:** same fazy bez akcji = bez modala (M97); nagłówki tur zostają;
  krok draw = szum. Nie wolno cofnąć tych decyzji właściciela przy okazji
  rozszerzania treści.
- **Tester/detektory zakładają tytuł modala** — rename bez aktualizacji
  `tools/` zepsuje transkrypty i detektory (fałszywe alarmy/ślepota).
- **Polskie znaki w `edit_file`** — edycje plików z polskim tekstem przez
  `python3` + `encoding='utf-8'` (ENVIRONMENT §4).
- **Częste commity + push** po każdym zielonym etapie (L9).

## Kryteria końcowe

- `npm test` zielone (≥ 1677 + nowe), `npm run build` 50 modułów, bot
  nietknięty funkcjonalnie (B0 nie wymagany — zmiana dotyczy warstwy
  prezentacji/sesji; jeśli audyt E0 ruszy engine, wtedy `bot-benchmark.test.js`).
- Tester: nowe treści widoczne w transkryptach, detektory spójne w obu trybach.
