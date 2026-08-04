import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { effectivePower, effectiveToughness, effectiveKeywords } from '../src/engine/permanents.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

/**
 * Batch 15 realnych kart (ADR 0010 §2a) — 10 kart:
 * - Howl of the Night Pack (M10): token Wolf za każdy Forest
 * - Goblin Picker (DMU): {R},{T},Discard a card: Draw a card
 * - Dragon Arch (APC): {2},{T}: połóż wielokolorowego stwora z ręki
 * - Trigon of Corruption (SOM): charge counters, -1/-1 na cel
 * - Aerith Rescue Mission (FIN): modal „Choose one"
 * - Esper Stormblade (ARB): hybrid, statyczny bonus za inny wielokolorowy
 * - Forge Devil (DKA): ETB 1 obrażenia do stwora + 1 do ciebie
 * - Shatter (SOM): Destroy target artifact
 * - Sweet Oblivion (THB): mill 4 celu + Escape z cmentarza
 * - Village Rites (M21): dodatkowy koszt sacrifice a creature, dobierz 2
 *
 * Dane Oracle: docs/cards/scryfall-*.json.
 */

const REGISTRY = createCardRegistry();

function game() {
  return createGameState({ seed: 2026, players: [{ id: 'p1' }, { id: 'p2' }] });
}

function mainPhase(state, playerId = 'p1') {
  state.turn.phase = 'precombat_main';
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  state.turn.step = 'precombat_main';
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
  });
  if (opts.tapped || opts.summoningSickness) {
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), tapped: !!opts.tapped, summoningSickness: !!opts.summoningSickness }));
  }
  return state.objects.get(id);
}

function addCreature(state, id, controllerId, power, toughness, keywords = [], manaCost = 1, colors = []) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'syn-razorback', controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost,
    abilities: [], keywords, subtypes: [], types: ['Creature'], colors,
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

function addBasicForest(state, id, controllerId, tapped = false) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'basic-forest', controllerId, zone: 'battlefield',
    kind: 'land', abilities: [], keywords: [], subtypes: ['Forest'], types: ['Basic', 'Land'], colors: ['G'],
  });
  if (tapped) state.objects.set(id, Object.freeze({ ...state.objects.get(id), tapped: true }));
  return state.objects.get(id);
}

function passBoth(state) {
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
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

// =============================================================================
// Data sanity
// =============================================================================

test('Batch 15: wszystkie karty mają artId i status supported', () => {
  const ids = ['howl-of-the-night-pack', 'goblin-picker', 'dragon-arch', 'trigon-of-corruption',
    'aerith-rescue-mission', 'esper-stormblade', 'forge-devil', 'shatter',
    'sweet-oblivion', 'village-rites'];
  for (const id of ids) {
    const def = REGISTRY.get(id);
    assert.ok(def, `Brak definicji: ${id}`);
    assert.equal(def.support.status, 'supported', `${id}: nie supported`);
    assert.ok(def.artId, `${id}: brak artId`);
    assert.ok(def.imageUri, `${id}: brak imageUri`);
    assert.ok(def.oracleText, `${id}: brak oracleText`);
  }
});

test('Batch 15: talia red.txt przechodzi walidację', async () => {
  const { parseDeckText } = await import('../src/cards/deck-text.js');
  const { validateDeck } = await import('../src/cards/deck-validation.js');
  const deckText = fs.readFileSync('decks/'+`red.txt`,'utf8');
  const parsed = parseDeckText(deckText, REGISTRY);
  const result = validateDeck(parsed.cardIds, REGISTRY);
  assert.ok(result.valid, `Talia nieprawidłowa: ${(result.errors || []).join(', ')}`);
});

test('Batch 15: tokeny Wolf i Hero są limited (nie taliowalne)', () => {
  assert.equal(REGISTRY.get('token_wolf').support.status, 'limited');
  assert.equal(REGISTRY.get('token_hero').support.status, 'limited');
});

// =============================================================================
// Howl of the Night Pack — token Wolf za każdy Forest
// =============================================================================

test('Howl of the Night Pack: tworzy tyle Wolfów, ile kontrolowanych Forestów', () => {
  const state = game();
  mainPhase(state);
  addBasicForest(state, 'f1', 'p1');
  addBasicForest(state, 'f2', 'p1');
  addBasicForest(state, 'f3', 'p1');
  addRealCard(state, 'howl', 'howl-of-the-night-pack', 'p1', 'hand');
  addMana(state, 'p1', 7);
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'howl', targets: [] }).ok);
  passBoth(state); // rozstrzygnięcie czaru
  assert.equal(countByCardId(state, 'token_wolf'), 3);
});

