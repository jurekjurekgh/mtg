import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGameState, execute, addObject } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

const REGISTRY = createCardRegistry();

function newState() {
  const state = createGameState({ seed: 2026, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  return state;
}

function addPlayerMana(state, playerId, amount, colors = []) {
  addMana(state, playerId, amount, { colors });
}

function addCardFromRegistry(state, instanceId, cardId, controllerId, zone) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id: instanceId, instanceId: `i-${instanceId}`, cardId, controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, spell: data.spell, abilities: data.abilities ?? [],
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
    types: def.types ?? [], colors: data.colors ?? [],
  });
}

function assertScryfall(id) {
  const raw = fs.readFileSync(`docs/cards/scryfall-${id}.json`, 'utf8');
  const j = JSON.parse(raw);
  const def = REGISTRY.get(id);
  assert.equal(j.name, def.name, `${id}: nazwa Scryfall != definicja`);
}

test('Courage in Crisis: +1/+1 counter na celu + proliferate (no-op przy pustych targets)', () => {
  assertScryfall('courage-in-crisis');
  const state = newState();
  addCardFromRegistry(state, 'cs', 'courage-in-crisis', 'p1', 'hand');
  addObject(state, {
    id: 'target', instanceId: 'i-target', cardId: 'x-test', controllerId: 'p1',
    zone: 'battlefield', kind: 'creature', power: 2, toughness: 2, manaCost: 1,
    abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: ['G'],
  });
  state.objects.set('target', Object.freeze({ ...state.objects.get('target'), summoningSickness: false }));
  addPlayerMana(state, 'p1', 3, ['G']);
  const r = execute(state, {
    type: 'cast_spell', playerId: 'p1', objectId: 'cs', targets: ['target'],
  });
  assert.equal(r.ok, true, 'cast_spell: ' + JSON.stringify(r));
  // Czar na stosie — rozstrzygnij passami obu graczy.
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  // Po rozstrzygnięciu efektu 1 (add_counter): target ma +1/+1 counter,
  // a proliferate (efekt 2) CZEKA na decyzję gracza (CR 701.27 — choose
  // any number): pendingProliferate z kandydatami (target z licznikiem).
  assert.ok(state.pendingProliferate, 'proliferate kolejkuje decyzję gracza');
  const cands = state.pendingProliferate.candidateIds;
  assert.ok(cands.includes('target'), 'target wśród kandydatów');
  const target = state.objects.get('target');
  assert.equal((target.counters ?? {})['+1/+1'] ?? 0, 1, 'add_counter: target ma 1× +1/+1 (proliferate czeka)');
  // Gracz wybiera DOWOLNĄ liczbę celów — tu: brak (wybór pusty) → brak zmian.
  const r2 = execute(state, { type: 'resolve_proliferate', playerId: 'p1', targetIds: [] });
  assert.equal(r2.ok, true, 'resolve_proliferate (puste wybory)');
  assert.equal((state.objects.get('target').counters ?? {})['+1/+1'] ?? 0, 1, 'bez wybranych celów: bez zmian');
  assert.equal(state.zones.stack.length, 0, 'czar opuszcza stos po decyzji');
});

test('Selesnya Charm tryb Pump: +2/+2 + trample do EOT', () => {
  assertScryfall('selesnya-charm');
  const state = newState();
  addCardFromRegistry(state, 'charm', 'selesnya-charm', 'p1', 'hand');
  addObject(state, {
    id: 'cr', instanceId: 'i-cr', cardId: 'x-test', controllerId: 'p1',
    zone: 'battlefield', kind: 'creature', power: 2, toughness: 2, manaCost: 1,
    abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: ['W'],
  });
  state.objects.set('cr', Object.freeze({ ...state.objects.get('cr'), summoningSickness: false }));
  addPlayerMana(state, 'p1', 2, ['G', 'W']);
  const r = execute(state, {
    type: 'cast_spell', playerId: 'p1', objectId: 'charm', modeIndex: 0, targets: ['cr'],
  });
  assert.equal(r.ok, true, 'cast_spell tryb Pump: ' + JSON.stringify(r));
  // Czar na stosie — rozstrzygnij passami.
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  const cr = state.objects.get('cr');
  assert.equal(cr.powerModifier, 2, 'power +2');
  assert.equal(cr.toughnessModifier, 2, 'toughness +2');
  assert.ok((cr.keywordGrants ?? []).includes('trample'), 'trample granted');
});

