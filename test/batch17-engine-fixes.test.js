import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defineCard } from '../src/cards/registry.js';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { applyEffect } from '../src/engine/effects.js';
import { effectiveKeywords, grantKeywordsUntilEndOfTurn } from '../src/engine/permanents.js';

/**
 * Testy generycznych napraw engine'u wprowadzonych razem z Batchem 17 —
 * uzupełniają testy kart (test/real-cards-batch17.test.js), które pokrywają
 * te same ścieżki przez realne definicje. Każda naprawa to brakujący element
 * mechanik Batchu 17 (cleave, indestructible, modalny cel-gracza); core nadal
 * nie zależy od nazw kart (ADR 0002).
 */

function game() {
  return createGameState({ seed: 17, players: [{ id: 'p1' }, { id: 'p2' }] });
}

function mainPhase(state, playerId = 'p1') {
  state.turn.phase = 'precombat_main';
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  state.turn.step = 'precombat_main';
  state.turn.stepIndex = 3;
  return state;
}

function addCreature(state, id, controllerId, power, toughness, subtypes = []) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'highland-game', controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost: 1,
    abilities: [], keywords: [], subtypes, types: ['Creature'], colors: [],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

function addLand(state, id, controllerId) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'basic-forest', controllerId, zone: 'battlefield',
    kind: 'land', abilities: [], keywords: [], subtypes: ['Forest'], types: ['Basic', 'Land'], colors: [],
  });
  return state.objects.get(id);
}

function addSpell(state, id, controllerId, zone, spell, manaCost) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `syn-${id}`, controllerId, zone,
    kind: 'spell', manaCost, spell,
    abilities: [], keywords: [], subtypes: [], types: ['Instant'], colors: ['U'],
  });
  return state.objects.get(id);
}

function addLibraryFiller(state, prefix, controllerId, count) {
  for (let i = 0; i < count; i += 1) {
    addObject(state, {
      id: `${prefix}-${i}`, instanceId: `i-${prefix}-${i}`, cardId: 'shatter', controllerId, zone: 'library',
      kind: 'spell', manaCost: 1, spell: null, abilities: [], keywords: [], subtypes: [], types: ['Instant'], colors: [],
    });
  }
}

function passBoth(state, first) {
  // T6: rozstrzyga stos pełnymi rundami passów (czary + triggery, LIFO).
  // Szanuje już naliczone passy (passes) — pełna runda kończy się, gdy
  // licznik wróci do 0 (rozstrzygnięcie stosu albo przejście kroku).
  // Zwraca ostatni wynik rundy (kompatybilność z testami clash).
  const blockedByDecision = (r) => !r.ok && /(_unresolved|not_your_decision)$/.test(r.events[0]?.reason ?? '');
  let last = null;
  let guard = 0;
  for (;;) {
    let passesDone = state.turn.passes;
    while (passesDone < state.players.length) {
      const holder = state.turn.priorityPlayerId;
      const r1 = execute(state, { type: 'pass_priority', playerId: holder });
      if (blockedByDecision(r1)) return last;
      assert.ok(r1.ok, r1.events[0]?.reason);
      last = r1;
      if (state.turn.passes === 0) break; // pełna runda zakończona
      passesDone = state.turn.passes;
    }
    guard += 1;
    if (state.zones.stack.length === 0 || guard > 12) break;
  }
  return last;
}



function findCast(view, type, predicate) {
  return view.legalCommands.find((c) => c.type === type && predicate(c));
}

function handSize(state, playerId) {
  return state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === playerId).length;
}

// =============================================================================
// 1. freezeSpell zachowuje deskryptor cleave (registry.js)
// =============================================================================

