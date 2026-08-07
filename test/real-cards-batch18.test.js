import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { moveObjectDirectly } from '../src/engine/objects.js';
import { effectiveKeywords, effectivePower, effectiveToughness } from '../src/engine/permanents.js';
import { jumpToStep } from '../src/engine/turn.js';
import { verifyReplay, replayFromState } from '../src/engine/replay.js';
import { graveyardCardTypeCount } from '../src/engine/triggers.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { MANA_COSTS } from '../src/cards/mana-costs-data.js';

/**
 * Batch 18 realnych kart (ADR 0010 §2a), lista właściciela 2026-08-05:
 * - Ainok Artillerist (DTK): 4/1, reach warunkowy licznikiem +1/+1 (static);
 * - Kin-Tree Nurturer (TDM): 2/1 lifelink, ETB endure 1 (licznik ALBO token);
 * - Gorger Wurm (ARB): 5/5 Devour 1 (sekwencyjne poświęcanie innych stworów);
 * - Bone Splinters (ALA): dodatkowy koszt sacrifice + destroy target creature;
 * - Brute Force (MM2): cel +3/+3 do końca tury;
 * - Forever Young (ELD): karty-stwory z grobu na wierzch biblioteki + draw;
 * - Trostani Discordant (CLU): hymn other +1/+1, ETB 2 tokeny Soldier,
 *   end step „each player gains control of all creatures they own" (ownerId);
 * - Fear of Burning Alive (DSK): ETB 4 dmg każdemu przeciwnikowi + delirium
 *   przy niecombatowych obrażeniach w przeciwnika (intervening if);
 * - Jeskai Windscout (KTK): flying + prowess (noncreature spell cast);
 * - Hobble (PLS): aura — gospodarz nie atakuje, nie blokuje gdy czarny; ETB draw.
 *
 * Dane Oracle: docs/cards/scryfall-*.json (2026-08-05); artId/plan:
 * tools/collection-art-ids.csv.
 */

const REGISTRY = createCardRegistry();

function game() {
  return createGameState({ seed: 2026, players: [{ id: 'p1' }, { id: 'p2' }] });
}

/** T1 (stos permanentów): rozstrzyga stos pełnymi rundami passów (LIFO). */
function resolveStack(state) {
  // T6: rozstrzyga stos pełnymi rundami passów (czary + triggery, LIFO).
  // Przy pustym stosie nic nie robi; zatrzymuje się na decyzji blokującej.
  const all = [];
  if (state.zones.stack.length === 0) return all;
  const blockedByDecision = (r) => !r.ok && /(_unresolved|not_your_decision)$/.test(r.events[0]?.reason ?? '');
  let guard = 0;
  while (state.zones.stack.length > 0 && guard < 12) {
    let passesDone = state.turn.passes;
    while (passesDone < state.players.length) {
      const holder = state.turn.priorityPlayerId;
      const r1 = execute(state, { type: 'pass_priority', playerId: holder });
      if (blockedByDecision(r1)) return all;
      assert.ok(r1.ok, r1.events[0]?.reason);
      all.push(...r1.events);
      if (state.turn.passes === 0) break; // pełna runda zakończona
      passesDone = state.turn.passes;
    }
    guard += 1;
  }
  return all;
}



function mainPhase(state, playerId = 'p1') {
  state.turn.phase = 'precombat_main';
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  state.turn.step = 'precombat_main';
  state.turn.stepIndex = 3;
  state.turn.passes = 0;
  return state;
}

function addRealCard(state, id, cardId, controllerId, zone, opts = {}) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, spell: data.spell, abilities: data.abilities ?? [],
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [], types: def.types ?? [],
    colors: data.colors ?? [],
    aura: def.aura ?? null, devour: def.devour ?? null, endure: def.endure ?? null,
    ownerId: opts.ownerId ?? null,
  });
  if (opts.tapped || opts.summoningSickness) {
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), tapped: !!opts.tapped, summoningSickness: !!opts.summoningSickness }));
  }
  return state.objects.get(id);
}

function addSimpleCreature(state, id, controllerId, { power = 1, toughness = 1, keywords = [], subtypes = [], colors = [], summoningSickness = false } = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'highland-game', controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost: 1,
    abilities: [], keywords, subtypes, types: ['Creature'], colors,
  });
  if (summoningSickness) state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: true }));
  return state.objects.get(id);
}

function passBoth(state, first) {
  // T6: rozstrzyga stos pełnymi rundami passów (czary + triggery, LIFO).
  // Szanuje już naliczone passy (passes) — pełna runda kończy się, gdy
  // licznik wróci do 0 (rozstrzygnięcie stosu albo przejście kroku).
  // Zwraca ostatni wynik rundy (kompatybilność z testami clash).
  const blockedByDecision = (r) => !r.ok && /(_unresolved|not_your_decision)$/.test(r.events[0]?.reason ?? '');
  let last = null;
  let guard = 0;
  for (;;) {
    let passesDone = state.turn.passes;
    while (passesDone < state.players.length) {
      const holder = state.turn.priorityPlayerId;
      const r1 = execute(state, { type: 'pass_priority', playerId: holder });
      if (blockedByDecision(r1)) return last;
      assert.ok(r1.ok, r1.events[0]?.reason);
      last = r1;
      if (state.turn.passes === 0) break; // pełna runda zakończona
      passesDone = state.turn.passes;
    }
    guard += 1;
    if (state.zones.stack.length === 0 || guard > 12) break;
  }
  return last;
}



function findId(state, cardId, zone = 'battlefield') {
  for (const [id, obj] of state.objects) {
    if (obj.cardId === cardId && obj.zone === zone) return id;
  }
  return null;
}

function countByCardId(state, cardId, zone = 'battlefield') {
  let n = 0;
  for (const obj of state.objects.values()) if (obj.cardId === cardId && obj.zone === zone) n += 1;
  return n;
}

function handSize(state, playerId) {
  return state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === playerId).length;
}

function hasCommand(view, type, predicate = () => true) {
  return view.legalCommands.some((cmd) => cmd.type === type && predicate(cmd));
}

function libraryOf(state, playerId) {
  return state.zones.library.filter((id) => state.objects.get(id)?.controllerId === playerId);
}

// =============================================================================
// Dane rejestru / sanity — zgodność definicji z danymi Scryfall i kolekcją
// =============================================================================

const BATCH18 = [
  { id: 'ainok-artillerist', name: 'Ainok Artillerist', set: 'DTK', cost: '{2}{G}', manaCost: 3, power: 4, toughness: 1, artId: 321, plan: 'Tarkir' },
  { id: 'kin-tree-nurturer', name: 'Kin-Tree Nurturer', set: 'TDM', cost: '{2}{B}', manaCost: 3, power: 2, toughness: 1, artId: 502, plan: 'Tarkir' },
  { id: 'gorger-wurm', name: 'Gorger Wurm', set: 'ARB', cost: '{3}{R}{G}', manaCost: 5, power: 5, toughness: 5, artId: 342, plan: 'Alara' },
  { id: 'bone-splinters', name: 'Bone Splinters', set: 'ALA', cost: '{B}', manaCost: 1, artId: 136, plan: 'Alara' },
  { id: 'brute-force', name: 'Brute Force', set: 'MM2', cost: '{R}', manaCost: 1, artId: 39, plan: 'Warhammer Fantasy' },
  { id: 'forever-young', name: 'Forever Young', set: 'ELD', cost: '{1}{B}', manaCost: 2, artId: 293, plan: 'Eldraine' },
  { id: 'trostani-discordant', name: 'Trostani Discordant', set: 'CLU', cost: '{3}{G}{W}', manaCost: 5, power: 1, toughness: 4, artId: 331, plan: 'Ravnica' },
  { id: 'fear-of-burning-alive', name: 'Fear of Burning Alive', set: 'DSK', cost: '{4}{R}{R}', manaCost: 6, power: 4, toughness: 4, artId: 419, plan: 'Duskmourn' },
  { id: 'jeskai-windscout', name: 'Jeskai Windscout', set: 'KTK', cost: '{2}{U}', manaCost: 3, power: 2, toughness: 1, artId: 477, plan: 'Tarkir' },
  { id: 'hobble', name: 'Hobble', set: 'PLS', cost: '{2}{W}', manaCost: 3, artId: 522, plan: 'Warhammer Fantasy' },
];

