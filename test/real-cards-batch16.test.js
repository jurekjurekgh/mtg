import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { effectivePower, effectiveToughness, effectiveKeywords } from '../src/engine/permanents.js';
import { createBattlefieldToken } from '../src/engine/tokens.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

/**
 * Batch 16 realnych kart (ADR 0010 §2a) — 10 kart:
 * - Alaborn Trooper (P02): vanilla 2/3
 * - Wedgelight Rammer (EOE): Station — artefakt → artefaktowy stwór 9+
 * - Jill, Shiva's Dominant // Shiva, Warden of Ice (FIN): DFC + Saga
 * - Ethersworn Shieldmage (ARB): flash + prewencja obrażeń artifact creatures
 * - Fiery Fall (MM2): 5 dmg + Basic landcycling
 * - Plague Reaver (CMR): end-step masowe poświęcenie + ping-pong kontroli
 * - Greatsword of Tyr (CLB): trigger „whenever equipped creature attacks"
 * - Ramroller (ORI): „attacks each combat if able" + statyczny +2/+0
 * - Marut (CLB): ETB liczy manę wydaną ze Skarbów
 * - Stoic Rebuttal (SOM): Metalcraft + „Counter target spell"
 *
 * Dane Oracle: docs/cards/scryfall-*.json.
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
  return state;
}

/** Ustawia automat tury na krok `step` z poprawnym stepIndex (TURN_STEPS). */
function jumpStep(state, playerId, phase, step, stepIndex, turnNumber = 1) {
  state.turn = { ...state.turn, number: turnNumber, activePlayerId: playerId, priorityPlayerId: playerId, phase, step, stepIndex, passes: 0 };
  return state;
}

function addRealCard(state, id, cardId, controllerId, zone, opts = {}) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, spell: data.spell, abilities: data.abilities ?? [],
    morph: data.morph ?? null, plot: data.plot ?? null, plotted: data.plotted ?? false,
    entersWithCounters: data.entersWithCounters ?? null,
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [], types: def.types ?? [],
    colors: data.colors ?? [], bestow: data.bestow ?? null, aura: data.aura ?? null,
    enchantPlayer: data.enchantPlayer ?? false,
    equipment: opts.equipment ?? data.equipment ?? null,
    entersTapped: data.entersTapped ?? false,
    entersTappedCondition: data.entersTappedCondition ?? null,
    saga: data.saga ?? null, station: data.station ?? null,
    transformTo: opts.transformTo ?? data.transformTo ?? null,
  });
  if (opts.tapped || opts.summoningSickness) {
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), tapped: !!opts.tapped, summoningSickness: !!opts.summoningSickness }));
  }
  return state.objects.get(id);
}

/** Transform z pełnymi danymi drugiej strony (jak createCardDeck). */
function addDfcCard(state, id, cardId, controllerId, zone) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  const back = REGISTRY.get(def.transformTo);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, spell: data.spell, abilities: data.abilities ?? [],
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [], types: def.types ?? [],
    colors: data.colors ?? [],
    transformTo: {
      cardId: back.id,
      power: back.power, toughness: back.toughness,
      abilities: back.abilities ?? [], keywords: back.keywords ?? [],
      subtypes: back.subtypes ?? [], types: back.types ?? [],
      manaCost: back.manaCost ?? 0,
      ...(back.saga ? { saga: back.saga } : {}),
    },
  });
  return state.objects.get(id);
}

function addCreature(state, id, controllerId, power, toughness, keywords = [], manaCost = 1, colors = []) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'highland-game', controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost,
    abilities: [], keywords, subtypes: [], types: ['Creature'], colors,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

function addArtifactCreature(state, id, controllerId, power, toughness, keywords = [], manaCost = 2) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'esper-stormblade', controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost,
    abilities: [], keywords, subtypes: [], types: ['Artifact', 'Creature'], colors: ['W', 'U'],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

function addArtifact(state, id, controllerId, manaCost = 2, colors = []) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'syn-mystery', controllerId, zone: 'battlefield',
    kind: 'artifact', manaCost, abilities: [], keywords: [], subtypes: [], types: ['Artifact'], colors,
  });
  return state.objects.get(id);
}

function addBasicLand(state, id, controllerId, subtype = 'Plains', color = 'W', tapped = false) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `basic-${subtype.toLowerCase()}`, controllerId, zone: 'battlefield',
    kind: 'land', abilities: [], keywords: [], subtypes: [subtype], types: ['Basic', 'Land'], colors: [color],
  });
  if (tapped) state.objects.set(id, Object.freeze({ ...state.objects.get(id), tapped: true }));
  return state.objects.get(id);
}

function addLibraryCard(state, id, controllerId, { cardId = 'shatter', types = ['Instant'], subtypes = [], kind = 'spell', manaCost = 2 } = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, zone: 'library',
    kind, manaCost, spell: kind === 'spell' ? REGISTRY.get(cardId).spell : null,
    abilities: [], keywords: [], subtypes, types, colors: [],
  });
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

function hasCommand(view, type, predicate = () => true) {
  return view.legalCommands.some((c) => c.type === type && predicate(c));
}

function eventsOfType(state, type) {
  return state.events.filter((e) => e.type === type);
}

// =============================================================================
// Data sanity
// =============================================================================

test('Batch 16: wszystkie karty mają dane, artId i status supported', () => {
  const ids = ['alaborn-trooper', 'wedgelight-rammer', 'jill-shivas-dominant',
    'ethersworn-shieldmage', 'fiery-fall', 'plague-reaver', 'greatsword-of-tyr',
    'ramroller', 'marut', 'stoic-rebuttal'];
  for (const id of ids) {
    const def = REGISTRY.get(id);
    assert.ok(def, `Brak definicji: ${id}`);
    assert.equal(def.support.status, 'supported', `${id}: nie supported`);
    assert.ok(def.artId, `${id}: brak artId`);
    assert.ok(def.imageUri, `${id}: brak imageUri`);
    assert.ok(def.plan, `${id}: brak planu`);
  }
  // Karty tekstowe (vanilla ma pusty oracleText — jak Goblin Piker).
  assert.equal(REGISTRY.get('alaborn-trooper').oracleText, '');
  assert.ok(REGISTRY.get('jill-shivas-dominant').oracleText.includes('{3}{U}{U}'));
});

