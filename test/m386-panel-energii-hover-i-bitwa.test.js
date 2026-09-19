// M386 (zgłoszenia właściciela 2026-09-18, partia seed 596891 — Ixalan vs
// Ravnica): trzy objawy, JEDEN root cause w warstwie wyświetlania.
//
//   A1 — po wystawieniu Shipwreck Moray nad ręką pojawił się PUSTY panel
//        (jak panel trucizny, ale bez treści).
//   A2 — w Głównej 2 gracz zaznaczył ptaszkiem zdolność „{E}: +2/-2” Moraya,
//        przeszło do tury bota i gra się ZAMROZIŁA: w „Twoje działania" było
//        tylko „Poddaj partię” (odświeżenie kasowało partię).
//   B  — rozstrzygnięcie walki (Malamet Battle Glyph: fight) nie pokazało się
//        w panelu „Rozgrywka".
//
// Root cause (odtworzony, nie zgadywany): `renderEnergyPanel` wołał
// `hover.attach(...)` — metody, której WSPÓLNY obiekt hover (start/revive/end/
// cycle, renderTableView) nie ma. Panel energii rysuje się, gdy ktokolwiek ma
// {E} > 0, czyli w katalogu dokładnie po wejściu Moraya, a `hover.attach`
// rzucał `TypeError` w KAŻDYM renderze stołu na desktopie. Skutki łańcuchowe:
//   • panel został „widoczny, ale pusty" (hidden = false, treść nie doszła) — A1;
//   • wyjątek uciekał z `renderTableView` do main.js, więc po komendzie gracza
//     nie wykonywały się dalsze kroki: `showBotMoves()` (modal „Rozgrywka"
//     nigdy się nie otwierał — B) i wstrzyknięcie „▶ Wznów grę bota" przy
//     pauzie bota (ekran z samym „Poddaj partię" — A2).
//
// Piny: (A) render stołu z energią > 0 nie rzuca i panel ma treść, (B) hover
// panelu energii działa jak w pozostałych panelach specjalnych, (C) strażnik
// rodziny — render.js woła wyłącznie metody, które obiekt hover ma, (D) walka
// (fight) z Malamet Battle Glyph jest opisana w buforze modala „Rozgrywka".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCardRegistry } from '../src/cards/card-data.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import { execute } from '../src/engine/game-state.js';
import { moveObjectDirectly } from '../src/engine/objects.js';
import { addEnergyCounters } from '../src/engine/players.js';
import { jumpToStep } from '../src/engine/turn.js';
import { BOT_ID, HUMAN_ID, commandOptionKey, createSession } from '../src/table/session.js';

// --- minimalny DOM (wzorzec: test/bug-d-daynight-hover-revive.test.js) -----
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
    this.hidden = false;
  }
  set textContent(v) { this.text = String(v); this.html = ''; this.children = []; }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  set innerHTML(v) { this.html = String(v); this.text = String(v).replace(/<[^>]*>/g, ''); this.children = []; }
  get innerHTML() { return (this.html ? this.html : this.text) + this.children.map((c) => c.innerHTML).join(''); }
  appendChild(c) { this.children.push(c); return c; }
  prepend(c) { this.children.unshift(c); return c; }
  replaceChildren(...n) { this.children = n.flat(); }
  addEventListener(t, fn) { (this.listeners[t] ??= []).push(fn); }
  emit(type, payload = {}) { for (const fn of this.listeners[type] ?? []) fn(payload); }
  descendants() { return this.children.flatMap((c) => [c, ...c.descendants()]); }
  findAll(p) { return this.descendants().filter(p); }
}

globalThis.document = {
  createElement: (tag) => new MiniEl(tag),
  createTextNode: (text) => ({ isText: true, text: String(text), get textContent() { return this.text; } }),
  addEventListener() {},
  getElementById: (id) => new MiniEl(id),
};
globalThis.window = { confirm: () => false, addEventListener() {}, matchMedia: () => ({ matches: false }) };

