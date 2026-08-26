// M216 — polowanie na błędy (odznaka), znalezisko #4:
// DEVOUR ROZSTRZYGA SIĘ PO TRIGGERACH ETB (CR 702.82a).
//
// CR 702.82a: „Devour is a static ability. 'Devour N' means 'As this object
// enters, you may sacrifice any number of creatures. This permanent enters
// with N +1/+1 counters on it for each creature sacrificed this way.'"
// Devour jest zdolnością STATYCZNĄ (replacement — „as it enters", nie „when
// it enters"): stwór wchodzi NA POLU BITWY już Z licznikami. Triggery
// „when it enters" (własne stwora i cudze, np. Impact Tremors
// „Whenever a creature you control enters") wędrują na stos DOPIERO po
// zakończeniu zdarzenia wejścia — czyli po rozstrzygnięciu decyzji devour.
//
// Silnik przed M216 odpalał triggery ETB w TEJ SAMEJ komendzie, w której
// kolejkował decyzję devour: Impact Tremors lądował na stosie, gdy
// pendingDevours wciąż czekał, a Gorger Wurm miał 0 liczników. To pozwalało
// m.in. na odpowiedź na trigger przed dokonaniem poświęceń — wbrew CR 702.82a.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { effectivePower } from '../src/engine/permanents.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

const REGISTRY = createCardRegistry();

function game() {
  return createGameState({ seed: 2026, players: [{ id: 'p1' }, { id: 'p2' }] });
}

function mainPhase(state, playerId = 'p1') {
  state.turn.phase = 'precombat_main';
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  state.turn.step = 'precombat_main';
  state.turn.stepIndex = 3;
  state.turn.passes = 0;
  return state;
}

function addRealCard(state, id, cardId, controllerId, zone) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, spell: data.spell, abilities: data.abilities ?? [],
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [], types: def.types ?? [],
    colors: data.colors ?? [],
    aura: def.aura ?? null, devour: def.devour ?? null, endure: def.endure ?? null,
    ownerId: null,
  });
  return state.objects.get(id);
}

function addSimpleCreature(state, id, controllerId) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'highland-game', controllerId, zone: 'battlefield',
    kind: 'creature', power: 1, toughness: 1, manaCost: 1,
    abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [],
  });
  return state.objects.get(id);
}

/** Rozstrzyga stos pełnymi rundami passów; zatrzymuje się na decyzji blokującej. */
function resolveStack(state) {
  const all = [];
  if (state.zones.stack.length === 0) return all;
  const blockedByDecision = (r) => !r.ok && /(_unresolved|not_your_decision)$/.test(r.events[0]?.reason ?? '');
  let guard = 0;
  while (state.zones.stack.length > 0 && guard < 12) {
    let passesDone = state.turn.passes;
    while (passesDone < state.players.length) {
      const holder = state.turn.priorityPlayerId;
      const r1 = execute(state, { type: 'pass_priority', playerId: holder });
      if (blockedByDecision(r1)) return all;
      assert.ok(r1.ok, r1.events[0]?.reason);
      all.push(...r1.events);
      if (state.turn.passes === 0) break;
      passesDone = state.turn.passes;
    }
    guard += 1;
  }
  return all;
}

/** Stwór z devour wchodzi przy działającym Impact Tremors i 1 kandydacie. */
function wurmEntersWithTremors(state) {
  mainPhase(state, 'p1');
  addRealCard(state, 'tremors', 'impact-tremors', 'p1', 'battlefield');
  addSimpleCreature(state, 'snack', 'p1');
  addRealCard(state, 'wurm-card', 'gorger-wurm', 'p1', 'hand');
  addMana(state, 'p1', 5);
  const cast = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'wurm-card' });
  assert.ok(cast.ok, cast.events[0]?.reason);
  resolveStack(state);
}

function hasEnterTriggerEvent(state) {
  return state.events.some((e) => e.type === 'ability_triggered'
    && e.trigger === 'creature_you_control_enters');
}

