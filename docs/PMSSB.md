# PMSSB — Pętla Manualnego Strojenia Scoringu Bota (hub)

Metoda M429: przemyślany audyt przyczynowo-skutkowy JEDNEJ rodziny efektów
+ wdrożenie falami + piny. Nie tuning maszynowy (ADR 0018: pełne B0 tylko
na komendę). Ten plik to hub: procedura + rejestr rodzin. Raporty z pętli
poniżej (PMSSB-1, PMSSB-2, …). Po zakończeniu pętli rodzina jest ZAMKNIĘTA:
kolejny agent czyta raport i piny zamiast badać od nowa — ponowny audyt
tej samej rodziny wymaga nowego dowodu (sonda/Żywy Tester), nie przeczucia.

## Procedura pętli (checklist dla agenta)

0. Plan `docs/plans/PLAN_<data>-pmssb<N>-<rodzina>.md` (wzór: PMSSB-1) — commit.
1. POMIAR PRZED: sonda `/tmp/pmssb<N>-<rodzina>-przed.mjs` (scenariusze → tabela
   wynik/FINDING) + inwentarz kart rodziny i ich okien (instant vs sorcery!).
2. AUDYT: macierz kierunek × cel × timing × stan → findingi F1…Fn → fale.
   OBOWIĄZKOWE kontrole każdej pętli: (a) L41 — cast_spell / activate_ability /
   tryb modalny / trigger-decyzje / wrapper `apply_to_each_target` liczą TO SAMO
   (rozjazdy to findingi); (b) wymiar KOSZTU czaru (S11: 5 vs 2 many nie mogą
   remisować bez uzasadnienia); (c) anty-over-fix M429: najsłabszy realny
   wariant = dawna wartość, nowe wymiary to DOPŁATY/KARY.
3. IMPLEMENTACJA: rodzina `<rodzina>*` w `heuristic-params.js` (klucze na liście
   + defaults z uzasadnieniem) + wspólne helpery w `heuristic-bot.js` (L41).
4. TESTY: `test/audyt-pmssb<N>-<rodzina>.test.js` (wzorzec M429: decide/trace,
   anty-over-fix, pokrętła-sterują ×0) RED→GREEN + mutacje/dowód.
5. EWALUACJA: `bot-scoring-snapshot` (cel: bez regeneracji), tie-audit PO,
   mirror-eval (reguły vs off), Żywy Tester PO. Brak sygnału w lustrze przy
   wąskich stanach to wynik (B6), nie porażka — dowodem są piny.
6. DOKUMENTACJA: raport w tym hubie + wpis w rejestrze (status DONE) + wpis
   w PROJECT_HISTORY. Bez wpisu LESSONS, jeśli budżet lektury zablokowany
   (precedens PR136) — wtedy opis tu i w dzienniku.
7. Bramy (`npm test`, build, `test:all`), push po każdym kroku, PR.

## Rejestr rodzin

| Rodzina (typy efektów) | Kart | Status | Raport / testy / pokrętła |
|---|---|---|---|
| bounce (`bounce_*`, `owner_library_top_or_bottom`) | 8+3 trig | DONE (2026-09-25) | §PMSSB-1 niżej; `test/audyt-pmssb1-bounce.test.js` (29); `bounce*` (10) |
| tokeny (`create_token`) | 46 | DONE (2026-09-26) | §PMSSB-2 niżej; `test/audyt-pmssb2-tokeny.test.js` (28); `token*` (3) |
| dobieranie (`draw_cards*`, `draw_then_discard`) | 45 | DONE (2026-09-26) | §PMSSB-3 niżej; `test/pmssb3-draw-wave-a+b.test.js` (15); `instantDrawFoeEndBonus`, `ferociousLootExpected` (2) |
| zysk życia (`gain_life*`) | 28 | DONE (2026-09-26) | §PMSSB-4 niżej; `test/pmssb4-zycie-wave-{a,b,c}.test.js` (20); `gainLifeValue` + `imminentTriggerGainValue` (0 pokręteł) |
| kontry (`counter_spell*`) | 7 | DONE (2026-09-26) | §PMSSB-5 niżej; `test/pmssb5-kontry-wave-a.test.js` (15); HIGH_IMPACT 16→22 typy (0 pokręteł) |
| pump/grant (trików bojowych) | 52 | POKRYTE (M96/M173/M179/M218) | okna walki z uczestnictwa, nie z fazy — nie ruszać bez nowego dowodu |
| tap/untap | 29 | POKRYTE (M139) | okna tapowania — nie ruszać bez nowego dowodu |
| removal destroy/exile | 29+ | POKRYTE (M91/M234) | baza+worth+TMC+deathtouch+protekcja; exile≈destroy to świadome uproszczenie |
| obrażenia (`damage*`) | 32+ | POKRYTE (M237/4) | model per-cel; timing sorcery-burn do rewizji tylko z dowodem |
| odrzut (foe-side `discard*`) | 13 | DONE (2026-09-26) | §PMSSB-6 niżej; `test/pmssb6-discard-wave-a.test.js` (20); `foeRipValue` + guardy-fizzle (0 pokręteł) |
| domknięcie hold (self-rip + martwy −25) | 2 | DONE (2026-09-26) | §PMSSB-7 niżej; `test/pmssb7-hold-wave-a.test.js` (12); mapa 45→53 + usunięcie martwego kodu (0 pokręteł) |
| loot (`draw_then_discard` vs split) | 5 | DONE (2026-09-26) | §PMSSB-8 niżej; `test/pmssb8-loot-wave-a.test.js` (10); `LOOT_NET_VALUE` + M67-rider (0 pokręteł, −1 parametr) |
| triggery non-ETB (dies/attacks) | ~20 | DONE (2026-09-26) | §PMSSB-9 niżej; `test/pmssb9-triggery-wave-{a,b}.test.js` (19); `anticipatedDies/AttacksValue` (0 pokręteł) |
| triggery-ogon (tail/end/leaves) | ~40 | DONE (2026-09-26) | §PMSSB-10 niżej; `test/pmssb10-ogon-wave-{a,b1,b2}.test.js` (30); `anticipatedTailValue` + O-ring-sign + LIVE-gates (0 pokręteł) |
| sac-economics (exploit/devour) | 3 | DONE (2026-09-26) | §PMSSB-11 niżej; `test/pmssb11-sac-wave-a.test.js` (5); `anticipatedSacValue` = max(0,benefit-sac) (0 pokręteł) |
| pay-trigger-net (payMana) | 5 | DONE (2026-09-26) | §PMSSB-12 niżej; `test/pmssb12-pay-wave-a.test.js` (5); `anticipatedPayValue` = max(0,like×(benefit-pay)) (0 pokręteł) |
| persist-unification + stance | 1 | DONE (2026-09-26) | §PMSSB-13 niżej; `test/pmssb13-persist-wave-a.test.js` (2); persist = 0.5×return-body (0 pokręteł) |
| impulse-unification + saga | 3 | DONE (2026-09-26) | §PMSSB-14 niżej; `test/pmssb14-impulse-wave-a.test.js` (2); `impulseLookValue` + `anticipatedSagaValue` (0 pokręteł) |
| fog/prewencja | 4 | DONE (2026-09-28) | §PMSSB-15 niżej; re-audyt POKRYTEJ z NOWYM dowodem (zgłoszenie B + luka L41 free-castów); `test/audyt-pmssb15-prewencja.test.js` (16); `fogWindowValue` + `preventDamageThisTurnValue` (6 pokręteł `fogWindow*`/`preventEtb*`) |
| walka (`fight`/bite) | 2 | DONE (2026-09-28) | §PMSSB-16 niżej; `test/audyt-pmssb16-walka.test.js` (10); drabina wymiany w `fightExchangeValue` (L41: DT/deathtouch/lifelink/reclaim liczników; 8 pokręteł `fightBite*`/`fightKill*`/`fightMiss*`/`fightTrade*`) |
| kradzież do końca tury (`gain_control_until_end_of_turn`) | 3 | DONE (2026-09-28) | §PMSSB-17 niżej; `test/audyt-pmssb17-kradziez.test.js` (13); `gainControlValue` (L41: double-count M257+M157 skasowany; R3 = ZERO osi obronnej — CR 514.2; 6 pokręteł `gainControl*`) |
| proliferate (rider czaru) | 3 | DONE (2026-09-28) | §PMSSB-18 niżej; `test/audyt-pmssb18-proliferate.test.js` (9); `proliferateTargetValue`/`proliferateBestValue` (L41: rider = 0 pkt → wspólna skala z resolve_proliferate; R3 = wygrana 9→10 warta 1000, wyścig trucizn nieliniowy; 0 pokręteł) |
| search_library (tutory) | 11 | DONE (2026-09-29) | §PMSSB-19 niżej; `test/audyt-pmssb19-search.test.js` (7); `searchRiderValue` (L41: 3 ścieżki — tabela ETB/cast/aktywacja; R2 = Final Parting `two_cards` warty 0 wszędzie + guard deck-outu na 2 karty; 4 pokrętła `search*`) |
| mill (re-audyt) | 13 | DONE (2026-09-29) | §PMSSB-20 niżej; `test/audyt-pmssb20-mill.test.js` (6); `foeMillValue`/`selfMillValue` (L41: 4 skale → 1; R2 = presja deck-outu wroga + mill do 0 = wygrana przy ich dobraniu CR 121.4; R3 = self-mill pod reanimację w ręce; guard jedynego blokera anuluje premię); 5 pokręteł `mill*` |
| Cuombajj / opponent-target (1 karta) | 1 | DONE (mikro-pętla, 2026-09-29) | §PMSSB-21 niżej; nowy dowód = audyt remisów (190/190 rozróżnialnych w decyzji, wcześniej 41); `test/audyt-pmssb21-opponent-target.test.js` (5); sonda `tools/pmssb21-cuombajj-sonda.mjs`; 3 pokrętła `opponentTarget*` |
| Insatiable Appetite (`sacrifice_food_choice`, 1 karta) | 1 | DONE (mikro-pętla, 2026-09-29b) | plan `PLAN_2026-09-29b-pmssb22-insatiable-appetite.md` + wpis w PROJECT_HISTORY (sekcji w tym hubie brak — pętla mikro z zgłoszenia właściciela); `test/audyt-pmssb22-insatiable.test.js` (12); okna combat-tricka + delta zależna od Food w `pumpDelta`; 0 pokręteł |
| liczniki (`add_counter` + `add_counter_to_creatures_you_control`) | 33+2 | DONE (2026-09-29) | §PMSSB-23 niżej; plan `PLAN_2026-09-29e-pmssb23-liczniki.md`; `test/audyt-pmssb23-liczniki.test.js` (17); `counterEffectValue` (L41: cast = activate = klasyfikacja) + 6 pokręteł `counterThreat*`/`counterSpread*`/`counterEvasion*`/`counterLateWindow*`/`counterLethalClock*` |
| filtrowanie wierzchu (`scry` + `surveil`) | 12+5 | DONE (2026-09-30) | §PMSSB-24 niżej; plan `PLAN_2026-09-30a-pmssb24-scry.md`; `test/audyt-pmssb24-scry.test.js` (19); `libraryOrderValue` (CR 701.22a/701.25 — permutacje wreszcie wycenione) + reveal w widoku + drabina deck-outu przy millu + duplikaty/grób; 6 pokręteł `scryOrder*`/`cardDuplicate*`/`surveilGraveSynergy*` |
| koszt „odrzuć kartę” (`resolve_discard_choice`) | 1 | DONE (mikro-pętla, 2026-09-30b) | §PMSSB-25 niżej; plan `PLAN_2026-09-30b-pmssb25-discard.md`; `test/audyt-pmssb25-discard.test.js` (5); druga miara jakości karty (L41) domknięta wspólną `cardKeepValue`; reguła koloru właściciela (M408) nietknięta; 1 pokrętło `discardUnwantedBonus` |
| wartość landu (drabina per pip) | 1 | DONE (2026-09-30c) | §PMSSB-26 niżej; plan `PLAN_2026-09-30c-pmssb26-land-drabina.md`; `test/audyt-pmssb26-land-drabina.test.js` (13); `landKeepValue` wg specyfikacji właściciela (CR 305.6 dla kolorów); 10 pokręteł `landKeep*`/`landColored*Max`/`landTotal*Max` |

## PMSSB-1 — bounce (2026-09-25)

**Problem (sonda S10, owned by 25h):** bot nie rozumiał odbicia — remisował
38/38 na Vanish from Sight, odbijał własne stwory, nie widział tokenów ani
okna EOT. Pętla: audyt `kierunek × cel × timing × stan` (F1–F8) →
fale A/B/C → 29 pinów → suit 6668/6668.

**Plik testów:** `test/audyt-pmssb1-bounce.test.js` (A: 9, B: 8, C: 12).
**Kod:** `bounce*` w `src/controllers/heuristic-bot.js`,
pokrętła w `src/controllers/heuristic-params.js`.

### Fala A — siła efektu + cel wroga (commit `8ec4acb`)

- **F8 skala siły** (`BOUNCE_STRENGTH`): hand 0 < top 8 < bottom 18
  (bottom ≈ destroy-ETB — prawie removal).
- **F7 Vanish** (`owner_library_top_or_bottom` w `REMOVAL_EFFECTS`):
  skaluje wartością celu — koniec remisu 38/38.
- **F2 token wroga** +12 (CR 704.5d — znika na zawsze; symetria
  z `create_token` 12).
- **F3 aura wroga na celu** +30/aura (ta sama jednostka co trigger-decyzje —
  `bounceAuraDelta`, L41).
- **F6 ETB wroga** −1×`etbEnterBonusValue` (powtórka dla wroga — lustro F4).
- **Anty-over-fix:** goły 1/1 wroga bez kontekstu = DOKŁADNIE 80 (jak PRZED).

### Fala B — kierunek własny (commit `fae2482`)

- **F5 ratunek:** wrogi removal na stosie w mój cel → fizzle-premia 22
  (karta wroga w plecy, CR 608.2b) + utrzymane ciało (22 + 2×worth +
  TMC + deathtouch, lustro M234) − recast − tempo. Śmiecia nie ratujemy
  (pin F5-neg: pass wygrywa).
