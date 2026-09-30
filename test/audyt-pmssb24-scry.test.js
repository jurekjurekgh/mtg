import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

// PMSSB-24 (metoda M429) — rodzina FILTROWANIA WIERZCHU BIBLIOTEKI
// (`scry` 12 kart + `surveil` 5; rodzeństwo: look/clash/library_placement).
//
// Pomiar PRZED (sonda /home/user/scratch/pmssb24-scry-przed.mjs + /tmp/p8.mjs,
// tabela w planie docs/plans/PLAN_2026-09-30a-pmssb24-scry.md):
//   F1 — kolejność kart na wierzchu NIE była wyceniana. Silnik oferuje
//     permutacje (`game-state.js:7149-7160`, CR 701.22a „the rest on top in
//     any order", CR 701.25), a `resolve_scry` liczył tylko `bottomIds`:
//     6 permutacji keep-all remisowało po 20 i wybór padał na pierwszą
//     ofertę. Przy surveil bonus `keepsOrder ? 1 : 0` premiował kolejność
//     ORYGINALNĄ (21 vs 20), więc świadome ułożenie przegrywało.
//     Skutek uboczny: etykieta śladu nie kodowała `topOrder` — 16 wariantów
//     scry dawało 8 etykiet (klasa L34/L40, ta sama co M203/2).
//   F2 — deck-out (CR 104.3c): 26 pkt za odłożenie landu przy bibliotece
//     2 kart = 26 przy 12 kartach.
//   F3 — surveil kładzie kartę do GROBU (CR 701.25): 25 pkt z delve w ręce
//     = 25 bez (stały `MILL_CAUTION`).
//   F4 — kontekst ręki: 12/12 przy ręce pustej = 12/12 przy czterech kartach.
//   F5 — `revealTopGainLife` (Sifter Wurm: reveal wierzchu + życie równe
//     mana value) nie dociera do widoku; najlepszy wariant bota odkładał
//     kartę {5}, czyli dokładnie tę, której reveal chciał na wierzchu.
//
// Fala A (ten plik): wycena kolejności — wspólny `libraryOrderValue`
// w obu decyzjach, etykieta rozróżniająca permutacje. Kotwica anty-over-fix
// (M429): `scryOrderWeight: 0` przywraca wartości sprzed fali, a decyzja
// o PODZBIORZE odłożonym jest bez zmian (26/20 jak w pomiarze PRZED).

const REGISTRY = createCardRegistry();

/** Rząd bez kolejności (Fala A mierzy wyłącznie człon kolejności). */
const KOLEJNOSC_OFF = { scryOrderWeight: 0 };

function putCard(state, id, cardId, controllerId, zone = 'hand') {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness, manaCost: data.manaCost,
    spell: data.spell, abilities: data.abilities ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], types: def.types ?? [], colors: data.colors ?? [],
  });
  return state.objects.get(id);
}

/**
 * Stół z otwartą decyzją przeglądu wierzchu.
 * `top` — karty od wierzchu (kolejność przeglądania, CR 701.22).
 */
