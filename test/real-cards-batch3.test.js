import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { jumpToStep } from '../src/engine/turn.js';
import { runSimulation } from '../src/engine/simulation.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { createAggroBot } from '../src/controllers/aggro-bot.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf, setupCardMatch } from '../src/cards/materialize.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import { verifyReplay, replayFromState } from '../src/engine/replay.js';

/**
 * Trzeci batch realnych kart (Etap 2, ADR 0010): Rupture Spire (CON, land
 * wchodzący tapped + „sacrifice unless you pay {1}"), Leafcrown Dryad (THS,
 * enchantment creature, reach — bestow świadomie bez wsparcia), Prismari
 * Campus (STX, ETB tapped + {4},{T}: Scry 1). Dane Oracle: docs/cards/.
 */

const REGISTRY = createCardRegistry();

function game() {
  return createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
}

function mainPhase(state, playerId = 'p1') {
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  return state;
}

/** Dodaje realną kartę jak materializacja (pełne pola z definicji). */
function addRealCard(state, id, cardId, controllerId, zone, { tapped = false } = {}) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, spell: data.spell, abilities: data.abilities ?? [],
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
    entersWithCounters: data.entersWithCounters ?? def.entersWithCounters ?? null,
    types: def.types ?? [], entersTapped: def.entersTapped ?? false,
  });
  const object = state.objects.get(id);
  if (object.entersWithCounters) {
    const counters = Object.fromEntries(Object.entries(object.entersWithCounters));
    state.objects.set(id, Object.freeze({ ...object, counters }));
  }
  if (tapped) state.objects.set(id, Object.freeze({ ...state.objects.get(id), tapped: true }));
  return state.objects.get(id);
}

function addSimpleCreature(state, id, cardId, controllerId, { power = 2, toughness = 2, keywords = [] } = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, zone: 'battlefield', kind: 'creature',
    power, toughness, abilities: [], keywords, subtypes: [], types: ['Creature'],
  });
}

function findOnBattlefield(state, cardId) {
  return [...state.objects.values()].find((o) => o.cardId === cardId && o.zone === 'battlefield');
}

// --- Rupture Spire: ETB tapped + „sacrifice unless you pay {1}" --------

test('Rupture Spire: materializacja — land, entersTapped, trigger płatności', () => {
  const data = gameObjectDataOf(REGISTRY.get('rupture-spire'));
  assert.equal(data.kind, 'land');
  assert.equal(data.entersTapped, true);
  const trigger = data.abilities.find((a) => a.type === 'triggered');
  assert.equal(trigger.trigger.event, 'enter_battlefield');
  assert.equal(trigger.trigger.payMana, 1);
  assert.equal(trigger.trigger.sacrificeIfUnpaid, true);
});

test('Rupture Spire: wchodzi tapped i nie może dać many w turze wejścia', () => {
  const state = mainPhase(game());
  addRealCard(state, 'spire', 'rupture-spire', 'p1', 'hand');
  addMana(state, 'p1', 1); // płatność z puli — inaczej auto-tap/sacrifice
  const result = execute(state, { type: 'play_land', playerId: 'p1', objectId: 'spire' });
  assert.equal(result.ok, true, result.events[0]?.reason);
  const spire = findOnBattlefield(state, 'rupture-spire');
  assert.equal(spire.tapped, true, 'Spire nie wszedł tapped');
  const tapOffer = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'tap_for_mana' && c.objectId === spire.id);
  assert.equal(tapOffer, undefined, 'zatapnięty Spire nie może być źródłem many');
});

test('Rupture Spire: z maną w puli płaci {1} i zostaje (trigger obowiązkowy)', () => {
  const state = mainPhase(game());
  addRealCard(state, 'spire', 'rupture-spire', 'p1', 'hand');
  addMana(state, 'p1', 1);
  const result = execute(state, { type: 'play_land', playerId: 'p1', objectId: 'spire' });
  assert.equal(result.ok, true);
  const triggered = result.events.find((e) => e.type === 'ability_triggered' && e.trigger === 'enter_battlefield');
  assert.ok(triggered, 'brak triggera wejścia');
  assert.equal(triggered.paid, 1, 'płatność {1} nie odnotowana');
  assert.equal(triggered.sacrificed, undefined, 'Spire nie może być poświęcony przy pełnej puli');
  assert.equal(state.players[0].mana, 0, '1 many nie zostało dopłacone');
  assert.ok(findOnBattlefield(state, 'rupture-spire'), 'Spire nie jest na bitwisku');
});

