# PLAN 2026-08-07 — Poprawki: stos permanentów i pozostałe luki (PR #32)

Cel: usunięcie wszystkich Jawnych Ograniczeń i luk znalezionych w sesjach
poprzednich (HANDOFF 2026-08-07, M43–M48). Naprawy u ROOT CAUSE, bez
maskowania. Każdy temat = osobny commit + testy + aktualizacja
`support.limitations` (żadnych „Jawnych Ograniczeń").

## T1 (KRYTYCZNY) — Permanenty na stosie: rzut i rozstrzyganie (CR 601/608/702)

**Błąd:** `castPermanent` przenosi obiekt z ręki OD RAZU na pole bitwy.
Przeciwnik nie może odpowiedzieć instanitem na rzut stwora (Stoic Rebuttal
nie kontruje stworów), ETB/liczniki/bloodthirst rozstrzygają się w chwili
rzutu zamiast po rozstrzygnięciu, a timing sorcery nie pilnuje pustego stosu.

**Fix (root cause — ścieżka rzutu):**
1. `castPermanent` (resources.js): po opłaceniu kosztów obiekt ląduje na
   STOSIE (`stack-*`) z patchami LKI (summoningSickness, wasCast,
   manaFromTreasureSpent, wasKicked, faceDown+abilities) — zdarzenie
   `permanent_cast` niesie obiekt na stosie. `entersWithCounters` i
   bloodthirst PRZENOSIMY do rozstrzygnięcia.
2. `resolveTopOfStack` (spells.js): gałąź dla obiektu BEZ `object.spell`
   (czar permanentu) → wejście na pole bitwy (nowe id, patch faceDown/
   manaFromTreasureSpent z LKI stosu), liczniki ETB, bloodthirst, zdarzenia
   `permanent_entered_battlefield` + `spell_resolved{permanent:true}`.
3. `castAdventureCreature` (spells.js): strona-stwór przygody też na stos
   (to rzut czaru, CR 715.3).
4. Discover „cast without paying" (game-state.js): gałąź permanentu też na
   stos (to też rzut czaru).
5. Timing sorcery: `castPermanent` (non-flash) i `playLand` wymagają
   PUSTEGO stosu (CR 307.1/305.2) — walidacja execute + oferty playerView.
6. Triggery ETB skanują wyłącznie `permanent_entered_battlefield`/
   `object_moved`→battlefield/`land_played` — NIE `permanent_cast`
   (obiekt na stosie to nie wejście; cast triggery zostają przy rzucie).
7. Kontrczary: `spell_on_stack`/`noncreature_spell_on_stack` obejmują
   czary-permanenty (generyczne — weryfikacja + testy Negate/Stoic).
8. UI/log: stos pokazuje czary-permanenty; face-down na stosie ukryty dla
   przeciwnika (CR 708.2); etykiety session.describeEvent dla
   `spell_resolved{permanent}`.
9. Migracja testów: ~190 wywołań cast_permanent → po rzucie runda passów
   (wzorzec `passBoth`); nowe testy `test/permanent-stack.test.js`
   (odpowiedź instanitem, kontr, ETB po rozstrzygnięciu, cast trigger przy
   rzucie, timing sorcery, morph na stosie).

## T2 — Cele triggerów jako decyzje gracza (CR 603/115.1b)

**Błąd:** `findTriggerTarget` (triggers.js) wybiera cele deterministycznie
dla 14 kart (Forge Devil, Reclusive Artificer, Selhoff Occultist,
Cloudbound Moogle, Lodestone Needle, Puppeteer Clique, Kappa Tech-Wrecker,
Kor Sanctifiers, Skilled Animator, Canonized in Blood, Servant of the
Scale, Chittering Rats, Jill, Greatsword of Tyr) + deterministyczne
„you may" Angel's Feather.

**Fix (root cause — generyczny wzorzec decyzji):**
1. Nowa kolejka `state.pendingTriggerTargets` + komenda
   `resolve_trigger_target` (gate w execute, oferty w playerView,
   `firstPendingDecisionPlayerId`, auto-skip ślepych decyzji — wzorzec
   pendingDeliriumTargets/pendingMentorTargets).
2. `tryFire` z `requiresTarget` kolejkuje decyzję zamiast strzelać od razu;
   przy rozstrzygnięciu ponowna walidacja (intervening-if, hexproof,
   kandydaci dynamiczni — jak delirium/mentor).
3. Kolejność ofert = dotychczasowa polityka deterministyczna (boty biorą
   pierwszą ofertę — zachowanie i seedy bez zmian).
4. „Up to one" (Jill, Greatsword) i „you may" (Reclusive Artificer,
   Kappa — etap usuwania licznika, Angel's Feather) dostają opcję
   „brak celu / nie" — decyzja realna.
5. Zoraline: porządek MtG — NAJPIERW decyzja płatności, PO zapłacie decyzja
   celu reanimacji (dziś cel wybierany przed płatnością).
6. Sprzątnięcie limitations: kappa/zoraline/puppeteer/canonized/jill/
   greatsword/selhoff/reclusive/forge/cloudbound/lodestone/servant/
   chittering/kor/skilled/angels-feather.

## T3 — Auto-tap: pipy kolorów płacone WYŁĄCZNIE właściwą maną (CR 601.2h/106.4)

**Błąd (resztowe M40/M41):** gdy pula ≥ koszt, `spendMana` nie tapuje
landów i `consumeManaPool` cicho płaci pip koloru jednostką innego koloru
(np. {U} z {W} przy nietapniętej Wyspie). `canPayColoredCost` sprawdza
pulę + nietapnięte źródła, ale płatność używa tylko puli — rozjazd oferty
i wykonania.

**Fix (root cause — spendMana/consumeManaPool):**
1. `spendMana`: jeśli pipy nie są pokryte przez SAMĄ pulę, do-tapuj źródła
   kolorowopasujące (nawet gdy suma many już wystarcza), potem dopiero
   dopełniaj sumę; brak pokrycia → twardy błąd (nie cicha zła płatność).
2. `consumeManaPool`: asercja sukcesu matchPips — nieudane dopasowanie
   rzuca zamiast konsumować niewłaściwe jednostki.
3. Testy: {U} z puli {W}+Wyspa; {W}{U} z mieszanych źródeł; pipy po
   auto-tapecie.

## T4 — Mulligan londyński (CR 103.4)

**Błąd:** gra zaczyna się bez mulligana (setup rozdaje 7 bez decyzji).

**Fix:** po rozdaniu otwarcia decyzja `resolve_mulligan_choice{keep}` dla
każdego gracza (kolejność jak w MtG: zaczyna gracz pierwszy); mulligan =
tasowanie ręki do biblioteki + dobranie 7 + odłożenie N kart na spód
(N = liczba mulliganów; wybór kart = decyzja `resolve_mulligan_bottom_choice`
— wzorzec discard). Boty: deterministyczna polityka keep (ręka bez ziemi /
same ziemie → mulligan). Mulligan darmowy jest tylko pierwszy? NIE —
London: każdy mulligan kosztuje (bottom N).

## T5 — Regeneracja (CR 701.12) — warunkowo, z pierwszą kartą

Żadna z 138 kart katalogu nie używa regeneracji — implementacja bez karty
to martwy kod bez testu reguł. Wpis: realizowane razem z pierwszym batchem
zawierającym kartę z regeneracją (replacement would-die → tap+remove
damage, CR 701.12). Nie jest to ograniczenie żadnej obsługiwanej karty.

## T6 (NASTĘPNA SESJA) — Triggery na stosie (CR 603.3)

Dziś efekty triggerów rozstrzygają się od razu (bez okna priorytetu).
Największa zmiana po T1: trigger = wpis na stos + runda passów + ponowna
walidacja. Wymaga przebudowy processTriggers/fireTrigger i wpływa na WSZYSTKIE
karty z triggerami (licznik: ~80 kart). Świadomie poza zakresem tej sesji —
T1-T4 to warstwa krytyczna; T6 dostaje własny plan po ich scaleniu.

## Porządek prac

1. Ten plan (commit 1).
2. T1: engine → testy nowe → migracja starych → przelosowanie zamrożonych
   seedów (table-session/session-abilities/table-ui) → B0 (progi 0.78/0.57
   tylko w górę) → docs.
3. T2 → T3 → T4 (każdy: engine → testy → B0 → docs).
4. Na koniec: sprzątnięcie pozostałych nieaktualnych wpisów limitations,
   aktualizacja PROJECT_STATE + HANDOFF.
