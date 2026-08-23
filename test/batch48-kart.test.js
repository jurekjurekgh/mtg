// Batch 48 (M196, 2026-08-23) — 14 kart w NOWYM formacie (artId + set + plan
// podane wprost przez właściciela). Dane Oracle: docs/cards/scryfall-*.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';

const REGISTRY = createCardRegistry();

function game(playerId = 'p1', step = 'main') {
  const state = createGameState({ seed: 196, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function put(state, id, cardId, controllerId, zone = 'battlefield', patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  if (Object.keys(patch).length) {
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
  }
  return state.objects.get(id);
}

function lands(state, n, cardId = 'basic-island', controllerId = 'p1') {
  const subtype = { 'basic-island': 'Island', 'basic-swamp': 'Swamp', 'basic-forest': 'Forest',
    'basic-mountain': 'Mountain', 'basic-plains': 'Plains' }[cardId];
  for (let i = 0; i < n; i += 1) {
    addObject(state, {
      id: `${cardId}-${i}`, instanceId: `i-l${i}`, cardId, controllerId, ownerId: controllerId,
      zone: 'battlefield', kind: 'land', types: ['Basic', 'Land'], subtypes: [subtype],
    });
  }
}

/** Rozstrzyga stos do końca (pass obu stron). */
function resolveStack(state, limit = 12) {
  for (let i = 0; i < limit && state.zones.stack.length > 0; i += 1) {
    const pass = playerView(state, state.turn.priorityPlayerId).legalCommands
      .find((c) => c.type === 'pass_priority');
    if (!pass) break;
    execute(state, pass);
  }
}

// ---- Transza A: karty na istniejących mechanikach -------------------------

test('B48/A1: Thraben Valiant — 2/1 z vigilance', () => {
  const card = REGISTRY.get('thraben-valiant');
  assert.ok(card, 'karta w katalogu');
  assert.deepEqual([card.power, card.toughness], [2, 1]);
  assert.deepEqual(card.keywords, ['vigilance']);
  assert.equal(card.manaCost, 2);
  assert.equal(card.plan, 'Innistrad');
  assert.equal(card.artId, 544, 'artId wprost z promptu właściciela');
});

test('B48/A2: Quicksilver Fisher — ETB dobierz, potem odrzuć', () => {
  const card = REGISTRY.get('quicksilver-fisher');
  assert.deepEqual([card.power, card.toughness], [4, 3]);
  assert.deepEqual(card.keywords, ['flying']);
  const etb = card.abilities.find((a) => a.trigger?.event === 'enter_battlefield');
  assert.ok(etb, 'trigger ETB');
  assert.deepEqual((Array.isArray(etb.effect) ? etb.effect : [etb.effect]).map((e) => e.type),
    ['draw_then_discard'], 'Oracle: „draw a card, then discard a card"');
});

test('B48/A3: Coat with Venom — +1/+2 i deathtouch do końca tury', () => {
  const card = REGISTRY.get('coat-with-venom');
  assert.equal(card.manaCost, 1);
  assert.deepEqual(card.spell.targets, [{ type: 'creature' }]);
  const pump = card.spell.effects.find((e) => e.type === 'pump');
  assert.deepEqual([pump?.power, pump?.toughness], [1, 2]);
  assert.ok(card.spell.effects.some((e) => (e.keywords ?? []).includes('deathtouch')),
    'nadanie deathtouch do końca tury');
});

test('B48/A4: Coat with Venom — pełna ścieżka rzutu na stwora', () => {
  const state = game('p1');
  put(state, 'cre', 'hill-giant', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'spell', 'coat-with-venom', 'p1', 'hand');
  lands(state, 1, 'basic-swamp');
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'spell' && (c.targets ?? []).includes('cre'));
  assert.ok(cast, 'oferta rzutu w stwora');
  assert.ok(execute(state, cast).ok);
  resolveStack(state);
  const buffed = state.objects.get('cre');
  assert.equal((buffed.power ?? 0) + (buffed.powerModifier ?? 0), 4, 'Hill Giant 3/3 → 4/5');
});

test('B48/A5: Frost Lynx — ETB tapuje stwora wroga i blokuje odkręcenie', () => {
  const card = REGISTRY.get('frost-lynx');
  const etb = card.abilities.find((a) => a.trigger?.event === 'enter_battlefield');
  assert.ok(etb, 'trigger ETB');
  assert.equal(etb.trigger.requiresTarget?.type, 'creature_opponent_controls',
    'Oracle: „target creature an opponent controls"');
  assert.deepEqual((Array.isArray(etb.effect) ? etb.effect : [etb.effect]).map((e) => e.type),
    ['tap_permanent', 'lock_untap'], 'tapnij + nie odkręca się w następnym untapie');
});

test('B48/A6: Bedhead Beastie — menace + Mountaincycling {2}', () => {
  const card = REGISTRY.get('bedhead-beastie');
  assert.deepEqual([card.power, card.toughness], [5, 6]);
  assert.ok(card.keywords.includes('menace'));
  const cyc = card.abilities.find((a) => a.keyword === 'cycling');
  assert.ok(cyc, 'zdolność cyklingu');
  assert.equal(cyc.cost.mana, 2, 'Mountaincycling {2}');
  assert.deepEqual(cyc.cycling?.subtypes, ['Mountain'], 'szuka LĄDU typu Mountain');
});

test('B48/A7: Ettercap — stwór 2/5 z reach oraz Adventure „Web Shot"', () => {
  const card = REGISTRY.get('ettercap');
  assert.deepEqual([card.power, card.toughness], [2, 5]);
  assert.deepEqual(card.keywords, ['reach']);
  assert.equal(card.manaCost, 5, '{4}{G}');
  assert.ok(card.adventure, 'karta ma Adventure');
  assert.equal(card.adventure.cost, 3, 'Web Shot za {2}{G}');
  assert.deepEqual(card.adventure.spell.targets, [{ type: 'creature_with_keyword', keyword: 'flying' }],
    'Oracle: „Destroy target creature with flying"');
  assert.deepEqual(card.adventure.spell.effects.map((e) => e.type), ['destroy_permanent']);
});

test('B48/A8: Ettercap — Web Shot realnie niszczy latającego stwora', () => {
  const state = game('p1');
  put(state, 'flyer', 'quicksilver-fisher', 'p2', 'battlefield');
  put(state, 'spell', 'ettercap', 'p1', 'hand');
  lands(state, 3, 'basic-forest');
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_adventure' && c.objectId === 'spell');
  assert.ok(cast, 'oferta rzutu Adventure');
  assert.ok(execute(state, { ...cast, targets: ['flyer'] }).ok);
  resolveStack(state);
  const survivors = [...state.objects.values()].filter((o) => o.zone === 'battlefield' && o.kind === 'creature');
  assert.equal(survivors.length, 0, 'latający stwór zniszczony');
});

test('B48/A9: wszystkie karty transzy A mają plan i artId z promptu', () => {
  for (const [id, artId, plan] of [
    ['thraben-valiant', 544, 'Innistrad'],
    ['quicksilver-fisher', 547, 'Mirrodin'],
    ['frost-lynx', 550, 'Warhammer Fantasy'],
    ['ettercap', 552, 'Forgotten Realms'],
    ['coat-with-venom', 553, 'Tarkir'],
    ['bedhead-beastie', 555, 'Wiedźmin'],
  ]) {
    const card = REGISTRY.get(id);
    assert.ok(card, `${id} w katalogu`);
    assert.equal(card.artId, artId, `${id}: artId`);
    assert.equal(card.plan, plan, `${id}: plan`);
    assert.equal(card.support.status, 'supported', `${id}: w pełni wspierana (ADR 0022)`);
  }
});
