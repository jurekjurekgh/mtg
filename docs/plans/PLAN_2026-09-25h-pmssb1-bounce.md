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
