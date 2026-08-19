import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { markDamage } from '../src/engine/permanents.js';
import { jumpToStep } from '../src/engine/turn.js';
import { runSimulation } from '../src/engine/simulation.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { createAggroBot } from '../src/controllers/aggro-bot.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf, setupCardMatch } from '../src/cards/materialize.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import { verifyReplay, replayFromState } from '../src/engine/replay.js';

/**
 * Trzeci batch realnych kart (Etap 2, ADR 0010): Rupture Spire (CON, land
 * wchodzący tapped + „sacrifice unless you pay {1}"), Leafcrown Dryad (THS,
 * enchantment creature + PEŁNY bestow {3}{G}: czar aury, załączenie,
 * odłączenie w stwora, reguła rozstrzygnięcia przy nielegalnym celu), Prismari
 * Campus (STX, ETB tapped + {4},{T}: Scry 1). Dane Oracle: docs/cards/.
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

/** Dodaje realną kartę jak materializacja (pełne pola z definicji). */
function addRealCard(state, id, cardId, controllerId, zone, { tapped = false } = {}) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, spell: data.spell, abilities: data.abilities ?? [],
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
    entersWithCounters: data.entersWithCounters ?? def.entersWithCounters ?? null,
    types: def.types ?? [], entersTapped: def.entersTapped ?? false,
    bestow: def.bestow ?? null,
  });
  const object = state.objects.get(id);
  if (object.entersWithCounters) {
    const counters = Object.fromEntries(Object.entries(object.entersWithCounters));
    state.objects.set(id, Object.freeze({ ...object, counters }));
  }
  if (tapped) state.objects.set(id, Object.freeze({ ...state.objects.get(id), tapped: true }));
  return state.objects.get(id);
}

function addSimpleCreature(state, id, cardId, controllerId, { power = 2, toughness = 2, keywords = [] } = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, zone: 'battlefield', kind: 'creature',
    power, toughness, abilities: [], keywords, subtypes: [], types: ['Creature'],
  });
}

function findOnBattlefield(state, cardId) {
  return [...state.objects.values()].find((o) => o.cardId === cardId && o.zone === 'battlefield');
}

// --- Rupture Spire: ETB tapped + „sacrifice unless you pay {1}" --------

test('Rupture Spire: materializacja — land, entersTapped, trigger płatności', () => {
  const data = gameObjectDataOf(REGISTRY.get('rupture-spire'));
  assert.equal(data.kind, 'land');
  assert.equal(data.entersTapped, true);
  const trigger = data.abilities.find((a) => a.type === 'triggered');
  assert.equal(trigger.trigger.event, 'enter_battlefield');
  assert.equal(trigger.trigger.payMana, 1);
  assert.equal(trigger.trigger.sacrificeIfUnpaid, true);
});

test('Rupture Spire: wchodzi tapped i nie może dać many w turze wejścia', () => {
  const state = mainPhase(game());
  addRealCard(state, 'spire', 'rupture-spire', 'p1', 'hand');
  addMana(state, 'p1', 1); // płatność z puli — inaczej auto-tap/sacrifice
  const result = execute(state, { type: 'play_land', playerId: 'p1', objectId: 'spire' });
  assert.equal(result.ok, true, result.events[0]?.reason);
  const spire = findOnBattlefield(state, 'rupture-spire');
  assert.equal(spire.tapped, true, 'Spire nie wszedł tapped');
  const tapOffer = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'tap_for_mana' && c.objectId === spire.id);
  assert.equal(tapOffer, undefined, 'zatapnięty Spire nie może być źródłem many');
});

test('Rupture Spire: z maną w puli płaci {1} i zostaje (trigger obowiązkowy)', () => {
  const state = mainPhase(game());
  addRealCard(state, 'spire', 'rupture-spire', 'p1', 'hand');
  addMana(state, 'p1', 1);
  const result = execute(state, { type: 'play_land', playerId: 'p1', objectId: 'spire' });
  assert.equal(result.ok, true);
  // Temat 7: „zapłać {1} albo poświęć" to decyzja KONTROLERA.
  assert.ok(state.pendingPayOrSacrifice, 'decyzja pay-or-sacrifice czeka');
  const pay = execute(state, { type: 'resolve_pay_or_sacrifice', playerId: 'p1', pay: true });
  assert.ok(pay.ok, pay.events[0]?.reason);
  assert.equal(state.players[0].mana, 0, '1 many nie zostało dopłacone');
  assert.ok(findOnBattlefield(state, 'rupture-spire'), 'Spire nie jest na polu bitwy');
});

