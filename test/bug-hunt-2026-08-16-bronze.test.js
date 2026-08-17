// M105 — łowy na brązową odznakę (wyzwanie właściciela 2026-08-16).
//
// Siedem błędów vs Comprehensive Rules znalezionych w ISTNIEJĄCYCH kartach
// i mechanikach. Każdy test najpierw RED (na kodzie sprzed naprawy), potem
// GREEN. Szczegóły metody: docs/plans/2026-08-16-m105-brazowa-odznaka-lowy.md
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { MANA_COSTS } from '../src/cards/mana-costs-data.js';
import { parseManaCost } from '../src/engine/mana-cost.js';
import { addMana } from '../src/engine/resources.js';
import { addCounter } from '../src/engine/counters.js';
import { effectivePower, effectiveToughness } from '../src/engine/permanents.js';

const REGISTRY = createCardRegistry();

function newState({ step = 'main', activePlayerId = 'p1', turnNumber = 5 } = {}) {
  const state = createGameState({ seed: 2026, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, activePlayerId);
  state.turn.activePlayerId = activePlayerId;
  state.turn.priorityPlayerId = 'p1';
  state.turn.number = turnNumber;
  return state;
}

function putCard(state, id, cardId, controllerId = 'p1', zone = 'battlefield') {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, spell: data.spell, abilities: data.abilities ?? [],
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [], types: def.types ?? [],
    colors: data.colors ?? [], cardName: def.name, morph: def.morph,
    aura: def.aura, bestow: def.bestow, equipment: def.equipment, station: def.station,
    transformTo: def.transformTo,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

function addCreature(state, id, controllerId, extra = {}) {
  const { tapped = false, ...creation } = extra;
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'x-test', controllerId, zone: 'battlefield',
    kind: 'creature', power: 2, toughness: 2, manaCost: 2, abilities: [], keywords: [],
    subtypes: [], types: ['Creature'], colors: [], ...creation,
  });
  state.objects.set(id, Object.freeze({
    ...state.objects.get(id), summoningSickness: false, ...(tapped ? { tapped: true } : {}),
  }));
  return state.objects.get(id);
}

function addLand(state, id, controllerId, subtype = 'Forest') {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `basic-${subtype.toLowerCase()}`, controllerId,
    zone: 'battlefield', kind: 'land', abilities: [], keywords: [],
    subtypes: [subtype], types: ['Basic', 'Land'], colors: [],
  });
  return state.objects.get(id);
}

const activations = (state, objectId) => playerView(state, 'p1').legalCommands
  .filter((c) => c.type === 'activate_ability' && c.objectId === objectId);

// =============================================================================
// B1 — Trigon of Corruption: „{B}{B}, {T}: Put a charge counter" (CR 202.1)
// =============================================================================

test('B1: zdolność {B}{B} Trigon of Corruption NIE jest dostępna za manę zieloną', () => {
  const state = newState();
  putCard(state, 'trigon', 'trigon-of-corruption');
  addMana(state, 'p1', 2, { colors: ['G'] });
  const recharge = activations(state, 'trigon').filter((c) => c.abilityIndex === 0);
  assert.equal(recharge.length, 0, 'dwa zielone many nie opłacają {B}{B}');
});

test('B1: ta sama zdolność jest dostępna za dwie many czarne', () => {
  const state = newState();
  putCard(state, 'trigon', 'trigon-of-corruption');
  addMana(state, 'p1', 2, { colors: ['B', 'B'] });
  assert.equal(activations(state, 'trigon').filter((c) => c.abilityIndex === 0).length, 1);
});

test('B1: druga zdolność Trigonu ({2} generyczne) nadal działa za dowolną manę', () => {
  const state = newState();
  putCard(state, 'trigon', 'trigon-of-corruption');
  addCounter(state, 'trigon', 'charge', 1);
  addCreature(state, 'target', 'p2');
  addMana(state, 'p1', 2, { colors: ['G'] });
  assert.ok(activations(state, 'trigon').some((c) => c.abilityIndex === 1),
    '„{2}, {T}, zdejmij charge" ma koszt generyczny — zielone many wystarczają');
});

// =============================================================================
// B2 — Goblin Picker: „{R}, {T}, Discard a card: Draw a card" (CR 202.1)
// =============================================================================

