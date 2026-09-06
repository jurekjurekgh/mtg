// AUDYT PR #100 (sesja arena/01a07682, znalezisko A1) — L1/L102/L131.
//
// `playerView` projekcjonuje bibliotekę i cudzą rękę jako
// `{ id, controllerId, hidden: true }` — BEZ `kind`/`manaCost`/`power`/
// `toughness` (granica FoW, ADR 0003). PR #100 postawił na tym wyceny
// `resolve_search_choice`, `resolve_satyr_look_choice`, `resolve_manifest_dread`
// i `resolve_reveal_exile_hand`: lookup TRAFIA w wpis (jest truthy, więc
// `if (!card) return 0` nie oddziela się), ale pola karty są `undefined` →
// `?? 0` zeruje różnice → wszyscy kandydaci ex aequo → decyduje KOLEJNOŚĆ
// ofert. To nie jest uczciwy remis (klasa L1), tylko ślepota, i — co gorsza —
// `tieProjection` czytał to samo źródło, więc `tools/bot-tie-audit.mjs`
// ogłaszał takie remisy za „równoważne" (fałszywa zieleń, L119).
//
// Naprawa: JEDNO źródło danych = payload decyzji (`decisionCandidateCard`),
// używany tak w wycenie, jak w projekcji (L131). Gdzie payloadu nie było
// (`pendingSatyrLook`, `pendingRevealExile`) — widok go dostaje, wyłącznie
// decydentowi (wzorzec `pendingManifestDread` M223: „look at" = informacja
// własna; ujawnione karty zna tylko adresat ujawnienia).
//
// RED→GREEN: przed naprawą testy 1–3 są czerwone (identyczne punkty), 4 jest
// czerwony (brak `cards` w widoku), 5 (strażnik źródła) czerwony (9 lookupów
// w strefach ukrytych).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createGameState, playerView, addObject } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

function stół({ mana = 0 } = {}) {
  const state = createGameState({ seed: 41, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  if (mana > 0) addMana(state, 'p1', mana);
  return state;
}

function kartaBiblioteki(state, id, { cardId, kind, manaCost, power, toughness }) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: 'p1', ownerId: 'p1', zone: 'library',
    kind, types: kind === 'land' ? ['Land'] : ['Creature'], colors: kind === 'land' ? [] : ['R'],
    manaCost, power: power ?? null, toughness: toughness ?? null, subtypes: [], abilities: [], keywords: [],
  });
  return id;
}

const punkty = (state, playerId = 'p1') => {
  const bot = createHeuristicBot({ seed: 5 });
  const cmd = bot.chooseCommand(playerView(state, playerId));
  return { cmd, wpis: bot.trace().at(-1) };
};

test('A1/manifest dread: gorsza karta dostaje niższy koszt utraty, czyli WYŻSZY wynik manifestu', () => {
  const state = stół();
  // Manabazę dociągamy do zasięgu drogiej karty: bez niej `cardKeepValue`
  // słusznie uznaje 6-drop za martwy ciężar i to nim handluje — test mierzy
  // wtedy różnicę ciał, a nie model zasięgu (który ma swoje testy).
  for (let i = 0; i < 5; i += 1) {
    addObject(state, {
      id: `las${i}`, instanceId: `i-las${i}`, cardId: 'basic-forest', controllerId: 'p1', ownerId: 'p1',
      zone: 'battlefield', kind: 'land', manaCost: 0, types: ['Basic', 'Land'], subtypes: ['Forest'],
      colors: [], abilities: [], keywords: [],
    });
  }
  kartaBiblioteki(state, 'top-bad', { cardId: 'goblin-piker', kind: 'creature', manaCost: 1, power: 1, toughness: 1 });
  kartaBiblioteki(state, 'top-good', { cardId: 'goblin-piker', kind: 'creature', manaCost: 6, power: 6, toughness: 6 });
  state.pendingManifestDread = {
    playerId: 'p1', objectIds: ['top-bad', 'top-good'], sourceCardId: 'manifest-dread',
    restorePriorityTo: 'p1',
  };
  const { cmd, wpis } = punkty(state);
  assert.equal(cmd.type, 'resolve_manifest_dread', 'decyzja manifest dread');
  const zle = wpis.options.filter((o) => o.cmd.includes('resolve_manifest_dread'));
  assert.ok(zle.length >= 2, 'dwa warianty do wyboru');
  assert.notEqual(zle[0].score, zle[1].score, `wyceny muszą się różnić, były: ${zle.map((o) => o.score).join(' vs ')}`);
  assert.equal(cmd.cardId, 'top-bad', 'manifestujemy SŁABSZĄ kartę, mocną zachowując');
});

