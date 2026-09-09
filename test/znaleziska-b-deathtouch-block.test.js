// F-B (znalezisko właściciela 2026-09-09): scoring blokowania nie zna
// deathtouch. Objaw: atakuje 4/4, a my mamy Deadly Recluse (1/2 deathtouch)
// i 2/2. Recluse SAMA zabija 4/4 (CR 702.4 — każde ≥1 obrażenie jest
// śmiertelne), więc dokładanie 2/2 jest zbędne. Root cause: gałąź
// `declare_blockers` liczyła `attackerDies = totalBlockerPower >=
// attackerToughness` — surową SUMĘ MOCY — i dla pary 1/2 deathtouch + 2/2
// dostawała 3 < 4, więc nie widziała, że deathtouch rozstrzyga wymianę.
//
// Fix: `attackerDies` jest prawdziwe, gdy któryś z żywych blokerów ma
// deathtouch i moc > 0 (diesToDeathtouchBlocker — CR 702.4) ALBO suma mocy
// ≥ wytrzymałość. Bot ma blokować samą Recluse, bez zbędnego 2/2.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function putReal(state, id, cardId, controllerId) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone: 'battlefield',
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  return state.objects.get(id);
}

/** Atakuje 4/4 (p1); obrona p2: Deadly Recluse (1/2 deathtouch) + 2/2 token. */
function stolDeathtouch({ recluse = true } = {}) {
  const state = createGameState({ seed: 700, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  putReal(state, 'att', 'highland-game', 'p1');
  state.objects.set('att', Object.freeze({ ...state.objects.get('att'), power: 4, toughness: 4, summoningSickness: false }));
  if (recluse) {
    putReal(state, 'recl', 'deadly-recluse', 'p2');
    state.objects.set('recl', Object.freeze({ ...state.objects.get('recl'), summoningSickness: false }));
  }
  putReal(state, 'cat', 'token_cat', 'p2');
  state.objects.set('cat', Object.freeze({ ...state.objects.get('cat'), summoningSickness: false }));
  const attack = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'declare_attackers' && (c.attackerIds ?? []).includes('att'));
  assert.ok(attack, 'deklaracja ataku 4/4 w ofercie');
  assert.ok(execute(state, attack).ok, 'atak przyjęty');
  execute(state, { type: 'pass_priority', playerId: 'p1' }); // okno po deklaracji (CR 508.2)
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  assert.equal(state.turn.step, 'declare_blockers', 'silnik prowadzi do kroku bloków');
  return state;
}

function blockOffers(state) {
  return playerView(state, 'p2').legalCommands
    .filter((c) => c.type === 'declare_blockers' && Object.keys(c.assignments ?? {}).length > 0)
    .map((c) => c.assignments);
}

test('F-B: oferta bloków zawiera samego blokera z deathtouch (oprócz pary)', () => {
  const state = stolDeathtouch();
  const offers = blockOffers(state);
  // Silnik enumeruje wszystkie legalne zestawy: sam Recluse, sam 2/2 i oba.
  assert.ok(offers.some((a) => (a.att ?? []).length === 1 && a.att[0] === 'recl'),
    `sam Recluse w ofercie: ${JSON.stringify(offers)}`);
  assert.ok(offers.some((a) => (a.att ?? []).length === 2),
    `para Recluse+2/2 też legalna: ${JSON.stringify(offers)}`);
});

test('F-B: bot blokuje samą Deadly Recluse (deathtouch zabija 4/4, 2/2 zbędne)', () => {
  const state = stolDeathtouch();
  const view = playerView(state, 'p2');
  const bot = createHeuristicBot({ seed: 700, randomness: 0 });
  const choice = bot.chooseCommand(view, {});
  assert.equal(choice.type, 'declare_blockers', `bot decyduje o bloku: ${choice.type}`);
  const assign = choice.assignments ?? {};
  assert.deepEqual(assign.att, ['recl'],
    `bot wybiera samą Recluse (a nie 2/2 albo obie): ${JSON.stringify(choice)}`);
});

test('F-B: regresja M153 — dwa zwykłe blokery nadal zabijają większego atakującego', () => {
  // Kontrola, że dodanie klauzuli deathtouch nie zaszkodziło pierwotnej
  // ścieżce SUMY MOCY (M153/B, multi-block kill, CR 510.1): 3/3 atakuje,
  // obrona ma dwa zwykłe 2/2. Suma mocy 4 ≥ 3 zabija atakującego — bot ma
  // blokować oboma, choć żaden nie ma deathtouch.
  const state = createGameState({ seed: 701, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  putReal(state, 'att', 'highland-game', 'p1');
  state.objects.set('att', Object.freeze({ ...state.objects.get('att'), power: 3, toughness: 3, summoningSickness: false }));
  for (const id of ['cat', 'dog']) {
    putReal(state, id, 'token_cat', 'p2');
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  }
  const attack = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'declare_attackers' && (c.attackerIds ?? []).includes('att'));
  assert.ok(execute(state, attack).ok, 'atak przyjęty');
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  const bot = createHeuristicBot({ seed: 701, randomness: 0 });
  const choice = bot.chooseCommand(playerView(state, 'p2'), {});
  assert.equal(choice.type, 'declare_blockers', `bot decyduje o bloku: ${choice.type}`);
  assert.deepEqual([...(choice.assignments?.att ?? [])].sort(), ['cat', 'dog'],
    `bot blokuje oboma zwykłymi 2/2, by zabić 3/3 sumą mocy: ${JSON.stringify(choice)}`);
});