test('B2: Goblin Picker nie aktywuje się za manę białą (koszt ma pip {R})', () => {
  const state = newState();
  putCard(state, 'picker', 'goblin-picker');
  addObject(state, {
    id: 'hand1', instanceId: 'ih1', cardId: 'x-test', controllerId: 'p1', zone: 'hand',
    kind: 'creature', power: 1, toughness: 1, manaCost: 1, abilities: [], keywords: [],
    subtypes: [], types: ['Creature'], colors: [],
  });
  addMana(state, 'p1', 1, { colors: ['W'] });
  assert.equal(activations(state, 'picker').length, 0);
});

test('B2: Goblin Picker aktywuje się za manę czerwoną', () => {
  const state = newState();
  putCard(state, 'picker', 'goblin-picker');
  addObject(state, {
    id: 'hand1', instanceId: 'ih1', cardId: 'x-test', controllerId: 'p1', zone: 'hand',
    kind: 'creature', power: 1, toughness: 1, manaCost: 1, abilities: [], keywords: [],
    subtypes: [], types: ['Creature'], colors: [],
  });
  addMana(state, 'p1', 1, { colors: ['R'] });
  assert.equal(activations(state, 'picker').length, 1);
});

// =============================================================================
// B3 — Monastery Flock: {2}{U} to mana value 3 (CR 202.3)
// =============================================================================

test('B3: mana value Monastery Flock zgadza się z kosztem {2}{U}', () => {
  const def = REGISTRY.get('monastery-flock');
  const parsed = parseManaCost(MANA_COSTS['monastery-flock']);
  const mv = parsed.generic + parsed.colored.length + parsed.hybrid.length + parsed.phyrexian.length;
  assert.equal(mv, 3, 'string kosztu to {2}{U}');
  assert.equal(def.manaCost, mv, 'manaCost karty musi być równy mana value kosztu');
});

test('B3: Monastery Flock nie da się zagrać za dwie many (jest za {2}{U})', () => {
  const state = newState();
  putCard(state, 'flock', 'monastery-flock', 'p1', 'hand');
  addMana(state, 'p1', 2, { colors: ['U', 'U'] });
  const casts = playerView(state, 'p1').legalCommands.filter((c) => c.objectId === 'flock' && c.type === 'cast_permanent');
  assert.equal(casts.length, 0, 'dwie many nie wystarczają na {2}{U}');
});

test('B3: strażnik katalogu — manaCost KAŻDEJ karty równa się mana value jej kosztu', () => {
  const mismatched = [];
  for (const card of REGISTRY.all()) {
    const costStr = MANA_COSTS[card.id];
    if (!costStr) continue;
    const parsed = parseManaCost(costStr);
    const mv = parsed.generic + parsed.colored.length + parsed.hybrid.length + parsed.phyrexian.length;
    // Phyrexian: pip {W/P} jest osobnym polem (płatność maną albo 2 życiem).
    const declared = (card.manaCost ?? 0) + (card.phyrexianManaCost ?? 0);
    if (declared !== mv) mismatched.push(`${card.name}: ${costStr} => ${mv}, deskryptor ${declared}`);
  }
  assert.deepEqual(mismatched, []);
});

// =============================================================================
// B4 — „Tap up to three target creatures" (CR 601.2c): wolno wybrać ZERO celów
// =============================================================================

test('B4: tryb „up to three" Aerith Rescue Mission oferuje też wariant bez celów', () => {
  const state = newState();
  putCard(state, 'aerith', 'aerith-rescue-mission', 'p1', 'hand');
  addCreature(state, 'c1', 'p2');
  addMana(state, 'p1', 4, { colors: ['W'] });
  const tapMode = playerView(state, 'p1').legalCommands
    .filter((c) => c.objectId === 'aerith' && c.modeIndex === 1);
  assert.ok(tapMode.length > 0, 'tryb tapowania jest oferowany');
  assert.ok(tapMode.some((c) => (c.targets ?? []).length === 0),
    'CR 601.2c: „up to three" pozwala wybrać zero celów');
});

test('B4: tryb „up to three" jest legalny nawet przy PUSTYM stole', () => {
  const state = newState();
  putCard(state, 'aerith', 'aerith-rescue-mission', 'p1', 'hand');
  addMana(state, 'p1', 4, { colors: ['W'] });
  const tapMode = playerView(state, 'p1').legalCommands
    .filter((c) => c.objectId === 'aerith' && c.modeIndex === 1);
  assert.equal(tapMode.length, 1, 'bez stworów zostaje jeden wariant: zero celów');
  assert.deepEqual(tapMode[0].targets ?? [], []);
});

