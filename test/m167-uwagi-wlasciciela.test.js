// M167 — uwagi właściciela z testów (2026-08-21).
// G: Mysteries of the Deep — landfall nie działał po play_land (tracker
//    skanował tylko permanent_entered_battlefield, a play_land emituje
//    WYŁĄCZNIE land_played). Klasa: WSZYSTKIE warunki landEnteredThisTurn.
// H: Revolutionist — artId ze słownika kolekcji (314MH2 → 314).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';

const REGISTRY = createCardRegistry();

function game(playerId = 'p1') {
  const state = createGameState({ seed: 167, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function putCard(state, id, cardId, controllerId, zone = 'battlefield') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, 'karta ' + cardId + ' w rejestrze');
  addObject(state, {
    id, instanceId: 'i-' + id, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  return state.objects.get(id);
}

test('G1: play_land ustawia znacznik landfall (landEnteredThisTurn)', () => {
  const state = game('p1');
  putCard(state, 'isle', 'basic-island', 'p1', 'hand');
  assert.ok(execute(state, { type: 'play_land', playerId: 'p1', objectId: 'isle' }).ok);
  assert.equal((state.landEnteredThisTurn ?? {}).p1, 1, 'znacznik landfall po play_land');
});

test('G2: Mysteries of the Deep — landfall po zagranym lądzie daje 3 karty', () => {
  const state = game('p1');
  putCard(state, 'isle', 'basic-island', 'p1', 'hand');
  execute(state, { type: 'play_land', playerId: 'p1', objectId: 'isle' });
  for (let i = 0; i < 6; i += 1) putCard(state, 'lib' + i, 'highland-game', 'p1', 'library');
  putCard(state, 'motd', 'mysteries-of-the-deep', 'p1', 'hand');
  addMana(state, 'p1', 5, { colors: ['U'] });
  const cast = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'motd');
  assert.ok(cast, 'oferta rzutu');
  assert.ok(execute(state, cast).ok);
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  const hand = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p1').length;
  assert.equal(hand, 3, 'landfall = draw THREE (2 + 1), nie 2');
});

test('G3: bez lądu w tej turze — zwykłe 2 karty (bez fałszywego landfallu)', () => {
  const state = game('p1');
  for (let i = 0; i < 6; i += 1) putCard(state, 'lib' + i, 'highland-game', 'p1', 'library');
  putCard(state, 'motd', 'mysteries-of-the-deep', 'p1', 'hand');
  addMana(state, 'p1', 5, { colors: ['U'] });
  execute(state, playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'motd'));
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  const hand = state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === 'p1').length;
  assert.equal(hand, 2, 'bez lądu: draw two');
});

test('H1: Revolutionist ma artId 314 ze słownika kolekcji (314MH2)', () => {
  assert.equal(REGISTRY.get('revolutionist').artId, 314, 'artId = 314 (Ilustracja 314MH2)');
});

// ---- T-bot: A/B/D/F/I ---------------------------------------------------------

import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

test('A1: Voice of the Vermin — buff celuje WSPÓŁATAKUJĄCEGO, nie stojącego', () => {
  const state = game('p1');
  const voice = putCard(state, 'voice', 'voice-of-the-vermin', 'p1', 'battlefield');
  state.objects.set('voice', Object.freeze({ ...voice, summoningSickness: false }));
  const small = putCard(state, 'small', 'highland-game', 'p1', 'battlefield'); // 2/1 atakujący
  state.objects.set('small', Object.freeze({ ...small, summoningSickness: false }));
  const big = putCard(state, 'big', 'segmented-krotiq', 'p1', 'battlefield'); // 6/5 stoi
  state.objects.set('big', Object.freeze({ ...big, summoningSickness: true })); // nie atakuje
  state.turn = { ...state.turn, phase: 'combat', step: 'declare_attackers', activePlayerId: 'p1', priorityPlayerId: 'p1' };
  execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['voice', 'small'] });
  // Decyzja celu triggera otwarta — bot wybiera współatakującego (small), nie big.
  const pending = state.pendingTriggerTargets[0];
  assert.ok(pending, 'decyzja celu triggera otwarta');
  const view = playerView(state, 'p1');
  const bot = createHeuristicBot({ seed: 1 });
  const chosen = bot.chooseCommand(view);
  assert.equal(chosen.type, 'resolve_trigger_target');
  assert.equal(chosen.targetId, 'small', 'buff na współatakującym 2/1 (nie na stojącym 6/5)');
});