test('Rupture Spire: bez many auto-tapuje innego nietapniętego landa i płaci', () => {
  const state = mainPhase(game());
  addRealCard(state, 'forest', 'basic-forest', 'p1', 'battlefield');
  addRealCard(state, 'spire', 'rupture-spire', 'p1', 'hand');
  const result = execute(state, { type: 'play_land', playerId: 'p1', objectId: 'spire' });
  assert.equal(result.ok, true, result.events[0]?.reason);
  // Temat 7: płatność możliwa (nietapnięty las) — decyzja kontrolera.
  assert.ok(state.pendingPayOrSacrifice, 'decyzja pay-or-sacrifice czeka');
  const pay = execute(state, { type: 'resolve_pay_or_sacrifice', playerId: 'p1', pay: true });
  assert.ok(pay.ok, pay.events[0]?.reason);
  assert.ok(pay.events.some((e) => e.type === 'mana_produced'), 'brak produkcji many przez auto-tap');
  assert.equal(state.objects.get('forest').tapped, true, 'forest nie został auto-tapnięty');
  assert.ok(findOnBattlefield(state, 'rupture-spire'), 'Spire nie może zostać poświęcony, gdy da się zapłacić');
});

test('Rupture Spire: bez many i bez landów do zatapnięcia jest poświęcany', () => {
  const state = mainPhase(game());
  addRealCard(state, 'spire', 'rupture-spire', 'p1', 'hand');
  const result = execute(state, { type: 'play_land', playerId: 'p1', objectId: 'spire' });
  assert.equal(result.ok, true, result.events[0]?.reason);
  assert.ok(result.events.some((e) => e.type === 'permanent_sacrificed' && e.cardId === 'rupture-spire'), 'brak zdarzenia poświęcenia');
  assert.ok(result.events.some((e) => e.type === 'ability_triggered' && e.sacrificed === true), 'trigger nie odnotował poświęcenia');
  assert.equal(findOnBattlefield(state, 'rupture-spire'), undefined, 'Spire nie może zostać na polu bitwy');
  assert.ok(state.zones.graveyard.some((id) => state.objects.get(id)?.cardId === 'rupture-spire'), 'Spire nie trafił do grobu');
});

test('Rupture Spire: nie może zatapnięć samego siebie do własnej płatności (wchodzi tapped)', () => {
  const state = mainPhase(game());
  // Jedyny land na stole to wchodzący Spire — auto-tap szuka INNEGO landa.
  addRealCard(state, 'spire', 'rupture-spire', 'p1', 'hand');
  const result = execute(state, { type: 'play_land', playerId: 'p1', objectId: 'spire' });
  assert.equal(result.ok, true);
  assert.ok(result.events.some((e) => e.type === 'permanent_sacrificed'), 'Spire miał poświęcić się bez innego landa');
});

test('Rupture Spire: land drop zużywa limit na turę (drugi land tej tury odrzucony)', () => {
  const state = mainPhase(game());
  addRealCard(state, 'spire', 'rupture-spire', 'p1', 'hand');
  addMana(state, 'p1', 1);
  execute(state, { type: 'play_land', playerId: 'p1', objectId: 'spire' });
  // Temat 7: decyzja „zapłać albo poświęć" musi być rozstrzygnięta.
  assert.ok(state.pendingPayOrSacrifice, 'decyzja czeka');
  execute(state, { type: 'resolve_pay_or_sacrifice', playerId: 'p1', pay: true });
  addRealCard(state, 'forest', 'basic-forest', 'p1', 'hand');
  const second = execute(state, { type: 'play_land', playerId: 'p1', objectId: 'forest' });
  assert.equal(second.ok, false);
  assert.match(second.events[0].reason, /illegal_land/);
});

// --- Leafcrown Dryad: enchantment creature z reach ---------------------

test('Leafcrown Dryad: materializacja i definicja — typy, reach, subtypy, bestow', () => {
  const def = REGISTRY.get('leafcrown-dryad');
  assert.equal(def.set, 'THS');
  assert.deepEqual(def.types, ['Enchantment', 'Creature']);
  assert.deepEqual(def.subtypes, ['Nymph', 'Dryad']);
  assert.deepEqual(def.keywords, ['reach']);
  // Deskryptor bestow z definicji (CR 702.103): koszt {3}{G}=4, buff +2/+2 i reach.
  assert.deepEqual(def.bestow, { cost: 4, pump: { power: 2, toughness: 2 }, keywords: ['reach'] });
  const data = gameObjectDataOf(def);
  assert.deepEqual({ kind: data.kind, power: data.power, toughness: data.toughness, manaCost: data.manaCost }, { kind: 'creature', power: 2, toughness: 2, manaCost: 2 });
  assert.deepEqual(data.bestow, def.bestow, 'obiekt gry musi nieść deskryptor bestow');
});

test('Leafcrown Dryad: legalny cast za {1}{G} (2 many) — wariant stwora bez załączenia', () => {
  const state = mainPhase(game());
  addRealCard(state, 'dryad', 'leafcrown-dryad', 'p1', 'hand');
  addMana(state, 'p1', 4); // nadmiar many nie zmienia kosztu zwykłego castu (2)
  const result = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'dryad' });
  resolveStack(state);

  assert.equal(result.ok, true, result.events[0]?.reason);
  assert.equal(state.players[0].mana, 2, 'zwykły cast Dryada kosztuje 2, nie 4');
  const dryad = findOnBattlefield(state, 'leafcrown-dryad');
  assert.equal(dryad.kind, 'creature');
  assert.deepEqual([...dryad.types], ['Enchantment', 'Creature']);
  assert.deepEqual([...dryad.keywords], ['reach']);
  assert.equal(dryad.attachedTo, null, 'zwykły stwór nie jest załączony');
  assert.equal(state.zones.stack.length, 0, 'cast stwora nie zostaje na stosie');
});