test('Batch 16: Shiva (tył DFC) i token Robot są limited (nie taliowalne)', () => {
  assert.equal(REGISTRY.get('shiva-warden-of-ice').support.status, 'limited');
  assert.equal(REGISTRY.get('shiva-warden-of-ice').artId, 527);
  assert.equal(REGISTRY.get('token_robot').support.status, 'limited');
});

test('Batch 16: rozbudowane talie black i red przechodzą walidację singleton', async () => {
  const { parseDeckText } = await import('../src/cards/deck-text.js');
  const { validateDeck } = await import('../src/cards/deck-validation.js');
  for (const file of ['black.txt', 'red.txt', 'azorius.txt', 'wiedzmin.txt']) {
    const parsed = parseDeckText(fs.readFileSync(`decks/${file}`, 'utf8'), REGISTRY);
    const result = validateDeck(parsed.cardIds, REGISTRY);
    assert.ok(result.valid, `Talia ${file} nieprawidłowa: ${(result.errors || []).join(', ')}`);
  }
});

// =============================================================================
// Alaborn Trooper — vanilla 2/3
// =============================================================================

test('Alaborn Trooper: wchodzi za {2}{W} jako 2/3', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'trooper', 'alaborn-trooper', 'p1', 'hand');
  addMana(state, 'p1', 3);
  const rCast1 = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'trooper' });
  assert.ok(rCast1.ok);
  resolveStack(state);
  const obj = state.objects.get(findId(state, 'alaborn-trooper'));
  assert.equal(obj.kind, 'creature');
  assert.equal(effectivePower(obj, state), 2);
  assert.equal(effectiveToughness(obj, state), 3);
});

test('Alaborn Trooper: niedostępny przy 2 manie', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'trooper', 'alaborn-trooper', 'p1', 'hand');
  addMana(state, 'p1', 2);
  assert.ok(!hasCommand(playerView(state, 'p1'), 'cast_permanent', (c) => c.objectId === 'trooper'));
});

// =============================================================================
// Wedgelight Rammer — Station
// =============================================================================

test('Wedgelight Rammer: ETB tworzy token Robot 2/2 (artefaktowy stwór)', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'rammer', 'wedgelight-rammer', 'p1', 'hand');
  addMana(state, 'p1', 4);
  const rCast2 = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'rammer' });
  assert.ok(rCast2.ok);
  resolveStack(state);
  const robotId = findId(state, 'token_robot');
  assert.ok(robotId, 'Robot powinien wejść na bitwisko');
  const robot = state.objects.get(robotId);
  assert.equal(robot.kind, 'creature');
  assert.ok(robot.types.includes('Artifact'), 'Robot jest artefaktem');
  assert.equal(robot.power, 2);
});

test('Wedgelight Rammer: poniżej progu NIE jest stworem (kind artifact, bez ataku)', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'rammer', 'wedgelight-rammer', 'p1', 'battlefield');
  state.objects.set('rammer', Object.freeze({ ...state.objects.get('rammer'), counters: { charge: 3 } }));
  assert.equal(state.objects.get('rammer').kind, 'artifact');
  assert.ok(!effectiveKeywords(state.objects.get('rammer'), state).includes('flying'));
  // Rammer nie może atakować — nie jest stworem.
  jumpStep(state, 'p1', 'combat', 'declare_attackers', 5);
  const view = playerView(state, 'p1');
  assert.ok(!view.legalCommands.some((c) => c.type === 'declare_attackers' && (c.attackerIds ?? []).includes('rammer')));
});

test('Wedgelight Rammer: Station tapuje INNEGO stwora i kładzie charge = jego moc', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'rammer', 'wedgelight-rammer', 'p1', 'battlefield');
  addCreature(state, 'cre', 'p1', 4, 4);
  // abilityIndex 1 = station (0 = ETB trigger).
  const r = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'rammer', abilityIndex: 1 });
  assert.ok(r.ok, r.events?.map((e) => e.reason).join(''));
  assert.ok(state.objects.get('cre').tapped, 'Inny stwór zatapnięty w koszcie');
  // D (2026-08-11): zdolność aktywowana idzie na stos — efekt po rozstrzygnięciu.
  resolveStack(state);
  assert.equal(state.objects.get('rammer').counters.charge, 4, 'Charge = moc zatapniętego stwora');
  assert.equal(state.objects.get('rammer').kind, 'artifact', 'Nadal poniżej progu 9');
});

test('Wedgelight Rammer: przy 9+ staje się artefaktowym stworem z flying i first strike', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'rammer', 'wedgelight-rammer', 'p1', 'battlefield');
  addCreature(state, 'mid', 'p1', 4, 4);
  state.objects.set('rammer', Object.freeze({ ...state.objects.get('rammer'), counters: { charge: 5 } }));
  const r = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'rammer', abilityIndex: 1 });
  assert.ok(r.ok);
  // D (2026-08-11): zdolność aktywowana idzie na stos — efekt po rozstrzygnięciu.
  resolveStack(state);
  const rammer = state.objects.get('rammer');
  assert.equal(rammer.counters.charge, 9, '5 + 4 mocy = 9 liczników');
  assert.equal(rammer.kind, 'creature', 'Spacecraft jest teraz stworem');
  assert.ok(effectiveKeywords(rammer, state).includes('flying'), '9+ | flying');
  assert.ok(effectiveKeywords(rammer, state).includes('first_strike'), '9+ | first strike');
  assert.equal(effectivePower(rammer, state), 3);
  assert.equal(effectiveToughness(rammer, state), 4);
  // Zdarzenie przejścia przez próg dla logu/UI.
  assert.ok(eventsOfType(state, 'station_status_changed').some((e) => e.becameCreature === true && e.chargeCounters === 9));
});

test('Wedgelight Rammer: station to sorcery — niedostępne w kroku walki', () => {
  const state = game();
  addRealCard(state, 'rammer', 'wedgelight-rammer', 'p1', 'battlefield');
  addCreature(state, 'cre', 'p1', 4, 4);
  jumpStep(state, 'p1', 'combat', 'declare_attackers', 5);
  assert.ok(!hasCommand(playerView(state, 'p1'), 'activate_ability', (c) => c.objectId === 'rammer'));
});

test('Wedgelight Rammer: station niedostępne bez innego nietapniętego stwora', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'rammer', 'wedgelight-rammer', 'p1', 'battlefield');
  assert.ok(!hasCommand(playerView(state, 'p1'), 'activate_ability', (c) => c.objectId === 'rammer'));
});

