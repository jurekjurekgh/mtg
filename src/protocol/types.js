/**
 * Protokół komunikacji z silnikiem.
 *
 * Te czwarte kontrakty są jedynym kanałem, przez który kontrolery (boty, UI)
 * rozmawiają z engine; żaden konsument nie mutuje GameState bezpośrednio.
 * Wszystkie fabryki walidują wejście i zwracają zamrożone obiekty.
 *
 * @typedef {{ type: string, playerId: string, [key: string]: unknown }} Command
 *   Intencja gracza — jedyna droga zmiany stanu (np. play_land, declare_attackers).
 * @typedef {{ type: string, [key: string]: unknown }} Event
 *   Fakt, który zaszedł w engine (np. object_moved, player_lost). Zdarzenia
 *   trafiają do state.events i do wyniku execute.
 * @typedef {{ id: string, type: string, options: unknown[] }} ChoiceRequest
 *   Otwarty wybór, gdy komenda wymaga parametrów (cel, tryb, X). Obecnie
 *   żadna komenda go nie wymaga; mechanizm czeka na pierwszą kartę z celowaniem.
 * @typedef {{ playerId: string, status: string, winnerId: string|null,
 *   players: Array<{id: string, name: string, life: number}>, turn: object,
 *   zones: object, legalCommands: Command[] }} PlayerView
 *   Projekcja stanu dla jednego gracza bez ukrytych informacji (FoW);
 *   legalCommands to kompletne, gwarantowanie akceptowalne działania gracza.
 */

