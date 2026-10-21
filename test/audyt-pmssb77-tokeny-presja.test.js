// PMSSB-77 (2026-10-20) — wycena tokenów-stworów własnych nie znała presji życia (domknięcie PMSSB-75).
// Wcześniej ciało tokenu = 10·(2P+T)/3 (+ latanie, lifelink) bez względu na to, czy wróg atakuje
// i ile mam życia. Teraz własny token-stwór dostaje + tokenPressureWeight × presja (siła ataku wroga
// / moje życie, ≤ 1). Pusty stół (brak zagrożenia) = wartość bez zmian.
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

function put(st, id, cardId, pid, zone, patch = {}) {
  const d = registry.get(cardId);
  addObject(st, { id, instanceId: `i-${id}`, cardId, controllerId: pid, ownerId: pid, zone, ...gameObjectDataOf(d), types: d.types, subtypes: d.subtypes, keywords: d.keywords });
  if (Object.keys(patch).length) st.objects.set(id, Object.freeze({ ...st.objects.get(id), ...patch }));
}

function scene({ card, myLife = 20, foes = [] }) {
  const st = createGameState({ seed: 69, players: [{ id: 'p1' }, { id: 'p2' }] });
  st.turn = jumpToStep(st.turn, 'main1', 'p1');
  st.turn.activePlayerId = st.turn.priorityPlayerId = 'p1';
  for (const pid of ['p1', 'p2']) for (let i = 0; i < 8; i += 1) put(st, `lib-${pid}-${i}`, 'basic-swamp', pid, 'library');
  foes.forEach((c, i) => put(st, `f${i}`, c, 'p2', 'battlefield'));
  if (card === 'geist') {
    put(st, 'geist', 'heron-blessed-geist', 'p1', 'graveyard');
    put(st, 'host', 'tuskguard-captain', 'p1', 'battlefield');
    put(st, 'bf', 'bloodfire-infusion', 'p1', 'battlefield', { attachedTo: 'host' });
  } else {
    put(st, 'ra', 'raise-the-alarm', 'p1', 'hand');
  }
  st.players.find((p) => p.id === 'p1').life = myLife;
  addMana(st, 'p1', 5, { colors: ['W'] });
  return st;
}

/** Wycena czaru/aktywacji tokenowego (Geist: aktywacja z cmentarza; Raise the Alarm: czar). */
function tokenScore({ card, myLife, foes = [] }, params = undefined) {
  const st = scene({ card, myLife, foes });
  const bot = createHeuristicBot({ seed: 7, params });
  bot.chooseCommand(playerView(st, 'p1'), {});
  const prefix = card === 'geist' ? 'activate_ability(geist' : 'cast_spell(ra';
  const o = (bot.trace().at(-1)?.options ?? []).filter(Boolean).find((x) => x.cmd.startsWith(prefix));
  assert.ok(o, 'opcja tokenowa w ocenach bota');
  return o.score;
}

const FOES = ['makindi-aeronaut', 'makindi-aeronaut'];

test('PMSSB-77 RED: presja życia podnosi wartość tokenów-stworów (Geist: życie 5 > życie 20 przy wrogach)', () => {
  const pod = tokenScore({ card: 'geist', myLife: 5, foes: FOES });
  const spokoj = tokenScore({ card: 'geist', myLife: 20, foes: FOES });
  assert.ok(pod > spokoj, `pod presją ${pod} > ${spokoj}`);
});

test('PMSSB-77 RED: presja życia podnosi wartość czaru z tokenami (Raise the Alarm: życie 5 > życie 20)', () => {
  const pod = tokenScore({ card: 'ra', myLife: 5, foes: FOES });
  const spokoj = tokenScore({ card: 'ra', myLife: 20, foes: FOES });
  assert.ok(pod > spokoj, `pod presją ${pod} > ${spokoj}`);
});

test('PMSSB-77 pin: pusty stół (brak zagrożenia) — wartość tokenów bez zmian, niezależnie od życia', () => {
  assert.equal(tokenScore({ card: 'geist', myLife: 5 }), 24);
  assert.equal(tokenScore({ card: 'geist', myLife: 20 }), 24);
});

test('PMSSB-77 pokrętło: tokenPressureWeight 0 wyłącza presję (życie 5 = życie 20)', () => {
  const params = normalizeHeuristicParams({ tokenPressureWeight: 0 });
  const pod = tokenScore({ card: 'geist', myLife: 5, foes: FOES }, params);
  const spokoj = tokenScore({ card: 'geist', myLife: 20, foes: FOES }, params);
  assert.equal(pod, spokoj);
});

// PMSSB-77 (domknięcie): presja działa SYMETRYCZNIE. Token oddany wrogowi (Secure the Scene:
// „Its controller creates a 1/1”) to ciało dla przeciwnika — przy moim niskim życiu jest gorsze.
// Znak roli (sign) mnoży już całe ciało, więc presja wchodzi z tym samym znakiem.
function secureScore(life, params = undefined) {
  const st = createGameState({ seed: 69, players: [{ id: 'p1' }, { id: 'p2' }] });
  st.turn = jumpToStep(st.turn, 'main1', 'p2');
  st.turn.activePlayerId = st.turn.priorityPlayerId = 'p2';
  for (const pid of ['p1', 'p2']) for (let i = 0; i < 8; i += 1) put(st, `lib-${pid}-${i}`, 'basic-swamp', pid, 'library');
  put(st, 'sec', 'secure-the-scene', 'p2', 'hand');
  put(st, 'foe', 'kulrath-zealot', 'p1', 'battlefield');
  put(st, 'foe2', 'kulrath-zealot', 'p1', 'battlefield');
  st.players.find((p) => p.id === 'p2').life = life;
  addMana(st, 'p2', 5, { colors: ['W'] });
  const bot = createHeuristicBot({ seed: 7, params });
  bot.chooseCommand(playerView(st, 'p2'), {});
  const o = (bot.trace().at(-1)?.options ?? []).filter(Boolean).find((x) => x.cmd === 'cast_spell(sec->foe)');
  assert.ok(o, 'opcja Secure the Scene na wrogim stworze');
  return o.score;
}

test('PMSSB-77 RED: token oddany wrogowi przy moim niskim życiu jest gorszy (presja symetryczna)', () => {
  const pod = secureScore(5);
  const spokoj = secureScore(20);
  assert.ok(pod < spokoj, `Secure: życie 5 ${pod} < życie 20 ${spokoj}`);
});

test('PMSSB-77 symetria pokrętłem: tokenPressureWeight 0 — Secure bez wpływu życia', () => {
  const params = normalizeHeuristicParams({ tokenPressureWeight: 0 });
  assert.equal(secureScore(5, params), secureScore(20, params));
});
