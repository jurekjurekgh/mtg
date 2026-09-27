import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLorePrompt, buildPlayerPrompt, buildObserverPrompt,
  buildLoreObserverPrompt, buildSkitPrompt, buildPromptForMode,
  LORE_COMMENT_LIMIT, PLAYER_COMMENT_LIMIT,
  OBSERVER_COMMENT_LIMIT, LORE_OBSERVER_COMMENT_LIMIT,
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

test('AI-R4 modes player: tożsamość gracza, zakaz slangu meta-graczowego', () => {
  const prompt = buildPlayerPrompt(CTX);
  assert.ok(prompt.includes('graczem-botem'));
  assert.ok(prompt.includes('Wiedźmin (BG)'));
  assert.ok(prompt.includes('Czarodziejka (człowiek)'));
  assert.ok(prompt.includes('podpisane „Nieprzyjaciel”'));
  assert.ok(prompt.includes('nie trzeci gracz'));
  assert.ok(prompt.includes('ZAKAZ slangu meta-graczowego'));
  assert.ok(prompt.includes('deckout, missplay, removal, topdeck'));
  assert.ok(prompt.includes('mów po polsku, zwykłymi słowami'));
  assert.ok(prompt.includes('OSTATNIĄ turę (nr 7)'));
  assert.ok(prompt.includes('**Tura 7 — Nieprzyjaciel**'));
  assert.ok(prompt.includes(String(PLAYER_COMMENT_LIMIT)));
  assert.equal(PLAYER_COMMENT_LIMIT, 600);
});

test('AI-R4 modes player: zwięźle w punktach + odczucia, charakter stołu', () => {
  const prompt = buildPlayerPrompt(CTX);
  assert.ok(prompt.includes('z humorem, czasem złośliwie'));
  assert.ok(prompt.includes('zwięźle, konkretnie, w punktach, bez powtórzeń'));
  assert.ok(prompt.includes('KONKRETNIE do zagrań z ostatniej tury'));
  assert.ok(prompt.includes('swoje odczucia i wrażenia'));
  assert.ok(prompt.includes('próbujesz wygrać'));
  assert.ok(!prompt.includes('undefined'));
  assert.ok(buildPlayerPrompt(null).includes('graczem-botem'));
});

test('AI-R4 modes observer: trzecioosobowy, te same reguły co gracz', () => {
  const prompt = buildObserverPrompt(CTX);
  assert.ok(prompt.includes('niezależnym obserwatorem'));
  assert.ok(prompt.includes('Wiedźmin (BG)'));
  assert.ok(prompt.includes('trzeciej osobie'));
  assert.ok(prompt.includes('ZAKAZ slangu meta-graczowego'));
  assert.ok(prompt.includes('zwięźle, konkretnie, w punktach, bez powtórzeń'));
  assert.ok(prompt.includes('KONKRETNIE do zagrań z ostatniej tury'));
  assert.ok(prompt.includes('odczucia i wrażenia'));
  assert.ok(prompt.includes('OSTATNIĄ turę (nr 7)'));
  assert.ok(prompt.includes('**Tura 7 — Nieprzyjaciel**'));
  assert.ok(prompt.includes(String(OBSERVER_COMMENT_LIMIT)));
  assert.equal(OBSERVER_COMMENT_LIMIT, 600);
  assert.ok(!prompt.includes('undefined'));
  assert.ok(buildObserverPrompt(null).includes('obserwatorem'));
});

test('AI-R4 modes lore-observer: klimat lore-bota, narracja z boku', () => {
  const prompt = buildLoreObserverPrompt(CTX);
  assert.ok(prompt.includes('niezależnym obserwatorem pojedynku magów'));
  assert.ok(prompt.includes('Wiedźmin (BG)'));
  assert.ok(prompt.includes('trzeciej osobie'));
  assert.ok(prompt.includes('KONKRETNIE do lore świata Wiedźmin'));
  assert.ok(prompt.includes('NIE używaj wprost nazw kart Magic: The Gathering'));
  assert.ok(prompt.includes('OSTATNIĄ turę (nr 7)'));
  assert.ok(prompt.includes(String(LORE_OBSERVER_COMMENT_LIMIT)));
  assert.equal(LORE_OBSERVER_COMMENT_LIMIT, 600);
  assert.ok(!prompt.includes('undefined'));
  assert.ok(buildLoreObserverPrompt(null).includes('obserwatorem'));
});

test('AI-R4 modes skit: dokładny brief właściciela (światy, nagłówek, limit)', () => {
  const prompt = buildSkitPrompt(CTX);
  assert.ok(prompt.includes('Tales of…'));
  assert.ok(prompt.includes('Dominaria'));
  assert.ok(prompt.includes('Zendikar'));
  assert.ok(prompt.includes('**SKIT: -tytuł-**'));
  assert.ok(prompt.includes('NIE używaj nazw użytych kart MtG'));
  assert.ok(prompt.includes('in-character'));
  assert.ok(prompt.includes('250 słów'));
  assert.ok(prompt.includes('**SKIT: RDZA I SĘPY**'), 'przykład few-shot w prompcie');
  assert.ok(prompt.includes('Garrek'));
});

test('AI-R4 modes skit: kontekst rozgrywki (talia, tura, log) dopisany', () => {
  const prompt = buildSkitPrompt(CTX);
  assert.ok(prompt.includes('Wiedźmin (BG)'));
  assert.ok(prompt.includes('nr 7'));
  assert.ok(prompt.includes('**Tura 7 — Nieprzyjaciel**'));
  assert.ok(prompt.includes('coś się stało'));
  assert.ok(!prompt.includes('undefined'));
  assert.ok(buildSkitPrompt(null).includes('Dominaria'));
});

test('AI-R4 modes: dyspozytor 5 trybów (nieznany = bezpieczny lore)', () => {
  assert.ok(buildPromptForMode('lore-bot', CTX).includes('TY jesteś Nieprzyjaciel'));
  assert.ok(buildPromptForMode('player-bot', CTX).includes('graczem-botem'));
  assert.ok(buildPromptForMode('observer', CTX).includes('niezależnym obserwatorem'));
  assert.ok(buildPromptForMode('lore-observer', CTX).includes('obserwatorem pojedynku magów'));
  assert.ok(buildPromptForMode('skit', CTX).includes('**SKIT: -tytuł-**'));
  assert.ok(buildPromptForMode('nie-ma-takiego', CTX).includes('NIE używaj wprost nazw kart'));
  assert.ok(buildPromptForMode(undefined, CTX).includes('TY jesteś Nieprzyjaciel'));
});
