// Batch 71 / B5 — DOWIĄZANIA nowych deskryptorów: kontrakt widoku, odcisk
// stanu, etykiety PL i WYCENA bota. Nie jest to jeszcze pełna pętla PMSSB
// mechaniki (ta jest w B6–B10) — tutaj pilnujemy, żeby decydent w ogóle
// WIEDZIAŁ, co widzi, a bot nie podejmował decyzji na ślepo (klasa L50:
// remis wariantów = „pierwsza oferta z listy").
//
// Zmierzone PRZED naprawą (probe na tym samym stanie, oba przebiegi):
//  • Curse of the Bloody Tome (klątwa `applyTo: 'enchanted_player'`):
//    rzut na SIEBIE +59, na przeciwnika −63 — bot rzucał self-mill 2 na
//    każdym podtrzymaniu, bo `auraIsHostile` znała tylko
//    `applyTo: 'enchanted_controller'`. Po: wróg +36, ja −900.
//  • Champion (Changeling Berserker) z sojusznikiem 10/10: poświęcenie
//    własnego 5/3 = 27 > wygnanie 10/10 = 10 — bo obie oferty dostawały
//    „40 − pełna wartość". Po: wygnanie 10/10 = 33 > poświęcenie 27.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGameState, addObject, playerView, execute,
} from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { processTriggers } from '../src/engine/triggers.js';
import { stateFingerprint } from '../src/engine/fingerprint.js';
import { describeSpellEffects } from '../src/table/render.js';

const REG = createCardRegistry();
const commands = (state, playerId = state.turn.priorityPlayerId) => playerView(state, playerId).legalCommands;

function game() {
  const state = createGameState({ seed: 71, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  for (const playerId of ['p1', 'p2']) {
    for (let i = 0; i < 30; i += 1) {
      addObject(state, {
        id: `lib-${playerId}-${i}`, instanceId: `i-lib-${playerId}-${i}`,
        cardId: 'library-blank', controllerId: playerId, ownerId: playerId,
        zone: 'library', kind: 'sorcery', power: 0, toughness: 0, manaCost: 2,
        abilities: [], keywords: [], subtypes: [], types: ['Sorcery'], colors: [],
        cardName: 'Library blank',
      });
    }
  }
  return state;
}

function put(state, id, cardId, { controllerId = 'p1', zone = 'battlefield' } = {}) {
  const def = REG.get(cardId);
  assert.ok(def, `karta ${cardId} jest w katalogu`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes, keywords: def.keywords ?? [],
  });
  const current = state.objects.get(id);
  state.objects.set(id, Object.freeze({ ...current, summoningSickness: false }));
  return state.objects.get(id);
}

function creature(state, id, controllerId, power, toughness) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `synthetic-${id}`, controllerId, ownerId: controllerId,
    zone: 'battlefield', kind: 'creature', power, toughness, manaCost: Math.max(1, power),
    abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: ['R'],
    cardName: id, summoningSickness: false,
  });
  const current = state.objects.get(id);
  state.objects.set(id, Object.freeze({ ...current, summoningSickness: false }));
}

function resolveStack(state) {
  for (let guard = 0; guard < 20 && state.zones.stack.length > 0; guard += 1) {
    const pass = commands(state).find((c) => c.type === 'pass_priority');
    if (!pass) break;
    execute(state, pass);
  }
}

/** Wyceny wszystkich ofert z ostatniej decyzji bota (etykieta → punkt). */
function scored(state) {
  const bot = createHeuristicBot({ seed: 72, randomness: 0, lookahead: 0, registry: REG });
  bot.chooseCommand(playerView(state, state.turn.priorityPlayerId));
  return new Map(bot.trace().at(-1).options.map((o) => [o.cmd, o.score]));
}

// =========================================================================
// B5/1 — kontrakt widoku: poświęcenie vs WYGNANIE (champion, CR 702.72a)
// =========================================================================

test('B5/1: decydent championa dostaje w widoku strefę docelową i id źródła', () => {
  const state = game();
  put(state, 'berserker', 'changeling-berserker', { zone: 'hand' });
  creature(state, 'ally', 'p1', 3, 3);
  addMana(state, 'p1', 5, { colors: ['R'] });
  execute(state, commands(state).find((c) => c.type === 'cast_permanent'));
  resolveStack(state);
  processTriggers(state, state.events.slice(-5));
  resolveStack(state);
  const view = playerView(state, 'p1');
  assert.ok(view.pendingSacrifice, 'widok niesie oczekującą decyzję');
  assert.equal(view.pendingSacrifice.moveTo, 'exile', 'champion to WYGNANIE, nie poświęcenie');
  assert.equal(view.pendingSacrifice.cardId, 'changeling-berserker');
  assert.ok(view.pendingSacrifice.alternativeSourceId, 'id źródła = oferta „poświęć tę kartę”');
  assert.equal(view.pendingSacrifice.sourceId, view.pendingSacrifice.alternativeSourceId);
  // Kontrakt jest wyłącznie dla decydenta (ADR 0017 — brak wycieku).
  assert.equal(playerView(state, 'p2').pendingSacrifice ?? null, null);
});

