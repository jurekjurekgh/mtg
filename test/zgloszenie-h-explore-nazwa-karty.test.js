import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { resolveTopOfStack } from '../src/engine/spells.js';
import { choiceGroupTitle } from '../src/table/render.js';
import { previewCardIdOfOption } from '../src/table/choice-request.js';

/**
 * Zgłoszenie H (właściciel, 2026-09-20): „Guidestone Compass Explore — modal
 * «Wybierz: Explore — co z odsłoniętą kartą?» ma WYMIENIĆ i PODLINKOWAĆ
 * odsłoniętą kartę (teraz trzeba jej szukać w logu, żeby podjąć świadomą
 * decyzję)”.
 *
 * Kontrakt: decyzja Explore (CR 701.44) niesie w widoku decydenta ŹRÓDŁO
 * eksploracji (Guidestone Compass — publiczny permanent) i ODSŁONIĘTĄ KARTĘ,
 * tytuł modala nazywa obie, a opcje mają podgląd odsłoniętej karty (ten sam
 * przycisk 🔍 co inne decyzje, `renderChoiceRequest` = wspólny kreator wyboru).
 */

const REGISTRY = createCardRegistry();

/** Stół: Guidestone Compass gracza + zadany wierzch biblioteki. */
function stolZWierzchem(topCardId) {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  const put = (id, cardId, zone, extra = {}) => {
    const def = REGISTRY.get(cardId);
    addObject(state, {
      id, instanceId: `i-${id}`, cardId, controllerId: 'p1', ownerId: 'p1', zone,
      ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
      subtypes: def.subtypes ?? [], spell: def.spell, ...extra,
    });
  };
  put('compass', 'guidestone-compass', 'battlefield');
  put('cel', 'cacophodon', 'battlefield'); // cel eksploracji (stwór pod kontrolą)
  put('land', 'basic-island', 'battlefield'); // mana na koszt {1} zdolności
  // Kolejność biblioteki: wierzch = topCardId (biblioteka idzie od wierzchu).
  put('lib-top', topCardId, 'library');
  put('lib-2', 'basic-island', 'library');
  return state;
}

/** Aktywuje zdolność eksploracji z pełnego stanu (jak panel gracza). */
function aktywuj(state) {
  const view = playerView(state, 'p1');
  const cmd = view.legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === 'compass'
    && c.abilityIndex === 0);
  assert.ok(cmd, 'brak oferty aktywacji Guidestone Compass');
  const result = execute(state, cmd);
  assert.ok(result.ok, `aktywacja odrzucona: ${JSON.stringify(result.events?.[0]?.reason)}`);
  // Zdolność ląduje na stosie — efekt (explore) rozstrzyga się przy zejściu
  // ze stosu (ten sam przebieg co w partii: pass za passem).
  resolveTopOfStack(state);
  return playerView(state, 'p1');
}

test('H: decyzja Explore niesie w widoku źródło i odsłoniętą kartę', () => {
  const state = stolZWierzchem('fathom-fleet-cutthroat');
  const view = aktywuj(state);
  assert.ok(view.pendingExplore, 'brak decyzji Explore w widoku decydenta');
  assert.equal(view.pendingExplore.sourceCardId, 'guidestone-compass', 'źródło eksploracji');
  assert.equal(view.pendingExplore.cardId, 'fathom-fleet-cutthroat', 'odsłonięta karta');
  assert.deepEqual(view.legalCommands.filter((c) => c.type === 'resolve_explore_choice').length, 2,
    'dwie opcje: wierzch albo grób');
});

test('H: tytuł modala nazywa źródło i odsłoniętą kartę (nie „co z odsłoniętą kartą?”)', () => {
  const state = stolZWierzchem('fathom-fleet-cutthroat');
  const view = aktywuj(state);
  const session = { nameOf: (cardId) => REGISTRY.get(cardId)?.name ?? cardId };
  const request = { type: 'resolve_explore_choice', options: view.legalCommands.filter((c) => c.type === 'resolve_explore_choice') };
  const title = choiceGroupTitle(request, session, view);
  assert.match(title, /Guidestone Compass/, `tytuł bez źródła: ${title}`);
  assert.match(title, /Fathom Fleet Cutthroat/, `tytuł bez odsłoniętej karty: ${title}`);
  assert.doesNotMatch(title, /co z odsłoniętą kartą/, 'surowe „co z odsłoniętą kartą?” już nie wystarcza');
});

test('H: opcje decyzji Explore mają podgląd ODSŁONIĘTEJ karty', () => {
  const state = stolZWierzchem('unbreakable-bond');
  const view = aktywuj(state);
  const opcje = view.legalCommands.filter((c) => c.type === 'resolve_explore_choice');
  assert.equal(opcje.length, 2);
  const resolver = (id) => (REGISTRY.get(id) ? id : null);
  for (const opcja of opcje) {
    assert.equal(previewCardIdOfOption(opcja, resolver, view), 'unbreakable-bond',
      `opcja ${JSON.stringify(opcja)} bez podglądu odsłoniętej karty`);
  }
  // Bez widoku (i bez karty w komendzie) zachowanie jak dotąd — brak podglądu.
  assert.equal(previewCardIdOfOption(opcje[0], resolver), null);
});