test('freezeSpell zachowuje deskryptor cleave (manaCost, targets, effects) i go zamraża', () => {
  const card = defineCard({
    id: 'test-cleave', name: 'Test Cleave', set: 'TST',
    types: ['Instant'], colors: ['U'], manaCost: 2,
    spell: {
      timing: 'instant',
      targets: [{ type: 'creature_with_subtypes', subtypes: ['Wolf'] }],
      effects: [{ type: 'bounce_permanent' }],
      cleave: {
        manaCost: 4,
        targets: [{ type: 'creature' }],
        effects: [{ type: 'bounce_permanent' }, { type: 'draw_cards', amount: 1 }],
      },
    },
    support: { status: 'supported', limitations: [] },
  });
  assert.ok(card.spell.cleave, 'deskryptor cleave przetrwał freezeSpell');
  assert.equal(card.spell.cleave.manaCost, 4);
  assert.deepEqual(card.spell.cleave.targets, [{ type: 'creature' }]);
  assert.equal(card.spell.cleave.effects.length, 2);
  assert.ok(Object.isFrozen(card.spell.cleave), 'cleave zamrożony');
  assert.ok(Object.isFrozen(card.spell.cleave.targets[0]));
});

test('freezeSpell: czar bez cleave nie dostaje pustego deskryptora', () => {
  const card = defineCard({
    id: 'test-plain', name: 'Test Plain', set: 'TST',
    types: ['Instant'], colors: ['U'], manaCost: 1,
    spell: { timing: 'instant', targets: [], effects: [{ type: 'draw_cards', amount: 1 }] },
    support: { status: 'supported', limitations: [] },
  });
  assert.equal(card.spell.cleave, undefined);
});

// =============================================================================
// 2. resolveTopOfStack rozstrzyga cleave wg celów deskryptora cleave
//    (Lunar Rejection cleave odbija dowolnego stwora, nie tylko Wolf/Werewolf)
// =============================================================================

test('cleave: rzut z kosztem cleave odbija dowolnego stwora (cele cleave.targets)', () => {
  const state = game();
  mainPhase(state);
  addCreature(state, 'foe', 'p2', 3, 3); // nie-Wolf — nielegalny dla zwykłego rzutu
  addSpell(state, 'lunar', 'p1', 'hand', {
    timing: 'instant',
    targets: [{ type: 'creature_with_subtypes', subtypes: ['Wolf'] }],
    effects: [{ type: 'bounce_permanent' }, { type: 'draw_cards', amount: 1 }],
    cleave: {
      manaCost: 4,
      targets: [{ type: 'creature' }],
      effects: [{ type: 'bounce_permanent' }, { type: 'draw_cards', amount: 1 }],
    },
  }, 2);
  addMana(state, 'p1', 4);
  // Zwykły cast_spell NIE jest oferowany (cel nie jest Wolf/Werewolf).
  assert.ok(!findCast(playerView(state, 'p1'), 'cast_spell', (c) => c.objectId === 'lunar'));
  const cleaveCast = findCast(playerView(state, 'p1'), 'cast_cleave', (c) => c.objectId === 'lunar' && (c.targets ?? []).includes('foe'));
  assert.ok(cleaveCast, 'cast_cleave oferowany z celem — dowolny stwór');
  assert.ok(execute(state, { type: 'cast_cleave', playerId: 'p1', objectId: 'lunar', targets: ['foe'] }).ok);
  passBoth(state); // rozstrzygnięcie stosu
  assert.ok(!state.objects.has('foe'), 'NIE-Wolf odbity do ręki przez cleave (opuścił bitwisko)');
  assert.ok([...state.objects.values()].some((o) => o.cardId === 'highland-game' && o.zone === 'hand'), 'stwór trafił na rękę');
});

test('cleave: zwykły rzut wciąż wymaga stwora Wolf/Werewolf', () => {
  const state = game();
  mainPhase(state);
  addCreature(state, 'wolf', 'p2', 2, 2, ['Wolf']);
  addCreature(state, 'plain', 'p2', 2, 2);
  addSpell(state, 'lunar', 'p1', 'hand', {
    timing: 'instant',
    targets: [{ type: 'creature_with_subtypes', subtypes: ['Wolf'] }],
    effects: [{ type: 'bounce_permanent' }],
    cleave: { manaCost: 4, targets: [{ type: 'creature' }], effects: [{ type: 'bounce_permanent' }] },
  }, 2);
  addMana(state, 'p1', 2);
  // cast_spell oferowany tylko z celem-Wilkiem, NIE ze zwykłym stworem.
  assert.ok(findCast(playerView(state, 'p1'), 'cast_spell', (c) => c.objectId === 'lunar' && (c.targets ?? []).includes('wolf')));
  assert.ok(!findCast(playerView(state, 'p1'), 'cast_spell', (c) => c.objectId === 'lunar' && (c.targets ?? []).includes('plain')));
});

