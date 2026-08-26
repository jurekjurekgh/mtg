# Środowisko sesji agentskiej — ograniczenia i pułapki (dokument trwały)

> **To NIE jest handoff.** Handoff opisuje jedną sesję i traci aktualność; ten
> plik zbiera **stałe właściwości środowiska**, które dotyczą każdej sesji.
> Treści powtarzane w kolejnych `HANDOFF_*.md` („pułapki środowiska") należą
> tutaj — w handoffie zostaje wyłącznie to, co specyficzne dla danej sesji.
>
> Decyzja właściciela (2026-08-14): *„Wszystkie pułapki — typu cofanie HEAD itp.
> — wiedza zapisana w poprzednich handoffach"* ma trafić do reguł trwałych.

Powiązania: [ADR 0013](../decisions/0013-agent-arena-sessions-and-mandatory-handoff.md)
(model sesji), [ADR 0007](../decisions/0007-protected-main-and-mandatory-pull-requests.md)
(chroniony `main`), [docs/LESSONS.md](../LESSONS.md) (lekcje diagnostyczne).

---

## 1. Izolacja sesji — co NAPRAWDĘ przetrwa do następnej sesji

Najważniejsze ograniczenie całego projektu. Nowa sesja Areny startuje
z **czystego klona** i ma dostęp wyłącznie do:

1. **gałęzi `main` na GitHubie** (stan po scaleniu PR poprzedniej sesji),
2. **tekstu pierwszego promptu** — czyli bloku przekazania wklejonego przez
   właściciela do czatu.

**Nie przetrwa NIC innego.** W szczególności:

| Co przepada | Dlaczego to ważne |
|---|---|
| pliki lokalne poprzedniej sesji (workspace, `/tmp`, artefakty) | fix „gotowy, ale niezacommitowany" = fix nieistniejący |
| gałąź `arena/…` poprzedniej sesji, jeśli PR nie został scalony | praca zostaje na GitHubie, ale nowa sesja jej nie czyta |
| historia czatu, ustalenia ustne, kontekst dyskusji | decyzje muszą trafić do repozytorium |
| zmienne środowiskowe, cache, zainstalowane zależności | `npm i` w `tools/table-tester` trzeba powtórzyć |

**Konsekwencje praktyczne:**

- **Commituj i pushuj często.** Praca istnieje dopiero po `git push`.
- Wszystko, co ma przetrwać, zapisz **w repozytorium** — kod, testy, ADR,
  `docs/LESSONS.md`, handoff sesji.
- Blok przekazania w czacie jest **kopią** wiedzy z repozytorium, nie jej
  jedynym nośnikiem (ADR 0013 §4). Jeśli coś jest tylko w czacie — przepadnie.
- Nie zakładaj, że następna sesja „będzie pamiętać" ustalenie z rozmowy.
  Nie będzie.

---

## 2. Sandbox potrafi zresetować workspace w trakcie sesji

**Objaw:** lokalny `HEAD` nagle wskazuje `main`, commity sesji „znikają",
`git branch -a` nie pokazuje gałęzi sesji, a `git push` odrzuca
(*non-fast-forward*) albo `origin/<gałąź>` jest nieznane. W `git reflog` widać
świeży wpis `clone: from …`.

**Przyczyna:** środowisko odtworzyło workspace ze świeżego klona. Zdarzało się
wielokrotnie (handoffy notują „2×", „3× w tej sesji"), także **w środku pracy**.

**To nie jest utrata pracy — o ile commity były wypchnięte.**

### Procedura odzyskania

```bash
git reflog -10                     # potwierdź: wpis „clone: from …"
git ls-remote --heads origin | grep <slug-sesji>   # praca jest na zdalnej gałęzi?
git fetch origin <gałąź-sesji>
git reset --hard FETCH_HEAD        # odtwórz historię sesji lokalnie
```

Jeżeli po resecie zdarzyło Ci się zacommitować **na `main`** (bo tam wskazywał
HEAD po klonie), przenieś commit na gałąź sesji:

```bash
git branch backup-<opis> <sha-commita>   # najpierw zabezpiecz
git fetch origin <gałąź-sesji>
git reset --hard FETCH_HEAD
git cherry-pick <sha-commita>            # konflikty w docs są normalne
```

Konflikty w `docs/PROJECT_HISTORY.md` i handoffach przy cherry-picku są typowe
(commit powstał na starszej bazie): weź wersję z gałęzi
(`git checkout HEAD -- <plik>`) i **nałóż zmiany ponownie**, zamiast ręcznie
sklejać znaczniki konfliktu.

### Profilaktyka

- Po każdym commicie sprawdź `git log --oneline -1` i `git status`.
- Pushuj po każdym samodzielnie zielonym commicie — nie zbieraj pięciu naraz.
- Przed dłuższą operacją (benchmark, pełne testy) upewnij się, że praca jest
  wypchnięta.

---

## 3. Git i GitHub

- **`git checkout <plik>` cofa też Twoje niezacommitowane zmiany.** Klasyczna
  pułapka przy usuwaniu tymczasowego `console.log`: znika razem z fiksem
  w tym samym pliku. Zacommituj fix **przed** instrumentowaniem kodu albo
  usuwaj debug edycją odwrotną. Po każdym `checkout` sprawdź `git diff`.
- **`GH_TOKEN` potrafi wygasnąć w trakcie sesji** (zdarzało się 2× dziennie).
  Objaw: `git push` prosi o hasło, `gh auth status` mówi *token no longer
  valid*. Commity lokalne są bezpieczne — poproś właściciela o reconnect
  GitHub w Arenie i ponów push. **Nigdy nie proś o token w czacie.**
- **`gh pr edit` bywa odrzucane** błędem GraphQL o *Projects (classic)*.
  Obejście: `gh api -X PATCH repos/<owner>/<repo>/pulls/<nr> -f title=… -F body=@plik`.
- **Komunikaty commitów pisz do pliku poza repozytorium** (np. `/home/user/msg.txt`),
  nigdy w katalogu repo — inaczej wpadną do commita.
- Pracuj wyłącznie na gałęzi sesji; nigdy nie pushuj do `main` (ADR 0007).

---

## 4. Sieć i narzędzia

- **Arbitralny egress HTTPS jest zablokowany, ale rejestr npm NIE.**
  Zmierzone 2026-08-24 (M202): `curl https://api.scryfall.com/...` → kod 000,
  `fetch` w Node → `fetch failed`, za to `npm i` w `tools/table-tester`
  przechodzi (63 pakiety, ~1 s). Czyli: Żywego Testera da się uruchomić
  w sesji (nie trzeba zainstalowanego wcześniej `node_modules`), ale danych
  kart z Scryfalla nadal pobieraj narzędziem `fetch_page` i zapisuj do
  repozytorium (ADR 0010).
- **`write_file` działa tylko w workspace.** Skrypty pomocnicze twórz przez
  `bash` z heredokiem, jeśli mają wylądować poza repo.
- **Polskie znaki:** narzędzie `edit_file` potrafi je uszkodzić. Do edycji
  plików z polskim tekstem używaj `python3` + `pathlib.Path` (czytaj/zapisuj
  z `encoding='utf-8'`).
- **Żywy Tester** wymaga `npm run build`, a przy pierwszym użyciu `npm i`
  w `tools/table-tester` (jsdom nie jest instalowany w katalogu głównym).
  **Tester ładuje `dist/mtg-table.html`, nie `src/`.** Po każdej zmianie
  w `src/` trzeba przebudować — inaczej mierzy się STARY kod i wygląda to
  jak „naprawa nie działa" (M213: pierwszy przebieg po naprawie sondy dał
  niezmienioną liczbę zgłoszeń właśnie dlatego).
