// Batch 71 (2026-11-01) — kolekcja artId 625–634 (10 kart), wszystkie `supported` (100%).
// Plan: docs/plans/PLAN_2026-10-30-batch71-kolekcja-625-634.md. Dane Oracle i rulingi:
// docs/cards/scryfall-<slug>.json (pobrane 2026-10-30 przez fetch_page — egress bash do
// api.scryfall.com jest zablokowany).
// Mechaniki generyczne (ADR 0002) testowane NAJPIERW na kartach SYNTERETYCZNYCH
// (ADR 0029 — pin RED→GREEN), potem na prawdziwych kartach katalogu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  createGameState, addObject, execute, playerView,
} from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createAbility, ABILITY_TYPE } from '../src/engine/abilities.js';
import { effectivePower, effectiveKeywords } from '../src/engine/permanents.js';
import { processTriggers } from '../src/engine/triggers.js';
import { applyEffect } from '../src/engine/effects.js';

const registry = createCardRegistry();

const commands = (state, playerId = state.turn.priorityPlayerId) => playerView(state, playerId).legalCommands;
const snapshotOf = (slug) => JSON.parse(fs.readFileSync(`docs/cards/scryfall-${slug}.json`, 'utf8'));

function game() {
  const state = createGameState({ seed: 71, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  return state;
}

/** Karta SYNTERETYCZNA (ADR 0029) — pin mechaniki bez zależności od katalogu. */
function synthetic(state, id, { controllerId = 'p1', types = ['Creature'], subtypes = [],
  power = 2, toughness = 2, keywords = [], abilities = [], zone = 'battlefield', manaCost = 1,
  colors = [], extra = {} } = {}) {
  const def = {
    id: `syn-${id}`, name: `Syn ${id}`, set: 'TST', types, subtypes, colors,
    power, toughness, manaCost, keywords, oracleText: '', abilities,
  };
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: def.id, controllerId, ownerId: controllerId,
    zone, ...gameObjectDataOf(def), colors,
    types: def.types, subtypes: def.subtypes, keywords: def.keywords, ...extra,
  });
  return state.objects.get(id);
}

/** Land na polu bitwy — nośnik kwoty „za każde kontrolowane przez ciebie landy”. */
function land(state, id, controllerId = 'p1') {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'plains', controllerId, ownerId: controllerId,
    zone: 'battlefield', kind: 'land', types: ['Land'], subtypes: ['Plains'],
  });
}

/** Przewija stos do pustego (pass_priority obu graczy). */
function resolveStack(state) {
  for (let guard = 0; guard < 20 && state.zones.stack.length > 0; guard += 1) {
    const pass = commands(state).find((c) => c.type === 'pass_priority');
    if (!pass) break;
    execute(state, pass);
  }
}

// =========================================================================
// B2a — kwota „X, gdzie X to liczba kontrolowanych przez ciebie landów”
//       (Rumbling Rockslide: „deals damage equal to the number of lands you
//       control to target creature”). CR 107.3a — X ustalane przy rzucie.
// =========================================================================

test('pin B2a: damage z amount "lands_you_control" skaluje się z liczbą landów rzucającego', () => {
  const state = game();
  for (let i = 0; i < 4; i += 1) land(state, `l${i}`);
  // Landy przeciwnika NIE liczą się („lands YOU control”).
  for (let i = 0; i < 3; i += 1) land(state, `ol${i}`, 'p2');
  const def = {
    id: 'syn-scaler', name: 'Syn Scaler', set: 'TST', types: ['Sorcery'], colors: ['R'], manaCost: 1,
    oracleText: '', spell: {
      timing: 'sorcery',
      targets: [{ type: 'creature' }],
      effects: [{ type: 'damage', amount: 'lands_you_control' }],
    },
  };
  addObject(state, {
    id: 'sp', instanceId: 'isp', cardId: def.id, controllerId: 'p1', ownerId: 'p1', zone: 'hand',
    ...gameObjectDataOf(def), types: def.types, spell: def.spell, kind: 'spell',
  });
  synthetic(state, 'victim', { controllerId: 'p2', power: 3, toughness: 8 });
  addMana(state, 'p1', 2, { colors: ['R'] });
  const offer = commands(state).find((c) => c.type === 'cast_spell' && c.objectId === 'sp'
    && c.targets?.[0] === 'victim');
  assert.ok(offer, 'oferta rzutu z celem istnieje');
  assert.equal(execute(state, offer).ok, true);
  assert.equal(state.objects.get('victim').damage, 0, 'obrażenia dopiero przy rozstrzygnięciu');
  resolveStack(state);
  assert.equal(state.objects.get('victim').damage, 4, 'dokładnie 4 = liczba WŁASNYCH landów');
});

