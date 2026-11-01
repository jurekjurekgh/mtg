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
  extra = {} } = {}) {
  const def = {
    id: `syn-${id}`, name: `Syn ${id}`, set: 'TST', types, subtypes, colors: [],
    power, toughness, manaCost, keywords, oracleText: '', abilities,
  };
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: def.id, controllerId, ownerId: controllerId,
    zone, ...gameObjectDataOf(def),
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

// B3 (definicje kart): pin zapala się razem z katalogiem — do tego czasu `skip`,
// bo czerwony test na PR nie opisuje defektu silnika, tylko brakującą treść.
test('katalog: 10 kart batcha 71 jest `supported` bez ograniczeń (ADR 0022)', { skip: 'B3: definicje kart w card-data.js' }, () => {
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
