// D2-audyt (pytanie właściciela 2026-09-13): czy WSZYSTKIE mechaniki oparte
// na dobraniu traktują dobór z pustej biblioteki jak przegraną (CR 704.5b)?
// Tak — każda ścieżka doboru w silniku stawia znacznik `emptyLibraryDraw`:
//   - `draw_cards` (czary, ETB, triggery ataków) → drawPlayerCards,
//   - `draw_cards_both_players` (Strike a Deal), `draw_then_discard`,
//     dobór warunkowy, `pendingOptionalDraw` → ten sam choke point,
//   - krok dobierania (performDrawStepDraw) i cyklowanie (spells.js, M272)
//     → własne pętle, ale TEN SAM znacznik.
// A Selhoff Occultist (pamięć właściciela) NIE dobiera — MIELI („target
// player mills a card"), a mill z pustej biblioteki to legalny no-op
// (CR 701.13b) — stąd brak game over. Tak samo: szukanie do ręki, explore,
// satyr/pick do ręki, bounce, mulligan (CR 701.3b) — „połóż do ręki" to NIE
// jest dobranie (CR 121.1: dobrać = wziąć WIERZCHNIĄ kartę jako ZDARZENIE
// dobrania).
// Testy biorą efekty WPROST Z REJESTRU kart (nie ręcznie składane kopie).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject } from '../src/engine/game-state.js';
import { applyEffect } from '../src/engine/effects.js';
import { runStateBasedActions } from '../src/engine/state-based.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';

const REGISTRY = createCardRegistry();

function stateWith(lib1, lib2) {
  const s = createGameState({ seed: 5, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main', 'p1');
  s.turn.activePlayerId = s.turn.priorityPlayerId = 'p1';
  const def = REGISTRY.get('hill-giant');
  const fill = (playerId, count, prefix) => {
    for (let i = 0; i < count; i += 1) {
      const id = `${prefix}${i}`;
      addObject(s, {
        id, instanceId: `i-${id}`, cardId: 'hill-giant', controllerId: playerId, ownerId: playerId,
        zone: 'library', ...gameObjectDataOf(def), types: def.types ?? [], keywords: [], subtypes: [],
      });
    }
  };
  fill('p1', lib1, 'l1-');
  fill('p2', lib2, 'l2-');
  return s;
}
function lostReason(s, playerId) {
  return s.events.find((e) => e.type === 'player_lost' && e.playerId === playerId)?.reason ?? null;
}

test('D2-audyt: Mysteries of the Deep (efekt czaru) z pustej biblioteki = przegrana', () => {
  const s = stateWith(0, 5);
  const fx = REGISTRY.get('mysteries-of-the-deep').spell.effects;
  for (const effect of fx) {
    applyEffect(s, effect, { id: 'src', cardId: 'mysteries-of-the-deep', controllerId: 'p1' }, []);
  }
  assert.equal(s.status, 'active', 'sam efekt nie kończy gry — rozstrzyga akcja stanowa');
  runStateBasedActions(s);
  assert.equal(s.status, 'finished');
  assert.equal(s.winnerId, 'p2');
  assert.equal(lostReason(s, 'p1'), 'empty_library');
});

test('D2-audyt: Inspiration (WYMUSZONY dobór przeciwnika) z pustej = przegrana przeciwnika', () => {
  const s = stateWith(5, 0);
  const fx = REGISTRY.get('inspiration').spell.effects;
  for (const effect of fx) {
    applyEffect(s, effect, { id: 'src', cardId: 'inspiration', controllerId: 'p1' }, ['p2']);
  }
  runStateBasedActions(s);
  assert.equal(s.status, 'finished');
  assert.equal(s.winnerId, 'p1', 'to cel dobrania przegrywa, nie kontroler czaru');
  assert.equal(lostReason(s, 'p2'), 'empty_library');
});

test('D2-audyt: Selhoff Occultist (MILL) z pustej biblioteki = GRA TOCZY SIĘ DALEJ', () => {
  const s = stateWith(5, 0);
  const fx = REGISTRY.get('selhoff-occultist').abilities[0].effect;
  applyEffect(s, fx, { id: 'src', cardId: 'selhoff-occultist', controllerId: 'p1' }, ['p2']);
  runStateBasedActions(s);
  assert.equal(s.status, 'active', 'mill z pustej to no-op (CR 701.13b), nie próba dobrania');
  assert.equal(lostReason(s, 'p2'), null);
});
