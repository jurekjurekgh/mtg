# Zgłoszenie N — Magma Pummeler i wybór X

## Cel

Jedna oferta rzucenia permanentu z kosztem X, a po jej wybraniu modal ze stepperem X i zatwierdzeniem. Przy trzech górach legalne X = 0–1. Bez zmiany reguł opłacania kosztu, automatycznego wyboru bota ani innych niezależnych decyzji w rzucie. Wybrana komenda pochodzi z `legalCommands`.

## Kolejność i kryteria

1. [x] Zidentyfikować kształt komend i istniejący kreator wyboru X; Oracle/ruling Magma Pummeler w `docs/cards/scryfall-magma-pummeler.json`.
2. [x] Przypiąć RED dla rzeczywistej karty i trzech gór: jedna oferta, tytuł, stepper 0–1, działający plus/minus, zatwierdzenie wysyła odpowiednią legalną komendę, X=0 także legalne. Negatywne kontrole dla mieszanych decyzji, kosztów i istniejącego Epic Experiment.
3. [x] Naprawić wspólną ścieżkę prezentacji permanentów z X, bez rozpoznawania karty. Przetestować interakcję z kreatorem many; nie gubić innych wymiarów komendy.
4. [x] Uruchomić `npm test`, `npm run build`, żywego testera stołu dla UI; opisać wyniki, commit i push.
5. [ ] Kontynuować i dokończyć audyt #177 według planu audytu; nie zatrzymywać się po jednym przyroście. Pełny benchmark B0 wyłącznie na wyraźne polecenie właściciela.

## Ryzyka

Silnik enumeruje komendy permanentu z `xValue` bez pola `targets`, podczas gdy istniejący kreator przyjmuje wyłącznie `targets`-tablicę. Nie wolno zgubić wariantów płatności, celów, kosztów ani pomylić X=0 z brakiem X; nie przyjmować nielegalnych X ani nie generować komend niezależnie od silnika. Osobno zweryfikować granice oferty i jawny limit X.

## Wynik

Test `test/zgloszenie-n-magma-wybor-x.test.js`: 5 przypadków, w tym RED→GREEN dla braku planu i singletonu X=0, granice i tożsamość komendy, koszt, różne kształty płatności oraz rozstrzygnięcie X=0/1. Regresja Epic Experiment 6/6. `npm test` 9185/9185, build 76 modułów / 5618,4 kB. Żywy tester seed 42, talia tymczasowa usunięta po próbie: dla dwóch Gór X=0 i śmierć 0/0; dla trzech Gór X=1, wejście z licznikiem oraz późniejszy trigger. Brak zgłoszeń detektorów; jsdom nie bada wyglądu.

Stepper bierze skrajne wartości z legalnych komend i nie tworzy ruchów samodzielnie. Istniejący silnik/karta ograniczają X do 15 (`xCost.cap`), nawet przy większej dostępnej manie; nie zmieniano tego wcześniejszego ograniczenia w naprawie UI. Pozostałe wymiary nie są ukrywane: nieprosty kształt komend nie trafia do nowego planu.
