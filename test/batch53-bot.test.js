// Audyt Batch53, warstwa (c): wycena bota heurystycznego dla kart batcha.
//
// C-FIX-2 (Rust-Shield Rampager): sim walki nie znał ewazji mocowej
// („can't be blocked by creatures with power 2 or less") — bot trzymał
// Rampagera przed murem 0/5, choć żaden bloker o mocy ≤2 nie może go
// zablokować. Próg jedzie w PlayerView (ADR 0017), sim go filtruje.
// C-FIX-1: remis rzut naturalny/offspring miał identyczne projekcje —
// projekcja niesie teraz flagę `offspring` (jak `kicker`).
// Reszta to piny zachowań POPRAWNYCH (Acidic/Keep Out cele, rzuty ciał,
// loot Óina) — regresja ma je pilnować, nie zmieniać.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function game(step = 'main', pid = 'p1') {
  const s = createGameState({ seed: 53, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, step, pid);
  s.turn.activePlayerId = pid;
  s.turn.priorityPlayerId = pid;
  return s;
}

function addCard(s, id, cardId, pid, zone = 'hand') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(s, {
    id, instanceId: `i-${id}`, cardId, controllerId: pid, ownerId: pid, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  return s.objects.get(id);
}

function addVanilla(s, id, pid, { power = 2, toughness = 2 } = {}) {
  addObject(s, {
    id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId: pid, ownerId: pid,
    zone: 'battlefield', kind: 'creature', power, toughness, manaCost: 1,
    abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [],
  });
  s.objects.set(id, Object.freeze({ ...s.objects.get(id), summoningSickness: false }));
  return s.objects.get(id);
}

function library(s, pid, n) {
  for (let i = 0; i < n; i += 1) addCard(s, `L${pid}${i}`, 'basic-forest', pid, 'library');
}

function pick(s, pid = 'p1', seed = 7) {
  const b = createHeuristicBot({ seed });
  const cmd = b.chooseCommand(playerView(s, pid));
  return { cmd, entry: b.trace().at(-1) };
}

function resolveStack(s, limit = 24) {
  for (let i = 0; i < limit && s.zones.stack.length > 0; i += 1) {
    const v = playerView(s, s.turn.priorityPlayerId);
    const pass = v.legalCommands.find((c) => c.type === 'pass_priority');
    if (!pass) break;
    if (!execute(s, pass).ok) break;
  }
}

test('C53/C-FIX-2: bot atakuje Rampagerem przez mur 0/5 (ewazja mocowa)', () => {
  const s = game('declare_attackers');
  addCard(s, 'r', 'rust-shield-rampager', 'p1', 'battlefield');
  addVanilla(s, 'mur', 'p2', { power: 0, toughness: 5 });
  const view = playerView(s, 'p1');
  assert.equal(view.zones.battlefield.find((o) => o.id === 'r')?.cantBeBlockedByPower, 2,
    'PlayerView niesie próg ewazji (publiczna statyka)');
  const { cmd } = pick(s);
  assert.equal(cmd.type, 'declare_attackers');
  assert.ok((cmd.attackerIds ?? []).includes('r'),
    'Rampager jest nie do zablokowania dla 0/5 — bot atakuje za 3, zamiast trzymać stwora');
});

test('C53/C-FIX-1: remis plain/offspring ma rozróżnialne projekcje', () => {
  const s = game();
  addMana(s, 'p1', 10, { colors: ['W', 'U', 'B', 'R', 'G'] });
  addCard(s, 'r', 'rust-shield-rampager', 'p1');
  const { cmd, entry } = pick(s);
  assert.equal(cmd.type, 'cast_permanent');
  assert.ok(!cmd.offspring, 'remis idzie w rzut naturalny (pierwsza oferta, jak kicker)');
  assert.ok(entry.tie && entry.tie.length === 2, 'remis jest ogłoszony z projekcjami');
  const flags = entry.tie.map((t) => t.proj?.offspring).sort();
  assert.deepEqual(flags, [0, 1], 'projekcje różnią warianty flagą offspring');
});

test('C53/C: Acidic Slime celuje najcenniejszy permanent wroga', () => {
  const s = game();
  addMana(s, 'p1', 8, { colors: ['W', 'U', 'B', 'R', 'G'] });
  addCard(s, 'a', 'acidic-slime', 'p1');
  addObject(s, {
    id: 'eart', instanceId: 'i-eart', cardId: 'test-eart', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', kind: 'artifact', power: 5, toughness: 5, manaCost: 4,
    abilities: [], keywords: [], subtypes: [], types: ['Artifact'], colors: [],
  });
  // Drugi kandydat (ląd wroga): przy JEDNYM celu silnik nie otwiera decyzji
  // (deterministyczny fast-path), więc bot nie miałby czego wybierać.
  addObject(s, {
    id: 'eland', instanceId: 'i-eland', cardId: 'test-eland', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', kind: 'land', power: 0, toughness: 0, manaCost: 0,
    abilities: [], keywords: [], subtypes: [], types: ['Land'], colors: [],
  });
  assert.ok(execute(s, { type: 'cast_permanent', playerId: 'p1', objectId: 'a' }).ok);
  resolveStack(s);
  const { cmd } = pick(s);
  assert.equal(cmd.type, 'resolve_trigger_target');
  assert.equal(cmd.targetId, 'eart', 'bot niszczy artefakt 5/5 wroga (wartość, nie pierwszy z listy)');
});

test('C53/C: Keep Out celuje w największy tapped cel wroga', () => {
  const s = game();
  addMana(s, 'p1', 6, { colors: ['W', 'U', 'B', 'R', 'G'] });
  addCard(s, 'k', 'keep-out', 'p1');
  addVanilla(s, 't4', 'p2', { power: 4, toughness: 4 });
  addVanilla(s, 't1', 'p2', { power: 1, toughness: 1 });
  s.objects.set('t4', Object.freeze({ ...s.objects.get('t4'), tapped: true }));
  s.objects.set('t1', Object.freeze({ ...s.objects.get('t1'), tapped: true }));
  const { cmd } = pick(s);
  assert.equal(cmd.type, 'cast_spell');
  assert.deepEqual(cmd.targets, ['t4'], '4 obrażenia idą w 4/4 (lethal na większym), nie w 1/1');
});

test('C53/C: bot rzuca ciała z ETB (Ghirapur, Inspiring) zamiast passować', () => {
  for (const cardId of ['ghirapur-gearcrafter', 'inspiring-captain']) {
    const s = game();
    addMana(s, 'p1', 8, { colors: ['W', 'U', 'B', 'R', 'G'] });
    addCard(s, 'x', cardId, 'p1');
    const { cmd } = pick(s);
    assert.equal(cmd.type, 'cast_permanent', `${cardId}: uczciwe ciało wygrywa z passem (premii ETB brak, ale rzut jest)`);
  }
});

test('C53/C: Óin lootuje za wolną manę (nie deck-out)', () => {
  const s = game();
  library(s, 'p1', 30);
  library(s, 'p2', 30);
  addMana(s, 'p1', 6, { colors: ['W', 'U', 'B', 'R', 'G'] });
  addCard(s, 'o', 'oin-the-brave', 'p1', 'battlefield');
  addCard(s, 'f1', 'basic-forest', 'p1');
  const b = createHeuristicBot({ seed: 7 });
  const cmd = b.chooseCommand(playerView(s, 'p1'));
  const entry = b.trace().at(-1);
  const loot = entry.options.find((o) => o.cmd.startsWith('activate_ability'));
  assert.ok(loot && loot.score > 0, `loot wyceniony dodatnio (dostał ${loot?.score})`);
  assert.ok(['play_land', 'activate_ability'].includes(cmd.type),
    `bot gra ląd albo lootuje (wybrał ${cmd.type}), nie passuje z maną na stole`);
});
