import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { applyEffect } from '../src/engine/effects.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { MANA_COSTS } from '../src/cards/mana-costs-data.js';
import { paymentDescriptorOf, shouldOpenManaWizard, WIZARD_PAYMENT_COMMAND_TYPES } from '../src/table/mana-wizard.js';

/**
 * M327 (audyt PR #102, F7): kreator many dla ODSŁONIĘCIA zakrycia.
 *
 * Reguła właściciela (M168/C2, M195/A) jest ogólna: „zawsze kiedy płatność
 * many jest niejednoznaczna (więcej niż 1 kombinacja rodzajów źródeł) powinien
 * być wizard\". `paymentDescriptorOf` znał rzuty, aktywacje i decyzje
 * płatnicze — a `turn_cloak_face_up` / `turn_manifest_face_up` są w silniku
 * JEDYNYMI nie-rzutowymi `spendMana` z pipami koloru (CR 701.56b: obrot
 * cloaka płaci koszt many KARTY; 701.55c: manifest tak samo). Zmierzone przed
 * naprawą: deskryptor dla obu typów to `null` → kreator się nie otwierał i o
 * tym, które źródła tapują, decydowała kolejność w `spendMana`.
 *
 * Pułapka przy naprawie: zakryty permanent ma w widoku `manaCost: 0` (tyle ma
 * twarz w dół), a koszt obrotu nosi pole `cloakTurnUpCost`/
 * `manifestTurnUpCost`, którego widok NIE niesie. Dlatego main.js podaje je
 * kreatorowi z pełnego stanu (wzorzec `opts.escapeCost`), a rozbieżność z
 * kosztem karty ZAMYKA kreator — przy błędnej liczbie gracz dostałby
 * odrzuconą komendę, co jest gorsze niż dzisiejszy auto-tap.
 */

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId, zone = 'battlefield', extra = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, morph: def.morph ?? null, ...extra,
  });
  return state.objects.get(id);
}

