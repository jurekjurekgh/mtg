# Plan: Diamentowa odznaka — challenge 2 (15 błędów Testerem Gracza)

Sesja `arena/019ff280-mtg` (PR #44, przed mergem — właściciel zgłosił
wyzwanie na diamentową odznakę: 15 błędów znalezionych Testerem Gracza).

## Metoda

Rozegrać szeroki wachlarz partii żywym testerem stołu
(`tools/table-tester/run-game.mjs`) na prawdziwym artefakcie — różne talie ×
seedy, w tym dłuższe gry (dłużej niż wcześniejsze audyty), żeby trafić na
późniejsze fazy/komendy. Transkrypty przeskanować skryptem
`tools/table-tester/scan.mjs` (podejrzane etykiety: `?`, `undefined`, surowe
slugi, zła odmiana, dublowane informacje, `[STOP]`).

Każdy objaw → naprawa u root cause (AGENTS.md) → test regresyjny.

## Zakres

- tylko warstwa UI/log/etykiety (nie bot — ale każda zmiana bota/komend mierzona
  pełnym B0, progi 0.78/0.57).
- naprawy u root cause, bez maskowania.

## Kolejność commitów

1. plan (ten plik)
2. batch partii → lista błędów
3. fixy + testy
4. docs


## Wykonanie (2026-08-12)

- Rozegrano 20+ partii Testerem Gracza (różne talie/seedy, w tym mirror-match
  i dłuższe gry). Znaleziono i naprawiono **15 błędów** etykiet/logu u root
  cause (bez zmian bota) — szczegóły w PROJECT_STATE M78.
- Testy: **1405/1405** (+9 w `test/audit-diamond-challenge2.test.js`).
- Build: 50 modułów / ~1525 kB. Pełne B0 (2160 meczów): 0 crashy,
  heuristic 79.4% (progi 0.78/0.57).
- Weryfikacja Testerem: 0× surowe slugi efektów, 0× „Zasięg · Zasięg",
  0× „moc źródła/moc źródła", 0× „(koszt ?)", 0× „aura → Xaura",
  0× angielskie tryby, 0× „(exalted)", 0× „(koszt4U)".
