// M257 E (znalezisko pętli jakości): mulligan — odłożenie N kart na spód,
// gdy liczba kart w ręce = wymagana liczba (mała biblioteka), wybór jest
// WYMUSZONY (jedyna legalna kombinacja = cała ręka). Silnik nie powinien
// wystawiać bezsensownej decyzji — auto-rozstrzyga (wzorzec auto-akcji
// turowej: CR 504.1 dobieranie, r4/A CR 508.1 pusta deklaracja).
//
// docs/plans/PLAN_2026-08-30-m257ef-znalezione-petla.md

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { setupCardMatch } from '../src/cards/materialize.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import fs from 'node:fs';

const REGISTRY = createCardRegistry();
const handOf = (state, playerId) => state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === playerId);
const libOf = (state, playerId) => state.zones.library.filter((id) => state.objects.get(id)?.controllerId === playerId);

function smallMatch(seed, p1Cards, p2Cards) {
  return setupCardMatch({
    seed,
    players: [{ id: 'p1' }, { id: 'p2' }],
    decks: new Map([['p1', p1Cards], ['p2', p2Cards]]),
    registry: REGISTRY,
  });
}

// --- E1: mała biblioteka — wymuszony wybór = auto-rozstrzygnięcie (RED dziś)

test('E1: talia 1 karta — mulligan: wybór 1/1 wymuszony, auto-rozstrzygnięcie (pendingMulliganBottom === null)', () => {
  const state = smallMatch(7, ['basic-swamp'], ['basic-swamp']);
  assert.equal(handOf(state, 'p1').length, 1, 'otwarcie: 1 karta (mała talia)');
  assert.ok(state.pendingMulligans.length === 2 && state.pendingMulligans[0] === 'p1');

  const r = execute(state, { type: 'resolve_mulligan_choice', playerId: 'p1', keep: false });
  assert.ok(r.ok, 'mulligan legalny');
  assert.equal(state.mulliganCounts['p1'], 1);
  assert.equal(state.pendingMulliganBottom, null, 'wymuszony wybór — auto-rozstrzygnięcie, decyzja nie wystawiona');
  assert.equal(handOf(state, 'p1').length, 0, 'karta poszła na spód biblioteki');
  assert.equal(libOf(state, 'p1').length, 1);
  assert.ok(state.events.some((e) => e.type === 'mulligan_bottom_resolved'), 'event rozstrzygnięcia w logu');
  assert.equal(state.pendingMulligans[0], 'p1', 'gracz decyduje dalej (keep albo kolejny mulligan)');

  assert.ok(execute(state, { type: 'resolve_mulligan_choice', playerId: 'p1', keep: true }).ok);
  assert.ok(execute(state, { type: 'resolve_mulligan_choice', playerId: 'p2', keep: true }).ok);
  assert.ok(state.events.some((e) => e.type === 'game_started'), 'gra startuje');
});

// --- E2 (anti-overfix): normalna talia 60 — wybór WYSTAWIANY jak dotąd ----

test('E2: talie 60-kartowe — mulligan: wybór 1 z 7 wystawiany (pendingMulliganBottom stoi)', () => {
  const green = parseDeckText(fs.readFileSync('decks/tarkir-bg.txt', 'utf8'), REGISTRY).cardIds;
  const black = parseDeckText(fs.readFileSync('decks/dominaria-brg.txt', 'utf8'), REGISTRY).cardIds;
  const state = setupCardMatch({
    seed: 2026, players: [{ id: 'p1' }, { id: 'p2' }],
    decks: new Map([['p1', green], ['p2', black]]), registry: REGISTRY,
  });
  assert.equal(handOf(state, 'p1').length, 7, 'otwarcie: 7 kart');
  assert.ok(execute(state, { type: 'resolve_mulligan_choice', playerId: 'p1', keep: false }).ok);
  assert.ok(state.pendingMulliganBottom, 'ręka 7 > count 1 — realny wybór');
  assert.equal(state.pendingMulliganBottom.count, 1);
  assert.equal(state.pendingMulliganBottom.handIds.length, 7);
  const offers = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'resolve_mulligan_bottom_choice');
  assert.ok(offers.length >= 2, `oferta wyboru istnieje (${offers.length} wariantów)`);
});

// --- E3 (anti-overfix): 3 karty w ręce > count 1 — wybór WYSTAWIANY -------

test('E3: talie 3-kartowe — mulligan: ręka 3 > count 1, wybór wystawiany (nie wymuszony)', () => {
  // Seed 7 → starter p1 (rzut `createRng(7)() < 0.5`, wzorzec pinów r5b/B).
  const state = smallMatch(7, ['basic-swamp', 'basic-mountain', 'basic-forest'], ['basic-swamp', 'basic-mountain', 'basic-forest']);
  assert.equal(handOf(state, 'p1').length, 3, 'otwarcie: 3 karty');
  assert.ok(execute(state, { type: 'resolve_mulligan_choice', playerId: 'p1', keep: false }).ok);
  assert.ok(state.pendingMulliganBottom, 'ręka 3 > count 1 — realny wybór (auto nie strzela)');
  assert.equal(state.pendingMulliganBottom.handIds.length, 3);
});
