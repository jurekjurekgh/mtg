// M382 (wyzwanie „brązowa odznaka", ADR 0030): KOLEJNOŚĆ ZDOLNOŚCI
// WYZWOLONYCH RÓWNOLEGLE (CR 603.3b + CR 101.4) — na stosie obowiązuje
// porządek APNAP, a nie kolejność wstawienia obiektów do stanu.
//
// Źródła online (dostęp 2026-09-18):
//  • CR 603.3b — https://media.wizards.com/2026/downloads/MagicCompRules%2020260819.txt
//    (efektywne 2026-08-07): „If multiple abilities have triggered since the
//    last time a player received priority, the abilities are placed on the
//    stack in a two-part process. First, each player, in APNAP order, puts
//    each triggered ability they control with a trigger condition that isn’t
//    another ability triggering on the stack in any order they choose.
//    (See rule 101.4.) Second, each player, in APNAP order, puts all
//    remaining triggered abilities they control on the stack in any order
//    they choose."
//  • CR 101.4 (tamże): „If multiple players would make choices and/or take
//    actions at the same time, the active player (the player whose turn it is)
//    makes any choices required, then the next player in turn order … followed
//    by the remaining nonactive players in turn order. Then the actions happen
//    simultaneously. This rule is often referred to as the »Active Player,
//    Nonactive Player (APNAP) order« rule."
//  • CR 603.3 (tamże): zdolność, która się wyzwoliła, wchodzi na WIERZCH stosu
//    — więc zdolność umieszczona później rozstrzyga się pierwsza (LIFO).
//
// Stan przed M382: kolejność partii triggerów wynikała z kolejności WSTAWIENIA
// obiektów do `state.objects` (praktycznie: kolejność wejścia permanentów na
// pole bitwy), a nie z kolejności tur. Gdy permanent gracza nieaktywnego był
// wstawiony wcześniej, jego zdolność była umieszczana na stosie PIERWSZA, czyli
// rozstrzygała się OSTATNIA — odwrotnie niż wymaga 603.3b. Wcześniejsza
// weryfikacja tej samej reguły (PROJECT_HISTORY, kandydat 2 z 2026-08-24)
// wypadła poprawnie tylko dlatego, że akurat obiekty gracza aktywnego były
// wstawione pierwsze — ten przypadek nie rozróżnia obu porządków.
//
// Piny: (A) wierch stosu należy do gracza NIEaktywnego (AP umieszcza pierwszy),
// (B) rozstrzyganie idzie LIFO, więc zdolność gracza nieaktywnego działa
// pierwsza (kolejność zdarzeń `life_gained`), (C) kontrola: gdy to obiekty
// gracza aktywnego są wstawione pierwsze, wynik jest identyczny (fix nie jest
// „odwróceniem" kolejności), (D) stabilność: kolejność WEWNĄTRZ kontrolera
// zostaje zachowana, a wszystkie zdolności jednego gracza leżą pod zdolnościami
// drugiego.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';

const REGISTRY = createCardRegistry();
const GAME = 'highland-game'; // 2/1; „When this creature dies, you gain 2 life."

function scenario({ order = 'nap-first' } = {}) {
  const state = createGameState({ seed: 382, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.pendingMulligans = [];
  const put = (id, cardId, playerId) => {
    const card = REGISTRY.get(cardId);
    addObject(state, {
      id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId,
      zone: 'battlefield', types: card.types ?? [], keywords: card.keywords ?? [],
      subtypes: card.subtypes ?? [], cardName: card.name, ...gameObjectDataOf(card),
    });
    // addObject gubi chorobę przywołania — atakujący musi być zdolny do ataku.
    const object = state.objects.get(id);
    state.objects.set(id, Object.freeze({ ...object, summoningSickness: false }));
  };
  for (const pid of ['p1', 'p2']) {
    for (let i = 0; i < 8; i += 1) {
      const card = REGISTRY.get('basic-forest');
      addObject(state, {
        id: `lib-${pid}-${i}`, instanceId: `i-lib-${pid}-${i}`, cardId: 'basic-forest',
        controllerId: pid, ownerId: pid, zone: 'library',
        types: card.types ?? [], keywords: card.keywords ?? [], subtypes: card.subtypes ?? [],
        cardName: card.name, ...gameObjectDataOf(card),
      });
    }
  }
  // Kolejność wstawienia decyduje o kolejności wykrycia zdolności (stan przed
  // M382 decydował o CAŁEJ kolejności na stosie).
  if (order === 'nap-first') { put('nap-a', GAME, 'p2'); put('nap-b', GAME, 'p2'); put('ap-a', GAME, 'p1'); put('ap-b', GAME, 'p1'); }
  else if (order === 'interleaved') { put('nap-a', GAME, 'p2'); put('ap-a', GAME, 'p1'); put('nap-b', GAME, 'p2'); put('ap-b', GAME, 'p1'); }
  else { put('ap-a', GAME, 'p1'); put('ap-b', GAME, 'p1'); put('nap-a', GAME, 'p2'); put('nap-b', GAME, 'p2'); }
  return state;
}

/** Atak dwoma stworami p1, blok dwoma stworami p2 — cztery równoczesne zgony. */
function trade(state) {
  const attackers = ['ap-a', 'ap-b'];
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: attackers }).ok);
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  assert.ok(execute(state, {
    type: 'declare_blockers', playerId: 'p2',
    assignments: { 'ap-a': ['nap-a'], 'ap-b': ['nap-b'] },
  }).ok);
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  assert.ok(execute(state, { type: 'resolve_combat', playerId: 'p1' }).ok);
}

