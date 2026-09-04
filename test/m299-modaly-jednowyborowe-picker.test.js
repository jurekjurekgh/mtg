// M299 — audyt modali wyboru (2026-09-03, zlecenie właściciela):
// generalizacja planu pojedynczego wyboru (M298) na CAŁĄ rodzinę komend
// „wybierz jednego kandydata" — raport:
// docs/audits/AUDYT_MODALE_WYBORU_2026-09-03.md §3a.
//
// Przed zmianą ~24 typy resolve_* o kształcie {targetId}/{cardId}/{keepId}/
// {pickId}/{sacrificeLandId}/{armyId} (czasem z wariantem odmowy:
// {done:true}/{skip:true}/{cardId:null}) spadały do awaryjnej ściany
// przycisków, choć to TA SAMA klasa decyzji co resolve_trigger_target
// obsłużony w M298. Po zmianie idą przez ten sam kreator
// (renderMultiTargetWizard: radio + Zatwierdź), a zatwierdzenie oddaje
// komendę z legalCommands (L48 — UI nie wymyśla ruchów).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { choiceRequest } from '../src/protocol/types.js';
import { singleTargetPlanOf, commandForSingleTargetSelection } from '../src/table/multi-target.js';
import { renderMultiTargetWizard } from '../src/table/choice-request.js';

class MiniEl {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.listeners = {};
    this.className = ''; this.text = ''; this.type = ''; this.checked = false;
    this.disabled = false; this.name = ''; this.dataset = {};
  }
  set textContent(value) { this.text = String(value); }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...nodes) { this.children = nodes.flat(); }
  addEventListener(type, listener) { (this.listeners[type] ??= []).push(listener); }
  click() { for (const l of this.listeners.click ?? []) l({ preventDefault() {}, stopPropagation() {} }); }
  emit(type) { for (const l of this.listeners[type] ?? []) l({}); }
  all(pred, out = []) { if (pred(this)) out.push(this); for (const c of this.children) c.all(pred, out); return out; }
  byClass(cls) { return this.all((el) => String(el.className).split(/\s+/).includes(cls)); }
}
globalThis.document = { createElement: (tag) => new MiniEl(tag) };

const VIEW = {
  playerId: 'p1',
  players: [{ id: 'p1', name: 'Ty' }, { id: 'p2', name: 'Nieprzyjaciel' }],
  zones: {
    battlefield: [
      { id: 'cA', cardId: 'karta-a', controllerId: 'p2' },
      { id: 'cB', cardId: 'karta-b', controllerId: 'p1' },
      { id: 'armia', cardId: 'armia-army', controllerId: 'p1' },
    ],
    hand: [{ id: 'h1', cardId: 'reka-1', controllerId: 'p1' }, { id: 'h2', cardId: 'reka-2', controllerId: 'p1' }],
    graveyard: [{ id: 'g1', cardId: 'grob-1', controllerId: 'p1' }, { id: 'g2', cardId: 'grob-2', controllerId: 'p1' }],
    stack: [], library: [],
  },
};
const SESSION = { nameOf: (cardId) => `Karta:${cardId}`, nameOfObject: (id) => `Obiekt:${id}` };

/** Forever Young: {targetId} per karta-stwór z grobu + {done:true}. */
function graveyardTopCommands() {
  return [
    Object.freeze({ type: 'resolve_graveyard_top_choice', playerId: 'p1', targetId: 'g1' }),
    Object.freeze({ type: 'resolve_graveyard_top_choice', playerId: 'p1', targetId: 'g2' }),
    Object.freeze({ type: 'resolve_graveyard_top_choice', playerId: 'p1', done: true }),
  ];
}

test('M299/1: {targetId} + odmowa {done:true} dostaje plan z wierszem odmowy', () => {
  const commands = graveyardTopCommands();
  const plan = singleTargetPlanOf(commands);
  assert.ok(plan, 'rodzina jednowyborowa ma dać plan');
  assert.deepEqual(plan.targets, ['g1', 'g2']);
  assert.equal(plan.allowNone, true, '{done:true} = wiersz odmowy');
  const cmd = commandForSingleTargetSelection(commands, { targetId: 'g2', field: plan.singleField });
  assert.equal(cmd, commands[1], 'dopasowanie przez tożsamość z legalCommands');
  const none = commandForSingleTargetSelection(commands, { targetId: null, field: plan.singleField });
  assert.equal(none, commands[2], 'odmowa dopasowuje wariant {done:true}');
});

test('M299/2: discard {cardId} + {cardId:null} i springbloom {sacrificeLandId} + {skip:true}', () => {
  const discard = [
    Object.freeze({ type: 'resolve_discard_choice', playerId: 'p1', cardId: 'h1' }),
    Object.freeze({ type: 'resolve_discard_choice', playerId: 'p1', cardId: 'h2' }),
    Object.freeze({ type: 'resolve_discard_choice', playerId: 'p1', cardId: null }),
  ];
  const planD = singleTargetPlanOf(discard);
  assert.ok(planD, 'discard do odłożenia = wybór karty');
  assert.equal(planD.singleField, 'cardId');
  assert.equal(planD.allowNone, true);
  const spring = [
    Object.freeze({ type: 'resolve_springbloom', playerId: 'p1', sacrificeLandId: 'l1' }),
    Object.freeze({ type: 'resolve_springbloom', playerId: 'p1', sacrificeLandId: 'l2' }),
    Object.freeze({ type: 'resolve_springbloom', playerId: 'p1', skip: true }),
  ];
  const planS = singleTargetPlanOf(spring);
  assert.ok(planS, 'springbloom = wybór lądu do poświęcenia');
  assert.equal(planS.singleField, 'sacrificeLandId');
  const skip = commandForSingleTargetSelection(spring, { targetId: null, field: 'sacrificeLandId' });
  assert.equal(skip, spring[2], '{skip:true} = odmowa');
});