test('Howl of the Night Pack: bez Forestów tworzy 0 Wolfów', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'howl', 'howl-of-the-night-pack', 'p1', 'hand');
  addMana(state, 'p1', 7);
  execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'howl', targets: [] });
  passBoth(state);
  assert.equal(countByCardId(state, 'token_wolf'), 0);
});

test('Howl of the Night Pack: niemożliwy bez wystarczającej many', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'howl', 'howl-of-the-night-pack', 'p1', 'hand');
  addMana(state, 'p1', 6);
  assert.ok(!hasCommand(playerView(state, 'p1'), 'cast_spell', (c) => c.objectId === 'howl'));
});

// =============================================================================
// Goblin Picker — {R},{T},Discard a card: Draw a card
// =============================================================================

test('Goblin Picker: {R},{T},Discard a card dobiera kartę (koszt discard)', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'picker', 'goblin-picker', 'p1', 'battlefield');
  // Karta w ręce do odrzucenia (koszt) + jedna na wierzchu biblioteki do dobrania.
  addRealCard(state, 'hand1', 'goblin-picker', 'p1', 'hand');
  addObject(state, { id: 'top', instanceId: 'i-top', cardId: 'shatter', controllerId: 'p1', zone: 'library', kind: 'spell', manaCost: 2, spell: REGISTRY.get('shatter').spell, colors: ['R'], types: ['Instant'] });
  addMana(state, 'p1', 1);
  const before = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p1').length;
  const result = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'picker', abilityIndex: 0 });
  assert.ok(result.ok, result.events?.map((e) => e.reason).join(''));
  const after = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p1').length;
  // Odrzucono 1 (koszt), dobrano 1 → liczba w ręce bez zmian.
  assert.equal(after, before);
  assert.ok(state.objects.get('picker').tapped, 'Źródło powinno być tapped');
});

test('Goblin Picker: niedostępna bez karty w ręce (koszt discard)', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'picker', 'goblin-picker', 'p1', 'battlefield');
  addMana(state, 'p1', 1);
  assert.ok(!hasCommand(playerView(state, 'p1'), 'activate_ability', (c) => c.objectId === 'picker'));
});

// =============================================================================
// Dragon Arch — {2},{T}: połóż wielokolorowego stwora z ręki
// =============================================================================

test('Dragon Arch: aktywacja → wybór wielokolorowego stwora → bitwisko', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'arch', 'dragon-arch', 'p1', 'battlefield');
  // Wielokolorowy stwór w ręce (Esper Stormblade: W/B/U).
  addRealCard(state, 'esper', 'esper-stormblade', 'p1', 'hand');
  addMana(state, 'p1', 2);
  const r = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'arch', abilityIndex: 0 });
  assert.ok(r.ok);
  assert.ok(state.pendingHandCreature, 'Oczekująca decyzja wyboru stwora z ręki');
  // Gracz wybiera Esper Stormblade.
  const res = execute(state, { type: 'resolve_hand_creature', playerId: 'p1', targetId: 'esper' });
  assert.ok(res.ok);
  const onBf = findId(state, 'esper-stormblade');
  assert.ok(onBf, 'Esper Stormblade powinien być na bitwisku');
});

test('Dragon Arch: „you may" — gracz może nie kłaść niczego', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'arch', 'dragon-arch', 'p1', 'battlefield');
  addRealCard(state, 'esper', 'esper-stormblade', 'p1', 'hand');
  addMana(state, 'p1', 2);
  execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'arch', abilityIndex: 0 });
  assert.ok(state.pendingHandCreature);
  execute(state, { type: 'resolve_hand_creature', playerId: 'p1', targetId: null });
  assert.equal(findId(state, 'esper-stormblade'), null, 'Stwór nie powinien wejść');
});

