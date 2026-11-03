// Zgłoszenie właściciela N: {X}{R}{R}, trzy Góry -> jeden modal X=0..1.
// UI wybiera istniejącą legalną komendę, a nie tworzy nowej.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView, execute } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { buildActionEntries, choiceGroupTitle } from '../src/table/render.js';
import { renderMultiTargetWizard } from '../src/table/choice-request.js';
import { multiTargetPlanOf, commandForSelection } from '../src/table/multi-target.js';
import { paymentDescriptorOf, shouldOpenManaWizard } from '../src/table/mana-wizard.js';

const registry = createCardRegistry();
function scene(mountains = 3, islands = 0) {
  const state = createGameState({ seed: 1301, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  state.pendingMulligans = [];
  function put(id, cardId, zone) {
    const def = registry.get(cardId);
    addObject(state, { id, instanceId: `i-${id}`, cardId, controllerId: 'p1', ownerId: 'p1', zone,
      ...gameObjectDataOf(def), types: def.types ?? [], subtypes: def.subtypes ?? [], keywords: def.keywords ?? [] });
  }
  put('magma', 'magma-pummeler', 'hand');
  for (let i = 0; i < mountains; i++) put(`m${i}`, 'basic-mountain', 'battlefield');
  for (let i = 0; i < islands; i++) put(`i${i}`, 'basic-island', 'battlefield');
  const view = playerView(state, 'p1');
  const session = { state, nameOf: id => registry.get(id)?.name ?? id, cardDetails: id => registry.get(id) ?? null };
  const entries = buildActionEntries(view.legalCommands.filter(c => c.type !== 'concede'), session, view);
  return { state, view, session, entries, options: view.legalCommands.filter(c => c.type === 'cast_permanent' && c.objectId === 'magma') };
}
class MiniEl {
  constructor(tag) { this.tagName = tag; this.children = []; this.listeners = {}; this.className = ''; this.text = ''; this.html = ''; this.type = ''; this.checked = false; this.disabled = false; this.dataset = {}; }
  set textContent(v) { this.text = String(v); this.html = ''; this.children = []; }
  get textContent() { return this.text + this.children.map(c => c.textContent).join(''); }
  set innerHTML(v) { this.html = String(v); this.text = String(v).replace(/<[^>]*>/g, ''); this.children = []; }
  get innerHTML() { return (this.html || this.text) + this.children.map(c => c.innerHTML).join(''); }
  appendChild(c) { this.children.push(c); return c; }
  replaceChildren(...n) { this.children = n.flat(); }
  addEventListener(t, l) { (this.listeners[t] ??= []).push(l); }
  click() { if (!this.disabled) for (const l of this.listeners.click ?? []) l({}); }
}
const walk = el => [el, ...el.children.flatMap(walk)];
function ui(s) {
  const entry = s.entries.find(e => (e.request?.options ?? []).some(c => c.objectId === 'magma'));
  assert.ok(entry?.request, 'jedna oferta otwiera wybór X');
  const plan = multiTargetPlanOf(entry.request.options);
  assert.ok(plan, 'warianty permanentu bez targets tworzą plan X');
  const host = new MiniEl('div');
  let selected = null;
  renderMultiTargetWizard(host, { view: s.view, session: s.session, plan, commands: entry.request.options,
    sourceName: 'Magma Pummeler', onComplete: c => { selected = c; }, onCancel: () => {} });
  const els = walk(host);
  const find = cls => els.find(e => String(e.className).split(' ').includes(cls));
  return { entry, plan, host, find, selected: () => selected };
}
function withDocument(fn) {
  const old = globalThis.document;
  globalThis.document = { createElement: tag => new MiniEl(tag) };
  try { fn(); } finally { if (old === undefined) delete globalThis.document; else globalThis.document = old; }
}

test('N/1: trzy góry -> jedna oferta i modal X od 0 do 1, plus/minus i zatwierdzenie', () => withDocument(() => {
  const s = scene();
  assert.deepEqual(s.options.map(c => c.xValue), [0, 1]);
  const { entry, plan, host, find, selected } = ui(s);
  assert.equal(choiceGroupTitle(entry.request, s.session, s.view), 'Rzuć: Magma Pummeler (koszt {X}{R}{R})');
  assert.deepEqual([plan.xMin, plan.xMax, plan.xOnly], [0, 1, true]);
  assert.doesNotMatch(host.textContent, /Wskaż jeden wiersz|1 z 2|2 z 2/);
  const minus = find('multi-target-x-minus'), plus = find('multi-target-x-plus');
  const count = find('multi-target-x-count'), confirm = find('multi-target-confirm');
  assert.ok(minus && plus && count && confirm);
  assert.equal(count.textContent, '0');
  minus.click(); assert.equal(count.textContent, '0');
  plus.click(); plus.click(); assert.equal(count.textContent, '1');
  minus.click(); assert.equal(count.textContent, '0');
  plus.click(); assert.equal(count.textContent, '1');
  assert.equal(confirm.disabled, false);
  confirm.click();
  assert.equal(selected(), s.options[1], 'zwrócona DOKŁADNA legalna komenda X=1');
  const cost = paymentDescriptorOf(selected(), s.view, {});
  assert.equal(cost.totalNeeded, 3);
  assert.deepEqual(cost.requirements, [['R'], ['R']]);
  assert.equal(execute(s.state, selected()).ok, true);
  while (s.state.zones.stack.length) assert.equal(execute(s.state, { type: 'pass_priority', playerId: s.state.turn.priorityPlayerId }).ok, true);
  const permanent = [...s.state.objects.values()].find(o => o.cardId === 'magma-pummeler' && o.zone === 'battlefield');
  assert.equal(permanent?.counters?.['+1/+1'], 1);
}));

test('N/2: dwie góry -> wybór X=0 z zakresem 0–0, bez nielegalnego X=1', () => withDocument(() => {
  const s = scene(2);
  assert.deepEqual(s.options.map(c => c.xValue), [0]);
  const { entry, plan, find, selected } = ui(s);
  assert.equal(choiceGroupTitle(entry.request, s.session, s.view), 'Rzuć: Magma Pummeler (koszt {X}{R}{R})');
  assert.deepEqual([plan.xMin, plan.xMax], [0, 0]);
  find('multi-target-x-plus').click();
  assert.equal(find('multi-target-x-count').textContent, '0');
  find('multi-target-confirm').click();
  assert.equal(selected(), s.options[0]);
  assert.equal(execute(s.state, selected()).ok, true, 'X=0 jest legalne');
  while (s.state.zones.stack.length) assert.equal(execute(s.state, { type: 'pass_priority', playerId: s.state.turn.priorityPlayerId }).ok, true);
  assert.ok([...s.state.objects.values()].some(o => o.cardId === 'magma-pummeler' && o.zone === 'graveyard'), '0/0 bez liczników umiera');
}));

test('N/3: dwa czerwone pipy są wymagane, nawet gdy many jest dość', () => {
  const s = scene(1, 2);
  assert.equal(s.options.length, 0);
});

test('N/4: plan nie spłaszcza innych wariantów i wyszukuje wyłącznie legalne X', () => {
  const commands = [
    { type: 'cast_permanent', playerId: 'p1', objectId: 'p', xValue: 0 },
    { type: 'cast_permanent', playerId: 'p1', objectId: 'p', xValue: 2 },
  ];
  assert.equal(commandForSelection(commands, { targets: [], xValue: 1 }), null);
  assert.equal(commandForSelection(commands, { targets: [], xValue: 2 }), commands[1]);
  assert.equal(multiTargetPlanOf([...commands, { ...commands[1], kicked: true }]), null, 'nie chowa osobnego kosztu');
});


test('N/5: wybrany X trafia do kreatora many, gdy płatność ma różne kształty', () => {
  const s = scene(3, 1);
  const cmd = s.options.find(c => c.xValue === 1);
  const d = paymentDescriptorOf(cmd, s.view, {});
  assert.equal(d.totalNeeded, 3);
  assert.equal(d.effectiveGeneric, 1);
  assert.deepEqual(d.requirements, [['R'], ['R']]);
  assert.equal(shouldOpenManaWizard({
    sources: [{ id: 'm0', colors: ['R'] }, { id: 'm1', colors: ['R'] },
      { id: 'm2', colors: ['R'] }, { id: 'i0', colors: ['U'] }],
    poolMana: 0, poolUnits: [], totalNeeded: d.totalNeeded, requirements: d.requirements,
  }), true, 'generyczny X można zapłacić czerwoną lub niebieską maną');
});
