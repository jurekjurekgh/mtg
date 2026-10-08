// M147 — audyt PR #64, F1 (L50/M121): `destroy_if_least_power` (Wretched
// Banquet, w decks/dominaria-brg.txt) nie było w tabeli efektów wrogich bota.
//
// Root cause: efekt nie znajdował się ani w HOSTILE_PERMANENT_EFFECTS, ani
// w REMOVAL_EFFECTS `cast_spell`, więc wszystkie warianty celu miały ten sam
// score 50 — bot brał pierwszego kandydata z listy i potrafił zniszczyć
// WŁASNEGO najsłabszego stwora (albo rzucić w cel bez najmniejszej mocy =
// fizzle). Dokładnie wzorzec L50 (nowy typ efektu wrogiego bez wyceny =
// remis wariantów = „pierwsza oferta").
//
// Fix u root cause (generycznie, bez nazw kart — ADR 0002): efekt dodany do
// HOSTILE_PERMANENT_EFFECTS (kara za własny cel) i REMOVAL_EFFECTS (premia za
// cel przeciwnika), jak destroy_permanent.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function put(state, { id, cardId, controllerId, zone, kind, power = null, toughness = null }) {
  const card = REGISTRY.get(cardId);
  assert.ok(card, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone, kind,
    ...gameObjectDataOf(card), types: card.types ?? [], keywords: card.keywords ?? [],
    subtypes: card.subtypes ?? [], spell: card.spell,
  });
  state.objects.set(id, Object.freeze({
    ...state.objects.get(id),
    summoningSickness: false,
    power: power ?? (card.power ?? null),
    toughness: toughness ?? (card.toughness ?? null),
  }));
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

test('F1a: bot NIE niszczy własnego najsłabszego stwora czarem destroy_if_least_power', () => {
  const state = botTurn();
  put(state, { id: 'banquet', cardId: 'wretched-banquet', controllerId: 'p2', zone: 'hand', kind: 'spell' });
  // JEDYNY stwór na stole to WŁASNY 1/1 bota (najmniejsza moc). Bez kary za
  // własny cel czar ma score 50 > pass, więc bot niszczy własnego stwora.
  put(state, { id: 'mine', cardId: 'highland-game', controllerId: 'p2', zone: 'battlefield', kind: 'creature', power: 1, toughness: 1 });

  const bot = createHeuristicBot({ seed: 2026 });
  const choice = bot.chooseCommand(playerView(state, 'p2'), {});

  assert.notEqual(choice.type, 'cast_spell',
    `bot zniszczył czarem destroy_if_least_power własnego stwora: ${JSON.stringify(choice)}`);
});

test('F1b: bot rzuca destroy_if_least_power w najsłabszego stwora przeciwnika', () => {
  const state = botTurn();
  put(state, { id: 'banquet', cardId: 'wretched-banquet', controllerId: 'p2', zone: 'hand', kind: 'spell' });
  // Przeciwnik ma najsłabszego stwora (1/1); bot nie ma własnych.
  put(state, { id: 'foe', cardId: 'highland-game', controllerId: 'p1', zone: 'battlefield', kind: 'creature', power: 1, toughness: 1 });

  const bot = createHeuristicBot({ seed: 2026 });
  const choice = bot.chooseCommand(playerView(state, 'p2'), {});

  assert.equal(choice.type, 'cast_spell',
    `bot powinien rzucić Wretched Banquet w stwora wroga: ${JSON.stringify(choice)}`);
  assert.equal(choice.targets?.[0], 'foe',
    `cel ma być stwór przeciwnika: ${JSON.stringify(choice)}`);
});
