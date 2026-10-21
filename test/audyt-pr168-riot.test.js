// Audyt PR #168/A-2 — CR 702.136a (Riot): statyczny efekt zastępujący wejście.
// Wybór zapada podczas rozstrzygnięcia czaru, nie jest triggerem na stosie;
// przeciwnik nie dostaje okna odpowiedzi między wyborem a wejściem.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { effectiveKeywords } from '../src/engine/permanents.js';
import { moveObjectDirectly } from '../src/engine/objects.js';
import { applyEffect } from '../src/engine/effects.js';
import { resolveDelayedReanimate } from '../src/engine/triggers.js';
import { commandLabel, choiceRequestType } from '../src/table/render.js';
import { describeGameEvent } from '../src/table/session.js';

const cards = createCardRegistry();
function game() {
  const state = createGameState({ seed: 1682, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  const card = cards.get('gruul-beastmaster');
  addObject(state, { id: 'gruul', instanceId: 'i-gruul', cardId: card.id,
    controllerId: 'p1', ownerId: 'p1', zone: 'hand',
    ...gameObjectDataOf(card), types: card.types, subtypes: card.subtypes, keywords: card.keywords });
  addMana(state, 'p1', 4, { colors: ['G'] });
  return state;
}
const live = (state) => [...state.objects.values()]
  .find((o) => o.cardId === 'gruul-beastmaster' && o.zone === 'battlefield');
const run = (state, cmd) => {
  const result = execute(state, cmd);
  assert.ok(result.ok, result.reason ?? 'odrzucono');
  return result;
};
function waitForRiot(state) {
  run(state, playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_permanent' && c.objectId === 'gruul'));
  for (let i = 0; i < 6 && !state.pendingRiotChoice && !live(state); i += 1) {
    const playerId = state.turn.priorityPlayerId;
    const pass = playerView(state, playerId).legalCommands.find((c) => c.type === 'pass_priority');
    assert.ok(pass, `gracz ${playerId} odpowiada na CZAR, nie na wybór riot`);
    run(state, pass);
  }
  assert.ok(state.pendingRiotChoice, 'wybór riot wstrzymuje rozstrzygnięcie NA STOSIE');
  assert.equal(live(state), undefined, 'przed wyborem nie ma jeszcze permanenta na polu bitwy');
  assert.equal(state.zones.stack.length, 1, 'czar wciąż jest rozstrzygany na stosie');
  assert.equal(state.pendingModalTrigger, null, 'riot NIE jest modalnym triggerem ETB');
}

test('A-2: licznik jest na stworze już przy wejściu; nie istnieje trigger riot ani okno odpowiedzi', () => {
  const state = game();
  waitForRiot(state);
  assert.deepEqual(playerView(state, 'p1').legalCommands.filter((c) => c.type === 'resolve_riot_choice')
    .map((c) => c.modeIndex), [0, 1]);
  assert.equal(playerView(state, 'p2').legalCommands.some((c) => c.type === 'pass_priority'), false);
  const before = state.events.length;
  const wrong = execute(state, { type: 'pass_priority', playerId: 'p2' });
  assert.equal(wrong.ok, false, 'przeciwnik nie reaguje na wybór podczas rozstrzygnięcia');
  assert.equal(state.events.length, before, 'odmowa jest atomowa');
  const selected = run(state, { type: 'resolve_riot_choice', playerId: 'p1', modeIndex: 0 });
  const entered = selected.events.find((e) => e.type === 'permanent_entered_battlefield');
  assert.equal(entered?.object.counters?.['+1/+1'], 1, 'entry event widzi stwora JUŻ z licznikiem');
  assert.equal(live(state)?.counters?.['+1/+1'], 1);
  assert.equal(live(state)?.power, 2, 'wydruk 2/2, licznik daje efektywną moc 3');
  assert.ok(!effectiveKeywords(live(state), state).includes('haste'), 'bez haste w trybie licznika');
  assert.equal(state.zones.stack.length, 0, 'nie pozostał trigger riot na stosie');
  assert.equal(state.pendingModalTrigger, null);
  assert.equal(state.events.slice(before).some((e) => e.type === 'ability_triggered' && e.cardId === 'gruul-beastmaster'), false);
});

test('A-2: haste to cecha już WCHODZĄCEGO stwora; odmowa złego trybu nie zmienia stanu', () => {
  const state = game();
  waitForRiot(state);
  const before = state.events.length;
  assert.equal(execute(state, { type: 'resolve_riot_choice', playerId: 'p1', modeIndex: 2 }).ok, false);
  assert.equal(execute(state, { type: 'resolve_riot_choice', playerId: 'p2', modeIndex: 1 }).ok, false);
  assert.equal(state.events.length, before);
  assert.equal(live(state), undefined);
  const result = run(state, { type: 'resolve_riot_choice', playerId: 'p1', modeIndex: 1 });
  const entered = result.events.find((e) => e.type === 'permanent_entered_battlefield');
  assert.ok(entered?.object.keywordGrants?.includes('haste'), 'haste jest częścią wejścia, nie późniejszym grantem');
  assert.equal(entered?.object.counters?.['+1/+1'] ?? 0, 0);
  assert.ok(effectiveKeywords(live(state), state).includes('haste'));
  assert.equal(state.zones.stack.length, 0);
  assert.equal(state.pendingRiotChoice, null);
});

test('A-2: każde wystąpienie riot daje osobny wybór PRZED wejściem, bez passu między nimi', () => {
  const state = game();
  const card = state.objects.get('gruul');
  state.objects.set('gruul', Object.freeze({ ...card, keywords: Object.freeze(['riot', 'riot']) }));
  waitForRiot(state);
  assert.equal(state.pendingRiotChoice.count, 2);
  run(state, { type: 'resolve_riot_choice', playerId: 'p1', modeIndex: 0 });
  assert.equal(live(state), undefined, 'pierwszy wybór nie wprowadza stwora');
  assert.deepEqual(state.pendingRiotChoice.choices, [0]);
  assert.equal(playerView(state, 'p2').legalCommands.some((c) => c.type === 'pass_priority'), false);
  const result = run(state, { type: 'resolve_riot_choice', playerId: 'p1', modeIndex: 1 });
  const entry = result.events.find((e) => e.type === 'permanent_entered_battlefield');
  assert.equal(entry?.object.counters?.['+1/+1'], 1);
  assert.ok(entry?.object.keywordGrants?.includes('haste'));
  assert.equal(result.events.filter((e) => e.type === 'permanent_entered_battlefield').length, 1);
});

test('A-2: reanimacja pyta o riot przed przeniesieniem z grobu i przed zdarzeniem wejścia', () => {
  const state = game();
  moveObjectDirectly(state, 'gruul', 'graveyard', 'grave-riot');
  const before = state.events.length;
  const suspended = applyEffect(state, { type: 'return_permanent_from_graveyard' },
    { id: 'source', cardId: 'unbreakable-bond', controllerId: 'p1' }, ['grave-riot']);
  assert.equal(suspended, true, 'rozstrzygany efekt czeka na decyzję');
  assert.equal(state.objects.get('grave-riot')?.zone, 'graveyard', 'bez wcześniejszego wejścia');
  assert.equal(live(state), undefined);
  assert.equal(playerView(state, 'p2').legalCommands.some((c) => c.type === 'pass_priority'), false);
  assert.equal(state.events.slice(before).some((e) => e.type === 'object_moved'), false);
  const result = run(state, { type: 'resolve_riot_choice', playerId: 'p1', modeIndex: 0 });
  assert.equal(result.events.find((e) => e.type === 'object_moved' && e.toZone === 'battlefield')?.object.counters?.['+1/+1'], 1);
  assert.equal(live(state)?.counters?.['+1/+1'], 1);
  assert.equal(state.pendingRiotChoice, null);
});

test('A-2: reanimacja z usunięciem zdolności NIE pyta o riot (Xu-Ifit)', () => {
  const state = game();
  moveObjectDirectly(state, 'gruul', 'graveyard', 'grave-riot');
  const suspended = applyEffect(state, { type: 'return_permanent_from_graveyard', stripAbilities: true },
    { id: 'source', controllerId: 'p1' }, ['grave-riot']);
  assert.equal(Boolean(suspended), false);
  assert.equal(state.pendingRiotChoice, null);
  assert.equal(live(state)?.abilitiesStripped, true);
  assert.equal(live(state)?.counters?.['+1/+1'] ?? 0, 0);
});

test('A-2: Unbreakable Bond z riot czeka na stosie do wyboru, potem kończy rozstrzygnięcie', () => {
  const state = game();
  moveObjectDirectly(state, 'gruul', 'graveyard', 'grave-riot');
  const bond = cards.get('unbreakable-bond');
  addObject(state, { id: 'bond', instanceId: 'i-bond', cardId: bond.id,
    controllerId: 'p1', ownerId: 'p1', zone: 'hand', ...gameObjectDataOf(bond) });
  addMana(state, 'p1', 5, { colors: ['B'] });
  const cast = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_spell'
    && c.objectId === 'bond' && c.targets?.includes('grave-riot'));
  assert.ok(cast, 'czar z celem w grobie jest legalny');
  run(state, cast);
  for (let i = 0; i < 4 && !state.pendingRiotChoice; i += 1) {
    const p = state.turn.priorityPlayerId;
    run(state, playerView(state, p).legalCommands.find((c) => c.type === 'pass_priority'));
  }
  assert.ok(state.pendingRiotChoice);
  assert.equal(state.objects.get('grave-riot')?.zone, 'graveyard');
  assert.equal(state.pendingSpell?.stackId, state.zones.stack.at(-1));
  assert.equal(state.zones.stack.length, 1);
  const result = run(state, { type: 'resolve_riot_choice', playerId: 'p1', modeIndex: 1 });
  assert.ok(effectiveKeywords(live(state), state).includes('haste'));
  assert.equal(live(state)?.counters?.lifelink, 1, 'drugi efekt wejścia reanimacji nadal działa');
  assert.equal(state.zones.stack.length, 0, 'czar dokończył ten sam resolution');
  assert.equal(state.pendingSpell, null);
  assert.equal(result.events.filter((e) => e.type === 'spell_resolved').length, 1);
});

test('A-2: return_with_counter (persist) też wybiera riot przed wejściem i sumuje liczniki', () => {
  const state = game();
  moveObjectDirectly(state, 'gruul', 'graveyard', 'grave-riot');
  const result = applyEffect(state, { type: 'return_with_counter', counter: '-1/-1' },
    state.objects.get('grave-riot'), []);
  assert.equal(result, true);
  assert.equal(state.objects.get('grave-riot')?.zone, 'graveyard');
  const final = run(state, { type: 'resolve_riot_choice', playerId: 'p1', modeIndex: 0 });
  const entered = final.events.find((e) => e.type === 'object_moved' && e.toZone === 'battlefield')?.object;
  assert.equal(entered?.counters?.['+1/+1'], 1);
  assert.equal(entered?.counters?.['-1/-1'], 1, 'drugi licznik efektu istnieje PRZY wejściu');
  assert.equal(live(state)?.counters?.['-1/-1'] ?? 0, 0, 'dopiero SBA anihiluje +1/-1 i -1/-1');
  assert.equal(state.pendingRiotChoice, null);
});

test('A-2: przejęta reanimacja (Puppeteer) oddaje wybór nowemu kontrolerowi', () => {
  const state = game();
  moveObjectDirectly(state, 'gruul', 'graveyard', 'grave-riot');
  const suspended = applyEffect(state, { type: 'reanimate_under_your_control', grantKeywords: ['haste'] },
    { id: 'puppeteer', cardId: 'puppeteer-clique', controllerId: 'p2' }, ['grave-riot']);
  assert.equal(suspended, true);
  assert.equal(state.pendingRiotChoice?.playerId, 'p2');
  assert.equal(playerView(state, 'p1').legalCommands.some((c) => c.type === 'resolve_riot_choice'), false);
  const final = run(state, { type: 'resolve_riot_choice', playerId: 'p2', modeIndex: 0 });
  assert.equal(live(state)?.controllerId, 'p2');
  assert.equal(live(state)?.counters?.['+1/+1'], 1);
  assert.ok(final.events.some((e) => e.type === 'control_changed' && e.controllerId === 'p2'));
});

test('A-2: Dragon Arch — wybór z ręki zatrzymuje wejście i pyta o riot, bez okna odpowiedzi', () => {
  const state = game();
  state.pendingHandCreature = {
    playerId: 'p1', candidateIds: ['gruul'], sourceCardId: 'dragon-arch', restorePriorityTo: 'p2',
  };
  const picked = run(state, { type: 'resolve_hand_creature', playerId: 'p1', targetId: 'gruul' });
  assert.ok(picked.events.some((e) => e.type === 'riot_choice_required'));
  assert.equal(state.objects.get('gruul')?.zone, 'hand');
  assert.equal(live(state), undefined);
  assert.equal(state.pendingHandCreature, null);
  assert.equal(playerView(state, 'p2').legalCommands.some((c) => c.type === 'pass_priority'), false);
  const final = run(state, { type: 'resolve_riot_choice', playerId: 'p1', modeIndex: 1 });
  assert.ok(final.events.find((e) => e.type === 'permanent_entered_battlefield')?.object.keywordGrants?.includes('haste'));
  assert.equal(state.turn.priorityPlayerId, 'p2');
});

test('A-2: powrót z wygnania (Wormfang Newt) pyta WŁAŚCICIELA zanim stwór wejdzie', () => {
  const state = game();
  moveObjectDirectly(state, 'gruul', 'exile', 'exiled-riot');
  const source = { id: 'newt', controllerId: 'p2', exiledCardId: 'exiled-riot' };
  assert.equal(applyEffect(state, { type: 'return_exiled_to_battlefield' }, source, []), true);
  assert.equal(state.pendingRiotChoice?.playerId, 'p1');
  assert.equal(state.objects.get('exiled-riot')?.zone, 'exile');
  const final = run(state, { type: 'resolve_riot_choice', playerId: 'p1', modeIndex: 0 });
  assert.equal(final.events.find((e) => e.type === 'object_moved' && e.toZone === 'battlefield')?.object.counters?.['+1/+1'], 1);
  assert.equal(live(state)?.controllerId, 'p1');
  assert.equal(state.pendingRiotChoice, null);
});

test('A-2: Throne of the Dead Three — riot oraz 3 liczniki pokoju już przy wejściu z biblioteki', () => {
  const state = game();
  moveObjectDirectly(state, 'gruul', 'library', 'library-riot');
  state.pendingRoomTargets.push({
    playerId: 'p1', kind: 'revealed_creature', room: 9, roomName: 'Throne of the Dead Three',
    candidateIds: ['library-riot'], params: { amount: 10, countersAmount: 3 }, restorePriorityTo: 'p2',
  });
  const offer = playerView(state, 'p1').legalCommands.find((c) => c.type === 'resolve_room_target' && c.targetId === 'library-riot');
  run(state, offer);
  assert.equal(state.objects.get('library-riot')?.zone, 'library');
  assert.ok(state.pendingRiotChoice);
  assert.equal(state.pendingRoomTargets.length, 0);
  const final = run(state, { type: 'resolve_riot_choice', playerId: 'p1', modeIndex: 0 });
  const entry = final.events.find((e) => e.type === 'permanent_entered_battlefield');
  assert.equal(entry?.object.counters?.['+1/+1'], 4, 'riot 1 + pokój 3 należą do wejścia');
  assert.equal(entry?.object.cardId, 'gruul-beastmaster');
  assert.equal(final.events.find((e) => e.type === 'room_target_resolved')?.cardId, 'gruul-beastmaster');
  assert.equal(state.turn.priorityPlayerId, 'p2');
});

test('A-2: Moonlit Meditation kopiuje riot tokenów: osobny wybór dla każdej kopii, przed oboma wejściami', () => {
  const state = game();
  moveObjectDirectly(state, 'gruul', 'battlefield', 'beastmaster');
  state.pendingMoonlitChoice = {
    playerId: 'p1', enchantedId: 'beastmaster', effect: { amount: 2 },
    sourceObjectId: 'moonlit', targets: [], restorePriorityTo: 'p2',
  };
  run(state, { type: 'resolve_moonlit_choice', playerId: 'p1', replace: true });
  assert.equal(state.pendingRiotChoice?.entryKind, 'moonlit_copy');
  assert.equal(state.zones.battlefield.filter((id) => state.objects.get(id)?.cardId === 'token_clone').length, 0);
  run(state, { type: 'resolve_riot_choice', playerId: 'p1', modeIndex: 0 });
  assert.equal(state.pendingRiotChoice?.tokenChoices?.length, 1);
  assert.equal(state.zones.battlefield.filter((id) => state.objects.get(id)?.cardId === 'token_clone').length, 0);
  assert.equal(playerView(state, 'p2').legalCommands.some((c) => c.type === 'pass_priority'), false);
  const final = run(state, { type: 'resolve_riot_choice', playerId: 'p1', modeIndex: 1 });
  const tokens = final.events.filter((e) => e.type === 'permanent_entered_battlefield' && e.cardId === 'token_clone');
  assert.equal(tokens.length, 2);
  assert.equal(tokens[0].object.counters?.['+1/+1'], 1);
  assert.ok(!tokens[0].object.keywordGrants?.includes('haste'));
  assert.ok(tokens[1].object.keywordGrants?.includes('haste'));
  assert.equal(tokens[1].object.counters?.['+1/+1'] ?? 0, 0);
  assert.equal(state.turn.priorityPlayerId, 'p2');
});

test('A-2: opóźniona reanimacja pod kontrolą innego gracza pyta jego o riot', () => {
  const state = game();
  moveObjectDirectly(state, 'gruul', 'graveyard', 'grave-riot');
  const delayed = { objectId: 'grave-riot', playerId: 'p2' };
  assert.equal(resolveDelayedReanimate(state, delayed), true);
  assert.equal(state.pendingRiotChoice?.playerId, 'p2');
  assert.equal(state.objects.get('grave-riot')?.zone, 'graveyard');
  const final = run(state, { type: 'resolve_riot_choice', playerId: 'p2', modeIndex: 1 });
  assert.ok(final.events.find((e) => e.type === 'object_moved' && e.delayed)?.object.keywordGrants?.includes('haste'));
  assert.equal(live(state)?.controllerId, 'p2');
  assert.equal(final.events.filter((e) => e.type === 'control_changed').length, 1);
});

test('A-2: Clone Shell odsłania kartę raz, potem wybiera riot przed wejściem z wygnania', () => {
  const state = game();
  moveObjectDirectly(state, 'gruul', 'exile', 'exiled-riot');
  const exiled = state.objects.get('exiled-riot');
  state.objects.set('exiled-riot', Object.freeze({ ...exiled, faceDown: true }));
  const source = { id: 'shell', controllerId: 'p2', exiledCardIds: ['exiled-riot'] };
  assert.equal(applyEffect(state, { type: 'turn_up_imprinted_card' }, source, []), true);
  assert.equal(state.pendingRiotChoice?.playerId, 'p2');
  assert.equal(state.objects.get('exiled-riot')?.zone, 'exile');
  assert.equal(state.events.filter((e) => e.type === 'card_revealed' && e.objectId === 'exiled-riot').length, 1);
  const final = run(state, { type: 'resolve_riot_choice', playerId: 'p2', modeIndex: 0 });
  assert.equal(final.events.find((e) => e.type === 'permanent_entered_battlefield')?.object.counters?.['+1/+1'], 1);
  assert.equal(live(state)?.controllerId, 'p2');
  assert.equal(state.events.filter((e) => e.type === 'card_revealed' && e.objectId === 'exiled-riot').length, 1);
});

test('A-2: Pyxis odkrywa karty, oba wybory riot poprzedzają JEDNOCZESNE wejścia', () => {
  const state = game();
  moveObjectDirectly(state, 'gruul', 'exile', 'exiled-p1');
  const def = cards.get('gruul-beastmaster');
  addObject(state, { id: 'exiled-p2', instanceId: 'i-p2-riot', cardId: def.id,
    controllerId: 'p2', ownerId: 'p2', zone: 'exile', ...gameObjectDataOf(def),
    types: def.types, subtypes: def.subtypes, keywords: def.keywords });
  const nonpermanent = cards.get('unbreakable-bond');
  addObject(state, { id: 'exiled-bond', instanceId: 'i-bond', cardId: nonpermanent.id,
    controllerId: 'p1', ownerId: 'p1', zone: 'exile', ...gameObjectDataOf(nonpermanent) });
  for (const id of ['exiled-p1', 'exiled-p2', 'exiled-bond']) {
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), faceDown: true }));
  }
  const source = { id: 'pyxis', controllerId: 'p1', exiledCardIds: ['exiled-p1', 'exiled-p2', 'exiled-bond'] };
  assert.equal(applyEffect(state, { type: 'turn_up_exiled_and_put_permanents' }, source, []), true);
  assert.equal(state.events.filter((e) => e.type === 'card_revealed').length, 3);
  assert.equal(state.pendingRiotChoice?.playerId, 'p1');
  assert.equal(live(state), undefined);
  run(state, { type: 'resolve_riot_choice', playerId: 'p1', modeIndex: 0 });
  assert.equal(state.pendingRiotChoice?.playerId, 'p2');
  assert.equal(live(state), undefined, 'pierwszy wybór nie wpuszcza ani jednego permanenta');
  assert.equal(playerView(state, 'p1').legalCommands.some((c) => c.type === 'pass_priority'), false);
  const final = run(state, { type: 'resolve_riot_choice', playerId: 'p2', modeIndex: 1 });
  const entries = final.events.filter((e) => e.type === 'permanent_entered_battlefield' && e.fromExile);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].object.counters?.['+1/+1'], 1);
  assert.equal(entries[0].controllerId, 'p1');
  assert.ok(entries[1].object.keywordGrants?.includes('haste'));
  assert.equal(entries[1].controllerId, 'p2');
  assert.equal(state.objects.get('exiled-bond')?.zone, 'exile');
  assert.equal(state.events.filter((e) => e.type === 'card_revealed').length, 3, 'bez podwójnych ujawnień');
});

test('A-2: UI odróżnia wybór riot od triggera; log opisuje obie opcje', () => {
  const state = game();
  waitForRiot(state);
  const view = playerView(state, 'p1');
  const options = view.legalCommands.filter((c) => c.type === 'resolve_riot_choice');
  const session = { nameOf: (id) => cards.get(id)?.name ?? id };
  assert.equal(choiceRequestType(options), 'command');
  assert.match(commandLabel(options[0], session, view), /Gruul Beastmaster.*licznikiem \+1\/\+1/);
  assert.match(commandLabel(options[1], session, view), /Gruul Beastmaster.*pośpiechem/);
  const helpers = { nameOf: session.nameOf, nameOfObject: () => 'Obiekt' };
  const log = describeGameEvent({ type: 'riot_choice_resolved', cardId: 'gruul-beastmaster',
    playerId: 'p1', choices: [0, 1] }, helpers, undefined, { drugaOsoba: false });
  assert.match(log, /Gruul Beastmaster.*licznik \+1\/\+1 i haste/);
});
