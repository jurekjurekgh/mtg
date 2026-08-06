import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { jumpToStep } from '../src/engine/turn.js';
import { untapControlled } from '../src/engine/permanents.js';
import { hasCounter } from '../src/engine/counters.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf, setupCardMatch } from '../src/cards/materialize.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import fs from 'node:fs';

/**
 * Drugi batch realnych kart (Etap 2, ADR 0010): Grizzled Outcasts (ISD,
 * transform DFC), Entrancing Lyre (THB, {X} i blokada odkręcania),
 * Zoraline, Cosmos Caller (BLB, flying/vigilance, tribał nietoperzy,
 * reanimacja z finality). Dane Oracle w docs/cards/scryfall-*.json.
 */

const REGISTRY = createCardRegistry();

function game() {
  return createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
}

/** Dodaje realną kartę jak materializacja: statystyki/abilities/keywords/
 *  subtypy/transformTo z registry. */
function addRealCard(state, id, cardId, controllerId, zone, { tapped = false } = {}) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  let transformTo = null;
  if (def.transformTo) {
    const back = REGISTRY.get(def.transformTo);
    transformTo = { cardId: back.id, power: back.power, toughness: back.toughness, abilities: back.abilities ?? [], keywords: back.keywords ?? [], subtypes: back.subtypes ?? [] };
  }
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, spell: data.spell, abilities: data.abilities ?? [],
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [], transformTo,
  });
  if (tapped) {
    const object = state.objects.get(id);
    state.objects.set(id, Object.freeze({ ...object, tapped: true }));
  }
}

function addSimpleCreature(state, id, cardId, controllerId, { power = 2, toughness = 2, keywords = [] } = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, zone: 'battlefield', kind: 'creature',
    power, toughness, abilities: [], keywords, subtypes: [],
  });
}

/** Pełna runda passów (krok dalej) z triggerami po drodze. */
function passRound(state) {
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
}

// --- Grizzled Outcasts: transform DFC ---------------------------------

test('Grizzled Outcasts: obiekt niesie dane drugiej strony (transformTo)', () => {
  const state = game();
  addRealCard(state, 'wolf', 'grizzled-outcasts', 'p1', 'battlefield');
  const wolf = state.objects.get('wolf');
  assert.equal(wolf.transformTo.cardId, 'krallenhorde-wantons');
  assert.equal(wolf.transformTo.power, 7);
  assert.equal(wolf.transformTo.toughness, 7);
  assert.equal(wolf.cardId, 'grizzled-outcasts');
});

test('Grizzled Outcasts: przy upkeep bez czarów w poprzedniej turze transformuje się na 7/7', () => {
  const state = game();
  addRealCard(state, 'wolf', 'grizzled-outcasts', 'p1', 'battlefield');
  state.lastTurnSpellsCast = 0;
  passRound(state); // untap -> upkeep (trigger transform odpala się w upkeep)
  assert.equal(state.turn.step, 'upkeep');
  const wolf = state.objects.get('wolf');
  assert.equal(wolf.cardId, 'krallenhorde-wantons', 'wilkołak nie przetransformował się');
  assert.equal(wolf.power, 7);
  assert.equal(wolf.toughness, 7);
  assert.equal(wolf.transformTo.cardId, 'grizzled-outcasts', 'brak powrotnej strony');
  assert.ok(state.events.some((e) => e.type === 'object_transformed'), 'brak zdarzenia object_transformed');
});

test('Grizzled Outcasts: transform nie następuje, gdy w poprzedniej turze rzucono czar', () => {
  const state = game();
  addRealCard(state, 'wolf', 'grizzled-outcasts', 'p1', 'battlefield');
  state.lastTurnSpellsCast = 1;
  passRound(state);
  assert.equal(state.objects.get('wolf').cardId, 'grizzled-outcasts');
});

test('Krallenhorde Wantons: transform z powrotem przy 2+ czarach w poprzedniej turze', () => {
  const state = game();
  addRealCard(state, 'wolf', 'krallenhorde-wantons', 'p1', 'battlefield');
  state.lastTurnSpellsCast = 2;
  passRound(state);
  const wolf = state.objects.get('wolf');
  assert.equal(wolf.cardId, 'grizzled-outcasts', 'tylna strona nie wróciła na przód');
  assert.equal(wolf.power, 4);
});

