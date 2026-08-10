import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGameState, execute, addObject } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { castSpell } from '../src/engine/spells.js';
import { castAuraSpell } from '../src/engine/resources.js';
import { legalActivatedAbilities, activateAbility } from '../src/engine/abilities.js';
import { addCounter } from '../src/engine/counters.js';
import { effectivePower, effectiveKeywords } from '../src/engine/permanents.js';

// =============================================================================
// Audyt Batch 23 (PR #35) — testy BEHAWIORALNE end-to-end. Poprzednie testy
// batcha sprawdzały głównie definicje („pole istnieje"); trzy bugi przeszły:
//   1. Channel (Greater Tanuki) — ReferenceError przy aktywacji.
//   2. Feedback — „Enchant enchantment" nie do rzucenia (host wymagany stwór).
//   3. Vandalize — tryb „Destroy both" niszczył tylko artefakt.
// Ten plik portuje scenariusze z audytu runtime (11/11) do suity regresji.
// =============================================================================

const REGISTRY = createCardRegistry();

function newState() {
  const state = createGameState({ seed: 2026, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  return state;
}

function addCardFromRegistry(state, instanceId, cardId, controllerId, zone) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id: instanceId, instanceId: `i-${instanceId}`, cardId, controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, spell: data.spell, abilities: data.abilities ?? [],
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
    types: def.types ?? [], colors: data.colors ?? [],
    aura: def.aura ?? null, bestow: def.bestow ?? null, enchantPlayer: def.enchantPlayer ?? false,
  });
}

function addCreature(state, id, controllerId, power, toughness, { colors = [], types = ['Creature'], keywords = [] } = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'x-test', controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost: 2, abilities: [], keywords,
    subtypes: [], types, colors, summoningSickness: false,
  });
}

function addEnchantment(state, id, controllerId, { colors = [] } = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'x-ench', controllerId, zone: 'battlefield',
    kind: 'enchantment', power: null, toughness: null, manaCost: 2, abilities: [],
    keywords: [], subtypes: [], types: ['Enchantment'], colors,
  });
}

function addLand(state, id, controllerId) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'basic-forest', controllerId, zone: 'battlefield',
    kind: 'land', power: null, toughness: null, manaCost: 0, abilities: [],
    keywords: [], subtypes: [], types: ['Basic', 'Land'], colors: ['G'],
  });
}

function giveMana(state, playerId, amount, colors = {}) {
  const player = state.players.find((p) => p.id === playerId);
  player.mana = amount;
  player.manaPool = { ...(player.manaPool ?? {}), ...colors };
}

/** Pełne rundy passów aż do rozstrzygnięcia stosu (jak passBoth w batch13). */
function resolveStack(state) {
  let guard = 0;
  while (state.zones.stack.length > 0 && guard < 20) {
    let passesDone = state.turn.passes;
    while (passesDone < state.players.length && state.zones.stack.length > 0) {
      const holder = state.turn.priorityPlayerId;
      const r = execute(state, { type: 'pass_priority', playerId: holder });
      if (r?.events?.[0]?.reason?.endsWith('_unresolved')) return false;
      passesDone = state.turn.passes;
    }
    guard += 1;
  }
  return state.zones.stack.length === 0;
}

function byCard(state, cardId, zone) {
  return [...state.objects.values()].find((o) => o.cardId === cardId && o.zone === zone);
}

// ---------------------------------------------------------------- 1. Vandalize

test('Vandalize: tryb „Destroy both" niszczy artefakt I land (targetIndex)', () => {
  const state = newState();
  giveMana(state, 'p1', 5, { R: 1 });
  addCardFromRegistry(state, 'vand', 'vandalize', 'p1', 'hand');
  addObject(state, {
    id: 'art', instanceId: 'i-art', cardId: 'x-art', controllerId: 'p2', zone: 'battlefield',
    kind: 'artifact', power: null, toughness: null, manaCost: 2, abilities: [], keywords: [], subtypes: [], types: ['Artifact'],
  });
  addLand(state, 'land2', 'p2');
  castSpell(state, 'p1', 'vand', ['art', 'land2'], undefined, 2);
  assert.ok(resolveStack(state), 'stos rozstrzygnięty');
  assert.notEqual(state.objects.get('art')?.zone, 'battlefield', 'artefakt zniszczony');
  assert.notEqual(state.objects.get('land2')?.zone, 'battlefield', 'land zniszczony');
});

