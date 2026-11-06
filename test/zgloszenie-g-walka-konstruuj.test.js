// =============================================================================
// Zgłoszenie G, etap 1 (2026-11-05): walka przechodzi z enumeracji kombinacji
// na architekturę „konstruuj + waliduj”. `legalCommands` niesie wielomianowe
// ziarna deklaracji, widok niesie deskryptor problemu, a silnik przyjmuje
// każdą legalną deklarację zbudowaną przez kreator albo kontrolera — także
// taką, która nie jest ziarnem. Ziarno odrzucone przez execute byłoby
// naruszeniem kontraktu oferty (L48).
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import {
  attackCandidateIds,
  attackerDeclarationViolation,
  attackerSeedDeclarations,
  blockerDeclarationViolation,
  blockerSeedAssignments,
  blockCandidatePool,
  combatDeclarationView,
} from '../src/engine/combat.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

function creature(state, id, controllerId, power, toughness, patch = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId, ownerId: controllerId,
    zone: 'battlefield', kind: 'creature', power, toughness, manaCost: 2,
    abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [], cardName: id,
  });
  state.objects.set(id, Object.freeze({
    ...state.objects.get(id), summoningSick: false, summoningSickness: false, tapped: false, ...patch,
  }));
}

function attackState({ attackers = 4, alone = false, goaded = null } = {}) {
  const state = createGameState({ seed: 71, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  for (let i = 0; i < attackers; i += 1) {
    creature(state, `atk${i}`, 'p1', 2, 2, {
      ...(alone && i === 0 ? { abilities: [{ type: 'static', cantAttackAlone: true }] } : {}),
      ...(goaded === i ? { goaded: true } : {}),
    });
  }
  return state;
}

function blockState({ attackers = 4, blockers = 4 } = {}) {
  const state = attackState({ attackers });
  for (let i = 0; i < blockers; i += 1) creature(state, `blk${i}`, 'p2', 2, 2);
  const declared = execute(state, {
    type: 'declare_attackers', playerId: 'p1',
    attackerIds: Array.from({ length: attackers }, (_, i) => `atk${i}`),
  });
  assert.ok(declared.ok, 'deklaracja atakujących do sceny bloków');
  state.turn = jumpToStep(state.turn, 'declare_blockers', 'p2');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p2';
  return state;
}

test('G/1: deskryptor ataku niesie kandydatów i wymuszonych; ziarna są legalne i wielomianowe', () => {
  const state = attackState({ attackers: 6, goaded: 0 });
  const view = playerView(state, 'p1');
  assert.deepEqual(view.combatDeclaration, {
    role: 'attackers',
    candidateIds: ['atk0', 'atk1', 'atk2', 'atk3', 'atk4', 'atk5'],
    mandatoryIds: ['atk0'],
    aloneIds: [],
  });
  assert.deepEqual(attackCandidateIds(state, 'p1'), view.combatDeclaration.candidateIds);

  const seeds = attackerSeedDeclarations(state, 'p1');
  assert.equal(seeds.length, 12, `ziarna: wymuszony, wszyscy, 5 singletonów i 5 minus-jeden (${seeds.length})`);
  assert.ok(seeds.every((ids) => ids.includes('atk0')), 'każde ziarno zawiera wymuszonego');
  for (const attackerIds of seeds) {
    const clone = structuredClone(state);
    assert.ok(execute(clone, { type: 'declare_attackers', playerId: 'p1', attackerIds }).ok,
      `ziarno odrzucone przez execute: ${JSON.stringify(attackerIds)}`);
  }
});

test('G/2: dowolna legalna deklaracja ataku spoza ziaren jest przyjęta, nielegalna odrzucona', () => {
  const state = attackState({ attackers: 4 });
  const seeds = attackerSeedDeclarations(state, 'p1');
  const chosen = ['atk0', 'atk2'];
  assert.ok(!seeds.some((ids) => JSON.stringify(ids) === JSON.stringify(chosen)),
    'wybrany podzbiór celowo nie jest ziarnem');
  assert.equal(attackerDeclarationViolation(state, 'p1', chosen), null);
  assert.ok(execute(structuredClone(state), { type: 'declare_attackers', playerId: 'p1', attackerIds: chosen }).ok);
  assert.equal(attackerDeclarationViolation(state, 'p1', ['atk0', 'atk0']),
    'Atakujący nie może wystąpić więcej niż raz');
  assert.equal(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['atk0', 'atk0'] }).ok, false);
});

