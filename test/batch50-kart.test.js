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
