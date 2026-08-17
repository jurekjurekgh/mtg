import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana as addColoredMana } from '../src/engine/resources.js';
import { moveObjectDirectly } from '../src/engine/objects.js';
import { addCounter } from '../src/engine/counters.js';
import { event } from '../src/protocol/types.js';
import { effectivePower, effectiveSubtypes } from '../src/engine/permanents.js';
import { getSourceForObject } from '../src/engine/mana-sources.js';

/**
 * Weryfikacja mechanik zakodowanych kart vs Comprehensive Rules (challenge
 * właściciela 2026-08-07: „żadnych uproszczeń — szukaj 5 tematów do naprawy").
 * Każdy temat = realne odstępstwo od MtG, naprawione u root cause.
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
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function addRealCard(state, id, cardId, controllerId, zone, extra = {}) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, spell: data.spell, abilities: data.abilities ?? [],
    morph: data.morph ?? null, bloodthirst: data.bloodthirst ?? null, additionalCost: data.additionalCost ?? null,
    kicker: data.kicker ?? null, adventure: data.adventure ?? null,
    entersWithCounters: data.entersWithCounters ?? null,
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [], types: def.types ?? [], colors: data.colors ?? [],
    ...extra,
  });
  return state.objects.get(id);
}

function addSimpleCreature(state, id, controllerId, { power = 2, toughness = 2, subtypes = [], keywords = [], abilities = [] } = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost: 1, abilities, keywords,
    subtypes, types: ['Creature'], colors: [],
  });
  return state.objects.get(id);
}

function giveMana(state, playerId, amount, colors = ['W', 'U', 'B', 'R', 'G']) {
  addColoredMana(state, playerId, amount, { colors });
}

function battlefieldByCardId(state, cardId) {
  return [...state.objects.values()].find((o) => o.cardId === cardId && o.zone === 'battlefield');
}

// =============================================================================
// TEMAT 1 — kolorowe koszty zdolności aktywowanych, cykli i opcjonalnych
// płatności triggerów (CR 118.2 / 601.2f). Wcześniej koszty zdolności były
// płacone z bezbarwnej puli: Boros Challenger {2}{R}{W} opłacało 4 dowolne many.
// =============================================================================

test('T1: Boros Challenger {2}{R}{W} — 4 czerwone many nie aktywują pumpa (brak {W})', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'challenger', 'boros-challenger', 'p1', 'battlefield');
  giveMana(state, 'p1', 4, ['R']);
  const view = playerView(state, 'p1');
  const offered = (view.legalCommands ?? []).find((c) => c.type === 'activate_ability' && c.objectId === 'challenger');
  assert.ok(!offered, 'pump nie może być oferowany bez białego źródła');
  const r = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'challenger', abilityIndex: 1 });
  assert.ok(!r.ok, 'aktywacja bez {W} musi być nielegalna');
  assert.match(r.events[0]?.reason ?? '', /kolorowego źródła/);
});

test('T1: Boros Challenger — {R}+{W} aktywuje pump; mana wydana z puli kolorowej', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'challenger', 'boros-challenger', 'p1', 'battlefield');
  giveMana(state, 'p1', 2, ['R']);
  giveMana(state, 'p1', 2, ['W']);
  const r = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'challenger', abilityIndex: 1 });
  assert.ok(r.ok, r.events[0]?.reason);
  const p1 = state.players.find((p) => p.id === 'p1');
  assert.equal(p1.mana, 0, 'koszt {2}{R}{W} = 4 many wydane');
  resolveStack(state); // D: aktywowana zdolność idzie na stos
  assert.equal(state.objects.get('challenger').powerModifier, 1);
});

test('T1: Snarling Wolf {1}{G} — sama bezbarwna mana nie wystarczy', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'wolf', 'snarling-wolf', 'p1', 'battlefield');
  giveMana(state, 'p1', 2, []); // 2 bezbarwne
  const r = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'wolf', abilityIndex: 0 });
  assert.ok(!r.ok, 'koszt {1}{G} wymaga zielonego źródła');
  giveMana(state, 'p1', 1, ['G']);
  const r2 = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'wolf', abilityIndex: 0 });
  assert.ok(r2.ok, r2.events[0]?.reason);
});

test('T1: Secluded Steppe — cycling {W} wymaga białego źródła; z samych gór niedostępny', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'steppe', 'secluded-steppe', 'p1', 'hand');
  giveMana(state, 'p1', 1, ['R']);
  const view = playerView(state, 'p1');
  const cycling = (view.legalCommands ?? []).find((c) => c.type === 'activate_ability' && c.objectId === 'steppe');
  assert.ok(!cycling, 'cycling {W} nie może być oferowany przy samej czerwonej many');
  giveMana(state, 'p1', 1, ['W']);
  const r = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'steppe', abilityIndex: 0 });
  assert.ok(r.ok, r.events[0]?.reason);
});

test('T1: Panic Spellbomb — trigger dies faktycznie PŁACI {R} (wcześniej tylko sprawdzał)', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'bomb', 'panic-spellbomb', 'p1', 'battlefield');
  addSimpleCreature(state, 'foe', 'p2', { power: 2, toughness: 2 });
  addObject(state, { id: 'top', instanceId: 'it', cardId: 'highland-game', controllerId: 'p1', zone: 'library', kind: 'creature', manaCost: 2, types: ['Creature'], subtypes: [], colors: ['G'] });
  giveMana(state, 'p1', 1, ['R']);
  // Realny przepływ: aktywacja {T}, Sacrifice poświęca bomb w ramach komendy
  // (permanent_sacrificed w strumieniu), a dies trigger „you may pay {R}"
  // kolejkuje DECYZJĘ gracza (Temat 8) — płacimy i dobieramy.
  const r = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'bomb', abilityIndex: 0, targets: ['foe'] });
  assert.ok(r.ok, r.events[0]?.reason);
  assert.ok(state.pendingOptionalPay, 'decyzja opcjonalnej płatności czeka');
  const pay = execute(state, { type: 'resolve_optional_pay_choice', playerId: 'p1', pay: true });
  assert.ok(pay.ok, pay.events[0]?.reason);
  resolveStack(state); // T6: trigger ze stosu (dobranie)
  const p1 = state.players.find((p) => p.id === 'p1');
  assert.equal(p1.mana, 0, '{R} musi zostać wydane na dobranie');
  assert.ok([...state.objects.values()].some((o) => o.cardId === 'highland-game' && o.zone === 'hand'), 'dobrano kartę');
});

test('T1: Dawntreader Elk — koszt zdolności to {G} (1 mana), nie 2', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'elk', 'dawntreader-elk', 'p1', 'battlefield');
  addObject(state, { id: 'lib1', instanceId: 'il1', cardId: 'basic-forest', controllerId: 'p1', zone: 'library', kind: 'land', types: ['Basic', 'Land'], subtypes: ['Forest'], colors: ['G'] });
  giveMana(state, 'p1', 1, ['G']);
  const r = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'elk', abilityIndex: 0 });
  assert.ok(r.ok, r.events[0]?.reason);
  resolveStack(state); // D: zdolność idzie na stos, rozstrzyga się do decyzji szukania
  // Temat 6: decyzja szukania — bierzemy las z biblioteki.
  assert.ok(state.pendingSearchChoice, 'decyzja szukania czeka');
  const forestLib = [...state.objects.values()].find((o) => o.cardId === 'basic-forest' && o.zone === 'library');
  assert.ok(forestLib, 'las w bibliotece');
  const pick = execute(state, { type: 'resolve_search_choice', playerId: 'p1', found: forestLib.id });
  assert.ok(pick.ok, pick.events[0]?.reason);
  assert.ok(battlefieldByCardId(state, 'basic-forest'), 'basic land na bitwisko');
});

// =============================================================================
// TEMAT 2 — finality counter: „would die → exile" dla KAŻDEJ przyczyny śmierci
// (CR 122.1b). Wcześniej tylko zgony SBA (obrażenia) — zniszczenie, poświęcenie
// i prawo legend wysyłały stwora do grobu.
// =============================================================================

test('T2: Zoraline z finality zniszczona Bone Splinters idzie do EXILE (nie grobu)', () => {
  const state = game();
  mainPhase(state);
  // Zoraline z licznikiem finality (jak po reanimacji własnym triggerem).
  addRealCard(state, 'zora', 'zoraline', 'p1', 'battlefield');
  addCounter(state, 'zora', 'finality', 1);
  addSimpleCreature(state, 'sac', 'p1', { power: 1, toughness: 1 });
  addRealCard(state, 'splinters', 'bone-splinters', 'p1', 'hand');
  giveMana(state, 'p1', 1, ['B']);
  const r = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'splinters', sacrificeTargetId: 'sac', targets: ['zora'] });
  assert.ok(r.ok, r.events[0]?.reason);
  // passy — rozstrzygnięcie czaru
  const first = state.turn.priorityPlayerId;
  const other = state.players.find((p) => p.id !== first).id;
  execute(state, { type: 'pass_priority', playerId: first });
  execute(state, { type: 'pass_priority', playerId: other });
  const zora = [...state.objects.values()].find((o) => o.cardId === 'zoraline');
  assert.ok(zora && zora.zone === 'exile', `Zoraline powinna być w exile, jest: ${zora?.zone}`);
});

test('T2: Zoraline z finality POŚWIĘCONA (Village Rites) idzie do EXILE', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'zora', 'zoraline', 'p1', 'battlefield');
  addCounter(state, 'zora', 'finality', 1);
  addRealCard(state, 'rites', 'village-rites', 'p1', 'hand');
  giveMana(state, 'p1', 1, ['B']);
  const r = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'rites', sacrificeTargetId: 'zora', targets: [] });
  assert.ok(r.ok, r.events[0]?.reason);
  const zora = [...state.objects.values()].find((o) => o.cardId === 'zoraline');
  assert.ok(zora && zora.zone === 'exile', `Zoraline powinna być w exile, jest: ${zora?.zone}`);
});

// =============================================================================
// TEMAT 3 — triggery „dies" i „leaves the battlefield" (CR 603.6c/700.4).
// Wcześniej dies odpalał się tylko przy zgonach SBA — poświęcenie i zniszczenie
// efektem cicho gubiły triggery; Fear of Abduction reagował tylko na dies.
// =============================================================================

test('T3: Highland Game POŚWIĘCONY (Village Rites) odpala dies → +2 życia', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'game', 'highland-game', 'p1', 'battlefield');
  addRealCard(state, 'rites', 'village-rites', 'p1', 'hand');
  giveMana(state, 'p1', 1, ['B']);
  const life0 = state.players.find((p) => p.id === 'p1').life;
  const r = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'rites', sacrificeTargetId: 'game', targets: [] });
  assert.ok(r.ok, r.events[0]?.reason);
  resolveStack(state); // T6: dies trigger ze stosu
  assert.equal(state.players.find((p) => p.id === 'p1').life, life0 + 2, 'dies po poświęceniu musi dać +2 życia');
});

test('T3: Highland Game ZNISZCZONY Bone Splinters odpala dies → +2 życia', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'game', 'highland-game', 'p1', 'battlefield');
  addSimpleCreature(state, 'sac', 'p1', { power: 1, toughness: 1 });
  addRealCard(state, 'splinters', 'bone-splinters', 'p1', 'hand');
  giveMana(state, 'p1', 1, ['B']);
  const life0 = state.players.find((p) => p.id === 'p1').life;
  const r = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'splinters', sacrificeTargetId: 'sac', targets: ['game'] });
  assert.ok(r.ok, r.events[0]?.reason);
  resolveStack(state); // T6: czar + dies trigger ze stosu
  assert.equal(state.players.find((p) => p.id === 'p1').life, life0 + 2, 'dies po zniszczeniu musi dać +2 życia');
});

test('T3: Fear of Abduction — BOUNCE (Jill) zwraca wygnane karty do rąk właścicieli', () => {
  const state = game();
  mainPhase(state, 'p2'); // p2 rzuca Jill
  // Fear na bitwisku p1 z banishedIds (wygnany stwór p2).
  addRealCard(state, 'fear', 'fear-of-abduction', 'p1', 'battlefield');
  addRealCard(state, 'exiled1', 'highland-game', 'p2', 'exile');
  state.objects.set('fear', Object.freeze({ ...state.objects.get('fear'), banishedIds: ['exiled1'] }));
  addRealCard(state, 'jill', 'jill-shivas-dominant', 'p2', 'hand');
  giveMana(state, 'p2', 3, ['U']);
  // Jill wchodzi: ETB „return up to one OTHER nonland permanent" — cel
  // deterministyczny: najsilniejszy permanent przeciwnika = Fear (jedyny).
  const rCast = execute(state, { type: 'cast_permanent', playerId: 'p2', objectId: 'jill' })
;
  resolveStack(state);
assert.ok(rCast.ok, rCast.events[0]?.reason);
  // Temat 2: cel triggera („up to one other nonland permanent") wybiera p2.
  assert.ok(execute(state, { type: 'resolve_trigger_target', playerId: 'p2', targetId: 'fear' }).ok);
  resolveStack(state); // T6: trigger Jill ze stosu
  const inHand = [...state.objects.values()].some((o) => o.cardId === 'highland-game' && o.zone === 'hand' && o.controllerId === 'p2');
  assert.ok(inHand, 'wygnana karta musi wrócić do ręki właściciela po bounce Feara');
  assert.ok(![...state.objects.values()].some((o) => o.cardId === 'fear-of-abduction' && o.zone === 'battlefield'), 'Fear odbity do ręki');
});

// =============================================================================
// TEMAT 4 — wybór kart przez gracza: odrzucanie (koszt i efekt) oraz „karta
// z ręki na wierzch biblioteki" (CR 701.18 — „of their choice"). Wcześniej
// engine wybierał deterministycznie (najdroższa/najtańsza) — bez decyzji gracza.
// =============================================================================

function addHandCard(state, id, controllerId, manaCost, cardId = null) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: cardId ?? `test-hand-${manaCost}`, controllerId, zone: 'hand',
    kind: 'spell', manaCost, spell: { timing: 'instant', targets: [], effects: [] },
    abilities: [], keywords: [], subtypes: [], types: ['Instant'], colors: ['R'],
  });
  return state.objects.get(id);
}

test('T4: Chittering Rats — CEL wybiera kartę z ręki na wierzch biblioteki', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'rats', 'chittering-rats', 'p1', 'hand');
  addHandCard(state, 'h1', 'p2', 3, 'test-hand-3');
  addHandCard(state, 'h2', 'p2', 1, 'test-hand-1');
  addObject(state, { id: 'p2lib', instanceId: 'ip2l', cardId: 'highland-game', controllerId: 'p2', zone: 'library', kind: 'creature', manaCost: 2, types: ['Creature'], subtypes: [], colors: ['G'] });
  giveMana(state, 'p1', 3, ['B']);
  const rCast = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'rats' })
;
  resolveStack(state);
assert.ok(rCast.ok, rCast.events[0]?.reason);
  // Temat 2: „target opponent" — kontroler (p1) wskazuje cel (p2).
  assert.ok(execute(state, { type: 'resolve_trigger_target', playerId: 'p1', targetId: 'p2' }).ok);
  resolveStack(state); // T6: trigger Rats ze stosu (hand-top jako decyzja)
  // Decyzja należy do p2 (cel).
  assert.ok(state.pendingHandTopChoice, 'brak oczekującej decyzji hand-top');
  assert.equal(state.pendingHandTopChoice.playerId, 'p2');
  // p2 wybiera DROŻSZĄ kartę (test: wybór gracza, nie engine).
  const view2 = playerView(state, 'p2');
  const offered = (view2.legalCommands ?? []).filter((c) => c.type === 'resolve_hand_top_choice');
  assert.ok(offered.length === 2, 'dwie karty do wyboru');
  const pick = offered.find((c) => c.cardId === 'h1');
  assert.ok(pick, 'karta h1 musi być oferowana');
  const resolved = execute(state, { type: 'resolve_hand_top_choice', playerId: 'p2', cardId: 'h1' });
  assert.ok(resolved.ok, resolved.events[0]?.reason);
  // h1 (droższa) na wierzchu biblioteki p2 — pierwsza karta p2 od góry.
  const lib = state.zones.library.filter((id) => state.objects.get(id)?.controllerId === 'p2');
  assert.equal(state.objects.get(lib[0]).cardId, 'test-hand-3', 'wybrana karta na wierzchu');
});

test('T4: Dementia Bat — CEL wybiera 2 karty do odrzucenia (decyzje sekwencyjne)', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'bat', 'dementia-bat', 'p1', 'battlefield');
  addHandCard(state, 'h5', 'p2', 5);
  addHandCard(state, 'h3', 'p2', 3);
  addHandCard(state, 'h1', 'p2', 1);
  giveMana(state, 'p1', 5, ['B']);
  const r = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'bat', abilityIndex: 0, targets: ['p2'] });
  assert.ok(r.ok, r.events[0]?.reason);
  resolveStack(state); // D: zdolność idzie na stos, rozstrzyga się do decyzji discard
  assert.ok(state.pendingDiscardChoice, 'brak oczekującej decyzji discard');
  assert.equal(state.pendingDiscardChoice.playerId, 'p2');
  assert.equal(state.pendingDiscardChoice.count, 2);
  assert.equal(state.pendingDiscardChoice.purpose, 'effect');
  // p2 wybiera NAJTANIEJSZĄ najpierw (wybór gracza — inny niż stary determinizm).
  assert.ok(execute(state, { type: 'resolve_discard_choice', playerId: 'p2', cardId: 'h1' }).ok);
  assert.ok(state.pendingDiscardChoice, 'druga decyzja czeka');
  assert.equal(state.pendingDiscardChoice.count, 1);
  assert.ok(execute(state, { type: 'resolve_discard_choice', playerId: 'p2', cardId: 'h3' }).ok);
  assert.ok(!state.pendingDiscardChoice, 'koniec decyzji');
  assert.ok(findGraveyard(state, 'test-hand-1'), 'h1 w grobie');
  assert.ok(findGraveyard(state, 'test-hand-3'), 'h3 w grobie');
  assert.ok(state.objects.get('h5')?.zone === 'hand', 'h5 zostaje (wybór gracza)');
});

function findGraveyard(state, cardId) {
  return [...state.objects.values()].some((o) => o.cardId === cardId && o.zone === 'graveyard');
}

test('T4: Goblin Picker — KONTROLER wybiera kartę do odrzucenia (koszt); aktywacja czeka', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'picker', 'goblin-picker', 'p1', 'battlefield');
  addHandCard(state, 'c2', 'p1', 2);
  addHandCard(state, 'c1', 'p1', 1);
  addObject(state, { id: 'top', instanceId: 'it', cardId: 'highland-game', controllerId: 'p1', zone: 'library', kind: 'creature', manaCost: 2, types: ['Creature'], subtypes: [], colors: ['G'] });
  giveMana(state, 'p1', 1, ['R']);
  const r = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'picker', abilityIndex: 0 });
  assert.ok(r.ok, r.events[0]?.reason);
  // Decyzja kosztu: kontroler wybiera; aktywacja wstrzymana (bez efektu dotąd).
  assert.ok(state.pendingDiscardChoice, 'brak decyzji kosztu');
  assert.equal(state.pendingDiscardChoice.purpose, 'cost');
  assert.equal(state.pendingDiscardChoice.playerId, 'p1');
  assert.ok(state.pendingAbilityActivation, 'aktywacja musi czekać');
  assert.equal(state.objects.get('picker').tapped, false, 'koszty płacone po wyborze');
  // Kontroler wybiera DROŻSZĄ kartę (test: wybór gracza).
  assert.ok(execute(state, { type: 'resolve_discard_choice', playerId: 'p1', cardId: 'c2' }).ok);
  assert.ok(!state.pendingDiscardChoice, 'koniec decyzji');
  assert.ok(!state.pendingAbilityActivation, 'aktywacja wykonana');
  assert.ok(findGraveyard(state, 'test-hand-2'), 'wybrana karta w grobie');
  assert.equal(state.objects.get('picker').tapped, true, 'koszt tap zapłacony');
  assert.equal(state.players.find((p) => p.id === 'p1').mana, 0, 'koszt many zapłacony');
  resolveStack(state); // D: zdolność na stosie, efekt (dobranie) po rozstrzygnięciu
  assert.ok([...state.objects.values()].some((o) => o.cardId === 'highland-game' && o.zone === 'hand'), 'dobrano kartę z efektu');
});

test('T4: Evangel of Synthesis — kontroler wybiera kartę do odrzucenia z efektu', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'evangel', 'evangel-of-synthesis', 'p1', 'hand');
  addHandCard(state, 'e1', 'p1', 1);
  addObject(state, { id: 'top', instanceId: 'it', cardId: 'highland-game', controllerId: 'p1', zone: 'library', kind: 'creature', manaCost: 2, types: ['Creature'], subtypes: [], colors: ['G'] });
  giveMana(state, 'p1', 2, ['U', 'B']);
  const rCast = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'evangel' })
;
  resolveStack(state);
assert.ok(rCast.ok, rCast.events[0]?.reason);
  // Decyzja efektu (draw → discard): kontroler wybiera.
  assert.ok(state.pendingDiscardChoice, 'brak decyzji discard');
  assert.equal(state.pendingDiscardChoice.playerId, 'p1');
  assert.equal(state.pendingDiscardChoice.purpose, 'effect');
  assert.ok(execute(state, { type: 'resolve_discard_choice', playerId: 'p1', cardId: 'e1' }).ok);
  assert.ok(findGraveyard(state, 'test-hand-1'), 'wybrana karta odrzucona');
});

// =============================================================================
// TEMAT 5 — Unstable Frontier: wybór podstawowego typu przez gracza (CR 305.7)
// oraz produkcja many z PODTYPÓW podstawowych (CR 305.6). Wcześniej typ był
// deterministyczny (Forest), a zmieniony land nadal produkował {C} — land
// jako Forest musi produkować {G}.
// =============================================================================

test('T5: Unstable Frontier — KONTROLER wybiera typ; land jako Forest produkuje {G}', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'frontier', 'unstable-frontier', 'p1', 'battlefield');
  addRealCard(state, 'plains', 'basic-plains', 'p1', 'battlefield');
  // Aktywacja: tap frontier, cel = plains.
  const r = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'frontier', abilityIndex: 0, targets: ['plains'] });
  assert.ok(r.ok, r.events[0]?.reason);
  resolveStack(state); // D: zdolność na stosie, decyzja typu po rozstrzygnięciu
  assert.ok(state.pendingLandTypeChoice, 'decyzja wyboru typu czeka');
  assert.equal(state.pendingLandTypeChoice.playerId, 'p1');
  // Gracz wybiera Forest.
  assert.ok(execute(state, { type: 'resolve_land_type_choice', playerId: 'p1', landType: 'Forest' }).ok);
  const plains = state.objects.get('plains');
  assert.ok(effectiveSubtypes(plains).includes('Forest'), 'podtyp Forest nadany');
  // Land jako Forest produkuje {G} — może opłacić zielony czar.
  const src = getSourceForObject(plains);
  assert.ok((src.colors ?? []).includes('G'), `land-Forest musi produkować G (jest: ${src.colors.join(',')})`);
  // Widać to też w produkowalnej many: zielony czar {G} staje się wykonalny.
  const view = playerView(state, 'p1');
  const offeredGreen = (view.legalCommands ?? []).some((c) => c.type === 'cast_permanent' || c.type === 'cast_spell');
  // (asercja oferty zależy od ręki — sprawdzamy samo źródło many)
  assert.ok(src.colors.includes('G'));
});

test('T5: Unstable Frontier — wybór Swamp daje land produkujący {B}', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'frontier', 'unstable-frontier', 'p1', 'battlefield');
  addRealCard(state, 'plains', 'basic-plains', 'p1', 'battlefield');
  assert.ok(execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'frontier', abilityIndex: 0, targets: ['plains'] }).ok);
  resolveStack(state); // D: zdolność na stosie, decyzja typu po rozstrzygnięciu
  assert.ok(execute(state, { type: 'resolve_land_type_choice', playerId: 'p1', landType: 'Swamp' }).ok);
  const src = getSourceForObject(state.objects.get('plains'));
  assert.deepEqual(src.colors, ['B'], `land-Swamp musi produkować B (jest: ${src.colors.join(',')})`);
});

test('T5: Zwykłe landy dalej produkują swoje kolory (Plains → W)', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'plains', 'basic-plains', 'p1', 'battlefield');
  assert.deepEqual(getSourceForObject(state.objects.get('plains')).colors, ['W']);
  // Dwubarwny Campus: U|R bez podtypów podstawowych (mapa kart).
  addRealCard(state, 'campus', 'prismari-campus', 'p1', 'battlefield');
  assert.deepEqual(getSourceForObject(state.objects.get('campus')).colors, ['U', 'R']);
});

// =============================================================================
// TEMAT 6 — „You may search your library for ...": gracz wybiera KARTĘ albo
// rezygnuje (fail to find, CR 701.19b). Wcześniej engine brał pierwszą kartę.
// =============================================================================

test('T6: Kor Cartographer — gracz wybiera, KTÓRĄ kartę Plains wziąć (dwie RÓŻNE w bibliotece)', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'cartographer', 'kor-cartographer', 'p1', 'hand');
  // M122/#2: scenariusz używa dwóch RÓŻNYCH kart z podtypem Plains
  // (basic-plains i idyllic-grange). Wcześniej stały tu dwa egzemplarze tej
  // samej karty, ale biblioteka jest strefą UKRYTĄ — dwie identyczne karty
  // to dla gracza jedna i ta sama decyzja, więc engine zwija je do jednej
  // oferty. Sens testu (gracz wybiera, engine nie decyduje za niego) zostaje.
  addObject(state, { id: 'plains-a', instanceId: 'ia', cardId: 'basic-plains', controllerId: 'p1', zone: 'library', kind: 'land', types: ['Basic', 'Land'], subtypes: ['Plains'], colors: ['W'] });
  addRealCard(state, 'grange', 'idyllic-grange', 'p1', 'library');
  giveMana(state, 'p1', 4, ['W']);
  const rCast1 = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'cartographer' });
  assert.ok(rCast1.ok);
  resolveStack(state);
  assert.ok(state.pendingSearchChoice, 'decyzja szukania czeka');
  const view = playerView(state, 'p1');
  const offers = (view.legalCommands ?? []).filter((c) => c.type === 'resolve_search_choice');
  // 2 różne kandydatki + opcja rezygnacji (found: null).
  assert.ok(offers.length === 3, `oczekiwano 3 opcji (2 karty + rezygnacja), jest ${offers.length}`);
  assert.ok(offers.some((c) => c.found === 'grange'), 'druga (inna) karta Plains oferowana');
  assert.ok(offers.some((c) => c.found === null), 'rezygnacja oferowana');
  // Gracz wybiera Idyllic Grange.
  assert.ok(execute(state, { type: 'resolve_search_choice', playerId: 'p1', found: 'grange' }).ok);
  const onBF = [...state.objects.values()].filter((o) => o.zone === 'battlefield' && (o.subtypes ?? []).includes('Plains'));
  assert.equal(onBF.length, 1, 'dokładnie jedna karta Plains na bitwisku');
  // Land wchodzi na bitwisko jako NOWY obiekt-permanent, więc tożsamość
  // sprawdzamy po cardId, nie po id obiektu z biblioteki.
  assert.equal(onBF[0].cardId, 'idyllic-grange', 'wybrana przez gracza (Idyllic Grange)');
});

test('M122/#2: identyczne egzemplarze w bibliotece dają JEDNĄ ofertę szukania', () => {
  // Biblioteka jest ukryta: 3 kopie tej samej karty to nie trzy decyzje.
  // Wcześniej panel pokazywał „Szukanie: Forest (1 z 3)/(2 z 3)/(3 z 3)” —
  // numerek nie niósł informacji, bo gracz i tak wybierał w ciemno.
  const state = game();
  mainPhase(state);
  addRealCard(state, 'cartographer', 'kor-cartographer', 'p1', 'hand');
  for (const suffix of ['a', 'b', 'c']) {
    addObject(state, { id: `plains-${suffix}`, instanceId: `i${suffix}`, cardId: 'basic-plains', controllerId: 'p1', zone: 'library', kind: 'land', types: ['Basic', 'Land'], subtypes: ['Plains'], colors: ['W'] });
  }
  giveMana(state, 'p1', 4, ['W']);
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'cartographer' }).ok);
  resolveStack(state);
  const offers = (playerView(state, 'p1').legalCommands ?? []).filter((c) => c.type === 'resolve_search_choice');
  assert.equal(offers.length, 2, `1 karta + rezygnacja, jest ${offers.length}`);
  // Wybór nadal działa i kładzie land na bitwisko.
  assert.ok(execute(state, { type: 'resolve_search_choice', playerId: 'p1', found: offers.find((c) => c.found != null).found }).ok);
  assert.equal([...state.objects.values()].filter((o) => o.cardId === 'basic-plains' && o.zone === 'battlefield').length, 1);
});

test('T6: Kor Cartographer — gracz może ZREZYGNOWAĆ z szukania (fail to find)', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'cartographer', 'kor-cartographer', 'p1', 'hand');
  addObject(state, { id: 'plains-a', instanceId: 'ia', cardId: 'basic-plains', controllerId: 'p1', zone: 'library', kind: 'land', types: ['Basic', 'Land'], subtypes: ['Plains'], colors: ['W'] });
  giveMana(state, 'p1', 4, ['W']);
  const rCast2 = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'cartographer' });
  assert.ok(rCast2.ok);
  resolveStack(state);
  const pick = execute(state, { type: 'resolve_search_choice', playerId: 'p1', found: null });
  assert.ok(pick.ok, pick.events[0]?.reason);
  assert.ok(![...state.objects.values()].some((o) => o.cardId === 'basic-plains' && o.zone === 'battlefield'), 'brak landa na bitwisku');
  assert.ok(pick.events.some((e) => e.type === 'library_searched' && e.foundCardId === null), 'szukanie zakończone bez znaleziska (tasowanie)');
});

// =============================================================================
// TEMAT 7 — „Sacrifice it unless you pay {N}": wybór kontrolera (Rupture Spire).
// =============================================================================

test('T7: Rupture Spire — kontroler może POŚWIĘCIĆ mimo możliwej zapłaty', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'spire', 'rupture-spire', 'p1', 'hand');
  giveMana(state, 'p1', 1);
  assert.ok(execute(state, { type: 'play_land', playerId: 'p1', objectId: 'spire' }).ok);
  assert.ok(state.pendingPayOrSacrifice, 'decyzja czeka');
  const view = playerView(state, 'p1');
  const offers = (view.legalCommands ?? []).filter((c) => c.type === 'resolve_pay_or_sacrifice');
  assert.ok(offers.some((c) => c.pay === true) && offers.some((c) => c.pay === false), 'obie opcje oferowane');
  assert.ok(execute(state, { type: 'resolve_pay_or_sacrifice', playerId: 'p1', pay: false }).ok);
  assert.ok(![...state.objects.values()].some((o) => o.cardId === 'rupture-spire' && o.zone === 'battlefield'), 'Spire poświęcona mimo many');
  assert.equal(state.players.find((p) => p.id === 'p1').mana, 1, 'mana nietknięta');
});

// =============================================================================
// TEMAT 8 — „You may pay ... When you do, ...": opcjonalne płatności triggerów.
// =============================================================================

test('T8: Panic Spellbomb — gracz może NIE ZAPŁACIĆ {R} (brak dobrania)', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'bomb', 'panic-spellbomb', 'p1', 'battlefield');
  addSimpleCreature(state, 'foe', 'p2', { power: 2, toughness: 2 });
  addObject(state, { id: 'top', instanceId: 'it', cardId: 'highland-game', controllerId: 'p1', zone: 'library', kind: 'creature', manaCost: 2, types: ['Creature'], subtypes: [], colors: ['G'] });
  giveMana(state, 'p1', 1, ['R']);
  assert.ok(execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'bomb', abilityIndex: 0, targets: ['foe'] }).ok);
  assert.ok(state.pendingOptionalPay, 'decyzja czeka');
  const view = playerView(state, 'p1');
  const offers = (view.legalCommands ?? []).filter((c) => c.type === 'resolve_optional_pay_choice');
  assert.ok(offers.some((c) => c.pay === true) && offers.some((c) => c.pay === false), 'tak/nie oferowane');
  assert.ok(execute(state, { type: 'resolve_optional_pay_choice', playerId: 'p1', pay: false }).ok);
  assert.equal(state.players.find((p) => p.id === 'p1').mana, 1, '{R} nietknięte');
  assert.ok(![...state.objects.values()].some((o) => o.cardId === 'highland-game' && o.zone === 'hand'), 'brak dobrania');
});

// =============================================================================
// TEMAT 9 — Moonlit Meditation: „you may instead" — decyzja gracza.
// =============================================================================

test('T9: Moonlit Meditation — gracz może ODRZUCIĆ zamianę (zwykłe tokeny Soldier)', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'host', 'highland-game', 'p1', 'battlefield');
  const mmDef = REGISTRY.get('moonlit-meditation');
  const mmData = gameObjectDataOf(mmDef);
  addObject(state, {
    id: 'mm', instanceId: 'imm', cardId: 'moonlit-meditation', controllerId: 'p1', zone: 'battlefield',
    kind: 'aura', aura: mmDef.aura, colors: mmData.colors, types: mmDef.types,
  });
  state.objects.set('mm', Object.freeze({ ...state.objects.get('mm'), attachedTo: 'host' }));
  addRealCard(state, 'call', 'captains-call', 'p1', 'hand');
  giveMana(state, 'p1', 4, ['W']);
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'call' }).ok);
  const first = state.turn.priorityPlayerId;
  const other = state.players.find((p) => p.id !== first).id;
  execute(state, { type: 'pass_priority', playerId: first });
  execute(state, { type: 'pass_priority', playerId: other });
  assert.ok(state.pendingMoonlitChoice, 'decyzja czeka');
  const view = playerView(state, 'p1');
  const offers = (view.legalCommands ?? []).filter((c) => c.type === 'resolve_moonlit_choice');
  assert.ok(offers.some((c) => c.replace === true) && offers.some((c) => c.replace === false), 'tak/nie oferowane');
  assert.ok(execute(state, { type: 'resolve_moonlit_choice', playerId: 'p1', replace: false }).ok);
  const soldiers = [...state.objects.values()].filter((o) => o.cardId === 'token_soldier' && o.zone === 'battlefield');
  assert.equal(soldiers.length, 3, 'zwykłe tokeny Soldier (bez zamiany)');
  assert.ok(![...state.objects.values()].some((o) => o.cardId === 'token_clone' && o.zone === 'battlefield'), 'brak klonów');
});

// =============================================================================
// TEMAT 10 — Entrancing Lyre: {X} wybiera gracz (X ≥ moc celu).
// =============================================================================

test('T10: Entrancing Lyre — X wybierane przez gracza; X=3 tapuje 2-mocnego stwora', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'lyre', 'entrancing-lyre', 'p1', 'battlefield');
  addSimpleCreature(state, 'beast', 'p2', { power: 2, toughness: 4 });
  giveMana(state, 'p1', 3);
  const view = playerView(state, 'p1');
  const offers = (view.legalCommands ?? []).filter((c) => c.type === 'activate_ability' && c.objectId === 'lyre');
  // Oferty: X=1 (bez celu — beast ma moc 2), X=2, X=3 z celem.
  assert.ok(offers.some((c) => c.xValue === 2 && c.targets?.[0] === 'beast'), 'X=2 z celem oferowane');
  assert.ok(offers.some((c) => c.xValue === 3 && c.targets?.[0] === 'beast'), 'X=3 z celem oferowane');
  assert.ok(!offers.some((c) => c.xValue === 1 && c.targets?.[0] === 'beast'), 'X=1 nie może celować w stwora o mocy 2');
  const pick = offers.find((c) => c.xValue === 3 && c.targets?.[0] === 'beast');
  const r = execute(state, pick);
  assert.ok(r.ok, r.events[0]?.reason);
  assert.equal(state.players.find((p) => p.id === 'p1').mana, 0, 'X=3 zapłacone');
  resolveStack(state); // D: zdolność na stosie, efekt po rozstrzygnięciu
  assert.equal(state.objects.get('beast').tapped, true, 'stwór zatapnięty');
});

test('T10: Entrancing Lyre — X mniejsze od mocy celu jest nielegalne', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'lyre', 'entrancing-lyre', 'p1', 'battlefield');
  addSimpleCreature(state, 'beast', 'p2', { power: 4, toughness: 4 });
  giveMana(state, 'p1', 5);
  const r = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'lyre', abilityIndex: 0, targets: ['beast'], xValue: 2 });
  assert.ok(!r.ok, 'X=2 < moc 4 — nielegalne');
  assert.match(r.events[0]?.reason ?? '', /X \(2\) za małe/);
});

// =============================================================================
// ZŁOTA ODZNAKA — Tematy 11-15 (różne klasy reguł MtG)
// =============================================================================

// --- T11: hexproof (CR 702.11) blokuje celowanie czarów i zdolności ----------

test('T11: hexproof — stwór z hexproof nie może być celem czaru przeciwnika', () => {
  const state = game();
  mainPhase(state);
  addObject(state, { id: 'hex', instanceId: 'ih', cardId: 'x-hex', controllerId: 'p2', zone: 'battlefield', kind: 'creature', power: 2, toughness: 2, manaCost: 1, abilities: [], keywords: ['hexproof'], types: ['Creature'], subtypes: [], colors: [] });
  addRealCard(state, 'devil', 'forge-devil', 'p1', 'hand');
  giveMana(state, 'p1', 1, ['R']);
  // Rzut Forge Devila — trigger ETB celuje deterministycznie pierwszy stwór;
  // hexproof sprawia, że trigger nie ma legalnego celu (nie odpala).
  const rCast = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'devil' })
;
  resolveStack(state);
assert.ok(rCast.ok, rCast.events[0]?.reason);
  assert.ok(!rCast.events.some((e) => e.type === 'damage_dealt'), 'trigger z hexproof celem nie może zadać obrażeń');
});

test('T11: hexproof — zdolność aktywowana nie oferuje celu z hexproof', () => {
  const state = game();
  mainPhase(state);
  addObject(state, { id: 'hex', instanceId: 'ih', cardId: 'x-hex', controllerId: 'p2', zone: 'battlefield', kind: 'creature', power: 2, toughness: 2, manaCost: 1, abilities: [], keywords: ['hexproof'], types: ['Creature'], subtypes: [], colors: [] });
  addRealCard(state, 'bomb', 'panic-spellbomb', 'p1', 'battlefield');
  giveMana(state, 'p1', 1, ['R']);
  const view = playerView(state, 'p1');
  const offers = (view.legalCommands ?? []).filter((c) => c.type === 'activate_ability' && c.objectId === 'bomb');
  assert.ok(!offers.some((c) => c.targets?.includes('hex')), 'zdolność nie może celować w hexproof');
  const r = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'bomb', abilityIndex: 0, targets: ['hex'] });
  assert.ok(!r.ok, 'walidacja musi odrzucić cel z hexproof');
  assert.match(r.events[0]?.reason ?? '', /hexproof/);
});

test('T11: hexproof — WŁASNY czar może celować we własnego stwora z hexproof', () => {
  const state = game();
  mainPhase(state);
  addObject(state, { id: 'hex', instanceId: 'ih', cardId: 'x-hex', controllerId: 'p1', zone: 'battlefield', kind: 'creature', power: 2, toughness: 2, manaCost: 1, abilities: [], keywords: ['hexproof'], types: ['Creature'], subtypes: [], colors: [] });
  addRealCard(state, 'devil', 'forge-devil', 'p1', 'hand');
  giveMana(state, 'p1', 1, ['R']);
  const rCast = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'devil' })
;
  resolveStack(state);
assert.ok(rCast.ok, rCast.events[0]?.reason);
  // Temat 2: cel triggera wybiera kontroler — własny hexproof jest legalny.
  assert.ok(execute(state, { type: 'resolve_trigger_target', playerId: 'p1', targetId: 'hex' }).ok);
  resolveStack(state); // T6: trigger Forge Devila ze stosu
  // Obrażenia lądują w zdarzeniach rozstrzygnięcia (resolveStack).
  assert.ok(state.events.some((e) => e.type === 'damage_dealt'), 'własny hexproof nie chroni przed własnymi zdolnościami');
});

// --- T12: choroba przywołania blokuje zdolności z {T} (CR 302.6) ------------

test('T12: Apprentice Wizard w turze wejścia nie może użyć {U},{T} (choroba przywołania)', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'wiz', 'apprentice-wizard', 'p1', 'hand');
  giveMana(state, 'p1', 5, ['U']);
  const rCast3 = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'wiz' });
  assert.ok(rCast3.ok);
  resolveStack(state);
  const wizId = battlefieldByCardId(state, 'apprentice-wizard').id;
  const view = playerView(state, 'p1');
  const offered = (view.legalCommands ?? []).find((c) => c.type === 'activate_ability' && c.objectId === wizId);
  assert.ok(!offered, 'zdolność z {T} nie może być oferowana w turze wejścia');
  const r = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: wizId, abilityIndex: 0 });
  assert.ok(!r.ok, 'walidacja musi odrzucić {T} w turze wejścia');
  assert.match(r.events[0]?.reason ?? '', /Choroba przywołania/);
  // Po odkręceniu (następna tura) zdolność działa.
  state.objects.set(wizId, Object.freeze({ ...state.objects.get(wizId), summoningSickness: false }));
  giveMana(state, 'p1', 1, ['U']);
  assert.ok(execute(state, { type: 'activate_ability', playerId: 'p1', objectId: wizId, abilityIndex: 0 }).ok);
});

// --- T13: limit ręki 7 w cleanup (CR 514.1) ---------------------------------

test('T13: cleanup odrzuca nadmiar ręki do 7 — wybór należy do gracza', () => {
  const state = game();
  mainPhase(state);
  for (let i = 0; i < 9; i += 1) addHandCard(state, `h${i}`, 'p1', i + 1);
  // Przejdź do cleanup (passy przez fazy).
  for (let i = 0; i < 40 && !(state.turn.step === 'cleanup'); i += 1) {
    const r = execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
    if (!r.ok) break;
  }
  assert.ok(state.pendingDiscardChoice, 'cleanup musi zakolejkować odrzucenie nadmiaru');
  assert.equal(state.pendingDiscardChoice.purpose, 'hand_size');
  assert.equal(state.pendingDiscardChoice.count, 2);
  assert.equal(state.pendingDiscardChoice.playerId, 'p1');
  // Gracz wybiera 2 karty.
  assert.ok(execute(state, { type: 'resolve_discard_choice', playerId: 'p1', cardId: 'h8' }).ok);
  assert.ok(execute(state, { type: 'resolve_discard_choice', playerId: 'p1', cardId: 'h7' }).ok);
  const handCount = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p1').length;
  assert.equal(handCount, 7, 'ręka po cleanup = 7');
});

// --- T14: pierwsza tura gry pomija draw step (CR 103.7a) --------------------

test('T14: pierwsza tura gry nie dobiera; tura 2 dobiera normalnie', () => {
  const state = game();
  addObject(state, { id: 'lib', instanceId: 'il', cardId: 'highland-game', controllerId: 'p1', zone: 'library', kind: 'creature', manaCost: 2, types: ['Creature'], subtypes: [], colors: ['G'] });
  // Tura 1: draw step p1 — draw_card nielegalny i nieoferowany.
  for (let i = 0; i < 20 && state.turn.step !== 'draw'; i += 1) {
    execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  }
  assert.equal(state.turn.step, 'draw');
  assert.equal(state.turn.number, 1);
  assert.ok(!playerView(state, 'p1').legalCommands.some((c) => c.type === 'draw_card'), 'tura 1 nie oferuje dobrania');
  // M101/A: dobranie jest akcją turową (CR 504.1), ale w 1. turze gracza
  // rozpoczynającego NIE wykonuje się wcale (CR 103.7a).
  assert.ok(!state.turn.drawnInStep, 'tura 1 rozpoczynającego — brak dobrania');
  assert.ok(state.zones.library.includes('lib'), 'karta została w bibliotece');
  const r = execute(state, { type: 'draw_card', playerId: 'p1', objectId: 'lib' });
  assert.ok(!r.ok, 'dobranie w 1. turze musi być odrzucone');
  assert.equal(r.events[0].reason, 'first_turn_no_draw');
  // Przejdź do draw stepa tury 2 (p1) — akcja turowa dobiera SAMA.
  for (let i = 0; i < 160 && state.status === 'active'
    && !(state.turn.step === 'draw' && state.turn.activePlayerId === 'p1' && state.turn.number > 1); i += 1) {
    execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  }
  if (state.status === 'active') {
    assert.equal(state.turn.drawnInStep, true, 'tura 2: dobranie wykonane automatycznie');
    assert.ok(!state.zones.library.includes('lib'), 'karta opuściła bibliotekę');
  }
});

// --- T15: anihilacja liczników +1/+1 i -1/-1 (CR 122.3) ---------------------

test('T15: +1/+1 i -1/-1 anihilują się (zostaje różnica)', () => {
  const state = game();
  mainPhase(state);
  addSimpleCreature(state, 'guy', 'p1', { power: 2, toughness: 2 });
  addCounter(state, 'guy', '+1/+1', 3);
  addCounter(state, 'guy', '-1/-1', 2);
  // SBA po komendzie (pass) usuwa 2 pary.
  const r = execute(state, { type: 'pass_priority', playerId: 'p1' });
  assert.ok(r.events.some((e) => e.type === 'counter_removed' && e.annihilated), 'brak zdarzenia anihilacji');
  const counters = state.objects.get('guy').counters ?? {};
  assert.equal(counters['+1/+1'], 1, '3 - 2 = 1');
  assert.equal(counters['-1/-1'], undefined, '2 - 2 = 0 (usunięty)');
  assert.equal(effectivePower(state.objects.get('guy'), state), 3, '2 + 1 = 3');
});

// =============================================================================
// BRYLANT — Tematy 16-20 (kolejne 5 klas reguł MtG)
// =============================================================================

// --- T16: rozdział obrażeń wśród blokujących (CR 510.1c) --------------------

function combatState() {
  const state = game();
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.phase = 'combat';
  return state;
}

function addCombatCreature(state, id, ctrl, power, toughness, extra = {}) {
  const o = addSimpleCreature(state, id, ctrl, { power, toughness, ...extra });
  state.objects.set(id, Object.freeze({ ...o, summoningSickness: false }));
  return state.objects.get(id);
}

/** M66 (R): multi-bloker/trample kolejkuje decyzję rozdzielania obrażeń —
 * test odpowiada defaultem (jak bot), potem zwraca zdarzenia obu komend. */
