import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView, execute } from '../src/engine/game-state.js';
import { moveObjectDirectly } from '../src/engine/objects.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';

/**
 * Audyt CR-compliance (pętla E5, ścieżka inna niż PR #111): podział obrażeń
 * Fireballa, gdy część celów przestaje być legalna PRZED rozstrzygnięciem.
 *
 * Oracle (M10): „Fireball deals X damage divided evenly, rounded down, among
 * any number of targets."
 *
 * Ruling WotC (2017-11-17, za Scryfall API — ADR 0030, tekst dosłowny):
 *   „Fireball's damage is divided as Fireball resolves, not as it's cast,
 *    because there are no choices involved. The division involves only targets
 *    that are still legal as Fireball resolves."
 *   „You can target more than X creatures. However, if the number of legal
 *    targets at the time Fireball resolves is greater than X, none of them
 *    will be dealt any damage."
 *
 * Silnik dzielił przez LICZBĘ CELÓW Z RZUTU (udziały nielegalnych celów
 * „przepadały") — wprost sprzecznie z rulingiem: podział ma obejmować WYŁĄCZNIE
 * cele wciąż legalne przy rozstrzygnięciu.
 */

const REGISTRY = createCardRegistry();

function game() {
  const state = createGameState({ seed: 77, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  return state;
}

function putCard(state, id, cardId, controllerId, zone = 'battlefield', patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, ...patch,
  });
  return state.objects.get(id);
}

function payMana(state, n) {
  addMana(state, 'p1', n, { colors: ['R'] });
}

function castFireball(state, targets, xValue) {
  return execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'fb', targets, xValue });
}

function resolveStack(state) {
  let guard = 0;
  while (state.zones.stack.length > 0 && guard++ < 50) {
    const holder = state.turn.priorityPlayerId;
    const view = playerView(state, holder);
    const pick = view.legalCommands.find((c) => c.type === 'pass_priority')
      ?? view.legalCommands.find((c) => c.type.startsWith('resolve_'));
    if (!pick) return false;
    const r = execute(state, pick);
    if (!r.ok) return false;
  }
  return state.zones.stack.length === 0;
}

test('F1: cel znika przed rozstrzygnięciem — podział między ŻYWE cele (ruling WotC)', () => {
  const state = game();
  putCard(state, 'fb', 'fireball', 'p1', 'hand', { kind: 'spell' });
  // gloomfang-mauler 6/6 — przeżyje; highland-game 2/2 alternatywa.
  putCard(state, 't1', 'gloomfang-mauler', 'p2');
  putCard(state, 't2', 'gloomfang-mauler', 'p2');
  payMana(state, 8);
  assert.ok(castFireball(state, ['t1', 't2'], 4).ok, 'rzut X=4 w 2 cele');
  // Odpowiedź: jeden cel opuszcza pole bitwy.
  moveObjectDirectly(state, 't1', 'exile', 'exile-t1');
  assert.ok(resolveStack(state), 'stos rozstrzygnięty');
  // Ruling: dzielimy przez cele WYŁĄCZNIE wciąż legalne → floor(4/1) = 4.
  assert.equal(state.objects.get('t2').damage, 4,
    'żywy cel dostaje CAŁE X podzielone przez żywe cele (floor(4/1)), nie udział z rzutu');
});

test('F2: X=5, 3 cele, 1 ginie — floor(5/2) po 2 dla żywych', () => {
  const state = game();
  putCard(state, 'fb', 'fireball', 'p1', 'hand', { kind: 'spell' });
  putCard(state, 't1', 'gloomfang-mauler', 'p2');
  putCard(state, 't2', 'gloomfang-mauler', 'p2');
  putCard(state, 't3', 'gloomfang-mauler', 'p2');
  payMana(state, 10);
  assert.ok(castFireball(state, ['t1', 't2', 't3'], 5).ok, 'rzut X=5 w 3 cele');
  moveObjectDirectly(state, 't3', 'exile', 'exile-t3');
  assert.ok(resolveStack(state), 'stos rozstrzygnięty');
  assert.equal(state.objects.get('t1').damage, 2, 'floor(5/2)=2');
  assert.equal(state.objects.get('t2').damage, 2, 'floor(5/2)=2');
});

test('F3: wszystkie cele nielegalne przy rozstrzygnięciu — kontruje się (CR 608.2b)', () => {
  const state = game();
  putCard(state, 'fb', 'fireball', 'p1', 'hand', { kind: 'spell' });
  putCard(state, 't1', 'gloomfang-mauler', 'p2');
  putCard(state, 't2', 'gloomfang-mauler', 'p2');
  payMana(state, 8);
  assert.ok(castFireball(state, ['t1', 't2'], 4).ok, 'rzut X=4 w 2 cele');
  moveObjectDirectly(state, 't1', 'exile', 'exile-t1');
  moveObjectDirectly(state, 't2', 'exile', 'exile-t2');
  assert.ok(resolveStack(state), 'stos rozstrzygnięty (skontrany)');
  assert.equal(state.zones.stack.length, 0, 'stos pusty');
  const fbInGrave = state.zones.graveyard.some((id) => state.objects.get(id)?.cardId === 'fireball');
  assert.ok(fbInGrave, 'skontrowany czar idzie do grobu (CR 608.2b)');
  assert.equal(state.objects.get('exile-t1').damage ?? 0, 0, 'bez obrażeń');
});

test('F4: celów legalnych więcej niż X — nikt nie dostaje obrażeń (ruling WotC)', () => {
  const state = game();
  putCard(state, 'fb', 'fireball', 'p1', 'hand', { kind: 'spell' });
  putCard(state, 't1', 'gloomfang-mauler', 'p2');
  putCard(state, 't2', 'gloomfang-mauler', 'p2');
  putCard(state, 't3', 'gloomfang-mauler', 'p2');
  payMana(state, 10);
  // X=2 w 3 cele: legalne przy rzucie ({1}/cel pozwala), floor(2/3)=0.
  assert.ok(castFireball(state, ['t1', 't2', 't3'], 2).ok, 'rzut X=2 w 3 cele');
  assert.ok(resolveStack(state), 'stos rozstrzygnięty');
  assert.equal(state.objects.get('t1').damage ?? 0, 0, 'zero obrażeń (floor(2/3)=0)');
  assert.equal(state.objects.get('t2').damage ?? 0, 0);
  assert.equal(state.objects.get('t3').damage ?? 0, 0);
});

test('F5: bez zmian, gdy wszystkie cele legalne — floor(X/n) po równo', () => {
  const state = game();
  putCard(state, 'fb', 'fireball', 'p1', 'hand', { kind: 'spell' });
  putCard(state, 't1', 'gloomfang-mauler', 'p2');
  putCard(state, 't2', 'gloomfang-mauler', 'p2');
  putCard(state, 't3', 'gloomfang-mauler', 'p2');
  payMana(state, 10);
  assert.ok(castFireball(state, ['t1', 't2', 't3'], 5).ok, 'rzut X=5 w 3 cele');
  assert.ok(resolveStack(state), 'stos rozstrzygnięty');
  assert.equal(state.objects.get('t1').damage, 1, 'floor(5/3)=1');
  assert.equal(state.objects.get('t2').damage, 1);
  assert.equal(state.objects.get('t3').damage, 1);
});
