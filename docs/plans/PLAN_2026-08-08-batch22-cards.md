# PLAN 2026-08-08 — Batch 22: 10 realnych kart (kolejka właściciela)

- **Data:** 2026-08-08
- **Sesja:** `arena/019fe084-mtg` (PR #34+ czekają; ten PR to #36)
- **Karty:** Thistledown Players (BLB), Etherwrought Page (ARB), Stomping
  Slabs (MOR), Courage in Crisis (WAR), Selesnya Charm (RTR),
  Wormfang Newt (JUD), Raise the Alarm (CMR), Cellar Door (ISD),
  Healer of the Glade (M20), Enter the Enigma (DSK).
- **Procedura:** ADR 0010 §2a — dane Scryfall pobrane PRZED kodowaniem
  (10 plików `docs/cards/scryfall-*.json` + 1 token Knight dla Selesnya
  Charm), artId + plan ze słownika `tools/collection-art-ids.csv`.

## Mechaniki i stopień trudności

### Łatwe (istniejące mechaniki)
- **Thistledown Players (BLB)** {2}{W} 3/3 — trigger attacks +
  `untap_permanent` na celu. Nowy typ celu: `nonland_permanent`
  (sprawdzenie, czy istnieje; w `triggerTargetCandidates` analogicznie
  do `other_nonland_permanent` Jill).
- **Raise the Alarm (CMR)** {1}{W} — 2× token Soldier 1/1 (wzorzec
  Captain's Call z M30). Token Soldier już istnieje (Captain's Call /
  Call for Aid) — reużywamy.
- **Healer of the Glade (M20)** {G} 1/2 — `trigger: 'enter_battlefield'`
  + `gain_life: 3`. Bezcelowy efekt, identyczny z Phyrexian Ragerem
  (M30) bez `lose_life`.
- **Enter the Enigma (DSK)** {U} — `cant_be_blocked` + `draw_cards: 1`
  (wzorzec Coralhelm Guide z M36). Efekty istniejące.

### Umiarkowane (nowe typy celów / drobne nowe efekty)
- **Selesnya Charm (RTR)** {G}{W} Instant — modal Choose one:
  • +2/+2 + trample EOT (istnieje: `pump` z `keywords: ['trample']`)
  • **exile creature z `power ≥ 5`** — nowy typ celu
    `creature_with_power_at_least: { min: 5 }` w `triggerTargetCandidates`
    + `legalTargetCandidates` (potrzebne do walidacji castu i
    oferty). Efekt `exile_permanent` z `targetType: 'creature'` już
    istnieje. **Nowy token Knight** 2/2 biały vigilance — definicja
    `token_knight` (limited, jak inne tokeny).
  • 2/2 Knight z vigilance (nowy token).
- **Etherwrought Page (ARB)** {1}{W}{U}{B} Artifact — **upkeep trigger**
  (CR 503): „At the beginning of your upkeep, choose one — • gain
  2 life • surveil 1 • each opponent loses 1 life". Nowy event triggera
  `upkeep` dla zachowującego efekt (istnieje `trigger.event: 'upkeep'`
  dla transformacji; `processTriggers` w triggers.js ma już blok
  upkeep, wystarczy dodać ability do źródła). Tryb modalny wymaga
  `spell.modes` (wzorzec M30).
- **Cellar Door (ISD)** {2} Artifact — aktywowana {3},{T}: cel-gracz
  mill z dołu, jeśli karta to creature → create_token Zombie 2/2.
  Nowy efekt: `mill_from_bottom` (CR 702.13 odwrotnie — gracz
  decyduje po `reveal`). `mill_cards` już istnieje, ale czyta
  z góry; potrzebny odpowiednik od dołu. **Nowy cel `player` (wymaga
  wyboru)** w `legalActivatedAbilities` + `legalTargetCandidates`.
  Nowy token Zombie 2/2 czarny (wzorzec Undead Servant) — definicja
  `token_zombie_cellar` (re-uses istniejący `token_zombie` z
  Undead Servant, ten sam profil 2/2 B Zombie; sprawdzić identyczność).

### Trudne (nowe efekty silnika)
- **Stomping Slabs (MOR)** {2}{R} Sorcery — **reveal top 7 → kolejność
  gracza (spód biblioteki w dowolnej kolejności) → jeśli „Stomping
  Slabs" było w reveal → 7 dmg do dowolnego celu**. Nowe efekty:
  - `reveal_top_to_bottom_order` — CR 701.16 reveal + reorder
    (w odróżnieniu od `scry` patrzymy i układamy z góry na spód, a
    NIE z wierzchu na wierzch). Wymaga nowej kolejki decyzji
    `pendingRevealOrder` (analogicznie do `pendingScry` w M30).
  - `if_named_in_revealed` — warunek na karcie po reveal (prosta
    pętla sprawdzająca w revealed list).
  - `damage_to_any_target: 7` — po reveal, jeśli warunek spełniony,
    7 dmg do dowolnego celu (istniejący `damage` z `requiresTarget:
    any_target`).
  - **Decyzja gracza**: nowa komenda `resolve_reveal_order` (CR
    701.16). Modalny (wymuszenie kolejności) — `pass_priority` nie
    zamyka decyzji.
- **Courage in Crisis (WAR)** {2}{G} Sorcery — **+1/+1 counter na cel
  → proliferate**. Nowy efekt: **`proliferate`** (CR 701.27):
  gracz wybiera DOWOLNĄ liczbę permanentów i/lub graczy z licznikami,
  każdy dostaje dodatkowy licznik każdego typu już obecnego.
  Wymaga:
  - `proliferate` — nowy efekt w `applyEffect`. Kolejka decyzji
    `pendingProliferate` z `targetIds` (permanenty + gracze).
  - `resolve_proliferate_choice` — komenda wyboru (analogicznie do
    `resolve_surveil`).
  - Proliferate to: dla każdego wybranego obiektu/gracza, każdy
    licznik z `count > 0` → `count + 1` (CR 701.27). Obsługa
    `+1/+1` (stwory), `-1/-1` (stwory z infect), liczniki graczy
    (poison) — na razie **+1/+1 na stworach + poison u graczy**
    (pełen zakres: +1/+1, -1/-1, charge, stun, deathtouch marker,
    time,level,ki,etc. — list rozszerzymy jeśli testy wymuszą).
  - **Decyzja**: standardowa (jak `resolve_search_choice` w M30):
    "wybierz 0 lub więcej" + opcja `done` (albo auto-zamknięcie
    po `pass`).
  - Cele: `permanent` (z `counter`) + `player` (z poison) — kandydaci
    z `proliferateCandidates` w `triggers.js`.
- **Wormfang Newt (JUD)** {1}{U} 2/2 Creature — **ETB exile a land
  you control** + **LTB return exiled card under its owner**.
  Nowe mechaniki:
  - `exile_own_land` — cel ETB to własny land. Wymaga
    `requiresTarget: { type: 'land_you_control' }`. Efekt:
    nowy `exile_permanent` z `targetType: 'land'` (jest, ale
    sprawdza `requiresTarget`).
  - **Powiązanie ETB↔LTB**: pairstate — obiekt ma pole
    `exiledByWormfangNewt: cardId` (analogicznie do
    `formerAbilityGrants` w M16). Przy LTB trigger sprawdza
    `formerAbilityGrants` + `exiledByWormfangNewt` (LKI).
  - Powrót: nowy efekt `return_banished_to_battlefield_owner`
    (istnieje `return_banished_to_hand` z Fear of Abduction M50 —
    ten zwraca z exile do ręki; nowy: do battlefield pod kontrolą
    właściciela).
  - **Edge case**: Wormfang Newt exile'uje PRZED śmiercią, więc LTB
    trigger musi pobrać exiledByWormfangNewt z LKI (CR 400.7).
    Mechanika paired LKI (pair: id obiektu-exiledByWormfangNewt).
  - **Tryb „pair"**: scyzoryk na dwóch wormfangach (Crab/Manta) —
    w naszym engine: tylko Newt (10 kart w batchu), bez innych
    wormfangów, więc testy sprawdzą tylko Newt.

## Nowe mechaniki do zaimplementowania w silniku (efekty)

1. **`proliferate`** (CR 701.27) — `src/engine/effects.js`:
   - `applyEffect(state, effect, source, targets)` — effect.type ===
     'proliferate'. Iteruje po `targets` (permanenty + gracze). Dla
     każdego obiektu: przeiteruj liczniki (`object.counters` lub
     `player.counters`), jeśli `count > 0` → `count + 1`. Dla graczy:
     `player.counters.poison` (licznik trucizny). Emituj zdarzenie
     `counter_added` per (object, counter). Pending decision:
     `pendingProliferate` z `targets` wybranymi przez gracza.
   - Dla celów: `triggerTargetCandidates` w triggers.js + nowy
     filtr `proliferate_candidates` (tylko permanenty z licznikami
     + gracze z poison > 0).
2. **`reveal_top_to_bottom_order`** (CR 701.16 + 701.13) — Stomping
   Slabs:
   - Nowa kolejka `pendingRevealOrder` w state (analogicznie do
     `pendingScry`). Reveal: `state.zones.library.slice(-amount)`
     (top). Kolejność gracza: `bottomOrder` (permutation). Kolejność
     walidowana tak, że wszystkie zrevealowane id lądują w `bottomOrder`.
   - Decyzja: komenda `resolve_reveal_order` w game-state.js (jak
     `resolve_surveil`).
   - **Warunek `if_named_in_revealed`**: w `applyEffect` dla tego
     efektu sprawdź, czy któryś z `revealedCardIds` ma
     `name === '<effect.namedCard>'` (Stomping Slabs).
3. **`mill_from_bottom`** (CR 702.13 odwrotnie) — Cellar Door:
   - `state.zones.library[0]` (bottom) → graveyard. Wymaga
     `player` jako target.
   - Efekt `mill_from_bottom: { amount: 1 }` w `applyEffect`. Warunek
     `if_creature_card: true` (jeśli karta jest creature → create_token).
4. **`exile_own_land`** + **`return_banished_to_battlefield_owner`** —
   Wormfang Newt:
   - `exile_permanent: { targetType: 'land', controlledBy: 'controller' }`
     (jest, w M30 Fear of Abduction / M50).
   - **Powiązanie LKI**: `formerExiledBy` na obiekcie
     (analogicznie do `formerAbilityGrants`). Przy LTB trigger
     pobiera z `formerExiledBy` (LKI).
   - `return_banished_to_battlefield_owner`: nowy efekt
     `return_exiled_to_battlefield`. Przyjmuje `exiledCardId` (z
     LKI), umieszcza na battlefield pod kontrolą `object.ownerId`
     (NIE pod kontrolą sourcea).

## Nowe typy celów (do `legalTargetCandidates` / `triggerTargetCandidates`)

1. `creature_with_power_at_least: { min: 5 }` — Selesnya Charm tryb 2.
2. `land_you_control` — Wormfang Newt ETB.
3. `nonland_permanent` — Thistledown Players.
4. `player` (w modalnym upkeep / aktywowanej Cellar Door) — już
   istnieje (`requiresTarget: 'player'` w tryFire/spells), ale
   `legalTargetCandidates` musi obsłużyć to dla aktywowanych
   Cellar Door (sprawdzić implementację).

## Decyzje projektowe

- **PR w N commitach** (zgodnie z AGENTS.md, plan + features + docs):
  1. `plan: Batch 22 — 10 realnych kart (2026-08-08)` (ten plik).
  2. `feat: nowe mechaniki engine: proliferate, reveal_top_to_bottom,
     mill_from_bottom, exile_with_ltb_return` (core + tests).
  3. `feat: Batch 22 — Thistledown Players + Etherwrought Page
     + Stomping Slabs` (3 karty z nowymi mechanikami, 1 token Knight).
  4. `feat: Batch 22 — Courage in Crisis + Selesnya Charm +
     Wormfang Newt` (3 karty z nowymi mechanikami, 1 token Zombie
     re-use).
  5. `feat: Batch 22 — Raise the Alarm + Cellar Door + Healer of
     the Glade + Enter the Enigma` (4 karty, łatwe).
  6. `docs: M52 Batch 22 — 10 realnych kart (HANDOFF 2026-08-08c)`.
  7. `docs: uzupełnienie podsumowania wykonania PLAN_2026-08-08-batch22`.
- **Batch 22 tokenów**: nowy `token_knight` (2/2 biały, vigilance) dla
  Selesnya Charm. Undead Servant Zombie 2/2 B już istnieje
  (`token_zombie`); Cellar Door re-uses tego samego tokena (profil
  identyczny). Deduplikacja: nie dodajemy nowego `token_zombie_cellar`.
- **Karty w istniejących taliach**: decyzja właściciela po przeczytaniu
  handoffa (dodanie do talii `azorius`/`innistrad`/`wiedzmin` zgodnie
  z `artId` i `plan`).
- **Shiva/Mesmerize/M50/M51** + **Etherwrought Page** — wszystkie
  modalne „Choose one" z nazwami trybów (M51 B). Nowe karty modalne
  w batchu (Selesnya Charm tryby: "Boost" / "Exile Big" / "Knight
  Token" — uproszczone skróty, bo pełne nazwy trybów w Oracle są
  puste: "Target creature gets +2/+2..." itd.).
- **Wormfang Newt paired LKI**: w naszym engine obiekt ginie i LTB
  trigger czyta z `formerExiledBy` (LKI). Drugi wormfang (np.
  Crab, Manta) w naszym engine nie istnieje — testy sprawdzą
  tylko Newt.
- **Proliferate scope** (CR 701.27): na razie obsługujemy typowe
  liczniki (`+1/+1`, `-1/-1`, `stun`, `charge`, `poison`). Bardziej
  egzotyczne (time, level, ki,…) zostaną dodane, jeśli batch lub
  testy wymuszą.

## Kryteria ukończenia

- [ ] `npm test` zielone (+ testy każdej karty: legalny i nielegalny
      scenariusz, sanity Scryfall z `fs.readFileSync`, interakcje
      między nowymi mechanikami, np. proliferate + counter EOT).
- [ ] `npm run build` przechodzi (49 modułów).
- [ ] `dist/mtg-table.html` ma nowe moduły silnika.
- [ ] B0 (próbka regresji 528 meczów) — sprawdzenie, że nowe
      mechaniki nie psują istniejących talii (proliferate w WAR
      jest w batchu, ale Courage in Crisis jest first proliferation
      spell w naszym katalogu; sprawdzić, czy istniejące karty
      z `entersWithCounters`/counter EOT nie są zepsute).

## Ryzyka

- **Proliferate interakcja z `-1/-1`**: w engine mamy counter
  delta = +1/+1 - 1/-1 (CR 702.34, 122.3, anihilation). Musimy
  zachować symetrię przy proliferate. Edge case: stwór z
  +1/+1 = 1 i -1/-1 = 1 → effective 0/0 (touched destroy + SBA
  cleanup). Po proliferate: +1/+1 = 2 i -1/-1 = 2 → effective
  0/0 (nadal dies). Test: edge case z Phyrexian Ragerem (ma
  +1/+1 z counter, dies trigger?).
- **Wormfang Newt LKI timing**: obiekt znika z battlefield przy
  LTB. LTB trigger odpala się PRZED usunięciem obiektu (CR
  603.3, 603.4). `formerExiledBy` musi być ustawiony przy exile
  (na obiekcie) i czytelny przy LTB (LKI). Mechanika paired
  obiektów jest złożona — testy na deterministyczność.
- **Stomping Slabs reveal order**: `bottomOrder` musi zawierać
  WSZYSTKIE revealed cardIds (walidacja). Brak → odrzucenie
  komendy. Inwigilacja w CR 401.4 (reorder z wierzchu na spód
  dozwolony).
- **Etherwrought Page upkeep trigger + modal**:
  `trigger.modes` w ability triggera — wzorzec M30 modalnych
  czarów. Upkeep musi respektować `extra.sagaChapter` →
  `upkeep` analogicznie.
- **Raise the Alarm** identyczna z Captain's Call (inna koszt) —
  zduplikowany Soldier token 1/1 (Captain's Call, Call for Aid
  z You're Confronted by Robbers). Re-uses istniejący
  `token_soldier`.

## Poza zakresem

- Batch 23 (następne 10 kart z listy właściciela).
- Inne Wormfangi (Crab, Manta, Turtle, Drake, Behemoth).
- Inne proliferate spell (tamiyo's compleation, contentious plan).
- Inne „reveal top to bottom" (Jace's Ingenuity, Merfolk Looter).
- Różne inne „two landcycling" / „creature with power at least N"
  karty (Quirion Ranger, Blanchwood Armor, itd.).

## Podsumowanie wykonania (do wypełnienia po commicie 7)

(sekcja do wypełnienia po zakończeniu pracy — wg AGENTS.md, „etap
zamknięcia sesji")

---

## Podsumowanie wykonania (commit 6 — 2026-08-08)

**Status:** 6/6 commitów w PR #34 DONE i PUSHED.

### Commity

1. `6401cec` **plan: Batch 22 — 10 realnych kart (2026-08-08)** — `docs/plans/PLAN_2026-08-08-batch22-cards.md` (253 linii).
2. `b8c43a8` **feat: nowe mechaniki engine dla Batch 22** (`proliferate`, `reveal_top_to_bottom_order`, `mill_from_bottom`, `return_exiled_to_battlefield`, modal trigger, nowe typy celów).
3. `b51f3f2` **feat(B22): Thistledown Players, Etherwrought Page, Stomping Slabs** (commit 3/5 — pierwsza trójka) + token `token_knight`.
4. `f786955` **fix(B22): napraw testy Stomping Slabs (3 bugi silnika)** — literówka `pendingDamageTargets`→`pendingDamageTarget`, parametr `name` w `addObject`, filtr tokenów `cardId.startsWith('token_')`.
5. `870be87` **feat(B22): Courage in Crisis, Selesnya Charm, Wormfang Newt** (commit 4/5 — druga trójka).
6. `1baa3a7` **feat(B22): Raise the Alarm, Cellar Door, Healer of the Glade, Enter the Enigma** (commit 5/5 — czwarta trójka).
7. `docs` (ten commit) **docs: M52 — Batch 22 w ENGINE_MILESTONES/PROJECT_STATE/ROADMAP + Handoff 2026-08-08c** — do wykonania w sesji.

### Mechaniki engine (po `b8c43a8` + `f786955`)

- 4 nowe efekty w `effects.js`: `proliferate`, `mill_from_bottom`, `return_exiled_to_battlefield`, `reveal_top_to_bottom_order`; + `exile_own_land` (Wormfang).
- 4 nowe kolejki pending w `game-state.js`: `pendingProliferate`, `pendingRevealOrder`, `pendingDamageTarget` (naprawiona literówka), `pendingModalTrigger`.
- 4 nowe komendy `resolve_*`: `resolve_proliferate`, `resolve_reveal_order`, `resolve_damage_target`, `resolve_modal_choice`.
- 11 nowych zdarzeń w `protocol/types.js` (z tłumaczeniami PL w `session.js`).
- Nowe typy celów w `triggerTargetCandidates`: `creature_with_power_at_least {min:5}`, `nonland_permanent`, `land_you_control`.
- Nowa gałąź `tryFire` dla `trigger.modes` → `pendingModalTrigger` (Etherwrought Page).
- Cykl `spells.js → effects.js → spells.js` rozwiązany (`export legalTargetCandidates` + inline enumeracja 'any target' w effects.js).
- LKI stub: `formerExiledBy` na obiekcie (Wormfang) — `moveObjectDirectly` pamięta exile.

### Karty (10/10 DONE)

| Karta | Set | Mechanika | Komenda resolve |
|---|---|---|---|
| Thistledown Players | BLB | T2 (attacks + untap nonland) | trigger auto |
| Etherwrought Page | ARB | upkeep trigger + 3 tryby modalne | `resolve_modal_choice` |
| Stomping Slabs | MOR | reveal top 7 + reorder bottom + named damage | `resolve_reveal_order` + `resolve_damage_target` |
| Courage in Crisis | WAR | +1/+1 + proliferate | `resolve_proliferate` |
| Selesnya Charm | RTR | 3 tryby (pump+trample / exile ≥5 / 2/2 Knight) | trigger auto |
| Wormfang Newt | JUD | ETB exile own land / LTB return | trigger auto |
| Raise the Alarm | CMR | 2× token Soldier | trigger auto |
| Cellar Door | ISD | {3},{T} mill_from_bottom + conditional Zombie | trigger auto |
| Healer of the Glade | M20 | ETB gain 3 life | trigger auto |
| Enter the Enigma | DSK | cant_be_blocked + draw 1 | trigger auto |

### Tokeny (1 nowy + 2 re-use)

- `token_knight` — 2/2 biały Knight vigilance (Selesnya Charm tryb 3).
- `token_soldier` — re-use z Captain's Call (Raise the Alarm).
- `token_zombie` — re-use z Undead Servant (Cellar Door conditional).

### Testy (12 nowych + 4 engine + 5 fix)

- `test/engine-batch22.test.js` (4): nowe efekty + kolejki pending.
- `test/real-cards-batch22-first.test.js` (4): Thistledown, Etherwrought (3 tryby), Stomping x2.
- `test/real-cards-batch22-second.test.js` (4): Courage, Selesnya Pump+Token, Wormfang; helper `resolveStack`.
- `test/real-cards-batch22-third.test.js` (4): Raise, Cellar, Healer, Enter.
- `test/art-ids-tool.test.js`: `withArt.length === 148`.

### Bugfixy w `f786955`

1. `effects.js`: literówka `pendingDamageTargets` (z 's') → `pendingDamageTarget` (game-state.js kolejka bez 's').
2. `identity.js`: dodany parametr `name` (przekazywany przez addObject do testów z named cards w bibliotece).
3. `game-state.js`: filtr tokenów poza bitwiskiem (CR 704.5d) — zmiana `o.name != null` na `o.cardId.startsWith('token_')`.

### Stan projektu

- 1059/1059 testów zielonych.
- `npm run build`: 49 modułów / 1123.8 kB.
- 148 realnych kart (Batche 1–22).
- 10 plików Scryfall w `docs/cards/scryfall-*.json`.
- `tools/collection-art-ids.csv` ma pełne dane (artId + plan) dla wszystkich 10 kart.
- **B0 zmierzony 2026-08-08**: 9 talii, 50 seedów, 13 500 meczów, **0 niedokończonych** — heuristic **90.4% vs random**, **61.8% vs aggro**, aggro **95.5% vs random**. Progi `0.78 / 0.57` utrzymane (+0.1 p.p. na obu parach z aggro vs M51, „tylko w górę" zasada B0). Czas 856.7 s.
- PR #34: https://github.com/jurekjurekgh/mtg/pull/34

### Co dalej (Batch 23+)

- Benchmark B0 (pełna macierz) — ZMIERZONY 2026-08-08 (9 talii / 50 seedów / 13 500 meczów, 0 niedokończonych, +0.1 p.p. vs M51 na obu parach z aggro).
- Aktualizacja opisu PR #34 z listą wszystkich commitów — w tej sesji.
- Handoff `HANDOFF_2026-08-08c.md` — w commicie 6 (ten commit).
- Batch 23 czeka na listę właściciela (następna sesja).