- **Testy UI** w `test/` korzystają z własnego mini-harnessu DOM, bo `jsdom`
  nie jest zależnością repozytorium — nie importuj go w testach core.

---

## 5. Czas wykonania (limity sesji)

| Operacja | Czas | Uwagi |
|---|---|---|
| `npm test` | ~3 min | uruchamiaj przed każdym commitem |
| `npm run build` | <1 s | j.w. |
| `node --test test/bot-benchmark.test.js` | ~2 min | próbka regresji bota |
| `node tools/benchmark.mjs --seeds 12` | ~9 min | realistyczny pomiar w sesji |
| pełna macierz B0 (50 seedów) | ~40+ min | zwykle przekracza budżet sesji |

Benchmark uruchamiaj **bez** `| tail` — potok potrafi uciąć proces przed
wypisaniem tabeli. Przy zmianach bota mierz też **ukierunkowanie** na talie
zawierające daną mechanikę (patrz lekcja L2 w `docs/LESSONS.md`).

---

## 6. Checklista startu sesji

1. `git log --oneline -3` i `git status` — gdzie jestem, czy czysto.
2. Otwórz PR gałęzi sesji (ADR 0020 A), nawet pusty po pierwszym commicie.
3. Przeczytaj **w tej kolejności:** `AGENTS.md` (w tym trzy+czwartą regułę
   nadrzędną), **wszystkie ADR-y** w `docs/decisions/`, `docs/LESSONS.md`,
   ten plik (pułapki), najnowszy handoff. Handoff jest skrótem, nie
   źródłem prawdy.
4. `npm test` i `npm run build` — porównaj z najnowszym handoffem.
5. Audyt poprzedniego scalonego PR **zanim** nowa praca (ADR 0020 B).
6. **Nie pytaj „co robimy?”.** Brak nazwanego tematu = ADR 0021 (pętla
   domyślna). „Pytaj, jeśli nie wiesz” = tylko decyzje blokujące.
7. **Skonfrontuj treść zlecenia ze stanem repozytorium** (lekcja L7).

## 7. Checklista przed końcem sesji

1. `npm test` i `npm run build` zielone.
2. Wszystko zacommitowane **i wypchnięte** (`git status` czysty,
   `git log origin/<gałąź>..HEAD` pusty).
3. Najnowszy `docs/setup/HANDOFF_*.md` opisuje aktualny stan.
4. Handoff sesji (`docs/setup/HANDOFF_<data>.md`) — stan, kolejka, decyzje.
5. Reguły trwałe trafiły do ADR / `docs/LESSONS.md` / `AGENTS.md`, a nie tylko
   do handoffu.
6. Opis PR zaktualizowany kumulacyjnie.
