// Fix B — zgłoszenie właściciela (2026-09-27): „bot przy 8 życiach nie
// chumpował 3/3 — leciało w niego latające 7/5 + 3/3 + 4/5, a miał 7/7, 1/1,
// 2/2 i 1/1. Musiał zablokować 4/5 siódemką i podstawić 1/1 pod 3/3".
//
// Root cause (engine, nie punktacja): (atakujący+1)^blokerzy = 4^4 = 256 >
// COMBAT_OPTION_CAP (32), więc legalBlockerOptions szedł gałęzią nad-cap,
// która oferuje dokładnie JEDNO przypisanie wieloatakujące (greedy). Pętla
// greedy miała `break` przy pierwszym nieblokowalnym atakującym — a latające
// 7/5 zadeklarowano jako PIERWSZE, więc greedy umierało w całości i bot
// fizycznie nie mógł zestawić bloku ratującego życie (wybierał {a45:[b77]}).
//
// Fix (combat.js): `break` → `continue` + kolejność greedy wg zagrożenia
// (moc malejąco, stabilnie), żeby przy niedoborze ciał największe zagrożenie
// nie zostawało odblokowane przez kolejność deklaracji.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState, execute, playerView, addObject } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { legalBlockerOptions } from '../src/engine/combat.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function game() {
  const state = createGameState({ seed: 11, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  return state;
}

function addBody(state, id, controllerId, cardId, patch) {
  const def = REGISTRY.get(cardId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId,
    zone: 'battlefield', kind: 'creature', power: def.power, toughness: def.toughness,
    manaCost: def.manaCost, types: def.types, subtypes: def.subtypes ?? [],
    keywords: def.keywords ?? [], abilities: def.abilities ?? [], colors: def.colors ?? [],
  });
  state.objects.set(id, Object.freeze({
    ...state.objects.get(id), summoningSickness: false, tapped: false, ...patch,
  }));
}

function toBlockersStep(state, attackerIds) {
  const declared = execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds });
  assert.equal(declared.ok, true, `deklaracja ataku: ${declared.reason ?? '?'}`);
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  assert.equal(state.turn.step, 'declare_blockers');
}

// Scenariusz ze zgłoszenia: latające 7/5 zadeklarowane JAKO PIERWSZE.
function reportScenario() {
  const state = game();
  addBody(state, 'fly', 'p1', 'rustwing-falcon', { power: 7, toughness: 5 });
  addBody(state, 'a33', 'p1', 'highland-game', { power: 3, toughness: 3 });
  addBody(state, 'a45', 'p1', 'highland-game', { power: 4, toughness: 5 });
  addBody(state, 'b77', 'p2', 'highland-game', { power: 7, toughness: 7 });
  addBody(state, 'b11a', 'p2', 'highland-game', { power: 1, toughness: 1 });
  addBody(state, 'b22', 'p2', 'highland-game', { power: 2, toughness: 2 });
  addBody(state, 'b11b', 'p2', 'highland-game', { power: 1, toughness: 1 });
  state.players = state.players.map((p) => (p.id === 'p2' ? { ...p, life: 8 } : p));
  toBlockersStep(state, ['fly', 'a33', 'a45']);
  return state;
}

test('FixB/T1: nieblokowalny atakujący jako pierwszy nie ubija oferty multi-bloku', () => {
  const state = reportScenario();
  const offers = legalBlockerOptions(state, 'p2');
  assert.ok(offers.length > 1, 'gałąź nad-cap daje ofertę');
  const multi = offers.filter((o) => Object.keys(o).length > 1);
  assert.ok(multi.length > 0, 'istnieje przypisanie wieloatakujące mimo fly-na-pierwszym');
  const survival = multi.find((o) => o.a45?.includes('b77') && o.a33?.length === 1);
  assert.ok(survival, `oferta zawiera zabicie 4/5 + chump 3/3, jest: ${JSON.stringify(multi)}`);
});

test('FixB/T2: greedy pokrywa największe zagrożenie pierwsze (niedobór ciał)', () => {
  // 5 atakujących × 2 blokerów: 6^2 = 36 > 32 → gałąź nad-cap; ciał mniej niż
  // atakujących, więc kolejność greedy decyduje, kto zostaje odblokowany.
  const state = game();
  addBody(state, 'big', 'p1', 'highland-game', { power: 7, toughness: 7 });
  for (const id of ['s1', 's2', 's3', 's4']) addBody(state, id, 'p1', 'highland-game', { power: 1, toughness: 1 });
  addBody(state, 'd1', 'p2', 'highland-game', { power: 2, toughness: 2 });
  addBody(state, 'd2', 'p2', 'highland-game', { power: 2, toughness: 2 });
  toBlockersStep(state, ['s1', 's2', 's3', 's4', 'big']); // największy celowo OSTATNI
  const offers = legalBlockerOptions(state, 'p2');
  const multi = offers.filter((o) => Object.keys(o).length > 1);
  assert.ok(multi.length > 0, 'istnieje przypisanie wieloatakujące');
  assert.ok(multi.some((o) => 'big' in o), `greedy pokrywa 7/7 mimo deklaracji na końcu, jest: ${JSON.stringify(multi)}`);
});

test('FixB/T3: bot PRZEŻYWA scenariusz ze zgłoszenia (blok 4/5 + chump 3/3)', () => {
  const state = reportScenario();
  const view = playerView(state, 'p2');
  const choice = createHeuristicBot({ seed: 7 }).chooseCommand(view, {});
  assert.equal(choice.type, 'declare_blockers', `bot blokuje, nie: ${choice.type}`);
  const a = choice.assignments ?? {};
  assert.ok('a45' in a && 'a33' in a, `bot blokuje OBU naziemnych: ${JSON.stringify(a)}`);
  const dmg = { fly: 7, a33: 3, a45: 4 };
  const taken = Object.keys(dmg).filter((id) => !(id in a)).reduce((s, id) => s + dmg[id], 0);
  assert.ok(taken < 8, `bot przeżywa (bierze ${taken} przy 8 życiach)`);
});

test('FixB/T4: menace-nie-do-pokrycia nie przerywa greedy dla reszty', () => {
  // 3 atakujących × 4 blokerów: 4^4 = 256 > 32 → nad-cap. Latający menace
  // 5/5 nie do zablokowania przez naziemnych (ani jeden nie lata) — greedy
  // ma go pominąć i pokryć obu naziemnych.
  const state = game();
  addBody(state, 'men', 'p1', 'rustwing-falcon', { power: 5, toughness: 5, keywords: ['flying', 'menace'] });
  addBody(state, 'g33', 'p1', 'highland-game', { power: 3, toughness: 3 });
  addBody(state, 'g22', 'p1', 'highland-game', { power: 2, toughness: 2 });
  for (const id of ['w1', 'w2', 'w3', 'w4']) addBody(state, id, 'p2', 'highland-game', { power: 2, toughness: 2 });
  toBlockersStep(state, ['men', 'g33', 'g22']);
  const offers = legalBlockerOptions(state, 'p2');
  const multi = offers.filter((o) => Object.keys(o).length > 1);
  assert.ok(
    multi.some((o) => 'g33' in o && 'g22' in o),
    `greedy pokrywa obu naziemnych mimo menace-flycera na pierwszym: ${JSON.stringify(multi)}`,
  );
});
