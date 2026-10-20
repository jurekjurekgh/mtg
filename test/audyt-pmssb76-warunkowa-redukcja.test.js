// PMSSB-76 (2026-10-20) — warunkowa redukcja kosztu Gnoll War Band (CR 601.2f): „costs {1} less to cast
// for each opponent who was dealt damage this turn”. Silnik (mana-cost.js) i bot czytają ten sam stan
// (`damageTakenByPlayerThisTurn`). Piny: bramka rzutu zależy od obrażeń w turze, a bot przy redukcji
// wybiera Gnolla zamiast tańszego czaru, który konkuruje o manę.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const registry = createCardRegistry();

function put(st, id, cardId, pid, zone) {
  const def = registry.get(cardId);
  addObject(st, { id, instanceId: `i-${id}`, cardId, controllerId: pid, ownerId: pid, zone, ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes, keywords: def.keywords });
}

function scene({ mana, damaged, rager = true }) {
  const st = createGameState({ seed: 69, players: [{ id: 'p1' }, { id: 'p2' }] });
  st.turn = jumpToStep(st.turn, 'main1', 'p1');
  st.turn.activePlayerId = st.turn.priorityPlayerId = 'p1';
  for (const pid of ['p1', 'p2']) for (let i = 0; i < 8; i += 1) put(st, `lib-${pid}-${i}`, 'basic-swamp', pid, 'library');
  put(st, 'gn', 'gnoll-war-band', 'p1', 'hand');
  if (rager) put(st, 'rag', 'frontline-war-rager', 'p1', 'hand');
  addMana(st, 'p1', mana, { colors: ['R'] });
  if (damaged) st.damageTakenByPlayerThisTurn = { p2: 3 };
  return st;
}

test('PMSSB-76: bez obrażeń w turze Gnoll (koszt 6) nie jest dostępny za 5 many', () => {
  const st = scene({ mana: 5, damaged: false, rager: false });
  const offered = playerView(st, 'p1').legalCommands.some((c) => c.type === 'cast_permanent' && c.objectId === 'gn');
  assert.equal(offered, false);
});

test('PMSSB-76: po obrażeniach zadanych przeciwnikowi Gnoll kosztuje 5 i bot wybiera go przed tańszym czarem', () => {
  const st = scene({ mana: 5, damaged: true });
  const offered = playerView(st, 'p1').legalCommands.some((c) => c.type === 'cast_permanent' && c.objectId === 'gn');
  assert.equal(offered, true);
  const bot = createHeuristicBot({ seed: 7 });
  const cmd = bot.chooseCommand(playerView(st, 'p1'), {});
  assert.equal(cmd.type, 'cast_permanent');
  assert.equal(cmd.objectId, 'gn');
});

test('PMSSB-76 pin: redukcja nie zmienia wyceny rzutu, gdy oba warianty zużywają całą manę (5 po obrażeniach = 6 bez)', () => {
  const score = (o) => {
    const bot = createHeuristicBot({ seed: 7 });
    bot.chooseCommand(playerView(scene({ ...o, rager: false }), 'p1'), {});
    const x = (bot.trace().at(-1)?.options ?? []).filter(Boolean).find((y) => y.cmd.startsWith('cast_permanent(gn'));
    assert.ok(x, 'opcja rzutu Gnolla');
    return x.score;
  };
  assert.equal(score({ mana: 5, damaged: true }), score({ mana: 6, damaged: false }));
});
