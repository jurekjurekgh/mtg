import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { addCounter } from '../src/engine/counters.js';
import { effectivePower, effectiveSubtypes, effectiveToughness } from '../src/engine/permanents.js';
import { jumpToStep } from '../src/engine/turn.js';
import { stateFingerprint } from '../src/engine/fingerprint.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { createAggroBot } from '../src/controllers/aggro-bot.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf, setupCardMatch } from '../src/cards/materialize.js';
import { parseDeckText } from '../src/cards/deck-text.js';

/**
 * Siódmy batch realnych kart (ADR 0010):
 * - Fake Your Own Death (OTJ) — instant: +2/+0 i NADANY trigger „dies”
 *   (powrót zatapniętego stwora + token Treasure z {T},Sac: add mana);
 * - Puppeteer Clique (SHM) — flying, ETB reanimuje stwora z grobu
 *   przeciwnika pod swoją kontrolę z haste i wygnaniem w następnym end
 *   stepie, plus persist (powrót z licznikiem -1/-1);
 * - Unstable Frontier (CON) — land: {T}: cel „land you control” zmienia typ
 *   podstawowy do końca tury;
 * - Apprentice Wizard (2XM) — {U},{T}: add {C}{C}{C} (tu: zapłać 1, dostań 3);
 * - Delta Bloodflies (TDM) — flying + trigger „attacks” z warunkiem
 *   „kontrolujesz stwora z licznikiem” → każdy przeciwnik traci 1 życie.
 *
 * Dane Oracle: docs/cards/scryfall-*.json.
 */

const REGISTRY = createCardRegistry();

function game() {
  return createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
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
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  return state;
}

function addRealCard(state, id, cardId, controllerId, zone, { tapped = false, summoningSickness = false } = {}) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, spell: data.spell, abilities: data.abilities ?? [],
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
    entersWithCounters: data.entersWithCounters ?? null,
    types: def.types ?? [], entersTapped: def.entersTapped ?? false,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), tapped, summoningSickness }));
  return state.objects.get(id);
}

function addSimpleCreature(state, id, controllerId, { power = 2, toughness = 2, zone = 'battlefield', keywords = [], tapped = false, summoningSickness = false } = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'highland-game', controllerId, zone, kind: 'creature',
    power, toughness, abilities: [], keywords, subtypes: [], types: ['Creature'],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), tapped, summoningSickness }));
  return state.objects.get(id);
}

function addLand(state, id, controllerId, { subtypes = [], tapped = false } = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'basic-forest', controllerId, zone: 'battlefield',
    kind: 'land', abilities: [], subtypes, types: ['Basic', 'Land'],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), tapped }));
  return state.objects.get(id);
}

function passBoth(state, first = 'p1') {
  // T6: rozstrzyga stos pełnymi rundami passów (czary + triggery, LIFO).
  // Szanuje już naliczone passy (passes) — pełna runda kończy się, gdy
  // licznik wróci do 0 (rozstrzygnięcie stosu albo przejście kroku).
  const blockedByDecision = (r) => !r.ok && /(_unresolved|not_your_decision)$/.test(r.events[0]?.reason ?? '');
  let guard = 0;
  for (;;) {
    let passesDone = state.turn.passes;
    while (passesDone < state.players.length) {
      const holder = state.turn.priorityPlayerId;
      const r1 = execute(state, { type: 'pass_priority', playerId: holder });
      if (blockedByDecision(r1)) return;
      assert.ok(r1.ok, r1.events[0]?.reason);
      if (state.turn.passes === 0) break; // pełna runda zakończona
      passesDone = state.turn.passes;
    }
    guard += 1;
    if (state.zones.stack.length === 0 || guard > 12) break;
  }
}



// --- Fake Your Own Death ----------------------------------------------------

