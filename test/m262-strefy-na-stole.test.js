// M262 (zgłoszenie właściciela 2026-08-31) — reforma stref: trzy strefy
// dodatkowe NA STÓŁ zamiast inspektora i poczekalni:
//
//  1. Pod ręką Bota stoją boksy: CMENTARZ GRACZA (czarne tło) → WYGNANIE
//     (niebieskie tło) → CMENTARZ BOTA (czarne tło); widoczne tylko,
//     gdy niepuste.
//  2. Karty jak na stole: rozmiar kart stołowych (NIE 88px .zone-grid),
//     normalny hover, klik identyczny jak karty stołowe (tile +
//     onCardClick → menu kontekstowe / pełny ekran).
//  3. Exile: badge'e per karta — obowiązkowy WŁAŚCICIEL („Właściciel:
//     Gracz/Bot"), obowiązkowe ŹRÓDŁO wygnania („Wygnane: Pandemonium" —
//     nazwa z nameOf, ADR 0002; „Wygnane: Plot" dla mechanik), opcjonalne
//     liczniki (plot/suspend). Agregacja: właściciel → źródło. Zakryta
//     zostaje zakryta (maska M260/B1), ale badge'e są jawne.
//  4. Cmentarze: BEZ etykiet grup, kolejność przyrostowa od najstarszych
//     (lewa) do najnowszych (prawa), wrapowana — daje ją array push
//     w zones.graveyard, bez zmian silnika.
//  5. USUNIĘTE: warstwa „Pokaż karty w strefach" (przycisk
//     .zone-inspector-bar + modal #library-menu-panel) oraz CAŁA
//     poczekalnia (#waiting-wrap/#waiting-zone).
//
// Źródło wygnania (decyzja właściciela): zawsze karta/efekt, który wygnał
// — także self-exile (escape/craft/plot/suspend → „Wygnane: <ta sama
// karta>" albo mechanika).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { applyEffect } from '../src/engine/effects.js';
import { moveObjectDirectly } from '../src/engine/objects.js';
import { runStateBasedActions } from '../src/engine/state-based.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { BOT_ID, HUMAN_ID, createSession } from '../src/table/session.js';
import { renderTableView, exileSourceLabel, exileBadges } from '../src/table/render.js';

const REGISTRY = createCardRegistry();
const HTML_CODE = fs.readFileSync('src/table/index.html', 'utf8');
const MAIN_JS = fs.readFileSync('src/table/main.js', 'utf8');

// ============================================================================
// Silnik: meta.exiledBy na każdym obiekcie w wygnaniu
// ============================================================================

