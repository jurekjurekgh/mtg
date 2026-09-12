import { test } from 'node:test';
import assert from 'node:assert/strict';
import { choiceRequest } from '../src/protocol/types.js';
import { lookWizardKindOf, renderChoiceRequest, renderLookWizard, renderCombatWizard, renderDamageWizard } from '../src/table/choice-request.js';
import { choiceGroupLabel, groupCombatDecisions, commandLabel } from '../src/table/render.js';
import { commandOptionKey } from '../src/table/session.js';

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
    // M104: przyciski opcji niosą `data-option-key` dla sondy „oferta bez
    // skutku" Żywego Testera — stub musi mieć `dataset` jak w DOM (L17).
    this.dataset = {};
  }

  // Semantyka przeglądarki w harnessie: innerHTML „parsuje" znaczniki —
  // widoczny tekst (textContent) to treść BEZ tagów (np. „1W" z ikon many).
  set textContent(value) { this.text = String(value); this.html = ''; this.children = []; }
  get textContent() { return this.text + this.children.map((child) => child.textContent).join(''); }
  set innerHTML(value) { this.html = String(value); this.text = String(value).replace(/<[^>]*>/g, ''); this.children = []; }
  get innerHTML() { return (this.html ? this.html : this.text) + this.children.map((c) => c.innerHTML).join(''); }
  appendChild(child) { this.children.push(child); return child; }
  // M150/B: wizard obrażeń przebudowuje wiersze blokerów przy zmianie
  // kolejności (reorder) — stub musi mieć replaceChildren jak przeglądarka.
  replaceChildren(...nodes) { this.children = nodes.flat(); }
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

test('etykieta grupy: Mulligan — „Wybierz: Mulligan" (uwaga A + C2 bez licznika)', () => {
  const keep = Object.freeze({ type: 'resolve_mulligan_choice', playerId: 'p1', keep: true });
  const mull = Object.freeze({ type: 'resolve_mulligan_choice', playerId: 'p1', keep: false });
  assert.equal(choiceGroupLabel(requestOf('command', [keep, mull]), LABEL_SESSION, { zones: {} }),
    'Wybierz: Mulligan');
});

test('etykieta grupy: deklaracje walki — „Deklaracja atakujących/blokujących" (uwaga A)', () => {
  const noAttack = Object.freeze({ type: 'declare_attackers', playerId: 'p1', attackerIds: [] });
  const oneAttack = Object.freeze({ type: 'declare_attackers', playerId: 'p1', attackerIds: ['c1'] });
  const entries = groupCombatDecisions([noAttack, oneAttack], { turn: { number: 1, step: 'combat' } });
  assert.equal(entries[0].request.type, 'declare_attackers');
  assert.equal(choiceGroupLabel(entries[0].request, LABEL_SESSION, { zones: {} }),
    'Wybierz: Deklaracja atakujących');

  const b0 = Object.freeze({ type: 'declare_blockers', playerId: 'p2', assignments: {} });
  const b1 = Object.freeze({ type: 'declare_blockers', playerId: 'p2', assignments: { a: ['x'] } });
  const b2 = Object.freeze({ type: 'declare_blockers', playerId: 'p2', assignments: { a: ['y'] } });
  const bEntries = groupCombatDecisions([b0, b1, b2], { turn: { number: 1, step: 'combat' } });
  assert.equal(choiceGroupLabel(bEntries[bEntries.length - 1].request, LABEL_SESSION, { zones: {} }),
    'Wybierz: Deklaracja blokujących');
});

test('etykieta grupy: aura — „Aura: Benevolent Blessing" bez „Wybierz:" (uwaga A + C2 bez licznika)', () => {
  const mk = (target) => Object.freeze({ type: 'cast_permanent', playerId: 'p1', objectId: 'aura-1', targets: [target] });
  const view = {
    zones: {
      hand: [{ id: 'aura-1', cardId: 'benevolent-blessing', aura: true }],
      battlefield: [], stack: [], graveyard: [], library: [],
    },
  };
  assert.equal(choiceGroupLabel(requestOf('target', [mk('a'), mk('b'), mk('c')]), LABEL_SESSION, view),
    'Aura: Benevolent Blessing');
});

test('etykieta grupy: czar z celami — „Cel czaru: <nazwa>" (C2 bez licznika)', () => {
  const mk = (target) => Object.freeze({ type: 'cast_spell', playerId: 'p1', objectId: 'shock-1', targets: [target] });
  const view = {
    zones: {
      hand: [{ id: 'shock-1', cardId: 'szok-karta' }],
      battlefield: [], stack: [], graveyard: [], library: [],
    },
  };
  assert.equal(choiceGroupLabel(requestOf('target', [mk('t1'), mk('t2')]), LABEL_SESSION, view),
    'Cel czaru: szok-karta');
});

