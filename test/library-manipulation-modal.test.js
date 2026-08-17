// M100/E4 — panel „Rozgrywka": nazwy kart z manipulacji biblioteką, ale
// WYŁĄCZNIE tam, gdzie spoza mgły wojny (FoW):
//
//   LEGALNE (pokazujemy nazwy):
//   • własne podejrzenia (scry/surveil/Index/look) — patrzący ZNA te karty;
//   • grób jako strefa publiczna (mill z surveila/mill czarów) — obaj gracze;
//   • jawne odsłonięcia: clash (card_revealed), Epic Experiment (exile
//     odkryty), tutor z kryterium (reveal przy szukaniu, CR 701.20).
//
//   ZABRONIONE (nigdy nazw):
//   • scry/surveil/look PRZECIWNIKA — jego podejrzenie zostaje ukryte;
//     pokazujemy liczbę kart, nie ich treść.
//
// Luki przed M100: (1) bramka modala nie wpuszczała rodziny scry/surveil/
// look/clash/reveal w ogóle (linie były tylko w logu); (2) linie kończące
// (scry_resolved, index_resolved) mówiły liczby, choć człowiek zna treść.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BOT_ID, HUMAN_ID, createSession, describeGameEvent } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { parseDeckText } from '../src/cards/deck-text.js';

const REGISTRY = createCardRegistry();
const nameOf = (cardId) => REGISTRY.get(cardId)?.name ?? String(cardId ?? '?');
const NAMES = { p1: 'Ty', p2: 'Nieprzyjaciel' };
const HELPERS = {
  nameOf,
  nameOfObject: () => '?',
  isPlayer: (id) => id === 'p1' || id === 'p2',
};

// --- warstwa opisu: nazwy tam, gdzie legalne; liczby tam, gdzie FoW ---

test('E4: card_milled — karty mielone/surveilowane do grobu nazwane dla OBU (grób publiczny)', () => {
  // Surveil i czary mielące emitują per-kartę card_milled z cardId — TO jest
  // kanał nazw w modalu (surveil_resolved zostaje podsumowaniem liczbowym,
  // żeby nie dublować treści).
  const text = describeGameEvent({ type: 'card_milled', playerId: 'p2', cardId: 'basic-island' }, HELPERS, NAMES);
  assert.match(text, /mieli/);
  assert.match(text, /Island/, `mill bez nazwy (grób publiczny): ${text}`);
  const plain = describeGameEvent({ type: 'surveil_resolved', playerId: 'p1', milledCount: 1, total: 2 }, HELPERS, NAMES);
  assert.equal(plain, 'Kończysz surveil — 1 karta idzie do grobu');
});

test('E4: scry_resolved — człowiek widzi nazwy (spód/wierzch to jego wiedza), bot liczby (FoW)', () => {
  const mine = describeGameEvent(
    { type: 'scry_resolved', playerId: 'p1', total: 2, bottomCount: 1, bottomCardIds: ['basic-swamp'], topCardIds: ['basic-forest'] },
    HELPERS, NAMES,
  );
  assert.match(mine, /Swamp/, `spód bez nazw: ${mine}`);
  assert.match(mine, /Forest/, `wierzch bez nazw: ${mine}`);
  const bots = describeGameEvent(
    { type: 'scry_resolved', playerId: 'p2', total: 2, bottomCount: 1, bottomCardIds: ['basic-swamp'], topCardIds: ['basic-forest'] },
    HELPERS, NAMES,
  );
  assert.ok(!bots.includes('Swamp') && !bots.includes('Forest'), `podejrzenie bota z nazwami (wyciek): ${bots}`);
  assert.match(bots, /odkłada na spód|zostawia na wierzchu/);
});

test('E4: index_resolved — człowiek widzi ustaloną kolejność, bot liczby (FoW)', () => {
  const mine = describeGameEvent(
    { type: 'index_resolved', playerId: 'p1', count: 5, orderCardIds: ['basic-forest', 'basic-swamp'] },
    HELPERS, NAMES,
  );
  assert.match(mine, /Forest/);
  assert.match(mine, /Swamp/);
  const bots = describeGameEvent(
    { type: 'index_resolved', playerId: 'p2', count: 5, orderCardIds: ['basic-forest'] },
    HELPERS, NAMES,
  );
  assert.ok(!bots.includes('Forest'), `Index bota z nazwami (wyciek): ${bots}`);
});

