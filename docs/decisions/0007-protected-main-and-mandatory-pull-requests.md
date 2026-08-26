# ADR 0007: Chroniony `main` i obowiązkowe Pull Requesty

- **Status:** Zaakceptowana
- **Data:** 2026-07-31
- **Decydenci:** właściciel projektu

## Kontekst

Repozytorium jest publiczne i od początku rozwijane wspólnie przez właściciela oraz agentów
automatycznych. Kod produkcyjny nie został jeszcze zaimportowany, ale dokumentacja, ADR-y
i przyszły engine są już źródłem prawdy dla projektu.

Ryzyka na tym etapie:

- przypadkowy push wprost do `main` omijający jakikolwiek przegląd;
- force push lub usunięcie gałęzi niszczące historię decyzji;
- zmiany wprowadzone przez agenta bez świadomej akceptacji właściciela;
- niejasna historia `main` przy wielu drobnych commitach roboczych;
- nierozwiązane uwagi w PR, które giną w momencie scalenia.

Jednocześnie projekt ma realnie jednego decydenta. Wymaganie approvals od osób trzecich
zablokowałoby pracę, a wymaganie przechodzących status checks nie ma dziś sensu,
bo nie istnieje żaden CI ani wybrany toolchain (zob. ADR 0006 i `docs/PROJECT_HISTORY.md`).

## Decyzja

Gałąź `main` jest chroniona regułą repozytorium (ruleset **Protect main**, `enforcement: active`,
zakres `~DEFAULT_BRANCH`). Obowiązują następujące ustalenia:

1. **Każda zmiana w `main` przechodzi przez Pull Request.** Bezpośredni push jest zabroniony.
2. **Force push (non-fast-forward) jest zabroniony**, podobnie jak usunięcie gałęzi `main`.
3. **Bypass list pozostaje pusta.** Zasady obowiązują wszystkich, łącznie z właścicielem
   i agentami automatycznymi.
4. **Wymagane approvals: 0.** Projekt ma jednego decydenta; sztuczny reviewer nie zwiększa
   bezpieczeństwa, a blokuje pracę.
5. **Rozwiązanie wątków komentarzy jest wymagane** przed scaleniem
   (`required_review_thread_resolution: true`).
6. **Merge jest jawną decyzją właściciela.** Brak wymaganych approvals nie oznacza
   automatycznego scalania — agent przygotowuje PR i zatrzymuje się przed merge.
7. **Dozwoloną metodą scalania jest `Squash and merge`** (`allowed_merge_methods: ["squash"]`).
   Jeden PR daje jeden czytelny commit w historii `main`.
8. **Required status checks nie są jeszcze włączone.** Zostaną dodane dopiero po zbudowaniu
   stabilnego, powtarzalnego CI, osobną zmianą aktualizującą ten ADR i `docs/WORKFLOW.md`.

Operacyjny opis tego procesu dla właściciela znajduje się w `docs/WORKFLOW.md`,
a zasady bezpieczeństwa danych i zgłaszania podatności w `SECURITY.md`.

## Konsekwencje

### Pozytywne

- Historia `main` jest odporna na przypadkowe nadpisanie i skasowanie.
- Każda zmiana ma widoczny przegląd różnic i miejsce na dyskusję przed scaleniem.
- Właściciel zachowuje pełną kontrolę nad tym, co i kiedy wchodzi do `main`.
- Praca agentów jest z definicji odwracalna: gałąź plus PR, nigdy bezpośredni zapis.
- Squash daje czytelną, liniową historię odpowiadającą jednostkom zmian, a nie krokom roboczym.
- Wymóg rozwiązania wątków zapobiega scalaniu z pominięciem zgłoszonych uwag.
- Zasady są zapisane w repozytorium, więc kolejne sesje agentów nie muszą ich odgadywać.

### Koszty i ryzyka

- Nawet jednoliterowa poprawka wymaga gałęzi i PR — świadomie akceptowany narzut.
- Squash gubi granularną historię pojedynczych commitów wewnątrz PR; opis PR staje się
  ważnym elementem dokumentacji.
- Przy 0 wymaganych approvals ochrona przed „scaleniem bez czytania” jest procesowa,
  a nie techniczna; odpowiedzialność spoczywa na właścicielu.
- Brak required status checks oznacza, że dziś nic automatycznie nie blokuje złej zmiany.
  To luka celowa i tymczasowa.
- Zakaz force push utrudni ewentualne czyszczenie historii (np. po ujawnieniu sekretu)
  i będzie wymagał osobnej, świadomej decyzji.
- Ustawienia GitHuba mogą się rozjechać z tym dokumentem; źródłem prawdy jest ruleset,
  a rozjazd należy natychmiast naprawić.

## Rozważone alternatywy

- **Brak ochrony `main`** — najprostsze, ale dopuszcza przypadkowy push i force push agenta;
  odrzucone.
- **Wymagane 1+ approval** — przy jednym decydencie oznacza albo blokadę, albo zatwierdzanie
  własnych PR-ów jako pusty rytuał; odrzucone na tym etapie.
- **Bypass list z właścicielem lub aplikacją agenta** — wygodne, ale usuwa gwarancję,
  że każda zmiana ma PR; odrzucone, bypass list pozostaje pusta.
- **Merge commit lub rebase merge** — dopuszczalne technicznie, ale dają mniej czytelną
  historię niż jeden commit na jeden PR; odrzucone na rzecz squash.
- **Required status checks od razu** — zablokowałyby każdy PR, bo checki jeszcze nie istnieją;
  odłożone do czasu stabilnego CI.
- **Klasyczne branch protection zamiast ruleset** — funkcjonalnie zbliżone, ale rulesety są
  nowszym, lepiej audytowalnym mechanizmem GitHuba; wybrano ruleset.

## Kryteria rewizji

Ten ADR należy przejrzeć i ewentualnie zastąpić, gdy:

- powstanie stabilny CI i będzie można włączyć required status checks;
- do projektu dołączy druga osoba z prawem przeglądu (wtedy warto rozważyć approvals ≥ 1);
- pojawi się potrzeba wydań, tagów lub gałęzi wydaniowych objętych ochroną;
- zajdzie potrzeba przepisania historii `main`.

## Powiązania

- [Instrukcja workflow dla właściciela](../WORKFLOW.md)
- [Polityka bezpieczeństwa](../../SECURITY.md)
- [Zasady współpracy](../../CONTRIBUTING.md)
- [Instrukcja dla agentów](../../AGENTS.md)
- [Historia projektu](../PROJECT_HISTORY.md)
- [Roadmapa — Etap 0](../ROADMAP.md#etap-0--repozytorium-i-audyt)
- [ADR 0006 — Audyt przed wydzieleniem Wirtualnego Stołu](0006-audit-before-table-extraction.md)
