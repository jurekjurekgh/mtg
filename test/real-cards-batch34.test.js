// Batch 34 (2026-08-17, lista właściciela). Oracle ze Scryfalla, weryfikowany
// kartą po karcie. Transza A: karty oparte o mechaniki, które silnik już zna.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addMana } from '../src/engine/resources.js';
import { effectiveKeywords, effectivePower } from '../src/engine/permanents.js';
import { MANA_COSTS } from '../src/cards/mana-costs-data.js';

const REGISTRY = createCardRegistry();

function newState({ step = 'main' } = {}) {
  const state = createGameState({ seed: 34, players: [{ id: 'p1' }, { id: 'p2' }] });
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
    // Deskryptory przenoszone z karty na obiekt (jak deck.installDeck).
    costReduction: data.costReduction ?? def.costReduction ?? null,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

function putBlank(state, id, controllerId, extra = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: extra.cardId ?? `x-${id}`, controllerId,
    zone: extra.zone ?? 'battlefield', kind: extra.kind ?? 'creature',
    power: extra.power ?? 2, toughness: extra.toughness ?? 2, manaCost: 1,
    abilities: [], keywords: extra.keywords ?? [], subtypes: extra.subtypes ?? [],
    types: extra.types ?? ['Creature'], colors: [], cardName: extra.cardName ?? id,
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

// --- Akrasan Squire {W} 1/1 (exalted) -------------------------------------

test('Akrasan Squire: dane zgodne z Oracle ({W} 1/1, exalted)', () => {
  const def = REGISTRY.get('akrasan-squire');
  assert.ok(def, 'karta jest w katalogu');
  assert.equal(def.manaCost, 1);
  assert.equal(MANA_COSTS['akrasan-squire'], '{W}');
  assert.equal(def.power, 1);
  assert.equal(def.toughness, 1);
  assert.deepEqual(def.keywords, ['exalted']);
  assert.equal(def.abilities[0].trigger.event, 'attacks_alone');
});

test('Akrasan Squire: samotny atakujący dostaje +1/+1 (CR 702.82)', () => {
  const state = newState();
  putCard(state, 'squire', 'akrasan-squire', 'p1');
  putBlank(state, 'wojownik', 'p1', { power: 2, toughness: 2 });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['wojownik'] });
  resolveStack(state);
  assert.equal(effectivePower(state.objects.get('wojownik'), state), 3, 'exalted pompuje samotnego');
});

test('Akrasan Squire: atak DWÓCH stworów nie odpala exalted', () => {
  const state = newState();
  putCard(state, 'squire', 'akrasan-squire', 'p1');
  putBlank(state, 'a', 'p1', { power: 2, toughness: 2 });
  putBlank(state, 'b', 'p1', { power: 2, toughness: 2 });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['a', 'b'] });
  resolveStack(state);
  assert.equal(effectivePower(state.objects.get('a'), state), 2, 'exalted działa tylko przy samotnym ataku');
});

// --- Elgaud Inquisitor {3}{W} 2/2 (lifelink, dies → Spirit 1/1 latający) ---

test('Elgaud Inquisitor: dane zgodne z Oracle (2/2, lifelink, trigger dies)', () => {
  const def = REGISTRY.get('elgaud-inquisitor');
  assert.ok(def, 'karta jest w katalogu');
  assert.equal(def.manaCost, 4);
  assert.equal(MANA_COSTS['elgaud-inquisitor'], '{3}{W}');
  assert.deepEqual(def.keywords, ['lifelink']);
  assert.equal(def.abilities[0].trigger.event, 'dies');
  assert.equal(def.abilities[0].effect.type, 'create_token');
});