test('Rupture Spire: bez many auto-tapuje innego nietapniętego landa i płaci', () => {
  const state = mainPhase(game());
  addRealCard(state, 'forest', 'syn-forest', 'p1', 'battlefield');
  addRealCard(state, 'spire', 'rupture-spire', 'p1', 'hand');
  const result = execute(state, { type: 'play_land', playerId: 'p1', objectId: 'spire' });
  assert.equal(result.ok, true, result.events[0]?.reason);
  assert.ok(result.events.some((e) => e.type === 'mana_produced'), 'brak produkcji many przez auto-tap');
  const triggered = result.events.find((e) => e.type === 'ability_triggered' && e.trigger === 'enter_battlefield');
  assert.equal(triggered.paid, 1);
  assert.equal(triggered.autoTapped, 'forest', 'trigger nie odnotował auto-tapu');
  assert.equal(state.objects.get('forest').tapped, true, 'forest nie został auto-tapnięty');
  assert.ok(findOnBattlefield(state, 'rupture-spire'), 'Spire nie może zostać poświęcony, gdy da się zapłacić');
});

test('Rupture Spire: bez many i bez landów do zatapnięcia jest poświęcany', () => {
  const state = mainPhase(game());
  addRealCard(state, 'spire', 'rupture-spire', 'p1', 'hand');
  const result = execute(state, { type: 'play_land', playerId: 'p1', objectId: 'spire' });
  assert.equal(result.ok, true, result.events[0]?.reason);
  assert.ok(result.events.some((e) => e.type === 'permanent_sacrificed' && e.cardId === 'rupture-spire'), 'brak zdarzenia poświęcenia');
  assert.ok(result.events.some((e) => e.type === 'ability_triggered' && e.sacrificed === true), 'trigger nie odnotował poświęcenia');
  assert.equal(findOnBattlefield(state, 'rupture-spire'), undefined, 'Spire nie może zostać na bitwisku');
  assert.ok(state.zones.graveyard.some((id) => state.objects.get(id)?.cardId === 'rupture-spire'), 'Spire nie trafił do grobu');
});

test('Rupture Spire: nie może zatapnięć samego siebie do własnej płatności (wchodzi tapped)', () => {
  const state = mainPhase(game());
  // Jedyny land na stole to wchodzący Spire — auto-tap szuka INNEGO landa.
  addRealCard(state, 'spire', 'rupture-spire', 'p1', 'hand');
  const result = execute(state, { type: 'play_land', playerId: 'p1', objectId: 'spire' });
  assert.equal(result.ok, true);
  assert.ok(result.events.some((e) => e.type === 'permanent_sacrificed'), 'Spire miał poświęcić się bez innego landa');
});

test('Rupture Spire: land drop zużywa limit na turę (drugi land tej tury odrzucony)', () => {
  const state = mainPhase(game());
  addRealCard(state, 'spire', 'rupture-spire', 'p1', 'hand');
  addMana(state, 'p1', 1);
  execute(state, { type: 'play_land', playerId: 'p1', objectId: 'spire' });
  addRealCard(state, 'forest', 'syn-forest', 'p1', 'hand');
  const second = execute(state, { type: 'play_land', playerId: 'p1', objectId: 'forest' });
  assert.equal(second.ok, false);
  assert.match(second.events[0].reason, /illegal_land/);
});

// --- Leafcrown Dryad: enchantment creature z reach ---------------------

test('Leafcrown Dryad: materializacja i definicja — typy, reach, subtypy', () => {
  const def = REGISTRY.get('leafcrown-dryad');
  assert.equal(def.set, 'THS');
  assert.deepEqual(def.types, ['Enchantment', 'Creature']);
  assert.deepEqual(def.subtypes, ['Nymph', 'Dryad']);
  assert.deepEqual(def.keywords, ['reach']);
  const data = gameObjectDataOf(def);
  assert.deepEqual({ kind: data.kind, power: data.power, toughness: data.toughness, manaCost: data.manaCost }, { kind: 'creature', power: 2, toughness: 2, manaCost: 2 });
});

