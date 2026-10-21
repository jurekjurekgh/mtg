// =============================================================================
// PMSSB-70 — nieopłacona wymiana w deklaracji ataku (remis s4011 t26).
//
// Plan: docs/plans/PLAN_2026-10-20d-pmssb70-nieoplacona-wymiana.md
//
// Problem: wycena ataku sumuje wartości per atakujący, a każdy z nich zakłada
// zabicie TEGO SAMEGO blokera. Gdy trzech atakujących „przeżyje i zabija”
// jedynego blokera, czwarty atakujący w gałęzi wymiany (`power − 1`) dokładał
// 0 — nie zabijał nikogo nowego, a ginął. Remis ex aequo: bot wybierał wariant
// z tym stworem (B) zamiast bez niego (A). Właściciel: wybór B jest bez sensu.
//
// Reguła: wymiana PONAD wolne sloty (blokery − przeżyjące zabójstwa) jest
// nieopłacona i dostaje `−P.unpaidTradeLoss` zamiast swojej wartości.
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

/** Ciało bez karty katalogu (P/T + kontrola) — wzorzec z PMSSB-33. */
function cialo(state, id, power, toughness, controllerId) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `x-${id}`, controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost: 3, abilities: [], keywords: [],
    subtypes: [], types: ['Creature'], colors: [], cardName: id,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
}

function atak(ciala, blokerzy, zyciePrzeciwnika = 20) {
  const state = createGameState({ seed: 4242, players: [{ id: 'p1' }, { id: 'p2' }] });
  for (const [id, p, t] of ciala) cialo(state, id, p, t, 'p1');
  for (const [id, p, t] of blokerzy) cialo(state, id, p, t, 'p2');
  state.players.find((pl) => pl.id === 'p2').life = zyciePrzeciwnika;
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1'; state.turn.priorityPlayerId = 'p1';
  return state;
}

/** Wybór bota + oferty po zbiorze atakujących (kolejność etykiety bez znaczenia). */
function opcje(state, params = undefined) {
  const bot = createHeuristicBot({ seed: 7, params });
  const wybrany = bot.chooseCommand(playerView(state, 'p1'), {});
  const wszystkie = bot.trace().at(-1)?.options ?? [];
  const zbior = (label) => label.replace(/^attack\[|\]$/g, '').split(',').filter(Boolean).sort().join(',');
  return {
    wybrany,
    wynik: (ids) => {
      const want = [...ids].sort().join(',');
      const o = wszystkie.find((x) => x.cmd.startsWith('attack[') && zbior(x.cmd) === want);
      assert.ok(o, `brak opcji attack[${want}] w: ${wszystkie.map((x) => x.cmd).join(' | ')}`);
      return o.score;
    },
  };
}

// Pozycja s4011 w minimalnej postaci: jedyny bloker 1/1; trzech atakujących
// przeżywa i zabija go (2/2, 1/4, 1/4), czwarty 1/1 (token) idzie w wymianę.
// Życie wroga 4: w tej pozycji A = B = 33 (remis z audytu, s4011 t26 pokazał 1033).
const S4011 = () => atak(
  [['mine81', 2, 2], ['mine91', 1, 4], ['mine108', 1, 4], ['tok', 1, 1]],
  [['foe', 1, 1]],
  4,
);

test('PMSSB-70/A (RED): s4011 — bot wybiera A (bez stwora w wymianie), nie B', () => {
  const o = opcje(S4011());
  const cmd = o.wybrany;
  assert.equal(cmd.type, 'declare_attackers');
  const wybrani = [...(cmd.attackerIds ?? [])].sort().join(',');
  assert.equal(wybrani, 'mine108,mine81,mine91'.split(',').sort().join(','),
    `bot wybrał ${wybrani}; wariant z tokenem (B) nic nie daje — musi przegrać z A`);
  assert.ok(o.wynik(['mine81', 'mine91', 'mine108']) > o.wynik(['mine81', 'mine91', 'mine108', 'tok']),
    'A ściśle wyżej niż B (token w wymianie ponad wolne sloty płaci karę)');
});

test('PMSSB-70/K1 (anty-over-fix): wymiana MIEŚCI SIĘ w wolnych slotach — pełna wartość', () => {
  // Dwa blokery 1/1. Przeżywający 2/2 zabija JEDNEGO (1 wolny slot zostaje),
  // więc wymiana tokenu 1/1 jest opłacona: 5 (przeżyje i zabija) + 0 (wymiana).
  const o = opcje(atak([['mine', 2, 2], ['tok', 1, 1]], [['f1', 1, 1], ['f2', 1, 1]]));
  assert.equal(o.wynik(['mine', 'tok']), 5, 'wymiana w wolnym slocie nie dostaje kary');
});

test('PMSSB-70/K2 (kontrola PMSSB-33/A1): pojedyncza wymiana 1/1 za 1/1 nadal 0', () => {
  const o = opcje(atak([['mine', 1, 1]], [['foe', 1, 1]]));
  assert.equal(o.wynik(['mine']), 0, 'jeden bloker, jedna wymiana — opłacona, bez zmiany');
});

test('PMSSB-70/P (pokrętło): unpaidTradeEnabled = 0 przywraca dawny remis A = B', () => {
  const o = opcje(S4011(), { unpaidTradeEnabled: 0 });
  assert.equal(o.wynik(['mine81', 'mine91', 'mine108']), o.wynik(['mine81', 'mine91', 'mine108', 'tok']),
    'bez kary wymiana tokenu dokłada 0 — stary remis (dowód, że to ta reguła)');
});

test('PMSSB-70/G (granica zakresu): dwie wymiany BEZ przeżywającego — wycena bez zmian', () => {
  // Świadoma granica poprawki: kara wyłącznie po przeżywającym zabójcy. Dwie
  // wymiany wobec jednego blokera bez przeżywającego (PMSSB-59 duo) zostają
  // przy dawnej wycenie — to osobny mechanizm, poza tą rewizją.
  const o = opcje(atak([['m1', 1, 1], ['m2', 1, 1]], [['f1', 1, 1]]));
  assert.equal(o.wynik(['m1', 'm2']), o.wynik(['m1']),
    'bez przeżywającego druga wymiana nie dostaje kary (dawna suma)');
});
