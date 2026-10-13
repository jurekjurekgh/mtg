# PLAN PMSSB-61 — pełna pętla jakości scoringu batcha 66 (2026-10-13)

Zlecenie właściciela: przeprowadzić osobne PMSSB dla wszystkich mechanik
batcha 66, których nie zamknęła dotąd pełna pętla PMSSB. Gałąź
`arena/8ec8f610-mtg`, PR #163; baza pomiaru PRZED: `13703cf`.

Plan jest commitowany **przed kodem, testem audytowym i commitowaną sondą**
(ADR 0020 A/C). Eksplorację PRZED wykonano wyłącznie nieśledzonym narzędziem
w `.arena/`; jej sceny zostaną odtworzone przez powtarzalną sondę
`tools/pmssb61-batch66-sonda.mjs` po tym checkpointcie.

Precedens: PMSSB-59 (batch 64) i PMSSB-60 (batch 65). Testy funkcjonalne
`test/real-cards-batch66.test.js` dowodzą zgodności silnika, ale nie dowodzą,
że bot poprawnie wycenia akcje.

## 1. Zakres i inwentarz 10 kart

| # | Karta | Mechanika scoringowa | Stan PRZED / klasyfikacja |
|---:|---|---|---|
| 351 | Sporecap Spider | `reach` w deklaracji bloków | **kontrola dodatnia** istniejącej rodziny walki |
| 353 | Warden of Geometries | `vigilance` + ciało jako źródło `{C}` | **finding F1** dla zachowania gardy po ataku; ręczna mana to kontrola „by design” PMSSB-59 |
| 356 | Cazur, Ruthless Stalker | Partner with + licznik na każdym źródle combat damage | **findingi F2a/F2b** |
| 357 | Lorescale Coatl | licznik za każde własne draw | anticipacja rzutu istnieje; **finding F3** w payoffach draw na stole |
| 359 | Foul Orchard | tapped dual `{B}/{G}` | **kontrola dodatnia** PMSSB-32 / rodziny lądów |
| 361 | Noble Vestige | tap: `prevent_next_damage` dla player/PW | **finding F4**, asymetria L41 czar ↔ aktywacja |
| 363 | Wild Celebrants | opcjonalny ETB artifact removal | **kontrola dodatnia** ETB/removal/trigger modalny |
| 364 | Naturalize | instant artifact/enchantment removal | **kontrola dodatnia** rodziny removalu |
| 365 | Rakish Revelers | aktywacja z ręki, fixing landu, późniejszy cast z exile | **finding F5** |
| 368 | Scythe Tiger | ETB „sacrifice source unless land”, wybór landu, shroud | **finding F6** |

Wszystkie poprawki mają być generyczne po deskryptorach i stanie z
`PlayerView` (ADR 0002/0017), bez warunków po `cardId` albo nazwie karty.

## 2. Metoda pomiaru

- Rzeczywisty silnik: `createGameState` + `addObject` + `playerView`; rzeczywisty
  `createHeuristicBot`, seed 2066, `randomness: 0`, `lookahead: 0` (domyślna
  konfiguracja produkcyjna z `src/table/session.js`). Punkty z `bot.trace()`.
- Kontrfaktyk: ta sama definicja z usuniętą wyłącznie badaną zdolnością,
  przy niezmienionym ciele i koszcie.
- Rejestr kontrfaktyczny musi składać się z **obu** list
  `[...REAL_CARDS, ...VIRTUAL_BASIC_LANDS]` i być przekazany także botowi.
  To naprawiona pułapka metody PMSSB-59/60.
- Tam, gdzie produkcja zna własną talię, sonda przekazuje `ownDeck`; brak
  kontekstu talii jest osobną kontrolą kompatybilności.
- L41: ten sam helper dla równoważnych ścieżek `cast_permanent`, `cast_spell`,
  `activate_ability`, triggera opcjonalnego i decyzji modalnej.
- S11: score czyta realny koszt aktywacji/rzutu; wariant `{2}` i wariant `{0}`
  nie mogą remisować bez przyczyny.
- M429: nowy wymiar jest dopłatą/karą kontekstową. Wariant, w którym efekt nic
  nie zmienia, nie dostaje sztucznej premii; sceny kontrolne bez enablera mają
  zachować dawną wartość albo zejść poniżej passu, jeśli akcja zużywa zasób.

## 3. Pomiary PRZED (`13703cf`)