test('Vandalize: tryby pojedyncze (artefakt / land) działają', () => {
  for (const [mode, targets] of [[0, ['art']], [1, ['land2']]]) {
    const state = newState();
    giveMana(state, 'p1', 5, { R: 1 });
    addCardFromRegistry(state, 'vand', 'vandalize', 'p1', 'hand');
    addObject(state, {
      id: 'art', instanceId: 'i-art', cardId: 'x-art', controllerId: 'p2', zone: 'battlefield',
      kind: 'artifact', power: null, toughness: null, manaCost: 2, abilities: [], keywords: [], subtypes: [], types: ['Artifact'],
    });
    addLand(state, 'land2', 'p2');
    castSpell(state, 'p1', 'vand', targets, undefined, mode);
    assert.ok(resolveStack(state), `tryb ${mode}: stos rozstrzygnięty`);
    if (mode === 0) {
      assert.notEqual(state.objects.get('art')?.zone, 'battlefield');
      assert.equal(state.objects.get('land2')?.zone, 'battlefield');
    } else {
      assert.equal(state.objects.get('art')?.zone, 'battlefield');
      assert.notEqual(state.objects.get('land2')?.zone, 'battlefield');
    }
  }
});

// ---------------------------------------------------------------- 2. Expunge

test('Expunge: niszczy nonartifact nonblack creature, odrzuca artefakt-stwora', () => {
  const state = newState();
  giveMana(state, 'p1', 3, { B: 2 });
  addCardFromRegistry(state, 'exp', 'expunge', 'p1', 'hand');
  addCreature(state, 'green', 'p2', 2, 2, { colors: ['G'] });
  castSpell(state, 'p1', 'exp', ['green'], undefined, undefined);
  assert.ok(resolveStack(state));
  assert.notEqual(state.objects.get('green')?.zone, 'battlefield', 'cel zniszczony');
  // artefakt-stwór nie jest legalnym celem
  const st = newState();
  giveMana(st, 'p1', 3, { B: 2 });
  addCardFromRegistry(st, 'exp', 'expunge', 'p1', 'hand');
  addCreature(st, 'artcre', 'p2', 2, 2, { types: ['Artifact', 'Creature'], colors: ['G'] });
  assert.throws(() => castSpell(st, 'p1', 'exp', ['artcre'], undefined, undefined), /artifact/);
});

// ---------------------------------------------------------------- 3. Shiv's Embrace

test("Shiv's Embrace: +2/+2 flying z aury i {R}: +1/+0", () => {
  const state = newState();
  giveMana(state, 'p1', 4, { R: 2 });
  addCardFromRegistry(state, 'shiv', 'shivs-embrace', 'p1', 'hand');
  addCreature(state, 'bear', 'p1', 2, 2, { colors: ['G'] });
  castAuraSpell(state, 'p1', 'shiv', { targetId: 'bear' });
  assert.ok(resolveStack(state));
  const aura = byCard(state, 'shivs-embrace', 'battlefield');
  assert.ok(aura && aura.attachedTo === 'bear', 'aura załączona');
  assert.equal(effectivePower(state.objects.get('bear'), state), 4);
  assert.equal(effectiveKeywords(state.objects.get('bear'), state).includes('flying'), true);
  // {R}: +1/+0 do końca tury
  giveMana(state, 'p1', 1, { R: 1 });
  const offers = legalActivatedAbilities(state, 'p1').filter((a) => a.objectId === aura.id);
  assert.equal(offers.length, 1, 'zdolność {R} oferowana');
  activateAbility(state, 'p1', aura.id, offers[0].abilityIndex, undefined);
  assert.equal(effectivePower(state.objects.get('bear'), state), 5);
});

// ---------------------------------------------------------------- 4. Deepwood Denizen

