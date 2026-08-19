// Batch 36 (2026-08-19). Transza E1: reuse mechanik.
// Oracle ze Scryfalla (docs/cards/scryfall-*.json). ADR 0010 §2a.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addMana } from '../src/engine/resources.js';
import { effectiveKeywords, effectivePower, effectiveToughness } from '../src/engine/permanents.js';
import { processTriggers } from '../src/engine/triggers.js';
import { MANA_COSTS } from '../src/cards/mana-costs-data.js';
import { attachEquipmentToCreature } from '../src/engine/attachments.js';
import { addCounter } from '../src/engine/counters.js';

const REGISTRY = createCardRegistry();

function newState({ step = 'main' } = {}) {
  const state = createGameState({ seed: 36, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.number = 6;
  return state;
}

function putCard(state, id, cardId, controllerId = 'p1', zone = 'battlefield') {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, spell: data.spell, abilities: data.abilities ?? [],
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [], types: def.types ?? [],
    colors: data.colors ?? [], cardName: def.name,
    aura: data.aura ?? def.aura ?? null,
    costReduction: data.costReduction ?? null,
    equipment: data.equipment ?? def.equipment ?? null,
    suspend: data.suspend ?? null,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

function putBlank(state, id, controllerId, extra = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: extra.cardId ?? `x-${id}`, controllerId,
    ownerId: controllerId, zone: extra.zone ?? 'battlefield', kind: extra.kind ?? 'creature',
    power: extra.power ?? 2, toughness: extra.toughness ?? 2, manaCost: 1,
    abilities: [], keywords: extra.keywords ?? [], subtypes: extra.subtypes ?? [],
    types: extra.types ?? ['Creature'], colors: [], cardName: extra.cardName ?? id,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

const resolveStack = (state) => {
  for (let i = 0; i < 16 && state.zones.stack.length > 0; i += 1) {
    const view = playerView(state, state.turn.priorityPlayerId);
    const next = view.legalCommands.find((c) => c.type.startsWith('resolve_'))
      ?? view.legalCommands.find((c) => c.type === 'pass_priority');
    if (!next) break;
    execute(state, next);
  }
};

// --- Omenspeaker {1}{U} 1/3: ETB Scry 2 ----------------------------------

test('Omenspeaker: dane zgodne z Oracle ({1}{U} 1/3, ETB Scry 2)', () => {
  const def = REGISTRY.get('omenspeaker');
  assert.ok(def);
  assert.equal(def.manaCost, 2);
  assert.equal(MANA_COSTS['omenspeaker'], '{1}{U}');
  assert.equal(def.power, 1);
  assert.equal(def.toughness, 3);
  assert.deepEqual(def.abilities[0].trigger.event, 'enter_battlefield');
  assert.deepEqual(def.abilities[0].effect, { type: 'scry', amount: 2 });
});

test('Omenspeaker: ETB odpala scry 2 (decyzja gracza)', () => {
  const state = newState();
  putCard(state, 'om', 'omenspeaker', 'p1', 'hand');
  putCard(state, 'lib1', 'titans-strength', 'p1', 'library');
  putCard(state, 'lib2', 'twiddle', 'p1', 'library');
  addMana(state, 'p1', 2, { colors: ['U'] });
  execute(state, playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'om'));
  resolveStack(state);
  const scry = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'resolve_scry');
  assert.ok(scry.length > 0, 'scry 2 czeka na decyzję');
});

// --- Feral Invocation {2}{G} Aura (flash) +2/+2 ---------------------------

test('Feral Invocation: dane zgodne z Oracle ({2}{G} flash aura +2/+2)', () => {
  const def = REGISTRY.get('feral-invocation');
  assert.ok(def);
  assert.equal(def.manaCost, 3);
  assert.equal(MANA_COSTS['feral-invocation'], '{2}{G}');
  assert.ok(def.keywords.includes('flash'));
  assert.deepEqual(def.aura.pump, { power: 2, toughness: 2 });
});

test('Feral Invocation: zaczarowany stwór +2/+2, rzut z flash (poza main)', () => {
  const state = newState({ step: 'upkeep' });
  putBlank(state, 'gosc', 'p1', { power: 1, toughness: 1 });
  putCard(state, 'feral', 'feral-invocation', 'p1', 'hand');
  addMana(state, 'p1', 3, { colors: ['G'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'feral'
      && ((c.targets ?? [])[0] === 'gosc' || c.targetId === 'gosc'));
  assert.ok(cast, 'flash pozwala rzucić aurę w upkeepie');
  execute(state, cast);
  resolveStack(state);
  assert.equal(effectivePower(state.objects.get('gosc'), state), 3);
  assert.equal(effectiveToughness(state.objects.get('gosc'), state), 3);
});

// --- Grizzled Leotau {G}{W} 1/5 -------------------------------------------

test('Grizzled Leotau: dane zgodne z Oracle ({G}{W} 1/5 Cat, bez zdolności)', () => {
  const def = REGISTRY.get('grizzled-leotau');
  assert.ok(def);
  assert.equal(def.manaCost, 2);
  assert.equal(MANA_COSTS['grizzled-leotau'], '{G}{W}');
  assert.equal(def.power, 1);
  assert.equal(def.toughness, 5);
  assert.deepEqual(def.colors, ['G', 'W']);
  assert.deepEqual(def.abilities, []);
});

test('Grizzled Leotau: wchodzi na pole bitwy jako 1/5', () => {
  const state = newState();
  putCard(state, 'leo', 'grizzled-leotau', 'p1', 'hand');
  addMana(state, 'p1', 2, { colors: ['G', 'W'] });
  execute(state, playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'leo'));
  resolveStack(state);
  const bf = [...state.objects.values()].find((o) => o.cardId === 'grizzled-leotau' && o.zone === 'battlefield');
  assert.ok(bf, 'leotau na polu bitwy');
  assert.equal(effectivePower(bf, state), 1);
  assert.equal(effectiveToughness(bf, state), 5);
});

// --- Survivor of Korlis {W} 1/1: first strike; {1}{W}, exile z grobu: Scry 2

test('Survivor of Korlis: dane zgodne z Oracle ({W} 1/1 first strike, graveyard scry)', () => {
  const def = REGISTRY.get('survivor-of-korlis');
  assert.ok(def);
  assert.equal(def.manaCost, 1);
  assert.equal(MANA_COSTS['survivor-of-korlis'], '{W}');
  assert.ok(def.keywords.includes('first_strike'));
  const ability = def.abilities[0];
  assert.equal(ability.fromGraveyard, true);
  assert.equal(ability.cost.exileFromGraveyard, true);
  assert.deepEqual(ability.effect, { type: 'scry', amount: 2 });
});

test('Survivor of Korlis: aktywacja z grobu — wygnanie + scry 2', () => {
  const state = newState();
  putCard(state, 'surv', 'survivor-of-korlis', 'p1', 'graveyard');
  putCard(state, 'lib1', 'titans-strength', 'p1', 'library');
  putCard(state, 'lib2', 'twiddle', 'p1', 'library');
  addMana(state, 'p1', 2, { colors: ['W'] });
  const act = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'surv');
  assert.ok(act, 'zdolność z grobu w ofercie');
  execute(state, act);
  resolveStack(state);
  assert.ok(!state.objects.get('surv') || state.objects.get('surv').zone === 'exile', 'karta wygnana');
  assert.ok(playerView(state, 'p1').legalCommands.some((c) => c.type === 'resolve_scry'), 'scry 2 czeka');
});

test('Survivor of Korlis: zdolność NIE oferowana na polu bitwy', () => {
  const state = newState();
  putCard(state, 'surv', 'survivor-of-korlis', 'p1', 'battlefield');
  addMana(state, 'p1', 2, { colors: ['W'] });
  const acts = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'activate_ability' && c.objectId === 'surv');
  assert.equal(acts.length, 0, 'fromGraveyard tylko z grobu');
});

// --- Ghoulcaller's Bell {1} Artifact: {T}: each player mills a card --------

test("Ghoulcaller's Bell: dane zgodne z Oracle ({1} Artifact, {T}: każdy mieli 1)", () => {
  const def = REGISTRY.get('ghoulcallers-bell');
  assert.ok(def);
  assert.equal(def.manaCost, 1);
  assert.equal(MANA_COSTS['ghoulcallers-bell'], '{1}');
  assert.deepEqual(def.types, ['Artifact']);
  const ability = def.abilities[0];
  assert.equal(ability.cost.tap, true);
  assert.deepEqual(ability.effect, { type: 'mill_both_players', amount: 1 });
});

test("Ghoulcaller's Bell: aktywacja mieli PO JEDNEJ karcie obu graczy", () => {
  const state = newState();
  putCard(state, 'bell', 'ghoulcallers-bell', 'p1', 'battlefield');
  putCard(state, 'l1', 'titans-strength', 'p1', 'library');
  putCard(state, 'l2', 'twiddle', 'p1', 'library');
  putCard(state, 'l3', 'twiddle', 'p2', 'library');
  putCard(state, 'l4', 'titans-strength', 'p2', 'library');
  const act = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'bell');
  assert.ok(act, 'aktywacja w ofercie');
  execute(state, act);
  resolveStack(state);
  const p1Grave = state.zones.graveyard.filter((id) => state.objects.get(id)?.controllerId === 'p1');
  const p2Grave = state.zones.graveyard.filter((id) => state.objects.get(id)?.controllerId === 'p2');
  assert.equal(p1Grave.length, 1, 'p1 mieli 1 kartę');
  assert.equal(p2Grave.length, 1, 'p2 mieli 1 kartę');
  assert.equal(state.objects.get('bell').tapped, true, 'dzwonek zatapnięty');
});