test('pin B2a: brak landów = kwota 0 (obrażenia zero, nie „brak efektu”)', () => {
  const state = game();
  land(state, 'ol0', 'p2');
  const def = {
    id: 'syn-scaler0', name: 'Syn Scaler 0', set: 'TST', types: ['Sorcery'], colors: ['R'], manaCost: 1,
    oracleText: '', spell: {
      timing: 'sorcery',
      targets: [{ type: 'creature' }],
      effects: [{ type: 'damage', amount: 'lands_you_control' }],
    },
  };
  addObject(state, {
    id: 'sp', instanceId: 'isp', cardId: def.id, controllerId: 'p1', ownerId: 'p1', zone: 'hand',
    ...gameObjectDataOf(def), types: def.types, spell: def.spell, kind: 'spell',
  });
  synthetic(state, 'victim', { controllerId: 'p2', power: 3, toughness: 5 });
  addMana(state, 'p1', 2, { colors: ['R'] });
  const offer = commands(state).find((c) => c.type === 'cast_spell' && c.objectId === 'sp'
    && c.targets?.[0] === 'victim');
  assert.ok(offer);
  execute(state, offer);
  resolveStack(state);
  assert.equal(state.objects.get('victim').damage, 0);
});

// =========================================================================
// B2b — koszt „Discard a [qualifier] card” (Vampire Hounds: „Discard a
//       creature card: Vampire Hounds gets +2/+2 until end of turn”).
//       CR 118.3: kosztu nie da się zapłacić → zdolności nie można aktywować.
// =========================================================================

const houndsAbility = () => createAbility({
  type: ABILITY_TYPE.activated,
  cost: { discardCard: { qualifier: { types: ['Creature'] } } },
  effect: { type: 'pump', power: 2, toughness: 2 },
});

test('pin B2b: koszt „Discard a creature card” — brak stwora w ręce = brak oferty', () => {
  const state = game();
  synthetic(state, 'hounds', { abilities: [houndsAbility()] });
  // W ręce jest WYŁĄCZNIE land — kwalifikator nie jest spełniony.
  synthetic(state, 'hand-land', { types: ['Land'], subtypes: ['Plains'], zone: 'hand' });
  const offer = commands(state).find((c) => c.type === 'activate_ability' && c.objectId === 'hounds');
  assert.equal(offer, undefined, 'bez karty spełniającej kwalifikator zdolności nie ma (CR 118.3)');
});

test('pin B2b: koszt „Discard a creature card” — płatność PODNOSI stwora o +2/+2', () => {
  const state = game();
  synthetic(state, 'hounds', { abilities: [houndsAbility()] });
  const fodder = synthetic(state, 'fodder', { zone: 'hand' });
  const offer = commands(state).find((c) => c.type === 'activate_ability' && c.objectId === 'hounds');
  assert.ok(offer, 'oferta aktywacji istnieje (jest stwór do odrzucenia)');
  assert.equal(execute(state, offer).ok, true);
  // Jedyny kandydat spełniający kwalifikator → odrzucenie płaci się SAMO
  // (znalezisko A: brak decyzji, gdy wybór jest wymuszony).
  const choice = commands(state).find((c) => c.type === 'resolve_discard_choice');
  if (choice) {
    assert.equal(choice.cardId, fodder.id, 'jedyny kandydat to stwór z ręki');
    assert.equal(execute(state, choice).ok, true);
  }
  const graveCardIds = state.zones.graveyard.map((id) => state.objects.get(id)?.cardId);
  assert.ok(graveCardIds.includes('syn-fodder'), 'odrzucony stwór trafia do cmentarza');
  resolveStack(state);
  assert.equal(effectivePower(state.objects.get('hounds'), state), 4, '2/2 → 4/4 do końca tury');
});

test('pin B2b: „Discard a card” bez kwalifikatora nadal przyjmuje dowolną kartę', () => {
  const state = game();
  synthetic(state, 'picker', {
    abilities: [createAbility({
      type: ABILITY_TYPE.activated,
      cost: { discardCard: true },
      effect: { type: 'draw_cards', amount: 1 },
    })],
  });
  synthetic(state, 'any-land', { types: ['Land'], subtypes: ['Plains'], zone: 'hand' });
  const offer = commands(state).find((c) => c.type === 'activate_ability' && c.objectId === 'picker');
  assert.ok(offer, 'land w ręce wystarcza przy koszcie bez kwalifikatora');
});

// =========================================================================
// B2c — delirium na pojedynczym EFEKCIE czaru (Violent Urge: „Delirium — If
//       there are four or more card types among cards in your graveyard, that
//       creature gains double strike"). CR 207.2c — słowo zdolności; próg
//       czytany przy ROZSTRZYGNIĘCIU (CR 608.2), nie przy rzucie.
// =========================================================================