test('Batch 18: 10 kart w registry ze statusem supported i danymi Scryfall/kolekcji', () => {
  const oracleBySlug = {};
  for (const entry of BATCH18) {
    const raw = JSON.parse(fs.readFileSync(new URL(`../docs/cards/scryfall-${entry.id}.json`, import.meta.url), 'utf8'));
    const cards = Array.isArray(raw) ? raw : [raw];
    oracleBySlug[entry.id] = cards.find((c) => c.name === entry.name);
  }
  for (const entry of BATCH18) {
    const card = REGISTRY.get(entry.id);
    assert.ok(card, `${entry.id} powinien być w registry`);
    assert.equal(card.name, entry.name);
    assert.equal(card.set, entry.set);
    assert.equal(card.manaCost, entry.manaCost);
    assert.equal(card.artId, entry.artId);
    assert.equal(card.plan, entry.plan);
    assert.equal(card.support?.status, 'supported', `${entry.id}: status supported`);
    if (entry.power != null) assert.equal(card.power, entry.power);
    if (entry.toughness != null) assert.equal(card.toughness, entry.toughness);
    const oracle = oracleBySlug[entry.id];
    assert.ok(oracle, `brak danych Scryfall dla ${entry.id}`);
    assert.equal(card.oracleText, oracle.oracle_text, `${entry.id}: oracleText = wydruk Oracle`);
    assert.equal(card.imageUri, oracle.image_uris.large, `${entry.id}: imageUri = obraz Scryfall`);
    assert.equal(MANA_COSTS[entry.id], entry.cost, `${entry.id}: wpis kolorowego kosztu many`);
  }
});

// =============================================================================
// Ainok Artillerist — reach warunkowy licznikiem +1/+1 (static hasCounter)
// =============================================================================

test('Ainok Artillerist: materializacja — 4/1 Dog Archer ze zdolnością statyczną hasCounter', () => {
  const data = gameObjectDataOf(REGISTRY.get('ainok-artillerist'));
  assert.equal(data.kind, 'creature');
  assert.equal(data.power, 4);
  assert.equal(data.toughness, 1);
  assert.equal(data.manaCost, 3);
  const statics = (data.abilities ?? []).filter((a) => a.type === 'static');
  assert.equal(statics.length, 1);
  assert.deepEqual(statics[0].condition, { hasCounter: '+1/+1' });
  assert.deepEqual(statics[0].keywords, ['reach']);
});

test('Ainok Artillerist: reach tylko z licznikiem +1/+1 — znika po jego zdjęciu', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'ainok', 'ainok-artillerist', 'p1', 'battlefield');
  assert.ok(!effectiveKeywords(state.objects.get('ainok'), state).includes('reach'), 'bez licznika brak reach');
  state.objects.set('ainok', Object.freeze({ ...state.objects.get('ainok'), counters: { '+1/+1': 1 } }));
  assert.ok(effectiveKeywords(state.objects.get('ainok'), state).includes('reach'), 'z licznikiem jest reach');
  state.objects.set('ainok', Object.freeze({ ...state.objects.get('ainok'), counters: {} }));
  assert.ok(!effectiveKeywords(state.objects.get('ainok'), state).includes('reach'), 'po zdjęciu licznika reach znika');
});

test('Ainok Artillerist: reach z licznika pozwala blokować latającego (i tylko wtedy)', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'ainok', 'ainok-artillerist', 'p2', 'battlefield');
  addSimpleCreature(state, 'flyer', 'p1', { keywords: ['flying'] });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['flyer'] }).ok);
  const illegalBlock = execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { flyer: ['ainok'] } });
  assert.equal(illegalBlock.ok, false, 'bez licznika nie wolno blokować latającego');
  state.objects.set('ainok', Object.freeze({ ...state.objects.get('ainok'), counters: { '+1/+1': 1 } }));
  const legalBlock = execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { flyer: ['ainok'] } });
  assert.ok(legalBlock.ok, 'z licznikiem +1/+1 reach pozwala blokować latającego');
});

// =============================================================================
// Kin-Tree Nurturer — endure 1: licznik +1/+1 ALBO token Spirit 1/1
// =============================================================================

test('Kin-Tree Nurturer: materializacja — 2/1 lifelink Human Druid z endure 1', () => {
  const data = gameObjectDataOf(REGISTRY.get('kin-tree-nurturer'));
  assert.equal(data.kind, 'creature');
  assert.equal(data.power, 2);
  assert.equal(data.toughness, 1);
  assert.equal(data.endure, 1);
  assert.ok((REGISTRY.get('kin-tree-nurturer').keywords ?? []).includes('lifelink'));
});

function nurturerEnters(state) {
  mainPhase(state, 'p1');
  addRealCard(state, 'nurturer-card', 'kin-tree-nurturer', 'p1', 'hand');
  addMana(state, 'p1', 3);
  const cast = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'nurturer-card' });
  resolveStack(state);

  assert.ok(cast.ok);
  assert.equal(state.pendingEndures.length, 1, 'wejście kolejkuje decyzję endure');
  return state.pendingEndures[0];
}

test('Kin-Tree Nurturer: ETB kolejkuje decyzję endure i blokuje grę', () => {
  const state = game();
  const pending = nurturerEnters(state);
  assert.equal(pending.playerId, 'p1');
  assert.equal(pending.counters, 1);
  const pass = execute(state, { type: 'pass_priority', playerId: 'p1' });
  assert.equal(pass.ok, false);
  assert.equal(pass.events[0].reason, 'endure_unresolved');
  const view = playerView(state, 'p1');
  assert.ok(hasCommand(view, 'resolve_endure_choice', (c) => c.mode === 'counters'));
  assert.ok(hasCommand(view, 'resolve_endure_choice', (c) => c.mode === 'token'));
  assert.ok(!hasCommand(view, 'pass_priority'), 'pass niedostępny do czasu decyzji');
});

test('Kin-Tree Nurturer: wybór licznika — źródło rośnie do 3/2, bez tokena', () => {
  const state = game();
  nurturerEnters(state);
  const resolved = execute(state, { type: 'resolve_endure_choice', playerId: 'p1', mode: 'counters' });
  assert.ok(resolved.ok);
  const src = state.objects.get(findId(state, 'kin-tree-nurturer'));
  assert.equal(src.counters['+1/+1'], 1);
  assert.equal(effectivePower(src, state), 3);
  assert.equal(effectiveToughness(src, state), 2);
  assert.equal(countByCardId(state, 'token_spirit'), 0, 'bez tokena przy wyborze licznika');
  assert.equal(state.pendingEndures.length, 0);
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok, 'gra toczy się dalej');
});

test('Kin-Tree Nurturer: wybór tokena — Spirit 1/1 biały na bitwisku, źródło bez zmian', () => {
  const state = game();
  nurturerEnters(state);
  const resolved = execute(state, { type: 'resolve_endure_choice', playerId: 'p1', mode: 'token' });
  assert.ok(resolved.ok);
  assert.equal(countByCardId(state, 'token_spirit'), 1);
  const spirit = [...state.objects.values()].find((o) => o.cardId === 'token_spirit' && o.zone === 'battlefield');
  assert.equal(spirit.power, 1);
  assert.equal(spirit.toughness, 1);
  assert.deepEqual(spirit.colors, ['W']);
  assert.ok(spirit.subtypes.includes('Spirit'));
  assert.equal(spirit.controllerId, 'p1');
  const src = state.objects.get(findId(state, 'kin-tree-nurturer'));
  assert.equal(src.counters['+1/+1'] ?? 0, 0, 'źródło bez licznika przy wyborze tokena');
});

