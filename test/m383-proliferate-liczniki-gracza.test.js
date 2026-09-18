// M383 (wyzwanie „srebrna odznaka", ADR 0030): PROLIFERATE a liczniki GRACZA
// (energia) — „additional counter of each kind that permanent or player
// already has".
//
// Źródła online (dostęp 2026-09-18):
//  • CR 701.34a — https://media.wizards.com/2026/downloads/MagicCompRules%2020260819.txt
//    (efektywne 2026-08-07): „To proliferate means to choose any number of
//    permanents and/or players THAT HAVE A COUNTER, then give each one
//    additional counter of each kind that permanent or player already has."
//    (Uwaga: proliferate to w numeracji 2026 reguła 701.34; wcześniejsze
//    komentarze silnika cytują starą numerację 701.27.)
//  • Liczniki energii leżą na GRACZU: mtg.wiki/Energy —
//    https://mtg.wiki/page/Energy_counter: „An energy counter is a counter
//    that, unlike most other counters, is placed on players rather than
//    objects." (CR 122 „Counters" + symbol {E}, CR 107.14.)
//  • WotC, Magic: The Gathering — Fallout Mechanics (2024-02-20):
//    https://magic.wizards.com/en/news/feature/magic-the-gathering-fallout-mechanics
//    „Proliferate … If you have three energy counters, give yourself
//    another! … If a player or permanent has more than one kind of counter
//    and you choose to add counters, you must add one of each kind already
//    there."
//
// Stan przed M383: `pendingProliferate.candidateIds` zbierało wyłącznie
// permanenty z licznikami oraz graczy z trucizną (`player.poison > 0`).
// Gracz z licznikami ENERGII (a bez trucizny) nie był kandydatem — nie dało
// się go wybrać, a komenda wskazująca go była odrzucana
// (`illegal_proliferate_target`); po wyborze nie dostawał też kolejnego
// licznika energii. Karta: Courage in Crisis („Put a +1/+1 counter on target
// creature, then proliferate.") + energia z np. Shipwreck Moray.
//
// Piny: (A) gracz z energią jest kandydatem i pojawia się w ofercie,
// (B) wybór gracza daje +1 licznik energii (helper addEnergyCounters +
// zdarzenie `counter_added` z `fromProliferate`), (C) gracz z trucizną
// i energią dostaje +1 KAŻDEGO typu (all-or-nothing), (D) strażnik: gracz bez
// żadnego licznika nadal nie jest kandydatem, (E) kontrola: permanent
// z licznikiem +1/+1 działa jak wcześniej.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { addEnergyCounters, addPoisonCounters } from '../src/engine/players.js';
import { jumpToStep } from '../src/engine/turn.js';

const REGISTRY = createCardRegistry();
const PROLIFERATE_SPELL = 'courage-in-crisis'; // „Put a +1/+1 counter on target creature, then proliferate."

const reasonOf = (result) => result.reason ?? result.events?.[0]?.reason ?? '?';
const playerOf = (state, id) => state.players.find((player) => player.id === id);

