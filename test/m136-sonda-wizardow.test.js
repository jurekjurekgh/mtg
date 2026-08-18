// =============================================================================
// M136 — „sonda surveil / damage wizard" (temat z backlogu wskazany przez
// właściciela):
//
//   „Luki w pokryciu NARZĘDZIA AUDYTOWEGO, nie w grze — te dwa miejsca nie są
//    mierzone przez sondę »oferta bez skutku«."
//
// Kontekst: sonda (`src/table/noop-probe.js`, M103/L15) mierzy, czy oferta
// z panelu cokolwiek zmienia w stanie gry. Wymaga `data-option-key` na
// przycisku — bez klucza Żywy Tester nie wie, którą komendę mierzy. Wizardy,
// które SKŁADAJĄ komendę z kilku kliknięć, muszą więc liczyć klucz same.
// Walka dostała to w M112; zostały trzy luki:
//
//   1. krok KOLEJNOŚCI w wizardzie scry/surveil („ułóż karty na wierzchu") —
//      komenda jest znana dopiero przy ostatniej karcie, wcześniej klucza
//      świadomie nie ma;
//   2. wizard ROZDZIELANIA OBRAŻEŃ — cały przydział był poza pomiarem,
//      dokładnie jak walka przed M112;
//   3. wizard INDEX (układanie kart od góry) — `probeKeyFor` był tam
//      twardo wyłączony (`lookKind === 'index' ? null : …`).
//
// To pokrycie narzędzia, nie zmiana reguł gry — testy sprawdzają WYŁĄCZNIE
// obecność i poprawność kluczy sondy oraz to, że wizardy nadal działają.
// =============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { renderLookWizard, renderDamageWizard } from '../src/table/choice-request.js';
import { commandOptionKey } from '../src/table/session.js';

class MiniEl {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.listeners = {}; this.className = '';
    this.text = ''; this.type = ''; this.checked = false; this.disabled = false; this.dataset = {};
    this.classList = { toggle: () => {} };
  }

  set textContent(value) { this.text = String(value); this.children = []; }

  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }

  set innerHTML(value) { this.text = String(value).replace(/<[^>]*>/g, ''); this.children = []; }

  get innerHTML() { return this.text + this.children.map((c) => c.innerHTML).join(''); }

  appendChild(child) { this.children.push(child); return child; }

  addEventListener(type, listener) { (this.listeners[type] ??= []).push(listener); }

  click() { for (const l of this.listeners.click ?? []) l({ stopPropagation() {}, preventDefault() {} }); }
}

globalThis.document = { createElement: (tag) => new MiniEl(tag) };

/** Wszystkie węzły w drzewie (płasko). */
function nodes(root, out = []) {
  for (const child of root.children ?? []) { out.push(child); nodes(child, out); }
  return out;
}

const buttonsWithKey = (host) => nodes(host)
  .filter((n) => n.tagName === 'button' && n.dataset?.optionKey);

// --- 1 + 3. Wizard scry/surveil/index: krok kolejności ----------------------

