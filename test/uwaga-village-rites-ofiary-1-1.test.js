// =============================================================================
// Uwaga właściciela z testów (2026-10-12): bot rzucał Village Rites i
// poświęcał Morpha 2/2 (Segmented Krotiq), choć miał 6 z 7 many potrzebnych do
// Megamorph i za chwilę mógł odzyskać wielkiego stwora. Wiążąca polityka:
// dodatkowy koszt RZUTU „sacrifice a creature” bot płaci wyłącznie własnym
// stworzeniem o bieżących efektywnych statystykach dokładnie 1/1. To twarda
// bramka wszystkich komend z sacrificeTargetId, nie nazwa karty ani kara.
// =============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import * as botModule from '../src/controllers/heuristic-bot.js';

const registry = createCardRegistry();
const { createHeuristicBot } = botModule;
const botMayPayCreatureSacrificeCost = botModule.botMayPayCreatureSacrificeCost;

function put(state, id, cardId, playerId = 'bot', zone = 'library', patch = {}) {
  const def = registry.get(cardId);
  assert.ok(def, `${cardId} istnieje w prawdziwym rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId,
    zone, ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes,
    keywords: def.keywords,
  });
  if (Object.keys(patch).length > 0) {
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
  }
  return state.objects.get(id);
}

function resolveStack(state) {
  for (let i = 0; i < 20 && state.zones.stack.length > 0; i++) {
    const playerId = state.turn.priorityPlayerId;
    const pass = playerView(state, playerId).legalCommands.find((cmd) => cmd.type === 'pass_priority');
    assert.ok(pass, `pass ${i} dla ${playerId} istnieje`);
    const result = execute(state, pass);
    assert.ok(result.ok, JSON.stringify(result.events));
  }
  assert.equal(state.zones.stack.length, 0, 'stos został rozstrzygnięty');
}

/**
 * Produkcyjne odtworzenie: prawdziwy Krotiq zostaje rzucony face-down za {3},
 * potem bot dostaje Village Rites i 6 many — o jedną za mało na Megamorph 7.
 */
function villageVsKrotiq({ withToken = false, withTreasure = false, mana = 6 } = {}) {
  const state = createGameState({ seed: 1210, players: [{ id: 'bot' }, { id: 'human' }] });
  state.turn = jumpToStep(state.turn, 'main', 'bot');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'bot';
  for (const playerId of ['bot', 'human']) {
    for (let i = 0; i < 10; i++) put(state, `${playerId}-lib-${i}`, 'basic-forest', playerId, 'library');
  }

  put(state, 'krotiq-hand', 'segmented-krotiq', 'bot', 'hand');
  addMana(state, 'bot', 3, { colors: ['G'] });
  const morphCast = playerView(state, 'bot').legalCommands
    .find((cmd) => cmd.type === 'cast_permanent' && cmd.objectId === 'krotiq-hand' && cmd.faceDown);
  assert.ok(morphCast, 'Segmented Krotiq ma produkcyjną ofertę Morph za {3}');
  assert.ok(execute(state, morphCast).ok);
  resolveStack(state);

  const morph = [...state.objects.values()]
    .find((object) => object.cardId === 'segmented-krotiq' && object.zone === 'battlefield');
  assert.ok(morph?.faceDown, 'Krotiq jest zakrytym permanentem');
  // Pełny stan zachowuje drukowane 6/5 pod zakryciem; efektywne 2/2, na
  // którym ma działać polityka, pochodzi z granicy PlayerView.
  assert.equal(morph.power, 6);
  assert.equal(morph.toughness, 5);
  assert.equal(morph.morph?.megamorphCost, 7);

  if (withToken) put(state, 'soldier-token', 'token_soldier', 'bot', 'battlefield');
  if (withTreasure) put(state, 'treasure-token', 'token_treasure', 'bot', 'battlefield');
  put(state, 'rites-hand', 'village-rites', 'bot', 'hand');
  if (mana > 0) addMana(state, 'bot', mana, { colors: ['B', 'G'] });
  const view = playerView(state, 'bot');
  const visibleMorph = view.zones.battlefield.find((object) => object.id === morph.id);
  assert.equal(visibleMorph?.power, 2, 'PlayerView pokazuje efektywną moc Morpha');
  assert.equal(visibleMorph?.toughness, 2, 'PlayerView pokazuje efektywną wytrzymałość Morpha');
  assert.equal(view.legalCommands.some((cmd) => cmd.objectId === morph.id
    && ['turn_morph_face_up', 'turn_manifest_face_up', 'turn_cloak_face_up'].includes(cmd.type)), false,
  'w scenariuszu nie stać jeszcze na Megamorph za 7');
  return { state, view, morph };
}

test('V/produkcja: bot nie poświęca Morpha 2/2 pod Village Rites', () => {
  const { view, morph } = villageVsKrotiq();
  const rites = view.legalCommands.filter((cmd) => cmd.type === 'cast_spell' && cmd.objectId === 'rites-hand');
  assert.deepEqual(rites.map((cmd) => cmd.sacrificeTargetId), [morph.id],
    'engine nadal oferuje człowiekowi legalne poświęcenie Morpha');

  const bot = createHeuristicBot({ seed: 1210, randomness: 0 });
  const choice = bot.chooseCommand(view, {});
  assert.equal(choice.type, 'pass_priority',
    `bez 1/1 bot ma zachować Morpha, dostałem ${JSON.stringify(choice)}`);
  assert.ok(view.zones.battlefield.some((o) => o.id === morph.id), 'wybór bota nie mutuje widoku');
});

test('V/produkcja: przy tokenie 1/1 bot rzuca Rites tylko nim, wykonuje koszt i dobiera dwie', () => {
  const { state, view, morph } = villageVsKrotiq({ withToken: true });
  const rites = view.legalCommands.filter((cmd) => cmd.type === 'cast_spell' && cmd.objectId === 'rites-hand');
  assert.equal(rites.length, 2, 'engine oferuje token 1/1 i Morph 2/2 — filtr jest wyłącznie polityką bota');

  const bot = createHeuristicBot({ seed: 1210, randomness: 0 });
  const choice = bot.chooseCommand(view, {});
  assert.equal(choice.type, 'cast_spell');
  assert.equal(choice.objectId, 'rites-hand');
  assert.equal(choice.sacrificeTargetId, 'soldier-token', 'jedyna dopuszczalna ofiara to 1/1');
  const result = execute(state, choice);
  assert.ok(result.ok, JSON.stringify(result.events));
  assert.ok(result.events.some((event) => event.type === 'permanent_sacrificed'
    && event.cardId === 'token_soldier'), 'token został zapłacony jako koszt');
  assert.ok(state.objects.get(morph.id)?.zone === 'battlefield', 'Morph 2/2 został zachowany');

  resolveStack(state);
  const ownHand = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'bot');
  assert.equal(ownHand.length, 2, 'Village Rites dobrało dwie karty');
});

test('V/czysta bramka: tylko własne stworzenia o efektywnym P/T 1/1', () => {
  assert.equal(typeof botMayPayCreatureSacrificeCost, 'function', 'wspólny predykat polityki jest eksportowany');
  const battlefield = [
    { id: 'token-1-1', controllerId: 'bot', kind: 'creature', types: ['Creature', 'Token'], power: 1, toughness: 1 },
    { id: 'card-1-1', controllerId: 'bot', kind: 'creature', types: ['Creature'], power: 1, toughness: 1 },
    { id: 'one-two', controllerId: 'bot', kind: 'creature', types: ['Creature'], power: 1, toughness: 2 },
    { id: 'two-one', controllerId: 'bot', kind: 'creature', types: ['Creature'], power: 2, toughness: 1 },
    { id: 'morph-2-2', controllerId: 'bot', kind: 'creature', types: ['Creature'], power: 2, toughness: 2, faceDown: true },
    { id: 'foe-1-1', controllerId: 'human', kind: 'creature', types: ['Creature'], power: 1, toughness: 1 },
    { id: 'artifact-1-1', controllerId: 'bot', kind: 'artifact', types: ['Artifact'], power: 1, toughness: 1 },
  ];
  const view = { playerId: 'bot', zones: { battlefield } };
  const allowed = (id) => botMayPayCreatureSacrificeCost(view, { type: 'cast_spell', sacrificeTargetId: id });
  assert.equal(botMayPayCreatureSacrificeCost(view, { type: 'pass_priority' }), true, 'komenda bez kosztu jest neutralna');
  assert.equal(allowed('token-1-1'), true, 'token 1/1 dozwolony');
  assert.equal(allowed('card-1-1'), true, 'zwykła karta-stwór 1/1 dozwolona');
  for (const id of ['one-two', 'two-one', 'morph-2-2', 'foe-1-1', 'artifact-1-1', 'missing']) {
    assert.equal(allowed(id), false, `${id} nie może opłacić rzutu bota`);
  }
});

test('V/wszystkie okna: darmowy rzut z ręki odrzucony zamiast poświęcenia 2/2', () => {
  const { view, morph } = villageVsKrotiq();
  const freeView = {
    ...view,
    pendingHandFreeCast: { playerId: 'bot', alternative: null },
    legalCommands: [
      { type: 'resolve_hand_free_cast', playerId: 'bot', decline: true },
      {
        type: 'resolve_hand_free_cast', playerId: 'bot', objectId: 'rites-hand', cardId: 'village-rites',
        targets: [], sacrificeTargetId: morph.id,
      },
    ],
  };
  const choice = createHeuristicBot({ seed: 7, randomness: 0 }).chooseCommand(freeView, {});
  assert.equal(choice.type, 'resolve_hand_free_cast');
  assert.equal(choice.decline, true, `bot miał odmówić darmowego rzutu, dostałem ${JSON.stringify(choice)}`);
});

test('V/bot nie poświęca Skarbu na manę pod Rites, którego ofiary i tak zabrania', () => {
  const { view } = villageVsKrotiq({ withTreasure: true, mana: 0 });
  assert.ok(view.legalCommands.some((cmd) => cmd.type === 'activate_ability'
    && cmd.objectId === 'treasure-token'), 'Skarb może legalnie wyprodukować czarną manę');
  assert.ok(view.legalCommands.some((cmd) => cmd.type === 'cast_spell'
    && cmd.objectId === 'rites-hand'), 'engine widzi auto-płatność Skarbem i legalną ofiarę 2/2');
  const choice = createHeuristicBot({ seed: 1210, randomness: 0 }).chooseCommand(view, {});
  assert.equal(choice.type, 'pass_priority',
    `bot nie ma spalać Skarbu pod strategicznie zabroniony rzut: ${JSON.stringify(choice)}`);
});

test('V/losowość nie omija zakazu i nie zamienia go w losowe poddanie', () => {
  const { view } = villageVsKrotiq();
  for (let seed = 1; seed <= 24; seed++) {
    const choice = createHeuristicBot({ seed, randomness: 1 }).chooseCommand(view, {});
    assert.equal(choice.type, 'pass_priority',
      `seed ${seed}: twardy zakaz ma zostawić pass, nie ofiarę ani concede: ${JSON.stringify(choice)}`);
  }
});

test('V/architektura: filtr jest w kontrolerze bota, nie w legalności engine', () => {
  const source = readFileSync(new URL('../src/controllers/heuristic-bot.js', import.meta.url), 'utf8');
  assert.match(source, /function botCommandCandidates\(/,
    'normalny wybór i symulacje mają jedno źródło dozwolonych komend');
  assert.doesNotMatch(source, /village-rites|segmented-krotiq/i,
    'polityka nie może rozpoznawać nazw ani cardId zgłoszonych kart');

  const engine = readFileSync(new URL('../src/engine/spells.js', import.meta.url), 'utf8');
  assert.match(engine, /sacrificePool = sacrificeCost/,
    'engine nadal enumeruje wszystkie legalne ofiary dla człowieka');
});
