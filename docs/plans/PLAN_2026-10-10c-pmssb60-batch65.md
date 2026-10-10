# PLAN PMSSB-60 — pętla jakości dla mechanik batcha 65 (2026-10-10)

Zlecenie właściciela: „Uruchom pełne PMSSB dla B65". Gałąź `arena/16d5d128-mtg`,
PR #162 (ta sama sesja — AGENTS.md „1 sesja = 1 gałąź = 1 PR"). Plan commitem
PRZED kodem (ADR 0020 A/C). Stan pomiarów: `3b63c79`.

Precedens: PMSSB-58 (batch 63) i PMSSB-59 (batch 64) — sam komplet 10/10 kart
w silniku NIE jest kompletem PMSSB; poniżej odrębne dowody jakości scoringu.

## 1. Zakres — mechaniki nowe w batchu 65

Karty (artId): 329 Blinding Drone (OGW), 332 Blitz of the Thunder-Raptor (IKO),
333 Bring to Trial (RNA), 334 Skyscythe Engulfer (ONE), 336 Zombie Boa (APC),
338 Brine Giant (THB), 340 Ambulatory Edifice (ONE), 341 Pacifism (DTK),
348 Impulse (DMU), 350 Temple of Abandon (BLC).

Generycznie NOWE elementy do wyceny (ADR 0002 — testujemy po typie efektu
i deskryptorze, nie po nazwie karty):

| # | Mechanika | Gdzie | Nowość |
|---|---|---|---|
| M1 | `damage` z `amount: 'instants_and_sorceries_in_your_graveyard'` | `cast_spell` | pierwszy `amount` liczony z GROBU (nie z X, nie z pola) |
| M2 | `exile_if_dies_this_turn` jako rider czaru (nie triggera) | `cast_spell` | dotąd wyceniany tylko przy obrażeniach z triggera (M177/A) |
| M3 | `choose_color_grant_block_destroy` | `activate_ability` + `pendingColorChoice` | warunkowe zniszczenie BLOKERA per kolor |
| M4 | `look_top_put_one_hand_rest_bottom` jako CZAR | `cast_spell` | ten sam typ efektu jest już wyceniany w `activate_ability` (Dockhand) i w sadze |
| M5 | `costReduction` z `affinityToEnchantments` | koszt rzutu | pierwszy affinity w katalogu — wymiar KOSZTU (kontrola S11) |
| M6 | statyka `cantBeBlockedByKeywords: ['flying']` | ciało | selektywna ewazja (nie `cantBeBlocked`, nie flying) |
| M7 | ETB `requiresTarget` + `payLife` → `pump -1/-1` | trigger decyzyjny | refleks „When you do" (Zoraline/Etap F) |
| M8 | aura `cantAttack` + `cantBlock` | `cast_permanent` z celem | restrykcje gospodarza bez pump/keywords |
| M9 | `{C}` w koszcie zdolności (bezbarwny pip) | `activate_ability` | wzorzec Kozilek's Shrieker |
| M10 | ląd: `entersTapped` + scry 1 + `{T}: {R} lub {G}` | `play_land` / `activate_ability` | kolejna świątynia w rodzinie many (PMSSB-32) |

## 2. Metoda

- Sceny na RZECZYWISTYM silniku (`createGameState` + `addObject` + `playerView`),
  komendy wybrane przez prawdziwego bota (`createHeuristicBot`, seed 2026
  zamrożony, `randomness = 0`, `lookahead = 0` — konfiguracja produkcyjna,
  `src/table/session.js:315`). Punkty per wariant z `bot.trace()`.
- Izolacja wartości przez KONTRFAKTYK: ta sama karta z USUNIĘTYM efektem, przy
  niezmienionym ciele i koszcie (wzorzec PMSSB-58 §1). Delta = wartość efektu.
- **Pułapka PMSSB-59 potwierdzona dla tego batcha:** karty właściciela NIE są
  w `REAL_CARDS` — batch 65 to linie 13299-13491, czyli `VIRTUAL_BASIC_LANDS`
  (od 4352). Rejestr kontrfaktyczny składamy z `[...REAL_CARDS,
  ...VIRTUAL_BASIC_LANDS]` przez `createRegistry(...)` (`registryKontra`
  w sondzie), a NIE z samego `REAL_CARDS`.
- Sonda: `tools/pmssb60-batch65-sonda.mjs` (commitowana — powtarzalność pomiaru).
- Bramki: `npm test` i `node tools/run-tests.mjs all` (pełny pakiet CI) +
  `npm run build`, per commit (ADR 0020).

