import { test } from 'node:test';
import assert from 'node:assert/strict';
import { choiceRequest } from '../src/protocol/types.js';
import { lookWizardKindOf, renderChoiceRequest, renderLookWizard } from '../src/table/choice-request.js';

class ChoiceMiniEl {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.listeners = {};
    this.className = '';
    this.text = '';
    this.type = '';
  }

  set textContent(value) { this.text = String(value); this.children = []; }
  get textContent() { return this.text + this.children.map((child) => child.textContent).join(''); }
  appendChild(child) { this.children.push(child); return child; }
  addEventListener(type, listener) { (this.listeners[type] ??= []).push(listener); }
  click() { for (const listener of this.listeners.click ?? []) listener({}); }
}

globalThis.document = { createElement: (tag) => new ChoiceMiniEl(tag) };

test('UI ChoiceRequest pokazuje warianty i zwraca wybraną legalną opcję', () => {
  const host = new ChoiceMiniEl('div');
  const first = Object.freeze({ type: 'cast_spell', playerId: 'p1', objectId: 'spell', targets: ['creature-a'] });
  const second = Object.freeze({ type: 'cast_spell', playerId: 'p1', objectId: 'spell', targets: ['creature-b'] });
  const request = choiceRequest({ id: 'choice-target', type: 'target', options: [first, second] });
  const responses = [];

  renderChoiceRequest(host, request, {
    labelForOption: (option) => `Cel ${option.targets[0]}`,
    onResponse: (response) => responses.push(response),
  });

  assert.match(host.textContent, /Wybierz: Cel/);
  assert.match(host.textContent, /Cel creature-a/);
  assert.match(host.textContent, /Cel creature-b/);
  const optionButtons = host.children[1].children;
  assert.equal(optionButtons.length, 2);
  optionButtons[1].click();
  assert.deepEqual(responses, [{ requestId: 'choice-target', value: second }]);
});

test('UI ChoiceRequest dla pustej listy nie tworzy fałszywej komendy', () => {
  const host = new ChoiceMiniEl('div');
  const request = choiceRequest({ id: 'choice-empty', type: 'value', options: [] });
  let calls = 0;
  renderChoiceRequest(host, request, { onResponse: () => { calls += 1; } });
  assert.match(host.textContent, /Brak dostępnych wariantów/);
  assert.equal(calls, 0);
});

test('lookWizardKindOf rozpoznaje index (pojedyncza komenda + pendingIndex z kartami)', () => {
  const view = {
    playerId: 'p1',
    pendingIndex: { playerId: 'p1', count: 3, cards: [{ id: 'c1', cardId: 'basic-island' }, { id: 'c2', cardId: 'basic-mountain' }] },
  };
  assert.equal(lookWizardKindOf({ options: [{ type: 'resolve_index_choice' }] }, view), 'index');
  // cudza decyzja — bez wizarda (przeciwnik nie widzi kart)
  const foe = { playerId: 'p2', pendingIndex: { playerId: 'p1', count: 3, cards: null } };
  assert.equal(lookWizardKindOf({ options: [{ type: 'resolve_index_choice' }] }, foe), null);
  // bez aktywnych kart — brak wizarda
  assert.equal(lookWizardKindOf({ options: [{ type: 'resolve_index_choice' }] }, { playerId: 'p1', pendingIndex: null }), null);
});

test('renderLookWizard kind=index: lista kart, potem kolejność klikaną od góry', () => {
  const host = new ChoiceMiniEl('div');
  const calls = [];
  renderLookWizard(host, {
    kind: 'index',
    cards: [{ id: 'c1', name: 'Swamp' }, { id: 'c2', name: 'Forest' }, { id: 'c3', name: 'Island' }],
    onComplete: (built) => calls.push(built),
  });
  assert.match(host.textContent, /Index 3 — karty na wierzchu biblioteki/);
  assert.match(host.textContent, /1\. Swamp/);
  assert.match(host.textContent, /Ustaw nową kolejność od góry/);
  // klikamy kolejność: Island, Swamp, Forest (przyciski w zagnieżdżonych węzłach)
  const findButtons = (el, out = []) => {
    if (el.tagName === 'button') out.push(el);
    for (const child of el.children ?? []) findButtons(child, out);
    return out;
  };
  const clickByText = (prefix) => {
    const btn = findButtons(host).find((el) => el.textContent.startsWith(prefix));
    assert.ok(btn, `brak przycisku ${prefix} w: ${host.textContent}`);
    btn.click();
  };
  clickByText('Kolejna na wierzchu: Island');
  clickByText('Kolejna na wierzchu: Swamp');
  clickByText('Kolejna na wierzchu: Forest');
  assert.deepEqual(calls, [{ order: ['c3', 'c1', 'c2'] }], 'order dokładnie w kolejności klikania');
});
