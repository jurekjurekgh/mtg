// E8/B4 (wyzwanie wyłapywacza błędów): TRAMPLE vs BLOKER Z PROTECTION
// (CR 702.19b + 702.16d). „Lethal damage" w trample to liczba obrażeń,
// które FAKTYCZNIE zabiłyby blokera — obrażenia zapobiegane przez
// protection nie liczą się, więc bloker w pełni chroniony dostaje lethal 0
// i atakujący z trample może od razu przełożyć całą moc na obrońcę.
// Dotąd `lethalOf` liczył toughness bez względu na protection → trample
// błędnie „zatrzymywał się" na blokerze, którego i tak nie zrani.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { validateDamageAssignment } from '../src/engine/combat.js';
import { defaultDamageAssignmentFor } from '../src/engine/combat.js';

function combat({ attackerColors = ['Black'], protection = [], secondBlocker = false } = {}) {
  const state = createGameState({ seed: 4, players: [{ id: 'p1' }, { id: 'p2' }] });
  addObject(state, {
    id: 'att', instanceId: 'i-att', cardId: 'c-att', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'creature', power: 5, toughness: 5, manaCost: 5,
    types: ['Creature'], colors: attackerColors, abilities: [], keywords: ['trample'], subtypes: [],
  });
  addObject(state, {
    id: 'blk', instanceId: 'i-blk', cardId: 'c-blk', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', kind: 'creature', power: 2, toughness: 2, manaCost: 2,
    types: ['Creature'], colors: ['White'], abilities: [], keywords: [], subtypes: [],
    protectionFromColors: protection,
  });
  if (secondBlocker) {
    addObject(state, {
      id: 'blk2', instanceId: 'i-blk2', cardId: 'c-blk2', controllerId: 'p2', ownerId: 'p2',
      zone: 'battlefield', kind: 'creature', power: 3, toughness: 3, manaCost: 3,
      types: ['Creature'], colors: ['Green'], abilities: [], keywords: [], subtypes: [],
    });
  }
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1'; state.turn.priorityPlayerId = 'p1'; state.turn.passes = 0;
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['att'] }).ok);
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p2',
    assignments: { att: secondBlocker ? ['blk', 'blk2'] : ['blk'] } }).ok);
  return state;
}

test('E8/B4: bloker w pełni chroniony → lethal 0, cała moc legalnie na obrońcę (CR 702.19b)', () => {
  const state = combat({ attackerColors: ['Black'], protection: ['Black'] });
  const reason = validateDamageAssignment(state, 'att', [{ blockerId: 'blk', amount: 0 }]);
  assert.equal(reason, null,
    `przydział 0 w chronionego blokera + cała moc na gracza (było: ${JSON.stringify(reason)})`);
});

test('E8/B4: domyślny przydział nie marnuje mocy na chronionego blokera', () => {
  const state = combat({ attackerColors: ['Black'], protection: ['Black'] });
  const out = defaultDamageAssignmentFor(state, 'att', ['blk'], 5);
  assert.deepEqual(out.map((e) => e.amount), [0],
    `lethal chronionego blokera = 0 (było: ${JSON.stringify(out.map((e) => e.amount))})`);
});

test('E8/B4: bloker BEZ protection nadal wymaga lethal — ścieżka niepoluzowana', () => {
  const state = combat({ attackerColors: ['Black'], protection: [] });
  assert.equal(validateDamageAssignment(state, 'att', [{ blockerId: 'blk', amount: 0 }]),
    'trample_blocker_below_lethal', '2/2 bez protection: 0 < lethal 2 → odrzucone');
});

test('E8/B4: E2E — trample przepływa przez ochronionego blokera (chroniony żyje, gracz traci nadwyżkę)', () => {
  // Dwóch blokerów (pojedynczy → silnik auto-przydziela bez decyzji):
  // chroniony 2/2 (lethal 0) + zwykły 3/3 (lethal 3). Przydział [0, 3] →
  // nadwyżka 5-3=2 idzie na obrońcę.
  const state = combat({ attackerColors: ['Black'], protection: ['Black'], secondBlocker: true });
  const lifeBefore = state.players.find((p) => p.id === 'p2').life;
  state.turn.priorityPlayerId = 'p1'; // sterowanie przebiegiem (jak w bug-hunt)
  assert.ok(execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' }).ok);
  assert.ok(state.pendingDamageAssignment, 'wielu blokerów: decyzja przydziału');
  const res = execute(state, {
    type: 'resolve_damage_assignment', playerId: 'p1',
    assignments: { att: [{ blockerId: 'blk', amount: 0 }, { blockerId: 'blk2', amount: 3 }] },
  });
  assert.equal(res.ok, true, 'przydział przyjęty: ' + (res.events?.[0]?.reason ?? ''));
  assert.equal(state.objects.get('blk').zone, 'battlefield', 'chroniony bloker przeżywa nietknięty');
  assert.notEqual(state.objects.get('blk2')?.zone, 'battlefield', 'zwykły bloker ginie od lethal');
  assert.equal(state.players.find((p) => p.id === 'p2').life, lifeBefore - 2,
    'obrońca dostaje nadwyżkę 2 (było: trample zatrzymany na chronionym blokerze)');
});