// =============================================================================
// Jill // Shiva — transform DFC + Saga
// =============================================================================

test('Jill: ETB zwraca najsilniejszy permanent nie-land PRZECIWNIKA do ręki', () => {
  const state = game();
  mainPhase(state);
  addCreature(state, 'foe-big', 'p2', 4, 4);
  addCreature(state, 'foe-small', 'p2', 1, 1);
  addDfcCard(state, 'jill', 'jill-shivas-dominant', 'p1', 'hand');
  addMana(state, 'p1', 3);
  const rCast = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'jill' })
;
  resolveStack(state);
assert.ok(rCast.ok, rCast.events?.map((e) => e.reason).join(''));
  // Temat 2: „up to one other nonland permanent" — kontroler wybiera 4/4.
  assert.ok(execute(state, { type: 'resolve_trigger_target', playerId: 'p1', targetId: 'foe-big' }).ok);
  passBoth(state); // T6: rozstrzygnij trigger ze stosu
  assert.ok(!state.objects.get('foe-big') || state.objects.get('foe-big').zone !== 'battlefield', 'Najsilniejszy stwór przeciwnika zniknął z bitwiska');
  assert.equal(state.objects.get(findId(state, 'highland-game', 'hand'))?.zone, 'hand', 'Wrócił na rękę');
  assert.ok(state.objects.get('foe-small').zone === 'battlefield', 'Słabszy zostaje');
});

test('Jill: „up to one\" — bez permanentu przeciwnika nic nie zwraca', () => {
  const state = game();
  mainPhase(state);
  addDfcCard(state, 'jill', 'jill-shivas-dominant', 'p1', 'hand');
  addMana(state, 'p1', 3);
  const rCast3 = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'jill' });
  assert.ok(rCast3.ok);
  resolveStack(state);
  assert.ok(findId(state, 'jill-shivas-dominant'), 'Jill weszła normalnie');
});

test('Jill: nie zwraca własnych permanentów ani landów', () => {
  const state = game();
  mainPhase(state);
  addCreature(state, 'own', 'p1', 5, 5);
  addBasicLand(state, 'land', 'p2', 'Plains');
  addDfcCard(state, 'jill', 'jill-shivas-dominant', 'p1', 'hand');
  addMana(state, 'p1', 3);
  const rCast4 = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'jill' });
  assert.ok(rCast4.ok);
  resolveStack(state);
  assert.ok(state.objects.get('own').zone === 'battlefield', 'Własny stwór bezpieczny');
  assert.ok(state.objects.get('land').zone === 'battlefield', 'Land przeciwnika bezpieczny');
});

test('Jill: {3}{U}{U},{T} wygania i zwraca przemienioną jako Shiva z rozdziałem I', () => {
  const state = game();
  mainPhase(state);
  addDfcCard(state, 'jill', 'jill-shivas-dominant', 'p1', 'battlefield');
  addMana(state, 'p1', 5);
  // abilityIndex 1 = exile+return transformed (0 = ETB bounce).
  const r = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'jill', abilityIndex: 1 });
  assert.ok(r.ok, r.events?.map((e) => e.reason).join(''));
  // D (2026-08-11): zdolność aktywowana idzie na stos — transform po rozstrzygnięciu.
  resolveStack(state);
  // Temat 2 dla Sag: rozdział I (Mesmerize) ma requiresTarget — kolejkuje
  // decyzję CELU (resolve_trigger_target) zamiast iść od razu na stos.
  // Jedyny własny stwór to sama Shiva — kontroler ją wskazuje.
  const shivaId = findId(state, 'shiva-warden-of-ice');
  assert.ok(shivaId, 'Shiva powinna być na bitwisku po transformacji');
  assert.equal(state.pendingTriggerTargets.length, 1, 'decyzja celu Mesmerize czeka');
  const pending = state.pendingTriggerTargets[0];
  assert.equal(pending.playerId, 'p1');
  assert.equal(pending.sourceId, shivaId);
  assert.deepEqual(pending.candidates, [shivaId], 'kandydat: sama Shiva');
  // Wybór celu + rozstrzygnięcie rozdziału ze stosu (T6).
  assert.ok(execute(state, { type: 'resolve_trigger_target', playerId: 'p1', targetId: shivaId }).ok);
  passBoth(state); // T6: rozdział I Sagi ze stosu
  const shiva = state.objects.get(shivaId);
  assert.equal(shiva.power, 4);
  assert.equal(shiva.toughness, 5);
  assert.ok(shiva.types.includes('Enchantment'), 'Legendary Enchantment Creature');
  assert.equal(shiva.counters.lore, 1, 'Wejście Sagi kładzie licznik lore (CR 714.3a)');
  // Rozdział I (Mesmerize): Shiva wybrana jako cel — nie może być blokowana w tej turze.
  assert.ok(shiva.cantBlock === true, 'Mesmerize: wybrany cel oznaczony unblockable');
  assert.ok(eventsOfType(state, 'saga_chapter_fired').some((e) => e.chapter === 1));
  // Jill nie leży w grozie ani exile — karta przemieniła się (nowy obiekt).
  assert.equal(countByCardId(state, 'jill-shivas-dominant', 'graveyard'), 0);
  assert.ok(eventsOfType(state, 'object_transformed').some((e) => e.cardId === 'shiva-warden-of-ice'));
});

