// Etap F/4 (PR #135 — polecenie właściciela: „Nie chcę żadnych drobnych albo
// nie drobnych ograniczeń ani uproszczeń, które wpływałyby na grę”):
// JEDNA ścieżka rzutu instantu/sorcery „without paying its mana cost” z okna
// decyzji — Epic Experiment, suspend (CR 702.62a), rebound (CR 702.88a),
// Discover (CR 701.57a), Halo Forager (grób), Baral (ręka).
//
// Dawniej każde okno miało inną lukę: Discover w ogóle nie wyliczał celów
// (czar celowany/modalny/aura — tylko „weź do ręki”), X i Fireball były
// wykluczone (Epic/Discover/grób/Baral), tryby „up to N target” odrzucane
// (suspend/rebound/Epic), koszt „odrzuć N kart” (Cathartic Reunion) nie był
// oferowany nigdzie poza ręką, a ofiara jako koszt dodatkowy przy darmowym
// rzucie nie zapisywała wytrzymałości (Severed Strands dawał 0 życia).
//
// Reguły: CR 118.9 (rzut bez kosztu many = koszt alternatywny), CR 107.3b
// (X = 0), CR 601.2f (zwiększenia kosztu — {1} Fireballa za cel ponad
// pierwszy — płaci się nadal), CR 601.2h (koszty dodatkowe płaci się nadal).
// Wszystkie karty z prawdziwego katalogu (ADR 0022/0029).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { createAggroBot } from '../src/controllers/aggro-bot.js';
import { resolveUntilDecision } from './helpers/deferred-trigger.js';

const REGISTRY = createCardRegistry();

