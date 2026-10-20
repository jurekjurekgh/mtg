// PMSSB-74 (2026-10-20) — Bloodfire Infusion: {R}, poświęć zaczepionego stwora → obrażenia równe jego mocy
// każdemu stworowi. Przed PMSSB-74 bot wyceniał aktywację płasko (baza 2) i nie widział kosztu poświęcenia
// gospodarza: poświęcał własnego stwora bez zysku. Wycena: wspólna miara zamiatania (`sweepHitsValue`, L41)
// minus koszt poświęcenia tą samą jednostką co własna strata w zniszczeniu masowym.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { normalizeHeuristicParams } from '../src/controllers/heuristic-params.js';

const registry = createCardRegistry();

function put(state, id, cardId, pid, zone, patch = {}) {
  const def = registry.get(cardId);
  addObject(state, { id, instanceId: `i-${id}`, cardId, controllerId: pid, ownerId: pid, zone, ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes, keywords: def.keywords });
  if (Object.keys(patch).length) state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
}

/** Host (Tuskguard Captain 2/3) z Bloodfire Infusion; aura dodawana ostatnia (inwariant aury). */
function scene({ myLife = 20, foeLife = 20, foes = [], mine = [] } = {}) {
  const st = createGameState({ seed: 69, players: [{ id: 'p1' }, { id: 'p2' }] });
  st.turn = jumpToStep(st.turn, 'main1', 'p1');
  st.turn.activePlayerId = st.turn.priorityPlayerId = 'p1';
  for (const pid of ['p1', 'p2']) for (let i = 0; i < 8; i += 1) put(st, `lib-${pid}-${i}`, 'basic-swamp', pid, 'library');
  foes.forEach((c, i) => put(st, `f${i}`, c, 'p2', 'battlefield'));
  mine.forEach((c, i) => put(st, `m${i}`, c, 'p1', 'battlefield'));
  put(st, 'host', 'tuskguard-captain', 'p1', 'battlefield');
  put(st, 'bf', 'bloodfire-infusion', 'p1', 'battlefield', { attachedTo: 'host' });
  st.players.find((p) => p.id === 'p1').life = myLife;
  st.players.find((p) => p.id === 'p2').life = foeLife;
  addMana(st, 'p1', 1, { colors: ['R'] });
  return st;
}

/** Wycena aktywacji Bloodfire (`activate_ability(bf#…)`) i wybrany typ komendy. */
function bloodfire(opts, params = undefined) {
  const st = scene(opts);
  const bot = createHeuristicBot({ seed: 7, params });
  const cmd = bot.chooseCommand(playerView(st, 'p1'), {});
  const opt = (bot.trace().at(-1)?.options ?? []).find((o) => o?.cmd?.startsWith('activate_ability(bf'));
  assert.ok(opt, 'aktywacja Bloodfire jest w ocenach');
  return { score: opt.score, chosenBloodfire: cmd.type === 'activate_ability' && cmd.objectId === 'bf' };
}

test('PMSSB-74 RED: bez wrogich stworów bot NIE poświęca stwora dla samych obrażeń (wartość ujemna)', () => {
  const r = bloodfire({});
  assert.ok(r.score < 0, `wycena ${r.score} musi być ujemna (koszt bez zysku)`);
  assert.equal(r.chosenBloodfire, false);
});

test('PMSSB-74 RED: jeden wrogi stwór 1/1 nie uzasadnia wymiany 2/3 + aury', () => {
  const r = bloodfire({ foes: ['myr-scrapling'] });
  assert.equal(r.chosenBloodfire, false, `wycena ${r.score}`);
});

test('PMSSB-74 pin: dwa wrogie stwory 1/1 — aktywacja jest warta wykonania', () => {
  const r = bloodfire({ foes: ['myr-scrapling', 'myr-scrapling'] });
  assert.ok(r.score > 0, `wycena ${r.score}`);
  assert.equal(r.chosenBloodfire, true);
});

test('PMSSB-74 RED: presja życia podnosi wartość zamiatania (życie 5 > życie 20 przy dwóch wrogach)', () => {
  const pod = bloodfire({ foes: ['myr-scrapling', 'myr-scrapling'], myLife: 5 }).score;
  const spokoj = bloodfire({ foes: ['myr-scrapling', 'myr-scrapling'], myLife: 20 }).score;
  assert.ok(pod > spokoj, `pod presją ${pod} > ${spokoj}`);
});

test('PMSSB-74 pin: obrażenia zabijające MOJE stwory obniżają wartość (własna strata)', () => {
  const bez = bloodfire({ foes: ['myr-scrapling', 'myr-scrapling'] }).score;
  const zMoim = bloodfire({ foes: ['myr-scrapling', 'myr-scrapling'], mine: ['myr-scrapling'] }).score;
  assert.ok(zMoim < bez, `z moim stworem ${zMoim} < ${bez}`);
});

test('PMSSB-74 pokrętło: massDestroyThreatWeight 0 wyłącza składnik presji (życie 5 = życie 20)', () => {
  const params = normalizeHeuristicParams({ massDestroyThreatWeight: 0 });
  const pod = bloodfire({ foes: ['myr-scrapling', 'myr-scrapling'], myLife: 5 }, params).score;
  const spokoj = bloodfire({ foes: ['myr-scrapling', 'myr-scrapling'], myLife: 20 }, params).score;
  assert.equal(pod, spokoj);
});
