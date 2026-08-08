# PLAN 2026-08-08 — Batch 23: 10 realnych kart (kolejka właściciela)

- **Data:** 2026-08-08
- **Sesja:** `arena/019fe1c3-mtg` (PR #35 — fix B23 UI + ten batch → PR #35 ciąg dalszy, 1 sesja = 1 PR)
- **Karty:** Vandalize (DTK), Expunge (USG), Shiv's Embrace (M11/M14), Deepwood Denizen (MH2), Welder Automaton (AER/GNT), Feedback (5ED), Vow of Wildness (CMR), Greater Tanuki (NEO/DSC), Scorch Spitter (M20), Turn the Tide (MBS/CNS).
- **Procedura:** ADR 0010 §2a — dane Scryfall pobrane PRZED kodowaniem (10 plików `docs/cards/scryfall-*.json`), artId + plan ze słownika `tools/collection-art-ids.csv` (uzupełnione ręcznie, jeśli brak).

## Mechaniki i stopień trudności

### Łatwe (istniejące mechaniki)
- **Welder Automaton (AER)** {2} 2/1 — `{3}{R}: 1 damage to each opponent` — czysta aktywowana zdolność bez celu (`damage_each_opponent:1`), wzorzec `Thermo-Alchemist` / `Fiery Inscription`. Bez nowego typu celu.
- **Scorch Spitter (M20)** {R} 1/1 — trigger `attacks` → `damage` 1 do gracza/planeswalkera atakowanego. Wzorzec `Zoraline` (`attacks` trigger), ale cel to `defending_player` (specjalny). Rozszerzenie triggera `attacks` o efekt `damage_to_defending_player`.
- **Turn the Tide (MBS)** {1}{U} Instant — `Creatures your opponents control get -2/-0 until EOT`. Istniejący efekt `pump` z ujemnym `power` na wielu celach. Wymaga nowego typu celu `creature_opponent_controls` + efekt `pump_all` (lub iteracja po `legalTargetCandidates` dla masowego pump).
- **Greater Tanuki (NEO)** {4}{G}{G} 6/5 Trample — `Channel — {2}{G}, Discard this card: Search library for basic land, put tapped, shuffle`. Wzorzec `Cycling` (discard + draw) + `search_library_to_battlefield` (istnieje dla `Caravan Vigil` itp.). Channel to discard z ręki jako koszt aktywowanej? W karcie Channel to zdolność z ręki (jak cycling), nie z bitwiska. Wymaga nowej komendy `channel` lub re-use `cycling` z dodatkowym efektem search (analogicznie do `Cycling` → `search`). Najprościej: zdolność `activated` z strefy `hand` (jak `cycling`), koszt `{2}{G}` + `discardCard`.

### Umiarkowane (nowe typy celów / drobne nowe efekty)
- **Expunge (USG)** {2}{B} Instant — `Destroy target nonartifact, nonblack creature. It can't be regenerated. Cycling {2}`. Nowy filtr celu `nonartifact_nonblack_creature` (kombinacja dwóch warunków) + efekt `cant_be_regenerated_this_turn` przed `destroy` (wzorzec `Rage of Purphoros`). Cycling już istnieje (generic).
- **Shiv's Embrace (M11)** {2}{R}{R} Aura — `Enchant creature`, `+2/+2 flying`, `{R}: +1/+0 until EOT` na enchanted creature. Wzorzec `Selesnya Charm` pump + aura typu `Aura`. Efekt `grant_keywords` + `pump` na `attachedTo`, plus aktywowana zdolność aury `{R}` z efektem `pump` na `enchanted_creature`. Wymaga `aura` + `activated` na aurze.
- **Vow of Wildness (CMR)** {2}{G} Aura — `+3/+3 trample, can't attack you or planeswalkers you control`. Aura + `static` restriction. Wzorzec `Vow` — nowy efekt `cant_attack_player` (sprawdzać w `declareAttackers` legalności).
- **Feedback (5ED)** {2}{U} Aura — `Enchant enchantment`, `At beginning of upkeep of enchanted enchantment's controller, deals 1 damage`. Aura cel `enchantment` (nowy typ celu `enchantment`) + upkeep trigger `enchanted_controller_upkeep` z efektem `damage_to_enchanted_controller`.

### Trudne (nowe efekty silnika)
- **Vandalize (DTK)** {4}{R} Sorcery — `Choose one or both — Destroy artifact, Destroy land`. Modal „choose one or both” = 3 warianty (artifact / land / both). Wymaga rozszerzenia `spell.modes` o semantykę „one or both” (wybór 1 lub 2 celów). Proponowane uproszczenie: 3 tryby `Artifact`, `Land`, `Both` (każdy z własnymi celami i efektami `destroy`). 100% pokrycia Oracle (gracz może wybrać każdy legalny podzbiór), implementacja generyczna bez nowego typu komendy — re-use `cast_spell` z `modeIndex`.
- **Deepwood Denizen (MH2)** {2}{G} 3/2 Vigilance — `{5}{G},{T}: Draw a card. This ability costs {1} less for each +1/+1 counter on creatures you control`. Nowa redukcja kosztu zdolności aktywowanej. Wymaga `ability.costReduction` w `abilities.js` (analogicznie do `effectiveSpellManaCost`): `costReduction: { perCounter: '+1/+1', amount: 1 }` + funkcja `effectiveAbilityManaCost(state, source, ability)`.
- **Greater Tanuki channel** — jak wyżej, ale trudne bo Channel to zdolność z ręki, nie z bitwiska; wymaga bramki `channel_unresolved` lub re-use `cycling` z efektem `search_library_to_battlefield_tapped`.

## Nowe mechaniki do zaimplementowania w silniku (efekty)

1. **`damage_to_defending_player`** — Scorch Spitter: `attacks` trigger → `damage` 1 do `defendingPlayer` (pobierany z `state.combat.defendingPlayerId`).
2. **`pump_opponents_creatures`** — Turn the Tide: `pump` z filtrem `opponent` i `power:-2` na wszystkich legalnych.
3. **`nonartifact_nonblack_creature`** — Expunge: kombinacja `type: 'creature' && !artifact && !black`.
4. **`enchantment` target** — Feedback: `enchantment` na bitwisku.
5. **`enchanted_controller_upkeep` trigger** — Feedback: `upkeep` z warunkiem `enchanted`.
6. **`cant_attack_player`** — Vow of Wildness: static `cantAttack: { playerId: 'you' }` sprawdzane w `legalAttackerOptions`.
7. **`cost_reduction_per_counter` na ability** — Deepwood Denizen.
8. **`channel_search_basic_land`** — Greater Tanuki: `search_library_to_battlefield_tapped` z `qualifier: { subtypes: ['Plains','Island','Swamp','Mountain','Forest'], supertypes: ['Basic'] }` (basic land).
9. **`choose_one_or_both`** — Vandalize: 3 modes.

## Nowe typy celów (do `legalTargetCandidates` / `triggerTargetCandidates`)

1. `nonartifact_nonblack_creature`
2. `artifact`
3. `land`
4. `enchantment`
5. `creature_opponent_controls`
6. `enchanted_creature` (dla Shiv's Embrace pump)
7. `defending_player` (Scorch Spitter)

## Decyzje projektowe

- **PR w N commitach** (plan + engine + 3× feat + docs):
  1. `plan: Batch 23 — 10 realnych kart (2026-08-08)` (ten plik)
  2. `feat: nowe mechaniki engine dla Batch 23` (cost reduction, cant_attack, enchantment target, pump mass, etc.)
  3. `feat(B23): Vandalize, Expunge, Shiv's Embrace` (3 karty trudne/umiarkowane)
  4. `feat(B23): Deepwood Denizen, Welder Automaton, Feedback` (3 karty)
  5. `feat(B23): Vow of Wildness, Greater Tanuki, Scorch Spitter, Turn the Tide` (4 karty łatwe/umiarkowane)
  6. `docs: M53 Batch 23 — 10 realnych kart (HANDOFF)`
- **Tokeny:** brak nowych tokenów (wszystkie efekty to destroy/pump/search/aura). Re-use istniejących.
- **Karty w taliach:** decyzja właściciela (dodać np. Scorch Spitter do talii aggro, Turn the Tide do kontroli).
- **Vandalize one-or-both:** 3 tryby jako świadome uproszczenie Oracle (100% pokrycia wyborów gracza, bot deterministycznie wybiera pierwszy legalny).
- **Deepwood Denizen:** redukcja kosztu do 0 (nie poniżej), liczona dynamicznie w `legalActivatedAbilities` i walidacji.

## Weryfikacja

- Scryfall JSON: 10 plików w `docs/cards/` (pobrane 2026-08-08 via fetch_page).
- Testy: `engine-batch23` + 3× `real-cards-batch23-*` (legalne/nielegalne), `art-ids-tool` (158? 148+10).
- Benchmark B0 po batchu: `node tools/benchmark.mjs` (tylko w górę).
