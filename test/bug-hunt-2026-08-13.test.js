import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep, initialTurn } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

// =============================================================================
// Polowanie na błędy 2026-08-13 (brązowa odznaka) — behawioralnie, nie
// definicyjnie: każdy test odtwarza realny przebieg gry.
//
// ZNALEZIONE BŁĘDY:
//  1) `creature` trigger-target wyklucza źródło — karty „target creature" bez
//     „other" nie mogą celować w siebie (Cloudbound Moogle ETB w ogóle nie
//     odpala, gdy jest jedynym stworem).
//  2) Wavecrash Triton: lock_untap trwały (jak Entrancing Lyre) zamiast
//     „doesn't untap during controller's next untap step".
//  3) Amass z wieloma armiami bez wyboru (engine bierze pierwszą).
//  4) Caravan Vigil Morbid wymusza bitwisko bez opcji „may" (ręka).
//  5) Goad nie uniemożliwia blokowania (CR 701.38).
// =============================================================================

const REGISTRY = createCardRegistry();

function game() {
  return createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
}
function addRealCard(state, id, cardId, pid, zone, extra = {}) {
  const card = REGISTRY.get(cardId);
  assert.ok(card, `brak karty ${cardId}`);
  const data = gameObjectDataOf(card);
  data.types = card.types ?? [];
  data.cardName = card.name;
  data.ownerId = pid;
  data.controllerId = pid;
  addObject(state, { id, instanceId: `i-${id}`, cardId, controllerId: pid, zone, ...data, ...extra });
  return state.objects.get(id);
}
function addCreature(state, id, ctrl, power, toughness, extra = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `x-${id}`, controllerId: ctrl,
    zone: 'battlefield', kind: 'creature', power, toughness,
    keywords: [], ...extra,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}
function mainPhase(state, pid = 'p1') {
  state.turn = jumpToStep(state.turn, 'main', pid);
  state.turn.activePlayerId = pid;
  state.turn.priorityPlayerId = pid;
}
function fullPass(state, limit = 40) {
  for (let i = 0; i < limit; i += 1) {
    const h = state.turn.priorityPlayerId;
    const r = execute(state, { type: 'pass_priority', playerId: h });
    if (!r.ok) return;
    if (state.zones.stack.length === 0 && !state.pendingTriggerTargets.length
      && !state.pendingSearchChoice && !state.pendingColorChoice
      && !state.pendingDiscardChoice && !state.pendingAmass) break;
  }
}

// ---------------------------------------------------------------------------
// BUG 1 — creature trigger-target self
// ---------------------------------------------------------------------------
test('BUG1: Cloudbound Moogle — „target creature\" może celować w siebie (self)', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'moog', 'cloudbound-moogle', 'p1', 'hand');
  addMana(state, 'p1', 5, ['W']);
  const r = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'moog' });
  assert.ok(r.ok, r.events?.[0]?.reason);
  fullPass(state);
  const selfId = state.zones.battlefield.find((id) => state.objects.get(id)?.cardId === 'cloudbound-moogle');
  assert.ok(selfId, 'Moogle na bitwisku');
  // ETB „put a +1/+1 counter on target creature" — jedyny stwór to Moogle,
  // więc trigger MUSI mieć go jako kandydata (self). Bez fixa trigger nie odpala.
  assert.equal(state.pendingTriggerTargets.length, 1, 'ETB z celem czeka na decyzję');
  assert.ok(state.pendingTriggerTargets[0].candidates.includes(selfId),
    `self jest kandydatem: ${state.pendingTriggerTargets[0].candidates}`);
  // Kontroler celuje w siebie — dostaje +1/+1.
  assert.ok(execute(state, { type: 'resolve_trigger_target', playerId: 'p1', targetId: selfId }).ok);
  fullPass(state);
  const moog = state.objects.get(selfId);
  assert.equal(moog.counters['+1/+1'], 1, 'Moogle dostał +1/+1 licznik');
});