const urgeSpell = () => ({
  id: 'syn-urge', name: 'Syn Urge', set: 'TST', types: ['Instant'], colors: ['R'], manaCost: 1,
  oracleText: '', spell: {
    timing: 'instant',
    targets: [{ type: 'creature' }],
    effects: [
      { type: 'pump', power: 1, toughness: 0 },
      { type: 'grant_keywords_until_end_of_turn', keywords: ['first_strike'] },
      {
        type: 'grant_keywords_until_end_of_turn',
        keywords: ['double_strike'],
        condition: { delirium: true },
      },
    ],
  },
});

function castUrge(state) {
  const def = urgeSpell();
  addObject(state, {
    id: 'urge', instanceId: 'i-urge', cardId: def.id, controllerId: 'p1', ownerId: 'p1',
    zone: 'hand', ...gameObjectDataOf(def), types: def.types, spell: def.spell, kind: 'spell',
  });
  addMana(state, 'p1', 2, { colors: ['R'] });
  const offer = commands(state).find((c) => c.type === 'cast_spell' && c.objectId === 'urge'
    && c.targets?.[0] === 'cel');
  assert.ok(offer, 'oferta rzutu z celem');
  assert.equal(execute(state, offer).ok, true);
  resolveStack(state);
}

/** Karta w grobie gracza — typy liczone do delirium (CR 205.2a). */
function inGrave(state, id, types, controllerId = 'p1') {
  synthetic(state, id, { types, zone: 'graveyard', power: null, toughness: null, controllerId });
}

test('pin B2c: delirium na EFEKCIE — 4 typy w grobie dają double strike (obok first strike)', () => {
  const state = game();
  synthetic(state, 'cel', { power: 2, toughness: 2 });
  inGrave(state, 'g1', ['Creature']);
  inGrave(state, 'g2', ['Instant']);
  inGrave(state, 'g3', ['Sorcery']);
  inGrave(state, 'g4', ['Enchantment']);
  castUrge(state);
  const cel = state.objects.get('cel');
  const keywords = effectiveKeywords(cel, state);
  assert.ok(keywords.includes('first_strike'), 'first strike zawsze');
  assert.ok(keywords.includes('double_strike'), 'delirium 4 typy → double strike');
  assert.equal(effectivePower(cel, state), 3, '+1/+0 do końca tury');
});

test('pin B2c: delirium na EFEKCIE — 3 typy w grobie = brak double strike (reszta efektu działa)', () => {
  const state = game();
  synthetic(state, 'cel', { power: 2, toughness: 2 });
  inGrave(state, 'g1', ['Creature']);
  inGrave(state, 'g2', ['Instant']);
  inGrave(state, 'g3', ['Sorcery']);
  // Czwarty typ leży w grobie PRZECIWNIKA — delirium liczy grób KONTROLERA
  // źródła, więc ten typ nie może się wliczyć.
  inGrave(state, 'g4', ['Land'], 'p2');
  castUrge(state);
  const cel = state.objects.get('cel');
  const keywords = effectiveKeywords(cel, state);
  assert.ok(keywords.includes('first_strike'));
  assert.ok(!keywords.includes('double_strike'), '3 typy (token się nie liczy) → bez double strike');
});

// =========================================================================
// B2d — mill ZACZAROWANEGO GRACZA (Curse of the Bloody Tome: „Enchant player /
//       At the beginning of enchanted player's upkeep, that player mills two
//       cards"). CR 303.4b (aura na gracza), 109.5 (kontroler aury ≠ gracz).
// =========================================================================

const tomeAura = () => createAbility({
  type: ABILITY_TYPE.triggered,
  trigger: { event: 'upkeep', condition: { enchantedPlayerUpkeep: true } },
  effect: [{ type: 'mill_cards', amount: 2, applyTo: 'enchanted_player' }],
});

/** Aura na GRACZA: `enchantedPlayerId` (nie `attachedTo`).
 *  Pole nie należy do kontraktu `addObject` (dodaje je rzut aury, `spells.js`),
 *  więc ustawiamy je tak jak robi to produkcja — zamrożoną kopią obiektu. */
function auraOnPlayer(state, id, playerId, abilities) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `syn-${id}`, controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'enchantment', power: null, toughness: null, manaCost: 2,
    types: ['Enchantment'], subtypes: ['Aura'], keywords: [], abilities,
    enchantPlayer: true,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), enchantedPlayerId: playerId }));
}

/** Biblioteka z N kartami gracza (karty bez znaczenia dla mechaniki). */
function library(state, playerId, count) {
  const ids = [];
  for (let i = 0; i < count; i += 1) {
    const id = `lib-${playerId}-${i}`;
    synthetic(state, id, { controllerId: playerId, types: ['Creature'], zone: 'library', power: null, toughness: null });
    ids.push(id);
  }
  return ids;
}

