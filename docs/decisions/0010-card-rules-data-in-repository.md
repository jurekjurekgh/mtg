# ADR 0010: Dane reguł kart utrzymywane ręcznie w repozytorium

- **Status:** Zaakceptowana
- **Data:** 2026-07-31
- **Decydenci:** właściciel projektu

## Kontekst

Audyt ([AUDIT_LEGACY_APP.md](../AUDIT_LEGACY_APP.md), §3.1): arkusz kolekcji
**nie zawiera żadnych danych reguł MtG** — kolumny to `Ilustracja`, `Nazwa`,
`Set`, `Plan`, `Colors`, `Narracja`, `Bestiariusz`, `Lore`. Brakuje kosztu many,
typów, podtypów, P/T i Oracle text, a `Colors` steruje wariantami graficznymi,
nie kolorem karty. Stąd instrukcja w prompcie: *„OBOWIĄZKOWO! Wyszukaj w
internecie statystyki i efekty każdej nowej karty"*. Bez danych reguł engine nie
ma czym walidować kosztów, typów ani obrażeń — to blokada wejścia w Etap 2.

Rozważano trzy źródła: ręczne definicje w repozytorium, import ze Scryfall do
lokalnego cache, rozszerzenie arkusza Google o kolumny reguł.

## Decyzja

Dane reguł każdej obsługiwanej karty są **wpisywane ręcznie i przechowywane w
repozytorium** jako część definicji karty, razem z jej zachowaniem, statusem
wsparcia i testami.

1. **Jedna karta = jeden plik** w `src/cards/definitions/`.
   > **Zastąpiony przez [ADR 0014](0014-card-definitions-single-module.md):**
   > definicje są w jednym module `src/cards/card-data.js` (sekcje
   > `SYNTHETIC_CARDS` / `REAL_CARDS` / `VIRTUAL_BASIC_LANDS`). Pozostałe § tego
   > ADR, w tym §2a, pozostają w mocy.
2. **Dane reguł zapisujemy dosłownie** wg aktualnego Oracle text; wpisanie ich
   jest częścią implementacji karty.
2a. **Przed zakodowaniem każdej karty dane pobieramy z Scryfall** — obowiązkowy
   pierwszy krok. Nie wolno wpisywać kosztu many, typów, P/T ani tekstu reguł z
   pamięci. Pobranie jest jednorazowe: po weryfikacji dane trafiają do pliku
   definicji i od tej pory obowiązuje §3. Przy większych partiach pobieramy
   jednym przebiegiem, utrzymując ruch poniżej 10 żądań/s.
3. **Repo nie pobiera danych reguł z sieci w czasie gry** — engine działa
   offline i deterministycznie; Scryfall to wyłącznie źródło **obrazów**.
4. **Karta bez danych reguł nie dostaje statusu `supported`** i nie wchodzi do
   legalnej talii.
5. **Nazwa i tekst reguł są danymi, nie warunkami w kodzie** — engine nadal nie
   rozgałęzia się po nazwie karty (ADR 0002).
6. **Powiązanie z kolekcją to osobne pole** (np. identyfikator ilustracji);
   definicja nie dziedziczy arytmetyki ID z aplikacji kolekcjonerskiej
   (`+100000`/`+200000`). To samo pole obsługuje oba tryby grafik z ADR 0011:
   lokalne ilustracje właściciela i obrazy ze Scryfall.
7. **Pierwszy zestaw kart wskazuje właściciel** (decyzja z 2026-07-31). Do czasu
   otrzymania listy rozwijamy engine na kartach syntetycznych, używanych
   wyłącznie w testach i jawnie oznaczonych jako niedostępne w grze.

## Konsekwencje

### Pozytywne

- Repo jest samowystarczalne: testy i symulacje bez sieci i arkusza.
- Dane reguł wersjonowane i przeglądane w PR razem z implementacją i testami.
- Brak rozjazdu między tym, co engine „wie" o karcie, a tym, co potrafi
  wykonać — powstaje w tym samym commicie.
- Znika pokusa proszenia LLM o reguły w czasie gry (sprzeczne z ADR 0002).
- Brak pytań licencyjnych o masowy import cudzej bazy.

### Koszty i ryzyka

- **Praca ręczna rośnie liniowo z katalogiem**: ~20 kart to realny start, 400
  to długi horyzont — akceptowane, bo ADR 0001 i tak zakłada wzrost karta po
  karcie, a wąskim gardłem są mechaniki, nie przepisywanie danych.
- **Ryzyko literówki w koszcie many lub P/T** → test na każdą kartę sprawdzający
  dane oraz scenariusz legalny i nielegalny.
- **Dezaktualizacja po erracie** → pole z datą weryfikacji tekstu w definicji.
- **Duplikacja względem arkusza** (nazwa, przynależność do kolekcji) →
  definicja trzyma odnośnik do pozycji, nie kopię jej danych.

## Furtka na przyszłość

Automatyzacja jest dopuszczalna: gdyby ręczne wpisywanie stało się wąskim
gardłem, można dodać **jednorazowy skrypt pomocniczy** przygotowujący szkielet
definicji z publicznego źródła, który człowiek weryfikuje i zatwierdza w PR.
Warunki: skrypt działa offline wobec gry, wynik trafia do repo jako zwykły plik,
karta i tak wymaga testów przed statusem `supported`. Wymaga nowego ADR.

## Rozważone alternatywy

- **Import ze Scryfall do lokalnego cache** — szybszy przy 400 kartach, ale
  dodaje zależność od zewnętrznej bazy, pytania licencyjne o masowy zrzut i
  ryzyko, że repo „zna" karty, których engine nie potrafi rozegrać.
- **Rozszerzenie arkusza Google o kolumny reguł** — jedno źródło prawdy dla
  właściciela, ale wiąże engine z siecią i arkuszem, utrudnia testy offline i
  uzależnia poprawność reguł od komórek bez przeglądu w PR.

## Powiązania

- [ADR 0001](0001-incremental-card-support.md) · [ADR 0002](0002-authoritative-card-agnostic-engine.md)
- [ADR 0011](0011-modular-sources-single-file-artifact.md) · [Audyt istniejącej aplikacji](../AUDIT_LEGACY_APP.md)
- [Karta projektu](../PRODUCT.md)
