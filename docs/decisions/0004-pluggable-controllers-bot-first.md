# ADR 0004: Wymienne kontrolery i bot algorytmiczny jako pierwszy przeciwnik

- **Status:** Zaakceptowana
- **Data:** 2026-07-31
- **Decydenci:** właściciel projektu

## Kontekst

Dzisiejszy przeciwnik to zewnętrzny chatbot: właściciel przekleja snapshot i
ręcznie wykonuje jego decyzję — wolno, trudno odtworzyć, zależnie od
niedeterministycznej odpowiedzi. Nie wykluczamy, że w przyszłości LLM lub
zaawansowany algorytm będzie użyteczny strategicznie.

## Decyzja

- Engine udostępnia wspólny protokół kontrolera: człowiek, bot losowy,
  heurystyczny, search bot i opcjonalny agent LLM to wymienne implementacje tej
  samej roli.
- Pierwszą automatyczną implementacją jest prosty bot do testów; pierwszym
  celem grywalnym — bot algorytmiczny/heurystyczny. LLM nie jest wymagany do
  pierwszej wersji i nigdy nie rozstrzyga legalności.
- Kontroler wybiera z działań i opcji przedstawionych przez engine; może być
  lekko randomizowany w sposób kontrolowany.

## Konsekwencje

### Pozytywne

- Brak kosztu i opóźnień LLM w podstawowej grze.
- Powtarzalne testy i możliwość diagnozowania decyzji.
- Późniejsze AI nie wymaga przebudowy engine.
- Random bot eksploruje wiele ścieżek i wykrywa błędy reguł.

### Koszty i ryzyka

- Sensowna strategia wymaga funkcji oceny i stopniowego rozwoju.
- FoW utrudnia klasyczny minimax/search.
- Jeden interfejs musi obsłużyć działania wieloetapowe i wybory.
- Kontrolowana losowość wymaga wspólnego RNG lub zapisu decyzji.

## Rozważone alternatywy

- LLM jako jedyny przeciwnik — odrzucone jako domyślna architektura.
- Logika bota wpisana wprost do engine — sprzężenie strategii z regułami.
- Bot podający dowolny tekst ruchu do interpretacji — ma używać stabilnych
  identyfikatorów działań i wyborów.

## Powiązania

- [ADR 0003](0003-player-specific-views-and-fow.md)
- [Roadmapa — bot heurystyczny](../ROADMAP.md#etap-4--bot-heurystyczny)
