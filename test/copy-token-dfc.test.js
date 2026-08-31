// M90 — crash ujawniony pełnym benchmarkiem B0 (obecny już w main 10fe8b7):
//   „Błąd benchmarku: Ta karta nie ma drugiej strony (craft)"
//   at applyEffect (effects.js:2275) ← craft_transform
//   at resolveActivatedAbilityEntry ← rozstrzyganie zdolności ze stosu
//
// Scenariusz: Cogwork Assembler tworzy token-kopię artefaktu (`create_copy_token`).
// Gdy kopiowanym artefaktem jest Lodestone Needle (dwustronna karta DFC
// z craftem), token dostaje SKOPIOWANE ZDOLNOŚCI (w tym craft), ale NIE
// dostaje `transformTo` — druga strona nie jest kopiowana. Bot aktywuje na
// tokenie craft i engine rzuca wyjątkiem, przerywając partię.
//
// Root cause: `create_copy_token` w src/engine/effects.js kopiował
// charakterystyki jednej strony (P/T, typy, podtypy, kolory, zdolności),
// pomijając deskryptor drugiej strony.
//
// CR 707.8a: „If an effect creates a token that is a copy of a [transforming]
// double-faced permanent (...), the resulting token is a [transforming] token
// that has both a front face and a back face. The characteristics of each face
// are determined by the copiable values of the same face of the permanent it is
// a copy of." Token-kopia DFC MUSI więc nieść obie strony i móc się przemienić.
//
// Fix u root cause (nie maskowanie): `create_copy_token` kopiuje `transformTo`
// razem z resztą wartości kopiowalnych.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createCardDeck } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { applyEffect } from '../src/engine/effects.js';

const REGISTRY = createCardRegistry();

/** Dane obiektu gry dla karty — z tą samą ścieżką co talia (niesie transformTo). */
function deckData(cardId, ownerId) {
  const [entry] = createCardDeck({ cardIds: [cardId], ownerId, registry: REGISTRY });
  const { id, cardId: _cardId, ownerId: _ownerId, ...data } = entry;
  return data;
}

