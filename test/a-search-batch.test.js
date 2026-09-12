// A — zlecenie właściciela 2026-09-12: WSADOWE szukanie w bibliotece.
// Łańcuch szukań o identycznych parametrach (Springbloom Druid / Roiling
// Regrowth — „up to two basic lands") to JEDEN modal-stepper („wskaż do N
// kart łącznie"), nie seria modali pojedynczych. Silnik i bot NIETKNIĘTE —
// całość w UI: plan (searchBatchPlanOf) + kreator (renderSearchBatchWizard)
// + synchroniczna pętla submitu (main.js, decyzje per krok w searchBatchStepOf).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { queueSearchChoice } from '../src/engine/effects.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { searchBatchPlanOf, searchBatchStepOf } from '../src/table/multi-target.js';
import { renderSearchBatchWizard } from '../src/table/choice-request.js';

const BASIC = { types: ['Basic', 'Land'] };

// --- Plan: bramki batchowania -------------------------------------------

test('A/plan: łańcuch Springblooma (ten sam cel + kwalifikator) batchuje, maxPicks 2', () => {
  const plan = searchBatchPlanOf({
    destination: 'battlefield', qualifier: BASIC, mandatory: false,
    destinations: null, sourceCardId: 'springbloom-druid',
    chain: { remaining: 1, destination: 'battlefield', qualifier: BASIC, entersTapped: true },
  });
  assert.ok(plan?.searchBatchMode);
  assert.equal(plan.maxPicks, 2);
  assert.equal(plan.minPicks, 0, 'krok 0 opcjonalny: puste = rezygnacja z całości');
});

test('A/plan: Final Parting (ręka→grób, różne destynacje) NIE batchuje', () => {
  assert.equal(searchBatchPlanOf({
    destination: 'hand', qualifier: {}, mandatory: true, destinations: null,
    chain: { remaining: 1, destination: 'graveyard', qualifier: {}, mandatory: true },
  }), null);
});

test('A/plan: brak łańcucha = brak wsadu (pojedyncze szukanie po staremu)', () => {
  assert.equal(searchBatchPlanOf({
    destination: 'hand', qualifier: {}, mandatory: false, destinations: null, chain: null,
  }), null);
});

test('A/plan: wybór destynacji (destinations) = brak wsadu', () => {
  assert.equal(searchBatchPlanOf({
    destination: 'hand', qualifier: BASIC, mandatory: false,
    destinations: ['hand', 'battlefield'],
    chain: { remaining: 1, destination: 'hand', qualifier: BASIC },
  }), null);
});

test('A/plan: inny kwalifikator w łańcuchu = brak wsadu', () => {
  assert.equal(searchBatchPlanOf({
    destination: 'hand', qualifier: BASIC, mandatory: false, destinations: null,
    chain: { remaining: 1, destination: 'hand', qualifier: {} },
  }), null);
});

test('A/plan: krok 0 obowiązkowy = minPicks 1 (decline nieoferowany)', () => {
  const plan = searchBatchPlanOf({
    destination: 'battlefield', qualifier: BASIC, mandatory: true,
    destinations: null, sourceCardId: 'x',
    chain: { remaining: 1, destination: 'battlefield', qualifier: BASIC },
  });
  assert.equal(plan.minPicks, 1);
  assert.equal(plan.declinable, false);
});

// --- Krok pętli: decyzje per krok ----------------------------------------

function batchOf() {
  return {
    maxPicks: 2, sourceCardId: 'springbloom-druid',
    destination: 'battlefield', qualifierKey: JSON.stringify(BASIC),
  };
}
function livePending(over = {}) {
  return {
    playerId: 'p1', sourceCardId: 'springbloom-druid',
    destination: 'battlefield', qualifier: BASIC, destinations: null,
    chain: { remaining: 1, destination: 'battlefield', qualifier: BASIC },
    ...over,
  };
}
const CARDS = [
  { id: 'lib-forest-1', cardId: 'basic-forest' },
  { id: 'lib-forest-2', cardId: 'basic-forest' },
  { id: 'lib-island-1', cardId: 'basic-island' },
];
const OPTS0 = [
  { type: 'resolve_search_choice', playerId: 'p1', found: 'lib-forest-1', destination: 'battlefield' },
  { type: 'resolve_search_choice', playerId: 'p1', found: 'lib-island-1', destination: 'battlefield' },
  { type: 'resolve_search_choice', playerId: 'p1', found: null },
];