// =============================================================================
// B5 — „tap up to one target artifact or creature" (Lodestone Needle, CR 601.2c)
// =============================================================================

test('B5: trigger Lodestone Needle pozwala odmówić celu (allowNone)', () => {
  const state = newState();
  putCard(state, 'needle', 'lodestone-needle', 'p1', 'hand');
  addCreature(state, 'own', 'p1');
  addMana(state, 'p1', 2, { colors: ['U'] });
  const cast = playerView(state, 'p1').legalCommands.find((c) => c.objectId === 'needle');
  assert.ok(cast, 'rzut artefaktu jest legalny');
  execute(state, cast);
  for (let i = 0; i < 6 && state.pendingTriggerTargets.length === 0; i += 1) {
    const view = playerView(state, state.turn.priorityPlayerId);
    const pass = view.legalCommands.find((c) => c.type === 'pass_priority');
    if (!pass) break;
    execute(state, pass);
  }
  const pending = state.pendingTriggerTargets[0];
  assert.ok(pending, 'trigger wejścia czeka na wybór celu');
  assert.equal(pending.allowNone, true, 'CR 601.2c: „up to one target" wolno pominąć');
  const choices = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'resolve_trigger_target');
  assert.ok(choices.some((c) => (c.targetId ?? null) === null),
    'gracz musi mieć ofertę „bez celu" (nie wolno zmuszać do tapnięcia własnego permanentu)');
});

// =============================================================================
// B6 — „at the beginning of the next end step" (CR 603.7b) dotyczy NAJBLIŻSZEGO
//      kroku końcowego, nie kroku końcowego kontrolera
// =============================================================================

test('B6: token-kopia Cogwork Assembler znika w kroku końcowym TURY PRZECIWNIKA', () => {
  // „{7}: Create a token that's a copy of target artifact. That token gains
  // haste. Exile it at the beginning of the next end step." Zdolność nie ma
  // ograniczenia czasowego, więc gracz aktywuje ją w turze przeciwnika —
  // wygnanie ma nastąpić w NAJBLIŻSZYM kroku końcowym (czyli jeszcze w turze
  // przeciwnika), a nie dopiero w kroku końcowym aktywującego.
  const state = newState({ activePlayerId: 'p2' });
  putCard(state, 'assembler', 'cogwork-assembler', 'p1');
  putCard(state, 'relic', 'dragonbroods-relic', 'p1');
  addMana(state, 'p1', 7);
  const act = activations(state, 'assembler').find((c) => (c.targets ?? []).includes('relic'));
  assert.ok(act, 'aktywacja {7} z celem-artefaktem jest oferowana w turze przeciwnika');
  execute(state, act);
  for (let i = 0; i < 8 && state.zones.stack.length > 0; i += 1) {
    const view = playerView(state, state.turn.priorityPlayerId);
    const pass = view.legalCommands.find((c) => c.type === 'pass_priority');
    if (!pass) break;
    execute(state, pass);
  }
  const token = [...state.objects.values()].find((o) => o.zone === 'battlefield' && o.name === "Dragonbroods' Relic");
  assert.ok(token, 'token-kopia wszedł na bitwisko');
  assert.equal(state.delayedTriggers.length, 1, 'opóźniony trigger wygnania jest uzbrojony');

  // Przewijamy turę PRZECIWNIKA do jej kroku końcowego.
  for (let i = 0; i < 40; i += 1) {
    if (state.turn.step === 'end' || state.turn.number !== 5) break;
    const view = playerView(state, state.turn.priorityPlayerId);
    const pass = view.legalCommands.find((c) => c.type === 'pass_priority');
    if (!pass) break;
    execute(state, pass);
  }
  // Rozstrzygamy stos (opóźniony trigger idzie na stos jak każdy inny).
  for (let i = 0; i < 10 && state.zones.stack.length > 0; i += 1) {
    const view = playerView(state, state.turn.priorityPlayerId);
    const pass = view.legalCommands.find((c) => c.type === 'pass_priority');
    if (!pass) break;
    execute(state, pass);
  }
  const stillThere = [...state.objects.values()].some((o) => o.zone === 'battlefield' && o.name === "Dragonbroods' Relic");
  assert.equal(stillThere, false,
    'CR 603.7b: „the next end step" to najbliższy krok końcowy — token nie może przeżyć całej tury przeciwnika');
});