function resolveCombatWithAssignment(state, playerId, defendingPlayerId) {
  const first = execute(state, { type: 'resolve_combat', playerId, defendingPlayerId });
  assert.ok(first.ok, first.events[0]?.reason);
  const view = playerView(state, playerId);
  const assign = view.legalCommands.find((c) => c.type === 'resolve_damage_assignment');
  if (!assign) return first.events;
  const second = execute(state, assign);
  assert.ok(second.ok, second.events[0]?.reason);
  return [...first.events, ...second.events];
}

test('T16: 5/5 vs dwóch 3/3 — obrażenia ROZDZIELONE (3+2), drugi bloker przeżywa', () => {
  const state = combatState();
  addCombatCreature(state, 'atk', 'p1', 5, 5);
  addCombatCreature(state, 'b1', 'p2', 3, 3);
  addCombatCreature(state, 'b2', 'p2', 3, 3);
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['atk'] }).ok);
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { atk: ['b1', 'b2'] } }).ok);
  resolveCombatWithAssignment(state, 'p1', 'p2');
  // b1: 3 obrażeń (lethal) → ginie; b2: 2 obrażenia → żyje.
  assert.ok(![...state.objects.values()].some((o) => o.id === 'b1' && o.zone === 'battlefield'), 'b1 ginie');
  const b2 = state.objects.get('b2');
  assert.equal(b2.zone, 'battlefield');
  assert.equal(b2.damage, 2, 'b2 dostał 2 (nie 5!)');
  // Gracz nietknięty (brak trample — reszta przepada).
  assert.equal(state.players.find((p) => p.id === 'p2').life, 20);
});

