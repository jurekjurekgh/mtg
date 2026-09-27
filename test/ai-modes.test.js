import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLorePrompt, buildPlayerPrompt, buildPromptForMode,
  LORE_COMMENT_LIMIT, PLAYER_COMMENT_LIMIT,
} from '../src/table/ai-modes.js';

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

test('AI-E1 modes: braki w ctx = sensowne fallbaci (nie „undefined”)', () => {
  const prompt = buildLorePrompt({});
  assert.ok(!prompt.includes('undefined'));
  assert.ok(prompt.includes('Nieprzyjaciel'));
  const bare = buildLorePrompt(null);
  assert.ok(bare.includes('Nieprzyjaciel'));
});

test('AI-R2 modes lore: tożsamość — „Nieprzyjaciel” w zapisie to ON (nie 3. gracz)', () => {
  const prompt = buildLorePrompt(CTX);
  assert.ok(prompt.includes('TY jesteś Nieprzyjaciel'));
  assert.ok(prompt.includes('opisuje CIEBIE'));
  assert.ok(prompt.includes('nie trzeciego gracza'));
  assert.ok(prompt.includes('pierwszej osobie'));
});

test('AI-R2 modes lore: ton — konkrety ze świata, mniej poetyki i archaizmów', () => {
  const prompt = buildLorePrompt(CTX);
  assert.ok(prompt.includes('KONKRETNIE do lore świata Wiedźmin'));
  assert.ok(prompt.includes('miejsc, frakcji, postaci, stworów i wydarzeń'));
  assert.ok(prompt.includes('mniej poetyki i archaizmów'));
  assert.ok(prompt.includes('twardych odniesień'));
});

test('AI-R2 modes player: bot-gracz zna stół, żargon MtG mile widziany', () => {
  const prompt = buildPlayerPrompt(CTX);
  assert.ok(prompt.includes('graczem-botem'));
  assert.ok(prompt.includes('Wiedźmin (BG)'));
  assert.ok(prompt.includes('Czarodziejka (człowiek)'));
  assert.ok(prompt.includes('podpisane „Nieprzyjaciel”'));
  assert.ok(prompt.includes('nie trzeci gracz'));
  assert.ok(prompt.includes('żargon MtG jak najbardziej'));
  assert.ok(prompt.includes('topdeck'));
  assert.ok(prompt.includes('OSTATNIĄ turę (nr 7)'));
  assert.ok(prompt.includes('**Tura 7 — Nieprzyjaciel**'));
  assert.ok(prompt.includes(String(PLAYER_COMMENT_LIMIT)));
  assert.equal(PLAYER_COMMENT_LIMIT, 600);
});

test('AI-R2 modes player: obie strony stołu + charakter (humor, złośliwość, wygrana)', () => {
  const prompt = buildPlayerPrompt(CTX);
  assert.ok(prompt.includes('z humorem, czasem złośliwie'));
  assert.ok(prompt.includes('KONKRETNIE do zagrań z ostatniej tury'));
  assert.ok(prompt.includes('próbujesz wygrać'));
  assert.ok(!prompt.includes('undefined'));
  assert.ok(buildPlayerPrompt(null).includes('graczem-botem'));
});

test('AI-R2 modes: dyspozytor trybów (nieznany = bezpieczny lore)', () => {
  assert.ok(buildPromptForMode('player-bot', CTX).includes('graczem-botem'));
  assert.ok(buildPromptForMode('lore-bot', CTX).includes('NIE używaj wprost nazw kart'));
  assert.ok(buildPromptForMode('nie-ma-takiego', CTX).includes('NIE używaj wprost nazw kart'));
  assert.ok(buildPromptForMode(undefined, CTX).includes('TY jesteś Nieprzyjaciel'));
});
