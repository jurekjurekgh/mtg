// M103 (L15) — sonda „oferta bez skutku": automatyzacja wzorca audytu
// M102 U8/U9/U10 („czy panel oferuje akcję, która nic nie zmienia albo jest
// pewną stratą?"). Sonda wykonuje komendę z panelu na KLONIE stanu z w pełni
// pasywnym przeciwnikiem i porównuje fingerprint stanu przed/po.
//
// Testy RED→GREEN: każdy przypadek najpierw napisany przy braku
// implementacji (moduł src/table/noop-probe.js), potem zielony.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addMana } from '../src/engine/resources.js';
import { attachEquipmentToCreature } from '../src/engine/attachments.js';
import { stateFingerprint } from '../src/engine/fingerprint.js';
import { diffFingerprintPaths, probeCommandEffect } from '../src/table/noop-probe.js';

const REGISTRY = createCardRegistry();

function newState({ turnNumber = 5 } = {}) {
  const state = createGameState({ seed: 2026, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.number = turnNumber;
  return state;
}

function addRealCard(state, id, cardId, controllerId, zone) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, spell: data.spell, abilities: data.abilities ?? [],
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [], types: def.types ?? [],
    colors: data.colors ?? [], cardName: def.name,
    equipment: def.equipment, morph: def.morph, aura: def.aura, bestow: def.bestow,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

function addCreature(state, id, controllerId, power, toughness, extra = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'x-test', controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost: 2, abilities: [], keywords: [],
    subtypes: [], types: ['Creature'], colors: [], ...extra,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

// =============================================================================
// diffFingerprintPaths — czysty dyf ścieżkowy fingerprintów
// =============================================================================

test('diff: identyczne stany nie mają różnic', () => {
  const state = newState();
  const fp = stateFingerprint(state);
  assert.deepEqual(diffFingerprintPaths(fp, fp), []);
});

// Obiekty engine są zamrożone (read-only), więc testy czystego dyfu używają
// syntetycznych fingerprintów w kształcie wyjścia stateFingerprint.
const fakeFp = (over = {}) => JSON.stringify({
  seed: 1, status: 'active', winnerId: null,
  turn: { number: 1, phase: 'precombat_main', step: 'main', activePlayerId: 'p1', priorityPlayerId: 'p1' },
  zones: { hand: [], battlefield: [], stack: [] },
  players: [{ id: 'p1', life: 20, mana: 0, manaPool: {} }, { id: 'p2', life: 20, mana: 0, manaPool: {} }],
  objects: [],
  combat: null,
  ...over,
});

test('diff: tapnięcie landa to dokładnie jedna ścieżka objects[0].tapped', () => {
  const obj = { id: 'forest1', controllerId: 'p1', types: ['Land'], tapped: false };
  const before = fakeFp({ objects: [{ ...obj }] });
  const after = fakeFp({ objects: [{ ...obj, tapped: true }] });
  assert.deepEqual(diffFingerprintPaths(before, after), ['objects[0].tapped']);
});

test('diff: zmiana życia gracza to ścieżka players[0].life', () => {
  const before = fakeFp();
  const after = fakeFp({ players: [{ id: 'p1', life: 17, mana: 0, manaPool: {} }, { id: 'p2', life: 20, mana: 0, manaPool: {} }] });
  assert.deepEqual(diffFingerprintPaths(before, after), ['players[0].life']);
});

test('diff: przejście karty z ręki na bitwisko daje ścieżki stref i obiektu', () => {
  const before = fakeFp({ zones: { hand: ['forest1'], battlefield: [], stack: [] }, objects: [{ id: 'forest1', zone: 'hand' }] });
  const after = fakeFp({ zones: { hand: [], battlefield: ['forest1'], stack: [] }, objects: [{ id: 'forest1', zone: 'battlefield' }] });
  const paths = diffFingerprintPaths(before, after);
  assert.ok(paths.includes('zones.hand'), `strefa ręki zmieniona: ${paths.join(', ')}`);
  assert.ok(paths.includes('zones.battlefield'), `strefa bitwiska zmieniona: ${paths.join(', ')}`);
  assert.ok(paths.includes('objects[0].zone'), `strefa obiektu zmieniona: ${paths.join(', ')}`);
});

// =============================================================================
// probeCommandEffect — sonda skutku komendy na klonie (pasywny przeciwnik)
// =============================================================================

test('probe: zagranie landa to realny efekt (zmiana stref), nie no-op', () => {
  const state = newState();
  addRealCard(state, 'forest1', 'basic-forest', 'p1', 'hand');
  const cmd = playerView(state, 'p1').legalCommands.find((c) => c.type === 'play_land');
  assert.ok(cmd, 'oferta zagrania landa istnieje');
  const probe = probeCommandEffect(state, cmd);
  assert.equal(probe.ok, true, JSON.stringify(probe));
  assert.equal(probe.changed, true);
  assert.ok(probe.effectDiffs.some((p) => p.startsWith('zones.')), `efekt widać w strefach: ${probe.effectDiffs.join(', ')}`);
  assert.equal(probe.fizzle, false);
  assert.equal(probe.ownLandTaps, 0, 'zagranie landa nie tapie landów');
});

test('probe U9: equip na OBECNEGO nosiciela z puli many — jedyna zmiana to mana (koszt)', () => {
  const state = newState();
  addRealCard(state, 'sword', 'greatsword-of-tyr', 'p1', 'battlefield');
  addCreature(state, 'knight', 'p1', 2, 2);
  addCreature(state, 'pawn', 'p1', 1, 1);
  addMana(state, 'p1', 2, { colors: ['W'] });
  attachEquipmentToCreature(state, 'sword', 'knight');
  // U9: oferty na OBECNEGO nosiciela już nie ma, ale na INNEGO stwora jest —
  // dawną ofertę odtwarzamy, podmieniając cel na nosiciela.
  const offered = playerView(state, 'p1').legalCommands.find((c) => c.type === 'activate_ability'
    && c.objectId === 'sword' && c.targets?.[0] === 'pawn');
  assert.ok(offered, 'equip na innego stwora jest oferowany (U9 nie przecina ofert)');
  const cmd = { ...offered, targets: ['knight'] };
  const probe = probeCommandEffect(state, cmd);
  assert.equal(probe.ok, true, JSON.stringify(probe));
  assert.equal(probe.changed, true);
  assert.equal(probe.fizzle, false);
  assert.deepEqual(probe.effectDiffs, [], 'poza zapłaconym kosztem nic się nie dzieje');
  assert.equal(probe.ownLandTaps, 0, 'mana wzięta z puli, nie z landów');
  assert.equal(probe.manaChanged, true, 'koszt zapłacony z puli many');
  assert.equal(probe.costSignature.mana, true);
});

test('probe U9: equip na obecnego nosiciela za manę z landów — jedyna zmiana to tapnięty land (koszt)', () => {
  const state = newState();
  addRealCard(state, 'sword', 'greatsword-of-tyr', 'p1', 'battlefield');
  addCreature(state, 'knight', 'p1', 2, 2);
  addCreature(state, 'pawn', 'p1', 1, 1);
  addRealCard(state, 'plains1', 'basic-plains', 'p1', 'battlefield');
  attachEquipmentToCreature(state, 'sword', 'knight');
  const offered = playerView(state, 'p1').legalCommands.find((c) => c.type === 'activate_ability'
    && c.objectId === 'sword' && c.targets?.[0] === 'pawn');
  assert.ok(offered, 'equip na innego stwora jest oferowany');
  const cmd = { ...offered, targets: ['knight'] };
  const probe = probeCommandEffect(state, cmd);
  assert.equal(probe.ok, true, JSON.stringify(probe));
  assert.equal(probe.changed, true);
  assert.deepEqual(probe.effectDiffs, [], 'bez skutku poza opłaconym kosztem');
  assert.ok(probe.ownLandTaps >= 1, 'land dotapnięty za koszt equip');
  assert.equal(probe.opponentTaps, 0);
  assert.equal(probe.ownUntaps, 0);
  assert.equal(probe.opponentUntaps, 0);
  assert.equal(probe.costSignature.mana, true, 'equip ma koszt many');
});

test('probe U8: Bone Splinters celujący w poświęcanego stwora kończy się fizzlem', () => {
  const state = newState();
  addRealCard(state, 'bones', 'bone-splinters', 'p1', 'hand');
  addCreature(state, 'guard', 'p1', 2, 2);
  addRealCard(state, 'swamp1', 'basic-swamp', 'p1', 'battlefield');
  const view = playerView(state, 'p1');
  // U8 świadomie NIE usuwa tego wariantu (nisza CR 601.2c) — sonda ma go
  // rozpoznać jako pewną stratę.
  const selfSac = view.legalCommands.find((c) => c.type === 'cast_spell'
    && c.objectId === 'bones' && c.targets?.[0] === 'guard' && c.sacrificeTargetId === 'guard');
  assert.ok(selfSac, 'wariant samoznoszący istnieje w ofercie (na końcu listy)');
  const probe = probeCommandEffect(state, selfSac);
  assert.equal(probe.ok, true, JSON.stringify(probe));
  assert.equal(probe.changed, true, 'poświęcenie i rzut zmieniają stan');
  assert.equal(probe.fizzle, true, 'czar fizzluje przy pasywnym przeciwniku');
});

test('probe: sensowny czar (Brute Force na własnego stwora) nie jest no-opem ani fizzlem', () => {
  const state = newState();
  addRealCard(state, 'brute', 'brute-force', 'p1', 'hand');
  addCreature(state, 'knight', 'p1', 2, 2);
  addRealCard(state, 'mountain1', 'basic-mountain', 'p1', 'battlefield');
  const cmd = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'brute');
  assert.ok(cmd, 'oferta rzutu Brute Force istnieje');
  const probe = probeCommandEffect(state, cmd);
  assert.equal(probe.ok, true, JSON.stringify(probe));
  assert.equal(probe.changed, true);
  assert.equal(probe.fizzle, false);
  assert.ok(probe.effectDiffs.some((p) => p.includes('powerModifier') || p.includes('untilEndOfTurnBuffs')),
    `buff to realny efekt: ${probe.effectDiffs.join(', ')}`);
});

test('probe: zdolność many (tap dorka) — jedyna zmiana to tapnięcie źródła (efekt poza fingerprint)', () => {
  const state = newState();
  addRealCard(state, 'plains1', 'basic-plains', 'p1', 'battlefield');
  // Dowolny permanent z kosztem {T} i efektem add_mana — tu wirtualny
  // (produkcja many nie zostawia śladu w fingerprint; detektor rozpoznaje
  // to po etykiecie i NIE zgłasza).
  addObject(state, {
    id: 'dork', instanceId: 'i-dork', cardId: 'x-test', controllerId: 'p1', zone: 'battlefield',
    kind: 'creature', power: 1, toughness: 1, manaCost: 1, keywords: [], subtypes: [],
    types: ['Creature'], colors: ['G'],
    abilities: [{
      type: 'activated', keyword: null, cost: { tap: true },
      targets: [], effect: { type: 'add_mana', color: 'G', amount: 1 },
    }],
  });
  state.objects.set('dork', Object.freeze({ ...state.objects.get('dork'), summoningSickness: false }));
  const cmd = playerView(state, 'p1').legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === 'dork');
  assert.ok(cmd, 'oferta aktywacji istnieje');
  const probe = probeCommandEffect(state, cmd);
  assert.equal(probe.ok, true, JSON.stringify(probe));
  assert.equal(probe.changed, true);
  assert.deepEqual(probe.effectDiffs, [], 'mana nie jest w fingerprint');
  assert.equal(probe.ownOtherTaps, 1, 'źródło tapnięte jako koszt');
  assert.equal(probe.costSignature.tap, true);
});

test('probe: komenda odrzucona przez engine nie udaje skutku', () => {
  const state = newState();
  // Pass jako komenda sondy jest legalny, ale to nie oferta „ze skutkiem" —
  // w praktyce mostek sesji go odfiltrowuje (pass_or_concede). Tu sprawdzamy
  // tylko, że sonda nie wywala się na nietypowej komendzie.
  const cmd = { type: 'pass_priority', playerId: 'p1' };
  const probe = probeCommandEffect(state, cmd);
  assert.equal(probe.ok, true);
  assert.equal(probe.changed, true, 'pass zmienia priorytet (turn)');
  assert.deepEqual(probe.effectDiffs, [], 'zmiana priorytetu to nie efekt');
});

test('probe A3: obrażenia każdemu przeciwnikowi to EFEKT (życie przeciwnika), nie koszt', () => {
  // Welder Automaton {3}{R}: 1 obrażenie każdemu przeciwnikowi — detektor
  // dostał fałszywy alarm „jedyna zmiana to koszt", bo sonda śledziła
  // wyłącznie życie GRACZA sondy, a życie przeciwnika spadało do ścieżek
  // pomijanych. Życie przeciwnika to skutek — musi trafić do effectDiffs.
  const state = newState();
  addRealCard(state, 'welder', 'welder-automaton', 'p1', 'battlefield');
  addMana(state, 'p1', 5, { colors: ['R'] });
  const cmd = playerView(state, 'p1').legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === 'welder');
  assert.ok(cmd, 'oferta aktywacji istnieje');
  const probe = probeCommandEffect(state, cmd);
  assert.equal(probe.ok, true, JSON.stringify(probe));
  assert.ok(probe.effectDiffs.some((p) => p === 'players[1].life'),
    `życie przeciwnika to skutek: ${probe.effectDiffs.join(', ')}`);
  assert.equal(probe.humanLifeDelta, 0, 'życie gracza sondy bez zmian');
});

