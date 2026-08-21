// M162 — uwagi właściciela z testów (2026-08-20):
//
// B. Ghoulcaller's Bell ({T}: each player mills 1) — bot aktywował dzwonek
//    w KAŻDEJ turze, także gdy miał MNIEJ kart w bibliotece od gracza:
//    efekt mill_both_players nie miał żadnej wyceny, więc {T} warte bazowe
//    +2 wygrywało z passem (0) i bot prowadził się do deck-outu.
//    Wycena wyścigu bibliotek: wolno dzwonić tylko PROWADZĄC w kartach.
// C. Chittering Rats — ETB u BOTA otwiera u gracza modal
//    „Karta z ręki na wierzch (1 z 5)…" bez nazw kart. Ręka wybierającego
//    jest dla niego jawna (FoW), więc etykieta ma nazywać KARTĘ, a tytuł
//    modala — ŹRÓDŁO decyzji (precedens pendingTriggerTarget, uwagi B/C
//    właściciela 2026-08-10). Przegląd pozostałych resolve_*: wszystkie
//    inne modale kartowe nazywają kartę/cel — jedyny brak to
//    resolve_hand_top_choice (bez case w commandLabel).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { commandLabel, choiceGroupTitle } from '../src/table/render.js';
import { populateDeckSelects } from '../src/table/deck-selects.js';

const REGISTRY = createCardRegistry();

function game(playerId = 'p1') {
  const state = createGameState({ seed: 162, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function putCard(state, id, cardId, controllerId, zone = 'battlefield') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  return state.objects.get(id);
}

const SESSION = {
  nameOf: (cardId) => REGISTRY.get(cardId)?.name ?? cardId,
  nameOfObject: (id) => id,
  cardDetails: (cardId) => REGISTRY.get(cardId) ?? null,
  colorsOf: (cardId) => REGISTRY.get(cardId)?.colors ?? [],
  abilitiesOf: (cardId) => REGISTRY.get(cardId)?.abilities ?? [],
  log: [], reasoning: [], state: { seed: 1, objects: new Map() },
};

const strip = (text) => String(text).replace(/<[^>]*>/g, '');

// ---- B: Ghoulcaller's Bell — wycena wyścigu bibliotek ------------------------

/** Stół: dzwonek bota (p1), biblioteki p1/p2 o zadanych rozmiarach, nic więcej. */
function bellView(myLib, foeLib) {
  const state = game('p1');
  putCard(state, 'bell', 'ghoulcallers-bell', 'p1', 'battlefield');
  for (let i = 0; i < myLib; i += 1) putCard(state, `mylib${i}`, 'highland-game', 'p1', 'library');
  for (let i = 0; i < foeLib; i += 1) putCard(state, `foelib${i}`, 'highland-game', 'p2', 'library');
  const view = playerView(state, 'p1');
  assert.ok(view.legalCommands.some((c) => c.type === 'activate_ability' && c.objectId === 'bell'),
    'aktywacja Bella jest w ofercie (ruch legalny)');
  return view;
}

test('B1: bot z MNIEJSZĄ biblioteką NIE dzwoni Bellem (prowadzi się do zguby)', () => {
  const chosen = createHeuristicBot({ seed: 1 }).chooseCommand(bellView(10, 30));
  assert.notEqual(chosen.type, 'activate_ability',
    `przegrywając wyścig o karty bot nie może dzwonić, a wybrał: ${JSON.stringify(chosen)}`);
});

test('B2: równe biblioteki — dzwonienie to moneta z graczem, bot rezygnuje', () => {
  const chosen = createHeuristicBot({ seed: 1 }).chooseCommand(bellView(20, 20));
  assert.notEqual(chosen.type, 'activate_ability',
    `przy remisie bot nie powinien ryzykować deck-outu, a wybrał: ${JSON.stringify(chosen)}`);
});

test('B3: bot z WIĘKSZĄ biblioteką MOŻE dzwonić (agresja wyścigu)', () => {
  const chosen = createHeuristicBot({ seed: 1 }).chooseCommand(bellView(30, 10));
  assert.equal(chosen.type, 'activate_ability',
    `prowadząc 30:10 bot powinien dzwonić (zysk), a wybrał: ${JSON.stringify(chosen)}`);
});

test('B4: ostatnia karta własnej biblioteki — NIGDY (natychmiastowa przegrana)', () => {
  const chosen = createHeuristicBot({ seed: 1 }).chooseCommand(bellView(1, 40));
  assert.notEqual(chosen.type, 'activate_ability',
    `mildowanie ostatniej karty to samobójstwo, a wybrał: ${JSON.stringify(chosen)}`);
});

// ---- C: Chittering Rats — modal z nazwami kart i źródłem ---------------------

/** p2 rzuca Chittering Rats; ETB otwiera u p1 decyzję resolve_hand_top_choice. */
function ratsEtbPending(state) {
  putCard(state, 'rats', 'chittering-rats', 'p2', 'hand');
  addMana(state, 'p2', 3, { colors: ['B'] });
  const cast = playerView(state, 'p2').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'rats');
  assert.ok(cast, 'oferta rzutu Ratsów');
  assert.ok(execute(state, cast).ok);
  for (let i = 0; i < 12; i += 1) {
    const pending = state.pendingTriggerTargets?.[0];
    if (pending) {
      assert.ok(execute(state, { type: 'resolve_trigger_target', playerId: pending.playerId, targetId: 'p1' }).ok);
      continue;
    }
    if (state.zones.stack.length > 0) {
      assert.ok(execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId }).ok);
      continue;
    }
    break;
  }
  assert.ok(state.pendingHandTopChoice, 'decyzja hand-top otwarta u p1');
  assert.equal(state.pendingHandTopChoice.playerId, 'p1');
  return state;
}