test('M136: krok kolejności w wizardzie SURVEIL ma klucz sondy przy ostatniej karcie', () => {
  const host = new MiniEl('div');
  const cards = [{ id: 'c1', name: 'Alfa' }, { id: 'c2', name: 'Beta' }];
  const probeKeyFor = (built) => commandOptionKey({ type: 'resolve_surveil', playerId: 'p1', ...built });
  renderLookWizard(host, { kind: 'surveil', cards, probeKeyFor, onComplete: () => {} });
  // Krok 1: obie karty na wierzch → po drugiej karcie wchodzi krok kolejności.
  const keepFirst = nodes(host).find((n) => n.tagName === 'button' && /wierzch/i.test(n.textContent));
  assert.ok(keepFirst, 'jest przycisk „zostaw na wierzchu"');
  keepFirst.click();
  const keepSecond = nodes(host).find((n) => n.tagName === 'button' && /wierzch/i.test(n.textContent));
  keepSecond.click();
  // Teraz krok kolejności: dwie karty do ułożenia. Pierwszy wybór NIE domyka
  // wizarda (komenda jeszcze nieznana), więc klucza być nie musi.
  const orderButtons = nodes(host).filter((n) => n.tagName === 'button' && /Kolejna na wierzchu/.test(n.textContent));
  assert.equal(orderButtons.length, 2, 'dwie karty do ułożenia');
  orderButtons[0].click();
  // Po pierwszym wyborze została JEDNA karta — to kliknięcie domyka wizard,
  // więc klucz sondy MUSI już być (to była luka wskazana w backlogu).
  const lastStep = nodes(host).filter((n) => n.tagName === 'button' && /Kolejna na wierzchu/.test(n.textContent));
  assert.equal(lastStep.length, 1, 'została ostatnia karta');
  assert.ok(lastStep[0].dataset.optionKey,
    'ostatni krok kolejności musi nieść data-option-key (inaczej sonda nie mierzy surveil)');
});

test('M136: klucz z kroku kolejności opisuje DOKŁADNIE wysyłaną komendę', () => {
  const host = new MiniEl('div');
  const cards = [{ id: 'c1', name: 'Alfa' }, { id: 'c2', name: 'Beta' }];
  const probeKeyFor = (built) => commandOptionKey({ type: 'resolve_surveil', playerId: 'p1', ...built });
  let sent = null;
  renderLookWizard(host, { kind: 'surveil', cards, probeKeyFor, onComplete: (cmd) => { sent = cmd; } });
  nodes(host).find((n) => n.tagName === 'button' && /wierzch/i.test(n.textContent)).click();
  nodes(host).find((n) => n.tagName === 'button' && /wierzch/i.test(n.textContent)).click();
  const order = nodes(host).filter((n) => n.tagName === 'button' && /Kolejna na wierzchu/.test(n.textContent));
  order[0].click();
  const last = nodes(host).filter((n) => n.tagName === 'button' && /Kolejna na wierzchu/.test(n.textContent))[0];
  const keyBeforeClick = last.dataset.optionKey;
  last.click();
  assert.ok(sent, 'wizard wysłał komendę');
  const actualKey = commandOptionKey({ type: 'resolve_surveil', playerId: 'p1', ...sent });
  assert.equal(keyBeforeClick, actualKey,
    'klucz sondy musi odpowiadać komendzie, którą wizard faktycznie wysyła');
});

// --- 2. Wizard rozdzielania obrażeń ----------------------------------------

const damagePending = {
  playerId: 'p1',
  entries: [{
    attackerId: 'atk', attackerCardId: 'x-atk', power: 3, trample: false,
    blockers: [
      { id: 'b1', cardId: 'x-b1', toughness: 2, damage: 0, lethal: 2 },
      { id: 'b2', cardId: 'x-b2', toughness: 2, damage: 0, lethal: 2 },
    ],
  }],
};

const damageView = {
  playerId: 'p1',
  zones: {
    battlefield: [
      { id: 'atk', cardId: 'x-atk', controllerId: 'p1', power: 3, toughness: 3 },
      { id: 'b1', cardId: 'x-b1', controllerId: 'p2', power: 1, toughness: 2 },
      { id: 'b2', cardId: 'x-b2', controllerId: 'p2', power: 1, toughness: 2 },
    ],
    hand: [], stack: [], graveyard: [], library: [],
  },
};

const damageSession = { nameOf: (id) => String(id), nameOfObject: () => '?' };

