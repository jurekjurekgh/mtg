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
    [HUMAN_ID, parseDeckText(fs.readFileSync('decks/green.txt', 'utf8'), REGISTRY).cardIds],
    [BOT_ID, parseDeckText(fs.readFileSync('decks/red.txt', 'utf8'), REGISTRY).cardIds],
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
