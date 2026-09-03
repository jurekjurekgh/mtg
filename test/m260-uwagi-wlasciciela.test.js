import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, execute, addObject, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { applyEffect } from '../src/engine/effects.js';
import { lookWizardKindOf, renderPeekPickOrderWizard } from '../src/table/choice-request.js';
import { commandLabel, cardInfo, waitingExileStatus } from '../src/table/render.js';
import { describeGameEvent } from '../src/table/session.js';

// =============================================================================
// M260 — uwagi właściciela z testów PR #89 (2026-08-30), po challenge M259.
//
// A. Fertile Thicket (BFZ), Oracle: „When this land enters, you may LOOK AT
//    the top five cards of your library. If you do, reveal up to one BASIC
//    LAND card from among them, then put that card on top of your library
//    and THE REST ON THE BOTTOM in any order."
//    A1: „you may look" = prawdziwy wybór zaglądania — UI nie może pokazywać
//        kart (Mountain/Island) PRZED decyzją, bo wtedy rezygnacja jest
//        pozorna (zgłoszenie: „co to za opcja «basic land na wierzch»???").
//    A2: etykiety zgodne z Oracle — „basic land na wierzch biblioteki" jako
//        fallback etykiety opcji „bez landa" to błąd; skip ≠ „na spód".
//    A3: reszta kart trafia na spód W DOWOLNEJ KOLEJNOŚCI — brakowało
//        sortera kolejności (jak w Scry/Index).
//
// B1. Pyxis of Pandemonium: karty wygnane pierwszą zdolnością ({T}) leżą
//     ZAKRYTE i NIKT nie może na nie patrzeć (CR 406.3) — nawet właściciel
//     (to NIE jest morph na polu bitwy, CR 708.6 nie ma zastosowania).
//     Karty mają być widoczne jako odwrócone w „poczekalni" wygnania
//     (jak Plot/Suspend), z informacją, że odkryje je druga zdolność.
//
// B2. Pusta biblioteka: wygnanie Pyxisem z pustej biblioteki NIE kończy gry
//     (przegraną jest dopiero PRÓBA DOBORU, CR 704.5m) — potwierdzone przez
//     właściciela („nie ma tematu"); poniżej regresja całego scenariusza.
// =============================================================================

const REGISTRY = createCardRegistry();

function newState() {
  const state = createGameState({ seed: 2026, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  return state;
}

function addCardFromRegistry(state, instanceId, cardId, controllerId, zone) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id: instanceId, instanceId: `i-${instanceId}`, cardId, controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, spell: data.spell, abilities: data.abilities ?? [],
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
    types: def.types ?? [], colors: data.colors ?? [],
    cardName: def.name,
  });
}

function byCard(state, cardId, zone) {
  return [...state.objects.values()].find((o) => o.cardId === cardId && o.zone === zone);
}

function passRounds(state, rounds = 6) {
  for (let g = 0; g < rounds; g += 1) {
    let passes = state.turn.passes;
    let guard = 0;
    while (passes < 2 && guard < 20) {
      const holder = state.turn.priorityPlayerId;
      const r = execute(state, { type: 'pass_priority', playerId: holder });
      if (!r.ok && /(_unresolved|not_your_decision)$/.test(r.events?.[0]?.reason ?? '')) return r;
      passes = state.turn.passes;
      guard += 1;
    }
  }
  return null;
}

/** Biblioteka p1: Forest, Nomad, Plains, Nomad, Thicket (land, ale NIE basic). */
function libraryWithBasicAndNonbasic(state) {
  addCardFromRegistry(state, 'fa', 'basic-forest', 'p1', 'library');
  addCardFromRegistry(state, 'fb', 'goldmeadow-nomad', 'p1', 'library');
  addCardFromRegistry(state, 'fc', 'basic-plains', 'p1', 'library');
  addCardFromRegistry(state, 'fd', 'goldmeadow-nomad', 'p1', 'library');
  addCardFromRegistry(state, 'fe', 'fertile-thicket', 'p1', 'library');
  addCardFromRegistry(state, 'p2top', 'goldmeadow-nomad', 'p2', 'library');
  state.zones.library = ['fa', 'fb', 'fc', 'fd', 'fe', 'p2top'];
}

