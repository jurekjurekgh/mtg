# ADR 0009: Standalone Game Table zamiast wydzielania z aplikacji kolekcjonerskiej

- **Status:** Zaakceptowana
- **Data:** 2026-07-31
- **Decydenci:** właściciel projektu
- **Uzupełnia:** [ADR 0006](0006-audit-before-table-extraction.md)

## Kontekst

ADR 0006 zakładał wydzielanie stołu etapami przez adaptery, żeby nie stracić
działających funkcji. Audyt ([AUDIT_LEGACY_APP.md](../AUDIT_LEGACY_APP.md))
zmienił stan wiedzy:

1. **Stół jest logicznie niezależny.** Z 8 468 linii JS zajmuje 2 566 (30%) w
   dwóch blokach. Z reszty aplikacji potrzebuje sześciu rzeczy: `cards`/
   `cardMap`, `AI_MODELS`, `OPENROUTER_API_KEY`, `waitForExternalAI()`,
   `getCardImageSrc()`, `loadData()`. W drugą stronę: `initApp()` woła
   `renderPlaytable()`. Brak splątania z mangami, bitwami, opowieściami,
   teleturniejem.
2. **Właściciel ma własną kopię pełnej aplikacji** i nie potrzebuje, by
   repozytorium ją utrzymywało — wersja w repo jest materiałem referencyjnym.

Właściciel polecił wprost: zbudować standalone do grania na bazie istniejącego
kodu, z prawem pominięcia lub usunięcia dowolnych fragmentów.

## Decyzja

Repozytorium buduje **samodzielną aplikację Wirtualnego Stołu** (`src/table/`),
a nie adapter w aplikacji kolekcjonerskiej (która pozostaje po stronie
właściciela i nie jest tu utrzymywana).

1. **Stół nie jest zakładką.** Własny `index.html`, punkt wejścia i cykl życia.
   Bez trybów „karty bazowe", „mangi", „teleturniej" i przełącznika zakładek.
2. **Silnik jest autorytetem od pierwszej linii.** Nowy stół nie odtwarza trybu
   sandbox z ręcznym przesuwaniem kart jako modelu docelowego; tryb swobodny
   może istnieć wyłącznie jako jawnie oznaczone narzędzie diagnostyczne.
3. **Kod przejmujemy wybiórczo i świadomie** (§8 audytu: lista do przeniesienia
   i do porzucenia). Przenosimy zachowanie i wygląd, nie strukturę kodu.
4. **Brak zobowiązania do zgodności wstecznej UI** — jeśli przepływ oparty na
   engine wymaga innego układu, zmieniamy układ.
5. **Dane kolekcji nie są duplikowane w kodzie.** Stół czyta karty przez jeden
   interfejs źródła kart: pierwszą implementacją są definicje w repozytorium
   (ADR 0010), wczytanie arkusza właściciela pozostaje możliwe jako druga
   implementacja tego samego interfejsu.
6. **`card_viewer_12_10_for_Github.html` zostaje zamrożonym snapshotem**
   referencyjnym do końca Etapu 5 — nie rozwijany, nie naprawiany, nie wchodzi
   do builda; po Etapie 5 usunięty osobnym PR-em.

## Co to zmienia w ADR 0006

ADR 0006 pozostaje w mocy co do zasady „najpierw audyt, potem decyzje". Zmienia
się **wyłącznie strategia wydzielenia**: zamiast rozplątywać moduł wewnątrz
starej aplikacji, budujemy równoległą aplikację i przenosimy sprawdzone
zachowania. Powód: koszt rozplątywania jest bliski zeru (splątania praktycznie
nie ma), a stara struktura (mutacje ze 105 miejsc, render 1 027 linii) i tak nie
nadaje się do przyjęcia reguł.

## Konsekwencje

### Pozytywne

- Brak ryzyka regresji aplikacji kolekcjonerskiej — nie dotykamy jej wcale.
- Nowy kod od początku spełnia granice ADR 0002/0003.
- Mniejszy zakres: stół zamiast dwunastu modułów; repo nie utrzymuje mang,
  komiksów i teleturnieju.
- Etap 5 z roadmapy („adapter istniejącego stołu") upraszcza się do budowy UI.

### Koszty i ryzyka

- Przez pewien czas właściciel ma dwie aplikacje (stara do wszystkiego, nowa do
  grania) — stan przejściowy, akceptowany.
- Funkcje stołu nieprzeniesione będą chwilowo niedostępne (§8 audytu to lista
  kontrolna kompletności).
- Powrót do jednej aplikacji będzie osobnym zadaniem; ułatwia je samodzielność
  stołu i jawny interfejs źródła kart.

## Rozważone alternatywy

- **Stopniowe wydzielanie wg ADR 0006** — nie ma czego rozplątywać, a stara
  struktura i tak wymaga przepisania.
- **Dopisanie engine do istniejącego pliku HTML** — sprzeczne z ADR 0002;
  audyt: 105 miejsc mutacji stanu z handlerów UI.
- **Utrzymywanie pełnej aplikacji kolekcjonerskiej w repo** — odrzucone przez
  właściciela; poza zakresem z PRODUCT.md.

## Powiązania

- [ADR 0006](0006-audit-before-table-extraction.md) · [ADR 0011](0011-modular-sources-single-file-artifact.md)
- [ADR 0010](0010-card-rules-data-in-repository.md) · [Audyt istniejącej aplikacji](../AUDIT_LEGACY_APP.md)
- [Roadmapa](../ROADMAP.md)
