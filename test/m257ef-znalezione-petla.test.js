// M257 E/F (znaleziska pętli jakości):
// E — mulligan: odłożenie N kart na spód,
// gdy liczba kart w ręce = wymagana liczba (mała biblioteka), wybór jest
// WYMUSZONY (jedyna legalna kombinacja = cała ręka). Silnik nie powinien
// wystawiać bezsensownej decyzji — auto-rozstrzyga (wzorzec auto-akcji
// turowej: CR 504.1 dobieranie, r4/A CR 508.1 pusta deklaracja).
//
// docs/plans/PLAN_2026-08-30-m257ef-znalezione-petla.md

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execute, playerView, addObject, createGameState } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createAbility } from '../src/engine/abilities.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
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

// ============================================================================
// M257 F (znalezisko pętli jakości): Regenerate (Exterminator Magmarch —
// {1}{B}: Regenerate this creature) = combat trick. Bot rzucał/aktywował go
// w Głównych 1 (G1) bez nadchodzącej śmierci kreatury (root cause: gałąź B3
// w `isCreatureThreatened` — „wróg ma otwartą manę i removal w ręce, który
// MOŻE zabić” = spekulacja, nie pewna śmierć). Fix: pewna śmierć w tej turze:
// walka zadeklarowana (symulacja CR 510) albo lethal już zadany (SBA 704.5g).
// W oknie combat_damage (ostatnia szansa przed `resolve_combat`) premia 60
// (2+60=62 > stała resolve_combat 50) — tarcza musi stać PRZED obrażeniami.
// ============================================================================

/**
 * Tura p2 (`step`): Magmarch 5/3 na polu ({1}{B}: Regenerate), p2 ma pulę
 * {1}{B}; p1 — `enemyLands` nietapniętych landów (otwarta mana dla B3)
 * + talia z `fiery-fall` (instant 6: 5 obrażeń — B3 strzelał przy
 * opponentOpenMana >= 6).
 */
function regenSetup({ step = 'main1', marchDamage = 0, enemyLands = 6, combat = false }) {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  addObject(state, {
    id: 'march', instanceId: 'i-march', cardId: 'exterminator-magmarch', controllerId: 'p2',
    ownerId: 'p2', zone: 'battlefield', kind: 'creature', power: 5, toughness: 3, manaCost: 4,
    abilities: [createAbility({ type: 'activated', cost: { mana: 2, colors: ['B'] }, effect: { type: 'regenerate' } })],
    keywords: [], subtypes: [], types: ['Artifact', 'Creature'], colors: ['B', 'R'],
  });
  state.objects.set('march', Object.freeze({ ...state.objects.get('march'), damage: marchDamage }));
  for (let i = 0; i < enemyLands; i += 1) {
    addObject(state, {
      id: `land${i}`, instanceId: `i-land${i}`, cardId: 'basic-swamp', controllerId: 'p1', ownerId: 'p1',
      zone: 'battlefield', kind: 'land', types: ['Basic', 'Land'], subtypes: ['Swamp'], colors: [],
      abilities: [], keywords: [], manaCost: 0,
    });
  }
  addMana(state, 'p2', 2, { colors: ['', 'B'] });
  if (combat) {
    addObject(state, {
      id: 'blk', instanceId: 'i-blk', cardId: 'x-test', controllerId: 'p1', ownerId: 'p1',
      zone: 'battlefield', kind: 'creature', power: 3, toughness: 3, manaCost: 0,
      abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: ['R'],
    });
    state.objects.set('blk', Object.freeze({ ...state.objects.get('blk'), summoningSickness: false }));
    state.turn = jumpToStep(state.turn, 'declare_attackers', 'p2');
    state.turn.activePlayerId = 'p2';
    assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p2', attackerIds: ['march'] }).ok);
    state.turn = jumpToStep(state.turn, 'declare_blockers', 'p1');
    assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p1', assignments: { march: ['blk'] } }).ok);
    // Obrońca (p1) pasuje → priorytet dla atakującego p2 w combat_damage.
    assert.ok(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok);
  }
  return state;
}

