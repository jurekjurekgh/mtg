# PLAN 2026-08-08 — Batch 24: 10 realnych kart (kolejka właściciela)

- **Data:** 2026-08-08
- **Sesja:** `arena/019fe265-mtg` (PR #36 — kontynuacja: M54 + odznaka + ten batch)
- **Karty (sety wg listy właściciela):**
  1. Faceless Butcher (TOR) {2}{B}{B} 2/3 — ETB exile other creature, LTB return
  2. Unbreakable Bond (IKO) {4}{B} Sorcery — reanimacja z lifelink counter
  3. Spinewoods Paladin (OTJ) {4}{G} 5/4 Trample — ETB gain 3 life, **Plot {3}{G}**
  4. Tome Scour (M11) {U} Sorcery — target player mills 5
  5. Goblin Battle Jester (M13) {3}{R} 2/2 — red spell → target creature can't block
  6. Brawler's Plate (M15) {3} Equipment — +2/+2 trample, Equip {4}
  7. Glitch Ghost Surveyor (DFT) {2}{U} 2/2 Flying — **Start your engines! / Max speed** {3}, exile from grave: draw
  8. Mystic Sanctuary (ELD) Land — Island, enters tapped unless 3+ Islands, ETB untapped → instant/sorcery z grobu na wierzch
  9. Willbender (DD2) {1}{U} 1/2 — **Morph {1}{U}**, face up → **change target** of spell
  10. Scion Summoner (OGW) {2}{G} 2/2 Devoid — ETB token Eldrazi Scion (sacrifice: Add {C})

- **Procedura:** ADR 0010 §2a — Scryfall pobrane PRZED kodowaniem **z parametrem
  set=** (lekcja z M54: poprzedni batch pobrał po nazwie i wyszły złe wydruki).
  artId/plan ze słownika `tools/collection-art-ids.csv` (313/446/277/69/312/16/104/4/243/473).

## Nowe mechaniki silnika

1. **Plot dla PERMANENTÓW (Spinewoods Paladin — pierwsza karta z plotem w katalogu).**
   Dotychczas plot tylko dla `kind === 'spell'` (plotCard + requireSpell). Rozszerzyć:
   plotCard (creature/artifact/enchantment), castPermanent z exile+plotted (koszt 0),
   oferta cast_permanent z exile w legalCommands, kolorowa walidacja kosztu plot
   (`plot.colors` — {3}{G}).
2. **Linked exile stwora (Faceless Butcher).** Nowy efekt `exile_target_creature`
   (jak exile_own_land, ale DOWOLNY stwór poza źródłem) zapisujący exiledCardIds;
   LTB przez istniejący `return_exiled_to_battlefield` (czyta exiledCardIds/LKI).
   Cel: requiresTarget `{ type: 'creature' }` — candidates już wykluczają źródło.
3. **Lifelink counter (Unbreakable Bond).** `return_permanent_from_graveyard`
   rozszerzony o `counters` (ogólnie: wejście z licznikami); effectiveKeywords
   dodaje keyword z licznika `lifelink` (CR 122.1b — wzorzec licznika deathtouch).
   Cel: `creature_card_in_graveyard` (własny grób, wzorzec Grave Exchange).
4. **Speed / Start your engines! / Max speed (Glitch Ghost Surveyor).**
   `player.speed` (0), efekt `start_engines` (ETB → speed = max(1, speed)),
   wzrost speed raz na turę aktywnych graczy przy obrażeniach przeciwnika
   (scan damage_dealt, max 4), warunek zdolności `condition.maxSpeed` w
   legalActivatedAbilities + activateAbility, reset flagi na starcie tury.
   Zdolność z grobu: `fromGraveyard` + `cost.exileFromGraveyard` (wzorzec
   Goldmeadow Nomad).
5. **Trigger „turned face up" (Willbender).** `turnFaceUp` emituje nowy event
   `turned_face_up`; skan w triggers.js odpala triggery o tym evencie na
   obiekcie. Cel triggera: `spell_with_single_target_on_stack` (nowy kandydat
   w triggerTargetCandidates: obiekt na stosie z chosenTargets.length === 1).
6. **Redirect celu (Willbender).** Nowy efekt `redirect_spell_target` kolejkuje
   `pendingRedirectChoice` (jak pendingDamageTarget): kandydaci = legalne cele
   specyfikacji celu czaru (minus obecny), resolve_redirect_choice podmienia
   chosenTargets[0] obiektu na stosie. **Ograniczenie:** tylko CZARY na stosie
   (engine rozstrzyga zdolności natychmiast — brak zdolności na stosie, więc
   redirect zdolności nieobsługiwany; dokumentacja).
7. **Mystic Sanctuary.** `entersTappedCondition` nowy typ `islands_you_control_at_least`
   (count podtypów Island na bitwisku — wchodzący land jeszcze nie jest na
   bitwisku, więc liczone są „inne"). Trigger ETB landa z warunkiem
   `enteredUntapped` (eventData.tapped z permanent_entered_battlefield) +
   nowy kandydat `instant_or_sorcery_card_in_graveyard` (controlledBy controller,
   optional) + nowy efekt `put_graveyard_card_on_top` (na wierzch = przed
   pierwszą własną kartą, jak graveyard_top_choice).
8. **Goblin Battle Jester.** Gałąź `when_you_cast_spell` w triggers.js przechodzi
   na `tryFire(state, ability, source, [], events, ev)` — obsłuży warunek
   `spellColorsInclude` + requiresTarget (cel stwora, decyzja resolve_trigger_target).
   Efekt `cant_block` istnieje.
9. **Tome Scour / Brawler's Plate / Scion Summoner.** Istniejące mechaniki:
   mill_cards (cel-gracz), equipment (pump+keyword, wzorzec Cloak of the Bat),
   create_token z abilities (wzorzec Marut — token Eldrazi Scion z kosztem
   `sacrificeSelf` i efektem add_mana).

## Commity

1. `plan: Batch 24 — 10 realnych kart (2026-08-08)`
2. `feat(engine): mechaniki Batch 24 — plot dla permanentów, linked exile stwora, lifelink counter, speed, turned_face_up + redirect celu, sanctuary lands`
3. `feat(B24): Faceless Butcher, Unbreakable Bond, Spinewoods Paladin, Tome Scour, Goblin Battle Jester (5/10)`
4. `feat(B24): Brawler's Plate, Glitch Ghost Surveyor, Mystic Sanctuary, Willbender, Scion Summoner (10/10)`
5. `feat(decks): karty Batch 24 w taliach + docs M55`

## Weryfikacja

- Scryfall: 10 plików w docs/cards/ (pobrane z set=), test zgodności nazw/cmc.
- Testy: engine-batch24 + real-cards-batch24-* + art-ids 158→168 + strażnik talii.
- `npm test` zielone, `npm run build` 49 modułów; B0: boty deterministyczne —
  próbka regresji (4 seedy) z testu bot-benchmark bez spadków.

## Ryzyka / pułapki

- Plot: nie zepsuć istniejących czarów z plotem (ŻADEN nie istnieje — czysto
  nowa ścieżka dla permanentów; zachować kind-spell dla ewentualnych przyszłych).
- Redirect: czar na stosie musi CZEKAĆ na decyzję (bramka jak damage_target);
  źródło triggera (Willbender) może zniknąć przed rozstrzygnięciem — LKI stub.
- Speed: wzrost raz na turę — flagi per gracz resetowane na starcie tury.
- `edit_file` psuje polskie znaki → python3.
