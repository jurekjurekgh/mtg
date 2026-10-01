// PMSSB-26 — wartość landu jako DRABINA (specyfikacja właściciela, 2026-09-30).
//
// Pomiar PRZED (sonda scratch/pmssb26-land-przed.mjs): wartość landu w ogóle
// nie zależała od manabazy aż do starego progu przesycenia — basic-forest dawał
// 20 pkt przy 1, 2, 3 i 5 źródłach {G}, a land utylitarny 19 pkt aż do sumy 6
// lądów. „Mam jedyny las w ręce" i „mam pięć lasów" były warte tyle samo, a
// przy koszcie odrzucenia land przegrywał z KAŻDĄ kartą o niezerowym koszcie,
// bo reguła ciała liczy land jako `2 * manaCost` = 0.
//
// Specyfikacja właściciela:
//   land KOLOROWY — licznik = ile lądów danego pipa na stole + w ręce
//     0 → bardzo duża (nigdy nie odrzucaj) · 1 → spora · 2 → neutralna · 3+ → niska
//   land BEZBARWNY/utylitarny — licznik = suma lądów na stole + w ręce
//     0-2 → bardzo duża · 3-4 → spora · 5-6 → neutralna · 7+ → niska
//
// DOPRECYZOWANIE właściciela (2026-09-30): licznik NIE obejmuje karty właśnie
// rozważanej. „Raczej odrzucaj" miało znaczyć 3 źródła na stole ALBO 2 na stole
// i 1 dodatkowy w ręku — czyli 3 źródła POZA rozważanym landem. Dzięki temu
// stopień „0" znaczy dokładnie to, co powinien: ten land jest moim JEDYNYM
// źródłem koloru (przy liczniku z ręką był dla landu w ręce nieosiągalny).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();
const FOREST = 'basic-forest';       // źródło {G} (podtyp podstawowy, CR 305.6)
const UTIL = 'basilisk-gate';        // land utylitarny, produkuje tylko {C}

function putCard(state, id, cardId, zone = 'hand') {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: 'p2', ownerId: 'p2', zone,
    kind: data.kind, power: data.power, toughness: data.toughness, manaCost: data.manaCost,
    spell: data.spell, abilities: data.abilities ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], types: def.types ?? [], colors: data.colors ?? [],
  });
  return id;
}

