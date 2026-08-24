// M202 — brązowa odznaka, znalezisko #2: CR 702.170d (plot).
//
// CR 702.170d: „A plotted card's owner may cast it from exile without paying
// its mana cost **during their main phase while the stack is empty** during any
// turn after the turn in which it became plotted.” Przypomnienie na karcie:
// „Cast it **as a sorcery** on a later turn without paying its mana cost.”
//
// Stan przed fixem: bramka timingu wisiała wyłącznie na `timing === 'sorcery'`
// (w `requireSpell` i w `legalSpellCasts`), więc zaplotowany INSTANT nie miał
// żadnego ograniczenia — dałoby się go rzucić w turze przeciwnika albo
// w odpowiedzi na czar. W dzisiejszym katalogu są dwie karty z plot
// (Tumbleweed Rising — sorcery, Spinewoods Paladin — permanent, obie z bramką
// z innych powodów), więc luka była UTAJONA; pierwsza zaplotowana karta
// o timingu instant weszłaby bez bramki (L52: zamykamy lukę teraz).
//
// Testy działają na obiekcie syntetycznym (zaplotowany instant), bo takiej
// karty w katalogu jeszcze nie ma — to dokładnie przypadek, dla którego
// reguła musi być gotowa.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView, execute } from '../src/engine/game-state.js';
import { plottedCastAllowed } from '../src/engine/spells.js';
import { TURN_STEPS, initialTurn } from '../src/engine/turn.js';

/** Zaplotowany instant w wygnaniu (CR 702.170d — obiekt syntetyczny). */
function plottedInstant(state, id = 'plot1', controllerId = 'p1') {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'synthetic-plotted-instant', controllerId, ownerId: controllerId,
    zone: 'exile', kind: 'spell', manaCost: 0, types: ['Instant'], subtypes: [], colors: [],
    plotted: true, plottedAtTurn: 1,
    spell: { timing: 'instant', targets: [], effects: [{ type: 'draw_cards', amount: 1 }] },
    abilities: [],
  });
  return state.objects.get(id);
}

function at(stepIndex, activePlayerId = 'p1', turnNumber = 3) {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = { ...initialTurn(activePlayerId), ...TURN_STEPS[stepIndex], stepIndex, number: turnNumber, activePlayerId, priorityPlayerId: 'p1', passes: 0 };
  return state;
}

test('M202/#2 (CR 702.170d): zaplotowany instant NIE jest rzucalny w turze przeciwnika', () => {
  const state = at(3, 'p2'); // faza main PRZECIWNIKA
  plottedInstant(state);
  const offers = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'cast_spell' && c.objectId === 'plot1');
  assert.deepEqual(offers, [], 'oferta nie może obiecywać rzutu poza własną fazą main');
  const forced = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'plot1', targets: [] });
  assert.equal(forced.ok, false, 'walidacja odrzuca rzut (CR 702.170d)');
});

test('M202/#2 (CR 702.170d): zaplotowany instant NIE jest rzucalny przy niepustym stosie', () => {
  const state = at(3, 'p1');
  plottedInstant(state);
  state.zones.stack = ['fake-stack-entry'];
  assert.equal(plottedCastAllowed(state, 'p1', state.objects.get('plot1')), false,
    '„while the stack is empty”');
});

test('M202/#2 (anty-over-fix): we WŁASNEJ fazie main przy pustym stosie rzut działa', () => {
  const state = at(3, 'p1');
  plottedInstant(state);
  assert.equal(plottedCastAllowed(state, 'p1', state.objects.get('plot1')), true);
  const offers = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'cast_spell' && c.objectId === 'plot1');
  assert.ok(offers.length > 0, 'rzut jest oferowany');
  assert.equal(execute(state, offers[0]).ok, true, 'i akceptowany');
});

test('M202/#2 (anty-over-fix): bramka dotyczy wyłącznie PLOT — suspend ma własny timing (CR 702.62c)', () => {
  const state = at(6, 'p2'); // poza fazą main
  addObject(state, {
    id: 'sus1', instanceId: 'i-sus1', cardId: 'synthetic-suspended', controllerId: 'p1', ownerId: 'p1',
    zone: 'exile', kind: 'spell', manaCost: 0, types: ['Sorcery'], subtypes: [], colors: [],
    suspendReady: true,
    spell: { timing: 'sorcery', targets: [], effects: [{ type: 'draw_cards', amount: 1 }] },
    abilities: [],
  });
  assert.equal(plottedCastAllowed(state, 'p1', state.objects.get('sus1')), true,
    'rzut suspend rozstrzyga się w zdolności triggerowanej i ignoruje timing karty');
});

test('M202/#2 (anty-over-fix): zwykły instant z ręki zachowuje timing instantu', () => {
  const state = at(3, 'p2');
  addObject(state, {
    id: 'inst1', instanceId: 'i-inst1', cardId: 'synthetic-instant', controllerId: 'p1', ownerId: 'p1',
    zone: 'hand', kind: 'spell', manaCost: 0, types: ['Instant'], subtypes: [], colors: [],
    spell: { timing: 'instant', targets: [], effects: [{ type: 'draw_cards', amount: 1 }] },
    abilities: [],
  });
  assert.equal(plottedCastAllowed(state, 'p1', state.objects.get('inst1')), true,
    'bramka dotyczy tylko kart zaplotowanych w wygnaniu');
});
