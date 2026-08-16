import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { ABILITY_TYPE, createAbility } from '../src/engine/abilities.js';
import { effectivePower, effectiveToughness } from '../src/engine/permanents.js';
import { jumpToStep } from '../src/engine/turn.js';

/**
 * Zintegrowane zdolności aktywowane (Etap 5): framework abilities jest wpięty
 * w engine — komenda activate_ability przechodzi przez legalCommands i execute,
 * płaci koszt (tap) i wykonuje efekt (pump). Engine nie zna nazw kart; zdolności
 * są generyczne na obiektach.
 */

const pump = () => createAbility({ type: ABILITY_TYPE.activated, cost: { tap: true }, effect: { type: 'pump', power: 1, toughness: 1 } });

function board() {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  // M102/U1: świeży stan stoi w kroku 'untap', w którym (CR 502.4) nikt nie
  // dostaje priorytetu i żadnej zdolności nie można aktywować. Testy zdolności
  // aktywowanych muszą stać w fazie głównej — tam, gdzie gracz realnie klika.
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  addObject(state, {
    id: 'boar', instanceId: 'ib', cardId: 'syn-warboar', controllerId: 'p1',
    zone: 'battlefield', kind: 'creature', power: 2, toughness: 2, abilities: [pump()],
  });
  addObject(state, {
    id: 'enemy', instanceId: 'ie', cardId: 'highland-game', controllerId: 'p2',
    zone: 'battlefield', kind: 'creature', power: 2, toughness: 2,
  });
  return state;
}

function resolveStack(state) {
  let guard = 0;
  while (state.zones.stack.length > 0 && guard++ < 250) {
    const holder = state.turn.priorityPlayerId;
    const view = playerView(state, holder);
    const pick = view.legalCommands.find((c) => c.type === 'pass_priority') ?? view.legalCommands.find((c) => c.type.startsWith('resolve_'));
    if (!pick) return false;
    const r = execute(state, pick);
    if (!r.ok) return false;
  }
  return state.zones.stack.length === 0;
}

function activationCommand(view, objectId) {
  return view.legalCommands.find((cmd) => cmd.type === 'activate_ability' && cmd.objectId === objectId);
}

test('zdolność aktywowana jest oferowana, gdy permanent jest odkręcony i ma priorytet', () => {
  const state = board();
  const cmd = activationCommand(playerView(state, 'p1'), 'boar');
  assert.ok(cmd, 'brak komendy activate_ability');
  assert.equal(cmd.abilityIndex, 0);
  // p2 nie kontroluje boara — nie ma go w swoich akcjach.
  assert.equal(activationCommand(playerView(state, 'p2'), 'boar'), undefined);
});

test('aktywacja tapa i wzmacnia permanent, po czym znika z legalCommands', () => {
  const state = board();
  const result = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'boar', abilityIndex: 0 });
  assert.equal(result.ok, true);
  assert.ok(result.events.some((e) => e.type === 'ability_activated'));
  const boar = state.objects.get('boar');
  assert.equal(boar.tapped, true, 'koszt tap nie został zapłacony');
  // D (2026-08-11): zdolność aktywowana idzie na stos — efekt po rozstrzygnięciu.
  assert.ok(resolveStack(state), 'stos rozstrzygnięty');
  const boarAfter = state.objects.get('boar');
  assert.equal(effectivePower(boarAfter), 3);
  assert.equal(effectiveToughness(boarAfter), 3);
  // Po zapłaceniu tapa zdolności nie można użyć ponownie.
  assert.equal(activationCommand(playerView(state, 'p1'), 'boar'), undefined);
});

test('zdolność z kosztem tap jest odrzucana, gdy permanent jest już zatapnięty', () => {
  const state = board();
  execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'boar', abilityIndex: 0 });
  const again = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'boar', abilityIndex: 0 });
  assert.equal(again.ok, false);
  assert.match(again.events[0].reason, /illegal_ability/);
});

test('nie można aktywować zdolności cudzego permanentu', () => {
  const state = board();
  // p2 nie ma priorytetu w starcie (p1 zaczyna) — a nawet z priorytetem nie ma dostępu.
  const cmd = activationCommand(playerView(state, 'p2'), 'enemy');
  assert.equal(cmd, undefined);
  assert.equal(playerView(state, 'p2').legalCommands.some((c) => c.type === 'activate_ability'), false);
});

test('komenda aktywacji trafia do logu replayu', () => {
  const state = board();
  execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'boar', abilityIndex: 0 });
  assert.equal(state.commands[0].type, 'activate_ability');
  assert.equal(state.commands[0].objectId, 'boar');
});