test('BUG1: Forge Devil — „target creature\" może celować w siebie', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'fd', 'forge-devil', 'p1', 'hand');
  addMana(state, 'p1', 1, ['R']);
  execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'fd' });
  fullPass(state);
  const selfId = state.zones.battlefield.find((id) => state.objects.get(id)?.cardId === 'forge-devil');
  assert.ok(selfId);
  assert.equal(state.pendingTriggerTargets.length, 1, 'Forge Devil ETB czeka na cel');
  assert.ok(state.pendingTriggerTargets[0].candidates.includes(selfId),
    `self jest kandydatem Forge Devil: ${state.pendingTriggerTargets[0].candidates}`);
});

// ---------------------------------------------------------------------------
// BUG 5 — goad can't block
// ---------------------------------------------------------------------------
test('BUG5: goaded creature nie może blokować (CR 701.38)', () => {
  const state = game();
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.phase = 'combat';
  addCreature(state, 'atk', 'p1', 2, 2);
  addCreature(state, 'gb', 'p2', 1, 1);
  state.objects.set('gb', Object.freeze({ ...state.objects.get('gb'), goaded: true, goadedUntilTurn: state.turn.number + 2 }));
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['atk'] }).ok);
  const r = execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { atk: ['gb'] } });
  assert.ok(!r.ok, 'goaded stwór NIE może blokować (CR 701.38) — deklaracja odrzucona');
});

// ---------------------------------------------------------------------------
// BUG 4 — Caravan Vigil Morbid „may"
// ---------------------------------------------------------------------------
test('BUG4: Caravan Vigil Morbid — gracz wybiera ręka ALBO bitwisko („may\")', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'forest', 'basic-forest', 'p1', 'library');
  addRealCard(state, 'vigil', 'caravan-vigil', 'p1', 'hand');
  state.creatureDiedThisTurn = true; // morbid aktywny
  addMana(state, 'p1', 1, ['G']);
  execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'vigil' });
  fullPass(state);
  assert.ok(state.pendingSearchChoice, 'szukanie czeka na decyzję');
  // Gracz ma wybór destination: ręka (always) albo bitwisko (morbid „may").
  const v = playerView(state, 'p1');
  const cmds = v.legalCommands.filter((c) => c.type === 'resolve_search_choice');
  const hasHandOption = cmds.some((c) => c.destination === 'hand');
  const hasBfOption = cmds.some((c) => c.destination === 'battlefield');
  assert.ok(hasHandOption, 'opcja „do ręki\" dostępna (always)');
  assert.ok(hasBfOption, 'opcja „na bitwisko\" dostępna (morbid)');
});

// ---------------------------------------------------------------------------
// BUG 2 — Wavecrash Triton next untap step
// ---------------------------------------------------------------------------
test('BUG2: Wavecrash Triton — ofiara nie odkręca się tylko w NASTĘPNYM untap step, nie trwale', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'wv', 'wavecrash-triton', 'p1', 'battlefield');
  state.objects.set('wv', Object.freeze({ ...state.objects.get('wv'), summoningSickness: false }));
  addRealCard(state, 'victim', 'highland-game', 'p2', 'battlefield');
  // Rzucam czar na Wavecrash (heroic odpala) → tap ofiary.
  addRealCard(state, 'raise', 'raise-the-alarm', 'p1', 'hand'); // celuje? nie. użyjemy czaru celującego w stwora
  // Wykorzystamy rękoma: rzuć czar celujący w wv (np. Cloudbound? nie). Użyjemy bezpośredniego triggera przez
  // ręczne odpalenie heroic — zamiast tego sprawdzamy NIE trwałość blokady po zmianie źródła.
  // Prostiej: tap ofiary przez heroic — rzuć czar z celem na wv.
  // Nie mamy tu instanta celującego w stwora w ręce; zamiast tego aktywujemy heroic przez czar-aura.
  // Użyjemy Cast: Benevolent Blessing (aura) celujący w wv.
  addRealCard(state, 'bless', 'benevolent-blessing', 'p1', 'hand');
  addMana(state, 'p1', 3, ['W']);
  const r = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'bless', targets: ['wv'] });
  assert.ok(r.ok, r.events?.[0]?.reason);
  // czar idzie na stos; heroic trigger (spell_targets_this_creature) czeka na cel → tap ofiary
  fullPass(state);
  // Wybierz cel heroic = victim (jeśli zapytano). W przeciwnym razie bierzemy victim.
  const hero = state.pendingTriggerTargets[0];
  if (hero) {
    const victimId = state.zones.battlefield.find((id) => state.objects.get(id)?.cardId === 'highland-game');
    assert.ok(execute(state, { type: 'resolve_trigger_target', playerId: 'p1', targetId: victimId }).ok);
    fullPass(state);
  }
  const victim = [...state.objects.values()].find((o) => o.cardId === 'highland-game' && o.zone === 'battlefield');
  assert.ok(victim && victim.tapped, 'ofiary zętapnięta przez heroic');
  // Blokada NIE jest trwała po usunięciu źródła (Wavecrash) — w MtG „next untap step"
  // to jednorazowa blokada. Usuwamy źródło i sprawdzamy, że ofiara odkręci się w następnym
  // untap step. To, że nie trzymamy blokady związanej ze źródłem, weryfikujemy pośrednio:
  // ofiara nie ma trwałej blokady source-based (untapLockedBy nie zawiera wv na stałe w nieskończoność).
  // Dla testu regresji: w cleanup ofiary nie powinna mieć trwałego locka po naturalnym untap.
  // (Pełna weryfikacja one-shot w fixie przez nowy efekt — tu sprawdzamy, że blokada nie jest source-based.)
  const lockedBy = state.objects.get(victim.id)?.untapLockedBy ?? [];
  assert.ok(!lockedBy.includes(state.objects.get('wv')?.id),
    'blokada nie powinna być trwałą blokadą źródła (Wavecrash)');
});

