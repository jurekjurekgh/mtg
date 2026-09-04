import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { legalBlockerOptions } from '../src/engine/combat.js';
import { effectiveKeywords, effectivePower, effectiveToughness } from '../src/engine/permanents.js';

const REGISTRY = createCardRegistry();

function game(playerId = 'p1') {
  const state = createGameState({ seed: 53, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function addCard(state, id, cardId, controllerId, zone = 'hand') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  return state.objects.get(id);
}

function addPermanent(state, id, cardId, controllerId, patch = {}) {
  const def = REGISTRY.get(cardId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone: 'battlefield',
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  if (Object.keys(patch).length) {
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
  }
  return state.objects.get(id);
}

function addSimpleCreature(state, id, controllerId, { power = 2, toughness = 2, subtypes = [], keywords = [] } = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId, ownerId: controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost: 1, abilities: [], keywords,
    subtypes, types: ['Creature'], colors: [],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

function byCard(state, cardId, controllerId = null) {
  return [...state.objects.values()]
    .find((o) => o.cardId === cardId && (controllerId == null || o.controllerId === controllerId));
}

function commands(state, playerId = 'p1') {
  return playerView(state, playerId).legalCommands;
}

function resolveStack(state, limit = 24) {
  for (let i = 0; i < limit && state.zones.stack.length > 0; i += 1) {
    const pass = commands(state, state.turn.priorityPlayerId).find((c) => c.type === 'pass_priority');
    if (!pass) break;
    const r = execute(state, pass);
    if (!r.ok && /(_unresolved|not_your_decision)$/.test(r.events[0]?.reason ?? '')) break;
  }
}

// =====================================================================
// Keep Out (ECL) — modalny instant: 4 obrażenia tapped stwora | zniszcz enchantment
// =====================================================================
test('B53: Keep Out — dane Oracle (modalny instant)', () => {
  const def = REGISTRY.get('keep-out');
  assert.deepEqual(def.types, ['Instant']);
  assert.deepEqual(def.colors, ['W']);
  assert.equal(def.manaCost, 2);
  assert.equal(def.artId, 590);
  assert.equal(def.plan, 'Wiedźmin');
  assert.equal(def.support.status, 'supported');
  assert.deepEqual(def.support.limitations, []);
  assert.equal(def.spell.modes.length, 2);
  assert.equal(def.spell.modes[0].targets[0].type, 'tapped_creature');
  assert.equal(def.spell.modes[1].targets[0].type, 'enchantment');
});

test('B53: Keep Out — tryb obrażeń w tapped stwora', () => {
  const state = game();
  addMana(state, 'p1', 2, { colors: ['W'] });
  addCard(state, 'ko', 'keep-out', 'p1', 'hand');
  // Stan bojowy nadajemy po dodaniu obiektu (addObject odrzuca spoza kontraktu).
  addObject(state, {
    id: 'tap-cre', instanceId: 'i-tap-cre', cardId: 'x-cre', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', kind: 'creature', power: 2, toughness: 6, manaCost: 2,
    abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [],
  });
  state.objects.set('tap-cre', Object.freeze({ ...state.objects.get('tap-cre'), tapped: true }));

  const cast = commands(state).find((c) => c.type === 'cast_spell' && c.objectId === 'ko' && c.modeIndex === 0 && c.targets?.[0] === 'tap-cre');
  assert.ok(cast, 'oferta trybu obrażeń w tapped stwora');
  assert.ok(execute(state, cast).ok);
  resolveStack(state);
  assert.equal(state.objects.get('tap-cre')?.zone, 'battlefield', 'stwór przeżywa 4 obrażenia (2/6)');
  assert.equal(state.objects.get('tap-cre').damage, 4);
});

test('B53: Keep Out — tryb zniszczenia enchantmentu', () => {
  const state = game();
  addMana(state, 'p1', 2, { colors: ['W'] });
  addCard(state, 'ko', 'keep-out', 'p1', 'hand');
  addObject(state, {
    id: 'ench', instanceId: 'i-ench', cardId: 'x-ench', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', kind: 'enchantment', power: null, toughness: null, manaCost: 2,
    abilities: [], keywords: [], subtypes: [], types: ['Enchantment'], colors: [],
  });
  addObject(state, {
    id: 'cre', instanceId: 'i-cre', cardId: 'x-cre2', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', kind: 'creature', power: 2, toughness: 2, manaCost: 2,
    abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [],
  });
  state.objects.set('cre', Object.freeze({ ...state.objects.get('cre'), tapped: true }));

  const cast = commands(state).find((c) => c.type === 'cast_spell' && c.objectId === 'ko' && c.modeIndex === 1 && c.targets?.[0] === 'ench');
  assert.ok(cast, 'oferta trybu zniszczenia enchantmentu');
  assert.ok(execute(state, cast).ok);
  resolveStack(state);
  assert.notEqual(state.objects.get('ench')?.zone, 'battlefield', 'enchantment zniszczony');
  assert.equal(state.objects.get('cre')?.zone, 'battlefield', 'stwór nietknięty');
});

// =====================================================================
// Ghirapur Gearcrafter (ORI) — ETB: 1/1 Thopter z lataniem
// =====================================================================
test('B53: Ghirapur Gearcrafter — dane Oracle i efekt ETB', () => {
  const def = REGISTRY.get('ghirapur-gearcrafter');
  assert.deepEqual(def.subtypes, ['Human', 'Artificer']);
  assert.deepEqual(def.colors, ['R']);
  assert.equal(def.power, 2);
  assert.equal(def.toughness, 1);
  assert.equal(def.manaCost, 3);
  assert.equal(def.artId, 596);
  assert.equal(def.plan, 'Kaladesh');
  assert.equal(def.abilities[0].trigger.event, 'enter_battlefield');
  assert.equal(def.abilities[0].effect.type, 'create_token');
  assert.equal(def.abilities[0].effect.cardId, 'token_thopter');
});

test('B53: Ghirapur Gearcrafter — wejście tworzy 1/1 Thopter z lataniem', () => {
  const state = game();
  addMana(state, 'p1', 3, { colors: ['R'] });
  addCard(state, 'gg', 'ghirapur-gearcrafter', 'p1', 'hand');
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'gg' }).ok);
  resolveStack(state);
  const thopter = [...state.objects.values()].find((o) => o.cardId === 'token_thopter' && o.zone === 'battlefield');
  assert.ok(thopter, 'Thopter utworzony');
  assert.equal(thopter.power, 1);
  assert.equal(thopter.toughness, 1);
  assert.ok((thopter.keywords ?? []).includes('flying'));
  assert.equal(thopter.controllerId, 'p1');
});

// =====================================================================
// Ironclad Slayer (EMN) — ETB: may return target Aura/Equipment from graveyard
// =====================================================================
test('B53: Ironclad Slayer — dane Oracle i filtr celu', () => {
  const def = REGISTRY.get('ironclad-slayer');
  assert.deepEqual(def.subtypes, ['Human', 'Warrior']);
  assert.deepEqual(def.colors, ['W']);
  assert.equal(def.power, 3);
  assert.equal(def.toughness, 2);
  assert.equal(def.manaCost, 3);
  assert.equal(def.artId, 594);
  assert.equal(def.plan, 'Wiedźmin');
  assert.equal(def.abilities[0].trigger.event, 'enter_battlefield');
  assert.equal(def.abilities[0].trigger.requiresTarget.type, 'aura_or_equipment_card_in_graveyard');
  assert.equal(def.abilities[0].trigger.requiresTarget.optional, true);
});

test('B53: Ironclad Slayer — zwraca Equipment z grobu, gdy wybiorę cel', () => {
  const state = game();
  addMana(state, 'p1', 3, { colors: ['W'] });
  addCard(state, 'is', 'ironclad-slayer', 'p1', 'hand');
  addCard(state, 'equip-in-gy', 'warriors-sword', 'p1', 'graveyard');
  addCard(state, 'creature-in-gy', 'highland-game', 'p1', 'graveyard');

  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'is' }).ok);
  resolveStack(state); // rozstrzygnij stos — trigger ETB przechodzi do fazy wskazywania celu
  const target = commands(state).find((c) => c.type === 'resolve_trigger_target' && c.targetId === 'equip-in-gy');
  assert.ok(target, 'oferta celu: Equipment z grobu');
  assert.ok(execute(state, target).ok);
  resolveStack(state);
  const returned = [...state.objects.values()].find((o) => o.cardId === 'warriors-sword' && o.zone === 'hand');
  assert.ok(returned, 'Equipment wrócił do ręki');
  assert.equal(state.objects.get('creature-in-gy')?.zone, 'graveyard', 'stwor w grobie nietknięty');
});

