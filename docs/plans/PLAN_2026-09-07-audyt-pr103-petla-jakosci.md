# PLAN 2026-09-07 — audyt PR #103 i pętla jakości

Sesja: `arena/01a07b98-mtg`, jeden PR do `main` (ADR 0013/0020).
Baza potwierdzona zdalnie: `c9b884c` (scalony PR #103), poprzedni stan:
`dfbc39f` (PR #102). Drzewo na starcie czyste. Lektura: cały `AGENTS.md`,
rejestr i wszystkie 28 aktualnych ADR-ów, cały `LESSONS.md` (2298 linii),
`ENVIRONMENT.md`, PR #103 i `HANDOFF_2026-09-07c.md`.

## Rozpoznanie i zakres

Prompt „kontynuujemy projekt” uruchamia ADR 0021: audyt → niedokończony plan
→ pętla jakości, bez pytania o kolejkę. Najnowszy plan na `main`
(`PLAN_2026-09-06c-audyt-pr102-petla-jakosci.md`) ma etapy zamknięte;
kontynuacje M333–M338 są opisane w ostatnim handoffie. PR #103 zmienił
59 plików: zakrywanie/odsłanianie, wyceny bota (ward, manifest, proliferate),
oferty przy decyzjach, prezentację i kreator many, narzędzia, testy,
dokumentację oraz raport pełnego B0.

Oczekiwany punkt odniesienia z handoffu: rdzeń 4636/4636, benchmark-regresja
10/10, build 59 modułów / 3369,6 kB. Pomiar bazowy potwierdził te wartości: rdzeń 4636/4636 (126 s),
build 59 modułów / 3369,6 kB; test benchmarku jeszcze przed nami. README zawiera starsze liczby;
liczby końcowe będą pochodziły z nowego pomiaru, nie z opisu poprzedniego PR.

**Poza zakresem:** nowe karty/talie kolekcji (ADR 0029), nowe ograniczenia
Oracle, strojenie wag bez dowodu, migracja nazw protokołu, pełny benchmark
B0 bez nowego polecenia właściciela. Wynik pełnego B0 z 07.09 jest danymi
do weryfikacji, nie poleceniem ponownego liczenia.

## Mini-roadmapa i kolejność commitów

- [x] **E0 — osobny commit planu i PR przed kodowaniem.** Potwierdzenie
  `npm test` + `npm run build`, push wyłącznie na gałąź sesji, otwarcie PR
  według szablonu. Sprawdzenie `HEAD` i zdalnej historii przed pushem.
- [x] **E1 — pełny audyt PR #103 przed implementacją.** Porównanie
  `dfbc39f..c9b884c` plik po pliku, nie streszczenie opisu PR. Sprawdzić
  semantykę reguł/Oracle, FoW, determinizm, generyczność i wszystkie tory
  użycia nowych pól. Testy skonfrontować ze stanem sprzed zmian oraz
  mutacjami poszczególnych gałęzi; odróżnić lukę testu od błędu reguł.
  Raport `docs/audits/AUDYT_PR103_2026-09-07.md` zawiera inwentarz wszystkich
  plików, dowody ustaleń, także tropy obalone. Artefakty benchmarku:
  sprawdzenie konfiguracji, sum i raportowania bez uruchamiania macierzy.
  Osobny zielony commit raportu + aktualizacja opisu PR.
- [ ] **E2 — naprawy potwierdzonych usterek, osobno per przyczyna.** Najpierw
  repro przez prawdziwy kontrakt (`execute`/`playerView` lub DOM artefaktu),
  potem chirurgiczna poprawka + RED→GREEN + kontrola anty-over-fix.
  Przy każdej: kontrola składni/diffu, cały `npm test`, `npm run build`,
  osobny commit i natychmiastowy push; raport/plan aktualizowany przyrostowo.
  Golden-master tylko przy zmierzonej i przypisanej zmianie śladu.
- [ ] **E3 — pętla jakości innymi ścieżkami.** Co najmniej trzy ukończone
  partie Żywego Testera ze świeżego artefaktu, preferowane talie spoza
  szybkiej próbki i inne pary/profile niż w #103. Ręczny przegląd transkryptu
  w trzech osiach: decyzje bota, log/modal, auto-pass. Zgłoszenia sprawdzić
  wobec stanu/DOM; każda nowa potwierdzona klasa dostaje detektor i dowód
  A/B. Usterki testera naprawiać, nie omijać. Celowane stany regułowe
  uzupełniają partie, szczególnie dla nowych bramek decyzji i kosztów.
- [ ] **E4 — brama PR i przekazanie stanu.** `npm run test:all` + build,
  szybki benchmark przy zmianie bota/ofert (raport z konfiguracją),
  `tools/family-audit.mjs`; żadnego `--full`. Uaktualnienie audytu, planu,
  `PROJECT_HISTORY.md`, README i nowego handoffu według pomiarów.
  Czyste drzewo, zgodność HEAD ze zdalną gałęzią, kumulacyjny opis PR
  i faktyczny stan CI. Scalanie zostaje decyzją właściciela.

## Ryzyka i sposób kontroli

- **Budżet lektury niemal pełny (99 946/100 000).** Nowa lekcja wymaga
  uprzedniej kondensacji istniejącej prozy do `LESSONS_PRZYPADKI.md`;
  nie ruszać numerów ani limitu. Pomiar `dokumentacja-budzet-lektury`.
- **Zielony pin źródła ≠ poprawna reguła.** Warunki dot. priorytetu,
  ukrycia cech, kosztów i liczników badać na skutku, z przyjętą komendą;
  kompletność źródła jest drugim, a nie jedynym zabezpieczeniem.
- **Narzędzie korzysta z `dist/`, nie `src/`.** Po zmianach build; jsdom
  instalowany wyłącznie w `tools/table-tester`. Transkrypty/logi gitignorowane.
- **Mutacje nie mogą skasować pracy.** Kopia pliku przed mutacją i odtworzenie
  kopią w `finally`, nie `git checkout`/`restore`; po wszystkim diff i test.
- **Kontrola wzrostu zakresu.** Backlog nie jest kolejką. Nie dopisuję kart
  jako nośników mechaniki; testy używają obiektów syntetycznych.

## Wykonanie

E0: pomiar na czystej bazie zakończony: `npm test` 4636/4636,
`npm run build` 59 modułów / 3369,6 kB. Ten commit publikuje plan;
PR zostanie otwarty z niego przed jakąkolwiek zmianą kodu.


E1: PR #104 otwarty z planu `d389d15`. Audyt 59/59 plików zakończony;
raport `docs/audits/AUDYT_PR103_2026-09-07.md`: F1 (przeciek numeracji),
F2 (manifest/morph), F3 (proliferate i kolejność), F4 (nieistniejący bonus
ETB), F5 (SBA w środku czaru), F6 (próżny strażnik bramki manifestu),
F7 (HTTP 429 kasuje rulingi). 19 prób mutacyjnych; 17 złych wariantów
zatrzymanych, 1 przeoczony przez C i 1 poprawka odrzucona przez błędny test.
Każdy F będzie osobnym zielonym przyrostem (E2). Baseline bot: 10/10.

E2/M339: F1 naprawione u producenta numeru — numeracja jawnych wejść na
całym stole, bez cardId/kontrolera. 4 RED→GREEN, test różnicowy całego FoW,
etykiety i ciągłość po obrocie/przejęciu; rodzina 20/20. Bramka pełna przed
commitem; pozostałe ustalenia realizowane oddzielnie.
