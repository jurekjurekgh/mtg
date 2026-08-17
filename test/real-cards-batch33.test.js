// Batch 33 (2026-08-16, lista właściciela) — TRANSZA 1: Somberwald Spider,
// Murder of Crows, Kazuul's Toll Collector. Dane Oracle ze Scryfall.
// Pozostałe karty z listy: docs/plans/2026-08-16-m108-batch33.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addMana } from '../src/engine/resources.js';
import { effectiveKeywords } from '../src/engine/permanents.js';
import { effectiveSpellManaCost } from '../src/engine/spells.js';
import { MANA_COSTS } from '../src/cards/mana-costs-data.js';

const REGISTRY = createCardRegistry();

function newState({ step = 'main' } = {}) {
  const state = createGameState({ seed: 33, players: [{ id: 'p1' }, { id: 'p2' }] });
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
    id, instanceId: `i-${id}`, cardId, controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, spell: data.spell, abilities: data.abilities ?? [],
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [], types: def.types ?? [],
    colors: data.colors ?? [], cardName: def.name,
    equipment: def.equipment, entersWithCounters: def.entersWithCounters,
    entersWithCountersIf: def.entersWithCountersIf,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

// Stwór testowy spoza katalogu (transza 2): prosty obiekt bitwiska.
function putBlank(state, id, controllerId = 'p1', extra = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: extra.cardId ?? 'x-test', controllerId, zone: extra.zone ?? 'battlefield',
    kind: 'creature', power: extra.power ?? 2, toughness: extra.toughness ?? 2, manaCost: 1,
    abilities: [], keywords: extra.keywords ?? [], subtypes: extra.subtypes ?? [],
    types: ['Creature'], colors: extra.colors ?? [], cardName: extra.cardName ?? 'Testowy stwór',
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

const resolveStack = (state) => {
  for (let i = 0; i < 14 && state.zones.stack.length > 0; i += 1) {
    const view = playerView(state, state.turn.priorityPlayerId);
    const next = view.legalCommands.find((c) => c.type.startsWith('resolve_'))
      ?? view.legalCommands.find((c) => c.type === 'pass_priority');
    if (!next) break;
    execute(state, next);
  }
};

// --- Somberwald Spider {4}{G} 2/4 Reach, Morbid ---------------------------

test('Somberwald Spider: dane karty zgodne z Oracle (2/4, reach, {4}{G})', () => {
  const def = REGISTRY.get('somberwald-spider');
  assert.equal(def.power, 2);
  assert.equal(def.toughness, 4);
  assert.equal(def.manaCost, 5);
  assert.deepEqual(def.keywords, ['reach']);
});

test('Somberwald Spider: BEZ śmierci stwora wchodzi jako 2/4 (brak liczników)', () => {
  const state = newState();
  putCard(state, 'spider', 'somberwald-spider', 'p1', 'hand');
  addMana(state, 'p1', 5, { colors: ['G'] });
  const cast = playerView(state, 'p1').legalCommands.find((c) => c.objectId === 'spider');
  assert.ok(cast, 'rzut jest legalny');
  execute(state, cast);
  resolveStack(state);
  const spider = [...state.objects.values()].find((o) => o.cardId === 'somberwald-spider' && o.zone === 'battlefield');
  assert.ok(spider);
  assert.equal(spider.counters?.['+1/+1'] ?? 0, 0, 'morbid nie zachodzi — bez liczników');
});

test('Somberwald Spider: po śmierci stwora wchodzi z dwoma +1/+1 (morbid, CR 614.1c)', () => {
  const state = newState();
  state.creatureDiedThisTurn = true;
  putCard(state, 'spider', 'somberwald-spider', 'p1', 'hand');
  addMana(state, 'p1', 5, { colors: ['G'] });
  const cast = playerView(state, 'p1').legalCommands.find((c) => c.objectId === 'spider');
  execute(state, cast);
  resolveStack(state);
  const spider = [...state.objects.values()].find((o) => o.cardId === 'somberwald-spider' && o.zone === 'battlefield');
  assert.equal(spider.counters?.['+1/+1'] ?? 0, 2, 'morbid: dwa liczniki +1/+1');
  assert.ok(effectiveKeywords(spider, state).includes('reach'));
});

// --- Murder of Crows {3}{U}{U} 4/4 Flying ---------------------------------

test('Murder of Crows: śmierć INNEGO stwora daje opcjonalne dobranie z odrzuceniem', () => {
  const state = newState();
  putCard(state, 'crows', 'murder-of-crows', 'p1');
  addObject(state, {
    id: 'victim', instanceId: 'iv', cardId: 'x-test', controllerId: 'p1', zone: 'battlefield',
    kind: 'creature', power: 1, toughness: 1, manaCost: 1, abilities: [], keywords: [],
    subtypes: [], types: ['Creature'], colors: [],
  });
  state.objects.set('victim', Object.freeze({ ...state.objects.get('victim'), damage: 5 }));
  const before = state.events.length;
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  const fired = state.events.slice(before).some((e) => e.type === 'optional_trigger_required'
    || (e.type === 'ability_triggered' && e.cardId === 'murder-of-crows'));
  assert.ok(fired, `trigger „another creature dies" odpalił: ${state.events.slice(before).map((e) => e.type).join(',')}`);
});

test('Murder of Crows: WŁASNA śmierć NIE odpala triggera (excludeSelf)', () => {
  const state = newState();
  putCard(state, 'crows', 'murder-of-crows', 'p1');
  state.objects.set('crows', Object.freeze({ ...state.objects.get('crows'), damage: 99 }));
  const before = state.events.length;
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  const fired = state.events.slice(before).some((e) => (e.type === 'ability_triggered' || e.type === 'optional_trigger_required')
    && e.cardId === 'murder-of-crows');
  assert.equal(fired, false, 'Oracle mówi „ANOTHER creature dies" — własna śmierć się nie liczy');
});

// --- Kazuul's Toll Collector {2}{R} 3/2 -----------------------------------

test("Kazuul's Toll Collector: {0} przypina wybrany sprzęt do siebie", () => {
  const state = newState();
  putCard(state, 'ogre', 'kazuuls-toll-collector', 'p1');
  putCard(state, 'sword', 'greatsword-of-tyr', 'p1');
  const act = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'ogre' && (c.targets ?? []).includes('sword'));
  assert.ok(act, 'zdolność {0} z celem-sprzętem jest oferowana');
  execute(state, act);
  resolveStack(state);
  assert.equal(state.objects.get('sword').attachedTo, 'ogre', 'sprzęt przypięty do źródła');
});

test("Kazuul's Toll Collector: zdolność tylko jako sorcery (CR 602.5d)", () => {
  const state = newState();
  state.turn = jumpToStep(state.turn, 'upkeep', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  putCard(state, 'ogre', 'kazuuls-toll-collector', 'p1');
  putCard(state, 'sword', 'greatsword-of-tyr', 'p1');
  const offers = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'activate_ability' && c.objectId === 'ogre');
  assert.equal(offers.length, 0, 'poza fazą główną zdolności nie ma w ofercie');
});

test("Kazuul's Toll Collector: sprzet PRZECIWNIKA nie jest celem (you control)", () => {
  const state = newState();
  putCard(state, 'ogre', 'kazuuls-toll-collector', 'p1');
  putCard(state, 'sword', 'greatsword-of-tyr', 'p2');
  const offers = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'activate_ability' && c.objectId === 'ogre');
  assert.equal(offers.length, 0);
});

