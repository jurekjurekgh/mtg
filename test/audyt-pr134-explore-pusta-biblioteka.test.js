import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { resolveTopOfStack } from '../src/engine/spells.js';

/**
 * Audyt PR #134 (§7, weryfikacja cytatów CR 701): komentarze cytowały
 * „CR 701.44 — explore bez karty nic nie robi”. Numer był stary (Explore to
 * dziś 701.44), a twierdzenie fałszywe. CR 701.44a (MagicCompRules
 * 2026-09-25, dosłownie): „…that permanent's controller reveals the top card
 * of their library. If a land card is revealed this way, that player puts
 * that card into their hand. Otherwise, that player puts a +1/+1 counter on
 * the exploring permanent and may put the revealed card into their
 * graveyard.” Przy pustej bibliotece nic nie jest odsłonięte → gałąź
 * „Otherwise” → licznik +1/+1. CR 701.44b: permanent „explores” nawet gdy
 * część kroków była niemożliwa.
 *
 * Silnik zwracał bez licznika (a log i tak pisał „+1/+1 na stworze”), bot
 * uważał explore przy pustej bibliotece za jałowe, a panel ostrzegał, że
 * „zdolność nie zadziała”.
 */

const REGISTRY = createCardRegistry();

function stol({ biblioteka = [] } = {}) {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  const put = (id, cardId, zone, controllerId = 'p1') => {
    const def = REGISTRY.get(cardId);
    addObject(state, {
      id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
      ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
      subtypes: def.subtypes ?? [], spell: def.spell,
    });
  };
  put('compass', 'guidestone-compass', 'battlefield');
  put('cel', 'cacophodon', 'battlefield');
  put('land', 'basic-island', 'battlefield');
  biblioteka.forEach((cardId, i) => put(`lib-${i}`, cardId, 'library'));
  put('lib-p2', 'basic-island', 'library', 'p2'); // biblioteka przeciwnika nie ma znaczenia
  return state;
}

function aktywuj(state) {
  const view = playerView(state, 'p1');
  const cmd = view.legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === 'compass'
    && c.abilityIndex === 0);
  assert.ok(cmd, 'explore przy pustej bibliotece jest oferowany (CR 602.2)');
  const result = execute(state, cmd);
  assert.ok(result.ok, `aktywacja odrzucona: ${JSON.stringify(result.events?.[0]?.reason)}`);
  resolveTopOfStack(state);
}

const plusy = (state, id) => state.objects.get(id)?.counters?.['+1/+1'] ?? 0;

test('explore przy PUSTEJ bibliotece: stwór dostaje +1/+1 (CR 701.44a „Otherwise”)', () => {
  const state = stol();
  const przed = plusy(state, 'cel');
  aktywuj(state);
  assert.equal(plusy(state, 'cel'), przed + 1, 'brak odsłoniętego landu → licznik +1/+1');
  assert.equal(state.pendingExplore ?? null, null, 'nie ma odsłoniętej karty, więc nie ma decyzji wierzch/grób');
  const ev = state.events.find((e) => e.type === 'explore_resolved');
  assert.ok(ev, 'explore zakończony (CR 701.44b — „explores” mimo niemożliwych kroków)');
  assert.equal(ev.found, false);
});

test('anty-over-fix: land na wierzchu idzie do ręki BEZ licznika', () => {
  const state = stol({ biblioteka: ['basic-island'] });
  const przed = plusy(state, 'cel');
  aktywuj(state);
  assert.equal(plusy(state, 'cel'), przed, 'land odsłonięty → do ręki, bez +1/+1');
});
