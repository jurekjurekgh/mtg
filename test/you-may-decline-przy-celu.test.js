import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

/**
 * E (zgłoszenie właściciela 2026-09-25g): „you may tap target creature"
 * (Angelic Benediction) — modal wyboru celu WYMUSZAŁ wskazanie stwora, a
 * pytanie „you may" padało dopiero przy rozstrzygnięciu (Etap F, M424).
 * W pierwszym modalu ma być opcja decline („Nie tapuj nikogo (you may)").
 *
 * Regułowo (CR 603.3d + 603.5): decline przy celu to SKRÓT — trigger nie
 * idzie na stos i przeciwnik nie dostaje okna odpowiedzi. Wynikowo
 * równoważny w ramach katalogu (brak kart odpowiadających na triggery —
 * pin E3 w `you-may-decline-straznik.test.js`); pełna procedura z oknem
 * odpowiedzi nadal dostępna przez wybór celu (E2).
 */

const REGISTRY = createCardRegistry();

function game(seed = 2026) {
  return createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] });
}

function addRealCard(state, id, cardId, playerId, zone, extra = {}) {
  const card = REGISTRY.get(cardId);
  assert.ok(card, `brak karty ${cardId}`);
  const data = gameObjectDataOf(card);
  data.types = card.types ?? [];
  data.keywords = card.keywords ?? [];
  data.subtypes = card.subtypes ?? [];
  return addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId, zone,
    ...data, ...extra,
  });
}

function setField(state, id, patch) {
  const o = state.objects.get(id);
  state.objects.set(id, Object.freeze({ ...o, ...patch }));
}

function attackAlone(state) {
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  addRealCard(state, 'ab', 'angelic-benediction', 'p1', 'battlefield');
  addRealCard(state, 'atk', 'highland-game', 'p1', 'battlefield');
  setField(state, 'atk', { summoningSickness: false });
  const r = execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['atk'] });
  assert.ok(r.ok, 'atak: ' + (r.reason ?? ''));
  return state;
}

function tapTriggersOnStack(state) {
  return state.zones.stack.filter((id) => {
    const o = state.objects.get(id);
    const eff = o?.triggerEntry?.ability?.effect ?? o?.ability?.effect;
    const types = Array.isArray(eff) ? eff.map((e) => e?.type) : [eff?.type];
    return types.includes('tap_permanent');
  });
}

function drain(state, guard = 250) {
  let n = 0;
  while ((state.zones.stack.length > 0 || state.pendingTriggerTargets.length > 0) && n++ < guard) {
    const holder = state.turn.priorityPlayerId;
    const view = playerView(state, holder);
    const may = view.legalCommands.find((c) => c.type === 'resolve_optional_trigger_choice');
    if (may) {
      const r = execute(state, { ...may, fire: true });
      assert.ok(r.ok, 'may: ' + (r.reason ?? ''));
      continue;
    }
    const pick = view.legalCommands.find((c) => c.type === 'pass_priority')
      ?? view.legalCommands.find((c) => c.type.startsWith('resolve_'));
    assert.ok(pick, 'brak ruchu przy drenowaniu');
    const r = execute(state, pick);
    assert.ok(r.ok, 'dren: ' + (r.reason ?? ''));
  }
  assert.ok(state.zones.stack.length === 0, 'stos pusty po drenowaniu');
}

// E1: modal celu zawiera decline; decline = trigger nie idzie na stos,
// nic się nie tapuje, exalted (drugi trigger) działa bez regresji.
test('E1: Angelic Benediction — decline w modalu celu, brak triggera na stosie', () => {
  const state = game(2027);
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  addRealCard(state, 'ab', 'angelic-benediction', 'p1', 'battlefield');
  addRealCard(state, 'atk', 'highland-game', 'p1', 'battlefield');
  addRealCard(state, 'foe', 'goldmeadow-nomad', 'p2', 'battlefield');
  setField(state, 'atk', { summoningSickness: false });
  const r = execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['atk'] });
  assert.ok(r.ok, 'atak: ' + (r.reason ?? ''));
  const view = playerView(state, 'p1');
  const offers = view.legalCommands.filter((c) => c.type === 'resolve_trigger_target');
  assert.ok(offers.length >= 3, `2 cele + decline w modalu: ${offers.length}`);
  const decline = offers.find((c) => c.targetId == null);
  assert.ok(decline, 'modal celu zawiera decline you-may');
  const rd = execute(state, decline);
  assert.ok(rd.ok, 'decline: ' + (rd.reason ?? ''));
  assert.equal(state.pendingTriggerTargets.length, 0, 'brak wiszących decyzji celu');
  assert.equal(tapTriggersOnStack(state).length, 0, 'trigger tap nie poszedł na stos');
  drain(state);
  assert.equal(state.objects.get('foe').tapped, false, 'wróg nietapnięty');
  assert.equal(state.objects.get('atk').tapped, true, 'atakujący tapnięty atakiem (exalted działa)');
});

// E2: wybór celu = pełna procedura (trigger na stosie, may przy
// rozstrzygnięciu, przeciwnik widzi cel) — brak regresji Etapu F.
test('E2: Angelic Benediction — wybór celu, may-tak przy rozstrzygnięciu tapuje', () => {
  const state = game(2027);
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  addRealCard(state, 'ab', 'angelic-benediction', 'p1', 'battlefield');
  addRealCard(state, 'atk', 'highland-game', 'p1', 'battlefield');
  addRealCard(state, 'foe', 'goldmeadow-nomad', 'p2', 'battlefield');
  setField(state, 'atk', { summoningSickness: false });
  const r = execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['atk'] });
  assert.ok(r.ok, 'atak: ' + (r.reason ?? ''));
  const view = playerView(state, 'p1');
  const pick = view.legalCommands.find((c) => c.type === 'resolve_trigger_target' && c.targetId === 'foe');
  assert.ok(pick, 'cel foe w modalu');
  const rt = execute(state, pick);
  assert.ok(rt.ok, 'cel: ' + (rt.reason ?? ''));
  assert.equal(tapTriggersOnStack(state).length, 1, 'trigger tap na stosie (okno odpowiedzi istnieje)');
  drain(state);
  assert.equal(state.objects.get('foe').tapped, true, 'may-tak: wróg tapnięty');
});

// E4: bot heurystyczny odmawia, gdy do tapnięcia są tylko własne stwory
// (wycena null = 0 istnieje — odmowa wygrywa z ujemnymi celami).
test('E4: bot heurystyczny odmawia tap-you-may przy samych własnych celach', () => {
  const state = attackAlone(game(2028));
  assert.ok(state.pendingTriggerTargets.length > 0, 'decyzja celu wisi');
  const view = playerView(state, 'p1');
  const bot = createHeuristicBot({ seed: 1 });
  const chosen = bot.chooseCommand(view);
  assert.equal(chosen?.type, 'resolve_trigger_target', `bot wybiera cel, wybrał ${chosen?.type}`);
  assert.equal(chosen.targetId, null, 'bot odmawia (tylko własny atakujący do tapnięcia)');
});
