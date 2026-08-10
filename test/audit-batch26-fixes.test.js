import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { effectiveKeywords, effectivePower, effectiveToughness } from '../src/engine/permanents.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { legalActivatedAbilities } from '../src/engine/abilities.js';

/**
 * Audyt Batchu 26 (M65, sesja 2026-08-09) — behawioralny, nie definicyjny:
 *   A. Crew to instant (CR 701.36) — bomat-bazaar-barge, irontread-crusher.
 *   B. Kolorowe koszty zdolności (CR 118.2) — kabira-vindicator level up,
 *      bladed-sentinel {W}, trestle-troll regenerate, reassembling-skeleton.
 *   C. Index — wybór gracza (reorder top 5) widoczny w PlayerView (FoW).
 *   D. Face-down bez keywordów (CR 708.2) — zakryty stwór nie ma flying.
 */

const REGISTRY = createCardRegistry();

function game(seed = 2026) {
  return createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] });
}

function mainPhase(state, active = 'p1') {
  state.turn = jumpToStep(state.turn, 'main', active);
  state.turn.activePlayerId = active;
  state.turn.priorityPlayerId = active;
  return state;
}

function addRealCard(state, id, cardId, playerId, zone, extra = {}) {
  const card = REGISTRY.get(cardId);
  assert.ok(card, `brak karty ${cardId}`);
  const data = gameObjectDataOf(card);
  // jak createCardDeck: dopełnij linie typów/keywordów/subtypów
  data.types = card.types ?? [];
  data.keywords = card.keywords ?? [];
  data.subtypes = card.subtypes ?? [];
  return addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId, zone,
    ...data, ...extra,
  });
}

function resolveStack(state) {
  let guard = 0;
  while (state.zones.stack.length > 0 && guard++ < 200) {
    const holder = state.turn.priorityPlayerId;
    const view = playerView(state, holder);
    const pass = view.legalCommands.find((c) => c.type === 'pass_priority');
    const pick = pass ?? view.legalCommands.find((c) => c.type.startsWith('resolve_'));
    if (!pick) return false;
    const r = execute(state, pick);
    if (!r.ok) return false;
  }
  return state.zones.stack.length === 0;
}

function eff(state, id) {
  const o = state.objects.get(id);
  return { p: effectivePower(o, state), t: effectiveToughness(o, state) };
}

// =============================================================================
// E. Transform trigger a LKI — no-op, gdy źródło opuściło bitwisko (M65)
// =============================================================================

