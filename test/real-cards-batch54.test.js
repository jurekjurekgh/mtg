import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { MANA_COSTS } from '../src/cards/mana-costs-data.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { effectivePower, effectiveKeywords } from '../src/engine/permanents.js';
import { moveObjectDirectly } from '../src/engine/objects.js';

const registry = createCardRegistry();
function game(players = ['p1', 'p2']) {
  const state = createGameState({ seed: 54, players: players.map(id => ({ id })) });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  // Prawdziwe przejścia tur, bez przegranej od pustej biblioteki.
  for (const playerId of players) for (let i = 0; i < 3; i++) put(state, `lib-${playerId}-${i}`, 'basic-swamp', playerId, 'library');
  return state;
}
function put(state, id, cardId, playerId = 'p1', zone = 'hand') {
  const def = registry.get(cardId);
  assert.ok(def, `${cardId} w prawdziwym rejestrze`);
  addObject(state, { id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId,
    zone, ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes, keywords: def.keywords });
  return state.objects.get(id);
}
const commands = (s, p = s.turn.priorityPlayerId) => playerView(s, p).legalCommands;
function run(s, cmd) {
  assert.ok(cmd, 'oferta komendy istnieje');
  const r = execute(s, cmd);
  assert.ok(r.ok, JSON.stringify(r.events));
}
function resolve(s) {
  for (let i = 0; s.zones.stack.length && i < 40; i++) {
    const choices = commands(s);
    run(s, choices.find(c => c.type.startsWith('resolve_')) ?? choices.find(c => c.type === 'pass_priority'));
  }
  assert.equal(s.zones.stack.length, 0, 'cały stos rozstrzygnięty');
}
const find = (s, cardId, zone = 'battlefield') => [...s.objects.values()].find(o => o.cardId === cardId && o.zone === zone);
const life = (s, p) => s.players.find(o => o.id === p).life;

for (const [id, artId, set, plan] of [
  ['rotting-legion', 600, 'M11', 'Warhammer Fantasy'],
  ['vampires-bite', 604, 'ZEN', 'Wiedźmin'],
  ['skymarch-bloodletter', 608, 'M19', 'Ixalan'],
]) {
  test(`B54: ${id} — dokładny druk, Oracle, artId, plan, pełne wsparcie`, () => {
    const def = registry.get(id);
    const src = JSON.parse(fs.readFileSync(new URL(`../docs/cards/scryfall-${id}.json`, import.meta.url)));
    assert.ok(def);
    assert.equal(def.artId, artId); assert.equal(def.set, set); assert.equal(def.plan, plan);
    assert.equal(def.oracleText, src.oracle_text);
    assert.equal(def.imageUri, src.image_uris.large);
    assert.equal(def.manaCost, src.cmc); assert.equal(MANA_COSTS[id], src.mana_cost);
    assert.deepEqual(def.colors, src.colors);
    assert.equal(def.support.status, 'supported'); assert.deepEqual(def.support.limitations, []);
    assert.ok(Array.isArray(src.rulings)); assert.equal(src.rulingsPobrano, '2026-09-08');
  });
  test(`B54: ${id} — za mało many / zły kolor, brak oferty i odrzucona komenda`, () => {
    for (const [mana, colors] of [[0, []], [9, ['U','U','U','U','U','U','U','U','U']]]) {
      const s = game(); put(s, 'card', id); put(s, 'tgt', 'rotting-legion', 'p2', 'battlefield');
      if (mana) addMana(s, 'p1', mana, { colors });
      assert.equal(commands(s).some(c => c.objectId === 'card' && c.type.startsWith('cast_')), false);
      const cmd = { type: id === 'vampires-bite' ? 'cast_spell' : 'cast_permanent', playerId: 'p1', objectId: 'card', targets: ['tgt'] };
      const r = execute(s, cmd);
      assert.equal(r.ok, false); assert.ok(r.events.some(e => typeof e.reason === 'string'));
      assert.equal(s.objects.get('card').zone, 'hand');
    }
  });
}

