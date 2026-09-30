// PMSSB-25 (mikro-pętla, metoda M429) — koszt „odrzuć kartę" a wspólna miara.
//
// Pomiar PRZED (sonda /home/user/scratch/pmssb25-discard-przed.mjs, tabela
// w planie docs/plans/PLAN_2026-09-30b-pmssb25-discard.md):
//   F1 (L41) — przy koszcie odrzucenia działa DRUGA, równoległa miara jakości
//     karty (`handCardKeepValue`, M408/D: ciało + keywordy + zdolności), która
//     nie zna zasięgu many, nasycenia lądów ani duplikatów — czyli tego, co
//     wspólna `cardKeepValue` liczy dla scry/surveil/mill/look_top/clash.
//     Pomiar: przy 2 lasach bot trzymał Woolly Loxodona {5}{G}{G} (−1 pkt)
//     i odrzucał grywalnego Highland Game 2/1 (14 pkt), choć wspólna miara
//     mówi o bombie −3 (koszt 7 > zasięg+2); zbędny land przy 6 lądach na
//     stole dostawał 19 pkt z powodu „land ma manaCost 0", nie z powodu
//     przesycenia.
//   Kotwica właściciela (M408, NIE ruszana): karty, których nie da się rzucić
//     z braku KOLORU many, idą na pierwszy ogień (25 − wartość/2). Pomiar D2/D5
//     pokazał, że ta gałąź działa poprawnie (40 pkt dla karty bez koloru) —
//     audyt zaczął się od podejrzenia, że to błąd duplikatów, i został
//     sprostowany przez pomiar.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

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

/** Stół z oczekującą decyzją „odrzuć jedną kartę jako koszt". */
function base({ hand, lands = 0 }) {
  const state = createGameState({ seed: 25, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  const ids = hand.map((cardId, i) => putCard(state, `h${i}`, cardId));
  for (let i = 0; i < lands; i += 1) putCard(state, `land${i}`, 'basic-forest', 'battlefield');
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

test('PMSSB-25/A1: karta poza zasięgiem many idzie na pierwszy ogień, nie grywalny stwór', () => {
  // 2 lasy: Woolly Loxodon {5}{G}{G} jest grywalny ZA ~5 tur (wspólna miara
  // −3), Highland Game 2/1 za {2} teraz. PRZED: bomba −1, stwór 14 — bot
  // odrzucał grywalną kartę i trzymał martwą. PO: 28 vs 14.
  const state = base({ hand: ['woolly-loxodon', 'highland-game', 'highland-game'], lands: 2 });
  assert.equal(scoreOf(state, 'resolve_discard_choice(h0)'), 28);
  assert.equal(scoreOf(state, 'resolve_discard_choice(h1)'), 14);
  assert.equal(wybrana(state), 'h0', 'bot ma odrzucić kartę poza zasięgiem');
});

test('PMSSB-25/A2: zbędny land jest odrzucany z POWODU przesycenia danego pipa', () => {
  // PMSSB-26: przesycenie liczymy PER PIP (specyfikacja właściciela), nie po
  // sumie lądów. 2 lasy na stole + oceniany las w ręce = 3 źródła {G} ⇒
  // wspólna miara mówi −6 ⇒ 6 + discardUnwantedBonus(5) = 11 ⇒ 20 + 11 = 31.
  // PRZED: 19 pkt wyłącznie dlatego, że land ma manaCost 0 (reguła ciała nic
  // o nim nie wiedziała). Przewaga nad grywalnym stworem (11) jest wyraźna.
  const state = base({ hand: ['basic-forest', 'highland-game'], lands: 2 });
  assert.equal(scoreOf(state, 'resolve_discard_choice(h0)'), 31);
  assert.equal(scoreOf(state, 'resolve_discard_choice(h1)'), 11);
});

test('PMSSB-25/A3 (kotwica M408): reguła braku KOLORU many zostaje nietknięta', () => {
  // Właściciel (2026-09-22): „Powinien odrzucać tylko takie karty, których nie
  // może rzucić z powodu braku many danego koloru". Illusory Demon przy samych
  // lasach jest bez koloru ⇒ 40 pkt i to on idzie pierwszy — tak jak PRZED.
  const state = base({ hand: ['highland-game', 'highland-game', 'highland-game', 'illusory-demon'], lands: 3 });
  assert.equal(scoreOf(state, 'resolve_discard_choice(h3)'), 40);
  assert.equal(scoreOf(state, 'resolve_discard_choice(h0)'), 14);
  assert.equal(wybrana(state), 'h3', 'karta bez koloru idzie na pierwszy ogień');
});

test('PMSSB-25/A4: karta grywalna bierze LEPSZĄ z dwóch miar (PMSSB-26)', () => {
  // Pierwotnie ten pin mówił „karty grywalne bez zmian", bo gałąź wspólnej
  // miary zapalała się tylko dla wartości ujemnych. PMSSB-26 domknął lukę L41
  // od drugiej strony: `-min(30, max(ciało, wspólna))`. Highland Game 2/1 ma
  // ciało 5, a wspólna miara 9 (4 + min(5,8) − 0) ⇒ 20 − 9 = 11. Reguła ciała
  // pozostaje suwitem dla dużych ciał (6/6 = 18 > 12), więc zmiana jest
  // ograniczona do kart, o których ciało milczy — landów i tanich kart.
  const state = base({ hand: ['highland-game', 'zoraline'], lands: 3 });
  assert.equal(scoreOf(state, 'resolve_discard_choice(h0)'), 11);
});

test('PMSSB-25/A5: discardUnwantedBonus ×0 zostawia samą wartość wspólnej miary', () => {
  // Bez dopłaty karta poza zasięgiem i tak wygrywa (20 + 3 = 23 > 14) —
  // dopłata tylko powiększa margines, nie zmienia kierunku decyzji.
  const state = base({ hand: ['woolly-loxodon', 'highland-game'], lands: 2 });
  assert.equal(scoreOf(state, 'resolve_discard_choice(h0)', { discardUnwantedBonus: 0 }), 23);
  assert.equal(scoreOf(state, 'resolve_discard_choice(h0)'), 28);
});
