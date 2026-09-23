// Uwaga B2 (właściciel, gra 2026-09-23, sesja „c"): badge „zatrzymany (detain)"
// MUSI być widoczny na kaflu przez CAŁY czas trwania efektu — zgłoszenie
// brzmiało „nie widać na zatrzymanych celach, że są zatrzymane", a nie
// „nie ma tego w ogóle": badge istnieje w buildStateOverlay od M177/E, ale
// pokrycie nie było zamierzone (żaden pin go nie pilnował).
//
// Ten plik mierzy KOMPLET zachowania na ścieżce, którą realnie idzie gra:
//   1) silnik: `detainUntilYourNextTurn` ustawia parę {detained,
//      detainedUntilTurn} i WIDOK ją niesie (entry.detained — informacja
//      publiczna, CR 701.29);
//   2) render: kafel stołu (tile → buildStateOverlay) rysuje badge;
//   3) trwałość: badge jest zdjęty DOKŁADNIE wtedy, gdy wygasa efekt
//      (cleanup „do twojej następnej tury"), nie wcześniej.
//
// Render przez realny `renderTableView` + minimalny DOM (wzorzec pinów M18/
// sesji 2026-09-23-r): badge na ilustracji pojawia się tylko PO wczytaniu
// obrazu, więc pinowanie samego `buildStateOverlay` byłoby za słabe.
import { test } from 'node:test';
import assert from 'node:assert/strict';

class MiniEl {
  constructor() {
    this.children = [];
    this.text = '';
    this.className = '';
    this.dataset = {};
    this.listeners = {};
    this.style = {};
    this.classList = { add() {}, remove() {}, toggle() {} };
  }
  set textContent(v) { this.text = String(v); this.children = []; }
  get textContent() { return `${this.text} ${this.children.map((c) => c?.textContent ?? '').join(' ')}`; }
  set innerHTML(v) { this.text = String(v).replace(/<[^>]*>/g, ' '); }
  get innerHTML() { return this.text; }
  appendChild(c) { this.children.push(c); return c; }
  addEventListener(t, fn) { (this.listeners[t] ??= []).push(fn); }
  remove() {}
  querySelector() { return null; }
  querySelectorAll() { return []; }
  getAttribute() { return null; }
  setAttribute() {}
}

globalThis.document ??= {
  createElement: () => new MiniEl(),
  createTextNode: (t) => ({ isText: true, text: String(t), get textContent() { return this.text; } }),
  addEventListener() {},
};

const { renderTableView } = await import('../src/table/render.js');
const { createCardRegistry } = await import('../src/cards/card-data.js');
const { createGameState, addObject, playerView } = await import('../src/engine/game-state.js');
const { gameObjectDataOf } = await import('../src/cards/materialize.js');
const { detainUntilYourNextTurn } = await import('../src/engine/permanents.js');
const { execute } = await import('../src/engine/game-state.js');

const REGISTRY = createCardRegistry();

function stol(view) {
  const els = {};
  for (const k of ['banner', 'status', 'stackZone', 'bfEnemy', 'bfOwn', 'graveEnemy',
    'graveOwn', 'exileZone', 'hand', 'handEnemy', 'actions', 'log']) els[k] = new MiniEl();
  const session = {
    view: () => view,
    state: { seed: 1, objects: new Map() },
    log: [], logEntries: () => [], reasoning: [],
    nameOf: (id) => REGISTRY.get(id)?.name ?? id,
    nameOfObject: (o) => (o?.cardId ? REGISTRY.get(o.cardId)?.name : null) ?? o?.cardId ?? 'obiekt',
    cardDetails: (id) => REGISTRY.get(id) ?? null,
    colorsOf: () => [], abilitiesOf: () => [],
  };
  renderTableView({ els, session, play: () => {}, onCardClick: () => {}, onChoiceRequest: () => {} });
  return els;
}

function viewZKaflem(object) {
  return {
    playerId: 'p1', status: 'active',
    players: [{ id: 'p1', name: 'Ty', life: 20, mana: 0 }, { id: 'p2', name: 'Nieprzyjaciel', life: 20, mana: 0 }],
    zones: {
      stack: [], hand: [], library: [], graveyard: [], exile: [], battlefield: [object],
    },
    turn: { number: 3, activePlayerId: 'p1', phase: 'precombat_main', step: 'precombat_main' },
    legalCommands: [{ type: 'pass_priority', playerId: 'p1' }],
    pendingOptionalTrigger: null,
  };
}

test('B2/1: zatrzymany permanent ma badge „zatrzymany (detain)" na kaflu', () => {
  const els = stol(viewZKaflem({
    id: 'det1', cardId: 'highland-game', controllerId: 'p1', zone: 'battlefield',
    kinds: ['creature'], types: ['Creature'], subtypes: ['Elk'], keywords: [],
    power: 2, toughness: 2, detained: true, detainedUntilTurn: 5,
  }));
  assert.match(els.bfOwn.textContent, /zatrzymany \(detain\)/,
    'kafel milczał o stanie, który realnie blokuje atak/blok/aktywacje');
});

