# PLAN 2026-08-08 — Czyszczenie luk: aktualizacja Jawnych Ograniczeń po T1–T6 i M46–M48

## Kontekst

Sesja 2026-08-07 (PR #32, commit a677806) domknęła największe luki engine:
- **T1** permanenty na stosie (CR 601/608), **T2** cele triggerów jako decyzje gracza, **T3** kolorowe pipy właściwą maną, **T4** mulligan londyński, **T5** regeneracja, **T6** triggery na stosie (CR 603.3) + fixy B0
- wcześniej **M46–M48 / T6–T10**: `resolve_search_choice`, `pay_or_sacrifice`, `optional_pay`, `moonlit`, lyre X, hexproof, summoning sickness+{T}, hand size, first-turn draw skip, anihilacja liczników, rozdział obrażeń, mana per step, tokeny, legend face-down, morph koszty

W `src/cards/card-data.js` wiele kart nadal niesie `support.limitations` opisujące **stare** zachowanie silnika (np. „trigger dies bez okna priorytetu”, „płatność automatyczna”, „you may deterministyczne”). Handout sesji (Handoff 2026-08-07, §M45 „Pozostałe świadome luki”) wymienia te same klasy luk jako kolejne tematy weryfikacji — część z nich została już naprawiona w kodzie, ale **opisy w rejestrze nie zostały posprzątane**.

Zadanie tej sesji: **audyt i wyczyszczenie `limitations`** — usunięcie przestarzałych wpisów, uściślenie pozostałych, bez zmiany mechanik. Każda karta `supported` ma mieć limitacje zgodne z rzeczywistym silnikiem.

## Rozpoznanie (przed planem)

- `grep -c limitations` → 140 kart, 73× `[]` (czyste), reszta z wpisami
- Trzy wpisy jednoznacznie przestarzałe po T1–T6/M46:
  1. `highland-game` — „trigger dies rozstrzyga się od razu, bez okna priorytetu” — **T6** przeniósł triggery na stos (wspólny stos, LIFO, intervening-if) → nieaktualne
  2. `rupture-spire` — „płatność {1} jest automatyczna … gracz nie może odmówić” — **M46 T7** wprowadził `resolve_pay_or_sacrifice` (wybór gracza) → nieaktualne; druga część o „any color = bezbarwna” pozostaje (mana „any color” nadal bez wyboru koloru — odrębne ograniczenie)
  3. `kor-cartographer` — „you may jest deterministyczne … pierwsza Plains … tasowana seedem” — **M46 T6** wprowadził `resolve_search_choice` z fail-to-find i wyborem gracza (tasowanie po każdym szukaniu) → nieaktualne
- Potencjalnie przestarzałe / do uściślenia (wymaga weryfikacji przy edycji):
  - `rage-of-purphoros` — „can't be regenerated nie ma efektu w engine (regeneracja nie jest zaimplementowana)” — **T5** dodał regenerację (tarcza `regeneration_shield_added`), ale efekt „can't be regenerated” nadal nie jest egzekwowany (niezależny flag). Wpis wymaga aktualizacji treści, nie usunięcia.
  - `pilgrims-eye` — „poszukiwanie deterministyczne wg ADR 0005 … you may bez blokującej decyzji” — po **M46 T6** wyszukiwanie jest `resolve_search_choice` z wyborem gracza → wpis nieaktualny (jeśli występuje)
  - Inne karty z „pula many jest bezbarwna” — **M41** wprowadził kolorową pulę dla landów podstawowych, hybryd i phyrexian, ale „one mana of any color” (Holdout, Dragonbroods, Raucous, Marut) **nadal** bez wyboru koloru (generyczne `add_mana amount:1`). Wpisy pozostają aktualne — nie ruszamy w tej sesji (osobny temat wyboru koloru).
- Narzędzia weryfikacji: `npm test` (1025), `npm run build` (49 modułów), `grep limitations`, ręczny test `commandLabel` dla mulligana (poprzedni fix)

## Cel

- **Wszystkie wpisy `limitations` w `card-data.js` zgodne ze stanem silnika po a677806**
- Brak wpisów opisujących zachowanie już naprawione (3× usunięcie + 1× aktualizacja)
- `npm test` i `npm run build` zielone; PR opisuje zmiany

## Zakres (1 commit po planie)

### Edycja `src/cards/card-data.js`

- `highland-game`: usuń tablicę z jednym elementem → `limitations: []`
- `rupture-spire`: usuń pierwszy element („płatność automatyczna”), zostaw drugi („one mana of any color = 1 bezbarwna …”)
- `kor-cartographer`: usuń wpis „you may jest deterministyczne …” → `limitations: []` (karta ma teraz realną decyzję `resolve_search_choice`)
- `rage-of-purphoros`: zaktualizuj wpis — z  
  `„can't be regenerated nie ma efektu w engine (regeneracja nie jest zaimplementowana); scry 1 to blokująca decyzja"`  
  na  
  `„can't be regenerated nie ma efektu (regeneracja jest w engine — T5 — ale flag 'can't be regenerated' nie jest respektowana); scry 1 to blokująca decyzja"`
- Sprawdź `pilgrims-eye` i ewentualne inne karty z identycznym wpisem „poszukiwanie deterministyczne” — jeśli występuje, usuń lub zamień na `[]` (w tej sesji znalezienie 1 wystąpienia w `kor-cartographer`; przeszukaj cały plik i wyczyść analogiczne)
- Nie ruszaj wpisów o „pula bezbarwna” dla `any color` / hybryd — są nadal aktualne (świadome uproszczenie mana)

### Weryfikacja

- `npm test` → oczekiwane 1025/1025 (zmiana tylko stringów w rejestrze, nie logiki)
- `npm run build` → 49 modułów, rozmiar ~1090 kB, brak nowych importów
- Ręcznie: `node` headless sprawdzenie `registry.get('highland-game').support.limitations` oraz `registry.get('rupture-spire')` itp.

### Dokumentacja (opcjonalnie w tym samym commicie)

- Krótka notatka w `docs/PROJECT_STATE.md` / `docs/ENGINE_MILESTONES.md` nie jest wymagana dla samych stringów limitacji; wystarczy opis PR. Jeśli właściciel oczekuje, dopisać w PROJECT_STATE sekcję „M49 — czyszczenie limitacji”.

## Kolejność

1. Ten plan (commit `plan:`)
2. Edycja `card-data.js` (commit `chore: sprzątanie przestarzałych limitacji po T1–T6`)
3. Push + update PR #33 (opis kumulatywny)

## Ryzyka

- Edycja `card-data.js` zawiera polskie znaki → **wyłącznie `python3` heredoc**, nie `edit_file`
- Nie usuwać wpisów o „any color” bezbarwna — to nadal aktualne ograniczenie mana (osobny temat wyboru koloru)
- Nie zmieniać `support.status` — wszystkie karty zostają `supported`

## Poza zakresem

- Nowe karty (Batch 22), strojenie bota, wybór koloru dla „any color”, backend FoW — osobne plany
