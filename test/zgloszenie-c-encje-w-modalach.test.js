import test from 'node:test';
import assert from 'node:assert/strict';
import { commandLabel, labelChoiceOptions } from '../src/table/render.js';
import { renderMultiTargetWizard } from '../src/table/choice-request.js';
import { castWindowPlanOf } from '../src/table/multi-target.js';

// Zgłoszenie właściciela C (2026-09-28e): w modalu wyboru wariantów Rebound
// (Ojutai's Breath) nazwa karty pokazywała się jako „Ojutai&#39;s Breath”
// („jakieś hashe i krzaczki”).
//
// Root cause (klasa M87 przeniesiona na wiersze opcji): `commandLabel` to
// HTML (nazwy przez `escapeHtml` + ikony many — kontrakt M104/A2), a dispatch
// `addRow` w `choice-request.js` rozpoznawał kanał po samym „<” — etykieta
// bez markupu, za to z ENCJAMI („&#39;”), jechała kanałem `label`
// (textContent) i przeglądarka pokazywała encje dosłownie. Kanał `html`
// (innerHTML) dekoduje encje — tam escapowana nazwa wyświetla się poprawnie.

const NAMES = {
  'ojutais-breath': "Ojutai's Breath",
  'trostani-discordant': 'Trostani Discordant',
  'boros-challenger': 'Boros Challenger',
};
const session = {
  nameOf: (cardId) => NAMES[cardId] ?? String(cardId),
  nameOfObject: (id) => NAMES[id] ?? String(id),
  nameOrdinalSuffix: () => '',
  faceDownLabel: () => 'morph',
};
const view = {
  players: [{ id: 'p1', name: 'Ty' }, { id: 'p2', name: 'Nieprzyjaciel' }],
  zones: { hand: [], battlefield: [], stack: [], graveyard: [], library: [], exile: [] },
  legalCommands: [],
};
const cmds = [
  { type: 'resolve_rebound_cast', cast: true, cardId: 'ojutais-breath', targets: ['trostani-discordant'] },
  { type: 'resolve_rebound_cast', cast: true, cardId: 'ojutais-breath', targets: ['boros-challenger'] },
];

// Widoczny tekst w przeglądarce: kanał `html` (innerHTML) DEKODUJE encje
// HTML po stronie przeglądarki; kanał `label` (textContent) pokazuje surowy
// ciąg — encje zostają widoczne dosłownie (tu leżał błąd zgłoszenia).
const visibleText = (el) => {
  if (!el.html) return el.text;
  return el.innerHTML
    .replace(/<[^>]*>/g, '')
    .replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
};

class MiniEl {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.listeners = {};
    this.className = ''; this.text = ''; this.html = '';
    this.type = ''; this.checked = false; this.disabled = false; this.dataset = {};
  }
  set textContent(v) { this.text = String(v); this.html = ''; this.children = []; }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  set innerHTML(v) { this.html = String(v); this.text = String(v).replace(/<[^>]*>/g, ''); this.children = []; }
  get innerHTML() { return (this.html ? this.html : this.text) + this.children.map((c) => c.innerHTML).join(''); }
  appendChild(c) { this.children.push(c); return c; }
  replaceChildren(...n) { this.children = n.flat(); }
  addEventListener(t, l) { (this.listeners[t] ??= []).push(l); }
  click() { for (const l of this.listeners.click ?? []) l({}); }
  emit(t, v) { for (const l of this.listeners[t] ?? []) l(v ?? {}); }
}

function collectLeaves(node, out = []) {
  if (node.html || node.text) out.push(node);
  for (const c of node.children ?? []) collectLeaves(c, out);
  return out;
}

test('C/wiersze okna rzutu: escapowana nazwa karty wyświetla się bez encji (Ojutai&#39;s → Ojutai\'s)', () => {
  // Sanity: sama etykieta z commandLabel NIESIE encję (HTML-owy kontrakt).
  const raw = commandLabel(cmds[0], session, view);
  assert.ok(raw.includes('Ojutai&#39;s'), `etykieta źródłowa: ${raw}`);

  globalThis.document = { createElement: (tag) => new MiniEl(tag) };
  const host = new MiniEl('div');
  const plan = castWindowPlanOf(cmds);
  assert.ok(plan?.castWindowMode, 'setup: plan okna rzutu');
  const labels = labelChoiceOptions(cmds, session, view); // jak main.js
  plan.rows = plan.rows.map((row, i) => ({ ...row, label: labels[i], cardId: cmds[i].cardId }));
  renderMultiTargetWizard(host, {
    view, session, plan, commands: cmds,
    onComplete: () => {}, onCancel: () => {},
  });
  const rowsWithOffer = collectLeaves(host)
    .filter((el) => visibleText(el).includes('Rzuć z odbiciem'));
  assert.equal(rowsWithOffer.length, 2, 'oba warianty Rebound mają wiersze');
  for (const el of rowsWithOffer) {
    const shown = visibleText(el);
    assert.ok(shown.includes("Rzuć z odbiciem: Ojutai's Breath (bez kosztu many)"),
      `wiersz ma wyświetlać nazwę bez encji (widoczne: ${JSON.stringify(shown)})`);
    assert.ok(!shown.includes('&#39;'), `encje nie mogą być widoczne (widoczne: ${JSON.stringify(shown)})`);
    assert.ok(!shown.includes('&amp;'), `encje nie mogą być widoczne (widoczne: ${JSON.stringify(shown)})`);
  }
});

test('C/anty-over-fix: czysty tekst bez encji zostaje kanałem textContent (mini-DOM czyta tekst)', () => {
  globalThis.document = { createElement: (tag) => new MiniEl(tag) };
  const host = new MiniEl('div');
  const plan = castWindowPlanOf(cmds);
  plan.rows = plan.rows.map((row, i) => ({ ...row, label: 'Wariant bez encji', cardId: cmds[i].cardId }));
  renderMultiTargetWizard(host, {
    view, session, plan, commands: cmds,
    onComplete: () => {}, onCancel: () => {},
  });
  const plain = collectLeaves(host).filter((el) => el.text === 'Wariant bez encji');
  assert.ok(plain.length > 0 && plain.every((el) => el.html === ''),
    'czysty tekst idzie textContent (bez wstrzykiwania HTML)');
});
