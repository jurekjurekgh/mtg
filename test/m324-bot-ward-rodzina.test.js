import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { COMMAND_TYPES } from '../src/protocol/types.js';
import { createHeuristicBot, WARD_TAXED_TYPES } from '../src/controllers/heuristic-bot.js';

/**
 * M324 (audyt PR #102, F1): podatek wardu (CR 702.21) musi obejmować CAŁĄ
 * rodzinę rzutów z celem, nie ósemkę wymieniowaną ręcznie w M320.
 *
 * Silnik odpala ward od ZDARZENIA (`fireWardTriggers` przy spell_cast /
 * permanent_cast / aura_spell_cast / ability_activated / spell_copied), więc
 * okna darmowego rzutu (suspend, rebound, madness, Epic z grobu, Vaana) i
 * przygoda-strona-stwora płacą ward tak samo jak zwykły rzut. Zmierzone przed
 * naprawą: w oknie madness bot brał pierwszy zestaw celów z listy, czyli
 * rzucał „Destroy target creature\" w wrogi 5/5 z ward {2} nie mając many na
 * dopłatę — czar kontrowany, karta i mana przepadły.
 */

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId, zone, extra = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, ...extra,
  });
  return state.objects.get(id);
}

/** Wrogi 5/5 wart removalu; `warded` dokłada ward {2} (kształt z widoku: keyword + kwota). */
function foeFatty(state, id, ward = null) {
  const o = put(state, id, 'goblin-piker', 'p1', 'battlefield');
  state.objects.set(id, Object.freeze({
    ...o, power: 5, toughness: 5, manaCost: 6,
    ...(ward == null ? {} : { keywords: ['ward'], ward }),
    summoningSickness: false,
  }));
  return state.objects.get(id);
}

/**
 * Bot (p2) w mainie: karta `terminal-agony` (Madness {B}{R}, „Destroy target
 * creature\") leży w exile z otwartą decyzją; na stole przeciwnika dwa bliźniaki
 * 5/5 — pierwszy z wardem {2}, drugi bez. Pula = `pool`.
 */
function madnessChoice({ pool, seed = 324 }) {
  const state = createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  foeFatty(state, 'fatty-ward', 2);
  foeFatty(state, 'fatty-plain', null);
  const def = REGISTRY.get('terminal-agony');
  put(state, 'mad', 'terminal-agony', 'p2', 'exile', { madness: def.madness, madnessReady: true });
  state.pendingMadnessCast = { playerId: 'p2', objectId: 'mad', cardId: 'terminal-agony' };
  if (pool > 0) addMana(state, 'p2', pool, { colors: ['B', 'R'] });
  const view = playerView(state, 'p2');
  const bot = createHeuristicBot({ seed });
  return { choice: bot.chooseCommand(view, {}), view };
}

test('M324/A1 (strażnik klasy): każdy typ rzutu z kontraktu podlega podatkowi ward', () => {
  const castLike = COMMAND_TYPES.filter((type) => type.startsWith('cast_') || type.endsWith('_cast'));
  const braki = castLike.filter((type) => !WARD_TAXED_TYPES.has(type));
  assert.deepEqual(braki, [], `typy rzucające czar z celem bez podatku ward: ${braki.join(', ')}`);
  // Pin pełnego zestawu: DOJŚCIE nowego typu do COMMAND_TYPES ma świecić i
  // wymusić decyzję (z wyjątkiem wpisanym tutaj z powodem), a nie ciche
  // „jakoś to się policzy\" (L102: zakres gwarda = zakres klasy).
  assert.deepEqual([...WARD_TAXED_TYPES].sort(), [
    'activate_ability', 'cast_adventure', 'cast_adventure_creature', 'cast_cleave', 'cast_escape',
    'cast_flashback', 'cast_permanent', 'cast_spell', 'resolve_grave_free_cast', 'resolve_exile_cast',
    'resolve_madness_cast', 'resolve_rebound_cast', 'resolve_suspend_cast', 'resolve_trigger_target',
  ].sort(), 'zestaw typów objętych podatkiem ward');
});

test('M324/B: bliźniaki 5/5 — z maną na dopłatę bot wybiera cel BEZ wardu', () => {
  // madness {B}{R} = 2 z puli + ward {2} → pula 4 starcza na oba.
  const { choice, view } = madnessChoice({ pool: 4 });
  const castCmds = view.legalCommands.filter((c) => c.type === 'resolve_madness_cast' && c.cast);
  assert.ok(castCmds.length >= 2, `oferta per zestaw celów: ${JSON.stringify(castCmds.map((c) => c.targets))}`);
  assert.equal(choice.type, 'resolve_madness_cast', `rzut za madness: ${JSON.stringify(choice)}`);
  assert.deepEqual(choice.targets, ['fatty-plain'],
    `bez wardu taniej o {2} — ten cel wygrywa: ${JSON.stringify(choice.targets)}`);
});

test('M324/C: bez many na dopłatę bot NIE rzuca w ward {2} (fizzle poniżej passu)', () => {
  // Pula 3 = koszt madness 2 + 1 — wardu {2} nie z czego zapłacić.
  const { choice } = madnessChoice({ pool: 3 });
  assert.ok(!(choice.type === 'resolve_madness_cast' && (choice.targets ?? []).includes('fatty-ward')),
    `rzut kontrowany za brak dopłaty: ${JSON.stringify(choice)}`);
});

test('M324/D (anty-over-fix): ten sam wybór bez wardu — oba cele równe, rzut nadal idzie', () => {
  // Gdy wrogi 5/5 NIE ma wardu, pula 3 wystarcza i bot ma rzucać (inaczej
  // podatek zamieniłby się w odruchowe pasowanie).
  const state = createGameState({ seed: 325, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  foeFatty(state, 'fatty-ward', null);
  foeFatty(state, 'fatty-plain', null);
  const def = REGISTRY.get('terminal-agony');
  put(state, 'mad', 'terminal-agony', 'p2', 'exile', { madness: def.madness, madnessReady: true });
  state.pendingMadnessCast = { playerId: 'p2', objectId: 'mad', cardId: 'terminal-agony' };
  addMana(state, 'p2', 3, { colors: ['B', 'R'] });
  const view = playerView(state, 'p2');
  const choice = createHeuristicBot({ seed: 325 }).chooseCommand(view, {});
  assert.equal(choice.type, 'resolve_madness_cast',
    `bez wardu pula 3 wystarcza (koszt 2): ${JSON.stringify(choice)}`);
});
