// M210 — challenge „brązowa odznaka wyłapywacza błędów”.
// Trzy niezgodności z CR znalezione w istniejącym kodzie i naprawione u źródła:
//
//   #1 CR 202.2  — kolor obiektu wyznacza jego KOSZT MANY. Land kosztu nie ma,
//                  więc jest bezbarwny. Podstawowe landy miały `colors: ['R']`
//                  itd., co po animacji (Nissa, Awaken) robiło z nich kolorowe
//                  stwory: obchodziły „protection from red” i spełniały
//                  „can't be blocked except by [kolor]”.
//   #2 CR 708.2a — permanent zakryty (morph/cloak) jest bezimiennym stworem
//                  2/2 BEZ kolorów i BEZ podtypów. Silnik czytał `colors`
//                  i `subtypes` karty pod spodem.
//   #3 CR 303.4/704.5n — „Enchant artifact or creature YOU CONTROL”: warunek
//                  kontroli sprawdzała tylko walidacja rzucania, a NIE
//                  isLegalAuraHost, więc po przejęciu gospodarza aura zostawała
//                  na stole zamiast pójść do grobu (SBA).
//
// Każdy test był weryfikowany mutacyjnie (L61): cofnięcie naprawy w kodzie
// źródłowym czyni go czerwonym.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { declareBlockers } from '../src/engine/combat.js';
import {
  animatePermanentUntilEndOfTurn,
  effectiveColors,
  effectiveSubtypes,
} from '../src/engine/permanents.js';
import { attachAuraToCreature, isLegalAuraHost, removeIllegalAttachments } from '../src/engine/attachments.js';

const REGISTRY = createCardRegistry();

function creature(state, id, cardId, controllerId, extra = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, zone: 'battlefield',
    kind: 'creature', power: 2, toughness: 2, manaCost: 2,
    abilities: [], keywords: [], subtypes: [], types: ['Creature'], ...extra,
  });
  return state.objects.get(id);
}

/** Ustawia krok deklaracji blokujących (kolejność pól ma znaczenie). */
function combatAt(state, attackerId) {
  state.turn = { ...state.turn, phase: 'combat', step: 'declare_blockers', activePlayerId: 'p1' };
  state.combat = {
    attackingPlayerId: 'p1',
    attackers: [attackerId],
    blockers: new Map(),
    blockedAttackers: new Set(),
  };
}

// ---- #1: CR 202.2 — landy są bezbarwne -------------------------------------

test('M210/#1 (CR 202.2): podstawowe landy w rejestrze są BEZBARWNE', () => {
  for (const id of ['basic-plains', 'basic-island', 'basic-swamp', 'basic-mountain', 'basic-forest']) {
    assert.deepEqual(REGISTRY.get(id).colors, [], `${id} nie ma kosztu many, więc jest bezbarwny`);
  }
});

test('M210/#1 (CR 202.2): ANIMOWANY Swamp nie może blokować Dread Warlocka', () => {
  const state = createGameState({ seed: 210, players: [{ id: 'p1' }, { id: 'p2' }] });
  // Dread Warlock: „can't be blocked except by black creatures”.
  creature(state, 'warlock', 'dread-warlock', 'p1', {
    colors: ['B'],
    abilities: [{ type: 'static', cantBeBlockedExceptByColors: ['B'] }],
  });
  addObject(state, {
    id: 'swamp', instanceId: 'i-swamp', cardId: 'basic-swamp', controllerId: 'p2',
    zone: 'battlefield', kind: 'land', abilities: [], keywords: [], subtypes: ['Swamp'], types: ['Land'],
  });
  // Animacja lądu (Awaken/Nissa) — nadal jest lądem, więc nadal bezbarwny.
  animatePermanentUntilEndOfTurn(state, 'swamp', {
    power: 3, toughness: 3, typesAdd: ['Creature'], retainTypes: true,
  });
  assert.deepEqual(effectiveColors(state.objects.get('swamp')), [], 'animowany land pozostaje bezbarwny');

  combatAt(state, 'warlock');
  assert.throws(
    () => declareBlockers(state, 'p2', { warlock: ['swamp'] }),
    /może blokować tylko stwór tego koloru/,
    'bezbarwny land NIE może blokować „except by black”',
  );
});

// ---- #2: CR 708.2a — zakryty permanent jest bezbarwny i bez podtypów -------

test('M210/#2 (CR 708.2a): ZAKRYTY stwór jest bezbarwny — nie może blokować Dread Warlocka', () => {
  const state = createGameState({ seed: 210, players: [{ id: 'p1' }, { id: 'p2' }] });
  creature(state, 'warlock', 'dread-warlock', 'p1', {
    colors: ['B'],
    abilities: [{ type: 'static', cantBeBlockedExceptByColors: ['B'] }],
  });
  creature(state, 'morph', 'segmented-krotiq', 'p2', { colors: ['B'], subtypes: ['Insect'] });
  // Zakrycie: pola spoza kontraktu addObject ustawiamy wprost na obiekcie.
  state.objects.set('morph', Object.freeze({ ...state.objects.get('morph'), faceDown: true }));

  const morph = state.objects.get('morph');
  assert.deepEqual(effectiveColors(morph), [], 'zakryty permanent nie ma kolorów');
  assert.deepEqual(effectiveSubtypes(morph), [], 'zakryty permanent nie ma podtypów');

  combatAt(state, 'warlock');
  assert.throws(
    () => declareBlockers(state, 'p2', { warlock: ['morph'] }),
    /może blokować tylko stwór tego koloru/,
    'zakryty (bezbarwny) stwór NIE może blokować „except by black”',
  );
});