test('B5/2: odcisk stanu rozróżnia poświęcenie od wygnania (deduplikacja replay)', () => {
  const state = game();
  put(state, 'berserker', 'changeling-berserker', { zone: 'hand' });
  creature(state, 'ally', 'p1', 3, 3);
  addMana(state, 'p1', 5, { colors: ['R'] });
  execute(state, commands(state).find((c) => c.type === 'cast_permanent'));
  resolveStack(state);
  processTriggers(state, state.events.slice(-5));
  resolveStack(state);
  const a = stateFingerprint(state);
  const pending = state.pendingSacrifice;
  state.pendingSacrifice = { ...pending, moveTo: null, champion: false };
  const b = stateFingerprint(state);
  state.pendingSacrifice = pending;
  assert.notEqual(a, b, '„wygnaj” i „poświęć” to różne stany gry');
});

// =========================================================================
// B5/3 — wycena: wygnanie championa jest ODWRACALNE (pokrętło parametryczne)
// =========================================================================

test('B5/3: bot wygnie dużego sojusznika, zamiast poświęcić własnego championa', () => {
  const state = game();
  put(state, 'berserker', 'changeling-berserker', { zone: 'hand' });
  creature(state, 'big', 'p1', 10, 10);
  addMana(state, 'p1', 5, { colors: ['R'] });
  execute(state, commands(state).find((c) => c.type === 'cast_permanent'));
  resolveStack(state);
  processTriggers(state, state.events.slice(-5));
  resolveStack(state);
  const sourceId = playerView(state, 'p1').pendingSacrifice.alternativeSourceId;
  const scores = scored(state);
  const exile = [...scores].find(([label]) => label === 'resolve_sacrifice_choice(big)')?.[1];
  const sacrificeSelf = [...scores].find(([label]) => label === `resolve_sacrifice_choice(${sourceId})`)?.[1];
  assert.ok(Number.isFinite(exile) && Number.isFinite(sacrificeSelf), 'obie oferty w wycenie');
  assert.ok(exile > sacrificeSelf,
    `wygnanie (${exile}) musi bić poświęcenie źródła (${sacrificeSelf}) — wygnana karta wraca`);
});

test('B5/4: pokrętło championExileLossFactor jest jawne i sterowalne', async () => {
  const { DEFAULT_HEURISTIC_PARAMS } = await import('../src/controllers/heuristic-params.js');
  assert.equal(DEFAULT_HEURISTIC_PARAMS.championExileLossFactor, 0.25);
});

// =========================================================================
// B5/5 — klątwa `applyTo: 'enchanted_player'` jest WROGA (nie self-mill)
// =========================================================================

test('B5/5: Curse of the Bloody Tome — bot celuje w PRZECIWNIKA, nie w siebie', () => {
  const state = game();
  put(state, 'tome', 'curse-of-the-bloody-tome', { zone: 'hand' });
  addMana(state, 'p1', 8, { colors: ['U', 'B', 'R', 'G', 'W'] });
  const scores = scored(state);
  const onEnemy = scores.get('cast_permanent(tome->p2)');
  const onSelf = scores.get('cast_permanent(tome->p1)');
  assert.ok(Number.isFinite(onEnemy) && Number.isFinite(onSelf), 'obie oferty w wycenie');
  assert.ok(onEnemy > 0, `klątwa na wrogu jest zyskiem (${onEnemy})`);
  assert.ok(onSelf < 0, `klątwa na sobie musi być karą (${onSelf})`);
});

test('B5/6: etykieta mielenia mówi, KOGO mieli (adresat klątwy)', () => {
  const label = describeSpellEffects({
    timing: 'sorcery',
    targets: [],
    effects: [{ type: 'mill_cards', amount: 2, applyTo: 'enchanted_player' }],
  });
  assert.match(label, /zaczarowanemu graczowi/);
  assert.doesNotMatch(label, /enchanted_player/);
});

test('B5/7: kwota „liczba kontrolowanych landów” nie drukuje surowego sluga', () => {
  const label = describeSpellEffects({
    timing: 'sorcery',
    targets: [{ type: 'creature' }],
    effects: [{ type: 'damage', amount: 'lands_you_control' }],
  });
  assert.match(label, /lądów/);
  assert.doesNotMatch(label, /lands_you_control/);
});