// --- Emerald Oryx {3}{G} 2/3: forestwalk -----------------------------------

test('Emerald Oryx: dane zgodne z Oracle ({3}{G} 2/3 Antelope, forestwalk)', () => {
  const def = REGISTRY.get('emerald-oryx');
  assert.ok(def);
  assert.equal(def.manaCost, 4);
  assert.equal(MANA_COSTS['emerald-oryx'], '{3}{G}');
  assert.equal(def.power, 2);
  assert.equal(def.toughness, 3);
  assert.deepEqual(def.abilities[0].landwalk, { subtype: 'Forest' });
});

test('Emerald Oryx: nie może być blokowany, gdy obrońca kontroluje Forest', () => {
  const state = newState();
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.phase = 'combat';
  putCard(state, 'oryx', 'emerald-oryx', 'p1', 'battlefield');
  putBlank(state, 'blk', 'p2', { power: 3, toughness: 3 });
  // obrońca kontroluje Forest
  addObject(state, {
    id: 'forest', instanceId: 'i-forest', cardId: 'x-forest', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', kind: 'land', manaCost: 0, abilities: [], keywords: [],
    subtypes: ['Forest'], types: ['Land'], colors: [],
  });
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['oryx'] }).ok);
  const bad = execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { oryx: ['blk'] } });
  assert.ok(!bad.ok, 'forestwalk: obrońca z Forest nie może blokować');
});

