// =============================================================================
// Zgłoszenie G, etap 3a (2026-11-05): decyzje oczekujące „konstruuj +
// waliduj" — mulligan bottom, untap choice, escape exile, delve exile.
//
// Po co: po etapach 1–2 te cztery decyzje wciąż enumerowały wszystkie
// podzbiory (po F bez limitu — przy untap 2^n, przy escape C(n,k)).
// Teraz legalCommands niesie ZIARNA porządkowe (okna cykliczne /
// singletony / puste / wszystko), widok niesie deskryptor problemu
// (pendingMulliganBottom, pendingUntapChoice, pendingEscapeExile,
// pendingDelveExile), bot dokłada własne zestawy wartościowe, a silnik
// waliduje przy execute każdy legalny wybór — kompletność konstrukcyjna.
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function putCard(state, id, cardId, controllerId = 'p1', zone = 'battlefield', patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, ...patch,
  });
  return state.objects.get(id);
}

function mainState(seed = 81) {
  const state = createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  return state;
}

test('G3/1: mulligan bottom — deskryptor ręki, ziarna-okna, zestaw spoza okien legalny', () => {
  const state = mainState();
  for (const [id, cid] of [['h1', 'basic-forest'], ['h2', 'highland-game'], ['h3', 'thornhide-wolves'], ['h4', 'colossodon-yearling'], ['h5', 'basic-forest']]) {
    putCard(state, id, cid, 'p1', 'hand');
  }
  state.pendingMulliganBottom = { playerId: 'p1', count: 2, handIds: ['h1', 'h2', 'h3', 'h4', 'h5'], restorePriorityTo: 'p1' };
  const view = playerView(state, 'p1');
  assert.deepEqual(view.pendingMulliganBottom, { count: 2, handIds: ['h1', 'h2', 'h3', 'h4', 'h5'] },
    'deskryptor: ile odłożyć i z jakiej ręki');
  const offers = view.legalCommands.filter((c) => c.type === 'resolve_mulligan_bottom_choice');
  // Okna cykliczne z dedupem po nazwach: [F,G],[G,W],[W,C],[C,F],[F,F→drugi las]
  // — okno startujące na h5 to multizbiór {Forest,Forest}? nie: [h5,h1] = {F,F}
  // różny od pozostałych, więc 5 okien, wszystkie rozmiaru 2.
  assert.equal(offers.length, 5, `ziarna-okna zamiast C(5,2)=10: ${offers.length}`);
  assert.ok(offers.every((c) => c.cardIds.length === 2), 'każde ziarno odkłada dokładnie 2');
  const bad = execute(state, { type: 'resolve_mulligan_bottom_choice', playerId: 'p1', cardIds: ['h1'] });
  assert.equal(bad.ok, false, 'zła liczba kart odrzucona');
  assert.ok(execute(state, { type: 'resolve_mulligan_bottom_choice', playerId: 'p1', cardIds: ['h2', 'h4'] }).ok,
    'zestaw spoza okien (h2+h4) przechodzi walidację');
  assert.ok(!state.zones.hand.includes('h2'), 'odłożona karta opuściła rękę');
  assert.ok([...state.objects.values()].some((o) => o.cardId === 'highland-game' && o.zone === 'library'),
    'odłożona karta jest w bibliotece');
  assert.equal(state.pendingMulliganBottom, null, 'decyzja zamknięta');
});

test('G3/2: bot odkłada na spód najdroższe czary (własny zestaw z deskryptora)', () => {
  const state = mainState(82);
  for (const [id, cid] of [['h1', 'basic-forest'], ['h2', 'basic-forest'], ['cheap', 'highland-game'], ['mid', 'thornhide-wolves'], ['big', 'colossodon-yearling']]) {
    putCard(state, id, cid, 'p1', 'hand');
  }
  state.pendingMulliganBottom = { playerId: 'p1', count: 2, handIds: ['h1', 'h2', 'cheap', 'mid', 'big'], restorePriorityTo: 'p1' };
  const choice = createHeuristicBot({ seed: 3 }).chooseCommand(playerView(state, 'p1'), {});
  assert.equal(choice.type, 'resolve_mulligan_bottom_choice');
  assert.deepEqual([...choice.cardIds].sort(), ['big', 'mid'],
    `bot odkłada drogie czary, trzyma lądy i tanie zagranie: ${JSON.stringify(choice.cardIds)}`);
});

