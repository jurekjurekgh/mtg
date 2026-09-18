// M379 (wyzwanie „brązowa odznaka", ADR 0030): OFFSPRING na prawdziwej
// ścieżce talii. Deskryptor `offspring` (CR 702.175a) był JEDYNYM polem
// z `gameObjectDataOf`, które nie docierało do obiektu gry przy `installDeck`
// (src/engine/deck.js) — `createCardDeck` kładł je na wpisie talii, helpery
// testowe `...gameObjectDataOf(def)` też, więc wszystkie piny Batch 53 były
// zielone, a w PRAWDZIWEJ partii obiekt niósł `offspring === null`:
//   • brak oferty `cast_permanent { offspring: true }` (game-state.js bramka
//     `if (object.offspring)`) → gracz nie mógł zapłacić dodatkowego {2},
//   • ETB-trigger `create_offspring_token` nie tworzył 1/1 token-kopii.
// To dokładnie klasa L21/M258 (echo, surge, warp, madness, toxic — „mechaniki
// martwe w prawdziwych partiach przy zielonych testach").
//
// Źródła online (dostęp 2026-09-18):
//  • CR 702.175a: „»Offspring [cost]« means »You may pay an additional [cost]
//    as you cast this spell« and »When this permanent enters, if its offspring
//    cost was paid, create a token that's a copy of it, except it's 1/1.«"
//    (numer potwierdzony w dokumentacji repozytorium: docs/setup/HANDOFF_2026-09-16.md
//    cytuje weryfikację przez mtg.wiki/page/Offspring; treść reguły potwierdzona
//    niezależnie: https://www.reddit.com/r/magicTCG/comments/1efziaf/ —
//    komentarz cytujący świeżo dodane CR 702.175a, dostęp 2026-09-18)
//  • Oracle + rulings WotC (Scryfall, dostęp 2026-09-18):
//    https://api.scryfall.com/cards/named?exact=Rust-Shield%20Rampager
//    https://api.scryfall.com/cards/c96b01f5-83de-4237-a68d-f946c53e31a6/rulings
//    („You can pay an offspring cost only once as you cast a spell with
//    offspring."; „Any »enters« abilities of the copied creature will trigger
//    when the token enters."; „The token copies exactly what was printed on
//    the original creature and nothing else, except it's a 1/1.")
//
// Piny: (A) prawdziwa talia — obiekt gry niesie deskryptor offspring,
// (B) prawdziwa talia — oferta wariantu z dopłatą istnieje i rzut tworzy
// 1/1 token-kopię (kontrola negatywna: zwykły rzut tokenu NIE tworzy),
// (C) strażnik katalogowy klasy L21: KAŻDE pole z `gameObjectDataOf(card)`
// przechodzi przez `installDecks` na wszystkich wspieranych kartach
// (ten test złapałby defekt M379 przed commitem).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf, createCardDeck, setupCardMatch } from '../src/cards/materialize.js';
import { createGameState, execute, playerView } from '../src/engine/game-state.js';
import { installDecks } from '../src/engine/deck.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { moveObjectDirectly } from '../src/engine/objects.js';

const REGISTRY = createCardRegistry();
const RAMPAGER = 'rust-shield-rampager';

/** Prawdziwa partia z talii kart (setupCardMatch → createCardDeck → installDeck). */
function realMatch(seed = 379) {
  const ids = (n) => Array.from({ length: n }, () => RAMPAGER);
  const lands = (n) => Array.from({ length: n }, () => 'basic-forest');
  const state = setupCardMatch({
    seed,
    players: [{ id: 'p1' }, { id: 'p2' }],
    decks: new Map([
      ['p1', [...ids(12), ...lands(12)]],
      ['p2', [...ids(12), ...lands(12)]],
    ]),
    registry: REGISTRY,
  });
  state.pendingMulligans = [];
  return state;
}

/** Pełna runda passów aż do pustego stosu. */
function resolveStack(state) {
  for (let i = 0; i < 40 && state.zones.stack.length > 0; i += 1) {
    const pid = state.turn.priorityPlayerId;
    const offer = playerView(state, pid).legalCommands.find((c) => c.type === 'pass_priority');
    if (!offer) return false;
    if (!execute(state, offer).ok) return false;
  }
  return state.zones.stack.length === 0;
}

function cardInZone(state, cardId, controllerId, zone) {
  return [...state.objects.values()].find((o) => o.cardId === cardId
    && o.controllerId === controllerId && o.zone === zone);
}

