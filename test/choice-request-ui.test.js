import { test } from 'node:test';
import assert from 'node:assert/strict';
import { choiceRequest } from '../src/protocol/types.js';
import { lookWizardKindOf, renderChoiceRequest, renderLookWizard, renderCombatWizard, renderDamageWizard } from '../src/table/choice-request.js';
import { groupCombatDecisions } from '../src/table/render.js';

class ChoiceMiniEl {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.listeners = {};
    this.className = '';
    this.text = '';
    this.html = '';
    this.type = '';
    this.checked = false;
    this.disabled = false;
  }

  // Semantyka przeglądarki w harnessie: innerHTML „parsuje" znaczniki —
  // widoczny tekst (textContent) to treść BEZ tagów (np. „1W" z ikon many).
  set textContent(value) { this.text = String(value); this.html = ''; this.children = []; }
  get textContent() { return this.text + this.children.map((child) => child.textContent).join(''); }
  set innerHTML(value) { this.html = String(value); this.text = String(value).replace(/<[^>]*>/g, ''); this.children = []; }
  get innerHTML() { return this.html || this.text; }
  appendChild(child) { this.children.push(child); return child; }
  addEventListener(type, listener) { (this.listeners[type] ??= []).push(listener); }
  click() { for (const listener of this.listeners.click ?? []) listener({}); }
  emit(type, value) { for (const listener of this.listeners[type] ?? []) listener(value ?? {}); }
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

test('UI ChoiceRequest: etykieta z HTML (ikony many) NIE jest surowym tekstem (uwaga A2)', () => {
  const host = new ChoiceMiniEl('div');
  const only = Object.freeze({ type: 'cast_spell', playerId: 'p1', objectId: 'aura', targets: ['t1'] });
  const request = choiceRequest({ id: 'choice-aura', type: 'target', options: [only] });
  const htmlLabel = 'Zagraj aurę: Benevolent Blessing (koszt <span class="ms-group">'
    + '<span class="ms ms-c">1</span><span class="ms ms-w">W</span></span>) → zaczaruj Reassembling Skeleton';

  renderChoiceRequest(host, request, {
    labelForOption: () => htmlLabel,
    onResponse: () => {},
  });

  const optionButtons = host.children[1].children;
  assert.equal(optionButtons.length, 1);
  assert.match(optionButtons[0].innerHTML, /ms ms-w/, 'ikony many trafiają do innerHTML przycisku');
  assert.ok(!optionButtons[0].textContent.includes('<span'),
    'znaczniki nie mogą być widoczne jako surowy tekst etykiety');
  assert.match(optionButtons[0].textContent, /koszt 1W/, 'ikony many składają się do tekstu mana');
});

test('UI ChoiceRequest dla pustej listy nie tworzy fałszywej komendy', () => {
  const host = new ChoiceMiniEl('div');
  const request = choiceRequest({ id: 'choice-empty', type: 'value', options: [] });
  let calls = 0;
  renderChoiceRequest(host, request, { onResponse: () => { calls += 1; } });
  assert.match(host.textContent, /Brak dostępnych wariantów/);
  assert.equal(calls, 0);
});


/** Znajduje elementy po tagu i opcjonalnym prefiksie tekstu. */
function findAll(host, tag, prefix) {
  const out = [];
  const walk = (el) => {
    if (el.tagName === tag && (!prefix || el.textContent.startsWith(prefix))) out.push(el);
    for (const child of el.children ?? []) walk(child);
  };
  walk(host);
  return out;
}

/** Ustawia checkbox i odpala change. */
function setChecked(host, labelPrefix, value) {
  const labels = findAll(host, 'label');
  const label = labels.find((l) => l.textContent.includes(labelPrefix));
  assert.ok(label, `brak wiersza „${labelPrefix}" w: ${host.textContent}`);
  const input = findAll(label, 'input')[0];
  input.checked = value;
  input.emit('change', { target: input });
}

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

// =============================================================================
// M66 (B/R) — wizardy walki: atakujący/blokujący (przełączniki) i obrażenia
// =============================================================================

const COMBAT_VIEW = {
  playerId: 'p1',
  turn: { number: 3, step: 'declare_attackers' },
  zones: {
    battlefield: [
      { id: 'a1', cardId: 'goblin-piker' },
      { id: 'a2', cardId: 'highland-game' },
      { id: 'b1', cardId: 'rustwing-falcon' },
    ],
    hand: [], stack: [], graveyard: [], library: [],
  },
};
const COMBAT_SESSION = { nameOf: (cardId) => ({ 'goblin-piker': 'Goblin Piker', 'highland-game': 'Highland Game', 'rustwing-falcon': 'Rustwing Falcon' }[cardId] ?? cardId), nameOfObject: () => '?' };