test('Emerald Oryx: może być blokowany, gdy obrońca nie ma Forest', () => {
  const state = newState();
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.phase = 'combat';
  putCard(state, 'oryx', 'emerald-oryx', 'p1', 'battlefield');
  putBlank(state, 'blk', 'p2', { power: 3, toughness: 3 });
  // obrońca kontroluje tylko Island
  addObject(state, {
    id: 'island', instanceId: 'i-island', cardId: 'x-island', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', kind: 'land', manaCost: 0, abilities: [], keywords: [],
    subtypes: ['Island'], types: ['Land'], colors: [],
  });
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['oryx'] }).ok);
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { oryx: ['blk'] } }).ok,
    'bez Foresta blokowanie legalne');
});

// --- Wretched Banquet {B}: destroy if least power --------------------------

test('Wretched Banquet: dane zgodne z Oracle ({B} Sorcery, destroy if least power)', () => {
  const def = REGISTRY.get('wretched-banquet');
  assert.ok(def);
  assert.equal(def.manaCost, 1);
  assert.equal(MANA_COSTS['wretched-banquet'], '{B}');
  assert.deepEqual(def.spell.targets.map((t) => t.type), ['creature']);
  assert.equal(def.spell.effects[0].type, 'destroy_if_least_power');
});

test('Wretched Banquet: niszczy stwora z NAJMNIEJSZĄ mocą', () => {
  const state = newState();
  putBlank(state, 'slaby', 'p1', { power: 1, toughness: 1 });
  putBlank(state, 'mocny', 'p2', { power: 5, toughness: 5 });
  putCard(state, 'wb', 'wretched-banquet', 'p1', 'hand');
  addMana(state, 'p1', 1, { colors: ['B'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'wb' && (c.targets ?? [])[0] === 'slaby');
  assert.ok(cast, 'oferta na najsłabszego');
  execute(state, cast);
  resolveStack(state);
  assert.ok(!state.objects.get('slaby') || state.objects.get('slaby').zone !== 'battlefield', 'najsłabszy zniszczony');
  assert.equal(state.objects.get('mocny').zone, 'battlefield', 'mocny przeżywa');
});

test('Wretched Banquet: nie niszczy, gdy cel NIE ma najmniejszej mocy (fizzle)', () => {
  const state = newState();
  putBlank(state, 'cel', 'p1', { power: 3, toughness: 3 });
  putBlank(state, 'slabszy', 'p2', { power: 1, toughness: 1 });
  putCard(state, 'wb', 'wretched-banquet', 'p1', 'hand');
  addMana(state, 'p1', 1, { colors: ['B'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'wb' && (c.targets ?? [])[0] === 'cel');
  assert.ok(cast, 'cel 3/3 legalny (moc ≥ 1)');
  execute(state, cast);
  resolveStack(state);
  assert.equal(state.objects.get('cel').zone, 'battlefield', 'cel nie najmniejszy — przeżywa');
});

test('Wretched Banquet: remis o najmniejszą moc też niszczy', () => {
  const state = newState();
  putBlank(state, 'cel', 'p1', { power: 1, toughness: 1 });
  putBlank(state, 'rowny', 'p2', { power: 1, toughness: 2 });
  putCard(state, 'wb', 'wretched-banquet', 'p1', 'hand');
  addMana(state, 'p1', 1, { colors: ['B'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'wb' && (c.targets ?? [])[0] === 'cel');
  assert.ok(cast);
  execute(state, cast);
  resolveStack(state);
  assert.ok(!state.objects.get('cel') || state.objects.get('cel').zone !== 'battlefield', 'tied for least — zniszczony');
});

// --- Mysteries of the Deep {4}{U}: Draw 2 / Landfall Draw 3 ----------------

test('Mysteries of the Deep: dane zgodne z Oracle ({4}{U} Instant, conditional draw)', () => {
  const def = REGISTRY.get('mysteries-of-the-deep');
  assert.ok(def);
  assert.equal(def.manaCost, 5);
  assert.equal(MANA_COSTS['mysteries-of-the-deep'], '{4}{U}');
  const eff = def.spell.effects[0];
  assert.equal(eff.type, 'conditional');
  assert.equal(eff.condition, 'landEnteredThisTurn');
  assert.deepEqual(eff.then, { type: 'draw_cards', amount: 3 });
  assert.deepEqual(eff.else, { type: 'draw_cards', amount: 2 });
});

test('Mysteries of the Deep: bez landfalla dobiera 2', () => {
  const state = newState();
  putCard(state, 'lib1', 'titans-strength', 'p1', 'library');
  putCard(state, 'lib2', 'twiddle', 'p1', 'library');
  putCard(state, 'lib3', 'grizzled-leotau', 'p1', 'library');
  putCard(state, 'md', 'mysteries-of-the-deep', 'p1', 'hand');
  const handBefore = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p1').length;
  addMana(state, 'p1', 5, { colors: ['U'] });
  execute(state, playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'md'));
  resolveStack(state);
  const handAfter = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p1').length;
  assert.equal(handAfter, handBefore + 1, 'dobrane 2 (minus zużyta karta)');
});

test('Mysteries of the Deep: z landfallem w tej turze dobiera 3', () => {
  const state = newState();
  state.landEnteredThisTurn = { p1: 1 };
  putCard(state, 'lib1', 'titans-strength', 'p1', 'library');
  putCard(state, 'lib2', 'twiddle', 'p1', 'library');
  putCard(state, 'lib3', 'grizzled-leotau', 'p1', 'library');
  putCard(state, 'lib4', 'wretched-banquet', 'p1', 'library');
  putCard(state, 'md', 'mysteries-of-the-deep', 'p1', 'hand');
  const handBefore = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p1').length;
  addMana(state, 'p1', 5, { colors: ['U'] });
  execute(state, playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'md'));
  resolveStack(state);
  const handAfter = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p1').length;
  assert.equal(handAfter, handBefore + 2, 'dobrane 3 (minus zużyta karta)');
});

// --- Molten Nursery {2}{R} Enchantment (Devoid): colorless cast → 1 dmg ----

test('Molten Nursery: dane zgodne z Oracle (Devoid, bezbarwna, trigger bezbarwnego czaru)', () => {
  const def = REGISTRY.get('molten-nursery');
  assert.ok(def);
  assert.equal(def.manaCost, 3);
  assert.equal(MANA_COSTS['molten-nursery'], '{2}{R}');
  assert.deepEqual(def.colors, [], 'Devoid — karta bezbarwna mimo {R} w koszcie');
  const ability = def.abilities[0];
  assert.equal(ability.trigger.event, 'when_you_cast_spell');
  assert.equal(ability.trigger.condition.spellIsColorless, true);
  assert.equal(ability.trigger.requiresTarget.type, 'any_target');
  assert.deepEqual(ability.effect, { type: 'damage', amount: 1 });
});

test('Molten Nursery: rzucony BEZBARWNY czar zadaje 1 obrażenie dowolnemu celowi', () => {
  const state = newState();
  putCard(state, 'nursery', 'molten-nursery', 'p1', 'battlefield');
  const p2Life = state.players.find((p) => p.id === 'p2').life;
  // bezbarwny czar: artifact spell (Ghoulcaller's Bell — kolory [])
  putCard(state, 'art', 'ghoulcallers-bell', 'p1', 'hand');
  addMana(state, 'p1', 1);
  execute(state, playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'art'));
  // trigger: cel do wybrania PRZED rozstrzygnięciem (resolveStack wybrałby gracza)
  const target = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'resolve_trigger_target' && c.targetId === 'p2');
  assert.ok(target, 'trigger celuje w gracza');
  execute(state, target);
  resolveStack(state);
  assert.equal(state.players.find((p) => p.id === 'p2').life, p2Life - 1, 'gracz-cel dostał 1 obrażenie');
});

test('Molten Nursery: KOLOROWY czar nie odpala triggera', () => {
  const state = newState();
  putCard(state, 'nursery', 'molten-nursery', 'p1', 'battlefield');
  // kolorowy czar (Titan's Strength {R})
  putCard(state, 'ts', 'titans-strength', 'p1', 'hand');
  putBlank(state, 'cel', 'p1', { power: 2, toughness: 2 });
  addMana(state, 'p1', 1, { colors: ['R'] });
  execute(state, playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'ts' && (c.targets ?? [])[0] === 'cel'));
  resolveStack(state);
  const trigger = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'resolve_trigger_target');
  assert.ok(!trigger, 'brak triggera dla kolorowego czaru');
});