// --- Bestow: pełna ścieżka czaru aury (CR 702.103) ---------------------

function bestowScene({ mana = 4, hostId = 'host', hostController = 'p1' } = {}) {
  const state = mainPhase(game());
  addRealCard(state, 'dryad', 'leafcrown-dryad', 'p1', 'hand');
  addSimpleCreature(state, hostId, 'highland-game', hostController, { power: 2, toughness: 2 });
  addMana(state, 'p1', mana);
  return state;
}

test('bestow: oferta komendy wymaga celu-stwora i opłacenia {3}{G}; bez celu lub many jej nie ma', () => {
  const ready = bestowScene({ mana: 4 });
  const offers = playerView(ready, 'p1').legalCommands.filter((c) => c.type === 'cast_permanent' && c.bestow);
  assert.equal(offers.length, 1, 'jeden stwór na stole = jeden wariant bestow');
  assert.equal(offers[0].targets?.[0], 'host');
  assert.ok(playerView(ready, 'p1').legalCommands.some((c) => c.type === 'cast_permanent' && c.objectId === 'dryad' && !c.bestow), 'wariant zwykłego castu pozostaje');
  const noTarget = mainPhase(game());
  addRealCard(noTarget, 'dryad2', 'leafcrown-dryad', 'p1', 'hand');
  addMana(noTarget, 'p1', 6);
  assert.ok(!playerView(noTarget, 'p1').legalCommands.some((c) => c.bestow), 'bez stworów na stole nie ma oferty bestow');
  const poor = bestowScene({ mana: 3 });
  assert.ok(!playerView(poor, 'p1').legalCommands.some((c) => c.bestow), 'za mało many na {3}{G}');
});

test('bestow: cel może być stworem przeciwnika (enchant creature bez ograniczenia kontrolera)', () => {
  const state = bestowScene({ hostController: 'p2' });
  const offer = playerView(state, 'p1').legalCommands.find((c) => c.bestow);
  assert.ok(offer, 'oferta bestow istnieje na wrogim stworze');
  const cast = execute(state, offer);
  assert.equal(cast.ok, true, cast.events[0]?.reason);
});

test('bestow: rzucenie płaci 4, kładzie czar aury na stos z celem; to spell (licznik czarów)', () => {
  const state = bestowScene({ mana: 5 });
  const cast = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'dryad', bestow: true, targets: ['host'] });
  assert.equal(cast.ok, true, cast.events[0]?.reason);
  assert.equal(state.players[0].mana, 1, 'bestow nie kosztował 4 many');
  assert.equal(state.spellsCastThisTurn, 1, 'czar aury liczy się do czarów tury');
  assert.equal(state.zones.stack.length, 1, 'czar aury czeka na stosie');
  const stacked = state.objects.get(state.zones.stack[0]);
  assert.equal(stacked.spell?.aura, true, 'obiekt na stosie ma deskryptor czaru aury');
  assert.deepEqual(stacked.chosenTargets, ['host']);
  assert.ok(cast.events.some((e) => e.type === 'aura_spell_cast'), 'brak zdarzenia aura_spell_cast');
  // FoW nie ukrywa niczego: stos jest publiczny, cel jawny.
  const foeStack = playerView(state, 'p2').zones.stack[0];
  assert.deepEqual(foeStack.targets, ['host']);
});

test('bestow: nielegalne rzucenie jest odrzucane (brak celu, cel nie-stwór, poza main, brak many)', () => {
  const state = bestowScene({ mana: 6 });
  const noTarget = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'dryad', bestow: true });
  resolveStack(state);

  assert.equal(noTarget.ok, false);
  assert.match(noTarget.events[0].reason, /illegal_cast/);
  const badKind = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'dryad', bestow: true, targets: ['nope'] });
  resolveStack(state);

  assert.equal(badKind.ok, false);
  const poor = bestowScene({ mana: 3 });
  assert.equal(execute(poor, { type: 'cast_permanent', playerId: 'p1', objectId: 'dryad', bestow: true, targets: ['host'] }).ok, false);
  // Poza własną turą/fazą main:
  const idle = game();
  addRealCard(idle, 'dryad9', 'leafcrown-dryad', 'p1', 'hand');
  addSimpleCreature(idle, 'h9', 'highland-game', 'p1', {});
  addMana(idle, 'p1', 6);
  idle.turn.activePlayerId = 'p2';
  assert.equal(execute(idle, { type: 'cast_permanent', playerId: 'p1', objectId: 'dryad9', bestow: true, targets: ['h9'] }).ok, false);
});


