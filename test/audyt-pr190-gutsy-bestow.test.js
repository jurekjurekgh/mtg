import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createCardDeck } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';

// Mister Gutsy: „Whenever you cast an Aura or Equipment spell, put a +1/+1
// counter on this creature.” https://api.scryfall.com/cards/pip/136
// Leafcrown Dryad: bestow to alternatywny rzut jako Aura, a nie jako stwór;
// porównujemy go ze zwykłym rzutem tej SAMEJ karty. Rulingi obu kart:
// https://api.scryfall.com/cards/ths/157/rulings (puste),
// https://api.scryfall.com/cards/pip/136/rulings (bez doprecyzowania bestow).
const registry = createCardRegistry();
function put(s, id, cardId, owner, zone) {
  const [card] = createCardDeck({ cardIds: [cardId], ownerId: owner, registry });
  const { id: _id, instanceId, cardId: _cardId, ownerId, controllerId, objectId, zone: _zone, ...payload } = card;
  addObject(s, { ...payload, id, instanceId: `instance-${id}`, cardId, ownerId: owner, controllerId: owner, zone });
}
function scene(caster) {
  const s = createGameState({ seed: 190, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main', caster);
  s.turn.activePlayerId = s.turn.priorityPlayerId = caster;
  for (const p of ['p1', 'p2']) for (let i = 0; i < 10; i++)
    addObject(s, { id: `${p}-lib-${i}`, instanceId: `${p}-lib-i${i}`, cardId: 'basic-forest', ownerId: p, controllerId: p, zone: 'library', kind: 'land', types: ['Land'] });
  put(s, 'gutsy', 'mister-gutsy', 'p1', 'battlefield');
  put(s, 'dryad', 'leafcrown-dryad', caster, 'hand');
  addMana(s, caster, 4, { colors: ['G', 'G', 'G', 'G'] });
  return s;
}
function castAndResolve(s, caster, bestow) {
  const cmd = playerView(s, caster).legalCommands.find(c => c.objectId === 'dryad' && c.type === 'cast_permanent'
    && Boolean(c.bestow) === bestow && (!bestow || c.targets?.includes('gutsy')));
  assert.ok(cmd, 'rzut odpowiedniego wariantu jest oferowany');
  const result = execute(s, cmd);
  assert.equal(result.ok, true, result.reason);
  for (let i = 0; i < 12 && s.zones.stack.length; i++) {
    const pass = playerView(s, s.turn.priorityPlayerId).legalCommands.find(c => c.type === 'pass_priority');
    assert.ok(pass, 'pass dostępny');
    assert.equal(execute(s, pass).ok, true);
  }
  assert.equal(s.zones.stack.length, 0);
  return s.objects.get('gutsy').counters?.['+1/+1'] ?? 0;
}
test('Mister Gutsy: własny bestow to czar Aura; zwykły rzut Dryady nie jest Aurą', () => {
  assert.equal(castAndResolve(scene('p1'), 'p1', true), 1);
  assert.equal(castAndResolve(scene('p1'), 'p1', false), 0);
});
test('Mister Gutsy: bestow przeciwnika nie uruchamia własnego wyzwalacza', () => {
  assert.equal(castAndResolve(scene('p2'), 'p2', true), 0);
});