test('M210/#2 (CR 708.2a): ODKRYTY czarny stwór blokuje Dread Warlocka normalnie', () => {
  // Kontrola przeciwna: naprawa nie może zabraniać blokad legalnych.
  const state = createGameState({ seed: 210, players: [{ id: 'p1' }, { id: 'p2' }] });
  creature(state, 'warlock', 'dread-warlock', 'p1', {
    colors: ['B'],
    abilities: [{ type: 'static', cantBeBlockedExceptByColors: ['B'] }],
  });
  creature(state, 'blk', 'segmented-krotiq', 'p2', { colors: ['B'] });

  combatAt(state, 'warlock');
  const e = declareBlockers(state, 'p2', { warlock: ['blk'] });
  assert.equal(e.type, 'blockers_declared', 'czarny odkryty stwór blokuje bez przeszkód');
  assert.deepEqual(state.combat.blockers.get('warlock'), ['blk'], 'blok zapisany');
});

// ---- #3: CR 303.4 / 704.5n — „enchant … you control” -----------------------

test('M210/#3 (CR 303.4): „enchant artifact or creature you control” odrzuca CUDZEGO gospodarza', () => {
  const state = createGameState({ seed: 210, players: [{ id: 'p1' }, { id: 'p2' }] });
  const mine = creature(state, 'mine', 'highland-game', 'p1');
  const theirs = creature(state, 'theirs', 'highland-game', 'p2');
  addObject(state, {
    id: 'aura', instanceId: 'i-aura', cardId: 'moonlit-meditation', controllerId: 'p1',
    zone: 'battlefield', kind: 'enchantment', manaCost: 3,
    abilities: [], keywords: [], subtypes: ['Aura'], types: ['Enchantment'],
    aura: { enchantType: 'artifact_or_creature' },
  });
  const aura = state.objects.get('aura');
  const descriptor = REGISTRY.get('moonlit-meditation').aura;

  assert.equal(isLegalAuraHost(aura, mine, descriptor), true, 'własny stwór jest legalny');
  assert.equal(isLegalAuraHost(aura, theirs, descriptor), false, 'cudzy stwór NIE jest legalny („you control”)');
});

test('M210/#3 (CR 704.5n): po przejęciu gospodarza aura „you control” idzie do GROBU', () => {
  const state = createGameState({ seed: 210, players: [{ id: 'p1' }, { id: 'p2' }] });
  creature(state, 'host', 'highland-game', 'p1');
  addObject(state, {
    id: 'aura', instanceId: 'i-aura', cardId: 'moonlit-meditation', controllerId: 'p1',
    zone: 'battlefield', kind: 'enchantment', manaCost: 3,
    abilities: [], keywords: [], subtypes: ['Aura'], types: ['Enchantment'],
    aura: { enchantType: 'artifact_or_creature' },
  });
  attachAuraToCreature(state, 'aura', 'host');
  assert.equal(state.objects.get('aura').attachedTo, 'host', 'aura przypięta do własnego stwora');

  // Przeciwnik przejmuje kontrolę nad gospodarzem (Mind Control itp.).
  state.objects.set('host', Object.freeze({ ...state.objects.get('host'), controllerId: 'p2' }));
  const events = removeIllegalAttachments(state);

  assert.ok(
    events.some((e) => e.type === 'permanent_put_into_graveyard'),
    'SBA zrzuca aurę bez legalnego gospodarza',
  );
  const inGraveyard = state.zones.graveyard
    .some((id) => state.objects.get(id)?.cardId === 'moonlit-meditation');
  assert.equal(inGraveyard, true, 'aura leży w grobie, nie na stole');
});

test('M210/#3: aura BEZ „you control” (Clawing Torment) zostaje na cudzym stworze', () => {
  // Kontrola przeciwna: ownControlOnly:false musi dalej pozwalać na obcy cel.
  const state = createGameState({ seed: 210, players: [{ id: 'p1' }, { id: 'p2' }] });
  const theirs = creature(state, 'theirs', 'highland-game', 'p2');
  addObject(state, {
    id: 'torment', instanceId: 'i-torment', cardId: 'clawing-torment', controllerId: 'p1',
    zone: 'battlefield', kind: 'enchantment', manaCost: 2,
    abilities: [], keywords: [], subtypes: ['Aura'], types: ['Enchantment'],
    aura: { enchantType: 'creature' },
  });
  const descriptor = REGISTRY.get('clawing-torment').aura;
  assert.equal(descriptor.ownControlOnly, false, 'Oracle nie mówi „you control”');
  assert.equal(
    isLegalAuraHost(state.objects.get('torment'), theirs, descriptor), true,
    'aura bez „you control” może siedzieć na cudzym stworze',
  );
});
