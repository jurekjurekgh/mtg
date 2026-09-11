// Zgłoszenie właściciela E2 + E3 (2026-09-10, sesja arena/01a08d0e) —
// prompt płatności bota w głównym logu i surowe symbole many.
//
// Objaw przy stole (log „Rozgrywka"):
//     Furious Forebear — zapłacić {1}{W}? (wybór opcjonalny: Nieprzyjaciel)
// Dwa osobne błędy:
//  E2 — to jest PYTANIE DO BOTA (decyzja `optional_pay_required`, której
//       właścicielem jest Nieprzyjaciel). Gracz nie ma tu nic do zrobienia,
//       a wpis w jego logu czyta się jak błąd rozgrywki. Należy do sekcji
//       ruchu bota (modal „Ruch bota"), tak jak inne decyzje przeciwnika.
//  E3 — `{1}{W}` jest renderowane SUROWYM TEKSTEM, choć warstwa pokazu ma
//       ikony (`manaSymbolsHtml`, src/table/mana-icons.js) i używa ich
//       kreator many oraz kafle. Ten sam koszt w dwóch warstwach musi
//       wyglądać tak samo (L100/3: jedno źródło).
//
// Przyczyny źródłowe (zmierzone):
//  - src/table/session.js — pętle `streamAutoEvents` i `apply` wpisują do
//    głównego logu KAŻDE zdarzenie z opisem (poza MAIN_LOG_NOISE), więc
//    prompt decyzji bota lądował obok narracji partii;
//  - src/table/render.js — `appendLogLineWithCardLinks` i `renderBotMoves`
//    wstawiają tekst przez `createTextNode`/`textContent`, bez konwersji
//    symboli many na ikony.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BOT_ID, HUMAN_ID, createSession, isBotDecisionPrompt } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import { addObject } from '../src/engine/game-state.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addMana } from '../src/engine/resources.js';
import { appendLogLineWithCardLinks, renderBotMoves } from '../src/table/render.js';

// --- minimalny DOM (bez jsdom w głównej bramce — wzór: audit-m86-tester) ---
class MiniEl {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.style = {}; this.className = '';
    this.text = ''; this.html = ''; this.dataset = {};
  }
  set textContent(v) { this.text = String(v); this.children = []; }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  set innerHTML(v) { this.html = String(v); this.text = ''; this.children = []; }
  get innerHTML() { return (this.html || this.text) + this.children.map((c) => c.innerHTML).join(''); }
  appendChild(c) { this.children.push(c); return c; }
  addEventListener() {}
}
class MiniText {
  constructor(v) { this.text = String(v); }
  get textContent() { return this.text; }
  get innerHTML() { return this.text; }
}
globalThis.document ??= {
  createElement: (tag) => new MiniEl(tag),
  createTextNode: (v) => new MiniText(v),
};

const REGISTRY = createCardRegistry();

function decks() {
  return new Map([
    [HUMAN_ID, parseDeckText(fs.readFileSync('decks/tarkir-wur.txt', 'utf8'), REGISTRY).cardIds],
    [BOT_ID, parseDeckText(fs.readFileSync('decks/dominaria-brg.txt', 'utf8'), REGISTRY).cardIds],
  ]);
}

function putCard(state, id, cardId, controllerId, zone = 'battlefield') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  return state.objects.get(id);
}

/**
 * Scenariusz: `ofiara` (stwór `graczaOfiary`) ginie od Shocka rzuconego przez
 * `graczaRzucajacego`, a `Forebear` właściciela ofiary leży w grobie — jego
 * zdolność pyta właściciela ofiary o dopłatę {1}{W} (Oracle TDM 13).
 */
function sesjaZeSmiercia({ graczOfiary, graczRzucajacy }) {
  const session = createSession({ registry: REGISTRY, decks: decks(), seed: 11, pauseOnBotMoves: true });
  const state = session.state;
  // Sesja startuje w mulliganie — bez jego domknięcia każda komenda jest
  // odrzucana (`mulligan_unresolved`), więc najpierw zatrzymujemy rękę.
  const keep = session.apply({ type: 'resolve_mulligan_choice', playerId: HUMAN_ID, keep: true });
  assert.ok(keep.ok, `setup: domknięcie mulligana (${keep.events?.[0]?.reason ?? 'ok'})`);
  state.turn.phase = 'precombat_main';
  state.turn.step = 'main1';
  state.turn.activePlayerId = graczRzucajacy;
  state.turn.priorityPlayerId = graczRzucajacy;

  // Ofiara 1/1 (ginie od 2 obrażeń Shocka) + jej Forebear w grobie + mana na
  // dopłatę {1}{W} (canPayTrigger wymaga pokrycia pipu — bez many trigger
  // w ogóle by nie odpalił).
  putCard(state, 'ofiara', 'alaborn-trooper', graczOfiary, 'battlefield');
  state.objects.set('ofiara', Object.freeze({ ...state.objects.get('ofiara'), power: 1, toughness: 1 }));
  putCard(state, 'forebear', 'furious-forebear', graczOfiary, 'graveyard');
  addMana(state, graczOfiary, 2, { colors: ['W'] });

  // Shock w ręce rzucającego + mana.
  putCard(state, 'szok', 'shock', graczRzucajacy, 'hand');
  addMana(state, graczRzucajacy, 2, { colors: ['R'] });

  const r = session.apply({
    type: 'cast_spell', playerId: graczRzucajacy, objectId: 'szok', targets: ['ofiara'],
  });
  assert.ok(r.ok, `setup: rzut Shocka (${r.events?.[0]?.reason ?? 'ok'})`);
  assert.ok(state.events.some((e) => e.type === 'optional_pay_required'),
    'setup: zdolność Forebeara pyta o dopłatę {1}{W}');
  const decyzja = state.events.find((e) => e.type === 'optional_pay_required');
  assert.equal(decyzja.playerId, graczOfiary, 'setup: decyduje właściciel ofiary');
  return { session, state, decyzja };
}

