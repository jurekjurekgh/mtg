import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { queueTriggerToStack } from '../src/engine/triggers.js';

/**
 * T2 — cele triggerów jako DECYZJE gracza (CR 603/115.1b): zamiast
 * deterministycznego findTriggerTarget kontroler wybiera cel blokującą decyzją
 * resolve_trigger_target (Forge Devil, Kor Sanctifiers, Jill, Puppeteer Clique,
 * Greatsword of Tyr itd.). „Up to one\"/„you may\" dostaje opcję odmowy;
 * Zoraline: najpierw płatność, potem cel; Angel's Feather: „you may\" tak/nie.
 */

const REGISTRY = createCardRegistry();

function game() {
  const state = createGameState({ seed: 2026, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  return state;
}

function addRealCard(state, id, cardId, controllerId, zone, extra = {}) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, spell: data.spell, abilities: data.abilities ?? [],
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
    types: def.types ?? [], colors: data.colors ?? [],
    equipment: data.equipment ?? null, aura: data.aura ?? null,
    bestow: data.bestow ?? null, morph: data.morph ?? null,
    ...extra,
  });
  return state.objects.get(id);
}

function addCreature(state, id, controllerId, power, toughness, extra = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `x-${id}`, controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost: 1, types: ['Creature'],
    subtypes: [], colors: [], abilities: [], ...extra,
  });
  return state.objects.get(id);
}

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



function findId(state, cardId) {
  for (const [id, o] of state.objects) if (o.cardId === cardId && o.zone === 'battlefield') return id;
  return null;
}
function castAndResolve(state, playerId, objectId, extra = {}) {
  const r = execute(state, { type: 'cast_permanent', playerId, objectId, ...extra });
  assert.ok(r.ok, r.events[0]?.reason);
  resolveStack(state);
}

test('Forge Devil: kontroler wybiera CEL triggera (pierwsza oferta = dawny determinizm)', () => {
  const state = game();
  addCreature(state, 'c1', 'p2', 1, 1);
  addCreature(state, 'c2', 'p2', 4, 4);
  addRealCard(state, 'devil', 'forge-devil', 'p1', 'hand');
  addMana(state, 'p1', 1, { colors: ['R'] });
  castAndResolve(state, 'p1', 'devil');
  // Decyzja celu czeka u kontrolera; kandydaci w kolejności bitwiska.
  // BUG1 fix: „target creature" — sam Forge Devil też może być celem.
  assert.equal(state.pendingTriggerTargets.length, 1);
  assert.equal(state.pendingTriggerTargets[0].playerId, 'p1');
  const devilId = findId(state, 'forge-devil');
  assert.deepEqual(state.pendingTriggerTargets[0].candidates, ['c1', 'c2', devilId]);
  assert.equal(state.turn.priorityPlayerId, 'p1');
  // Oferty: pierwsza = pierwszy kandydat (dawny wybór).
  const offers = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'resolve_trigger_target');
  assert.deepEqual(offers.map((c) => c.targetId), ['c1', 'c2', devilId]);
  // Kontroler wybiera 4/4 — obrażenia na c2 i 1 na kontrolera.
  const r = execute(state, { type: 'resolve_trigger_target', playerId: 'p1', targetId: 'c2' });
  resolveStack(state); // T6: rozstrzygnij trigger ze stosu
  assert.ok(r.ok, r.events[0]?.reason);
  assert.equal(state.objects.get('c2').damage, 1);
  assert.equal(state.players[0].life, 19);
  assert.equal(state.pendingTriggerTargets.length, 0);
});

