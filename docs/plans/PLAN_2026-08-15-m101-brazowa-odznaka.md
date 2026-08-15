# M101 — Brązowa odznaka „wyłapywacza błędów": 10 unikalnych błędów vs zasady MtG

Zlecenie właściciela (2026-08-15, po merge PR #53): przejrzeć istniejące karty
i mechaniki, znaleźć i naprawić **10 unikalnych błędów/uproszczeń niezgodnych
z zasadami MtG**, których nie wyłapały poprzednie sesje.

Metoda (jak M83/M84/M95): objaw → repro (skrypt/test RED) → root cause →
naprawa → test GREEN → weryfikacja `npm test` + build. Bez maskowania objawów
(AGENTS.md, „Nienegocjowalne granice"), bez warunków po nazwie karty (ADR 0002).

## E0 — audyt PR #53 (obowiązkowy, AGENTS.md + ADR 0016)

- Zakres PR #53 (M100): 58 plików, engine tknięty chirurgicznie
  (`combat.buildDamageAssignmentView` viewerId, `tokens` efektywne P/T,
  `game-state` cardIds decyzji + bramka mulliganu, `heuristic-bot` próg
  re-equipu, 3 karty: podtypy wg Oracle).
- Werdykt wstępny: zmiany zgodne z CR 708.2/613.3/103.4; testy adytywne;
  brak batcha kart. Uwaga do zbadania w E-etapach: bramka `>= 7` mulliganów
  (CR 103.4 — londyński mulligan nie ma sztywnego limitu 7, ale przy pustej
  bibliotece/ręce sensowny jest warunek na FAKTYCZNY brak kart).
- Baseline potwierdzony lokalnie: `npm test` **1738/0**, build 50 modułów /
  **1668.0 kB**.

## Znaleziska (numeracja B1..B10, uzupełniana w trakcie)

| # | Obszar | Objaw | CR | Status |
|---|---|---|---|---|
| B1 | equip | Equip aktywowalny w instant speed (także w turze przeciwnika, w combacie) mimo „Equip only as a sorcery" na WSZYSTKICH 5 sprzętach katalogu | 702.6d | znaleziony |
| B2 | buffy „do końca tury" | `buff_creatures_you_control` / `buff_opponents_creatures` traktowane jako efekt ciągły — stwory wchodzące PO rozstrzygnięciu dostają buff; CR mówi, że zbiór obiektów zamraża się przy rozstrzygnięciu | 611.2c | znaleziony |
| B3 | stun counters | Krok odkręcania (`untapControlled`) ignoruje liczniki stun — odkręca permanent i NIE zdejmuje licznika (Lodestone Needle bez efektu w realnej grze) | 122.1b | znaleziony |
| B4 | morph/face-down | Zakryty permanent zachowuje kolory, podtypy, koszt many i nazwę karty (cloak je czyści) — face-down ma być bezbarwnym, bezimiennym 2/2 bez podtypów i o koszcie 0 | 708.2 | znaleziony |

(kolejne uzupełniane w trakcie sesji)

## Etapy

- **E0** — audyt PR #53 + baseline (testy/build) — ZROBIONE.
- **E1** — plan w repo (ten plik), commit + push.
- **E2..E11** — po jednym błędzie: test RED → fix → GREEN, commit każdy
  samodzielnie zielony (`npm test` + `npm run build`).
- **EB** — pełne B0 (50 seedów) w tle; jeśli bot ruszony funkcjonalnie —
  obowiązkowy `test/bot-benchmark.test.js` (7 testów).
- **EZ** — Żywy Tester w OBU trybach (`--quiet` i `--snapshot-every 1`, L13)
  na zmienionych mechanikach; aktualizacja PROJECT_STATE + handoff + LESSONS.

## Ryzyka / pułapki

- Zmiany w equipie i buffach ruszają bota → benchmark obowiązkowy.
- `npm run build` przed każdym uruchomieniem Żywego Testera (tester gra na dist/).
- Testy istniejące mogą kodować BŁĘDNE zachowanie (np. `engine-gold-badge`
  test 3 zakłada ciągłość buffów) — poprawka wymaga zmiany takiego testu
  wraz z uzasadnieniem CR w komentarzu, nie „naprawy" produkcji pod test.