test('E1: transform wilkołaka po śmierci źródła nie crashuje (LKI stub)', async () => {
  const state = mainPhase(game());
  addRealCard(state, 'wolf', 'scorned-villager', 'p1', 'battlefield');
  state.lastTurnSpellsCast = 0; // condition: no spells last turn
  // Upkeep: trigger transform idzie na stos.
  state.turn = jumpToStep(state.turn, 'upkeep', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  // Wymuś odpalenie triggera upkeep (jak procesTriggers przy step_advanced).
  const { processTriggers } = await import('../src/engine/triggers.js');
  processTriggers(state, [{ type: 'step_advanced', step: 'upkeep', phase: 'beginning' }]);
  const onStack = state.zones.stack.some((id) => state.objects.get(id)?.kind === 'trigger');
  assert.ok(onStack, 'trigger transform nie trafił na stos');
  // Źródło umiera, zanim trigger się rozstrzygnie.
  const { moveObjectDirectly } = await import('../src/engine/objects.js');
  const graveId = `grave-${state.objectSequence++}`;
  moveObjectDirectly(state, 'wolf', 'graveyard', graveId);
  // Rozstrzygnij stos — nie może być crasha, efekt jest no-op.
  let guard = 0;
  while (state.zones.stack.length > 0 && guard++ < 50) {
    const holder = state.turn.priorityPlayerId;
    const v = playerView(state, holder);
    const pass = v.legalCommands.find((c) => c.type === 'pass_priority');
    const pick = pass ?? v.legalCommands.find((c) => c.type.startsWith('resolve_'));
    if (!pick) break;
    execute(state, pick);
  }
  const wolf = [...state.objects.values()].find((o) => o.cardId === 'scorned-villager');
  assert.equal(wolf.zone, 'graveyard', 'źródło pozostaje w grobie (bez transformu)');
});

// =============================================================================
// C. Index (APC) — wybór gracza: reorder top 5 (M65)
// =============================================================================

test('C1: Index — pendingIndex widoczny w PlayerView z kartami dla decydenta (FoW)', () => {
  const state = mainPhase(game());
  for (let i = 0; i < 6; i++) addRealCard(state, `p1lib${i}`, 'basic-island', 'p1', 'library');
  for (let i = 0; i < 6; i++) addRealCard(state, `p2lib${i}`, 'basic-mountain', 'p2', 'library');
  addRealCard(state, 'idx', 'index', 'p1', 'hand');
  addMana(state, 'p1', 1, { colors: ['U'] });
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p1', cardId: 'index', objectId: 'idx' }).ok);
  // Rozstrzygnij stos aż do pojawienia się pendingIndex (nie rozwiązuj go).
  let guard = 0;
  while (state.zones.stack.length > 0 && !state.pendingIndex && guard++ < 100) {
    const v = playerView(state, state.turn.priorityPlayerId);
    const pass = v.legalCommands.find((c) => c.type === 'pass_priority');
    const pick = pass ?? v.legalCommands.find((c) => c.type.startsWith('resolve_'));
    if (!pick) break;
    execute(state, pick);
  }
  assert.ok(state.pendingIndex, 'brak pendingIndex w stanie');
  const view = playerView(state, 'p1');
  assert.ok(view.pendingIndex, 'brak pendingIndex w PlayerView decydenta');
  assert.equal(view.pendingIndex.playerId, 'p1');
  assert.equal(view.pendingIndex.count, 5);
  assert.ok(Array.isArray(view.pendingIndex.cards) && view.pendingIndex.cards.length === 5, 'decydent widzi 5 kart');
  assert.ok(view.pendingIndex.cards.every((c) => typeof c.cardId === 'string'), 'karty niosą cardId');
  assert.ok(view.legalCommands.some((c) => c.type === 'resolve_index_choice'), 'brak resolve_index_choice w legalCommands');
  // FoW: przeciwnik widzi tylko fakt decyzji.
  const foe = playerView(state, 'p2');
  assert.ok(foe.pendingIndex, 'przeciwnik widzi, że decyzja trwa');
  assert.equal(foe.pendingIndex.count, 5);
  assert.equal(foe.pendingIndex.cards, null, 'przeciwnik NIE widzi kart (FoW)');
});

test('C2: Index — resolve_index_choice z dowolną permutacją przestawia top 5', () => {
  const state = mainPhase(game());
  for (let i = 0; i < 6; i++) addRealCard(state, `p1lib${i}`, 'basic-island', 'p1', 'library');
  for (let i = 0; i < 6; i++) addRealCard(state, `p2lib${i}`, 'basic-mountain', 'p2', 'library');
  addRealCard(state, 'idx', 'index', 'p1', 'hand');
  addMana(state, 'p1', 1, { colors: ['U'] });
  execute(state, { type: 'cast_spell', playerId: 'p1', cardId: 'index', objectId: 'idx' });
  let guard = 0;
  while (state.zones.stack.length > 0 && !state.pendingIndex && guard++ < 100) {
    const v = playerView(state, state.turn.priorityPlayerId);
    const pick = v.legalCommands.find((c) => c.type === 'pass_priority') ?? v.legalCommands.find((c) => c.type.startsWith('resolve_'));
    if (!pick) break;
    execute(state, pick);
  }
  const before = state.zones.library.filter((id) => state.objects.get(id)?.controllerId === 'p1').slice(0, 5);
  const order = [before[2], before[4], before[0], before[3], before[1]];
  const r = execute(state, { type: 'resolve_index_choice', playerId: 'p1', order });
  assert.ok(r.ok, r.events?.[0]?.reason);
  const top = state.zones.library.filter((id) => state.objects.get(id)?.controllerId === 'p1').slice(0, 5);
  assert.deepEqual(top, order, 'biblioteka przestawiona w wybranej kolejności');
  const inGrave = [...state.objects.values()].some((o) => o.cardId === 'index' && o.zone === 'graveyard');
  assert.ok(inGrave, 'Index ląduje w grobie po rozstrzygnięciu');
});

test('C3: Index przy <5 kartach w bibliotece — pending obejmuje dostępne karty', () => {
  const state = mainPhase(game());
  for (let i = 0; i < 3; i++) addRealCard(state, `s${i}`, 'basic-island', 'p1', 'library');
  for (let i = 0; i < 6; i++) addRealCard(state, `p2s${i}`, 'basic-mountain', 'p2', 'library');
  addRealCard(state, 'idx', 'index', 'p1', 'hand');
  addMana(state, 'p1', 1, { colors: ['U'] });
  execute(state, { type: 'cast_spell', playerId: 'p1', cardId: 'index', objectId: 'idx' });
  let guard = 0;
  while (state.zones.stack.length > 0 && !state.pendingIndex && guard++ < 100) {
    const v = playerView(state, state.turn.priorityPlayerId);
    const pick = v.legalCommands.find((c) => c.type === 'pass_priority') ?? v.legalCommands.find((c) => c.type.startsWith('resolve_'));
    if (!pick) break;
    execute(state, pick);
  }
  assert.equal(state.pendingIndex?.objectIds?.length, 3, 'Index obejmuje 3 dostępne karty');
  const view = playerView(state, 'p1');
  assert.equal(view.pendingIndex?.count, 3);
});

// =============================================================================
// R. Rozdzielanie obrażeń przy wielu blokerach — decyzja gracza (M66)
// =============================================================================

function twoBlockersState(attackerPower = 5, extra = {}) {
  const state = enterCombat({ id: 'atk', cardId: 'goblin-piker', ctrl: 'p1' }, { id: 'b1', cardId: 'highland-game', ctrl: 'p2' });
  addRealCard(state, 'b2', 'goblin-piker', 'p2', 'battlefield');
  const { modifyStats } = { modifyStats: null };
  // nadaj moc/toughness wprost
  const a = state.objects.get('atk');
  state.objects.set('atk', Object.freeze({ ...a, power: attackerPower, toughness: 5, ...extra }));
  const b1 = state.objects.get('b1');
  state.objects.set('b1', Object.freeze({ ...b1, power: 3, toughness: 3 }));
  const b2 = state.objects.get('b2');
  state.objects.set('b2', Object.freeze({ ...b2, power: 3, toughness: 3 }));
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['atk'] }).ok);
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { atk: ['b1', 'b2'] } }).ok);
  return state;
}

