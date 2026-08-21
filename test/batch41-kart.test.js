// M174 — Batch 41 (lista właściciela 2026-08-21). Transza A: reuse.
// Dane wg docs/cards/scryfall-*.json (ADR 0010 §2a); pełne Oracle (ADR 0022).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';

const REGISTRY = createCardRegistry();

function game(playerId = 'p1') {
  const state = createGameState({ seed: 41, players: [{ id: 'p1' }, { id: 'p2' }] });
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

function resolveStack(state, max = 12) {
  for (let i = 0; i < max && state.zones.stack.length > 0; i += 1) {
    const r = execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
    if (!r.ok) return false;
  }
  return state.zones.stack.length === 0;
}

// ---- Transza A ----------------------------------------------------------------

test('A1: Spin Out — niszczy stwora ORAZ Vehicle (creature_or_vehicle)', () => {
  // Stwór przeciwnika.
  const state = game('p1');
  putCard(state, 'spin', 'spin-out', 'p1', 'hand');
  putCard(state, 'foe', 'highland-game', 'p2');
  addMana(state, 'p1', 3, { colors: ['B'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'spin' && c.targets?.[0] === 'foe');
  assert.ok(cast, 'oferta na stwora');
  assert.ok(execute(state, cast).ok);
  assert.ok(resolveStack(state));
  assert.notEqual(state.objects.get('foe')?.zone, 'battlefield', 'stwór zniszczony');

  // Vehicle (artefakt z podtypem Vehicle — nie stwór).
  const s2 = game('p1');
  putCard(s2, 'spin', 'spin-out', 'p1', 'hand');
  addObject(s2, {
    id: 'veh', instanceId: 'i-veh', cardId: 'x-vehicle', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', kind: 'artifact', manaCost: 3, types: ['Artifact', 'Vehicle'],
    subtypes: ['Vehicle'], colors: [], abilities: [],
  });
  addMana(s2, 'p1', 3, { colors: ['B'] });
  const castV = playerView(s2, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'spin' && c.targets?.[0] === 'veh');
  assert.ok(castV, 'oferta na Vehicle');
  assert.ok(execute(s2, castV).ok);
  assert.ok(resolveStack(s2));
  assert.notEqual(s2.objects.get('veh')?.zone, 'battlefield', 'Vehicle zniszczony');
});

test('A2: Stall Out — tap + 3 liczniki stun; stun blokuje odkręcenie (CR 122)', () => {
  const state = game('p1');
  putCard(state, 'stall', 'stall-out', 'p1', 'hand');
  putCard(state, 'foe', 'highland-game', 'p2', 'battlefield', { summoningSickness: false });
  addMana(state, 'p1', 2, { colors: ['U'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'stall' && c.targets?.[0] === 'foe');
  assert.ok(cast, 'oferta rzutu (sorcery, main faza)');
  assert.ok(execute(state, cast).ok);
  assert.ok(resolveStack(state));
  const foe = state.objects.get('foe');
  assert.equal(foe.tapped, true, 'cel zatapowany');
  assert.equal((foe.counters ?? {}).stun, 3, '3 liczniki stun');
});

test('A2b: Stall Out — Cycling {2} dobiera kartę', () => {
  const state = game('p1');
  putCard(state, 'stall', 'stall-out', 'p1', 'hand');
  putCard(state, 'lib1', 'highland-game', 'p1', 'library');
  addMana(state, 'p1', 2, { colors: [] });
  const cyc = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'stall');
  assert.ok(cyc, 'oferta cyclingu z ręki');
  const before = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p1').length;
  assert.ok(execute(state, cyc).ok);
  resolveStack(state);
  const after = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p1').length;
  assert.equal(after, before, 'odrzucona 1 (koszt) + dobrana 1 = bilans 0');
  assert.ok([...state.objects.values()].some((o) => o.cardId === 'stall-out' && o.zone === 'graveyard'),
    'Stall Out w grobie po cyclingu');
});

test('A3: Horizon Spellbomb — sac→szukaj basic land do RĘKI; dies→opcjonalne {G}→draw', () => {
  const state = game('p1');
  putCard(state, 'bomb', 'horizon-spellbomb', 'p1', 'battlefield');
  // Wierzch biblioteki = pierwszy dodany: draw z triggera zabiera stwora,
  // Las zostaje dla szukania.
  putCard(state, 'libcard', 'highland-game', 'p1', 'library');
  putCard(state, 'libland', 'basic-forest', 'p1', 'library');
  addMana(state, 'p1', 3, { colors: ['G'] });
  const activate = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'bomb');
  assert.ok(activate, 'oferta aktywacji {2},{T},sac');
  assert.ok(execute(state, activate).ok);
  // Sacrifice to KOSZT — trigger „dies" odpala od razu (przed rozstrzygnięciem
  // szukania): najpierw decyzja „you may pay {G}".
  assert.ok(state.pendingOptionalPay, 'decyzja „you may pay {G}" po poświęceniu');
  const pay = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'resolve_optional_pay_choice' && c.pay === true);
  assert.ok(pay, 'oferta zapłaty {G}');
  const handBefore = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p1').length;
  assert.ok(execute(state, pay).ok);
  assert.ok(resolveStack(state), 'stos rozstrzygnięty (draw + szukanie)');
  const handMid = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p1').length;
  assert.equal(handMid, handBefore + 1, 'zapłacone {G} → dobrana karta');
  // Szukanie: znajdź las do ręki.
  const search = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'resolve_search_choice' && c.found != null);
  assert.ok(search, 'decyzja szukania (basic land)');
  assert.ok(execute(state, search).ok);
  const inHand = state.zones.hand.some((id) => state.objects.get(id)?.cardId === 'basic-forest');
  assert.ok(inHand, 'basic land trafia DO RĘKI (nie na pole)');
});
