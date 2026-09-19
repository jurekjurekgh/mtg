// Uwaga C1 właściciela z testów (2026-09-19, Merchant's Dockhand) — E3:
// wycena bota. Przed tą zmianą efekt `look_top_put_one_hand_rest_bottom` nie
// miał ŻADNEJ wyceny w activate_ability (L131: bez wyceny bot brał pierwszy
// wariant). Po E2 pierwszym wariantem jest X=0 — bez wyceny bot płaciłby
// {3}{U} i tap za efekt bez skutku. Reguła generyczna po typie efektu i
// X z komendy (ADR 0002/0017): X=0 mocno ujemne (aktywacja jałowa), X>0 =
// karta do ręki + niewielka opcjonalność wyboru − koszt tapowanych artefaktów.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const registry = createCardRegistry();

function stan(seed = 31) {
  return createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] });
}
function put(state, id, cardId, controller = 'p1') {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: controller, ownerId: controller,
    zone: 'battlefield', ...gameObjectDataOf(registry.get(cardId)),
  });
}
function biblioteka(state, n = 3) {
  for (let i = 0; i < n; i += 1) {
    addObject(state, { id: `lib${i}`, instanceId: `i-lib${i}`, cardId: 'basic-mountain', controllerId: 'p1', ownerId: 'p1', zone: 'library', kind: 'land' });
  }
}
function dockhand({ artefakty = 2, ksiazka = 3, seed = 31 } = {}) {
  const state = stan(seed);
  put(state, 'dh', 'merchants-dockhand');
  for (let i = 0; i < artefakty; i += 1) put(state, `art${i}`, 'angels-feather');
  biblioteka(state, ksiazka);
  addMana(state, 'p1', 4, { colors: ['U'] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  return state;
}
function decyzja(state, seed = 42) {
  const bot = createHeuristicBot({ seed });
  return bot.chooseCommand(playerView(state, 'p1'), {});
}

test('C1-B/1: bot wybiera X>0 (karta do ręki), NIE wariant X=0 i nie pass', () => {
  const state = dockhand({ artefakty: 2, ksiazka: 3 });
  const cmd = decyzja(state);
  assert.equal(cmd.type, 'activate_ability', `bot aktywuje Dockhanda: ${JSON.stringify(cmd)}`);
  assert.equal(cmd.objectId, 'dh');
  assert.ok((cmd.xValue ?? 0) >= 1, `X>0 — wybrany wariant: ${JSON.stringify(cmd)}`);
  assert.equal((cmd.tapArtifactIds ?? []).length, cmd.xValue, 'X ≡ liczba tapowanych artefaktów');
});

test('C1-B/2: pusta biblioteka → bot NIE aktywuje (każde X bezwartościowe)', () => {
  const state = dockhand({ artefakty: 2, ksiazka: 0 });
  const cmd = decyzja(state);
  const aktywujeDockhanda = cmd?.type === 'activate_ability' && cmd.objectId === 'dh';
  assert.ok(!aktywujeDockhanda, `bez kart w bibliotece aktywacja nie ma wartości: ${JSON.stringify(cmd)}`);
});

test('C1-B/3: sam Dockhand (brak innych artefaktów) → tylko X=0, bot nie płaci 4 many za nic', () => {
  const state = dockhand({ artefakty: 0, ksiazka: 3 });
  const cmd = decyzja(state);
  const aktywujeDockhanda = cmd?.type === 'activate_ability' && cmd.objectId === 'dh';
  assert.ok(!aktywujeDockhanda, `X=0 to aktywacja jałowa — bot jej nie wybiera: ${JSON.stringify(cmd)}`);
});
