// Zgłoszenie D — tokenowy host aury (audyt PR #157, znalezisko D-pin).
// Przebieg: zaczarowany STWÓR-TOKEN dostaje śmiertelne obrażenia. Token po
// opuszczeniu pola bitwy PRZESTAJE ISTNIEĆ (CR 704.5d — kasowany ze
// `state.objects`), aura ląduje w grobie (CR 704.5m). Testy D/1–D/3 używają
// KARTY jako hosta — martwa karta zostaje w `state.objects` ze strefą
// 'graveyard', więc `state.objects.get(attachedTo)` w `effects.js` i tak
// znajduje źródło obrażeń i fallback LKI (`context.enchantedHostLki`) NIGDY
// nie jest użyty. Próba mutacyjna B audytu (usunięcie
// `?? context?.enchantedHostLki`) zostawiała te testy zielonymi — czyli
// fallback LKI nie był przypięty żadnym pinem. Ten plik to robi: bez LKI
// hosta źródło obrażeń rozstrzygnięcia byłoby AURĄ (a nie stworem), a przy
// tokenowym hoście `attachedTo` prowadzi donikąd.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState, addObject, execute } from '../src/engine/game-state.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { attachAuraToCreature } from '../src/engine/attachments.js';
import { applyEffect } from '../src/engine/effects.js';
import { runStateBasedActions } from '../src/engine/state-based.js';
import { processTriggers } from '../src/engine/triggers.js';
import { createBattlefieldToken } from '../src/engine/tokens.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId, zone = 'battlefield', patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, ...patch,
  });
  return state.objects.get(id);
}

function stan() {
  const state = createGameState({ seed: 157, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  return state;
}

const rozstrzygnij = (state) => {
  for (let i = 0; i < 10 && state.zones.stack.length > 0; i += 1) {
    execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  }
};

test('D/4a: Pain for All — tokenowy host ginie od obrażeń niecombatowych, odbicie działa (LKI)', () => {
  const state = stan();
  // Token 2/3 (p1) z aurą Pain for All; 5 obrażeń niecombatowych = śmiertelne.
  const token = createBattlefieldToken(state, 'p1', {
    cardId: 'token_soldier', name: 'Soldier', kind: 'creature',
    power: 2, toughness: 3, types: ['Creature'], subtypes: ['Soldier'],
  });
  put(state, 'aura', 'pain-for-all', 'p1', 'battlefield');
  attachAuraToCreature(state, 'aura', token.id);
  const before = state.players.find((p) => p.id === 'p2').life;
  const evBefore = state.events.length;
  applyEffect(state, { type: 'damage', amount: 5 }, state.objects.get(token.id), [token.id]);
  runStateBasedActions(state);
  processTriggers(state, state.events.slice(evBefore));
  // Token PRZESTAŁ ISTNIEĆ (CR 704.5d) — nie ma go nawet w `state.objects`.
  assert.equal(state.objects.has(token.id), false, 'token skasowany ze stanu (CR 704.5d)');
  const aura = [...state.objects.values()].find((o) => o.instanceId === 'i-aura');
  assert.equal(aura.zone, 'graveyard', 'aura w grobie (CR 704.5m)');
  rozstrzygnij(state);
  const after = state.players.find((p) => p.id === 'p2').life;
  assert.equal(before - after, 5,
    `przeciwnik dostaje 5 (odbicie z LKI tokena): before=${before} after=${after}`);
  // PIN ŹRÓDŁA (sedno D-pin): bez fallbacku LKI źródłem byłaby AURA
  // (`sourceObject`), a nie zaczarowany stwór — kwota z kontekstu byłaby ta
  // sama, więc życie gracza nie rozróżni. Źródło RozSTRZYGNIĘCIA musi być
  // token (CR 608.2h: „it's the object as it most recently existed that does
  // it, not the ability").
  const reflection = state.events.filter((e) => e.type === 'damage_dealt' && e.target === 'p2');
  assert.equal(reflection.length, 1, `jedno zdarzenie odbicia: ${reflection.length}`);
  assert.equal(reflection[0].source, token.id, 'źródłem obrażeń jest LKI tokena (nie aura)');
  assert.equal(reflection[0].sourceCardId, 'token_soldier', 'karta źródła = token, nie Pain for All');
});

test('D/4b: Pain for All — tokenowy host ginie W WALCE, odbicie trafia atakującego gracza', () => {
  const state = stan();
  // Bot (p2) atakuje 6/6; ja (p1) blokuję tokenem 2/3 z Pain for All.
  const token = createBattlefieldToken(state, 'p1', {
    cardId: 'token_soldier', name: 'Soldier', kind: 'creature',
    power: 2, toughness: 3, types: ['Creature'], subtypes: ['Soldier'],
  });
  put(state, 'atk', 'highland-game', 'p2', 'battlefield', { power: 6, toughness: 6, summoningSickness: false });
  put(state, 'aura', 'pain-for-all', 'p1', 'battlefield');
  attachAuraToCreature(state, 'aura', token.id);
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p2', attackerIds: ['atk'] }).ok);
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p1', assignments: { atk: [token.id] } }).ok);
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  const before = state.players.find((p) => p.id === 'p2').life;
  execute(state, { type: 'resolve_combat', playerId: 'p2', defendingPlayerId: 'p1' });
  assert.equal(state.objects.has(token.id), false, 'token zginął i przestał istnieć (6 > 3)');
  const aura = [...state.objects.values()].find((o) => o.instanceId === 'i-aura');
  assert.equal(aura.zone, 'graveyard', 'aura w grobie');
  rozstrzygnij(state);
  const after = state.players.find((p) => p.id === 'p2').life;
  assert.equal(before - after, 6,
    `atakujący gracz dostaje 6 (tyle, ile zadał tokenowi): before=${before} after=${after}`);
  const reflection = state.events.filter((e) => e.type === 'damage_dealt' && e.target === 'p2');
  assert.equal(reflection.length, 1, `jedno zdarzenie odbicia: ${reflection.length}`);
  assert.equal(reflection[0].source, token.id, 'źródłem obrażeń jest LKI tokena (nie aura)');
  assert.equal(reflection[0].sourceCardId, 'token_soldier', 'karta źródła = token, nie Pain for All');
});