test('Elgaud Inquisitor: po śmierci powstaje 1/1 biały Spirit z LATANIEM', () => {
  const state = newState();
  putCard(state, 'inkwizytor', 'elgaud-inquisitor', 'p1');
  state.objects.set('inkwizytor', Object.freeze({ ...state.objects.get('inkwizytor'), damage: 9 }));
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  resolveStack(state);
  const token = [...state.objects.values()].find((o) => o.zone === 'battlefield' && (o.subtypes ?? []).includes('Spirit'));
  assert.ok(token, 'token Spirit powstał');
  assert.equal(token.power, 1);
  assert.equal(token.toughness, 1);
  assert.deepEqual(token.colors, ['W']);
  assert.ok(effectiveKeywords(token, state).includes('flying'), 'Oracle: Spirit z lataniem');
});

// --- Fledgling Imp {2}{B} 2/2 ({B}, odrzuć kartę: latanie) -----------------

test('Fledgling Imp: dane zgodne z Oracle (2/2, koszt {B} + odrzucenie karty)', () => {
  const def = REGISTRY.get('fledgling-imp');
  assert.ok(def, 'karta jest w katalogu');
  assert.equal(def.manaCost, 3);
  assert.equal(MANA_COSTS['fledgling-imp'], '{2}{B}');
  const ability = def.abilities[0];
  assert.equal(ability.cost.mana, 1);
  assert.deepEqual(ability.cost.colors, ['B']);
  assert.equal(ability.cost.discardCard, true);
  assert.equal(ability.cost.tap ?? false, false, 'Oracle NIE wymaga tapnięcia');
});

test('Fledgling Imp: za {B} i odrzucenie karty zyskuje latanie do końca tury', () => {
  const state = newState();
  putCard(state, 'imp', 'fledgling-imp', 'p1');
  putBlank(state, 'reka-1', 'p1', { zone: 'hand', cardId: 'x-reka' });
  addMana(state, 'p1', 1, { colors: ['B'] });
  const act = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'imp');
  assert.ok(act, 'zdolność jest w ofercie (jest karta do odrzucenia i mana)');
  execute(state, act);
  resolveStack(state);
  for (let i = 0; i < 4 && !effectiveKeywords(state.objects.get('imp'), state).includes('flying'); i += 1) {
    const view = playerView(state, state.turn.priorityPlayerId);
    const next = view.legalCommands.find((c) => c.type.startsWith('resolve_'))
      ?? view.legalCommands.find((c) => c.type === 'pass_priority');
    if (!next) break;
    execute(state, next);
  }
  assert.ok(effectiveKeywords(state.objects.get('imp'), state).includes('flying'), 'Imp lata');
});

test('Fledgling Imp: bez karty w ręce zdolności NIE MA w ofercie (koszt nie do zapłacenia)', () => {
  const state = newState();
  putCard(state, 'imp', 'fledgling-imp', 'p1');
  addMana(state, 'p1', 1, { colors: ['B'] });
  const offers = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'activate_ability' && c.objectId === 'imp');
  assert.equal(offers.length, 0, 'CR 601.2h: nieopłacalny koszt = brak legalnej aktywacji');
});

// --- Chained Throatseeker {5}{U} 5/5 (infect, atak tylko w zatrutego) -----

test('Chained Throatseeker: dane zgodne z Oracle (5/5, infect, restrykcja ataku)', () => {
  const def = REGISTRY.get('chained-throatseeker');
  assert.ok(def, 'karta jest w katalogu');
  assert.equal(def.manaCost, 6);
  assert.equal(MANA_COSTS['chained-throatseeker'], '{5}{U}');
  assert.deepEqual(def.keywords, ['infect']);
  assert.ok(def.abilities.some((a) => a.type === 'static' && a.cantAttackUnlessDefenderPoisoned),
    'statyczna restrykcja „can\'t attack unless defending player is poisoned"');
});

test('Chained Throatseeker: bez trucizny u obrońcy NIE MOŻE atakować', () => {
  const state = newState();
  putCard(state, 'horror', 'chained-throatseeker', 'p1');
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  const attacks = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'declare_attackers' && (c.attackerIds ?? []).includes('horror'));
  assert.equal(attacks.length, 0, 'obrońca bez znaczników trucizny — atak nielegalny');
  const forced = execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['horror'] });
  assert.equal(forced.ok, false, 'engine odrzuca też wymuszoną deklarację');
});

