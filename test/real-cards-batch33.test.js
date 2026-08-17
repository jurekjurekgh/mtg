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
import { effectiveKeywords, effectivePower, isDamagePreventedByProtection } from '../src/engine/permanents.js';
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

// --- Sagittars' Volley {2}{G} Instant -------------------------------------

test("Sagittars' Volley: dane karty zgodne z Oracle (cel z lataniem + fala 1 obr.)", () => {
  const def = REGISTRY.get('sagittars-volley');
  assert.ok(def, 'karta jest w katalogu');
  assert.equal(def.manaCost, 3);
  assert.equal(MANA_COSTS['sagittars-volley'], '{2}{G}');
  assert.deepEqual(def.spell.targets.map((t) => t.type), ['creature_with_keyword']);
  assert.equal(def.spell.targets[0].keyword, 'flying');
  assert.deepEqual(def.spell.effects.map((e) => e.type), ['destroy_permanent', 'damage_creatures_with_keyword']);
});

test("Sagittars' Volley: celem jest WYŁĄCZNIE stwór z lataniem", () => {
  const state = newState();
  putCard(state, 'volley', 'sagittars-volley', 'p1', 'hand');
  putBlank(state, 'ptak', 'p2', { keywords: ['flying'] });
  putBlank(state, 'piechur', 'p2');
  addMana(state, 'p1', 3, { colors: ['G'] });
  const casts = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'cast_spell' && c.objectId === 'volley');
  assert.ok(casts.length > 0, 'rzut jest oferowany');
  assert.deepEqual([...new Set(casts.map((c) => c.targets[0]))], ['ptak'],
    'stwór bez latania nie jest legalnym celem');
});

test("Sagittars' Volley: niszczy cel i zadaje 1 obr. LATAJĄCYM przeciwnika (nie swoim)", () => {
  const state = newState();
  putCard(state, 'volley', 'sagittars-volley', 'p1', 'hand');
  putBlank(state, 'cel', 'p2', { keywords: ['flying'], toughness: 5, cardId: 'x-cel' });
  putBlank(state, 'inny-ptak', 'p2', { keywords: ['flying'], toughness: 3 });
  putBlank(state, 'wrogi-piechur', 'p2', { toughness: 3 });
  putBlank(state, 'moj-ptak', 'p1', { keywords: ['flying'], toughness: 3 });
  addMana(state, 'p1', 3, { colors: ['G'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'volley' && c.targets[0] === 'cel');
  execute(state, cast);
  resolveStack(state);
  assert.ok(!state.zones.battlefield.includes('cel'), 'cel zszedł z bitwiska');
  assert.ok([...state.objects.values()].some((o) => o.cardId === 'x-cel' && o.zone === 'graveyard'),
    'cel zniszczony (trafił do grobu)');
  assert.equal(state.objects.get('inny-ptak').damage, 1, 'latający przeciwnika dostaje 1 obrażenie');
  assert.equal(state.objects.get('wrogi-piechur').damage ?? 0, 0, 'bez latania — bez obrażeń');
  assert.equal(state.objects.get('moj-ptak').damage ?? 0, 0, 'własny latający nietknięty');
});

// --- Nightsnare {3}{B} Sorcery --------------------------------------------

function nightsnareState() {
  const state = newState();
  putCard(state, 'snare', 'nightsnare', 'p1', 'hand');
  putBlank(state, 'r1', 'p2', { zone: 'hand', cardId: 'x-stwor-1' });
  putBlank(state, 'r2', 'p2', { zone: 'hand', cardId: 'x-stwor-2' });
  addObject(state, {
    id: 'r3', instanceId: 'i-r3', cardId: 'x-land', controllerId: 'p2', zone: 'hand',
    kind: 'land', manaCost: 0, abilities: [], keywords: [], subtypes: [], types: ['Land'], colors: [],
  });
  addMana(state, 'p1', 4, { colors: ['B'] });
  return state;
}

test('Nightsnare: dane karty zgodne z Oracle ({3}{B}, sorcery, cel-przeciwnik)', () => {
  const def = REGISTRY.get('nightsnare');
  assert.ok(def, 'karta jest w katalogu');
  assert.equal(def.manaCost, 4);
  assert.equal(MANA_COSTS['nightsnare'], '{3}{B}');
  assert.equal(def.spell.timing, 'sorcery');
  assert.deepEqual(def.spell.targets.map((t) => t.type), ['opponent']);
  assert.deepEqual(def.spell.effects.map((e) => e.type), ['reveal_hand_choose_discard']);
});

test('Nightsnare: rzucający wybiera kartę NIE-LĄD z odsłoniętej ręki — cel ją odrzuca', () => {
  const state = nightsnareState();
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'snare');
  assert.ok(cast, 'rzut jest oferowany');
  execute(state, cast);
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  const view = playerView(state, 'p1');
  const offers = view.legalCommands.filter((c) => c.type === 'resolve_discard_choice');
  assert.ok(offers.length > 0, 'to RZUCAJĄCY wybiera kartę (a nie właściciel ręki)');
  assert.ok(!offers.some((c) => c.cardId === 'r3'), 'ląd nie jest wyborem (Oracle: nonland card)');
  assert.ok(offers.some((c) => c.cardId == null), 'jest opcja rezygnacji („If you don\'t\")');
  execute(state, { type: 'resolve_discard_choice', playerId: 'p1', cardId: 'r1' });
  assert.ok(!state.zones.hand.includes('r1'), 'wskazana karta odrzucona');
  assert.equal(state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p2').length, 2,
    'reszta ręki zostaje');
});

test('Nightsnare: BEZ wyboru cel odrzuca DWIE karty (sam decyduje które)', () => {
  const state = nightsnareState();
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'snare');
  execute(state, cast);
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  execute(state, { type: 'resolve_discard_choice', playerId: 'p1', cardId: null });
  const view = playerView(state, 'p2');
  const offers = view.legalCommands.filter((c) => c.type === 'resolve_discard_choice');
  assert.ok(offers.length > 0, 'teraz wybiera WŁAŚCICIEL ręki (CR 701.8a)');
  assert.ok(offers.some((c) => c.cardId === 'r3'), 'przy własnym odrzuceniu ląd też wchodzi w grę');
  for (let i = 0; i < 2; i += 1) {
    const next = playerView(state, 'p2').legalCommands.find((c) => c.type === 'resolve_discard_choice');
    assert.ok(next, `oferta odrzucenia ${i + 1}`);
    execute(state, next);
  }
  assert.equal(state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p2').length, 1,
    'z trzech kart zostaje jedna');
});