test('Fake Your Own Death: materializacja — instant {1}{B} z pumpem i grantem zdolności', () => {
  const def = REGISTRY.get('fake-your-own-death');
  assert.equal(def.manaCost, 2);
  assert.deepEqual([...def.types], ['Instant']);
  const data = gameObjectDataOf(def);
  assert.equal(data.kind, 'spell');
  assert.equal(data.spell.timing, 'instant');
  const [pump, grant] = data.spell.effects;
  assert.deepEqual({ ...pump }, { type: 'pump', power: 2, toughness: 0 });
  assert.equal(grant.type, 'grant_abilities');
  assert.equal(grant.abilities[0].trigger.event, 'dies');
});

test('Fake Your Own Death: +2/+0 i nadany trigger dies zwraca stwora zatapniętego z Treasure', () => {
  const state = mainPhase(game());
  const creature = addSimpleCreature(state, 'c1', 'p1', { power: 2, toughness: 2 });
  addRealCard(state, 'fake', 'fake-your-own-death', 'p1', 'hand');
  addMana(state, 'p1', 2);

  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'fake', targets: [creature.id] }).ok);
  passBoth(state, 'p1');
  const pumped = state.objects.get('c1');
  assert.equal(effectivePower(pumped, state), 4, '+2/+0');
  assert.equal(effectiveToughness(pumped, state), 2);
  assert.equal(pumped.abilityGrants.length, 1, 'stwór ma nadany trigger dies');

  // Zabicie stwora: SBA → trigger dies (nadany) → powrót zatapniętego + Treasure.
  const before = state.zones.battlefield.length;
  const result = execute(state, {
    type: 'cast_spell', playerId: 'p1', objectId: 'shock', targets: [creature.id],
  });
  assert.equal(result.ok, false, 'brak takiego czaru — test dobija ręcznie poniżej');
  state.objects.set('c1', Object.freeze({ ...state.objects.get('c1'), damage: 99 }));
  const step = execute(state, { type: 'pass_priority', playerId: 'p1' });
  assert.ok(step.ok);
  const types = step.events.map((e) => e.type);
  assert.ok(types.includes('creature_destroyed'), 'stwór ginie');
  passBoth(state, 'p1'); // T6: dies trigger (powrót + Treasure) ze stosu
  assert.ok(state.events.some((e) => e.type === 'token_created'), 'powstaje Treasure');

  const returned = state.zones.battlefield
    .map((id) => state.objects.get(id))
    .find((o) => o.cardId === 'highland-game');
  assert.ok(returned, 'stwór wrócił na pole bitwy');
  assert.equal(returned.tapped, true, 'wraca ZATAPNIĘTY');
  assert.equal(returned.abilityGrants.length, 0, 'nadany trigger nie przechodzi przez zmianę strefy (CR 400.7)');
  const treasure = state.zones.battlefield
    .map((id) => state.objects.get(id))
    .find((o) => o.cardId === 'token_treasure');
  assert.ok(treasure, 'token Treasure na polu bitwy');
  assert.equal(treasure.kind, 'artifact');
  assert.equal(treasure.power, null, 'Treasure nie jest stworem — brak P/T');
  assert.equal(state.zones.battlefield.length, before + 1, 'stwór wrócił + Treasure, oryginał zniknął');
});