test('pin B2d: upkeep ZACZAROWANEGO gracza — mieli go, nie kontrolera aury', () => {
  const state = game();
  library(state, 'p1', 3);
  library(state, 'p2', 3);
  auraOnPlayer(state, 'tome', 'p2', [tomeAura()]);
  state.turn.activePlayerId = 'p2';
  processTriggers(state, [{ type: 'step_advanced', step: 'upkeep', phase: 'beginning' }]);
  resolveStack(state);
  assert.equal(state.zones.graveyard.filter((id) => state.objects.get(id)?.controllerId === 'p2').length, 2,
    'zaczarowany gracz mieli dwie karty');
  assert.equal(state.zones.graveyard.filter((id) => state.objects.get(id)?.controllerId === 'p1').length, 0,
    'kontroler aury nie mieli nic');
});

test('pin B2d: upkeep INNEGO gracza — trigger nie odpala (warp: to nie jego upkeep)', () => {
  const state = game();
  library(state, 'p1', 3);
  library(state, 'p2', 3);
  auraOnPlayer(state, 'tome', 'p2', [tomeAura()]);
  state.turn.activePlayerId = 'p1';
  processTriggers(state, [{ type: 'step_advanced', step: 'upkeep', phase: 'beginning' }]);
  resolveStack(state);
  assert.equal(state.zones.graveyard.length, 0, 'brak mila poza upkeeppem zaczarowanego gracza');
});

test('pin B2d: biblioteka krótsza niż mill (1 karta) — mieli tyle, ile jest (ruling ISD)', () => {
  const state = game();
  library(state, 'p2', 1);
  auraOnPlayer(state, 'tome', 'p2', [tomeAura()]);
  state.turn.activePlayerId = 'p2';
  processTriggers(state, [{ type: 'step_advanced', step: 'upkeep', phase: 'beginning' }]);
  resolveStack(state);
  assert.equal(state.zones.graveyard.length, 1, 'jedna karta w bibliotece → do grobu');
  assert.equal(state.zones.library.length, 0);
});

// =========================================================================
// B2e — CHAMPION (Changeling Berserker: „Champion a creature", CR 702.72a).
//       Dosłownie: „Champion an [object]" means „When this permanent enters,
//       sacrifice it unless you exile another [object] you control" and
//       „When this permanent leaves the battlefield, return the exiled card
//       to the battlefield under its owner's control."
// =========================================================================

const championAbilities = () => [
  createAbility({
    type: ABILITY_TYPE.triggered,
    trigger: { event: 'enter_battlefield' },
    effect: [{ type: 'champion', qualifier: { types: ['Creature'] } }],
  }),
  createAbility({
    type: ABILITY_TYPE.triggered,
    trigger: { event: 'leaves_battlefield' },
    effect: [{ type: 'return_exiled_to_battlefield' }],
  }),
];

/** Permanent-stwór z championem na polu bitwy (bez rzutu — pin mechaniki). */
function championOnBoard(state, id = 'champ') {
  const def = {
    id: `syn-${id}`, name: `Syn ${id}`, set: 'TST', types: ['Creature'], colors: ['R'],
    power: 5, toughness: 3, manaCost: 3, oracleText: '', keywords: ['haste'],
    abilities: championAbilities(),
  };
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: def.id, controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', ...gameObjectDataOf(def),
    types: def.types, keywords: def.keywords, abilities: def.abilities,
  });
  return state.objects.get(id);
}

test('pin B2e: champion — wygnanie innego stwora, potem powrót po odejściu źródła', () => {
  const state = game();
  championOnBoard(state);
  const fodder = synthetic(state, 'fodder', { power: 2, toughness: 2 });
  applyEffect(state, { type: 'champion', qualifier: { types: ['Creature'] } }, state.objects.get('champ'), []);
  const picks = commands(state).filter((c) => c.type === 'resolve_sacrifice_choice');
  assert.deepEqual(picks.map((c) => c.targetId).sort(), ['champ', 'fodder'],
    'decyzja: wygnaj innego stwora ALBO poświęć źródło');
  const exile = picks.find((c) => c.targetId === fodder.id);
  assert.equal(execute(state, exile).ok, true);
  assert.equal(state.objects.get('champ').zone, 'battlefield', 'champion zostaje na polu bitwy');
  assert.equal([...state.objects.values()].find((o) => o.cardId === 'syn-fodder')?.zone, 'exile',
    'championowany stwór jest WYGNANY (nie poświęcony)');
  // Odejście źródła → wygnaniec wraca na pole bitwy pod kontrolą WŁAŚCICIELA.
  const before = state.events.length;
  applyEffect(state, { type: 'destroy_permanent' }, { id: 'x', controllerId: 'p1', cardId: 'x' }, ['champ']);
  processTriggers(state, state.events.slice(before));
  resolveStack(state);
  const back = [...state.objects.values()].find((o) => o.cardId === 'syn-fodder');
  assert.equal(back.zone, 'battlefield', 'LTB źródła przywraca wygnańca');
  assert.equal(back.controllerId, 'p1', 'pod kontrolą właściciela (CR 702.72a)');
});

