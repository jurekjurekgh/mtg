/**
 * Pin D4b / warstwa 6 + zakrycie (CR 613.1f, 613.7, 613.9, 708.2) — plan
 * 2026-09-24, audyt docs/audits/AUDYT_PR134_2026-09-24.md §9 (W-3, W-4).
 *
 * CR 613.1f (CR 2026-09-25, dosłownie): „Layer 6: Ability-adding effects,
 * keyword counters, ability-removing effects, and effects that say an object
 * can’t have an ability are applied.”
 * CR 613.9: „Two effects are affecting the same creature: one from an Aura
 * that says ‘Enchanted creature has flying’ and one from an Aura that says
 * ‘Enchanted creature loses flying.’ Neither of these depends on the other,
 * since nothing changes what they affect or what they’re doing to it.
 * Applying them in timestamp order means the one that was generated last
 * ‘wins.’”
 * CR 613.7e: „An Aura, Equipment, or Fortification receives a new timestamp
 * each time it becomes attached to an object or player.”
 * CR 701.3b: „If an effect tries to attach an Aura, Equipment, or
 * Fortification to the object or player it’s already attached to, the effect
 * does nothing.”
 * CR 708.2: „Face-down spells and face-down permanents have no characteristics
 * other than those listed by the ability or rules that allowed the spell or
 * permanent to be face down. Any listed characteristics are the copiable
 * values of that object’s characteristics.”
 * CR 708.8: „As a face-down permanent is turned face up, its copiable values
 * revert to its normal copiable values. Any effects that have been applied to
 * the face-down permanent still apply to the face-up permanent.”
 *
 * Stan przed naprawą (sonda na prawdziwych kartach):
 *  W-3 zakryty stwór + „gains flying” / True Conviction / Anthem of Champions
 *      → bez flying, bez double strike, bez +1/+1 (zakrycie odcinało też
 *      efekty z ZEWNĄTRZ, a 708.2 ustala tylko wartości kopiowalne).
 *  W-4 Grounded, potem „gains flying” albo Shiv's Embrace → bez flying
 *      (utrata wygrywała zawsze, bez znaczników czasu); CR 613.9: później
 *      wygenerowany efekt wygrywa.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject } from '../src/engine/game-state.js';
import {
  effectiveKeywords, effectivePower, effectiveToughness, grantKeywordsUntilEndOfTurn, turnFaceUp,
} from '../src/engine/permanents.js';
import { attachAuraToCreature, attachEquipmentToCreature } from '../src/engine/attachments.js';
import { addCounter } from '../src/engine/counters.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

const R = createCardRegistry();
const gra = () => createGameState({ seed: 6, players: [{ id: 'p1' }, { id: 'p2' }] });

function karta(state, id, cardId) {
  const def = R.get(cardId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: 'p1', ownerId: 'p1', zone: 'battlefield',
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
  });
  return state.objects.get(id);
}
const kw = (state, id) => effectiveKeywords(state.objects.get(id), state);
const pt = (state, id) => {
  const o = state.objects.get(id);
  return `${effectivePower(o, state)}/${effectiveToughness(o, state)}`;
};
const zakryj = (state, id) => state.objects.set(id, Object.freeze({ ...state.objects.get(id), faceDown: true }));

// ── W-4: warstwa 6 w kolejności znaczników (CR 613.9) ───────────────────────

test('W-4/1: Grounded, POTEM „gains flying” do końca tury → ma flying (późniejszy wygrywa)', () => {
  const state = gra();
  karta(state, 'c', 'voice-of-the-vermin');
  karta(state, 'a', 'grounded');
  attachAuraToCreature(state, 'a', 'c');
  assert.equal(kw(state, 'c').includes('flying'), false);
  grantKeywordsUntilEndOfTurn(state, 'c', ['flying']);
  assert.equal(kw(state, 'c').includes('flying'), true);
});

test('W-4/2: „gains flying”, POTEM Grounded → bez flying (utrata późniejsza)', () => {
  const state = gra();
  karta(state, 'c', 'voice-of-the-vermin');
  karta(state, 'a', 'grounded');
  grantKeywordsUntilEndOfTurn(state, 'c', ['flying']);
  attachAuraToCreature(state, 'a', 'c');
  assert.equal(kw(state, 'c').includes('flying'), false);
});

test('W-4/3: dosłowny przykład 613.9 — dwie aury: „has flying” po „loses flying” wygrywa i odwrotnie', () => {
  const po = gra();
  karta(po, 'c', 'voice-of-the-vermin');
  karta(po, 'g', 'grounded');
  karta(po, 's', 'shivs-embrace');
  attachAuraToCreature(po, 'g', 'c');
  attachAuraToCreature(po, 's', 'c');
  assert.equal(kw(po, 'c').includes('flying'), true, 'aura z flying przypięta PÓŹNIEJ');

  const przed = gra();
  karta(przed, 'c', 'voice-of-the-vermin');
  karta(przed, 'g', 'grounded');
  karta(przed, 's', 'shivs-embrace');
  attachAuraToCreature(przed, 's', 'c');
  attachAuraToCreature(przed, 'g', 'c');
  assert.equal(kw(przed, 'c').includes('flying'), false, 'Grounded przypięte PÓŹNIEJ');
});

test('W-4/4: licznik flying położony PO Grounded → flying (CR 613.7c: licznik ma znacznik)', () => {
  const state = gra();
  karta(state, 'c', 'voice-of-the-vermin');
  karta(state, 'a', 'grounded');
  attachAuraToCreature(state, 'a', 'c');
  addCounter(state, 'c', 'flying', 1);
  assert.equal(kw(state, 'c').includes('flying'), true);
});

test('W-4/5: przełożenie ekwipunku z flying na nowego nosiciela = nowy znacznik (613.7e), na tego samego = nic (701.3b)', () => {
  const state = gra();
  karta(state, 'c', 'voice-of-the-vermin');
  karta(state, 'd', 'voice-of-the-vermin');
  karta(state, 'g', 'grounded');
  karta(state, 'e', 'cloak-of-the-bat');
  attachEquipmentToCreature(state, 'e', 'd');
  attachAuraToCreature(state, 'g', 'c');
  const przedPrzelozeniem = state.objects.get('e').attachedTs;
  attachEquipmentToCreature(state, 'e', 'd');
  assert.equal(state.objects.get('e').attachedTs, przedPrzelozeniem, '701.3b: ten sam nosiciel — bez nowego znacznika');
  attachEquipmentToCreature(state, 'e', 'c');
  assert.ok(state.objects.get('e').attachedTs > state.objects.get('g').attachedTs);
  assert.equal(kw(state, 'c').includes('flying'), true, 'ekwipunek przypięty po Grounded wygrywa');
});

test('W-4/6: wydrukowany keyword nie jest „efektem” — każda utrata go zdejmuje (Grounded na latającym)', () => {
  const state = gra();
  const lotnik = R.get('delta-bloodflies');
  karta(state, 'c', lotnik.id);
  karta(state, 'a', 'grounded');
  attachAuraToCreature(state, 'a', 'c');
  assert.equal(kw(state, 'c').includes('flying'), false);
});

// ── W-3: zakryty stwór a efekty z zewnątrz (CR 708.2) ───────────────────────

test('W-3/1: zakryty stwór + „gains flying” → flying (efekt z zewnątrz działa)', () => {
  const state = gra();
  karta(state, 'm', 'voice-of-the-vermin');
  zakryj(state, 'm');
  grantKeywordsUntilEndOfTurn(state, 'm', ['flying']);
  assert.deepEqual(kw(state, 'm'), ['flying']);
});

test('W-3/2: zakryty stwór pod True Conviction i Anthem of Champions → double strike, lifelink, 3/3', () => {
  const state = gra();
  karta(state, 'm', 'voice-of-the-vermin');
  karta(state, 'tc', 'true-conviction');
  karta(state, 'an', 'anthem-of-champions');
  zakryj(state, 'm');
  assert.deepEqual([...kw(state, 'm')].sort(), ['double_strike', 'lifelink']);
  assert.equal(pt(state, 'm'), '3/3');
});

test('W-3/3: zakryty stwór nie ma WŁASNYCH keywordów, a zakryte źródło nie daje hymnu (708.2a)', () => {
  const state = gra();
  const lotnik = R.get('delta-bloodflies');
  karta(state, 'm', lotnik.id);
  karta(state, 'an', 'anthem-of-champions');
  zakryj(state, 'm');
  zakryj(state, 'an');
  assert.deepEqual(kw(state, 'm'), []);
  assert.equal(pt(state, 'm'), '2/2');
});

test('W-3/4: odkrycie daje nowy znacznik (613.7f), a obrót nie gubi nadania', () => {
  const state = gra();
  karta(state, 'm', 'voice-of-the-vermin');
  zakryj(state, 'm');
  const przed = state.objects.get('m').timestamp;
  grantKeywordsUntilEndOfTurn(state, 'm', ['flying']);
  turnFaceUp(state, 'm');
  assert.ok(state.objects.get('m').timestamp > przed);
  assert.equal(kw(state, 'm').includes('flying'), true, 'nadanie trwa po odkryciu (ten sam obiekt, CR 708.8)');
});
