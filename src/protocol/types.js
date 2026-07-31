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

export const COMMAND_TYPES = Object.freeze(['pass_priority', 'move_object', 'draw_card', 'play_land', 'tap_for_mana', 'cast_permanent', 'declare_attackers', 'declare_blockers', 'resolve_combat', 'concede']);
export const EVENT_TYPES = Object.freeze(['game_created', 'object_moved', 'card_drawn', 'damage_dealt', 'life_changed', 'mana_changed', 'land_played', 'mana_produced', 'permanent_cast', 'attackers_declared', 'blockers_declared', 'damage_marked', 'creature_destroyed', 'object_tapped', 'object_untapped', 'turn_started', 'player_lost', 'priority_passed', 'step_advanced', 'player_conceded', 'command_rejected']);

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