test('B53: Ironclad Slayer — odmowa celu = trigger bez efektu (you may)', () => {
  const state = game();
  addMana(state, 'p1', 3, { colors: ['W'] });
  addCard(state, 'is', 'ironclad-slayer', 'p1', 'hand');
  addCard(state, 'equip-in-gy', 'warriors-sword', 'p1', 'graveyard');

  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'is' }).ok);
  resolveStack(state);
  const decline = commands(state).find((c) => c.type === 'resolve_trigger_target' && c.targetId === null);
  assert.ok(decline, 'odmowa celu dostępna');
  assert.ok(execute(state, decline).ok);
  resolveStack(state);
  assert.equal(state.objects.get('equip-in-gy')?.zone, 'graveyard', 'bez wyboru celu nic nie wraca');
});

// =====================================================================
// Rust-Shield Rampager (BLB) — Offspring + can't be blocked by power 2 or less
// =====================================================================
test('B53: Rust-Shield Rampager — dane Oracle, Offspring i statyczna blokada', () => {
  const def = REGISTRY.get('rust-shield-rampager');
  assert.deepEqual(def.types, ['Creature']);
  assert.deepEqual(def.subtypes, ['Raccoon', 'Warrior']);
  assert.deepEqual(def.colors, ['G']);
  assert.equal(def.power, 4);
  assert.equal(def.toughness, 4);
  assert.equal(def.manaCost, 4);
  assert.equal(def.artId, 591);
  assert.equal(def.plan, 'Bloomburrow');
  assert.deepEqual(def.offspring, { cost: 2, colors: [] });
  assert.equal(def.abilities[0].type, 'static');
  assert.equal(def.abilities[0].cantBeBlockedByPower, 2);
  assert.equal(def.abilities[1].trigger.event, 'enter_battlefield');
  assert.deepEqual(def.abilities[1].trigger.condition, { wasOffspring: true });
  assert.equal(def.abilities[1].effect.type, 'create_offspring_token');
  assert.equal(def.support.status, 'supported');
  assert.deepEqual(def.support.limitations, []);
});