test('B6: Puppeteer Clique zachowuje „YOUR next end step" (nie odpala w turze przeciwnika)', () => {
  // Anty-over-fix: tekst Puppeteer Clique mówi „at the beginning of YOUR next
  // end step", więc jego opóźniony trigger nadal czeka na krok końcowy
  // kontrolera — inaczej reanimowany stwór znikałby o turę za wcześnie.
  const state = newState({ activePlayerId: 'p2' });
  state.delayedTriggers.push({
    type: 'exile_object', objectId: 'irrelevant', playerId: 'p1',
    armedOnTurn: state.turn.number, cardId: 'puppeteer-clique',
  });
  const beforeCount = state.delayedTriggers.length;
  for (let i = 0; i < 40; i += 1) {
    if (state.turn.step === 'end' || state.turn.number !== 5) break;
    const view = playerView(state, state.turn.priorityPlayerId);
    const pass = view.legalCommands.find((c) => c.type === 'pass_priority');
    if (!pass) break;
    execute(state, pass);
  }
  assert.equal(state.delayedTriggers.length, beforeCount,
    'wpis bez znacznika „dowolny krok końcowy" czeka na turę swojego kontrolera');
});

// =============================================================================
// B7 — obrót morpha twarzą do góry to AKCJA SPECJALNA (CR 702.36b):
//      nie używa stosu i nie da się na niego odpowiedzieć
// =============================================================================

// Strażnik (nie błąd — sprawdzone w M105): obrót morpha JEST już akcją
// specjalną (performActivation: isFaceUpAction pomija stos). Test pilnuje,
// żeby nikt nie wrzucił go z powrotem na stos.
test('B7 (strażnik): obrót morpha nie kładzie nic na stos i działa natychmiast', () => {
  const state = newState();
  const def = REGISTRY.get('monastery-flock');
  addObject(state, {
    id: 'flock', instanceId: 'if', cardId: 'monastery-flock', controllerId: 'p1',
    // Zakryty permanent nosi WYDRUKOWANE P/T karty; „2/2" pokazują funkcje
    // effective* dopóki faceDown (CR 708.2) — po obrocie widać 0/5.
    zone: 'battlefield', kind: 'creature', power: 0, toughness: 5, manaCost: 0,
    // Zdolność obrotu dokłada engine przy zagraniu twarzą w dół (faceDownAbilities);
    // w teście odtwarzamy ją ręcznie, bo obiekt budujemy wprost.
    abilities: [{
      type: 'activated', keyword: 'morph',
      cost: { mana: def.morph.morphCost, colors: def.morph.colors ?? [] },
      effect: { type: 'turn_face_up' }, trigger: null,
    }],
    keywords: [], subtypes: [], types: ['Creature'], colors: [],
    morph: def.morph, cardName: null,
  });
  state.objects.set('flock', Object.freeze({
    ...state.objects.get('flock'),
    summoningSickness: false, faceDown: true,
    faceDownOriginal: {
      colors: ['U'], subtypes: def.subtypes, types: def.types,
      keywords: def.keywords, manaCost: def.manaCost, cardName: def.name,
    },
  }));
  addMana(state, 'p1', 1, { colors: ['U'] });
  const flip = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'flock');
  assert.ok(flip, 'obrót jest oferowany (CR 702.36b — kiedy masz priorytet)');
  const result = execute(state, flip);
  assert.ok(result.ok, `obrót przyjęty: ${result.events?.[0]?.reason ?? ''}`);
  assert.equal(state.zones.stack.length, 0,
    'CR 702.36b: obrót twarzą do góry NIE używa stosu');
  assert.equal(state.objects.get('flock').faceDown, false,
    'permanent jest odwrócony natychmiast — przeciwnik nie ma okna odpowiedzi');
  assert.equal(effectiveToughness(state.objects.get('flock'), state), 5, 'po obrocie widać statystyki karty (0/5)');
  assert.equal(effectivePower(state.objects.get('flock'), state), 0);
});

test('B7: zwykła zdolność aktywowana nadal idzie na stos (bez over-fixu)', () => {
  const state = newState();
  putCard(state, 'guide', 'coralhelm-guide');
  addCreature(state, 'runner', 'p1');
  addMana(state, 'p1', 5, { colors: ['U'] });
  const act = activations(state, 'guide').find((c) => (c.targets ?? []).includes('runner'));
  assert.ok(act);
  execute(state, act);
  assert.equal(state.zones.stack.length, 1, 'zdolności aktywowane (poza akcjami specjalnymi) używają stosu');
});