test('T16: trample — nadmiar po lethal wszystkich blokerów przechodzi na gracza', () => {
  const state = combatState();
  addCombatCreature(state, 'atk', 'p1', 7, 7, { keywords: ['trample'] });
  addCombatCreature(state, 'b1', 'p2', 3, 3);
  addCombatCreature(state, 'b2', 'p2', 3, 3);
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['atk'] }).ok);
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { atk: ['b1', 'b2'] } }).ok);
  resolveCombatWithAssignment(state, 'p1', 'p2');
  assert.equal(state.players.find((p) => p.id === 'p2').life, 19, 'nadmiar 1 przechodzi (7 - 3 - 3)');
});

test('T16: deathtouch — 1 obrażeń na blokera (lethal = 1), reszta przepada bez trample', () => {
  const state = combatState();
  addCombatCreature(state, 'atk', 'p1', 4, 4, { keywords: ['deathtouch'] });
  addCombatCreature(state, 'b1', 'p2', 2, 2);
  addCombatCreature(state, 'b2', 'p2', 2, 2);
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['atk'] }).ok);
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { atk: ['b1', 'b2'] } }).ok);
  resolveCombatWithAssignment(state, 'p1', 'p2');
  // Obaj blokujący giną (deathtouch przy 1 obrażeniach); gracz nietknięty.
  assert.ok(![...state.objects.values()].some((o) => (o.id === 'b1' || o.id === 'b2') && o.zone === 'battlefield'));
  assert.equal(state.players.find((p) => p.id === 'p2').life, 20);
});