/** Decyzja „odrzuć jedną kartę jako koszt"; `board` = lądy już na stole. */
function base({ hand, board = [] }) {
  const state = createGameState({ seed: 26, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  const ids = hand.map((cardId, i) => putCard(state, `h${i}`, cardId));
  board.forEach((cardId, i) => putCard(state, `b${i}`, cardId, 'battlefield'));
  state.pendingDiscardChoice = { playerId: 'p2', handIds: ids, purpose: 'cost', count: 1 };
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

const wybrana = (state) => {
  const bot = createHeuristicBot({ seed: 99 });
  return bot.chooseCommand(playerView(state, 'p2'), {}).cardId;
};

// ---------------------------------------------------------------------------
// Drabina KOLOROWA — licznik = źródła {G} na stole + w ręce.
// Oceniany las w ręce liczy sam siebie, więc licznik = board + 1.
// ---------------------------------------------------------------------------

test('PMSSB-26/A1: 0 źródeł poza rozważanym (jedyny las w ręce) → bardzo duża', () => {
  // 0 lasów na stole, oceniany las w ręce ⇒ 0 źródeł {G} POZA nim ⇒
  // landKeepCritical (30) ⇒ 20 − 30 = −10: to moje jedyne źródło koloru.
  // Porównanie przez stwora BEZBARWNEGO (Welder Automaton {2}):
  // przy 0 lądów żadna KOLOROWA karta nie jest rzucalna, więc reguła koloru
  // właściciela (M408) dałaby jej 40 pkt i przysłoniła drabinę landów.
  const state = base({ hand: [FOREST, 'welder-automaton'] });
  assert.equal(scoreOf(state, 'resolve_discard_choice(h0)'), -10);
  assert.equal(scoreOf(state, 'resolve_discard_choice(h1)'), 12);
  assert.equal(wybrana(state), 'h1', 'jedynego źródła koloru nigdy nie odrzucamy');
});

test('PMSSB-26/A2: 1 źródło poza rozważanym → spora, land zostaje', () => {
  // 1 las na stole ⇒ 1 źródło {G} POZA rozważanym ⇒ landKeepHigh (18) ⇒ 2.
  const state = base({ hand: [FOREST, 'highland-game'], board: [FOREST] });
  assert.equal(scoreOf(state, 'resolve_discard_choice(h0)'), 2);
  assert.equal(scoreOf(state, 'resolve_discard_choice(h1)'), 11);
});

test('PMSSB-26/A3: 2 źródła poza rozważanym → neutralna (remis ±1 ze stworem)', () => {
  // 2 lasy na stole ⇒ 2 źródła {G} POZA rozważanym ⇒ landKeepNeutral (8) ⇒ 12
  // wobec 11 za stwora: „neutralna" znaczy dokładnie remis ±1, nie przechył.
  const state = base({ hand: [FOREST, 'highland-game'], board: [FOREST, FOREST] });
  assert.equal(scoreOf(state, 'resolve_discard_choice(h0)'), 12);
  assert.equal(scoreOf(state, 'resolve_discard_choice(h1)'), 11);
});

test('PMSSB-26/A4: 0 źródeł pipa → bardzo duża (land poza ręką, np. na wierzchu)', () => {
  // Land poza ręką (na wierzchu biblioteki) przy pięciu wyspach i zerze lasów
  // ⇒ 0 źródeł {G} ⇒
  // landKeepCritical (30) ⇒ scry `bottom` = 20 − 30 = −10 (nie chce go oddać).
  const state = createGameState({ seed: 26, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  putCard(state, 't0', FOREST, 'library');
  state.zones.library = ['t0'];
  ['basic-island', 'basic-island', 'basic-island', 'basic-island', 'basic-island']
    .forEach((c, i) => putCard(state, `i${i}`, c, 'battlefield'));
  putCard(state, 'h0', 'welder-automaton');
  state.pendingScry = { playerId: 'p2', count: 1, objectIds: ['t0'], sourceCardId: null, restorePriorityTo: null };
  const bot = createHeuristicBot({ seed: 99 });
  bot.chooseCommand(playerView(state, 'p2'), {});
  const options = (bot.trace().at(-1)?.options ?? []).filter((o) => o.cmd.startsWith('resolve_scry'));
  assert.ok(options.length > 0, `scry zaoferowane: ${JSON.stringify(options.map((o) => o.cmd))}`);
  const bottom = options.find((o) => o.cmd.includes('bottom'));
  assert.equal(bottom.score, -10);
});

// ---------------------------------------------------------------------------
// Drabina BEZBARWNA — licznik = suma lądów na stole + w ręce.
// ---------------------------------------------------------------------------

test('PMSSB-26/B1: suma 1 ląd → bardzo duża, land utylitarny zostaje', () => {
  // 0 lądów poza rozważanym ⇒ landKeepCritical (30) ⇒ −10 wobec 12.
  const state = base({ hand: [UTIL, 'highland-game'] });
  assert.equal(scoreOf(state, 'resolve_discard_choice(h0)'), -10);
  assert.equal(wybrana(state), 'h1', 'przy braku manabazy land utylitarny zostaje');
});

test('PMSSB-26/B2: suma 2 lądów poza rozważanym → wciąż bardzo duża', () => {
  // 2 lądy poza rozważanym ⇒ wciąż stopień 0-2 ⇒ landKeepCritical (30) ⇒ −10.
  const state = base({ hand: [UTIL, 'highland-game'], board: [FOREST, FOREST] });
  assert.equal(scoreOf(state, 'resolve_discard_choice(h0)'), -10);
  assert.equal(wybrana(state), 'h1');
});

test('PMSSB-26/B3: suma 4 lądów poza rozważanym → spora', () => {
  // 4 lądy poza rozważanym ⇒ stopień 3-4 ⇒ landKeepHigh (18) ⇒ 2 wobec 11.
  const state = base({ hand: [UTIL, 'highland-game'], board: [FOREST, FOREST, FOREST, FOREST] });
  assert.equal(scoreOf(state, 'resolve_discard_choice(h0)'), 2);
});

test('PMSSB-26/B4: suma 6 → neutralna, suma 7 poza rozważanym → niska', () => {
  // 6 lądów poza rozważanym ⇒ stopień 5-6 ⇒ landKeepNeutral (8) ⇒ 12 wobec 11;
  // 7 poza rozważanym ⇒ landKeepSaturated (−6) ⇒ 31.
  const szesc = base({ hand: [UTIL, 'highland-game'], board: Array(6).fill(FOREST) });
  assert.equal(scoreOf(szesc, 'resolve_discard_choice(h0)'), 12);
  const siedem = base({ hand: [UTIL, 'highland-game'], board: Array(7).fill(FOREST) });
  assert.equal(scoreOf(siedem, 'resolve_discard_choice(h0)'), 31);
  assert.equal(wybrana(siedem), 'h0', 'przy siedmiu lądach kolejny jest zbędny');
});

// ---------------------------------------------------------------------------
// Kotwice: drabina nie jest regułą duplikatów i nie dotyka reguły koloru.
// ---------------------------------------------------------------------------

test('PMSSB-26/C1 (kotwica M408): reguła braku KOLORU many zostaje nietknięta', () => {
  // Illusory Demon przy samych lasach jest bez koloru ⇒ 40 pkt i to on idzie
  // pierwszy — drabina landów nie zmienia drugiej gałęzi `discardCostPreference`.
  const state = base({ hand: ['highland-game', 'illusory-demon'], board: [FOREST, FOREST, FOREST] });
  assert.equal(scoreOf(state, 'resolve_discard_choice(h1)'), 40);
  assert.equal(wybrana(state), 'h1');
});

test('PMSSB-26/C2: drabina nie zależy od `cardDuplicateDiscount` (to nie duplikaty)', () => {
  // Drugi land tego samego koloru zmienia wartość przez DRABINĘ (0 źródeł poza
  // rozważanym → 30; 1 źródło poza nim → 18), nie przez regułę duplikatów:
  // podniesienie zniżki duplikatów nie rusza landu ani o punkt.
  const jeden = base({ hand: [FOREST, 'highland-game'] });
  const dwa = base({ hand: [FOREST, FOREST, 'highland-game'] });
  assert.equal(scoreOf(jeden, 'resolve_discard_choice(h0)'), -10);
  assert.equal(scoreOf(dwa, 'resolve_discard_choice(h0)'), 2);
  assert.equal(scoreOf(jeden, 'resolve_discard_choice(h0)', { cardDuplicateDiscount: 9 }), -10);
  assert.equal(scoreOf(dwa, 'resolve_discard_choice(h0)', { cardDuplicateDiscount: 9 }), 2);
});

test('PMSSB-26/C3: land wielokolorowy liczy się po NAJMNIEJSZYM liczniku kolorów', () => {
  // Prismari Campus produkuje {U}{R}. Cztery wyspy na stole dają 4 źródła {U}
  // i ZERO źródeł {R} poza rozważanym. Bez `Math.min` land wszedłby na stopień
  // „niska" po niebieskim (−6 ⇒ 31) i bot wyrzuciłby jedyne źródło czerwonego;
  // z `Math.min` liczy się brakujący kolor ⇒ landKeepCritical (30) ⇒ −10.
  const state = base({ hand: ['prismari-campus'], board: Array(4).fill('basic-island') });
  assert.equal(scoreOf(state, 'resolve_discard_choice(h0)'), -10);
  assert.equal(scoreOf(state, 'resolve_discard_choice(h0)', { landColoredCriticalMax: -1 }), 2,
    'gdyby liczył się NAJWIĘKSZY licznik (4 dla {U}), byłoby nasycenie, nie „bardzo duża"');
});

test('PMSSB-26/C4: progi drabiny są pokrętłami, nie stałymi w kodzie', () => {
  // Przesunięcie `landColoredNeutralMax` z 2 na 1 sprawia, że 2 źródła {G} poza
  // rozważanym stają się „niskie" (−6 ⇒ 31) zamiast „neutralne" (8 ⇒ 12).
  const state = base({ hand: [FOREST, 'highland-game'], board: [FOREST, FOREST] });
  assert.equal(scoreOf(state, 'resolve_discard_choice(h0)'), 12);
  assert.equal(scoreOf(state, 'resolve_discard_choice(h0)', { landColoredNeutralMax: 1 }), 31);
});

test('PMSSB-26/C5: cztery stopnie są monotoniczne (im więcej źródeł, tym chętniej oddajemy)', () => {
  // n = liczba źródeł {G} POZA rozważanym landem (czyli lasów na stole).
  const st = (n) => base({ hand: [FOREST, 'highland-game'], board: Array(n).fill(FOREST) });
  const a = scoreOf(st(0), 'resolve_discard_choice(h0)');
  const b = scoreOf(st(1), 'resolve_discard_choice(h0)');
  const c = scoreOf(st(2), 'resolve_discard_choice(h0)');
  const d = scoreOf(st(3), 'resolve_discard_choice(h0)');
  assert.ok(a < b && b < c && c < d, `drabina niemonotoniczna: ${a}, ${b}, ${c}, ${d}`);
  assert.deepEqual([a, b, c, d], [-10, 2, 12, 31]);
});