// --- Piercing Rays {1}{W}: exile tapped; Forecast tap untapped -------------

test('Piercing Rays: dane zgodne z Oracle (exile tapped + forecast)', () => {
  const def = REGISTRY.get('piercing-rays');
  assert.ok(def);
  assert.equal(def.manaCost, 2);
  assert.equal(MANA_COSTS['piercing-rays'], '{1}{W}');
  assert.deepEqual(def.spell.targets.map((t) => t.type), ['tapped_creature']);
  assert.equal(def.spell.effects[0].type, 'exile_permanent');
  const forecast = def.abilities[0];
  assert.equal(forecast.forecast, true);
  assert.deepEqual(forecast.cost, { mana: 3, colors: ['W'] });
  assert.deepEqual(forecast.targets[0], { type: 'untapped_creature' });
  assert.deepEqual(forecast.effect, { type: 'tap_permanent' });
});

test('Piercing Rays: wygnanie tylko ZATAPNIĘTEGO stwora', () => {
  const state = newState();
  putBlank(state, 'tapniety', 'p2', { power: 2, toughness: 2 });
  state.objects.set('tapniety', Object.freeze({ ...state.objects.get('tapniety'), tapped: true }));
  putBlank(state, 'odkryty', 'p2', { power: 3, toughness: 3 });
  putCard(state, 'pr', 'piercing-rays', 'p1', 'hand');
  addMana(state, 'p1', 2, { colors: ['W'] });
  const casts = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'cast_spell' && c.objectId === 'pr');
  const targets = new Set(casts.flatMap((c) => c.targets ?? []));
  assert.ok(targets.has('tapniety'), 'zatapnięty jest celem');
  assert.ok(!targets.has('odkryty'), 'odkryty NIE jest celem');
});

