# PLAN M162 — uwagi właściciela z testów: A (talie ×2), B (Bell bota), C (modal Rats) (sesja 2026-08-20, PR #68)

## Kontekst

Trzy uwagi właściciela z rozgrywek (2026-08-20), dopisywane do PR sesji
(ADR 0013: 1 sesja = 1 PR, osobne zielone commity). Rozpoznanie każdej
przed kodowaniem; naprawy u root cause; testy RED→GREEN.

## Etapy

- [x] **0. Rozpoznanie A (zdublowane talie na liście wyboru).**
  Werdykt początkowy: brak reprodukcji w świeżym artefakcie — wstrzyknięty
  REPO_DECKS ma 12 unikalnych kluczy, pętla populacji `#deck-human`/
  `#deck-bot` (main.js:1243) wykonuje się raz, artefakt ma jeden
  `<script>` (bundle) i jedno `bootstrapTable()`; jsdom na świeżym
  builde pokazuje po 12 UNIKALNYCH opcji. Pages wdrożone z aktualnego
  main (015f715) — ten sam kod. Historia populacji niezmieniona.
  Kandydat-hipoteza wymagająca danych od właściciela: lista BIBLIOTEKI
  w kreatorze talii („Z repozytorium" + „Moja biblioteka (IndexedDB)")
  — na iOS picker spłaszcza optgroupy, a talie zapisane pod nazwami
  repozytorium wyglądają jak duplikaty; ewentualnie przeglądarka
  trzyma stary artefakt z cache. **Bez wskazania, którą listę widać,
  nie patchujemy w ciemno** (AGENTS: nie maskuj, znajdź root cause).
  → pytanie do właściciela na końcu tury. **Odpowiedź właściciela:**
  duble w wersji desktopowej — plik ściągnięty „Zapisz jako..." i
  otwierany lokalnie (HTML z opcjami runtime'owymi w selectach).
  Root cause: populacja nieidempotentna; „Zapisz jako..." serializuje
  DOM po uruchomieniu skryptu, ponowne uruchomienie dokładało komplet.
  Fix w etapie 1A: src/table/deck-selects.js (populateDeckSelects
  czyści przed wypełnieniem; deckTitle przeniesiony z main.js).
- [x] **1. Fix C — Chittering Rats: modal „Karta z ręki na wierzch (i z n)".**
  Root cause: `commandLabel` NIE MA przypadku `resolve_hand_top_choice`
  — etykieta spada do słownikowej „Karta z ręki na wierzch" i choice-
  request numeruje identyczne wpisy „(1 z 5)". Ręka WYBIERAJĄCEGO jest
  dla niego jawna (FoW), więc etykieta może nazywać kartę (wzorzec:
  resolve_graveyard_top_choice / resolve_discard_choice).
  Naprawa: (a) `case 'resolve_hand_top_choice'` w commandLabel — nazwa
  karty; (b) wystawienie `pendingHandTopChoice.sourceCardId` w
  playerView (tylko dla właściciela decyzji; sourceCardId = karta na
  polu bitwy, informacja publiczna — precedens pendingTriggerTarget,
  uwagi B/C właściciela 2026-08-10) + tytuł grupy z nazwą źródła
  („Chittering Rats: …"). Przegląd pozostałych podobnych modali
  wykonany w rozpoznaniu: wszystkie inne resolve_* nazywają kartę/cel
  lub opisują skutek (explore/discover/food) — jedyny brak to
  hand_top_choice.
  Kryteria: test z ETB Ratsów u bota → każda opcja modala nazywa kartę
  z ręki gracza; tytuł nazywa źródło; brak numerowania przy różnych
  nazwach.
- [x] **2. Fix B — Ghoulcaller's Bell: bot dzwoni co turę do własnej zguby.**
  Root cause: efekt `mill_both_players` nie ma wyceny w heuristic-bocie
  → aktywacja {T} dostaje bazowe +2, wygrywa z passem (0) przy braku
  lepszego ruchu — bot mieli obie biblioteki także PRZEGRYWAJĄC wyścig
  o karty. PlayerView niesie liczniki obu bibliotek (zones.library z
  controllerId — ADR 0017 spełniony, bez zmian widoku).
  Naprawa: wycena wyścigu w OBU gałęziach efektów (cast_spell +
  activate_ability — lekcja L41 o bliźniaczych gałęziach):
  - własna biblioteka po millu ≤ 0 → kara ~−120 (nie milduję ostatniej
    karty);
  - przeciwnik po millu ≤ 0 → premia (przegrywa przy dobieraniu);
  - nie prowadzę w kartach (≤) → kara ~−40 (pomoc wrogowi);
  - prowadzę → mały zysk rosnący z przewagą.
  Kryteria: test — bot z MNIEJSZĄ biblioteką nie aktywuje Bella (wybiera
  cokolwiek innego/pass); bot z większą może aktywować; remis = nie
  aktywuje. `npm test` + build zielone; `test:slow` (próbka regresji
  bota) bez regresji.
- [x] **3. Domknięcie:** PROJECT_STATE (M162), handoff, opis PR
  kumulatywnie; A dokumentowane jako otwarte pytanie do właściciela.

## Planowane commity

1. Ten plan.
2. Fix C (engine view + render + test `test/m162-uwagi-wlasciciela.test.js`).
3. Fix B (heuristic-bot + testy w tym samym pliku).
4. Dokumentacja.

## Ryzyka / pułapki

- B: nie zmieniać zachowania przy celowanym millu (`mill_cards` ma już
  wycenę z karą self-mill — to INNY efekt); wycena symetrycznego milla
  musi działać w obu gałęziach (L41).
- C: `sourceCardId` wystawiamy TYLKO właścicielowi decyzji; nie wystawiamy
  handIds (ręka i tak widoczna właścicielowi, ale licznik zbędny — zakaz
  „na zapas", ADR 0017 reguła 2).
- A: zakaz łatania bez reprodukcji — czekamy na odpowiedź właściciela.
- Testy UI bez DOM (mini-harness), testy bota na playerView (wzorce
  audit-m119 / m160).

## Podsumowanie wykonania

- B+C zaimplementowane RED→GREEN (5/7 czerwonych przed): wycena wyścigu
  bibliotek dla mill_both_players w obu gałęziach bota; etykieta
  resolve_hand_top_choice nazywa kartę, tytuł modala źródło (FoW:
  pending tylko właściciel decyzji).
- Przegląd pozostałych modali resolve_* wykonany w rozpoznaniu: jedyny
  brak nazwy to hand_top_choice (wszystkie inne nazywają kartę/cel lub
  opisują skutek) — udokumentowane w PLAN i commicie.
- A rozwiązane po odpowiedzi właściciela (idempotentna populacja;
  testy A1/A2 + jsdom end-to-end serialize→rerun→12 unikalnych opcji).
- Incident: reset workspace w trakcie (ENVIRONMENT §2) — odzyskano z
  origin + cherry-pick; stan końcowy: npm test 2514/2514 (fast),
  build 51 modułów / 2140.9 kB.
