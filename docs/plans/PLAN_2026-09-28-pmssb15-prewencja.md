# Plan PMSSB-15 — prewencja/fog (`prevent_*`) (2026-09-28)

## Wybór rodziny (BACKLOG pusty; re-audyt „POKRYTEJ" z NOWYM dowodem)

Rodzina: **globalna prewencja obrażeń + tarcze** — 4 karty w katalogu:

| Karta | Typ | Efekt | Okno |
|---|---|---|---|
| Withstand (GPT) | instant MV3 | `prevent_next_damage` 3 + draw | każde instant-okno |
| Revealing Wind | instant MV3 | `prevent_all_combat_damage_this_turn` (+look morph) | turze atakującego wroga |
| Inspire Awe | instant MV4 | `prevent_combat_damage_except_enchanted` + Scry 2 | turze atakującego wroga |
| Ethersworn Shieldmage | creature MV3 flash | ETB `prevent_damage_this_turn` (Artifact+Creature) | flash w walce/na burn |

Rejestr mówi „POKRYTE (M91/M236) — okna (tura wroga), kara własnej tury
przebija wszystko — nie ruszać bez nowego dowodu". **Nowy dowód jest:**

1. **Zgłoszenie właściciela B (2026-09-28e)** — taktyka prewencji podana
   wprost: „combat trick w walce przed podziałem obrażeń i preventować
   u stworów które by lethal dostały albo u siebie jeśli któryś z kreatur
   przeciwnika go zrani. Ewentualnie w odpowiedzi na rzucenie czaru
   damagującego bota albo jego kreatury (lethal)". Fix B (`36eed2e`)
   ustawił RANKING CELÓW `prevent_next_damage`; wymiar TIMINGU/STANU
   (kiedy w ogóle rzucać, ile realnie zyskujemy) nie był ruszany.
2. **Luka L41 w rodzinie darmowych rzutów** (potwierdzona przy B:
   Epic Experiment) — okna taktyczne fog siedzą WYŁĄCZNIE w pętli
   `cast_spell` (−300 własnej tury / −75 brak napastników); lejek
   `freeCastTargetPenalty` (epic/rebound/suspend/madness/exile) jej nie
   zna → darmowy fog trafiałby w dowolnym momencie, nawet zabijając
   własny atak.
3. Wartość fog jest **płaska** (`+15` gdy `attackingEnemyPower > 0`) —
   nie rozróżnia „1/1 kiwnął palcem" od „trzy ataki = lethal"; nie liczy
   **wycieku** Inspire Awe (enchantment creatures / enchanted creatures
   nadal zadają — CR 702.x) ani **zegarów śmierci** (życie vs poison).

## Pytania audytu (macierz kierunek × cel × timing × stan)

- **Kiedy zysk = 0 / ujemny:** własna tura (kasuje własny atak — M91);
  wróg bez zadeklarowanych napastników (przedwczesne spalenie instanta —
  M236); po rozdaniu obrażeń (DEBT — prewencja nie cofa); fog w odpowiedzi
  na NIEBOJOWY dmg (nic nie zapobiega); Inspire Awe, gdy cała moc ataku
  to enchantment creatures/enchanted (leak = 100%).
- **Kiedy zysk średni:** chip niezagrażający (utracone życie, które i tak
  mamy); cantrip Withstand (Q1b — świadome).
- **Kiedy zysk maksymalny:** atak wroga z lethalem na życie bota
  (fog = przeżycie); atak z lethalem na KLUCZOWE stwory (blokery, które
  zdejmą atak); odpowiedź na burn z lethalem (Withstand/Shieldmage);
  zegar poison: fog zatrzymuje obrażenia infect = liczniki nie lecą
  (CR 702.90b — damage dealt in the form of counters; zapobiegane damage
  = brak liczników — cytować dosłownie w audycie).
- **Stan gry:** życie bota vs incoming; poison bota (10 = śmierć);
  liczba/moc napastników vs garda; deck-out (Withstand dobiera — rider
  rodzinowy PMSSB-3, nie ruszać; ale wartość celu w oknie cienkiej
  biblioteki nie może kłamać).

## Hipotezy findingów (do weryfikacji sondą POMIAR PRZED)

- **F1 (L41):** okna fog nieobecne w rodzinie darmowych rzutów
  (`resolve_epic_choice`/`resolve_rebound_cast`/… = flat 70) i w ścieżce
  ETB (`prevent_damage_this_turn: () => 3` — flat).
- **F2 (skala):** `+15` płaskie za `attackingEnemyPower > 0` — brak skali
  „ile realnie zapobiegam / czy to lethal" (właściciel: „u stworów które
  by lethal dostały").
- **F3 (leak Inspire Awe):** `prevent_combat_damage_except_enchanted`
  liczy pełną `attackingEnemyPower`, w tym enchantment creatures
  i enchanted — zapobiega TYLKO reszcie (CR 713? — sprawdzić numer
  „except by enchanted creatures" w Oracle).
- **F4 (Shieldmage):** ETB-flat 3 — brak okna „moje artifact-stwory
  realnie oberżą w tej turze" i okna flasha (walka/burn).
- **F5 (koszt, S11):** Inspire Awe MV4 vs Revealing Wind MV3 — te same
  okna, inny koszt i leak; scry 2 to rider PMSSB-rodzinowy (nie dublować).
- **Anty-over-fix (M429):** najsłabszy realny wariant = stara wartość
  (płaskie +15 dla „napastnicy zadeklarowani, chip bez lethal"); nowe
  wymiary = dopłaty (lethal-save, fog-vs-śmierć) i kary (leak, poison-blind
  tam gdzie dotyczy, przedwczesne okno).

## Fale implementacji

- **Fala A (F1+L41):** wspólny helper `fogPreventionValue(view, effect)`
  (L41) wpięty w `cast_spell` + lejek `freeCastTargetPenalty`/familia
  free-cast + mapa ETB (`prevent_damage_this_turn`) przez ten sam helper.
- **Fala B (F2+F3+F5):** skala wartości = zapobiegona moc względem zegarów
  bota (życie/poison) + realny leak Inspire Awe (enchantment/enchanted) +
  wymiar kosztu MV.
- **Fala C (F4):** Shieldmage — okno wartości dla artifact-stworów
  (deklarowana walka: moje artifact-blokery/atakerzy z damage incoming;
  burn na artifact na stosie).
- Pokrętła w `heuristic-params.js` (rodzina `fog*`/`prevent*`) — tylko
  tam, gdzie wartość zasługuje na regulację; domyślne = wartości z audytu.

## Testy i ewaluacja

- `test/audyt-pmssb15-prewencja.test.js` (wzorzec M429: decide/trace,
  anty-over-fix, pokrętła ×0) — RED→GREEN + mutacje.
- `bot-scoring-snapshot`: cel = BEZ regeneracji (rodzina 4-kartowa — jeśli
  regeneracja konieczna, wymaga lokalizacji różnicy jak w B i uzasadnienia).
- tie-audit PO; mirror-eval (reguły vs off); Żywy Tester PO (budżet).
- Bramy: `npm test`, build, `test:all`; push po każdym kroku; opis PR.

## Zakres / nie-ruszać

- Wartość `draw_cards` ridera Withstand = rodzina PMSSB-3 (DONE) — nie
  dotykać (L41 granice rodzin).
- Atak-decyzje do własnej mgły (8657 `finish(-100)`) zostają — to strona
  ATAKU, nie prewencji; sprawdzić tylko, czy nowa skala fog nie psuje
  symetrii.
- Broń/aura/protection = osobne rodziny (M109/M218).
