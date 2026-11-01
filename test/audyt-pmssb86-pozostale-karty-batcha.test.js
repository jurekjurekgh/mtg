// PMSSB-86 (batch 71) — pozostałe mechaniki batcha, każda z gotową LOGIKĄ
// zagrania (nie tylko techniczną poprawnością):
//  • Ambassador Oak (JMP) — ETB token 1/1 Elf Warrior (`create_token`),
//  • Tail Slash (DTK) — obrażenia równe mocy WŁASNEGO stwora
//    (`damage_from_target_power`),
//  • Anticipate (DTK) — `look_top_put_one_hand_rest_bottom 3`,
//  • Sphinx's Herald (ALA) — koszt „poświęć po jednym stworze W/U/B”
//    (`sacrificeCreaturesByColors`) + tutor PO NAZWIE.
//
// SONDA PRZED (pomiar na scenach z tego pliku):
//  • Oak: rzut 75,6; kontrfaktyk bez ETB 66,6 → token wnosi +9 (OK, bez zmian),
//  • Tail Slash: moc 1 → −20 (brak dobicia), 3 → +79, 5 → +83 (OK),
//  • Anticipate: biblioteka 20/2 → +58 (OK), ale PUSTA → +32, czyli POWYŻEJ
//    passu — bot płacił kartę i 2 many za „oglądanie niczego”,
//  • Sphinx's Herald: aktywacja +9 przy braku karty w bibliotece ⇒ −57 (OK),
//    ale przy karcie W bibliotece też +9 — koszt trzech stworów nie był
//    wyceniany w żadnej gałęzi aktywacji.
// PO: pusta biblioteka → −58 (`impulseEmptyLibraryPenalty`), aktywacja
// z trzema 1/1 → −6, z trzema 3/3 → −24 (`coloredSacrificeCostWeight`,
// `coloredSacrificeCardLoss`).
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
import { DEFAULT_HEURISTIC_PARAMS } from '../src/controllers/heuristic-params.js';

const REG = createCardRegistry();
const allDefs = () => [...REAL_CARDS, ...VIRTUAL_BASIC_LANDS];
const landDef = (id) => VIRTUAL_BASIC_LANDS.find((c) => c.id === id);

function land(state, id, landId, controllerId = 'p1') {
  const def = landDef(landId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: def.id, controllerId, ownerId: controllerId,
    zone: 'battlefield', ...gameObjectDataOf(def),
    types: def.types, subtypes: def.subtypes, keywords: def.keywords ?? [],
  });
}

function real(state, id, cardId, { zone = 'battlefield', controllerId = 'p1', registry = REG } = {}) {
  const def = registry.get(cardId);
  assert.ok(def, `karta ${cardId} jest w katalogu`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes ?? [],
    keywords: def.keywords ?? [],
  });
  const current = state.objects.get(id);
  state.objects.set(id, Object.freeze({ ...current, summoningSickness: false }));
}

function creature(state, id, controllerId, power, toughness, colors = ['R'], cardName = null) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `synthetic-${id}`, controllerId, ownerId: controllerId,
    zone: 'battlefield', kind: 'creature', power, toughness, manaCost: Math.max(1, power),
    abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors,
    cardName: cardName ?? id,
  });
}

