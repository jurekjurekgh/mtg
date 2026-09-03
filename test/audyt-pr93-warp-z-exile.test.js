// Audyt PR #93 — znalezisko J: warp z exile (CR 702.185a).
//
// CR 702.185a: „"Warp [cost]" means "You may cast this card **from your hand**
// by paying [cost] rather than its mana cost" and "If this spell's warp cost
// was paid, exile the permanent this spell becomes at the beginning of the next
// end step. Its owner may cast this card **after the current turn has ended**
// for as long as it remains exiled.""
//
// Dwie konsekwencje, których engine nie znał:
//
//  J1 — koszt warp jest ALTERNATYWĄ wyłącznie dla rzutu Z RĘKI. Drugie zdanie
//      reguły (rzut z exile) nie daje żadnego kosztu alternatywnego, więc
//      płaci się ZWYKŁY koszt many. Engine oferował i przyjmował `warp_card`
//      na obiekcie z exile — Weftblade Enhancer (manaCost 6) wracał na stół
//      za 3 many, czyli drugi rzut w cenie połowy. ŻYWE w talii
//      `worek-legend` (pomiar przed fixem: przy 3 manach oferta istniała
//      i execute pobierał 3 many; przy 6 manach — też 3).
//  J2 — „after the current turn has ended": jak przy plocie (znalezisko I),
//      tylko stempel `warpedAtTurn` w ogóle nie istniał. Dziś nie do
//      wykorzystania (wygnanie następuje w końcowym kroku, a oferta wymaga
//      własnej fazy main), więc to luka UTAJONA — przypięta testem, żeby
//      pierwsza karta wyganiająca wcześniej nie weszła bez bramki (L52).
//
// Naprawa jest bezimienna (ADR 0002): żadnej nazwy karty w rdzeniu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { warpTurnReached } from '../src/engine/impulse-window.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addMana } from '../src/engine/resources.js';

const REGISTRY = createCardRegistry();
const MANA_COST = 6; // Weftblade Enhancer — koszt many
const WARP_COST = 3; // Warp {2}{W}

function newState(turnNumber = 6) {
  const state = createGameState({ seed: 38, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.number = turnNumber;
  return state;
}

/** Weftblade Enhancer w `zone` (ręka albo exile po warp-caście). */
function weftblade(state, { id = 'weft', zone = 'exile', warpedAtTurn = null } = {}) {
  const def = REGISTRY.get('weftblade-enhancer');
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'weftblade-enhancer', controllerId: 'p1', ownerId: 'p1', zone,
    kind: data.kind, power: data.power, toughness: data.toughness, manaCost: data.manaCost,
    spell: data.spell, abilities: data.abilities ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], types: def.types ?? [], colors: data.colors ?? ['W'],
    cardName: def.name, warp: data.warp ?? def.warp ?? null,
  });
  const stamp = zone === 'exile'
    ? { warpReady: true, warped: false, warpedAtTurn }
    : {};
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...stamp }));
  return state.objects.get(id);
}

function offers(state, objectId) {
  return playerView(state, 'p1').legalCommands.filter((c) => c.objectId === objectId);
}

const resolveStack = (state) => {
  for (let i = 0; i < 24 && state.zones.stack.length > 0; i += 1) {
    const view = playerView(state, state.turn.priorityPlayerId);
    const next = view.legalCommands.find((c) => c.type.startsWith('resolve_'))
      ?? view.legalCommands.find((c) => c.type === 'pass_priority');
    if (!next) return false;
    execute(state, next);
  }
  return state.zones.stack.length === 0;
};

test('J1 (CR 702.185a): karta wygnana po warp NIE wraca na stół za koszt warp', () => {
  const state = newState();
  const card = weftblade(state, { warpedAtTurn: 5 });
  assert.equal(card.manaCost, MANA_COST, 'Weftblade Enhancer kosztuje 6 many');
  assert.equal(card.warp?.cost, WARP_COST, 'a koszt warp wynosi 3');
  addMana(state, 'p1', WARP_COST, { colors: ['W', 'W', 'W'] }); // tylko tyle, ile kosztuje warp
  assert.deepEqual(offers(state, 'weft'), [],
    'z exile płaci się koszt many — oferta za koszt warp była naruszeniem (L48: oferta = walidacja)');
});

test('J1 (CR 702.185a): z exile rzuca się ZWYKŁĄ komendą i ZA ZWYKŁY koszt many', () => {
  const state = newState();
  weftblade(state, { warpedAtTurn: 5 });
  addMana(state, 'p1', MANA_COST, { colors: Array(MANA_COST).fill('W') });
  const cmds = offers(state, 'weft');
  assert.deepEqual(cmds.map((c) => c.type), ['cast_permanent'],
    'to zwykły rzut z exile (jak zaplotowana karta bez zniżki), nie akcja warp');
  const res = execute(state, cmds[0]);
  assert.ok(res.ok, 'rzut akceptowany: ' + JSON.stringify(res.events?.[0]?.reason ?? ''));
  assert.equal(state.players[0].mana, 0, 'pobrano pełny koszt many (6), nie koszt warp (3)');
  assert.ok(resolveStack(state), 'stos pusty');
  const onBoard = [...state.objects.values()].find((o) => o.cardId === 'weftblade-enhancer' && o.zone === 'battlefield');
  assert.ok(onBoard, 'stwór wszedł na pole bitwy');
});

