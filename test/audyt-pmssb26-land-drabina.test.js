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

test('PMSSB-26/A1: 1 źródło pipa (jedyny las w ręce) → spora, land zostaje', () => {
  // 0 lasów na stole + oceniany las = 1 źródło {G} ⇒ landKeepHigh (18)
  // ⇒ 20 − 18 = 2. Porównanie przez stwora BEZBARWNEGO (Welder Automaton {2}):
  // przy 0 lądów żadna KOLOROWA karta nie jest rzucalna, więc reguła koloru
  // właściciela (M408) dałaby jej 40 pkt i przysłoniła drabinę landów.
  const state = base({ hand: [FOREST, 'welder-automaton'] });
  assert.equal(scoreOf(state, 'resolve_discard_choice(h0)'), 2);
  assert.ok(scoreOf(state, 'resolve_discard_choice(h1)') > 2,
    'land jedynego źródła koloru nie może iść przed grywalną kartą');
  assert.equal(wybrana(state), 'h1', 'przy jednym źródle koloru land zostaje');
});

test('PMSSB-26/A2: 2 źródła pipa → neutralna, land i stwór praktycznie remisują', () => {
  // 1 las na stole + oceniany = 2 źródła ⇒ landKeepNeutral (8) ⇒ 12 wobec 11.
  // „Neutralna" znaczy dokładnie to: różnica jednego punktu, nie przechył.
  const state = base({ hand: [FOREST, 'highland-game'], board: [FOREST] });
  assert.equal(scoreOf(state, 'resolve_discard_choice(h0)'), 12);
  assert.equal(scoreOf(state, 'resolve_discard_choice(h1)'), 11);
});

test('PMSSB-26/A3: 3 źródła pipa → niska, land idzie pierwszy', () => {
  // 2 lasy na stole + oceniany = 3 źródła ⇒ landKeepSaturated (−6)
  // ⇒ −(−6) + discardUnwantedBonus(5) = 11 ⇒ 31 wobec 11.
  const state = base({ hand: [FOREST, 'highland-game'], board: [FOREST, FOREST] });
  assert.equal(scoreOf(state, 'resolve_discard_choice(h0)'), 31);
  assert.equal(scoreOf(state, 'resolve_discard_choice(h1)'), 11);
  assert.equal(wybrana(state), 'h0', 'przy trzech źródłach koloru land jest zbędny');
});

test('PMSSB-26/A4: 0 źródeł pipa → bardzo duża (land poza ręką, np. na wierzchu)', () => {
  // Licznik obejmuje rękę, więc land W ręce zawsze liczy sam siebie i stopień
  // „0" pojawia się dopiero, gdy land leży poza nią. Tu: las na wierzchu
  // biblioteki przy pięciu wyspach i zerze lasów ⇒ 0 źródeł {G} ⇒
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
  // 0 na stole + oceniany = suma 1 ⇒ landKeepCritical (30) ⇒ −10 wobec 11.
  const state = base({ hand: [UTIL, 'highland-game'] });
  assert.equal(scoreOf(state, 'resolve_discard_choice(h0)'), -10);
  assert.equal(wybrana(state), 'h1', 'przy braku manabazy land utylitarny zostaje');
});

test('PMSSB-26/B2: suma 3 lądów → spora', () => {
  // 2 na stole + oceniany = suma 3 ⇒ landKeepHigh (18) ⇒ 2 wobec 11.
  const state = base({ hand: [UTIL, 'highland-game'], board: [FOREST, FOREST] });
  assert.equal(scoreOf(state, 'resolve_discard_choice(h0)'), 2);
  assert.equal(wybrana(state), 'h1');
});

test('PMSSB-26/B3: suma 5 lądów → neutralna', () => {
  // 4 na stole + oceniany = suma 5 ⇒ landKeepNeutral (8) ⇒ 12 wobec 11.
  const state = base({ hand: [UTIL, 'highland-game'], board: [FOREST, FOREST, FOREST, FOREST] });
  assert.equal(scoreOf(state, 'resolve_discard_choice(h0)'), 12);
});

