// Audyt PR #148 (sesja 2026-10-01b), domknięcie U4 z audytu PR #146:
// „koszt wyłącznie {C} tapuje niepotrzebnie ląd dający zielony".
//
// U4 był zapisany BEZ repro (AUDYT_PR146 §8). Pomiar tą sesją (sonda
// `/tmp/probe/u4-c-mana.mjs`, 5 wariantów: tylko Forest; Forest + Seer's
// Lantern; Forest + bezbarwna pula; Forest + 2 źródła {C}; Holdout Settlement
// + Forest) NIE odtworzył usterki: przy samym Lesie oferta nie powstaje
// (CR 107.4c), a przy źródle {C} tapowane jest WŁAŚNIE ono, nie Las.
//
// Te piny są strażnikiem klasy z #146/F1 (bezbarwne pokrywa {C}, kolorowe nie)
// w miejscu, którego tamte testy nie dotykały: WYBÓR ŹRÓDŁA do zapłaty.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';

const registry = createCardRegistry();

function put(state, id, cardId, playerId = 'p1', zone = 'battlefield', patch = {}) {
  const def = registry.get(cardId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId, zone,
    ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes, keywords: def.keywords,
  });
  if (Object.keys(patch).length) state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
}

function game() {
  const state = createGameState({ seed: 148, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  for (let i = 0; i < 4; i += 1) put(state, `lib${i}`, 'basic-swamp', 'p1', 'library');
  put(state, 'shrieker', 'kozileks-shrieker', 'p1', 'battlefield', { summoningSickness: false });
  return state;
}

const oferta = (state) => playerView(state, 'p1').legalCommands
  .find((c) => c.type === 'activate_ability' && c.objectId === 'shrieker');

test('U4/1: sama zieleń nie opłaca {C} — brak oferty (CR 107.4c)', () => {
  const state = game();
  put(state, 'forest', 'basic-forest');
  assert.equal(oferta(state), undefined, 'Forest produkuje {G}, więc {C} jest nieopłacalne');
});

test('U4/2: przy źrodle {C} tapowane jest ono, Las zostaje nietapnięty', () => {
  const state = game();
  put(state, 'forest', 'basic-forest');
  put(state, 'lantern', 'seers-lantern'); // {T}: Add {C}
  const cmd = oferta(state);
  assert.ok(cmd, 'oferta przy bezbarwnym źródle many');
  assert.ok(execute(state, cmd).ok);
  assert.equal(state.objects.get('lantern').tapped, true, 'źródło {C} zapłaciło koszt');
  assert.equal(state.objects.get('forest').tapped, false, 'Las (produkuje {G}) NIE jest tapowany niepotrzebnie');
});

test('U4/3: bezbarwna jednostka w puli płaci bez tapowania czegokolwiek (kotwica)', () => {
  const state = game();
  put(state, 'forest', 'basic-forest');
  addMana(state, 'p1', 1, { colors: [] });
  const cmd = oferta(state);
  assert.ok(cmd, 'pula bezbarwna wystarcza');
  assert.ok(execute(state, cmd).ok);
  assert.equal(state.objects.get('forest').tapped, false, 'płatność z puli nie tapie lądu');
  assert.deepEqual(state.players.find((p) => p.id === 'p1').manaPool, {}, 'jednostka bezbarwna wydana');
});