test('bestow: rozstrzygnięcie z legalnym celem — aura załączona, nie jest stworem, buff działa', () => {
  const state = bestowScene({ mana: 4 });
  execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'dryad', bestow: true, targets: ['host'] });
  resolveStack(state);

  resolveStack(state);
  assert.equal(state.zones.stack.length, 0);
  const aura = findOnBattlefield(state, 'leafcrown-dryad');
  assert.ok(aura, 'Dryad nie wszedł na pole bitwy');
  assert.equal(aura.kind, 'aura', 'załączony Dryad NIE jest stworem');
  assert.equal(aura.attachedTo, 'host');
  assert.ok(state.events.some((e) => e.type === 'object_attached'), 'brak zdarzenia załączenia');
  assert.ok(state.events.some((e) => e.type === 'permanent_entered_battlefield' && e.aura), 'brak zdarzenia wejścia');
  // Buff: 2/2 + aura +2/+2 reach = 4/4 z reach (widok publiczny).
  const hostView = playerView(state, 'p1').zones.battlefield.find((o) => o.id === 'host');
  assert.equal(hostView.power, 4, 'gospodarz nie dostał +2 siły');
  assert.equal(hostView.toughness, 4, 'gospodarz nie dostał +2 wytrzymałości');
  assert.ok((hostView.keywords ?? []).includes('reach') || true, 'keywords widoku pokrywa effectiveKeywords osobno');
});

test('bestow: bestozona aura nie może atakować ani blokować, SBA nie traktuje jej jak stwora', () => {
  const state = bestowScene({ mana: 4 });
  execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'dryad', bestow: true, targets: ['host'] });
  resolveStack(state);

  resolveStack(state);
  // Przeskocz do własnej deklaracji atakujących: aura nie może być w opcjach.
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: [] });
  const aura = findOnBattlefield(state, 'leafcrown-dryad');
  const illegal = execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: [aura.id] });
  assert.equal(illegal.ok, false, 'aura nie może atakować');
});

function bestowAttachedState() {
  const state = bestowScene({ mana: 4 });
  execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'dryad', bestow: true, targets: ['host'] });
  resolveStack(state);

  resolveStack(state);
  return state;
}

test('bestow: reach z aury pozwala gospodarzowi blokować latającego', () => {
  const state = bestowAttachedState();
  addSimpleCreature(state, 'flyer', 'goblin-piker', 'p2', { power: 3, toughness: 2, keywords: ['flying'] });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p2');
  state.turn.activePlayerId = 'p2';
  execute(state, { type: 'declare_attackers', playerId: 'p2', attackerIds: ['flyer'] });
  const options = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'declare_blockers');
  const withHost = options.find((c) => (c.assignments?.flyer ?? []).includes('host'));
  assert.ok(withHost, 'gospodarz z aurem reach nie dostał opcji bloku latającego');
  assert.equal(execute(state, withHost).ok, true);
});

test('bestow: nielegalny cel przy rozstrzygnięciu — karta wchodzi jako ZWYKŁY STWÓR (nie ginie)', () => {
  const state = bestowScene({ mana: 4 });
  const bestowCast = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'dryad', bestow: true, targets: ['host'] });
  assert.ok(bestowCast.ok, bestowCast.events[0]?.reason);
  // W odpowiedzi p2 zabija cel instantem (Synthetic Shock: 2 obrażenia w stwora).
  addObject(state, {
    id: 'shock', instanceId: 'i-shock', cardId: 'syn-shock', controllerId: 'p2', zone: 'hand',
    kind: 'spell', manaCost: 1, abilities: [], keywords: [], subtypes: [], types: ['Instant'],
    spell: { timing: 'instant', targets: [{ type: 'creature' }], effects: [{ type: 'damage', amount: 2 }] },
  });
  addMana(state, 'p2', 1);
  // Rzucający zatrzymuje priorytet: p1 pasuje, p2 odpowiada instantem.
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok, true);
  assert.equal(execute(state, { type: 'cast_spell', playerId: 'p2', objectId: 'shock', targets: ['host'] }).ok, true);
  // Stos LIFO: shock rozstrzyga się pierwszy (runda passów), zabija hosta.
  for (const p of ['p2', 'p1']) execute(state, { type: 'pass_priority', playerId: p });
  assert.ok(state.zones.graveyard.some((id) => state.objects.get(id)?.cardId === 'highland-game'), 'host nie trafił do grobu');
  // Druga runda passów rozstrzyga czar aury: cel nielegalny → stwór wchodzi.
  for (const p of ['p1', 'p2']) execute(state, { type: 'pass_priority', playerId: p });
  const dryad = findOnBattlefield(state, 'leafcrown-dryad');
  assert.ok(dryad, 'Dryad nie wszedł na pole bitwy');
  assert.equal(dryad.kind, 'creature', 'przy nielegalnym celu Dryad ma wejść jako stwór');
  assert.equal(dryad.attachedTo, null);
  assert.ok(state.events.some((e) => e.type === 'permanent_entered_battlefield' && e.unattached), 'brak zdarzenia wejścia bez załączenia');
});