test('Kin-Tree Nurturer: cudza decyzja i zły tryb odrzucane', () => {
  const state = game();
  nurturerEnters(state);
  const wrongPlayer = execute(state, { type: 'resolve_endure_choice', playerId: 'p2', mode: 'token' });
  assert.equal(wrongPlayer.ok, false);
  assert.equal(wrongPlayer.events[0].reason, 'endure_not_your_decision');
  const wrongMode = execute(state, { type: 'resolve_endure_choice', playerId: 'p1', mode: 'bounce' });
  assert.equal(wrongMode.ok, false);
  assert.equal(wrongMode.events[0].reason, 'illegal_endure_choice');
});

test('Kin-Tree Nurturer: źródło poza bitwiskiem — licznik nielegalny, token legalny', () => {
  const state = game();
  const pending = nurturerEnters(state);
  // Symulacja usunięcia źródła (trigger w międzyczasie) — niskopoziomowy ruch.
  moveObjectDirectly(state, pending.sourceId, 'graveyard', 'grave-99');
  const counters = execute(state, { type: 'resolve_endure_choice', playerId: 'p1', mode: 'counters' });
  assert.equal(counters.ok, false);
  assert.equal(counters.events[0].reason, 'illegal_endure_choice');
  const view = playerView(state, 'p1');
  assert.ok(!hasCommand(view, 'resolve_endure_choice', (c) => c.mode === 'counters'), 'widok nie oferuje licznika bez źródła');
  assert.ok(hasCommand(view, 'resolve_endure_choice', (c) => c.mode === 'token'));
  assert.ok(execute(state, { type: 'resolve_endure_choice', playerId: 'p1', mode: 'token' }).ok);
  assert.equal(countByCardId(state, 'token_spirit'), 1);
});

// =============================================================================
// Gorger Wurm — Devour 1: sekwencyjne poświęcanie innych własnych stworów
// =============================================================================

test('Gorger Wurm: materializacja — 5/5 Wurm z deskryptorem devour { counters: 1 }', () => {
  const data = gameObjectDataOf(REGISTRY.get('gorger-wurm'));
  assert.equal(data.kind, 'creature');
  assert.equal(data.power, 5);
  assert.equal(data.toughness, 5);
  assert.deepEqual(data.devour, { counters: 1 });
});

function wurmEnters(state, others = 2) {
  mainPhase(state, 'p1');
  addRealCard(state, 'wurm-card', 'gorger-wurm', 'p1', 'hand');
  addMana(state, 'p1', 5);
  for (let i = 0; i < others; i += 1) addSimpleCreature(state, `sac-${i}`, 'p1', { power: 1 + i, toughness: 2 });
  const cast = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'wurm-card' });
  resolveStack(state);

  assert.ok(cast.ok);
  return state.objects.get(findId(state, 'gorger-wurm'));
}

test('Gorger Wurm: bez innych stworów decyzja devour nie jest kolejkowana', () => {
  const state = game();
  wurmEnters(state, 0);
  assert.equal(state.pendingDevours.length, 0, 'brak kandydatów = brak decyzji');
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok, 'gra toczy się normalnie');
  assert.equal(effectivePower(state.objects.get(findId(state, 'gorger-wurm')), state), 5);
});

test('Gorger Wurm: wejście z kandydatami kolejkuje decyzję i blokuje grę', () => {
  const state = game();
  wurmEnters(state, 2);
  assert.equal(state.pendingDevours.length, 1);
  assert.equal(state.pendingDevours[0].counters, 1);
  const pass = execute(state, { type: 'pass_priority', playerId: 'p1' });
  assert.equal(pass.ok, false);
  assert.equal(pass.events[0].reason, 'devour_unresolved');
  const view = playerView(state, 'p1');
  assert.ok(hasCommand(view, 'resolve_devour_choice', (c) => c.targetId === 'sac-0'));
  assert.ok(hasCommand(view, 'resolve_devour_choice', (c) => c.targetId === 'sac-1'));
  assert.ok(hasCommand(view, 'resolve_devour_choice', (c) => c.done === true), 'zawsze można zakończyć (you may) — 0 poświęceń też legalne');
});

test('Gorger Wurm: sekwencja poświęceń kładzie liczniki na źródle; done kończy', () => {
  const state = game();
  wurmEnters(state, 2);
  const wurmId = findId(state, 'gorger-wurm');
  const first = execute(state, { type: 'resolve_devour_choice', playerId: 'p1', targetId: 'sac-0' });
  assert.ok(first.ok);
  assert.equal(state.objects.get('sac-0'), undefined, 'poświęcony obiekt znika ze starym id');
  assert.ok(first.events.some((e) => e.type === 'permanent_sacrificed' && e.devour === true));
  const wurm = state.objects.get(wurmId);
  assert.equal(wurm.counters['+1/+1'], 1);
  assert.equal(effectivePower(wurm, state), 6);
  assert.equal(effectiveToughness(wurm, state), 6);
  assert.equal(state.pendingDevours.length, 1, 'decyzja zostaje otwarta (można poświęcać dalej)');
  const second = execute(state, { type: 'resolve_devour_choice', playerId: 'p1', targetId: 'sac-1' });
  assert.ok(second.ok);
  assert.equal(state.objects.get(wurmId).counters['+1/+1'], 2);
  assert.equal(effectivePower(state.objects.get(wurmId), state), 7);
  // Poświęcenie ostatniego kandydata zamyka decyzję automatycznie.
  assert.equal(state.pendingDevours.length, 0, 'decyzja zamknęła się sama po poświęceniu wszystkich kandydatów');
  assert.ok(second.events.some((e) => e.type === 'devour_choice_resolved' && e.done === true && e.autoClosed === true));
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok, 'gra toczy się dalej');
});

test('Gorger Wurm: done od razu = 0 poświęceń i czysty 5/5', () => {
  const state = game();
  wurmEnters(state, 1);
  assert.ok(execute(state, { type: 'resolve_devour_choice', playerId: 'p1', done: true }).ok);
  const wurm = state.objects.get(findId(state, 'gorger-wurm'));
  assert.equal(wurm.counters['+1/+1'] ?? 0, 0);
  assert.equal(effectivePower(wurm, state), 5);
  assert.equal(effectiveToughness(wurm, state), 5);
});

test('Gorger Wurm: nie wolno poświęcić samego źródła ani cudzego stwora; cudza decyzja odrzucona', () => {
  const state = game();
  wurmEnters(state, 1);
  addSimpleCreature(state, 'enemy', 'p2');
  const wurmId = findId(state, 'gorger-wurm');
  const selfSac = execute(state, { type: 'resolve_devour_choice', playerId: 'p1', targetId: wurmId });
  assert.equal(selfSac.ok, false);
  assert.equal(selfSac.events[0].reason, 'illegal_devour_target', 'źródło nie jest kandydatem devour');
  const enemySac = execute(state, { type: 'resolve_devour_choice', playerId: 'p1', targetId: 'enemy' });
  assert.equal(enemySac.ok, false);
  assert.equal(enemySac.events[0].reason, 'illegal_devour_target', 'cudzy stwór nie jest kandydatem');
  const wrongPlayer = execute(state, { type: 'resolve_devour_choice', playerId: 'p2', targetId: 'sac-0' });
  assert.equal(wrongPlayer.ok, false);
  assert.equal(wrongPlayer.events[0].reason, 'devour_not_your_decision');
});

