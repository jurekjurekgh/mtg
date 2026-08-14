// M91 — uwaga C właściciela (2026-08-14): „Przeciwnik-idiota wystawił ląd
// Great Furnace po czym w następnej turze zniszczył go czarem Shatter."
//
// Root cause: scoring bota dla `cast_spell` wyceniał efekty punktowo
// (damage, pump, mill, tokeny, draw), ale NIE MIAŁ ŻADNEJ wyceny efektów
// USUWAJĄCYCH permanent (destroy_permanent, exile_permanent,
// bounce_permanent, bounce_to_library_top, exile_target_creature).
// Taki czar dostawał domyślne 50 punktów niezależnie od tego, CZYJ jest cel —
// więc Shatter wycelowany we własny Great Furnace wyglądał dla bota tak samo
// dobrze jak wycelowany w artefakt przeciwnika (a przy braku celu wroga był
// jedyną „wartościową" akcją i bot ją grał).
//
// Fix u root cause (generycznie, bez nazw kart — ADR 0002): usuwanie
// WŁASNEGO permanentu to strata (silna kara), usuwanie permanentu
// PRZECIWNIKA to zysk skalowany wartością celu.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function put(state, { id, cardId, controllerId, zone, kind }) {
  const card = REGISTRY.get(cardId);
  assert.ok(card, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone, kind,
    ...gameObjectDataOf(card), types: card.types ?? [], keywords: card.keywords ?? [],
    subtypes: card.subtypes ?? [], spell: card.spell,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

/** Tura bota (p2), priorytet bota, pełna mana. */
function botTurn() {
  const state = createGameState({ seed: 2026, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', 10);
  return state;
}

test('C: bot NIE niszczy własnego artefaktu, gdy nie ma innego celu (Shatter na własny Great Furnace)', () => {
  const state = botTurn();
  put(state, { id: 'shatter', cardId: 'shatter', controllerId: 'p2', zone: 'hand', kind: 'spell' });
  // Jedyny artefakt na stole to WŁASNY artefaktowy ląd bota.
  put(state, { id: 'furnace', cardId: 'great-furnace', controllerId: 'p2', zone: 'battlefield', kind: 'land' });

  const bot = createHeuristicBot({ seed: 2026 });
  const choice = bot.chooseCommand(playerView(state, 'p2'), {});

  assert.notEqual(choice.type, 'cast_spell',
    `bot rzucił czar niszczący we własny permanent: ${JSON.stringify(choice)}`);
});

test('C: bot nadal niszczy artefakt PRZECIWNIKA (brak nadgorliwej kary)', () => {
  const state = botTurn();
  put(state, { id: 'shatter', cardId: 'shatter', controllerId: 'p2', zone: 'hand', kind: 'spell' });
  put(state, { id: 'enemy-art', cardId: 'angels-feather', controllerId: 'p1', zone: 'battlefield', kind: 'artifact' });

  const bot = createHeuristicBot({ seed: 2026 });
  const choice = bot.chooseCommand(playerView(state, 'p2'), {});

  assert.equal(choice.type, 'cast_spell', `bot powinien zniszczyć artefakt wroga; wybrał: ${JSON.stringify(choice)}`);
  assert.deepEqual(choice.targets, ['enemy-art']);
});

test('C: mając oba cele, bot wybiera permanent PRZECIWNIKA, nie własny', () => {
  const state = botTurn();
  put(state, { id: 'shatter', cardId: 'shatter', controllerId: 'p2', zone: 'hand', kind: 'spell' });
  put(state, { id: 'furnace', cardId: 'great-furnace', controllerId: 'p2', zone: 'battlefield', kind: 'land' });
  put(state, { id: 'enemy-art', cardId: 'angels-feather', controllerId: 'p1', zone: 'battlefield', kind: 'artifact' });

  const bot = createHeuristicBot({ seed: 2026 });
  const choice = bot.chooseCommand(playerView(state, 'p2'), {});

  if (choice.type === 'cast_spell') {
    assert.deepEqual(choice.targets, ['enemy-art'],
      'bot musi celować w permanent przeciwnika, nie we własny');
  }
});

test('C: kara dotyczy też odbicia własnego permanentu (bounce) — reguła generyczna', () => {
  const state = botTurn();
  // Lunar Rejection: „Return target permanent to its owner's hand" + draw.
  put(state, { id: 'bounce', cardId: 'lunar-rejection', controllerId: 'p2', zone: 'hand', kind: 'spell' });
  const own = put(state, { id: 'own-creature', cardId: 'goblin-piker', controllerId: 'p2', zone: 'battlefield', kind: 'creature' });
  const foe = put(state, { id: 'foe-creature', cardId: 'goblin-piker', controllerId: 'p1', zone: 'battlefield', kind: 'creature' });
  assert.ok(own && foe);

  const bot = createHeuristicBot({ seed: 2026 });
  const choice = bot.chooseCommand(playerView(state, 'p2'), {});
  if (choice.type === 'cast_spell' && (choice.targets ?? []).length > 0) {
    assert.notDeepEqual(choice.targets, ['own-creature'],
      'bot nie może odbijać własnego stwora, mając cel przeciwnika');
  }
});
