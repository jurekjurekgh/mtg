// M259 — łowy na brązową odznakę (wyzwanie właściciela 2026-08-30).
//
// Siedem błędów vs zasady MtG znalezionych w ISTNIEJĄCYCH kartach
// (metoda: masowe porównanie REAL_CARDS ze snapshotami Scryfall + czytanie
// semantyczne deskryptorów + weryfikacja żywym API). Każdy test najpierw
// RED (na kodzie sprzed naprawy), potem GREEN.
// Szczegóły: docs/plans/PLAN_2026-08-30-m259-brazowa-odznaka-lowy.md
//            docs/audits/AUDYT_M259_BUG_HUNT_2026-08-30.md
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createCardDeck } from '../src/cards/materialize.js';
import { addMana } from '../src/engine/resources.js';
import { processTriggers } from '../src/engine/triggers.js';

const REGISTRY = createCardRegistry();

function newState({ step = 'main', activePlayerId = 'p1' } = {}) {
  const state = createGameState({ seed: 259, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, activePlayerId);
  state.turn.activePlayerId = activePlayerId;
  state.turn.priorityPlayerId = activePlayerId;
  state.turn.number = 7;
  return state;
}

function putCard(state, id, cardId, controllerId, zone = 'battlefield') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  // Materializacja 1:1 jak w prawdziwej partii (transformTo payload, liczniki
  // wejściowe, station...) — createCardDeck, nie ręczny spread definicji.
  const [entry] = createCardDeck({ cardIds: [cardId], ownerId: controllerId, registry: REGISTRY });
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...entry, echo: def.echo ?? null, echoColors: def.echoColors ?? null,
  });
  return state.objects.get(id);
}

function addCreature(state, id, controllerId) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'x-test', controllerId, zone: 'battlefield',
    kind: 'creature', power: 2, toughness: 2, manaCost: 2, abilities: [], keywords: [],
    subtypes: [], types: ['Creature'], colors: [],
  });
  return state.objects.get(id);
}

function addLand(state, id, controllerId, subtype) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `basic-${subtype.toLowerCase()}`, controllerId,
    zone: 'battlefield', kind: 'land', abilities: [], keywords: [],
    subtypes: [subtype], types: ['Basic', 'Land'], colors: [],
  });
  return state.objects.get(id);
}

function resolveStack(state, max = 16) {
  for (let i = 0; i < max && state.zones.stack.length > 0; i += 1) {
    const r = execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
    if (!r.ok) return false;
  }
  return state.zones.stack.length === 0;
}

const spellCasts = (state, objectId, playerId = 'p1') => playerView(state, playerId).legalCommands
  .filter((c) => c.type === 'cast_spell' && c.objectId === objectId);

const activations = (state, objectId, playerId = 'p1') => playerView(state, playerId).legalCommands
  .filter((c) => c.type === 'activate_ability' && c.objectId === objectId);

// =============================================================================
// B1 — Courage in Crisis: SORCERY, nie Instant (Oracle/Scryfall; CR 307.1)
// =============================================================================

test('B1: Courage in Crisis to Sorcery — oferta rzutu TYLKO we własnej fazie main', () => {
  const def = REGISTRY.get('courage-in-crisis');
  assert.ok(def.types.includes('Sorcery') && !def.types.includes('Instant'),
    `Oracle: Sorcery; rejestr: ${JSON.stringify(def.types)}`);
  assert.equal(def.spell.timing, 'sorcery');

  // W fazie walki (własna tura, pusty stos) czar sorcery NIE jest oferowany.
  const combat = newState({ step: 'declare_attackers' });
  putCard(combat, 'cic', 'courage-in-crisis', 'p1', 'hand');
  addCreature(combat, 'target', 'p2'); // legalny cel — oferta zależy od timingu
  addMana(combat, 'p1', 3, { colors: ['G', 'G', 'G'] });
  assert.equal(spellCasts(combat, 'cic').length, 0,
    'sorcery nie wchodzi na stos w fazie walki (CR 307.1)');

  // W głównej fazie — normalnie dostępny.
  const main = newState({ step: 'main' });
  putCard(main, 'cic', 'courage-in-crisis', 'p1', 'hand');
  addCreature(main, 'target', 'p2');
  addMana(main, 'p1', 3, { colors: ['G', 'G', 'G'] });
  assert.ok(spellCasts(main, 'cic').length > 0, 'w main1 oferta rzutu istnieje');
});

