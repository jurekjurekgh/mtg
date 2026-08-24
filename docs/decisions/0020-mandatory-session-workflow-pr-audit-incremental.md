# ADR 0020: Obowiązkowy tryb sesji agentskiej — PR, audyt, inkrementalne commity

- **Status:** Zaakceptowana
- **Data:** 2026-08-18
- **Decydenci:** właściciel

## Kontekst

Sesja agentska (ADR 0013) startuje wyłącznie z `main` i tekstu pierwszego
promptu. Kolejne sesje wielokrotnie objawiały ten sam wzorzec problemów:

1. **Brak PR na GitHubie** — agent pracował lokalnie, nie otwierał Pull Requesta
   na początku sesji, przez co zmiany były niewidoczne i niemożliwe do merga.
2. **Brak audytu poprzedniego PR** — mimo obowiązku z ADR 0016 i AGENTS.md
   agent rozpoczynał kodowanie bez sprawdzenia, co faktycznie zostało scalone
   w poprzednim PR, przez co powielał błędy lub przeoczał regresje.
3. **Jeden wielki commit squasha** — agent gromadził zmiany lokalnie i pushował
   wszystko jako jeden commit, zamiast commitując każdy samodzielnie zielony
   krok. Utrudniało to przegląd, odtwarzanie i odzyskiwanie po resecie sandboxa.

Te trzy problemy są systematyczne i powtarzalne, a handoff nie może ich
rozwiązać, bo handoff opisuje jedną sesję i traci aktualność.

## Decyzja

Każda sesja agentska (bez wyjątku) działa w następującym obowiązkowym trybie
(A–D):

### A. Pull Request na starcie

Przed jakimkolwiek kodowaniem sesja otwiera nowy Pull Request z gałęzi
sesyjnej (`arena/*`) do `main`. PR może być pusty (sam tytuł i opis),
ale musi istnieć na GitHubie. Dzięki temu:
- zmiany są widoczne od pierwszej minuty;
- bramki CI mogą walidować commity;
- właściciel może śledzić postęp;
- po awarii sesji nowy agent znajduje gałąź na GitHubie, a nie tylko w lokalnym
  sandboxie, który przepadł.

### B. Pełny audyt kodu poprzedniego PR przed kodowaniem

Przed rozpoczęciem JAKIEJKOLWIEK nowej pracy (w tym kart, bug fixów, UX)
sesja wykonuje szczegółowy audyt techniczny poprzedniego scalonego PR.
Audyt obejmuje minimum:

- przegląd każdego zmienionego pliku pod kątem zgodności z CR MtG i ADR 0002
  (żadnych specjalnych przypadków po nazwie/ID karty w core);
- weryfikację, czy dodane mechaniki są generyczne (deskryptory, nie karty);
- sprawdzenie, czy testy rzeczywiście testują to, co deklarują (test RED→GREEN);
- potwierdzenie `npm test` na aktualnym `main`.

Audyt wykonuje się BEZ pełnego B0 (ADR 0018). Wynik audytu ląduje w
`docs/audits/AUDYT_<PR>.md` i w opisie PR bieżącej sesji.

### C. Inkrementalne commity

Każdy samodzielnie zielony krok (`npm test` zielony + `npm run build` zielony)
jest commitu OSOBNO i pushowany na GitHub. Zakazane jest gromadzenie zmian
przed pushowaniem ich jako jeden commit. Wyjątek: dokumentacja (plany, handoff,
aktualizacje stanu projektu) może być dołączona do ostatniego commitu
funkcjonalnego w sesji, ale tylko jeśli testy wciąż przechodzą.

### D. Tylko przyrostowo, nigdy force push (2026-08-24, zlecenie właściciela)

Jedynym dopuszczalnym sposobem zapisywania pracy jest **dodawanie nowych
commitów** na końcu gałęzi. **Force push (`git push --force`,
`--force-with-lease`) jest zakazany na KAŻDEJ gałęzi**, nie tylko na `main`.