function botP2(state, opponentDeck = ['fiery-fall']) {
  const view = playerView(state, 'p2');
  const choice = createHeuristicBot({ seed: 7, opponentDeck }).chooseCommand(view, {});
  const activates = view.legalCommands.filter((c) => c.type === 'activate_ability' && c.objectId === 'march');
  return { choice, activates, view };
}

// --- F1: G1, stwór zdrowy, B3 strzelałby (wróg: 6 open + fiery-fall) — NIE

test('F1: main1, Magmarch zdrowy, wróg z otwartą maną + removal w talii — bot NIE aktywuje (spekulacja B3 = nie pewna śmierć)', () => {
  const { choice, activates } = botP2(regenSetup({}));
  assert.ok(activates.length > 0, 'aktywacja w ofercie (mana {1}{B} dostępna)');
  assert.notEqual(choice.type === 'activate_ability' && choice.objectId === 'march', true,
    `regeneracja bez nadchodzącej śmierci = marnotrawstwo: ${JSON.stringify(choice)}`);
});

// --- F2 (anti-overfix): „moment lethalu” — lethal już zadany — RZUCA -------

test('F2: main1, Magmarch z 3 obrażeniami (lethal, SBA 704.5g czeka) — bot AKTYWUJE', () => {
  const { choice, activates } = botP2(regenSetup({ marchDamage: 3 }));
  assert.ok(activates.length > 0, 'aktywacja w ofercie');
  assert.equal(choice.type, 'activate_ability', `tarcza w momencie lethalu: ${JSON.stringify(choice)}`);
  assert.equal(choice.objectId, 'march');
});

// --- F3 (anti-overfix): walka — atakujący ginie w combacie — RZUCA --------
// 5/3 atakuje, blokuje 3/3 → atakujący dostaje 3 = jego wytrzymałość.
// Okno combat_damage: tarcza (2+60=62) musi wygrać z resolve_combat (50).

test('F3: walka 5/3 vs blok 3/3, combat_damage — bot AKTYWUJE TARCZĘ przed resolve_combat', () => {
  const state = regenSetup({ combat: true });
  const { choice, activates, view } = botP2(state);
  assert.ok(activates.length > 0, 'aktywacja w ofercie');
  assert.ok(view.legalCommands.some((c) => c.type === 'resolve_combat'), 'resolve_combat w ofercie (dość tarczy i walka idzie dalej)');
  assert.equal(choice.type, 'activate_ability', `ostatnia szansa przed obrażeniami: ${JSON.stringify(choice)}`);
  assert.equal(choice.objectId, 'march');

  // Dokończenie: aktywacja (stack) → pełna runda passów (p2, p1 — stack się
  // rozstrzyga, tarcza zostaje) → resolve_combat → stwór PRZEŻYWA (tarcza
  // konsumowana przy próbie zniszczenia; CR 701.12a: odcięty od walki).
  assert.ok(execute(state, { type: 'activate_ability', playerId: 'p2', objectId: choice.objectId, abilityIndex: choice.abilityIndex }).ok);
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p2' }).ok);
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok);
  assert.ok((state.regenerationShields ?? []).includes('march'), 'tarcza aktywna przed obrażeniami');
  const v2 = playerView(state, 'p2');
  const b2 = createHeuristicBot({ seed: 7, opponentDeck: ['fiery-fall'] }).chooseCommand(v2, {});
  assert.equal(b2.type, 'resolve_combat', 'po tarczy bot domyka krok (resolve_combat), bez pętli aktywacji');
  assert.ok(execute(state, { type: 'resolve_combat', playerId: 'p2', defendingPlayerId: 'p1' }).ok);
  const march = state.objects.get('march');
  assert.equal(march?.zone, 'battlefield', 'stwór przeżył walkę dzięki tarczy');
  assert.equal(march?.damage ?? 0, 0, 'obrażenia usunięte przez regenerację');
});