test('Leafcrown Dryad: legalny cast za {1}{G} (2 many); bestow nie istnieje jako osobny koszt', () => {
  const state = mainPhase(game());
  addRealCard(state, 'dryad', 'leafcrown-dryad', 'p1', 'hand');
  addMana(state, 'p1', 4); // nawet z nadmiarem many płaci zwykły koszt 2 (bestow bez wsparcia)
  const result = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'dryad' });
  assert.equal(result.ok, true, result.events[0]?.reason);
  assert.equal(state.players[0].mana, 2, 'Dryad kosztuje 2, nie bestow {3}{G}=4');
  const dryad = findOnBattlefield(state, 'leafcrown-dryad');
  assert.equal(dryad.kind, 'creature');
  assert.deepEqual([...dryad.types], ['Enchantment', 'Creature']);
  assert.deepEqual([...dryad.keywords], ['reach']);
  assert.equal(dryad.attachedTo ?? null, null, 'Dryad nie jest aurą (bestow bez wsparcia)');
});

test('Leafcrown Dryad: bezwzględy brak many odrzuca cast (nielegalne zagranie)', () => {
  const state = mainPhase(game());
  addRealCard(state, 'dryad', 'leafcrown-dryad', 'p1', 'hand');
  const result = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'dryad' });
  assert.equal(result.ok, false);
  assert.match(result.events[0].reason, /illegal_cast/);
});

function combatWithFlyingAttacker({ blockerKeywords = [] } = {}) {
  const state = game();
  addSimpleCreature(state, 'flyer', 'syn-pummeler', 'p1', { power: 3, toughness: 2, keywords: ['flying'] });
  addRealCard(state, 'dryad', 'leafcrown-dryad', 'p2', 'battlefield');
  addSimpleCreature(state, 'groundling', 'syn-razorback', 'p2', { power: 2, toughness: 2, keywords: blockerKeywords });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['flyer'] });
  return state;
}

test('Leafcrown Dryad: reach pozwala blokować latającego atakującego', () => {
  const state = combatWithFlyingAttacker();
  const options = playerView(state, 'p2').legalCommands.filter((c) => c.type === 'declare_blockers');
  const withDryad = options.find((c) => (c.assignments.flyer ?? []).includes('dryad'));
  assert.ok(withDryad, 'legalCommands nie oferuje bloku latającego Dryadem');
  const result = execute(state, withDryad);
  assert.equal(result.ok, true, result.events[0]?.reason);
});

test('Leafcrown Dryad: stwór bez reach/flying dalej NIE może blokować latającego', () => {
  const state = combatWithFlyingAttacker();
  const illegal = execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { flyer: ['groundling'] } });
  assert.equal(illegal.ok, false);
  assert.match(illegal.events[0].reason, /illegal_blockers/);
  // …a jako kontrolka ten sam stan z Dryadem przechodzi (poprzedni test).
});

test('Kappa Tech-Wrecker: trigger „artifact or enchantment" wygania Dryada (enchantment creature)', () => {
  const state = game();
  addRealCard(state, 'kappa', 'kappa-tech-wrecker', 'p1', 'battlefield');
  addRealCard(state, 'dryad', 'leafcrown-dryad', 'p2', 'battlefield');
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['kappa'] });
  execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: {} });
  const result = execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' });
  assert.equal(result.ok, true, result.events[0]?.reason);
  assert.ok(result.events.some((e) => e.type === 'ability_triggered' && e.trigger === 'combat_damage_to_player'), 'brak triggera Kap-py');
  assert.ok(result.events.some((e) => e.type === 'object_moved' && e.toZone === 'exile' && e.object?.cardId === 'leafcrown-dryad'), 'Dryad nie został wygnany mimo typu Enchantment');
});

test('Kappa Tech-Wrecker: predykat nie sięga po stwora bez typu Artifact/Enchantment', () => {
  const state = game();
  addRealCard(state, 'kappa', 'kappa-tech-wrecker', 'p1', 'battlefield');
  addSimpleCreature(state, 'bear', 'syn-razorback', 'p2', {});
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['kappa'] });
  execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: {} });
  const result = execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' });
  assert.equal(result.ok, true);
  assert.ok(!result.events.some((e) => e.type === 'object_moved' && e.toZone === 'exile'), 'zwykły stwór nie może być celem Kap-py');
  assert.ok(findOnBattlefield(state, 'syn-razorback'), 'stwór pozostaje na bitwisku');
});

