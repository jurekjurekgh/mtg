import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { jumpToStep } from '../src/engine/turn.js';
import { markDamage } from '../src/engine/permanents.js';
import { runStateBasedActions } from '../src/engine/state-based.js';
import { applyEffect } from '../src/engine/effects.js';
import { modifyStats } from '../src/engine/permanents.js';

/**
 * T5 — regeneracja (CR 701.12): aktywacja „regenerate\" zakłada tarczę;
 * następne ZNISZCZENIE w tej turze (śmiertelne obrażenia albo efekt destroy)
 * jest zastępowane — stwór zostaje odtapowany, bez obrażeń, poza walką.
 * Tarcza nie chroni przed poświęceniem, prawem legend ani wytrzymałością <= 0.
 */

function game() {
  const state = createGameState({ seed: 11, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  return state;
}

/** Stwór z {1}: Regenerate (zdolność aktywowana, koszt many, bez efektu). */
function addRegenerator(state, id, controllerId = 'p1', { power = 2, toughness = 2 } = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `reg-${id}`, controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost: 2, types: ['Creature'], subtypes: [], colors: [],
    abilities: [{ type: 'activated', keyword: 'regenerate', cost: { mana: 1 }, effect: [] }],
  });
  return state.objects.get(id);
}


function resolveStack(state) {
  let guard = 0;
  while (state.zones.stack.length > 0 && guard++ < 100) {
    const holder = state.turn.priorityPlayerId;
    const view = playerView(state, holder);
    const pick = view.legalCommands.find((c) => c.type === 'pass_priority') ?? view.legalCommands.find((c) => c.type.startsWith('resolve_'));
    if (!pick) return false;
    const r = execute(state, pick);
    if (!r.ok) return false;
  }
  return state.zones.stack.length === 0;
}

function activateRegenerate(state, objectId, playerId = 'p1') {
  const view = playerView(state, playerId);
  const cmd = view.legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === objectId && c.abilityIndex === 0);
  assert.ok(cmd, 'brak oferty aktywacji regeneracji');
  const r = execute(state, cmd);
  assert.ok(r.ok, r.events[0]?.reason);
  return r;
}

test('aktywacja regenerate zakłada tarczę (koszt many)', () => {
  const state = game();
  addRegenerator(state, 'guy');
  addMana(state, 'p1', 1);
  activateRegenerate(state, 'guy');
  assert.deepEqual(state.regenerationShields, ['guy']);
  assert.ok(state.events.some((e) => e.type === 'regeneration_shield_added' && e.objectId === 'guy'));
  assert.equal(state.players[0].mana, 0);
  // Zdolność w ofercie — też bez many nie ma oferty.
  const view = playerView(state, 'p1');
  assert.equal(view.legalCommands.some((c) => c.type === 'activate_ability' && c.objectId === 'guy'), false);
});

test('śmiertelne obrażenia zamiast śmierci: regeneracja — stwór zostaje odtapowany, bez obrażeń, bez dies', () => {
  const state = game();
  addRegenerator(state, 'guy', 'p1', { power: 2, toughness: 2 });
  addMana(state, 'p1', 1);
  activateRegenerate(state, 'guy');
  // 2 obrażenia na 2/2 = śmiertelne (SBA).
  markDamage(state, 'guy', 2);
  const events = runStateBasedActions(state);
  assert.ok(state.objects.get('guy').zone === 'battlefield', 'stwór przeżył dzięki regeneracji');
  const guy = state.objects.get('guy');
  assert.equal(guy.tapped, true, 'regeneracja odtapowuje');
  assert.equal(guy.damage, 0, 'obrażenia zdjęte');
  assert.deepEqual(state.regenerationShields, [], 'tarcza zużyta');
  assert.ok(state.events.some((e) => e.type === 'permanent_regenerated'), 'brak zdarzenia regeneracji');
  assert.ok(!events.some((e) => e.type === 'creature_destroyed'), 'nie ma zdarzenia śmierci');
});