test('A1/szukanie: odróżnienie lądu od stwora nie może zależeć od kolejności ofert', () => {
  const state = stół();
  kartaBiblioteki(state, 's-land', { cardId: 'basic-forest', kind: 'land', manaCost: 0 });
  kartaBiblioteki(state, 's-big', { cardId: 'goblin-piker', kind: 'creature', manaCost: 6, power: 5, toughness: 5 });
  state.pendingSearchChoice = {
    playerId: 'p1', qualifier: {}, destination: 'hand', mandatory: false,
    candidateIds: ['s-land', 's-big'], sourceCardId: 'cor-cartographer',
    restorePriorityTo: 'p1',
  };
  const { cmd, wpis } = punkty(state);
  assert.equal(cmd.type, 'resolve_search_choice');
  // Tylko warianty „znajdź kartę" — odmowa (found: null) ma własną, niższą
  // punktację i nie może sama z siebie różnicować kandydatów.
  const warianty = wpis.options.filter((o) => /resolve_search_choice\(s-/.test(o.cmd));
  const unikalne = new Set(warianty.map((o) => o.score));
  assert.ok(unikalne.size >= 2, `kandydaci o INNYCH danych muszą mieć różne punkty, było: ${warianty.map((o) => `${o.cmd}=${o.score}`).join(', ')}`);
  assert.equal(cmd.found, 's-land', 'ląd do ręki = pewna mana (intencja wyceny z komentarza)');
});

test('A1/reveal-exile: wygnanie z odsłoniętej ręki wroga liczy się wartością karty wroga', () => {
  const state = stół();
  for (const [id, manaCost, power, toughness] of [['p2-cheap', 1, 1, 1], ['p2-pricey', 6, 6, 6]]) {
    addObject(state, {
      id, instanceId: `i-${id}`, cardId: 'goblin-piker', controllerId: 'p2', ownerId: 'p2', zone: 'hand',
      kind: 'creature', types: ['Creature'], colors: ['R'], manaCost, power, toughness,
      subtypes: [], abilities: [], keywords: [],
    });
  }
  state.pendingRevealExile = {
    playerId: 'p1', opponentId: 'p2', cardId: 'dreams-of-steel-and-oil',
    handIds: ['p2-cheap', 'p2-pricey'], graveIds: [], chosenHand: null, chosenGrave: null,
    stage: 'hand', restorePriorityTo: 'p1',
  };
  const { cmd, wpis } = punkty(state);
  assert.equal(cmd.type, 'resolve_reveal_exile_hand');
  const warianty = wpis.options.filter((o) => o.cmd.includes('resolve_reveal_exile_hand'));
  assert.ok(new Set(warianty.map((o) => o.score)).size >= 2,
    `kandydaci o różnej wartości muszą się różnić punktem, było: ${warianty.map((o) => `${o.cmd}=${o.score}`).join(', ')}`);
  assert.equal(cmd.cardId, 'p2-pricey', 'wygnań najcenniejszą kartę wroga');
});

test('A1/widok: odsłonięte karty satyra i ujawnionej ręki trafiają do payloadu decyzji (decydent, nie wróg)', () => {
  const state = stół();
  const land = kartaBiblioteki(state, 'lib-land', { cardId: 'basic-forest', kind: 'land', manaCost: 0 });
  kartaBiblioteki(state, 'lib-creature', { cardId: 'goblin-piker', kind: 'creature', manaCost: 2, power: 2, toughness: 2 });
  state.pendingSatyrLook = {
    playerId: 'p1', objectIds: [land, 'lib-creature'], landIds: [land],
    sourceCardId: 'satyr-wayfinder', restorePriorityTo: 'p1',
  };
  const view = playerView(state, 'p1');
  const cards = view.pendingSatyrLook?.cards;
  assert.ok(Array.isArray(cards), 'widok decyzji satyra niesie karty dla decydenta');
  const ląd = cards.find((c) => c.id === land);
  assert.equal(ląd?.kind, 'land', 'wpis ma faktyczne pola karty (nie sam identyfikator)');
  const obcy = playerView(state, 'p2');
  assert.equal(obcy.pendingSatyrLook?.cards ?? null, null, 'FoW: wróg nie widzi naszych odsłoniętych kart');
});

test('A1/strażnik źródła (L131): wycena i projekcja nie czytają pól karty ze stref ukrytych', () => {
  const sciezka = fileURLToPath(new URL('../src/controllers/heuristic-bot.js', import.meta.url));
  const zrodlo = readFileSync(sciezka, 'utf8');
  // `zones.library.find(...)?.<pole karty>` w grze oznacza lookup w ukrytej
  // strefie: wpis istnieje, ale nie ma pól → wycena jest WYŁĄCZONA (L78/L5),
  // nie neutralna. Wszystkie rodziny `resolve_*` muszą iść przez helper
  // `decisionCandidateCard`, który czyta payload decyzji.
  assert.ok(!/zones\.library\.find\(/.test(zrodlo),
    'heuristic-bot nie może wyceniać kart z view.zones.library — dane są w payloadzie decyzji');
  const helperIdx = zrodlo.indexOf('const decisionCandidateCard');
  assert.ok(helperIdx > 0, 'helper jednego źródła istnieje');
  for (const rodzina of ['resolve_search_choice', 'resolve_satyr_look_choice', 'resolve_manifest_dread', 'resolve_reveal_exile_hand', 'resolve_discard_choice']) {
    const start = zrodlo.indexOf(`case '${rodzina}'`);
    assert.ok(start > 0, `wycena ${rodzina} istnieje`);
    const wycena = zrodlo.slice(start, zrodlo.indexOf('\n      case ', start + 1));
    assert.ok(wycena.includes('decisionCandidateCard('), `${rodzina}: wycena czyta payload decyzji`);
    const startProj = zrodlo.indexOf(`'${rodzina}'`, zrodlo.indexOf('function tieProjection'));
    assert.ok(startProj > 0, `projekcja ${rodzina} istnieje`);
    const projekcja = zrodlo.slice(startProj, zrodlo.indexOf('\n    }', startProj) + 1);
    assert.ok(projekcja.includes('decisionCandidateCard('), `${rodzina}: projekcja czyta to samo źródło co wycena`);
  }
});
