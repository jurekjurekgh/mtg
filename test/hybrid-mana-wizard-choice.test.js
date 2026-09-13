// B — znalezisko właściciela (Esper Stormblade {W/B}{U}): silnik sam wybrał W
// dla hybrydy W/B (mimo nietapniętych Swampów i Plainsów), kreator many się
// nie otworzył. Root cause: solver jednoznaczności płatności był ślepy na
// KOLORY puli — dostawał tylko liczbę many (poolMana). Gdy pula pokrywała sumę
// (need<=0), zwracał 1 („brak wyboru") bez liczenia, choć kolory trzeba było
// dopiero dotapować (Plains czy Swamp dla {W/B}?). Gdy pula miała 1 manę,
// odcięcie `size>=need` ucinało zbiory wymuszone kolorami (0 wariantów).
// W obu przypadkach płatność szła w auto-tap, a ten bierze pierwsze pasujące
// źródło w kolejności pola bitwy (tu: Plains) — gracz tracił wybór.
// Naprawa: solver dostaje jednostki puli (poolUnits) i liczy jednoznaczność
// na (pula + tapnięcia) — kreator otwiera się zawsze, gdy ≥2 profile źródeł
// mogą sfinansować płatność (reguła właściciela M195/A).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { countPaymentVariants, shouldOpenManaWizard } from '../src/table/mana-wizard.js';

const REGISTRY = createCardRegistry();
const island = (id) => ({ id, cardId: 'basic-island', colors: ['U'], amount: 1 });
const plains = (id) => ({ id, cardId: 'basic-plains', colors: ['W'], amount: 1 });
const swamp = (id) => ({ id, cardId: 'basic-swamp', colors: ['B'], amount: 1 });
// Esper Stormblade {W/B}{U}: pip [U] + hybryda [W,B].
const REQS = [['U'], ['W', 'B']];

function game(playerId = 'p1') {
  const state = createGameState({ seed: 41, players: [{ id: 'p1' }, { id: 'p2' }] });
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

test('B/0: oferta działa — Stormblade oferowany przy I+P+S (kontrola, bug jest w solverze)', () => {
  const state = game('p1');
  putCard(state, 'i', 'basic-island', 'p1');
  putCard(state, 'p', 'basic-plains', 'p1');
  putCard(state, 's', 'basic-swamp', 'p1');
  putCard(state, 'blade', 'esper-stormblade', 'p1', 'hand');
  const view = playerView(state, 'p1');
  const offer = (view.legalCommands ?? []).find((c) => c.type === 'cast_permanent' && c.objectId === 'blade');
  assert.ok(offer, 'rzut oferowany (kolory się spinają)');
});

test('B/1: pula {U,W} pokrywa WSZYSTKO — kreator zbędny (auto z puli, wybór wymuszony)', () => {
  // Pula przesądza kolory (U←U, W/B←W) — zero tapnięć, zero wyboru.
  assert.equal(countPaymentVariants(
    [island('i'), plains('p'), swamp('s')], 2, 2, REQS, 2, [['U'], ['W']]), 1);
  assert.equal(shouldOpenManaWizard({
    sources: [island('i'), plains('p'), swamp('s')], poolMana: 2, poolUnits: [['U'], ['W']],
    totalNeeded: 2, requirements: REQS,
  }), false);
});

test('B/2: pula {U} + nietapnięte P+S — kreator MUSI zapytać (W czy B dla hybrydy)', () => {
  // Suma: pula(1) + 1 tapnięcie. Kolory: U z puli, W/B z Plains albo Swampa —
  // DWA profile. Dotąd: 0 wariantów (odcięcie size>=need) → cichy auto-tap
  // pierwszego lądu w kolejności stołu (silnik „sam wybrał W").
  assert.equal(countPaymentVariants(
    [island('i'), plains('p'), swamp('s')], 1, 2, REQS, 2, [['U']]), 2);
  assert.equal(shouldOpenManaWizard({
    sources: [island('i'), plains('p'), swamp('s')], poolMana: 1, poolUnits: [['U']],
    totalNeeded: 2, requirements: REQS,
  }), true);
});

test('B/3: pula {G,G} (zła waluta) + I+P+S — kreator MUSI zapytać', () => {
  // Suma z puli, ale kolory trzeba dotapować: {I,P} albo {I,S} — DWA profile.
  // Dotąd: gałąź need<=0 zwracała 1 bez liczenia → cichy auto-tap.
  assert.equal(countPaymentVariants(
    [island('i'), plains('p'), swamp('s')], 2, 2, REQS, 2, [['G'], ['G']]), 2);
  assert.equal(shouldOpenManaWizard({
    sources: [island('i'), plains('p'), swamp('s')], poolMana: 2, poolUnits: [['G'], ['G']],
    totalNeeded: 2, requirements: REQS,
  }), true);
});

test('B/4: pula {U} + tylko Plains (brak Swampa) — auto, W wymuszone', () => {
  assert.equal(countPaymentVariants(
    [island('i'), plains('p')], 1, 2, REQS, 2, [['U']]), 1);
  assert.equal(shouldOpenManaWizard({
    sources: [island('i'), plains('p')], poolMana: 1, poolUnits: [['U']],
    totalNeeded: 2, requirements: REQS,
  }), false);
});

test('B/5: pusta pula + I+P+S — kreator (działało dotąd, pin regresji)', () => {
  assert.equal(countPaymentVariants([island('i'), plains('p'), swamp('s')], 0, 2, REQS), 2);
  assert.equal(shouldOpenManaWizard({
    sources: [island('i'), plains('p'), swamp('s')], poolMana: 0,
    totalNeeded: 2, requirements: REQS,
  }), true);
});

test('B/6: silnik (bot, bez UI) płaci hybrydę deterministycznie w kolejności stołu', () => {
  const state = game('p1');
  putCard(state, 'i', 'basic-island', 'p1');
  putCard(state, 'p', 'basic-plains', 'p1');
  putCard(state, 's', 'basic-swamp', 'p1');
  putCard(state, 'blade', 'esper-stormblade', 'p1', 'hand');
  const result = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'blade' });
  assert.equal(result.ok, true, `rzut udany: ${JSON.stringify(result).slice(0, 160)}`);
  assert.equal(state.objects.get('i').tapped, true, 'Wyspa tapnięta (pip U)');
  assert.equal(state.objects.get('p').tapped, true, 'Równina pierwsza w kolejności (hybryda W/B → W)');
  assert.equal(state.objects.get('s').tapped, false, 'Swamp nietknięty (determinizm ADR 0005)');
});
