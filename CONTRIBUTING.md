# Współpraca

## Zanim zaczniesz

Zapoznaj się z [historią projektu](docs/PROJECT_HISTORY.md), [architekturą](docs/ARCHITECTURE.md) i [decyzjami](docs/decisions/README.md). Jeżeli zadanie nie pasuje do aktualnego etapu roadmapy, opisz zależność lub powód zmiany priorytetu.

Przeczytaj też [workflow pracy w repozytorium](docs/WORKFLOW.md) i [politykę bezpieczeństwa](SECURITY.md).

## Chroniony `main` i obowiązkowy Pull Request

`main` jest gałęzią chronioną. Obowiązują następujące zasady (ADR [0007](docs/decisions/0007-protected-main-and-mandatory-pull-requests.md)):

- pracuj na osobnej gałęzi — bezpośredni push do `main` jest zabroniony;
- force push i usunięcie `main` są zabronione, bypass list jest pusta;
- każda zmiana wchodzi przez Pull Request z wypełnionym szablonem opisu;
- wymagane approvals: 0, ale **wszystkie wątki komentarzy muszą być rozwiązane** przed scaleniem;
- scalenie jest jawną decyzją właściciela — współpracownicy i agenci nie merge'ują sami;
- dozwoloną metodą scalania jest `Squash and merge`, więc tytuł PR trafia do historii `main`;
- required status checks zostaną włączone po zbudowaniu stabilnego CI.

## Zasady zmian

- Jednostką „jednego czytelnego celu" jest **commit, nie PR**. Sesja agentska (Arena)
  prowadzi jeden długowieczny PR na gałęzi swojej sesji (1 sesja = 1 gałąź = 1 PR):
  kolejne tematy (batch kart, mechanika engine, bot, dokumentacja) dopisuje do niego
  osobnymi commitami, a opis PR aktualizuje kumulacyjnie. Jest to celowy wynik
  działania Areny — scalenie/zamknięcie PR kończy sesję, a nowa sesja startuje
  od aktualnego `main` i prowadzi własny PR.
- W obrębie jednego commita nie łącz dużego refaktoru, nowych reguł i wielu kart
  bez powiązania. Każdy commit ma być samodzielnie spójny, zielony (testy + build)
  i opisany tytułem mówiącym o rezultacie.
- Zachowuj działanie istniejącej aplikacji podczas jej wydzielania.
- Publiczny kontrakt engine zmieniaj świadomie i dokumentuj.
- Do poprawki błędu dodaj scenariusz regresyjny.
- Do nowej karty dodaj testy legalności, rozpatrywania i istotnych interakcji.
- Jawnie zapisuj ograniczenia częściowo obsługiwanych kart.

## Definition of Done

Zmiana jest gotowa, gdy — odpowiednio do zakresu:

- kod przechodzi formatowanie, statyczną analizę i testy;
- nowe zachowanie ma testy;
- nie wprowadza wycieku danych między `GameState` a `PlayerView`;
- losowe zachowanie korzysta z kontrolowanego RNG;
- dokumentacja i roadmapa odzwierciedlają nowy stan;
- istotna decyzja ma ADR;
- wiadomo, jak uruchomić i ręcznie sprawdzić zmianę.

Konkretne komendy jakości zostaną dodane po imporcie kodu i wyborze toolchainu.

## Commity i PR-y

Preferowany tytuł opisuje rezultat, np.:

- `engine: add zone transition primitive`
- `cards: support Lightning Bolt`
- `table: turn drag operation into cast command`
- `docs: record FoW deployment decision`

Opis PR powinien zawierać:

1. problem i zakres;
2. rozwiązanie;
3. sposób sprawdzenia;
4. znane ograniczenia;
5. wpływ na dokumentację/ADR.

## Zgłaszanie kart

Zgłoszenie implementacji karty powinno zawierać:

- nazwę i stabilny identyfikator w bazie właściciela;
- dokładny Oracle text/wersję danych używaną przez projekt;
- typy, koszt i istotne charakterystyki;
- przykładowe scenariusze;
- oczekiwane interakcje z już obsługiwanymi kartami;
- informację o arcie/wydaniu tylko wtedy, gdy ma znaczenie dla integracji danych.

## Bezpieczeństwo i dane

Nie commituj sekretów, tokenów, prywatnych danych ani dużych binarnych zasobów bez ustalenia sposobu przechowywania. Ukrytych informacji gry nie należy wysyłać do klienta/kontrolera, który nie ma prawa ich znać.

Podatności zgłaszaj prywatnie, nie przez publiczne Issue — tryb zgłaszania opisuje [SECURITY.md](SECURITY.md).
