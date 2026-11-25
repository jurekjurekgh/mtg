// =============================================================================
// Zgłoszenie E (playtest 2026-11-16): Forever Young
//
// Objaw: bot rzucał Forever Young ({1}{B}: „Put any number of target creature
// cards from your graveyard on top of your library. Draw a card.”) nawet przy
// 0 kreaturach w grobie — marnowanie karty i many oraz zbędne uszczuplanie
// biblioteki (zamiast zachować czar, by później włożyć stwory na wierzch i
// odwlec library draining).
//
// Wymaganie właściciela:
//  - bez celów do wyjęcia z cmentarza bot NIE powinien rzucać Forever Young
//    (szczególnie przy cienkiej bibliotece),
//  - wyjątek: presja niskiego życia, gdzie każde dobranie jest szansą na
//    uratowanie się (o ile dobranie nie opróżnia pustej/1-kartowej biblioteki),
//  - przy stworach w grobie (zwłaszcza przy małej bibliotece) rzut dokłada
//    je na wierzch przed dobraniem i odwleka library draining.
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { DEFAULT_HEURISTIC_PARAMS, HEURISTIC_PARAM_KEYS } from '../src/controllers/heuristic-params.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, zone, playerId) {
  const def = REGISTRY.get(cardId);
  addObject(state, {
    ...gameObjectDataOf(def),
    id,
    instanceId: `i-${id}`,
    cardId,
    controllerId: playerId,
    ownerId: playerId,
    zone,
    types: def.types ?? [],
    subtypes: def.subtypes ?? [],
    keywords: def.keywords ?? [],
    spell: def.spell,
  });
  return state.objects.get(id);
}