// --- Prismari Campus: ETB tapped + {4},{T}: Scry 1 ---------------------

test('Prismari Campus: materializacja — land, entersTapped, zdolność scry', () => {
  const data = gameObjectDataOf(REGISTRY.get('prismari-campus'));
  assert.equal(data.kind, 'land');
  assert.equal(data.entersTapped, true);
  const scry = data.abilities.find((a) => a.type === 'activated');
  assert.deepEqual(scry.cost, { mana: 4, tap: true });
  assert.deepEqual(scry.effect, { type: 'scry', amount: 1 });
});

function campusReady({ mana = 4 } = {}) {
  const state = mainPhase(game());
  addRealCard(state, 'campus', 'prismari-campus', 'p1', 'battlefield');
  addObject(state, { id: 'lib-top', instanceId: 'ilt', cardId: 'syn-razorback', controllerId: 'p1', zone: 'library', kind: 'creature', power: 2, toughness: 2, manaCost: 1, abilities: [], types: ['Creature'] });
  addObject(state, { id: 'lib-second', instanceId: 'ils', cardId: 'syn-woodcaller', controllerId: 'p1', zone: 'library', kind: 'creature', power: 2, toughness: 3, manaCost: 2, abilities: [], types: ['Creature'] });
  // Kolejność w bibliotece: pierwszy z listy = wierzch (jak przy dobieraniu).
  state.zones.library = ['lib-top', 'lib-second'];
  addMana(state, 'p1', mana);
  return state;
}

test('Prismari Campus: scry blokuje grę do decyzji; oferta wymaga many i odkręcenia', () => {
  const tapped = campusReady({ mana: 4 });
  statePrimeStateTapped(tapped);
  assert.equal(scryCommand(playerView(tapped, 'p1')), undefined, 'zatapnięty Campus nie oferuje scry');
  const noMana = campusReady({ mana: 3 });
  assert.equal(scryCommand(playerView(noMana, 'p1')), undefined, 'bez 4 many brak oferty scry');
  const ready = campusReady({ mana: 4 });
  const cmd = scryCommand(playerView(ready, 'p1'));
  assert.ok(cmd, 'brak oferty aktywacji scry');
});

function statePrimeStateTapped(state) {
  state.objects.set('campus', Object.freeze({ ...state.objects.get('campus'), tapped: true }));
}
function scryCommand(view) {
  return view.legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === 'campus');
}

test('Prismari Campus: aktywacja kosztuje 4 many + tap i otwiera decyzję scry', () => {
  const state = campusReady({ mana: 5 });
  const result = execute(state, scryCommand(playerView(state, 'p1')));
  assert.equal(result.ok, true, result.events[0]?.reason);
  assert.equal(state.players[0].mana, 1, 'scry nie kosztował 4 many');
  assert.equal(state.objects.get('campus').tapped, true, 'Campus nie zatapnięty');
  assert.deepEqual(state.pendingScry, { playerId: 'p1', objectIds: ['lib-top'] });
  assert.ok(result.events.some((e) => e.type === 'scry_started' && e.amount === 1));
});

test('scry: do decyzji nie ma pass ani innych komend (tylko wybór wariantu)', () => {
  const state = campusReady({ mana: 4 });
  execute(state, scryCommand(playerView(state, 'p1')));
  const view = playerView(state, 'p1');
  const types = new Set(view.legalCommands.map((c) => c.type));
  assert.deepEqual([...types].sort(), ['concede', 'resolve_scry'], 'blokada komend podczas scry jest dziurawa');
  assert.equal(view.legalCommands.filter((c) => c.type === 'resolve_scry').length, 2, 'scry 1 = dwa warianty (wierzch/spód)');
  const pass = execute(state, { type: 'pass_priority', playerId: 'p1' });
  assert.equal(pass.ok, false);
  assert.equal(pass.events[0].reason, 'scry_unresolved');
  // Drugi gracz również nie może grać.
  const enemyDraw = execute(state, { type: 'draw_card', playerId: 'p2' });
  assert.equal(enemyDraw.ok, false);
});