test('M136: przycisk „Zatwierdź przydział" niesie klucz sondy', () => {
  const host = new MiniEl('div');
  renderDamageWizard(host, {
    view: damageView, session: damageSession, pending: damagePending,
    probeKeyFor: (cmd) => commandOptionKey(cmd),
    onComplete: () => {},
  });
  const confirm = nodes(host).find((n) => (n.className ?? '').includes('damage-wizard-confirm'));
  assert.ok(confirm, 'jest przycisk zatwierdzenia');
  assert.ok(confirm.dataset.optionKey,
    'przydział obrażeń był całkiem poza pomiarem sondy (jak walka przed M112)');
});

test('M136: klucz przydziału obrażeń AKTUALIZUJE się po zmianie stepperów', () => {
  // Sedno pomiaru: klucz musi opisywać BIEŻĄCY wybór, nie stan początkowy —
  // inaczej sonda mierzy inną komendę niż ta, którą wyśle gracz (M112).
  const host = new MiniEl('div');
  renderDamageWizard(host, {
    view: damageView, session: damageSession, pending: damagePending,
    probeKeyFor: (cmd) => commandOptionKey(cmd),
    onComplete: () => {},
  });
  const confirm = nodes(host).find((n) => (n.className ?? '').includes('damage-wizard-confirm'));
  const before = confirm.dataset.optionKey;
  const plus = nodes(host).find((n) => (n.className ?? '').includes('damage-wizard-plus'));
  assert.ok(plus, 'jest stepper +1');
  plus.click();
  assert.notEqual(confirm.dataset.optionKey, before,
    'po zmianie przydziału klucz sondy musi się zmienić');
});

test('M136: klucz odpowiada komendzie wysyłanej przez wizard obrażeń', () => {
  const host = new MiniEl('div');
  let sent = null;
  renderDamageWizard(host, {
    view: damageView, session: damageSession, pending: damagePending,
    probeKeyFor: (cmd) => commandOptionKey(cmd),
    onComplete: (cmd) => { sent = cmd; },
  });
  const plus = nodes(host).find((n) => (n.className ?? '').includes('damage-wizard-plus'));
  plus.click();
  const confirm = nodes(host).find((n) => (n.className ?? '').includes('damage-wizard-confirm'));
  const key = confirm.dataset.optionKey;
  confirm.click();
  assert.ok(sent, 'wizard wysłał komendę');
  assert.equal(key, commandOptionKey(sent),
    'sonda ma mierzyć dokładnie tę komendę, którą wysyła wizard');
});

// --- Anty-over-fix ----------------------------------------------------------

test('M136 (anty-over-fix): bez probeKeyFor wizardy działają i nie dopisują kluczy', () => {
  // Sonda jest opcjonalna (produkcyjny stół podaje ją zawsze, ale testy
  // i starsze ścieżki nie muszą) — brak `probeKeyFor` nie może nic wywalić.
  const host = new MiniEl('div');
  let sent = null;
  renderDamageWizard(host, {
    view: damageView, session: damageSession, pending: damagePending, onComplete: (cmd) => { sent = cmd; },
  });
  const confirm = nodes(host).find((n) => (n.className ?? '').includes('damage-wizard-confirm'));
  assert.ok(confirm, 'wizard się renderuje');
  assert.equal(confirm.dataset.optionKey, undefined, 'bez sondy nie wymyślamy klucza');
  confirm.click();
  assert.ok(sent, 'wizard nadal wysyła komendę');
});

test('M136: main.js podłącza sondę do OBU wizardów (index też)', () => {
  // Strażnik źródła (L31): sam wizard umie liczyć klucz, ale bez podłączenia
  // w main.js pomiar dalej nie istnieje. `index` był tam twardo wyłączony.
  const source = fs.readFileSync('src/table/main.js', 'utf8');
  assert.doesNotMatch(source, /probeKeyFor:\s*lookKind === 'index' \? null/,
    'wizard index nie może mieć twardo wyłączonej sondy');
  const damageBlock = source.slice(source.indexOf('renderDamageWizard('));
  assert.match(damageBlock.slice(0, 600), /probeKeyFor:/,
    'renderDamageWizard musi dostać probeKeyFor z main.js');
});