Powód (zdarzyło się wielokrotnie): agent nie sprawdził stanu `HEAD` po resecie
workspace albo źle policzył diff i „na siłę” commitował całość, nadpisując
cudzą lub własną wcześniejszą pracę. Takie działanie jest niepożądane i grozi
**nieodwracalną utratą części pracy**.

Obowiązkowa procedura przed każdym pushem:

1. **Sprawdź `HEAD`**: `git log --oneline -3` i `git status`.
2. **Porównaj z gałęzią zdalną**: `git fetch origin <gałąź>` oraz
   `git log --oneline HEAD..FETCH_HEAD` (co jest zdalnie, a nie mam) i
   `git log --oneline FETCH_HEAD..HEAD` (co mam tylko ja).
3. **Gdy zdalna gałąź jest przede mną** (typowo po resecie workspace —
   `git reflog` pokazuje wtedy `clone: from …`): odzyskaj historię
   `git reset --hard FETCH_HEAD`, a swoją pracę przenieś `git cherry-pick`
   (lub nałóż zmiany ponownie). Nigdy nie nadpisuj zdalnej historii.
4. **Gdy push zostanie odrzucony** (`non-fast-forward`): to sygnał, że punkt 2
   nie został zrobiony. Wróć do niego — nie sięgaj po `--force`.
5. **Zabezpiecz pracę przed operacjami ryzykownymi**: `git branch backup-<opis>
   <sha>` przed `reset --hard`.

Wyjątku nie ma: jeśli jedyną drogą wydaje się force push, oznacza to, że
historia nie została sprawdzona.

### Nadrzędność

Powyższe cztery reguły (A, B, C, D) są nadrzędne wobec:
- treści handoffów (`docs/setup/HANDOFF_*.md`);
- tekstu startowego promptu nowej sesji Arena;
- wszelkich instrukcji w plikach `docs/plans/*.md`.

Żaden dokument ani wiadomość nie może wyłączyć lub osłabić tych reguł bez
zmiany niniejszego ADR.

Gdy prompt nie nazywa tematu, po A–C obowiązuje **ADR 0021** (pętla
domyślna zamiast pytania o kolejkę).

## Konsekwencje

### Pozytywne

- Każda zmiana jest od razu na GitHubie — ryzyko utraty pracy przy resecie
  sandboxa drastycznie maleje.
- Przegląd kodu przez właściciela jest możliwy w każdej chwili, nie dopiero
  na koniec sesji.
- Audyt poprzedniego PR wykrywa regresje i błędy koncepcyjne, zanim zostaną
  zabudowane następnymi zmianami.
- Inkrementalne commity umożliwiają `git bisect` i cofanie pojedynczych zmian.
- Kolejna sesja widzi historię PR-a na GitHubie — wie, co zostało zrobione,
  a co nie, bez zgadywania.

### Koszty i ryzyka

- Więcej pushy — ale to tania operacja.
- Audyt to dodatkowy czas na początku sesji (typowe 5–15 min) — ale zwraca się
  przez uniknięcie regresji.
- Konieczność dbania o to, żeby każdy commit był zielony — ale to już jest
  wymagane przez AGENTS.md ("samodzielnie zielony").

## Rozważone alternatywy

- Pozostawienie obecnych zasad (ADR 0013, 0016) — nie zapobiegły one
  wielokrotnym przypadkom łamania tych reguł, więc wymagają usztywnienia.
- Automatyczny check w CI — nie da się wymusić z poziomu CI, bo agent
  pracuje w sandboxie przed pushowaniem.

## Powiązania

- ADR 0007 — chroniony `main` i obowiązkowe PR (A jest wykonaniem tej zasady)
- ADR 0013 — sesje Agent Arena (nadrzędność względem handoffów)
- ADR 0016 — audyt poprzedniego PR (B jest usztywnieniem i rozszerzeniem)
- ADR 0018 — benchmark tylko na komendę właściciela
- AGENTS.md § "Obowiązkowy audyt poprzedniego PR"
- AGENTS.md § "Zasady pracy z repozytorium" (inkrementalne commity i push)