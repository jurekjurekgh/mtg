// D3 (Żywy Tester, PR #135 — Etap F/4 domknięty po stronie bota): okna rzutu
// „without paying its mana cost” (CR 118.9) a podatek ward (CR 702.21a).
//
// Silnik odpala ward od zdarzenia `spell_cast`, więc czar rzucony z Discover
// (CR 701.57a), Epic Experiment czy Barala płaci ward jak każdy inny rzut.
// Bot miał dwie luki (zmierzone sondą przed naprawą):
//  1. `WARD_TAXED_TYPES` filtrował typy po nazwie (`cast_*` / `*_cast`), więc
//     `resolve_discover_choice` i `resolve_epic_choice` w ogóle nie liczyły
//     wardu — bez many bot rzucał z Discover „Destroy target creature” w stwora
//     z ward {2} (czar kontrowany, karta stracona) zamiast wziąć ją do ręki;
//  2. `reservedManaOf` dla Epic/Discover/Barala rezerwował PEŁNY koszt karty,
//     którego nikt nie płaci — przy puli równej wardowi bot odmawiał rzutu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot, WARD_TAXED_TYPES } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

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

/** Bot = p2 w swoim mainie; jedyny wrogi stwór 5/5, opcjonalnie z ward {N}. */
function board({ ward = null, pool = 0, zone = 'exile' } = {}) {
  const state = createGameState({ seed: 77, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  const fat = put(state, 'fat', 'goblin-piker', 'p1', 'battlefield');
  state.objects.set('fat', Object.freeze({
    ...fat, power: 5, toughness: 5, manaCost: 6, summoningSickness: false,
    ...(ward == null ? {} : { keywords: ['ward'], ward }),
  }));
  // Expunge {2}{B}: „Destroy target nonartifact, nonblack creature.”
  put(state, 'ex', 'expunge', 'p2', zone);
  if (pool > 0) addMana(state, 'p2', pool);
  return state;
}

const choose = (state) => createHeuristicBot({ seed: 1 }).chooseCommand(playerView(state, 'p2'), {});

function discover(state) {
  state.pendingDiscover = {
    playerId: 'p2', foundExileId: 'ex', foundCardId: 'expunge', restExileIds: [], restorePriorityTo: 'p2', amount: 3,
  };
}

test('D3: okna Epic i Discover należą do rodziny objętej podatkiem ward', () => {
  assert.ok(WARD_TAXED_TYPES.has('resolve_discover_choice'));
  assert.ok(WARD_TAXED_TYPES.has('resolve_epic_choice'));
});

test('D3: Discover bez wardu — bot rzuca removal za darmo (anty-over-fix)', () => {
  const state = board();
  discover(state);
  const choice = choose(state);
  assert.equal(choice.castFree, true, JSON.stringify(choice));
  assert.deepEqual(choice.targets, ['fat']);
});

test('D3: Discover, ward {2}, pusta pula — bot bierze kartę do ręki zamiast rzutu w kontrę', () => {
  const state = board({ ward: 2 });
  discover(state);
  const choice = choose(state);
  assert.equal(choice.type, 'resolve_discover_choice');
  assert.equal(choice.castFree, false, `rzut kontrowany za brak dopłaty: ${JSON.stringify(choice)}`);
});

test('D3: Discover, ward {2}, pula 2 — rzut bez kosztu many zostawia całą pulę na ward', () => {
  const state = board({ ward: 2, pool: 2 });
  discover(state);
  const choice = choose(state);
  assert.equal(choice.castFree, true, `pula 2 pokrywa ward (karta nic nie kosztuje): ${JSON.stringify(choice)}`);
});

test('D3: Epic, ward {2}, pusta pula — bot nie rzuca w ward; z pulą 2 rzuca', () => {
  const bez = board({ ward: 2 });
  bez.pendingEpicExperiment = { playerId: 'p2', sourceCardId: 'epic-experiment', exileIds: ['ex'], maxMV: 3, restorePriorityTo: 'p2' };
  const c1 = choose(bez);
  assert.ok(!(c1.type === 'resolve_epic_choice' && (c1.targets ?? []).includes('fat')), JSON.stringify(c1));
  const z = board({ ward: 2, pool: 2 });
  z.pendingEpicExperiment = { playerId: 'p2', sourceCardId: 'epic-experiment', exileIds: ['ex'], maxMV: 3, restorePriorityTo: 'p2' };
  const c2 = choose(z);
  assert.equal(c2.type, 'resolve_epic_choice');
  assert.deepEqual(c2.targets, ['fat'], JSON.stringify(c2));
});

test('D3: Baral (ręka), ward {2}, pula 2 — koszt karty nie jest rezerwowany, bot rzuca', () => {
  const state = board({ ward: 2, pool: 2, zone: 'hand' });
  state.pendingHandFreeCast = {
    playerId: 'p2', sourceId: 'baral', sourceCardId: 'baral-and-kari-zev', cardTypes: ['Instant'],
    maxManaValue: 4, elseEffect: null, restorePriorityTo: 'p2',
  };
  const choice = choose(state);
  assert.equal(choice.type, 'resolve_hand_free_cast');
  assert.equal(choice.objectId, 'ex', `rzut z ręki za darmo + ward z puli: ${JSON.stringify(choice)}`);
});
