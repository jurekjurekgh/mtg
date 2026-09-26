import test from 'node:test';
import assert from 'node:assert/strict';
import { createAiQueue } from '../src/table/ai-queue.js';

const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
};
const harness = (transport) => {
  const pendings = [];
  const resolved = [];
  const queue = createAiQueue({
    transport,
    onPending: (slot) => pendings.push(slot.id),
    onResolved: (slot) => resolved.push(slot),
  });
  return { queue, pendings, resolved };
};

test('AI-E1 queue: późniejsza odpowiedź CZEKA na wcześniejszą (FIFO)', async () => {
  const gates = [];
  const { queue, pendings, resolved } = harness(() => {
    const d = deferred();
    gates.push(d);
    return d.promise;
  });
  const a = queue.enqueue({ prompt: 'A', modelId: 'm' });
  const b = queue.enqueue({ prompt: 'B', modelId: 'm' });
  assert.deepEqual(pendings, [a, b]);
  await tick(); // transport startuje asynchronicznie (fire-and-forget)
  gates[1].resolve({ ok: true, text: 'B!' }); // B wraca pierwsze…
  await tick(); await tick();
  assert.equal(resolved.length, 0); // …ale render czeka na A
  gates[0].resolve({ ok: true, text: 'A!' });
  await tick(); await tick();
  assert.deepEqual(resolved.map((s) => s.result.text), ['A!', 'B!']);
});

test('AI-E1 queue: błąd też zwalnia kolejkę (ścieżka błędu w kolejności)', async () => {
  const gates = [];
  const { queue, resolved } = harness(() => {
    const d = deferred();
    gates.push(d);
    return d.promise;
  });
  queue.enqueue({ prompt: 'A', modelId: 'm' });
  queue.enqueue({ prompt: 'B', modelId: 'm' });
  await tick();
  gates[0].resolve({ ok: false, error: 'boom' });
  gates[1].resolve({ ok: true, text: 'B!' });
  await tick(); await tick();
  assert.equal(resolved.length, 2);
  assert.equal(resolved[0].result.ok, false);
  assert.equal(resolved[1].result.text, 'B!');
});

test('AI-E1 queue: retry w tym samym slocie, nowy model, stary prompt', async () => {
  const seen = [];
  const { queue, pendings, resolved } = harness(async (req) => {
    seen.push(req.modelId);
    return seen.length === 1 ? { ok: false, error: 'padło' } : { ok: true, text: 'działa' };
  });
  const id = queue.enqueue({ prompt: 'ORYGINAŁ', modelId: 'stary' });
  await tick(); await tick();
  assert.equal(resolved.length, 1);
  assert.equal(queue.retry(id, { modelId: 'nowy' }), true);
  assert.deepEqual(pendings, [id, id]);
  await tick(); await tick();
  assert.equal(resolved.length, 2);
  assert.equal(resolved[1].id, id);
  assert.equal(resolved[1].attempt, 2);
  assert.equal(resolved[1].modelId, 'nowy');
  assert.equal(resolved[1].prompt, 'ORYGINAŁ');
  assert.deepEqual(seen, ['stary', 'nowy']);
});

test('AI-E1 queue: retry odrzuca obce/gotowe/w-locie', async () => {
  const { queue } = harness(async () => ({ ok: true, text: 'x' }));
  assert.equal(queue.retry(999, {}), false);
  const id = queue.enqueue({ prompt: 'A', modelId: 'm' });
  assert.equal(queue.retry(id, {}), false); // w locie, bez wyniku
  await tick(); await tick();
  assert.equal(queue.retry(id, {}), false); // sukces — nie ma czego ponawiać
});

test('AI-E1 queue: reset gubi spóźnione (nowa partia)', async () => {
  const d = deferred();
  const { queue, resolved } = harness(() => d.promise);
  queue.enqueue({ prompt: 'A', modelId: 'm' });
  queue.reset();
  assert.equal(queue.pendingCount(), 0);
  d.resolve({ ok: true, text: 'spóźnione' });
  await tick(); await tick();
  assert.equal(resolved.length, 0);
  assert.equal(queue.retry(1, {}), false);
});

test('AI-E1 queue: wyjątek transportu = błąd (normalizacja)', async () => {
  const { queue, resolved } = harness(async () => { throw new Error('sieć padła'); });
  queue.enqueue({ prompt: 'A', modelId: 'm' });
  await tick(); await tick();
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].result.ok, false);
  assert.ok(resolved[0].result.error.includes('sieć padła'));
});