test('A/krok: wybór rozwiązuje się na reprezentanta TEJ oferty (L48)', () => {
  const cmd = searchBatchStepOf({
    picks: ['basic-forest', 'basic-island'], index: 0,
    batch: batchOf(), pending: livePending(), options: OPTS0, cards: CARDS,
  });
  assert.equal(cmd?.found, 'lib-forest-1', 'reprezentant Foresta w kroku 0');
});

test('A/krok: drugi Forest bierze DRUGIEGO reprezentanta (instancje się przesuwają)', () => {
  // Po wyjęciu lib-forest-1 oferta kroku 1 niesie lib-forest-2.
  const opts1 = [
    { type: 'resolve_search_choice', playerId: 'p1', found: 'lib-forest-2', destination: 'battlefield' },
    { type: 'resolve_search_choice', playerId: 'p1', found: 'lib-island-1', destination: 'battlefield' },
    { type: 'resolve_search_choice', playerId: 'p1', found: null },
  ];
  const cmd = searchBatchStepOf({
    picks: ['basic-forest', 'basic-forest'], index: 1,
    batch: batchOf(),
    pending: livePending({ chain: null }), // ostatni krok: chain null = remaining 0
    options: opts1, cards: CARDS,
  });
  assert.equal(cmd?.found, 'lib-forest-2');
});

test('A/krok: wyczerpane wybory + oferowany decline = auto-decline reszty', () => {
  const cmd = searchBatchStepOf({
    picks: ['basic-forest'], index: 1,
    batch: batchOf(), pending: livePending({ chain: null }), options: OPTS0, cards: CARDS,
  });
  assert.equal(cmd?.found, null, 'decline reszty');
  assert.equal(cmd?.type, 'resolve_search_choice');
});

test('A/krok: wyczerpane wybory BEZ decline (krok obowiązkowy) = STOP', () => {
  const mandatoryOpts = OPTS0.filter((o) => o.found != null);
  assert.equal(searchBatchStepOf({
    picks: ['basic-forest'], index: 1,
    batch: batchOf(), pending: livePending({ chain: null, mandatory: true }),
    options: mandatoryOpts, cards: CARDS,
  }), null, 'resztę gracz dobiera ręcznie — zmyślony decline byłby odrzutem');
});

test('A/krok: nieświeży wybór (cardId spoza oferty) = STOP', () => {
  assert.equal(searchBatchStepOf({
    picks: ['basic-plains'], index: 0,
    batch: batchOf(), pending: livePending(), options: OPTS0, cards: CARDS,
  }), null);
});

test('A/krok: obca decyzja (inny łańcuch po drodze) = STOP, nie klikanie w nią', () => {
  assert.equal(searchBatchStepOf({
    picks: ['basic-forest'], index: 1,
    batch: batchOf(),
    pending: livePending({ sourceCardId: 'other-spell' }),
    options: OPTS0, cards: CARDS,
  }), null, 'inne źródło — ręce precz');
  assert.equal(searchBatchStepOf({
    picks: ['basic-forest'], index: 1,
    batch: batchOf(),
    pending: livePending({ chain: { remaining: 3 } }),
    options: OPTS0, cards: CARDS,
  }), null, 'niespodziewany remaining — ręce precz');
});

test('A/krok: brak pendingu = STOP (łańcuch domknięty)', () => {
  assert.equal(searchBatchStepOf({
    picks: ['basic-forest'], index: 1,
    batch: batchOf(), pending: null, options: [], cards: [],
  }), null);
});

