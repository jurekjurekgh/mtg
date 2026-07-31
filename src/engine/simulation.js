import { execute, playerView } from './game-state.js';

/**
 * Wykonuje ograniczoną symulację bez DOM-u, zegara i sieci.
 * Kontrolery widzą wyłącznie PlayerView.
 */
export function runSimulation({ state, controllers, maxCommands = 100 }) {
  if (!state || !controllers || controllers.size !== state.players.length) {
    throw new TypeError('Symulacja wymaga kontrolera dla każdego gracza');
  }
  const results = [];
  for (let i = 0; i < maxCommands; i += 1) {
    const playerId = state.turn.priorityPlayerId;
    const controller = controllers.get(playerId);
    if (!controller) throw new Error(`Brak kontrolera dla ${playerId}`);
    const cmd = controller.chooseCommand(playerView(state, playerId));
    if (cmd.playerId !== playerId) throw new Error('Kontroler zwrócił komendę innego gracza');
    const result = execute(state, cmd);
    results.push({ command: cmd, result });
    if (!result.ok) throw new Error(`Bot wybrał nielegalną komendę: ${result.events[0].reason}`);
  }
  return { state, results };
}