test('Selesnya Charm tryb Token: tworzy 2/2 biały Knight z vigilance', () => {
  assertScryfall('selesnya-charm');
  const state = newState();
  addCardFromRegistry(state, 'charm', 'selesnya-charm', 'p1', 'hand');
  addPlayerMana(state, 'p1', 2, ['G', 'W']);
  const r = execute(state, {
    type: 'cast_spell', playerId: 'p1', objectId: 'charm', modeIndex: 2,
  });
  assert.equal(r.ok, true, 'cast_spell tryb Token: ' + JSON.stringify(r));
  // Czar na stosie — rozstrzygnij passami.
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  const tokens = [...state.objects.values()].filter((o) =>
    o.zone === 'battlefield' && o.cardId === 'token_knight'
  );
  assert.equal(tokens.length, 1, '1 token Knight');
  const tok = tokens[0];
  assert.equal(tok.power, 2, 'token power 2');
  assert.equal(tok.toughness, 2, 'token toughness 2');
  assert.ok((tok.keywords ?? []).includes('vigilance'), 'token vigilance');
  assert.ok((tok.colors ?? []).includes('W'), 'token white');
});

// Resolve pełnego stosu (T6: czary + triggery w rundach passów). LIFO;
// helper używany przez Wormfang Newt (trigger ETB wchodzi na stos dopiero
// po resolveTopOfStack — T6 ograniczenie).
function resolveStack(state) {
  let guard = 0;
  while (state.zones.stack.length > 0 && guard < 12) {
    let passesDone = state.turn.passes;
    while (passesDone < state.players.length && state.zones.stack.length > 0) {
      const holder = state.turn.priorityPlayerId;
      const r = execute(state, { type: 'pass_priority', playerId: holder });
      if (r?.events?.[0]?.reason?.endsWith('_unresolved')) return;
      passesDone = state.turn.passes;
    }
    guard += 1;
  }
}

test('Wormfang Newt ETB exile + LTB return exiled land', () => {
  assertScryfall('wormfang-newt');
  const state = newState();
  addCardFromRegistry(state, 'newt', 'wormfang-newt', 'p1', 'hand');
  addObject(state, {
    id: 'land', instanceId: 'i-land', cardId: 'basic-forest', controllerId: 'p1',
    zone: 'battlefield', kind: 'land', power: null, toughness: null, manaCost: 0,
    abilities: [], keywords: [], subtypes: ['Forest'], types: ['Basic', 'Land'],
    colors: ['G'],
  });
  addPlayerMana(state, 'p1', 2, ['U']);
  const r = execute(state, {
    type: 'cast_permanent', playerId: 'p1', objectId: 'newt',
  });
  assert.equal(r.ok, true, 'cast_permanent: ' + JSON.stringify(r));
  // Po cast_permanent: czar (newt) na stosie, ETB trigger jeszcze nie.
  assert.equal(state.zones.stack.length, 1, 'czar newt na stosie');
  // Rozstrzygnij stos (2 pass per gracz). Po rozstrzygnięciu czaru:
  // newt na bitwisku (nowe id), ETB trigger odpala się.
  resolveStack(state);
  // Po resolveTopOfStack + processTriggers: pendingTriggerTargets z land_you_control
  assert.equal(state.pendingTriggerTargets.length, 1, 'pendingTriggerTargets ma 1');
  // resolve_trigger_target na land
  const r2 = execute(state, { type: 'resolve_trigger_target', playerId: 'p1', targetId: 'land' });
  assert.equal(r2.ok, true, 'resolve_trigger_target');
  // Trigger exile_own_land idzie na stos → rozstrzygnij
  resolveStack(state);
  // Po rozstrzygnięciu: land w exile (id zmieniony przez moveObjectDirectly,
  // bo exile_own_land wygnał go z battlefield), newt (z exiledCardIds) na
  // bitwisku (nowe id po resolvePermanentSpell).
  const exiledLand = [...state.objects.values()].find((o) =>
    o.zone === 'exile' && o.cardId === 'basic-forest'
  );
  assert.ok(exiledLand, 'land wygnały do exile');
  assert.ok(!state.zones.battlefield.some((id) => state.objects.get(id)?.cardId === 'basic-forest'),
    'land nie na bitwisku');
  // newt po ETB ma nowe id (resolveTopOfStack). Szukamy po cardId.
  const newt = [...state.objects.values()].find((o) =>
    o.zone === 'battlefield' && o.cardId === 'wormfang-newt'
  );
  assert.ok(newt, 'newt na bitwisku');
  assert.ok(Array.isArray(newt.exiledCardIds) && newt.exiledCardIds.length > 0, 'newt.exiledCardIds zapisane');
  // LTB: wyślij newta do grobu
  const r3 = execute(state, {
    type: 'move_object', playerId: 'p1', objectId: newt.id, toZone: 'graveyard', newObjectId: 'newt-grave',
  });
  assert.equal(r3.ok, true, 'move_object newt → graveyard: ' + JSON.stringify(r3));
  // LTB trigger (leaves_battlefield) idzie na stos → rozstrzygnij
  resolveStack(state);
  // land wrócił na bitwisko (controler = właściciel p1)
  const landOnBattlefield = [...state.objects.values()].find((o) =>
    o.zone === 'battlefield' && o.cardId === 'basic-forest'
  );
  assert.ok(landOnBattlefield, 'land wrócił na bitwisko');
  assert.equal(landOnBattlefield.controllerId, 'p1', 'land wraca do właściciela (p1)');
});
