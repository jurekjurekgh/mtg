// =============================================================================
// Zgłoszenie E właściciela (2026-11-05): Inferno Titan — modal podziału
// 3 obrażeń pozwalał zaznaczyć tylko 0 albo 3 cele, a po wybraniu trójki
// silnik „sam dzielił” 1/1/1. Przyczyna: w openChoiceRequest kreator
// ptaszkowy „do N celów” (upToTargetsPlanOf) przechwytywał decyzję
// triggera PRZED kreatorem podziału obrażeń, a enumeracja wariantów
// silnika (limit 32) ucina warianty 1- i 2-celowe.
//
// Poprawne zachowanie (specyfikacja właściciela): jeden kreator podziału —
// wybór 0–3 celów, każdemu 0–3 obrażeń, suma przydzielonych = 3; zero
// celów znaczy, że obrażenia przepadają (silnik: `upTo`).
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { renderDamageDivisionWizard } from '../src/table/choice-request.js';

const REGISTRY = createCardRegistry();

class MiniEl {
  constructor(tag) { this.tagName = tag; this.children = []; this.listeners = {}; this.className = ''; this.text = ''; this.dataset = {}; this.disabled = false; }
  set textContent(v) { this.text = String(v); this.children = []; }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  set innerHTML(v) { this.text = String(v).replace(/<[^>]*>/g, ''); this.children = []; }
  get innerHTML() { return this.textContent; }
  appendChild(c) { this.children.push(c); return c; }
  replaceChildren(...n) { this.children = n.flat(); }
  addEventListener(t, l) { (this.listeners[t] ??= []).push(l); }
  click() { for (const l of this.listeners.click ?? []) l({}); }
}

function withMiniDom(fn) {
  const old = globalThis.document?.createElement;
  globalThis.document = globalThis.document ?? {};
  globalThis.document.createElement = (tag) => new MiniEl(tag);
  try { return fn(); } finally { if (old) globalThis.document.createElement = old; }
}

function wizard(candidateIds, extra = {}) {
  const host = new MiniEl('div');
  const view = {
    players: [{ id: 'p1', name: 'Ty' }, { id: 'p2', name: 'Nieprzyjaciel' }],
    zones: { battlefield: candidateIds.filter((id) => id.startsWith('c')).map((id) => ({ id, cardId: 'highland-game', controllerId: 'p2' })), hand: [], stack: [], graveyard: [], library: [] },
  };
  const session = { nameOf: (id) => id, nameOfObject: (id) => id, faceDownName: () => 'morph' };
  let result = null;
  renderDamageDivisionWizard(host, {
    view, session, candidateIds, total: 3, maxTargets: 3,
    onComplete: (r) => { result = r; }, onCancel: () => {}, ...extra,
  });
  const walk = (node, acc = []) => { for (const c of node.children ?? []) { acc.push(c); walk(c, acc); } return acc; };
  const all = walk(host);
  return {
    result: () => result,
    confirm: all.find((el) => String(el.className).includes('damage-division-confirm')),
    pluses: all.filter((el) => String(el.className).includes('damage-wizard-plus')),
  };
}

test('E/1: openChoiceRequest obsługuje damage_division PRZED kreatorem „do N celów”', () => {
  const src = fs.readFileSync('src/table/main.js', 'utf8');
  const divisionAt = src.indexOf("if (request.type === 'damage_division')");
  const upToAt = src.indexOf('upToTargetsPlanOf(request.options');
  assert.ok(divisionAt > -1 && upToAt > -1, 'obie gałęzie istnieją w openChoiceRequest');
  assert.ok(divisionAt < upToAt,
    'kreator podziału musi wygrać z ptaszkowym „do N celów”, inaczej modal Tytana nigdy go nie otwiera');
});

test('E/2: kreator podziału (trigger) pozwala potwierdzić ZERO celów — obrażenia przepadają', () => {
  withMiniDom(() => {
    const w = wizard(['c1', 'c2', 'p2'], { allowZeroTargets: true });
    assert.equal(w.confirm.disabled, false, 'przy zerze celów zatwierdzenie ma być aktywne (upTo)');
    w.confirm.click();
    assert.deepEqual(w.result(), { targetIds: [], amounts: [] }, 'pusty wybór = nikt nie dostaje obrażeń');
  });
});