function openFertileThicket(state) {
  addCardFromRegistry(state, 'thicket', 'fertile-thicket', 'p1', 'hand');
  const r = execute(state, { type: 'play_land', playerId: 'p1', objectId: 'thicket' });
  assert.ok(r.ok, 'land drop: ' + (r.events?.[0]?.reason ?? ''));
  passRounds(state, 2);
  assert.ok(state.pendingFertileThicket, 'pendingFertileThicket ustawione (ETB)');
  return state.pendingFertileThicket;
}

// -----------------------------------------------------------------------------
// A — Fertile Thicket: silnik (spec-lock A2/A3)
// -----------------------------------------------------------------------------

test('M260/A2+A3 (silnik): tylko BASIC landy na wierzch; reszta na spód w DOWOLNEJ kolejności', () => {
  const state = newState();
  libraryWithBasicAndNonbasic(state);
  openFertileThicket(state);
  assert.deepEqual(state.pendingFertileThicket.basicLandIds, ['fa', 'fc'],
    'A2: tylko basic landy (Fertile Thicket w bibliotece to land, ale nie basic)');
  // A3: własna kolejność spodu — inna niż kolejność oglądania
  const r = execute(state, {
    type: 'resolve_fertile_thicket', playerId: 'p1',
    chosenCardId: 'fc', bottomOrder: ['fe', 'fd', 'fb', 'fa'],
  });
  assert.ok(r.ok, 'resolve: ' + (r.events?.[0]?.reason ?? ''));
  assert.equal(state.pendingFertileThicket, null, 'pending zamknięte');
  assert.deepEqual(state.zones.library, ['fc', 'p2top', 'fe', 'fd', 'fb', 'fa'],
    'wybrany land na wierzch, karta p2 bez zmian, reszta na spód we WŁASNEJ kolejności');
});

test('M260/A3 (silnik): bez landa — CAŁA piątka na spód w wybranej kolejności', () => {
  const state = newState();
  libraryWithBasicAndNonbasic(state);
  openFertileThicket(state);
  const r = execute(state, {
    type: 'resolve_fertile_thicket', playerId: 'p1',
    chosenCardId: null, bottomOrder: ['fe', 'fc', 'fa', 'fb', 'fd'],
  });
  assert.ok(r.ok, 'resolve bez landa: ' + (r.events?.[0]?.reason ?? ''));
  assert.deepEqual(state.zones.library, ['p2top', 'fe', 'fc', 'fa', 'fb', 'fd'],
    'nic nie ląduje na wierzchu — cała piątka na spód w wybranej kolejności');
});

// -----------------------------------------------------------------------------
// A — Fertile Thicket: widok (A1, FoW)
// -----------------------------------------------------------------------------

