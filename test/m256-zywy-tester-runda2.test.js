// M256 — runda 2 Żywym Testerem (2026-08-29).
//
// Kardynał 1 z poprzedniej rundy (AUDYT_M255): komunikat „trigger bez efektu
// (nie było czego wykonać)" jest PRAWIDŁOWY, ale nieprecyzyjny, gdy efekt
// nie ma odbiorców. W 18 partiach rundy 2 powtórzyły się trzy karty:
//   • Veiled Ascension — „każdy zakryty stwór, którego kontrolujesz" (brak
//     zakrytych stworów),
//   • Trostani Discordant — „każdy gracz odzyskuje stwory, których jest
//     właścicielem" (nikt nie trzyma cudzych),
//   • Chronic Flooding — młynowanie przy PUSTEJ bibliotece (tu „nie było
//     czego wykonać" jest właściwym powodem — przypadek kontrolny).
//
// Naprawa: `EMPTY_RECEIVER_EFFECTS` w `src/engine/triggers.js` — tabela
// selektorów odbiorców (po typie efektu, ADR 0002) współdzielona z efektem
// (`src/engine/effects.js`), która odróżnia „pusty zbiór odbiorców" od
// „efekt wykonał się bez skutku".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { describeGameEvent } from '../src/table/session.js';

const REGISTRY = createCardRegistry();
const HELPERS = {
  nameOf: (id) => REGISTRY.get(id)?.name ?? String(id),
  nameOfObject: (id) => String(id),
};
const NAMES = { p1: 'Ty', p2: 'Nieprzyjaciel' };

