// PMSSB-84 (batch 71) — CHAMPION: okno rzutu i wybór wygnania
// (Changeling Berserker, LRW: „Champion a creature”, CR 702.72a).
//
// SONDA PRZED (rzut 5/3 za {3}{R}):
//  • pusty stół                    73,8  ← karta i 4 many w błoto (po wejściu
//                                          obowiązkowe poświęcenie samej siebie)
//  • sojusznik 1/1 (token)         73,8
//  • sojusznik 10/10               73,8  (bez różnicy, bo wybór wygnania nie
//                                          był wyceniany — patrz PMSSB-84/B5)
// PO: pusty stół −34,19 (pod passem) — bot czeka na kandydata; z kimkolwiek
// na stole rzut zostaje 73,8.
//
// Wybór wygnania (ta sama komenda co poświęcenie, rozróżniona strefą docelową):
// wygnanie jest ODWRACALNE (`championExileLossFactor` 0,25), więc przy
// sojuszniku 10/10 wygnanie (33) bije poświęcenie własnego 5/3 (27).
// Piny 84/1–84/3 pilnują okna; 84/4–84/5 pokręteł i wyboru ofiary.
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
import { processTriggers } from '../src/engine/triggers.js';
import { DEFAULT_HEURISTIC_PARAMS } from '../src/controllers/heuristic-params.js';

const REG = createCardRegistry();
const MOUNTAIN = VIRTUAL_BASIC_LANDS.find((c) => c.id === 'basic-mountain');