test('Deepwood Denizen: redukcja kosztu za liczniki (podłoga = pip koloru)', () => {
  // 0 liczników: pełny koszt {5}{G} + tap
  const state = newState();
  giveMana(state, 'p1', 10, { G: 2 });
  addObject(state, {
    id: 'deep', instanceId: 'i-deep', cardId: 'deepwood-denizen', controllerId: 'p1', zone: 'battlefield',
    kind: 'creature', power: 3, toughness: 2, manaCost: 3, abilities: REGISTRY.get('deepwood-denizen').abilities,
    keywords: ['vigilance'], subtypes: ['Elf', 'Warrior'], types: ['Creature'], colors: ['G'], summoningSickness: false,
  });
  let offers = legalActivatedAbilities(state, 'p1').filter((a) => a.objectId === 'deep');
  assert.equal(offers.length, 1, 'zdolność oferowana');
  const before = state.players[0].mana;
  activateAbility(state, 'p1', 'deep', offers[0].abilityIndex, undefined);
  assert.equal(before - state.players[0].mana, 6, 'zapłacono {5}{G}');
  assert.equal(state.objects.get('deep').tapped, true, 'źródło zatapnięte');
  // 5 liczników (4 na Deepwood + 1 na innym stworze): redukcja 5, podłoga {G}
  const st2 = newState();
  giveMana(st2, 'p1', 10, { G: 2 });
  addObject(st2, {
    id: 'deep', instanceId: 'i-deep', cardId: 'deepwood-denizen', controllerId: 'p1', zone: 'battlefield',
    kind: 'creature', power: 3, toughness: 2, manaCost: 3, abilities: REGISTRY.get('deepwood-denizen').abilities,
    keywords: ['vigilance'], subtypes: ['Elf', 'Warrior'], types: ['Creature'], colors: ['G'], summoningSickness: false,
  });
  addCreature(st2, 'other', 'p1', 1, 1, { colors: ['G'] });
  addCounter(st2, 'deep', '+1/+1', 4);
  addCounter(st2, 'other', '+1/+1', 1);
  offers = legalActivatedAbilities(st2, 'p1').filter((a) => a.objectId === 'deep');
  assert.equal(offers.length, 1, 'zdolność oferowana z licznikami');
  const before2 = st2.players[0].mana;
  activateAbility(st2, 'p1', 'deep', offers[0].abilityIndex, undefined);
  assert.equal(before2 - st2.players[0].mana, 1, 'zapłacono {G} (podłoga)');
});

// ---------------------------------------------------------------- 5. Welder Automaton

test('Welder Automaton: {3}{R} zadaje 1 obrażeń każdemu przeciwnikowi', () => {
  const state = newState();
  giveMana(state, 'p1', 4, { R: 1 });
  addObject(state, {
    id: 'welder', instanceId: 'i-welder', cardId: 'welder-automaton', controllerId: 'p1', zone: 'battlefield',
    kind: 'creature', power: 2, toughness: 1, manaCost: 2, abilities: REGISTRY.get('welder-automaton').abilities,
    keywords: [], subtypes: ['Construct'], types: ['Artifact', 'Creature'], colors: [], summoningSickness: false,
  });
  const offers = legalActivatedAbilities(state, 'p1').filter((a) => a.objectId === 'welder');
  assert.equal(offers.length, 1);
  activateAbility(state, 'p1', 'welder', offers[0].abilityIndex, undefined);
  assert.equal(state.players[1].life, 19);
  assert.equal(state.players[0].mana, 0, 'zapłacono {3}{R}');
});

// ---------------------------------------------------------------- 6. Feedback

