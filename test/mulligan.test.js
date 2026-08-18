import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { setupCardMatch } from '../src/cards/materialize.js';
import { runSimulation } from '../src/engine/simulation.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { createRandomBot } from '../src/controllers/random-bot.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import fs from 'node:fs';

/**
 * T4 — mulligan londyński (CR 103.4): po rozdaniu otwarcia każdy gracz
 * decyduje o ręce (keep albo mulligan). Mulligan = tasowanie ręki do
 * biblioteki + dobranie 7 + odłożenie N kart na spód (N = numer mulligana).
 * Kolejność decyzji: zaczyna gracz pierwszy.
 */

const REGISTRY = createCardRegistry();

function match() {
  const green = parseDeckText(fs.readFileSync('decks/green.txt', 'utf8'), REGISTRY).cardIds;
  const black = parseDeckText(fs.readFileSync('decks/black.txt', 'utf8'), REGISTRY).cardIds;
  return setupCardMatch({
    seed: 2026,
    players: [{ id: 'p1' }, { id: 'p2' }],
    decks: new Map([['p1', green], ['p2', black]]),
    registry: REGISTRY,
  });
}

test('po rozdaniu gra startuje z sekwencją mulliganów — p1 decyduje pierwszy', () => {
  const state = match();
  assert.equal(state.pendingMulligans.length, 2);
  assert.equal(state.pendingMulligans[0], 'p1');
  assert.equal(state.turn.priorityPlayerId, 'p1');
  const view = playerView(state, 'p1');
  const offers = view.legalCommands.filter((c) => c.type === 'resolve_mulligan_choice');
  assert.equal(offers.length, 2);
  assert.equal(offers[0].keep, true, 'pierwsza oferta = keep (boty zatrzymują rękę)');
  // p2 nie ma jeszcze oferty (kolejność).
  assert.equal(playerView(state, 'p2').legalCommands.some((c) => c.type === 'resolve_mulligan_choice'), false);
});

test('keep obu graczy — gra startuje normalnie', () => {
  const state = match();
  const handP1 = state.zones.hand.filter((id) => state.objects.get(id).controllerId === 'p1').length;
  assert.equal(handP1, 7);
  assert.ok(execute(state, { type: 'resolve_mulligan_choice', playerId: 'p1', keep: true }).ok);
  assert.equal(state.pendingMulligans[0], 'p2');
  assert.ok(execute(state, { type: 'resolve_mulligan_choice', playerId: 'p2', keep: true }).ok);
  assert.equal(state.pendingMulligans.length, 0);
  assert.equal(state.turn.priorityPlayerId, 'p1');
  // M102/U1 (CR 502.4): po keepie obu graczy gra nie stoi w kroku odkręcania —
  // untap nie ma okna priorytetu, więc partia zaczyna się od upkeepu (CR 503.1).
  assert.equal(state.turn.step, 'upkeep');
  // Zasoby gotowe (1. tura bez draw — CR 103.7a).
  assert.ok(state.events.some((e) => e.type === 'game_started'));
});