test('Dragon Arch: jednokolorowy stwór w ręce nie jest kandydatem', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'arch', 'dragon-arch', 'p1', 'battlefield');
  addRealCard(state, 'forge', 'forge-devil', 'p1', 'hand'); // R — jednokolorowy
  addMana(state, 'p1', 2);
  execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'arch', abilityIndex: 0 });
  // Brak wielokolorowego stwora → nic się nie dzieje (auto).
  assert.equal(state.pendingHandCreature, null);
});

// =============================================================================
// Trigon of Corruption — charge counters, -1/-1 na cel
// =============================================================================

test('Trigon of Corruption: wchodzi z trzema charge counters', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'trigon', 'trigon-of-corruption', 'p1', 'hand');
  addMana(state, 'p1', 4);
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'trigon' }).ok);
  assert.equal(state.objects.get(findId(state, 'trigon-of-corruption')).counters.charge, 3);
});

test('Trigon of Corruption: {2},{T},Remove charge → -1/-1 na celu', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'trigon', 'trigon-of-corruption', 'p1', 'battlefield');
  state.objects.set('trigon', Object.freeze({ ...state.objects.get('trigon'), counters: { charge: 3 } }));
  addCreature(state, 'target', 'p2', 2, 2);
  addMana(state, 'p1', 2);
  // abilityIndex 1 = druga zdolność (remove charge → -1/-1).
  const r = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'trigon', abilityIndex: 1, targets: ['target'] });
  assert.ok(r.ok, r.events?.map((e) => e.reason).join(''));
  assert.equal(state.objects.get('target').counters['-1/-1'], 1, 'Cel powinien mieć licznik -1/-1');
  assert.equal(state.objects.get('trigon').counters.charge, 2, 'Charge counter powinien być zdjęty');
});

test('Trigon of Corruption: druga zdolność niedostępna bez charge countera', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'trigon', 'trigon-of-corruption', 'p1', 'battlefield');
  state.objects.set('trigon', Object.freeze({ ...state.objects.get('trigon'), counters: {}, tapped: false }));
  addCreature(state, 'target', 'p2', 2, 2);
  addMana(state, 'p1', 2);
  // abilityIndex 1 wymaga charge countera — nie powinno być oferowane.
  assert.ok(!hasCommand(playerView(state, 'p1'), 'activate_ability',
    (c) => c.objectId === 'trigon' && c.abilityIndex === 1));
});

// =============================================================================
// Aerith Rescue Mission — modal „Choose one"
// =============================================================================

test('Aerith Rescue Mission: tryb Elevator tworzy trzy tokeny Hero', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'aerith', 'aerith-rescue-mission', 'p1', 'hand');
  addMana(state, 'p1', 4);
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'aerith', targets: [], modeIndex: 0 }).ok);
  passBoth(state);
  assert.equal(countByCardId(state, 'token_hero'), 3);
});

test('Aerith Rescue Mission: tryb Stairs tapuje cele i kładzie stun na jednym', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'aerith', 'aerith-rescue-mission', 'p1', 'hand');
  addCreature(state, 'c1', 'p2', 2, 2);
  addCreature(state, 'c2', 'p2', 2, 2);
  addMana(state, 'p1', 4);
  const r = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'aerith', targets: ['c1', 'c2'], modeIndex: 1, stunTargetId: 'c1' });
  assert.ok(r.ok, r.events?.map((e) => e.reason).join(''));
  passBoth(state);
  assert.ok(state.objects.get('c1').tapped && state.objects.get('c2').tapped, 'Oba cele tapnięte');
  assert.equal(state.objects.get('c1').counters.stun, 1, 'c1 powinien mieć stun counter');
  assert.equal(state.objects.get('c2').counters.stun, undefined, 'c2 bez stun countera');
});

test('Aerith Rescue Mission: warianty modal są oferowane w legalCommands', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'aerith', 'aerith-rescue-mission', 'p1', 'hand');
  addMana(state, 'p1', 4);
  const view = playerView(state, 'p1');
  assert.ok(hasCommand(view, 'cast_spell', (c) => c.objectId === 'aerith' && c.modeIndex === 0), 'Tryb Elevator');
});