test('B2/2: permanent NIEzatrzymany nie dostaje badge', () => {
  const els = stol(viewZKaflem({
    id: 'det2', cardId: 'highland-game', controllerId: 'p1', zone: 'battlefield',
    kinds: ['creature'], types: ['Creature'], subtypes: ['Elk'], keywords: [],
    power: 2, toughness: 2,
  }));
  assert.doesNotMatch(els.bfOwn.textContent, /zatrzymany \(detain\)/,
    'badge nie może być przyklejony do każdego stwora');
});

test('B2/3: ścieżka silnika — detain zapisuje parę {detained, until} i widok ją niesie', () => {
  const state = createGameState({ seed: 909, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn.number = 3;
  state.turn.activePlayerId = 'p1';
  state.pendingMulligans = [];
  const def = REGISTRY.get('highland-game');
  addObject(state, {
    id: 'ofiara', instanceId: 'i-ofiara', cardId: 'highland-game', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', ...gameObjectDataOf(def), types: def.types ?? [], subtypes: def.subtypes ?? [],
    keywords: def.keywords ?? [],
  });
  detainUntilYourNextTurn(state, 'ofiara', 'p1');
  const wpis = playerView(state, 'p1').zones.battlefield.find((o) => o.id === 'ofiara');
  assert.equal(wpis.detained, true, 'widok musi nieść detained (informacja publiczna)');
  // Permanent należy do p2, więc leży na stole PRZECIWNIKA (bfEnemy) — badge
  // musi być tak samo widoczny na cudzym kaflu (gracz widzi, co zatrzymał).
  const els = stol(viewZKaflem({ ...wpis, id: 'ofiara', controllerId: 'p2', power: 2, toughness: 1 }));
  assert.match(els.bfEnemy.textContent, /zatrzymany \(detain\)/, 'badge na kaflu z widoku silnika');
});

test('B2/4: badge trwa przez efekt i znika dokładnie, gdy efekt wygasa (cleanup)', () => {
  const state = createGameState({ seed: 910, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn.number = 3;
  state.turn.activePlayerId = 'p1';
  state.pendingMulligans = [];
  const def = REGISTRY.get('highland-game');
  addObject(state, {
    id: 'ofiara2', instanceId: 'i-ofiara2', cardId: 'highland-game', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', ...gameObjectDataOf(def), types: def.types ?? [], subtypes: def.subtypes ?? [],
    keywords: def.keywords ?? [],
  });
  // Naturalny bieg tury dobiera karty — bez bibliotek gra kończyłaby się
  // „game_over" (deck-out) zamiast dojść do tury wygaśnięcia efektu.
  const swamp = REGISTRY.get('basic-swamp');
  for (const pid of ['p1', 'p2']) {
    for (let i = 0; i < 6; i += 1) {
      addObject(state, {
        id: `lib-${pid}-${i}`, instanceId: `i-lib-${pid}-${i}`, cardId: 'basic-swamp', controllerId: pid, ownerId: pid,
        zone: 'library', ...gameObjectDataOf(swamp), types: swamp.types ?? [], subtypes: swamp.subtypes ?? [],
        keywords: swamp.keywords ?? [],
      });
    }
  }
  detainUntilYourNextTurn(state, 'ofiara2', 'p1');
  // Tura detainera (3) → efekt trzyma do początku jego następnej tury (5).
  // Wygaśnięcie idzie REALNYM biegiem gry (passy przez `execute`), nie
  // chirurgią stanu — to sprawdza też, że SBA/cleanup nie zdejmują badge'a
  // za wcześnie.
  function doTury(nr) {
    let guard = 0;
    while (guard < 400) {
      if (state.turn.number === nr && state.turn.step === 'main1') return;
      const r = execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
      if (!r.ok) throw new Error(`pass zablokowany: ${r.events[0]?.reason}`);
      guard += 1;
    }
    throw new Error(`nie udało się dojść do tury ${nr}`);
  }
  // Tura 4 (przeciwnika detainera): efekt TRWA — „do twojej następnej tury"
  // (CR 701.29) nie kończy się z końcem tury, w której go nałożono.
  doTury(4);
  assert.equal(state.objects.get('ofiara2').zone, 'battlefield', 'setup: cel nadal na stole');
  assert.equal(state.objects.get('ofiara2').detained, true,
    'tura 4: zatrzymanie nadal działa — badge musi być widoczny');
  // Tura 5 = następna tura detergentów: na jej STARCIE efekt wygasa (beginTurn),
  // więc badge znika razem z efektem. Ta sama droga co w grze (passy).
  doTury(5);
  assert.ok(!state.objects.get('ofiara2').detained,
    'w turze 5 (następna tura detergentów) efekt wygasa na starcie tury');
});