/** Wszystkie wpisy (główny log + bufor ruchu bota) po domknięciu pauz. */
function zbierzWpisy(session) {
  const log = session.log.map((entry) => entry.text ?? '');
  const moves = session.botMoves.map((m) => m.text ?? '');
  if (session.botPausePending) session.continueBotPlay();
  return { log, moves: [...moves, ...session.botMoves.map((m) => m.text ?? '')] };
}

test('E2/1: pytanie o dopłatę BOTA nie trafia do głównego logu gracza', () => {
  const { session } = sesjaZeSmiercia({ graczOfiary: BOT_ID, graczRzucajacy: HUMAN_ID });
  const { log, moves } = zbierzWpisy(session);

  const prompty = log.filter((t) => t.includes('zapłacić') && t.includes('{1}{W}'));
  assert.deepEqual(prompty, [],
    `prompt decyzji bota nie należy do głównego logu:\n${log.join('\n')}`);
  assert.ok(moves.some((t) => t.includes('zapłacić')),
    `informacja musi zostać w sekcji ruchu bota:\n${moves.join('\n')}`);
});

test('E2/2 anty-over-fix: pytanie o dopłatę GRACZA zostaje w głównym logu', () => {
  const { session } = sesjaZeSmiercia({ graczOfiary: HUMAN_ID, graczRzucajacy: HUMAN_ID });
  const { log } = zbierzWpisy(session);

  assert.ok(log.some((t) => t.includes('zapłacić') && t.includes('{1}{W}')),
    `własna decyzja gracza musi być w jego logu:\n${log.join('\n')}`);
});

test('E2/3: predykat rozpoznaje prompt decyzji po właścicielu, nie po nazwie karty', () => {
  assert.equal(isBotDecisionPrompt({ type: 'optional_pay_required', playerId: BOT_ID }, { humanId: HUMAN_ID }), true);
  assert.equal(isBotDecisionPrompt({ type: 'ward_choice_required', playerId: BOT_ID }, { humanId: HUMAN_ID }), true);
  assert.equal(isBotDecisionPrompt({ type: 'pay_or_sacrifice_required', playerId: BOT_ID }, { humanId: HUMAN_ID }), true);
  // Własna decyzja gracza to nie jest prompt bota.
  assert.equal(isBotDecisionPrompt({ type: 'optional_pay_required', playerId: HUMAN_ID }, { humanId: HUMAN_ID }), false);
  // Zdarzenie bez właściciela decyzji — nie chowamy (brak atrybucji = brak cenzury).
  assert.equal(isBotDecisionPrompt({ type: 'optional_pay_required' }, { humanId: HUMAN_ID }), false);
  // Skutek decyzji (nie pytanie) zostaje w logu — nawet dla bota.
  assert.equal(isBotDecisionPrompt({ type: 'optional_pay_resolved', playerId: BOT_ID }, { humanId: HUMAN_ID }), false);
});

test('E3/1: symbole many w wierszu logu są ikonami, nie surowym tekstem', () => {
  const line = new MiniEl('div');
  appendLogLineWithCardLinks(line, 'Furious Forebear — zapłacić {1}{W}?', new Map());
  const html = line.innerHTML;
  assert.ok(html.includes('class="ms ms-c"'), `licznik {1} ma być ikoną, jest: ${html}`);
  assert.ok(html.includes('class="ms ms-w"'), `pip {W} ma być ikoną, jest: ${html}`);
  assert.ok(!line.textContent.includes('{1}{W}'),
    `bez surowych nawiasów w warstwie pokazu, jest: ${line.textContent}`);
});

test('E3/2: ten sam koszt w modalu ruchu bota też jest ikonami (jedno źródło)', () => {
  const host = new MiniEl('div');
  renderBotMoves(host, [{
    type: 'optional_pay_required', cardId: 'furious-forebear',
    text: 'Furious Forebear — zapłacić {1}{W}? (wybór opcjonalny: Nieprzyjaciel)',
  }], null);
  const html = host.innerHTML;
  assert.ok(html.includes('class="ms ms-w"'), `pip {W} ma być ikoną, jest: ${html}`);
  assert.ok(!host.textContent.includes('{1}{W}'),
    `bez surowych nawiasów w modalu, jest: ${host.textContent}`);
});

test('E3/3 anty-over-fix: tekst bez symboli many zostaje zwykłym tekstem', () => {
  const line = new MiniEl('div');
  appendLogLineWithCardLinks(line, 'Nieprzyjaciel zagrywa Forest', new Map());
  assert.equal(line.textContent, 'Nieprzyjaciel zagrywa Forest');
  assert.ok(!line.innerHTML.includes('class="ms'), 'bez ikon, gdy nie ma symboli');
});
