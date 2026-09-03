// Audyt PR #93 (2026-09-03), znalezisko F — ciąg dalszy po stronie BOTA.
// Gdy okno darmowego rzutu z grobu zaczęło wyliczać warianty z celami
// zmiennymi („up to three target creatures”, CR 601.2c), bot wybierał wariant
// BEZ CELÓW: płacił {X} = 4 many i marnował całą kartę za zero efektu.
//
// Root cause (klasa L41 — bliźniacza gałąź bez pinu): wycena trzech okien
// „rzutu spoza ręki” (`resolve_grave_free_cast`, `resolve_madness_cast`,
// `resolve_exile_cast`) brała efekty z `spell.effects` — czyli NIE z wybranego
// trybu — i nie pytała o jałowość (`allEffectsInertNow`), choć `cast_spell`
// robi to od M233. Wszystkie warianty remisowały, więc bot brał pierwszy
// z brzegu — w tym wariant jałowy.
//
// Źródło reguł jakościowych: M233 (ten sam błąd przy rzucie z ręki) i M265
// (wycena per zestaw celów w oknie grobu).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();
const VARIABLE_TARGETS = 'wrap-in-flames'; // MV 4: „1 damage to each of up to three target creatures”

function game(playerId = 'p1') {
  const state = createGameState({ seed: 93, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function put(state, id, cardId, controllerId, zone) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  return state.objects.get(id);
}

function addSimpleCreature(state, id, controllerId) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId, ownerId: controllerId, zone: 'battlefield',
    kind: 'creature', power: 2, toughness: 2, manaCost: 1, abilities: [], keywords: [],
    subtypes: [], types: ['Creature'], colors: [],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
}

function bot(view, seed = 1) {
  return createHeuristicBot({ playerId: view.playerId, seed }).chooseCommand(view);
}

/** Halo Forager: karta w grobie PRZECIWNIKA, bot ma 6 many ({X} = MV 4). */
function graveState({ creatures = 2 } = {}) {
  const state = game('p1');
  addMana(state, 'p1', 6, { colors: ['W', 'U', 'B', 'R', 'G'] });
  addSimpleCreature(state, 'mine', 'p1');
  if (creatures >= 1) addSimpleCreature(state, 'foe1', 'p2');
  if (creatures >= 2) addSimpleCreature(state, 'foe2', 'p2');
  put(state, 'grave', VARIABLE_TARGETS, 'p2', 'graveyard');
  state.pendingGraveFreeCast = { playerId: 'p1', sourceCardId: 'halo-forager' };
  return state;
}

test('A93/F: bot nie rzuca czaru z grobu JAŁOWO (0 celów), gdy ma wrogie stwory', () => {
  const state = graveState();
  const view = playerView(state, 'p1');
  const offers = view.legalCommands.filter((c) => c.type === 'resolve_grave_free_cast' && !c.decline);
  assert.ok(offers.some((o) => (o.targets ?? []).length === 0), 'wariant jałowy JEST w ofercie (legalny)');
  const chosen = bot(view);
  assert.equal(chosen.type, 'resolve_grave_free_cast', `bot rozstrzyga decyzję (wybrał ${chosen.type})`);
  assert.ok((chosen.targets ?? []).length > 0,
    'bot celuje w co najmniej jeden stwór, zamiast spalić {X} many za nic');
  for (const id of chosen.targets ?? []) {
    assert.equal(state.objects.get(id).controllerId, 'p2', `cel ${id} należy do przeciwnika`);
  }
});

test('A93/F: bot woli uderzyć OBA wrogie stwory niż jeden (efekt liczy się per cel)', () => {
  const state = graveState();
  const chosen = bot(playerView(state, 'p1'));
  assert.deepEqual([...(chosen.targets ?? [])].sort(), ['foe1', 'foe2'],
    'dwa cele to dwa razy po 1 obrażeniu i dwa zakazy blokowania');
});

test('A93/F: bez stworów na stole bot REZYGNUJE zamiast rzucić czar jałowy', () => {
  const state = graveState({ creatures: 0 });
  const view = playerView(state, 'p1');
  const offers = view.legalCommands.filter((c) => c.type === 'resolve_grave_free_cast' && !c.decline);
  assert.ok(offers.length > 0, 'wariant jałowy nadal jest legalny (CR: „up to three”)');
  const chosen = bot(view);
  assert.equal(chosen.decline, true, `bot rezygnuje, gdy czar nic nie zrobi (wybrał ${JSON.stringify(chosen)})`);
});

test('A93/F: Vaan — ta sama reguła dla okna zdolności (0 celów = jałowy rzut)', () => {
  const state = game('p1');
  addMana(state, 'p1', 6, { colors: ['W', 'U', 'B', 'R', 'G'] });
  addSimpleCreature(state, 'foe1', 'p2');
  addSimpleCreature(state, 'foe2', 'p2');
  put(state, 'stolen', VARIABLE_TARGETS, 'p2', 'exile');
  state.pendingExileCast = {
    playerId: 'p1', objectId: 'stolen', cardId: VARIABLE_TARGETS, sourceId: 'vaan', restorePriorityTo: 'p1',
  };
  const chosen = bot(playerView(state, 'p1'));
  assert.equal(chosen.type, 'resolve_exile_cast', `bot rozstrzyga okno Vaana (wybrał ${chosen.type})`);
  assert.equal(chosen.cast, true, 'bot rzuca ukradzioną kartę');
  assert.ok((chosen.targets ?? []).length > 0,
    'także w oknie Vaana bot nie marnuje czaru na wariant bez celów');
});
