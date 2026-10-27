# PMSSB — Pętla Manualnego Strojenia Scoringu Bota (hub)

Metoda M429: przemyślany audyt przyczynowo-skutkowy JEDNEJ rodziny efektów
+ wdrożenie falami + piny. Nie tuning maszynowy (ADR 0018: pełne B0 tylko
na komendę). Ten plik to hub: procedura + rejestr rodzin. Raporty z pętli
poniżej (PMSSB-1, PMSSB-2, …). Po zakończeniu pętli rodzina jest ZAMKNIĘTA:
kolejny agent czyta raport i piny zamiast badać od nowa — ponowny audyt
tej samej rodziny wymaga nowego dowodu (sonda/Żywy Tester), nie przeczucia.

## Kiedy pętla jest OBOWIĄZKOWA

Pętla nie jest opcjonalnym „dopieściem": **każdy batch kart z nową mechaniką**
musi ją przejść, zanim uzna się za domknięty (`docs/cards/HOW_TO_ADD_CARD.md`,
Krok 7). Nowa mechanika = nowy deskryptor, nowa rodzina efektów, nowa ścieżka
płatności, nowy typ zdarzenia albo nowy wymiar decyzji. Zielone piny silnika
dowodzą, że reguła się *wykonuje* — nie że bot *wybiera* nią dobrze; bez pętli
mechanika bywa dla gracza martwa (bot nie wystawia oferty, wystawia ją zawsze
albo traktuje skutek jak zero).

Historia: batch 69 (convoke) i batch 70 (X w koszcie permanentu, Improvise,
prewencja licznikowa, ewazja po typie blokera, trigger manifest dread) szły
bez tego kroku i wymagały pętli „po fakcie" — dlatego krok 7 runbooka jest
teraz obowiązkowy, a nie zalecany.

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
| batch 63 — ekonomia zasobów, modale/zwroty, regeneracja/ewazja/rampa/koszty | 10 | DONE (2026-10-05) | §PMSSB-58; `audyt-pmssb58-{zasoby,tryby-grob,kombinacje}` (98 pinów), ewaluacja i jawne granice w raporcie |
| batch 64 — removale w zdolnościach, pompka sorcery-speed, clash/delirium/Keen Sight/ląd z mapą many | 10 | DONE (2026-10-08) | §PMSSB-59 niżej; `test/audyt-pmssb59-batch64.test.js` (13 pinów: 4 fala A + 5 fala B + 4 kontrole); werdykty „by design" (mana ze stwora, skrut, drabinka ETB-tutora) w raporcie |
| batch 65 — damage z kwotą z grobu, look-top jako czar, affinity, warunkowe zniszczenie blokera, selektywna ewazja, aura cantAttack/cantBlock, trigger optionalPay, mana `{T}: {R} lub {G}` | 10 | **DONE (2026-10-10)** — fale A/B/C/D/E/F zamknięte | §PMSSB-60 niżej; plan `docs/plans/PLAN_2026-10-10c-pmssb60-batch65.md`; sonda `tools/pmssb60-batch65-sonda.mjs`; `test/audyt-pmssb60-batch65.test.js` (26 pinów: 7 fala A + 3 fala B + 4 fala C + 3 fala D + 3 fala E + 6 fala F); `instantSorceryGraveyardCount` (L41 silnik+bot), `impulseLookValue` w cast_spell (L41 czwarta ścieżka), `cardCostReductionForView` (S11), `blockDestroyColorValue` (fala C), kierunek `pump` w tabeli ETB (fala F), `cantBeBlockedByKeywords` w `hostEvadesBlockers` (fala E), model kosztu `trigger.payLife` (pay-trigger-net-model); 0 nowych pokręteł |
| batch 66 — vigilance/garda, Partner with, combat counters, boardowy draw payoff, aktywowana prewencja, grant many z ręki, koszt ofiary landu | 10 | **DONE (2026-10-13)** — fale A/B/C/D/E/F zamknięte | §PMSSB-61 niżej; raport `docs/audits/PMSSB61_BATCH66_2026-10-13.md`; plan `docs/plans/PLAN_2026-10-13-pmssb61-batch66.md`; sonda `tools/pmssb61-batch66-sonda.mjs`; `test/audyt-pmssb61-batch66.test.js` (11 pinów); `drawTriggeredCounterValue` (5 ścieżek L41), `linkedManaGrantValue` (S11/M429), `sacrificePermanentLoss` (cast + wybór), tie-projection ofiary i relacyjny koszt exact-tie czarów; 0 nowych pokręteł |
| batch 67 — energia (koszt/zysk/opłata) na wszystkich ścieżkach, obniżki kosztu czaru i zdolności, trigger drugiej karty, rider śmierci tokena, battle cry w decyzji ataku | 10 | **DONE (2026-10-15)** — fale A/B/C/D zamknięte | §PMSSB-62 niżej; plan `docs/plans/PLAN_2026-10-15-pmssb62-batch67.md`; sonda `tools/pmssb62-batch67-sonda.mjs`; `test/audyt-pmssb62-batch67.test.js` (12 pinów); `energyCounterValue` (jedna wartość licznika {E}), `energyAmountFromView`, `abilityManaCostForView`, `secondDrawEvidence` (bramka M429), `tokenLifeBankValue`, `teamAttackPump`; 1 nowy klucz params |
| batch 68 — kolekcja 400–411 (Kulrath, Bloodfire, Meteorite, Raze, Stymied, Secure, Halo Scarab, Child of Night, Austere, Neurok) | 10 | **PĘTLA DOMKNIĘTA (2026-10-17), jedna decyzja właściciela (Halo Scarab, M243/C)** — PMSSB-64 (lifelink/latanie/deathtouch w rzucie) **DONE** §PMSSB-64; PMSSB-65 (prowess Bloodfire) **DONE** §PMSSB-65; PMSSB-66 (okno many, Halo/countery/oil) **DONE z luką planera płatności** §PMSSB-66; pętla przeszła 8 rodzin: zamknięte z poprawką Austere, Raze, Secure, Kulrath (landcykling); zamknięte bez zmiany Stymied, Neurok, Meteorite, Halo; OTWARTE Child of Night (lifelink, PMSSB-64) i Bloodfire (prowess, PMSSB-65); §PMSSB-63 niżej; plan `docs/plans/PLAN_2026-10-17d-pmssb63-batch68.md` |
| amass (`amass`) — ETB Dunland Crebain i rzut Toll of the Invasion, wspólna miara z tokenem/licznikiem | 2 | DONE (2026-10-20) | §PMSSB-68 niżej; `test/audyt-pmssb68-amass.test.js` (6); przepięte piny `pmssb6-discard-wave-a` (Toll 68 / 60) i sufit `audyt-bot-walka-remisy` (attack 9); `tools/pmssb68-amass-ab.mjs` |
| take_initiative (`take_initiative`) — ETB „you take the initiative” (Underdark Explorer, Stirring Bard, Caves of Chaos Adventurer) | 3 | DONE (2026-10-20) | §PMSSB-69 niżej; `test/audyt-pmssb69-initiative.test.js` (8); `tools/pmssb69-initiative-sonda.mjs`, `tools/pmssb69-initiative-ab.mjs` |
| nieopłacona wymiana w deklaracji ataku (`declare_attackers`, remis s4011 t26) — wymiana ponad wolne sloty po przeżywającym zabójcy | 1 | DONE (2026-10-20) | §PMSSB-70 niżej; `test/audyt-pmssb70-nieoplacona-wymiana.test.js` (5); pokrętła `unpaidTradeEnabled`, `unpaidTradeLoss`; przepięte: fixture golden (2 partie, po przeglądzie), pin F7 (scena z 2 blokerami) |
| riot (`riot`, tryby modalne przy wejściu: licznik +1/+1 albo pośpiech) + NaN w wycenie rzutu z pompą `source_power` (Gruul Beastmaster) | 1 | DONE (2026-10-20) | §PMSSB-71 niżej; `test/audyt-pmssb71-riot.test.js` (11 obecnie; 6 w pierwszej iteracji); sonda `.arena/pmssb71-*`; NaN dotykał KAŻDEJ oferty w tej samej turze (sortowanie) |
| licznik +1/+1 na sobie bez celu (ETB/wyzwalacze z opłatą, „umiera”, lądy, end step): stała 5 → wartość kontekstowa (ciało 3 + presja + przewaga wroga) | 1 | DONE (2026-10-20) | §PMSSB-71 v3 niżej; `test/audyt-pmssb71v3-licznik.test.js` (4); inne liczniki bez celu (quest, stun) zostają przy 5 |
| wycena tokenów-stworów bez presji życia (Geist, Raise the Alarm; potem symetrycznie: Secure the Scene) | 1 | DONE (2026-10-20/21) | §PMSSB-77 niżej; `test/audyt-pmssb77-tokeny-presja.test.js` (6); pokrętło `tokenPressureWeight` (0 = dawne zachowanie) |
| myriad (Gnoll War Band, CR 702.116) — trigger ataku z `anotherOpponentExists` | 1 | ZAMKNIĘTE BEZ ZMIANY (2026-10-20) | §PMSSB-73 niżej; `test/audyt-pmssb73-myriad.test.js` (3); w 1v1 trigger nie trafia na stos, bot nie wycenia go wcale |
| `damage_each_creature_sacrificed_power` (Bloodfire Infusion): obrażenia = moc poświęconego stwora każdemu stworowi; bot wyceniał płasko 2 i poświęcał własnego stwora bez zysku | 1 | DONE (2026-10-20) | §PMSSB-74 niżej; `test/audyt-pmssb74-bloodfire.test.js` (6; 3–4 RED na HEAD); wspólna miara `sweepHitsValue` z zniszczeniem masowym |
| `controlsType` (Heron-Blessed Geist, CR 602.5b: „activate only if you control an enchantment”) | 1 | ZAMKNIĘTE BEZ ZMIANY KODU (2026-10-20) | §PMSSB-75 niżej; `test/audyt-pmssb75-controls-type.test.js` (3); bramka spójna (oferta i walidacja). OTWARTE poza zakresem: wycena tokenów nie zna presji życia (wspólna miara tokenów, osobna pętla) |
| warunkowa redukcja kosztu (Gnoll War Band, CR 601.2f: „za każdego przeciwnika, któremu zadano obrażenia w tej turze”) | 1 | ZAMKNIĘTE BEZ ZMIANY KODU (2026-10-20) | §PMSSB-76 niżej; `test/audyt-pmssb76-warunkowa-redukcja.test.js` (3 piny, nie RED); silnik i bot czytają ten sam stan |
| **batch 70 — osiem rodzin nowych mechanik**: X w koszcie permanentu, prewencja zdejmująca liczniki, Improvise, `cantBeBlockedByTypes`, `manifest_dread_resolved`, `amountFromGraveyardCardType`, Converge damage, kicked + drugi cel | 10 | **PĘTLA DOMKNIĘTA (2026-10-27)** — 4 DONE (ewazja po typie, trigger manifest dread, licznik z cmentarza, Converge damage), X w koszcie DONE w v2 (próg minimalnego X + dowiązanie zdarzenia/logu/śladu), 3 ZAMKNIĘTE BEZ ZMIANY (prewencja licznikowa, Improvise, drugi cel kickera) | §PMSSB-79 wyżej; plan `docs/plans/PLAN_2026-10-27b-pmssb79-batch70.md`; sonda `tools/pmssb79-batch70-sonda.mjs`; `test/audyt-pmssb79-batch70.test.js` (24 piny + 9 mutacji); lustro `tools/pmssb79-mirror.mjs`; pokrętła `convergeDamagePerColor`, `manifestDreadTriggerValue`, `graveyardCounterWeight`, `graveyardCounterCap`, `xMinimumValue`, `xMinimumValueLooseAtLethal`; golden bez regeneracji |
| convoke (`convoke`, Kavu Primarch z batcha 69) | 1 | **DONE (2026-10-20)** | §PMSSB-72 niżej; `test/audyt-pmssb72-convoke.test.js` (9). Warianty convoke w `legalCommands` (od A-12 także dobrowolne przy dostępnej manie, limit 64; także kicked), kreator płaci tylko resztę many, wycena bota: kara `convokeTapPenalty` × wartość ciała tapowanego stwora, UI grupuje warianty. Golden: hash `7510…` → `9017…` (regeneracja fixture po przeglądzie: 1437 decyzji, 0 zmienionych wyborów/wyników). |
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
| fog/prewencja | 4 | DONE (2026-09-28; korekta Withstand 2026-10-11) | §PMSSB-15 niżej; `test/audyt-pmssb15-prewencja.test.js` (19) + `test/zgloszenie-b-withstand-cel-bota.test.js` (7); `fogWindowValue`, `preventDamageThisTurnValue`, `preventShieldValue` (6 pokręteł `fogWindow*`/`preventEtb*`, bez nowego dla korekty) |
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
| licznik źródeł landu bez karty rozważanej | 1 | DONE (2026-09-30d) | §PMSSB-27 niżej; doprecyzowanie właściciela do PMSSB-26 — „3 na stole albo 2 na stole i 1 dodatkowy w ręku (poza tym rozważanym)"; przywraca pierwotny pin `audyt-pr105` B; 0 nowych pokręteł |
| wybór koloru (`resolve_color_choice`) | 1 | DONE (2026-09-30e) | §PMSSB-28 niżej; plan `PLAN_2026-09-30e-pmssb28-color-choice.md`; `test/audyt-pmssb28-color-choice.test.js` (7); wycena czyta `purpose` z pending (`mana` lądu / `protection` aury); 2 pokrętła `color*Per*` |
| szukanie w bibliotece (`resolve_search_choice`) | 1 | DONE (2026-09-30f) | §PMSSB-29 niżej; plan `PLAN_2026-09-30f-pmssb29-search.md`; `test/audyt-pmssb29-search.test.js` (8); trzecia równoległa miara (L41) domknięta wspólną `cardKeepValue`; 1 pokrętło `searchFoundBase` |
| podgląd satyra (`resolve_satyr_look_choice`) | 1 | DONE (2026-09-30g) | §PMSSB-30 niżej; plan `PLAN_2026-09-30g-pmssb30-satyr.md`; `test/audyt-pmssb30-satyr.test.js` (8); **czwarta** równoległa miara (L41) domknięta; 1 pokrętło `satyrLookBase`; **podłoga z ciała** `max(ciało, wspólna)` w search+satyr — sprostowanie tezy PMSSB-29 |
| chump-block tokenami (`declare_blockers`) | 1 | DONE (2026-09-30h) | §PMSSB-31 niżej; plan `PLAN_2026-09-30h-pmssb31-chump-block.md`; `test/audyt-pmssb31-blok-chump.test.js` (8); **zgłoszenie właściciela z gry**; premia od nadwyżki obrażeń ponad ciało ginącego blokera; 1 pokrętło `blockGoodTradePerPoint`; forward: niemonotoniczna drabinka `lifeAfter` przy lethal |
| produkcja many (`add_mana`: `{T}` / `{mana}+{T}` / `tapCreature` / `sacrificeSelf` / raz-na-turę) | 25 | DONE (2026-10-01c) | §PMSSB-32 niżej; plan `PLAN_2026-10-01c-pmssb32-mana.md`; `test/audyt-pmssb32-mana.test.js` (19 pinów); **pierwsza rodzina z jedną wspólną miarą zamiast ośmiu łatek** — model JEDNOSTEK many (`manaUnitsOfView`/`unitsAfterManaAbility`/`canCastWithUnits`; L41/L48: LICZBY → KOLORY+pipy+`spendOnly`+pula ograniczona), bramka „oferta = płatność" (`castOfferedNow`), wycena celu czaru z ręki (`spellNeedsTarget` + best-of-targets), cena tapnięcia CIAŁA (`tapBodyCost`: main1 = moc, cudza tura = wytrzymałość, main2/po blokach/czujność CR 702.20b/obrońca CR 702.3b = 0); 2 pokrętła `manaTapBody*`; klasa L1 naprawiona u źródła (wpis ręki w widoku bez `types` → martwa reguła instant E6/A1) |
| remisy wyboru (triage tie-audytu: attack/block/cel) | 0 (mikro) | DONE (2026-10-01d) | §PMSSB-33 niżej; `test/audyt-pmssb33-remisy-wyboru.test.js` (7); **werdykt: 16 „GROZY" to znane równości, nie ślepoty wyceny** — 0 zmian kodu; per-kind `--gate` zostaje narzędziem polowania, nie bramką CI |
| koszt many aktywacji + treść sprzętu (`activate_ability`) | 148 z aktywowanymi (111 z kosztem many), 12 sprzętów | DONE (2026-10-01e) | §PMSSB-34 niżej; plan `PLAN_2026-10-01e-pmssb34-koszt-aktywacji.md`; `test/audyt-pmssb34-koszt-aktywacji.test.js` (9); **kontrola procedury (b) domknięta po PMSSB-33**: kara 1 pkt/mana (skala `creatureManaCostWeight`) + treść sprzętu w pierwszym założeniu (L41: `equipValuation.printedBody`); 17 pinów audytów przesuniętych DOKŁADNIE o koszt many; 2 pokrętła `abilityManaCostPenalty`/`equipPumpBonusPerPoint` |
| odroczenie zagrania (`plot_card` / `suspend_card` / `warp_card` + rzut karty czekającej z wygnania) | 5 kart (mindstab, tumbleweed-rising, spinewoods-paladin, sheriff-of-safe-passage, weftblade-enhancer) — wszystkie w taliach wzorcowych | DONE (2026-10-01f) | §PMSSB-35 niżej; plan `PLAN_2026-10-01f-pmssb35-odroczenie.md`; `test/audyt-pmssb35-odroczenie.test.js` (18 pinów); **wypłata odroczenia liczy kartę z każdej strefy** (`handCard ?? zoneCard`, L41 — PRZED cztery różne karty = 63,000) i nie odejmuje kosztu, gdy rzut jest darmowy (`castsWithoutPayingMana`: plot CR 702.170d, impuls CR 701.18); cena odroczenia = koszt akcji (skala `creatureManaCostWeight`) + zwłoka; dostępność z OFERTY silnika (`castOfferedNow`) zamiast legacy `manaAvailableNow`; **znalezisko silnika naprawione u źródła**: pieczęć wygnania (plot/warp/impuls/zawieszenie) nie przeżywa zmiany strefy (CR 400.7 + 702.185b + glosariusz „Plotted", choke point `moveObjectDirectly`); 3 pokrętła `plotRedundantPenalty`/`plotDelayPenalty`/`suspendWaitPenalty` |
| mechaniki kart batcha 62 (exploit z zasobami, cel własny ETB, wypłata liczników na polu) | 10 kart (Aven, Jade Bearer, Tackle Artist, Pangolin + 6 przeglądniętych) | DONE (2026-10-02b) | §PMSSB-36 niżej; plan `PLAN_2026-10-02b-pmssb36-nowe-karty.md`; `test/audyt-pmssb36-nowe-karty.test.js` (9 pinów, 8 czerwonych PRZED); exploit z `draw_cards`/`lose_life` liczony NETTO (`exploitSelfResourceGain`, wspólna drabina `selfLifeLossPenalty` L48), bramka celu własnego ETB, `boardCastPayoffValue` (Opus/Pangolin); 3 pokrętła `exploitThinBoardPenalty`/`exploitNetMargin`/`boardPayoffWeight` |
| trzy granice po PMSSB-36 (bite bez zabicia, payoffy ≠ licznik, zapłata opcjonalna Pangolina) | Chocobo Kick, Tellah, Oreplate Pangolin | DONE (2026-10-02c) | §PMSSB-37 niżej; plan `PLAN_2026-10-02c-pmssb37-trzy-granice.md`; `test/audyt-pmssb37-trzy-granice.test.js` (12 pinów, 7 czerwonych PRZED + 2 kontrole pokręteł); `fightBiteMissPenalty` 80, rozszerzone `boardCastPayoffValue`, `payBlocksBetterCast`; pokrętła `fightBiteMissPenalty`/`optionalPayBlockedCastMin`/`optionalPayCastScoreWeight` |
| licznik czarów w widoku bota + incubate (second-spell payoffy, Tiller of Flesh, Merciless Repurposing) | Illvoi Operative, Tiller of Flesh, Merciless Repurposing | DONE (2026-10-02d) | §PMSSB-38 niżej; plan `PLAN_2026-10-02d-pmssb38-licznik-spelli-incubate.md`; `test/audyt-pmssb38-licznik-spelli-incubate.test.js` (6 pinów, 4 czerwone PRZED + 2 kontrole); `playerView.spellsCastThisTurn`, `incubateValue`; bez nowych pokręteł |
| payoffy z efektem tymczasowym przy rzucie (prowess, Jeskai Devotee, Kulrath Mystic) | Jeskai Windscout, Jeskai Devotee, Kulrath Mystic | DONE (2026-10-02e) | §PMSSB-39 niżej; plan `PLAN_2026-10-02e-pmssb39-pump-triggery.md`; `test/audyt-pmssb39-pump-triggery.test.js` (10 pinów, 6 czerwonych PRZED + 4 kontrole); `temporaryPumpPayoff` (okna walki/głównej 1 + polityka ataku), warunki triggera rzutu; 3 pokrętła `tempPumpTrickValue`/`tempPumpFaceDamageValue`/`tempPumpBlockOdds` |
| payoffy rzutu II: efekty skierowane (`requiresTarget`) + wymiar nietapnięcia (Molten Nursery, Goblin Battle Jester, Steelfin Whale, rider vigilance Kulratha) | 4 karty (`molten-nursery`, `goblin-battle-jester`, `steelfin-whale`, `kulrath-mystic`) | DONE (2026-10-03a) | §PMSSB-40 niżej; plan `PLAN_2026-10-03a-pmssb40-skierowane-nietapniecie.md`; `test/audyt-pmssb40-skierowane-nietapniecie.test.js` (17 pinów, 11 czerwonych PRZED kodem; 6/6 mutacji RED); bramka `requiresTarget` przestaje pomijać trigger (wymóg celu → miara), nogi `damage`/`cant_block`/`untap_permanent`, `cantBlockPayoffValue`, `untappedBodyDefense`; 1 pokrętło `payoffUntappedBodyWeight` |
| zgłoszenia właściciela z testów: warp bez celu (Weftblade Enhancer), untap celu triggera (Nanoform Sentinel), kolejność tapowania do Station (Wedgelight Rammer), badge'y reanimacji (Xu-Ifit) | 4 karty | DONE (2026-10-03b) | §PMSSB-41 niżej; plan `PLAN_2026-10-03b-pmssb41-uwagi-testow.md`; `test/audyt-pmssb41-uwagi-testow.test.js` (25 → 30 pinów, mutacje m1–m9 + m10–m13 RED); runda 2: LANDWALK w widoku (kryterium A) — plan `PLAN_2026-10-03c-pmssb41-runda2-landwalk.md`; `untapTargetValue` (3 ścieżki, L41), `warpEtbHostPayoff`, progress/closes/overshoot Station, badge'y `bez zdolności`/`typ: +X`; 4 pokrętła `warpEtbHostMin`/`warpFutileEtbPenalty`/`warpRedundantPenalty`/`stationCloseBonus` |

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

## PMSSB-29 — `resolve_search_choice` na wspólnej mierze (2026-09-30f)

> **SPROSTOWANIE (2026-09-30g, PMSSB-30).** Ta sekcja twierdziła, że manabaza
> zmienia wybór przez **próg zasięgu** bomby (22 przy 0 lądów → 37 przy 8).
> To było przesadzone i zostało obalone pinem `real-cards-batch55` B55/B4
> (Brightwood Tracker): przy 0 lądów próg zasięgu odwracał wybór z 4/5 na 1/1.
> Karta szukana idzie **na stałe do ręki**, więc obowiązuje podłoga z ciała
> `max(handCardKeepValue, cardKeepValue)`. Manabaza **nadal** zmienia wybór —
> ale przez drabinę lądów (land 55 → 25), nie przez zasięg. Obalona została też
> „granica uczciwości" z B4: czary remisowały tylko dlatego, że `cardKeepValue`
> ignorował koszt. Szczegóły w §PMSSB-30.

Cel wybrany z **odświeżonego** audytu remisów (`node tools/bot-tie-audit.mjs --gry=40` —
480 partii, 258 317 decyzji): `resolve_search_choice` ma **245 remisów i wszystkie są
„równoważne"** (0 rozróżnialnych), czyli wycena daje wariantom identyczną liczbę i bot bierze
pierwszy z listy.

**Znajdowanie (L41 — trzecia równoległa miara):** wycena szukała własną regułą
`25 + (land ? 30 : 0) + 2P + T` obok `handCardKeepValue` (PMSSB-25/F1) i wspólnej
`cardKeepValue`. Pomiar PRZED (sonda `scratch/pmssb29-search-przed.mjs`), kandydaci: land,
Delta Bloodflies {1}{B} 1/2, Woolly Loxodon {5}{G}{G} 6/7, dwa czary — wyniki **identyczne
przy 0, 3, 8 i 12 lądach**: land=55 · bomba=44 · stwór=29 · czary po 25. Reguła nie znała
drabiny lądów, zasięgu many ani koloru: przy 12 lądach bot szukał kolejnego landu zamiast
6/7, przy 0 lądów bomba za 7 biła grywalnego stwora za 1, a wszystkie czary dostawały 25.

**Fala A (`c11ff41`):** `P.searchFoundBase + cardKeepValue(view, card)` — wspólna miara daje
drabinę lądów (PMSSB-26), próg zasięgu (`cost > reach + 2` → −3) i zniżkę za duplikaty
w jednym miejscu. Baza 25 zostaje, więc relacja do −40 za „nie znajdź karty" nietknięta.

**POMIAR PO:**

| Lądy | PO | Wygrywa |
|---|---|---|
| 0 | land **55** · stwór 32 · czar 27 · bomba 22 | land — brak manabazy bije wszystko |
| 3 | stwór **33** · czar 29 · bomba 22 · land 19 | grywalny stwór, nie kolejny land |
| 8 / 12 | bomba **37** · stwór 33 · czar 29 · land 19 | bomba wreszcie w zasięgu |

**Granica uczciwości (pin B4):** czary bez P/T wciąż remisują, bo widok nie wystawia TREŚCI
czaru z biblioteki (strefa ukryta, CR 400.2). Bot nie ma danych, żeby je rozróżnić — pin
kotwiczy, że nie wymyślamy fałszywego rozróżnienia. Część z 245 remisów zostanie i tak ma być.

**Piny** `test/audyt-pmssb29-search.test.js` (8): A1–A4 manabaza zmienia wybór, B1 szukanie
bije rezygnację −40 (kotwica zgłoszenia właściciela B; rezygnacja tylko przy szukaniu
nieobowiązkowym, CR 701.23d), B2 baza jako pokrętło, B3 drabina dochodzi przez pokrętła
PMSSB-26 (jedno źródło prawdy), B4 granica uczciwości. **Mutacja M1** → RED
`{A1, A2, A3, A4, B2, B3}`, B1/B4 zielone. **Pokrętło:** `searchFoundBase` 25.

**Stan klasy L41:** `cardKeepValue` jest teraz źródłem prawdy dla scry, surveil, look_top,
clash, mill, discard i **search**. `handCardKeepValue` zostaje jako suwit dla dużych ciał
(`max(ciało, wspólna)`), a `escapeExileCostOf` (dwugałęziowy kikut) pozostaje forwardem —
w rejestrze nie ma kart grywalnych z grobu.

**Bramki:** `npm test` 7187/7187 · `npm run build` 70 mod / 4657.6 kB ·
`npm run test:all` **7458 / 7458, exit 0**, golden-master `ok 1725` bez regeneracji.

---

## PMSSB-28 — `resolve_color_choice` czyta cel wyboru (2026-09-30e)

Silnik **niesie cel wyboru w pending**: `game-state.js:5762` ustawia `purpose: 'mana'` dla
lądu z `chooseColor` (Manor Gate), `spells.js:2655` — `purpose: 'protection'` dla aury.
Wycena tego pola **nie czytała** i liczyła jedną płaską sumę `5 + needScore*6 + enemyInColor`
dla obu celów.

**Pomiar PRZED** (sonda `scratch/pmssb28-color-przed.mjs`), stan z przeciwstawnymi motywami
(p2: 3 lasy + Delta Bloodflies {1}{B} w ręce; p1: trzy czerwone stwory):

| Cel | PRZED | Czytanie |
|---|---|---|
| `protection` | U=11, B=11, R=8, W=5, G=5 → **{U}** | **błąd** — wróg nie ma ani jednego stwora {U}, aura nie chroni przed niczym |
| `mana` | U=11, B=11, R=8, W=5, G=5 → **{U}** | identyczny wynik — `purpose` był martwym polem |

**Fala A (`5c28560`):** rozdział po `purpose` — ochrona liczy tylko kolor wrogich stworów,
mana tylko kolor potrzebny w ręce, a **nieznany cel zostaje przy dawnej sumie** (kotwica
anty-over-fix: nic, czego nie zmierzyliśmy, nie zmienia zachowania).

**PO:** ochrona wybiera **{R} = 23**, mana wybiera **{B} = 11** — ten sam stan, różne wybory.
Przy pustym stole wroga ochrona remisuje po 5 i nie wymyśla koloru z potrzeby many
(PRZED wygrywało {B} = 11).

**Piny** `test/audyt-pmssb28-color-choice.test.js` (7): A1–A4 rozdział celów, B1 anty-over-fix
(nieznany cel = dawna suma: B=11, R=8, U=5), B2 wagi jako pokrętła, B3 uczciwy remis przy
pustym stole. **Mutacja M1** → RED `{A1, A2, A3, A4, B2, B3}`, B1 zielony.

**Pokrętła (2):** `colorProtectionPerCreature` 6 · `colorManaNeedPerCard` 6.

**Trop porzucony po pomiarze:** rodzina „wygnaj karty z grobu" (`resolve_delve_exile` /
`resolve_escape_exile` / `resolve_reveal_exile_grave`) ma wspólną miarę `escapeExileCostOf`
w postaci dwugałęziowego kikuta (stwór = `10 + 2P + T`, każda inna karta = stałe 6), ale
**w rejestrze nie ma ani jednej karty grywalnej z grobu ani reanimacji**, więc „grób jako
zasób" byłby niezmierzalny na prawdziwych kartach. Forward na moment, gdy takie karty wejdą.

**Bramki:** `npm test` 7179/7179 · `npm run build` 70 mod / 4656.3 kB ·
`npm run test:all` **7450 / 7450, exit 0**, golden-master `ok 1717` bez regeneracji.

---

## PMSSB-27 — licznik źródeł landu BEZ karty rozważanej (2026-09-30d)

**Doprecyzowanie właściciela do PMSSB-26:**

> „Jako sytuacje — raczej odrzucaj myślałem o 3 na stole albo 2 na stole i 1 dodatkowy
> w ręku (**poza tym rozważanym**)."

To nie jest przesunięcie progu, tylko **zmiana semantyki licznika**: `landKeepValue` liczy
źródła koloru (albo sumę lądów) **poza kartą właśnie ocenianą**. Przy liczniku obejmującym
rękę próg wypadał o jedno źródło za wcześnie (2 poza rozważanym zamiast 3), a stopień
„0 → nigdy nie odrzucaj" był dla landu w ręce nieosiągalny — trzeba go było kotwiczyć przez
scry. Teraz „0" znaczy dokładnie to, co powinien: **ten land jest moim jedynym źródłem koloru**.

**Pomiar PO** (sonda `scratch/pmssb27-land-po.mjs`), land wobec bezbarwnego stwora (12 pkt):

| Źródła poza rozważanym | Land | Stopień |
|---|---|---|
| 0 | **−10** | bardzo duża — nigdy nie odrzucaj |
| 1 | **2** | spora |
| 2 | **12** | neutralna (remis ±1) |
| 3 | **31** | niska — raczej odrzucaj |

Oba przykłady właściciela dają ten sam wynik: **3 na stole → 31** oraz **2 na stole
+ 1 dodatkowy w ręce → 31**. Drabina bezbarwna: 0 i 2 → −10 · 4 → 2 · 6 → 12 · 7 → 31.

**Doprecyzowanie PRZYWRACA pierwotny pin** `audyt-pr105-bot-hand-top` B: przy 2 lasach na
stole i trzecim w ręce (2 źródła {G} poza nim) bot znów zostawia trzeci las i oddaje
9-manowy czar poza zasięgiem. **Znika „konsekwencja do potwierdzenia" z PMSSB-26** —
nie ma już rozjazdu między drabiną a wcześniejszym uzgodnieniem. Nowy B2 kotwiczy prawdziwe
przesycenie (3 lasy na stole).

**Zaktualizowane piny:** PMSSB-26 A1/A2/A3/B2/B3/B4/C2/C3/C4/C5, PMSSB-25/A2 (3 źródła poza
rozważanym), pr105 B/B2. **Bez zmian:** PMSSB-26/A4 (scry), PMSSB-24/C3, pakiet-c E2/C1 i
E2/C2 — tam oceniana karta leży poza ręką, więc licznik jest taki sam.