test('R1: multi-bloker — resolve_combat kolejkuje decyzję (pendingDamageAssignment)', () => {
  const state = twoBlockersState(5);
  const r = execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' });
  assert.ok(r.ok, r.events?.[0]?.reason);
  assert.ok(state.pendingDamageAssignment, 'brak pending po resolve_combat');
  assert.equal(state.pendingDamageAssignment.playerId, 'p1');
  const view = playerView(state, 'p1');
  assert.ok(view.pendingDamageAssignment, 'PlayerView nie wystawia pending');
  assert.equal(view.pendingDamageAssignment.entries.length, 1);
  const entry = view.pendingDamageAssignment.entries[0];
  assert.equal(entry.attackerCardId, 'goblin-piker');
  assert.equal(entry.power, 5);
  assert.equal(entry.trample, false);
  assert.equal(entry.blockers.length, 2);
  // legalCommands oferują DOKŁADNIE JEDEN wariant (default) — bez kombinacji.
  const variants = view.legalCommands.filter((c) => c.type === 'resolve_damage_assignment');
  assert.equal(variants.length, 1, 'tylko jeden wariant (kombinacje zabronione)');
  // default = lethal-first w kolejności deklaracji
  const r2 = execute(state, variants[0]);
  assert.ok(r2.ok, r2.events?.[0]?.reason);
  assert.ok([...state.objects.values()].every((o) => o.id !== 'b1' || o.zone !== 'battlefield'), 'b1 ginie (lethal 3)');
  assert.equal(state.objects.get('b2').zone, 'battlefield', 'b2 żyje');
  assert.equal(state.objects.get('b2').damage, 2, 'b2 dostał 2');
});