test('PMSSB-26/B4: suma 7 lądów → niska, land utylitarny idzie pierwszy', () => {
  // 6 na stole + oceniany = suma 7 ⇒ landKeepSaturated (−6) ⇒ 31 wobec 11.
  const state = base({ hand: [UTIL, 'highland-game'], board: [FOREST, FOREST, FOREST, FOREST, FOREST, FOREST] });
  assert.equal(scoreOf(state, 'resolve_discard_choice(h0)'), 31);
  assert.equal(wybrana(state), 'h0', 'przy siedmiu lądach kolejny jest zbędny');
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
  // Drugi land tego samego koloru zmienia wartość przez DRABINĘ (18 → 8), nie
  // przez regułę duplikatów: podniesienie zniżki duplikatów nie rusza landu.
  const jeden = base({ hand: [FOREST, 'highland-game'] });
  const dwa = base({ hand: [FOREST, FOREST, 'highland-game'] });
  assert.equal(scoreOf(jeden, 'resolve_discard_choice(h0)'), 2);
  assert.equal(scoreOf(dwa, 'resolve_discard_choice(h0)'), 12);
  assert.equal(scoreOf(jeden, 'resolve_discard_choice(h0)', { cardDuplicateDiscount: 9 }), 2);
  assert.equal(scoreOf(dwa, 'resolve_discard_choice(h0)', { cardDuplicateDiscount: 9 }), 12);
});

test('PMSSB-26/C3: land wielokolorowy liczy się po NAJMNIEJSZYM liczniku kolorów', () => {
  // Prismari Campus produkuje {U}{R}. Cztery wyspy na stole dają 5 źródeł {U}
  // (z nim samym) i tylko 1 źródło {R}. Bez `Math.min` land wszedłby na stopień
  // „niska" po niebieskim (−6 ⇒ 31) i bot wyrzuciłby jedyne źródło czerwonego;
  // z `Math.min` liczy się brakujący kolor ⇒ landKeepHigh (18) ⇒ 2.
  const state = base({ hand: ['prismari-campus'], board: ['basic-island', 'basic-island', 'basic-island', 'basic-island'] });
  assert.equal(scoreOf(state, 'resolve_discard_choice(h0)'), 2);
  assert.equal(scoreOf(state, 'resolve_discard_choice(h0)', { landColoredHighMax: 0 }), 12,
    'gdyby liczył się NAJWIĘKSZY licznik (5), byłoby nasycenie, nie „spora"');
});

test('PMSSB-26/C4: progi drabiny są pokrętłami, nie stałymi w kodzie', () => {
  // Przesunięcie `landColoredNeutralMax` z 2 na 3 sprawia, że 3 źródła {G}
  // wciąż są „neutralne" (8) zamiast „niskie" (−6) — 12 zamiast 31.
  const state = base({ hand: [FOREST, 'highland-game'], board: [FOREST, FOREST] });
  assert.equal(scoreOf(state, 'resolve_discard_choice(h0)'), 31);
  assert.equal(scoreOf(state, 'resolve_discard_choice(h0)', { landColoredNeutralMax: 3 }), 12);
});

test('PMSSB-26/C5: cztery stopnie są monotoniczne (im więcej źródeł, tym chętniej oddajemy)', () => {
  const st = (n) => base({ hand: [FOREST, 'highland-game'], board: Array(Math.max(0, n - 1)).fill(FOREST) });
  const a = scoreOf(st(1), 'resolve_discard_choice(h0)');
  const b = scoreOf(st(2), 'resolve_discard_choice(h0)');
  const c = scoreOf(st(3), 'resolve_discard_choice(h0)');
  const d = scoreOf(st(5), 'resolve_discard_choice(h0)');
  assert.ok(a < b && b < c && c <= d, `drabina niemonotoniczna: ${a}, ${b}, ${c}, ${d}`);
  assert.deepEqual([a, b, c], [2, 12, 31]);
});
