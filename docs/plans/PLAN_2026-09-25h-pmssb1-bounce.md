# PMSSB-1: bounce (odbicie do ręki / na wierzch / na spód) — plan

Zlecenie właściciela (25h): Pętla Manualnego Strojenia Scoringu Bota —
przemyślany audyt przyczynowo-skutkowy JEDNEJ rodziny + wdrożenie. Metoda:
M429 (batch 59, `audyt-m429-taktyczna-wycena-batch59.test.js`), nie tuning
maszynowy (ADR 0018: pełne B0 tylko na komendę).

## Wybór celu (uzasadnienie)

Audyt remisów `tools/bot-tie-audit.mjs` (144 partie, 76k decyzji): attack/
block-remisy to szum tokenowy, discard jest strojony (M202/M408), Cuombajj
(41 remisów) to 1 karta — nie rodzina. Przegląd kodu wskazał **bounce**
(11 kart: 8 czarów + 3 triggery; typy: `return_to_hand`,
`bounce_permanent`, `bounce_to_library_top/bottom`,
`owner_library_top_or_bottom`):

- `cast_spell`: CEL jest (M91 + M234: TMC, deathtouch, unbeatable,
  combat-handled), ale **TIMINGU brak** — instant z kluczowym oknem
  (przed atakiem wroga / bloker / ratunek / end-step) wyceniany płasko.
- `activate_ability`: **zero wyceny bounce** (goła baza) — rozjazd
  bliźniaczych gałęzi L41 (katalog nie ma dziś takiej zdolności, ale
  reguła klasowa musi istnieć; test na widoku syntetycznym).
- Wymiary taktyczne NIEOBECNE w wycenie (wstępne FINDINGI do
  potwierdzenia sondą): token (odbicie = trwałe usunięcie, CR 704.5d),
  aury na celu (2-za-1/3-za-1, CR 704.5m), ETB wroga (odbicie = powtórka
  ETB — anty-value!), ratunek własnego w odpowiedzi na removal,
  reuse własnego ETB (value, nie strata!), mana wroga (czy przerzuci?),
  limit ręki wroga (bounce → cleanup-discard).

