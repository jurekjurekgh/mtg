// PMSSB-80 (batch 71) — „obrażenia równe liczbie kontrolowanych landów”
// (Rumbling Rockslide, LCI). Pełna pętla: sonda PRZED → audyt (L41: jedno
// źródło liczby, wspólne z silnikiem) → pokrętła (wspólny model obrażeń
// `damageTargetValue`, bez nowych wag) → piny RED→GREEN.
//
// SONDA PRZED (probe na tym samym stanie, `hit=6`): ocena zależała WYŁĄCZNIE
// od progu „czy dobija”, nie od liczby landów powyżej progu — i to jest
// poprawne, bo model właściciela zakazuje nieletalnego chipu poza walką.
// Zmierzone: 5 landów vs 6/6 → −81 (zakaz chipu), 6 landów vs 6/6 → +45,
// 6 landów vs 7/7 → −81, 7 landów vs 7/7 → +47.
//
// Audyt kosztu/anty-over-fix: czar jest SORCERY (tylko własna faza główna),
// więc nie ma okna „instant trick”; nie dokładamy premii za okno, bo okna
// nie ma. Kwota rośnie z landami w tle — bot trzyma czar do progu, bo
// wcześniejszy rzut ma ocenę ujemną.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGameState, addObject, playerView, execute,
} from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry, VIRTUAL_BASIC_LANDS } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REG = createCardRegistry();
const MOUNTAIN = VIRTUAL_BASIC_LANDS.find((c) => c.id === 'mountain') ?? VIRTUAL_BASIC_LANDS[0];

function land(state, id, controllerId = 'p1') {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: MOUNTAIN.id, controllerId, ownerId: controllerId,
    zone: 'battlefield', ...gameObjectDataOf(MOUNTAIN),
    types: MOUNTAIN.types, subtypes: MOUNTAIN.subtypes, keywords: MOUNTAIN.keywords ?? [],
  });
}

function scene({ ownLands = 0, enemyLands = 0, victimToughness = 5 } = {}) {
  const state = createGameState({ seed: 80, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  addMana(state, 'p1', 6, { colors: ['R'] });
  for (let i = 0; i < ownLands; i += 1) land(state, `own${i}`);
  for (let i = 0; i < enemyLands; i += 1) land(state, `foe${i}`, 'p2');
  for (const playerId of ['p1', 'p2']) {
    for (let i = 0; i < 25; i += 1) {
      addObject(state, {
        id: `lib-${playerId}-${i}`, instanceId: `i-lib-${playerId}-${i}`,
        cardId: 'library-blank', controllerId: playerId, ownerId: playerId,
        zone: 'library', kind: 'sorcery', power: 0, toughness: 0, manaCost: 2,
        abilities: [], keywords: [], subtypes: [], types: ['Sorcery'], colors: [],
        cardName: 'Library blank',
      });
    }
  }
  const def = REG.get('rumbling-rockslide');
  addObject(state, {
    id: 'slide', instanceId: 'i-slide', cardId: 'rumbling-rockslide',
    controllerId: 'p1', ownerId: 'p1', zone: 'hand',
    ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes ?? [],
    keywords: def.keywords ?? [],
  });
  addObject(state, {
    id: 'victim', instanceId: 'i-victim', cardId: 'synthetic-victim',
    controllerId: 'p2', ownerId: 'p2', zone: 'battlefield', kind: 'creature',
    power: 3, toughness: victimToughness, manaCost: 3, abilities: [], keywords: [],
    subtypes: [], types: ['Creature'], colors: ['G'], cardName: 'Victim',
  });
  return state;
}

function scoreOf(state, label) {
  const bot = createHeuristicBot({ seed: 81, randomness: 0, lookahead: 0, registry: REG });
  bot.chooseCommand(playerView(state, 'p1'));
  const options = bot.trace().at(-1).options;
  return options.find((o) => o.cmd === label)?.score;
}

// =========================================================================

test('PMSSB-80/1: czar jest rzucany TUŻ przy progu dobicia (6 landów vs 6/6)', () => {
  const atThreshold = scoreOf(scene({ ownLands: 6, victimToughness: 6 }), 'cast_spell(slide->victim)');
  assert.ok(atThreshold > 0, `przy progu rzut się opłaca (${atThreshold})`);
});

test('PMSSB-80/2: o jeden land za mało = zakaz nieletalnego chipu', () => {
  const below = scoreOf(scene({ ownLands: 5, victimToughness: 6 }), 'cast_spell(slide->victim)');
  assert.ok(below < 0, `pod progiem bot trzyma czar (${below})`);
});

test('PMSSB-80/3: kwota liczy TYLKO landy rzucającego (cudze nie podbijają)', () => {
  const mixed = scoreOf(scene({ ownLands: 2, enemyLands: 4, victimToughness: 6 }), 'cast_spell(slide->victim)');
  assert.ok(mixed < 0, `4 landy przeciwnika nie mogą udawać moich (${mixed})`);
});

test('PMSSB-80/4: bez landów nie ma obrażeń — rzut zablokowany', () => {
  const none = scoreOf(scene({ ownLands: 0, victimToughness: 2 }), 'cast_spell(slide->victim)');
  assert.ok(none < 0, `0 obrażeń to spalona karta (${none})`);
});

test('PMSSB-80/5 (L41): liczba z wyceny == obrażenia w silniku', () => {
  const state = scene({ ownLands: 6, victimToughness: 9 });
  const bot = createHeuristicBot({ seed: 81, randomness: 0, lookahead: 0, registry: REG });
  bot.chooseCommand(playerView(state, 'p1'));
  const cmd = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'slide');
  assert.ok(cmd, 'oferta rzutu');
  execute(state, cmd);
  for (let guard = 0; guard < 10 && state.zones.stack.length > 0; guard += 1) {
    const pass = playerView(state, state.turn.priorityPlayerId).legalCommands
      .find((c) => c.type === 'pass_priority');
    if (!pass) break;
    execute(state, pass);
  }
  assert.equal(state.objects.get('victim').damage ?? 0, 6,
    'silnik zadał tyle obrażeń, ile landów — model bota nie może się rozjechać');
});

test('PMSSB-80/6: cel wysoko ponad progiem też jest zakazem (7/7 przy 6 landach)', () => {
  const over = scoreOf(scene({ ownLands: 6, victimToughness: 7 }), 'cast_spell(slide->victim)');
  assert.ok(over < 0, `nie dobija = nie rzucaj (${over})`);
});