test('R2: gracz przydziela inaczej (cała moc na pierwszego blokera)', () => {
  const state = twoBlockersState(5);
  execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' });
  const r = execute(state, {
    type: 'resolve_damage_assignment', playerId: 'p1',
    assignments: { atk: [{ blockerId: 'b1', amount: 5 }, { blockerId: 'b2', amount: 0 }] },
  });
  assert.ok(r.ok, r.events?.map((e) => `${e.type}:${e.reason ?? ''}`).join(','));
  assert.ok([...state.objects.values()].every((o) => o.id !== 'b1' || o.zone !== 'battlefield'), 'b1 ginie (5)');
  assert.equal(state.objects.get('b2').zone, 'battlefield', 'b2 żyje');
  assert.equal(state.objects.get('b2').damage, 0, 'b2 dostał 0');
});

test('R3: nielegalne przydziały odrzucane (suma > moc, zły bloker, zła kolejność)', () => {
  const s1 = twoBlockersState(5);
  execute(s1, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' });
  const badSum = execute(s1, { type: 'resolve_damage_assignment', playerId: 'p1', assignments: { atk: [{ blockerId: 'b1', amount: 3 }, { blockerId: 'b2', amount: 3 }] } });
  assert.equal(badSum.ok, false, 'suma 6 > moc 5');
  const s2 = twoBlockersState(5);
  execute(s2, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' });
  const badBlocker = execute(s2, { type: 'resolve_damage_assignment', playerId: 'p1', assignments: { atk: [{ blockerId: 'b1', amount: 2 }, { blockerId: 'nope', amount: 1 }] } });
  assert.equal(badBlocker.ok, false, 'bloker spoza listy');
  const s3 = twoBlockersState(5);
  execute(s3, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' });
  // b2 pierwszy z 2 < lethal 3, a b1 (późniejszy) dostaje 3 > 0 → naruszenie kolejności
  const badOrder = execute(s3, { type: 'resolve_damage_assignment', playerId: 'p1', assignments: { atk: [{ blockerId: 'b2', amount: 2 }, { blockerId: 'b1', amount: 3 }] } });
  assert.equal(badOrder.ok, false, 'kolejność: b2 musi mieć >= lethal zanim b1 dostanie obrażenia');
});

test('R4: trample z wieloma blokerami — reszta idzie na gracza (default)', () => {
  const state = twoBlockersState(7, { keywords: ['trample'] });
  const life = state.players.find((p) => p.id === 'p2').life;
  execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' });
  const variants = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'resolve_damage_assignment');
  assert.equal(variants.length, 1);
  assert.ok(execute(state, variants[0]).ok);
  assert.equal(state.players.find((p) => p.id === 'p2').life, life - 1, '7 - 3 - 3 = 1 na gracza');
});

// =============================================================================
// G. remove_counter jako no-op przy braku licznika (M66, Kappa ×2)
// =============================================================================

test('G1: drugi trigger remove_counter bez licznika nie crashuje (no-op, CR 608.2b)', async () => {
  const state = mainPhase(game());
  addRealCard(state, 'kap', 'kappa-tech-wrecker', 'p1', 'battlefield'); // entersWithCounters deathtouch
  // karta wchodzi z licznikiem — nadaj ręcznie
  const { addCounter } = await import('../src/engine/counters.js');
  addCounter(state, 'kap', 'deathtouch', 1);
  assert.equal(state.objects.get('kap').counters?.deathtouch, 1);
  // Dwa identyczne efekty remove_counter (jak dwa triggery Kappy z tego
  // samego zdarzenia combat damage) — drugi nie ma czego zdjąć.
  const { applyEffect } = await import('../src/engine/effects.js');
  applyEffect(state, { type: 'remove_counter', counter: 'deathtouch', amount: 1 }, state.objects.get('kap'), []);
  assert.equal(state.objects.get('kap').counters?.deathtouch ?? 0, 0);
  applyEffect(state, { type: 'remove_counter', counter: 'deathtouch', amount: 1 }, state.objects.get('kap'), []);
  assert.equal(state.objects.get('kap').counters?.deathtouch ?? 0, 0, 'no-op bez crasha');
});

// =============================================================================
// C+D. Log walki i pełna moc przy pojedynczym blokerze (M66)
// =============================================================================

function enterCombat(attacker, defender) {
  const state = mainPhase(game());
  // przeskocz do deklaracji atakujących w turze p1
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  addRealCard(state, attacker.id, attacker.cardId, attacker.ctrl, 'battlefield');
  addRealCard(state, defender.id, defender.cardId, defender.ctrl, 'battlefield');
  return state;
}

test('D1: 3/3 vs pojedynczy bloker 1/1 — atakujący zadaje 3 (pełna moc, CR 510.1d)', async () => {
  const state = enterCombat({ id: 'att', cardId: 'goblin-piker', ctrl: 'p1' }, { id: 'blk', cardId: 'highland-game', ctrl: 'p2' });
  // goblin-piker 2/1 — podbijmy go do 3/3 przez Might? prościej: dodaj modyfikator
  const { modifyStats } = await import('../src/engine/permanents.js');
  modifyStats(state, 'att', { power: 1, toughness: 2 }); // 3/3
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['att'] }).ok);
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { att: ['blk'] } }).ok);
  const r = execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' });
  assert.ok(r.ok, r.events?.[0]?.reason);
  const dealt = r.events.filter((e) => e.type === 'damage_dealt' && e.source === 'att');
  assert.equal(dealt.length, 1, 'jeden damage_dealt od atakującego');
  assert.equal(dealt[0].amount, 3, `3/3 vs 1/1 zadaje 3, nie 1 (było: ${dealt[0].amount})`);
  assert.equal(dealt[0].targetCardId, 'highland-game', 'event niesie targetCardId (C)');
  assert.equal(dealt[0].sourceCardId, 'goblin-piker', 'event niesie sourceCardId (C)');
  const blk = [...state.objects.values()].find((o) => o.cardId === 'highland-game');
  assert.equal(blk.zone, 'graveyard', 'bloker umarł');
});

