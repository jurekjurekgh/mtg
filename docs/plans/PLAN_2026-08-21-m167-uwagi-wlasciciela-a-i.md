# PLAN M167 — uwagi właściciela z testów A–I (sesja 2026-08-21, PR #68)

## Rozpoznanie (ukończone)

- **A (Voice of the Vermin):** wycena celu przyjaznego triggera (resolve_
  trigger_target, cmd.friendly) premiuje największego własnego stwora —
  bez różnicy, czy atakuje. Fix: bonus dla stworów ATAKUJĄCYCH w bieżącym
  combacie (buff współatakującego).
- **B (Circle of the Land Druid i opcjonalny self-mill):** mayFire →
  resolve_optional_trigger_choice = flat fire:50. Fix: adnotacja oferty
  w engine (selfMill z deskryptora efektu) + wycena wyścigu bibliotek
  (jak Bell M162/B): fire tylko przy przewadze kart. Przegląd innych
  mayFire+mill_cards.
- **C (Scry/surveil modal — klikalne karty):** lista „obejrzane karty"
  jako klikalne (pełnoekranowa ilustracja Scryfall jak przy klikaniu
  karty na stole).
- **D (Apprentice Wizard):** activate_ability z efektem add_mana bez
  bramki „jest co zagrać" (tap_for_mana JĄ MA z M127). Fix: ta sama
  reguła dla add_mana w gałęzi zdolności.
- **E (nagłówki faz w logu):** MAIN_LOG_NOISE wycisza step_advanced
  (140×/partię). Fix: nagłówek przy ZMIANIE FAZY (nie każdym kroku) —
  kompromis szum/użyteczność śledzenia błędów.
- **E2 (nazwy kart w logu klikalne):** pełnoekranowa ilustracja po
  kliknięciu nazwy w logu (delegacja zdarzeń + data-card-id).
- **F (Inspire Awe):** bramka M91 (myTurn → −80) istnieje, ale bot
  rzucił we własnej turze — reprodukcja i wzmocnienie (możliwy brak
  pokrycia ścieżki wyceny lub zbyt niska kara).
- **G (Mysteries of the Deep):** ODTWORZONE — tracker landfall skanuje
  permanent_entered_battlefield, a play_land emituje TYLKO land_played
  → landEnteredThisTurn puste → „draw two". Fix: tracker liczy też
  land_played (root cause; łamie WSZYSTKIE warunki landEnteredThisTurn).
- **H (Revolutionist artId):** słownik tools/collection-art-ids.csv ma
  „314MH2,Revolutionist" → artId: 314 (dziś null).
- **I (atak 2/4 w 1/3+3/3):** wycena ataku liczy tylko najsilniejszego
  POJEDYNCZEGO blokera (strongestBlockerPower) — gang dwóch blokerów
  (3+1 ≥ 4 wytrzymałości) niewidoczny. Fix: gangPower (suma top-2 mocy
  blockerów) + kara dla ataku, który ginie od gangu nie zabijając niczego.

## Etapy (każdy zielony: test:all + build)

- [ ] **1. T-engine:** G (tracker land_played), H (artId 314).
- [ ] **2. T-bot:** A, B, D, F, I + benchmark regresji (test:all zawiera
  próbkę; progi pilnują regresji).
- [ ] **3. T-UI:** E (nagłówki faz), C (klikalne karty w modaliach
  scry/surveil/look), E2 (klikalne nazwy w logu).
- [ ] **4.** Dokumentacja (PROJECT_STATE, handoff, opis PR).

## Ryzyka

- I: zmiana wyceny ataku może przesunąć benchmark — patrzeć na próg
  regresji; zmiany chirurgiczne (gang tylko gdy atakujący ginie i nic
  nie zabija).
- E2: log jest tekstem; klikalność wymaga oznaczeń w źródle (spans z
  data-card-id) bez zepsucia formatu „Przebieg tur (dla AI)" — rozdzielić
  render HTML od tekstu AI.
- B: adnotacja oferty w engine (jak cmd.friendly z M150) — generycznie
  po deskryptorze efektu, nie po nazwie karty.