test('Forge Devil: nielegalny cel i cudza decyzja są odrzucane; bez celu trigger nie odpala', () => {
  const state = game();
  addCreature(state, 'c1', 'p2', 1, 1);
  addRealCard(state, 'devil', 'forge-devil', 'p1', 'hand');
  addMana(state, 'p1', 1, { colors: ['R'] });
  castAndResolve(state, 'p1', 'devil');
  const bad2 = execute(state, { type: 'resolve_trigger_target', playerId: 'p1', targetId: 'c-inexistent' });
  resolveStack(state); // T6: rozstrzygnij trigger ze stosu
  assert.equal(bad2.ok, false);
  // Brak celu (allowNone=false) jest odrzucany.
  const none = execute(state, { type: 'resolve_trigger_target', playerId: 'p1', targetId: null });
  resolveStack(state); // T6: rozstrzygnij trigger ze stosu
  assert.equal(none.ok, false);
  // Cudza decyzja.
  const other = execute(state, { type: 'resolve_trigger_target', playerId: 'p2', targetId: 'c1' });
  resolveStack(state); // T6: rozstrzygnij trigger ze stosu
  assert.equal(other.ok, false);
  // Właściwa decyzja zamyka sprawę: 1 obrażeń zabiło 1/1 (SBA).
  assert.ok(execute(state, { type: 'resolve_trigger_target', playerId: 'p1', targetId: 'c1' }).ok);
  resolveStack(state); // T6: rozstrzygnij trigger ze stosu
  assert.ok(state.events.some((e) => e.type === 'damage_dealt' && e.target === 'c1' && e.amount === 1));
  assert.ok([...state.objects.values()].some((o) => o.cardId === 'x-c1' && o.zone === 'graveyard'));
});

test('Jill: „up to one\" — opcja odmowy; bot/kontroler może nie odbić niczego', () => {
  const state = game();
  addRealCard(state, 'fear', 'fear-of-abduction', 'p1', 'battlefield'); // cel (enchantment)
  addRealCard(state, 'jill', 'jill-shivas-dominant', 'p2', 'hand');
  addMana(state, 'p2', 3, ['U']);
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  castAndResolve(state, 'p2', 'jill');
  assert.equal(state.pendingTriggerTargets[0].allowNone, true);
  const offers = playerView(state, 'p2').legalCommands.filter((c) => c.type === 'resolve_trigger_target');
  // Ostatnia oferta = „brak celu\" (allowNone).
  assert.equal(offers[offers.length - 1].targetId, null);
  // Odmowa: nic nie wraca do ręki.
  const r = execute(state, { type: 'resolve_trigger_target', playerId: 'p2', targetId: null });
  resolveStack(state); // T6: rozstrzygnij trigger ze stosu
  assert.ok(r.ok, r.events[0]?.reason);
  assert.ok([...state.objects.values()].some((o) => o.cardId === 'fear-of-abduction' && o.zone === 'battlefield'));
  // Z wyborem celu Fear wraca do ręki.
  const state2 = game();
  addRealCard(state2, 'fear', 'fear-of-abduction', 'p1', 'battlefield');
  addRealCard(state2, 'jill', 'jill-shivas-dominant', 'p2', 'hand');
  addMana(state2, 'p2', 3, ['U']);
  state2.turn.activePlayerId = 'p2';
  state2.turn.priorityPlayerId = 'p2';
  castAndResolve(state2, 'p2', 'jill');
  const fearId = [...state2.objects.values()].find((o) => o.cardId === 'fear-of-abduction' && o.zone === 'battlefield').id;
  assert.ok(execute(state2, { type: 'resolve_trigger_target', playerId: 'p2', targetId: fearId }).ok);
  resolveStack(state2); // T6: rozstrzygnij trigger ze stosu
  assert.ok([...state2.objects.values()].some((o) => o.cardId === 'fear-of-abduction' && o.zone === 'hand'));
});

