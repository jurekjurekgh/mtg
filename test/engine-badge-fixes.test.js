import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, execute, addObject, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { castSpell } from '../src/engine/spells.js';
import { legalActivatedAbilities, activateAbility } from '../src/engine/abilities.js';
import { addCounter } from '../src/engine/counters.js';
import { moveObjectDirectly } from '../src/engine/objects.js';

// =============================================================================
// Odznaka „wyłapywacz błędów" (sesja 2026-08-08, M55) — 5 błędów/uproszczeń
// vs zasady MtG znalezionych w przeglądzie istniejących kart i mechanik.
//   1. Channel (Greater Tanuki) oferowany z bitwiska — nielegalna komenda.
//   2. PlayerView nie oferował 4 decyzji (reveal/proliferate/damage/modal)
//      — gra (człowiek i bot) soft-lockowała.
//   3. Stomping Slabs — kompletny no-op (pendingRevealOrder nigdy nie
//      kolejkowany; sprawdzenie nazwy po `name` zamiast `cardName`).
//   4. Courage in Crisis — proliferate nigdy nie kolejkował decyzji gracza
//      (wymuszone proliferowanie celu czaru zamiast „choose any number").
//   5. Cellar Door — młynował WIERZCH zamiast SPODU biblioteki.
// =============================================================================

const REGISTRY = createCardRegistry();

function newState() {
  const state = createGameState({ seed: 2026, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  return state;
}

function addCardFromRegistry(state, instanceId, cardId, controllerId, zone) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id: instanceId, instanceId: `i-${instanceId}`, cardId, controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, spell: data.spell, abilities: data.abilities ?? [],
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
    types: def.types ?? [], colors: data.colors ?? [],
    aura: def.aura ?? null, bestow: def.bestow ?? null, enchantPlayer: def.enchantPlayer ?? false,
    cardName: def.name,
  });
}

function addCreature(state, id, controllerId, power, toughness, { colors = [] } = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'x-test', controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost: 2, abilities: [], keywords: [],
    subtypes: [], types: ['Creature'], colors, summoningSickness: false,
  });
}

function giveMana(state, playerId, amount, colors = {}) {
  const player = state.players.find((p) => p.id === playerId);
  player.mana = amount;
  player.manaPool = { ...(player.manaPool ?? {}), ...colors };
}

function passRounds(state, rounds = 4) {
  for (let g = 0; g < rounds; g += 1) {
    let passes = state.turn.passes;
    let guard = 0;
    while (passes < 2 && guard < 20) {
      const holder = state.turn.priorityPlayerId;
      const r = execute(state, { type: 'pass_priority', playerId: holder });
      if (!r.ok && /(_unresolved|not_your_decision)$/.test(r.events?.[0]?.reason ?? '')) return r;
      passes = state.turn.passes;
      guard += 1;
      if (passes === 0) break;
    }
    if (state.zones.stack.length === 0) break;
  }
  return null;
}

// ---------------------------------------------------------------- 1. Channel

test('B1: channel (Greater Tanuki) tylko z ręki — nigdy z bitwiska', () => {
  const state = newState();
  giveMana(state, 'p1', 3, { G: 1 });
  addCardFromRegistry(state, 'tanuki', 'greater-tanuki', 'p1', 'hand');
  const handOffers = legalActivatedAbilities(state, 'p1').filter((a) => a.objectId === 'tanuki');
  assert.equal(handOffers.length, 1, 'channel oferowany z ręki');
  // Ten sam stwór na bitwisku: zdolność channel nie może być oferowana (CR 702.85a).
  const moved = moveObjectDirectly(state, 'tanuki', 'battlefield', 'tanuki-bf');
  state.objects.set('tanuki-bf', Object.freeze({ ...moved, summoningSickness: false, kind: 'creature' }));
  const bfOffers = legalActivatedAbilities(state, 'p1').filter((a) => a.objectId === 'tanuki-bf');
  assert.equal(bfOffers.length, 0, 'channel NIE oferowany z bitwiska');
});

// ------------------------------------------------- 3. Stomping Slabs (real flow)