function base({ top, kind = 'scry', hand = [], step = 'main1', lands = 0, extra = 8 } = {}) {
  const state = createGameState({ seed: 24, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', 12);
  for (const [i, cardId] of hand.entries()) putCard(state, `h${i}`, cardId, 'p2');
  for (let i = 0; i < lands; i += 1) putCard(state, `land${i}`, 'basic-forest', 'p2', 'battlefield');
  const topIds = top.map((cardId, i) => { putCard(state, `t${i}`, cardId, 'p2', 'library'); return `t${i}`; });
  for (let i = 0; i < extra; i += 1) putCard(state, `lib${i}`, 'highland-game', 'p2', 'library');
  if (kind === 'scry') state.pendingScry = { playerId: 'p2', objectIds: topIds, restorePriorityTo: 'p2' };
  else state.pendingSurveil = { playerId: 'p2', objectIds: topIds };
  return { state, topIds };
}

function decide(state, params = undefined) {
  const bot = createHeuristicBot({ seed: 99, ...(params ? { params } : {}) });
  const choice = bot.chooseCommand(playerView(state, 'p2'), {});
  return { choice, options: bot.trace().at(-1)?.options ?? [] };
}

function scoreOf(state, etykieta, params = undefined) {
  const { options } = decide(state, params);
  const found = options.find((o) => o.cmd === etykieta);
  assert.ok(found, `brak opcji ${etykieta} w: ${options.map((o) => o.cmd).join(' | ')}`);
  return found.score;
}

// ---------------------------------------------------------------------------
// F1 — kolejność kart na wierzchu jest wyceniana (była remisem).
// ---------------------------------------------------------------------------

test('PMSSB-24/A1: scry 2 — tani stwór wyżej jest warty więcej niż układ pierwotny', () => {
  // Wierzch: [{5} Rage of Purphoros, {2} Highland Game 2/1], zero lądów.
  // keep: czar −3 (koszt 5 > zasięg+2), stwór +8. Liczą się tylko karty,
  // które chcemy dobrać, więc zysk z przestawienia = (1−0,6)·8 = 3,2 pkt:
  // 20 + 3,2 = 23,2 (PRZED: obie permutacje remisowały po 20).
  // 23,2 > 23 za odłożenie czaru na spód — trzymanie karty, która będzie
  // grywalna za dwie-trzy tury, bije pozbycie się jej na ~30 dobrań.
  const { state } = base({ top: ['rage-of-purphoros', 'highland-game'] });
  assert.equal(scoreOf(state, 'resolve_scry(keep;order:t1+t0)'), 23.2);
  assert.equal(scoreOf(state, 'resolve_scry(keep)'), 20);
  assert.equal(scoreOf(state, 'resolve_scry(bottom:t0)'), 23);
});

test('PMSSB-24/A1b: kolejność rozstrzyga też między DWIEMA chcianymi kartami', () => {
  // Przy 3 lądach: Highland Game 2/1 keep 9, Illusory Demon 4/3 keep 12.
  // Przestawienie silniejszej karty na wierzch: 20 + (1−0,6)·(12−9) = 21,2.
  // Żaden wariant z odkładaniem nie jest blisko (11 / 8 / −1) — reguła nie
  // działa kosztem decyzji o podzbiorze.
  const { state } = base({ top: ['highland-game', 'illusory-demon'], lands: 3 });
  assert.equal(scoreOf(state, 'resolve_scry(keep;order:t1+t0)'), 21.2);
  assert.equal(scoreOf(state, 'resolve_scry(keep)'), 20);
  assert.equal(scoreOf(state, 'resolve_scry(bottom:t0)'), 11);
  assert.equal(scoreOf(state, 'resolve_scry(bottom:t1)'), 8);
});

test('PMSSB-24/A2 (anty-over-fix): scryOrderWeight ×0 przywraca dawny remis', () => {
  const { state } = base({ top: ['rage-of-purphoros', 'highland-game'] });
  assert.equal(scoreOf(state, 'resolve_scry(keep;order:t1+t0)', KOLEJNOSC_OFF), 20);
  assert.equal(scoreOf(state, 'resolve_scry(keep)', KOLEJNOSC_OFF), 20);
});

test('PMSSB-24/A3: surveil — ułożenie lepszej karty wyżej wygrywa z kolejnością pierwotną', () => {
  // PRZED: 21 (oryginalna) vs 20 (odwrócona) — bonus `keepsOrder` karał
  // świadome ułożenie. PO: ta sama wycena co przy scry (CR 701.25 „in any
  // order"), więc ułożenie wygrywa 23,2 vs 20.
  const { state } = base({ top: ['rage-of-purphoros', 'highland-game'], kind: 'surveil' });
  assert.equal(scoreOf(state, 'resolve_surveil(keep;order:t1+t0)'), 23.2);
  assert.equal(scoreOf(state, 'resolve_surveil(keep)'), 20);
  // Z wyłączoną wagą oba warianty wracają do 20 — dawne +1 za kolejność
  // oryginalną zniknęło świadomie (to ono blokowało lepsze ułożenie).
  assert.equal(scoreOf(state, 'resolve_surveil(keep;order:t1+t0)', KOLEJNOSC_OFF), 20);
});

test('PMSSB-24/A4: bot WYBIERA wariant z lepszą kartą na wierzchu (nie pierwszą ofertę)', () => {
  const { state } = base({ top: ['rage-of-purphoros', 'highland-game'] });
  const { choice } = decide(state);
  assert.equal(choice.type, 'resolve_scry');
  assert.deepEqual(choice.bottomIds ?? [], [], 'żadna karta nie idzie na spód');
  assert.deepEqual(choice.topOrder, ['t1', 't0'],
    `tani stwór ma leżeć wyżej: ${JSON.stringify(choice)}`);
});

test('PMSSB-24/A5: etykieta śladu rozróżnia permutacje (16 wariantów = 16 etykiet)', () => {
  // PRZED: 16 wariantów scry dawało 8 etykiet — audyt remisów widział remisy
  // tam, gdzie są różne decyzje (klasa L34/L40).
  const { state } = base({ top: ['rage-of-purphoros', 'highland-game', 'secluded-steppe'] });
  const { options } = decide(state);
  const scry = options.filter((o) => String(o.cmd).startsWith('resolve_scry'));
  assert.equal(scry.length, new Set(scry.map((o) => o.cmd)).size,
    `etykiety muszą być unikalne: ${scry.map((o) => o.cmd).join(' | ')}`);
});

test('PMSSB-24/A6 (kotwica): decyzja o podzbiorze odłożonym jest BEZ zmian', () => {
  // Pomiar PRZED (P3/P7): trzy zbędne landy w ręce + land na stole ⇒ land
  // na wierzchu jest zbędny i idzie na spód: 26 vs keep 20.
  const { state } = base({
    top: ['secluded-steppe', 'highland-game'],
    hand: ['secluded-steppe', 'secluded-steppe', 'secluded-steppe'],
    lands: 6,
  });
  assert.equal(scoreOf(state, 'resolve_scry(bottom:t0)'), 26);
  assert.equal(scoreOf(state, 'resolve_scry(keep)'), 20);
  // …i przy wyłączonym członie kolejności też (człon nie przesuwa podzbioru).
  assert.equal(scoreOf(state, 'resolve_scry(bottom:t0)', KOLEJNOSC_OFF), 26);
});

test('PMSSB-24/A7: przy jednej karcie na wierzchu kolejność nic nie zmienia', () => {
  // scry 1 — permutacji brak, więc wycena musi być identyczna jak PRZED
  // (regresja M135: dobry tani stwór zostaje na wierzchu).
  const { state } = base({ top: ['highland-game'] });
  const { choice } = decide(state);
  assert.deepEqual(choice.bottomIds ?? [], [], 'dobry tani stwór zostaje na wierzchu');
  assert.equal(scoreOf(state, 'resolve_scry(keep)'), 20);
  assert.equal(scoreOf(state, 'resolve_scry(bottom:t0)'), 12);
});
