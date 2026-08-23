// M200/N3 (audyt PR #70, CR 603.2 / ADR 0022): Contested Game Ball —
// trigger „Whenever you're dealt combat damage" był MARTWY.
//
// Batch 48 napisał trigger na zdarzeniu `combat_damage_to_you`, które
// NIGDY NIE BYŁO emitowane ani skanowane w frameworku triggerów
// (framework zna `combat_damage_to_player` — na STWORZE, które zadaje).
// Testy batcha wołały `applyEffect(attacker_gains_control_and_untaps)`
// wprost, więc omijały wiring i były fałszywie zielone (L5/L21). Karta
// `supported` nie realizowała swojej głównej zdolności (ADR 0022).
//
// Fix: generyczna gałąź w skanie damage_dealt (combat) — źródłem triggera
// jest dowolny permanent kontrolowany przez gracza, który otrzymał
// obrażenia bojowe (trigger siedzi na ARTEFAKCIE, nie na stwora).
// Drugi bug znaleziony przy okazji: gdy atakującymi był KONTROLER piłki
// (obrażenia od trample-blokerów we własnym ataku), Oracle i tak odkręca
// artefakt („the attacking player gains control … AND UNTAPS IT"), a
// implementacja wczesno-odcinała całość.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView, execute } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep, initialTurn } from '../src/engine/turn.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId, zone = 'battlefield', patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  if (Object.keys(patch).length) {
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
  }
  return state.objects.get(id);
}

/** Pusty stół + bestia do atakowania (bez choroby). */
function beast(state, id, controllerId, power, toughness, extra = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'hill-giant', controllerId, ownerId: controllerId,
    zone: 'battlefield', kind: 'creature', power, toughness,
    types: ['Creature'], subtypes: ['Giant'], abilities: [], ...extra,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

function combatState(attacker) {
  const state = createGameState({ seed: 777, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep({ ...initialTurn(attacker) }, 'declare_attackers', attacker);
  state.turn.activePlayerId = attacker;
  state.turn.priorityPlayerId = attacker;
  return state;
}

function resolveCombat(state, attackingPlayer, defendingPlayer) {
  const res = execute(state, { type: 'resolve_combat', playerId: attackingPlayer, defendingPlayerId: defendingPlayer });
  assert.equal(res.ok, true, JSON.stringify(res.events?.map((e) => e.type)));
  return res.events;
}

/** Rozstrzyga stos do końca (T6: trigger idzie na stos — trzeba go rozegrać). */
function drainStack(state, limit = 12) {
  for (let i = 0; i < limit && state.zones.stack.length > 0; i += 1) {
    const owner = state.turn.priorityPlayerId;
    const pass = playerView(state, owner).legalCommands.find((c) => c.type === 'pass_priority');
    if (!pass) break;
    const res = execute(state, pass);
    assert.ok(res.ok, JSON.stringify(res.events?.map((e) => `${e.type}:${e.reason ?? ''}`)));
  }
  assert.equal(state.zones.stack.length, 0, 'stos po drenażu pusty');
}

test('M200/N3: pełna ścieżka — p2 atakuje p1 (kontrolera piłki), piłka przechodzi do p2', () => {
  const state = combatState('p2');
  beast(state, 'atk', 'p2', 3, 3);
  put(state, 'ball', 'contested-game-ball', 'p1', 'battlefield', { tapped: true });
  assert.equal(execute(state, { type: 'declare_attackers', playerId: 'p2', attackerIds: ['atk'] }).ok, true);
  assert.equal(execute(state, { type: 'declare_blockers', playerId: 'p1', assignments: {} }).ok, true);
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  resolveCombat(state, 'p2', 'p1');
  drainStack(state);
  const ball = state.objects.get('ball');
  assert.equal(ball.controllerId, 'p2',
    'Oracle: „the attacking player gains control of this artifact" — trigger musiał odpalić');
  assert.equal(ball.tapped, false, '…i untaps it');
  assert.ok(state.events.some((e) => e.type === 'control_changed' && e.objectId === 'ball'),
    'zdarzenie control_changed w strumieniu (L24 — ciche skutki nie istnieją)');
});

test('M200/N3: edge case — atakujący = kontroler piłki: kontrola bez zmian, piłka się odkręca', async () => {
  // „The attacking player gains control … AND UNTAPS IT": gdy atakującymi był
  // kontroler piłki (w CR: nadwyżka trample blokerów we własnym ataku — w tym
  // engine nadwyżka trample blokerów nie idzie w gracza, patrz audyt O1),
  // „gains control" jest puste, ale odkręcenie i tak obowiązuje.
  // Pełna ścieżka kombatu jest w tym engine niedostępna (brak nadwyżki
  // trample blokerów), więc weryfikujemy efekt z kontekstem triggera —
  // dokładnie tak, jak rozstrzyga go resolveTriggerEntry (extra wpisu).
  const { applyEffect } = await import('../src/engine/effects.js');
  const state = combatState('p1');
  put(state, 'ball', 'contested-game-ball', 'p1', 'battlefield', { tapped: true });
  state.combat = { attackingPlayerId: 'p1', attackers: ['x'], blockers: new Map(), blockedAttackers: new Set() };
  // Kontekst triggera: atakujący = p1 (kontroler piłki) — fallback „przeciwnik
  // kontrolera" (p2) by tu KLAMAŁ, stąd kontekst ma pierwszeństwo.
  applyEffect(state, { type: 'attacker_gains_control_and_untaps' }, state.objects.get('ball'), [],
    { attackingPlayerId: 'p1' });
  const ball = state.objects.get('ball');
  assert.equal(ball.controllerId, 'p1', 'kontrola NIE zmienia się (atakujący = kontroler)');
  assert.equal(ball.tapped, false, 'Oracle: „…and untaps it" — odkręcenie i tak działa');
  assert.ok(state.events.some((e) => e.type === 'object_untapped' && e.objectId === 'ball'),
    'odkręcenie widoczne w logu (L24)');
});

test('M200/N3: anty-over-fix — obrażenia gracza NIE kontrolującego piłkę nic nie robią', () => {
  // p1 kontroluje piłkę i atakuje; obrażenia dostaje p2 (bez piłki).
  // „Whenever YOU'RE dealt combat damage" — „you" = kontroler piłki (p1),
  // który nie dostaje obrażeń → trigger nie odpala.
  const state = combatState('p1');
  beast(state, 'atk', 'p1', 3, 3);
  put(state, 'ball', 'contested-game-ball', 'p1', 'battlefield', { tapped: true });
  assert.equal(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['atk'] }).ok, true);
  assert.equal(execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: {} }).ok, true);
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  resolveCombat(state, 'p1', 'p2');
  const ball = state.objects.get('ball');
  assert.equal(state.players.find((p) => p.id === 'p2').life, 17, 'p2 dostał obrażenia bojowe');
  assert.equal(ball.controllerId, 'p1', 'piłka zostaje u p1 (jego kontroler nie został ranny)');
  assert.equal(ball.tapped, true, 'i pozostaje tapnięta — zero skutków');
  assert.ok(!state.events.some((e) => e.type === 'control_changed' && e.objectId === 'ball'),
    'brak zdarzenia zmiany kontroli');
});