test('B3: Stomping Slabs — reveal top 7, reorder na spód, 7 obrażeń po named card', () => {
  const state = newState();
  giveMana(state, 'p1', 3, { R: 1 });
  addCardFromRegistry(state, 'slabs', 'stomping-slabs', 'p1', 'hand');
  const libCards = ['x-a', 'x-b', 'stomping-slabs', 'x-c', 'x-d', 'x-e', 'x-f'];
  for (const cid of libCards) {
    const cd = cid === 'stomping-slabs' ? REGISTRY.get('stomping-slabs') : null;
    addObject(state, {
      id: 'lib-' + cid, instanceId: 'i-l-' + cid, cardId: cid, controllerId: 'p1', zone: 'library',
      kind: cd ? 'spell' : 'card', power: null, toughness: null, manaCost: cd ? cd.manaCost : 0,
      spell: cd ? cd.spell : null, abilities: [], keywords: [], subtypes: [], types: cd ? cd.types : ['Creature'],
      colors: cd ? cd.colors : [], cardName: cid === 'stomping-slabs' ? 'Stomping Slabs' : cid,
    });
  }
  state.zones.library = libCards.map((c) => 'lib-' + c);
  castSpell(state, 'p1', 'slabs', [], undefined, undefined);
  passRounds(state, 1);
  assert.ok(state.pendingRevealOrder, 'engine sam kolejkuje reveal (nie test ręcznie)');
  const v = playerView(state, 'p1');
  assert.ok(v.legalCommands.some((c) => c.type === 'resolve_reveal_order'), 'widok oferuje resolve_reveal_order');
  const r = execute(state, { type: 'resolve_reveal_order', playerId: 'p1', order: state.pendingRevealOrder.cardIds });
  assert.equal(r.ok, true);
  assert.ok(state.pendingDamageTarget, 'named Stomping Slabs w reveal → decyzja celu obrażeń');
  const v2 = playerView(state, 'p1');
  assert.ok(v2.legalCommands.some((c) => c.type === 'resolve_damage_target'), 'widok oferuje resolve_damage_target');
  const r2 = execute(state, { type: 'resolve_damage_target', playerId: 'p1', targetId: 'p2' });
  assert.equal(r2.ok, true);
  assert.equal(state.players[1].life, 13, '7 obrażeń do p2');
  // Odsłonięte karty są na SPODZIE (koniec biblioteki), nie wierzchu.
  const lib = state.zones.library.map((id) => state.objects.get(id)?.cardName ?? id);
  assert.ok(lib[lib.length - 1] === 'x-f' || lib[lib.length - 1] === 'lib-x-f', `spód: ${lib[lib.length - 1]}`);
});

// ------------------------------------------------- 4. Courage in Crisis proliferate

test('B4: proliferate kolejkuje decyzję gracza (choose any number, CR 701.27)', () => {
  const state = newState();
  giveMana(state, 'p1', 3, { G: 1 });
  addCardFromRegistry(state, 'courage', 'courage-in-crisis', 'p1', 'hand');
  addCreature(state, 'cre', 'p1', 2, 2);
  addCreature(state, 'cre2', 'p1', 1, 1);
  addCounter(state, 'cre2', '+1/+1', 1);
  castSpell(state, 'p1', 'courage', ['cre'], undefined, undefined);
  passRounds(state, 1);
  assert.ok(state.pendingProliferate, 'engine sam kolejkuje proliferate');
  const cands = state.pendingProliferate.candidateIds;
  assert.ok(cands.includes('cre') && cands.includes('cre2'), 'kandydaci: permanenty z licznikami');
  const v = playerView(state, 'p1');
  const offers = v.legalCommands.filter((c) => c.type === 'resolve_proliferate');
  assert.ok(offers.length >= 4, 'widok oferuje podzbiory (any number)');
  const r = execute(state, { type: 'resolve_proliferate', playerId: 'p1', targetIds: ['cre', 'cre2'] });
  assert.equal(r.ok, true);
  assert.equal(state.objects.get('cre').counters['+1/+1'], 2, 'add_counter 1 + proliferate 1 = 2');
  assert.equal(state.objects.get('cre2').counters['+1/+1'], 2, 'istniejący licznik 1→2 (proliferate)');
  assert.equal(state.zones.stack.length, 0, 'czar opuszcza stos po decyzji');
});

