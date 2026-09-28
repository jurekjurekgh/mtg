import test from 'node:test';
import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import { createOpenRouterTransport } from '../src/table/ai-client.js';

const answer = { choices: [{ message: { content: 'stub response' } }] };
const cancelled = { ok: false, error: 'Przerwano zapytanie do AI.' };
function deferred() {
  let resolve; let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function client(fetchImpl, timeoutMs = 60000) {
  return createOpenRouterTransport({ getApiKey: () => 'local-stub-only', fetchImpl, timeoutMs });
}
const request = (transport, signal) => transport({ prompt: 'local test', modelId: 'stub-model', signal });

// F3: żadnego połączenia z OpenRouter; kontrolujemy granicę nagłówki/ciało.
test('PR140/F3: anulowanie przed fetch nie wysyła zapytania', async () => {
  const ctrl = new AbortController(); ctrl.abort(); let calls = 0;
  const result = await request(client(async () => { calls++; }), ctrl.signal);
  assert.deepEqual(result, cancelled); assert.equal(calls, 0);
});

test('PR140/F3: anulowanie tuż po nagłówkach to nie timeout i nie czyta ciała', async () => {
  const ctrl = new AbortController(); let reads = 0;
  const result = await request(client(async () => {
    ctrl.abort();
    return { ok: true, status: 200, text: async () => { reads++; return JSON.stringify(answer); } };
  }), ctrl.signal);
  assert.deepEqual(result, cancelled); assert.equal(reads, 0);
  assert.equal(getEventListeners(ctrl.signal, 'abort').length, 0);
});

for (const method of ['text', 'json']) {
  test(`PR140/F3: zewnętrzny abort podczas ${method} odrzucającego odczyt`, async () => {
    const ctrl = new AbortController(); const started = deferred();
    const transport = client(async (_url, { signal }) => ({ ok: true, status: 200,
      [method]: () => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
        started.resolve();
      }),
    }));
    const pending = request(transport, ctrl.signal);
    await started.promise; ctrl.abort();
    assert.deepEqual(await pending, cancelled);
    assert.equal(getEventListeners(ctrl.signal, 'abort').length, 0);
  });

  test(`PR140/F3: odczyt ${method} kończący się równocześnie z abortem nie udaje sukcesu/timeoutu`, async () => {
    const ctrl = new AbortController();
    const result = await request(client(async () => ({ ok: true, status: 200,
      [method]: async () => { ctrl.abort(); return method === 'text' ? JSON.stringify(answer) : answer; },
    })), ctrl.signal);
    assert.deepEqual(result, cancelled);
  });

  test(`PR140/F3: rzeczywisty timeout podczas ${method} pozostaje timeoutem`, async () => {
    const transport = client(async (_url, { signal }) => ({ ok: true, status: 200,
      [method]: () => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      }),
    }), 10);
    const result = await request(transport);
    assert.equal(result.ok, false);
    assert.match(result.error, /Przekroczono czas oczekiwania.*stub-model/);
    assert.notEqual(result.error, cancelled.error);
  });
}

for (const first of ['user', 'timeout']) {
  test(`PR140/F3: pierwsza przyczyna wygrywa, jeśli ciało ignoruje sygnał (${first})`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const ctrl = new AbortController(); const started = deferred(); const body = deferred();
    const transport = client(async () => ({ ok: true, status: 200,
      text: () => { started.resolve(); return body.promise; },
    }), 100);
    const pending = request(transport, ctrl.signal); await started.promise;
    if (first === 'user') { ctrl.abort(); t.mock.timers.tick(101); }
    else { t.mock.timers.tick(101); ctrl.abort(); }
    body.resolve(JSON.stringify(answer));
    const result = await pending;
    if (first === 'user') assert.deepEqual(result, cancelled);
    else assert.match(result.error, /Przekroczono czas oczekiwania/);
    assert.equal(getEventListeners(ctrl.signal, 'abort').length, 0);
  });
}

test('PR140/F3: błąd sieci bez abortu nie staje się anulowaniem', async () => {
  const result = await request(client(async () => { throw new TypeError('offline-stub'); }));
  assert.equal(result.ok, false); assert.match(result.error, /Błąd sieci.*offline-stub/);
});

for (const method of ['text', 'json']) {
  test(`PR140/F3: sukces ${method} usuwa listener zewnętrznego sygnału`, async () => {
    const ctrl = new AbortController();
    const result = await request(client(async () => ({ ok: true, status: 200,
      [method]: async () => method === 'text' ? JSON.stringify(answer) : answer,
    })), ctrl.signal);
    assert.deepEqual(result, { ok: true, text: 'stub response' });
    assert.equal(getEventListeners(ctrl.signal, 'abort').length, 0);
  });
}
