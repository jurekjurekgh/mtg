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

- [x] Plan + push (ce72e06).
- [x] A: widok ręki z `adventure` (L1); etykieta {1}{B}; cast_adventure
      w gałęzi wyceny czarów + self-mill (wyścig bibliotek + synergia
      grobu po minCreatureCardsInGraveyard). Testy A1–A3.
- [x] B: TOKEN_IMAGES (druki Scryfall dla token_*) + Squirrel (TMSH 14,
      z API — L26); session.cardDetails z fallbackiem. Test B1. Kolejne
      tokeny uzupełniamy tą samą mapą wg zgłoszeń.
- [x] C: widok + badge dla saddled / untap-lock / dontUntapNext /
      kontroli do EOT / „bez regeneracji". Pułapka: untapLockedBy to
      domyślnie PUSTA tablica (truthy) — warunek na length. Testy C1/C2.
- [x] D: add_counter w ścieżce activate_ability — liczniki zasobowe
      tylko pod konsumenta (cost.removeCounter), zapas < potrzeb,
      po walce; testy D1–D3 (anty-spam/anty-over-fix/upkeep).
- [x] E: granty „until EOT" per okno walki — reach przy obronie przed
      atakiem z flying; deathtouch/first strike/lifelink po deklaracjach
      w starciu; evasion przy własnym ataku. Testy E1–E3.
- [x] Zamknięcie: test:all 2625/2625, build 52 moduły / 2234.3 kB,
      bot-benchmark 9/9.

## Ryzyka

- D zmienia zachowanie bota — `node --test test/bot-benchmark.test.js`
  obowiązkowy; anty-over-fix (L28) — bot nie może przestać używać
  liczników statystycznych ani station.
- B: adresy grafik wyłącznie z plików/druków Scryfall (bez zgadywania
  UUID — L26).

## Podsumowanie wykonania

A–E wdrożone w dc66238 (plan ce72e06); testy
`test/m173-uwagi-wlasciciela.test.js` (12). Odpowiedź na pytanie A:
Adventure JEST w silniku (cast_adventure → efekty czaru → exile →
cast_adventure_creature za koszt karty; testy batch11) — brakowało
deskryptora w widoku ręki (pusta etykieta kosztu) i wyceny u bota.
Incident: reset workspace w trakcie (5. w projekcie) — odzyskanie wg
ENVIRONMENT §2 (commit-snapshot d016352 → checkout drzewa na FETCH_HEAD).
Stan: `test:all` **2625/2625**, build **52 moduły / 2234.3 kB**,
benchmark bota 9/9.
