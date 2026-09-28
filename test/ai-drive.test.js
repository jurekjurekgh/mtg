import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildAiDrivePayload, createAiDriveLogger } from '../src/table/ai-drive.js';

test('AI-E3 drive: payload ma 9 pól kontraktu §6 + chars = długość', () => {
  const p = buildAiDrivePayload({
    mode: 'lore-bot', gameId: '7-2026-09-26T00:00:00.000Z', turn: 3,
    model: 'x/y:free', response: 'Mgła. Czeka.', tsClient: '2026-09-26T01:00:00.000Z',
    decks: 'A vs B', newGame: true,
  });
  assert.deepEqual(p, {
    mode: 'lore-bot', gameId: '7-2026-09-26T00:00:00.000Z', turn: 3,
    model: 'x/y:free', chars: 12, response: 'Mgła. Czeka.',
    tsClient: '2026-09-26T01:00:00.000Z', decks: 'A vs B', newGame: true,
  });
});

test('AI-E3 drive: payload toleruje braki (nigdy nie rzuca)', () => {
  assert.deepEqual(buildAiDrivePayload(), {
    mode: 'lore-bot', gameId: '', turn: 0, model: '', chars: 0, response: '', tsClient: '',
    decks: '',
  });
  assert.equal(buildAiDrivePayload({ turn: 'zz', response: 42 }).turn, 0);
  assert.equal(buildAiDrivePayload({ turn: '5' }).turn, 5);
});

test('AI-E3 drive: pusty URL = zapis wyłączony, sieć nietknięta', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return {}; };
  for (const getUrl of [() => '', () => '   ', undefined]) {
    const log = createAiDriveLogger({ getUrl, fetchImpl });
    const res = await log({ response: 'x' });
    assert.deepEqual(res, { ok: false, skipped: true });
  }
  assert.equal(calls, 0);
});

test('AI-E3 drive: sukces — POST no-cors, text/plain, body JSON', async () => {
  const seen = [];
  const fetchImpl = async (url, opts) => { seen.push([url, opts]); return {}; };
  const log = createAiDriveLogger({ getUrl: () => 'https://script.google.com/macros/s/ABC/exec', fetchImpl });
  const res = await log({
    mode: 'lore-bot', gameId: 'g1', turn: 2, model: 'm/m:free',
    response: 'tekst', tsClient: 'ts',
  });
  assert.deepEqual(res, { ok: true });
  assert.equal(seen.length, 1);
  const [url, opts] = seen[0];
  assert.equal(url, 'https://script.google.com/macros/s/ABC/exec');
  assert.equal(opts.method, 'POST');
  assert.equal(opts.mode, 'no-cors');
  assert.ok(opts.headers['Content-Type'].startsWith('text/plain'));
  assert.deepEqual(JSON.parse(opts.body), {
    mode: 'lore-bot', gameId: 'g1', turn: 2, model: 'm/m:free',
    chars: 5, response: 'tekst', tsClient: 'ts', decks: '', newGame: true,
  });
});

test('AI-E3 drive: URL czytany na każde dopisanie (live setup)', async () => {
  const urls = [];
  const fetchImpl = async (url) => { urls.push(url); return {}; };
  let current = 'https://u1/exec';
  const log = createAiDriveLogger({ getUrl: () => current, fetchImpl });
  await log({ response: 'a' });
  current = 'https://u2/exec';
  await log({ response: 'b' });
  assert.deepEqual(urls, ['https://u1/exec', 'https://u2/exec']);
});

test('AI-E3 drive: wywrotka sieci/brak fetcha = cichy warn, NIGDY reject', async () => {
  const warns = [];
  const orig = console.warn;
  console.warn = (...a) => { warns.push(a); };
  try {
    const failing = createAiDriveLogger({
      getUrl: () => 'https://u/exec', fetchImpl: async () => { throw new TypeError('load failed'); },
    });
    assert.deepEqual(await failing({ response: 'a' }), { ok: false });
    const noFetch = createAiDriveLogger({ getUrl: () => 'https://u/exec', fetchImpl: null });
    assert.deepEqual(await noFetch({ response: 'a' }), { ok: false, skipped: true });
    assert.ok(warns.length >= 2, 'ciche logi do konsoli');
  } finally {
    console.warn = orig;
  }
});

test('AI-R5 drive: Code.gs dopisuje do DOKUMENTU (karta na tryb), nie arkusza', () => {
  // Strażnik wzorca K-testu: Apps Scriptu nie uruchomimy w node, ale możemy
  // pilnować, żeby w skrypcie nie wrócił Arkusz ani nie zginęły karty.
  const gs = fs.readFileSync('docs/ai-appscript/Code.gs', 'utf8');
  assert.ok(gs.includes('DocumentApp.openById(DOC_ID)'), 'otwarcie dokumentu po ID');
  assert.ok(gs.includes('getTabs()'), 'karty dokumentu');
  assert.ok(gs.includes('asDocumentTab().getBody()'), 'dopisywanie do ciała karty');
  assert.ok(gs.includes('appendParagraph'), 'wpis jako akapity');
  assert.ok(gs.includes('appendHorizontalRule'), 'rozdzielnik wpisów');
  assert.ok(gs.includes('p.newGame === true'), 'nagłówek tylko dla nowej partii');
  assert.ok(gs.includes('appendPageBreak()'), 'podział strony przed partią');
  assert.ok(gs.includes('ParagraphHeading.HEADING1'), 'matchup jako H1');
  assert.ok(gs.includes('LockService'), 'lock współbieżności');
  assert.ok(gs.includes("const DOC_ID = 'WSTAW-ID-DOKUMENTU'"), 'miejsce na ID');
  assert.ok(!gs.includes('SpreadsheetApp'), 'zero Arkusza (decyzja AI-R5)');
  assert.ok(!gs.includes('SHEET_ID'), 'zero starej stałej');
});

test('AI drive: newGame tylko przy pierwszym logu partii (po gameId, nie turze)', async () => {
  const bodies = [];
  const fetchImpl = async (url, opts) => { bodies.push(JSON.parse(opts.body)); return {}; };
  const log = createAiDriveLogger({ getUrl: () => 'https://u/exec', fetchImpl });
  await log({ gameId: 'g1', turn: 5, response: 'a', decks: 'A vs B' });
  await log({ gameId: 'g1', turn: 6, response: 'b', decks: 'A vs B' });
  await log({ gameId: 'g2', turn: 1, response: 'c', decks: 'C vs D' });
  assert.deepEqual(bodies.map((b) => b.newGame), [true, false, true]);
  assert.deepEqual(bodies.map((b) => b.decks), ['A vs B', 'A vs B', 'C vs D']);
});

test('AI drive: pusty gameId nigdy nie stawia nagłówka; jawne newGame wygrywa', async () => {
  const bodies = [];
  const fetchImpl = async (url, opts) => { bodies.push(JSON.parse(opts.body)); return {}; };
  const log = createAiDriveLogger({ getUrl: () => 'https://u/exec', fetchImpl });
  await log({ response: 'a' });
  await log({ gameId: 'g9', turn: 4, response: 'b', newGame: true });
  await log({ gameId: 'g9', turn: 5, response: 'c' });
  assert.deepEqual(bodies.map((b) => b.newGame), [false, true, false]);
});