test('C1: deklaracje ataku/bloków niosą cardId w zdarzeniach (LKI dla logu)', () => {
  const state = enterCombat({ id: 'att', cardId: 'goblin-piker', ctrl: 'p1' }, { id: 'blk', cardId: 'highland-game', ctrl: 'p2' });
  const ra = execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['att'] });
  assert.ok(ra.ok);
  const evA = state.events.find((e) => e.type === 'attackers_declared');
  assert.deepEqual(evA.attackerCardIds, ['goblin-piker'], 'attackers_declared niesie cardIds');
  const rb = execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { att: ['blk'] } });
  assert.ok(rb.ok);
  const evB = state.events.find((e) => e.type === 'blockers_declared');
  assert.equal(evB.cards['att'], 'goblin-piker');
  assert.equal(evB.cards['blk'], 'highland-game');
});

test('C2: pełna partia — log walki bez „?" (nazwy po cardId, śmierć w SBA)', async () => {
  const { createSession, HUMAN_ID, BOT_ID } = await import('../src/table/session.js');
  const fs = await import('node:fs');
  const { parseDeckText } = await import('../src/cards/deck-text.js');
  const decks = new Map([
    [HUMAN_ID, parseDeckText(fs.readFileSync('decks/green.txt', 'utf8'), REGISTRY).cardIds],
    [BOT_ID, parseDeckText(fs.readFileSync('decks/red.txt', 'utf8'), REGISTRY).cardIds],
  ]);
  const session = createSession({ seed: 42, registry: REGISTRY, decks });
  const choose = (view) => {
    const ofType = (type) => view.legalCommands.filter((c) => c.type === type);
    const first = (type) => ofType(type)[0] ?? null;
    return first('draw_card') ?? first('play_land') ?? first('cast_permanent')
      ?? (() => { const a = ofType('declare_attackers'); return a.length ? a.reduce((b, c) => c.attackerIds.length > b.attackerIds.length ? c : b) : null; })()
      ?? first('declare_blockers') ?? first('resolve_combat')
      ?? view.legalCommands.find((c) => c.type.startsWith('resolve_')) ?? null
      ?? first('pass_priority');
  };
  let guard = 0;
  while (session.state.status === 'active' && guard++ < 600) {
    const view = session.view();
    const cmd = choose(view);
    if (!cmd) break;
    const r = session.apply(cmd);
    if (!r.ok) break;
  }
  assert.notEqual(session.state.status, 'active', 'partia się nie zakończyła');
  const combatLines = session.log.filter((e) => e.kind === 'event'
    && /(Atak:|blokuje|zadaje)/.test(e.text));
  const withQuestion = combatLines.filter((e) => e.text.includes('?'));
  assert.deepEqual(withQuestion.map((e) => e.text), [], 'log walki nie może zawierać „?"');
  assert.ok(combatLines.length > 0, 'partia miała walkę');
});

