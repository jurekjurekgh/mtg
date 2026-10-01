// U5/O3 (audyt PR #146, fala 2026-10-01) — liczby wariantu Food są DANYMI
// KARTY, nie wiedzą silnika ani bota.
//
// Stan PRZED: deskryptor `sacrifice_food_choice` nie niósł ani jednej liczby,
// a „+5/+5 / +3/+3” było zaszyte w TRZECH miejscach: `effects.js` (gałąź bez
// Food), `game-state.js` (`resolve_food_choice`: `sacrificed ? 5 : 3`) i
// w bocie (`pumpDelta` + decyzja `resolve_food_choice`), wraz z progiem
// „mało życia” (10) i mnożnikiem ×2 poza `heuristic-params.js`. Klasa ADR 0002
// (silnik bez wiedzy o konkretnej karcie) + ADR 0017 (decydent nie zgaduje).
//
// Po naprawie: deskryptor karty niesie `powerIfSacrificed`/`toughnessIfSacrificed`
// oraz `powerIfKept`/`toughnessIfKept`; silnik tylko je stosuje i przenosi do
// oczekującej decyzji, a widok wystawia je decydentowi (`view.pendingFoodChoice`).
// Ten plik pilnuje: (A) kompletności danych w katalogu, (B) że SILNIK słucha
// deskryptora, (C) że WIDOK niesie oba warianty, (D) że BOT liczy z widoku
// (nie z pamięci), (E) że próg/mnożnik presji życia są pokrętłami.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

test('U5/O3/A (strażnik katalogu): każdy efekt sacrifice_food_choice niesie OBA warianty', () => {
  const braki = [];
  for (const def of REGISTRY.all()) {
    const efekty = [
      ...(def.spell?.effects ?? []),
      ...((def.spell?.modes ?? []).flatMap((m) => m.effects ?? [])),
      ...((def.abilities ?? []).flatMap((a) => a.effects ?? [])),
    ].filter((e) => e?.type === 'sacrifice_food_choice');
    for (const e of efekty) {
      for (const pole of ['powerIfSacrificed', 'toughnessIfSacrificed', 'powerIfKept', 'toughnessIfKept']) {
        if (!Number.isInteger(e[pole]) || e[pole] < 0) {
          braki.push(`${def.id}: ${pole}=${JSON.stringify(e[pole])}`);
        }
      }
    }
  }
  assert.deepEqual(braki, [], `deskryptor bez liczb = cicha zmiana siły efektu: ${braki.join(', ')}`);
});

// --- B: silnik słucha deskryptora -------------------------------------------

function game() {
  const state = createGameState({ seed: 51, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  return state;
}

/** Czar syntetyczny (ADR 0029 — bez dopisywania karty do katalogu). */
function putSyntheticSpell(state, id, controllerId, effects, { mana = 2, zone = 'hand' } = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `x-${id}`, controllerId, ownerId: controllerId, zone,
    kind: 'spell', manaCost: mana, spell: { timing: 'instant', targets: [{ type: 'creature' }], effects },
    types: [], subtypes: [], colors: [], abilities: [], keywords: [],
  });
}

function putCreature(state, id, controllerId, power, toughness) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `x-${id}`, controllerId, ownerId: controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost: 2, types: ['Creature'], subtypes: [], colors: [],
    abilities: [], keywords: [],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
}

function putFood(state, id, controllerId) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'food-token', controllerId, ownerId: controllerId, zone: 'battlefield',
    kind: 'artifact', types: ['Artifact'], subtypes: ['Food'], colors: [], abilities: [], keywords: [],
  });
}

function passBoth(state) {
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
}

