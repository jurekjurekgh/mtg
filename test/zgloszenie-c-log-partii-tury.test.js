// Zgłoszenie C (2026-09-20, uwagi z gry): sekcja „Log partii" ma dostać te
// same narzędzia co „Przebieg tur (dla AI)", ale nad logiem stołu:
//   C1 — `Tura:` select + „Kopiuj wybraną turę" + „Kopiuj całą partię";
//   C2 — lista z WSZYSTKIMI turami (bez pozycji „cała partia" — uwaga
//        właściciela 2026-09-20e: przełączanie tury nic nie zmienia w liście
//        logu, a cały zapis kopiuje osobny przycisk);
//   C3 — chronologia: najnowsze na DOLE, nowe wiersze dopisywane na końcu.
// Test pilnuje zakresów sesji (log niesie numer tury i gracza) oraz renderu
// (kolejność listy, opcje selecta, brak duplikatów po dwóch renderach —
// plan A–E, ryzyko 3).
//
// Korekta właściciela (2026-09-20): jego zlecenie C obejmowało WYŁĄCZNIE
// kopiowanie logu/wybranej tury do schowka i chronologię. Sekcja „Log partii”
// ma zostać jedną listą logu + select zakresu + dwa przyciski; żadnego
// dodatkowego pola tekstowego obok (to była nadmiarowa implementacja).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BOT_ID, HUMAN_ID, TURN_NAMES, createSession } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import { renderTableView, renderLogPanel, selectedLogTurn } from '../src/table/render.js';

class MiniEl {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.listeners = {};
    this.style = {};
    this.dataset = {};
    this.className = '';
    this.text = '';
    this.html = '';
    this.value = '';
    this.disabled = false;
    this.hidden = false;
    this.scrollTop = 0;
    this.clientHeight = 40;
  }

  set textContent(v) { this.text = String(v); this.html = ''; this.children = []; }

  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }

  set innerHTML(v) { this.html = String(v); this.text = String(v).replace(/<[^>]*>/g, ''); this.children = []; }

  get innerHTML() { return (this.html ? this.html : this.text) + this.children.map((c) => c.innerHTML).join(''); }

  // Wysokość „udawana" z liczby wierszy — pozwala sprawdzić politykę suwaka
  // (C3: nowe wpisy na dole), bez prawdziwego layoutu.
  get scrollHeight() { return this.text.split('\n').length * 10 + this.children.length * 10; }

  appendChild(c) { this.children.push(c); return c; }

  addEventListener(t, fn) { (this.listeners[t] ??= []).push(fn); }

  descendants() { return this.children.flatMap((c) => [c, ...c.descendants()]); }
}

globalThis.document = {
  createElement: (tag) => new MiniEl(tag),
  createTextNode: (text) => ({ isText: true, text: String(text), get textContent() { return this.text; } }),
};

function buildDecks() {
  const registry = createCardRegistry();
  const decks = new Map([
    [HUMAN_ID, parseDeckText(fs.readFileSync('decks/tarkir-bg.txt', 'utf8'), registry).cardIds],
    [BOT_ID, parseDeckText(fs.readFileSync('decks/innistrad-brg.txt', 'utf8'), registry).cardIds],
  ]);
  return { registry, decks };
}

function playSome(session, maxCommands = 200) {
  for (let i = 0; i < maxCommands && session.state.status === 'active'; i += 1) {
    const view = session.view();
    const cmd = view.legalCommands.find((c) => !['pass_priority', 'concede'].includes(c.type))
      ?? view.legalCommands.find((c) => c.type === 'pass_priority');
    if (!cmd) break;
    session.apply(cmd);
  }
}

function makeEls() {
  const els = {};
  for (const key of ['banner', 'status', 'stackZone', 'bfEnemy', 'bfOwn', 'graveEnemy', 'graveOwn',
    'exileZone', 'hand', 'handEnemy', 'actions', 'log', 'turnHistory', 'turnHistoryCount',
    'turnHistorySelect', 'logTurnSelect', 'metaFoe', 'metaOwn', 'daynight',
    'undercity', 'poison', 'speed', 'hoverPreview']) {
    const tag = key === 'logTurnSelect' ? 'select' : 'div';
    els[key] = new MiniEl(tag);
  }
  return els;
}

