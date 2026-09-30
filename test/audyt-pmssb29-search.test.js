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
//
// SPROSTOWANIE (PMSSB-30): pierwotnie ta fala twierdziła, że manabaza zmienia
// wybór przez PRÓG ZASIĘGU bomby (22 przy 0 lądów → 37 przy 8). To było
// przesadzone i zostało obalone przez pin `real-cards-batch55` B55/B4
// (Brightwood Tracker): przy 0 lądów próg zasięgu odwracał wybór z 4/5 na 1/1.
// Karta szukana idzie NA STAŁE do ręki, więc kara za chwilowy brak many jest
// za ostra — obowiązuje podłoga z ciała (`max(ciało, wspólna)`, wzorzec
// z PMSSB-26). Mechanizm, który naprawdę działa: LAND spada po nasyceniu
// (55 → 25), więc od 3 lądów wygrywa bomba. Wynik bomby jest stały (46).

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
  // Land: 0 źródeł poza rozważanym ⇒ landKeepCritical (30) ⇒ 25 + 30 = 55.
  // Bomba: ciało 2·6+7 = 19 (podłoga nad wspólną −3) ⇒ 25 + 19 = 46.
  const state = base(0);
  assert.equal(scoreOf(state, SZUKAJ('lib-land')), 55);
  assert.equal(scoreOf(state, SZUKAJ('lib-bomba')), 46);
  assert.equal(scoreOf(state, SZUKAJ('lib-tani')), 32);
  assert.equal(wybrany(state), 'lib-land');
});

test('PMSSB-29/A2: przy przesycie lądów land spada pod każdą kartę z ciałem', () => {
  // 3 lasy na stole ⇒ 3 źródła {G} ⇒ landKeepSaturated (−6) ⇒ 25 − 6 = 19...
  // ale podłoga z ciała landu to `2 · manaCost` = 0, więc `max(0, −6)` = 0
  // ⇒ 25. PRZED: land miał stałe 55 niezależnie od manabazy i zawsze wygrywał;
  // teraz spada POD każdą kartę z ciałem (bomba 46, stwór 33, czar 31).
  const state = base(3);
  assert.equal(scoreOf(state, SZUKAJ('lib-land')), 25);
  assert.equal(scoreOf(state, SZUKAJ('lib-tani')), 33);
  assert.equal(wybrany(state), 'lib-bomba', 'przy trzech źródłach {G} szukamy karty, nie landu');
});

test('PMSSB-29/A3: wynik bomby jest stały — o wyborze decyduje land', () => {
  // Wynik bomby jest STAŁY (46) — ciało 19 dominuje nad wspólną miarą przy
  // każdej manabazie. Zmienia się za to LAND: 55 przy 0 lądów → 25 przy 3+,
  // więc to on decyduje o tym, kto wygrywa. PRZED land miał 55 zawsze.
  const state = base(8);
  assert.equal(scoreOf(state, SZUKAJ('lib-bomba')), 46);
  assert.equal(scoreOf(state, SZUKAJ('lib-land')), 25);
  assert.equal(scoreOf(state, SZUKAJ('lib-bomba'), { searchFoundBase: 0 }), 21,
    'człon merytoryczny = max(ciało 2·6+7+2 za morph = 21, wspólna 10) = 21');
});

test('PMSSB-29/A4: kolejność zmienia się razem z manabazą (PRZED była stała)', () => {
  // Sedno znaleziska: PRZED te cztery stany dawały IDENTYCZNE wyniki.
  const zero = base(0);
  const trzy = base(3);
  assert.equal(wybrany(zero), 'lib-land', 'przy 0 lądów land bije wszystko (55 > 46)');
  assert.equal(wybrany(trzy), 'lib-bomba', 'przy 3 źródłach {G} land spada pod bombę');
  assert.notEqual(wybrany(zero), wybrany(trzy), 'manabaza musi zmieniać wybór');
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
  assert.equal(scoreOf(state, SZUKAJ('lib-land')), 25);
  assert.equal(scoreOf(state, SZUKAJ('lib-land'), { searchFoundBase: 0 }), 0,
    'przy bazie 0 zostaje max(ciało landu 0, wspólna −6) = 0');
  assert.equal(scoreOf(state, SZUKAJ('lib-tani'), { searchFoundBase: 0 }), 8);
});

test('PMSSB-29/B3: drabina lądów dochodzi przez pokrętła PMSSB-26 (jedno źródło prawdy)', () => {
  // Podniesienie `landColoredNeutralMax` z 2 na 3 sprawia, że 3 źródła {G} są
  // „neutralne" (8 ⇒ 33) zamiast „niskie" (−6 ⇒ 19) — dowód, że search czyta
  // TĘ SAMĄ drabinę, a nie własną kopię progów.
  // 3 źródła {G}: przy progu 2 land jest „niski" (−6), ale podłoga z ciała (0)
  // podnosi go do 25; przy progu 3 jest „neutralny" (8) ⇒ 33. Różnica 8 pkt
  // to dokładnie `landKeepNeutral − 0`, czyli drabina jest widoczna ponad podłogą.
  const state = base(3);
  assert.equal(scoreOf(state, SZUKAJ('lib-land')), 25);
  assert.equal(scoreOf(state, SZUKAJ('lib-land'), { landColoredNeutralMax: 3 }), 33);
});

test('PMSSB-29/B4 (skorygowana granica): koszt czaru JEST rozróżniany', () => {
  // SPROSTOWANIE: pierwotnie ten pin twierdził, że dwa czary bez P/T muszą
  // remisować, bo widok nie wystawia treści karty z biblioteki (strefa ukryta,
  // CR 400.2). To było przesadzone — remis brał się stąd, że `cardKeepValue`
  // IGNOROWAŁ kosztmany dla karty w zasięgu. Podłoga z ciała (`2 · manaCost`)
  // rozróżnia je uczciwie: `courage-in-crisis` za 3 → 6, `serras-embrace`
  // za 4 → 8, różnica dokładnie 2.
  // Zawężona granica: czary o TYM SAMYM koszcie i bez P/T nadal remisują —
  // widok nie mówi, co robią. Nie wymyślamy fałszywego rozróżnienia.
  const state = base(3, [
    ['lib-czar1', 'courage-in-crisis'],   // {3} → ciało 2·3 = 6
    ['lib-czar2', 'serras-embrace'],      // {4} → ciało 2·4 = 8
  ]);
  const c1 = scoreOf(state, SZUKAJ('lib-czar1'));
  const c2 = scoreOf(state, SZUKAJ('lib-czar2'));
  assert.equal(c2 - c1, 2, 'różnica = 2·(koszt2 − koszt1), czyli człon ciała');
  assert.equal(c1, 31, '25 + max(ciało 6, wspólna) = 31');
});
