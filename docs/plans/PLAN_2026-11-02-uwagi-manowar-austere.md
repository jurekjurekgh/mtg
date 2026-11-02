# Uwagi ze stołu: Man-o'-War i modale permutacyjne (2026-11-02)

Priorytet właściciela przed dalszym audytem #177. Zmiany A74 pozostają zachowane; audyt nie jest zamknięty.

1. [ ] Odtworzyć rzeczywistą decyzję bota z Man-o'-War bez obcych stworów oraz kontrolę z legalnym obcym celem; zrozumieć ogólną wycenę obowiązkowego ETB, bez zakazu legalnego rzutu człowieka i bez twardego ID karty. Testy RED→GREEN, sprawdzić inne ETB i legalność celu (ochrona itd.).
2. [ ] Odtworzyć interfejs Austere Command. Zastąpić listę par kreatorem czterech oryginalnych trybów z wyborem dokładnie dwóch i zatwierdzeniem; zachować semantykę i kolejność efektów oraz istniejący protokół/replay, sprawdzić wszystkie sześć par i dostępność.
3. [ ] Przeanalizować wspólne punkty wejścia modalów i istniejące sortery/pickery. Zablokować regresję menu enumerującego permutacje dla co najmniej dwóch opcji (nie zakazywać wyborów, w których rzeczywista kolejność jest istotna: musi je obsłużyć kreator porządku), objąć strażnikiem rodziny decyzji, a nie wyłącznie nazwę Austere; testować mutacyjnie i jawnie wskazać ograniczenia wykrywania.
4. [ ] Testy celowane, fast, właściwe slow/build; osobne commity przyrostowe i push na gałąź sesji, aktualizacja historii/handoffu/PR. Bez pełnego B0. Potem wrócić do A74/audytu #177.