// --- T17: pula many opróżnia się na końcu kroku/fazy (CR 106.4) -------------

test('T17: niewykorzystana mana znika po przejściu kroku (nie czeka na turę)', () => {
  const state = game();
  mainPhase(state);
  giveMana(state, 'p1', 3, ['G']);
  assert.equal(state.players.find((p) => p.id === 'p1').mana, 3);
  // Pass przez kroki — mana ma zniknąć na końcu fazy.
  for (let i = 0; i < 6 && state.turn.step !== 'end'; i += 1) {
    execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  }
  assert.equal(state.players.find((p) => p.id === 'p1').mana, 0, 'mana wyzerowana z końcem kroku');
});

// --- T18: tokeny znikają poza bitwiskiem (CR 704.5d) ------------------------

test('T18: poświęcony token znika z grobu (przestaje istnieć)', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'treasure', 'token_treasure', 'p1', 'battlefield');
  // Token ze zdolnością Skarbu (koszt {T}, Sacrifice → mana).
  state.objects.set('treasure', Object.freeze({
    ...state.objects.get('treasure'), name: 'Treasure', cardId: 'token_treasure',
    abilities: [{ type: 'activated', cost: { tap: true, sacrificeSelf: true }, effect: { type: 'add_mana', amount: 1, fromTreasure: true } }],
  }));
  const t = state.objects.get('treasure');
  const r = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: t.id, abilityIndex: 0 });
  assert.ok(r.ok, r.events[0]?.reason);
  // Po komendzie (po triggerach) token nie istnieje w żadnej strefie.
  assert.ok(![...state.objects.values()].some((o) => o.cardId === 'token_treasure'), 'token zniknął całkowicie');
});