function scene({ lands = ['basic-island', 'basic-island'], mana = 6, color = 'U', ownLibrary = 20, registry = REG } = {}) {
  const state = createGameState({ seed: 86, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  lands.forEach((landId, i) => land(state, `land${i}`, landId));
  addMana(state, 'p1', mana, { colors: [color] });
  for (const [playerId, n] of [['p1', ownLibrary], ['p2', 20]]) {
    for (let i = 0; i < n; i += 1) {
      addObject(state, {
        id: `lib-${playerId}-${i}`, instanceId: `i-lib-${playerId}-${i}`,
        cardId: 'library-blank', controllerId: playerId, ownerId: playerId,
        zone: 'library', kind: 'sorcery', power: 0, toughness: 0, manaCost: 2,
        abilities: [], keywords: [], subtypes: [], types: ['Sorcery'], colors: [],
        cardName: 'Library blank',
      });
    }
  }
  state.__registry = registry;
  return state;
}

function scores(state) {
  const bot = createHeuristicBot({
    seed: 87, randomness: 0, lookahead: 0, registry: state.__registry ?? REG,
  });
  bot.chooseCommand(playerView(state, 'p1'));
  return new Map(bot.trace().at(-1).options.map((o) => [o.cmd, o.score]));
}

// =========================================================================
// 1. Ambassador Oak — ETB token jest częścią wartości rzutu
// =========================================================================

test('PMSSB-86/1: Ambassador Oak — token 1/1 podnosi wartość rzutu', () => {
  const bezEtb = createRegistry(allDefs().map((c) => (c.id === 'ambassador-oak'
    ? { ...c, abilities: [] } : c)));
  const zTokenem = scene({ lands: ['basic-forest', 'basic-forest', 'basic-forest', 'basic-forest'], color: 'G' });
  real(zTokenem, 'oak', 'ambassador-oak', { zone: 'hand' });
  const bezTokena = scene({
    lands: ['basic-forest', 'basic-forest', 'basic-forest', 'basic-forest'],
    color: 'G', registry: bezEtb,
  });
  real(bezTokena, 'oak', 'ambassador-oak', { zone: 'hand', registry: bezEtb });
  const z = scores(zTokenem).get('cast_permanent(oak)');
  const bez = scores(bezTokena).get('cast_permanent(oak)');
  assert.ok(Number.isFinite(z) && Number.isFinite(bez));
  assert.ok(z > bez, `token wnosi wartość (${z} vs ${bez})`);
});

// =========================================================================
// 2. Tail Slash — obrażenia równe mocy DAWCY, próg dobicia
// =========================================================================

test('PMSSB-86/2: Tail Slash — moc 3 dobija 3/3, moc 1 nie (i wtedy nie rzuca)', () => {
  const slaby = scene({ lands: ['basic-mountain', 'basic-mountain', 'basic-mountain'], mana: 5, color: 'R' });
  real(slaby, 'slash', 'tail-slash', { zone: 'hand' });
  creature(slaby, 'mine', 'p1', 1, 3, ['R']);
  creature(slaby, 'foe', 'p2', 3, 3, ['G']);
  const silny = scene({ lands: ['basic-mountain', 'basic-mountain', 'basic-mountain'], mana: 5, color: 'R' });
  real(silny, 'slash', 'tail-slash', { zone: 'hand' });
  creature(silny, 'mine', 'p1', 3, 3, ['R']);
  creature(silny, 'foe', 'p2', 3, 3, ['G']);
  const slab = scores(slaby).get('cast_spell(slash->mine+foe)');
  const mocny = scores(silny).get('cast_spell(slash->mine+foe)');
  assert.ok(slab < 0, `moc 1 nie dobija 3/3 (${slab})`);
  assert.ok(mocny > 0, `moc 3 dobija 3/3 (${mocny})`);
});

test('PMSSB-86/3: Tail Slash — im większa moc dawcy, tym większa wartość (do progu)', () => {
  const trial = (power) => {
    const state = scene({ lands: ['basic-mountain', 'basic-mountain', 'basic-mountain'], mana: 5, color: 'R' });
    real(state, 'slash', 'tail-slash', { zone: 'hand' });
    creature(state, 'mine', 'p1', power, 3, ['R']);
    creature(state, 'foe', 'p2', 4, 4, ['G']);
    return scores(state).get('cast_spell(slash->mine+foe)');
  };
  const trzy = trial(3); // nie dobija 4/4
  const cztery = trial(4); // dobija
  assert.ok(trzy < 0, `3 obrażenia na 4/4 to chip bez efektu (${trzy})`);
  assert.ok(cztery > 0, `4 obrażenia dobijają 4/4 (${cztery})`);
});

// =========================================================================
// 3. Anticipate — oglądanie PUSTEJ biblioteki nie jest warte karty
// =========================================================================

test('PMSSB-86/4: Anticipate — pusta biblioteka schodzi pod pass', () => {
  const pusta = scene({ ownLibrary: 0, mana: 4, color: 'U' });
  real(pusta, 'ant', 'anticipate', { zone: 'hand' });
  const pelna = scene({ ownLibrary: 20, mana: 4, color: 'U' });
  real(pelna, 'ant', 'anticipate', { zone: 'hand' });
  const p = scores(pusta).get('cast_spell(ant->)');
  const q = scores(pelna).get('cast_spell(ant->)');
  assert.ok(p < 0, `pusta biblioteka = karta za nic (${p})`);
  assert.ok(q > 0, `pełna biblioteka = selekcja (${q})`);
});

test('PMSSB-86/5: Anticipate — pokrętło pustej biblioteki jest jawne', () => {
  assert.equal(DEFAULT_HEURISTIC_PARAMS.impulseEmptyLibraryPenalty, 90);
});

// =========================================================================
// 4. Sphinx's Herald — koszt ofiar z kolorów jest realny
// =========================================================================

test('PMSSB-86/6: Sphinx\'s Herald — trzy stwory w koszcie są wyceniane', () => {
  const trial = (power) => {
    const state = scene({ lands: ['basic-island', 'basic-plains', 'basic-swamp'], mana: 4, color: 'U' });
    real(state, 'her', 'sphinxs-herald');
    creature(state, 'w', 'p1', power, power, ['W']);
    creature(state, 'u', 'p1', power, power, ['U']);
    creature(state, 'b', 'p1', power, power, ['B']);
    addObject(state, {
      id: 'sovereign', instanceId: 'i-sovereign', cardId: 'synthetic-sovereign',
      controllerId: 'p1', ownerId: 'p1', zone: 'library', kind: 'creature',
      power: 4, toughness: 4, manaCost: 6, abilities: [], keywords: [],
      subtypes: [], types: ['Creature'], colors: ['W', 'U', 'B'],
      cardName: 'Sphinx Sovereign',
    });
    const row = [...scores(state)].find(([label]) => String(label).startsWith('activate_ability(her#0)'));
    return row?.[1];
  };
  const tanie = trial(1);
  const drogie = trial(3);
  assert.ok(Number.isFinite(tanie) && Number.isFinite(drogie), 'oferta aktywacji w wycenie');
  assert.ok(tanie > drogie, `oddanie trzech 1/1 jest tańsze niż trzech 3/3 (${tanie} vs ${drogie})`);
  assert.ok(drogie < 0, `trzy 3/3 za jednego 4/4 to strata (${drogie})`);
});

test('PMSSB-86/7: Sphinx\'s Herald — bez karty w bibliotece aktywacja jest jałowa', () => {
  const state = scene({ lands: ['basic-island', 'basic-plains', 'basic-swamp'], mana: 4, color: 'U' });
  real(state, 'her', 'sphinxs-herald');
  creature(state, 'w', 'p1', 1, 1, ['W']);
  creature(state, 'u', 'p1', 1, 1, ['U']);
  creature(state, 'b', 'p1', 1, 1, ['B']);
  const row = [...scores(state)].find(([label]) => String(label).startsWith('activate_ability(her#0)'));
  assert.ok(row?.[1] < 0, `tutor bez celu w bibliotece (${row?.[1]})`);
});

test('PMSSB-86/8: pokrętła kosztu kolorowego są jawne', () => {
  assert.equal(DEFAULT_HEURISTIC_PARAMS.coloredSacrificeCostWeight, 1);
  assert.equal(DEFAULT_HEURISTIC_PARAMS.coloredSacrificeCardLoss, 3);
});