/** Rzuca czar syntetyczny i rozstrzyga decyzję Food (`sacrifice` albo nie). */
function rozegraj(sacrifice, { powerIfSacrificed = 5, toughnessIfSacrificed = 5, powerIfKept = 3, toughnessIfKept = 3 } = {}) {
  const state = game();
  addMana(state, 'p1', 6);
  putCreature(state, 'cel', 'p1', 2, 2);
  putFood(state, 'food1', 'p1');
  putSyntheticSpell(state, 'czar', 'p1', [{
    type: 'sacrifice_food_choice',
    powerIfSacrificed, toughnessIfSacrificed, powerIfKept, toughnessIfKept,
  }]);
  const rzut = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'czar', targets: ['cel'] });
  assert.equal(rzut.ok, true, JSON.stringify(rzut));
  passBoth(state);
  const pendingView = playerView(state, 'p1').pendingFoodChoice;
  assert.ok(pendingView, 'decyzja Food powinna być otwarta');
  const wynik = execute(state, { type: 'resolve_food_choice', playerId: 'p1', sacrifice, creatureId: 'cel' });
  assert.equal(wynik.ok, true, JSON.stringify(wynik));
  const cel = state.objects.get('cel');
  return { pendingView, power: cel.powerModifier, toughness: cel.toughnessModifier };
}

test('U5/O3/B1: deskryptor steruje silnikiem — poświęcenie daje wariant z karty (+5/+5)', () => {
  const r = rozegraj(true);
  assert.deepEqual({ power: r.power, toughness: r.toughness }, { power: 5, toughness: 5 });
});

test('U5/O3/B2: bez poświęcenia silnik stosuje wariant „Otherwise” (+3/+3)', () => {
  const r = rozegraj(false);
  assert.deepEqual({ power: r.power, toughness: r.toughness }, { power: 3, toughness: 3 });
});

test('U5/O3/B3: INNE liczby w deskryptorze = inne wzmocnienie (syntetyk +4/+4 vs +1/+1)', () => {
  const r = rozegraj(true, { powerIfSacrificed: 4, toughnessIfSacrificed: 4, powerIfKept: 1, toughnessIfKept: 1 });
  assert.deepEqual({ power: r.power, toughness: r.toughness }, { power: 4, toughness: 4 },
    'gdyby silnik znał „5” na sztywno, syntetyk dałby +5/+5');
});

test('U5/O3/B4: bez Food silnik stosuje z deskryptora wariant „Otherwise” (auto, bez decyzji)', () => {
  const state = game();
  addMana(state, 'p1', 6);
  putCreature(state, 'cel', 'p1', 2, 2);
  // Brak Food na polu bitwy — ścieżka automatyczna w `effects.js`.
  putSyntheticSpell(state, 'czar', 'p1', [{
    type: 'sacrifice_food_choice', powerIfSacrificed: 9, toughnessIfSacrificed: 9, powerIfKept: 1, toughnessIfKept: 1,
  }]);
  execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'czar', targets: ['cel'] });
  passBoth(state);
  assert.equal(playerView(state, 'p1').pendingFoodChoice, null, 'bez Food nie ma decyzji');
  const cel = state.objects.get('cel');
  assert.deepEqual({ power: cel.powerModifier, toughness: cel.toughnessModifier }, { power: 1, toughness: 1 },
    'gdyby silnik znał „3” na sztywno, syntetyk dałby +3/+3');
});

// --- C: widok niesie oba warianty decydentowi -------------------------------

test('U5/O3/C: widok decydenta niesie oba warianty, przeciwnik ich nie widzi', () => {
  const state = game();
  addMana(state, 'p1', 6);
  putCreature(state, 'cel', 'p1', 2, 2);
  putFood(state, 'food1', 'p1');
  putSyntheticSpell(state, 'czar', 'p1', [{
    type: 'sacrifice_food_choice', powerIfSacrificed: 7, toughnessIfSacrificed: 6, powerIfKept: 2, toughnessIfKept: 1,
  }]);
  execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'czar', targets: ['cel'] });
  passBoth(state);
  const moj = playerView(state, 'p1').pendingFoodChoice;
  assert.deepEqual(moj, {
    creatureId: 'cel',
    sacrifice: { power: 7, toughness: 6 },
    keep: { power: 2, toughness: 1 },
  });
  assert.equal(playerView(state, 'p2').pendingFoodChoice, null, 'to decyzja p1 — widok p2 bez danych');
});

// --- D: bot liczy z widoku, nie z pamięci -----------------------------------