test('M260/A1 (widok): decydujący widzi 5 kart i basicLandIds; przeciwnik tylko fakt', () => {
  const state = newState();
  libraryWithBasicAndNonbasic(state);
  openFertileThicket(state);
  const v1 = playerView(state, 'p1');
  assert.ok(v1.pendingFertileThicket, 'widok niesie pendingFertileThicket (jak pendingScry)');
  assert.equal(v1.pendingFertileThicket.playerId, 'p1');
  assert.equal(v1.pendingFertileThicket.sourceCardId, 'fertile-thicket');
  assert.equal(v1.pendingFertileThicket.count, 5);
  assert.equal(v1.pendingFertileThicket.cards.length, 5, 'decydujący zna obejrzane karty');
  assert.equal(v1.pendingFertileThicket.cards[0].id, 'fa');
  assert.equal(v1.pendingFertileThicket.cards[0].cardId, 'basic-forest');
  assert.deepEqual(v1.pendingFertileThicket.basicLandIds, ['fa', 'fc'],
    'wizard potrzebuje wiedzieć, które karty to basic landy (A2)');
  // Oferta komend: rezygnacja + „bez landa" + po jednym basic landzie
  const resolves = v1.legalCommands.filter((c) => c.type === 'resolve_fertile_thicket');
  assert.ok(resolves.some((c) => c.skip === true), 'jest opcja rezygnacji (you may)');
  assert.ok(resolves.some((c) => !c.skip && c.chosenCardId == null), 'jest opcja „bez landa"');
  assert.equal(resolves.filter((c) => c.chosenCardId != null).length, 2, 'po jednym wariancie na basic land');
  // FoW: przeciwnik widzi TYLKO fakt trwania decyzji i liczbę kart
  const v2 = playerView(state, 'p2');
  assert.ok(v2.pendingFertileThicket, 'przeciwnik wie, że decyzja trwa');
  assert.equal(v2.pendingFertileThicket.cards, null, 'FoW: przeciwnik nie widzi kart');
  assert.equal(v2.pendingFertileThicket.basicLandIds, null, 'FoW: przeciwnik nie widzi, które to landy');
});

// -----------------------------------------------------------------------------
// A — Fertile Thicket: wizard UI (A1/A2/A3)
// -----------------------------------------------------------------------------

class MiniEl {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.listeners = {};
    this.className = '';
    this.text = '';
    this.html = '';
    this.type = '';
    this.dataset = {};
  }
  set textContent(value) { this.text = String(value); this.html = ''; this.children = []; }
  get textContent() { return this.text + this.children.map((child) => child.textContent).join(''); }
  set innerHTML(value) { this.html = String(value); this.text = String(value).replace(/<[^>]*>/g, ''); this.children = []; }
  get innerHTML() { return (this.html ? this.html : this.text) + this.children.map((c) => c.innerHTML).join(''); }
  appendChild(child) { this.children.push(child); return child; }
  addEventListener(type, listener) { (this.listeners[type] ??= []).push(listener); }
  click() { for (const listener of this.listeners.click ?? []) listener({}); }
}

// Mini-harness DOM (jak choice-request-ui.test.js — L17: dataset na przyciskach).
globalThis.document = { createElement: (tag) => new MiniEl(tag) };

function buttonsOf(host) {
  const out = [];
  const walk = (el) => {
    for (const child of el.children ?? []) {
      if (child.tagName === 'button') out.push(child);
      walk(child);
    }
  };
  walk(host);
  return out;
}

function clickByText(buttons, fragment) {
  const btn = buttons.find((b) => b.textContent.includes(fragment));
  assert.ok(btn, `brak przycisku „${fragment}” w: ${buttons.map((b) => b.textContent).join(' | ')}`);
  btn.click();
}

const FERTILE_CARDS = [
  { id: 'fa', cardId: 'basic-forest', name: 'Forest' },
  { id: 'fb', cardId: 'goldmeadow-nomad', name: 'Goldmeadow Nomad' },
  { id: 'fc', cardId: 'basic-plains', name: 'Plains' },
  { id: 'fd', cardId: 'shock', name: 'Shock' },
  { id: 'fe', cardId: 'hill-giant', name: 'Hill Giant' },
];

test('M260/A1 (wizard): decyzja „zaglądnij?” PRZED pokazaniem kart; rezygnacja = skip', () => {
  const host = new MiniEl('div');
  const done = [];
  renderPeekPickOrderWizard(host, {
    cards: FERTILE_CARDS,
    basicLandIds: ['fa', 'fc'],
    sourceName: 'Fertile Thicket',
    onComplete: (r) => done.push(r),
    onCancel: () => done.push('cancel'),
    onOpenCard: () => {},
    probeKeyFor: () => 'probe',
  });
  const txt = host.textContent;
  assert.match(txt, /Fertile Thicket/, 'intro nazywa kartę (ADR 0002: nazwa z danych)');
  assert.match(txt, /zajrz/i, 'pytanie o zaglądnięcie');
  // A1: PRZED decyzją UI nie zdradza ŻADNEJ karty
  for (const name of ['Forest', 'Nomad', 'Plains', 'Shock', 'Hill Giant']) {
    assert.ok(!txt.includes(name), `krok 1 nie pokazuje „${name}” — inaczej rezygnacja jest pozorna`);
  }
  clickByText(buttonsOf(host), 'Zrezygnuj');
  assert.deepEqual(done, [{ skip: true }], 'rezygnacja = komenda skip (nic się nie dzieje)');
});