test('scry: Fog of War — tylko właściciel widzi przeglądaną kartę', () => {
  const state = campusReady({ mana: 4 });
  execute(state, scryCommand(playerView(state, 'p1')));
  const mine = playerView(state, 'p1').pendingScry;
  assert.deepEqual(mine.cards.map((c) => c.cardId), ['syn-razorback'], 'właściciel nie widzi karty');
  const foes = playerView(state, 'p2').pendingScry;
  assert.equal(foes.playerId, 'p1');
  assert.equal(foes.count, 1);
  assert.equal(foes.cards, null, 'przeciwnik widzi treść przeglądanej karty — wyciek FoW');
});

test('scry: bottomIds przenosi kartę na spód biblioteki, putTop zostawia wierzch', () => {
  const toBottom = campusReady({ mana: 4 });
  execute(toBottom, scryCommand(playerView(toBottom, 'p1')));
  const putDown = execute(toBottom, { type: 'resolve_scry', playerId: 'p1', bottomIds: ['lib-top'] });
  assert.equal(putDown.ok, true, putDown.events[0]?.reason);
  assert.equal(toBottom.pendingScry, null);
  assert.deepEqual(toBottom.zones.library, ['lib-second', 'lib-top'], 'karta nie trafiła na spód');
  // Ta sama karta, ten sam obiekt (brak zmiany strefy).
  assert.equal(toBottom.objects.get('lib-top').zone, 'library');

  const keepTop = campusReady({ mana: 4 });
  execute(keepTop, scryCommand(playerView(keepTop, 'p1')));
  const keep = execute(keepTop, { type: 'resolve_scry', playerId: 'p1', bottomIds: [] });
  assert.equal(keep.ok, true);
  assert.deepEqual(keepTop.zones.library, ['lib-top', 'lib-second'], 'wierzch nie może się zmienić przy wariancie top');
  // Po decyzji gra toczy się dalej (pass wraca do legalnych komend).
  assert.ok(playerView(keepTop, 'p1').legalCommands.some((c) => c.type === 'pass_priority'), 'po scry brak passu');
});

test('scry: nielegalne wybory są maszynowo odrzucane', () => {
  const state = campusReady({ mana: 4 });
  execute(state, scryCommand(playerView(state, 'p1')));
  const wrongPlayer = execute(state, { type: 'resolve_scry', playerId: 'p2', bottomIds: [] });
  assert.equal(wrongPlayer.ok, false);
  assert.equal(wrongPlayer.events[0].reason, 'scry_not_your_decision');
  const wrongCard = execute(state, { type: 'resolve_scry', playerId: 'p1', bottomIds: ['lib-second'] });
  assert.equal(wrongCard.ok, false);
  assert.equal(wrongCard.events[0].reason, 'illegal_scry_choice');
  const duplicate = execute(state, { type: 'resolve_scry', playerId: 'p1', bottomIds: ['lib-top', 'lib-top'] });
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.events[0].reason, 'illegal_scry_choice');
});

test('scry: replay z decyzją jest deterministyczny', () => {
  const state = campusReady({ mana: 4 });
  execute(state, scryCommand(playerView(state, 'p1')));
  execute(state, { type: 'resolve_scry', playerId: 'p1', bottomIds: ['lib-top'] });
  const verification = verifyReplay(
    replayFromState(state),
    () => campusReady({ mana: 4 }),
    execute,
  );
  assert.equal(verification.deterministic, true);
});

test('boty potrafią odpowiedzieć na decyzję scry (kontrakt legalnych komend)', () => {
  for (const makeBot of [() => createHeuristicBot({ seed: 3 }), () => createAggroBot()]) {
    const state = campusReady({ mana: 4 });
    execute(state, scryCommand(playerView(state, 'p1')));
    const bot = makeBot();
    const cmd = bot.chooseCommand(playerView(state, 'p1'));
    assert.equal(cmd.type, 'resolve_scry', `bot nie odpowiada na scry komendą resolve_scry`);
    const result = execute(state, cmd);
    assert.equal(result.ok, true, 'wybór bota scry odrzucony');
  }
});

// --- Warstwa danych, talia i pełne partie -------------------------------

