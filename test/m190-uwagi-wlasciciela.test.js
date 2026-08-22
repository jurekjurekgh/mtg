// M190 — uwagi właściciela z testów (2026-08-22):
// A  — dwie zdolności many Heap Gate mają identyczny opis w panelu,
// A2 — log sugeruje 5 many zamiast jednej dowolnego koloru,
// B  — Undercity to GRAF pokoi (gracz wybiera ścieżkę), nie lista 1..9.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { commandLabel } from '../src/table/render.js';
import { describeGameEvent } from '../src/table/session.js';

const REGISTRY = createCardRegistry();
const HELPERS = {
  nameOf: (id) => REGISTRY.get(id)?.name ?? String(id),
  nameOfObject: (id) => String(id),
};
const NAMES = { p1: 'Ty', p2: 'Nieprzyjaciel' };
const SESSION = {
  nameOf: HELPERS.nameOf,
  nameOfObject: HELPERS.nameOfObject,
  cardDetails: (id) => REGISTRY.get(id) ?? null,
  colorsOf: (id) => REGISTRY.get(id)?.colors ?? [],
  abilitiesOf: (id) => REGISTRY.get(id)?.abilities ?? [],
};

function game(playerId = 'p1') {
  const state = createGameState({ seed: 190, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function putCard(state, id, cardId, controllerId, zone = 'battlefield', patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, ...patch,
  });
  return state.objects.get(id);
}

// ---- A: rozróżnialne etykiety zdolności many ------------------------------

test('M190/A: dwie zdolności many Heap Gate mają RÓŻNE opisy w panelu', () => {
  const state = game('p1');
  putCard(state, 'gate', 'heap-gate', 'p1', 'battlefield', {});
  putCard(state, 'src', 'basic-plains', 'p1');
  const offers = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'activate_ability' && c.objectId === 'gate');
  assert.ok(offers.length >= 2, `co najmniej dwie oferty (jest ${offers.length})`);
  const labels = offers.map((c) => commandLabel(c, SESSION, playerView(state, 'p1')));
  const unique = new Set(labels);
  assert.equal(unique.size, labels.length,
    `każda oferta ma własny opis, inaczej gracz nie wie, co klika: ${JSON.stringify(labels)}`);
  assert.ok(labels.some((l) => /dowolnego koloru|dowolny kolor/i.test(l)),
    `wariant „add one mana of any color" nazwany wprost: ${JSON.stringify(labels)}`);
  assert.ok(labels.some((l) => /bezbarwn/i.test(l)),
    `wariant „{T}: Add {C}" nazwany wprost: ${JSON.stringify(labels)}`);
});

test('M190/A1b: zdolność produkująca KONKRETNE kolory nadal je wymienia', () => {
  // Jeskai Devotee: „{1}: Add {U}, {R}, or {W}" — trzy kolory do wyboru,
  // to NIE jest „dowolny kolor" (kontrola anty-over-fix dla M150/C2).
  const state = game('p1');
  putCard(state, 'dev', 'jeskai-devotee', 'p1', 'battlefield', {});
  putCard(state, 'land', 'basic-plains', 'p1');
  const offer = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'dev');
  assert.ok(offer, 'oferta aktywacji');
  const label = commandLabel(offer, SESSION, playerView(state, 'p1'));
  assert.ok(!/dowolnego koloru/i.test(label),
    `trzy wybrane kolory to nie „dowolny kolor": ${JSON.stringify(label)}`);
});

// ---- A2: log nie kłamie o liczbie many -----------------------------------

test('M190/A2: log mówi o JEDNEJ manie dowolnego koloru, nie o pięciu', () => {
  const line = String(describeGameEvent({
    type: 'ability_activated', playerId: 'p1', cardId: 'heap-gate',
    sourceId: 'gate', effectTypes: ['add_mana'], manaColors: ['W', 'U', 'B', 'R', 'G'],
    manaAmount: 1, manaAnyColor: true,
  }, HELPERS, NAMES));
  assert.ok(!line.includes('{W}, {U}, {B}, {R}, {G}'),
    `lista pięciu symboli sugeruje pięć many: ${JSON.stringify(line)}`);
  assert.match(line, /dowolnego koloru/,
    `opis mówi wprost o manie dowolnego koloru: ${JSON.stringify(line)}`);
});

test('M190/A2b: mana o wybranych kolorach nadal wymienia symbole (kontrola)', () => {
  const line = String(describeGameEvent({
    type: 'ability_activated', playerId: 'p1', cardId: 'jeskai-devotee',
    sourceId: 'dev', effectTypes: ['add_mana'], manaColors: ['U', 'R', 'W'], manaAmount: 1,
  }, HELPERS, NAMES));
  assert.match(line, /\{U\}, \{R\}, \{W\}/,
    `M150/C2 bez regresji — konkretne kolory nadal widoczne: ${JSON.stringify(line)}`);
});

test('M190/A2c: REALNA aktywacja Heap Gate — log bez listy pięciu symboli', () => {
  // Pełna ścieżka (silnik → zdarzenie → opis), nie ręcznie sklejone zdarzenie:
  // zgłoszenie właściciela dotyczyło tego, co widać po kliknięciu w grze.
  const state = game('p1');
  putCard(state, 'gate', 'heap-gate', 'p1', 'battlefield', {});
  addMana(state, 'p1', 1, { colors: ['G'] });
  const offers = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'activate_ability' && c.objectId === 'gate');
  // Wariant za {1} — „Add one mana of any color".
  const anyColor = offers.find((c) => c.abilityIndex === 1);
  assert.ok(anyColor, 'oferta zdolności „dowolny kolor"');
  assert.ok(execute(state, anyColor).ok);
  const activated = state.events.find((e) => e.type === 'ability_activated'
    && e.cardId === 'heap-gate');
  assert.ok(activated, 'zdarzenie aktywacji');
  assert.equal(activated.manaAmount, 1, 'zdarzenie niesie LICZBĘ many (L6)');
  const line = String(describeGameEvent(activated, HELPERS, NAMES));
  assert.ok(!line.includes('{W}, {U}, {B}, {R}, {G}'),
    `log nie wymienia pięciu symboli: ${JSON.stringify(line)}`);
  assert.match(line, /1 mana dowolnego koloru/, `log mówi wprost: ${JSON.stringify(line)}`);
});
