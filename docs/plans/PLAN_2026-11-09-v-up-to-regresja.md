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