test('realne karty Batchu 3 mają dane Oracle i status supported', () => {
  for (const [id, set] of [['rupture-spire', 'CON'], ['leafcrown-dryad', 'THS'], ['prismari-campus', 'STX']]) {
    const card = REGISTRY.get(id);
    assert.equal(card.set, set, `${id}: zły set`);
    assert.equal(card.support.status, 'supported', `${id}: nie ma statusu supported`);
    assert.ok(card.oracleText?.length > 0, `${id}: brak Oracle text`);
    assert.ok(card.imageUri?.startsWith('https://cards.scryfall.io/'), `${id}: brak imageUri druku`);
  }
  assert.match(REGISTRY.get('rupture-spire').oracleText, /sacrifice it unless you pay/);
  assert.match(REGISTRY.get('leafcrown-dryad').oracleText, /Bestow \{3\}\{G\}/);
  assert.match(REGISTRY.get('prismari-campus').oracleText, /Scry 1/);
});

test('talia real-batch3 składa się i waliduje względem katalogu', () => {
  const deck = parseDeckText(fs.readFileSync('decks/real-batch3.txt', 'utf8'), REGISTRY);
  assert.equal(deck.cardIds.length, 20);
  for (const expected of ['leafcrown-dryad', 'rupture-spire', 'prismari-campus']) {
    assert.ok(deck.cardIds.includes(expected), `talia nie zawiera ${expected}`);
  }
});

function playMatch(seed, deckA, deckB, makeBotA = (s) => createHeuristicBot({ seed: s }), makeBotB = (s) => createAggroBot()) {
  const state = setupCardMatch({
    seed,
    players: [{ id: 'p1' }, { id: 'p2' }],
    decks: new Map([['p1', deckA], ['p2', deckB]]),
    registry: REGISTRY,
  });
  return runSimulation({
    state,
    controllers: new Map([['p1', makeBotA(seed + 1)], ['p2', makeBotB(seed + 2)]]),
    maxCommands: 3000,
  });
}

const REAL3 = parseDeckText(fs.readFileSync('decks/real-batch3.txt', 'utf8'), REGISTRY).cardIds;
const REAL2 = parseDeckText(fs.readFileSync('decks/real-batch2.txt', 'utf8'), REGISTRY).cardIds;

test('pełna partia na talii Batchu 3 jest deterministyczna i bez odrzuceń', () => {
  const a = playMatch(31, REAL3, REAL2);
  const b = playMatch(31, REAL3, REAL2);
  assert.equal(a.state.status, 'finished', 'partia nie skończyła się w limicie komend');
  assert.equal(a.state.commands.every((cmd) => cmd.type), true);
  assert.deepEqual(b.results, a.results, 'ta sama konfiguracja dała inny przebieg');
});

test('mechaniki Batchu 3 faktycznie odpalają się w grze (pokrycie smoke)', () => {
  // Talia kontrolna z samymi landami Batchu 3 — 10 seedów, oba miejsca przy stole.
  // Przy tym zestawie (deterministycznie): trigger Spire 19/20, poświęcenie 11/20,
  // scry 16/20 — progi niżej mają margines na drobne zmiany zachowania botów.
  const lands = parseDeckText('# Kontrolna Batch 3\n10x Synthetic Forest\n4x Rupture Spire\n4x Prismari Campus', REGISTRY).cardIds;
  let spirePaid = 0;
  let spireSacrificed = 0;
  let scryDone = 0;
  for (const seed of [3, 7, 13, 17, 23, 29, 41, 53, 67, 71]) {
    for (const [deckA, deckB] of [[lands, REAL3], [REAL3, lands]]) {
      const { state } = playMatch(seed, deckA, deckB);
      assert.equal(state.status, 'finished');
      if (state.events.some((e) => e.type === 'ability_triggered' && e.trigger === 'enter_battlefield' && (e.paid != null || e.sacrificed))) spirePaid += 1;
      if (state.events.some((e) => e.type === 'permanent_sacrificed')) spireSacrificed += 1;
      if (state.events.some((e) => e.type === 'scry_resolved')) scryDone += 1;
    }
  }
  assert.ok(spirePaid >= 15, `trigger Spire odpalił się tylko w ${spirePaid}/20 partii`);
  assert.ok(spireSacrificed >= 5, `poświęcenie Spire zaszło tylko w ${spireSacrificed}/20 partii`);
  assert.ok(scryDone >= 12, `scry wykonany tylko w ${scryDone}/20 partii`);
});