test('licznik czarów poprzedniej tury przelicza się przy zmianie tury (zagrania stwora)', () => {
  const state = game();
  addRealCard(state, 'wolf', 'grizzled-outcasts', 'p1', 'battlefield');
  // p1 zagrywa stwora w main (licznik rośnie), potem pełna tura do upkeep.
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  addMana(state, 'p1', 1);
  addObject(state, { id: 'bear', instanceId: 'ib', cardId: 'highland-game', controllerId: 'p1', zone: 'hand', kind: 'creature', power: 2, toughness: 2, manaCost: 1, abilities: [] });
  execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'bear' });
  assert.equal(state.spellsCastThisTurn, 1);
  // Przewijamy resztę tury p1 i początek tury p2: upkeep p2.
  // (start po main, więc pierwszy napotkany upkeep to tura 2)
  for (let i = 0; i < 14; i += 1) {
    passRound(state);
    if (state.turn.step === 'upkeep') break;
  }
  assert.equal(state.turn.step, 'upkeep');
  assert.equal(state.lastTurnSpellsCast, 1, 'licznik poprzedniej tury nie przeliczony');
  assert.equal(state.objects.get('wolf').cardId, 'grizzled-outcasts', '1 czar w poprzedniej turze nie może transformować');
});

// --- Entrancing Lyre: {X}, tap + blokada odkręcania --------------------

function lyreSetup({ mana = 2 } = {}) {
  const state = game();
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  addRealCard(state, 'lyre', 'entrancing-lyre', 'p1', 'battlefield');
  addSimpleCreature(state, 'enemy-creature', 'highland-game', 'p2', { power: 2, toughness: 2 });
  addMana(state, 'p1', mana);
  return state;
}

function lyreCommand(view) {
  return view.legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === 'lyre');
}

test('Entrancing Lyre: oferta {X} z celem — X równe mocy stwora', () => {
  const state = lyreSetup({ mana: 2 });
  const cmd = lyreCommand(playerView(state, 'p1'));
  assert.ok(cmd, 'brak oferty aktywacji Liry');
  assert.deepEqual(cmd.targets, ['enemy-creature']);
  assert.equal(cmd.xValue, 2, 'X powinno być równe mocy celu');
});

test('Entrancing Lyre: aktywacja płaci manę, tapuje lirę i stwora oraz blokuje odkręcanie', () => {
  const state = lyreSetup({ mana: 2 });
  const cmd = lyreCommand(playerView(state, 'p1'));
  const result = execute(state, cmd);
  assert.equal(result.ok, true, result.events[0]?.reason);
  assert.equal(state.players[0].mana, 0, 'X=2 nie zostało zapłacone');
  assert.equal(state.objects.get('lyre').tapped, true);
  assert.equal(state.objects.get('enemy-creature').tapped, true);
  assert.deepEqual(state.objects.get('enemy-creature').untapLockedBy, ['lyre']);
});

test('Entrancing Lyre: zablokowany stwór nie odkręca się, dopóki lira zatapnięta', () => {
  const state = lyreSetup({ mana: 2 });
  execute(state, lyreCommand(playerView(state, 'p1')));
  // Untap step p2 (kontroler stwora): blokada trzyma.
  untapControlled(state, 'p2');
  assert.equal(state.objects.get('enemy-creature').tapped, true, 'stwór odkręcił się mimo blokady');
  // Untap step p1: „you may choose not to untap" — lira zostaje zatapnięta
  // (deterministycznie zawsze wybieramy „nie odkręcaj" przy aktywnej blokadzie).
  untapControlled(state, 'p1');
  assert.equal(state.objects.get('lyre').tapped, true, 'lira powinna zostać zatapnięta (active lock)');
  // Stwór nadal zablokowany.
  untapControlled(state, 'p2');
  assert.equal(state.objects.get('enemy-creature').tapped, true, 'stwór nadal zablokowany');
});

test('Entrancing Lyre: brak many, zatapnięta lira albo brak celu = brak oferty', () => {
  const noMana = lyreSetup({ mana: 0 });
  assert.equal(lyreCommand(playerView(noMana, 'p1')), undefined, 'oferta bez many');
  const tapped = lyreSetup({ mana: 2 });
  execute(tapped, lyreCommand(playerView(tapped, 'p1')));
  assert.equal(lyreCommand(playerView(tapped, 'p1')), undefined, 'oferta przy zatapniętej lirze');
  const noTarget = lyreSetup({ mana: 2 });
  stateClearCreatures(noTarget);
  assert.equal(lyreCommand(playerView(noTarget, 'p1')), undefined, 'oferta bez celu');
});

