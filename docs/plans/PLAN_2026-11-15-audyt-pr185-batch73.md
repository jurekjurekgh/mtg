# Plan 2026-11-15 — audyt PR #185 (Batch 73) i pętla jakości

Sesja: `arena/4fa65e47-mtg`. Wejście: „Kontynuujemy projekt." bez nazwanego
tematu produktowego. Obowiązuje ADR 0020 (PR na starcie → audyt poprzedniego
scalonego PR → inkrementalne zielone commity) oraz ADR 0021 (pętla domyślna:
audyt → niedokończony plan → pętla jakości). Bez dodawania kart do katalogu
(ADR 0029), bez pełnego B0 (ADR 0018), bez samodzielnego scalania
(ADR 0007/0013) i bez force push (ADR 0020 D).

## Rozpoznanie i punkt zaczepienia

- Bieżący `main`/HEAD: `5df0e968787007934c007ba64a7acf69bd9262f4` (scalenie
  PR #185 z `2026-11-15T13:01:37Z`).
- Audytowany PR #185: baza `0d0a12be680cdf3a2c7757b29edf0a5ec7c5ab9c`
  (scalenie #184), head `12460f1b89214cef162c76c431b14340136bd1fe`.
  REST: **85 plików, +2187/−320, 29 commitów**; lokalny diff zakotwiczony
  `^diff --git ` ma **85 bloków**, zgodnych 1:1 z `pulls/185/files` (L190).
- Zakres PR #185 (wg opisu PR i commitów):
  1. **Batch 73 — 11 kart realnych** (kolekcja 645–655) w `src/cards/card-data.js`
     (+205), `src/cards/mana-costs-data.js` (+11), 10 snapshotów Scryfall,
     wiersze CSV 645–655, regeneracja 32 talii (`tools/generate-plan-decks.mjs`),
     w tym zmiana podziału kolorystycznego Dominarii: `dominaria-brg` +
     `dominaria-wu` → `dominaria-wrg` + `dominaria-ub` (ADR 0024) oraz
     migracja nazwy talii w ~20 testach/narzędziach.
  2. **Nowe ścieżki reguł**: `must_block_enchanted` w `src/engine/effects.js`
     (+10), etykieta `crew` i opis efektu w `src/table/render.js`,
     `reanimate_under_your_control` w `src/table/session.js`.
  3. **PMSSB-89** (audyt scoringu bota dla batcha 73): `heuristic-bot.js`
     (+186/−…), plan `PLAN_2026-11-11-pmssb89-batch73-scoring-audit.md`, sonda
     `tools/pmssb89-batch73-scoring-sonda.mjs`, test
     `test/audyt-pmssb89-batch73.test.js` (91 linii, dodany do `slow`),
     wpis w `docs/PMSSB.md`, regeneracja `test/fixtures/bot-scoring-snapshot.json`.
  4. **Dziedzictwo audytu PR #184** (commity E0–E4, `87465c9`): raport
     `docs/audits/AUDYT_PR184_2026-11-11.md`, mapa 54/54, naprawy F-1..F-4
     (`heuristic-bot.js`, `resources.js`, `session.js`) — scalone w tym samym PR,
     więc podlegają weryfikacji jako część diffu #185.
  5. **Końcowe commity „naprawcze"**: `fix: napraw czerwone CI`
     (dominaria-brg→dominaria-wrg, znaki niełacińskie, test surveil na
     `describeGameEvent`), `ci: retrigger CI`, `fix: usunięto nieistniejące
     zdolności aktywowane z Leonin Lightbringer i Kessig Flamebreather`.
- Własny pomiar bazy na `5df0e96`:
  - `npm test`: **10280/10280, fail 0, skipped 0** (~214 s,
    `.arena/test-fast-baseline.log`),
  - `npm run build`: **79 modułów / 5863,0 kB** (`.arena/build-baseline.log`).
- Przegląd niedokończonych planów na `main` (ADR 0021 pkt 3): jedyny plan bez
  domknięcia merytorycznego to `PLAN_2026-11-11-pmssb89-batch73-scoring-audit.md`
  — sekcja „Final outcome" ogłasza COMPLETED i 12/12 zielonych, podczas gdy
  opis PR #185 (ten sam stan) ogłasza „PMSSB-89: **RED** (7 scoring gaps do
  zamknięcia w kolejnych sesjach)". Rozstrzygnięcie tej sprzeczności pomiarem,
  nie wyborem wersji (L56/L92), jest częścią E1.

## Hipotezy z rozpoznania (do ZWERYFIKOWANIA pomiarem w E1, nie do zapisania jako fakty)

- **H1 — `must_block_enchanted` (Seton's Desire, Threshold) jest martwe:**
  `effects.js` ustawia `mustBlockEnchanted: true` na OBIEKCIE ŹRÓDŁOWYM, a grep
  po `src/`, `tools/`, `test/` nie pokazuje ANI JEDNEGO konsumenta tej flagi
  (komentarz obiecuje egzekucję w `declareBlockers`/ofertach blokowania).
- **H2 — warunek `minGraveyardCards` nie istnieje w silniku:** jedyny wpis to
  definicja karty; `staticConditionHolds` (`permanents.js`) nie ma takiej gałęzi
  i kończy się `return false`, więc zdolność statyczna Seton's Desire nie działa
  wcale (CR 611.3a).
- **H3 — warunek `equipped` nie istnieje w silniku:** `staticConditionHolds` nie
  ma gałęzi `equipped`, więc „As long as this creature is equipped, it gets
  +1/+1" (Leolin Lightbringer) nie jest stosowane.
- **H4 — Necrosavant:** (a) brak bramki „Activate only during your upkeep"
  (`timing` domyślne `instant`), (b) zdolność nie deklaruje `targets`, a
  `reanimate_under_your_control` czyta `targets[0]` — możliwy koszt zapłacony
  bez skutku (L87/L138), (c) Oracle mówi „Return THIS card", nie „target
  creature card".
- **H5 — brak pliku `test/real-cards-batch73.test.js`:** 11 nowych kart nie ma
  testów zachowania (Krok 6 `HOW_TO_ADD_CARD`); pokrycie daje wyłącznie
  generyczny `catalog-coverage` + audyt scoringu PMSSB-89.
- **H6 — snapshoty Scryfall batcha 73 bez klucza `rulings`** (10/10 plików),
  co narusza zasadę „przy kartce" ADR 0028 §2.
- **H7 — plan i rejestr PMSSB-89 opisują karty tekstem niezgodnym z Oracle**
  (m.in. Get the Point jako „deal 2 damage to any target", Might Beyond Reason
  jako „+X/+X", Messenger's Speed jako „+1/+1 and haste", Seton's Desire jako
  „ward {2}", Leonin Lightbringer i Kessig Flamebreather ze zdolnościami
  aktywowanymi, których nie ma) — dokument w `main` kłamie o katalogu (L142).
- **H8 — craft Spring-Loaded Sawblades:** koszt `{3}{W}` bez deskryptora
  „exile another artifact" (porównać z Lodestone Needle i ścieżką
  `craft_transform` — czy wymóg drugiego artefaktu jest w silniku, czy w karcie).
- **H9 — `test/library-manipulation-modal.test.js` (−60 linii)** i regeneracja
  `bot-scoring-snapshot.json` (101 linii): sprawdzić, czy test nie został
  osłabiony, a golden-master zregenerowany bez atrybucji trzech drzew (L124).
- **H10 — generyczność (ADR 0002):** +186 linii w `heuristic-bot.js` z
  komentarzami „Necrosavant pattern" — sprawdzić, czy rozpoznawanie idzie po
  deskryptorach, nie po `cardId`/nazwie.

## E0. Plan i PR na starcie (ADR 0020 A)

- [x] Lektura obowiązkowa w całości: `AGENTS.md` (378 linii), rejestr +
      wszystkie obowiązujące ADR-y (0001–0032, bez archiwalnego 0008),
      `docs/LESSONS.md` (2267 linii, L1–L191), `docs/setup/ENVIRONMENT.md`
      (226 linii), PR #185 (REST: opis, 29 commitów, 85 plików, diff 85/85),
      najnowszy handoff `HANDOFF_2026-11-11.md`.
- [x] Pomiar bazowy `npm test` (10280/10280) i `npm run build` (79 / 5863,0 kB)
      z cichym logowaniem do `.arena/`.
- [x] Zapisanie tego planu, commit na `arena/4fa65e47-mtg` (`dc29482`), push i otwarcie
      PR **#186** przed jakimkolwiek kodowaniem.

## E1. Pełny audyt techniczny PR #185 (ADR 0020 B / ADR 0016)

- [x] Mapa **85/85** plików: `docs/audits/PR185_MAPA_PLIKOW_2026-11-15.md`
      (kotwica `^diff --git ` + porównanie z REST, L190).
- [x] Pobrać dosłowny tekst CR dla każdej reguły, o której będę orzekać
      (ADR 0030): craft (702.140), ward (702.21), threshold (502?/604?),
      wymagania blokowania (508.1d/509.1c), explore (701.44), delirium
      (207.2c), zdolności z grobu (113.6/604.3), „activate only during your
      upkeep" (602.2b/117.1a), LKI i zmiana stref (400.7). Źródło: mirror
      repozytoryjny CR 2026-11-06 (`tools/cr-numery.mjs`,
      `test/helpers/cr-numery-tabela.js`) + `fetch_page` dla brakujących.
- [x] Oracle kontra implementacja dla WSZYSTKICH 11 kart (snapshot
      `docs/cards/scryfall-*.json` jako źródło, ADR 0010 §2/§2a, ADR 0022):
      koszt, typy, P/T, linie tekstu, cele, restrykcje czasowe.
- [x] Weryfikacja H1–H10 sondami headless (repro PRZED naprawą, L11/L68/L111):
      każda hipoteza dostaje mierzalny dowód albo zostaje odrzucona z powodem.
- [x] Audyt testów PR #185 pod kątem RED→GREEN i weryfikacji mutacyjnej (L13):
      `test/audyt-pmssb89-batch73.test.js`, zmienione piny (CR cytaty, batch3,
      M228, M205, D/2), `library-manipulation-modal.test.js`,
      `bot-scoring-snapshot.json`.
- [x] Raport: `docs/audits/AUDYT_PR185_2026-11-15.md` (znaleziska z numerami
      F-1..F-n, dowody, cytaty CR, decyzja „naprawiam / zgłaszam właścicielowi").
- [x] Commit + push (mapa i raport razem, bez zmian w kodzie — bramy bazowe bez zmian).

## E2. Naprawy znalezisk (każda osobnym, samodzielnie zielonym commitem)

Kolejność wg wagi regułowej; każdy krok: **RED test → naprawa u root cause →
GREEN → mutacja kontrolna → `npm test` + `npm run build` → commit + push**.

- [x] E2.1 — H1/H2: Threshold Seton's Desire jako WYMAGANIE blokowania
      (CR 508.1d/509.1c) czytane przy deklaracji bloków i w ofercie/ walidacji
      (jedno źródło, L48), z warunkiem „if able" i bez specjalnego przypadku po
      nazwie karty (ADR 0002). Jeśli pełnego Oracle nie da się zaimplementować
      w tej sesji — karta do `unsupported` (ADR 0022), nie do „prawie działa".
      **Stan (2026-11-15):** ZROBIONE jako F-1 audytu, commit `83a764e` —
      `combat.mustBlockHostCounts`/`blockRequirementCountOf`/`fulfilledBlockRequirements`
      per para, `condition.minGraveyardCards`, martwa gałąź `applyEffect` usunięta,
      `playerView` niesie `blocksIfAble`/`blockRequirementCount` (ADR 0017); 8 testów,
      5 mutacji kontrolnych RED. Pełny Oracle zrealizowany — karta zostaje `supported`.
- [x] E2.2 — H3: warunek `equipped` w `staticConditionHolds` (generyczny:
      „as long as this creature is equipped" = ma przypięty Equipment).
      **Stan (2026-11-15):** ZROBIONE jako F-2 audytu, commit `40727cf` —
      `attachmentsAttachedTo(...).some(isAttachedEquipment)` (aura NIE wystarcza,
      CR 301.5a/303.4b); 3 testy, mutacja RED.
- [x] E2.3 — H4: Necrosavant — bramka upkeep-only jako generyczny deskryptor
      okna aktywacji (nie po nazwie karty), skutek zwracający ŹRÓDŁO z grobu
      (Oracle: „Return this card") i test koszt→skutek (bez „zapłać i nic").
      **Stan (2026-11-15):** ZROBIONE jako F-4+F-9 audytu, commit `1c3aed1` —
      generyczny deskryptor `onlyInStep` w `createAbility` + bramka w
      `abilityConditionFailure` (jedno źródło dla oferty i walidacji, CR 602.1b/602.5);
      regułowa kara `-100` usunięta z heurystyki bota (F-9); nowy strażnik klasowy
      `test/oracle-restrykcje-aktywacji-straznik.test.js` (6 testów) przegląda
      `oracleText` całego katalogu; 3 testy, 2 mutacje RED. Skutek `reanimate_under_your_control`
      zwraca ŹRÓDŁO (test koszt→skutek: poświęcony stwór w grobie, karta na polu bitwy).
- [x] E2.4 — H5: `test/real-cards-batch73.test.js` — legalny + nielegalny +
      sanity dla każdej z 11 kart (wzorzec `real-cards-batch72.test.js`).
      **Stan (2026-11-15):** ZROBIONE — plik ma 52 testy (51 + pin F-10 z E2.12, commit
      `f00e581`: Leonin Lightbringer = ward {2} + statyczny `condition.equipped` bez żadnej
      aktywacji, Kessig Flamebreather = trigger `damage_each_opponent` bez aktywacji): pin danych
      11 wpisów
      kontra snapshoty Oracle + arkusz kolekcji, zachowanie każdej naprawy
      (Kessig, Leonin ×3 + ward ×4, Seton's Desire ×8, Sawblades ×5, Necrosavant ×4,
      Bladewheel ×7) oraz — domknięcie F-11 w kroku E2.9, commit `7e68325` —
      sanity czterech kart bez własnej naprawy: Might Beyond Reason ×5 (delirium
      jako warunek efektu, próg typów nie sztuk, liczone przy rozstrzygnięciu),
      Get the Point ×3 (destroy + scry z decyzją blokującą), River Herald Guide ×6
      (vigilance, explore z lądem/nie-lądem/pustą biblioteką/po śmierci źródła),
      Plummet ×3 (wymóg flying, cel traci flying → `fizzled`, CR 608.2b).
      9/9 mutacji kontrolnych zabitych.
- [x] E2.5 — H6: `rulings` w 10 snapshotach batcha 73 (ADR 0028 §2;
      `fetch_page` → `api.scryfall.com/cards/<set>/<nr>/rulings`, normalizacja
      `tools/fetch-card-rulings.mjs`).
      **Stan (2026-11-15):** ZROBIONE jako F-18 audytu, commit `d77baa2` — 18 wpisów WotC
      w 10 snapshotach (Might Beyond Reason 5, River Herald Guide 6, Spring-Loaded Sawblades 4,
      Get the Point 1, Seton's Desire 1, Necrosavant 1; potwierdzone puste: Messenger's Speed,
      Leonin Lightbringer, Kessig Flamebreather, Plummet), wszystkie z `rulingsSource`
      i `rulingsPobrano`; pokrycie repo 214 → 224 z 652; `keywords` + `color_identity`
      dla 9 z 10 (Plummet jawnie na liście wyjątków — obiekt karty nie dał się pobrać:
      `SignatureDoesNotMatch` proxy, endpoint rulingów odpowiedział); zapis przez
      `normalizeRulings`/`applyRulings` narzędzia (L41), tożsamość kart potwierdzona `oracle_id`.
      Nowy strażnik `test/audyt-pr185-f18-rulingi-batch73.test.js` (4 testy) z częścią
      strukturalną: snapshot z `pobrano` ≥ 2026-10-01 musi mieć `rulings` i endpoint Scryfall
      w `rulingsSource`; 8/8 mutacji kontrolnych RED; bramy 10 380/10 380, build 79/5896,1 kB.
- [x] E2.6 — H7: sprostowanie planu PMSSB-89 i wpisu w `docs/PMSSB.md`
      (Oracle z snapshotów; usunięcie gapów o zdolnościach, których nie ma;
      status zgodny z pomiarem, L92/L142).
      **Stan (2026-11-15):** ZROBIONE jako F-16 audytu, commit `067e6dc` — 7 sprostowań
      w `docs/PMSSB.md` (konwencja: stare zdanie przekreślone + `**SPROSTOWANE 2026-11-15
      (audyt PR #185, F-16…)**` z pomiarem): wiersz tabeli zbiorczej (linia 71), Leonin
      Lightbringer i Kessig Flamebreather opisani jako karty z tap-zdolnościami, których NIE mają
      (Oracle: ward {2} + statyczny `equipped`; trigger `you_cast_noncreature_spell`), punkt
      „Tap-zdolności" (połączony z F-20), „Bramki" (`npm test` 10 280/10 280 i `ability-cost-pips`
      9/9 na stanie końcowym PR — przyczyną czerwieni były FABRYKOWANE zdolności, nie „2
      pre-existing fail"), „Otwarte" (wszystkie 10 kart talio­walnych jest w 9 taliach, nie w
      żadnej) i „Jawne granice". Brakujące wpisy dokumentacyjne dopisane w commicie `a764f63`:
      „2026-11-11 — Batch 73" i „2026-11-15 — Audyt techniczny PR #185" w
      `docs/PROJECT_HISTORY.md` oraz **M464** w `docs/ENGINE_MILESTONES.md`.
- [x] E2.7 — H8/H9/H10 i wszystko, co wyjdzie w E1 ponad listę: naprawa albo
      jawne „nie błąd, bo <cytat CR>" w raporcie (L57: rozbieżność ze
      zgłoszeniem/dokumentem rozstrzyga reguła, nie wygoda).
      **Stan (2026-11-15):** ZROBIONE — z raportu audytu (`docs/audits/AUDYT_PR185_2026-11-15.md`,
      F-1…F-18) zrobione: F-5 Kessig `damage_each_opponent` (`ab8b822`), F-3 język
      deskryptorów celu + strażnik klasowy (`5ccfa46`), F-4+F-9 bramka upkeep (`1c3aed1`),
      F-6 tył TDFC + `tapOtherArtifacts` (`ae24d01`), F-7 kwota `ward {N}` przez
      CAŁĄ ścieżkę danych (`d4e5547` — brakowało czterech dowiązań: `defineCard`,
      `gameObjectDataOf` ×5 gałęzi, lista pól `installDeck`, kontrakt `addObject`;
      oba zgadywania `?? 2` usunięte — w `wardAmountOf` i w `wardTargetTax` bota;
      walidacja `defineCard`: keyword `ward` wymaga dodatniej całkowitej kwoty
      i odwrotnie; 8 + 4 testy, 12/12 mutacji kontrolnych zabitych; bramy
      10 341/10 341, build 79/5891,3 kB, benchmark 10/10), F-8 wycena reanimacji
      z P/T karty (`c6fe973` — helper `graveyardBodyValue` jako JEDNO źródło skali
      `10 + 2P + T` dla gałęzi `cast_spell`, `activate_ability` i aktywacji Z GROBU;
      stałe `10 + (5*2) + 5` usunięte; 6 + 1 testów na kartach syntetycznych tym
      samym deskryptorem, 7/7 mutacji kontrolnych; bramy 10 348/10 348, build
      79/5892,7 kB, benchmark 10/10; sprostowany wpis „Jawne granice" §PMSSB-89).
      F-11 sanity czterech kart batcha + NOWE znalezisko F-19 (`7e68325` — explore
      bez celu nie kładł licznika +1/+1: efekt brał eksplorujący permanent tylko
      z `targets[0]`, a ETB River Herald Guide nie celuje; helper
      `explorerOfExplore(targets, source)` = cel ?? źródło, jedno źródło dla obu
      gałęzi explore, licznik tylko na polu bitwy — CR 701.44a/701.44b/122.1;
      19 testów, 9/9 mutacji; bramy 10 367/10 367, build 79/5893,6 kB, benchmark
      10/10; F-19 dopisany do raportu jako §8 „Znaleziska dodane w trakcie napraw").
      **Dokończone w E2.12/E2.13:** F-13 harness sesji potwierdza pauzy bota, D/2 wrócił na
      seed 9 (`22976e2`; mutacja F13-c PRZEŻYŁA → martwe wywołanie usunięte, L21), F-14
      przywrócony integracyjny pin surveil/FoW na re-hunted seedach 1/7/13 (`6954146`, 4/4
      mutacje, slow 282/282 — L25: re-hunt zamiast kasacji pinu), F-17 kafelek Seton's Desire
      przestał milczeć, a próg Threshold jest brany z danych karty (`18fb76c`, 5/5 mutacji;
      root cause głębszy niż w raporcie: `describeAbility` dla `type==='static'` oddaje
      sterowanie do `describeStatic`, który nie znał `ability.effect`, więc próg drukował się
      dwa razy — L41), F-10 zdublowany blok komentarza PMSSB-89 usunięty, fałszywy „Note:
      Leonin/Kessig" zastąpiony sprostowaniem z cytatem Oracle + pin (`f00e581`, 5/5 mutacji,
      `test/real-cards-batch73.test.js` 52 testy), F-12 próg benchmarku vs aggro 0.63 → **0.69**
      z pomiaru 672 meczów + ślad regeneracji golden-mastera per para (`bfa36d6`), F-15/F-16
      lekcje **L192** („pre-existing" wymaga pomiaru bazy PR) i **L193** (rotacja próbki =
      migracja z czterema śladami) dopisane od razu w formie zwięzłej + kondensacja **24**
      istniejących wpisów `docs/LESSONS.md` (L13, L26, L40, L51, L52, L70, L75, L86, L90, L93,
      L94, L105, L108, L117, L120, L126, L128, L129, L136, L137, L166, L169, L189, L193 —
      pomiar porównaniem treści wpisów PRZED/PO; L91 i L95, wymienione w wiadomości commitu
      `a764f63` z dopiskiem „zachowany", NIE zostały zmienione) pod budżet lektury startowej
      (~99 442 z 100 000 tokenów; numery, daty i tytuły wszystkich 184 lekcji bez zmian,
      7 przykładów przeniesionych 1:1 do `docs/LESSONS_PRZYPADKI.md`) i wpisy Batch 73 +
      audytu w `docs/PROJECT_HISTORY.md` oraz M464 w `docs/ENGINE_MILESTONES.md` (`a764f63`,
      `067e6dc`), F-20 sonda PMSSB-89 miała MARTWY blok main (`import.meta.url ===
      process.argv[1]` nigdy nie zachodzi → pusty stdout i kod 0), guard przepisany na konwencję
      repo, 10 etykiet z Oracle, 3 piny, 7/7 mutacji (`aca6b6b`), F-18 rulingi w 10 snapshotach
      (`d77baa2`, patrz E2.5). Wszystkie znaleziska F-1…F-20 zamknięte; bramy: `npm test`
      **10 380/10 380**, `npm run build` **79/5896,1 kB**, benchmark **10/10**,
      `node tools/cr-numery.mjs` OK.
      H8/H9/H10 z rozpoznania: zweryfikowane sondami w E1 —
      craft i ward działają end-to-end (wadą była ścieżka DANYCH `ward`, czyli F-7),
      sesja przy seed 9 nie jest zepsuta (luką był helper `sesja()`, czyli F-13).

## E3. Pętla jakości (ADR 0021 pkt 4)

- [ ] Żywy Tester na taliach z kartami batcha 73 (`ixalan`, `dominaria-wrg`,
      `mirrodin-wu`, `innistrad-brg`, `theros`, `ravnica-bg`,
      `forgotten-realms-wug`, `worek-legend`, `worek-dziki`) — osie audytu
      z `TESTER_STOLU.md`: sensowność działań bota, kompletność logu/modala,
      ptaszki auto-pass. Wymaga `npm run build` przed każdym pomiarem (L76).
- [ ] Audyty strukturalne: `tools/event-contract-audit.mjs`,
      `tools/bot-tie-audit.mjs`, `tools/scoring-unvalued-audit.mjs`,
      `tools/family-audit.mjs`, `node tools/cr-numery.mjs --cr …`.
- [ ] Szybki profil benchmarku TYLKO jeśli zmieniam wyceny bota
      (`node tools/benchmark.mjs`, ~2–4 min); pełne B0 wyłącznie na komendę
      właściciela (ADR 0018).

## E4. Bramy i domknięcie sesji

- [ ] `npm test` (szybki rdzeń) i `npm run build` zielone po każdym commicie.
- [ ] `npm run test:all` (brama PR) z cichym logowaniem i zapisem liczb.
- [ ] `docs/PROJECT_HISTORY.md` + `docs/setup/HANDOFF_2026-11-15.md`
      (stan, decyzje, kolejka) + aktualizacja opisu PR kumulatywnie.
- [ ] Lekcje: nowe wpisy do `docs/LESSONS.md` TYLKO jeśli klasa jest nowa;
      pilnować budżetu lektury ~99,7k/100k (strażnik
      `test/dokumentacja-budzet-lektury.test.js`) — nowy wpis płaci
      skróceniem innego.
- [ ] Blok przekazania projektu w czacie (ADR 0013 §2). Nie scalam PR.

## Ryzyka i pułapki

- **Budżet lektury ~99,7k/100k:** zero nowych wpisów w `AGENTS.md`/ADR/
  `LESSONS.md`/`ENVIRONMENT.md` bez równoczesnego skrócenia; wnioski batcha
  mają się mieścić w istniejących klasach (L5, L21, L41, L48, L87, L107, L138).
- **Zmiana regułowa bez cytatu CR jest zakazana** (ADR 0030): pamięć treningowa
  nie jest źródłem; każda asercja regułowa dostaje dosłowny cytat w komentarzu.
- **Nie „naprawiam" testu, żeby zzieleniał** (L5/L13/L181): pin cementujący
  błąd aktualizuję razem z kodem i z komentarzem o intencji.
- **Ciche testy i zamrożone drzewo:** `> .arena/*.log 2>&1` + `rc=$?`, bez `tee`
  i bez `| tail`; podczas bramek nie edytuję drzewa (L174).
- **Zakaz force push** (ADR 0020 D): przed każdym pushem `git status`,
  `git log --oneline -3`, `git fetch origin arena/4fa65e47-mtg` i porównanie
  `HEAD..FETCH_HEAD` / `FETCH_HEAD..HEAD`.
- **Proweniencja katalogu** (ADR 0029): nie dodaję kart „na nośnik mechaniki";
  brak nośnika → karta syntetyczna w teście.
- **Talie generuje generator** (ADR 0023/0024): `decks/*.txt` tylko przez
  `node tools/generate-plan-decks.mjs`; `test/repo-decks.test.js` pilnuje 1:1.