function table() {
  const state = createGameState({ seed: 4242, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  addMana(state, 'p1', 10);
  return state;
}

function putNeedle(state, id = 'needle') {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'lodestone-needle', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'artifact', ...deckData('lodestone-needle', 'p1'),
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

test('token-kopia karty dwustronnej niesie drugą stronę (CR 707.8a)', () => {
  const state = table();
  const needle = putNeedle(state);
  assert.ok(needle.transformTo, 'oryginał musi mieć deskryptor drugiej strony (kontrola założeń testu)');

  // Cogwork Assembler: „Create a token that's a copy of target artifact."
  const assembler = addObject(state, {
    id: 'assembler', instanceId: 'i-assembler', cardId: 'cogwork-assembler', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'creature', ...deckData('cogwork-assembler', 'p1'),
  });
  applyEffect(state, { type: 'create_copy_token' }, assembler, [needle.id]);

  const token = [...state.objects.values()].find((o) => o.zone === 'battlefield' && o.name && o.cardId === 'lodestone-needle');
  assert.ok(token, 'token-kopia artefaktu musi powstać');
  assert.ok(token.transformTo, 'token-kopia DFC MUSI nieść drugą stronę (CR 707.8a)');
  assert.equal(token.transformTo.cardId, 'guidestone-compass');
});

test('craft na tokenie-kopii DFC nie wywala partii (crash z benchmarku B0)', () => {
  const state = table();
  const needle = putNeedle(state);
  const assembler = addObject(state, {
    id: 'assembler', instanceId: 'i-assembler', cardId: 'cogwork-assembler', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'creature', ...deckData('cogwork-assembler', 'p1'),
  });
  applyEffect(state, { type: 'create_copy_token' }, assembler, [needle.id]);
  const token = [...state.objects.values()].find((o) => o.zone === 'battlefield' && o.name && o.cardId === 'lodestone-needle');
  assert.ok(token);

  // Drugi artefakt do wygnania kosztem craftu (żeby decyzja miała kandydata).
  addObject(state, {
    id: 'fodder', instanceId: 'i-fodder', cardId: 'lodestone-needle', controllerId: 'p1', ownerId: 'p1',
    zone: 'graveyard', kind: 'artifact', ...deckData('lodestone-needle', 'p1'),
  });

  // Aktywacja craftu na TOKENIE — dokładnie to robił bot w benchmarku.
  const craftIndex = (token.abilities ?? []).findIndex((a) => a?.keyword === 'craft');
  assert.ok(craftIndex >= 0, 'token skopiował zdolność craft (kontrola założeń testu)');
  addMana(state, 'p1', 10);
  const activate = { type: 'activate_ability', playerId: 'p1', objectId: token.id, abilityIndex: craftIndex };
  const result = execute(state, activate);
  assert.ok(result.ok, `aktywacja craftu odrzucona: ${result.events?.[0]?.reason}`);

  // Rozstrzygnięcie zdolności ze stosu NIE MOŻE rzucić wyjątkiem.
  assert.doesNotThrow(() => {
    for (let i = 0; i < 6 && state.zones.stack.length > 0; i += 1) {
      const view = playerView(state, state.turn.priorityPlayerId);
      const pass = view.legalCommands.find((c) => c.type === 'pass_priority');
      if (!pass) break;
      execute(state, pass);
    }
  }, 'craft na tokenie-kopii DFC nie może przerywać partii wyjątkiem');
});

// ---- M264/Etap 2.3: frontFaceId na dwustronnym tokenie-kopii (CR 707.8a) ----
// Token utworzony jako kopia DFC jest tokenem DWUSTRONNYM — oprócz
// transformTo (M90) musi nieść tożsamość twarzy PRZEDNIEJ pary (frontFaceId).
// Bez niej inwariant „cardId ≠ frontFaceId ⇒ na tyle" (copyManaValueOf,
// dfcFaceReset) nie rozpoznaje kopii tyłu: kopia kopii transformowanego DFC
// nie mogłaby policzyć MV 0 (CR 202.3b), a reset K5 (CR 711.4a) nie odpaliłby
// się, gdyby kopia kiedykolwiek wróciła poza pole bitwy.
test('M264/2.3-C1: token-kopia DFC niesie frontFaceId pierwowzoru (CR 707.8a)', () => {
  const state = table();
  const needle = putNeedle(state);
  const assembler = addObject(state, {
    id: 'assembler', instanceId: 'i-assembler', cardId: 'cogwork-assembler', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'creature', ...deckData('cogwork-assembler', 'p1'),
  });
  applyEffect(state, { type: 'create_copy_token' }, assembler, [needle.id]);
  const token = [...state.objects.values()].find((o) => o.zone === 'battlefield' && o.isToken && o.cardId === 'lodestone-needle');
  assert.ok(token, 'token-kopia powstał');
  assert.ok(token.transformTo, 'token dwustronny (M90)');
  assert.equal(token.frontFaceId, 'lodestone-needle', 'frontFaceId wędruje z pierwowzorem (RED: null)');
});

test('M264/2.3-C2: kopia TYLNEJ twarzy niesie front pierwotnej pary i trzyma go w transformacji', () => {
  const state = table();
  const needle = putNeedle(state);
  applyEffect(state, { type: 'transform' }, needle, []);
  assert.equal(state.objects.get('needle').cardId, 'guidestone-compass', 'tył w górę (kontrola założeń)');

  const assembler = addObject(state, {
    id: 'assembler', instanceId: 'i-assembler', cardId: 'cogwork-assembler', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'creature', ...deckData('cogwork-assembler', 'p1'),
  });
  applyEffect(state, { type: 'create_copy_token' }, assembler, ['needle']);
  const token = [...state.objects.values()].find((o) => o.zone === 'battlefield' && o.isToken && o.cardId === 'guidestone-compass');
  assert.ok(token, 'kopii tyłu powstała');
  assert.equal(token.frontFaceId, 'lodestone-needle', 'kopia tyłu zna front pary (RED: null)');

  // transformacja w obie strony: frontFaceId ma przetrwać (spread), bo to
  // tożsamość PARY, nie bieżącej twarzy.
  applyEffect(state, { type: 'transform' }, token, []);
  const front = state.objects.get(token.id);
  assert.equal(front.cardId, 'lodestone-needle');
  assert.equal(front.frontFaceId, 'lodestone-needle', 'przód: frontFaceId = bieżąca twarz');
  applyEffect(state, { type: 'transform' }, front, []);
  const back = state.objects.get(token.id);
  assert.equal(back.cardId, 'guidestone-compass');
  assert.equal(back.frontFaceId, 'lodestone-needle', 'tył: frontFaceId wciąż wskazuje front (RED: null)');
  assert.equal(back.transformTo.cardId, 'lodestone-needle', 'pętla transformTo nie tworzy chimery');
});

test('M264/2.3-C3: token Incubator (dwustronny, 701.51) niesie frontFaceId', () => {
  const state = table();
  const source = addObject(state, {
    id: 'src', instanceId: 'i-src', cardId: 'cogwork-assembler', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'creature', ...deckData('cogwork-assembler', 'p1'),
  });
  applyEffect(state, { type: 'incubate', amount: 2 }, source, []);
  const incubator = [...state.objects.values()].find((o) => o.isToken && o.cardId === 'token_incubator');
  assert.ok(incubator, 'Incubator powstał');
  assert.ok(incubator.transformTo, 'Incubator jest dwustronny (701.51)');
  // frontFaceId: tożsamość frontu pary — kopia Phyrexiana (tył) musi umieć
  // policzyć MV 0 (CR 202.3b przez copyManaValueOf).
  assert.equal(incubator.frontFaceId, 'token_incubator', 'front pary = Incubator (RED: null)');
});
