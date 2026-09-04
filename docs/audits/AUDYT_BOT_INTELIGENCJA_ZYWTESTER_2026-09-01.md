# AUDYT Żywego Testera + inteligencja bota (2026-09-01, sesja arena/01a05d4f, PR #92)

**Metoda:** 20 partii Żywego Testera (`tools/table-tester`, artefakt `dist/`,
ADR 0016 — chirurgiczne patchowanie po znalezisku), transkrypty w
`tmp-audyt-bot/` (poza repo). Oś analizy: **Oś 1** (bezsensowne/nieoptymalne
działania bota) — czytanie ciągu akcji bota (`[ROZGRYWKA]` + `STOS:` + pola)
i korelacja z wyceną `heuristic-bot.js`. Dodatkowo detektory i sonda noop.
Profil bota: `heuristic` (domyślny), gracz = sterownik testowy o zadanym
profilu (greedy/defensive/explorer/random/hoarder/impatient).

## 1. Zakres partii

20 partii, seedy 401–420, bot gra 15 różnych talii (w tym 4 z próbki
benchmarku i 3 worki):

| seed | człowiek (profil) | bot (talia) | wynik | detektory |
|---|---|---|---|---|
| 401 | theros (greedy) | innistrad-brg | Bot | – |
| 402 | innistrad-brg (defensive) | mirrodin-wu | Bot | – |
| 403 | mirrodin-wu (greedy) | tarkir-bg | Bot | – |
| 404 | tarkir-bg (greedy) | ravnica | Bot | – |
| 405 | ravnica (explorer) | theros | **Gracz** | – |
| 406 | theros (defensive) | srodziemie | Bot | – |
| 407 | srodziemie (random) | warhammer-ubr | Bot | 1× noop (oś 4) |
| 408 | warhammer-ubr (explorer) | wiedzmin | Bot | – |
| 409 | wiedzmin (greedy) | zendikar | Bot | – |
| 410 | zendikar (hoarder) | alara | Bot | – |
| 411 | alara (defensive) | forgotten-realms | Bot | – |
| 412 | forgotten-realms (greedy) | final-fantasy | Bot | – |
| 413 | final-fantasy (explorer) | dominaria-brg | Bot | – |
| 414 | dominaria-brg (defensive) | dominaria-wu | Bot | 2× „Wariant" → **naprawione** |
| 415 | tarkir-wur (greedy) | innistrad-brg | **Gracz** | – |
| 416 | worek-mroczny (hoarder) | mirrodin-brg | Bot | – |
| 417 | ravnica (impatient) | tarkir-bg | Bot | – |
| 418 | innistrad-wu (random) | warhammer-ubr | Bot | – |
| 419 | mirrodin-brg (defensive) | srodziemie | Bot | – |
| 420 | wiedzmin (explorer) | worek-dziki | Bot | – |

Wysoki udział zwycięstw bota (18/20) nie jest miernikiem jakości — sterownik
gry „po ludzku" celowo nie gra optymalnie; analizujemy JAKOŚĆ decyzji bota,
nie wynik.

## 2. Znalezisko — klasa L102/1 domknięta (3. trafienie w 2 sesjach)