// =========================================================================
// TRANSZA 2 (M109). Karty: Chill of the Grave, Diplomatic Relations,
// Sagittars' Volley, Nightsnare, Tiller of Flesh, Spare from Evil,
// Spreading Insurrection. Oracle ze Scryfalla (zweryfikowany w sesji).
// =========================================================================

// --- Chill of the Grave {2}{U} Instant ------------------------------------

test('Chill of the Grave: dane karty zgodne z Oracle ({2}{U}, instant)', () => {
  const def = REGISTRY.get('chill-of-the-grave');
  assert.ok(def, 'karta jest w katalogu');
  assert.equal(def.manaCost, 3);
  assert.equal(MANA_COSTS['chill-of-the-grave'], '{2}{U}');
  assert.equal(def.spell.timing, 'instant');
  assert.deepEqual(def.spell.targets.map((t) => t.type), ['creature']);
  assert.deepEqual(def.spell.effects.map((e) => e.type),
    ['tap_permanent', 'dont_untap_next_untap_step', 'draw_cards']);
});

test('Chill of the Grave: BEZ Zombie kosztuje 3, z Zombie 2 (CR 601.2f)', () => {
  const state = newState();
  putCard(state, 'chill', 'chill-of-the-grave', 'p1', 'hand');
  assert.equal(effectiveSpellManaCost(state, state.objects.get('chill')), 3);
  putBlank(state, 'zombie', 'p1', { subtypes: ['Zombie'] });
  assert.equal(effectiveSpellManaCost(state, state.objects.get('chill')), 2,
    'redukcja {1} dotyczy części generycznej');
});