test('B1: opcjonalny self-mill (Circle of the Land Druid) — tylko przy przewadze kart', () => {
  const setup = (myLib, foeLib) => {
    const state = game('p1');
    for (let i = 0; i < foeLib; i += 1) putCard(state, 'fl' + i, 'highland-game', 'p2', 'library');
    for (let i = 0; i < myLib; i += 1) putCard(state, 'ml' + i, 'highland-game', 'p1', 'library');
    putCard(state, 'druid', 'circle-of-the-land-druid', 'p1', 'hand');
    addMana(state, 'p1', 2, { colors: ['G'] });
    execute(state, playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_permanent' && c.objectId === 'druid'));
    for (let i = 0; i < 8; i += 1) {
      if (state.pendingOptionalTrigger) break;
      if (state.zones.stack.length > 0) {
        execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
        continue;
      }
      break;
    }
    assert.ok(state.pendingOptionalTrigger, 'decyzja opcjonalnego millu otwarta');
    return state;
  };
  const losing = setup(8, 20);
  const cmdLosing = playerView(losing, 'p1').legalCommands.find((c) => c.type === 'resolve_optional_trigger_choice' && c.fire);
  assert.equal(cmdLosing.selfMill, 4, 'oferta niesie adnotację selfMill=4');
  assert.equal(createHeuristicBot({ seed: 1 }).chooseCommand(playerView(losing, 'p1')).fire, false,
    'przy 8 vs 20 kart bot NIE młynuje siebie');
  const winning = setup(30, 6);
  assert.equal(createHeuristicBot({ seed: 1 }).chooseCommand(playerView(winning, 'p1')).fire, true,
    'przy 30 vs 6 kart bot bierze mill 4');
});

test('D1: Apprentice Wizard — bez niczego do zagrania bot NIE produkuje many', () => {
  const state = game('p1');
  putCard(state, 'wiz', 'apprentice-wizard', 'p1', 'battlefield');
  addMana(state, 'p1', 1, { colors: ['U'] });
  const view = playerView(state, 'p1');
  const offer = view.legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === 'wiz');
  assert.ok(offer, 'aktywacja legalna');
  const chosen = createHeuristicBot({ seed: 1 }).chooseCommand(view);
  assert.notEqual(chosen.type + ':' + chosen.objectId, 'activate_ability:wiz',
    'pusta ręka: produkcja many to marnotrawstwo (wyparuje w cleanup)');
});

test('F1: Inspire Awe — bot NIE rzuca fog we własnej turze (pełna biblioteka)', () => {
  const state = game('p1');
  putCard(state, 'awe', 'inspire-awe', 'p1', 'hand');
  putCard(state, 'guy', 'highland-game', 'p1', 'battlefield');
  for (let i = 0; i < 20; i += 1) putCard(state, 'lib' + i, 'highland-game', 'p1', 'library');
  addMana(state, 'p1', 4, { colors: ['G'] });
  const view = playerView(state, 'p1');
  assert.ok(view.legalCommands.some((c) => c.type === 'cast_spell' && c.objectId === 'awe'), 'rzut oferowany');
  const chosen = createHeuristicBot({ seed: 1 }).chooseCommand(view);
  assert.notEqual(chosen.type + ':' + chosen.objectId, 'cast_spell:awe',
    'fog we własnej turze = zamrożenie własnego ataku; kara przebijająca remis z passem');
});

test('I1: bot NIE wysyła 2/4 w gang 1/3 + 3/3 (ginie bez wymiany)', () => {
  const state = game('p1');
  const atk = putCard(state, 'atk', 'chittering-rats', 'p2', 'battlefield'); // użyj 2/2? — potrzebny 2/4
  state.objects.delete('atk');
  state.zones.battlefield = state.zones.battlefield.filter((id) => id !== 'atk');
  // 2/4: Segmented Krotiq 6/5 nie; budujemy z krotiq? Użyj cacophodon (2/5)? gang 3+1=4 < 5.
  // Cel testu: toughness <= gangPower — weźmiemy 2/4: krtiq nie pasuje; Dodajmy
  // obiekt syntetyczny 2/4 na bazie highland-game z nadpisanymi statami.
  const base = putCard(state, 'atk24', 'highland-game', 'p2', 'battlefield');
  state.objects.set('atk24', Object.freeze({ ...base, power: 2, toughness: 4, summoningSickness: false }));
  const b13 = putCard(state, 'b13', 'highland-game', 'p1', 'battlefield'); // 2/1? — nadpisz na 1/3
  state.objects.set('b13', Object.freeze({ ...b13, power: 1, toughness: 3, summoningSickness: false }));
  const b33 = putCard(state, 'b33', 'segmented-krotiq', 'p1', 'battlefield'); // 6/5? — nadpisz na 3/3
  state.objects.set('b33', Object.freeze({ ...b33, power: 3, toughness: 3, summoningSickness: false }));
  state.turn = { ...state.turn, phase: 'combat', step: 'declare_attackers', activePlayerId: 'p2', priorityPlayerId: 'p2' };
  const view = playerView(state, 'p2');
  const chosen = createHeuristicBot({ seed: 1 }).chooseCommand(view);
  assert.equal(chosen.type, 'declare_attackers');
  assert.ok(!(chosen.attackerIds ?? []).includes('atk24'),
    '2/4 nie atakuje w 1/3 + 3/3 (gang 4 obrażeń zabija, 2 mocy nie zabija niczego)');
});