test('Shiva: kolejne liczniki lore po kroku dobierania kontrolera odpalają rozdziały II i III', () => {
  const state = game();
  mainPhase(state);
  addDfcCard(state, 'jill', 'jill-shivas-dominant', 'p1', 'battlefield');
  addMana(state, 'p1', 5);
  execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'jill', abilityIndex: 1 });
  // D (2026-08-11): zdolność aktywowana idzie na stos — transform po rozstrzygnięciu.
  resolveStack(state);
  const shivaId = findId(state, 'shiva-warden-of-ice');
  assert.ok(shivaId);
  // Temat 2 dla Sag (Mesmerize): rozdział I kolejkuje decyzję CELU
  // (resolve_trigger_target) zanim w ogóle trafi na stos. Jedyny własny
  // stwór to sama Shiva — wskazujemy ją, a dopiero potem passBoth
  // rozstrzyga rozdział ze stosu.
  assert.equal(state.pendingTriggerTargets.length, 1, 'Mesmerize kolejkuje decyzję celu');
  assert.ok(execute(state, { type: 'resolve_trigger_target', playerId: 'p1', targetId: shivaId }).ok);
  // Przechodzimy do precombat main p1 (po kroku draw) — rozdział II.
  jumpStep(state, 'p2', 'ending', 'end', 10, 1);
  passBoth(state); // T6: rozdział I (z wejścia Sagi) ze stosu
  passBoth(state); // cleanup p2
  passBoth(state); // wrap → tura p1: untap (+turn_started)
  passBoth(state); // upkeep p1
  passBoth(state); // draw p1
  passBoth(state); // precombat_main p1 → licznik lore + rozdział II (kolejkuje cel)
  // Temat 2 dla Sag: rozdział II to też Mesmerize — kolejkuje decyzję CELU
  // (jedyny własny stwór to nadal sama Shiva).
  assert.equal(state.pendingTriggerTargets.length, 1, 'Mesmerize II kolejkuje decyzję celu');
  assert.ok(execute(state, { type: 'resolve_trigger_target', playerId: 'p1', targetId: shivaId }).ok);
  passBoth(state); // T6: rozdział II ze stosu
  assert.equal(state.objects.get(shivaId)?.counters?.lore, 2, 'Po draw step kontrolera: 2 liczniki lore');
  assert.ok(eventsOfType(state, 'saga_chapter_fired').some((e) => e.chapter === 2));
});

test('Shiva: rozdział III tapuje landy przeciwnika i zwraca Jill (bez poświęcenia Sagi)', () => {
  const state = game();
  mainPhase(state);
  addBasicLand(state, 'foe-land-1', 'p2', 'Swamp', 'B');
  addBasicLand(state, 'foe-land-2', 'p2', 'Island', 'U');
  addCreature(state, 'foe', 'p2', 3, 3);
  // Shiva na bitwisku bezpośrednio (jak po transformie) — z 2 licznikami lore.
  // Obiekt po stronie odwrotnej DFC zna stronę przednią (transformTo w drugą
  // stronę) — dokładnie tak buduje ją efekt exile_return_transformed.
  const jillDef = REGISTRY.get('jill-shivas-dominant');
  addRealCard(state, 'shiva', 'shiva-warden-of-ice', 'p1', 'battlefield', {
    transformTo: {
      cardId: 'jill-shivas-dominant',
      power: jillDef.power, toughness: jillDef.toughness,
      abilities: jillDef.abilities ?? [], keywords: jillDef.keywords ?? [],
      subtypes: jillDef.subtypes ?? [], types: jillDef.types ?? [],
      manaCost: jillDef.manaCost ?? 0,
    },
  });
  state.objects.set('shiva', Object.freeze({ ...state.objects.get('shiva'), counters: { lore: 2 }, summoningSickness: false }));
  // Wejście do precombat main p1 (po draw) → trzeci licznik → rozdział III.
  jumpStep(state, 'p1', 'beginning', 'draw', 2, 1);
  passBoth(state);
  // Temat 2: Jill (strona przednia) wchodzi z ETB „up to one" — cel wybiera
  // kontroler (jedyny nonland przeciwnika = foe).
  assert.ok(execute(state, { type: 'resolve_trigger_target', playerId: 'p1', targetId: 'foe' }).ok);
  passBoth(state); // T6: rozstrzygnij trigger ze stosu
  const jillId = findId(state, 'jill-shivas-dominant');
  assert.ok(jillId, 'Po rozdziale III Shiva wraca jako Jill (strona przednia)');
  assert.equal(countByCardId(state, 'shiva-warden-of-ice', 'graveyard'), 0, 'Saga NIE jest poświęcana — sama się przemieniła (CR 714.4 nie ma czego zjeść)');
  assert.ok(state.objects.get('foe-land-1').tapped, 'Landy przeciwnika zatapnięte (Cold Snap)');
  assert.ok(state.objects.get('foe-land-2').tapped, 'Landy przeciwnika zatapnięte (Cold Snap)');
  assert.ok(eventsOfType(state, 'saga_chapter_fired').some((e) => e.chapter === 3));
  // Jill powracająca odpala swój ETB („up to one other nonland permanent\") —
  // stwór przeciwnika wrócił na rękę jako NOWY obiekt (CR 400.7).
  assert.ok(!state.objects.get('foe') || state.objects.get('foe').zone !== 'battlefield', 'Stwór przeciwnika zniknął z bitwiska');
  assert.ok(findId(state, 'highland-game', 'hand'), 'Stwór przeciwnika odbity na rękę przez ETB Jill');
});

test('Jill: transformacja to sorcery — niedostępna poza własną main phase', () => {
  const state = game();
  addDfcCard(state, 'jill', 'jill-shivas-dominant', 'p1', 'battlefield');
  addMana(state, 'p1', 5);
  jumpStep(state, 'p1', 'combat', 'declare_attackers', 5);
  assert.ok(!hasCommand(playerView(state, 'p1'), 'activate_ability', (c) => c.objectId === 'jill'));
});

// =============================================================================
// Ethersworn Shieldmage — flash + prewencja obrażeń artifact creatures
// =============================================================================

test('Ethersworn Shieldmage: ETB włącza prewencję obrażeń dla artefaktowych stworów', () => {
  const state = game();
  mainPhase(state);
  addArtifactCreature(state, 'ac', 'p1', 2, 5);
  addCreature(state, 'plain', 'p1', 2, 2);
  addRealCard(state, 'mage', 'ethersworn-shieldmage', 'p2', 'hand');
  addMana(state, 'p2', 3);
  // Flash pozwala rzucić w turze przeciwnika, ale wciąż potrzebny jest
  // priorytet (CR 702.8a) — p1 pasuje, priorytet przechodzi na p2.
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  const rCast5 = execute(state, { type: 'cast_permanent', playerId: 'p2', objectId: 'mage' });
  assert.ok(rCast5.ok);
  resolveStack(state);
  assert.equal(state.preventDamageThisTurn.length, 1, 'Filtr prewencji aktywny');
  assert.ok(eventsOfType(state, 'damage_prevention_started').length === 1);
});

