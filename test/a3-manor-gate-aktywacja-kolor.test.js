// A3 (znalezisko właściciela z testów, 2026-09-16): po wyborze CZARNEGO koloru
// opcja aktywacji Manor Gate nadal obiecywała „— dodaj 1 manę zieloną", a
// aktywacja realnie produkowała wyłącznie zieloną. Oracle: „{T}: Add {G} or
// one mana of the chosen color" — jednostka many to {G} LUB wybrany kolor
// (model M67 — wielokolorowa jednostka opłaca dowolny z pipów).
//
// Dwa warstwy tej samej reguły (L41):
//  1. ENGINE: effects.js add_mana musi złączyć deskryptor ['G'] z polem
//     `chosenColor` OBIEKTU (kreator many — getSourceForObject — robi ten
//     sam union; bez niego kreator oferował czarną, a aktywacja dawała zieloną).
//  2. ETYKIETA: manaEffectLabel („dodaj 1 manę …") dostaje kontekst obiektu
//     (chosenColor) w ścieżkach, które obiekt znają: kafel karty i wiersz
//     „Aktywuj:" w panelu działań.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { manaEffectLabel } from '../src/table/session.js';

const REGISTRY = createCardRegistry();

function game(playerId = 'p1') {
  const state = createGameState({ seed: 46, players: [{ id: 'p1' }, { id: 'p2' }] });
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

test('A3/engine: aktywacja {T} po wyborze czarnego daje jednostkę {G}{B} w puli', () => {
  const state = game('p1');
  putCard(state, 'gate', 'manor-gate', 'p1', 'hand');
  const play = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'play_land' && c.objectId === 'gate');
  assert.ok(play, 'oferta zagrania lądu');
  assert.ok(execute(state, play).ok);
  const pickBlack = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'resolve_color_choice' && c.color === 'B');
  assert.ok(pickBlack, 'można wybrać czarny');
  assert.ok(execute(state, pickBlack).ok);

  const gate = state.zones.battlefield
    .map((id) => state.objects.get(id)).find((o) => o?.cardId === 'manor-gate');
  assert.equal(gate.chosenColor, 'B', 'wybór zapisany na permanencie');
  // Manor Gate wchodzi tapnięty — aktywacja {T} wymaga odkręcenia
  // (w realnej grzy jeden upkeep; w teście odkręcamy wprost jak B46/9).
  state.objects.set(gate.id, Object.freeze({ ...gate, tapped: false }));

  const activate = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === gate.id);
  assert.ok(activate, 'oferta aktywacji {T}');
  assert.ok(execute(state, activate).ok, 'aktywacja przyjęta');

  const p1 = state.players.find((p) => p.id === 'p1');
  assert.equal(p1.manaPool.G ?? 0, 0, 'pula NIE dostaje czysto zielonej jednostki');
  assert.equal(p1.manaPool.BG ?? 0, 1, 'jednostka wielokolorowa {G}{B} (opłaca oba pipy)');
});

test('A3/etykieta: manaEffectLabel z kontekstem chosenColor nazywa oba kolory', () => {
  assert.equal(
    manaEffectLabel({ type: 'add_mana', amount: 1, colors: ['G'] }, { chosenColor: 'B' }),
    'dodaj 1 manę zieloną lub czarną',
    'deskryptor {G} + wybrany czarny = „zieloną lub czarną” (M193/A1 fleksja)',
  );
  assert.equal(
    manaEffectLabel({ type: 'add_mana', amount: 1, colors: ['G'] }),
    'dodaj 1 manę zieloną',
    'bez kontekstu obiektu etykieta zostaje po deskryptorze (np. podgląd karty z rejestru)',
  );
  assert.equal(
    manaEffectLabel({ type: 'add_mana', amount: 1, colors: ['G'] }, { chosenColor: 'G' }),
    'dodaj 1 manę zieloną',
    'wybrany kolor = kolor deskryptora → bez dublowania',
  );
});