test('pin B2e: champion — brak innego stwora = natychmiastowe poświęcenie', () => {
  const state = game();
  championOnBoard(state);
  applyEffect(state, { type: 'champion', qualifier: { types: ['Creature'] } }, state.objects.get('champ'), []);
  assert.equal(state.objects.get('champ'), undefined, 'źródło opuściło pole bitwy');
  const grave = state.zones.graveyard.map((id) => state.objects.get(id)?.cardId);
  assert.deepEqual(grave, ['syn-champ'], 'poświęcone (CR 701.21a)');
  assert.equal(state.pendingSacrifice, null, 'brak decyzji do podjęcia');
});

test('pin B2e: champion — wybór „nie wygnaję” poświęca źródło i nic nie wraca', () => {
  const state = game();
  championOnBoard(state);
  const fodder = synthetic(state, 'fodder');
  applyEffect(state, { type: 'champion', qualifier: { types: ['Creature'] } }, state.objects.get('champ'), []);
  const decline = commands(state).find((c) => c.type === 'resolve_sacrifice_choice' && c.targetId === 'champ');
  assert.equal(execute(state, decline).ok, true);
  assert.equal(state.objects.get(fodder.id).zone, 'battlefield', 'niewybrany stwór zostaje');
  assert.equal(state.objects.get('champ'), undefined, 'źródło poświęcone');
});

test('pin B2e: champion — źródło odeszło przed rozstrzygnięciem ETB (ruling: nic się nie dzieje)', () => {
  const state = game();
  championOnBoard(state);
  const fodder = synthetic(state, 'fodder');
  // Symulacja: ETB na stosie, źródło ginie w odpowiedzi.
  const champion = state.objects.get('champ');
  state.objects.delete('champ');
  state.zones.battlefield = state.zones.battlefield.filter((id) => id !== 'champ');
  state.zones.graveyard.push('champ');
  applyEffect(state, { type: 'champion', qualifier: { types: ['Creature'] } }, champion, []);
  assert.equal(state.pendingSacrifice, null, 'nie ma kogo poświęcić → brak decyzji');
  assert.equal(state.objects.get(fodder.id).zone, 'battlefield', 'nic nie wygnano');
});

// =========================================================================
// Katalog: każda karta batcha 71 istnieje i jest `supported` bez ograniczeń
// =========================================================================

const BATCH_71 = [
  ['Vampire Hounds', 'EXO', 625],
  ['Curse of the Bloody Tome', 'ISD', 626],
  ['Rumbling Rockslide', 'LCI', 627],
  ['Ambassador Oak', 'JMP', 628],
  ['Tail Slash', 'DTK', 629],
  ['Changeling Berserker', 'LRW', 630],
  ["Sphinx's Herald", 'ALA', 631],
  ['Anticipate', 'DTK', 632],
  ['Trumpet Blast', 'M10', 633],
  ['Violent Urge', 'DSK', 634],
];

test('katalog: 10 kart batcha 71 jest `supported` bez ograniczeń (ADR 0022)', () => {
  const byName = new Map(registry.all().map((card) => [card.name, card]));
  for (const [name, set, artId] of BATCH_71) {
    const card = byName.get(name);
    assert.ok(card, `karta ${name} jest w katalogu`);
    assert.equal(card.artId, artId, `artId ${name}`);
    assert.equal(card.set, set, `set ${name}`);
    assert.equal(card.support.status, 'supported', `${name} supported`);
    assert.deepEqual(card.support.limitations, [], `${name} bez ograniczeń`);
  }
});

// =========================================================================
// B4 — karty REALNE z katalogu: sanity danych + scenariusz legalny
//      i nielegalny dla każdej karty batcha, przez wspólny silnik.
// =========================================================================

const real = (state, cardId, { id = cardId, zone = 'battlefield', controllerId = 'p1' } = {}) => {
  const def = registry.get(cardId);
  assert.ok(def, `karta ${cardId} jest w katalogu`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes, keywords: def.keywords ?? [],
  });
  return state.objects.get(id);
};
const mana = (state, colors, playerId = 'p1') => {
  for (const c of colors) addMana(state, playerId, 1, { colors: c === 'C' ? [] : [c] });
};
const ofCard = (state, cardId) => [...state.objects.values()].filter((o) => o.cardId === cardId);