test('Ethersworn Shieldmage: obrażenia czaru do artefaktowego stwora kasowane do końca tury', () => {
  const state = game();
  mainPhase(state);
  addArtifactCreature(state, 'ac', 'p2', 2, 5);
  addCreature(state, 'plain', 'p2', 3, 3);
  addRealCard(state, 'mage', 'ethersworn-shieldmage', 'p2', 'battlefield');
  // Ręczna aktywacja filtra prewencji na tę turę (karta została dodana na
  // bitwisko bez rzutu, więc trigger ETB nie odpalił automatycznie).
  state.preventDamageThisTurn = [{ typesInclude: ['Artifact'], isCreature: true }];
  addRealCard(state, 'bolt', 'fiery-fall', 'p1', 'hand');
  addMana(state, 'p1', 6);
  const r = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'bolt', targets: ['ac'] });
  assert.ok(r.ok);
  passBoth(state);
  assert.equal(state.objects.get('ac').damage, 0, 'Artefaktowy stwór nie dostał obrażeń');
  assert.ok(eventsOfType(state, 'damage_prevented').some((e) => e.objectId === 'ac' && e.amount === 5));
  assert.ok(state.objects.get('ac').zone === 'battlefield', 'Żyje mimo 5 obrażeń');
});

test('Ethersworn Shieldmage: zwykły stwór nadal otrzymuje obrażenia (filtr tylko artifact)', () => {
  const state = game();
  mainPhase(state);
  addCreature(state, 'plain', 'p2', 3, 4);
  addRealCard(state, 'mage', 'ethersworn-shieldmage', 'p2', 'battlefield');
  state.preventDamageThisTurn = [{ typesInclude: ['Artifact'], isCreature: true }];
  addRealCard(state, 'bolt', 'fiery-fall', 'p1', 'hand');
  addMana(state, 'p1', 6);
  execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'bolt', targets: ['plain'] });
  passBoth(state);
  assert.equal(state.objects.get('plain'), undefined, 'Zwykły stwór zniszczony 5 obrażeniami');
});

test('Ethersworn Shieldmage: flash pozwala wejść poza własną main phase', () => {
  const state = game();
  addRealCard(state, 'mage', 'ethersworn-shieldmage', 'p2', 'hand');
  addMana(state, 'p2', 3);
  jumpStep(state, 'p1', 'combat', 'declare_attackers', 5, 1);
  state.turn.priorityPlayerId = 'p2';
  const rCast = execute(state, { type: 'cast_permanent', playerId: 'p2', objectId: 'mage' })
;
  resolveStack(state);
assert.ok(rCast.ok, rCast.events?.map((e) => e.reason).join(''));
  assert.ok(findId(state, 'ethersworn-shieldmage'), 'Weszła jak instant');
});

test('Ethersworn Shieldmage: prewencja chroni przed deathtouch (brak znacznika)', () => {
  const state = game();
  mainPhase(state);
  addArtifactCreature(state, 'ac', 'p2', 2, 1);
  addRealCard(state, 'mage', 'ethersworn-shieldmage', 'p2', 'battlefield');
  state.preventDamageThisTurn = [{ typesInclude: ['Artifact'], isCreature: true }];
  const attacker = addCreature(state, 'dt-attacker', 'p1', 5, 5, ['deathtouch']);
  // Walka: p1 atakuje deathtouchem, p2 blokuje artefaktowym stworem.
  jumpStep(state, 'p1', 'combat', 'declare_attackers', 5);
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: [attacker.id] }).ok);
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { [attacker.id]: ['ac'] } }).ok);
  assert.ok(execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' }).ok);
  const ac = state.objects.get('ac');
  assert.ok(ac && ac.zone === 'battlefield', 'Artefaktowy bloker przeżył');
  assert.equal(ac.damage, 0, 'Zero oznaczonych obrażeń');
  assert.ok(!ac.damagedByDeathtouch, 'Prewencja znosi też marker deathtouch (CR 702.4b)');
});

test('Ethersworn Shieldmage: prewencja wygasa w cleanup', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'mage', 'ethersworn-shieldmage', 'p2', 'battlefield');
  state.preventDamageThisTurn = [{ typesInclude: ['Artifact'], isCreature: true }];
  jumpStep(state, 'p1', 'ending', 'end', 10);
  passBoth(state); // cleanup
  assert.deepEqual(state.preventDamageThisTurn, [], 'Lista prewencji wyczyszczona');
});

// =============================================================================
// Fiery Fall — 5 dmg + Basic landcycling
// =============================================================================

test('Fiery Fall: zadaje 5 obrażeń docelowemu stworowi', () => {
  const state = game();
  mainPhase(state);
  // Cel 4/6: 5 obrażeń zostawia go przy życiu, więc możemy odczytać licznik.
  addCreature(state, 'victim', 'p2', 4, 6);
  addRealCard(state, 'fall', 'fiery-fall', 'p1', 'hand');
  addMana(state, 'p1', 6);
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'fall', targets: ['victim'] }).ok);
  passBoth(state);
  assert.equal(state.objects.get('victim').damage, 5);
});

test('Fiery Fall: basic landcycling {1}{R} szuka Basic Landu (nie zwykłego landa)', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'fall', 'fiery-fall', 'p1', 'hand');
  addLibraryCard(state, 'lib-campus', 'p1', { cardId: 'prismari-campus', types: ['Land'], subtypes: [], kind: 'land', manaCost: 0 });
  addLibraryCard(state, 'lib-plains', 'p1', { cardId: 'basic-plains', types: ['Basic', 'Land'], subtypes: ['Plains'], kind: 'land', manaCost: 0 });
  addMana(state, 'p1', 2);
  const r = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'fall', abilityIndex: 0 });
  assert.ok(r.ok, r.events?.map((e) => e.reason).join(''));
  assert.ok(state.zones.graveyard.includes(findId(state, 'fiery-fall', 'graveyard')), 'Karta odrzucona jako koszt');
  // Temat 6: typecycling — wybór karty z biblioteki (tylko Basic+Land).
  assert.ok(state.pendingSearchChoice, 'decyzja szukania czeka');
  const pick = execute(state, { type: 'resolve_search_choice', playerId: 'p1', found: 'lib-plains' });
  passBoth(state); // T6: rozstrzygnij trigger ze stosu
  assert.ok(pick.ok, pick.events[0]?.reason);
  const inHand = findId(state, 'basic-plains', 'hand');
  assert.ok(inHand, 'Plains trafił do ręki');
  assert.equal(findId(state, 'prismari-campus', 'hand'), null, 'Prismari Campus (nie-Basic) NIE jest trafieniem');
  assert.ok(eventsOfType(state, 'library_searched').some((e) => e.foundCardId === 'basic-plains'));
});

