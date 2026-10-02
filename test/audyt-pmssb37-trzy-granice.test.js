// PMSSB-37 (2026-10-02c) — trzy granice po PMSSB-36: (A) bite bez zabicia
// (Chocobo Kick), (B) payoffy inne niż licznik (Tellah), (C) zapłata opcjonalna
// vs inny rzut tej tury (Oreplate Pangolin). Plan:
// `docs/plans/PLAN_2026-10-02c-pmssb37-trzy-granice.md`.
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
  const s = createGameState({ seed: 37, players: [{ id: 'p1' }, { id: 'p2' }] });
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


function kick(card, toughness, params) {
  const s = game();
  lands(s, 3, 'basic-forest');
  put(s, 'k', card);
  put(s, 'a', 'maritime-guard', 'p1', 'battlefield', { ...READY, power: 3, toughness: 3 });
  put(s, 'b', 'maritime-guard', 'p2', 'battlefield', { ...READY, power: 2, toughness });
  return oferta(s, params);
}
const najlepszyCast = (o, id) => Math.max(...[...o.opcje].filter(([k]) => k.startsWith(`cast_spell(${id}->`)).map(([, v]) => v));

test('A1 Chocobo Kick zabija cel o wytrzymałości 3 → zagrany', () => {
  const o = kick('chocobo-kick', 3);
  assert.equal(o.cmd.type, 'cast_spell');
  assert.ok(najlepszyCast(o, 'k') > 60);
});

test('A2 Chocobo Kick na cel o wytrzymałości 9 (bez zabicia) → pass', () => {
  const o = kick('chocobo-kick', 9);
  assert.equal(o.cmd.type, 'pass_priority');
  assert.ok(najlepszyCast(o, 'k') < 0, `wynik ${najlepszyCast(o, 'k')}`);
});

test('A3 pokrętło fightBiteMissPenalty 0 przywraca dawną chip (Kick na 9 zagrany)', () => {
  const o = kick('chocobo-kick', 9, { fightBiteMissPenalty: 0 });
  assert.equal(o.cmd.type, 'cast_spell');
});

test('A4 Knockout Maneuver bez zabicia: licznik na własnym stworze nadal wygrywa z pasem', () => {
  const o = kick('knockout-maneuver', 9);
  assert.equal(o.cmd.type, 'cast_spell');
});

test('A5 Assert Perfection (pump +1/+0) zabija cel 2 → zagrany; na 9 → pass', () => {
  assert.equal(kick('assert-perfection', 2).cmd.type, 'cast_spell');
  assert.equal(kick('assert-perfection', 9).cmd.type, 'pass_priority');
});

function tellah(card, params, host = 'tellah-great-sage') {
  const s = game();
  lands(s, 5, 'basic-mountain');
  put(s, 'h0', card);
  put(s, 'b', 'maritime-guard', 'p2', 'battlefield', { ...READY, power: 2, toughness: 2 });
  if (host) put(s, 't', host, 'p1', 'battlefield', READY);
  return oferta(s, params);
}

test('B1 Tellah na polu: rzut instantu dostaje wartość tokenu (waga 0,5 ≈ +5)', () => {
  const z = wynik(...[(() => { const s = game(); lands(s, 5, 'basic-mountain'); put(s, 'h0', 'shock'); put(s, 't', 'tellah-great-sage', 'p1', 'battlefield', READY); put(s, 'b', 'maritime-guard', 'p2', 'battlefield', { ...READY, power: 2, toughness: 2 }); return s; })(), 'cast_spell(h0->b)']);
  const bez = wynik(...[(() => { const s = game(); lands(s, 5, 'basic-mountain'); put(s, 'h0', 'shock'); put(s, 't', 'tellah-great-sage', 'p1', 'battlefield', READY); put(s, 'b', 'maritime-guard', 'p2', 'battlefield', { ...READY, power: 2, toughness: 2 }); return s; })(), 'cast_spell(h0->b)', { boardPayoffWeight: 0 }]);
  assert.ok(z - bez > 3 && z - bez < 8, `różnica ${z - bez}`);
});

test('B2 Tellah: rzut artefaktu (nie-stworzenie) też odpala payoff', () => {
  const mk = (params) => { const s = game(); lands(s, 5, 'basic-mountain'); put(s, 'h0', 'angels-feather'); put(s, 't', 'tellah-great-sage', 'p1', 'battlefield', READY); return wynik(s, 'cast_permanent(h0)', params); };
  assert.ok(mk() - mk({ boardPayoffWeight: 0 }) > 3);
});

test('B3 Tellah: rzut STWORA nie odpala payoffu (noncreature)', () => {
  const mk = (params) => { const s = game(); lands(s, 5, 'basic-mountain'); put(s, 'h0', 'goblin-piker'); put(s, 't', 'tellah-great-sage', 'p1', 'battlefield', READY); return wynik(s, 'cast_permanent(h0)', params); };
  assert.equal(mk(), mk({ boardPayoffWeight: 0 }));
});

function pangolin(hand, params) {
  const s = game();
  lands(s, 4, 'basic-mountain');
  put(s, 'pg', 'oreplate-pangolin', 'p1', 'battlefield', READY);
  put(s, 'art', 'angels-feather');
  hand.forEach((c, i) => put(s, `h${i}`, c));
  put(s, 'b', 'hill-giant', 'p2', 'battlefield', READY);
  execute(s, playerView(s, 'p1').legalCommands.find((c) => c.type === 'cast_permanent' && c.objectId === 'art'));
  for (let i = 0; i < 8; i += 1) {
    if (playerView(s, 'p1').legalCommands.some((c) => c.type === 'resolve_optional_pay_choice')) break;
    const pass = playerView(s, s.turn.priorityPlayerId).legalCommands.find((c) => c.type === 'pass_priority');
    if (!pass) break;
    execute(s, pass);
  }
  return oferta(s, params);
}

test('C1 Pangolin: bez innych kart w ręce płaci {1}', () => {
  assert.equal(pangolin([]).cmd.pay, true);
});

test('C2 Pangolin: karta za 2 mieści się w otwartej manie tylko bez zapłaty → nie płaci', () => {
  assert.equal(pangolin(['goblin-piker']).cmd.pay, false);
});

test('C3 Pangolin: karta za 1 mieści się także po zapłacie → płaci', () => {
  assert.equal(pangolin(['shock']).cmd.pay, true);
});

test('C4 Pangolin: pokrętło optionalPayCastScoreWeight 0 przywraca płatność', () => {
  assert.equal(pangolin(['goblin-piker'], { optionalPayCastScoreWeight: 0 }).cmd.pay, true);
});
