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
