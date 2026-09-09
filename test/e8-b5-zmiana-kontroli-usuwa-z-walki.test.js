// E8/B5 (wyzwanie wyłapywacza błędów): ZMIANA KONTROLERA USUWA Z WALKI
// (CR 506.4 — „A permanent is removed from combat if ... its controller
// changes ..."). Przejęty stwór blokujący/atakujący natychmiast przestaje
// być blokującym/atakującym; jego „był" kontroler nie zostaje zablokowany
// własnym dawnym stworzeniem, a przejmujący nie dziedziczy bloków.
// Dotąd `gain_control_until_end_of_turn` zmieniał tylko controllerId —
// stwór zostawał w state.combat po starej stronie.
//
// Chirurgia stanu: efekt aplikowany wprost przez applyEffect (steal z
// katalogu to sorcery — timing w trakcie walki i tak nie istnieje).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { applyEffect } from '../src/engine/effects.js';

function midCombat() {
  const state = createGameState({ seed: 9, players: [{ id: 'p1' }, { id: 'p2' }] });
  addObject(state, {
    id: 'att', instanceId: 'i-att', cardId: 'c-att', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'creature', power: 2, toughness: 2, manaCost: 2,
    types: ['Creature'], colors: ['R'], abilities: [], keywords: [], subtypes: [],
  });
  addObject(state, {
    id: 'blk', instanceId: 'i-blk', cardId: 'c-blk', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', kind: 'creature', power: 2, toughness: 2, manaCost: 2,
    types: ['Creature'], colors: ['W'], abilities: [], keywords: [], subtypes: [],
  });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1'; state.turn.priorityPlayerId = 'p1'; state.turn.passes = 0;
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['att'] }).ok);
  execute(state, { type: 'pass_priority', playerId: 'p1' }); // D: okno po deklaracji (CR 508.2)
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { att: ['blk'] } }).ok);
  return state;
}

const steal = { type: 'gain_control_until_end_of_turn' };
const source = Object.freeze({ id: 'src', cardId: 'c-steal', controllerId: 'p1', ownerId: 'p1' });

test('E8/B5: przejęty BLOKER znika z walki (CR 506.4) — atakujący zostaje odblokowany', () => {
  const state = midCombat();
  applyEffect(state, steal, source, ['blk']);
  assert.equal(state.objects.get('blk').controllerId, 'p1', 'kontrola przejęta');
  const blockers = state.combat.blockers.get('att') ?? [];
  assert.equal(blockers.includes('blk'), false,
    'przejęty bloker usunięty z listy bloków (było: zostawał blokować swojego nowego kontrolera)');
  assert.ok(state.combat.attackers.includes('att'), 'atakujący zostaje w walce');
});

test('E8/B5: przejęty ATAKUJĄCY znika z walki (CR 506.4) — nie atakuje nowego kontrolera', () => {
  const state = midCombat();
  // p2 przejmuje atakującego p1 w trakcie walki.
  const src2 = Object.freeze({ id: 'src2', cardId: 'c-steal', controllerId: 'p2', ownerId: 'p2' });
  applyEffect(state, steal, src2, ['att']);
  assert.equal(state.objects.get('att').controllerId, 'p2', 'kontrola przejęta');
  assert.equal(state.combat.attackers.includes('att'), false,
    'przejęty atakujący usunięty z atakujących (było: atakował dawnego wroga... czyli nowego kontrolera)');
  assert.equal((state.combat.blockers.get('att') ?? []).length, 0,
    'lista bloków atakującego wyczyszczona wraz z nim');
});