// --- Integracja z żywym silnikiem: pętla nad prawdziwymi ofertami ---------

const REGISTRY = createCardRegistry();
function liveState() {
  const s = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main', 'p1');
  s.turn.activePlayerId = s.turn.priorityPlayerId = 'p1';
  const put = (id, cardId) => {
    const d = REGISTRY.get(cardId);
    addObject(s, { ...gameObjectDataOf(d), types: d.types ?? [], id, instanceId: `i-${id}`, cardId, controllerId: 'p1', ownerId: 'p1', zone: 'library' });
  };
  put('lib-forest-1', 'basic-forest');
  put('lib-forest-2', 'basic-forest');
  put('lib-island-1', 'basic-island');
  for (let i = 0; i < 20; i += 1) put(`lib-filler-${i}`, 'goblin-piker');
  queueSearchChoice(s, { controllerId: 'p1', cardId: 'springbloom-druid' }, {
    qualifier: BASIC, destination: 'battlefield', entersTapped: true,
    chain: { remaining: 1, destination: 'battlefield', qualifier: BASIC, entersTapped: true },
  });
  return s;
}
// Ta sama sekwencja co submitSearchBatch w main.js (decyzje searchBatchStepOf
// + execute), bez DOM.
function driveBatch(s, picks, batch) {
  const played = [];
  for (let index = 0; index < batch.maxPicks; index += 1) {
    const view = playerView(s, 'p1');
    const options = (view.legalCommands ?? []).filter((c) => c?.type === 'resolve_search_choice');
    const cmd = searchBatchStepOf({
      picks, index, batch,
      pending: s.pendingSearchChoice ?? null,
      options, cards: view.pendingSearchChoice?.cards ?? [],
    });
    if (!cmd) break;
    assert.ok(execute(s, cmd).ok, `krok ${index} legalny`);
    played.push(cmd.found);
    if (cmd.found == null) break;
  }
  return played;
}

test('A/live: wsad [Forest, Forest] kładzie 2 Foresa tapnięte (jak 2 modale)', () => {
  const s = liveState();
  const batch = searchBatchPlanOf(s.pendingSearchChoice);
  assert.equal(batch.maxPicks, 2);
  const played = driveBatch(s, ['basic-forest', 'basic-forest'], batch);
  assert.equal(played.length, 2);
  assert.ok(played.every((f) => f != null), 'oba kroki znalazły kartę');
  assert.notEqual(played[0], played[1], 'dwie RÓŻNE instancje (reprezentant się przesunął)');
  const forests = [...s.objects.values()].filter((o) => o.zone === 'battlefield' && o.cardId === 'basic-forest');
  assert.equal(forests.length, 2);
  assert.ok(forests.every((o) => o.tapped === true), 'entersTapped z kroku (semantyka pendingu)');
  assert.equal(s.pendingSearchChoice, null, 'łańcuch domknięty');
});

test('A/live: wsad [Forest] + auto-decline = 1 Forest, reszta porzucona', () => {
  const s = liveState();
  const batch = searchBatchPlanOf(s.pendingSearchChoice);
  const played = driveBatch(s, ['basic-forest'], batch);
  assert.deepEqual(played.map((f) => f == null), [false, true], 'znalezienie + decline reszty');
  assert.equal([...s.objects.values()].filter((o) => o.zone === 'battlefield' && o.cardId === 'basic-forest').length, 1);
  assert.equal(s.pendingSearchChoice, null, 'decline kończy łańcuch');
});

test('A/live: pusty wsad = sam decline (rezygnacja z całości)', () => {
  const s = liveState();
  const batch = searchBatchPlanOf(s.pendingSearchChoice);
  const played = driveBatch(s, [], batch);
  assert.deepEqual(played, [null]);
  assert.equal(s.pendingSearchChoice, null);
});

// --- Kreator: steppery, gating, ekspansja wyborów --------------------------

