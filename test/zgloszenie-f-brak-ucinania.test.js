// =============================================================================
// Zgłoszenie F właściciela (2026-11-05): „Nie zgadzam się na żadne ucinanie.
// W żadnej gałęzi ani żadnym efekcie.” Enumeracja legalnych wariantów ma być
// kompletna — limity (32 wariantów, pula 8, sufit X=15 itd.) usunięte z:
// triggerów wielocelowych, deklaracji walki, puli czarów dzielonych,
// Fireballa i czarów z {X}. Kolejność ofert bez zmian (determinizm).
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { legalFireballCasts, dividedDamageDivisions } from '../src/engine/spells.js';
import { attackCandidateIds, attackerDeclarationViolation, blockerDeclarationViolation, blockerSeedAssignments } from '../src/engine/combat.js';

const REGISTRY = createCardRegistry();
const READY = { summoningSick: false, summoningSickness: false };

function putReal(state, id, cardId, controllerId, zone = 'battlefield') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
}

function creature(state, id, controllerId, power, toughness, patch = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId, ownerId: controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost: 3, abilities: [], keywords: [],
    subtypes: [], types: ['Creature'], colors: [], cardName: id,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...READY, ...patch }));
}

function baseState() {
  const state = createGameState({ seed: 71, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  for (const pid of ['p1', 'p2']) for (let i = 0; i < 5; i += 1) {
    addObject(state, {
      id: `lib-${pid}-${i}`, instanceId: `ilib-${pid}-${i}`, cardId: `test-lib-${pid}-${i}`,
      controllerId: pid, ownerId: pid, zone: 'library', kind: 'spell', manaCost: 2,
    });
  }
  return state;
}

test('F/1 (po G, etap 2): trigger wielocelowy — komplet kandydatów w deskryptorze, walidacja wybranego zestawu', () => {
  const state = baseState();
  for (let i = 0; i < 6; i += 1) putReal(state, `foe${i}`, 'highland-game', 'p2');
  putReal(state, 'titan', 'inferno-titan', 'p1', 'hand');
  addMana(state, 'p1', 6, { colors: ['R'] });
  const cast = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_permanent' && c.objectId === 'titan');
  assert.ok(execute(state, cast).ok);
  for (let i = 0; i < 20 && !state.pendingTriggerTargets?.[0]; i += 1) {
    if (state.zones.stack.length > 0) execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
    else break;
  }
  const view = playerView(state, 'p1');
  const n = view.pendingTriggerTarget.candidateIds.length;
  assert.ok(n >= 8, `szeroka pula kandydatów (${n})`);
  // F żądał kompletu bez sufitu — po G komplet żyje w DESKRYPTORZE
  // (wszyscy kandydaci, maxTargets=3), a oferta niesie tylko ziarna:
  // zestaw zachłanny + singletony + pusty (upTo). Żaden legalny zestaw
  // nie jest ucięty, bo waliduje go execute, nie lista ofert.
  assert.equal(view.pendingTriggerTarget.maxTargets, 3, 'deskryptor niesie limit slotów');
  const offers = view.legalCommands.filter((c) => c.type === 'resolve_trigger_target');
  assert.equal(offers.length, n + 2, `ziarna: ${offers.length} ofert dla ${n} kandydatów (bez sufitu, bez enumeracji podzbiorów)`);
  const chosen = view.pendingTriggerTarget.candidateIds.slice(-2);
  const seedKeys = new Set(offers.map((c) => [...(c.targetIds ?? [])].sort().join('|')));
  assert.ok(!seedKeys.has([...chosen].sort().join('|')), 'wybrany zestaw dwucelowy nie jest ziarnem');
  assert.ok(execute(state, { type: 'resolve_trigger_target', playerId: 'p1', targetIds: chosen }).ok,
    'dowolny legalny zestaw z deskryptora przechodzi walidację przy execute');
});

test('F/2 (po G, etap 1): atak ma komplet kandydatów i walidację wybranego podzbioru', () => {
  const state = baseState();
  for (let i = 0; i < 6; i += 1) creature(state, `atk${i}`, 'p1', 2, 2);
  assert.deepEqual(attackCandidateIds(state, 'p1'),
    ['atk0', 'atk1', 'atk2', 'atk3', 'atk4', 'atk5'],
    'wszyscy zdolni atakujący są w deskryptorze problemu, bez materializacji 64 ofert');
  assert.equal(attackerDeclarationViolation(state, 'p1', ['atk0', 'atk1', 'atk3', 'atk5']), null,
    'dowolny legalny podzbiór — tu czterosobowy — przechodzi walidację wybranej deklaracji');
  assert.equal(attackerDeclarationViolation(state, 'p1', ['atk0', 'atk0']),
    'Atakujący nie może wystąpić więcej niż raz');
});

test('F/3 (po G, etap 1): bloki mają wielomianowe ziarna i walidację złożonego przypisania', () => {
  const state = baseState();
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  for (let i = 0; i < 4; i += 1) creature(state, `a${i}`, 'p2', 2, 2);
  for (let i = 0; i < 4; i += 1) creature(state, `b${i}`, 'p1', 2, 2);
  const declare = playerView(state, 'p2').legalCommands
    .find((c) => c.type === 'declare_attackers' && c.attackerIds.length === 4);
  assert.ok(declare && execute(state, declare).ok, 'deklaracja 4 atakujących');
  const seeds = blockerSeedAssignments(state, 'p1');
  assert.ok(seeds.length <= 22, `ziarna to brak bloku, 16 par, 4 gangi i pokrycie zachłanne (jest ${seeds.length})`);
  assert.equal(blockerDeclarationViolation(state, 'p1', { a0: ['b0', 'b1'], a1: ['b2'], a3: ['b3'] }), null,
    'złożone przypisanie spoza ziaren przechodzi walidację wybranej deklaracji');
});

test('F/4: pula czaru dzielonego nie przycina kandydatów (10 stworów wroga)', () => {
  const state = baseState();
  for (let i = 0; i < 10; i += 1) putReal(state, `foe${i}`, 'highland-game', 'p2');
  putReal(state, 'fj', 'fiery-justice', 'p1', 'hand');
  const object = state.objects.get('fj');
  const divisions = dividedDamageDivisions(state, 'p1', object);
  assert.ok(divisions.length > 0, 'są oferty podziału');
  const targeted = new Set(divisions.flatMap((d) => (Array.isArray(d) ? d : []).map((e) => e.id)));
  assert.ok([...targeted].some((id) => /^foe[89]$/.test(id)),
    'cele spoza dawnej puli 8 są osiągalne');
});

test('F/5: Fireball — podzbiory powyżej 3 celów i X powyżej 15 przy budżecie', () => {
  const state = baseState();
  for (let i = 0; i < 4; i += 1) putReal(state, `foe${i}`, 'highland-game', 'p2');
  putReal(state, 'fb', 'fireball', 'p1', 'hand');
  const object = state.objects.get('fb');
  const casts = legalFireballCasts(state, 'p1', 'fb', object, 25);
  assert.ok(casts.some((c) => (c.targets ?? []).length >= 4), 'podzbiór 4+ celów dostępny');
  assert.ok(casts.some((c) => c.xValue > 15), `X powyżej dawnego sufitu 15 (maks ${Math.max(...casts.map((c) => c.xValue))})`);
});