## 3. Findingi PRZED (stan na `3b63c79`)

| ID | Pomiar | Przyczyna / zakres |
|----|--------|--------------------|
| **F1** | Blitz: `cast_spell(->f1)` = **−30,0** dla grobu 0 / 2 / 4 / 6 i dla wrogiego 2/2 / 4/4 / 8/8 (płasko). **KONTRFAKTYK bez efektów: +50,0** → delta **−80** | Deskryptor `instants_and_sorceries_in_your_graveyard` ma **0 trafień** w `heuristic-bot.js` (1 w `effects.js`), więc `damage` jest liczony jak 0 obrażeń, a sam fakt posiadania efektu ciągnie score w dół. Silnik działa poprawnie — rozstrzygnięcie przy 6 instantach daje `damage_dealt amount:6` → `damage_marked 6` → `creature_destroyed toZone:'exile'`. Bot **nigdy** nie rzuci tej karty. Klasa L50 (brak wyceny → dominuje koszt) |
| **F2** | Zombie Boa: `activate_ability(boa#0)` = **dokładnie 0,0** (main, wróg ze stworami R i G). Kontrfaktyk bez zdolności → brak oferty | `choose_color_grant_block_destroy` ma **1 trafienie** w `heuristic-bot.js` — wyłącznie w liście kumulacji (komentarz, l.1207). Brak jakiejkolwiek wartości: bot jest obojętny i nie wybierze aktywacji ponad cokolwiek dodatniego. L3: efekt jałowy to kara, nie zero |
| **F3** | Impulse: `cast_spell` = **50,0** dla biblioteki 0 / 1 / 4 / 30. **KONTRFAKTYK bez efektu: też 50,0** → delta **0**. Ten sam typ efektu w `activate_ability` (Merchant's Dockhand): X=1 → 2,5; X=2 → 2,0; X=3 → 2,0; **X=0 → −42,0** | `impulseLookValue` (PMSSB-14) jest podpięty w 3 miejscach — rozdziały sagi (l.2245), fallback exploita (l.2343), zdolność aktywowana (l.11659) — ale **NIE w ścieżce rzucania czaru**. 50,0 to generyczna baza, nie model (gdyby helper działał, score zareagowałby na pustą bibliotekę). **Klasyczna asymetria L41**, czyli dokładnie to, co kontrola (a) procedury każe łapać |
| **F6** | Brine Giant: `cast_permanent` = **70,2** dla 0 / 3 / 6 enchantmentów (płasko) | `costReduction: { amount: 1, condition: { affinityToEnchantments: true } }` nie wchodzi do wyceny — bot nie wie, że czar kosztuje 7 / 4 / 1 many. **Naruszenie kontroli (b) procedury (S11: 5 vs 2 many nie mogą remisować bez uzasadnienia)** |
| **F7** | Skyscythe Engulfer: `cast_permanent` = **72,0** pełny i **72,0** bez statyki → delta **0** | `cantBeBlockedByKeywords: ['flying']` nie jest wyceniane ani jako ewazja, ani jako nic. Rodzina ewazji istnieje (`cantBlock`/flying), więc luka jest w selektywnym wariancie po słowie-kluczu |
| **F8** | Ambulatory Edifice: `cast_permanent` = **67,5** pełny i **67,5** bez triggera → delta **0** | Trigger ETB z `requiresTarget` + `payLife: 2` → `pump -1/-1` nie wchodzi do wyceny rzutu. PMSSB-40 domknął bramkę `requiresTarget` dla payoffów rzutu, ale ten kształt (optionalPay + cel refleksu po zapłacie) nie jest liczony |
| **F4** | Bring to Trial: 4/4 → **96,0**; 8/8 → **120,0**; 2/2 → **brak oferty** (filtr celu działa) | BRAK defektu — **kontrola dodatnia**. Rodzina removal (M91/M234) skaluje się wartością ofiary |
| **F5** | Pacifism: cel wrogi 5/5 → **76,5**; cel własny → **−68,4** | BRAK defektu — **kontrola dodatnia**. Orientacja celu poprawna w obie strony |
| **F9** | Temple of Abandon: `play_land` **85,0**; aktywacja −30,0 (pusta ręka), **−4,0** (5G + 6-mana zielony), −4,0 (6G). Rzut 6G przy 5G + Temple → **72,0 (oferowany)** | BRAK defektu — **kontrola dodatnia**. Ujemna aktywacja jest POPRAWNA: mana nietapniętego lądu jest już policzona w jednostkach (B54/s4008 — auto-płatność tapuje lądy sama), więc jawna aktywacja jest redundancją. Dowód: rzut 6G jest oferowany bez aktywacji. (Teza o luce, postawiona na podstawie wczesnej sondy, była błędna — obalona tym pomiarem) |
| **F10** | Blinding Drone: zdolność **brak oferty** przy 5 many KOLOROWEJ, **+20,0** przy 5 many BEZBARWNEJ; rzut z ręki 64,8 | BRAK defektu — **kontrola dodatnia**. `{C}` (CR 107.4c) nie da się opłacić maną kolorową, więc brak oferty był poprawny; z maną bezbarwną zdolność jest oferowana i wyceniona |

Bilans PRZED: **6 findingów** (F1, F2, F3, F6, F7, F8) i **4 kontrole dodatnie**
(F4, F5, F9, F10).

## 4. Fale napraw (każda z testem i dowodem mutacyjnym)

**Fala A — F1 (dynamiczny `amount` z grobu).** Rozwiązać
`instants_and_sorceries_in_your_graveyard` do liczby (jak `xValue` dla X) PRZED
wyceną `damage`, wzorcem istniejącego `basic_land_types_you_control` (l.9703);
wycena skalą ofiary jak pozostałe `damage`; rider `exile_if_dies_this_turn`
jako dopłata (odcina grave-recursion — ta sama jednostka co M177/A). Piny:
grób 6 > grób 0; cel 4/4 > cel 2/2; cel 8/8 > cel 4/4; rider dodaje;
**anty-over-fix M429: grób 0 = dawna wartość**.

**Fala B — F3 (L41 dla look-top).** Podpiąć `impulseLookValue` w ścieżce
`cast_spell` dla `look_top_put_one_hand_rest_bottom` i `..._rest_grave`
(jeden helper, nie kopia). Piny: delta > 0 wobec kontrfaktyku; biblioteka 0 <
biblioteka 30; **cast ≈ activate** dla tego samego typu efektu (oś L41).

**Fala C — F2 (warunkowe zniszczenie blokera).** Wartość
`choose_color_grant_block_destroy` = oczekiwana korzyść z zniszczenia blokera
wybranego koloru: najlepszy kolor wroga × skala ofiary × prawdopodobieństwo
bloku, minus koszt ({1}{B} + sorcery-speed). Piny: wróg z stworami > wróg bez
stworów; koszt many obniża (kontrola S11); **jałowy wariant ujemny, nie 0 (L3)**.

**Fala D — F6 (affinity = koszt efektywny).** `costReduction` z warunkiem
affinity wchodzi do kosztu użytego w wycenie: koszt = `manaCost −
min(amount × liczbaEnchantmentów, manaCost)`. Piny: 6 enchantmentów > 3 > 0;
przy 0 enchantmentów = dawna wartość (**anty-over-fix**).

**Fala E — F7 (selektywna ewazja).** `cantBeBlockedByKeywords` jako dopłata do
ciała: wartość nieblokowania przez daną klasę = udział wrogich blokerów z tym
słowem-kluczem × premia ewazji (wspólna skala z `cantBlock`, L41). Piny: wróg
z flying > wróg bez flying; delta > 0 wobec kontrfaktyku.

**Fala F — F8 (trigger optionalPay z celem refleksu).** Wycena triggera ETB
`requiresTarget` + `payLife` → `pump`: korzyść z −1/−1 na najlepszym wrogim
celu minus 2 życia (wspólna drabina `selfLifeLossPenalty`, L48) minus próg
opłacalności. Piny: delta > 0 wobec kontrfaktyku; wróg 1/1 (zabija) > wróg 5/5
(nic nie robi); bez wrogich stworów = dawna wartość.

Kontrole procedury: (a) L41 mierzona w falach B (cast vs activate) i A/E (ten
sam zestaw typów, nie kopia); (b) S11 w falach C i D; (c) anty-over-fix M429
w falach A, D, F — najsłabszy realny wariant = dawna wartość.

## 5. Testy i ewaluacja

- `test/audyt-pmssb60-batch65.test.js` (wzorzec M429: decide/trace na żywym
  silniku, anty-over-fix, pokrętła-sterują ×0), RED→GREEN per fala + mutacje.
- Ewaluacja: `bot-scoring-snapshot` (cel: bez regeneracji), `bot-tie-audit` PO,
  pełne B0.

## 6. Bramki

`npm test`, `node tools/run-tests.mjs all`, `npm run build`, `cr-numery --cr`.
Push po każdym kroku (ADR 0020); jedna fala = jeden commit (L184).
