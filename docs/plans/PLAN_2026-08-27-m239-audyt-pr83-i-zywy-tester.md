# PLAN sesji 2026-08-27 (arena/01a044af-mtg) — audyt PR #83 + wznowienie audytu Żywym Testerem

- **Gałąź:** `arena/01a044af-mtg`, baza `main` @ `a9bd34b` (squash PR #83).
- **Lektura obowiązkowa (ADR 0020):** AGENTS.md, WSZYSTKIE ADR-y 0001–0024,
  LESSONS.md (L1–L80), ENVIRONMENT.md, PR #83, HANDOFF 2026-08-26-m216. ✓
- **Pomiar startowy:** `npm test` 3567/3567 fast, `npm run build` 55 modułów
  / 2797.1 kB. Zgodne z końcem PR #83 (3545 fast + nowe testy M237/M238 → 3567). ✓
- **Handoff właściciela (prompt):** (1) wznowić audyt Żywym Testerem na
  niesprawdzonych kandydatach — *modal choices, saga chapters,
  discard/hand-attack, proliferate/counter targeting, głębszy mana/tap timing*;
  (2) dopisać sekcje M237/M238 do BOT_ROADMAP (opis PR #83 zamrożony —
  scalony; żywym dokumentem jest BOT_ROADMAP).

## Etapy

### E0 — PR na starcie (ADR 0020 A)
Ten plan jako pierwszy commit + otwarcie PR do `main`. ✓

### E1 — Obowiązkowy audyt PR #83 (ADR 0020 B / ADR 0016)
Bez pełnego B0 (ADR 0018). Zakres przeglądu (squash `50f304f..a9bd34b`, 100+ plików):
- **engine** (`effects`, `game-state`, `spells`, `triggers`, `resources`,
  `identity`, `fingerprint`, `simulation`): zgodność z CR (m.in. 608.2b fizzle,
  ETB/devour/exploit — L77, podwójne zdarzenia logowania — L79), determinizm
  (ADR 0005), FoW (ADR 0003/0017), brak specjalnych przypadków po nazwach (ADR 0002);
- **Batch 50** (5 kart: Dimir Guildgate, Vow of Flight, Nanoform Sentinel,
  Jwar Isle Avenger, Manifest Dread) wobec `docs/cards/scryfall-*.json` (ADR 0010 §2a,
  ADR 0022 — pełny Oracle albo brak wsparcia) + mechaniki surge/manifest/
  self_becomes_tapped generycznie;
- **bot** (`heuristic-bot.js`, `heuristic-params.js`): zmiany M221 A–G, M234–M236,
  M237 — deskryptory nie nazwy (ADR 0002), tylko PlayerView (ADR 0017), kara
  względem bazy (L54), klamry celowania (L51); spot-check RED→GREEN mutacyjnie
  na 2–3 fixach (L61);
- **table/UI** (`session.js`, `render.js`, `main.js`, `index.html`): tryb
  wysoko-graficzny (M232), etykiety; kolejność renderów (L22/L62);
- **tools** (proxy-reward, mirror-eval, tune-card, run-game): determinizm,
  środowisko CI (L60: leniwy jsdom);
- **talie** (ADR 0024): podziały + strażnik `repo-decks.test.js`;
- wynik: `docs/audits/AUDYT_PR83_2026-08-27.md` + sekcja w opisie PR.
Kryterium ukończenia: raport commitnięty, znaleziska (jeśli) naprawione RED→GREEN.

### E2 — Dokumentacja M237/M238 (handoff pkt 2)
- `docs/BOT_ROADMAP.md`: runda 8 (M237: wycena kontry, X-cost drain,
  granted-damage, model skalujących obrażeń) + runda 9 (M238: wartość pakietu
  testów, 3 kruche testy → deterministyczne/samonaprawialne, pokrycie 97.3%,
  rekomendacja „nie rzezać").
- Rekonstrukcja raportu `docs/audits/AUDYT_M237_*.md` z dowodów w repo
  (komentarze M237/* w testach i heuristic-bot.js) — continuity dla kolejnych sesji.
Kryterium: commit, `npm test` zielony (strażniki dokumentów), opis PR.

### E3 — Wznowienie audytu Żywym Testerem (handoff pkt 1)
Kandydaci (z „Next Steps" poprzedniej sesji), każdy jako osobny osobny fix RED→GREEN:
1. **Modal choices** — wycena wyboru trybu czaru modalnego przez bota (wybiera
   sensowny tryb do sytuacji? remis wariantów → pierwszy z listy, klasa L50/L51);
2. **Saga chapters** — świadomość rozdziałów sagi (bot gra sagę rozumiejąc
   rozdziały? wycenia nadchodzący rozdział?);
3. **Discard / hand-attack** — wartość i timing efektów zrzucania/uścisku ręki;
4. **Proliferate / counter targeting** — wybór permanentu do proliferate
   i celowanie dodawania/przenoszenia liczników;
5. **Głębszy mana/tap timing** — kiedy bot tapuje źródła many / kiedy trzyma.
Metoda: sondy strukturalne (bot-vs-bot, deskryptory decyzji) + partie Żywym
Testerem (transkrypty, profile defensive/explorer/random), ręczna lektura
(L27/L40: detektory = dolna granica). Każde znalezisko: repro → Oracle/CR (L57)
→ naprawa u root cause, generycznie po deskryptorze (ADR 0002), tylko PlayerView
(ADR 0017) → test RED→GREEN + mutacja (L61) → osobny commit + push (ADR 0020 C).
Kryterium ukończenia: wyczerpanie listy kandydatów albo budżetu sesji; raport
`docs/audits/AUDYT_M239_ZYWY_TESTER_2026-08-27.md` (lub osobne per runda).

### E4 — Zamknięcie sesji
`npm run test:all` zielony (brama PR), build, kumulacyjny opis PR,
`docs/setup/HANDOFF_2026-08-27-*.md`, lekcje (jeśli są) do LESSONS.md,
blok przekazania w czacie (ADR 0013), PROJECT_HISTORY.md wpis.

## Ryzyka i pułapki
- PR #83 olbrzymi (100+ plików) — audyt priorytetyzuje engine/komendy i
  spot-mutacje, nie liniową lekturę każdej linii docs.
- Żywy Tester: `npm i` w `tools/table-tester` (jsdom) + `npm run build`
  (tester ładuje `dist/`, L76).
- Polskie znaki: edycje istniejących plików przez `python3`/pathlib (ENVIRONMENT §4).
- Zero zgłoszeń detektorów ≠ czysto (L27/L40); detektor testować dwustronnie (L40).
- Bez pełnego B0 (ADR 0018) — tylko `npm test` (fast) + `bot-benchmark` + przy
  zmianach wyceny bota ewentualnie golden-master.
