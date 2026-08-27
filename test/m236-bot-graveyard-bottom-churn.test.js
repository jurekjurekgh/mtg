// M236/6 — audyt Żywym Testerem (2026-08-27, skan strukturalny worek-basni
// seed 9102/9103): bot aktywował Barkform Harvester ({2}: włóż kartę z grobu
// na SPÓD biblioteki) 3×/turę w main2 — palił po 2 many, by zakopać własne
// karty na spód, bez żadnego wpływu na grę.
//
// Oś 1 audytu (nieoptymalne użycie zdolności — brak progu nasycenia). Root
// cause: `put_graveyard_card_on_bottom` nie miał wyceny (gołe score=2 za
// legalną aktywację), więc bot powtarzał churn. Fix: kara (poniżej passu) —
// zakopanie własnej karty to near-zero wartość, zdolność niszowa której bot
// nie modeluje. Reguła po typie efektu (ADR 0002), zero nazw kart.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId, zone) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  const d = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    kind: d.kind, power: d.power, toughness: d.toughness, manaCost: d.manaCost, spell: d.spell,
    abilities: d.abilities ?? [], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
    types: def.types ?? [], colors: d.colors ?? [],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

test('M236/6: bot NIE zakopuje karty z grobu na spód biblioteki (jałowy churn)', () => {
  const state = createGameState({ seed: 236, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  state.turn.step = 'main2';
  state.turn.phase = 'postcombat_main';
  addMana(state, 'p2', 10);
  put(state, 'bark', 'barkform-harvester', 'p2', 'battlefield');
  put(state, 'g1', 'shock', 'p2', 'graveyard');
  const bot = createHeuristicBot({ seed: 236 });
  const choice = bot.chooseCommand(playerView(state, 'p2'), {});
  assert.notEqual(choice.type === 'activate_ability' && choice.objectId === 'bark' ? 'act' : 'inne', 'act',
    `bot nie powinien palić many na zakopanie karty na spód: ${JSON.stringify(choice)}`);
  const opts = bot.trace()[0].options;
  const act = opts.find((o) => o.cmd.startsWith('activate_ability(bark'))?.score;
  const pass = opts.find((o) => o.cmd === 'pass_priority')?.score ?? 0;
  assert.ok(act < pass, `zakopanie na spód (${act}) musi być < pass (${pass})`);
});
