// E9/F2 (wyzwanie wyłapywacza błędów II): MASAOWA ZMIANA KONTROLI NIE USUWA
// Z WALKI (CR 506.4). `control_to_owners_all_creatures` (Trostani Discordant —
// „each player gains control of all creatures they own") zmienia controllerId
// i stawia chorobę przywołania, ale nie woła `removeFromCombat` — przejęty
// ATAKUJĄCY zostaje w state.combat.attackers i „atakuje" swojego NOWEGO
// kontrolera. Sister-bug E8/B5 (gain_control_until_end_of_turn) w drugim
// efekcie zmiany kontroli.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute } from '../src/engine/game-state.js';
import { initialTurn, jumpToStep } from '../src/engine/turn.js';
import { applyEffect } from '../src/engine/effects.js';

function combatWithStolenAttacker() {
  const state = createGameState({ seed: 5, players: [{ id: 'p1' }, { id: 'p2' }] });
  // Stwór właściciela p1, skradziony wcześniej przez p2 (haste) — atakuje p1.
  addObject(state, {
    id: 'a', instanceId: 'i-a', cardId: 'c-stolen', controllerId: 'p2', ownerId: 'p1',
    zone: 'battlefield', kind: 'creature', power: 2, toughness: 2, manaCost: 2,
    types: ['Creature'], colors: ['R'], abilities: [], keywords: ['haste'], subtypes: [],
    summoningSickness: false,
  });
  state.turn = jumpToStep({ ...initialTurn('p2') }, 'declare_attackers', 'p2');
  state.turn.activePlayerId = 'p2'; state.turn.priorityPlayerId = 'p2'; state.turn.passes = 0;
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p2', attackerIds: ['a'] }).ok);
  return state;
}

test('E9/F2: Trostani — przejęty atakujący znika z walki (CR 506.4)', () => {
  const state = combatWithStolenAttacker();
  applyEffect(state, { type: 'control_to_owners_all_creatures' },
    Object.freeze({ id: 't', cardId: 'trostani-discordant', controllerId: 'p1', ownerId: 'p1' }), []);
  const object = state.objects.get('a');
  assert.equal(object.controllerId, 'p1', 'kontrola wróciła do właściciela');
  assert.equal(state.combat.attackers.includes('a'), false,
    'przejęty atakujący usunięty z atakujących (było: nadal atakował p1 — swojego nowego kontrolera)');
});

test('E9/F2: przejęty BLOKER znika z listy bloków (CR 506.4)', () => {
  const state = createGameState({ seed: 5, players: [{ id: 'p1' }, { id: 'p2' }] });
  addObject(state, {
    id: 'att', instanceId: 'i-att', cardId: 'c-att', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'creature', power: 2, toughness: 2, manaCost: 2,
    types: ['Creature'], colors: ['R'], abilities: [], keywords: [], subtypes: [],
  });
  // Bloker WŁAŚCICIELA p1, skradziony przez obrońcę p2 — blokuje (legalnie:
  // kontroler blokującego = obrońca), a Trostani zwraca go p1 (stronie
  // atakującej).
  addObject(state, {
    id: 'blk', instanceId: 'i-blk', cardId: 'c-blk', controllerId: 'p2', ownerId: 'p1',
    zone: 'battlefield', kind: 'creature', power: 2, toughness: 2, manaCost: 2,
    types: ['Creature'], colors: ['W'], abilities: [], keywords: [], subtypes: [],
  });
  state.turn = jumpToStep({ ...initialTurn('p1') }, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1'; state.turn.priorityPlayerId = 'p1'; state.turn.passes = 0;
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['att'] }).ok);
  execute(state, { type: 'pass_priority', playerId: 'p1' }); // D: okno po deklaracji (CR 508.2)
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { att: ['blk'] } }).ok);
  applyEffect(state, { type: 'control_to_owners_all_creatures' },
    Object.freeze({ id: 't', cardId: 'trostani-discordant', controllerId: 'p2', ownerId: 'p2' }), []);
  assert.equal(state.objects.get('blk').controllerId, 'p1', 'kontrola wróciła do właściciela');
  assert.equal((state.combat.blockers.get('att') ?? []).includes('blk'), false,
    'przejęty bloker usunięty z listy bloków (było: blokował dalej dla strony atakującej)');
  assert.ok(state.combat.attackers.includes('att'), 'atakujący zostaje w walce');
});
