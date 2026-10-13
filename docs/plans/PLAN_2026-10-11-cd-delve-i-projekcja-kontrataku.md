# PLAN 2026-10-11 C–D — Delve w Mana Wizardzie i projekcja kontrataku

Zlecenie właściciela obejmuje dwie uwagi z żywej gry. **C/C2**: Delve ma być
częścią jednej płatności w Mana Wizardzie (mana i karty własnego cmentarza), a
nie osobną decyzją dopiero po zebraniu pełnego kosztu many. **D**: bot nie może
atakować wszystkimi stworami, gdy zostawienie choć jednego legalnego blokera
chroni go przed oczywistym lethalem w następnej turze, także gdy przyszły
atakujący ma dziś defendera, ale może opłacić generyczną zdolność uchylającą to
ograniczenie.

Gałąź sesji: `arena/8ec8f610-mtg`; otwarty PR: **#163**. Zmiany powstają w
małych zielonych commitach, pushowanych przyrostowo bez force-pusha.

## Stan wejściowy i źródła reguł

- HEAD: `5706b79`; drzewo czyste.
- Baseline: `npm test` **8051/8051**; build **73 moduły / 5025,4 kB**.
- Silnik już potrafi atomowo przyjąć `delveExileIds`, ogranicza wygnanie do
  generycznej części ustalonego kosztu i oferuje rzut, jeśli mana razem z
  legalnymi kartami cmentarza wystarcza. Rozjazd jest w stole: obecny Mana
  Wizard wymaga pełnej many, a potem silnik otwiera drugi wizard Delve.
- Bot liczy przyszły atak wyłącznie ze stworów bez `cantAttackStatic` oraz
  odejmuje od jego mocy sumę wytrzymałości gardy. Pierwsze pomija opłacalną
  aktywację Krotiqa, drugie błędnie zakłada przebicie zwykłego legalnego bloku
  przez atakującego bez trample.
- Aktualne Comprehensive Rules pobrano ponownie 2026-10-11 zgodnie z ADR 0030
  (`.arena/cr-current.txt`, SHA-256
  `8d860e451f20f38865b725b42d82feb714c725373dd8f3b32b8652b3eeb070ca`):
  CR 702.66a–c (Delve zastępuje wyłącznie generyczną część płatności),
  CR 509.1h i 510.1b–c (zablokowany atakujący bez trample nie zadaje obrażeń
  graczowi) oraz CR 702.19a–b (nadmiar może przejść dopiero dzięki trample po
  przypisaniu lethal blokerom).

## C/C2 — wspólna płatność mana + Delve

### C1. RED modułu Mana Wizarda

- [x] Przypiąć deskryptor/postęp dla kosztu z pipem kolorowym i generykiem:
  wybrane karty grobu zmniejszają tylko brakującą część generyczną; nie
  pokrywają pipa koloru.
- [x] Przypiąć płatność mieszaną: część kosztu z puli/źródeł, reszta przez
  zaznaczone karty własnego grobu.
- [x] Przypiąć limit wygnania do efektywnego generyku po obniżkach oraz stan
  nielegalny po przekroczeniu limitu.
- [x] Przypiąć render jednego modala: źródła many i zaznaczalne karty Delve,
  bieżący koszt/postęp, zatwierdzenie dopiero po pokryciu sumy i kolorów.
- [x] Mutacja RED: przywrócić pełne `totalNeeded` mimo zaznaczonego Delve albo
  pozwolić Delve pokryć kolor; oba właściwe piny muszą upaść.

### C2. GREEN i produkcyjny pin stołu

- [x] Do deskryptora rzutu Delve dołączyć kandydatów z własnego cmentarza,
  dokładny limit generyczny i trwały w obrębie modala wybór identyfikatorów.
- [x] Mana Wizard ma otwierać się także wtedy, gdy sama mana nie wystarcza,
  lecz legalna wspólna płatność istnieje. Każdy wybór karty ma odświeżać ten
  sam postęp co tapnięcie źródła.
