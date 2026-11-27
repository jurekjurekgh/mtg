// Zgłoszenie właściciela F1 (2026-11-21, Lash of the Balrog):
//   „Modal, w którym wybiera się dwie akcje, MUSI być zbudowany jako
//    grupowy, a NIE jako permutacja wszystkich kombinacji. MASZ NATYCHMIAST
//    SKASOWAĆ W KODZIE WSZELKIE FRAGMENTY, KTÓRE MOGĄ ROBIĆ PERMUTACYJNE
//    MODALE! NAWET FALLBACKI! Dodaj test, który czerwieni się na JAKIMKOLWIEK
//    modalu permutacji wyboru.”
//
// Kontrakt (właściciel): multi-target = grupy: jedna grupa z celami pierwszej
// zdolności, druga grupa z celami drugiej zdolności; resolve z JEDNYM
// wyborem na grupę — „NIE TAK JAK W TEJ KARCIE” (permutacja).
//
// Reguła F3 (właściciel): legalność sprawdza się TYLKO dla WYBRANEJ
// kombinacji, nigdy przez porównanie wybranej ze wszystkimi możliwymi.
//
// Testy są RED na starym kodzie (plan mieszany = null, strażnik nie wykrywa
// krzyża skalarnego) i GREEN po poprawce: sacrificeCastPlanOf obsługuje
// grupy mieszane (cel × poświęcenie-albo-zapłata), strażnik
// assertNoCombinationRows fail-closed wykrywa pełny krzyż wymiarów.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sacrificeCastPlanOf, commandForSacrificeSelection, singleTargetPlanOf,
  buttonsPlanOf, ALT_PAY_ROW_ID,
} from '../src/table/multi-target.js';
import { assertNoCombinationRows } from '../src/table/no-combination-rows.js';
import { renderMultiTargetWizard } from '../src/table/choice-request.js';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';

// ---------------------------------------------------------------------------.
// Minimalny DOM (wzorzec z m257r5) — render jest czysty, bez jsdom.
// ---------------------------------------------------------------------------
function withMiniDom(run) {
  class MiniEl {
    constructor(tag) {
      this.tagName = tag; this.children = []; this.listeners = {};
      this.className = ''; this.text = ''; this.dataset = {}; this.disabled = false;
      this.style = {}; this.type = ''; this.checked = false;
      this.classList = { toggle: () => {}, add: () => {}, remove: () => {} };
    }
    set textContent(v) { this.text = String(v); this.children = []; }
    get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
    appendChild(c) { this.children.push(c); return c; }
    replaceChildren(...n) { this.children = n.flat(); }
    addEventListener(t, l) { (this.listeners[t] ??= []).push(l); }
    click() {
      const input = this.tagName === 'input' ? this
        : (this.children ?? []).find((c) => c.tagName === 'input') ?? null;
      if (input && (input.type === 'checkbox' || input.type === 'radio')) {
        if (input.disabled) return;
        input.checked = input.type === 'radio' ? true : !input.checked;
        for (const l of input.listeners.change ?? []) l({});
        return;
      }
      for (const l of this.listeners.click ?? []) l({});
    }
    fire(type, e = {}) { for (const l of this.listeners[type] ?? []) l(e); }
    all() { return [this, ...this.children.flatMap((c) => (c.all ? c.all() : [c]))]; }
    find(pred) { return this.all().find(pred); }
    findAll(pred) { return this.all().filter(pred); }
  }
  globalThis.document = globalThis.document ?? {};
  const old = globalThis.document.createElement;
  globalThis.document.createElement = (tag) => new MiniEl(tag);
  try { return run(new MiniEl('div')); } finally {
    if (old) globalThis.document.createElement = old; else delete globalThis.document.createElement;
  }
}

