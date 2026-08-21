// M169 — ostatnie uwagi właściciela z sesji (2026-08-21):
// J: bot nie dobija lethal — all-in mimo blokerów (18 mocy vs 6 życia
//    przy absorpcji 8 powinien atakować wszystkim).
// K: Phyrexian Rager przy 2 życia — samookaleczenie ETB „lose 1 life".
// L: atak 6/7 w samotnego odtapowanego 7/10 — lethal liczyły surową moc.
// M: Poison Token w panelu trucizny — klikalny (pełny ekran).
// N: Gray Slaad z menace — fallback enumeracji bloków ukrywał część
//    blokerów (greedy „zużywał" ich pod wcześniejszych atakujących).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { legalBlockerOptions } from '../src/engine/combat.js';

const REGISTRY = createCardRegistry();

function game(playerId = 'p2') {
  const state = createGameState({ seed: 169, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function putCard(state, id, cardId, controllerId, zone = 'battlefield', patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, ...patch,
  });
  return state.objects.get(id);
}

const patchStat = (state, id, power, toughness, extra = {}) => {
  const obj = state.objects.get(id);
  state.objects.set(id, Object.freeze({ ...obj, power, toughness, summoningSickness: false, ...extra }));
};

function attackStep(state, activeId) {
  state.turn = { ...state.turn, phase: 'combat', step: 'declare_attackers', activePlayerId: activeId, priorityPlayerId: activeId };
}

test('J1: bot DOBIA all-in, gdy po absorpcji blokerów zostaje lethal', () => {
  const state = game('p2');
  state.players.find((p) => p.id === 'p1').life = 6; // człowiek
  // Moje (p1) blokery: 4/6 i 1/2 (absorpcja 8).
  putCard(state, 'my46', 'highland-game', 'p1');
  patchStat(state, 'my46', 4, 6);
  putCard(state, 'my12', 'highland-game', 'p1');
  patchStat(state, 'my12', 1, 2);
  // Bot (p2): 4/1, 2/1, 6/7, 2/1, 2/2, 2/2 (18 mocy).
  const bots = [['b41', 4, 1], ['b21a', 2, 1], ['b67', 6, 7], ['b21b', 2, 1], ['b22a', 2, 2], ['b22b', 2, 2]];
  for (const [id, p, t] of bots) {
    putCard(state, id, 'highland-game', 'p2');
    patchStat(state, id, p, t);
  }
  attackStep(state, 'p2');
  const chosen = createHeuristicBot({ seed: 1 }).chooseCommand(playerView(state, 'p2'));
  assert.equal(chosen.type, 'declare_attackers');
  const count = (chosen.attackerIds ?? []).length;
  assert.ok(count >= 5, `all-in (>=5 z 6 atakujących; penetrating 18-8=10 >= 6 życia), a wybrał ${count}: ${chosen.attackerIds}`);
});

test('L1: bot NIE atakuje 6/7 w samotnego odtapowanego 7/10', () => {
  const state = game('p2');
  state.players.find((p) => p.id === 'p1').life = 20;
  putCard(state, 'my710', 'highland-game', 'p1');
  patchStat(state, 'my710', 7, 10);
  putCard(state, 'b67', 'highland-game', 'p2');
  patchStat(state, 'b67', 6, 7);
  attackStep(state, 'p2');
  const chosen = createHeuristicBot({ seed: 1 }).chooseCommand(playerView(state, 'p2'));
  if (chosen.type === 'declare_attackers') {
    assert.ok(!(chosen.attackerIds ?? []).includes('b67'),
      `6/7 nie atakuje w 7/10 (ginie bez zysku, penetrating 6-10<0), a wybrał: ${chosen.attackerIds}`);
  } else {
    assert.notEqual(chosen.type + ':b67', 'declare_attackers:b67');
  }
});

test('K1: Phyrexian Rager przy 2 życia — bot NIE rzuca (samookaleczenie)', () => {
  const state = game('p2');
  state.players.find((p) => p.id === 'p2').life = 2;
  for (let i = 0; i < 8; i += 1) putCard(state, 'b' + i, 'highland-game', 'p2'); // 8 stworów na stole
  putCard(state, 'rager', 'phyrexian-rager', 'p2', 'hand');
  addMana(state, 'p2', 3, { colors: ['B'] });
  const view = playerView(state, 'p2');
  assert.ok(view.legalCommands.some((c) => c.type === 'cast_permanent' && c.objectId === 'rager'), 'oferta rzutu');
  const chosen = createHeuristicBot({ seed: 1 }).chooseCommand(view);
  assert.notEqual(chosen.type + ':' + chosen.objectId, 'cast_permanent:rager',
    'przy 2 życia ETB „lose 1 life" = zejście do 1 — bot rezygnuje');
});

test('K2: Phyrexian Rager przy 20 życia — normalnie rzucany', () => {
  const state = game('p2');
  for (let i = 0; i < 8; i += 1) putCard(state, 'b' + i, 'highland-game', 'p2');
  putCard(state, 'rager', 'phyrexian-rager', 'p2', 'hand');
  addMana(state, 'p2', 3, { colors: ['B'] });
  const view = playerView(state, 'p2');
  const chosen = createHeuristicBot({ seed: 1 }).chooseCommand(view);
  assert.equal(chosen.type + ':' + chosen.objectId, 'cast_permanent:rager',
    'przy zdrowym życiu Rager (draw + 2/2 za 3) to dobry rzut');
});

test('N1: menace — fallback enumeracji pokazuje WSZYSTKICH blokerów pod Slaadem', () => {
  const state = game('p2');
  // Gray Slaad z AKTYWNYM menace (4 karty stwora w grobie p2) + 5 innych
  // atakujących → enumeracja pełna przekracza cap → fallback.
  putCard(state, 'slaad', 'gray-slaad', 'p2');
  for (let i = 0; i < 4; i += 1) putCard(state, 'dead' + i, 'highland-game', 'p2', 'graveyard');
  for (let i = 0; i < 5; i += 1) {
    putCard(state, 'atk' + i, 'highland-game', 'p2');
    patchStat(state, 'atk' + i, 2, 2);
  }
  // Trzech moich potencjalnych blokerów, w tym „Kabira" (dowolny stwór).
  putCard(state, 'kabira', 'highland-game', 'p1');
  patchStat(state, 'kabira', 1, 3);
  putCard(state, 'tok', 'highland-game', 'p1');
  patchStat(state, 'tok', 1, 1);
  putCard(state, 'bell', 'highland-game', 'p1');
  patchStat(state, 'bell', 1, 2);
  attackStep(state, 'p2');
  execute(state, { type: 'declare_attackers', playerId: 'p2', attackerIds: ['slaad', 'atk0', 'atk1', 'atk2', 'atk3', 'atk4'] });
  state.turn = { ...state.turn, phase: 'combat', step: 'declare_blockers', activePlayerId: 'p2', priorityPlayerId: 'p1' };
  const options = legalBlockerOptions(state, 'p1');
  // Każdy bloker musi być widoczny jako kandydat pod Slaadem (menace ≥2).
  const underSlaad = new Set(options.flatMap((opt) => opt.slaad ?? []));
  for (const id of ['kabira', 'tok', 'bell']) {
    assert.ok(underSlaad.has(id), `bloker ${id} oferowany pod Gray Slaad (menace)`);
  }
  // Opcje pod Slaadem mają zawsze 2 blokerów (menace) albo brak.
  for (const opt of options) {
    const ids = opt.slaad ?? [];
    assert.ok(ids.length === 0 || ids.length >= 2, `opcja pod menace: 0 lub >=2 blokerów, a jest ${ids.length}`);
  }
});
