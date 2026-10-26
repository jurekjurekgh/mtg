/**
 * Audyt PR #173 (F-3, 2026-10-26): pin ŚCIEŻKI dla reguły M2 — sesja musi
 * wołać `interruptMutesOnNewTargetCombination` w `hasMeaningfulDecision`.
 *
 * Reguła M2 (właściciel, `110091b`): każda NOWA kombinacja celów trwale
 * przerywa wyciszenie grupy akcji, więc powrót planszy do dawnego układu
 * nie wskrzesza auto-passu. Test `zgloszenie-m2-…` wywołuje funkcję czystą
 * WPROST — mutacja z audytu (usunięcie jedynego wywołania w
 * `hasMeaningfulDecision`) przechodziła pełnym `npm test` 8836/8836:
 * reguła była zmierzona poza ścieżką produkcyjną (L5 pkt 4 — pin
 * kompozycji ma dwie nogi; L67 — helper istnieje, ale nie jest wołany
 * w gałęzi, gdzie miał chronić).
 *
 * Pin prowadzi scenariusz właściciela przez PRAWDZIWĄ sesję:
 * `createSession` z włączonym wyciszeniem grupy rzutu → okno człowieka
 * z ofertą „Shock w X" → pierwsza ocena auto-passu (migawka kombinacji,
 * wyciszenie trzyma, land w ręce zatrzymuje przewijanie) → wchodzi nowe
 * stworzenie Y → `recheckAutoPass()` ponownie ocenia okno → KAŻDY klucz
 * grupy skasowany (nowa kombinacja). Bez wywołania z
 * `hasMeaningfulDecision` druga asercja zostaje zielona fałszywie —
 * mutacja z audytu to potwierdziła.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession, commandOptionKey, HUMAN_ID, BOT_ID } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createCardDeck } from '../src/cards/materialize.js';
import { execute, addObject, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, zone, playerId) {
  const [entry] = createCardDeck({ cardIds: [cardId], ownerId: playerId, registry: REGISTRY });
  const { objectId, ...data } = entry;
  state.objects.set(id, Object.freeze({
    ...data, id, instanceId: `i-${id}`, controllerId: playerId, ownerId: playerId, zone,
  }));
  state.zones[zone].push(id);
  return state.objects.get(id);
}

function creature(state, id, playerId) {
  const obj = put(state, id, 'goblin-piker', 'battlefield', playerId);
  state.objects.set(id, Object.freeze({ ...obj, summoningSickness: false }));
  return state.objects.get(id);
}

test('F3/1: sesja kasuje wyciszenie grupy przy NOWEJ kombinacji celów (pin wywołania w auto-passie)', () => {
  const ignored = new Set();
  const session = createSession({
    seed: 7,
    registry: REGISTRY,
    decks: new Map([
      [HUMAN_ID, Array.from({ length: 12 }, () => 'basic-mountain')],
      [BOT_ID, Array.from({ length: 12 }, () => 'basic-mountain')],
    ]),
    ignoredOptionKeys: ignored,
    pauseOnBotMoves: false,
  });
  const state = session.state;
  // Mulligany obu stron (wzorzec U/1 — okna po kolei, priorytet po stronie stanu).
  for (let i = 0; i < 12; i += 1) {
    const m = playerView(state, state.turn.priorityPlayerId).legalCommands
      .find((c) => c.type === 'resolve_mulligan_choice');
    if (!m) break;
    assert.equal(execute(state, { ...m, keep: true }).ok, true);
  }
  // Scena: główna faza człowieka, jedna Góra (manę dokładamy ręcznie),
  // Shock w ręce JAKO JEDYNA karta obok lądu do zagrania (auto-pass staje
  // na land dropie — okno nie przewija się poza migawkę).
  state.turn = jumpToStep(state.turn, 'main', HUMAN_ID);
  state.turn.activePlayerId = HUMAN_ID;
  state.turn.priorityPlayerId = HUMAN_ID;
  for (const id of [...state.zones.hand]) {
    const o = state.objects.get(id);
    if (o?.controllerId !== HUMAN_ID) continue;
    state.zones.hand = state.zones.hand.filter((x) => x !== id);
    const gid = `g-${state.objectSequence++}`;
    state.zones.graveyard.push(gid);
    state.objects.delete(id);
    state.objects.set(gid, Object.freeze({ ...o, id: gid, zone: 'graveyard' }));
  }
  put(state, 'mtn', 'basic-mountain', 'battlefield', HUMAN_ID);
  put(state, 'shock', 'shock', 'hand', HUMAN_ID);
  state.players.find((p) => p.id === HUMAN_ID).landPlays = 1;
  creature(state, 'foe1', BOT_ID);

  // Wyciszenie wariantu „Shock w foe1" (panel zrobiłby to ptaszkiem).
  const castX = playerView(state, HUMAN_ID).legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'shock'
      && (c.targets ?? []).length === 1 && c.targets[0] === 'foe1');
  assert.ok(castX, 'oferta Shock w foe1 jest w oknie');
  ignored.add(commandOptionKey(castX));
  assert.equal(ignored.size, 1);

  // Pierwsza ocena okna (auto-pass): migawka kombinacji zapamiętana,
  // wyciszenie obowiązuje — klucze ZOSTAJĄ (land w ręce zatrzymuje okno).
  session.recheckAutoPass();
  assert.equal(ignored.size, 1,
    'stabilna kombinacja nie kasuje wyciszenia (funkcja czysta + ścieżka sesji)');

  // NOWE stworzenie wroga = nowa kombinacja celów tej samej grupy.
  creature(state, 'foe2', BOT_ID);
  session.recheckAutoPass();
  assert.equal(ignored.size, 0,
    'sesja (hasMeaningfulDecision) musi PRZERWAĆ wyciszenie grupy przy '
    + 'nowej kombinacji — bez wywołania interruptMutes w auto-passie '
    + 'wyciszenie wróciłoby samo po powrocie układu (reguła M2, znalezisko F-3)');
});