test('Chill of the Grave: tapuje cel, blokuje jego odkręcenie i dobiera kartę', () => {
  const state = newState();
  putCard(state, 'chill', 'chill-of-the-grave', 'p1', 'hand');
  putBlank(state, 'ofiara', 'p2');
  putBlank(state, 'lib-1', 'p1', { zone: 'library' });
  const handBefore = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p1').length;
  addMana(state, 'p1', 3, { colors: ['U'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'chill' && (c.targets ?? []).includes('ofiara'));
  assert.ok(cast, 'rzut z celem jest oferowany');
  execute(state, cast);
  resolveStack(state);
  const ofiara = state.objects.get('ofiara');
  assert.equal(ofiara.tapped, true, 'cel zatapniety');
  assert.equal(ofiara.dontUntapNextUntapStep, 'p2', 'nie odkreci sie w nastepnym untapie kontrolera');
  const handAfter = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p1').length;
  assert.equal(handAfter, handBefore, 'reka: -1 (czar) +1 (dobrana karta)');
});

// --- Diplomatic Relations {2}{G} Instant ----------------------------------

test('Diplomatic Relations: dane karty zgodne z Oracle (dwa cele)', () => {
  const def = REGISTRY.get('diplomatic-relations');
  assert.ok(def, 'karta jest w katalogu');
  assert.equal(def.manaCost, 3);
  assert.equal(MANA_COSTS['diplomatic-relations'], '{2}{G}');
  assert.deepEqual(def.spell.targets.map((t) => t.type), ['creature_you_control', 'creature_opponent_controls']);
  assert.deepEqual(def.spell.effects.map((e) => e.type),
    ['pump', 'grant_keywords_until_end_of_turn', 'damage_from_target_power']);
});

test('Diplomatic Relations: +1/+0, czujność i obrażenia równe MOCY PO buffie', () => {
  const state = newState();
  putCard(state, 'czar', 'diplomatic-relations', 'p1', 'hand');
  putBlank(state, 'moj', 'p1', { power: 2, toughness: 2 });
  putBlank(state, 'wrog', 'p2', { power: 1, toughness: 4 });
  addMana(state, 'p1', 3, { colors: ['G'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'czar'
      && (c.targets ?? [])[0] === 'moj' && (c.targets ?? [])[1] === 'wrog');
  assert.ok(cast, 'rzut z parą celów jest oferowany');
  execute(state, cast);
  resolveStack(state);
  const moj = state.objects.get('moj');
  assert.equal(moj.powerModifier ?? 0, 1, '+1/+0');
  assert.equal(moj.toughnessModifier ?? 0, 0);
  assert.ok(effectiveKeywords(moj, state).includes('vigilance'), 'czujność do końca tury');
  const wrog = state.objects.get('wrog');
  assert.equal(wrog.damage, 3, 'obrażenia = moc 2 + 1 z buffa (CR 608.2c — kolejność efektów)');
});

test('Diplomatic Relations: NIE celuje we własnego stwora przeciwnika slotem 1', () => {
  const state = newState();
  putCard(state, 'czar', 'diplomatic-relations', 'p1', 'hand');
  putBlank(state, 'moj', 'p1');
  putBlank(state, 'wrog', 'p2');
  addMana(state, 'p1', 3, { colors: ['G'] });
  const casts = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'cast_spell' && c.objectId === 'czar');
  assert.ok(casts.length > 0);
  for (const cast of casts) {
    assert.equal(cast.targets[0], 'moj', 'slot 0 = twój stwór');
    assert.equal(cast.targets[1], 'wrog', 'slot 1 = stwór przeciwnika');
  }
});
