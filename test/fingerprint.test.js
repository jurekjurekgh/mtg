import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute } from '../src/engine/game-state.js';
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

// =============================================================================
// M122/#1 — fingerprint gubił prawo do blokowania (znalezisko Żywego Testera).
//
// Sonda „oferta bez skutku" porównuje stan przed/po przez stateFingerprint.
// `cantBeBlocked` (Coralhelm Guide: „{4}{U}: Target creature can't be blocked
// this turn") i `cantBlock` (Panic Spellbomb) NIE były w odcisku, więc:
//   (a) sonda raportowała fałszywe „brak skutku" dla działającej zdolności —
//       tak trafiło to do transkryptu F-spellslinger-azorius-1009 (6 zgłoszeń),
//   (b) dwa stany różniące się prawem do blokowania miały identyczny odcisk,
//       czyli weryfikacja replayów ich nie odróżniała.
// =============================================================================

test('M122: fingerprint odnotowuje cantBeBlocked (efekt do końca tury)', () => {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  addObject(state, {
    id: 'atk', instanceId: 'i-atk', cardId: 'maritime-guard', controllerId: 'p1',
    zone: 'battlefield', kind: 'creature', power: 1, toughness: 3, manaCost: 2,
    abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: ['U'],
  });
  const before = stateFingerprint(state);
  state.objects.set('atk', Object.freeze({ ...state.objects.get('atk'), cantBeBlocked: true }));
  assert.notEqual(stateFingerprint(state), before, 'cantBeBlocked musi być częścią odcisku stanu');
});

test('M122: fingerprint odnotowuje cantBlock (efekt do końca tury)', () => {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  addObject(state, {
    id: 'def', instanceId: 'i-def', cardId: 'maritime-guard', controllerId: 'p2',
    zone: 'battlefield', kind: 'creature', power: 1, toughness: 3, manaCost: 2,
    abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: ['U'],
  });
  const before = stateFingerprint(state);
  state.objects.set('def', Object.freeze({ ...state.objects.get('def'), cantBlock: true }));
  assert.notEqual(stateFingerprint(state), before, 'cantBlock musi być częścią odcisku stanu');
});

test('M264/2.3: fingerprint odnotowuje frontFaceId (dwustronny token — MV 0 / reset K5)', () => {
  // ADR 0005: stan obejmuje wszystko, co wpływa na przyszły przebieg.
  // frontFaceId decyduje o (a) MV kopii TYLNEJ twarzy = 0 (CR 202.3b przez
  // copyManaValueOf) i (b) resetcie twarzy przy opuszczeniu pola bitwy
  // (CR 711.4a / dfcFaceReset). Dwa stany różniące się tylko tym polem
  // zachowują się inaczej, więc muszą mieć różne odciski — inaczej sonda
  // „oferta bez skutku" i weryfikacja replayów zrównałyby je.
  const make = (withFrontFaceId) => {
    const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
    addObject(state, {
      id: 'needle', instanceId: 'i-needle', cardId: 'needle-back', controllerId: 'p1',
      zone: 'battlefield', kind: 'artifact', power: null, toughness: null, manaCost: 0,
      abilities: [], keywords: [], subtypes: [], types: ['Artifact'], colors: [],
      transformTo: { cardId: 'needle-front', power: null, toughness: null },
      frontFaceId: withFrontFaceId ? 'needle-front' : null,
    });
    return state;
  };
  assert.notEqual(
    stateFingerprint(make(true)),
    stateFingerprint(make(false)),
    'frontFaceId musi być częścią odcisku stanu (ADR 0005)',
  );
});
