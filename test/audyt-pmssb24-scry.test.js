import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

// PMSSB-24 (metoda M429) — rodzina FILTROWANIA WIERZCHU BIBLIOTEKI
// (`scry` 12 kart + `surveil` 5; rodzeństwo: look/clash/library_placement).
//
// Pomiar PRZED (sonda /home/user/scratch/pmssb24-scry-przed.mjs + /tmp/p8.mjs,
// tabela w planie docs/plans/PLAN_2026-09-30a-pmssb24-scry.md):
//   F1 — kolejność kart na wierzchu NIE była wyceniana. Silnik oferuje
//     permutacje (`game-state.js:7149-7160`, CR 701.22a „the rest on top in
//     any order", CR 701.25), a `resolve_scry` liczył tylko `bottomIds`:
//     6 permutacji keep-all remisowało po 20 i wybór padał na pierwszą
//     ofertę. Przy surveil bonus `keepsOrder ? 1 : 0` premiował kolejność
//     ORYGINALNĄ (21 vs 20), więc świadome ułożenie przegrywało.
//     Skutek uboczny: etykieta śladu nie kodowała `topOrder` — 16 wariantów
//     scry dawało 8 etykiet (klasa L34/L40, ta sama co M203/2).
//   F2 — deck-out (CR 104.3c): 26 pkt za odłożenie landu przy bibliotece
//     2 kart = 26 przy 12 kartach.
//   F3 — surveil kładzie kartę do GROBU (CR 701.25): 25 pkt z delve w ręce
//     = 25 bez (stały `MILL_CAUTION`).
//   F4 — kontekst ręki: 12/12 przy ręce pustej = 12/12 przy czterech kartach.
//   F5 — `revealTopGainLife` (Sifter Wurm: reveal wierzchu + życie równe
//     mana value) nie dociera do widoku; najlepszy wariant bota odkładał
//     kartę {5}, czyli dokładnie tę, której reveal chciał na wierzchu.
//
// Fala A (ten plik): wycena kolejności — wspólny `libraryOrderValue`
// w obu decyzjach, etykieta rozróżniająca permutacje. Kotwica anty-over-fix
// (M429): `scryOrderWeight: 0` przywraca wartości sprzed fali, a decyzja
// o PODZBIORZE odłożonym jest bez zmian (26/20 jak w pomiarze PRZED).

const REGISTRY = createCardRegistry();

/** Rząd bez kolejności (Fala A mierzy wyłącznie człon kolejności). */
const KOLEJNOSC_OFF = { scryOrderWeight: 0 };

function putCard(state, id, cardId, controllerId, zone = 'hand') {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness, manaCost: data.manaCost,
    spell: data.spell, abilities: data.abilities ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], types: def.types ?? [], colors: data.colors ?? [],
  });
  return state.objects.get(id);
}

/**
 * Stół z otwartą decyzją przeglądu wierzchu.
 * `top` — karty od wierzchu (kolejność przeglądania, CR 701.22).
 */
