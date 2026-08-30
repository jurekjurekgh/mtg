# PLAN 2026-08-30 — M258: audyt PR #88 i pętla jakości (sesja arena/01a0526d)

**Sesja:** `arena/01a0526d-mtg`. **Baza:** `main` @ `1605b56` (squash PR #88).
**Prompt:** „kontynuujemy projekt" — brak nazwanego tematu → ADR 0021 (pętla
domyślna: PR na starcie → audyt poprzedniego PR → niedokończony plan → pętla
jakości). **Zasady:** ADR 0020 (PR przed kodowaniem, audyt przed nową pracą,
inkrementalne commity, zakaz force push), ADR 0022 (pełny Oracle albo brak
wsparcia), ADR 0018/0025 (pełny benchmark tylko na komendę właściciela).

## Pomiar startowy

- `npm test` (szybki rdzeń): **3801/3801 pass** (~135 s), 0 fail.
- `npm run build`: OK, `dist/mtg-table.html` = **56 modułów / 2934.0 kB**
  (zgodnie z ostatnim wpisem PR #88 — etap E/F: 2934.0 kB).
- Gałąź sesji istnieje lokalnie, czysty working tree; repo po `--unshallow`
  (pełna historia, diff audytu dostępny: `git diff 15a2be5 1605b56`).

## Zakres PR #88 (do zaudytowania, squash `1605b56`, 95 plików, +5574/−268)

Audyt PR #87 (A2 strażnik L16, D1 README, D5 JSDoc) + pętla jakości M257
(K4 transform w panelu, K5 DFC tył→przód przy zmianie strefy CR 711.4a) +
uwagi z testów r1–r5b (Rupture Spire pay-or-sacrifice, Squire's Lightblade,
Morph FoW w warstwie ilustracji, kolejność menu działań, Greatsword of Tyr
`Equip {W}`, ninjutsu z pipami kolorów F3, kafel „enters with a counter" F1,
hover Scryfall, blok pod presją życia, Bone Splinters osobne wybory,
„Tasuj talię", LOSOWY STARTER CR 103.7a, Awaken the Sleeper, Ruthless
Invasion) + r4/r5b (auto-deklaracja atakujących CR 508.1, strojenie rodziny
aura, mulligan-bottom auto CR 504.1, regenerate jako combat trick) +
E/F pętli jakości. **Brak nowego batcha kart** — audyt kart nie dotyczy
definicji, ale dotyczy mechanik i danych ruszonych pośrednio.

## Etap 1 — audyt PR #88 (ADR 0020 B / ADR 0016)

### Kroki

- [ ] **1.1** Przegląd całego diffa `src/` (21 plików, +817/−151) po osiach:
      poprawność vs CR, generyczność (ADR 0002 — zero warunków po nazwie/ID
      karty), spójność oferta↔walidacja (L48/L90), kompletność PlayerView
      (ADR 0017), dowiązania nowych pól (L84), brak globali Node w kodzie
      artefaktu (L58).
- [ ] **1.2** Weryfikacja wąskich miejsc regułowych z PR #88:
      - K5: `frontFaceId` przez cały łańcuch (deck → installDeck → addObject
        → createGameObject) + reset twarzy w `moveObjectDirectly`
        (CR 711.4a/711.7; LKI CR 603.10);
      - LOSOWY STARTER: `state.starterId` — CR 103.7a/103.4 przymocowane do
        startera (nie `players[0]`); determinizm (ten sam seed = ten sam
        starter);
      - E: auto-rozstrzygnięcie mulligan-bottom przy `ręka <= count`
        (wzorzec CR 504.1/508.1) — czy nie zjada decyzji, gdy wybór NIE jest
        wymuszony;
      - F: regenerate — usunięcie gałęzi B3 i okno combat_damage (ślad zdarzeń
        przed `resolve_combat`);
      - Greatsword of Tyr: `equipment.colors` → oferta i PŁATNOŚĆ tym samym
        filtrem (L48);
      - F3: ninjutsu z pipami kolorów — oferta i płatność;
      - r5 C: Bone Splinters — osobne wybory (wizard) vs walidacja engine.
- [ ] **1.3** Weryfikacja mutacyjna RED→GREEN kluczowych nowych testów
      (wybór ≥5 plików): `audit-m257-fixes` (K5), `m257r5b-uwagi-testow`
      (starter), `m257ef-znalezione-petla` (E/F), `m257r5-uwagi-testow`,
      `m257r4-zyjwy-tester` (F3/F1), `m257-uwagi-z-testow` (pay-or-sacrifice).
- [ ] **1.4** Regresja bota bez pełnego B0: `node --test
      test/bot-benchmark.test.js` (~2 min) + ewentualnie szybki profil
      `node tools/benchmark.mjs` (~2–4 min) — progi wg
      `test/bot-benchmark.test.js`.
- [ ] **1.5** Strojenie bota z PR #88 (aura `auraHostileEnemyBase` 55→65,
      tarcza 60 w combat_damage, wyceny r5b): sprawdzić golden-master
      (`test/bot-params.test.js`, snapshot) i zgodność z zasadą ADR 0002
      (parametry deskryptorowe, nie po nazwie karty).
