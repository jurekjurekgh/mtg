import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createAiDriveLogger } from '../src/table/ai-drive.js';

// Wykonujemy prawdziwy Code.gs. To atrapa API Google Docs, nie kopia writer-a
// ani dowód wdrożenia na koncie właściciela. Każdy POST dostaje nowy kontekst
// JS, a dokument pozostaje: ulotna pamięć skryptu nie może udawać trwałości.
const code = new vm.Script(fs.readFileSync('docs/ai-appscript/Code.gs', 'utf8'));
function documentHarness({ nested = false, missing = false } = {}) {
  let locked = false; const calls = []; const errors = [];
  function body() {
    const nodes = [];
    return {
      nodes,
      getText: () => nodes.map((n) => n.text ?? '').join('\n'),
      appendParagraph(text) {
        assert.ok(locked, 'zapis wewnątrz locka');
        const prev = [...nodes].reverse().find((n) => n.kind === 'paragraph');
        const node = { kind: 'paragraph', text: String(text), heading: prev?.heading ?? 'NORMAL',
          setHeading(heading) { this.heading = heading; return this; } };
        nodes.push(node); return node;
      },
      appendPageBreak() { assert.ok(locked); nodes.push({ kind: 'break' }); },
      appendHorizontalRule() { assert.ok(locked); nodes.push({ kind: 'rule' }); },
    };
  }
  const bodies = new Map(['lore-bot', 'observer', 'skit'].map((mode) => [mode, body()]));
  const tab = (title, children = []) => ({ getTitle: () => title, getChildTabs: () => children,
    asDocumentTab: () => ({ getBody: () => bodies.get(title) }) });
  const modes = missing ? [] : [tab('observer'), tab('skit')];
  const tabs = nested ? [tab('lore-bot', modes)] : [tab('lore-bot'), ...modes];
  const doc = { getTabs: () => tabs, getBody: () => bodies.get('lore-bot'),
    saveAndClose() { assert.ok(locked); calls.push('save'); } };
  function post(payload) {
    const context = vm.createContext({
      DocumentApp: { ParagraphHeading: { HEADING1: 'H1', HEADING3: 'H3', NORMAL: 'NORMAL' },
        openById: () => { assert.ok(locked); return doc; } },
      LockService: { getScriptLock: () => ({ waitLock() { assert.equal(locked, false); locked = true; calls.push('lock'); },
        releaseLock() { assert.ok(locked); locked = false; calls.push('release'); } }) },
      ContentService: { createTextOutput: (text) => ({ text }) },
      Logger: { log: (message) => errors.push(String(message)) },
    });
    code.runInContext(context);
    context.doPost({ postData: { contents: JSON.stringify(payload) } });
    assert.deepEqual(errors, [], 'writer nie zamienił wyjątku w pozorny sukces');
    assert.equal(locked, false);
  }
  return { bodies, calls, post };
}
const headings = (body) => body.nodes.filter((n) => n.heading === 'H1');
const breaks = (body) => body.nodes.filter((n) => n.kind === 'break');
const entry = (mode, gameId = 'g1', turn = 1, extra = {}) => ({ mode, gameId, turn,
  decks: 'Wiedźmin vs Dominaria', model: 'local-stub', response: 'Komentarz tury.', chars: 15, ...extra });

for (const mode of ['observer', 'skit']) {
  test(`A/Docs ${mode}: stary newGame:false nie blokuje H1 i nowej strony kolejnej partii`, () => {
    const h = documentHarness(); const body = h.bodies.get(mode);
    h.post(entry(mode, 'g1', 1, { newGame: false }));
    assert.equal(headings(body).length, 1);
    assert.equal(headings(body)[0].text, '⚔️ Nowa partia: Wiedźmin vs Dominaria');
    assert.equal(breaks(body).length, 0, 'bez śmieciowej pustej pierwszej strony');
    h.post(entry(mode, 'g2', 1, { newGame: false, decks: 'Mirrodin vs Kaladesh' }));
    assert.equal(headings(body).length, 2);
    assert.equal(breaks(body).length, 1);
    const idx = body.nodes.indexOf(headings(body)[1]);
    assert.equal(body.nodes[idx - 1].kind, 'break', 'podział bezpośrednio przed H1 nowej partii');
    assert.equal(headings(body)[1].text, '⚔️ Nowa partia: Mirrodin vs Kaladesh');
    assert.deepEqual(h.calls, ['lock', 'save', 'release', 'lock', 'save', 'release']);
  });
}

