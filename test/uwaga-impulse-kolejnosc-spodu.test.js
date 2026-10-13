// =============================================================================
// Uwaga właściciela F (2026-10-12): Impulse ma po wyborze jednej z czterech
// kart do ręki poprowadzić przez kolejność trzech pozostałych na spodzie.
// Gracz klika OD SAMEGO DOŁU: pierwszy klik = najniższa karta, drugi = druga
// od dołu, trzeci = trzecia od dołu. UI nie może pokazywać ani engine
// generować 3! permutacji; składa jedną komendę dopiero na końcu wizarda.
// =============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { MiniEl, withDocument } from './harness/css-effective.js';
import * as choiceUi from '../src/table/choice-request.js';

const registry = createCardRegistry();
const { lookWizardKindOf } = choiceUi;
const renderPickOneRestBottomWizard = choiceUi.renderPickOneRestBottomWizard;

function put(state, id, cardId, playerId = 'p1', zone = 'library') {
  const def = registry.get(cardId);
  assert.ok(def, `${cardId} istnieje w prawdziwym rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId,
    zone, ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes, keywords: def.keywords,
  });
  return state.objects.get(id);
}

function impulseAtDecision() {
  const state = createGameState({ seed: 1210, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';

  // Kolejność zones.library jest od wierzchu do spodu. Cztery różne nazwy
  // sprawiają, że test przechodzi przez prawdziwe etykiety wizarda.
  for (const [id, cardId] of [
    ['top-forest', 'basic-forest'], ['top-mountain', 'basic-mountain'],
    ['top-plains', 'basic-plains'], ['top-swamp', 'basic-swamp'],
    ['p1-filler-a', 'basic-island'], ['p1-filler-b', 'basic-island'],
  ]) put(state, id, cardId, 'p1');
  for (let i = 0; i < 6; i++) put(state, `p2-lib-${i}`, 'basic-island', 'p2');
  put(state, 'impulse-in-hand', 'impulse', 'p1', 'hand');

  addMana(state, 'p1', 2, { colors: ['U'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((cmd) => cmd.type === 'cast_spell' && cmd.objectId === 'impulse-in-hand');
  assert.ok(cast, 'prawdziwy Impulse można rzucić');
  assert.ok(execute(state, cast).ok, 'rzut zaakceptowany');
  for (let i = 0; i < 12 && !state.pendingLookTopN; i++) {
    const pass = playerView(state, state.turn.priorityPlayerId).legalCommands
      .find((cmd) => cmd.type === 'pass_priority');
    assert.ok(pass, `pass ${i} istnieje`);
    assert.ok(execute(state, pass).ok, `pass ${i} zaakceptowany`);
  }
  assert.ok(state.pendingLookTopN, 'rozstrzygnięcie Impulse otwiera decyzję');
  return state;
}

const all = (el, out = []) => {
  if (el) out.push(el);
  for (const child of el.children ?? []) all(child, out);
  return out;
};
const buttons = (host) => all(host).filter((el) => el.tagName === 'button');
const buttonWith = (host, fragment) => {
  const found = buttons(host).find((el) => String(el.textContent).includes(fragment));
  assert.ok(found, `brak przycisku „${fragment}”; są: ${buttons(host).map((el) => el.textContent).join(' | ')}`);
  return found;
};
const orderButtons = (host) => buttons(host).filter((el) => /\d+\. od dołu:/.test(String(el.textContent)));

function cardsForWizard(view) {
  return view.pendingLookTopN.cards.map((card) => ({
    id: card.id,
    cardId: card.cardId,
    name: registry.get(card.cardId)?.name ?? card.cardId,
  }));
}

test('F/routing: tylko look_top z resztą na spód dostaje sekwencyjny wizard', () => {
  const options = ['a', 'b', 'c', 'd'].map((cardId) => ({
    type: 'resolve_look_top_choice', playerId: 'p1', cardId,
  }));
  const bottom = {
    playerId: 'p1',
    pendingLookTopN: {
      playerId: 'p1', restTo: 'library_bottom', pickTo: 'hand',
      cards: options.map(({ cardId }) => ({ id: cardId, cardId })),
    },
  };
  assert.equal(lookWizardKindOf({ options }, bottom), 'pick-one-rest-bottom');
  assert.equal(lookWizardKindOf({ options }, {
    ...bottom,
    pendingLookTopN: { ...bottom.pendingLookTopN, restTo: 'graveyard' },
  }), null, 'Gurmag Drowner nie potrzebuje sortera spodu');
  assert.equal(lookWizardKindOf({ options }, {
    playerId: 'p2', pendingLookTopN: { ...bottom.pendingLookTopN, cards: null },
  }), null, 'przeciwnik nie dostaje wizarda cudzej ukrytej decyzji');
});

test('F/pełny Impulse: 4 wybory, potem 3→2→1 klików od dna i jedna komenda', () => {
  assert.equal(typeof renderPickOneRestBottomWizard, 'function', 'publiczny adapter wspólnego renderPeekWizard istnieje');
  const state = impulseAtDecision();
  const view = playerView(state, 'p1');
  const options = view.legalCommands.filter((cmd) => cmd.type === 'resolve_look_top_choice');

  assert.equal(view.pendingLookTopN.restTo, 'library_bottom', 'widok niesie rodzaj decyzji potrzebny routingowi');
  assert.equal(options.length, 4, 'engine oferuje tylko cztery wybory karty, nie 4×3! permutacji');
  assert.ok(options.every((cmd) => !Object.hasOwn(cmd, 'bottomOrder')),
    'legalCommands nie enumerują żadnej kolejności spodu');
  assert.equal(lookWizardKindOf({ options }, view), 'pick-one-rest-bottom');

  const sent = [];
  withDocument(() => {
    const host = new MiniEl('div');
    renderPickOneRestBottomWizard(host, {
      cards: cardsForWizard(view),
      pickTo: view.pendingLookTopN.pickTo,
      sourceName: 'Impulse',
      onComplete: (built) => sent.push(built),
    });

    // Jedna opcja na każdą z czterech kart, bez „żadna” i bez permutacji.
    const pickOptions = buttons(host).filter((el) => /do ręki/.test(String(el.textContent)));
    assert.equal(pickOptions.length, 4);
    buttonWith(host, 'Mountain do ręki').click();

    // Pierwszy klik jest literalnie kartą na SAMYM DOLE.
    assert.equal(orderButtons(host).length, 3, 'pierwszy krok pokazuje trzy pojedyncze karty');
    buttonWith(host, '1. od dołu: Forest').click();
    assert.equal(orderButtons(host).length, 2, 'drugi krok pokazuje tylko dwie pozostałe karty');
    buttonWith(host, '2. od dołu: Plains').click();
    assert.equal(orderButtons(host).length, 1, 'ostatni krok pokazuje jedną pozostałą kartę');
    buttonWith(host, '3. od dołu: Swamp').click();
  });

  assert.deepEqual(sent, [{
    cardId: 'top-mountain',
    // Engine dopina tablicę od najbliższej wierzchu do samego dna, zatem
    // kliknięcia „Forest, Plains, Swamp” są odwrócone w payloadzie.
    bottomOrder: ['top-swamp', 'top-plains', 'top-forest'],
  }], 'wizard wysyła dokładnie jedną pełną komendę po ostatnim kliknięciu');

  const result = execute(state, {
    type: 'resolve_look_top_choice', playerId: 'p1', ...sent[0],
  });
  assert.ok(result.ok, JSON.stringify(result.events));
  const ownLibrary = state.zones.library.filter((id) => state.objects.get(id)?.controllerId === 'p1');
  assert.deepEqual(ownLibrary.slice(-3), ['top-swamp', 'top-plains', 'top-forest'],
    'od końca: Forest jest na samym dole, Plains druga, Swamp trzecia od dołu');
  assert.equal(state.objects.get(ownLibrary.at(-1))?.cardId, 'basic-forest', 'pierwszy klik = samo dno');
  assert.ok([...state.objects.values()].some((o) => o.zone === 'hand' && o.cardId === 'basic-mountain'),
    'wybrana karta jest w ręce');
  assert.ok([...state.objects.values()].some((o) => o.zone === 'graveyard' && o.cardId === 'impulse'),
    'po decyzji Impulse kończy rozstrzyganie i trafia do grobu');
});

test('F/rodzina: Clone Shell zmienia cel wyboru, ale używa tego samego sortera', () => {
  assert.equal(typeof renderPickOneRestBottomWizard, 'function');
  const payloads = [];
  withDocument(() => {
    const host = new MiniEl('div');
    renderPickOneRestBottomWizard(host, {
      cards: [
        { id: 'a', cardId: 'basic-forest', name: 'Forest' },
        { id: 'b', cardId: 'basic-island', name: 'Island' },
        { id: 'c', cardId: 'basic-swamp', name: 'Swamp' },
        { id: 'd', cardId: 'basic-plains', name: 'Plains' },
      ],
      pickTo: 'exile_face_down_linked',
      sourceName: 'Clone Shell',
      onComplete: (built) => payloads.push(built),
    });
    assert.doesNotMatch(String(host.textContent), /do ręki/, 'wariant wygnania nie kłamie etykietą ręki');
    buttonWith(host, 'Forest — wygnaj zakrytą').click();
    buttonWith(host, '1. od dołu: Island').click();
    buttonWith(host, '2. od dołu: Swamp').click();
    buttonWith(host, '3. od dołu: Plains').click();
  });
  assert.deepEqual(payloads, [{ cardId: 'a', bottomOrder: ['d', 'c', 'b'] }]);
});

test('F/bez pozornej decyzji: przy jednej karcie reszty wybór od razu domyka wizard', () => {
  assert.equal(typeof renderPickOneRestBottomWizard, 'function');
  const payloads = [];
  withDocument(() => {
    const host = new MiniEl('div');
    renderPickOneRestBottomWizard(host, {
      cards: [
        { id: 'a', cardId: 'basic-forest', name: 'Forest' },
        { id: 'b', cardId: 'basic-island', name: 'Island' },
      ],
      onComplete: (built) => payloads.push(built),
    });
    buttonWith(host, 'Forest do ręki').click();
  });
  assert.deepEqual(payloads, [{ cardId: 'a', bottomOrder: ['b'] }],
    'jedyna możliwa kolejność jest uzupełniona bez dodatkowego kroku');
});

test('F/architektura: adapter używa wspólnego wizarda, a main wysyła zbudowaną komendę', () => {
  const choices = readFileSync(new URL('../src/table/choice-request.js', import.meta.url), 'utf8');
  const start = choices.indexOf('export function renderPickOneRestBottomWizard(');
  const end = choices.indexOf('// =============================================================================', start);
  const adapter = choices.slice(start, end);
  assert.ok(start >= 0 && end > start, 'adapter istnieje jako wydzielone publiczne wejście');
  assert.match(adapter, /return renderPeekWizard\(host, \{/,
    'nowa rodzina parametryzuje istniejący sekwencyjny silnik');
  assert.doesNotMatch(adapter, /choiceNode\(|renderPickerRow\(/,
    'adapter nie kopiuje rysownika ani listy opcji');

  const main = readFileSync(new URL('../src/table/main.js', import.meta.url), 'utf8');
  const route = main.indexOf("if (lookKind === 'pick-one-rest-bottom')");
  const render = main.indexOf('renderPickOneRestBottomWizard(', route);
  const play = main.indexOf("play({ type: 'resolve_look_top_choice'", render);
  assert.ok(route >= 0 && render > route && play > render,
    'produkcyjny routing otwiera wizard i wysyła jego jedną kompletną komendę');
});

test('F/FoW: rodzaj decyzji jest publiczny, obejrzane karty tylko dla decydenta', () => {
  const state = impulseAtDecision();
  const owner = playerView(state, 'p1').pendingLookTopN;
  const foe = playerView(state, 'p2').pendingLookTopN;
  assert.equal(owner.restTo, 'library_bottom');
  assert.equal(foe.restTo, 'library_bottom', 'miejsce reszty nie jest tajną informacją');
  assert.equal(owner.cards.length, 4);
  assert.equal(foe.cards, null, 'tożsamości obejrzanych kart nie przeciekają przeciwnikowi');
});