test('E4: epic_experiment_started — wygnane karty nazwane dla OBU (exile odkryty)', () => {
  const e = { type: 'epic_experiment_started', playerId: 'p2', count: 3, cardIds: ['basic-island', 'basic-swamp', 'basic-forest'] };
  const text = describeGameEvent(e, HELPERS, NAMES);
  assert.match(text, /Island/);
  assert.match(text, /Swamp/);
  assert.match(text, /Forest/);
});

test('E4: search_choice_resolved — trafienie nazwane (reveal przy szukaniu, CR 701.20)', () => {
  const text = describeGameEvent(
    { type: 'search_choice_resolved', playerId: 'p2', found: true, foundCardId: 'basic-forest' },
    HELPERS, NAMES,
  );
  assert.match(text, /Forest/, `tutor bez nazwy trafienia: ${text}`);
  assert.match(text, /tasuje/);
  const aborted = describeGameEvent({ type: 'search_choice_resolved', playerId: 'p2', found: false }, HELPERS, NAMES);
  assert.equal(aborted, 'Nieprzyjaciel rezygnuje z szukania i tasuje bibliotekę');
});

test('E4: look_top_resolved — człowiek widzi wziętą kartę, bot nie (FoW)', () => {
  const mine = describeGameEvent(
    { type: 'look_top_resolved', playerId: 'p1', count: 3, pickCardId: 'basic-forest' },
    HELPERS, NAMES,
  );
  assert.match(mine, /Forest/);
  const bots = describeGameEvent(
    { type: 'look_top_resolved', playerId: 'p2', count: 3, pickCardId: 'basic-forest' },
    HELPERS, NAMES,
  );
  assert.ok(!bots.includes('Forest'), `look bota z nazwą (wyciek): ${bots}`);
});

// --- bramka modala: rodzina manipulacji przechodzi podczas rozstrzygnięcia ---

function makeSession(seed) {
  const registry = createCardRegistry();
  // mechanicy też ma Curate — potrzebujemy surveil/skry także u BOTA (FoW).
  const decks = new Map([
    [HUMAN_ID, parseDeckText(fs.readFileSync('decks/azorius.txt', 'utf8'), registry).cardIds],
    [BOT_ID, parseDeckText(fs.readFileSync('decks/mechanicy.txt', 'utf8'), registry).cardIds],
  ]);
  return createSession({ registry, decks, seed, pauseOnBotMoves: true });
}

function playCollectingModals(session, { maxMoves = 400 } = {}) {
  const modalTexts = [];
  for (let i = 0; i < maxMoves && session.state.status === 'active'; i += 1) {
    if (session.botPausePending) {
      for (const m of session.botMoves) modalTexts.push(m.text);
      session.clearBotMoves();
      session.continueBotPlay();
      for (const m of session.botMoves) modalTexts.push(m.text);
      continue;
    }
    const view = session.view();
    const meaningful = view.legalCommands.filter(
      (c) => !['pass_priority', 'concede', 'tap_for_mana', 'resolve_combat'].includes(c.type),
    );
    const cmd = meaningful.find((c) => c.type.startsWith('cast_'))
      ?? meaningful[0]
      ?? view.legalCommands.find((c) => c.type === 'pass_priority')
      ?? view.legalCommands.find((c) => c.type !== 'concede');
    if (!cmd) break;
    if (!session.apply(cmd).ok) break;
    for (const m of session.botMoves) modalTexts.push(m.text);
    session.clearBotMoves();
  }
  return { modalTexts };
}

test('E4 (modal): własny surveil z Curate — nazwy w modalu; surveil bota — bez nazw (FoW)', () => {
  let checkedMine = 0;
  let checkedBots = 0;
  // Seed 8 dołożony po transzy 2 batcha 33 (azorius +2 karty): dawne seedy
  // przestały dawać WŁASNY surveil (bot ma go dalej) — przelosowane hunterem.
  // Seed 13 po batchu 34 (azorius +3, mechanicy +1) — jedyny z listy, który
  // daje ORAZ własny surveil, ORAZ surveil bota; przelosowane hunterem.
  for (const seed of [13, 17, 42, 7, 11, 8]) {
    const { modalTexts } = playCollectingModals(makeSession(seed));
    for (const line of modalTexts.filter((t) => /^Wykonujesz surveil/.test(t ?? ''))) {
      checkedMine += 1;
      // M100/E10 (P4): poprawna odmiana — „1 kartę / 2 karty / 5 kart".
      assert.match(line, /patrzy na \d+ (kartę|karty|kart): \S/, `własne surveil bez nazw: ${line}`);
    }
    for (const line of modalTexts.filter((t) => /^Nieprzyjaciel wykonuje surveil/.test(t ?? ''))) {
      checkedBots += 1;
      assert.ok(!/patrzy na \d+ (kartę|karty|kart): /.test(line),
        `surveil BOTA z nazwami (wyciek FoW): ${line}`);
    }
  }
  assert.ok(checkedMine > 0, 'żaden seed nie dał własnego surveil w modalu — test nic nie sprawdził');
  assert.ok(checkedBots > 0, 'żaden seed nie dał surveil bota w modalu — test nic nie sprawdził');
});