test('Feedback: „Enchant enchantment" — rzut, załączenie i obrażenia w upkeep', () => {
  const state = newState();
  giveMana(state, 'p1', 3, { U: 1 });
  addCardFromRegistry(state, 'fb', 'feedback', 'p1', 'hand');
  addEnchantment(state, 'ench', 'p2', { colors: ['U'] });
  castAuraSpell(state, 'p1', 'fb', { targetId: 'ench' });
  assert.ok(resolveStack(state), 'aura weszła na bitwisko');
  const aura = byCard(state, 'feedback', 'battlefield');
  assert.ok(aura && aura.attachedTo === 'ench', 'aura zaczarowała enchantment');
  // Przejście untap→upkeep p2 prawdziwymi passami: step_advanced(upkeep)
  // odpala trigger (kolejka na stos), kolejna runda passów rozstrzyga stos.
  state.turn = jumpToStep(state.turn, 'untap', 'p2');
  state.turn.activePlayerId = 'p2';
  let guard = 0;
  for (;;) {
    let passesDone = state.turn.passes;
    while (passesDone < 2) {
      const holder = state.turn.priorityPlayerId;
      const r = execute(state, { type: 'pass_priority', playerId: holder });
      if (!r.ok && /(_unresolved|not_your_decision)$/.test(r.events?.[0]?.reason ?? '')) {
        assert.fail(`pass zablokowany: ${r.events?.[0]?.reason}`);
      }
      passesDone = state.turn.passes;
      if (passesDone === 0) break; // pełna runda: krok przeszedł lub stos rozstrzygnięty
    }
    guard += 1;
    assert.ok(guard <= 12, 'zbyt wiele rund passów');
    if (state.zones.stack.length === 0) break;
  }
  assert.equal(state.players[1].life, 19, 'kontroler zaczarowanego enchantmentu traci 1 w upkeep');
});

// ---------------------------------------------------------------- 7. Vow of Wildness

test("Vow of Wildness: +3/+3 trample na stworze przeciwnika i zakaz ataku na Ciebie", () => {
  const state = newState();
  giveMana(state, 'p1', 3, { G: 1 });
  addCardFromRegistry(state, 'vow', 'vow-of-wildness', 'p1', 'hand');
  addCreature(state, 'enemy', 'p2', 3, 3, { colors: ['G'] });
  castAuraSpell(state, 'p1', 'vow', { targetId: 'enemy' });
  assert.ok(resolveStack(state));
  const enemy = state.objects.get('enemy');
  assert.equal(effectivePower(enemy, state), 6, '+3/+3');
  assert.ok(effectiveKeywords(enemy, state).includes('trample'));
  // p2 nie może zaatakować stworem z Vow (jedyny przeciwnik = kontroler aury)
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  const r = execute(state, { type: 'declare_attackers', playerId: 'p2', attackerIds: ['enemy'] });
  assert.equal(r.ok, false, 'atak zablokowany (cantAttackYou)');
});

// ---------------------------------------------------------------- 8. Greater Tanuki — channel