const { renderTableView } = await import('../src/table/render.js');
const { renderEnergyPanel } = await import('../src/table/render.js');

const ELS_KEYS = ['banner', 'status', 'stackZone', 'bfEnemy', 'bfOwn', 'graveEnemy', 'graveOwn',
  'exileZone', 'hand', 'handEnemy', 'actions', 'log', 'turnHistory', 'turnHistoryCount',
  'metaFoe', 'metaOwn', 'daynight', 'undercity', 'poison', 'speed', 'energy', 'hoverPreview'];

function makeEls() {
  const els = {};
  for (const key of ELS_KEYS) els[key] = new MiniEl(`#${key}`);
  return els;
}

function tinyDecks(registry) {
  return new Map([
    [HUMAN_ID, parseDeckText('# Sonda\n20x Island\n1x Shipwreck Moray\n1x Malamet Battle Glyph', registry).cardIds],
    [BOT_ID, parseDeckText('# Bot\n20x Mountain\n1x Skinbrand Goblin', registry).cardIds],
  ]);
}

/** Sesja z energią u gracza (panel energii aktywny). */
function energySession({ energy = 4 } = {}) {
  const registry = createCardRegistry();
  const session = createSession({ seed: 42, registry, decks: tinyDecks(registry), pauseOnBotMoves: true });
  session.state.pendingMulligans = [];
  session.state.pendingMulliganBottom = null;
  if (energy > 0) addEnergyCounters(session.state, HUMAN_ID, energy);
  return { session, registry };
}

test('M386/A: energia > 0 nie wysypuje renderu stołu, a panel energii MA treść (A1)', () => {
  const { session } = energySession();
  const els = makeEls();
  assert.doesNotThrow(
    () => renderTableView({ els, session, play: () => {}, onCardClick: () => {} }),
    'renderTableView rzuca przy energii > 0 (desktop/hover) — panel zostaje pusty, a dalsze panele i modal „Rozgrywka" nie powstają',
  );
  assert.equal(els.energy.hidden, false, 'panel energii widoczny, gdy gracz ma {E}');
  const text = els.energy.textContent;
  assert.match(text, /Energia \(\{E\}\)/, `panel bez nagłówka: ${JSON.stringify(text)}`);
  assert.match(text, /4 \{E\}/, `panel bez liczby liczników gracza: ${JSON.stringify(text)}`);
  assert.ok(els.energy.children.length >= 2, 'panel energii z markerem i blokiem opisu');
  // Marker to oficjalny druk „Energy Reserve” (tdrc/17) — ten sam wzorzec co
  // Poison Counter i Start Your Engines!, nie pusta kolumna (A1).
  const img = els.energy.findAll((el) => el.tagName === 'img')[0];
  assert.ok(img, 'panel energii bez ilustracji markera');
  assert.match(String(img.src), /6a2c1fa5-deed-48ba-afe4-6c8ea8d9135e/,
    `marker energii to nie oficjalny „Energy Reserve”: ${img.src}`);
});

test('M386/B: hover panelu energii działa jak w panelach Poison/Speed (A1)', () => {
  const { session } = energySession();
  const els = makeEls();
  renderTableView({ els, session, play: () => {}, onCardClick: () => {} });
  const marker = els.energy.findAll((el) => String(el.className).includes('poison-card'))[0];
  assert.ok(marker, 'panel energii ma klikalny/najeżdżalny marker');
  marker.emit('mouseenter', { clientX: 120, clientY: 120 });
  assert.ok(String(els.hoverPreview.className).includes('active'),
    'mouseenter na panelu energii nie otwiera podglądu (podpięcie hovera zgubione — ta sama klasa co A1)');
});