| ID | Pomiar PRZED | Diagnoza |
|---|---|---|
| **F1 — vigilance/garda** | Warden atakujący w otwarty stół przy lethalnym crackbacku: **1,0**; kontrfaktyk bez vigilance: także **1,0** | `guardBlockers` usuwa z prognozy każdego zadeklarowanego atakującego, choć vigilant attacker pozostaje odtapnięty i może blokować. Sama ręczna aktywacja many jest zdrowa: **−4,0**, gdy auto-payment już oferuje właściwy czar za **76,0** |
| **F2a — Partner with** | Cazur: pełny **76,9536**, bez Partner **68,8536**; z produkcyjnym `ownDeck` bez Ukkimy nadal **76,9536**, identycznie jak z Ukkimą | `searchRiderValue` daje +9 za nazwany tutor bez sprawdzenia, czy we własnej znanej talii pozostał choć jeden cel. `searchTargetsRemaining` zna typy/podtypy, lecz nie `qualifier.name` |
| **F2b — combat counters** | Ataki `[Cazur,a] / [Cazur] / [a]` = **19/14/13** zarówno z triggerem, jak i po jego usunięciu | `declare_attackers` wycenia token po combat damage tylko na definicji samego atakującego. Nie skanuje planszowego triggera `any_combat_damage_to_player` i nie widzi pewnego +1/+1 na źródle, które połączy |
| **F3 — draw payoff** | Rzut Lorescale ma działającą anticipację: **68,4009** vs **63,9009** bez triggera. Jednak Inspiration draw 2: **11=11**; Civilized Scholar: **4=4**; Phyrexian Rager ETB draw: **68,4018=68,4018** z Lorescale i bez jego zdolności | Trigger nosiciela jest wyceniony przy rzucie, lecz późniejsze efekty draw nie dostają wartości liczników. Klasyczna asymetria L41 w trzech kanałach |
| **F4 — Noble/prewencja** | Bez zagrożenia aktywacja na siebie **+2,0** i wygrywa z passem; przy nadchodzących 3 obrażeniach nadal **+2,0**. W tej samej scenie Withstand na gracza ma **+67,0** | `preventShieldValue` istnieje dla `cast_spell`, ale `activate_ability` go nie wywołuje. Bot tapuje Noble natychmiast poza oknem i nie rozpoznaje właściwego okna |
| **F5 — Rakish** | Przy pięciu lądach każdy wariant, łącznie z celem przeciwnika, ma **−5,0**; usunięcie kosztu `{2}` daje nadal **−5,0** | Każda aktywacja karty z ręki wpada do bloku „Cycling”, bo bramka sprawdza tylko `handCard`, nie deskryptor cycling, i kończy wcześniejszym `return -5`. Po usunięciu zwarcia płaska premia +12 nadal nie rozróżni landu, który domyka R/G/W, od celu redundantnego — potrzebny model marginalnego fixingu |
| **F6 — Scythe Tiger** | 0 landów: **−39,5946** (zdrowa odmowa). Każde **1/2/3/5** landów: płasko **57,6054** i natychmiastowy rzut. W decyzji po ETB każdy land ma **40,0**, Tiger **32,0**, więc przy jedynym landzie bot zawsze poświęca land | ETB ma płaskie −12, a ogólna decyzja sacrifice wycenia land po `manaCost=0`, czyli jak darmowy permanent. Brakuje liczby lądów, utraty unikatowego koloru i racjonalnego wariantu „poświęć źródło”; bot nie zna realnego kosztu ani właściwego timingu rzutu |
| **C1 — Sporecap** | blok 1/5 z reach przed flying 3/3: **+6,0** vs pusty blok **0,0**, bot wybiera blok | Kontrola dodatnia: legality i scoring walki respektują reach |
| **C2 — Foul Orchard** | `play_land`: Forest **103,0**, tapped dual **97,0** w scenie z zapotrzebowaniem; warianty są rozróżnione | Kontrola dodatnia: dual daje oba kolory, `entersTapped` płaci koszt tempa |
| **C3 — Wild Celebrants** | z wrogim artefaktem **84,6054**, bez ETB **68,4054**; bez artefaktu pełna karta wraca do **68,4054** | Kontrola dodatnia i anty-over-fix: ETB removal ma wartość wyłącznie z celem wroga |
| **C4 — Naturalize** | duży wrogi artefakt **100,0** > mały **74,0** >> własny **−130,0** | Kontrola dodatnia rodziny removal i kierunku celu |

Bilans: **6 fal / 7 findingów** (F2 ma dwie niezależne osie) oraz 4 kontrole
kart zamkniętych przez istniejące rodziny PMSSB.

## 4. Fale RED → GREEN

### Fala A — F1: vigilance pozostawia przyszłego blokera

W prognozie crackbacku zadeklarowany atakujący z vigilance pozostaje w zbiorze
`guardBlockers`, o ile jest legalnym, odtapniętym blokerem. Bez vigilance
zachowanie pozostaje bitowo dotychczasowe.

