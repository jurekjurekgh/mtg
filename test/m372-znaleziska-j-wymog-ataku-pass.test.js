import test from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { declareAttackers, legalAttackerOptions } from '../src/engine/combat.js';

/**
 * Znalezisko J właściciela (2026-09-17, gry testowe): Ramroller („This
 * creature attacks each combat if able", CR 508.1c) nie atakował mimo braku
 * choroby przywołania — wystarczyło, że obaj gracze spasowali w kroku
 * deklaracji atakujących, a runda passów przechodziła do blokowania bez
 * deklaracji. Deklaracja atakujących jest akcją turową (CR 508.1a), więc
 * stwór wymuszony musi zostać zadeklarowany także wtedy, gdy gracz spasuje:
 * `pass_priority` auto-deklaruje MINIMALNY zestaw (same stwory wymuszone —
 * goad CR 701.38 albo deskryptor `mustAttack`).
 */

const REGISTRY = createCardRegistry();

function pole(state, id, cardId, extra = {}) {
  const card = REGISTRY.get(cardId);
  assert.ok(card, `brak karty ${cardId}`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId,
    controllerId: extra.controllerId ?? 'p1', ownerId: 'p1', zone: 'battlefield',
    ...gameObjectDataOf(card), types: card.types ?? [], subtypes: card.subtypes ?? [],
    keywords: card.keywords ?? [], abilities: card.abilities ?? [],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false, ...extra }));
  return state.objects.get(id);
}

function krokAtakow() {
  const state = createGameState({ seed: 4, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  return state;
}

/** Pełna runda passów w kroku deklaracji atakujących (p1 → p2). */
function spasujRunde(state) {
  const wyniki = [];
  for (let i = 0; i < 4 && state.turn.step === 'declare_attackers'; i += 1) {
    const view = playerView(state, state.turn.priorityPlayerId);
    const pass = view.legalCommands.find((c) => c.type === 'pass_priority');
    assert.ok(pass, 'pass musi być oferowany w kroku deklaracji');
    const wynik = execute(state, pass);
    assert.ok(wynik.ok, wynik.events?.[0]?.reason);
    wyniki.push(wynik);
  }
  return wyniki;
}

test('J1: runda passów nie pomija wymogu ataku — Ramroller atakuje automatycznie', () => {
  const state = krokAtakow();
  pole(state, 'ram', 'ramroller');
  pole(state, 'opt', 'highland-game'); // opcjonalny — gracz spasował, zostaje w domu
  spasujRunde(state);

  assert.equal(state.turn.step, 'declare_blockers', 'krok przeszedł do blokowania');
  assert.ok(state.combat, 'deklaracja atakujących istnieje (akcja turowa CR 508.1a)');
  assert.deepEqual(state.combat.attackers, ['ram'], 'tylko wymuszony stwór atakuje');
  assert.equal(state.objects.get('ram').tapped, true, 'atakujący został zatapnięty');
  assert.equal(state.objects.get('ram').attackedThisTurn, true, 'flaga ataku na turę');
  assert.equal(state.objects.get('opt').tapped, false, 'opcjonalny stwór nie atakuje');
  const declared = state.events.filter((e) => e.type === 'attackers_declared');
  assert.equal(declared.length, 1, 'zdarzenie deklaracji w logu');
  assert.deepEqual(declared[0].attackerIds, ['ram']);
});

test('J2: goad (CR 701.38) działa tak samo jak „attacks each combat if able"', () => {
  const state = krokAtakow();
  pole(state, 'ogar', 'highland-game', { goaded: true });
  spasujRunde(state);

  assert.deepEqual(state.combat?.attackers ?? [], ['ogar'], 'goadowany atakuje mimo passów');
  assert.equal(state.objects.get('ogar').tapped, true, 'goadowany zatapnięty');
});

test('J3: bez stworów wymuszonych stara ścieżka passa — pusta walka bez deklaracji', () => {
  const state = krokAtakow();
  pole(state, 'opt', 'highland-game');
  spasujRunde(state);

  assert.equal(state.turn.step, 'declare_blockers', 'krok przeszedł dalej');
  assert.equal(state.combat, null, 'brak deklaracji (nie ma kogo wymuszać)');
  assert.equal(state.events.some((e) => e.type === 'attackers_declared'), false, 'brak zdarzenia deklaracji');
});

test('J4 (M270): samotny stwór z „can not attack alone" i goadem nie wysadza rundy passów', () => {
  const state = krokAtakow();
  pole(state, 'bestia', 'ember-beast', { goaded: true });
  spasujRunde(state); // przed poprawką wymóg wpychał stwora do deklaracji → wyjątek

  assert.equal(state.turn.step, 'declare_blockers', 'krok idzie dalej bez wyjątku');
  assert.equal(state.combat, null, '„if able" nie obowiązuje — stwór atakować nie może');
});

test('J5 (L48): oferta i walidacja nadal wymagają wymuszonego atakującego', () => {
  const state = krokAtakow();
  pole(state, 'ram', 'ramroller');
  pole(state, 'opt', 'highland-game');

  const opcje = legalAttackerOptions(state, 'p1', 64);
  assert.deepEqual(opcje.map((ids) => [...ids]), [['ram'], ['ram', 'opt']], 'każda opcja zawiera wymuszonego');
  assert.throws(() => declareAttackers(state, 'p1', []), /musi atakować/, 'pusta deklaracja odrzucona');
  assert.throws(() => declareAttackers(state, 'p1', ['opt']), /musi atakować/, 'pominięcie wymuszonego odrzucone');
});
