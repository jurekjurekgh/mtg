# PMSSB-4: zysk życia (`gain_life*`) — plan

Pętla Manualnego Strojenia Scoringu Bota (hub: `docs/PMSSB.md`, procedura
kroków 0-7). Metoda M429: audyt przyczynowo-skutkowy JEDNEJ rodziny +
wdrożenie falami + piny. Nie tuning maszynowy (ADR 0018).

## Wybór celu (uzasadnienie)

Rejestr BACKLOG po PMSSB-3: zysk życia (23 w rejestrze — weryfikacja
programowa mówi 29, po odrzuceniu fałszywego trafienia **28**) oraz kontry
(5, mikro-pętla — poza PMSSB).
Wzorzec delegacji (raport PMSSB-2): największa rodzina z rozjazdami.
PMSSB-3 przekazał wprost gałąź-Angel scrolla (gain-life) jako OUT.

Wstępny przegląd kodu (do potwierdzenia sondą krok-1):

- `cast_spell`: BRAK przypadku `gain_life` w pętli efektów (jest tylko
  `gain_life_if_target_dies_this_turn` (Time to Feed) i
  `destroy_artifact_gain_life_mana_value` w listach removal) — czary
  leczące biorą goły `spellBase` 50 + 0 x ilość (pułapka
  przewartościowania z rejestru; A4-4 nie obejmuje gain).
- `activate_ability`: bogaty model M236/2+3 (ratunek/bufor/nacisk,
  koszty tap/sac) + M157 dla `gain_life_target` (sobie +2+x, wrogowi
  -25-x) — rozjazd bliźniaczy L41 do domknięcia.
- Tabela ETB: `min(2x, 8)`; tryb modalny: `life<=5 ? 4x : x`; warianty
  free-cast: +5; rider many: 2 + ilość — 5 różnych formuł ilości.
- Ścieżka `play_land` (cykl gain-landów) i triggery (dies/landfall/
  cast/attack) — status nieznany, do sondy.

Precedensy do naśladowania: A4-4 (isDrawOnly — pytanie czy isGainOnly?),
M211 (okna EOT), M236 (bufor/ratunek), M169/K (progi życia), PMSSB-3
F-temple (noga-foe + ramka treści).

## Kroki

0. Plan (ten plik) — commit.
1. POMIAR PRZED: sonda `tools/pmssb4-zycie-sonda.mjs` (katalog tools jak
   PMSSB-3, nie /tmp) + inwentarz kart gain (29) i ich okien
   (instant vs sorcery!) + status hipotez H1-H12.
2. AUDYT: macierz kanał x odbiorca x timing x stan (Aneks B) + findingi
   F1…Fn + fale A/B/C.
3. IMPLEMENTACJA: rodzina `gainLife*`/`lifeValue*` w `heuristic-params.js`
   + wspólne helpery (L41) w `heuristic-bot.js`.
4. TESTY: `test/audyt-pmssb4-zycie.test.js` (wzorzec M429 + konwencja
   `audyt-pmssb<N>-*` z huba) RED→GREEN + mutacje/dowód.
5. EWALUACJA: `bot-scoring-snapshot` (cel: bez regeneracji), mirror-eval,
   Żywy Tester PO. Wąskie stany bez sygnału w lustrze = wynik (B6).
6. DOKUMENTACJA: raport §PMSSB-4 w hubie + rejestr DONE + wpis
   w PROJECT_HISTORY. Bez wpisu LESSONS (precedens PR136).
7. Bramy (`npm test`, build, `test:all`), push po każdym kroku, PR.

## Inwentarz rodziny (28; `reg.all()` 562, klucz /gain_life/, minus crumb-and-get-it)

Czary (cast_spell): consume-spirit (sorcery X-drain), divine-offering
(instant, artifact-removal + gain-MV), severed-strands (sorcery,
sac-stwór + gain-toughness), time-to-feed (sorcery, fight +
gain-if-dies), douse-in-gloom (instant). WYKLUCZONY: crumb-and-get-it —
trafienie tylko przez `gift` (tworzy Food; token_food liczony osobno).
Zdolności (activate_ability): soulmender (tap: +1), token_food
(2+tap+sac: +3), mournful-zombie (cel-gracz +1), instant-ramen,
pristine-talisman (mana + gain 1), kheru-dreadmaw (sac: +toughness),
scroll-of-avacyn (sac: draw + warunkowe +5).
ETB (tabela): healer-of-the-glade (+3), spinewoods-paladin (+3),
static-net (+2 + token), skymarch-bloodletter (drain 1),
dismal-backwater / thornwood-falls / tranquil-cove (landy +1).
Modalne triggery: etherwrought-page, inspiring-bard.
Triggery (dies/atak/cast/landfall): highland-game, zoraline,
angels-feather, krakens-eye, white-mages-staff, grazing-gladehart,
cautious-survivor.

## Hipotezy H1-H12 (status po krok-1)

