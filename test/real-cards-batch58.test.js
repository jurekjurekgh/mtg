// Batch 58 (2026-09-23) — karty właściciela: 219 (FIN), 265 (OGW), 318 (CLB),
// 377 (AVR), 447 (DSK), 464 (AVR), 530 (ZEN).
//
// Dane Oracle i rulingi: `docs/cards/scryfall-*.json` (pobrane 2026-09-23,
// ADR 0030). Katalog: `src/cards/card-data.js`; artId/plan:
// `tools/collection-art-ids.csv`. Plan batcha:
// `docs/plans/PLAN_2026-09-23b-batch58-kolekcja-219-530.md`.
//
// Podział na sekcje = etapy batcha (B1: 265, B2: 530, B3: 464, B4: 377,
// B5: 447, B6: 219, B7: 318). Każda sekcja ma scenariusz legalny, nielegalny
// i interakcje z istniejącym katalogiem (ADR 0010).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { MANA_COSTS } from '../src/cards/mana-costs-data.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { paymentDescriptorOf } from '../src/table/mana-wizard.js';
import { commandLabel } from '../src/table/render.js';

const registry = createCardRegistry();
const SESSION = {
  nameOf: (id) => registry.get(id)?.name ?? String(id),
  nameOfObject: (id) => String(id),
  cardDetails: (id) => registry.get(id) ?? null,
};

function game(players = ['p1', 'p2']) {
  const state = createGameState({ seed: 58, players: players.map((id) => ({ id })) });
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
const plain = (html) => String(html).replace(/<[^>]+>/g, '');

// ---- B1: Boulder Salvo (265 OGW, plan Zendikar) -----------------------------

test('B58/B1: Boulder Salvo — dane Oracle + deskryptor surge', () => {
  const def = registry.get('boulder-salvo');
  assert.deepEqual(def.types, ['Sorcery']);
  assert.deepEqual(def.colors, ['R']);
  assert.equal(def.manaCost, 5);
  assert.deepEqual(def.surge, { cost: 3, colors: ['R'] });
  assert.equal(def.set, 'OGW');
  assert.equal(def.plan, 'Zendikar');
  assert.equal(def.artId, 265);
  assert.equal(def.support.status, 'supported');
  assert.deepEqual(def.support.limitations, []);
  assert.ok(def.imageUri.includes('4e269989'), 'imageUri z druku OGW (ogw/102)');
  assert.equal(MANA_COSTS['boulder-salvo'], '{4}{R}');
});

test('B58/B1: Boulder Salvo — surge oferowany dopiero po innym czarze w turze', () => {
  const without = game();
  addMana(without, 'p1', 10);
  put(without, 'salvo', 'boulder-salvo', 'p1');
  put(without, 'tgt', 'razorfoot-griffin', 'p2', 'battlefield');
  const v1 = playerView(without, 'p1');
  assert.ok(!v1.legalCommands.some((c) => c.type === 'cast_spell' && c.objectId === 'salvo' && c.surgeCast),
    'bez rzuconego wcześniej czaru surge NIE jest oferowany');
  assert.ok(v1.legalCommands.some((c) => c.type === 'cast_spell' && c.objectId === 'salvo' && !c.surgeCast),
    'zwykły rzut za {4}{R} jest dostępny przy 10 manie');

  const withSpell = game();
  addMana(withSpell, 'p1', 10);
  withSpell.spellsCastThisTurnByPlayer = { p1: 1 };
  put(withSpell, 'salvo', 'boulder-salvo', 'p1');
  put(withSpell, 'tgt', 'razorfoot-griffin', 'p2', 'battlefield');
  const v2 = playerView(withSpell, 'p1');
  assert.ok(v2.legalCommands.some((c) => c.type === 'cast_spell' && c.objectId === 'salvo' && c.surgeCast),
    'po rzucie innego czaru surge jest oferowany');
});

test('B58/B1: Boulder Salvo — surge płaci 3 many (nie 5), MV zostaje 5', () => {
  const state = game();
  addMana(state, 'p1', 3); // dokładnie koszt surge {1}{R}
  state.spellsCastThisTurnByPlayer = { p1: 1 };
  put(state, 'salvo', 'boulder-salvo', 'p1');
  put(state, 'tgt', 'razorfoot-griffin', 'p2', 'battlefield');
  const offer = commands(state);
  const surge = offer.find((c) => c.type === 'cast_spell' && c.objectId === 'salvo' && c.surgeCast);
  assert.ok(surge, 'surge oferowany przy 3 manie');
  assert.ok(!offer.some((c) => c.type === 'cast_spell' && c.objectId === 'salvo' && !c.surgeCast),
    'pełny koszt (5) NIE jest opłacalny przy 3 manie');
  run(state, surge);
  assert.equal(player(state, 'p1').mana, 0, 'surge kosztuje 3 many');
  const onStack = find(state, 'boulder-salvo', 'stack');
  assert.equal(onStack.manaCost, 5, 'surge nie zmienia kosztu many/MV (ruling OGW 2016-01-22)');
  assert.equal(onStack.surgeCast, true, 'fakt zapłaty surge jest jawny na obiekcie stosu');
  resolve(state);
  assert.ok(state.events.some((e) => e.type === 'damage_dealt' && e.amount === 4),
    'Boulder Salvo zadaje 4 obrażenia celowi');
});

test('B58/B1: Boulder Salvo — surge bez innego czaru i rzut bez celu odrzucone', () => {
  const state = game();
  addMana(state, 'p1', 10);
  put(state, 'salvo', 'boulder-salvo', 'p1');
  put(state, 'tgt', 'razorfoot-griffin', 'p2', 'battlefield');
  const withoutSpell = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'salvo', targets: ['tgt'], surgeCast: true });
  assert.equal(withoutSpell.ok, false, 'surge bez rzuconego innego czaru jest nielegalny');
  const withoutTarget = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'salvo', targets: [] });
  assert.equal(withoutTarget.ok, false, 'brak celu-stwora odrzuca rzut');
  assert.equal(state.objects.get('salvo').zone, 'hand', 'odrzucona komenda nie rusza karty');
  assert.equal(player(state, 'p1').mana, 10, 'odrzucona komenda nie pobiera many');
});

test('B58/B1: Boulder Salvo — etykieta surge i kreator płatności znają {1}{R}', () => {
  const state = game();
  addMana(state, 'p1', 3);
  state.spellsCastThisTurnByPlayer = { p1: 1 };
  put(state, 'salvo', 'boulder-salvo', 'p1');
  put(state, 'tgt', 'razorfoot-griffin', 'p2', 'battlefield');
  const view = playerView(state, 'p1');
  const surge = view.legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'salvo' && c.surgeCast);
  const normal = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'salvo', targets: ['tgt'] });
  assert.equal(normal.ok, false, 'przy 3 manie zwykły rzut odrzucony (oferta != walidacja)');
  const label = plain(commandLabel(surge, SESSION, view));
  assert.match(label, /surge/i, `etykieta nazywa koszt surge: ${label}`);
  assert.ok(!label.includes('?'), `koszt surge znany w etykiecie: ${label}`);
  const descriptor = paymentDescriptorOf(surge, view);
  assert.ok(descriptor, 'surge ma deskryptor płatności kreatora');
  assert.equal(descriptor.totalNeeded, 3, 'surge {1}{R} = 3 many');
  assert.deepEqual(descriptor.requirements, [['R']], 'pip surge to {R}');
});
