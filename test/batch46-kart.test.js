// M191 — Batch 46 (lista właściciela 2026-08-22).
// Dane wg docs/cards/scryfall-*.json (ADR 0010 §2a); pełne Oracle (ADR 0022).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { addCounter } from '../src/engine/counters.js';
import { effectivePower, effectiveToughness, effectiveKeywords } from '../src/engine/permanents.js';
import { processTriggers } from '../src/engine/triggers.js';
import { isProtectedFromSource } from '../src/engine/attachments.js';

const REGISTRY = createCardRegistry();

function game(playerId = 'p1') {
  const state = createGameState({ seed: 46, players: [{ id: 'p1' }, { id: 'p2' }] });
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

function resolveStack(state, max = 16) {
  for (let i = 0; i < max && state.zones.stack.length > 0; i += 1) {
    const r = execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
    if (!r.ok) return false;
  }
  return state.zones.stack.length === 0;
}

// ---- Transza 1: mechaniki w pełni istniejące -----------------------------

test('B46/1: Infectious Horror — atak odbiera przeciwnikowi 2 życia', () => {
  const state = game('p1');
  putCard(state, 'horror', 'infectious-horror', 'p1', 'battlefield', {});
  state.objects.set('horror', Object.freeze({ ...state.objects.get('horror'), summoningSickness: false }));
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  const lifeBefore = state.players.find((p) => p.id === 'p2').life;
  const myLifeBefore = state.players.find((p) => p.id === 'p1').life;
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['horror'] }).ok);
  resolveStack(state);
  assert.equal(state.players.find((p) => p.id === 'p2').life, lifeBefore - 2,
    'każdy przeciwnik traci 2 życia');
  assert.equal(state.players.find((p) => p.id === 'p1').life, myLifeBefore,
    'kontroler nie traci życia (scope: each_opponent)');
});