test('M260/A2+A3 (wizard): po zajrzeniu widać karty; tylko basic landy na wierzch; sorter kolejności spodu', () => {
  const host = new MiniEl('div');
  const done = [];
  renderPeekPickOrderWizard(host, {
    cards: FERTILE_CARDS,
    basicLandIds: ['fa', 'fc'],
    sourceName: 'Fertile Thicket',
    onComplete: (r) => done.push(r),
    onCancel: () => done.push('cancel'),
    onOpenCard: () => {},
    probeKeyFor: () => 'probe',
  });
  clickByText(buttonsOf(host), 'Zaglądnij');
  const looked = host.textContent;
  for (const name of ['Forest', 'Goldmeadow Nomad', 'Plains', 'Shock', 'Hill Giant']) {
    assert.ok(looked.includes(name), `po zajrzeniu widać „${name}”`);
  }
  // A2: na wierzch można wziąć WYŁĄCZNIE basic landy
  const topButtons = buttonsOf(host).filter((b) => /na wierzch/.test(b.textContent));
  assert.equal(topButtons.length, 2, 'tylko Forest i Plains (Shock/Nomad/Hill Giant to nie basic landy)');
  clickByText(buttonsOf(host), 'Forest');
  // A3: kolejność reszty na spodzie — klikana od najbliższej wierzchu
  assert.match(host.textContent, /spód/i, 'krok sortera kolejności spodu');
  assert.ok(host.textContent.includes('→ wierzch'), 'wybrany land oznaczony na wierzchu');
  assert.ok(!host.textContent.includes('→ spód ('), 'przed kliknięciem kolejność spodu nieustalona');
  clickByText(buttonsOf(host), 'Plains');
  clickByText(buttonsOf(host), 'Goldmeadow Nomad');
  clickByText(buttonsOf(host), 'Shock');
  clickByText(buttonsOf(host), 'Hill Giant');
  assert.deepEqual(done, [{ chosenCardId: 'fa', bottomOrder: ['fc', 'fb', 'fd', 'fe'] }],
    'komenda: wybrany land + własna kolejność reszty na spodzie');
});

test('M260/A2 (wizard): brak basic landów — tylko „bez landa”, cała piątka na spód', () => {
  const host = new MiniEl('div');
  const done = [];
  const cards = FERTILE_CARDS.slice(1).map((c, i) => ({ ...c, id: `n${i}` }));
  renderPeekPickOrderWizard(host, {
    cards,
    basicLandIds: [],
    sourceName: 'Fertile Thicket',
    onComplete: (r) => done.push(r),
    onCancel: () => done.push('cancel'),
    onOpenCard: () => {},
    probeKeyFor: () => 'probe',
  });
  clickByText(buttonsOf(host), 'Zaglądnij');
  assert.equal(buttonsOf(host).filter((b) => /na wierzch/.test(b.textContent)).length, 0,
    'żadnego basic landa do wzięcia na wierzch');
  clickByText(buttonsOf(host), 'Bez basic landa');
  clickByText(buttonsOf(host), 'Hill Giant');
  clickByText(buttonsOf(host), 'Shock');
  clickByText(buttonsOf(host), 'Goldmeadow Nomad');
  clickByText(buttonsOf(host), 'Plains');
  assert.deepEqual(done, [{ chosenCardId: null, bottomOrder: ['n3', 'n2', 'n0', 'n1'] }],
    'bez landa: chosenCardId null + cała piątka na spód w wybranej kolejności');
});