function game() {
  const state = createGameState({ seed: 424, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  for (const pid of ['p1', 'p2']) {
    for (let i = 0; i < 6; i += 1) {
      addObject(state, {
        id: `lib-${pid}-${i}`, instanceId: `i-lib-${pid}-${i}`, cardId: 'test-lib', controllerId: pid, ownerId: pid,
        zone: 'library', kind: 'spell', manaCost: 1, types: ['Instant'], colors: [], subtypes: [],
        keywords: [], spell: { timing: 'instant', targets: [], effects: [] },
      });
    }
  }
  return state;
}

function put(state, id, cardId, controllerId, zone) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w katalogu`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  return state.objects.get(id);
}

function creature(state, id, controllerId, { power = 2, toughness = 2 } = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId, ownerId: controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost: 2, abilities: [], keywords: [],
    subtypes: [], types: ['Creature'], colors: [],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
}

function filler(state, id, controllerId = 'p1', zone = 'hand') {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId, ownerId: controllerId, zone,
    kind: 'spell', manaCost: 1, types: ['Instant'], colors: [], subtypes: [], keywords: [],
    spell: { timing: 'instant', targets: [], effects: [] },
  });
}

const offersOf = (state, type, pid = 'p1') => playerView(state, pid).legalCommands.filter((c) => c.type === type);
const resolveAll = (state) => resolveUntilDecision(state, (s) => s.zones.stack.length === 0, 24);
const zoneOfCard = (state, cardId) => [...state.objects.values()].find((o) => o.cardId === cardId && o.zone !== 'stack')?.zone;
const life = (state, pid) => state.players.find((p) => p.id === pid).life;

function epic(state, exileIds, maxMV) {
  state.pendingEpicExperiment = { playerId: 'p1', sourceCardId: 'epic-experiment', exileIds, maxMV, restorePriorityTo: 'p1' };
}

function discover(state, foundId, cardId, amount = 5) {
  state.pendingDiscover = {
    playerId: 'p1', foundExileId: foundId, foundCardId: cardId, restExileIds: [], restorePriorityTo: 'p1', amount,
  };
}

// ——— koszt dodatkowy: ofiara (CR 601.2h) ———

test('F/4: Epic → Severed Strands — ofiara płacona, życie = wytrzymałość ofiary, cel zniszczony', () => {
  const state = game();
  creature(state, 'mine', 'p1', { power: 1, toughness: 4 });
  creature(state, 'foe', 'p2');
  put(state, 'strands', 'severed-strands', 'p1', 'exile');
  epic(state, ['strands'], 3);
  const offer = offersOf(state, 'resolve_epic_choice')
    .find((c) => c.sacrificeTargetId === 'mine' && (c.targets ?? [])[0] === 'foe');
  assert.ok(offer, 'oferta: ofiara + cel');
  const before = life(state, 'p1');
  assert.ok(execute(state, offer).ok);
  assert.ok(execute(state, { type: 'resolve_epic_choice', playerId: 'p1', done: true }).ok);
  resolveAll(state);
  assert.equal(life(state, 'p1'), before + 4, 'zysk życia = wytrzymałość poświęconego (4)');
  assert.notEqual(state.objects.get('foe')?.zone, 'battlefield', 'cel zniszczony');
  assert.notEqual(state.objects.get('mine')?.zone, 'battlefield', 'ofiara poświęcona');
});

// ——— X = 0 (CR 107.3b) i dopłata Fireballa (CR 601.2f) ———

test('F/4: Epic → Fireball — X = 0; drugi cel kosztuje {1}, bez many tylko jeden cel', () => {
  const state = game();
  creature(state, 'foe', 'p2');
  put(state, 'fb', 'fireball', 'p1', 'exile');
  epic(state, ['fb'], 3);
  const noMana = offersOf(state, 'resolve_epic_choice').filter((c) => c.cardId === 'fb');
  assert.ok(noMana.length > 0, 'Fireball oferowany');
  assert.ok(noMana.every((c) => c.xValue === 0 && (c.targets ?? []).length === 1), 'bez many: X = 0, jeden cel');
  addMana(state, 'p1', 1);
  const withMana = offersOf(state, 'resolve_epic_choice').filter((c) => c.cardId === 'fb');
  const two = withMana.find((c) => (c.targets ?? []).length === 2);
  assert.ok(two, 'z {1}: wariant dwóch celów');
  assert.ok(execute(state, two).ok);
  const stacked = state.objects.get(state.zones.stack.at(-1));
  assert.equal(stacked.fireballX, 0, 'X na stosie = 0');
  assert.equal(state.players.find((p) => p.id === 'p1').mana, 0, 'dopłata {1} pobrana');
});

test('F/4: Discover → Consume Spirit — oferta X = 0; komenda z X > 0 odrzucona', () => {
  const state = game();
  put(state, 'cs', 'consume-spirit', 'p1', 'exile');
  discover(state, 'cs', 'consume-spirit');
  const free = offersOf(state, 'resolve_discover_choice').filter((c) => c.castFree);
  assert.ok(free.length > 0 && free.every((c) => c.xValue === 0), 'X = 0 w każdej ofercie');
  const bad = execute(state, { ...free[0], xValue: 2 });
  assert.equal(bad.ok, false, 'X > 0 bez płacenia kosztu many — odrzucone');
  assert.ok(execute(state, free[0]).ok);
  assert.equal(state.objects.get(state.zones.stack.at(-1)).spellX, 0);
});

test('F/4: Halo Forager (grób) → Consume Spirit — {X} Foragera = MV, X czaru = 0', () => {
  const state = game();
  put(state, 'cs', 'consume-spirit', 'p1', 'graveyard');
  addMana(state, 'p1', 2);
  state.pendingGraveFreeCast = { playerId: 'p1', sourceCardId: 'halo-forager', restorePriorityTo: 'p1' };
  const offer = offersOf(state, 'resolve_grave_free_cast').find((c) => c.objectId === 'cs' && (c.targets ?? [])[0] === 'p2');
  assert.ok(offer, 'czar X z grobu oferowany');
  assert.equal(offer.xValue, 2, 'komenda niesie {X} Foragera = MV karty');
  assert.ok(execute(state, offer).ok);
  const stacked = state.objects.get(state.zones.stack.at(-1));
  assert.equal(stacked.spellX, 0, 'X czaru = 0 (CR 107.3b)');
  assert.equal(state.players.find((p) => p.id === 'p1').mana, 0, '{2} zapłacone');
});

test('F/4: Baral (ręka) → Fireball — oferta X = 0 i rzut wspólną ścieżką', () => {
  const state = game();
  put(state, 'fb', 'fireball', 'p1', 'hand');
  state.pendingHandFreeCast = {
    playerId: 'p1', sourceId: 'baral', sourceCardId: 'baral-and-kari-zev', cardTypes: ['Sorcery'],
    maxManaValue: 3, elseEffect: null, restorePriorityTo: 'p1',
  };
  const offer = offersOf(state, 'resolve_hand_free_cast').find((c) => c.objectId === 'fb' && (c.targets ?? [])[0] === 'p2');
  assert.ok(offer, 'Fireball z ręki oferowany');
  assert.equal(offer.xValue, 0);
  assert.ok(execute(state, offer).ok);
  assert.equal(state.objects.get(state.zones.stack.at(-1)).fireballX, 0);
});

// ——— tryby „up to N target” (CR 601.2c) ———

test('F/4: Epic → Wrap in Flames — tryb „up to three targets” rzucalny z celem', () => {
  const state = game();
  creature(state, 'foe', 'p2', { toughness: 1 });
  put(state, 'wrap', 'wrap-in-flames', 'p1', 'exile');
  epic(state, ['wrap'], 5);
  const offer = offersOf(state, 'resolve_epic_choice').find((c) => c.cardId === 'wrap' && (c.targets ?? []).includes('foe'));
  assert.ok(offer, 'oferta z celem');
  assert.ok(execute(state, offer).ok);
  assert.ok(execute(state, { type: 'resolve_epic_choice', playerId: 'p1', done: true }).ok);
  resolveAll(state);
  assert.notEqual(state.objects.get('foe')?.zone, 'battlefield', '1 obrażenie zabiło 1/1');
});

test('F/4: Discover → Aerith Rescue Mission — tryb celowany („Schody”) oferowany z celem', () => {
  const state = game();
  creature(state, 'foe', 'p2');
  put(state, 'aerith', 'aerith-rescue-mission', 'p1', 'exile');
  discover(state, 'aerith', 'aerith-rescue-mission');
  const free = offersOf(state, 'resolve_discover_choice').filter((c) => c.castFree);
  const modes = new Set(free.map((c) => c.modeIndex));
  assert.ok(modes.has(0) && modes.has(1), 'oba tryby w ofercie');
  const stairs = free.find((c) => c.modeIndex === 1 && (c.targets ?? []).includes('foe'));
  assert.ok(stairs, 'tryb celowany z celem');
  assert.ok(execute(state, stairs).ok);
  resolveAll(state);
  assert.equal(state.objects.get('foe').tapped, true, 'cel tapnięty');
});

// ——— suspend / rebound ———

test('F/4: suspend → Mindstab — rzut z celem-graczem, przeciwnik odrzuca 3', () => {
  const state = game();
  for (let i = 0; i < 3; i += 1) filler(state, `h2-${i}`, 'p2');
  put(state, 'ms', 'mindstab', 'p1', 'exile');
  state.objects.set('ms', Object.freeze({ ...state.objects.get('ms'), suspended: true, timeCounters: 0 }));
  state.pendingSuspendCast = { playerId: 'p1', objectId: 'ms', cardId: 'mindstab', restorePriorityTo: 'p1' };
  const offer = offersOf(state, 'resolve_suspend_cast').find((c) => c.cast && (c.targets ?? [])[0] === 'p2');
  assert.ok(offer);
  assert.ok(execute(state, offer).ok);
  resolveUntilDecision(state, (s) => s.zones.stack.length === 0 || Boolean(s.pendingDiscardChoice), 24);
  if (state.pendingDiscardChoice) {
    const pick = offersOf(state, 'resolve_discard_choice', 'p2')[0];
    assert.ok(pick && execute(state, pick).ok);
  }
  assert.equal(state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p2').length, 0, 'ręka p2 pusta');
});

test('F/4: rebound → Ojutai\'s Breath — rzut z celem, cel tapnięty', () => {
  const state = game();
  creature(state, 'foe', 'p2');
  put(state, 'ob', 'ojutais-breath', 'p1', 'exile');
  state.objects.set('ob', Object.freeze({ ...state.objects.get('ob'), reboundReady: true }));
  state.pendingReboundCast = { playerId: 'p1', objectId: 'ob', cardId: 'ojutais-breath', restorePriorityTo: 'p1' };
  const offer = offersOf(state, 'resolve_rebound_cast').find((c) => c.cast && (c.targets ?? [])[0] === 'foe');
  assert.ok(offer);
  assert.ok(execute(state, offer).ok);
  resolveAll(state);
  assert.equal(state.objects.get('foe').tapped, true);
});

// ——— Discover: aura (CR 303.4a) ———

test('F/4: Discover → Guildscorn Ward — oferta per gospodarz, aura wchodzi na wybranego', () => {
  const state = game();
  creature(state, 'mine', 'p1');
  creature(state, 'foe', 'p2');
  put(state, 'ward', 'guildscorn-ward', 'p1', 'exile');
  discover(state, 'ward', 'guildscorn-ward');
  const free = offersOf(state, 'resolve_discover_choice').filter((c) => c.castFree);
  assert.deepEqual(free.map((c) => c.targets[0]).sort(), ['foe', 'mine'], 'oferta per gospodarz');
  assert.ok(execute(state, free.find((c) => c.targets[0] === 'mine')).ok);
  resolveAll(state);
  const aura = [...state.objects.values()].find((o) => o.cardId === 'guildscorn-ward' && o.zone === 'battlefield');
  assert.equal(aura?.attachedTo, 'mine');
});

// ——— F/4b: koszt „odrzuć N kart” (Cathartic Reunion) ———

test('F/4b: Discover → Cathartic Reunion — oferta per para kart z ręki; odrzucenie jako koszt, dobranie 3', () => {
  const state = game();
  for (const id of ['h1', 'h2', 'h3']) filler(state, id);
  put(state, 'cr', 'cathartic-reunion', 'p1', 'exile');
  discover(state, 'cr', 'cathartic-reunion');
  const free = offersOf(state, 'resolve_discover_choice').filter((c) => c.castFree);
  assert.equal(free.length, 3, 'C(3,2) = 3 warianty');
  const pick = free.find((c) => c.discardCardIds.includes('h1') && c.discardCardIds.includes('h3'));
  assert.ok(pick);
  assert.ok(execute(state, pick).ok);
  assert.ok(!state.pendingDiscardChoice, 'bez osobnej decyzji — wybór był w ofercie');
  assert.equal(zoneOfCard(state, 'test-h1'), 'graveyard');
  assert.equal(zoneOfCard(state, 'test-h3'), 'graveyard');
  assert.equal(state.objects.get('h2')?.zone, 'hand', 'nieodrzucona zostaje');
  resolveAll(state);
  const hand = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p1');
  assert.equal(hand.length, 4, '1 + 3 dobrane');
});

test('F/4b: Cathartic Reunion — za mało kart = brak oferty; zły wybór w komendzie odrzucony', () => {
  const state = game();
  filler(state, 'h1');
  put(state, 'cr', 'cathartic-reunion', 'p1', 'exile');
  discover(state, 'cr', 'cathartic-reunion');
  assert.equal(offersOf(state, 'resolve_discover_choice').filter((c) => c.castFree).length, 0,
    'jedna karta w ręce — kosztu nie da się zapłacić (CR 601.2h)');
  filler(state, 'h2');
  const bad = [
    ['h1'], ['h1', 'h1'], ['h1', 'cr'], ['h1', 'lib-p1-0'],
  ];
  for (const discardCardIds of bad) {
    const r = execute(state, { type: 'resolve_discover_choice', playerId: 'p1', castFree: true, objectId: 'cr', cardId: 'cathartic-reunion', targets: [], discardCardIds });
    assert.equal(r.ok, false, `odrzucone: ${discardCardIds.join(',')}`);
  }
  assert.equal(state.objects.get('h1').zone, 'hand', 'odrzucona komenda nic nie zmienia (L4)');
});

test('F/4b: Baral → Cathartic Reunion z ręki — sam czar nie jest kandydatem do odrzucenia', () => {
  const state = game();
  put(state, 'cr', 'cathartic-reunion', 'p1', 'hand');
  for (const id of ['h1', 'h2']) filler(state, id);
  state.pendingHandFreeCast = {
    playerId: 'p1', sourceId: 'baral', sourceCardId: 'baral-and-kari-zev', cardTypes: ['Sorcery'],
    maxManaValue: 3, elseEffect: null, restorePriorityTo: 'p1',
  };
  const offers = offersOf(state, 'resolve_hand_free_cast').filter((c) => c.objectId === 'cr');
  assert.equal(offers.length, 1, 'jedyna para: h1 + h2');
  assert.deepEqual([...offers[0].discardCardIds].sort(), ['h1', 'h2']);
  assert.ok(execute(state, offers[0]).ok);
  assert.ok(!state.pendingDiscardChoice);
  assert.equal(zoneOfCard(state, 'test-h1'), 'graveyard');
  assert.equal(zoneOfCard(state, 'test-h2'), 'graveyard');
});

test('F/4b: Epic → Cathartic Reunion i okno Vaana (koszt many płacony) — ta sama oferta kart', () => {
  const state = game();
  for (const id of ['h1', 'h2']) filler(state, id);
  put(state, 'cr', 'cathartic-reunion', 'p1', 'exile');
  epic(state, ['cr'], 3);
  const offer = offersOf(state, 'resolve_epic_choice').find((c) => c.cardId === 'cr');
  assert.ok(offer && offer.discardCardIds.length === 2);
  assert.ok(execute(state, offer).ok);
  assert.equal(zoneOfCard(state, 'test-h1'), 'graveyard');

  const vaan = game();
  for (const id of ['h1', 'h2']) filler(vaan, id);
  addMana(vaan, 'p1', 2, { colors: ['R'] });
  put(vaan, 'cr', 'cathartic-reunion', 'p2', 'exile');
  vaan.pendingExileCast = { playerId: 'p1', objectId: 'cr', cardId: 'cathartic-reunion', sourceId: 'vaan', restorePriorityTo: 'p1' };
  const cast = offersOf(vaan, 'resolve_exile_cast').find((c) => c.cast);
  assert.ok(cast && cast.discardCardIds.length === 2, 'Vaan: wariant z parą kart');
  assert.ok(execute(vaan, cast).ok);
  assert.ok(!vaan.pendingDiscardChoice, 'wybór z oferty, bez osobnej decyzji');
  assert.equal(zoneOfCard(vaan, 'test-h2'), 'graveyard');
});

// ——— boty: X = 0 to legalny, ale jałowy ruch ———

test('F/4: boty — Discover czaru X (X = 0) wybierają „weź do ręki”', () => {
  const state = game();
  put(state, 'cs', 'consume-spirit', 'p1', 'exile');
  discover(state, 'cs', 'consume-spirit');
  const view = playerView(state, 'p1');
  assert.ok(view.legalCommands.some((c) => c.type === 'resolve_discover_choice' && c.castFree), 'oferta X = 0 istnieje');
  const heuristic = createHeuristicBot({ seed: 1 }).chooseCommand(view);
  assert.equal(heuristic.type, 'resolve_discover_choice');
  assert.equal(heuristic.castFree, false, 'heuristic: do ręki');
  const aggro = createAggroBot().chooseCommand(view);
  assert.equal(aggro.castFree, false, 'aggro: do ręki');
});

test('F/4: heuristic — Discover aury wrogiej/przyjaznej nie celuje we własnego stwora na ślepo', () => {
  const state = game();
  // Wróg PIERWSZY na stole — „pierwsza oferta z brzegu" celowałaby w niego.
  creature(state, 'foe', 'p2', { power: 3, toughness: 3 });
  creature(state, 'mine', 'p1', { power: 3, toughness: 3 });
  put(state, 'ward', 'guildscorn-ward', 'p1', 'exile');
  discover(state, 'ward', 'guildscorn-ward');
  const chosen = createHeuristicBot({ seed: 1 }).chooseCommand(playerView(state, 'p1'));
  assert.equal(chosen.castFree, true);
  assert.equal(chosen.targets[0], 'mine', 'ochrona (aura przyjazna) na własnym stworze');
});