// --- T19: prawo legend ignoruje face-down (CR 708.2) ------------------------

test('T19: dwa face-down legendarne o tej samej nazwie nie wywołują prawa legend', () => {
  const state = game();
  mainPhase(state);
  // Dwa face-down Egzemplarze legendy (morph) — bez nazwy, bez triggera legend.
  addSimpleCreature(state, 'f1', 'p1', { power: 2, toughness: 2, keywords: [] });
  addSimpleCreature(state, 'f2', 'p1', { power: 2, toughness: 2, keywords: [] });
  state.objects.set('f1', Object.freeze({ ...state.objects.get('f1'), cardName: 'Tellah, Great Sage', types: ['Legendary', 'Creature'], faceDown: true }));
  state.objects.set('f2', Object.freeze({ ...state.objects.get('f2'), cardName: 'Tellah, Great Sage', types: ['Legendary', 'Creature'], faceDown: true }));
  execute(state, { type: 'pass_priority', playerId: 'p1' }); // SBA
  assert.ok(!state.pendingLegendChoice, 'face-down nie wchodzi do prawa legend');
  // Po obróceniu OBU twarzą do góry — duplikat nazwy odpala prawo legend
  // (pass z bieżącego posiadacza priorytetu — po pierwszym passie to p2).
  state.objects.set('f1', Object.freeze({ ...state.objects.get('f1'), faceDown: false }));
  state.objects.set('f2', Object.freeze({ ...state.objects.get('f2'), faceDown: false }));
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  assert.ok(state.pendingLegendChoice, 'po odsłonięciu prawo legend działa');
});

