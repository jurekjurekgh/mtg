// Audyt PR #186 — F-186/1 (CR 509.1c): `maximalRequiredBlocks` zaniżał maksimum
// wymogów przy `blockSlotsFor > 1` (np. Cenn's Tactician z licznikiem +1/+1)
// i wielu atakujących z wymogiem celowanym (`must_block_enchanted`, Seton's Desire).
//
// `search` w `combat.js` przypisywał obowiązkowego blokera najwyżej do JEDNEGO
// atakującego, podczas gdy `fulfilledBlockRequirements` słusznie liczy pary
// `(bloker, atakujący)`. W efekcie bloker o 2 slotach przeciwko 2 atakującym
// z Seton's Desire miał maksimum 1 zamiast 2, więc silnik przyjmował blok
// tylko jednego z nich (`ok: true`) zamiast wymagać obu (CR 509.1c).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createCardDeck } from '../src/cards/materialize.js';
import { attachAuraToCreature } from '../src/engine/attachments.js';
import { addCounter } from '../src/engine/counters.js';
import { minimalMandatoryBlocks } from '../src/engine/combat.js';
import { jumpToStep } from '../src/engine/turn.js';

const registry = createCardRegistry();

function payload(cardId, ownerId) {
  const [entry] = createCardDeck({ cardIds: [cardId], ownerId, registry });
  const { id, instanceId, cardId: _cardId, ownerId: _ownerId, controllerId, zone, objectId, ...rest } = entry;
  return rest;
}

