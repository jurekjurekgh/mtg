// M90 — bug C1 (zgłoszenie właściciela, iPhone 2026-08-14): „Bot rzuca
// Carrion Call (instant). Brak okna na instant w odpowiedzi mimo many."
//
// Root cause (reguły, nie UI): `state.turn.passes` rósł przy każdym
// `pass_priority`, ale był zerowany WYŁĄCZNIE przy zmianie kroku i po
// rozstrzygnięciu stosu — nie po AKCJI gracza. Sekwencja z partii:
//   człowiek pass (passes=1) → bot rzuca czar (passes NADAL 1)
//   → bot pass (passes=2 = liczba graczy) → engine rozstrzyga wierzch stosu.
// Człowiek nigdy nie dostawał priorytetu na odpowiedź.
//
// CR 117.3c: gdy gracz podejmie akcję (rzuci czar, aktywuje zdolność),
// otrzymuje priorytet ponownie — a wszyscy pozostali muszą go dostać zanim
// cokolwiek się rozstrzygnie. CR 117.4: czar rozstrzyga się dopiero, gdy
// WSZYSCY gracze pasują KOLEJNO, bez akcji pomiędzy passami.
//
// Fix u root cause: każda zaakceptowana komenda inna niż `pass_priority`
// zeruje licznik passów (`accepted()` w src/engine/game-state.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';

const REGISTRY = createCardRegistry();

function put(state, { id, cardId, controllerId, zone, kind }) {
  const card = REGISTRY.get(cardId);
  assert.ok(card, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone, kind,
    ...gameObjectDataOf(card),
    types: card.types ?? [], keywords: card.keywords ?? [], subtypes: card.subtypes ?? [],
    spell: card.spell,
  });
  return state.objects.get(id);
}

/** Stół: tura p2, priorytet p1 (przeciwnik aktywnego gracza). */
function table() {
  const state = createGameState({ seed: 2026, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p1';
  addMana(state, 'p1', 8);
  addMana(state, 'p2', 8);
  return state;
}

test('bug C1: czar przeciwnika NIE rozstrzyga się bez okna na odpowiedź (CR 117.3c/117.4)', () => {
  const state = table();
  // Bot (p2) ma instant Carrion Call, człowiek (p1) ma instant w odpowiedzi.
  put(state, { id: 'cc', cardId: 'carrion-call', controllerId: 'p2', zone: 'hand', kind: 'spell' });
  put(state, { id: 'mine', cardId: 'garruks-companion', controllerId: 'p1', zone: 'battlefield', kind: 'creature' });
  put(state, { id: 'bf', cardId: 'brute-force', controllerId: 'p1', zone: 'hand', kind: 'spell' });

  // Człowiek pasuje w main przeciwnika (nic jeszcze na stosie).
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok);
  assert.equal(state.turn.priorityPlayerId, 'p2');

  // Bot rzuca instant — to AKCJA, więc licznik passów musi wrócić do zera.
  const cast = playerView(state, 'p2').legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'cc');
  assert.ok(cast, 'Carrion Call w ofercie bota');
  assert.ok(execute(state, cast).ok);
  assert.equal(state.zones.stack.length, 1, 'czar czeka na stosie');
  assert.equal(state.turn.passes, 0, 'akcja (rzut czaru) zeruje licznik passów — CR 117.3c');

  // Bot pasuje: to DOPIERO PIERWSZY pass po akcji — czar nie może się
  // rozstrzygnąć, priorytet wraca do człowieka.
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p2' }).ok);
  assert.equal(state.zones.stack.length, 1, 'czar rozstrzygnął się bez okna na odpowiedź (bug C1)');
  assert.equal(state.turn.priorityPlayerId, 'p1', 'człowiek musi dostać priorytet na odpowiedź');

  // I człowiek realnie widzi ofertę instantu w odpowiedzi.
  const answer = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'bf');
  assert.ok(answer, 'gracz musi mieć w ofercie instant w odpowiedzi na czar przeciwnika');
});

test('bug C1: pełna runda passów po akcji nadal rozstrzyga czar (bez zawieszenia gry)', () => {
  const state = table();
  put(state, { id: 'cc', cardId: 'carrion-call', controllerId: 'p2', zone: 'hand', kind: 'spell' });

  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok);
  const cast = playerView(state, 'p2').legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'cc');
  assert.ok(execute(state, cast).ok);

  // Dwa KOLEJNE passy bez akcji pomiędzy → czar się rozstrzyga (CR 117.4).
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p2' }).ok);
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok);
  assert.equal(state.zones.stack.length, 0, 'po pełnej rundzie passów czar musi się rozstrzygnąć');
  const tokens = [...state.objects.values()].filter((o) => o.zone === 'battlefield' && o.controllerId === 'p2' && o.kind === 'creature');
  assert.equal(tokens.length, 2, 'Carrion Call tworzy dwa tokeny Phyrexian Insect');
});

test('bug C1: akcja gracza w jego własnej turze też zeruje passy (odpowiedź przeciwnika)', () => {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  addMana(state, 'p1', 8);
  addMana(state, 'p2', 8);
  put(state, { id: 'mine', cardId: 'garruks-companion', controllerId: 'p1', zone: 'battlefield', kind: 'creature' });
  put(state, { id: 'bf', cardId: 'brute-force', controllerId: 'p1', zone: 'hand', kind: 'spell' });

  const cast = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'bf');
  assert.ok(cast, 'Brute Force w ofercie');
  assert.ok(execute(state, cast).ok);
  assert.equal(state.turn.passes, 0);
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok);
  assert.equal(state.zones.stack.length, 1, 'przeciwnik musi dostać okno na odpowiedź');
  assert.equal(state.turn.priorityPlayerId, 'p2');
});
