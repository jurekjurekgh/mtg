/**
 * Pin D4b / warstwa 7 (CR 613.4) — plan 2026-09-24, audyt
 * docs/audits/AUDYT_PR134_2026-09-24.md §9 (W-1, W-2, W-5, W-6).
 *
 * CR 613.4 (CR 2026-09-25, dosłownie): „Within layer 7, apply effects in a
 * series of sublayers in the order described below. Within each sublayer,
 * apply effects in timestamp order.”
 *  - 613.4a „Layer 7a: Effects from characteristic-defining abilities that
 *    define power and/or toughness are applied.”
 *  - 613.4b „Layer 7b: Effects that set power and/or toughness to a specific
 *    number or value are applied. Effects that refer to the base power and/or
 *    toughness of a creature apply in this layer.”
 *  - 613.4c „Layer 7c: Effects and counters that modify power and/or
 *    toughness (but don’t set power and/or toughness to a specific number or
 *    value) are applied.”
 * CR 708.2: „Face-down spells and face-down permanents have no characteristics
 * other than those listed by the ability or rules that allowed the spell or
 * permanent to be face down. Any listed characteristics are the copiable
 * values of that object’s characteristics.”
 * CR 702.122a: „Crew N” means „Tap any number of other untapped creatures you
 * control with total power N or greater: This permanent becomes an artifact
 * creature until end of turn.”
 *
 * Stan przed naprawą (sonda na prawdziwych kartach):
 *  W-1 Tarmogoyf (Disa) 2/3 + Voice of the Vermin „base 4/4” → 6/7 (CDA była
 *      liczona jako pump 7c i dodawała się do bazy 7b); CR: 4/4.
 *  W-2 zakryty 2/2 + „base 4/4” → 2/2 (zakrycie wygrywało z 7b); CR: 4/4.
 *  W-5 „base 4/4”, potem animacja 8/8 → 4/4 (`tempBasePT` wygrywało zawsze,
 *      bez znaczników czasu); CR: późniejszy znacznik → 8/8.
 *  W-6 Skilled Animator (bazowe 5/5) na pojeździe, potem crew → 6/6 (crew
 *      niósł kopię wydrukowanego P/T jako ukryty efekt 7b); CR: 5/5.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject } from '../src/engine/game-state.js';
import { applyEffect } from '../src/engine/effects.js';
import {
  animatePermanentUntilEndOfTurn, clearStatModifiers, effectivePower, effectiveToughness, modifyStats,
} from '../src/engine/permanents.js';
import { addCounter } from '../src/engine/counters.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

const R = createCardRegistry();
const gra = () => createGameState({ seed: 5, players: [{ id: 'p1' }, { id: 'p2' }] });

function karta(state, id, cardId, zone = 'battlefield') {
  const def = R.get(cardId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: 'p1', ownerId: 'p1', zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
  });
  return state.objects.get(id);
}
const pt = (state, id) => {
  const o = state.objects.get(id);
  return `${effectivePower(o, state)}/${effectiveToughness(o, state)}`;
};
const baza44 = (state, id) => applyEffect(state,
  { type: 'set_base_pt_until_end_of_turn', power: 4, toughness: 4 }, state.objects.get('voice'), [id]);
const zakryj = (state, id) => state.objects.set(id, Object.freeze({ ...state.objects.get(id), faceDown: true }));

/** Tarmogoyf z dwoma typami kart w grobach (Enchantment, Creature) → 2/3. */
function goyf(state) {
  karta(state, 'voice', 'voice-of-the-vermin');
  karta(state, 'g', 'token_tarmogoyf');
  karta(state, 'gy1', 'grounded', 'graveyard');
  karta(state, 'gy2', 'voice-of-the-vermin', 'graveyard');
}

test('W-1/1: Tarmogoyf bez efektów — CDA działa (2 typy w grobach → 2/3)', () => {
  const state = gra();
  goyf(state);
  assert.equal(pt(state, 'g'), '2/3');
});

test('W-1/2: efekt 7b („base 4/4”) NADPISUJE CDA 7a — Tarmogoyf 4/4, nie 6/7', () => {
  const state = gra();
  goyf(state);
  baza44(state, 'g');
  assert.equal(pt(state, 'g'), '4/4');
  modifyStats(state, 'g', { power: 1, toughness: 1 });
  assert.equal(pt(state, 'g'), '5/5', '7c nadal dokłada się do bazy 7b');
  clearStatModifiers(state);
  assert.equal(pt(state, 'g'), '2/3', 'po cleanup CDA wraca');
});

test('W-1/3: deskryptor CDA jest daną karty (ADR 0002) — oba źródła tokenu Tarmogoyf', () => {
  const token = R.get('token_tarmogoyf').abilities.find((a) => a.type === 'static');
  assert.equal(token.characteristicDefining, true, 'definicja tokenu');
  const disa = R.get('disa-the-restless');
  const created = disa.abilities.flatMap((a) => (Array.isArray(a.effect) ? a.effect : [a.effect]))
    .find((e) => e?.type === 'create_token' && e.cardId === 'token_tarmogoyf');
  assert.equal(created.abilities[0].characteristicDefining, true, 'token tworzony przez Disę');
});