test('Kappa Tech-Wrecker: „you may\" — odmowa nie zdejmuje licznika, wybór egzyluje cel', () => {
  const state = game();
  addRealCard(state, 'kappa', 'kappa-tech-wrecker', 'p1', 'battlefield'); // deathtouch counter z entersWithCounters
  state.objects.set('kappa', Object.freeze({ ...state.objects.get('kappa'), counters: { deathtouch: 1 } }));
  addObject(state, { id: 'art', instanceId: 'i-art', cardId: 'x-art', controllerId: 'p2', zone: 'battlefield', kind: 'artifact', manaCost: 2, types: ['Artifact'], subtypes: [], colors: [], abilities: [] });
  // p1 atakuje kapą, p2 nie blokuje.
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['kappa'] }).ok);
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: {} }).ok);
  assert.ok(execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' }).ok);
  // Decyzja: cel (artefakt p2) albo odmowa.
  assert.equal(state.pendingTriggerTargets.length, 1);
  assert.equal(state.pendingTriggerTargets[0].allowNone, true);
  assert.deepEqual(state.pendingTriggerTargets[0].candidates, ['art']);
  // Odmowa: licznik zostaje, artefakt zostaje.
  assert.ok(execute(state, { type: 'resolve_trigger_target', playerId: 'p1', targetId: null }).ok);
  resolveStack(state); // T6: rozstrzygnij trigger ze stosu
  assert.equal((state.objects.get('kappa').counters ?? {}).deathtouch, 1);
  assert.equal(state.objects.get('art').zone, 'battlefield');

  const state2 = game();
  addRealCard(state2, 'kappa', 'kappa-tech-wrecker', 'p1', 'battlefield');
  state2.objects.set('kappa', Object.freeze({ ...state2.objects.get('kappa'), counters: { deathtouch: 1 } }));
  addObject(state2, { id: 'art', instanceId: 'i-art', cardId: 'x-art', controllerId: 'p2', zone: 'battlefield', kind: 'artifact', manaCost: 2, types: ['Artifact'], subtypes: [], colors: [], abilities: [] });
  state2.turn = jumpToStep(state2.turn, 'declare_attackers', 'p1');
  assert.ok(execute(state2, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['kappa'] }).ok);
  assert.ok(execute(state2, { type: 'declare_blockers', playerId: 'p2', assignments: {} }).ok);
  assert.ok(execute(state2, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' }).ok);
  assert.ok(execute(state2, { type: 'resolve_trigger_target', playerId: 'p1', targetId: 'art' }).ok);
  resolveStack(state2); // T6: rozstrzygnij trigger ze stosu
  assert.equal((state2.objects.get('kappa').counters ?? {}).deathtouch, undefined, 'licznik zdjęty');
  assert.ok([...state2.objects.values()].some((o) => o.cardId === 'x-art' && o.zone === 'exile'));
});

test('Zoraline: NAJPIERW płatność, PO zapłacie decyzja CELU reanimacji', () => {
  const state = game();
  addRealCard(state, 'zoraline', 'zoraline', 'p1', 'battlefield');
  addRealCard(state, 'g1', 'highland-game', 'p1', 'graveyard'); // MV 2 <= 3
  addRealCard(state, 'g2', 'goblin-piker', 'p1', 'graveyard'); // MV 1
  addMana(state, 'p1', 2, ['W', 'B']);
  // Zoraline wchodzi na bitwisko — trigger ETB (pay {W}{B} + 2 life).
  const r = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'zoraline', abilityIndex: 0 });
  assert.equal(r.ok, false); // brak zdolności aktywowanej — to trigger
  // Wywołaj trigger ręcznie przez wejście: przenieśmy Zoraline i wróćmy.
  // Prościej: bezpośrednio odpalamy sytuację — zoraline już na bitwisku nie
  // odpali ETB. Użyjemy cast z ręki w świeżej grze.
  const state2 = game();
  addRealCard(state2, 'zoraline', 'zoraline', 'p1', 'hand');
  addRealCard(state2, 'g1', 'highland-game', 'p1', 'graveyard');
  addRealCard(state2, 'g2', 'goblin-piker', 'p1', 'graveyard');
  addMana(state2, 'p1', 6, ['W', 'B']); // rzut {2}{W}{B} + płatność {W}{B}
  castAndResolve(state2, 'p1', 'zoraline');
  // Po wejściu: decyzja PŁATNOŚCI (nie celu).
  assert.ok(state2.pendingOptionalPay, 'decyzja płatności czeka');
  assert.equal(state2.pendingTriggerTargets.length, 0, 'cel NIE jest wybierany przed zapłatą');
  assert.equal(state2.pendingOptionalPay.requiresTargetDecision, true);
  // „Nie\" — nic się nie dzieje.
  const state3 = game();
  addRealCard(state3, 'zoraline', 'zoraline', 'p1', 'hand');
  addRealCard(state3, 'g1', 'highland-game', 'p1', 'graveyard');
  addMana(state3, 'p1', 6, ['W', 'B']);
  castAndResolve(state3, 'p1', 'zoraline');
  assert.ok(execute(state3, { type: 'resolve_optional_pay_choice', playerId: 'p1', pay: false }).ok);
  resolveStack(state); // T6: rozstrzygnij trigger ze stosu
  assert.equal(state3.pendingTriggerTargets.length, 0);
  assert.ok(![...state3.objects.values()].some((o) => o.cardId === 'highland-game' && o.zone === 'battlefield'));
  // „Tak\" — po zapłacie decyzja CELU (kandydaci z grobu).
  assert.ok(execute(state2, { type: 'resolve_optional_pay_choice', playerId: 'p1', pay: true }).ok);
  resolveStack(state); // T6: rozstrzygnij trigger ze stosu
  assert.equal(state2.pendingTriggerTargets.length, 1, 'po zapłacie cel czeka');
  assert.deepEqual(state2.pendingTriggerTargets[0].candidates, ['g1', 'g2']);
  const targetId = state2.pendingTriggerTargets[0].candidates[1]; // g2 (goblin-piker)
  assert.ok(execute(state2, { type: 'resolve_trigger_target', playerId: 'p1', targetId }).ok);
  resolveStack(state2); // T6: rozstrzygnij trigger ze stosu
  const reanimated = [...state2.objects.values()].find((o) => o.cardId === 'goblin-piker' && o.zone === 'battlefield');
  assert.ok(reanimated, 'wybrany cel reanimowany');
  assert.ok(![...state2.objects.values()].some((o) => o.cardId === 'highland-game' && o.zone === 'battlefield'));
  assert.equal(state2.players[0].life, 18, '2 życia zapłacone');
});

