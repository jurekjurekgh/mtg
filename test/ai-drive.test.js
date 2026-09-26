import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAiDrivePayload, createAiDriveLogger } from '../src/table/ai-drive.js';

test('AI-E3 drive: payload ma 7 pól kontraktu §6 + chars = długość', () => {
  const p = buildAiDrivePayload({
    mode: 'lore-bot', gameId: '7-2026-09-26T00:00:00.000Z', turn: 3,
    model: 'x/y:free', response: 'Mgła. Czeka.', tsClient: '2026-09-26T01:00:00.000Z',
  });
  assert.deepEqual(p, {
    mode: 'lore-bot', gameId: '7-2026-09-26T00:00:00.000Z', turn: 3,
    model: 'x/y:free', chars: 12, response: 'Mgła. Czeka.',
    tsClient: '2026-09-26T01:00:00.000Z',
  });
});

test('AI-E3 drive: payload toleruje braki (nigdy nie rzuca)', () => {
  assert.deepEqual(buildAiDrivePayload(), {
    mode: 'lore-bot', gameId: '', turn: 0, model: '', chars: 0, response: '', tsClient: '',
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
    chars: 5, response: 'tekst', tsClient: 'ts',
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
