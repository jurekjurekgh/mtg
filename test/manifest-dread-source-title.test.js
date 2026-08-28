// Audyt Żywym Testerem M251/B (sesja arena/01a047db, oś 2 „kompletność
// modali"): decyzja Manifest Dread otwierała modal z generycznym tytułem
// „Wybierz: Wariant (2 opcje)" — bez nazwy ŹRÓDŁA. To ta sama klasa, którą
// właściciel raportował i naprawialiśmy jako M240/B (Satyr Wayfinder) i
// wcześniej M162/C (Chittering Rats): tytuł grupy ma nazywać kartę decyzji,
// źródło idzie z pendingu (ADR 0002 — nigdy z nazwy zaszytej w kodzie).
//
// RED→GREEN: przed naprawą pending nie niesie sourceCardId, a tytuł brzmi
// generycznie („Wybierz: Wariant"). Po naprawie: pendingManifestDread →
// sourceCardId rozstrzyganego czaru (silnik), projekcja w playerView
// (informacja publiczna — czar jest na stosie), choiceSourceTitle nazywa
// kartę (stół).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState, execute, playerView, addObject } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { choiceGroupTitle } from '../src/table/render.js';

const REGISTRY = createCardRegistry();

function gameWithManifestDread() {
  const state = createGameState({ seed: 3, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  addMana(state, 'p1', 20, { G: 5, U: 5, B: 5, R: 5, W: 5 });
  const def = REGISTRY.get('manifest-dread');
  addObject(state, {
    id: 'md', instanceId: 'i-md', cardId: 'manifest-dread', controllerId: 'p1', ownerId: 'p1',
    zone: 'hand', kind: 'spell', types: def.types, colors: def.colors, manaCost: def.manaCost, spell: def.spell,
  });
  for (let i = 0; i < 4; i += 1) {
    addObject(state, {
      id: `lib${i}`, instanceId: `i-lib${i}`, cardId: 'goblin-piker', controllerId: 'p1', ownerId: 'p1',
      zone: 'library', kind: 'creature', types: ['Creature'], colors: ['R'], power: 2, toughness: 1, subtypes: [], abilities: [],
    });
  }
  return state;
}

function resolveToManifestDreadDecision(state) {
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'md');
  assert.ok(cast, 'oferta rzutu Manifest Dread');
  assert.ok(execute(state, cast).ok, 'rzut przyjęty');
  let guard = 0;
  while (!state.pendingManifestDread && guard++ < 12) {
    execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  }
  assert.ok(state.pendingManifestDread, 'czar rozstrzygnięty do decyzji Manifest Dread');
}

test('M251/B: pendingManifestDread niesie sourceCardId rozstrzyganego czaru (informacja publiczna)', () => {
  const state = gameWithManifestDread();
  resolveToManifestDreadDecision(state);
  assert.equal(state.pendingManifestDread.sourceCardId, 'manifest-dread',
    'źródło decyzji manifest dread to rozstrzygany czar (leży wtedy na stosie)');
});

test('M251/B: playerView ujawnia sourceCardId OBOM graczom (tak jak playerId/count)', () => {
  const state = gameWithManifestDread();
  resolveToManifestDreadDecision(state);
  assert.equal(playerView(state, 'p1').pendingManifestDread?.sourceCardId, 'manifest-dread');
  assert.equal(playerView(state, 'p2').pendingManifestDread?.sourceCardId, 'manifest-dread',
    'czar na stosie jest informacją publiczną — przeciwnik też widzi źródło');
});

test('M251/B: tytuł grupy wyboru nazywa źródło, nie generyczne „Wariant" (klasa M240/B)', () => {
  const state = gameWithManifestDread();
  resolveToManifestDreadDecision(state);
  const view = playerView(state, 'p1');
  const viewRef = view;
  const session = {
    view: () => viewRef,
    state,
    nameOf: (cardId) => REGISTRY.get(cardId)?.name ?? cardId,
  };
  const request = {
    type: 'command',
    options: [{ type: 'resolve_manifest_dread', playerId: 'p1', cardId: view.pendingManifestDread.cards[0].id }],
  };
  const title = choiceGroupTitle(request, session, view);
  assert.match(title, /^Manifest Dread — /, `tytuł ma nazywać źródło, jest: ${title}`);
});

test('M251/B (anty-over-fix): bez sourceCardId tytuł schodzi do deskryptora (brak urojeń)', () => {
  const state = gameWithManifestDread();
  resolveToManifestDreadDecision(state);
  state.pendingManifestDread.sourceCardId = null;
  const view = playerView(state, 'p1');
  const session = { view: () => view, state, nameOf: (c) => REGISTRY.get(c)?.name ?? c };
  const request = {
    type: 'command',
    options: [{ type: 'resolve_manifest_dread', playerId: 'p1', cardId: 'lib0' }],
  };
  const title = choiceGroupTitle(request, session, view);
  assert.doesNotMatch(title, /^Manifest Dread — /, 'bez pendingu tytuł nie wymyśla źródła');
});
