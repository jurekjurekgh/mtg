import { execute, playerView } from './game-state.js';
import { makeSimulate } from './lookahead.js';

/**
 * Wykonuje ograniczoną symulację bez DOM-u, zegara i sieci.
 * Kontrolery widzą wyłącznie PlayerView; drugi argument chooseCommand to
 * helpery dla kontrolerów planujących (B2): `simulate` działa na KLONIE stanu.
 *
 * `onStep` (B6 T2) to OPCJONALNY, deterministyczny hak wywoływany po każdej
 * wykonanej komendzie z (state, i). Służy offline'owemu próbkowaniu sygnału
 * proxy (tools/proxy-reward.mjs). Domyślnie null — zero wpływu na przebieg,
 * kontrolery ani wynik (ADR 0005). Nie wolno w nim mutować stanu.
 */
export function runSimulation({ state, controllers, maxCommands = 100, onStep = null }) {
  if (!state || !controllers || controllers.size !== state.players.length) {
    throw new TypeError('Symulacja wymaga kontrolera dla każdego gracza');
  }
  const results = [];
  const helpers = { simulate: makeSimulate(state) };
  for (let i = 0; i < maxCommands; i += 1) {
    const playerId = state.turn.priorityPlayerId;
    const controller = controllers.get(playerId);
    if (!controller) throw new Error(`Brak kontrolera dla ${playerId}`);
    const cmd = controller.chooseCommand(playerView(state, playerId), helpers);
    if (cmd.playerId !== playerId) throw new Error('Kontroler zwrócił komendę innego gracza');
    const result = execute(state, cmd);
    results.push({ command: cmd, result });
    if (!result.ok) throw new Error(`Bot wybrał nielegalną komendę: ${result.events[0].reason}`);
    if (onStep) onStep(state, i);
    if (state.status !== 'active') break;
  }
  return { state, results };
}