test('M299/3: rodzina bez odmowy (opponent_target) i armyId (amass)', () => {
  const opp = [
    Object.freeze({ type: 'resolve_opponent_target', playerId: 'p1', targetId: 'cA' }),
    Object.freeze({ type: 'resolve_opponent_target', playerId: 'p1', targetId: 'cB' }),
  ];
  const planO = singleTargetPlanOf(opp);
  assert.ok(planO, 'dwóch kandydatów na cel = plan');
  assert.equal(planO.allowNone, false);
  const amass = [
    Object.freeze({ type: 'resolve_amass_choice', playerId: 'p1', armyId: 'armia', amount: 2 }),
    Object.freeze({ type: 'resolve_amass_choice', playerId: 'p1', armyId: 'armia2', amount: 2 }),
  ];
  assert.ok(singleTargetPlanOf(amass), 'amass: wybór armii przez armyId');
});

test('M299/4: OKNA RZUTU nie łapią się na plan (cardId tam oznacza kartę rzutu, nie wybór)', () => {
  // Dwie różne karty w oknie — bez listy wykluczeń plan pomyliłby okno rzutu
  // z wyborem jednego z dwóch kandydatów i zgubił wymiar cast/stun.
  const window = [
    Object.freeze({ type: 'resolve_exile_cast', playerId: 'p1', objectId: 's1', cardId: 'x1', cast: true }),
    Object.freeze({ type: 'resolve_exile_cast', playerId: 'p1', objectId: 's2', cardId: 'x2', cast: true }),
    Object.freeze({ type: 'resolve_exile_cast', playerId: 'p1', objectId: 's1', cardId: 'x1', cast: false }),
  ];
  assert.equal(singleTargetPlanOf(window), null, 'okno Vaana zostaje w liście przycisków');
});

test('M299/5: pojedynczy kandydat i mieszanka typów nie dają planu', () => {
  assert.equal(singleTargetPlanOf([graveyardTopCommands()[0]]), null);
  const mixed = [graveyardTopCommands()[0], { type: 'resolve_opponent_target', playerId: 'p1', targetId: 'cA' }];
  assert.equal(singleTargetPlanOf(mixed), null);
});

// ---------------------------------------------------------------------------
// KREATOR: radio + wiersz odmowy + Zatwierdź oddaje komendę silnika.
// ---------------------------------------------------------------------------

function renderWizard(plan, commands) {
  const host = new MiniEl('div');
  const completed = [];
  const request = choiceRequest({ id: 'choice-x', type: 'target', options: commands });
  renderMultiTargetWizard(host, {
    view: VIEW, session: SESSION, plan, commands: request.options,
    onComplete: (cmd) => completed.push(cmd),
    onCancel: () => completed.push('cancel'),
  });
  return { host, completed, request };
}

test('M299/6: wizard Forever Young — wybór karty z grobu oddaje jej komendę', () => {
  const commands = graveyardTopCommands();
  const plan = singleTargetPlanOf(commands);
  const { host, completed, request } = renderWizard(plan, commands);
  const labels = host.all((el) => el.tagName === 'label');
  assert.equal(labels.length, 3, 'dwa groby + wiersz odmowy');
  const g2 = labels.find((l) => l.textContent.includes('Karta:grob-2'));
  const input = g2.children.find((c) => c.tagName === 'input');
  input.checked = true; input.emit('change');
  host.byClass('multi-target-confirm')[0].click();
  assert.equal(completed[0], request.options[1], 'komenda g2 z legalCommands (tożsamość)');
});

test('M299/7: wizard — wiersz odmowy oddaje wariant {done:true}', () => {
  const commands = graveyardTopCommands();
  const plan = singleTargetPlanOf(commands);
  const { host, completed, request } = renderWizard(plan, commands);
  const noneRow = host.all((el) => el.tagName === 'label' && /bez wyboru|pomiń|zakończ/i.test(el.textContent))[0];
  assert.ok(noneRow, `wiersz odmowy istnieje: ${host.all((el) => el.tagName === 'label').map((l) => l.textContent).join(' | ')}`);
  const input = noneRow.children.find((c) => c.tagName === 'input');
  input.checked = true; input.emit('change');
  host.byClass('multi-target-confirm')[0].click();
  assert.equal(completed[0], request.options[2], 'odmowa = komenda {done:true}');
});

test('M299/8: pusty wybór to NIE odmowa — Zatwierdź pozostaje wyłączone', () => {
  const commands = graveyardTopCommands();
  const plan = singleTargetPlanOf(commands);
  const { host, completed } = renderWizard(plan, commands);
  const confirm = host.byClass('multi-target-confirm')[0];
  assert.equal(confirm.disabled, true, 'bez zaznaczenia Zatwierdź gaśnie');
  confirm.click();
  assert.equal(completed.length, 0, 'klik w wyłączone Zatwierdź nic nie wysyła');
});