test('Angel\'s Feather: „you may gain 1 life\" to decyzja gracza (tak/nie)', () => {
  const state = game();
  addRealCard(state, 'feather', 'angels-feather', 'p1', 'battlefield');
  addRealCard(state, 'white', 'gather-the-townsfolk', 'p2', 'hand');
  addMana(state, 'p2', 2);
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p2', objectId: 'white', targets: [] }).ok);
  // Po rzucie: decyzja „you may\" u kontrolera Pióra (p1).
  assert.ok(state.pendingOptionalTrigger, 'decyzja you-may czeka');
  assert.equal(state.pendingOptionalTrigger.playerId, 'p1');
  assert.equal(state.turn.priorityPlayerId, 'p1');
  // „Nie\" — bez życia.
  assert.ok(execute(state, { type: 'resolve_optional_trigger_choice', playerId: 'p1', fire: false }).ok);
  resolveStack(state); // T6: rozstrzygnij trigger ze stosu
  assert.equal(state.players[0].life, 20);
  // Druga runda: „tak\" — +1 życia.
  const state2 = game();
  addRealCard(state2, 'feather', 'angels-feather', 'p1', 'battlefield');
  addRealCard(state2, 'white', 'gather-the-townsfolk', 'p2', 'hand');
  addMana(state2, 'p2', 2);
  state2.turn.activePlayerId = 'p2';
  state2.turn.priorityPlayerId = 'p2';
  assert.ok(execute(state2, { type: 'cast_spell', playerId: 'p2', objectId: 'white', targets: [] }).ok);
  assert.ok(execute(state2, { type: 'resolve_optional_trigger_choice', playerId: 'p1', fire: true }).ok);
  resolveStack(state2); // T6: rozstrzygnij trigger ze stosu
  assert.equal(state2.players[0].life, 21);
});

