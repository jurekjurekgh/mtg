# Zgłoszenie N — Magma Pummeler i wybór X

## Cel

Jedna oferta rzucenia permanentu z kosztem X, a po jej wybraniu modal ze stepperem X i zatwierdzeniem. Przy trzech górach legalne X = 0–1. Bez zmiany reguł opłacania kosztu, automatycznego wyboru bota ani innych niezależnych decyzji w rzucie. Wybrana komenda pochodzi z `legalCommands`.

## Kolejność i kryteria

1. [x] Zidentyfikować kształt komend i istniejący kreator wyboru X; Oracle/ruling Magma Pummeler w `docs/cards/scryfall-magma-pummeler.json`.
2. [ ] Przypiąć RED dla rzeczywistej karty i trzech gór: jedna oferta, tytuł, stepper 0–1, działający plus/minus, zatwierdzenie wysyła odpowiednią legalną komendę, X=0 także legalne. Negatywne kontrole dla mieszanych decyzji, kosztów i istniejącego Epic Experiment.
3. [ ] Naprawić wspólną ścieżkę prezentacji permanentów z X, bez rozpoznawania karty. Przetestować interakcję z kreatorem many; nie gubić innych wymiarów komendy.
4. [ ] Uruchomić `npm test`, `npm run build`, żywego testera stołu dla UI; opisać wyniki, commit i push.
5. [ ] Kontynuować i dokończyć audyt #177 według planu audytu; nie zatrzymywać się po jednym przyroście. Pełny benchmark B0 wyłącznie na wyraźne polecenie właściciela.

## Ryzyka

Silnik enumeruje komendy permanentu z `xValue` bez pola `targets`, podczas gdy istniejący kreator przyjmuje wyłącznie `targets`-tablicę. Nie wolno zgubić wariantów płatności, celów, kosztów ani pomylić X=0 z brakiem X; nie przyjmować nielegalnych X ani nie generować komend niezależnie od silnika. Osobno zweryfikować granice oferty i jawny limit X.