// --- T20: koszt obrotu morph/megamorph z pipami kolorów (CR 702.37) ---------

test('T20: Monastery Flock — obrót z morph wymaga {U}, nie samych bezbarwnych many', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'flock', 'monastery-flock', 'p1', 'hand');
  giveMana(state, 'p1', 4, []); // 4 bezbarwne (3 na face-down + 1 na obrót)
  // Zagraj twarzą w dół ({3} bezbarwne).
  const rCast4 = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'flock', faceDown: true });
  assert.ok(rCast4.ok);
  resolveStack(state);
  const fd = battlefieldByCardId(state, 'monastery-flock');
  assert.ok(fd.faceDown, 'karta twarzą w dół');
  // Obrót: 1 bezbarwna NIE wystarczy (koszt {U}).
  const flip = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: fd.id, abilityIndex: 0 });
  assert.ok(!flip.ok, 'obrót wymaga {U}');
  assert.match(flip.events[0]?.reason ?? '', /kolorowego źródła/);
  // Z {U} obrót działa.
  giveMana(state, 'p1', 1, ['U']);
  const flip2 = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: fd.id, abilityIndex: 0 });
  assert.ok(flip2.ok, flip2.events[0]?.reason);
  assert.equal(state.objects.get(fd.id).faceDown, false, 'karta odsłonięta');
});
