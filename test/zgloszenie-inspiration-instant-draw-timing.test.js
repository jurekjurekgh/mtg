// Zgłoszenie właściciela 2026-11-08e (Inspiration): instant-draw nie może
// być rzucany „jak tylko mana z untapu” we własnym podtrzymaniu ani w
// innych oknach, w których mana jest potrzebna na czary/odpowiedzi.
// Polityka po deskryptorze (ADR 0002): czysty instantowy dobór dla siebie,
// rzucany z ręki, czeka na end step przeciwnika (CR 117.1a, 513.1) i nie
// wydaje many kontestowanej przez inny rzucalny czar. Village Rites
// (koszt dodatkowy), mieszane ridery, zdolności i triggery są POZA klasą.
//
// Piny ID/1–ID/15. RED przed fixem: ID/1, ID/2, ID/3, ID/4, ID/7, ID/15.
// Kontrole anty-over-fix (GREEN przed i po): exact piny PMSSB3/A4,
// Village Rites, Curate, Civilized Scholar, sorcery Reunion, deck-out.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function fillLibrary(state, n, controllerId = 'p1') {
  for (let i = 0; i < n; i += 1) {
    addObject(state, {
      id: `lib-${controllerId}-${i}`, instanceId: `i-lib-${controllerId}-${i}`,
      cardId: `x-lib-${controllerId}-${i}`, controllerId, ownerId: controllerId, zone: 'library',
      kind: 'creature', power: 0, toughness: 0, manaCost: 2,
      abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [],
      cardName: `lib-${controllerId}-${i}`,
    });
  }
}

function put(state, id, cardId, controllerId, zone, over = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `katalog ma ${cardId}`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], ...over,
  });
  if (zone === 'battlefield') {
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false, ...over }));
  }
  return state.objects.get(id);
}

function lands(state, count, cardId = 'basic-island', controllerId = 'p1') {
  for (let i = 0; i < count; i += 1) put(state, `land-${controllerId}-${i}`, cardId, controllerId, 'battlefield');
}