test('E4 (modal): linie manipulacji w ogóle docierają (surveil/scry rozstrzygnięcia w modalu)', () => {
  let checked = 0;
  for (const seed of [42, 7, 11, 77, 123, 202]) {
    const { modalTexts } = playCollectingModals(makeSession(seed));
    const surveilEnd = modalTexts.filter((t) => /kończ(ysz|y) surveil/.test(t ?? ''));
    checked += surveilEnd.length;
  }
  assert.ok(checked > 0, 'modal nie pokazał końcówki surveil — bramka E4 nie działa');
});

// --- M100/E10 (P4): odmiana liczebnika „karta" w komunikatach podejrzeń ---
// Żywy Tester h05: „Ty wykonuje surveil (patrzy na 2 kart: Mountain, …)" —
// bez odmiany 2–4. Moduł ma polishPlural — te trzy gałęzie go ominęły.

test('P4: surveil 2 — „patrzy na 2 karty", nie „2 kart"', () => {
  const text = describeGameEvent({ type: 'surveil_started', playerId: 'p1', amount: 2, cardIds: ['basic-island', 'curate'] }, HELPERS, NAMES);
  assert.match(text, /patrzy na 2 karty: /, text);
});

test('P4: surveil 1 — „patrzy na 1 kartę" (dopełniacz), nie „1 kart"', () => {
  const text = describeGameEvent({ type: 'surveil_started', playerId: 'p1', amount: 1, cardIds: ['basic-island'] }, HELPERS, NAMES);
  assert.match(text, /patrzy na 1 kartę/, text);
  const botLine = describeGameEvent({ type: 'surveil_started', playerId: 'p2', amount: 1 }, HELPERS, NAMES);
  assert.match(botLine, /patrzy na 1 kartę\)/, botLine);
});

test('P4: scry 2 i Index 3 — odmiana „karty" także w wersji z nazwami', () => {
  const scry = describeGameEvent({ type: 'scry_started', playerId: 'p1', amount: 2, cardIds: ['basic-island', 'curate'] }, HELPERS, NAMES);
  assert.match(scry, /scry \(patrzy na 2 karty: /, scry);
  const index = describeGameEvent({ type: 'index_started', playerId: 'p1', count: 3, cardIds: ['basic-island', 'curate', 'negate'] }, HELPERS, NAMES);
  assert.match(index, /Index \(patrzy na 3 karty: /, index);
});

// --- M100/E10 (P6): zwykła aura NIE jest „za koszt bestow" ----------------
// Żywy Tester h08: „Rzucasz Curse of the Pierced Heart za koszt bestow" —
// bestow to osobna mechanika (karta-stwór rzucona jako aura); czysta aura
// (też curse na gracza) nie ma z nią nic wspólnego. Zdarzenie niesie flagę.

test('P6: czysta aura — rzut bez wzmianki o bestow', () => {
  const text = describeGameEvent({ type: 'aura_spell_cast', playerId: 'p1', cardId: 'curse-of-the-pierced-heart', targets: ['p2'], bestow: false, enchantPlayer: true }, HELPERS, NAMES);
  assert.ok(!text.includes('bestow'), `czysta aura bez „bestow": ${text}`);
  assert.match(text, /^Rzucasz Curse of the Pierced Heart → cel: Nieprzyjaciel$/, text);
});

test('P6: prawdziwe bestow — nadal „za koszt bestow"', () => {
  const text = describeGameEvent({ type: 'aura_spell_cast', playerId: 'p1', cardId: 'leafcrown-dryad', targets: ['o1'], bestow: true, enchantPlayer: false }, HELPERS, NAMES);
  assert.match(text, /za koszt bestow → cel: /, text);
});