- **F4 reuse:** trigger własny (Invasive) liczy pełną ekonomikę kandydata
  (`fullEconomics`): ETB-reuse − recast − tempo; land −20 > reuse > śmieć.
- **Token własny** pod bounce'em: kara jak utrata stwora (CR 704.5d w obie
  strony) — NIE ratuj.
- **Własna aura na celu:** −30/aura (spada razem ze stworem).
- Pokrętła: `bounceRecastManaWeight: 3` (mana droższa od power —
  many nie wracają), `bounceTempoPenalty: 10` (połowa „karty").
- **Anty-over-fix:** własny 2/2 bez kontekstu = DOKŁADNIE −114.

### Fala C — timing + stan (commit `26ab5b7`)

- **F1 okna instantu** (jak tapowanie M139): EOT-wroga +8 / main-własna 0 /
  main-wroga −8. Sorcery bez wyboru okna: tylko premia precombat +8
  (main1 + gotowy atakujący + odtapowany bloker wroga). EOT-własny = 0.
  Jeden pokrętło: `bounceTimingSwing: 8`.
- **Fizzle ofensywny:** wrogi buff na stosie w JEGO własny cel (pump/grant/
  licznik/regeneracja) → +22 (2-za-1). TYLKO cel pojedynczy (CR 608.2b —
  przy wielu celach czar i tak się rozstrzyga). Czary-aury pomijamy
  (widok stosu nie niesie deskryptora aury).
- **Overflow** (CR 514.1, limit 7): ręka wroga 7+ → +12 (wymuszony odrzut),
  MOJA ręka 7+ → −12 (sam odrzucę). `bounceOverflowBonus: 12`.
- **Atakujący:** +2×obrażenia-na-twarz (lustro kary −2×amt za damage we
  mnie). **Lethal-dodge:** bounce zdejmuje lethal → +100 (życie > karta,
  poniżej twardego bana). `bounceLethalDodgeBonus: 100`.
- **Ratunek bojowy:** ofiara blokuje mojego ginącego atakującego, a bez
  niej przeżywa (reszta mocy < wytrzymałość, brak deathtoucha) →
  premia jak F5 (bez recastu). Po `damageAssigned` = 0 (CR 510).
- **Lockout:** wróg bez odtapowanych landów na recast (TMC) → +10
  (ta sama jednostka co `bounceTempoPenalty`). Same lądy (bez dorków —
  konserwatywnie, jak M247).
- **Screw:** trigger przy ≤2 własnych landach — cofnięcie landu −22
  (land-drop to życie); przy 3+ bez dopłaty.
- **L41-wrapper:** `apply_to_each_target` z wewnętrznym bounce'em
  (Sea God's Scorn) liczy te same wymiary (M233/2: relacje < pass /
  > pass trzymają, bez pinów exact).
- **Piny:** EOT 88 / main-własna 80 / main-wroga 72; overflow-foe 92;
  overflow-own −126; lockout-TMC5 112; lethal-dodge > 150.
- **Setupy „bez kontekstu" wymagają neutralnej many wroga**
  (`neutralFoeMana` — 3 odtapowane wyspy), inaczej lockout zapala się
  w każdym teście i psuje piny fal A/B.

### Znane granice (świadome, nie bugi)

1. Aktywowane zdolności bounce: katalog ma ZERO kart — gałąź gotowa
   (wymiary A/B/C przez wspólne helpery), timing tylko w cast_spell.
2. Czary-aury wroga na stosie nie dają fizzle-premii (brak deskryptora
   w widoku; ofiara i tak zwykle dostaje premię F3 po wejściu aury).
3. Ratunek bojowy ignoruje first/double strike (konserwatywna arytmetyka
   mocy — premia może nie wpaść, nigdy nie wpada na próżno).
4. Lockout liczy tylko lądy (nie dorki/pulę) — konserwatywnie.
5. Timing sorcery wymaga fazy `precombat_main` (M179/C); EOT-własny = 0.

### Pomiar końcowy

- Suit 6668/6668 GREEN, w tym golden-master BEZ regeneracji
  (`overallHash 227e6cbe…` stoi — 0/6 meczów drgnęło).
- Lustro 48 gier (talie z bounce'em, kandydat C vs baseline z 3 pokrętłami
  ×0): 24–24, brak sygnału — zgodnie z lekcją B6 to problem PRÓBKI, nie
  parametru (wymiary C zapalają się w wąskich stanach: EOT, pełne ręce,
  lethal-ataki z odpowiedzią w ręce — rzadkie w losowym self-playu).
- Dowód wartości fali C = 29 pinów behawioralnych (12 nowych) + testy
  sterowania pokrętłami (×0 zmienia wynik) + zero regresji w suicie.

## PMSSB-2 — tokeny (2026-09-26)

**Wybór rodziny** (delegacja właściciela): tokeny — największa rodzina
(46 kart) z 3 rozbieżnymi formułami (12 flat / 8 modal / worth-scaled),
bez timingu i bez celu (chump/haste/fodder/Treasure); M243/C tylko
w ścieżce zdolności. Odrzucone: zysk życia (23 — main-path cast_spell
bez wyceny), dobieranie (40 — timing EOT + overflow), kontry (5 —
mikro-pętla). Plan: `docs/plans/PLAN_2026-09-25i-pmssb2-tokeny.md`.

**Plik testów:** `test/audyt-pmssb2-tokeny.test.js` (A: 9, B: 7, C: 12).
**Kod:** `tokenBodyValue` + `token*` w `src/controllers/heuristic-bot.js`,
`tokenManaBankWeight` / `tokenTimingSwing` / `tokenManaCostTieBreak`
w `src/controllers/heuristic-params.js`.

### Fala A — wartość tokena (`3d88e94`; F3+F4+F6)

- **L41:** wspólny `tokenBodyValue` (koniec 3 formuł) — cast_spell,
  activate_ability, plot i tabela ETB liczą to samo; rdzeń
  `10×count×(2P+T)/3` bez zmian (kotwica: Chatter 1×1/1 = 60).
- **Rola (F4):** max(ciało, bank-many, bank-liczników) — Treasure ≈ 3
  (`tokenManaCostTieBreak`… nie: `tokenManaBankWeight: 3`, symetria
  z recastem); Mutagen widzi najlepszego gospodarza; ciało tylko
  stworom (koniec `?? 1` dla Skarbów). M243/C (Heap Gate) stoi.
- **Ilość (F6):** klucz `cards_named_in_graveyard` (Servant skaluje
  grobem ×3); ETB czyta amount (Jyoti z 0 tokenami = 0); Tumbleweed
  skaluje greatest_power także z plotu.
- **Golden:** 4/6 partii bit-identycznych; 2/6 po 1 wpisie
  (Servant przy pustym grobie −10.8 = −12×0.9), WYBORY TE SAME.
  Fixture zregenerowany `--write` (`overallHash 4245ddc8…`).

### Fala B — timing (`65e16cc`; F1+F2)

- **Okna instantu (F1):** EOT-własny +8, declare_attackers-wroga +8
  (reaktywny chump), po blokach wroga −8; `tokenTimingSwing: 8`
  (lustro bounce-F1). L41: cast_spell (raz na rzut) i activate_ability
  (raz na zdolność; dowód: Canonized +8/−8 w oknach wroga).
- **F2-flat ZWERYFIKOWANE:** Gather main1 = main2 (obie mainy przed
  walką wroga — ten sam użytek; S4 poprawne, nie luka). Nie-stwory
  bez okien (ich timing to przyszła pętla mana-castability).
- **Odkrycie architektoniczne:** EOT-własny zdolności zwiera
  pre-existing `wastefulStep` (L6440, −5/−30 przed pętlą efektów) —
  odnotowane jako obserwacja cross-family (zmiana zwarcia = blast
  radius na wszystkie zdolności, poza zakresem fali).
- **Golden:** 0/6 drgnęło — bez regeneracji fixture.

### Fala C — kontekst (`3a5bfa7`; F4-keywordy/F5/F7/F8)

- **Keywordy (F4):** flying +(2+moc)/ciało bez nietapniętej odpowiedzi
  w powietrzu (lustro keywordGrantWindowValue + grantsEvasion);
  lifelink +4/ciało (lustro grantu). Flurry: Δ 9 na kontekst nieba.
- **Wrogie (F5):** `tokenControllerId` (token wroga = ujemna rola);
  riderzy bezwarunkowe (upkeep ping, ETB bolt) MODELEM OBRAŻEŃ
  (lethal za darmo, pierwszy tick); atak: `tokenOnCombatDamage`
  (lustro drainOnAttack) tylko przy połączeniu. Robber: 13 → 17.67.
- **Koszt (F7):** `tokenManaCostTieBreak: 0.01`/CMC w cast_spell
  (ten sam efekt → tańszy wygrywa; X czyta bazę; flashback i modale
  dzielą ścieżkę). Fizzle (M106/Z2b) zwiera przed wyrazami końcowymi.
- **Dies (F8):** `blockExchangeOf` zwraca `diedBlockerIds` (addytywne);
  ginący bloker z dies→token = ubezpieczenie ciała (skala L41 jak
  ETB). Dissenter-chump: −1 → +19; Patron: 3 → 6 (bank!).
- **Golden:** 5/6 bit-identycznych; 1/6 (dom-brg|mir-wu@1001) 4 wpisy
  × −0.01 (grosz F7, czary CMC1 1×1/1 — kotwica Chattera), WYBORY TE
  SAME (scoreSum −0.02). Fixture zregenerowany (`5a2ad167…`).

### Znane granice (świadome, nie bugi)

1. Modal-trigger +8 dla tokenów MARTWY (0 kart w katalogu) —
   gałąź prewencyjna (precedens PMSSB-1/B).
2. Token 0/0 ze statykiem (Tarmogoyf Disy) = 0 — liczenie typów
   w grobie to osobna pętla; atak Disy strukturalnie podpięty.
3. Keywordy vigilance/infect/toxic/trample/hexproof i fodder
   odroczone (brak lustra); riderzy warunkowe (Wizard, Chocobo)
   czekają na modele zachowań.
4. Pełny opportunity-cost many OUT (osobna pętla, model castability);
   koszty zdolności tylko częściowo wyceniane (pełne L41 osobno).
5. Atakowy dies-kredyt (ubezpieczenie ginącego ATAKUJĄCEGO) nie
   istnieje — luka przyległa, poza planem fali C.
6. Dragon ETB zakłada twarz (dowolny cel, twarz zawsze dostępna);
   ciało wroga negowane symetrycznie (konserwatywnie).

### Pomiar końcowy

- Suit 6686/6686 GREEN po regeneracji (pełny przebieg 6684 + golden
  4/4 po `--write`; drifty golden udowodnione co do grosza przed
  każdym `--write` procedurą stash-baseline/worktree).
- Dowód wartości = 28 pinów behawioralnych + testy sterowania
  pokrętłami (×0 zmienia wynik) + zero zmian wyborów w golden.
- Rodzina ZAMKNIĘTA: ponowny audyt tylko z nowym dowodem.

## PMSSB-26 — wartość landu jako drabina (2026-09-30c)

Pętla otwarta z forwardu PMSSB-25 i **zamknięta specyfikacją właściciela** (nie domysłem).

**Pomiar PRZED** (sonda `scratch/pmssb26-land-przed.mjs`): wartość landu w ogóle nie zależała
od manabazy aż do starego progu przesycenia — basic-forest dawał **20 pkt przy 1, 2, 3 i 5
źródłach {G}**, a land utylitarny 19 pkt aż do sumy 6 lądów. Przy koszcie odrzucenia land
przegrywał z każdą kartą o niezerowym koszcie, bo reguła ciała liczy land jako
`2 · manaCost` = 0; przy 0 lądów bot wyrzucał land i zostawiał artefakt za {2} (19 vs 15).

**Specyfikacja właściciela:** land KOLOROWY — licznik = ile lądów danego pipa na stole
+ w ręce (0 → bardzo duża · 1 → spora · 2 → neutralna · 3+ → niska); land BEZBARWNY lub
utylitarny — licznik = suma lądów na stole + w ręce (0-2 · 3-4 · 5-6 · 7+).

**Fala A (`5f31e00`):** `landKeepValue(view, card)` w miejscu starej jednoprogowej gałęzi
landu, więc działa wszędzie tam, gdzie wspólna miara (scry, surveil, look_top, clash, mill,
discard). Kolory z `koloryZrodlaWidoku` = `getSourceForObject` (podtypy podstawowe CR 305.6
+ deskryptory many) — jedno źródło prawdy z `colorCastable`, zero map nazw kart (ADR 0002).
Land wielokolorowy liczony po **najmniejszym** liczniku kolorów. Domknięta też druga strona
luki L41: `discardCostPreference` czytał wspólną miarę tylko gdy ujemna, więc cała dodatnia
drabina zapadała się do jednego wyniku — teraz `-min(30, max(ciało, wspólna))`.

**POMIAR PO** (land vs stwór 2/1 = 11 pkt): bardzo duża **−10** · spora **2** ·
neutralna **12** · niska **31**.

**Kotwice:** C1 — reguła koloru właściciela (M408) nietknięta. C2 — drabina nie zależy od
`cardDuplicateDiscount` (to nie reguła duplikatów). C4 — progi są pokrętłami. C5 — cztery
stopnie monotoniczne.

**Zaktualizowane piny starej płaskiej reguły:** PMSSB-24/C3 (12/12 → 2/12), PMSSB-25/A2
(przesycenie per pip), PMSSB-25/A4 (14 → 11, „lepsza z dwóch miar"), `audyt-pr105` B
(przypadek brzegowy z 2 na 0 lądów) + nowy B2, `bot-wyceny-pakiet-c` E2/C1 + nowy C2.

**Mutacja M1** (stara płaska reguła) → RED: **14 pinów w 5 plikach**.

**Pokrętła (10):** `landKeepCritical` 30 · `landKeepHigh` 18 · `landKeepNeutral` 8 ·
`landKeepSaturated` −6 · `landColored{Critical,High,Neutral}Max` 0/1/2 ·
`landTotal{Critical,High,Neutral}Max` 2/4/6.

**Do potwierdzenia przez właściciela:** przy 2 lasach na stole i trzecim w ręce (3 źródła
{G}) bot oddaje teraz trzeci las zamiast 9-manowego czaru poza zasięgiem — to dosłowna
realizacja „3+ źródeł pipa → raczej odrzucaj", ale zmienia wcześniej uzgodnione zachowanie
z `audyt-pr105-bot-hand-top`. Próg jest pokrętłem `landColoredNeutralMax`.

**Bramki:** `npm test` 7172/7172 · `npm run build` 70 mod / 4654.1 kB ·
`npm run test:all` — wynik w §2026-09-30c historii.

---

## PMSSB-25 — koszt „odrzuć kartę” a wspólna miara (2026-09-30b, mikro-pętla)

Nowy dowód: audyt remisów PO posortowany po klasach, które mają zarówno remisy, jak i
decyzje o różnej punktacji: attack 19 614/191, block 17 253/150,
**`resolve_discard_choice` 1 176/24**, cast_spell 60 881/14, activate_ability 85 827/12.

**Znajdowanie (F1, L41 — druga miara jakości karty):** przy koszcie odrzucenia działała
równoległa miara oparta na ciele (`handCardKeepValue`: `2·moc + wytrzymałość` bez limitu,
keywordy, zdolności), która **nie zna zasięgu many, nasycenia lądów ani duplikatów** —
czyli tego, co wspólna `cardKeepValue` liczy dla scry/surveil/mill/look_top/clash.
Pomiar PRZED (sonda `scratch/pmssb25-discard-przed.mjs`):

| # | Stan | PRZED | Czytanie |
|---|---|---|---|
| D3/D6 | 2 lądy, Woolly Loxodon {5}{G}{G} + Highland Game 2/1 | bomba **−1**, stwór 14 | **BŁĄD** — trzyma kartę niedostępną ~5 tur (wspólna miara: −3) |
| D1 | 6 lądów na stole + 2 landy w ręce | land **19** | odrzucany, ale z powodu „land ma `manaCost` 0”, nie przesycenia |
| D2/D5 | 3 kopie + karta bez koloru many | bez koloru **40** | **POPRAWNE** — reguła właściciela M408 |

Podejrzenie o duplikaty zostało **obalone pomiarem**: D2/D5 to poprawna reguła koloru.

**Fala A (`1b483a6`):** nowa gałąź przed regułą ciała — kartę, której wspólna miara NIE chce
(`cardKeepValue < 0`: poza zasięgiem many, zbędny land przy przesycie), oddajemy chętnie
(`-cardKeepValue + P.discardUnwantedBonus`, domyślnie 5). PO: bomba **28 > 14**,
land **31 > 14**. Pokrętło: `discardUnwantedBonus` (×0 = sama wartość wspólnej miary,
kierunek decyzji bez zmian — pin A5).

**Kotwice:** A3 — reguła koloru właściciela (M408) nietknięta: karta bez koloru 40 pkt i to
ona idzie pierwsza. A4 (anty-over-fix) — karty grywalne mają tę samą wycenę co PRZED (14);
nowa gałąź zapala się tylko dla `cardKeepValue < 0`.

**Mutacja A-M1** (gałąź usunięta) → RED: **{A1, A2, A5}**; A3/A4 zielone.

**Nie otwieramy (forward):** przy 0 lądów reguła koloru każe odrzucić stwora zamiast landu
(pomiar D4: 42 vs 19). To konsekwencja M408, nie nowa luka — wymaga decyzji właściciela,
czy reguła koloru ma ustępować przed budową manabazy.

**Bramki:** `npm test` 7157/7157 · `npm run build` 70 mod / 4649.2 kB ·
`npm run test:all` **7428 / 7428, exit 0** (golden-master `ok 1696` bez regeneracji;
+5 względem 7423 z PMSSB-24 = nowe piny).

---

## PMSSB-24 — filtrowanie wierzchu biblioteki (`scry` + `surveil`) (2026-09-30)

**Zlecenie.** Właściciel: „bierz się za kolejne fale PMSSB aż do wyczerpania
budżetu sesji". Rodzina wybrana z pomiaru katalogu (583 karty, 184 typy
efektów, 673 wystąpienia): `scry` = 12 kart, `surveil` = 5, zero wierszy
w rejestrze. Wcześniejsze dotknięcia to łatki punktowe (M135 wspólna miara
karty, M148 permutacje w silniku, M211/A1 i M218/4 okno czaru, K 2026-09-22
Titan's Strength), więc to pierwsza pętla PMSSB dla rodziny, z nowym dowodem.
Plan: `docs/plans/PLAN_2026-09-30a-pmssb24-scry.md`.

**Inwentarz (20 kart z instrukcją układania własnej biblioteki, 17 z
`scry`/`surveil`):** czary z riderem (`titans-strength` pump+scry 1,
`expose-to-daylight`, `inspire-awe`, `rage-of-purphoros`, `curate`/`curate-stx`
surveil 2+draw 1, `vanish-from-sight` bounce+surveil 1); zdolności aktywowane
(`prismari-campus`, `seers-lantern`, `survivor-of-korlis`, `kishla-village`);
triggery ETB (`trained-arynx`, `nefarious-imp`, `omenspeaker`,
`merfolk-falconer`, `sifter-wurm` scry 3 + reveal wierzchu, `etherwrought-page`).

**POMIAR PRZED** (sondy `pmssb24-scry-przed.mjs`, `p8.mjs`, `f2.mjs`,
`falaB.mjs`, `falaC.mjs`):

| # | Scenariusz | Wynik | Wniosek |
|---|---|---|---|
| P1 | scry 2, wierzch [{5} czar, {2} stwór 2/1], obie zostają | obie permutacje = **20 / 20** | kolejność nie rozstrzyga → F1 |
| P2 | surveil 2, kolejność oryginalna vs odwrócona | **21 vs 20** | bonus `keepsOrder` kara lepsze ułożenie → F1 |
| P8 | `sifter-wurm` scry 3 + reveal; wierzch [{5}, {2}, land] | najlepszy wariant = **`bottom:t0`** (odkłada kartę {5}); 16 wariantów, **8** etykiet | reveal nie istnieje dla bota → F5; etykiety zlewają permutacje |
| P4 | surveil: mielenie zbędnego landu, delve w ręce vs bez | **25 = 25** | grób jako zasób niewidoczny → F3 |
| P5 | ręka pusta vs 4 karty, te same karty na wierzchu | **12/12 = 12/12** | kontekst ręki niewidoczny → F4 |
| P3 | odłożenie zbędnego landu, biblioteka 2 vs 12 kart | **26 = 26** | SCRY nie zmienia liczby kart — wynik POPRAWNY (korekta F2) |
| F2′ | surveil, biblioteka 2 karty vs 12 | **24 = 24** | mill bez drabiny deck-outu → F2 po korekcie |
| P6 | `titans-strength` main1 / main2 / end / declare_blockers | **−35 / −35 / −20 / −35** | kotwica M218/4 + K — nie ruszana |
| P7 | scry 1/2/3, trzy zbędne landy | **26 / 32 / 38** vs keep 20 | decyzja skaluje się poprawnie — kotwica |

**Findingi.**
- **F1 (L50/L41): kolejność kart na wierzchu nie była wyceniana.** Silnik
  oferuje permutacje (`game-state.js:7149-7160`; CR 701.22a „the rest on top
  of your library in any order", CR 701.25), a `resolve_scry` liczył tylko
  `bottomIds`. Przy surveil `keepsOrder ? 1 : 0` premiowało kolejność
  ORYGINALNĄ, więc świadome ułożenie przegrywało. Etykieta śladu nie kodowała
  `topOrder` (16 wariantów → 8 etykiet), więc audyt remisów widział remisy tam,
  gdzie są różne decyzje (klasa L34/L40 — ta sama co M203/2).
- **F2 — KOREKTA własnego findingu (L92).** Plan twierdził, że odłożenie karty
  na spód odsuwa deck-out. To nieprawda: scry przekłada kartę w obrębie TEJ
  SAMEJ biblioteki, więc liczba kart się nie zmienia i P3 (26 = 26) jest
  poprawnym zachowaniem. Deck-out (CR 121.4/704.5b) wchodzi przy surveil, bo
  tam karta idzie do grobu i biblioteka realnie chudnie — a `resolve_surveil`
  nie miał żadnej drabiny presji.
- **F3: grób bywa zasobem.** Surveil ≠ scry semantycznie (CR 701.25); przy
  Delve (CR 702.66) albo reanimacji zmielenie karty jest paliwem.
- **F4: wartość karty nie znała ręki.** Druga i kolejna kopia tej samej karty
  jest warta mniej; pomiar: ręka z czterema kartami = ręka pusta (12/12).
- **F5 (klasa L1 — brak danych): `revealTopGainLife` nie docierało do widoku.**
  Sifter Wurm: „scry 3, then reveal the top card of your library. You gain
  life equal to that card's mana value" — reveal następuje PO decyzji gracza
  (`game-state.js:2263`, CR 608.2), więc kolejność wierzchu steruje zyskiem
  życia. Zmierzony skutek: bot odkładał na spód dokładnie tę kartę {5}, której
  reveal chciał na wierzchu (5 życia → 2).

**Fale.**

| Fala | Commit | Co | PRZED → PO |
|---|---|---|---|
| **A** | `83c06b4` | wspólny `libraryOrderValue` (suma zdyskontowana `cardKeepValue` po pozycjach, liczona jako RÓŻNICA względem układu pierwotnego) w `resolve_scry` i `resolve_surveil`; usunięte `keepsOrder ? 1 : 0`; etykieta kodująca `topOrder` | permutacje **20/20** → ułożenie **23,2** > 20; surveil **21 vs 20** → **23,2 vs 20**; 16 wariantów = **16** etykiet |
| **B** | `184615d` | `revealTopGainLife` w `playerView` (pole warunkowe) + dopłata `gainLifeValue(mana value)`; wspólna `drawDeckingPenalty` przy mieleniu surveil — jako RÓŻNICA, nie wprost | reveal: **29,2 → 31,2** (20 życia) i **→ 33,2** (4 życia); biblioteka 3: keep **23,2** > mill **21,2**; biblioteka 1: keep **20** > mill **−42**; biblioteka 12 bez zmian (**27,2**) |
| **C** | `4e8c201` | duplikaty w `cardKeepValue` (3 pkt za kopię, limit 2) + grób jako zasób w surveil (2 pkt za źródło, limit 4) | odłożenie duplikatu **11 → 14 → 17** (0/2/3 kopie); mill **24 → 26** z Delve w ręce |

**Pułapka zmierzona, nie wymyślona (Fala A).** Pierwsza wersja członu
kolejności liczyła wszystkie karty, także zbędne: przestawienie śmiecia w głąb
dostawało `(1−d)·(keep_dobrej − keep_śmiecia)` = 6 pkt, czyli dokładnie tyle,
co jego odłożenie na spód (**26 vs 26**) — remis rozstrzygała kolejność
enumeracji i kotwica M135 („zbędny land idzie na spód") przegrywała. Poprawka:
w członie kolejności liczą się tylko karty, które chcemy dobrać (`keep > 0`),
bo pozbywanie się śmieci to robota spodu biblioteki, nie układu wierzchu.

**Druga pułapka (Fala B).** Drabina deck-outu karze samą strefę krytyczną
(−60 przy ≤3 kartach), więc użyta wprost obciążała też wariant „zostaw
wszystko" — zmierzone: **−36,8** za trzymanie kart przy bibliotece 3. Kosztem
decyzji jest dopiero różnica między zmieleniem a niezmieleniem.

**Kotwica obcej pętli.** Test M135 „surveil mieli zbędny land" miał bibliotekę
równą liczbie oglądanych kart (1), więc mielenie zostawiało bibliotekę PUSTĄ
— wycena deck-outu słusznie każe kartę zatrzymać. Test dostał `libraryExtra: 8`
z komentarzem; intencja bez zmian, 8/8 zielone.

**Pokrętła (6):** `scryOrderWeight` 1 · `scryOrderDiscount` 0,6 ·
`cardDuplicateDiscount` 3 · `cardDuplicateMaxCopies` 2 ·
`surveilGraveSynergyPerSource` 2 · `surveilGraveSynergyCap` 4. Każde ×0
przywraca wartość z poprzedniej fali (piny A2/C2/C5).

**Mutacje (L13, przez `/tmp` + `cp`):** A-M1 (powrót do `20 + delta`) →
dokładnie A1/A1b/A3/A4 RED · B-M1 (bez `revealBonus`) → B1+B2 · B-M2
(`millDecking = 0`) → B4+B6 · C-M1 (`duplicateDiscount = 0`) → C1 · C-M2
(`graveSynergy = 0`) → C4. Każda mutacja daje dokładnie oczekiwany zbiór RED.

**Znane granice i forwardy.**
1. **Clash — forward SKASOWANY po weryfikacji (L92).** Raport i handoff
   zapowiadały, że `resolve_clash_choice` ignoruje warunek wygranej
   (porównanie mana value z kartą przeciwnika). To nieprawda: silnik liczy
   `clash.won` z odsłoniętych kart i wystawia je w widoku
   (`pendingClash.won`, `cards`), a decyzja `putOnBottom` rozstrzyga wyłącznie
   los własnej karty (`game-state.js:3460-3475`, CR 701.30 — wygraną daje
   większa mana value karty ODŚLONIĘTEJ, nie jej położenie). Wycena
   `20 ± cardKeepValue` jest więc właściwa: to czysta decyzja o jakości karty.
   Nauczka ta sama co przy F2: zanim forward trafi do raportu, sprawdza się
   mechanikę w silniku, nie w intuicji.
2. **`reveal_top_pick_land_rest_grave`** (`blanchwood-prowler`,
   `satyr-wayfinder`) i `opponent_hand_card_to_top` (`chittering-rats`) to
   rodzeństwo rodziny — poza tą pętlą.
3. **Topdeck (ręka pusta) został forwardem, nie regułą.** P5 mierzył dwie
   rzeczy naraz (brak kontekstu ręki i duplikaty); fala C wdrożyła duplikaty,
   bo są jednoznaczne. Mnożnik pilności przy pustej ręce dotyka
   `cardKeepValue`, czyli też milla (PMSSB-20), clashu i `look_top` — wymaga
   osobnego pomiaru zasięgu, nie przy okazji.
4. **Wartość revealu jest mała przy pełnym życiu** (`gainLifeValue` daje 2-3):
   przy 20 życia różnica między odsłonięciem {5} a {2} to 1 pkt, mniej niż
   zysk z ułożenia chcenej karty wyżej (3,2). To świadome — o wymianie
   „tempo vs życie" decyduje istniejąca drabina życia (L41), nie nowa skala.

**Pomiar końcowy i ewaluacja.**

- `node tools/bot-tie-audit.mjs --gry=40` (480 partii, ten sam przebieg
  PRZED/PO; PRZED mierzony w worktree na `aa27111`): decyzje 255 677 →
  256 335; remisy między realnymi wariantami **3812 → 3792**;
  `resolve_scry` 116 decyzji / **39 remisów** → 144 decyzje / **10 remisów**
  (−74 %), przy czym PRZED wszystkie 39 miało w kolumnie „równoważne" —
  audyt nie odróżniał permutacji, bo etykieta nie niosła `topOrder` (F1).
  `resolve_surveil` w PRZED nie wystąpił wcale (0 wierszy), w PO ma 63 decyzje
  / 13 remisów (2 rozróżnialne) — to nowy wiersz, nie poprawka: partie po
  pierwszej zmienionej decyzji rozchodzą się, więc obecność klasy nie jest
  porównywalna 1:1. Klasy obce bez regresji: block 151 → 150, attack 195 → 191,
  `cast_spell` 14 → 14, `activate_ability` 12 → 12.
- `npm test` fast **7152 / 0 fail** (baza gałęzi `aa27111`: 7133; +19 pinów).
- `npm run build` **70 modułów / 4647,4 kB**.
- `npm run test:all` **7423 / 7423**, exit 0 (416 s) — golden-master „ślad bota
  == zamrożony fixture" zielony **BEZ regeneracji** (lista plików poniżej nie
  zawiera fixture'a).
- `git diff --name-only aa27111..HEAD` (kod): `src/controllers/heuristic-bot.js`,
  `src/controllers/heuristic-params.js`, `src/engine/game-state.js`,
  `test/audyt-pmssb24-scry.test.js`, `test/m135-wycena-scry-surveil.test.js`.

## PMSSB-23 — liczniki (`add_counter` i rodzeństwo) (2026-09-29)

**Zlecenie właściciela**: wybrać jeden efekt/rodzinę i przeprowadzić
**audyt przyczynowo-skutkowy** scoringu bota — kiedy efekt jest taktycznie
najsilniejszy, w jakich fazach i turach, na jaki cel, przy jakim stanie gry
i zagrożeniach — a następnie tak ustawić wycenę, by premiowała momenty
sensowne i karała bezsensowne. Wprost: NIE tuning maszynowy na dużej próbie
walk (ADR 0018), tylko przemyślany audyt i zmiany z niego wynikające.
Właściciel zezwolił rozbudować silnik o brakujące dane (nie było potrzeby —
widok niósł wszystko: P/T z licznikami, `counters`, `cantBeBlocked`,
`view.combat`).

**Wybór rodziny** (krok 2 procedury): inwentarz typów efektów katalogu
(`createCardRegistry().all()`, 179 typów) × rejestr. Największa rodzina
poza rejestrem: **`add_counter` — 33 karty / 34 wystąpienia**. Rodziny
większe (`create_token` 41, `draw_cards` 40, `pump` 34) są DONE, a
`pump/grant` z rejestru to pump **do końca tury** (M96/M173/M179/M218 —
okna walki); licznik jest zasobem **trwałym**, więc to inna decyzja.
Skład: 25× `+1/+1`, 2× `stun`, 2× `charge`, 2× `oil`, 1× `-1/-1`, 1×
`level`, 1× `point`; okna: 7 czarów (5 sorcery, 2 instant), 7 zdolności
aktywowanych, ~19 triggerów. Rodzeństwo:
`add_counter_to_creatures_you_control` (2 karty) — **zero gałęzi wyceny**.

**Pomiar PRZED** (sondy `/home/user/scratch/pmssb23-{liczniki-przed,r2,r3,r5}.mjs`;
tabela w planie `docs/plans/PLAN_2026-09-29e-pmssb23-liczniki.md`):

| Scenariusz | PRZED | Wniosek |
|---|---|---|
| Stall Out {2} (tap + 3 stun) na 1/1 / 3/3 / 6/6 trample / 8/8 | 62 / 62 / 62 / 62 | cel arbitralny |
| ten sam czar na JUŻ TAPNIĘTYM 6/6 (tap = no-op) | 38 | 3 liczniki stun warte 0 |
| Sleep of the Dead {1} (tap + lock 1 tura) na 1/1 … 8/8 | 13 → 27 | `dont_untap` wyceniony, stun nie |
| Trigon `-1/-1` na 1/1 (kill) / 3/3 / 6/6 | 34 / 16 / 16 | kill tak, zagrożenie nie |
| Dragonscale Boon: 2/2 Flying / 2/2 Menace / 2/2 wanilia | 68 / 68 / 68 | ewazja niewidoczna |
| Courage in Crisis w Głównej 1 vs w Głównej 2 | 70 / 70 | timing = 0 |
| Lifecrafter's Gift: 1 / 2 / 4 stwory z licznikiem (rider rozlania) | 74 / 74 / 74 | rider = 0 |
| Cenn's Tactician: cel 5/5 / 1/1 Soldier | 38 / 14 | `counterHostValue` działa |
| Rustvine oil (konsument bez roboty) | −6 → pass | M173/D stoi |

Fakt z widoku (sprawdzony): wpis `playerView` niesie P/T **z licznikami**
(2/2 z `+1/+1` → 3/3), więc „+6" przy celu z licznikiem to waga ciała
gospodarza (2 × 3), nie wartość ridera — rider rozlania był wart dokładnie 0.

**Findingi**: F1 (L41) — w `cast_spell` wyceniane były tylko liczniki
przyjazne, a klasyfikacja miała trzy kopie (`BENEFICIAL_COUNTERS`, lista
`beneficial`, `DEBUFF_COUNTERS`); F2 — cel wrogiego licznika bez wymiaru
zagrożenia; F3 — rider rozlania bez gałęzi; F4 — ewazja gospodarza
niewidoczna; F5 — timing: `counterCombatBonus` zapala się tylko dla walki,
która TRWA (`pumpImprovesOutcome` → `combatOutcome` = null poza walką).
Ścieżka triggerów (`resolve_trigger_target`) okazała się poprawna: Lodestone
Needle na 6/6 trample = 48 > na 1/1 = 33 > `none` = 0 > własny = −26.

**Fala A — L41** (`b9fe2e4`): jedna klasyfikacja (`STAT_COUNTERS` /
`DEBUFF_COUNTERS`, CR 122) + jedna `counterEffectValue(view, cel, licznik,
amount, {source})` w OBU ścieżkach; reguły M221/F, M429 i M173/D w jednym
miejscu, wartości bez zmian. PO: Stall Out na 6/6 = 62 (PRZED 40), na
tapniętym 60 (PRZED 38), na własnym −89 (PRZED +1); blokada na trzy tury
(62) bije blokadę na jedną (23). Mutacja A-M1 (gałąź czarów wycenia tylko
liczniki przyjazne = stan PRZED): 4 piny RED, kotwice GREEN.

**Fala B — cel i odbiorcy** (`33c871e`): `counterThreatWeight` 0,5 /
`counterThreatCap` 15 — ta sama miara co PMSSB-21 (`opponentTargetThreatWeight`),
tylko w gałęzi „cel przeżyje" (dobijanie już skaluje się mocą, limit trzyma
je wyżej); `counterSpreadPerRecipient` 4 (= `counterAmountWeight`) × odbiorcy
× amount, cel główny liczony jako odbiorca (efekt celowany rozstrzyga się
pierwszy). PO: Stall Out 63,5 / 66,5 / 71 / 74 (PRZED 62 wszędzie), Trigon
kill 34 > 6/6 = 25 > 3/3 = 20,5 (PRZED 16/16), rider 72/78/82/90 dla
0/1/2/4 nosicieli (PRZED 68/74/74/74). Mutacje: B-M1 → 7 RED, B-M2 → 1 RED.

**Fala C — okna** (`4f46522`): `counterEvasionBonus` 5 (gospodarz, którego
przeciwnik MA czym blokować, ale nie dosięgnie — flying bez odpowiedzi,
Menace przy jednym blokującym CR 702.111, `cantBeBlocked` z widoku; pusty
stół wroga NIE zapala dopłaty, bo niczego by nie rozstrzygała),
`counterLateWindowPenalty` 4 (walka tej tury już za nami: Główna 2 / faza
końcowa), `counterLethalClockBonus` 50 (moc po liczniku ≥ życie przeciwnika
+ atak nie do zatrzymania `attackHitsFace`). PO: 1 bloker — flying 73 =
menace 73 > wanilia 68; 2 blokerów — flying 73 > menace 68; main1 70 >
main2 66; wróg 3 życia i 2/2 flying — Dragonscale 118 / Courage 120 (×0: 68).
Mutacje C-M1/C-M2/C-M3 → dokładnie po jednym pinie RED.

**Korekta własnego over-fixu (M429)**: pierwsza wersja Fali C (premia +4 za
Główną 1 i dopłata za ewazję także przy pustym stole wroga) podnosiła KAŻDY
licznik w najczęstszym oknie i poruszyła **8 kotwic innych pętli** (M429
Mutagen anty-over-fix, PMSSB-2/A/F4, PMSSB-16/R1 + anty-over-fix, PMSSB-18
R1+R2, R2+R3, R3, R3-guard). Wniosek wdrożony: dopłata, która dotyczy
WSZYSTKICH celów jednakowo, nie rozstrzyga żadnego wyboru — tylko pompuje
wycenę czaru względem innych zagrań. Po przebudowie (kara za zamknięte okno
zamiast premii za otwarte; ewazja tylko wobec istniejących blokujących)
wszystkie 8 kotwic wróciły do dawnych wartości, a każda mutacja czerwieni
dokładnie jeden pin.

**Znane granice / forwardy**:
1. Tabela riderów ETB (`add_counter: 6/5`) nie używa wspólnego helpera —
   w chwili wyceny ETB nie ma jeszcze celu, więc kierunek rozstrzyga
   `resolve_trigger_target` (pomiar: poprawnie). Zostaje świadomie.
2. Silnikowy `HOSTILE_COUNTERS` (`effect-intent.js:44`) nie niesie liczników
   minusowych (`-1/-1`, `-1/0`, `-0/-1`); w katalogu nie ma dziś triggera
   z takim licznikiem, więc rozjazd jest nieaktywny — do wyrównania przy
   pierwszej takiej karcie (w bocie klasyfikacja jest kompletna).
3. `charge` wycenia gałąź `station_counters` (M429), `oil` — gałąź zasobowa
   z konsumentem (M173/D): obie poza tą pętlą, bez zmian.
4. Wymiar KOSZTU czaru (S11): czary licznikowe różnicuje `counterHostValue`
   (liczba liczników × `counterAmountWeight`) + baza 50; pomiar: Courage {3}
   = 70 > Dragonscale {4} = 68 (rider proliferate +2 vs untap −4) — kolejność
   wynika z efektów, nie z kosztu; bez regulacji (brak dowodu, że remisuje
   cokolwiek, co koszt rozstrzyga).

**Pomiar końcowy i ewaluacja**: fast **7133/7133** · `test:all` **7404/7404**
(exit 0; golden-master „każda partia zgadza się z fixture" — BEZ regeneracji,
`git diff --name-only 7fae454..HEAD` = plan + `src/controllers/heuristic-bot.js`,
`src/controllers/heuristic-params.js`, `test/audyt-pmssb23-liczniki.test.js`) · build
**70 / 4634,8 kB** · audyt remisów `tools/bot-tie-audit.mjs --gry=40`
(480 partii, ten sam przebieg PRZED i PO): PRZED (`7fae454`) 255 342 decyzji /
13 148 remisów / 3821 remisów między realnymi wariantami, PO (`4f46522`)
255 677 / 13 157 / 3812; klasy decyzyjne block 156→151, attack 198→195,
`cast_spell` 13→14, `activate_ability` 12→12, `resolve_trigger_target` 2→2.
**Brak sygnału w lustrze jest tu wynikiem, nie porażką (B6)**: `grep` po
`decks/` nie znajduje ŻADNEJ karty tej rodziny (stall-out, lifecrafter's gift,
dragonscale boon, courage in crisis, trigon of corruption, hunt the weak,
knockout maneuver, cenn's tactician, enduring sliver, rustvine cultivator,
lodestone needle, malamet battle glyph) — self-play obecną pulą talii w ogóle
nie wchodzi w rodzinę. Dowodem są piny (17) i mutacje (6, każda RED).
Forward: talia z licznikami w puli tie-audytu, jeśli rodzina ma być mierzona
zwierciadłem.

## PMSSB-21 — opponent-target / Cuombajj (mikro-pętla) (2026-09-29)

**Wybór rodziny** (ADR 0021 krok 2): rejestr nie ma rodzin bez statusu
DONE/POKRYTE, więc nowym dowodem jest **audyt remisów**
(`node tools/bot-tie-audit.mjs --gry=60` = 720 partii, 12 par talii).
Wiersz rejestru „Cuombajj (1 karta) — OUT (mikro-pętla)" miał 41 remisów;
przy pełnym przebiegu `resolve_opponent_target` ma **305 decyzji i 190
remisów na maksimum, z czego 190/190 ROZRÓŻNIALNYCH** (dane się różnią,
punkty nie) — największy klaster poza rodzinami POKRYTYMI i poza szumem
walki (blok/atak remisują najczęściej na RÓWNOWAŻNYCH tokenach). Zgodnie
z rejestrem pętla jest **mikro** (bez fal): plan
`docs/plans/PLAN_2026-09-29-pmssb21-opponent-target.md`, sonda
`tools/pmssb21-cuombajj-sonda.mjs` (scenariusze A–D, PRZED/PO).

**Zakres**: `resolve_opponent_target` — Cuombajj Witches (CMR): „{T}: This
creature deals 1 damage to any target and 1 damage to any target of an
opponent's choice". Drugi cel wskazuje przeciwnik (CR 601.2c; aktywacja
czeka na jego decyzję przed zapłatą kosztów) — **bot jest WYBIERAJĄCYM**.
Enumeracja silnika: stworzenia aktywującego, potem reszta, na końcu gracze.

**Finding F1** (klasa L131): gałąź „wrogi stwór, który OCALA" miała gołą
stałą 30 → wybór między ocalałymi celami był ARBITRALNY (pierwsza oferta
enumeracji). POMIAR PRZED (sonda, scenariusz A: 4/4 i 1/3 aktywującego):
oferty 30 / 30 / 30, wybór = czarownica (pierwsza w enumeracji). Dobicie
(102 przy 1/1), własny stwór i gracze działały — nie ruszane (nie są
remisami; wybory modelu M130).

**Fala R1 (jedyna)**: baza `opponentTargetFoeBase` = 30 (kotwica M429:
najsłabszy realny wariant = dawna wartość, nowy wymiar to DOPŁATA) +
`min(opponentTargetThreatCap 15, (moc·2 + wytrzymałość) ·
opponentTargetThreatWeight 0,5)`. Uzasadnienie: 1 obrażenie trwa do końca
tury (CR 514.2), więc wśród ocalałych celów wartość rośnie z zagrożeniem —
miękczenie największego atakującego/blokera przybliża zabicie go w tej
samej turze. Limit nie zbliża się do progu dobicia (100 + 2·moc).

**Piny PO** (`test/audyt-pmssb21-opponent-target.test.js`, 5): S01 4/4 = 36
> 1/3 = 32,5 (wybór „big"; dawniej pierwsza oferta) · S02 12/12 = 45 (cap)
· S03 dobicie = 102, własny 2/2 = 6, gracz-wróg = 15 — kotwice M130 bez
zmian · S04 `opponentTargetThreatWeight` ×0 → remis 30/30 i powrót do
pierwszej oferty (kotwica anty-over-fix) · S05 identyczne cele nadal
remisują (remis uczciwy, L5). **Mutacje L13**: W-M (waga→0), CAP-M (cap→0),
BASE-M (baza→20), KOT-M (brak dopłaty w kodzie) = **4× RED**.

**Pomiar PO** (ten sam audyt remisów): rozróżnialne remisy tej decyzji
**190 → 0**; zostało 16 remisów RÓWNOWAŻNYCH (te same statystyki celu, np.
dwa bliźniacze tokeny — uczciwe) i 16 remisów „top" na 306 decyzji;
globalnie akcyjnych remisów 5903 → 5720 (−183).

**Bramy**: fast **7029/7029** · golden 4/4 bez dryfu (pary golden nie
zawierają Cuombajj — karta jest tylko w `decks/wiedzmin-bg.txt`) · build
70 / 4580,9 kB · `test:all` (w tym samym PR).

## PMSSB-20 — mill (re-audyt) (2026-09-29)

**Dowód**: widok niesie obie biblioteki jako `hidden` ale ZLICZALNE
(liczebność jawna — CR 402.2 chroni treść i kolejność). POMIAR PRZED
(tome-scour, `/tmp/pmssb20-mill-przed.mjs`): mill wroga = **85 niezależnie
od jego biblioteki** — mill 5 przy ich 5 kartach (dobijają do 0 = przegrają
przy najbliższym dobraniu, CR 121.4/704.5b) warte tyle samo co mill w pełną
bibliotekę! Self-mill = **−65 niezależnie od reanimacji w ręce** i od
zapasu własnej biblioteki (flat −80 bez drabiny deck-outu).

**Luki**: (1) 4 skale tego samego efektu (L41: cast −80/+20+3n, M96
−25/+6+2n, guard 8356, flat +2); (2) foe-mill ślepy na wyścig bibliotek;
(3) self-mill pod reanimację niewidoczny (patchwork: celowany flat −80,
niecelowany ma +6 synergii); (4) flat −80 nie stopniował ryzyka deck-outu.

**Model**: `foeMillValue` = `20+3n` (baza historyczna) + presja
`4·max(0, 12−po)` / `+400` gdy mill DOMYKA ich niepustą bibliotekę (wygrana
przy ich dobraniu); `foeLib ≤ 0` → baza płaska (nie ma czego mielić).
`selfMillValue` = drabina deck-outu (−120/−20/−10) + synergia grobu
(+6/−25 — M200/R: zakryta biblioteka = MOŻLIWOŚĆ) + `15·min(reanimaty w
ręce, 2)` − `55` gdy celowany (guard −80 historyczny). Guard „jedyny
bloker" (M202/J) = `−60 + foeMillValue` (anulacja premii — właściciel:
utrata jedynego blokera > nawet mill-domknięcie; klasa L3).

**Kotwice PO** (test 6, RED 4/6 — 2 kotwice L41-bez-dryfu celowo zielone):
S01 foe fat 85 (baza) · S02 ich 6 kart 129 (presja) · S03 ich 5 kart 485
(wygrana) · S04 self bez synergii −65 (guard) · S05 self + reanimate −50
(combo +15) · S06 self bibl. 6 −85 (drabina deck-outu).

**Brany**: fast 7020/7020 · all 7291/7291 (golden BEZ dryfu) · build
70/4578.4 kB · tie 28.3%/10.7% · mirror 48-48×3 · Tester 3×0.

## PMSSB-19 — search_library (tutory) (2026-09-29)

**Wybór celu** (BACKLOG pusty; rozeznanie: `search_library_*` — 11 kart,
rider w cast/aktywacji = 0; Final Parting `two_cards` = 0 wszędzie).
Plan: `docs/plans/PLAN_2026-09-29-pmssb19-search.md`; POMIAR PRZED:
`/tmp/pmssb19-search-przed.mjs` (S01–S06b).

**Audyt przyczynowo-skutkowy (R1–R4) + wdrożone wnioski** — `searchRiderValue`
(CR 701.23b — search + shuffle) wywoływany z TRZECH ścieżek (tabela ETB,
cast_spell, activate_ability — L41):

- **R1 (rider 0 w cast/aktywacji)**: 9/10 żyły tylko w tabeli ETB. S01
  Final Parting = 50 (sama baza — 2-kartowy tutor warty 0!), aktywacja
  Elka = 2 (payoff niewidoczny — bot nie poświęcał stwora po ląd).
- **R2 (`two_cards` = 0 wszędzie + guard deck-outu)**: `search_library_
  two_cards_hand_and_grave` nie miał wartości, wpisu w tabeli ETB ANI
  wpisu w `LIBRARY_SEARCH_EFFECTS` (C zgłoszenie Elka — karta opuszcza
  bibliotekę bezpowrotnie; Final Parting zabiera AŻ 2). Wartość 16 = 9
  (najlepsza do ręki) + 7 (połowa grobowa = setup reanimacji); guard:
  biblioteka 10 → kara 132 (60+12·6) przebija zysk (−66).
- **R3 (selekcja > losowe dobranie)**: tutor daje NAJLEPSZĄ kartę kategorii
  (drawCardValue 6) → baza 9 = 6 + selekcja; ląd do ręki przy manascrew
  (moje lądy < 3) = +5 (odbraniczanie gry — stan gry).
- **R4**: `resolve_search_choice` (found > fail, ląd +30, statystyki,
  domain) zostaje jak jest (Temat 6 + zgłoszenie B).

**Kotwice PO (biblioteka 24)**: S01 **66** (50+16), S01b bibl. 10 = **−66**
(guard), S03 chocobo 0 lądów = **83,96** (delta 5 = screw), S06b elk
activate = **12** (było 2), S04 kor **72,9009** / S05 empath **70,1991**
(bazy ETB 10/9 BEZ dryfu — L41). 4 pokrętła `search*`.

**Świadomy dryf**: golden-master — 6/6 identyczne wybory i scoreSum;
1 partia (dominaria|mirrodin@1000) hash-only (wyceny nie-wybranych) →
fixture `--write`; M336/F: lokalizator proliferate zwężony do
`searchRiderValue` (moje helpery search wylądowały w regionie — granica
rodzin). Dowody: `test/audyt-pmssb19-search.test.js` (7; RED 5/7 na
starym — 2 kotwice L41 celowo przechodzą). Bramy: fast 7014/7014;
all 7285/7285; build 74 / 4574,4 kB; tie-audit 28,3% (10,8% realnych);
mirror 8:8 (0.5); Żywy Tester 3×0 zgłoszeń.

## PMSSB-18 — proliferate (rider czaru) (2026-09-28)

**Wybór celu** (BACKLOG pusty; rozeznanie: `resolve_proliferate` wyceniony
M341, ale rider `proliferate` w cast_spell = **0 pkt** — brak gałęzi).
3 karty: `courage-in-crisis` (+1/+1 counter → proliferate),
`spread-the-sickness` (destroy → proliferate), `fuel-for-the-cause`
(counter spell → proliferate). Plan:
`docs/plans/PLAN_2026-09-28-pmssb18-proliferate.md`; POMIAR PRZED:
`/tmp/pmssb18-proliferate-przed.mjs` (S01–S06).

**Audyt przyczynowo-skutkowy (R1–R5) + wdrożone wnioski** — per-cel
`proliferateTargetValue` (TA SAMA skala dla ridera i wyboru, L41) +
`proliferateBestValue` (najlepszy podzbiór = suma dodatnich — CR 701.34a
„another counter of each kind already there", dawniej 701.27a):

- **R1 (rider 0 pkt)**: S03 (wróg 9 poison — tick WYGRYWA grę, CR 104.3d)
  = 68 — tyle samo co plansza bez trucizny! Unifikacja: rider = wartość
  najlepszego podzbioru.
- **R2 (synergia kolejności)**: `add_counter` rozstrzyga się PRZED
  proliferate — świeży licznik też się proliferuje (Courage = 2× +1/+1!);
  `destroy_permanent` usuwa cel z kandydatów (liczniki giną z nosicielem).
- **R3 (wyścig trucizn nieliniowy)**: tick wroga = `1 + poison` (flat 1
  z M341 niedowartościowywało presji 8→9); 9→10 = **wygrana** (1000 jak
  resolve); własna 9→10 = NEVER/cały podzbiór (CR 104.4b — remis nie jest
  wygraną; M341/F3 + M336/F pas bezpieczeństwa na sztywno w gałęzi).
- **R4 (dobicie)**: -1/-1 na wytrzymałości 1 = +4/−6 (SBA 704.5a);
  +1/+1 = ±2 per-cel (płasko — wzrost +2/+2 niezależnie od zasobu).
- **R5 (jałowość)**: bez ISTNIEJĄCYCH liczników/poison = 0 (CR 701.34a);
  L119: charge/oil/shield/energia gracza bez wagi (brak reguły konsumenta).

**Kotwice (PRZED→PO)**: S01 68→**70** (synergia), S02 80→**87** (+2 licznik
+5 poison), S03 68→**1068** (wygrana!), S04 86→**90** (dobicie) + wariant
`a->dying` **78≠82** (wykluczenie zniszczonego), S05 **86** (jałowy),
S06 50→**57**. 0 pokręteł (wspólne stałe — wzorzec PMSSB-14).

**Świadomy dryf**: golden-master — 5/6 partii bit-po-bit; 1 partia
(ravnica|innistrad-wu@1001): IDENTYCZNE wybory i scoreSum — różnią się
tylko wyceny nie-wybranych opcji → fixture `--write`. M341/C: fixture
2→10 (własność SUMA+PRZEMIENNOŚĆ bez zmian — R3 zmieniła wagę);
M336/F: lokator strukturalny przeniesiony na helper+gałąź (duch pinu
bez zmian: NEVER dosłownie, dobiecie -1/-1, toughness z widoku; nazwy
kart usunięte z komentarzy helpera — ADR 0002).

**Dowody**: `test/audyt-pmssb18-proliferate.test.js` (9; RED 7/9 na starym
kodzie — weryfikowany stash). Bramy: fast 7007/7007; all 7278/7278;
build 73 / 4570,8 kB; tie-audit 28,3% (10,8% realnych, bez cast_spell
w grozach); mirror 8:8 (0.5); Żywy Tester 3×0 zgłoszeń.

## PMSSB-17 — kradzież do końca tury (gain_control_until_end_of_turn) (2026-09-28)

**Wybór celu** (BACKLOG pusty; ciąg dalszy pętli — 3 karty: Act of Treason /
Awaken the Sleeper / Spreading Insurrection). Plan:
`docs/plans/PLAN_2026-09-28-pmssb17-kradziez.md`; POMIAR PRZED:
`/tmp/pmssb17-kradziez-przed.mjs` (S01–S08).

**Audyt przyczynowo-skutkowy (R1–R5) + wdrożone wnioski** — jeden helper
`gainControlValue` (czasowa zmiana kontroli: CR 110.2 właściciel ≠ kontroler;
CR 506.4 zmiana kontroli usuwa z walki; CR 514.2 „do końca tury" kończy się
w cleanup):

- **R1 (double-counting, L41)**: dwa bloki z epok M257-r5b/C (`3·power+eq`)
  i M157/L28 (`12+2p+t`) SUMOWAŁY się w tej samej pętli efektów — 4/5 wroga
  = 50+37 = **87**, własna = 50−110 = **−60** (wzór potwierdzony co do
  punktu). Unifikacja: `gainControlValue`.
- **R2 (drabina)**: wartość = JEDEN pewny atak z haste w twarz właściciela
  (`+2·moc`) + luki w bloku (`+4·min(luki,3)` — skradziony wypada z ich
  blokujących, dołącza do moich) + equipment (M257: `25+5·n` — bonus jest
  WYCENĄ ridera `destroy_equipment_attached`, który własnej nie ma).
  Kotwice PO: S01 87→**67**, S02 74→**63**, S04 117→**97**, S08 68→**69**,
  S06 87/74→**63/59** (ich druga kreatura blokuje lukę — brak bonusu).
- **R3 (ZERO osi obronnej — werdykt z ujemnym wynikiem!)**: kradzież
  sorcery-speed wraca w cleanup PRZED ich turą (CR 514.2) — skradziony
  napastnik znów u nich atakuje. S07 (życie 5, ich 5/5) = 92→**69** =
  zwykły atak, BEZ dopłaty ratunku (fogWindowLethalSaveValue nie tu).
- **R4 (trwałość)**: karta wraca — zysk trwały tylko gdy ginie; nie
  zgadujemy bloków (L41); combo steal+sac = PMSSB-11.
- **R5**: storm (Insurrection) — poza zakresem (rodzina storm).
- **M231**: cel własny/brak = `−gainControlOwnPenalty (70)` → −20 (było −60)
  — poniżej passu; progi behawioralne M231/M157/M257 nietknięte (28/28).

**Pokrętła (6)**: `gainControlStealBase/AttackWeight/OpenValue/EquipBonus/
EquipPerItem/OwnPenalty`. Testy: `test/audyt-pmssb17-kradziez.test.js`
(13: kotwice ×8 + progi + pokrętła ×3; RED 12/13 na starym kodzie).

**Świadomy dryf**: golden-master — patrz bramy poniżej (regeneracja z
dowodem izolacji jak w PMSSB-16). Bramy: fast 6998/6998; all 7269;
tie-audit; mirror; Żywy Tester 3×0.

## PMSSB-16 — walka bez fazy walki (fight / bite) (2026-09-28)

**Wybór celu** (BACKLOG pusty; rodzin do strojenia coraz mniej → walka
z listy rekomendacji, 2 karty: Territorial Hammerhead `fight`, Hunt the
Weak `damage_from_target_power` (bite)). Plan:
`docs/plans/PLAN_2026-09-28-pmssb16-walka.md`; POMIAR PRZED:
`/tmp/pmssb16-walka-przed.mjs` (S01–S07).

**Audyt przyczynowo-skutkowy (R1–R6) + wdrożone wnioski** — wspólny
helper `fightExchangeValue` (fight CR 701.14a „równolegle", bite one-sided;
L41: damage nie-bojowe → **deathtouch i lifelink DZIAŁAJĄ**, first strike/
trample NIE; SBA 704.5h):

- **R1 (bite)**: chip `8+2·dPow`, kill bonus 15 (M237-family, `fightBite*`).
- **R2 (DRABINA WYMIANY — serce audytu)**: liczy się TO, CO TRACĘ i CO
  ZYSKUJĘ, nie „sam fakt trafienia" (stare −20/ginę było płaskie):
  `kills&&!dies` = `25+2·vPow` (czysty zysk); `dies` = `2·((kills?victimWorth:0)
  − dealerWorth) − fightTradeCardCost(25)`; **`!kills&&dies`** = to samo
  z zerowym benefitem + `fightWastedDeathExtra(12)` — musi przebić bazę
  czaru 50 już dla ciał 2/2+ (M167/F); `!kills&&!dies` = 5 (ślad).
  Kotwice: S01 kill-only 3/3v2/2 = **103**; S02 mój 1/1 DT vs 6/6 = **49**
  (wymiana + DT); S03 mój 6/6 vs ich 1/1 DT = **−11 → PASS** (było 119!);
  S04 Knockout counter-lethal = **97**; S07 Hunt the Weak wymiana+counter
  = **25**.
- **R3 (lifelink)**: ±`gainLifeValue` tylko gdy zabijam (bite z lifelinkiem
  NIE jest samolifelinkiem z S07 — sprawdzone sondą): S05 = 97 / S05b = 94
  (delta 3 = life-tiers).
- **R4**: patrz R2 (wasted-death tier).
- **R5 (reclaim liczników, L41)**: rider `add_counter` na gospodarzu
  SKAZANYM (fight → ginie; bite → bite go nie rusza, zostaje) nie kupuje
  nic → `−counterHostValue` (ta sama skala co w cast_spell: 42/18 zweryfikowane);
  guard: walka WŁASNYM stworem z licznikami nigdy brana w SCORINGU (−60),
  engine i tak kasuje komendę (okno walki nie istnieje).
- **R6 (okno walki)**: ofiara=ich napastnik → `fogWindowLethalSaveValue`/
  `fogWindowSavedCreatureValue` + `·min(deadBlockers,3)` (M263),
  ofiara=ich bloker → `fogWindowSavedCreatureValue`. Kotwice: S06
  instant-bite z lethalem na twarz = **42** (=2+40 fog-lethal).

**Pokrętła (8)**: `fightBiteChipBase/PowerWeight/LethalBonus`,
`fightKillBase/PowerWeight`, `fightMissBase`, `fightTradeWorthWeight`,
`fightTradeCardCost`, `fightWastedDeathExtra`, `fightLifelinkWeight`
(usuń `fightDeathBodyWeight` — scalone w drabinę). Test pokrętła: S03 reaguje
TYLKO na `fightTradeCardCost` (14 przy 0).

**Świadomy dryf (L41)**: golden-master — 5/6 partii bit-po-bit identyczne;
1 partia (tarkir|warhammer@1001) — IDENTYCZNE wybory (267, KINDS-DIFF: BRAK),
tylko wyceny opcji +2.0 → fixture zregenerowany `--write` z dowodem izolacji.
Test PMSSB-4 `F-A1b` (kompozycja): pin 37 → −9 z komentarzem — tf->mocny to
NIE „chip" (mój 3/3 GINIE, ich 5/5 żyje = wasted-death tier); piny kill
(81/84) nietknięte.

**Dowody**: `test/audyt-pmssb16-walka.test.js` (10: kotwice ×8 + pokrętło +
drabina; RED 7/10 na starym kodzie — kotwice DOKŁADNE; mutacja progów DT = 4 RED).
Bramy: fast 6985/6985; all 7256 (po regen fixture); tie-audit 28.3%/10.8%;
mirror 8:8 (0.5); Żywy Tester 3×0 zgłoszeń.

## PMSSB-15 — prewencja/fog (prevent_*) (2026-09-28)

**Wybór celu** (BACKLOG pusty; RE-AUDYT rodziny „POKRYTEJ (M91/M236)" z
NOWYM dowodem): zgłoszenie B + spec taktyczny właściciela („preventować u
stworów które by lethal dostały albo u siebie jeśli któryś z kreatur
przeciwnika go zrani" + odpowiedź na dmg-czar z lethalem) + luka L41
free-castów (podejrzenie potwierdzone sondą). 4 karty: Withstand /
Revealing Wind / Inspire Awe / Ethersworn Shieldmage.
Plan: `docs/plans/PLAN_2026-09-28-pmssb15-prewencja.md`;
POMIAR PRZED: `/tmp/pmssb15-prewencja-przed.mjs` (S01–S11).

- **F1 (L41, Fala A):** okna fog (M91 −300 / M236 −75 / +15) siedziały
  WYŁĄCZNIE w `cast_spell` — rodzina darmowych rzutów (epic/rebound/
  suspend/madness/exile) wyceniała flat 70: darmowy fog w własnej turze
  zabijał własny atak (S07: 70 → −230 → done), przed deklaracją marnował
  się (S08: 70 → −5 → done). `fogWindowValue` = wspólne źródło dla obu
  lejków (L41, 4 wpięcia).
- **F2+F3 (Fala B):** flat +15 nie rozróżniał chipa od lethal (oba 65 —
  S03=S04) ani zegara poison (S11 = 65), i nie liczył wycieku wyjątku
  „except by enchanted/enchantment creatures" (S05: leak 100% → cast 53!).
  Skala: `fogWindowChipValue` 15 (dawna płaska — anty-over-fix M429) +
  `fogWindowLethalSaveValue` 40 (ratunek śmierci: życie LUB poison —
  CR 702.90b + 615.6, cyt. dosłowne w helperze; dwa zegary M91) +
  `fogWindowSavedCreatureValue` 12/ocaleńca (cap 3, „stworów które by
  lethal dostały"); wyciek skaluje bazę do mocy zapobiegalnej, pełny
  wyciek = wasted (S05: 53 → −37, S06: 53 → 43.6).
- **F4 (Fala C):** ETB Shieldmage flat 3 → `preventDamageThisTurnValue`
  (0 bez moich pasujących stworów — lustro `animate_linked`; baza 3 =
  dawna; +12 za realnie ratowanego z walki lub burnu na stosie —
  CR 615.4). Odwrócona kolejność okna naprawiona: 66.6 ratunek <
  70.2 pustka → **77.4 > 67.5**.

### Znane granice / forwardy
- DEBT (CR 615.4, cyt. dosłowne): prewencja nie odrabia zadanych
  obrażeń — „po rozdaniu" to zawsze strata (wasted −75).
- `prevent_next_damage` (Withstand) = strona CELÓW fixu B
  (`preventShieldValue`/`preventShieldTargetValue`) — nietknięta (granica
  rodzin); cantrip Withstandu (draw) = PMSSB-3, nietknięty.
- Scry-rider Inspire Awe karany −12 (M218/4, rodzina scry) — świadome;
  F5/S11: MV4 vs MV3 w tym samym oknie = 93 vs 105 (bez remisu).
- Burn-na-stosie w oknie Shieldmage: lekki sygnał `pendingEffects`
  (ilość trafień, nie ilość obrażeń) — wystarczy do rozstrzygnięć.

### Pomiar końcowy
- Test `test/audyt-pmssb15-prewencja.test.js` (16): RED **14/16** na starym
  kodzie (2 kotwice anty-over-fix z definicji przechodzą), mutacja filtra
  wycieku = **3 RED** (dokładnie F3). GREEN 16/16.
- Bramki: fast **6975/6975**; test:all **7246/7246 (7 suites)**; build
  **70 / 4555,8 kB**; CR-numery: 104.3d/615.4/615.6 dopisane po weryfikacji
  dosłownej (ADR 0030).
- Golden-master bota: **BEZ regeneracji** (fixture nietknięte — rodzina
  4-kartowa poza pulą 6 partii). Tie-audit 28,5% og / **11,0%** realnych
  wariantów. Mirror-eval kandydat vs „wymiary nowe = 0": **36:36 (0.5)**
  — pula bench bez rodziny (walidacja scenariuszowa, zgodnie z metodą).
  Żywy Tester PO: 3 partie (theros × mirrodin-wu — enchantmenty i
  artefakty) — **0 zgłoszeń detektorów, 0 niewycenionych**.
- Prewencja/fog PRZEJRZANA (M91/M236 → PMSSB-15); commit `4f6a583`.

## PMSSB-14 — impulse-unification + saga-chapters (2026-09-26)


**Wybór celu** (BACKLOG pusty; forward PMSSB-11 + znalezisko): saga = 0
wzmianek w bocie (rozdziały NIEWIDZIALNE!).
Plan: `docs/plans/PLAN_2026-09-26-pmssb14-impulse.md` (A/A2/B/C);
sonda: `tools/pmssb14-impulse-sonda.mjs` (I01–I03).

- **F-I1+F-I2 (Wave-A):** `impulseLookValue`-helper (bit-identical!) +
  `anticipatedSagaValue` (I-1.0/II-0.8/III-0.6-gated): rediscover
  +16.20 (73.79!), no-creature +12.96. 2 piny.

### Pomiar końcowy
- Suit 6842/6842 GREEN (2 piny); golden CZYSTY (0!).
- Impulse/saga ZAMKNIĘTE.

## PMSSB-13 — persist-unification + stance-validation (2026-09-26)

**Wybór celu** (BACKLOG pusty; forwardy PMSSB-9 #2 + #6): flat-5 vs
model + stance-0.5. Unvalued-sweep = 0 (pokrycie pełne!).
Plan: `docs/plans/PLAN_2026-09-26-pmssb13-persist.md` (A/A2/B/C);
sonda: `tools/pmssb13-persist-sonda.mjs` (R01–R04).

- **F-R1 (Wave-A):** persist = 0.5 × return-body (clique −0.9!).
  Stance 0.80-conditional → 0.5-validated (doc-only!). 2 piny.

### Pomiar końcowy
- Suit 6840/6840 GREEN (2 piny); golden CZYSTY (0!).
- Persist-unification ZAMKNIĘTA (micro!).

## PMSSB-12 — pay-trigger-net (2026-09-26)

**Wybór celu** (BACKLOG pusty; forward PMSSB-9): triggery z płatnością
(payMana!) SKIPowane w PMSSB-9/F-T1.
Plan: `docs/plans/PLAN_2026-09-26-pmssb12-pay.md` (Aneks A/A2/B/C);
sonda: `tools/pmssb12-pay-sonda.mjs` (P01–P05).

- **F-P1+F-P2 (Wave-A):** `anticipatedPayValue` = max(0, like ×
  (benefit − pay)) (bot płaci ZAWSZE!): spellbomby +2.25
  (color-gated!), descendant +0.45/+0.9, endure_x-entry (+4!).
  Spire: −1-pay / 76-sac-clamp. Forebear grave-SKIP. 5 pinów.

### Pomiar końcowy
- Suit 6838/6838 GREEN (5 pinów); golden CZYSTY (0!).
- Pay-trigger-net ZAMKNIĘTY (single-wave!).

## PMSSB-11 — sac-economics (2026-09-26)

**Wybór celu** (BACKLOG pusty; forward PMSSB-10 #1): ETB-may-sac
(exploit ×2, devour ×1) z benefit-NIEWIDZIALNYM przy cast-cenie.
Plan: `docs/plans/PLAN_2026-09-26-pmssb11-sac.md` (Aneks A/A2/B/C);
sonda: `tools/pmssb11-sac-sonda.mjs` (S01–S06).

- **F-S1+F-S2 (Wave-A):** `anticipatedSacValue` = max(0, benefit −
  cheapest-sac) (OPT-IN! lustro resolve M69/M130): silumgar +2.7
  (kill + worthIt-TMC!), drowner +5.4 (impulse!), gorger +2.7
  (trash-gate!). 9 bram CLOSED, 5 guardów SAME. 5 pinów.
- **Lekcja:** double-discount (helper RAW, cast dyskontuje!).

### Pomiar końcowy
- Suit 6833/6833 GREEN (5 pinów); golden CZYSTY (0!).
- Sac-economics ZAMKNIĘTY (single-wave!).

## PMSSB-10 — triggery-ogon (2026-09-26)

**Wybór celu** (BACKLOG pusty; forward PMSSB-9 #1): ogon ~40 nosicieli
(upkeep/leaves/combat-gated/end/cast/singletons) — ETB/dies/attacks DONE.
Plan: `docs/plans/PLAN_2026-09-26-pmssb10-ogon.md` (Aneks A/A2/B/C);
sonda: `tools/pmssb10-ogon-sonda.mjs` (O01–O12 + ablacje).

- **F-O1+F-O2 (Wave-A):** `anticipatedTailValue` = likelihood × ETB:
  scrollthief +2.7, robber +2.1 (net foe-token!), curiosity +2.7,
  flooding +18.27 (exact!), tellah +4.5, demon −6.3, harvester +5.7,
  guard +3.6, wrecker +3.6 (targeted!). 13 pinów, golden CZYSTY (0!).
- **F-O3a (Wave-B1, leaves+upkeep):** O-ring-sign (newt +4.5, butcher
  −5.4!), drain-mirror (goblin −1.8), transform/page SKIP. 7 pinów.
  Golden: 2× butcher −5.4 (score-only).
- **F-O3b (Wave-B2, end+singletons):** LIVE-gates (rager +2.25, reaver
  +13.5, triton +1.62!), selhoff +14.5, ascension +4.5, willbender
  +2.16, shaman +1.8; exploit/descended/delirium SKIP. 10 pinów.
  Golden: 3× ascension +4.5 (score-only, 0 flips!).
- **OVERRIDE F-T1:** any_creature_dies = 0.7 (nie exclude!) — selhoff
  65.7→80.2, crows 70.2→71.5 (świadome, udokumentowane).
- **Piny:** 30 (A-13 + B1-7 + B2-10 + guardy); 0 pokręteł.

### Znane granice / forwardy
1. Exploit-sac-net (koszt vs benefit), abduction-gate silnikowy,
   token-wizard-clamp (2. nosiciel = unifikacja!).
2. Lekcja E5 ×3: TYLKO łacina (bez cytowania obcych słów!);
   drain-mirror (one-shot-skale NIGDY do powtarzalnych!).
3. Mill-table vs rozmiar-biblioteki (harness-lib30 = max!).

### Pomiar końcowy
- Suit 6828/6828 GREEN (30 pinów); golden 2× `--write` (5 score-only,
  0 flips — butcher −5.4, ascension +4.5).
- Ogon ZAMKNIĘTY; wszystkie klastry triggerów pokryte.

## PMSSB-9 — anticipacja triggerów non-ETB (2026-09-26)

**Wybór celu** (BACKLOG pusty; forward PMSSB-8 #1): ~100 triggerów
non-ETB w 45 typach eventów z treścią NIEWIDZIALNĄ przy cast-cenie
(dowód: trójka prowler/piker/game = 64.8 IDENTYCZNE!).
Plan: `docs/plans/PLAN_2026-09-26-pmssb9-triggery.md` (Aneks A/A2/C);
sonda: `tools/pmssb9-triggery-sonda.mjs` (T01–T12 + ablacje).

- **F-T1 (Wave-A, dies):** `anticipatedDiesValue` = 0.5 × tabela-ETB:
  prowler +2.7, game +0.9, dissenter +9 (duch-20!), clique BEZ ZMIAN
  (persist-flat SKIP), spellbomb SKIP (pay-gated!), selhoff EXCLUDE.
  Golden: 2× highland +0.9 (score-only) — `--write`.
  Rattle: cross-kind-tie land-vs-spell (ścisła allowlista!).
- **F-T2 (Wave-B, attacks):** `anticipatedAttacksValue` = 0.5 × bramka
  (evasion/stół) × tabela + impuls-+3 + exalted-+2: drain +1.8/+3.6,
  impuls +1.35, untap +2.7, exalted-solo +0.45, zoraline SKIP.
  Bramka działa (71.1-vs-72.0!). Golden: 2× veteran +2.7 (68.4027!).
- **Piny:** wave-a (10) + wave-b (9) + flipy (NO-F-4, guard, rattle).
  0 pokręteł (likelihood/asumpcje + piny-kształtowe).

### Znane granice / forwardy
1. Ogon (upkeep-transform, leaves-O-ring, combat-gated, end/cast/enters).
2. Persist-unification (flat-5 vs model-3.5), pay-trigger-net, land-90,
   survival-model, stance-kalibracja.
3. Lekcja E5: komentarze TYLKO łacińskie (wpadka: rosyjskie słowo w komentarzu!).

### Pomiar końcowy
- Suit 6798/6798 GREEN (19 pinów); golden 2× `--write` z per-flip.
- Clustry dies/attacks ZAMKNIĘTE; ogon = osobna pętla.

## PMSSB-8 — loot-net-unification (2026-09-26)

**Wybór celu** (BACKLOG pusty; forward PMSSB-6 „loot-net-unification"):
to samo zdarzenie (loot-1) miało 3 liczby: combined-+6 (ETB-table +
ability) vs split-+2 ([draw,discard]: 6−4) vs M67-5.
Plan: `docs/plans/PLAN_2026-09-26-pmssb8-loot.md` (Aneks A/A2/C);
sonda: `tools/pmssb8-loot-sonda.mjs` (8 sond L01–L08 + ablacje).

- **F-L1:** `LOOT_NET_VALUE = 2` (parytet-cyclingu ~7932, L41):
  loot-1 ≡ cycle-1 (karta wraca do grobu, zostaje selekcja).
  Split-+2 JUŻ DOBRY (evangel bez zmian!); rusza się tylko combined:
  scholar 8→4 (EOT 18→14), fisher 74.7→71.1. Wszystkie predykcje
  DOKŁADNE; parzystość: cycle-4.0 = loot-4.0.
- **F-L1b (H2-revised):** M67 to MAY-loot ≡ mandatory przy zdrowej
  bibliotece → rider +5→+2 (force-away 87→84), BEZ drabiny deck-outu
  (may-skip unika suicide! pierwsza wersja zabiła ratunek B/F5 −115,
  pin wykrył, naprawiono). Decyzja modalna 5-vs-(−2) ZOSTAJE.
  Martwy parametr `ferociousLootExpected` usunięty.
- **Sonda:** thin-library-artefakt (lib10: crows/talions ujemne;
  lib30: +70.2/+66.6); talions+faerie inwariantne (future-trigger
  bez anticipacji → FORWARD, osobna rodzina); M67 ablacja +5 DOKŁADNIE.
- **Golden:** ZIELONY bez zmian (churn 0).
- **Piny:** `test/pmssb8-loot-wave-a.test.js` (10) + 3 flipy zamierzone
  (F5 93→90, SCHOLAR ≥4, guard-6 4/71.1036). 0 pokręteł (−1 parametr).

### Znane granice / forwardy
1. Future-trigger-anticipation (non-ETB) — osobna rodzina.
2. Wartość opcji-skip may-loota przy cienkiej bibliotece.
3. Lekcja may-vs-must: anticipacja opcji NIGDY nie niesie kary-suicide
   (may-skip ją zjada); drabiny deck-outu tylko w przymusach.
4. Piny lootowe na lib30 (thin-artefakt jak PMSSB-6-fillLibrary).

### Pomiar końcowy
- Suit 6779/6779 GREEN (10 pinów); golden bez churnu.
- Rodzina loot ZAMKNIĘTA (re-audyt tylko z nowym dowodem).

## PMSSB-7 — domknięcie hold (2026-09-26)

**Wybór celu** (BACKLOG pusty — zweryfikowano; forwardy PMSSB-6):
divest-self +3 (dziura hold) + podejrzenie martwego −25-token.
Mikro-pętla domykająca rodzinę PMSSB-6 (nie nowa rodzina).
Plan: `docs/plans/PLAN_2026-09-26-pmssb7-hold.md` (Aneks A/A2/C);
sonda: `tools/pmssb7-hold-sonda.mjs` (10 sond + 8 SKIP).

- **F-H1:** mapa `HOSTILE_PLAYER_EFFECTS` rip 45→53 (10× foe-blind-rip-5
  + margines ponad bazę-50): divest-self +3→**−5** (predykcja DOKŁADNA),
  mindstab-self −1→−9 (predykcja −7, pudło o 2: foeRip(self) = −2).
  5 wołań `selfHarmPenalty`, wszystkie w kierunku „trzymaj mocniej".
- **F-H2:** usunięty martwy „−25 za pusty czar" (M106/Z6): count-0 łapie
  wcześniej allEffectsInertNow → −70 (flurry/howl −70 ZMIERZONE), a
  token-bezwartościowy-przy-count>0 nie ma nosicieli (skan 0/0 czysty).
  Sonda PO: S01–S17b BIT-IDENTYCZNE (dowód martwoty).
- **Sweep H3:** 9× −70, 2× brak oferty (silnik: volley, lunar-own),
  1× −114 (force-away-own) — czysto, zero nowych dziur.
- **Golden:** ZIELONY bez zmian (churn 0 — bot nigdy +3 nie wybierał).
- **Piny:** `test/pmssb7-hold-wave-a.test.js` (12) + flip guarda PMSSB-6
  (divest −5, mindstab −9 — ZAMIERZONY). 0 pokręteł.

### Znane granice / forwardy
1. Martwe przypadki inert bez nosicieli-spell (klasa F-H2):
   buff_land, add_counter-≤0, mill-0, multicolored, reanimate.
2. Single-X0 = −10 inną ścieżką niż split-X0 (−70) — trzyma, do
   wyjaśnienia przy X-sweepie.
3. Pomysł „no-base-for-pure-harm" (odrzucony jako za szeroki).
4. Temple oferuje `->p2` (−133) — oferta dziwna, wynik trzyma.

### Pomiar końcowy
- Suit 6769/6769 GREEN (12 pinów); golden bez churnu.
- Rodzina PMSSB-6 ZAMKNIĘTA (re-audyt tylko z nowym dowodem).

## PMSSB-6 — odrzut wroga (2026-09-26)

**Wybór rodziny** (re-audyt „POKRYTEJ" z NOWYM dowodem — rejestr BACKLOG
pusty, cel z forwardu PMSSB-5 §5 pkt 7): zysk foe-side hand-rip był
NIEWYCENIONY w caście (divest/mindstab = czysta baza 50.00; M202 to
self-harm, M408 to koszt-odrzutu). 13 nosicieli + rider delusion
(5 spell-rip / 1 ETB-rip / 2 activated-rip / 4 self-loot / 1 rider).
Plan: `docs/plans/PLAN_2026-09-26-pmssb6-discard.md` (Aneks A/B/C: sonda
D00-D16, model ceny 4/8, wyniki).

**Pliki testów:** `test/pmssb6-discard-wave-a.test.js` (20; jedyna fala).
**Kod:** `foeRipValue` + guardy w `effectIsInertNow` + gałąź-discard
w ability + rider-delusion w `heuristic-bot.js`; zero nowych pokręteł.
**Sonda:** `tools/pmssb6-discard-sonda.mjs` (25 sond, w repo na stałe).

### Fala A — model + guardy (`a793b91`; F-A1/A2/A3/A4)
- **F-A1:** `foeRipValue` (L41, jedno źródło cast/ability/ETB/rider):
  blind-1 = +4 (lustro kosztu-self -4), reveal-1 = +8 (karta 6 + info 2),
  exile-ręki = reveal (nogi-grobowej +6 niesie wyższość dreams),
  cap min(n, jawny licznik ręki). Wyniki: divest 58, dreams 58/64,
  mindstab 62, nightsnare 66, toll 67, hecteyes +4 (zamiast +3).
  Symetryczne-45 odrzucone (strona ryzyka ≠ strona zysku).
- **F-A2:** rip w pustą rękę = inert (cast -70 / ability -40 / modal -40
  / suspend -40 — przepływy istniały!). Toll ratuje amass (59),
  dreams ratuje grób (56), mindstab ucieka w suspend (emergentne!).
- **F-A3:** gałąź-discard w ability + sac-self SKALOWANY (sacValue jak
  severed — flat-4 załamywał się na nietoperzu): bat +2→-1 (flip
  ogień→trzymaj!), skullcairn -58→-54 (stabilnie).
- **F-A4:** rider-delusion (blind-cap +4): porządek bez zmiany hold/fire
  (dowód kasowania PMSSB-5 żyje); piny PMSSB-5 bezpieczne (K06: cap-0).
- **Sonda PO:** diff = DOKŁADNIE ruchy-modelu + holdy-guardów
  (falsyfikator spełniony).
- **Golden:** 1 mecz (dominaria-brg|mirrodin-wu@1000): decyzje 264=264,
  kinds identyczne, scoreSum +8.0 = decyzja #14 (mindstab-t2 vs 2 karty);
  5 meczów bit-identycznych; fixture `--write` z wyjaśnieniem.

### Znane granice (świadome, nie bugi)
1. Skład ręki wroga NIEWIDZIALNY z przepisów (D00) — strażnik tylko na
   pustkę (liczność jawna); fizzle-w-niecelowy-skład to ślepe ryzyko jak
   w prawdziwym Magicu.
2. Loot-self bez zmian (ordering-only): rozjazd combined-+6 vs split-+2
   vs M67-5 = forward „loot-net-unification".
3. Triage-+15 martwy (1 nosiciel: mindstab-suspend — znak-dobry,
   magnituda-inertna, guard-automatyczny z F-A2).
4. Lekcja ×0.9: `cast_permanent` mnoży wynik ×0.9 (wagi-rodzin B4,
   `heuristic-weights.js`) — hecteyes 63.0/66.6, nie 70/74; piny liczą
   jawnie (ten sam dyskont co PMSSB-3 „5.4 = 6×0.9").
5. Forwardy OUT: amass-cast9-vs-ETB6 (pre-existing!), transform, koszty
   many/tap (margines-bat -1 cienki przez mana-OUT), mayFire-50
   (konwencja-znaku), treść-triggerów (granica PMSSB-3).

### Pomiar końcowy
- Suit 6757/6757 GREEN (20 pinów); tie-audit: 12709 decyzji, 208 realnych
  remisów (11.1%), ZERO z ripem (klasy pre-existing: block/land).
- Rodzina ZAMKNIĘTA (re-audyt tylko z nowym dowodem).

## PMSSB-5 — kontry (2026-09-26)

**Wybór rodziny** (rejestr BACKLOG, ostatnia pozycja): kontry — 7 kart
(rejestr mówił 5; weryfikacja programowa: negate, negate-m15,
stoic-rebuttal, steel-sabotage, frightful-delusion, fuel-for-the-cause,
abstruse-interference). „Mikro-pętla?" rozstrzygnięta na pełne PMSSB-5:
4 kanały (twarde / modal / unless-pays / rider) + strona płatnika
(`resolve_counter_pay_choice`) + audyt zbioru HIGH_IMPACT vs katalog.
Plan: `docs/plans/PLAN_2026-09-26-pmssb5-kontry.md` (Aneks A/B/C: sonda
K01-K13, macierz cel×płatnik×stan, dowody kasowania/dominacji, wyniki).

**Pliki testów:** `test/pmssb5-kontry-wave-a.test.js` (15: 6 flipów +
9 guardów; jedyna fala).
**Kod:** HIGH_IMPACT 16→22 typy w `heuristic-bot.js` (+10 linii);
zero nowych pokręteł.
**Sonda:** `tools/pmssb5-kontry-sonda.mjs` (25 sond, w repo na stałe;
wszystkie prognozy PRZED trafione co do punktu).

### Fala A — luki bramki (`83d9acb`; F-H3)
- **F-H3:** HIGH_IMPACT += reveal_hand_choose_discard, reveal_hand_choose_exile,
  destroy_artifact_gain_life_mana_value, return_permanent_from_graveyard,
  bounce_to_library_bottom, player_sacrifices_creature — podtypy, które bot
  wycenia wysoko gdzie indziej (REMOVAL 75–90, HOSTILE_PLAYER 45), a bramka
  je ignorowała (K10: Divest MV1 rozbierał rękę przy otwartej kontrze).
  Binarne jak reszta zbioru; celowy brak unii map (bramka SŁUSZNIE nie zna
  np. tap-45 — inna decyzja, inny zbiór). Promień: dokładnie 6 kart MV<3.
- **Sonda PO:** diff = DOKŁADNIE 6 flipów -10→50, zero ruchu gdzie indziej
  (falsyfikator z planu spełniony).

### Znane granice (świadome, nie bugi)
1. Flat-50 kontr w wpływowy cel = projekt (bramka binarna); porządkowanie
   zagrożeń między strzałami i wybór trybu sabotage (kontra 50 vs bounce 80,
   odpowiedzi równoważne w XOR) — forward.
2. Dowód kasowania (H4/H6-delusion): odrzut bezwarunkowy jedzie tak samo
   przy strzale-teraz jak przy strzale-później — kasuje się z decyzji;
   E7/D2 (-40 przy otwartym {1}) poprawne + mandat właściciela.
3. Strona płatnika flat 85/10 = dominacja płacenia (delusion: odrzut i tak
   nastąpi; silnik bramkuje nieopłacalnych).
4. Fuel-proliferate = 0 w cascie: karta >> proliferate wg własnych wag bota
   (loyalty +1, +1/+1 +2); lethal-poison-9 = forward.
5. Abstruse +10 (ciało Sciona; max-ról słuszne — role wyłączne; -0.03 to
   tie-break F7 z PMSSB-2, nie kontra). Stoic-znizka niewidzialna =
   efekt-równy (oszczędzona mana to rodzina mana, OUT).
6. Holdy udokumentowane: manifest-dread (polityka-jak-stwór), mill/spare-from-evil/
   memory-s-journey (kontekstowe), tap (M237/2 celowe). Fałszywe alarmy:
   assert-perfection / release-the-ants / force-away / curate /
   fake-your-own-death strzelają przez typy-rodzeństwo.
7. Forwardy OUT: zysk foe-side hand-rip NIEWYCENIONY w caście (divest/
   mindstab = czysta baza 50.00; M202 to self-harm, M408 to koszt-odrzutu —
   luka rodziny discard!), X na stosie niewidzialne (epic-experiment),
   liczenie zasobów E7/D2 (sciony/skarbce = rodzina many), świadomość okna
   odpowiedzi, bramka czytająca cele. Martwe wpisy zbioru (4, zero nosicieli)
   i gałąź counter_ability — nieszkodliwy future-proof.

### Pomiar końcowy
- Suit 6737/6737 GREEN (15 pinów); ZERO churnu fixture (żaden flip nie leży
  na ścieżce golden-mastera).
- Rodzina ZAMKNIĘTA: ponowny audyt tylko z nowym dowodem.

## PMSSB-4 — zysk życia (2026-09-26)

**Wybór rodziny** (rejestr BACKLOG): zysk życia — 28 kart (rejestr mówił
23; weryfikacja programowa 29 - crumb-and-get-it, którego jedyny hit to
gift->Food; lose-only 8 OUT jako pokryte M169/K, M237/4). Kanały:
5 spell / 7 ability / 7 ETB (3 gain-landy) / 2 modal / 7 trigger.
Rozjazdy: noga-gain w cast = 0, ETB min(2x,8) ślepe na życie, M155-dublował
M236, M157-flat, scroll-conditional = 0, brak hold-tap-gain pre-combat,
triggery przy rzucie = 0. Plan:
`docs/plans/PLAN_2026-09-26-pmssb4-zycie.md` (Aneks A/B/C: sonda L01-L26,
macierz 23 komórki, specyfikacje fal, wyniki).

**Pliki testów:** `test/pmssb4-zycie-wave-a.test.js` (12),
`test/pmssb4-zycie-wave-b.test.js` (5), `test/pmssb4-zycie-wave-c.test.js`
(4) — razem 20 pinów + guard gainLifeValue(0) (nazewnictwo falowe jak PMSSB-3).
**Kod:** `gainLifeValue` (wspólna drabina M236, L41) +
`imminentTriggerGainValue` (bramki-imminent) w `heuristic-bot.js`;
`controlsCreatureSubtype` w `viewConditionalHolds` (lustro negacji);
zero nowych pokręteł.
**Sonda:** `tools/pmssb4-zycie-sonda.mjs` (L01-L26 + L14b/L15b/L16b/L19b,
w repo na stałe).

### Fala A — parzystość + dedup (`809a125`)
- **F-A0:** `gainLifeValue` (ekstrakcja drabiny M236; M236 bez zmian liczb).
- **F-A1:** noga-gain w cast (douse/consume-X/severed-T/divine-MV +
  strażnik foe-scope; scoredEffects daje X/conditional gratis, L41).
- **F-A1b:** feed gain_if_dies: min(x,3) -> tiers(min(x,3)) (cap-3 zostaje).
- **F-A2:** ETB-gain: min(2x,8) -> tiers (healer 70.20 -> 66.60 @20).
- **F-A2b:** ETB foe-lose +4x (lustro modala; skymarch 72.90 -> 75.60).
- **F-A3:** dedup M155 (talisman 6 -> 3, parzystość z soulmenderem).
- **F-A4:** dedup M157-foe (misaim pokrywa; -55 -> -29).
- **F-A5:** M157-self tiers (zombie-self 5 -> 3/4/5).
- **F-A5b:** conditional-gain w ability (scroll+Angel 7 -> 10/14; evaluator).
- **Golden:** fixture `--write` (slad ravnica|innistrad-wu@1000: 316=316
  decyzji, scoreSum +2.0 = noga-severed; jedyny gain-kandydat w taliach).

### Fala B — timing (`0ff9efa`)
- **F-B1:** hold tap-gain pre-combat (L22: +3 -> -6; ratunek@5 i foe-EOT
  strzelają dalej; 6701/6701 bez churnu fixture).

### Fala C — triggery imminent (`56412bd`)
- **F-C1/C2/C3:** landfall-gate (gladehart +1.8 z ladem w ręce),
  cast-color-gate (feather +0.9), bat-gate (zoraline +0.9); bez enablerów
  +0 jak przedtem; 6701/6701 bez churnu fixture.

### Znane granice (świadome, nie bugi)
1. Modal-tiers 4x/1x (stromość ratunku chroni remis gain-vs-lose1@5).
2. Gain-landy +0 (stały tap -8 dominuje — wymiar zdominowany).
3. Dies-gain/cautious/staff-cast +0 (brak bramki-imminent).
4. Bard-ETB-modal +0 (max-mode-machinery, future-work H6).
5. Forwardy OUT: koszty-mana zdolności (= 0, rodzina kosztów),
   damage-nogi drainów (M237/4), ślad modalny (M130-family).

### Pomiar końcowy
- Suit 6721/6721 GREEN (20 pinów); wszystkie prognozy fal trafione co do punktu.
- Rodzina ZAMKNIĘTA: ponowny audyt tylko z nowym dowodem.

## PMSSB-3 — dobieranie (2026-09-26)

**Wybór rodziny** (rejestr BACKLOG): dobieranie — 45 kart (weryfikacja
programowa `reg.all()` 562 -> 45; szacunek rejestru 40+), guard deck-outu
istniał (cast/ability), rozjazdy: ETB-9 vs cast-6, brak okien timingu,
noga-foe ignorowana w both-draw, rider ferocious = 0, mayFire-samobójstwo
przy lib0, conditionale = 0 (brak unwrap), koszt sac-self w ability-draw = 0.
Odrzucone: zysk życia (23), kontry (5, mikro-pętla). Plan:
`docs/plans/PLAN_2026-09-26-pmssb3-draw.md` (Aneks A/B/C: 45 kart, S-piny v3,
specyfikacje fal, wyniki).

**Pliki testów:** `test/pmssb3-draw-wave-a.test.js` (6),
`test/pmssb3-draw-wave-b.test.js` (9) — razem 15 pinów (odchylenie od
konwencji `audyt-pmssb<N>-*.test.js`, nazewnictwo falowe).
**Kod:** guardy + unwrapy + okna w `heuristic-bot.js`,
`instantDrawFoeEndBonus: 10` / `ferociousLootExpected: 5`
w `heuristic-params.js`, `landEnteredThisTurn` w `playerView` (game-state.js).
**Sonda:** `tools/pmssb3-draw-sonda.mjs` (22 scenariusze, w repo na stałe).

### Fala A — strażnicy (`6b4c00a`; F9b+F10)

- **F9b:** mayFire-draw (murder/curiosity) przy lib0 -> -100 (lustro E2/A1b;
  E-tax na lib0 = 0, więc guard kazę, nie tax; bot-side, `pendingOptionalEffects`).
- **F10:** ETB-draw/draw_then_discard dostaje `drawDeckingPenalty`
  (lustro cast/ability, L41).
- **Naprawy testów:** K2/CR1 (wypełnienie bibliotek, konwencja pr92),
  E5/1 (znaki spoza ASCII w planie).

### Fala B — luki wyceny (`8e7371e`; F1/F2/F5/temple/scroll/envoy/mysteries)

- **F1:** ETB `draw_cards` 9 -> `P.drawCardValue` (L41; dostarczane
  5.4 = 6 x 0.9, spójne z globalnym dyskontem permanent); literal-6
  modala -> param (bez zmiany zachowania).
- **F2:** instant-draw na EOT wroga +10 (lustro M211/A1-scry, ta sama racja
  fizzle-many; dodatnie-tylko; cast_spell + activate_ability).
- **F3-flat ZWERYFIKOWANE:** reunion main1 = main2 (sorcery-draw nie czeka;
  wynik negatywny poprawny, nie luka).
- **F5:** `ferocious_draw_discard` w cast: ferocious (P>=4, lustro silnika)
  ? +5 (lustro M67) : 0.
- **F-temple:** noga-foe both-draw -12 (lustro A4-4) + `isDrawOnly`
  extended o both_players (duch A4-4): 62 -> -1 (flip rzut->trzymaj:
  parytet + tempo-loss).
- **F-scroll-sac:** ability-draw + sacrificeSelf -> lustro gałęzi-token (-4/-1).
- **F-envoy:** unwrap-conditionals w pętli ETB (lustro selfDamageOfEffects):
  dywergencja +-counter.
- **F-mysteries:** unwrap-conditionals w pętli cast + `landEnteredThisTurn`
  w widoku i `viewConditionalHolds`: dywergencja landfall.
- **Piny:** rager 68.4018, force-ON 93, temple -1, mysteries 62/68,
  envoy 72.9054/73.8054, scroll 7, EOT-self 21; 15 scenariuszy bez zmian
  (chirurgiczność); 16/16 prognoz trafionych co do punktu.
- **Golden:** fixture zregenerowany `--write` (`overallHash 76b5915a…`).

### Znane granice (świadome, nie bugi)

1. Zawartość triggerów (cast-time + fire-time, F9c) = 0 lub liability —
   skonsolidowana przyszła pętla generyczna (curiosity/murder/tellah/
   thief/prowler).
2. Curiosity = aura-wroga obu stron (-62.1/-169.2) — internals-aura (pętla-aura).
3. Gain-life (gałąź-Angel scrolla), poison-ridery, investigate, pełny
   opportunity-cost many (poza CMC+pip), need-now-gating przy F2,
   buff-mode0-temple, sac-threat game-balla — OUT z odesłaniem.
4. Net-swing loot: decyzja (M67: 7) ~= czar (A1b: 6) — ramki różne,
   ekonomia ta sama (nie dryf, nie unifikować).

### Pomiar końcowy

- Suit 6701/6701 GREEN po regeneracji; blast-radius unwrap-ALL (cast + ETB)
  = zero faili poza golden-masterem.
- Rodzina ZAMKNIĘTA: ponowny audyt tylko z nowym dowodem.
