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
