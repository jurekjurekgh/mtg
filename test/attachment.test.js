import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState } from '../src/engine/game-state.js';
import { moveObjectDirectly } from '../src/engine/objects.js';
import {
  attachmentGrant,
  attachmentsAttachedTo,
  aurasAttachedTo,
  attachAuraToCreature,
  attachEquipmentToCreature,
  detachAttachmentsFromHost,
  removeIllegalAttachments,
  isAttachedAura,
  isAttachedEquipment,
} from '../src/engine/attachments.js';

/* API załączników (CR 301.5 / 303.4 / 702.6 / 702.103) — scenariusze
 * niskopoziomowe; pełna ścieżka przez komendy jest w test/real-cards-batch3.test.js
 * (bestow) i test/real-cards-batch4.test.js (czysta aura, equipment). */

const BESTOW = Object.freeze({ cost: 4, pump: Object.freeze({ power: 2, toughness: 2 }), keywords: Object.freeze(['reach']) });
const PURE_AURA = Object.freeze({ pump: Object.freeze({ power: 2, toughness: 2 }), keywords: Object.freeze(['flying', 'vigilance']) });
const EQUIPMENT = Object.freeze({ equip: 2, pump: null, keywords: Object.freeze(['flying', 'haste']) });

function gameWithHostAndAura() {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  addObject(state, {
    id: 'host', instanceId: 'i-host', cardId: 'highland-game', controllerId: 'p1', zone: 'battlefield',
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
  assert.ok(state.events.some((e) => e.type === 'object_attached' && e.hostId === 'host' && e.via === 'bestow'));
});

test('attachAuraToCreature: odrzuca nie-stwora, brak deskryptora aury i zaczarowanie siebie', () => {
  const state = gameWithHostAndAura();
  addObject(state, {
    id: 'plains', instanceId: 'i-plains', cardId: 'basic-forest', controllerId: 'p1', zone: 'battlefield',
    kind: 'land', abilities: [], keywords: [], subtypes: [], types: ['Land'],
  });
  assert.throws(() => attachAuraToCreature(state, 'aura', 'plains'), /nie ma legalnego gospodarza/);
  assert.throws(() => attachAuraToCreature(state, 'host', 'host'), /aurę na polu bitwy/);
  assert.throws(() => attachAuraToCreature(state, 'aura', 'aura'), /samej siebie/);
});

// Batch 23 (Feedback): „Enchant enchantment" — gospodarzem może być
// enchantment (także enchantment creature); SBA nie niszczy takiej aury.
const ENCHANT_ENCHANTMENT = Object.freeze({ enchant: 'enchantment' });

test('attachAuraToCreature: aura „Enchant enchantment" zaczarowuje enchantment', () => {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  addObject(state, {
    id: 'ench', instanceId: 'i-ench', cardId: 'x-ench', controllerId: 'p2', zone: 'battlefield',
    kind: 'enchantment', power: null, toughness: null, manaCost: 2, abilities: [], keywords: [], subtypes: [], types: ['Enchantment'],
  });
  addObject(state, {
    id: 'fb-aura', instanceId: 'i-fb', cardId: 'feedback', controllerId: 'p1', zone: 'battlefield',
    kind: 'enchantment', power: null, toughness: null, manaCost: 3, abilities: [], keywords: [],
    subtypes: ['Aura'], types: ['Enchantment'], aura: ENCHANT_ENCHANTMENT,
  });
  const attached = attachAuraToCreature(state, 'fb-aura', 'ench');
  assert.equal(attached.kind, 'aura');
  assert.equal(attached.attachedTo, 'ench');
  // SBA: gospodarz legalny — aura zostaje.
  assert.deepEqual(removeIllegalAttachments(state), []);
  // Stwór NIE jest legalnym gospodarzem dla „Enchant enchantment".
  addObject(state, {
    id: 'cre', instanceId: 'i-cre', cardId: 'x-cre', controllerId: 'p2', zone: 'battlefield',
    kind: 'creature', power: 2, toughness: 2, manaCost: 2, abilities: [], keywords: [], subtypes: [], types: ['Creature'],
  });
  addObject(state, {
    id: 'fb-aura2', instanceId: 'i-fb2', cardId: 'feedback', controllerId: 'p1', zone: 'battlefield',
    kind: 'enchantment', power: null, toughness: null, manaCost: 3, abilities: [], keywords: [],
    subtypes: ['Aura'], types: ['Enchantment'], aura: ENCHANT_ENCHANTMENT,
  });
  assert.throws(() => attachAuraToCreature(state, 'fb-aura2', 'cre'), /nie ma legalnego gospodarza/);
});

test('detachAttachmentsFromHost: aura bestow odłącza się i znów jest stworem (zdarzenia jawne)', () => {
  const state = gameWithHostAndAura();
  attachAuraToCreature(state, 'aura', 'host');
  const events = detachAttachmentsFromHost(state, 'host');
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'object_detached');
  const aura = state.objects.get('aura');
  assert.equal(aura.kind, 'creature');
  assert.equal(aura.attachedTo, null);
  assert.equal(aura.baseKind, null);
  assert.equal(isAttachedAura(aura), false);
});