// ------------------------------------------------- 5. Cellar Door bottom mill

test('B5: Cellar Door młynowuje DOLNĄ kartę biblioteki (nie wierzch)', () => {
  const state = newState();
  addObject(state, {
    id: 'cd', instanceId: 'i-cd', cardId: 'cellar-door', controllerId: 'p1', zone: 'battlefield',
    kind: 'artifact', power: null, toughness: null, manaCost: 2, abilities: REGISTRY.get('cellar-door').abilities,
    keywords: [], subtypes: [], types: ['Artifact'], colors: [],
  });
  for (const [i, c] of ['A', 'B', 'C', 'D', 'E'].entries()) {
    addObject(state, {
      id: 'lib-' + c, instanceId: 'i-' + c, cardId: 'x-' + c, controllerId: 'p2', zone: 'library',
      kind: 'card', power: null, toughness: null, manaCost: 0, abilities: [], keywords: [],
      subtypes: [], types: ['Creature'], colors: [], cardName: c,
    });
  }
  state.zones.library = ['lib-A', 'lib-B', 'lib-C', 'lib-D', 'lib-E']; // [0]=wierzch, [last]=spód
  giveMana(state, 'p1', 3, {});
  const offers = legalActivatedAbilities(state, 'p1').filter((a) => a.objectId === 'cd');
  assert.equal(offers.length, 2, 'zdolność {3},{T} oferowana z celem-graczem (obaj gracze)');
  const vsP2 = offers.find((a) => a.targets?.[0] === 'p2');
  assert.ok(vsP2, 'oferta z celem p2');
  activateAbility(state, 'p1', 'cd', vsP2.abilityIndex, undefined, vsP2.targets);
  const remaining = state.zones.library.map((id) => state.objects.get(id).cardName);
  assert.equal(remaining.join(','), 'A,B,C,D', 'zmilowana została DOLNA karta (E)');
});

// ------------------------------------------------- 2. View offers (modal trigger)

test('B2: widok oferuje resolve_modal_choice (Etherwrought Page upkeep)', () => {
  const state = newState();
  addObject(state, {
    id: 'page', instanceId: 'i-page', cardId: 'etherwrought-page', controllerId: 'p1', zone: 'battlefield',
    kind: 'artifact', power: null, toughness: null, manaCost: 4, abilities: REGISTRY.get('etherwrought-page').abilities,
    keywords: [], subtypes: [], types: ['Artifact'], colors: ['U'],
  });
  state.turn = jumpToStep(state.turn, 'untap', 'p1');
  state.turn.activePlayerId = 'p1';
  let guard = 0;
  for (;;) {
    let passes = state.turn.passes;
    while (passes < 2) {
      const holder = state.turn.priorityPlayerId;
      const r = execute(state, { type: 'pass_priority', playerId: holder });
      if (!r.ok && /(_unresolved|not_your_decision)$/.test(r.events?.[0]?.reason ?? '')) break;
      passes = state.turn.passes;
      if (passes === 0) break;
    }
    guard += 1;
    if (state.turn.step !== 'untap' || guard > 10) break;
  }
  assert.ok(state.pendingModalTrigger, 'modalny trigger upkeep zakolejkowany');
  const v = playerView(state, 'p1');
  assert.equal(v.pendingModalTrigger?.modes?.length, 3, 'widok niesie tryby modala');
  const offers = v.legalCommands.filter((c) => c.type === 'resolve_modal_choice');
  assert.equal(offers.length, 3, 'widok oferuje 3 tryby');
  const r = execute(state, { type: 'resolve_modal_choice', playerId: 'p1', modeIndex: 0 });
  assert.equal(r.ok, true);
  assert.equal(state.players[0].life, 22, 'tryb 0: gain 2 life');
});
