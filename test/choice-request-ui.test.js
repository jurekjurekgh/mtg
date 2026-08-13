import { test } from 'node:test';
import assert from 'node:assert/strict';
import { choiceRequest } from '../src/protocol/types.js';
import { lookWizardKindOf, renderChoiceRequest, renderLookWizard, renderCombatWizard, renderDamageWizard } from '../src/table/choice-request.js';
import { choiceGroupLabel, groupCombatDecisions } from '../src/table/render.js';

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
  get innerHTML() { return (this.html ? this.html : this.text) + this.children.map((c) => c.innerHTML).join(''); }
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
  // Uwaga D: cała etykieta opcji w jednym span.action-label (bez „kolumn" w flexie).
  assert.match(optionButtons[0].innerHTML, /^<span class="action-label">[\s\S]*<\/span>$/,
    'etykieta opcji modala owinięta span.action-label');
  assert.ok(!optionButtons[0].textContent.includes('<span'),
    'znaczniki nie mogą być widoczne jako surowy tekst etykiety');
  assert.match(optionButtons[0].textContent, /koszt 1W/, 'ikony many składają się do tekstu mana');
});

// =============================================================================
// Uwaga właściciela A (2026-08-10): etykiety grup wyborów w panelu
// „Twoje działania" — opis CO wybieramy + odmieniona liczba opcji.
// =============================================================================

const LABEL_SESSION = {
  nameOf: (cardId) => ({ 'benevolent-blessing': 'Benevolent Blessing' }[cardId] ?? cardId),
};

function requestOf(type, options) {
  return choiceRequest({ id: 'choice-x', type, options });
}

test('etykieta grupy: Mulligan — „Wybierz: Mulligan (2 opcje)" (uwaga A)', () => {
  const keep = Object.freeze({ type: 'resolve_mulligan_choice', playerId: 'p1', keep: true });
  const mull = Object.freeze({ type: 'resolve_mulligan_choice', playerId: 'p1', keep: false });
  assert.equal(choiceGroupLabel(requestOf('command', [keep, mull]), LABEL_SESSION, { zones: {} }),
    'Wybierz: Mulligan (2 opcje)');
});

test('etykieta grupy: deklaracje walki — „Deklaracja atakujących/blokujących" (uwaga A)', () => {
  const noAttack = Object.freeze({ type: 'declare_attackers', playerId: 'p1', attackerIds: [] });
  const oneAttack = Object.freeze({ type: 'declare_attackers', playerId: 'p1', attackerIds: ['c1'] });
  const entries = groupCombatDecisions([noAttack, oneAttack], { turn: { number: 1, step: 'combat' } });
  assert.equal(entries[0].request.type, 'declare_attackers');
  assert.equal(choiceGroupLabel(entries[0].request, LABEL_SESSION, { zones: {} }),
    'Wybierz: Deklaracja atakujących (2 opcje)');

  const b0 = Object.freeze({ type: 'declare_blockers', playerId: 'p2', assignments: {} });
  const b1 = Object.freeze({ type: 'declare_blockers', playerId: 'p2', assignments: { a: ['x'] } });
  const b2 = Object.freeze({ type: 'declare_blockers', playerId: 'p2', assignments: { a: ['y'] } });
  const bEntries = groupCombatDecisions([b0, b1, b2], { turn: { number: 1, step: 'combat' } });
  assert.equal(choiceGroupLabel(bEntries[bEntries.length - 1].request, LABEL_SESSION, { zones: {} }),
    'Wybierz: Deklaracja blokujących (3 opcje)');
});

test('etykieta grupy: aura — „Aura: Benevolent Blessing (3 opcje)" bez „Wybierz:" (uwaga A)', () => {
  const mk = (target) => Object.freeze({ type: 'cast_permanent', playerId: 'p1', objectId: 'aura-1', targets: [target] });
  const view = {
    zones: {
      hand: [{ id: 'aura-1', cardId: 'benevolent-blessing', aura: true }],
      battlefield: [], stack: [], graveyard: [], library: [],
    },
  };
  assert.equal(choiceGroupLabel(requestOf('target', [mk('a'), mk('b'), mk('c')]), LABEL_SESSION, view),
    'Aura: Benevolent Blessing (3 opcje)');
});

test('etykieta grupy: czar z celami — „Cel czaru: <nazwa>"', () => {
  const mk = (target) => Object.freeze({ type: 'cast_spell', playerId: 'p1', objectId: 'shock-1', targets: [target] });
  const view = {
    zones: {
      hand: [{ id: 'shock-1', cardId: 'szok-karta' }],
      battlefield: [], stack: [], graveyard: [], library: [],
    },
  };
  assert.equal(choiceGroupLabel(requestOf('target', [mk('t1'), mk('t2')]), LABEL_SESSION, view),
    'Cel czaru: szok-karta (2 opcje)');
});

