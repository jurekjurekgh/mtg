import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAiDrivePayload, createAiDriveLogger } from '../src/table/ai-drive.js';

// F2: połączenie producenta i konsumenta, nie tylko logger karmiony surowym obiektem.
// Historyczny main.js robił log(buildPayload(entry)); normalizacja nie może
// zamieniać braku dyspozycji „newGame” w jawne false i blokować automatu.
function recorder(getUrl = () => 'https://example.invalid/local-stub') {
  const bodies = [];
  const log = createAiDriveLogger({ getUrl, fetchImpl: async (_url, options) => {
    bodies.push(JSON.parse(options.body)); return {};
  } });
  return { bodies, log };
}

test('PR140/F2: kompozycja builder → logger stawia tylko pierwszy nagłówek gameId', async () => {
  const { bodies, log } = recorder();
  for (const [gameId, turn] of [['g1', 5], ['g1', 6], ['g2', 1], ['g1', 9]]) {
    await log(buildAiDrivePayload({ gameId, turn, mode: 'lore-bot', response: 'tekst', decks: 'A vs B' }));
  }
  assert.deepEqual(bodies.map((p) => p.newGame), [true, false, true, false]);
  assert.deepEqual(bodies.map((p) => p.turn), [5, 6, 1, 9]);
  assert.ok(bodies.every((p) => p.decks === 'A vs B' && p.chars === 5));
});

test('PR140/F2: JSON round-trip zachowuje brak nadpisania; body POST ma boolean', async () => {
  const { bodies, log } = recorder();
  const entry = JSON.parse(JSON.stringify(buildAiDrivePayload({ gameId: 'g1', response: 'x' })));
  assert.equal(Object.hasOwn(entry, 'newGame'), false, 'brak dyspozycji to nie false');
  await log(entry); await log(entry);
  assert.deepEqual(bodies.map((p) => p.newGame), [true, false]);
  assert.ok(bodies.every((p) => typeof p.newGame === 'boolean'));
});

test('PR140/F2: null/undefined wybierają automat, jawne false/true zachowują znaczenie', async () => {
  const { bodies, log } = recorder();
  for (const entry of [
    { gameId: 'g1', newGame: false }, { gameId: 'g1', newGame: true },
    { gameId: 'g2', newGame: null }, { gameId: 'g2', newGame: undefined },
  ]) await log(buildAiDrivePayload(entry));
  assert.deepEqual(bodies.map((p) => p.newGame), [false, true, true, false]);
});

test('PR140/F2: wyłączony zapis nie zużywa pierwszego wpisu partii', async () => {
  let url = '';
  const { bodies, log } = recorder(() => url);
  const entry = buildAiDrivePayload({ gameId: 'g1' });
  assert.deepEqual(await log(entry), { ok: false, skipped: true });
  assert.equal(bodies.length, 0);
  url = 'https://example.invalid/local-stub';
  await log(entry); await log(entry);
  assert.deepEqual(bodies.map((p) => p.newGame), [true, false]);
});

test('PR140/F2: surowe wpisy nowego main i starsza kompozycja mają ten sam kontrakt', async () => {
  const raw = recorder(); const composed = recorder();
  for (const turn of [2, 3]) {
    const entry = { gameId: 'same', turn, response: 'Odpowiedź', model: 'stub', tsClient: '2026-09-28' };
    await raw.log(entry); await composed.log(buildAiDrivePayload(entry));
  }
  assert.deepEqual(raw.bodies, composed.bodies);
});

test('PR140/F2: pusty gameId nie tworzy nagłówka, wyraźne false nie znika w builderze', async () => {
  const { bodies, log } = recorder();
  await log(buildAiDrivePayload());
  await log(buildAiDrivePayload({ gameId: 'explicit', newGame: false }));
  assert.deepEqual(bodies.map((p) => p.newGame), [false, false]);
  assert.equal(buildAiDrivePayload({ newGame: false }).newGame, false);
  assert.equal(buildAiDrivePayload({ newGame: true }).newGame, true);
});