test('M260/A1 (routing): lookWizardKindOf rozpoznaje decyzję Fertile Thicket', () => {
  const options = [
    { type: 'resolve_fertile_thicket', playerId: 'p1', skip: true },
    { type: 'resolve_fertile_thicket', playerId: 'p1', chosenCardId: null },
  ];
  const view = { playerId: 'p1', pendingFertileThicket: { playerId: 'p1', cards: [{ id: 'fa' }] } };
  assert.equal(lookWizardKindOf({ options }, view), 'peek-pick');
  assert.equal(lookWizardKindOf({ options }, { playerId: 'p2', pendingFertileThicket: { playerId: 'p1', cards: null } }),
    null, 'decyzja cudza — bez wizarda');
  assert.equal(lookWizardKindOf({ options }, { playerId: 'p1' }), null,
    'bez danych widoku — zwykła lista (fallback, etykiety i tak poprawione)');
});

// -----------------------------------------------------------------------------
// A — Fertile Thicket: etykiety i log (A2)
// -----------------------------------------------------------------------------

test('M260/A2 (etykiety): commandLabel mówi prawdę o każdej opcji', () => {
  const session = {
    nameOfObject: (id) => ({ fa: 'Forest' })[id] ?? String(id),
    nameOf: (id) => ({ 'fertile-thicket': 'Fertile Thicket' })[id] ?? String(id),
  };
  const skip = commandLabel({ type: 'resolve_fertile_thicket', playerId: 'p1', skip: true }, session, {});
  assert.match(skip, /rezygnuj/i, 'skip = rezygnacja z zaglądania');
  assert.ok(!/spód/.test(skip), 'skip NIE odkłada nic na spód (biblioteka nietknięta)');
  const none = commandLabel({ type: 'resolve_fertile_thicket', playerId: 'p1', chosenCardId: null }, session, {});
  assert.match(none, /spód/, 'bez landa — karty na spód');
  assert.ok(!/basic land na wierzch/.test(none), 'zgłoszenie A2: „basic land na wierzch biblioteki” zniknęło');
  const land = commandLabel({ type: 'resolve_fertile_thicket', playerId: 'p1', chosenCardId: 'fa' }, session, {});
  assert.match(land, /Forest na wierzch/);
  assert.match(land, /spód/, 'etykieta mówi też o reszcie na spodzie');
});

test('M260/A1+A2 (log): look jest prywatny; odsłonięty basic land jest jawny', () => {
  const HELPERS = {
    nameOf: (id) => ({ 'fertile-thicket': 'Fertile Thicket' })[id] ?? String(id),
    nameOfObject: (id) => ({ fc: 'Plains' })[id] ?? String(id),
    isPlayer: () => true,
  };
  const NAMES = { p1: 'Ty', p2: 'Nieprzyjaciel' };
  const opis = (event) => describeGameEvent(event, HELPERS, NAMES);

  const started = opis({ type: 'fertile_thicket_reveal_started', controllerId: 'p1', cardCount: 5, basicLandCount: 2, sourceCardId: 'fertile-thicket' });
  assert.match(started, /Fertile Thicket/, 'nazwa karty z danych zdarzenia (m213)');
  assert.match(started, /zajrz/i, 'to jest LOOK, nie odsłonięcie');
  assert.ok(!/bazowych landów/.test(started), 'liczba basic landów to informacja PRYWATNA — wyciek do przeciwnika');

  const skipped = opis({ type: 'fertile_thicket_resolved', controllerId: 'p1', skipped: true, chosenCardId: null, sourceCardId: 'fertile-thicket' });
  assert.match(skipped, /rezygn|nie zagląda/i, 'skip = rezygnacja, nie „odkładanie na spód”');

  const withLand = opis({ type: 'fertile_thicket_resolved', controllerId: 'p1', chosenCardId: 'fc', sourceCardId: 'fertile-thicket' });
  assert.match(withLand, /Plains/, 'odsłonięty basic land jest jawny (Oracle: reveal up to one)');
  assert.match(withLand, /na wierzch/);

  const noLand = opis({ type: 'fertile_thicket_resolved', controllerId: 'p1', chosenCardId: null, sourceCardId: 'fertile-thicket' });
  assert.match(noLand, /spód/, 'bez landa — wszystko na spód');
  assert.ok(!/na wierzch/.test(noLand), 'bez landa NIC nie ląduje na wierzchu');
});