class BatchMiniEl {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.listeners = {};
    this.className = '';
    this.text = '';
    this.type = '';
    this.checked = false;
    this.disabled = false;
    this.dataset = {};
  }
  set textContent(value) { this.text = String(value); this.children = []; }
  get textContent() { return this.text + this.children.map((child) => child.textContent).join(''); }
  appendChild(child) { this.children.push(child); return child; }
  addEventListener(type, listener) { (this.listeners[type] ??= []).push(listener); }
  click() { for (const listener of this.listeners.click ?? []) listener({}); }
}
globalThis.document = { createElement: (tag) => new BatchMiniEl(tag) };

const stubSession = { nameOf: (id) => REGISTRY.get(id)?.name ?? id };
function renderBatch(planRows, planOver = {}) {
  const host = new BatchMiniEl('div');
  const completed = [];
  renderSearchBatchWizard(host, {
    view: {}, session: stubSession,
    plan: { maxPicks: 2, minPicks: 0, rows: planRows, ...planOver },
    commands: [],
    sourceName: 'Springbloom Druid',
    onComplete: (picks) => completed.push(picks),
    onCancel: () => {},
  });
  const list = host.children[1];
  const status = host.children[2];
  const buttons = host.children[3];
  return { host, list, status, confirm: buttons.children[0], completed };
}
// Dzieci wiersza-steppera: [nazwa, minus, licznik, plus, akcje].
const plusOf = (row) => row.children[3];
const countOf = (row) => row.children[2];

test('A/kreator: steppery zliczają do maxPicks, Zatwierdź rozwija krotności', () => {
  const { list, status, confirm, completed } = renderBatch([
    { cardId: 'basic-forest', count: 2 },
    { cardId: 'basic-island', count: 1 },
  ]);
  assert.equal(list.children.length, 2);
  assert.match(list.textContent, /Forest/);
  assert.match(list.textContent, /×2 w bibliotece/);
  plusOf(list.children[0]).click();
  plusOf(list.children[0]).click();
  assert.equal(countOf(list.children[0]).textContent, '2');
  assert.match(status.textContent, /Wybrano: 2 \/ 2/);
  // Trzeci egzemplarz ponad maxPicks: plus zgaszony (M292: predykat).
  assert.equal(plusOf(list.children[1]).disabled, true);
  confirm.click();
  assert.deepEqual(completed, [['basic-forest', 'basic-forest']]);
});

test('A/kreator: pusty wybór przy minPicks 0 = rezygnacja (Zatwierdź aktywny)', () => {
  const { confirm, completed } = renderBatch([{ cardId: 'basic-forest', count: 2 }]);
  assert.equal(confirm.disabled, false);
  confirm.click();
  assert.deepEqual(completed, [[]]);
});

test('A/kreator: minPicks 1 gasi Zatwierdź do pierwszego wyboru', () => {
  const { list, confirm, completed, status } = renderBatch(
    [{ cardId: 'basic-forest', count: 2 }], { minPicks: 1 });
  assert.equal(confirm.disabled, true);
  assert.match(status.textContent, /co najmniej 1/);
  plusOf(list.children[0]).click();
  assert.equal(confirm.disabled, false);
  confirm.click();
  assert.deepEqual(completed, [['basic-forest']]);
});

test('A/kreator: nazwa wiersza otwiera podgląd karty (cardId)', () => {
  const host = new BatchMiniEl('div');
  const opened = [];
  renderSearchBatchWizard(host, {
    view: {}, session: stubSession,
    plan: { maxPicks: 2, minPicks: 0, rows: [{ cardId: 'basic-forest', count: 2 }] },
    commands: [],
    onComplete: () => {},
    onCancel: () => {},
    onOpenCardByCardId: (cid) => opened.push(cid),
  });
  host.children[1].children[0].children[0].click(); // nazwa pierwszego wiersza
  assert.deepEqual(opened, ['basic-forest']);
});