function scene(step, { active = 'p1', priority = 'p1', ownLib = 20, foeLib = 20, islandCount = 4 } = {}) {
  const state = createGameState({ seed: 1108, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, active);
  state.turn.activePlayerId = active;
  state.turn.priorityPlayerId = priority;
  state.turn.number = 6;
  fillLibrary(state, ownLib, 'p1');
  fillLibrary(state, foeLib, 'p2');
  lands(state, islandCount);
  return state;
}

function decide(state, params) {
  const view = playerView(state, 'p1');
  const bot = createHeuristicBot({ seed: 1108, ...(params ? { params } : {}) });
  const choice = bot.chooseCommand(view, {});
  const options = bot.trace().at(-1).options;
  const scoreOf = (frag) => options.find((o) => o.cmd.includes(frag))?.score;
  return { choice, options, scoreOf, view };
}

function inspirationScene(step, opts = {}) {
  const state = scene(step, opts);
  put(state, 'ins', 'inspiration', 'p1', 'hand');
  return state;
}

// --- RED: okna, w których bot przed fixem palił dobór ----------------------

test('ID/1: własny upkeep — bot NIE rzuca Inspiration, choć ma manę z untapu', () => {
  const state = inspirationScene('upkeep');
  put(state, 'big', 'armored-skaab', 'p1', 'hand');
  const { choice, scoreOf } = decide(state);
  assert.notEqual(choice.type, 'cast_spell', `bot rzucił dobór w upkeepie: ${JSON.stringify(choice)}`);
  assert.ok(scoreOf('cast_spell(ins->p1)') < 0, 'wariant self musi zejść pod pass');
});

test('ID/2: własny draw step — bot NIE rzuca Inspiration przed główną fazą', () => {
  const state = inspirationScene('draw');
  const { choice, scoreOf } = decide(state);
  assert.notEqual(choice.type, 'cast_spell', `bot rzucił dobór w draw: ${JSON.stringify(choice)}`);
  assert.ok(scoreOf('cast_spell(ins->p1)') < 0);
});

test('ID/3: upkeep przeciwnika — bot trzyma dobór na jego end step', () => {
  const state = inspirationScene('upkeep', { active: 'p2', priority: 'p1' });
  const { choice, scoreOf } = decide(state);
  assert.notEqual(choice.type, 'cast_spell', `bot rzucił dobór w upkeepie wroga: ${JSON.stringify(choice)}`);
  assert.ok(scoreOf('cast_spell(ins->p1)') < 0);
});

test('ID/4: main1 przeciwnika — bot nie wydaje many przed jego końcówką', () => {
  const state = inspirationScene('main1', { active: 'p2', priority: 'p1' });
  const { choice, scoreOf } = decide(state);
  assert.notEqual(choice.type, 'cast_spell', `bot rzucił dobór w mainie wroga: ${JSON.stringify(choice)}`);
  assert.ok(scoreOf('cast_spell(ins->p1)') < 0);
});

test('ID/7: własna main1 z innym rzucalnym czarem — mana kontestowana, dobór trzymany', () => {
  const state = inspirationScene('main1');
  put(state, 'big', 'armored-skaab', 'p1', 'hand');
  const { choice, scoreOf } = decide(state);
  assert.ok(scoreOf('cast_spell(ins->p1)') < 0,
    `Inspiration nadal dodatnie przy konflikcie many: ${scoreOf('cast_spell(ins->p1)')}`);
  assert.notEqual(choice.objectId, 'ins', 'bot nie może wydać many na dobór kosztem Skaaba');
});

test('ID/15: syntetyczny nośnik klasy (bez nazwy Inspiration) też czeka na EOT wroga', () => {
  const mk = (step, active = 'p1') => {
    const state = scene(step, { active, priority: 'p1', islandCount: 1 });
    addObject(state, {
      id: 'syn', instanceId: 'i-syn', cardId: 'synthetic-instant-draw', controllerId: 'p1', ownerId: 'p1',
      zone: 'hand', kind: 'spell', manaCost: 1, types: ['Instant'], colors: [],
      abilities: [], keywords: [], subtypes: [],
      spell: { timing: 'instant', targets: [], effects: [{ type: 'draw_cards', amount: 1 }] },
    });
    return state;
  };
  const upkeep = decide(mk('upkeep'));
  assert.notEqual(upkeep.choice.type, 'cast_spell', 'syntetyk nie jest przypadkiem specjalnym po nazwie');
  assert.ok(upkeep.scoreOf('cast_spell(syn->)') < 0);
  const eot = decide(mk('end', 'p2'));
  assert.equal(eot.choice.type, 'cast_spell');
  assert.equal(eot.choice.objectId, 'syn');
});

// --- GREEN przed i po: okno docelowe i exact piny --------------------------

test('ID/5: end step przeciwnika — bot rzuca Inspiration w siebie (21 = 11 + 10)', () => {
  const state = inspirationScene('end', { active: 'p2', priority: 'p1' });
  const { choice, scoreOf } = decide(state);
  assert.equal(choice.type, 'cast_spell');
  assert.equal(choice.objectId, 'ins');
  assert.deepEqual(choice.targets, ['p1']);
  assert.equal(scoreOf('cast_spell(ins->p1)'), 21);
});

test('ID/6: własna main1 bez konkurencji — exact pin PMSSB3/A4 zostaje (11, rzut)', () => {
  const state = inspirationScene('main1');
  const { choice, scoreOf } = decide(state);
  assert.equal(choice.type, 'cast_spell');
  assert.equal(choice.objectId, 'ins');
  assert.deepEqual(choice.targets, ['p1']);
  assert.equal(scoreOf('cast_spell(ins->p1)'), 11);
});

test('ID/8: dość many na oba czary — brak fikcyjnego konfliktu (11 bez kary)', () => {
  const state = inspirationScene('main1', { islandCount: 7 });
  put(state, 'big', 'armored-skaab', 'p1', 'hand');
  const { scoreOf } = decide(state);
  assert.equal(scoreOf('cast_spell(ins->p1)'), 11,
    '7 many = 4 (Inspiration) + 3 (Skaab): dobór nie blokuje innego czaru');
});

test('ID/9: sorcery-draw nie czeka — Reunion main1 = main2 = 17', () => {
  const mk = (step) => {
    const state = scene(step, { islandCount: 0 });
    lands(state, 4, 'basic-mountain');
    put(state, 'reu', 'cathartic-reunion', 'p1', 'hand');
    for (const [id, p, t, c] of [['fA', 1, 1, 1], ['fB', 2, 2, 2], ['fC', 5, 5, 5]]) {
      addObject(state, {
        id, instanceId: `i-${id}`, cardId: `x-${id}`, controllerId: 'p1', ownerId: 'p1', zone: 'hand',
        kind: 'creature', power: p, toughness: t, manaCost: c,
        abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [], cardName: id,
      });
    }
    return state;
  };
  assert.equal(decide(mk('main1')).scoreOf('cast_spell(reu'), 17);
  assert.equal(decide(mk('main2')).scoreOf('cast_spell(reu'), 17);
});

test('ID/10: dobór dla przeciwnika zostaje ujemny (−13), także na EOT wroga', () => {
  const state = inspirationScene('end', { active: 'p2', priority: 'p1' });
  const { choice, scoreOf } = decide(state);
  assert.equal(scoreOf('cast_spell(ins->p2)'), -13);
  assert.notDeepEqual(choice.targets, ['p2'], 'bot nie dobiera kart przeciwnikowi');
});

test('ID/11: deck-out — biblioteka 5, Inspiration nie jest rzucane (main i upkeep)', () => {
  for (const step of ['main1', 'upkeep']) {
    const state = inspirationScene(step, { ownLib: 5 });
    const { choice } = decide(state);
    assert.notEqual(choice.type, 'cast_spell', `dobór 5→3 to strefa kary (${step}): ${JSON.stringify(choice)}`);
  }
});

// --- Anty-over-fix: klasy POZA zakresem zostają bitowo --------------------

test('ID/12: Village Rites (additionalCost) poza klasą — upkeep/main = 8, rzut z tokenem 1/1', () => {
  for (const step of ['upkeep', 'main1']) {
    const state = scene(step, { islandCount: 0 });
    lands(state, 3, 'basic-swamp');
    put(state, 'rit', 'village-rites', 'p1', 'hand');
    put(state, 'tok', 'token_soldier', 'p1', 'battlefield');
    const { choice, scoreOf } = decide(state);
    assert.equal(scoreOf('cast_spell(rit->)'), 8, `Village Rites ${step} bez zmian`);
    assert.equal(choice.type, 'cast_spell');
    assert.equal(choice.sacrificeTargetId, 'tok');
  }
});

test('ID/13: Curate (surveil + draw, rider mieszany) poza klasą — upkeep/main = 44', () => {
  for (const step of ['upkeep', 'main1']) {
    const state = scene(step, { islandCount: 2 });
    put(state, 'cur', 'curate', 'p1', 'hand');
    const { scoreOf } = decide(state);
    assert.equal(scoreOf('cast_spell(cur->)'), 44, `Curate ${step} bez zmian`);
  }
});

test('ID/14: zdolność aktywowana draw/loot poza klasą — Scholar main = 4, EOT wroga = 14', () => {
  const main = scene('main1', { islandCount: 14 });
  put(main, 'sc', 'civilized-scholar', 'p1', 'battlefield');
  assert.equal(decide(main).scoreOf('activate_ability(sc'), 4);
  const eot = scene('end', { active: 'p2', priority: 'p1', islandCount: 14 });
  put(eot, 'sc', 'civilized-scholar', 'p1', 'battlefield');
  assert.equal(decide(eot).scoreOf('activate_ability(sc'), 14);
});

test('ID/16: pełny execute — upkeep pass, main1 Skaab, Inspiration zostaje w ręce', () => {
  const state = inspirationScene('upkeep');
  put(state, 'big', 'armored-skaab', 'p1', 'hand');
  const bot = createHeuristicBot({ seed: 1108 });

  const upkeepChoice = bot.chooseCommand(playerView(state, 'p1'), {});
  assert.notEqual(upkeepChoice.type, 'cast_spell', 'upkeep: trzymaj manę');
  assert.ok(execute(state, upkeepChoice).ok);

  // Przejdź priorytetami do własnej main1 (silnik, nie jumpToStep).
  for (let i = 0; i < 12 && state.turn.step !== 'main1'; i += 1) {
    const view = playerView(state, state.turn.priorityPlayerId);
    const pass = view.legalCommands.find((cmd) => cmd.type === 'pass_priority');
    assert.ok(pass, `pass_priority w ${state.turn.step}`);
    assert.ok(execute(state, pass).ok);
  }
  assert.equal(state.turn.step, 'main1');

  const mainChoice = bot.chooseCommand(playerView(state, 'p1'), {});
  assert.equal(mainChoice.type, 'cast_permanent');
  assert.equal(mainChoice.objectId, 'big');
  assert.ok(execute(state, mainChoice).ok);
  for (let i = 0; i < 20 && state.zones.stack.length > 0; i += 1) {
    const view = playerView(state, state.turn.priorityPlayerId);
    const pass = view.legalCommands.find((cmd) => cmd.type === 'pass_priority');
    assert.ok(pass);
    assert.ok(execute(state, pass).ok);
  }
  assert.ok(state.zones.hand.includes('ins'), 'Inspiration nie zostało spalone przed rzutem Skaaba');
  const skaab = [...state.objects.values()].find((o) => o.cardId === 'armored-skaab' && o.zone === 'battlefield');
  assert.ok(skaab, 'Skaab wszedł na pole bitwy');
});
