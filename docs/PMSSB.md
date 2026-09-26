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
| kontry (`counter_spell`) | 5 | BACKLOG (mikro-pętla?) | co kontrować (HIGH_IMPACT jest), kiedy trzymać, blef many; mała rodzina, wysoka dźwignia |
| pump/grant (trików bojowych) | 52 | POKRYTE (M96/M173/M179/M218) | okna walki z uczestnictwa, nie z fazy — nie ruszać bez nowego dowodu |
| tap/untap | 29 | POKRYTE (M139) | okna tapowania — nie ruszać bez nowego dowodu |
| removal destroy/exile | 29+ | POKRYTE (M91/M234) | baza+worth+TMC+deathtouch+protekcja; exile≈destroy to świadome uproszczenie |
| obrażenia (`damage*`) | 32+ | POKRYTE (M237/4) | model per-cel; timing sorcery-burn do rewizji tylko z dowodem |
| odrzut (`discard_cards`) | 5 | POKRYTE (M202/M408) | strojone — nie ruszać bez nowego dowodu |
| fog/prewencja | — | POKRYTE (M91/M236) | okna (tura wroga), kara własnej tury przebija wszystko |
| Cuombajj (1 karta) | 1 | OUT (mikro-pętla, nie PMSSB) | 41 remisów w tie-audycie, ale to 1 karta |

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