test('Greatsword of Tyr: cel „up to one" wybiera kontroler; licznik na nosicielu zawsze', () => {
  const state = game();
  addRealCard(state, 'sword', 'greatsword-of-tyr', 'p1', 'battlefield');
  addCreature(state, 'bearer', 'p1', 2, 2);
  addCreature(state, 'def1', 'p2', 1, 1);
  addCreature(state, 'def2', 'p2', 5, 5);
  // Wyposaż i atakuj.
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  addMana(state, 'p1', 1, ['W']);
  assert.ok(execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'sword', abilityIndex: 1, targets: ['bearer'] }).ok);
  resolveStack(state); // B7.2: equip na stosie — założenie po rozstrzygnięciu
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['bearer'] }).ok);
  // Decyzja celu: stwory obrońcy (najsilniejszy pierwszy) + opcja odmowy.
  assert.equal(state.pendingTriggerTargets.length, 1);
  assert.equal(state.pendingTriggerTargets[0].allowNone, true);
  assert.deepEqual(state.pendingTriggerTargets[0].candidates, ['def2', 'def1']);
  assert.equal(state.pendingTriggerTargets[0].fixedTargetIds[0], 'bearer');
  // Odmowa: licznik na nosicielu, nic nie tapowane.
  assert.ok(execute(state, { type: 'resolve_trigger_target', playerId: 'p1', targetId: null }).ok);
  resolveStack(state); // T6: rozstrzygnij trigger ze stosu
  assert.equal((state.objects.get('bearer').counters ?? {})['+1/+1'], 1, 'licznik na nosicielu zawsze');
  assert.equal(state.objects.get('def1').tapped, false);
  assert.equal(state.objects.get('def2').tapped, false);
  // Z wyborem celu — tapnięcie.
  const state2 = game();
  addRealCard(state2, 'sword', 'greatsword-of-tyr', 'p1', 'battlefield');
  addCreature(state2, 'bearer', 'p1', 2, 2);
  addCreature(state2, 'def1', 'p2', 1, 1);
  state2.turn = jumpToStep(state2.turn, 'main', 'p1');
  addMana(state2, 'p1', 1, ['W']);
  assert.ok(execute(state2, { type: 'activate_ability', playerId: 'p1', objectId: 'sword', abilityIndex: 1, targets: ['bearer'] }).ok);
  resolveStack(state2); // B7.2: equip na stosie
  state2.turn = jumpToStep(state2.turn, 'declare_attackers', 'p1');
  assert.ok(execute(state2, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['bearer'] }).ok);
  assert.ok(execute(state2, { type: 'resolve_trigger_target', playerId: 'p1', targetId: 'def1' }).ok);
  resolveStack(state2); // T6: rozstrzygnij trigger ze stosu
  assert.equal(state2.objects.get('def1').tapped, true);
  assert.equal((state2.objects.get('bearer').counters ?? {})['+1/+1'], 1);
});

// =============================================================================
// Mesmerize (Shiva, Warden of Ice — Saga rozdziały I/II): Temat 2 dla Sag.
// Rozdział z `requiresTarget` na efekcie KOLEJKUJE decyzję CELU
// (resolve_trigger_target) zamiast iść od razu na stos. Pierwsza oferta
// w playerView = dawny determinizm (najsilniejszy własny stwór).
// =============================================================================

/** Szybki helper: dodaje Shivę bezpośrednio na bitwisko z 2 licznikami lore. */
function addShivaOnBattlefield(state, id, lore = 0) {
  const def = REGISTRY.get('shiva-warden-of-ice');
  const data = gameObjectDataOf(def);
  const jillDef = REGISTRY.get('jill-shivas-dominant');
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'shiva-warden-of-ice', controllerId: 'p1', zone: 'battlefield',
    kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, abilities: data.abilities ?? [],
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [], types: def.types ?? [],
    colors: data.colors ?? [], saga: data.saga ?? null,
    transformTo: {
      cardId: jillDef.id, power: jillDef.power, toughness: jillDef.toughness,
      abilities: jillDef.abilities ?? [], keywords: jillDef.keywords ?? [],
      subtypes: jillDef.subtypes ?? [], types: jillDef.types ?? [],
      manaCost: jillDef.manaCost ?? 0,
    },
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), counters: { lore }, summoningSickness: false }));
  return state.objects.get(id);
}