test('C1: ETB Ratsów u bota — każda opcja modala nazywa KARTĘ z ręki gracza', () => {
  const state = game('p2');
  putCard(state, 'h1', 'brute-force', 'p1', 'hand');
  putCard(state, 'h2', 'curate', 'p1', 'hand');
  putCard(state, 'h3', 'enter-the-enigma', 'p1', 'hand');
  putCard(state, 'h4', 'village-rites', 'p1', 'hand');
  putCard(state, 'h5', 'forever-young', 'p1', 'hand');
  ratsEtbPending(state);
  const view = playerView(state, 'p1');
  const offers = view.legalCommands.filter((c) => c.type === 'resolve_hand_top_choice');
  assert.equal(offers.length, 5, 'pięć kart w ręce = pięć opcji');
  const labels = offers.map((cmd) => strip(commandLabel(cmd, SESSION, view)));
  for (const name of ['Brute Force', 'Curate', 'Enter the Enigma', 'Village Rites', 'Forever Young']) {
    assert.ok(labels.some((label) => label.includes(name)), `etykieta nazywa ${name}: [${labels}]`);
  }
  assert.equal(new Set(labels).size, 5, 'różne karty = różne etykiety (bez numerowania „(1 z 5)”)');
  for (const label of labels) assert.ok(!/\(\d+ z \d+\)/.test(label), `bez numerowania w ciemno: ${label}`);
});

test('C2: tytuł modala nazywa ŹRÓDŁO decyzji (Chittering Rats), widok tylko właściciela', () => {
  const state = game('p2');
  putCard(state, 'h1', 'brute-force', 'p1', 'hand');
  ratsEtbPending(state);
  const view = playerView(state, 'p1');
  const offers = view.legalCommands.filter((c) => c.type === 'resolve_hand_top_choice');
  assert.ok(offers.length > 0);
  // Źródło (karta publiczna na polu bitwy) jest wystawione WŁAŚCICIELOWI decyzji.
  assert.equal(view.pendingHandTopChoice?.sourceCardId, 'chittering-rats',
    'playerView niesie sourceCardId pendingu dla wybierającego');
  assert.equal(playerView(state, 'p2').pendingHandTopChoice, null,
    'przeciwnik nie dostaje pendingu (FoW — tylko właściciel decyzji)');
  const title = choiceGroupTitle({ id: 't', type: 'target', options: offers }, SESSION, view);
  assert.ok(strip(title).includes('Chittering Rats'),
    `tytuł modala nazywa źródło decyzji, a jest: ${strip(title)}`);
});

