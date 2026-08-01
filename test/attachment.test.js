import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState } from '../src/engine/game-state.js';
import { moveObjectDirectly } from '../src/engine/objects.js';
import {
  aurasAttachedTo,
  attachAuraToCreature,
  detachAurasFromHost,
  detachIllegallyAttachedAuras,
  isAttachedAura,
} from '../src/engine/attachments.js';

/* API załączników aur bestow (CR 301.5 / 702.103) — scenariusze niskopoziomowe;
 * pełna ścieżka przez komendy jest w test/real-cards-batch3.test.js. */

const BESTOW = Object.freeze({ cost: 4, pump: Object.freeze({ power: 2, toughness: 2 }), keywords: Object.freeze(['reach']) });

function gameWithHostAndAura() {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  addObject(state, {
    id: 'host', instanceId: 'i-host', cardId: 'syn-razorback', controllerId: 'p1', zone: 'battlefield',
    kind: 'creature', power: 2, toughness: 2, manaCost: 1, abilities: [], keywords: [], subtypes: [], types: ['Creature'],
  });
  addObject(state, {
    id: 'aura', instanceId: 'i-aura', cardId: 'leafcrown-dryad', controllerId: 'p1', zone: 'battlefield',
    kind: 'creature', power: 2, toughness: 2, manaCost: 2, abilities: [], keywords: ['reach'],
    subtypes: ['Nymph', 'Dryad'], types: ['Enchantment', 'Creature'], bestow: BESTOW,
  });
  return state;
}

test('attachAuraToCreature: aura przestaje być stworem i wskazuje gospodarza', () => {
  const state = gameWithHostAndAura();
  const attached = attachAuraToCreature(state, 'aura', 'host');
  assert.equal(attached.kind, 'aura');
  assert.equal(attached.attachedTo, 'host');
  assert.equal(attached.baseKind, 'creature');
  assert.equal(isAttachedAura(state.objects.get('aura')), true);
  assert.deepEqual(aurasAttachedTo(state, 'host').map((a) => a.id), ['aura']);
  assert.ok(state.events.some((e) => e.type === 'object_attached' && e.hostId === 'host'));
});

test('attachAuraToCreature: odrzuca nie-stwora, nie-aurę bestow i zaczarowanie siebie', () => {
  const state = gameWithHostAndAura();
  addObject(state, {
    id: 'plains', instanceId: 'i-plains', cardId: 'syn-forest', controllerId: 'p1', zone: 'battlefield',
    kind: 'land', abilities: [], keywords: [], subtypes: [], types: ['Land'],
  });
  assert.throws(() => attachAuraToCreature(state, 'aura', 'plains'), /stwora na bitwisku/);
  assert.throws(() => attachAuraToCreature(state, 'host', 'host'), /aurę bestow/);
  assert.throws(() => attachAuraToCreature(state, 'aura', 'aura'), /samej siebie/);
});

test('detachAurasFromHost: aura odłącza się i znów jest stworem (zdarzenia jawne)', () => {
  const state = gameWithHostAndAura();
  attachAuraToCreature(state, 'aura', 'host');
  const events = detachAurasFromHost(state, 'host');
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'object_detached');
  const aura = state.objects.get('aura');
  assert.equal(aura.kind, 'creature');
  assert.equal(aura.attachedTo, null);
  assert.equal(aura.baseKind, null);
  assert.equal(isAttachedAura(aura), false);
});

test('detachIllegallyAttachedAuras (SBA): odłącza tylko aury z nielegalnym gospodarzem', () => {
  const state = gameWithHostAndAura();
  attachAuraToCreature(state, 'aura', 'host');
  // Gospodarz poprawny — SBA niczego nie rusza.
  assert.deepEqual(detachIllegallyAttachedAuras(state), []);
  assert.equal(isAttachedAura(state.objects.get('aura')), true);
});

test('zmiana strefy gospodarza samodzielnie odłącza aury (inwariant attachedTo)', () => {
  const state = gameWithHostAndAura();
  attachAuraToCreature(state, 'aura', 'host');
  // Gospodarz odchodzi z bitwiska (jak przy śmierci/wygnaniu) — aura odłącza
  // się w chwili ruchu i zostaje na bitwisku jako stwór (CR 702.103b).
  moveObjectDirectly(state, 'host', 'graveyard', 'grave-x');
  const aura = state.objects.get('aura');
  assert.equal(aura.zone, 'battlefield');
  assert.equal(aura.kind, 'creature');
  assert.equal(aura.attachedTo, null);
  assert.ok(state.events.some((e) => e.type === 'object_detached' && e.objectId === 'aura'));
});

test('aura odchodząca z bitwiska wraca do bycia stworem (baseKind)', () => {
  const state = gameWithHostAndAura();
  attachAuraToCreature(state, 'aura', 'host');
  // Sama aura trafia do grobu (np. wygnana jako enchantment) — obiekt
  // w grobie jest z powrotem obiektem-stworem, jak na swojej karcie.
  moveObjectDirectly(state, 'aura', 'graveyard', 'grave-a');
  const inGrave = state.objects.get('grave-a');
  assert.equal(inGrave.kind, 'creature');
  assert.equal(inGrave.attachedTo, null);
  assert.equal(inGrave.baseKind, null);
});
