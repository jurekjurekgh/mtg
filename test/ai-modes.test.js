import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLorePrompt, buildPlayerPrompt, buildObserverPrompt,
  buildLoreObserverPrompt, buildSkitPrompt, buildPromptForMode,
  buildChatMessagesForMode,
  LORE_COMMENT_LIMIT, PLAYER_COMMENT_LIMIT,
  OBSERVER_COMMENT_LIMIT, LORE_OBSERVER_COMMENT_LIMIT,
} from '../src/table/ai-modes.js';

const CTX = {
  botLogName: 'Nieprzyjaciel',
  deckTitle: 'Wiedźmin (BG)',
  deckKey: 'wiedzmin-bg',
  world: 'Wiedźmin',
  heroDeckTitle: 'Rycerze (WU)',
  heroDeckKey: 'rycerze-wu',
  heroWorld: 'Kaldheim',
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

test('AI-R4 modes skit: dokładny brief właściciela (nagłówek, limit, przykład)', () => {
  const prompt = buildSkitPrompt(CTX);
  assert.ok(prompt.includes('Tales of…'));
  assert.ok(prompt.includes('**SKIT: -tytuł-**'));
  assert.ok(prompt.includes('NIE używaj nazw użytych kart MtG'));
  assert.ok(prompt.includes('in-character'));
  assert.ok(prompt.includes('250 słów'));
  assert.ok(prompt.includes('**SKIT: RDZA I SĘPY**'), 'przykład few-shot w prompcie');
  assert.ok(prompt.includes('Garrek'));
});

test('AI-R8 modes: KAŻDY tryb niesie talię Czarodziejki (zgłoszenie właściciela 2026-09-29)', () => {
  // Właściciel: „w prompcie startowym, niezależnie od trybu, nie idzie
  // informacja, jaką talią gra Czarodziejka” — jeden model komentował
  // „Czarodziejka gra talią Czarodziejka, dziwne”, drugi mówił tylko o talii
  // bota. Pola heroDeck/heroWorld były liczone w baseCtx i przekazywane
  // z main.js, ale używał ich wyłącznie skit.
  const tryby = ['lore-bot', 'player-bot', 'observer', 'lore-observer', 'skit'];
  for (const mode of tryby) {
    const prompt = buildPromptForMode(mode, CTX);
    assert.ok(prompt.includes('Rycerze (WU)'), `${mode}: brak talii Czarodziejki`);
    assert.ok(prompt.includes('Wiedźmin (BG)'), `${mode}: brak talii bota`);
  }
  // Tryby lore niosą dodatkowo JEJ świat (inaczej model wrzuci jej karty
  // w świat bota); „przy stole” (player/observer) wystarczy nazwa talii.
  for (const mode of ['lore-bot', 'lore-observer', 'skit']) {
    assert.ok(buildPromptForMode(mode, CTX).includes('Kaldheim'),
      `${mode}: brak świata talii Czarodziejki`);
  }
  // Fallback: brak pól = „(nieznana talia)”, nigdy „undefined”.
  for (const mode of tryby) {
    const bare = buildPromptForMode(mode, { ...CTX, heroDeckTitle: undefined, heroDeckKey: undefined, heroWorld: undefined });
    assert.ok(bare.includes('(nieznana talia)'), `${mode}: brak fallbacku talii`);
    assert.ok(!buildPromptForMode(mode, null).includes('undefined'), `${mode}: wyciek undefined`);
  }
});

test('AI-R4b modes skit: UWAGA niesie PRAWDZIWE światy obu talii (zero hardcode)', () => {
  const prompt = buildSkitPrompt(CTX);
  assert.ok(prompt.includes('pochodzą ze świata Kaldheim'));
  assert.ok(prompt.includes('pochodzą ze świata Wiedźmin'));
  assert.ok(!prompt.includes('Dominaria'), 'przykład właściciela nie może zostać');
  assert.ok(!prompt.includes('Zendikar'), 'przykład właściciela nie może zostać');
  // Fallback: brak światów = tytuły talii, nigdy „undefined”.
  const bare = buildSkitPrompt({ deckTitle: 'T1', heroDeckTitle: 'T2' });
  assert.ok(bare.includes('pochodzą ze świata T2'));
  assert.ok(bare.includes('pochodzą ze świata T1'));
  assert.ok(!buildSkitPrompt(null).includes('undefined'));
});

test('AI-R4 modes skit: kontekst rozgrywki (talia, tura, log) dopisany', () => {
  const prompt = buildSkitPrompt(CTX);
  assert.ok(prompt.includes('Wiedźmin (BG)'));
  assert.ok(prompt.includes('Rycerze (WU)'));
  assert.ok(prompt.includes('nr 7'));
  assert.ok(prompt.includes('**Tura 7 — Nieprzyjaciel**'));
  assert.ok(prompt.includes('coś się stało'));
  assert.ok(!prompt.includes('undefined'));
  assert.ok(buildSkitPrompt(null).includes('(nieznany świat)'));
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

test('AI-R7 chat: jedna tura = jedna wiadomość usera z pełnym briefem', () => {
  const messages = buildChatMessagesForMode('lore-bot', {
    ...CTX, turns: [{ number: 1, text: 'Tura 1 — Czarodziejka: atak goblinem.' }], replies: {},
  });
  assert.deepEqual(messages.map((m) => m.role), ['user']);
  assert.ok(messages[0].content.includes('TY jesteś Nieprzyjaciel'));
  assert.ok(messages[0].content.includes('Skomentuj OSTATNIĄ turę (nr 1)'));
  assert.ok(messages[0].content.includes('atak goblinem'));
});

test('AI-R7 chat: tury przeplatane odpowiedziami, brief i zasady RAZ', () => {
  const messages = buildChatMessagesForMode('lore-bot', {
    ...CTX,
    turns: [
      { number: 1, text: 'Tura 1 — Czarodziejka: dobrała kartę.' },
      { number: 2, text: 'Tura 2 — Nieprzyjaciel: zagrał elfa.' },
      { number: 3, text: 'Tura 3 — Czarodziejka: rzuciła błyskawicę.' },
    ],
    replies: { 1: 'ODP-1: mgła.', 2: 'ODP-2: elf.' },
  });
  assert.deepEqual(messages.map((m) => m.role), ['user', 'assistant', 'user', 'assistant', 'user']);
  const joined = messages.map((m) => m.content).join('\n');
  assert.equal(joined.split('Zasady:').length - 1, 1); // brief nie mnoży się co turę
  for (const needle of ['dobrała kartę', 'zagrał elfa', 'rzuciła błyskawicę']) {
    assert.equal(joined.split(needle).length - 1, 1, needle); // każda tura raz (bez O(n²))
  }
  assert.equal(messages[1].content, 'ODP-1: mgła.');
  assert.equal(messages[3].content, 'ODP-2: elf.');
  assert.ok(messages[2].content.includes('Kolejna tura'));
  assert.ok(!messages[2].content.includes('TY jesteś')); // follow-up bez pełnego briefu
  assert.ok(messages[4].content.includes('rzuciła błyskawicę')); // bieżąca czeka na komentarz
});

test('AI-R7 chat: puste tury wypadają, brak odpowiedzi = sami userzy', () => {
  const messages = buildChatMessagesForMode('lore-bot', {
    ...CTX,
    turns: [{ number: 1, text: '  ' }, { number: 2, text: 'Tura 2 — Nieprzyjaciel: atak.' }],
    replies: {},
  });
  assert.deepEqual(messages.map((m) => m.role), ['user']);
  assert.ok(messages[0].content.includes('Skomentuj OSTATNIĄ turę (nr 2)')); // numeracja po number
});

test('AI-R7 chat: skit — follow-up woła o kolejny SKIT', () => {
  const messages = buildChatMessagesForMode('skit', {
    ...CTX,
    turns: [{ number: 1, text: 'Tura 1.' }, { number: 2, text: 'Tura 2.' }],
    replies: { 1: 'SKIT-1' },
  });
  assert.deepEqual(messages.map((m) => m.role), ['user', 'assistant', 'user']);
  assert.ok(messages[0].content.includes('**SKIT: -tytuł-**'));
  assert.ok(messages[2].content.includes('kolejny SKIT'));
});

test('AI-R7 chat: zero tur = legacy jedna wiadomość z (brak zapisu)', () => {
  const messages = buildChatMessagesForMode('lore-bot', { ...CTX, turns: [], replies: {} });
  assert.deepEqual(messages.map((m) => m.role), ['user']);
  assert.ok(messages[0].content.includes('(brak zapisu)'));
});
