import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { legalTargetCandidates } from '../src/engine/spells.js';

function game() {
  return createGameState({ seed: 46, players: [{ id: 'p1' }, { id: 'p2' }] });
}

test('CR 702.11: oferta celu artifact/aura nie obejmuje hexproof przeciwnika', () => {
  const state = game();
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  addObject(state, {
    id: 'open', instanceId: 'i-open', cardId: 'x-open', controllerId: 'p2',
    zone: 'battlefield', kind: 'artifact', types: ['Artifact'], colors: [],
  });
  addObject(state, {
    id: 'hex', instanceId: 'i-hex', cardId: 'x-hex', controllerId: 'p2',
    zone: 'battlefield', kind: 'artifact', types: ['Artifact'], colors: [],
    keywords: ['hexproof'],
  });
  const arts = legalTargetCandidates(state, 'p1', { type: 'artifact' });
  assert.ok(arts.includes('open'), 'zwykły artefakt jest celem');
  assert.ok(!arts.includes('hex'), 'hexproof przeciwnika nie jest w ofercie (CR 702.11)');
});