test('Nightsnare: ręka bez kart nie-lądów — cel od razu odrzuca dwie', () => {
  const state = newState();
  putCard(state, 'snare', 'nightsnare', 'p1', 'hand');
  for (const id of ['l1', 'l2', 'l3']) {
    addObject(state, {
      id, instanceId: `i-${id}`, cardId: 'x-land', controllerId: 'p2', zone: 'hand',
      kind: 'land', manaCost: 0, abilities: [], keywords: [], subtypes: [], types: ['Land'], colors: [],
    });
  }
  addMana(state, 'p1', 4, { colors: ['B'] });
  execute(state, playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'snare'));
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  const offers = playerView(state, 'p2').legalCommands.filter((c) => c.type === 'resolve_discard_choice');
  assert.ok(offers.length > 0, 'brak nie-lądów = brak wyboru rzucającego, od razu odrzucenie dwóch');
});

// --- Tiller of Flesh {3}{W} 2/4 (incubate 2) ------------------------------

test('Tiller of Flesh: dane karty zgodne z Oracle (2/4, trigger incubate 2)', () => {
  const def = REGISTRY.get('tiller-of-flesh');
  assert.ok(def, 'karta jest w katalogu');
  assert.equal(def.power, 2);
  assert.equal(def.toughness, 4);
  assert.equal(def.manaCost, 4);
  assert.equal(MANA_COSTS['tiller-of-flesh'], '{3}{W}');
  assert.deepEqual(def.subtypes, ['Phyrexian', 'Knight']);
  assert.equal(def.abilities[0].trigger.event, 'you_cast_spell_targeting_permanent');
  assert.equal(def.abilities[0].effect.type, 'incubate');
  assert.equal(def.abilities[0].effect.amount, 2);
});

