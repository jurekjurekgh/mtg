import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OPENROUTER_CHAT_URL, AI_CLIENT_TIMEOUT_MS, aiClientErrorText, createOpenRouterTransport,
} from '../src/table/ai-client.js';

const okRes = (data) => ({ ok: true, status: 200, json: async () => data });
const errRes = (status, data) => ({ ok: false, status, json: async () => data });
const lore = { choices: [{ message: { role: 'assistant', content: 'Mgła nad borem. Nieprzyjaciel czeka.' } }] };

test('AI-E2 client: stałe kontraktu (endpoint + 180 s)', () => {
  assert.equal(OPENROUTER_CHAT_URL, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(AI_CLIENT_TIMEOUT_MS, 180_000); // AI-R6: było 60 s — ucinało dobre odpowiedzi 60–90 s
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
  // AI-R6 (B): dokładna treść — 500 znaków przechodzi verbatim, zalew tnie 2000.
  assert.ok(aiClientErrorText(418, { error: { message: 'x'.repeat(500) } }).includes('x'.repeat(500)), '500 znaków verbatim');
  const long = aiClientErrorText(418, { error: { message: 'x'.repeat(2500) } });
  assert.ok(long.length < 2200, 'obcięcie zalewu');
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

test('AI-E2 client: timeout 180 s (tu: 15 ms) zwalnia slot z błędem', async () => {
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

test('AI-R3 client: przypięty model dostaje provider { order, only, bez fallbacku }', async () => {
  const bodies = [];
  const fetchImpl = async (url, opts) => { bodies.push(JSON.parse(opts.body)); return okRes(lore); };
  const transport = createOpenRouterTransport({
    getApiKey: () => 'k', fetchImpl,
    providerOnlyFor: (id) => (id === 'deepseek/deepseek-v4.1-flash' ? ['inference-net'] : null),
  });
  const res = await transport({ prompt: 'a', modelId: 'deepseek/deepseek-v4.1-flash' });
  assert.equal(res.ok, true);
  assert.deepEqual(bodies[0].provider, {
    order: ['inference-net'], only: ['inference-net'], allow_fallbacks: false,
  });
  assert.equal(bodies[0].model, 'deepseek/deepseek-v4.1-flash');
});

test('AI-R3 client: zwykły model = brak klucza provider (domyślny routing)', async () => {
  const bodies = [];
  const fetchImpl = async (url, opts) => { bodies.push(JSON.parse(opts.body)); return okRes(lore); };
  const pinned = createOpenRouterTransport({
    getApiKey: () => 'k', fetchImpl,
    providerOnlyFor: (id) => (id === 'x/pin' ? ['p1'] : null),
  });
  await pinned({ prompt: 'a', modelId: 'stealth/space-bunny-alpha' });
  assert.ok(!('provider' in bodies[0]));
  const plain = createOpenRouterTransport({ getApiKey: () => 'k', fetchImpl });
  await plain({ prompt: 'a', modelId: 'x/pin' });
  assert.ok(!('provider' in bodies[1]), 'bez providerOnlyFor = brak klucza (wsteczna zgodność)');
  const empty = createOpenRouterTransport({
    getApiKey: () => 'k', fetchImpl, providerOnlyFor: () => [],
  });
  await empty({ prompt: 'a', modelId: 'x/pin' });
  assert.ok(!('provider' in bodies[2]), 'pusta allowlista = brak klucza');
});

test('AI-R6 client (C): abort w trakcie schodzenia ciała = timeout, nie „pusta odpowiedź”', async () => {
  // Nagłówki przyszły od razu, ciało wisi — timer ucina w trakcie text()
  // (prawdziwe text() odrzuca na aborcie — stub wiernie to odtwarza).
  const hangingRes = (signal) => ({
    ok: true, status: 200,
    text: () => new Promise((_, reject) => {
      signal?.addEventListener('abort', () => reject(new Error('aborted')));
    }),
  });
  const fetchImpl = async (url, opts) => hangingRes(opts.signal);
  const transport = createOpenRouterTransport({ getApiKey: () => 'k', fetchImpl, timeoutMs: 15 });
  const res = await transport({ prompt: 'a', modelId: 'm/wolny' });
  assert.equal(res.ok, false);
  assert.ok(res.error.includes('Przekroczono czas oczekiwania'), res.error);
  assert.ok(res.error.includes('m/wolny'), 'timeout nazywa model');
  assert.ok(!res.error.includes('pustą odpowiedź'), 'nie myli timeoutu z pustą odpowiedzią');
});

test('AI-R6 client (B): nie-JSON-owe ciało błędu HTTP wklejane dosłownie', async () => {
  const html = '<html><body>upstream timeout</body></html>';
  const resStub = { ok: false, status: 502, text: async () => html };
  const transport = createOpenRouterTransport({ getApiKey: () => 'k', fetchImpl: async () => resStub });
  const res = await transport({ prompt: 'a', modelId: 'm' });
  assert.equal(res.ok, false);
  assert.ok(res.error.includes('HTTP 502'), res.error);
  assert.ok(res.error.includes('upstream timeout'), 'dokładna treść ciała');
  assert.ok(res.error.includes('nie jest JSON'), 'przyczyna parsowania jawna');
});

test('AI-R6 client (B): popsuty JSON przy HTTP 200 = jawny błąd JSON', async () => {
  const resStub = { ok: true, status: 200, text: async () => '{nie json' };
  const transport = createOpenRouterTransport({ getApiKey: () => 'k', fetchImpl: async () => resStub });
  const res = await transport({ prompt: 'a', modelId: 'm' });
  assert.equal(res.ok, false);
  assert.ok(res.error.includes('Błąd JSON'), res.error);
  assert.ok(res.error.includes('{nie json'), 'surowizna do diagnozy');
});

test('AI-R6 client (B): pusta odpowiedź niesie diagnozę (finish_reason + surowo)', async () => {
  const data = { choices: [{ message: { content: '  ' }, finish_reason: 'length' }], id: 'gen-1' };
  const transport = createOpenRouterTransport({ getApiKey: () => 'k', fetchImpl: async () => okRes(data) });
  const res = await transport({ prompt: 'a', modelId: 'm' });
  assert.equal(res.ok, false);
  assert.ok(res.error.includes('pustą odpowiedź'), res.error);
  assert.ok(res.error.includes('finish_reason: length'), 'diagnoza przyczyny');
  assert.ok(res.error.includes('gen-1'), 'surowe ciało do diagnozy');
});

test('AI-R7 client: messages jadą do API verbatim (ciągłość czatu)', async () => {
  const seen = [];
  const fetchImpl = async (url, opts) => { seen.push(JSON.parse(opts.body)); return okRes(lore); };
  const transport = createOpenRouterTransport({ getApiKey: () => 'sk-test', fetchImpl });
  const messages = [
    { role: 'user', content: 'brief + tura 1' },
    { role: 'assistant', content: 'ODP-1' },
    { role: 'user', content: 'tura 2' },
  ];
  const res = await transport({ prompt: 'tura 2', messages, modelId: 'x/y:free', signal: null });
  assert.equal(res.ok, true);
  assert.deepEqual(seen[0], { model: 'x/y:free', messages });
});

test('AI-R7 client: puste/brak messages = legacy pojedynczy prompt', async () => {
  const seen = [];
  const fetchImpl = async (url, opts) => { seen.push(JSON.parse(opts.body)); return okRes(lore); };
  const transport = createOpenRouterTransport({ getApiKey: () => 'sk-test', fetchImpl });
  await transport({ prompt: 'samo', messages: [], modelId: 'm', signal: null });
  await transport({ prompt: 'samo2', modelId: 'm', signal: null });
  assert.deepEqual(seen[0].messages, [{ role: 'user', content: 'samo' }]);
  assert.deepEqual(seen[1].messages, [{ role: 'user', content: 'samo2' }]);
});
