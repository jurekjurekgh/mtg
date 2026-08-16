import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, execute } from '../src/engine/game-state.js';
import { stateFingerprint } from '../src/engine/fingerprint.js';

test('identyczne sekwencje komend dają identyczny fingerprint', () => {
  const make = () => createGameState({ seed: 55, players: [{ id: 'p1' }, { id: 'p2' }] });
  const a = make();
  const b = make();
  for (const playerId of ['p1', 'p2', 'p1', 'p2']) {
    execute(a, { type: 'pass_priority', playerId });
    execute(b, { type: 'pass_priority', playerId });
  }
  assert.equal(stateFingerprint(a), stateFingerprint(b));
});

test('fingerprint zmienia się po zmianie stanu', () => {
  const state = createGameState({ seed: 55, players: [{ id: 'p1' }, { id: 'p2' }] });
  const before = stateFingerprint(state);
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  assert.notEqual(stateFingerprint(state), before);
});

test('fingerprint obejmuje stan permanentu i zasoby gracza', () => {
  const a = createGameState({ seed: 55, players: [{ id: 'p1' }, { id: 'p2' }] });
  const b = createGameState({ seed: 55, players: [{ id: 'p1' }, { id: 'p2' }] });
  a.players[0].mana = 1;
  assert.notEqual(stateFingerprint(a), stateFingerprint(b));
});

test('fingerprint obejmuje trwający combat', () => {
  const a = createGameState({ seed: 55, players: [{ id: 'p1' }, { id: 'p2' }] });
  const b = createGameState({ seed: 55, players: [{ id: 'p1' }, { id: 'p2' }] });
  a.combat = { attackers: ['a'], blockers: new Map([['a', ['b']]]) };
  assert.notEqual(stateFingerprint(a), stateFingerprint(b));
});

test('M103/A1: fingerprint obejmuje oczekującą decyzję craftu (pendingCraftExile)', () => {
  // Sonda „oferta bez skutku" dostała fałszywy alarm: aktywacja craftu
  // (Lodestone Needle) otwiera WYBÓR karty do wygnania, ale fingerprint go
  // nie widział — stan „przed wyborem" i „po wyborze" były „identyczne".
  // ADR 0005: zamrożony stan gry obejmuje oczekujące decyzje.
  const a = createGameState({ seed: 55, players: [{ id: 'p1' }, { id: 'p2' }] });
  const b = createGameState({ seed: 55, players: [{ id: 'p1' }, { id: 'p2' }] });
  a.pendingCraftExile = { playerId: 'p1', sourceId: 'o1', candidateIds: ['o2'] };
  assert.notEqual(stateFingerprint(a), stateFingerprint(b));
});

test('M103/A1: fingerprint obejmuje inne wstrzymujące decyzje (pendingSearchChoice)', () => {
  const a = createGameState({ seed: 55, players: [{ id: 'p1' }, { id: 'p2' }] });
  const b = createGameState({ seed: 55, players: [{ id: 'p1' }, { id: 'p2' }] });
  a.pendingSearchChoice = { playerId: 'p1', candidateIds: ['c1', 'c2'], destination: 'hand' };
  assert.notEqual(stateFingerprint(a), stateFingerprint(b));
});