test('G3/3: untap — ziarna (wszystko/singletony/wszyscy) zamiast 2^n; deskryptor kompletny', () => {
  const state = mainState(83);
  for (const id of ['s1', 's2', 's3']) {
    putCard(state, id, 'entrancing-lyre', 'p1', 'battlefield');
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), tapped: true }));
  }
  putCard(state, 'foe', 'thornhide-wolves', 'p2', 'battlefield');
  state.objects.set('foe', Object.freeze({ ...state.objects.get('foe'), tapped: true, untapLockedBy: ['s1'] }));
  state.pendingUntapChoice = { playerId: 'p1', candidateIds: ['s1', 's2', 's3'] };
  const view = playerView(state, 'p1');
  assert.deepEqual([...view.pendingUntapChoice.candidateIds].sort(), ['s1', 's2', 's3']);
  assert.deepEqual(view.pendingUntapChoice.lockedByCandidate.s1, ['foe'], 'deskryptor: kogo trzyma s1');
  const offers = view.legalCommands.filter((c) => c.type === 'resolve_untap_choice');
  assert.equal(offers.length, 5, `pusty + 3 singletony + wszyscy (nie 2^3=8): ${offers.length}`);
  const choice = createHeuristicBot({ seed: 3 }).chooseCommand(view, {});
  assert.equal(choice.type, 'resolve_untap_choice');
  assert.ok((choice.keepTappedIds ?? []).includes('s1'),
    `bot trzyma w tapie lirę blokującą wrogie 4/3: ${JSON.stringify(choice.keepTappedIds)}`);
});

test('G3/4: escape — bot wygania najtańszy zestaw grobu (synteza, nie okno)', () => {
  const state = mainState(84);
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  putCard(state, 'oblivion', 'sweet-oblivion', 'p2', 'graveyard');
  for (let i = 0; i < 6; i += 1) putCard(state, `g${i}`, 'basic-swamp', 'p2', 'graveyard');
  putCard(state, 'prey', 'highland-game', 'p2', 'graveyard');
  addMana(state, 'p2', 10);
  const view = playerView(state, 'p2');
  const cast = view.legalCommands.find((c) => c.type === 'cast_escape');
  assert.ok(cast, 'oferta escape');
  assert.ok(execute(state, cast).ok);
  assert.ok(state.pendingEscapeExile, 'pending wygnania otwarty');
  const view2 = playerView(state, 'p2');
  assert.equal(view2.pendingEscapeExile.exileCount, 4);
  assert.equal(view2.pendingEscapeExile.candidateIds.length, 7, 'deskryptor: 6 lądów + stwór (bez samego czaru)');
  const offers = view2.legalCommands.filter((c) => c.type === 'resolve_escape_exile');
  assert.equal(offers.length, 7, `okna cykliczne zamiast C(7,4)=35: ${offers.length}`);
  const choice = createHeuristicBot({ seed: 3 }).chooseCommand(view2, {});
  assert.equal(choice.type, 'resolve_escape_exile');
  assert.ok(!(choice.exileIds ?? []).includes('prey'),
    `bot nie wygania stwora (droższy od lądów): ${JSON.stringify(choice.exileIds)}`);
  assert.equal((choice.exileIds ?? []).length, 4, 'pełny koszt wygnania');
});

test('G3/5: delve — ziarna per opłacalna liczba; bot dokłada najtańsze zestawy', () => {
  const state = mainState(85);
  for (let i = 0; i < 5; i += 1) putCard(state, `g${i}`, 'basic-swamp', 'p1', 'graveyard');
  putCard(state, 'prey', 'highland-game', 'p1', 'graveyard');
  state.pendingDelveExile = {
    playerId: 'p1', cardId: 'dig-through-time', sourceId: 'g0',
    candidateIds: ['g0', 'g1', 'g2', 'g3', 'g4', 'prey'],
    minExile: 0, maxExile: 3, affordableCounts: [0, 2, 3], manaCostBase: 8,
  };
  const view = playerView(state, 'p1');
  assert.deepEqual([...view.pendingDelveExile.affordableCounts], [0, 2, 3]);
  const offers = view.legalCommands.filter((c) => c.type === 'resolve_delve_exile');
  const sizes = [...new Set(offers.map((c) => c.exileIds.length))].sort();
  assert.deepEqual(sizes, [0, 2, 3], 'ziarna tylko w opłacalnych liczbach');
  assert.ok(offers.length <= 1 + 6 + 6, `okna per liczba, nie podzbiory: ${offers.length}`);
  const choice = createHeuristicBot({ seed: 3 }).chooseCommand(view, {});
  assert.equal(choice.type, 'resolve_delve_exile');
  assert.ok(!(choice.exileIds ?? []).includes('prey'),
    `bot wygania lądy, nie stwora: ${JSON.stringify(choice.exileIds)}`);
});
