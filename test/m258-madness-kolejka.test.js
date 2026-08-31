import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState, playerView, execute, addObject } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';

/**
 * M258 (Żywy Tester → regresja z pełnej partii bota): kolejka decyzji madness
 * przy odrzucaniu WIELU kart. Dotąd odrzucenie karty z madness otwierało
 * pendingMadnessCast NATYCHMIAST — także w środku sekwencji odrzuceń
 * (cleanup z 2 kartami nad limit, Cathartic Reunion „discard two"). Wtedy:
 * oferta (gałąź odrzuceń w legalCommands wygrywa) i walidacja (bramka madness
 * w execute wyżej) rozjeżdżały się — resolve_discard_choice było odrzucane
 * z 'madness_unresolved', a symulacja bota kończyła się wyjątkiem
 * „Bot wybrał nielegalną komendę" (test/real-cards-batch3.test.js, seed 31,
 * dominaria-brg vs warhammer-brg — Revolutionist odrzucony w cleanupie).
 *
 * Kontrakt po fixie (CR 702.34a: opcja rzutu powstaje PO dokończeniu efektu
 * odrzucania): karty z madness kolejkują się; pierwsza decyzja otwiera się
 * po zakończeniu sekwencji odrzuceń; kolejne — po rozstrzygnięciu
 * poprzedniej.
 */

const REGISTRY = createCardRegistry();

function game(playerId = 'p1') {
  const state = createGameState({ seed: 42, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function putCard(state, id, cardId, controllerId = 'p1', zone = 'hand') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    kind: def.types.includes('Creature') ? 'creature' : 'spell',
    power: def.power, toughness: def.toughness, manaCost: def.manaCost,
    abilities: def.abilities ?? [], colors: def.colors ?? [],
    types: def.types ?? [], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
    spell: def.spell,
    ...(def.madness ? { madness: def.madness } : {}),
  });
  return state.objects.get(id);
}

function discardChoice(state, handIds, playerId = 'p1') {
  state.pendingDiscardChoice = {
    playerId, count: handIds.length, handIds, purpose: 'effect',
    sourceCardId: null, restorePriorityTo: playerId,
  };
  state.turn.priorityPlayerId = playerId;
}

test('M258/M1: odrzucenie 2 kart (pierwsza z madness) nie zakleszcza decyzji — madness czeka na koniec sekwencji', () => {
  const state = game();
  putCard(state, 'rev1', 'revolutionist', 'p1');
  putCard(state, 'other', 'tenth-district-veteran', 'p1');
  discardChoice(state, ['rev1', 'other']);

  const r1 = execute(state, { type: 'resolve_discard_choice', playerId: 'p1', cardId: 'rev1' });
  assert.ok(r1.ok, 'pierwsze odrzucenie (karta z madness) przyjęte');
  const r2 = execute(state, { type: 'resolve_discard_choice', playerId: 'p1', cardId: 'other' });
  assert.ok(r2.ok, 'drugie odrzucenie przyjęte — sekwencja nie zakleszczona (RED przed fixem: madness_unresolved)');

  assert.ok(state.pendingMadnessCast, 'po zakończeniu odrzuceń decyzja madness otwarta');
  assert.equal(state.pendingMadnessCast.cardId, 'revolutionist', 'decyzja dotyczy karty z madness');
  const decline = playerView(state, 'p1').legalCommands.find((c) => c.type === 'resolve_madness_cast' && !c.cast);
  assert.ok(decline, 'oferta rezygnacji z madness');
  assert.ok(execute(state, decline).ok);
  const inGrave = [...state.objects.values()].find((o) => o.cardId === 'revolutionist' && o.zone === 'graveyard');
  assert.ok(inGrave, 'odmowa → cmentarz');
  assert.equal(state.pendingMadnessCast, null, 'kolejka pusta');
});

test('M258/M2: dwie karty z madness w jednym efekcie — decyzje SEKWENCYJNIE, żadna nie ginie', () => {
  const state = game();
  putCard(state, 'rev1', 'revolutionist', 'p1');
  putCard(state, 'rev2', 'revolutionist', 'p1');
  discardChoice(state, ['rev1', 'rev2']);

  assert.ok(execute(state, { type: 'resolve_discard_choice', playerId: 'p1', cardId: 'rev1' }).ok);
  assert.ok(execute(state, { type: 'resolve_discard_choice', playerId: 'p1', cardId: 'rev2' }).ok);

  assert.ok(state.pendingMadnessCast, 'pierwsza decyzja madness otwarta');
  assert.equal(state.pendingMadnessCast.cardId, 'revolutionist');
  const exiled = [...state.objects.values()].filter((o) => o.cardId === 'revolutionist' && o.zone === 'exile');
  assert.equal(exiled.length, 2, 'obie karty w exile (CR 702.34a)');

  // Rezygnacja z pierwszej → druga decyzja otwiera się automatycznie.
  const d1 = playerView(state, 'p1').legalCommands.find((c) => c.type === 'resolve_madness_cast' && !c.cast);
  assert.ok(d1 && execute(state, d1).ok);
  assert.ok(state.pendingMadnessCast, 'druga decyzja madness otwarta (kolejka)');
  assert.equal(state.pendingMadnessCast.cardId, 'revolutionist');
  const d2 = playerView(state, 'p1').legalCommands.find((c) => c.type === 'resolve_madness_cast' && !c.cast);
  assert.ok(d2 && execute(state, d2).ok);

  const graves = [...state.objects.values()].filter((o) => o.cardId === 'revolutionist' && o.zone === 'graveyard');
  assert.equal(graves.length, 2, 'obie odmowy → obie karty w cmentarzu (pierwsza decyzja nie została nadpisana)');
  assert.equal(state.pendingMadnessCast, null, 'kolejka pusta');
});

test('M258/M3: pojedyncze odrzucenie z madness — decyzja dalej otwiera się od razu (anty-regresja E1)', () => {
  const state = game();
  putCard(state, 'rev', 'revolutionist', 'p1');
  discardChoice(state, ['rev']);
  assert.ok(execute(state, { type: 'resolve_discard_choice', playerId: 'p1', cardId: 'rev' }).ok);
  assert.ok(state.pendingMadnessCast, 'decyzja madness otwarta po jednym odrzuceniu');
  const decline = playerView(state, 'p1').legalCommands.find((c) => c.type === 'resolve_madness_cast' && !c.cast);
  assert.ok(decline && execute(state, decline).ok);
  assert.equal(state.pendingMadnessCast, null);
});