function game(playerId = 'p1') {
  const state = createGameState({ seed: 256, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
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

/**
 * Kładzie kartę twarzą w dół. `addObject` odrzuca pola spoza kontraktu
 * (L21 — giną po cichu), więc `faceDown` doszywamy tak jak `tapped` w M189.
 */
function faceDown(state, id) {
  const object = state.objects.get(id);
  assert.ok(object, `obiekt ${id} na stole`);
  state.objects.set(id, Object.freeze({ ...object, faceDown: true }));
  return state.objects.get(id);
}

/** Rozstrzyga stos i oczekujące decyzje (wzorzec M189/M242). */
function resolveAll(state, limit = 20) {
  for (let i = 0; i < limit; i += 1) {
    const pid = state.turn.priorityPlayerId;
    const cmds = playerView(state, pid).legalCommands;
    const choice = cmds.find((c) => c.type.startsWith('resolve_'));
    if (!choice && state.zones.stack.length === 0) break;
    const r = execute(state, choice ?? { type: 'pass_priority', playerId: pid });
    if (!r.ok) break;
  }
}

/** Pass obu graczy — popycha grę o jedno okno priorytetu. */
function passBoth(state) {
  for (let i = 0; i < 2; i += 1) {
    const pass = playerView(state, state.turn.priorityPlayerId).legalCommands
      .find((c) => c.type === 'pass_priority');
    if (!pass) return;
    execute(state, pass);
  }
}

/**
 * Rzuca Veiled Ascension i zwraca zdarzenia rozstrzygnięcia JEGO triggera
 * wejścia na pole bitwy („każdy zakryty stwór dostaje licznik flying").
 */
function castVeiledAscension(state) {
  putCard(state, 'asc', 'veiled-ascension', 'p1', 'hand');
  addMana(state, 'p1', 4, { colors: ['W'] });
  const cast = playerView(state, 'p1').legalCommands.find((c) => c.objectId === 'asc');
  assert.ok(cast, 'oferta rzutu Veiled Ascension');
  assert.ok(execute(state, cast).ok, 'rzut przyjęty');
  resolveAll(state);
  return state.events.filter((e) => e.type === 'trigger_resolved'
    && e.cardId === 'veiled-ascension' && e.saga !== true);
}

// ---- H1: pusty zbiór odbiorców to „brak legalnych celów", nie „nic do roboty"

test('H1: Veiled Ascension bez zakrytych stworów mówi „brak legalnych celów"', () => {
  const state = game('p1');
  putCard(state, 'moj', 'highland-game', 'p1'); // odkryty stwór — NIE odbiorca
  const resolved = castVeiledAscension(state);
  assert.ok(resolved.length > 0, 'trigger się rozstrzygnął');
  const noEffect = resolved.filter((e) => e.noEffect);
  assert.equal(noEffect.length, 1, 'dokładnie jedno rozstrzygnięcie bez efektu');
  assert.equal(noEffect[0].reason, 'no_targets',
    'powód: zbiór odbiorców pusty, nie „nie było czego wykonać"');
  const line = String(describeGameEvent(noEffect[0], HELPERS, NAMES));
  assert.match(line, /brak legalnych celów/, `komunikat dla gracza: ${JSON.stringify(line)}`);
});

test('H1b: kontrola pozytywna — zakryty stwór DOSTAJE licznik (bez komunikatu)', () => {
  const state = game('p1');
  putCard(state, 'morph', 'ember-beast', 'p1', 'battlefield');
  faceDown(state, 'morph');
  const resolved = castVeiledAscension(state);
  assert.ok(resolved.length > 0, 'trigger się rozstrzygnął');
  assert.deepEqual(resolved.filter((e) => e.noEffect).map((e) => e.reason), [],
    'są odbiorcy — brak komunikatu o braku efektu');
  const counters = state.objects.get('morph')?.counters ?? {};
  assert.ok((counters.flying ?? 0) >= 1, `licznik flying na zakrytym stworze: ${JSON.stringify(counters)}`);
});

test('H1c: zakryty stwór PRZECIWNIKA nie jest odbiorcą (selektor filtruje kontrolera)', () => {
  const state = game('p1');
  putCard(state, 'cudzy', 'ember-beast', 'p2', 'battlefield');
  faceDown(state, 'cudzy');
  const resolved = castVeiledAscension(state);
  const noEffect = resolved.filter((e) => e.noEffect);
  assert.equal(noEffect[0]?.reason, 'no_targets', 'cudzy zakryty stwór nie liczy się');
  assert.equal(state.objects.get('cudzy').counters?.flying ?? 0, 0,
    'cudzy stwór NIE dostaje licznika (anty-over-fix)');
});

// ---- H2: Trostani Discordant — „nikt nie trzyma cudzych stworów"

/** Wchodzi w krok końcowy aktywnego gracza (trigger `end_step`). */
function wejdzWEndStep(state) {
  state.turn = jumpToStep(state.turn, 'end_of_combat', state.turn.activePlayerId);
  for (let i = 0; i < 10 && state.turn.step !== 'end'; i += 1) passBoth(state);
  assert.equal(state.turn.step, 'end', 'gra weszła w krok końcowy');
  // Trigger `end_step` jest tylko KOLEJKOWANY przez wejście w krok (zdarzenie
  // `step_advanced`) — rozstrzyga się po domknięciu stosu.
  resolveAll(state);
}

test('H2: Trostani Discordant bez cudzych stworów mówi „brak legalnych celów"', () => {
  const state = game('p1');
  putCard(state, 'trostani', 'trostani-discordant', 'p1');
  wejdzWEndStep(state);
  const resolved = state.events.filter((e) => e.type === 'trigger_resolved'
    && e.cardId === 'trostani-discordant');
  assert.ok(resolved.length > 0, 'trigger kroku końca się rozstrzygnął');
  assert.equal(resolved.at(-1).noEffect, true, 'bez efektu');
  assert.equal(resolved.at(-1).reason, 'no_targets',
    'powód: żaden stwór nie jest u obcego kontrolera');
});

test('H2b: kontrola pozytywna — cudzy stwór wraca do właściciela (bez komunikatu)', () => {
  const state = game('p1');
  putCard(state, 'trostani', 'trostani-discordant', 'p1');
  // Stwór WŁASNOŚCI p2 pod kontrolą p1 (ownerId ≠ controllerId).
  putCard(state, 'porwany', 'highland-game', 'p1', 'battlefield', { ownerId: 'p2' });
  wejdzWEndStep(state);
  const resolved = state.events.filter((e) => e.type === 'trigger_resolved'
    && e.cardId === 'trostani-discordant');
  assert.ok(resolved.length > 0, 'trigger się rozstrzygnął');
  assert.deepEqual(resolved.filter((e) => e.noEffect).map((e) => e.reason), [],
    'są odbiorcy — brak komunikatu o braku efektu');
  assert.equal(state.objects.get('porwany').controllerId, 'p2',
    'stwór wraca do właściciela (CR 108.3)');
});

// ---- H3: anty-over-fix — efekt spoza tabeli zostaje przy „nie było czego wykonać"

test('H3: mill przy pustej bibliotece nadal mówi „nie było czego wykonać"', () => {
  // Chronic Flooding: „Whenever enchanted land becomes tapped, its controller
  // mills three cards." Przy PUSTEJ bibliotece nie ma kart do zmielenia —
  // to „nie było czego wykonać", a nie „brak legalnych celów" (cel jest:
  // kontroler zaczarowanego lądu). Anty-over-fix dla H1.
  const state = game('p1');
  putCard(state, 'flood', 'chronic-flooding', 'p1', 'hand');
  putCard(state, 'gaj', 'basic-plains', 'p2');
  addMana(state, 'p1', 2, { colors: ['U'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'flood'
      && ((c.targets ?? [])[0] === 'gaj' || c.targetId === 'gaj'));
  assert.ok(cast, 'rzut aury na cudzy ląd');
  assert.ok(execute(state, cast).ok);
  resolveAll(state);
  state.events.length = 0;
  state.turn.priorityPlayerId = 'p2';
  execute(state, { type: 'tap_for_mana', playerId: 'p2', objectId: 'gaj' });
  resolveAll(state);
  const resolved = state.events.filter((e) => e.type === 'trigger_resolved'
    && e.cardId === 'chronic-flooding');
  assert.ok(resolved.length > 0, 'trigger młynowania się rozstrzygnął');
  assert.equal(resolved.at(-1).noEffect, true, 'bez efektu (pusta biblioteka)');
  assert.equal(resolved.at(-1).reason, 'no_result',
    'mill NIE jest w tabeli odbiorców — cel istnieje, brakuje kart');
});

test('H3b: opis „brak legalnych celów" nie pojawia się dla milla (log gracza)', () => {
  const line = String(describeGameEvent(
    { type: 'trigger_resolved', cardId: 'chronic-flooding', noEffect: true, reason: 'no_result' },
    HELPERS, NAMES,
  ));
  assert.match(line, /nie było czego wykonać/, `komunikat: ${JSON.stringify(line)}`);
});
