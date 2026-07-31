# Bieżący stan projektu

- **Ostatnia aktualizacja:** 2026-07-31
- **Faza:** inicjalizacja i dokumentowanie założeń
- **Kod produkcyjny:** jeszcze niezaimportowany

Ten plik jest krótkim punktem wejścia dla właściciela, nowych współpracowników i agentów. Powinien być aktualizowany po każdej istotnej zmianie zakresu, architektury lub etapu prac.

## Proces pracy

Gałąź `main` jest chroniona i każda zmiana wchodzi przez Pull Request: bez bezpośredniego pusha i force pusha, z pustą bypass list, 0 wymaganymi approvals, obowiązkiem rozwiązania komentarzy i scalaniem metodą `Squash and merge` po jawnej decyzji właściciela. Required status checks włączymy dopiero po zbudowaniu stabilnego CI.

Szczegóły: [workflow](WORKFLOW.md), [polityka bezpieczeństwa](../SECURITY.md), [ADR 0007](decisions/0007-protected-main-and-mandatory-pull-requests.md).

## Co istnieje dzisiaj poza repozytorium

Właściciel ma działającą aplikację HTML + vanilla JavaScript, która służy przede wszystkim do:

- obsługi kolekcji około 400 wybranych kart MtG;
- obsługi alternatywnych artów i wyświetlania kart;
- częściowej obsługi kolekcji komiksów;
- tworzenia talii z własnej bazy kart;
- ręcznej obsługi Wirtualnego Stołu.

Wirtualny Stół jest modułem dopisanym do większej aplikacji kolekcjonerskiej, a nie samodzielną aplikacją.

### Dzisiejszy sposób gry

1. Właściciel przypisuje talię graczowi i przeciwnikowi.
2. Aplikacja pokazuje wszystkie strefy, włącznie z obiema odkrytymi rękami.
3. Gdy przeciwnik powinien podjąć decyzję, właściciel generuje/opisuje tekstowy snapshot stołu.
4. Snapshot jest ręcznie przekazywany chatbotowi z instrukcją wyboru ruchu.
5. Właściciel ręcznie wykonuje ruch przeciwnika na stole i kontynuuje własną grę.
6. Aplikacja nie jest autorytatywnym sędzią i nie waliduje pełnych reguł.

## Ustalony kierunek

- Budujemy **core engine bez zakodowanych konkretnych kart**.
- Core zawiera pojęcia i procedury gry, a karty są osobnymi definicjami korzystającymi ze współdzielonych mechanik.
- Karty dodajemy pojedynczo lub małymi partiami wraz z testami.
- Nie dążymy do obsługi wszystkich kart MtG.
- Pierwszym praktycznym celem jest rozgrywka z taliami zbudowanymi z około 20 obsługiwanych kart.
- Docelowy katalog właściciela ma obecnie około 400 kart i będzie dalej rosnąć.
- Engine jest jedynym autorytetem stanu i legalności działań.
- Wirtualny Stół ma zostać wydzielony z aplikacji kolekcjonerskiej, ale dopiero po audycie kodu.
- Gra ma zapewniać widok gracza zgodny z Fog of War; kontroler nie może dostać ukrytych danych przeciwnika.
- Pierwszy przeciwnik powinien być algorytmiczny i możliwie deterministyczny. Agent LLM pozostaje opcjonalny.

Szczegóły i uzasadnienia znajdują się w [rejestrze decyzji](decisions/README.md).

## Najbliższe zadanie

**Import i audyt obecnej aplikacji.**

Po otrzymaniu kodu należy:

1. uruchomić aplikację w aktualnym kształcie;
2. opisać strukturę plików i sposób uruchomienia;
3. zidentyfikować model danych kart i talii;
4. wskazać zależności Wirtualnego Stołu od kolekcji, komiksów, DOM-u i storage;
5. znaleźć wszystkie miejsca bezpośredniej mutacji stanu stołu;
6. zaproponować bezpieczny plan wydzielenia, bez przedwczesnego przepisywania całości;
7. dopiero po audycie zatwierdzić stos technologiczny i układ pakietów.

## Otwarte pytania

Nie należy zgadywać odpowiedzi przed audytem kodu:

1. Czy engine i standalone Wirtualny Stół pozostaną czysto przeglądarkowe, czy potrzebny będzie backend?
2. Jak obecnie przechowywane są dane kart, talii i grafiki?
3. Jaki jest format identyfikatorów definicji kart i instancji na stole?
4. Czy baza przechowuje Oracle text i inne dane reguł, czy tylko dane kolekcjonerskie?
5. Czy pierwsze rozgrywki mają używać pełnych 60-kartowych talii, czy mniejszego formatu testowego?
6. Jakie konkretne karty będą pierwszym zestawem implementacyjnym?
7. Czy TypeScript i monorepo będą właściwym wyborem po uwzględnieniu obecnego kodu?
8. Jak silny ma być realny poziom ochrony FoW? UI-only w lokalnej aplikacji nie chroni danych przed DevTools.

## Kryterium ukończenia aktualnej fazy

Faza inicjalizacji kończy się, kiedy:

- istniejący kod jest w repozytorium i można go lokalnie uruchomić;
- audyt został zapisany w dokumentacji;
- najważniejsze ryzyka migracji są znane;
- zatwierdzono pierwszą wersję kontraktów `GameState`, `Command`, `Event`, `PlayerView` i `ChoiceRequest`;
- wybrano mały pierwszy zestaw kart/mechanik;
- roadmapa została zamieniona na konkretne, małe zadania.

## Zasada aktualizacji

Każdy PR zmieniający kierunek projektu powinien odpowiednio aktualizować:

- ten plik — jeśli zmienia się bieżący stan lub następny krok;
- `docs/ROADMAP.md` — jeśli zmienia się kolejność etapów;
- ADR — jeśli zapada lub zmienia się decyzja architektoniczna;
- dokumentację karty/mechaniki — jeśli zmienia się zakres jej obsługi.