// ---------------------------------------------------------------------------.
// Grupa mieszana Lash z PRAWDZIWEGO silnika (2 własne stwory × 2 wrogie):
// 12 komend = cel × (poświęć m0 | poświęć m1 | zapłać {4}).
// ---------------------------------------------------------------------------.
function engineLashOffers() {
  const REG = createCardRegistry();
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  addMana(state, 'p1', 10, { colors: ['W', 'U', 'B', 'R', 'G'] });
  const put = (id, cardId, ctrl, zone, patch = {}) => {
    const def = REG.get(cardId);
    addObject(state, {
      id, instanceId: `i-${id}`, cardId, controllerId: ctrl, ownerId: ctrl, zone,
      ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
      subtypes: def.subtypes ?? [], spell: def.spell, ...patch,
    });
    return state.objects.get(id);
  };
  const cre = (id, ctrl) => {
    addObject(state, {
      id, instanceId: `i-${id}`, cardId: `t-${id}`, controllerId: ctrl, ownerId: ctrl,
      zone: 'battlefield', kind: 'creature', power: 2, toughness: 2, manaCost: 1,
      abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [],
    });
    const obj = state.objects.get(id);
    state.objects.set(id, { ...obj, summoningSickness: false });
  };
  cre('m0', 'p1'); cre('m1', 'p1'); cre('f0', 'p2'); cre('f1', 'p2');
  put('lash', 'lash-of-the-balrog', 'p1', 'hand');
  // Tak jak dyspozycja stołu: `request.options` pochodzi z view.legalCommands
  // (playerView dokleja `type: 'cast_spell'` przez command()).
  const offers = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'cast_spell' && c.objectId === 'lash');
  assert.ok(offers.length >= 12, `silnik daje pełny iloczyn, jest ${offers.length}`);
  return offers;
}

test('F1/1: grupa mieszana z silnika dostaje PLAN grupowy (cel + poświęcenie-albo-zapłata)', () => {
  const offers = engineLashOffers();
  const plan = sacrificeCastPlanOf(offers, { altPayAmount: 4 });
  assert.ok(plan, 'mieszana grupa MUSI iść kreatorem grupowym, nie listą permutacji');
  assert.equal(plan.sacrificeMode, true);
  assert.equal(plan.altPay, true, 'plan zna wariant zapłaty');
  assert.equal(plan.altPayAmount, 4, 'kwota {4} z additionalCost.orPayMana');
  assert.deepEqual([...plan.sacrifices].sort(), ['m0', 'm1'], 'ofiary z wariantów poświęcenia');
  assert.ok(plan.targets.length >= 4, 'pula celów = cele z wariantów');
  assert.equal(singleTargetPlanOf(offers), null,
    'wybór samego celu zgubiłby ofiarę albo payAltCost (CR 601.2b)');
});

test('F1/2: commandForSacrificeSelection — payAlt tylko z jawnym payAlt:true', () => {
  const offers = engineLashOffers();
  const pay = commandForSacrificeSelection(offers, { targets: ['f0'], payAlt: true });
  assert.ok(pay, 'wariant zapłaty dostępny z wiersza „Zapłać {4}”');
  assert.equal(pay.payAltCost, true);
  assert.equal(commandForSacrificeSelection(offers, { targets: ['f0'], sacrifice: null }), null,
    'sama-ofiara-null NIE może trafić w zapłatę (L48: jasna decyzja)');
  const sac = commandForSacrificeSelection(offers, { targets: ['f0'], sacrifice: 'm0' });
  assert.ok(sac && sac.sacrificeTargetId === 'm0' && !sac.payAltCost);
  assert.equal(commandForSacrificeSelection(offers, { targets: ['f0'], sacrifice: 'zzz' }), null);
});

