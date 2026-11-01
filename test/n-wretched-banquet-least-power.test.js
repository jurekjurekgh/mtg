// N (zgłoszenie właściciela 2026-10-30, Wretched Banquet): „bot nie umie jej
// rzucać. Rzuca ją na moją największą kreaturę, a nie na taką, która ma
// najmniejszy power wśród kreatur na stole. Więc czar nie działa i jest
// zmarnowany.”
//
// Root cause: `destroy_if_least_power` był w REMOVAL_EFFECTS wyceniany
// DOKŁADNIE jak `destroy_permanent` — premia rosła z P/T ofiary
// (`removalEnemyBase + removalWorthWeight × (power+toughness) + bonus TMC`),
// więc bot wybierał NAJWIĘKSZEGO stwora, choć warunek efektu (CR 608.2b,
// sprawdzany przy rozstrzyganiu) pozwala zniszczyć TYLKO cel o najmniejszej
// mocy. Silnik jest poprawny (effects.js) — błąd był w scoringu, a `execute`
// zwraca `ok: true`, więc bot nie dostawał żadnego sygnału zwrotnego.
//
// Fix u root cause (ADR 0002 — po deskryptorze efektu, nie po nazwie karty):
// `leastPowerRemovalFizzles` liczy najmniejszą moc na stole z WIDOKU (moc
// efektywna, ADR 0017 — ta sama, którą porównuje silnik) i karze cel, który
// warunku nie spełnia, `leastPowerRemoveFizzlePenalty` (domyślnie 120 pkt).
// L41: ta sama bramka w `cast_spell` i w `activate_ability`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { DEFAULT_HEURISTIC_PARAMS } from '../src/controllers/heuristic-params.js';

const REGISTRY = createCardRegistry();

function put(state, { id, cardId, controllerId, zone, power = null, toughness = null, manaCost = null }) {
  const card = REGISTRY.get(cardId);
  assert.ok(card, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(card), types: card.types ?? [], keywords: card.keywords ?? [],
    subtypes: card.subtypes ?? [], spell: card.spell,
  });
  state.objects.set(id, Object.freeze({
    ...state.objects.get(id),
    summoningSickness: false,
    power: power ?? (card.power ?? null),
    toughness: toughness ?? (card.toughness ?? null),
    manaCost: manaCost ?? (card.manaCost ?? 0),
  }));
}

function creature(state, id, controllerId, power, toughness) {
  put(state, { id, cardId: 'highland-game', controllerId, zone: 'battlefield', power, toughness, manaCost: power });
}

/** Tura bota (p2), priorytet bota, 10 many (czar kosztuje {B}). */
function botTurn() {
  const state = createGameState({ seed: 2026, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', 10, { colors: ['B'] });
  put(state, { id: 'banquet', cardId: 'wretched-banquet', controllerId: 'p2', zone: 'hand' });
  return state;
}

/** Wybór bota + mapa score'ów ofert (klucz: „cmd|cel”). */
function ocena(state) {
  const bot = createHeuristicBot({ seed: 2026 });
  const choice = bot.chooseCommand(playerView(state, 'p2'), {});
  const options = bot.trace().at(-1)?.options ?? [];
  const score = (predykat) => options.find(predykat)?.score;
  return {
    choice,
    opcje: options,
    scoreCast: (targetId) => score((o) => /cast_spell/.test(o.cmd) && o.cmd.includes(targetId)),
    scorePass: score((o) => /pass_priority/.test(o.cmd)),
  };
}

test('N/1: bot celuje w stwora o NAJMNIEJSZEJ mocy, nie w największego', () => {
  const state = botTurn();
  creature(state, 'big', 'p1', 5, 5);
  creature(state, 'small', 'p1', 1, 1);
  const { choice, scoreCast } = ocena(state);

  assert.equal(choice.type, 'cast_spell', `bot rzuca czar: ${JSON.stringify(choice)}`);
  assert.deepEqual(choice.targets, ['small'],
    `cel = najmniejsza moc na stole (1/1), nie 5/5: ${JSON.stringify(choice)}`);
  // Kara za cel bez najmniejszej mocy musi przebić premię removalu — wariant
  // „największy stwór” nie może wygrać z poprawnym celem ANI z passem.
  assert.ok(scoreCast('big') < scoreCast('small'),
    `wariant 5/5 (${scoreCast('big')}) < wariant 1/1 (${scoreCast('small')})`);
});

test('N/2: remis najmniejszej mocy jest legalny (dowolny z dwóch 2/2)', () => {
  const state = botTurn();
  creature(state, 'a', 'p1', 2, 2);
  creature(state, 'b', 'p1', 2, 2);
  const { choice, scoreCast } = ocena(state);

  assert.equal(choice.type, 'cast_spell', `bot rzuca czar: ${JSON.stringify(choice)}`);
  assert.ok(['a', 'b'].includes(choice.targets?.[0]), `cel z remisu: ${JSON.stringify(choice)}`);
  assert.equal(scoreCast('a'), scoreCast('b'), 'remis mocy = remis score');
});

test('N/3: jedyny stwór na stole JEST najmniejszy — rzut legalny', () => {
  const state = botTurn();
  creature(state, 'big', 'p1', 5, 5);
  const { choice } = ocena(state);

  assert.equal(choice.type, 'cast_spell', `jedyny stwór spełnia warunek: ${JSON.stringify(choice)}`);
  assert.deepEqual(choice.targets, ['big']);
});

test('N/4: gdy najmniejsza moc należy do WŁASNEGO stwora, bot nie rzuca (fizzle vs pass)', () => {
  const state = botTurn();
  creature(state, 'big', 'p1', 5, 5);
  creature(state, 'mid', 'p1', 2, 2);
  creature(state, 'mine', 'p2', 1, 1);
  const { choice, scoreCast, scorePass } = ocena(state);

  assert.equal(choice.type, 'pass_priority',
    `żaden wrogi cel nie ma najmniejszej mocy — pass, nie zmarnowana karta: ${JSON.stringify(choice)}`);
  assert.ok(scoreCast('big') < scorePass,
    `wariant „rzuć w 5/5” (${scoreCast('big')}) musi przegrać z passem (${scorePass})`);
  assert.ok(scoreCast('mid') < scorePass);
});

test('N/5: kara za fizzle jest pokrętłem ≥ 0 (parametr, nie magiczna liczba)', () => {
  assert.equal(typeof DEFAULT_HEURISTIC_PARAMS.leastPowerRemoveFizzlePenalty, 'number');
  assert.ok(DEFAULT_HEURISTIC_PARAMS.leastPowerRemoveFizzlePenalty > 0);
});
