// M104 — wzorzec U9/A2 dla KOLEJNYCH klas ofert bez skutku (krok 2 z handoffu
// M103): „tap/untap target" na celu, który już jest w docelowym stanie, oraz
// znaczniki jednorazowe („nie może blokować", „nie może być blokowany"), które
// cel już ma. Zasada z U9/A2: engine chowa OFERTĘ no-opu, ale `execute` nadal
// przyjmuje komendę — jest legalna wg CR 602.2b.
//
// Klasy znalezione skanem katalogu (nie transkryptów):
//   - Rustvine Cultivator „{T}, zdejmij oil: odkręć docelowy ląd" — ląd już
//     odkręcony ⇒ koszt (tap źródła + licznik) za nic,
//   - Coralhelm Guide „{4}{U}: docelowy stwór nie może być blokowany" — cel
//     już ma ten znacznik w tej turze ⇒ 5 many za nic.
// Anty-over-fix: Panic Spellbomb płaci POŚWIĘCENIEM ŹRÓDŁA (trigger „dies →
// dobierz za {R}"), więc aktywacja ma wartość mimo jałowego efektu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, execute, addObject, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addMana } from '../src/engine/resources.js';
import { addCounter } from '../src/engine/counters.js';

const REGISTRY = createCardRegistry();

function newState({ turnNumber = 5 } = {}) {
  const state = createGameState({ seed: 2026, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.number = turnNumber;
  return state;
}

function addRealCard(state, id, cardId, controllerId, zone, extra = {}) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, spell: data.spell, abilities: data.abilities ?? [],
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [], types: def.types ?? [],
    colors: data.colors ?? [], cardName: def.name,
    equipment: def.equipment, morph: def.morph, aura: def.aura, bestow: def.bestow,
    summoningSickness: false, ...extra,
  });
  return state.objects.get(id);
}

function addLand(state, id, controllerId, { tapped = false } = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'forest', controllerId, zone: 'battlefield',
    kind: 'land', abilities: [], keywords: [], subtypes: ['Forest'], types: ['Basic', 'Land'],
    colors: [],
  });
  // `addObject` nie przyjmuje `tapped` (tylko `entersTapped`) — stan tapnięcia
  // ustawiamy wprost, jak inne testy silnika.
  if (tapped) state.objects.set(id, Object.freeze({ ...state.objects.get(id), tapped: true }));
  return state.objects.get(id);
}

function addCreature(state, id, controllerId, extra = {}) {
  // Pola spoza kontraktu `addObject` (tapped, cantBlock, cantBeBlocked) to
  // stan, który normalnie nadają efekty — w teście ustawiamy je po dodaniu.
  const { tapped = false, cantBlock = false, cantBeBlocked = false, ...creation } = extra;
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'x-test', controllerId, zone: 'battlefield',
    kind: 'creature', power: 2, toughness: 2, manaCost: 2, abilities: [], keywords: [],
    subtypes: [], types: ['Creature'], colors: [], summoningSickness: false, ...creation,
  });
  if (tapped || cantBlock || cantBeBlocked) {
    state.objects.set(id, Object.freeze({
      ...state.objects.get(id),
      ...(tapped ? { tapped: true } : {}),
      ...(cantBlock ? { cantBlock: true } : {}),
      ...(cantBeBlocked ? { cantBeBlocked: true } : {}),
    }));
  }
  return state.objects.get(id);
}

function offersOf(state, objectId, abilityIndex = null) {
  return playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'activate_ability' && c.objectId === objectId
      && (abilityIndex == null || c.abilityIndex === abilityIndex));
}

// ---------------------------------------------------------------------------
// „Odkręć docelowy ląd" — Rustvine Cultivator (ONE)
// ---------------------------------------------------------------------------

