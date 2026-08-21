# PLAN 2026-08-21 — M173: uwagi właściciela (Gray Slaad, token art, badge, Rustvine)

- **Sesja:** `arena/01a02534-mtg`, PR #69 (kontynuacja po M172).

## Rozpoznanie (root cause)

- **A (Gray Slaad — Adventure):** mechanika JEST zaimplementowana
  (cast_adventure → mill 4 → exile → cast_adventure_creature za koszt
  karty; testy batch11). Trzy realne braki: (1) widok RĘKI nie niesie
  deskryptora `adventure` (klasa L1/ADR 0017) → etykieta „Przygoda: …
  (koszt )" bez kosztu; (2) etykieta buduje koszt jako `{cost}{pipy}` =
  {2}{B} zamiast {1}{B} (generic = cost − pipy); (3) bot nie wycenia
  `mill_cards` bez celu w ścieżce czarów → Przygoda nigdy nie wygrywa
  remisów (klasa L50).
- **B (grafika tokena Squirrel):** kafle tokenów biorą ilustracje z
  rejestru po cardId — `token_*` nie istnieje w rejestrze, więc ŻADEN
  token nie ma druku Scryfalla. Fix: mapa `TOKEN_IMAGES` (cardId tokenu →
  druk Scryfall) + fallback w cardInfo/fullscreen; wypełniamy Squirrel
  (zgłoszony) + najczęstsze tokeny osiągalne w taliach.
- **C (badge czasowych efektów):** Panic Spellbomb (cantBlock) NAPRAWIONY
  już w M172/B2 (widok nie niósł pola). Audyt pozostałych czasowych
  flag ustawianych przez efekty: `saddled`, `untapLockedBy`,
  `dontUntapNextUntapStep`, `tempControlUntilTurn`,
  `cantBeRegeneratedThisTurn` (lista w stanie) — ŻADNA nie jest w widoku
  ani na nakładce kafla. Fix: pola w projekcji battlefield + badge'e.
- **D (Rustvine Cultivator):** `add_counter` nie ma wyceny w ścieżce
  `activate_ability` (jest tylko w cast_spell) → remis wariantów, bot
  tapuje się co turę na oil (nawet w upkeepie), nigdy nie konsumuje.
  Fix generyczny: licznik NIE-statystyczny na sobie ma wartość tylko,
  gdy INNA zdolność źródła go konsumuje (cost.removeCounter) i zapas
  nie przekracza potrzeb; koszt {T} stwora zdolnego do walki liczy się
  jako strata poza postcombat main.

- **E (Death-Hood Cobra, dopisane w trakcie):** bot aktywował grant
  „reach until EOT" zaraz po wystawieniu (mana w cleanup). Reguła
  właściciela: reach = obrona przed zadeklarowanym atakiem z flying;
  deathtouch/first strike itp. = trick starcia PO deklaracjach
  (atakuje/blokuje) — wycena grantów zawężona do właściwych okien.

## Etapy

- [ ] Plan + push (ADR 0020).
- [ ] A: widok ręki z `adventure`; etykieta {1}{B}; wycena mill_cards
      (wyścig bibliotek + synergia grobu po deskryptorach); testy.
- [ ] B: TOKEN_IMAGES + Squirrel (+ dostępne tokeny talii); testy.
- [ ] C: pola widoku + badge'e (saddled/untap-lock/temp-control/
      no-regeneration); testy RED→GREEN.
- [ ] D: wycena add_counter w activate_ability (konsument/zapas/timing);
      test anty-spam + anty-over-fix (produkcja gdy zapas pusty i jest
      konsument); benchmark regresji.
- [ ] E: wycena grant_keywords_until_end_of_turn per okno walki
      (reach/trick starcia/evasion); testy RED→GREEN.
- [ ] Zamknięcie: test:all + build + dokumentacja + opis PR.

## Ryzyka

- D zmienia zachowanie bota — `node --test test/bot-benchmark.test.js`
  obowiązkowy; anty-over-fix (L28) — bot nie może przestać używać
  liczników statystycznych ani station.
- B: adresy grafik wyłącznie z plików/druków Scryfall (bez zgadywania
  UUID — L26).

## Podsumowanie wykonania

(uzupełniane na końcu zadania)