test('B53: Rust-Shield Rampager — bez offspringu brak tokenu', () => {
  const state = game();
  addMana(state, 'p1', 4, { colors: ['G'] });
  addCard(state, 'ram', 'rust-shield-rampager', 'p1', 'hand');
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'ram' }).ok);
  resolveStack(state);
  const origin = byCard(state, 'rust-shield-rampager', 'p1');
  assert.ok(origin && !origin.isToken, 'oryginał na polu bitwy');
  const tokens = [...state.objects.values()].filter((o) => o.zone === 'battlefield' && o.cardId === 'rust-shield-rampager' && o.isToken);
  assert.equal(tokens.length, 0, 'bez dopłaty offspring brak tokenu-kopii');
});

test('B53: Rust-Shield Rampager — Offspring {2}: 1/1 token-kopia', () => {
  const state = game();
  addMana(state, 'p1', 6, { colors: ['G'] });
  addCard(state, 'ram', 'rust-shield-rampager', 'p1', 'hand');
  const offer = commands(state).find((c) => c.type === 'cast_permanent' && c.objectId === 'ram' && c.offspring === true);
  assert.ok(offer, 'oferta wariantu offspring');
  assert.ok(execute(state, offer).ok);
  resolveStack(state);
  const token = [...state.objects.values()].find((o) => o.zone === 'battlefield' && o.cardId === 'rust-shield-rampager' && o.isToken);
  assert.ok(token, 'token-kopia utworzony');
  assert.equal(token.power, 1);
  assert.equal(token.toughness, 1);
  assert.deepEqual(token.subtypes, ['Raccoon', 'Warrior']);
  assert.equal(token.controllerId, 'p1');
});

