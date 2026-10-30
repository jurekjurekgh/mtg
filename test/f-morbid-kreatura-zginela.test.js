// F (zgłoszenie właściciela 2026-10-29, Caravan Vigil): „Zdolność Morbid nie
// działa. Mimo, że w tej kolejce zginęły 2 kreatury, rzucenie tego czaru
// przeniosło ląd z library do ręki. A powinno od razu na mój stół.”
//
// Root cause: tracker `state.creatureDiedThisTurn` (Morbid/Bloodthirst) stał na
// JEDNYM typie zdarzenia — `object_moved` z pola bitwy do grobu. Tej ścieżki
// NIE emitują dwie najczęstsze drogi śmierci stworu:
//   - obrażenia / `-X/-X` → SBA → `creature_destroyed` (destruction.js),
//   - zniszczenie czarem → `permanent_destroyed`.
// Skutek: w typowej grze flaga zostawała `false`, więc `search_basic_land_morbid`
// nie dodawało „battlefield” do `destinations` (Caravan Vigil), a warunki
// `rule.morbid` („enters with … if a creature died this turn”) były martwe.
//
// Poprawka: JEDEN predykat `eventIsCreatureDeath` w triggers.js (L41 — ten sam
// zestaw zdarzeń, który widzi już skan triggerów śmierci), czytany przez
// tracker. CR 700.4 („dies” = trafia z pola bitwy do cmentarza) + CR 603.10a
// (rodzaj z LKI — obiekt po zmianie strefy jest NOWY, CR 400.7).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { eventIsCreatureDeath } from '../src/engine/triggers.js';

const REGISTRY = createCardRegistry();

function game() {
  const state = createGameState({ seed: 11, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.number = 4;
  return state;
}
function addReal(state, id, cardId, pid, zone, extra = {}) {
  const card = REGISTRY.get(cardId);
  assert.ok(card, `brak karty ${cardId}`);
  const data = gameObjectDataOf(card);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: pid, zone,
    ...data, types: card.types ?? [], cardName: card.name, ownerId: pid, ...extra,
  });
  return state.objects.get(id);
}
function freeze(state, id, extra = {}) {
  state.objects.set(id, Object.freeze({
    ...state.objects.get(id), summoningSickness: false, ...extra,
  }));
}
/** Dobija stos i decyzje triggerów (bez wybierania celów). */
function drain(state, limit = 30) {
  for (let i = 0; i < limit; i += 1) {
    if (state.zones.stack.length === 0 && !(state.pendingTriggerTargets ?? []).length) return;
    const r = execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
    if (!r.ok) return;
  }
}
/** Rzuca Shock w stwora p2 (2 obrażenia → SBA `creature_destroyed`). */
function killWithShock(state, creatureId, shockId = 'shock') {
  addReal(state, shockId, 'shock', 'p1', 'hand');
  addMana(state, 'p1', 1, ['R']);
  const r = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: shockId, targets: [creatureId] });
  assert.ok(r.ok, r.events?.[0]?.reason);
  drain(state);
}

// ---------------------------------------------------------------------------
// 1. ŚMIERĆ OD OBRAŻEŃ (SBA → `creature_destroyed`) — dokładnie przypadek z gry.
// ---------------------------------------------------------------------------
test('F/1: stwór zabity obrażeniami ustawia Morbid, a Caravan Vigil oferuje pole bitwy', () => {
  const state = game();
  addReal(state, 'small', 'highland-game', 'p2', 'battlefield');
  freeze(state, 'small', { power: 1, toughness: 1 });
  addReal(state, 'vigil', 'caravan-vigil', 'p1', 'hand');
  addReal(state, 'forest', 'basic-forest', 'p1', 'library');

  assert.equal(state.creatureDiedThisTurn, false, 'przed śmiercią Morbid nieaktywny');
  killWithShock(state, 'small');
  assert.equal(state.creatureDiedThisTurn, true, 'śmierć od obrażeń liczy się do Morbida (CR 700.4)');

  addMana(state, 'p1', 1, ['G']);
  const cast = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'vigil' });
  assert.ok(cast.ok, cast.events?.[0]?.reason);
  drain(state);

  assert.ok(state.pendingSearchChoice, 'szukanie czeka na decyzję');
  assert.deepEqual(state.pendingSearchChoice.destinations, ['hand', 'battlefield'],
    'Morbid: ląd może wejść NA POLE BITWY (Oracle: „you may put that card onto the battlefield instead of into your hand”)');
  const dests = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'resolve_search_choice')
    .map((c) => c.destination);
  assert.ok(dests.includes('battlefield'), 'oferta zawiera wariant „na pole bitwy”');
  assert.ok(dests.includes('hand'), 'wariant „do ręki” zostaje („may”, nie przymus — Oracle)');
});

// ---------------------------------------------------------------------------
// 2. PEŁNY PRZEBIEG: wybór „battlefield” kładzie znaleziony ląd na stole.
// ---------------------------------------------------------------------------
test('F/2: wybór „battlefield” kładzie znaleziony ląd na stole (nie do ręki)', () => {
  const state = game();
  addReal(state, 'small', 'highland-game', 'p2', 'battlefield');
  freeze(state, 'small', { power: 1, toughness: 1 });
  addReal(state, 'vigil', 'caravan-vigil', 'p1', 'hand');
  addReal(state, 'forest', 'basic-forest', 'p1', 'library');
  killWithShock(state, 'small');

  addMana(state, 'p1', 1, ['G']);
  execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'vigil' });
  drain(state);
  const option = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'resolve_search_choice' && c.destination === 'battlefield');
  assert.ok(option, 'jest wariant pola bitwy');
  const res = execute(state, option);
  assert.ok(res.ok, res.events?.[0]?.reason);
  drain(state);
  const land = [...state.objects.values()].find((o) => o.cardId === 'basic-forest');
  assert.ok(land, 'ląd istnieje');
  assert.equal(land.zone, 'battlefield', 'ląd wszedł na pole bitwy, nie do ręki');
});