Piny: pełny Warden > kontrfaktyk bez vigilance w identycznej scenie; wariant
bez keyworda zachowuje **1,0** (M429); ręczna produkcja many pozostaje poniżej
passu, gdy rzut jest już oferowany przez auto-payment.

### Fala B — F2a/F2b: Cazur

1. Rozszerzyć wspólne `matchesSearchCriteria`/`searchTargetsRemaining` o nazwę
   z `qualifier.name`. Nazwany `search_library_to_hand` dostaje premię tylko,
   gdy znana własna talia może jeszcze zawierać cel. Brak `ownDeck` zachowuje
   konserwatywną dawną wartość; znana talia z celem też ją zachowuje.
2. Dla atakującego, który na pewno zada obrażenia graczowi, policzyć planszowe
   `any_combat_damage_to_player → add_counter` z
   `targetFromContext: damageSourceId` wspólną miarą `counterHostValue`.
   Zablokowany atakujący nie dostaje przewidywanego licznika.

Piny: ownDeck bez Ukkimy = kontrfaktyk Partnera; ownDeck z Ukkimą = dawny
score; brak wiedzy = dawny score; atak z Cazurem > bez triggera; dwa łączące
stwory dostają dwa payoffy; zablokowany wariant ma delta 0 (M429).

### Fala C — F3: draw → payoff triggerów na planszy (L41)

Jeden helper ma policzyć liczbę rzeczywistych własnych zdarzeń draw i wartość
publicznych triggerów `you_draw_card → add_counter` na kontrolowanych
permanentach. Podpięcia: zwykły/modalny `cast_spell`, `activate_ability`, ETB
w `cast_permanent`, `resolve_modal_choice` oraz `resolve_optional_trigger_choice`.
Targeted draw przeciwnika, search-to-hand, pusta biblioteka i poświęcony przed
draw gospodarza nie dostają premii.

Piny: Inspiration draw 2 > kontrfaktyk o dwa payoffy; Scholar draw 1 > kontra;
Rager ETB draw > kontra; modal/optional decision korzysta z tej samej funkcji;
brak Lorescale = dokładne wartości PRZED (M429); rzut samego Lorescale zachowuje
istniejącą anticipację **68,4009**.

### Fala D — F4: aktywowana prewencja na wspólnej mierze

Podpiąć `prevent_next_damage` z aktywacji do istniejącego
`preventShieldValue`, z tą samą konwencją slotu `targetIndex ?? 0` co czar.
Nie tworzyć drugiej skali. Jałowa tarcza ma spaść poniżej passu; własny gracz
z nadchodzącymi obrażeniami ma być dodatni; cel przeciwnika pozostaje zakazany.

Piny: brak obrażeń < pass; incoming face damage > pass; czar i aktywacja reagują
w ten sam kierunek; przeciwnik < własny cel; S11 bez zmian (koszt aktywacji 0).

### Fala E — F5: aktywacja z ręki i marginalny fixing Rakish

1. Blok cycling uruchamiać wyłącznie dla zdolności faktycznie opisanej przez
   `cycling`/keyword, nie dla dowolnej aktywacji źródła z ręki.
2. Wycenić linkowany `grant_abilities` po marginalnej poprawie profili many:
   nowe wymagane kolory, maksymalne jednoczesne pokrycie kolorowych pipów oraz
   realne odblokowanie późniejszego rzutu źródła z exile. Profil target landu
   po grancie jest unią jego dotychczasowych alternatyw i nadanych kolorów,
   nie dodatkowymi trzema jednostkami many.
3. Redundantny grant dostaje karę za zmarnowanie `{2}`; cel przeciwnika nadal
   przegrywa przez wspólną politykę friendly-target. Koszt many jest liczony
   raz przez istniejący `abilityManaCostPenalty` (S11).

Piny: najlepszy land domykający R/G/W > Forest/Plains > cel przeciwnika;
pełny koszt `{2}` jest dokładnie gorszy od kontrfaktyku `{0}`; redundantny
fixing ≤ pass (M429); cast z exile zachowuje tę samą wartość ciała/ETB co cast
z ręki; prawdziwy cycling zachowuje dotychczasowy wynik.

### Fala F — F6: realna cena landu i timing Scythe Tiger

Wspólna wartość ofiary-lądu = mała baza permanentu + kara niedoboru poniżej
bezpiecznej liczby źródeł + istniejący `landLossValue` (unikatowy kolor oraz
zdolność niemanowa). `resolve_sacrifice_choice` ma używać tej wartości zamiast
`manaCost=0`. Anticipacja `sacrifice_source_unless_sacrifice` porównuje
najtańszy legalny land z wartością źródła: jeżeli bot po wejściu wybrałby
źródło, rzut jest jałowy i ma wartość wariantu bez landu; jeśli zachowa źródło,
koszt ETB ma podłogę dawnego **−12** (M429 — żaden wariant nie dostaje nowej
premii).

