// Zgłoszenie P (właściciel, testy 2026-10-18): wycena blokowania bota.
//
// Atakuję kreaturą 3/3 z FIRST STRIKE. Bot blokuje 3/3 + 1/1. Ale my zabijamy
// jego 3/3 w kroku first strike, zanim cokolwiek zada obrażeń, a 1/1 nie zrobi
// nam krzywdy (nasza kreatura ma wytrzymałość 3). Dokładanie 3/3 to strata,
// bo wystarczyłby sam 1/1 (atakujący bez trample i tak jest zablokowany, CR 509.1h).
//
// Przyczyna: `blockExchangeOf` i `blockKillsAttacker` liczyły wymianę JEDNYM,
// zachłannym podziałem obrażeń atakującego („zabij najtańszych po kolei”). Dla
// 3/3 FS vs {3/3, 1/1} taki podział zabija 1/1 i zostawia 3/3 do zadania 3
// obrażeń — bot widział „zabijemy atakującego” i dokładał 3/3 jako zysk.
// Realny atakujący (CR 510.1c — to my rozdzielamy obrażenia) wybiera podział
// najlepszy dla siebie: wszystkie 3 w 3/3 (przeżyjemy, zabijając największego).
//
// Kontrakt: wymiana liczy NAJLEPSZY podział atakującego (z jego perspektywy),
// a bloker, który po tym podziale nic nie wnosi, odrzuca wariant.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView, execute } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createCardDeck } from '../src/cards/materialize.js';
import { createHeuristicBot, blockExchangeOf } from '../src/controllers/heuristic-bot.js';

const registry = createCardRegistry();

function put(s, id, cardId, playerId, zone = 'battlefield', extra = {}) {
  const [{ objectId, ...data }] = createCardDeck({ cardIds: [cardId], ownerId: playerId, registry });
  addObject(s, { ...data, id, instanceId: `i-${id}`, controllerId: playerId, zone, ...extra });
  if (zone === 'battlefield') {
    s.objects.set(id, Object.freeze({ ...s.objects.get(id), summoningSickness: false }));
  }
  return id;
}

const creature = (id, power, toughness, keywords = []) => ({
  id, power, toughness, damage: 0, keywords, kind: 'creature', types: ['Creature'],
});

/** p1 atakuje 3/3 first strike; p2 broni 3/3 (`bl3`) i 1/1 (`tok0`). */
function walka() {
  const s = createGameState({ seed: 4242, players: [{ id: 'p1' }, { id: 'p2' }] });
  for (const p of ['p1', 'p2']) for (let i = 0; i < 6; i += 1) put(s, `lib-${p}-${i}`, 'basic-swamp', p, 'library');
  put(s, 'fs', 'hill-giant', 'p1', 'battlefield', { keywords: ['first_strike'] });
  put(s, 'bl3', 'hill-giant', 'p2');
  put(s, 'tok0', 'snarling-wolf', 'p2');
  s.turn = jumpToStep(s.turn, 'declare_attackers', 'p1');
  s.turn.activePlayerId = 'p1'; s.turn.priorityPlayerId = 'p1';
  const r = execute(s, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['fs'] });
  assert.equal(r.ok, true, JSON.stringify(r));
  s.turn = jumpToStep(s.turn, 'declare_blockers', 'p2');
  s.turn.activePlayerId = 'p1'; s.turn.priorityPlayerId = 'p2';
  return s;
}

test('P: wymiana 3/3 FS vs {3/3, 1/1} — my przeżywamy (najlepszy podział: 3 w 3/3)', () => {
  const r = blockExchangeOf(creature('fs', 3, 3, ['first_strike']),
    [creature('bl3', 3, 3), creature('tok0', 1, 1)]);
  assert.equal(r.attackerDies, false, 'zabijamy 3/3 zanim zada cios; 1/1 zada 1 — przeżywamy');
  assert.ok(r.wastedBlockers >= 1, 'bloker, który nic nie wnosi, odrzucany');
  assert.ok(r.uselessBlockerIds.includes('bl3'), 'to 3/3 jest zbędny, nie 1/1');
});

test('P: bot NIE dokłada 3/3 do bloku 1/1 przeciw atakującemu 3/3 first strike', () => {
  const s = walka();
  const bot = createHeuristicBot({ seed: 7 });
  const wybrany = bot.chooseCommand(playerView(s, 'p2'), {});
  if (wybrany.type === 'declare_blockers') {
    const blokujacy = Object.values(wybrany.assignments ?? {}).flat();
    assert.ok(!blokujacy.includes('bl3'), `bot dołożył 3/3 do bloku: ${JSON.stringify(wybrany.assignments)}`);
  }
});

test('P: wariant „3/3 + 1/1” dostaje weto (NEVER), nie tylko karę', () => {
  const s = walka();
  const bot = createHeuristicBot({ seed: 7 });
  bot.chooseCommand(playerView(s, 'p2'), {});
  const opcje = bot.trace().at(-1)?.options ?? [];
  const oba = opcje.find((o) => o.cmd?.startsWith('block[') && o.cmd.includes('bl3') && o.cmd.includes('tok0'));
  const pass = opcje.find((o) => o.cmd === 'pass_priority');
  assert.ok(pass, 'pass jest w ofercie');
  if (oba) assert.ok(oba.score < pass.score, `wariant z 3/3 musi przegrywać z pass: ${oba.score} vs ${pass.score}`);
});