test('Gorger Wurm: scry + devour w jednym stanie — oferty sekwencyjne (regresja scry_unresolved)', () => {
  const state = game();
  wurmEnters(state, 2);
  // Symulacja zakolejkowanego scry z tej samej komendy (np. trigger ETB innego
  // permanentu): dwie decyzje koegzystują, a execute() zamyka NAJPIERW scry.
  addRealCard(state, 'lib-a', 'shatter', 'p1', 'library');
  addRealCard(state, 'lib-b', 'highland-game', 'p1', 'library');
  state.pendingScry = { playerId: 'p1', objectIds: ['lib-a', 'lib-b'], restorePriorityTo: 'p1' };
  const viewBlocked = playerView(state, 'p1');
  assert.ok(hasCommand(viewBlocked, 'resolve_scry'), 'scry oferowane jako pierwsze');
  assert.equal(viewBlocked.legalCommands.some((c) => c.type === 'resolve_devour_choice'), false,
    'devour nie może być oferowany przy otwartym scry (regresja crasha benchmarku B0)');
  assert.equal(viewBlocked.legalCommands.some((c) => c.type === 'pass_priority'), false);
  const premature = execute(state, { type: 'resolve_devour_choice', playerId: 'p1', done: true });
  assert.equal(premature.ok, false);
  assert.equal(premature.events[0].reason, 'scry_unresolved', 'kontroler wybierający devour przed scry jest odrzucany');
  assert.ok(execute(state, { type: 'resolve_scry', playerId: 'p1', bottomIds: ['lib-b'] }).ok);
  const viewAfter = playerView(state, 'p1');
  assert.ok(hasCommand(viewAfter, 'resolve_devour_choice', (c) => c.targetId === 'sac-0'),
    'po zamknięciu scry widok oferuje decyzję devour');
  assert.ok(execute(state, { type: 'resolve_devour_choice', playerId: 'p1', done: true }).ok);
});

// =============================================================================
// Bone Splinters — dodatkowy koszt sacrifice + destroy target creature
// =============================================================================

test('Bone Splinters: materializacja — sorcery z additionalCost i destroy', () => {
  const data = gameObjectDataOf(REGISTRY.get('bone-splinters'));
  assert.equal(data.kind, 'spell');
  assert.equal(data.spell.timing, 'sorcery');
  assert.deepEqual(data.spell.targets, [{ type: 'creature' }]);
  assert.deepEqual(data.spell.additionalCost, { sacrificeCreature: true });
  assert.deepEqual(data.spell.effects, [{ type: 'destroy_permanent' }]);
});

test('Bone Splinters: rzut z poświęceniem niszczy docelowego stwora', () => {
  const state = game();
  mainPhase(state, 'p1');
  addRealCard(state, 'splinters-card', 'bone-splinters', 'p1', 'hand');
  addMana(state, 'p1', 1);
  addSimpleCreature(state, 'fodder', 'p1');
  addSimpleCreature(state, 'enemy', 'p2', { power: 3, toughness: 3 });
  const cast = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'splinters-card', targets: ['enemy'], sacrificeTargetId: 'fodder' });
  assert.ok(cast.ok);
  assert.ok(state.events.some((e) => e.type === 'permanent_sacrificed' && e.fromId === 'fodder'), 'dodatkowy koszt poświęca wybranego stwora');
  passBoth(state);
  // Zniszczony obiekt trafia do grobu pod nowym id (CR 400.7) — szukamy go
  // po statystykach (3/3 = cel; poświęcony fodder to 1/1).
  const corpse = [...state.objects.values()].find((o) => o.zone === 'graveyard' && o.power === 3 && o.toughness === 3);
  assert.ok(corpse, 'docelowy stwór zniszczony (w grobie)');
  assert.equal(corpse.controllerId, 'p2');
});

test('Bone Splinters: bez własnego stwora czar nie jest dostępny', () => {
  const state = game();
  mainPhase(state, 'p1');
  addRealCard(state, 'splinters-card', 'bone-splinters', 'p1', 'hand');
  addMana(state, 'p1', 1);
  addSimpleCreature(state, 'enemy', 'p2', { power: 3, toughness: 3 });
  const view = playerView(state, 'p1');
  assert.ok(!hasCommand(view, 'cast_spell', (c) => c.objectId === 'splinters-card'), 'bez stwora do poświęcenia oferta cast nie występuje');
  const cast = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'splinters-card', targets: ['enemy'] });
  assert.equal(cast.ok, false);
});

// =============================================================================
// Brute Force — cel +3/+3 do końca tury
// =============================================================================

test('Brute Force: materializacja — instant pump +3/+3', () => {
  const data = gameObjectDataOf(REGISTRY.get('brute-force'));
  assert.equal(data.kind, 'spell');
  assert.equal(data.spell.timing, 'instant');
  assert.deepEqual(data.spell.targets, [{ type: 'creature' }]);
  assert.deepEqual(data.spell.effects, [{ type: 'pump', power: 3, toughness: 3 }]);
});

test('Brute Force: rozstrzygnięcie daje +3/+3 do końca tury (znika w cleanup)', () => {
  const state = game();
  mainPhase(state, 'p1');
  addRealCard(state, 'bf-card', 'brute-force', 'p1', 'hand');
  addMana(state, 'p1', 1);
  addSimpleCreature(state, 'host', 'p1', { power: 2, toughness: 2 });
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'bf-card', targets: ['host'] }).ok);
  passBoth(state);
  const host = state.objects.get('host');
  assert.equal(effectivePower(host, state), 5);
  assert.equal(effectiveToughness(host, state), 5);
  state.turn = jumpToStep(state.turn, 'end_of_combat', 'p1');
  passBoth(state);
  passBoth(state);
  passBoth(state); // end step → cleanup
  const after = state.objects.get('host');
  assert.equal(effectivePower(after, state), 2, 'pump wygasa w cleanup');
  assert.equal(effectiveToughness(after, state), 2);
});

test('Brute Force: własny stwór przeciwnika też jest legalnym celem', () => {
  const state = game();
  mainPhase(state, 'p1');
  addRealCard(state, 'bf-card', 'brute-force', 'p1', 'hand');
  addMana(state, 'p1', 1);
  addSimpleCreature(state, 'enemy', 'p2', { power: 1, toughness: 1 });
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'bf-card', targets: ['enemy'] }).ok);
});

// =============================================================================
// Forever Young — karty-stwory z grobu na wierzch, potem draw
// =============================================================================

test('Forever Young: materializacja — sorcery z efektami top-choice + draw', () => {
  const data = gameObjectDataOf(REGISTRY.get('forever-young'));
  assert.equal(data.kind, 'spell');
  assert.equal(data.spell.timing, 'sorcery');
  assert.deepEqual(data.spell.targets, []);
  assert.equal(data.spell.effects[0].type, 'graveyard_creatures_to_library_top_choice');
  assert.deepEqual(data.spell.effects[1], { type: 'draw_cards', amount: 1 });
});

function youngResolves(state, graveyardCards = ['ainok-artillerist', 'kin-tree-nurturer']) {
  mainPhase(state, 'p1');
  addRealCard(state, 'fy-card', 'forever-young', 'p1', 'hand');
  addMana(state, 'p1', 2);
  // Uwaga na id: silnik nadaje ruchom do grobu id `grave-${sequence}` —
  // identyfikatory testowych kart nie mogą z nimi kolidować.
  graveyardCards.forEach((cardId, i) => addRealCard(state, `fymine-${i}`, cardId, 'p1', 'graveyard'));
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'fy-card' }).ok);
  passBoth(state); // rozstrzygnięcie — decyzja kolejkuje się w trakcie
  return state;
}

test('Forever Young: rozstrzygnięcie kolejkuje sekwencyjną decyzję i wstrzymuje czar', () => {
  const state = youngResolves(game());
  assert.ok(state.pendingGraveyardToTop, 'decyzja pendingGraveyardToTop');
  assert.ok(state.pendingSpell, 'czar wciąż na stosie (Draw a card. czeka)');
  assert.equal(state.pendingGraveyardToTop.playerId, 'p1');
  const pass = execute(state, { type: 'pass_priority', playerId: 'p1' });
  assert.equal(pass.ok, false);
  const view = playerView(state, 'p1');
  assert.ok(hasCommand(view, 'resolve_graveyard_top_choice', (c) => c.targetId === 'fymine-0'));
  assert.ok(hasCommand(view, 'resolve_graveyard_top_choice', (c) => c.targetId === 'fymine-1'));
  assert.ok(hasCommand(view, 'resolve_graveyard_top_choice', (c) => c.done === true));
});

