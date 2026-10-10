# Plan 2026-10-09b — audyt PR #160

## Cel i zakres

Wykonać obowiązkowy audyt ostatniego scalonego PR (#160) przed jakąkolwiek
nową pracą, zgodnie z ADR 0020 B, ADR 0016 i §0 `AGENTS.md`. Zlecenie
właściciela: lektura startowa, audyt z ewentualnymi naprawami, potem STOP
(bez pętli jakości, bez nowych zadań).

PR #160 = audyt PR #159 + autoryzowane naprawy R-1–R-5 (20 plików):
silnik (rozdział `cantBlockPrinted` / `cantBlockUntilCleanup`), strażniki
testowe (S9, katalog–snapshot, `plan`), dokumentacja/raporty. Bez nowych kart.

## Etapy i kryteria ukończenia

1. **Punkt zaczepienia i PR sesji** — potwierdzić, że PR #160 jest ostatnim
   scalonym PR; opublikować tę roadmapę i otworzyć PR bieżącej gałęzi przed
   dalszą pracą. Kryterium: PR z gałęzi `arena/56e512a4-mtg` do `main` istnieje.
2. **Przegląd zmian PR #160** — sprawdzić każdy z 20 zmienionych plików i
   istotne ścieżki wywołań; zweryfikować semantykę R-1 wobec CR 707.2/514.2/
   400.7, neutralność kartową (ADR 0002), transport pól (L21/L93/L101),
   kompletność widoku (ADR 0017) oraz czy testy naprawdę pinują deklarowane
   inwarianty (L13, mutacje). Kryterium: brak plików bez oceny; każda uwaga
   ma wskazany dowód lub repro.
3. **Bramki stanu bazowego** — uruchomić `npm test`, `npm run build`
   i dozwolony test regresji `node --test test/bot-benchmark.test.js`; bez
   `--full` i bez pełnego `test:all`. Kryterium: zapisane kody wyjścia
   i zwięzłe podsumowania na zamrożonym drzewie; logi w `.arena/` (§5a).
4. **Raport audytu** — utworzyć `docs/audits/AUDYT_PR160_2026-10-09.md`
   z wnioskami, dowodami, klasyfikacją ryzyk i wynikami bramek; zaktualizować
   opis PR bieżącej sesji. Kryterium: raport ocenia każdą zmianę, nie tylko
   powtarza metryki PR.
5. **Ewentualne naprawy** — tylko błędy znalezione audytem, każdy osobnym
   commitem z pinem RED→GREEN po wymaganych bramkach; nie łączyć z raportem.
6. **Zatrzymanie** — po raporcie (i naprawach) nie rozpoczynać pętli jakości
   ani innego zadania.

## Kolejność commitów

- Commit 1: niniejsza roadmapa; push i PR przed przeglądem zmian.
- Commit 2: raport audytu, po `npm test` i `npm run build`; push od razu.
- Ewentualny fix błędu ujawnionego audytem: osobny commit z testem RED→GREEN,
  po wymaganych bramkach; nie łączyć z raportem.

## Ryzyka i pułapki

- PR #160 zmienia semantykę kopiowania i cleanup: sprawdzić WSZYSTKIE ścieżki
  piszące/czytające `cantBlock` (grep po mutacji pola, L107), w tym
  `moveObjectDirectly` (CR 400.7, L166), materializację (L21/L93), widok
  (L101/ADR 0017) i pozostałe ścieżki kopiowania (offspring/embalm/tokeny).
- Piny mogą cementować błędne zachowanie (L181); sprawdzać ich kierunek wobec
  Oracle/CR i wykonania, mutacją w obie strony (L13/L159).
- Nie uruchamiać pełnego B0. Wyniki fast/build do ignorowanego `.arena/`
  (§5a); nie zalewać czatu pełnym wyjściem testów.
- Nie wykonywać zmian produktu ani kolejki domyślnej po zakończeniu audytu —
  użytkownik kazał się zatrzymać.

## Wykonanie

- [x] PR bieżącej sesji otwarty przed audytem: **#161**.
- [x] Wszystkie 20 plików PR #160 ocenione; dowody i rejestr przeglądu w raporcie.
- [x] Baseline: `npm test` 7923/7923, build 73/4963,2 kB, bot-benchmark 10/10;
      pre-fix (worktree eed5571): 7922/7922, 73/4961,9 kB, cr-numery 518/517/5628;
      post-fix: 7926/7926, 73/4963,7 kB, cr-numery 518/517/5633. Pełne B0/`test:all`
      nieuruchomione.
- [x] Raport `docs/audits/AUDYT_PR160_2026-10-09.md` zapisany; opis PR #161 uzupełniony.
- [x] Naprawy: Z-1 (CR 400.7, RED→GREEN) + O-1 (komentarz) — osobne commity.
- [x] Zatrzymanie po audycie i naprawach: brak pętli jakości.