test('Chained Throatseeker: zatruty obrońca odblokowuje atak', () => {
  const state = newState();
  putCard(state, 'horror', 'chained-throatseeker', 'p1');
  const p2 = state.players.find((p) => p.id === 'p2');
  p2.poison = 1;
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  const attacks = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'declare_attackers' && (c.attackerIds ?? []).includes('horror'));
  assert.ok(attacks.length > 0, 'przy 1 znaczniku trucizny atak jest legalny');
});

// --- Sterling Keykeeper {1}{W} 2/2 ({2},{T}: tapnij nie-Mount) ------------

test('Sterling Keykeeper: dane zgodne z Oracle (cel: stwór NIE-Mount)', () => {
  const def = REGISTRY.get('sterling-keykeeper');
  assert.ok(def, 'karta jest w katalogu');
  assert.equal(def.manaCost, 2);
  assert.equal(MANA_COSTS['sterling-keykeeper'], '{1}{W}');
  const ability = def.abilities[0];
  assert.equal(ability.cost.mana, 2);
  assert.equal(ability.cost.tap, true);
  assert.deepEqual(ability.targets.map((t) => t.type), ['creature_without_subtype']);
  assert.equal(ability.targets[0].subtype, 'Mount');
  assert.equal(ability.effect.type, 'tap_permanent');
});

test('Sterling Keykeeper: Mount NIE jest celem, zwykły stwór — tak', () => {
  const state = newState();
  putCard(state, 'keykeeper', 'sterling-keykeeper', 'p1');
  putBlank(state, 'kon', 'p2', { subtypes: ['Mount'], cardName: 'Wierzchowiec' });
  putBlank(state, 'zwykly', 'p2', { cardName: 'Zwykły' });
  addMana(state, 'p1', 2);
  const offers = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'activate_ability' && c.objectId === 'keykeeper');
  assert.ok(offers.some((c) => (c.targets ?? []).includes('zwykly')), 'zwykły stwór jest celem');
  assert.ok(!offers.some((c) => (c.targets ?? []).includes('kon')), 'Mount nie jest celem (Oracle)');
  const forced = execute(state, {
    type: 'activate_ability', playerId: 'p1', objectId: 'keykeeper', abilityIndex: 0, targets: ['kon'],
  });
  assert.equal(forced.ok, false, 'oferta = walidacja: wymuszony Mount odrzucony');
});

test('Sterling Keykeeper: aktywacja tapuje wskazanego stwora', () => {
  const state = newState();
  putCard(state, 'keykeeper', 'sterling-keykeeper', 'p1');
  putBlank(state, 'zwykly', 'p2');
  addMana(state, 'p1', 2);
  const act = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'keykeeper' && (c.targets ?? []).includes('zwykly'));
  execute(state, act);
  resolveStack(state);
  assert.equal(state.objects.get('zwykly').tapped, true);
});

// --- Circle of the Land Druid {1}{G} 1/1 ----------------------------------

test('Circle of the Land Druid: dane zgodne z Oracle (mill 4 „you may" + dies → land z grobu)', () => {
  const def = REGISTRY.get('circle-of-the-land-druid');
  assert.ok(def, 'karta jest w katalogu');
  assert.equal(def.manaCost, 2);
  assert.equal(MANA_COSTS['circle-of-the-land-druid'], '{1}{G}');
  const [etb, dies] = def.abilities;
  assert.equal(etb.trigger.event, 'enter_battlefield');
  assert.equal(etb.trigger.mayFire, true, 'Oracle: „you may mill four cards"');
  assert.equal(etb.effect.type, 'mill_cards');
  assert.equal(etb.effect.amount, 4);
  assert.equal(dies.trigger.event, 'dies');
  assert.equal(dies.trigger.requiresTarget.type, 'land_card_in_graveyard');
});

