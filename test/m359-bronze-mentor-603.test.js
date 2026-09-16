import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { addCounter } from '../src/engine/counters.js';

/**
 * M359 / Brązowa odznaka II (2026-09-16): Mentor na stosie (CR 603.3).
 *
 * Źródła online: mtg.wiki/page/Triggered_ability (CR 603.3 z 7.08.2026:
 * „Once an ability has triggered, its controller puts it on the stack
 * … the next time a player would receive priority.”) oraz Scryfall
 * (Boros Challenger, GRN: „Mentor (Whenever this creature attacks, put
 * a +1/+1 counter on target attacking creature with lesser power.)”).
 *
 * Błąd #3 (CR 603.3): trigger mentora rozstrzygał się W DECYZJI
 * (resolve_mentor_target kładł licznik od razu) — bez stosu i bez okna
 * odpowiedzi. Przeciwnik nie mógł zabić celu ani zmienić sił w odpowiedzi.
 * Po fixie decyzja kładzie trigger na stos (znacznik mentorCounter),
 * a licznik kładzie rozstrzygnięcie po re-walidacji celu (CR 608.2b:
 * stwór na polu, nadal atakujący, siła wciąż mniejsza od siły źródła).
 */

const REGISTRY = createCardRegistry();

function game() {
  return createGameState({ seed: 3593, players: [{ id: 'p1' }, { id: 'p2' }] });
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

/** Deklaracja Challenger (2/3 mentor) + small (1/1); wraca przed decyzją mentora. */
function mentorDeclared(state) {
  addRealCard(state, 'challenger', 'boros-challenger', 'p1', 'battlefield');
  addSimpleCreature(state, 'small', 'p1', { power: 1, toughness: 1 });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['challenger', 'small'] }).ok);
  assert.equal(state.pendingMentorTargets.length, 1, 'decyzja mentora otwarta');
  return state;
}

function resolveMentorDecision(state, targetId = 'small') {
  const r = execute(state, { type: 'resolve_mentor_target', playerId: 'p1', targetId });
  assert.ok(r.ok, 'decyzja mentora przyjęta');
  return r;
}

function passRound(state) {
  for (let i = 0; i < 2; i += 1) {
    const pid = state.turn.priorityPlayerId;
    const r = execute(state, { type: 'pass_priority', playerId: pid });
    assert.ok(r.ok, `pass ${pid} przyjęty (${r.events[0]?.reason ?? 'ok'})`);
  }
}

test('M359/3a: decyzja mentora kładzie trigger NA STOS — licznik dopiero po rundzie passów (RED)', () => {
  const state = mentorDeclared(game());
  resolveMentorDecision(state);
  assert.equal(state.objects.get('small').counters?.['+1/+1'] ?? 0, 0, 'licznik NIE ląduje w decyzji (CR 603.3)');
  assert.equal(state.zones.stack.length, 1, 'trigger mentora czeka na stosie');
  const entry = state.objects.get(state.zones.stack[0]);
  assert.equal(entry?.kind, 'trigger', 'wpis stosu to trigger');
  assert.ok(entry?.triggerEntry?.extra?.mentorCounter, 'znacznik mentorCounter na wpisie');
  passRound(state);
  assert.equal(state.objects.get('small').counters?.['+1/+1'] ?? 0, 1, 'licznik po rozstrzygnięciu triggera');
  assert.ok(state.events.some((e) => e.type === 'trigger_resolved' && e.mentor === true), 'trigger_resolved z mentor:true');
});

test('M359/3b: okno odpowiedzi — zabicie celu w odpowiedzi fizzluje trigger (RED)', () => {
  const state = mentorDeclared(game());
  addRealCard(state, 'shk', 'shock', 'p2', 'hand');
  resolveMentorDecision(state);
  assert.equal(state.zones.stack.length, 1, 'trigger na stosie przed odpowiedzią');
  // Priorytet po decyzji wraca do aktywnego (p1) — pass, potem p2 odpowiada.
  assert.equal(state.turn.priorityPlayerId, 'p1');
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok);
  assert.equal(state.turn.priorityPlayerId, 'p2');
  addMana(state, 'p2', 1, { colors: ['R'] });
  const cast = playerView(state, 'p2').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'shk' && (c.targets ?? []).includes('small'));
  assert.ok(cast, 'p2 może odpowiedzieć Shockiem w cel mentora');
  assert.ok(execute(state, cast).ok, 'Shock rzucony w odpowiedzi');
  passRound(state); // Shock rozstrzyga się pierwszy (LIFO) — small ginie.
  assert.ok(state.objects.get('small') == null, 'cel mentora zginął w odpowiedzi (id zdjęte ze stanu)');
  assert.ok([...state.objects.values()].some((o) => o.zone === 'graveyard' && o.controllerId === 'p1' && o.cardId === 'highland-game'),
    'cel mentora leży w grobie');
  passRound(state); // trigger mentora: cel nielegalny → fizzle (CR 608.2b).
  const resolved = state.events.filter((e) => e.type === 'trigger_resolved' && e.mentor === true);
  assert.equal(resolved.length, 1, 'trigger mentora rozstrzygnął się raz');
  assert.equal(resolved[0].noEffect, true, 'fizzle bez celu (CR 608.2b)');
  assert.equal(state.zones.stack.length, 0);
});

