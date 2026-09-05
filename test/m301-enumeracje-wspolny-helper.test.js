// M301 — małe enumeracje (audyt modali §3b) i pojedyncze cele castów/aktywacji
// dołączone do wspólnego helpera (decyzja właściciela 2026-09-03):
//
//   „Małe enumeracje 2-5 opcji mogą zostać przy przyciskach, ale warto, żeby
//   to też był element tego samego helpera. Choćby po to, żeby ujednolicić
//   elementy graficzne, podgląd kart targetów itp."
//
// Dwa ruchy:
//  A) rodziny enumeracyjne (kolory, typy lądu, tryby, tak/nie…) dostają plan
//     `buttonsPlanOf` i są rysowane PRZEZ ten sam kreator (wiersze jak
//     picker, podgląd kart, jeden klik = dokładna komenda silnika, L48);
//  B) luka „wskaż cel (1)”: aura castowana na gospodarza i aktywacje z jednym
//     celem niosą `targets[1]`, więc multiTargetPlanOf je odrzucał (rozmiar 1),
//     a singleTargetPlanOf znał tylko cast_spell — padały na ścianę przycisków.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { choiceRequest } from '../src/protocol/types.js';
import {
  singleTargetPlanOf, commandForSingleTargetSelection,
  buttonsPlanOf, commandForCastWindowSelection,
} from '../src/table/multi-target.js';
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

const colorGroup = () => Object.freeze(['W', 'U', 'B', 'R', 'G'].map((color) => Object.freeze({
  type: 'resolve_color_choice', playerId: 'p1', color,
})));
const payGroup = () => Object.freeze([
  Object.freeze({ type: 'resolve_optional_pay_choice', playerId: 'p1', pay: true, sourceId: 's1', cost: 2 }),
  Object.freeze({ type: 'resolve_optional_pay_choice', playerId: 'p1', pay: false, sourceId: 's1', cost: 2 }),
]);

test('M301/1: buttonsPlanOf — mała jednorodna enumeracja daje plan wierszy', () => {
  const colors = buttonsPlanOf(colorGroup());
  assert.ok(colors, 'wybór koloru (5 opcji) ma dać plan');
  assert.equal(colors.buttonsMode, true);
  assert.equal(colors.rows.length, 5, 'wiersz na opcję');
  assert.deepEqual(colors.rows.map((r) => r.id), ['opt-0', 'opt-1', 'opt-2', 'opt-3', 'opt-4']);
  assert.ok(colors.rows.every((r) => r.label === null), 'etykiety wypełnia wywołujący');
  const pay = buttonsPlanOf(payGroup());
  assert.ok(pay, 'tak/nie (2 opcje) ma dać plan');
  assert.equal(pay.rows.length, 2);
});

test('M301/2: buttonsPlanOf — negatyw: grupa <2 opcji nie otwiera modala (panel akcji)', () => {
  assert.equal(buttonsPlanOf([colorGroup()[0]]), null, 'jedna opcja = zwykły przycisk panelu');
  assert.equal(buttonsPlanOf([]), null, 'pusta grupa = brak planu');
  // M302 rozszerzył zakres: >5 opcji, mieszane typy, search_choice i grupy
  // „1 kandydat + odmowa” też dostają plan przyciskowy — patrz testy M302.
});

test('M301/3: luka „wskaż cel (1)” — aura (cast_permanent z targets[1]) dostaje plan pojedynczy', () => {
  const aura = Object.freeze([
    Object.freeze({ type: 'cast_permanent', playerId: 'p1', objectId: 'aura1', targets: ['h1'], bestow: false }),
    Object.freeze({ type: 'cast_permanent', playerId: 'p1', objectId: 'aura1', targets: ['h2'], bestow: false }),
  ]);
  const plan = singleTargetPlanOf(aura);
  assert.ok(plan, 'grupa gospodarzy aury ma dać plan (dziś: ściana przycisków)');
  assert.deepEqual(plan.targets, ['h1', 'h2']);
  assert.equal(plan.maxTargets, 1);
  assert.equal(plan.allowNone, false, 'castu nie można „odmówić” — brak wiersza none');
});