- [x] Końcowa komenda ma nieść `delveExileIds` od razu; silnik ma wykonać
  atomowy rzut bez `pendingDelveExile` i bez drugiego modala.
- [x] Gdy już zebrana pula sama wystarcza, nie rzucać automatycznie przed
  daniem graczowi wyboru Delve; dla rzutu Delve wymagać jawnego zatwierdzenia.
- [x] Test produkcyjny UI: przy niewystarczających samych lądach, ale
  wystarczających lądach + grobie, oferta jest widoczna; po kliknięciu jeden
  Mana Wizard pozwala zaznaczyć karty, dobrać kolor z lądu i rzuca bez
  pośredniej decyzji `resolve_delve_exile`.
- [x] Zachować i przypiąć zwykły przebieg bez Delve oraz dotychczasową
  atomową walidację silnika.

**Oczekiwany commit C:** `fix(ui): połącz płatność many i Delve` — dopiero po
celowanych testach C, mutacji i pełnym `npm test` + build.

## D — przyszły atak i legalne bloki

### D1. Produkcyjny RED decyzji bota

- [x] Zbudować stan z prawdziwego `krotiq-nestguard`: człowiek 9 życia,
  tapnięty Krotiq o efektywnych statystykach 8/8, trzy Foresty wystarczające na
  `{2}{G}`; bot 3 życia i nietapnięte stworzenia 1/3, 1/3, 2/3.
- [x] Wejść produkcyjnie przez `playerView` i `createHeuristicBot`, a wybraną
  komendę sprawdzić przez `execute`.
- [x] RED ma wykazać, że obecny scoring deklaruje wszystkich trzech; właściwy
  wynik zostawia co najmniej jednego legalnego blokera.

### D2. GREEN generycznej projekcji

- [x] Rozpoznać przyszłego atakującego po publicznym deskryptorze aktywowanej
  zdolności (`losesKeywords: defender` albo
  `attack_as_though_no_defender_until_end_of_turn`), nigdy po nazwie/cardId.
- [x] Sprawdzić przyszłą opłacalność zdolności z publicznych źródeł many,
  pełnej liczby jednostek i dopasowania kolorowych pipów; tapnięte zwykłe
  źródła uwzględniać po nadchodzącym untapie, z zachowawczym wykluczeniem
  trwałych blokad odtapnięcia.
- [x] Zastąpić `moc − suma wytrzymałości gardy` projekcją legalnych bloków:
  atakujący bez trample zadaje graczowi 0 po legalnym bloku; trample przechodzi
  dopiero ponad lethal; respektować ewazję i menace przez wspólny
  `attackerCanBeBlocked`.
- [x] Ustalić, czy istnieje przydział różnych blokerów pozwalający przetrwać
  oba zegary (życie i poison), zamiast odejmować tę samą gardę niezależnie od
  obu walut.
- [x] Zachować korektę stworów przeciwnika, które muszą blokować obecny lethal
  i zginą przed kontratakiem.
- [x] Doprecyzować anty-over-fix istniejącego testu „garda i tak nie
  wystarcza”: taki przebijający 5/5 musi mieć trample; bez trample pojedynczy
  legalny blok rzeczywiście chroni gracza w tej walce.
- [x] Piny: brak many/koloru nie odblokowuje defendera; trample może sprawić,
  że mały bloker nie ratuje; zwykły atakujący zostaje całkowicie zatrzymany.
- [x] Mutacja RED: wyłączyć wykrywanie przyszłej aktywacji oraz osobno
  przywrócić odejmowanie toughness; dokładny scenariusz ma upaść w obu
  kierunkach.

**Oczekiwany commit D:** `fix(bot): zachowaj bloker przed lethalnym kontratakiem`
— dopiero po testach celowanych, mutacjach, benchmarku i pełnym `npm test` +
build.

## Bramy i domknięcie

