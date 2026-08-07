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
import { effectiveSubtypes } from '../src/engine/permanents.js';
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
  // (permanent_sacrificed w strumieniu), a dies trigger płaci {R} i dobiera.
  const r = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'bomb', abilityIndex: 0, targets: ['foe'] });
  assert.ok(r.ok, r.events[0]?.reason);
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
  const first = state.turn.priorityPlayerId;
  const other = state.players.find((p) => p.id !== first).id;
  execute(state, { type: 'pass_priority', playerId: first });
  execute(state, { type: 'pass_priority', playerId: other });
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
  const r = execute(state, { type: 'cast_permanent', playerId: 'p2', objectId: 'jill' });
  assert.ok(r.ok, r.events[0]?.reason);
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
  const r = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'rats' });
  assert.ok(r.ok, r.events[0]?.reason);
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
  assert.ok([...state.objects.values()].some((o) => o.cardId === 'highland-game' && o.zone === 'hand'), 'dobrano kartę z efektu');
});

test('T4: Evangel of Synthesis — kontroler wybiera kartę do odrzucenia z efektu', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'evangel', 'evangel-of-synthesis', 'p1', 'hand');
  addHandCard(state, 'e1', 'p1', 1);
  addObject(state, { id: 'top', instanceId: 'it', cardId: 'highland-game', controllerId: 'p1', zone: 'library', kind: 'creature', manaCost: 2, types: ['Creature'], subtypes: [], colors: ['G'] });
  giveMana(state, 'p1', 2, ['U', 'B']);
  const r = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'evangel' });
  assert.ok(r.ok, r.events[0]?.reason);
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