test('tarcza jednorazowa — drugie śmiertelne obrażenia zabijają', () => {
  const state = game();
  addRegenerator(state, 'guy', 'p1', { power: 2, toughness: 2 });
  addMana(state, 'p1', 1);
  activateRegenerate(state, 'guy');
  markDamage(state, 'guy', 2);
  runStateBasedActions(state);
  // Bez nowej tarczy: kolejne śmiertelne obrażenia = śmierć.
  markDamage(state, 'guy', 2);
  const events = runStateBasedActions(state);
  assert.ok(events.some((e) => e.type === 'creature_destroyed'), 'drugie zniszczenie zabija');
  assert.ok([...state.objects.values()].some((o) => o.cardId === 'reg-guy' && o.zone === 'graveyard'));
});

test('efekt destroy jest zastępowany przez regenerację', () => {
  const state = game();
  addRegenerator(state, 'guy');
  addMana(state, 'p1', 1);
  activateRegenerate(state, 'guy');
  // Syntetyczny efekt destroy (jak Shatter).
  const r = execute(state, {
    type: 'cast_spell', playerId: 'p1', objectId: 'x',
  });
  assert.equal(r.ok, false); // nie ma takiego czaru — użyjemy applyEffect bezpośrednio
  // Bezpośredni efekt destroy przez zdolność aktywowaną? Prościej: SBA już
  // przetestowane — tu testujemy ścieżkę effect.destroy_permanent.
  const source = state.objects.get('guy');
  applyEffect(state, { type: 'destroy_permanent' }, source, [source.id]);
  assert.ok(state.objects.get('guy').zone === 'battlefield', 'destroy zregenerowany');
  assert.equal(state.objects.get('guy').tapped, true);
  assert.deepEqual(state.regenerationShields, []);
});

test('poświęcenie NIE jest chronione przez regenerację (CR 701.12a)', () => {
  const state = game();
  addRegenerator(state, 'guy');
  addMana(state, 'p1', 1);
  activateRegenerate(state, 'guy');
  const source = state.objects.get('guy');
  applyEffect(state, { type: 'sacrifice_permanent' }, source, []);
  assert.ok([...state.objects.values()].some((o) => o.cardId === 'reg-guy' && o.zone === 'graveyard'), 'poświęcenie zabija mimo tarczy');
  assert.deepEqual(state.regenerationShields, ['guy'], 'tarcza niezużyta (poświęcenie to nie zniszczenie)');
});

test('wytrzymałość <= 0 nie jest zniszczeniem — regeneracja nie chroni (CR 704.5f)', () => {
  const state = game();
  addRegenerator(state, 'guy', 'p1', { power: 2, toughness: 1 });
  addMana(state, 'p1', 1);
  activateRegenerate(state, 'guy');
  // -1/-1 do końca tury (jak Black Sun's Zenith w minimalnej formie) —
  // syntetyczny modyfikator.
  modifyStats(state, 'guy', { power: 0, toughness: -1 });
  const events = runStateBasedActions(state);
  assert.ok(events.some((e) => e.type === 'creature_destroyed'), '0 wytrzymałości zabija mimo tarczy');
});

test('tarcza znika w cleanup (CR 701.12a — „this turn\")', () => {
  const state = game();
  addRegenerator(state, 'guy');
  addMana(state, 'p1', 1);
  activateRegenerate(state, 'guy');
  resolveStack(state); // D: zdolność na stosie — rozstrzygnij przed krokiem
  // Wejście w cleanup (pełna runda passów z end → cleanup) czyści tarcze.
  state.turn = jumpToStep(state.turn, 'end', 'p1');
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  assert.equal(state.turn.step, 'cleanup', 'krok cleanup osiągnięty');
  assert.deepEqual(state.regenerationShields, [], 'tarcza wygasła w cleanup');
});