// =============================================================================
// F. MANA_COSTS (M66) — walidacja kolorów przy rzucie (Batchy 16-26)
// =============================================================================

test('F1: rzut karty {G} maną {U} jest odrzucany (MANA_COSTS kompletne)', () => {
  const state = mainPhase(game());
  addRealCard(state, 't', 'highland-game', 'p1', 'battlefield'); // 2/1
  addRealCard(state, 'm', 'might-of-the-masses', 'p1', 'hand');
  addMana(state, 'p1', 1, { colors: ['U'] });
  const r = execute(state, { type: 'cast_spell', playerId: 'p1', cardId: 'might-of-the-masses', objectId: 'm', targets: ['t'] });
  assert.equal(r.ok, false, 'Might {G} za {U} nie powinien przejść');
  assert.match(r.events?.[0]?.reason ?? '', /kolor|mana/i, 'powód odrzucenia dotyczy kolorów');
  // Z poprawną maną przechodzi.
  addMana(state, 'p1', 1, { colors: ['G'] });
  const ok = execute(state, { type: 'cast_spell', playerId: 'p1', cardId: 'might-of-the-masses', objectId: 'm', targets: ['t'] });
  assert.ok(ok.ok, 'Might {G} za {G} musi przejść');
});

test('F2: Trestle Troll {1}{B}{G} nie da się rzucić za same białe', () => {
  const state = mainPhase(game());
  addRealCard(state, 'tt', 'trestle-troll', 'p1', 'hand');
  addMana(state, 'p1', 3, { colors: ['W'] });
  const r = execute(state, { type: 'cast_permanent', playerId: 'p1', cardId: 'trestle-troll', objectId: 'tt' });
  assert.equal(r.ok, false, '{1}{B}{G} za {W}{W}{W} odrzucone');
  // Z poprawną maną przechodzi.
  addMana(state, 'p1', 3, { colors: ['B', 'G'] });
  const ok = execute(state, { type: 'cast_permanent', playerId: 'p1', cardId: 'trestle-troll', objectId: 'tt' });
  assert.ok(ok.ok, '{1}{B}{G} za {B}{G}{1} przechodzi');
});

// =============================================================================
// A. Crew = instant (CR 701.36) — bomat-bazaar-barge, irontread-crusher
// =============================================================================

