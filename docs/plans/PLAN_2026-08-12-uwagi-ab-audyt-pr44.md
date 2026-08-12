# Plan: uwagi A/B z testów + audyt PR #44

Sesja `arena/019ff6fd-mtg`. Właściciel zgłosił dwa błędy z telefonu
po merge PR #44 oraz zlecił pełny audyt zmian z tamtego PR.

## 1. Uwaga A — „Ruch przeciwnika” pełen pustych faz

**Objaw:** modal pokazuje każdą zmianę kroku (Początek walki → Deklaracja
atakujących → … → Sprzątanie → Odkręcenie), nawet gdy nic się nie stało.

**Root cause:** M77 (uwaga C przed mergiem) wrzuca `step_advanced` do
`botMoves` przy KAŻDEJ zmianie fazy (`lastBotPhaseKey`).

**Fix:** nagłówek „Faza: …” jest *oczekujący* — wypychamy go dopiero
gdy w tej fazie pojawi się prawdziwa akcja. Zawsze zostawiamy
„Tura N — <gracz>” (początek tury). Puste fazy znikają.

## 2. Uwaga B — brak info o walce + fullscreen zrywa wizard

### B1. Brak informacji o obrażeniach niezablokowanego ataku

**Objaw:** moja kreatura atakuje, nikt nie blokuje — nie widać, że
zadała obrażenia przeciwnikowi. „Wcześniej to było”.

**Root cause (dwa miejsca):**
1. M75 (`botActing`): auto-resolve walki CZŁOWIEKA nie trafia do
   `botMoves` (słusznie nie jest „ruchem przeciwnika”), ale gracz
   patrzy na modal po swoim ataku i nie widzi wyniku walki.
2. `dealCombatDamageToPlayer` nie niesie `sourceCardId` (niespójne
   z `assignDamageToBlockers`) — przy LKI log może pokazać „?”.

**Fix:** zdarzenia walki (`damage_dealt` combat, `life_changed`,
`creature_destroyed`, `blockers_declared`) z auto-resolve w `advance()`
trafiaja do bufora (widoczne po ataku). Combat damage do gracza dostaje
LKI `sourceCardId`. Test: atak bez bloku → log i modal mają
„zadaje N obrażeń”.

### B2. Fullscreen z wizardu ataku/bloku wraca na stół

**Objaw:** klik w nazwę stwora w wyborze atakujących otwiera skan;
zamknięcie NIE wraca do wizardu, tylko na stół.

**Root cause:** `openCardFullscreen` (M75 C) woła
`hideModal('choice-request')`. Fullscreen ma z-index 2600, modal 1500 —
chowanie jest zbędne (ten sam błąd co B23 przy modalu bota).

**Fix:** nie chowamy `choice-request` przy otwarciu fullscreen
(jak `bot-move` od B23). Zamknięcie odsłania wizard.

## 3. Audyt PR #44 (Batch 30 + M74–M78)

Sonda behawioralna (wzorzec M54/M65/M73), nie definicje.

Kandydaci do naprawy u root cause:
- `PROJECT_STATE.md` — znaczniki konfliktu `<<<<<<< HEAD` (reszta squash).
- Consume Spirit: Oracle „Spend only black mana on X” — `xCost.black`
  nieustawione; X idzie jako generyczna.
- Epic Experiment: free-cast z `chosenTargets: []` — czary z celem
  fizzlują (CR 608.2b). Oferta per legalny cel.
- Crew Captain `enteredThisTurn` = `summoningSickness` — kradzież
  (Puppeteer Clique) daje fałszywe indestructible. Flaga
  `enteredOnTurn` przy wejściu na bitwisko.
- Komentarz w `combat.js` o „pełna siła KAŻDEMU blokerowi” jest
  nieaktualny (M66 już rozdziela).

## Kolejność commitów

1. `docs(plan): uwagi A/B + audyt PR #44`
2. `fix(ux): puste fazy, wynik walki, powrót z fullscreenu do wizardu`
3. `fix(engine): audyt Batch 30 — X czarne, Epic cele, enteredOnTurn`
4. `docs: M79 PROJECT_STATE + HANDOFF`

## Weryfikacja

- `npm test` zielone (+ nowe regresje A/B + audyt).
- `npm run build`.
- Bot bez zmian → B0 niewymagany.

## Ryzyka

- Test C (session-bot-pausa) asertuje `phases >= 3` — po A nagłówki
  tylko przy akcji; zaktualizować asercję.
- `edit_file` psuje polskie znaki → python3 Path.write_text.