Po każdym samodzielnym przyroście:

1. testy celowane RED/GREEN;
2. jawna mutacja/rewers root cause i ponowny GREEN po cofnięciu mutacji;
3. `npm test` cicho do `.arena/`;
4. `npm run build` cicho do `.arena/`;
5. commit i push na `arena/8ec8f610-mtg`.

Po C i D łącznie:

- [x] pełne `npm run test:all`;
- [x] `node --test test/bot-scoring-snapshot.test.js` (bez regeneracji, chyba że
  pierwszy świadomy rozjazd zostanie zbadany i udokumentowany);
- [x] `node --test test/bot-benchmark.test.js`;
- [x] końcowe `npm test` i build na zamrożonym drzewie;
- [x] aktualizacja tego planu, `docs/PROJECT_HISTORY.md`, handoffu i opisu PR
  #163 z dokładnymi wynikami;
- [x] push dokumentacji jako osobny zielony commit i potwierdzenie GitHub CI.

## Ryzyka i strażniki

- Nie przenosić Delve do osobnej akcji UI: jedna deklaracja kosztu ma wysłać
  mana + `delveExileIds` atomowo.
- Nie odejmować wygnanych kart od całej sumy bez niezależnego pokrycia pipów
  kolorowych; Delve nigdy nie jest kolorową maną.
- Nie opierać legalności UI na samej liczbie kart grobu: kandydaci muszą być
  własnymi kartami nadal obecnymi w grobie, a ostatecznie waliduje silnik.
- Nie branchować po Krotiqu. Mechanizm ma działać dla każdego publicznego
  efektu uchylającego defender i każdego kosztu o tym kształcie.
- „Bloker absorbuje toughness” jest poprawnym przybliżeniem wyłącznie dla
  trample; bez trample cały atak pozostaje zablokowany (CR 509.1h/510.1b).
- Test dokładnego D nie może ręcznie dopisać do widoku zdolności Krotiqa:
  musi przejść przez materializację prawdziwej karty i `playerView`.


## Podsumowanie realizacji

- Plan: `2ecbb68`; C: `5ae96ae`; D: `74f7b60`. Każdy przyrost został
  wypchnięty osobno po zielonym fast + build.
- **C/C2:** Hooting Mandrills jest produkcyjnie oferowany przy dwóch lądach i
  sześciu kartach grobu. Jeden Mana Wizard pozwala wybrać pięć kart, tapnąć
  wyłącznie Forest na {G} i wysyła gotowe `delveExileIds`; nie powstaje
  `pendingDelveExile`. Zwykłe płatności zachowują auto-domknięcie, Delve ma
  jawne zatwierdzenie. Mutacje „ignoruj wkład Delve” i „pozwól ominąć kolor”
  zostały zabite przez C/1.
- **D:** produkcyjny widok prawdziwego Krotiqa 8/8 publikuje defender i
  aktywację `{2}{G}`. Trzy tapnięte Foresty są poprawnie liczone po przyszłym
  untapie; dwa Foresty ani trzy Island nie wystarczają. Projekcja legalnych
  bloków rozdziela życie i poison, respektuje menace/ewazję/protection oraz
  przepuszcza nadmiar dopiero przy trample. W dokładnej scenie bot atakuje
  dwoma stworami i zostawia jedno. Obie niezależne mutacje — pominięcie
  przyszłej aktywacji i przywrócenie „moc minus toughness” — zostały zabite.
- Bramki finalnego kodu: C-targeted **37/37**, produkcyjne UI C2 **1/1**,
  rodzina gardy D **11/11**, `npm test` **8060/8060**,
  `npm run test:all` **8325/8325**, golden master **4/4 bez regeneracji**,
  benchmark **10/10**, build **73 moduły / 5039,4 kB**.
- GitHub CI dla commitów kodu: **SUCCESS**, run
  [`38176394735`](https://github.com/jurekjurekgh/mtg/actions/runs/38176394735).
