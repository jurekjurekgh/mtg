# Uwagi ze stołu: Man-o'-War i modale permutacyjne (2026-11-02)

Priorytet właściciela przed dalszym audytem #177. Zmiany A74 pozostają zachowane; audyt nie jest zamknięty.

1. [x] Odtworzyć rzeczywistą decyzję bota z Man-o'-War bez obcych stworów oraz kontrolę z legalnym obcym celem; zrozumieć ogólną wycenę obowiązkowego ETB, bez zakazu legalnego rzutu człowieka i bez twardego ID karty. Testy RED→GREEN, sprawdzić inne ETB i legalność celu (ochrona itd.).
2. [x] Odtworzyć interfejs Austere Command. Zastąpić listę par kreatorem czterech oryginalnych trybów z wyborem dokładnie dwóch i zatwierdzeniem; zachować semantykę i kolejność efektów oraz istniejący protokół/replay, sprawdzić wszystkie sześć par i dostępność.
3. [x] Przeanalizować wspólne punkty wejścia modalów i istniejące sortery/pickery. Zablokować regresję menu enumerującego permutacje dla co najmniej dwóch opcji (nie zakazywać wyborów, w których rzeczywista kolejność jest istotna: musi je obsłużyć kreator porządku), objąć strażnikiem rodziny decyzji, a nie wyłącznie nazwę Austere; testować mutacyjnie i jawnie wskazać ograniczenia wykrywania.
4. [x] Testy celowane, fast, właściwe slow/build; osobne commity przyrostowe i push na gałąź sesji, aktualizacja historii/handoffu/PR. Bez pełnego B0. Potem wrócić do A74/audytu #177.

Wynik: realny RED Man-o'-War (3/4), naprawa; mutacja daje 3 RED. Austere: 4 checkboxy, 6 par faktycznie rozstrzygniętych; wspólna blokada tablic kombinacji i złożonych trybów, mutacja daje 3 RED, inwentarz `choose two`. Ograniczenie: niezadeklarowana semantyka zapisana jako arbitralne wartości skalarne nie jest automatycznie rozpoznawalna; nowe kształty wymagają metadanych i testów. Related 158/158 (przed dodatkowym testem sześciu par), fast 9611 pass + 1 jawne TODO A74, build 77/5656,3 kB; slow 268/268.

Dodatkowe kontrole: prawdziwy Magic Damper daje hexproof, produkcyjny router pokazuje cztery checkboxy i wysyła wybraną parę, bramka rozpoznaje skorelowane pola tablicowe. Fast 9609 pass + 1 TODO, related 248/248, build 77/5656,3 kB. Slow 268/268 sprzed zaostrzenia strażnika; ponowny slow 268/268.

Wykryto dalszy wariant tego samego problemu: Austere z Epic Experiment (sześć par) i w oknie Vaan (błędem kończył strażnik). Dwa testy produkcyjnego routingu/DOM RED→GREEN: karta lub odmowa najpierw, następnie 4 oryginalne tryby. Fast 9611 pass + 1 TODO, related 248/248, build 77/5656,3 kB; finalny slow 268/268.
