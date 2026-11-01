// PMSSB-82 (batch 71) — DELIRIUM na pojedynczym efekcie jako trik bojowy
// (Violent Urge, DSK: „Target creature gets +1/+0 and gains first strike until
// end of turn. Delirium — If there are four or more card types among cards in
// your graveyard, that creature gains double strike until end of turn.”).
//
// SONDA PRZED (atakujący 2/2 blokowany przez 2/2, deklaracja bloków):
//   sam pump (+1/+0)                     −23
//   sam first strike                     +56
//   sam double strike                    +56
//   pump + first strike                  −17   ← REGRESJA
//   pełna karta, bez delirium            −11   (pod passem → bot NIE rzucał)
//   pełna karta, z delirium              −11   ← delirium nieznane wycenie
// Dwa błędy u źródła:
//  1. Kara „pump sam nie zmienia wyniku walki” (−75) ignorowała RODZEŃSTWO
//     z tego samego czaru: +1/+0 i first strike to JEDNA wymiana, nie dwie.
//     Po: kombinacja liczona przez `combinedOutcomeChanges` → 76/82.
//  2. `effect.condition.delirium` nie było czytane w wycenie, więc double
//     strike liczył się też przy pustym cmentarzu. Po: warunek czytany z
//     widoku tym samym zbiorem typów co silnik (`CARD_TYPES`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGameState, addObject, playerView,
} from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import {
  createCardRegistry, REAL_CARDS, VIRTUAL_BASIC_LANDS,
} from '../src/cards/card-data.js';
import { createRegistry } from '../src/cards/registry.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REG = createCardRegistry();
const MOUNTAIN = VIRTUAL_BASIC_LANDS.find((c) => c.id === 'basic-mountain');
const allDefs = () => [...REAL_CARDS, ...VIRTUAL_BASIC_LANDS];

/** Wariant karty z innym zestawem efektów (kontrfaktyk, ADR 0029). */
function withEffects(effects) {
  return createRegistry(allDefs().map((card) => (card.id === 'violent-urge'
    ? { ...card, spell: { ...card.spell, effects } }
    : card)));
}

const DELIRIUM_TYPES = [['Creature'], ['Sorcery'], ['Instant'], ['Land']];