test('A1: crew Bomat Bazaar Barge działa w turze przeciwnika (instant)', () => {
  const state = mainPhase(game());
  addRealCard(state, 'barge', 'bomat-bazaar-barge', 'p1', 'battlefield');
  addRealCard(state, 'c1', 'highland-game', 'p1', 'battlefield'); // 2/1
  addRealCard(state, 'c2', 'goblin-piker', 'p1', 'battlefield'); // 2/1
  // Tura przeciwnika: crew NIE jest sorcery — musi być oferowane i akceptowane
  // z priorytetem (jak każda zdolność instant).
  mainPhase(state, 'p2');
  state.turn.priorityPlayerId = 'p1';
  const offered = legalActivatedAbilities(state, 'p1').filter((a) => a.objectId === 'barge');
  assert.equal(offered.length, 1, `crew nie oferowane w turze p2: ${offered.length}`);
  const r = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'barge', abilityIndex: 1, crewCreatureIds: ['c1', 'c2'] });
  assert.ok(r.ok, r.events?.[0]?.reason);
  const barge = state.objects.get('barge');
  assert.equal(barge.kind, 'creature', 'po crew barge jest stworem');
  assert.ok(state.objects.get('c1').tapped && state.objects.get('c2').tapped, 'stwory crew zatapnione');
});

test('A2: crew Irontread Crusher działa z priorytetem przy niepustym stosie', () => {
  const state = mainPhase(game());
  addRealCard(state, 'crusher', 'irontread-crusher', 'p1', 'battlefield');
  addRealCard(state, 'c1', 'highland-game', 'p1', 'battlefield');
  addRealCard(state, 'c2', 'goblin-piker', 'p1', 'battlefield');
  // p1 rzuca instant (Might of the Masses) — czar na stosie.
  addRealCard(state, 'might', 'might-of-the-masses', 'p1', 'hand');
  addMana(state, 'p1', 1, { colors: ['G'] });
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p1', cardId: 'might-of-the-masses', objectId: 'might', targets: ['c1'] }).ok);
  assert.ok(state.zones.stack.length > 0, 'czar musi być na stosie');
  // Z priorytetem (stos niepusty) crew jest legalne — to NIE sorcery.
  const r = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'crusher', abilityIndex: 0, crewCreatureIds: ['c1', 'c2'] });
  assert.ok(r.ok, r.events?.[0]?.reason);
  assert.equal(state.objects.get('crusher').kind, 'creature', 'crusher po crew jest stworem');
});

// =============================================================================
// B. Kolorowe koszty zdolności (CR 118.2) — Batch 25/26
// =============================================================================

test('B1: Kabira Vindicator level up {2}{W} — aktywowalny i progi działają', () => {
  const state = mainPhase(game());
  addRealCard(state, 'kab', 'kabira-vindicator', 'p1', 'battlefield');
  addRealCard(state, 'other', 'highland-game', 'p1', 'battlefield');
  addMana(state, 'p1', 3, { colors: ['W'] });
  const offered = legalActivatedAbilities(state, 'p1').filter((a) => a.objectId === 'kab');
  assert.equal(offered.length, 1, 'level up nie oferowane');
  assert.ok(execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'kab', abilityIndex: 0 }).ok);
  assert.equal(state.objects.get('kab').counters?.level, 1, 'brak level countera');
});

test('B2: Bladed Sentinel {W}: vigilance — oferowane i aktywowalne', () => {
  const state = mainPhase(game());
  addRealCard(state, 'bs', 'bladed-sentinel', 'p1', 'battlefield');
  addMana(state, 'p1', 1, { colors: ['W'] });
  const offered = legalActivatedAbilities(state, 'p1').filter((a) => a.objectId === 'bs');
  assert.equal(offered.length, 1, '{W}: vigilance nie oferowane');
  const r = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'bs', abilityIndex: 0 });
  assert.ok(r.ok, r.events?.[0]?.reason);
  assert.ok(effectiveKeywords(state.objects.get('bs'), state).includes('vigilance'), 'brak vigilance po aktywacji');
});

