import test from 'node:test';
import assert from 'node:assert/strict';
import { createMockTransport, parseMockFlags } from '../src/table/ai-mock.js';

test('AI-E1 mock: flagi z query (?ai-mock=1/error/delay)', () => {
  assert.deepEqual(parseMockFlags(''), { enabled: false, alwaysFail: false, delayMs: 800 });
  assert.deepEqual(parseMockFlags('?ai-mock=1'), { enabled: true, alwaysFail: false, delayMs: 800 });
  assert.deepEqual(parseMockFlags('?ai-mock=error'), { enabled: true, alwaysFail: true, delayMs: 800 });
  assert.deepEqual(parseMockFlags('?ai-mock=1&ai-mock-delay=50'), { enabled: true, alwaysFail: false, delayMs: 50 });
  assert.deepEqual(parseMockFlags('?ai-mock-delay=zzz'), { enabled: false, alwaysFail: false, delayMs: 800 });
});

test('AI-E1 mock: sukces niesie model i rozmiar promptu', async () => {
  const transport = createMockTransport({ delayMs: 1 });
  const res = await transport({ prompt: 'abcde', modelId: 'x/y:free', signal: null });
  assert.equal(res.ok, true);
  assert.ok(res.text.includes('x/y:free'));
  assert.ok(res.text.includes('5 znaków'));
});

test('AI-E1 mock: alwaysFail + abort dają błąd', async () => {
  const failing = createMockTransport({ delayMs: 1, alwaysFail: true });
  const err = await failing({ prompt: 'x', modelId: 'm', signal: null });
  assert.equal(err.ok, false);
  assert.ok(err.error.length > 0);
  const ok = createMockTransport({ delayMs: 1 });
  const aborted = await ok({ prompt: 'x', modelId: 'm', signal: { aborted: true } });
  assert.equal(aborted.ok, false);
});

test('AI-R7 mock: rozmowa — rozmiar ze wszystkich wiadomości + ich liczba', async () => {
  const transport = createMockTransport({ delayMs: 1 });
  const res = await transport({
    messages: [{ role: 'user', content: 'abc' }, { role: 'assistant', content: 'de' }],
    modelId: 'm', signal: null,
  });
  assert.equal(res.ok, true);
  assert.ok(res.text.includes('6 znaków')); // 'abc\nde' po złączeniu
  assert.ok(res.text.includes('wiadomości: 2'));
});