// =============================================================================
// M104 — koszt „Remove a counter" jest KOSZTEM, nie skutkiem
//
// Rustvine Cultivator: „{T}, Remove an oil counter from this creature: Untap
// target land". Odkręcenie ODKRĘCONEGO lądu nic nie zmienia, ale zdjęty
// licznik oil wyglądał w dyfie jak skutek (effectDiffs) i maskował no-opa —
// ta sama klasa błędu klasyfikacji co L18 (życie przeciwnika).
// =============================================================================

test('M104: zdjęty licznik kosztu nie trafia do effectDiffs (sonda widzi no-opa)', () => {
  const state = newState();
  const cultivator = addRealCard(state, 'rv', 'rustvine-cultivator', 'p1', 'battlefield');
  state.objects.set('rv', Object.freeze({ ...cultivator, counters: { oil: 1 } }));
  addObject(state, {
    id: 'land', instanceId: 'i-land', cardId: 'forest', controllerId: 'p1', zone: 'battlefield',
    kind: 'land', types: ['Basic', 'Land'], subtypes: ['Forest'], abilities: [], keywords: [],
  });
  const probe = probeCommandEffect(state, {
    type: 'activate_ability', playerId: 'p1', objectId: 'rv', abilityIndex: 1, targets: ['land'],
  });
  assert.ok(probe.ok, 'komenda wykonana na klonie');
  assert.ok(probe.changed, 'stan się zmienia — o zapłacony koszt');
  assert.deepEqual(probe.effectDiffs, [], 'poza kosztem nic się nie stało');
  assert.equal(probe.costSignature.removeCounter?.name, 'oil');
  assert.equal(probe.costCounterPaid, true, 'licznik zdjęty dokładnie w wysokości kosztu');
});

