# ADR 0003: Widoki graczy i Fog of War

- **Status:** Zaakceptowana
- **Data:** 2026-07-31
- **Decydenci:** właściciel projektu

## Kontekst

Obecna aplikacja pokazuje obie ręce, a cały snapshot jest dostępny człowiekowi i
chatbotowi; docelowa rozgrywka symuluje informacje ukryte wg zasad MtG.
Schowanie elementu HTML nie tworzy poprawnej granicy informacji — kontroler
może wykorzystać dane, których nie powinien znać.

## Decyzja

- Autorytatywny `GameState` zostaje oddzielony od projekcji `PlayerView`.
  Człowiek, bot i agent dostają wyłącznie informacje dozwolone z perspektywy
  danego gracza oraz jego legalne działania/wybory.
- Filtrowanie dzieje się PRZED przekazaniem danych kontrolerowi lub UI — nie
  polegamy na instrukcji „zignoruj ukryte pola".
- Ochrona przed użytkownikiem zaglądającym do pamięci przeglądarki to osobna
  decyzja deploymentowa: realny sekret wymaga działania pełnego stanu poza
  kontrolą klienta (np. na backendzie).

## Konsekwencje

### Pozytywne

- Ten sam zakres wiedzy dla każdego rodzaju kontrolera.
- Łatwiejsze testy wycieku informacji; LLM nie dostaje ręki przeciwnika.
- UI renderuje dane, które faktycznie wolno mu znać.

### Koszty i ryzyka

- Trzeba modelować widoczność stref, obiektów i eventów.
- Ujawnione wcześniej informacje i zmiany stref wymagają precyzji.
- Debugger developerski potrzebuje osobnego, świadomie uprzywilejowanego
  widoku.
- Czysto lokalna aplikacja nie gwarantuje tajemnicy przed DevTools.

## Rozważone alternatywy

- CSS/ukrywanie DOM przy pełnym stanie — pozorny FoW.
- Pełny snapshot dla bota z instrukcją ignorowania danych — odrzucone.
- Osobne, ręcznie utrzymywane stany obu graczy — ryzyko rozbieżności; widoki
  mają być projekcjami jednego stanu.

## Powiązania

- [Architektura — model informacji](../ARCHITECTURE.md#model-informacji)
- [ADR 0004](0004-pluggable-controllers-bot-first.md)
