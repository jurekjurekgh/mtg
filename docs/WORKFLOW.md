# Workflow pracy w repozytorium — instrukcja dla właściciela

Ten dokument opisuje **jak w praktyce klikać w GitHubie**, żeby zmiany trafiały do gałęzi `main`
zgodnie z przyjętymi zasadami bezpieczeństwa. Jest napisany prostym językiem i nie zakłada
znajomości Git ani wiersza poleceń.

Formalne uzasadnienie tych zasad znajduje się w [ADR 0007](decisions/0007-protected-main-and-mandatory-pull-requests.md),
a zasady zgłaszania problemów bezpieczeństwa w [SECURITY.md](../SECURITY.md).

## Najkrótsze streszczenie

1. Nikt (również właściciel) nie zapisuje zmian bezpośrednio w `main`.
2. Każda zmiana powstaje na osobnej gałęzi i trafia do `main` przez **Pull Request (PR)**.
3. Właściciel czyta PR, rozwiązuje komentarze i **sam decyduje**, czy scalić.
4. Scalanie wykonujemy przyciskiem **Squash and merge**.

## Słowniczek w trzech zdaniach

- **Branch (gałąź)** — osobna, robocza kopia projektu, w której bezpiecznie powstają zmiany.
- **Pull Request (PR)** — prośba o włączenie gałęzi do `main`, wraz z podglądem różnic i miejscem na dyskusję.
- **Merge (scalenie)** — moment, w którym zmiany z PR faktycznie trafiają do `main`.

## Obowiązujące zasady ochrony `main`

| Zasada | Ustawienie | Co to znaczy w praktyce |
|---|---|---|
| Ochrona gałęzi | włączona dla `main` | `main` jest gałęzią chronioną regułą repozytorium |
| Bezpośredni push | zabroniony | zmiany wchodzą wyłącznie przez PR |
| Force push | zabroniony | nie da się nadpisać ani skasować historii `main` |
| Usunięcie gałęzi | zabronione | `main` nie może zostać przypadkowo usunięty |
| Bypass list | pusta | wyjątku nie ma nikt, łącznie z właścicielem |
| Wymagane approvals | 0 | PR nie czeka na cudzą akceptację |
| Rozwiązanie komentarzy | wymagane | wszystkie wątki w PR muszą być „Resolved” |
| Metoda scalania | `Squash and merge` | jedna czytelna zmiana w historii na jeden PR |
| Required status checks | jeszcze nie | włączymy po zbudowaniu stabilnego CI |

Uwaga: **0 wymaganych approvals nie znaczy „scala się samo”.** Nadal trzeba świadomie kliknąć
przycisk scalania. Wymaganie PR chroni przed przypadkową zmianą, a nie przed decyzją właściciela.

## Codzienna ścieżka: od pomysłu do `main`

### Krok 1 — powstaje gałąź robocza

Zmianę przygotowuje właściciel lub agent na osobnej gałęzi (np. `arena/...`, `docs/...`, `engine/...`).
Gałąź nigdy nie nazywa się `main`.

### Krok 2 — powstaje Pull Request

Na stronie repozytorium GitHub sam podpowiada nową gałąź żółtym paskiem:

1. Kliknij **Compare & pull request** (albo zakładka **Pull requests** → **New pull request**).
2. Sprawdź, że po lewej jest `base: main`, a po prawej gałąź ze zmianami.
3. Wypełnij szablon opisu (problem, rozwiązanie, jak sprawdzono, ograniczenia, dokumentacja).
4. Kliknij **Create pull request**.

### Krok 3 — przegląd zmian

W PR najważniejsze są dwie zakładki:

- **Conversation** — opis, checklisty i dyskusja.
- **Files changed** — dokładnie widać, co zostało dodane (zielone) i usunięte (czerwone).

Jeżeli coś budzi wątpliwość, zostaw komentarz przy konkretnej linii
(najedź na linię → niebieski **+** → napisz uwagę → **Add single comment**).

### Krok 4 — rozwiązanie komentarzy

Każdy wątek komentarza musi zostać zamknięty przyciskiem **Resolve conversation**.
Dopóki jakiś wątek jest otwarty, GitHub blokuje scalenie. To celowe: nic nie ginie po drodze.

### Krok 5 — decyzja o scaleniu

Scalenie jest **zawsze świadomą decyzją właściciela**. Gdy PR jest w porządku:

1. Kliknij rozwijaną strzałkę przy zielonym przycisku scalania.
2. Wybierz **Squash and merge**.
3. Sprawdź tytuł commita (to on trafi do historii `main`).
4. Potwierdź **Confirm squash and merge**.

Jeżeli PR nie ma zostać przyjęty — użyj **Close pull request**. Zmiana zostaje na swojej gałęzi
i niczego nie psuje.

### Krok 6 — sprzątanie

Po scaleniu GitHub proponuje **Delete branch**. Można ją bezpiecznie usunąć —
treść zmian jest już w `main`, a historia PR pozostaje dostępna.

## Praca z sesją agentską (Arena)