test('F1/3: strażnik — KAŻDY pełny krzyż wymiarów jest zakazany na liście', () => {
  // (a) prawdziwa grupa Lash z silnika (cel × poświęć/zapłać).
  const lash = engineLashOffers();
  assert.throws(() => assertNoCombinationRows(lash), /permutacji kombinacji/,
    'grupa Lash z silnika = permutacja → strażnik musi krzyczeć');
  // (b) syntetyczny krzyż cel × payAlt (skalary + treść targets).
  const synthetic = [
    { type: 'cast_spell', objectId: 'x', targets: ['t1'], sacrificeTargetId: 's1' },
    { type: 'cast_spell', objectId: 'x', targets: ['t1'], payAltCost: true },
    { type: 'cast_spell', objectId: 'x', targets: ['t2'], sacrificeTargetId: 's1' },
    { type: 'cast_spell', objectId: 'x', targets: ['t2'], payAltCost: true },
  ];
  assert.throws(() => assertNoCombinationRows(synthetic), /permutacji kombinacji/,
    'krzyż 2×2 na liście = zakaz (nawet fallback)');
  // (c) krzyż TRÓJWYMIAROWY 2×2×2.
  const triple = [];
  for (const a of ['a1', 'a2']) for (const b of ['b1', 'b2']) for (const c of ['c1', 'c2']) {
    triple.push({ type: 'cast_spell', objectId: 'y', targets: [a], fieldB: b, fieldC: c });
  }
  assert.throws(() => assertNoCombinationRows(triple), /permutacji kombinacji/,
    'krzyż 2×2×2 na liście = zakaz');
  // (d) lista jednowymiarowa ZOSTAJE listą (Village Rites: same ofiary).
  assertNoCombinationRows([
    { type: 'cast_spell', objectId: 'v', targets: [], sacrificeTargetId: 's1' },
    { type: 'cast_spell', objectId: 'v', targets: [], sacrificeTargetId: 's2' },
  ], null, {});
  // (e) skorelowane pola (resolve_trigger_order: eventId wyznacza kartę) —
  // brak pełnego krzyża → brak fałszywego alarmu (3 wiersze ≠ 2×2).
  assertNoCombinationRows([
    { type: 'resolve_trigger_order', cardId: 'c1', eventId: 'e1' },
    { type: 'resolve_trigger_order', cardId: 'c2', eventId: 'e1' },
    { type: 'resolve_trigger_order', cardId: 'c1', eventId: 'e2' },
  ], null, {});
  // (f) dedykowane okno rzutu (M300) ma wyłączenie reguły.
  assertNoCombinationRows(synthetic, null, { allowScalarProduct: true });
});

test('F1/4: modal permutacji NIE renderuje się nawet przyciskowym fallbackiem', () => {
  const lash = engineLashOffers();
  const buttons = buttonsPlanOf(lash);
  assert.ok(buttons && buttons.buttonsMode, 'fallback w ogóle powstaje — i TO jest problem do zamknięcia');
  // Rzut przez renderMultiTargetWizard (linia wejścia strażnika) musi
  // krzyczeć — RED na starym kodzie (stary guard puszczał taką listę).
  assert.throws(() => renderMultiTargetWizard(new (class { appendChild() {} })(), {
    view: { players: [], zones: {} },
    session: { nameOf: (id) => id, nameOfObject: (id) => id },
    plan: buttons,
    commands: lash,
    onComplete: () => {},
  }), /permutacji kombinacji|kombinacji lub kolejności/);
});

const LASH_VIEW = {
  playerId: 'p1',
  players: [{ id: 'p1', name: 'Ty' }, { id: 'p2', name: 'Nieprzyjaciel' }],
  zones: {
    battlefield: [
      { id: 'm0', cardId: 'hill-giant', controllerId: 'p1', zone: 'battlefield' },
      { id: 'm1', cardId: 'hill-giant', controllerId: 'p1', zone: 'battlefield' },
      { id: 'f0', cardId: 'hill-giant', controllerId: 'p2', zone: 'battlefield' },
      { id: 'f1', cardId: 'hill-giant', controllerId: 'p2', zone: 'battlefield' },
    ],
    hand: [{ id: 'lash', cardId: 'lash-of-the-balrog' }],
    stack: [], graveyard: [], library: [], exile: [],
  },
};
const LASH_SESSION = {
  nameOf: (cardId) => ({ 'hill-giant': 'Hill Giant', 'lash-of-the-balrog': 'Lash of the Balrog' }[cardId] ?? cardId),
  nameOfObject: (id) => id,
  nameOrdinalSuffix: () => '',
};