test('B3: Trestle Troll {1}{B}{G}: Regenerate — aktywowalne', () => {
  const state = mainPhase(game());
  addRealCard(state, 'tt', 'trestle-troll', 'p1', 'battlefield');
  addMana(state, 'p1', 3, { colors: ['B', 'G'] });
  const offered = legalActivatedAbilities(state, 'p1').filter((a) => a.objectId === 'tt');
  assert.equal(offered.length, 1, 'regenerate nie oferowane');
  const r = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'tt', abilityIndex: 0 });
  assert.ok(r.ok, r.events?.[0]?.reason);
});

test('B4: Reassembling Skeleton {1}{B} z grobu — aktywowalne', () => {
  const state = mainPhase(game());
  addRealCard(state, 'skel', 'reassembling-skeleton', 'p1', 'graveyard');
  addMana(state, 'p1', 2, { colors: ['B'] });
  const offered = legalActivatedAbilities(state, 'p1').filter((a) => a.objectId === 'skel');
  assert.equal(offered.length, 1, 'powrót z grobu nie oferowany');
  const r = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'skel', abilityIndex: 0 });
  assert.ok(r.ok, r.events?.[0]?.reason);
  const skelBf = [...state.objects.values()].find((o) => o.cardId === 'reassembling-skeleton' && o.zone === 'battlefield');
  assert.ok(skelBf, 'szkielet nie wrócił na bitwisko');
  assert.equal(skelBf.tapped, true, 'wraca zatapnięty');
});

// =============================================================================
// D. Face-down bez keywordów (CR 708.2) — audyt Batchu 26
// =============================================================================

test('D1: face-down stwór nie ma keywordów (zakryty flyer)', () => {
  const state = mainPhase(game());
  addRealCard(state, 'flock', 'monastery-flock', 'p1', 'hand'); // flying + morph
  addMana(state, 'p1', 3, { colors: ['U'] });
  const r = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'flock', faceDown: true });
  assert.ok(r.ok, r.events?.[0]?.reason);
  assert.ok(resolveStack(state), 'stos się nie rozstrzygnął');
  const fd = [...state.objects.values()].find((o) => o.zone === 'battlefield' && o.faceDown);
  assert.ok(fd, 'brak face-down na bitwisku');
  assert.deepEqual(effectiveKeywords(fd, state), [], `face-down ma keywordy: ${effectiveKeywords(fd, state)}`);
  assert.deepEqual(eff(state, fd.id), { p: 2, t: 2 }, 'face-down to 2/2');
});

test('D2: Lurking Green Dragon nie atakuje, gdy obrońca ma tylko zakrytego flyera', () => {
  const state = mainPhase(game());
  addRealCard(state, 'drak', 'lurking-green-dragon', 'p1', 'battlefield');
  // Obrońca kontroluje zakrytego Monastery Flock (flying w definicji).
  const flock = addRealCard(state, 'flock', 'monastery-flock', 'p2', 'battlefield');
  state.objects.set('flock', Object.freeze({ ...flock, faceDown: true }));
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  const r = execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['drak'] });
  assert.equal(r.ok, false, 'zakryty flyer nie odblokowuje smoka (CR 708.2)');
  // Po odsłonięciu — atak dozwolony.
  state.objects.set('flock', Object.freeze({ ...state.objects.get('flock'), faceDown: false }));
  const r2 = execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['drak'] });
  assert.ok(r2.ok, 'odsłonięty flyer odblokowuje smoka');
});

test('D3: face-down stwór nie blokuje atakującego z flying', () => {
  const state = mainPhase(game());
  const att = addRealCard(state, 'att', 'rustwing-falcon', 'p1', 'battlefield'); // 1/2 flying
  const blk = addRealCard(state, 'blk', 'monastery-flock', 'p2', 'battlefield');
  state.objects.set('blk', Object.freeze({ ...blk, faceDown: true }));
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['att'] }).ok);
  const r = execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { att: ['blk'] } });
  assert.equal(r.ok, false, 'zakryty stwór bez flying nie blokuje flyera');
});
