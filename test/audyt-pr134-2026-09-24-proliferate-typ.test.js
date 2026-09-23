// Audyt PR #134 (2026-09-24), znalezisko F-4 — `commandForProliferateSelection`
// po uogólnieniu do `commandForTargetIdsSelection` straciła zawężenie po typie.
// Wspólna funkcja czyta „brak pola `targetIds`” jako zbiór pusty, więc przy
// pustym wyborze zwraca PIERWSZĄ komendę oferty bez tego pola. Pin M298/A1 ma
// fixture z samymi `resolve_proliferate` (L5 — brak kontrprzykładu), więc
// ryzyka nie widział: w realnej grze oferta decyzji zawiera też `concede`
// (sonda audytu: 8 wariantów + `concede`), a przyszłe rodziny decyzji mogą
// mieć `pass_priority` na początku listy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { commandForProliferateSelection, commandForTargetIdsSelection } from '../src/table/multi-target.js';

const registry = createCardRegistry();

/** Warianty proliferate jak z silnika + KONKURENCYJNA komenda bez targetIds na początku. */
function fixture() {
  const variants = [[], ['c1'], ['c2'], ['c1', 'c2']].map((chosen) => Object.freeze({
    type: 'resolve_proliferate', playerId: 'p1',
    ...(chosen.length > 0 ? { targetIds: chosen } : {}),
  }));
  return [
    Object.freeze({ type: 'pass_priority', playerId: 'p1' }),
    Object.freeze({ type: 'concede', playerId: 'p1' }),
    ...variants,
  ];
}

test('F-4/H1: pusty wybór proliferate NIE sięga po obcą komendę bez targetIds', () => {
  const commands = fixture();
  const empty = commandForProliferateSelection(commands, []);
  assert.equal(empty?.type, 'resolve_proliferate', 'typ dopasowany, nie pierwszy z brzegu');
  assert.equal(empty.targetIds, undefined, 'wariant „nic nie wybieram” bez pola targetIds');
  const chosen = commandForProliferateSelection(commands, ['c2', 'c1']);
  assert.deepEqual([...chosen.targetIds].sort(), ['c1', 'c2'], 'kolejność kliknięć nieistotna');
  assert.equal(commandForProliferateSelection(commands, ['widmo']), null, 'nielegalny obiekt → brak komendy');
});

test('F-4/H2: wspólna funkcja bez zawężenia nadal działa dla rodzin z jawnym typem', () => {
  const commands = fixture();
  // Rodzina wielocelowa podaje typ z planu (render.js) — ta sama gwarancja.
  const byType = commandForTargetIdsSelection(commands, [], { type: 'resolve_proliferate' });
  assert.equal(byType?.type, 'resolve_proliferate');
  // Bez typu: zachowanie ogólne (pierwszy pasujący klucz) — udokumentowane
  // kontrprzykładem, żeby nikt nie „poprawił” delegacji proliferate.
  const noType = commandForTargetIdsSelection(commands, []);
  assert.equal(noType?.type, 'pass_priority');
});

test('F-4/H3: end-to-end na realnej ofercie silnika — pusty wybór rozstrzyga decyzję', () => {
  const who = 'p1';
  const state = createGameState({ seed: 134, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', who);
  state.turn.activePlayerId = who;
  state.players = state.players.map((p) => ({ ...p, poison: 3 }));
  for (const [id, cardId, zone] of [['own', 'wormfang-newt', 'battlefield'], ['spell', 'courage-in-crisis', 'hand']]) {
    addObject(state, {
      id, instanceId: `i-${id}`, cardId, controllerId: who, ownerId: who, zone,
      ...gameObjectDataOf(registry.get(cardId)),
    });
  }
  addMana(state, who, 3, { colors: ['G'] });
  const accept = (cmd) => {
    assert.ok(cmd, 'komenda istnieje');
    const result = execute(state, cmd);
    assert.ok(result.ok, JSON.stringify(result.events)); // L68
  };
  accept(playerView(state, who).legalCommands.find((c) => c.type === 'cast_spell' && c.targets?.includes('own')));
  for (let i = 0; i < 2; i++) accept({ type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  assert.ok(state.pendingProliferate, 'decyzja proliferate wisi');

  const view = playerView(state, who);
  const empty = commandForProliferateSelection(view.legalCommands, []);
  assert.equal(empty?.type, 'resolve_proliferate', 'realna oferta: pusty wybór to wariant proliferate');
  assert.ok(view.legalCommands.includes(empty), 'komenda pochodzi z oferty silnika');
  accept(empty);
  assert.equal(state.pendingProliferate ?? null, null, 'decyzja rozstrzygnięta bez dokładania liczników');
  assert.equal(state.players.find((p) => p.id === 'p2').poison, 3, 'nikt nie dostał licznika');
});
