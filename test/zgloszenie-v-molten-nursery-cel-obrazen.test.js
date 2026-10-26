// =============================================================================
// Zgłoszenie V (2026-10-26, właściciel) — Molten Nursery:
//   „bot rzuca bezbarwny czar i celuje [1 obrażeniem z Nursery] w moją
//   kreaturę 4/3. totalnie bez sensu, bo to jej nic nie robi. Powinien
//   celować tylko kreatury, dla których 1 obrażenie byłoby lethal,
//   a jak takich nie ma, to celować gracza."
//
// Pomiar PRZED (sonda `.arena/probe-v.mjs`, prawdziwe karty): 1 obrażenie
// w wrogie 4/3 = 41 pkt (30 + 2P + T), w przeciwnika = 25 → bot wybierał
// 4/3. Gałąź `resolve_trigger_target` premiowała lethal (+60, zgłoszenie
// F), ale obrażenia NIEletalne wyceniała rozmiarem celu jak każdy efekt
// wrogi — wbrew wspólnej polityce celów obrażeń dla czarów.
//
// Fix: jednocelowe triggery obrażeń (`cmd.damage` > 0) oceniają cele
// wspólną `damageTargetValue` (L41): lethal w stwora = wartość usunięcia,
// twarz wg udziału w życiu (dobicie = 1000), nieletalny chip poza walką
// = −80, własny stwór = −90, własna twarz = −60−2×kwota. Piny F
// (Warmaker) zaktualizowane do tej skali.
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createCardDeck } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function put(s, id, cardId, zone = 'battlefield', pid = 'p1') {
  const [entry] = createCardDeck({ cardIds: [cardId], ownerId: pid, registry: REGISTRY });
  const { objectId, ...data } = entry;
  s.objects.set(id, Object.freeze({
    ...data, id, instanceId: `i-${id}`, controllerId: pid, ownerId: pid, zone,
  }));
  s.zones[zone].push(id);
}

function body(s, id, pid, power, toughness) {
  addObject(s, {
    id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId: pid, ownerId: pid,
    zone: 'battlefield', kind: 'creature', power, toughness, manaCost: 2,
    abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [], cardName: id,
  });
}

/**
 * Bot (p1) kontroluje Molten Nursery i rzuca bezbarwny czar (Clone Shell);
 * zwraca widok w oknie wyboru celu triggera Nursery.
 */
function oknoNursery(wrogowie, { zycieWroga = 20 } = {}) {
  const s = createGameState({ seed: 4, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main1', 'p1');
  s.turn.activePlayerId = s.turn.priorityPlayerId = 'p1';
  s.pendingMulligans = [];
  s.players.find((p) => p.id === 'p2').life = zycieWroga;
  for (let i = 0; i < 10; i += 1) {
    addObject(s, { id: `l1${i}`, instanceId: `l1${i}`, cardId: 'basic-plains', controllerId: 'p1', ownerId: 'p1', zone: 'library', kind: 'spell', manaCost: 0 });
    addObject(s, { id: `l2${i}`, instanceId: `l2${i}`, cardId: 'basic-plains', controllerId: 'p2', ownerId: 'p2', zone: 'library', kind: 'spell', manaCost: 0 });
  }
  put(s, 'nursery', 'molten-nursery');
  put(s, 'shell', 'clone-shell', 'hand');
  for (const [id, p, t] of wrogowie) body(s, id, 'p2', p, t);
  addMana(s, 'p1', 5);
  const cast = playerView(s, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'shell');
  assert.ok(cast, 'oferta rzutu bezbarwnego czaru');
  assert.equal(execute(s, cast).ok, true);
  for (let i = 0; i < 10; i += 1) {
    const view = playerView(s, 'p1');
    if (view.legalCommands.some((c) => c.type === 'resolve_trigger_target')) return view;
    execute(s, { type: 'pass_priority', playerId: s.turn.priorityPlayerId });
  }
  throw new Error('nie osiągnięto okna wyboru celu triggera Molten Nursery');
}

function decyzja(view) {
  const bot = createHeuristicBot({ seed: 5 });
  const cmd = bot.chooseCommand(view, {});
  const scores = {};
  for (const o of bot.trace().at(-1)?.options ?? []) scores[o.cmd] = o.score;
  return { cmd, scores };
}

test('V/1: brak celu lethal → 1 obrażenie idzie w PRZECIWNIKA, nie w 4/3 (scena właściciela)', () => {
  const { cmd, scores } = decyzja(oknoNursery([['foe43', 4, 3]]));
  assert.equal(cmd.targetId, 'p2', `ma celować gracza: ${JSON.stringify(cmd)}`);
  assert.ok(scores['resolve_trigger_target(p2)'] > scores['resolve_trigger_target(foe43)'],
    `twarz (${scores['resolve_trigger_target(p2)']}) > nieletalne 4/3 (${scores['resolve_trigger_target(foe43)']})`);
  assert.equal(scores['resolve_trigger_target(foe43)'], -80, 'nieletalny chip poza walką = strata');
});

test('V/2: cel lethal istnieje → wygrywa z twarzą (1/1 ginie)', () => {
  const { cmd, scores } = decyzja(oknoNursery([['foe43', 4, 3], ['foe11', 1, 1]]));
  assert.equal(cmd.targetId, 'foe11', `ma zabić 1/1: ${JSON.stringify(cmd)}`);
  assert.ok(scores['resolve_trigger_target(foe11)'] > scores['resolve_trigger_target(p2)'],
    `lethal (${scores['resolve_trigger_target(foe11)']}) > twarz (${scores['resolve_trigger_target(p2)']})`);
});

test('V/3: przeciwnik na 1 życia → dobicie w twarz wygrywa nawet z lethal na stworze', () => {
  const { cmd, scores } = decyzja(oknoNursery([['foe11', 1, 1]], { zycieWroga: 1 }));
  assert.equal(cmd.targetId, 'p2', `ma dobić gracza: ${JSON.stringify(cmd)}`);
  assert.equal(scores['resolve_trigger_target(p2)'], 1000, 'dobicie gracza = wygrana');
});

test('V/4: własna twarz i własny stwór są pod każdym celem wrogim', () => {
  const { scores } = decyzja(oknoNursery([['foe43', 4, 3]]));
  assert.ok(scores['resolve_trigger_target(p1)'] < scores['resolve_trigger_target(p2)'],
    `własna twarz (${scores['resolve_trigger_target(p1)']}) < wroga twarz (${scores['resolve_trigger_target(p2)']})`);
});