test('B4/Vampire Hounds: zdolność realnie w ofercie i podnosi 2/2 → 4/4', () => {
  const state = game();
  real(state, 'vampire-hounds', { id: 'hounds' });
  real(state, 'vampire-hounds', { id: 'fodder', zone: 'hand' });
  const offer = commands(state).find((c) => c.type === 'activate_ability' && c.objectId === 'hounds');
  assert.ok(offer, 'oferta aktywacji w legalCommands');
  execute(state, offer);
  const choice = commands(state).find((c) => c.type === 'resolve_discard_choice');
  if (choice) execute(state, choice);
  resolveStack(state);
  assert.equal(effectivePower(state.objects.get('hounds'), state), 4);
});

test('B4/Curse of the Bloody Tome: rzut aury na GRACZA wymaga celu-gracza i mieli go', () => {
  const state = game();
  real(state, 'curse-of-the-bloody-tome', { id: 'tome', zone: 'hand' });
  library(state, 'p2', 3);
  mana(state, ['U', 'U', 'U']);
  const casts = commands(state).filter((c) => c.type === 'cast_permanent' && c.objectId === 'tome');
  assert.ok(casts.length > 0, 'oferta rzutu aury „Enchant player"');
  const onPlayer = casts.find((c) => (c.targets ?? []).includes('p2'));
  assert.ok(onPlayer, 'celem może być GRACZ (CR 303.4f)');
  assert.equal(execute(state, onPlayer).ok, true);
  resolveStack(state);
  const aura = ofCard(state, 'curse-of-the-bloody-tome')[0];
  assert.equal(aura.enchantedPlayerId, 'p2', 'aura wisi na graczu');
  state.turn.activePlayerId = 'p2';
  processTriggers(state, [{ type: 'step_advanced', step: 'upkeep', phase: 'beginning' }]);
  resolveStack(state);
  assert.equal(state.zones.graveyard.filter((id) => state.objects.get(id)?.controllerId === 'p2').length, 2);
});

test('B4/Rumbling Rockslide: kwota z landów w realnym czarze; bez celu oferty brak', () => {
  const state = game();
  for (let i = 0; i < 3; i += 1) land(state, `l${i}`);
  synthetic(state, 'victim', { controllerId: 'p2', power: 1, toughness: 6 });
  real(state, 'rumbling-rockslide', { id: 'slide', zone: 'hand' });
  mana(state, ['R', 'R', 'R', 'R']);
  const cast = commands(state).find((c) => c.type === 'cast_spell' && c.objectId === 'slide'
    && c.targets?.[0] === 'victim');
  assert.ok(cast, 'oferta rzutu z celem-stworem');
  execute(state, cast);
  resolveStack(state);
  assert.equal(state.objects.get('victim').damage, 3, 'obrażenia = liczba kontrolowanych landów');
  // Nielegalny cel: brak stworów przeciwnika → brak oferty.
  const st2 = game();
  for (let i = 0; i < 3; i += 1) land(st2, `l${i}`);
  real(st2, 'rumbling-rockslide', { id: 'slide', zone: 'hand' });
  mana(st2, ['R', 'R', 'R', 'R']);
  assert.equal(commands(st2).filter((c) => c.type === 'cast_spell' && c.objectId === 'slide').length, 0,
    'bez legalnego celu czar nie ma oferty (CR 601.2c)');
});

test('B4/Ambassador Oak: ETB tworzy token 1/1 Elf Warrior z katalogu', () => {
  const state = game();
  real(state, 'ambassador-oak', { id: 'oak', zone: 'hand' });
  mana(state, ['G', 'G', 'G', 'G']);
  const cast = commands(state).find((c) => c.type === 'cast_permanent' && c.objectId === 'oak');
  assert.ok(cast);
  execute(state, cast);
  resolveStack(state);
  const tokens = ofCard(state, 'token_elf_warrior');
  assert.equal(tokens.length, 1, 'jeden token Elf Warrior');
  assert.equal(tokens[0].power, 1);
  assert.equal(tokens[0].toughness, 1);
  assert.deepEqual(tokens[0].colors, ['G']);
  assert.deepEqual(tokens[0].subtypes, ['Elf', 'Warrior']);
});

test('B4/Tail Slash: mój stwór zadaje obrażenia równe mocy; bez własnego stwora brak oferty', () => {
  const state = game();
  synthetic(state, 'moj', { power: 4, toughness: 4 });
  synthetic(state, 'wrog', { controllerId: 'p2', power: 2, toughness: 5 });
  real(state, 'tail-slash', { id: 'slash', zone: 'hand' });
  mana(state, ['R', 'R', 'R']);
  const cast = commands(state).find((c) => c.type === 'cast_spell' && c.objectId === 'slash'
    && c.targets?.includes('moj') && c.targets?.includes('wrog'));
  assert.ok(cast, 'oferta z dwoma celami (mój stwór + cudzy)');
  execute(state, cast);
  resolveStack(state);
  assert.equal(state.objects.get('wrog').damage, 4, 'obrażenia = moc mojego stwora');
  const st2 = game();
  synthetic(st2, 'wrog', { controllerId: 'p2', power: 2, toughness: 5 });
  real(st2, 'tail-slash', { id: 'slash', zone: 'hand' });
  mana(st2, ['R', 'R', 'R']);
  assert.equal(commands(st2).filter((c) => c.type === 'cast_spell' && c.objectId === 'slash').length, 0,
    'bez własnego stwora nie ma legalnego celu');
});