/** Partia: p1 ma stwora-cel i czar z proliferate w ręce, mana opłacona. */
function scenario() {
  const state = createGameState({ seed: 383, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.number = 12;
  state.pendingMulligans = [];
  const put = (id, cardId, playerId, zone) => {
    const card = REGISTRY.get(cardId);
    addObject(state, {
      id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId, zone,
      types: card.types ?? [], keywords: card.keywords ?? [], subtypes: card.subtypes ?? [],
      cardName: card.name, ...gameObjectDataOf(card),
    });
  };
  for (const pid of ['p1', 'p2']) {
    for (let i = 0; i < 8; i += 1) put(`lib-${pid}-${i}`, 'basic-forest', pid, 'library');
  }
  for (let i = 0; i < 6; i += 1) put(`forest-${i}`, 'basic-forest', 'p1', 'battlefield');
  put('bear', 'highland-game', 'p1', 'battlefield');
  put('spell', PROLIFERATE_SPELL, 'p1', 'hand');
  state.players = state.players.map((player) => (player.id === 'p1'
    ? { ...player, mana: 12, manaPool: { G: 6 } } : player));
  return state;
}

/** Rzuca czar i rozstrzyga stos do momentu decyzji proliferate. */
function castProliferate(state) {
  const cast = playerView(state, 'p1').legalCommands
    .find((cmd) => cmd.type === 'cast_spell' && cmd.objectId === 'spell');
  assert.ok(cast, 'Courage in Crisis jest oferowany');
  assert.ok(execute(state, cast).ok, 'rzut przyjęty');
  for (let i = 0; i < 20 && state.zones.stack.length > 0; i += 1) {
    const commands = playerView(state, state.turn.priorityPlayerId).legalCommands;
    if (commands.some((cmd) => cmd.type === 'resolve_proliferate')) break;
    const pass = commands.find((cmd) => cmd.type === 'pass_priority');
    if (!pass) break;
    execute(state, pass);
  }
  assert.ok(state.pendingProliferate, 'decyzja proliferate oczekuje');
  return state.pendingProliferate;
}

const proliferateOffers = (state) => playerView(state, 'p1').legalCommands
  .filter((cmd) => cmd.type === 'resolve_proliferate');

test('M383/A: gracz z licznikami energii JEST kandydatem proliferate (CR 701.34a)', () => {
  const state = scenario();
  addEnergyCounters(state, 'p1', 4);
  const pending = castProliferate(state);
  assert.ok(pending.candidateIds.includes('p1'),
    `kandydaci: ${JSON.stringify(pending.candidateIds)} — gracz z energią musi być wybieralny`);
  assert.ok(proliferateOffers(state).some((cmd) => (cmd.targetIds ?? []).includes('p1')),
    'oferta wskazująca gracza z energią istnieje');
});

test('M383/B: wybór gracza z energią daje +1 licznik energii', () => {
  const state = scenario();
  addEnergyCounters(state, 'p1', 4);
  castProliferate(state);
  assert.equal(playerOf(state, 'p1').energy, 4);
  const command = { type: 'resolve_proliferate', playerId: 'p1', targetIds: ['p1'] };
  const result = execute(state, command);
  assert.ok(result.ok, `komenda z graczem: ${reasonOf(result)}`);
  assert.equal(playerOf(state, 'p1').energy, 5, 'energia rośnie o 1');
  const added = state.events.filter((e) => e.type === 'counter_added'
    && e.objectId === 'p1' && e.counter === 'energy');
  assert.equal(added.length, 1, 'zdarzenie `counter_added` z licznikiem energii');
  assert.equal(added[0].fromProliferate, true, 'strumień liczników oznacza proliferate');
});

test('M383/C: gracz z trucizną i energią dostaje +1 KAŻDEGO typu licznika', () => {
  const state = scenario();
  addPoisonCounters(state, 'p1', 2);
  addEnergyCounters(state, 'p1', 3);
  castProliferate(state);
  const result = execute(state, { type: 'resolve_proliferate', playerId: 'p1', targetIds: ['p1'] });
  assert.ok(result.ok, reasonOf(result));
  assert.equal(playerOf(state, 'p1').poison, 3, 'trucizna +1');
  assert.equal(playerOf(state, 'p1').energy, 4, 'energia +1 (all-or-nothing: nie da się wybrać jednego typu)');
});

test('M383/D: strażnik — gracz BEZ liczników nie jest kandydatem', () => {
  const state = scenario();
  castProliferate(state);
  assert.equal(playerOf(state, 'p1').poison ?? 0, 0);
  assert.equal(playerOf(state, 'p1').energy ?? 0, 0);
  assert.ok(!state.pendingProliferate.candidateIds.includes('p1'),
    'gracz bez liczników nie może być wybrany');
  const result = execute(state, { type: 'resolve_proliferate', playerId: 'p1', targetIds: ['p1'] });
  assert.equal(result.ok, false);
  assert.equal(reasonOf(result), 'illegal_proliferate_target');
});

test('M383/E: kontrola — permanent z licznikiem nadal proliferuje', () => {
  const state = scenario();
  castProliferate(state);
  const result = execute(state, { type: 'resolve_proliferate', playerId: 'p1', targetIds: ['bear'] });
  assert.ok(result.ok, reasonOf(result));
  assert.equal(state.objects.get('bear')?.counters?.['+1/+1'], 2, 'licznik z czaru + proliferate = 2');
});
