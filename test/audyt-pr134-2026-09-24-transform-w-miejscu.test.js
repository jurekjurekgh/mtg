/**
 * Pin O-6 z audytu PR #134 (docs/audits/AUDYT_PR134_2026-09-24.md, §5/O-6).
 *
 * CR 712.18 (CR 2026-09-25, dosłownie): „When a double-faced permanent
 * transforms or converts, it doesn’t become a new object. Any effects that
 * applied to that permanent will continue to apply to it.”
 *
 * Stan przed naprawą (efekt `transform` w `effects.js`, transform W MIEJSCU —
 * wilkołaki daybound/nightbound, Incubator itd.): cechy drugiej strony szły
 * wprost na obiekt, zapis cofnięcia animacji (`originalBeforeAnimation`)
 * zostawał od STAREJ strony, a `transformTo` utrwalał cechy ANIMOWANE.
 * Sonda na Ballista Watcher (4/3 Human Soldier Werewolf → Ballista Wielder 5/5
 * Werewolf) ożywionym do artefaktu:
 *   • po transformie animacja znikała (typ Artifact ginął),
 *   • cleanup nakładał na Ballista WIELDER wydrukowane cechy przedniej strony
 *     (4/3, Human Soldier Werewolf) — chimera obu stron,
 *   • powrotny transform dawał Ballista Watcher trwale jako animowany artefakt.
 * Modyfikatory P/T (+2/+2 do końca tury) przechodziły poprawnie — spread obiektu.
 *
 * Naprawa: `transformInPlaceFields` (permanents.js) — opuszczana strona trafia do
 * `transformTo` wydrukowanymi cechami, trwająca animacja (zapisana jako
 * warstwa w `originalBeforeAnimation.layer`) jest nakładana na drugą stronę,
 * a zapis cofnięcia wskazuje cechy NOWEJ strony. To samo dla nadpisania
 * podtypów do końca tury (Wishful Merfolk).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject } from '../src/engine/game-state.js';
import { applyEffect } from '../src/engine/effects.js';
import {
  animatePermanentUntilEndOfTurn, animationLayerOf, clearStatModifiers, effectivePower, modifyStats,
} from '../src/engine/permanents.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

const REGISTRY = createCardRegistry();

function gra() {
  return createGameState({ seed: 3, players: [{ id: 'p1' }, { id: 'p2' }] });
}

/** Wilkołak na polu bitwy z danymi drugiej strony (jak createCardDeck). */
function wilkolak(state, id = 'w') {
  const def = REGISTRY.get('ballista-watcher');
  const back = REGISTRY.get(def.transformTo);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: def.id, controllerId: 'p1', ownerId: 'p1', zone: 'battlefield',
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
    transformTo: {
      cardId: back.id, cardName: back.name, power: back.power, toughness: back.toughness,
      abilities: back.abilities ?? [], keywords: back.keywords ?? [],
      subtypes: back.subtypes ?? [], types: back.types ?? [], manaCost: back.manaCost ?? 0,
    },
  });
  return state.objects.get(id);
}

const transformuj = (state, id = 'w') => applyEffect(state, { type: 'transform' }, state.objects.get(id), []);
const animuj = (state, id = 'w') => animatePermanentUntilEndOfTurn(state, id, {
  power: 2, toughness: 2, typesAdd: ['Artifact', 'Creature'], retainTypes: true,
});

test('O-6/1: animacja PRZECHODZI przez transform w miejscu (CR 712.18)', () => {
  const state = gra();
  wilkolak(state);
  animuj(state);
  transformuj(state);
  const o = state.objects.get('w');
  assert.equal(o.cardId, 'ballista-wielder', 'druga strona na wierzchu');
  assert.ok(o.types.includes('Artifact'), 'typ z animacji trwa (warstwa 4)');
  assert.equal(o.power, 2, 'bazowe P/T z animacji trwa (warstwa 7b), nie 5/5 drugiej strony');
  assert.equal(o.toughness, 2);
  assert.deepEqual(o.subtypes, ['Werewolf'], 'podtypy drugiej strony — animacja ich nie zastępuje');
});

