// M175 — uwagi właściciela (2026-08-22, Death-Hood Cobra): A1 log aktywacji
// nazywa nadawany keyword, A2 bot nie dubluje grantu wiszącego na stosie,
// A3 badge nadanego keywordu na kaflu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { describeGameEvent } from '../src/table/session.js';

const REGISTRY = createCardRegistry();

function game(activeId = 'p2') {
  const state = createGameState({ seed: 175, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', activeId);
  state.turn.activePlayerId = activeId;
  state.turn.priorityPlayerId = activeId;
  return state;
}

function putCard(state, id, cardId, controllerId, zone = 'battlefield', patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, ...patch,
  });
  return state.objects.get(id);
}

const HELPERS = {
  nameOf: (id) => (id === 'death-hood-cobra' ? 'Death-Hood Cobra' : String(id)),
  nameOfObject: (id) => String(id),
};

// ---- A1: log aktywacji nazywa nadawany keyword -------------------------------

test('A1a: ability_activated niesie grantKeywords (reach) na zdarzeniu', () => {
  const state = game('p2');
  putCard(state, 'cobra', 'death-hood-cobra', 'p2', 'battlefield', { summoningSickness: false });
  addMana(state, 'p2', 2, { colors: ['G'] });
  const res = execute(state, { type: 'activate_ability', playerId: 'p2', objectId: 'cobra', abilityIndex: 0 });
  assert.equal(res.ok, true, `aktywacja przechodzi: ${res.reason ?? ''}`);
  const ev = state.events.filter((e) => e.type === 'ability_activated').at(-1);
  assert.ok(ev, 'zdarzenie ability_activated');
  assert.deepEqual(ev.grantKeywords, ['reach'], 'zdarzenie niesie KONKRETNE keywordy grantu');
});

test('A1b: log „aktywuje zdolność” nazywa keyword po polsku (zasięg), bez ogólnika', () => {
  const state = game('p2');
  putCard(state, 'cobra', 'death-hood-cobra', 'p2', 'battlefield', { summoningSickness: false });
  addMana(state, 'p2', 2, { colors: ['G'] });
  execute(state, { type: 'activate_ability', playerId: 'p2', objectId: 'cobra', abilityIndex: 0 });
  const ev = state.events.filter((e) => e.type === 'ability_activated').at(-1);
  const line = describeGameEvent(ev, HELPERS);
  assert.match(line, /zasięg/, `log nazywa keyword: ${line}`);
  assert.doesNotMatch(line, /nadanie słów kluczowych/, `bez ogólnika: ${line}`);
});

test('A1c: druga zdolność Cobry loguje „dotykanie śmierci”', () => {
  const state = game('p2');
  putCard(state, 'cobra', 'death-hood-cobra', 'p2', 'battlefield', { summoningSickness: false });
  addMana(state, 'p2', 2, { colors: ['G'] });
  execute(state, { type: 'activate_ability', playerId: 'p2', objectId: 'cobra', abilityIndex: 1 });
  const ev = state.events.filter((e) => e.type === 'ability_activated').at(-1);
  const line = describeGameEvent(ev, HELPERS);
  assert.match(line, /dotykanie śmierci/, `log nazywa keyword: ${line}`);
});
