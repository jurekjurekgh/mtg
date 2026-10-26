# PLAN 2026-10-26c — kontynuacja: audyt PR #175 i pętla jakości

**Zlecenie:** „Kontynuujemy projekt." Brak nazwanego tematu → obowiązuje pętla
domyślna wg ADR 0020 i ADR 0021.

**Gałąź:** `arena/3e188a7c-mtg` (od `main` @ `d7150b1` = squash PR #175).
Jeden PR sesji, kumulatywny opis.

## Stan bazowy (zmierzony 2026-10-26, po scaleniu PR #175)

- lektura obowiązkowa w całości: `AGENTS.md`, rejestr ADR + ADR 0001–0030,
  `docs/LESSONS.md` (2268 linii, L1–L189), `docs/setup/ENVIRONMENT.md`,
  `docs/setup/HANDOFF_2026-10-26b.md`;
- `npm test` (cicho, `.arena/test-base.log`): **8856/8856 pass**, 0 fail,
  ~156 s. Handoff PR #175 podaje 8852 — różnica to 4 piny
  `test/uwaga-w-delve-wygnanie-w-logu.test.js` dopisane PO handoffie
  (commit `50c1243`), więc handoff/README mają liczby sprzed ostatniego
  commita sesji (L92 — sygnał do odświeżenia w domknięciu);
- `npm run build`: **76 modułów / 5443,3 kB** (handoff: 5442,8 kB — ta sama
  przyczyna: ostatni commit PR #175);
- brak otwartych PR-ów; najnowszy plan na `main`
  (`PLAN_2026-10-26b-audyt-pr174-petla-jakosci.md`) ma 0 nieodhaczonych
  kryteriów (grep `- [ ]`).

## Etapy i kryteria ukończenia

### Etap 0 — rozpoznanie i plan

- [x] Kryterium: powyższy stan bazowy (zmierzony, nie przepisany z handoffu)
      + ten plik. Brak zmian w `src/`.

### Etap 1 — PR na starcie (ADR 0020 A)

- [x] Osobny commit z tą roadmapą, push na gałąź sesji, otwarcie PR do `main`
      z szablonu opisu **przed** pierwszą zmianą kodu.

### Etap 2 — techniczny audyt scalonego PR #175 (ADR 0020 B / 0016 / 0030)

Zakres: 5 plików zmienionych w squash `d7150b1`
(`gh pr diff 175`, 624 linie):

| Plik | Rola |
|---|---|
| `src/table/session.js` | naprawa funkcjonalna: opis `object_moved` z `delve: true` |
| `test/uwaga-w-delve-wygnanie-w-logu.test.js` | 4 piny (W/1–W/4) |
| `docs/audits/AUDYT_PR174_2026-10-26.md` | raport audytu poprzedniej sesji |
| `docs/plans/PLAN_2026-10-26b-*.md` | roadmapa poprzedniej sesji |
| `docs/setup/HANDOFF_2026-10-26b.md` | handoff poprzedniej sesji |

Pytania audytowe (każde z odpowiedzią w raporcie):

1. **Kompletność ścieżek:** czy `delve: true` jest emitowane przez OBIE
   ścieżki rzutu (`castSpell` i `castPermanent`, CR 702.66a) — i czy opis
   dociera do logu stołu ORAZ modalu „Rozgrywka" (dwie warstwy, L99)?
2. **Kolejność gałęzi:** czy `e.delve` może współwystępować z `e.escape` /
   `e.additionalCost` (wtedy opis kłamie o koszcie)?
3. **FoW:** czy opis nie ujawnia niczego, co nie jest jawne (cmentarz, CR 400.2)?
4. **Jakość pinów (L29/L13):** czy piny czerwienieją po cofnięciu naprawy
   i czy nie przepuszczają surowego `cardId` (fallback `?? id` w `nameOf`)?
5. **Liczby dokumentacji (L92):** czy handoff/README niosą stan PO ostatnim
   commicie PR (#175 deklaruje 8852/5442,8 kB, a drzewo ma 8856/5443,3 kB)?

Kryterium: raport `docs/audits/AUDYT_PR175_2026-10-26.md` w repo + co najmniej
3 mutacje RED/GREEN + każdy zmieniony plik oceniony. Bramka: `npm test` +
`npm run build` zielone.

- [x] **WYKONANE** — `docs/audits/AUDYT_PR175_2026-10-26.md`: 5/5 plików
      ocenionych; mutacje M1 (gałąź `e.delve`) i M2 (flaga `delve: true` w
      emisji) — obie RED (W/1, W/2, W/4). Znaleziska: **F-1** (oś „modal"
      niedomknięta dla płatności człowieka — `isMainLogEvent` zna tylko
      `additionalCost`), **F-2** (piny przepuszczają surowy `cardId`, L29),
      **F-3** (liczby README/handoffu sprzed ostatniego commita PR, L92).
      Werdykt: APPROVE z zastrzeżeniem.

### Etap 3 — naprawy znalezisk audytu (osobne zielone commity)

- [x] Każde znalezisko: test RED → naprawa u root cause → GREEN.
      Oczekiwane kandydaci (potwierdzić w audycie, nie zakładać):
      pin W/1–W/2 dopuszczający surowy `cardId`, liczby w README/handoffie
      po ostatnim commicie PR #175.
- [x] **F-1** (`cc5d49e`): jedno źródło klasy „wygnanie jako płatność kosztu"
      — `isCostPaymentZoneMove` (session.js) karmi OPIS i BRAMKĘ logu;
      predykat = `object_moved && (additionalCost || escape || delve)`.
      Pin `test/audyt-pr175-koszt-wygnania-w-panelu.test.js` P/1–P/3
      (panel człowieka + klasa bramki + anty-over-fix dla zwykłej zmiany
      stref). Mutacje: M3 (bramka `additionalCost`-only) → P/1, P/2 RED;
      M4 (predykat bez `delve`) → P/1, P/2 RED; M5 (predykat bez `escape`)
      → P/2 RED.
- [x] **F-2** (`34b1b9e`): piny W/1–W/2 nazywają KARTĘ (`/Goblin Piker/`)
      i odrzucają surowy `cardId` (`doesNotMatch /goblin-piker/`, L29).
      Mutacja M6 (surowe `e.object?.cardId` w gałęzi Delve) → W/1, W/2, W/4
      RED; wcześniejszy luźny regex przy tej samej mutacji był GREEN, czyli
      pin był niedomiarowy.
- [x] **Weryfikacja `escape`** (pozycja otwarta z audytu): gałąź opisu
      istnieje — `src/table/session.js:1233`
      („… zostaje wygnane (koszt Escape)"), nazywa kartę przez `nameOf(...)`;
      predykat bramki (session.js:362) obejmuje `escape === true`. Sprawdzone
      mutacją M5 (patrz F-1) — bez `escape` w predykacie P/2 czerwienieje.
- [x] **F-3** (liczby README/handoff) — domknięte w Etapie 5: README
      i `HANDOFF_2026-10-26c.md` niosą stan PO ostatnim commicie
      funkcjonalnym (`8863/8863`, `268/268`, `76 modułów / 5444,4 kB`,
      benchmark quick 672 / 87,8%), a ręczny grep potwierdził brak
      historycznych liczb w bloku „Status”.

### Etap 4 — pętla domyślna (ADR 0021 pkt 4)

Bez nowego batcha kart (ADR 0029).

- [x] **Żywy Tester:** 4 partie (`--steps 400 --quiet`), partie ukończone
      naturalnie; trzy osie audytu (`docs/setup/TESTER_STOLU.md`), ręczna
      lektura transkryptów.
      Seed 8101 tarkir-bg / dominaria-brg (explorer), 8102 alara /
      warhammer-ubr (defensive), 8103 eldraine / ixalan (hoarder),
      8104 the-edge / zendikar-wu (impatient) — wszystkie EXIT 0, partie
      zakończone (3 wygrane bota, 1 gracza), „DETEKTORY: brak zgłoszeń",
      0 linii błędu. Osie: (1) log bez surowych `cardId`/`undefined` —
      czysto; (2) brak powtarzających się akcji — jedyne powtórzenia to
      spodziewany szum („Dalej (pass)"), deklaracje ataku i „Wznów grę
      bota"; (3) każdy ruch bota uzasadniony w transkrypcie — bez
      „martwych" ruchów poza `pass_priority`.
- [x] **Analizatory:** `event-contract-audit` (0 naruszeń),
      `family-audit` (0 naruszeń), `scoring-unvalued-audit` (12 partii,
      0 niewycenionych), `scoring-pay-census` (brak decyzji zapłat
      w próbce — jawny „brak danych", nie „czysto"), `scoring-choice-space`
      (1 decyzja `resolve_damage_assignment`, brak wariantów >1).
      `scoring-mulligan-audit`: **EXIT 1 → znalezisko F-M1/F-M2**
      (patrz niżej). `bot-tie-audit`: 24 partie / 12 621 decyzji, remisy
      `tie_top` 621 (4,9 %), z czego 436 to pary „brak akcji" silnika
      (`block[]`/`attack[]` vs pass) — nadwyżka oferty, nie dylemat;
      **185 remisów między realnymi wariantami** (9,8 % decyzji akcyjnych)
      — bez ani jednego przypadku `tie_all` (silnik zawsze rozstrzyga).
- [x] **F-M1/F-M2** (`fix(tools)`): metryka audytu mulliganu liczyła CUDZĄ
      (ukrytą) rękę jako własne czary i karała rękę 2 lądy + czar 3 many.
      Reguła przeniesiona do `tools/mulligan-keep-criterion.mjs`, pin
      `test/audyt-pr175-mulligan-kryterium.test.js` M/1–M/4; mutacje
      M7 (`> lądy`) → M/2 RED, M8 (brak filtra ręki) → M/1, M/2 RED.
      Po naprawie: 26 partii / 65 decyzji / **0 naruszeń** (EXIT 0).
      Polityka bota BEZ zmian — to była wada pomiaru (L118/L119), nie bota.
- [x] **Polowanie CR (nowa ścieżka):** poprzednie sesje sprawdziły
      510/704/104 oraz 613/603/704. Ta sesja: **CR 614 (efekty zastępcze)
      + CR 616 (interakcja efektów zastępczych)** oraz CR 106/601.2
      (płatność many) — z dosłownym cytatem CR i pinem SHA-256 (ADR 0030).
      Źródło: mirror `nwgarne/mtg-data`, `rules/cr-raw.txt`, blob
      `4dc4fead596288be1ca6aa9c913ea1739c680a29`, wydanie 2026-09-25,
      SHA-256 pliku `8d860e451f20f38865b725b42d82feb714c725373dd8f3b32b8652b3eeb070ca`
      — godzi się z `rules/manifest.json` (`sha256_raw`), czyli pin ADR 0030
      domknięty po obu stronach (manifest + przeliczony hash).
- [x] Każde znalezisko: repro headless → naprawa u root cause → pin
      z cytatem + mutacja RED (L11/L13/L44). **W tej ścieżce brak nowych
      znalezisk kodu** — mapa zgodności niżej (§4a).

#### 4a. Mapa zgodności CR 614/616/106 (cytat → kod)

| CR (dosłownie) | Wymóg | Kod / dowód |
|---|---|---|
| 616.1 „the affected object's controller (or its owner if it has no controller) or the affected player chooses one to apply" | wybór należy do kontrolera obiektu | `src/engine/destruction.js:29-31` — `pendingReplacementChoice.playerId = object.controllerId` |
| 616.1 „choices are made in APNAP order" | kolejność decyzji APNAP | `destruction.js:16-19` — `rank()` liczony od gracza aktywnego, sort rosnący |
| 616.1e „Any of the applicable replacement and/or prevention effects may be chosen" | przy >1 opcji gracz wybiera | `destruction.js:27-35` — `options` (regeneracja / tarcza / umbra) → komenda `resolve_replacement_choice`; jedna opcja stosowana automatycznie |
| 616.1f „this process is repeated … until there are no more left to apply" | łańcuch efektów zastępczych | `expandArmor` (`destruction.js:72-78`) dopisuje nowo stosowalne id i pętla wraca do wyborów |
| 614.5 „A replacement effect doesn't invoke itself repeatedly; it gets only one opportunity" | jedno zastosowanie na zdarzenie | `work.choices[id]` zapisywane raz; tarcza/kontrola zużywana raz na zniszczenie (`regeneratePermanent` konsumuje JEDNĄ tarczę — pin E8/B1) |
| 614.6 „If an event is replaced, it never happens" | brak zdarzenia bazowego | brak `permanent_destroyed` dla `regenerate`/`shield`/`umbra:` — emisja tylko dla `choices[id] === 'destroy'` |
| 614.7a „If a source would deal 0 damage, it does not deal damage at all" | 0 obrażeń to brak obrażeń | log: `session.js:1540` (`if (e.amount <= 0) return null`); triggery: każda gałąź `damage_dealt` filtruje `amount > 0` (triggers.js:3068, 3124, 3142, 3246) |
| 106.4 / 500.4 „Each player's mana pool empties at the end of each step and phase" | czyszczenie puli per krok i faza | `game-state.js:6145-6160` — `mana`, `manaPool`, `restrictedPool`, `treasureMana`, `artifactOnlyMana` zerowane na wejściu w każdy krok/fazę |
| 601.2 (koszt całkowity) | płatność many/kosztów przed „cast" | ścieżka `resources.js:1827` + `isCostPaymentZoneMove` (F-1) — jedna klasa dla many i wygnania jako kosztu |

Poza zakresem kolekcji (nie „bug", tylko granica — ADR 0022/0029): 616.1b
(zmiana kontrolera przy wejściu), 616.1c (kopia „as it enters"), 616.1d
(wejście tylną stroną) i 614.15/616.1a (efekty self-replacement) — brak
kart z kolekcji właściciela, które ich wymagają.

### Etap 5 — domknięcie sesji

- [x] Bramy: `npm test` **8863/8863** (EXIT 0, log `.arena/test-m.log`),
      `npm run build` **76 modułów / 5444,4 kB**,
      `node tools/benchmark.mjs` quick — 672 mecze, heuristic **87,8%
      (590/672)**, aggro 21,4%, random 3,0% (bez zmian względem bazy;
      `--full` nieuruchamiany — ADR 0018).
- [x] Odświeżone LICZBY w `README.md` (stan bieżący: PR #176, 8863/8863,
      5444,4 kB), `docs/ROADMAP.md` (sesja nie zmienia roadmapy —
      brak wpływu), wpis w `docs/PROJECT_HISTORY.md` (sekcja 2026-10-26c
      + uzupełniona brakująca sekcja 2026-10-26b), handoff
      `docs/setup/HANDOFF_2026-10-26c.md`, plan odhaczony, opis PR
      zaktualizowany kumulatywnie.

## Planowana kolejność commitów

1. `docs(plan)` — ten plan + otwarcie PR.
2. `docs(audyt)` — raport audytu PR #175 (+ odhaczone Etapy 0–2).
3. `fix(...)` × N — po jednym na znalezisko audytu (test + kod + pin).
4. `fix(...)`/`docs(...)` × M — znaleziska pętli jakości.
5. `docs` — domknięcie: liczby, historia, handoff, opis PR.

## Ryzyka i pułapki (z rejestru lekcji)

| Ryzyko | Obrona |
|---|---|
| Reset sandboxa | commit + push po KAŻDYM zielonym kroku; ADR 0020 D |
| Mutacja „zielona" = martwy pin | mutuj DOKŁADNY blok (`sed -n` przed zmianą), przywracaj kopią z `.arena/` (L34/L136/L159) |
| Błędna interpretacja CR | dosłowny cytat z bieżącego wydania CR (ADR 0030, L164/L165) |
| Testy zalewające czat | zawsze `> .arena/*.log 2>&1` (ENVIRONMENT §5a) |
| Pełny benchmark | tylko `node tools/benchmark.mjs` (quick), nigdy `--full` (ADR 0018) |
| Nowe karty z inwencji | ADR 0029 — katalog rośnie wyłącznie z kolekcji właściciela |
| Pin przepuszczający fallback nazwy | asercja na nazwę z rejestru, zakaz `cardId` w opisie dla gracza (L29) |
| Budżet LESSONS | wpis Przypadek/Reguła/Strażnik, proza do LESSONS_PRZYPADKI.md |
