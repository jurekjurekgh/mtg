# ADR 0007: Chroniony `main` i obowiązkowe Pull Requesty

- **Status:** Zaakceptowana
- **Data:** 2026-07-31
- **Decydenci:** właściciel projektu

## Kontekst

Repozytorium jest publiczne i rozwijane wspólnie przez właściciela oraz agentów
automatycznych. Ryzyka na tym etapie: przypadkowy push wprost do `main` bez
przeglądu; force push lub usunięcie gałęzi niszczące historię decyzji; zmiany
agenta bez świadomej akceptacji właściciela; niejasna historia `main` przy wielu
drobnych commitach; nierozwiązane uwagi w PR ginące w momencie scalenia.

Projekt ma realnie jednego decydenta: wymaganie approvals od osób trzecich
zablokowałoby pracę, a wymaganie przechodzących status checks nie ma dziś sensu
(brak CI i wybranego toolchaina — ADR 0006, `docs/PROJECT_HISTORY.md`).

## Decyzja

Gałąź `main` jest chroniona regułą repozytorium (ruleset **Protect main**,
`enforcement: active`, zakres `~DEFAULT_BRANCH`):

1. **Każda zmiana w `main` przechodzi przez Pull Request** — bezpośredni push
   jest zabroniony.
2. **Force push (non-fast-forward) jest zabroniony**, podobnie jak usunięcie
   gałęzi `main`.
3. **Bypass list pozostaje pusta** — zasady obowiązują wszystkich, łącznie z
   właścicielem i agentami.
4. **Wymagane approvals: 0** — jeden decydent; sztuczny reviewer nie zwiększa
   bezpieczeństwa, a blokuje pracę.
5. **Rozwiązanie wątków komentarzy jest wymagane** przed scaleniem
   (`required_review_thread_resolution: true`).
6. **Merge jest jawną decyzją właściciela** — brak wymaganych approvals nie
   oznacza automatycznego scalania; agent przygotowuje PR i zatrzymuje się przed
   merge.
7. **Dozwoloną metodą scalania jest `Squash and merge`**
   (`allowed_merge_methods: ["squash"]`): jeden PR = jeden czytelny commit.
8. **Required status checks nie są jeszcze włączone** — dopiero po zbudowaniu
   stabilnego CI, osobną zmianą aktualizującą ten ADR i `docs/WORKFLOW.md`.

Operacyjny opis procesu: `docs/WORKFLOW.md`; zasady bezpieczeństwa: `SECURITY.md`.

## Konsekwencje

### Pozytywne

- Historia `main` odporna na przypadkowe nadpisanie i skasowanie.
- Każda zmiana ma widoczny przegląd różnic i miejsce na dyskusję.
- Właściciel zachowuje pełną kontrolę nad tym, co i kiedy wchodzi do `main`.
- Praca agentów jest z definicji odwracalna: gałąź + PR, nigdy bezpośredni zapis.
- Squash daje liniową historię odpowiadającą jednostkom zmian.
- Wymóg rozwiązania wątków zapobiega scalaniu z pominięciem uwag.
- Zasady są w repozytorium, więc kolejne sesje nie muszą ich odgadywać.

### Koszty i ryzyka

- Nawet jednoliterowa poprawka wymaga gałęzi i PR (świadomie akceptowany
  narzut); squash gubi granularną historię wewnątrz PR, więc opis PR jest
  elementem dokumentacji.
- Przy 0 approvals ochrona przed „scaleniem bez czytania" jest procesowa, nie
  techniczna — odpowiedzialność spoczywa na właścicielu.
- Brak required status checks: dziś nic automatycznie nie blokuje złej zmiany
  (luka celowa i tymczasowa).
- Zakaz force push utrudni czyszczenie historii (np. po ujawnieniu sekretu) —
  wymaga osobnej, świadomej decyzji.
- Ustawienia GitHuba mogą się rozjechać z dokumentem: źródłem prawdy jest
  ruleset, rozjazd naprawiamy natychmiast.

## Rozważone alternatywy

- **Brak ochrony `main`** — dopuszcza przypadkowy push i force push agenta.
- **Wymagane 1+ approval** — przy jednym decydencie: blokada albo pusty rytuał.
- **Bypass list z właścicielem/aplikacją agenta** — usuwa gwarancję, że każda
  zmiana ma PR.
- **Merge commit lub rebase merge** — mniej czytelna historia niż squash.
- **Required status checks od razu** — zablokowałyby każdy PR (brak checków).
- **Klasyczne branch protection zamiast ruleset** — rulesety są nowszym, lepiej
  audytowalnym mechanizmem GitHuba.

## Kryteria rewizji

Zastąpić lub zrewidować, gdy: powstanie stabilny CI (włączenie required status
checks); dołączy druga osoba z prawem przeglądu (wtedy approvals ≥ 1); pojawią
się wydania/tagi/gałęzie wydaniowe pod ochroną; zajdzie potrzeba przepisania
historii `main`.

## Powiązania

- [Instrukcja workflow](../WORKFLOW.md) · [Polityka bezpieczeństwa](../../SECURITY.md)
- [Zasady współpracy](../../CONTRIBUTING.md) · [Instrukcja dla agentów](../../AGENTS.md)
- [Historia projektu](../PROJECT_HISTORY.md) · [Roadmapa — Etap 0](../ROADMAP.md#etap-0--repozytorium-i-audyt)
- [ADR 0006](0006-audit-before-table-extraction.md)