test('M104: Rustvine Cultivator oferuje odkręcenie TAPNIĘTEGO lądu', () => {
  const state = newState();
  addRealCard(state, 'cultivator', 'rustvine-cultivator', 'p1', 'battlefield');
  addCounter(state, 'cultivator', 'oil', 1);
  addLand(state, 'tapped-land', 'p1', { tapped: true });
  const offers = offersOf(state, 'cultivator', 1);
  assert.equal(offers.length, 1, 'tapnięty ląd to realny cel odkręcenia');
  assert.equal(offers[0].targets?.[0], 'tapped-land');
});

test('M104: odkręcenie ODKRĘCONEGO lądu nie jest oferowane (no-op za koszt)', () => {
  const state = newState();
  addRealCard(state, 'cultivator', 'rustvine-cultivator', 'p1', 'battlefield');
  addCounter(state, 'cultivator', 'oil', 1);
  addLand(state, 'fresh-land', 'p1', { tapped: false });
  assert.equal(offersOf(state, 'cultivator', 1).length, 0,
    'ląd jest odkręcony — aktywacja kosztuje tap i licznik oil, a nic nie zmienia');
});

test('M104: przy dwóch lądach oferowany jest WYŁĄCZNIE tapnięty', () => {
  const state = newState();
  addRealCard(state, 'cultivator', 'rustvine-cultivator', 'p1', 'battlefield');
  addCounter(state, 'cultivator', 'oil', 1);
  addLand(state, 'fresh-land', 'p1', { tapped: false });
  addLand(state, 'tapped-land', 'p1', { tapped: true });
  const targets = offersOf(state, 'cultivator', 1).map((c) => c.targets?.[0]);
  assert.deepEqual(targets, ['tapped-land']);
});

test('M104: ląd PRZECIWNIKA też liczy się normalnie (cel „land", nie „land you control")', () => {
  const state = newState();
  addRealCard(state, 'cultivator', 'rustvine-cultivator', 'p1', 'battlefield');
  addCounter(state, 'cultivator', 'oil', 1);
  addLand(state, 'foe-tapped', 'p2', { tapped: true });
  addLand(state, 'foe-fresh', 'p2', { tapped: false });
  const targets = offersOf(state, 'cultivator', 1).map((c) => c.targets?.[0]);
  assert.deepEqual(targets, ['foe-tapped'], 'odkręcenie cudzego lądu to skutek, ale tylko gdy jest co odkręcać');
});

test('M104: execute nadal przyjmuje odkręcenie odkręconego lądu (CR 602.2b — spójność jak U9)', () => {
  const state = newState();
  addRealCard(state, 'cultivator', 'rustvine-cultivator', 'p1', 'battlefield');
  addCounter(state, 'cultivator', 'oil', 1);
  addLand(state, 'fresh-land', 'p1', { tapped: false });
  const r = execute(state, {
    type: 'activate_ability', playerId: 'p1', objectId: 'cultivator', abilityIndex: 1, targets: ['fresh-land'],
  });
  assert.ok(r.ok, `aktywacja no-opu jest legalna: ${r.events?.[0]?.reason ?? ''}`);
});

// ---------------------------------------------------------------------------
// „Nie może być blokowany" — Coralhelm Guide (BFZ)
// ---------------------------------------------------------------------------

test('M104: Coralhelm Guide oferuje ewazję stworowi, który jej nie ma', () => {
  const state = newState();
  addRealCard(state, 'guide', 'coralhelm-guide', 'p1', 'battlefield');
  addCreature(state, 'runner', 'p1');
  addMana(state, 'p1', 5, { colors: ['U'] });
  const targets = offersOf(state, 'guide').map((c) => c.targets?.[0]);
  assert.ok(targets.includes('runner'));
});

test('M104: drugie nadanie „nie może być blokowany" temu samemu celowi jest chowane', () => {
  const state = newState();
  addRealCard(state, 'guide', 'coralhelm-guide', 'p1', 'battlefield');
  addCreature(state, 'runner', 'p1', { cantBeBlocked: true });
  addCreature(state, 'other', 'p1');
  addMana(state, 'p1', 5, { colors: ['U'] });
  const targets = offersOf(state, 'guide').map((c) => c.targets?.[0]);
  assert.ok(!targets.includes('runner'), 'cel już ma znacznik — 5 many za nic');
  assert.ok(targets.includes('other'), 'pozostałe cele nietknięte (anty-over-fix)');
});