test('Forever Young: wybrane karty lądują na wierzchu (ostatnia najwyżej), done dokańcza draw', () => {
  const state = youngResolves(game());
  const handBefore = handSize(state, 'p1');
  assert.ok(execute(state, { type: 'resolve_graveyard_top_choice', playerId: 'p1', targetId: 'fymine-0' }).ok);
  assert.ok(state.pendingGraveyardToTop, 'decyzja zostaje otwarta po pierwszym wyborze');
  assert.ok(execute(state, { type: 'resolve_graveyard_top_choice', playerId: 'p1', targetId: 'fymine-1' }).ok);
  const lib = libraryOf(state, 'p1');
  assert.equal(state.objects.get(lib[0]).cardId, 'kin-tree-nurturer', 'ostatni wybór na samym wierzchu');
  assert.equal(state.objects.get(lib[1]).cardId, 'ainok-artillerist', 'pierwszy wybór tuż pod spodem');
  const done = execute(state, { type: 'resolve_graveyard_top_choice', playerId: 'p1', done: true });
  assert.ok(done.ok);
  assert.equal(state.pendingGraveyardToTop, null);
  assert.equal(state.pendingSpell, null, 'czar opuścił stos');
  assert.ok(done.events.some((e) => e.type === 'spell_resolved' && e.cardId === 'forever-young'));
  assert.equal(handSize(state, 'p1'), handBefore + 1, 'Draw a card. rozstrzyga się po decyzji');
  // Dobrana karta to wierzch biblioteki — dokładnie ostatnio wybrana karta z grobu.
  const hand = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p1');
  assert.equal(state.objects.get(hand[hand.length - 1]).cardId, 'kin-tree-nurturer', 'dobrano wierzch = ostatni wybór');
});

test('Forever Young: pusty wybór (done od razu) — tylko draw; bez stworów w grobie wcale bez decyzji', () => {
  const state = youngResolves(game());
  assert.ok(execute(state, { type: 'resolve_graveyard_top_choice', playerId: 'p1', done: true }).ok);
  assert.equal(state.pendingGraveyardToTop, null);
  const lib = libraryOf(state, 'p1');
  const instantIds = lib.map((id) => state.objects.get(id).cardId);
  assert.ok(!instantIds.includes('ainok-artillerist') && !instantIds.includes('kin-tree-nurturer'), 'zero przeniesionych kart');

  const empty = game();
  mainPhase(empty, 'p1');
  addRealCard(empty, 'fy-card', 'forever-young', 'p1', 'hand');
  addMana(empty, 'p1', 2);
  addRealCard(empty, 'grave-instant', 'shatter', 'p1', 'graveyard');
  addRealCard(empty, 'lib-draw', 'highland-game', 'p1', 'library');
  assert.ok(execute(empty, { type: 'cast_spell', playerId: 'p1', objectId: 'fy-card' }).ok);
  const handBefore = handSize(empty, 'p1');
  passBoth(empty);
  assert.equal(empty.pendingGraveyardToTop, null, 'bez kart-stworów w grobie decyzji nie ma');
  assert.equal(empty.pendingSpell, null);
  assert.equal(handSize(empty, 'p1'), handBefore + 1, 'Draw a card. rozstrzyga się normalnie');
});

test('Forever Young: nielegalne wybory odrzucane (karta nie-stwór, cudzy grób, cudza decyzja)', () => {
  const state = youngResolves(game());
  addRealCard(state, 'grave-instant', 'shatter', 'p1', 'graveyard');
  addRealCard(state, 'grave-enemy-creature', 'gorger-wurm', 'p2', 'graveyard');
  const nonCreature = execute(state, { type: 'resolve_graveyard_top_choice', playerId: 'p1', targetId: 'grave-instant' });
  assert.equal(nonCreature.ok, false);
  assert.equal(nonCreature.events[0].reason, 'illegal_graveyard_top_target', 'tylko karty-stwory');
  const foreign = execute(state, { type: 'resolve_graveyard_top_choice', playerId: 'p1', targetId: 'grave-enemy-creature' });
  assert.equal(foreign.ok, false);
  assert.equal(foreign.events[0].reason, 'illegal_graveyard_top_target', 'tylko własny grób');
  const wrongPlayer = execute(state, { type: 'resolve_graveyard_top_choice', playerId: 'p2', targetId: 'grave-0' });
  assert.equal(wrongPlayer.ok, false);
  assert.equal(wrongPlayer.events[0].reason, 'graveyard_top_not_your_decision');
});

// =============================================================================
// Trostani Discordant — hymn, tokeny, zwrot kontroli w end step
// =============================================================================

test('Trostani Discordant: materializacja — legendary 1/4 Dryad G/W ze scope anthem', () => {
  const data = gameObjectDataOf(REGISTRY.get('trostani-discordant'));
  assert.equal(data.kind, 'creature');
  assert.deepEqual(REGISTRY.get('trostani-discordant').types, ['Legendary', 'Creature']);
  const anthem = (data.abilities ?? []).find((a) => a.type === 'static' && a.scope);
  assert.deepEqual(anthem.scope, { affects: 'other_creatures_you_control' });
  assert.deepEqual(anthem.pump, { power: 1, toughness: 1 });
});

test('Trostani Discordant: hymn buffuje INNE własne stwory, nie samą Trostani', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'trostani', 'trostani-discordant', 'p1', 'battlefield');
  addSimpleCreature(state, 'buddy', 'p1', { power: 2, toughness: 2 });
  addSimpleCreature(state, 'opponent-creature', 'p2', { power: 2, toughness: 2 });
  const trostani = state.objects.get('trostani');
  assert.equal(effectivePower(trostani, state), 1, 'sama Trostani bez buffu (other)');
  assert.equal(effectiveToughness(trostani, state), 4);
  const buddy = state.objects.get('buddy');
  assert.equal(effectivePower(buddy, state), 3);
  assert.equal(effectiveToughness(buddy, state), 3);
  const foe = state.objects.get('opponent-creature');
  assert.equal(effectivePower(foe, state), 2, 'hymn nie obejmuje stworów przeciwnika');
  // Usunięcie źródła hymnu znosi buff natychmiast (liczenie przy odczycie).
  moveObjectDirectly(state, 'trostani', 'graveyard', 'grave-trostani');
  assert.equal(effectivePower(state.objects.get('buddy'), state), 2);
});

test('Trostani Discordant: ETB tworzy dwa tokeny Soldier 1/1 z lifelink (2/2 z hymnu)', () => {
  const state = game();
  mainPhase(state, 'p1');
  addRealCard(state, 'trostani-card', 'trostani-discordant', 'p1', 'hand');
  addMana(state, 'p1', 5);
  const rCast1 = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'trostani-card' });
  assert.ok(rCast1.ok);
  resolveStack(state);
  assert.equal(countByCardId(state, 'token_soldier_lifelink'), 2, 'dwa tokeny Soldier');
  const soldiers = [...state.objects.values()].filter((o) => o.cardId === 'token_soldier_lifelink' && o.zone === 'battlefield');
  for (const soldier of soldiers) {
    assert.deepEqual(soldier.keywords, ['lifelink']);
    assert.equal(soldier.controllerId, 'p1');
    assert.equal(effectivePower(soldier, state), 2, 'hymn obejmuje tokeny (inne stwory)');
    assert.equal(effectiveToughness(soldier, state), 2);
  }
});