// CR 603.6d (2026-08-07, pobrano 2026-09-08): “Such text is a static
// ability—not a triggered ability—whose effect occurs as part of the event
// that puts the permanent onto the battlefield.”
// https://mtg.wiki/page/Triggered_ability
// Oracle M11: “This creature enters tapped.”
test('B54: Rotting Legion — rzut i ponowne wejście tapped, bez triggera', () => {
  const s = game(); put(s, 'card', 'rotting-legion'); addMana(s, 'p1', 5, { colors: ['B'] });
  run(s, commands(s).find(c => c.type === 'cast_permanent' && c.objectId === 'card'));
  resolve(s);
  const creature = find(s, 'rotting-legion');
  assert.equal(creature.power, 4); assert.equal(creature.toughness, 5);
  assert.equal(creature.tapped, true);
  // Wspólna ścieżka ruchu, nie podmiana gotowego tapped w fixture.
  moveObjectDirectly(s, creature.id, 'graveyard', 'dead');
  moveObjectDirectly(s, 'dead', 'battlefield', 'returned');
  assert.equal(s.objects.get('returned').tapped, true);
});

// CR 702.33a: “You may pay an additional [cost] as you cast this spell.”
// CR 702.33d: “If a spell’s controller declares the intention to pay any of
// that spell’s kicker costs, that spell has been ‘kicked.’”
// https://mtg.wiki/page/Kicker, CR 2026-08-07, pobrano 2026-09-08.
for (const kicked of [false, true]) test(`B54: Vampire's Bite — pump +3/+0, lifelink tylko za kicker (${kicked})`, () => {
  const s = game(); put(s, 'bite', 'vampires-bite'); put(s, 'tgt', 'rotting-legion', 'p2', 'battlefield');
  addMana(s, 'p1', 4, { colors: ['B', 'B'] });
  const offered = commands(s).find(c => c.type === 'cast_spell' && c.objectId === 'bite' && c.targets?.[0] === 'tgt' && Boolean(c.kicked) === kicked);
  run(s, offered);
  assert.equal(s.players[0].mana, kicked ? 0 : 3);
  assert.equal(find(s, 'vampires-bite', 'stack').wasKicked, kicked);
  resolve(s);
  assert.equal(effectivePower(s.objects.get('tgt'), s), 7);
  assert.equal(effectiveKeywords(s.objects.get('tgt'), s).includes('lifelink'), kicked);
  for (let i = 0; s.turn.activePlayerId === 'p1' && i < 40; i++) {
    const cmds = commands(s);
    run(s, cmds.find(c => c.type === 'declare_attackers' && c.attackers.length === 0) ?? cmds.find(c => c.type === 'pass_priority'));
  }
  assert.equal(s.turn.activePlayerId, 'p2');
  assert.equal(effectivePower(s.objects.get('tgt'), s), 4);
  assert.equal(effectiveKeywords(s.objects.get('tgt'), s).includes('lifelink'), false);
});

test("B54: Vampire's Bite — kicker nieopłacalny / cel nie jest stworzeniem", () => {
  const s = game(); put(s, 'bite', 'vampires-bite'); put(s, 'tgt', 'rotting-legion', 'p2', 'battlefield');
  addMana(s, 'p1', 1, { colors: ['B'] });
  assert.equal(commands(s).some(c => c.objectId === 'bite' && c.kicked), false);
  assert.equal(execute(s, { type: 'cast_spell', playerId: 'p1', objectId: 'bite', targets: ['tgt'], kicked: true }).ok, false);
  assert.equal(execute(s, { type: 'cast_spell', playerId: 'p1', objectId: 'bite', targets: ['p2'] }).ok, false);
  assert.equal(s.players[0].mana, 1);
});

// CR 119.3: “If an effect causes a player to gain life or lose life, that
// player’s life total is adjusted accordingly.” https://mtg.wiki/page/Life
// CR 2026-08-07, pobrano 2026-09-08. Oracle: “target opponent”, NIE each.
test('B54: Skymarch Bloodletter — cel to jeden przeciwnik, źródło może zniknąć przed resolution', () => {
  const s = game(['p1', 'p2', 'p3']); put(s, 'blood', 'skymarch-bloodletter');
  addMana(s, 'p1', 3, { colors: ['B'] });
  run(s, commands(s).find(c => c.type === 'cast_permanent' && c.objectId === 'blood'));
  for (let i = 0; !find(s, 'skymarch-bloodletter') && i < 6; i++) run(s, commands(s).find(c => c.type === 'pass_priority'));
  const creature = find(s, 'skymarch-bloodletter');
  assert.ok(creature); assert.ok(effectiveKeywords(creature, s).includes('flying'));
  const choose = commands(s).find(c => c.type.startsWith('resolve_') && (c.targets?.includes('p3') || c.targetId === 'p3'));
  assert.equal(commands(s).some(c => c.type === 'resolve_trigger_target' && c.targetId === 'p1'), false);
  run(s, choose);
  moveObjectDirectly(s, creature.id, 'graveyard', 'blood-dead');
  resolve(s);
  assert.equal(life(s, 'p1'), 21); assert.equal(life(s, 'p2'), 20); assert.equal(life(s, 'p3'), 19);
  assert.equal(s.events.some(e => e.type === 'damage_dealt'), false, 'utrata życia nie jest obrażeniami');
});