test('renderCombatWizard (atakujący): przełączniki + Zatwierdź → declare_attackers', () => {
  const host = new ChoiceMiniEl('div');
  const calls = [];
  const options = [
    { type: 'declare_attackers', playerId: 'p1', attackerIds: [] },
    { type: 'declare_attackers', playerId: 'p1', attackerIds: ['a1'] },
    { type: 'declare_attackers', playerId: 'p1', attackerIds: ['a2'] },
    { type: 'declare_attackers', playerId: 'p1', attackerIds: ['a1', 'a2'] },
  ];
  renderCombatWizard(host, { kind: 'attackers', view: COMBAT_VIEW, session: COMBAT_SESSION, options, onComplete: (cmd) => calls.push(cmd) });
  assert.match(host.textContent, /Wybierz atakujących/);
  assert.match(host.textContent, /Goblin Piker/);
  setChecked(host, 'Goblin Piker', true);
  findAll(host, 'button', 'Zatwierdź atak')[0].click();
  assert.deepEqual(calls, [{ type: 'declare_attackers', playerId: 'p1', attackerIds: ['a1'] }]);
});

test('renderCombatWizard (blokujący): per-atakujący przełączniki → assignments', () => {
  const host = new ChoiceMiniEl('div');
  const calls = [];
  const options = [
    { type: 'declare_blockers', playerId: 'p2', assignments: {} },
    { type: 'declare_blockers', playerId: 'p2', assignments: { a1: ['b1'] } },
  ];
  renderCombatWizard(host, { kind: 'blockers', view: { ...COMBAT_VIEW, playerId: 'p2', zones: { ...COMBAT_VIEW.zones, battlefield: [...COMBAT_VIEW.zones.battlefield, { id: 'a2', cardId: 'highland-game' }] } }, session: COMBAT_SESSION, options, onComplete: (cmd) => calls.push(cmd) });
  assert.match(host.textContent, /blokujący/);
  setChecked(host, 'Rustwing Falcon', true);
  findAll(host, 'button', 'Zatwierdź bloki')[0].click();
  assert.deepEqual(calls, [{ type: 'declare_blockers', playerId: 'p2', assignments: { a1: ['b1'] } }]);
});

test('renderDamageWizard: steppery +/− i Zatwierdź → resolve_damage_assignment', () => {
  const host = new ChoiceMiniEl('div');
  const calls = [];
  const pending = {
    playerId: 'p1',
    entries: [{
      attackerId: 'atk', attackerCardId: 'goblin-piker', power: 5, trample: false,
      blockers: [
        { id: 'b1', cardId: 'highland-game', toughness: 3, damage: 0, lethal: 3 },
        { id: 'b2', cardId: 'goblin-piker', toughness: 3, damage: 0, lethal: 3 },
      ],
    }],
  };
  const defaultCommand = { type: 'resolve_damage_assignment', playerId: 'p1', assignments: {} };
  renderDamageWizard(host, { view: COMBAT_VIEW, session: COMBAT_SESSION, pending, defaultCommand, onComplete: (cmd) => calls.push(cmd) });
  assert.match(host.textContent, /Rozdziel obrażenia/);
  assert.match(host.textContent, /lethal 3/);
  // +1 na b1 trzy razy, +1 na b2 raz (b1 ma lethal przed b2)
  const plus = findAll(host, 'button', '+1');
  plus[0].click(); plus[0].click(); plus[0].click();
  plus[1].click();
  findAll(host, 'button', 'Zatwierdź przydział')[0].click();
  assert.deepEqual(calls, [{ type: 'resolve_damage_assignment', playerId: 'p1', assignments: { atk: [{ blockerId: 'b1', amount: 3 }, { blockerId: 'b2', amount: 1 }] } }]);
});

test('renderDamageWizard: przycisk „Domyślnie" wysyła wariant z legalCommands', () => {
  const host = new ChoiceMiniEl('div');
  const calls = [];
  const pending = { playerId: 'p1', entries: [{ attackerId: 'atk', attackerCardId: 'goblin-piker', power: 5, trample: false, blockers: [{ id: 'b1', cardId: 'highland-game', toughness: 3, damage: 0, lethal: 3 }] }] };
  const defaultCommand = { type: 'resolve_damage_assignment', playerId: 'p1', assignments: { atk: [{ blockerId: 'b1', amount: 3 }] } };
  renderDamageWizard(host, { view: COMBAT_VIEW, session: COMBAT_SESSION, pending, defaultCommand, onComplete: (cmd) => calls.push(cmd) });
  findAll(host, 'button', 'Domyślnie')[0].click();
  assert.deepEqual(calls, [defaultCommand]);
});