test('Greater Tanuki: channel z ręki — basic land tapped, karta do grobu, tasowanie', () => {
  const state = newState();
  giveMana(state, 'p1', 3, { G: 1 });
  addCardFromRegistry(state, 'tanuki', 'greater-tanuki', 'p1', 'hand');
  // Biblioteka: nie-basic land (ma być pominięty) + 2 basic landy.
  addObject(state, {
    id: 'lib-nonbasic', instanceId: 'i-nb', cardId: 'x-nonbasic', controllerId: 'p1', zone: 'library',
    kind: 'land', power: null, toughness: null, manaCost: 0, abilities: [], keywords: [], subtypes: [],
    types: ['Land'], colors: [], cardName: 'Wastes', name: 'Wastes',
  });
  for (const [id, name] of [['lib-forest', 'Forest'], ['lib-island', 'Island']]) {
    addObject(state, {
      id, instanceId: `i-${id}`, cardId: id === 'lib-forest' ? 'basic-forest' : 'basic-island', controllerId: 'p1',
      zone: 'library', kind: 'land', power: null, toughness: null, manaCost: 0, abilities: [], keywords: [],
      subtypes: [], types: ['Basic', 'Land'], colors: [], cardName: name, name, supertypes: ['Basic'],
    });
  }
  state.zones.library = ['lib-nonbasic', 'lib-forest', 'lib-island'];
  const offers = legalActivatedAbilities(state, 'p1').filter((a) => a.objectId === 'tanuki');
  assert.equal(offers.length, 1, 'channel oferowany z ręki');
  activateAbility(state, 'p1', 'tanuki', offers[0].abilityIndex, undefined);
  const tanuki = [...state.objects.values()].find((o) => o.cardId === 'greater-tanuki');
  assert.equal(tanuki.zone, 'graveyard', 'karta odrzucona (koszt)');
  // CR 701.19b (bug-hunt 2026-08-10): wybór karty należy do GRACZA, nie do
  // deterministycznego „pierwszego basic landu" — blokująca decyzja.
  assert.ok(state.pendingSearchChoice, 'channel kolejkuje wybór karty');
  assert.equal(state.pendingSearchChoice.playerId, 'p1');
  const pick = execute(state, { type: 'resolve_search_choice', playerId: 'p1', found: 'lib-forest' });
  assert.ok(pick.ok, `wybór forestu: ${pick.events?.[0]?.reason ?? ''}`);
  const bfLands = state.zones.battlefield.filter((id) => state.objects.get(id)?.kind === 'land');
  assert.equal(bfLands.length, 1, 'dokładnie jeden basic land na bitwisku');
  assert.equal(state.objects.get(bfLands[0]).cardId, 'basic-forest', 'wybrany przez gracza basic land');
  assert.equal(state.objects.get(bfLands[0]).tapped, true, 'wchodzi tapped');
  assert.equal(state.players[0].mana, 0, 'zapłacono {2}{G}');
  // Island został w bibliotece (nie wszedł automatycznie).
  assert.ok(!state.objects.get('lib-island') || state.objects.get('lib-island').zone === 'library',
    'niewybrany land zostaje w bibliotece');
});

// ---------------------------------------------------------------- 9. Scorch Spitter

test('Scorch Spitter: trigger attacks zadaje 1 obrażeń obrońcy', () => {
  const state = newState();
  addObject(state, {
    id: 'spit', instanceId: 'i-spit', cardId: 'scorch-spitter', controllerId: 'p1', zone: 'battlefield',
    kind: 'creature', power: 1, toughness: 1, manaCost: 1, abilities: REGISTRY.get('scorch-spitter').abilities,
    keywords: [], subtypes: ['Elemental', 'Lizard'], types: ['Creature'], colors: ['R'], summoningSickness: false,
  });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  const r = execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['spit'] });
  assert.equal(r.ok, true);
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  assert.equal(state.players[1].life, 19);
});

// ---------------------------------------------------------------- 10. Turn the Tide

test('Turn the Tide: -2/-0 do końca tury tylko stworom przeciwnika', () => {
  const state = newState();
  giveMana(state, 'p1', 2, { U: 1 });
  addCardFromRegistry(state, 'ttt', 'turn-the-tide', 'p1', 'hand');
  addCreature(state, 'foe1', 'p2', 3, 3, { colors: ['G'] });
  addCreature(state, 'own1', 'p1', 2, 2, { colors: ['W'] });
  castSpell(state, 'p1', 'ttt', [], undefined, undefined);
  assert.ok(resolveStack(state));
  assert.equal(effectivePower(state.objects.get('foe1'), state), 1, 'stwór przeciwnika -2');
  assert.equal(effectivePower(state.objects.get('own1'), state), 2, 'własny stwór bez zmian');
});

// ---------------------------------------------------------------- dane Scryfall

test('Batch 23: definicje zgodne z pobranymi plikami Scryfall (nazwa i koszt)', () => {
  const ids = ['vandalize', 'expunge', 'shivs-embrace', 'deepwood-denizen', 'welder-automaton',
    'feedback', 'vow-of-wildness', 'greater-tanuki', 'scorch-spitter', 'turn-the-tide'];
  for (const id of ids) {
    const raw = fs.readFileSync(`docs/cards/scryfall-${id}.json`, 'utf8');
    const j = JSON.parse(raw);
    const def = REGISTRY.get(id);
    assert.equal(j.name, def.name, `${id}: nazwa`);
    assert.equal(j.cmc, def.manaCost, `${id}: manaCost (cmc)`);
  }
});
