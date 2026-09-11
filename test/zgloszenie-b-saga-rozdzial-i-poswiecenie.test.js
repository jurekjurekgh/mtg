// Zgłoszenie właściciela B (2026-09-10, sesja arena/01a08d0e) — Rediscover the Way.
//
// Objaw przy stole (log „Rozgrywka"):
//     Rediscover the Way zyskuje: podwójne uderzenie
//     Rediscover the Way zostaje poświęcony
//     Rediscover the Way — trigger się rozstrzyga (rozdział 3)
// Dwa błędy: (1) Saga nie może „zyskać podwójnego uderzenia" — rozdział III
// tworzy opóźnioną zdolność, która nadaje double strike CELOWANEMU STWOROWI;
// (2) poświęcenie Sagi musi nastąpić PO rozstrzygnięciu jej rozdziału.
//
// Oracle (Scryfall, TDM): „III — Whenever you cast a noncreature spell this
// turn, **target creature you control** gains double strike until end of turn."
// Ruling WotC 2025-04-04: „The triggered ability created by the chapter III
// ability may trigger multiple times during the turn, **even though Rediscover
// the Way will likely no longer be on the battlefield**."
// Poświęcenie (mtg.wiki/Saga, CR 704.5s): „the Saga's controller sacrifices it
// **as soon as its chapter ability has left the stack**, most likely by
// resolving or being countered. This state-based action doesn't use the stack."
//
// Przyczyny źródłowe (zmierzone):
//  - src/engine/effects.js:1034 — efekt dokleja grant do SAGI (abilityGrants)
//    i emituje `keyword_granted` z `objectId` sagi; grant ginie razem z
//    poświęconą Sagą (CR 400.7 — w grobie to nowy obiekt), a skan
//    `you_cast_noncreature_spell` (triggers.js) czyta wyłącznie pole bitwy,
//    więc rozdział III w praktyce nie działał po poświęceniu;
//  - src/engine/triggers.js:761 — poświęcenie w środku `fireSagaChapter`,
//    więc `permanent_sacrificed` lądowało przed rozstrzygnięciem rozdziału.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addMana } from '../src/engine/resources.js';
import { effectiveKeywords } from '../src/engine/permanents.js';
import { processTriggers } from '../src/engine/triggers.js';
import { runStateBasedActions } from '../src/engine/state-based.js';
import { describeGameEvent } from '../src/table/session.js';
import { addCounter } from '../src/engine/counters.js';
import { applyEffect } from '../src/engine/effects.js';

const REGISTRY = createCardRegistry();

function game() {
  const state = createGameState({ seed: 707, players: [{ id: 'p1' }, { id: 'p2' }] });
  for (const pid of ['p1', 'p2']) {
    for (let i = 0; i < 20; i += 1) {
      addObject(state, {
        id: `lib-${pid}-${i}`, instanceId: `il-${pid}-${i}`, cardId: 'x-library',
        controllerId: pid, ownerId: pid, zone: 'library',
      });
    }
  }
  state.turn.phase = 'precombat_main';
  state.turn.step = 'main1';
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  return state;
}

function putCard(state, id, cardId, controllerId, zone = 'battlefield', patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, ...patch,
  });
  return state.objects.get(id);
}

function addCreature(state, id, controllerId, power, toughness) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId, ownerId: controllerId,
    zone: 'battlefield', kind: 'creature', name: `Testowy ${id}`, power, toughness,
    types: ['Creature'], subtypes: [], keywords: [], colors: [], manaCost: 0,
  });
  return state.objects.get(id);
}

/** CR 714.3b: po kroku dobierania aktywny gracz dokłada licznik lore + rozdział. */
function poKrokuDobierania(state) {
  const ev = { type: 'step_advanced', step: 'main1', phase: 'precombat_main', playerId: 'p1' };
  state.events.push(ev);
  processTriggers(state, [ev]);
}

/** Rozstrzyga stos pełnymi rundami passów (T6). */
function resolveStack(state) {
  let guard = 0;
  while (state.zones.stack.length > 0 && guard++ < 20) {
    const holder = state.turn.priorityPlayerId;
    const r = execute(state, { type: 'pass_priority', playerId: holder });
    if (!r.ok && /(_unresolved|not_your_decision)$/.test(r.events?.[0]?.reason ?? '')) return;
    if (state.turn.passes === 0) continue;
  }
}

/** Saga z dwoma licznikami lore — następny (trzeci) odpala rozdział III.
 * Liczniki dokłada `addCounter` (CR 122): `addObject` nie przyjmuje pola
 * `counters` wprost (createGameObject go nie destruktuje). */
function sagaGotowa(state) {
  const saga = putCard(state, 'rtw', 'rediscover-the-way', 'p1', 'battlefield');
  addCounter(state, 'rtw', 'lore', 2);
  const po = state.objects.get('rtw');
  assert.equal(po.counters?.lore, 2, 'setup: dwa liczniki lore');
  return po;
}