export const COMMAND_TYPES = Object.freeze(['pass_priority', 'move_object', 'draw_card', 'play_land', 'tap_for_mana', 'plot_card', 'cast_permanent', 'cast_spell', 'cast_cleave', 'cast_escape', 'cast_flashback', 'cast_adventure', 'cast_adventure_creature', 'activate_ability', 'declare_attackers', 'declare_blockers', 'resolve_combat', 'resolve_scry', 'resolve_backup', 'resolve_surveil', 'resolve_clash_choice', 'resolve_room_target', 'resolve_sacrifice_choice', 'resolve_food_choice', 'resolve_amass_choice', 'resolve_discover_choice', 'resolve_explore_choice', 'resolve_craft_exile', 'resolve_hand_creature', 'resolve_devour_choice', 'resolve_endure_choice', 'resolve_delirium_target', 'resolve_mentor_target', 'resolve_graveyard_top_choice', 'resolve_legend_choice', 'resolve_discard_choice', 'resolve_hand_top_choice', 'resolve_land_type_choice', 'resolve_search_choice', 'resolve_pay_or_sacrifice', 'resolve_optional_pay_choice', 'resolve_trigger_target', 'resolve_optional_trigger_choice', 'resolve_moonlit_choice', 'resolve_mulligan_choice', 'resolve_mulligan_bottom_choice', 'resolve_proliferate', 'resolve_reveal_order', 'resolve_damage_target', 'resolve_modal_choice', 'resolve_redirect_choice', 'resolve_fertile_thicket', 'resolve_springbloom', 'resolve_color_choice', 'resolve_index_choice', 'resolve_damage_assignment', 'resolve_optional_draw', 'resolve_exploit_choice', 'resolve_reveal_exile_hand', 'resolve_reveal_exile_grave', 'resolve_look_top_choice', 'resolve_epic_choice', 'resolve_enter_as_copy', 'resolve_destroy_equipment_choice', 'concede']);
export const EVENT_TYPES = Object.freeze(['game_created', 'object_moved', 'card_drawn', 'damage_dealt', 'life_changed', 'mana_changed', 'land_played', 'mana_produced', 'permanent_cast', 'spell_cast', 'spell_resolved', 'stats_modified', 'attackers_declared', 'blockers_declared', 'damage_marked', 'shield_consumed', 'creature_destroyed', 'object_tapped', 'object_untapped', 'turn_started', 'player_lost', 'priority_passed', 'step_advanced', 'player_conceded', 'command_rejected', 'ability_activated', 'ability_triggered', 'token_created', 'counter_added', 'counter_removed', 'object_flipped', 'object_transformed', 'permanent_sacrificed', 'scry_started', 'scry_resolved', 'surveil_started', 'surveil_resolved', 'initiative_taken', 'ventured_into_undercity', 'clash_resolved', 'clash_choice_resolved', 'object_goaded', 'hexproof_granted', 'room_target_required', 'room_target_resolved', 'sacrifice_choice_required', 'aura_spell_cast', 'permanent_entered_battlefield', 'object_attached', 'object_detached', 'card_revealed', 'library_searched', 'backup_resolved', 'keyword_granted', 'permanent_animated', 'poison_counters_added', 'permanent_put_into_graveyard', 'card_discarded', 'card_milled', 'card_plotted', 'land_type_changed', 'control_changed', 'object_exiled', 'delayed_trigger_scheduled', 'spell_countered', 'cant_block_granted', 'cant_be_blocked_granted', 'food_choice_required', 'food_choice_resolved', 'amass_choice_required', 'amass_choice_resolved', 'discover_started', 'discover_resolved', 'explore_choice_required', 'explore_resolved', 'craft_exile_required', 'permanent_destroyed', 'hand_creature_choice_required', 'hand_creature_choice_resolved', 'damage_prevented', 'damage_prevention_started', 'damage_shield_created', 'regeneration_shield_added', 'permanent_regenerated', 'permanent_animation_ended', 'station_status_changed', 'cant_be_regenerated_set', 'saga_chapter_fired', 'opponents_lands_tapped', 'delayed_trigger_armed', 'devour_choice_required', 'devour_choice_resolved', 'discard_choice_required', 'discard_choice_resolved', 'hand_top_choice_required', 'hand_top_choice_resolved', 'land_type_choice_required', 'land_type_choice_resolved', 'search_choice_required', 'search_choice_resolved', 'pay_or_sacrifice_required', 'pay_or_sacrifice_resolved', 'optional_pay_required', 'optional_pay_resolved', 'trigger_target_required', 'trigger_target_resolved', 'trigger_resolved', 'optional_trigger_required', 'optional_trigger_resolved', 'mulligan_choice_resolved', 'mulligan_taken', 'mulligan_bottom_required', 'mulligan_bottom_resolved', 'game_started', 'moonlit_choice_required', 'moonlit_choice_resolved', 'endure_choice_required', 'endure_choice_resolved', 'delirium_target_required', 'delirium_target_resolved', 'mentor_target_required', 'mentor_target_resolved', 'graveyard_top_choice_required', 'graveyard_top_choice_resolved', 'legend_rule_choice_started', 'legend_rule_resolved', 'proliferate_started', 'proliferate_resolved', 'proliferate_target_required', 'proliferate_target_resolved', 'proliferated', 'reveal_started', 'reveal_resolved', 'reveal_order_required', 'reveal_order_resolved', 'damage_target_required', 'damage_target_resolved', 'cards_milled', 'modal_trigger_required', 'modal_trigger_resolved', 'speed_changed', 'turned_face_up', 'redirect_choice_required', 'redirect_choice_resolved',
    'fertile_thicket_reveal_started', 'fertile_thicket_resolved',
    'springbloom_choice_required', 'springbloom_resolved', 'springbloom_skipped',
    'color_choice_required', 'color_choice_resolved',
    'index_started', 'index_resolved', 'damage_assignment_required', 'damage_assignment_resolved', 'ability_resolved', 'optional_draw_required', 'optional_draw_resolved', 'day_night_changed', 'exploit_choice_required', 'exploit_choice_resolved', 'exploited', 'reveal_exile_required', 'reveal_exile_hand_chosen', 'reveal_exile_grave_required', 'reveal_exile_grave_chosen', 'reveal_exile_resolved', 'look_top_started', 'look_top_resolved', 'epic_experiment_started', 'epic_experiment_resolved', 'enter_as_copy_resolved', 'destroy_equipment_choice_resolved']);

/**
 * Tworzy zamrożoną komendę. Nieznany typ albo brak playerId to błąd programisty —
 * odrzucenie maszynowe (command_rejected) dotyczy komend dochodzących przez execute.
 */
export function command(type, playerId, data = {}) {
  if (!COMMAND_TYPES.includes(type) || !playerId) throw new TypeError('Nieprawidłowa komenda');
  return Object.freeze({ type, playerId, ...data });
}

/** Tworzy zamrożony wybór z jawnym, niepustym kształtem opcji. */
export function choiceRequest({ id, type, options }) {
  if (!id || !type || !Array.isArray(options)) throw new TypeError('ChoiceRequest wymaga id, type i options');
  return Object.freeze({ id, type, options: options.slice() });
}

/** Odpowiedź na ChoiceRequest; wartość spoza opcji jest odrzucana. */
export function choiceResponse(request, value) {
  if (!request || !Array.isArray(request.options)) throw new TypeError('Odpowiedź wymaga poprawnego ChoiceRequest');
  if (!request.options.some((option) => Object.is(option, value))) {
    throw new RangeError('Odpowiedź nie jest jedną z opcji ChoiceRequest');
  }
  return Object.freeze({ requestId: request.id, value });
}

/** Tworzy zamrożone zdarzenie znajomego typu. */
export function event(type, data = {}) {
  if (!EVENT_TYPES.includes(type)) throw new TypeError('Nieznany typ zdarzenia');
  return Object.freeze({ type, ...data });
}