test('Trostani Discordant: end step zwraca stwory właścicielom (ownerId), z chorobą atakową', () => {
  const state = game();
  mainPhase(state, 'p2');
  // Trostani kontrolowana przez p2 (trigger „your end step" odpala u kontrolera).
  addRealCard(state, 'trostani', 'trostani-discordant', 'p2', 'battlefield');
  // Stwór WŁASNOŚCI p1 pozornie pod kontrolą p2 (kradzież/reanimacja).
  addRealCard(state, 'stolen', 'ainok-artillerist', 'p2', 'battlefield', { ownerId: 'p1' });
  // Stwór p2 — zostaje u p2.
  addRealCard(state, 'own', 'jeskai-windscout', 'p2', 'battlefield', { ownerId: 'p2' });
  state.objects.set('stolen', Object.freeze({ ...state.objects.get('stolen'), summoningSickness: false }));
  state.turn = jumpToStep(state.turn, 'end_of_combat', 'p2');
  passBoth(state); // end_of_combat → postcombat main
  passBoth(state); // postcombat main → end step (trigger)
  assert.equal(state.objects.get('stolen').controllerId, 'p1', 'kradziony wraca do właściciela');
  assert.equal(state.objects.get('stolen').summoningSickness, true, 'po zmianie kontroli choroba atakowa (CR 302.6)');
  assert.equal(state.objects.get('own').controllerId, 'p2', 'własny zostaje');
  assert.equal(state.objects.get('own').summoningSickness, false, 'bez zmiany kontroli bez choroby');
  assert.ok(state.events.some((e) => e.type === 'control_changed' && e.toOwner === true && e.objectId === 'stolen'));
});

// =============================================================================
// Fear of Burning Alive — ETB 4 dmg + delirium (intervening if, wybór celu)
// =============================================================================

test('Fear of Burning Alive: materializacja — Enchantment Creature 4/4 z ETB i delirium', () => {
  const data = gameObjectDataOf(REGISTRY.get('fear-of-burning-alive'));
  assert.equal(data.kind, 'creature');
  assert.deepEqual(REGISTRY.get('fear-of-burning-alive').types, ['Enchantment', 'Creature']);
  const etb = (data.abilities ?? []).find((a) => a.trigger?.event === 'enter_battlefield');
  assert.deepEqual(etb.effect, [{ type: 'damage_each_opponent', amount: 4 }]);
  const delirium = (data.abilities ?? []).find((a) => a.trigger?.event === 'noncombat_damage_to_opponent');
  assert.deepEqual(delirium.trigger.condition, { delirium: true });
});

function putTypesInGraveyard(state, playerId, typeCount) {
  // Instant, Sorcery, Creature, Land — po jednym typie na kartę.
  const cards = ['shatter', 'bone-splinters', 'ainok-artillerist', 'basic-forest'];
  cards.slice(0, typeCount).forEach((cardId, i) => addRealCard(state, `gy-${cardId}-${i}`, cardId, playerId, 'graveyard'));
}

function fearEnters(state) {
  mainPhase(state, 'p1');
  addRealCard(state, 'fear-card', 'fear-of-burning-alive', 'p1', 'hand');
  addMana(state, 'p1', 6);
  const cast = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'fear-card' });
  resolveStack(state);

  assert.ok(cast.ok);
  return findId(state, 'fear-of-burning-alive');
}

// Niecombatowe obrażenia w przeciwnika z osobnego czaru (wieloprzebiegowy
// model triggerów — zdarzenia wytworzone przez triggery są reskanowane w tej
// samej komendzie, CR 603.2): Release the Ants celuje w p2, rozstrzygamy clash.
function antsDamagesPlayer(state) {
  addRealCard(state, 'ants', 'release-the-ants', 'p1', 'hand');
  addRealCard(state, 'lib-mine', 'shatter', 'p1', 'library');
  addRealCard(state, 'lib-opp', 'highland-game', 'p2', 'library');
  addMana(state, 'p1', 2);
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'ants', targets: ['p2'] }).ok);
  passBoth(state);
  assert.ok(state.pendingClash, 'clash Release the Ants czeka na decyzje');
  execute(state, { type: 'resolve_clash_choice', playerId: 'p1', putOnBottom: false });
  execute(state, { type: 'resolve_clash_choice', playerId: 'p2', putOnBottom: false });
  assert.equal(state.pendingClash, null);
}

test('Fear of Burning Alive: ETB zadaje 4 obrażenia każdemu przeciwnikowi (nie kontrolerowi)', () => {
  const state = game();
  const lifeBefore = state.players.map((p) => p.life);
  fearEnters(state);
  const p1 = state.players.find((p) => p.id === 'p1');
  const p2 = state.players.find((p) => p.id === 'p2');
  assert.equal(p2.life, lifeBefore[1] - 4, 'przeciwnik traci 4 życia');
  assert.equal(p1.life, lifeBefore[0], 'kontroler nietknięty');
});

test('Fear of Burning Alive: własne obrażenia ETB odpalają delirium (triggery wieloprzebiegowe, CR 603.2)', () => {
  const state = game();
  putTypesInGraveyard(state, 'p1', 4);
  addSimpleCreature(state, 'victim', 'p2');
  fearEnters(state);
  // Triggery są WIELOPRZEBIEGOWE: zdarzenia wytworzone przez triggery (tu
  // damage_dealt z ETB) są reskanowane w tej samej komendzie — własne ETB
  // Fear przy 4+ typach kart w grobie odpala delirium od razu (CR 603.2:
  // trigger rozstrzygnięty jest faktem przed nadaniem priorytetu).
  assert.equal(state.pendingDeliriumTargets.length, 1, 'delirium kolejkuje się od własnych obrażeń ETB');
  assert.equal(state.pendingDeliriumTargets[0].amount, 4);
  const resolved = execute(state, { type: 'resolve_delirium_target', playerId: 'p1', targetId: 'victim' });
  assert.ok(resolved.ok);
  assert.equal(state.objects.get('victim'), undefined, '1/1 ginie od 4 obrażeń delirium');
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok);
});

test('Fear of Burning Alive: bez delirium w grobie własne obrażenia ETB nie kolejkują (intervening-if)', () => {
  const state = game();
  addSimpleCreature(state, 'victim', 'p2');
  fearEnters(state);
  assert.equal(graveyardCardTypeCount(state, 'p1'), 0);
  assert.equal(state.pendingDeliriumTargets.length, 0, 'intervening-if czyści trigger jeszcze na stosie');
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok);
});

test('Fear of Burning Alive: delirium — niecombatowe obrażenia z osobnej komendy kolejkują wybór celu', () => {
  const state = game();
  mainPhase(state, 'p1');
  putTypesInGraveyard(state, 'p1', 4);
  assert.equal(graveyardCardTypeCount(state, 'p1'), 4);
  addRealCard(state, 'fear', 'fear-of-burning-alive', 'p1', 'battlefield');
  addSimpleCreature(state, 'victim', 'p2', { power: 3, toughness: 3 });
  antsDamagesPlayer(state);
  assert.equal(state.pendingDeliriumTargets.length, 1, 'trigger delirium czeka na wybór celu');
  const pending = state.pendingDeliriumTargets[0];
  assert.equal(pending.playerId, 'p1', 'cel wybiera KONTROLER triggera, nie poszkodowany gracz');
  assert.equal(pending.amount, 1, 'obrażenia ze snapshot zdarzenia (Ants = 1)');
  assert.equal(pending.opponentId, 'p2');
  const pass = execute(state, { type: 'pass_priority', playerId: 'p1' });
  assert.equal(pass.ok, false, 'decyzja delirium blokuje grę');
  const resolved = execute(state, { type: 'resolve_delirium_target', playerId: 'p1', targetId: 'victim' });
  assert.ok(resolved.ok);
  assert.ok(resolved.events.some((e) => e.type === 'damage_dealt' && e.target === 'victim' && e.amount === 1 && e.combat === false));
  assert.equal(state.objects.get('victim').damage, 1, 'obrażenia oznaczone na celu');
  assert.equal(state.pendingDeliriumTargets.length, 0);
});

test('Fear of Burning Alive: delirium bez 4 typów w grobie się nie odpala', () => {
  const state = game();
  mainPhase(state, 'p1');
  putTypesInGraveyard(state, 'p1', 3);
  assert.equal(graveyardCardTypeCount(state, 'p1'), 3);
  addRealCard(state, 'fear', 'fear-of-burning-alive', 'p1', 'battlefield');
  addSimpleCreature(state, 'victim', 'p2');
  antsDamagesPlayer(state);
  assert.equal(state.pendingDeliriumTargets.length, 0, 'intervening if niespełniony — brak triggera');
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok, 'gra toczy się normalnie');
  assert.equal(state.objects.get('victim').damage, 0, 'cel nieuszkodzony');
});

