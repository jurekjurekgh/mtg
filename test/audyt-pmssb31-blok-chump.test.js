// ## PMSSB-31 — chump-block tokenami: korzystna wymiana (zgłoszenie właściciela z gry)
//
// Zgłoszenie: „Bot ma 4 tokeny 1/1. Atakuję go kilkoma kreaturami w tym 4/4,
// 3/3 bez trample. Mimo to bot nie blokuje tymi disposable tokens i dostaje
// 7 dmg. Po to ma te małe token kreatury żeby go broniły przed atakiem
// większych kreatur."
//
// Pomiar PRZED (sonda scratch/pmssb31-warianty.mjs), 4 tokeny 1/1 vs 4/4 + 3/3:
//
//     4  block[a44<tok0+tok1+tok2+tok3]   ← wybór bota
//     1  block[a44<tok0 a33<tok1]         ← poprawne zagranie
//     0  block[a33<tok0]  /  pass_priority
//
// czyli bot topił WSZYSTKIE cztery tokeny w jednym 4/4 i wciąż dostawał 3
// obrażenia, zamiast zatrzymać całe 7 dwoma tokenami. Przy dwóch tokenach
// split remisował z blokiem jednego ataku (1 = 1) i przegrywał kolejnością.
//
// Przyczyna: `+attackerPower` i `−(P+T)` były w jednej skali, więc chump 3/3
// tokenem 1/1 dawał dokładnie 3 − 2 − 1 = 0 — tyle samo co pass.
//
// Płaska waga obrażeń NIE jest rozwiązaniem: waga 3 wymuszała też blok cennym
// 2/2 bez presji życia i łamała 9 istniejących testów, w tym piny anty-over-fix
// („30 życia — blok 2/2 vs 3/3 NIE wygrywa z passem"). Rozróżnikiem jest
// NADWYŻKA: obrażenia wchłonięte przez ciało warte mniej niż one.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView, execute } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createCardDeck } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const registry = createCardRegistry();

function put(s, id, cardId, playerId, zone = 'battlefield', extra = {}) {
  const [{ objectId, ...data }] = createCardDeck({ cardIds: [cardId], ownerId: playerId, registry });
  addObject(s, { ...data, id, instanceId: `i-${id}`, controllerId: playerId, zone });
  if (zone === 'battlefield') {
    s.objects.set(id, Object.freeze({ ...s.objects.get(id), summoningSickness: false, ...extra }));
  }
  return id;
}

const etykieta = (cmd) => (cmd.type === 'declare_blockers'
  ? `block[${Object.entries(cmd.assignments ?? {}).map(([a, b]) => `${a}<${b.join('+')}`).join(' ')}]`
  : cmd.type);