test('Tiller of Flesh: czar celujący w PERMANENT tworzy Incubator z dwoma +1/+1', () => {
  const state = newState();
  putCard(state, 'tiller', 'tiller-of-flesh', 'p1');
  putCard(state, 'czar', 'awaken-the-bear', 'p1', 'hand');
  putBlank(state, 'moj', 'p1');
  addMana(state, 'p1', 3, { colors: ['G'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'czar' && (c.targets ?? []).includes('moj'));
  assert.ok(cast, 'rzut czaru z celem-permanentem');
  execute(state, cast);
  resolveStack(state);
  const token = [...state.objects.values()].find((o) => o.cardId === 'token_incubator' && o.zone === 'battlefield');
  assert.ok(token, 'powstał token Incubator');
  assert.equal(token.kind, 'artifact', 'Incubator to ARTEFAKT (nie stwór)');
  assert.equal(token.counters?.['+1/+1'] ?? 0, 2, 'dwa liczniki +1/+1');
});

test('Tiller of Flesh: czar BEZ celu-permanentu nie odpala triggera', () => {
  const state = newState();
  putCard(state, 'tiller', 'tiller-of-flesh', 'p1');
  putCard(state, 'czar', 'nightsnare', 'p1', 'hand');
  putBlank(state, 'r1', 'p2', { zone: 'hand', cardId: 'x-stwor-1' });
  addMana(state, 'p1', 4, { colors: ['B'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'czar');
  assert.ok(cast, 'Nightsnare celuje w GRACZA — permanent nie jest celem');
  execute(state, cast);
  const fired = state.events.some((e) => e.type === 'ability_triggered' && e.cardId === 'tiller-of-flesh');
  assert.equal(fired, false, 'gracz nie jest permanentem (CR 109.1)');
});

test('Tiller of Flesh: Incubator za {2} przemienia się w 0/0 Phyrexiana (na stole 2/2)', () => {
  const state = newState();
  putCard(state, 'tiller', 'tiller-of-flesh', 'p1');
  putCard(state, 'czar', 'awaken-the-bear', 'p1', 'hand');
  putBlank(state, 'moj', 'p1');
  addMana(state, 'p1', 3, { colors: ['G'] });
  execute(state, playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'czar' && (c.targets ?? []).includes('moj')));
  resolveStack(state);
  const token = [...state.objects.values()].find((o) => o.cardId === 'token_incubator' && o.zone === 'battlefield');
  addMana(state, 'p1', 2);
  const activate = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === token.id);
  assert.ok(activate, 'zdolność „{2}: Transform this token" jest w ofercie');
  execute(state, activate);
  resolveStack(state);
  const flipped = state.objects.get(token.id);
  assert.equal(flipped.cardId, 'token_phyrexian');
  assert.equal(flipped.kind, 'creature', 'druga strona to artefaktowy STWÓR');
  assert.ok((flipped.types ?? []).includes('Creature') && (flipped.types ?? []).includes('Artifact'));
  assert.equal(flipped.power, 0, 'bazowo 0/0');
  assert.equal(effectivePower(flipped, state), 2, 'dwa +1/+1 zostają na permanencie (CR 707.9)');
});

// --- Spare from Evil {1}{W} Instant ---------------------------------------

test('Spare from Evil: dane karty zgodne z Oracle (protection od nie-Ludzi)', () => {
  const def = REGISTRY.get('spare-from-evil');
  assert.ok(def, 'karta jest w katalogu');
  assert.equal(def.manaCost, 2);
  assert.equal(MANA_COSTS['spare-from-evil'], '{1}{W}');
  assert.deepEqual(def.spell.targets, []);
  assert.equal(def.spell.effects[0].type, 'grant_protection_until_end_of_turn');
  assert.deepEqual(def.spell.effects[0].protection, { notSubtype: 'Human', kind: 'creature' });
});

function spareState() {
  const state = newState();
  putCard(state, 'spare', 'spare-from-evil', 'p1', 'hand');
  putBlank(state, 'moj', 'p1', { power: 2, toughness: 2 });
  putBlank(state, 'zombie', 'p2', { power: 3, toughness: 3, subtypes: ['Zombie'] });
  putBlank(state, 'czlowiek', 'p2', { power: 3, toughness: 3, subtypes: ['Human'] });
  addMana(state, 'p1', 2, { colors: ['W'] });
  const cast = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'spare');
  assert.ok(cast, 'rzut jest oferowany (czar bez celu)');
  execute(state, cast);
  resolveStack(state);
  return state;
}

test('Spare from Evil: stwór NIE-CZŁOWIEK nie może zablokować chronionego (CR 702.16e)', () => {
  const state = spareState();
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['moj'] });
  const options = playerView(state, 'p2').legalCommands.filter((c) => c.type === 'declare_blockers');
  assert.ok(!options.some((c) => (c.assignments.moj ?? []).includes('zombie')),
    'Zombie (nie-Człowiek) nie jest oferowany jako bloker chronionego stwora');
  assert.ok(options.some((c) => (c.assignments.moj ?? []).includes('czlowiek')),
    'Człowiek blokuje normalnie — ochrona dotyczy nie-Ludzi');
  const illegal = execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { moj: ['zombie'] } });
  assert.equal(illegal.ok, false, 'engine odrzuca blok stworem, przed którym jest ochrona');
});

