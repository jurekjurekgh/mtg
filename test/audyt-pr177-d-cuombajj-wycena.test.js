/**
 * Sesja 2026-10-27c (PR #177) — uwaga D właściciela z gry.
 *
 * PIN: bez naprawy czerwienieje (mutacja sprawdzona w ciele PR #177).
 *
 * D. Cuombajj Witches („1 damage to any target and 1 damage to any target of an
 * opponent's choice"): bot strzelał w cel, który właśnie miał walczyć (mój
 * Time to Feed na stosie) → własny czar fizzlował (CR 608.2b), a slot
 * wskazywany przez PRZECIWNIKA nie był wyceniany w ogóle.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function put(state, { id, cardId, controllerId, zone, kind }) {
  const card = REGISTRY.get(cardId);
  assert.ok(card, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone, kind,
    ...gameObjectDataOf(card), types: card.types ?? [], keywords: card.keywords ?? [],
    subtypes: card.subtypes ?? [], spell: card.spell,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

function damageIt(state, id, damage) {
  const object = state.objects.get(id);
  state.objects.set(id, Object.freeze({ ...object, damage, damagedThisTurn: true }));
}

/** Tura bota (p2), priorytet bota, pełna pula. */
function botTurn(step = 'main1') {
  const state = createGameState({ seed: 2026, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', 10);
  return state;
}

const bot = () => createHeuristicBot({ seed: 7 });

// ------------------------------------------------------ D (Cuombajj) ------
test('D: bot nie dobija celu, który właśnie walczy z mojego Time to Feed (własny czar by fizzlował)', () => {
  const state = botTurn('main1');
  put(state, { id: 'ttf', cardId: 'time-to-feed', controllerId: 'p2', zone: 'hand', kind: 'spell' });
  put(state, { id: 'witches', cardId: 'cuombajj-witches', controllerId: 'p2', zone: 'battlefield', kind: 'creature' });
  put(state, { id: 'beast', cardId: 'greenwood-sentinel', controllerId: 'p2', zone: 'battlefield', kind: 'creature' });
  put(state, { id: 'tactician', cardId: 'cenns-tactician', controllerId: 'p1', zone: 'battlefield', kind: 'creature' });
  const cast = execute(state, {
    type: 'cast_spell', playerId: 'p2', objectId: 'ttf', targets: ['tactician', 'beast'],
  });
  assert.equal(cast.ok, true, `Time to Feed rzucony (${cast.reason ?? 'ok'})`);
  assert.equal(state.turn.priorityPlayerId, 'p2', 'priorytet bota przy własnym czarze na stosie');

  const choice = bot().chooseCommand(playerView(state, 'p2'), {});
  assert.notEqual(choice.type, 'activate_ability',
    `zdolność Cuombajj zabiłaby cel własnego czaru (CR 608.2b); wybrał ${JSON.stringify(choice)}`);
  assert.equal(state.objects.get('tactician').zone, 'battlefield', 'cel czaru nadal żyje');
});

test('D: dobicie przeciwnika przy niskim życiu jest grane', () => {
  const state = botTurn('main1');
  put(state, { id: 'witches', cardId: 'cuombajj-witches', controllerId: 'p2', zone: 'battlefield', kind: 'creature' });
  put(state, { id: 'foe', cardId: 'greenwood-sentinel', controllerId: 'p1', zone: 'battlefield', kind: 'creature' });
  state.players.find((p) => p.id === 'p1').life = 4;

  const choice = bot().chooseCommand(playerView(state, 'p2'), {});
  assert.equal(choice.type, 'activate_ability', `1 obrażenie przy 4 życia wroga = dobicie; wybrał ${JSON.stringify(choice)}`);
  assert.deepEqual(choice.targets, ['p1']);
});

test('D: lethal na uszkodzonym stworze przeciwnika jest grane', () => {
  const state = botTurn('main1');
  put(state, { id: 'witches', cardId: 'cuombajj-witches', controllerId: 'p2', zone: 'battlefield', kind: 'creature' });
  put(state, { id: 'foe', cardId: 'greenwood-sentinel', controllerId: 'p1', zone: 'battlefield', kind: 'creature' });
  damageIt(state, 'foe', 1); // 2/2 z 1 obrażeniem → 1 dmg to lethal

  const choice = bot().chooseCommand(playerView(state, 'p2'), {});
  assert.equal(choice.type, 'activate_ability',
    `dobicie uszkodzonego 2/2 to removal; wybrał ${JSON.stringify(choice)}`);
  assert.deepEqual(choice.targets, ['foe']);
});

test('D: „podstrzelenie” zdrowego stwora nie jest grane (ryzykowna zdolność = tylko realny zysk)', () => {
  const state = botTurn('main1');
  put(state, { id: 'witches', cardId: 'cuombajj-witches', controllerId: 'p2', zone: 'battlefield', kind: 'creature' });
  put(state, { id: 'foe', cardId: 'greenwood-sentinel', controllerId: 'p1', zone: 'battlefield', kind: 'creature' });

  const choice = bot().chooseCommand(playerView(state, 'p2'), {});
  assert.notEqual(choice.type, 'activate_ability',
    `1 obrażenie w zdrowego 2/2 nic nie zmienia, a przeciwnik wybiera drugi cel; wybrał ${JSON.stringify(choice)}`);
});

test('D: ryzyko drugiego celu (przeciwnik) przeważa — przy 2 życiach nie pingujemy za darmo', () => {
  // Cuombajj: „…and 1 damage to any target of an opponent's choice". Przy 2
  // życiach ten wybór (twarz) jest wart 80 w drabinie samouszkodzenia, więc
  // dobicie wrogiego 2/2 (~30) NIE może wygrać z passem. Bez wyceny slotu
  // przeciwnika wariant miałby +30 i bot oddawałby sobie życie za darmo.
  const state = botTurn('main1');
  put(state, { id: 'witches', cardId: 'cuombajj-witches', controllerId: 'p2', zone: 'battlefield', kind: 'creature' });
  put(state, { id: 'foe', cardId: 'greenwood-sentinel', controllerId: 'p1', zone: 'battlefield', kind: 'creature' });
  damageIt(state, 'foe', 1);
  state.players.find((p) => p.id === 'p2').life = 2;

  const choice = bot().chooseCommand(playerView(state, 'p2'), {});
  assert.notEqual(choice.type, 'activate_ability',
    `przy 2 życiach ryzyko drugiego celu bije zysk; wybrał ${JSON.stringify(choice)}`);
});

test('D: nie rusza celu (wartościowego, uszkodzonego), który ma walczyć z mojego czaru', () => {
  // Ten sam zakaz co wyżej, ale przy celu o TMC ≥ 2 — czyli takim, którego
  // dobicie model „zasobu limitowanego" UZNAJE za opłacalne. Rozstrzyga
  // wyłącznie wiedza, że obiekt na MOIM stosie potrzebuje tego celu (CR 608.2b).
  const state = botTurn('main1');
  put(state, { id: 'ttf', cardId: 'time-to-feed', controllerId: 'p2', zone: 'hand', kind: 'spell' });
  put(state, { id: 'witches', cardId: 'cuombajj-witches', controllerId: 'p2', zone: 'battlefield', kind: 'creature' });
  put(state, { id: 'beast', cardId: 'greenwood-sentinel', controllerId: 'p2', zone: 'battlefield', kind: 'creature' });
  put(state, { id: 'knight', cardId: 'knight-of-the-skyward-eye', controllerId: 'p1', zone: 'battlefield', kind: 'creature' });
  damageIt(state, 'knight', 1); // 2/2 z 1 obrażeniem → 1 dmg = lethal

  const cast = execute(state, {
    type: 'cast_spell', playerId: 'p2', objectId: 'ttf', targets: ['knight', 'beast'],
  });
  assert.equal(cast.ok, true, `Time to Feed rzucony (${cast.reason ?? 'ok'})`);

  const choice = bot().chooseCommand(playerView(state, 'p2'), {});
  assert.notEqual(choice.type, 'activate_ability',
    `zdolność zabiłaby cel własnego czaru; wybrał ${JSON.stringify(choice)}`);
});
