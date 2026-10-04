# Plan 2026-10-04h — naprawa CI po PR #154 i dokończenie batcha 63

Zlecenie właściciela: przejąć przerwany batch kart, naprawić czerwone CI po
scaleniu poprzedniej sesji oraz trwale zabronić zalewania Areny wyjściem pełnego
pakietu testów. Baza: `a362efa` (PR #154); gałąź tej sesji:
`arena/01a108d2-mtg`. Jedna sesja / gałąź / PR; bez merge i force push.

## Rozpoznanie

- Lektura wykonana w całości: AGENTS (374 linie), rejestr i wszystkie 29 aktywnych
  ADR-ów, LESSONS (2449 linii), ENVIRONMENT (189 linii). Punkt zaczepienia:
  PR #154 (79 plików), handoff `2026-10-04f`, plan `2026-10-04g-batch63`.
- Ostatni CI gałęzi poprzednika: run `37233594317`, błąd kroku testów. Log przez
  `gh run view --log-failed` niedostępny (EOF z hosta logów); adnotacje potwierdzają
  exit 1, nie podają asercji. Wymagana lokalna reprodukcja.
- Katalog ma 6/10 kart batcha: Urborg Uprising, Dig Site Inventory, News Helicopter,
  Natural Connection, Loxodon Mender, Subterranean Scout. Do wdrożenia:
  Bloodtithe Harvester (212VOW, Innistrad), Snarespinner (254DMU, Dominaria),
  Kozilek's Predator (2592XM, Zendikar), Etched Host Doombringer (260MOM, Kaldheim).
- Plik `scryfall-snarespinner.json.pending` wymieniony w planie nie został zachowany.
  Snapshoty brakujących kart i rulingi należy pobrać od nowa.
- Dodanie Snarespinner może zmienić partycję kolorów Dominarii (ADR 0024):
  najpierw pomiar generatora, potem jawna migracja aktywnych odwołań/testów.
  Nie zatrzymywać karty ani nie zamrażać generatora wyłącznie dla dawnych nazw.

## Etapy i kolejność commitów

1. [x] **Plan / PR / zasada wyjścia testów.** Osobny commit planu i PR przed
   kodowaniem. W AGENTS trwały zakaz surowego `run-tests.mjs all` i aliasów;
   przekierowanie stdout ORAZ stderr do ignorowanego logu, zachowany exit code,
   tylko ograniczony raport. Budżet lektury <=100k bez podnoszenia progu.
2. [x] **Audyt PR #154 i reprodukcja CI.** Przegląd wszystkich zmienionych plików,
   porównanie bazowego i końcowego kodu, CR/Oracle dla znaczenia regułowego,
   wyniki i status każdego obszaru w `docs/audits/AUDYT_PR154_2026-10-04.md`.
   Bazowe `npm test` + build, logi tylko w `.arena/`; brak wyniku != zielony.
3. [x] **Naprawy CI u przyczyny.** Każde znalezisko z dowodem RED→GREEN;
   nie aktualizować golden-mastera ani progów bez wyjaśnienia pierwszej różnicy.
   Po samodzielnym kroku szybki rdzeń + build, osobny commit i push.
4. [ ] **Brakujące karty / mechaniki.** Źródła Scryfall + rulingi + dosłowne CR
   (ADR 0030), piny legalności i interakcji przez execute. Mechaniki ogólne,
   pełny Oracle, wszystkie warstwy (transport, widok, bot, UI, log), żadnych
   warunków po nazwie karty. Przyrosty: Blood / Spawn; Snarespinner i talie;
   Etched Host Doombringer z obiema opcjami triggera. Dokładny podział zależy
   od weryfikacji źródeł, nie od pamięci.
5. [ ] **Integracja batcha.** Generator talii, proweniencja i zgodność snapshotów;
   migracja nazw talii jeżeli wymagana, README z rzeczywistymi licznościami;
   aktualizacja fixture'ów dopiero po pomiarze przyczyny dryfu.
6. [ ] **Brama i przekazanie.** Pełny `test:all` WYCISZONY na zamrożonym drzewie,
   build, szybki benchmark (bez `--full`), odczyt statusu CI PR. Aktualizacja
   planów, historii, milestone'u i handoffu z faktycznymi wynikami oraz
   kumulacyjnego opisu PR; wszystko wypchnięte na gałąź sesji.

## Ryzyka / kryteria jakości

- Baseline może być czerwony: nie opisywać pierwszego commita dokumentacyjnego
  jako zielonego; najpierw nazwać asercje i naprawić, bez pomijania testów.
- Talia zmienia trajektorie całych gier: sprawdzać rzeczywisty błąd reguł / starą
  fixture, nie przelosowywać seedów na ślepo. Historyczne dokumenty nie zmieniają
  nazw talii wstecz; aktywne narzędzia i testy muszą używać aktualnych danych.
- Nie maskować braków danych `return` ani `try/catch`; nie publikować częściowo
  działającej karty jako supported. Karty wyłącznie z odziedziczonej listy.
- Długie przebiegi: nie modyfikować drzewa od startu do końca; wynik przypisać
  do commita / jawnego diffu. Logi i sondy ignorowane, nigdy w Git.

## Podsumowanie wykonania

- `9532c20`: plan i PR #155 przed zmianami kodu.
- `9df45e0`: audyt 79 plików, reprodukcja **7846/7849** (3 FAIL), trwała
  zasada cichych testów. Budżet lektury **99 344/100 000** bez zmiany limitu.
  Tabela CR ze zweryfikowanego tekstu; snapshot po porównaniu pierwszych
  różnic starych/nowych talii. Scout ujawnił brak ponownego sprawdzenia
  deskryptora celu; poprawiono klasę triggerów, stały prefiks kontekstu i
  zachowanie przydzielonych kwot. Błędne oczekiwanie Forge Devil poprawione
  wobec CR, nie pod aktualny wynik.
- Brama `9df45e0`: fast **7584/7584** (121,3 s), snapshot **4/4**, build
  **70 modułów / 4832,9 kB**. Mutacja wyłączająca rewalidację: 3 FAIL
  (Scout, Greatsword, Forge Devil). Nie jest to jeszcze końcowe `test:all`.
- Drugi przyrost: F4/F5 naprawione z 8 pinami RED→GREEN, F6 z 9 pinami
  i mutacją 5 FAIL. Fast **7601/7601**, snapshot **4/4** bez dryfu, build
  **4833,1 kB**; po 6 ukończonych partii smoke każdego z 4 narzędzi.
- W toku: cztery karty, mechaniki, integracja i końcowa pełna brama.