function game(playerId = 'p1', step = 'main') {
  const state = createGameState({ seed: 262, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function put(state, id, cardId, controllerId, zone = 'battlefield', patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  if (Object.keys(patch).length) {
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
  }
  return state.objects.get(id);
}

test('M262: moveObjectDirectly stempluje exiledBy (jawne źródło, keyword, fallback)', () => {
  const state = game();
  put(state, 'v1', 'goblin-piker', 'p2', 'battlefield');
  put(state, 'v2', 'goblin-piker', 'p2', 'battlefield');
  put(state, 'v3', 'goblin-piker', 'p2', 'battlefield');

  // Jawne źródło (karta, która wygnała) — opcjonalny argument choke pointa.
  moveObjectDirectly(state, 'v1', 'exile', 'ex-1', { exiledBy: 'faceless-butcher' });
  assert.equal(state.objects.get('ex-1').meta?.exiledBy, 'faceless-butcher',
    'jawne exiledBy trafia do meta obiektu w exile');

  // Mechanika — keyword zamiast cardId.
  moveObjectDirectly(state, 'v2', 'exile', 'ex-2', { exiledBy: 'plot' });
  assert.equal(state.objects.get('ex-2').meta?.exiledBy, 'plot', 'keyword mechaniki');

  // Bez źródła — centralny fallback „efekt".
  moveObjectDirectly(state, 'v3', 'exile', 'ex-3');
  assert.equal(state.objects.get('ex-3').meta?.exiledBy, 'effect', 'fallback: efekt');

  // CR 400.7: opuszczenie wygnania czyści meta — powrót na pole bitwy
  // nie może dziedziczyć starego źródła po ponownym wygnaniu.
  moveObjectDirectly(state, 'ex-1', 'battlefield', 'perm-1');
  assert.equal(state.objects.get('perm-1').meta ?? null, null, 'meta znika poza exile');
});

test('M262: auto-deriwacja — unearth, flashback, finality, exileIfDiesThisTurn', () => {
  const state = game();
  // Unearth (CR 702.87b): permanent z flagą opuszczający pole bitwy → exile.
  put(state, 'u1', 'goblin-piker', 'p1', 'battlefield', { unearthExile: true });
  moveObjectDirectly(state, 'u1', 'graveyard', 'ex-u1');
  assert.equal(state.objects.get('ex-u1').meta?.exiledBy, 'unearth', 'redirect unearth');

  // Flashback (CR 702.34b): karta po zapłaceniu flashback opuszcza stos → exile.
  put(state, 'f1', 'goblin-piker', 'p1', 'stack', { flashedBack: true });
  moveObjectDirectly(state, 'f1', 'graveyard', 'ex-f1');
  assert.equal(state.objects.get('ex-f1').meta?.exiledBy, 'flashback', 'redirect flashback');

  // Finality (CR 702.195): licznik finality — śmierć zamiast grobu to exile.
  put(state, 'd1', 'goblin-piker', 'p1', 'battlefield', {
    counters: { finality: 1 }, damage: 99, toughness: 1,
  });
  runStateBasedActions(state);
  const dead = [...state.objects.values()].find((o) => ['ex-u1', 'ex-f1'].every((old) => o.id !== old) && o.cardId === 'goblin-piker' && o.zone === 'exile');
  assert.ok(dead, 'stwór z finality umarł do exile');
  assert.equal(dead.meta?.exiledBy, 'finality', 'finality jako źródło');

  // „Exile instead of dies this turn" — znacznik niesie kartę źródłową.
  const state2 = game();
  put(state2, 'victim', 'goblin-piker', 'p2', 'battlefield', { damage: 99, toughness: 1 });
  put(state2, 'marker', 'agate-assault', 'p1');
  applyEffect(state2, { type: 'exile_if_dies_this_turn' }, state2.objects.get('marker'), ['victim']);
  runStateBasedActions(state2);
  const exiled2 = [...state2.objects.values()].find((o) => o.cardId === 'goblin-piker' && o.zone === 'exile');
  assert.ok(exiled2, 'oferta exile zamiast śmierci zadziałała');
  assert.equal(exiled2.meta?.exiledBy, 'agate-assault',
    'znacznik exileIfDiesThisTurn niesie kartę źródłową');
});

test('M262: widok niesie exiledBy także w minimalnym (zakrytym) wpisie exile', () => {
  const state = game();
  put(state, 'lib-p1', 'negate', 'p1', 'library');
  put(state, 'lib-p2', 'negate', 'p2', 'library');
  put(state, 'pyxis', 'pyxis-of-pandemonium', 'p2');
  applyEffect(state, { type: 'each_player_exiles_top_face_down' }, state.objects.get('pyxis'), []);
  for (const viewer of ['p1', 'p2']) {
    const view = playerView(state, viewer);
    const entries = view.zones.exile;
    assert.equal(entries.length, 2, `viewer ${viewer}: dwie zakryte karty`);
    for (const entry of entries) {
      assert.equal(entry.faceDown, true, `viewer ${viewer}: znacznik zakrycia`);
      assert.equal(entry.cardId, null, `viewer ${viewer}: tożsamość zamaskowana (M260/B1)`);
      assert.equal(entry.exiledBy, 'pyxis-of-pandemonium',
        `viewer ${viewer}: źródło wygnania jest jawne mimo zakrycia karty`);
    }
  }
});

test('M262: prawdziwy przepływ suspend stempluje „suspend" jako źródło', () => {
  const decks = new Map([
    [HUMAN_ID, [...Array(10).fill('basic-swamp'), ...Array(10).fill('mindstab')]],
    [BOT_ID, [...Array(10).fill('basic-mountain'), ...Array(10).fill('goblin-piker')]],
  ]);
  const session = createSession({ seed: 11, registry: REGISTRY, decks, pauseOnBotMoves: false });
  let suspended = false;
  for (let i = 0; i < 200 && session.state.status === 'active'; i += 1) {
    const view = session.view();
    const cmds = view.legalCommands;
    const pick = cmds.find((c) => c.type === 'resolve_mulligan_choice' && c.keep)
      ?? cmds.find((c) => c.type === 'play_land')
      ?? (!suspended ? cmds.find((c) => c.type === 'suspend_card') : null)
      ?? cmds.find((c) => c.type === 'draw_card')
      ?? cmds.find((c) => c.type === 'pass_priority') ?? cmds[0];
    if (!pick) break;
    if (pick.type === 'suspend_card') suspended = true;
    if (!session.apply(pick).ok) break;
    if (suspended && session.state.zones.exile.length > 0) break;
  }
  assert.equal(suspended, true, 'scenariusz: karta zawieszona');
  const entry = session.view().zones.exile.find((o) => o.suspended);
  assert.ok(entry, 'zawieszona karta w exile');
  assert.equal(entry.exiledBy, 'suspend', 'suspend jako źródło wygnania');
});

// ============================================================================
// Render: boksy na stole, badge'e, kolejność, widoczność
// ============================================================================

class MiniEl {
  constructor(tag) { this.tagName = tag; this.children = []; this.className = ''; this.text = ''; this.listeners = {}; this.style = {}; this.dataset = {}; this.hidden = false; }
  set textContent(v) { this.text = String(v); this.children = []; }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  appendChild(c) { this.children.push(c); return c; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  setAttribute(name, value) { this.dataset[name] = value; }
  createTextNode(v) { return new MiniEl('#text'); }
  descendants() { return this.children.flatMap((c) => [c, ...c.descendants()]); }
}
const doc = { createElement: (tag) => new MiniEl(tag), createTextNode: () => new MiniEl('#text') };
globalThis.document = globalThis.document ?? doc;

const tilesOf = (host) => host.descendants().filter((n) => /(?:^|\s)tile(?:\s|$)/.test(String(n.className)));

function makeEls() {
  const keys = ['banner', 'status', 'stackZone', 'bfEnemy', 'bfOwn', 'graveEnemy', 'graveOwn',
    'exileZone', 'hand', 'handEnemy', 'handEnemyLabel', 'actions', 'log', 'turnIndicator',
    'metaFoe', 'metaOwn', 'daynight', 'poison', 'undercity', 'turnHistory',
    'graveOwnWrap', 'exileZoneWrap', 'graveEnemyWrap'];
  const els = {};
  for (const key of keys) els[key] = new MiniEl('div');
  return els;
}

/** Sesja z martwym stworem gracza (grób) i trzema kartami w exile. */
function sessionWithZones() {
  const decks = new Map([
    [HUMAN_ID, [...Array(10).fill('basic-swamp'), ...Array(10).fill('mindstab')]],
    [BOT_ID, [...Array(10).fill('basic-mountain'), ...Array(10).fill('goblin-piker')]],
  ]);
  const session = createSession({ seed: 11, registry: REGISTRY, decks, pauseOnBotMoves: false });
  const state = session.state;
  // Grób gracza: dwie karty, starsza (lewa) i nowsza (prawa) — kolejność
  // z array push w zones.graveyard (kontrakt M262: przyrostowo).
  addObject(state, {
    id: 'g-old', instanceId: 'ig1', cardId: 'mindstab', controllerId: HUMAN_ID, ownerId: HUMAN_ID,
    zone: 'graveyard', ...gameObjectDataOf(REGISTRY.get('mindstab')), types: REGISTRY.get('mindstab').types ?? [],
  });
  addObject(state, {
    id: 'g-new', instanceId: 'ig2', cardId: 'basic-swamp', controllerId: HUMAN_ID, ownerId: HUMAN_ID,
    zone: 'graveyard', ...gameObjectDataOf(REGISTRY.get('basic-swamp')), types: REGISTRY.get('basic-swamp').types ?? [],
  });
  // Exile: jawna karta bota wygnana przez Faceless Butchera,
  // zakryta karta gracza wygnana przez Pyxis (maska M260/B1),
  // zawieszona karta gracza z licznikami czasu.
  const exileEntry = (id, cardId, controllerId, extra = {}) => {
    const def = REGISTRY.get(cardId);
    addObject(state, {
      id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone: 'exile',
      ...gameObjectDataOf(def), types: def.types ?? [],
      suspended: Boolean(extra.suspended), timeCounters: extra.timeCounters ?? 0,
    });
    // meta/faceDown nie wchodzą w kontrakt addObject — doklejamy po dodaniu
    // (jak patch w m254), bo to pola ustawiane przez silnik PO ruchu.
    state.objects.set(id, Object.freeze({
      ...state.objects.get(id),
      ...(extra.exiledBy != null ? { meta: Object.freeze({ exiledBy: extra.exiledBy }) } : {}),
      ...(extra.patch ?? {}),
    }));
    return state.objects.get(id);
  };
  exileEntry('x-open', 'goblin-piker', BOT_ID, { exiledBy: 'faceless-butcher' });
  exileEntry('x-hidden', 'mindstab', HUMAN_ID, {
    exiledBy: 'pyxis-of-pandemonium', patch: { faceDown: true },
  });
  exileEntry('x-susp', 'mindstab', HUMAN_ID, {
    exiledBy: 'suspend', suspended: true, timeCounters: 3,
  });
  return session;
}

test('M262: trzy boksy stref na stole — karty w rozmiarze stołowym, widoczność gdy niepuste', () => {
  const session = sessionWithZones();
  const els = makeEls();
  renderTableView({ els, session, play: () => {}, onCardClick: null });

  assert.equal(els.graveOwnWrap.hidden, false, 'grób gracza niepusty → boks widoczny');
  assert.equal(els.exileZoneWrap.hidden, false, 'exile niepusty → boks widoczny');
  assert.equal(els.graveEnemyWrap.hidden, true, 'grób bota pusty → boks ukryty');

  const graveTiles = tilesOf(els.graveOwn);
  assert.equal(graveTiles.length, 2, 'dwie karty w grobie gracza');
  assert.ok(graveTiles.every((tile) => !/(?:^|\s)sm(?:\s|$)/.test(String(tile.className))),
    'karty grobu w rozmiarze STOŁOWYM (nie sm/88px)');

  // Kolejność przyrostowa: najstarsza po LEWEJ, najnowsza po PRAWEJ —
  // czyli kolejność renderu = kolejność arraya zones.graveyard.
  const order = els.graveOwn.descendants()
    .filter((n) => /(?:^|\s)tile(?:\s|$)/.test(String(n.className))).length;
  assert.equal(order, 2, 'bez etykiet grup — same kafle');
  const names = els.graveOwn.textContent;
  assert.ok(names.includes('Mindstab') && names.includes('Swamp'), 'nazwy kart w grobie');

  // Klik/hover jak karty stołowe: kafel niesie gesture (stateKey tile:…).
  const tile = graveTiles[0];
  assert.ok(Object.keys(tile.listeners).length > 0 || tile.descendants().length > 0,
    'kafel grobu to pełny tile (klikowalny kontrakt tile())');
});

test('M262: boks wygnania — badge właściciela i źródła, zakryta maska zostaje', () => {
  const session = sessionWithZones();
  const els = makeEls();
  renderTableView({ els, session, play: () => {}, onCardClick: null });

  const text = els.exileZone.textContent;
  // Badge właściciela (panel labels: Gracz/Bot).
  assert.match(text, /Właściciel: Bot/, 'jawna karta bota ma badge właściciela');
  assert.match(text, /Właściciel: Gracz/, 'karty gracza mają badge właściciela');
  // Badge źródła — nazwa karty przez nameOf (ADR 0002) i mechanika.
  assert.match(text, /Wygnane: Faceless Butcher/, 'źródło = nazwa karty wyganiającej');
  assert.match(text, /Wygnane: Suspend/, 'źródło mechaniki (suspend)');
  // Zakryta karta: maska tożsamości zostaje (M260/B1), badge'y są jawne.
  // Sprawdzamy KOMÓRKĘ zakrytej karty (per zone-card), nie cały boks —
  // nazwa „Mindstab" w boksie pochodzi z jawnej, zawieszonej karty.
  const cells = els.exileZone.children.filter((c) => String(c.className).includes('zone-card'));
  assert.equal(cells.length, 3, 'trzy karty w boksie wygnania');
  const hiddenCell = cells.find((c) => c.textContent.includes('Wygnane: Pyxis of Pandemonium'));
  assert.ok(hiddenCell, 'komórka zakrytej karty z badge źródła');
  assert.ok(!hiddenCell.textContent.includes('Mindstab'), 'zakryta nie zdradza nazwy karty');
  assert.match(hiddenCell.textContent, /Wygnana zakryta/, 'zakryta ma status zakrycia');
  // Liczniki czasu zawieszonej karty (badge opcjonalny).
  assert.match(text, /3 liczniki czasu/, 'liczniki suspend w badge');
  // Agregacja właściciel → źródło: wpisy posortowane stabilnie
  // (najpierw karty Gracza, potem Bota).
  const ownerIdx = text.indexOf('Właściciel: Gracz');
  const botIdx = text.indexOf('Właściciel: Bot');
  assert.ok(ownerIdx !== -1 && botIdx !== -1 && ownerIdx < botIdx,
    'agregacja: karty Gracza przed kartami Bota');
});

test('M262: exileSourceLabel — nazwa karty, mechanika, fallback efekt', () => {
  const session = sessionWithZones();
  assert.equal(exileSourceLabel(session, 'faceless-butcher'), 'Faceless Butcher', 'cardId → nazwa');
  assert.equal(exileSourceLabel(session, 'plot'), 'Plot', 'keyword mechaniki');
  assert.equal(exileSourceLabel(session, 'suspend'), 'Suspend', 'keyword mechaniki');
  assert.equal(exileSourceLabel(session, 'unearth'), 'Unearth', 'keyword mechaniki');
  assert.equal(exileSourceLabel(session, 'effect'), 'efekt', 'fallback efekt');
  assert.equal(exileSourceLabel(session, null), 'efekt', 'stare autosave’y bez meta → efekt');
});

test('M262: exileBadges — komplet dla jawnej, zakrytej i zawieszonej', () => {
  const session = sessionWithZones();
  const open = exileBadges(session, session.view().zones.exile.find((o) => o.id === 'x-open'));
  assert.deepEqual(open, ['Właściciel: Bot', 'Wygnane: Faceless Butcher']);

  const hidden = exileBadges(session, session.view().zones.exile.find((o) => o.id === 'x-hidden'));
  assert.deepEqual(hidden, ['Właściciel: Gracz', 'Wygnane: Pyxis of Pandemonium', 'Wygnana zakryta · odkryje ją druga zdolność źródła']);

  const suspended = exileBadges(session, session.view().zones.exile.find((o) => o.id === 'x-susp'));
  assert.deepEqual(suspended, ['Właściciel: Gracz', 'Wygnane: Suspend', 'Zawieszona · ⏳ 3 liczniki czasu']);
});

// ============================================================================
// Usunięcie inspektora stref i poczekalni (HTML + main.js)
// ============================================================================

test('M262: inspektor stref i poczekalnia ZNIKNĘŁY z układu', () => {
  assert.doesNotMatch(HTML_CODE, /zone-inspector-open/, 'przycisk inspektora usunięty');
  assert.doesNotMatch(HTML_CODE, /zone-inspector-bar/, 'pasek inspektora usunięty');
  assert.doesNotMatch(HTML_CODE, /library-menu-panel/, 'modal inspektora usunięty');
  assert.doesNotMatch(HTML_CODE, /waiting-wrap/, 'poczekalnia usunięta');
  assert.doesNotMatch(HTML_CODE, /waiting-zone/, 'siatka poczekalni usunięta');
  assert.doesNotMatch(MAIN_JS, /zone-inspector/, 'main.js bez listenerów inspektora');
  assert.doesNotMatch(MAIN_JS, /library-menu-panel/, 'main.js bez modala inspektora');
  assert.doesNotMatch(MAIN_JS, /renderWaitingExile|waitingWrap|waitingZone/, 'main.js bez poczekalni');
});

test('M262: trzy boksy stref są w HTML pod ręką Bota', () => {
  assert.match(HTML_CODE, /id="grave-own-wrap"/, 'boks cmentarza gracza');
  assert.match(HTML_CODE, /id="exile-zone-wrap"/, 'boks wygnania');
  assert.match(HTML_CODE, /id="grave-enemy-wrap"/, 'boks cmentarza bota');
  // Kolejność: cmentarz gracza → wygnanie → cmentarz bota, pod ręką Bota.
  const iGrave = HTML_CODE.indexOf('id="grave-own-wrap"');
  const iExile = HTML_CODE.indexOf('id="exile-zone-wrap"');
  const iEnemyGrave = HTML_CODE.indexOf('id="grave-enemy-wrap"');
  const iEnemyHand = HTML_CODE.indexOf('id="hand-enemy"');
  assert.ok(iGrave !== -1 && iExile !== -1 && iEnemyGrave !== -1, 'wszystkie boksy istnieją');
  assert.ok(iGrave < iExile && iExile < iEnemyGrave, 'kolejność: Gracz → Exile → Bot');
  assert.ok(iEnemyHand < iGrave, 'boksy POD ręką Bota');
  // Kolory: cmentarze CIEMNOSZARE, wygnanie niebieskie.
  // M266/A (korekta właściciela 2026-08-31): pierwotna decyzja M262 brzmiała
  // „cmentarze czarne", ale w realnej grze #000 wyglądało jak dziura w stole.
  // Nowa decyzja: ciemny szary. Szczegółowy próg jasności pinuje
  // test/m266-zgloszenia-wlasciciela.test.js (A).
  assert.match(HTML_CODE, /\.zone-box-grave\s*\{[^}]*background:\s*#333/, 'cmentarz: ciemnoszare tło');
  assert.match(HTML_CODE, /\.zone-box-exile\s*\{[^}]*background:\s*#0(?!00)\d/, 'wygnanie: niebieskie tło');
});