test('Circle of the Land Druid: po śmierci wraca LAND z grobu (nie stwór)', () => {
  const state = newState();
  putCard(state, 'druid', 'circle-of-the-land-druid', 'p1');
  putBlank(state, 'las', 'p1', { zone: 'graveyard', kind: 'land', types: ['Land'], cardName: 'Las' });
  putBlank(state, 'trup', 'p1', { zone: 'graveyard', cardName: 'Trup' });
  state.objects.set('druid', Object.freeze({ ...state.objects.get('druid'), damage: 9 }));
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  const view = playerView(state, 'p1');
  const choices = view.legalCommands.filter((c) => c.type === 'resolve_trigger_target');
  assert.ok(choices.length > 0, `trigger pyta o cel: ${view.legalCommands.map((c) => c.type).join(',')}`);
  assert.ok(choices.some((c) => c.targetId === 'las'), 'land z grobu jest celem');
  assert.ok(!choices.some((c) => c.targetId === 'trup'), 'karta-stwór z grobu NIE jest celem');
  execute(state, choices.find((c) => c.targetId === 'las'));
  resolveStack(state);
  const land = [...state.objects.values()].find((o) => o.cardName === 'Las');
  assert.equal(land.zone, 'hand', 'land wrócił do ręki');
});

// --- Academy Journeymage {4}{U} 3/2 ---------------------------------------

test('Academy Journeymage: dane zgodne z Oracle (obniżka za Wizarda + ETB bounce)', () => {
  const def = REGISTRY.get('academy-journeymage');
  assert.ok(def, 'karta jest w katalogu');
  assert.equal(def.manaCost, 5);
  assert.equal(MANA_COSTS['academy-journeymage'], '{4}{U}');
  assert.deepEqual(def.costReduction, { amount: 1, condition: { controlsSubtype: 'Wizard' } });
  assert.equal(def.abilities[0].trigger.event, 'enter_battlefield');
  assert.equal(def.abilities[0].trigger.requiresTarget.type, 'creature_opponent_controls');
  assert.equal(def.abilities[0].effect.type, 'bounce_permanent');
});

test('Academy Journeymage: z Wizardem na stole kosztuje o {1} mniej (CR 601.2f)', () => {
  const state = newState();
  putCard(state, 'journey', 'academy-journeymage', 'p1', 'hand');
  putBlank(state, 'wrog', 'p2');
  // Bez Wizarda: 4 many nie wystarczą (koszt 5).
  addMana(state, 'p1', 4, { colors: ['U'] });
  assert.equal(
    playerView(state, 'p1').legalCommands.filter((c) => c.type === 'cast_permanent' && c.objectId === 'journey').length,
    0, 'bez Wizarda karta kosztuje pełne 5',
  );
  putBlank(state, 'mag', 'p1', { subtypes: ['Wizard'], cardName: 'Mag' });
  assert.ok(
    playerView(state, 'p1').legalCommands.some((c) => c.type === 'cast_permanent' && c.objectId === 'journey'),
    'z Wizardem 4 many wystarczą',
  );
});

test('Academy Journeymage: ETB odbija stwora PRZECIWNIKA do ręki właściciela', () => {
  const state = newState();
  putCard(state, 'journey', 'academy-journeymage', 'p1', 'hand');
  putBlank(state, 'wrog', 'p2', { cardName: 'Wrogi stwór' });
  putBlank(state, 'moj', 'p1', { cardName: 'Mój stwór' });
  addMana(state, 'p1', 5, { colors: ['U'] });
  execute(state, playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'journey'));
  resolveStack(state);
  const choices = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'resolve_trigger_target');
  assert.ok(choices.length > 0, 'ETB pyta o cel');
  assert.ok(!choices.some((c) => c.targetId === 'moj'), 'własny stwór nie jest celem (Oracle: an opponent controls)');
  execute(state, choices.find((c) => c.targetId === 'wrog'));
  resolveStack(state);
  const bounced = [...state.objects.values()].find((o) => o.cardName === 'Wrogi stwór');
  assert.equal(bounced.zone, 'hand');
  assert.equal(bounced.controllerId, 'p2', 'wraca do ręki WŁAŚCICIELA (CR 400.7)');
});