test('Fear of Burning Alive: trigger bez legalnego celu nie jest kolejkowany', () => {
  const state = game();
  mainPhase(state, 'p1');
  putTypesInGraveyard(state, 'p1', 4);
  addRealCard(state, 'fear', 'fear-of-burning-alive', 'p1', 'battlefield');
  // Przeciwnik BEZ stworów — delirium nie ma czego celować.
  antsDamagesPlayer(state);
  assert.equal(state.pendingDeliriumTargets.length, 0);
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok);
});

test('Fear of Burning Alive: token w grobie nie liczy się do typów (nie jest kartą)', () => {
  const state = game();
  putTypesInGraveyard(state, 'p1', 2); // Instant + Sorcery
  addRealCard(state, 'gy-token', 'token_spirit', 'p1', 'graveyard');
  state.objects.set('gy-token', Object.freeze({ ...state.objects.get('gy-token'), name: 'Spirit' }));
  assert.equal(graveyardCardTypeCount(state, 'p1'), 2, 'token nie wnosi typu (name ustawione, CR 702.34 — token nie jest kartą)');
  // Zdejmując oznaczenie tokena (name) z obiektu, typ Creature zaczyna się liczyć.
  state.objects.set('gy-token', Object.freeze({ ...state.objects.get('gy-token'), name: null }));
  assert.equal(graveyardCardTypeCount(state, 'p1'), 3, 'obiekt bez name liczy się jak karta (typ Creature)');
});

test('Fear of Burning Alive: cudza decyzja i nielegalny cel odrzucane', () => {
  const state = game();
  mainPhase(state, 'p1');
  putTypesInGraveyard(state, 'p1', 4);
  addRealCard(state, 'fear', 'fear-of-burning-alive', 'p1', 'battlefield');
  addSimpleCreature(state, 'victim', 'p2');
  addSimpleCreature(state, 'own-creature', 'p1');
  antsDamagesPlayer(state);
  assert.equal(state.pendingDeliriumTargets.length, 1);
  const wrongPlayer = execute(state, { type: 'resolve_delirium_target', playerId: 'p2', targetId: 'victim' });
  assert.equal(wrongPlayer.ok, false);
  assert.equal(wrongPlayer.events[0].reason, 'delirium_target_not_your_decision');
  const ownTarget = execute(state, { type: 'resolve_delirium_target', playerId: 'p1', targetId: 'own-creature' });
  assert.equal(ownTarget.ok, false);
  assert.equal(ownTarget.events[0].reason, 'illegal_delirium_target', 'cel musi być stworem poszkodowanego gracza');
});

test('Fear of Burning Alive + cudze scry: równoczesne decyzje różnych graczy — priorytet i oferty w kolejności bramek (regresja scry_unresolved)', () => {
  // Scenariusz z benchmarku (seed 1020, random red vs aggro azorius): w upkeep
  // p2 zakolejkowała się decyzja scry pokoju „Lost Well" (p2), a trigger
  // delirium p1 (obrażenia klątwy w tej samej komendzie) ukradł priorytet —
  // posiadacz priorytetu nie miał legalnej komendy i gra stawała. Odtwarzamy
  // stan tuż po kolejkowaniu obu decyzji.
  const state = game();
  mainPhase(state, 'p2');
  putTypesInGraveyard(state, 'p1', 4);
  addRealCard(state, 'fear', 'fear-of-burning-alive', 'p1', 'battlefield');
  addSimpleCreature(state, 'victim', 'p2', { power: 2, toughness: 2 });
  addRealCard(state, 'lib-a', 'shatter', 'p2', 'library');
  addRealCard(state, 'lib-b', 'highland-game', 'p2', 'library');
  state.pendingScry = { playerId: 'p2', objectIds: ['lib-a', 'lib-b'], restorePriorityTo: 'p2' };
  state.pendingDeliriumTargets = [{
    playerId: 'p1', sourceId: 'fear', amount: 1, opponentId: 'p2',
    candidateIds: ['victim'], restorePriorityTo: 'p2',
  }];
  // Stan „sprzed naprawy": priorytet u właściciela OSTATNIEJ kolejkowanej
  // decyzji (p1), choć pierwszą bramką execute() jest scry (p2).
  state.turn.priorityPlayerId = 'p1';
  const early = execute(state, { type: 'resolve_delirium_target', playerId: 'p1', targetId: 'victim' });
  assert.equal(early.ok, false);
  assert.equal(early.events[0].reason, 'scry_unresolved', 'scry jest wcześniejszą bramką i zamyka delirium');
  const viewP1 = playerView(state, 'p1');
  assert.equal(viewP1.legalCommands.some((c) => c.type === 'resolve_delirium_target'), false,
    'oferta delirium ukryta, póki trwa wcześniejsza decyzja przeciwnika (zgodność ofert z bramkami)');
  const viewP2 = playerView(state, 'p2');
  assert.ok(hasCommand(viewP2, 'resolve_scry'), 'decydent scry widzi swoją ofertę');
  // Bramki decyzji sprawdzają właściciela, nie priorytet — p2 może rozstrzygnąć.
  assert.ok(execute(state, { type: 'resolve_scry', playerId: 'p2', bottomIds: ['lib-b'] }).ok);
  assert.equal(state.pendingScry, null);
  assert.equal(state.pendingDeliriumTargets.length, 1, 'decyzja delirium przeżywa rozstrzygnięcie scry');
  assert.equal(state.turn.priorityPlayerId, 'p1',
    'accepted() wyrównuje priorytet do decydenta pierwszej z pozostałych decyzji');
  assert.ok(hasCommand(playerView(state, 'p1'), 'resolve_delirium_target', (c) => c.targetId === 'victim'));
  assert.ok(execute(state, { type: 'resolve_delirium_target', playerId: 'p1', targetId: 'victim' }).ok);
  assert.equal(state.pendingDeliriumTargets.length, 0);
  assert.equal(state.turn.priorityPlayerId, 'p2', 'po ostatniej decyzji priorytet wraca do posiadacza (restorePriorityTo)');
});

// =============================================================================
// Jeskai Windscout — flying + prowess (noncreature spell)
// =============================================================================

test('Jeskai Windscout: materializacja — 2/1 Bird Scout flying + trigger prowess', () => {
  const data = gameObjectDataOf(REGISTRY.get('jeskai-windscout'));
  assert.equal(data.kind, 'creature');
  assert.ok((REGISTRY.get('jeskai-windscout').keywords ?? []).includes('flying'));
  const prowess = (data.abilities ?? []).find((a) => a.trigger?.event === 'you_cast_noncreature_spell');
  assert.deepEqual(prowess.effect, { type: 'pump', power: 1, toughness: 1 });
});

test('Jeskai Windscout: rzut instanta daje +1/+1 do końca tury; rzut stwora nie', () => {
  const state = game();
  mainPhase(state, 'p1');
  addRealCard(state, 'scout', 'jeskai-windscout', 'p1', 'battlefield');
  state.objects.set('scout', Object.freeze({ ...state.objects.get('scout'), summoningSickness: false }));
  addRealCard(state, 'bf-card', 'brute-force', 'p1', 'hand');
  addRealCard(state, 'hg-card', 'highland-game', 'p1', 'hand');
  addMana(state, 'p1', 3);
  addSimpleCreature(state, 'host', 'p1');
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'bf-card', targets: ['host'] }).ok);
  passBoth(state); // T6: prowess trigger ze stosu
  const scout = state.objects.get('scout');
  assert.equal(effectivePower(scout, state), 3, 'prowess po rzucie instanta');
  assert.equal(effectiveToughness(scout, state), 2);
  // Rzut STWORA nie odpala prowess (stos już pusty po triggerze + czarze).
  const rCast2 = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'hg-card' });
  assert.ok(rCast2.ok);
  resolveStack(state);
  assert.equal(effectivePower(state.objects.get('scout'), state), 3, 'rzut stwora bez drugiego bonusu');
  state.turn = jumpToStep(state.turn, 'end_of_combat', 'p1');
  passBoth(state);
  passBoth(state);
  passBoth(state); // end step → cleanup
  assert.equal(effectivePower(state.objects.get('scout'), state), 2, 'bonus prowess wygasa w cleanup');
});