test('etykieta grupy: odmiana liczebnika opcja/opcje/opcji (uwaga A)', () => {
  const mk = (n) => requestOf('command', Array.from({ length: n },
    (_, i) => Object.freeze({ type: 'resolve_mulligan_choice', playerId: 'p1', keep: i % 2 === 0 })));
  const view = { zones: {} };
  assert.ok(choiceGroupLabel(mk(1), LABEL_SESSION, view).endsWith('(1 opcja)'), '1 opcja');
  assert.ok(choiceGroupLabel(mk(2), LABEL_SESSION, view).endsWith('(2 opcje)'), '2 opcje');
  assert.ok(choiceGroupLabel(mk(4), LABEL_SESSION, view).endsWith('(4 opcje)'), '4 opcje');
  assert.ok(choiceGroupLabel(mk(5), LABEL_SESSION, view).endsWith('(5 opcji)'), '5 opcji');
  assert.ok(choiceGroupLabel(mk(12), LABEL_SESSION, view).endsWith('(12 opcji)'), '12 opcji (wyjątek)');
  assert.ok(choiceGroupLabel(mk(14), LABEL_SESSION, view).endsWith('(14 opcji)'), '14 opcji (wyjątek)');
  assert.ok(choiceGroupLabel(mk(22), LABEL_SESSION, view).endsWith('(22 opcje)'), '22 opcje');
});

test('UI ChoiceRequest: nagłówek modala może nadpisać introLabel (opis grupy)', () => {
  const host = new ChoiceMiniEl('div');
  const keep = Object.freeze({ type: 'resolve_mulligan_choice', playerId: 'p1', keep: true });
  const request = choiceRequest({ id: 'choice-mull', type: 'command', options: [keep] });
  renderChoiceRequest(host, request, { introLabel: 'Wybierz: Mulligan', onResponse: () => {} });
  assert.match(host.textContent, /Wybierz: Mulligan/, 'intro z introLabel');
  assert.ok(!/Wybierz: Działanie/.test(host.textContent), 'fallback mapy typów nadpisany');
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
  assert.match(host.textContent, /śmiertelne 3/);
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

// =============================================================================
// Uwaga C (2026-08-11): wizard walki pokazuje (atak, obrona) i nazwa stwora
// otwiera pełny ekran karty (onOpenCard).
// =============================================================================
test('renderCombatWizard: P/T stwora w nawiasie i klik w nazwę → onOpenCard', () => {
  const host = new ChoiceMiniEl('div');
  const opened = [];
  const view = {
    playerId: 'p1',
    turn: { number: 3, step: 'declare_attackers' },
    zones: {
      battlefield: [
        { id: 'a1', cardId: 'goblin-piker', power: 2, toughness: 1 },
        { id: 'a2', cardId: 'highland-game', power: 2, toughness: 1 },
      ],
      hand: [], stack: [], graveyard: [], library: [],
    },
  };
  const session = { nameOf: (c) => ({ 'goblin-piker': 'Goblin Piker', 'highland-game': 'Highland Game' }[c] ?? c), nameOfObject: () => '?' };
  const options = [
    { type: 'declare_attackers', playerId: 'p1', attackerIds: [] },
    { type: 'declare_attackers', playerId: 'p1', attackerIds: ['a1', 'a2'] },
  ];
  renderCombatWizard(host, { kind: 'attackers', view, session, options, onOpenCard: (id) => opened.push(id), onComplete: () => {} });
  assert.match(host.textContent, /Goblin Piker \(2\/1\)/, `brak P/T: ${host.textContent}`);
  assert.match(host.textContent, /Highland Game \(2\/1\)/, `brak P/T: ${host.textContent}`);
  // Klik w nazwę (span.combat-wizard-name) wywołuje onOpenCard, nie przełącza checkboxa.
  const name = findAll(host, 'span', 'Goblin Piker (2/1)')[0];
  assert.ok(name, 'span nazwy stwora');
  name.click();
  assert.deepEqual(opened, ['a1'], 'klik w nazwę otwiera fullscreen karty');
  // Checkbox nie przełączył się przez klik w nazwę (preventDefault/stopPropagation).
  const row = host.children[1].children[1]; // druga opcja (a1)
  const input = row.children[0];
  assert.equal(input.checked, false, 'klik w nazwę nie zaznacza ataku');
});