function base({ top, kind = 'scry', hand = [], step = 'main1', lands = 0, extra = 8, life = 20, reveal = false } = {}) {
  const state = createGameState({ seed: 24, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', 12);
  for (const [i, cardId] of hand.entries()) putCard(state, `h${i}`, cardId, 'p2');
  for (let i = 0; i < lands; i += 1) putCard(state, `land${i}`, 'basic-forest', 'p2', 'battlefield');
  const topIds = top.map((cardId, i) => { putCard(state, `t${i}`, cardId, 'p2', 'library'); return `t${i}`; });
  for (let i = 0; i < extra; i += 1) putCard(state, `lib${i}`, 'highland-game', 'p2', 'library');
  if (life !== 20) state.players = state.players.map((p) => (p.id === 'p2' ? { ...p, life } : p));
  if (kind === 'scry') {
    state.pendingScry = { playerId: 'p2', objectIds: topIds, restorePriorityTo: 'p2' };
    // Sifter Wurm: po decyzji silnik odsłania wierzch i daje życie równe
    // mana value (CR 608.2). PMSSB-24/F5: widok musi ten fakt nieść.
    if (reveal) state.pendingScry.revealTopGainLife = { sourceCardId: 'sifter-wurm' };
  } else state.pendingSurveil = { playerId: 'p2', objectIds: topIds };
  return { state, topIds };
}

function decide(state, params = undefined) {
  const bot = createHeuristicBot({ seed: 99, ...(params ? { params } : {}) });
  const choice = bot.chooseCommand(playerView(state, 'p2'), {});
  return { choice, options: bot.trace().at(-1)?.options ?? [] };
}

function scoreOf(state, etykieta, params = undefined) {
  const { options } = decide(state, params);
  const found = options.find((o) => o.cmd === etykieta);
  assert.ok(found, `brak opcji ${etykieta} w: ${options.map((o) => o.cmd).join(' | ')}`);
  return found.score;
}

// ---------------------------------------------------------------------------
// F1 — kolejność kart na wierzchu jest wyceniana (była remisem).
// ---------------------------------------------------------------------------

test('PMSSB-24/A1: scry 2 — tani stwór wyżej jest warty więcej niż układ pierwotny', () => {
  // Wierzch: [{5} Rage of Purphoros, {2} Highland Game 2/1], zero lądów.
  // keep: czar −3 (koszt 5 > zasięg+2), stwór +8. Liczą się tylko karty,
  // które chcemy dobrać, więc zysk z przestawienia = (1−0,6)·8 = 3,2 pkt:
  // 20 + 3,2 = 23,2 (PRZED: obie permutacje remisowały po 20).
  // 23,2 > 23 za odłożenie czaru na spód — trzymanie karty, która będzie
  // grywalna za dwie-trzy tury, bije pozbycie się jej na ~30 dobrań.
  const { state } = base({ top: ['rage-of-purphoros', 'highland-game'] });
  assert.equal(scoreOf(state, 'resolve_scry(keep;order:t1+t0)'), 23.2);
  assert.equal(scoreOf(state, 'resolve_scry(keep)'), 20);
  assert.equal(scoreOf(state, 'resolve_scry(bottom:t0)'), 23);
});

test('PMSSB-24/A1b: kolejność rozstrzyga też między DWIEMA chcianymi kartami', () => {
  // Przy 3 lądach: Highland Game 2/1 keep 9, Illusory Demon 4/3 keep 12.
  // Przestawienie silniejszej karty na wierzch: 20 + (1−0,6)·(12−9) = 21,2.
  // Żaden wariant z odkładaniem nie jest blisko (11 / 8 / −1) — reguła nie
  // działa kosztem decyzji o podzbiorze.
  const { state } = base({ top: ['highland-game', 'illusory-demon'], lands: 3 });
  assert.equal(scoreOf(state, 'resolve_scry(keep;order:t1+t0)'), 21.2);
  assert.equal(scoreOf(state, 'resolve_scry(keep)'), 20);
  assert.equal(scoreOf(state, 'resolve_scry(bottom:t0)'), 11);
  assert.equal(scoreOf(state, 'resolve_scry(bottom:t1)'), 8);
});

test('PMSSB-24/A2 (anty-over-fix): scryOrderWeight ×0 przywraca dawny remis', () => {
  const { state } = base({ top: ['rage-of-purphoros', 'highland-game'] });
  assert.equal(scoreOf(state, 'resolve_scry(keep;order:t1+t0)', KOLEJNOSC_OFF), 20);
  assert.equal(scoreOf(state, 'resolve_scry(keep)', KOLEJNOSC_OFF), 20);
});

test('PMSSB-24/A3: surveil — ułożenie lepszej karty wyżej wygrywa z kolejnością pierwotną', () => {
  // PRZED: 21 (oryginalna) vs 20 (odwrócona) — bonus `keepsOrder` karał
  // świadome ułożenie. PO: ta sama wycena co przy scry (CR 701.25 „in any
  // order"), więc ułożenie wygrywa 23,2 vs 20.
  const { state } = base({ top: ['rage-of-purphoros', 'highland-game'], kind: 'surveil' });
  assert.equal(scoreOf(state, 'resolve_surveil(keep;order:t1+t0)'), 23.2);
  assert.equal(scoreOf(state, 'resolve_surveil(keep)'), 20);
  // Z wyłączoną wagą oba warianty wracają do 20 — dawne +1 za kolejność
  // oryginalną zniknęło świadomie (to ono blokowało lepsze ułożenie).
  assert.equal(scoreOf(state, 'resolve_surveil(keep;order:t1+t0)', KOLEJNOSC_OFF), 20);
});

test('PMSSB-24/A4: bot WYBIERA wariant z lepszą kartą na wierzchu (nie pierwszą ofertę)', () => {
  const { state } = base({ top: ['rage-of-purphoros', 'highland-game'] });
  const { choice } = decide(state);
  assert.equal(choice.type, 'resolve_scry');
  assert.deepEqual(choice.bottomIds ?? [], [], 'żadna karta nie idzie na spód');
  assert.deepEqual(choice.topOrder, ['t1', 't0'],
    `tani stwór ma leżeć wyżej: ${JSON.stringify(choice)}`);
});

test('PMSSB-24/A5: etykieta śladu rozróżnia permutacje (16 wariantów = 16 etykiet)', () => {
  // PRZED: 16 wariantów scry dawało 8 etykiet — audyt remisów widział remisy
  // tam, gdzie są różne decyzje (klasa L34/L40).
  const { state } = base({ top: ['rage-of-purphoros', 'highland-game', 'secluded-steppe'] });
  const { options } = decide(state);
  const scry = options.filter((o) => String(o.cmd).startsWith('resolve_scry'));
  assert.equal(scry.length, new Set(scry.map((o) => o.cmd)).size,
    `etykiety muszą być unikalne: ${scry.map((o) => o.cmd).join(' | ')}`);
});

test('PMSSB-24/A6 (kotwica): decyzja o podzbiorze odłożonym jest BEZ zmian', () => {
  // Pomiar PRZED (P3/P7): trzy zbędne landy w ręce + land na stole ⇒ land
  // na wierzchu jest zbędny i idzie na spód: 26 vs keep 20.
  const { state } = base({
    top: ['secluded-steppe', 'highland-game'],
    hand: ['secluded-steppe', 'secluded-steppe', 'secluded-steppe'],
    lands: 6,
  });
  assert.equal(scoreOf(state, 'resolve_scry(bottom:t0)'), 26);
  assert.equal(scoreOf(state, 'resolve_scry(keep)'), 20);
  // …i przy wyłączonym członie kolejności też (człon nie przesuwa podzbioru).
  assert.equal(scoreOf(state, 'resolve_scry(bottom:t0)', KOLEJNOSC_OFF), 26);
});

test('PMSSB-24/A7: przy jednej karcie na wierzchu kolejność nic nie zmienia', () => {
  // scry 1 — permutacji brak, więc wycena musi być identyczna jak PRZED
  // (regresja M135: dobry tani stwór zostaje na wierzchu).
  const { state } = base({ top: ['highland-game'] });
  const { choice } = decide(state);
  assert.deepEqual(choice.bottomIds ?? [], [], 'dobry tani stwór zostaje na wierzchu');
  assert.equal(scoreOf(state, 'resolve_scry(keep)'), 20);
  assert.equal(scoreOf(state, 'resolve_scry(bottom:t0)'), 12);
});

// ---------------------------------------------------------------------------
// F5 — reveal wierzchu po scry (Sifter Wurm): życie = mana value karty.
// ---------------------------------------------------------------------------

test('PMSSB-24/B1: reveal wierzchu jest wyceniany (życie = mana value pierwszej karty)', () => {
  // Wierzch: [{5} czar, {2} stwór 2/1, land]. Przy trzech zbędnych landach
  // w ręce land idzie na spód, a układ z stworem wyżej dokłada 3,2 (fala A).
  // Reveal dokłada życie za kartę, która zostanie odsłonięta — przy 20 życia
  // `gainLifeValue(2)` = 2, więc 29,2 + 2 = 31,2.
  const zReveal = base({ top: ['rage-of-purphoros', 'highland-game', 'secluded-steppe'], hand: ['secluded-steppe', 'secluded-steppe', 'secluded-steppe'], reveal: true });
  const bezReveal = base({ top: ['rage-of-purphoros', 'highland-game', 'secluded-steppe'], hand: ['secluded-steppe', 'secluded-steppe', 'secluded-steppe'] });
  assert.equal(scoreOf(zReveal.state, 'resolve_scry(bottom:t2;order:t1+t0)'), 31.2);
  assert.equal(scoreOf(bezReveal.state, 'resolve_scry(bottom:t2;order:t1+t0)'), 29.2);
});

test('PMSSB-24/B2: przy niskim życiu reveal jest warty więcej (wspólna skala gainLifeValue)', () => {
  // Te same karty, życie 4: `gainLifeValue(2)` = 2 + 2 = 4 ⇒ 29,2 + 4 = 33,2.
  // Wartość revealu idzie z istniejącej drabiny życia (L41), nie z nowej skali.
  const { state } = base({
    top: ['rage-of-purphoros', 'highland-game', 'secluded-steppe'],
    hand: ['secluded-steppe', 'secluded-steppe', 'secluded-steppe'],
    life: 4, reveal: true,
  });
  assert.equal(scoreOf(state, 'resolve_scry(bottom:t2;order:t1+t0)'), 33.2);
});

test('PMSSB-24/B3: widok niesie revealTopGainLife tylko gdy zdolność go ma', () => {
  // F5 to był brak DANYCH (klasa L1): pola widoku to playerId/count/cards.
  const zReveal = base({ top: ['highland-game', 'secluded-steppe'], reveal: true });
  const bezReveal = base({ top: ['highland-game', 'secluded-steppe'] });
  assert.equal(playerView(zReveal.state, 'p2').pendingScry.revealTopGainLife, true);
  assert.equal('revealTopGainLife' in playerView(bezReveal.state, 'p2').pendingScry, false,
    'pole ma być warunkowe, nie zawsze obecne (kontrakt widoku)');
});

// ---------------------------------------------------------------------------
// F2 (po korekcie) — surveil ZDEJMUJE kartę z biblioteki: drabina deck-outu.
// ---------------------------------------------------------------------------

test('PMSSB-24/B4: surveil przy cienkiej bibliotece NIE mieli (deck-out, CR 121.4)', () => {
  // Biblioteka 3 karty: zmielenie jednej zostawia 2, czyli partię o jedno
  // dobranie krótszą. PRZED: `mill` = 24 niezależnie od głębokości (tylko
  // stały MILL_CAUTION). PO: trzymanie kart wygrywa 23,2 vs 21,2.
  const cienka = base({ top: ['rage-of-purphoros', 'highland-game', 'secluded-steppe'], kind: 'surveil', hand: ['secluded-steppe', 'secluded-steppe', 'secluded-steppe'], extra: 0 });
  assert.equal(scoreOf(cienka.state, 'resolve_surveil(keep;order:t1+t0+t2)'), 23.2);
  assert.equal(scoreOf(cienka.state, 'resolve_surveil(mill:t2;order:t1+t0)'), 21.2);
});

test('PMSSB-24/B5 (kotwica): przy zdrowej bibliotece surveil mieli jak dotąd', () => {
  // Biblioteka 12 kart — drabina deck-outu jest zerem, więc wartości są
  // identyczne jak w fali A (27,2 / 23,2). Człon presji nie przesuwa gry.
  const zdrowa = base({ top: ['rage-of-purphoros', 'highland-game', 'secluded-steppe'], kind: 'surveil', hand: ['secluded-steppe', 'secluded-steppe', 'secluded-steppe'], extra: 9 });
  assert.equal(scoreOf(zdrowa.state, 'resolve_surveil(mill:t2;order:t1+t0)'), 27.2);
  assert.equal(scoreOf(zdrowa.state, 'resolve_surveil(keep;order:t1+t0+t2)'), 23.2);
});

test('PMSSB-24/B6: ostatniej karty w bibliotece bot nie mieli za żadną cenę', () => {
  // Biblioteka 1 karta (zbędny land): zmielenie = pusta biblioteka = przegrana
  // przy najbliższym dobraniu. Różnica drabiny −65,4 przebija zysk 4.
  const { state } = base({ top: ['secluded-steppe'], kind: 'surveil', hand: ['secluded-steppe', 'secluded-steppe', 'secluded-steppe'], extra: 0 });
  assert.equal(scoreOf(state, 'resolve_surveil(keep)'), 20);
  assert.equal(scoreOf(state, 'resolve_surveil(mill:t0)'), -42);
  const { choice } = decide(state);
  assert.deepEqual(choice.millIds ?? [], [], 'ostatnia karta zostaje w bibliotece');
});

// ---------------------------------------------------------------------------
// F4 — kontekst ręki: duplikaty (F3 — grób jako zasób — poniżej).
// ---------------------------------------------------------------------------

test('PMSSB-24/C1: druga i trzecia kopia tej samej karty jest warta mniej', () => {
  // Wierzch: Highland Game 2/1 za {2} przy 3 lądach ⇒ keep 9, czyli odłożenie
  // na spód = 20 − 9 = 11. Z dwiema kopiami w ręce keep 6 ⇒ 14; z trzema
  // keep 3 ⇒ 17 (zniżka 3 za kopię, limit 2 kopie). PRZED: 11 w każdym
  // przypadku — `cardKeepValue` nie znała ręki (P5: 12/12 = 12/12).
  const zero = base({ top: ['highland-game'], lands: 3 });
  const jedna = base({ top: ['highland-game'], lands: 3, hand: ['highland-game'] });
  const dwie = base({ top: ['highland-game'], lands: 3, hand: ['highland-game', 'highland-game'] });
  const trzy = base({ top: ['highland-game'], lands: 3, hand: ['highland-game', 'highland-game', 'highland-game'] });
  assert.equal(scoreOf(zero.state, 'resolve_scry(bottom:t0)'), 11);
  assert.equal(scoreOf(jedna.state, 'resolve_scry(bottom:t0)'), 11);
  assert.equal(scoreOf(dwie.state, 'resolve_scry(bottom:t0)'), 14);
  assert.equal(scoreOf(trzy.state, 'resolve_scry(bottom:t0)'), 17);
});

test('PMSSB-24/C2 (anty-over-fix): cardDuplicateDiscount ×0 przywraca dawną wycenę', () => {
  const trzy = base({ top: ['highland-game'], lands: 3, hand: ['highland-game', 'highland-game', 'highland-game'] });
  assert.equal(scoreOf(trzy.state, 'resolve_scry(bottom:t0)', { cardDuplicateDiscount: 0 }), 11);
});

test('PMSSB-24/C3: lądy są poza regułą duplikatów (ich nasycenie ma własny próg)', () => {
  // Drugi land w ręce nie dostaje zniżki — przy przesycie (3 w ręce albo
  // 6 na stole) land i tak jest warty −6, a przy budowie manabazy każda
  // kopia jest cenna. Zmiana progu przy okazji fali byłaby over-fixem.
  const jeden = base({ top: ['secluded-steppe'], hand: ['secluded-steppe'] });
  const dwa = base({ top: ['secluded-steppe'], hand: ['secluded-steppe', 'secluded-steppe'] });
  assert.equal(scoreOf(jeden.state, 'resolve_scry(bottom:t0)'), 12);
  assert.equal(scoreOf(dwa.state, 'resolve_scry(bottom:t0)'), 12);
});

// ---------------------------------------------------------------------------
// F3 — surveil: grób bywa zasobem (Delve CR 702.66 / reanimacja).
// ---------------------------------------------------------------------------

test('PMSSB-24/C4: zmielenie karty jest warte więcej, gdy ręka czyta z grobu', () => {
  // Surveil 2, wierzch [land, stwór], 6 lądów i 3 landy w ręce ⇒ land zbędny.
  // Bez źródła w grobie: mill 24. Z Hooting Mandrills (Delve) w ręce: 26 —
  // dopłata 2 za źródło znosi `MILL_CAUTION` dla karty na granicy. PRZED:
  // 25 = 25 (P4) — jedyną różnicą scry/surveil był stały MILL_CAUTION.
  const bezDelve = base({ top: ['secluded-steppe', 'highland-game'], kind: 'surveil', lands: 6, hand: ['secluded-steppe', 'secluded-steppe', 'secluded-steppe'] });
  const zDelve = base({ top: ['secluded-steppe', 'highland-game'], kind: 'surveil', lands: 6, hand: ['secluded-steppe', 'secluded-steppe', 'secluded-steppe', 'hooting-mandrills'] });
  assert.equal(scoreOf(bezDelve.state, 'resolve_surveil(mill:t0)'), 24);
  assert.equal(scoreOf(zDelve.state, 'resolve_surveil(mill:t0)'), 26);
});

test('PMSSB-24/C5 (anty-over-fix): surveilGraveSynergyPerSource ×0 przywraca 24', () => {
  const zDelve = base({ top: ['secluded-steppe', 'highland-game'], kind: 'surveil', lands: 6, hand: ['secluded-steppe', 'secluded-steppe', 'secluded-steppe', 'hooting-mandrills'] });
  assert.equal(scoreOf(zDelve.state, 'resolve_surveil(mill:t0)', { surveilGraveSynergyPerSource: 0 }), 24);
});
