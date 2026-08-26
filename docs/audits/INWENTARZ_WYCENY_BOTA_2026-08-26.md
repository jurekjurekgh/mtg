# Inwentaryzacja wyceny bota — 2026-08-26 (M218/5)

Zlecenie właściciela: rygorystyczny przegląd heurystyki wg grup czarów/zdolności.
Baza: 169 typów `effect.type` w `effects.js` (zmierzone 2026-08-26: 174), bot ma bezpośrednie wzmianki o 78.
Po naprawach M218/1-4: +5 typów (flying/reach/FS/DT/trample meaningfulness, regenerate, scry/surveil w czarach).

## Legenda

- **bezpośrednio** — `scoreCommand` ma gałąź `effect.type === 'xxx'` w `cast_spell` lub `activate_ability`
- **resolve_*** — decyzja blokująca (`resolve_xxx`) wyceniana w osobnym case (np. scry, surveil, search)
- **pośrednio** — efekt nie ma własnej gałęzi, ale jego skutek jest w klamrach (`allEffectsInertNow`, `selfHarmPenalty`, `friendlyMisaimPenalty`, `tapTargetValue`, `pumpChangesOutcome`, `keywordGrantWindowValue`, `isCreatureThreatened`, `evalView`)
- **nie dotyczy** — koszt, wewnętrzny, replacement, trigger automatyczny (nie wybór bota)
- **LUKA** — brak wyceny, bot gra losowo / remis wariantów = pierwsza oferta

## Typy z `src/engine/effects.js` (174)

