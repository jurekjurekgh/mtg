import { test } from 'node:test';
import assert from 'node:assert/strict';
import { choiceRequest } from '../src/protocol/types.js';
import { renderChoiceRequest } from '../src/table/choice-request.js';

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
