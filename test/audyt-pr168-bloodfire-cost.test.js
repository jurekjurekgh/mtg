// Audyt PR #168/A-6: nielegalna aktywacja „Sacrifice enchanted creature”
// nie może zapłacić {R}, zanim wykryje brak własnego gospodarza (CR 602.2/601.2h).
// Test bezpośredniej komendy jest istotny: sama oferta filtruje ten stan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { stateFingerprint } from '../src/engine/fingerprint.js';
import { addMana } from '../src/engine/resources.js';
import { jumpToStep } from '../src/engine/turn.js';

const registry = createCardRegistry();
function game() {
  const state = createGameState({ seed: 69, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  return state;
}
function put(state, id, cardId, playerId = 'p1', patch = {}) {
  const def = registry.get(cardId);
  addObject(state, { id, instanceId: `i-${id}`, cardId, ownerId: playerId, controllerId: playerId,
    zone: 'battlefield', ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes, keywords: def.keywords });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
}
const direct = () => ({ type: 'activate_ability', playerId: 'p1', objectId: 'bf', abilityIndex: 0 });
const offered = (state) => playerView(state, 'p1').legalCommands.some((c) => c.type === 'activate_ability' && c.objectId === 'bf');

function rejectedWithoutMutation(state) {
  assert.equal(offered(state), false, 'oferta powinna odrzucać brak legalnego gospodarza');
  const before = stateFingerprint(state);
  const events = state.events.length;
  const result = execute(state, direct());
  assert.equal(result.ok, false, 'bezpośrednia komenda musi zostać odrzucona');
  assert.match(result.reason, /Brak zaczepionego stworu/);
  assert.ok(stateFingerprint(state) === before, 'odrzucona aktywacja nie zmienia many, landów, stref ani stosu');
  assert.equal(state.events.length, events, 'brak fałszywych zdarzeń płatności');
}

test('A-6: oderwana Aura i {R} w puli — odrzucenie nie zabiera czerwonej many', () => {
  const state = game();
  put(state, 'bf', 'bloodfire-infusion');
  addMana(state, 'p1', 1, { colors: ['R'] });
  rejectedWithoutMutation(state);
});

test('A-6: Aura na cudzym stworze i wolna Góra — odrzucenie nie tapuje landa', () => {
  const state = game();
  put(state, 'host', 'makindi-aeronaut', 'p2');
  put(state, 'mountain', 'basic-mountain');
  put(state, 'bf', 'bloodfire-infusion', 'p1', { attachedTo: 'host' });
  rejectedWithoutMutation(state);
  assert.equal(state.objects.get('mountain')?.tapped, false);
});

test('A-6: legalna Aura na własnym stworze aktywuje się i płaci obie części kosztu', () => {
  const state = game();
  put(state, 'host', 'tuskguard-captain');
  put(state, 'bf', 'bloodfire-infusion', 'p1', { attachedTo: 'host' });
  addMana(state, 'p1', 1, { colors: ['R'] });
  assert.equal(offered(state), true);
  const result = execute(state, direct());
  assert.equal(result.ok, true, result.reason);
  assert.equal(state.players.find((p) => p.id === 'p1').mana, 0);
  assert.notEqual(state.objects.get('host')?.zone, 'battlefield');
  assert.ok(state.zones.stack.some((id) => state.objects.get(id)?.kind === 'activated'),
    'zdolność jest na stosie, można odpowiedzieć przed obrażeniami');
});
