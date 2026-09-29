import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

// PMSSB-21 (mikro-pętla, 2026-09-29) — `resolve_opponent_target`:
// Cuombajj Witches (CMR) „{T}: This creature deals 1 damage to any target and
// 1 damage to any target of an opponent's choice" — drugi cel wskazuje
// przeciwnik (CR 601.2c), a aktywacja czeka na jego decyzję przed zapłatą
// kosztów. Bot w tej decyzji jest WYBIERAJĄCYM (przeciwnikiem aktywującego).
//
// Pomiar PRZED (tools/pmssb21-cuombajj-sonda.mjs; audyt remisów --gry=60:
// 190/190 remisów rozróżnialnych — największy klaster poza rodzinami
// POKRYTYMI): gałąź „wrogi stwór, który OCALA" miała gołą stałą 30, więc wybór
// między ocalałymi celami był arbitralny (pierwsza oferta enumeracji silnika).
//
// Fala R1: dopłata za zagrożenie celu — baza 30 (kotwica M429: „najsłabszy
// realny wariant = dawna wartość", a nowy wymiar to DOPŁATA), + 0,5 ×
// (moc·2 + wytrzymałość) z limitem 15. Gałęzie dobicia (100 + 2·moc), własnego
// stwora i gracza zostają bez zmian; `opponentTargetThreatWeight` ×0
// przywraca dawny remis (kotwica anty-over-fix).

const REGISTRY = createCardRegistry();

function putCreature(state, id, controllerId, power, toughness) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `x-${id}`, controllerId, ownerId: controllerId,
    zone: 'battlefield', kind: 'creature', power, toughness, manaCost: 2,
    abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

/** Stan: p1 aktywuje Cuombajj; p2 (bot) wskazuje DRUGI cel. */
function setup({ foes = [], mine = [] } = {}) {
  const state = createGameState({ seed: 21, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  for (const pid of ['p1', 'p2']) {
    for (let i = 0; i < 20; i++) {
      addObject(state, {
        id: `lib-${pid}-${i}`, instanceId: `i-lib-${pid}-${i}`, cardId: 'basic-forest',
        controllerId: pid, ownerId: pid, zone: 'library', kind: 'land', power: 0,
        toughness: 0, manaCost: 0, abilities: [], keywords: [], subtypes: ['Forest'],
        types: ['Basic', 'Land'], colors: ['G'],
      });
    }
  }
  addObject(state, {
    id: 'witch', instanceId: 'i-witch', cardId: 'cuombajj-witches',
    controllerId: 'p1', ownerId: 'p1', zone: 'battlefield',
    ...gameObjectDataOf(REGISTRY.get('cuombajj-witches')),
  });
  state.objects.set('witch', Object.freeze({
    ...state.objects.get('witch'), summoningSickness: false,
  }));
  for (const foe of foes) putCreature(state, foe.id, 'p1', foe.power, foe.toughness);
  for (const own of mine) putCreature(state, own.id, 'p2', own.power, own.toughness);
  return state;
}

/** Aktywuje czarownicę (p1) i zwraca oferty bota (p2) posortowane malejąco. */
function offers(cfg, params = undefined) {
  const state = setup(cfg);
  const result = execute(state, {
    type: 'activate_ability', playerId: 'p1', objectId: 'witch', abilityIndex: 0, targets: ['p2'],
  });
  assert.ok(result?.ok !== false, `aktywacja odrzucona: ${JSON.stringify(result)}`);
  assert.equal(state.pendingOpponentTarget?.playerId, 'p2', 'decyzję wskazuje p2');
  const bot = createHeuristicBot({ seed: 9, ...(params ? { params } : {}) });
  const choice = bot.chooseCommand(playerView(state, 'p2'), {});
  const options = (bot.trace().at(-1)?.options ?? [])
    .filter((o) => o.cmd.startsWith('resolve_opponent_target'))
    .sort((a, b) => b.score - a.score);
  return { choice, options, state };
}

const scoreOf = (options, id) => {
  const found = options.find((o) => o.cmd === `resolve_opponent_target(${id})`);
  assert.ok(found, `brak oferty dla ${id}: ${options.map((o) => o.cmd).join(' | ')}`);
  return found.score;
};

test('PMSSB-21/S01: wśród ocalałych celów wygrywa największe zagrożenie', () => {
  const { choice, options } = offers({
    foes: [{ id: 'big', power: 4, toughness: 4 }, { id: 'small', power: 1, toughness: 3 }],
  });
  // Kotwica M429: baza 30 + 0,5 × (moc·2 + wytrzymałość) → 4/4 = 36, 1/3 = 32,5.
  assert.equal(scoreOf(options, 'big'), 36);
  assert.equal(scoreOf(options, 'small'), 32.5);
  assert.equal(choice.targetId, 'big', 'dawniej: pierwsza oferta enumeracji');
});

test('PMSSB-21/S02: dopłata za zagrożenie ma limit (cap)', () => {
  const { options } = offers({ foes: [{ id: 'huge', power: 12, toughness: 12 }] });
  // 0,5 × (12·2 + 12) = 18 → limit 15 → 45 (nadal dalece poniżej 108 dobicia).
  assert.equal(scoreOf(options, 'huge'), 45);
});

test('PMSSB-21/S03: próg dobicia i gałęzie własny/gracz bez zmian', () => {
  const lethal = offers({
    foes: [{ id: 'fragile', power: 1, toughness: 1 }, { id: 'tank', power: 3, toughness: 3 }],
  });
  assert.equal(scoreOf(lethal.options, 'fragile'), 102, '100 + 2·moc — kotwica M130');
  assert.equal(lethal.choice.targetId, 'fragile');
  assert.equal(scoreOf(lethal.options, 'tank'), 34.5);
  const mixed = offers({
    foes: [{ id: 'big', power: 4, toughness: 4 }], mine: [{ id: 'own', power: 2, toughness: 2 }],
  });
  assert.equal(scoreOf(mixed.options, 'own'), 6, 'własny 2/2: 10 − (moc+wytrz) — kotwica M130');
  assert.equal(scoreOf(mixed.options, 'p1'), 15, 'gracz-wróg: 15 — kotwica M130');
  assert.equal(mixed.choice.targetId, 'big');
});

test('PMSSB-21/S04: waga ×0 przywraca dawny remis (kotwica anty-over-fix M429)', () => {
  const cfg = { foes: [{ id: 'big', power: 4, toughness: 4 }, { id: 'small', power: 1, toughness: 3 }] };
  const zero = offers(cfg, { opponentTargetThreatWeight: 0 });
  assert.equal(scoreOf(zero.options, 'big'), 30);
  assert.equal(scoreOf(zero.options, 'small'), 30);
  // Wybór wraca do pierwszej oferty enumeracji (enumeracja: stworzenia
  // aktywującego w kolejności wejścia → czarownica).
  assert.equal(zero.choice.targetId, 'witch');
  // Dołożenie wymiaru jest wyłącznie dopłatą do ocalałych celów: kotwica
  // ocalałej czarownicy (1/3) rośnie z 30 → 32,5, a nie spada.
  const full = offers(cfg);
  assert.ok(scoreOf(full.options, 'witch') > 30);
});

test('PMSSB-21/S05: identyczne cele nadal remisują (remis uczciwy, L5)', () => {
  const { options } = offers({
    foes: [{ id: 'a', power: 1, toughness: 3 }, { id: 'b', power: 1, toughness: 3 }],
  });
  assert.equal(scoreOf(options, 'a'), scoreOf(options, 'b'));
});