test('removeIllegalAttachments (SBA): odłącza tylko załączniki z nielegalnym gospodarzem', () => {
  const state = gameWithHostAndAura();
  attachAuraToCreature(state, 'aura', 'host');
  // Gospodarz poprawny — SBA niczego nie rusza.
  assert.deepEqual(removeIllegalAttachments(state), []);
  assert.equal(isAttachedAura(state.objects.get('aura')), true);
});

test('zmiana strefy gospodarza samodzielnie rozłącza załączniki (inwariant attachedTo)', () => {
  const state = gameWithHostAndAura();
  attachAuraToCreature(state, 'aura', 'host');
  // Gospodarz odchodzi z pola bitwy (jak przy śmierci/wygnaniu) — aura odłącza
  // się w chwili ruchu i zostaje na polu bitwy jako stwór (CR 702.103b).
  moveObjectDirectly(state, 'host', 'graveyard', 'grave-x');
  const aura = state.objects.get('aura');
  assert.equal(aura.zone, 'battlefield');
  assert.equal(aura.kind, 'creature');
  assert.equal(aura.attachedTo, null);
  assert.ok(state.events.some((e) => e.type === 'object_detached' && e.objectId === 'aura'));
});

test('aura odchodząca z pola bitwy wraca do bycia stworem (baseKind)', () => {
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

// --- Czysta aura (CR 303.4 / 704.5m) --------------------------------------

test('czysta aura: załączenie jak bestow, ale utrata gospodarza = grób (CR 704.5m)', () => {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  addObject(state, {
    id: 'host', instanceId: 'i-host', cardId: 'highland-game', controllerId: 'p1', zone: 'battlefield',
    kind: 'creature', power: 2, toughness: 2, manaCost: 1, abilities: [], keywords: [], subtypes: [], types: ['Creature'],
  });
  addObject(state, {
    id: 'embrace', instanceId: 'i-embrace', cardId: 'serras-embrace', controllerId: 'p1', zone: 'battlefield',
    kind: 'enchantment', manaCost: 4, abilities: [], keywords: [], subtypes: ['Aura'], types: ['Enchantment'], aura: PURE_AURA,
  });
  const attached = attachAuraToCreature(state, 'embrace', 'host');
  assert.equal(attached.kind, 'aura');
  assert.equal(attached.baseKind, 'enchantment');
  assert.equal(isAttachedAura(state.objects.get('embrace')), true);
  // Buff z deskryptora aura (to samo źródło co bestow/equipment).
  assert.deepEqual(attachmentGrant(state.objects.get('embrace')), { power: 2, toughness: 2, keywords: ['flying', 'vigilance'], subtypes: [] });
  const events = detachAttachmentsFromHost(state, 'host');
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'permanent_put_into_graveyard');
  assert.equal(events[0].reason, 'aura_without_legal_host');
  const inGrave = state.objects.get(events[0].toId);
  assert.equal(inGrave.zone, 'graveyard');
  assert.equal(inGrave.kind, 'enchantment');
  assert.equal(inGrave.attachedTo, null);
});

// --- Equipment (CR 702.6 / 704.5n) ----------------------------------------

function gameWithHostAndEquipment() {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  addObject(state, {
    id: 'host', instanceId: 'i-host', cardId: 'highland-game', controllerId: 'p1', zone: 'battlefield',
    kind: 'creature', power: 2, toughness: 2, manaCost: 1, abilities: [], keywords: [], subtypes: [], types: ['Creature'],
  });
  addObject(state, {
    id: 'cloak', instanceId: 'i-cloak', cardId: 'cloak-of-the-bat', controllerId: 'p1', zone: 'battlefield',
    kind: 'artifact', manaCost: 2, abilities: [], keywords: [], subtypes: ['Equipment'], types: ['Artifact'], equipment: EQUIPMENT,
  });
  return state;
}

test('attachEquipmentToCreature: equipment pozostaje artefaktem i trzyma gospodarza', () => {
  const state = gameWithHostAndEquipment();
  const attached = attachEquipmentToCreature(state, 'cloak', 'host');
  assert.equal(attached.kind, 'artifact');
  assert.equal(attached.attachedTo, 'host');
  assert.equal(isAttachedEquipment(state.objects.get('cloak')), true);
  assert.deepEqual(attachmentsAttachedTo(state, 'host').map((a) => a.id), ['cloak']);
  assert.deepEqual(aurasAttachedTo(state, 'host'), []);
  assert.ok(state.events.some((e) => e.type === 'object_attached' && e.via === 'equip'));
});

test('equipment: re-equip przepina na nowego gospodarza, a utrata gospodarza zostawia go na polu bitwy (CR 704.5n)', () => {
  const state = gameWithHostAndEquipment();
  attachEquipmentToCreature(state, 'cloak', 'host');
  addObject(state, {
    id: 'second', instanceId: 'i-second', cardId: 'goblin-piker', controllerId: 'p1', zone: 'battlefield',
    kind: 'creature', power: 3, toughness: 2, manaCost: 2, abilities: [], keywords: [], subtypes: [], types: ['Creature'],
  });
  // Re-equip: equipment przechodzi na innego stwora, stary gospodarz czysty.
  const moved = attachEquipmentToCreature(state, 'cloak', 'second');
  assert.equal(moved.attachedTo, 'second');
  assert.deepEqual(attachmentsAttachedTo(state, 'host'), []);
  assert.deepEqual(attachmentsAttachedTo(state, 'second').map((a) => a.id), ['cloak']);
  // Śmierć gospodarza: equipment odłącza się i ZOSTAJE na polu bitwy.
  const events = detachAttachmentsFromHost(state, 'second');
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'object_detached');
  const cloak = state.objects.get('cloak');
  assert.equal(cloak.zone, 'battlefield');
  assert.equal(cloak.kind, 'artifact');
  assert.equal(cloak.attachedTo, null);
  assert.equal(isAttachedEquipment(cloak), false);
});

