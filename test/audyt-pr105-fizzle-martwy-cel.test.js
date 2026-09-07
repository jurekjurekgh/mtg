import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

// Audyt PR #105 (E3b, L39): przegląd CR 608.2b w sąsiedztwie zmian M343
// zostawia pin. Ścieżka: czar NIE modalny, którego JEDYNY cel przestaje być
// legalny przed rozstrzygnięciem (umiera od SBA na granicy komendy rzutu),
// fizzlunie W CAŁOŚCI — pozostałe efekty (scry) nie biegną.
// Nośnik syntetyczny w pliku testu; engine nie zna rejestru (ADR 0002/0029).

const registry = createCardRegistry();

function game(victimCardId) {
  const state = createGameState({ seed: 105, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  const put = (id, def, zone) => addObject(state, {
    id, instanceId: `i-${id}`, cardId: def.id, controllerId: 'p1', ownerId: 'p1', zone,
    ...gameObjectDataOf(def),
  });
  put('lib', registry.get('basic-forest'), 'library');
  put('victim', registry.get(victimCardId), 'battlefield');
  const base = registry.get('courage-in-crisis');
  put('probe', {
    ...base, id: 'probe-fizzle', name: 'Probe', manaCost: 0,
    spell: { ...base.spell, cost: 0, targets: base.spell.targets, effects: [
      { type: 'destroy_permanent' },
      { type: 'scry', amount: 1 },
    ] },
  }, 'hand');
  addMana(state, 'p1', 3, { colors: ['G'] });
  return state;
}

test('E3/A: cel padły od SBA w kolejce komendy rzutu — trigger dies na tej samej granicy', () => {
  // UWAGA (L116): addObject NIE stosuje entersWithCounters — Servant of the
  // Scale w fabryce testu to 0/0, więc pierwsza komenda (rzut) uruchamia SBA
  // i cel umiera ZANIM ktokolwiek dostanie priorytet na odpowiedź.
  const state = game('servant-of-the-scale');
  const cast = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'probe' && c.targets?.includes('victim'));
  assert.ok(cast, 'oferta rzutu istnieje');
  const result = execute(state, cast);
  assert.ok(result.ok, JSON.stringify(result));
  // SBA na granicy komendy: śmierć celu jest FAKTEM przed rozstrzyganiem czaru.
  assert.ok(state.events.some((e) => e.type === 'creature_destroyed' && e.fromId === 'victim'), 'cel umarł od SBA przy rzucie');
  assert.ok(state.events.some((e) => e.type === 'trigger_resolved'), 'trigger dies celu nie przepadł (granica komendy)');
  // Czar wciąż na stosie — czeka na rundę passów, NIE rozstrzyga się przy rzucie.
  assert.deepEqual(state.zones.stack.map((id) => state.objects.get(id)?.cardId ?? id), ['probe-fizzle']);
});

test('E3/B: rozstrzygnięcie z martwym jedynym celem — fizzl bez żadnego efektu (CR 608.2b)', () => {
  const state = game('servant-of-the-scale');
  const cast = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'probe' && c.targets?.includes('victim'));
  assert.ok(execute(state, cast).ok);
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  const resolved = state.events.find((e) => e.type === 'spell_resolved' && e.cardId === 'probe-fizzle');
  assert.ok(resolved, 'czar zszedł ze stosu');
  assert.equal(resolved.fizzled, true, 'jedyny cel nielegalny = fizzl');
  assert.equal(state.events.some((e) => e.type === 'scry_started'), false, 'scry po zniszczeniu NIE biegnie (cały czar fizzluje)');
  assert.equal(state.pendingScry, null, 'brak decyzji scry');
  assert.equal(state.pendingSpell, null, 'czar nie wisi na stosie');
  assert.equal(state.zones.stack.length, 0, 'stos pusty — gra toczy się dalej');
  assert.ok(state.zones.graveyard.some((id) => state.objects.get(id)?.cardId === 'probe-fizzle'), 'fizzl idzie do grobu (bez adventure/rebound)');
});

test('E3/C: anty-over-fix — żywy cel: destroy działa, scry blokuje (ścieżka bez fizzla)', () => {
  const state = game('goblin-piker');
  const cast = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'probe' && c.targets?.includes('victim'));
  assert.ok(execute(state, cast).ok);
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  assert.ok(state.events.some((e) => e.type === 'permanent_destroyed' && e.fromId === 'victim'), 'żywy cel zniszczony efektem');
  assert.ok(state.pendingScry, 'scry jako następny efekt blokuje decyzją');
  assert.ok(execute(state, playerView(state, 'p1').legalCommands.find((c) => c.type === 'resolve_scry')).ok);
  assert.equal(state.pendingSpell, null);
  assert.equal(state.zones.stack.length, 0);
});