function scene({
  registry = REG, delirium = false, foePower = 2, foeTough = 2, myPower = 2, myTough = 2,
} = {}) {
  const state = createGameState({ seed: 82, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'declare_blockers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  for (let i = 0; i < 2; i += 1) {
    addObject(state, {
      id: `land${i}`, instanceId: `i-land${i}`, cardId: MOUNTAIN.id,
      controllerId: 'p1', ownerId: 'p1', zone: 'battlefield',
      ...gameObjectDataOf(MOUNTAIN), types: MOUNTAIN.types,
      subtypes: MOUNTAIN.subtypes, keywords: MOUNTAIN.keywords ?? [],
    });
  }
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
  const def = registry.get('violent-urge');
  addObject(state, {
    id: 'urge', instanceId: 'i-urge', cardId: 'violent-urge',
    controllerId: 'p1', ownerId: 'p1', zone: 'hand',
    ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes ?? [],
    keywords: def.keywords ?? [],
  });
  addObject(state, {
    id: 'mine', instanceId: 'i-mine', cardId: 'synthetic-mine',
    controllerId: 'p1', ownerId: 'p1', zone: 'battlefield', kind: 'creature',
    power: myPower, toughness: myTough, manaCost: 2, abilities: [], keywords: [],
    subtypes: [], types: ['Creature'], colors: ['R'], cardName: 'Mine',
  });
  addObject(state, {
    id: 'foe', instanceId: 'i-foe', cardId: 'synthetic-foe',
    controllerId: 'p2', ownerId: 'p2', zone: 'battlefield', kind: 'creature',
    power: foePower, toughness: foeTough, manaCost: 3, abilities: [], keywords: [],
    subtypes: [], types: ['Creature'], colors: ['G'], cardName: 'Foe',
  });
  state.combat = {
    attackingPlayerId: 'p1', defendingPlayerId: 'p2',
    attackers: ['mine'], blockers: new Map([['mine', ['foe']]]),
  };
  if (delirium) {
    DELIRIUM_TYPES.forEach((types, i) => addObject(state, {
      id: `grave${i}`, instanceId: `i-grave${i}`, cardId: `synthetic-grave${i}`,
      controllerId: 'p1', ownerId: 'p1', zone: 'graveyard', kind: 'sorcery',
      power: 0, toughness: 0, manaCost: 1, abilities: [], keywords: [],
      subtypes: [], types, colors: [], cardName: `Grave ${i}`,
    }));
  }
  addMana(state, 'p1', 4, { colors: ['R'] });
  state.__registry = registry;
  return state;
}

function castScore(state) {
  const bot = createHeuristicBot({
    seed: 83, randomness: 0, lookahead: 0, registry: state.__registry,
  });
  bot.chooseCommand(playerView(state, 'p1'));
  const row = bot.trace().at(-1).options.find((o) => o.cmd === 'cast_spell(urge->mine)');
  return row?.score;
}

// =========================================================================
// 1. Pump i keyword z JEDNEGO czaru to jedna wymiana (L41 kombinacja)
// =========================================================================

test('PMSSB-82/1: pump + first strike bije sam pump o wartość wymiany', () => {
  const def = REG.get('violent-urge');
  const pumpOnly = withEffects([def.spell.effects[0]]);
  const pumpAndFirstStrike = withEffects([def.spell.effects[0], def.spell.effects[1]]);
  const sam = castScore(scene({ registry: pumpOnly }));
  const razem = castScore(scene({ registry: pumpAndFirstStrike }));
  assert.ok(razem - sam >= 40,
    `kombinacja (${razem}) musi być wyraźnie lepsza od samego pumpu (${sam})`);
});

test('PMSSB-82/2: pełna karta w oknie walki jest dodatnia (bot realnie rzuca)', () => {
  const score = castScore(scene());
  assert.ok(score > 0, `czar w oknie bloków (${score})`);
});

// =========================================================================
// 2. Delirium: double strike liczy się TYLKO przy 4+ typach w grobie
// =========================================================================

test('PMSSB-82/3: bez delirium double strike nie wnosi nic', () => {
  const def = REG.get('violent-urge');
  const bezwarunkowy = withEffects([
    def.spell.effects[0], def.spell.effects[1],
    { ...def.spell.effects[2], condition: null },
  ]);
  const bez = castScore(scene({ delirium: false }));
  const bezwarunkowyBez = castScore(scene({ registry: bezwarunkowy, delirium: false }));
  assert.ok(bezwarunkowyBez > bez,
    `liczenie double strike przy pustym grobie zawyża (${bezwarunkowyBez} vs ${bez})`);
});

test('PMSSB-82/4: przy delirium double strike realnie podnosi wycenę', () => {
  const bez = castScore(scene({ delirium: false }));
  const z = castScore(scene({ delirium: true }));
  assert.ok(z > bez, `delirium spełnione = droższy efekt (${z} vs ${bez})`);
});

test('PMSSB-82/5: delirium liczy SIĘ z grobu kontrolera, nie przeciwnika', () => {
  const state = scene({ delirium: false });
  // Ten sam zestaw typów, ale w grobie PRZECIWNIKA — warunek nie zachodzi.
  DELIRIUM_TYPES.forEach((types, i) => addObject(state, {
    id: `foeGrave${i}`, instanceId: `i-foeGrave${i}`, cardId: `synthetic-fg${i}`,
    controllerId: 'p2', ownerId: 'p2', zone: 'graveyard', kind: 'sorcery',
    power: 0, toughness: 0, manaCost: 1, abilities: [], keywords: [],
    subtypes: [], types, colors: [], cardName: `Foe grave ${i}`,
  }));
  const zmieszane = castScore(state);
  const zWlasnym = castScore(scene({ delirium: true }));
  assert.ok(zWlasnym > zmieszane,
    `cudzy grób nie spełnia delirium (${zmieszane} vs ${zWlasnym})`);
});