/** p1 atakuje `atakujacy`, p2 broni `tokeny` tokenami 1/1 (Snarling Wolf). */
function walka({ atakujacy, tokeny = 4, tapped = false, zycie = 20, obronca = null }) {
  const s = createGameState({ seed: 4242, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.players.find((p) => p.id === 'p2').life = zycie;
  for (const p of ['p1', 'p2']) for (let i = 0; i < 6; i += 1) put(s, `lib-${p}-${i}`, 'basic-swamp', p, 'library');
  const aIds = atakujacy.map(([id, cardId]) => put(s, id, cardId, 'p1'));
  for (let i = 0; i < tokeny; i += 1) {
    put(s, `tok${i}`, 'snarling-wolf', 'p2', 'battlefield', tapped ? { tapped: true } : {});
  }
  if (obronca) put(s, 'obronca', obronca, 'p2');
  s.turn = jumpToStep(s.turn, 'declare_attackers', 'p1');
  s.turn.activePlayerId = 'p1'; s.turn.priorityPlayerId = 'p1';
  const r = execute(s, { type: 'declare_attackers', playerId: 'p1', attackerIds: aIds });
  assert.equal(r.ok, true, JSON.stringify(r));
  s.turn = jumpToStep(s.turn, 'declare_blockers', 'p2');
  s.turn.activePlayerId = 'p1'; s.turn.priorityPlayerId = 'p2';
  return s;
}

function opcje(state, params = undefined) {
  const bot = createHeuristicBot({ seed: 7, ...(params ? { params } : {}) });
  const wybrany = bot.chooseCommand(playerView(state, 'p2'), {});
  const wszystkie = bot.trace().at(-1)?.options ?? [];
  return {
    wybrany: etykieta(wybrany),
    wynik: (etykieta) => {
      const znaleziona = wszystkie.find((o) => o.cmd === etykieta);
      assert.ok(znaleziona, `brak opcji ${etykieta} w: ${wszystkie.map((o) => o.cmd).join(' | ')}`);
      return znaleziona.score;
    },
  };
}

const DWIE = [['a44', 'fear-of-burning-alive'], ['a33', 'hill-giant']];       // 4/4 + 3/3 = 7
const TRZY = [...DWIE, ['a33b', 'gorehorn-minotaurs']];                        // + 3/3 = 10

test('PMSSB-31/A1: chump 3/3 tokenem 1/1 bije pass (PRZED był remis 0 = 0)', () => {
  const o = opcje(walka({ atakujacy: DWIE }));
  assert.ok(o.wynik('block[a33<tok0]') > o.wynik('pass_priority'),
    `chump 3/3 tokenem musi być lepszy niż przyjęcie 3 obrażeń: ${o.wynik('block[a33<tok0]')} vs ${o.wynik('pass_priority')}`);
  assert.equal(o.wynik('pass_priority'), 0);
});

test('PMSSB-31/A2: 4 tokeny vs 4/4 + 3/3 — bot blokuje OBA ataki, nie topi wszystkich w 4/4', () => {
  const o = opcje(walka({ atakujacy: DWIE }));
  assert.equal(o.wybrany, 'block[a44<tok0 a33<tok1]');
  assert.ok(o.wynik('block[a44<tok0 a33<tok1]') > o.wynik('block[a44<tok0+tok1+tok2+tok3]'),
    'zatrzymanie całych 7 obrażeń dwoma tokenami musi bić zabicie 4/4 czterema');
});

test('PMSSB-31/A3: trzech atakujących (10 dmg) — bot blokuje wszystkich trzema tokenami', () => {
  const o = opcje(walka({ atakujacy: TRZY }));
  assert.equal(o.wybrany, 'block[a44<tok0 a33<tok1 a33b<tok2]');
});

test('PMSSB-31/A4: dwa tokeny vs 4/4 + 3/3 — split przestaje remisować z blokiem jednego', () => {
  const o = opcje(walka({ atakujacy: DWIE, tokeny: 2 }));
  assert.equal(o.wybrany, 'block[a44<tok0 a33<tok1]');
  assert.ok(o.wynik('block[a44<tok0 a33<tok1]') > o.wynik('block[a44<tok0]'),
    'PRZED oba miały po 1 i o wyborze decydowała kolejność ofert');
});

test('PMSSB-31/B1 (anty-over-fix): premia dotyczy NADWYŻKI, więc nie rusza bloku bez nadwyżki', () => {
  // 2/2 blokujący 3/3: obrażenia 3 < ciało 4, więc nadwyżki brak i premia nie
  // zachodzi — zmiana pokrętła NIE może zmienić wyniku. To jest strażnik na
  // piny M257-r5/B („30 życia — blok 2/2 vs 3/3 NIE wygrywa z passem"), które
  // płaska waga obrażeń łamała.
  const stan = walka({ atakujacy: DWIE, tokeny: 0, obronca: 'phyrexian-rager', zycie: 30 });
  const domyslne = opcje(stan);
  const zero = opcje(stan, { blockGoodTradePerPoint: 0 });
  const etykietaBoku = 'block[a44<obronca]';
  assert.equal(domyslne.wynik(etykietaBoku), zero.wynik(etykietaBoku),
    'bez nadwyżki pokrętło nie ma prawa działać');
  // „Nie blokuję" silnik oferuje jako `block[]` (puste przypisanie) albo jako
  // `pass_priority` — oba znaczą to samo, więc pytamy o ZAMIAR, nie o etykietę.
  assert.ok(!domyslne.wybrany.includes('obronca'),
    `bez presji życia cenny bloker zostaje w ręku, a bot wybrał: ${domyslne.wybrany}`);
});

test('PMSSB-31/B2: tokeny tapnięte nie blokują — jedyną legalną opcją jest pusty blok', () => {
  const o = opcje(walka({ atakujacy: DWIE, tapped: true }));
  assert.equal(o.wybrany, 'block[]', 'tapnięty stwór nie może blokować (CR 509.1a)');
});

test('PMSSB-31/B3: pokrętło jest pokrętłem — przy 0 wraca zachowanie sprzed fali', () => {
  const stan = walka({ atakujacy: DWIE });
  const zero = opcje(stan, { blockGoodTradePerPoint: 0 });
  assert.equal(zero.wynik('block[a33<tok0]'), 0, 'PRZED: 3 − 2 − 1 = 0, czyli remis z passem');
  assert.equal(zero.wybrany, 'block[a44<tok0+tok1+tok2+tok3]', 'PRZED: bot topił cztery tokeny w 4/4');
});

test('PMSSB-31/B4 (forward, zmierzony): przy lethal drabinka lifeAfter remisuje oba bloki', () => {
  // Przy 7 życia i ataku 4/4 + 3/3 oba warianty dostają DOKŁADNIE 39: premia
  // +30 za blok ratujący życie jest płaska, a drabinka `lifeAfter` jest
  // niemonotoniczna (mniej życia po = większa premia), więc „blok tylko 4/4,
  // dostaję 3" (lifeAfter 4 → +4) kasuje 2 punkty przewagi „blok obu, dostaję 0"
  // (lifeAfter 7 → +2). O wyborze decyduje kolejność ofert.
  //
  // Pin kotwiczy ten REMIS jako znany forward — nie udaje, że bot wybiera
  // lepiej. Próba domknięcia epsilonem `stoppedDamage * 0.01` rozstrzygała go
  // poprawnie, ale ułamkowy wynik łamał piny wartości dokładnych
  // (PMSSB-2/C/F8: Dissenter +19, Patron 6), więc została wycofana.
  // Właściwa naprawa: drabinka monotoniczna względem `stoppedDamage`.
  const o = opcje(walka({ atakujacy: DWIE, zycie: 7 }));
  assert.equal(o.wynik('block[a44<tok0]'), o.wynik('block[a44<tok0 a33<tok1]'),
    'dokładny remis — to jest forward, nie pożądane zachowanie');
  assert.ok(o.wynik('block[a44<tok0 a33<tok1]') > 30, 'premia za uratowanie życia działa');
});