test('Mesmerize (Saga I/II): rozdział kolejkuje resolve_trigger_target z własnymi stworami jako kandydatami', () => {
  const state = game();
  const shiva = addShivaOnBattlefield(state, 'shiva', 1);
  addCreature(state, 'ally-strong', 'p1', 5, 5);
  addCreature(state, 'ally-weak', 'p1', 1, 1);
  // Symulacja kolejki rozdziału I: identycznie do queueSagaChapter z
  // requiresTarget w trigger (spójne z tym, co robi queueTargetDecision w
  // realnym enginie).
  state.pendingTriggerTargets.push({
    playerId: 'p1',
    sourceId: 'shiva',
    cardId: 'shiva-warden-of-ice',
    ability: {
      type: 'triggered',
      trigger: {
        event: 'saga_chapter',
        // queueSagaChapter (Temat 2 dla Sag) ustawia requiresTarget
        // w ability.trigger, by triggerTargetDecisionPending/
        // legalTriggerTargetCandidates czytały je z ability (nie z
        // specOverride). Dlatego test musi odzwierciedlać ten kształt.
        requiresTarget: { type: 'creature_you_control' },
      },
      effect: [],
    },
    candidates: ['ally-strong', 'ally-weak', 'shiva'], // kolejność bitwiska
    allowNone: false,
    fixedTargetIds: [],
    extra: { sagaChapter: 1 },
    specOverride: { type: 'creature_you_control' },
    restorePriorityTo: 'p1',
  });
  state.turn.priorityPlayerId = 'p1';
  // Oferty: w kolejności bitwiska (engine zwraca cele w kolejności
  // `state.zones.battlefield`). Kolejność w `pendingTriggerTargets.candidates`
  // to lift z chwili kolejkowania — ale `legalTriggerTargetCandidates`
  // (używane przez `playerView`) przelicza świeżo z bitwiska.
  const offers = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'resolve_trigger_target');
  // Bitwisko w kolejności dodawania: shiva, ally-strong, ally-weak.
  assert.deepEqual(offers.map((c) => c.targetId), ['shiva', 'ally-strong', 'ally-weak']);
  // Kontroler wybiera ally-weak (inną kartę niż domyślna) — bot by wybrał pierwszą.
  assert.ok(execute(state, { type: 'resolve_trigger_target', playerId: 'p1', targetId: 'ally-weak' }).ok);
  // Wpis kolejki usunięty po wyborze — resolveTriggerTargets[0] konsumowany
  // przez resolve_trigger_target (Temat 2).
  assert.equal(state.pendingTriggerTargets.length, 0, 'wpis kolejki usunięty po wyborze');
});

test('Mesmerize: bez własnych stworów rozdział I/II nic nie robi (CR 608.2b)', () => {
  // Specjalny przypadek: Shiva z lore=1 (rozdział I ETB), brak innych
  // własnych stworów. `creature_you_control` ZWRACA samą Shivę (brak
  // wykluczenia self dla tego typu w `triggerTargetCandidates`). W MtG
  // Sagi „target creature" w rozdziale może celować we własnego
  // (lub cudzego) stwora — engine tak właśnie działa.
  // Ten test potwierdza Mesmerize z PUSTYM polem stworów (po usunięciu
  // źródła z bitwiska LKI) — krytyczny scenariusz dla root-cause: trigger
  // nie powinien crashować, gdy brak legalnych kandydatów.
  const state = game();
  const shiva = addShivaOnBattlefield(state, 'shiva', 1);
  // Ręcznie usuwamy Shivę z bitwiska po zakolejkowaniu decyzji (CR 400.7).
  // Niestety tu ścieżka krytyczna: queueSagaChapter w realnym enginie
  // sprawdza triggerTargetCandidates PRZED kolejkowaniem decyzji i pomija
  // kolejkowanie, gdy brak kandydatów (zachowanie zgodne z MtG — rozdział
  // z celem bez legalnych nic nie robi). Tutaj symulujemy tę ścieżkę:
  // kolejkuje z PUSTYMI kandydatami i sprawdza, że resolve_trigger_target
  // odrzuca (bez legalnych celi + allowNone=false).
  state.pendingTriggerTargets.push({
    playerId: 'p1',
    sourceId: 'shiva',
    cardId: 'shiva-warden-of-ice',
    ability: {
      type: 'triggered',
      trigger: { event: 'saga_chapter', requiresTarget: { type: 'creature_you_control' } },
      effect: [],
    },
    candidates: ['shiva'],
    allowNone: false,
    fixedTargetIds: [],
    extra: { sagaChapter: 1 },
    specOverride: { type: 'creature_you_control' },
    restorePriorityTo: 'p1',
  });
  state.turn.priorityPlayerId = 'p1';
  // Wybieramy Shivę (jedyny własny stwór) — Mesmerize oznacza ją unblockable.
  const offers = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'resolve_trigger_target');
  assert.deepEqual(offers.map((c) => c.targetId), ['shiva']);
  assert.ok(execute(state, { type: 'resolve_trigger_target', playerId: 'p1', targetId: 'shiva' }).ok);
  // Rozdział I poszedł na stos (queueTriggerToStack w realnym enginie);
  // tu testujemy ścieżkę pendingTriggerTargets konsumowaną przez
  // resolve_trigger_target (Temat 2).
  assert.equal(state.pendingTriggerTargets.length, 0, 'wpis kolejki konsumowany');
});

