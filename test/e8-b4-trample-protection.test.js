// E8/B4 — GUARDIA PO REFUTACJI (2026-09-08, audyt PR #105; zob. ADR 0030).
// „Znalezisko" z E8 było FAŁSZYWE: pierwotny lethalOf
// (deathtouch ? 1 : toughness − damage marked) był zgodny z CR i został
// przywrócony (revert 2e15ba6). Dosłowny tekst CR 702.19b:
//   „When checking for assigned lethal damage, take into account damage
//    already marked on the creature and damage from other creatures that's
//    being assigned during the same combat damage step, but not any
//    abilities or effects that might change the amount of damage that's
//    actually dealt."
// Klauzula WYŁĄCZA prewencję z wyliczenia lethal PRZYDZIAŁU: protection
// (CR 702.16d — „can't be dealt damage") nie obniża minimum. Na chronionego
// blokera 2/2 trampler musi przydzielić 2 (zostaną preventowane), dopiero
// nadwyżka idzie na obrońcę. Zbieżne źródła: MTG Tutorials (7/7 trampler vs
// 3/3 protection — legalne przydziały 3–7), r/mtgrules 2024-11-27, Draftsim
// (7/7 vs 2/2 prot → 5 na gracza). Deathtouch (CR 702.2b) NADAL obniża
// lethal do 1 — to zdolność ZMIENIAJĄCA definicję lethal, nie prewencja.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { validateDamageAssignment, defaultDamageAssignmentFor } from '../src/engine/combat.js';

function combat({ attackerColors = ['Black'], protection = [], secondBlocker = false, attackerPower = 5, deathtouch = false } = {}) {
  const state = createGameState({ seed: 4, players: [{ id: 'p1' }, { id: 'p2' }] });
  addObject(state, {
    id: 'att', instanceId: 'i-att', cardId: 'c-att', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'creature', power: attackerPower, toughness: 5, manaCost: 5,
    types: ['Creature'], colors: attackerColors, abilities: [],
    keywords: deathtouch ? ['trample', 'deathtouch'] : ['trample'], subtypes: [],
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
  execute(state, { type: 'pass_priority', playerId: 'p1' }); // D: okno po deklaracji (CR 508.2)
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p2',
    assignments: { att: secondBlocker ? ['blk', 'blk2'] : ['blk'] } }).ok);
  return state;
}

test('E8/B4 guardia: przydział 0 w chronionego 2/2 jest NIELEGALNY (CR 702.19b)', () => {
  const state = combat({ attackerColors: ['Black'], protection: ['Black'] });
  assert.equal(validateDamageAssignment(state, 'att', [{ blockerId: 'blk', amount: 0 }]),
    'trample_blocker_below_lethal',
    'prewencja NIE obniża lethal przydziału: 2/2 z protection wymaga przydziału 2');
  assert.equal(validateDamageAssignment(state, 'att', [{ blockerId: 'blk', amount: 2 }]), null,
    'przydział 2 (preventowane i tak) + 3 dla obrońcy — legalny minimalny');
});

test('E8/B4 guardia: domyślny przydział daje chronionemu blokerowi toughness, nie 0', () => {
  const state = combat({ attackerColors: ['Black'], protection: ['Black'] });
  assert.deepEqual(defaultDamageAssignmentFor(state, 'att', ['blk'], 5).map((e) => e.amount), [2],
    'lethal chronionego blokera = toughness − marked (nie 0)');
});

test('E8/B4 guardia: bloker BEZ protection — bez zmian (0 odrzucone, 2 legalne)', () => {
  const state = combat({ attackerColors: ['Black'], protection: [] });
  assert.equal(validateDamageAssignment(state, 'att', [{ blockerId: 'blk', amount: 0 }]),
    'trample_blocker_below_lethal', '2/2 bez protection: 0 < lethal 2 → odrzucone');
  assert.equal(validateDamageAssignment(state, 'att', [{ blockerId: 'blk', amount: 2 }]), null);
});

test('E8/B4 guardia: deathtouch nadal obniża lethal do 1 (CR 702.2b — definicja, nie prewencja)', () => {
  const state = combat({ attackerColors: ['Black'], protection: ['Black'], deathtouch: true });
  assert.equal(validateDamageAssignment(state, 'att', [{ blockerId: 'blk', amount: 1 }]), null,
    'deathtouch: 1 obrażenie = lethal także wobec protection');
});

test('E8/B4 guardia: E2E — [2 w chronionego, 3 w zwykłego] legalne; chroniony żyje nietknięty, nadwyżka tylko z prawdziwej nadwyżki', () => {
  // Dwóch blokerów: chroniony 2/2 (lethal przydziału 2) + zwykły 3/3 (lethal 3).
  // Przydział [2, 3] = pełna moc 5/5; obrońca dostaje 0 — trample nie płynie,
  // dopóki blokery nie mają przydzielonego minimum (poprzedni test E2E
  // przydzielał [0, 3] — nielegalne).
  const state = combat({ attackerColors: ['Black'], protection: ['Black'], secondBlocker: true });
  const lifeBefore = state.players.find((p) => p.id === 'p2').life;
  state.turn.priorityPlayerId = 'p1';
  assert.ok(execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' }).ok);
  assert.ok(state.pendingDamageAssignment, 'wielu blokerów: decyzja przydziału');
  const rejected = execute(state, {
    type: 'resolve_damage_assignment', playerId: 'p1',
    assignments: { att: [{ blockerId: 'blk', amount: 0 }, { blockerId: 'blk2', amount: 3 }] },
  });
  assert.equal(rejected.ok, false, 'przydział [0,3] odrzucony (CR 702.19b)');
  const res = execute(state, {
    type: 'resolve_damage_assignment', playerId: 'p1',
    assignments: { att: [{ blockerId: 'blk', amount: 2 }, { blockerId: 'blk2', amount: 3 }] },
  });
  assert.equal(res.ok, true, 'przydział [2,3] przyjęty: ' + (res.events?.[0]?.reason ?? ''));
  assert.equal(state.objects.get('blk').zone, 'battlefield', 'chroniony bloker przeżywa (obrażenia preventowane)');
  assert.notEqual(state.objects.get('blk2')?.zone, 'battlefield', 'zwykły bloker ginie od lethal');
  assert.equal(state.players.find((p) => p.id === 'p2').life, lifeBefore,
    'pełna moc zużyta na minimum blokerów — obrońca bez obrażeń');
});
