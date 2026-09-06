// M302 — domknięcie wspólnego helpera modali wyboru (decyzja właściciela
// 2026-09-03, doprecyzowanie M301):
//
//   „Nie rozumiem pytania. Czemu te modale wyboru, które wymieniasz wymagają
//   mojej decyzji? Każdy modal wyboru może i powinien mieć ten sam helper,
//   być może z różnymi/dodatkowymi opcjami czy parametrami. Ale podstawa
//   powinna być jedna żeby wszelkie zmiany — np. czcionki, ikonki podglądu
//   itp. — były w jednym miejscu. Czemu 1 kandydat i odmowa (2 opcje) nie
//   mogą być z tego samego helpera na przyciskach?"
//
// Wniosek: plan przyciskowy jest OGÓLNY — każda grupa ≥2 opcji, której nie
// wziął wcześniejszy dedykowany plan/wizard, jedzie przez ten sam komponent
// (wiersze-przyciski). Zero „rodzin odroczonych”: search_choice, undercity,
// grupy „1 kandydat + odmowa” (Jill), wszystko. Awaryjna ściana przycisków
// (renderChoiceRequest) zostaje wyłącznie jako siatka bezpieczeństwa dla
// grup pustych.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { choiceRequest } from '../src/protocol/types.js';
import { buttonsPlanOf, commandForCastWindowSelection } from '../src/table/multi-target.js';
import { renderMultiTargetWizard } from '../src/table/choice-request.js';

class MiniEl {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.listeners = {};
    this.className = ''; this.text = ''; this.type = ''; this.checked = false;
    this.disabled = false; this.name = ''; this.dataset = {};
  }
  set textContent(value) { this.text = String(value); }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  set innerHTML(value) { this.text = String(value).replace(/<[^>]*>/g, ''); }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...nodes) { this.children = nodes.flat(); }
  addEventListener(type, listener) { (this.listeners[type] ??= []).push(listener); }
  click() { for (const l of this.listeners.click ?? []) l({ preventDefault() {}, stopPropagation() {} }); }
  emit(type) { for (const l of this.listeners[type] ?? []) l({}); }
  all(pred, out = []) { if (pred(this)) out.push(this); for (const c of this.children) c.all(pred, out); return out; }
  byClass(cls) { return this.all((el) => String(el.className).split(/\s+/).includes(cls)); }
}
globalThis.document = { createElement: (tag) => new MiniEl(tag) };

const VIEW = { playerId: 'p1', players: [{ id: 'p1', name: 'Ty' }, { id: 'p2', name: 'Nieprzyjaciel' }], zones: { battlefield: [] } };
const SESSION = { nameOf: (cardId) => `Karta:${cardId}`, nameOfObject: (id) => `Obiekt:${id}` };

test('M302/1: „1 kandydat + odmowa” (Jill) dostaje plan przyciskowy — 2 opcje to też wybór', () => {
  const jill = Object.freeze([
    Object.freeze({ type: 'resolve_trigger_target', playerId: 'p1', targetId: 'staff1', friendly: false }),
    Object.freeze({ type: 'resolve_trigger_target', playerId: 'p1', targetId: null, friendly: false }),
  ]);
  const plan = buttonsPlanOf(jill);
  assert.ok(plan, 'grupa jednoopcyjna z odmową NIE zostaje na awaryjnej ścianie');
  assert.equal(plan.buttonsMode, true);
  assert.equal(plan.rows.length, 2);
  assert.deepEqual(plan.rows.map((r) => r.id), ['opt-0', 'opt-1']);
});

test('M302/2: plan przyciskowy jest OGÓLNY — bez listy rodzin i bez limitu 5 opcji', () => {
  // Search_choice (dwa wymiary: karta + miejsce) — dawniej „odroczony”.
  const search = Object.freeze([
    Object.freeze({ type: 'resolve_search_choice', playerId: 'p1', found: 'k1', destination: 'hand' }),
    Object.freeze({ type: 'resolve_search_choice', playerId: 'p1', found: 'k2', destination: 'hand' }),
    Object.freeze({ type: 'resolve_search_choice', playerId: 'p1', found: null }),
  ]);
  assert.ok(buttonsPlanOf(search), 'search_choice jedzie przez wspólny helper');
  // Undercity — wybór pokoju.
  const undercity = Object.freeze([
    Object.freeze({ type: 'resolve_undercity_route', playerId: 'p1', room: 1, roomName: 'Legał' }),
    Object.freeze({ type: 'resolve_undercity_route', playerId: 'p1', room: 2, roomName: 'Kanały' }),
  ]);
  assert.ok(buttonsPlanOf(undercity), 'undercity jedzie przez wspólny helper');
  // Duża grupa (szukanie w bibliotece) — też przyciski helpera, nie ściana.
  const many = Object.freeze(Array.from({ length: 17 }, (_, i) => Object.freeze({
    type: 'resolve_search_choice', playerId: 'p1', found: `k${i}`, destination: 'hand',
  })));
  const planMany = buttonsPlanOf(many);
  assert.ok(planMany, 'grupy >5 opcji też są w helperze (ściana przycisków znika)');
  assert.equal(planMany.rows.length, 17);
  // Mieszane typy (rzadkie, ale możliwe) — przycisk i tak niesie swoją komendę.
  const mixed = Object.freeze([
    Object.freeze({ type: 'resolve_color_choice', playerId: 'p1', color: 'W' }),
    Object.freeze({ type: 'resolve_land_type_choice', playerId: 'p1', landType: 'Plains' }),
  ]);
  assert.ok(buttonsPlanOf(mixed), 'niejednorodna grupa też ma jeden klik = jedna komenda');
  // Pojedyncza opcja nie otwiera modala (panel akcji) — plan niepotrzebny.
  assert.equal(buttonsPlanOf([search[0]]), null);
});

