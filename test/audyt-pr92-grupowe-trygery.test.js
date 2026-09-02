// Audyt PR #92 (2026-09-02), znalezisko 4 — grupowe wyzwalacze „one or more …
// deal combat damage to a player” dedupowały po KONTROLERZE, więc wiele
// instancji tej samej zdolności odpalało się JEDEN raz.
//
// CR 603.2 + 603.3: grupowanie „one or more” scali JEDNO ZDARZENIE (dwa stwory
// atakujące razem nie dają dwóch wyzwalaczy tej samej instancji), ale KAŻDA
// instancja zdolności na KAŻDYM permanentie wyzwala osobno. Repro przed
// naprawą: 2 hosty z triggerem → 1 `ability_triggered` (ma być 2).
//
// Test jest syntetyczny (bez nazw kart w asercjach) — reguła musi działać dla
// każdej karty z tą rodziną triggerów (Disa, Vaan), nie dla wybranej (ADR 0002).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';

const TRIGGER_ABILITY = Object.freeze({
  type: 'triggered',
  trigger: { event: 'any_combat_damage_to_player' },
  effect: Object.freeze({ type: 'draw_cards', amount: 1 }),
  targets: null, cost: null, condition: null,
});

function game() {
  const state = createGameState({ seed: 92, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  // `addObject` sam dopisuje obiekt do strefy (inwariant: jeden obiekt =
  // jedna strefa), więc biblioteki nie budujemy ręcznie.
  for (let i = 0; i < 24; i += 1) {
    addObject(state, {
      id: `lib${i}`, instanceId: `libi${i}`, cardId: 'highland-game', controllerId: 'p1',
      ownerId: 'p1', zone: 'library', kind: 'card', power: null, toughness: null,
      manaCost: 3, colors: ['W'], types: ['Creature'], subtypes: ['Cat'], abilities: [],
    });
  }
  return state;
}

function creature(state, id, { subtypes = [], abilities = [] } = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'creature', power: 2, toughness: 2, manaCost: 2,
    abilities, keywords: [], subtypes, types: ['Creature'], colors: [], summoningSickness: false,
  });
  return state.objects.get(id);
}

function attackUnblocked(state, attackerIds) {
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds }).ok);
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: {} }).ok);
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  return execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' });
}

test('A92/4: DWA permanenty z grupowym triggerem = dwa wyzwalacze (CR 603.2/603.3)', () => {
  const state = game();
  creature(state, 'host1', { abilities: [TRIGGER_ABILITY] });
  creature(state, 'host2', { abilities: [TRIGGER_ABILITY] });
  creature(state, 'scout', { subtypes: ['Scout'] });
  const before = state.events.length;
  assert.ok(attackUnblocked(state, ['scout']).ok);
  const fired = state.events.slice(before).filter((e) => e.type === 'ability_triggered');
  assert.equal(fired.length, 2,
    'każda INSTANCJA zdolności wyzwala osobno — dedup po kontrolerze kasował drugą');
});

test('A92/4: JEDEN permanent i DWAJ atakujący = wciąż jeden wyzwalacz (grupowanie „one or more”)', () => {
  const state = game();
  creature(state, 'host1', { abilities: [TRIGGER_ABILITY] });
  creature(state, 'scoutA', { subtypes: ['Scout'] });
  creature(state, 'scoutB', { subtypes: ['Scout'] });
  const before = state.events.length;
  assert.ok(attackUnblocked(state, ['scoutA', 'scoutB']).ok);
  const fired = state.events.slice(before).filter((e) => e.type === 'ability_triggered');
  assert.equal(fired.length, 1,
    'dwa obrażenia w tym samym kroku to JEDNO zdarzenie „one or more creatures…”');
});

test('A92/4: filtr podtypów nie oznacza kontrolera „obsłużonego” przez stwór spoza listy', () => {
  const state = game();
  creature(state, 'hostFiltered', {
    abilities: [Object.freeze({ ...TRIGGER_ABILITY,
      trigger: Object.freeze({ event: 'any_combat_damage_to_player', subtypes: ['Rogue'] }) })],
  });
  creature(state, 'soldier', { subtypes: ['Soldier'] });   // nie pasuje do filtra
  creature(state, 'rogue', { subtypes: ['Rogue'] });       // pasuje
  const before = state.events.length;
  assert.ok(attackUnblocked(state, ['soldier', 'rogue']).ok);
  const fired = state.events.slice(before).filter((e) => e.type === 'ability_triggered');
  assert.equal(fired.length, 1, 'trigger z filtrem odpala dokładnie raz — przy Rogue’u');
});
