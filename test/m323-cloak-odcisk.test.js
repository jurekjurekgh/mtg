import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView, execute } from '../src/engine/game-state.js';
import { stateFingerprint } from '../src/engine/fingerprint.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { applyEffect } from '../src/engine/effects.js';
import { addMana } from '../src/engine/resources.js';

/**
 * M323 (audyt PR #102, F3 — klasa L16/M122#1 i M187/N1): pola stanu, które
 * zmieniają PRZYSZŁE możliwości, należą do odcisku stanu.
 *
 * Zmierzone SONDAŻEM na prawdziwym cloaku (przed naprawą):
 *   • zdjęcie `cloakReady` przełączało liczbę legalnych komend
 *     `turn_cloak_face_up` z 1 na 0, a `stateFingerprint` zostawał IDENTYCZNY;
 *   • zmiana kwoty `ward` (2 → 1) nie ruszała odcisku.
 * Czyli sonda „oferta bez skutku\" i weryfikacja replayów były ślepe na cały
 * stan zakrycia gotowego do obrotu. Rodzeństwo (`manifestReady`,
 * `madnessReady`, `abilityResolvedThisTurn`) siedziało w odcisku od dawna.
 */

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId, zone = 'battlefield') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, morph: def.morph ?? null,
  });
  return state.objects.get(id);
}

/** Cloak wierzchu biblioteki p1 (Veiled Ascension) + mana na obrót. */
function cloaked(cardId = 'plague-reaver', mana = 8) {
  const state = createGameState({ seed: 324, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  put(state, 'va', 'veiled-ascension', 'p1');
  put(state, 'lib-0', cardId, 'p1', 'library');
  state.zones.library = ['lib-0'];
  applyEffect(state, { type: 'cloak' }, state.objects.get('va'), []);
  const cloak = state.zones.battlefield.map((id) => state.objects.get(id)).find((o) => o.faceDown);
  if (mana > 0) addMana(state, 'p1', mana, { colors: ['B'] });
  return { state, cloakId: cloak.id };
}

const uncoverOffers = (state) => playerView(state, 'p1').legalCommands
  .filter((cmd) => cmd.type === 'turn_cloak_face_up').length;

const patch = (ctx, fields) => {
  ctx.state.objects.set(ctx.cloakId, Object.freeze({ ...ctx.state.objects.get(ctx.cloakId), ...fields }));
};

test('M323/A: zdjęcie cloakReady zabiera ofertę obrotu — odcisk musi się zmienić', () => {
  const ctx = cloaked();
  assert.equal(uncoverOffers(ctx.state), 1, 'baza: obrót zaoferowany');
  const zFlagą = stateFingerprint(ctx.state);
  patch(ctx, { cloakReady: false, cloakTurnUpCost: null });
  assert.equal(uncoverOffers(ctx.state), 0, 'bez flagi: brak oferty (L48 — oferta = walidacja)');
  assert.notEqual(stateFingerprint(ctx.state), zFlagą,
    'dwa stany różniące się liczbą legalnych komend nie mogą mieć tego samego odcisku');
});

test('M323/B: kwota wardu jest częścią odcisku (decyduje, ile kosztuje celowanie)', () => {
  const ctx = cloaked();
  const przed = stateFingerprint(ctx.state);
  assert.equal(ctx.state.objects.get(ctx.cloakId).ward, 2, 'baza: ward {2} z 701.56a');
  patch(ctx, { ward: 1 });
  assert.notEqual(stateFingerprint(ctx.state), przed, 'ward {1} ≠ ward {2} w odcisku');
});

test('M323/C: kontrola — prawdziwy obrót zmienia odcisk (nie mylimy pól z efektem)', () => {
  const ctx = cloaked();
  const przed = stateFingerprint(ctx.state);
  const cmd = playerView(ctx.state, 'p1').legalCommands.find((c) => c.type === 'turn_cloak_face_up');
  const r = execute(ctx.state, cmd);
  assert.ok(r.ok, 'uncover przyjęty');
  assert.notEqual(stateFingerprint(ctx.state), przed, 'skutek widoczny w odcisku');
  assert.equal(ctx.state.objects.get(ctx.cloakId).cloakReady, false, 'flaga zdjęta przy obrocie');
});

test('M323/D (pin decyzji): numer zakrycia ŚWIADOMIE poza odciskiem', () => {
  // Nie zmienia żadnej legalnej komendy — jest nośnikiem etykiety (L16 mówi o
  // polach WARUNKUJĄCYCH możliwości, nie o każdym polu). Pin, żeby granica
  // reguły była zapisana, a nie odkrywana co sesję od nowa.
  const ctx = cloaked();
  const przed = stateFingerprint(ctx.state);
  patch(ctx, { copyNumber: 7 });
  assert.equal(stateFingerprint(ctx.state), przed, 'sam numer kopii nie jest faktem gry');
});
