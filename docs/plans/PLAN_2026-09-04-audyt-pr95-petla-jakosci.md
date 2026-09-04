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
- [ ] PR `arena/01a06dd7-mtg` → `main` otwarty na GitHubie.
- [ ] Plan widoczny w repo i w opisie PR.
- Kryterium: PR istnieje PRZED jakąkolwiek zmianą kodu.

### Etap 1 — Audyt PR #95

- [ ] Diff przczytany **per plik**, następująco:
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
- [ ] `npm test` i `npm run build` na `main`-as-base: zielone.
- [ ] Dopuszczalne potwierdzenie: `node --test test/bot-benchmark.test.js`
  (bez pełnego B0).
- [ ] Raport w `docs/audits/AUDYT_PR95_2026-09-04.md`.
- [ ] Wynik w opisie PR.
- Kryterium: każdy zmieniony plik ma albo akceptację, albo znalezisko z
  repro/naprawą; brak znaleziska w pliku → jawny wpis „sprawdzone, bez zmian”.

### Etap 2 — Naprawy znalezisk (jeśli są)

- [ ] Dla każdego znaleziska: nazwana reguła/klasa, repro headless,
      test RED, fix u root cause, mutacja, potwierdzenie = zielone.
- [ ] Każdą samodzielnie zieloną paczkę: osobny commit + push (ADR 0020 C).
- Kryterium: po każdej paczce `npm test` + `npm run build` zielone.

### Etap 3 — Pętla jakości (ADR 0021)

- [ ] Wybór ścieżki: audyt Żywym Testerem na przebudowanym artefakcie
      (oś 1–3 z `TESTER_STOLU.md`) LUB polowanie na niezgodności z CR
      ścieżką niewykorzystaną w PR #95; w obu: nowy detektor / strażnik
      dla każdej znalezionej klasy.
- [ ] Zero nowych kart (ADR 0021 §4c).
- [ ] Brak pełnego B0.
- Kryterium: każda znaleziona klasa ma repro, naprawę i strażnika.

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
