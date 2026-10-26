/**
 * Uwaga W (zgłoszenie właściciela, Sultai Scavenger): wygnanie kart za Delve
 * (CR 702.66) musi być widoczne w logu i modalu „Rozgrywka".
 *
 * Kontrakt: `castSpell` i `castPermanent` emitują `object_moved` z `delve: true`
 * DLA KAŻDEJ wygnanej karty (precedens M103/D Escape, E7/E additionalCost).
 * `describeGameEvent` musi nazywać wygnaną kartę, inaczej gracz nie wie, ile
 * kart bot wybrał (0, 1 czy 2) — informacja była tylko w modalu „Rozgrywka"
 * (pytanie `delve_exile_required`), nie w wyniku (`delve_exile_resolved` zwraca
 * `null`, jak `escape_exile_resolved` i `discard_choice_resolved` — indywidualne
 * karty są już nazwane przez `object_moved`).
 *
 * Piny:
 *   W/1 — `object_moved` z `delve: true` ma opis w logu (RED przed naprawą);
 *   W/2 — opis nazywa kartę i koszt (Delve);
 *   W/3 — `delve_exile_resolved` zwraca `null` (nie dubluje `object_moved`);
 *   W/4 — pełna ścieżka: rzut Sultai Scavenger z 2 kartami w grobie → 2×
 *         `object_moved` z opisem w strumieniu zdarzeń.
 *
 * CR 702.66 (Delve): „Each generic mana in the spell's cost can be paid for by
 * exiling a card from your graveyard." — wygnanie jest PŁATNOŚCIĄ KOSZTU
 * (CR 601.2h), więc musi być widoczne jak mana (precedens M103/D).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { describeGameEvent } from '../src/table/session.js';
import { addMana } from '../src/engine/resources.js';

const REGISTRY = createCardRegistry();

const HELPERS = {
  nameOf: (cardId) => REGISTRY.get(cardId)?.name ?? cardId,
  nameOfObject: (id) => {
    const obj = [...REGISTRY.values()].find((c) => c.id === id);
    return obj?.name ?? id;
  },
};
const NAMES = { p1: 'Ty', p2: 'Nieprzyjaciel' };

const describe = (event) => describeGameEvent(event, HELPERS, NAMES);

function put(state, id, cardId, playerId = 'p1', zone = 'hand') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId, zone,
    ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes, keywords: def.keywords,
  });
  return state.objects.get(id);
}

function game() {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  for (const playerId of ['p1', 'p2']) {
    for (let i = 0; i < 6; i += 1) {
      put(state, `lib-${playerId}-${i}`, 'basic-swamp', playerId, 'library');
    }
  }
  return state;
}

const commands = (s) => playerView(s, s.turn.priorityPlayerId).legalCommands;

function run(s, cmd) {
  assert.ok(cmd, 'oferta komendy istnieje');
  const r = execute(s, cmd);
  assert.ok(r.ok, `komenda przyjęta`);
  return r;
}

test('W/1: object_moved z delve: true ma opis w logu', () => {
  const state = game();
  // Sultai Scavenger {5}{B} z Delve w ręce
  put(state, 'scavenger', 'sultai-scavenger', 'p1', 'hand');
  // 2 karty w grobie (materiał do Delve)
  put(state, 'grave1', 'goblin-piker', 'p1', 'graveyard');
  put(state, 'grave2', 'goblin-piker', 'p1', 'graveyard');
  // 4 many czarnej (koszt {5}{B} = 6, minus 2 z Delve = 4)
  addMana(state, 'p1', 4, { colors: ['B'] });

  // Deklaracja rzutu z Delve
  const cmd = commands(state).find((c) => c.type === 'cast_permanent' && c.objectId === 'scavenger');
  assert.ok(cmd, 'Sultai Scavenger w legalCommands');

  // Wykonanie oferty (otwiera pendingDelveExile)
  run(state, cmd);
  assert.ok(state.pendingDelveExile, 'deklaracja rzutu otwiera decyzję kosztu');

  // Rozstrzygnięcie Delve (wygnanie 2 kart)
  const resolveResult = execute(state, {
    type: 'resolve_delve_exile', playerId: 'p1',
    exileIds: ['grave1', 'grave2'],
  });
  assert.ok(resolveResult.ok, `resolve_delve_exile: ${resolveResult.reason ?? 'ok'}`);

  // Sprawdzenie zdarzeń
  const delveMoves = resolveResult.events.filter((e) => e.type === 'object_moved' && e.delve);
  assert.equal(delveMoves.length, 2, '2 karty wygnane przez Delve');

  // PIN: object_moved z delve: true ma opis
  const desc1 = describe(delveMoves[0]);
  assert.ok(desc1, 'object_moved z delve: true ma opis (RED przed naprawą)');
  assert.match(desc1, /Delve/, 'opis nazywa koszt Delve');
  assert.match(desc1, /goblin-piker|Goblin Piker/i, 'opis nazywa kartę');
});

test('W/2: opis nazywa kartę i koszt', () => {
  const state = game();
  put(state, 'scavenger', 'sultai-scavenger', 'p1', 'hand');
  put(state, 'grave1', 'goblin-piker', 'p1', 'graveyard');
  addMana(state, 'p1', 5, { colors: ['B'] });

  const cmd = commands(state).find((c) => c.type === 'cast_permanent' && c.objectId === 'scavenger');
  assert.ok(cmd, 'oferta istnieje');

  run(state, cmd);
  const resolveResult = execute(state, {
    type: 'resolve_delve_exile', playerId: 'p1',
    exileIds: ['grave1'],
  });
  assert.ok(resolveResult.ok);

  const delveMove = resolveResult.events.find((e) => e.type === 'object_moved' && e.delve);
  assert.ok(delveMove, 'znaleziono object_moved z delve');

  const desc = describe(delveMove);
  assert.ok(desc, 'opis istnieje');
  // Opis musi nazywać kartę
  assert.match(desc, /goblin-piker|Goblin Piker/i, 'opis nazywa kartę');
  // Opis musi nazywać koszt
  assert.match(desc, /Delve/, 'opis nazywa koszt Delve');
});

test('W/3: delve_exile_resolved zwraca null (nie dubluje object_moved)', () => {
  const state = game();
  put(state, 'scavenger', 'sultai-scavenger', 'p1', 'hand');
  put(state, 'grave1', 'goblin-piker', 'p1', 'graveyard');
  addMana(state, 'p1', 5, { colors: ['B'] });

  const cmd = commands(state).find((c) => c.type === 'cast_permanent' && c.objectId === 'scavenger');
  assert.ok(cmd, 'oferta istnieje');

  run(state, cmd);
  const resolveResult = execute(state, {
    type: 'resolve_delve_exile', playerId: 'p1',
    exileIds: ['grave1'],
  });
  assert.ok(resolveResult.ok);

  const resolved = resolveResult.events.find((e) => e.type === 'delve_exile_resolved');
  assert.ok(resolved, 'delve_exile_resolved istnieje');

  const desc = describe(resolved);
  assert.equal(desc, null, 'delve_exile_resolved zwraca null (jak escape_exile_resolved)');
});

test('W/4: pełna ścieżka — 2 karty wygnane, 2 opisy w strumieniu', () => {
  const state = game();
  put(state, 'scavenger', 'sultai-scavenger', 'p1', 'hand');
  put(state, 'grave1', 'goblin-piker', 'p1', 'graveyard');
  put(state, 'grave2', 'goblin-piker', 'p1', 'graveyard');
  addMana(state, 'p1', 4, { colors: ['B'] }); // {5}{B} = 6, minus 2 z Delve = 4

  const cmd = commands(state).find((c) => c.type === 'cast_permanent' && c.objectId === 'scavenger');
  assert.ok(cmd, 'oferta istnieje');

  run(state, cmd);
  const resolveResult = execute(state, {
    type: 'resolve_delve_exile', playerId: 'p1',
    exileIds: ['grave1', 'grave2'],
  });
  assert.ok(resolveResult.ok);

  const delveMoves = resolveResult.events.filter((e) => e.type === 'object_moved' && e.delve);
  assert.equal(delveMoves.length, 2, '2 karty wygnane');

  // Każda karta ma opis
  const desc1 = describe(delveMoves[0]);
  const desc2 = describe(delveMoves[1]);
  assert.ok(desc1, 'pierwsza karta ma opis');
  assert.ok(desc2, 'druga karta ma opis');
  // Obie karty to goblin-piker, więc opisy są identyczne - to poprawne
  assert.match(desc1, /Goblin Piker/, 'pierwsza karta nazywa Goblin Piker');
  assert.match(desc2, /Goblin Piker/, 'druga karta nazywa Goblin Piker');
});
