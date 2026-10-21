import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { previewCardIdOfOption } from '../src/table/choice-request.js';

/**
 * Zgłoszenie O (właściciel, testy 2026-10-18): Release the Ants — po Clash modal
 * „wierzch czy spód” nie pozwala podejrzeć odsłoniętej karty (brak 🔍, a nazwa
 * w opcjach nie prowadzi do pełnego ekranu karty).
 *
 * Przyczyna: komenda `resolve_clash_choice` nie niesie identyfikatora karty
 * (karta siedzi w oczekującej decyzji `pendingClash`), a `previewCardIdOfOption`
 * nie umiał jej stamtąd wziąć. To ten sam przypadek co H (Explore), więc
 * naprawa idzie tą samą drogą: karta z widoku decyzji, jawna (odsłonięta).
 *
 * Kontrakt: każda opcja clash (wierzch i spód, obaj gracze) daje podgląd
 * ODSŁONIĘTEJ karty tego gracza, który właśnie decyduje.
 */

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId, zone) {
  const def = REGISTRY.get(cardId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
}

/** Stół: p1 rzuca Release the Ants w p2; obie biblioteki mają po karcie. */
function stolZRelease() {
  const state = createGameState({ seed: 2026, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  put(state, 'ants', 'release-the-ants', 'p1', 'hand');
  put(state, 'lib-mine', 'armored-skaab', 'p1', 'library'); // mv 3
  put(state, 'lib-opp', 'goblin-piker', 'p2', 'library'); // mv 2
  addMana(state, 'p1', 2);
  const cast = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'ants', targets: ['p2'] });
  assert.ok(cast.ok, JSON.stringify(cast.events[0]));
  return state;
}

/** Przechodzi priorytetami, aż czar rozstrzygnie się do decyzji clash. */
function doClash(state) {
  for (let i = 0; i < 12 && !state.pendingClash; i += 1) {
    const r = execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
    assert.ok(r.ok, JSON.stringify(r.events[0]));
  }
  assert.ok(state.pendingClash, 'clash powinien czekać na decyzje');
}

const resolver = (id) => (REGISTRY.get(id) ? id : null);

test('O: widok decyzji clash niesie odsłonięte karty obu graczy', () => {
  const state = stolZRelease();
  doClash(state);
  const view = playerView(state, 'p1');
  assert.equal(view.pendingClash.playerId, 'p1', 'pierwszy decyduje caster');
  assert.equal(view.pendingClash.cards.p1, 'armored-skaab', 'karta caster w widoku');
  assert.equal(view.pendingClash.cards.p2, 'goblin-piker', 'karta przeciwnika (odsłonięta) w widoku');
});

test('O: obie opcje clash (wierzch i spód) mają podgląd odsłoniętej karty decydenta', () => {
  const state = stolZRelease();
  doClash(state);
  const view = playerView(state, 'p1');
  const opcje = view.legalCommands.filter((c) => c.type === 'resolve_clash_choice');
  assert.equal(opcje.length, 2, 'wierzch albo spód');
  for (const opcja of opcje) {
    assert.equal(previewCardIdOfOption(opcja, resolver, view), 'armored-skaab',
      `brak podglądu dla opcji ${JSON.stringify(opcja)}`);
  }
});

test('O: po decyzji castera drugi gracz widzi podgląd SWOJEJ odsłoniętej karty', () => {
  const state = stolZRelease();
  doClash(state);
  const first = execute(state, { type: 'resolve_clash_choice', playerId: 'p1', putOnBottom: false });
  assert.ok(first.ok, JSON.stringify(first.events[0]));
  const view = playerView(state, 'p2');
  assert.equal(view.pendingClash.playerId, 'p2', 'teraz decyduje przeciwnik');
  const opcje = view.legalCommands.filter((c) => c.type === 'resolve_clash_choice');
  assert.equal(opcje.length, 2);
  for (const opcja of opcje) {
    assert.equal(previewCardIdOfOption(opcja, resolver, view), 'goblin-piker');
  }
});

test('O: bez widoku decyzji opcja clash nie wymyśla karty (brak fałszywego podglądu)', () => {
  const state = stolZRelease();
  doClash(state);
  const opcja = playerView(state, 'p1').legalCommands.find((c) => c.type === 'resolve_clash_choice');
  assert.equal(previewCardIdOfOption(opcja, resolver, null), null);
});