**Bramki:** `npm test` 7172/7172 · `npm run build` 70 mod / 4654.4 kB · golden-master
**bez regeneracji** (zmiana progów nie przesunęła decyzji w pełnych partiach) ·
`npm run test:all` **7443 / 7443, exit 0**, golden-master `ok 1710`.

---

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

**ROZWIĄZANE przez PMSSB-27:** wątpliwość „przy 2 lasach na stole i trzecim w ręce bot
oddaje trzeci las" wynikała z licznika obejmującego kartę rozważaną. Właściciel
doprecyzował, że licznik ma jej NIE obejmować — patrz §PMSSB-27. Pierwotny pin
`audyt-pr105-bot-hand-top` B wrócił do postaci sprzed PMSSB-26.

**Bramki:** `npm test` 7172/7172 · `npm run build` 70 mod / 4654.1 kB ·
`npm run test:all` **7443 / 7443, exit 0** — po **świadomej regeneracji golden-mastera**
(overallHash `6f6ccbbd…` → `8c459fdc…`): nowa wycena landu zmienia ślad bota w pełnych
partiach, a komunikat testu każe regenerować fixture przy świadomej zmianie parametrów.

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
- `prevent_next_damage` (Withstand) korzysta z
  `preventShieldValue`/`preventShieldTargetValue`. Korekta właściciela
  2026-10-11 zamknęła dawną granicę: `draw_cards` pozostaje wycenione przez
  PMSSB-3, lecz nie może samo uzasadnić zużycia tarczy poza oknem obrażeń.
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


### Addendum 2026-10-11 — Withstand jest combat trickiem, nie cantripem

Uwaga z gry A: bot rzucał Withstand zaraz po odtapowaniu lądów. Dawny werdykt
Q1b świadomie pozwalał zużyć kartę dla samego `draw_cards`; pomiar potwierdził
score **61/60** dla jałowej tarczy własnego stwora/gracza, więc oferta
wygrywała z passem. Właściciel odwrócił ten werdykt: draw jest riderem, a nie
powodem rzutu.

`preventShieldValue` używa teraz istniejącego `fogWindowWastedValue = -75`,
gdy nie ma nadchodzących obrażeń albo tarcza nie ratuje stworzenia. Dzięki
L41 reguła działa tak samo dla płatnego i darmowego rzutu, bez nazwy karty i
bez nowego pokrętła. Pomiar PO: pusty stos/upkeep **−19 < pass 0**; lethalny
Shock w 1/1 **77 > pass**; nielethalny Shock w 2/3 znów przegrywa z passem.
Dodatkowo B4 przepisano na produkcyjne `execute`: stary fixture przekazywał
`targets` do `addObject`, więc cel był odrzucany i test był fałszywie zielony
wyłącznie przez dawny bonus cantripu. RED→GREEN: B5/Q1b 2/2 RED przed fixem,
B4b RED po oddzieleniu dowolnego pinga od lethalu; końcowa macierz prewencji
**32/32**, fast **8042/8042**, pełne **8306/8306**, benchmark **10/10**,
build **73 moduły / 5019,3 kB**. Golden master zmienił dokładnie jedną z sześciu
partii: pierwszy rozjazd decyzji to zamierzony upkeep `cast Withstand` → pass;
fixture świadomie odnowiony. Commit `ca34cfe`.

### Addendum 2026-10-11 — Skilled Animator czeka na godny artefakt

Uwaga z gry B: bot rzucał Skilled Animatora jako zwykłe 1/3 za {2}{U}, mimo
trzech dużych własnych stworów i zera artefaktów. Pomiar RED: oferta miała
**63,9009 > pass 0**. Sama tabela ETB dawała `animate_linked` płaskie +10 za
DOWOLNY artefakt, lecz brak artefaktu był zerem zamiast stratą głównego
payoffu; nawet 4/4 artifact creature dawało **72,9009**.

Naprawa jest po deskryptorze `animate_linked`, bez nazwy karty. Nie-stwór
artefakt jest pełnym celem; artifact creature liczy się tylko wtedy, gdy baza
5/5 daje istotny dodatni zysk — samo 4/4 → 5/5 nie wystarcza, małe 3/3 tak.
Brak godnego celu nakłada `linkedAnimationFutilePenalty = 90`, więc karta
przegrywa z passem. Jedyny wyjątek odtwarza kryterium właściciela: projekcja
najbliższego kontrataku przed i po dodaniu ciała sprawdza bloki, flying,
menace oraz trample i zwalnia karę tylko wtedy, gdy nowe 1/3 zmienia lethal w
przeżycie. Lethalny latacz poza zasięgiem nie uruchamia wyjątku.

Regresja produkcyjnej decyzji bota: **9/9** (dokładny stół z trzema dużymi
stworami, 6/6 i 12/12 jako ratunkowy chump, latacz, zdrowe życie, nie-stwór
artefakt, 4/4, 3/3 oraz pokrętło ×0). Fast **8051/8051**, golden master
**4/4 bez zmiany fixture**, pełne **8315/8315**, benchmark **10/10**, build
**73 moduły / 5025,4 kB**. Commit `c85b175`; GitHub CI **SUCCESS** — run
`38173232995`.

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

## PMSSB-30 — `resolve_satyr_look_choice` na wspólnej mierze (2026-09-30g)

**Czwarta** równoległa miara wartości karty. Kod: `30 + (land ? 30 : 0) + 2P + T`,
przy czym komentarz obiecywał „Ląd premiami za manabazę", a premia była stała.

**Pomiar PRZED** (sonda `scratch/pmssb30-satyr-przed.mjs`, identycznie przy
0/3/8/12 lądach): `land 60 · bomba 49 · stwór 34 · czar 30 · rezygnacja −5`.

**PO:** `P.satyrLookBase + max(handCardKeepValue, cardKeepValue)`, pokrętło
`satyrLookBase: 30`. Land 60 → 30 po nasyceniu; wynik bomby stały (51), bo ciało
dominuje. O wyborze decyduje land — jedyna karta, której ciało milczy.

**Podłoga z ciała** to skutek pęknięcia pinu `real-cards-batch55` B55/B4: sama
wspólna miara odwracała wybór z 4/5 na 1/1 przy 0 lądów (próg zasięgu −3 vs +7).
Karta podglądnięta i szukana idzie na stałe do ręki, więc kara za chwilowy brak
many jest za ostra. Wzorzec `max(ciało, wspólna)` — ten sam, który
`discardCostPreference` dostał w PMSSB-26 — zastosowany w obu miejscach.

**Golden-master wymagał regeneracji** (`scoreSum` 2896.5881 → 2918.5881);
PMSSB-28 i PMSSB-29 nie wymagały.

**Bramy:** 73/73 (search+satyr+batch55) · szybki **7195/7195** · build 70 mod /
**4659,5 kB** · `test:all` **7466/7466 EXIT=0** po regeneracji.

## PMSSB-31 — chump-block tokenami: premia za korzystną wymianę (2026-09-30h)

Fala z **obserwacji z rozgrywki** (zgłoszenie właściciela), nie z audytu remisów.

**Zgłoszenie:** „Bot ma 4 tokeny 1/1. Atakuję go kilkoma kreaturami w tym 4/4,
3/3 bez trample. Mimo to bot nie blokuje tymi disposable tokens i dostaje 7 dmg.
Po to ma te małe token kreatury żeby go broniły przed atakiem większych kreatur."

**Pomiar PRZED** (4 tokeny 1/1 vs 4/4 + 3/3): `block[a44<4 tokeny]` = 4 ← wybór
bota; `block[a44<tok0 a33<tok1]` = 1 ← poprawne zagranie; `block[a33<tok0]` = 0
= `pass_priority`. Bot topił wszystkie cztery tokeny w jednym 4/4 i wciąż
dostawał 3 obrażenia.

**Przyczyna:** `+attackerPower` i `−(P+T)` były w jednej skali, więc chump 3/3
tokenem 1/1 dawał `3 − 2 − 1` = **0** — dokładnie tyle samo co pass.

**Odrzucone rozwiązanie:** płaska waga obrażeń (×3) naprawiała ten przypadek,
ale łamała **9 testów**, w tym piny jawnie anty-over-fix („30 życia — blok 2/2
vs 3/3 NIE wygrywa z passem", „bot NIE marnuje WARTOŚCIOWEGO blokera").
Rozróżnikiem nie jest waga obrażeń, tylko **opłacalność wymiany**.

**Rozwiązanie:** premia tylko od **nadwyżki** i tylko gdy bloker realnie ginie:
`if (blockerValueLost > 0 && attackerPower > blockerValueLost) score +=
(attackerPower − blockerValueLost) * P.blockGoodTradePerPoint;` (pokrętło = 2).
Token 1/1 za 3 obrażenia → premia; 2/2 za 3 obrażenia → brak nadwyżki, piny
anty-over-fix zostają zielone.

**PO:** 4 tokeny vs 4/4+3/3 → `a44<tok0 a33<tok1` (7), **0 obrażeń**; trzech
atakujących (10 dmg) → blokuje wszystkich trzema tokenami (21); 2 tokeny →
split (7); tokeny tapnięte → nadal `block[]` (CR 509.1a).

**Forward (zmierzony, nie naprawiony):** przy lethal drabinka `lifeAfter` jest
niemonotoniczna, więc przy 7 życiu „blok tylko 4/4, dostaję 3" (lifeAfter 4 → +4)
remisuje z „blok obu, dostaję 0" (lifeAfter 7 → +2) — oba **39**. Epsilon
`stoppedDamage * 0.01` rozstrzygał to poprawnie, ale ułamkowy wynik łamał piny
wartości dokładnych (PMSSB-2/C/F8), więc został wycofany.

**Bramy:** piny 8/8 · szybki **7203/7203** · build 70 mod / **4661,6 kB** ·
`test:all` **7474/7474, EXIT=0** po regeneracji golden-master.

## PMSSB-32 — produkcja many (`add_mana`): kiedy tap realnie odblokowuje grę (2026-10-01c)

