// PMSSB-29 — `resolve_search_choice` korzysta ze WSPÓLNEJ miary karty.
//
// Wycena szukała własną, TRZECIĄ już miarą jakości karty obok
// `handCardKeepValue` (PMSSB-25/F1) i wspólnej `cardKeepValue`
// (M135 + PMSSB-24/F4 + PMSSB-26): `25 + (land ? 30 : 0) + 2P + T`.
//
// Pomiar PRZED (sonda scratch/pmssb29-search-przed.mjs), kandydaci: land,
// Delta Bloodflies {1}{B} 1/2, Woolly Loxodon {5}{G}{G} 6/7, dwa czary.
// Wyniki były IDENTYCZNE przy 0, 3, 8 i 12 lądach na stole:
//   land=55 | bomba=44 | stwór=29 | czary po 25
// czyli reguła nie znała drabiny lądów, zasięgu many ani koloru:
//  - przy 12 lądach bot szukał KOLEJNEGO landu zamiast 6/7,
//  - przy 0 lądów bomba za 7 biła grywalnego stwora za 1,
//  - wszystkie czary dostawały dokładnie 25 (audyt: 245 remisów
//    „równoważnych" `resolve_search_choice` w 480 partiach).

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

/** Biblioteka z kandydatami + `lands` lasów na stole. */
function base(lands, kandydaci = [
  ['lib-land', 'basic-forest'],
  ['lib-tani', 'delta-bloodflies'],
  ['lib-bomba', 'woolly-loxodon'],
  ['lib-czar', 'courage-in-crisis'],
]) {
  const state = createGameState({ seed: 29, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  const ids = kandydaci.map(([id, cardId]) => putCard(state, id, cardId, 'library'));
  state.zones.library = ids;
  for (let i = 0; i < lands; i += 1) putCard(state, `b${i}`, 'basic-forest', 'battlefield');
  putCard(state, 'h0', 'delta-bloodflies', 'hand');
  state.pendingSearchChoice = {
    playerId: 'p2', sourceCardId: null, destination: 'hand', destinations: null,
    mandatory: true, chain: null, candidateIds: ids, qualifier: {},
  };
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
  return bot.chooseCommand(playerView(state, 'p2'), {}).found;
};

const SZUKAJ = (id) => `resolve_search_choice(${id})`;

test('PMSSB-29/A1: przy 0 lądów szukamy landu — brak manabazy bije wszystko', () => {
  // Wspólna miara: 0 źródeł poza rozważanym ⇒ landKeepCritical (30) ⇒ 25 + 30 = 55.
  // Bomba {5}{G}{G} jest poza zasięgiem (reach = 1) ⇒ −3 ⇒ 22.
  const state = base(0);
  assert.equal(scoreOf(state, SZUKAJ('lib-land')), 55);
  assert.equal(scoreOf(state, SZUKAJ('lib-tani')), 32);
  assert.equal(scoreOf(state, SZUKAJ('lib-bomba')), 22);
  assert.equal(wybrany(state), 'lib-land');
});

test('PMSSB-29/A2: przy przesycie lądów NIE szukamy kolejnego landu', () => {
  // 3 lasy na stole ⇒ 3 źródła {G} ⇒ landKeepSaturated (−6) ⇒ 19, czyli PONIŻEJ
  // grywalnego stwora {1}{B} (33) i czaru (29). PRZED: land miał stałe 55
  // niezależnie od manabazy i zawsze wygrywał.
  const state = base(3);
  assert.equal(scoreOf(state, SZUKAJ('lib-land')), 19);
  assert.equal(scoreOf(state, SZUKAJ('lib-tani')), 33);
  assert.equal(wybrany(state), 'lib-tani', 'przy trzech źródłach {G} szukamy karty, nie landu');
});

test('PMSSB-29/A3: przy pełnej manabazie bomba za 7 wygrywa z tanim stworem', () => {
  // 8 lądów ⇒ reach = 9, więc {5}{G}{G} jest w zasięgu: 4 + min(19,8) = 12 ⇒ 37.
  // PRZED: bomba miała 44 przy KAŻDEJ manabazie, a przy 0 lądów biła stwora 29,
  // choć nie dało się jej rzucić przez wiele tur.
  const state = base(8);
  assert.equal(scoreOf(state, SZUKAJ('lib-bomba')), 37);
  assert.equal(scoreOf(state, SZUKAJ('lib-tani')), 33);
  assert.equal(wybrany(state), 'lib-bomba');
});

test('PMSSB-29/A4: kolejność zmienia się razem z manabazą (PRZED była stała)', () => {
  // Sedno znaleziska: PRZED te cztery stany dawały IDENTYCZNE wyniki.
  const zero = base(0);
  const trzy = base(3);
  const osiem = base(8);
  assert.equal(wybrany(zero), 'lib-land');
  assert.equal(wybrany(trzy), 'lib-tani');
  assert.equal(wybrany(osiem), 'lib-bomba');
  assert.notEqual(wybrany(zero), wybrany(osiem), 'manabaza musi zmieniać wybór');
});

test('PMSSB-29/B1: znalezienie karty zostaje daleko nad rezygnacją', () => {
  // Kotwica zgłoszenia właściciela B (Temat 6): szukanie jest ZAWSZE lepsze
  // niż fail-to-find. Baza 25 + wspólna miara (−6..30) ⇒ 19..55 wobec −40.
  // Rezygnacja istnieje tylko przy szukaniu NIEobowiązkowym (CR 701.23d).
  const state = base(3);
  state.pendingSearchChoice = { ...state.pendingSearchChoice, mandatory: false };
  const rezygnacja = scoreOf(state, 'resolve_search_choice(skip)');
  assert.equal(rezygnacja, -40, 'rezygnacja to stała −40 z gałęzi found == null');
  for (const id of ['lib-land', 'lib-tani', 'lib-bomba', 'lib-czar']) {
    assert.ok(scoreOf(state, SZUKAJ(id)) > rezygnacja, `${id} musi bić rezygnację`);
  }
});

test('PMSSB-29/B2: baza jest pokrętłem, a wspólna miara dochodzi osobno', () => {
  const state = base(3);
  assert.equal(scoreOf(state, SZUKAJ('lib-land')), 19);
  assert.equal(scoreOf(state, SZUKAJ('lib-land'), { searchFoundBase: 0 }), -6,
    'przy bazie 0 zostaje sama wspólna miara (landKeepSaturated)');
  assert.equal(scoreOf(state, SZUKAJ('lib-tani'), { searchFoundBase: 0 }), 8);
});

test('PMSSB-29/B3: drabina lądów dochodzi przez pokrętła PMSSB-26 (jedno źródło prawdy)', () => {
  // Podniesienie `landColoredNeutralMax` z 2 na 3 sprawia, że 3 źródła {G} są
  // „neutralne" (8 ⇒ 33) zamiast „niskie" (−6 ⇒ 19) — dowód, że search czyta
  // TĘ SAMĄ drabinę, a nie własną kopię progów.
  const state = base(3);
  assert.equal(scoreOf(state, SZUKAJ('lib-land')), 19);
  assert.equal(scoreOf(state, SZUKAJ('lib-land'), { landColoredNeutralMax: 3 }), 33);
});

test('PMSSB-29/B4 (granica uczciwości): czary bez P/T wciąż remisują — i tak ma być', () => {
  // Widok nie wystawia TREŚCI czaru z biblioteki (strefa ukryta, CR 400.2),
  // więc wspólna miara daje im tyle samo (4 + 0 − 0). To nie jest luka do
  // załatania liczbą — bot nie ma danych, żeby je rozróżnić. Pin kotwiczy, że
  // nie wymyślamy fałszywego rozróżnienia.
  const state = base(3, [
    ['lib-czar1', 'courage-in-crisis'],
    ['lib-czar2', 'serras-embrace'],
  ]);
  assert.equal(scoreOf(state, SZUKAJ('lib-czar1')), scoreOf(state, SZUKAJ('lib-czar2')));
});
