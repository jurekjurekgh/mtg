import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { triggerTargetRemovesTargetOf } from '../src/engine/effect-intent.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

/**
 * C (zgłoszenie właściciela 2026-09-12, Academy Journeymage): ETB „odbij
 * stwora przeciwnika" bot celował w NAJDROŻSZEGO. Lepszy cel to stwór
 * z pozytywną aurą wroga — po odbiciu aura spada na cmentarz (CR 704.5m),
 * więc jedno odbicie kasuje DWIE karty przeciwnika.
 *
 * Reguła generyczna (ADR 0002): silnik niesie w ofercie `removesTarget`
 * (rozstrzygnięcie usuwa cel ze stołu — zniszczenie/wygnanie/odbicie/
 * poświęcenie; tapnięcie i obrażenia poza sygnałem), a bot przy usuwaniu
 * liczy ±30 za każdą przyklejoną AURĘ (nie sprzęt — zostaje na stole;
 * nie bestow — staje się stworem): cudza aura to +30 (karta wroga w plecy),
 * własna to −30 (nie zrywaj spod celu własnego Pacifismu).
 */

const REGISTRY = createCardRegistry();

function newState() {
  const state = createGameState({ seed: 1212, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.number = 5;
  return state;
}

function put(state, id, cardId, controllerId, over = {}) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, zone: 'battlefield',
    kind: over.kind ?? data.kind, power: over.power ?? data.power,
    toughness: over.toughness ?? data.toughness, manaCost: over.manaCost ?? data.manaCost,
    spell: data.spell, abilities: data.abilities ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], types: def.types ?? [], colors: data.colors ?? [],
    cardName: def.name,
  });
  state.objects.set(id, Object.freeze({
    ...state.objects.get(id),
    summoningSickness: false,
    ...(over.attachedTo !== undefined ? { attachedTo: over.attachedTo } : {}),
    ...(over.bestow !== undefined ? { bestow: over.bestow } : {}),
    ...(over.aura !== undefined ? { aura: over.aura } : {}),
  }));
  return state.objects.get(id);
}

/** Oczekująca decyzja celu PRAWDZIWEGO triggera Journeymage'a. */
function pendJourneymage(state, candidates) {
  const def = REGISTRY.get('academy-journeymage');
  const mage = state.objects.get('mage');
  state.pendingTriggerTargets.push({
    playerId: 'p1',
    sourceId: mage.id,
    cardId: mage.cardId,
    ability: def.abilities[0],
    candidates: [...candidates],
    allowNone: false,
    fixedTargetIds: [],
    extra: {},
    restorePriorityTo: 'p1',
  });
}

function botPick(state) {
  const bot = createHeuristicBot({ seed: 1212 });
  return bot.chooseCommand(playerView(state, 'p1'));
}

test('C/1: sygnał removesTarget tylko dla efektów usuwających cel ze stołu', () => {
  for (const type of ['destroy_permanent', 'destroy_if_least_power', 'exile_permanent',
    'exile_target_creature', 'exile_opponent_creature', 'exile_nonland_permanent_linked',
    'bounce_permanent', 'bounce_to_library_top', 'sacrifice_permanent']) {
    assert.equal(triggerTargetRemovesTargetOf({ effect: { type } }), true, type);
  }
  for (const effect of [{ type: 'damage' }, { type: 'pump', power: 2 },
    { type: 'tap_permanent' }, { type: 'shrink' }, { type: 'add_counter', counter: '+1/+1' }]) {
    assert.equal(triggerTargetRemovesTargetOf({ effect }), false, effect.type);
  }
  assert.equal(triggerTargetRemovesTargetOf({}), false);
});

test('C/2: oferta Journeymage niesie removesTarget', () => {
  const state = newState();
  put(state, 'mage', 'academy-journeymage', 'p1');
  put(state, 'brute', 'highland-game', 'p2', { power: 5, toughness: 5 });
  pendJourneymage(state, ['brute']);
  const offers = playerView(state, 'p1').legalCommands
    .filter((cmd) => cmd.type === 'resolve_trigger_target');
  assert.ok(offers.length >= 1, 'oferta celu');
  assert.ok(offers.every((cmd) => cmd.removesTarget === true), 'flaga removesTarget');
  assert.ok(offers.every((cmd) => cmd.friendly === false), 'odbicie wroga to efekt wrogi');
});

test('C/3: bot odbija małego Z AURĄ wroga, nie najdroższego golasa (sedno zgłoszenia)', () => {
  const state = newState();
  put(state, 'mage', 'academy-journeymage', 'p1');
  put(state, 'brute', 'highland-game', 'p2', { power: 5, toughness: 5 });
  put(state, 'whelp', 'highland-game', 'p2', { power: 2, toughness: 2 });
  // Pozytywna aura PRZECIWNIKA na jego stworze (jego inwestycja: karta + mana).
  put(state, 'blessing', 'benevolent-blessing', 'p2', { kind: 'aura', attachedTo: 'whelp' });
  pendJourneymage(state, ['brute', 'whelp']);
  const chosen = botPick(state);
  assert.equal(chosen.type, 'resolve_trigger_target');
  assert.equal(chosen.targetId, 'whelp',
    `odbicie ma zdjąć też aurę wroga: ${JSON.stringify(chosen)}`);
});

test('C/4: własna aura na wrogim stworze CHRONI je przed odbiciem (strata −30)', () => {
  const state = newState();
  put(state, 'mage', 'academy-journeymage', 'p1');
  put(state, 'brute', 'highland-game', 'p2', { power: 5, toughness: 5 });
  put(state, 'whelp', 'highland-game', 'p2', { power: 2, toughness: 2 });
  // MÓJ Pacifism na wrogim olbrzymie: odbicie zrywa też moją aurę.
  put(state, 'pacifism', 'benevolent-blessing', 'p1', { kind: 'aura', attachedTo: 'brute' });
  pendJourneymage(state, ['brute', 'whelp']);
  const chosen = botPick(state);
  assert.equal(chosen.targetId, 'whelp',
    `nie zrywaj własnej aury spod celu: ${JSON.stringify(chosen)}`);
});

test('C/5: bestow poza premią (po odczepieniu staje się stworem, nie ginie)', () => {
  const state = newState();
  put(state, 'mage', 'academy-journeymage', 'p1');
  put(state, 'mid', 'highland-game', 'p2', { power: 3, toughness: 3 });
  put(state, 'whelp', 'highland-game', 'p2', { power: 2, toughness: 2 });
  put(state, 'nymph', 'benevolent-blessing', 'p2', { kind: 'aura', attachedTo: 'whelp', bestow: { manaCost: 3 } });
  pendJourneymage(state, ['mid', 'whelp']);
  const chosen = botPick(state);
  assert.equal(chosen.targetId, 'mid',
    `bestow nie ginie przy odbiciu gospodarza — bez premii: ${JSON.stringify(chosen)}`);
});

test('C/6: sprzęt poza premią (zostaje na stole po odbiciu nosiciela)', () => {
  const state = newState();
  put(state, 'mage', 'academy-journeymage', 'p1');
  put(state, 'mid', 'highland-game', 'p2', { power: 3, toughness: 3 });
  put(state, 'whelp', 'highland-game', 'p2', { power: 2, toughness: 2 });
  put(state, 'tools', 'thieves-tools', 'p2', { attachedTo: 'whelp' });
  pendJourneymage(state, ['mid', 'whelp']);
  const chosen = botPick(state);
  assert.equal(chosen.targetId, 'mid',
    `sprzęt nie spada przy odbiciu — bez premii: ${JSON.stringify(chosen)}`);
});