test('Treasure: {T}, Sacrifice: dodaje 1 manę i trafia do grobu', () => {
  const state = mainPhase(game());
  const creature = addSimpleCreature(state, 'c1', 'p1');
  addRealCard(state, 'fake', 'fake-your-own-death', 'p1', 'hand');
  addMana(state, 'p1', 2);
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'fake', targets: [creature.id] }).ok);
  passBoth(state, 'p1');
  state.objects.set('c1', Object.freeze({ ...state.objects.get('c1'), damage: 99 }));
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok);
  passBoth(state, 'p1'); // T6: dies trigger (powrót + Treasure) ze stosu
  const treasureId = state.zones.battlefield.find((id) => state.objects.get(id).cardId === 'token_treasure');
  assert.ok(treasureId);

  const manaBefore = state.players.find((p) => p.id === 'p1').mana;
  state.turn.priorityPlayerId = 'p1';
  const view = playerView(state, 'p1');
  const activation = view.legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === treasureId);
  assert.ok(activation, 'Treasure oferuje aktywację');
  assert.ok(execute(state, activation).ok);
  assert.equal(state.players.find((p) => p.id === 'p1').mana, manaBefore + 1, 'mana wpada do puli');
  assert.equal(state.objects.get(treasureId), undefined, 'token opuścił pole bitwy');
  // CR 704.5d: poświęcony token znika z grobu (nie zostaje w strefie).
  assert.ok(!state.zones.graveyard.some((id) => state.objects.get(id)?.cardId === 'token_treasure'),
    'token poza polem bitwy przestaje istnieć');
});

test('Fake Your Own Death NIELEGALNE: sorcery-only timing nie dotyczy, ale bez celu czar nie przechodzi', () => {
  const state = mainPhase(game());
  addRealCard(state, 'fake', 'fake-your-own-death', 'p1', 'hand');
  addMana(state, 'p1', 2);
  const noTarget = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'fake', targets: [] });
  assert.equal(noTarget.ok, false);
  assert.match(noTarget.events[0].reason, /illegal_spell/);
  const landId = addLand(state, 'l1', 'p1').id;
  const wrongTarget = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'fake', targets: [landId] });
  assert.equal(wrongTarget.ok, false, 'land nie jest legalnym celem „target creature”');
});

test('Fake Your Own Death: grant znika w cleanup — po turze stwór ginie normalnie', () => {
  const state = mainPhase(game());
  const creature = addSimpleCreature(state, 'c1', 'p1');
  addRealCard(state, 'fake', 'fake-your-own-death', 'p1', 'hand');
  addMana(state, 'p1', 2);
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'fake', targets: [creature.id] }).ok);
  passBoth(state, 'p1');
  // Przewijamy do cleanup tej tury (przejście kroku czyści granty).
  state.turn = jumpToStep(state.turn, 'end', 'p1');
  passBoth(state, 'p1');
  const after = state.objects.get('c1');
  assert.equal(after.abilityGrants.length, 0, 'grant zdolności znika w cleanup');
  assert.equal(effectivePower(after, state), 2, 'pump też znika');
});

// --- Puppeteer Clique -------------------------------------------------------

test('Puppeteer Clique: materializacja — 3/2 flying + persist, dwa triggery', () => {
  const state = mainPhase(game());
  const clique = addRealCard(state, 'pc', 'puppeteer-clique', 'p1', 'battlefield');
  assert.equal(clique.power, 3);
  assert.equal(clique.toughness, 2);
  assert.ok(clique.keywords.includes('flying'));
  assert.ok(clique.keywords.includes('persist'));
  const events = clique.abilities.map((a) => a.trigger?.event);
  assert.deepEqual(events, ['enter_battlefield', 'dies']);
});

