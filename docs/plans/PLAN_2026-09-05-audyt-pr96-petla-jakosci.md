# PLAN 2026-09-05: audyt PR #96 + pętla jakości

Sesja `arena/01a07073-mtg`. Prompt: „kontynuujemy projekt” → tryb domyślny
ADR 0020/0021: PR → audyt ostatniego scalonego PR → pętla jakości.

## Zakres

- Audyt **PR #96** (squash `d67b684`, ostatni scalony do `main`)
  — 114 plików, +2799 −382: batch 53 (10 kart 589–598), split Warhammera
  (ADR 0024, `warhammer-ubr` + `warhammer-wg`), raport audytu PR #95.
  Raport: `docs/audits/AUDYT_PR96_2026-09-05.md`.
- Naprawa znalezisk audytu u root cause, każda z RED → fix → mutacja.
- Po domknięciu audytu: pętla jakości (ADR 0021 §4) — audyt Żywym Testerem
  z perspektywy gracza (nowe karty batcha 53: Glorifier, Rust-Shield) i/lub
  polowanie na niezgodności z CR inną ścieżką niż poprzednia sesja.
  **Bez nowego batcha kart** (ADR 0021 §4c).

Świadomie POZA zakresem:

- nowy batch kart;
- pełna macierz B0 (`--full` tylko na wyraźną komendę właściciela, ADR 0018);
- zmiana architektury / nowy ADR bez zablokowania decyzją właściciela;
- ewentualny nowy powód `support.limitations` (wymaga decyzji, ADR 0022).

## Etapy i kryteria ukończenia

### Etap 0 — PR na starcie (ADR 0020 A)

- [ ] `git push -u origin arena/01a07073-mtg`.
- [ ] PR `arena/01a07073-mtg` → `main` otwarty na GitHubie.
- [ ] Plan widoczny w repo i w opisie PR.
- Kryterium: PR istnieje PRZED jakąkolwiek zmianą kodu.

### Etap 1 — Audyt PR #96

- [ ] Diff przeczytany **per plik**, następująco:
  - `src/cards/card-data.js` (+244) — 10 definicji batcha 53 vs snapshoty
    `docs/cards/scryfall-*.json` (Oracle: koszt, typy, P/T, tekst) i ADR 0022
    (supported = 100% Oracle); `limitations` tylko strukturalne;
  - `src/engine/effects.js` (+80), `triggers.js` (+61), `game-state.js` (+60),
    `permanents.js` (+46), `combat.js` (+22), `resources.js` (+18),
    `abilities.js` (+11), `state-based.js` (+7), `tokens.js` (+6),
    `identity.js` (+5), `fingerprint.js` (+3) — nowe mechaniki generyczne
    (Offspring, Storied, `becomes_blocked`, refleksyjne „When you do”,
    `cantBeBlockedByPower`, filtry celów); brak specjalnych przypadków
    po nazwie/ID karty (ADR 0002); zgodność z CR;
  - `src/cards/materialize.js` (+3), `registry.js` (+7),
    `mana-costs-data.js` (+11) — dowiązania deskryptorów (L21/L84);
  - `src/controllers/heuristic-bot.js` (8) — wyceny nowych mechanik (L50/L84);
  - `src/protocol/types.js` (4), `src/table/render.js` (8),
    `src/table/session.js` (+15) — rejestr zdarzeń, etykiety PL, FoW;
  - `decks/*` + `tools/collection-art-ids.csv` — split Warhammera wg ADR 0024
    (generator jako źródło prawdy; `repo-decks.test.js` zielony);
  - `test/real-cards-batch53.test.js` (+647) — czy testy testują deklarowaną
    regułę, czy dane nie są odsiane wcześniejszą bramką (L5/L65/L13);
  - ~40 plików testów z migracją `warhammer-brg/wu` → `ubr/wg` — mechaniczna
    poprawność (spot-check + zielony pakiet);
  - `docs/**` — liczby/stan zgodne z kodem (L56/L92); podejrzenie wstępne:
    README mówi 4412/4412 i 3226,2 kB, a handoff batch53 mierzył 4442/4442
    i 3257,4 kB — do weryfikacji pomiarem.
- [ ] `npm test` i `npm run build` na bazie: zielone.
- [ ] Dopuszczalne potwierdzenie: `node --test test/bot-benchmark.test.js`
  (bez pełnego B0).
- [ ] Raport w `docs/audits/AUDYT_PR96_2026-09-05.md`.
- [ ] Wynik w opisie PR.
- Kryterium: każdy zmieniony plik ma albo akceptację, albo znalezisko z
  repro/naprawą; brak znaleziska w pliku → jawny wpis „sprawdzone, bez zmian”.

#### Wynik audytu (2026-09-05)

- (do uzupełnienia po audycie)

### Etap 2 — Naprawy znalezisk (jeśli są)

- [ ] N/A albo lista napraw u root cause z mutacjami.
- Kryterium: po każdej paczce `npm test` + `npm run build` zielone.

### Etap 3 — Pętla jakości (ADR 0021)

- [ ] Wybór ścieżki po audycie: Żywy Tester na przebudowanym artefakcie
  (oś 1–3 z `TESTER_STOLU.md`) i/lub polowanie CR inną ścieżką.
- [ ] Zero nowych kart (ADR 0021 §4c).
- [ ] Brak pełnego B0 (ADR 0018 — tylko na wyraźną komendę właściciela).
- Kryterium: każda znaleziona klasa ma repro, naprawę i strażnika.

#### Wynik pętli jakości (2026-09-05)

- (do uzupełnienia)

### Etap 4 — Domknięcie sesji

- [ ] `npm test`, `npm run build`, `npm run test:all` zielone (brama PR).
- [ ] Wszystko wypchnięte; `git status` czysty.
- [ ] `docs/PROJECT_HISTORY.md`, `docs/setup/HANDOFF_2026-09-05.md`,
      liczby README (L92), opis PR kumulacyjnie.
- [ ] Blok przekazania w czacie (ADR 0013 §3).

## Ryzyka i pułapki

- **PR #96 jest duży (114 plików) i łączy batch kart z migracją talii**:
  większość diffu testów to mechaniczne renamy `warhammer-*` — audyt ma
  odróżnić mechanikę od semantyki (spot-check + zielony pakiet dla renamów,
  pełny przegląd dla `src/` i definicji kart).
- **Nowe mechaniki batcha (Offspring, Storied, becomes_blocked, „When you do”)**:
  pilnować generyczności (deskryptory, nie nazwy kart — ADR 0002) i kompletności
  łańcucha oferta → walidacja → obiekt stosu → zdarzenie → etykieta (L129).
- **Panujący dryf liczb w README** (L92): liczby odświeżać dopiero na sam koniec,
  mierzone, nie przepisywane z logu ani z handoffu.
- **Sandbox potrafi zresetować workspace** (ENVIRONMENT §2): częste commity
  po każdym zielonym kroku; przed każdym push sprawdzić `HEAD`/`FETCH_HEAD`;
  zero force push (ADR 0020 D).
- **Polskie znaki**: do edycji `docs/*.md` używać `python3` + UTF-8.
- **Żywy Tester ładuje `dist/`**: po każdej zmianie w `src/` `npm run build`,
  inaczej mierzy się stary artefakt (L76).
- **`gh pr edit` pada z GraphQL Projects (classic)** — opis PR aktualizować
  przez `gh api -X PATCH repos/<repo>/pulls/<nr> -F body=@<plik>`.