test('A/integracja: jedna partia, observer → skit → observer, każda karta ma własny nagłówek', async () => {
  const h = documentHarness(); const sent = [];
  const log = createAiDriveLogger({ getUrl: () => 'https://example.invalid/stub',
    fetchImpl: async (_url, opts) => { const p = JSON.parse(opts.body); sent.push(p); h.post(p); return {}; } });
  for (const [mode, turn] of [['observer', 1], ['skit', 1], ['observer', 2], ['skit', 2]]) {
    assert.equal((await log(entry(mode, 'g1', turn))).ok, true);
  }
  assert.deepEqual(sent.map((p) => p.newGame), [true, true, false, false]);
  for (const mode of ['observer', 'skit']) assert.equal(headings(h.bodies.get(mode)).length, 1);
});

test('A/Docs: retry tury 1 i przeładowanie klienta nie dublują nagłówka', () => {
  const h = documentHarness();
  h.post(entry('observer', 'g1', 1, { newGame: true }));
  h.post(entry('observer', 'g1', 1, { newGame: true, response: 'Ponowienie' }));
  h.post(entry('observer', 'g1', 2, { newGame: true, response: 'Po przeładowaniu' }));
  const body = h.bodies.get('observer');
  assert.equal(headings(body).length, 1);
  assert.equal(breaks(body).length, 0);
  assert.equal(body.nodes.filter((n) => n.kind === 'rule').length, 3, 'komentarze nie giną przy dedupie nagłówka');
});

test('A/Docs: pierwszy zapis dopiero w turze 5 również ma H1; gameId porównywany dokładnie', () => {
  const h = documentHarness();
  h.post(entry('skit', 'g1.*', 5)); h.post(entry('skit', 'g1', 6)); h.post(entry('skit', 'g1.*', 7));
  assert.equal(headings(h.bodies.get('skit')).length, 2);
});

test('A/Docs: komentarze i metadane są NORMAL, nie odziedziczonym H1', () => {
  const h = documentHarness();
  h.post(entry('observer', 'g1', 1, { newGame: true, response: 'Pierwszy akapit.\n\n# Tekst modelu, nie nagłówek partii' }));
  const paragraphs = h.bodies.get('observer').nodes.filter((n) => n.kind === 'paragraph');
  assert.equal(paragraphs[0].heading, 'H1');
  assert.ok(paragraphs.slice(1).every((n) => n.heading === 'NORMAL'));
});

test('A/Docs: zagnieżdżone karty observer/skit są znajdowane po tytule', () => {
  const h = documentHarness({ nested: true });
  for (const mode of ['observer', 'skit']) h.post(entry(mode, 'g1', 1, { newGame: true }));
  for (const mode of ['observer', 'skit']) assert.equal(headings(h.bodies.get(mode)).length, 1);
  assert.equal(h.bodies.get('lore-bot').nodes.length, 0);
});

test('A/Docs: brak karty trybu nadal zapisuje nagłówek i wpis w pierwszej', () => {
  const h = documentHarness({ missing: true }); h.post(entry('observer', 'g1', 1));
  const body = h.bodies.get('lore-bot');
  assert.equal(headings(body).length, 1);
  assert.ok(body.getText().includes('Brak karty'));
  assert.ok(body.getText().includes('Komentarz tury.'));
});

test('A/klient: zmiana URL-a tworzy pierwszy wpis także w nowym dokumencie', async () => {
  let url = 'https://one.invalid/stub'; const sent = [];
  const log = createAiDriveLogger({ getUrl: () => url, fetchImpl: async (_url, opts) => { sent.push(JSON.parse(opts.body)); return {}; } });
  await log(entry('skit')); url = 'https://two.invalid/stub'; await log(entry('skit')); await log(entry('skit', 'g1', 2));
  assert.deepEqual(sent.map((p) => p.newGame), [true, true, false]);
});

test('A/klient: odrzucony fetch nie zużywa pierwszego wpisu', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const sent = []; let fail = true;
  const log = createAiDriveLogger({ getUrl: () => 'https://example.invalid/stub', fetchImpl: async (_url, opts) => {
    sent.push(JSON.parse(opts.body)); if (fail) throw new Error('offline stub'); return {};
  } });
  assert.equal((await log(entry('observer'))).ok, false); fail = false;
  assert.equal((await log(entry('observer'))).ok, true);
  assert.deepEqual(sent.map((p) => p.newGame), [true, true]);
});