test('W-2/1: zakryty 2/2 + „base 4/4” → 4/4 (708.2: 2/2 to wartości kopiowalne, 7b działa)', () => {
  const state = gra();
  karta(state, 'voice', 'voice-of-the-vermin');
  karta(state, 'm', 'voice-of-the-vermin');
  zakryj(state, 'm');
  assert.equal(pt(state, 'm'), '2/2');
  baza44(state, 'm');
  assert.equal(pt(state, 'm'), '4/4');
  addCounter(state, 'm', '+1/+1', 1);
  assert.equal(pt(state, 'm'), '5/5', 'licznik (7c) na bazie 7b');
  clearStatModifiers(state);
  assert.equal(pt(state, 'm'), '3/3', 'po cleanup: 2/2 zakrycia + licznik');
});

test('W-5/1: dwa efekty 7b — wygrywa PÓŹNIEJSZY znacznik (base 4/4, potem animacja 8/8 → 8/8)', () => {
  const state = gra();
  karta(state, 'voice', 'voice-of-the-vermin');
  karta(state, 'c', 'voice-of-the-vermin');
  baza44(state, 'c');
  animatePermanentUntilEndOfTurn(state, 'c', { power: 8, toughness: 8, typesAdd: ['Creature'] });
  assert.equal(pt(state, 'c'), '8/8');
});

test('W-5/2: odwrotna kolejność — animacja 8/8, potem „base 4/4” → 4/4', () => {
  const state = gra();
  karta(state, 'voice', 'voice-of-the-vermin');
  karta(state, 'c', 'voice-of-the-vermin');
  animatePermanentUntilEndOfTurn(state, 'c', { power: 8, toughness: 8, typesAdd: ['Creature'] });
  baza44(state, 'c');
  assert.equal(pt(state, 'c'), '4/4');
});

test('W-5/3: Skilled Animator (5/5, trwały) → Voice (4/4 do końca tury) → cleanup: 5/5', () => {
  const state = gra();
  karta(state, 'voice', 'voice-of-the-vermin');
  karta(state, 'an', 'skilled-animator');
  karta(state, 'v', 'irontread-crusher');
  applyEffect(state, R.get('skilled-animator').abilities[0].effect[0], state.objects.get('an'), ['v']);
  assert.equal(pt(state, 'v'), '5/5');
  baza44(state, 'v');
  assert.equal(pt(state, 'v'), '4/4', 'późniejszy efekt 7b wygrywa');
  clearStatModifiers(state);
  assert.equal(pt(state, 'v'), '5/5', 'efekt „do końca tury” wygasł, trwała animacja zostaje');
});

test('W-6/1: crew nie ustawia P/T — pojazd bez innych efektów ma wydrukowane 6/6', () => {
  const state = gra();
  karta(state, 'v', 'irontread-crusher');
  const crew = R.get('irontread-crusher').abilities.find((a) => a.cost?.crewPower);
  assert.equal(crew.effect.power, undefined, 'deskryptor crew bez kopii P/T');
  applyEffect(state, crew.effect, state.objects.get('v'), []);
  const v = state.objects.get('v');
  assert.equal(v.kind, 'creature');
  assert.ok(v.types.includes('Artifact') && v.types.includes('Creature'));
  assert.equal(pt(state, 'v'), '6/6');
  clearStatModifiers(state);
  assert.notEqual(state.objects.get('v').kind, 'creature', 'po cleanup znów tylko artefakt');
});

test('W-6/2: Skilled Animator 5/5, potem crew → nadal 5/5 (crew nie jest efektem 7b)', () => {
  const state = gra();
  karta(state, 'an', 'skilled-animator');
  karta(state, 'v', 'irontread-crusher');
  applyEffect(state, R.get('skilled-animator').abilities[0].effect[0], state.objects.get('an'), ['v']);
  const crew = R.get('irontread-crusher').abilities.find((a) => a.cost?.crewPower);
  applyEffect(state, crew.effect, state.objects.get('v'), []);
  assert.equal(pt(state, 'v'), '5/5');
});

test('W-6/3: wszystkie pojazdy katalogu — crew bez P/T w deskryptorze, P/T na obiekcie', () => {
  const vehicles = R.all().filter((def) => (def.subtypes ?? []).includes('Vehicle')
    && (def.abilities ?? []).some((a) => a.cost?.crewPower != null));
  assert.ok(vehicles.length >= 4, `pojazdy z crew: ${vehicles.length}`);
  for (const def of vehicles) {
    const crew = def.abilities.find((a) => a.cost?.crewPower != null);
    const effects = Array.isArray(crew.effect) ? crew.effect : [crew.effect];
    for (const effect of effects) {
      assert.equal(effect.power ?? null, null, `${def.id}: crew niesie P/T`);
      assert.equal(effect.toughness ?? null, null, `${def.id}: crew niesie P/T`);
    }
    assert.equal(gameObjectDataOf(def).power, def.power, `${def.id}: wydrukowane P/T na obiekcie`);
  }
});
