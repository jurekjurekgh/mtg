// M91 — uwaga D właściciela (2026-08-14): „Przeciwnik rzucił Ruinous Rampage
// ale ani w logu ani w modalu »Ruch przeciwnika« nie ma słowa o tym co się
// stało — jaką opcję wybrał bot i jak się rozstrzygnęła."
//
// Ruinous Rampage (EOE) to czar modalny („Choose one —"):
//   • 3 obrażenia każdemu przeciwnikowi,
//   • wygnaj wszystkie artefakty o MV ≤ 3.
// Z perspektywy gracza to DWIE zupełnie różne karty — bez informacji o trybie
// log jest bezużyteczny („Nieprzyjaciel rzuca Ruinous Rampage" i tyle).
//
// Root cause: engine ZNA wybrany tryb (`castModalSpell` niesie `modeIndex`
// w `spell_cast`, a `spell_resolved` ma `modal: true` + `modeIndex`), ale
// zdarzenia nie niosą NAZWY trybu, a `describeGameEvent` (czysta funkcja bez
// dostępu do rejestru kart) nie ma jak jej odczytać. Opis pomijał więc tryb.
//
// Fix u root cause: zdarzenia `spell_cast`/`spell_resolved` czaru modalnego
// niosą `modeName` (z `spell.modes[i].name` — dane karty, nie warunek na
// nazwę karty), a `describeGameEvent` dopisuje „ — tryb: <nazwa>".

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { describeGameEvent } from '../src/table/session.js';

const REGISTRY = createCardRegistry();
const NAMES = { p1: 'Ty', p2: 'Nieprzyjaciel' };

function describe(state, e) {
  return describeGameEvent(e, {
    nameOf: (cardId) => REGISTRY.get(cardId)?.name ?? cardId,
    nameOfObject: (id) => REGISTRY.get(state.objects.get(id)?.cardId)?.name ?? '?',
    isPlayer: (id) => state.players.some((p) => p.id === id),
  }, NAMES);
}

function tableWithRampage() {
  const state = createGameState({ seed: 99, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', 8);
  const card = REGISTRY.get('ruinous-rampage');
  addObject(state, {
    id: 'rampage', instanceId: 'i-rampage', cardId: 'ruinous-rampage',
    controllerId: 'p2', ownerId: 'p2', zone: 'hand', kind: 'spell',
    ...gameObjectDataOf(card), types: card.types ?? [], keywords: card.keywords ?? [],
    subtypes: card.subtypes ?? [], spell: card.spell,
  });
  return state;
}

function castMode(state, modeIndex) {
  const cast = playerView(state, 'p2').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'rampage' && c.modeIndex === modeIndex);
  assert.ok(cast, `tryb ${modeIndex} w ofercie`);
  const result = execute(state, cast);
  assert.ok(result.ok, `rzut odrzucony: ${result.events?.[0]?.reason}`);
  return result.events;
}

test('D: log rzutu czaru modalnego mówi, KTÓRY tryb wybrano (Ruinous Rampage)', () => {
  const state = tableWithRampage();
  const events = castMode(state, 0);
  const castEvent = events.find((e) => e.type === 'spell_cast');
  assert.ok(castEvent, 'engine musi wyemitować spell_cast');

  const text = describe(state, castEvent);
  assert.match(text, /Ruinous Rampage/, 'log musi zawierać nazwę karty');
  assert.match(text, /3 obrażenia dla każdego przeciwnika/,
    `log MUSI podać wybrany tryb czaru modalnego; było: "${text}"`);
});

test('D: drugi tryb tej samej karty daje INNY opis w logu', () => {
  const state = tableWithRampage();
  const events = castMode(state, 1);
  const text = describe(state, events.find((e) => e.type === 'spell_cast'));
  assert.match(text, /Wygnaj artefakty/,
    `log MUSI rozróżniać tryby czaru modalnego; było: "${text}"`);
  assert.doesNotMatch(text, /3 obrażenia dla każdego przeciwnika/,
    'log nie może pokazywać trybu, którego bot NIE wybrał');
});

test('D: rozstrzygnięcie czaru modalnego też nazywa tryb', () => {
  const state = tableWithRampage();
  castMode(state, 0);
  // Pełna runda passów rozstrzyga wierzch stosu.
  for (let i = 0; i < 6 && state.zones.stack.length > 0; i += 1) {
    const view = playerView(state, state.turn.priorityPlayerId);
    const pass = view.legalCommands.find((c) => c.type === 'pass_priority');
    if (!pass) break;
    execute(state, pass);
  }
  const resolved = state.events.filter((e) => e.type === 'spell_resolved').pop();
  assert.ok(resolved, 'czar musi się rozstrzygnąć');
  const text = describe(state, resolved);
  assert.match(text, /3 obrażenia dla każdego przeciwnika/,
    `rozstrzygnięcie czaru modalnego MUSI nazywać tryb; było: "${text}"`);
});

test('D: zwykły (niemodalny) czar nie dostaje dopisku o trybie', () => {
  const state = createGameState({ seed: 5, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', 8);
  const card = REGISTRY.get('shatter');
  addObject(state, {
    id: 'shatter', instanceId: 'i-shatter', cardId: 'shatter', controllerId: 'p2', ownerId: 'p2',
    zone: 'hand', kind: 'spell', ...gameObjectDataOf(card), types: card.types ?? [],
    keywords: card.keywords ?? [], subtypes: card.subtypes ?? [], spell: card.spell,
  });
  const artCard = REGISTRY.get('angels-feather');
  addObject(state, {
    id: 'art', instanceId: 'i-art', cardId: 'angels-feather', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'artifact', ...gameObjectDataOf(artCard),
    types: artCard.types ?? [], keywords: artCard.keywords ?? [], subtypes: artCard.subtypes ?? [],
  });
  const cast = playerView(state, 'p2').legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'shatter');
  assert.ok(cast, 'Shatter w ofercie');
  const result = execute(state, cast);
  const text = describe(state, result.events.find((e) => e.type === 'spell_cast'));
  assert.doesNotMatch(text, /tryb/, `czar bez trybów nie może mieć dopisku o trybie; było: "${text}"`);
});