/** Stan z otwartą decyzją Food (kształt stanu silnika, jak w PMSSB-22). */
function stanDecyzji({ powerIfSacrificed, toughnessIfSacrificed, powerIfKept, toughnessIfKept, blocker }) {
  const state = createGameState({ seed: 52, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'declare_blockers', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  putCreature(state, 'mine', 'p2', 1, 1);
  putCreature(state, 'foe', 'p1', blocker, blocker);
  putFood(state, 'food1', 'p2');
  state.combat = { attackingPlayerId: 'p2', attackers: ['mine'], blockers: new Map([['mine', ['foe']]]), blockedAttackers: new Set(['mine']) };
  state.pendingFoodChoice = {
    playerId: 'p2', creatureId: 'mine', hasFood: true, foodIds: ['food1'], restorePriorityTo: 'p2',
    pumpIfSacrificed: { power: powerIfSacrificed, toughness: toughnessIfSacrificed },
    pumpIfKept: { power: powerIfKept, toughness: toughnessIfKept },
  };
  return state;
}

function wycena(state, params = undefined) {
  const bot = createHeuristicBot({ seed: 52, ...(params ? { params } : {}) });
  const choice = bot.chooseCommand(playerView(state, 'p2'), {});
  const options = bot.trace().at(-1)?.options ?? [];
  const znajdz = (cmd) => {
    const found = options.find((o) => o.cmd === cmd);
    assert.ok(found, `brak oferty ${cmd}: ${options.map((o) => o.cmd).join(' | ')}`);
    return found.score;
  };
  return { choice, score: znajdz };
}

test('U5/O3/D1: decyzja bota zależy od liczb z WIDOKU (nie od stałych 5/3)', () => {
  // Bloker 6/6: +5/+5 (→6/6) zmienia wynik walki, +3/+3 (→4/4) nie.
  const karta = wycena(stanDecyzji({ powerIfSacrificed: 5, toughnessIfSacrificed: 5, powerIfKept: 3, toughnessIfKept: 3, blocker: 6 }));
  assert.equal(karta.score('resolve_food_choice(sacrifice)'), 55, 'wariant karty: 30 + foodDecisiveBonus 25');
  // TEN SAM stan, inne liczby w deskryptorze: +4/+4 (→5/5) NIE zmienia wyniku.
  const syntetyk = wycena(stanDecyzji({ powerIfSacrificed: 4, toughnessIfSacrificed: 4, powerIfKept: 1, toughnessIfKept: 1, blocker: 6 }));
  assert.equal(syntetyk.score('resolve_food_choice(sacrifice)'), 30,
    'gdyby bot znał „5/3” na sztywno, dostałby 55 mimo słabszego wariantu');
});

test('U5/O3/D2: premia „niezablokowany napastnik” = RÓŻNICA mocy wariantów z widoku', () => {
  const state = stanDecyzji({ powerIfSacrificed: 4, toughnessIfSacrificed: 4, powerIfKept: 1, toughnessIfKept: 1, blocker: 6 });
  state.combat = { attackingPlayerId: 'p2', attackers: ['mine'], blockers: new Map(), blockedAttackers: new Set() };
  const r = wycena(state);
  assert.equal(r.score('resolve_food_choice(sacrifice)'), 33, '30 + różnica mocy 4 − 1 = 3 obrażenia w twarz');
});

// --- E: próg i mnożnik presji życia to pokrętła -----------------------------

test('U5/O3/E: próg i mnożnik „mało życia” są pokrętłami, nie stałymi w kodzie', () => {
  const stan = () => {
    const s = stanDecyzji({ powerIfSacrificed: 5, toughnessIfSacrificed: 5, powerIfKept: 3, toughnessIfKept: 3, blocker: 6 });
    s.players.splice(s.players.findIndex((p) => p.id === 'p2'), 1, { ...s.players.find((p) => p.id === 'p2'), life: 8 });
    return s;
  };
  assert.equal(wycena(stan()).score('resolve_food_choice(keep)'), 54, '8 życia ≤ próg 10 → 12 × 2');
  assert.equal(wycena(stan(), { foodKeepLowLifeThreshold: 0 }).score('resolve_food_choice(keep)'), 42,
    'próg 0 wyłącza podwojenie (dawna twarda stała 10 musi być tunowalna)');
  assert.equal(wycena(stan(), { foodKeepLowLifeMultiplier: 1 }).score('resolve_food_choice(keep)'), 42,
    'mnożnik 1 = brak dopłaty pod presją');
});
