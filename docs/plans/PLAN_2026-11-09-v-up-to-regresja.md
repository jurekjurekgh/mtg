# Plan 2026-11-09 — zgłoszenie V: „up to two" bez komendy dla pary (regresja PR #179)

Status: etap 1 (ten plan) → w toku

Zgłoszenie właściciela (test gry): Weftblade Enhancer „put a +1/+1 counter on
each of up to two target creatures" — modal otwiera się, ale dwóch celów nie
da się zatwierdzić (Zatwierdź nieaktywne), wygląda jak powrót enumeracji
kombinacji. „O CO CHODZI???? REGRESJA?????"

POMIAR (sonda .arena/probe-weftblade.mjs, 7 kandydatów):
- silnik oferuje 9 wariantów: [2 cele zachłannie], 7 singletonów, [pusto]
  -> to model „ziarna" (triggerTargetSeedSubsets), NIE pełna enumeracja
  (pełna dałaby 1+7+21 = 29 wariantów, cap 32);
- plan kreatora czyta deskryptor poprawnie: targets=7, min=0, max=2;
- ale par z 2 celów jest 21, a komendę ma TYLKO 1 (zachłanne [mine0,mine1]):
  20/21 kombinacji nie ma odpowiednika w legalCommands, więc Zatwierdź gaśnie
  (kreator oddaje wyłącznie komendę z oferty — L48, celowo);
- execute zbudowanej pary [mine0,mine2] -> OK: silnik WALIDUJE dowolny
  podzbiór, tylko go nie publikuje.

REGRESJA: commit 7a18659 (PR #179, 2026-11-06) „G, etap 2" — przed nim silnik
publikował pełne podzbiory (cap 32), po nim ziarna. Kreator nie dostał
ścieżki „komenda zbudowana z szablonu", więc upTo dla każdej pary poza
pierwszą zachłanną jest niezatwierdzalne. Ta sama klasa u proliferate:
proliferatePlanOf daje min=0/max=7 (błędne widełki), a 21/21 par nie ma
komendy (.arena/probe-proliferate.mjs).

Plan:
1. [x] Plan + push.
2. Natywne znaczniki zbioru w komendzie (jak `damageDivision`): silnik
   oznacza ziarna `syntheticTargetSet`, kreator pozwala zbudować dowolny
   legalny podzbiór i oznacza go `constructedTargetSet`; execute akceptuje
   niepublikowane podzbiory WYŁĄCZNIE pod tym znacznikiem (brak znacznika =
   dotychczasowe, ścisłe dopasowanie do oferty — zachowanie botów i fuzzera).
   Nowy moduł `src/table/target-set-commands.js` z jedną regułą budowy.
3. Widełki kreatora liczone z liczby kandydatów i limitu (upTo: 0..count;
   dokładnie N: N..N), nie z rozpiętości opublikowanych ziaren — dotyczy
   upTo i proliferate (7 kandydatów = 0..7, dziś 0..1 / 0..7).
4. Bot: `synthesizedTriggerTargetSets` przestaje być potrzebne (kreator ma
   pełny wybór) — wycena zostaje, komendy nie.
5. Piny V/1–V/8 RED->GREEN + mutacja; bramy: npm test, build, test:all,
   sąsiednie (B1/J/G/PR136/E-Inferno/proliferate/Necrosquito).
6. Dokumentacja: raport, HISTORY, HANDOFF §14, plan [x], PR #184.

## WYNIK (2026-11-09, po wdrożeniu)

Naprawione. Objaw zmierzony na 21/21 kombinacjach: PRZED 1 para z komendą
(20 martwych „Zatwierdź"), PO 21/21. Ta sama sonda dla proliferate: 0/21 -> 21/21.

Co weszło (`ce102d6`):
1. [x] `src/table/target-set-commands.js` — jedna reguła budowy komendy dla
   wyboru gracza: najpierw oferta, poza nią szablon grupy (L41).
2. [x] `choice-request.js` tryb `targetIdsMode` — wybór spoza oferty budowany,
   ale wyłącznie w widełkach liczby celów z planu (3 cele przy „up to two"
   nadal bez komendy; pin V/9 + sąsiad B1/3).
3. [x] Piny V/1–V/9 (9/9), każdy z żywym mutantem; sąsiedzi B1/J/PR136/E/4/
   proliferate/G2 zielone; `npm test` 10244/10244; build 79/5828,2 kB.
4. [x] Dokumentacja: ten wpis, `PROJECT_HISTORY.md`, `docs/handoffs/`.

KOREKTY POMIARU (plan z etapu 1 był pisany przed sondą — te punkty okazały się
błędne i NIE zostały wdrożone; zapis, żeby nikt ich nie „dokończył"):
- „proliferatePlanOf daje błędne widełki (0–7)" — NIEPRAWDA. Widełki 0–7 są
  poprawne (ziarno „pełne" ma wszystkich kandydatów). Brakowało wyłącznie
  komendy dla wyboru spoza ziaren, a tę daje punkt 1.
- „natywne znaczniki `syntheticTargetSet`/`constructedTargetSet`, execute
  akceptuje niepublikowane podzbiory tylko pod znacznikiem" — ODRZUCONE
  pomiarem, nie gustem: pin `zgloszenie-e-inferno-podzial` E/4 wymaga, żeby
  silnik przyjmował legalny zbiór BEZ znaczników. Bramka znacznika czerwieniła
  E/4 (dwa razy, niezależnie). Kontrakt `execute` jest czysto legalnościowy
  (rozmiar ≤ count, zero tylko przy upTo, kandydaci z listy) i taki zostaje —
  **silnik nie ma w tej naprawie ANI JEDNEJ zmienionej linii logiki**, tylko
  komentarze.
- „widełki kreatora liczyć z liczby kandydatów i limitu z deskryptora" —
  ZBĘDNE: ziarno zachłanne niesie pełne `count`, więc rozpiętość ziaren daje
  poprawne 0–2. Mutant tego poszerzenia przechodził GREEN.
- „bot: usunąć `synthesizedTriggerTargetSets`" — NIE. Ta funkcja to warstwa
  POLITYKI (który zestaw bot wybierze), nie obejście braku komendy; jej
  usunięcie czerwieniło pin G2/4. Zostaje bez zmian (diff bota = 0).

Lekcja: trzy z czterech pierwotnych punktów planu były hipotezami, które
mutacje zdjęły. Plan jest mapą, nie zobowiązaniem — przy każdej linii pytanie
„który pin czerwienieje, gdy ją cofnę?".
