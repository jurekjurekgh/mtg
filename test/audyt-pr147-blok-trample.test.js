// Audyt PR #147, znalezisko F1 (klasa L41/L48): wycena `declare_blockers`
// liczyła KAŻDY zablokowany atak jako w pełni zatrzymany (`+attackerPower`,
// `stoppedDamage += attackerPower`) — także atak z TRAMPLE. CR 702.19b:
// atakujący z trample przypisuje blokerom tylko śmiertelne obrażenia, resztę
// kieruje w gracza (CR 510.1c/702.19b). 4/4 trample zablokowany tokenem 1/1
// zatrzymuje JEDNO obrażenie, nie cztery.
//
// PMSSB-31 (#147) dołożył do tego premię „korzystnej wymiany" liczoną od
// `attackerPower − blockerValueLost`, więc chump trampera tokenem dostawał
// +4 ponad dotychczasowe +2 — bot topił token, by zatrzymać 1 obrażenie, a
// gałąź „blok ratuje życie" (+30, `attackThreat − stoppedDamage < życie`)
// uznawała blok za ratunek, choć obrażenia i tak przechodziły.
//
// Pomiar PRZED (sonda audytu, 2 tokeny 1/1, 20 życia):
//   4/4 trample: block[a<tok0] = 5 vs pass = 0  (bot chump-blokuje)
//   4/4 zwykły : block[a<tok0] = 5 vs pass = 0  (ten sam wynik — trample nieznany)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView, execute } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createCardDeck } from '../src/cards/materialize.js';
import { createHeuristicBot, blockAbsorbedDamageOf } from '../src/controllers/heuristic-bot.js';

const registry = createCardRegistry();

function put(s, id, cardId, playerId, zone = 'battlefield') {
  const [{ objectId, ...data }] = createCardDeck({ cardIds: [cardId], ownerId: playerId, registry });
  addObject(s, { ...data, id, instanceId: `i-${id}`, controllerId: playerId, zone });
  if (zone === 'battlefield') s.objects.set(id, Object.freeze({ ...s.objects.get(id), summoningSickness: false }));
  return id;
}

function walka({ atakujacy, tokeny = 2, zycie = 20 }) {
  const s = createGameState({ seed: 4242, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.players.find((p) => p.id === 'p2').life = zycie;
  for (const p of ['p1', 'p2']) for (let i = 0; i < 6; i += 1) put(s, `lib-${p}-${i}`, 'basic-swamp', p, 'library');
  const aIds = atakujacy.map(([id, cardId]) => put(s, id, cardId, 'p1'));
  for (let i = 0; i < tokeny; i += 1) put(s, `tok${i}`, 'snarling-wolf', 'p2');
  s.turn = jumpToStep(s.turn, 'declare_attackers', 'p1');
  s.turn.activePlayerId = 'p1'; s.turn.priorityPlayerId = 'p1';
  const r = execute(s, { type: 'declare_attackers', playerId: 'p1', attackerIds: aIds });
  assert.equal(r.ok, true, JSON.stringify(r));
  s.turn = jumpToStep(s.turn, 'declare_blockers', 'p2');
  s.turn.activePlayerId = 'p1'; s.turn.priorityPlayerId = 'p2';
  return s;
}

function wyniki(state) {
  const bot = createHeuristicBot({ seed: 7 });
  const wybrany = bot.chooseCommand(playerView(state, 'p2'), {});
  const opcje = bot.trace().at(-1)?.options ?? [];
  return { wybrany, score: (cmd) => opcje.find((o) => o.cmd === cmd)?.score };
}

const view = (id, cardId, extra = {}) => {
  const def = registry.get(cardId);
  return { id, power: def.power, toughness: def.toughness, damage: 0, keywords: def.keywords ?? [], ...extra };
};

test('F1/1: blockAbsorbedDamageOf — bez trample cała moc, z trample tylko śmiertelne obrażenia', () => {
  const zwykly = view('a', 'fear-of-burning-alive');
  const trampler = view('t', 'hooting-mandrills'); // 4/4 trample
  const wilk = (id) => view(id, 'snarling-wolf');   // 1/1
  assert.equal(blockAbsorbedDamageOf(zwykly, [wilk('w1')]), 4, 'bez trample: pełny blok (CR 509.1h)');
  assert.equal(blockAbsorbedDamageOf(trampler, [wilk('w1')]), 1);
  assert.equal(blockAbsorbedDamageOf(trampler, [wilk('w1'), wilk('w2')]), 2);
  assert.equal(blockAbsorbedDamageOf(trampler, [view('g', 'hill-giant')]), 3, 'toughness 3 < moc 4');
  assert.equal(blockAbsorbedDamageOf(trampler, [view('g', 'hill-giant'), view('g2', 'hill-giant')]), 4, 'cap = moc');
  assert.equal(blockAbsorbedDamageOf(trampler, [wilk('w1')].map((b) => ({ ...b, damage: 1 }))), 0,
    'bloker z już zadanymi obrażeniami nie wchłania nic: wytrzymałość efektywna 0');
});

test('F1/2: deathtouch + trample — wystarcza 1 obrażenie na blokera (CR 702.19b + 702.2c)', () => {
  const dt = view('d', 'hooting-mandrills', { keywords: ['trample', 'deathtouch'] });
  assert.equal(blockAbsorbedDamageOf(dt, [view('g', 'hill-giant')]), 1);
  assert.equal(blockAbsorbedDamageOf(dt, [view('g', 'hill-giant'), view('g2', 'hill-giant')]), 2);
});

test('F1/3: bot nie chump-blokuje trampera tokenem, który zatrzyma 1 z 4 obrażeń (20 życia)', () => {
  const o = wyniki(walka({ atakujacy: [['a', 'hooting-mandrills']] }));
  assert.ok(o.score('block[a<tok0]') < o.score('pass_priority'),
    `chump trampera: ${o.score('block[a<tok0]')} vs pass ${o.score('pass_priority')}`);
  assert.notEqual(o.wybrany.type === 'declare_blockers' && Object.keys(o.wybrany.assignments ?? {}).length, 1);
});

test('F1/4 (kotwica): ten sam atak BEZ trample nadal jest chump-blokowany tokenem', () => {
  const o = wyniki(walka({ atakujacy: [['a', 'fear-of-burning-alive']] }));
  assert.ok(o.score('block[a<tok0]') > o.score('pass_priority'));
});

test('F1/5: blok trampera nie dostaje premii „ratunek życia" (+30), gdy obrażenia i tak zabijają', () => {
  // 7/7 trample, 5 życia, 2 tokeny: wchłoną 2, przejdzie 5 = dokładnie letalnie.
  const o = wyniki(walka({ atakujacy: [['a', 'marut']], zycie: 5 }));
  assert.ok(o.score('block[a<tok0+tok1]') < 10,
    `blok, po którym i tak giniemy, nie może dostać +30: ${o.score('block[a<tok0+tok1]')}`);
});
