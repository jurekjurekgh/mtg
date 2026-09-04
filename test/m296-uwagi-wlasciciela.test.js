// M296 — uwagi właściciela z żywej gry (2026-09-03), znaleziska C i D.
//
// C (Carrion Call): infect token zadał obrażenia stworowi przeciwnika —
//   znacznik −1/−1 POJAWIŁ SIĘ na kaflu, ale „nie było o tym ani słowa ani
//   w Rozgrywce, ani w logu”.
// D (Springbloom Druid): bot zdecydował, że poświęci land — ani Rozgrywka,
//   ani log nie powiedziały, że padła taka decyzja ani KTÓRY land poszedł.
//
// Wspólna przyczyna u korzenia: warstwa stołu czyta zdarzenia komendy
// z `result.events` (streamAutoEvents/apply w session.js), a oba tory
// pushowały część zdarzeń tylko do globalnego `state.events`:
//   C — infect/renown w combat.js woła addCounter (counter_added ląduje w
//       state.events), ale NIE dokłada ich do zwracanej tablicy `events`;
//   D — bramka resolve_springbloom zwraca `slice(-1)`, więc z trzech
//       pushowanych zdarzeń (permanent_sacrificed, springbloom_resolved,
//       search_choice_required) wynik komendy niesie tylko ostatnie.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { BOT_ID, HUMAN_ID, createSession, describeGameEvent } from '../src/table/session.js';
import { parseDeckText } from '../src/cards/deck-text.js';

const REGISTRY = createCardRegistry();

function combatState() {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  return state;
}

function put(state, id, cardId, controllerId, patch = {}) {
  const def = REGISTRY.get(cardId) ?? {
    id: cardId, name: cardId, types: ['Creature'], power: 2, toughness: 2, manaCost: 2,
  };
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone: 'battlefield',
    ...gameObjectDataOf(def), types: def.types ?? ['Creature'], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, ...patch,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

function passUntilCombat(state) {
  for (let i = 0; i < 6; i += 1) {
    const p = playerView(state, state.turn.priorityPlayerId).legalCommands
      .find((c) => c.type === 'pass_priority');
    if (!p) return;
    execute(state, p);
  }
}

// =============================================================================
// C — infect w walce: counter_added musi jechać w result.events, bo to TEN
// strumień czyta stół (log + Rozgrywka).
// =============================================================================

test('M296/C: infect atakujący → result.events niesie counter_added blokera', () => {
  const state = combatState();
  put(state, 'insect', 'token_insect', 'p1');
  put(state, 'bear', 'thornhide-wolves', 'p2');
  execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['insect'] });
  execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { insect: ['bear'] } });
  passUntilCombat(state);
  const r = execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' });
  assert.equal(r.ok, true);
  const added = r.events.filter((e) => e.type === 'counter_added');
  assert.equal(added.length, 1, `result.events bez counter_added: ${r.events.map((e) => e.type).join(',')}`);
  assert.equal(added[0].objectId, 'bear');
  assert.equal(added[0].counter, '-1/-1');
  assert.equal(added[0].amount, 1);
  assert.deepEqual(state.objects.get('bear').counters, { '-1/-1': 1 }, 'znacznik naprawdę wszedł');
});

test('M296/C: infect bloker → result.events niesie counter_added atakującego', () => {
  const state = combatState();
  put(state, 'wolves', 'thornhide-wolves', 'p1');
  put(state, 'insect', 'token_insect', 'p2');
  execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['wolves'] });
  execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { wolves: ['insect'] } });
  passUntilCombat(state);
  const r = execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' });
  assert.equal(r.ok, true);
  const added = r.events.filter((e) => e.type === 'counter_added');
  assert.equal(added.length, 1, `result.events bez counter_added: ${r.events.map((e) => e.type).join(',')}`);
  assert.equal(added[0].objectId, 'wolves');
  assert.equal(added[0].counter, '-1/-1');
});

test('M296/C (ta sama klasa): renown — counter_added też jedzie w result.events', () => {
  const state = combatState();
  put(state, 'sergeant', 'akroan-sergeant', 'p1');
  execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['sergeant'] });
  execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: {} });
  passUntilCombat(state);
  const r = execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' });
  assert.equal(r.ok, true);
  const added = r.events.filter((e) => e.type === 'counter_added');
  assert.equal(added.length, 1, `renown bez counter_added: ${r.events.map((e) => e.type).join(',')}`);
  assert.equal(added[0].counter, '+1/+1');
});

