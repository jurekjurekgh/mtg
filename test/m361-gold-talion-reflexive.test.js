import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

/**
 * M361/B2 (ZŁOTO, bug #2) — Talion's Messenger jako JEDEN trigger z celem z góry.
 *
 * Scryfall ruling 2023-09-01: „You don't choose a target for Talion's
 * Messenger's ability at the time it triggers. Rather, a second 'reflexive'
 * ability triggers when you discard a card this way. You choose a target for
 * that ability as it goes on the stack. Each player may respond to this
 * triggered ability as normal."
 *
 * Silnik sklejał oba triggery w jeden (cel Faerie wybierany PRZED dobraniem,
 * licznik bezwarunkowo po odrzucie): brak okna odpowiedzi na refleks, cel
 * z góry (przeciek informacji — wybór przed zobaczeniem dobranej karty),
 * a przy pustej ręce licznik lądował MIMO braku odrzutu („when you discard
 * this way" wymaga odrzucenia).
 */

const REGISTRY = createCardRegistry();

function game(seed = 20260916) {
  return createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] });
}
function toCombat(state, playerId = 'p1') {
  state.turn = jumpToStep(state.turn, 'declare_attackers', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  state.turn.passes = 0;
  return state;
}
function addRealCard(state, id, cardId, playerId, zone, extra = {}) {
  const card = REGISTRY.get(cardId);
  assert.ok(card, `brak karty ${cardId}`);
  const data = gameObjectDataOf(card);
  data.types = card.types ?? [];
  data.keywords = card.keywords ?? [];
  data.subtypes = card.subtypes ?? [];
  return addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId, zone,
    ...data, ...extra,
  });
}
function passBoth(state) {
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok);
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p2' }).ok);
}
function countersOf(state, id, name) {
  const o = state.objects.get(id);
  return o?.counters?.[name] ?? 0;
}

test('B2/dane: dwa triggery — rodzic bez celu, refleks z celem Faerie', () => {
  const def = REGISTRY.get('talions-messenger');
  const parent = def.abilities.find((a) => a.trigger?.event === 'faerie_attacks');
  assert.ok(parent, 'trigger faerie_attacks istnieje');
  assert.ok(!parent.trigger.requiresTarget, 'rodzic BEZ celu (cel wybiera refleks)');
  const disc = parent.effect.find((e) => e.type === 'discard_cards');
  assert.ok(disc?.reflexiveEvent, 'odrzut niesie linkę refleksywną');
  const child = def.abilities.find((a) => a.trigger?.event === disc.reflexiveEvent);
  assert.ok(child, 'refleksyjny trigger istnieje');
  assert.equal(child.trigger.requiresTarget.type, 'creature_you_control');
  assert.equal(child.trigger.requiresTarget.subtype, 'Faerie');
});

