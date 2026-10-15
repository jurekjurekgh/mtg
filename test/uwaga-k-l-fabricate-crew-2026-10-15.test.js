// Uwagi K i L z gry (właściciel, 2026-10-15, tura 12).
//
// K — Glint-Sleeve Artisan (fabricate 1, CR 702.123): bot ZAWSZE brał token
//     Servo 1/1 (wycena stała: tokeny 15, liczniki 10). Właściciel: +1/+1 na
//     Artisanie ma większy sens w zwykłej grze; Servo — gdy bot ma na ręce
//     karty wymagające ofiary kreatury (albo podobnej sytuacji).
//     Kontrakt po: domyślnie liczniki; tokeny tylko przy synergii z ofiarą
//     (karta na ręce z kosztem ofiary kreatury, albo własna wyrzutnia na polu).
//
// L — Bomat Bazaar Barge (Crew 3): domyślna załoga startowała od NAJSŁABSZYCH
//     (1/1, 1/1, 2/1 = moc 4, trzy stwory). Właściciel: ma zaczynać od
//     największych i kończyć na najmniejszych, czyli 2/1 + 1/1 (moc 3, dwa
//     stwory). Kontrakt po: `defaultCrewSubset` zachłannie malejąco po mocy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function game(seed = 4601) {
  const state = createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  return state;
}

function putCard(state, id, cardId, controllerId, zone = 'battlefield') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  return state.objects.get(id);
}

function addCreature(state, id, ctrl, power, toughness) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `x-${id}`, controllerId: ctrl, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost: 1, abilities: [], keywords: [],
    subtypes: [], types: ['Creature'], colors: [],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
}

function resolveStack(state, max = 16) {
  for (let i = 0; i < max && state.zones.stack.length > 0; i += 1) {
    const r = execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
    if (!r.ok) return false;
  }
  return state.zones.stack.length === 0;
}

/** Rzuca Artisana z ręki i zwraca stan z otwartą decyzją fabricate. */
function artisanFabricate(extra = () => {}) {
  const state = game();
  putCard(state, 'art', 'glint-sleeve-artisan', 'p1', 'hand');
  extra(state);
  addMana(state, 'p1', 3, { colors: ['W', 'W', 'W'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'art');
  assert.ok(cast, 'oferta rzutu Artisana');
  assert.ok(execute(state, cast).ok);
  assert.ok(resolveStack(state), 'stos pusty po ETB');
  assert.ok(state.pendingFabricate, 'decyzja fabricate czeka');
  return state;
}

function botFabricateMode(state) {
  const view = playerView(state, 'p1');
  const bot = createHeuristicBot({ seed: 7, registry: REGISTRY });
  const cmd = bot.chooseCommand(view);
  assert.equal(cmd.type, 'resolve_fabricate', `bot rozstrzyga fabricate, a nie: ${cmd.type}`);
  return cmd.mode;
}

// ---- K: fabricate -------------------------------------------------------

test('K/1: sam Artisan, bez synergii z ofiarą → bot bierze +1/+1 (nie token)', () => {
  const state = artisanFabricate();
  assert.equal(botFabricateMode(state), 'counters');
});

test('K/2: Artisan obok innych stworów → nadal +1/+1 (token nie rozlewa boardu z automatu)', () => {
  const state = artisanFabricate((s) => {
    addCreature(s, 'g1', 'p1', 2, 2);
    addCreature(s, 'g2', 'p1', 1, 1);
  });
  assert.equal(botFabricateMode(state), 'counters');
});

test('K/3: karta na ręce z ofiarą kreatury (Village Rites) → bot bierze token Servo', () => {
  const state = artisanFabricate((s) => {
    putCard(s, 'rites', 'village-rites', 'p1', 'hand');
    addCreature(s, 'g1', 'p1', 2, 2);
  });
  assert.equal(botFabricateMode(state), 'tokens', 'token = ofiara dla Village Rites');
});

test('K/4: własna wyrzutnia na polu z kosztem ofiary (Angel\'s Herald) → token Servo', () => {
  const state = artisanFabricate((s) => {
    putCard(s, 'herald', 'angels-herald', 'p1', 'battlefield');
  });
  assert.equal(botFabricateMode(state), 'tokens');
});

test('K/5: karta z ofiarą u PRZECIWNIKA nie jest synergią bota', () => {
  const state = artisanFabricate((s) => {
    putCard(s, 'rites', 'village-rites', 'p2', 'hand');
  });
  assert.equal(botFabricateMode(state), 'counters');
});

// ---- L: domyślna załoga — od największych ------------------------------

function crewOffers(state, objectId) {
  return playerView(state, 'p1').legalCommands.filter((c) => c.type === 'activate_ability'
    && c.objectId === objectId && Array.isArray(c.crewCreatureIds));
}

test('L/1: Bomat (Crew 3), stwory 1/1, 1/1, 2/1 → domyślnie 2/1 + 1/1 (dwa stwory, nie trzy)', () => {
  const state = game();
  putCard(state, 'barge', 'bomat-bazaar-barge', 'p1', 'battlefield');
  addCreature(state, 'c1', 'p1', 1, 1);
  addCreature(state, 'c2', 'p1', 1, 1);
  addCreature(state, 'c3', 'p1', 2, 1);
  const offers = crewOffers(state, 'barge');
  assert.equal(offers.length, 1, 'jedna oferta załogi');
  assert.deepEqual(offers[0].crewCreatureIds, ['c3', 'c1'],
    'od największych: 2/1 (c3), potem 1/1 (c1) — moc 3 = próg, bez trzeciego stwora');
});

test('L/2: Crew 3, stwory 2/2 i 3/3 → domyślnie sam 3/3 (największy pierwszy)', () => {
  const state = game();
  putCard(state, 'barge', 'bomat-bazaar-barge', 'p1', 'battlefield');
  addCreature(state, 'a', 'p1', 2, 2);
  addCreature(state, 'b', 'p1', 3, 3);
  assert.deepEqual(crewOffers(state, 'barge')[0].crewCreatureIds, ['b']);
});

test('L/3: Saddle 2 (Trained Arynx), stwory 2/2 i 3/3 → domyślnie sam 3/3 (ta sama kolejność)', () => {
  const state = game();
  putCard(state, 'ax', 'trained-arynx', 'p1', 'battlefield');
  addCreature(state, 's1', 'p1', 2, 2);
  addCreature(state, 's2', 'p1', 3, 3);
  const offers = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'activate_ability'
    && c.objectId === 'ax' && Array.isArray(c.crewCreatureIds));
  assert.deepEqual(offers[0].crewCreatureIds, ['s2']);
});