// -----------------------------------------------------------------------------
// B1 — Pyxis of Pandemonium: zakryte wygnanie bez podglądu (CR 406.3)
// -----------------------------------------------------------------------------

function pyxisState() {
  const state = createGameState({ seed: 260, players: [{ id: 'p1' }, { id: 'p2' }] });
  const giant = REGISTRY.get('hill-giant');
  const negate = REGISTRY.get('negate');
  addObject(state, {
    id: 'lib-p1', instanceId: 'i1', cardId: 'hill-giant', controllerId: 'p1', ownerId: 'p1',
    zone: 'library', ...gameObjectDataOf(giant), types: giant.types,
  });
  addObject(state, {
    id: 'lib-p2', instanceId: 'i2', cardId: 'negate', controllerId: 'p2', ownerId: 'p2',
    zone: 'library', ...gameObjectDataOf(negate), types: negate.types, spell: negate.spell,
  });
  addObject(state, {
    id: 'pyxis', instanceId: 'ip', cardId: 'pyxis-of-pandemonium', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', kind: 'artifact', types: ['Artifact'],
  });
  applyEffect(state, { type: 'each_player_exiles_top_face_down' }, state.objects.get('pyxis'), []);
  return state;
}

test('M260/B1 (widok): zakryte wygnanie Pyxis bez tożsamości dla OBU graczy (CR 406.3)', () => {
  const state = pyxisState();
  const exiled = [...state.objects.values()].filter((o) => o.zone === 'exile');
  assert.equal(exiled.length, 2, 'każdy gracz wygnał swoją kartę');
  // Właściciel wygnanej karty też nie może na nią patrzeć — CR 406.3
  // (zgłoszenie B1: gracz podglądał WŁASNE wygnane karty).
  for (const viewer of ['p1', 'p2']) {
    const view = playerView(state, viewer);
    for (const owner of ['p1', 'p2']) {
      const entry = (view.zones.exile ?? []).find((o) => o.controllerId === owner);
      assert.ok(entry, `viewer ${viewer}: karta ${owner} widoczna w exile`);
      assert.equal(entry.cardId, null, `viewer ${viewer}, karta ${owner}: cardId ukryte`);
      assert.equal(entry.faceDown, true, `viewer ${viewer}: znacznik zakrycia`);
      assert.equal(entry.hidden, true, `viewer ${viewer}: brama podglądu (openCardFullscreen)`);
      assert.ok(!('types' in entry), `viewer ${viewer}: bez linii typów (wiedza „to stwór” zmienia decyzje)`);
      assert.ok(!('kind' in entry), `viewer ${viewer}: bez typu`);
      assert.ok(!('spell' in entry), `viewer ${viewer}: bez deskryptora czaru`);
    }
  }
});

test('M260/B1 (kafel): cardInfo maskuje zakryte wygnanie — bez nazwy, typu i podglądu', () => {
  const session = {
    cardDetails: (id) => (id ? { name: 'Hill Giant', types: ['Creature'], imageUri: 'art.png' } : null),
    nameOf: (id) => (id === 'hill-giant' ? 'Hill Giant' : String(id)),
    colorsOf: () => [],
  };
  const entry = { id: 'lib-p1', controllerId: 'p1', zone: 'exile', faceDown: true, hidden: true, cardId: null };
  const info = cardInfo(session, entry);
  assert.equal(info.name, 'Wygnana zakryta', 'nazwa zamaskowana — NIE Hill Giant');
  assert.deepEqual(info.types, [], 'bez linii typów (pole bitwy morph pokazuje Creature — exile nie)');
  assert.equal(info.cardId, null);
  assert.equal(info.imageUri, null);
  assert.equal(info.artId, null);
  assert.equal(info.hiddenArt, null, 'właściciel NIE dostaje podglądu ilustracji (inaczej niż własny morph)');
  assert.equal(info.power ?? null, null, 'bez statystyk');
});