test('B1/1: rozdział III NIE nadaje podwójnego uderzenia Sadze', () => {
  const state = game();
  const saga = sagaGotowa(state);
  addCreature(state, 'cel', 'p1', 2, 2);

  poKrokuDobierania(state);
  resolveStack(state);

  const bogus = state.events.filter((e) => e.type === 'keyword_granted'
    && e.objectId === saga.id && (e.keywords ?? []).includes('double_strike'));
  assert.deepEqual(bogus, [],
    'Saga nie może „zyskać podwójnego uderzenia" — rozdział III tworzy opóźnioną zdolność');
});

test('B1/2: po rozdziale III czar nie-stwora daje wybór celu, a double strike trafia w WYBRANEGO stwora', () => {
  const state = game();
  sagaGotowa(state);
  addCreature(state, 'cel', 'p1', 2, 2);
  addCreature(state, 'inny', 'p1', 3, 3);
  addMana(state, 'p1', 4, { colors: ['R'] });
  const szok = putCard(state, 'szok', 'shock', 'p1', 'hand');

  poKrokuDobierania(state);
  resolveStack(state);
  assert.equal(state.objects.get('rtw')?.zone !== 'battlefield', true,
    'setup: po rozdziale III Saga jest poświęcona');

  assert.ok(execute(state, {
    type: 'cast_spell', playerId: 'p1', objectId: szok.id, targets: ['p2'],
  }).ok, 'setup: rzut czaru niebędącego stworem');

  const oferty = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'resolve_trigger_target');
  assert.ok(oferty.length > 0,
    'opóźniona zdolność rozdziału III musi odpalić po poświęceniu Sagi (ruling WotC 2025-04-04)');
  assert.ok(oferty.every((c) => c.targetId !== 'rtw'), 'Saga nie jest celem własnego rozdziału');

  assert.ok(execute(state, { type: 'resolve_trigger_target', playerId: 'p1', targetId: 'cel' }).ok);
  resolveStack(state);

  assert.ok(effectiveKeywords(state.objects.get('cel'), state).includes('double_strike'),
    'wybrany stwór dostaje double strike do końca tury');
  assert.ok(!effectiveKeywords(state.objects.get('inny'), state).includes('double_strike'),
    'drugi stwór nie dostaje nic');
});

test('B1/3 (ruling WotC): zdolność rozdziału III może odpalić wiele razy w tej turze', () => {
  const state = game();
  sagaGotowa(state);
  addCreature(state, 'cel', 'p1', 2, 2);
  addCreature(state, 'inny', 'p1', 3, 3);
  addMana(state, 'p1', 8, { colors: ['R'] });
  const szok1 = putCard(state, 'szok1', 'shock', 'p1', 'hand');
  const szok2 = putCard(state, 'szok2', 'shock', 'p1', 'hand');

  poKrokuDobierania(state);
  resolveStack(state);

  for (const [czar, cel] of [[szok1, 'cel'], [szok2, 'inny']]) {
    assert.ok(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: czar.id, targets: ['p2'] }).ok,
      `setup: rzut ${czar.cardId}`);
    const oferta = playerView(state, 'p1').legalCommands.find((c) => c.type === 'resolve_trigger_target');
    assert.ok(oferta, `opóźniona zdolność odpala przy każdym czarze nie-stworze (cel ${cel})`);
    assert.ok(execute(state, { type: 'resolve_trigger_target', playerId: 'p1', targetId: cel }).ok);
    resolveStack(state);
  }
  assert.ok(effectiveKeywords(state.objects.get('cel'), state).includes('double_strike'), 'pierwszy cel');
  assert.ok(effectiveKeywords(state.objects.get('inny'), state).includes('double_strike'), 'drugi cel');
});

test('B2/1 (CR 704.5s): Saga NIE jest poświęcona, póki jej rozdział jest na stosie', () => {
  const state = game();
  sagaGotowa(state);
  addCreature(state, 'cel', 'p1', 2, 2);

  poKrokuDobierania(state);
  assert.ok(state.zones.stack.length > 0, 'setup: rozdział III czeka na stosie');
  runStateBasedActions(state);

  assert.equal(state.objects.get('rtw')?.zone, 'battlefield',
    'akcja stanowa nie może poświęcić Sagi, póki zdolność rozdziału nie zeszła ze stosu');
});

test('B2/2: poświęcenie następuje PO rozstrzygnięciu rozdziału (kolejność zdarzeń)', () => {
  const state = game();
  sagaGotowa(state);
  addCreature(state, 'cel', 'p1', 2, 2);
  const przed = state.events.length;

  poKrokuDobierania(state);
  resolveStack(state);

  const strumien = state.events.slice(przed);
  // Punkt odniesienia to `trigger_resolved` — to ono renderuje w logu linię
  // „…— trigger się rozstrzyga (rozdział 3)" (session.js). Wewnętrzne
  // `saga_chapter_fired` jest pchane PRZED efektem rozdziału, więc asercja
  // na nim przechodziła także przed naprawą (zmierzone).
  const rozdzial = strumien.findIndex((e) => e.type === 'trigger_resolved' && e.saga === true && e.chapter === 3);
  const poswiecenie = strumien.findIndex((e) => e.type === 'permanent_sacrificed' && e.saga === true);
  assert.ok(rozdzial >= 0, 'setup: rozdział III się rozstrzygnął');
  assert.ok(poswiecenie >= 0, 'setup: Saga została poświęcona');
  assert.ok(poswiecenie > rozdzial,
    `poświęcenie (indeks ${poswiecenie}) musi być PO rozstrzygnięciu rozdziału (indeks ${rozdzial})`);
});

