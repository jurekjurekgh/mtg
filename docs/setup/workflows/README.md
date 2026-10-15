# Wzorce workflowów — dlaczego istnieją i jak je wgrywać

Ten katalog trzyma **kopie** plików z `.github/workflows/`. Nie są to zwykłe
duplikaty — to bezpiecznik na wypadek, gdyby agent nie mógł wypchnąć zmiany
w workflowie (tak było do 2026-10-13c).

## Dlaczego (historia i bezpiecznik)

Token, którym pracuje agent w sesji Arena, **nie miał uprawnienia `workflows`**.
Każdy `git push` gałęzi zawierającej jakikolwiek plik `.github/workflows/*`
kończył się odmową GitHuba:

```
! [remote rejected] ... (refusing to allow a GitHub App to create or update
workflow `.github/workflows/<plik>` without `workflows` permission)
```

Gałąź `main` jest dodatkowo chroniona (ADR 0007): nie da się w niej zapisać
niczego poza scaleniem Pull Requesta — dotyczy to również właściciela.
Efekt: zmiana workflowu musiała powstać **we wzorcu**, a potem zostać
**ręcznie wgrana** przez właściciela jako osobny PR.

**Stan obecny (2026-10-13c):** właściciel przyznał Appce uprawnienie
`workflows` — agent wnosi zmiany w `.github/workflows/*` sam, zwykłą drogą PR
(nie trzeba nic kopiować ręcznie). Wzorce zostają w repo, bo są tanie i nadal
pełnią rolę bezpiecznika (gdyby uprawnienie zniknęło), a strażnik pilnuje ich
zgodności z żywymi plikami.

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
| `pages.yml` | zgodny z żywym workflowem — ochrona publikacji na Pages (sprzątanie artefaktów poprzednich prób + czekanie na widoczność) jest już wgrana |