test('SBA: equipment na nielegalnym gospodarzu odłącza się i zostaje; czysta aura idzie do grobu', () => {
  const state = gameWithHostAndEquipment();
  attachEquipmentToCreature(state, 'cloak', 'host');
  addObject(state, {
    id: 'embrace', instanceId: 'i-embrace', cardId: 'serras-embrace', controllerId: 'p1', zone: 'battlefield',
    kind: 'enchantment', manaCost: 4, abilities: [], keywords: [], subtypes: ['Aura'], types: ['Enchantment'], aura: PURE_AURA,
  });
  attachAuraToCreature(state, 'embrace', 'host');
  // Gospodarz przestaje być stworem na polu bitwy (symulacja: ręczna zmiana kind).
  state.objects.set('host', Object.freeze({ ...state.objects.get('host'), kind: 'land' }));
  const events = removeIllegalAttachments(state);
  const graves = events.filter((e) => e.type === 'permanent_put_into_graveyard');
  const detached = events.filter((e) => e.type === 'object_detached');
  assert.equal(graves.length, 1); // czysta aura
  assert.equal(detached.length, 1); // equipment
  const cloak = state.objects.get('cloak');
  assert.equal(cloak.zone, 'battlefield');
  assert.equal(cloak.attachedTo, null);
});