test("B54: Vampire's Bite — jeden czarny pip nie opłaca bazy i kickera", () => {
  const s = game(); put(s, 'bite', 'vampires-bite'); put(s, 'tgt', 'rotting-legion', 'p1', 'battlefield');
  // colors to profil KAŻDEJ jednostki, nie lista jednostek: 1B + 3U osobno.
  addMana(s, 'p1', 1, { colors: ['B'] });
  addMana(s, 'p1', 3, { colors: ['U'] });
  assert.ok(commands(s).some(c => c.objectId === 'bite' && !c.kicked));
  assert.equal(commands(s).some(c => c.objectId === 'bite' && c.kicked), false);
  assert.equal(execute(s, { type: 'cast_spell', objectId: 'bite', playerId: 'p1', targets: ['tgt'], kicked: true }).ok, false);
  assert.equal(s.players[0].mana, 4);
});

test("B54: Vampire's Bite — stracony cel nie dostaje efektów; lifelink leczy kontrolera stwora, nie czaru", async () => {
  const { dealNonCombatDamage } = await import('../src/engine/effects.js');
  for (const removed of [false, true]) {
    const s = game(); put(s, 'bite', 'vampires-bite'); put(s, 'tgt', 'rotting-legion', 'p2', 'battlefield');
    addMana(s, 'p1', 4, { colors: ['B', 'B'] });
    run(s, commands(s).find(c => c.objectId === 'bite' && c.kicked && c.targets?.[0] === 'tgt'));
    if (removed) moveObjectDirectly(s, 'tgt', 'graveyard', 'dead');
    resolve(s);
    if (removed) {
      assert.equal(effectivePower(s.objects.get('dead'), s), 4);
      assert.equal(effectiveKeywords(s.objects.get('dead'), s).includes('lifelink'), false);
    } else {
      dealNonCombatDamage(s, s.objects.get('tgt'), 'p1', 3);
      assert.equal(life(s, 'p1'), 17); assert.equal(life(s, 'p2'), 23);
    }
  }
});

test('B54: opis PL i wycena bota rozróżniają efekt opłaconego kickera', async () => {
  const { describeSpellEffects } = await import('../src/table/render.js');
  const { createHeuristicBot } = await import('../src/controllers/heuristic-bot.js');
  const def = registry.get('vampires-bite');
  assert.match(describeSpellEffects(def.spell), /jeśli opłacono kicker:/);
  const s = game(); put(s, 'bite', 'vampires-bite'); put(s, 'tgt', 'rotting-legion', 'p1', 'battlefield');
  addMana(s, 'p1', 4, { colors: ['B', 'B'] });
  const view = playerView(s, 'p1');
  const withoutRider = { ...view, zones: { ...view.zones, hand: view.zones.hand.map(o => o.id !== 'bite' ? o
    : { ...o, spell: { ...o.spell, effects: o.spell.effects.filter(e => !e.condition?.wasKicked) } }) } };
  const score = (v, cmd) => {
    const bot = createHeuristicBot({ seed: 54, randomness: 0 });
    bot.chooseCommand({ ...v, legalCommands: [cmd] });
    return bot.trace()[0].score;
  };
  for (const kicked of [false, true]) {
    const cmd = view.legalCommands.find(c => c.objectId === 'bite' && c.targets?.[0] === 'tgt' && Boolean(c.kicked) === kicked);
    assert.ok(cmd);
    if (kicked) assert.notEqual(score(view, cmd), score(withoutRider, cmd), 'kicker włącza wycenę lifelinku');
    else assert.equal(score(view, cmd), score(withoutRider, cmd), 'bez kickera bot nie wycenia nieistniejącego lifelinku');
  }
});
