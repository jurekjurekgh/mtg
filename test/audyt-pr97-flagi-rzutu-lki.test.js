import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { moveObjectDirectly } from '../src/engine/objects.js';
import { createBattlefieldToken } from '../src/engine/tokens.js';

/**
 * Audyt PR #97/O3 (rodzina F3 z PR #96): FAKTY HISTORYCZNE RZUTU —
 * `wasKicked`, `wasCast` (ifCast), `manaFromTreasureSpent` — muszą
 * dotrzeć do stubu LKI źródła (`resolveTriggerEntry`), bo re-check
 * intervening-if (CR 603.4) i liczności efektów przy rozstrzyganiu
 * czytają je z ostatniej znanej informacji, gdy źródło opuściło pole
 * bitwy przed rozstrzygnięciem triggera (CR 603.10/608.2b).
 *
 * Wzorzec: test F3 (Rust-Shield Rampager) w real-cards-batch53.test.js —
 * rzut → trigger NA STOSIE → śmierć źródła → drenaż → skutek mimo śmierci.
 */

const REGISTRY = createCardRegistry();

function game(playerId = 'p1') {
  const state = createGameState({ seed: 53, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function addCard(state, id, cardId, controllerId, zone = 'hand') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  return state.objects.get(id);
}

function commands(state, playerId = null) {
  return playerView(state, playerId ?? state.turn.priorityPlayerId).legalCommands;
}

/** Passe aż trigger ETB wyląduje NA STOSIE (nie dłużej) — okno na kill. */
function passUntilTriggerOnStack(state, limit = 8) {
  for (let i = 0; i < limit; i += 1) {
    const trig = state.zones.stack.map((id) => state.objects.get(id)).find((o) => o?.kind === 'trigger');
    if (trig) return trig;
    const c = commands(state);
    const pass = c.find((x) => x.type === 'pass_priority');
    if (!pass) break;
    const r = execute(state, pass);
    if (!r.ok) break;
  }
  return state.zones.stack.map((id) => state.objects.get(id)).find((o) => o?.kind === 'trigger') ?? null;
}

function resolveStack(state, limit = 16) {
  for (let i = 0; i < limit && state.zones.stack.length > 0; i += 1) {
    const pass = commands(state).find((c) => c.type === 'pass_priority');
    if (!pass) break;
    const r = execute(state, pass);
    if (!r.ok && /(_unresolved|not_your_decision)$/.test(r.events[0]?.reason ?? '')) break;
  }
}

function addArtifact(state, id, controllerId) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId, ownerId: controllerId,
    zone: 'battlefield', kind: 'artifact', types: ['Artifact'], power: 0, toughness: 0,
    manaCost: 2, abilities: [], keywords: [], subtypes: [], colors: [],
  });
  return state.objects.get(id);
}

test('PR97/O3: Kor Sanctifiers kicked — niszczy cel mimo śmierci źródła (LKI wasKicked)', () => {
  const state = game();
  addArtifact(state, 'troll', 'p2');
  addCard(state, 'kor', 'kor-sanctifiers', 'p1');
  addMana(state, 'p1', 5, { colors: ['W'] }); // {2}{W} + kicker {W}
  const offer = commands(state).find((c) => c.type === 'cast_permanent' && c.objectId === 'kor' && c.kicked === true);
  assert.ok(offer, 'oferta rzutu z kickerem');
  assert.ok(execute(state, offer).ok);
  const trig = passUntilTriggerOnStack(state);
  assert.ok(trig, 'trigger ETB na stosie (okno na kill)');
  const perm = [...state.objects.values()].find((o) => o.zone === 'battlefield' && o.cardId === 'kor-sanctifiers');
  assert.ok(perm && perm.wasKicked === true, 'źródło na polu z flagą wasKicked');
  // Kill w odpowiedzi (choke point zmiany stref — jak test F3).
  moveObjectDirectly(state, perm.id, 'graveyard', 'grave-kor');
  resolveStack(state);
  // CR 603.4 + 608.2b: „if it was kicked" z LKI — fakt historyczny.
  const troll = state.objects.get('troll');
  assert.ok(!troll || troll.zone !== 'battlefield', ' Cel ARTEFAKT/ENCHANTMENT zniszczony mimo śmierci źródła');
});