test('C3: decyzja działa po wyborze (karta ląduje na wierzchu biblioteki)', () => {
  const state = game('p2');
  putCard(state, 'h1', 'brute-force', 'p1', 'hand');
  ratsEtbPending(state);
  const view = playerView(state, 'p1');
  const chosen = view.legalCommands.find((c) => c.type === 'resolve_hand_top_choice' && c.cardId === 'h1');
  assert.ok(execute(state, chosen).ok);
  assert.equal(state.pendingHandTopChoice, null, 'decyzja zamknięta');
  const onTop = state.zones.library.find((id) => state.objects.get(id)?.controllerId === 'p1');
  assert.equal(state.objects.get(onTop)?.cardId, 'brute-force', 'wybrana karta NA WIERZCHU biblioteki');
});

// ---- A: zdublowane talie w pliku zapisanym „Zapisz jako..." --------------------
//
// Właściciel: duble występują w wersji desktopowej — HTML ściągnięty
// „Zapisz jako..." i otwierany lokalnie. „Zapisz jako..." serializuje DOM
// PO uruchomieniu skryptu, więc <select> niesie już opcje runtime'owe;
// ponowne uruchomienie skryptu DOKŁADAŁO drugi komplet. Populacja ma być
// idempotentna (czyści select przed wypełnieniem).

class SelectMiniEl {
  constructor() {
    this.children = [];
    this.value = '';
  }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...nodes) { this.children = nodes.flat(); }
  get options() { return this.children; }
}
class OptionMiniEl {
  constructor() { this.value = ''; this.textContent = ''; }
}

test('A1: select z opcjami z poprzedniego uruchomienia (plik „Zapisz jako...") — dokładnie jeden komplet', () => {
  const before = globalThis.document;
  globalThis.document = { createElement: (tag) => new (tag === 'option' ? OptionMiniEl : SelectMiniEl)() };
  try {
    const repoDecks = { red: '# Red — singleton', black: '# Black — singleton', green: '# Green — singleton' };
    const select = new SelectMiniEl();
    // Symulacja zapisanego pliku: select już ma komplet opcji z runtime'u.
    for (const key of Object.keys(repoDecks).sort()) {
      const option = new OptionMiniEl();
      option.value = key;
      option.textContent = key;
      select.appendChild(option);
    }
    assert.equal(select.options.length, 3, 'pre: zapisany plik niesie 3 opcje w DOM');
    const keys = populateDeckSelects([select], repoDecks);
    assert.deepEqual(keys, ['black', 'green', 'red']);
    assert.equal(select.options.length, 3, `po ponownym uruchomieniu skryptu: 3 opcje, a nie ${select.options.length} (duble!)`);
    assert.deepEqual(select.options.map((o) => o.value), ['black', 'green', 'red']);
    assert.ok(select.options.every((o) => o.textContent.startsWith('#') === false), 'tytuły bez surowego #');
  } finally {
    globalThis.document = before;
  }
});

test('A2: podwójne wywołanie (idempotencja) i puste selecty startowe', () => {
  const before = globalThis.document;
  globalThis.document = { createElement: (tag) => new (tag === 'option' ? OptionMiniEl : SelectMiniEl)() };
  try {
    const repoDecks = { a: '# A', b: '# B' };
    const fresh = new SelectMiniEl(); // świeży artefakt: pusty select w HTML
    populateDeckSelects([fresh, null], repoDecks); // null-select pomijany
    populateDeckSelects([fresh], repoDecks); // drugi przebieg nic nie psuje
    assert.equal(fresh.options.length, 2, 'dwa wywołania = nadal 2 opcje');
    assert.deepEqual(fresh.options.map((o) => o.value), ['a', 'b']);
  } finally {
    globalThis.document = before;
  }
});
