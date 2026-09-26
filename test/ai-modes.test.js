import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLorePrompt, LORE_COMMENT_LIMIT } from '../src/table/ai-modes.js';

const CTX = {
  botLogName: 'Nieprzyjaciel',
  deckTitle: 'Wiedźmin (BG)',
  deckKey: 'wiedzmin-bg',
  world: 'Wiedźmin',
  turnNumber: 7,
  turnText: '**Tura 7 — Nieprzyjaciel**\n• coś się stało',
};

test('AI-E1 modes: prompt niesie tożsamość, talię, świat i pełny zapis', () => {
  const prompt = buildLorePrompt(CTX);
  assert.ok(prompt.includes('Nieprzyjaciel'));
  assert.ok(prompt.includes('Czarodziejki'));
  assert.ok(prompt.includes('Wiedźmin (BG)'));
  assert.ok(prompt.includes('**Tura 7 — Nieprzyjaciel**'));
  assert.ok(prompt.includes('coś się stało'));
});

test('AI-E1 modes: oczekiwanie = komentarz ostatniej tury, lore, bez meta-nazw, limit', () => {
  const prompt = buildLorePrompt(CTX);
  assert.ok(prompt.includes('OSTATNIĄ turę (nr 7)'));
  assert.ok(prompt.includes('Wiedźmin'));
  assert.ok(prompt.includes('NIE używaj wprost nazw kart Magic: The Gathering'));
  assert.ok(prompt.includes('meta-nazw mechanik'));
  assert.ok(prompt.includes(String(LORE_COMMENT_LIMIT)));
  assert.equal(LORE_COMMENT_LIMIT, 600);
});

test('AI-E1 modes: braki w ctx = sensowne fallbaci (nie „undefined")', () => {
  const prompt = buildLorePrompt({});
  assert.ok(!prompt.includes('undefined'));
  assert.ok(prompt.includes('Nieprzyjaciel'));
  const bare = buildLorePrompt(null);
  assert.ok(bare.includes('Nieprzyjaciel'));
});