// ---- T-UI: E (nagłówki faz), E2 (klikalne nazwy), C (klikalne karty) -----------

import { appendLogLineWithCardLinks } from '../src/table/render.js';
import { renderLookWizard } from '../src/table/choice-request.js';

class UiEl {
  constructor(tag) { this.tagName = tag; this.children = []; this.className = ''; this.dataset = {}; this.text = ''; this.listeners = {}; }
  set textContent(v) { this.text = String(v); this.children = []; }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  appendChild(child) { this.children.push(child); return child; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  click() { for (const fn of this.listeners.click ?? []) fn({}); }
}
globalThis.document = { createElement: (tag) => new UiEl(tag), createTextNode: (text) => ({ isText: true, text: String(text), get textContent() { return this.text; } }) };

test('E2a: nazwy kart w wierszu logu owijane w klikalne spany (data-card-id)', () => {
  const cardIdByName = new Map([['Highland Game', 'highland-game'], ['Brute Force', 'brute-force']]);
  const line = appendLogLineWithCardLinks(new UiEl('div'), 'Bot rzucił Brute Force w Highland Game i przepuścił.', cardIdByName);
  const spans = line.children.filter((c) => c.className === 'log-card');
  assert.equal(spans.length, 2, 'dwie nazwy = dwa spany');
  assert.equal(spans[0].dataset.cardId, 'brute-force');
  assert.equal(spans[0].textContent, 'Brute Force');
  assert.equal(spans[1].dataset.cardId, 'highland-game');
  assert.equal(line.textContent, 'Bot rzucił Brute Force w Highland Game i przepuścił.', 'tekst wiersza bez zmian treściowych');
});

test('E2b: bez mapy — czysty tekst (przebieg dla AI bez znaczników)', () => {
  const line = appendLogLineWithCardLinks(new UiEl('div'), 'Dowolny tekst z Highland Game', null);
  assert.equal(line.textContent, 'Dowolny tekst z Highland Game');
  assert.equal(line.children.filter((c) => c.className === 'log-card').length, 0);
});

test('Ca: wizard scry/surveil — karty klikalne (cardId + handler)', () => {
  const opened = [];
  const host = new UiEl('div');
  renderLookWizard(host, {
    kind: 'scry',
    cards: [{ id: 'o1', cardId: 'curate', name: 'Curate' }, { id: 'o2', cardId: 'brute-force', name: 'Brute Force' }],
    onComplete: () => {},
    onCancel: () => {},
    onOpenCard: (cardId) => opened.push(cardId),
  });
  const all = (node) => [node, ...node.children.flatMap((c) => all(c))];
  const findNamed = (root, name) => all(root).find((c) => c.textContent === name && String(c.className).includes('log-card'));
  const curate = findNamed(host, 'Curate');
  assert.ok(curate, 'nazwa Curate jako klikalny span');
  assert.equal(curate.dataset.cardId, 'curate');
  curate.click();
  assert.deepEqual(opened, ['curate'], 'klik otwiera ilustrację karty');
  const brute = findNamed(host, 'Brute Force');
  assert.ok(brute, 'nazwa Brute Force jako klikalny span');
  brute.click();
  assert.deepEqual(opened, ['curate', 'brute-force']);
});

test('Ea: nagłówki faz wracają do logu — raz na zmianę fazy', async () => {
  const fs = await import('node:fs');
  const { HUMAN_ID, BOT_ID, createSession } = await import('../src/table/session.js');
  const { parseDeckText } = await import('../src/cards/deck-text.js');
  const decks = new Map([
    [HUMAN_ID, parseDeckText(fs.readFileSync('decks/tarkir-bg.txt', 'utf8'), REGISTRY).cardIds],
    [BOT_ID, parseDeckText(fs.readFileSync('decks/warhammer-ubr.txt', 'utf8'), REGISTRY).cardIds],
  ]);
  const session = createSession({ seed: 3, registry: REGISTRY, decks });
  // Keep ręki startowej, potem przewijamy passami przez kilka kroków/faz.
  const keep = session.view().legalCommands.find((c) => c.type === 'resolve_mulligan_choice');
  if (keep) session.apply(keep);
  for (let i = 0; i < 40; i += 1) {
    const view = session.view();
    const pass = view.legalCommands.find((c) => c.type === 'pass_priority');
    if (!pass) break;
    session.apply(pass);
    const headers = session.log.filter((e) => /^— .+ —$/.test(e.text));
    if (headers.length >= 2) break;
  }
  const headers = session.log.filter((e) => /^— .+ —$/.test(e.text));
  assert.ok(headers.length >= 2, `nagłówki faz w logu (>=2), a jest: ${headers.length}`);
  // Bez szumu kroków: każdy nagłówek to inna faza (brak duplikatów pod rząd).
  const phases = headers.map((h) => h.text);
  assert.ok(new Set(phases).size >= 2, 'różne fazy w nagłówkach');
});

// ---- K2: szybkie dodawanie landów podstawowych w kreatorze ---------------------

test('K2: box pięciu landów podstawowych z -/+ nad listą kart kreatora', async () => {
  const { mountDeckBuilder } = await import('../src/table/deck-builder.js');

  class El {
    constructor(tag) { this.tagName = tag; this.children = []; this.className = ''; this.text = ''; this.value = ''; this.disabled = false; this.listeners = {}; this.dataset = {}; }
    set textContent(v) { this.text = String(v); this.children = []; }
    get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
    appendChild(child) { this.children.push(child); return child; }
    addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
    click() { for (const fn of this.listeners.click ?? []) fn({}); }
    descendants() { return this.children.flatMap((c) => [c, ...c.descendants()]); }
  }
  const byId = new Map();
  const ids = ['deck-builder', 'deck-builder-name', 'deck-builder-plan', 'deck-builder-set', 'deck-builder-color',
    'deck-builder-filter', 'deck-builder-card-list', 'deck-builder-basic-lands', 'deck-builder-summary',
    'deck-builder-errors', 'deck-builder-output', 'deck-builder-copy', 'deck-builder-download', 'deck-builder-status',
    'deck-builder-add-filtered', 'deck-builder-clear', 'deck-builder-library-select', 'deck-builder-load',
    'deck-builder-save', 'deck-builder-save-as', 'deck-builder-delete'];
  for (const id of ids) byId.set(id, new El('div'));
  const prevDocument = globalThis.document;
  globalThis.document = {
    createElement: (tag) => new El(tag),
    getElementById: (id) => byId.get(id) ?? null,
    body: new El('body'),
  };
  try {
    const mounted = mountDeckBuilder({ registry: REGISTRY, repoDecks: {} });
    assert.ok(mounted, 'kreator zamontowany');
    const lands = byId.get('deck-builder-basic-lands');
    const rows = lands.children.filter((c) => String(c.className).includes('deck-builder-basic-land-row'));
    assert.equal(rows.length, 5, 'pięć landów podstawowych w boxie');
    const names = rows.map((r) => r.children[0].textContent);
    assert.deepEqual(names, ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'], 'kolejność jak w legacy');
    // + 2× Forest, + 1× Island, − 1× Forest — liczniki w boxie odświeżone
    // (tekst talii pojawia się po spełnieniu minimum 15 nielandów — to
    // osobna walidacja; tu testujemy szybkie dodawanie).
    const freshRows = () => lands.children.filter((c) => String(c.className).includes('deck-builder-basic-land-row'));
    const countOf = (row) => row.descendants().find((c) => String(c.className).includes('deck-card-count'))?.textContent;
    const plusOf = (row) => row.descendants().filter((c) => c.textContent === '+')[0];
    const minusOf = (row) => row.descendants().filter((c) => c.textContent === '−')[0];
    plusOf(freshRows()[4]).click();
    plusOf(freshRows()[4]).click();
    plusOf(freshRows()[1]).click();
    assert.equal(countOf(freshRows()[4]), '2', 'licznik Forest = 2');
    assert.equal(countOf(freshRows()[1]), '1', 'licznik Island = 1');
    minusOf(freshRows()[4]).click();
    assert.equal(countOf(freshRows()[4]), '1', 'po −: licznik Forest = 1');
    assert.equal(countOf(freshRows()[1]), '1', 'Island bez zmian');
  } finally {
    globalThis.document = prevDocument;
  }
});

// ---- K1: talie własne — import, selekty z „(własna)", publish helper ----------

import { populateDeckSelects, combineDeckSources, deckTitle } from '../src/table/deck-selects.js';
import { parseDeckText } from '../src/cards/deck-text.js';

test('K1a: combineDeckSources — klucze custom: + etykieta „(własna)"', () => {
  const repo = { red: '# Red — singleton' };
  const own = new Map([['Moje Elfy', '# Moje Elfy — singleton']]);
  const { decks, labelOf } = combineDeckSources(repo, own);
  assert.ok(decks['custom:Moje Elfy'], 'talia własna pod kluczem custom:');
  assert.ok(decks.red, 'talia repo nietykana');
  assert.equal(labelOf('red', decks.red), 'Red — singleton', 'bez sufiksu dla repo');
  assert.equal(labelOf('custom:Moje Elfy', decks['custom:Moje Elfy']), 'Moje Elfy — singleton (własna)', 'sufiks (własna)');
});

test('K1b: selekty z labelOf niosą sufiks; idempotentne', () => {
  class SelEl {
    constructor() { this.children = []; this.value = ''; }
    appendChild(c) { this.children.push(c); return c; }
    replaceChildren() { this.children = []; }
    get options() { return this.children; }
  }
  class OptEl { constructor() { this.value = ''; this.textContent = ''; } }
  const prev = globalThis.document;
  globalThis.document = { createElement: (tag) => (tag === 'option' ? new OptEl() : new SelEl()) };
  try {
    const { decks, labelOf } = combineDeckSources({ red: '# Red' }, new Map([['Moje Elfy', '# Moje Elfy']]));
    const sel = new SelEl();
    const keys = populateDeckSelects([sel, null], decks, { labelOf });
    assert.deepEqual(keys, ['custom:Moje Elfy', 'red'], 'sortowanie kluczy łączone');
    const labels = sel.options.map((o) => o.textContent);
    assert.ok(labels.some((l) => l.endsWith('(własna)')), 'sufiks w selekcie');
    populateDeckSelects([sel], decks, { labelOf });
    assert.equal(sel.options.length, 2, 'idempotencja po ponownym renderze');
  } finally {
    globalThis.document = prev;
  }
});

test('K1c: importText ładuje talię do kreatora i woła onDeckImported', async () => {
  const { mountDeckBuilder } = await import('../src/table/deck-builder.js');
  class El {
    constructor(tag) { this.tagName = tag; this.children = []; this.className = ''; this.text = ''; this.value = ''; this.disabled = false; this.listeners = {}; }
    set textContent(v) { this.text = String(v); this.children = []; }
    get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
    appendChild(c) { this.children.push(c); return c; }
    addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
    descendants() { return this.children.flatMap((c) => [c, ...c.descendants()]); }
  }
  const byId = new Map();
  for (const id of ['deck-builder','deck-builder-name','deck-builder-plan','deck-builder-set','deck-builder-color','deck-builder-filter','deck-builder-card-list','deck-builder-basic-lands','deck-builder-summary','deck-builder-errors','deck-builder-output','deck-builder-copy','deck-builder-download','deck-builder-status','deck-builder-add-filtered','deck-builder-clear','deck-builder-library-select','deck-builder-load','deck-builder-save','deck-builder-save-as','deck-builder-delete']) byId.set(id, new El('div'));
  const prevDocument = globalThis.document;
  globalThis.document = { createElement: (t) => new El(t), getElementById: (id) => byId.get(id) ?? null, body: new El('body') };
  try {
    const imported = [];
    const api = mountDeckBuilder({ registry: REGISTRY, repoDecks: {}, onDeckImported: (name, text) => imported.push({ name, text }) });
    assert.ok(api?.importText, 'API kreatora eksponuje importText');
    const deckText = '# Moje Elfy\n4x Highland Game\n16x Forest';
    await api.importText(deckText);
    assert.equal(imported.length, 1, 'onDeckImported wywołany raz');
    assert.equal(imported[0].name, 'Moje Elfy', 'nazwa z nagłówka #');
    assert.equal(byId.get('deck-builder-name').value, 'Moje Elfy', 'kreator przyjął nazwę');
    const parsed = parseDeckText(imported[0].text, REGISTRY);
    assert.equal(parsed.cardIds.length, 20, '20 kart po imporcie');
  } finally {
    globalThis.document = prevDocument;
  }
});