// ---------------------------------------------------------------------------
// 3. ZNISZCZENIE CZAREM (`permanent_destroyed`) — druga brakująca ścieżka.
// ---------------------------------------------------------------------------
test('F/3: stwór zniszczony czarem (permanent_destroyed) też liczy się do Morbida', () => {
  const state = game();
  addReal(state, 'bear', 'highland-game', 'p2', 'battlefield');
  freeze(state, 'bear', { power: 2, toughness: 2 });
  addReal(state, 'splinters', 'terminal-agony', 'p1', 'hand');
  addMana(state, 'p1', 4, ['B', 'B', 'B', 'B']);
  const r = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'splinters', targets: ['bear'] });
  assert.ok(r.ok, r.events?.[0]?.reason);
  drain(state);
  const inGrave = [...state.objects.values()]
    .some((o) => o.zone === 'graveyard' && o.cardId === 'highland-game');
  assert.ok(inGrave, 'stwór trafił do cmentarza');
  assert.equal(state.creatureDiedThisTurn, true, 'zniszczenie efektem = śmierć (CR 700.4)');
});

// ---------------------------------------------------------------------------
// 4. POŚWIĘCENIE stwora jako KOSZT (`permanent_sacrificed`) — trzecia droga.
// ---------------------------------------------------------------------------
test('F/4: poświęcenie stwora jako koszt czaru ustawia Morbid', () => {
  const state = game();
  addReal(state, 'victim', 'highland-game', 'p1', 'battlefield');
  freeze(state, 'victim', { power: 2, toughness: 2 });
  addReal(state, 'foe', 'highland-game', 'p2', 'battlefield');
  freeze(state, 'foe', { power: 1, toughness: 1 });
  addReal(state, 'strands', 'severed-strands', 'p1', 'hand');
  addMana(state, 'p1', 2, ['B', 'B']);
  const r = execute(state, {
    type: 'cast_spell', playerId: 'p1', objectId: 'strands',
    targets: ['foe'], sacrificeTargetId: 'victim',
  });
  assert.ok(r.ok, r.events?.[0]?.reason);
  drain(state);
  assert.equal(state.creatureDiedThisTurn, true,
    'poświęcony STWÓR umiera (CR 700.4) — dotąd zdarzenie `permanent_sacrificed` było dla Morbida niewidzialne');
});

// ---------------------------------------------------------------------------
// 5. ANTY-OVER-FIX: wygnanie zamiast śmierci (finality, CR 122.1h) to NIE śmierć,
//    a poświęcony LĄD/artefakt to nie „creature died” (CR 700.4).
// ---------------------------------------------------------------------------
test('F/5: wygnanie zamiast śmierci i poświęcony ląd NIE ustawiają Morbida', () => {
  const state = game();
  state.objects.set('x1', Object.freeze({
    id: 'x1', instanceId: 'i-x1', cardId: 'highland-game', kind: 'creature',
    types: ['Creature'], zone: 'exile', controllerId: 'p2',
    formerZone: 'battlefield', formerKind: 'creature',
  }));
  assert.equal(eventIsCreatureDeath(state, {
    type: 'creature_destroyed', fromId: 'c', toId: 'x1', toZone: 'exile',
  }), false, 'finality: permanent opuszcza pole bitwy, ale nie umiera');

  state.objects.set('g5', Object.freeze({
    id: 'g5', instanceId: 'i-g5', cardId: 'basic-forest', kind: 'land',
    types: ['Land'], zone: 'graveyard', controllerId: 'p1',
    formerZone: 'battlefield', formerKind: 'land',
  }));
  assert.equal(eventIsCreatureDeath(state, {
    type: 'permanent_sacrificed', fromId: 'f', objectId: 'g5', toZone: 'graveyard',
  }), false, 'poświęcony ląd nie jest śmiercią stworu');
});

// ---------------------------------------------------------------------------
// 6. RESET Z NOWĄ TURĄ: Morbid dotyczy WYŁĄCZNIE bieżącej tury (CR 700.4).
// ---------------------------------------------------------------------------
test('F/6: flaga Morbida zeruje się z nową turą', () => {
  const state = game();
  addReal(state, 'small', 'highland-game', 'p2', 'battlefield');
  freeze(state, 'small', { power: 1, toughness: 1 });
  addReal(state, 'vigil', 'caravan-vigil', 'p1', 'hand');
  addReal(state, 'forest', 'basic-forest', 'p1', 'library');
  killWithShock(state, 'small');
  assert.equal(state.creatureDiedThisTurn, true);
  // Koniec tury p1 → start tury p2 (beginTurn zeruje tracker).
  for (let i = 0; i < 200 && state.turn.activePlayerId === 'p1'; i += 1) {
    const r = execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
    if (!r.ok) break;
  }
  assert.equal(state.turn.activePlayerId, 'p2', 'tura przeszła do p2');
  assert.equal(state.creatureDiedThisTurn, false, 'w nowej turze Morbid nieaktywny');
});
