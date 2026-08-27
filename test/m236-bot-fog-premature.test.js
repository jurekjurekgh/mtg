// M236 — audyt Żywym Testerem (2026-08-27), partia final-fantasy (gracz) vs
// theros (bot), seed 61: bot rzucił Inspire Awe (prevent all combat damage +
// scry 2) w UPKEEPIE gracza, który NIE KONTROLOWAŁ ŻADNEGO stwora — prewencja
// nie miała czego zapobiec (0 atakujących). Fog to instant: jego wartość
// pojawia się DOPIERO po deklaracji atakujących przez przeciwnika.
//
// Oś 1 audytu (nieoptymalny timing czaru). Root cause: wycena
// `prevent_combat_damage_except_enchanted` w turze przeciwnika dawała tylko
// słabą karę (−20) przy braku zadeklarowanego ataku, więc baza czaru + scry
// przebijały pass i bot palił fog przedwcześnie. Fix: kara przebija bazę+scry,
// żeby bot POCZEKAŁ na okno deklaracji (attackingEnemyPower>0 → premia).
// Reguła po `view.combat` (ADR 0017), zero nazw kart (ADR 0002).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId, zone, extra = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  const d = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    kind: d.kind, power: d.power, toughness: d.toughness, manaCost: d.manaCost, spell: d.spell,
    abilities: d.abilities ?? [], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
    types: def.types ?? [], colors: d.colors ?? [],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false, ...extra }));
  return state.objects.get(id);
}

// Bot = p2 broni się w turze gracza p1. Fog w ręce, biblioteka niepusta (scry działa).
function scenario({ declared = false } = {}) {
  const state = createGameState({ seed: 236, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'upkeep', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p2';
  state.turn.step = 'upkeep';
  state.turn.phase = 'upkeep';
  addMana(state, 'p2', 10);
  put(state, 'fog', 'inspire-awe', 'p2', 'hand');
  put(state, 'botc', 'chained-throatseeker', 'p2', 'battlefield');
  put(state, 'lib', 'hill-giant', 'p2', 'library'); // scry niepusty
  put(state, 'atk', 'hill-giant', 'p1', 'battlefield');
  if (declared) {
    state.turn.step = 'declare_attackers';
    state.turn.phase = 'combat';
    state.combat = { attackers: ['atk'], blockers: new Map(), attackingPlayerId: 'p1' };
  }
  return state;
}

function fogScore(state) {
  const bot = createHeuristicBot({ seed: 236 });
  bot.chooseCommand(playerView(state, 'p2'), {});
  const opts = bot.trace()[0].options;
  return {
    fog: opts.find((o) => o.cmd.startsWith('cast_spell(fog'))?.score,
    pass: opts.find((o) => o.cmd === 'pass_priority')?.score ?? 0,
  };
}

test('M236: bot NIE rzuca foga w upkeepie przeciwnika (brak zadeklarowanego ataku)', () => {
  const choice = createHeuristicBot({ seed: 236 }).chooseCommand(playerView(scenario(), 'p2'), {});
  assert.notEqual(choice.type === 'cast_spell' && choice.objectId === 'fog' ? 'cast' : 'inne', 'cast',
    `fog to instant — bot ma poczekać na deklarację ataku, nie palić w upkeepie: ${JSON.stringify(choice)}`);
});

test('M236: fog przed deklaracją ataku wyceniany PONIŻEJ passu', () => {
  const { fog, pass } = fogScore(scenario());
  assert.ok(fog < pass, `fog przed atakiem (${fog}) musi być < pass (${pass})`);
});

test('M236: PO deklaracji ataku fog wyceniany POWYŻEJ passu (nadal sensowny)', () => {
  const { fog, pass } = fogScore(scenario({ declared: true }));
  assert.ok(fog > pass, `fog po deklaracji ataku (${fog}) ma być > pass (${pass})`);
});