/** Identyfikatory ŹRÓDEŁ wpisów stosu (dol → góra) — id z pola bitwy. */
const stackSources = (state) => state.zones.stack
  .map((id) => state.objects.get(id)?.triggerEntry?.sourceId ?? null);

/** Rozstrzyga stos pełnymi rundami passów (oferty z `playerView`). */
function resolveStack(state) {
  for (let i = 0; i < 40 && state.zones.stack.length > 0; i += 1) {
    const commands = playerView(state, state.turn.priorityPlayerId).legalCommands;
    const pass = commands.find((c) => c.type === 'pass_priority');
    if (!pass) break;
    execute(state, pass);
  }
}

/** Wpisy stosu (dol → góra) jako `cardId@kontroler`. */
const stackOf = (state) => state.zones.stack.map((id) => {
  const entry = state.objects.get(id);
  const sourceId = entry?.triggerEntry?.sourceId ?? id;
  const source = state.objects.get(sourceId) ?? entry;
  return `${source?.cardId ?? entry?.cardId ?? '?'}@${entry?.controllerId ?? '?'}`;
});

test('M382/A: zdolności równoczesne wchodzą na stos w kolejności APNAP (CR 603.3b)', () => {
  const state = scenario();
  trade(state);
  assert.equal(stackOf(state).length, 4, `cztery zdolności śmierci na stosie: ${JSON.stringify(stackOf(state))}`);
  const order = stackOf(state);
  // AP (p1) umieszcza swoje zdolności PIERWSZE — leżą pod zdolnościami p2.
  assert.deepEqual(order, ['highland-game@p1', 'highland-game@p1', 'highland-game@p2', 'highland-game@p2'],
    `stos (dol → góra) musi mieć zdolności gracza aktywnego pod zdolnościami nieaktywnego: ${JSON.stringify(order)}`);
});

test('M382/B: LIFO — zdolność gracza nieaktywnego rozstrzyga się pierwsza', () => {
  const state = scenario();
  trade(state);
  assert.deepEqual(stackOf(state), ['highland-game@p1', 'highland-game@p1', 'highland-game@p2', 'highland-game@p2']);
  resolveStack(state);
  assert.equal(state.zones.stack.length, 0, 'stos rozstrzygnięty');
  const gains = state.events
    .filter((e) => e.type === 'life_changed' && e.amount === 2)
    .map((e) => e.playerId);
  assert.deepEqual(gains, ['p2', 'p2', 'p1', 'p1'],
    `zdolności p2 (gracz nieaktywny) rozstrzygają się przed zdolnościami p1: ${JSON.stringify(gains)}`);
  assert.equal(state.players.find((p) => p.id === 'p1').life, 24);
  assert.equal(state.players.find((p) => p.id === 'p2').life, 24);
});

test('M382/C: kontrola — gdy obiekty gracza aktywnego są wstawione pierwsze, wynik bez zmian', () => {
  const state = scenario({ order: 'ap-first' });
  trade(state);
  const order = stackOf(state);
  assert.deepEqual(order, ['highland-game@p1', 'highland-game@p1', 'highland-game@p2', 'highland-game@p2'],
    `kolejność APNAP nie zależy od kolejności wstawienia obiektów: ${JSON.stringify(order)}`);
});

test('M382/D: stabilność wewnątrz kontrolera (kolejność wykrycia zachowana)', () => {
  // Wstawienie PRZEPLATANE (nap-a, ap-a, nap-b, ap-b) — kolejność wykrycia
  // zdolności nie jest wtedy podzielona na bloki, więc niestabilny sort
  // mógłby odwrócić zdolności jednego kontrolera.
  const state = scenario({ order: 'interleaved' });
  trade(state);
  // Mapowanie „pole bitwy → grób" z zdarzeń zgonów (kolejność = kolejność
  // wykrycia, bo zgony są jednym przebiegiem SBA).
  const graveOf = new Map(state.events
    .filter((e) => e.type === 'creature_destroyed')
    .map((e) => [e.fromId, e.objectId]));
  const sources = stackSources(state);
  assert.deepEqual(sources, [
    graveOf.get('ap-a'), graveOf.get('ap-b'), graveOf.get('nap-a'), graveOf.get('nap-b'),
  ], `zdolności AP (ap-a, ap-b) w kolejności wykrycia, potem NAP: ${JSON.stringify(sources)}`);
});