test('G/3: samotny „can\'t attack alone” nie dostaje nielegalnego ziarna, ale atak w grupie przechodzi', () => {
  const state = attackState({ attackers: 2, alone: true });
  const declaration = combatDeclarationView(state, 'p1');
  assert.deepEqual(declaration.aloneIds, ['atk0']);
  const seeds = attackerSeedDeclarations(state, 'p1');
  assert.ok(!seeds.some((ids) => ids.length === 1 && ids[0] === 'atk0'),
    `nielegalne samotne ziarno w ofercie: ${JSON.stringify(seeds)}`);
  assert.equal(attackerDeclarationViolation(state, 'p1', ['atk0', 'atk1']), null);
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['atk0', 'atk1'] }).ok);
});

test('G/4: deskryptor bloków i pula par są kompletne, a ziarna przechodzą execute', () => {
  const state = blockState({ attackers: 4, blockers: 4 });
  const view = playerView(state, 'p2');
  assert.equal(view.combatDeclaration.role, 'blockers');
  assert.deepEqual(view.combatDeclaration.attackerIds, ['atk0', 'atk1', 'atk2', 'atk3']);
  assert.deepEqual(view.combatDeclaration.pool, blockCandidatePool(state, 'p2'));
  for (const attackerId of view.combatDeclaration.attackerIds) {
    assert.deepEqual(view.combatDeclaration.pool[attackerId], ['blk0', 'blk1', 'blk2', 'blk3'],
      `pula dla ${attackerId}`);
  }

  const seeds = blockerSeedAssignments(state, 'p2');
  assert.ok(seeds.length <= 24, `wielomianowe ziarna bloków, nie 5^4 przypisań (${seeds.length})`);
  for (const assignments of seeds) {
    assert.ok(execute(structuredClone(state), { type: 'declare_blockers', playerId: 'p2', assignments }).ok,
      `ziarno odrzucone przez execute: ${JSON.stringify(assignments)}`);
  }
});

test('G/5: złożone przypisanie bloków spoza ziaren jest przyjęte przez walidację i execute', () => {
  const state = blockState({ attackers: 4, blockers: 4 });
  const seeds = blockerSeedAssignments(state, 'p2');
  const chosen = { atk0: ['blk0', 'blk1'], atk1: ['blk2'], atk3: ['blk3'] };
  assert.ok(!seeds.some((a) => JSON.stringify(a) === JSON.stringify(chosen)),
    'wybrane przypisanie celowo nie jest ziarnem');
  assert.equal(blockerDeclarationViolation(state, 'p2', chosen), null);
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: chosen }).ok);
});

test('G/6: przy 6×6 oferta walki nie materializuje wykładniczej liczby przypisań', () => {
  const state = blockState({ attackers: 6, blockers: 6 });
  const offers = playerView(state, 'p2').legalCommands.filter((c) => c.type === 'declare_blockers');
  assert.ok(offers.length > 1 && offers.length <= 50,
    `ziarna + pokrycie zachłanne zamiast 7^6 przypisań (jest ${offers.length})`);
  for (const cmd of offers) {
    assert.ok(execute(structuredClone(state), cmd).ok,
      `oferta odrzucona przez execute: ${JSON.stringify(cmd.assignments)}`);
  }
});

test('G/7: bot buduje deklarację ataku i bloków z deskryptora oraz ziaren', () => {
  const attackView = playerView(attackState({ attackers: 3 }), 'p1');
  const attackPick = createHeuristicBot({ seed: 7 }).chooseCommand(attackView, {});
  assert.equal(attackPick.type, 'declare_attackers');
  assert.ok(attackPick.attackerIds.length > 0, 'bot atakuje gotowymi stworami');

  const blockView = playerView(blockState({ attackers: 2, blockers: 2 }), 'p2');
  const blockPick = createHeuristicBot({ seed: 7 }).chooseCommand(blockView, {});
  assert.equal(blockPick.type, 'declare_blockers');
  assert.ok(Object.keys(blockPick.assignments ?? {}).length > 0, 'bot blokuje co najmniej jednego atakującego');
});
