// PMSSB-38 (2026-10-02d) — licznik czarów w widoku bota (second-spell payoffy)
// i wycena incubate (Tiller of Flesh, Merciless Repurposing). Plan:
// `docs/plans/PLAN_2026-10-02d-pmssb38-licznik-spelli-incubate.md`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const registry = createCardRegistry();

function put(state, id, cardId, playerId = 'p1', zone = 'hand', patch = {}) {
  const def = registry.get(cardId);
  assert.ok(def, `${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId,
    zone, ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes, keywords: def.keywords,
  });
  if (Object.keys(patch).length) state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
}

function game(lib = 30) {
  const s = createGameState({ seed: 38, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main', 'p1');
  s.turn.activePlayerId = s.turn.priorityPlayerId = 'p1';
  for (const p of ['p1', 'p2']) for (let i = 0; i < lib; i += 1) put(s, `lib-${p}-${i}`, 'basic-swamp', p, 'library');
  return s;
}

const READY = { summoningSick: false };
const lands = (s, n, kind) => { for (let i = 0; i < n; i += 1) put(s, `L${i}`, kind, 'p1', 'battlefield', { tapped: false }); };

/** Oferty bota: mapa etykieta → wynik + wybrana komenda. */
function oferta(s, params) {
  const bot = createHeuristicBot({ seed: 2026, params });
  const cmd = bot.chooseCommand(playerView(s, 'p1'), {});
  const opcje = new Map();
  for (const o of bot.trace().at(-1)?.options ?? []) opcje.set(o.cmd, o.score);
  return { cmd, opcje };
}
const wynik = (s, prefix, params) => {
  const hits = [...oferta(s, params).opcje].filter(([k]) => k.startsWith(prefix));
  assert.equal(hits.length, 1, `jedna oferta „${prefix}”, są: ${[...oferta(s, params).opcje.keys()].join(' | ')}`);
  return hits[0][1];
};



test('A1 widok wystawia własny licznik czarów tury i zmienia go rzut', () => {
  const s = game();
  lands(s, 2, 'basic-mountain');
  put(s, 'h0', 'shock');
  put(s, 'b', 'maritime-guard', 'p2', 'battlefield', READY);
  assert.equal(playerView(s, 'p1').spellsCastThisTurn, 0);
  execute(s, { type: 'cast_spell', playerId: 'p1', objectId: 'h0', targets: ['b'] });
  assert.equal(playerView(s, 'p1').spellsCastThisTurn, 1);
  assert.equal(playerView(s, 'p2').spellsCastThisTurn, 0, 'licznik jest per gracz');
});

function illvoi(prior, host = 'illvoi-operative', params) {
  const s = game();
  lands(s, 5, 'basic-mountain');
  put(s, 'iv', host, 'p1', 'battlefield', READY);
  put(s, 'h0', 'shock');
  put(s, 'b', 'maritime-guard', 'p2', 'battlefield', { ...READY, power: 2, toughness: 2 });
  s.spellsCastThisTurnByPlayer = { p1: prior };
  return wynik(s, 'cast_spell(h0->b)', params);
}

test('B1 Illvoi Operative: rzut będący DRUGIM czarem dostaje wartość licznika (+~8)', () => {
  const pierwszy = illvoi(0);
  const drugi = illvoi(1);
  const trzeci = illvoi(2);
  assert.ok(drugi - pierwszy > 5 && drugi - pierwszy < 12, `różnica ${drugi - pierwszy}`);
  assert.equal(trzeci, pierwszy, 'trzeci czar nie odpala triggera');
  assert.equal(drugi - illvoi(1, 'illvoi-operative', { boardPayoffWeight: 0 }), drugi - pierwszy);
});

test('B2 Jeskai Devotee (pump do końca tury): bez zmian — poza miarą wartości trwałej', () => {
  assert.equal(illvoi(1, 'jeskai-devotee'), illvoi(0, 'jeskai-devotee'));
});

function tiller(cel, params) {
  const s = game();
  lands(s, 5, 'basic-mountain');
  put(s, 'tf', 'tiller-of-flesh', 'p1', 'battlefield', READY);
  put(s, 'h0', 'shock');
  put(s, 'b', 'maritime-guard', 'p2', 'battlefield', { ...READY, power: 2, toughness: 2 });
  return wynik(s, `cast_spell(h0->${cel})`, params);
}

test('C1 Tiller of Flesh: czar celujący w PERMANENT dostaje wartość incubate (~+9)', () => {
  const z = tiller('b');
  const bez = tiller('b', { boardPayoffWeight: 0 });
  assert.ok(z - bez > 6 && z - bez < 12, `różnica ${z - bez}`);
});

test('C2 Tiller of Flesh: czar celujący w GRACZA nie odpala incubate', () => {
  assert.equal(tiller('p2'), tiller('p2', { boardPayoffWeight: 0 }));
});

test('C3 Merciless Repurposing: czar liczy incubate 3 (PRZED 92, PO 120 = +30 −2 koszt przemiany)', () => {
  const s = game();
  lands(s, 6, 'basic-swamp');
  put(s, 'h0', 'merciless-repurposing');
  put(s, 'b', 'hill-giant', 'p2', 'battlefield', READY);
  assert.equal(wynik(s, 'cast_spell(h0->b)'), 120);
});