- H1: noga-gain w cast = 0 x ilość (czystych gain-spelli BRAK w katalogu; drain/removal multi).
- H2: drain (foe-loss + self-gain): strata-wroga wyceniona, gain-0?
- H3: gain-removal vs plain-removal remisuje na wymiarze-gain (niedowartościowanie nogi; A4-4 nie obejmuje gain).
- H4: zdolności M236: ratunek/bufor/nacisk + koszty tap/sac (piny warstw).
- H5: ETB-gain = min(2x,8) x 0.9; gain-landy w play_land = ? (0?).
- H6: tryby modalne (Page/Bard): warstwy life<=5 ? 4x : x.
- H7: gain_life_target we wroga = -25-x (strażnik M157 działa?).
- H8: triggery-gain w wycenie rzutu = 0/liability (OUT-trigger, dowodowo).
- H9: racing: wartość życia płaska vs stan wyścigu (bufor vs ratunek)?
- H10: koszty (S11): gain za 5 vs 2 many nie remisuje bez uzasadnienia?
- H11: okna: instant-gain na EOT vs main (lustro F2-draw/M211)?
- H12: X-drain (Consume Spirit): skalowanie ilości z X?

## Zakres świadomie OUT

- Karty lose-only (8: drain obrażeniowy M237/4, self-harm M169/K — pokryte).
- Generyczna-wycena-triggerów (OUT z PMSSB-3, wspólna przyszła pętla).
- Pełny model racing-math (decyzja w audycie: prosty gate vs OUT).
- Lifelink/keywordy bojowe, poison/infect, pełny opportunity-cost many.
- Kontry (5, mikro-pętla — nie PMSSB).

## Aneks A: pomiar PRZED (krok-1, 2026-09-26)

Sonda: `tools/pmssb4-zycie-sonda.mjs` (scenariusze L01-L26, 40+ wariantow).
Kazdy wynik ponizej to DOKLADNA rownosc arytmetyczna (nie regresja).

### Corrigendum kanalow (rodzina = 28 ID: patrz FAMILY28 w sondzie)
Poprawne kanaly: **5 spell / 7 ability / 7 ETB (w tym 3 gain-landy) /
2 modal / 7 trigger** (wczesniejsze "6/6" liczylo crumb-and-get-it,
ktorego jedyny hit to gift->Food, oraz gubilo jeden trigger).

### Wyniki L01-L26 (dekompozycje)
- L01 Douse dmg2+gain2 w 3/3: -30.0 przy zyciu 20 I 5 (rownosc ->
  noga-gain = 0; -30 to noga-damage M237/4, OUT).
- L02 Consume X w twarz: X=1..4 -> -10 FLAT (ksztalt damage-OUT);
  X=0 -> -70 (inert); w siebie: -54/-56/-58/-60 (nachylenie -2/X =
  M169/K self-harm, gain 0). Identyczne przy zyciu 20 i 5 ->
  gain(X) = 0 dla kazdego X.
- L03 Severed (cel 2/2-MV3): T1 -> 86, T4 -> 85, T7 -> 82 =
  50 + 22 + 4x2 + 3x2 - max(0, sacV-(2x2+2)): 86/85/82 DOKLADNIE
  (sciezka wymiany-TMC; noga-gain-T = 0).
- L04 Divine w MV1 vs MV4: 74 vs 80, delta +6 = 3 x TMC-weight-2
  (M234); noga-gain-MV = 0.
- L05 Soulmender {T}:+1: 3/4/5 przy 20/10/5 = 2 + lifeValue
  (M236: bufor min(1+fl(x/2),3) / 1+min(x,3) / ratunek 2+x). DOKLADNIE.
- L06 Food {2}T,sac:+3: 4/7 przy 20/5 (token tani MV0 -> bez kary).
- L07 Kheru {2}{G},sac:+T: -16/-16 przy 20 (kara 2x: lifeV+12+6);
  5/8 przy 5 (ratunek, koszty mana IGNOROWANE = 0!). DOKLADNIE.
- L08 Ramen {2}T,sac:+3: -12 przy 20 (2+2-(2+8+6), drogi noncreature);
  +7 przy 5. DOKLADNIE.
- L09 Zombie: w siebie +5 (2+2+1, FLAT M157); we wroga -55 =
  2 - 26 (M157) - 31 (generyczny misaim 30+x): PODWOJNA kara.
- L10/L10b Healer/Paladin: (70+2P+T-(MV+pips)+min(2x,8))x0.9 + eps
  (eps = 0.001x(cialo-koszt), deterministyczny tiebreak): 70.2018 /
  75.6072 DOKLADNIE. Flying +3, trample/vigilance +0.
- L11 Gain-land vs basic: 85 vs 93 (tap -8, brak skladnika gain;
  pokrycie rowne; gain +1..3 NIGDY nie flipsuje przy stalym -8).
- L12 Page: 14/13/12 przy 20 (lose/surveil/gain), 18/14/13 przy 5
  (gain flippuje na gore: 10+4x). Bard: gain3 13 -> 22 (flip).
  Slad `resolve_modal_choice` nierozroznialny miedzy trybami.