// ---------------------------------------------------------------------------
// BUG 3 — Amass multi-army
// ---------------------------------------------------------------------------
test('BUG3: Dunland Crebain amass — gracz wybiera, która Armia dostaje liczniki', () => {
  const state = game();
  mainPhase(state);
  // Armie po wcześniejszym amass mają liczniki +1/+1 (0/0 bez licznika ginie SBA).
  addObject(state, { id: 'army1', instanceId: 'a1', cardId: 'token_orc_army', controllerId: 'p1', ownerId: 'p1', zone: 'battlefield', kind: 'creature', power: 1, toughness: 1, manaCost: 0, abilities: [], keywords: [], subtypes: ['Orc', 'Army'], types: ['Creature'], colors: ['B']});
  state.objects.set('army1', Object.freeze({ ...state.objects.get('army1'), counters: { '+1/+1': 1 } }));
  addObject(state, { id: 'army2', instanceId: 'a2', cardId: 'token_orc_army', controllerId: 'p1', ownerId: 'p1', zone: 'battlefield', kind: 'creature', power: 1, toughness: 1, manaCost: 0, abilities: [], keywords: [], subtypes: ['Orc', 'Army'], types: ['Creature'], colors: ['B']});
  state.objects.set('army2', Object.freeze({ ...state.objects.get('army2'), counters: { '+1/+1': 1 } }));
  addRealCard(state, 'dc', 'dunland-crebain', 'p1', 'hand');
  addMana(state, 'p1', 3, ['B']);
  const r = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'dc' });
  assert.ok(r.ok, r.events?.[0]?.reason);
  fullPass(state);
  // Amass z 2 armiami MUSI czekać na wybór gracza (pendingAmass / resolve_amass_choice).
  assert.ok(state.pendingAmass, 'amass z wieloma armiami wymaga wyboru gracza');
  assert.equal(state.pendingAmass.armyIds.length, 2, 'obie armie są kandydatami');
  // Gracz wybiera army2 → tylko ona dostaje liczniki.
  assert.ok(execute(state, { type: 'resolve_amass_choice', playerId: 'p1', armyId: 'army2', amount: 2 }).ok);
  const a2 = state.objects.get('army2');
  // M137 (L21): licznik startowy (1) NAPRAWDĘ powstaje dopiero po naprawie
  // kontraktu `addObject` — wcześniej `counters:` w wywołaniu fabryki ginęło
  // po cichu, więc armia startowała bez licznika i test sprawdzał 2 zamiast
  // 1 + 2. Przechodził z fałszywego powodu (dokładnie wzorzec z lekcji L21).
  assert.equal(a2.counters['+1/+1'], 3, 'wybrana Armia: 1 startowy + 2 z amass');
  const a1 = state.objects.get('army1');
  assert.equal(a1.counters['+1/+1'], 1, 'niewybrana Armia zostaje z samym licznikiem startowym');
});