Gdy zmiany prowadzi agent na Arenie, ścieżka powyżej działa identycznie technicznie,
ale **czas życia PR jest inny** niż w klasycznym workflow:

- **Jedna sesja agentska = jedna gałąź (`arena/...`) = jeden PR.** Agent nie otwiera
  kolejnych PR-ów w trakcie sesji; każde nowe zadanie (kolejny batch kart, mechanika,
  bot, dokumentacja) dopisuje do tego samego PR osobnym commitem.
- Opis PR jest **aktualizowany kumulacyjnie** — sekcje szablonu opisują całość zakresu
  nagromadzonego w sesji, a każdy commit jest samodzielnie spójny i zielony
  (testy + build przechodzą po każdym commicie, nie tylko na końcu).
- Wielotematyczny, rosnący w czasie PR sesji **nie jest błędem ani naruszeniem zasad**,
  tylko odzwierciedleniem tego, jak działa Arena: **scalenie lub zamknięcie PR kończy
  sesję agenta**. Nowa sesja losuje nowy kontekst/agenta i zaczyna od aktualnego `main`
  z nową gałęzią i nowym PR.
- Praktyczna konsekwencja dla właściciela: nie trzeba scalać po każdym batchu.
  `Squash and merge` warto wcisnąć wtedy, gdy chcesz zrobić czysty punkt cięcia
  (jeden commit w `main` z całej sesji) — np. gdy kończysz współpracę z daną sesją
  albo potrzebujesz świeżego startu dla kolejnego etapu.
- **Scalenie PR = koniec sesji agenta** (ADR 0013). Po `Squash and merge` agent tej sesji
  nie może już nic zmienić w GitHubie, a kolejna sesja startuje „na czysto”: widzi tylko
  gałąź `main` i tekst, który wkleisz jej w pierwszym prompcie. Dlatego **obowiązkowym
  etapem po scaleniu** jest instrukcja przekazania: agent kończący sesję wypisuje w czacie
  jeden blok tekstu (stan projektu, kolejka zadań, zasady, pułapki), a Ty wklejasz go
  jako pierwszy prompt nowej sesji. Ta sama treść w części trwałej trafia do
  `docs/PROJECT_HISTORY.md` i `docs/setup/HANDOFF_<data>.md` — repozytorium pozostaje
  źródłem prawdy, blok w czacie jest tylko skrótem startowym.
- Jednostką brzegową zakresu pozostaje **commit**: jeden commit = jeden temat.
  Historycznie istniała deklaracja „jeden PR = jeden mały jednorodny temat" —
  została zastąpiona powyższym modelem sesyjnym.

## Co zrobić, gdy GitHub blokuje scalenie

| Komunikat | Znaczenie | Rozwiązanie |
|---|---|---|
| „Merging is blocked” + otwarte wątki | ktoś zostawił nierozwiązany komentarz | zamknij wątki przyciskiem **Resolve conversation** |
| „This branch has conflicts” | ta sama linia zmieniła się w `main` i w gałęzi | poproś agenta o aktualizację gałęzi z `main` |
| „Only squash merging is allowed” | wybrano inną metodę scalania | wybierz **Squash and merge** |
| „Changes must be made through a pull request” | ktoś próbował pisać wprost do `main` | utwórz normalny PR — to działa ochrona, nie błąd |

## Czego nie robimy

- Nie edytujemy plików bezpośrednio na gałęzi `main` przez „ołówek” w interfejsie GitHuba.
- Nie dodajemy nikogo do bypass list, żeby „szybciej poszło”.
- Nie wyłączamy ochrony `main` na chwilę, nawet dla drobnej poprawki.
- Nie scalamy PR z nierozwiązanymi wątkami tylko dlatego, że można je zignorować.
- Nie commitujemy sekretów ani ciężkich zasobów (zob. [SECURITY.md](../SECURITY.md)).

## Co dopiero planujemy

**Required status checks** (czyli automatyczne blokowanie PR, gdy testy nie przechodzą)
włączymy dopiero wtedy, gdy w repozytorium będzie stabilny, powtarzalny CI. Włączenie ich
teraz — bez testów i bez wybranego toolchainu — zablokowałoby każdy PR z powodu checków,
które nigdy się nie uruchamiają.

Kolejność jest zaplanowana w [roadmapie](ROADMAP.md#etap-0--repozytorium-i-audyt):

1. import kodu i wybór stosu technologicznego;
2. pierwsze uruchamialne testy;
3. workflow CI w `.github/workflows/`;
4. kilka PR-ów potwierdzających, że CI jest stabilny;
5. dopiero wtedy oznaczenie checków jako wymaganych i aktualizacja tej tabeli oraz ADR 0007.

## Gdzie sprawdzić aktualne ustawienia

W repozytorium na GitHubie: **Settings → Rules → Rulesets → Protect main**.
Widać tam wszystkie reguły opisane w tabeli powyżej. Jeżeli dokument i ustawienia
kiedykolwiek się rozjadą, **źródłem prawdy jest ustawienie w GitHubie** — a dokument
i ADR 0007 należy natychmiast poprawić.
