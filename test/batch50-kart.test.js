// Batch 50 (2026-08-26) — 5 kart z listy właściciela (artId 567–571).
// Dane Oracle: docs/cards/scryfall-*.json (pobrane 2026-08-26).
//
// Karty:
//   - Dimir Guildgate (GRN)   → dual land entersTapped + {T}: U/B (wzorzec Dismal Backwater)
//   - Vow of Flight (CMR)      → aura +2/+2, flying, cantAttackYou (wzorzec Serra's Embrace)
//   - Nanoform Sentinel (EOE)  → trigger self-tap → untap target (once/turn) [nowa mechanika]
//   - Jwar Isle Avenger (OGW)  → Flying + Surge (alt-cost) [nowa mechanika]
//   - Manifest Dread (DSK)     → sorcery: manifest dread [nowa mechanika]
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { attachAuraToCreature } from '../src/engine/attachments.js';
import { effectivePower, effectiveToughness, effectiveKeywords, tapObject } from '../src/engine/permanents.js';
import { processTriggers } from '../src/engine/triggers.js';

const REGISTRY = createCardRegistry();

function game(playerId = 'p1', step = 'main') {
  const state = createGameState({ seed: 50, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function put(state, id, cardId, controllerId, zone = 'battlefield', patch = {}) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness, manaCost: data.manaCost,
    spell: data.spell, abilities: data.abilities ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], types: def.types ?? [], colors: def.colors ?? [],
    entersTapped: def.entersTapped ?? false, aura: data.aura ?? null,
  });
  if (Object.keys(patch).length) {
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
  }
  return state.objects.get(id);
}

// ---- Dimir Guildgate --------------------------------------------------------

test('B50: Dimir Guildgate — dane Oracle zgadzają się z definicją', () => {
  const def = REGISTRY.get('dimir-guildgate');
  assert.deepEqual(def.types, ['Land']);
  assert.deepEqual(def.subtypes, ['Gate']);
  assert.equal(def.entersTapped, true);
  assert.ok(def.imageUri.includes('b7129bdf'), 'imageUri z druku GRN');
  assert.equal(def.artId, 570);
  assert.equal(def.support.status, 'supported');
  assert.deepEqual(def.support.limitations, []);
});

test('B50: Dimir Guildgate — {T}: dodaj {U} lub {B} (dwie opcje koloru)', () => {
  const state = game('p1', 'main');
  put(state, 'gate', 'dimir-guildgate', 'p1', 'battlefield');
  const view = playerView(state, 'p1');
  const manaCmds = view.legalCommands.filter((c) => c.type === 'activate_ability' && c.objectId === 'gate');
  assert.ok(manaCmds.length >= 1, 'oferta zdolności many istnieje');
  const before = state.players.find((p) => p.id === 'p1').mana;
  const r = execute(state, manaCmds[0]);
  assert.ok(r.ok, `aktywacja many odrzucona: ${r.events?.[0]?.reason}`);
  const after = state.players.find((p) => p.id === 'p1').mana;
  assert.equal(after, before + 1, 'dodano 1 manę');
  const pool = state.players.find((p) => p.id === 'p1').manaPool;
  const keys = [...Object.keys(pool)].filter((k) => pool[k] > 0);
  assert.ok(keys.some((k) => k.includes('U') || k.includes('B')), `mana w kolorze U/B, pool: ${JSON.stringify(pool)}`);
});

test('B50: Dimir Guildgate — wchodzi zatapnięty (entersTapped)', () => {
  const state = game('p1', 'main');
  put(state, 'gate', 'dimir-guildgate', 'p1', 'hand');
  const view = playerView(state, 'p1');
  const play = view.legalCommands.find((c) => c.type === 'play_land' && c.objectId === 'gate');
  assert.ok(play, 'ląd można zagrać');
  const r = execute(state, play);
  assert.ok(r.ok, `zagranie lądu odrzucone: ${r.events?.[0]?.reason}`);
  const onBoard = [...state.objects.values()].find((o) => o.cardId === 'dimir-guildgate' && o.zone === 'battlefield');
  assert.ok(onBoard, 'ląd na polu bitwy');
  assert.equal(onBoard.tapped, true, 'ląd wchodzi zatapniety');
});

// ---- Vow of Flight ----------------------------------------------------------

test('B50: Vow of Flight — dane Oracle zgadzają się z definicją (aura +2/+2, flying, cantAttackYou)', () => {
  const def = REGISTRY.get('vow-of-flight');
  assert.deepEqual(def.types, ['Enchantment']);
  assert.deepEqual(def.subtypes, ['Aura']);
  assert.deepEqual(def.colors, ['U']);
  assert.equal(def.aura.cantAttackYou, true);
  assert.deepEqual(def.aura.pump, { power: 2, toughness: 2 });
  assert.deepEqual(def.aura.keywords, ['flying']);
  assert.equal(def.artId, 571);
  assert.equal(def.support.status, 'supported');
  assert.deepEqual(def.support.limitations, []);
});