test('B53: Rust-Shield Rampager — bloker o mocy 2 nie może blokować, o mocy 3 może', () => {
  const state = game();
  addPermanent(state, 'ram', 'rust-shield-rampager', 'p1');
  addSimpleCreature(state, 'weak', 'p2', { power: 2, toughness: 2 });
  addSimpleCreature(state, 'strong', 'p2', { power: 3, toughness: 3 });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['ram'] }).ok);
  const options = legalBlockerOptions(state, 'p2');
  assert.ok(options.some((assignment) => (assignment.ram ?? []).includes('strong')), 'silny bloker dostępny');
  for (const assignment of options) {
    assert.ok(!(assignment.ram ?? []).includes('weak'), 'bloker 2/2 nie może blokować');
  }
});

// =====================================================================
// Óin the Brave (HOB) — Storied: enduring story na graczu + haste/+1/+0
// =====================================================================
test('B53: Óin the Brave — dane Oracle i deskryptory Storied', () => {
  const def = REGISTRY.get('oin-the-brave');
  assert.deepEqual(def.types, ['Legendary', 'Creature']);
  assert.deepEqual(def.subtypes, ['Dwarf', 'Warrior']);
  assert.deepEqual(def.colors, ['R']);
  assert.equal(def.power, 1);
  assert.equal(def.toughness, 3);
  assert.equal(def.manaCost, 2);
  assert.equal(def.artId, 595);
  assert.equal(def.plan, 'Śródziemie');
  assert.equal(def.abilities[0].type, 'static');
  assert.equal(def.abilities[0].storied, true);
  assert.deepEqual(def.abilities[1].condition, { enduringStory: true });
  assert.deepEqual(def.abilities[1].pump, { power: 1, toughness: 0 });
  assert.deepEqual(def.abilities[1].keywords, ['haste']);
  assert.deepEqual(def.abilities[2].cost, { mana: 1, tap: true, colors: ['R'], discardCard: true });
  assert.equal(def.support.status, 'supported');
  assert.deepEqual(def.support.limitations, []);
});

test('B53: Óin — bez enduring story 1/3 bez haste; z 2 artefaktami 2/3 haste', () => {
  const state = game();
  addPermanent(state, 'oin', 'oin-the-brave', 'p1');
  const alone = state.objects.get('oin');
  assert.equal(effectivePower(alone, state), 1);
  assert.ok(!effectiveKeywords(alone, state).includes('haste'));
  assert.notEqual(state.players.find((p) => p.id === 'p1').enduringStory, true);

  addObject(state, {
    id: 'art1', instanceId: 'i-art1', cardId: 'test-art1', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'artifact', manaCost: 1, abilities: [], keywords: [],
    subtypes: [], types: ['Artifact'], colors: [],
  });
  addObject(state, {
    id: 'art2', instanceId: 'i-art2', cardId: 'test-art2', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'artifact', manaCost: 1, abilities: [], keywords: [],
    subtypes: [], types: ['Artifact'], colors: [],
  });
  // Odczyt statyk (lub SBA) ustawia enduring story.
  assert.equal(effectivePower(state.objects.get('oin'), state), 2);
  assert.ok(effectiveKeywords(state.objects.get('oin'), state).includes('haste'));
  assert.equal(state.players.find((p) => p.id === 'p1').enduringStory, true);
});