test('PR97/O3: Geological Appraiser — discover 3 odpala mimo śmierci źródła (LKI wasCast)', () => {
  const state = game();
  addCard(state, 'geo', 'geological-appraiser', 'p1');
  addMana(state, 'p1', 5, { colors: ['R'] }); // {3}{R}
  // Wierzch biblioteki p1 — niepuste (L116); Highland Game MV 2 ≤ 3.
  addCard(state, 'top', 'highland-game', 'p1', 'library');
  state.zones.library = ['top', ...state.zones.library.filter((id) => id !== 'top')];
  const offer = commands(state).find((c) => c.type === 'cast_permanent' && c.objectId === 'geo');
  assert.ok(offer, 'oferta rzutu');
  assert.ok(execute(state, offer).ok);
  const trig = passUntilTriggerOnStack(state);
  assert.ok(trig, 'trigger ETB na stosie');
  const perm = [...state.objects.values()].find((o) => o.zone === 'battlefield' && o.cardId === 'geological-appraiser');
  assert.ok(perm && perm.wasCast === true, 'źródło na polu z flagą wasCast');
  moveObjectDirectly(state, perm.id, 'graveyard', 'grave-geo');
  resolveStack(state);
  // „if you cast it" z LKI — discover 3 i tak się rozstrzyga.
  assert.ok(state.pendingDiscover, 'discover 3 odpalone mimo śmierci źródła');
  assert.equal(state.pendingDiscover.playerId, 'p1');
});

test('PR97/O3 anty-over-fix: Appraiser wszedł BEZ rzutu — discover nie odpala', () => {
  const state = game();
  addObject(state, {
    id: 'geo2', instanceId: 'i-geo2', cardId: 'geological-appraiser', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', ...gameObjectDataOf(REGISTRY.get('geological-appraiser')),
    types: ['Creature'], keywords: [], subtypes: ['Human', 'Artificer'],
  });
  // Bez zdarzenia wejścia nie ma triggera; warunek ifCast i tak fałszywy.
  assert.equal(state.pendingDiscover, null);
});

test('PR97/O3: Marut — Skarby za manę ze Skarbów mimo śmierci źródła (LKI manaFromTreasureSpent)', () => {
  const state = game();
  for (const i of [1, 2]) {
    createBattlefieldToken(state, 'p1', {
      cardId: 'token_treasure', name: 'Treasure', kind: 'artifact',
      colors: [], types: ['Artifact'], subtypes: ['Treasure'],
      abilities: [{ type: 'activated', cost: { tap: true, sacrificeSelf: true }, effect: { type: 'add_mana', amount: 1, fromTreasure: true } }],
    });
  }
  for (const treasure of [...state.objects.values()].filter((o) => o.cardId === 'token_treasure' && o.zone === 'battlefield')) {
    const r = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: treasure.id, abilityIndex: 0 });
    assert.ok(r.ok, `aktywacja Skarba: ${r.events?.map((e) => e.reason).join('')}`);
  }
  addMana(state, 'p1', 6);
  addCard(state, 'marut', 'marut', 'p1');
  const offer = commands(state).find((c) => c.type === 'cast_permanent' && c.objectId === 'marut');
  assert.ok(offer, 'oferta rzutu Maruta');
  assert.ok(execute(state, offer).ok);
  const trig = passUntilTriggerOnStack(state);
  assert.ok(trig, 'trigger ETB na stosie');
  const perm = [...state.objects.values()].find((o) => o.zone === 'battlefield' && o.cardId === 'marut');
  assert.ok(perm && perm.manaFromTreasureSpent === 2, '2 many ze Skarbów wydane na rzut (treasure-first)');
  moveObjectDirectly(state, perm.id, 'graveyard', 'grave-marut');
  resolveStack(state);
  const treasures = [...state.objects.values()].filter((o) => o.cardId === 'token_treasure' && o.zone === 'battlefield');
  assert.equal(treasures.length, 2, 'ETB tworzy 2 Skarby mimo śmierci źródła (LKI liczności)');
});