test('M302/3: wizard przyciskowy — odmowa w grupie „1 kandydat + odmowa” to radio + Zatwierdź', () => {
  const jill = Object.freeze([
    Object.freeze({ type: 'resolve_trigger_target', playerId: 'p1', targetId: 'staff1', friendly: false }),
    Object.freeze({ type: 'resolve_trigger_target', playerId: 'p1', targetId: null, friendly: false }),
  ]);
  const plan = buttonsPlanOf(jill);
  plan.rows = [
    { id: 'opt-0', label: 'Jill — zwróć do ręki: White Mage’s Staff (Ty)', cardId: 'staff' },
    { id: 'opt-1', label: 'Jill — nie zwracaj niczego (odmowa)', cardId: null },
  ];
  const host = new MiniEl('div');
  const completed = [];
  const request = choiceRequest({ id: 'c-jill', type: 'command', options: jill });
  renderMultiTargetWizard(host, {
    view: VIEW, session: SESSION, plan, commands: request.options,
    intro: 'Jill, Shiva’s Dominant — cel triggera',
    onComplete: (cmd) => completed.push(cmd),
    onCancel: () => completed.push('cancel'),
  });
  const labels = host.all((el) => el.tagName === 'label');
  assert.equal(labels.length, 2, 'wiersze to radio (label)');
  const confirm = host.byClass('multi-target-confirm')[0];
  assert.ok(confirm, 'Zatwierdź istnieje');
  const declineInput = labels[1].children.find((c) => c.tagName === 'input');
  declineInput.checked = true; declineInput.emit('change');
  assert.equal(completed.length, 0, 'radio samo nie wysyła');
  confirm.click();
  assert.equal(completed[0], request.options[1], 'odmowa = DOKŁADNA komenda targetId:null (L48)');
  // Wybór kandydata z klikalną nazwą karty (A1/A2 cd.).
  const host2 = new MiniEl('div');
  const completed2 = [];
  const previews = [];
  const plan2 = buttonsPlanOf(jill);
  plan2.rows = plan.rows;
  renderMultiTargetWizard(host2, {
    view: VIEW, session: SESSION, plan: plan2, commands: request.options,
    intro: 'Jill, Shiva’s Dominant — cel triggera',
    onOpenCardByCardId: (cardId) => previews.push(cardId),
    onComplete: (cmd) => completed2.push(cmd),
    onCancel: () => {},
  });
  const peeks = host2.byClass('choice-request-peek');
  assert.equal(peeks.length, 0, 'bez osobnego przycisku lupy');
  const cardName = host2.byClass('picker-name')[0];
  assert.equal(cardName.dataset.cardId, 'staff', 'nazwa karty ma cardId do pełnego ekranu');
  cardName.click();
  assert.deepEqual(previews, ['staff'], 'klik w nazwę otwiera pełny ekran karty');
  assert.equal(completed2.length, 0);
});

test('M302/4: routing main.js — plan przyciskowy IDZIE PO wizardach typowanych (scry/surveil/index mają pierwszeństwo)', () => {
  // Strażnik kolejności: gdyby plan przyciskowy ruszył PRZED lookWizardKindOf,
  // grupy scry/surveil/index połknęłyby się jako przyciski i sekwencyjny
  // wizard kart przestałby istnieć. Test czyta źródło routingu.
  const main = readFileSync(new URL('../src/table/main.js', import.meta.url), 'utf8');
  const lookAt = main.indexOf('lookWizardKindOf(request, choiceView)');
  const buttonsAt = main.indexOf('buttonsPlanOf(request.options');
  const combatAt = main.indexOf("request.type === 'declare_attackers'");
  assert.ok(lookAt !== -1 && buttonsAt !== -1 && combatAt !== -1, 'wszystkie punkty routingu istnieją');
  assert.ok(lookAt < buttonsAt, 'wizard scry/surveil/index działa przed ogólnym planem przyciskowym');
  assert.ok(combatAt < buttonsAt, 'wizard walki działa przed ogólnym planem przyciskowym');
});