function put(state, id, cardId, controllerId, zone = 'battlefield', patch = {}) {
  addObject(state, {
    id, instanceId: `inst-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...payload(cardId, controllerId), ...patch,
  });
  return state.objects.get(id);
}

function setupSetonCombat({ attackerSpecs, blockerSpecs, thresholdCount = 7 }) {
  const state = createGameState({ seed: 186, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'declare_blockers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p2';
  for (let i = 0; i < thresholdCount; i += 1) {
    put(state, `gy-${i}`, 'plummet', 'p1', 'graveyard');
  }
  const attackerIds = [];
  for (const spec of attackerSpecs) {
    put(state, spec.id, spec.cardId ?? 'leafcrown-dryad', 'p1', 'battlefield', spec.patch ?? {});
    if (spec.seton !== false) {
      put(state, `sd-${spec.id}`, 'setons-desire', 'p1', 'battlefield');
      attachAuraToCreature(state, `sd-${spec.id}`, spec.id);
    }
    attackerIds.push(spec.id);
  }
  state.combat = {
    attackingPlayerId: 'p1',
    attackers: attackerIds,
    blockers: new Map(),
    blockedAttackers: new Set(),
  };
  for (const spec of blockerSpecs) {
    put(state, spec.id, spec.cardId ?? 'leafcrown-dryad', 'p2', 'battlefield', spec.patch ?? {});
    if (spec.plusCounters) addCounter(state, spec.id, '+1/+1', spec.plusCounters);
  }
  return state;
}

test('F-186/1a: Cenn\'s Tactician (2 sloty) musi zablokować OBU atakujących z Seton\'s Desire (CR 509.1c)', () => {
  const baseArgs = {
    attackerSpecs: [{ id: 'a1' }, { id: 'a2' }],
    blockerSpecs: [{ id: 'b1', cardId: 'cenns-tactician', plusCounters: 1 }],
  };
  // Świadek minimum dla maksimum wymogów obejmuje obu atakujących.
  const witnessState = setupSetonCombat(baseArgs);
  assert.deepEqual(minimalMandatoryBlocks(witnessState, 'p2'), { a1: ['b1'], a2: ['b1'] });

  // Blokowanie TYLKO jednego atakującego musi zostać odrzucone (spełnia 1 < 2 wymogów).
  const oneOnly = setupSetonCombat(baseArgs);
  const resOne = execute(oneOnly, { type: 'declare_blockers', playerId: 'p2', assignments: { a1: ['b1'] } });
  assert.equal(resOne.ok, false, 'blok tylko jednego atakującego łamie CR 509.1c przy 2 slotach');
  assert.match(resOne.reason ?? '', /maksymalną możliwą liczbę wymogów/);

  // Blokowanie obu jednocześnie jest legalne i zostaje przyjęte.
  const both = setupSetonCombat(baseArgs);
  const resBoth = execute(both, { type: 'declare_blockers', playerId: 'p2', assignments: { a1: ['b1'], a2: ['b1'] } });
  assert.equal(resBoth.ok, true, `blok obu atakujących ma być legalny: ${resBoth.reason}`);

  // Auto-deklaracja przy rundzie pass_priority też nie może urwać się na jednym slocie.
  const passState = setupSetonCombat(baseArgs);
  for (let i = 0; i < 2; i += 1) {
    const holder = passState.turn.priorityPlayerId;
    const resPass = execute(passState, { type: 'pass_priority', playerId: holder });
    assert.equal(resPass.ok, true);
  }
  const declared = passState.events.find((e) => e.type === 'blockers_declared');
  assert.deepEqual(declared?.assignments, { a1: ['b1'], a2: ['b1'] },
    'auto-deklaracja przy pass_priority ma zablokować obu atakujących');
});

test('F-186/1b: 2 sloty + menace + Seton\'s Desire z partnerem (maksimum 3 wymogi)', () => {
  const args = {
    attackerSpecs: [
      { id: 'a1', patch: { keywords: ['menace'] } },
      { id: 'a2' },
    ],
    blockerSpecs: [
      { id: 'b1', cardId: 'cenns-tactician', plusCounters: 1 }, // 2 sloty
      { id: 'b2' }, // 1 slot — jedyny partner dla menace na a1
    ],
  };
  const sPartial = setupSetonCombat(args);
  // Samo { a1: ['b1', 'b2'] } spełnia 2 wymogi, a drugi slot b1 może jeszcze zablokować a2 (3 wymogi).
  const resPartial = execute(sPartial, { type: 'declare_blockers', playerId: 'p2', assignments: { a1: ['b1', 'b2'] } });
  assert.equal(resPartial.ok, false, 'pominięcie drugiego wymogu przy wolnym drugim slocie jest nielegalne');

  const sFull = setupSetonCombat(args);
  const resFull = execute(sFull, {
    type: 'declare_blockers',
    playerId: 'p2',
    assignments: { a1: ['b1', 'b2'], a2: ['b1'] },
  });
  assert.equal(resFull.ok, true, `pełna deklaracja na 3 wymogi ma przejść: ${resFull.reason}`);
});

test('F-186/1c: Cenn\'s Tactician BEZ licznika +1/+1 (1 slot) — blok jednego z dwóch Setonów wystarczy', () => {
  const args = {
    attackerSpecs: [{ id: 'a1' }, { id: 'a2' }],
    blockerSpecs: [{ id: 'b1', cardId: 'cenns-tactician', plusCounters: 0 }],
  };
  const sEmpty = setupSetonCombat(args);
  assert.equal(execute(sEmpty, { type: 'declare_blockers', playerId: 'p2', assignments: {} }).ok, false,
    'brak bloku przy 1 slocie jest nielegalny');

  const sOne = setupSetonCombat(args);
  assert.equal(execute(sOne, { type: 'declare_blockers', playerId: 'p2', assignments: { a1: ['b1'] } }).ok, true,
    'przy 1 slocie blok jednego z dwóch atakujących spełnia maksimum = 1');

  // Oferta PlayerView też nie zawiera duplikatów blokera ponad limit slotów.
  const view = playerView(setupSetonCombat(args), 'p2');
  assert.equal(view.legalCommands.some((c) => c.type === 'declare_blockers'
    && c.assignments?.a1?.includes('b1') && c.assignments?.a2?.includes('b1')), false);
});
