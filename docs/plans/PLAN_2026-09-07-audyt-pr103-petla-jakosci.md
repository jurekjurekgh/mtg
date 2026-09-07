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
- [x] **E2 — naprawy potwierdzonych usterek, osobno per przyczyna.** Najpierw
  repro przez prawdziwy kontrakt (`execute`/`playerView` lub DOM artefaktu),
  potem chirurgiczna poprawka + RED→GREEN + kontrola anty-over-fix.
  Przy każdej: kontrola składni/diffu, cały `npm test`, `npm run build`,
  osobny commit i natychmiastowy push; raport/plan aktualizowany przyrostowo.
  Golden-master tylko przy zmierzonej i przypisanej zmianie śladu.
- [x] **E3 — pętla jakości innymi ścieżkami.** Co najmniej trzy ukończone
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

E2/M340: F2 — provider `faceDownAbilities` podłączony także w manifeście.
7 testów przez execute (6 RED + 1 kontrola → 7 GREEN), rodzina 28/28.
Poprzedni przyrost M339 wypchnięty jako `5d81996` po 4640/4640 + build.

E2/M341: F3 — premia za wygraną po przejrzeniu wszystkich ID. Cztery
mutacyjne RED + dwie kontrole → 6/6; wraz z m336 i golden-masterem 18/18,
bez zmiany fixture/progów. M340 wypchnięte jako `3a12df7` po 4647/4647 + build.

E2/M342: F4 — usunięcie nieistniejącej premii ETB, korekta błędnej przesłanki
m334/C. 3 RED→GREEN; rodzina z golden-masterem 16/16, bez regeneracji.
M341 wypchnięte `3844ffb` po 4653/4653 + build.
E3/rozpoznanie: trzy partie 10401–10403 zakończone (74/61/78 kroków, 0 flag),
ale ręczny odczyt ujawnił F8: stary ogon logu i zła kolejność odrzuceń w
samym testerze. Naprawa ekstraktora + powtórka A/B po E2; zakres dopisany
przed implementacją narzędzia, nie nowa mechanika produktu.

E2/M343: F5 — jedna bramka SBA dla rdzenia i usuwania tokenów; obowiązuje
przez całe `pendingSpell`, także pusty ogon. 5 RED→GREEN, 3 mutacje osobnych
torów i pustego ogona; rodzina + fixture 21/21, bez zapisu fixture.
M342 wypchnięte `437cf27` po 4656/4656 + build.

E2/M344: F6 — naprawiony sam strażnik m337/C: realny manifest, własne/cudze
scry, zakaz i powrót obrotu. Mutacja bramki daje teraz RED w C (dawniej GREEN),
cały plik 6/6. M343 wypchnięty `a659024` po 4661/4661 + build;
quick 672 mecze: 570/672 = 84,8%, zero dryfu, bez zmiany progów/fixture.

E2/M345: F7 — 429 i błędna odpowiedź nie nadpisują rulingów, pierwsza pusta
lista ma proweniencję. 3 RED + 5 kontroli → 8 GREEN, 3 mutacje ubite,
z m328 12/12. Snapshoty kolekcji nietknięte, żadnej sieci w testach.
M344 wypchnięty `af0226f` po 4662/4662 + build. Kod E2 gotowy, ale M345 czeka na commit/push (blokada autoryzacji poniżej).
F8/narzędzie pozostaje w E3, potem końcowe bramki i dokumenty E4.


## Blokada publikacji — 2026-09-07

Przed commitem M345 `gh pr view 104 --json state` zwrócił **HTTP 401:
Bad credentials**. Sprawdzenie było pierwsze w sekwencji `set -e`, więc
NIE wykonano ani commita M345, ani pusha, ani zmiany opisu PR. Właściciel
poproszony o ponowne połączenie GitHub w Arena; żadnych próśb o tokeny.
Ostatni potwierdzony push: `af0226f` (M344). Kod M345 + testy i dokumentacja
zostają w drzewie roboczym, bramka **4670/4670 + build 59 / 3369,7 kB**.
Nie zaczęto implementacji F8 przed opublikowaniem niezależnego przyrostu M345.
Punkt wznowienia: `docs/setup/HANDOFF_2026-09-07d.md`.


**Wznowienie po odświeżeniu GitHub (2026-09-07):** połączenie działa,
PR #104 nadal OPEN/draft, gałąź zdalna i lokalna zgodne (`af0226f`, 0/0),
main nadal `c9b884c`. Brudne drzewo M345 zachowane bez resetu. Ponowna
bramka fast + build przed osobnym commitem/pushem M345; potem F8 i E4.


E2 zakończone: M345 wypchnięte `0f294d8`, ponownie 4670/4670 + build.
E3/M346: F8 naprawione; 9/9 testów, 4 mutacje, rodzina 116/116.
Żywe A/B: s10401 po 14 flag starego ogona w OBU trybach → 0 po poprawce;
quiet 74 kroki, verbose 73 przed i po. Dodatkowo s10402/s10403 ukończone,
0 flag. F9 z verbose do kolejnego przyrostu: fałszywy „pusty koszt” dla
znacznika wygnania stwora jako kosztu dodatkowego. Naprawić sam detektor,
sprawdzić dwie strefy i prawdziwe puste ceny/dopłaty oraz źródło danych
panelu niezależne od --quiet, potem powtórzyć grę (szczegóły w audycie).


E3/M347: F9 — znacznik dodatkowego kosztu wygnania nie jest pustą kwotą;
nie ma zmian etykiet produktu. 6 testów (4 RED→GREEN + 2 kontrole), cztery
mutacje; rodzina 125/125. Pełne etykiety panelu z rekordów okien także pod
--quiet. W toku końcowe cztery przebiegi testera i pełna bramka przed pushem.
M346 wypchnięte `528e76e` po 4679/4679 + build.

E3: M347 powtórki czterech przebiegów ukończone, 0 flag. Stderr impatienta
ujawnił F10: `session.log` jest tablicą, a `play` woła ją jak funkcję przy
zmianie otwartego kreatora many. Kolejny samodzielny przyrost M348 (przed
E4): interfejs wpisu systemowego + prawidłowa kontynuacja play, strażnik
na realnej sesji; przechwytywanie runtime errors w testerze od beforeParse
+ detektor niezależny od profilu/logowania, testy i żywe A/B. To naprawa
konkretnego wyjątku UI, nie strojenie heurystyki bota.


E3/M348: F10 — logSystem przez istniejący zapis sesji, log nadal tablicą,
play nie gubi nowej komendy. 4 testy UI i 6 runtime (transport od beforeParse
do detektorów), 6 mutacji, rodzina 50/50. Stary artefakt s10403: 6 wyjątków
w obu trybach, mimo ukończenia partii. Nowy build 59 / 3369,8 kB, powtórki
PO i bramka w toku. M347 wypchnięte `2976a45` po 4685/4685 + build.


E3 domknięte M348: s10403 quiet/verbose po 6 wyjątków PRZED → 0 PO,
wszystkie flagi PO 0, 126 okien, koniec 14/−5. Dwa inne profile na tym
samym nowym artefakcie również ukończone, 0 wyjątków / 0 flag. Zapisane
wyniki i granice dowodu w audycie; do zakończenia pozostaje wyłącznie E4.
