# PLAN M163 — uwagi właściciela z testów: A (Exploit Butchera + przegląd klasy), B (inicjatywa) (sesja 2026-08-20, PR #68)

## Kontekst

Kolejne uwagi z rozgrywek, dopisywane do PR sesji. A to POWTÓRKA klasy
M162/C (modal bez treści) rozszerzona o BRAK GRUPOWANIA — zlecenie obejmuje
dokładny przegląd pozostałych zdolności pod kątem obu objawów.

## Etapy

- [x] **0. Rozpoznanie A.** `resolve_exploit_choice` nie ma case'a
  w commandLabel (identyczne etykiety słownikowe „Exploit (wybór
  poświęcenia)" ×N) ani klucza w choiceRequestGroupKey (luźne przyciski).
  Systematyczny przegląd WSZYSTKICH typów komend ( COMMAND_TYPES ×
  commandLabel × choiceRequestGroupKey): dodatkowo bez etykiet —
  resolve_color_choice, resolve_land_type_choice, resolve_moonlit_choice,
  resolve_optional_draw, resolve_optional_trigger_choice (identyczne
  warianty); resolve_epic_choice — brak celu w etykiecie (oferty per cel,
  klasa M151/suspend) i brak grupowania.
- [x] **1. Fix A:** case'e w commandLabel (exploit nazywa poświęcanego
  stwora + skip; kolor/typ landa z polskimi nazwami; moonlit zamiana/tak;
  optional draw/trigger tak-nie), klucze grupowania (exploit, epic,
  optional_draw), tytuł grupy exploit z nazwą źródła (pendingExploit
  .sourceCardId w playerView — TYLKO właściciel, karta publiczna, wzorzec
  M162/C), cel w etykiecie epic.
- [x] **2. Strażnik klasy A3** (skan źródła render.js): KAŻDY typ komendy
  ma case w commandLabel albo świadomy allowlist (dziś: move_object — tryb
  diagnostyczny); KAŻDA decyzja resolve_* ma klucz grupowania albo
  świadomy allowlist (uzasadnione w komentarzu: dedykowane wizardy/etykiety
  rozróżnialne). Nowy typ decyzji bez etykiety/grupy czerwieni test
  z instrukcją — to sygnał klasy L52 (nie zapomnieć).
- [x] **3. Fix B:** firstTime w evencie initiative_taken = „wejście do
  Podziemi teraz" (undercityProgress == 0 przy zmianie posiadacza), NIE
  „zmiana posiadacza". Mechanika venture bez zmian (awans pokoju przy
  każdym objęciu — CR 725.4; brak akcji tylko gdy gracz już posiada
  inicjatywę). Komunikat „obejmuje ją po raz pierwszy i zagłębia się
  w Podziemia" prawdziwy wyłącznie przy wejściu do pokoju 1.
- [x] **4. Domknięcie:** PROJECT_STATE (M163), handoff, opis PR.

## Kryteria ukończenia

- RED→GREEN: A1 (pełny przepływ Butchera: nazwy stworów, skip, JEDNA
  grupa, tytuł ze źródłem), A2 (rozróżnialne etykiety 5 typów), A3
  (strażnik), B1 (odzyskanie ≠ „po raz pierwszy", awans pokoju 4),
  B2 (loch 9/9 bez „pierwszego razu").
- `npm test` + `npm run build` zielone po każdym commicie; test:slow bez
  regressji (zmieniony payload eventu).

## Ryzyka / pułapki

- Strażnik skanuje ŹRÓDŁO render.js (nie eksport) — zmiana nazw funkcji
  commandLabel/choiceRequestGroupKey wymaga aktualizacji regexów w A3.
- B: nie zmieniać bramki venture (zachowanie CR 725.4); firstTime czytany
  tylko przez sesję (komunikat) — weryfikacja payloadu wystarcza.
