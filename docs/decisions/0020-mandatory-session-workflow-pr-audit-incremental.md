# ADR 0020: Obowiązkowy tryb sesji agentskiej — PR, audyt, inkrementalne commity

- **Status:** Zaakceptowana
- **Data:** 2026-08-18
- **Decydenci:** właściciel

## Kontekst

Sesja agentska (ADR 0013) startuje wyłącznie z `main` i tekstu pierwszego
promptu. Kolejne sesje powtarzały trzy problemy: **brak PR na GitHubie** (agent
pracował lokalnie, zmiany były niewidoczne i niemożliwe do merga); **brak
audytu poprzedniego PR** mimo ADR 0016 (powielanie błędów, przeoczone regresje);
**jeden wielki commit squasha** zamiast commitów per zielony krok (trudny
przegląd, trudne odzyskiwanie po resecie sandboxa). Handoff tego nie rozwiąże —
opisuje jedną sesję i traci aktualność.

## Decyzja

Każda sesja agentska działa w obowiązkowym trybie (A–D).

### A. Pull Request na starcie

Przed jakimkolwiek kodowaniem sesja otwiera PR z gałęzi `arena/*` do `main`. PR
może być pusty, ale musi istnieć na GitHubie: zmiany są widoczne od pierwszej
minuty, CI może walidować commity, właściciel śledzi postęp, a po awarii sesji
nowy agent znajduje gałąź na GitHubie, nie w sandboxie, który przepadł.

### B. Pełny audyt poprzedniego PR przed kodowaniem

Przed JAKĄKOLWIEK nową pracą (karty, bug fixy, UX) audyt techniczny poprzedniego
scalonego PR, minimum:

- przegląd każdego zmienionego pliku pod kątem zgodności z CR MtG i ADR 0002
  (żadnych przypadków specjalnych po nazwie/ID karty w core);
- weryfikacja, czy dodane mechaniki są generyczne (deskryptory, nie karty);
- sprawdzenie, czy testy testują to, co deklarują (RED→GREEN);
- potwierdzenie `npm test` na aktualnym `main`.

Audyt bez pełnego B0 (ADR 0018). Wynik ląduje w `docs/audits/AUDYT_<PR>.md` i w
opisie PR bieżącej sesji.

### C. Inkrementalne commity

Każdy samodzielnie zielony krok (`npm test` + `npm run build` zielone) jest
commitowany OSOBNO i pushowany. Zakaz gromadzenia zmian do jednego commitu.
Wyjątek: dokumentacja (plany, handoff, stan projektu) może być dołączona do
ostatniego commitu funkcjonalnego, jeśli testy wciąż przechodzą.

### D. Tylko przyrostowo, nigdy force push (2026-08-24, zlecenie właściciela)

Jedynym dopuszczalnym zapisem pracy jest **dodawanie nowych commitów** na końcu
gałęzi. **Force push (`--force`, `--force-with-lease`) jest zakazany na KAŻDEJ
gałęzi**, nie tylko na `main`. Powód: agent po resecie workspace nie sprawdził
`HEAD` lub źle policzył diff i nadpisał wcześniejszą pracę — grozi to
nieodwracalną utratą.

Obowiązkowa procedura przed każdym pushem:

1. **Sprawdź `HEAD`**: `git log --oneline -3` i `git status`.
2. **Porównaj z gałęzią zdalną**: `git fetch origin <gałąź>`, potem
   `git log --oneline HEAD..FETCH_HEAD` (co mają, a ja nie) i
   `git log --oneline FETCH_HEAD..HEAD` (co mam tylko ja).
3. **Gdy zdalna gałąź jest przede mną** (typowo po resecie — `git reflog`
   pokazuje `clone: from …`): `git reset --hard FETCH_HEAD`, swoją pracę
   przenieś `git cherry-pick` (lub nałóż ponownie). Nigdy nie nadpisuj zdalnej
   historii.
4. **Gdy push zostanie odrzucony** (`non-fast-forward`): to sygnał, że punkt 2
   nie został wykonany — wróć do niego, nie sięgaj po `--force`.
5. **Zabezpiecz pracę** przed operacjami ryzykownymi: `git branch backup-<opis>
   <sha>` przed `reset --hard`.

Wyjątku nie ma: jeśli jedyną drogą wydaje się force push, historia nie została
sprawdzona.

### Nadrzędność

Reguły A–D są nadrzędne wobec treści handoffów (`docs/setup/HANDOFF_*.md`),
tekstu startowego promptu Arena i instrukcji w `docs/plans/*.md`. Żaden dokument
nie może ich wyłączyć bez zmiany tego ADR. Gdy prompt nie nazywa tematu, po A–C
obowiązuje **ADR 0021** (pętla domyślna zamiast pytania o kolejkę).

## Konsekwencje

### Pozytywne

- Każda zmiana jest od razu na GitHubie — ryzyko utraty pracy przy resecie
  sandboxa drastycznie maleje; przegląd możliwy w każdej chwili.
- Audyt wykrywa regresje przed zabudowaniem ich kolejnymi zmianami.
- Inkrementalne commity umożliwiają `git bisect` i cofanie pojedynczych zmian.
- Kolejna sesji widzi historię PR-a na GitHubie zamiast zgadywać.

### Koszty i ryzyka

- Więcej pushy — tania operacja.
- Audyt to dodatkowy czas na starcie (5–15 min) — zwraca się przez uniknięcie
  regresji.
- Każdy commit musi być zielony — i tak wymaga tego AGENTS.md.

## Rozważone alternatywy

- **Pozostawienie zasad ADR 0013/0016** — nie zapobiegły wielokrotnym
  naruszeniom; wymagają usztywnienia.
- **Automatyczny check w CI** — nie da się wymusić, bo agent pracuje w
  sandboxie przed pushowaniem.

## Powiązania

- ADR 0007 (A jest wykonaniem tej zasady), ADR 0013 (nadrzędność względem
  handoffów), ADR 0016 (B to usztywnienie), ADR 0018 (B0 tylko na komendę).
- `AGENTS.md` § „Obowiązkowy audyt poprzedniego PR", § „Zasady pracy z
  repozytorium".
