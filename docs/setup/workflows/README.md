# Wzorce workflowów — dlaczego istnieją i jak je wgrywać

Ten katalog trzyma **kopie** plików z `.github/workflows/`. Nie są to zwykłe
duplikaty — to jedyna droga, jaką agent może przygotować zmianę w workflowie.

## Dlaczego

Token, którym pracuje agent w sesji Arena, **nie ma uprawnienia `workflows`**.
Każdy `git push` gałęzi zawierającej jakikolwiek plik `.github/workflows/*`
kończy się odmową GitHuba:

```
! [remote rejected] ... (refusing to allow a GitHub App to create or update
workflow `.github/workflows/<plik>` without `workflows` permission)
```

Gałąź `main` jest dodatkowo chroniona (ADR 0007): nie da się w niej zapisać
niczego poza scaleniem Pull Requesta — dotyczy to również właściciela.
Efekt: zmiana workflowu musi powstać **we wzorcu**, a potem zostać **ręcznie
wgrana** przez właściciela jako osobny PR.

## Jak wgrać wzorzec (właściciel, przez stronę GitHuba)

1. Otwórz plik wzorca tutaj, np. `docs/setup/workflows/pages.yml`, i skopiuj
   jego zawartość (przycisk „Raw” → Ctrl+A → Ctrl+C).
2. W repozytorium: **Add file → Create new file**, wpisz nazwę
   `.github/workflows/pages.yml` (ta sama nazwa co wzorzec).
3. Wklej skopiowaną zawartość **1:1, razem ze znacznikami komentarzy** (patrz
   niżej — są to zwykłe komentarze YAML, GitHub je ignoruje, a strażnik ich
   pilnuje).
4. Wybierz **Create a new branch for this commit and start a pull request**,
   np. gałąź `ci/pages-fix`, i scal PR do `main` (Squash and merge).

## Znaczniki `PENDING-UPLOAD`

Fragment wzorca, który **czeka na ręczne wgranie**, jest oznaczony parą
komentarzy:

```yaml
  # >>> PENDING-UPLOAD (A): <po co ten fragment>
  ...
  # <<< PENDING-UPLOAD (A)
```

Litera to identyfikator regionu; regionów może być kilka. Reguły:

- Po wgraniu wzorca komentarze **zostają w pliku** (są nieaktywne, a mówią
  skąd wzięła się dana proteza).
- Strażnik `test/ci-workflow-tiers.test.js` porównuje wzorzec z żywym
  workflowem **po usunięciu** wszystkich regionów `PENDING-UPLOAD`. Dzięki
  temu oczekująca zmiana nie wygląda na „cichą rozjazdówkę", ale każda
  **inna** różnica (np. ręczne cofnięcie protezy w `.github/workflows/`)
  natychmiast czerwieni testy.
- Regionów nie wolno zakładać na kroku, który ma zostać wspólny dla obu
  plików (np. `actions/upload-pages-artifact`) — muszą obejmować tylko to,
  co realnie różni wzorzec od żywego workflowu.
- Strażnik pilnuje też, że żywy workflow nie ma **połowicznej** protezy
  (np. kroków sprzątania bez uprawnienia `actions: write`).

## Stan wzorców

| Wzorzec | Status |
|---|---|
| `ci.yml` | zgodny z żywym workflowem (bez regionów oczekujących) |
| `pages.yml` | **czeka na wgranie**: regiony `(A)`–`(C)` — ochrona publikacji na Pages przed re-runami (patrz `docs/setup/HANDOFF_2026-10-13c.md`) |