test('Fiery Fall: cycling niedostępny bez {1}{R}', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'fall', 'fiery-fall', 'p1', 'hand');
  addMana(state, 'p1', 1);
  assert.ok(!hasCommand(playerView(state, 'p1'), 'activate_ability', (c) => c.objectId === 'fall'));
});

// =============================================================================
// Plague Reaver — end-step mass sacrifice + ping-pong kontroli
// =============================================================================

test('Plague Reaver: w kroku end poświęca każde INNE stworzenie kontrolera', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'reaver', 'plague-reaver', 'p1', 'battlefield');
  addCreature(state, 'ally-1', 'p1', 2, 2);
  addCreature(state, 'ally-2', 'p1', 3, 3);
  addCreature(state, 'foe', 'p2', 2, 2);
  jumpStep(state, 'p1', 'postcombat_main', 'main', 9);
  passBoth(state); // step_advanced → ending/end → trigger
  assert.equal(state.objects.get('ally-1'), undefined, 'Inny stwór kontrolera poświęcony');
  assert.equal(state.objects.get('ally-2'), undefined, 'Inny stwór kontrolera poświęcony');
  assert.ok(state.objects.get('reaver'), 'Sam Reaver przeżył');
  assert.ok(state.objects.get('foe').zone === 'battlefield', 'Stwór przeciwnika nietknięty');
  assert.equal(eventsOfType(state, 'permanent_sacrificed').length, 2);
});

test('Plague Reaver: discard 2 + sacrifice → powrót w następnym upkeep celu-pod jego kontrolą', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'reaver', 'plague-reaver', 'p1', 'battlefield');
  addLibraryCardAsHand(state, 'h1', 'p1', 1);
  addLibraryCardAsHand(state, 'h2', 'p1', 2);
  assert.ok(hasCommand(playerView(state, 'p1'), 'activate_ability', (c) => c.objectId === 'reaver' && (c.targets ?? []).includes('p2')));
  const r = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'reaver', abilityIndex: 1, targets: ['p2'] });
  assert.ok(r.ok, r.events?.map((e) => e.reason).join(''));
  // Temat 4: koszt-discard to SEKWENCYJNE decyzje kontrolera (2 karty).
  assert.ok(state.pendingDiscardChoice, 'pierwsza decyzja kosztu czeka');
  assert.equal(state.pendingDiscardChoice.count, 2);
  assert.ok(execute(state, { type: 'resolve_discard_choice', playerId: 'p1', cardId: 'h1' }).ok);
  passBoth(state); // T6: rozstrzygnij trigger ze stosu
  assert.ok(state.pendingDiscardChoice, 'druga decyzja czeka');
  assert.ok(execute(state, { type: 'resolve_discard_choice', playerId: 'p1', cardId: 'h2' }).ok);
  passBoth(state); // T6: rozstrzygnij trigger ze stosu
  // Koszty: 2 karty odrzucone + Reaver poświęcony.
  assert.equal(state.objects.get('h1'), undefined, 'Karta 1 odrzucona');
  assert.equal(state.objects.get('h2'), undefined, 'Karta 2 odrzucona');
  const graveReaver = findId(state, 'plague-reaver', 'graveyard');
  assert.ok(graveReaver, 'Reaver w grobie po koszcie sacrifice');
  assert.ok(eventsOfType(state, 'delayed_trigger_armed').some((e) => e.playerId === 'p2'));
  // Przejście do następnego upkeep p2.
  jumpStep(state, 'p1', 'ending', 'end', 10, 1);
  passBoth(state); // cleanup p1
  passBoth(state); // wrap → tura p2 (untap + turn_started)
  passBoth(state); // upkeep p2 → opóźniony trigger (na stos)
  passBoth(state); // T6: rozstrzygnij opóźniony trigger ze stosu
  const back = findId(state, 'plague-reaver');
  assert.ok(back, 'Reaver wrócił na bitwisko z grobu');
  assert.equal(state.objects.get(back).controllerId, 'p2', 'Pod kontrolą wybranego przeciwnika');
  assert.ok(state.objects.get(back).summoningSickness, 'Wchodzi z chorobą przywołania');
  assert.ok(eventsOfType(state, 'control_changed').some((e) => e.cardId === 'plague-reaver' && e.controllerId === 'p2'));
});

test('Plague Reaver: zdolność niedostępna bez dwóch kart w ręce', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'reaver', 'plague-reaver', 'p1', 'battlefield');
  addLibraryCardAsHand(state, 'h1', 'p1', 1);
  assert.ok(!hasCommand(playerView(state, 'p1'), 'activate_ability', (c) => c.objectId === 'reaver' && c.abilityIndex === 1));
});

/** Karta w ręce o zadanym manaCost (filler do kosztu discard). */
function addLibraryCardAsHand(state, id, controllerId, manaCost) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'shatter', controllerId, zone: 'hand',
    kind: 'spell', manaCost, spell: REGISTRY.get('shatter').spell,
    abilities: [], keywords: [], subtypes: [], types: ['Instant'], colors: ['R'],
  });
  return state.objects.get(id);
}

// =============================================================================
// Greatsword of Tyr — trigger „whenever equipped creature attacks"
// =============================================================================

test('Greatsword of Tyr: equip {W} załącza do własnego stwora (sorcery)', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'sword', 'greatsword-of-tyr', 'p1', 'battlefield');
  addCreature(state, 'knight', 'p1', 2, 2);
  addMana(state, 'p1', 1);
  // abilityIndex 1 = equip (0 = trigger ataku).
  const r = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'sword', abilityIndex: 1, targets: ['knight'] });
  assert.ok(r.ok, r.events?.map((e) => e.reason).join(''));
  assert.equal(state.objects.get('sword').attachedTo, 'knight');
});

test('Greatsword of Tyr: atak nosiciela → licznik +1/+1 na nim i tap stwora obrońcy', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'sword', 'greatsword-of-tyr', 'p1', 'battlefield');
  const knight = addCreature(state, 'knight', 'p1', 2, 2);
  addCreature(state, 'guard', 'p2', 5, 5);
  addCreature(state, 'small', 'p2', 1, 1);
  addMana(state, 'p1', 1);
  execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'sword', abilityIndex: 1, targets: ['knight'] });
  jumpStep(state, 'p1', 'combat', 'declare_attackers', 5);
  const r = execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: [knight.id] });
  assert.ok(r.ok, r.events?.map((e) => e.reason).join(''));
  // Temat 2: „up to one target creature defending player controls" —
  // kontroler wybiera najsilniejszego obrońcę (guard).
  assert.ok(execute(state, { type: 'resolve_trigger_target', playerId: 'p1', targetId: 'guard' }).ok);
  passBoth(state); // T6: rozstrzygnij trigger ze stosu
  assert.equal(state.objects.get('knight').counters['+1/+1'], 1, 'Nosiciel dostał licznik +1/+1');
  assert.ok(state.objects.get('guard').tapped, 'Najsilniejszy stwór obrońcy zatapnięty');
  assert.ok(!state.objects.get('small').tapped, 'Słabszy stwór obrońcy nietapnięty');
});

