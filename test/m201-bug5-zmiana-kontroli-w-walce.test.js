// M201 — polowanie na błędy (odznaka), znalezisko #5:
// PERMANENT PO ZMIANIE KONTROLERA ZOSTAWAŁ W WALCE.
//
// CR 506.4 (zweryfikowane u źródła — L57): „A permanent is removed from combat
// if it leaves the battlefield, IF ITS CONTROLLER CHANGES, if it phases out,
// if an effect specifically removes it from combat, … or if it's an attacking
// or blocking creature that regenerates or STOPS BEING A CREATURE.”
//
// Silnik znał dwie z tych przyczyn (zmiana strefy; utrata typu — znalezisko
// #1 tej sesji), ale nie znał zmiany kontrolera. Skutek w grze: przejęcie
// atakującego stwora (Awaken the Sleeper w oknie walki) NIE zdejmowało go
// z ataku — obrażenia szły dalej w gracza, który właśnie przejął stwora.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView, execute } from '../src/engine/game-state.js';
import { applyEffect } from '../src/engine/effects.js';
import { runStateBasedActions } from '../src/engine/state-based.js';
import { TURN_STEPS, initialTurn } from '../src/engine/turn.js';

function beast(state, id, controllerId, power, toughness) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'hill-giant', controllerId, ownerId: controllerId,
    zone: 'battlefield', kind: 'creature', power, toughness,
    types: ['Creature'], subtypes: [], abilities: [], keywords: [],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
}

function combatState(attacker = 'p2') {
  const state = createGameState({ seed: 5, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = { ...initialTurn(attacker), ...TURN_STEPS[5], stepIndex: 5, activePlayerId: attacker, priorityPlayerId: attacker, passes: 0 };
  return state;
}

const takeControl = (state, targetId, newController) => applyEffect(state,
  { type: 'gain_control_until_end_of_turn' },
  { id: 'src', controllerId: newController, cardId: 'awaken-the-sleeper', zone: 'stack' }, [targetId]);

test('BUG5: przejęty ATAKUJĄCY wychodzi z walki (CR 506.4)', () => {
  const state = combatState('p2');
  beast(state, 'atk', 'p2', 3, 3);
  assert.equal(execute(state, { type: 'declare_attackers', playerId: 'p2', attackerIds: ['atk'] }).ok, true);
  takeControl(state, 'atk', 'p1');
  runStateBasedActions(state);
  assert.equal(state.objects.get('atk').controllerId, 'p1', 'scenariusz: kontrola przeszła na obrońcę');
  assert.deepEqual(state.combat?.attackers ?? [], [],
    'CR 506.4: zmiana kontrolera zdejmuje permanent z walki');
});

test('BUG5: przejęty atakujący nie zadaje obrażeń bojowych', () => {
  const state = combatState('p2');
  beast(state, 'atk', 'p2', 3, 3);
  execute(state, { type: 'declare_attackers', playerId: 'p2', attackerIds: ['atk'] });
  takeControl(state, 'atk', 'p1');
  runStateBasedActions(state);
  execute(state, { type: 'declare_blockers', playerId: 'p1', assignments: {} });
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  const res = execute(state, { type: 'resolve_combat', playerId: 'p2', defendingPlayerId: 'p1' });
  assert.equal(res.ok, true, JSON.stringify(res.events?.[0] ?? {}));
  assert.equal(state.players.find((p) => p.id === 'p1').life, 20,
    'stwór poza walką nie bije gracza, który go przejął');
});

test('BUG5: przejęty BLOKER wychodzi z walki (a atakujący zostaje zablokowany — CR 509.1h)', () => {
  const state = combatState('p2');
  beast(state, 'atk', 'p2', 3, 3);
  beast(state, 'blk', 'p1', 2, 2);
  execute(state, { type: 'declare_attackers', playerId: 'p2', attackerIds: ['atk'] });
  execute(state, { type: 'declare_blockers', playerId: 'p1', assignments: { atk: ['blk'] } });
  takeControl(state, 'blk', 'p2'); // atakujący przejmuje własnego blokera
  runStateBasedActions(state);
  const blockers = [...(state.combat?.blockers?.get('atk') ?? [])];
  assert.deepEqual(blockers, [], 'bloker po zmianie kontrolera nie blokuje');
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'resolve_combat', playerId: 'p2', defendingPlayerId: 'p1' });
  assert.equal(state.players.find((p) => p.id === 'p1').life, 20,
    'CR 509.1h: atakujący pozostaje ZABLOKOWANY, więc nie bije gracza');
  assert.equal(state.objects.get('blk')?.damage ?? 0, 0, 'i nie zadaje obrażeń byłemu blokerowi');
});

test('BUG5 (anty-over-fix): bez zmiany kontroli walka przebiega normalnie', () => {
  const state = combatState('p2');
  beast(state, 'atk', 'p2', 3, 3);
  execute(state, { type: 'declare_attackers', playerId: 'p2', attackerIds: ['atk'] });
  runStateBasedActions(state);
  assert.deepEqual(state.combat?.attackers ?? [], ['atk']);
  execute(state, { type: 'declare_blockers', playerId: 'p1', assignments: {} });
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'resolve_combat', playerId: 'p2', defendingPlayerId: 'p1' });
  assert.equal(state.players.find((p) => p.id === 'p1').life, 17);
});