- L13/L14/L15/L16 triggery przy rzucie: +0 DOKLADNIE (dies/landfall/
  cast/attacks; reszty = cialo-koszt-keywords+parzystosc+eps).
- L17 Feed: kill-2/2 -> 82 = 50+29+3; chip-5/5 -> 38 = 50+5-20+3
  (gain_if_dies = +3 FLAT life-blind, tez gdy ofiara NIE ginie).
  Identyczne przy zyciu 20 i 5.
- L18 Soulmender EOT-wroga = main = 3 (flat).
- L19 Food przy 3: 7/7 z presja i bez (ratunek dominuje).
- L19b Food przy 12: 4 bez presji -> 6 z presja 9 (prog
  pressure >= life-5 DOKLADNIE: 2+2 -> 2+4).
- L20 Talisman {T}:mana+gain1: 6 przy 20, 8 przy 5 = 2 + 1 (M236) +
  0 (mana, pusta reka) + 3 (M155: 2+x FLAT) -> TO SAMO +1 zycia
  liczone DWA razy (M236 + legacy-M155).
- L21 Skymarch: 81.002 = 76-4 + 2 (gain) + 0 (lose: tabela-miss) +
  3 (flying) + 4 (parzystosc aggro) + eps.
- L22 Soulmender main1 przy wrogu 2/2 untapped: +3 STRZELA (brak
  hold); L22b przy ZADEKLAROWANYM ataku: -6 (neededToBlock: 3-(1+8),
  pass). Kontrast = bug H10/H11.
- L24 Healer/Paladin identyczne przy 20 i 5 (ETB slepe na zycie).
- L26 Scroll {1}sac:draw1+Angel?gain5: 7.0 we wszystkich 4 (Aniol
  T/N x zycie 20/5) -> gain5-warunkowy = 0 (M236 nie rozwija
  conditional; brak bramki na stan).

### Status H1-H12 (numeracja planu)
- H1 CONFIRMED: noga-gain w cast = 0 (wyjatek: gain_if_dies flat).
  Czystych gain-spelli brak (5 multi: drain/damage/removal/fight).
- H2 CONFIRMED: drain: strata-wroga wyceniona, gain = 0.
- H3 CONFIRMED: gain-removal remisuje z plain na wymiarze-gain
  (roznice = TMC-proxy, nie zycie).
- H4 CONFIRMED: warstwy M236 dokladne + koszty sac/tap (bramki
  cheap/doomed/critical). Znaleziska: M155-dubluje, M157-flat,
  koszty-mana-zdolnosci = 0 (OUT-koszty, forward).
- H5 CONFIRMED: ETB = min(2x,8) life-blind (przeszacowanie bufora
  ~3x vs M236); gain-landy = 0 (wymiar zdominowany -> NO-F).
- H6 CONFIRMED: tryby flippuja (Page 12->18, Bard 13->22).
  Stromosc ratunku 4x CHRONI kolejnosc gain-vs-lose1 przy niskim
  zyciu (14 vs 18; unifikacja dalaby remis 14=14) -> NO-F.
- H7 CONFIRMED+: straznik M157 dziala (-25-x) ALE dubluje sie z
  generycznym misaim (-30-x): razem -55 (dedup -> F-A4).
- H8 CONFIRMED: triggery-gain przy rzucie = 0 (7/7 nosicieli).
- H9 PINNED: wyscig = bramki cisnienia w warstwach (L19b 4->6;
  pressure >= life wymusza ratunek). Bez osobnego F.
- H10 PARTIAL: koszty-sac/tap obsluzone (bramki); koszty-MANA
  zdolnosci = 0 (Kheru {2}{G} ignorowane) -> OUT-koszty, forward.
- H11 CONFIRMED + F: EOT = main (flat); declared-hold dziala (-6),
  undeclared-threat strzela (+3) -> F-B1 (hold-tap-gain).
- H12 CONFIRMED: gain(X) = 0 dla kazdego X (twarz-flat = OUT-damage;
  siebie -2/X = M169/K).

### Wstepna lista F (do audytu krok-2)
Fala A: F-A0 helper gainLifeValue (wspolne warstwy M236, L41);
F-A1 noga-gain w cast (douse/consume-X/severed-T/divine-MV + straznik
foe-scope); F-A1b feed tiers(min(x,3)); F-A2 ETB tiers; F-A2b ETB
foe-lose +4x (lustro modala); F-A3 dedup M155; F-A4 dedup M157-foe;
F-A5 M157-self tiers; F-A5b conditional-gain w ability (scroll).
Fala B: F-B1 hold-tap-gain pre-combat (H11).
Fala C: F-C1 landfall-gate (gladehart); F-C2 cast-color-gate
(feather/kraken); F-C3 bat-gate (zoraline).
NO-F: tryby-modalne (H6), gain-landy (H5-zdominowane), dies-gain
(brak bramki-imminent), cautious (sick), staff-cast, damage-nogi
(OUT), koszty-mana (OUT), X-face-flat (OUT).
## Aneks B: audyt + fale (do wpisania po krok-2)
## Aneks C: wyniki (do wpisania po falach)