Partia 414 (`dominaria-brg` vs `dominaria-wu`, profil defensive): grupa
`resolve_reveal_exile_hand` (Dreams of Steel and Oil — „wygnij kartę z ręki
przeciwnika") pokazywała **„Wybierz: Wariant (3 opcje)"**. Skan
`choiceRequestGroupKey` wykazał **9 stałokluczowych typów** bez żadnego
fallbacku tytułu: `resolve_copy_targets`, `resolve_exploit_choice`,
`resolve_fabricate`, `resolve_manifest_dread`, `resolve_optional_draw`,
`resolve_reveal_choice`, `resolve_reveal_exile_hand`,
`resolve_reveal_exile_grave`, `resolve_satyr_look_choice`.

**Fix u root cause (klasa, nie egzemplarz — L102/1):**
- `CHOICE_GROUP_COMMAND_DESCRIPTORS` — deskryptory dla wszystkich 9 typów
  (fallback uniwersalny: bez danych źródła nigdy „Wariant").
- `resolve_reveal_exile_hand/grave` — `choiceSourceTitle` nazywa źródło
  (czar na stosie — informacja publiczna); `pendingRevealExile` w widoku
  eksponuje `sourceCardId` (silnik nosił je jako `cardId`, M201/F; ADR 0002).
- **Strażnik klasowy** `test/wybierz-wariant-klasa.test.js`: enumeruje
  stałokluczowe typy `choiceRequestGroupKey` i żąda, by `choiceGroupTitle`
  nigdy nie wracał do „Wariant". RED (9 typów) → GREEN. `choiceRequestType`
  wyeksportowane dla testu.
- Re-run tej samej partii: „Dreams of Steel and Oil — karta z ręki do
  wygnania (3 opcje)", detektory czyste.

## 3. Inteligencja bota — ocena po osi 1 (bezsensowne/nieoptymalne działania)

**Wniosek: bot gra kompetentnie; nie znaleziono błędu „głupoty".** Detektory
oś-1 (powtórzenia ≥4×/tura, celowanie szkodliwym w siebie, buffowanie moich
stworów, odkręcanie moich permanentów) — **zero zgłoszeń** w 20 partiach.
Przegląd ciągów akcji potwierdza celowość decyzji; poniżej konkretne
zachowania z partii i wycena, która za nimi stoi.

### 3.1 Działania ocenione jako POPRAWNE (z dowodami z partii)

| Zachowanie | Partia | Wycena (heuristic-bot.js) |
|---|---|---|
| Symetryczny mill (Ghoulcaller's Bell) tylko przy PROWADZENIU w kartach | 401, 415 | `mill_both_players` (M162/B): `myLib<=foeLib → -40`; wygrywa tylko wyścig bibliotek |
| Mill-tech: Chronic Flooding na LĄD PRZECIWNIKA (to on mieli, gdy tapuje) | 404 | `damage_to_controller`/aura-target wycena + oś „efekty szkodzące przeciwnikowi" |
| Combat trick z deathtouch na blokowanego atakującego (Coat with Venom na Elk Herd, trade z blokerem) | 403 | `combatOutcome`/`simulateCombat` + `pumpChangesOutcome` |
| Pump na atak (Savage Surge + Brute Force na Goblin Piker) | 407 | `pumpChangesOutcome` |
| Removal w kluczowy cel (Bone Splinters z poświęceniem, Wretched Banquet na najsłabszy stwór, Divest na rękę) | 410, 408 | `enemyRemovalTargetBonus` + koszt poświęcenia |
| Aury/equip na ewazyjne zagrożenie (Shiv's Embrace na Disa, Serra's Embrace na Wormfang, Cloak of the Bat + atak Plague Reaverem) | 413, 414, 411 | wycena aury po odbiorcy (`temporaryPumpOf`) |
| Wrap in Flames — obrażenia + „nie mogą blokować" w 3 cele (odblokowanie ataku) | 407 | wycena efektów wielocelowych |
| Tap przeciwnika (Twiddle→Minotaur Abomination, Merfolk Mesmerist→mill gracza) | 408 | `tapTargetValue` + mill przeciwnika `+20+3N` |
| Reanimacja/Plague Reaver ping-pong zgodnie z CR | 411 | ścieżka upkeep/delayed trigger |
| Equip w odpowiednim momencie (nie na stwora z chorobą) | 401 | `tapTimingBonus`/`canWait` |

### 3.2 Obserwacje nie-błędne (zapisane, nie naprawiane)

1. **Withstand jako cantrip** (partia 404): bot rzucił „prevent 3 + dobierz"
   na SIEBIE we własnej głównej fazie bez zagrożenia — tarcza wyparowuje na
   końcu tury, zostaje samo dobranie. Legalne („any target"), wycena widzi
   dobranie (+6). Mikro-nieoptymalność tempa, nie błąd.
2. **Bot jest agnostyczny wobec planu talii** (ADR 0022 nie wymaga
   awareness talii): w agresywnym innistrad-brg milluje symetrycznie, gdy
   prowadzi w kartach (401). Dopuszczalne — wycena pilnuje, by nie millował
   PRZEGRYWAJĄC wyścig.
3. **Przegrane bota** (405, 415) to przegrane wyścigi/matchupy, nie błędy:
   w 415 bot bez latających blokerów/removalu nie miał odpowiedzi na
   Jeskai Windscout/Descendant of Storms; decyzje desperackie (chump block,
   pump, trade) były racjonalne.

### 3.3 Oś 4 (oferty bez skutku) — 1 trafienie, zweryfikowane jako NIE-błąd

Partia 407: sonda noop zgłosiła „Aktywuj: Seer's Lantern — scry 1 — UWAGA:
twoja biblioteka jest pusta". To oferta po stronie GRACZA, **legalna**
(CR 701.18 — scry z pustej biblioteki robi nic) i UI ją jawnie ostrzega.
Asymetria jest zamierzona: **bot** ma guard w `effectIsInertNow`
(`scry/surveil/look_top_n` przy pustej bibliotece → nie aktywuje), a panel
gracza oferuje akcję, bo gracz może ją legalnie wybrać. Nie blokujemy
legalnych akcji gracza.

## 4. Werdykt

- **Inteligencja bota: poprawna.** 20 partii, zero zgłoszeń detektorów osi 1,
  przegląd decyzji nie wykazał „głupoty" — każde podejrzane zagranie miało
  uzasadnienie w wycenie albo w CR. Wartościowe wyceny (symetryczny mill
  M162/B, combat simulation, `effectIsInertNow` dla pustej biblioteki)
  trzymają się na żywym stole.
- **Znalezisko (naprawione):** klasa L102/1 — 9 typów grup wyboru bez
  fallbacku tytułu („Wybierz: Wariant"), domknięta deskryptorami + strażnikiem
  klasowym (commit w PR #92).
- **Nie naprawiane (świadomie):** Withstand-cantrip, deck-agnostic mill —
  obserwacje jakościowe, nie błędy reguł/UX.

Transkrypty: `tmp-audyt-bot/*.txt` (poza repo, `.gitignore`). Katalog
`tools/table-tester/node_modules` poza repo.
