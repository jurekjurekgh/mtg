# ADR 0009: Standalone Game Table zamiast wydzielania z aplikacji kolekcjonerskiej

- **Status:** Zaakceptowana
- **Data:** 2026-07-31
- **Decydenci:** właściciel projektu
- **Uzupełnia:** [ADR 0006](0006-audit-before-table-extraction.md)

## Kontekst

ADR 0006 zakładał, że Wirtualny Stół będzie **wydzielany etapami** z aplikacji kolekcjonerskiej
przez adaptery, żeby nie stracić działających funkcji i nie duplikować danych kolekcji.
To założenie było ostrożne, bo kod nie był jeszcze znany.

Audyt ([AUDIT_LEGACY_APP.md](../AUDIT_LEGACY_APP.md)) zmienił stan wiedzy w dwóch punktach:

1. **Stół jest logicznie niezależny.** Z 8 468 linii JS zajmuje 2 566 (30%) w dwóch blokach.
   Z reszty aplikacji potrzebuje tylko sześciu rzeczy: `cards`/`cardMap`, `AI_MODELS`,
   `OPENROUTER_API_KEY`, `waitForExternalAI()`, `getCardImageSrc()` i `loadData()`.
   W drugą stronę zależność jest jedna: `initApp()` woła `renderPlaytable()`.
   Nie ma splątania z mangami, bitwami, opowieściami ani teleturniejem.
2. **Właściciel ma własną kopię pełnej aplikacji** ze wszystkimi funkcjami i **nie potrzebuje,
   by repozytorium ją utrzymywało**. Wersja w repozytorium jest materiałem referencyjnym.

Właściciel polecił wprost: zbudować standalone do grania na bazie istniejącego kodu,
z prawem do pominięcia lub usunięcia dowolnych fragmentów.

## Decyzja

Repozytorium buduje **samodzielną aplikację Wirtualnego Stołu** (`src/table/`), a nie adapter
osadzony w aplikacji kolekcjonerskiej. Aplikacja kolekcjonerska pozostaje po stronie
właściciela i **nie jest utrzymywana w tym repozytorium**.

Zasady:

1. **Stół nie jest zakładką.** Ma własny `index.html`, własny punkt wejścia i własny cykl życia.
   Nie ma trybów „karty bazowe", „mangi", „teleturniej" ani przełącznika zakładek.
2. **Silnik jest autorytetem od pierwszej linii.** Nowy stół nie odtwarza trybu sandbox
   z ręcznym przesuwaniem kart jako modelu docelowego. Tryb swobodny może istnieć wyłącznie
   jako jawnie oznaczone narzędzie diagnostyczne, nigdy jako domyślna ścieżka gry.
3. **Kod przejmujemy wybiórczo i świadomie.** Lista rozwiązań wartych przeniesienia
   i lista do porzucenia są w §8 audytu. Przenosimy zachowanie i wygląd, nie strukturę kodu.
4. **Nie ma zobowiązania do zgodności wstecznej UI.** Jeżeli nowy przepływ oparty na engine
   wymaga innego układu ekranu niż dzisiejszy — zmieniamy układ.
5. **Dane kolekcji nie są duplikowane w kodzie.** Stół czyta karty przez jeden interfejs
   źródła kart. Pierwszą implementacją są definicje w repozytorium (ADR 0010); wczytanie
   arkusza właściciela pozostaje możliwe jako druga implementacja tego samego interfejsu.
6. **Plik `card_viewer_12_10_for_Github.html` zostaje w repozytorium jako zamrożony snapshot**
   referencyjny do czasu zakończenia Etapu 5. Nie jest rozwijany, nie jest naprawiany
   i nie wchodzi do żadnego builda. Po Etapie 5 zostanie usunięty osobnym PR-em.

## Co to zmienia w ADR 0006

ADR 0006 pozostaje w mocy co do zasady „najpierw audyt, potem decyzje". Audyt się odbył.
Zmienia się **wyłącznie strategia wydzielenia**: zamiast stopniowego rozplątywania modułu
wewnątrz starej aplikacji budujemy równoległą aplikację i przenosimy do niej sprawdzone
zachowania. Powód: audyt wykazał, że koszt rozplątywania jest bliski zeru, bo splątania
praktycznie nie ma, a stara struktura (mutacje z 105 miejsc, render 1 027 linii) i tak
nie nadaje się do przyjęcia reguł.

## Konsekwencje

### Pozytywne

- Brak ryzyka regresji aplikacji kolekcjonerskiej — nie dotykamy jej wcale.
- Nowy kod od początku spełnia granice z ADR 0002/0003 zamiast do nich dochodzić.
- Znacznie mniejszy zakres: stół zamiast dwunastu modułów.
- Repozytorium nie musi utrzymywać funkcji mang, komiksów i teleturnieju.
- Etap 5 z roadmapy („adapter istniejącego stołu") upraszcza się do budowy UI nowego stołu.

### Koszty i ryzyka

- Przez pewien czas właściciel będzie miał dwie aplikacje: starą do wszystkiego
  i nową do grania. To stan przejściowy, akceptowany świadomie.
- Funkcje stołu obecne dziś, a nieprzeniesione, będą chwilowo niedostępne w nowej aplikacji.
  Łagodzenie: §8 audytu jest listą kontrolną kompletności.
- Jeżeli właściciel zechce kiedyś wrócić do jednej aplikacji, integracja będzie osobnym zadaniem.
  Ułatwia ją to, że stół jest samodzielny i komunikuje się przez jawny interfejs źródła kart.

## Rozważone alternatywy

- **Stopniowe wydzielanie zgodnie z pierwotnym ADR 0006** — odrzucone: audyt pokazał,
  że nie ma czego rozplątywać, a stara struktura i tak wymaga przepisania.
- **Dopisanie engine do istniejącego pliku HTML** — odrzucone przez ADR 0002 i potwierdzone
  audytem (105 miejsc mutacji stanu z handlerów UI).
- **Utrzymywanie pełnej aplikacji kolekcjonerskiej w repozytorium** — odrzucone przez właściciela;
  poza zakresem projektu opisanym w PRODUCT.md.

## Powiązania

- [ADR 0006 — audyt przed wydzieleniem stołu](0006-audit-before-table-extraction.md)
- [ADR 0011 — modularne źródła i jednoplikowy artefakt](0011-modular-sources-single-file-artifact.md)
- [ADR 0010 — dane reguł kart w repozytorium](0010-card-rules-data-in-repository.md)
- [Audyt istniejącej aplikacji](../AUDIT_LEGACY_APP.md)
- [Roadmapa](../ROADMAP.md)
