// Uwaga O (właściciel, 2026-10-16): Wrap in Flames — „deals 1 damage to each of
// up to three target creatures”. Kreator wyboru pozwalał zaznaczyć tylko jedną
// kreaturę; 0, 2 i 3 nie dało się wybrać i zatwierdzić.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { jumpToStep } from '../src/engine/turn.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { multiTargetPlanOf } from '../src/table/multi-target.js';
import { renderMultiTargetWizard } from '../src/table/choice-request.js';

const REGISTRY = createCardRegistry();

/** Minimalny DOM jak w test/m195 (klik w ptaszek zmienia zaznaczenie). */
function withMiniDom(run) {
  class MiniEl {
    constructor(tag) {
      this.tagName = tag; this.children = []; this.listeners = {};
      this.className = ''; this.text = ''; this.dataset = {}; this.disabled = false;
      this.type = ''; this.checked = false;
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
        for (const l of input.listeners.change ?? []) l({ stopPropagation() {}, preventDefault() {} });
        return;
      }
      for (const l of this.listeners.click ?? []) l({});
    }
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

function stol(liczba = 3) {
  const state = createGameState({ seed: 3, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  state.pendingMulligans = [];
  const def = REGISTRY.get('wrap-in-flames');
  addObject(state, {
    id: 'wrap', instanceId: 'i-wrap', cardId: 'wrap-in-flames', controllerId: 'p1', ownerId: 'p1', zone: 'hand',
    ...gameObjectDataOf(def), types: def.types, keywords: [], subtypes: [], spell: def.spell,
  });
  for (let i = 1; i <= liczba; i += 1) {
    const id = `c${i}`;
    addObject(state, {
      id, instanceId: `i-${id}`, cardId: 'hill-giant', controllerId: i % 2 ? 'p2' : 'p1', ownerId: i % 2 ? 'p2' : 'p1', zone: 'battlefield',
      kind: 'creature', power: 3, toughness: 3, manaCost: 2, abilities: [], keywords: [], subtypes: [],
      types: ['Creature'], colors: ['R'],
    });
  }
  addMana(state, 'p1', 4, { colors: ['R', 'R', 'R', 'R'] });
  return state;
}

/** Kreator z prawdziwych komend silnika; zwraca zatwierdzoną komendę (albo null). */
function zatwierdz(wybrane, liczba = 3) {
  const state = stol(liczba);
  const view = playerView(state, 'p1');
  const commands = view.legalCommands.filter((c) => c.type === 'cast_spell' && c.objectId === 'wrap');
  const plan = multiTargetPlanOf(commands);
  let submitted = null;
  let confirmDisabled = null;
  let rows = 0;
  withMiniDom((host) => {
    renderMultiTargetWizard(host, {
      view, session: { nameOf: (id) => id, nameOfObject: (id) => id, faceDownName: () => 'morph' },
      plan, commands, sourceName: 'Wrap in Flames',
      onComplete: (cmd) => { submitted = cmd; }, onCancel: () => {},
    });
    const toggles = host.findAll((n) => String(n.className).includes('multi-target-toggle'));
    rows = toggles.length;
    for (const i of wybrane) toggles[i]?.click();
    const confirm = host.find((n) => String(n.className).includes('multi-target-confirm'));
    confirmDisabled = confirm?.disabled ?? null;
    confirm?.click();
  });
  return { submitted, confirmDisabled, rows, commands, state, plan };
}

test('O/1: kreator pokazuje wszystkie trzy kreatury jako cele', () => {
  const r = zatwierdz([]);
  assert.equal(r.rows, 3, `trzy wiersze celów (jest ${r.rows})`);
});

test('O/2: można zatwierdzić wybór 0 celów (up to)', () => {
  const r = zatwierdz([]);
  assert.equal(r.confirmDisabled, false, 'Zatwierdź aktywne przy 0 celach');
  assert.ok(r.submitted && r.submitted.targets.length === 0, `komenda bez celów: ${JSON.stringify(r.submitted)}`);
});

test('O/3: można zatwierdzić 1 cel', () => {
  const r = zatwierdz([0]);
  assert.ok(r.submitted && r.submitted.targets.length === 1, `1 cel: ${JSON.stringify(r.submitted)}`);
});

test('O/4: można zatwierdzić 2 cele', () => {
  const r = zatwierdz([0, 2]);
  assert.ok(r.submitted && r.submitted.targets.length === 2, `2 cele: ${JSON.stringify(r.submitted)}`);
  assert.ok(r.commands.includes(r.submitted), 'komenda z legalCommands');
});

test('O/5: można zatwierdzić 3 cele', () => {
  const r = zatwierdz([0, 1, 2]);
  assert.ok(r.submitted && r.submitted.targets.length === 3, `3 cele: ${JSON.stringify(r.submitted)}`);
});

// Oferta ucięta limitem (7 stworów → zero kombinacji po dwa cele). Kreator musi
// dać wybrać dowolny zestaw, a silnik waliduje wynik.
test('O/6: 7 stworów — 2 cele zatwierdzalne (oferta KOMPLETNA, O-2 zlecenie 2026-10-17)', () => {
  const r = zatwierdz([0, 2], 7);
  assert.ok(r.submitted && r.submitted.targets.length === 2, `2 cele: ${JSON.stringify(r.submitted)}`);
  // C(7,2) = 21 dwuelementowych kombinacji — wszystkie w ofercie, bez limitu.
  assert.equal(r.commands.filter((c) => c.targets.length === 2).length, 21, 'kontrola: pełna oferta par');
});

test('O/7: 7 stworów — dowolna trójka jest w ofercie i wykonuje się w silniku', () => {
  const r = zatwierdz([0, 3, 6], 7);
  assert.ok(r.submitted && r.submitted.targets.length === 3, `3 cele: ${JSON.stringify(r.submitted)}`);
  assert.ok(r.commands.some((c) => c.targets.length === 3), 'kontrola: trójki są w ofercie');
  const res = execute(r.state, r.submitted);
  assert.equal(res.ok, true, `silnik przyjmuje komendę z wybranymi celami: ${res.events?.[0]?.reason ?? ''}`);
});

test('O/8: 7 stworów — 0 celów zatwierdzalne', () => {
  const r = zatwierdz([], 7);
  assert.equal(r.confirmDisabled, false);
  assert.ok(r.submitted && r.submitted.targets.length === 0);
});

test('O/9: 3 stwory — oferta jest kompletna (C(3,0..3) = 1+3+3+1 = 8 kombinacji)', () => {
  const state = stol(3);
  const commands = playerView(state, 'p1').legalCommands.filter((c) => c.objectId === 'wrap');
  assert.equal(commands.length, 8);
});

test('O/10: 40 stworów — oferta obejmuje KAŻDĄ parę i trójkę (bez limitu), a 3 cele z końca stołu działają', () => {
  const r = zatwierdz([37, 38, 39], 40);
  assert.ok(r.submitted && r.submitted.targets.length === 3, `3 cele z końca: ${JSON.stringify(r.submitted)}`);
  // 1 + 40 + C(40,2) + C(40,3) = 1 + 40 + 780 + 9880 = 10701 kombinacji.
  assert.equal(r.commands.length, 10701);
  const res = execute(r.state, r.submitted);
  assert.equal(res.ok, true, `silnik przyjmuje trójkę z końca stołu: ${res.events?.[0]?.reason ?? ''}`);
});

test('O/11 (audyt PR #166, O-1): 7 stworów — 4 cele przy max 3: „Zatwierdź” wyłączone, komenda nie powstaje', () => {
  // Tryb wolnych celów składa komendę z dowolnego zaznaczenia; bez strażnika
  // limitu kreator pozwalał zatwierdzić 4 cele, a silnik odrzucał to dopiero
  // przy wykonaniu (zmierzone: confirmDisabled=false, illegal_spell:liczba celów).
  const r = zatwierdz([0, 1, 2, 3], 7);
  assert.equal(r.confirmDisabled, true, 'kreator nie zatwierdza ponad maxTargets');
  assert.equal(r.submitted, null);
});


test('O/13 (O-2, lekki): 30 stworów — oferta kompletna i bez błędu (1 + 30 + C(30,2) + C(30,3) = 4526)', () => {
  // Lekka wersja regresji O-2 (zlecenie właściciela 2026-10-17: test ma być lekki).
  // Pełne 100 stworów (166751 ofert, ~21 s decyzji bota) NIE wchodzi do suite. Ten test
  // pilnuje tego, co realnie może się zepsuć: kompletności wyliczenia i braku błędu przy
  // szerokim stole. Przy `push(...tablica)` wyjątek „Maximum call stack size exceeded”
  // pojawia się dopiero przy ~10^5 elementach, więc tu jest to test poprawności, nie stosu.
  const state = stol(30);
  const view = playerView(state, 'p1');
  const commands = view.legalCommands.filter((c) => c.type === 'cast_spell' && c.objectId === 'wrap');
  assert.equal(commands.length, 4526);
});