test('M359/3c: re-walidacja „lesser power” — cel, który urósł w odpowiedzi, fizzluje (RED)', () => {
  const state = mentorDeclared(game());
  addRealCard(state, 'might', 'might-of-the-masses', 'p1', 'hand');
  resolveMentorDecision(state);
  // p1 (ma priorytet) pompuje własnego smalla w odpowiedzi: Might +2/+2
  // (2 stwory) → 3/3, czyli NIE mniej niż 2 siły Challengera.
  addMana(state, 'p1', 1, { colors: ['G'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'might' && (c.targets ?? []).includes('small'));
  assert.ok(cast, 'Might of the Masses rzucalny w odpowiedzi');
  assert.ok(execute(state, cast).ok);
  passRound(state); // Might pierwszy: small 3/3.
  passRound(state); // trigger mentora: siła już nie mniejsza → fizzle.
  const resolved = state.events.filter((e) => e.type === 'trigger_resolved' && e.mentor === true);
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].noEffect, true, 'cel z siłą ≥ źródła fizzluje (CR 608.2b)');
  assert.equal(state.objects.get('small').counters?.['+1/+1'] ?? 0, 0, 'brak licznika po fizzlu');
});

test('M359/3d: źródło zabite w odpowiedzi — licznik ląduje (LKI siły, CR 603.10)', () => {
  const state = mentorDeclared(game());
  addRealCard(state, 'shk1', 'shock', 'p2', 'hand');
  addRealCard(state, 'shk2', 'shock', 'p2', 'hand');
  resolveMentorDecision(state);
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok);
  addMana(state, 'p2', 2, { colors: ['R'] });
  // Dwa Shocki w Challengera (2/3) — źródło mentora ginie w odpowiedzi.
  for (const shockId of ['shk1', 'shk2']) {
    const cast = playerView(state, 'p2').legalCommands
      .find((c) => c.type === 'cast_spell' && c.objectId === shockId && (c.targets ?? []).includes('challenger'));
    assert.ok(cast, `${shockId} celuje w Challengera`);
    assert.ok(execute(state, cast).ok);
  }
  passRound(state); // drugi Shock
  passRound(state); // pierwszy Shock — Challenger ginie (4 obrażenia)
  assert.ok(state.objects.get('challenger') == null, 'źródło mentora zginęło w odpowiedzi');
  assert.ok([...state.objects.values()].some((o) => o.zone === 'graveyard' && o.cardId === 'boros-challenger'),
    'Challenger leży w grobie');
  passRound(state); // trigger mentora: cel legalny (1 < 2 ze snapshotu) → licznik.
  const resolved = state.events.filter((e) => e.type === 'trigger_resolved' && e.mentor === true);
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].noEffect ?? false, false, 'trigger działa z LKI siły źródła');
  assert.equal(state.objects.get('small').counters?.['+1/+1'] ?? 0, 1, 'licznik mimo śmierci źródła');
});

test('M359/3e: cel usunięty z walki przed rozstrzygnięciem — fizzle (CR 608.2b)', () => {
  const state = mentorDeclared(game());
  resolveMentorDecision(state);
  assert.equal(state.zones.stack.length, 1);
  // Cel schodzi z listy atakujących (efekt „remove from combat”), ale żyje.
  state.combat.attackers = state.combat.attackers.filter((id) => id !== 'small');
  passRound(state);
  const resolved = state.events.filter((e) => e.type === 'trigger_resolved' && e.mentor === true);
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].noEffect, true, 'nie-atakujący cel fizzluje');
  assert.equal(state.objects.get('small').counters?.['+1/+1'] ?? 0, 0);
});