test('Puppeteer Clique ETB: reanimuje najsilniejszego stwora z grobu przeciwnika z haste', () => {
  const state = mainPhase(game());
  addSimpleCreature(state, 'weak', 'p2', { power: 1, toughness: 1, zone: 'graveyard' });
  addSimpleCreature(state, 'strong', 'p2', { power: 4, toughness: 4, zone: 'graveyard' });
  addSimpleCreature(state, 'mine', 'p1', { power: 5, toughness: 5, zone: 'graveyard' });
  addRealCard(state, 'pc', 'puppeteer-clique', 'p1', 'hand');
  addMana(state, 'p1', 5);

  const result = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'pc' });
  resolveStack(state);

  assert.ok(result.ok, JSON.stringify(result.events[0]));
  // Temat 2: „target creature card from an opponent's graveyard" — kontroler
  // wybiera cel (najsilniejszy = strong; pierwszy kandydat).
  assert.ok(execute(state, { type: 'resolve_trigger_target', playerId: 'p1', targetId: 'strong' }).ok);
  passBoth(state); // T6: rozstrzygnij trigger ze stosu
  const reanimated = state.zones.battlefield
    .map((id) => state.objects.get(id))
    .find((o) => o.cardId === 'highland-game');
  assert.ok(reanimated, 'stwór z grobu przeciwnika wszedł na pole bitwy');
  assert.equal(reanimated.power, 4, 'wybrany deterministycznie najsilniejszy (4/4, nie 1/1)');
  assert.equal(reanimated.controllerId, 'p1', 'pod kontrolą kontrolera Clique');
  assert.ok(reanimated.keywords.includes('haste'), 'gains haste');
  assert.ok(state.zones.graveyard.some((id) => state.objects.get(id)?.id === 'mine'), 'własny grób nietknięty');
  assert.equal(state.delayedTriggers.length, 1, 'zaplanowane wygnanie w następnym end stepie');
});

test('Puppeteer Clique: przejęty stwór jest wygnany na początku kroku end kontrolera', () => {
  const state = mainPhase(game());
  addSimpleCreature(state, 'strong', 'p2', { power: 4, toughness: 4, zone: 'graveyard' });
  addRealCard(state, 'pc', 'puppeteer-clique', 'p1', 'hand');
  addMana(state, 'p1', 5);
  const rCast1 = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'pc' });
  assert.ok(rCast1.ok);
  resolveStack(state);
  // Temat 2: cel reanimacji wybiera kontroler (jedyny stwór w grobie p2).
  assert.ok(execute(state, { type: 'resolve_trigger_target', playerId: 'p1', targetId: 'strong' }).ok);
  passBoth(state); // T6: rozstrzygnij trigger ze stosu
  const reanimatedId = state.zones.battlefield.find((id) => state.objects.get(id).cardId === 'highland-game');

  state.turn = jumpToStep(state.turn, 'end_of_combat', 'p1');
  passBoth(state, 'p1'); // → postcombat main
  const result = (() => {
    let last = null;
    for (let i = 0; i < 6 && state.turn.step !== 'end'; i += 1) {
      last = execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
      assert.ok(last.ok);
    }
    return last;
  })();
  assert.equal(state.turn.step, 'end');
  passBoth(state, 'p1'); // T6: opóźniony trigger (exile) ze stosu
  assert.ok(state.events.some((e) => e.type === 'object_exiled' && e.delayed), 'opóźniony trigger wygania');
  assert.equal(state.objects.get(reanimatedId), undefined);
  assert.equal(state.delayedTriggers.length, 0, 'kolejka opóźnionych triggerów wyczyszczona');
});

test('Puppeteer Clique ETB NIELEGALNE: pusty grób przeciwnika — trigger nie odpala', () => {
  const state = mainPhase(game());
  addSimpleCreature(state, 'mine', 'p1', { power: 3, toughness: 3, zone: 'graveyard' });
  addRealCard(state, 'pc', 'puppeteer-clique', 'p1', 'hand');
  addMana(state, 'p1', 5);
  const result = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'pc' });
  resolveStack(state);

  assert.ok(result.ok);
  assert.equal(result.events.filter((e) => e.type === 'ability_triggered').length, 0, 'brak celu = brak triggera');
  assert.ok(state.zones.graveyard.includes('mine'), 'własny stwór zostaje w grobie');
});