test('M301/4: luka „wskaż cel (1)” — aktywacja z jednym celem (ekwipunek) dostaje plan', () => {
  const equip = Object.freeze([
    Object.freeze({ type: 'activate_ability', playerId: 'p1', objectId: 'eq1', abilityIndex: 0, targets: ['c1'] }),
    Object.freeze({ type: 'activate_ability', playerId: 'p1', objectId: 'eq1', abilityIndex: 0, targets: ['c2'] }),
    Object.freeze({ type: 'activate_ability', playerId: 'p1', objectId: 'eq1', abilityIndex: 0, targets: ['c3'] }),
  ]);
  const plan = singleTargetPlanOf(equip);
  assert.ok(plan, 'wybór celu equip ma dać plan');
  assert.deepEqual(plan.targets, ['c1', 'c2', 'c3']);
  // Mieszanka z wariantem BEZ celu (np. dopłata) nie udaje pojedynczego wyboru.
  const withPay = Object.freeze([...equip, Object.freeze({ type: 'activate_ability', playerId: 'p1', objectId: 'eq1', abilityIndex: 0, payAltCost: true })]);
  assert.equal(singleTargetPlanOf(withPay), null, 'wariant bez celu wyklucza plan');
});

test('M301/5: commandForSingleTargetSelection oddaje DOKŁADNĄ komendę dla cast_permanent i activate_ability', () => {
  const aura = [
    { type: 'cast_permanent', playerId: 'p1', objectId: 'aura1', targets: ['h1'], bestow: false },
    { type: 'cast_permanent', playerId: 'p1', objectId: 'aura1', targets: ['h2'], bestow: false },
  ];
  assert.equal(commandForSingleTargetSelection(aura, { targetId: 'h2' }), aura[1], 'tożsamość z legalCommands');
  assert.equal(commandForSingleTargetSelection(aura, { targetId: 'h3' }), null, 'cel spoza oferty');
  const equip = [
    { type: 'activate_ability', playerId: 'p1', objectId: 'eq1', abilityIndex: 0, targets: ['c1'] },
    { type: 'activate_ability', playerId: 'p1', objectId: 'eq1', abilityIndex: 0, targets: ['c2'] },
  ];
  assert.equal(commandForSingleTargetSelection(equip, { targetId: 'c1' }), equip[0]);
});

function renderEnumWizard(plan, commands) {
  const host = new MiniEl('div');
  const completed = [];
  const previews = [];
  const cancels = [];
  const request = choiceRequest({ id: 'choice-e', type: 'command', options: commands });
  renderMultiTargetWizard(host, {
    view: VIEW, session: SESSION, plan, commands: request.options,
    intro: 'Wybierz: Dobrowolna dopłata',
    onOpenCardByCardId: (cardId) => previews.push(cardId),
    onComplete: (cmd) => completed.push(cmd),
    onCancel: () => cancels.push('cancel'),
  });
  return { host, completed, previews, cancels, request };
}

test('M301/5b: luka pól kosztu — tapCreatureId/tapOtherCreatureId/exileTargetId to też „wybierz jednego”', () => {
  // Wedgelight Rammer (zmierzone żywo): „tapnij innego swojego stwora” —
  // wariant per kandydat, padały na ścianę przycisków mimo kształtu §3a.
  const tap = Object.freeze([
    Object.freeze({ type: 'activate_ability', playerId: 'p1', objectId: 'wr1', abilityIndex: 0, tapCreatureId: 'c1' }),
    Object.freeze({ type: 'activate_ability', playerId: 'p1', objectId: 'wr1', abilityIndex: 0, tapCreatureId: 'c2' }),
    Object.freeze({ type: 'activate_ability', playerId: 'p1', objectId: 'wr1', abilityIndex: 0, tapCreatureId: 'c3' }),
  ]);
  const plan = singleTargetPlanOf(tap);
  assert.ok(plan, 'wybór stwora do tapnięcia ma dać plan');
  assert.deepEqual(plan.targets, ['c1', 'c2', 'c3']);
  assert.equal(commandForSingleTargetSelection(tap, { targetId: 'c2', field: 'tapCreatureId' }), tap[1], 'tożsamość (L48)');
  // Makeshift Mauler: koszt „wygnij kartę stwora” — wariant per kandydat.
  const exile = Object.freeze([
    Object.freeze({ type: 'cast_permanent', playerId: 'p1', objectId: 'mm1', exileTargetId: 'g1' }),
    Object.freeze({ type: 'cast_permanent', playerId: 'p1', objectId: 'mm1', exileTargetId: 'b1' }),
  ]);
  const exilePlan = singleTargetPlanOf(exile);
  assert.ok(exilePlan, 'wybór karty do wygnania w koszcie ma dać plan');
  assert.equal(commandForSingleTargetSelection(exile, { targetId: 'b1', field: 'exileTargetId' }), exile[1]);
});