test('B4/Changeling Berserker: changeling + haste, ETB champion decyduje o wygnaniu', () => {
  const state = game();
  const fodder = synthetic(state, 'fodder', { power: 1, toughness: 1 });
  real(state, 'changeling-berserker', { id: 'champ', zone: 'hand' });
  mana(state, ['R', 'R', 'R', 'R']);
  const cast = commands(state).find((c) => c.type === 'cast_permanent' && c.objectId === 'champ');
  assert.ok(cast);
  execute(state, cast);
  resolveStack(state);
  const champ = ofCard(state, 'changeling-berserker')[0];
  assert.equal(champ.zone, 'battlefield');
  assert.ok(effectiveKeywords(champ, state).includes('haste'), 'haste z katalogu');
  const picks = commands(state).filter((c) => c.type === 'resolve_sacrifice_choice');
  assert.deepEqual(picks.map((c) => c.targetId).sort(), [champ.id, fodder.id].sort(),
    'decyzja championa: wygnaj innego stwora albo poświęć berserkera');
  execute(state, picks.find((c) => c.targetId === fodder.id));
  assert.equal([...state.objects.values()].find((o) => o.cardId === 'syn-fodder').zone, 'exile');
});

test("B4/Sphinx's Herald: koszt trzech KOLOROWYCH stworów; bez kompletu brak oferty", () => {
  const state = game();
  real(state, 'sphinxs-herald', { id: 'herald' });
  synthetic(state, 'bialy', { types: ['Creature'], colors: ['W'], power: 1, toughness: 1 });
  synthetic(state, 'niebieski', { types: ['Creature'], colors: ['U'], power: 1, toughness: 1 });
  synthetic(state, 'czarny', { types: ['Creature'], colors: ['B'], power: 1, toughness: 1 });
  mana(state, ['U', 'U', 'U']);
  const offer = commands(state).find((c) => c.type === 'activate_ability' && c.objectId === 'herald');
  assert.ok(offer, 'oferta aktywacji przy komplecie trzech kolorów');
  assert.equal(execute(state, offer).ok, true);
  // Trzy RÓŻNE stwory w grobie — którymi mogą być też same heraldy
  // (Herald jest niebieski, więc pokrywa slot U — ruling ALA).
  const graveCreatures = state.zones.graveyard
    .map((id) => state.objects.get(id))
    .filter((o) => o && (o.types ?? []).includes('Creature') && o.controllerId === 'p1')
    .length;
  assert.equal(graveCreatures, 3, 'koszt poświęcił trzy różne stwory');
});

test("B4/Sphinx's Herald: brak jednego koloru = brak oferty (CR 118.3)", () => {
  const state = game();
  real(state, 'sphinxs-herald', { id: 'herald' });
  // Brak CZARNEGO stwora — Herald (niebieski) nie pokryje tego slotu.
  synthetic(state, 'bialy', { types: ['Creature'], colors: ['W'], power: 1, toughness: 1 });
  synthetic(state, 'niebieski', { types: ['Creature'], colors: ['U'], power: 1, toughness: 1 });
  synthetic(state, 'zielony', { types: ['Creature'], colors: ['G'], power: 1, toughness: 1 });
  mana(state, ['U', 'U', 'U']);
  assert.equal(commands(state).filter((c) => c.type === 'activate_ability' && c.objectId === 'herald').length, 0,
    'bez czarnego stwora kosztu nie da się zapłacić');
});

test("B4/Sphinx's Herald: TEN sam stwór nie pokrywa dwóch kolorów", () => {
  const state = game();
  real(state, 'sphinxs-herald', { id: 'herald' });
  // Jeden stwór dwukolorowy (W/B) + Herald (U): razem tylko DWA stwory.
  synthetic(state, 'wielokolor', { types: ['Creature'], colors: ['W', 'B'], power: 1, toughness: 1 });
  mana(state, ['U', 'U', 'U']);
  assert.equal(commands(state).filter((c) => c.type === 'activate_ability' && c.objectId === 'herald').length, 0,
    'koszt wymaga TRZECH RÓŻNYCH stworów (ruling ALA)');
});