test('B53: Óin — enduring story zostaje po utracie permanentu', () => {
  const state = game();
  addPermanent(state, 'oin', 'oin-the-brave', 'p1');
  addObject(state, { id: 'art1', instanceId: 'i-art1', cardId: 'test-art1', controllerId: 'p1', ownerId: 'p1', zone: 'battlefield', kind: 'artifact', manaCost: 1, abilities: [], keywords: [], subtypes: [], types: ['Artifact'], colors: [] });
  addObject(state, { id: 'art2', instanceId: 'i-art2', cardId: 'test-art2', controllerId: 'p1', ownerId: 'p1', zone: 'battlefield', kind: 'artifact', manaCost: 1, abilities: [], keywords: [], subtypes: [], types: ['Artifact'], colors: [] });
  assert.equal(effectivePower(state.objects.get('oin'), state), 2);
  state.objects.set('art1', Object.freeze({ ...state.objects.get('art1'), zone: 'graveyard' }));
  state.zones.battlefield = state.zones.battlefield.filter((id) => id !== 'art1');
  state.zones.graveyard.push('art1');
  assert.equal(state.players.find((p) => p.id === 'p1').enduringStory, true, 'etykieta trwa');
  assert.equal(effectivePower(state.objects.get('oin'), state), 2);
  assert.ok(effectiveKeywords(state.objects.get('oin'), state).includes('haste'));
});

test('B53: Óin — {1},{T}, odrzuć kartę: dobierz', () => {
  const state = game();
  addPermanent(state, 'oin', 'oin-the-brave', 'p1');
  addMana(state, 'p1', 1, { colors: ['R'] });
  addObject(state, {
    id: 'tmp', instanceId: 'i-tmp', cardId: 'test-tmp', controllerId: 'p1', ownerId: 'p1',
    zone: 'hand', kind: 'card', manaCost: 0, abilities: [], keywords: [],
    subtypes: [], types: [], colors: [],
  });
  addObject(state, {
    id: 'top', instanceId: 'i-top', cardId: 'test-top', controllerId: 'p1', ownerId: 'p1',
    zone: 'library', kind: 'card', manaCost: 1, abilities: [], keywords: [],
    subtypes: [], types: [], colors: [],
  });
  const before = state.zones.hand.length;
  const activate = commands(state).find((c) => c.type === 'activate_ability' && c.objectId === 'oin' && c.abilityIndex === 2);
  assert.ok(activate, 'oferta aktywacji {1},{T},Discard');
  assert.ok(execute(state, activate).ok);
  const discard = commands(state).find((c) => c.type === 'resolve_discard_choice' && c.cardId === 'tmp');
  assert.ok(discard, 'koszt odrzucenia wybiera kartę');
  assert.ok(execute(state, discard).ok);
  assert.equal(state.objects.get('oin').tapped, true, 'koszt tap zapłacony');
  resolveStack(state);
  assert.equal(state.zones.hand.length, before, 'odrzucenie 1 + dobór 1');
});

// =====================================================================
// Ichorclaw Myr (SOM) — Infect + „becomes blocked": +2/+2, raz na blok
// =====================================================================
test('B53: Ichorclaw Myr — dane Oracle (Infect, becomes_blocked)', () => {
  const def = REGISTRY.get('ichorclaw-myr');
  assert.deepEqual(def.types, ['Artifact', 'Creature']);
  assert.deepEqual(def.subtypes, ['Phyrexian', 'Myr']);
  assert.deepEqual(def.colors, []);
  assert.equal(def.power, 1);
  assert.equal(def.toughness, 1);
  assert.equal(def.manaCost, 2);
  assert.deepEqual(def.keywords, ['infect']);
  assert.equal(def.artId, 597);
  assert.equal(def.plan, 'Mirrodin');
  assert.equal(def.abilities[0].trigger.event, 'becomes_blocked');
  assert.deepEqual(def.abilities[0].effect, { type: 'pump', power: 2, toughness: 2 });
  assert.equal(def.support.status, 'supported');
  assert.deepEqual(def.support.limitations, []);
});