| typ | spell | ability | trigger | wycena bota | uwagi |
|---|---|---|---|---|---|
| add_counter | tak | tak | tak | bezpośrednio |  |
| add_flying_counter_to_face_down_you_control |  |  | tak | LUKA mała | morph z flying counter — jak grant flying, ale przez licznik; nie krytyczne |
| add_mana |  | tak |  | bezpośrednio |  |
| amass | tak |  | tak | bezpośrednio |  |
| animate_linked |  |  | tak | nie dotyczy | animacja linkowana — trigger automatyczny |
| animate_permanent_until_end_of_turn |  | tak |  | pośrednio | IDEMPOTENT_EOT, nie dublowane |
| apply_to_each_target | tak |  |  | bezpośrednio | Wrap in Flames — wycena per cel |
| attach_equipment_to_source |  | tak |  | pośrednio |  |
| attach_self_to_target |  |  | tak | nie dotyczy | ETB attach equipment — automat |
| attacker_gains_control_and_untaps |  |  | tak | bezpośrednio |  |
| become_basic_land_type |  | tak |  | bezpośrednio |  |
| becomes_subtype_until_end_of_turn |  | tak |  | pośrednio | IDEMPOTENT |
| bounce_permanent | tak |  | tak | pośrednio | HOSTILE_PERMANENT |
| bounce_to_library_bottom | tak |  |  | pośrednio |  |
| bounce_to_library_top | tak |  |  | pośrednio |  |
| buff_creature_until_end_of_turn |  |  | tak | nie dotyczy | trigger Exalted-like (Altar of the Goyf) — automatyczny pump, wpływa na evalView |
| buff_creatures_you_control | tak |  | tak | bezpośrednio | mass buff — M218/1-2 |
| buff_land_creatures |  |  | tak | pośrednio |  |
| buff_opponents_creatures | tak |  |  | bezpośrednio | mass debuff — M218/1-2 |
| cant_be_blocked | tak | tak |  | bezpośrednio |  |
| cant_be_regenerated_this_turn | tak |  | tak | nie dotyczy | rider do destroy — replacement, nie wybór |
| cant_block |  | tak | tak | pośrednio | IDEMPOTENT |
| clash | tak |  |  | resolve_* | resolve_clash_choice |
| cloak |  |  | tak | nie dotyczy | manifest — trigger |
| conditional | tak |  | tak | nie dotyczy | wrapper if — wewnętrzny |
| control_to_owners_all_creatures |  |  | tak | nie dotyczy | Homeward Path — trigger automatyczny |
| copy_creature |  |  |  | nie dotyczy | nieużywane? |
| counter_spell | tak |  |  | pośrednio |  |
| counter_spell_unless_pays | tak |  |  | pośrednio |  |
| craft_transform |  | tak |  | resolve_* | resolve_craft_exile |
| create_copy_token |  | tak |  | pośrednio |  |
| create_token | tak | tak | tak | bezpośrednio |  |
| creatures_cant_block_this_turn | tak |  |  | bezpośrednio |  |
| damage | tak | tak | tak | bezpośrednio |  |
| damage_creatures_with_keyword | tak |  |  | bezpośrednio |  |
| damage_defending_player |  |  | tak | pośrednio | trigger attacks — drainOnAttack w declare_attackers |
| damage_divided |  |  | tak | resolve_* | resolve_damage_division (Inferno Titan) |
| damage_each_opponent | tak | tak | tak | bezpośrednio |  |
| damage_enchanted_permanent_controller |  |  | tak | nie dotyczy | aura trigger na kontrolera — nie wybór |
| damage_enchanted_player |  |  | tak | nie dotyczy | Curse — trigger automatyczny |
| damage_from_enchanted_power |  |  | tak | nie dotyczy | trigger — automat |
| damage_from_target_power | tak |  |  | bezpośrednio |  |
| damage_to_controller |  |  | tak | pośrednio | ETB self-damage — castSacrificePenalty |
| destroy_artifact_gain_life_mana_value | tak |  |  | pośrednio | HOSTILE |
| destroy_equipment_attached | tak |  |  | nie dotyczy | trigger przy zniszczeniu — automat |
| destroy_if_least_power | tak |  |  | pośrednio |  |
| destroy_pair_if_same_colors | tak |  |  | bezpośrednio | Dead Ringers |
| destroy_permanent | tak | tak | tak | bezpośrednio |  |
| detain |  |  | tak | nie dotyczy | Azorius Justiciar — trigger ETB, automat |
| discard_cards | tak | tak | tak | pośrednio | HOSTILE_PLAYER |
| discard_each_opponent |  |  | tak | pośrednio |  |
| discover |  |  | tak | resolve_* | resolve_discover_choice |
| dont_untap_next_untap_step | tak |  | tak | bezpośrednio |  |
| draw_cards | tak | tak | tak | bezpośrednio |  |
| draw_cards_both_players | tak |  |  | bezpośrednio |  |
| draw_then_discard |  | tak | tak | LUKA mała | loot — draw + discard w jednym efekcie, brak kary za discard w tej gałęzi |
| each_player_exiles_top_face_down |  | tak |  | bezpośrednio | Pyxis |
| each_player_loses_life_fraction |  |  | tak | nie dotyczy | Dire Fleet Ravager — ETB automat |
| endure_x |  | tak | tak | resolve_* | resolve_endure_choice |
| epic_experiment | tak |  |  | LUKA średnia | Epic Experiment — exile top X, cast — brak wyceny X i darmowych rzutów |
| exalted_pump |  |  | tak | nie dotyczy | Exalted — trigger attacks alone, automat |
| exile_all | tak |  |  | pośrednio |  |
| exile_if_dies_this_turn | tak |  |  | pośrednio |  |
| exile_nonland_permanent_linked |  |  | tak | nie dotyczy | trigger — automat |
| exile_object |  |  |  | nie dotyczy | wewnętrzny — usuwanie tokenu poza battlefield |
| exile_opponent_creature |  |  | tak | nie dotyczy | trigger — automat |
| exile_own_land |  |  | tak | nie dotyczy | trigger — automat |
| exile_permanent | tak |  | tak | pośrednio | HOSTILE |
| exile_return_transformed |  | tak |  | nie dotyczy | flicker — automat |
| exile_target_creature |  |  | tak | pośrednio |  |
| exile_top_playable_until_next_turn |  |  | tak | nie dotyczy | Etali-like — trigger |
| explore |  | tak |  | resolve_* | resolve_explore_choice + DECK_ARRANGING |
| fabricate |  |  | tak | resolve_* | resolve_fabricate |
| ferocious_draw_discard | tak |  |  | LUKA mała | jak draw_then_discard z warunkiem ferocious |
| fertile_thicket_reveal |  |  | tak | resolve_* | resolve_fertile_thicket |
| fight | tak |  |  | bezpośrednio |  |
| gain_control_until_end_of_turn | tak |  |  | bezpośrednio |  |
| gain_life | tak | tak | tak | bezpośrednio |  |
| gain_life_if_target_dies_this_turn | tak |  |  | bezpośrednio | Time to Feed rider |
| gain_life_target |  | tak |  | bezpośrednio |  |
| goad |  |  |  | nie dotyczy | efekt goad — nie wybór bota |
| grant_abilities | tak |  |  | LUKA mała | nadanie zdolności — nie keyword, brak okna |
| grant_double_strike_on_noncreature_cast_this_turn |  |  |  | nie dotyczy | trigger — automat |
| grant_keywords_until_end_of_turn | tak | tak | tak | bezpośrednio | M218/3 — flying/reach/FS/DT/trample |
| grant_protection_until_end_of_turn | tak |  |  | bezpośrednio |  |
| graveyard_card_to_library_top_choice |  | tak |  | bezpośrednio | Sequestered Stash — resolve |
| graveyard_creatures_to_library_top_choice | tak |  |  | resolve_* | Forever Young — resolve_graveyard_top_choice |
| incubate |  |  | tak | nie dotyczy | Phyrexia — tworzy Incubator, automat |
| index_look | tak |  |  | LUKA mała | Index — look top 5, deck arranging, brak okna w cast_spell (jak scry przed M218/4) |
| investigate |  | tak |  | LUKA mała | Clue token — nie create_token, brak wyceny |
| job_select |  |  | tak | nie dotyczy | Final Fantasy job — trigger |
| living_weapon |  |  | tak | nie dotyczy | trigger — tworzy Germ + attach, automat |
| lock_untap |  | tak | tak | bezpośrednio |  |
| look_top_put_one_hand_rest_bottom |  | tak |  | resolve_* | Satyr Wayfinder — resolve_satyr_look_choice |
| look_top_put_one_hand_rest_grave |  |  | tak | resolve_* | resolve_look_top_choice |
| lose_life | tak |  | tak | bezpośrednio |  |
| lose_life_enchanted_permanent_controller |  |  | tak | bezpośrednio | Clawing Torment |
| mill_both_players |  | tak |  | bezpośrednio | Ghoulcaller's Bell — wyścig bibliotek |
| mill_cards | tak | tak | tak | bezpośrednio |  |
| mill_from_bottom |  | tak |  | bezpośrednio |  |
| next_spell_discount |  |  |  | nie dotyczy | cost reduction — nie efekt |
| opponent_hand_card_to_top |  |  | tak | nie dotyczy | trigger — automat |
| opponents_lose_life_if_poison | tak |  |  | nie dotyczy | trigger — automat? |
| owner_library_top_or_bottom | tak |  |  | pośrednio | Vanish from Sight — resolve_library_placement |
| pay_life |  |  | tak | nie dotyczy | koszt — phyrexian |
| pay_mana |  |  | tak | nie dotyczy | koszt |
| pay_x_cast_from_graveyard |  |  | tak | nie dotyczy | cost — escape/flashback |
| player_sacrifices_creature | tak |  |  | bezpośrednio | Grave Exchange — cel gracz |
| prevent_combat_damage_except_enchanted | tak |  |  | bezpośrednio | fog — Inspire Awe |
| prevent_damage_this_turn |  |  | tak | pośrednio | prewencja — shield |
| prevent_next_damage | tak |  |  | bezpośrednio | Withstand — tarcza |
| proliferate | tak |  |  | nie dotyczy | proliferate — nie wybór celu? |
| pump | tak | tak | tak | bezpośrednio | M218/1-2 — okna + meaningfulness |
| pump_by_creature_count | tak |  |  | bezpośrednio | Might of the Masses |
| pump_by_gates |  | tak |  | bezpośrednio | Basilisk Gate |
| pump_enchanted_creature |  | tak |  | bezpośrednio | firebreathing — M218/1-2 |
| pump_food_result |  |  |  | nie dotyczy | wewnętrzny wynik Food choice |
| put_graveyard_card_on_bottom |  | tak |  | resolve_* |  |
| put_graveyard_card_on_top |  |  | tak | nie dotyczy | trigger — automat |
| put_graveyard_card_onto_battlefield |  |  | tak | nie dotyczy | reanimacja — automat |
| put_multicolored_creature_from_hand |  | tak |  | pośrednio | allEffectsInertNow |
| reanimate_under_your_control |  |  | tak | pośrednio |  |
| redirect_spell_target |  |  | tak | nie dotyczy | trigger — wybór celu? |
| regenerate |  | tak |  | bezpośrednio | M218/4 — isCreatureThreatened |
| remove_counter |  |  | tak | nie dotyczy | koszt — removeCounter |
| return_banished_to_hand |  |  | tak | nie dotyczy | trigger — automat |
| return_card_from_graveyard_to_hand |  |  | tak | nie dotyczy | trigger — automat |
| return_creature_card_to_hand | tak |  |  | nie dotyczy | bounce do ręki właściciela — automat? |
| return_exiled_to_battlefield |  |  | tak | nie dotyczy | trigger — automat |
| return_permanent_from_graveyard | tak |  | tak | bezpośrednio | Unbreakable Bond |
| return_source_from_graveyard_to_hand |  |  | tak | nie dotyczy | trigger — automat |
| return_to_battlefield_tapped |  | tak |  | pośrednio |  |
| return_to_battlefield_under_control_at_upkeep |  | tak |  | bezpośrednio |  |
| return_with_counter |  |  | tak | nie dotyczy | persist — replacement |
| reveal_hand_choose_discard | tak |  |  | pośrednio |  |
| reveal_hand_choose_exile | tak |  |  | pośrednio |  |
| reveal_subtype_deal_damage |  |  |  | nie dotyczy |  |
| reveal_top_pick_land_rest_grave |  |  | tak | resolve_* | resolve_look_top_choice |
| reveal_top_put_creature |  |  |  | nie dotyczy | Undercity Throne — automat |
| reveal_top_to_bottom_order | tak |  |  | resolve_* |  |
| sacrifice_each_other_creature |  |  | tak | nie dotyczy | trigger — automat |
| sacrifice_food_choice | tak |  |  | resolve_* | resolve_food_choice |
| sacrifice_permanent |  |  | tak | resolve_* | resolve_sacrifice_choice |
| sacrifice_self_if_counters_then_treasure |  | tak |  | bezpośrednio |  |
| scry | tak | tak | tak | bezpośrednio | M218/4 — okna instant/sorcery |
| search_basic_land_morbid | tak |  |  | resolve_* | search_choice |
| search_library_to_battlefield |  | tak | tak | resolve_* | search_choice |
| search_library_to_hand | tak | tak | tak | resolve_* | search_choice |
| search_library_two_cards_hand_and_grave | tak |  |  | resolve_* | search_choice |
| set_base_pt_until_end_of_turn |  |  | tak | pośrednio |  |
| set_saddled |  | tak |  | pośrednio |  |
| springbloom_sacrifice_search | tak |  | tak | resolve_* | resolve_springbloom |
| start_engines |  |  | tak | nie dotyczy | start your engines — trigger |
| station_counters |  | tak |  | bezpośrednio | Spacecraft — M153 |
| subtype_spells_gain_flash_and_etb_fight_this_turn |  |  | tak | bezpośrednio | Cherished Hatchling |
| surveil | tak | tak |  | bezpośrednio | M218/4 |
| take_initiative |  |  | tak | nie dotyczy | initiative — trigger |
| tap_all_lands_opponents_control |  |  |  | nie dotyczy |  |
| tap_permanent | tak | tak | tak | bezpośrednio | M139 — tapTimingBonus |
| tap_permanents | tak |  |  | bezpośrednio |  |
| transfer_counters_on_dies |  |  | tak | nie dotyczy | trigger — automat |
| transform |  | tak | tak | nie dotyczy | transform — automat |
| turn_face_up |  |  |  | nie dotyczy | morph — akcja, nie efekt |
| turn_up_exiled_and_put_permanents |  | tak |  | bezpośrednio | Pyxis payoff |
| unearth_return |  | tak |  | pośrednio |  |
| untap_all_creatures_you_control |  |  | tak | nie dotyczy | trigger — automat |
| untap_enchanted_permanent |  |  | tak | nie dotyczy | trigger — automat |
| untap_permanent | tak | tak | tak | bezpośrednio | Twiddle |
| venture_into_undercity |  |  |  | nie dotyczy | venture — trigger |
| your_creatures_gain_keywords_until_end_of_turn |  |  | tak | bezpośrednio | Stampeding Elk Herd |