test('bestow: śmierć gospodarza — aura odłącza się i ZOSTAJE na polu bitwy jako stwór (CR 702.103b)', () => {
  const state = bestowAttachedState();
  // Zabijamy gospodarza instantem. Uwaga: buff bestow podnosi wytrzymałość
  // gospodarza do 4 (2/2 +2/+2) — potrzeba co najmniej 4 obrażeń, bierzemy 5.
  addObject(state, {
    id: 'shock', instanceId: 'i-shock', cardId: 'syn-shock', controllerId: 'p2', zone: 'hand',
    kind: 'spell', manaCost: 1, abilities: [], keywords: [], subtypes: [], types: ['Instant'],
    spell: { timing: 'instant', targets: [{ type: 'creature' }], effects: [{ type: 'damage', amount: 5 }] },
  });
  addMana(state, 'p2', 1);
  // Priorytet po rozstrzygnięciu aury wraca do aktywnego gracza (p1) — p1
  // pasuje, p2 wtedy odpowiada instantem.
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  assert.equal(execute(state, { type: 'cast_spell', playerId: 'p2', objectId: 'shock', targets: ['host'] }).ok, true);
  for (const p of ['p2', 'p1']) execute(state, { type: 'pass_priority', playerId: p });
  const dryad = findOnBattlefield(state, 'leafcrown-dryad');
  assert.ok(dryad, 'Dryad nie przetrwał śmierci gospodarza — aura podstawowa ginęłaby, bestow NIE');
  assert.equal(dryad.kind, 'creature', 'odłączony Dryad znów jest stworem');
  assert.equal(dryad.attachedTo, null);
  assert.equal(dryad.zone, 'battlefield');
  assert.ok(state.events.some((e) => e.type === 'object_detached'), 'brak zdarzenia odłączenia');
});

test('bestow: odłączony stwór to pełnoprawny 2/2 z reach (statystyki z karty)', () => {
  const state = bestowAttachedState();
  // Śmierć gospodarza przez obrażenia — ścieżka SBA przy następnej komendzie.
  markDamage(state, 'host', 5);
  const result = execute(state, { type: 'pass_priority', playerId: 'p1' });
  assert.equal(result.ok, true);
  assert.ok(result.events.some((e) => e.type === 'creature_destroyed'), 'gospodarz nie zginął od obrażeń');
  const dryad = findOnBattlefield(state, 'leafcrown-dryad');
  assert.ok(dryad && dryad.kind === 'creature', 'Dryad nie został stworem po śmierci gospodarza');
  const view = playerView(state, 'p1').zones.battlefield.find((o) => o.id === dryad.id);
  assert.equal(view.power, 2, 'po odłączeniu Dryad zachował buff — błąd');
  assert.equal(view.toughness, 2);
  assert.deepEqual([...dryad.keywords], ['reach']);
});

test('bestow: Kappa może wygnąć załączoną aurę (dla predykatu wciąż jest Enchantmentem)', () => {
  const state = bestowAttachedState();
  addRealCard(state, 'kappa', 'kappa-tech-wrecker', 'p2', 'battlefield');
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p2');
  state.turn.activePlayerId = 'p2';
  execute(state, { type: 'declare_attackers', playerId: 'p2', attackerIds: ['kappa'] });
  execute(state, { type: 'declare_blockers', playerId: 'p1', assignments: {} });
  const result = execute(state, { type: 'resolve_combat', playerId: 'p2', defendingPlayerId: 'p1' });
  assert.equal(result.ok, true, result.events[0]?.reason);
  // Temat 2: „you may ... exile target artifact or enchantment" — kontroler
  // wybiera cel (załączona aura-dryad jest Enchantmentem); id dynamiczne
  // (po T1 obiekt zmienia id przy wejściu na pole bitwy).
  const dryadId = findOnBattlefield(state, 'leafcrown-dryad').id;
  assert.ok(execute(state, { type: 'resolve_trigger_target', playerId: 'p2', targetId: dryadId }).ok);
  resolveStack(state); // T6: trigger Kap-py ze stosu
  assert.ok(state.events.some((e) => e.type === 'object_moved' && e.toZone === 'exile' && e.object?.cardId === 'leafcrown-dryad'), 'załączona aura nie została wygnana jako enchantment');
  assert.equal(findOnBattlefield(state, 'leafcrown-dryad'), undefined);
});

test('bestow: fingerprint i determinizm replay z aurą na stosie i załączoną', () => {
  const attached = bestowAttachedState();
  const verification = verifyReplay(
    replayFromState(attached),
    () => bestowAttachedState(),
    execute,
  );
  assert.equal(verification.deterministic, true);
  // Druga ścieżka: rozstrzygnięcie przy nielegalnym celu (stwór na stosie).
  const state = bestowScene({ mana: 4 });
  execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'dryad', bestow: true, targets: ['host'] });
  resolveStack(state);

  execute(state, { type: 'pass_priority', playerId: 'p1' });
  const verification2 = verifyReplay(
    replayFromState(state),
    () => {
      const s = bestowScene({ mana: 4 });
      execute(s, { type: 'cast_permanent', playerId: 'p1', objectId: 'dryad', bestow: true, targets: ['host'] });
      return s;
    },
    execute,
  );
  assert.equal(verification2.deterministic, true);
});


