# ADR 0003: Widoki graczy i Fog of War

- **Status:** Zaakceptowana
- **Data:** 2026-07-31
- **Decydenci:** właściciel projektu

## Kontekst

Obecna aplikacja pokazuje obie ręce i cały snapshot jest dostępny człowiekowi oraz chatbotowi. Docelowa rozgrywka ma symulować informacje ukryte zgodnie z zasadami MtG.

Samo schowanie elementu HTML nie tworzy poprawnej granicy informacji. Kontroler może przypadkowo albo celowo wykorzystać dane, których nie powinien znać.

## Decyzja

Autorytatywny `GameState` zostanie oddzielony od projekcji `PlayerView`. Każdy człowiek, bot lub agent otrzymuje wyłącznie informacje dozwolone z perspektywy danego gracza oraz legalne działania/wybory.

Filtrowanie odbywa się przed przekazaniem danych kontrolerowi lub UI. Nie polegamy na instrukcji „zignoruj ukryte pola”.

Poziom ochrony przed użytkownikiem zaglądającym do pamięci przeglądarki pozostaje osobną decyzją deploymentową. Jeżeli będzie wymagany realny sekret względem lokalnego klienta, pełny stan musi działać poza jego kontrolą, np. na backendzie.

## Konsekwencje

### Pozytywne

- Ten sam zakres wiedzy dla każdego rodzaju kontrolera.
- Łatwiejsze testy wycieku informacji.
- LLM nie otrzyma przypadkowo ręki przeciwnika.
- UI renderuje dane, które faktycznie wolno mu znać.

### Koszty i ryzyka

- Trzeba modelować widoczność stref, obiektów i eventów.
- Ujawnione wcześniej informacje oraz zmiany stref wymagają precyzji.
- Debugger developerski potrzebuje osobnego, świadomie uprzywilejowanego widoku.
- Czysto lokalna aplikacja nie gwarantuje tajemnicy przed DevTools.

## Rozważone alternatywy

- CSS/ukrywanie DOM przy przesyłaniu pełnego stanu — odrzucone jako pozorny FoW.
- Pełny snapshot dla bota z instrukcją ignorowania danych — odrzucone.
- Osobne, ręcznie utrzymywane stany obu graczy — odrzucone z powodu ryzyka rozbieżności; widoki powinny być projekcjami jednego stanu.

## Powiązania

- [Architektura — model informacji](../ARCHITECTURE.md#model-informacji)
- [ADR 0004](0004-pluggable-controllers-bot-first.md)
