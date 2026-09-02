// Audyt PR #92 (2026-09-02), znalezisko 3 — licznik „druga karta dobrana w turze”.
//
// Objaw (repro przed naprawą): Jolrael, Mwonvuli Recluse („Whenever you draw
// your second card each turn, create a 2/2 green Cat creature token”) czytał
// warunek z STANU (`state.cardsDrawnThisTurn[player] === 2`) w momencie, gdy
// skan triggerów biegł PO CAŁEJ komendzie. Dla dobrania wsadowego:
//   (A) „draw two” jako pierwsze dobranie w turze → 2 wyzwalacze (ma być 1);
//   (B) dobranie w kroku + „draw two” → licznik 3 → 0 wyzwalaczy (ma być 1).
// Przyczyna głębsza (L107): `cardsDrawnThisTurn` podnosiły TRZY rozjechane
// ścieżki (krok dobierania, `drawPlayerCards`, cycling) i żadna nie niosła
// porządku dobrania w zdarzeniu — czyli „która to karta w turze” dało się
// odczytać tylko ze stanu po fakcie.
//
// Naprawa: choke point `recordCardDrawn` (players.js, obok `changeLife`)
// podnosi licznik i STEMPLUJE `drawNumberThisTurn` w zdarzeniu `card_drawn`;
// trigger porównuje ordinal ZE ZDARZENIA. Mulligan pozostaje poza licznikiem
// (CR 701.3b — wzięcie nowych kart po mulliganie nie jest dobraniem).
//
// Strażnik klasowy: narzędzie ADR 0027 (`tools/event-contract-audit.mjs`,
// wpięte w `npm test`) pilnuje, by KAŻDY emiter `card_drawn` niósł
// `drawNumberThisTurn` — czwarta ścieżka bez stempla czerwieni `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { drawPlayerCards } from '../src/engine/effects.js';
import { processTriggers } from '../src/engine/triggers.js';

const REGISTRY = createCardRegistry();

function game(step = 'main') {
  const state = createGameState({ seed: 92, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  return state;
}

function put(state, id, cardId, controllerId, zone = 'battlefield') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  return state.objects.get(id);
}

function commands(state, playerId = 'p1') {
  return playerView(state, playerId).legalCommands;
}

function resolveStack(state, limit = 24) {
  for (let i = 0; i < limit && state.zones.stack.length > 0; i += 1) {
    const pass = commands(state, state.turn.priorityPlayerId).find((c) => c.type === 'pass_priority');
    if (!pass) break;
    const r = execute(state, pass);
    if (!r.ok && /(_unresolved|not_your_decision)$/.test(r.events[0]?.reason ?? '')) break;
  }
}

function library(state, ids) {
  state.zones.library = [];
  for (const id of ids) put(state, id, 'highland-game', 'p1', 'library');
}

const catCount = (state) => [...state.objects.values()]
  .filter((o) => o.cardId === 'token_cat' && o.zone === 'battlefield').length;

test('A92/3: Jolrael — „draw two” jako PIERWSZE dobranie w turze = jeden wyzwalacz', () => {
  const state = game();
  put(state, 'jolrael', 'jolrael-mwonvuli-recluse', 'p1');
  library(state, ['l1', 'l2', 'l3', 'l4']);
  const before = state.events.length;
  drawPlayerCards(state, 'p1', 2, 'effect');   // dwa dobrania w JEDNEJ komendzie
  processTriggers(state, state.events.slice(before));
  resolveStack(state);
  assert.equal(catCount(state), 1,
    'CR 603.2: „whenever you draw your second card each turn” odpala się RAZ — '
    + 'drugi dobór jest jednym zdarzeniem, nawet jeśli oba dobrały się w tej samej komendzie');
});

test('A92/3: Jolrael — dobranie w kroku + „draw two” też odpala (licznik kończy na 3)', () => {
  const state = game();
  put(state, 'jolrael', 'jolrael-mwonvuli-recluse', 'p1');
  library(state, ['l1', 'l2', 'l3', 'l4', 'l5']);
  drawPlayerCards(state, 'p1', 1, 'effect');    // pierwsza karta w turze
  const before = state.events.length;
  drawPlayerCards(state, 'p1', 2, 'effect');    // kolejna komenda: drugie i trzecie dobranie
  processTriggers(state, state.events.slice(before));
  resolveStack(state);
  assert.equal(state.cardsDrawnThisTurn.p1, 3, 'licznik stanu po dwóch komendach');
  assert.equal(catCount(state), 1,
    'drugie dobranie ZASZŁO w tej komendzie (ordinal 2), choć licznik kończy na 3 — '
    + 'odczyt stanu po fakcie gubił wyzwalacz');
});

test('A92/3: KAŻDA ścieżka dobrania stempluje porządek w zdarzeniu (draw step, efekt, cycling)', () => {
  const state = game();
  library(state, ['l1', 'l2', 'l3']);
  // 1) efekt draw_cards (drawPlayerCards)
  const before = state.events.length;
  drawPlayerCards(state, 'p1', 1, 'effect');
  const fromEffect = state.events.slice(before).find((e) => e.type === 'card_drawn');
  assert.equal(fromEffect?.drawNumberThisTurn, 1, 'dobry efekt: ordinal 1');
  // 2) cycling (spells.js — odrębna ścieżka, dawniej osobny inkrement)
  put(state, 'unearth', 'unearth', 'p1', 'hand');
  addMana(state, 'p1', 2, { colors: ['B'] });
  const cyc = commands(state).find((c) => c.type === 'activate_ability' && c.objectId === 'unearth');
  assert.ok(cyc, 'oferta cyclingu z ręki');
  assert.ok(execute(state, cyc).ok);
  resolveStack(state);
  const drawnEvents = state.events.filter((e) => e.type === 'card_drawn');
  const last = drawnEvents[drawnEvents.length - 1];
  assert.ok(drawnEvents.length >= 2, 'cycling dołożył własne zdarzenie dobrania');
  assert.equal(last.drawNumberThisTurn, 2,
    'cycling też idzie przez choke point — ordinal 2, nie zgubiony inkrement');
  assert.deepEqual(drawnEvents.map((e) => e.drawNumberThisTurn).filter((n) => n != null), [1, 2],
    'porządki są kolejne i niepowtarzalne niezależnie od ścieżki');
});

test('A92/3: mulligan nie jest dobraniem (CR 701.3b) — licznik i trigger nietknięte', () => {
  const state = game();
  put(state, 'jolrael', 'jolrael-mwonvuli-recluse', 'p1');
  library(state, ['l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7', 'l8']);
  // Ręczne otwarcie decyzji mulligana tak jak w pozostałych testach sesji.
  state.pendingMulligans = ['p1'];
  assert.ok(execute(state, { type: 'resolve_mulligan_choice', playerId: 'p1', keep: false }).ok,
    'mulligan przyjęty');
  const mullDraws = state.events.filter((e) => e.type === 'card_drawn' && e.mulligan === true);
  assert.ok(mullDraws.length > 0, 'mulligan rysuje zdarzenia card_drawn');
  assert.ok(mullDraws.every((e) => e.drawNumberThisTurn === null),
    'wzięte karty NIE dostają porządku dobrania (CR 701.3b) — kontrakt pola jest '
    + 'wypełniony jawnym null, nie brakiem pola');
  assert.equal(state.cardsDrawnThisTurn?.p1 ?? 0, 0, 'licznik dobrań tury bez zmian');
  assert.equal(catCount(state), 0, 'Jolrael nie tworzy kotów za mulligan');
});
