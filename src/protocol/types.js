/** @typedef {{ type: string, playerId: string, [key: string]: unknown }} Command */
/** @typedef {{ type: string, [key: string]: unknown }} Event */
/** @typedef {{ id: string, type: string, options: unknown[] }} ChoiceRequest */
/** @typedef {{ playerId: string, turn: object, zones: object, legalCommands: Command[] }} PlayerView */

export const COMMAND_TYPES = Object.freeze(['pass_priority', 'move_object', 'draw_card', 'concede']);
export const EVENT_TYPES = Object.freeze(['game_created', 'object_moved', 'card_drawn', 'damage_dealt', 'life_changed', 'mana_changed', 'land_played', 'attackers_declared', 'blockers_declared', 'damage_marked', 'creature_destroyed', 'object_tapped', 'object_untapped', 'turn_started', 'player_lost', 'priority_passed', 'step_advanced', 'player_conceded', 'command_rejected']);

export function command(type, playerId, data = {}) {
  if (!COMMAND_TYPES.includes(type) || !playerId) throw new TypeError('Nieprawidłowa komenda');
  return Object.freeze({ type, playerId, ...data });
}

export function choiceRequest({ id, type, options }) {
  if (!id || !type || !Array.isArray(options)) throw new TypeError('ChoiceRequest wymaga id, type i options');
  return Object.freeze({ id, type, options: options.slice() });
}

export function choiceResponse(request, value) {
  if (!request || !Array.isArray(request.options)) throw new TypeError('Odpowiedź wymaga poprawnego ChoiceRequest');
  if (!request.options.some((option) => Object.is(option, value))) {
    throw new RangeError('Odpowiedź nie jest jedną z opcji ChoiceRequest');
  }
  return Object.freeze({ requestId: request.id, value });
}

export function event(type, data = {}) {
  if (!EVENT_TYPES.includes(type)) throw new TypeError('Nieznany typ zdarzenia');
  return Object.freeze({ type, ...data });
}