**Rodzina:** 25 kart / 28 wystąpień — największa spoza rejestru. Klasy kosztu:
`{T}` ×20 (w tym 16 lądów — silnik auto-tapuje lądy przy płatności, więc ręczna
aktywacja liczy się tylko w stanach nietypowych), `{mana}+{T}` ×3 (Mana Cylix,
Heap Gate, Apprentice Wizard), `{T}+tapCreature` ×2 (Holdout Settlement,
Dragonbroods' Relic), `sacrificeSelf` ×2 (Skarb, Eldrazi Scion), raz-na-turę bez
tapu ×1 (Jeskai Devotee). Wycena narosła z OŚMIU łatek z gier (M128, M155,
M119/Z5 + M150/C1, B54/s4008, F 2026-09-19b, M243/C, E6/A1, M167/D) — brakowało
jednej wspólnej miary i to była teza pętli.

**Pomiar PRZED:** sonda `scratch/pmssb32-mana-przed.mjs` (25 scenariuszy, realne
karty katalogu, `pass` jako kotwica 0, wypisany wybór bota), logi
`/tmp/pmssb32-przed-out2.txt` (PRZED) i `/tmp/pmssb32-po-final.txt` (PO).

| # | Finding (PRZED) | Wymiar | Fala |
|---|---|---|---|
| F1 | Apprentice Wizard + 3 lądy + karta z pipem `{W}`: aktywacja **+10 = WYBÓR**, choć trzema bezbarwnymi jednostkami nigdy nie opłaci `{W}` | próg LICZBOWY vs KOLORY | A |
| F2 | Powerstone (`spendOnly: artifact`) „odblokowywał" STWORA (**+6 = WYBÓR**); to samo z pulą ograniczoną drukiem wziętą za „już stać" | RESTRYKCJA wydania | A |
| F3 | filtr koloru nie odblokowywał NICZEGO, choć po aktywacji czar staje się płatny (Skarb + Las + Shock = **−10, pass**) — po drugiej stronie kolor, którego źródło NIE produkuje, bywał „odblokowaniem" | KOLOR (pipy) | A + C |
| F4 | tap ciała bez ceny bojowej: main1 == main2 (Villager 6,0 = 6,0), a `tapCreature` 0/1 == 4/4 (3 = 3, nierozróżnialne) | TIMING × CIAŁO | B |
| F5 | reguła E6/A1 (instant rzucalny w cudzym kroku) była **martwa**: wpis ręki w widoku niósł `kind: 'spell'` dla obu typów czarów i nie niósł `types` | L1 — dane nie docierały do osądu | A |
| F6 | Skarb finansował czar z celem, ale bramka „chcę to rzucić" pytała komendę BEZ celu (Shock bez celu = −10) → removal/burn nigdy nie uzasadniał jednorazowego źródła | L41/L48 — dwie wyceny | A3 |

### Fale

- **A — model JEDNOSTEK many (L41).** Jedna arytmetyka „ile i jakich pipów":
  `manaUnitsOfView` (pula kolorowa + pula ograniczona drukiem tylko dla celu,
  na który wolno ją wydać, + nietapnięte LĄDY z `manaSource` widoku),
  `unitsAfterManaAbility` (koszt aktywacji schodzi — `cost.mana`/`cost.colors`;
  własna jednostka LĄDU nie dubluje się: B54/s4008), `canCastWithUnits`
  (liczba + `coloredPipsOf` + `matchColorRequirements` — te same funkcje co
  silnik). Zastępuje próg liczbowy M128 („koszt karty w przedziale
  availableNow…availableAfter"), który nie widział ani kolorów, ani `{C}`,
  ani restrykcji. Naprawa klasy L1: `playerView` oddaje `types` wpisu ręki
  (i `spell.timing`), więc `isInstantSpeedCard` działa w PRODUKCJI, nie tylko
  w fixturach. Wycena celu: `spellNeedsTarget` + `targetCandidatesOf`
  (najlepszy cel z widoku, gdy silnik nie ma oferty — L41: ta sama funkcja
  wyceny, ten sam kształt komendy).
- **B — cena tapnięcia CIAŁA (`tapBodyCost`, 2 pokrętła `manaTapBodyPerStat: 2`,
  `manaTapBodyMax: 8`).** Tap stwora płaci za to, co realnie odbiera:
  własna tura przed deklaracją atakujących = MOC (CR 508.1a — tapnięty nie
  zaatakuje), cudza tura przed blokującymi = WYTRZYMAŁOŚĆ (CR 509.1a), a
  main2, po blokach, przy chorobie przywołania, **czujności (CR 702.20b)**
  i **obrońcy (CR 702.3b)** = 0. Dawna płaska cena `tapCreature` −3 ZOSTAJE,
  dopłata jest tylko różnicująca (anty-over-fix M429).
- **C — bramka „oferta = płatność" (`castOfferedNow`).** Skoro silnik oferuje
  rzut, to auto-płatność go pokryje (auto-tap lądów, źródeł wolnych
  i kosztowych) — ręczna aktywacja niczego nie odblokowuje, a przy Skarbie
  kosztuje jednorazowy token. Zamiar dawnej fali: aktywacja jest wyceniana
  jako REALNA alternatywa (gdy silnik nie potrafi zapłacić), a nie jako
  „przygotowanie many", której nikt nie zużyje (CR 500.4).

### Piny (19, `test/audyt-pmssb32-mana.test.js`, 19/19 GREEN)

`A1` −4 (bezbarwna nie opłaca `{W}`) · `A2` −4 (mana artefaktowa nie opłaca
stwora) · `A3` oferta `cast_permanent(mana-cylix)` = **62,0991** vs aktywacja < 0
(oferta = płatność) · `A4` −4 (pula ograniczona nie udaje dostępnej) · `A5` −8 +
oferta `cast_spell(shock->p2)` = **60** (filtr koloru finansuje silnik) ·
`A5b` **+6 = WYBÓR** (Skarb + kolor + czar Z CELEM — aktywacja to jedyna droga) ·
`A6` −8 (kolor, którego źródło nie produkuje) · `B1` `+tap:wall` **3** vs
`+tap:big` **−5** (ściana wybrana) · `B2` `+tap:huge` **−5** (sufit kary działa) ·
`B3` main1 **−6** < main2 **−4** · `B4` cudza tura **−6**, po blokach **−4** ·
`B5` instant w ręce: `types ⊇ ['Instant']` + `spell.timing` · `B6` −4 (artefakt
płatny automatem — wartość sprzed pętli) · `B7` czujność **−4** / bliźniak **−8**
w main1, oba **−4** w main2 (CR 702.20b) · `B8` cudza tura oba **−8** (czujność
nie daje darmowego blokera) · `B9` obrońca **−4** (CR 702.3b) · `B10` trik
bez okna walki: Skarb **−10 = pass** (anty-over-fix) · `C1` `manaTapBodyPerStat: 0`
→ **−4** (cena sprzed fali) · `C2` `manaTapBodyMax: 0` → ściana == 4/4 == **3**.

### Mutacje (dowód, że piny trzymają reguły; `/tmp/pmssb32-mutacje-final.txt`)

| Mutacja | Wynik | Czerwone piny |
|---|---|---|
| M1 próg liczbowy bez kolorów | 17/19 | A1, A5b |
| M2 brak dopłaty za ciało | 13/19 | B1, B2, B3, B4, B7, B8 |
| M3 brak wykluczenia L48 (oferta = płatność) | 10/19 | A3, A5, B3, B4, B6, B7, B8, B9, C1 |
| M4 wpis ręki bez `types` | 18/19 | B5 |
| M5 `spendOnly` zignorowane | 17/19 | A2, A4 |
| M6 brak zwolnienia czujności/obrońcy | 17/19 | B7, B9 |
| M7 bramka „chcę to rzucić" bez celów | 18/19 | A5b |

### Kontrole obowiązkowe procedury

- **(a) L41** — cast_spell/cast_permanent/aktywacja liczą płatność TĄ SAMĄ
  funkcją (`canCastWithUnits`) co silnik (`matchColorRequirements`,
  `expandManaPool`, `spendOnly`), a nie drugą arytmetyką; scalone zostały też
  dwie wyceny kastru (oferta vs komenda syntetyczna) w `castScoreForUnlock`.
- **(b) wymiar KOSZTU** — 1 mana (Skarb, `net` 1) → +6, vs 2 many (Villager,
  `net` 2) → premia `4·net`; ciało 0/1 vs 4/4 → 3 vs −5 (nie remisują);
  `C1`/`C2` pokazują, że po wyzerowaniu pokręteł wraca cena sprzed fali.
- **(c) anty-over-fix M429** — najsłabszy realny wariant zachowuje DAWNĄ
  wartość: `B6` −4 (M128 bez zmian), `B10` −10 (kara za jednorazówkę
  + brak odblokowania), `A5`/`A6` −8 (kara M150/C1), płaska cena `tapCreature`
  −3 zostaje jako podstawa, nowy wymiar to wyłącznie dopłata.

### CR u źródła (wydanie 2026-09-25)

Sekcja F dotyka faz: **508.1a** (atakujący deklarowani tylko, gdy odtapowani),
**509.1a** (blokujący j.w.), **702.20b** (czujność — „Attacking doesn't cause
creatures with vigilance to tap"), **702.3b** (obrońca — „can't attack"),
**500.4** (mana znika na końcu kroku/fazy), **307.5** (timing instantów).
Runda wykryła przekręcone NUMERY w komentarzach kodu: cytowaliśmy `702.20a`
i `702.3a` (definicje statyczne) tam, gdzie chodzi o SKUTEK dla tapowania —
poprawione na `702.20b`/`702.3b` (`heuristic-bot.js`, `heuristic-params.js`)
i dopisane do tabeli numerów CR wraz z aliasem „obroń" dla wpisu 702.3
(`test/helpers/cr-numery-tabela.js`, strażnik 702). Aliasy to mechanizm
sankcjonowany — nie wyjątek od reguły nazw.

### Bramy

- **Piny** 19/19 GREEN; mutacje 7/7 czerwienią właściwe piny (tabela wyżej),
  po przywróceniu 19/19.
- **Rodzina many** (9 plików `*mana*`/m128/m243/jeskai-devotee) **128/128**;
  `real-cards-batch54` 71/71 (regresje Abstruse/Zendikar); `m243-bot-mana-marnotrawstwo`
  rozszerzony o fixture z rodziny.
- **Szybki `npm test` 7270/7270 EXIT=0**; **`npm run test:all` 7541/7541 EXIT=0**;
  **build 70 modułów / 4697,0 kB**.
- **Golden-master** (`bot-scoring-snapshot`): `scoreSum` wymagał regeneracji —
  ŚWIADOMY dryf (aktywacje z rodziny zmieniają sumy wycen, decyzje te same);
  zapisane jako wyjątek procedury z uzasadnieniem, nie „przypadkowa” zmiana.
- **Hashe determinizmu** (`/tmp/pmssb32-hashe.mjs`): każda para talii i suma
  ogólna „bez zmian" na puli bench — decyzje w realnych partiach te same.
- **tie-audit** (`--gry=2`, 24 partie / 12 785 decyzji): decyzje z alternatywami
  2352, remisy 634 (**27,0%**), z tego 450 to pary „brak akcji" silnika, a 184
  (**9,7%** decyzji akcyjnych) to remisy realne — POPRAWA wobec poprzedniej pętli
  (28,3% / 10,8%). „GROZY" (remisy przy różnych danych): 16 — `attack` 9,
  `block` 2, `activate_ability` 2, `cast_spell` 1, `resolve_color_choice` 1,
  `resolve_discard_choice` 1; to wybór CELU/ofiary (dwa równie dobre cele),
  nie produkcja many — kolejka PMSSB-33.
- **mirror-eval** (wymiar ciała włączony vs wyłączony `×0`, 6 talii × 4 seedy × 2
  strony = 48 meczów): **24:24 (0,5000)**, 0 niedokończonych — brak sygnału
  w lustrze przy wąskim stanie (B6): pokrętło różnicuje decyzje tylko tam, gdzie
  bot tapuje CIAŁO na manę, a to rzadkie w puli bench. Pozostałe elementy pętli
  (model jednostek, bramka oferty, wycena celu) nie mają pokrętła — dowodem są
  piny i mutacje, nie lustro.
- **Żywy Tester PO** (`tools/table-tester/run-game.mjs`, artefakt z tej pętli, 6 partii:
  bot `innistrad-brg` ×3 seedy 701–703, `srodziemie`, `wiedzmin-wur`, `tarkir-wur`):
  6× „DETEKTORY: brak zgłoszeń" + 6× „NIEWYCENIONE: brak". Rodzina realnie zagrana:
  bot aktywował `Moonscarred Werewolf` 3× („dodanie 2 many zielonych" — przypadek
  czujności CR 702.20b) i `Seer's Lantern` 1× („dodanie many do puli"; zdolność scry
  tej samej karty 5× — świadomy wybór, nie remis).

### Znane granice (świadome, nie bugi)

1. **`tap_for_mana`** (ręczne tapnięcie landu) ma w gałęzi bota starą,
   liczbocentryczną wycenę (`hasPlayable ? 80 : 1`) — silnik NIE enumeruje tej
   komendy jako decyzji (game-state: „tap_for_mana NIE jest już osobno
   enumerowany"; zostaje dla replayów i kreatora stołu), więc zmiana byłaby
   niezmierzalna (zakaz kodu „na sucho"). Zostaje jak jest.
2. **Koszt okazji drugiego trybu** źródła (Seer's Lantern `{2},{T}: Scry 1`,
   Balamb Garden, Immersturm Skullcairn): tap zamyka drugie okno tej samej
   karty. Nie modelujemy — brak dowodu z partii, że bot wybiera źle
   (w pomiarze C3 wybrał zdolność z riderem życia, nie scry).
3. **`F2` na skali CZARU, nie many:** „Skarb odblokowuje kartę, której bot
   nie chce" rozstrzyga wspólna `castScoreForUnlock` (L41) — jeśli wycena
   czaru uznaje 1/2 za wartą rzutu, to decyzja o rzucie należy do tamtej skali
   (rodzina `create_token`/ciała). Pętla many nie wprowadza drugiego, własnego
   kryterium „chcenia".
4. **Wartość many „na przyszłą turę"** (bankowanie Skarba) — bot nie planuje
   portfela na następną turę; kara M243/C zostaje jako świadome uproszczenie.
5. **tie-audit „bez danych"** (`cast_spell` 1, `activate_ability` 2): remisy,
   w których brakuje danych porównawczych (np. dwie identyczne oferty) —
   audyt nie rozstrzyga, czy to duplikat oferty, czy nierozróżnialność wyceny.

### Pomiar końcowy (PRZED → PO, sonda `scratch/pmssb32-mana-przed.mjs`)

| Scenariusz | PRZED | PO |
|---|---|---|
| A3 Wizard, mana redundantna | **+10 = WYBÓR** | −4, pass |
| A4 cudza tura + instant w ręce | −30 (rzut 11 i tak wybrany) | −6 (rzut 11, reguła E6/A1 żyje) |
| C2 Latarnia, rzut oferowany | **+6** | −4 (oferta = płatność) |
| D2 Powerstone + stwór | **+6 = WYBÓR** | −4, pass |
| D3 Powerstone + pula ograniczona | **+6 = WYBÓR** | −4, pass |
| E3 Skarb + Las + Shock (potrzeba `{R}`) | **−10, pass** | **+6 = WYBÓR** (aktywacja to jedyna droga) |
| F1/F2 Villager main1 vs main2 | 6,0 = 6,0 | **−6** vs **−4** |
| F4 Relikt: ściana vs 4/4 | 3 = 3 | **3** vs **−5** |
| Reszta (A1, A2, A5, B1–B4, C1, C3, C4, D1, E1, E2, E4, F3, F5) | — | bez zmian |

**Status:** rodzina ZAMKNIĘTA (ponowny audyt tylko z nowym dowodem). Kolejka
następnej pętli: remisy wyboru celu/ataku z tie-audytu (PMSSB-33), koszt okazji
drugiego trybu źródła, bankowanie many oraz **`manaAvailableNow`** — jego
komentarz mówi „auto-produkcja tylko lądy", tymczasem silnik od M179/D i M201
auto-tapuje przy płatności także źródła WOLNE (`{T}`: Latarnia, Wilkołak)
i KOSZTOWE (`{1},{T}`: Cylix, Wizard), więc „przed" w tym pomocniku jest
zaniżone wobec oferty; w rodzinie many łagodzi to bramka „oferta = płatność"
(oferta istnieje ⇒ premia nie należy się), ale poza nią pomocnik żyje jeszcze
w `suspend_card` — kandydat na osobną pętlę, bez zmian „na sucho".

## PMSSB-33 — triage remisów wyboru: znane równości, nie ślepoty (2026-10-01d, mikro-pętla)

Wejście: tie-audit PO pętli PMSSB-32 (`--gry=2`, 24 partie / 12 785 decyzji):
634 remisy (27,0%), w tym 450 par „brak akcji" silnika, 184 realnych (9,7%),
oraz **16 „GROZY"** — remisy przy RÓŻNYCH danych wejściowych decyzji
(attack 9, block 2, activate_ability 2, cast_spell 1, resolve_color_choice 1,
resolve_discard_choice 1). Pytanie mikro-pętli: czy którakolwiek z nich to
ślepota wyceny (defekt), czy zamienna wartość wariantów.

**Metoda:** tie-audit `--json` drukuje PROJEKCJĘ danych, które wycena czyta
(dla ataku `{atakuje, trafienie, ginie, zabici, smiertelny}`); dla każdej klasy
sprawdziliśmy, czy różnica wejść jest CZYTANA i WYCENIONA (równość wartości),
czy pominięta (ślepota).

| Klasa | Wzorzec z audytu | Rozstrzygnięcie |
|---|---|---|
| attack (9) | „+1 trafienie i +1 ginie" oraz remisy 0/0 i 1030 (lethal) | wycena atakującego to suma per-stwór, a wymiana (`power ≥ wytrz.` blokera, stwór ginie) = **`power − 1`**; przy power 1 daje to dokładnie 0 ⇒ remis z pasem. Granica świadomej formuły („bez tego bot nigdy nie atakuje w równą planszę"), nie pominięte wejście: przy power 2 → +1, 3/3 w 1/1 → +6. Remisy 0/0 = atak bez zysku, 1030 = przebicie już wygrywającej decyzji |
| block (2) | permutacje przypisania blokerów | identyczny wynik (oba ataki zablokowane, te same zgony) — przypisania są ZAMIENNE; przy różnych ciałach wycena rozróżnia (4 > 2) |
| cast_spell / activate_ability / color / discard (5) | wybór celu o równej wartości (dwa identyczne tokeny, dwa równie dobre źródła) | równość uczciwa; brak dowodu złej decyzji ⇒ bez zmiany kodu |

**Werdykt: 0 zmian kodu.** Piny `test/audyt-pmssb33-remisy-wyboru.test.js` (7)
zamrażają triage, żeby następna pętla nie odkrywała go od nowa: A1 (1/1 za 1/1
= 0 = brak ataku), A2 (2/2 → 1, anty-remis), A3 (3/3 w 1/1 → 6), A4 (dwa 1/1 =
suma zer), A5 (otwarty stół → 12, anty-over-fix: remis ≠ bierność), B1 (permutacja
bloków = 2 = 2), B2 (przy różnych ciałach 4 > 2). Mutacje: `power − 1 → power`
czerwieni A1/A2/A4, `attackOpenBoardBonus: 0` czerwieni A5.

**Wniosek proceduralny:** per-kind bramka `tools/bot-tie-audit.mjs --gate=<kind>`
(exit 1 przy każdym remisie „przy różnych danych") jest narzędziem POLOWANIA,
nie bramką CI — na zamrożonym drzewie `--gate=attack` i `--gate=block` są
czerwone z definicji tych równości. Do CI służą liczby globalne (27,0% / 9,7%)
i piny.

## PMSSB-34 — koszt many aktywacji + treść sprzętu (`activate_ability`) (2026-10-01e)

Wejście: **nowy dowód z tabeli własnej PMSSB-33**. Wiersz `activate_ability`
(2 remisy „GROZY") został tam rozstrzygnięty hasłem „dwa równie dobre źródła",
ale bez obowiązkowej kontroli procedury (b) — a projekcja tych remisów pokazuje
RÓŻNE KOSZTY przy identycznym wyniku: `mana` **3, 4 i 1** przy 16 (seed 4012
t16) oraz **3 vs 4** przy 22 (t20). To nie „dwa równie dobre źródła" — to ten
sam efekt za 3× i 1× manę. Rodzina: zdolności aktywowane, wymiar KOSZTU MANY
+ treść sprzętu; inwentarz: 148 kart z aktywowanymi (111 z kosztem many > 0,
z tego 108 poza czystym `add_mana`), 12 sprzętów w katalogu.

**Pierwiastki (kod):** (1) gałąź PIERWSZEGO założenia sprzętu liczyła
`10 + 2×moc nosiciela` i nie czytała własnej pompy sprzętu (L41: gałąź
przeniesienia liczyła ją przez `equipValuation`, pierwsze założenie nie) —
`+1/+0` za `{1}` = `+2/+2` trample za `{4}`; (2) koszt many aktywacji nie był
wyceniany w żadnej gałęzi poza `add_mana` (tam policzony w `net`) — `{1}` = `{3}`
= `{4}`.

**Pomiar PRZED → PO** (sonda `/home/user/scratch/pmssb34-koszt-przed.mjs`,
PRZED = oba nowe pokrętła 0, bo całą zmianę wnosi ten jeden wymiar):

| Scenariusz | PRZED (8ee8eec) | PO |
|---|---|---|
| A. Lightblade `{3}` +1/+0 / Plate `{4}` +2/+2 trample / Stake `{1}` +1/+0 na 3/3 | **18 / 18 / 18 — REMIS**, wybór po kolejności ofert | **20 Plate > 19 Stake > 17 Lightblade**, Plate WYBRANY |
| B. ten sam pump +1/+0: `{3}` vs `{1}` | 18 = 18 | **19 > 17** |
| C. 2 lądy — bramka płatności silnika | tylko Stake `{1}`, 18 | tylko Stake `{1}`, 19 |
| D. Apprentice Wizard (`add_mana`, koszt w `net`) | −4 | **−4** (bez podwójnej kary) |

**Fale:** A — `equipValuation` zwraca też `printedBody` (2×P+T), a pierwsze
założenie dodaje `equipPumpBonusPerPoint × printedBody` (jedno źródło ciała dla
obu gałęzi; gałąź „nosiciel nie może atakować" bez zmian — wartościuje obronnie);
B — `score -= abilityManaCostPenalty × (cost.mana + cost.generic)`, wyjątek
`add_mana` (koszt w `net`). Kara stoi ZA wczesnymi guardami (idempotencja,
`wastefulStep`, „efekt jałowy" −40, duplikat na stosie) — guardy zachowują swoje
płaskie kary, nowy wymiar nie dubluje ich wymowy. Gałąź ninjutsu (z ręki, zwraca
nieblokowanego atakującego) ma własny model — poza zakresem.

**Dowód — 17 pinów audytów przesuniętych DOKŁADNIE o koszt many** (bez innych
ruchów; zweryfikowane po deskryptorach kosztu karty, nie po wartościach):
Relic Dragon `{8}`: 63 → 55; Vanguard `{4}{W}`: 20 → 15; Mutagen `{1}`:
14 → 13; Kheru Dreadmaw `{2}`: −16 → −18 / 3 → 1; Dawntreader Elk `{1}`:
12 → 11; Trigon `{2}`: 34 → 32, 20.5 → 18.5 (kotwice B4: 16 → 14, 34 → 32);
Leonin Surveyor `{3}`: próg 6 → 5 (wybór dalej `activate_ability`); Dockhand
`{4}`: 6.50/6.00/6.00/−38 → 2.50/2.00/2.00/−42; Scroll of Avacyn `{1}`:
7/7/10/14 → 6/6/9/13; Mournful Zombie `{1}`: 3 → 2, −29 → −30, 5 → 4;
Dementia Bat `{5}`: −1 → −6 (guard „pusta ręka" −40 zostaje — wcześniejszy
return); Immersturm Skullcairn `{4}`: −54 → −58, −58 → −62; Gloomfang cycle
`{2}`: 4 → 2 (równość „loot ≡ cycle" rozstrzygnięta kosztem: scholar tap-only
4 > cycle 2); T11/1: 7 → 6, T11/6: 8 → 7 (equip `{1}`); F2b: −16 → −18, 3 → 1.

**Piny:** `test/audyt-pmssb34-koszt-aktywacji.test.js` (9): A1 treść sprzętu
(20 > 19 > 17, wybór Plate), A2 kontrola (b) (`{1}` 19 > `{3}` 17, wybór Stake),
A3 kotwica PRZED (oba pokrętła 0 → 18/18/18 i wybór po kolejności ofert),
B1 mutacja kosztu (`abilityManaCostPenalty: 0` → 20 = 20 — pin A2 czerwienieje),
B2 mutacja treści (`equipPumpBonusPerPoint: 0` → 14 < 17 — pin A1 czerwienieje),
C bramka płatności (2 many → tylko Stake), D `add_mana` −4 z karą i bez,
E skala poza sprzętem (Mutagen: 26 → 25, Δ = `{1}`), F koszt 0/sam `{T}`
(scholar 4 z karą i bez). Mutacje potwierdzone na źródle: `abilityManaCostPenalty
→ 0` czerwieni A1/A2/C/E, `equipPumpBonusPerPoint → 0` czerwieni A1/A2/C, po
przywróceniu 9/9 GREEN.

**Bramki:** `npm test` **7286/7286** (7277 + 9 pinów) · build **70 mod / 4700,9 kB**
· `npm run test:all` **7557/7557** · golden-master **po świadomej regeneracji**
(hash `8fa96e93…` → `ab8d57d2…`; przesunięcia scoreSum −4/−6/0/−2/−2/−9 i jedna
decyzja mniej 241 → 240; **dowód czystości wymiaru**: z oboma pokrętłami = 0
snapshot odtwarza STARY fixture bit w bit, hash identyczny). Tie-audit PO
(`--gry=2`, 24 partie / 12 448 decyzji): 623 remisy (27,2%) = 438 par „brak
akcji" + 185 realnych (10,0%); **GROZY 15 — `activate_ability` 0** (było 2:
właśnie te kosztowe 3/4/1 @16 i 3/4 @22, w sondzie oba okna zniknęły);
block 2 → 3 (nowe pozycje partii), attack 9, cast_spell 1, discard 1, color 1.
Mirror-eval (kandydat vs oba pokrętła 0): **45:51 na 96 partii (0,469)** —
w granicach szumu. Żywy Tester PO: **3/3 sesje czyste** (dominaria-brg|ravnica
seed 42; worek-legend|theros seed 5 `explorer`; warhammer-ubr|tarkir-bg seed 11
`impatient`): 0 `[STOP]`, 0 `LIMIT`, 3 naturalne końce, **0 zgłoszeń detektorów**,
0 decyzji niewycenionych.

**Znane granice (świadome, nie bugi):** (1) aktywacje o wyniku netto 0 remisują
z passem (np. `{1}`-owa zdolność o wartości 1) — remis rozstrzyga kolejność
ofert, czyli bot aktywuje tak jak PRZED zmianą (gdy wynik był dodatni); dowodu
złej decyzji brak, więc bez tie-breakera; (2) model liniowy — brak progu „od
kiedy +1 siły zmienia zegar"; (3) `cast_spell` warianty (tryb/kicker) nadal bez
osobnej kary za koszt wariantu; (4) gałąź ninjutsu poza wymiarem.

**Status:** rodzina ZAMKNIĘTA. Kolejna pętla wg kolejki PMSSB-32/33:
`manaAvailableNow` poza rodziną many („koszt okazji” w `suspend_card`), koszt
drugiego trybu źródła, bankowanie many — każda z nowym dowodem.

## PMSSB-35 — odroczenie zagrania: `plot_card` / `suspend_card` / `warp_card` + rzut karty czekającej z wygnania (2026-10-01f)

Wejście: **kolejka handoffu 01e** (pozycja „stary model dostępności many —
`manaAvailableNow` w `suspend_card`”). Rekonesans pokazał, że to nie jeden
przestarzały warunek, a **cała rodzina odroczeń**: trzy akcje specjalne
(zaplotowanie, zawieszenie, rzut za koszt warp) plus **wypłata odroczenia** —
rzut karty czekającej w wygnaniu, czyli osobna ścieżka `cast_permanent` /
`cast_spell` z exile. Nośniki: **5 kart katalogu, wszystkie w taliach
wzorcowych** (ADR 0029 — audyt na istniejących kartach): `mindstab`
(suspend {1}, 4 liczniki; dominaria-brg) · `tumbleweed-rising` i
`spinewoods-paladin` (plot; worek-dziki) · `sheriff-of-safe-passage` (plot;
srodziemie) · `weftblade-enhancer` (warp {2}{W}; worek-legend).

**Pierwiastki (kod):** (1) `case 'cast_permanent'` czytał kartę **wyłącznie
z ręki** (`handCard`) → rzut zaplotowanej / czekającej po warp / z okna impulsu
karty dostawał puste 0/0 i wynik `P.creatureBase × waga permanentu` = **63,000
niezależnie od ciała i kosztu**: pomiar `/home/user/scratch/pmssb35-exile-rzut-arytmetyka.mjs`
— Sheriff 0/0, Hill Giant 3/3, Paladin 5/4, Weftblade 3/4 = 63,000; Hill Giant
z P/T 20/20 = dalej 63,000; a ten sam Sheriff rzucany z RĘKI = 59,396. Dodatkowo
koszt many odejmował się także wtedy, gdy rzut był BEZ kosztu (CR 702.170d plot /
CR 701.18 + stempel `playableWithoutPaying`). (2) Trzy akcje odroczenia były
płaskie i bez ceny: `plot_card` = 55 + token/mill, `warp_card` = ciało − 15 + 5
ETB (identyczne **70,000 przy 4 i przy 6 polach**), `suspend_card` = 30/8 wg
legacy `manaAvailableNow` (pula + nietapnięte LĄDY) — S3: 5 lądów + Seer’s
Lantern, silnik MA ofertę rzutu, a bot dawał 30 „nie stać mnie”.

**Pomiar PRZED → PO** (sonda `/home/user/scratch/pmssb35-odroczenie-przed.mjs`,
S1–S15; PRZED = HEAD `c01c293`, PO = ten sam plik na drzewie po zmianach):

| Scenariusz | PRZED | PO |
|---|---|---|
| S1 Mindstab t4, 5 lądów — rzut nieosiągalny | suspend 30,000 | **24,000** (30 − koszt 2 − 4 liczniki) |
| S2 ten sam czar, 6 lądów — rzut osiągalny | 8,000 | **2,000** |
| S3 + Seer’s Lantern (`manaAvailableNow` = 5, oferta rzutu JEST) | 30,000 „nie stać mnie” | **2,000** (dostępność z oferty silnika) |
| S4 t2, 2 lądy (najwcześniejsze okno) | 30,000 | 24,000 |
| S5 t14, 14 lądów | 8,000 | **2,000** |
| S6 Tumbleweed Rising: rzut {1}{G} **dostępny**, plot {3}{G} | plot **55,000 > rzut 49,980** (bot płacił 4 many i czekał turę) | rzut 49,980 > plot **16,000** → **wybiera rzut** |
| S8 Sheriff: plot {1}{W} tańszy od rzutu {2}{W} | rzut 59,396 > plot 55,000 | rzut 59,396 > plot **47,000** |
| S11/S12 Weftblade: warp {2}{W} vs rzut {5}{W} | 70,000 vs 65,703 | **66,000** vs 65,703 |

**Fale:** A — `cast_permanent` czyta kartę z ręki **albo z dowolnej strefy**
(`handCard ?? zoneCard`, wzorzec `cast_spell`), a koszt many odejmuje tylko, gdy
rzut naprawdę go płaci — decyduje **reguła silnika** `castsWithoutPayingMana`
(plot CR 702.170d; darmowy impuls CR 701.18 + stempel `playableWithoutPaying`);
ten sam warunek w `reservedManaOf` (podatek ward nie rezerwuje many, której rzut
nie płaci). B — cena odroczenia w jednostce kosztu karty
(`creatureManaCostWeight × (koszt + pipy)`): `plot_card` (+ surcharge
`plotRedundantPenalty`, gdy rzut jest już w ofertach, a plot nie oszczędza many;
+ `plotDelayPenalty` zwłoki), `warp_card`, `suspend_card` (dostępność z OFERTY
silnika + `suspendWaitPenalty × liczniki czasu`, CR 702.62c). Treść zawieszonego
czaru **nie** wchodzi do inwestycji — jest wyceniana w momencie wypłaty
(`resolve_suspend_cast`, ta sama tabela +15/+5), a premia w inwestycji byłaby
over-fixem (kontrola (c)); decyzja opisana w planie §6.

**Znalezisko silnika (naprawione u źródła, znalezione sondą wypłaty):**
`/home/user/scratch/pmssb35-wyplata.mjs` pokazała w partii
`worek-legend|dominaria-brg` s1000 **dwa rzuty tej samej karty z wygnania**
(t12 i t14) — po tym, jak Faceless Butcher wygnał ją ponownie. Pieczęć rzutu
z wygnania (`plotted`/`plottedAtTurn`, `warpReady`/`warpedAtTurn`, para okna
impulsu) **przeżywała zmianę strefy**, więc ponowne wygnanie innym efektem
wracało do ofert rzutu z wygnania. CR 400.7 („new object with no memory”) +
CR 702.185b („warped card in exile” = karta wygnana triggerem warp) + glosariusz
„Plotted”. Naprawa: choke point stref (`moveObjectDirectly`) zdejmuje pieczęcie
wygnania przy wyjściu z tej strefy, a para pól okna impulsu przez helper
właściciela (`clearImpulseWindowStamp` w `impulse-window.js`; guard
`test/family-audit.test.js` 8/8). Dowód: `pmssb35-wyciek-stempli.mjs`
(PRZED: po ponownym wygnaniu oferty `[cast_permanent]` dla plot i warp; PO: `[]`),
piny F1–F3, golden-master **bez zmian** (żaden z 6 meczów snapshotu nie trafia
w wyciek).

**Piny:** `test/audyt-pmssb35-odroczenie.test.js` (**18**): A1 ciało z wygnania
(63,000 → 62,996/71,104/77,407), A2 darmowy = płatny + koszt karty (Δ 3,6), A3
reguła KLASOWA (stempel CR 701.18 ≡ plot), A4 płatny rzut z wygnania ≡ z ręki
(65,703); B1 suspend z rzutem nieosiągalnym 24, B2 z latarnią 2 i **rzut bije
odroczenie**, B3 wymiar zwłoki osobno (0/2 pkty za licznik), B4 wymiar kosztu
osobno, B5 faza gry (t14: 2, nie 24); C1 **dowód S6: rzut tańszy wygrywa
z plotem**, C2 anty-over-fix (bez oferty rzutu plot 50 = baza − koszt), C3 koszt
plotu ({1}{W} 52 vs {3}{G} 51 — kontrola (b)), C4 zwłoka i surcharge osobno;
D1 koszt warpu (66 przy 4 i 6 polach, rzut stały w zasięgu); E1 zwolnienie
z kosztu to BRAK kary, nie premia; F1–F3 pieczęć wygnania nie przeżywa wyjścia
z tej strefy (warp / plot / okno impulsu). **Mutacje na źródle:** `plotRedundantPenalty → 0`
⇒ {C1}; `plotDelayPenalty → 0` ⇒ {C1, C4}; `suspendWaitPenalty → 0` ⇒ {B1, B2, B4};
„zawsze odejmuj koszt” ⇒ {A1, A2}; „tylko ręka” (PRZED) ⇒ {A1, A2, A4, E1}; po
przywróceniu 18/18 GREEN.

**Dowód w partiach** (sonda `pmssb35-gry.mjs`: 4 pary talii z nośnikami × 6
seedów, bot heurystyczny vs RandomBot): PRZED 24 decyzje z ofertą rodziny /
**6 plotów** → PO 28 decyzji / **1 plot**; cztery zamiany to dokładnie wzorzec
z S6 (plot 95,00 przy rzucie 89,98 → rzut tą samą kartą). Sonda wypłaty
(24 partie): PRZED 10 odroczeń / 9 rzutów z wygnania / **2 karty czekające**
w wygnaniu na koniec partii → PO **5 / 5 / 0** (drugi „nadmiarowy” rzut PRZED
był właśnie skutkiem wycieku pieczęci — po naprawie liczba wypłat równa się
liczbie odroczeń).

**Bramy:** `npm test` **7304/7304** (7286 po PMSSB-34 + 18 pinów) · build
**70 modułów / 4708,3 kB** · `npm run test:all` **7575/7575** · benchmark 10/10 ·
golden-master po świadomej regeneracji (hash `ab8d57d2…` → `4024bcd1…`; 1 z 6
meczów, `scoreSum` −6,0 = suspend 8→2, decyzje 240 → 240, `chosenKinds`
identyczne ⇒ 0 flipów; **dowód czystości wymiaru**: po zerowaniu trzech pokręteł
odroczenia snapshot wraca do wartości bazy) · strażnicy CR: istnienie numerów
(dopisany `702.185b` z dosłownym tekstem w uzasadnieniu — brak egressu w
sandboxie), 701 3/3 · tie-audit PO: 24 partie / 12 448 decyzji / 623 remisy
(438 + 185 realnych = 10,0%), rodzina bez „GROZY” · mirror-eval (A = nowe
domyślne, B = trzy pokrętła 0): **96 partii 48:48 (0,500)** · Żywy Tester:
6 sesji na finalnym buildzie (3 z nich na tymczasowej talii rodziny — plot,
warp i zawieszenie klikane przez UI, oferta „Zagraj z wygnania (Plot) — bez
kosztu many” renderowana w panelu; talia usunięta po biegu), 0 `[STOP]`,
0 zgłoszeń detektorów, 0 decyzji niewycenionych.

**Znane granice (świadome, nie bugi):** (1) model nie zna zegara gry — zwłoka
jest liczona z liczników czasu (suspend) i stałej dopłaty (plot), nie
z przewidywanej długości partii; (2) podwójny ETB z warpu (rzut za koszt warp
+ późniejszy rzut z wygnania) nadal bez osobnego wymiaru — cena kosztu warp jest
pierwszym krokiem; (3) `plot_card` dla kart BEZ oferty rzutu zostaje płaską bazą
55 + bonusy (pełny model „co czeka na późniejszą planszę” to kandydat na kolejną
pętlę); (4) gałąź `warp_card` jest w rodzinie `spell` (×1), a rzut z ręki
w `permanent` (×0,9) — różnica WAGI rodziny (pre-existing), nie arytmetyki;
(5) treść zawieszonego czaru jest wyceniana dopiero w wypłacie (świadome,
uzasadnione w planie §6).

**Status:** rodzina ZAMKNIĘTA. Kolejka następnej pętli: koszt okazji drugiego
trybu źródła (`Seer’s Lantern {2},{T}: Scry 1`, Immersturm Skullcairn, Balamb
Garden), bankowanie many, `cast_spell` warianty (tryb/kicker), model treści
czekającej na późniejszą planszę — każda z nowym dowodem.

## PMSSB-36 — mechaniki kart batcha 62: exploit z zasobami, cel własny ETB, wypłata liczników (2026-10-02b)

Wejście: **zgłoszenie właściciela** — „czy exploit Vulturous Aven jest robiony z
głową (poświęcać tylko gdy dość stworów, najmniejszego bez zdolności)? czy
przeszedł PMSSB? sprawdź WSZYSTKIE mechaniki nowych kart”. Plan:
`docs/plans/PLAN_2026-10-02b-pmssb36-nowe-karty.md` (tabela przeglądu 10 kart).
Odpowiedź: PMSSB-11 (exploit, 2026-09-26) powstał dla 3 kart BEZ triggera
zasobowego; Aven (draw 2 + lose 2) go nie przeszedł.

**Pomiar PRZED** (sonda na realnym bocie, `resolve_exploit_choice`; wynik = oferta
poświęcenia vs skip 20): życie 20 → 35 (sac); **życie 2 → sac (samobójstwo)**; życie 3–5 → sac;
**biblioteka 2–5 kart → sac (deck-out)**; jedyny silny stwór (Silumgar 23 > 20) → sac;
jedyny obrońca vs 3 wrogów → sac; rzut karty liczył „impuls x=4” (trigger Drownera) dla
KAŻDEGO exploitu bez debuffu. Przyczyna: decyzja = stała `exploitBase` 40 − cena ofiary
(ślepa na zysk/koszt triggera) + bramki tylko dla millu i debuffu.

**Naprawy (generyczne, ADR 0002):**
- **A — exploit netto:** `exploitSelfResourceGain` (dobranie = `drawCardValue × n` + drabina
  `drawDeckingPenalty`; utrata życia = wspólna `selfLifeLossPenalty`, te same progi co `cast_spell`
  i ETB — L48, 1000 = samobójstwo). Poświęcenie gdy `zysk − cena − cienka plansza − margines > 0`;
  ofiara = najniższa `cena` (P/T + keywordy + zdolności − token). Rzut = ta sama miara (L41a).
  Debuff/mill bez zmian (anty-over-fix). PO: życie ≤5 i biblioteka ≤5 → skip; 3/3 bez zdolności → skip;
  token < karta; lone 1/3 vs 3 wrogów → skip.
- **B — cel własny ETB:** bramka `etbEnemyHasTarget` pytała o wrogów także dla „put a counter on target
  creature (you control)” — Jade Bearer 63,901 z Merfolkiem i bez; z wrogiem +5,4 bez celu. Teraz
  `etbFriendlyCounterTargetAvailable` (`notSelf`/`subtype` z deskryptora); Moogle/Weftblade (cel dowolny,
  także własny) liczą 6 niezależnie od wroga (pin PMSSB-35/A4: 65,703 → 71,103).
- **C — wypłata liczników na polu:** `boardCastPayoffValue` — „you cast instant/sorcery” (Opus, gałęzie
  `manaSpentBelow/AtLeast` od many rzutu) i „another artifact enters” (`payMana`, tylko gdy po koszcie
  zostaje mana) × `boardPayoffWeight` 0,5, miara `counterHostValue` (L41). PRZED Shock przy Artyście
  84 → 72 (kara dominacji planszy, zero za licznik); PO 86.

**Przegląd reszty (OK, bez zmian):** Chocobo Kick (bez kicka gdy 1× zabija, z kickiem gdy tylko 2×),
Mnemonic Wall (regrowth wartościowany, cel zagrywalny kolorem), Gauntlets (wybór celu z przypiętymi),
Fiery Justice (`damageDivision`), Maverick (pump POKRYTE), Vestige (`8653c9d`).

**Granice / forward:** (1) bite bez zabicia ma dodatnią „chip” (kotwica PMSSB-16: Kick na 9-toughness
dostaje 64 > pass) — kandydat na osobną decyzję; (2) wypłata payoffów innych niż licznik (dobranie,
token) przy rzucie z payoffem na polu; (3) Pangolin: bot płaci {1} ZAWSZE (PMSSB-12), nie waży mana
potrzebnej na inny rzut tej tury.

**Pomiar końcowy:** `run-tests all` 7668/7668; golden-master: jedna zmiana, score-only (oferta
exploit −5 vs 14, wybór ten sam — 0 flipów), fixture przegenerowany.

## PMSSB-37 — trzy granice po PMSSB-36: bite bez zabicia, payoffy ≠ licznik, zapłata opcjonalna (2026-10-02c)

Wejście: polecenie właściciela „zajmij się tymi trzema wykrytymi sytuacjami”. Plan:
`docs/plans/PLAN_2026-10-02c-pmssb37-trzy-granice.md`.

**Pomiar PRZED:** Chocobo Kick na cel o wytrzymałości 9 = 64 (> pass 0) mimo braku zabicia;
Shock/artefakt przy Tellah Great Sage na polu = ten sam wynik co bez payoffu (waga 0);
Pangolin płacił {1} zawsze (75 vs 15), także gdy ręka miała karty za 2 przy 2 otwartych many.

**Naprawy (generyczne, ADR 0002; ta sama miara co reszta, L41/L41a):**
- **A — bite bez zabicia:** `fightExchangeValue` (gałąź jednostronna) odejmuje `fightBiteMissPenalty`
  80, gdy cios nie zabija i nie ma okna walki (`combatTrickWindow`) — lustro `damageTargetValue`
  (−80). PO: Kick na 9 → −16 (pass); Assert Perfection na 9 → pass; Knockout Maneuver na 9 → nadal
  zagrany (licznik na własnym stworze liczony osobno). Pokrętło 0 przywraca dawną „chip”.
- **B — payoffy inne niż licznik:** `boardCastPayoffValue` liczy nogi z `ETB_EFFECT_BONUS`
  (dobranie, token, drain, scry, zysk życia), warunki many, poświęcenie nosiciela jako koszt (Tellah
  ≥ 8 many) i zdarzenia `you_cast_noncreature_spell` (czar oraz nie-stworzenie jako permanent) i
  „enchantment enters”. PO: Tellah + Shock +5, + artefakt +4,5 (waga 0,5), stwór bez zmian.
- **C — zapłata opcjonalna (Pangolin):** `payBlocksBetterCast` — nie płać {N}, gdy karta z ręki
  mieści się w otwartej manie, ale nie po zapłacie, a jej wynik ≥ `optionalPayBlockedCastMin` (40)
  i zysk triggera < `optionalPayCastScoreWeight` (0,5) × wynik. Ta sama bramka w antycypacji
  (`boardCastPayoffValue`), z reentrancy guard `payoffProbeDepth` (wycena zablokowanego rzutu woła
  `scoreCommand`). PO: pusta ręka → płaci, karta za 2 → nie płaci, karta za 1 → płaci.

**Granice (świadomie):** kolory kandydata zablokowanego nie są sprawdzane (jak `manaUnlockCandidates`),
tylko pojedyncza karta bez kombinacji; payoffy „drugi czar w turze” (brak licznika w widoku bota) i
incubate Tillera bez wyceny; Knockout Maneuver bez zabicia zostaje dodatni dzięki licznikowi.

**Pomiar końcowy:** golden-master 6 partii — hash bez zmian (0 różnic); `run-tests all` **7680/7680**; build bez zmian w liczbie modułów.

## PMSSB-38 — licznik czarów w widoku bota i wycena incubate (2026-10-02d)

Wejście: pytanie właściciela po PMSSB-37 — „czemu bot nie widzi licznika czarów? może powinien;
czemu nie wyceniasz incubate?”. Plan: `docs/plans/PLAN_2026-10-02d-pmssb38-licznik-spelli-incubate.md`.
Odpowiedź: obie rzeczy to były luki, nie decyzje projektowe.

- **Licznik czarów:** silnik ma `spellsCastThisTurnByPlayer` i czyta go w triggerze „your second spell
  each turn”, ale `playerView` go nie wystawiał (luka kontraktu widoku, ADR 0017). Dodane
  `playerView.spellsCastThisTurn` (własny licznik; informacja jawna). `boardCastPayoffValue` liczy
  `you_cast_second_spell_each_turn`, gdy `spellsCastThisTurn === 1` (rzut jest drugim). PO: Illvoi
  Operative + Shock 84 → 92 jako drugi czar; pierwszy i trzeci bez zmian.
- **Incubate:** brak wyceny w `ETB_EFFECT_BONUS`, w pętli efektów czaru i w payoffach. Teraz
  `incubateValue` = `10·N − 2·creatureManaCostWeight` (ciało N/N jak token, minus koszt przemiany {2}).
  PO: Merciless Repurposing 92 → 120; Tiller of Flesh — czar z celem-permanentem +9 (gracz jako cel: 0;
  własny rzut Tillera: 0).
- **Granica (domknięta w PMSSB-39):** trigger z efektem TYMCZASOWYM (Jeskai Devotee: pump do końca tury; prowess) nie miał
  wyceny — wymaga prognozy walki, nie miary wartości trwałej. Jolrael („drugie dobranie”) ma inny licznik.

**Pomiar końcowy:** golden-master 6 partii — hash bez zmian; `run-tests all` **7686/7686**.

## PMSSB-39 — payoffy z efektem tymczasowym przy rzucie (2026-10-02e)

Wejście: „tak, chcę” po zapowiedzi z PMSSB-38 (granica: triggery z efektem do końca tury).
Plan: `docs/plans/PLAN_2026-10-02e-pmssb39-pump-triggery.md`.

**Model (reuse istniejących miar, L41/L48):** `temporaryPumpPayoff` w `boardCastPayoffValue`.
- Walka zadeklarowana, nosiciel w niej walczy: `pumpChangesOutcome` (symulacja CR 510 jak przy pumpie
  z czaru) → `tempPumpTrickValue` 18 + moc, inaczej 0 (Windscout 2/1 vs blokujący 1/1: +10; vs 2/2
  — obie strony giną tak samo → 0).
- Własna główna 1, nosiciel zdolny do ataku i polityka ataku bota (`attackIntendsCreature`) go wybiera
  — albo wybierze dopiero po pumpie („pump odblokowuje atak”): bez możliwego blokera = twarz
  (`tempPumpFaceDamageValue` 4/pkt mocy; prowess +1 → +2 po wadze 0,5), z blokerem
  `tempPumpBlockOdds` 0,5 dzieli wartość między trik a twarz. Latający nosiciel ignoruje blokerów bez
  latania/zasięgu.
- Reszta okien (druga główna, nosiciel z chorobą przyzwania): 0.
- Warunki triggera rzutu z karty: `spellManaValueAtLeast` (Kulrath Mystic: hill-giant MV4 przy bloku 3/3
  → +6, Shock MV1 → 0), kolor, bezbarwność; `when_you_cast_spell` obsłużone. Devotee: drugi czar +2,
  pierwszy/trzeci 0.

**Granice:** dynamiczne X, efekty skierowane, `buff_attacking_creatures` i vigilance Kulratha bez
wyceny; blokada wroga to jedno pokrętło szansy, nie prognoza.

**Pomiar końcowy:** golden-master 6 partii — hash bez zmian; `run-tests all` **7696/7696** (po aktualizacji pinu B2 z PMSSB-38).

## PMSSB-40 — payoffy rzutu II: efekty skierowane (`requiresTarget`) i wymiar nietapnięcia (2026-10-03a)

Wejście: **granice z PMSSB-39** („dynamiczne X, efekty skierowane, `buff_attacking_creatures`
i vigilance Kulratha bez wyceny") + inwentarz kart katalogu (sonda `/tmp/pr/inwentarz-pmssb40.mjs`:
18 nóg triggerów rzutu/wejścia na 14 kartach; poza modelem zostały 3 nogi: `cant_block`, `damage`,
`untap_permanent`). Plan: `docs/plans/PLAN_2026-10-03a-pmssb40-skierowane-nietapniecie.md`.
Kontrola zasięgu przed kodem (sonda `/tmp/pr/inwentarz3.mjs`): w katalogu tylko **2 karty** mają
trigger rzutu z `requiresTarget` — `molten-nursery` (`damage`, `any_target`) i `goblin-battle-jester`
(`cant_block`, `creature`); żadna inna gałąź nie zmienia zachowania po zdjęciu bramki.

**Pomiar PRZED** (`/tmp/pr/probe-pmssb40-przed.mjs`, Δ = wynik oferty z payoffem − `boardPayoffWeight` 0):
S1 Molten Nursery + bezbarwny artefakt → **0** (dwie przyczyny: bramka `requiresTarget` pomijała CAŁY
trigger, a pętla szła po samych STWORACH — Molten Nursery jest enchantmentem); S2 Goblin Battle Jester
+ czerwony czar → **0**; S3 Kulrath Mystic + czar MV ≥ 4 → **7** (sam pump; rider `vigilance` bez
wyceny); S4 Steelfin Whale (tapnięty) + artefakt → **0**.

**Naprawy (generyczne, ADR 0002; reuse istniejących miar, L41/L48):**
- **Bramka `requiresTarget` nie pomija już triggera:** wymóg celu jedzie do miary (`req`), dokładnie jak
  w `etbEnterBonusValue`; brak legalnego celu = 0, nie kara. To była ŚLEPA PLAKA: payoff obu kart
  wynosił zero niezależnie od planszy.
- **F1 `damage`** (Molten Nursery): ta sama liczba co ETB-obrażenia (Forge Devil / Reclusive Artificer —
  identyczny kształt „trigger zadaje N obrażeń celowi"): `min(3·N, 15)` × waga. Pętla payoffu idzie po
  WSZYSTKICH moich permanentach, a nogi stworze (ciało, atak, liczniki, pump) są bramkowane `hostIsCreature`.
- **F2 `cant_block`** (Goblin Battle Jester): **miara ścieżki rzutu** `cantBlockRemovalValue` (M221/A +
  Batch60), okno „zadeklarowany atak ALBO przed atakiem w mojej głównej", best-of po blokerach wroga.
  Płaska `ETB_EFFECT_BONUS.cant_block = 2` była w katalogu MARTWA (żadna karta z tym typem nie ma
  triggera ETB/attacks/dies — L5), więc zostaje jako tabela, a realną wartość daje ta ścieżka.
- **F3 rider `vigilance`** (Kulrath): `temporaryPumpPayoff` dolicza `untappedBodyDefense` tylko gdy rider
  jest ŚWIEŻY (M431 — nosiciel go jeszcze nie ma) i tylko w oknie ATAKU; polityka ataku widzi symulowany
  widok z nadanym słowem i podbitymi statami, więc „pump + vigilance odblokowuje atak" jest policzone.
  W oknie walki rider = 0 (atakujący już tapnięty — CR 702.20 nie odkręca).
- **F4 `untap_permanent` nosiciela** (Steelfin Whale): wartość tylko gdy nosiciel jest TAPNIĘTY (inaczej
  no-op) i jest stworzem; cel cudzy (midnight-guard) poza listą zdarzeń payoffu.
- **Nowa wspólna miara `untappedBodyDefense`** = `payoffUntappedBodyWeight` × drabina tapnięcia CIAŁA
  z PMSSB-32 (w obronie liczy się wytrzymałość, sufit `manaTapBodyMax`) — jedno pokrętło dla ridera
  i untapu; **×0 odtwarza stan sprzed zmiany** (anty-over-fix M429).

**Wartości PO** (sonda + piny): S1 **1,35** (3 obrażenia × waga 0,5 × dyskont permanentu 0,9; rośnie
liniowo z wagą: 2,7 przy 1; 5,4 przy 2), S2 **2** (4 × 0,5 — miara `cantBlockRemovalValue`), S3 **11**
(pump 7 + rider 4), S4 **3,6** (sufit 8 × 0,5 × 0,9).

**Test:** `test/audyt-pmssb40-skierowane-nietapniecie.test.js` — **17 pinów** (11 czerwonych PRZED kodem,
6 kontrolnych: brak nosiciela, zły kolor czaru, brak blokerów, choroba przyzwania, rozdział pokręteł,
regresja Tackle Artist). **Mutacje 6/6 RED:** (a) bramka `requiresTarget` wraca → A1/A4/B1/B4; (b) brak
gałęzi `cant_block` → cały blok B; (c) rider vigilance = 0 → C1/C3; (d) brak gałęzi untapu → D1;
(e) brak gałęzi „skierowany spoza tabeli" → A1/A4; (f) pętla po samych stworach → A1/A4 (dowód drugiej
przyczyny S1). Pin PMSSB-39 A5 (Kulrath, trik) przesunięty o nowy wymiar: mierzy teraz sam trik przy
`payoffUntappedBodyWeight: 0`, a wartość z riderem pinuje C1 — zmiana ŚWIADOMA z uzasadnieniem (wzorzec
PMSSB-34 „piny przesunięte o nowy wymiar").

**Ewaluacja:** golden-master bota — **hash bez zmian** (rodzina nie występuje w taliach wzorcowych);
tie-audit PO: 24 partie / 12 556 decyzji, remisy 626/2329 z alternatywami = **26,9%** (438 par „brak
akcji" silnika + 188 realnych = **9,9%** decyzji akcyjnych), GROZY 13 (`attack` 7, `block` 3,
`cast_spell` 1, `resolve_discard_choice` 1, `resolve_color_choice` 1) — bez pogorszenia wobec
poprzednich pętli; mirror-eval (A = nowe domyślne, B = `payoffUntappedBodyWeight` ×0;
6 talii bench × 4 seedy × 2 strony = 48 meczów): **24:24 (0,5000)**, 0 niedokończonych — brak sygnału
w lustrze przy nieobecności kart rodziny w taliach wzorcowych (**wynik B6**, nie porażka: dowodem są
piny i mutacje); Żywy Tester = właściciel.

**Granice (świadome, nie bugi):** (1) `damage` z `requiresTarget: any_target` traktuje gracza jako
zawsze legalny cel, więc nie ma wymiaru „czy wróg ma co tracić" (dla `creature` jest — bramka celu);
(2) `cant_block` bierze best-of-blokerów, nie plan konkretnej decyzji ataku (jedno okno, jak Batch60);
(3) grant `vigilance` w oknie walki po deklaracji ataku nic nie daje (poprawnie CR 702.20) — model nie
przewiduje rzutu czaru PRZED deklaracją, żeby „odblokować" atakującego z vigilance; (4) dynamiczne X
i `buff_attacking_creatures` nadal bez wyceny; (5) `untap` cudzego permanentu (midnight-guard,
thistledown-players, nanoform-sentinel) poza listą zdarzeń payoffu — wymaga wymiaru „odkręć cudze".

**Bramy:** `npm test` **7449/7449** EXIT 0 · `node tools/run-tests.mjs all` ****7720/7720**** EXIT 0 · build **70 modułów / 4781,7 kB**.

**Status:** rodzina ZAMKNIĘTA. Kolejka następnej pętli: koszt okazji drugiego trybu źródła
(`Seer's Lantern`, Immersturm Skullcairn, Balamb Garden), dynamiczne X, `buff_attacking_creatures`,
untap cudzego permanentu, bankowanie many.

## PMSSB-41 — zgłoszenia właściciela z testów: warp bez celu, untap celu triggera, kolejność Station, badge'y reanimacji (2026-10-03b)

Wejście: **cztery uwagi właściciela z gry** (kanał czatu po sesji PMSSB-40; wzorzec
PMSSB-31/PMSSB-36 — zgłoszenie jest dowodem wejściowym, nie tylko „bugiem do załatania”).
Plan: `docs/plans/PLAN_2026-10-03b-pmssb41-uwagi-testow.md`. Zielone commity: plan `59f6821`,
kod+test `8915d03`, golden-master `20969a3`, piny sąsiednich rodzin `b1df1f1`.

**A. `weftblade-enhancer` — warp bez celu.** Karta 3/4 za {5}{W}, warp {2}{W}; ETB „+1/+1 na
każde z **do dwóch** celowanych stworów” (`requiresTarget {creature, count 2, upTo}`). PRZED:
gałąź `warp_card` dawała **płaskie +5** za sam fakt triggera i nie porównywała się z rzutem
normalnym — A1 (6 lądów, brak stworów) rzut 74,703 > warp 66 (OK), ale A2 (3 lądy, brak
stworów) **warp 66 → wybrany**, a A3 (3 lądy + flier) **66 — identycznie jak A2** (brak wymiaru
„cel wart wzmocnienia”). Kryterium właściciela: warp ma sens TYLKO gdy (a) rzut normalny jest
nieosiągalny (wszystkie nietapnięte źródła many) ORAZ (b) na stole jest stwór WART wzmocnienia
(nie token, nie cannon fodder — np. flying/menace/landwalk).

**B. `nanoform-sentinel` — untap w złą stronę.** Trigger `self_becomes_tapped` (raz na turę):
„untap another target permanent”. PRZED: `triggerTargetEffectFriendly` nie znał
`untap_permanent`, więc oferta każdego celu miała `friendly=false` i wycena szła gałęzią WROGĄ:
`foeLand 58` > `foeCre 35` > `myLand −20` > `myCre −29` → **bot odkręcał LĄD PRZECIWNIKA**
(dokładnie zgłoszenie). To domknięcie granicy (5) z PMSSB-40 („untap cudzego permanentu”).

**C. `wedgelight-rammer` — kolejność tapowania do Station.** PRZED (charge 6, moje stwory 2/2
i 4/4, główna 2): obie oferty `tapOtherCreatureId` miały **identyczną notę 9** (wycena brała
`threshold − charge`, a nie moc tapowanego ciała), więc wygrywała PIERWSZA z enumeracji — 2/2,
potem 4/4 → 12 charge zamiast 10 i zbędnie tapnięty stwór 2/2.

**D. `xu-ifit-osteoharmonist` — brak badge'ów.** Silnik liczył wszystko poprawnie
(`subtypes ['Giant','Skeleton']`, `abilitiesStripped: true`, migawka `['Giant']`, zdolności 0),
ale kafel nie czytał ANI utraty zdolności, ANI dodanych podtypów → **badge'y = []** (klasa
L1/ADR 0017: fakt publiczny bez reprezentacji w warstwie gracza).

**Naprawy (generyczne, ADR 0002; reuse istniejących miar — L41/L48):**
- **A:** `warpEtbHostPayoff` = suma `counterHostValue` top-`count` MOICH nie-tokenowych stworów
  (≠ rzucana karta), z premiami ewazyjnymi i blokerami wroga; brak gospodarza → kara
  `warpFutileEtbPenalty` (warp POD pass), oferta rzutu normalnego → `warpRedundantPenalty`
  (jak `plotRedundantPenalty` PMSSB-35/B1). Progi kalibrowane pomiarem (`/tmp/pr/probe-hostmin.mjs`:
  token 2/2 **18**, vanilla 1/3 **16** vs hill-giant 3/3 **24**, tackle-artist **28** przy
  atakującej nodze, flier z blokerem **20** → `warpEtbHostMin 20`).
- **B:** `untap_permanent` wchodzi do listy PRZYJAZNYCH efektów triggera (silnik,
  `effect-intent.js` — jedno źródło dla ofert i bota), a wartość celu liczy wspólna miara
  `untapTargetValue` używana w CZARZE, AKTYWACJI i TRIGGERZE (L41: dotąd dwie kopie + luka).
- **C:** `added = moc tapowanego ciała`, `progress = min(added, threshold − charge)`, premia
  `stationCloseBonus` za DOMKNIĘCIE progu, kara za nadmiar, minus `tapBodyCost` ciała; etykieta
  śladu niesie kandydata (`+station:<id>`, M195/B — bez tego 3 oferty station były nierozróżnialne).
- **D:** PlayerView niesie `subtypesBeforeStrip` (migawka sprzed `stripAbilities`, obok
  `abilitiesStripped`), `cardInfo` liczy `abilitiesStripped`/`subtypesAdded` (tylko gdy migawka
  istnieje — inaczej każdy zwykły stwór miałby „dodane” wszystkie podtypy), nakładka dokłada
  badge'y `bez zdolności` i `typ: +Skeleton`.

**Wartości PO** (`probe-a-final.mjs`, `probe-c-final.mjs`, `probe-d3.mjs`): A1 rzut 71,1 > warp
−89 → rzut; A2 pass (−29), A4 token → pass, A3/A5/A6 wart gospodarz → warp (85/89/82), A7 dwa
gospodary 109; B oferty triggera wszystkie `friendly=true`, wybór `myCre` (14 > −4 > −25 = −25);
C charge 6 → tap 4/4 (nie 2/2), charge 8 → tap 2/2 (minimalny nadmiar), charge 9 → pass,
charge 5 → tap 6/6 (domyka próg); D badge `["bez zdolności", "typ: +Skeleton", "choroba"]` e2e
przez pełny tor silnika.

**Test:** `test/audyt-pmssb41-uwagi-testow.test.js` — **25 pinów** (A: 8, B: 5, C: 7, D: 4 +
kontrola). **Mutacje m1–m9 (RED):** płaskie „+5” wraca **5**, brak kary redundancji **2**, brak
`untap_permanent` w liście przyjaznej **1**, `progress` bez klampu **1**, brak kary za nadmiar
**1**, brak premii za domknięcie **1**, brak kary za bezcelowy warp **3**, badge utraty zdolności
**1**, badge dodanego podtypu **1**. Świadome przesunięcia pinów sąsiadów (wzorzec PMSSB-34
„piny przesunięte o nowy wymiar”): PMSSB-35 D1 (koszt warp) mierzy teraz koszt przy pokrętłach
×0 i osobno pinuje nowe zachowanie (61 zamiast 66 = utrata płaskiego +5), a M277 (kontrakt
widok ↔ render) dopisuje `abilitiesStripped`/`subtypesBeforeStrip` do jawnej listy pól
warunkowych spoza próbki, z dowodem konstrukcyjnym w D1–D3.

**Ewaluacja:** golden-master — dryf **2/6 partii** (`ravnica|innistrad-wu` seedy 1000/1001,
`scoreSum` +107 / +80, liczba decyzji i `chosenKinds` bez zmian; pozostałe 4 partie bit w bit).
Przyczyna jest zamierzona i policzalna: talie wzorcowe mają dokładnie po jednej karcie
z `untap_permanent` (`tenth-district-veteran`, `midnight-guard`) — to naprawa B. Fixture
zregenerowany świadomie (`20969a3`, komentarz w commicie). Tie-audit PO: 24 partie / **12 612
decyzji**, remisy 630/2341 z alternatywami = **26,9%** (442 pary „brak akcji” + 188 realnych =
**9,9%** decyzji akcyjnych), GROZY **13** (`attack` 7, `block` 3, `cast_spell` 1,
`resolve_discard_choice` 1, `resolve_color_choice` 1) — bez pogorszenia wobec poprzednich pętli.
Mirror-eval NOWY KOD vs KOPIA STAREJ GAŁĘZI (`5cc7058`, zmiana jest w kodzie, nie w pokrętłach;
6 talii bench × 4 seedy × 2 strony = 48 meczów): **30:18 (0,6250)**, 0 niedokończonych —
pierwszy od kilku pętli pomiar lustra z wyraźnym sygnałem dodatnim.

**Granice (świadome, nie bugi):** (1) premia ewazyjna w `warpEtbHostPayoff` jest wąska
(flying/menace/landwalk + liczba blokerów) — „wart wzmocnienia” dla innych słów kluczowych
(np. deathtouch, double strike) wychodzi z samej `counterHostValue`, bez własnej premii
(**domknięte w PMSSB-50**: keywordy deathtouch/double strike mają teraz własne reguły
w wycenie ataku — próg zabicia i obrażenia w twarz — niezależnie od `warpEtbHostPayoff`);
(2) `warp_card` nie modeluje pełnej symulacji „warp w tej turze vs rzut w następnej” — porównuje
się z OFERTĄ rzutu teraz (L48), nie z przyszłą turą (**częściowo domknięte w PMSSB-49**: druga
wypłata ETB z recastu po warp jest liczona, gdy recast jest osiągalny już w następnej turze;
pełna symulacja kolejnych tur nadal nie istnieje); (3) Station nadal wymaga własnej Głównej 2
(M153/A2 bez zmian); (4) `tapBodyCost` jest drabiną PMSSB-32 — dla bardzo dużych ciał pełna
wartość obronna ciała nie jest liczona.

**Bramy:** fast **7474/7474** EXIT 0 · `node tools/run-tests.mjs all` **7745/7745** EXIT 0 · build **70 modułów / 4790,6 kB**.


### Runda 2 (2026-10-03c) — weryfikacja po merge + luka LANDWALK

**Wejście:** właściciel zgłosił te same cztery uwagi **po scaleniu PR #151** (`45fcaf6`,
2026-10-03T09:28:44Z). Plan: `docs/plans/PLAN_2026-10-03c-pmssb41-runda2-landwalk.md`.

**Diagnoza (krok 0):** fixy A–D **są w `main`** — po squash-merge pliki
`heuristic-bot.js`/`heuristic-params.js`/`effect-intent.js`/`game-state.js`/`render.js` oraz
fixture golden-mastera są IDENTYCZNE z gałęzią (`git diff --quiet origin/main HEAD`).
Publikacja na GitHub Pages dla `main` była w chwili testu jeszcze **`in_progress`**
(`gh run list`): workflow uruchamia pełny `run-tests.mjs all` (~8 min) PRZED buildem, więc
strona serwowała build sprzed fixów. Scenariusze właściciela odtworzone na kodzie z `main`:
**C e2e** — charge 6 + stwory 2/2 i 4/4 → tap **4/4**, charge **10**, artefakt-stwór,
**2/2 nietknięty**, potem `pass_priority` (bez dobijania do 12); **B** — wybór `myCre` (14)
nad wrogimi (−25); **D** — badge `["bez zdolności","typ: +Skeleton","choroba"]`;
**A** — bez gospodarza warp −29 → pass, przy 6 lądach rzut 71,1 > warp.

**Realna luka znaleziona w tej rundzie (nowa praca):** kryterium właściciela wymienia
„flying, menace **albo landwalk**”, a `PlayerView` **nie niósł pola `landwalk`** — `emerald-oryx`
(forestwalk) i `farbog-explorer` (swampwalk), jedyne karty z landwalkiem w katalogu, były dla
bota gołym 2/3 (klasa L1/ADR 0017). PRZED (`/tmp/pr/probe-landwalk.mjs`): `widok.landwalk`
= `undefined`, warp **−29** (`pass_priority`) ZARÓWNO gdy obrońca ma Las (forestwalk realnie
działa, CR 702.14), jak i gdy go nie ma. PO: widok niesie `landwalk: "Forest"` (deskryptor
podtypu, ADR 0002; ukryty dla zakrytego permanentu obcego kontrolera), a `hostEvadesBlockers`
liczy ewazję regułą **tej samej postaci co silnik** (`combat.js` →
`controlsLandWithSubtype(state, blocker.controllerId, subtype)`): z Lasem obrońcy warp **84 →
wybrany**, bez Lasu −29 → pass. Drugi, węższy defekt tej samej funkcji: gałąź `flying`
kończyła się `return false` przy blokerze z flying/reach, więc **menace na tym samym stworze
nigdy nie był sprawdzany** — teraz zdolności ewazji rozstrzygają się niezależnie (CR: „nie
może być blokowany” to suma warunków).

**Test:** 25 → **30 pinów** w `test/audyt-pmssb41-uwagi-testow.test.js` (A9 landwalk z Lasem
obrońcy, A10 kontrola CR 702.14 bez Lasu, A11 pole widoku, A12 flying+menace ucieka jednemu
blokerowi z flying — wycena ścieżką CZARU, bo próg bramki warp maskuje różnicę przy małym
ciele: 104 bez blokerów vs 111,5 nie-do-zatrzymania; C9 e2e scenariusz właściciela).
**Mutacje tej rundy m10–m13 (RED 1/2/1/1):** landwalk znika z ewazji, widok nie niesie
landwalka, ewazje wracają do pierwszego trafienia, station bez klampu progressu.

**Ewaluacja:** golden-master **bez dryfu** (`innistrad-wu` ma `farbog-explorer`, ale w 6
partiach wzorcowych sytuacja „landwalk + obrońca z lądem podtypu” nie wystąpiła); tie-audit PO
bez zmian: 24 partie / 12 612 decyzji, 26,9% remisów (9,9% akcyjnych), GROZY 13. Mirror
pominięty ŚWIADOMIE: żadna z 6 talii benchmarku nie zawiera karty z landwalkiem (sprawdzone
`grep`), więc pomiar byłby konstrukcyjnie pusty (B6).

**Bramy runda 2:** fast **7479/7479** EXIT 0 · all **7750/7750** EXIT 0 (435,5 s) · build **70 modułów / 4792,5 kB**.

**Status runda 2:** zgłoszenia A–D nieroztwarzalne na kodzie z `main` (opisują build sprzed
merge); dodatkowo domknięta luka landwalk z kryterium A. Właściciel dostaje świeży build
dist na żywym podglądzie sesji, żeby przetestować fixy bez czekania na Pages.

**Status:** wszystkie cztery zgłoszenia ZAMKNIĘTE. Kolejka następnej pętli bez zmian:
koszt okazji drugiego trybu źródła (`Seer's Lantern`, Immersturm Skullcairn, Balamb Garden),
dynamiczne X, `buff_attacking_creatures`, bankowanie many.

## PMSSB-43 — pętla jakości: dynamiczne X i buff_attacking_creatures w payoffie triggerów rzutu (2026-10-03d)

**Wejście:** pozycja 1 kolejki po PMSSB-41 rundzie 2 + komentarz w `heuristic-bot.js:5945`
(„Dynamiczne X (np. source_power) i efekty skierowane są poza modelem (0)") — luka
jawnie oznaczona w kodzie, bez sygnału właściciela (pętla jakości ADR 0021 §4).

**Diagnoza (sonda, nie domyślnie):**
- `temporaryPumpPayoff` wcześnie `return 0` dla `buff_attacking_creatures` oraz gdy
  `power` nie jest liczbą — deskryptory łańcuchowe (`'X'`, `'card_types_in_all_graveyards'`,
  `'source_power'`) były obcinane przed jakąkolwiek symulacją walki, więc payoff
  z pompy liczył zawsze 0.
- `pumpDelta` rozwiązywał tylko `pump_by_creature_count`, `pump_by_gates`,
  `sacrifice_food_choice`; dla reszty brał `effect.power ?? 0` jako LICZBĘ.
- W katalogu wspieranych kart deskryptory dynamiczne w pompach do końca tury pojawiają
  się przy `Altar of the Goyf` (trigger `attacks_alone` → `buff_creature_until_end_of_turn`
  z power/toughness `'card_types_in_all_graveyards'`) oraz `Jyoti, Moag Ancient`
  (`buff_land_creatures` z `'source_power'`; forma command zone nie w silniku, ale
  deskryptor ma ogólny kształt).
- `PAYOFF_TEMP_PUMP_EFFECTS` nie zawierał `'buff_attacking_creatures'` (kształt istnieje
  w silniku, np. Thunderstaff, ale jest aktywacją a nie triggerem rzutu — bez znaczenia
  dla payoffu, ale wpis zamyka przyszłe karty o tym kształcie).

**Naprawa (generyczna, ADR 0002):**
- `pumpDelta(view, effect, source)` przyjmuje opcjonalnego `source` i rozwiązuje
  `'card_types_in_all_graveyards'` (z widoku, te same reguły co silnik w
  `allGraveyardsCardTypeCount` — tokeny się nie liczą), `'source_power'` (z hosta),
  `'oil_counters'` (z liczników hosta). Nie-liczbowy nieznany deskryptor → 0 (miękka
  degradacja).
- Lista typów kart importowana z `src/engine/permanents.js` (`CARD_TYPES`) — test O-2
  wymaga JEDNEGO źródła prawdy; własny `Set` w bocie rozjechałby tę bramkę.
- `temporaryPumpPayoff`: usunięty wczesny return 0 dla `buff_attacking_creatures`;
  odbiorcą symulacji jest nasz atakujący (jeśli jest zadeklarowany), bez atakującego 0.
- `PAYOFF_TEMP_PUMP_EFFECTS` rozszerzone o `'buff_attacking_creatures'`.

**Piny:** `test/pmssb43-dynamiczne-pumpy-payoffu.test.js` — **7 pinów** (A1 liczenie typów,
A2 tokeny, A3 source_power, A4 oil_counters, A5 nieznany deskryptor nie rzuca,
A6 buff_attacking_creatures w rodzinie, A7 puste groby). Mutacja m1 (usunięcie resolvera
`card_types_in_all_graveyards`) → 1/7 RED.

**Bramki:** fast **7486/7486** EXIT 0 (118,1 s) · build **70 modułów / 4795,2 kB** ·
`event-contract-audit.mjs` 0 naruszeń · bot-scoring-snapshot 4/4 zielony (bez dryfu).
Pełny B0 NIE uruchamiany (ADR 0018).

**Granice świadome:**
- Brak obsługi `greatest_power_you_control` (pump przy create_token, nie należy do rodziny)
  ani `greatest_mana_among_other_artifacts` (pump statyczny Emissary — PlayerView już
  niesie wynikową moc w `power`).
- Efekty skierowane (`targetIndex`) pozostają 0 — nie ma wspieranej karty tego kształtu,
  bez kodu na zapas.
- `buff_land_creatures` nie dodane do `PAYOFF_TEMP_PUMP_EFFECTS` — jedyna karta (Jyoti)
  nie jest w formacie.

**Status:** lukę z komentarza zamknięto. Kolejka następnej pętli: koszt okazji drugiego
trybu źródła, przegląd deskryptorów statycznych w PlayerView (następcy landwalka), ward/
zone-exile/O1-creator, warp_card vs rzut w następnej turze, premia ewazyjna
(deathtouch/double strike).

---

## PMSSB-44 — pętla jakości: koszt okazji drugiego trybu źródła many (Seer/Balamb/Skullcairn) (2026-10-03e)

**Wejście:** pozycja 2 kolejki po PMSSB-43 — uwaga na komentarz `M429`: źródło many z
drugim trybem aktywowanym za dodatkową manę (np. Seer's Lantern: {2}{T} scry 1) może
być bezsensownie aktywowane w main1 przed wykorzystaniem many do zagrania czaru.

**Diagnoza (sonda `probe-pmssb44*`):**
- Symulacje dla trzech kart:
  - Seer's Lantern scry {2},{T} w main1 przy 3 Plains na ręce: `activate_ability` -12 vs `pass` 0 → bot passuje (M211 kary: koszt many, wastefulStep, non-EOT library arranging).
  - To samo w enemy EOT: activate +10 vs pass 0 → bot aktywuje (poprawne).
  - Darmowe scry {T} przy 1 Plains i czarze 1W w ręce: activate -10 vs pass 0 → passuje.
  - Skullcairn/Balamb: `abilityManaCostPenalty` (0,6/manę) + `selfHarmPenalty`/wastefulStep wystarczają, żeby nie aktywować.
- **WNIOSEK:** istniejące kary M211 + `abilityManaCostPenalty` + `producesManaOnly` dają poprawne wybory;
  dodanie osobnej wagi `manaTapOpportunityWeight` byłoby „kodem na zapas" wbrew ADR 0022 §4 (kod tylko dla zademonstrowanego błedu).

**Naprawa:** BRAK ZMIAN W KODZIE. Zapisany plan (`PLAN_2026-10-03e-*.md`) z wynikami sondy
i uzasadnieniem. M429 ×0 kotwica zachowana.

**Status:** zamknięty w planie. Kolejka: deskryptory statyczne w PlayerView (następcy landwalka).

---

## PMSSB-45 — brakujące deskryptory statyczne ewazji w PlayerView (2026-10-03f)

**Wejście:** pozycja 3 kolejki po PMSSB-44 — sonda `abilities.js`: cztery deskryptory
statyczne nie wystawione w PlayerView, z czego dwa dotyczą blokowania (krytyczne dla
payoffu pomp/ewazji w `hostEvadesBlockers`): `cantBeBlockedExceptByColors` (Dauthi Voidwalker,
Dread Warlock) i `cantBeBlockedByPower` (Rust-Shield Rampager, Aerial Maurer).
Pozostałe dwa (`cantAttackUnlessDefenderHasFlying`, `preventCombatDamageToController`)
nie są używane w botowych heurystykach ewazji — zostają bez zmian (ADR 0002, bez kodu
na zapas).

**Diagnoza:**
- `hostEvadesBlockers` znał flying/menace/landwalk; nie znał dwóch pozostałych
  deskryptorów — stwór typu Dread Warlock („can't be blocked except by black")
  dostawał 0 punktów ewazji, więc bot nie pompował go, nie atakował w zegar i
  przeceniał wymianę.
- Reguły blokowania w `combat.js/blockRestrictionError` (L41/L48) były jedyne miejsce
  definiujące te ograniczenia; PlayerView ich nie eksponował.

**Naprawa (generyczna, ADR 0002/0017):**
- `game-state.js` PlayerView: obok `landwalk` dodano `cantBeBlockedExceptByColors`
  (tablica kolorów) oraz `cantBeBlockedByPower` (number), liczone z `effectiveAbilities`
  (z uwzględnieniem nadanych do EOT, załączników, warstw postaci), tylko dla
  nieukrytych permanentów (publiczny fakt CR 105.2 / 509.1a).
- `heuristic-bot.js/hostEvadesBlockers`: dodano dwa rozgałęzienia o semantyce
  lustrzanej do `combat.js`:
  - `cantBeBlockedExceptByColors: C` → ewazja, gdy KAŻDY niezatapnięty blokujący wroga
    nie ma ŻADNEGO koloru z dozwolonych (tj. żaden nie może zablokować).
  - `cantBeBlockedByPower: N` → ewazja, gdy KAŻDY blokujący ma moc ≤ N.

**Piny:** `test/pmssb45-desktopy-ewazji.test.js` — **2 piny** (A1 Dread Warlock ma pole
w widoku, A2 Rust-Shield Rampager ma pole w widoku).

**Bramki:** fast **7488/7488** EXIT 0 (120,4 s, +2 piny) · build **70 modułów / 4797,5 kB** ·
`event-contract-audit.mjs` 0 naruszeń.

**Granice świadome:**
- `cantBeBlockedBySubtypes` (Blazing Torch, „can't be blocked except by Walls")
  nie dodane — bot nie rozpoznaje ewazji podtypowej; pojawi się, gdy karta o tym
  kształcie znajdzie się w katalogu (kod na zapas).
- `cantAttackUnlessDefenderHasFlying` (Skyhunter Skirmisher) i
  `preventCombatDamageToController` (Thunderstaff, M255 już istnieje)
  nie dotykają logiki ewazji botowej; bez zmian.

**Status:** zamknięty. Kolejka następnej pętli: ward/zone-exile/O1-creator, warp_card vs
rzut w następnej turze, premia ewazyjna (deathtouch/double strike).

---

## PMSSB-46 — pętla jakości: O1 DIVIDED_POOL_CAP (gracz-wróg wypada z puli celów obrażeń podzielonych) (2026-10-03g)

**Wejście:** obserwacja z audytu PR #150 zapisana w HISTORY (~L15095): „O1 `DIVIDED_POOL_CAP = 8`
(gracz-przeciwnik wypada z puli przy 10 wrogich stworach — kolejka handoffu)". Sonda z
tą sesji skorygowała próg do 8 (nie 10).

**Diagnoza (sonda `tools/probe-pmssb46-o1-dividedpool.mjs`):**
- `dividedDamageDivisions` (`src/engine/spells.js` L2462) sortuje kandydatów po `rank()`:
  - wrogie stwory = 0, gracz-wróg = 1, planeswalker = 2, my = 3, moje stwory = 4.
- Następnie bierze `slice(0, 8)`. Przy ≥8 wrogich stworach cały CAP wypełniają one,
  gracz-wróg (rank=1) znika z oferty — Fiery Justice nie może dobić gracza przy
  szerokim stole mimo, że CR 601.2d na to pozwala.
- Tabela: n=7 pula OK (7/7 stworów + p2), n=8 już BUG (8/8 stworów, p2 brak), n=12 pula
  zawiera tylko 8 pierwszych stworów.

**Naprawa (generyczna, ADR 0002/0022 §4):**
- Przed wypełnieniem puli CAP=8 zarezerwowano 1 miejsce dla KAŻDEJ nie-pustej klasy
  celów innej niż wrogie stwory (najniższy rank): gracz-wróg (rank=1) i planeswalker (rank=2).
- Pozostałe miejsca wypełniane są dotychczasowym porządkiem po ranku.
- Self (rank=3) i moje stwory (rank=4) NIE dostają rezerwacji — samouszkodzenie jest
  marginalne (kod na zapas).
- Kształt bez nazw kart; walidacja ofert pozostaje po stronie silnika (L48) — pule
  kandydatów węższe niż walidacja, jak dotąd.

**Piny:** `test/pmssb46-divided-pool-cap.test.js` — 4 piny (O1 n=8 p2 w puli, O2 n=12 p2 w puli,
O3 regresja n=7 7/7 stworów + p2, O4 oferta 5→p2 istnieje). Mutacja (cofnięcie rezerwacji)
→ 3/4 RED.

**Bramki:** fast **7492/7492** EXIT 0 (122,0 s, +4 piny) · build **70 / 4799,2 kB** ·
event-contract-audit 0 naruszeń · bot-scoring-snapshot 6/6 zielony (bez dryfu — Fiery
Justice nie jest w taliach benchmarku).

**Granice świadome:**
- Rezerwacja tylko dla gracza-wroga i planeswalkera; self i moje stwory bez.
- Liczba oferty pozostaje 792 dla n≥8 (CAP + rezerwacja = 8, jak wcześniej), koszt
  obliczeniowy bez zmiany.
- Nie podnosimy DIVIDED_POOL_CAP — zwiększyłoby to wykładniczo liczbę podziałów.

**Status:** zamknięty. Kolejka następnej pętli: warp_card vs rzut w następnej turze,
premia ewazyjna (deathtouch/double strike), ward/zone-exile w strefie wygnania (jeśli
znajdzie się karta dotknięta luką).


## PMSSB-47 — cel ETB z licznikami przy rzucie permanentu: wchodzący stwór jest gospodarzem (2026-10-03h; korekta 2026-10-03j)

**Wejście:** kolejka z handoffu 03e. Sonda `tools/probe-pmssb47-warp.mjs`
(Weftblade Enhancer, scenariusz D: 6 landów, 0 stworów) pokazała, że rzut
dostaje premię ETB +6 mimo pustego stołu własnego.

**Naprawa w PR #153 (pierwotna):** `etbFriendlyCounterTargetAvailable` miała
wymagać istniejącego przyjaznego stwora (spec `creature`/`creature_you_control`,
filtr podtypu), zamiast zwracać `true` dla każdego spec-a bez `notSelf`.

**KOREKTA w audycie PR #153 (znalezisko F1, `docs/audits/AUDYT_PR153_2026-10-03.md`):**
premisa była błędna — wchodzący permanent JEST na polu bitwy, gdy trigger ETB
trafia na stos (CR 603.6d), więc bez `notSelf` sam jest legalnym celem („up to
two target creatures"). Silnik potwierdza to ofertą `resolve_trigger_target`
z `targetIds: ['permanent-1']`; scenariusz D (+71,1) był POPRAWNY, nie zawyżony.
Wersja z PR #153 zamieniła zawyżkę w zaniżkę dla 3 kart (Weftblade Enhancer,
Cloudbound Moogle, Simian Simulacrum). Realna zawyżka dotyczyła LĄDU
(Idyllic Grange — wchodzący nie jest stworzeniem) i ta część została.

**Naprawa finalna (PR #154, `6fa26e4`):** bramka przyjmuje `enteringDef` i
liczy wchodzącą kartę jako cel, gdy jest stworzeniem spełniającym filtr
spec-a i spec nie ma `notSelf`; w przeciwnym razie wymaga istniejącego
przyjaznego stwora. Kotwica A4 w `test/audyt-pmssb35-odroczenie.test.js`
wraca 65.703 → 71.103. Piny E1–E4 (self-host, wybór rzutu, score skończony,
kontrola `notSelf` z Jade Bearerem). Mutacja m1 → A4 + E1 RED.

**Bramki:** PR #153 merged tree `npm test` 7500/7500 EXIT 0 (103,3 s); po
naprawie 7501/7501, build 70 modułów, bot-scoring-snapshot 4/4 bez dryfu.

**Granice świadome:** `castFutileEtbPenalty` (etap 2 planu) nie zrealizowany —
brak karty demonstrującej rzut z ETB naprawdę bez celu (ADR 0022 §4); wraca do
kolejki z taką kartą.

**Status:** zamknięty po korekcie.

## PMSSB-48 — oznaczenie wejścia przez Warp w logu i na kaflu (2026-10-03i)

**Wejście:** zgłoszenie właściciela — karta rzucona za Warp nie różniła się w
Rozgrywce ani w Logu od zwykłego rzutu.

**Naprawa (PR #153):** `src/table/session.js` dopisuje „(za Warp)" do linii
`permanent_cast`; `src/engine/game-state.js` wystawia `enteredViaWarp` w
PlayerView permanentu (publiczny fakt — koszt alternatywny rzutu jest jawny);
`src/table/render.js` pokazuje badge „Warp · wygnanie na EOT".

**Weryfikacja (audyt PR #153, sonda e2e):** zdarzenie `permanent_cast` niesie
`warped: true`, permanent zachowuje flagę po rozstrzygnięciu stosu, a widok
wystawia `enteredViaWarp` obu graczom. Mutacje W1 (sufiks logu) i W2 (wpis
widoku) → piny RED; rozszerzenie M277 o pole odczytu renderera.

**Bramki merged tree:** `npm test` 7500/7500 EXIT 0 (103,3 s).

**Granice świadome:** zgłoszenie B (Station po 3 tapach) bez zmian kodu —
sorcery-speed i wymagany pass po zdolności na stosie (ADR 0022 §4), zgodnie z
diagnozą planu.

**Status:** zamknięty.

## PMSSB-49 — `warp_card` widzi DRUGI ETB z recastu po warp (2026-10-03l)

**Wejście:** pozycja 2 kolejki po PMSSB-48 (handoff `03g`) — „warp_card vs rzut
w następnej turze: opóźdzony zysk vs stracona tura", czyli granica (2)
z sekcji PMSSB-41 powyżej.

**Problem (sonda, PRZED):** `warp_card` porównywał się wyłącznie z OFERTĄ rzutu
TERAZ (L48), więc S1 (3 lądy — rzut nieosiągalny), S3 (6 lądów, 4 nietapnięte —
rzut za turę) i S5 (5 lądów bez land dropu) dawały **identyczne 85,000**.
A karta po warp-caście wraca z wygnania ZA KOSZT MANY (CR 702.185a) i tam ETB
odpala **drugi raz** — sonda pokazała rzut z exile jako `cast_permanent` przy
6 lądach, brak oferty przy 3 manach (koszt = koszt many 6, nie warp 3) i drugi
licznik `+1/+1` na tym samym gospodarzu.

**Naprawa:** pokrętło `warpRecastEtbWeight: 0.5` + helper
`warpRecastReachableNextTurn(view, card)` (untap własnych lądów + land drop
z ręki ≥ `manaCost` i pokrycie kolorów; `false`, gdy rzut oferowany teraz —
to gałąź redundancji). Gałąź `warp_card` dolicza
`0,5 × secondEtbPayoff` (ta sama wypłata co dla wejścia teraz). `×0` = stan
sprzed zmiany (M429).

**Pomiar PO:** S1 85,000 (kotwica), S1b 85,000, **S1c 97,000**,
S2 cast 71,103 > warp 25,000 (bez zmian), **S3 97,000** (było 85,000),
S4 −29,000 (jałowy warp bez zmian), S5 85,000 (5 lądów bez dropu nie pokrywa
{5}{W} — celowo). S1 i S3 różnią się o dokładnie 12 = 0,5 × 24.

**Weryfikacja:** `test/pmssb49-warp-vs-nastepna-tura.test.js` W1–W9 (9/9);
mutacje m1→W2/W4/W6/W9, m2→W2/W6, m3→W5, m4→W1/W3/W4/W5 (po przywróceniu
zielone); regresja PMSSB-41 + PMSSB-35 50/50.

**Bramki:** `npm test` **7522/7522** EXIT 0 (116,1 s) · brama PR
`npm run test:all` **7793/7793** EXIT 0 (447,1 s) · build **70 modułów /
4806,9 kB** · `bot-scoring-snapshot` 4/4 bez dryfu · `event-contract-audit`
0 naruszeń.

**Granice świadome:** proxy zna wyłącznie widok (własne lądy + ląd z ręki);
źródła nielandowe wymagające aktywacji i przyszłe dobrania są poza modelem.
Talie wzorcowe (`BENCH_DECKS`) nie mają karty z warp, więc pomiar lustra nie
zmienia się od tej rundy; pełny B0 tylko na polecenie właściciela (ADR 0018/0025).

**Status:** zamknięty.

## PMSSB-50 — premia ewazyjna deathtouch / double strike w wycenie ataku (2026-10-03m)

**Wejście:** pozycja 3 kolejki po PMSSB-48 (handoffy 03g/03h) — granica (1)
z sekcji PMSSB-41: wycena ataku nie znała dwóch słów kluczowych, które
rozstrzygają walkę.

**Problem (sonda, PRZED):** progi zabicia liczone gołą mocą
(`power >= blocker.toughness`), więc 1/1 i 3/3 z deathtouch wypadały tak samo
jak bez niego (−10 = chump), 3/3 z DT w blokera 1/5 trafiał w „przeżyje, ale
nie zabije” (−2), 2/2 z double strike dawał 13 = tyle samo co 2/2 bez DS
(choć bije w twarz 4, nie 2), lethal przy 4 życia obrońcy nie był widziany
(33 zamiast +1000), a 2/2 DS w blokera 4/4 był chumpem, choć to wymiana (2+2).

**Naprawa:** `lethalDamageOf` (deathtouch CR 702.2b → ∞, double strike
CR 702.7b → 2 × moc) w progach „zabija blokera”; próg „zabija, ZANIM bloker
odpowie” zostaje przy jednej odsłonie (`killsBeforeBlockerStrikes`, CR 702.7) —
dwie odsłony to próg wymiany; `faceDamageOf` (DS = 2 × moc) w gałęziach
„przechodzi” i w `totalPower` (lethal); nowa gałąź „deathtouch praktycznie
nieblokowalny”: gdy KAŻDY nietapnięty bloker jest cenniejszy niż atakujący
(moc + wytrzymałość jak `blockerValueLost`), blok nie przyjdzie i atak liczy
się jak ewazyjny (M202/H). Bez nowych pokręteł — to reguły CR, nie wagi.

**Pomiar PO:** A2 4 / A4 6 / A5 6 / B2 15 / B3 1035 / B5 1; kotwice bez
keywordów bez zmian (A1/A3 −10, B1 13, B4 33, B7 1).

**Weryfikacja:** `test/pmssb50-ewazja-dt-ds.test.js` E1–E9 (9/9); mutacje
m1→E3,E6; m2→E3; m3→E6; m4→E1,E2; m5→E4,E5; m6 (over-fix progu „przed
blokerem”)→E6; m7 (nierówność nieostra)→E9; m8 (podwojenie zawsze)→E4,E5;
regresja skoncentrowana 252/252.

**Golden-master (świadomy dryf 1/6 partii):** `tarkir-bg|warhammer-ubr@1001`,
decyzja #104 (tura 9): bot ma `woolly-loxodon` 2/2 i `typhoid-rats` 1/1
deathtouch, a wrogie blokery (2/1, 2/2) są cenniejsze od 1/1 — PRZED
`attack[permanent-12]` = 1, PO `attack[permanent-12,permanent-22]` = 5
(typhoid-rats = 1 + 3). Fixture zregenerowany świadomie (precedens PMSSB-32).

**Bramki:** `npm test` **7531/7531** EXIT 0 (117,5 s) · build **70 modułów /
4809,8 kB** · `bot-scoring-snapshot` 4/4 po regeneracji · `event-contract-audit`
0 naruszeń.

**Granice świadome:** model ataku pracuje na agregatach (najsilniejszy bloker
+ gang top-2), więc „praktycznie nieblokowalny” to proxy wartości, nie
symulacja wyboru blokera przeciwnika; `totalPower` dla zablokowanego atakującego
z DS nadal nie modeluje drugiej odsłony (obsługuje ją blokowa ścieżka
`blockExchangeOf`).

**Status:** zamknięty.
## PMSSB-51 — ETB lądu z celem bez legalnego celu osłabia land drop; warunek „enters untapped” jak w silniku (2026-10-03n)

**Wejście:** kolejka 4 (etap 2 planu `PLAN_2026-10-03h`, świadomie odroczony
w ADR 0022 §4) — granica (1) §PMSSB-41. Karta demonstrująca ZNALEZIONA w tej
sesji: **Idyllic Grange** (ELD, Land — Plains; ETB „+1/+1 counter on target
creature you control”, wchodzi odkręcony przy 3+ innych Plains).

**Problem (sonda G1–G5, PRZED):** `case 'play_land'` nie wołał żadnej wyceny
ETB, więc przy pustym stole ląd wygrywał kolejność z rzutem gospodarza
(G4: `play_land` 82 vs `cast_permanent` 63,9027), a trigger przepadał bez
celu. Druga wada tej samej ścieżki: `landAnaliza` czytała GOŁĄ flagę
`entersTapped`, ignorując `entersTappedCondition` — ląd wchodzący odkręcony
płacił fałszywe −8 (G2: 82 = 90 − 8 mimo 4 Plainsów).

**Naprawa:** `entersTappedOfLand` (jedno miejsce rozstrzygania warunków
wejścia w wycenie — lustro z odwołaniem `resources.playLand`, CR 614.1c:
`player_life_at_most`, `islands_you_control_at_least`,
`controls_land_subtype_any`, `minOtherPlains`); `futileFriendlyCounterEtbPenalty`
— kara `castFutileEtbPenalty` (40) gdy trigger ETB z celem „moje stworzenie”
i efektem `add_counter` nie ma legalnego celu (dla stworów nie zachodzi:
wchodzący jest celem własnego triggera, CR 603.6d — korekta F1; bramka
`condition.enteredUntapped` przy wejściu tapniętym pomija trigger); kara
wołana w `play_land` PO klamrze `landPlayDelta` (±14/25), bo w klamrze
zostałaby zjedzona. Bez nazw kart (ADR 0002); `×0` pokrętła = stan sprzed.

**Pomiar PO:** G1 ląd 82 → **50**, G2 82 → **90** (odkręcony, cel jest),
G4 ląd 82 → **50** i bot wybiera **rzut** (63,9 > 50), G5 (2 Plainsy, warunek
niespełniony) 82 bez zmian (trigger nie odpala — kary nie ma).

**Weryfikacja:** `test/pmssb51-etb-ladu-futile.test.js` E1–E6 (6/6); mutacje
m1→E1,E2; m2→E1,E2,E3,E5; m3→E4; m4→E1,E2; m5 (kara W klamrze)→E1,E2;
regresja skoncentrowana 269/269.

**Golden-master (świadomy dryf DOKŁADNIE 1 decyzji z 6 partii):**
`tarkir-bg|warhammer-ubr@1001` #179: `play_land(kishla-village)` 84 → 92
(+8 — warunek `controls_land_subtype_any` spełniony, więc ląd wchodzi
ODKRĘCONY i fałszywe −8 znika); scoreSum partii 2755,6261 → 2763,6261,
liczba decyzji 217 → 217; pozostałe 5 partii bez zmian. Kara ETB nie odpaliła
w benchmarku ani raz. Fixture zregenerowany świadomie (precedens PMSSB-32/50):
`fff9c22c…` → `16a139c2efd5229d…`.

**Bramki:** `npm test` **7537/7537** EXIT 0 (117,8 s) · brama PR
`npm run test:all` **7808/7808** EXIT 0 (502,9 s) · build **70 modułów /
4814,2 kB** · `bot-scoring-snapshot` 4/4 po regeneracji · `event-contract-audit`
0 naruszeń.

**Granice świadome:** dostępność celu czytana z widoku (bot nie zna
przyszłości) — cel dochodzący po rzucie w tej samej turze dostanie karę mimo
realnej wypłaty (bezpieczny kierunek: najpierw gospodarz); kara jest stała,
nie skaluje się jakością gospodarza (dokładniejsza wycena należy do
`etbEnterBonusValue`, gdy land-ETB będzie miał więcej kart w katalogu).

**Status:** zamknięty (kod `bd96e07`).

## PMSSB-53 — ward zmierzony E2E: luki nie ma; granica kopii czarów (2026-10-04b)

**Wejście:** kolejka handoffu `2026-10-04a` poz. 1 („Ward — rekonesans zrobiony,
luki nie ma; postaw SONĘ na decyzję `resolve_ward_pay_choice`”). Karta
demonstrująca: **`riftburst-hellion`** (MKM, disguise → zakryty 2/2 z ward {2},
CR 702.168a; jedyna karta z ward, talia `ravnica`).

**Pomiar 1 (sonda G1–G7, `douse-in-gloom` na zakryty permanent p2):**
- G1 (3 Swampy — po zapłacie czaru brak many na ward): rzut = **−200**, bot pass;
- G3 (5 Swampów, pełna sekwencja): rzut → pass p1 → pass p2 →
  `resolve_ward_pay_choice pay=true` (80 vs 20) → czar rozstrzyga;
- G5 vs G3: ten sam zakryty 2/2 bez warda (morph) = **82**, z wardem = **80**
  ⇒ podatek dokładnie 2; G6 (morph, 3 Swampy) = 82, nie −200 ⇒ −200 z G1
  pochodzi z warda, nie z kosztu many; G7: podatek KIERUJE rzut na cel bez
  warda (disguise −200 vs zwykły 90).

**Pomiar 2 (granica kopii, `spreading-insurrection` ze storm=2):**
S1 (8 Mountain): ward #1 opłacony, ward kopii bez decyzji (silnik kontruje
kopie, bo `producibleMana` 1 < 2 — poprawnie); S3 (14 Mountain): bot płaci
**3×** (oryginał + 2 kopie) na potrójne przejęcie TEGO SAMEGO stwora.

**Wniosek:** podatek ward (twardy: brak many = 200, poniżej passu) i decyzja
dopłaty działają zgodnie z projektem (M320/NA2, M324/F1) — **kodu nie
ruszamy**. Świadoma granica: nadpłata za REDUNDANTNE kopie (przejęcie kontroli
się nie kumuluje, obrażenia owszem) wymaga modelu klas efektów + pola widoku
„kopia celuje w to samo, co oryginał” — pozycja kolejki, nie łatka w decyzji;
pary nie da się złożyć w BENCH_DECKS (`ixalan` bez `ravnica`).

**Lekcja:** L177 (trigger na stosie: mierz SEKWENCJĘ decyzji, nie jeden krok —
jednokrokowa sonda ogłosiła fałszywy alarm „brak decyzji ward”).

**Bramki:** `npm test` **7537/7537** EXIT 0 (123,5 s) · build **70 modułów /
4814,2 kB** · strażnicy docs 25/25.

**Status:** zamknięty (pomiar; zero zmian w `src/`).

## PMSSB-54 — przegląd czytników `zone === 'exile'` (negatywny) + strażnik pokrycia komend (2026-10-04c)

**Wejście:** kolejka handoffu `2026-10-04b` poz. 1 (zaległe z 03d/03i/03j
„przegląd czytników `zone === 'exile'`”).

**Przegląd:** `grep "== 'exile'" src/` → **52 miejsca / 12 plików**:
budowa id stref, permity rzutu z exile (impuls/plot/suspend/rebound/madness/
warp/epic) z bramką flagi + stampu tury, dowiązania „exiledBy” po LKI,
zamienniki stref śmierci (finality/unearth/flashback), kontrakt widoku
(CR 406.3 — zakryte wygnanie nie ujawnia tożsamości). **Zero luk.** Jedyna
granica (udokumentowana w kodzie, `game-state.js:3327–3331`): rzut karty
z suspend oferowany tylko dla `kind === 'spell'` — permanent z suspend
wymagałby ścieżki permanentu (haste, CR 702.62a); w katalogu nie ma takiej
karty (Mindstab to sorcery) ⇒ **brak karty demonstrującej = brak fixa**.

**Pomiar lustrzany:** silnik emituje **89** typów komend, bot ma **89/89**
jawne `case` — brak `case` spada do `default: finish(0)` (wybór z kolejności
ofert, antywzorzec L41), a telemetria `bot.unvaluedDecisions()` łapie to
dopiero w grze.

**Fix:** strażnik `test/bot-komendy-silnika-straznik.test.js` (3 piny: pełne
pokrycie + kotwice przeciw „przejściu na pusto” + brak gnijących wyjątków).
**RED→GREEN (L13):** m1 usunięcie `case 'resolve_ward_pay_choice'` → FAIL
z nazwą typu; m2 `command('resolve_fake_probe_type')` w silniku → FAIL;
restore z /tmp (cmp zgodne) → GREEN 3/3, `src/` bez zmian.

**Bramki:** `npm test` **7540/7540** EXIT 0 (123,1 s; +3 piny) · build
**70 modułów / 4814,2 kB**.

**Status:** zamknięty (kod `522c514`).

## PMSSB-55 — kondensacja rejestru lekcji, batch 2 (5 najgrubszych wpisów) (2026-10-04d)

**Wejście:** kolejka handoffu `2026-10-04c` poz. 1. Skrócone: **L164, L163,
L169, L165, L168** (1637/1519/1369/1367/1202 B → 904/964/1039/994/948 B);
proza → `docs/LESSONS_PRZYPADKI.md` pod tymi samymi numerami, marker
`**Proza z rejestru (kondensacja 2026-10-04c):**` (5 nowych sekcji).

**Pomiar:** `docs/LESSONS.md` **138 219 → 135 984 B** (−2235 B); budżet
lektury **99 870 → 99 072 t.** (zapas **130 → 928**). Licznik wpisów stały
(168), odsyłacze `→ narracja` nienaruszone (oba końce istnieją).

**Procedura:** backup /tmp → podmiana dokładnego bloku (regex nagłówek→następny
`## L`) → asercje (nagłówek identyczny, markery reguły/strażnika, brak
`Objaw`/`Przyczyna`, proza > 400 B, stałe liczniki) → strażnicy docs.
Asercja „archiwum ≥ rejestr" z pierwszej próby była BŁĘDNA (archiwum ma tylko
wpisy z prozą) — wyjątek przed `write_text` = nic nie zapisano (wzorzec L163
z 04a działa).

**Bramki:** strażnicy docs **25/25** · `npm test` **7540/7540** EXIT 0
(117,8 s) · build **70 modułów / 4814,2 kB** · brama PR `npm run test:all`
na tipie `55976dc`: **7811/7811** EXIT 0 (450,5 s).

**Status:** zamknięty.

## PMSSB-56 — scoring bota: zapłata za redundantne KOPIE czarów (2026-10-04e)

**Wejście:** dyrektywa właściciela („dodawaj mechaniki i pomiary niezbędne do
poprawnego scoringu bota — nie pomijaj problemów”) + pomiar 2 z PMSSB-53.

**Pomiar A (zdrowie scoringu):** nowe narzędzie `tools/scoring-unvalued-audit.mjs`
(self-play heuristic przez harness benchmarku) → **12 partii / 6255 komend /
0 decyzji bez wyceny**; klasa „brak case” domknięta statycznie (PMSSB-54)
i mierzalnie.

**Pomiar B (RED):** storm × ward (`spreading-insurrection` storm=2 na zakrytym
disguise z ward {2}, 14 Mountain) — bot płacił **3× {2}** za jedno przejęcie
kontroli. **PO:** dokładnie **1 płatność**, efekt dostarczony.

**Pomiar C (RED):** storm × zapłata kontrująca (`frightful-delusion` w KOPIĘ,
„zapłać {1}”) — bot płacił {1}. **PO:** odmowa, efekt dostarcza instancja
pozostawiona na stosie.

**Mechanika:** (1) widok wpisu stosu niesie `copy: true` dla `isSpellCopy`
(CR 707.10 — luka kompletności ADR 0017); (2) `NON_ACCUMULATING_SPELL_EFFECTS`
+ `redundantSpellCopyPayment` — kara wyłącznie dla KOPII, której WSZYSTKIE
efekty nie kumulują się na tym samym celu, gdy na stosie wisi inna instancja
tej samej karty z tym samym zestawem celów (karzemy tylko kopie — inaczej
instancje odmawiałyby sobie nawzajem); (3) pokrętło `redundantCopyPayPenalty`
(120; ×0 = stan sprzed naprawy, M429).

**Piny:** `test/pmssb56-ward-kopie-redundancja.test.js` E1–E12 (E2E ward
i kontra, anty-over-fix `damage`, kotwice: brak bliźniaka / inny zestaw celów
/ nieznany efekt). **Mutacje:** m1 reguła off → E1+E8; m2 flaga `copy` off →
E1; m3 `damage` w liście → E3; m4 kontra off → E9+E12; restor z /tmp → GREEN.

**Lekcja:** L178. **Bramki:** `npm test` **7552/7552** EXIT 0 (+12), build
**70 modułów / 4818,8 kB**, brama PR na tipie `413448d`: **7823/7823** EXIT 0
(592,4 s).

**Status:** zamknięty.

## PMSSB-57 — pomiary scoringu: zapłaty, mulligan, przestrzeń wyboru (2026-10-04f)

**Wejście:** dyrektywa właściciela („dodawaj mechaniki i pomiary niezbędne do
poprawnego scoringu bota — nie pomijaj problemów”) + kolejka 2 z handoffu 04e
(rodziny zapłat). Runda **pomiarowa**: bez zmian wag bez dowodu misplayu.

**Pomiar 1 (zapłaty):** nowe narzędzie `tools/scoring-pay-census.mjs`. Na
BENCH_DECKS (36 partii, seedy 2 i 6) — **0 decyzji** czterech rodzin zapłat,
bo żadna z 9 kart z polem `payMana` nie leży w 6 taliach próbki. Na wszystkich
23 taliach (`--decks=all`, seed 1): jedyna zmierzona rodzina
`resolve_pay_or_sacrifice` — **2 decyzje, pay=2, koszty {1:1, 3:1}**. Próba
**10× (230 partii)**: `resolve_pay_or_sacrifice` **15 decyzji, pay=15**
(koszty {1:11, 3:4}), `resolve_optional_pay_choice` **25 decyzji, pay=24**
(koszty {1:9, 2:16}); ward/kontra nadal 0 — karty tych rodzin nie leżą
w żadnej talii repo (L179). Bez dowodu misplayu → **bez zmian wag**
(ADR 0021/0026).

**Pomiar 2 (mulligan):** nowe narzędzie `tools/scoring-mulligan-audit.mjs`
(23 partie, 53 decyzje): 0 lądów 0 keep/1 mulligan; 1: 0/6; 2: 21/0; 3: 12/0;
4: 12/0; 5: 1/0 — **0 naruszeń** trzech kryteriów (keep bez polityki, mulligan
mimo 2+ lądów, keep bez grywalnego czaru). Polityka zmierzona i trzymana.

**Pomiar 3 (przestrzeń wyboru):** nowe narzędzie
`tools/scoring-choice-space-audit.mjs` — czy decyzje ze stałym `finish(0)`
mają NAPRAWDĘ jeden wariant (komentarz to nie pomiar, precedens PMSSB-30).
69 partii / 23 talie: `resolve_damage_assignment` 39 decyzji — zawsze 1;
`resolve_index_choice` 1/1; `resolve_reveal_order` i `resolve_replacement_choice`
bez wystąpień. **Komentarze POPRAWNE tam, gdzie próba istnieje.** Tryb
`--all-decisions` daje mapę wszystkich typów (pass_priority 1, declare_blockers
1..32, resolve_mulligan_choice zawsze 2, resolve_optional_trigger_choice zawsze
1 — z definicji oferty: odmowa przez `pass_priority`).

**Lekcja:** L179 (rotująca próbka benchmarku może wykluczyć całe rodziny
decyzji — policz wystąpienia, zanim uznasz, że benchmark coś mierzy).
Kondensacje budżetu: L54, L59, L48 (proza w `LESSONS_PRZYPADKI`).

**Bramki:** brama PR `npm run test:all` na tipie kodu `ebbf486`: **7823/7823**
EXIT 0 (461,8 s). Budżet lektury: **99 859 / 100 000** (zapas 141 → po L48:
**99 724**, zapas 276).

**Status:** zamknięty (wszystkie trzy pytania — negatywne z liczbami).


## PMSSB-58 — jakościowe domknięcie batcha 63 (2026-10-05, PR #155)

Właściciel wskazał, że „karta działa / CI zielone” nie dowodzi jakości
scoringu. Audyt objął **wszystkie 10 kart**, nie tylko cztery dopisane po
przejęciu. Plan przed kodem `7bff147`; baza `c60fb42`.

**Fale:** A (`8f1a907`) — wartość opcji Blood, cena discard tym samym pickerem,
bilans ofiary ujemnej pompy, rezerwa liczonych zasobów, koszt ostatniego
blokującego Spawn. B (`77ebd06`) — jedna najlepsza legalna wypłata modalnego
ETB dla rzutu i wyboru, ward, każdy slot zwrotu z grobu, dostępność kolorów,
koszt raz na czar, rozróżnialne etykiety. C (`1bf6c31`, brama `1a2f313`) —
regeneracja wobec prawdziwego zniszczenia, ETB ewazji wobec realnego bloku,
popyt/fixing/timing rampy, żywe zdolności Snarespinner i cena czarów z licznikami.
Nie ma gałęzi po nazwach kart, zmian danych talii ani automatycznego tuningu.

**Piny i pomiary:** A/B/C **29+25+44 = 98** pinów; pokrętła ×0 i mutacje
każdej naprawianej klasy. Snapshot OFF odtwarza poprzedni hash, ON w C
zmienia jeden wpis o koszt 4, nie wybór. Końcowy hash `ea4cee6850362582…`.
Tie na 7 taliach: akcyjne remisy **55→54**, po 7 ukończonych gier. Mirror
**15:13**, 28/28, 0 unfinished. Żywy Tester **7/7** naturalnych końców,
0 flag; ręczny przegląd wykrył F17 „gracz wybierasz tryb”, naprawiony
3 pinami i replayem. Nieobecne decyzje mają wymuszone scenariusze, nie
pozorne zaliczenie. Narzędzia dostały pełny kontekst własnej talii i guardy próby.

**Bramy kodu `45e7faa`:** all **8013/8013**, build **72 moduły / 4871,6 kB**,
quick **672/672**, 0 unfinished, CI PASS. Heuristic **584/672 (86,9%)** vs
referencyjne 585/672 — o jedną wygraną mniej; progi regresji bez zmiany.
Nie przypisujemy małym różnicom istotności statystycznej i nie dobieramy pod
nie seedów. Wąskie scenariusze są dowodem konkretnych napraw, nie cały win-rate.

**Jawne granice:** wartość Battle nie modeluje nieznanej tylnej strony;
podaż many i ratunek przez zachowanie blokera nie są planowaniem całej
sekwencji wieloataku/wielu przyszłych czarów. Nie dodano żadnej karty Battle.

Dowody, wartości PRZED→PO, wszystkie nowe parametry i pokrycie per karta:
[raport PMSSB-58](audits/PMSSB58_BATCH63_2026-10-05.md),
[plan](plans/PLAN_2026-10-05a-pmssb58-batch63.md),
[handoff](setup/HANDOFF_2026-10-05b-pmssb58.md).


## PMSSB-59 — jakościowe domknięcie batcha 64 (2026-10-08, PR #158)

Dwie realne poprawki scoringu i trzy werdykty kontrolne na 10 kartach i ośmiu
mechanikach batcha 64 (aktywowane `destroy_permanent` na dowolny permanent,
pompka sorcery-speed, mana ze stwora, clash z nagrodą licznikiem, Keen Sight,
delirium jako warunek statyczny, `add_mana` trójkolorowy, ląd z
`MANA_SOURCE_MAP` + skrut).

**Fala A (F1, Universal Solvent):** ścieżka `activate_ability` nie miała gałęzi
nagrody dla twardego removalu — wyceniana wyłącznie rodzina `BOUNCE_STRENGTH`,
więc zdolność „{7}, {T}, poświęć: zniszcz celowy permanent" płaciła koszt i
dostawała za NIC (−5 dla KAŻDEGO celu: 2/1, 6/5, ląd, własny permanent;
pass = 0). `REMOVAL_EFFECTS` wyciągnięte ze ścieżki czarów na poziom modułu
(L41 — jeden zestaw) + lustrzana gałąź z tą samą skalą ofiary (baza 22 + waga 2
× ofiara + bonus TMC), czysty ląd −60, regeneracja bez premi (M92). Kara za
własny cel bez podwójnego −90 (`selfHarmPenalty` już go pobiera: −185 → −98).
PO: 2/1 → **+27**, 6/5 → **+51**, własny −95/−98.

**Fala B (F2, Brave-Kin Duo):** kara „pump «do końca tury» poza walką w mojej
turze" (−26) jest pisana dla sztuczek INSTANT-speed — te zawsze można odłożyć
do walki. Zdolność z ograniczeniem sorcery NIE MA późniejszego okna, więc ta
sama kara wyceniała JEDYNE legalne okno jak błąd (−28 = pass, bot nigdy nie
użył). Zamiast kary: wartość przy realnym zamiarze ataku
(`intendsToAttackThisTurn`), plus premia za pump domykający LETAL (skala
`counterLethalClockBonus`). Druga przyczyna: utrata ataku za {T} liczona na
ODBIORCY zamiast na TAPNIĘTYM źródle. PO: wróg w 4 życia przy mocy wysyłanej 3
→ **+49** (aktywacja); atak już letalny / pusta plansza → pass; pump wroga −79.

**Werdykty „by design" (bez zmiany kodu):** ręczna aktywacja many ze stwora
poniżej passu (silnik sam tapuje stwora przy auto-płatności — test wykonuje
rzut i sprawdza stan po wykonaniu); skrut lądu przy spornej manie (strata
tempa); drabinka cienkiej biblioteki za ETB-tutora (celowa decyzja wcześniejszego
audytu, pin C/5 — proponowana fala D została wycofana, bo łamała ten pin:
fast 7899/7900, all 8163/8164). Clash + `counterOnWin` + `cantBlockPrinted`,
delirium, Keen Sight i `add_mana` trójkolorowy są zdrowe.

**Pułapka metodyczna:** karty właściciela siedzą w `VIRTUAL_BASIC_LANDS`, nie w
`REAL_CARDS` — kontrfaktyka patchuje ten wpis, inaczej override przepada i
wszystkie porównania wychodzą zerowe (pierwszy przebieg pomiarów Keen Sight /
delirium przez to padł).

**Piny:** 13 w `test/audyt-pmssb59-batch64.test.js`; mutacje każdej naprawianej
klasy dają 2 czerwone testy, stan naprawiony 13/13. Bramy: all **8160/8160**
po fali B, build **73 moduły / 4959,4 kB**, fast **7900/7900** po werdyktach
kontrolnych, all **8164/8164**. Benchmark B0 (672 mecze, te same talie co
baseline): **603/672 (89,7%)** vs **604/672 (89,9%)** przed zmianami — bez
zmiany w granicach szumu.

**Jawne granice:** bot nie planuje wieloatakowania i nie zna przyszłych bloków,
więc pumpa sorcery-speed jest wyceniana z zamiaru ataku, nie z pewności wymiany.

Dowody, wartości PRZED→PO i werdykty per karta:
[raport PMSSB-59](audits/PMSSB59_BATCH64_2026-10-08.md),
[plan](plans/PLAN_2026-10-08b-pmssb59-batch64.md).

## PMSSB-60 — jakościowe domknięcie batcha 65 (2026-10-10, PR #162)

Zlecenie właściciela: „Uruchom pełne PMSSB dla B65". Pętla jest
**zamknięta**: sześć findingów naprawiono w falach A–F. Tabela niżej zachowuje
pomiary PRZED, ale jej kolumna stanu opisuje wynik końcowy; audyt PR #162 dodał
jeszcze pin wykonania wyboru koloru Zombie Boa (C4).

**Pomiar PRZED** (`3b63c79`, sonda `tools/pmssb60-batch65-sonda.mjs`, bot
w konfiguracji produkcyjnej, kontrfaktyki izolujące efekt od ciała): 6 findingów
+ 4 kontrole dodatnie. Pułapka PMSSB-59 potwierdzona — karty batcha 65 siedzą
w `VIRTUAL_BASIC_LANDS` (card-data.js 13299-13491), więc rejestr kontrfaktyczny
składamy z obu list.

| Finding | Pomiar PRZED | Stan |
|---|---|---|
| **F1** Blitz — `damage` z `amount: 'instants_and_sorceries_in_your_graveyard'` | −30,0 płasko dla grobu 0/2/4/6 i celu 2/2–8/8; kontrfaktyk bez efektów +50,0 (**delta −80**) | **DONE (fala A)** — grób 4/6 → 96,0; cel 2/2 → 84,0; grób 0 bez zmian |
| **F3** Impulse — `look_top_put_one_hand_rest_bottom` jako czar | delta **0** wobec kontrfaktyku; płasko 50,0 dla biblioteki 0/1/4/30 | **DONE (fala B)** — biblioteka 30 → 59,0, biblioteka 0 → 33,0 |
| **F6** Brine Giant — affinity for enchantments | 70,2072 płasko dla 0 / 3 / 6 enchantmentów (i dla 4 wrogich) | **DONE (fala D)** — 70,2072 → 72,9 → 75,6 |
| **F2** Zombie Boa — `choose_color_grant_block_destroy` | aktywacja **dokładnie 0,0**; jedyne trafienie w kodzie to lista kumulacji | **DONE (fala C + audyt #162)** — wartość 1,5/4,5/9,0; decyzja wybiera faktycznie najlepszy kolor |
| **F7** Skyscythe Engulfer — `cantBeBlockedByKeywords: ['flying']` | delta **0** wobec kontrfaktyku (72,0 = 72,0) | **DONE (fala E)** — 78,309 vs 75,609 (+2,700) przy blokerze z flying |
| **F8** Ambulatory Edifice — ETB `requiresTarget` + `payLife` → `pump -1/-1` | delta **0** wobec kontrfaktyku (67,5 = 67,5) | **DONE (fala F + audyt #162)** — kierunek i koszt życia wycenione; bot nie płaci za szkodliwy wariant |

**Kontrole dodatnie (bez zmian, celowo):** F4 Bring to Trial (96,0 dla 4/4,
120,0 dla 8/8, cel 2/2 filtrowany), F5 Pacifism (76,5 wróg / −68,4 własny),
F9 Temple of Abandon, F10 Blinding Drone.

**Dwie obalone tezy — zapisane, żeby nikt ich nie powtórzył:**
- **F9 Temple of Abandon NIE jest defektem.** Wczesna sonda pokazała aktywację
  −4,0 nawet przy 5G + 6-mana zielonym w ręce, co wyglądało na brak modelu
  „odblokowania rzutu". Pomiar rozstrzygający: rzut 6G jest oferowany (72,0)
  BEZ jawnej aktywacji, czyli mana nietapniętego lądu jest już policzona
  w jednostkach (B54/s4008) i aktywacja jest redundancją. Zachowanie poprawne.
- **F10 Blinding Drone NIE jest defektem.** „Brak oferty" przy 5 many KOLOROWEJ
  jest poprawny — koszt to `{C}` (CR 107.4c), którego kolorowa mana nie opłaci.
  Z maną bezbarwną zdolność jest oferowana i wyceniona na +20,0.

**Rozjazdy L41 domknięte w tej pętli:**
- `instantSorceryGraveyardCount` (engine/permanents.js) — JEDEN licznik dla
  `effects.js` (rozstrzyganie, CR 608.2h) i heurystyki (wycena). Wcześniej
  silnik liczył inline, a bot wcale.
- `impulseLookValue` — czwarta ścieżka (cast_spell) dołączona do istniejących
  trzech (rozdziały sagi, fallback exploita, zdolność aktywowana).
- `cardCostReductionForView` — koszt efektywny po stronie widoku; silnik ma
  `effectiveSpellManaCost` na pełnym stanie (CR 601.2f), bot nie mógł go użyć,
  więc warunek affinity jest liczony równolegle na `zones.battlefield`.

**Testy:** `test/audyt-pmssb60-batch65.test.js` — 12 pinów (A1–A6, B1–B3,
D1–D3). RED→GREEN per fala: A/B razem 9/9 → 3/9 po zdjęciu gałęzi bota;
D 12/12 → 11/12 po zdjęciu samej redukcji. W każdym razie przechodzą wyłącznie
piny, które mają przechodzić zawsze (anty-over-fix, unit-test helpera, pin
zastanego modelu M237/4, kontrola ujemna).

**Bramki:** `npm test` 8017/8017, build 73 moduły / 5004,9 kB, `cr-numery --cr`
OK. 0 nowych pokręteł.

### Poprawka metody pomiaru (fale E–F)

Kontrfaktyki z pierwszego pomiaru były **nieważne**: `createHeuristicBot`
w sondzie i w `scoreOf` nie dostawał rejestru sceny, więc używał rejestru
domyślnego i `cardDef()` czytał PRAWDZIWE definicje kart. Kontrfaktyk
działał wyłącznie na obiekcie w widoku — każda reguła czytana z `def`
(właśnie `def.abilities`) widziała kartę pełną. Dowód: przy prowizorycznym
`score += 1000` wariant „pełny" i „bez statyki" dały identyczne 975,6.
Po przekazaniu rejestru (`state.__registry`) werdykty F1/F3/F6 się nie
zmieniły (tam decydowały efekty z obiektu), ale F7 i F8 tak:

| | werdykt PRZED (błędna metoda) | werdykt PO (rejestr przekazany) |
|---|---|---|
| F7 Skyscythe | delta 0 — „fix nie działa" | 78,309 vs 75,609, delta **+2,700** |
| F8 Ambulatory Edifice | delta 0 — „trigger niewyceniany" | 67,5 vs 70,2, delta **−2,7** |

### Fala E — selektywna ewazja (F7 Skyscythe Engulfer)

`hostEvadesBlockers` nie miało gałęzi `cantBeBlockedByKeywords`, choć
komentarz przy `cantBeBlockedByPower` obiecuje parzystość z
`combat.js:blockRestrictionError` (L41/L48). Reguła lustrzana: bloker nie
może blokować, gdy ma KTÓRYKOLWIEK z wymienionych keywordów, więc
atakujący omija wszystkich dopiero, gdy KAŻDY potencjalny bloker taki
keyword ma. Plus premia w `cast_permanent` przy `hasKeyword(def,'flying')`:
+3 gdy wszystkie wrogie blokery niosą zakazany keyword, +1,5 przy
częściowym pokryciu — ta sama jednostka co flying, nie nowa skala.
Brama `withKeyword > 0` to anty-over-fix.

POMIAR: wróg z flying 78,309 vs kontrfaktyk 75,609 (+2,700); wróg bez
keywordów 75,609 = 75,609; brak wrogich stworów 72,009 = 72,009.

### Fala F — kierunek pumpa w tabeli ETB (F8 Ambulatory Edifice)

Wpis `pump` w `ETB_EFFECT_BONUS` liczył P×2+T×1 bez względu na to, CZYJE
ciało rośnie. Trigger „target creature gets −1/−1" dawał (−1)×2+(−1) = −3,
czyli bot wyceniał OSŁABIENIE WROGA jako stratę własnego ciała. POMIAR
PRZED: płaskie 67,5 dla wroga 1/1 (który od tego pumpa ginie!), 5/5 i dla
pustego stołu wroga.

Po naprawie ujemny pump z wymaganiem celu idzie po kierunku: wróg
z legalnym celem = zysk na skali wpisu `damage` (3 za punkt, sufit 15 —
ta sama tabela, bez nowej skali); brak legalnego celu u wroga = 0; bez
wymagania celu stare zachowanie co do joty. POMIAR PO: 75,6036 wobec
kontrfaktyku 70,2036 (+5,4); pusty stół wroga 66,6036 = 66,6036; kontrola
znaku — pump +1/+1 daje 72,9036 (+2,7 = stary wzór), nie +5,4.

Koszt `trigger.payLife` (opcjonalne 2 życia) celowo poza zakresem: to luka
ogólnorepozytoryjna dla wszystkich pay-gated triggerów, już zapisana jako
forward „pay-trigger-net-model" przy `anticipatedDiesValue`. Zmierzono
`selfLifeLossPenalty(view, 2)` = 4 przy zdrowym życiu.

### Fala C — warunkowe zniszczenie blokera (F2 Zombie Boa)

Typ efektu `choose_color_grant_block_destroy` był obecny wyłącznie
w zbiorze efektów kumulujących się na stosie (l.1208) i nie miał gałęzi
w wycenie aktywacji — POMIAR PRZED: dokładnie 0,0 dla każdego układu
wroga. Nowy helper `blockDestroyColorValue`: bramka ataku (martwy atak
= 0, zasada M407) × NAJLEPSZA ofiara wśród wrogich blokerów danego koloru
(maksimum po kolorach, nie suma — wybór przy rozstrzyganiu, CR 608.2d) × ciało P×2+T×1 × 0,5 za
warunkowość (ta sama asumpcja likelihood-0,5 co `anticipatedDiesValue`).

POMIAR PO: wróg 1/1 = 1,5; 3/3 = 4,5; 6/6 = 9,0; 3/3 R + 3/3 G = 4,5
(maksimum, nie suma); pusty stół wroga = 0,0 — dokładnie wartość PRZED.

### Punkt M2 planu — rider Blitza: pomiar zamiast kodu

Plan zakładał, że `exile_if_dies_this_turn` jako rider czaru nie jest
wyceniany i że fala A dopisze dopłatę. Pomiar temu przeczy: pełny czar
96,0 wobec 45,0 bez ridera (+51), ale podstawienie za rider typu
NIEZNANEGO daje dokładnie te same 96,0. Czyli +51 to ucieczka od resetu
`if (isDamageOnly) score = -1;` (heuristic-bot.js:9226), nie wartość typu.
Dopisanie premii za typ byłoby podwójnym liczeniem — kod nietknięty,
zamiast tego pinezka A7 zabezpieczająca pomiar.

### Audyt zasięgu zmian (fale C/E/F dotknęły współdzielonego kodu)

„Testy przechodzą" znaczy tylko, że żadna pinezka nie pękła — nie że każda
dotknięta karta zachowuje się poprawnie. Dlatego zasięg każdej zmiany
zmierzono skanem całego rejestru (`REG.all()`), a nie grepem:

| Fala | Zmienione miejsce | Zasięg w card-data | Dowód |
|---|---|---|---|
| C | nowa gałąź efektu | **1 karta** (`choose_color_grant_block_destroy` = tylko Zombie Boa) | grep + pinezki C1–C3 |
| E | `hostEvadesBlockers` | **1 karta** (`cantBeBlockedByKeywords` = tylko Skyscythe) | grep + pinezki E1–E3 |
| F | wpis `pump` w `ETB_EFFECT_BONUS` | **2 karty** z ujemnym pump w triggerze: `ambulatory-edifice` i `silumgar-butcher` | skan + pin F4 |

Silumgar Butcher **nie** przechodzi przez `ETB_EFFECT_BONUS`: exploit
wycenia `anticipatedSacValue` własnym modelem (`exploitDebuff` + `killValue`),
a użytkownicy tabeli filtrują event na `enter_battlefield`/`dies`/`attacks`
i explicite `continue` przy `exploits` (heuristic-bot.js:2508). Zmierzono oba
warianty: **71,1027 z falą F i 71,1027 po jej cofnięciu** — pin F4 blokuje
przypadkowe rozszerzenie zasięgu.

### Model kosztu `trigger.payLife` (domknięcie forwarda)

Forward „pay-trigger-net-model", zapisany przy `anticipatedDiesValue` i
świadomie zostawiony poza zakresem fali F, został domknięty. Skan rejestru:
`trigger.payLife` noszą **dokładnie dwie karty** — `zoraline` (ETB + attacks)
i `ambulatory-edifice` (ETB), obie `payLife=2`. Tabela ETB nie zna typu
`pay_life`, więc `trigger.payLife` jest jedynym autorytatywnym polem kosztu
i naliczane jest raz.

`etbEnterBonusValue`: suma zdolności idzie do `sub`, a przy `trigger.payLife`
wynik = `max(0, sub − selfLifeLossPenalty(view, N))`. Podłoga 0 wynika z tego,
że płatność jest **opcjonalna** („you may pay") — gracz zapłaci tylko, gdy
efekt to przewyższa. Jednostka: wspólna drabina `selfLifeLossPenalty` (L48).

Pomiar (`selfLifeLossPenalty(view, 2)` = 4 przy zdrowym życiu, ×0,9
skalowania = 3,6):

| Przypadek | Efekt | Wartość | Zachowanie |
|---|---|---|---|
| Edifice, −1/−1 we wroga | 6 − 4 > 0 | brutto 75,6036 → netto **72,0036** (delta +1,8) | płaci |
| Edifice, wariant +1/+1 | 3 − 4 < 0 | 72,9036 → **70,2036** = kontrfaktyk | **nie płaci** |
| Zoraline (return z grobu) | 10 − 4 > 0 | 81,9036 → **78,3036** | płaci, decyzja o rzucie bez zmian |

**Testy (fale C/E/F + model kosztu):** 13 nowych pinów (C1–C3, E1–E3,
F1–F6) plus A7 — razem **25**. RED→GREEN per fala: C — 3/3 → 1/3 (C2 kotwica
0,0 z założenia); E — 3/3 → 2/3 (E2/E3 kontrole ujemne z założenia); F — po
cofnięciu naprawy kierunku F1/F2 czerwone, F3 zielona; po cofnięciu modelu
kosztu F1/F5/F6 czerwone, F2/F3/F4 zielone (izolowane od płatności).

**Bramki końcowe:** pełne B0 `run-tests.mjs all` **8291/8291**, `npm test`
8030/8030, build 73 moduły / 5010,6 kB, `cr-numery --cr` OK.
0 nowych pokręteł.

**Addendum — audyt PR #162.** Pin C1–C3 mierzył wartość samej aktywacji, ale
nie sprawdzał późniejszej komendy `resolve_color_choice`: bot wybierał pierwszy
kolor z listy zamiast koloru najcenniejszego blokera. Naprawa F-1 audytu
(`80de4c8`) współdzieli funkcję wartości z wyceną aktywacji, a nowy pin C4
wykonuje obie komendy i wymaga właściwego koloru. Zestaw PMSSB-60 ma odtąd
**26 pinów** (A 7 + B 3 + C 4 + D 3 + E 3 + F 6).

Dowody, wartości PRZED→PO i pełna macierz:
[plan PMSSB-60](plans/PLAN_2026-10-10c-pmssb60-batch65.md),
sonda `tools/pmssb60-batch65-sonda.mjs`.

## PMSSB-61 — jakościowe domknięcie batcha 66 (2026-10-13, PR #163)

Pełna pętla objęła 10/10 kart. Cztery mechaniki były już zamknięte przez
istniejące rodziny i dostały kontrole dodatnie: Sporecap Spider (reach), Foul
Orchard (tapped dual), Wild Celebrants (opcjonalny ETB removal) oraz Naturalize
(removal i kierunek celu). Sześć fal naprawiło siedem findingów na pozostałych
kartach; wszystkie reguły są generyczne po deskryptorach i stanie, bez nazw ani
`cardId` w heurystyce.

- **A — Warden/vigilance:** vigilant attacker pozostaje w prognozie gardy na
  crackback. PO: atak **21**; bez vigilance brak ataku **0 > −1**. Ręczna mana
  pozostaje poniżej auto-rzutu (**−4 vs 76**).
- **B — Cazur:** nazwany Partner ma wartość tylko, gdy znana własna talia może
  jeszcze zawierać cel; brak wiedzy zachowuje konserwatywną dawną wartość.
  Boardowy `any_combat_damage_to_player → add_counter` jest wyceniany na
  faktycznym źródle pewnych obrażeń. Talia bez Ukkimy **68,8536 vs 76,9536** z
  celem; atak `[Cazur,a]` **61 vs 19** bez triggera.
- **C — Lorescale/L41:** jeden `drawTriggeredCounterValue` obsługuje spell,
  ability, ETB, modal i optional trigger. Agreguje liczniki bez powtórzenia bazy
  M429 i odrzuca draw przeciwnika. Inspiration **33 vs 11**, Scholar
  **22 vs 4**, Rager **84,6018 vs 68,4018**.
- **D — Noble:** aktywowane `prevent_next_damage` używa tej samej
  `preventShieldValue` co czar. Bez zagrożenia **−73 < pass**, przy incoming
  damage **+11**, cel przeciwnika **−118**.
- **E — Rakish:** zdolność z ręki nie wpada już automatycznie do Cycling.
  Linkowany grant rozszerza profil jednej jednostki many i mierzy marginalne
  pokrycie pipów / odblokowany rzut, zamiast płaskiego +12. Swamp **17** >
  Forest/Plains **4** > cel wroga **−40**; wariant kosztu `{0}` jest dokładnie
  o 2 wyżej (**19/6/−38**), więc S11 liczy realny koszt raz.
- **F — Scythe Tiger:** wspólny `sacrificePermanentLoss` zasila anticipację
  castu i późniejszy wybór. Land płaci bazę 6, niedobór poniżej trzech źródeł i
  utratę potrzebnego koloru. 0/1/2 landy: **−39,5946** i pass; 3/5:
  **57,6054** i cast. Przy jednym landzie Tiger **32 > 26** land; przy trzech
  zbędny Swamp/Plains **34 > 32** Tiger **> 30** potrzebny Forest.

**Tie-audit:** projekcja `resolve_sacrifice_choice` niesie rodzaj i tę samą
wartość ofiary co scoring. Końcowe `--gry=40`: 480 partii, 262 368 decyzji;
dla ofiar 27 decyzji rozstrzygniętych + 74 remisy równoważne, **0
rozróżnialnych i 0 bez danych**. Pełna brama ujawniła też remis Awaken the Bear
z Coat with Venom przy wyniku 63 i koszcie 3 vs 1. Relacyjny tie-break między
różnymi kartami obniża tylko droższy dokładnie remisujący czar, nie daje premii
wariantowi słabszemu (M429), zachowuje cross-kind tie oraz historyczne tiery X
tej samej karty. Grzechotka remisów 3/3.

**Piny i bramy:** `test/audyt-pmssb61-batch66.test.js` **11/11**; fast
**8123/8123**; all **8388/8388**; batch 66 + dotknięte rodziny **95/95**; build
**74 moduły / 5102,4 kB**; kontrakty zdarzeń 0 naruszeń; generator 27 talii
idempotentny; druki 0 do pobrania; CR 522 unikalne numery / 5707 cytatów —
wszystkie istnieją. Snapshot bez dryfu: SHA-256 fixture i wyniku
`bedd4066bf87477c5e8aff4b24ff4a341f869a6114b34db6d903f41e2bd8ef9c`,
`overallHash` `1a891600236e83c301b3ebd267f3dbebc24b138112d51a22e27dd3a9c4ee5e32`.
Pełnego benchmarku B0 nie uruchamiano.

Pełne wartości PRZED→PO, zakres L41/S11/M429 i jawne granice:
[raport PMSSB-61](audits/PMSSB61_BATCH66_2026-10-13.md),
[plan](plans/PLAN_2026-10-13-pmssb61-batch66.md),
sonda `tools/pmssb61-batch66-sonda.mjs`.

## PMSSB-62 — jakościowe domknięcie batcha 67 (2026-10-15)

Pełna pętla M429 dla mechanik 10 kart batcha 67. Rodziny już zamknięte dostały
kontrole dodatnie: Cancel (kontry, PMSSB-5), Artful Maneuver + rebound
(pump/grant, M96/M173), Intrepid Tenderfoot (liczniki, PMSSB-23), Render
Speechless (odrzut PMSSB-6 + liczniki PMSSB-23), Spellkeeper Weird (zwroty
z grobu, PMSSB-36/58 — zmierzony i **przyjęty** jako PMSSB-36: zwrot instantu
z własnego grobu = 0,0000 i wybrana akcja, powyżej pass). Siedem findingów
naprawiono w trzech falach kodu; każdy ma pomiar PRZED→PO i pin.

- **B — energia (F4/F5):** jedna wartość licznika {E} dla całego bota
  (`P.energyCounterValue = 3`, dawna stała z PMSSB-56). Opcjonalna opłata
  `{E}{E}{E}` w `resolve_optional_pay_choice` dostała realny koszt — PRZED
  75,0000 vs 15,0000 IDENTYCZNIE dla wariantu płatnego i darmowego (kontrfakt);
  PO **66,0000** (darmowa nadal 75,0000). Bramka: w puli musi być ≥ koszt
  (ruling PIP 2024-11-08), więc trigger bez zasobu nie udaje darmowego.
  `get_energy` z `amountFrom: 'creatures_attacking_you'` liczone z widoku
  (`combat.attackers` + `defendingPlayerId`) tą samą stałą, także w tabeli ETB
  (dawny świadomy wyjątek E8 zdjęty). Antycypacja rzutu: 4 własne stwory,
  0 → 3 liczniki **72,9027 → 77,6277**.
- **C — obniżki (F2/F3):** `cardCostReductionForView` rozszerzone
  o `perCreatureAttackingYou`; `abilityManaCostForView` liczy koszt aktywowanej
  zdolności tak samo jak silnik (`effectiveAbilityManaCost`, wzorzec CR
  602.2b → 601.2f). Butcher 0/3/5 kart w grobie: **−3,0000 → 5,0000/8,0000/
  10,0000** (kontrfakt bez obniżki 5,0000 — dowód, że liczy się obniżka, nie
  baza); Sentry Bot 0/2/4 atakujących: **65,7027/76,5027/83,7027** (kontrfakt
  74,7027; przy dokładnie 3 manach oferta istnieje WYŁĄCZNIE z obniżką).
  „Each opponent loses N life" rozpoznawane po ZAKRESIE (`lose_life` +
  `scope: 'each_opponent'`), nie po typie — typ to tylko etykieta logu (M255/E5).
- **D — payoffy triggerów (F1/F6/F7):** `you_draw_second_card_each_turn`
  wyceniany tabelą triggerów-ogona, ale TYLKO przy DOWODZIE drugiego dobrania
  w widoku (sam nosiciel / rzucalna karta w ręce / własny permanent na stole) —
  bez dowodu wartość zostaje stara (**59,3964**), z dowodem **65,2464**.
  Rider `dies` → Food na tokenie Boara używa tej samej miary co ścieżka stwora
  (`anticipatedDiesValue`), a Food dostał bank życia (`tokenLifeBankValue`:
  drabina `gainLifeValue` minus koszt {2}); pod presją życia (8) **81,4400 vs
  79,9400** w kontrfakcie, przy pełnym życiu różnicy NIE MA — i to jest celowe
  (anty-over-fix). F7 awansowało z „kontroli dodatniej" na finding: battle cry
  (`buff_attacking_creatures`, CR 702.91a) wchodzi do wyceny DEKLARACJI ataku
  (`teamAttackPump` + `pumpedObject`); sonda rozstrzygająca (2/2 vs bloker 3/3)
  **−3,00 → 9,00**, kontrfakt bez battle cry −3,00.

**Piny i bramy:** `test/audyt-pmssb62-batch67.test.js` **12/12** (na kodzie
sprzed fali: **3/12** — dowód RED→GREEN); fast **8199/8199**; all **8458+**;
build; kontrakty zdarzeń 0 naruszeń; batch 67 kart 45/45. Golden-master:
dryf JEDNEJ partii (`dominaria-brg|mirrodin-wu@1000`, `scoreSum` −3,0000,
decyzje 315→314) — atrybucja wyłącznikami wskazała wyłącznie F1; fixture
zregenerowany świadomie jako tuning scoringu (nie refaktor), uzasadnienie
w planie. Pełne wartości i granice:
[raport PMSSB-62](audits/PMSSB62_BATCH67_2026-10-15.md),
[plan](plans/PLAN_2026-10-15-pmssb62-batch67.md),
sonda `tools/pmssb62-batch67-sonda.mjs`.

## PMSSB-63 — jakościowe domknięcie batcha 68 (2026-10-17) — W TOKU

Właściciel odrzucił wcześniejsze „zrobione” (płaska wycena, testy bez modelu stołu).
Pełna pętla M429 dla każdej rodziny batcha 68; numer PMSSB-63 (rejestr kończy się na PMSSB-62).
Raport: [raport PMSSB-63](audits/PMSSB63_BATCH68_2026-10-17.md). Plan:
[PLAN_2026-10-17d](plans/PLAN_2026-10-17d-pmssb63-batch68.md). Sondy: `tools/pmssb63-batch68-sonda.mjs` (Austere),
`tools/pmssb63-batch68-karty-sonda.mjs` (Raze, Secure), `tools/pmssb63-batch68-audyt-sonda.mjs` (wszystkie rodziny),
`tools/pmssb63-kw-sonda.mjs` (dowód otwartego ustalenia o słowach kluczowych).

**Zamknięte z poprawką (PRZED → PO):**
- Austere Command (`e48caff`): model stołu zamiast płaskich 75/90. PRZED 6/9 → PO 9/9.
- Raze to the Ground (`95fc359`): dobranie jak `draw_cards` z karą deck-outu. PRZED biblioteka 0 = rzut 80 → PO pass −46.
- Secure the Scene (`9ba8f8e`): wymiana ciał (karta + ciało − token − koszt many). PRZED 1/1 za token = rzut 67.95 → PO pass −2.05.
  Koszt many był nieaktywny (5 many 67.95 vs 2 many 67.98) — naprawione w tej samej wymianie.
- Kulrath Zealot, basic landcycling (`9ba8f8e`): wymiana karty na ląd tą samą miarą co szukanie. PRZED +2 → PO 33.

**Zamknięte bez zmiany (piny decyzji w `test/audyt-pmssb63-reszta.test.js`):**
- Stymied Hopes: kontra zależy od many wroga (`counterUnlessPaidOff`); tani czar wroga nie jest kontrowany.
- Neurok Invisimancer: ETB nie wybiera wrogiego stwora (wartość 0); ewazja liczy się przeciw blokerom.
- Meteorite: kill 2/1 w ETB +9; 2 obrażenia w twarz bez groźby ≈ 0 (akceptacja).
- Halo Scarab: bank many z cmentarza pass (M243/C) — potwierdzone przez właściciela 2026-10-18 (wariant A: zdjęte tylko w oknie end step przeciwnika, gdy wolne lądy pokrywają koszt).

**OTWARTE — osobne sesje, batch 68 NIE jest zamknięty:**
- **PMSSB-64 — Child of Night (lifelink): ZAMKNIĘTE (2026-10-17)** — [raport PMSSB-64](audits/PMSSB64_BATCH68_2026-10-17.md),
  plan [PLAN_2026-10-17e](plans/PLAN_2026-10-17e-pmssb64-kw.md). Child 64.80 → 66.60; lifelink/latanie/deathtouch/haste liczone.
- **PMSSB-65 — Bloodfire Expert (prowess): ZAMKNIĘTE (2026-10-17)** — [raport PMSSB-65](audits/PMSSB65_BATCH68_2026-10-17.md),
  plan [PLAN_2026-10-17f](plans/PLAN_2026-10-17f-pmssb65-prowess.md). Pomiar obalił wcześniejszą notatkę „67.05 z i bez”:
  płaska stała 1.35 niezależnie od ręki; teraz ze stanu (czary zagrywalne w następnej turze, lądy, bloki).
- **PMSSB-66 — okno many (end step przeciwnika): ZAMKNIĘTE (2026-10-17)** — [raport PMSSB-66](audits/PMSSB66_BATCH68_2026-10-17.md),
  plan [PLAN_2026-10-17g](plans/PLAN_2026-10-17g-pmssb66-okno-many.md). Zasada właściciela: mana w end step przeciwnika jest darmowa;
  generycznie dla `create_token` i `add_counter`. Crash `Brak kolorowej many` (seed 3035) USUNIĘTY: purpose w planerze kolorów + wybór
  koloru Skarbu/grantu po dopasowaniu. Lustro 3000: 159:161, 5000: 162:158, 9000: 163:157 (nieukończone 0).
  Ad 2 (właściciel): skutki licznikowe ŚMIERTELNE ASAP — zabójcze −1/−1 wroga (K1 −1 → +33) i ratunek +1/+1 przed
  śmiertelnym uszkodzeniem na stosie (K3 −19 → +15); wycena „skazanego" stwora nie zeruje licznika, który go ocala.
  Raport: sekcja „Ad 2" w [raporcie PMSSB-66](audits/PMSSB66_BATCH68_2026-10-17.md); piny `audyt-pmssb66-smiertelne-countery.test.js`.
- **PMSSB-67 — caveaty PMSSB-64 (F1–F4): ZAMKNIĘTE (2026-10-17)** — [raport PMSSB-67](audits/PMSSB67_KW_CAVEATY_2026-10-17.md),
  plan [PLAN_2026-10-17h](plans/PLAN_2026-10-17h-pmssb67-kw-caveaty.md). Cztery punkty z pełną pętlą:
  F1 masowe zaklęcia (`MASS_EVASION_KEYWORDS`): tylko pin, bez zmiany kodu (pomiar PRZED poprawny), `8cf0042`;
  F2 liczniki wejścia w wycenie rzutu (Necrosquito 62.55 → 70.05), `26cd540`;
  F3 przetrwanie lifelinku przy zabójcach na stole (`creatureKwLifelinkSurvivalFloor` 0.5), `493c30d`;
  F4 płaskie wagi 9 słów kluczowych → udział stanu (`floorShare`, `creatureKwStateFloor` 0.5), `21a5568`.
  Bramy na `21a5568`: `test:all` 8749/8749; build 0; `cr-numery` OK; lustro 3000 157:163, 5000 162:158, 9000 163:157 (nierozegrane 0).
  Golden master: fixture zregenerowany po dump diff (0 zmian wyboru). Otwarte: próg latania dla ciała o mocy 0 (rekomendacja: zostawić 3), w raporcie.
  **F5 (2026-10-18, decyzja właściciela „skalować próg do mocy"): ZAMKNIĘTE** — [raport F5](audits/PMSSB67_KW_CAVEATY_2026-10-17.md#f5--próg-latania-skalowany-mocą-2026-10-18-decyzja-właściciela),
  plan [PLAN_2026-10-18a](plans/PLAN_2026-10-18a-pmssb67-prog-latania.md). Próg latania = `creatureKwFlyingFloor · moc/3`
  (zablokowany lot = próg; odblokowany = max(próg, 8·moc/3)). Moc 0 → 0, moc 3 → bez zmian. Pokrętło `creatureKwFlyingFloorScaled`.
  Dump diff: 0 zmian wyboru. Lustro bez zmian (157:163 / 162:158 / 163:157).
- **Ad 3 (M243/C) — ROZSTRZYGNIĘTE (2026-10-18):** wariant A, już wdrożony. Kara zdjęta tylko w end stepie przeciwnika,
  gdy wolne lądy bota pokrywają koszt. Pin warunku: `test/audyt-pmssb67-okno-wolne-lady.test.js`.
- **L48 (atomowość płatności) — ZAMKNIĘTE przez właściciela (2026-10-18).** Pin nieudanej płatności kolorowej:
  `test/audyt-pmssb67-atomowosc-platnosci.test.js`. Końcowy `throw` po tapnięciach nie jest dowiedziony jako nieosiągalny; temat zamknięty.

Testy: `test/audyt-pmssb63-batch68.test.js` (18), `-karty` (5), `-secure` (8), `-kulrath` (7), `-reszta` (13).
Golden-master: bez dryfu. Bramki całego repo: patrz raport (`docs/audits/PMSSB63_BATCH68_2026-10-17.md`).

## PMSSB-64 — słowa kluczowe ciała w wycenie rzutu stworzenia (2026-10-17) — DONE

Pomiar PRZED (lifelink, haste, deathtouch Δ = 0; latanie płaskie +3 niezależnie od blokerów) i
audyt L41 (rzut, warp, adventure, planowanie). Wdrożenie: jedna funkcja `creatureKeywordValue`
(`heuristic-bot.js`), 14 kluczy `creatureKw*` (`heuristic-params.js`), skala mocą dla latania i
tempa, dolna granica latania 3 (bez inwersji), morph bez słów (CR 708.2a). Naprawa literówki
`'first strike'` → `'first_strike'` w `MASS_EVASION_KEYWORDS` (PMSSB-63).

Wyniki: golden master 11/1221 decyzji zmienia wynik, 0 zmienia wybór; lustro 543:417 (56.6 %,
n = 960, dwa zbiory seedów). Przepięte 23 asercje w 13 plikach, każda z przyczyną (Δ słowa).
Raport: [PMSSB64](audits/PMSSB64_BATCH68_2026-10-17.md). Ograniczenia (płaskie wagi, lifelink bez
blokerów, Necrosquito 0/0 z dolną granicą, brak pinu na MASS_EVASION) są w raporcie.
Testy: `test/audyt-pmssb64-keywords.test.js` (24). Sondy: `tools/pmssb64-keywords-sonda.mjs`,
lustro: `tools/pmssb64-mirror.mjs`.

## PMSSB-65 — prowess Bloodfire Experta w rzucie stworzenia (2026-10-17) — DONE

Pomiar PRZED: wyzwalacz `you_cast_noncreature_spell` (pump +1/+1) wyceniany płasko 1.35 niezależnie
od ręki (dwa Shocki = brak czarów = 67.05). Korekta własnej notatki: „67.05 z i bez” było błędne
(bez zdolności 65.70). Wdrożenie: `prowessCastValue` (`heuristic-bot.js`) — ta sama ścieżka co payoff
pumpu na stole (`temporaryPumpPayoff` × `boardPayoffWeight`), sumowana po czarach nie-stworzeniach
zagrywalnych w następnej turze (budżet many = lądy). Wyniki: 1 czar +1.8, 2 czary +3.6, brak czarów 0,
zero lądów 0, blokujący 2/2 +0.9. Pin Windscouta 70.1 → 68.7 (pusta ręka).

Ograniczenia: inne wyzwalacze tej rodziny (nie pump) zostają płaskie (osobna rodzina); mirror NIE
uruchomiony (żadna talia benchmarku nie ma karty; jest w `decks/tarkir-wur.txt`); golden master 6 partii
nie zawiera karty, więc 0 zmian nie dowodzi poprawki.
Raport: [PMSSB-65](audits/PMSSB65_BATCH68_2026-10-17.md). Testy: `test/audyt-pmssb65-prowess.test.js` (6).
Sonda: `tools/pmssb65-prowess-sonda.mjs`.

## PMSSB-66 — okno many: zdolność za manę o trwałym skutku w end step przeciwnika (2026-10-17) — DONE z luką

Zasada właściciela: mana wydana w end step PRZECIWNIKA jest darmowa (nasze lądy odtapowują się w naszym kroku),
więc zdolność za manę o trwałym skutku (`create_token`, `add_counter`: +1/+1, −1/−1, stun, oil) jest płacona w tym
oknie. Poza oknem i poza walką — odroczona (`score ≤ −koszt`). Rezerwa pod instant z ręki: najdroższy, który mieści
się w manie (`dd89af1`). Pokrętło `lastingManaWindowOn` (1/0).

Pomiar PRZED (sonda): Halo end-opp −11 pass (ma być aktywacja); +1/+1 w NASZEJ głównej +25 activate (błąd — ma być pass).
Pomiar PO: Halo end-opp +5; +1/+1 nasza główna −1; oil-stwór end-opp +10; walka przeciwnika bez odroczenia (+25).

Testy: `test/audyt-pmssb66-okno.test.js` (15). Golden master: 0 zmian w 1221 decyzjach — ale zrzut ma tylko 4 aktywacje
(brak dowodu). Bramki (`dd89af1`): `npm test` 8441/8441, `test:all` 8708/8708, build 0, `cr-numery` OK.

**Crash `Brak kolorowej many` (worek-mroczny, seed 3035) — USUNIĘTY.** Dwie przyczyny w planerze płatności (purpose
nie płynął do planu kolorów; wybór koloru Skarbu liczył per kolor zamiast po dopasowaniu). Test:
`test/audyt-pmssb66-brak-kolorowej-many.test.js` (2, oba padały przed poprawką). Szczegóły w raporcie.

Narzędzia: `tools/pmssb66-okno-many-sonda.mjs` (W1–W12), `tools/pmssb66-mirror.mjs` (okno vs off).

## PMSSB-68 — amass w wycenie ETB i rzutu (2026-10-20) — DONE

Plan: [PLAN_2026-10-20-pmssb68-amass](plans/PLAN_2026-10-20-pmssb68-amass.md). Pętla „kolejne pętle PMSSB" (ręczne strojenie scoringu, wybór mechaniki spoza rejestru). Rodzina: `amass` (2 karty w talii danych: Dunland Crebain — ETB `amass 2`; Toll of the Invasion — czar z `amass 1`; inwentarz `inv2`: 188 typów, 659 kart).

**Problem (PRZED).** Wycena `amass` była płaska i nie zależała od tego, czy jest armia: ETB = 6 (tabela ETB), rzut = 6+3N. Bez armii nowe ciało Army N/N jest warte `tokenBodyValue` = 10·N, a z armią licznik jest wyceniany jak `add_counter` (`counterHostValue`, PMSSB-23). Płaska wartość nie odpowiadała żadnemu z tych przypadków (L41: wspólna miara dla ETB i czaru).

**Wdrożenie.** Helper `amassValueOf(view, effect)` obok `counterEffectValue` w `src/controllers/heuristic-bot.js`: bez armii = ciało Army N/N (`tokenBodyValue`), z armią = licznik jak `add_counter`. Jedno miejsce wyceny dla tabeli ETB (`amass: (e, view) => amassValueOf(view, e)`) i ścieżki czaru (`score += amassValueOf(view, effect)`). Skali licznika nie zmieniano. Silnik i `heuristic-params.js` bez zmian (waga `cast_permanent` ×0.9 działa jak dotąd).

**Pomiar (sonda `tools/pmssb68-amass-sonda.mjs`, wyniki w `.arena/pmssb68-{przed,po}.txt`):**

| Karta / wariant | PRZED | PO |
|---|---|---|
| Dunland, ETB amass 2, bez armii | 73.4991 | 86.0991 |
| Dunland, armia 1/1 | 69.8991 | 78.8991 |
| Dunland, armia 3/3 | 69.8991 | 89.6991 |
| Toll, cast amass 1, bez armii | 59.0 | 60.0 |
| Toll, armia 1/1 | 59.0 | 62.0 |
| Toll, armia 3/3 | 59.0 | 74.0 |

Korekta oczekiwań: plan podawał Dunland 87.4991 bez wagi ×0.9 `cast_permanent`; poprawna wartość to 86.0991 (73.4991 − 5.4 + 18). Hipoteza „licznik na armii < nowe ciało” obalona pomiarem (armia 3/3 = 89.7 > bez armii 86.1; Toll armia 3/3 = 74 > 60) — nie powtarzać.

**Audyt (L41 i anty-over-fix).**
- (a) Wspólna miara: ETB i ścieżka czaru liczą przez `amassValueOf`; mutacja cofająca obie miejsca daje 4 czerwone testy, a ignorowanie armii 2 (`.arena/pmssb68-mut{1,2}.log`).
- (b) Wymiar kosztu czaru: koszt many nie był modyfikowany; zmienia się tylko wartość amass w ocenie rzutu.
- (c) Anty-over-fix: Dunland bez armii = flat 6 · 0.9 = 5.4 zastąpiony tokenem 2/2 (20) · 0.9 = 18. Nie jest to wzrost ponad uzasadnienie, bo odpowiada wycenie tokenu z L41. Toll bez armii: 9 → 10 (token 1/1), wzrost o 1.

**Testy.** `test/audyt-pmssb68-amass.test.js`, 6 testów F1–F4 + strażniki. RED przed wdrożeniem: 2 zielone / 4 czerwone (`.arena/pmssb68-red.log`); GREEN: 6/6 (`.arena/pmssb68-green.log`). Piny idą przez `chooseCommand`/`trace`, bo helper jest domknięciem `createHeuristicBot` (nie da się go importować).

**Przepięte asercje istniejących testów (zamierzona zmiana wartości, z przyczyną w komentarzu):**
- `test/pmssb6-discard-wave-a.test.js`: Toll vs reka-3 67 → 68 (F-A1); Toll vs pusta reka 59 → 60 (F-A2, „toll ratuje amass"). Różnica +1 = token 1/1 (10) zamiast flat 9. Zmierzone, nie zgadnięte.
- `test/audyt-bot-walka-remisy.test.js`: sufit remisów `attack` 7 → 9 ŚWIADOMIE. Porównanie `audytRemisow` na tych samych parach HEAD vs robocze: cztery nowe pozycje, wszystkie w `srodziemie|theros` seed 4010: t16 („+1 atak, +1 trafienie, +1 ginie" — klasa „+1 trafienie i +1 ginie"), t18/t20/t22 (wymiana 1 za 1 ex aequo z `attack[]` — klasa B). Żadna nowa klasa przeoczenia; przejrzane co do klasy zgodnie z nagłówkiem testu.

**Ewaluacja.**
- Golden master (`tools/bot-scoring-snapshot.mjs --dump`, 6 meczów, seedy 1000/1001): 0 różnic decyzji. Fixture nie regenerowana (cel procedury).
- Sparowany A/B (`tools/pmssb68-amass-ab.mjs`, HEAD vs robocze, talie srodziemie i ravnica, seedy 3000+, 80 partii): 5 partii z inną sekwencją decyzji obu stron, wygrane identyczne (p1 42 / p2 38 w obu drzewach). Kontrola robocze vs robocze: 0/80. Narzędzie zapisuje ślady obu graczy; pozycja pierwszej różnicy w logu jest orientacyjna (łączenie śladów nie jest chronologiczne), liczy się fakt rozbieżności.
- Mirror-eval (`tools/mirror-eval.mjs`) porównuje zestawy parametrów, nie kod; zmiana kodu wymaga A/B, więc mirror-eval nie był właściwym dowodem dla tej pętli.
- Tie-audit (`tools/bot-tie-audit.mjs --gry=12 --top=5`, PRZED → PO, `.arena/pmssb68-tie-{przed,po}.log`): decyzje z alternatywami 14025 → 14072 (+47, zmiana przebiegu w 5 partiach); remisy 3912 → 3928; GROZY `attack` 68 → 72 (ten sam powód; helper nie wycenia ataku, zmienia tylko obecność armii na stole). Bez nowych klas `block`/`cast_*`.
- Żywy Tester (`tools/table-tester`, `dist/mtg-table.html` po buildzie, człowiek srodziemie vs bot ravnica, seedy 11–13, 400 kroków): 3/3 zakończone, 0 `[STOP]`, 0 zgłoszeń detektorów. Amass wystąpił w grze w dwóch partiach (seedy 12 i 13: token „Zombie Army" 0/0 z licznikiem, walka i śmierć tokenu zgodne z zasadami tokenów).

**Bramy na `0f7b668`.** `npm test` 8525/8525 (po przepięciu pinów, przed podniesieniem sufitu remisów); po podniesieniu sufitu `npm run test:all` 8792/8792 (`.arena/pmssb68-test-all.log`); `npm run build` 0; `node tools/cr-numery.mjs --sprawdz` OK. Golden master bez dryfu.

**Stan i otwarte.** Pętla zamknięta dowodem (sonda PRZED/PO, RED→GREEN, mutacje, Żywy Tester, A/B 0/80 kontroli). Otwarte, poza zakresem: skala licznika `counterHostValue` (PMSSB-23) bez zmian; ewentualna cena rzutu Toll przy dużych armiach nie była badana w tej pętli.

## PMSSB-69 — inicjatywa (`take_initiative`) w wycenie bota (2026-10-20) — DONE

**Korekta 2026-10-21 (audyt PR #168/A-3):** F1 poniżej opisuje historyczny błąd
silnika i wyceny, nie regułę. CR 726.2 i 726.5 (2026-09-25): ponowne objęcie
inicjatywy przez jej posiadacza także uruchamia venture. W PR #169 naprawiono
silnik i bota; **obecnie bazowe 6 dostaje także posiadacz** (bez premii kradzieży
ani nowej kary ekspozycji). Tabela PRZED/PO i poniższe delty to historyczny
pomiar PMSSB-69 przed A-3, nie bieżące wyniki sondy. Aktualne piny:
`test/audyt-pr168-initiative.test.js` i `test/audyt-pmssb69-initiative.test.js`.

Plan: [PLAN_2026-10-20b-pmssb69-initiative](plans/PLAN_2026-10-20b-pmssb69-initiative.md). Rodzina z listy odrzuconej w PMSSB-68.
Karty: Underdark Explorer (5/3 menace, koszt 5), Stirring Bard (0/4 defender, koszt 4), Caves of Chaos Adventurer (5/3 trample, koszt 4) — ETB „you take the initiative”; wszystkie w talii `forgotten-realms`.

**Problem (PRZED).** Wycena ETB = stała **6** (`take_initiative: () => 6`), niezależnie od stanu. Pomiar `tools/pmssb69-initiative-sonda.mjs` (`.arena/pmssb69-przed.txt`): wynik nie zmienia się, gdy inicjatywę ma ja, wróg albo nikt, ani gdy wróg ma 0 czy 2 stwory (poza wspólną wyceną ciała stołu). Trzy konkretne błędy:
- **F1 (historyczny błąd, poprawiony A-3):** stary silnik nie uruchamiał venture u posiadacza (`changedHands === false`), a stary bot liczył 6. To niezgodne z CR; aktualny silnik venture'uje za każdym razem.
- **F2:** wróg ma inicjatywę → objęcie zabiera mu postęp i daje mój venture; bot nie widzi różnicy.
- **F3:** wróg ma atakujące stwory → zagrożenie odbiorem inicjatywy w jego turze; bot tego nie wycenia.

**Wdrożenie.** Helper `initiativeTakeValue(view, effect)` w `src/controllers/heuristic-bot.js` (obok `amassValueOf`), wpięty w tabelę ETB (`take_initiative: (e, view) => initiativeTakeValue(view, e)`). Pokrętła w `heuristic-params.js` (domyślne z uzasadnieniem):
- `initiativeStealBonus` = **6** (= `drawCardValue`: jedna venture ≈ jedna dobrana karta; dopłata za objęcie od wroga),
- `initiativeExposurePenalty` = **2** za każdy stwór wroga bez defendera z mocą > 0 (≈ 1/3 venture na atakującego),
- `initiativeExposureCap` = **6** (kara nie schodzi poniżej 0 składnika ETB).

Historyczny składnik ETB PMSSB-69: `0` gdy już posiadam; inaczej `max(0, 6 + steal − min(cap, n·pen))`, gdzie `steal` = 6 tylko gdy posiada wróg. **Obecnie: 6 dla aktualnego posiadacza** (venture bez nowej ekspozycji), w innych stanach ta sama formuła. Cena many bez zmian (wymiar kosztu, kontrola (b)).

**Pomiar PO (`.arena/pmssb69-po.txt`), wynik w skali `cast_permanent` (waga ×0.9):**

| Karta | nikt, wróg 0 | nikt, wróg 2 | ja, wróg 0 | wróg inic., wróg 0 | wróg inic., wróg 2 |
|---|---|---|---|---|---|
| Underdark Explorer | 79.2063 (=) | 81.6813 → 78.0813 | 79.2063 → 73.8063 | 79.2063 → 84.6063 | 81.6813 → 83.4813 |
| Stirring Bard | 67.4991 (=) | 71.0991 → 67.4991 | 67.4991 → 62.0991 | 67.4991 → 72.8991 | 71.0991 → 72.8991 |
| Caves of Chaos Adv. | 78.4572 (=) | 82.2822 → 78.6822 | 78.4572 → 73.0572 | 78.4572 → 83.8572 | 82.2822 → 84.0822 |

Historyczne delty PMSSB-69 wynikają z trzech składników (F1: −6·0.9 — obalone i poprawione w A-3; F2: +6·0.9; F3: −min(6, 2n)·0.9); wycena ciała stołu (wspólna dla wszystkich wariantów) nie zmieniona.

**Audyt (L41 i anty-over-fix).**
- (a) L41: ETB `take_initiative` ma jedno miejsce wyceny (tabela ETB); ścieżka czaru z ETB korzysta z tej samej funkcji. Historyczny pin F1 dawał deltę „ja − nikt” = −5.4; po A-3 aktualny pin wymaga **0** dla wszystkich trzech kart (bez nowej ekspozycji).
- (b) Wymiar kosztu: koszt many karty bez zmian; zmienia się tylko składnik inicjatywy.
- (c) Anty-over-fix: najsłabszy realny wariant (nikt nie ma inicjatywy, wróg bez stworów) = **dawne 6** (pin: 79.2063 bez zmiany). Kara i dopłata to wyłącznie dodatki/kary w wariantach z realnym ryzykiem lub zyskiem.

**Testy historycznej pętli.** `test/audyt-pmssb69-initiative.test.js` — 8 testów. RED przed wdrożeniem: 1/8 zielony (kotwica anty-over-fix), 7 czerwonych (`.arena/pmssb69-red.log`). GREEN wtedy: 8/8 (`.arena/pmssb69-green.log`). Mutacje wtedy: usunięcie F1 → 2 czerwone; zerowa kara (F3) → 3 czerwone; zerowa dopłata (F2) → 2 czerwone. Po A-3 dwa piny F1 zostały skorygowane według CR, bo pierwotne oczekiwanie −5.4 było błędne. Pokrętła ×0 przywracają wycenę sprzed PMSSB-69. Asercje używają wagi 0.9 (jak PMSSB-68; pierwsza wersja testów pominęła ją i została poprawiona na podstawie pomiaru, nie wyniku bota).

**Ewaluacja.**
- Golden master (`tools/bot-scoring-snapshot.mjs --dump`, 6 meczów, seedy 1000/1001): 0 różnic. Uwaga: żadna z talii tego zestawu nie ma kart z inicjatywą, więc golden master nie jest dowodem dla tej rodziny; dowodem jest A/B.
- Sparowany A/B (`tools/pmssb69-initiative-ab.mjs`, HEAD `ce691b5` vs robocze, 40 seedów na talię): `forgotten-realms` — **11/40 partii z inną sekwencją decyzji**; kontrola `srodziemie` (bez `take_initiative`) — **0/40**. Wygrane identyczne w obu drzewach (p1 41 / p2 39). Kontrola robocze vs robocze: 0/80.
- Tie-audit (`tools/bot-tie-audit.mjs --gry=12 --top=5`): decyzje z alternatywami 14072 → 14074 (+2: `activate_ability` +1, `cast_permanent` +1); remisy 3928 → 3928; lista GROZY identyczna (`.arena/pmssb69-tie-{przed,po}.log`).
- Żywy Tester (`tools/table-tester`, build po zmianie, `forgotten-realms` vs `srodziemie`, seedy 11–13, 400 kroków): 3/3 zakończone, 0 `[STOP]`, 0 zgłoszeń detektorów. Inicjatywa w grze po obu stronach (objęcie przez gracza i przez przeciwnika, wejście do Podziemi).

**Bramy na `d340c73`.** `npm test` 8533/8533; `npm run test:all` 8800/8800 (`.arena/pmssb69-test-all.log`); build 0; `cr-numery --sprawdz` OK.

**Otwarte (poza zakresem tej pętli).**
- F2 w walce: bot nie planuje ataku, by odebrać inicjatywę (kradzież przy obrażeniach, `triggers.js` ~3122). Kandydat na osobną pętlę, bez pomiaru.
- Wartość venture jest stałą na turę (nie modelujemy konkretnych pokoi Podziemi).
- Ryzyko F3 nie uwzględnia moich blokerów (konserwatywnie: każdy atakujący liczy się w pełni); pokrętło `initiativeExposurePenalty` pozwala to skorygować po przeglądzie.

## PMSSB-70 — nieopłacona wymiana w deklaracji ataku (2026-10-20) — DONE

Plan: [PLAN_2026-10-20d-pmssb70-nieoplacona-wymiana](plans/PLAN_2026-10-20d-pmssb70-nieoplacona-wymiana.md). Źródło: zgłoszenie właściciela z audytu remisów PR #168 (`ravnica-wub|innistrad-wu` s4011 t26): remis ex aequo 1033 = 1033 między `attack[81,91,108]` (A) i tym samym zestawem z tokenem (B). Właściciel: bot ma wybierać A; wybór B kosztuje stwora i nic nie daje.

**Problem (PRZED, `.arena/pmssb70-przed-probe.log`).** Wycena ataku sumuje wartości per atakujący, a każdy zakłada zabicie TEGO SAMEGO jedynego blokera. Trzy atakujące „przeżywają i zabijają” blokera (81 = 5, 91 = 4, 108 = 4). Token 1/1 idzie w gałąź wymiany (`power − 1` = 0): w projekcji zestawu ginie, zabici nie rośnie. Wycena dokłada więc 0 za stwora, który nic nie daje.

**Wdrożenie.** `src/controllers/heuristic-bot.js`, `case 'declare_attackers'`: licznik `survivorKillers` (gałęzie „przeżyje i zabija” oraz `killsBeforeBlockerStrikes`) i lista `tradeValues` (gałąź wymiany). Po pętli: wolne sloty = `max(0, blokery − survivorKillers)`; wymiany ponad wolne sloty (od najcenniejszej) dostają `−unpaidTradeLoss` zamiast swojej wartości. **Kara tylko gdy `survivorKillers ≥ 1`** (rewizja, niżej). Pokrętła w `heuristic-params.js`: `unpaidTradeEnabled` (1; 0 = dawna wycena), `unpaidTradeLoss` (2 — jak kara jałowego ataku).

**Rewizja zakresu (z dowodem).** Wersja bez warunku `survivorKillers ≥ 1` złamała pin PMSSB-59/B-kontrola: pompa Duo wyszła +3 zamiast −1. Sonda: zestaw `[duo, mine]` — dwie wymiany wobec jednego blokera bez przeżywającego — spadał z 2 do 0, a bramka `attackIntendsCreature` przełączała się i zmieniała wycenę pompy. To inny mechanizm (blokujący zablokuje jedną wymianę, druga przejdzie w twarz), więc zakres zawężono do przypadku właściciela. Pin F7 (battle cry) przeniesiono na scenę z dwoma blokerami, bo z jednym Ringleader zabija blokera sam i drugi atakujący jest zbędny — to ta sama klasa co s4011.

**Testy.** `test/audyt-pmssb70-nieoplacona-wymiana.test.js` — 5 testów: A (RED: przed wdrożeniem A = B = 33; po: A ściśle wyżej), K1 (wymiana w wolnym slocie bez kary: 5), K2 (kontrola PMSSB-33/A1: 1/1 za 1/1 = 0), P (pokrętło `unpaidTradeEnabled = 0` przywraca remis), G (granica: dwie wymiany bez przeżywającego = dawna suma). Pin F7 przeniesiony (scena z dwoma blokerami). GREEN: 5/5 (`.arena/pmssb70-green5.log`).

**Ewaluacja.**
- Golden master: 2 z 6 partii zmienione (`ravnica-wub|innistrad-wu` s1000 t16 `[54,75]` → `[54]`; `dominaria-brg|mirrodin-wu` s1001 t15 `[26,token-61]` → `[26]`). Oba przypadki: wymiana po przeżywającym, projekcja bez nowego zabójstwa. Fixture **zregenerowany po przeglądzie** (`.arena/pmssb70-golden-write.log`); przełącznik 0 odtwarza stary hash bit w bit.
- Tie-audit (`--gry=1`, baseline = przełącznik 0): `attack` akcyjne 14 → 11; `block` 10 → 9; `cast_spell` 6 → 7 (remis identycznych tokenów w zmienionej trajektorii, nie kara). Łącznie 114 → 111. s4011 t26 zniknął z remisów.
- Mirror-eval (24 seedy, 288 partii, kandydat domyślny vs `unpaidTradeEnabled: 0`): **143 : 145, win-rate 0,4965** — neutralnie (wersja bez zawężenia 142 : 146). Nie ma dowodu poprawy siły w lustrze; jest dowód braku regresji.
- Żywy Tester (`tools/table-tester`, build po zmianie): ravnica-wub vs innistrad-wu i dominaria-brg vs mirrodin-wu, seedy 11–13, 400 kroków: 6/6 do końca partii, rc 0, 0 `[STOP]`, 0 zgłoszeń detektorów.

**Bramy.** `npm test` 8566/8566 (`.arena/pmssb70-npmtest2.log`); build exit 0; `test:all` 8833/8833 (`.arena/pmssb70-testall.log`).

**Otwarte (poza zakresem).**
- Dwie wymiany wobec jednego blokera BEZ przeżywającego (PMSSB-59 duo): dawna wycena; osobna rodzina, wymaga pomiaru po stronie blokera.
- Pożyczony stwór (`tempControlUntilEOT`) zabijający najsilniejszego blokera nie jest liczony jako przeżywający zabójca (gałąź wartości dla właściciela).

## PMSSB-71 — riot i NaN w wycenie rzutu (2026-10-20) — DONE

**Korekta 2026-10-21 (audyt PR #168/A-2):** CR 702.136a — wybór riot
przed wejściem jest efektem zastępującym, nie triggerem po wejściu.
Pierwotne sondy PMSSB-71 i ich wynik scoringowy zakładały błędną ścieżkę
`resolve_modal_choice`; obecnie `resolve_riot_choice` zatrzymuje wejście
przed ETB/SBA. Nadal wyceniamy ten sam wybór (haste kontra licznik), lecz
historyczne wyniki poniżej nie są dowodem poprawnego czasu decyzji.
Piny: `test/audyt-pr168-riot.test.js`, `test/audyt-pmssb71-riot.test.js`.

Plan: [PLAN_2026-10-20e-pmssb71-riot](plans/PLAN_2026-10-20e-pmssb71-riot.md). Kolejność z `docs/PMSSB.md`: plan → pomiar PRZED → audyt → RED → GREEN → ewaluacja → dokumentacja.

**Pomiar PRZED (sonda `.arena/probe-riot.mjs`, `.arena/pmssb71-legal.mjs`, `.arena/pmssb71-score.mjs`, prawdziwy silnik).** Gruul Beastmaster był legalny do rzutu w 87 krokach gry, a bot NIGDY go nie zagrał (0 z 480 partii lustrzanych). Wycena rzutu wynosiła `NaN`. Dwa niezależne defekty:

- **F0 — NaN (przyczyna główna).** Wpis `ETB_EFFECT_BONUS.pump` czytał `e.power` jako liczbę. Trigger ataku Beastmastera ma pompę `power: 'source_power'` (tekst), więc `'source_power' * 2 = NaN`. NaN wchodził przez `anticipatedAttacksValue` do `score`, a sortowanie `scored.sort((a, b) => b.score - a.score)` przy NaN daje niespójny komparator. Pomiar na bazie (`.arena/pmssb71-nan-mech.mjs`): w 258 krokach z NaN w ofertach bot wybrał coś innego niż najlepsza skończona oferta w 15 przypadkach. Po F0: 0 kroków z NaN, 0 złych wyborów.
- **F1 — tryb haste wyceniany 0.** `grant_keyword_permanent` nie miał wpisu w `ETB_EFFECT_BONUS`. Poprawka: tryb haste wycenia `creatureKeywordValue` dla słowa `haste` i mocy ciała (ta sama funkcja co rzut stworzenia z tym słowem; L41). Dla mocy 2: `creatureKwHaste · 2/3 = 4`.
- **F2 — licznik +1/+1 stałą 5.** Tryb licznika na SAMYM sobie wyceniany jest wartością ciała: `creaturePowerWeight + creatureToughnessWeight = 3`. Zmiana tylko w gałęzi `modalModeValue` (tryby modalne). Globalna stała `add_counter` = 5 dla ścieżki ETB bez trybów zostaje — współdzielona przez wiele kart, poza zakresem (patrz „Otwarte”).

**Wdrożenie.** `src/controllers/heuristic-bot.js`: `pump` (F0, rozwiązanie `source_power` względem `def`; nierozpoznany deskryptor = 0), `modalModeValue` (F1, F2). `heuristic-params.js` bez zmian (używa `creatureKwHaste`, `creaturePowerWeight`, `creatureToughnessWeight`).

**Testy.** `test/audyt-pmssb71-riot.test.js` — 6 testów: letal → haste (RED→GREEN); parytet L41 (`haste = 10 + 4`, `licznik = 10 + 3`); pokrętło `creatureKwHaste = 0` → licznik; bloker 4/4 nie odwraca wyboru bez letalu; F0 RED: wycena rzutu skończona; F0 RED: bot wybiera rzut z ręki. **Mutacje** (każda wykryta): haste = 0 → 3 porażki; licznik = 5 → 3 porażki; bez F0 → 2 porażki.

**Ewaluacja.**

- Golden master (`tools/bot-scoring-snapshot.mjs`): hash `7510ba436292c802…` BEZ zmian, bez regeneracji (partie snapshotu nie zawierają Beastmastera).
- Tie-audit (`--gry=40`, 480 partii): tabela per rodzaj i suma (`tie_top 12767`) IDENTYCZNE przed i po. Zastrzeżenie: zestaw benchmarku nie zawiera talii `ravnica-rg`, więc riot nie wchodzi do tego pomiaru.
- Sparowany A/B kodu (`.arena/pmssb71-ab.mjs`, baza `a1c0576` vs bieżący, te same seedy i talie, 120 seedów × 4 pary = 480 partii): **380 partii się różni**, riot wystąpił w 378 (baza: 0). Lustro `ravnica-rg|ravnica-rg`: 67 → 66 wygranych p1 (neutralnie). Pary rg vs inna talia (360 partii, rg po stronie z Beastmasterem): wygrane rg **93 → 130**; McNemar: **46 zysków, 9 strat, chi-kwadrat = 23,6**. To NIE jest neutralny wynik lustra: to skutek naprawy defektu (karta zaczęła być grana i ustały złe wybory przez NaN). Nie traktować jako dowodu „siły” Beastmastera — jest to pomiar wpływu naprawy.
- Żywy Tester (`tools/table-tester`, build po zmianie, `--human ravnica-rg --bot ravnica-wub`, seedy 11–13, 400 kroków): 3/3 rc 0, 0 `[STOP]`, `zgłoszeń detektorów: 0`. W seedach 12 i 13 modal „wybierz tryb: Riot: +1/+1 counter / Riot: haste” pojawił się w UI, a Beastmaster wszedł na pole.

**Bramy.** `test:all` 8839/8839 exit 0 (`.arena/pmssb71-testall-final.log`); build exit 0 (74 moduły, 5271,8 kB); `npm test` w ramach `test:all`.

**Otwarte (poza zakresem; do decyzji właściciela, nie zmieniane tutaj).**

- ~~Wybór: bot wybiera tryb haste we WSZYSTKICH scenach riot (14 wobec 13)…~~ **ZAMKNIĘTE w PMSSB-71 v2 (`docs/plans/PLAN_2026-10-20g-pmssb71-v2-riot-kontekst.md`):** wybór zależy od kontekstu (faza, blokery, moje stwory, presja, letal), nie od stałej.
- Globalna stała `add_counter` bez celu = 5 w ścieżce ETB bez trybów: **do ustalenia w osobnej pętli PMSSB** (ta sama stała dotyka wielu kart; decyzja kontekstowa, nie pojedyncza wartość).
- Brak pinu „pompa liczbowa daje nadal 2p+t” jako osobnego testu; pokrywa to pośrednio test F0 (dwa testy RED) i wycena trybu (parytet).
- Ogólny strażnik NaN w `scored` nie został dodany; wybór filtruje tylko `Number.isFinite` przy pick, a sort nadal widzi NaN. Warto rozważyć ogólny bezpiecznik (osobna decyzja).

## Luka convoke (batch 69) — NAPRAWIONA w PMSSB-72 (2026-10-20)

Luka była w silniku gry, nie w dokumentacji: `legalCommands` nie tworzyło wariantów convoke, więc Kavu z 2 manami i dwoma stworami miał 0 ofert (sonda `.arena/probe-convoke.mjs`), a test batcha 69 wołał `execute` ręcznie. Naprawa: §PMSSB-72.

## PMSSB-72 — convoke (2026-10-20) — DONE

**Korekta po audycie #168/A-12 (2026-10-21):** dotychczasowa „minimalność”
była ograniczeniem UI, nie regułą CR 702.51a. Nawet mając 4 dostępne many,
gracz może zapłacić np. {G} Kavu tapnięciem stwora i zachować zieloną manę
na kolejny czar; może też zapłacić cały koszt czterema stworami. Obecnie
oferta pokazuje te warianty (deterministyczny limit 64 pozostał), a zwykły
rzut bez convoke wciąż jest dostępny. Stare pomiary i pin „bez wariantu przy
wystarczającej manie” niżej są historyczne; test PMSSB-72 ma poprawioną
asercję. Granica: limit 64 na dużym stole nadal pomija niektóre legalne
podzbiory, nie traktować go jako reguły gry. Golden `--dump` przed/po:
5 zapisów decyzji z dodatkowymi ofertami (4 + 1), **0 zmian wybranych
ruchów i ich ocen** (3 linie fixture: hash całości + 2 partie). Fixture
zregenerowany po przeglądzie, bez zmiany seedów, liczby decyzji i progów.

Plan: `docs/plans/PLAN_2026-10-20f-pmssb72-convoke.md` (uwaga o kolejności: kod powstał przed planem).

- Pomiar PRZED: 2 many + 2 stwory → 0 ofert `cast_permanent(kav)`; 4 many → 1 oferta bez convoke.
- Audyt: (a) wspólna reguła generatora i walidacji `castPermanent`; (b) wymiar kosztu: mana = koszt − stwory, kara za tapnięcie = `convokeTapPenalty` × (moc + wytrzymałość)/4 (2/2 = 4); (c) minimalność: zbędny stwór nie tapuje się.
- Wdrożenie: `resources.js` (`convokePaymentVariants`), `game-state.js` (oferty, także kicked), `heuristic-params.js` (pokrętło), `heuristic-bot.js` (wycena), `render.js`/`main.js` (grupa i etykieta), `mana-wizard.js` (reszta many).
- RED→GREEN: na kodzie sprzed zmiany 5 z 8 testów czerwonych (oferty, kicked, kreator, bot); pin „najmniejsze ciało” wykrywa mutację płaskiej kary (czerwony przy `body = 4`).
- Remis wariantów: płaska kara dawała 9 identycznych opcji (`cast_permanent(drawn-79)` 57,6); po zmianie wycena różnicuje stwory. Pozostały remis to warianty tego samego stwora z innym kolorem pipa — wycena bota jest celowo ślepa na kolor pipów (jak dotąd).
- Golden: hash `7510ba436292c802…` → `9017a46b8bf6298d…`. Przegląd przed regeneracją (`--dump`): 1437 decyzji w 6 partiach, **0 zmienionych wyborów i wyników**; zmiana to tylko dopisane opcje convoke w zapisie. Regeneracja `tools/bot-scoring-snapshot.mjs --write`: zmienione 3 linie fixture (hash ogólny + 2 partie). Progi i seedy testu NIE zmienione.
- Bramy: `test:all` 8848/8848, exit 0; build 0.

## PMSSB-71 v2 — riot kontekstowy (2026-10-20) — DONE

Plan: [PLAN_2026-10-20g-pmssb71-v2-riot-kontekst](plans/PLAN_2026-10-20g-pmssb71-v2-riot-kontekst.md).

- Pomiar PRZED (`.arena/probe-riot-ctx.mjs`, `.arena/pmssb71v2-pre.txt`): 64 sytuacje, zawsze pośpiech 14 vs licznik 13.
- Wdrożenie: pośpiech = atak tej tury (moja tura, `main1`/`beginning_of_combat`), udział niezablokowany z blokerami wroga pomniejszonymi o moje świeże stwory, bonus za letal; licznik = ciało + presja (siła ataku wroga / moje życie).
- Wynik: wybór zależy od kontekstu. Po walce → licznik. Pod presją → licznik. Dwóch blokerów bez moich stworów → licznik. Pusty stół przed walką → pośpiech.
- RED: 3 piny kontekstowe padają na kodzie sprzed zmiany; anti-over-fix przechodzą przed i po.
- Bramy: `npm test` 8586/8586; `test:all` 8853/8853 (golden bez zmian).
- A/B (talie `ravnica-rg` vs `ravnica-wub`, 40 seedów, 80 partii): 23 partie z rozjechanymi decyzjami; zwycięzcy bez zmian (p1 36/44). Nie dowodzi poprawy siły. Do potwierdzenia większą próbą.

## PMSSB-71 v3 — licznik +1/+1 na sobie zamiast stałej 5 (2026-10-20) — DONE

Plan: [PLAN_2026-10-20h-pmssb71-v3-licznik](plans/PLAN_2026-10-20h-pmssb71-v3-licznik.md).

- Pomiar PRZED (`.arena/probe-counter-nsh.mjs`, `.arena/pmssb71v3-pre.txt`): Nightshade Harvester wyceniany stale 69,57 przy każdym życiu i każdej fazie. Karta testowa to Nightshade, bo Oreplate Pangolin ma `another` (nie reaguje na własny rzut).
- Wdrożenie: licznik +1/+1 bez celu na sobie wyceniany przez wspólną funkcję `counterValue` (riot i ETB/wyzwalacze): ciało 3 za licznik + `counterPressureWeight` (6) × presja + `counterBoardWeight` (2) × przewaga liczebna wroga. Pokrętła w `heuristic-params.js`; `riotCounterPressureWeight` przemianowane na `counterPressureWeight`.
- Wynik: presja i przewaga wroga są widoczne w wycenie (życie 5 vs 20 przy wrogu 3×4: 76,95 vs 75,44). Neutralny stół: 69,57 → 68,31 (licznik 3 zamiast 5). Faza nie zmienia tych wyzwalaczy.
- Testy: 4 w `test/audyt-pmssb71v3-licznik.test.js` (presja: RED na HEAD; przewaga: pin, nie RED; neutralny: pin; pokrętła = 0 wyłączają kontekst). Trzy stare piny przepisane z powodem: `pmssb10-ogon-wave-a` (69,6 → 68,3), `pmssb10-ogon-wave-b2` (+2,25 → +1,35), `pmssb3-draw-wave-b` (72,9054 → 71,1054).
- Bramy: `npm test` 8589/8589; `test:all` 8856/8856; golden bez zmian hasha (zastrzeżenie: talie golden nie zawierają tych kart w ścieżce).
- Tie-audit (`--gry=40`, 480 partii, baza HEAD `c8f3a96`): `tie_top` 12758 → 12755; akcyjne 3460 → 3459. Zestaw benchmarku nie zawiera talii z tymi kartami.
- A/B 80 partii (`wiedzmin-bg` i `the-edge`, 40 seedów): 10 rozjechanych decyzji; zwycięzcy p1 36 → 37, p2 44 → 43. Nie stwierdzono poprawy siły.
- Nie zrobiono: osobny Żywy Tester (A/B obejmuje partie z kartami); mirror-eval (nie dotyczy kodu).
- Otwarte: faza tury dla tych wyzwalaczy (obecnie bez wpływu); liczniki bez celu inne niż +1/+1 (quest, stun) zostają przy 5.

## PMSSB-73 — myriad (Gnoll War Band) (2026-10-20) — ZAMKNIĘTE BEZ ZMIANY

Plan: [PLAN_2026-10-20i-pmssb73-myriad](plans/PLAN_2026-10-20i-pmssb73-myriad.md).

- Pomiar (`.arena/probe-myriad.mjs`): atak Gnolla w 1v1 — wycena `attack[g]` 16 z myriad i 16 bez triggera; obiekty na polu 1 → 1 (brak tokenów); stos pusty. Warunek triggera `anotherOpponentExists` = `players.length > 2` (`src/engine/triggers.js`), a format to 1v1 (ADR 0022, `docs/PRODUCT.md`).
- Audyt: (a) L41 — bot nie ma wpisu dla myriad i nie musi (efekt w 1v1 nie istnieje); (b) wymiar kosztu — brak; (c) anty-over-fix — nie ma czego poprawiać, zmiana kodu byłaby sztuczna.
- Test: `test/audyt-pmssb73-myriad.test.js` (3): wycena ataku z i bez triggera równa; atak bez tokenów i bez zmiany życia wroga; pin treści triggera (`effect: []`, warunek wieloosobowy). Mutacja efektu na `lose_life` łapie tylko pin 3 — to mutant równoważny w 1v1, bo trigger nie trafia na stos.
- Bramy: `npm test` 8593/8593 (`.arena/pmssb73-npmtest.log`). Bez zmiany kodu produkcyjnego `test:all` nie uruchamiano; golden i tie-audit bez zmian z definicji.
- Zakres: format 1v1. Gdyby projekt wszedł w multiplayer, efekt myriad (tokeny za innych przeciwników) byłby do zaimplementowania — dziś to nie jest luka wobec 1v1, zapisane jako otwarte poza zakresem.

## PMSSB-74 — Bloodfire Infusion: obrażenia równe mocy poświęconego (2026-10-20) — DONE

Plan: [PLAN_2026-10-20j-pmssb74-bloodfire](plans/PLAN_2026-10-20j-pmssb74-bloodfire.md).

- Pomiar PRZED (`.arena/probe-bloodfire.mjs`): aktywacja wyceniona płasko 2 w każdej scenie (także bez wrogich stworów), więc bot poświęcał własnego stwora 2/3 z aurą za nic i wymieniał 2/3 na 1/1. Przyczyna: pętla kosztów znała `sacrificeSelf` i `sacrificeCreature`, a Bloodfire ma `sacrificeEnchantedHost`.
- Audyt: (a) L41 — zamiatanie dostaje wspólną miarę `sweepHitsValue` (wyciągniętą z `massDestroyValue` bez zmiany liczb); (b) koszt poświęcenia — ta sama jednostka co własna strata w zamiataniu (`massDestroyCardValue + worth`) × `massDestroyOwnMultiplier` × odbudowa; (c) anty-over-fix — gałąź dotyczy tylko tego typu efektu.
- Wdrożenie: `damageEachSacrificedValue(view, aura)` w `heuristic-bot.js`; wywołane w `case 'activate_ability'` przed pętlą efektów. Brak nowych pokręteł; składnik presji idzie przez istniejące `massDestroyThreatWeight`.
- Wynik: bez wrogów −17 → pass; jeden wróg 1/1 −7 → pass; dwóch wrogów 1/1 +4 → aktywacja; pod presją (życie 5) +7; moje stwory giną → wartość ujemna.
- RED: testy 1, 2, 4 czerwone na HEAD; 5 (własna strata) też; 3 i 6 to piny zachowania. Pokrętło `massDestroyThreatWeight = 0` wyłącza presję (test 6).
- Bramy: `npm test` 8599/8599; `test:all` 8866/8866 (`.arena/pmssb74-testall.log`); golden 4/4 bez zmiany hasha (`bot-scoring-snapshot`); strażnik CR naprawiony (usunięty niezweryfikowany cytat).
- A/B 80 partii (`warhammer-ubr` vs `dominaria-brg`, 40 seedów, baza HEAD `7505bb5`): 9 rozjechanych decyzji; wygrane p1 45 → 46, p2 35 → 34. Nie stwierdzono poprawy siły. Rozjechane decyzje dotyczą wyłącznie Bloodfire z konstrukcji zmiany (jedyna zmieniona gałąź to ten typ efektu); nie mapowano identyfikatorów na karty.
- Tie-audit i mirror nie wykonane dla tej zmiany (tie-audit benchmarku nie zawiera talii z Bloodfire; mirror porównuje parametry, nie kod).
- Otwarte: warunek zysku nie uwzględnia letalu wroga (obrażenia dotyczą wyłącznie stworów); wycena nie patrzy na aurę jako kartę w grze poza kosztem gospodarza.

- Domknięcie otwartych punktów (2026-10-21):
  - Tie-audit PMSSB-74 (`7505bb5` przed, HEAD po): `tie_top` 700 → 700, akcyjne 197 → 197. Bez zmiany.
  - Mirror PMSSB-74 — lustro dwóch WERSJI bota na tym samym silniku (diff `7505bb5..9a716ce` dotyka tylko `heuristic-bot.js`). Standardowy benchmark nie zawiera Bloodfire (jest tylko w `warhammer-ubr`), więc lustro na tej talii: 150 seedów (3000–3149) + 250 seedów (5000–5249) = 800 partii: kandydat 431 : baseline 369, win-rate 0,539, z ≈ 2,19, dwustronne p ≈ 0,03 (bez korekty na wielokrotne porównania; jedna talia). Wynik kierunkowy, nie dowód dużego efektu.
  - Letal wroga w wycenie Bloodfire: nie dotyczy karty. Bloodfire Infusion zadaje obrażenia tylko stworom („to each creature”), nie graczowi.

## PMSSB-75 — controlsType: Heron-Blessed Geist (2026-10-20) — ZAMKNIĘTE BEZ ZMIANY KODU

Plan: [PLAN_2026-10-20k-pmssb75-controls-type](plans/PLAN_2026-10-20k-pmssb75-controls-type.md).

- Pomiar (`.arena/probe-controls.mjs`): bez enchantmentu aktywacja z cmentarza NIE jest oferowana (ani botowi, ani w `legalCommands`). Z enchantmentem wycena 24 na pustym stole, 18 z dwoma wrogimi stworami, 18 przy moim życiu 5 (z dwoma wrogami) — życie nie zmienia wyceny.
- Audyt: (a) L41 — bramka czytana z `condition.controlsType` w jednym miejscu (`abilities.js`), oferta i walidacja wspólne; (b) koszt — 4 + W z cmentarza, bez wymiaru do zmiany; (c) anty-over-fix — brak defektu w bramce, więc brak zmiany.
- Test: `test/audyt-pmssb75-controls-type.test.js` (3). Mutacja wyłączenia bramki łapie test 1.
- Otwarte POZA ZAKRESEM tego PMSSB (DOMKNIĘTE w PMSSB-77): wycena tworzenia tokenów (`create_token`) nie znała presji życia. Spadek 24 → 18 przy wrogach w tym PMSSB to bramka latania, nie presja.
- Nie wykonano: tie-audit, mirror (zmiana kodu nie była potrzebna).

## PMSSB-76 — warunkowa redukcja kosztu: Gnoll War Band (2026-10-20) — ZAMKNIĘTE BEZ ZMIANY KODU

- Pomiar (`.arena/probe-costred.mjs`): bez obrażeń w turze rzut za 5 many nie jest oferowany; po obrażeniach przeciwnikowi jest oferowany i bot wybiera go (74,7) przed Frontline War-Rager (65,7). Wycena rzutu 5 po obrażeniach = 6 bez obrażeń (oba zużywają całą manę).
- Audyt: (a) L41 — silnik (`mana-cost.js`) i bot czytają `damageTakenByPlayerThisTurn`; (b) wymiar kosztu — zgodny z CR 601.2f; (c) anty-over-fix — brak defektu w wyborze.
- Test: `test/audyt-pmssb76-warunkowa-redukcja.test.js` (3 piny; wszystkie przechodzą na obecnym kodzie). Mutacja zerująca redukcję łapie 2 testy.
- Otwarte: brak wrażliwości wyceny na pozostałą manę poza konkurencją czarów (nie ma czego rozstrzygać w tej rodzinie).

## PMSSB-77 — presja życia w wycenie tokenów-stworów własnych (2026-10-20/21) — DONE

Plan: [PLAN_2026-10-20l-pmssb77-tokeny-presja](plans/PLAN_2026-10-20l-pmssb77-tokeny-presja.md).

- Pomiar PRZED (`.arena/probe-tokeny-presja.mjs`, `.arena/pmssb77-pre.txt`): Geist 24 na pustym stole; z dwoma wrogimi Makindi 18 przy życiu 20 i 18 przy życiu 5. Spadek 24 → 18 to bramka latania (`enemyHasUntappedFlyingOrReachBlocker`), NIE presja. Raise the Alarm 69,98 we wszystkich scenach — brak reakcji na presję.
- Audyt pierwotnej iteracji: (a) L41 — wspólna miara `enemyAttackPower / myLife` (≤ 1), ta sama co `counterValue`; (b) brak wymiaru do zmiany; (c) wówczas testowano tylko WŁASNEGO tokenu-stwora, pusty stół bez zmian. Finalna symetria poniżej i errata w planie.
- Wdrożenie: pokrętło `tokenPressureWeight` = 6 w `heuristic-params.js`; składnik w `tokenBodyValue` (`heuristic-bot.js`) dodany do ciała tokenu-stwora. Pokrętło 0 = dawne zachowanie bit w bit.
- Wynik (`.arena/pmssb77-post.txt`): Geist przy dwóch wrogach 19,2 (życie 20) → 22,8 (życie 5); Raise the Alarm 71,18 → 74,78.
- Testy: `test/audyt-pmssb77-tokeny-presja.test.js` (4; RED na HEAD: 1, 2, 4; pin pustego stołu 3). Mutacja składnika na 0 łapie 2 testy.
- Piny starych testów zaktualizowane o zmierzone delty (z komentarzem `PMSSB-77`), nie na progi: `audyt-pmssb2-tokeny` (chump 77,98 → 79,78; okno po blokach 61,98 → 63,78; sokół 79,97 → 80,87; Dissenter 19 → 19,6; różnica unik 9 → 8,1; tapnięty sokół 88,97 → 89,87), `audyt-pmssb68-amass` (Dunland 86,0991 → 86,6391; Toll 60,0 → 60,6).
- Golden (`--dump`, `.arena/pmssb77-golden-diff.txt`): 1437 decyzji, 0 zmienionych wyborów; 3 wyniki wybranych opcji i 17 wycen opcji (maks. Δ 1,5). Hash `9017a46b8bf6298d…` → `2bf25d5bea4ed189…`. Właściciel zaakceptował zmianę wycen (decyzja 2026-10-21); fixture zregenerowany `--write` i sprawdzony (`test/bot-scoring-snapshot.test.js` 4/4).
- Tie-audit (`.arena/pmssb77-tie-{pre,post}.json`): `tie_top` 700 → 674; akcyjne 197 → 196; `attack` 97 → 81; `block` 435 → 427. Liczba decyzji w audycie zmieniła się (13672 → 13375), bo audyt gra pełne partie i zmienione wybory zmieniają przebieg.
- Mirror 24 seedy (`.arena/pmssb77-mirror.json`): kandydat (domyślne, `tokenPressureWeight` 6) vs baseline (`tokenPressureWeight` 0): 144:144, win-rate 0.5. Brak dowodu poprawy siły.
- Domknięcie (ta sama seria, 2026-10-21): presja była tylko dla WŁASNYCH tokenów, a token oddany wrogowi (Secure the Scene: „its controller creates a 1/1”) miał zero. To była luka, nie decyzja: presja działa teraz symetrycznie (znak roli mnoży całe ciało). Gałąź `exileSwap` (PMSSB-63/S) liczy ciało jako 2·moc+wytrzymałość, więc presja dodana tam z czynnikiem 3/10 (ta sama waga, inna jednostka).
- Wynik domknięcia: Secure the Scene na dwóch Kulrath (moc 6) — życie 20: 26,95 → 25,87; życie 5: 25,15. Pin PMSSB-63/S2 zmieniony z −2,05 na −2,14 (presja wroga 1/1 przy życiu 20 = 1/20 × 6 × 3/10 = −0,09).
- Golden po domknięciu: 1437 decyzji, 0 zmienionych wyborów, 6 wycen (maks. Δ 0,64). Hash `2bf25d5b…` → `2f00a7f5…`. Decyzja właściciela (2026-10-21): akceptuj; fixture odnowiony.
- Tie-audit po domknięciu bez zmian (674, akcyjne 196). Mirror 24 seedy (tokenPressureWeight 6 vs 0): 144:144.
- Otwarte: `enemyAttackPower` sumuje wszystkie wrogie stwory, nie tylko atakujące — ta sama przybliżona miara co licznik PMSSB-71 v3 (świadoma przybliżona miara, nie luka).

## PMSSB-78 — Chocobo Kick: wartość celu i odtwarzalny land drop (2026-10-22) — DONE

Wejście: follow-up do PMSSB-16/36/37. Wcześniejsze piny sprawdzały, czy kicker
zmienia nieletalny bite w zabójstwo, ale nie rozstrzygały wielu legalnych celów:
bot mógł zabić mały cel zwykłym rzutem, zamiast zapłacić kickerem i zdjąć
cenniejszy stwór.

**Audyt CR (oficjalny Wizards, wersja skuteczna 2026-09-25):**
[Magic Comprehensive Rules](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.txt)
— 702.33a,d (kicker to dodatkowy koszt ogłaszany przy rzucaniu; „kicked” zależy
od zapłacenia kosztu), 601.2b,h (wybór kickera i zapłata kosztu w procesie
rzucania), 305.1–305.2 (land można zagrać w swojej main phase przy pustym stosie,
o ile pozostał land drop). Po rozstrzygnięciu sorcery land drop nadal można
wykorzystać.

**Naprawa (generyczna, bez nazwy karty):** cel bite jest wyceniany względnie
wśród legalnych alternatyw tego samego źródła: istniejąca wartość stworzenia
(P/T i mana value) plus mana value dołączonych Aur i Equipment. Premia za
wartość celu działa tylko przy zabiciu i tylko wtedy, gdy istnieje alternatywa,
więc historyczna skala pojedynczego bite z PMSSB-16 zostaje zachowana. Kicked
obrażenia wpływają na rdzeń wyceny tylko wtedy, gdy normalna moc nie zabija, a
podwojona zabija; gdy nawet ×2 nie wystarcza, bot wraca do zwykłej oceny i może
wybrać mniejszy cel. Lethal uwzględnia indestructible, pełną prewencję i tarcze
obrażeń. Kara zwrotu lądu znika tylko dla nie-tokenowego lądu należącego do bota,
przy niewykorzystanym land dropie w jego main phase; przejęty land nie jest
traktowany jako możliwy do odtworzenia. PlayerView ujawnia właściciela tylko
przejętego lądu, gdy różni się od kontrolera.

**Regresje:** siedem pinów w `test/real-cards-batch62.test.js`: wybór i odtworzenie
lądu; priorytet mana value; brak darmowego kickera po wykorzystaniu land dropu
lub zwrocie cudzego lądu; Aura; Equipment; fallback, gdy nawet ×2 nie zabije.
PMSSB-16/37 pozostają zielone, w tym dawne zachowanie dla pojedynczego celu i
kara za bite bez zabicia.

**Bramy:** `node --test test/real-cards-batch62.test.js test/audyt-pmssb16-walka.test.js test/audyt-pmssb37-trzy-granice.test.js test/player-view.test.js` — **97/97**;
`npm run build` — 75 modułów; `git diff --check` — czysto. Pełnego B0 nie uruchamiano.

## PMSSB-79 — osiem rodzin batcha 70 (2026-10-27) — 4 DONE, 4 ZAMKNIĘTE BEZ ZMIANY

Plan: [PLAN_2026-10-27b-pmssb79-batch70](plans/PLAN_2026-10-27b-pmssb79-batch70.md).
Sonda: `tools/pmssb79-batch70-sonda.mjs`. Piny: `test/audyt-pmssb79-batch70.test.js`
(24). Lustro: `tools/pmssb79-mirror.mjs`.

POMIAR PRZED (`.arena/pmssb79-pre.txt`) i PO (`.arena/pmssb79-post.txt`) — te
same scenariusze, ta sama sesja:

| Rodzina | PRZED | PO | Werdykt |
|---|---|---|---|
| X w koszcie permanentu (Magma Pummeler, X=4…0) | 70,20 / 68,40 / 66,60 / 64,80 / −27,00 | bez zmian w wycenie; **X dowiązany do zdarzenia, logu i śladu** (uzupełnienie niżej) | ZAMKNIĘTE BEZ ZMIANY (wycena) + **DONE (prezentacja)** |
| prewencja zdejmująca liczniki (blok 0/1/3 liczniki) | 0,00 / 2,00 / 5,00 | bez zmian | ZAMKNIĘTE BEZ ZMIANY (odczyt „anomalii” sprostowany) |
| Improvise (Fen Hauler: mana 7 vs 5, artefakty 0 i 2) | 72,91 / 72,68 / 72,46 | bez zmian | ZAMKNIĘTE BEZ ZMIANY (bliźniak convoke) |
| `cantBeBlockedByTypes` (Fen Hauler vs artefakt-bloker 6/6) | 8,00 w OBU wariantach | artefakt **8,00** vs zwykły **−10,00** | **DONE** |
| trigger `manifest_dread_resolved` (Paranormal Analyst) | 68,40 płasko | aktywator+grób: **72,00**, brak aktywatora: 68,40 | **DONE** |
| `amountFromGraveyardCardType` (Moldgraf Millipede) | 97,74 płasko | 0 kart: 97,74 → 3 karty: **113,94** | **DONE** |
| Converge damage (Kaleidoscorch) | −61,00 płasko (kwota string → 0) | 1 kolor: **7,00** → 4 kolory: **9,00** | **DONE** |
| drugi cel kickera (Jilt) | 146 / 112 / 94 / 14 | bez zmian | ZAMKNIĘTE BEZ ZMIANY |

### Audyt macierzy (L41 / S11 / M429)

- **L41 (jedna reguła, wszystkie ścieżki):** `cantBeBlockedByTypes` był czytany
  tylko w `canIndividuallyBlockCrackback`; teraz filtr siedzi w
  `attackerCanBeBlocked` (jedno źródło dla deklaracji bloków, krakbacku i
  projekcji `attacksAloneCombatProjection`), a duplikat w crackbacku usunięty.
  Kwota Converge liczona jedną funkcją `convergeDamageAmount` z tego samego
  `countColorsOfManaSpent`, którego używa silnik (`effects.js`), więc oferta i
  rozstrzygnięcie nie mogą się rozjechać.
- **S11 (wymiar kosztu):** Converge — koszt `{1}{R}` przy czterech kolorach w
  puli daje 2 kolory (CR 601.2f: nie można przepłacić), więc 2 obrażenia to
  wynik poprawny; bot płaci wariant o największej liczbie kolorów wśród
  oferowanych, nie „dowolnie dużo”. Improvise — kara `improviseTapPenalty` ×
  ciało tapowanego artefaktu jest większa niż wartość zaoszczędzonej many,
  dopóki mana wystarcza (pin 5c).
- **M429 (anty-over-fix):** wszystkie cztery poprawki to DOPŁATY za pokrętłami
  (`convergeDamagePerColor`, `manifestDreadTriggerValue`,
  `graveyardCounterWeight`/`graveyardCounterCap`), a zerowanie każdego wraca do
  dawnej wartości bit w bit — piny 1c, 2c, 3b. Ewazja po typie nie ma pokrętła,
  bo jest FILTREM poprawności (bramka legalności), nie heurystyczną dopłatą;
  jej kontrolą negatywną jest pin 4b (zwykły bloker 6/6 nadal blokuje).

### Wdrożenie (generyczne, bez nazw kart — ADR 0002)

- `attackerCanBeBlocked` (`heuristic-bot.js`): nowy argument `bannedTypes`
  liczony raz z `cantBeBlockedByTypes` deskryptora; crackback korzysta z tej
  samej ścieżki.
- `convergeDamageAmount` + gałąź `effect.amount === 'colors_of_mana_spent'` w
  wycenie `cast_spell` (wcześniej: **zero** wystąpień w `heuristic-bot.js`,
  kwota stringowa spadała do 0 i czar dostawał karę „efekt bez skutku”).
- `graveyardCounterAmount` + użycie w `ETB_EFFECT_BONUS.add_counter`
  (`amountFromGraveyardCardType`), z sufitem `graveyardCounterCap`.
- `manifestDreadEvidence` + gałąź `manifest_dread_resolved` w łańcuchu
  `anticipatedTailValue` i wpis `return_context_graveyard_card_to_hand`:
  premia tylko przy realnym aktywatorze (karta z manifest dread w ręce/na
  stosie) I niepustym cmentarzu — bez tego trigger jest niemy (pin 2b).
- Nowe pokrętła: `convergeDamagePerColor` 1, `manifestDreadTriggerValue` 4,
  `graveyardCounterWeight` 1, `graveyardCounterCap` 8.

### Uzupełnienie po zgłoszeniu właściciela: „X czarów już robione — zastosuj do Pummelera”

Zgłoszenie właściciela (2026-10-27, po zamknięciu pętli): logika dla czarów
z {X} była już robiona (skojarzenie z Epic Experiment) i powinna obowiązywać
Pummelera oraz karty o tym kształcie. Ustalenia:

- **Precedens to nie wpis PMSSB, tylko M237/1** (audyt Żywym Testerem —
  Consume Spirit) plus plan `PLAN_2026-09-18c-uwagi-z-testow-detain-atak-i-epic-experiment`
  (Epic Experiment: jedna oferta z X, X w logu, polityka `5X` w Main 2).
  Reguła z M237/1: `amount: 'X'` rozwiązywane do `cmd.xValue` PRZED wyceną
  efektów, X = 0 karane jako aktywacja jałowa.
- **Pomiar parzystości (sonda + `node -e`, ta sesja):** obie ścieżki oferują
  wyłącznie X opłacalne z puli (`pula 2 → [0]`, `3 → [0,1]`, `6 → [0..4]`,
  `15 → [0..13]`) i wybierają MAKSYMALNE opłacalne X — czar Consume Spirit:
  X=7 przy puli 9 i X=13 przy puli 15; permanent Pummeler: X=4 przy puli 6
  i X=13 przy puli 15. Różnica jest w nasyceniu: czar nasyca się na letalu
  (wróg 3 życia → X=4, nie 13), bo obrażenia ponad zabicie są warte 0
  (`damageTargetValue`); liczniki permanentu nie nasycają się, bo każdy punkt
  to realne ciało — to różnica SKUTKU, nie logiki (S11 świadomie inaczej).
- **Czego faktycznie brakowało — trzy dziury prezentacyjne** (ta sama klasa
  co uwaga B1 z 2026-09-18, naprawiona wtedy tylko dla czarów i zdolności):
  1. `permanent_cast` nie niósł `xValue` w zdarzeniu (tylko `spellX` na
     obiekcie stosu), więc log/panel nie miały z czego czytać;
  2. log mówił „zagrywa Magma Pummeler” bez X — teraz „(X=3)”, to samo
     brzmienie co `spell_cast` i `ability_activated` (L41);
  3. ślad bota zwijał warianty X=0…13 do jednej etykiety `cast_permanent(x)`
     — audyt remisów nie miał czego parować (klasa Krumar H, naprawiona
     w `activate_ability`); teraz `cast_permanent(x,X=4)`.
- Piny 7a/7b/7c w `test/audyt-pmssb79-batch70.test.js` (razem **20**),
  mutacje: zdarzenie bez `xValue` → 2 RED, log bez `(X=n)` → 1 RED,
  etykieta bez X → 2 RED. Werdykt całości: **X w koszcie permanentu — DONE
  (prezentacja) + wycena potwierdzona pomiarem**, bez zmian w silniku
  płatności i w wycenie.

### PMSSB-79 v2 — próg minimalnego X dla rzutów za {X} (zgłoszenie właściciela)

Zgłoszenie (2026-10-27, korekta intencji po v1): nie chodzi o samo
„widoczność X”, tylko o **opłacalność progu**. Rzut czarem/permanentem za
X = 1 marnuje potencjał karty — dokładnie tak, jak ustalono wcześniej dla
Epic Experimentu (`test/uwagi-z-testow-b-epic-experiment-x.test.js`: „Bot
rzuca za X=0. To bez sensu kompletnie… scoring do naprawy”, potem uwaga
2026-10-22: „nie rzucać, gdy X < 3, i odkładać do Main 2”). Właściciel chce
tej samej reguły dla Magma Pummeler i kart o tym kształcie, z jednym
wyjątkiem ratunkowym.

**Pomiar PRZED (sonda, pula many = X + {R}{R}):**

| Scenariusz | PRZED | PO |
|---|---|---|
| pula 4 (X ≤ 2), życie 20 | rzut za **X = 2** | **pass** (X < próg 3) |
| pula 5, życie 20 | rzut za X = 3 | rzut za **X = 3** (bez zmian) |
| pula 6, życie 20 | rzut za X = 4 | rzut za **X = 4** (bez zmian) |
| pula 4, życie 2, wrogi 3/3, brak blokerów | rzut za X = 2 | rzut za **X = 2** (wyjątek ratunkowy) |
| pula 3, życie 2, wrogi 3/3, brak blokerów | rzut za X = 1 | rzut za **X = 1** (wyjątek ratunkowy) |
| pula 4, życie 2, wrogi 3/3, **jest** inny bloker | rzut za X = 2 | **pass** (wyjątek nie działa) |
| pula 4, życie 20, wrogi 3/3 (brak letalu) | rzut za X = 2 | **pass** |

**Reguła (generyczna, ADR 0002):** wariant rzutu permanentu o koszcie {X}
schodzi pod pass (`NEVER`), gdy wybrane X jest mniejsze od progu
`xMinimumValue` (3 — ta sama stała, którą odtąd czyta bramka Epic
Experimentu; wcześniej twarde 3 w kodzie, L41). Wyjątek ratunkowy
(`xMinimumValueLooseAtLethal`): gdy siła wroga ≥ nasze życie (realny letal
w następnym ataku) i nie mamy innego nietapniętego blokera, próg spada do
X ≥ 1 — ciało za 1 manę jest wtedy chump-blockiem dla przeżycia. X = 0 nie
wchodzi w grę nigdy (0/0 ginie od SBA, CR 704.5f, i nic nie zablokuje).
Bramka dotyczy ciał (liczy się wytrzymałość wejścia); nie-ciała z {X}
zostają bez progu.

**Piny:** `test/audyt-pmssb79-batch70.test.js` 5a/5f/5g/5h/5i (razem **24**
w pliku). Mutacje: bramka wyłączona → 4 RED, wyjątek wyłączony → 1 RED,
a pokrętła (`xMinimumValue: 0`, `xMinimumValueLooseAtLethal: 0`) same
odtwarzają stan sprzed zmiany (M429). Epic Experiment pozostaje zielony
(`uwagi-z-testow-b-epic-experiment-x`, `uwaga-z-gry-2026-09-23-w-epic-experiment-x`).

### Pomyłki pomiaru (zapisane, żeby nie wracały)

1. **„Luka silnika w Converge” — fałszywy alarm.** Wczesny `node -e` czytał
   `t.damage` przed rozstrzygnięciem stosu (i po rzucie bez `pass_priority`),
   więc wychodziło 0. Poprawny pomiar: `execute(cast_spell …)` + 8 ×
   `pass_priority` → `damage_dealt {amount: 2}` przy czterech kolorach w puli i
   koszcie `{1}{R}`. Pin 6a pilnuje tego kontraktu; silnik nie wymagał zmiany.
2. **„Anomalia 0,00 w bloku”** — Pummeler z X = 0 jest 0/0 i ginie od SBA
   (CR 704.5f), więc blok takim stworzeniem jest wart tyle samo co
   przepuszczenie (0,00 vs 0,00). Model poprawny; pin 5e wymaga teraz
   monotoniczności 0 → 1 → 3 liczników.
3. **Ewazja mierzona blokerem 2/2** — bloker ginie od 5/5 niezależnie od
   ewazji, więc scores były równe w OBU wariantach. Wniosek: do pomiaru ewazji
   trzeba blokera, który przeżyje (tu 6/6).

### Ewaluacja

- Golden `bot-scoring-snapshot --dump`: `overallHash = 5be4528fc67e966f…` bez
  zmian (0 zmienionych wyborów i wycen) — **regeneracja fixture niepotrzebna**,
  decyzja właściciela o akceptacji nie była wymagana.
- Tie-audit PO: `tie_top` 675 / 13688 decyzji, akcyjne 178 (te same wartości co
  PRZED — poprawki nie tworzą nowych remisów).
- Lustro (`tools/pmssb79-mirror.mjs`, 40 seedów × 3 talie z kartami rodziny):
  Converge **163:157** (51,2%), manifest dread 120:120, licznik z cmentarza
  120:120. Dwa ostatnie remisy to wynik deterministyczny: poprawki zmieniają
  WYCENĘ, ale w tych taliach nie odwracają żadnego wyboru (identyczne partie).
  Nawet skrajne pokrętła (×50) nie zmieniają wyniku — potwierdzenie, że brak
  sygnału to próbka (B6), a dowodem są piny. Brak regresji.
- Benchmark quick: **88,1%** (592/672), aggro 20,8%, random 3,0% — identycznie
  jak PRZED poprawkami.

### Bramy

`npm test` **8964/8964**, `npm run test:slow` 268/268, build 76 modułów /
5508,7 kB. Mutacje (RED potwierdzony): filtr `bannedTypes` off → 1 RED;
`convergeDamageAmount` → 0 → 2 RED; `manifest_dread_resolved` → 0 → 1 RED;
`graveyardCounterAmount` off → 1 RED.
