# PLAN 2026-09-04: audyt PR #95 + pętla jakości

Sesja `arena/01a06dd7-mtg`. Prompt: „kontynuujemy projekt” → tryb domyślny
ADR 0020/0021: PR → audyt ostatniego scalonego PR → pętla jakości.

## Zakres

- Audyt **PR #95** (squash `bf615b1`, ostatni scalony do `main`)
  — 27 plików, +3983 −63. Raport: `docs/audits/AUDYT_PR95_2026-09-04.md`.
- Naprawa znalezisk audytu u root cause, każda z RED → fix → mutacja.
- Po domknięciu audytu: pętla jakości (ADR 0021 §4) — audyt Żywym Testerem
  z perspektywy gracza i/lub polowanie na niezgodności z CR inną ścieżką niż
  poprzednia sesja. **Bez nowego batcha kart** (ADR 0021 §4c).

Świadomie POZA zakresem:

- nowy batch kart;
- pełna macierz B0 (`--full` tylko na wyraźną komendę właściciela, ADR 0018);
- zmiana architektury / nowy ADR bez zablokowania decyzją właściciela;
- ewentualny nowy powód `support.limitations` (wymaga decyzji, ADR 0022).

## Etapy i kryteria ukończenia

### Etap 0 — PR na starcie (ADR 0020 A)

- [x] `git push -u origin arena/01a06dd7-mtg`.
- [x] PR `arena/01a06dd7-mtg` → `main` otwarty na GitHubie (#96).
- [x] Plan widoczny w repo i w opisie PR.
- Kryterium: PR istnieje PRZED jakąkolwiek zmianą kodu.

### Etap 1 — Audyt PR #95

- [x] Diff przczytany **per plik**, następująco:
  - `src/engine/combat.js` — łańcuch wyników komendy (M296), model
    kupowanego deathtouch (M297), brak regresji obrażeń/kroku walki;
  - `src/engine/game-state.js` — bramki escape/naprawy wyników, `modeExtra`,
    brak zmian legalności poza zamierzonymi (M295/M296);
  - `src/controllers/heuristic-bot.js` — drabina equipu (M288), waga
    jakości ciała, wycena ataku z kupowanym deathtouchem (M297);
  - `src/table/choice-request.js`, `src/table/multi-target.js`,
    `src/table/render.js`, `src/table/main.js`, `src/table/session.js` —
    wspólny kreator i łańcuchy wariantów (M298–M304), etykiety, FoW,
    brak regresji granicy tury/auto-pass;
  - `test/*` — czy testy testują zamierzoną regułę, czy zależą od danych
    kształtem odsianym przez inne bramki (L5/L65/L13); mutacje w opisach
    commitów;
  - `docs/**` — czy opisywane liczby/stan zgadzają się z kodem
    (L56/L92), czy LESSONS/ENGINE_MILESTONES nie dublują faktów.
- [x] `npm test` i `npm run build` na `main`-as-base: zielone (4402/3226,2 kB).
- [x] Dopuszczalne potwierdzenie: `node --test test/bot-benchmark.test.js`
  (bez pełnego B0).
- [x] Raport w `docs/audits/AUDYT_PR95_2026-09-04.md`.
- [x] Wynik w opisie PR.
- Kryterium: każdy zmieniony plik ma albo akceptację, albo znalezisko z
  repro/naprawą; brak znaleziska w pliku → jawny wpis „sprawdzone, bez zmian”.

#### Wynik audytu (2026-09-04)

- Werdykt: PR #95 jakościowo dobry; kod bez zastrzeżeń regułowych.
- Znaleziska F1/F2 (dokumentacyjne, L92): README i handoff 2026-09-03
  podają nieaktualne liczby (README 4378 / 3208,9 kB; realnie 4402/4412
  i 3226,2 kB). Naprawa: README w etapie 4 + nowy handoff 2026-09-04.
- Szczegóły: `docs/audits/AUDYT_PR95_2026-09-04.md`.

### Etap 2 — Naprawy znalezisk (jeśli są)

- [x] **N/A — brak znalezisk regułowych** w audycie PR #95; znaleziska
      F1/F2 są dokumentacyjne (L92) i naprawiane w Etapie 4.
- Kryterium: po każdej paczce `npm test` + `npm run build` zielone.

### Etap 3 — Pętla jakości (ADR 0021)

- [x] Wybór ścieżki: audyt Żywym Testerem na przebudowanym artefakcie
      (oś 1–3 z `TESTER_STOLU.md`); cztery partie, wszystkie
      „DETEKTORY: brak zgłoszeń”.
- [x] Zero nowych kart (ADR 0021 §4c).
- [x] Brak pełnego B0 (ADR 0018 — tylko na wyraźną komendę właściciela).
- Kryterium: każda znaleziona klasa ma repro, naprawę i strażnika.

#### Wynik pętli jakości (2026-09-04)

- Cztery partie żywego testera na przebudowanym `dist/` (profile:
  greedy ×2, explorer, random), wszystkie bez zgłoszeń detektorów.
- Mulligan londyński (seed 811): 3 odrzucenia, odłożenie 1/2/3 karty,
  opcje 6/16/35, zatrzymanie 4 kart — przebieg w `[ROZGRYWKA]`
  transkryptu zgodny z regułą.
- KANDYDAT ODRZUCONY: „Bierzesz mulligan (1)” w końcowej linii `LOG:`
  snapshotu to artefakt testera (`snapshot()` bierze `slice(-6)` z DOM
  rysowanego od najnowszego, więc to OGON najstarszych wpisów), nie błąd
  silnika. Nie tworzymy znaleziska (ADR 0016: bez maskowania, bez latania
  na artefaktach testera).

### Etap 4 — Domknięcie sesji

- [ ] `npm test`, `npm run build`, `npm run test:all` zielone (brama PR).
- [ ] Wszystko wypchnięte; `git status` czysty.
- [ ] `docs/PROJECT_HISTORY.md`, `docs/setup/HANDOFF_2026-09-04.md`,
      liczby README (L92), opis PR kumulacyjnie.
- [ ] Blok przekazania w czacie (ADR 0013 §3).

## Ryzyka i pułapki

- **PR #95 jest duży i dotyka UI + engine + bota**: audyt ma pokazać, że
  każda zmiana jest spójna; szczególnie pilnować granicy oferta/walidacja
  (L48/L90) i „wspólnego kreatora” (L126 — zlanie kreatorów potrafi uśpić
  różnice semantyczne).
- **Panujący dryf liczb w README/PROJECT_HISTORY** (L92): liczby odświeżać
  dopiero na sam koniec, mierzone, nie przepisywane z logu.
- **Sandbox potrafi zresetować workspace** (ENVIRONMENT §2): częste commity
  po każdym zielonym kroku; przed każdym push sprawdzić `HEAD`/`FETCH_HEAD`;
  zero force push (ADR 0020 D).
- **Polskie znaki**: do edycji `docs/*.md` używać `python3` + UTF-8, nie
  `edit_file`, jeśli narzędzie je uszkadza.
- **Żywy Tester ładuje `dist/`**: po każdej zmianie w `src/` `npm run build`,
  inaczej mierzy się stary artefakt (L76).