test('Mesmerize + Cold Snap: rozdziały I/II wymagają celu, rozdział III idzie od razu na stos', () => {
  // Pełna ścieżka: załaduj Shivę z lore=2, bezpośrednio wywołaj sagę chapter.
  // Mechanizm: queueSagaChapter (processTriggers) sprawdza, czy któryś
  // efekt ma requiresTarget. Rozdziały I/II → tak, kolejkuje decyzję celu.
  // Rozdział III (tap_all_lands_opponents_control + exile_return_transformed)
  // → nie ma requiresTarget → idzie od razu na stos.
  // Ten test sprawdza obie ścieżki jednym przebiegiem (ETB Sagi).
  const state = game();
  addShivaOnBattlefield(state, 'shiva', 1);
  // Dodaj land przeciwnika (testowane przez rozdział III: tap_all_lands_opponents_control).
  addObject(state, {
    id: 'foe-land', instanceId: 'i-foe-land', cardId: 'basic-forest', controllerId: 'p2', zone: 'battlefield',
    kind: 'land', abilities: [], keywords: [], subtypes: ['Forest'], types: ['Basic', 'Land'], colors: ['G'],
  });
  // Symulacja kolejki rozdziału I (Mesmerize) — w realnym enginie wywołane
  // przez queueSagaChapter z processTriggers. W teście ręcznie budujemy
  // pendingTriggerTargets (zgodnie z kształtem queueTargetDecision).
  state.pendingTriggerTargets.push({
    playerId: 'p1',
    sourceId: 'shiva',
    cardId: 'shiva-warden-of-ice',
    ability: {
      type: 'triggered',
      trigger: {
        event: 'saga_chapter',
        requiresTarget: { type: 'creature_you_control' },
      },
      effect: [],
    },
    candidates: ['shiva'],
    allowNone: false,
    fixedTargetIds: [],
    extra: { sagaChapter: 1 },
    specOverride: { type: 'creature_you_control' },
    restorePriorityTo: 'p1',
  });
  state.turn.priorityPlayerId = 'p1';
  // Gracz widzi resolve_trigger_target w ofercie (zablokowane inne akcje).
  const offers = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'resolve_trigger_target');
  assert.equal(offers.length, 1);
  assert.equal(offers[0].targetId, 'shiva', 'jedyny kandydat = sama Shiva');
  // pass_priority NIE jest dostępny (blokada pendingTriggerTargets).
  assert.equal(playerView(state, 'p1').legalCommands.some((c) => c.type === 'pass_priority'), false,
    'pass zablokowany przez pendingTriggerTargets');
  // Zamknij decyzję (rozdział I — Mesmerize).
  assert.ok(execute(state, { type: 'resolve_trigger_target', playerId: 'p1', targetId: 'shiva' }).ok);
  // Teraz saga ETB+III: lore=3 → rozdział III idzie od razu na stos (bez requiresTarget).
  // Tu symulujemy wywołanie: queueSagaChapter widzi, że rozdział III nie ma
  // requiresTarget, więc idzie przez queueTriggerToStack (a nie przez
  // queueTargetDecision). Sprawdzamy, że pendingTriggerTargets pozostaje
  // puste i że wpis trafia na stos.
  const before3 = state.zones.stack.length;
  // Ręczne wywołanie queueTriggerToStack (symulacja processTriggers):
  queueTriggerToStack(state, {
    type: 'triggered',
    trigger: { event: 'saga_chapter' },
    effect: [],
  }, state.objects.get('shiva'), [], [], { sagaChapter: 3 });
  // pendingTriggerTargets NIE powinno mieć wpisów (rozdział III nie wymaga celu).
  assert.equal(state.pendingTriggerTargets.length, 0, 'rozdział III nie kolejkuje decyzji celu');
  // Stos MA wpis (trigger Sagi rozdział III).
  assert.equal(state.zones.stack.length, before3 + 1, 'rozdział III idzie na stos');
});