test('F1/5: kreator Lash — DWIE sekcje, wiersz „Zapłać {4}”, komenda z legalCommands', () => {
  const lash = engineLashOffers();
  const plan = sacrificeCastPlanOf(lash, { altPayAmount: 4 });
  assert.ok(plan);
  withMiniDom((host) => {
    let done = null;
    renderMultiTargetWizard(host, {
      view: LASH_VIEW, session: LASH_SESSION, plan, commands: lash,
      sourceName: 'Lash of the Balrog',
      slotLabels: ['cel', 'Poświęcenie (koszt) albo zapłata'],
      onComplete: (cmd) => { done = cmd; },
    });
    const labels = host.findAll((n) => String(n.className).includes('multi-target-slot-label'))
      .map((n) => n.textContent);
    assert.ok(labels.some((l) => l.includes('cel')), `sekcja celu (${JSON.stringify(labels)})`);
    assert.ok(labels.some((l) => l.includes('Poświęcenie')), 'sekcja kosztu');
    const rows = host.findAll((n) => String(n.className).includes('multi-target-toggle'));
    // 4 cele + 2 ofiary + 1 wiersz zapłaty = 7 wierszy (NIE 12 kombinacji).
    assert.equal(rows.length, 7, `liczba wierszy: ${rows.length}`);
    // Tekst siedzi w wierszach `multi-target-row` (toggle = sam input).
    const rowEls = host.findAll((n) => String(n.className).includes('multi-target-row'));
    const payRowEl = rowEls.find((r) => r.textContent.includes('Zapłać {4} zamiast poświęcenia'));
    assert.ok(payRowEl, `wiersz „Zapłać {4}” jest w sekcji kosztu; wiersze: ${rowEls.map((r) => r.textContent).join(' | ')}`);
    const payRow = (payRowEl.children ?? []).find((c) => String(c.tagName).toLowerCase() === 'input');
    assert.ok(payRow, 'ptaszek wiersza zapłaty');
    const confirmBtn = host.find((n) => String(n.className).includes('multi-target-confirm'));
    assert.ok(confirmBtn.disabled, 'bez wyborów nie zatwierdza się');
    // Kolejność wierszy: 4 cele (sekcja celu) + 2 ofiary + wiersz zapłaty.
    const targetRows = rows.slice(0, 4);
    const sacRows = rows.slice(4, 6);
    assert.equal(rows[6], payRow, 'wiersz zapłaty na końcu sekcji kosztu');
    // Wybór 1: cel + ZAPŁATA → komenda payAltCost z oferty silnika (L48).
    targetRows[0].click();
    assert.ok(confirmBtn.disabled, 'cel bez kosztu = nie zatwierdza');
    payRow.click();
    assert.ok(!confirmBtn.disabled, 'cel + zapłata = zatwierdź aktywne');
    confirmBtn.click();
    assert.ok(done, 'onComplete otrzymał komendę');
    assert.equal(done.payAltCost, true, 'to wariant zapłaty {4}');
    assert.ok(lash.includes(done), 'komenda to WŁAŚNIE komenda z legalCommands (L48)');
    // Wybór 2: cel + POŚWIĘCIE → wariant poświęcenia (ta sama sekcja, radio).
    done = null;
    targetRows[1].click();
    sacRows[0].click();
    assert.ok(!confirmBtn.disabled, 'cel + poświęcenie = zatwierdź aktywne');
    confirmBtn.click();
    assert.ok(done && done.sacrificeTargetId && !done.payAltCost, 'wariant poświęcenia z oferty');
    assert.ok(lash.includes(done));
  });
});

test('F1/6: ALT_PAY_ROW_ID jest stabilnym symbolem wiersza zapłaty', () => {
  assert.equal(typeof ALT_PAY_ROW_ID, 'string');
  assert.ok(ALT_PAY_ROW_ID.startsWith('__'));
});
