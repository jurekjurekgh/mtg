// Batch 60 (2026-09-27) — karty właściciela: 144 EMN, 145 SOM, 147 CMR,
// 148 EOE, 149 M20, 151 DTK, 152 DMU, 154 SOM, 155 WAR, 156 RNA — razem 10 kart.
//
// Dane Oracle i rulingi: `docs/cards/scryfall-*.json` (pobrane 2026-09-27,
// ADR 0010 §2a, ADR 0028 — rulingi „przy kartce", także puste listy).
// Katalog: `src/cards/card-data.js`; ŻADNA z 10 nie występuje w
// `tools/collection-art-ids.csv` → wszystkie BEZ artId (świadomy brak).
// Plan batcha: `docs/plans/PLAN_2026-09-27-batch60-kolekcja-144-156.md`.
//
// Podział na sekcje = etapy batcha (G1.1 … G1.10). Każda sekcja ma scenariusz
// legalny, nielegalny i interakcje z istniejącym katalogiem (ADR 0010).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { MANA_COSTS } from '../src/cards/mana-costs-data.js';
import { jumpToStep } from '../src/engine/turn.js';
import { effectivePower, effectiveToughness } from '../src/engine/permanents.js';
import { addMana } from '../src/engine/resources.js';

const registry = createCardRegistry();

function game(players = ['p1', 'p2']) {
  const state = createGameState({ seed: 60, players: players.map((id) => ({ id })) });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  for (const playerId of players) for (let i = 0; i < 4; i++) put(state, `lib-${playerId}-${i}`, 'basic-swamp', playerId, 'library');
  return state;
}

function put(state, id, cardId, playerId = 'p1', zone = 'hand', patch = {}) {
  const def = registry.get(cardId);
  assert.ok(def, `${cardId} w prawdziwym rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId,
    zone, ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes, keywords: def.keywords,
  });
  if (Object.keys(patch).length) state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
  return state.objects.get(id);
}

const commands = (s, p = s.turn.priorityPlayerId) => playerView(s, p).legalCommands;

function run(s, cmd) {
  assert.ok(cmd, 'oferta komendy istnieje');
  const r = execute(s, cmd);
  assert.ok(r.ok, JSON.stringify(r.events));
  return r;
}

function resolve(s) {
  for (let i = 0; s.zones.stack.length && i < 40; i++) {
    const choices = commands(s);
    run(s, choices.find((c) => c.type.startsWith('resolve_')) ?? choices.find((c) => c.type === 'pass_priority'));
  }
  assert.equal(s.zones.stack.length, 0, 'cały stos rozstrzygnięty');
}

const find = (s, cardId, zone = 'battlefield') => [...s.objects.values()].find((o) => o.cardId === cardId && o.zone === zone);
const player = (s, id) => s.players.find((p) => p.id === id);

// ---- G1.1: Blossoming Sands (149 M20, plan Amonkhet) ------------------------

test('B60/G1.1: Blossoming Sands — dane Oracle, gainland G/W i druk M20', () => {
  const def = registry.get('blossoming-sands');
  assert.deepEqual(def.types, ['Land']);
  assert.deepEqual(def.colors, []);
  assert.equal(def.entersTapped, true);
  assert.equal(def.set, 'M20');
  assert.equal(def.plan, 'Amonkhet');
  assert.equal(def.artId, null);
  assert.equal(def.support.status, 'supported');
  assert.deepEqual(def.support.limitations, []);
  assert.ok(def.imageUri.includes('31514c67'), 'imageUri z druku M20 (m20/243)');
  assert.equal(MANA_COSTS['blossoming-sands'], '');
});

test('B60/G1.1: Blossoming Sands — land drop wchodzi tapnięty i daje +1 życia', () => {
  const state = game();
  put(state, 'sands', 'blossoming-sands', 'p1', 'hand');
  assert.equal(player(state, 'p1').life, 20, 'startowe 20 życia');
  run(state, commands(state).find((c) => c.type === 'play_land' && c.objectId === 'sands'));
  const land = find(state, 'blossoming-sands');
  assert.ok(land, 'land jest na polu bitwy');
  assert.equal(land.tapped, true, 'wchodzi tapnięty (Oracle l.1)');
  resolve(state);
  assert.equal(player(state, 'p1').life, 21, 'trigger ETB dał +1 życia');
});

test('B60/G1.1: Blossoming Sands — {T}: Add {G} or {W} po odkręceniu', () => {
  const state = game();
  put(state, 'sands', 'blossoming-sands', 'p1', 'hand');
  run(state, commands(state).find((c) => c.type === 'play_land' && c.objectId === 'sands'));
  resolve(state);
  const land = find(state, 'blossoming-sands');
  assert.ok(land, 'land na stole po play_land (obiekt wymieniony na land-N)');
  state.objects.set(land.id, Object.freeze({ ...land, tapped: false }));
  const r = execute(state, { type: 'tap_for_mana', playerId: 'p1', objectId: land.id });
  assert.ok(r.ok, `tap_for_mana przechodzi: ${JSON.stringify(r.events)}`);
  assert.equal(state.objects.get(land.id).tapped, true, 'land jest tapnięty po {T}');
  assert.ok(r.events.some((e) => e.type === 'mana_produced' && e.source === land.id),
    'zdarzenie mana_produced ze źródłem Sands');
});

test('B60/G1.1: Blossoming Sands — drugi land drop w turze nie istnieje', () => {
  const state = game();
  put(state, 'sands', 'blossoming-sands', 'p1', 'hand');
  put(state, 'sands2', 'blossoming-sands', 'p1', 'hand');
  run(state, commands(state).find((c) => c.type === 'play_land' && c.objectId === 'sands'));
  assert.ok(!commands(state).some((c) => c.type === 'play_land' && c.objectId === 'sands2'),
    'drugi land drop w tej samej turze nie jest oferowany');
});
