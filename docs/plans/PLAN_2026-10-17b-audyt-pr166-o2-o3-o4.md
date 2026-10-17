# PLAN 2026-10-17b — Audyt PR #166: O-2 (bez limitu celów), O-3 (powód na wyniku), O-4 (klasa „outlast”)

## Zlecenie właściciela (2026-10-17, po audycie)
- **O-2:** nie limitować celów. Najwyżej będzie długo się liczyć, ale nie ma być błędu.
  Dopuszczalne też zoptymalizowanie lub podział na etapy (wielokrokowy kreator: wybór
  po jednym stworze albo „nikt więcej”), jeśli da to dowolną liczbę celów. Przykład
  właściciela: 0 stworów → od razu „nikt więcej”; 3 stwory → trzy wybory po jednym i
  czwarty ekran „nikt więcej”.
- **O-3:** poprawić.
- **O-4:** przegląd katalogu i poprawka.
- Pętli jakości w tej rundzie nie robimy (właściciel ma inne zadanie).

## Stan wyjściowy
- Gałąź `arena/4fcdc89b-mtg` = `origin` na `14a578a` (PR #167 otwarty).
- Po resecie przestrzeni roboczej (ENVIRONMENT §2) lokalne commity odtworzono z `origin`;
  kopia niezcommitowanych zmian: `.arena/backup-after-reset.patch`.

## Etapy (każdy: RED → GREEN → `npm test` + `npm run build` → commit → push bez force)
1. [x] Plan (ten commit).
2. [x] **O-3** — `reject()` zwraca `reason` na wyniku. Test `test/audyt-pr166-o3-powod-odrzucenia-2026-10-17.test.js` (RED 2/2 → GREEN 2/2). Pełny `npm test` 8296/8296.
3. [x] **O-4** — przegląd katalogu: które zdolności pasują do klasy „outlast” (`onlySelfCounter`) bez licznika na sobie. Poprawka klasyfikacji po wskazanym celu licznika (ADR 0002), test RED na zdolności zbiorowej.
4. [x] **O-2** — usunięcie limitu ofert celów (`VARIABLE_TARGET_OPTION_CAP` na celach), usunięcie ścieżki `freeTargets` (przestaje być potrzebna, a łamie L48: oferta ≠ walidacja). Pomiar czasu `playerView` i decyzji bota dla 7/20/40/60/100 kandydatów. Jeśli czas jest nieakceptowalny, plan etapowy kreatora jako osobny krok po zgodzie właściciela.

## Ryzyka / granice
- Limit `X` (`for X ≤ min(maxX, cap)`) też używa tej stałej. To NIE jest limit celów; zostaje, osobno odnotowany.
- Usunięcie limitu zmienia testy strzegące kompromisu z PR #93 (`audyt-pr93-limit-wariantow-celi.test.js`). Są aktualizowane świadomie, z odwołaniem do zlecenia z 2026-10-17.
- Pełny benchmark nie jest częścią tej rundy (ADR 0018/0025).

## Podsumowanie wykonania
- `8f0e8bb` plan · `055fd03` O-3 (`reason` na wyniku) · `acf1643` O-4 (klasa outlast) · `106b49f` O-2 (bez limitu celów).
- Bramy po ostatnim commicie: `npm test` 8303/8303 rc=0; `npm run build` rc=0 (74 moduły); `cr-numery` OK.
- O-2: pomiar 7 / 40 / 100 stworów (64 / 10 701 / 166 751 ofert; bot 36 ms / 0,8 s / 21 s).
  Limit X i limity walki/Escape bez zmian (osobne mechanizmy).
- Błąd stosu przy 100 stworach znaleziony i naprawiony w tym samym commicie (push(...) → pętle).
- Korekta opisu commita 106b49f (RED nie był wykonany tak, jak napisano) — `docs/audits/AUDYT_PR166_2026-10-17.md` §6.
- Nie wykonano: `npm run test:all` (pełna brama PR, ADR 0019) — przed scaleniem PR #167.
