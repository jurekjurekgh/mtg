import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { renderManaWizard, wizardSourceName } from '../src/table/mana-wizard.js';

// Zgłoszenie właściciela A (2026-09-28e): „Źródła many (lądy) nie pokazują
// numeru, więc nie wiem, który Plains tapuję, mimo że jeden z nich ma na sobie
// wrogą aurę. Koło nazw permanentów w Mana Wizard powinny być ich numery np.
// Plains #1.”
//
// Reguła nazw pola bitwy (zlecenie właściciela 2026-09-16): kopie nazwy u
// jednego gracza dostają „ #N” przez `session.nameOfObject` / `nameOrdinalSuffix`
// (L41 — jedno źródło ordynału). Wszystkie warstwy widoku to robiły (kafel,
// etykiety akcji, wizardy celu) — model kreatora many budował nazwę z samego
// `nameOf(cardId)`, bez ordynału (klasa L5: wiring nie pokryty testem).

const source = { id: 'plains-a', cardId: 'basic-plains', colors: ['W'], amount: 1 };
const model = {
  costStr: '{1}',
  remainingTotal: 1,
  requirements: [{ colors: [], covered: false }],
  missingColors: [],
  availableCount: 1,
  untappedSources: [source],
  done: false,
};
// Sesja z ordynałem (prawdziwa: nameOfObject = nazwa + „ #N”).
const sessionWithOrdinal = {
  nameOfObject: (id) => (id === 'plains-a' ? 'Plains #1' : '?'),
  nameOrdinalSuffix: (id) => (id === 'plains-a' ? ' #1' : ''),
};
// Stub sesji z testów (L41): bez nameOfObject — nazwa bazowa z modelu.
const legacyStub = { nameOf: (cardId) => String(cardId) };

test('A/wiersz: nazwa źródła niesie numer kopii permanentu (Plains #1)', () => {
  assert.equal(wizardSourceName(source, sessionWithOrdinal), 'Plains #1');
  // Anty-over-fix: stub bez nameOfObject zostaje przy nazwie bazowej (L41),
  // a pojedynczy permanent bez grupy nie dostaje numeru (reguła 2026-09-16).
  assert.equal(wizardSourceName({ ...source, name: 'Plains' }, legacyStub), 'Plains');
  assert.equal(wizardSourceName({ ...source, name: 'Plains' }, null), 'Plains');
});

test('A/render: wiersz „Tapnij: …” pokazuje numer — dwa Plainsy rozróżnialne', () => {
  const host = { textContent: '', appendChild() {}, };
  // Mini-DOM wystarczający dla renderManaWizard: tworzymy przez document
  // globalny testów DOM (render wstawia wiersze przez renderPickerRow).
  const rows = [];
  globalThis.document = {
    createElement: () => {
      const el = {
        children: [], _text: '', _html: '',
        classList: { add() {} },
        appendChild(child) { this.children.push(child); },
        addEventListener() {},
        setAttribute() {},
      };
      Object.defineProperty(el, 'textContent', {
        get() { return this._text; }, set(v) { this._text = String(v); rows.push(String(v)); },
      });
      Object.defineProperty(el, 'innerHTML', {
        get() { return this._html; }, set(v) { this._html = String(v); rows.push(String(v)); },
      });
      return el;
    },
  };
  renderManaWizard(host, { ...model, untappedSources: [{ ...source, name: 'Plains' }] },
    { onTapSource: () => {}, onCancel: () => {}, session: sessionWithOrdinal });
  assert.ok(rows.some((r) => r.includes('Plains #1')), `wiersze: ${JSON.stringify(rows)}`);
  rows.length = 0;
  renderManaWizard(host, { ...model, untappedSources: [{ ...source, name: 'Plains' }] },
    { onTapSource: () => {}, onCancel: () => {} });
  assert.ok(rows.some((r) => r.includes('Tapnij: Plains (')), `wiersze: ${JSON.stringify(rows)}`);
});

test('A/wiring (L5): main.js buduje nazwy modelu przez wizardSourceName z sesją', () => {
  const main = fs.readFileSync('src/table/main.js', 'utf8');
  const start = main.indexOf('function refreshManaWizard');
  const slice = main.slice(start, start + 4000);
  assert.ok(slice.includes('name: wizardSourceName(src, session)'),
    'model kreatora many niesie nazwę z ordynałem (wizardSourceName)');
  assert.ok(main.includes('wizardSourceName'), 'main importuje wizardSourceName');
});
