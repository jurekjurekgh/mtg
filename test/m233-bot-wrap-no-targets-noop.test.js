// M233 — audyt Żywym Testerem (2026-08-27), partia tarkir-wur (gracz) vs
// warhammer-ubr (bot), seed 11: w turze 12 bot rzucił Wrap in Flames
// (Sorcery 4 many: „1 obrażenie każdemu z max 3 celów + nie może blokować")
// mimo że gracz NIE kontrolował żadnego stwora. Czar poszedł BEZ CELÓW —
// 4 many i cała karta wyrzucone za zero efektu.
//
// Oś 1 audytu (bezsensowne działania bota — technicznie legalne, marnują
// czar/manę/potencjał). Root cause: `effectIsInertNow` nie miał przypadku dla
// wrappera `apply_to_each_target`. Gdy jedyny legalny wariant to rzut BEZ
// celów (variableTargets min:0, brak celów na stole), wrapper aplikuje efekty
// wewnętrzne do KAŻDEGO celu — a zero celów = zero efektu. Wycena zostawała na
// bazie spellBase (50) > pass (0), więc bot rzucał. Naprawa: wrapper bez celów
// jest jałowy (ADR 0002 — generycznie po typie efektu, nie po nazwie karty).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function putCard(state, id, cardId, controllerId, zone) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness, manaCost: data.manaCost,
    spell: data.spell, abilities: data.abilities ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], types: def.types ?? [], colors: data.colors ?? [],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

function botTurn() {
  const state = createGameState({ seed: 233, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', 10);
  return state;
}

function wrapScores(state) {
  const bot = createHeuristicBot({ seed: 233 });
  bot.chooseCommand(playerView(state, 'p2'), {});
  const trace = bot.trace()[0];
  const pass = trace.options.find((o) => o.cmd === 'pass_priority')?.score ?? 0;
  const wrap = trace.options.filter((o) => o.cmd.startsWith('cast_spell(w')).map((o) => o.score);
  return { pass, wrap };
}

test('M233: bot NIE rzuca Wrap in Flames bez celów (brak stworów wroga)', () => {
  const state = botTurn();
  putCard(state, 'w', 'wrap-in-flames', 'p2', 'hand');
  // Brak jakichkolwiek stworów na stole → jedyny legalny wariant to 0 celów.
  const choice = createHeuristicBot({ seed: 233 }).chooseCommand(playerView(state, 'p2'), {});
  assert.notEqual(
    choice.type === 'cast_spell' && choice.objectId === 'w' ? 'cast-wrap-empty' : 'inne',
    'cast-wrap-empty',
    `bot nie powinien rzucać Wrap in Flames bez celów: ${JSON.stringify(choice)}`,
  );
});

test('M233: wycena Wrap in Flames bez celów < pass', () => {
  const state = botTurn();
  putCard(state, 'w', 'wrap-in-flames', 'p2', 'hand');
  const { pass, wrap } = wrapScores(state);
  assert.ok(wrap.length > 0, 'wariant bez celów powinien istnieć w śladzie');
  for (const s of wrap) assert.ok(s < pass, `Wrap bez celów (${s}) musi być poniżej passu (${pass})`);
});

test('M233: Wrap in Flames NADAL premiowany na stworze wroga (regresja M158)', () => {
  const state = botTurn();
  putCard(state, 'w', 'wrap-in-flames', 'p2', 'hand');
  putCard(state, 'foe', 'thornhide-wolves', 'p1', 'battlefield');
  const { pass, wrap } = wrapScores(state);
  assert.ok(wrap.some((s) => s > pass), `Wrap na cel wroga powinien przebić pass: ${JSON.stringify(wrap)} vs ${pass}`);
});