function scena({
  graveyardCards = [],
  library = 20,
  botLife = 20,
  enemyCreatures = [],
  nonCreatureGrave = ['basic-swamp'],
} = {}) {
  const state = createGameState({ seed: 31, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.players[0].life = 20;
  state.players[1].life = botLife;
  state.turn = jumpToStep(state.turn, 'main1', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  state.pendingMulligans = [];
  for (let i = 1; i <= 4; i++) put(state, `sw-${i}`, 'basic-swamp', 'battlefield', 'p2');
  put(state, 'fy', 'forever-young', 'hand', 'p2');
  nonCreatureGrave.forEach((cid, i) => put(state, `g-nc-${i}`, cid, 'graveyard', 'p2'));
  graveyardCards.forEach((cid, i) => put(state, `g-cr-${i}`, cid, 'graveyard', 'p2'));
  enemyCreatures.forEach((cid, i) => put(state, `e-cr-${i}`, cid, 'battlefield', 'p1'));
  for (let i = 0; i < library; i++) put(state, `lib-${i}`, 'basic-swamp', 'library', 'p2');
  for (let i = 0; i < 20; i++) put(state, `libp1-${i}`, 'basic-island', 'library', 'p1');
  return state;
}

const choose = (state, params) => createHeuristicBot({ seed: 7, params }).chooseCommand(playerView(state, 'p2'), {});

test('E1: 0 kreatur w grobie i zdrowe życie (20) — bot NIE rzuca Forever Young', () => {
  const state = scena({ graveyardCards: [], library: 20, botLife: 20 });
  const view = playerView(state, 'p2');
  assert.ok(view.legalCommands.some((c) => c.objectId === 'fy' && c.type === 'cast_spell'),
    'Forever Young jest legalne do rzucenia bez celów (any number)');
  const choice = choose(state);
  assert.notEqual(choice.objectId, 'fy', `bot zmarnował Forever Young: ${JSON.stringify(choice)}`);
});

test('E2: 0 kreatur w grobie przy cienkiej bibliotece (5 i 8 kart) — bot zachowuje Forever Young', () => {
  for (const library of [5, 8]) {
    const state = scena({ graveyardCards: [], library, botLife: 20 });
    const choice = choose(state);
    assert.notEqual(choice.objectId, 'fy',
      `przy bibliotece ${library} i 0 kreaturach w grobie bot rzucił ${JSON.stringify(choice)} zamiast zachować na odwleczenie deck-outu`);
  }
});

test('E3: presja niskiego życia (życie 4 lub śmiertelny stół) przy 0 kreaturach — bot kopie po ratunek, o ile nie ginie od razu od deck-outu', () => {
  // Niskie życie (4 <= próg), bezpieczna biblioteka → rzuca po draw 1.
  const lowLife = scena({ graveyardCards: [], library: 20, botLife: 4 });
  assert.equal(choose(lowLife).objectId, 'fy',
    'przy niskim życiu (4) każda karta dobrania jest szansą na ratunek');

  // Śmiertelny atak na stole (przeciwnik ma 6/6 przy życiu 6, ale >0) → rzuca po draw 1.
  const lethalBoard = scena({
    graveyardCards: [],
    library: 3,
    botLife: 6,
    enemyCreatures: ['fathom-fleet-cutthroat', 'fathom-fleet-cutthroat'], // 3/3 + 3/3 = 6 >= 6
  });
  // KOREKTA WŁAŚCICIELA 2026-11-23 (uniwersalna podłoga10): draw1 przy
  // lib3 → 2 < 10 = weto EVEN pod śmiertelną presją — wcześniejszy wyjątek
  // „presja życia > cienka biblioteka" ustępuje nowszej regule „wszędzie".
  assert.notEqual(choose(lethalBoard).objectId, 'fy',
    'podłoga10 PO drenażu: draw przy lib3 → weto nawet pod śmiertelną presją');

  // Ostatnia karta w bibliotece (1) przy 0 kreaturach → dobranie zabija od razu (CR 704.5b) → NIE rzuca.
  const lastCard = scena({ graveyardCards: [], library: 1, botLife: 4 });
  assert.notEqual(choose(lastCard).objectId, 'fy',
    'przy 1 karcie w bibliotece i 0 kreaturach rzut to natychmiastowa przegrana od deck-outu');
});

test('E4: z wartościową kreaturą w grobie (Child of Night 2/1) przy zdrowej bibliotece bot rzuca Forever Young', () => {
  const state = scena({ graveyardCards: ['child-of-night'], library: 20, botLife: 20 });
  const choice = choose(state);
  assert.equal(choice.objectId, 'fy', 'bot powinien odzyskać kreaturę z grobu');
});

test('E5: cienka biblioteka (3 karty) + 2 kreatury w grobie — bot rzuca Forever Young i dokłada stwory na wierzch, odwlekając deck-out', () => {
  const state = scena({ graveyardCards: ['child-of-night', 'fathom-fleet-cutthroat'], library: 3, botLife: 20 });
  const choice = choose(state);
  assert.equal(choice.objectId, 'fy',
    'z 2 kreaturami w grobie Forever Young powiększa bibliotekę (3+2-1=4) zamiast ją drenować');

  // Przy cienkiej bibliotece nawet mniejsze stwory (1/1) są brane przy decyzji, nie pomijane przez done.
  const decisionState = scena({ graveyardCards: ['soulmender'], library: 4, botLife: 20 });
  decisionState.pendingGraveyardToTop = {
    playerId: 'p2',
    sourceCardId: 'forever-young',
    candidateIds: ['g-cr-0'],
    restorePriorityTo: 'p2',
  };
  const pick = choose(decisionState);
  assert.equal(pick.type, 'resolve_graveyard_top_choice');
  assert.equal(pick.targetId, 'g-cr-0', 'przy cienkiej bibliotece (4) bot wkłada też 1/1 na wierzch, by odwlec deck-out');
});

test('E6: Discover przy 0 kreaturach w grobie bierze Forever Young do ręki zamiast marnować w próżnię', () => {
  const state = scena({ graveyardCards: [], library: 20, botLife: 20 });
  const fyInExile = put(state, 'ex-fy', 'forever-young', 'exile', 'p2');
  state.pendingDiscover = {
    playerId: 'p2',
    foundExileId: fyInExile.id,
    foundCardId: 'forever-young',
    restExileIds: [],
    amount: 3,
    sourceCardId: 'geological-appraiser',
  };
  const view = playerView(state, 'p2');
  assert.ok(view.legalCommands.some((c) => c.type === 'resolve_discover_choice' && c.castFree === true),
    'Discover musi oferować też darmowy rzut, żeby test sprawdzał wybór bota');
  const choice = createHeuristicBot({ seed: 7 }).chooseCommand(view, {});
  assert.equal(choice.type, 'resolve_discover_choice');
  assert.equal(choice.castFree, false, 'Discover powinien wziąć Forever Young do ręki na później');
});

test('E7: parametry Forever Young obecne w HEURISTIC_PARAM_KEYS i DEFAULT_HEURISTIC_PARAMS', () => {
  for (const key of [
    'graveLibraryTopEmptyPenalty',
    'graveLibraryTopDesperatePenalty',
    'graveLibraryTopLowLifeThreshold',
    'graveLibraryTopMinCreatureBody',
    'graveLibraryTopCreatureWeight',
    'graveLibraryTopAntiDrainBonus',
  ]) {
    assert.ok(HEURISTIC_PARAM_KEYS.includes(key), `${key} w HEURISTIC_PARAM_KEYS`);
    assert.ok(Number.isFinite(DEFAULT_HEURISTIC_PARAMS[key]), `${key} ma wartość domyślną`);
  }
});
