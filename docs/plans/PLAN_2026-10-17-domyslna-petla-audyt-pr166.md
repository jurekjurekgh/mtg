# PLAN 2026-10-17 — Sesja domyślna (ADR 0021): PR sesji, audyt PR #166, pętla jakości

## Zgłoszenie
Właściciel napisał „Kontynuujemy projekt.” bez tematu. Zgodnie z ADR 0021 (pętla
domyślna) sesja wykonuje kolejno: (1) PR sesji, (2) audyt poprzedniego scalonego PR
(#166, „Audyt PR #165 i pętla jakości”), (3) nieodhaczone etapy planów, (4) pętlę
jakości (Żywy Tester, polowanie na rozbieżności CR). Pytania do właściciela tylko
przy decyzjach blokujących (ADR 0021).

## Stan wyjściowy
- `main` = `24ff1a5` (squash PR #166, scalony 2026-10-15).
- Gałąź sesji `arena/4fcdc89b-mtg` istnieje lokalnie; na origin nie było jej przed sesją.
- Wzorzec wejścia: `docs/setup/HANDOFF_2026-10-15c.md` (README wskazuje przestarzały
  HANDOFF_2026-10-11 — do poprawy w commicie dokumentacji).
- Bramy bazowe (z planów PR #166, do potwierdzenia w etapie 0): `npm test` 8283/8283,
  `npm run build` rc=0 (74 moduły).

## Etapy
0. [x] Bazowe bramy: `npm test` (log `.arena/baseline-fast.log`) i `npm run build`
   (`.arena/build.log`). Czytamy tylko ogon i błędy (ENVIRONMENT §5a).
1. [x] Ten plan + PR sesji (ADR 0020 A): commit planu, `git push -u origin
   arena/4fcdc89b-mtg` (bez force), `gh pr create` do `main`.
2. [x] Audyt PR #166 → `docs/audits/AUDYT_PR166_2026-10-17.md` (ADR 0020 B).
   Zakres: 13 plików kodu `src/` i `tools/` (+463/−77 linii) oraz testy `test/uwaga-*`
   i `test/tester-2026-10-15c-*`. Opis audytu także w PR.
3. [x] Naprawa O-1 z audytu (jeśli potwierdzona): kreator w trybie `freeTargets`
   (Wrap in Flames, ponad limit 32 kandydatów) pozwala zaznaczyć więcej celów niż
   `maxTargets` i włącza „Zatwierdź”; silnik odrzuca komendę, ale kreator tego nie
   pokazuje. Test RED (O/11: 4 cele przy max 3 → zatwierdzenie wyłączone), potem GREEN.
   Silnik pozostaje autorytetem (ADR 0002); zmiana tylko po stronie kreatora.
4. [x] Odhaczenie zamkniętych etapów starych planów (PLAN_2026-10-16a, 15h, 15f, 15g,
   15c — pozycje domknięte już w scalonych PR) oraz pozycja z handoffu 15c: wording
   Clone Shell „na spód biblioteki” jest już w kodzie (`trasaRuchuStref`), L186 jest w
   LESSONS.md. Bez zmiany zachowania.
5. [ ] Pętla jakości (NIE wykonana w tej sesji — kolejny krok): kolejna partia Żywego Testera wyłącznie na już zbudowanych
   danych (bez nowych kart — ADR 0029) oraz szukanie rozbieżności CR w kodzie
   kreatora (zgodnie z ADR 0030: reguły tylko z pobranych źródeł CR).
6. [x] Aktualizacja opisu PR, `docs/PROJECT_HISTORY.md`, handoff `HANDOFF_2026-10-17.md` (opis PR — po wpisie tego commita).

## Ryzyka / pułapki
- Pełna `npm run test:all` jest jedyną bramą PR (ADR 0019); `npm test` to szybki rdzeń.
  Przed commitem kodu źródłowego uruchamiamy `npm test` i `npm run build`.
- Pełny benchmark (`--full`) tylko na wyraźne zlecenie właściciela (ADR 0018, 0025).
- Nie wolno dodawać kart „nośników mechanik” (ADR 0029) — testy używają syntetycznych kart.
- `.arena/` jest wykluczone lokalnie w `.git/info/exclude` (nie ma go w `.gitignore`).
- Historia gałęzi jest płytka (`git clone --depth`), więc `24ff1a5~1` nie istnieje;
  diff PR #166 pobieramy przez `gh pr diff 166`.
- Znane granice z PR #166 (świadomie odnotowane w kodzie, nie w tej sesji): limit 32
  ofert (>32 kandydatów może zniknąć z listy kreatora); granica 1v1 w
  `attackersAgainstPlayer` (D-1).

## Podsumowanie wykonania
- Commity: `6977d96` (plan), `334c799` (O-1: kreator nie zatwierdza ponad limit, RED→GREEN, test O/11),
  oraz commit dokumentacji (audyt, plany, README).
- Bramy: `npm test` 8293/8293 (baza) → 8294/8294 po O-1, rc=0; `npm run build` rc=0 (74 moduły);
  `tools/cr-numery.mjs` OK (5834 cytatów).
- Audyt: `docs/audits/AUDYT_PR166_2026-10-17.md` — O-1 naprawione; O-2 (ponad ~31 kandydatów
  znikają cele z kreatora) wymaga decyzji właściciela; O-3, O-4, O-5 otwarte/znane.
- Stare plany: odhaczono domknięte pozycje (16a, 15h, 15f, 15g, 15c 8–9). Pozostają otwarte
  tylko pozycje wymagające właściciela (odpowiedź w sprawie 16a/15h, weryfikacja 15f w żywej grze).
- README: wskaźnik handoffu zaktualizowany na 2026-10-15c.
- Pozostaje (kolejna sesja): krok 5 (pętla jakości — Żywy Tester i polowanie na rozbieżności CR);
  decyzja właściciela w sprawie O-2; pełna brama `npm run test:all` przed scaleniem PR #167.
- Nie wykonano: pełny benchmark (brak zlecenia właściciela).