// =============================================================================
// B2 — Enter the Enigma: SORCERY, nie Instant (Oracle/Scryfall; CR 307.1)
// =============================================================================

test('B2: Enter the Enigma to Sorcery — brak oferty poza główną fazą', () => {
  const def = REGISTRY.get('enter-the-enigma');
  assert.ok(def.types.includes('Sorcery') && !def.types.includes('Instant'),
    `Oracle: Sorcery; rejestr: ${JSON.stringify(def.types)}`);
  assert.equal(def.spell.timing, 'sorcery');

  const combat = newState({ step: 'declare_attackers' });
  putCard(combat, 'ete', 'enter-the-enigma', 'p1', 'hand');
  addCreature(combat, 'target', 'p2');
  addMana(combat, 'p1', 1, { colors: ['U'] });
  assert.equal(spellCasts(combat, 'ete').length, 0,
    'sorcery nie wchodzi na stos w fazie walki (CR 307.1)');

  const main = newState({ step: 'main' });
  putCard(main, 'ete', 'enter-the-enigma', 'p1', 'hand');
  addCreature(main, 'target', 'p2');
  addMana(main, 'p1', 1, { colors: ['U'] });
  assert.ok(spellCasts(main, 'ete').length > 0);
});

// =============================================================================
// B3 — Porcelain Legionnaire: {2}{W/P} to mana value 3 (CR 202.3)
// =============================================================================

test('B3: Porcelain Legionnaire ma mana value 3 (symbol {W/P} liczy się do MV)', () => {
  assert.equal(REGISTRY.get('porcelain-legionnaire').manaCost, 3,
    'CR 202.3: {2}{W/P} = 3; manaCost niesie pełną wartość');
});

test('B3: Divine Offering na Porcelain Legionnaire daje 3 życia (nie 2)', () => {
  const state = newState({ step: 'main' });
  putCard(state, 'porc', 'porcelain-legionnaire', 'p2'); // artefaktowy stwór przeciwnika
  putCard(state, 'offering', 'divine-offering', 'p1', 'hand');
  addMana(state, 'p1', 2, { colors: ['W', 'W'] });
  const before = state.players.find((p) => p.id === 'p1').life;
  const cast = spellCasts(state, 'offering').find((c) => c.targets?.[0] === 'porc');
  assert.ok(cast, 'oferta rzutu z celem Porcelain Legionnaire');
  assert.ok(execute(state, cast).ok);
  assert.ok(resolveStack(state));
  const after = state.players.find((p) => p.id === 'p1').life;
  assert.equal(after - before, 3,
    `„gain life equal to its mana value" — MV 3, a nie ${after - before}`);
  assert.notEqual(state.objects.get('porc')?.zone, 'battlefield', 'artefakt zniszczony');
});

// =============================================================================
// B4 — Wormfang Newt: typ linia „Nightmare Salamander Beast" (CR 205.1)
// =============================================================================

test('B4: Wormfang Newt to Nightmare Salamander Beast', () => {
  assert.deepEqual(REGISTRY.get('wormfang-newt').subtypes,
    ['Nightmare', 'Salamander', 'Beast'],
    'Oracle: Creature — Nightmare Salamander Beast');
  const state = newState();
  const newt = putCard(state, 'newt', 'wormfang-newt', 'p1');
  assert.ok((newt.subtypes ?? []).includes('Nightmare') && (newt.subtypes ?? []).includes('Beast'),
    'materializacja niesie pełną typ linię (tribal: Lhurgoyf/Changeling/Nightmare)');
});

// =============================================================================
// B5 — Healer of the Glade: ELEMENTAL, nie Elf (CR 205.1)
// =============================================================================

test('B5: Healer of the Glade to Elemental (nie Elf)', () => {
  assert.deepEqual(REGISTRY.get('healer-of-the-glade').subtypes, ['Elemental'],
    'Oracle: Creature — Elemental (M20)');
});

// =============================================================================
// B6 — Lodestone Needle: craft z kosztem {2}{U} — pip {U} obowiązuje (CR 118.2)
// =============================================================================