- [ ] **1.6** Raport: `docs/audits/AUDYT_PR88_<data>.md` + wynik w opisie PR;
      potwierdzone znaleziska naprawiam od razu (osobne commity).

### Kryteria ukończenia Etapu 1

- Każdy zmieniony plik `src/` z PR #88 przeglądnięty z opinią (tabela w
  raporcie); testy mutacyjne wykonane z zapisem wyników; benchmark slow
  zielony; raport w repo i w opisie PR.

## Etap 2 — pętla jakości (ADR 0021 pkt 4)

- [ ] **2.1** **K2 z audytu M257** (kosmetyka, kandydat wskazany w PR #88):
      kafel tylniej strony DFC na polu bitwy pokazuje koszt „0" — poprawka
      wg CR 711.4b (koszt/CMC tyłu = koszt przedniej strony obiektu); root
      cause w jednym odczycie (L41), test pinujący.
- [ ] **2.2** Żywy Tester z perspektywy gracza na pulu kart **niewidzianych**
      dotąd w audytach (pula = artId w `src/cards/card-data.js` vs
      `tools/collection-art-ids.csv`, po wykluczeniu pul już przepartionych:
      Innistrad, forgotten-realms, Warhammer, tarkir/wiedzmin/theros/
      basnie/legendy); profile `explorer/greedy/defensive/impatient/random`,
      osie z `docs/setup/TESTER_STOLU.md`. Transkrypty poza repo (konwencja
      M253). Wymaga `npm run build` przed pomiarem (L76) i `npm i` w
      `tools/table-tester`.
- [ ] **2.3** Polowanie na niezgodności z CR (odznaka) innymi ścieżkami niż
      sesja poprzednia (L11: niespójności między podobnymi implementacjami,
      skan strukturalny; L72: przegląd rodzeństwa). Kandydaci: rodzina
      „pay or sacrifice / optional pay" (po fixie Rupture Spire), rodzina
      zmiany stref DFC (po K5), rodzina startera/CDM (po r5b B).
- [ ] **2.4** Naprawy u root cause + testy (najpierw RED, potem GREEN;
      weryfikacja mutacyjna L61), aktualizacja `docs/PROJECT_HISTORY.md`
      i `docs/LESSONS.md` (jeśli nowa klasa pułapki).

### Kryteria ukończenia Etapu 2

- ≥1 runda Żywego Testera z pełnym raportem (znaleziska/fałszywe alarmy
  zamknięte L57); potwierdzone błędy naprawione z testami; `npm test` +
  `npm run build` zielone po każdym commicie.

## Kolejność commitów (plan)

1. PLAN (ten plik) + push + otwarcie PR (ADR 0020 A).
2. Raport audytu PR #88 (+ ewentualne naprawy znalezisk — każdy osobno).
3. Fix K2 (DFC tył koszt) — osobno.
4. Pętla jakości: znaleziska → fixy osobno (każdy zielony).
5. Domknięcie: PROJECT_HISTORY + handoff + opis PR (kumulatywnie).

## Ryzyka i pułapki

- **Sandbox reset** (ENVIRONMENT §2): push po każdym zielonym kroku; przed
  pushem `git log --oneline -3` + `git status` + porównanie z remote.
- **L76:** Żywy Tester mierzy `dist/` — `npm run build` po każdej zmianie.
- **L57:** każde podejrzenie z transkryptu najpierw weryfikuję w Oracle
  (`docs/cards/scryfall-*.json`) / CR, zanim dotknę kodu.
- **L48/L90:** przy audycie każdej naprawy sprawdzam obie strony (oferta +
  walidacja) i KOLEJNOŚĆ bramek.
- **L61:** test regresyjny dopiero po pokazaniu go czerwonym (mutacja/stash).
- **Pełny B0 nie odpalam** (ADR 0018/0025) — wystarczy próbka szybka/slow.
- **D3/D4** (decyzje właściciela z audytu PR #87) — pozostają otwarte; nie
  dotykam ADR-ów bez decyzji.
- `edit_file` psuje polskie znaki — edycje plików PL przez `python3`
  (ENVIRONMENT §4).

## Podsumowanie wykonania

_(dopisane na końcu sesji)_
