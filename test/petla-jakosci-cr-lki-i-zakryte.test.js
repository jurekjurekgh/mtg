/**
 * Pętla jakości (2026-10-23, ADR 0021 + ADR 0030) — polowanie na rozjazdy CR
 * w silniku zmian stref (`moveObjectDirectly`) i LKI triggerów odejścia (`CR 603.10a`):
 *
 *   CR-1 (`CR 708.9` + `CR 400.7` + `CR 708.2a`): zakryty permanent (Cloak /
 *        Manifest / Morph) po opuszczeniu pola bitwy (śmierć, odbicie na rękę,
 *        wygnanie) oraz zakryty czar po zejściu ze stosu poza pole bitwy muszą
 *        odzyskać pełne cechy wydrukowanej karty (`faceDownOriginal` +
 *        `originalAbilities`, w tym `kind: 'spell'` dla zakrytego instanta),
 *        a jednocześnie zakryty stwór ginący jako zakryty NIE może odpalić
 *        wydrukowanego triggera `dies` (`CR 603.10a`).
 *   CR-2 (`CR 603.10a` + `CR 113.6`): stwór pozbawiony zdolności na polu bitwy
 *        (`abilitiesStripped: true`, Xu-Ifit, Osteoharmonist) ginący w walce lub
 *        od obrażeń NIE odpala wydrukowanego triggera `dies`, mimo że w grobie
 *        karta odzyskuje swoje wydrukowane zdolności (`CR 400.7`).
 *   CR-3 (`CR 603.10a` + `CR 707.2`): nietokenowa kopia stwora (*Jwari Shapeshifter*)
 *        opuszczająca pole bitwy ODPALA skopiowany trigger `dies` /
 *        `leaves_battlefield` z LKI, mimo że sama karta poza polem bitwy wraca
 *        do wydrukowanego *Jwari Shapeshiftera* (`CR 400.7`).
 *   CR-4 (`CR 603.10a` + `CR 400.3`): cudzy permanent kontrolowany na polu bitwy
 *        przez `p1` (`ownerId: 'p2', controllerId: 'p1'`) i wygnany przez
 *        `exile_permanent` (`Secure the Scene`) wyzwala trigger „permanents you
 *        control leave the battlefield" (`Nefarious Imp`) u `p1`, a nie u `p2`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createCardDeck } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { applyEffect } from '../src/engine/effects.js';

const registry = createCardRegistry();

function put(state, id, cardId, zone = 'battlefield', playerId = 'p1', patch = {}) {
  const [{ objectId, ...data }] = createCardDeck({ cardIds: [cardId], ownerId: playerId, registry });
  addObject(state, { ...data, id, instanceId: `i-${id}`, controllerId: playerId, zone });
  if (Object.keys(patch).length) {
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
  }
  return state.objects.get(id);
}

function makeGame() {
  const state = createGameState({ seed: 2026, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  for (const p of ['p1', 'p2']) {
    for (let i = 0; i < 6; i += 1) put(state, `lib-${p}-${i}`, 'basic-swamp', 'library', p);
  }
  return state;
}

function run(state, cmd) {
  assert.ok(cmd, 'oczekiwano legalnej komendy');
  const res = execute(state, cmd);
  assert.equal(res.ok, true, JSON.stringify(res));
  return res;
}

function resolveAll(state) {
  for (let i = 0; state.zones.stack.length > 0 && i < 40; i += 1) {
    const pid = state.turn.priorityPlayerId;
    run(state, playerView(state, pid).legalCommands.find((c) => c.type === 'pass_priority'));
  }
  assert.equal(state.zones.stack.length, 0, 'stos powinien się opróżnić');
}

test('CR-1 (CR 708.9 + CR 400.7 + CR 603.10a): zakryty permanent po śmierci odzyskuje cechy karty w grobie, ale nie odpala drukowanego dies', () => {
  const state = makeGame();
  const cloakSrc = put(state, 'src', 'basic-swamp', 'battlefield', 'p1');

  // 1a) Zakryty Highland Game (2/1, „When this creature dies, you gain 2 life") ginie od Shocka.
  put(state, 'top-elk', 'highland-game', 'library', 'p1');
  state.zones.library = ['top-elk', ...state.zones.library.filter((id) => id !== 'top-elk')];
  applyEffect(state, { type: 'cloak' }, cloakSrc, []);
  const cloakedElk = [...state.objects.values()].find((o) => o.zone === 'battlefield' && o.faceDown);
  assert.ok(cloakedElk, 'Highland Game wszedł zakryty przez cloak');

  // Zabijamy przez właściciela (omijamy ward {2} przeciwnika): Shock z ręki p1.
  put(state, 'shock-1', 'shock', 'hand', 'p1');
  addMana(state, 'p1', 1, { colors: ['R'] });
  run(state, playerView(state, 'p1').legalCommands.find(
    (c) => c.type === 'cast_spell' && c.objectId === 'shock-1' && c.targets?.includes(cloakedElk.id),
  ));
  resolveAll(state);

  const elkInGrave = [...state.objects.values()].find((o) => o.zone === 'graveyard' && o.cardId === 'highland-game');
  assert.ok(elkInGrave, 'Highland Game trafił do grobu');
  assert.equal(elkInGrave.faceDown, false);
  assert.equal(elkInGrave.cardName, 'Highland Game', 'w grobie karta musi odzyskać nazwę (CR 708.9)');
  assert.equal(elkInGrave.manaCost, 2, 'w grobie karta musi odzyskać koszt many 2 (CR 708.9 + CR 400.7)');
  assert.equal(elkInGrave.power, 2);
  assert.equal(elkInGrave.toughness, 1, 'w grobie karta musi odzyskać wydrukowane 2/1 zamiast 2/2 zakrycia');
  assert.equal(elkInGrave.abilities.length, 1, 'w grobie karta musi odzyskać wydrukowaną zdolność');
  const p1Life = state.players.find((p) => p.id === 'p1').life;
  assert.equal(p1Life, 20, 'zakryty stwór ginący jako zakryty NIE może odpalić wydrukowanego dies (CR 603.10a)');

  // 1b) Zakryty Instant (Shock) jako Cloak 2/2 po śmierci wraca w grobie do kind='spell' i types=['Instant'].
  put(state, 'top-inst', 'shock', 'library', 'p1');
  state.zones.library = ['top-inst', ...state.zones.library.filter((id) => id !== 'top-inst')];
  applyEffect(state, { type: 'cloak' }, cloakSrc, []);
  const cloakedInst = [...state.objects.values()].find((o) => o.zone === 'battlefield' && o.faceDown);
  assert.ok(cloakedInst, 'Shock wszedł zakryty jako stwór 2/2');

  put(state, 'shock-2', 'shock', 'hand', 'p1');
  addMana(state, 'p1', 1, { colors: ['R'] });
  run(state, playerView(state, 'p1').legalCommands.find(
    (c) => c.type === 'cast_spell' && c.objectId === 'shock-2' && c.targets?.includes(cloakedInst.id),
  ));
  resolveAll(state);

  const shocksInGrave = [...state.objects.values()].filter((o) => o.zone === 'graveyard' && o.cardId === 'shock');
  assert.equal(shocksInGrave.length, 3);
  for (const s of shocksInGrave) {
    assert.equal(s.kind, 'spell', `każdy Shock w grobie musi mieć kind='spell', nie 'creature': ${JSON.stringify(s)}`);
    assert.deepEqual(s.types, ['Instant']);
    assert.equal(s.cardName, 'Shock');
  }
});

test('CR-2 (CR 603.10a + CR 113.6): stwór reanimowany przez Xu-Ifita bez zdolności nie odpala wydrukowanego dies przy śmierci', () => {
  const state = makeGame();
  put(state, 'xu', 'xu-ifit-osteoharmonist', 'battlefield', 'p1', { summoningSickness: false });
  put(state, 'dead-elk', 'highland-game', 'graveyard', 'p1');

  run(state, playerView(state, 'p1').legalCommands.find(
    (c) => c.type === 'activate_ability' && c.objectId === 'xu' && c.targets?.includes('dead-elk'),
  ));
  resolveAll(state);

  const skeleton = [...state.objects.values()].find((o) => o.zone === 'battlefield' && o.cardId === 'highland-game');
  assert.ok(skeleton?.abilitiesStripped, 'Xu-Ifit odebrał zdolności na polu bitwy');

  put(state, 'shock', 'shock', 'hand', 'p1');
  addMana(state, 'p1', 1, { colors: ['R'] });
  run(state, playerView(state, 'p1').legalCommands.find(
    (c) => c.type === 'cast_spell' && c.objectId === 'shock' && c.targets?.includes(skeleton.id),
  ));
  resolveAll(state);

  const p1Life = state.players.find((p) => p.id === 'p1').life;
  assert.equal(p1Life, 20, 'stwór bez zdolności na polu bitwy nie może odpalić dies po przejściu do grobu (CR 603.10a)');
  const backInGrave = [...state.objects.values()].find((o) => o.zone === 'graveyard' && o.cardId === 'highland-game');
  assert.equal(backInGrave.abilitiesStripped, false, 'w grobie karta odzyskuje druk (CR 400.7)');
});

test('CR-3 (CR 603.10a + CR 707.2): Jwari Shapeshifter kopiujący Ally z triggerem dies odpala skopiowany dies mimo powrotu do cech karty w grobie', () => {
  const state = makeGame();
  // Highland Game z nadanym podtypem Ally (np. efekt zmiany podtypu / Changeling) jako wzorzec kopii.
  const allyElk = put(state, 'ally-elk', 'highland-game', 'battlefield', 'p1', { subtypes: Object.freeze(['Elk', 'Ally']) });
  put(state, 'jwari', 'jwari-shapeshifter', 'hand', 'p1');
  addMana(state, 'p1', 2, { colors: ['U'] });

  run(state, playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_permanent' && c.objectId === 'jwari'));
  for (let i = 0; !state.pendingEnterAsCopy && i < 10; i += 1) {
    const pid = state.turn.priorityPlayerId;
    run(state, playerView(state, pid).legalCommands.find((c) => c.type === 'pass_priority'));
  }
  run(state, { type: 'resolve_enter_as_copy', playerId: 'p1', targetId: allyElk.id });
  resolveAll(state);

  const jwariOnBf = [...state.objects.values()].find((o) => o.zone === 'battlefield' && o.cardId === 'jwari-shapeshifter');
  assert.ok(jwariOnBf, 'Jwari Shapeshifter wszedł jako kopia Highland Game');

  put(state, 'shock', 'shock', 'hand', 'p1');
  addMana(state, 'p1', 1, { colors: ['R'] });
  run(state, playerView(state, 'p1').legalCommands.find(
    (c) => c.type === 'cast_spell' && c.objectId === 'shock' && c.targets?.includes(jwariOnBf.id),
  ));
  resolveAll(state);

  const p1Life = state.players.find((p) => p.id === 'p1').life;
  assert.equal(p1Life, 22, 'kopia musi odpalić skopiowany trigger dies z LKI i dać +2 życia (CR 603.10a + CR 707.2)');
  const jwariInGrave = [...state.objects.values()].find((o) => o.zone === 'graveyard' && o.cardId === 'jwari-shapeshifter');
  assert.deepEqual(jwariInGrave.abilities, [], 'w grobie Jwari Shapeshifter nie ma już skopiowanych zdolności (CR 400.7)');
});

test('CR-4 (CR 603.10a + CR 400.3): przejęty cudzy stwór wygnany przez exile_permanent wyzwala Nefarious Impa u kontrolera z pola bitwy, nie u właściciela', () => {
  const state = makeGame();
  put(state, 'imp-p1', 'nefarious-imp', 'battlefield', 'p1');
  put(state, 'imp-p2', 'nefarious-imp', 'battlefield', 'p2');
  // Stwór należący do p2 (ownerId='p2'), ale kontrolowany na polu bitwy przez p1 (controllerId='p1').
  const stolen = put(state, 'stolen-guide', 'coralhelm-guide', 'battlefield', 'p2', { controllerId: 'p1' });
  assert.equal(stolen.ownerId, 'p2');
  assert.equal(stolen.controllerId, 'p1');

  put(state, 'secure', 'secure-the-scene', 'hand', 'p1');
  addMana(state, 'p1', 5, { colors: ['W'] });
  run(state, playerView(state, 'p1').legalCommands.find(
    (c) => c.type === 'cast_spell' && c.objectId === 'secure' && c.targets?.includes(stolen.id),
  ));
  // Rozstrzygamy Secure the Scene (2× pass_priority), ale zatrzymujemy się przed rozstrzygnięciem triggera scry na stosie.
  run(state, { type: 'pass_priority', playerId: 'p1' });
  run(state, { type: 'pass_priority', playerId: 'p2' });

  const triggersOnStack = state.zones.stack.map((id) => state.objects.get(id));
  assert.equal(triggersOnStack.length, 1, `dokładnie jeden Nefarious Imp powinien odpalić: ${JSON.stringify(triggersOnStack.map((t) => t.controllerId))}`);
  assert.equal(triggersOnStack[0].controllerId, 'p1', 'trigger odejścia z pola bitwy należy do kontrolera z chwili odejścia (p1), nie właściciela (p2)');
});
