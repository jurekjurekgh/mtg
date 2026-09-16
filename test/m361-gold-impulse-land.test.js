import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

/**
 * M361/B3 (ZŁOTO, bug #3) — land wygnany impulsem („you may play") niegrywalny.
 *
 * CR 701.18b (mtg.wiki/Play 2026-09-16): „To play a card means to play that
 * card as a land or to cast that card as a spell, whichever is appropriate."
 * CR 701.18a: „To play a land means to put it onto the battlefield from the
 * zone it's in (usually the hand)." — „from the zone it's in" obejmuje exile.
 *
 * Silnik zamykał land drop do ręki (playLand: `zone !== 'hand'` + oferty
 * tylko z ręki), więc land wygnany np. Gila Courser („Until the end of your
 * next turn, you may play that card") był martwy — mimo żywego okna impulsu.
 * Fix: land drop dozwolony także z exile w żywym oknie impulsu (timing
 * i limit 1/turn bez zmian — jak z ręki).
 */

const REGISTRY = createCardRegistry();

function game(seed = 20260916) {
  return createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] });
}
function addRealCard(state, id, cardId, playerId, zone, extra = {}) {
  const card = REGISTRY.get(cardId);
  assert.ok(card, `brak karty ${cardId}`);
  const data = gameObjectDataOf(card);
  data.types = card.types ?? [];
  data.keywords = card.keywords ?? [];
  data.subtypes = card.subtypes ?? [];
  return addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId, zone,
    ...data, ...extra,
  });
}
function saddledGila(state) {
  addRealCard(state, 'gila', 'gila-courser', 'p1', 'battlefield');
  state.objects.set('gila', Object.freeze({
    ...state.objects.get('gila'), summoningSickness: false, saddled: true,
  }));
}
function attackWithGila(state) {
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.passes = 0;
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['gila'] }).ok);
  let guard = 0;
  while (state.zones.stack.length > 0 && guard++ < 60) {
    const holder = state.turn.priorityPlayerId;
    const pick = playerView(state, holder).legalCommands.find((c) => c.type === 'pass_priority');
    if (!pick) break;
    execute(state, pick);
  }
}
function toMainWithDrop(state) {
  state.turn = { ...state.turn, phase: 'postcombat_main', step: 'main', stepIndex: 9, passes: 0, activePlayerId: 'p1', priorityPlayerId: 'p1' };
  state.players.find((p) => p.id === 'p1').landPlays = 1;
}
function exiledCard(state, cardId) {
  return state.zones.exile.map((id) => state.objects.get(id)).find((o) => o?.cardId === cardId);
}

test('B3: land z impulsu Gili grywalny z exile (land drop z innej strefy)', () => {
  const state = game();
  saddledGila(state);
  addRealCard(state, 'libland', 'holdout-settlement', 'p1', 'library');
  attackWithGila(state);
  const exiled = exiledCard(state, 'holdout-settlement');
  assert.ok(exiled, 'land wygnany impulsem');
  assert.ok(exiled.playableUntilTurn > state.turn.number, 'okno impulsu żyje');
  toMainWithDrop(state);
  // RED: dotąd oferty play_land tylko z ręki — land z exile bez oferty.
  const offer = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'play_land' && c.objectId === exiled.id);
  assert.ok(offer, 'oferta land dropu z exile (żywe okno impulsu)');
  assert.ok(execute(state, offer).ok, 'land drop z exile wykonany');
  const played = [...state.objects.values()].find((o) => o.cardId === 'holdout-settlement' && o.zone === 'battlefield');
  assert.ok(played, 'land z impulsu na polu bitwy');
  assert.equal(state.players.find((p) => p.id === 'p1').landPlays, 0, 'drop z exile zużywa limit 1/turn');
});

test('B3: po wygaśnięciu okna land z exile niegrywalny (strażnik okna)', () => {
  const state = game(7);
  saddledGila(state);
  addRealCard(state, 'libland', 'holdout-settlement', 'p1', 'library');
  attackWithGila(state);
  const exiled = exiledCard(state, 'holdout-settlement');
  assert.ok(exiled?.playableUntilTurn, 'okno impulsu istnieje');
  state.turn.number = exiled.playableUntilTurn + 1; // okno wygasło
  toMainWithDrop(state);
  const offer = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'play_land' && c.objectId === exiled.id);
  assert.ok(!offer, 'brak oferty po wygaśnięciu okna impulsu');
});

test('B3: jeden wspólny limit — drop z ręki blokuje drop z exile', () => {
  const state = game(11);
  saddledGila(state);
  addRealCard(state, 'libland', 'holdout-settlement', 'p1', 'library');
  addRealCard(state, 'handland', 'holdout-settlement', 'p1', 'hand');
  attackWithGila(state);
  const exiled = exiledCard(state, 'holdout-settlement');
  assert.ok(exiled, 'land wygnany impulsem');
  toMainWithDrop(state);
  const handOffer = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'play_land' && c.objectId === 'handland');
  assert.ok(handOffer, 'drop z ręki oferowany (regresja ścieżki ręki)');
  assert.ok(execute(state, handOffer).ok);
  const exileOffer = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'play_land' && c.objectId === exiled.id);
  assert.ok(!exileOffer, 'po dropie z ręki limit zużyty (brak drugiego dropu z exile)');
});

test('B3: strażnik — heurystyka gra jedyny drop z exile (wycena nie crashuje)', () => {
  const state = game(17);
  toMainWithDrop(state);
  addRealCard(state, 'spell', 'brute-force', 'p1', 'hand');
  addRealCard(state, 'exland', 'holdout-settlement', 'p1', 'exile');
  // Stempel okna impulsu wprost (addObject ucina pola spoza kontraktu — L21).
  state.objects.set('exland', Object.freeze({
    ...state.objects.get('exland'), playableUntilTurn: state.turn.number + 2,
  }));
  const bot = createHeuristicBot({ seed: 1 });
  const chosen = bot.chooseCommand(playerView(state, 'p1'));
  assert.equal(chosen.type, 'play_land', `bot gra land (wybrał ${chosen.type})`);
  assert.equal(chosen.objectId, 'exland', 'bot gra jedyny dostępny drop (z exile, bez crashu wyceny)');
});

test('B3: regresja — nie-land z impulsu nadal rzucalny z exile', () => {
  const state = game(13);
  saddledGila(state);
  addRealCard(state, 'libelk', 'highland-game', 'p1', 'library');
  attackWithGila(state);
  const exiled = exiledCard(state, 'highland-game');
  assert.ok(exiled?.playableUntilTurn, 'stwór wygnany z oknem impulsu');
  toMainWithDrop(state);
  addMana(state, 'p1', 2, { colors: ['G'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === exiled.id);
  assert.ok(cast, 'oferta rzutu stwora z exile istnieje (ścieżka czarów nietknięta)');
});