test('C/1: wpisy logu niosą numer tury i aktywnego gracza (rosnąco, bez dziur)', () => {
  const { registry, decks } = buildDecks();
  const session = createSession({ seed: 31, registry, decks });
  playSome(session, 20);
  const entries = session.logEntries();
  assert.ok(entries.length > 3, 'sesja nazbierała wpisy logu');
  assert.equal(entries.length, session.log.length, 'zakres = cały log (C2: „cała partia")');
  let last = 0;
  for (const entry of entries) {
    assert.equal(typeof entry.turn, 'number', `wpis „${entry.text}" ma numer tury`);
    assert.ok(entry.turn >= last, 'numery tur w logu nie maleją');
    last = entry.turn;
    assert.ok([HUMAN_ID, BOT_ID].includes(entry.activePlayerId),
      `wpis „${entry.text}" ma aktywnego gracza z sesji`);
    assert.equal(entry.text, session.log[entry.index].text, 'zakres zachowuje treść wpisu (bez zmian formatu)');
  }
});

test('C/2: lista tur = wszystkie tury w logu + tura bieżąca, etykiety jak w panelu AI', () => {
  const { registry, decks } = buildDecks();
  const session = createSession({ seed: 32, registry, decks });
  playSome(session, 20);
  const turns = session.logTurnEntries();
  const numbers = turns.map((t) => t.number);
  assert.deepEqual(numbers, [...numbers].sort((a, b) => a - b), 'lista tur jest posortowana rosnąco');
  assert.equal(new Set(numbers).size, numbers.length, 'żadna tura się nie powtarza');
  assert.ok(numbers.includes(session.state.turn.number), 'tura bieżąca jest na liście (nie trzeba jej kończyć)');
  for (const turn of turns) {
    assert.equal(turn.label, `Tura ${turn.number} — ${TURN_NAMES[turn.activePlayerId]}`);
  }
  for (const entry of session.logEntries()) {
    assert.ok(numbers.includes(entry.turn), `każda tura z logu (${entry.turn}) jest wybieralna`);
  }
});

test('C/2: tekst logu — cała partia (chronologicznie) i pojedyncza tura', () => {
  const { registry, decks } = buildDecks();
  const session = createSession({ seed: 33, registry, decks });
  playSome(session, 20);
  const all = session.logTextAll();
  assert.ok(all.length > 0, 'cała partia ma tekst');
  // Nagłówki tur w kolejności rosnącej, w formacie sekcji AI.
  const headers = [...all.matchAll(/\*\*Tura (\d+) — (Czarodziejka|Nieprzyjaciel)\*\*/g)];
  assert.ok(headers.length >= 2, `tekst ma nagłówki tur (${headers.length})`);
  const headerNumbers = headers.map((m) => Number(m[1]));
  assert.deepEqual(headerNumbers, [...headerNumbers].sort((a, b) => a - b), 'nagłówki rosną (chronologia)');
  // Każdy wpis logu jest dokładnie raz w tekście całej partii.
  for (const entry of session.logEntries()) {
    const occurrences = all.split(entry.text).length - 1;
    assert.ok(occurrences >= 1, `wpis „${entry.text}" jest w tekście całej partii`);
  }
  // Zakres jednej tury: nagłówek + WYŁĄCZNIE wpisy tej tury (porównanie
  // LINII, bo te same zdania potrafią powtórzyć się w różnych turach).
  for (const turn of session.logTurnEntries()) {
    const text = session.logTextFor(turn.number);
    const expected = session.logEntries().filter((e) => e.turn === turn.number);
    const lines = text.split('\n').filter((line) => line.length > 0);
    assert.equal(lines.length, expected.length + (expected.length > 0 ? 1 : 0),
      `tura ${turn.number}: nagłówek + tylko wpisy tej tury`);
    if (expected.length === 0) continue;
    assert.equal(lines[0], `**Tura ${turn.number} — ${TURN_NAMES[turn.activePlayerId]}**`);
    assert.deepEqual(lines.slice(1), expected.map((e) => e.text), `tura ${turn.number}: treść wpisów bez zmian`);
  }
  // …a suma zakresów po turach to dokładnie tekst całej partii (bez gubienia).
  const perTurn = session.logTurnEntries()
    .map((turn) => session.logTextFor(turn.number))
    .filter((text) => text.length > 0);
  assert.equal(perTurn.join('\n\n'), all, 'zakres całej partii = złożenie zakresów tur');
});

