# Plan: platynowa odznaka wyłapywacza błędów — 5 błędów vs zasady MtG

Data: 2026-08-09. Sesja: `arena/019fe265-mtg` (PR #36 — kontynuacja po M57/złotej
odznace). Cel: przegląd istniejących kart i mechanik, znalezienie i naprawa
**5 błędów/uproszczeń vs zasady MtG** (platynowa odznaka). Zasady: root-cause
fix (AGENTS.md), `npm test` + `npm run build` po każdym commicie, commity
osobno zielone, push po każdym, docs (MILESTONES/PROJECT_STATE/ROADMAP/HANDOFF)
na końcu.

## Znalezione błędy (przegląd kodu + weryfikacja zasad)

1. **CR 510.1c / 702.19b — przydział obrażeń combat (lethal/trample) uwzględnia
   prewencję** (`src/engine/combat.js`). Przy wyznaczaniu „lethal" engine
   ODEJMOWAŁ tarcze prewencji od wytrzymałości (`baseLethal - blockerShields`)
   i traktował filtr „prevent all damage to ... this turn" jako lethal=0.
   Zasady: „When checking for assigned lethal damage ... but not any abilities
   or effects that might change the amount of damage that's actually dealt" —
   prewencję IGNORUJE się przy przydziale. Skutek buga: trample 5/5 vs 3/3 z
   tarczą 2 (Withstand) zadawał graczowi 4 (zamiast 2), a blocker dostawał 0
   obrażeń zamiast 1; filtr Ethersworn Shieldmage przepuszczał trample w całości.
2. **CR 119.3 — zdarzenia `damage_dealt` niosą kwotę PRZED prewencją w 3
   ścieżkach** (`src/engine/combat.js` — atakujący→bloker, bloker→atakujący;
   `src/engine/effects.js` — `damage_to_controller`). Konwencja po złotej
   odznace: event niesie kwotę FAKTYCZNIE zadaną (po prewencji). W pełni
   zapobiegnięte obrażenia raportowały pełną kwotę (log/triggery przyszłych kart).
3. **CR 701.27a — proliferate nie może celować w graczy ze znacznikami
   trucizny** (`src/engine/effects.js`). Kandydaci i aplikacja czytają/piszą
   `player.counters.poison`, a trucizna mieszka w `player.poison` (jedyna
   ścieżka: `addPoisonCounters`; SBA czyta `player.poison`). Gracz z poison > 0
   nigdy nie jest oferowany jako cel proliferate, a nawet po wymuszeniu +1
   poszłoby w złe pole.
4. **CR 401.4 — `mill_from_bottom` młynuje ostatnią kartę WSPÓLNEJ listy
   biblioteki zamiast spodu biblioteki GRACZA-CELU** (`src/engine/effects.js`,
   Cellar Door). Biblioteka to wspólna lista obu graczy; „spód własnej
   biblioteki" = ostatnia WŁASNA karta, nie ostatni element listy. Po scry/mulligan-
   bottom gracza P1 ostatni element wspólnej listy należy do P1 — Cellar Door
   celujący w P2 młynował kartę P1 (i tworzył Zombie z NIE tej karty).
5. **CR 108.3 / 400.7 — `bounce_permanent` zwraca permanent na rękę
   DOTYCHCZASOWEGO KONTROLERA zamiast WŁAŚCICIELA** (`src/engine/effects.js`;
   Jill „to its owner's hand", Lunar Rejection „to its owner's hand").
   Engine już śledzi `ownerId` (Trostani) — fix w root cause: ręka właściciela
   + `controllerId = ownerId`.

## Etapy i kryteria ukończenia

1. Commit planu (ten plik) — osobny commit PRZED kodowaniem.
2. Fixy w engine (jeden commit na logiczną grupę albo jeden zbiorczy):
   - combat.js: lethal ignoruje prewencję + eventy damage_dealt z kwotą zadaną
     (bugi 1+2 w obu przebiegach);
   - effects.js: damage_to_controller event (bug 2), proliferate poison
     (bug 3), mill_from_bottom spód celu (bug 4), bounce_permanent właściciel
     (bug 5).
3. Testy: `test/engine-platinum-badge.test.js` — 5 testów (po jednym na bug),
   styl jak engine-gold-badge.test.js (stany budowane ręcznie).
4. `npm test` (1131+ testów) + `npm run build` (49 modułów) — zielone.
5. Ewentualna korekta testów zależnych (jeśli testował złe zachowanie).
6. Docs: ENGINE_MILESTONES (M58), PROJECT_STATE, ROADMAP, HANDOFF_2026-08-09a.

## Ryzyka / pułapki

- `edit_file` psuje polskie znaki → python3 Path.read_text/write_text.
- Zmiana przydziału lethal może ruszyć testy combat/trample (sprawdzić
  combat-damage-resolve, damage, engine-badge-fixes).
- bounce_permanent: sprawdzić, czy któryś test nie zakładał „ręka kontrolera"
  (grep po testach).
- mill_from_bottom: tylko Cellar Door używa efektu — sprawdzić testy batch22.
- Po commicie sprawdzić `git log` parent chain (środowisko resetuje refy).