test('B4/Anticipate: look top 3 — jedna do ręki, reszta na spód (decyzja gracza)', () => {
  const state = game();
  const lib = library(state, 'p1', 4);
  // Identyfikatory instancji czytamy PRZED rzutem: karta zmienia id obiektu
  // przy każdej zmianie strefy (CR 400.7 — nowy obiekt), więc po ruchu
  // `state.objects.get(<stare id>)` nic nie zwraca.
  const libInst = lib.map((id) => state.objects.get(id).instanceId);
  real(state, 'anticipate', { id: 'ant', zone: 'hand' });
  mana(state, ['U', 'U']);
  const cast = commands(state).find((c) => c.type === 'cast_spell' && c.objectId === 'ant');
  assert.ok(cast, 'oferta rzutu (czar bez celu)');
  execute(state, cast);
  resolveStack(state);
  const picks = commands(state).filter((c) => c.type === 'resolve_look_top_choice');
  assert.equal(picks.length, 3, 'trzy karty do wyboru');
  assert.equal(execute(state, picks[0]).ok, true);
  // Wybrana karta (dowolna z trójki) jest w ręce, a pozostałe dwie na SPODZIE
  // biblioteki — czyli za kartą, której nie odsłaniano (czwarta z kolei).
  const topThree = new Set(libInst.slice(0, 3));
  const inHand = state.zones.hand
    .map((id) => state.objects.get(id)).filter((o) => o && topThree.has(o.instanceId));
  assert.equal(inHand.length, 1, 'dokładnie jedna karta z odsłoniętych trafiła do ręki');
  const bottomTwo = state.zones.library.slice(-2).map((id) => state.objects.get(id)?.instanceId);
  assert.ok(bottomTwo.every((inst) => topThree.has(inst)), 'reszta leży na SPODZIE biblioteki');
});

test('B4/Trumpet Blast: bonus tylko dla atakujących w chwili rozstrzygnięcia', () => {
  const state = game();
  const atak = synthetic(state, 'atak', { power: 2, toughness: 2 });
  const dom = synthetic(state, 'dom', { power: 2, toughness: 2 });
  state.combat = { attackingPlayerId: 'p1', attackers: ['atak'], blockers: new Map(), blockedAttackers: new Set() };
  real(state, 'trumpet-blast', { id: 'blast', zone: 'hand' });
  mana(state, ['R', 'R', 'R']);
  const cast = commands(state).find((c) => c.type === 'cast_spell' && c.objectId === 'blast');
  assert.ok(cast, 'oferta rzutu bez celów');
  execute(state, cast);
  resolveStack(state);
  assert.equal(effectivePower(state.objects.get('atak'), state), 4, 'atakujący +2/+0');
  assert.equal(effectivePower(state.objects.get('dom'), state), 2, 'nieatakujący bez bonusu (ruling M10)');
  assert.equal(effectivePower(atak, state) + effectivePower(dom, state), 6);
});

test('B4/Violent Urge: bez delirium tylko first strike; z delirium dodatkowo double strike', () => {
  const state = game();
  synthetic(state, 'cel', { power: 2, toughness: 2 });
  real(state, 'violent-urge', { id: 'urge', zone: 'hand' });
  mana(state, ['R']);
  const cast = commands(state).find((c) => c.type === 'cast_spell' && c.objectId === 'urge'
    && c.targets?.[0] === 'cel');
  assert.ok(cast);
  execute(state, cast);
  resolveStack(state);
  const kw = effectiveKeywords(state.objects.get('cel'), state);
  assert.ok(kw.includes('first_strike'));
  assert.ok(!kw.includes('double_strike'), 'bez delirium brak double strike');
  assert.equal(effectivePower(state.objects.get('cel'), state), 3);

  const st2 = game();
  synthetic(st2, 'cel', { power: 2, toughness: 2 });
  inGrave(st2, 'g1', ['Creature']);
  inGrave(st2, 'g2', ['Instant']);
  inGrave(st2, 'g3', ['Sorcery']);
  inGrave(st2, 'g4', ['Enchantment']);
  real(st2, 'violent-urge', { id: 'urge', zone: 'hand' });
  mana(st2, ['R']);
  const cast2 = commands(st2).find((c) => c.type === 'cast_spell' && c.objectId === 'urge'
    && c.targets?.[0] === 'cel');
  execute(st2, cast2);
  resolveStack(st2);
  assert.ok(effectiveKeywords(st2.objects.get('cel'), st2).includes('double_strike'), 'delirium włącza drugie zdanie');
});

test('snapshoty: 10 plików docs/cards/scryfall-*.json z rulingami dla batcha 71', () => {
  for (const slug of ['vampire-hounds', 'curse-of-the-bloody-tome', 'rumbling-rockslide',
    'ambassador-oak', 'tail-slash', 'changeling-berserker', 'sphinxs-herald', 'anticipate',
    'trumpet-blast', 'violent-urge']) {
    const snap = snapshotOf(slug);
    assert.equal(typeof snap.name, 'string');
    assert.ok(Array.isArray(snap.rulings), `${slug}: rulings`);
    assert.equal(snap.rulingsPobrano, '2026-10-30', `${slug}: data pobrania`);
  }
});