test('B3: log nie mówi już „Rediscover the Way zyskuje: podwójne uderzenie"', () => {
  const state = game();
  sagaGotowa(state);
  addCreature(state, 'cel', 'p1', 2, 2);
  const przed = state.events.length;

  poKrokuDobierania(state);
  resolveStack(state);

  const helpers = { nameOf: (cardId) => cardId, nameOfObject: () => '?' };
  const linie = state.events.slice(przed)
    .map((e) => describeGameEvent(e, helpers, { p1: 'Ty', p2: 'Nieprzyjaciel' }))
    .filter((t) => typeof t === 'string' && t.length > 0);
  const tekst = linie.join('\n');

  assert.ok(!tekst.includes('zyskuje: podwójne uderzenie'),
    `log nie może twierdzić, że Saga zyskała podwójne uderzenie:\n${tekst}`);
  assert.ok(linie.some((l) => l.includes('gdy rzucisz w tej turze czar niebędący stworem')),
    `log ma opisywać opóźnioną zdolność:\n${tekst}`);
  const idxRozdzial = linie.findIndex((l) => l.includes('trigger się rozstrzyga'));
  const idxPoswiecenie = linie.findIndex((l) => l.includes('zostaje poświęcony'));
  assert.ok(idxRozdzial >= 0 && idxPoswiecenie >= 0, `setup: obie linie w logu:\n${tekst}`);
  assert.ok(idxPoswiecenie > idxRozdzial,
    `w logu poświęcenie musi być PO rozstrzygnięciu rozdziału:\n${tekst}`);
});

test('B4 (CR 714.2b): licznik lore z proliferate odpala rozdział, a Saga czeka na jego rozstrzygnięcie', () => {
  // Poświęcenie Sagi jest akcją stanową (CR 714.4), więc od teraz liczy się
  // KAŻDA droga dołożenia licznika lore — proliferate (CR 701.27) też.
  // Bez rozdziału w `counter_added` Saga dobita proliferatem do progu była
  // poświęcana bez rozstrzygnięcia rozdziału (regresja, którą wprowadziłaby
  // sama przeprowadzka poświęcenia do SBA).
  const state = game();
  putCard(state, 'rtw', 'rediscover-the-way', 'p1');
  addCounter(state, 'rtw', 'lore', 2);
  addCreature(state, 'cel', 'p1', 2, 2);
  const zrodlo = putCard(state, 'zrodlo', 'highland-game', 'p1');

  applyEffect(state, { type: 'proliferate' }, zrodlo, []);
  assert.ok(state.pendingProliferate, 'setup: proliferate czeka na wybór celów');
  const r = execute(state, { type: 'resolve_proliferate', playerId: 'p1', targetIds: ['rtw'] });
  assert.ok(r.ok, r.events[0]?.reason);

  assert.equal(state.objects.get('rtw').counters.lore, 3, 'setup: trzeci licznik lore');
  assert.equal(state.objects.get('rtw').zone, 'battlefield',
    'CR 714.4: Saga nie może być poświęcona, póki rozdział nie zszedł ze stosu');
  assert.ok(state.zones.stack.length > 0, 'CR 714.2b: rozdział III odpalił od licznika z proliferate');

  resolveStack(state);
  const strumien = state.events;
  const rozdzial = strumien.findIndex((e) => e.type === 'trigger_resolved' && e.saga === true && e.chapter === 3);
  const poswiecenie = strumien.findIndex((e) => e.type === 'permanent_sacrificed' && e.saga === true);
  assert.ok(rozdzial >= 0, 'rozdział III się rozstrzygnął');
  assert.ok(poswiecenie > rozdzial, 'poświęcenie dopiero po rozstrzygnięciu rozdziału');
});

test('B4 anty-over-fix: proliferate na Sadze PONIŻEJ ostatniego rozdziału nie poświęca jej', () => {
  const state = game();
  putCard(state, 'rtw', 'rediscover-the-way', 'p1');
  addCounter(state, 'rtw', 'lore', 1);
  const zrodlo = putCard(state, 'zrodlo', 'highland-game', 'p1');

  applyEffect(state, { type: 'proliferate' }, zrodlo, []);
  assert.ok(execute(state, { type: 'resolve_proliferate', playerId: 'p1', targetIds: ['rtw'] }).ok);
  runStateBasedActions(state);

  assert.equal(state.objects.get('rtw').counters.lore, 2, 'setup: dwa liczniki lore');
  assert.equal(state.objects.get('rtw').zone, 'battlefield',
    'dwa z trzech liczników to jeszcze nie ostatni rozdział (CR 714.4)');
  assert.ok(!state.events.some((e) => e.type === 'permanent_sacrificed' && e.saga === true),
    'żadnego poświęcenia przed ostatnim rozdziałem');
});
