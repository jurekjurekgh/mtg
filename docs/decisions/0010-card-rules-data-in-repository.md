# ADR 0010: Dane reguł kart utrzymywane ręcznie w repozytorium

- **Status:** Zaakceptowana
- **Data:** 2026-07-31
- **Decydenci:** właściciel projektu

## Kontekst

Audyt ([AUDIT_LEGACY_APP.md](../AUDIT_LEGACY_APP.md), §3.1) ustalił, że arkusz kolekcji
**nie zawiera żadnych danych reguł MtG**. Kolumny to: `Ilustracja`, `Nazwa`, `Set`, `Plan`,
`Colors`, `Narracja`, `Bestiariusz`, `Lore`. Brakuje kosztu many, typów, podtypów,
siły i wytrzymałości oraz Oracle text. Kolumna `Colors` nie opisuje koloru karty — steruje
generowaniem wariantów graficznych.

To bezpośrednia przyczyna instrukcji w obecnym promptcie: *„OBOWIĄZKOWO! Wyszukaj w internecie
statystyki i efekty każdej nowej karty"*. Bez danych reguł engine nie ma czym walidować
kosztów, typów ani obrażeń, więc jest to blokada wejścia w Etap 2.

Rozważano trzy źródła: ręczne definicje w repozytorium, import ze Scryfall do lokalnego cache
oraz rozszerzenie arkusza Google o kolumny reguł.

## Decyzja

Dane reguł każdej obsługiwanej karty są **wpisywane ręcznie i przechowywane w repozytorium**
jako część definicji karty, razem z jej zachowaniem, statusem wsparcia i testami.

Zasady:

1. **Jedna karta = jeden plik** w `src/cards/definitions/`, zawierający dane reguł,
   zachowanie zbudowane z mechanik i deklarację zakresu wsparcia.
2. **Dane reguł są zapisywane dosłownie** według aktualnego Oracle text. Wpisanie ich
   jest częścią implementacji karty, nie osobnym etapem importu.
2a. **Przed zakodowaniem każdej karty jej dane pobieramy z Scryfall.** To obowiązkowy,
   pierwszy krok procedury dodawania karty — nie wolno wpisywać kosztu many, typów, P/T
   ani tekstu reguł z pamięci. Pobranie jest jednorazowe: po weryfikacji dane trafiają
   do pliku definicji i od tej pory obowiązuje §3 (żadnych zapytań w czasie gry).
   Przy większych partiach kart pobieramy dane jednym przebiegiem, z zachowaniem prośby
   Scryfall o utrzymanie ruchu poniżej 10 żądań na sekundę.
3. **Repozytorium nie pobiera danych reguł z sieci w czasie gry.** Engine działa offline
   i deterministycznie. Scryfall pozostaje wyłącznie źródłem **obrazów** w UI.
4. **Karta bez danych reguł nie może mieć statusu `supported`** i nie wchodzi do legalnej talii.
5. **Nazwa i tekst reguł są danymi wejściowymi, nie warunkami w kodzie.** Engine nadal nie
   zawiera rozgałęzień po nazwie karty (ADR 0002). Dane opisują kartę; zachowanie składa się
   z mechanik wielokrotnego użytku.
6. **Powiązanie z kolekcją właściciela jest osobnym polem**, np. identyfikatorem ilustracji.
   Definicja reguł nie dziedziczy arytmetyki ID z aplikacji kolekcjonerskiej
   (`+100000`/`+200000`), która miesza definicję karty z wariantem graficznym.
   To samo pole obsługuje oba tryby grafik z [ADR 0011](0011-modular-sources-single-file-artifact.md):
   lokalne ilustracje właściciela oraz obrazy ze Scryfall.
7. **Pierwszy zestaw kart wskazuje właściciel** ze swojego katalogu (decyzja z 2026-07-31).
   Do czasu otrzymania listy engine rozwijamy na kartach syntetycznych używanych wyłącznie
   w testach, jawnie oznaczonych jako testowe i niedostępnych w grze.

## Konsekwencje

### Pozytywne

- Repozytorium jest samowystarczalne: testy i symulacje nie zależą od sieci ani od arkusza.
- Dane reguł są wersjonowane i przeglądane w PR razem z implementacją i testami.
- Nie ma rozjazdu między tym, co engine „wie" o karcie, a tym, co potrafi wykonać —
  jedno i drugie powstaje w tym samym commicie.
- Znika pokusa proszenia LLM o reguły w czasie gry (sprzeczna z ADR 0002 i PRODUCT.md).
- Brak pytań licencyjnych o masowy import cudzej bazy danych; wpisujemy tylko karty,
  które faktycznie implementujemy.

### Koszty i ryzyka

- **Praca ręczna rośnie liniowo z katalogiem.** Około 20 kart to realny start; 400 kart
  tą metodą to długi horyzont. Świadomie akceptowane — ADR 0001 i tak zakłada wzrost karta
  po karcie, a wąskim gardłem jest implementacja mechanik, nie przepisywanie danych.
- **Ryzyko literówki w koszcie many lub P/T.** Łagodzenie: test na każdą kartę sprawdzający
  jej dane i przynajmniej jeden scenariusz legalny oraz jeden nielegalny.
- **Dane mogą się zdezaktualizować** po errata/zmianie Oracle text. Łagodzenie: pole z datą
  weryfikacji tekstu w definicji karty.
- **Duplikacja względem arkusza właściciela** w zakresie nazwy i przynależności do kolekcji.
  Łagodzenie: definicja przechowuje odnośnik do pozycji w kolekcji zamiast kopiować jej dane.

## Furtka na przyszłość

Decyzja nie zamyka drogi do automatyzacji. Gdyby ręczne wpisywanie stało się wąskim gardłem,
można dodać **jednorazowy skrypt pomocniczy**, który przygotuje szkielet definicji na podstawie
publicznego źródła danych, a człowiek go zweryfikuje i zatwierdzi w PR. Warunki:
skrypt działa offline wobec gry, wynik trafia do repozytorium jako zwykły plik, a karta
i tak wymaga testów przed nadaniem statusu `supported`. Taka zmiana wymaga nowego ADR.

## Rozważone alternatywy

- **Import ze Scryfall do lokalnego cache** — szybszy przy 400 kartach, ale wprowadza zależność
  od zewnętrznej bazy, pytania licencyjne o masowy zrzut danych i ryzyko, że repozytorium
  „zna" karty, których engine nie potrafi rozegrać.
- **Rozszerzenie arkusza Google o kolumny reguł** — zachowuje jedno źródło prawdy dla właściciela,
  ale wiąże engine z siecią i arkuszem, utrudnia testy offline i uzależnia poprawność reguł
  od ręcznego wypełniania komórek bez przeglądu w PR.

## Powiązania

- [ADR 0001 — stopniowo rozszerzany katalog kart](0001-incremental-card-support.md)
- [ADR 0002 — engine niezależny od konkretnych kart](0002-authoritative-card-agnostic-engine.md)
- [ADR 0011 — modularne źródła i jednoplikowy artefakt](0011-modular-sources-single-file-artifact.md)
- [Audyt istniejącej aplikacji](../AUDIT_LEGACY_APP.md)
- [Karta projektu](../PRODUCT.md)