Piny: 0/1/2 landy → brak opłacalnego rzutu; 3 landy z redundantną ofiarą i
5 landów zachowują dawny **57,6054**; unikatowy potrzebny kolor nie jest
poświęcany; przy jednym landzie decyzja wybiera Tiger, przy zapasie — najtańszy
land; kontrfaktyk bez ETB pozostaje **68,4054**.

## 5. Artefakty i dowody

- sonda: `tools/pmssb61-batch66-sonda.mjs` — pełna macierz PRZED/PO;
- test: `test/audyt-pmssb61-batch66.test.js` — żywy bot, kontrfaktyki,
  piny M429/L41/S11 i kontrole 10/10 kart;
- raport: `docs/audits/PMSSB61_BATCH66_2026-10-13.md`;
- rejestr: nowa sekcja PMSSB-61 w `docs/PMSSB.md`;
- historia: `PROJECT_HISTORY.md` i końcowa sekcja realizacji tego planu.

Każda fala dostanie kontrolowany dowód RED→GREEN przez lokalną mutację lub
uruchomienie pinu przed implementacją. Logi długich poleceń trafiają wyłącznie
do `.arena/*.log`; na ekran wychodzi krótkie podsumowanie.

## 6. Ewaluacja i bramki

1. test audytowy PMSSB-61;
2. `node tools/bot-scoring-snapshot.mjs` PRZED/PO i ręczne wyjaśnienie każdego
   driftu; fixture tylko po udowodnieniu zamierzonej zmiany;
3. `node tools/bot-tie-audit.mjs --gry=40` PO (log do `.arena/`);
4. `npm test`, `node tools/run-tests.mjs all`, `npm run build`;
5. testy kart batcha 66, walidacja CR/printingów/generatora zgodnie z planem
   batcha 66; GitHub CI po pushu.

**Pełnego benchmarku B0 nie uruchamiamy bez osobnego polecenia właściciela.**

## 7. Realizacja

- [x] checkpoint planu przed kodem (`2605974`);
- [x] commitowana sonda, test i pomiar PRZED (`6e2fffe`);
- [x] fala A — Warden/vigilance;
- [x] fala B — Cazur/Partner + combat counters;
- [x] fala C — Lorescale/draw L41;
- [x] fala D — Noble/prewencja L41;
- [x] fala E — Rakish/from-hand + fixing + S11;
- [x] fala F — Scythe Tiger/land sacrifice + timing;
- [x] snapshot, tie-audit, fast/all/build i dokumentacja końcowa;
- [x] push oraz zielony GitHub CI na PR #163 — run `38394514667`, job
  `115286210287`, **PASS** w 6m6s.

### Wynik końcowy

Fale A–E zapisano w `9cd4984`, falę F w `df535bc`, a domknięcie projekcji
ofiary i grzechotki kosztu czaru w `4719214`. Dedykowany audyt ma **11/11**,
fast **8123/8123**, pełny `run-tests.mjs all` **8388/8388**, a build kończy
exit 0 (**74 moduły / 5102,4 kB**). Snapshot scoringu jest bitowo identyczny z
fixture (SHA-256 `bedd4066bf87477c5e8aff4b24ff4a341f869a6114b34db6d903f41e2bd8ef9c`).

Końcowy tie-audit (`--gry=40`) rozegrał 480 partii i 262 368 decyzji. Dla
`resolve_sacrifice_choice` wszystkie **74** remisy są odtąd sklasyfikowane jako
równoważne: **0 rozróżnialnych, 0 bez danych**. Pierwsza pełna brama ujawniła
jeszcze remis dwóch różnych combat tricków przy różnym realnym koszcie; domknął
go relacyjny tie-break S11, który nie premiuje najsłabszego wariantu (M429) i
nie narusza historycznych tierów X tej samej karty.

Walidacja batcha i dotkniętych rodzin ma **95/95**, generator 27 talii jest
idempotentny, `check-card-printings` ma 0 kart do pobrania, audyt kontraktów
zdarzeń 0 naruszeń, a 522 unikalne numery cytowane w kodzie istnieją w CR
obowiązujących od 2026-09-25. Pełnego benchmarku B0 nie uruchamiano zgodnie z
ograniczeniem właściciela.

Pełny raport: [`PMSSB61_BATCH66_2026-10-13.md`](../audits/PMSSB61_BATCH66_2026-10-13.md).