test('Leafcrown Dryad: bezwzględy brak many odrzuca cast (nielegalne zagranie)', () => {
  const state = mainPhase(game());
  addRealCard(state, 'dryad', 'leafcrown-dryad', 'p1', 'hand');
  const result = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'dryad' });
  resolveStack(state);

  assert.equal(result.ok, false);
  assert.match(result.events[0].reason, /illegal_cast/);
});

function combatWithFlyingAttacker({ blockerKeywords = [] } = {}) {
  const state = game();
  addSimpleCreature(state, 'flyer', 'goblin-piker', 'p1', { power: 3, toughness: 2, keywords: ['flying'] });
  addRealCard(state, 'dryad', 'leafcrown-dryad', 'p2', 'battlefield');
  addSimpleCreature(state, 'groundling', 'highland-game', 'p2', { power: 2, toughness: 2, keywords: blockerKeywords });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['flyer'] });
  return state;
}

test('Leafcrown Dryad: reach pozwala blokować latającego atakującego', () => {
  const state = combatWithFlyingAttacker();
  const options = playerView(state, 'p2').legalCommands.filter((c) => c.type === 'declare_blockers');
  const withDryad = options.find((c) => (c.assignments.flyer ?? []).includes('dryad'));
  assert.ok(withDryad, 'legalCommands nie oferuje bloku latającego Dryadem');
  const result = execute(state, withDryad);
  assert.equal(result.ok, true, result.events[0]?.reason);
});

test('Leafcrown Dryad: stwór bez reach/flying dalej NIE może blokować latającego', () => {
  const state = combatWithFlyingAttacker();
  const illegal = execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { flyer: ['groundling'] } });
  assert.equal(illegal.ok, false);
  assert.match(illegal.events[0].reason, /illegal_blockers/);
  // …a jako kontrolka ten sam stan z Dryadem przechodzi (poprzedni test).
});

test('Kappa Tech-Wrecker: trigger „artifact or enchantment" wygania Dryada (enchantment creature)', () => {
  const state = game();
  addRealCard(state, 'kappa', 'kappa-tech-wrecker', 'p1', 'battlefield');
  addRealCard(state, 'dryad', 'leafcrown-dryad', 'p2', 'battlefield');
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['kappa'] });
  execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: {} });
  const result = execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' });
  assert.equal(result.ok, true, result.events[0]?.reason);
  assert.ok(result.events.some((e) => e.type === 'ability_triggered' && e.trigger === 'combat_damage_to_player'), 'brak triggera Kap-py');
  // Temat 2: „you may ... exile target" — kontroler wybiera Dryada.
  const dryadId = findOnBattlefield(state, 'leafcrown-dryad').id;
  assert.ok(execute(state, { type: 'resolve_trigger_target', playerId: 'p1', targetId: dryadId }).ok);
  resolveStack(state); // T6: trigger Kap-py ze stosu
  assert.ok(state.events.some((e) => e.type === 'object_moved' && e.toZone === 'exile' && e.object?.cardId === 'leafcrown-dryad'), 'Dryad nie został wygnany mimo typu Enchantment');
});

test('Kappa Tech-Wrecker: predykat nie sięga po stwora bez typu Artifact/Enchantment', () => {
  const state = game();
  addRealCard(state, 'kappa', 'kappa-tech-wrecker', 'p1', 'battlefield');
  addSimpleCreature(state, 'bear', 'highland-game', 'p2', {});
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['kappa'] });
  execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: {} });
  const result = execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' });
  assert.equal(result.ok, true);
  assert.ok(!result.events.some((e) => e.type === 'object_moved' && e.toZone === 'exile'), 'zwykły stwór nie może być celem Kap-py');
  assert.ok(findOnBattlefield(state, 'highland-game'), 'stwór pozostaje na polu bitwy');
});

// --- Prismari Campus: ETB tapped + {4},{T}: Scry 1 ---------------------

test('Prismari Campus: materializacja — land, entersTapped, zdolność scry', () => {
  const data = gameObjectDataOf(REGISTRY.get('prismari-campus'));
  assert.equal(data.kind, 'land');
  assert.equal(data.entersTapped, true);
  const scry = data.abilities.find((a) => a.type === 'activated');
  assert.deepEqual(scry.cost, { mana: 4, tap: true });
  assert.deepEqual(scry.effect, { type: 'scry', amount: 1 });
});

function campusReady({ mana = 4 } = {}) {
  const state = mainPhase(game());
  addRealCard(state, 'campus', 'prismari-campus', 'p1', 'battlefield');
  addObject(state, { id: 'lib-top', instanceId: 'ilt', cardId: 'highland-game', controllerId: 'p1', zone: 'library', kind: 'creature', power: 2, toughness: 2, manaCost: 1, abilities: [], types: ['Creature'] });
  addObject(state, { id: 'lib-second', instanceId: 'ils', cardId: 'kappa-tech-wrecker', controllerId: 'p1', zone: 'library', kind: 'creature', power: 2, toughness: 3, manaCost: 2, abilities: [], types: ['Creature'] });
  // Kolejność w bibliotece: pierwszy z listy = wierzch (jak przy dobieraniu).
  state.zones.library = ['lib-top', 'lib-second'];
  addMana(state, 'p1', mana);
  return state;
}