test('Puppeteer Clique persist: wraca z licznikiem -1/-1 (2/1), drugi raz już nie', () => {
  const state = mainPhase(game());
  const clique = addRealCard(state, 'pc', 'puppeteer-clique', 'p1', 'battlefield');
  state.objects.set('pc', Object.freeze({ ...clique, damage: 99 }));
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok);
  passBoth(state, 'p1'); // T6: persist trigger ze stosu

  const back = state.zones.battlefield
    .map((id) => state.objects.get(id))
    .find((o) => o.cardId === 'puppeteer-clique');
  assert.ok(back, 'persist zwrócił stwora na pole bitwy');
  assert.equal(back.counters['-1/-1'], 1);
  assert.equal(effectivePower(back, state), 2, '3 - 1');
  assert.equal(effectiveToughness(back, state), 1, '2 - 1');

  // Druga śmierć: LKI mówi, że miał licznik -1/-1 → persist NIE odpala.
  state.objects.set(back.id, Object.freeze({ ...state.objects.get(back.id), damage: 99 }));
  assert.ok(execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId }).ok);
  assert.equal(
    state.zones.battlefield.filter((id) => state.objects.get(id).cardId === 'puppeteer-clique').length,
    0,
    'drugi raz persist już nie działa (CR 702.79)',
  );
  assert.ok(state.zones.graveyard.some((id) => state.objects.get(id).cardId === 'puppeteer-clique'));
});

// --- Unstable Frontier ------------------------------------------------------

test('Unstable Frontier: materializacja — land ze zdolnością celowaną w land you control', () => {
  const state = mainPhase(game());
  const frontier = addRealCard(state, 'uf', 'unstable-frontier', 'p1', 'battlefield');
  assert.equal(frontier.kind, 'land');
  const ability = frontier.abilities[0];
  assert.equal(ability.cost.tap, true);
  assert.deepEqual(ability.targets.map((t) => t.type), ['land_you_control']);
});

test('Unstable Frontier: własny land dostaje typ podstawowy do końca tury', () => {
  const state = mainPhase(game());
  addRealCard(state, 'uf', 'unstable-frontier', 'p1', 'battlefield');
  const target = addLand(state, 'l1', 'p1', { subtypes: ['Plains'] });
  assert.deepEqual([...effectiveSubtypes(target)], ['Plains']);

  const view = playerView(state, 'p1');
  const cmd = view.legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === 'uf' && c.targets?.[0] === 'l1');
  assert.ok(cmd, 'zdolność oferuje własny land jako cel');
  const result = execute(state, cmd);
  assert.ok(result.ok, JSON.stringify(result.events[0]));
  resolveStack(state); // D: zdolność na stosie, decyzja typu po rozstrzygnięciu
  // Temat 5: typ wybiera KONTROLER (resolve_land_type_choice) — decyzja czeka.
  assert.ok(state.pendingLandTypeChoice, 'decyzja wyboru typu czeka');
  assert.equal(state.pendingLandTypeChoice.playerId, 'p1');
  const pick = execute(state, { type: 'resolve_land_type_choice', playerId: 'p1', landType: 'Forest' });
  assert.ok(pick.ok, pick.events[0]?.reason);
  assert.ok(pick.events.some((e) => e.type === 'land_type_changed'));
  assert.deepEqual([...effectiveSubtypes(state.objects.get('l1'))], ['Forest'], 'typ podstawowy zastąpiony');
  assert.equal(state.objects.get('uf').tapped, true, 'koszt {T} zapłacony');

  state.turn = jumpToStep(state.turn, 'end', 'p1');
  passBoth(state, 'p1');
  assert.deepEqual([...effectiveSubtypes(state.objects.get('l1'))], ['Plains'], 'po cleanup typ wraca');
});