test('B50: Vow of Flight — zaczarowany stwór dostaje +2/+2 i flying', () => {
  const state = game('p1', 'main');
  const creature = put(state, 'bear', 'highland-game', 'p2', 'battlefield');
  put(state, 'vow', 'vow-of-flight', 'p1', 'battlefield');
  attachAuraToCreature(state, 'vow', 'bear');
  const host = state.objects.get('bear');
  assert.equal(effectivePower(host, state), (creature.power ?? 0) + 2, '+2 mocy');
  assert.equal(effectiveToughness(host, state), (creature.toughness ?? 0) + 2, '+2 wytrzymałości');
  assert.ok(effectiveKeywords(host, state).includes('flying'), 'flying nadane');
});

test('B50: Vow of Flight — zaczarowany stwór przeciwnika NIE może atakować (1v1, CR cantAttackYou)', () => {
  const state = game('p2', 'declare_attackers');
  put(state, 'bear', 'highland-game', 'p2', 'battlefield', { summoningSickness: false });
  put(state, 'vow', 'vow-of-flight', 'p1', 'battlefield');
  attachAuraToCreature(state, 'vow', 'bear');
  const view = playerView(state, 'p2');
  const attack = view.legalCommands.find((c) => c.type === 'declare_attackers' && (c.attackerIds ?? []).includes('bear'));
  assert.ok(!attack, 'stwór z Vow of Flight nie może zostać zadeklarowany do ataku na właściciela aury');
});

// ---- Nanoform Sentinel ------------------------------------------------------

test('B50: Nanoform Sentinel — dane Oracle i trigger self_becomes_tapped (once/turn)', () => {
  const def = REGISTRY.get('nanoform-sentinel');
  assert.deepEqual(def.types, ['Artifact', 'Creature']);
  assert.equal(def.power, 3);
  assert.equal(def.toughness, 2);
  const trig = def.abilities[0].trigger;
  assert.equal(trig.event, 'self_becomes_tapped');
  assert.equal(trig.oncePerTurn, true);
  assert.deepEqual(trig.requiresTarget, { type: 'permanent', notSelf: true });
  assert.equal(def.artId, 568);
});

function tapAndProcess(state, id) {
  const before = state.events.length;
  tapObject(state, id, state.objects.get(id).controllerId);
  const tapEvent = state.events[state.events.length - 1];
  return processTriggers(state, [tapEvent]);
}

test('B50: Nanoform Sentinel — tapnięcie odkręca INNY docelowy permanent', () => {
  const state = game('p1', 'main');
  put(state, 'nano', 'nanoform-sentinel', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'land', 'basic-island', 'p1', 'battlefield', { tapped: true });
  const produced = tapAndProcess(state, 'nano');
  assert.ok(produced.some((e) => e.type === 'trigger_target_required'), 'trigger celu odpalił się');
  const view = playerView(state, 'p1');
  const pick = view.legalCommands.find((c) => c.type === 'resolve_trigger_target' && c.targetId === 'land');
  assert.ok(pick, 'oferta celu: tapnięty ląd');
  const r = execute(state, pick);
  assert.ok(r.ok, `resolve_trigger_target odrzucone: ${r.events?.[0]?.reason}`);
  // rozstrzygamy stos triggera
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  assert.equal(state.objects.get('land').tapped, false, 'docelowy ląd został odkręcony');
});

test('B50: Nanoform Sentinel — „another\" NIE celuje w siebie', () => {
  const state = game('p1', 'main');
  put(state, 'nano', 'nanoform-sentinel', 'p1', 'battlefield', { summoningSickness: false });
  tapAndProcess(state, 'nano');
  const view = playerView(state, 'p1');
  const selfPick = view.legalCommands.find((c) => c.type === 'resolve_trigger_target' && c.targetId === 'nano');
  assert.ok(!selfPick, 'notSelf: własne źródło nie jest legalnym celem („another")');
});

test('B50: Nanoform Sentinel — triggers only once each turn', () => {
  const state = game('p1', 'main');
  put(state, 'nano', 'nanoform-sentinel', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'land', 'basic-island', 'p1', 'battlefield', { tapped: true });
  const first = tapAndProcess(state, 'nano');
  assert.ok(first.some((e) => e.type === 'trigger_target_required'), 'pierwsze tapnięcie odpala trigger');
  // rozstrzygnij i odkręć nano, żeby móc tapnąć drugi raz w tej samej turze
  const view = playerView(state, 'p1');
  const pick = view.legalCommands.find((c) => c.type === 'resolve_trigger_target' && c.targetId === 'land');
  execute(state, pick);
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  state.objects.set('nano', Object.freeze({ ...state.objects.get('nano'), tapped: false }));
  const second = tapAndProcess(state, 'nano');
  assert.ok(!second.some((e) => e.type === 'trigger_target_required'),
    'drugie tapnięcie w tej samej turze NIE odpala triggera (once each turn)');
});
