// M195 — uwagi właściciela z testów ręcznych (2026-08-23):
// A — brak wizarda many przy płatności „zapłać albo poświęć",
// B — bot marnuje trick bojowy tapiąc siebie w swojej fazie ataku,
// C/C1 — wielocelowość jako eksplozja kombinacji zamiast listy wyboru,
// D — „(wybór gracza)" myli, gdy decyduje bot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeGameEvent } from '../src/table/session.js';

const NAMES = { p1: 'Ty', p2: 'Nieprzyjaciel' };
const HELPERS = {
  nameOf: (cardId) => ({
    'veiled-ascension': 'Veiled Ascension',
    'rupture-spire': 'Rupture Spire',
  }[cardId] ?? cardId),
  nameOfObject: () => 'Rupture Spire',
  isPlayer: (id) => NAMES[id] != null,
};

// ---- D: komunikat nazywa DECYDENTA, nie anonimowego „gracza" -------------
// Zgłoszenie: „Veiled Ascension zagrał Bot. W Rozgrywce: »skorzystać z efektu
// „you may"? (wybór gracza)«. To »gracza« jest mylące."

test('M195/D: opcjonalny trigger BOTA nie mówi „wybór gracza"', () => {
  const line = String(describeGameEvent({
    type: 'optional_trigger_required', playerId: 'p2', cardId: 'veiled-ascension',
  }, HELPERS, NAMES));
  assert.ok(!/wybór gracza/.test(line),
    `„gracza" sugeruje, że to MOJA decyzja: ${JSON.stringify(line)}`);
  assert.match(line, /Nieprzyjaciel/,
    `komunikat ma nazwać decydenta: ${JSON.stringify(line)}`);
  assert.match(line, /opcjonaln/i, 'i powiedzieć, że wybór jest opcjonalny');
});

test('M195/D: ten sam trigger u CZŁOWIEKA mówi o mnie', () => {
  const line = String(describeGameEvent({
    type: 'optional_trigger_required', playerId: 'p1', cardId: 'veiled-ascension',
  }, HELPERS, NAMES));
  assert.ok(!/wybór gracza/.test(line), `bez anonimowego „gracza": ${JSON.stringify(line)}`);
  assert.match(line, /Ty|Twój|Twoja/, `decydentem jestem ja: ${JSON.stringify(line)}`);
});

test('M195/D: „zapłać albo poświęć" też nazywa decydenta', () => {
  // Ten sam wzorzec „(wybór gracza)" — właściciel: „przypuszczam, że ten sam
  // wzór jest w wielu innych kartach. Do poprawki."
  const bot = String(describeGameEvent({
    type: 'pay_or_sacrifice_required', playerId: 'p2', sourceId: 'spire', amount: 1,
  }, HELPERS, NAMES));
  assert.ok(!/wybór gracza/.test(bot), `bez anonimowego „gracza": ${JSON.stringify(bot)}`);
  assert.match(bot, /Nieprzyjaciel/, `decydent nazwany: ${JSON.stringify(bot)}`);
  const mine = String(describeGameEvent({
    type: 'pay_or_sacrifice_required', playerId: 'p1', sourceId: 'spire', amount: 1,
  }, HELPERS, NAMES));
  assert.match(mine, /Ty|Twój|Twoja/, `moja decyzja: ${JSON.stringify(mine)}`);
});

test('M195/D: „zapłacić {N}?" (optional_pay) też nazywa decydenta', () => {
  const bot = String(describeGameEvent({
    type: 'optional_pay_required', playerId: 'p2', cardId: 'veiled-ascension', payMana: 2,
  }, HELPERS, NAMES));
  assert.ok(!/wybór gracza/.test(bot), `bez anonimowego „gracza": ${JSON.stringify(bot)}`);
  assert.match(bot, /Nieprzyjaciel/, `decydent nazwany: ${JSON.stringify(bot)}`);
});

test('M195/D: STRAŻNIK — żaden opis zdarzenia nie mówi „(wybór gracza)"', async () => {
  // Klasa, nie pojedynczy komunikat: właściciel wprost napisał, że wzorzec
  // powtarza się w wielu kartach. Strażnik czyta ŹRÓDŁO opisów.
  const fs = await import('node:fs');
  const src = fs.readFileSync('src/table/session.js', 'utf8');
  const hits = src.split('\n')
    .map((line, i) => [i + 1, line])
    .filter(([, line]) => line.includes('(wybór gracza)'));
  assert.deepEqual(hits, [],
    `„(wybór gracza)" nie mówi KTO decyduje — użyj whoN(e.playerId):\n${hits.map(([n, l]) => `  ${n}: ${l.trim()}`).join('\n')}`);
});