test('Unstable Frontier NIELEGALNE: cudzy land i stwór nie są celem, tapnięta nie działa', () => {
  const state = mainPhase(game());
  addRealCard(state, 'uf', 'unstable-frontier', 'p1', 'battlefield');
  addLand(state, 'enemy-land', 'p2', { subtypes: ['Island'] });
  addSimpleCreature(state, 'c1', 'p1');

  const enemyTarget = execute(state, {
    type: 'activate_ability', playerId: 'p1', objectId: 'uf', abilityIndex: 0, targets: ['enemy-land'],
  });
  assert.equal(enemyTarget.ok, false, 'cudzy land nie jest „land you control”');
  const creatureTarget = execute(state, {
    type: 'activate_ability', playerId: 'p1', objectId: 'uf', abilityIndex: 0, targets: ['c1'],
  });
  assert.equal(creatureTarget.ok, false, 'zwykły stwór nie jest landem');

  const own = addLand(state, 'l1', 'p1', { subtypes: ['Swamp'] }).id;
  assert.ok(execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'uf', abilityIndex: 0, targets: [own] }).ok);
  const again = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'uf', abilityIndex: 0, targets: [own] });
  assert.equal(again.ok, false, 'zatapnięty Frontier nie może aktywować zdolności {T}');
});

// --- Apprentice Wizard ------------------------------------------------------

test('Apprentice Wizard: materializacja — 0/1 {1}{U}{U} ze zdolnością many', () => {
  const state = mainPhase(game());
  const wizard = addRealCard(state, 'aw', 'apprentice-wizard', 'p1', 'battlefield');
  assert.equal(wizard.power, 0);
  assert.equal(wizard.toughness, 1);
  assert.equal(wizard.manaCost, 3);
  assert.deepEqual({ ...wizard.abilities[0].cost }, { tap: true, mana: 1, colors: ['U'] });
  assert.deepEqual({ ...wizard.abilities[0].effect }, { type: 'add_mana', amount: 3 });
});

test('Apprentice Wizard: zapłać 1, dostań 3 (netto +2 many)', () => {
  const state = mainPhase(game());
  addRealCard(state, 'aw', 'apprentice-wizard', 'p1', 'battlefield');
  addMana(state, 'p1', 1);
  const result = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'aw', abilityIndex: 0 });
  assert.ok(result.ok, JSON.stringify(result.events[0]));
  assert.equal(state.players.find((p) => p.id === 'p1').mana, 3, '1 - 1 + 3');
  assert.equal(state.objects.get('aw').tapped, true);
});

test('Apprentice Wizard NIELEGALNE: bez many i z chorobą przywołania (tap)', () => {
  const state = mainPhase(game());
  addRealCard(state, 'aw', 'apprentice-wizard', 'p1', 'battlefield');
  const noMana = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'aw', abilityIndex: 0 });
  assert.equal(noMana.ok, false, 'brak many na koszt {U}');
  assert.match(noMana.events[0].reason, /illegal_ability/);

  addMana(state, 'p1', 1);
  assert.ok(execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'aw', abilityIndex: 0 }).ok);
  addMana(state, 'p1', 1);
  const tapped = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'aw', abilityIndex: 0 });
  assert.equal(tapped.ok, false, 'zatapniętego nie da się tapnąć drugi raz');
});

// --- Delta Bloodflies -------------------------------------------------------

test('Delta Bloodflies: materializacja — 1/2 flying z warunkowym triggerem attacks', () => {
  const state = mainPhase(game());
  const flies = addRealCard(state, 'db', 'delta-bloodflies', 'p1', 'battlefield');
  assert.equal(flies.power, 1);
  assert.equal(flies.toughness, 2);
  assert.ok(flies.keywords.includes('flying'));
  const ability = flies.abilities[0];
  assert.equal(ability.trigger.event, 'attacks');
  assert.equal(ability.trigger.condition.controlsCreatureWithCounter, true);
  assert.deepEqual({ ...ability.effect }, { type: 'lose_life', amount: 1, scope: 'each_opponent' });
});

