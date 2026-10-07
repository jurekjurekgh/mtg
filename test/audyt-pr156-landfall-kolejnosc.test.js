// Audyt PR #156, znalezisko F1 (2026-10-07): kara bota
// `landDropWastesLandfallPenalty` (commity C/C2 PR #156) weszła BEZ żadnego
// pinu — mutacja audytowa M156-1 (kara → 0) zostawiła 7750/7750 zielonych.
// L54: „kara/premia okna czasowego […] test ZACHOWANIA jest obowiązkowy";
// L13: liczy się dowód czerwienienia po cofnięciu naprawy.
//
// Reguła (generyczna, po deskryptorze — ADR 0002): gdy w ręce jest RZUCALNY
// nosiciel landfall „you may gain N life" (trigger
// land_entered_under_your_control + efekt gain_life), ląd i main phase, to
// `play_land` dostaje karę 30+gain — bot gra najpierw stwora, potem ląd
// (trigger daje życie w tej samej turze). Wyjątki: (a) nosiciel NIE jest
// rzucalny (brak many) — kary nie ma, ląd odblokowuje rzut; (b) C2 — ląd
// odblokowuje DROŻSZY/LEPSZY czar niż nosiciel — kara nie nalicza się, ląd
// umożliwia lepszy play.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function stol({ lasyPolne = 3 } = {}) {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  for (let i = 0; i < lasyPolne; i += 1) {
    addObject(state, {
      id: `las${i}`, instanceId: `i-las${i}`, cardId: 'basic-forest', cardName: 'Forest',
      controllerId: 'p1', ownerId: 'p1', zone: 'battlefield', kind: 'land', manaCost: 0,
      subtypes: ['Forest'], types: ['Basic', 'Land'], colors: ['G'], abilities: [], keywords: [],
    });
  }
  return state;
}

const lasDoReki = (state, id = 'h-las') => addObject(state, {
  id, instanceId: `i-${id}`, cardId: 'basic-forest', cardName: 'Forest',
  controllerId: 'p1', ownerId: 'p1', zone: 'hand', kind: 'land', manaCost: 0,
  subtypes: ['Forest'], types: ['Basic', 'Land'], colors: ['G'], abilities: [], keywords: [],
});

// Nosiciel landfall z REALNEJ definicji rejestru (Grazing Gladehart {2}{G}:
// „Landfall — Whenever a land you control enters, you may gain 2 life").
const gladehartDoReki = (state, id = 'h-glad') => {
  const def = REGISTRY.get('grazing-gladehart');
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'grazing-gladehart', cardName: 'Grazing Gladehart',
    controllerId: 'p1', ownerId: 'p1', zone: 'hand', kind: 'creature', manaCost: def.manaCost,
    power: def.power, toughness: def.toughness, types: ['Creature'], subtypes: ['Antelope'],
    colors: ['G'], abilities: def.abilities, keywords: [],
  });
};

// Zwykły stwór bez landfall (kontrola anty-over-fix).
const zwyklyStworDoReki = (state, id = 'h-cub', cost = 2) => addObject(state, {
  id, instanceId: `i-${id}`, cardId: 'highland-game', cardName: 'Highland Game',
  controllerId: 'p1', ownerId: 'p1', zone: 'hand', kind: 'creature', manaCost: cost,
  power: 2, toughness: 1, types: ['Creature'], subtypes: [], colors: ['G'],
  abilities: [], keywords: [],
});

const pickScores = (state, seed = 156) => {
  const bot = createHeuristicBot({ seed });
  bot.chooseCommand(playerView(state, 'p1'), {});
  return { pick: bot.trace()[0].chosen, options: bot.trace()[0].options };
};

const scoreOf = (options, prefiks) => {
  const opt = options.find((o) => o.cmd.startsWith(prefiks));
  return opt ? opt.score : null;
};

test('F1/T1: rzucalny nosiciel landfall + ląd w ręce → najpierw stwór, potem ląd', () => {
  // 3 nietapnięte lasy: Gladehart {2}{G} rzucalny; ląd w ręce czeka.
  const state = stol({ lasyPolne: 3 });
  gladehartDoReki(state);
  lasDoReki(state);
  const { pick, options } = pickScores(state);
  const cast = scoreOf(options, 'cast_permanent(h-glad');
  const land = scoreOf(options, 'play_land(h-las');
  assert.ok(cast != null, 'oferta rzutu Gladeharta istnieje');
  assert.ok(land != null, 'oferta zagrania lądu istnieje');
  assert.ok(land < cast,
    `kara za zmarnowanie landfall odwraca kolejność: land ${land} < stwór ${cast}`);
  assert.ok(pick.startsWith('cast_permanent(h-glad'), `bot gra stwora przed lądem: ${pick}`);
});

test('F1/T2: nosiciel NIE jest rzucalny → kary brak, ląd odblokowuje rzut', () => {
  // 1 las: Gladehart {2}{G} poza zasięgiem — kara NIE może odwracać
  // kolejności (anty-over-fix z commitu C).
  const state = stol({ lasyPolne: 1 });
  gladehartDoReki(state);
  lasDoReki(state);
  const { pick } = pickScores(state);
  assert.ok(pick.startsWith('play_land(h-las'),
    `przy nierzucalnym nosicielu bot gra ląd (odblokowanie): ${pick}`);
});

test('F1/T3 (C2): ląd odblokowuje DROŻSZY czar → kara nie nalicza się', () => {
  // 3 lasy: Gladehart (koszt 3) rzucalny; w ręce dodatkowo karta za 4 —
  // dziś nierzucalna, po +1 lądzie rzucalna i DROŻSZA od nosiciela.
  // bestUnlockCost(4) > bestLandfallCost(3) → kara 0 → ląd wygrywa.
  const state = stol({ lasyPolne: 3 });
  gladehartDoReki(state);
  zwyklyStworDoReki(state, 'h-bomba', 4);
  lasDoReki(state);
  const { pick, options } = pickScores(state);
  const land = scoreOf(options, 'play_land(h-las');
  assert.ok(land != null, 'oferta lądu istnieje');
  assert.ok(land > 80, `bez kary ląd zachowuje bazę ~90: score=${land}`);
  assert.ok(pick.startsWith('play_land(h-las'),
    `C2: ląd umożliwia droższy czar, więc bot gra ląd: ${pick}`);
});

test('F1/T4 (kontrola): brak nosiciela landfall → kara nie działa', () => {
  // Zwykły stwór za 2 + ląd: nic nie uzasadnia kary — ląd wygrywa bazą.
  const state = stol({ lasyPolne: 3 });
  zwyklyStworDoReki(state, 'h-zwykly', 2);
  lasDoReki(state);
  const { pick } = pickScores(state);
  assert.ok(pick.startsWith('play_land(h-las'),
    `bez nosiciela landfall bot gra ląd przed tanim stworem: ${pick}`);
});
