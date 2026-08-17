// M126 — audyt Żywym Testerem: oferty jałowe przy pustym zasobie + wycieki
// surowych identyfikatorów (2026-08-17).
//
// Wspólny mianownik znalezisk #1, #2 i #10: zdolność, której CAŁA treść zależy
// od zasobu, jakiego gracz nie ma (pusta biblioteka, brak pasującej karty
// w ręce). Zagranie jest legalne (CR 602.2 — aktywować wolno), ale koszt
// (mana + tapnięcie) przepada bez skutku (CR 608.2b). Gracz musi to widzieć
// PRZED kliknięciem, a bot nie powinien tak marnować zasobów.
//
// Znaleziska pochodzą z 60 partii (serie N, O, P, R, S) — zgłoszenie dotyczyło
// Guidestone Compass, audyt rozszerzył je na całą rodzinę.

import test from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { commandLabel } from '../src/table/render.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();
const SESSION = {
  nameOf: (id) => REGISTRY.get(id)?.name ?? id,
  nameOfObject: (id) => id,
  cardDetails: (id) => REGISTRY.get(id),
  abilitiesOf: (id) => gameObjectDataOf(REGISTRY.get(id)).abilities ?? [],
};

let counter = 0;
/** Stół: `source` na bitwisku + kontrolowany stan biblioteki i ręki. */
function board({ source, hand = [], ownLibrary = [], mana = 6 }) {
  const state = createGameState({ seed: 5, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.number = 6;
  const put = (cardId, controllerId, zone) => {
    const def = REGISTRY.get(cardId);
    assert.ok(def, `karta ${cardId} istnieje`);
    const data = gameObjectDataOf(def);
    const id = `m126-${counter += 1}`;
    addObject(state, {
      id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
      kind: data.kind, power: data.power, toughness: data.toughness, manaCost: data.manaCost,
      abilities: data.abilities ?? [], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
      types: def.types ?? [], colors: data.colors ?? [], cardName: def.name,
    });
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
    return id;
  };
  const sourceId = put(source, 'p1', 'battlefield');
  put('highland-game', 'p1', 'battlefield'); // cel dla zdolności celowanych
  hand.forEach((c) => put(c, 'p1', 'hand'));
  ownLibrary.forEach((c) => put(c, 'p1', 'library'));
  put('goblin-piker', 'p2', 'library'); // biblioteka PRZECIWNIKA nie ratuje gracza
  addMana(state, 'p1', mana, { colors: ['U', 'B', 'R', 'G', 'W', 'U'] });
  return { view: playerView(state, 'p1'), sourceId };
}

const labelOf = (cmd, view) => commandLabel(cmd, SESSION, view).replace(/<[^>]*>/g, '');

// --- #1: pusta biblioteka -------------------------------------------------

test('M126/#1: explore przy PUSTEJ bibliotece ostrzega gracza', () => {
  const { view, sourceId } = board({ source: 'guidestone-compass' });
  const cmd = view.legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === sourceId);
  assert.ok(cmd, 'zdolność jest oferowana (zagranie pozostaje legalne)');
  assert.match(labelOf(cmd, view), /biblioteka jest pusta/,
    'gracz musi wiedzieć, że zapłaci koszt bez skutku');
});

test('M126/#1 (anty-over-fix): przy pełnej bibliotece BRAK ostrzeżenia', () => {
  const { view, sourceId } = board({ source: 'guidestone-compass', ownLibrary: ['basic-island'] });
  const cmd = view.legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === sourceId);
  assert.doesNotMatch(labelOf(cmd, view), /biblioteka jest pusta/,
    'normalne zagranie nie może straszyć ostrzeżeniem');
});

// --- #2: brak pasującej karty w ręce --------------------------------------

test('M126/#2: Dragon Arch bez wielokolorowego stwora w ręce ostrzega', () => {
  const { view, sourceId } = board({ source: 'dragon-arch', hand: ['highland-game'], ownLibrary: ['basic-island'] });
  const cmd = view.legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === sourceId);
  assert.ok(cmd, 'zdolność jest oferowana');
  assert.match(labelOf(cmd, view), /brak pasującej karty w ręce/);
});

test('M126/#2 (anty-over-fix): z wielokolorowym stworem BRAK ostrzeżenia', () => {
  const { view, sourceId } = board({ source: 'dragon-arch', hand: ['zoraline'], ownLibrary: ['basic-island'] });
  const cmd = view.legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === sourceId);
  assert.doesNotMatch(labelOf(cmd, view), /brak pasującej karty/);
});

// --- #10: bot nie marnuje many na jałowe zdolności ------------------------

test('M126/#10: bot NIE aktywuje explore przy pustej bibliotece', () => {
  const { view, sourceId } = board({ source: 'guidestone-compass' });
  const chosen = createHeuristicBot({ seed: 1 }).chooseCommand(view);
  const wastes = chosen.type === 'activate_ability' && chosen.objectId === sourceId;
  assert.equal(wastes, false, `bot zmarnował koszt: ${JSON.stringify(chosen)}`);
});

test('M126/#10: bot NIE aktywuje Dragon Arch bez celu w ręce', () => {
  const { view, sourceId } = board({ source: 'dragon-arch', hand: ['highland-game'], ownLibrary: ['basic-island'] });
  const chosen = createHeuristicBot({ seed: 1 }).chooseCommand(view);
  const wastes = chosen.type === 'activate_ability' && chosen.objectId === sourceId;
  assert.equal(wastes, false, `bot zmarnował koszt: ${JSON.stringify(chosen)}`);
});

test('M126/#10 (anty-over-fix): przy pełnej bibliotece bot NADAL używa explore', () => {
  const { view, sourceId } = board({ source: 'guidestone-compass', ownLibrary: ['basic-island'] });
  const chosen = createHeuristicBot({ seed: 1 }).chooseCommand(view);
  assert.equal(chosen.type, 'activate_ability', `oczekiwano aktywacji: ${JSON.stringify(chosen)}`);
  assert.equal(chosen.objectId, sourceId, 'explore z kartą w bibliotece to sensowne zagranie');
});

test('M126/#10 (anty-over-fix): zdolność MANY działa mimo pustej biblioteki', () => {
  // Seer's Lantern ma dwie zdolności: {T}: Add {C} oraz {2},{T}: Scry 1.
  // Kara za jałowe scry nie może wyłączyć produkcji many — bot ma wybrać
  // zdolność 0, a nie spasować.
  const { view, sourceId } = board({ source: 'seers-lantern' });
  const chosen = createHeuristicBot({ seed: 1 }).chooseCommand(view);
  assert.equal(chosen.type, 'activate_ability');
  assert.equal(chosen.objectId, sourceId);
  assert.equal(chosen.abilityIndex, 0, 'bot ma sięgnąć po manę, nie po jałowe scry');
});