test('M104: odkręcenie TAPNIĘTEGO lądu to realny skutek (sonda nie zgłasza)', () => {
  const state = newState();
  const cultivator = addRealCard(state, 'rv', 'rustvine-cultivator', 'p1', 'battlefield');
  state.objects.set('rv', Object.freeze({ ...cultivator, counters: { oil: 1 } }));
  addObject(state, {
    id: 'land', instanceId: 'i-land', cardId: 'forest', controllerId: 'p1', zone: 'battlefield',
    kind: 'land', types: ['Basic', 'Land'], subtypes: ['Forest'], abilities: [], keywords: [],
  });
  state.objects.set('land', Object.freeze({ ...state.objects.get('land'), tapped: true }));
  const probe = probeCommandEffect(state, {
    type: 'activate_ability', playerId: 'p1', objectId: 'rv', abilityIndex: 1, targets: ['land'],
  });
  assert.ok(probe.ok);
  assert.equal(probe.ownUntaps, 1, 'odkręcenie własnego permanentu = skutek');
});

test('M104: licznik DOŁOŻONY (Trigon — charge) nadal jest skutkiem', () => {
  const state = newState();
  addRealCard(state, 'trigon', 'trigon-of-corruption', 'p1', 'battlefield');
  addMana(state, 'p1', 4, { colors: ['B'] });
  const probe = probeCommandEffect(state, {
    type: 'activate_ability', playerId: 'p1', objectId: 'trigon', abilityIndex: 0,
  });
  assert.ok(probe.ok);
  assert.ok(probe.effectDiffs.length > 0, 'dołożenie licznika to zmiana stanu poza kosztem');
});