function scene({ allies = [] } = {}) {
  const state = createGameState({ seed: 84, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  for (let i = 0; i < 4; i += 1) {
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
  const def = REG.get('changeling-berserker');
  addObject(state, {
    id: 'cer', instanceId: 'i-cer', cardId: 'changeling-berserker',
    controllerId: 'p1', ownerId: 'p1', zone: 'hand',
    ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes ?? [],
    keywords: def.keywords ?? [],
  });
  allies.forEach((spec, i) => {
    const [power, toughness] = Array.isArray(spec) ? spec : [spec.power, spec.toughness];
    const id = `ally${i}`;
    addObject(state, {
      id, instanceId: `i-${id}`, cardId: `synthetic-ally${i}`,
      controllerId: 'p1', ownerId: 'p1', zone: 'battlefield', kind: 'creature',
      power, toughness, manaCost: Array.isArray(spec) ? power : (spec.manaCost ?? power),
      abilities: [], keywords: [], subtypes: [],
      types: ['Creature'], colors: ['R'], cardName: `Ally ${i}`,
    });
    if (!Array.isArray(spec) && spec.counters) {
      state.objects.set(id, Object.freeze({ ...state.objects.get(id), counters: spec.counters }));
    }
    const attachments = Array.isArray(spec) ? [] : (spec.attachments ?? []);
    attachments.forEach((attachment, j) => {
      const attachmentId = `${id}-attachment-${j}`;
      addObject(state, {
        id: attachmentId, instanceId: `i-${attachmentId}`,
        cardId: `synthetic-${attachment.kind}-${i}-${j}`, controllerId: 'p1', ownerId: 'p1',
        zone: 'battlefield', kind: attachment.kind,
        aura: attachment.kind === 'aura', equipment: attachment.kind === 'equipment',
        types: [attachment.kind === 'aura' ? 'Enchantment' : 'Artifact'],
        subtypes: attachment.kind === 'equipment' ? ['Equipment'] : [],
        manaCost: attachment.manaCost,
      });
      state.objects.set(attachmentId, Object.freeze({
        ...state.objects.get(attachmentId), attachedTo: id,
      }));
    });
  });
  return state;
}

function castScore(state) {
  const bot = createHeuristicBot({ seed: 85, randomness: 0, lookahead: 0, registry: REG });
  bot.chooseCommand(playerView(state, 'p1'));
  const options = bot.trace().at(-1).options;
  return {
    cast: options.find((o) => o.cmd === 'cast_permanent(cer)')?.score,
    pass: options.find((o) => o.cmd === 'pass_priority')?.score,
  };
}

// =========================================================================
// 1. Okno rzutu: bez kandydata na championa NIE ma rzutu
// =========================================================================

test('PMSSB-84/1: pusty stół — bot NIE rzuca championa (po wejściu zginąłby)', () => {
  const { cast, pass } = castScore(scene());
  assert.ok(cast < pass, `rzut (${cast}) musi zejść pod pass (${pass})`);
});

test('PMSSB-84/2: token 1/1 wystarcza — rzut wraca nad pass', () => {
  const { cast, pass } = castScore(scene({ allies: [[1, 1]] }));
  assert.ok(cast > pass, `z kandydatem rzut się opłaca (${cast} vs ${pass})`);
});

test('PMSSB-84/3: z tanim sojusznikiem 1/1 rzut jest opłacalny', () => {
  const { cast, pass } = castScore(scene({ allies: [[1, 1]] }));
  assert.ok(cast > pass, `jest tani legalny host do wygnania (${cast} vs ${pass})`);
});

test('PMSSB-84/6: Magma Pummeler 2 + 5 liczników — bot wstrzymuje championa', () => {
  const state = scene();
  const def = REG.get('magma-pummeler');
  addObject(state, {
    id: 'pummeler', instanceId: 'i-pummeler', cardId: def.id,
    controllerId: 'p1', ownerId: 'p1', zone: 'battlefield',
    ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes,
    keywords: def.keywords ?? [],
  });
  state.objects.set('pummeler', Object.freeze({
    ...state.objects.get('pummeler'), power: 5, toughness: 5, counters: { '+1/+1': 5 },
  }));
  const { cast, pass } = castScore(state);
  assert.ok(cast < pass, `inwestycja hosta (2 + 5 liczników) przewyższa Berserkera (${cast} vs ${pass})`);
});

test('PMSSB-84/7: drogie aury i equipment wliczają się do inwestycji hosta', () => {
  const { cast, pass } = castScore(scene({
    allies: [{
      power: 2, toughness: 2, manaCost: 2,
      attachments: [{ kind: 'aura', manaCost: 2 }, { kind: 'equipment', manaCost: 1 }],
    }],
  }));
  assert.ok(cast < pass, `host 2 + aura 2 + equipment 1 jest droższy niż Berserker (${cast} vs ${pass})`);
});

test('PMSSB-84/8: drogi host nie blokuje rzutu, gdy istnieje tańszy legalny host', () => {
  const { cast, pass } = castScore(scene({ allies: [
    { power: 5, toughness: 5, manaCost: 2, counters: { '+1/+1': 5 } },
    [1, 1],
  ] }));
  assert.ok(cast > pass, `można zachować drogi permanenta i wygnąć tanią 1/1 (${cast} vs ${pass})`);
});

// =========================================================================
// 2. Wybór wygnania: odwracalne wygnanie bije poświęcenie własnego ciała
// =========================================================================

test('PMSSB-84/4: przy sojuszniku 10/10 bot wygania SOJUSZNIKA, nie poświęca siebie', () => {
  const state = scene({ allies: [[10, 10]] });
  const before = state.events.length;
  execute(state, playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'cer'));
  for (let guard = 0; guard < 10 && state.zones.stack.length > 0; guard += 1) {
    const pass = playerView(state, state.turn.priorityPlayerId).legalCommands
      .find((c) => c.type === 'pass_priority');
    if (!pass) break;
    execute(state, pass);
  }
  processTriggers(state, state.events.slice(before));
  for (let guard = 0; guard < 10 && state.zones.stack.length > 0; guard += 1) {
    const pass = playerView(state, state.turn.priorityPlayerId).legalCommands
      .find((c) => c.type === 'pass_priority');
    if (!pass) break;
    execute(state, pass);
  }
  const view = playerView(state, 'p1');
  const bot = createHeuristicBot({ seed: 85, randomness: 0, lookahead: 0, registry: REG });
  bot.chooseCommand(view);
  const options = bot.trace().at(-1).options;
  const exile = options.find((o) => o.cmd === 'resolve_sacrifice_choice(ally0)')?.score;
  const selfSac = options.filter((o) => String(o.cmd).startsWith('resolve_sacrifice_choice(')
    && o.cmd !== 'resolve_sacrifice_choice(ally0)').map((o) => o.score);
  assert.ok(Number.isFinite(exile), 'oferta wygnania sojusznika');
  assert.ok(selfSac.length > 0, 'oferta poświęcenia źródła');
  assert.ok(exile > Math.max(...selfSac),
    `wygnanie (${exile}) > poświęcenie źródła (${Math.max(...selfSac)})`);
});

test('PMSSB-84/5: pokrętła championa są jawne i sterowalne', () => {
  assert.equal(DEFAULT_HEURISTIC_PARAMS.championNoHostPenalty, 120);
  assert.equal(DEFAULT_HEURISTIC_PARAMS.championExileLossFactor, 0.25);
});