test('C2 (zgłoszenie 2026-09-10): etykieta grupy bez licznika wariantów „(N opcji)"', () => {
  const mk = (n) => requestOf('command', Array.from({ length: n },
    (_, i) => Object.freeze({ type: 'resolve_mulligan_choice', playerId: 'p1', keep: i % 2 === 0 })));
  const view = { zones: {} };
  for (const n of [1, 2, 5, 12, 14, 22]) {
    const label = choiceGroupLabel(mk(n), LABEL_SESSION, view);
    assert.doesNotMatch(label, /\(\d+ opcj/, `licznik opcji usunięty (N=${n})`);
  }
});

// =============================================================================
// F-C (znalezisko właściciela 2026-09-09): „Rozdzielanie obrażeń bojowych
// (1 opcja)" — przydział po walce to CZYNNOŚĆ (wizard), nie wybór spośród
// wariantów. groupCombatDecisions pakuje resolve_damage_assignment zawsze
// z JEDNYM domyślnym wariantem, więc licznik „(1 opcja)" to szum: realny
// wybór (ile mocy na którego blokera / ile po trample na gracza) robi się
// wewnątrz wizarda. Etykieta grupy opisuje czynność, bez licznika opcji.
// =============================================================================

function assignmentView(entries) {
  return { zones: {}, pendingDamageAssignment: { playerId: 'p1', entries } };
}

const GOBLIN_PIKER = Object.freeze({ cardId: 'goblin-piker' });

test('F-C: damage_assignment z JEDNĄ komendą nie mówi „(1 opcja)" — nazywa atakującego', () => {
  const assign = Object.freeze({ type: 'resolve_damage_assignment', playerId: 'p1', assignments: {} });
  const entries = groupCombatDecisions([assign], { turn: { number: 3, step: 'combat_damage' } });
  const request = entries[0].request;
  assert.equal(request.type, 'damage_assignment');
  const view = assignmentView([{
    attackerId: 'atk', attackerCardId: 'goblin-piker', power: 5, trample: false,
    blockers: [{ id: 'b1', cardId: 'highland-game', toughness: 3, damage: 0, lethal: 3 }],
  }]);
  const label = choiceGroupLabel(request, COMBAT_SESSION, view);
  assert.equal(label, 'Rozdziel obrażenia bojowe: Goblin Piker (moc 5)');
  assert.ok(!/\(\d+ opcj[ei]\)/.test(label), 'bez licznika opcji w etykiecie czynności');
});

test('F-C: damage_assignment „obrażenia wg wytrzymałości" w nazwie sposobu', () => {
  const assign = Object.freeze({ type: 'resolve_damage_assignment', playerId: 'p1', assignments: {} });
  const entries = groupCombatDecisions([assign], { turn: { number: 3, step: 'combat_damage' } });
  const view = assignmentView([{
    attackerId: 'atk', attackerCardId: 'highland-game', power: 3, byToughness: true, trample: false,
    blockers: [{ id: 'b1', cardId: 'goblin-piker', toughness: 2, damage: 0, lethal: 2 }],
  }]);
  const label = choiceGroupLabel(entries[0].request, COMBAT_SESSION, view);
  assert.equal(label, 'Rozdziel obrażenia bojowe: Highland Game (obrażenia wg wytrzymałości 3)');
});

test('F-C: damage_assignment bez żywego widoku — generyczny opis czynności bez licznika', () => {
  const assign = Object.freeze({ type: 'resolve_damage_assignment', playerId: 'p1', assignments: {} });
  const entries = groupCombatDecisions([assign], { turn: { number: 3, step: 'combat_damage' } });
  const label = choiceGroupLabel(entries[0].request, COMBAT_SESSION, { zones: {} });
  assert.equal(label, 'Rozdziel obrażenia bojowe między blokujących');
  assert.ok(!/\(\d+ opcj[ei]\)/.test(label), 'bez licznika opcji w etykiecie czynności');
});

test('F-C: damage_assignment nie nosi „(N opcji)" nawet przy N domyślnych wariantach', () => {
  // Obrona na wypadek, gdyby kiedyś wejście niosło >1 wariantów: typ opisuje
  // CZYNNOŚĆ, więc liczba komend nigdy nie ma trafić do etykiety panelu.
  const mk = (targetId) => Object.freeze({ type: 'resolve_damage_assignment', playerId: 'p1', assignments: { atk: [{ blockerId: targetId, amount: 5 }] } });
  const request = requestOf('damage_assignment', [mk('b1'), mk('b2')]);
  const view = assignmentView([{
    attackerId: 'atk', attackerCardId: 'goblin-piker', power: 5, trample: true,
    blockers: [{ id: 'b1', cardId: 'highland-game', toughness: 3, damage: 0, lethal: 3 }],
  }]);
  const label = choiceGroupLabel(request, COMBAT_SESSION, view);
  assert.equal(label, 'Rozdziel obrażenia bojowe: Goblin Piker (moc 5)');
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
  // M213: nagłówek kreatora nie nazywa karty — opisuje czynność.
  assert.match(host.textContent, /Wierzch biblioteki — 3 karty/);
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
  clickByText('1. na wierzchu: Island');
  clickByText('2. na wierzchu: Swamp');
  clickByText('3. na wierzchu: Forest');
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
  // E8/B3 (CR 510.1a): start = pełny przydział (lethal-first 3/2, jak silnik),
  // więc Zatwierdź od razu aktywne. Steppery −/+ muszą wrócić do legalnego
  // stanu; suma < moc nie da się już zatwierdzić.
  const minus = findAll(host, 'button', '−1');
  const plus = findAll(host, 'button', '+1');
  const confirm = findAll(host, 'button', 'Zatwierdź przydział')[0];
  assert.equal(confirm.disabled, false, 'start: pełny przydział jest legalny');
  minus[0].click();
  assert.equal(confirm.disabled, true, 'niedobór (suma < moc) blokuje Zatwierdź — CR 510.1a');
  // CR 510.1c: b2 zachowuje przydział; przywrócenie jednego punktu wystarcza.
  plus[0].click();
  assert.equal(confirm.disabled, false, 'pełny przydział (3+2=5) odblokowuje');
  confirm.click();
  assert.deepEqual(calls, [{ type: 'resolve_damage_assignment', playerId: 'p1', assignments: { atk: [{ blockerId: 'b1', amount: 3 }, { blockerId: 'b2', amount: 2 }] } }]);
});

test('renderDamageWizard (M101/B6): trample poniżej lethal blokuje Zatwierdź (CR 702.19b)', () => {
  const host = new ChoiceMiniEl('div');
  const calls = [];
  const pending = {
    playerId: 'p1',
    entries: [{
      attackerId: 'atk', attackerCardId: 'goblin-piker', power: 5, trample: true,
      blockers: [{ id: 'b1', cardId: 'highland-game', toughness: 2, damage: 0, lethal: 2 }],
    }],
  };
  renderDamageWizard(host, { view: COMBAT_VIEW, session: COMBAT_SESSION, pending, defaultCommand: null, onComplete: (cmd) => calls.push(cmd) });

  // Start: wizard sam ustawia legalny lethal-first (2 na blokera, 3 na gracza).
  const confirm = findAll(host, 'button', 'Zatwierdź przydział')[0];
  assert.equal(confirm.disabled, false, 'domyślny lethal-first jest legalny');
  assert.match(host.textContent, /do gracza: 3/);

  // Zejście poniżej lethal blokuje zatwierdzenie (nadmiar nie może iść na gracza).
  const minus = findAll(host, 'button', '−1')[0];
  minus.click();
  assert.equal(confirm.disabled, true, 'Zatwierdź zablokowane przy 1 < lethal 2');
  assert.match(host.textContent, /najpierw przydziel śmiertelne obrażenia/);
  confirm.click();
  assert.deepEqual(calls, [], 'klik w zablokowany przycisk nie wysyła komendy');

  // Powrót do lethal odblokowuje.
  findAll(host, 'button', '+1')[0].click();
  assert.equal(confirm.disabled, false, 'lethal osiągnięte — Zatwierdź odblokowane');
  confirm.click();
  assert.deepEqual(calls, [{ type: 'resolve_damage_assignment', playerId: 'p1', assignments: { atk: [{ blockerId: 'b1', amount: 2 }] } }]);
});

test('renderDamageWizard (E8/B3): bez trample start = CAŁA moc w blokera, niedobór blokuje (CR 510.1a)', () => {
  const host = new ChoiceMiniEl('div');
  const calls = [];
  const pending = {
    playerId: 'p1',
    entries: [{
      attackerId: 'atk', attackerCardId: 'goblin-piker', power: 5, trample: false,
      blockers: [{ id: 'b1', cardId: 'highland-game', toughness: 3, damage: 0, lethal: 3 }],
    }],
  };
  renderDamageWizard(host, { view: COMBAT_VIEW, session: COMBAT_SESSION, pending, defaultCommand: null, onComplete: (cmd) => calls.push(cmd) });
  const confirm = findAll(host, 'button', 'Zatwierdź przydział')[0];
  // Start: lethal-first + dolewka reszty = pełna moc 5 w jedynego blokera.
  assert.equal(confirm.disabled, false, 'start: pełna moc (5) w blokera jest legalna');
  const minus = findAll(host, 'button', '−1')[0];
  for (let i = 0; i < 5; i += 1) minus.click(); // zejdź do 0
  assert.equal(confirm.disabled, true, 'niedobór (0 < 5) BLOKUJE Zatwierdź — CR 510.1a');
  assert.equal(calls.length, 0, 'nielegalnego przydziału nie da się wysłać');
  const plus = findAll(host, 'button', '+1')[0];
  for (let i = 0; i < 5; i += 1) plus.click();
  confirm.click();
  assert.deepEqual(calls, [{ type: 'resolve_damage_assignment', playerId: 'p1', assignments: { atk: [{ blockerId: 'b1', amount: 5 }] } }]);
});

test('renderDamageWizard: przycisk domyślnego przydziału wysyła wariant z legalCommands', () => {
  const host = new ChoiceMiniEl('div');
  const calls = [];
  const pending = { playerId: 'p1', entries: [{ attackerId: 'atk', attackerCardId: 'goblin-piker', power: 5, trample: false, blockers: [{ id: 'b1', cardId: 'highland-game', toughness: 3, damage: 0, lethal: 3 }] }] };
  const defaultCommand = { type: 'resolve_damage_assignment', playerId: 'p1', assignments: { atk: [{ blockerId: 'b1', amount: 3 }] } };
  renderDamageWizard(host, { view: COMBAT_VIEW, session: COMBAT_SESSION, pending, defaultCommand, onComplete: (cmd) => calls.push(cmd) });
  // M251 (audyt Żywym Testerem): lokalizacja po KLASIE, nie po copy —
  // poprzednia wersja szukała po tekście „Domyślnie" i pękła wraz ze
  // zmianą etykiety (żargon „lethal-first" → polski opis) choć zachowanie
  // przycisku było bez zmian. Semantyczny hak = damage-wizard-default.
  const def = findAll(host, 'button').find((b) => b.className.includes('damage-wizard-default'));
  assert.ok(def, 'przycisk domyślnego przydziału jest w wizardzie');
  def.click();
  assert.deepEqual(calls, [defaultCommand]);
});

test('M251: przycisk domyślnego przydziału opisuje przydział po polsku (bez żargonu implementacji)', () => {
  // Strażnik znaleziska z audytu Żywym Testerem (oś 2s): etykieta brzmiała
  // „Domyślnie (lethal-first)" — angielski skrót ALGORYTMU na stole gracza.
  // Pin mówi o TREŚCI dla gracza, nie o wewnętrznej nazwie algorytmu.
  const host = new ChoiceMiniEl('div');
  const pending = { playerId: 'p1', entries: [{ attackerId: 'atk', attackerCardId: 'goblin-piker', power: 5, trample: false, blockers: [{ id: 'b1', cardId: 'highland-game', toughness: 3, damage: 0, lethal: 3 }] }] };
  const defaultCommand = { type: 'resolve_damage_assignment', playerId: 'p1', assignments: { atk: [{ blockerId: 'b1', amount: 3 }] } };
  renderDamageWizard(host, { view: COMBAT_VIEW, session: COMBAT_SESSION, pending, defaultCommand, onComplete: () => {} });
  const def = findAll(host, 'button').find((b) => b.className.includes('damage-wizard-default'));
  assert.ok(def, 'przycisk domyślnego przydziału jest w wizardzie');
  assert.match(def.textContent, /domyślnego przydziału/i, `etykieta bez copy żargonu, jest: ${def.textContent}`);
  assert.doesNotMatch(def.textContent, /lethal-first/i, 'gracz nie widzi nazwy wewnętrznej algorytmu');
  // M251 (drugie okno tego samego znaleziska): etykieta KOMENDY
  // resolve_damage_assignment w commandLabel mówiła „(domyślnie
  // lethal-first)" — ruch bota z domyślnym przydziałem ląduje z nią
  // w modalu „Ruch przeciwnika" (renderBotMoves → commandLabel).
  const session = COMBAT_SESSION;
  const label = commandLabel({ type: 'resolve_damage_assignment', playerId: 'p1', assignments: {} }, session, COMBAT_VIEW);
  assert.doesNotMatch(label, /lethal-first/i, `etykieta komendy bez żargonu, jest: ${label}`);
  assert.match(label, /domyślny przydział/i);
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

// =============================================================================
// M90 — bug D (zgłoszenie właściciela, iPhone 2026-08-14): „Fake Your Own
// Death — instant z wyborem celu — nie ma pola ptaszka pomijania".
//
// Testy w test/choice-ignore.test.js sprawdzają wyłącznie OBECNOŚĆ kodu
// (regexy na źródle) — nie łapią regresji zachowania (np. zły klucz opcji
// albo brak reakcji na klik). Poniżej test FUNKCJONALNY na tym samym
// harnessie DOM co reszta pliku: ptaszek istnieje przy każdej opcji
// ignorowalnej, odzwierciedla stan zbioru i przełącza go po zmianie.
// =============================================================================

/** Wszystkie ptaszki wyciszenia (label.action-ignore) w drzewie hosta. */
function ignoreToggles(node, out = []) {
  for (const child of node.children ?? []) {
    if (child.className === 'action-ignore') {
      const input = (child.children ?? []).find((c) => c.className === 'action-ignore-input');
      if (input) out.push(input);
    }
    ignoreToggles(child, out);
  }
  return out;
}

test('bug D: wizard wyboru celu rysuje ptaszek wyciszenia przy każdej opcji instanta', () => {
  const host = new ChoiceMiniEl('div');
  // Fake Your Own Death: instant z wyborem celu → dwie opcje cast_spell.
  const first = Object.freeze({ type: 'cast_spell', playerId: 'p1', objectId: 'fyod', targets: ['creature-a'] });
  const second = Object.freeze({ type: 'cast_spell', playerId: 'p1', objectId: 'fyod', targets: ['creature-b'] });
  const request = choiceRequest({ id: 'choice-target', type: 'target', options: [first, second] });
  const toggled = [];

  renderChoiceRequest(host, request, {
    labelForOption: (cmd) => `Rzuć: ${cmd.targets[0]}`,
    onResponse: () => {},
    ignoredOptionKeys: new Set(),
    onToggleIgnoredOption: (key) => toggled.push(key),
  });

  const toggles = ignoreToggles(host);
  assert.equal(toggles.length, 2, 'każda opcja instanta musi mieć ptaszek pomijania');
  assert.equal(toggles[0].checked, false, 'niewyciszona opcja zaczyna z odznaczonym ptaszkiem');

  toggles[0].emit('change');
  assert.equal(toggled.length, 1, 'zmiana ptaszka musi wywołać onToggleIgnoredOption');
  assert.match(toggled[0], /cast_spell/, 'klucz opcji musi identyfikować komendę (commandOptionKey)');
});

test('bug D: ptaszek odzwierciedla już wyciszoną opcję (stan z sesji)', () => {
  const host = new ChoiceMiniEl('div');
  const option = Object.freeze({ type: 'cast_spell', playerId: 'p1', objectId: 'fyod', targets: ['creature-a'] });
  const request = choiceRequest({ id: 'choice-target', type: 'target', options: [option] });
  // Klucz jak w sesji — bez powielania implementacji bierzemy go z callbacku.
  let key = null;
  renderChoiceRequest(host, request, {
    labelForOption: () => 'Rzuć', onResponse: () => {},
    ignoredOptionKeys: new Set(), onToggleIgnoredOption: (k) => { key = k; },
  });
  ignoreToggles(host)[0].emit('change');
  assert.ok(key, 'callback musi dostarczyć klucz opcji');

  const host2 = new ChoiceMiniEl('div');
  renderChoiceRequest(host2, request, {
    labelForOption: () => 'Rzuć', onResponse: () => {},
    ignoredOptionKeys: new Set([key]), onToggleIgnoredOption: () => {},
  });
  assert.equal(ignoreToggles(host2)[0].checked, true,
    'wyciszona opcja musi mieć zaznaczony ptaszek po ponownym renderze');
});

test('bug D: opcje NIE-ignorowalne (resolve_*) nie dostają ptaszka', () => {
  const host = new ChoiceMiniEl('div');
  const option = Object.freeze({ type: 'resolve_scry', playerId: 'p1', bottomIds: [] });
  const request = choiceRequest({ id: 'choice-scry', type: 'scry', options: [option] });
  renderChoiceRequest(host, request, {
    labelForOption: () => 'Scry', onResponse: () => {},
    ignoredOptionKeys: new Set(), onToggleIgnoredOption: () => {},
  });
  assert.equal(ignoreToggles(host).length, 0,
    'obowiązkowa decyzja (scry) nie może być wyciszana — brak ptaszka');
});

// =============================================================================
// M104 — klucz opcji modala dla sondy „oferta bez skutku" (oś 4 detektorów)
// =============================================================================

test('M104: każda opcja modala niesie data-option-key (sonda noop Żywego Testera)', () => {
  const host = new ChoiceMiniEl('div');
  const first = Object.freeze({ type: 'activate_ability', playerId: 'p1', objectId: 'cultivator', abilityIndex: 1, targets: ['land-a'] });
  const second = Object.freeze({ type: 'activate_ability', playerId: 'p1', objectId: 'cultivator', abilityIndex: 1, targets: ['land-b'] });
  const request = choiceRequest({ id: 'choice-untap', type: 'target', options: [first, second] });

  renderChoiceRequest(host, request, {
    labelForOption: (option) => `Cel ${option.targets[0]}`,
    onResponse: () => {},
  });

  const optionButtons = host.children[1].children;
  assert.equal(optionButtons.length, 2);
  assert.equal(optionButtons[0].dataset.optionKey, commandOptionKey(first));
  assert.equal(optionButtons[1].dataset.optionKey, commandOptionKey(second));
  assert.notEqual(optionButtons[0].dataset.optionKey, optionButtons[1].dataset.optionKey,
    'warianty tej samej grupy muszą mieć RÓŻNE klucze — inaczej sonda mierzy zawsze pierwszy');
});

// --- M112: wizard walki mierzalny sondą „oferta bez skutku" ----------------
// Do tej pory przycisk „Zatwierdź atak/bloki" budował komendę z zaznaczeń
// i NIE miał `data-option-key`, więc oś „noop" Żywego Testera nie widziała
// walki w ogóle. Klucz musi opisywać BIEŻĄCY wybór i zmieniać się razem z nim.
test('M112: „Zatwierdź atak" ma klucz sondy zgodny z bieżącym zaznaczeniem', () => {
  const view = {
    playerId: 'p1',
    players: [{ id: 'p1', name: 'Ty' }, { id: 'p2', name: 'Nieprzyjaciel' }],
    zones: {
      battlefield: [
        { id: 'a1', cardId: 'x', controllerId: 'p1', kind: 'creature', power: 2, toughness: 2, keywords: [], zone: 'battlefield' },
        { id: 'a2', cardId: 'x', controllerId: 'p1', kind: 'creature', power: 3, toughness: 3, keywords: [], zone: 'battlefield' },
      ],
      hand: [], graveyard: [], library: [], stack: [], exile: [],
    },
    turn: { activePlayerId: 'p1', priorityPlayerId: 'p1', phase: 'combat', step: 'declare_attackers' },
    legalCommands: [],
  };
  const session = { nameOf: (id) => id, nameOfObject: (id) => id, cardDetails: () => null, colorsOf: () => [] };
  const host = new ChoiceMiniEl('div');
  renderCombatWizard(host, {
    kind: 'attackers', view, session,
    options: [
      { type: 'declare_attackers', playerId: 'p1', attackerIds: [] },
      { type: 'declare_attackers', playerId: 'p1', attackerIds: ['a1'] },
      { type: 'declare_attackers', playerId: 'p1', attackerIds: ['a1', 'a2'] },
    ],
    onComplete: () => {}, onCancel: () => {},
  });
  const confirm = findAll(host, 'button').find((el) => (el.className ?? '').includes('combat-wizard-confirm'));
  assert.ok(confirm, 'przycisk zatwierdzenia istnieje');
  const emptyKey = confirm.dataset.optionKey;
  assert.ok(emptyKey, 'przycisk ma klucz sondy już przy pustym wyborze');
  const toggles = findAll(host, 'input').filter((el) => (el.className ?? '').includes('combat-wizard-toggle'));
  assert.ok(toggles.length >= 1, 'są przełączniki atakujących');
  toggles[0].checked = true;
  for (const fn of toggles[0].listeners.change ?? []) fn();
  const afterKey = findAll(host, 'button')
    .find((el) => (el.className ?? '').includes('combat-wizard-confirm')).dataset.optionKey;
  assert.notEqual(afterKey, emptyKey, 'klucz sondy idzie za zaznaczeniem (inaczej tester mierzyłby nie tę komendę)');
});

test('M112: wizard scry/surveil dostaje klucz sondy na decyzji KOŃCZĄCEJ', () => {
  const host = new ChoiceMiniEl('div');
  const seen = [];
  renderLookWizard(host, {
    kind: 'scry',
    cards: [{ id: 'c1', name: 'Karta A' }, { id: 'c2', name: 'Karta B' }],
    onComplete: () => {}, onCancel: () => {},
    probeKeyFor: (built) => { seen.push(built); return `key:${JSON.stringify(built)}`; },
  });
  // Pierwsza karta z dwóch — po decyzji wizard pyta jeszcze o drugą, więc
  // komendy jeszcze nie znamy i klucza nie ma (uczciwiej niż zgadywać).
  let buttons = findAll(host, 'button').filter((b) => (b.className ?? '').includes('choice-request-option'));
  assert.ok(buttons.length >= 2, 'dwie opcje decyzji o karcie');
  assert.equal(buttons[0].dataset.optionKey, undefined, 'krok pośredni bez klucza sondy');
  buttons[0].click();

  // Druga (ostatnia) karta: to kliknięcie kończy wizard → klucz musi być.
  buttons = findAll(host, 'button').filter((b) => (b.className ?? '').includes('choice-request-option'));
  assert.ok(buttons[0].dataset.optionKey, 'ostatnia decyzja niesie klucz sondy');
  assert.ok(seen.length > 0, 'wizard pytał UI o klucz (UI zna playerId i typ komendy)');
});

test('M148: wizard scry — przy ≥2 kartach na wierzchu gracz wybiera KOLEJNOŚĆ (topOrder)', () => {
  const host = new ChoiceMiniEl('div');
  const calls = [];
  renderLookWizard(host, {
    kind: 'scry',
    cards: [{ id: 'c1', name: 'Wyspa' }, { id: 'c2', name: 'Las' }, { id: 'c3', name: 'Góra' }],
    onComplete: (built) => calls.push(built),
  });
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
  // Trzy karty: pierwszą odkładamy na SPÓD (c1), reszta (c2,c3) na wierzch.
  // Decyzje o kartach: c1 → spód, c2 → wierzch, c3 → wierzch.
  clickByText('Na spód biblioteki');   // c1 → spód
  clickByText('Zostaw na wierzchu');   // c2 → wierzch
  clickByText('Zostaw na wierzchu');   // c3 → wierzch
  // Po decyzjach wizard pyta o kolejność dwóch kart na wierzchu.
  assert.match(host.textContent, /od najwyższej do najniższej/);
  clickByText('1. na wierzchu: Las');
  clickByText('2. na wierzchu: Góra');
  assert.deepEqual(calls, [{ bottomIds: ['c1'], topOrder: ['c2', 'c3'] }],
    'scry wysyła bottomIds + topOrder (kolejność klikania)');
});

// M150/B: reorder jest wygodą UI — zachowuje kwoty przy obiektach.
// CR 510.1c nie wymaga lethal-first (osobny pin C poniżej).
test('renderDamageWizard (M150/B): reorder blokerów pozwala zabić „późniejszego”', () => {
  const host = new ChoiceMiniEl('div');
  const calls = [];
  // Atakujący moc 2, blokowany przez Ember Beast (wytrz. 4, lethal 4) i
  // Battle-Rattle Shaman (wytrz. 2, lethal 2). Bez reorderu 2 obrażenia
  // domyślnie trafiają pierwszego; ręczny podział może to zmienić.
  const pending = {
    playerId: 'p1',
    entries: [{
      attackerId: 'atk', attackerCardId: 'selhoff-occultist', power: 2, trample: false,
      blockers: [
        { id: 'ember', cardId: 'ember-beast', toughness: 4, damage: 0, lethal: 4 },
        { id: 'shaman', cardId: 'battle-rattle-shaman', toughness: 2, damage: 0, lethal: 2 },
      ],
    }],
  };
  renderDamageWizard(host, { view: COMBAT_VIEW, session: COMBAT_SESSION, pending, defaultCommand: null, onComplete: (cmd) => calls.push(cmd) });

  // E8/B3: start = pełny przydział jak w silniku → Ember (pierwszy w
  // kolejności) dostaje od razu całą moc 2, Shaman 0. +1 na Shamanie (drugim
  // wierszu) nie działa, bo pełna moc jest już rozdysponowana.
  const plus = findAll(host, 'button', '+1');
  plus[1].click();
  assert.deepEqual(calls, [], 'plus nie zatwierdza przydziału ani nie przekracza mocy');

  // Przesuń Shaman wyżej (↑ drugiego wiersza) — staje się pierwszym w kolejności.
  const ups = findAll(host, 'button', '↑');
  ups[1].click();
  // Kolejność [Shaman, Ember], kwoty przepięte [0, 2]: zerujemy Embera i
  // przelewamy moc na Shaman (dwa +1 = śmiertelne).
  const minusAfter = findAll(host, 'button', '−1');
  minusAfter[1].click(); minusAfter[1].click();
  const plusAfter = findAll(host, 'button', '+1');
  plusAfter[0].click();
  plusAfter[0].click();
  findAll(host, 'button', 'Zatwierdź przydział')[0].click();
  assert.deepEqual(calls, [{
    type: 'resolve_damage_assignment', playerId: 'p1',
    assignments: { atk: [{ blockerId: 'shaman', amount: 2 }, { blockerId: 'ember', amount: 0 }] },
  }], 'po reorderze kwoty są nadal przypisane do właściwych obiektów');
});

test('M213: nagłówek kreatora odmienia rzeczownik wg liczby (1/3/5 kart)', () => {
  // Żywy Tester (warhammer vs srodziemie, s=303): „Wierzch biblioteki — 5 karty”.
  // Regresja z tej samej sesji: usuwając nazwę karty z nagłówka uprościłem
  // odmianę do „karta/karty” i zgubiłem formę dla 5+ (L29 — polska odmiana
  // to trzy formy, nie dwie).
  const przypadki = [[1, 'karta'], [3, 'karty'], [5, 'kart'], [12, 'kart']];
  for (const [ile, forma] of przypadki) {
    const host = new ChoiceMiniEl('div');
    renderLookWizard(host, {
      kind: 'index',
      cards: Array.from({ length: ile }, (_, i) => ({ id: `c${i}`, name: `Karta ${i}` })),
      onComplete: () => {},
    });
    assert.ok(host.textContent.includes(`Wierzch biblioteki — ${ile} ${forma} (`),
      `zła odmiana dla ${ile}: ${host.textContent.slice(0, 80)}`);
  }
});

// Audyt PR #105/C. CR 510.1c pobrane 2026-09-08:
// https://mtg.wiki/page/Combat_damage_step — "divided as its controller
// chooses among them". Przykład źródłowy 4 mocy → 2+2 w 2/3 i 1/1.
for (const trample of [false, true]) {
  test(`C: wizard pozwala podzielić 2+2 bez lethal na pierwszym (trample=${trample})`, () => {
    const host = new ChoiceMiniEl('div');
    const calls = [];
    const pending = { playerId: 'p1', entries: [{
      attackerId: 'atk', power: 4, trample,
      blockers: [
        { id: 'b1', toughness: 3, damage: 0, lethal: 3 },
        { id: 'b2', toughness: 1, damage: 0, lethal: 1 },
      ],
    }] };
    renderDamageWizard(host, { view: COMBAT_VIEW, session: COMBAT_SESSION,
      pending, defaultCommand: null, onComplete: cmd => calls.push(cmd) });
    const confirm = findAll(host, 'button', 'Zatwierdź przydział')[0];
    // Start 3+1. Zejście 3→2 nie może wyzerować drugiego blokera.
    findAll(host, 'button', '−1')[0].click();
    assert.equal(confirm.disabled, true, 'niedobór lub niepokryty trample');
    findAll(host, 'button', '+1')[1].click();
    assert.equal(confirm.disabled, false, '2+2 to legalna pełna suma');
    confirm.click();
    assert.deepEqual(calls[0]?.assignments.atk, [
      { blockerId: 'b1', amount: 2 }, { blockerId: 'b2', amount: 2 },
    ]);
    findAll(host, 'button', '+1')[1].click();
    confirm.click();
    assert.deepEqual(calls[1], calls[0], 'plus nie przekracza mocy');
  });
}

// W3 (CR 510.1d): ten sam wizard dzieli moc BLOKERA między atakujących, których
// blokuje — klucze komendy to attackerId, a nadwyżka „do gracza" nie istnieje
// (trample jest wyłącznie po stronie atakującego, CR 702.19b).
test('renderDamageWizard (W3): podział blokera → assignments z kluczami attackerId', () => {
  const host = new ChoiceMiniEl('div');
  const calls = [];
  const pending = {
    playerId: 'p1', role: 'blocker', blockerId: 'wall',
    entries: [{
      blockerId: 'wall', cardId: 'highland-game', power: 7,
      attackers: [
        { id: 'a1', cardId: 'goblin-piker', toughness: 4, damage: 0, lethal: 4 },
        { id: 'a2', cardId: 'rustwing-falcon', toughness: 4, damage: 0, lethal: 4 },
      ],
    }],
  };
  renderDamageWizard(host, { view: COMBAT_VIEW, session: COMBAT_SESSION, pending, defaultCommand: null, onComplete: (cmd) => calls.push(cmd) });
  assert.match(host.textContent, /moc blokera atakującym/, 'etykieta strony blokera');
  assert.match(host.textContent, /Highland Game \(moc 7\)/, 'źródłem mocy jest bloker');
  const confirm = findAll(host, 'button', 'Zatwierdź przydział')[0];
  assert.equal(confirm.disabled, false, 'start lethal-first 4+3 = pełna moc');
  confirm.click();
  assert.deepEqual(calls, [{
    type: 'resolve_damage_assignment', playerId: 'p1',
    assignments: { wall: [{ attackerId: 'a1', amount: 4 }, { attackerId: 'a2', amount: 3 }] },
  }]);
  findAll(host, 'button', '−1')[1].click();
  assert.equal(confirm.disabled, true, 'niedobór (suma < mocy) blokuje Zatwierdź — CR 510.1a');
  assert.ok(!/do gracza: [1-9]/.test(host.textContent), 'bloker nie przenosi nadwyżki na gracza');
});
