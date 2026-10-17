# Plan — batch 68 (kolekcja 400–411), 10 kart

**Gałąź:** `arena/4fcdc89b-mtg` · **PR:** #167 (ten sam PR sesji, opis uzupełniany kumulatywnie)
**Zlecenie właściciela (2026-10-17):** lista 10 wpisów z artId 400–411. Plan każdej karty
(`Plan`) przepisujemy z listy 1:1 (wiążące, `HOW_TO_ADD_CARD.md` — sekcja „Zanim zaczniesz").
Zlecenie: **wszystkie karty w 100%** (`supported`), brakujące mechaniki dokodowujemy generycznie
(ADR 0002), z ręcznym strojeniem scoringu bota dla nowych mechanik.

## Lista kart

| artId | karta | set | plan (lista) | typ | mechaniki |
| --- | --- | --- | --- | --- | --- |
| 400 ECL | Kulrath Zealot | ECL | Lorwyn | Creature 6/5 R | ETB: exile top, play until end of your next turn; basic landcycling {1}{R} |
| 402 KTK | Bloodfire Expert | KTK | Tarkir | Creature 3/1 R | prowess |
| 404 DMU | Meteorite | DMU | Dominaria | Artifact {5} | ETB: 2 damage to any target; {T}: any color |
| 405 BRO | Raze to the Ground | BRO | Dominaria | Sorcery {2}{R} | **can't be countered** (także wobec warda); destroy target artifact; if its MV ≤1, draw |
| 406 THS | Stymied Hopes | THS | Kaldheim | Instant {1}{U} | counter unless its controller pays {1}; scry 1 |
| 407 M21 | Secure the Scene | M21 | Ravnica | Sorcery {4}{W} | exile target nonland permanent; **its controller** creates a 1/1 Soldier |
| 408 SNC | Halo Scarab | SNC | New Capenna | Artifact Creature 2/1 {2} | {2}, exile from graveyard: Treasure |
| 409 M19 | Child of Night | M19 | Warhammer Fantasy | Creature 2/1 B | lifelink |
| 410 CLB | Austere Command | CLB | Kaldheim | Sorcery {4}{W}{W} | **choose two** modes: destroy all artifacts / enchantments / creatures MV ≤3 / MV ≥4 |
| 411 SOM | Neurok Invisimancer | SOM | Mirrodin | Creature 2/1 U | **stały „can't be blocked"**; ETB: target creature can't be blocked this turn |

## Stan silnika (zmierzony przed zmianami)

- Istnieje już: `exile_top_playable_until_next_turn`, basic landcycling (Fiery Fall), prowess,
  lifelink, `counter_spell_unless_pays` (Abstruse Interference), `scry`, `add_mana` z kolorami
  WUBRG (Meteorite), `any_target`, `cant_be_blocked` (ETB/zaklęcie), `create_token` z kontrolerem
  zdarzenia, zdolność z cmentarza z kosztem `exileFromGraveyard` (Goldmeadow Nomad), `exile_all`
  z filtrem typów i `manaValueAtMost` (Ruinous Rampage), `drawPlayerCards`.
- **Brak — do zbudowania generycznie:**
  1. czar „can't be countered" (flaga na czarze; kontra i ward nie mogą go zniszczyć),
  2. `destroy_permanent` z warunkiem „jeśli jego wartość mana była ≤ N, dobierz kartę" (wartość z chwili zniszczenia),
  3. token dla **kontrolera celu** (`create_token` z `controllerOfTarget`, kontroler zapisany przed wygnaniem),
  4. stały „can't be blocked" na permanencie (statyczna zdolność; `combat.js`),
  5. `destroy_all` z filtrem (typy, MV ≤ N / ≥ N) — wzorzec `exile_all`,
  6. **wybór wielu trybów** (`chooseModes: N`): komenda niesie listę indeksów; oferta = każda
    kombinacja N różnych trybów; tryby bez celów (Austere ma wyłącznie tryby bez celów).
- Uwaga (sprostowana 2026-10-17): karta Vandalize JEST w katalogu i w silniku (DTK 165, „Choose one or both —"
  — artefakt / ląd / oba; `card-data.js` `vandalize`, tryby 3 pozycje, klasa A w inwentarzu CM/2). Wcześniejsza wersja
  tej uwagi („nie ma Vandalize") była BŁĘDNA. Ruinous Rampage to „Choose one —" (jeden tryb). Wybór „dwóch" w tej partii
  dotyczy wyłącznie Austere Command (prawdziwe „choose two").

## Etapy

- [x] **G0 — plan + słownik kolekcji** (ten commit): 10 wierszy w `tools/collection-art-ids.csv`.
- [x] **G1 — pobranie danych**: snapshoty Scryfall (`set=`) + rulingi (ADR 0028) — w `.arena/batch68/`
      (katalog roboczy, poza repo; wchodzą do repo razem z definicjami).
- [x] **G2 — mechaniki silnika** (M1–M6 zrobione; M7 — landcycling, zdolność z cmentarza za koszt many, Skarb i mana dowolnego koloru — pilnowane asercjami kształtu w `real-cards-batch68` (commit `5e75a41`), bez nowego silnika) (po jednym commicie na mechanikę, każda z testem RED→GREEN
      na kartach SYNTETYCZNYCH w pliku testu, ADR 0029).
- [x] **G3 — definicje 10 kart** + snapshoty + `artId` + generator talii (`node tools/generate-plan-decks.mjs`).
- [x] **G4 — testy** `test/real-cards-batch68.test.js` (legalny, nielegalny, sanity danych).
- [x] **G5 — 4 dowiązania nowych deskryptorów** (EVENT_TYPES, etykieta PL, wycena bota, gameObjectDataOf/installDeck).
- [x] **G6 — bot**: wycena nowych mechanik (ręczne strojenie, PMSSB-style) + pomiar.
- [x] **G7 — bramy**: `npm run test:all` 8615/8615 na `8d9fcc3`; `npm run build`; `cr-numery`. Dokumentacja (PROJECT_HISTORY, ENGINE_MILESTONES, HANDOFF) — w osobnych commitach po tym punkcie.

## Stan końcowy i odstępstwa od planu (2026-10-17)

Wszystkie 10 kart `supported` z pustym `limitations`. Dowody (`.arena/batch68/`):
- `npm run test:all` na `8d9fcc3`: **8615/8615**, EXIT=0 (log `test-all-final.log`, poza repo).
  Wcześniejsze przebiegi: `npm test` (fast) 8341/8341; `test:all` 8605/8608 przed poprawkami F3/golden-master.
- `npm run build`: 74 moduły. `node tools/cr-numery.mjs`: OK (530 numerów, 5845 cytatów).
- `test/real-cards-batch68.test.js` 24/24, `test/batch68-mechaniki.test.js` (ADR 0029),
  `test/bot-quality-batch68.test.js` 7/7 (zachowanie bota, G6).

Odstępstwa — świadome, każde z uzasadnieniem:
1. **M6 (wybór dwóch trybów) — spłaszczenie zamiast `chooseModes: N`.** Plan zakładał
   komendę z listą indeksów. Zrealizowano `chooseTwoModes([...])` w `card-data.js`: każda
   para (i<j) staje się JEDNYM trybem listy (efekty w kolejności drukowanej, CR 700.2).
   Silnik, oferta i `castModalSpell` bez zmian; Austere = 6 pozycji. Tryby z celami rzucają
   wyraźny błąd definicji (nie cichy błąd gry). Zgodne z O-2: tani wariant zamiast
   wieloetapowego modala.
2. **Przetasowanie `WOREK_DECKS` (ADR 0023 §4).** Lorwyn (Kulrath, 15 kart nielandowych)
   awansował do własnej talii, więc worek-legend spadł do 6 kart. Kaldheim → `worek-legend`
   (legendy 17), Duskmourn → `worek-dziki` (dziki 18; mroczny 15). Pliki talii wygenerowane
   generatorem; README zaktualizowane do wyniku testu M203/7; `tools/benchmark.mjs` HELP
   zaktualizowany do 24 talii (test M338/3).
3. **ETB „target creature can't be blocked" (Neurok, Subterranean Scout) — wpis w
   `ETB_EFFECT_BONUS`** zamiast wyjątku `INTENTIONAL_EXCEPTIONS` (zgodnie z planem i
   precedensem PMSSB-62). Wartość bez zmian: `evasionEtbValueWeight × cantBeBlockedTargetValue`.
4. **Wagi bota (G6):** `massDestroyFoeFlat` 75, `massDestroyOwnFlat` 90 (w
   `heuristic-params.js`, w `HEURISTIC_PARAM_KEYS` i `DEFAULT_HEURISTIC_PARAMS`). Pinowane
   testami zachowania, NIE pomiarem B0 (ADR 0018 — pełny B0 nie uruchamiany w tej partii).
5. **Przechwycenie kontrolera (M4) trzymane w `state.spellCaptures[spell-id]`** bez
   czyszczenia. Id obiektów na stosie są monotoniczne (`spell-${objectSequence++}`),
   więc wpis nie może trafić w inny czar; koszt pamięci to jeden wpis na rzut Secure.
6. **Test M257A1 — seed 3 → 2.** Przebieg partii zmienił się po podziale `warhammer-ubr`;
   skan 1..30 wskazał seed 2 jako pierwszy z rzutem morpha (precedens L25). Asercje bez zmian.
7. **Golden-master `bot-scoring-snapshot` — fixture zregenerowany świadomie.** Dryf zlokalizowany
   na `ravnica|innistrad-wu@1000` (298 vs 150 decyzji). DOWÓD ATRYBUCJI: ten sam kod z taliami
   z `41d77c6` przechodzi golden-master BIT W BIT (4/4) — zmiany wyceny i przeniesienie ETB
   `cant_be_blocked` do tabeli nie zmieniają zachowania dla dotychczasowych kart; cały dryf
   pochodzi z nowych kart w taliach. Fixture: `test/fixtures/bot-scoring-snapshot.json`.
8. **F3 `session-bot-pausa` — seedy [31,34,37] → [34,41,50]** (konwencja L25), patrz sekcja
   „Otwarte ustalenie" niżej. Asercje bez zmian.
10. **Wycena bota — 10 kart, nie 4.** Zachowanie rzutów wszystkich 10 kart pinuje
   `test/bot-quality-batch68-karty.test.js` (commit `ce2d350`): Kulrath, Bloodfire, Meteorite,
   Child of Night, Neurok, Halo Scarab. Pierwsze pięć rzutów wychodzi bez zmiany wag.
   **Halo Scarab — bankowanie many za koszt z cmentarza poniżej passa (świadomie).** Bot nie
   wygina Scarab, gdy nie ma czego rzucić: to ta sama reguła co Heap Gate (M243/C, zgłoszenie
   właściciela, pin w `audyt-pmssb2-tokeny`). Zmiana tej reguły dla jednej karty byłaby cichym
   odwróceniem decyzji właściciela, więc nie została zrobiona. Do rozstrzygnięcia przez właściciela.
11. **O-2 — test regresji 100 stworów usunięty; lekka wersja.** Zlecenie właściciela: nie trzymać
   w suite testu, który liczy 166751 ofert (~21 s decyzji bota). Zostaje O/13 na 30 stworach
   (4526 ofert, ms): pilnuje kompletności i braku błędu. Czysty stack overflow pojawia się dopiero
   przy ~10^5 elementach, więc lekki test to test poprawności, nie stosu.
12. **Cytaty CR.** Z tej partii zostają tylko numery, co do których reguła jest pewna
   (700.2 wybór trybów, 701.8 zniszczenie, 509.1b blokowanie). Odwołania do 608.2c zastąpione
   rulingami Scryfall (Secure 2020, Raze 2022-10-14), bo nie mogę zweryfikować ich offline.

## Otwarte ustalenie (do decyzji właściciela, NIE naprawiane w tej partii)

Modal ruchu bota gubi część rozstrzygnięć czarów bota, które zaszły w komendzie człowieka
tuż przed granicą tury: wpis „Terminal Agony niszczy Ainok Artillerist" nie trafia do bufora
(`src/table/session.js`: `noteBotMove` / `stackObjects` / przycinanie bufora przy granicy
tury, okna M90/M252/M261). Skutek: gracz nie widzi, że jego permanent zginął w turze bota.
Luka JEST PRZED tą partią — przy taliach z `41d77c6` występuje na seedach
6/11/16/25/26/40/42/50/57 (oraz koniec partii na 4); test F3 przechodził tylko dlatego, że
jego trójka seedów była wybrana pod przebieg. Zmiana okien modalu to zmiana reguł UX
(kilkadziesiąt pinów), więc wymaga osobnej decyzji właściciela i osobnego batcha/PR.