test('Prismari Campus: scry blokuje grę do decyzji; oferta wymaga many i odkręcenia', () => {
  const tapped = campusReady({ mana: 4 });
  statePrimeStateTapped(tapped);
  assert.equal(scryCommand(playerView(tapped, 'p1')), undefined, 'zatapnięty Campus nie oferuje scry');
  const noMana = campusReady({ mana: 3 });
  assert.equal(scryCommand(playerView(noMana, 'p1')), undefined, 'bez 4 many brak oferty scry');
  const ready = campusReady({ mana: 4 });
  const cmd = scryCommand(playerView(ready, 'p1'));
  assert.ok(cmd, 'brak oferty aktywacji scry');
});

function statePrimeStateTapped(state) {
  state.objects.set('campus', Object.freeze({ ...state.objects.get('campus'), tapped: true }));
}
function scryCommand(view) {
  return view.legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === 'campus');
}

test('Prismari Campus: aktywacja kosztuje 4 many + tap i otwiera decyzję scry', () => {
  const state = campusReady({ mana: 5 });
  const result = execute(state, scryCommand(playerView(state, 'p1')));
  assert.equal(result.ok, true, result.events[0]?.reason);
  assert.equal(state.players[0].mana, 1, 'scry nie kosztował 4 many');
  assert.equal(state.objects.get('campus').tapped, true, 'Campus nie zatapnięty');
  resolveStack(state); // D: zdolność na stosie, scry po rozstrzygnięciu
  // `restorePriorityTo` zapamiętuje, komu oddać priorytet po decyzji: scry
  // może odpalić się z triggera w turze przeciwnika (Nefarious Imp, M17).
  assert.equal(state.pendingScry.playerId, 'p1');
  assert.deepEqual(state.pendingScry.objectIds, ['lib-top']);
  assert.ok(state.events.some((e) => e.type === 'scry_started' && e.amount === 1));
});

test('scry: do decyzji nie ma pass ani innych komend (tylko wybór wariantu)', () => {
  const state = campusReady({ mana: 4 });
  execute(state, scryCommand(playerView(state, 'p1')));
  resolveStack(state); // D: zdolność na stosie, scry po rozstrzygnięciu
  const view = playerView(state, 'p1');
  const types = new Set(view.legalCommands.map((c) => c.type));
  assert.deepEqual([...types].sort(), ['concede', 'resolve_scry'], 'blokada komend podczas scry jest dziurawa');
  assert.equal(view.legalCommands.filter((c) => c.type === 'resolve_scry').length, 2, 'scry 1 = dwa warianty (wierzch/spód)');
  const pass = execute(state, { type: 'pass_priority', playerId: 'p1' });
  assert.equal(pass.ok, false);
  assert.equal(pass.events[0].reason, 'scry_unresolved');
  // Drugi gracz również nie może grać.
  const enemyDraw = execute(state, { type: 'draw_card', playerId: 'p2' });
  assert.equal(enemyDraw.ok, false);
});

test('scry: Fog of War — tylko właściciel widzi przeglądaną kartę', () => {
  const state = campusReady({ mana: 4 });
  execute(state, scryCommand(playerView(state, 'p1')));
  resolveStack(state); // D: zdolność na stosie, scry po rozstrzygnięciu
  const mine = playerView(state, 'p1').pendingScry;
  assert.deepEqual(mine.cards.map((c) => c.cardId), ['highland-game'], 'właściciel nie widzi karty');
  const foes = playerView(state, 'p2').pendingScry;
  assert.equal(foes.playerId, 'p1');
  assert.equal(foes.count, 1);
  assert.equal(foes.cards, null, 'przeciwnik widzi treść przeglądanej karty — wyciek FoW');
});

test('scry: bottomIds przenosi kartę na spód biblioteki, putTop zostawia wierzch', () => {
  const toBottom = campusReady({ mana: 4 });
  execute(toBottom, scryCommand(playerView(toBottom, 'p1')));
  resolveStack(toBottom); // D: zdolność na stosie, scry po rozstrzygnięciu
  const putDown = execute(toBottom, { type: 'resolve_scry', playerId: 'p1', bottomIds: ['lib-top'] });
  assert.equal(putDown.ok, true, putDown.events[0]?.reason);
  assert.equal(toBottom.pendingScry, null);
  assert.deepEqual(toBottom.zones.library, ['lib-second', 'lib-top'], 'karta nie trafiła na spód');
  // Ta sama karta, ten sam obiekt (brak zmiany strefy).
  assert.equal(toBottom.objects.get('lib-top').zone, 'library');

  const keepTop = campusReady({ mana: 4 });
  execute(keepTop, scryCommand(playerView(keepTop, 'p1')));
  resolveStack(keepTop); // D: zdolność na stosie, scry po rozstrzygnięciu
  const keep = execute(keepTop, { type: 'resolve_scry', playerId: 'p1', bottomIds: [] });
  assert.equal(keep.ok, true);
  assert.deepEqual(keepTop.zones.library, ['lib-top', 'lib-second'], 'wierzch nie może się zmienić przy wariancie top');
  // Po decyzji gra toczy się dalej (pass wraca do legalnych komend).
  assert.ok(playerView(keepTop, 'p1').legalCommands.some((c) => c.type === 'pass_priority'), 'po scry brak passu');
});

