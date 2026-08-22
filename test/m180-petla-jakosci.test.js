// M180 — pętla jakości Żywym Testerem (Batch 41/42 + nowe talie).
// Naprawy Z2–Z5 (Z1 w test/m179-inwentaryzacja.test.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { applyEffect } from '../src/engine/effects.js';
import { commandLabel, OPTION_IGNORABLE_TYPES } from '../src/table/render.js';
import { odmienNaDrugaOsobe } from '../src/table/session.js';

const REGISTRY = createCardRegistry();

function game(playerId = 'p1') {
  const state = createGameState({ seed: 180, players: [{ id: 'p1' }, { id: 'p2' }] });
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

// ---- Z2: tokeny nazwane w celach (isToken jawnie w widoku) --------------------

test('Z2a: playerView niesie isToken JAWNIE (render rozpoznaje tokeny po fladze)', () => {
  const state = game('p1');
  const squirrel = putCard(state, 'wolf-src', 'highland-game', 'p1');
  applyEffect(state, {
    type: 'create_token', cardId: 'token_squirrel', name: 'Squirrel', kind: 'creature',
    power: 1, toughness: 1, colors: ['G'], types: ['Creature'], subtypes: ['Squirrel'], amount: 1,
  }, squirrel, []);
  const entry = playerView(state, 'p2').zones.battlefield.find((o) => o.cardId === 'token_squirrel');
  assert.ok(entry, 'token w widoku przeciwnika');
  assert.equal(entry.isToken, true, 'flaga isToken jawnie w widoku (klasa L1/ADR 0017)');
  assert.equal(entry.name, 'Squirrel');
});

test('Z2b: etykieta celu nazywa token po imieniu, nie surowym id (obrona po token_*)', () => {
  const state = game('p2');
  const src = putCard(state, 'src', 'highland-game', 'p2');
  applyEffect(state, {
    type: 'create_token', cardId: 'token_squirrel', name: 'Squirrel', kind: 'creature',
    power: 1, toughness: 1, colors: ['G'], types: ['Creature'], subtypes: ['Squirrel'], amount: 1,
  }, src, []);
  const view = playerView(state, 'p1');
  const token = view.zones.battlefield.find((o) => o.cardId === 'token_squirrel');
  const session = {
    nameOf: (id) => REGISTRY.get(id)?.name ?? String(id),
    nameOfObject: (id) => String(id),
    cardDetails: (id) => REGISTRY.get(id) ?? null,
    colorsOf: (id) => REGISTRY.get(id)?.colors ?? [],
    faceDownName: (n) => n ?? 'morph',
    view: () => view,
  };
  const label = String(commandLabel({ type: 'cast_spell', objectId: 'x', targets: [token.id] }, session, view));
  assert.ok(!label.includes('token_'), `surowy id tokenu w etykiecie: ${label}`);
  assert.ok(label.includes('Squirrel'), `brak nazwy tokenu: ${label}`);
});

// ---- Z3: odmiana „dostaje” ----------------------------------------------------

test('Z3: „Ty dostaje +1 licznik poison” → „Dostajesz…” (DRUGA_OSOBA)', () => {
  assert.equal(odmienNaDrugaOsobe('Ty dostaje +1 licznik poison'), 'Dostajesz +1 licznik poison');
});

// ---- Z4: wyciszalna decyzja Halo Foragera ------------------------------------

test('Z4: resolve_grave_free_cast w OPTION_IGNORABLE_TYPES (ptaszek w modalu)', () => {
  assert.ok(OPTION_IGNORABLE_TYPES.includes('resolve_grave_free_cast'));
  // Dotychczasowe typy zostały (regresja):
  for (const t of ['cast_spell', 'activate_ability', 'cast_permanent']) {
    assert.ok(OPTION_IGNORABLE_TYPES.includes(t), t);
  }
});

// ---- Z5: powtórny becomes_subtype to no-op (oferta schowana) -----------------

test('Z5: Krotiq Nestguard — druga aktywacja w tej samej turze nie jest oferowana', () => {
  const state = game('p1');
  putCard(state, 'krotiq', 'krotiq-nestguard', 'p1', 'battlefield');
  addMana(state, 'p1', 8, { colors: ['G'] });
  const first = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'krotiq');
  assert.ok(first, 'pierwsza aktywacja oferowana');
  assert.ok(execute(state, first).ok);
  for (let i = 0; i < 6 && state.zones.stack.length > 0; i += 1) {
    execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  }
  assert.ok((state.objects.get('krotiq').lostKeywordsUntilEOT ?? []).includes('defender'), 'defender zdjęty do EOT');
  const again = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'krotiq');
  assert.equal(again, undefined, 'powtórka = no-op, oferta schowana (precedens M103/M104)');
});