function stateClearCreatures(state) {
  state.zones.battlefield = state.zones.battlefield.filter((id) => state.objects.get(id)?.id !== 'enemy-creature');
  state.objects.delete('enemy-creature');
}

test('Entrancing Lyre: materializacja daje kind artifact', () => {
  assert.deepEqual(gameObjectDataOf(REGISTRY.get('entrancing-lyre')), { kind: 'artifact', manaCost: 3, abilities: REGISTRY.get('entrancing-lyre').abilities, colors: [], cardName: 'Entrancing Lyre' });
});

test('artefakt można zagrać z ręki jak permanent (main phase, koszt many)', () => {
  const state = game();
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  addRealCard(state, 'lyre-hand', 'entrancing-lyre', 'p1', 'hand');
  addMana(state, 'p1', 3);
  const view = playerView(state, 'p1');
  const cmd = view.legalCommands.find((c) => c.type === 'cast_permanent' && c.objectId === 'lyre-hand');
  assert.ok(cmd, 'brak oferty zagrania artefaktu');
  const result = execute(state, cmd);
  assert.equal(result.ok, true, result.events[0]?.reason);
  assert.equal(state.players[0].mana, 0);
  const lyre = [...state.objects.values()].find((o) => o.cardId === 'entrancing-lyre' && o.zone === 'battlefield');
  assert.ok(lyre, 'lira nie weszła na bitwisko');
  assert.equal(lyre.kind, 'artifact');
});

// --- Zoraline, Cosmos Caller ------------------------------------------

function zoralineSetup({ mana = 0, graveyardCard = true, zoralineZone = 'battlefield' } = {}) {
  const state = game();
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  addRealCard(state, 'zoraline', 'zoraline', 'p1', zoralineZone);
  if (graveyardCard) {
    addObject(state, { id: 'grave-bear', instanceId: 'igb', cardId: 'highland-game', controllerId: 'p1', zone: 'graveyard', kind: 'creature', power: 2, toughness: 2, manaCost: 1, abilities: [] });
  }
  addMana(state, 'p1', mana);
  return state;
}

test('Zoraline: ma flying i vigilance w widoku i na obiekcie', () => {
  const state = zoralineSetup();
  const view = playerView(state, 'p1').zones.battlefield.find((o) => o.id === 'zoraline');
  assert.deepEqual(view.keywords, ['flying', 'vigilance']);
  assert.deepEqual(view.subtypes, ['Bat', 'Cleric']);
  assert.deepEqual(state.objects.get('zoraline').keywords, ['flying', 'vigilance']);
});

test('Zoraline: flying — nie może być zablokowana przez stwora bez latania', () => {
  const state = zoralineSetup();
  addSimpleCreature(state, 'ground', 'kappa-tech-wrecker', 'p2', { power: 2, toughness: 3 });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['zoraline'] });
  const blocked = execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { zoraline: ['ground'] } });
  assert.equal(blocked.ok, false, 'blok bez latania powinien być odrzucony');
  // Latający blocker jest legalny.
  addSimpleCreature(state, 'sky', 'goblin-piker', 'p2', { power: 3, toughness: 2, keywords: ['flying'] });
  const flyingBlock = execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { zoraline: ['sky'] } });
  assert.equal(flyingBlock.ok, true, flyingBlock.events[0]?.reason);
});

test('Zoraline: vigilance — nie tapuje się przy ataku', () => {
  const state = zoralineSetup();
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['zoraline'] });
  assert.equal(state.objects.get('zoraline').tapped, false, 'vigilance powinno zostawić stwora odkręconego');
});

test('Zoraline: trigger wejścia płaci 2 many i 2 życia i wraca stwora z grobu z finality', () => {
  const state = zoralineSetup({ mana: 5, zoralineZone: 'hand' });
  const result = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'zoraline' });
  assert.equal(result.ok, true, result.events[0]?.reason);
  assert.ok(result.events.some((e) => e.type === 'ability_triggered' && e.trigger === 'enter_battlefield'), 'brak triggera wejścia');
  assert.equal(state.players[0].mana, 0, 'koszt {W}{B} triggera nie zapłacony (3+2=5)');
  assert.equal(state.players[0].life, 18, '2 życia nie zapłacone');
  assert.equal(state.zones.graveyard.some((id) => state.objects.get(id)?.cardId === 'highland-game'), false, 'karta nie wyszła z grobu');
  const returned = [...state.objects.values()].find((o) => o.cardId === 'highland-game' && o.zone === 'battlefield');
  assert.ok(returned, 'karta nie wróciła na bitwisko');
  assert.ok(hasCounter(returned, 'finality'), 'brak finality counter na wskrzeszonej karcie');
});