test('B46/2: Roiling Regrowth — poświęcenie lądu jest OBOWIĄZKOWE', () => {
  const state = game('p1');
  putCard(state, 'spell', 'roiling-regrowth', 'p1', 'hand');
  putCard(state, 'forest', 'basic-forest', 'p1');
  putCard(state, 'l1', 'basic-forest', 'p1');
  putCard(state, 'l2', 'basic-forest', 'p1');
  for (let i = 0; i < 3; i += 1) putCard(state, `lib${i}`, 'basic-island', 'p1', 'library');
  addMana(state, 'p1', 3, { colors: ['G', 'G', 'G'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'spell');
  assert.ok(cast, 'oferta rzutu');
  assert.ok(execute(state, cast).ok);
  resolveStack(state);
  assert.ok(state.pendingSpringbloom, 'decyzja: który ląd poświęcić');
  const offers = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'resolve_springbloom');
  assert.ok(offers.length > 0, 'są oferty poświęcenia');
  assert.ok(!offers.some((c) => c.skip),
    'brak opcji „nie poświęcaj" — Oracle mówi „Sacrifice a land.", nie „you may"');
  const sac = offers.find((c) => c.sacrificeLandId === 'l1');
  assert.ok(sac, 'można wskazać konkretny ląd');
  assert.ok(execute(state, sac).ok);
  // Poświęcony obiekt dostaje NOWE id w grobie (moveObjectDirectly) — liczymy
  // lądy na polu bitwy zamiast pytać o stare id.
  const landsLeft = state.zones.battlefield
    .map((id) => state.objects.get(id))
    .filter((o) => o?.kind === 'land' || (o?.types ?? []).includes('Land'));
  assert.equal(landsLeft.length, 2, 'jeden z trzech lądów został poświęcony');
});

test('B46/2b: Springbloom Druid NADAL pozwala odmówić („you may") — kontrola', () => {
  const state = game('p1');
  putCard(state, 'druid', 'springbloom-druid', 'p1', 'hand');
  putCard(state, 'l1', 'basic-forest', 'p1');
  addMana(state, 'p1', 3, { colors: ['G', 'G', 'G'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'druid');
  assert.ok(cast, 'oferta rzutu druida');
  assert.ok(execute(state, cast).ok);
  resolveStack(state);
  assert.ok(state.pendingSpringbloom, 'decyzja druida');
  const offers = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'resolve_springbloom');
  assert.ok(offers.some((c) => c.skip),
    'opcjonalne poświęcenie zachowuje rezygnację (anty-over-fix)');
});

test('B46/2c: Roiling Regrowth znajduje DO DWÓCH podstawowych lądów tapniętych', () => {
  const state = game('p1');
  putCard(state, 'spell', 'roiling-regrowth', 'p1', 'hand');
  putCard(state, 'l1', 'basic-forest', 'p1');
  for (let i = 0; i < 3; i += 1) putCard(state, `lib${i}`, 'basic-island', 'p1', 'library');
  addMana(state, 'p1', 3, { colors: ['G', 'G', 'G'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'spell');
  assert.ok(execute(state, cast).ok);
  resolveStack(state);
  const sac = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'resolve_springbloom' && c.sacrificeLandId === 'l1');
  assert.ok(execute(state, sac).ok);
  // Dwie decyzje szukania (po jednej karcie), obie z możliwością rezygnacji.
  for (let i = 0; i < 2; i += 1) {
    const pick = playerView(state, 'p1').legalCommands
      .find((c) => c.type === 'resolve_search_choice' && c.found != null);
    if (!pick) break;
    assert.ok(execute(state, pick).ok);
  }
  const onBattlefield = state.zones.battlefield
    .map((id) => state.objects.get(id))
    .filter((o) => o?.cardId === 'basic-island');
  assert.equal(onBattlefield.length, 2, 'dwa podstawowe lądy weszły na pole bitwy');
  assert.ok(onBattlefield.every((o) => o.tapped), 'oba wchodzą TAPNIĘTE');
});

// ---- Transza 2: proste nowe mechaniki ------------------------------------

test('B46/3: Bring Low — 3 obrażenia, ale 5 gdy cel ma licznik +1/+1', () => {
  const state = game('p1');
  putCard(state, 'spell', 'bring-low', 'p1', 'hand');
  putCard(state, 'plain', 'giant-spider', 'p2');          // 2/4 bez liczników
  addMana(state, 'p1', 4, { colors: ['R', 'R', 'R', 'R'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'spell' && (c.targets ?? []).includes('plain'));
  assert.ok(cast, 'oferta rzutu w stwora');
  assert.ok(execute(state, cast).ok);
  resolveStack(state);
  assert.equal(state.objects.get('plain')?.damage, 3, 'bez licznika: 3 obrażenia');
});

test('B46/3b: Bring Low — cel z licznikiem +1/+1 dostaje 5', () => {
  const state = game('p1');
  putCard(state, 'spell', 'bring-low', 'p1', 'hand');
  putCard(state, 'buffed', 'giant-spider', 'p2');
  // L21: addObject IGNORUJE pole `counters` — liczniki wyłącznie addCounter.
  addCounter(state, 'buffed', '+1/+1', 1);
  addMana(state, 'p1', 4, { colors: ['R', 'R', 'R', 'R'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'spell' && (c.targets ?? []).includes('buffed'));
  assert.ok(execute(state, cast).ok);
  resolveStack(state);
  // 2/4 + licznik = 3/5, 5 obrażeń zabija (SBA).
  const target = state.objects.get('buffed');
  assert.ok(!target || target.zone === 'graveyard', 'stwór 3/5 ginie od 5 obrażeń');
});

test('B46/4: Cathartic Reunion — odrzucenie 2 kart to KOSZT, potem dobierasz 3', () => {
  const state = game('p1');
  putCard(state, 'spell', 'cathartic-reunion', 'p1', 'hand');
  putCard(state, 'h1', 'giant-spider', 'p1', 'hand');
  putCard(state, 'h2', 'highland-game', 'p1', 'hand');
  for (let i = 0; i < 5; i += 1) putCard(state, `lib${i}`, 'basic-island', 'p1', 'library');
  addMana(state, 'p1', 2, { colors: ['R', 'R'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'spell');
  assert.ok(cast, 'oferta rzutu (są dwie karty do odrzucenia)');
  assert.ok(execute(state, cast).ok);
  // Wybór odrzucanych kart należy do gracza (CR 601.2h).
  for (let i = 0; i < 4 && state.pendingDiscardChoice; i += 1) {
    const pick = playerView(state, 'p1').legalCommands.find((c) => c.type === 'resolve_discard_choice');
    if (!pick) break;
    assert.ok(execute(state, pick).ok);
  }
  const graveCount = state.zones.graveyard
    .map((id) => state.objects.get(id))
    .filter((o) => o?.controllerId === 'p1' && o.cardId !== 'cathartic-reunion').length;
  assert.equal(graveCount, 2, 'dwie karty odrzucone jako koszt');
  resolveStack(state);
  assert.equal(state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p1').length, 3,
    'po zapłacie kosztu i rozstrzygnięciu gracz ma 3 dobrane karty');
});

test('B46/4b: bez dwóch kart w ręce Cathartic Reunion NIE jest oferowany', () => {
  const state = game('p1');
  putCard(state, 'spell', 'cathartic-reunion', 'p1', 'hand');
  putCard(state, 'h1', 'giant-spider', 'p1', 'hand');   // tylko JEDNA inna karta
  addMana(state, 'p1', 2, { colors: ['R', 'R'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'spell');
  assert.ok(!cast, 'kosztu nie da się zapłacić — czar nierzucalny (CR 601.2h)');
});

test('B46/5: Guildscorn Ward — ochrona przed WIELOKOLOROWYMI', () => {
  const state = game('p1');
  putCard(state, 'host', 'highland-game', 'p1');
  putCard(state, 'ward', 'guildscorn-ward', 'p1', 'hand');
  addMana(state, 'p1', 1, { colors: ['W'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => (c.type === 'cast_aura' || c.type === 'cast_permanent') && c.objectId === 'ward');
  assert.ok(cast, 'oferta rzutu aury');
  assert.ok(execute(state, cast).ok);
  resolveStack(state);
  const host = state.objects.get('host');
  const mono = { id: 'src-mono', colors: ['R'], kind: 'creature', types: ['Creature'] };
  const multi = { id: 'src-multi', colors: ['R', 'W'], kind: 'creature', types: ['Creature'] };
  assert.equal(isProtectedFromSource(state, host, multi), true, 'chroniony przed wielokolorowym źródłem');
  assert.equal(isProtectedFromSource(state, host, mono), false, 'jednokolorowe źródło przechodzi');
});

test('B46/5b: odpięcie aury natychmiast znosi ochronę (kontrola)', () => {
  const state = game('p1');
  putCard(state, 'host', 'highland-game', 'p1');
  putCard(state, 'ward', 'guildscorn-ward', 'p1');
  // L21: `attachedTo` w addObject jest ignorowane — załączenie ustawiamy
  // wprost na obiekcie (deskryptor `aura` przychodzi już z gameObjectDataOf).
  state.objects.set('ward', Object.freeze({ ...state.objects.get('ward'), attachedTo: 'host' }));
  const multi = { id: 'src-multi', colors: ['R', 'W'], kind: 'creature', types: ['Creature'] };
  assert.equal(isProtectedFromSource(state, state.objects.get('host'), multi), true, 'z aurą: ochrona');
  state.objects.set('ward', Object.freeze({ ...state.objects.get('ward'), attachedTo: null }));
  assert.equal(isProtectedFromSource(state, state.objects.get('host'), multi), false,
    'ochrona liczona przy odczycie — bez aury znika');
});