test('Spare from Evil: obrażenia od nie-Człowieka są zapobiegane (CR 702.16d)', () => {
  const state = spareState();
  const moj = state.objects.get('moj');
  assert.equal(isDamagePreventedByProtection(state, moj, state.objects.get('zombie')), true);
  assert.equal(isDamagePreventedByProtection(state, moj, state.objects.get('czlowiek')), false);
});

test('Spare from Evil: ochrona obejmuje TYLKO stwory rzucającego', () => {
  const state = spareState();
  const wrog = state.objects.get('zombie');
  assert.equal(isDamagePreventedByProtection(state, wrog, state.objects.get('moj')), false,
    'stwory przeciwnika nie dostają ochrony');
});

// --- Spreading Insurrection {4}{R} Sorcery (storm) ------------------------

test('Spreading Insurrection: dane karty zgodne z Oracle (storm + kontrola do końca tury)', () => {
  const def = REGISTRY.get('spreading-insurrection');
  assert.ok(def, 'karta jest w katalogu');
  assert.equal(def.manaCost, 5);
  assert.equal(MANA_COSTS['spreading-insurrection'], '{4}{R}');
  assert.equal(def.spell.timing, 'sorcery');
  assert.equal(def.spell.storm, true);
  assert.deepEqual(def.spell.targets.map((t) => t.type), ['creature_opponent_controls']);
  assert.deepEqual(def.spell.effects.map((e) => e.type), ['gain_control_until_end_of_turn']);
});

test('Spreading Insurrection: przejmuje stwora, odkręca go i daje haste', () => {
  const state = newState();
  putCard(state, 'ins', 'spreading-insurrection', 'p1', 'hand');
  putBlank(state, 'wrog', 'p2', { power: 3, toughness: 3 });
  state.objects.set('wrog', Object.freeze({ ...state.objects.get('wrog'), tapped: true }));
  addMana(state, 'p1', 5, { colors: ['R'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'ins' && (c.targets ?? []).includes('wrog'));
  assert.ok(cast, 'rzut z celem jest oferowany');
  execute(state, cast);
  resolveStack(state);
  const wrog = state.objects.get('wrog');
  assert.equal(wrog.controllerId, 'p1', 'kontrola przechodzi do rzucającego');
  assert.equal(wrog.tapped, false, 'stwór odkręcony');
  assert.ok(effectiveKeywords(wrog, state).includes('haste'));
});

test('Spreading Insurrection: storm kopiuje czar za KAŻDY wcześniejszy rzut tury (CR 702.40)', () => {
  // M110: storm jest ZDOLNOŚCIĄ TRIGGEROWANĄ — kopie powstają przy jej
  // rozstrzygnięciu, nie przy rzucie (pełny scenariusz: test/storm-oracle.test.js).
  const state = newState();
  putCard(state, 'ins', 'spreading-insurrection', 'p1', 'hand');
  putBlank(state, 'wrog', 'p2');
  state.spellsCastThisTurn = 2; // dwa czary rzucone wcześniej w tej turze
  addMana(state, 'p1', 5, { colors: ['R'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'ins');
  execute(state, cast);
  assert.equal(state.zones.stack.length, 2, 'czar + zdolność storma');
  resolveStack(state);
  assert.equal(state.zones.stack.length, 0, 'stos się rozstrzygnął');
  const graves = [...state.objects.values()]
    .filter((o) => o.cardId === 'spreading-insurrection' && o.zone === 'graveyard');
  assert.equal(graves.length, 1, 'kopie PRZESTAJĄ ISTNIEĆ — do grobu idzie tylko karta (CR 707.10)');
});

test('Spreading Insurrection: bez wcześniejszych czarów storm nie robi kopii', () => {
  const state = newState();
  putCard(state, 'ins', 'spreading-insurrection', 'p1', 'hand');
  putBlank(state, 'wrog', 'p2');
  addMana(state, 'p1', 5, { colors: ['R'] });
  execute(state, playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'ins'));
  assert.equal(state.zones.stack.length, 2, 'czar + zdolność storma (bez kopii)');
  resolveStack(state);
  const copies = [...state.objects.values()].filter((o) => o.isSpellCopy);
  assert.equal(copies.length, 0, 'zero wcześniejszych czarów = zero kopii');
});