test('C/2: tekst „cała partia" rośnie na bieżąco (nowe wpisy na końcu)', () => {
  const { registry, decks } = buildDecks();
  const session = createSession({ seed: 34, registry, decks });
  playSome(session, 10);
  assert.equal(session.state.status, 'active', 'partia w toku — jest co dopisywać');
  const before = session.logTextAll();
  playSome(session, 10);
  const after = session.logTextAll();
  assert.ok(after.length > before.length, 'tekst rośnie z każdym zdarzeniem');
  assert.ok(after.startsWith(before), 'wcześniejsze zdania zostają na początku (dopisywanie na końcu)');
});

test('C/1+C2: render panelu — lista TYLKO rzeczywistych tur, zakres wg wyboru', () => {
  const { registry, decks } = buildDecks();
  const session = createSession({ seed: 35, registry, decks });
  playSome(session, 20);
  const els = makeEls();
  renderLogPanel(els, session);
  const turns = session.logTurnEntries();
  // Lista = tury, i nic więcej: żadnej pozycji „cała partia" (uwaga
  // właściciela 2026-09-20e — przełączanie tury nie zmienia listy logu,
  // a cały zapis kopiuje osobny przycisk).
  assert.equal(els.logTurnSelect.children.length, turns.length, 'lista = wszystkie tury');
  assert.ok(!els.logTurnSelect.children.some((o) => o.value === 'all'),
    'w liście została pozycja „cała partia"');
  assert.ok(!els.logTurnSelect.children.some((o) => /cała partia/.test(o.textContent)),
    'w liście została pozycja „cała partia"');
  for (const turn of turns) {
    assert.ok(els.logTurnSelect.children.some((o) => o.value === String(turn.number)), `tura ${turn.number} w liście`);
  }
  // Domyślny zakres kopiowania = NAJNOWSZA tura (kopiowanie „na bieżąco").
  const newest = turns[turns.length - 1].number;
  assert.equal(selectedLogTurn(els), newest, 'domyślnie wybrana ma być najnowsza tura');
  assert.equal((session.logTextFor(newest).match(/\*\*Tura/g) ?? []).length, 1,
    'jedna tura = jeden nagłówek w tekście do skopiowania');
  // Wybór gracza: zakres kopiowania to TA tura…
  els.logTurnSelect.value = String(turns[0].number);
  els.logTurnSelect.dataset.logPick = String(turns[0].number);
  renderLogPanel(els, session);
  assert.equal(selectedLogTurn(els), turns[0].number, 'wybór gracza jest zakresem kopiowania');
  // …i nie zrywa go nowa tura w logu (domyślny zakres ≠ wybór gracza).
  playSome(session, 30);
  renderLogPanel(els, session);
  assert.equal(selectedLogTurn(els), turns[0].number,
    'nowa tura w logu zmiotła wybór gracza');
  // Odbudowa listy nie gubi wyboru (ten sam zestaw tur = ten sam DOM).
  const optionRef = els.logTurnSelect.children[0];
  renderLogPanel(els, session);
  assert.equal(els.logTurnSelect.children[0], optionRef, 'lista nie jest odbudowywana bez zmiany zestawu tur');
});

test('C/2 (uwaga właściciela 2026-09-20e): bez sesji select jest pusty i wyłączony', () => {
  const els = makeEls();
  renderLogPanel(els, { logTurnEntries: () => [] });
  assert.equal(selectedLogTurn(els), null, 'brak tur = brak zakresu kopiowania');
  assert.equal(els.logTurnSelect.disabled, true, 'select bez tur ma być wyłączony');
});