test('Piercing Rays: forecast w upkeepie — tapuje odkręconego stwora', () => {
  const state = newState({ step: 'upkeep' });
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  putCard(state, 'pr', 'piercing-rays', 'p1', 'hand');
  putBlank(state, 'cel', 'p2', { power: 3, toughness: 3 });
  addMana(state, 'p1', 3, { colors: ['W'] });
  const act = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'pr' && c.abilityIndex === 0 && (c.targets ?? [])[0] === 'cel');
  assert.ok(act, 'forecast w upkeepie w ofercie');
  execute(state, act);
  resolveStack(state);
  assert.equal(state.objects.get('cel').tapped, true, 'cel zatapnięty');
  assert.equal(state.objects.get('pr').zone, 'hand', 'karta ZOSTAJE w ręce (ujawniona)');
});

test('Piercing Rays: forecast NIE oferowany poza upkeepem ani dwa razy', () => {
  const state = newState({ step: 'main' }); // main, nie upkeep
  putCard(state, 'pr', 'piercing-rays', 'p1', 'hand');
  putBlank(state, 'cel', 'p2');
  addMana(state, 'p1', 3, { colors: ['W'] });
  const acts = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'activate_ability' && c.objectId === 'pr' && c.abilityIndex === 0);
  assert.equal(acts.length, 0, 'forecast tylko w upkeepie');
});
