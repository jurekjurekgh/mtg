import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';

/**
 * M359 / Brązowa odznaka II (2026-09-16): Backup na stosie (CR 603.3).
 *
 * Gloomfang Mauler (MOM): „Backup 2 (When this creature enters, put two
 * +1/+1 counters on target creature. If that's another creature, it gains
 * the following ability until end of turn.)” — „When” = zdolność
 * triggerowana (CR 603.1), która po odpaleniu idzie NA STOS (CR 603.3,
 * mtg.wiki/page/Triggered_ability, CR 2026-08-07).
 *
 * Błąd #4 (CR 603.3): resolve_backup kładł liczniki i grant OD RAZU —
 * bez stosu i okna odpowiedzi. Po fixie decyzja kładzie trigger na stos
 * (znacznik backupApply), a liczniki/grant — rozstrzygnięcie po
 * re-walidacji celu (CR 608.2b).
 */

const REGISTRY = createCardRegistry();

function game() {
  const state = createGameState({ seed: 3594, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
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
    colors: data.colors ?? [], cardName: data.cardName ?? null,
    backup: def.backup ?? null,
  });
  return state.objects.get(id);
}

function addSimpleCreature(state, id, controllerId, { power = 1, toughness = 1 } = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'highland-game', controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost: 1,
    abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [],
  });
  return state.objects.get(id);
}

function findMauler(state) {
  return [...state.objects.values()].find((o) => o.cardId === 'gloomfang-mauler' && o.zone === 'battlefield');
}

/** Mauler rzucony i wchodzący; wraca z otwartą decyzją backup. */
function maulerEnters(state) {
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  addRealCard(state, 'mauler-card', 'gloomfang-mauler', 'p1', 'hand');
  addSimpleCreature(state, 'other', 'p1', { power: 1, toughness: 1 });
  addMana(state, 'p1', 7);
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'mauler-card' }).ok);
  // Runda passów: Mauler wchodzi → decyzja backup blokuje dalsze passy.
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok);
  const r2 = execute(state, { type: 'pass_priority', playerId: 'p2' });
  assert.ok(r2.ok, 'wejście Maulera po rundzie passów');
  assert.ok(findMauler(state), 'Mauler na polu bitwy');
  assert.equal(state.pendingBackups.length, 1, 'decyzja backup otwarta');
  return state;
}

function passRound(state) {
  for (let i = 0; i < 2; i += 1) {
    const pid = state.turn.priorityPlayerId;
    const r = execute(state, { type: 'pass_priority', playerId: pid });
    assert.ok(r.ok, `pass ${pid} przyjęty (${r.events[0]?.reason ?? 'ok'})`);
  }
}

test('M359/4a: decyzja backup kładzie trigger NA STOS — liczniki/grant po passach (RED)', () => {
  const state = maulerEnters(game());
  const r = execute(state, { type: 'resolve_backup', playerId: 'p1', targetId: 'other' });
  assert.ok(r.ok, 'decyzja backup przyjęta');
  assert.equal(state.objects.get('other').counters?.['+1/+1'] ?? 0, 0, 'liczniki NIE lądują w decyzji (CR 603.3)');
  assert.equal(state.zones.stack.length, 1, 'trigger backup czeka na stosie');
  const entry = state.objects.get(state.zones.stack[0]);
  assert.equal(entry?.kind, 'trigger');
  assert.ok(entry?.triggerEntry?.extra?.backupApply, 'znacznik backupApply na wpisie');
  passRound(state);
  const other = state.objects.get('other');
  assert.equal(other.counters?.['+1/+1'] ?? 0, 2, 'liczniki po rozstrzygnięciu');
  assert.ok((other.keywordGrants ?? []).includes('menace'), 'grant menace po rozstrzygnięciu');
  assert.ok(state.events.some((e) => e.type === 'trigger_resolved' && e.backup === true), 'trigger_resolved z backup:true');
});

test('M359/4b: okno odpowiedzi — zabicie celu fizzluje backup (RED)', () => {
  const state = maulerEnters(game());
  addRealCard(state, 'shk', 'shock', 'p2', 'hand');
  assert.ok(execute(state, { type: 'resolve_backup', playerId: 'p1', targetId: 'other' }).ok);
  assert.equal(state.zones.stack.length, 1, 'trigger na stosie przed odpowiedzią');
  assert.ok(execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId }).ok);
  assert.equal(state.turn.priorityPlayerId, 'p2');
  addMana(state, 'p2', 1, { colors: ['R'] });
  const cast = playerView(state, 'p2').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'shk' && (c.targets ?? []).includes('other'));
  assert.ok(cast, 'p2 odpowiada Shockiem w cel backupa');
  assert.ok(execute(state, cast).ok);
  passRound(state); // Shock: other ginie.
  assert.ok(state.objects.get('other') == null, 'cel backupa zginął w odpowiedzi');
  passRound(state); // backup: brak celu → fizzle (CR 608.2b).
  const resolved = state.events.filter((e) => e.type === 'trigger_resolved' && e.backup === true);
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].noEffect, true, 'fizzle bez celu');
  assert.ok(findMauler(state), 'źródło żyje, ale trigger nic nie zrobił');
});

test('M359/4c: cel = samo źródło — liczniki tak, grantu nie (CR 702.165a, po stosie)', () => {
  const state = maulerEnters(game());
  const maulerId = findMauler(state).id;
  assert.ok(execute(state, { type: 'resolve_backup', playerId: 'p1', targetId: maulerId }).ok);
  assert.equal(state.zones.stack.length, 1, 'trigger na stosie także przy celu-źródle');
  passRound(state);
  const mauler = state.objects.get(maulerId);
  assert.equal(mauler.counters?.['+1/+1'] ?? 0, 2, 'źródło dostało liczniki');
  assert.ok(!(mauler.keywordGrants ?? []).includes('menace'), 'źródło NIE dostaje grantu (nie jest „another”)');
});

test('M359/4d: źródło zabite w odpowiedzi — cel i tak dostaje liczniki i grant', () => {
  const state = maulerEnters(game());
  addRealCard(state, 'shk1', 'shock', 'p2', 'hand');
  addRealCard(state, 'shk2', 'shock', 'p2', 'hand');
  addRealCard(state, 'shk3', 'shock', 'p2', 'hand');
  const maulerId = findMauler(state).id;
  assert.ok(execute(state, { type: 'resolve_backup', playerId: 'p1', targetId: 'other' }).ok);
  assert.ok(execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId }).ok);
  // Trzy Shocki w Maulera (5/5) — źródło backupa ginie w odpowiedzi.
  addMana(state, 'p2', 3, { colors: ['R'] });
  for (const shockId of ['shk1', 'shk2', 'shk3']) {
    const cast = playerView(state, 'p2').legalCommands
      .find((c) => c.type === 'cast_spell' && c.objectId === shockId && (c.targets ?? []).includes(maulerId));
    assert.ok(cast, `${shockId} celuje w Maulera`);
    assert.ok(execute(state, cast).ok);
  }
  passRound(state); passRound(state); passRound(state); // Shocki: Mauler ginie (6 obrażeń).
  assert.ok(state.objects.get(maulerId) == null, 'źródło backupa zginęło w odpowiedzi');
  passRound(state); // backup: cel legalny → liczniki i grant mimo śmierci źródła.
  const other = state.objects.get('other');
  assert.equal(other.counters?.['+1/+1'] ?? 0, 2, 'cel dostał liczniki mimo śmierci źródła');
  assert.ok((other.keywordGrants ?? []).includes('menace'), 'cel dostał grant mimo śmierci źródła');
});