test('B2: cel dopiero PO odrzucie — dwa osobne obiekty na stosie z oknem odpowiedzi', () => {
  const state = toCombat(game());
  addRealCard(state, 'talion', 'talions-messenger', 'p1', 'battlefield', { summoningSickness: false });
  addRealCard(state, 'd1', 'highland-game', 'p1', 'hand');
  addRealCard(state, 'l1', 'highland-game', 'p1', 'library');
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['talion'] }).ok);
  // RED: dotąd requiresTarget na rodzicu → cel rozstrzygany NATYCHMIAST po
  // ataku (jawnie albo auto przy 1 kandydacie) — przed dobraniem i odrzutem.
  assert.equal(state.pendingTriggerTargets.length, 0, 'brak decyzji celu przed dobraniem/odrzutem');
  assert.ok(!state.events.some((e) => e.type === 'trigger_target_resolved'), 'cel NIE rozstrzygnięty przed dobraniem/odrzutem');
  assert.equal(state.zones.stack.length, 1, 'rodzic na stosie jako jedyny obiekt');
  passBoth(state); // rodzic rozstrzyga się: dobranie + decyzja odrzutu
  assert.ok(state.pendingDiscardChoice, 'po dobraniu czeka decyzja odrzutu');
  const handBefore = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p1');
  assert.equal(handBefore.length, 2, 'dobrano 1 (ręka 1+1) przed odrzutem');
  const discards = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'resolve_discard_choice');
  assert.ok(discards.length > 0, 'oferty odrzutu istnieją');
  assert.ok(execute(state, discards[0]).ok, 'odrzut wykonany');
  // Refleks to OSOBNY trigger na stosie (okno odpowiedzi istnieje).
  assert.equal(state.zones.stack.length, 1, 'refleks na stosie po odrzucie (rodzic zszedł)');
  const fired = state.events.filter((e) => e.type === 'ability_triggered');
  assert.equal(fired.length, 2, 'dwa ability_triggered (rodzic + refleks)');
  // Cel refleksu rozstrzygany DOPIERO teraz (po odrzucie — przy jednym
  // kandydacie automatycznie, przy wielu jawnie).
  const types = state.events.map((e) => e.type);
  assert.ok(types.lastIndexOf('trigger_target_resolved') > types.lastIndexOf('discard_choice_resolved'),
    'cel Faerie rozstrzygnięty PO odrzucie (nie z góry)');
  const aim = playerView(state, 'p1').legalCommands.find((c) => c.type === 'resolve_trigger_target' && c.targetId === 'talion');
  if (aim) assert.ok(execute(state, aim).ok);
  passBoth(state);
  assert.equal(countersOf(state, 'talion', '+1/+1'), 1, 'licznik +1/+1 na docelowym Faerie');
});

test('B2: brak odrzutu (pusta ręka i biblioteka) → brak refleksu i licznika', () => {
  // Dociąg z pustej biblioteki przegrywa partię (CR 704.5b) — ale NAJPIERW
  // rodzic rozstrzyga się do końca (odrzut pominięty: pusta ręka). Licznik
  // „when you discard this way" NIE może się pojawić (nic nie odrzucono).
  const state = toCombat(game(3));
  addRealCard(state, 'talion', 'talions-messenger', 'p1', 'battlefield', { summoningSickness: false });
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['talion'] }).ok);
  let guard = 0;
  while (state.status === 'active' && state.zones.stack.length > 0 && guard++ < 20) {
    const holder = state.turn.priorityPlayerId;
    const view = playerView(state, holder);
    const aim = view.legalCommands.find((c) => c.type === 'resolve_trigger_target');
    if (aim) { execute(state, aim); continue; }
    const disc = view.legalCommands.find((c) => c.type === 'resolve_discard_choice');
    if (disc) { execute(state, disc); continue; }
    const pass = view.legalCommands.find((c) => c.type === 'pass_priority');
    if (!pass) break;
    execute(state, pass);
  }
  assert.equal(countersOf(state, 'talion', '+1/+1'), 0, 'bez odrzutu licznik NIE ląduje');
  assert.equal(state.events.filter((e) => e.type === 'ability_triggered').length, 1, 'tylko rodzic (refleks nie odpalił)');
});

test('B2: strażnik — atak dwoma Faerie to nadal JEDEN trigger rodzica', () => {
  const state = toCombat(game(5));
  addRealCard(state, 'talion', 'talions-messenger', 'p1', 'battlefield', { summoningSickness: false });
  addRealCard(state, 'clique', 'puppeteer-clique', 'p1', 'battlefield', { summoningSickness: false });
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['talion', 'clique'] }).ok);
  // Ścieżka starego kodu: dwóch kandydatów → jawna decyzja celu przed wejściem na stos.
  const aim = playerView(state, 'p1').legalCommands.find((c) => c.type === 'resolve_trigger_target');
  if (aim) execute(state, aim);
  assert.equal(state.zones.stack.length, 1, 'jeden rodzic mimo dwóch atakujących Faerie');
});
