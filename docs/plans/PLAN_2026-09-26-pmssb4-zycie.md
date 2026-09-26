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

## Aneks A: pomiar PRZED (do wpisania po krok-1)
## Aneks B: audyt + fale (do wpisania po krok-2)
## Aneks C: wyniki (do wpisania po falach)
