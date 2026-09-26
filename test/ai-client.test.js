import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OPENROUTER_CHAT_URL, AI_CLIENT_TIMEOUT_MS, aiClientErrorText, createOpenRouterTransport,
} from '../src/table/ai-client.js';

const okRes = (data) => ({ ok: true, status: 200, json: async () => data });
const errRes = (status, data) => ({ ok: false, status, json: async () => data });
const lore = { choices: [{ message: { role: 'assistant', content: 'Mgła nad borem. Nieprzyjaciel czeka.' } }] };

test('AI-E2 client: stałe kontraktu (endpoint + 60 s)', () => {
  assert.equal(OPENROUTER_CHAT_URL, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(AI_CLIENT_TIMEOUT_MS, 60_000);
});

test('AI-E2 client: sukces — kształt żądania jak w apce referencyjnej', async () => {
  const seen = [];
  const fetchImpl = async (url, opts) => { seen.push([url, opts]); return okRes(lore); };
  const transport = createOpenRouterTransport({ getApiKey: () => 'sk-test', fetchImpl });
  const res = await transport({ prompt: 'opowiedz turę', modelId: 'x/y:free', signal: null });
  assert.deepEqual(res, { ok: true, text: 'Mgła nad borem. Nieprzyjaciel czeka.' });
  assert.equal(seen.length, 1);
  const [url, opts] = seen[0];
  assert.equal(url, OPENROUTER_CHAT_URL);
  assert.equal(opts.method, 'POST');
  assert.equal(opts.headers.Authorization, 'Bearer sk-test');
  assert.equal(opts.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(opts.body), {
    model: 'x/y:free', messages: [{ role: 'user', content: 'opowiedz turę' }],
  });
});

test('AI-E2 client: klucz czytany na KAŻDE zapytanie (live setup)', async () => {
  let key = 'pierwszy';
  const keys = [];
  const fetchImpl = async (url, opts) => { keys.push(opts.headers.Authorization); return okRes(lore); };
  const transport = createOpenRouterTransport({ getApiKey: () => key, fetchImpl });
  await transport({ prompt: 'a', modelId: 'm' });
  key = '  drugi  ';
  await transport({ prompt: 'b', modelId: 'm' });
  assert.deepEqual(keys, ['Bearer pierwszy', 'Bearer drugi']);
});

test('AI-E2 client: brak klucza = błąd BEZ wołania sieci', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return okRes(lore); };
  for (const getApiKey of [() => '', () => '   ', undefined]) {
    const transport = createOpenRouterTransport({ getApiKey, fetchImpl });
    const res = await transport({ prompt: 'a', modelId: 'm' });
    assert.equal(res.ok, false);
    assert.ok(res.error.includes('Brak klucza API'));
  }
  assert.equal(calls, 0);
});

test('AI-E2 client: brak fetcha w środowisku = czytelny błąd', async () => {
  const transport = createOpenRouterTransport({ getApiKey: () => 'k', fetchImpl: null });
  const res = await transport({ prompt: 'a', modelId: 'm' });
  assert.equal(res.ok, false);
  assert.ok(res.error.includes('Brak `fetch`'));
});

test('AI-E2 client: głęboki parse błędów (wzorzec error.metadata.raw)', () => {
  assert.ok(aiClientErrorText(401, { error: { message: 'invalid key' } }).includes('Nieprawidłowy klucz API'));
  assert.ok(aiClientErrorText(401, { error: { message: 'invalid key' } }).includes('invalid key'));
  assert.ok(aiClientErrorText(429, { error: { metadata: { raw: 'rate limited' } } }).includes('Limit zapytań'));
  assert.ok(aiClientErrorText(500, { error: { metadata: { raw: { code: 'boom' } } } }).includes('"boom"'));
  assert.ok(aiClientErrorText(402, { error: 'top up' }).includes('Brak środków'));
  assert.ok(aiClientErrorText(404, null).includes('HTTP 404'));
  assert.ok(aiClientErrorText(503, 'plain string').includes('plain string'));
  assert.ok(aiClientErrorText(0, null).length > 0);
  const long = aiClientErrorText(418, { error: { message: 'x'.repeat(500) } });
  assert.ok(long.length < 450, 'obcięcie zalewu');
});