test('C (korekta właściciela): sekcja „Log partii" to JEDNA lista + select + dwa przyciski', () => {
  // Zlecenie C: kopiowanie logu/wybranej tury i chronologia. Sekcja nie ma
  // prawa pokazywać drugiego pola z tekstem logu (to była nadmiarowa
  // implementacja sesji) ani własnych kolorów wpisów.
  const html = fs.readFileSync('src/table/index.html', 'utf8');
  const od = html.indexOf('<summary>Log partii</summary>');
  assert.ok(od > 0, 'brak sekcji „Log partii" w index.html');
  const sekcja = html.slice(od, html.indexOf('</details>', od));
  assert.match(sekcja, /id="log-turn-select"/, 'brak selecta zakresu w sekcji');
  assert.match(sekcja, /id="log-copy-turn"/, 'brak przycisku „Kopiuj wybraną turę"');
  assert.match(sekcja, /id="log-copy-all"/, 'brak przycisku „Kopiuj całą partię"');
  assert.match(sekcja, /id="log"/, 'brak listy logu w sekcji');
  assert.doesNotMatch(sekcja, /id="log-text"/, 'sekcja ma drugie pole z tekstem logu');
  assert.doesNotMatch(html, /\.log-text-box\s*\{/, 'został styl dodatkowego pola tekstowego');
  assert.doesNotMatch(html, /\.log-tap\s*\{/, 'wpisy tapnięć mają własny kolor (a nie mają mieć)');
  // Uwaga właściciela (2026-09-20e): w liście rozwijanej TYLKO rzeczywiste
  // tury — żadnej statycznej opcji „cała partia" (select wypełnia render).
  const select = sekcja.slice(sekcja.indexOf('id="log-turn-select"'));
  assert.doesNotMatch(select.slice(0, select.indexOf('</select>')), /<option/,
    'select ma statyczną opcję („cała partia"?) — ma być wypełniany turami');
});

test('C/3: lista logu renderuje się chronologicznie — najstarsze u góry, nowe na końcu', () => {
  const { registry, decks } = buildDecks();
  const session = createSession({ seed: 36, registry, decks });
  playSome(session, 10);
  const els = makeEls();
  const play = () => {};
  renderTableView({ els, session, play, onCardClick: play });
  const firstRenderCount = els.log.children.length;
  assert.equal(firstRenderCount, session.log.length, 'każdy wpis logu ma swój wiersz');
  // Pierwszy wiersz = NAJSTARSZY wpis (odwrócona chronologia usunięta w C3).
  const flatten = (el) => el.textContent;
  assert.equal(flatten(els.log.children[0]), session.log[0].text);
  assert.equal(flatten(els.log.children[firstRenderCount - 1]), session.log.at(-1).text);
  // Po nowym zdarzeniu nowy wiersz ląduje NA KOŃCU, bez duplikatów.
  const before = session.log.length;
  playSome(session, 10);
  assert.ok(session.log.length > before, 'sesja dopisała wpisy');
  const readerScrollTop = 0; // gracz przewinięty na samą górę (czyta starsze)
  els.log.scrollTop = readerScrollTop;
  els.log.clientHeight = 40;
  renderTableView({ els, session, play, onCardClick: play });
  assert.equal(els.log.children.length, session.log.length, 'po drugim renderze brak duplikatów');
  assert.equal(flatten(els.log.children[els.log.children.length - 1]), session.log.at(-1).text,
    'najnowszy wpis jest ostatnim wierszem');
  assert.equal(els.log.scrollTop, readerScrollTop, 'suwak nie ucieka czytającemu starsze wpisy');
});

test('C/3: przy dole listy suwak zostaje przy najnowszych wpisach', () => {
  const { registry, decks } = buildDecks();
  const session = createSession({ seed: 37, registry, decks });
  playSome(session, 10);
  const els = makeEls();
  const play = () => {};
  renderTableView({ els, session, play, onCardClick: play });
  // Pierwszy render: świeży log — widok ustawia się na najnowszych wpisach.
  assert.equal(els.log.scrollTop, els.log.scrollHeight, 'start na dole (najnowsze widoczne)');
  // Gracz był przy dole → po dopisaniu wpisów nadal jest przy dole.
  playSome(session, 10);
  renderTableView({ els, session, play, onCardClick: play });
  assert.equal(els.log.scrollTop, els.log.scrollHeight, 'dopisywanie trzyma widok na dole');
});
