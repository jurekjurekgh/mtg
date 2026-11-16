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

const SURVEIL_HELPERS = {
  nameOf: (cardId) => REGISTRY.get(cardId)?.name ?? String(cardId ?? '?'),
  nameOfObject: () => '?',
  isPlayer: (id) => id === 'p1' || id === 'p2',
};
const SURVEIL_NAMES = { p1: 'Ty', p2: 'Nieprzyjaciel' };

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
  // M178 (talie per plan): surveil siedzi w Forgotten Realms (Curate) —
  // lustro FR vs FR daje surveil OBU stron (FoW: własny z nazwami, bota bez).
  const decks = new Map([
    [HUMAN_ID, parseDeckText(fs.readFileSync('decks/forgotten-realms-wug.txt', 'utf8'), registry).cardIds],
    [BOT_ID, parseDeckText(fs.readFileSync('decks/forgotten-realms-wug.txt', 'utf8'), registry).cardIds],
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
  // F-14 (audyt PR #185): ten przebieg INTEGRACYJNY został w PR #185 zastąpiony
  // wywołaniem `describeGameEvent` na ręcznie zbudowanym zdarzeniu, pod hasłem
  // „napraw czerwone CI". Jednostkowy opis zdarzenia nie sprawdza drogi zdarzenia
  // do modala (`playCollectingModals` → `noteBotMove` → bufor modala), więc
  // regresja FoW w produkcie (nazwy kart przeciwnika w modalu człowieka) albo
  // zaginięcie linii surveil w ogóle przeszłyby bez czerwieni. Test jednostkowy
  // został jako DODATEK (niżej), a przebieg integracyjny wraca.
  //
  // Czerwone CI nie było wadą produktu: dawne seedy [3, 45] przestały dawać
  // OBA warunki po kolejnych zmianach talii i bota. Pomiar RED (E2.11, hunter
  // `.arena/hunter-e211.mjs` na obecnych taliach): seed 3 → własne=1, bota=0;
  // seed 45 → własne=0, bota=0. Naprawa to re-hunt seedów (konwencja L25),
  // nie usunięcie pinu. Hunter 1–16 na lustrze forgotten-realms-wug:
  // OBA warunki naraz dają 1, 7 i 13 (kolejne po 16 niepotrzebne — trzy
  // wystarczą, żeby pin nie wisiał na jednym rozdaniu).
  const NAZWY_TALII = new Set(
    parseDeckText(fs.readFileSync('decks/forgotten-realms-wug.txt', 'utf8'), REGISTRY)
      .cardIds.map((cardId) => REGISTRY.get(cardId)?.name),
  );
  let checkedMine = 0;
  let checkedBots = 0;
  for (const seed of [1, 7, 13]) {
    const { modalTexts } = playCollectingModals(makeSession(seed));
    for (const line of modalTexts.filter((t) => /^Wykonujesz surveil/.test(t ?? ''))) {
      checkedMine += 1;
      // M100/E10 (P4): poprawna odmiana — „1 kartę / 2 karty / 5 kart" — i nazwy.
      assert.match(line, /patrzy na \d+ (kartę|karty|kart): \S/, `własne surveil bez nazw: ${line}`);
      // Nazwy po dwukropku to PRAWDZIWE nazwy kart z talii (a nie surowe cardId
      // ani '?' z niedziałającego helpera): surveil patrzy na własną bibliotekę.
      const podane = line.replace(/\)$/, '').split(': ').slice(1).join(': ').split(', ');
      assert.ok(podane.length > 0 && podane.every((n) => NAZWY_TALII.has(n)),
        `nazwy w modalu nie pochodzą z talii (cardId zamiast nazwy?): ${line}`);
    }
    for (const line of modalTexts.filter((t) => /^Nieprzyjaciel wykonuje surveil/.test(t ?? ''))) {
      checkedBots += 1;
      assert.ok(!/patrzy na \d+ (kartę|karty|kart): /.test(line),
        `surveil BOTA z nazwami (wyciek FoW): ${line}`);
      assert.ok(![...NAZWY_TALII].some((n) => n && line.includes(n)),
        `nazwa karty w linii surveil bota (wyciek FoW): ${line}`);
    }
  }
  assert.ok(checkedMine > 0, 'żaden seed nie dał własnego surveil w modalu — test nic nie sprawdził');
  assert.ok(checkedBots > 0, 'żaden seed nie dał surveil bota w modalu — test nic nie sprawdził');
});

test('E4 (opis zdarzenia): surveil_started — własny z nazwami, bota bez (FoW)', () => {
  // surveil_started: własny gracz widzi nazwy kart, przeciwnika nie (FoW).
  const mine = describeGameEvent(
    { type: 'surveil_started', playerId: 'p1', amount: 2, cardIds: ['curate-stx', 'basic-island'] },
    SURVEIL_HELPERS, SURVEIL_NAMES,
  );
  assert.match(mine, /Wykonujesz surveil.*patrzy na 2 karty: Curate.*Island/, `własne surveil powinno mieć nazwy: ${mine}`);
  const bots = describeGameEvent(
    { type: 'surveil_started', playerId: 'p2', amount: 2, cardIds: ['curate-stx', 'basic-island'] },
    SURVEIL_HELPERS, SURVEIL_NAMES,
  );
  assert.match(bots, /Nieprzyjaciel wykonuje surveil \(patrzy na 2 karty\)$/, `surveil bota bez nazw (FoW): ${bots}`);
  assert.ok(!bots.includes('Curate') && !bots.includes('Wyspa'), `surveil bota z nazwami (wyciek FoW): ${bots}`);
});

test('E4 (modal): linie manipulacji w ogóle docierają (surveil/scry rozstrzygnięcia w modalu)', () => {
  let checked = 0;
  // M191/Batch 46: seedy z manipulacją biblioteki po zmianie talii (hunter).
  // Batch 47 D (forgotten-realms +Caves of Chaos Adventurer) — hunter:
  // 25, 26, 29, 34, 35, 37 (konwencja L25).
  // Batch 59 G1.5 (forgotten-realms +Waveskimmer Aven) — hunter po 60 seedach:
  // 3, 11, 23, 27, 32, 33, 36, 40 dają końcówkę surveil w modalu.
  // Batch 66: po regeneracji talii końcówkę dają m.in. 12, 18, 20 i 29.
  for (const seed of [12, 18, 20, 29]) {
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
  // M213: opis Index nie nazywa karty; liczy się odmiana liczebnika.
  assert.match(index, /ogląda(sz)? wierzch biblioteki \(3 karty: /i, index);
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