function cloakView(cardId = 'goblin-piker') {
  const state = createGameState({ seed: 327, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  put(state, 'va', 'veiled-ascension', 'p1');
  put(state, 'lib-0', cardId, 'p1', 'library');
  state.zones.library = ['lib-0'];
  applyEffect(state, { type: 'cloak' }, state.objects.get('va'), []);
  const cloak = state.zones.battlefield.map((id) => state.objects.get(id)).find((o) => o.faceDown);
  return { state, view: playerView(state, 'p1'), cloak };
}

// ---- A: cloak z prawdziwego silnika ----------------------------------------

test('M327/A: odsłonięcie cloaka ma deskryptor płatności z pipami koloru karty', () => {
  const { view, cloak } = cloakView();
  const cmd = view.legalCommands.find((c) => c.type === 'turn_cloak_face_up')
    ?? { type: 'turn_cloak_face_up', playerId: 'p1', objectId: cloak.id };
  const descriptor = paymentDescriptorOf(cmd, view, { turnUpCost: cloak.cloakTurnUpCost });
  assert.ok(descriptor, 'deskryptor istnieje (RED przed M327: null → brak kreatora)');
  assert.equal(descriptor.totalNeeded, MANA_COSTS['goblin-piker'] ? 2 : 0, 'suma = koszt karty {1}{R}');
  assert.deepEqual(descriptor.requirements, [['R']], 'pipy koloru z karty bazowej (nie z zakrycia, które ich nie ma)');
  assert.match(descriptor.costStr, /^Cloak \(2\)$/, `etykieta kroku: ${descriptor.costStr}`);
  assert.equal(descriptor.effectiveGeneric, 1, 'generic = suma − pipy');
  assert.equal(descriptor.objectId, cloak.id, 'płatność przypisana do tego permanentu');
});

test('M327/A2: deskryptor realnie otwiera kreator, gdy źródła dają wybór', () => {
  const { view, cloak } = cloakView();
  const descriptor = paymentDescriptorOf({ type: 'turn_cloak_face_up', objectId: cloak.id }, view, { turnUpCost: 2 });
  assert.ok(descriptor, 'jest deskryptor');
  const sources = [
    { id: 'm1', colors: ['R'], amount: 1 },
    { id: 'm2', colors: ['R'], amount: 1 },
    { id: 'sg', colors: ['R', 'G'], amount: 1 },
  ];
  assert.equal(shouldOpenManaWizard({
    sources, poolMana: 0, totalNeeded: descriptor.totalNeeded, requirements: descriptor.requirements,
  }), true, 'dwa kształty płatności → kreator');
  assert.equal(shouldOpenManaWizard({
    sources: [sources[0], sources[1]], poolMana: 0, totalNeeded: descriptor.totalNeeded, requirements: descriptor.requirements,
  }), false, 'dwie identyczne Góry = JEDEN kształt płatności (deduplikacja profili M202/O)');
  assert.equal(shouldOpenManaWizard({
    sources: [sources[0]], poolMana: 0, totalNeeded: descriptor.totalNeeded, requirements: descriptor.requirements,
  }), false, 'jedno źródło → kreator zbędny (M202/O)');
});

// ---- B: manifest ------------------------------------------------------------

test('M327/B: manifest ma własny deskryptor (ten sam koszt karty, inna etykieta)', () => {
  const object = {
    id: 'mf1', cardId: 'goblin-piker', faceDown: true, controllerId: 'p1', zone: 'battlefield',
    manifestTurnUpCost: 2,
  };
  const view = { playerId: 'p1', zones: { battlefield: [object], hand: [], stack: [], graveyard: [], library: [], exile: [] } };
  const descriptor = paymentDescriptorOf({ type: 'turn_manifest_face_up', objectId: 'mf1' }, view, { turnUpCost: 2 });
  assert.ok(descriptor, 'deskryptor manifestu');
  assert.match(descriptor.costStr, /^Manifest \(2\)$/, `etykieta: ${descriptor.costStr}`);
  assert.deepEqual(descriptor.requirements, [['R']]);
});

// ---- C: kiedy kreator NIE ma się otwierać ----------------------------------

test('M327/C: rozbieżność kosztu, brak kosztu karty i {X} zamykają kreator', () => {
  const { view, cloak } = cloakView();
  const cmd = { type: 'turn_cloak_face_up', objectId: cloak.id };
  assert.equal(paymentDescriptorOf(cmd, view, { turnUpCost: 3 }), null,
    'silnik płaci inną liczbę niż koszt karty → auto-tap, nie odrzucona komenda');
  assert.deepEqual(paymentDescriptorOf(cmd, view, {}), paymentDescriptorOf(cmd, view, { turnUpCost: cloak.cloakTurnUpCost }),
    'bez opts.turnUpCost deskryptor liczy z kosztu karty (to ta sama liczba)');
  const noCost = {
    id: 'x1', cardId: 'brak-takiej-karty', faceDown: true, controllerId: 'p1', zone: 'battlefield', cloakTurnUpCost: 2,
  };
  const view2 = { playerId: 'p1', zones: { battlefield: [noCost], hand: [], stack: [], graveyard: [], library: [], exile: [] } };
  assert.equal(paymentDescriptorOf({ type: 'turn_cloak_face_up', objectId: 'x1' }, view2, { turnUpCost: 2 }), null,
    'koszt nieznany (token poza MANA_COSTS) → nie zgadujemy');
  // {X} w koszcie karty: kreator nie zna wartości X, a liczba z pola
  // `cloakTurnUpCost` to koszt BEZ X — przy takim koszcie lepiej auto-tap
  // niż płatność w innej wysokości niż policzył silnik.
  const variable = { id: 'fb1', cardId: 'fireball', faceDown: true, controllerId: 'p1', zone: 'battlefield' };
  const view3 = { playerId: 'p1', zones: { battlefield: [variable], hand: [], stack: [], graveyard: [], library: [], exile: [] } };
  assert.equal(paymentDescriptorOf({ type: 'turn_cloak_face_up', objectId: 'fb1' }, view3, { turnUpCost: 5 }), null,
    'koszt zmienny poza kreatorem');
  assert.equal(paymentDescriptorOf({ type: 'turn_cloak_face_up', objectId: 'nope' }, view, { turnUpCost: 2 }), null,
    'obiekt spoza widoku');
});

// ---- D: rodzina (L102) ------------------------------------------------------

test('M327/D: każdy handler silnika płacący pipy koloru jest znany kreatorowi', () => {
  const source = readFileSync(new URL('../src/engine/game-state.js', import.meta.url), 'utf8');
  const re = /if \(cmd\.type === '([a-z_]+)'\)/g;
  const braki = [];
  let match;
  while ((match = re.exec(source)) !== null) {
    const rest = source.slice(match.index + 1);
    const nextOffset = rest.search(/if \(cmd\.type === '/);
    const body = rest.slice(0, nextOffset < 0 ? rest.length : nextOffset);
    if (!/spendMana\([\s\S]{0,160}?coloredPipsOf\(/.test(body)) continue;
    if (!WIZARD_PAYMENT_COMMAND_TYPES.has(match[1])) braki.push(match[1]);
  }
  assert.deepEqual(braki, [],
    `nowa decyzja płatnicza bez kreatora many (reguła M168/M195): ${braki.join(', ')}`);
  assert.ok(WIZARD_PAYMENT_COMMAND_TYPES.has('turn_cloak_face_up')
    && WIZARD_PAYMENT_COMMAND_TYPES.has('turn_manifest_face_up'), 'oba typy w rodzinie');
});