test('B6: craft Lodestone Needle NIE jest dostępny za 3 many bezbarwne', () => {
  const state = newState({ step: 'main' });
  putCard(state, 'needle', 'lodestone-needle', 'p1');
  putCard(state, 'bomb', 'panic-spellbomb', 'p1'); // drugi artefakt do wygnania
  addMana(state, 'p1', 3, { colors: [] }); // wyłącznie bezbarwna
  const craft = activations(state, 'needle').filter((c) => c.abilityIndex === 1);
  assert.equal(craft.length, 0, 'craft {2}{U} wymaga źródła niebieskiego (CR 118.2/601.2f)');
});

test('B6: craft działa za {2}{U} i transformuje w Guidestone Compass', () => {
  const state = newState({ step: 'main' });
  putCard(state, 'needle', 'lodestone-needle', 'p1');
  putCard(state, 'bomb', 'panic-spellbomb', 'p1');
  addMana(state, 'p1', 3, { colors: ['U', 'U', 'U'] });
  const craft = activations(state, 'needle').find((c) => c.abilityIndex === 1);
  assert.ok(craft, 'oferta craftu przy dostępnej manie z {U}');
  assert.ok(execute(state, craft).ok);
  assert.ok(resolveStack(state), 'zdolność craft rozstrzygnięta na stosie');
  assert.ok(state.pendingCraftExile, 'decyzja: który artefakt wygnać');
  const r = execute(state, { type: 'resolve_craft_exile', playerId: 'p1', targetId: 'bomb' });
  assert.ok(r.ok);
  assert.notEqual(state.objects.get('needle')?.zone, 'battlefield', 'przednia strona odchodzi');
  const transformed = [...state.objects.values()]
    .find((o) => o.zone === 'battlefield' && o.cardId === 'guidestone-compass');
  assert.ok(transformed, 'craft zwraca transformed stronę (Guidestone Compass)');
});

// =============================================================================
// B7 — Bone Shredder: echo {2}{B} wymaga pipa {B} (CR 702.29)
// =============================================================================

test('B7: echo {2}{B} nie jest opłacalne maną bezbarwną — stwór poświęcony', () => {
  const state = newState({ step: 'upkeep' });
  const shredder = putCard(state, 'shredder', 'bone-shredder', 'p1');
  state.objects.set('shredder', Object.freeze({ ...shredder, echoUnpaid: true }));
  addMana(state, 'p1', 3, { colors: [] }); // pula bezbarwna, zero źródeł kolorowych
  processTriggers(state, [{ type: 'step_advanced', step: 'upkeep', playerId: 'p1' }]);
  assert.ok(!state.pendingPayOrSacrifice,
    'bez źródła {B} echo NIE oferuje płatności (koszt {2}{B} nieopłacalny)');
  const after = state.objects.get('shredder');
  assert.ok(!after || after.zone !== 'battlefield',
    'nieopłacone echo = poświęcenie (CR 702.29)');
});

test('B7: echo {2}{B} płacone źródłami z błękitem... z bagienkiem: decyzja + płatność', () => {
  const state = newState({ step: 'upkeep' });
  const shredder = putCard(state, 'shredder', 'bone-shredder', 'p1');
  state.objects.set('shredder', Object.freeze({ ...shredder, echoUnpaid: true }));
  addLand(state, 'sw', 'p1', 'Swamp');
  addLand(state, 'm1', 'p1', 'Mountain');
  addLand(state, 'm2', 'p1', 'Mountain');
  processTriggers(state, [{ type: 'step_advanced', step: 'upkeep', playerId: 'p1' }]);
  assert.ok(state.pendingPayOrSacrifice, 'przy bagience decyzja echo jest oferowana');
  assert.equal(state.pendingPayOrSacrifice.amount, 3, 'echo = {2}{B} (3 many)');
  const r = execute(state, { type: 'resolve_pay_or_sacrifice', playerId: 'p1', pay: true });
  assert.ok(r.ok, 'płatność {2}{B} udana (auto-tap: bagno + 2 góry)');
  assert.equal(state.objects.get('shredder')?.zone, 'battlefield', 'stwór zostaje');
  const sw = state.objects.get('sw');
  const m1 = state.objects.get('m1');
  const m2 = state.objects.get('m2');
  assert.ok(sw.tapped && m1.tapped && m2.tapped, 'trzy źródła odtapowane na koszt echa');
});

test('B7 (dane): deskryptor echo niesie pip {B}', () => {
  assert.deepEqual(REGISTRY.get('bone-shredder').echoColors ?? [], ['B'],
    'echoColors: [B] — kolorowa część kosztu echa jawna w danych karty');
});
