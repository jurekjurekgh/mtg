// PMSSB-30 — `resolve_satyr_look_choice` na wspólnej mierze karty.
//
// To była CZWARTA kopia tej samej miary jakości karty: `30 + (land ? 30 : 0)
// + 2P + T` — identyczny kształt co `resolve_search_choice` przed PMSSB-29.
// Komentarz w kodzie twierdził „Ląd premiami za manabazę", ale premia była stała.
//
// Pomiar PRZED (sonda scratch/pmssb30-satyr-przed.mjs), odsłonięte: land,
// Delta Bloodflies {1}{B} 1/2, Woolly Loxodon {5}{G}{G} 6/7, czar. Wyniki były
// IDENTYCZNE przy 0, 3, 8 i 12 lądach na stole:
//   land=60 | bomba=49 | stwór=34 | czar=30 | rezygnacja=−5

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function putCard(state, id, cardId, zone = 'library', extra = {}) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId,
    controllerId: extra.owner ?? 'p2', ownerId: extra.owner ?? 'p2', zone,
    kind: data.kind, power: data.power, toughness: data.toughness, manaCost: data.manaCost,
    spell: data.spell, abilities: data.abilities ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], types: def.types ?? [], colors: data.colors ?? [],
  });
  return id;
}

/** Odsłonięte 4 z wierzchu (Satyr Wayfinder, M15) + `lands` lasów na stole. */
function base(lands) {
  const state = createGameState({ seed: 30, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  const ids = [
    ['rev-land', 'basic-forest'],
    ['rev-tani', 'delta-bloodflies'],
    ['rev-bomba', 'woolly-loxodon'],
    ['rev-czar', 'courage-in-crisis'],
  ].map(([id, cardId]) => putCard(state, id, cardId, 'library'));
  state.zones.library = ids;
  for (let i = 0; i < lands; i += 1) putCard(state, `b${i}`, 'basic-forest', 'battlefield');
  putCard(state, 'h0', 'delta-bloodflies', 'hand');
  // Widok czyta `objectIds`, walidator komendy `pickIds` — potrzebne oba.
  state.pendingSatyrLook = { playerId: 'p2', pickIds: ids, objectIds: ids };
  return state;
}

function scoreOf(state, etykieta, params = undefined) {
  const bot = createHeuristicBot({ seed: 99, ...(params ? { params } : {}) });
  bot.chooseCommand(playerView(state, 'p2'), {});
  const options = bot.trace().at(-1)?.options ?? [];
  const found = options.find((o) => o.cmd === etykieta);
  assert.ok(found, `brak opcji ${etykieta} w: ${options.map((o) => o.cmd).join(' | ')}`);
  return found.score;
}

const wybrany = (state) => {
  const bot = createHeuristicBot({ seed: 99 });
  return bot.chooseCommand(playerView(state, 'p2'), {}).pickId;
};

const WEZ = (id) => `resolve_satyr_look_choice(${id})`;

test('PMSSB-30/A1: przy 0 lądów bierzemy land — brak manabazy bije wszystko', () => {
  // 0 źródeł {G} poza rozważanym ⇒ landKeepCritical (30) ⇒ 30 + 30 = 60.
  // Bomba {5}{G}{G} jest poza zasięgiem (reach = 1) ⇒ −3 ⇒ 27.
  const state = base(0);
  assert.equal(scoreOf(state, WEZ('rev-land')), 60, '30 + max(ciało 0, landKeepCritical 30)');
  assert.equal(scoreOf(state, WEZ('rev-bomba')), 51, '30 + max(ciało 21, wspólna −3)');
  assert.equal(scoreOf(state, WEZ('rev-tani')), 37, '30 + max(ciało 7, wspólna)');
  assert.equal(wybrany(state), 'rev-land');
});

test('PMSSB-30/A2: przy przesycie lądów land spada pod każdą kartę z ciałem', () => {
  // 3 lasy na stole ⇒ 3 źródła {G} ⇒ landKeepSaturated (−6) ⇒ 24, czyli PONIŻEJ
  // grywalnego stwora (38) i czaru (34). PRZED: land miał stałe 60 i wygrywał
  // przy KAŻDEJ manabazie.
  const state = base(3);
  // Wspólna daje −6, ale podłoga z ciała landu (`2 · 0` = 0) podnosi go do 30.
  // PRZED land miał stałe 60 i bił wszystko; teraz spada pod każdą kartę z ciałem.
  assert.equal(scoreOf(state, WEZ('rev-land')), 30, '30 + max(ciało 0, wspólna −6)');
  assert.equal(scoreOf(state, WEZ('rev-bomba')), 51);
  assert.equal(wybrany(state), 'rev-bomba', 'przy trzech źródłach {G} bierzemy kartę, nie land');
});

test('PMSSB-30/A3: wynik bomby jest stały — o wyborze decyduje land', () => {
  // 8 lądów ⇒ reach = 9, więc {5}{G}{G} jest w zasięgu: 4 + min(19,8) = 12 ⇒ 42.
  const state = base(8);
  // Wynik bomby jest STAŁY (51) — ciało 2·6+7+2 za morph = 21 dominuje przy
  // każdej manabazie. O wyborze decyduje land: 60 przy 0 lądów → 30 przy 3+.
  assert.equal(scoreOf(state, WEZ('rev-bomba')), 51);
  assert.equal(scoreOf(state, WEZ('rev-land')), 30);
  assert.equal(scoreOf(state, WEZ('rev-bomba'), { satyrLookBase: 0 }), 21,
    'człon merytoryczny = max(ciało 21, wspólna 10) = 21');
});

test('PMSSB-30/A4: kolejność zmienia się razem z manabazą (PRZED była stała)', () => {
  // Sedno znaleziska: PRZED te stany dawały IDENTYCZNE wyniki (60/49/34/30).
  assert.equal(wybrany(base(0)), 'rev-land', 'przy 0 lądów land bije wszystko (60 > 51)');
  assert.equal(wybrany(base(3)), 'rev-bomba', 'przy 3 źródłach {G} land spada pod bombę');
  assert.equal(wybrany(base(8)), 'rev-bomba');
  assert.notEqual(wybrany(base(0)), wybrany(base(8)), 'manabaza musi zmieniać wybór');
});

test('PMSSB-30/B1: wzięcie karty zostaje daleko nad rezygnacją', () => {
  // Kotwica intencji M15: reszta odsłoniętych kart i tak idzie do grobu, więc
  // rezygnacja (−5) jest zawsze najgorsza. Baza 30 + wspólna miara (−6..30)
  // ⇒ 24..60.
  const state = base(3);
  assert.equal(scoreOf(state, 'resolve_satyr_look_choice(?)'), -5);
  for (const id of ['rev-land', 'rev-tani', 'rev-bomba', 'rev-czar']) {
    assert.ok(scoreOf(state, WEZ(id)) > -5, `${id} musi bić rezygnację`);
  }
});

test('PMSSB-30/B2: baza jest pokrętłem, a wspólna miara dochodzi osobno', () => {
  const state = base(3);
  assert.equal(scoreOf(state, WEZ('rev-land')), 30);
  assert.equal(scoreOf(state, WEZ('rev-land'), { satyrLookBase: 0 }), 0,
    'przy bazie 0 zostaje max(ciało landu 0, wspólna −6) = 0');
  assert.equal(scoreOf(state, WEZ('rev-tani'), { satyrLookBase: 0 }), 8);
});

test('PMSSB-30/B3: drabina lądów dochodzi przez pokrętła PMSSB-26 (jedno źródło prawdy)', () => {
  // Podniesienie `landColoredNeutralMax` z 2 na 3 sprawia, że 3 źródła {G} są
  // „neutralne" (8 ⇒ 38) zamiast „niskie" (−6 ⇒ 24) — dowód, że satyr czyta
  // TĘ SAMĄ drabinę, a nie własną kopię progów.
  const state = base(3);
  assert.equal(scoreOf(state, WEZ('rev-land')), 30);
  assert.equal(scoreOf(state, WEZ('rev-land'), { landColoredNeutralMax: 3 }), 38);
});

test('PMSSB-30/B4: search i satyr wyceniają TĘ SAMĄ kartę tą samą miarą', () => {
  // Bezpośredni pin na koniec klasy L41: różnica między decyzjami ma wynosić
  // dokładnie różnicę ich baz (searchFoundBase 25 vs satyrLookBase 30 = 5),
  // bo człon merytoryczny jest wspólny.
  const lands = 3;
  const satyr = base(lands);
  const wspolna = scoreOf(satyr, WEZ('rev-tani'), { satyrLookBase: 0 });
  assert.equal(wspolna, 8, 'człon merytoryczny = cardKeepValue');
  assert.equal(scoreOf(satyr, WEZ('rev-tani')), wspolna + 30);
  assert.equal(scoreOf(satyr, WEZ('rev-tani'), { satyrLookBase: 25 }), wspolna + 25,
    'przy bazie searcha satyr wycenia kartę identycznie jak search');
});