// =============================================================================
// Esper Stormblade — statyczny bonus za inny wielokolorowy permanent
// =============================================================================

test('Esper Stormblade: sam jest 2/1 bez bonusu', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'esper', 'esper-stormblade', 'p1', 'battlefield');
  const obj = state.objects.get('esper');
  assert.equal(effectivePower(obj, state), 2);
  assert.equal(effectiveToughness(obj, state), 1);
  assert.ok(!effectiveKeywords(obj, state).includes('flying'));
});

test('Esper Stormblade: +1/+1 i flying przy innym wielokolorowym permanencie', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'esper', 'esper-stormblade', 'p1', 'battlefield');
  // Illusory Demon (B/U) — inny wielokolorowy permanent.
  addCreature(state, 'demon', 'p1', 4, 3, ['flying'], 3, ['B', 'U']);
  const obj = state.objects.get('esper');
  assert.equal(effectivePower(obj, state), 3, '+1/+1');
  assert.equal(effectiveToughness(obj, state), 2, '+1/+1');
  assert.ok(effectiveKeywords(obj, state).includes('flying'), 'flying');
});

test('Esper Stormblade: jednokolorowy permanent nie aktywuje bonusu', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'esper', 'esper-stormblade', 'p1', 'battlefield');
  addCreature(state, 'mono', 'p1', 2, 2, [], 2, ['R']); // jednokolorowy
  const obj = state.objects.get('esper');
  assert.equal(effectivePower(obj, state), 2, 'Bez bonusu');
});

// =============================================================================
// Forge Devil — ETB 1 obrażenia do stwora + 1 do ciebie
// =============================================================================

test('Forge Devil: ETB zadaje 1 obrażenia celowi-stworowi i 1 kontrolerowi', () => {
  const state = game();
  mainPhase(state);
  addCreature(state, 'foe', 'p2', 2, 3); // jedyny stwór — deterministyczny cel
  addRealCard(state, 'devil', 'forge-devil', 'p1', 'hand');
  addMana(state, 'p1', 1);
  const before = state.players.find((p) => p.id === 'p1').life;
  const r = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'devil' });
  assert.ok(r.ok);
  assert.equal(state.objects.get('foe').damage, 1, 'Stwór-cel z 1 obrażeniem');
  assert.equal(state.players.find((p) => p.id === 'p1').life, before - 1, 'Kontroler traci 1 życie');
});

// =============================================================================
// Shatter — Destroy target artifact
// =============================================================================

test('Shatter: niszczy artefakt-cel (do grobu)', () => {
  const state = game();
  mainPhase(state);
  addArtifact(state, 'art', 'p2', 2);
  addRealCard(state, 'shatter', 'shatter', 'p1', 'hand');
  addMana(state, 'p1', 2);
  const r = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'shatter', targets: ['art'] });
  assert.ok(r.ok);
  passBoth(state);
  assert.equal(state.objects.get('art'), undefined, 'Artefakt zniszczony (do grobu)');
  assert.equal(countByCardId(state, 'syn-mystery', 'graveyard'), 1);
});

test('Shatter: niedostępny bez artefaktu na bitwisku', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'shatter', 'shatter', 'p1', 'hand');
  addMana(state, 'p1', 2);
  assert.ok(!hasCommand(playerView(state, 'p1'), 'cast_spell', (c) => c.objectId === 'shatter'));
});

test('Shatter: nielegalny cel-stwór odrzucony', () => {
  const state = game();
  mainPhase(state);
  addCreature(state, 'cre', 'p2', 2, 2);
  addRealCard(state, 'shatter', 'shatter', 'p1', 'hand');
  addMana(state, 'p1', 2);
  const r = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'shatter', targets: ['cre'] });
  assert.ok(!r.ok, 'Stwór nie jest legalnym celem Shatter');
});

// =============================================================================
// Sweet Oblivion — mill 4 celu + Escape z cmentarza
// =============================================================================

