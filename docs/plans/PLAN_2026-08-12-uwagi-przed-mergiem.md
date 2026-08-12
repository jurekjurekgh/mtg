# Plan: Uwagi z testów przed mergiem PR #44 (A–C)

Sesja `arena/019ff280-mtg` (PR #44). Właściciel zgłosił 3 uwagi z testów na
telefonie przed mergem Batchu 30.

## Uwagi i root cause

- **A. Dublowany komunikat o tasowaniu** (Caravan Vigil) — w modalu „Ruch
  przeciwnika\" i logu po szukaniu pojawiały się DWA wpisy o tasowaniu:
  `search_choice_resolved` („znajduje kartę i tasuje bibliotekę\") i tuż po nim
  `library_searched` („przeszukuje bibliotekę i tasuje\"). Fix: tłumimy
  natychmiastowy `library_searched` po `search_choice_resolved` w `describeEvent`
  (flaga) oraz w `noteBotMove` (modal); `library_searched` z innych ścieżek
  (typecycling, pokoje lochu, bez search_choice) nadal się loguje.
- **B. Bot rzuca buff (pump) na stwora przeciwnika** (Might of the Masses →
  Maritime Guard) — kara „wzmacnianie przeciwnika bez powodu\" obejmowała tylko
  efekt `pump`, a Might of the Masses używa `pump_by_creature_count`. Fix:
  kara dla WSZYSTKICH pump-efektów (`pump`, `pump_by_creature_count`,
  `pump_enchanted_creature`) na cudzym stwórze w `heuristic-bot` cast_spell.
- **C. Brak informacji o zmianie tury/fazy podczas ciągłego ruchu bota** —
  `turn_started`/`step_advanced` były w BOT_MOVE_NOISE (pomijane w modalu).
  Fix: modal ruchu bota dostaje nagłówki „Tura N — <gracz>\" (turn_started)
  i „Faza: <nazwa>\" (step_advanced przy zmianie fazy/kroku); `lastBotPhaseKey`
  śledzi ostatnią fazę, `clearBotMoves` resetuje stan.

## Weryfikacja

- `npm test`: 1396/1396 (+3: A/C w session-bot-pausa, B w bot-opponent-model).
- Build: 50 modułów / ~1523 kB.
- Pełne B0 (2160 meczów): 0 crashy, heuristic ~79.4% ogółem — progi
  0.78/0.57 utrzymane (zmiana bota: kara za pump na cudzym — mierzona).
- Sonda: modal ma nagłówki tury/fazy (6× Tura / 37× Faza w partii), 0 dublowanych
  „tasuje\"; bot celuje pump we własnego stwora.
