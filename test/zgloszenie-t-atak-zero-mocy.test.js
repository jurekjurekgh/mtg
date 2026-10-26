// =============================================================================
// Zgłoszenie T (2026-10-26, właściciel) — samobójczy atak stworem 0/1:
//   właściciel ma 4/3 i 3 życia, bot 23 życia i stwory m.in. 1/2, 0/1, 0/1;
//   biblioteki 7 (właściciel) i 6 (bot). Bot atakuje SAMOTNYM 0/1 wprost
//   w gotowe 4/3, traci stwora i nie gra żadnego tricka.
//
// Pomiar PRZED (sonda `.arena/probe-t.mjs`): atak samotnym 0/1 dostaje +8
// i wygrywa z brakiem ataku (0). Przyczyna — dwie dziury w gałęzi M155:
//   1. jako jedyna z gałęzi „pewnej straty" NIE inkrementowała
//      `futileAttackers`, więc premia wyścigu (+20 przy życiu wroga ≤ 10,
//      mimo łącznej mocy ataku 0) wskrzeszała −12 do +8 (klasa L3);
//   2. gałęzie „nieblokowalny" i „odporny na obrażenia" biegły PRZED M155
//      i dawały premię przebicia atakującemu zadającemu 0 obrażeń.
//
// Fix: `dealsNoCombatDamage` liczony po efektywnych statach walki
// (`combatObject` przez `faceDamageOf` — pompa i przydział obrażeń
// wytrzymałością nadal biją), gałąź jałowa (`futileAttackers += 1`),
// a premie przebicia wymagają `!dealsNoCombatDamage`. Wyjątki bez zmian:
// drenaż z triggera ataku i stwór pożyczony (koszt właściciela).
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

function body(s, id, pid, power, toughness, extra = {}) {
  addObject(s, {
    id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId: pid, ownerId: pid,
    zone: 'battlefield', kind: 'creature', power, toughness, manaCost: 2,
    abilities: [], keywords: extra.keywords ?? [], subtypes: [], types: ['Creature'],
    colors: [], cardName: id, ...extra,
  });
  const o = s.objects.get(id);
  s.objects.set(id, Object.freeze({ ...o, summoningSickness: false }));
}

/** Scena właściciela: bot (p2, 23 życia, biblioteka 6) atakuje w 4/3 gracza z 3 życia (biblioteka 7). */
function scena(atakujący) {
  const s = createGameState({ seed: 3, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'declare_attackers', 'p2');
  s.turn.activePlayerId = s.turn.priorityPlayerId = 'p2';
  s.pendingMulligans = [];
  s.players.find((p) => p.id === 'p1').life = 3;
  s.players.find((p) => p.id === 'p2').life = 23;
  body(s, 'blocker', 'p1', 4, 3);
  atakujący(s);
  for (let i = 0; i < 7; i += 1) addObject(s, { id: `l1-${i}`, instanceId: `il1-${i}`, cardId: 'basic-plains', controllerId: 'p1', ownerId: 'p1', zone: 'library', kind: 'spell', manaCost: 0 });
  for (let i = 0; i < 6; i += 1) addObject(s, { id: `l2-${i}`, instanceId: `il2-${i}`, cardId: 'basic-plains', controllerId: 'p2', ownerId: 'p2', zone: 'library', kind: 'spell', manaCost: 0 });
  const bot = createHeuristicBot({ seed: 5 });
  const cmd = bot.chooseCommand(playerView(s, 'p2'), {});
  const scores = {};
  for (const o of bot.trace().at(-1)?.options ?? []) scores[o.cmd] = o.score;
  return { cmd, scores };
}

test('T/1: samotny 0/1 NIE atakuje w 4/3 przy 3 życia obrońcy (scena właściciela)', () => {
  const { cmd, scores } = scena((s) => body(s, 'a01', 'p2', 0, 1));
  assert.deepEqual(cmd.attackerIds ?? cmd.attackers ?? [], [],
    `bot nie deklaruje ataku 0/1: ${JSON.stringify(cmd)}`);
  assert.ok(scores['attack[a01]'] < 0, `atak 0/1 poniżej braku ataku (${scores['attack[a01]']})`);
  assert.equal(scores['attack[]'], 0);
});

test('T/2: latający 0/1 też nie atakuje — ewazja przy 0 obrażeń niczego nie zmienia', () => {
  const { cmd, scores } = scena((s) => body(s, 'a01', 'p2', 0, 1, { keywords: ['flying'] }));
  assert.deepEqual(cmd.attackerIds ?? [], [], `brak ataku: ${JSON.stringify(cmd)}`);
  assert.ok(scores['attack[a01]'] < 0, `latający 0/1 poniżej braku ataku (${scores['attack[a01]']})`);
});

test('T/3: 0/1 z menace przy jednym blokerze też nie atakuje', () => {
  const { cmd, scores } = scena((s) => body(s, 'a01', 'p2', 0, 1, { keywords: ['menace'] }));
  assert.deepEqual(cmd.attackerIds ?? [], [], `brak ataku: ${JSON.stringify(cmd)}`);
  assert.ok(scores['attack[a01]'] < 0, `menace 0/1 poniżej braku ataku (${scores['attack[a01]']})`);
});

test('T/4: anty-overfix — latający 1/1 nadal atakuje nad naziemnym 4/3 (realne obrażenia)', () => {
  const { cmd } = scena((s) => body(s, 'a11', 'p2', 1, 1, { keywords: ['flying'] }));
  assert.deepEqual(cmd.attackerIds ?? [], ['a11'],
    `1/1 flying przechodzi i bije w twarz: ${JSON.stringify(cmd)}`);
});

test('T/5: w grupie 0/1 nie dokłada się do ataku realnych stworów', () => {
  const { cmd, scores } = scena((s) => {
    body(s, 'a12', 'p2', 1, 2);
    body(s, 'a01', 'p2', 0, 1);
    body(s, 'b01', 'p2', 0, 1);
    body(s, 'a11', 'p2', 1, 1);
  });
  assert.ok(!(cmd.attackerIds ?? []).includes('a01') && !(cmd.attackerIds ?? []).includes('b01'),
    `żaden 0/1 nie atakuje: ${JSON.stringify(cmd)}`);
  assert.ok(scores['attack[a12,a11]'] > scores['attack[a12,a01,a11]'],
    `dokładka 0/1 pogarsza atak (${scores['attack[a12,a11]']} > ${scores['attack[a12,a01,a11]']})`);
});