test('J1 (walidacja): warp_card na karcie z exile jest odrzucany — warp działa tylko z ręki', () => {
  const state = newState();
  weftblade(state, { warpedAtTurn: 5 });
  addMana(state, 'p1', MANA_COST, { colors: Array(MANA_COST).fill('W') });
  const res = execute(state, { type: 'warp_card', playerId: 'p1', objectId: 'weft' });
  assert.equal(res.ok, false, 'CR 702.185a: „from your hand"');
});

test('J1 (anty-over-fix): warp Z RĘKI nadal działa za koszt warp', () => {
  const state = newState();
  weftblade(state, { zone: 'hand' });
  addMana(state, 'p1', WARP_COST, { colors: ['W', 'W', 'W'] });
  const cmds = offers(state, 'weft');
  assert.ok(cmds.some((c) => c.type === 'warp_card'), 'rzut za koszt warp jest oferowany z ręki');
  const warp = cmds.find((c) => c.type === 'warp_card');
  const res = execute(state, warp);
  assert.ok(res.ok, 'warp z ręki: ' + JSON.stringify(res.events?.[0]?.reason ?? ''));
  assert.equal(state.players[0].mana, 0, 'koszt warp = 3');
  assert.ok(resolveStack(state), 'stos pusty');
  const onBoard = [...state.objects.values()].find((o) => o.cardId === 'weftblade-enhancer' && o.zone === 'battlefield');
  assert.ok(onBoard?.warped, 'permanent oznaczony jako warped (czeka go wygnanie w końcowym kroku)');
});

test('J2 (CR 702.185a): „after the current turn has ended" — karta czeka w exile do następnej tury', () => {
  const same = newState(6);
  const card = weftblade(same, { warpedAtTurn: 6 }); // wygnana w TEJ turze
  addMana(same, 'p1', MANA_COST, { colors: Array(MANA_COST).fill('W') });
  assert.equal(warpTurnReached(card, same), false, 'tej samej tury rzut jest niedostępny');
  assert.deepEqual(offers(same, 'weft'), [], 'brak oferty');
  assert.equal(execute(same, { type: 'cast_permanent', playerId: 'p1', objectId: 'weft' }).ok, false,
    'i walidacja odrzuca');

  const later = newState(7); // następna tura
  weftblade(later, { warpedAtTurn: 6 });
  addMana(later, 'p1', MANA_COST, { colors: Array(MANA_COST).fill('W') });
  assert.equal(offers(later, 'weft').length, 1, 'w następnej turze oferta wraca');
});

test('J (integracja, worek-legend): realny przebieg — warp z ręki, wygnanie w end step, rzut w następnej turze', () => {
  const state = newState(6);
  weftblade(state, { zone: 'hand' });
  addMana(state, 'p1', WARP_COST, { colors: ['W', 'W', 'W'] });
  const warp = offers(state, 'weft').find((c) => c.type === 'warp_card');
  assert.ok(execute(state, warp).ok, 'warp z ręki');
  assert.ok(resolveStack(state), 'stwór wszedł');
  // ETB Weftblade'a („up to two target creatures") wymaga decyzji — rozwiąż.
  for (let i = 0; i < 8; i += 1) {
    const cmd = playerView(state, 'p1').legalCommands.find((c) => c.type === 'resolve_trigger_target');
    if (!cmd) break;
    execute(state, cmd); // oferta niesie własny zestaw celów (`targetIds`)
  }
  // Wejście w end step odpala opóźniony trigger wygnania (CR 603.7b).
  state.turn = { ...state.turn, phase: 'postcombat_main', step: 'main', stepIndex: 9, passes: 0, priorityPlayerId: 'p1' };
  state.turn.activePlayerId = 'p1';
  for (let r = 0; r < 8 && state.turn.step !== 'end'; r += 1) {
    execute(state, { type: 'pass_priority', playerId: 'p1' });
    execute(state, { type: 'pass_priority', playerId: 'p2' });
  }
  assert.equal(state.turn.step, 'end', 'weszliśmy w end step');
  assert.ok(resolveStack(state), 'trigger wygnania rozstrzygnięty');
  const exiled = [...state.objects.values()].find((o) => o.cardId === 'weftblade-enhancer' && o.zone === 'exile');
  assert.ok(exiled?.warpReady, 'karta w exile z warpReady');
  assert.equal(exiled.warpedAtTurn, 6, 'stempel tury wygnania (CR 702.185a)');
  assert.deepEqual(offers(state, 'weft'), [], 'tej samej tury — cisza (oferta wymaga main, a stempel i tak blokuje)');

  // Następna tura, własna faza main: rzut z exile za koszt many.
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.number = 7;
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  addMana(state, 'p1', MANA_COST, { colors: Array(MANA_COST).fill('W') });
  const back = offers(state, exiled.id).filter((c) => c.type === 'cast_permanent');
  assert.equal(back.length, 1, 'w następnej turze karta wraca zwykłym rzutem za 6 many');
  assert.ok(execute(state, back[0]).ok, 'i wykonuje się');
});