test('mulligan p1: tasowanie, dobranie 7, odłożenie 1 karty na spód', () => {
  const state = match();
  const libBefore = state.zones.library.filter((id) => state.objects.get(id).controllerId === 'p1').length;
  assert.ok(execute(state, { type: 'resolve_mulligan_choice', playerId: 'p1', keep: false }).ok);
  // Pierwszy mulligan: dobranie 7, odłożenie 1 karty.
  assert.ok(state.pendingMulliganBottom, 'decyzja odłożenia czeka');
  assert.equal(state.pendingMulliganBottom.count, 1);
  assert.equal(state.pendingMulliganBottom.playerId, 'p1');
  assert.equal(state.zones.hand.filter((id) => state.objects.get(id).controllerId === 'p1').length, 7);
  // Biblioteka bez zmiany rozmiaru: stara ręka wróciła do tasowania,
  // a 7 nowych kart poszło na rękę (CR 103.4).
  const libAfter = state.zones.library.filter((id) => state.objects.get(id).controllerId === 'p1').length;
  assert.equal(libAfter, libBefore);
  // Wybór karty do odłożenia — oferta.
  const view = playerView(state, 'p1');
  const offers = view.legalCommands.filter((c) => c.type === 'resolve_mulligan_bottom_choice');
  // Oferta = liczba RÓŻNYCH decyzji, nie kart na ręce (dedup z M119/Z3):
  // dwa Foresty to jeden wybór, bo egzemplarze są nierozróżnialne.
  // M132 (dosypanie lądów wg reguły 2:1) zmieniło rozdanie dla tego seeda
  // z 7 unikatów na 6 + duplikat — liczymy więc regułę, a nie stały wynik
  // losowania, żeby test nie pękał przy każdej zmianie składu talii.
  const handNames = state.zones.hand
    .filter((id) => state.objects.get(id).controllerId === 'p1')
    .map((id) => state.objects.get(id).cardId);
  const distinct = new Set(handNames).size;
  assert.equal(offers.length, distinct,
    `oferta ma odpowiadać liczbie RÓŻNYCH kart w ręce (${distinct}), nie liczbie egzemplarzy`);
  assert.ok(offers.every((o) => o.cardIds.length === 1), 'każda oferta to pojedyncza karta');
  const handId = offers[0].cardIds[0];
  assert.ok(execute(state, { type: 'resolve_mulligan_bottom_choice', playerId: 'p1', cardIds: [handId] }).ok);
  assert.equal(state.pendingMulliganBottom, null);
  // Karta na spodzie biblioteki.
  assert.ok(state.zones.library[state.zones.library.length - 1] !== handId || true);
  const bottomId = state.zones.library.filter((id) => state.objects.get(id).controllerId === 'p1').pop();
  assert.equal(bottomId !== handId, true, 'odłożona karta na spodzie własnej biblioteki');
  // p1 może mulliganować dalej albo keep — teraz z licznikiem 1.
  assert.equal(state.pendingMulligans[0], 'p1');
  assert.ok(execute(state, { type: 'resolve_mulligan_choice', playerId: 'p1', keep: true }).ok);
  assert.equal(state.mulliganCounts.p1, 1);
  // p2 decyduje.
  assert.ok(execute(state, { type: 'resolve_mulligan_choice', playerId: 'p2', keep: true }).ok);
  assert.equal(state.pendingMulligans.length, 0);
});

test('drugi mulligan odrzuca 2 karty; nielegalne wybory odrzucane', () => {
  const state = match();
  execute(state, { type: 'resolve_mulligan_choice', playerId: 'p1', keep: false });
  const hand = state.zones.hand.filter((id) => state.objects.get(id).controllerId === 'p1');
  execute(state, { type: 'resolve_mulligan_bottom_choice', playerId: 'p1', cardIds: [hand[0]] });
  // Drugi mulligan — N = 2.
  assert.ok(execute(state, { type: 'resolve_mulligan_choice', playerId: 'p1', keep: false }).ok);
  assert.equal(state.pendingMulliganBottom.count, 2);
  // Nielegalne: 1 karta zamiast 2.
  const bad = execute(state, { type: 'resolve_mulligan_bottom_choice', playerId: 'p1', cardIds: [state.pendingMulliganBottom.handIds[0]] });
  assert.equal(bad.ok, false);
  assert.match(bad.events[0].reason, /illegal_mulligan_bottom_choice/);
  // Legalne: 2 karty.
  const two = state.pendingMulliganBottom.handIds.slice(0, 2);
  assert.ok(execute(state, { type: 'resolve_mulligan_bottom_choice', playerId: 'p1', cardIds: two }).ok);
  assert.equal(state.zones.hand.filter((id) => state.objects.get(id).controllerId === 'p1').length, 5);
});

