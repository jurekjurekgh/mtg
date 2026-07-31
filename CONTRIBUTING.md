# Współpraca

## Zanim zaczniesz

Zapoznaj się z [bieżącym stanem projektu](docs/PROJECT_STATE.md), [architekturą](docs/ARCHITECTURE.md) i [decyzjami](docs/decisions/README.md). Jeżeli zadanie nie pasuje do aktualnego etapu roadmapy, opisz zależność lub powód zmiany priorytetu.

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

- Jeden PR powinien mieć jeden czytelny cel.
- Nie łącz dużego refaktoru, nowych reguł i wielu kart bez potrzeby.
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
