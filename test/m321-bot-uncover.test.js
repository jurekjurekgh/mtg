import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView, execute } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { applyEffect } from '../src/engine/effects.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

/**
 * M321 (zgłoszenie właściciela, cz. 5): uncover cloakowanych — „jawna luka
 * w działaniu bota". Od M315 oferta uncover istnieje (CR 701.56b, specjalna
 * akcja bez stosu, koszt = koszt many KARTY, po obrocie znika ward {2}), ale
 * bot miał ją zabetonowaną na NEVER. Wycena (M321): tylko w mainie, przy many,
 * gdy zysk (ciało ponad 2/2 + keywordy (bez ETB, M342)) przebija koszt many +
 * flat za utratę ward. Słabe karty (2/2 za {1}) zostają zakryte — ward {2}
 * jest wart więcej niż ciało 2/2.
 */

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId, zone, extra = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, ...extra,
  });
  return state.objects.get(id);
}

function swamp(state, id, controllerId) {
  put(state, id, 'basic-swamp', controllerId, 'battlefield');
  return state.objects.get(id);
}

/** Cloakuje wierzch biblioteki p2 (Veiled Ascension) — jak w M315. */
function cloakForBot(state, topCardId) {
  put(state, 'va', 'veiled-ascension', 'p2', 'battlefield');
  put(state, 'lib-top', topCardId, 'p2', 'library');
  state.zones.library = ['lib-top'];
  applyEffect(state, { type: 'cloak' }, state.objects.get('va'), []);
  return state.zones.battlefield
    .map((id) => state.objects.get(id))
    .find((o) => o.faceDown && o.controllerId === 'p2');
}

/**
 * Bot (p2) w kroku `step` z mana source'ami; puszczamy jego decyzje aż do
 * uncovera albo wyczerpania okna (max `moves`). Zwraca listę wykonanych typów.
 */
function botDriven({ step = 'main', topCardId = 'plague-reaver', swamps = 3, moves = 8, setup = null } = {}) {
  const state = createGameState({ seed: 321, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  for (let i = 0; i < swamps; i++) swamp(state, `sw${i}`, 'p2');
  const cloaked = cloakForBot(state, topCardId);
  if (setup) setup(state);
  const bot = createHeuristicBot({ seed: 321 });
  const applied = [];
  for (let i = 0; i < moves; i++) {
    const view = playerView(state, 'p2');
    const cmd = bot.chooseCommand(view, {});
    if (!cmd) break;
    applied.push(cmd.type);
    if (cmd.type === 'turn_cloak_face_up') {
      const r = execute(state, cmd);
      assert.ok(r.ok, `uncover przyjęty: ${JSON.stringify(r.events?.slice(-1))}`);
      return { applied, state, cloaked, uncovered: true };
    }
    const r = execute(state, cmd);
    if (!r?.ok) break; // okno się skończyło / komenda nieaktualna
    if (state.turn.step !== step || state.turn.priorityPlayerId !== 'p2') break;
  }
  return { applied, state, cloaked, uncovered: false };
}

test('M321/A: duży stwór pod zakryciem (6/5 za 3) — bot ODSŁANIA w mainie', () => {
  const { applied, state, cloaked, uncovered } = botDriven({});
  assert.ok(uncovered, `bot ma odsłonić plague-reaver; wykonał: ${applied.join(',')}`);
  const flipped = state.objects.get(cloaked.id);
  assert.equal(flipped.faceDown, false, 'twarz do góry po uncover');
  // M321/D (bug z M315): uncover przywraca P/T KARTY — odkryty cloak
  // zostawał 2/2 zamiast 6/5 (turnFaceUp nie czytał P/T z faceDownOriginal).
  assert.equal(flipped.power, 6, `odkryte ciało 6/x: ${flipped.power}/${flipped.toughness}`);
  assert.equal(flipped.toughness, 5, `odkryte ciało x/5: ${flipped.power}/${flipped.toughness}`);
  assert.equal(flipped.manaCost, 3, 'koszt many karty przywrócony');
});

test('M321/B: słaby stwór pod zakryciem (2/2 za {1}) — bot ZOSTAWIA ward {2} i manę', () => {
  // Goblin Piker pod zakryciem: zysk ciała 0, uncover = strata many i ward {2}.
  const { uncovered, applied } = botDriven({ topCardId: 'goblin-piker' });
  assert.ok(!uncovered, `bot NIE ma odsłaniać 2/2; wykonał: ${applied.join(',')}`);
});

test('M321/C: poza mainem (declare_blockers) — uncover nie jest wyceniany', () => {
  const { uncovered, applied } = botDriven({ step: 'declare_blockers', moves: 4 });
  assert.ok(!uncovered, `poza mainem uncover NEVER; wykonał: ${applied.join(',')}`);
});
