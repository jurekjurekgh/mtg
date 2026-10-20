// PMSSB-75 (2026-10-20) — warunek typu `controlsType` (Heron-Blessed Geist, CR 602.5b):
// „Activate only if you control an enchantment” — aktywacja z cmentarza wymaga kontrolowanego
// permanentu typu Enchantment. Bramka jest wspólna dla oferty (legalCommands) i walidacji
// (abilities.js), więc bot nie widzi zdolności, której silnik nie zaakceptuje.
// Zakres: bramka i kierunek wartości. Brak wrażliwości wyceny tokenów na presję życia to osobna pozycja
// wspólna dla tokenów (nie wyjątek po nazwie karty) — zapisana w docs/PMSSB.md, nie pinowana tu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const registry = createCardRegistry();

function put(st, id, cardId, pid, zone, patch = {}) {
  const def = registry.get(cardId);
  addObject(st, { id, instanceId: `i-${id}`, cardId, controllerId: pid, ownerId: pid, zone, ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes, keywords: def.keywords });
  if (Object.keys(patch).length) st.objects.set(id, Object.freeze({ ...st.objects.get(id), ...patch }));
}

function scene({ enchant = true, foes = [] } = {}) {
  const st = createGameState({ seed: 69, players: [{ id: 'p1' }, { id: 'p2' }] });
  st.turn = jumpToStep(st.turn, 'main1', 'p1');
  st.turn.activePlayerId = st.turn.priorityPlayerId = 'p1';
  for (const pid of ['p1', 'p2']) for (let i = 0; i < 8; i += 1) put(st, `lib-${pid}-${i}`, 'basic-swamp', pid, 'library');
  foes.forEach((c, i) => put(st, `f${i}`, c, 'p2', 'battlefield'));
  put(st, 'geist', 'heron-blessed-geist', 'p1', 'graveyard');
  if (enchant) {
    put(st, 'host', 'tuskguard-captain', 'p1', 'battlefield');
    put(st, 'bf', 'bloodfire-infusion', 'p1', 'battlefield', { attachedTo: 'host' });
  }
  addMana(st, 'p1', 5, { colors: ['W'] });
  return st;
}

test('PMSSB-75: bez kontrolowanego enchantmentu aktywacja z cmentarza NIE jest oferowana (silnik i bot)', () => {
  const st = scene({ enchant: false });
  const offered = playerView(st, 'p1').legalCommands.some((c) => c.type === 'activate_ability' && c.objectId === 'geist');
  assert.equal(offered, false);
  const bot = createHeuristicBot({ seed: 7 });
  const cmd = bot.chooseCommand(playerView(st, 'p1'), {});
  assert.notEqual(cmd.objectId, 'geist');
});

test('PMSSB-75: z kontrolowanym enchantmentem aktywacja jest oferowana i dodatnio wyceniona', () => {
  const st = scene({ enchant: true });
  const offered = playerView(st, 'p1').legalCommands.some((c) => c.type === 'activate_ability' && c.objectId === 'geist');
  assert.equal(offered, true);
  const bot = createHeuristicBot({ seed: 7 });
  const cmd = bot.chooseCommand(playerView(st, 'p1'), {});
  assert.equal(cmd.type, 'activate_ability');
  assert.equal(cmd.objectId, 'geist');
});

test('PMSSB-75 pin kierunku: wrogie stwory obniżają wycenę aktywacji (pusty stół > stół z wrogiem)', () => {
  const score = (opts) => {
    const bot = createHeuristicBot({ seed: 7 });
    bot.chooseCommand(playerView(scene(opts), 'p1'), {});
    const o = (bot.trace().at(-1)?.options ?? []).find((x) => x?.cmd === 'activate_ability(geist#0)');
    assert.ok(o, 'aktywacja w ocenach');
    return o.score;
  };
  const pusto = score({});
  const zWrogiem = score({ foes: ['makindi-aeronaut', 'makindi-aeronaut'] });
  assert.ok(pusto > zWrogiem, `pusto ${pusto} > z wrogiem ${zWrogiem}`);
});