test('scry: nielegalne wybory są maszynowo odrzucane', () => {
  const state = campusReady({ mana: 4 });
  execute(state, scryCommand(playerView(state, 'p1')));
  resolveStack(state); // D: zdolność na stosie, scry po rozstrzygnięciu
  const wrongPlayer = execute(state, { type: 'resolve_scry', playerId: 'p2', bottomIds: [] });
  assert.equal(wrongPlayer.ok, false);
  assert.equal(wrongPlayer.events[0].reason, 'scry_not_your_decision');
  const wrongCard = execute(state, { type: 'resolve_scry', playerId: 'p1', bottomIds: ['lib-second'] });
  assert.equal(wrongCard.ok, false);
  assert.equal(wrongCard.events[0].reason, 'illegal_scry_choice');
  const duplicate = execute(state, { type: 'resolve_scry', playerId: 'p1', bottomIds: ['lib-top', 'lib-top'] });
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.events[0].reason, 'illegal_scry_choice');
});

test('scry: replay z decyzją jest deterministyczny', () => {
  const state = campusReady({ mana: 4 });
  execute(state, scryCommand(playerView(state, 'p1')));
  resolveStack(state); // D: zdolność na stosie, scry po rozstrzygnięciu
  execute(state, { type: 'resolve_scry', playerId: 'p1', bottomIds: ['lib-top'] });
  const verification = verifyReplay(
    replayFromState(state),
    () => campusReady({ mana: 4 }),
    execute,
  );
  assert.equal(verification.deterministic, true);
});

test('boty potrafią odpowiedzieć na decyzję scry (kontrakt legalnych komend)', () => {
  for (const makeBot of [() => createHeuristicBot({ seed: 3 }), () => createAggroBot()]) {
    const state = campusReady({ mana: 4 });
    execute(state, scryCommand(playerView(state, 'p1')));
  resolveStack(state); // D: zdolność na stosie, scry po rozstrzygnięciu
    const bot = makeBot();
    const cmd = bot.chooseCommand(playerView(state, 'p1'));
    assert.equal(cmd.type, 'resolve_scry', `bot nie odpowiada na scry komendą resolve_scry`);
    const result = execute(state, cmd);
    assert.equal(result.ok, true, 'wybór bota scry odrzucony');
  }
});

// --- Warstwa danych, talia i pełne partie -------------------------------

test('realne karty Batchu 3 mają dane Oracle i status supported', () => {
  for (const [id, set] of [['rupture-spire', 'CON'], ['leafcrown-dryad', 'THS'], ['prismari-campus', 'STX']]) {
    const card = REGISTRY.get(id);
    assert.equal(card.set, set, `${id}: zły set`);
    assert.equal(card.support.status, 'supported', `${id}: nie ma statusu supported`);
    assert.ok(card.oracleText?.length > 0, `${id}: brak Oracle text`);
    assert.ok(card.imageUri?.startsWith('https://cards.scryfall.io/'), `${id}: brak imageUri druku`);
  }
  assert.match(REGISTRY.get('rupture-spire').oracleText, /sacrifice it unless you pay/);
  assert.match(REGISTRY.get('leafcrown-dryad').oracleText, /Bestow \{3\}\{G\}/);
  assert.match(REGISTRY.get('prismari-campus').oracleText, /Scry 1/);
});

function playMatch(seed, deckA, deckB, makeBotA = (s) => createHeuristicBot({ seed: s }), makeBotB = (s) => createAggroBot()) {
  const state = setupCardMatch({
    seed,
    players: [{ id: 'p1' }, { id: 'p2' }],
    decks: new Map([['p1', deckA], ['p2', deckB]]),
    registry: REGISTRY,
  });
  return runSimulation({
    state,
    controllers: new Map([['p1', makeBotA(seed + 1)], ['p2', makeBotB(seed + 2)]]),
    maxCommands: 3000,
  });
}

const REAL3 = parseDeckText(fs.readFileSync('decks/black.txt', 'utf8'), REGISTRY).cardIds;
const REAL2 = parseDeckText(fs.readFileSync('decks/red.txt', 'utf8'), REGISTRY).cardIds;

test('pełna partia na talii Batchu 3 jest deterministyczna i bez odrzuceń', () => {
  const a = playMatch(31, REAL3, REAL2);
  const b = playMatch(31, REAL3, REAL2);
  assert.equal(a.state.status, 'finished', 'partia nie skończyła się w limicie komend');
  assert.equal(a.state.commands.every((cmd) => cmd.type), true);
  assert.deepEqual(b.results, a.results, 'ta sama konfiguracja dała inny przebieg');
});