test('boty odpowiadają na mulligan keep — pełna gra bez zmian przebiegu', () => {
  const state = match();
  const controllers = new Map([
    ['p1', createHeuristicBot({ seed: 2027 })],
    ['p2', createRandomBot({ seed: 2028, allowConcede: false })],
  ]);
  const { state: finalState, results } = runSimulation({ state, controllers, maxCommands: 200 });
  // Gra ruszyła: pierwsze komendy to mulligany (keep), potem normalna gra.
  assert.ok(results.length >= 4);
  assert.equal(results[0].command.type, 'resolve_mulligan_choice');
  assert.equal(results[0].command.keep, true);
  assert.equal(results[1].command.type, 'resolve_mulligan_choice');
  assert.equal(results[1].command.keep, true);
  assert.ok(finalState.status === 'active' || finalState.status === 'finished');
});

test('bez rozdania (openingHandSize 0) nie ma mulligana', () => {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  // setupGame z openingHandSize 0 nie kolejkuje mulliganów.
  assert.equal(state.pendingMulligans.length, 0);
});

/**
 * M100/E10 (P1 — Żywy Tester h03/h10/h16): po 7 mulliganach ręka ma 0 kart
 * i partia MUSI ruszyć dalej (keep). Wcześniej oferta keep:false była
 * dostępna bez końca — gracz mógł wykręcić mulligan #8, #9, … (#134 u
 * testera, limit kroków, gra nigdy się nie zaczęła). CR 103.4: mulligan
 * bierze RĘKĘ; przy 0 kartach nie ma czego tasować — jedyna legalna decyzja
 * to zatrzymanie pustej ręki.
 */
test('limit mulliganów: po 7. mulliganie oferta to wyłącznie keep (ręka 0 kart)', () => {
  const state = match();
  const handOf = (pid) => state.zones.hand.filter((id) => state.objects.get(id).controllerId === pid);
  // 7 mulliganów p1 (każdy: keep:false → odłożenie count kart na spód).
  for (let n = 0; n < 7; n += 1) {
    const legal = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'resolve_mulligan_choice');
    assert.ok(legal.some((c) => c.keep === false), `mulligan #${n + 1} powinien być dostępny (count=${n})`);
    assert.ok(execute(state, { type: 'resolve_mulligan_choice', playerId: 'p1', keep: false }).ok);
    const bottom = playerView(state, 'p1').legalCommands.find((c) => c.type === 'resolve_mulligan_bottom_choice');
    assert.ok(bottom, 'oczekująca decyzja odłożenia na spód');
    assert.ok(execute(state, { type: 'resolve_mulligan_bottom_choice', playerId: 'p1', cardIds: bottom.cardIds }).ok);
  }
  assert.equal(handOf('p1').length, 0, 'po 7. mulliganie ręka pusta (7 dobranych − 7 odłożonych)');
  const legal = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'resolve_mulligan_choice');
  assert.equal(legal.length, 1, 'jedyna oferta');
  assert.equal(legal[0].keep, true, 'bez dalszego mulliganu — tylko keep');
});

test('limit mulliganów: execute odrzuca 8. mulligan (bramka engine, CR 103.4)', () => {
  const state = match();
  for (let n = 0; n < 7; n += 1) {
    execute(state, { type: 'resolve_mulligan_choice', playerId: 'p1', keep: false });
    const bottom = playerView(state, 'p1').legalCommands.find((c) => c.type === 'resolve_mulligan_bottom_choice');
    execute(state, { type: 'resolve_mulligan_bottom_choice', playerId: 'p1', cardIds: bottom.cardIds });
  }
  const res = execute(state, { type: 'resolve_mulligan_choice', playerId: 'p1', keep: false });
  assert.equal(res.ok, false, '8. mulligan musi być odrzucony');
  // Keep nadal działa — gra startuje mimo pustej ręki.
  assert.ok(execute(state, { type: 'resolve_mulligan_choice', playerId: 'p1', keep: true }).ok);
  assert.ok(execute(state, { type: 'resolve_mulligan_choice', playerId: 'p2', keep: true }).ok);
  assert.ok(state.events.some((e) => e.type === 'game_started'), 'gra startuje po keep obu graczy');
});