test('AI-E2 client: transport mapuje HTTP na polskie komunikaty', async () => {
  const run = (status, data) => createOpenRouterTransport({
    getApiKey: () => 'k', fetchImpl: async () => errRes(status, data),
  })({ prompt: 'a', modelId: 'm' });
  assert.ok((await run(401, { error: { message: 'bad key' } })).error.includes('Nieprawidłowy klucz API'));
  assert.ok((await run(429, { error: { message: 'slow down' } })).error.includes('„Ponów”'));
  assert.ok((await run(500, { error: { message: 'kaput' } })).error.includes('kaput'));
});

test('AI-E2 client: popsuty JSON / pusta treść nie wywalają (błąd, nie wyjątek)', async () => {
  const badJson = { ok: false, status: 502, json: async () => { throw new SyntaxError('html'); } };
  const t1 = createOpenRouterTransport({ getApiKey: () => 'k', fetchImpl: async () => badJson });
  assert.ok((await t1({ prompt: 'a', modelId: 'm' })).error.includes('HTTP 502'));
  for (const data of [{ choices: [] }, { choices: [{ message: {} }] }, { choices: [{ message: { content: '  ' } }] }, null]) {
    const t = createOpenRouterTransport({ getApiKey: () => 'k', fetchImpl: async () => okRes(data) });
    const res = await t({ prompt: 'a', modelId: 'm' });
    assert.equal(res.ok, false);
    assert.ok(res.error.includes('pustą odpowiedź'));
  }
});

test('AI-E2 client: wywrotka sieci = błąd z tekstem (nie wyjątek)', async () => {
  const transport = createOpenRouterTransport({
    getApiKey: () => 'k', fetchImpl: async () => { throw new TypeError('fetch failed'); },
  });
  const res = await transport({ prompt: 'a', modelId: 'm' });
  assert.equal(res.ok, false);
  assert.ok(res.error.includes('Błąd sieci'));
  assert.ok(res.error.includes('fetch failed'));
});

test('AI-E2 client: abort PRZED startem nie rusza sieci', async () => {
  let calls = 0;
  const transport = createOpenRouterTransport({
    getApiKey: () => 'k', fetchImpl: async () => { calls += 1; return okRes(lore); },
  });
  const res = await transport({ prompt: 'a', modelId: 'm', signal: { aborted: true } });
  assert.equal(res.ok, false);
  assert.ok(res.error.includes('Przerwano'));
  assert.equal(calls, 0);
});

test('AI-E2 client: abort w locie = „Przerwano”', async () => {
  const fetchImpl = (url, opts) => new Promise((_, reject) => {
    opts.signal?.addEventListener('abort', () => reject(new Error('abort-test')));
  });
  const transport = createOpenRouterTransport({ getApiKey: () => 'k', fetchImpl, timeoutMs: 5000 });
  const ctrl = new AbortController();
  const pending = transport({ prompt: 'a', modelId: 'm', signal: ctrl.signal });
  ctrl.abort();
  const res = await pending;
  assert.equal(res.ok, false);
  assert.ok(res.error.includes('Przerwano'));
});

test('AI-E2 client: timeout 60 s (tu: 15 ms) zwalnia slot z błędem', async () => {
  let calls = 0;
  const fetchImpl = (url, opts) => new Promise((_, reject) => {
    calls += 1;
    opts.signal?.addEventListener('abort', () => reject(new Error('abort-test')));
  });
  const transport = createOpenRouterTransport({ getApiKey: () => 'k', fetchImpl, timeoutMs: 15 });
  const res = await transport({ prompt: 'a', modelId: 'm' });
  assert.equal(calls, 1, 'żądanie wyszło, odpowiedź nie przyszła');
  assert.equal(res.ok, false);
  assert.ok(res.error.includes('Przekroczono czas oczekiwania'));
});
