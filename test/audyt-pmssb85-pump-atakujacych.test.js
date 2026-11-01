// PMSSB-85 (batch 71) — PUMP ZBIORU ATAKUJĄCYCH (Trumpet Blast, M10:
// „Attacking creatures get +2/+0 until end of turn.”; CR 611.2c — efekt
// działa na ZBIÓR, nie na cel).
//
// SONDA PRZED: rzut = −10 pkt w KAŻDYM stanie — z dwoma zadeklarowanymi
// atakującymi, w kroku blokujących i bez atakujących. Przyczyna u źródła:
// efekt nie ma `target` w komendzie, więc ścieżka czaru nie miała odbiorcy
// i wpadała w karę „wzmacnianie przeciwnika” (−60). Efekt był dla bota
// niewidzialny (klasa L50), mimo że w katalogu (Thunderstaff) ta sama rodzina
// ma wycenę w ścieżce AKTYWACJI.
// PO: odbiorcami są MOI atakujący (ADR 0017), wartość = suma po nich:
//  • zablokowany — czy pump poprawia wymianę (`combinedOutcomeChanges`, L41),
//  • nieblokowany — przyrost mocy jako obrażenia w twarz (2/pkt).
// Pomiar PO: bez atakujących −20 (pod passem), dwóch atakujących +66.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGameState, addObject, playerView,
} from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry, VIRTUAL_BASIC_LANDS } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { DEFAULT_HEURISTIC_PARAMS } from '../src/controllers/heuristic-params.js';

const REG = createCardRegistry();
const MOUNTAIN = VIRTUAL_BASIC_LANDS.find((c) => c.id === 'basic-mountain');

function scene({ attackers = 0, blocked = false } = {}) {
  const state = createGameState({ seed: 85, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'declare_blockers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  for (let i = 0; i < 3; i += 1) {
    addObject(state, {
      id: `land${i}`, instanceId: `i-land${i}`, cardId: MOUNTAIN.id,
      controllerId: 'p1', ownerId: 'p1', zone: 'battlefield',
      ...gameObjectDataOf(MOUNTAIN), types: MOUNTAIN.types,
      subtypes: MOUNTAIN.subtypes, keywords: MOUNTAIN.keywords ?? [],
    });
  }
  addMana(state, 'p1', 5, { colors: ['R'] });
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
  const def = REG.get('trumpet-blast');
  addObject(state, {
    id: 'blast', instanceId: 'i-blast', cardId: 'trumpet-blast',
    controllerId: 'p1', ownerId: 'p1', zone: 'hand',
    ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes ?? [],
    keywords: def.keywords ?? [],
  });
  const ids = [];
  for (let i = 0; i < attackers; i += 1) {
    const id = `att${i}`;
    ids.push(id);
    addObject(state, {
      id, instanceId: `i-${id}`, cardId: `synthetic-${id}`,
      controllerId: 'p1', ownerId: 'p1', zone: 'battlefield', kind: 'creature',
      power: 2, toughness: 2, manaCost: 2, abilities: [], keywords: [],
      subtypes: [], types: ['Creature'], colors: ['R'], cardName: id,
    });
  }
  addObject(state, {
    id: 'blocker', instanceId: 'i-blocker', cardId: 'synthetic-blocker',
    controllerId: 'p2', ownerId: 'p2', zone: 'battlefield', kind: 'creature',
    power: 3, toughness: 3, manaCost: 3, abilities: [], keywords: [],
    subtypes: [], types: ['Creature'], colors: ['G'], cardName: 'Blocker',
  });
  if (attackers > 0) {
    state.combat = {
      attackingPlayerId: 'p1', defendingPlayerId: 'p2',
      attackers: ids,
      blockers: blocked ? new Map([[ids[0], ['blocker']]]) : new Map(),
    };
  }
  return state;
}

function score(state) {
  const bot = createHeuristicBot({ seed: 86, randomness: 0, lookahead: 0, registry: REG });
  bot.chooseCommand(playerView(state, 'p1'));
  const options = bot.trace().at(-1).options;
  return {
    cast: options.find((o) => o.cmd === 'cast_spell(blast->)')?.score,
    pass: options.find((o) => o.cmd === 'pass_priority')?.score ?? 0,
  };
}

// =========================================================================

test('PMSSB-85/1: bez atakujących czar jest jałowy — pod passem', () => {
  const { cast, pass } = score(scene());
  assert.ok(cast < pass, `pusty zbiór atakujących (${cast} vs ${pass})`);
});

test('PMSSB-85/2: z dwoma atakującymi czar jest wart rzutu', () => {
  const { cast, pass } = score(scene({ attackers: 2 }));
  assert.ok(cast > pass, `dwóch atakujących (${cast} vs ${pass})`);
});

test('PMSSB-85/3: wartość rośnie z LICZBĄ atakujących', () => {
  const jeden = score(scene({ attackers: 1 })).cast;
  const dwa = score(scene({ attackers: 2 })).cast;
  assert.ok(dwa > jeden, `każdy atakujący dokłada obrażenia (${dwa} vs ${jeden})`);
});

test('PMSSB-85/4: zablokowany atakujący liczy się przez wymianę, nie przez twarz', () => {
  const wolny = score(scene({ attackers: 2 }));
  const zablokowany = score(scene({ attackers: 2, blocked: true }));
  assert.ok(Number.isFinite(zablokowany.cast) && zablokowany.cast > 0,
    `pump poprawia wymianę z blokerem (${zablokowany.cast})`);
  assert.notEqual(zablokowany.cast, wolny.cast,
    'blok zmienia rachunek (twarz vs wymiana)');
});

test('PMSSB-85/5: pokrętła są jawne i sterowalne', () => {
  assert.equal(DEFAULT_HEURISTIC_PARAMS.setPumpNoAttackersPenalty, 70);
  assert.equal(DEFAULT_HEURISTIC_PARAMS.setPumpTrickValue, 12);
  assert.equal(DEFAULT_HEURISTIC_PARAMS.setPumpUnblockedPowerWeight, 2);
});