test('M379/A: prawdziwa talia — obiekt w bibliotece niesie deskryptor offspring', () => {
  const state = realMatch(379);
  const obj = [...state.objects.values()].find((o) => o.cardId === RAMPAGER);
  assert.ok(obj, 'Rust-Shield Rampager w partii');
  assert.deepEqual(obj.offspring, { cost: 2, colors: [] },
    'deskryptor offspring musi przejść installDeck (CR 702.175a — dodatkowy koszt)');
});

test('M379/B: prawdziwa talia — dopłata offspring daje 1/1 token-kopię', () => {
  const state = realMatch(380);
  const libObj = [...state.objects.values()].find((o) => o.cardId === RAMPAGER);
  const handId = moveObjectDirectly(state, libObj.id, 'hand', `hand-m379-${libObj.id}`).id;
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.passes = 0;
  addMana(state, 'p1', 6, { colors: ['G'] });

  const offer = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === handId && c.offspring === true);
  assert.ok(offer, 'oferta rzutu z dopłatą offspring (przed M379 nie istniała)');
  assert.ok(execute(state, offer).ok, 'rzut z dopłatą przyjęty');
  assert.ok(resolveStack(state), 'stos rozstrzygnięty');

  const original = cardInZone(state, RAMPAGER, 'p1', 'battlefield');
  assert.ok(original && !original.isToken, 'oryginał na polu bitwy');
  assert.equal(original.wasOffspring, true, 'flaga opłaconego kosztu (trigger ETB)');
  const token = [...state.objects.values()].find((o) => o.isToken && o.zone === 'battlefield'
    && o.cardId === RAMPAGER);
  assert.ok(token, 'CR 702.175a: „create a token that\'s a copy of it, except it\'s 1/1"');
  assert.equal(token.power, 1, 'kopia jest 1/1 (nie 4/4)');
  assert.equal(token.toughness, 1);
  assert.deepEqual(token.subtypes, ['Raccoon', 'Warrior'], 'kopia zachowuje wydruk');
  assert.equal(token.controllerId, 'p1');
});

test('M379/B-kontrola: zwykły rzut (bez dopłaty) nie tworzy tokenu', () => {
  const state = realMatch(381);
  const libObj = [...state.objects.values()].find((o) => o.cardId === RAMPAGER);
  const handId = moveObjectDirectly(state, libObj.id, 'hand', `hand-m379b-${libObj.id}`).id;
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.passes = 0;
  addMana(state, 'p1', 4, { colors: ['G'] });

  const offer = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === handId && !c.offspring);
  assert.ok(offer, 'zwykły wariant rzutu');
  assert.ok(execute(state, offer).ok);
  assert.ok(resolveStack(state));
  assert.equal([...state.objects.values()].filter((o) => o.isToken).length, 0,
    'bez opłaconego offspring żaden token nie powstaje');
});

test('M379/C: strażnik katalogowy — każde pole deklaracji przeżywa installDecks (L21)', () => {
  const supported = REGISTRY.supported();
  const state = createGameState({ seed: 379, players: [{ id: 'p1' }, { id: 'p2' }] });
  installDecks(state, new Map([
    ['p1', createCardDeck({ cardIds: supported.map((c) => c.id), ownerId: 'p1', registry: REGISTRY })],
    ['p2', createCardDeck({ cardIds: supported.slice(0, 40).map((c) => c.id), ownerId: 'p2', registry: REGISTRY })],
  ]), 379);
  const installed = new Map();
  for (const o of state.objects.values()) {
    if (o.controllerId === 'p1' && o.cardId && !installed.has(o.cardId)) installed.set(o.cardId, o);
  }
  // Porównanie kanoniczne (sortowanie kluczy), żeby kolejność pól nie łapała.
  const canon = (value) => JSON.stringify(value ?? null, (key, val) => (val && typeof val === 'object' && !Array.isArray(val)
    ? Object.keys(val).sort().reduce((acc, k) => { acc[k] = val[k]; return acc; }, {})
    : val));
  const drifts = [];
  for (const card of supported) {
    const obj = installed.get(card.id);
    if (!obj) { drifts.push(`${card.id}: brak obiektu gry`); continue; }
    for (const [key, value] of Object.entries(gameObjectDataOf(card))) {
      if (canon(obj[key] ?? null) !== canon(value ?? null)) {
        drifts.push(`${card.name} :: ${key} — obiekt=${canon(obj[key] ?? null).slice(0, 60)} deklaracja=${canon(value).slice(0, 60)}`);
      }
    }
  }
  assert.deepEqual(drifts, [], `deskryptory ginące w ścieżce talii:\n${drifts.join('\n')}`);
});
