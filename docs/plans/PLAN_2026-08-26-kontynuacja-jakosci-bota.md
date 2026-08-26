# PLAN 2026-08-26 — Kontynuacja jakości wyceny bota

- **Sesja:** `arena/01a03e36-mtg`
- **PR:** bieżący PR sesji (utworzony przed kodowaniem zgodnie z ADR 0020)
- **Tryb:** ADR 0020 A–D oraz ADR 0021; bez nowych kart i bez pełnego B0.

## Punkt startowy

Najnowszy scalony PR to #78. Jego audyt zostanie zapisany w
`docs/audits/AUDYT_PR78_2026-08-26.md` przed zmianami funkcjonalnymi.
Na `main` znajduje się niedokończony plan M218 dotyczący rygorystycznej wyceny
heurystyki (`docs/plans/PLAN_2026-08-26-audyt-wyceny-dzialan-bota.md`):
Etapy 1–2 są obecne w kodzie, a do wykonania pozostają przede wszystkim
keywordy, regenerate/scry-surveil, inwentaryzacja oraz benchmark szybki.

## Etapy tej sesji

### 0. Start i audyt poprzedniego PR
- [x] PR sesji utworzony przed kodowaniem (po pierwszym commicie planu).
- [ ] Audyt PR #78: engine, FoW/determinizm, generyczność mechanik, karty,
      testy RED→GREEN; `npm test` i build bazowe.
- [ ] Wnioski dopisane do opisu PR.

### 1. Keywordy
- [ ] Audyt i naprawa wyceny flying/reach/first strike/double strike po
      deskryptorach, z odrębnymi oknami ataku/blokowania.
- [ ] Testy regresyjne RED→GREEN.
- [ ] `npm test` + `npm run build`; osobny commit i push.

### 2. Regenerate i scry/surveil
- [ ] Dodać wycenę tylko w sytuacji realnego zagrożenia oraz właściwe okna
      scry/surveil dla czarów.
- [ ] Testy RED→GREEN.
- [ ] `npm test` + `npm run build`; osobny commit i push.

### 3. Audyt katalogowy
- [ ] Sklasyfikować typy efektów, których bot nie wycenia bezpośrednio.
- [ ] Naprawić małe, potwierdzone luki; większe opisać jako ograniczenia.
- [ ] `npm test` + `npm run build`; osobny commit i push.

### 4. Zamknięcie
- [ ] Uruchomić wyłącznie szybki benchmark bez `--full`.
- [ ] Zaktualizować historię, handoff i opis PR.
- [ ] Końcowo: `npm test`, `npm run build`, czysty status i push fast-forward.

## Kryteria i ryzyka

- Testy muszą przejść mutację naprawy (RED→GREEN), a nie tylko przejść po
  dodaniu testu.
- Helpery czytają wyłącznie `PlayerView`; zero nazw/ID kart w core bota.
- Nie utożsamiać nazwy fazy z momentem walki; stan wynika z `view.combat`.
- Pełny B0 wymaga osobnej, jawnej komendy właściciela (ADR 0018).