test('M296/C: wpis o liczniku −1/−1 jest czytelny (bez mylącego plusa)', () => {
  const helpers = { nameOf: () => 'Karta', nameOfObject: () => 'Thornhide Wolves' };
  const names = { p1: 'Ty', p2: 'Nieprzyjaciel' };
  const text = describeGameEvent(
    { type: 'counter_added', objectId: 'o', cardId: 'thornhide-wolves', counter: '-1/-1', amount: 1, total: 1 },
    helpers, names,
  );
  assert.doesNotMatch(text, /\+1 licznik/, `mylący plus przy −1/−1: ${text}`);
  assert.match(text, /dostaje 1 licznik -1\/-1/, text);
  // Anty-over-fix: liczniki +1/+1 nadal mają znak plus (M119/Z1).
  const plus = describeGameEvent(
    { type: 'counter_added', objectId: 'o', cardId: 'k', counter: '+1/+1', amount: 2, total: 2 },
    { nameOf: () => 'Karta', nameOfObject: () => 'Stwór' }, names,
  );
  assert.match(plus, /dostaje \+2 liczniki \+1\/\+1/, plus);
});

// =============================================================================
// D — Springbloom Druid: wynik resolve_springbloom musi nieść poświęcenie.
// =============================================================================

function springbloomState() {
  const state = createGameState({ seed: 3, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  put(state, 'druid', 'springbloom-druid', 'p2');
  put(state, 'forest', 'basic-forest', 'p2');
  state.pendingSpringbloom = {
    controllerId: 'p2', sourceId: 'druid', cardId: 'springbloom-druid',
    landIds: ['forest'], mandatory: false,
  };
  return state;
}

test('M296/D: result resolve_springbloom niesie poświęcenie i nazwę landu', () => {
  const state = springbloomState();
  const r = execute(state, { type: 'resolve_springbloom', playerId: 'p2', sacrificeLandId: 'forest' });
  assert.equal(r.ok, true);
  const types = r.events.map((e) => e.type);
  assert.ok(types.includes('permanent_sacrificed'), `brak permanent_sacrificed: ${types.join(',')}`);
  assert.ok(types.includes('springbloom_resolved'), `brak springbloom_resolved: ${types.join(',')}`);
  const resolved = r.events.find((e) => e.type === 'springbloom_resolved');
  assert.equal(resolved.sacrificedLandId, 'forest', 'zdarzenie musi nazwać poświęcony land');
});

test('M296/D: sesja loguje poświęcenie landu (apply czyta result.events)', () => {
  const decks = new Map([
    [HUMAN_ID, parseDeckText(fs.readFileSync('decks/tarkir-bg.txt', 'utf8'), REGISTRY).cardIds],
    [BOT_ID, parseDeckText(fs.readFileSync('decks/wiedzmin.txt', 'utf8'), REGISTRY).cardIds],
  ]);
  const session = createSession({ seed: 5, registry: REGISTRY, decks });
  session.apply(session.view().legalCommands.find((c) => c.type === 'resolve_mulligan_choice'));
  // Stan jak po ETB Springbloom Druida: decyzja poświęcenia landu u człowieka.
  // apply(resolve_springbloom) przechodzi przez ten sam tor co ruch bota:
  // result.events → describeEvent → sessionLog (M296: tu ginęły zdarzenia).
  const st = session.state;
  const forestId = 'sb-forest';
  addObject(st, {
    id: forestId, instanceId: `i-${forestId}`, cardId: 'basic-forest',
    controllerId: HUMAN_ID, ownerId: HUMAN_ID, zone: 'battlefield',
    ...gameObjectDataOf(REGISTRY.get('basic-forest')),
    types: ['Basic', 'Land'], keywords: [], subtypes: ['Forest'],
  });
  addObject(st, {
    id: 'sb-druid', instanceId: 'i-sb-druid', cardId: 'springbloom-druid',
    controllerId: HUMAN_ID, ownerId: HUMAN_ID, zone: 'battlefield',
    ...gameObjectDataOf(REGISTRY.get('springbloom-druid')),
    types: REGISTRY.get('springbloom-druid').types, keywords: [], subtypes: ['Elf', 'Druid'],
  });
  st.pendingSpringbloom = {
    controllerId: HUMAN_ID, sourceId: 'sb-druid', cardId: 'springbloom-druid',
    landIds: [forestId], mandatory: false,
  };
  st.turn.priorityPlayerId = HUMAN_ID;
  const cmd = session.view().legalCommands
    .find((c) => c.type === 'resolve_springbloom' && c.sacrificeLandId === forestId);
  assert.ok(cmd, 'sesja nie oferuje poświęcenia wstrzykniętego landu');
  assert.equal(session.apply(cmd).ok, true);
  const lines = session.log.map((e) => e.text ?? '');
  assert.ok(
    lines.some((t) => /poświęc(asz|a) Forest/.test(t)),
    `log bez wpisu o poświęconym landzie:\n${lines.slice(-12).join('\n')}`,
  );
  assert.ok(
    lines.some((t) => /zostaje poświęcony/.test(t)),
    `log bez permanent_sacrificed:\n${lines.slice(-12).join('\n')}`,
  );
});
