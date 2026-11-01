# Uwagi z gry O, P, R — 2026-11-01

PR #178 jest otwarty. Priorytet właściciela: poniższe trzy zgłoszenia przed dalszym audytem PR #177; po nich kontynuować audyt bez przerywania po etapach. Naprawa Magma Pummeler N została wypchnięta (`80b3556`): modal ma stepper X, nie permutacje.

## O — Fledgling Imp

- [ ] Odtworzyć aktualną błędną decyzję: zdolność w Main 1 mimo mało istotnego 1/1 / celu usuwanego czarem, strata karty z ręki.
- [ ] RED dla określonych przez właściciela okien i wartości: przed blokowaniem atakującego przeciwnika, gdy Imp z lataniem może go zabić; przed własnym atakiem, gdy przeciwnik ma nielatające stwory o wytrzymałości >2 i brak latających. Nie uruchamiać zdolności w innych, nieopłacalnych momentach. Sprawdzić legalność walki oraz odpowiedzi na stosie, nie zakładać z samej nazwy kroku.
- [ ] Odrzucana karta musi być nierzuçalna przy aktualnych lądach bota; przy braku takiej karty zdolności nie używać. Ustalić istniejącą konwencję rzucalności, również kolory/koszty i dostępne źródła, zabezpieczyć wybór w faktycznym kroku opłaty, nie tylko wycenę oferty.
- [ ] Nie zmieniać reguł aktywacji ani decyzji człowieka; podejście generyczne po kształcie zdolności, bez twardej nazwy karty.

## P — Fireball

- [ ] RED: X=1/2 bez presji nie marnuje czaru na małego stwora; X≥3 użyteczne, wyjątek niskiego życia jak obecna polityka Magma Pummeler. Zachować wygraną/lethal, faktycznie legalne warianty i wybory wielu celów; sprawdzić pokrewne czary X i istniejące testy, aby nie rozszerzyć progu bez uzasadnienia.
- [ ] Naprawić wycenę bota, nie legalność ani wybór gracza.

## R — Infectious Bloodlust

- [ ] RED przez prawdziwą aurę i `playerView` → render kafla: gospodarz dostaje badge „Atakuje w każdej turze jeśli może”; poprawnie znika po odłączeniu/odejściu. Uwzględnić kontrolu, tapnięcie i wiele źródeł; `if able` nie oznacza przymus ataku ponad zakazy.
- [ ] Generyczny descriptor/warstwa przyłączy, bez nazwy karty i z zachowaniem innych badge'y.

## Bramy i kontynuacja

Każde niezależne zgłoszenie: test RED→GREEN, pokrewne regresje, `npm test` i `npm run build` do ignorowanych logów z zachowanym kodem wyjścia; żywy tester tam, gdzie możliwe; osobne przyrostowe commity i push. Nie uruchamiać pełnego benchmarku B0 bez polecenia. Na końcu uaktualnić PR i kontynuować audyt #177, m.in. niezakończoną analizę ostrzeżenia animacji i pozostałych plików.

## Przyrost O — stan po testach

Wycena kosztownego grantu latania na źródło blokuje Main 1 i inne jałowe okna. Przed własną walką wymaga istotnego blokera naziemnego i braku latających, przed blokami wrogiego latającego sprawdza lethal i pierwsze uderzenie. Wybór kosztu preferuje wyłącznie nierzucalne karty; brak takiej karty blokuje aktywację bota. Mana bazy liczona jest zachowawczo także z tapniętych lądów (żeby nie odrzucać czaru, który będzie można opłacić po ich odkręceniu); lądy i karty za 0 nie są traktowane jako zbędne czary. Reguły człowieka bez zmian.

RED: 4/6 nowych testów padały; po poprawce 10/10 nowych oraz pokrewne 42/42. Stare pozytywne oczekiwania z Main 1/rzucalnym Brute Force zmieniono zgodnie z nowym poleceniem. Pełne szybkie testy 9197/9197, build 76 modułów / 5621,4 kB. Pełnej symulacji wszystkich ograniczeń walki nie twierdzimy; niedokończone P, R i audyt #177 pozostają otwarte.

## Przyrost P — Fireball

Ograniczenie wyłącznie dla opisanej przez `spell.fireball` rodziny: X poniżej istniejącego progu 3 nie jest atrakcyjny, chyba że wygrywa natychmiast lub przy presji życia faktycznie zabija wrogiego stwora. Wartość na cel uwzględnia równy podział X. Reguły i oferty dla człowieka bez zmian; próg i wyjątek wykorzystują istniejące parametry. RED 3/6 nowych przypadków, po poprawce GREEN 6/6 oraz 51 testów pokrewnych; szybkie testy 9203/9203, build 76 modułów / 5622,3 kB. R i audyt #177 pozostają otwarte.
