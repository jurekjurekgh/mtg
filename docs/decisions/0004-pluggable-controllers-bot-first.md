# ADR 0004: Wymienne kontrolery i bot algorytmiczny jako pierwszy przeciwnik

- **Status:** Zaakceptowana
- **Data:** 2026-07-31
- **Decydenci:** właściciel projektu

## Kontekst

Dzisiejszy przeciwnik korzysta z zewnętrznego chatbota: właściciel przekleja snapshot i ręcznie wykonuje jego decyzję. Taki przepływ jest wolny, trudny do odtworzenia i zależny od jakości niedeterministycznej odpowiedzi.

Nie jest jednak wykluczone, że w przyszłości LLM lub bardziej zaawansowany algorytm będzie użyteczny strategicznie.

## Decyzja

Engine udostępni wspólny protokół kontrolera. Człowiek, bot losowy, bot regułowy/heurystyczny, search bot i opcjonalny agent LLM będą wymiennymi implementacjami tej samej roli.

Pierwszą automatyczną implementacją będzie prosty bot przydatny do testów, a pierwszym celem grywalnym — bot algorytmiczny/heurystyczny. LLM nie jest wymagany do pierwszej wersji i nigdy nie rozstrzyga legalności.

Kontroler wybiera z działań i opcji przedstawionych przez engine. Może być lekko randomizowany w sposób kontrolowany.

## Konsekwencje

### Pozytywne

- Brak kosztu i opóźnień LLM w podstawowej grze.
- Powtarzalne testy oraz możliwość diagnozowania decyzji.
- Późniejsze AI nie wymaga przebudowy engine.
- Random bot może eksplorować wiele ścieżek i wykrywać błędy reguł.

### Koszty i ryzyka

- Sensowna strategia wymaga funkcji oceny i stopniowego rozwoju.
- FoW utrudnia klasyczny minimax/search.
- Jeden interfejs musi obsłużyć działania wieloetapowe i wybory.
- Kontrolowana losowość wymaga wspólnego RNG lub zapisu decyzji.

## Rozważone alternatywy

- LLM jako jedyny przeciwnik — odrzucone jako domyślna architektura.
- Logika bota wpisana bezpośrednio do engine — odrzucone z powodu sprzężenia strategii z regułami.
- Bot podający dowolny tekst ruchu do interpretacji — odrzucone; powinien używać stabilnych identyfikatorów działań i wyborów.

## Powiązania

- [ADR 0003](0003-player-specific-views-and-fow.md)
- [Roadmapa — bot heurystyczny](../ROADMAP.md#etap-4--bot-heurystyczny)