test('Jeskai Windscout: cudzy rzut i land drop nie odpalają; permanent nie-stwór odpala', () => {
  const state = game();
  mainPhase(state, 'p1');
  addRealCard(state, 'scout', 'jeskai-windscout', 'p1', 'battlefield');
  state.objects.set('scout', Object.freeze({ ...state.objects.get('scout'), summoningSickness: false }));
  // Land drop nie jest rzuceniem czaru. Swamp, bo dalej rzucamy czarny
  // enchantment (kolorowa walidacja many z PR #28).
  addRealCard(state, 'swamp-card', 'basic-swamp', 'p1', 'hand');
  assert.ok(execute(state, { type: 'play_land', playerId: 'p1', objectId: 'swamp-card' }).ok);
  assert.equal(effectivePower(state.objects.get('scout'), state), 2, 'land drop bez bonusu');
  // Cudzy rzut nie odpala.
  mainPhase(state, 'p2');
  addRealCard(state, 'bf-card-p2', 'brute-force', 'p2', 'hand');
  addMana(state, 'p2', 1);
  addSimpleCreature(state, 'host', 'p2');
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p2', objectId: 'bf-card-p2', targets: ['host'] }).ok);
  passBoth(state); // T1: rozstrzygnij czar p2 przed rzutem permanenta p1
  assert.equal(effectivePower(state.objects.get('scout'), state), 2, 'prowess tylko dla kontrolera');
  // Permanent NIE-będący stworem (artefakt/enchantment) odpala prowess.
  mainPhase(state, 'p1');
  addRealCard(state, 'canon', 'canonized-in-blood', 'p1', 'hand');
  addMana(state, 'p1', 2);
  const rCast3 = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'canon' });
  assert.ok(rCast3.ok);
  resolveStack(state);
  assert.equal(effectivePower(state.objects.get('scout'), state), 3, 'rzut enchantmentu odpala prowess');
});

// =============================================================================
// Hobble — aura: gospodarz nie atakuje, nie blokuje gdy czarny; ETB draw
// =============================================================================

test('Hobble: materializacja — aura z ograniczeniami gospodarza i ETB draw', () => {
  const data = gameObjectDataOf(REGISTRY.get('hobble'));
  assert.equal(data.kind, 'enchantment');
  assert.equal(data.aura.cantAttack, true);
  assert.deepEqual(data.aura.cantBlock, { hostHasColor: 'B' });
  const etb = (data.abilities ?? []).find((a) => a.trigger?.event === 'enter_battlefield');
  assert.deepEqual(etb.effect, [{ type: 'draw_cards', amount: 1 }]);
});

function hobbleAttached(state, hostId, hostColors = []) {
  mainPhase(state, 'p1');
  addRealCard(state, 'hobble-card', 'hobble', 'p1', 'hand');
  addMana(state, 'p1', 3);
  addSimpleCreature(state, hostId, 'p2', { power: 3, toughness: 3, colors: hostColors });
  const cast = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'hobble-card', targets: [hostId] });
  resolveStack(state);

  assert.ok(cast.ok);
  passBoth(state);
  const aura = state.objects.get(findId(state, 'hobble'));
  assert.equal(aura.attachedTo, hostId);
  return aura;
}

test('Hobble: wejście dobiera kartę i zaczarowuje stwora', () => {
  const state = game();
  addRealCard(state, 'lib-1', 'shatter', 'p1', 'library');
  const handBefore = handSize(state, 'p1');
  const aura = hobbleAttached(state, 'host');
  assert.equal(aura.kind, 'aura');
  assert.equal(handSize(state, 'p1'), handBefore + 1, 'ETB: draw a card');
});

test('Hobble: zaczarowany stwór nie może atakować (odrzucenie + brak oferty)', () => {
  const state = game();
  hobbleAttached(state, 'host');
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p2');
  const attackers = execute(state, { type: 'declare_attackers', playerId: 'p2', attackerIds: ['host'] });
  assert.equal(attackers.ok, false, 'gospodarz z Hobble nie atakuje');
  const view = playerView(state, 'p2');
  assert.ok(!hasCommand(view, 'declare_attackers', (c) => Array.isArray(c.attackerIds) && c.attackerIds.includes('host')), 'oferta nie zawiera zaczarowanego');
});

test('Hobble: czarny gospodarz nie może blokować; nie-czarny może', () => {
  const state = game();
  hobbleAttached(state, 'black-host', ['B']);
  addSimpleCreature(state, 'attacker', 'p1');
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['attacker'] }).ok);
  const block = execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { attacker: ['black-host'] } });
  assert.equal(block.ok, false, 'czarny gospodarz nie blokuje („can\'t block if it\'s black\")');

  const state2 = game();
  hobbleAttached(state2, 'red-host', ['R']);
  addSimpleCreature(state2, 'attacker', 'p1');
  state2.turn = jumpToStep(state2.turn, 'declare_attackers', 'p1');
  assert.ok(execute(state2, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['attacker'] }).ok);
  const okBlock = execute(state2, { type: 'declare_blockers', playerId: 'p2', assignments: { attacker: ['red-host'] } });
  assert.ok(okBlock.ok, 'nie-czarny gospodarz blokuje normalnie');
});

test('Hobble: odłączenie aury znosi ograniczenia', () => {
  const state = game();
  hobbleAttached(state, 'host', ['B']);
  addSimpleCreature(state, 'attacker', 'p1');
  moveObjectDirectly(state, findId(state, 'hobble'), 'graveyard', 'grave-hobble');
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['attacker'] }).ok);
  const block = execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { attacker: ['host'] } });
  assert.ok(block.ok, 'po odłączeniu ograniczenie znika (liczenie przy odczycie)');
});

// =============================================================================
// Determinizm: replay z nowymi decyzjami daje identyczny stan
// =============================================================================

test('determinizm: replay z devour/endure/graveyard-top/delirium daje identyczny stan', () => {
  const build = () => {
    const state = game();
    // Devour
    wurmEnters(state, 1);
    execute(state, { type: 'resolve_devour_choice', playerId: 'p1', targetId: 'sac-0' });
    execute(state, { type: 'resolve_devour_choice', playerId: 'p1', done: true });
    // Endure
    addRealCard(state, 'nurturer-card', 'kin-tree-nurturer', 'p1', 'hand');
    addMana(state, 'p1', 3);
    execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'nurturer-card' });
  resolveStack(state);

    execute(state, { type: 'resolve_endure_choice', playerId: 'p1', mode: 'token' });
    // Forever Young (grób pusty — draw bez decyzji, deterministycznie)
    addRealCard(state, 'fy-card', 'forever-young', 'p1', 'hand');
    addMana(state, 'p1', 2);
    addRealCard(state, 'fy-grave', 'brute-force', 'p1', 'graveyard');
    execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'fy-card' });
    passBoth(state);
    return state;
  };
  const verification = verifyReplay(replayFromState(build()), build, execute);
  assert.equal(verification.deterministic, true);
});

test('determinizm: replay z sekwencją graveyard-top (wybory + done)', () => {
  const build = () => {
    const state = youngResolves(game());
    execute(state, { type: 'resolve_graveyard_top_choice', playerId: 'p1', targetId: 'fymine-1' });
    execute(state, { type: 'resolve_graveyard_top_choice', playerId: 'p1', targetId: 'fymine-0' });
    execute(state, { type: 'resolve_graveyard_top_choice', playerId: 'p1', done: true });
    return state;
  };
  const verification = verifyReplay(replayFromState(build()), build, execute);
  assert.equal(verification.deterministic, true);
});
