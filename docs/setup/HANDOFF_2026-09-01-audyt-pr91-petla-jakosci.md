# Handoff — audyt PR #91 + pętla jakości, 2026-09-01

## Stan na koniec sesji

- Gałąź `arena/01a05d4f-mtg`, **PR #92 OTWARTY** (base `main`; scalenie należy
  do właściciela: `Squash and merge`).
- `npm test` (fast) **4081/4081**, `test:all` **4091/4091** (fast + 10
  bot-benchmark), build **57 modułów / 3031,7 kB**. Drzewo czyste.
- Raport audytu: `docs/audits/AUDYT_PR91_2026-09-01.md`.
- Plan sesji: `docs/plans/PLAN_2026-09-01-audyt-pr91-i-petla-jakosci.md`.

## Co zrobiono w tym etapie

**Etap 1 — audyt PR #91** (`4e18fed..3c23e03`, 87 plików): pełne czytanie
diffa, doczytanie ADR 0025–0027, 5 mutacji RED→GREEN, potwierdzenie kontraktów
widoku (ADR 0017) i fingerprintu (ADR 0005). **Zero znalezisk regułowych.**

**Etap 2 — pętla jakości:**

1. **Analizator rodzin jako narzędzie stałe** — `tools/family-audit.mjs` (nowy)
   + `test/family-audit.test.js`. Generalizuje ad hoc `/tmp/fam*.mjs`
   (M274/M276/M277): dwa wymiary skanu (rodziny efektów damage/untap/mill/
   destroy + rodziny pól życie/trucizna), jawna lista wyjątków
   `FAMILY_EXCEPTIONS` z uzasadnieniem (ADR 0027 pkt 3). Weryfikacja mutacyjna
   RED→GREEN. Rozszerzanie: dopisz kolejną rodzinę do `EFFECT_FAMILIES` /
   `FIELD_FAMILIES` (L113: zasięg skanu = zasięg klasy, nie pliku).
2. **Żywy Tester** — 16 partii na taliach spoza `BENCH_DECKS` (pula rzadziej
   audytowana, priorytet 2 z TESTER_STOLU.md), profile greedy/random/defensive/
   explorer/impatient/hoarder. Dwa znaleziska [ui] (oba naprawione u root cause,
   testem RED→GREEN, transkrypty w `tmp-audyt-pr91/` — poza repo):
   - `resolve_escape_exile` → „Wybierz: Wariant (10 opcji)" (klasa L102/1);
   - `resolve_look_top_choice` → „Wybierz: Wariant (4 opcje)" (ta sama klasa).

## Gdzie szukać dalej

1. **Dalsze partii Żywego Testera** — 16 partii pokryło 12 par talii i
   6 profili, ale detektor `detectGenericChoiceTitle` wciąż może trafić na
   kolejne komendy `resolve_*` bez deskryptora w
   `CHOICE_GROUP_COMMAND_DESCRIPTORS`. Szybki triaż: dla każdego
   `choiceRequestGroupKey` zwracającego stałą klucza (render.js:329+) sprawdź,
   czy typ ma gałąź w `choiceSourceTitle` ALBO wpis w jednej z dwóch map
   deskryptorów — to dokładnie klasa L102/1, którą te dwa znaleziska potwierdziły.
2. **Rozszerzenie `tools/family-audit.mjs`** o kolejne rodziny (counter — choke
   point `addCounter`; sacrifice/bounce/exile — choke point
   `moveObjectDirectly`). Uwaga na wyjątki: `tapObject` dla CUDZYCH permanentów
   to dług udokumentowany (M277) — NIE dodawać rodziny tap, dopóki nie ma
   efektu zastępującego tapowanie.
3. **`tapObject` bez odpowiednika dla cudzych permanentów** — nadal dług,
   nie naprawiać na zapas (jak w M277).

## Pułapki (aktualne)

- `edit_file` psuje polskie znaki → pliki z polską treścią pisz `python3`.
- Mutacje: wersja bazowa z `git show HEAD:<plik>`, nie lokalna kopia (L34).
- Żywy Tester mierzy `dist/` — `npm run build` przed każdą partią (L76).
  Katalog `tools/table-tester/node_modules` i `tmp-audyt-*/` są poza repo
  (`.gitignore`).
- Przed każdym pushem: `git log --oneline -3`, `git fetch origin` + porównanie
  `HEAD..FETCH_HEAD` / `FETCH_HEAD..HEAD`; force push zakazany (ADR 0020 D).
- Budżet lektury startowej na styk: nowy wpis → najpierw sprawdź, czy nie
  należy do istniejącej klasy (L66).
- Kontrakty widoku (ADR 0017) i odcisk stanu (ADR 0005) są domknięte — każde
  nowe pole w `playerView`/`stateFingerprint` musi je respektować.
