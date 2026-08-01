import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute } from '../src/engine/game-state.js';
import { jumpToStep, initialTurn } from '../src/engine/turn.js';

/**
 * Regresja: rozliczenie combat, w którym zablokowany atakujący ginie od
 * obrażeń blokującego, a drugi atakujący trafia gracza. Wcześniej SBA
 * uruchamiało się w środku rozliczania (przez API obrażeń gracza) i zabójstwo
 * blokowanego stwora przy żywym state.combat wywalało inwariant odwołań,
 * odrzucając legalny resolve_combat.
 */

function setupCombat() {
  const state = createGameState({ seed: 1, players: [{ id: 'att' }, { id: 'def' }] });
  const add = (id, controllerId, power, toughness) => addObject(state, {
    id, instanceId: `i-${id}`, cardId: `card-${id}`, controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness,
  });
  // Atakujący: 2/2 (zostanie zablokowany i zginie) oraz 3/2 (trafi gracza).
  add('a-small', 'att', 2, 2);
  add('a-big', 'att', 3, 2);
  // Blokujący: 2/3 — zada 2 śmiertelne obrażenia a-small, sam przeżyje 2.
  add('d-wall', 'def', 2, 3);
  // Zdejmujemy chorobę przyzwania, żeby deklaracja ataku była legalna.
  for (const id of ['a-small', 'a-big']) {
    const object = state.objects.get(id);
    state.objects.set(id, Object.freeze({ ...object, summoningSickness: false }));
  }
  state.turn = jumpToStep({ ...initialTurn('att') }, 'declare_attackers', 'att');
  return state;
}

test('resolve przy śmierci zablokowanego atakującego i trafieniu drugim przechodzi w całości', () => {
  const state = setupCombat();
  assert.equal(execute(state, { type: 'declare_attackers', playerId: 'att', attackerIds: ['a-small', 'a-big'] }).ok, true);
  assert.equal(execute(state, { type: 'declare_blockers', playerId: 'def', assignments: { 'a-small': ['d-wall'] } }).ok, true);
  const result = execute(state, { type: 'resolve_combat', playerId: 'att', defendingPlayerId: 'def' });
  assert.equal(result.ok, true, JSON.stringify(result.events));
  // a-small zginął od blokera; d-wall przeżył; gracz def stracił 3 życia.
  assert.ok(result.events.some((e) => e.type === 'creature_destroyed' && e.fromId === 'a-small'));
  assert.equal(state.objects.get('d-wall').zone, 'battlefield');
  assert.equal(state.players.find((p) => p.id === 'def').life, 17);
  assert.equal(state.combat, null, 'sesja combat po rozliczeniu ma być zamknięta');
  assert.equal(state.turn.step, 'end_of_combat');
});

test('śmiertelne trafienie niezablokowanym kończy grę po pełnym rozliczeniu combat', () => {
  const state = setupCombat();
  state.players.find((p) => p.id === 'def').life = 3;
  assert.equal(execute(state, { type: 'declare_attackers', playerId: 'att', attackerIds: ['a-big'] }).ok, true);
  assert.equal(execute(state, { type: 'declare_blockers', playerId: 'def', assignments: {} }).ok, true);
  const result = execute(state, { type: 'resolve_combat', playerId: 'att', defendingPlayerId: 'def' });
  assert.equal(result.ok, true, JSON.stringify(result.events));
  assert.equal(state.status, 'finished');
  assert.equal(state.winnerId, 'att');
  assert.ok(result.events.some((e) => e.type === 'player_lost' && e.reason === 'life_zero'));
});