// ---------------------------------------------------------------------------
// Anty-over-fix: koszt o WŁASNEJ wartości (poświęcenie źródła z triggerem)
// ---------------------------------------------------------------------------

test('M104: Panic Spellbomb zostaje w ofercie, choć cel już nie może blokować', () => {
  // „{T}, Sacrifice this artifact: Target creature can't block this turn" +
  // „When this artifact is put into a graveyard from the battlefield, you may
  // pay {R}. If you do, draw a card." — poświęcenie źródła ma wartość samo
  // w sobie (sac outlet + dobranie), więc jałowy EFEKT nie czyni aktywacji
  // no-opem. Bramka nie działa przy koszcie z własną wartością.
  const state = newState();
  addRealCard(state, 'bomb', 'panic-spellbomb', 'p1', 'battlefield');
  addCreature(state, 'wall', 'p2', { cantBlock: true });
  const targets = offersOf(state, 'bomb').map((c) => c.targets?.[0]);
  assert.ok(targets.includes('wall'), 'poświęcenie źródła to realny skutek — oferta zostaje');
});

// ---------------------------------------------------------------------------
// Klasy generyczne (ADR 0002) — deskryptory bez odpowiednika w katalogu
// ---------------------------------------------------------------------------

const activated = (effect, extra = {}) => ({
  type: 'activated', timing: 'instant', keyword: null,
  cost: { mana: 1 }, effect, trigger: null, targets: [{ type: 'creature' }],
  cycling: null, condition: null, pump: null, keywords: null,
  oncePerTurn: false, mustAttack: false, ...extra,
});

test('M104: „tapnij docelowego stwora" nie jest oferowane na celu JUŻ tapniętym', () => {
  const state = newState();
  addCreature(state, 'source', 'p1', { abilities: [activated({ type: 'tap_permanent' })] });
  addCreature(state, 'tapped-foe', 'p2', { tapped: true });
  addCreature(state, 'fresh-foe', 'p2', { tapped: false });
  addMana(state, 'p1', 3);
  const targets = offersOf(state, 'source').map((c) => c.targets?.[0]);
  assert.ok(targets.includes('fresh-foe'), 'nietapnięty cel to realny skutek');
  assert.ok(!targets.includes('tapped-foe'), 'tapnięcie tapniętego nic nie zmienia');
});

test('M104: „połóż licznik" z amount 0 nie jest oferowane, z amount 1 — tak', () => {
  const state = newState();
  addCreature(state, 'zero', 'p1', {
    abilities: [activated({ type: 'add_counter', counter: '+1/+1', amount: 0 })],
  });
  addCreature(state, 'one', 'p1', {
    abilities: [activated({ type: 'add_counter', counter: '+1/+1', amount: 1 })],
  });
  addMana(state, 'p1', 4);
  assert.equal(offersOf(state, 'zero').length, 0, 'licznik „0 sztuk" niczego nie zmienia');
  assert.ok(offersOf(state, 'one').length > 0, 'realny licznik nadal oferowany');
});

test('M104: zdolność z KILKOMA efektami zostaje, gdy choć jeden ma skutek', () => {
  const state = newState();
  addCreature(state, 'source', 'p1', {
    abilities: [activated([{ type: 'tap_permanent' }, { type: 'damage', amount: 1 }])],
  });
  addCreature(state, 'tapped-foe', 'p2', { tapped: true });
  addMana(state, 'p1', 3);
  const targets = offersOf(state, 'source').map((c) => c.targets?.[0]);
  assert.ok(targets.includes('tapped-foe'), 'obrażenia to skutek — oferta zostaje mimo jałowego tapnięcia');
});