## Typy używane w kartach a nieobecne w effects.js (wrappery)

| typ | spell | ability | trigger | wycena |
|---|---|---|---|---|
| fireball_resolve | tak |  |  | nie dotyczy | wewnętrzny resolver Fireball |
| search_library_to_battlefield_tapped |  | tak |  | resolve_* | search_choice — tapped |

## Wnioski M218/5

- Etapy 1-4 zamknięte: okna walki (M218/1), meaningfulness (M218/2), keywordy (M218/3), regenerate + scry/surveil w czarach (M218/4)
- Z 174 typów silnika: 98 bezpośrednio/pośrednio/resolve_*, 76 bez wzmianki — po klasyfikacji:
  - **nie dotyczy (koszt/wewnętrzny/replacement/trigger automatyczny)**: 52 typy
  - **resolve_***: 18 typów (search, food, endure, graveyard_top, damage_division, library_placement, fertile_thicket, springbloom, explore, fabricate, discover, look_top)
  - **pośrednio (klamry)**: 15 typów (damage_defending_player via drainOnAttack, prevent_damage_this_turn via shield, itp.)
  - **LUKA**: 6 typów małych + 1 średnia (epic_experiment)
- Małe luki do ewentualnej naprawy w M219:
  - `add_flying_counter_to_face_down_you_control` — licznik flying na morphie
  - `grant_abilities` — nadanie zdolności
  - `investigate` — Clue (token) — obecnie nie create_token
  - `draw_then_discard`, `ferocious_draw_discard` — loot — brak kary za discard
  - `index_look` — jak scry, brak okna w cast_spell dla czystego Index
  - `epic_experiment` — średnia — X i darmowe czary
- Żadna luka nie jest krytyczna dla progów (0.78/0.57), ale warto domknąć w M219.
- Lekcje: L64 (faza ≠ moment), L3 (kara musi przebić premię), L41 (bliźniacze gałęzie), L42 (EOT + zegar)

## Testy

- `npm test` 3376/3376, build 54 / 2716 kB (po M218/4)
- Nowe testy M218/3 (11) i M218/4 (7) — 18 scenariuszy RED->GREEN
- `test/library-manipulation-modal.test.js` E4 — zielone po poprawce kary mixed vs pure