// =============================================================================
// 3. resolveTopOfStack tryb modalny zachowuje cel-gracza (liveChosen)
//    („you and target opponent each draw two cards")
// =============================================================================

test('modal: tryb z celem „opponent\" dobiera po 2 karty dla obu graczy', () => {
  const state = game();
  mainPhase(state);
  addLibraryFiller(state, 'lib-p1', 'p1', 5);
  addLibraryFiller(state, 'lib-p2', 'p2', 5);
  addSpell(state, 'temple', 'p1', 'hand', {
    timing: 'instant',
    modes: [
      { effects: [{ type: 'buff_creatures_you_control', power: 0, toughness: 0, keywords: ['indestructible'] }] },
      { targets: [{ type: 'opponent' }], effects: [{ type: 'draw_cards_both_players', amount: 2 }] },
    ],
  }, 3);
  addMana(state, 'p1', 3);
  const before1 = handSize(state, 'p1');
  const before2 = handSize(state, 'p2');
  const modalCast = findCast(playerView(state, 'p1'), 'cast_spell', (c) => c.objectId === 'temple' && c.modeIndex === 1);
  assert.ok(modalCast, 'tryb „Strike a Deal\" z celem opponent oferowany');
  assert.ok((modalCast.targets ?? []).includes('p2'));
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'temple', targets: ['p2'], modeIndex: 1 }).ok);
  passBoth(state);
  // Mierzymy STAN (deltę ręki), nie licznik zdarzeń w state.events — resolveTopOfStack
  // pcha zdarzenia rozstrzygnięcia bezpośrednio, a pass_priority ponownie przez
  // zwracany slice (przedistniejące, latentne podwójne dopisanie do logu; stan
  // gry i mutacje pozostają poprawne, dlatego czytamy stan, nie log).
  // p1: temple opuszcza rękę (-1), dobiera 2 (+2) ⇒ netto +1.
  assert.equal(handSize(state, 'p1') - before1, 1, 'Kontroler dobrał 2 (−1 za temple = +1 netto)');
  // p2 (cel): dobiera 2 (+2).
  assert.equal(handSize(state, 'p2') - before2, 2, 'Przeciwnik (cel) dobrał 2 karty');
});

// =============================================================================
// 4. destroy_permanent respektuje indestructible (effects.js)
// =============================================================================

test('destroy_permanent NIE niszczy stwora z indestructible', () => {
  const state = game();
  addCreature(state, 'c', 'p1', 2, 2);
  grantKeywordsUntilEndOfTurn(state, 'c', ['indestructible']);
  applyEffect(state, { type: 'destroy_permanent' }, { id: 'src', controllerId: 'p2', cardId: 'shatter' }, ['c']);
  assert.equal(state.objects.get('c').zone, 'battlefield', 'Indestructible przeżywa destroy');
});

test('destroy_permanent normalnie niszczy stwora bez indestructible', () => {
  const state = game();
  addCreature(state, 'c', 'p1', 2, 2);
  applyEffect(state, { type: 'destroy_permanent' }, { id: 'src', controllerId: 'p2', cardId: 'shatter' }, ['c']);
  assert.ok(!state.objects.has('c'), 'Zwykły stwór zniszczony (opuścił bitwisko do grobu)');
  assert.ok([...state.objects.values()].some((o) => o.cardId === 'highland-game' && o.zone === 'graveyard'), 'stwór w grobie');
});

test('indestructible łagodzi śmiertelne obrażenia (state-based)', () => {
  const state = game();
  addCreature(state, 'c', 'p1', 2, 2);
  grantKeywordsUntilEndOfTurn(state, 'c', ['indestructible']);
  applyEffect(state, { type: 'damage', amount: 5 }, { id: 'src', controllerId: 'p2', cardId: 'shatter' }, ['c']);
  assert.ok(effectiveKeywords(state.objects.get('c'), state).includes('indestructible'));
  // 5 obrażeń na 2-wytrzymałościowym stworze z indestructible — przeżywa.
  assert.equal(state.objects.get('c').zone, 'battlefield', 'Indestructible przeżywa śmiertelne obrażenia');
});