test('Greatsword of Tyr: bez stwora obrońcy „up to one\" nie tapuje, licznik ląduje', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'sword', 'greatsword-of-tyr', 'p1', 'battlefield');
  const knight = addCreature(state, 'knight', 'p1', 2, 2);
  addMana(state, 'p1', 1);
  execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'sword', abilityIndex: 1, targets: ['knight'] });
  jumpStep(state, 'p1', 'combat', 'declare_attackers', 5);
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: [knight.id] }).ok);
  // Temat 2: „up to one" — brak obrońcy, kontroler odmawia (null).
  assert.ok(execute(state, { type: 'resolve_trigger_target', playerId: 'p1', targetId: null }).ok);
  passBoth(state); // T6: rozstrzygnij trigger ze stosu
  assert.equal(state.objects.get('knight').counters['+1/+1'], 1);
});

test('Greatsword of Tyr: equip niedostępny poza main phase', () => {
  const state = game();
  addRealCard(state, 'sword', 'greatsword-of-tyr', 'p1', 'battlefield');
  addCreature(state, 'knight', 'p1', 2, 2);
  addMana(state, 'p1', 1);
  jumpStep(state, 'p1', 'combat', 'declare_attackers', 5);
  assert.ok(!hasCommand(playerView(state, 'p1'), 'activate_ability', (c) => c.objectId === 'sword'));
});

// =============================================================================
// Ramroller — „attacks each combat if able" + statyczny +2/+0
// =============================================================================

test('Ramroller: +2/+0 tylko gdy kontroler ma INNY artefakt', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'ram', 'ramroller', 'p1', 'battlefield');
  assert.equal(effectivePower(state.objects.get('ram'), state), 2, 'Bez innego artefaktu 2/3');
  addArtifact(state, 'art', 'p1', 2);
  assert.equal(effectivePower(state.objects.get('ram'), state), 4, '+2/+0 z innym artefaktem');
  assert.equal(effectiveToughness(state.objects.get('ram'), state), 3);
});

test('Ramroller: deklaracja ataku BEZ niego jest odrzucana („attacks each combat if able\")', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'ram', 'ramroller', 'p1', 'battlefield');
  state.objects.set('ram', Object.freeze({ ...state.objects.get('ram'), summoningSickness: false }));
  const other = addCreature(state, 'other', 'p1', 2, 2);
  jumpStep(state, 'p1', 'combat', 'declare_attackers', 5);
  const r = execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: [other.id] });
  assert.ok(!r.ok, 'Pominięcie Ramrollera jest nielegalne');
  const r2 = execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: [other.id, 'ram'] });
  assert.ok(r2.ok, 'Z Ramrollerem wśród atakujących jest legalnie');
});

test('Ramroller: choroba przywołania zwalnia go z wymogu (if able)', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'ram', 'ramroller', 'p1', 'battlefield', { summoningSickness: true });
  jumpStep(state, 'p1', 'combat', 'declare_attackers', 5);
  const options = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'declare_attackers');
  assert.ok(options.every((c) => !(c.attackerIds ?? []).includes('ram')), 'Chory Ramroller nie atakuje');
});

test('Ramroller: każda opcja deklaracji z legalCommands zawiera zdrowego Ramrollera', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'ram', 'ramroller', 'p1', 'battlefield');
  state.objects.set('ram', Object.freeze({ ...state.objects.get('ram'), summoningSickness: false }));
  addCreature(state, 'other', 'p1', 2, 2);
  jumpStep(state, 'p1', 'combat', 'declare_attackers', 5);
  const options = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'declare_attackers');
  assert.ok(options.length > 1, 'Są warianty (sam Ramroller / z innym)');
  assert.ok(options.every((c) => (c.attackerIds ?? []).includes('ram')), 'Ramroller w każdej opcji');
});

// =============================================================================
// Marut — „mana from a Treasure was spent to cast it"
// =============================================================================

test('Marut: bez many ze Skarba ETB nie tworzy tokenów', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'marut', 'marut', 'p1', 'hand');
  addMana(state, 'p1', 8);
  const rCast6 = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'marut' });
  assert.ok(rCast6.ok);
  resolveStack(state);
  assert.equal(countByCardId(state, 'token_treasure'), 0, 'Warunek „if\" niespełniony — zero Skarbów');
});

test('Marut: za każdą manę ze Skarba wydaną na rzut tworzy Skarb (treasure-first)', () => {
  const state = game();
  mainPhase(state);
  // Dwa prawdziwe tokeny Skarba ze zdolnością (jak z Fake Your Own Death).
  for (const i of [1, 2]) {
    createBattlefieldToken(state, 'p1', {
      cardId: 'token_treasure', name: 'Treasure', kind: 'artifact',
      colors: [], types: ['Artifact'], subtypes: ['Treasure'],
      abilities: [{ type: 'activated', cost: { tap: true, sacrificeSelf: true }, effect: { type: 'add_mana', amount: 1, fromTreasure: true } }],
    });
  }
  const treasures = [...state.objects.values()].filter((o) => o.cardId === 'token_treasure' && o.zone === 'battlefield');
  assert.equal(treasures.length, 2);
  for (const treasure of treasures) {
    const r = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: treasure.id, abilityIndex: 0 });
    assert.ok(r.ok, `${treasure.id}: ${r.events?.map((e) => e.reason).join('')}`);
  }
  assert.equal(state.players.find((p) => p.id === 'p1').mana, 2, 'Mana ze Skarbów w puli');
  addMana(state, 'p1', 6);
  addRealCard(state, 'marut', 'marut', 'p1', 'hand');
  const rCast = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'marut' })
;
  resolveStack(state);