test('B53: Ichorclaw Myr — zablokowany dostaje +2/+2 (raz, nawet przy 2 blokerach)', () => {
  const state = game();
  addPermanent(state, 'myr', 'ichorclaw-myr', 'p1');
  addSimpleCreature(state, 'blk1', 'p2', { power: 1, toughness: 1 });
  addSimpleCreature(state, 'blk2', 'p2', { power: 1, toughness: 1 });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['myr'] }).ok);
  assert.equal(effectivePower(state.objects.get('myr'), state), 1, 'przed blokiem 1/1');
  const block = commands(state, 'p2').find((c) => c.type === 'declare_blockers'
    && Array.isArray(c.assignments?.myr) && c.assignments.myr.includes('blk1') && c.assignments.myr.includes('blk2'));
  assert.ok(block, 'ofertowany blok dwoma stwora');
  assert.ok(execute(state, block).ok);
  resolveStack(state);
  assert.equal(effectivePower(state.objects.get('myr'), state), 3, '+2/+2, nie +4/+4');
  assert.equal(effectiveToughness(state.objects.get('myr'), state), 3);
});

test('B53: Ichorclaw Myr — bez bloku brak pumpu', () => {
  const state = game();
  addPermanent(state, 'myr', 'ichorclaw-myr', 'p1');
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['myr'] }).ok);
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: {} }).ok);
  resolveStack(state);
  assert.equal(effectivePower(state.objects.get('myr'), state), 1);
});

// =====================================================================
// Sheriff of Safe Passage (OTJ) — enters with +1/+1 for each other creature
// =====================================================================
test('B53: Sheriff of Safe Passage — dane Oracle i deskryptor wejścia', () => {
  const def = REGISTRY.get('sheriff-of-safe-passage');
  assert.deepEqual(def.types, ['Creature']);
  assert.deepEqual(def.subtypes, ['Human', 'Knight']);
  assert.deepEqual(def.colors, ['W']);
  assert.equal(def.power, 0);
  assert.equal(def.toughness, 0);
  assert.equal(def.manaCost, 3);
  assert.equal(def.artId, 598);
  assert.equal(def.plan, 'Śródziemie');
  assert.deepEqual(def.plot, { cost: 2, colors: ['W'] });
  assert.deepEqual(def.entersWithCounters, { '+1/+1': 'other_creatures_you_control_plus_one' });
  assert.equal(def.support.status, 'supported');
  assert.deepEqual(def.support.limitations, []);
});

test('B53: Sheriff of Safe Passage — wejście na pustym stole = 1 licznik (+1/+1)', () => {
  const state = game();
  addMana(state, 'p1', 3, { colors: ['W'] });
  addCard(state, 'sheriff', 'sheriff-of-safe-passage', 'p1', 'hand');
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'sheriff' }).ok);
  resolveStack(state);
  const sheriff = byCard(state, 'sheriff-of-safe-passage');
  assert.ok(sheriff, 'szeryf na polu bitwy');
  assert.equal(sheriff.counters?.['+1/+1'], 1, 'zero innych stworów → jeden licznik');
});

test('B53: Sheriff of Safe Passage — +1 za każdego INNEGO stwora', () => {
  const state = game();
  addMana(state, 'p1', 3, { colors: ['W'] });
  addSimpleCreature(state, 'ally1', 'p1', { power: 1, toughness: 1 });
  addSimpleCreature(state, 'ally2', 'p1', { power: 1, toughness: 1 });
  addCard(state, 'sheriff', 'sheriff-of-safe-passage', 'p1', 'hand');
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'sheriff' }).ok);
  resolveStack(state);
  const sheriff = byCard(state, 'sheriff-of-safe-passage');
  assert.ok(sheriff, 'szeryf na polu bitwy');
  assert.equal(sheriff.counters?.['+1/+1'], 3, '1 bazowy + 2 za sojuszników');
});
