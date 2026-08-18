import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGameState, execute, playerView, addObject } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addCounter } from '../src/engine/counters.js';
import { processTriggers } from '../src/engine/triggers.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

const REGISTRY = createCardRegistry();

function newState() {
  const state = createGameState({ seed: 2026, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  return state;
}

function stateInDeclareAttackers() {
  const state = newState();
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  return state;
}

// Sanity Scryfall: nazwa w pliku == nazwa w definicji.
function assertScryfall(id) {
  const raw = fs.readFileSync(`docs/cards/scryfall-${id}.json`, 'utf8');
  const j = JSON.parse(raw);
  const def = REGISTRY.get(id);
  assert.equal(j.name, def.name, `${id}: nazwa Scryfall != definicja`);
}

// =============================================================================
// Batch 22 — Thistledown Players, Etherwrought Page, Stomping Slabs
// (3 z 10 kart batcha, etap 1/3)
// =============================================================================

test('Thistledown Players: trigger attacks + untap nonland permanent (T2: cel wybiera kontroler)', () => {
  assertScryfall('thistledown-players');
  const state = stateInDeclareAttackers();
  // W ręce p1 Thistledown Players + land
  const def = REGISTRY.get('thistledown-players');
  const data = gameObjectDataOf(def);
  addObject(state, {
    id: 'mice', instanceId: 'i-mice', cardId: 'thistledown-players', controllerId: 'p1',
    zone: 'battlefield', kind: 'creature', power: 3, toughness: 3, manaCost: 3,
    abilities: def.abilities, keywords: def.keywords ?? [], subtypes: ['Mouse', 'Bard'],
    types: ['Creature'], colors: ['W'],
  });
  // Cel — tapnięty stwór na bitwisku
  addObject(state, {
    id: 'target', instanceId: 'i-target', cardId: 'x-test', controllerId: 'p1',
    zone: 'battlefield', kind: 'creature', power: 2, toughness: 2, manaCost: 1,
    abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: ['G'],
  });
  state.objects.set('target', Object.freeze({ ...state.objects.get('target'), summoningSickness: false }));
  // P2 — land na bitwisku (powinien być pominięty — land to NIE nonland_permanent)
  addObject(state, {
    id: 'land-p2', instanceId: 'i-land-p2', cardId: 'basic-forest', controllerId: 'p2',
    zone: 'battlefield', kind: 'land', power: null, toughness: null, manaCost: 0,
    abilities: [], keywords: [], subtypes: ['Forest'], types: ['Basic', 'Land'],
    colors: ['G'],
  });
  // Tap oba ręcznie (addObject nie przyjmuje tapped: true — wejście untappnięte).
  state.objects.set('target', { ...state.objects.get('target'), tapped: true });
  state.objects.set('land-p2', { ...state.objects.get('land-p2'), tapped: true });
  // Rejestrujemy atak
  const cmd = {
    type: 'declare_attackers',
    playerId: 'p1',
    attackerIds: ['mice'],
  };
  const r = execute(state, cmd);
  assert.equal(r.ok, true, 'declare_attackers');
  // pendingTriggerTargets: trigger attacks czeka na cel (T2)
  assert.equal(state.pendingTriggerTargets.length, 1, 'pendingTriggerTargets ma 1 wpis');
  const pending = state.pendingTriggerTargets[0];
  assert.equal(pending.sourceId, 'mice');
  // Wybieramy target (stwór, NIE land) — land-p2 powinien być w candidateIds=false
  const r2 = execute(state, { type: 'resolve_trigger_target', playerId: 'p1', targetId: 'target' });
  assert.equal(r2.ok, true, 'resolve_trigger_target');
  // T6: trigger poszedł na stos — rozstrzyga się po rundzie passów.
  // Wykonaj passy obu graczy, żeby symulacja zamknęła kolejkę.
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  // Target odtapnięty
  assert.equal(state.objects.get('target').tapped, false, 'target odtapnięty');
  // Land nadal tapnięty (nie był celem)
  assert.equal(state.objects.get('land-p2').tapped, true, 'land nadal tapnięty');
});

test('Etherwrought Page: upkeep trigger kolejkuje resolve_modal_choice', () => {
  assertScryfall('etherwrought-page');
  const state = newState();
  const def = REGISTRY.get('etherwrought-page');
  const data = gameObjectDataOf(def);
  addObject(state, {
    id: 'page', instanceId: 'i-page', cardId: 'etherwrought-page', controllerId: 'p1',
    zone: 'battlefield', kind: 'artifact', power: null, toughness: null, manaCost: 4,
    abilities: def.abilities, keywords: [], subtypes: [],
    types: ['Artifact'], colors: ['B', 'U', 'W'],
  });
  // p1 zaczyna z life 20
  const p1Before = state.players.find((p) => p.id === 'p1').life;
  const p2Before = state.players.find((p) => p.id === 'p2').life;
  // Wymuś upkeep
  state.turn.step = 'upkeep';
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  // Dodaj wywołanie upkeep do strumienia zdarzeń
  state.events.push({ type: 'step_advanced', step: 'upkeep' });
  // processTriggers jest wywoływany przez execute; my robimy ręcznie
  // (bo nie ma tu pętli komend). Sprawdzamy pendingModalTrigger.
  processTriggers(state, [{ type: 'step_advanced', step: 'upkeep' }]);
  // Powinien być pendingModalTrigger
  assert.ok(state.pendingModalTrigger, 'pendingModalTrigger kolejkuje się');
  assert.equal(state.pendingModalTrigger.playerId, 'p1');
  assert.equal(state.pendingModalTrigger.modes.length, 3, '3 tryby modalne');
  // Gracz wybiera tryb 0 (Life Gain)
  const r = execute(state, { type: 'resolve_modal_choice', playerId: 'p1', modeIndex: 0 });
  assert.equal(r.ok, true, 'resolve_modal_choice');
  // p1 +2 życia
  const p1After = state.players.find((p) => p.id === 'p1').life;
  assert.equal(p1After - p1Before, 2, 'p1 +2 life (tryb 0)');
  assert.equal(state.pendingModalTrigger, null, 'pending wyczyszczony');
  // Wybór trybu 2 (Drain) — p2 -1
  state.turn.priorityPlayerId = 'p1';
  state.turn.activePlayerId = 'p1';
  // Wymuś ponowny upkeep
  state.turn.step = 'upkeep';
  state.events.push({ type: 'step_advanced', step: 'upkeep' });
  processTriggers(state, [{ type: 'step_advanced', step: 'upkeep' }]);
  assert.ok(state.pendingModalTrigger, 'pending znowu kolejkuje');
  const r2 = execute(state, { type: 'resolve_modal_choice', playerId: 'p1', modeIndex: 2 });
  assert.equal(r2.ok, true);
  const p2After = state.players.find((p) => p.id === 'p2').life;
  assert.equal(p2Before - p2After, 1, 'p2 -1 life (tryb 2)');
});

test('Stomping Slabs: reveal top 7, reorder, named card deal 7 damage', () => {
  assertScryfall('stomping-slabs');
  const state = newState();
  // Stomping Slabs na ręce
  const def = REGISTRY.get('stomping-slabs');
  const data = gameObjectDataOf(def);
  addObject(state, {
    id: 'ss', instanceId: 'i-ss', cardId: 'stomping-slabs', controllerId: 'p1',
    zone: 'hand', kind: 'sorcery', power: null, toughness: null, manaCost: 3,
    abilities: def.abilities ?? [], keywords: [], subtypes: [],
    types: ['Sorcery'], colors: ['R'], spell: def.spell,
  });
  // Biblioteka p1: 7 kart (w tym 1 Stomping Slabs w reveal)
  // Dodaję w kolejności tak, żeby Stomping Slabs był w reveal
  for (let i = 6; i >= 0; i--) {
    const name = i === 4 ? 'Stomping Slabs' : `Other ${i}`;
    const isCreature = i === 2;
    addObject(state, {
      id: `lib-${i}`, instanceId: `ilib-${i}`, cardId: 'x-test', controllerId: 'p1',
      zone: 'library', kind: isCreature ? 'creature' : 'instant',
      power: isCreature ? 2 : null, toughness: isCreature ? 2 : null, manaCost: 1,
      abilities: [], keywords: [], subtypes: [], types: isCreature ? ['Creature'] : ['Instant'],
      colors: ['R'], name,
    });
  }
  // Library state: [lib-0, lib-1, lib-2, lib-3, lib-4, lib-5, lib-6]
  // Top 7 = lib-6, lib-5, lib-4, lib-3, lib-2, lib-1, lib-0 (od góry)
  // Stomping Slabs na spodzie biblioteki → NIE w reveal.
  // Aby Stomping Slabs BYŁ w reveal: musi być w top 7 = lib-1..lib-7
  // Sprawdźmy pozycję:
  assert.equal(state.objects.get('lib-0').name, 'Other 0'); // bottom
  assert.equal(state.objects.get('lib-4').name, 'Stomping Slabs');
  // Stomping Slabs jest na pozycji 4 od dołu, czyli 3 od góry — NIE w top 7
  // (jest, bo top 7 = lib-0..lib-6). OK, w reveal.
  // W bibliotece zostało 7 kart, w reveal idzie [lib-6,lib-5,...,lib-0].
  // Ręcznie budujemy pendingRevealOrder (peek) — jak w engine-batch22.test.js.
  const revealed = ['lib-6', 'lib-5', 'lib-4', 'lib-3', 'lib-2', 'lib-1', 'lib-0'];
  state.pendingRevealOrder = {
    playerId: 'p1', sourceId: 'ss', sourceCardId: 'stomping-slabs',
    cardIds: revealed, amount: 7, restorePriorityTo: 'p1',
    effect: { type: 'reveal_top_to_bottom_order', amount: 7,
      namedCard: 'Stomping Slabs', thenDamage: 7 },
  };
  // Gracz wybiera kolejność: lib-0 (nowy bottom), ..., lib-6 (nowy top)
  const r = execute(state, {
    type: 'resolve_reveal_order', playerId: 'p1',
    order: ['lib-0', 'lib-1', 'lib-2', 'lib-3', 'lib-4', 'lib-5', 'lib-6'],
  });
  assert.equal(r.ok, true);
  // Biblioteka po reorderze: lib-0 (bottom) ... lib-6 (top) — ta sama kolejność
  // bo reorder = identyczna kolejność
  assert.equal(state.zones.library[0], 'lib-0');
  assert.equal(state.zones.library[6], 'lib-6');
  // pendingDamageTarget kolejkuje się (named „Stomping Slabs" w reveal)
  assert.ok(state.pendingDamageTarget, 'pendingDamageTarget kolejkuje się');
  // Gracz wybiera cel (p2 — gracz przeciwnika)
  const p2Before = state.players.find((p) => p.id === 'p2').life;
  const r2 = execute(state, { type: 'resolve_damage_target', playerId: 'p1', targetId: 'p2' });
  assert.equal(r2.ok, true);
  const p2After = state.players.find((p) => p.id === 'p2').life;
  assert.equal(p2Before - p2After, 7, 'p2 -7 life (Stomping Slabs damage)');
});

test('Stomping Slabs: BEZ Stomping Slabs w reveal → brak damage', () => {
  assertScryfall('stomping-slabs');
  const state = newState();
  const def = REGISTRY.get('stomping-slabs');
  const data = gameObjectDataOf(def);
  addObject(state, {
    id: 'ss', instanceId: 'i-ss', cardId: 'stomping-slabs', controllerId: 'p1',
    zone: 'hand', kind: 'sorcery', power: null, toughness: null, manaCost: 3,
    abilities: [], keywords: [], subtypes: [],
    types: ['Sorcery'], colors: ['R'], spell: def.spell,
  });
  for (let i = 6; i >= 0; i--) {
    addObject(state, {
      id: `lib-${i}`, instanceId: `ilib-${i}`, cardId: 'x-test', controllerId: 'p1',
      zone: 'library', kind: 'instant', power: null, toughness: null, manaCost: 1,
      abilities: [], keywords: [], subtypes: [], types: ['Instant'],
      colors: ['R'], name: `Other ${i}`,
    });
  }
  // lib-4 NIE jest Stomping Slabs — wszystko „Other N"
  const revealed = ['lib-6', 'lib-5', 'lib-4', 'lib-3', 'lib-2', 'lib-1', 'lib-0'];
  state.pendingRevealOrder = {
    playerId: 'p1', sourceId: 'ss', sourceCardId: 'stomping-slabs',
    cardIds: revealed, amount: 7, restorePriorityTo: 'p1',
    effect: { type: 'reveal_top_to_bottom_order', amount: 7,
      namedCard: 'Stomping Slabs', thenDamage: 7 },
  };
  const r = execute(state, {
    type: 'resolve_reveal_order', playerId: 'p1',
    order: ['lib-0', 'lib-1', 'lib-2', 'lib-3', 'lib-4', 'lib-5', 'lib-6'],
  });
  assert.equal(r.ok, true);
  // Brak pendingDamageTarget (warunek named nie spełniony)
  assert.equal(state.pendingDamageTarget, null, 'brak damage bez Stomping Slabs w reveal');
});