assert.ok(rCast.ok, rCast.events?.map((e) => e.reason).join(''));
  const marutId = findId(state, 'marut');
  assert.ok(marutId);
  assert.equal(state.objects.get(marutId).manaFromTreasureSpent, 2, 'Wydano 2 many ze Skarbów (treasure-first)');
  assert.equal(countByCardId(state, 'token_treasure'), 2, 'ETB stworzył 2 Skarby (za 2 wydane many)');
});

test('Marut: mana ze Skarba nie przeżywa startu tury (pula resetuje się z maną)', () => {
  const state = game();
  mainPhase(state);
  createBattlefieldToken(state, 'p1', {
    cardId: 'token_treasure', name: 'Treasure', kind: 'artifact',
    colors: [], types: ['Artifact'], subtypes: ['Treasure'],
    abilities: [{ type: 'activated', cost: { tap: true, sacrificeSelf: true }, effect: { type: 'add_mana', amount: 1, fromTreasure: true } }],
  });
  const treasure = [...state.objects.values()].find((o) => o.cardId === 'token_treasure');
  execute(state, { type: 'activate_ability', playerId: 'p1', objectId: treasure.id, abilityIndex: 0 });
  assert.equal(state.players.find((p) => p.id === 'p1').treasureMana, 1);
  jumpStep(state, 'p1', 'ending', 'end', 10, 1);
  passBoth(state); // cleanup
  passBoth(state); // wrap → tura p2
  // CR 106.4: niewykorzystana mana (także Skarbowa) znika na końcu każdego
  // kroku/fazy — po end step p1 pula jest pusta, nie czeka na turę p1.
  assert.equal(state.players.find((p) => p.id === 'p1').treasureMana, 0, 'Pula Skarbowa wyzerowana z końcem kroku (CR 106.4)');
});

// =============================================================================
// Stoic Rebuttal — Metalcraft + „Counter target spell"
// =============================================================================

test('Stoic Rebuttal: Metalcraft obniża koszt do {U}{U} przy 3 artefaktach', () => {
  const state = game();
  mainPhase(state);
  addArtifact(state, 'a1', 'p1');
  addArtifact(state, 'a2', 'p1');
  addArtifact(state, 'a3', 'p1');
  addRealCard(state, 'rebuttal', 'stoic-rebuttal', 'p1', 'hand');
  addMana(state, 'p1', 2);
  // Potrzebny cel na stosie: p2 rzuca czar (z jego perspektywy) w stwora p1.
  addCreature(state, 'victim', 'p1', 4, 6);
  addRealCard(state, 'enemy-spell', 'fiery-fall', 'p2', 'hand', {});
  jumpStep(state, 'p2', 'precombat_main', 'main', 3);
  state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', 6);
  const cast = execute(state, { type: 'cast_spell', playerId: 'p2', objectId: 'enemy-spell', targets: ['victim'] });
  assert.ok(cast.ok, cast.events?.map((e) => e.reason).join(''));
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  const view = playerView(state, 'p1');
  assert.ok(hasCommand(view, 'cast_spell', (c) => c.objectId === 'rebuttal'), 'Dostępny za 2 przy Metalcraft');
  const manaBefore = state.players.find((p) => p.id === 'p1').mana;
  const r = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'rebuttal', targets: [findId(state, 'fiery-fall', 'stack')] });
  assert.ok(r.ok, r.events?.map((e) => e.reason).join(''));
  const manaAfter = state.players.find((p) => p.id === 'p1').mana;
  assert.equal(manaBefore - manaAfter, 2, 'Zapłacono {1}{U}{U}−{1} = 2 many');
  passBoth(state);
  assert.ok(state.zones.graveyard.includes(findId(state, 'fiery-fall', 'graveyard')), 'Cel skontrowany do grobu');
  assert.equal(state.objects.get('victim').damage ?? 0, 0, 'Stwór-cel bez obrażeń (czar nie rozstrzygnięty)');
});

test('Stoic Rebuttal: bez Metalcraft kosztuje pełne 3', () => {
  const state = game();
  mainPhase(state);
  addArtifact(state, 'a1', 'p1');
  addArtifact(state, 'a2', 'p1');
  addRealCard(state, 'rebuttal', 'stoic-rebuttal', 'p1', 'hand');
  addMana(state, 'p1', 2);
  addRealCard(state, 'enemy-spell', 'fiery-fall', 'p2', 'hand');
  jumpStep(state, 'p2', 'precombat_main', 'main', 3);
  state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', 6);
  // Zwykły stwór jako cel — p1 ma dokładnie 2 artefakty (bez Metalcraft).
  addCreature(state, 'foe-creature', 'p1', 1, 1);
  execute(state, { type: 'cast_spell', playerId: 'p2', objectId: 'enemy-spell', targets: ['foe-creature'] });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  assert.ok(!hasCommand(playerView(state, 'p1'), 'cast_spell', (c) => c.objectId === 'rebuttal'), 'Za 2 many bez Metalcraft niedostępny');
});

test('Stoic Rebuttal: kontruje też czar-stwór (bestow) — „Counter target spell\" bez ograniczeń', () => {
  const state = game();
  mainPhase(state);
  addArtifact(state, 'a1', 'p1');
  addArtifact(state, 'a2', 'p1');
  addArtifact(state, 'a3', 'p1');
  addRealCard(state, 'rebuttal', 'stoic-rebuttal', 'p1', 'hand');
  addMana(state, 'p1', 2);
  // p2 rzuca Leafcrown Dryad za bestow (czar aury na stosie, kind 'creature').
  addRealCard(state, 'dryad', 'leafcrown-dryad', 'p2', 'hand');
  const host = addCreature(state, 'host', 'p2', 2, 2);
  jumpStep(state, 'p2', 'precombat_main', 'main', 3);
  state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', 4);
  const cast = execute(state, { type: 'cast_permanent', playerId: 'p2', objectId: 'dryad', targets: [host.id], bestow: true });
  assert.ok(cast.ok, cast.events?.map((e) => e.reason).join(''));
  const stackDryad = findId(state, 'leafcrown-dryad', 'stack');
  assert.ok(stackDryad, 'Bestow na stosie');
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  const r = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'rebuttal', targets: [stackDryad] });
  assert.ok(r.ok, r.events?.map((e) => e.reason).join(''));
  passBoth(state);
  assert.ok(state.zones.graveyard.includes(findId(state, 'leafcrown-dryad', 'graveyard')), 'Czar-stwór skontrowany (nie wszedł jako stwór)');
  assert.equal(findId(state, 'leafcrown-dryad'), null, 'Brak Dryady na bitwisku');
});