/** Usuwa komentarze (własne i blokowe) — strażnik patrzy na KOD, nie na opisy. */
function stripComments(src) {
  let out = '';
  let mode = null; // null | 'line' | 'block' | 'sq' | 'dq' | 'tpl'
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    const d = src[i + 1];
    if (mode === null) {
      if (c === '/' && d === '*') { mode = 'block'; i += 1; continue; }
      if (c === '/' && d === '/') { mode = 'line'; i += 1; continue; }
      if (c === "'") mode = 'sq';
      else if (c === '"') mode = 'dq';
      else if (c === '`') mode = 'tpl';
      out += c;
      continue;
    }
    if (mode === 'block') { if (c === '*' && d === '/') { mode = null; i += 1; } continue; }
    if (mode === 'line') { if (c === '\n') { mode = null; out += c; } continue; }
    if (c === '\\') { out += c + (d ?? ''); i += 1; continue; }
    if ((mode === 'sq' && c === "'") || (mode === 'dq' && c === '"') || (mode === 'tpl' && c === '`')) mode = null;
    out += c;
  }
  return out;
}

test('M386/C: strażnik rodziny — render.js woła tylko metody, które obiekt hover ma (L41/L137)', () => {
  const source = stripComments(readFileSync(new URL('../src/table/render.js', import.meta.url), 'utf8'));
  // Metody WSPÓLNEGO obiektu hover z renderTableView.
  const HOVER_METHODS = new Set(['start', 'revive', 'end', 'cycle']);
  const called = new Set([...source.matchAll(/hover\.([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1]));
  for (const name of called) {
    assert.ok(HOVER_METHODS.has(name),
      `render.js woła hover.${name}(), którego obiekt hover NIE ma (A1: hover.attach → TypeError przy każdym renderze z {E} > 0; używaj attachSpecialCardHover)`);
  }
  assert.ok(!/hover\.attach\s*\(/.test(source), 'hover.attach wrócił do render.js');
  assert.ok(called.has('start'), 'panel specjalny bez podpięcia hovera (attachSpecialCardHover) — regresja hovera');
});

// ---------------------------------------------------------------------------
// D: fight z Malamet Battle Glyph (Moray vs Goblin) opisany w modalu
// „Rozgrywka" — kto walczył, ile zadał, kto zginął, czy był licznik +1/+1.
// ---------------------------------------------------------------------------
function findObjectId(state, cardId, zones = ['library', 'hand']) {
  for (const [id, o] of state.objects) if (o.cardId === cardId && zones.includes(o.zone)) return id;
  return null;
}

test('M386/D: fight (Malamet Battle Glyph) widać w panelu „Rozgrywka" (B)', () => {
  const registry = createCardRegistry();
  const session = createSession({ seed: 42, registry, decks: tinyDecks(registry) });
  const state = session.state;
  state.pendingMulligans = [];
  state.pendingMulliganBottom = null;
  state.turn = jumpToStep(state.turn, 'main1', HUMAN_ID);
  state.turn.activePlayerId = HUMAN_ID;
  state.turn.priorityPlayerId = HUMAN_ID;
  state.turn.number = 12;

  // Moray po MOJEJ stronie (świeżo w tej turze → licznik z Oracle) i Goblin bota.
  const moraySrc = findObjectId(state, 'shipwreck-moray') ?? findObjectId(state, 'shipwreck-moray', ['battlefield']);
  const morayId = state.objects.get(moraySrc)?.zone === 'battlefield'
    ? moraySrc : moveObjectDirectly(state, moraySrc, 'battlefield', 'bf-moray').id;
  const goblinSrc = findObjectId(state, 'skinbrand-goblin');
  const goblinId = moveObjectDirectly(state, goblinSrc, 'battlefield', 'bf-goblin').id;
  // Glyph do ręki + mana (auto-tap/pula w sesji testowej).
  const glyphId = findObjectId(state, 'malamet-battle-glyph');
  if (state.objects.get(glyphId)?.zone !== 'hand') moveObjectDirectly(state, glyphId, 'hand', 'hand-glyph');
  state.players = state.players.map((p) => (p.id === HUMAN_ID
    ? { ...p, mana: 20, manaPool: { G: 3 } } : p));

  const view = session.view();
  const cast = view.legalCommands.find((c) => (c.type === 'cast_spell' || c.type === 'cast_permanent')
    && state.objects.get(c.objectId)?.cardId === 'malamet-battle-glyph'
    && (c.targets ?? []).includes(morayId) && (c.targets ?? []).includes(goblinId));
  assert.ok(cast, 'brak oferty rzutu Malamet Battle Glyph na Moraya i Goblina');
  assert.ok(session.apply(cast).ok, 'rzut Malamet Battle Glyph odrzucony');

  // Przewijamy stos (fight liczy się przy rozstrzygnięciu czaru).
  for (let i = 0; i < 20 && state.zones.stack.length > 0; i += 1) {
    if (state.turn.priorityPlayerId === HUMAN_ID) {
      const pass = session.view().legalCommands.find((c) => c.type === 'pass_priority');
      if (!pass) break;
      if (!session.apply(pass).ok) break;
    } else if (session.recheckAutoPass?.().internalError) {
      assert.fail('auto-pass sesji zgłosił błąd wewnętrzny');
    }
  }
  assert.equal(state.zones.stack.length, 0, 'stos nie został domknięty');

  const texts = session.botMoves.map((m) => m.text ?? '');
  const all = texts.join('\n');
  assert.match(all, /Shipwreck Moray dostaje \+1 licznik \+1\/\+1/,
    `brak wpisu o liczniku +1/+1: ${JSON.stringify(texts)}`);
  assert.match(all, /Shipwreck Moray zadaje 1 obrażenie \(Skinbrand Goblin\)/,
    `brak wpisu „kto komu ile zadał": ${JSON.stringify(texts)}`);
  assert.match(all, /Skinbrand Goblin zadaje 2 obrażenia \(Shipwreck Moray\)/,
    `brak wpisu o obrażeniach zwrotnych: ${JSON.stringify(texts)}`);
  assert.match(all, /Skinbrand Goblin ginie/, `brak wpisu o śmierci: ${JSON.stringify(texts)}`);
});

// ---------------------------------------------------------------------------
// A1b: energia to licznik GRACZA (ruling WotC 2024-06-07: „They're not
// associated with any specific permanents.”) — dlatego panel energii jest
// poprawnym miejscem, a kafel Moraya NIE pokazuje {E} jako swojego licznika.
// ---------------------------------------------------------------------------
test('M386/E: kafel karty z kosztem {E} NIE udaje licznika permanentu (A1)', () => {
  const { session } = energySession({ energy: 4 });
  const state = session.state;
  const src = findObjectId(state, 'shipwreck-moray');
  const moray = state.objects.get(moveObjectDirectly(state, src, 'battlefield', 'bf-moray-e').id);
  assert.ok(moray, 'Moray nie wszedł na pole bitwy');
  const els = makeEls();
  renderTableView({ els, session, play: () => {}, onCardClick: () => {} });
  const text = els.bfOwn.textContent;
  assert.match(text, /Shipwreck Moray/, `kafel Moraya zniknął: ${JSON.stringify(text)}`);
  // Licznik permanentu (badge „Nx …”) NIE może nieść energii; Energia żyje
  // w panelu gracza (i tylko tam), bo nie jest związana z żadnym permanentem.
  assert.ok(!/\d+x .*[Ee]nergi/.test(text), `kafel pokazuje energię jako licznik permanentu: ${JSON.stringify(text)}`);
  assert.equal((moray.counters ?? {}).energy ?? 0, 0, 'energia wpisana w counters permanentu');
  assert.equal(session.view().players.find((p) => p.id === HUMAN_ID).energy, 4, 'energia zniknęła z gracza');
});

test('M386/F: energia należy do gracza i przeżywa śmierć permanentu, który ją dał', () => {
  const { session } = energySession({ energy: 3 });
  const state = session.state;
  const src = findObjectId(state, 'shipwreck-moray');
  const moray = state.objects.get(moveObjectDirectly(state, src, 'battlefield', 'bf-moray-f').id);
  assert.equal((moray.counters ?? {}).energy ?? 0, 0,
    'licznik energii został przypisany do permanentu (ruling: „They\'re not associated with any specific permanents.”)');
  assert.equal(session.view().players.find((p) => p.id === HUMAN_ID).energy, 3,
    'energia nie żyje na graczu');
  // Ruling WotC 2024-06-07: energia nie znika z końcem tur — śmierć źródła
  // też jej nie zabiera (nie jest związana z kartą).
  moveObjectDirectly(state, moray.id, 'graveyard', 'gy-moray-f');
  assert.equal(session.view().players.find((p) => p.id === HUMAN_ID).energy, 3,
    'energia gracza zniknęła razem z permanentem');
});

test('M386/G: pauza bota + energia > 0 — render nie może wysypać ścieżki „Wznów grę bota” (A2)', () => {
  // A2 właściciela: po ptaszku w Głównej 2 gra przeszła do tury bota i stanęła
  // z JEDYNĄ akcją „Poddaj partię”. Mechanizm: main.js po `renderTableView`
  // wstrzykuje „▶ Wznów grę bota” (rerender, ogon funkcji) i otwiera modal
  // „Rozgrywka”; wyjątek z panelu energii (A1) przerywał `rerender` PRZED tym
  // ogonem, więc pauza bota czekała na klik, którego nie było na ekranie.
  const registry = createCardRegistry();
  let paused = null;
  for (let seed = 1; seed <= 60 && !paused; seed += 1) {
    const s = createSession({ seed, registry, decks: tinyDecks(registry), pauseOnBotMoves: true });
    for (let i = 0; i < 1200 && s.state.status === 'active' && !s.botPausePending; i += 1) {
      const view = s.view();
      const keep = view.legalCommands.find((c) => c.type === 'resolve_mulligan_choice' && c.keep === true);
      const cmd = keep ?? view.legalCommands.find((c) => c.type.startsWith('resolve_'))
        ?? view.legalCommands.find((c) => c.type === 'pass_priority');
      if (!cmd || !s.apply(cmd).ok) break;
    }
    if (s.botPausePending) paused = s;
  }
  assert.ok(paused, 'nie znaleziono seeda dojeżdżającego do pauzy bota (1..60)');

  addEnergyCounters(paused.state, HUMAN_ID, 4);
  const els = makeEls();
  assert.doesNotThrow(
    () => renderTableView({ els, session: paused, play: () => {}, onCardClick: () => {} }),
    'renderTableView wysypał się w pauzie bota — „Wznów grę bota” i modal „Rozgrywka” nigdy się nie pokażą (ekran z samym „Poddaj partię”)',
  );
  assert.ok(paused.botPausePending, 'pauza bota przepadła po renderze');
  const resumed = paused.continueBotPlay();
  assert.ok(resumed.ok, `wznowienie po renderze nie działa: ${resumed.reason ?? resumed.internalError}`);
});

test('M386/H: rerender ma siatkę bezpieczeństwa — ogon („Wznów grę bota”) poza try renderu (A2)', () => {
  // Test G pilnuje, że DZIŚ nic nie rzuca. Ten pin pilnuje KLASY błędu: nawet
  // gdyby kolejny panel rzucił, `rerender` musi dojść do wstrzyknięcia
  // „▶ Wznów grę bota” (sesja czeka na klik, więc brak przycisku = deadlock),
  // a błąd ma trafić do logu partii, nie do konsoli.
  const src = readFileSync(new URL('../src/table/main.js', import.meta.url), 'utf8');
  const start = src.indexOf('function rerender()');
  assert.ok(start > 0, 'nie znaleziono rerender w main.js');
  const interjection = src.indexOf('session.botPausePending', start);
  assert.ok(interjection > start, 'rerender nie wstrzykuje już przycisku wznowienia pauzy bota');
  // Wywołanie renderTableView musi być w try, a wstrzyknięcie przycisku — POZA nim.
  const renderIdx = src.indexOf('renderTableView({', start);
  const tryIdx = src.lastIndexOf('try {', renderIdx);
  const catchIdx = src.indexOf('catch (error)', renderIdx);
  assert.ok(tryIdx > start && tryIdx < renderIdx,
    'brak try wokół renderTableView — wyjątek panelu zje „Wznów grę bota” (deadlock A2)');
  assert.ok(catchIdx > renderIdx && catchIdx < interjection,
    'ogonek renderu (przycisk wznowienia) wpadł do bloku try/catch');
  // F-2 audytu PR #128: deduplikacja wpisu (lastRenderLogMessage) odsunęła
  // `logSystem(` od `catch` o komentarz i warunek — okno 700 znaków, nie 400.
  assert.match(src.slice(catchIdx, catchIdx + 700), /logSystem\(/,
    'połknięty błąd renderu bez śladu w logu partii');
});

test('M386/B2: marker energii jest KLIKALNY i otwiera pełny ekran jak Poison (A1)', () => {
  // Zgłoszenie właściciela: „w panelu img tokena energy ze scryfall, dokładnie
  // tak jak w przypadku Poison” — Poison ma klikalny marker (M169/M), więc
  // panel energii musi mieć tę samą ścieżkę pełnego ekranu; inaczej opcja
  // `onOpenCard` byłaby martwa (L67).
  const { session } = energySession();
  const els = makeEls();
  const otwarte = [];
  renderTableView({
    els, session, play: () => {}, onCardClick: () => {},
    onEnergyCardClick: (card) => otwarte.push(card),
  });
  const marker = els.energy.findAll((el) => String(el.className).includes('poison-card'))[0];
  assert.ok(marker, 'panel energii bez markera (wzorzec Poison)');
  assert.ok(String(marker.className).includes('clickable'),
    `marker energii nie jest klikalny: ${marker.className}`);
  marker.emit('click', {});
  assert.equal(otwarte.length, 1, 'klik w marker energii nie otworzył pełnego ekranu');
  assert.equal(otwarte[0].name, 'Energy Reserve', `pełny ekran z nie tej karty: ${otwarte[0].name}`);
  assert.match(otwarte[0].imageUri, /6a2c1fa5-deed-48ba-afe4-6c8ea8d9135e/,
    'pełny ekran otwiera inny obraz niż token energii ze Scryfall');
  // Ścieżka main.js: rerender przekazuje onEnergyCardClick do renderTableView.
  const mainSrc = readFileSync(new URL('../src/table/main.js', import.meta.url), 'utf8');
  assert.match(mainSrc, /onEnergyCardClick: \(card\) => openSpecialCardFullscreen\(card\)/,
    'main.js nie podłącza markera energii do pełnego ekranu');
});

test('M386/I: pełna sekwencja ptaszka (jak toggleIgnoredOption) nie zatrzymuje partii (A2)', () => {
  // Odtworzenie DOKŁADNEJ kolejności z main.js `toggleIgnoredOption`:
  //   ignored.add(key) → rerender → recheckAutoPass → autosave → rerender →
  //   showBotMoves.
  // W wersji z błędem PIERWSZY rerender rzucał (panel energii), więc
  // `recheckAutoPass()` nie wykonywał się wcale — gracz zostawał z panelem
  // akcji z samym „Poddaj partię”, a sesja czekała na klik wznowienia,
  // którego nie było na ekranie.
  const registry = createCardRegistry();
  const ignored = new Set();
  const session = createSession({ seed: 596891, registry, decks: tinyDecks(registry), ignoredOptionKeys: ignored });
  const state = session.state;
  state.pendingMulligans = [];
  state.pendingMulliganBottom = null;
  state.turn = jumpToStep(state.turn, 'main1', HUMAN_ID);
  state.turn.activePlayerId = HUMAN_ID;
  state.turn.priorityPlayerId = HUMAN_ID;
  moveObjectDirectly(state, findObjectId(state, 'shipwreck-moray'), 'battlefield', 'bf-moray-i');
  addEnergyCounters(state, HUMAN_ID, 4);

  const view = session.view();
  const ability = view.legalCommands.find((c) => c.type === 'activate_ability'
    && state.objects.get(c.objectId)?.cardId === 'shipwreck-moray');
  assert.ok(ability, 'zdolność „Pay {E}: +2/-2” nie jest oferowana w Głównej 1 — scena pinu I nie ma sensu');

  // Ptaszek na zdolności Moraya (to zgłoszenie właściciela) + wyciszenie
  // pozostałych opcji z tego okna, żeby auto-pass miał dokąd przewinąć
  // (w partii właściciela inne okna też były już wyciszone).
  ignored.add(commandOptionKey(ability));
  for (const cmd of view.legalCommands) {
    if (cmd.type === 'concede' || cmd.type === 'pass_priority' || cmd.type.startsWith('resolve_')) continue;
    ignored.add(commandOptionKey(cmd));
  }

  const before = `${session.state.turn.number}:${session.state.turn.step}`;
  const els = makeEls();
  // 1) rerender (main.js) — musi przejść, inaczej recheckAutoPass się nie wykona.
  assert.doesNotThrow(() => renderTableView({ els, session, play: () => {}, onCardClick: () => {} }),
    'rerender po ptaszku rzuca — recheckAutoPass nigdy się nie wykona (A2)');
  // 2) recheckAutoPass — przewinięcie okna bez realnych decyzji.
  session.recheckAutoPass();
  const after = `${session.state.turn.number}:${session.state.turn.step}`;
  assert.notEqual(after, before, 'auto-pass nie ruszył partii — gra stoi w miejscu');
  // 3) drugi rerender (main.js) + ścieżka modala ruchu bota.
  assert.doesNotThrow(() => renderTableView({ els, session, play: () => {}, onCardClick: () => {} }),
    'render po auto-passie rzuca — kolejne kliknięcia nie mają jak zadziałać');
  const offer = session.view().legalCommands.map((c) => c.type);
  assert.ok(offer.length > 0, 'po przewinięciu gracz nie ma żadnej akcji (nawet „Poddaj”)');
  assert.ok(session.botPausePending || offer.some((t) => t !== 'concede'),
    `po przewinięciu zostało samo „Poddaj partię”: ${JSON.stringify(offer)}`);
});

test('M386/J: wznowienie po odświeżeniu nie resetuje partii z energią (A2)', () => {
  // Zgłoszenie właściciela: „odświeżenie skasowało całą partię, log przepadł”.
  // Mechanizm: `resumeFromSaved` (main.js) odtwarza zapis przez
  // `session.resumeReplayText` i na końcu woła `rerender()` — wyjątek panelu
  // energii wpadał do `catch` wznowienia, więc strona startowała ŚWIEŻĄ partię
  // (stąd „reset”). Pin idzie REALNĄ drogą: energia musi powstać z komend
  // (ETB Moraya), nie z preparowania stanu — inaczej zapis jej nie niesie.
  const registry = createCardRegistry();
  const decks = tinyDecks(registry);
  const live = createSession({ seed: 596891, registry, decks });
  const morayOnBoard = () => [...live.state.objects.values()]
    .some((o) => o.cardId === 'shipwreck-moray' && o.zone === 'battlefield');
  for (let i = 0; i < 400 && live.state.status === 'active'; i += 1) {
    if (morayOnBoard() && (live.view().players.find((p) => p.id === HUMAN_ID).energy ?? 0) >= 4) break;
    const view = live.view();
    const keep = view.legalCommands.find((c) => c.type === 'resolve_mulligan_choice' && c.keep === true);
    const morayCast = view.legalCommands.find((c) => c.type === 'cast_permanent'
      && live.state.objects.get(c.objectId)?.cardId === 'shipwreck-moray');
    const land = view.legalCommands.find((c) => c.type === 'play_land');
    const pass = view.legalCommands.find((c) => c.type === 'pass_priority');
    const cmd = keep ?? morayCast ?? land ?? pass;
    if (!cmd || !live.apply(cmd).ok) break;
  }
  assert.equal(live.view().players.find((p) => p.id === HUMAN_ID).energy, 4,
    'scena pinu J nie zbudowała energii realnymi komendami');
  assert.ok(morayOnBoard(), 'Moray nie wszedł na pole bitwy realnym rzutem');
  const replay = live.exportReplayText();
  const turnBefore = live.state.turn.number;

  const resumed = createSession({ seed: 1, registry, decks });
  const summary = resumed.resumeReplayText(replay);
  assert.ok(summary.steps > 0, 'zapis nie zawiera komend');
  assert.equal(resumed.view().players.find((p) => p.id === HUMAN_ID).energy, 4,
    'wznowienie zgubiło liczniki energii gracza');
  assert.equal(resumed.state.turn.number, turnBefore, 'wznowienie cofnęło turę');
  assert.ok([...resumed.state.objects.values()].some((o) => o.cardId === 'shipwreck-moray' && o.zone === 'battlefield'),
    'wznowienie nie odtworzyło Moraya na polu bitwy');
  const els = makeEls();
  assert.doesNotThrow(() => renderTableView({ els, session: resumed, play: () => {}, onCardClick: () => {} }),
    'render po wznowieniu rzuca (energia > 0) — resumeFromSaved wpada w catch i startuje ŚWIEŻĄ partię');
  assert.match(els.energy.textContent, /4 \{E\}/, 'panel energii po wznowieniu bez liczników');
});

test('M386/K: nieudane wznowienie zapisu mówi w logu, dlaczego startuje nowa partia (A2)', () => {
  // Ten sam incydent co pin J widziany od strony gracza: `resumeFromSaved`
  // łapie wyjątek i pokazuje notice, ale `resumeOrStart` zaraz startuje
  // ŚWIEŻĄ partię — komunikat przepadał, a gracz widział „reset” bez powodu.
  // Pin: powód nieudanego wznowienia trafia do logu NOWEJ partii.
  const src = readFileSync(new URL('../src/table/main.js', import.meta.url), 'utf8');
  const start = src.indexOf('function resumeOrStart()');
  assert.ok(start > 0, 'nie znaleziono resumeOrStart w main.js');
  const body = src.slice(start, src.indexOf('\n  }', start));
  assert.match(body, /lastResumeError/, 'brak zapamiętania powodu nieudanego wznowienia');
  const afterStart = body.slice(body.indexOf('startGame()'));
  assert.match(afterStart, /logSystem\(/,
    'po nieudanym wznowieniu nowa partia nie mówi w logu, dlaczego zapis nie wrócił');
  assert.match(src.slice(0, start), /let lastResumeError/,
    'brak zmiennej lastResumeError przy resumeFromSaved');
});

test('M386/D2: panel energii rysuje się tylko, gdy ktoś MA energię (kontrola)', () => {
  const { session } = energySession({ energy: 0 });
  const els = makeEls();
  renderTableView({ els, session, play: () => {}, onCardClick: () => {} });
  assert.equal(els.energy.hidden, true, 'panel energii nie może się pokazywać przy 0 {E}');
  els.energy.hidden = false;
  renderEnergyPanel(els, session.view());
  assert.equal(els.energy.hidden, true, 'renderEnergyPanel nie chowa panelu przy braku energii');
});
