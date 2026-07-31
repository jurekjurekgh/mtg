/** @typedef {{ type: string, playerId: string, [key: string]: unknown }} Command */
/** @typedef {{ type: string, [key: string]: unknown }} Event */
/** @typedef {{ id: string, type: string, options: unknown[] }} ChoiceRequest */
/** @typedef {{ playerId: string, turn: object, zones: object, legalCommands: Command[] }} PlayerView */

export const COMMAND_TYPES = Object.freeze(['pass_priority', 'move_object', 'draw_card', 'concede']);
export const EVENT_TYPES = Object.freeze(['game_created', 'object_moved', 'card_drawn', 'life_changed', 'player_lost', 'priority_passed', 'step_advanced', 'player_conceded', 'command_rejected']);

export function command(type, playerId, data = {}) {
  if (!COMMAND_TYPES.includes(type) || !playerId) throw new TypeError('Nieprawidłowa komenda');
  return Object.freeze({ type, playerId, ...data });
}

export function choiceRequest({ id, type, options }) {
  if (!id || !type || !Array.isArray(options)) throw new TypeError('ChoiceRequest wymaga id, type i options');
  return Object.freeze({ id, type, options: options.slice() });
}

export function event(type, data = {}) {
  if (!EVENT_TYPES.includes(type)) throw new TypeError('Nieznany typ zdarzenia');
  return Object.freeze({ type, ...data });
}
