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
| B4 | morph/face-down | Zakryty permanent zachowuje kolory, podtypy, koszt many i nazwę karty (cloak je czyści) — face-down ma być bezbarwnym, bezimiennym 2/2 bez podtypów i o koszcie 0 | 708.2 | ZAMKNIĘTY `f0c7078` |
| B5 | choroba przywołania | Stwór, który przeszedł untap step zatapniętny pod blokadą odkręcania (stun, untap-lock), zostawał chory na przywołanie NA ZAWSZE — nie mógł atakować ani użyć {T} wiele tur później | 302.6 | ZAMKNIĘTY `0ca85a5` |
| B6 | trample | Atakujący z tramplem mógł przydzielić blokerom 0 obrażeń i wpakować całą moc w gracza — blok nie chronił przed niczym | 702.19b | ZAMKNIĘTY `9b8737c` + UI `51b0f41` |

### Zgłoszenia właściciela (priorytet nad wyszukiwaniem własnym)

| # | Obszar | Objaw | CR | Status |
|---|---|---|---|---|
| A | krok dobierania | Dobranie karty wystawione jako opcjonalna komenda „Dobierz kartę" — dawało się je POMINĄĆ passem | 504.1 | ZAMKNIĘTY `ed6ee77` |
| B | Furious Forebear | Dwie identycznie opisane opcje „Dobrowolna dopłata" — gracz nie wiedział, co wybiera | — (UX) | ZAMKNIĘTY `7cf7d54` |
| C | odmiana 2. osoby | „Ty dobiera: …" zamiast „Dobierasz: …" — 124 opisy w 3. osobie | — (UX) | ZAMKNIĘTY `25fcb16` |
| D | panel „Rozgrywka" | Panel gubił kluczowe zdarzenia tury przeciwnika (triggery, zmiany kontroli) | — (UX) | ZAMKNIĘTY `25fcb16` |

**Wynik: 10/10 błędów znalezionych, naprawionych u root cause i pokrytych testami RED→GREEN.**

### Tropy sprawdzone i ODRZUCONE (bez błędu)

- **Crew / saddle** (zgłoszenie właściciela do weryfikacji): sprawdzone 9
  aspektów — crew jest instant-speed (CR 701.36, brak „only as a sorcery"
  w Oracle), saddle sorcery-speed (CR 702.171a) i odrzucane w turze
  przeciwnika także przez `execute`, obie zdolności idą NA STOS (CR 602.2a),
  chore stwory MOGĄ zasilać (crew/saddle nie używa symbolu {T}), Mount nie
  osiodła sam siebie („other creatures"), pojazd zachowuje typ Artifact po
  animacji, `saddled` i animacja gasną w cleanup, trigger „attacks while
  saddled" nie odpala w kolejnej turze. **Wszystko zgodne z CR — brak błędu.**
- Utrata typu `Artifact` przez pojazd okazała się artefaktem skryptu repro
  (`gameObjectDataOf` nie zwraca `types`; prawdziwa ścieżka to `createCardDeck`).

## Etapy

- **E0** — audyt PR #53 + baseline (testy/build) — ZROBIONE.
- **E1** — plan w repo (ten plik), commit + push — ZROBIONE.
- **E2..E11** — po jednym błędzie: test RED → fix → GREEN, commit każdy
  samodzielnie zielony (`npm test` + `npm run build`) — ZROBIONE (10/10).
- **EB** — pełne B0 (50 seedów) w tle; jeśli bot ruszony funkcjonalnie —
  obowiązkowy `test/bot-benchmark.test.js` (7 testów) — ZROBIONE
  (7/7 GREEN po zmianie combatu; pełny przebieg w `tools/b1-final-2026-08-15.*`).
- **EZ** — Żywy Tester w OBU trybach — ZROBIONE: greedy (azorius-red, seed 77)
  i impatient (green-wiedzmin, seed 123), 0 zgłoszeń detektorów. Tester wyłapał
  pętlę klikania w wizardzie trample → poprawka UI `51b0f41`.

## Wynik końcowy

- `npm test` **1779/0** (start sesji: 1738/0 — +41 testów).
- build 50 modułów / **1684.1 kB**.
- 7 commitów naprawczych, wszystkie na `arena/01a006d3-mtg`, PR #54.

## Ryzyka / pułapki

- Zmiany w equipie i buffach ruszają bota → benchmark obowiązkowy.
- `npm run build` przed każdym uruchomieniem Żywego Testera (tester gra na dist/).
- Testy istniejące mogą kodować BŁĘDNE zachowanie (np. `engine-gold-badge`
  test 3 zakłada ciągłość buffów) — poprawka wymaga zmiany takiego testu
  wraz z uzasadnieniem CR w komentarzu, nie „naprawy" produkcji pod test.