test('Delta Bloodflies: atak z licznikiem na własnym stworze drenuje 1 życie', () => {
  const state = game();
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  addRealCard(state, 'db', 'delta-bloodflies', 'p1', 'battlefield');
  const buddy = addSimpleCreature(state, 'c1', 'p1');
  addCounter(state, buddy.id, '+1/+1', 1);

  const result = execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['db'] });
  assert.ok(result.ok, JSON.stringify(result.events[0]));
  assert.ok(result.events.some((e) => e.type === 'ability_triggered' && e.trigger === 'attacks'));
  passBoth(state, 'p1'); // T6: attacks trigger ze stosu
  assert.equal(state.players.find((p) => p.id === 'p2').life, 19, 'przeciwnik traci 1 życie');
  assert.equal(state.players.find((p) => p.id === 'p1').life, 20, 'kontroler nie traci życia');
});

test('Delta Bloodflies NIELEGALNE (warunek): bez licznika trigger nie odpala', () => {
  const state = game();
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  addRealCard(state, 'db', 'delta-bloodflies', 'p1', 'battlefield');
  addSimpleCreature(state, 'c1', 'p1');
  // Licznik u PRZECIWNIKA nie spełnia warunku „you control”.
  const enemyCreature = addSimpleCreature(state, 'e1', 'p2');
  addCounter(state, enemyCreature.id, '+1/+1', 1);

  const result = execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['db'] });
  assert.ok(result.ok);
  assert.equal(result.events.filter((e) => e.type === 'ability_triggered').length, 0);
  assert.equal(state.players.find((p) => p.id === 'p2').life, 20, 'brak drenażu bez własnego licznika');
});

test('Delta Bloodflies + persist: licznik -1/-1 też spełnia warunek „counter on it”', () => {
  const state = game();
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  addRealCard(state, 'db', 'delta-bloodflies', 'p1', 'battlefield');
  const buddy = addSimpleCreature(state, 'c1', 'p1');
  addCounter(state, buddy.id, '-1/-1', 1);
  const result = execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['db'] });
  assert.ok(result.ok);
  passBoth(state, 'p1'); // T6: attacks trigger ze stosu
  assert.equal(state.players.find((p) => p.id === 'p2').life, 19, 'dowolny licznik spełnia warunek');
});

// --- Interakcje i determinizm ----------------------------------------------

test('interakcja: Fake Your Own Death na Puppeteer Clique — persist i grant nie kolidują', () => {
  const state = mainPhase(game());
  const clique = addRealCard(state, 'pc', 'puppeteer-clique', 'p1', 'battlefield');
  addRealCard(state, 'fake', 'fake-your-own-death', 'p1', 'hand');
  addMana(state, 'p1', 2);
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'fake', targets: [clique.id] }).ok);
  passBoth(state, 'p1');
  assert.equal(effectivePower(state.objects.get('pc'), state), 5, '3 + 2');

  state.objects.set('pc', Object.freeze({ ...state.objects.get('pc'), damage: 99 }));
  const result = execute(state, { type: 'pass_priority', playerId: 'p1' });
  assert.ok(result.ok);
  passBoth(state, 'p1'); // T6: dies triggery (persist + FYOD) ze stosu
  const copies = state.zones.battlefield.filter((id) => state.objects.get(id).cardId === 'puppeteer-clique');
  assert.equal(copies.length, 1, 'stwór wraca dokładnie raz (drugi efekt widzi już inną strefę)');
  assert.ok(state.zones.battlefield.some((id) => state.objects.get(id).cardId === 'token_treasure'), 'Treasure i tak powstaje');
});

test('determinizm: ta sama sekwencja daje identyczny fingerprint', () => {
  const run = () => {
    const state = mainPhase(game());
    addSimpleCreature(state, 'strong', 'p2', { power: 4, toughness: 4, zone: 'graveyard' });
    addRealCard(state, 'pc', 'puppeteer-clique', 'p1', 'hand');
    addRealCard(state, 'db', 'delta-bloodflies', 'p1', 'battlefield');
    addMana(state, 'p1', 5);
    execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'pc' });
  resolveStack(state);

    return stateFingerprint(state);
  };
  assert.equal(run(), run());
});

// --- Talia i probe botów ----------------------------------------------------

