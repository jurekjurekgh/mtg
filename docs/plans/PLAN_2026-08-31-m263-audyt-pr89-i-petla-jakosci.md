# PLAN 2026-08-31 — M263: audyt PR #89 i pętla jakości (sesja arena/01a0577f)

**Sesja:** `arena/01a0577f-mtg`. **Baza:** `main` @ `006fcb7` (squash PR #89).
**Prompt:** „kontynuujemy pracę nad projektem" — brak nazwanego tematu → ADR 0021
(pętla domyślna: PR na starcie → audyt poprzedniego PR → niedokończony plan →
pętla jakości). **Zasady:** ADR 0020 (PR przed kodowaniem, audyt przed nową
pracą, inkrementalne commity, zakaz force push), ADR 0022 (pełny Oracle albo
brak wsparcia), ADR 0018/0025 (pełny benchmark tylko na komendę właściciela).

## Pomiar startowy

- [x] `npm test` (szybki rdzeń): **3873/3873 pass**, 0 fail (~162 s).
- [x] `npm run build`: OK, `dist/mtg-table.html` = **56 modułów / 2982.5 kB**
      (zgodnie z domknięciem PR #89).
- [x] `node --test test/bot-benchmark.test.js` (**test:slow**): **10/10** pass
      (~143 s) — progi regresji utrzymane, brak driftu bota.
- [x] Gałąź sesji `arena/01a0577f-mtg`: istnieje lokalnie, czysty working
      tree; repo po `--unshallow` (pełna historia;
      diff audytu: `git diff 1605b56 006fcb7`).

## Zakres PR #89 (do zaudytowania, squash `006fcb7`, 64 pliki, +4725/−353)

Sesja `arena/01a0526d` — M258 (audyt PR #88 + pętla jakości), kontynuowana
M259 (brązowa odznaka: 7 błędów vs zasady), M260 (uwagi właściciela:
Fertile Thicket, Pyxis, pusta biblioteka), M261 (granica tury w modalu
„Rozgrywka"), M262 (reforma stref: cmentarze/wygnanie na stole, ADR 0026).
**Brak nowego batcha kart** — ale dotyczy mechanik: ward (CR 702.21),
cloak, DFC MV (CR 202.3b/707.2/707.8a), madness, kopie tokenów,
deskryptory w materializacji talii (echo/madness/surge/toxic/warp), Roiling
Regrowth (pay-or-sacrifice), `meta.exiledBy` (CR 400.7), granica tury.

## Etap 1 — audyt PR #89 (ADR 0020 B / ADR 0016)

### Kroki

- [ ] **1.1** Przegląd całego diffa `src/` (24 pliki, +1110/−237) po osiach:
      poprawność vs CR, generyczność (ADR 0002 — zero warunków po nazwie/ID
      karty), spójność oferta↔walidacja (L48/L90), kompletność PlayerView
      (ADR 0017, zwłaszcza `exiledBy`), brak globali Node w kodzie artefaktu
      (L58), determinizm/fingerprint (L16).
- [ ] **1.2** Weryfikacja wąskich miejsc regułowych:
      - F1: `installDeck` — jawna lista pól (echo/madness/surge/toxic/warp) —
        czy wszystkie deskryptory z `gameObjectDataOf` są przenoszone (L93);
      - C1–C8: `copyManaValueOf` + `manaCost` fabryki tokenów (L94) — czy
        `createBattlefieldToken` nie gubi nowych pól, czy testy idą przez
        REALNĄ fabrykę;
      - W1–W9: ward — checklista decyzji blokującej (L95: stany, detektor,
        bramka execute, strażniki priorytetu, EVENT/COMMAND_TYPES, oferta,
        oba boty, PAYMENT_DECISION_TYPES, describeGameEvent, etykiety);
      - K2: MV tylnej twarzy DFC na kaflu (CR 202.3b);
      - M261: `heldBotMoves`/`routingHeld`/`botTurnSplit` — gating na
        `pauseOnBotMoves`, brak promocji w środku `apply`, sygnał
        `turn_started` konsumowany raz (L98);
      - M262: `meta.exiledBy` — choke point `moveObjectDirectly`, `meta`
        czyszczone przy wyjściu z exile (CR 400.7), auto-deriwacja
        (temporaryExile/byCardId, unearth/flashback/finality,
        exileIfDiesThisTurn), wartość `effect` jako fallback;
      - M259: 7 poprawek danych (typy, MV phyrexian, subtypy, pipy craft/echo)
        — zgodność z Oracle i ze snapshotami Scryfall (L96);
      - M260: Fertile Thicket — 3-krokowy wizard, FoW decyzji (look ≠ reveal),
        etykiety `commandLabel` (L97); Pyxis CR 406.3; B2 pusta biblioteka
        (CR 704.5m/504.1).
- [ ] **1.3** Weryfikacja mutacyjna RED→GREEN kluczowych nowych testów
      (≥5 plików): `m258-audyt-pr88`, `m258-f3-ward-cloak`,
      `m258-cr202-kopia-tylu-dfc`, `m261-granica-tury-w-modalu`,
      `m262-strefy-na-stole`, `m260-uwagi-wlasciciela`.
- [ ] **1.4** Regresja bota bez pełnego B0: `node --test
      test/bot-benchmark.test.js` (~2 min); progi wg `test/bot-benchmark.test.js`.
- [ ] **1.5** Raport: `docs/audits/AUDYT_PR89_2026-08-31.md` + wynik w opisie PR;
      potwierdzone znaleziska naprawiam od razu (osobne commity).

### Kryteria ukończenia Etapu 1

- Każdy zmieniony plik `src/` z PR #89 przeglądnięty z opinią (tabela w
  raporcie); testy mutacyjne z zapisem wyników; benchmark wolny zielony;
  raport w repo i w opisie PR.

## Etap 2 — pętla jakości (ADR 0021)

Wybór spośród (kolejność wg dostępnego czasu; NIE wymyślamy batcha kart):

- [ ] **2.1** Żywy Tester z perspektywy gracza na puli kart jeszcze
      nieaudytowanej (po M256: forgotten-realms ~39/420 + karty M258–M262;
      profile `explorer/greedy/defensive/impatient/random`, osie
      `TESTER_STOLU.md`). Transkrypty poza repo; raport w `docs/audits/`.
- [ ] **2.2** Klasy → root cause + detektory + testy (wzorzec M54/M65/M73).
- [ ] **2.3** Polowanie na CR: skan strukturalny (L11) rodziny mechanik z PR #89
      (ward/ward-of-cloak, DFC MV, exile/byCardId, madness) albo RODZEŃSTWO
      (L72) efektów zbiorowych.

## Kolejność commitów (planowana)

1. PLAN + otwarcie PR #90 (ADR 0020 A) — docs tylko.
2. Pomiar startowy (wynik w opisie PR).
3. Audyt PR #89: raport `docs/audits/AUDYT_PR89_2026-08-31.md` + ewentualne
   fixy (każdy fix = osobny zielony commit: test RED przed implementacją).
4. Etap 2: znaleziska → fix → test → commit (osobne commity per zielony krok).
5. Domknięcie: README/liczby (L92), `PROJECT_HISTORY.md`, handoff, opis PR.

## Ryzyka i pułapki

- Repo płytkie → `git fetch --unshallow` na starcie (zrobione).
- `edit_file` psuje polskie znaki → pliki z polską treścią przez python3
  (`pathlib`, `encoding='utf-8'`).
- Bash ucina długie wyjścia (L78) → diffy do pliku, czytanie po zakresach.
- Walidacja mutacji: kopia bazowa z gita (`git show HEAD:…`), nie kopia
  „po drodze" (L34); mutacja nieczerwieniąca = luka w danych (L65/L61).
- Żywy Tester ładuje `dist/mtg-table.html` → `npm run build` po każdej
  zmianie `src/` (L76).
- Bez pełnego B0 (ADR 0018/0025); szybki profil benchmarku tylko jeśli
  zmiana może wpłynąć na bota.
