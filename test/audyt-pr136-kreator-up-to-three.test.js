// Audyt PR #136 (sesja 2026-09-24f) — Etap D1, znalezisko F-4.
//
// Żywy Tester (seed 78, talia audytowa batcha 59) stanął na kreatorze celów
// Memory's Journey: „Kreator wielocelowy nie do zamknięcia po 5 próbach
// (wierszy 10)". Repro bez DOM-a na PRODUKCYJNYCH danych (oferty z
// `playerView().legalCommands` → plan `multiTargetPlanOf` → dopasowanie
// `commandForSelection`, czyli dokładnie to, co woła przycisk „Zatwierdź"):
//
//   oferty rzutu (6):                                    [gracz, karta, karta, karta|null]
//     ["p1",null,null,null]
//     ["p2","goblin","raptor",null]      ← te dwa
//     ["p2","raptor","goblin",null]      ← to samo seçanie w innej kolejności
//     ["p2","goblin",null,null]
//     ["p2","raptor",null,null]
//     ["p2",null,null,null]
//   plan kreatora: min 4, max 4, worek ["p1",null,"p2","goblin","raptor"]
//   commandForSelection(["p2","goblin","raptor"]) → null  (Zatwierdź gaśnie)
//
// Trzy rozjazdy jednej przyczyny — kreator i enumeracja liczą WEKTOR z
// paddingiem `null` zamiast realnych celów:
//  1. `minTargets`/`maxTargets` z długości wektora (4/4) zamiast liczby
//     wskazanych celów (1..3), więc panel każe zaznaczyć cztery pozycie, choć
//     Oracle mówi „up to three";
//  2. do worka trafia `null` jako rzekomy kandydat (wiersz-dupkek);
//  3. `targetKey` porównuje wektory z nullami, więc wybór „gracz + 2 karty"
//     NIE dopasowuje się do wariantu ["p2","goblin","raptor",null] —
//     Zatwierdź nigdy się nie aktywuje, a karta jest nie do zagrania z UI
//     (silnik ją oferuje!).
// Do tego enumeracja grupowa dawała PERMUTACJE tego samego zbioru zamiast
// kombinacji (klasa L151: „enumerację z powtórzeniami deduplikuj kluczem
// kanonicznym") — przy 3 kartach w grobie zamiast 4 wyborów: 1+3+3+1 i 6
// duplikatów permutations.
//
// Reguły: CR 601.2c (cele to zbiór wskazywany per wystąpienie słowa „target",
// kolejność nie ma znaczenia), CR 400.2/109.2a (karta w grobie przeciwnika).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { multiTargetPlanOf, commandForSelection } from '../src/table/multi-target.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, playerId, zone = 'battlefield', extra = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    ...gameObjectDataOf(def), types: def.types, keywords: def.keywords, subtypes: def.subtypes ?? [],
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId, zone, ...extra,
  });
  return state.objects.get(id);
}

/**
 * Produkcyjny stan: Memory's Journey w ręce p1, w grobie p2 dwie karty,
 * grób p1 pusty. `legalCommands` to dokładnie to, co czyta UI i bot.
 */
function scena({ kartyP2 = ['goblin-piker', 'sun-collared-raptor'] } = {}) {
  const state = createGameState({ seed: 78, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  addMana(state, 'p1', 2, { colors: ['U'] });
  put(state, 'journey', 'memory-s-journey', 'p1', 'hand');
  const ids = ['mj-a', 'mj-b', 'mj-c'];
  kartyP2.forEach((cardId, i) => put(state, ids[i], cardId, 'p2', 'graveyard'));
  const view = playerView(state, 'p1');
  const commands = view.legalCommands.filter((c) => c.type === 'cast_spell' && c.objectId === 'journey');
  return { state, commands };
}

const oferty = (commands) => commands.map((c) => JSON.stringify(c.targets));

test('F-4: oferta nie niesie permutacji tego samego zbioru celów (CR 601.2c, L151)', () => {
  const { commands } = scena();
  const wektory = oferty(commands);
  // Realne wybory: p1 (pusty grób), p2 solo, p2+1 karta (2), p2+2 karty (1).
  assert.equal(commands.length, 5, `oczekiwano 5 wariantów, jest ${commands.length}: ${wektory.join(' ; ')}`);
  const zbiorowo = new Set(commands.map((c) => [...c.targets.filter((t) => t != null)].sort().join('|')));
  assert.equal(zbiorowo.size, commands.length, `dwa warianty to ten sam zbiór celów: ${wektory.join(' ; ')}`);
});

test('F-4: kreator liczy realne cele, nie długość wektora z paddingiem', () => {
  const { commands } = scena();
  const plan = multiTargetPlanOf(commands);
  assert.ok(plan, 'Memory\'s Journey ma plan kreatora (kilka pozycji)');
  assert.equal(plan.minTargets, 1, 'minimum: sam cel-gracz (karty są „up to three")');
  assert.equal(plan.maxTargets, 3, 'maksimum: gracz + 2 karty, bo tyle leży w grobie');
  assert.ok(!plan.targets.includes(null), `worek nie może nosić pustego kandydata: ${JSON.stringify(plan.targets)}`);
});

test('F-4: wybór „gracz + karty" musi dopasować się do wektora z nullami', () => {
  const { commands } = scena();
  const dwa = commandForSelection(commands, { targets: ['p2', 'mj-a', 'mj-b'] });
  assert.ok(dwa, 'silnik oferuje taki wariant — Zatwierdź musi go znaleźć');
  assert.deepEqual(dwa.targets.filter((t) => t != null).sort(), ['mj-a', 'mj-b', 'p2'].sort());

  const zero = commandForSelection(commands, { targets: ['p2'] });
  assert.ok(zero, 'wybór samego gracza-celu jest legalny (ruling ISD 2011-09-22)');
});

test('F-4 anty-over-fix: dobór spoza grobu wskazanego gracza nadal bez komendy', () => {
  const { commands } = scena();
  assert.equal(commandForSelection(commands, { targets: ['p1', 'mj-a'] }), null,
    'karta z WŁASNEGO grobu nie jest legalna przy celu „p1" (graveyardOfSlot)');
  assert.equal(commandForSelection(commands, { targets: ['mj-a', 'mj-b'] }), null,
    'bez gracza-celu wybór jest niekompletny');
});

test('F-4: przy trzech kartach w grobie jest 4 wybory, nie 4+permutacje', () => {
  const { commands } = scena({ kartyP2: ['goblin-piker', 'sun-collared-raptor', 'hill-giant'] });
  // 1 (sam gracz) + 3 (po jednej) + 3 (po dwie) + 1 (trzy) = 8 dla p2, + 1 dla p1.
  assert.equal(commands.length, 9, `oczekiwano 9 wariantów, jest ${commands.length}:\n${oferty(commands).join('\n')}`);
  const plan = multiTargetPlanOf(commands);
  assert.equal(plan.maxTargets, 4, 'gracz + trzy karty');
});
