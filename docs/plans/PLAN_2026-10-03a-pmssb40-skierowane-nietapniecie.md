# Plan PMSSB-40 — payoffy rzutu II: efekty skierowane i wymiar nietapnięcia (2026-10-03a)

Zadanie: kontynuacja pętli PMSSB (polecenie właściciela „kontynuuj z PMSSB").
Wejście: GRANICE z PMSSB-39 („dynamiczne X, efekty skierowane, `buff_attacking_creatures`
i vigilance Kulratha bez wyceny") + inwentarz kart z katalogu (sonda
`/tmp/pr/inwentarz-pmssb40.mjs`, 18 nóg triggerów rzutu/wejścia na 14 kartach).

## Diagnoza (POMIAR PRZED — sonda `/tmp/pr/probe-pmssb40-przed.mjs`)

| # | Scenariusz | Δ payoffu (PRZED) | Klasa |
|---|---|---|---|
| S1 | Molten Nursery + bezbarwny artefakt (`damage` z `requiresTarget: any_target`) | **0** | bramka `requiresTarget` pomija CAŁY trigger |
| S2 | Goblin Battle Jester + czerwony czar (`cant_block` z `requiresTarget: creature`) | **0** | jw.; wpis `cant_block` w tabeli ETB (`=> 2`) nie ma w katalogu ŻADNEGO konsumenta |
| S3 | Kulrath Mystic + czar MV≥4 (`buff_creature_until_end_of_turn` + `keywords: ['vigilance']`) | 7 (sam pump) | rider vigilance bez wyceny |
| S4 | Steelfin Whale (tapnięty) + artefakt (`untap_permanent` na nosicielu) | **0** | noga spoza `PAYOFF_TABLE_EFFECTS` |

## Model (reuse istniejących miar, L41/L48)

1. **Bramka `requiresTarget` przestaje pomijać trigger.** Wymóg celu JEDZIE do miary
   (`ETB_EFFECT_BONUS[typ](leg, view, req, def)`) — tak jak robi to `etbEnterBonusValue`
   dla triggerów wejścia; brak legalnego celu = 0 (nie kara).
2. **F1 `damage`**: ta sama liczba co ETB-obrażenia (Forge Devil, Reclusive Artificer —
   identyczny kształt „trigger zadaje N obrażeń celowi”): `min(3·N, 15)`.
3. **F2 `cant_block`**: MIARA ŚCIEŻKI RZUTU (`cantBlockRemovalValue`, okno
   „zadeklarowany atak ALBO przed atakiem w mojej głównej"), max po blokerach wroga —
   płaska 2 z tabeli ETB jest w katalogu martwa (L5).
4. **F3/F4 wymiar nietapnięcia** — jedna miara `untappedBodyDefense(host)` =
   `payoffUntappedBodyWeight × min(manaTapBodyMax, wytr. × manaTapBodyPerStat)`
   (reuse drabiny tapnięcia CIAŁA z PMSSB-32; obrona = wytrzymałość):
   - Kulrath: rider `vigilance` doliczany TYLKO gdy nosiciel realnie zaatakuje
     (polityka ataku bota — z dodanym świeżym słowem w symulowanym widoku) i nie ma
     go jeszcze (świeżość M431); po tapnięciu (okno walki) vigilance = 0 (CR 702.20
     nie odkręca atakującego);
   - Steelfin: untap na nosicielu → wartość TYLKO gdy nosiciel jest tapnięty
     (inaczej no-op = 0).
5. Nowe pokrętło: `payoffUntappedBodyWeight` (default 1; ×0 = stan sprzed zmiany).

## Granice (poza modelem, bez kart w katalogu)

-dynamiczne X, `buff_attacking_creatures`, `untap` na CUDZYM celu w triggerze rzutu
(midnight-guard jest poza listą zdarzeń payoffu), blokada wroga poza jedną szansą.

## Weryfikacja

Sonda PRZED/PO (te same 4 scenariusze), `test/audyt-pmssb40-skierowane-nietapniecie.test.js`
(piny czerwone na starym kodzie), mutacje, golden-master (`bot-scoring-snapshot`),
tie-audit PO, `npm test`, `run-tests all`, build. Raport w `docs/PMSSB.md` + rejestr.

## Postęp (procedura 0–7)

- [x] **0. Plan + commit** — ten plik (`5b1195a`, po zdarzeniu środowiska odtworzony jako
  `docs(plan)`), PR-y: praca na gałęzi sesji `arena/01a0fe59-mtg` pod istniejącym PR #151.
- [x] **1. Pomiar PRZED + inwentarz** — sonda `/tmp/pr/probe-pmssb40-przed.mjs` (S1 0 / S2 0 / S3 7 / S4 0),
  inwentarz `/tmp/pr/inwentarz-pmssb40.mjs` (18 nóg / 14 kart) + kontrola zasięgu `inwentarz3.mjs`
  (dwie karty z `requiresTarget`).
- [x] **2. Audyt macierzy** — kierunek × cel × timing × stan: nosiciel (stwór vs inny permanent),
  wymóg celu (creature / any_target / brak), okno (główna 1 / główna 2 / walka / tura wroga),
  stan (tapnięty/nietapnięty, świeżość słowa, choroba przyzwania). Findingi F1–F4 → fale A–E.
  Kontrole obowiązkowe: L41 (ta sama miara w ścieżce rzutu i payoffu), S11 (koszt many — bez zmian,
  brak nowych kosztów), M429 (pokrętło ×0 = dawna wartość).
- [x] **3. Implementacja** — `src/controllers/heuristic-bot.js` (bramka `requiresTarget`, nogi
  `damage`/`cant_block`/`untap_permanent`, `cantBlockPayoffValue`, `untappedBodyDefense`, rider
  `vigilance` w `temporaryPumpPayoff`) + `src/controllers/heuristic-params.js`
  (`payoffUntappedBodyWeight`).
- [x] **4. Testy + mutacje** — `test/audyt-pmssb40-skierowane-nietapniecie.test.js` (17 pinów;
  RED 11/17 przed kodem), mutacje a–f wszystkie RED (różne zbiory pinów); pin PMSSB-39 A5 przesunięty
  o nowy wymiar.
- [x] **5. Ewaluacja** — golden-master hash bez zmian; tie-audit PO 24 partie / 12 556 decyzji
  (26,9% remisów, 9,9% realnych, GROZY 13); mirror-eval 48 meczów 24:24 (0,5000) — brak sygnału
  (B6: karty rodziny nie leżą w taliach wzorcowych); Żywy Tester = właściciel.
- [x] **6. Raport + rejestr** — `docs/PMSSB.md` §PMSSB-40 + wiersz rejestru (DONE 2026-10-03a);
  wpis w `docs/PROJECT_HISTORY.md`.
- [x] **7. Bramy + push** — `npm test` **7449/7449**, `node tools/run-tests.mjs all` **7720/7720**,
  build 70 modułów / 4781,7 kB; commity wypchnięte po każdym zielonym kroku.

## Findingi z audytu macierzy (etap 2)

| # | Noga / wymiar | PRZED | PO | Uzasadnienie |
|---|---|---|---|---|
| F1 | `damage` + `requiresTarget: any_target` (Molten Nursery) | 0 (dwie przyczyny) | 3 × waga (× dyskont permanentu) | ta sama liczba co ETB-obrażenia; pętla po wszystkich permanentach |
| F2 | `cant_block` + `requiresTarget: creature` (Goblin Battle Jester) | 0 | `cantBlockRemovalValue` w oknie ataku | płaska 2 z tabeli ETB martwa w katalogu (L5) |
| F3 | rider `keywords: ['vigilance']` (Kulrath Mystic) | 0 | `untappedBodyDefense` przy świeżości (M431) i oknie ataku | CR 702.20b: nietapnięte ciało po ataku |
| F4 | `untap_permanent` nosiciela (Steelfin Whale) | 0 | `untappedBodyDefense` gdy nosiciel tapnięty | untap nietapniętego = no-op |