test('BUG4: podczas decyzji devour trigger ETB (Impact Tremors) NIE jest na stosie', () => {
  const state = game();
  wurmEntersWithTremors(state);
  const wurmId = state.zones.battlefield.find((id) => state.objects.get(id)?.cardId === 'gorger-wurm');
  assert.ok(wurmId, 'Gorger Wurm na polu bitwy');
  assert.equal(state.pendingDevours.length, 1, 'decyzja devour oczekuje');
  // CR 702.82a: wejście jeszcze nie zakończone — nic nie może odpowiedzieć na
  // trigger, którego nie ma. Stos bez wpisów, brak zdarzeń „creature you
  // control enters", stwór wciąż bez liczników (decyzja przed nim).
  assert.equal(state.zones.stack.length, 0, 'stos pusty — trigger ETB jeszcze nie odpalił');
  assert.equal(hasEnterTriggerEvent(state), false, 'brak ability_triggered creature_you_control_enters');
  assert.deepEqual(state.objects.get(wurmId).counters ?? {}, {}, 'liczniki dopiero po devour');
  const view = playerView(state, 'p1');
  assert.ok(view.legalCommands.some((c) => c.type === 'resolve_devour_choice'), 'decyzja devour oferowana');
});

test('BUG4: po poświęceniu (done) trigger ETB idzie na stos, licznik wcześniej', () => {
  const state = game();
  wurmEntersWithTremors(state);
  const wurmId = state.zones.battlefield.find((id) => state.objects.get(id)?.cardId === 'gorger-wurm');
  // Poświęcenie jedynego kandydata zamyka decyzję automatycznie.
  const res = execute(state, { type: 'resolve_devour_choice', playerId: 'p1', targetId: 'snack' });
  assert.ok(res.ok, res.events[0]?.reason);
  // Licznik jest NA STWORZE, zanim trigger ETB trafi na stos.
  assert.equal(state.objects.get(wurmId).counters['+1/+1'], 1);
  assert.equal(effectivePower(state.objects.get(wurmId), state), 6);
  // Stos niesie teraz trigger Impact Tremors; kolejność zdarzeń: decyzja
  // zamknięta PRZED ability_triggered (onStack).
  const triggerOnStack = state.zones.stack
    .map((id) => state.objects.get(id))
    .find((o) => o?.kind === 'trigger' && o.triggerEntry?.ability?.trigger?.event === 'creature_you_control_enters');
  assert.ok(triggerOnStack, 'trigger creature_you_control_enters na stosie PO devour');
  const resolvedIdx = res.events.findIndex((e) => e.type === 'devour_choice_resolved' && e.done === true);
  const firedIdx = res.events.findIndex((e) => e.type === 'ability_triggered' && e.onStack === true);
  assert.ok(resolvedIdx >= 0 && firedIdx > resolvedIdx,
    `devour_choice_resolved przed ability_triggered: ${res.events.map((e) => e.type).join(' > ')}`);
  // Trigger rozstrzyga się: 1 obrażenia do p2.
  const p2Before = state.players.find((p) => p.id === 'p2').life;
  resolveStack(state);
  assert.equal(state.players.find((p) => p.id === 'p2').life, p2Before - 1, 'Impact Tremors: 1 dmg');
});

test('BUG4: done bez poświęceń też czeka z triggerem ETB („you may" — zero legalne)', () => {
  const state = game();
  wurmEntersWithTremors(state);
  assert.equal(state.zones.stack.length, 0, 'przed decyzją stos pusty');
  const res = execute(state, { type: 'resolve_devour_choice', playerId: 'p1', done: true });
  assert.ok(res.ok, res.events[0]?.reason);
  assert.ok(
    state.zones.stack.map((id) => state.objects.get(id))
      .some((o) => o?.kind === 'trigger' && o.triggerEntry?.ability?.trigger?.event === 'creature_you_control_enters'),
    'trigger ETB po done:true (0 poświęceń)',
  );
});

test('BUG4: stwór BEZ devour odpala Impact Tremors bez zmian (regresja)', () => {
  const state = game();
  mainPhase(state, 'p1');
  addRealCard(state, 'tremors', 'impact-tremors', 'p1', 'battlefield');
  addRealCard(state, 'trooper', 'alaborn-trooper', 'p1', 'hand');
  addMana(state, 'p1', 3);
  const cast = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'trooper' });
  assert.ok(cast.ok, cast.events[0]?.reason);
  resolveStack(state);
  assert.equal(state.pendingDevours.length, 0, 'brak decyzji devour');
  assert.ok(hasEnterTriggerEvent(state), 'zwykły stwór odpala ETB jak dotąd');
});
