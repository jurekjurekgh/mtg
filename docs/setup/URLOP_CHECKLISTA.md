# Konfiguracja do pracy zdalnej — do wykonania przed wyjazdem

**Kontekst:** właściciel wyjeżdża na 3 tygodnie bez dostępu do komputera, z samym iPhonem.
Ten dokument zawiera **jedyne czynności, których agent nie może wykonać za niego**.

Czas wykonania: około 10 minut. Wszystko klika się w przeglądarce na github.com.

## Dlaczego to jest potrzebne

Agent pracuje na tokenie GitHub App, który **celowo nie ma dwóch uprawnień**:

| Czynność | Kod błędu | Kto musi to zrobić |
|---|---|---|
| Utworzenie pliku w `.github/workflows/` | `refusing to allow a GitHub App to create or update workflow ... without workflows permission` | właściciel |
| Włączenie GitHub Pages | `403 Resource not accessible by integration` | właściciel |

To ograniczenie bezpieczeństwa, nie usterka. Bez tych dwóch kroków nie da się automatycznie
budować i publikować aplikacji, więc **testowanie na iPhonie w trakcie urlopu byłoby niemożliwe**.

Po wykonaniu checklisty agent może przez cały urlop dodawać karty i poprawiać kod,
a każda scalona zmiana sama zbuduje się i opublikuje pod stałym adresem.

---

## Krok 1 — scal PR #4

Bez tego pozostałe kroki nie mają na czym pracować.

1. Wejdź na https://github.com/jurekjurekgh/mtg/pull/4
2. Przeczytaj opis i komentarz z aktualizacją.
3. **Squash and merge** → **Confirm**.

## Krok 2 — dodaj dwa pliki workflow

Pliki są gotowe w repozytorium, w katalogu `docs/setup/workflows/`.
Trzeba je tylko **skopiować** do `.github/workflows/`, bo tam agent nie ma dostępu.

Dla każdego z dwóch plików:

1. Wejdź na https://github.com/jurekjurekgh/mtg
2. Kliknij **Add file** → **Create new file**.
3. W polu nazwy wpisz dokładnie:
   - za pierwszym razem: `.github/workflows/ci.yml`
   - za drugim razem: `.github/workflows/pages.yml`
4. Otwórz odpowiedni plik źródłowy w drugiej karcie i skopiuj **całą** jego treść:
   - [`docs/setup/workflows/ci.yml`](workflows/ci.yml)
   - [`docs/setup/workflows/pages.yml`](workflows/pages.yml)
5. Wklej treść do pola edycji.
6. Na dole wybierz **Create a new branch for this commit** i kliknij
   **Propose new file**, a następnie **Create pull request** i **Squash and merge**.

> Ochrona `main` nie pozwala zapisać bezpośrednio — to działa poprawnie, nie jest błędem.

## Krok 3 — włącz GitHub Pages

1. Wejdź na https://github.com/jurekjurekgh/mtg/settings/pages
2. W sekcji **Build and deployment**, pole **Source**, wybierz **GitHub Actions**.
   (Nie „Deploy from a branch".)
3. Zapisz, jeśli pojawi się taki przycisk.

## Krok 4 — sprawdź, że wszystko ruszyło

1. Wejdź na https://github.com/jurekjurekgh/mtg/actions
2. Powinny być widoczne dwa uruchomienia: **CI** oraz **Publikacja na GitHub Pages**.
3. Poczekaj, aż oba dostaną zielony znacznik (zwykle 1–2 minuty).
4. Otwórz **https://jurekjurekgh.github.io/mtg/**

Powinna pojawić się strona „MTG Engine — Wirtualny Stół" z zieloną listą czterech
zaliczonych testów. Jeżeli ją widzisz — **konfiguracja jest kompletna**.

## Krok 5 — zapisz adres na telefonie

Otwórz https://jurekjurekgh.github.io/mtg/ na iPhonie i dodaj do ekranu głównego
(przycisk **Udostępnij** → **Do ekranu głównego**).

Poza wygodą ma to znaczenie techniczne: Safari kasuje dane stron po siedmiu dniach
bez wizyty, ale aplikacje dodane do ekranu głównego mają osobny licznik i dane
przeżywają dłużej.

---

## Co będzie możliwe podczas urlopu

Po wykonaniu powyższych kroków, z samego iPhone'a:

| Czynność | Jak |
|---|---|
| Zlecanie zadań agentowi | czat Arena w przeglądarce |
| Przeglądanie zmian | GitHub w przeglądarce lub aplikacja GitHub |
| Zatwierdzanie zmian | przycisk **Squash and merge** w PR |
| Testowanie i granie | https://jurekjurekgh.github.io/mtg/ |
| Zgłaszanie błędów | komentarz w PR albo Issue |

Cykl pracy: agent robi zmiany na gałęzi swojej sesji i dopisuje je do **jednego PR**
(kolejne tematy = kolejne commity, opis PR aktualizowany na bieżąco) → Ty czytasz
na telefonie. **Nie musisz scalać po każdym kroku** — scalenie kończy sesję agenta.
Gdy wciśniesz **Squash and merge**, po około minucie adres pokazuje nową wersję.

**Aktualizacja na iPhonie:** jeśli strona wygląda na starą, przeciągnij ją w dół, aby
odświeżyć. Safari potrafi trzymać poprzednią wersję w pamięci podręcznej.

## Czego nie da się zrobić z telefonu

Uczciwa lista, żeby nie było niespodzianek:

- **Ilustracje z Twojej kolekcji** (~10 GB w `./img/`) nie będą widoczne online.
  W trybie internetowym karty pokazują grafiki ze Scryfall. Reguły i przebieg gry
  są identyczne — to jedyna różnica.
- **Zmiana ustawień repozytorium** (kroki 2–4 tej checklisty) wymaga uprawnień właściciela;
  gdyby coś trzeba było przekonfigurować, agent poda instrukcję, ale klikać musisz Ty.
- **Nowe pliki workflow** — ta sama blokada. Jeśli w trakcie urlopu pojawi się potrzeba
  kolejnego workflow, agent przygotuje go w `docs/setup/workflows/`, a Ty skopiujesz
  tak jak w kroku 2.

## Jeżeli coś nie zadziała

1. **Zakładka Actions pokazuje czerwony znaczek** — otwórz uruchomienie i wklej agentowi
   treść błędu. Agent poprawi kod w PR.
2. **Adres zwraca 404** — Pages potrzebuje kilku minut po pierwszym uruchomieniu.
   Jeśli po 10 minutach dalej 404, sprawdź, czy w Settings → Pages źródło to
   **GitHub Actions**.
3. **Strona jest pusta lub bez stylów** — przeciągnij w dół, żeby odświeżyć.
   Jeżeli nie pomoże, zgłoś agentowi.

---

## Powiązania

- [ADR 0011 — modularne źródła, jednoplikowy artefakt, dwa tryby uruchomienia](../decisions/0011-modular-sources-single-file-artifact.md)
- [Historia projektu (dziennik sesji)](../PROJECT_HISTORY.md)
- [Roadmapa, Etap 0b](../ROADMAP.md)