Precedensy timingu do naśladowania: M139 (tap — okna), M235
(flash-aura — kara poza oknem), M109 (protection — okno po blokach),
M236 (fog — po deklaracji ataku), M429 (rodziny params + deskryptor
tunera + anty-over-fix „wzorzec = dawna stała").

## Kroki

0. Plan (ten plik) — commit.
1. POMIAR PRZED: sonda `/tmp/pmssb1-bounce-przed.mjs` (kiedy/co bot
   odbija w grach? remisy bounce? które wymiary płaskie?) + inwentarz
   kart bounce (11) i ich okien (instant vs sorcery!).
2. AUDYT: macierz kierunek × cel × timing × stan (wpisana do tego planu
   jako aneks po pomiarze) + decyzje wartości (bazy/wagi/okna).
3. IMPLEMENTACJA: rodzina `bounce*` w `heuristic-params.js` +
   `bounceTargetValue()` wspólna dla cast_spell/activate_ability/trigger
   (L41) + deskryptor `bounce` w `tools/tune-card.mjs` (T1) +
   ewentualne dane z engine (jeśli widok nie niesie czegoś do audytu).
4. TESTY: `test/audyt-pmssb1-bounce.test.js` (wzorzec M429: decide/trace,
   anty-over-fix, pokrętła-sterują) RED→GREEN + mutacje.
5. EWALUACJA: `bot-scoring-snapshot` (bez regeneracji — dowód wąskości),
   tie-audit PO (remisy bounce), mirror-eval (nowe reguły vs off),
   Żywy Tester PO (detektory + NIEWYCENIONE).
6. REPOZYTORIUM PMSSB: `docs/PMSSB.md` (best practices pętli) + wpis
   w LESSONS (numer kolejny) + oznaczenie bounce w komentarzach
   (`PMSSB-1`) — żeby nie dublować roboty.
7. Bramy (`npm test`, build, `test:all`), push po każdym kroku, PR.

## Zakres świadomie OUT

- Cuombajj (1 karta — kandydat na mikro-pętlę, nie PMSSB).
- Maszynowe strojenie wag (zakazane zleceniem; wagi przemyślane).
- Pełne B0 (ADR 0018 — tylko na komendę właściciela).

## Aneks A: pomiar PRZED (sonda /tmp/pmssb1-bounce-przed.mjs, 11 scenariuszy)

| # | scenariusz | wynik PRZED | finding |
|---|---|---|---|
| S1 | Force Away: 1/1 vs 5/5 | big 96 > small 80 | OK (M234 działa) |
| S2 | token 1/1 vs 3/3 | 3/3 (88) > token (80) | **F2**: brak premii trwałości (CR 704.5d) |
| S3 | własna main1 vs main1 wroga | 82 = 82 | **F1**: brak TIMINGU (instant płasko) |
| S4 | Invasive: land/stwór/ETB | land −20 > ETB −28 | **F4**: brak reuse-ETB (land wygrywa z value) |
| S5 | 1/1+z-aurą vs goły 5/5 | 5/5 (96) > aura (80=80!) | **F3**: aury nie liczą (rozjazd L41 z triggerem) |
| S6 | Academy: cel | 35 vs 34 | OK (trigger branch rozróżnia) |
| S7 | Expunge na stosie w mojego | wrogi 1/1 (80) >> własny (−113) | **F5**: brak RATUNKU (M91 flat −90) |
| S8 | Academy-wroga vs 4/4 | REMIS 92/92 | **F6**: powtórka ETB gratis (anty-value) |
| S9 | drogi (6) vs tani | fat 108 > cheap 80 | OK (M234 TMC) |
| S10 | Vanish: 5/5 vs 1/1 | REMIS 38/38 | **F7**: Vanish poza REMOVAL_EFFECTS |
| S11 | top (5 many) vs bottom (2 many) | REMIS 80/80 | **F8**: brak skali siły top/bottom/hand |

Bonus: gałąź `return_to_hand` (cast_spell:5356) + parametry
`bounceEnemyBase/Weight` są MARTWE (typ nie występuje w kartach ani
silniku) — precedens usuwania: M239/2. S11 wykrył też kandydata na
PMSSB-2: koszt many czaru nie wchodzi do wyceny (5 vs 2 many, remis).

## Aneks B: decyzje audytu (fale jak M429 A1/A2/A3)

Zasada anty-over-fix (M429): najsłabszy realny wariant (goły 1/1 wroga,
bez kontekstu) = dawna wartość; nowe wymiary to DOPŁATY/KARY.
Wszystkie dane w PlayerView (token, aury, cardDef-ETB, stos+cele
M106/Z8, landy, liczba kart ręki mimo FoW) — BEZ zmian engine.

- Fala A (siła efektu + cel wroga): F7 (Vanish do REMOVAL_EFFECTS),
  F8 (skala hand < top < bottom), F2 (premia token-trwałość), F3 (aury
  L41 z triggera: +30 wroga / −30 własna), F6 (kara ETB-wroga),
  martwa gałąź + martwe parametry OUT (M239/2).
- Fala B (kierunek własny): F5 (ratunek formułą: wartość-stwora −
  koszt-przerzucenia − tempo, zamiast flat −90; fizzle removalu
  CR 608.2b), F4 (reuse własnego ETB vs land vs zwykły), własny token
  (kara — niszczysz!), własne aury (L41).
- Fala C (timing + stan): F1 (okna instantu: przed-atakiem-wroga,
  po-deklaracji, bloker-przy-moim-ataku, kara main1-bez-ataku
  z intentem M350/B, end-step; sorcery tylko przed-atakiem),
  lockout (mana wroga < TMC), overflow ręki (cleanup-discard),
  ratunek-przed-lethal.
- Wspólna `bounceTargetValue()` dla cast_spell + activate_ability
  (L41; katalog nie ma zdolności-bounce — test na widoku
  syntetycznym) + trigger-decyzje (rozszerzyć, nie zdublować).
- Deskryptor `bounce` w tools/tune-card.mjs (T1, jak M429).
