// Zgłoszenie P — fundament Converge (polecenie właściciela: „zbliża się karta
// z Converge, więc warto to zakodować”). CR 207.2c: Converge to ability word
// („have no special rules meaning and no individual entries in the
// Comprehensive Rules”) — testowany jest więc generyczny mechanizm „number
// of colors of mana spent to cast this spell”, nie żadna konkretna karta
// (ADR 0029: nośniki syntetyczne, katalog bez zmian).
//
// Model silnika odracza wybór koloru przy produkcji: jednostka ze źródła
// wielokolorowego leży w puli z całym profilem (`UR`, `WUBRG`), a płatności
// dopasowują ją do co najwyżej jednego pipa. Zasada właściciela: przy
// liczeniu kolorów jednostki wielokolorowe rozliczamy NA KOŃCU, jako kolor,
// którego jeszcze nie policzono — każda daje co najwyżej JEDEN kolor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana, countColorsOfManaSpent } from '../src/engine/resources.js';

function game() {
  const state = createGameState({ seed: 2072, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  return state;
}

function addLibrary(state, count = 8) {
  for (let i = 0; i < count; i += 1) {
    addObject(state, {
      id: `lib-${i}`, instanceId: `i-lib-${i}`, cardId: 'syn-filler', controllerId: 'p1',
      ownerId: 'p1', zone: 'library', kind: 'spell', manaCost: 1, spell: null,
      abilities: [], keywords: [], subtypes: [], types: ['Instant'], colors: [],
    });
  }
}

function addConvergeDraw(state, manaCost = 3) {
  addObject(state, {
    id: 'conv', instanceId: 'i-conv', cardId: 'syn-converge-draw', controllerId: 'p1',
    ownerId: 'p1', zone: 'hand', kind: 'spell', manaCost,
    spell: {
      timing: 'sorcery', targets: [],
      effects: [{ type: 'draw_cards', amount: 'colors_of_mana_spent' }],
    },
    abilities: [], keywords: [], subtypes: [], types: ['Sorcery'], colors: [],
  });
}

function addConvergeCreature(state) {
  addObject(state, {
    id: 'conv-cr', instanceId: 'i-conv-cr', cardId: 'syn-converge-creature', controllerId: 'p1',
    ownerId: 'p1', zone: 'hand', kind: 'creature', manaCost: 3, power: 1, toughness: 1,
    entersWithCounters: { '+1/+1': 'colors_of_mana_spent' },
    abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [],
  });
}

function addManaUnits(state, units) {
  for (const colors of units) addMana(state, 'p1', 1, { colors });
}

function resolveCast(state, commandType, objectId) {
  const cmd = playerView(state, 'p1').legalCommands
    .find((c) => c.type === commandType && c.objectId === objectId);
  assert.ok(cmd, `oferta ${commandType} dla ${objectId}`);
  assert.ok(execute(state, cmd).ok, 'rzut przyjęty');
  const stacked = [...state.objects.values()].find((o) => o.zone === 'stack');
  assert.ok(stacked, 'czar na stosie');
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  return stacked;
}

const handCount = (state) => state.zones.hand
  .filter((id) => state.objects.get(id)?.controllerId === 'p1').length;

// --- czysta funkcja licząca ------------------------------------------------

test('P1: countColorsOfManaSpent — wildcard liczony na końcu jako brakujący kolor', () => {
  assert.equal(countColorsOfManaSpent([]), 0);
  assert.equal(countColorsOfManaSpent(['']), 0, 'bezbarwna nie jest kolorem (CR 106.1a)');
  assert.equal(countColorsOfManaSpent(['C']), 0);
  assert.equal(countColorsOfManaSpent(['B', 'B', 'B']), 1, 'powtórki liczą się raz');
  assert.equal(countColorsOfManaSpent(['WUBRG']), 1, 'jedna jednostka dowolnego koloru = 1 kolor, nie 5');
  assert.equal(countColorsOfManaSpent(['WUBRG', 'G', 'U']), 3, 'dowolna dokłada kolor, którego brakuje');
  assert.equal(countColorsOfManaSpent(['UR', 'G']), 2);
  assert.equal(countColorsOfManaSpent(['UR', 'UR']), 2, 'dwie jednostki dwukolorowe mogą dać dwa różne kolory');
  assert.equal(countColorsOfManaSpent(['UBR', 'UB', 'UB']), 3,
    'kolejność wpisów nie zaniża wyniku (dopasowanie maksymalne)');
  assert.equal(countColorsOfManaSpent(Array.from({ length: 6 }, () => 'WUBRG')), 5, 'sufit = 5 kolorów');
});

// --- instant/sorcery: ślad na stosie + kwota przy rozstrzygnięciu ----------

test('P2: sorcery Converge — Skarb + G + U dobiera 3 (dowolny kolor liczony na końcu)', () => {
  const state = game();
  addLibrary(state);
  addConvergeDraw(state);
  addManaUnits(state, [['W', 'U', 'B', 'R', 'G'], ['G'], ['U']]);
  const stacked = resolveCast(state, 'cast_spell', 'conv');
  assert.deepEqual([...(stacked.manaColorsSpent ?? [])].sort(), ['G', 'U', 'WUBRG'],
    'obiekt stosu niesie profile wydanych jednostek (ścieżka instant/sorcery, nie tylko permanenty)');
  assert.equal(handCount(state), 3, 'dobierze tyle kart, ile kolorów wydano na rzut');
  const inGrave = [...state.objects.values()]
    .find((o) => o.cardId === 'syn-converge-draw' && o.zone === 'graveyard');
  assert.ok(inGrave, 'czar w grobie po rozstrzygnięciu');
  assert.equal(inGrave.manaColorsSpent, undefined,
    'ślad kolorów gaśnie poza stosem/polem bitwy (CR 400.7 — nowy obiekt)');
});

test('P3: mono-mana i bezbarwna nie zawyżają Converge', () => {
  const mono = game();
  addLibrary(mono);
  addConvergeDraw(mono);
  addManaUnits(mono, [['B'], ['B'], []]);
  resolveCast(mono, 'cast_spell', 'conv');
  assert.equal(handCount(mono), 1, 'B+B+{C} = 1 kolor');

  const flex = game();
  addLibrary(flex);
  addConvergeDraw(flex);
  addManaUnits(flex, [['U', 'R'], ['U', 'R'], []]);
  resolveCast(flex, 'cast_spell', 'conv');
  assert.equal(handCount(flex), 2, 'UR+UR+{C} = 2 kolory (każda jednostka co najwyżej jeden)');
});

test('P4: jedna jednostka dowolnego koloru na generic = 1 kolor (nie pięć)', () => {
  const state = game();
  addLibrary(state);
  addConvergeDraw(state, 1);
  addManaUnits(state, [['W', 'U', 'B', 'R', 'G']]);
  const stacked = resolveCast(state, 'cast_spell', 'conv');
  assert.deepEqual(stacked.manaColorsSpent, ['WUBRG']);
  assert.equal(handCount(state), 1);
});

// --- permanent: „enters with a counter for each color…” --------------------

test('P5: permanent Converge — entersWithCounters z kwoty kolorów wydanej many', () => {
  const rich = game();
  addConvergeCreature(rich);
  addManaUnits(rich, [['W', 'U', 'B', 'R', 'G'], ['G'], ['U']]);
  resolveCast(rich, 'cast_permanent', 'conv-cr');
  const richBf = [...rich.objects.values()]
    .find((o) => o.cardId === 'syn-converge-creature' && o.zone === 'battlefield');
  assert.ok(richBf, 'stwór na polu bitwy');
  assert.equal((richBf.counters ?? {})['+1/+1'], 3, '3 kolory = 3 liczniki wejścia');

  const mono = game();
  addConvergeCreature(mono);
  addManaUnits(mono, [['B'], ['B'], ['B']]);
  resolveCast(mono, 'cast_permanent', 'conv-cr');
  const monoBf = [...mono.objects.values()]
    .find((o) => o.cardId === 'syn-converge-creature' && o.zone === 'battlefield');
  assert.equal((monoBf.counters ?? {})['+1/+1'], 1, 'mono-mana = 1 licznik');
});