test('M260/B1 → M262 (boks wygnania): zakryta karta Pyxis na stole ze statusem i źródłem', () => {
  // M262: poczekalnia zniknęła — zakryte wygnanie leży w BOKSIE WYGNANIA
  // na stole (jak Plot/Suspend), z jawnym badge źródła przy zamaskowanej
  // tożsamości karty.
  const entry = { id: 'lib-p1', controllerId: 'p1', zone: 'exile', faceDown: true, hidden: true, cardId: null, exiledBy: 'pyxis-of-pandemonium' };
  const other = { id: 'lib-p2', controllerId: 'p2', zone: 'exile', faceDown: true, hidden: true, cardId: null, exiledBy: 'pyxis-of-pandemonium' };
  const view = { zones: { exile: [entry, other] } };
  assert.equal(view.zones.exile.length, 2, 'zakryte wygnanie w boksie — jak Plot/Suspend');
  const status = waitingExileStatus(entry);
  assert.match(status, /[Zz]akryta/, 'status mówi, że karta jest zakryta');
  assert.match(status, /druga zdolność|odkry/, 'status mówi, że odkryje ją druga zdolność źródła');
  // Źródło wygnania jest jawne także dla zakrytej karty (CR 406.3 zakrywa
  // KARTĘ, nie fakt, kto wygnał) — realny przepływ Pyxis w m262-strefy.
  const state = pyxisState();
  for (const viewer of ['p1', 'p2']) {
    for (const e of playerView(state, viewer).zones.exile) {
      assert.equal(e.exiledBy, 'pyxis-of-pandemonium', `viewer ${viewer}: badge źródła Pyxis`);
    }
  }
});

// -----------------------------------------------------------------------------
// B2 — pusta biblioteka: wygnanie ≠ przegrana; przegrana dopiero przy doborze
// -----------------------------------------------------------------------------

test('M260/B2 (scenariusz): Pyxis na pustej bibliotece nie kończy gry; przegrana dopiero przy DOBORZE (CR 704.5m)', () => {
  const state = pyxisState();
  // p1 bez kart w bibliotece od początku (scenariusz właściciela: „miałem 0 kart”)
  state.zones.library = state.zones.library.filter((id) => state.objects.get(id)?.controllerId !== 'p1');
  const r = execute(state, { type: 'pass_priority', playerId: 'p1' });
  assert.ok(r.ok || state.status === 'active');
  assert.equal(state.status, 'active', 'wygnanie Pyxisem przy pustej bibliotece NIE kończy gry');
  const lost = state.events.filter((e) => e.type === 'player_lost');
  assert.equal(lost.length, 0, 'nikt nie przegrywa w momencie aktywacji');
  // Tura p1 → draw step z pustą biblioteką = przegrana (akcja turowa CR 504.1)
  const turnNumber = state.starterId === 'p1' ? 3 : 4;
  state.turn = {
    ...state.turn, number: turnNumber, activePlayerId: 'p1', priorityPlayerId: 'p1',
    stepIndex: 0, phase: 'beginning', step: 'untap', passes: 0, drawnInStep: false,
  };
  let guard = 0;
  while (state.status === 'active' && guard < 60) {
    const res = execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
    if (!res.ok) break;
    guard += 1;
  }
  assert.equal(state.status, 'finished', 'gra kończy się w draw stepie p1');
  const losses = state.events.filter((e) => e.type === 'player_lost');
  assert.ok(losses.some((e) => e.playerId === 'p1' && e.reason === 'empty_library'),
    `próba doboru z pustej biblioteki = przegrana: ${JSON.stringify(losses)}`);
});
