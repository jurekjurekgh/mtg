// M179 — inwentaryzacja i łatanie dziur (zlecenie właściciela A–F).
// Oś D: nielandowe źródła czystej many w ofercie i płatności.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { producibleMana, untappedFreeManaSources } from '../src/engine/resources.js';

const REGISTRY = createCardRegistry();

function game(playerId = 'p1') {
  const state = createGameState({ seed: 179, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
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

// ---- D: nielandowe źródła czystej many --------------------------------------

test('D1: producibleMana liczy Seer\'s Lantern i Scorned Villager (czysty {T}: add mana)', () => {
  const state = game('p1');
  assert.equal(producibleMana(state, 'p1'), 0, 'bez źródeł zero');
  putCard(state, 'lantern', 'seers-lantern', 'p1');
  putCard(state, 'villager', 'scorned-villager', 'p1', 'battlefield', { summoningSickness: false });
  assert.equal(producibleMana(state, 'p1'), 2, 'artefakt + stwór bez choroby');
  const free = untappedFreeManaSources(state, 'p1');
  assert.equal(free.length, 2);
});

test('D2: stwór z chorobą przywołania NIE liczy się (CR 302.6); źródła z kosztami/skutkami poza listą', () => {
  const state = game('p1');
  putCard(state, 'villager', 'scorned-villager', 'p1');
  // addObject nie przenosi summoningSickness z patcha (L21) — ustaw wprost.
  state.objects.set('villager', Object.freeze({ ...state.objects.get('villager'), summoningSickness: true }));
  assert.equal(producibleMana(state, 'p1'), 0, 'choroba przywołania blokuje {T}');
  // Apprentice Wizard (koszt {1}{U}) i Pristine Talisman (skutek uboczny —
  // życie) NIE wchodzą do auto-many (świadoma decyzja gracza).
  putCard(state, 'wizard', 'apprentice-wizard', 'p1', 'battlefield', { summoningSickness: false });
  putCard(state, 'talisman', 'pristine-talisman', 'p1');
  assert.equal(untappedFreeManaSources(state, 'p1').length, 0, 'wizard/talisman poza czystą maną');
});

test('D3: oferta rzutu widzi manę z Lantern/Villager i płatność je auto-tapuje (L48)', () => {
  const state = game('p1');
  // Highland Game {1}{G}: 1 Forest (na pipa {G}) + Seer\'s Lantern (generic).
  putCard(state, 'forest', 'basic-forest', 'p1');
  putCard(state, 'lantern', 'seers-lantern', 'p1');
  putCard(state, 'game-card', 'highland-game', 'p1', 'hand');
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'game-card');
  assert.ok(cast, 'oferta rzutu z maną land+artefakt (bez ręcznej aktywacji)');
  assert.ok(execute(state, cast).ok, 'płatność przechodzi');
  assert.equal(state.objects.get('lantern').tapped, true, 'Lantern auto-tapnięty w płatności');
  assert.equal(state.objects.get('forest').tapped, true, 'Forest tapnięty na pipa {G}');
});

test('D3b: pip kolorowy pokrywa nielandowe źródło (Scorned Villager → {G})', () => {
  const state = game('p1');
  putCard(state, 'villager', 'scorned-villager', 'p1', 'battlefield', { summoningSickness: false });
  putCard(state, 'island', 'basic-island', 'p1');
  putCard(state, 'game-card', 'highland-game', 'p1', 'hand'); // {1}{G}
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'game-card');
  assert.ok(cast, 'oferta: {G} z Villagera + generic z Island');
  assert.ok(execute(state, cast).ok, 'płatność przechodzi');
  assert.equal(state.objects.get('villager').tapped, true, 'Villager tapnięty na pipa {G}');
});
