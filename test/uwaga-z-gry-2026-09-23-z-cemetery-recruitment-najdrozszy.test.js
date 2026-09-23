// Uwaga D (właściciel, 2026-09-23c): „Cemetery Recruitment — bot bierze
// najtańszego stwora; ma brać najdroższego, na jakiego ma manę (także
// z tapniętych lądów)".
//
// Cards: Cemetery Recruitment ({1}{B}) — „Return target creature card from your
// graveyard to your hand. If it's a Zombie card, draw a card." Odzyskana karta
// wraca do RĘKI, więc jej wartość to nie tylko ciało: bot musi ją jeszcze
// rzucić. Wcześniejsza wycena (`return_card_from_graveyard_to_hand`) liczyła
// wyłącznie `drawCardValue + p*2 + t`, więc warianty o RÓWNYM ciele remisowały
// i wygrywał pierwszy z brzegu (często najtańszy) — dokładnie objaw zgłoszenia.
//
// Reguła (deskryptorowa, ADR 0002/0017): wartość odzyskanej karty rośnie
// z jej MANA VALUE, ale nie bardziej niż potencjał many bota — źródła na stole
// liczą się NIEZALEŻNIE od tapnięcia („także z tapniętych lądów": zapłata jest
// przyszła, po powrocie karty do ręki) plus mana w puli.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { DEFAULT_HEURISTIC_PARAMS } from '../src/controllers/heuristic-params.js';

const REGISTRY = createCardRegistry();
const BOT = 'p1';

function gra(pid = BOT) {
  const state = createGameState({ seed: 23, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', pid);
  state.turn.activePlayerId = pid;
  state.turn.priorityPlayerId = pid;
  return state;
}

function karta(state, id, cardId, controllerId, zone, patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false, ...patch }));
  return state.objects.get(id);
}

/** Scenariusz: czar w ręce, dwie karty-stwory w grobie, N bagien na stole. */
function scenariusz({ g1, g2, lands = 5, tapped = false }) {
  const state = gra();
  addMana(state, BOT, 2, { colors: ['B'] });
  karta(state, 'recruit', 'cemetery-recruitment', BOT, 'hand');
  karta(state, 'g1', g1, BOT, 'graveyard');
  karta(state, 'g2', g2, BOT, 'graveyard');
  for (let i = 0; i < lands; i += 1) {
    karta(state, `land${i}`, 'basic-swamp', BOT, 'battlefield', tapped ? { tapped: true } : {});
  }
  return state;
}

function decyzja(state) {
  const bot = createHeuristicBot({ seed: 3 });
  const chosen = bot.chooseCommand(playerView(state, BOT));
  const options = bot.trace().at(-1)?.options ?? [];
  return { chosen, options };
}

const scoreOf = (options, suffix) => options
  .find((o) => String(o.cmd).startsWith(`cast_spell(recruit->${suffix})`))?.score ?? null;

// Gloomfang Mauler (5/5, koszt 7) vs Ballista Wielder (5/5, koszt 4) — RÓWNE
// ciało, różne koszty: bez składnika many warianty remisują.
const DROGI = 'gloomfang-mauler';
const TANI = 'ballista-wielder';

test('D/1: równe ciało — bot bierze DROŻSZĄ kartę, na którą ma manę', () => {
  const { chosen, options } = decyzja(scenariusz({ g1: TANI, g2: DROGI, lands: 7 }));
  const drogi = scoreOf(options, 'g2');
  const tani = scoreOf(options, 'g1');
  assert.notEqual(drogi, tani, `warianty nie mogą remisować: ${JSON.stringify(options)}`);
  assert.ok(drogi > tani, `5/5 za 7 ma być cenniejsze niż 5/5 za 4: g2=${drogi}, g1=${tani}`);
  assert.deepEqual(chosen.targets, ['g2'], `bot ma zwrócić droższą kartę: ${JSON.stringify(chosen)}`);
});

test('D/2: potencjał many jest CZAPKĄ — przy 3 lądach droga karta nie ucieka', () => {
  const biedny = decyzja(scenariusz({ g1: TANI, g2: DROGI, lands: 3 }));
  assert.equal(scoreOf(biedny.options, 'g2'), scoreOf(biedny.options, 'g1'),
    'oba 5/5, oba przycięte do potencjału 3 — wycena równa (kara za nieosiągalny koszt)');
});

test('D/3: tapnięte lądy liczą się do potencjału („także z tapniętych")', () => {
  const odkrecone = decyzja(scenariusz({ g1: TANI, g2: DROGI, lands: 7 }));
  const tapniete = decyzja(scenariusz({ g1: TANI, g2: DROGI, lands: 7, tapped: true }));
  assert.deepEqual(tapniete.chosen.targets, odkrecone.chosen.targets,
    'tapnięcie lądów nie zmienia wyboru — patrzymy na POTENCJAŁ, nie na dostępną pulę');
  assert.deepEqual(tapniete.chosen.targets, ['g2'], 'nadal droższa karta');
});

test('D/4 (anty-over-fix): Zombie nadal premiowane dodatkowym dobraniem', () => {
  // 5/5 nie-Zombie (koszt 4) vs 4/6 Zombie (koszt 6, Minotaur Abomination):
  // ciało 14 vs 15, koszt 6 vs 4 — Zombie wygrywa ciałem, kosztem i dobraniem.
  const state = scenariusz({ g1: TANI, g2: 'minotaur-abomination', lands: 6 });
  const { chosen, options } = decyzja(state);
  assert.ok(scoreOf(options, 'g2') > scoreOf(options, 'g1'),
    `Zombie musi zostać na czele: ${scoreOf(options, 'g2')} vs ${scoreOf(options, 'g1')}`);
  assert.deepEqual(chosen.targets, ['g2'], 'bot zwraca Zombie');
});

test('D/5: pokrętło `graveReturnManaWeight` przepływa (właściciel może je zdjąć)', () => {
  const state = scenariusz({ g1: TANI, g2: DROGI, lands: 7 });
  const bot = createHeuristicBot({ seed: 3, params: { graveReturnManaWeight: 0 } });
  bot.chooseCommand(playerView(state, BOT));
  const options = bot.trace().at(-1)?.options ?? [];
  assert.equal(scoreOf(options, 'g2'), scoreOf(options, 'g1'),
    'bez wagi many wracamy do wyceny po samym ciele (remis 5/5)');
  assert.equal(DEFAULT_HEURISTIC_PARAMS.graveReturnManaWeight, 4,
    'domyślna waga: 4 punkty za każdy achievable punkt mana value');
});