test('M301/6: wizard enumeracji — wiersz to radio, wybór zatwierdzamy przyciskiem „Zatwierdź”', () => {
  const plan = buttonsPlanOf(payGroup());
  plan.rows = plan.rows.map((row, i) => ({ ...row, label: i === 0 ? 'Zapłać — efekt odpali' : 'Nie płać', cardId: null }));
  const { host, completed, request } = renderEnumWizard(plan, payGroup());
  // A1/A2 cd. (zgłoszenie właściciela: modal z lupą → radio + Zatwierdź):
  // tryb przyciskowy używa TEGO SAMEGO komponentu co okna rzutu — wiersz
  // z radiem (label + input), wspólny przycisk Zatwierdź, brak „klik raz = decyzja”.
  const labels = host.all((el) => el.tagName === 'label');
  assert.ok(labels.length >= 2, 'wiersze to picker label (radio)');
  const confirm = host.byClass('multi-target-confirm');
  assert.equal(confirm.length, 1, 'tryb przyciskowy MA przycisk „Zatwierdź”');
  assert.ok(confirm[0].disabled, 'Zatwierdź wyłączony przed wyborem');
  // Zaznaczamy wiersz (ustawiamy input.checked + change) — wybór NIE jest
  // wysyłany od razu (ten sam wzorzec co w M300/5 dla okien rzutu).
  const secondInput = labels[1].children.find((c) => c.tagName === 'input');
  secondInput.checked = true; secondInput.emit('change');
  assert.equal(completed.length, 0, 'zaznaczenie radio nie wysyła decyzji');
  assert.ok(!confirm[0].disabled, 'Zatwierdź włączony po wyborze');
  confirm[0].click();
  assert.equal(completed.length, 1, 'Zatwierdź wysyła decyzję');
  assert.equal(completed[0], request.options[1], 'tożsamość komendy z legalCommands (L48)');
});

test('M301/7: wizard enumeracji — nazwa karty klikalna (podgląd) i Anuluj bez decyzji', () => {
  const group = Object.freeze([
    Object.freeze({ type: 'resolve_modal_choice', playerId: 'p1', modeIndex: 0, cardId: 'k-pierwsza' }),
    Object.freeze({ type: 'resolve_modal_choice', playerId: 'p1', modeIndex: 1, cardId: 'k-druga' }),
  ]);
  const plan = buttonsPlanOf(group);
  plan.rows = group.map((cmd, i) => ({ id: `opt-${i}`, label: `Tryb ${i + 1}`, cardId: cmd.cardId }));
  const { host, completed, previews, cancels } = renderEnumWizard(plan, group);
  // A1/A2 cd.: osobne przyciski 🔍 zniknęły — nazwa karty jest klikalna
  // (picker-name + log-card + dataset.cardId, ten sam wzorzec co M300/6).
  const peeks = host.byClass('choice-request-peek');
  assert.equal(peeks.length, 0, 'bez osobnego przycisku lupy — nazwa karty jest klikalna');
  const cardNames = host.byClass('picker-name');
  assert.ok(cardNames.length >= 2, 'klikalne nazwy w wierszach');
  assert.equal(cardNames[0].dataset.cardId, 'k-pierwsza', 'nazwa nosi cardId do pełnego ekranu');
  cardNames[0].click(); // otwiera pełny ekran karty
  assert.deepEqual(previews, ['k-pierwsza'], 'podgląd otwiera kartę opcji');
  assert.equal(completed.length, 0, 'podgląd NIE jest wyborem');
  const cancel = host.byClass('multi-target-cancel')[0];
  assert.ok(cancel, 'wspólny przycisk Anuluj');
  cancel.click();
  assert.deepEqual(cancels, ['cancel']);
  assert.equal(completed.length, 0);
});

test('M301/8: wiersze enumeracji niosą klucz sondy (optionKey) jak ściana przycisków', () => {
  const cmds = payGroup();
  const plan = buttonsPlanOf(cmds);
  plan.rows = plan.rows.map((row, i) => ({ ...row, label: `Opcja ${i}`, cardId: null }));
  const { host } = renderEnumWizard(plan, cmds);
  const rows = host.byClass('choice-request-option');
  assert.ok(rows.every((r) => typeof r.dataset.optionKey === 'string' && r.dataset.optionKey.length > 0),
    'sonda Żywego Testera czyta optionKey (M104) — nie może zniknąć w nowym helperze');
  // Komenda spod wiersza wraca przez wspólny lookup opt-N (tożsamość).
  assert.equal(commandForCastWindowSelection(cmds, 'opt-1'), cmds[1]);
});