test('Zoraline: bez celu w grobie trigger nie odpala się (nic nie płaci)', () => {
  const state = zoralineSetup({ mana: 5, graveyardCard: false, zoralineZone: 'hand' });
  const result = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'zoraline' });
  assert.equal(result.ok, true);
  assert.ok(!result.events.some((e) => e.type === 'ability_triggered'), 'trigger nie powinien odpalić się bez celu');
  assert.equal(state.players[0].mana, 2, 'mana nie powinna zostać dopłacona (5 - koszt castu 3 = 2)');
  assert.equal(state.players[0].life, 20);
});

test('Zoraline: bez many trigger nie odpala się (deterministyczne „you may")', () => {
  const state = zoralineSetup({ mana: 3, zoralineZone: 'hand' });
  const result = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'zoraline' });
  assert.equal(result.ok, true);
  assert.ok(!result.events.some((e) => e.type === 'ability_triggered'), 'trigger bez many nie powinien odpalić się');
  assert.equal(state.players[0].mana, 0, 'koszt samego castu to 3');
  assert.equal(state.players[0].life, 20);
});

test('Zoraline: atak odpala trigger ataku (powrót z grobu) i tribał nietoperzy (+1 życie)', () => {
  const state = zoralineSetup({ mana: 2 });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  const result = execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['zoraline'] });
  assert.equal(result.ok, true, result.events[0]?.reason);
  // bat_attacks: +1 życie; attacks: zapłać 2 many + 2 życia i wróć z grobu.
  assert.ok(result.events.some((e) => e.type === 'ability_triggered' && e.trigger === 'bat_attacks'), 'brak triggera nietoperza');
  assert.ok(result.events.some((e) => e.type === 'ability_triggered' && e.trigger === 'attacks'), 'brak triggera ataku');
  assert.equal(state.players[0].life, 19, '1 (bat) - 2 (płatność) powinno dać 19');
  assert.equal(state.players[0].mana, 0);
  const returned = [...state.objects.values()].find((o) => o.cardId === 'highland-game' && o.zone === 'battlefield');
  assert.ok(returned, 'atak nie wskrzesił karty');
});

test('Zoraline: finality — wskrzeszony stwór po śmierci idzie do exile, nie do grobu', () => {
  const state = zoralineSetup({ mana: 5, zoralineZone: 'hand' });
  execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'zoraline' });
  const returned = [...state.objects.values()].find((o) => o.cardId === 'highland-game' && o.zone === 'battlefield');
  // 2 obrażenia na 2/2 z finality (p2 rzuca Shock w swoim priorytecie).
  addObject(state, { id: 'shock', instanceId: 'is', cardId: 'syn-shock', controllerId: 'p2', zone: 'hand', kind: 'spell', manaCost: 1, spell: { timing: 'instant', targets: [{ type: 'creature' }], effects: [{ type: 'damage', amount: 2 }] } });
  addMana(state, 'p2', 1);
  state.turn = { ...state.turn, priorityPlayerId: 'p2' };
  execute(state, { type: 'cast_spell', playerId: 'p2', objectId: 'shock', targets: [returned.id] });
  // Rozstrzygnij stos (obie strony passują).
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  assert.equal(state.zones.exile.some((id) => state.objects.get(id)?.cardId === 'highland-game'), true, 'finality nie wygnało karty');
  assert.equal(state.zones.graveyard.some((id) => state.objects.get(id)?.cardId === 'highland-game'), false, 'karta z finality nie może trafić do grobu');
});

// --- Warstwa danych i talia -------------------------------------------

test('realne karty Batchu 2 mają dane Oracle i status supported', () => {
  assert.equal(REGISTRY.get('grizzled-outcasts').set, 'ISD');
  assert.equal(REGISTRY.get('grizzled-outcasts').transformTo, 'krallenhorde-wantons');
  assert.equal(REGISTRY.get('krallenhorde-wantons').support.status, 'limited');
  assert.equal(REGISTRY.get('entrancing-lyre').set, 'THB');
  assert.equal(REGISTRY.get('zoraline').set, 'BLB');
  assert.equal(REGISTRY.get('zoraline').support.status, 'supported');
  assert.match(REGISTRY.get('zoraline').oracleText, /Flying, vigilance/);
});