test('E/2b: kreator podziału (trigger) nadal dzieli dowolnie: 2+1 oraz 3 w jeden cel', () => {
  withMiniDom(() => {
    const w = wizard(['c1', 'c2', 'p2'], { allowZeroTargets: true });
    w.pluses[0].click(); w.pluses[0].click(); w.pluses[1].click();
    assert.equal(w.confirm.disabled, false);
    w.confirm.click();
    assert.deepEqual(w.result(), { targetIds: ['c1', 'c2'], amounts: [2, 1] });
  });
  withMiniDom(() => {
    const w = wizard(['c1', 'c2', 'p2'], { allowZeroTargets: true });
    w.pluses[2].click(); w.pluses[2].click(); w.pluses[2].click();
    w.confirm.click();
    assert.deepEqual(w.result(), { targetIds: ['p2'], amounts: [3] }, 'całość w jeden cel (gracza)');
  });
});

test('E/3: kreator podziału BEZ flagi zera (rzut czaru) nadal wymaga co najmniej jednego celu', () => {
  withMiniDom(() => {
    const w = wizard(['c1', 'c2', 'p2']);
    assert.equal(w.confirm.disabled, true, 'rzut czaru dzielonego nie może „zniknąć” — min. 1 cel');
  });
});

// --- Silnik end-to-end (kontrola: silnik był poprawny, UI było błędne) ---

function putReal(state, id, cardId, controllerId, zone = 'battlefield') {
  const def = REGISTRY.get(cardId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
}

function titanDecision() {
  const state = createGameState({ seed: 702, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  putReal(state, 'foe', 'highland-game', 'p2');
  state.objects.set('foe', Object.freeze({ ...state.objects.get('foe'), power: 2, toughness: 4 }));
  putReal(state, 'titan', 'inferno-titan', 'p1', 'hand');
  addMana(state, 'p1', 6, { colors: ['R'] });
  const cast = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_permanent' && c.objectId === 'titan');
  assert.ok(execute(state, cast).ok);
  for (let i = 0; i < 20 && !state.pendingTriggerTargets?.[0]; i += 1) {
    if (state.zones.stack.length > 0) execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
    else break;
  }
  assert.ok(state.pendingTriggerTargets?.[0], 'decyzja ETB otwarta');
  return state;
}

function resolveAll(state) {
  for (let i = 0; i < 30 && state.zones.stack.length > 0; i += 1) {
    execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  }
}

test('E/4: silnik — 0 celów = brak obrażeń; 1 cel = 3; 2 cele = 2+1', () => {
  const s0 = titanDecision();
  assert.ok(execute(s0, { type: 'resolve_trigger_target', playerId: 'p1', targetIds: [] }).ok);
  resolveAll(s0);
  assert.equal(s0.objects.get('foe')?.damage ?? 0, 0, 'zero celów: nikt nie dostaje obrażeń');
  assert.equal(s0.players.find((p) => p.id === 'p2').life, 20);

  const s1 = titanDecision();
  assert.ok(execute(s1, { type: 'resolve_trigger_target', playerId: 'p1', targetIds: ['foe'] }).ok);
  resolveAll(s1);
  assert.equal(s1.objects.get('foe')?.damage ?? 0, 3, 'jeden cel dostaje całość');

  const s2 = titanDecision();
  assert.ok(execute(s2, { type: 'resolve_trigger_target', playerId: 'p1', targetIds: ['foe', 'p2'] }).ok);
  assert.ok(execute(s2, { type: 'resolve_damage_division', playerId: 'p1', amounts: [2, 1] }).ok);
  resolveAll(s2);
  assert.equal(s2.objects.get('foe')?.damage ?? 0, 2, 'podział 2 w stwora');
  assert.equal(s2.players.find((p) => p.id === 'p2').life, 19, 'podział 1 w gracza');
});