test('O-6/2: cleanup przywraca cechy NOWEJ strony — bez chimery obu stron', () => {
  const state = gra();
  wilkolak(state);
  animuj(state);
  transformuj(state);
  clearStatModifiers(state);
  const o = state.objects.get('w');
  assert.equal(o.cardId, 'ballista-wielder');
  assert.equal(o.power, 5, 'Ballista Wielder to 5/5 (przed naprawą: 4/3 przedniej strony)');
  assert.equal(o.toughness, 5);
  assert.deepEqual(o.subtypes, ['Werewolf'], 'bez Human/Soldier przedniej strony');
  assert.deepEqual(o.types, ['Creature'], 'animacja wygasła');
  assert.equal(o.originalBeforeAnimation, null);
});

test('O-6/3: powrotny transform przywraca WYDRUKOWANĄ przednią stronę (transformTo bez animacji)', () => {
  const state = gra();
  wilkolak(state);
  animuj(state);
  transformuj(state);
  assert.equal(state.objects.get('w').transformTo.power, 4, 'transformTo zapisuje 4/3 z druku, nie animowane 2/2');
  assert.deepEqual(state.objects.get('w').transformTo.types, ['Creature'], 'bez typu z animacji');
  clearStatModifiers(state);
  transformuj(state);
  const o = state.objects.get('w');
  assert.equal(o.cardId, 'ballista-watcher');
  assert.equal(o.power, 4);
  assert.equal(o.toughness, 3);
  assert.deepEqual(o.types, ['Creature']);
  assert.deepEqual(o.subtypes, ['Human', 'Soldier', 'Werewolf']);
});

test('O-6/4: modyfikator +2/+2 do końca tury przechodzi przez transform (przykład z CR 712.18)', () => {
  const state = gra();
  wilkolak(state);
  modifyStats(state, 'w', { power: 2, toughness: 2 });
  transformuj(state);
  assert.equal(effectivePower(state.objects.get('w'), state), 7, 'Ballista Wielder 5/5 +2/+2 = 7');
});

test('O-6/5: transform bez żadnych efektów — zachowanie bez zmian (regresja)', () => {
  const state = gra();
  wilkolak(state);
  transformuj(state);
  const o = state.objects.get('w');
  assert.equal(o.power, 5);
  assert.deepEqual(o.subtypes, ['Werewolf']);
  assert.equal(o.originalBeforeAnimation ?? null, null, 'nieanimowany obiekt nie dostaje zapisu cofnięcia');
  transformuj(state);
  assert.equal(state.objects.get('w').power, 4);
});

test('O-6/6: nadpisanie podtypów do końca tury trwa po transformie, cleanup daje podtypy nowej strony', () => {
  const state = gra();
  const o0 = wilkolak(state);
  applyEffect(state, { type: 'becomes_subtype_until_end_of_turn', subtypes: ['Human'] }, o0, ['w']);
  transformuj(state);
  assert.deepEqual(state.objects.get('w').subtypes, ['Human'], 'nadpisanie trwa (712.18)');
  assert.deepEqual(state.objects.get('w').transformTo.subtypes, ['Human', 'Soldier', 'Werewolf'],
    'opuszczana strona zapisana z WYDRUKOWANYMI podtypami');
  clearStatModifiers(state);
  assert.deepEqual(state.objects.get('w').subtypes, ['Werewolf'], 'cleanup: podtypy Ballista Wielder');
});

test('O-6/7: warstwa animacji wyprowadzana także z zapisu bez `layer` (fixtures, stan sprzed zmiany)', () => {
  const layer = animationLayerOf({
    types: ['Artifact', 'Creature'], subtypes: ['Vehicle'], power: 3, toughness: 3,
    originalBeforeAnimation: { kind: 'artifact', types: ['Artifact'], subtypes: ['Vehicle'], power: null, toughness: null },
  });
  assert.deepEqual(layer, { power: 3, toughness: 3, typesAdd: ['Creature'], subtypesAdd: [], retainTypes: true });
  assert.equal(animationLayerOf({ types: ['Creature'] }), null, 'bez zapisu cofnięcia = brak animacji');
});