test('Sweet Oblivion: mill 4 kart celu-gracza', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'sweet', 'sweet-oblivion', 'p1', 'hand');
  addMana(state, 'p1', 2);
  // 4 karty w bibliotece p2.
  for (let i = 0; i < 4; i += 1) {
    addObject(state, { id: `lib${i}`, instanceId: `i-lib${i}`, cardId: 'shatter', controllerId: 'p2', zone: 'library', kind: 'spell', manaCost: 2, spell: REGISTRY.get('shatter').spell, colors: ['R'], types: ['Instant'] });
  }
  const r = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'sweet', targets: ['p2'] });
  assert.ok(r.ok);
  passBoth(state);
  assert.equal(state.zones.graveyard.filter((id) => state.objects.get(id)?.controllerId === 'p2').length, 4, '4 karty p2 w grobie');
});

test('Sweet Oblivion: Escape z cmentarza (koszt + wygnanie 4 kart)', () => {
  const state = game();
  mainPhase(state);
  // Sweet Oblivion w grobie p1 + 4 inne karty w grobie (koszt wygnania).
  addObject(state, { id: 'sweet-g', instanceId: 'i-sweet-g', cardId: 'sweet-oblivion', controllerId: 'p1', zone: 'graveyard', kind: 'spell', manaCost: 2, spell: REGISTRY.get('sweet-oblivion').spell, colors: ['U'], types: ['Sorcery'] });
  const exileIds = [];
  for (let i = 0; i < 4; i += 1) {
    const gid = `g${i}`;
    exileIds.push(gid);
    addObject(state, { id: gid, instanceId: `i-${gid}`, cardId: 'shatter', controllerId: 'p1', zone: 'graveyard', kind: 'spell', manaCost: 2, spell: REGISTRY.get('shatter').spell, colors: ['R'], types: ['Instant'] });
  }
  addMana(state, 'p1', 4);
  const r = execute(state, { type: 'cast_escape', playerId: 'p1', objectId: 'sweet-g', targets: ['p2'], escapeExileIds: exileIds });
  assert.ok(r.ok, r.events?.map((e) => e.reason).join(''));
  // 4 karty wygnane, Sweet Oblivion na stosie.
  assert.equal(state.zones.exile.length, 4);
  assert.ok(state.zones.stack.includes(findId(state, 'sweet-oblivion', 'stack')));
});

test('Sweet Oblivion: Escape niedostępny bez 4 innych kart w grobie', () => {
  const state = game();
  mainPhase(state);
  addObject(state, { id: 'sweet-g', instanceId: 'i-sweet-g', cardId: 'sweet-oblivion', controllerId: 'p1', zone: 'graveyard', kind: 'spell', manaCost: 2, spell: REGISTRY.get('sweet-oblivion').spell, colors: ['U'], types: ['Sorcery'] });
  addMana(state, 'p1', 4);
  assert.ok(!hasCommand(playerView(state, 'p1'), 'cast_escape'));
});

// =============================================================================
// Village Rites — dodatkowy koszt sacrifice a creature, dobierz 2
// =============================================================================

test('Village Rites: koszt sacrifice a creature + dobierz 2', () => {
  const state = game();
  mainPhase(state);
  addCreature(state, 'sac', 'p1', 2, 2);
  addRealCard(state, 'rites', 'village-rites', 'p1', 'hand');
  // 2 karty na wierzchu biblioteki do dobrania.
  for (let i = 0; i < 2; i += 1) {
    addObject(state, { id: `top${i}`, instanceId: `i-top${i}`, cardId: 'shatter', controllerId: 'p1', zone: 'library', kind: 'spell', manaCost: 2, spell: REGISTRY.get('shatter').spell, colors: ['R'], types: ['Instant'] });
  }
  addMana(state, 'p1', 1);
  const handBefore = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p1').length;
  const r = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'rites', targets: [], sacrificeTargetId: 'sac' });
  assert.ok(r.ok, r.events?.map((e) => e.reason).join(''));
  passBoth(state);
  assert.equal(state.objects.get('sac'), undefined, 'Stwór poświęcony');
  const handAfter = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p1').length;
  assert.equal(handAfter, handBefore + 1, 'Village Rites opuszcza rękę, dobiera 2: -1 +2 = +1');
});

test('Village Rites: niedostępny bez stwora do poświęcenia', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'rites', 'village-rites', 'p1', 'hand');
  addMana(state, 'p1', 1);
  assert.ok(!hasCommand(playerView(state, 'p1'), 'cast_spell', (c) => c.objectId === 'rites'));
});

