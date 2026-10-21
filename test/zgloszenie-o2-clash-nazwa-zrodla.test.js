/**
 * Zgłoszenie O, runda 2 (właściciel, 2026-10-18): po Clash (Release the Ants)
 * modal decyzji „wierzch czy spód” ma:
 *  - zaczynać się NAZWĄ karty, która wywołała clash — klikalną (pełny ekran),
 *  - nie mieć żadnych ikonek („żadnych infantylnych ikonek, klikalna nazwa jak
 *    w każdym modalu”), a podgląd ma iść przez uniwersalny kreator, nie przez
 *    osobny modal.
 *
 * Kontrakt: silnik niesie `pendingClash.sourceCardId` (jawne, jak odsłonięte
 * karty), widok go przekazuje, a kreator przyciskowy (renderMultiTargetWizard)
 * rysuje go jako klikalną nazwę w nagłówku.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { renderMultiTargetWizard, renderPeekButton, clashSourceCardIdOf } from '../src/table/choice-request.js';
import { buttonsPlanOf } from '../src/table/multi-target.js';

class MiniEl {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.listeners = {};
    this.className = ''; this.text = ''; this.type = ''; this.checked = false;
    this.disabled = false; this.name = ''; this.dataset = {};
  }
  set textContent(value) { this.text = String(value); }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  set innerHTML(value) { this.text = String(value).replace(/<[^>]*>/g, ''); }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...nodes) { this.children = nodes.flat(); }
  addEventListener(type, listener) { (this.listeners[type] ??= []).push(listener); }
  click() { for (const l of this.listeners.click ?? []) l({ preventDefault() {}, stopPropagation() {} }); }
  all(pred, out = []) { if (pred(this)) out.push(this); for (const c of this.children) c.all(pred, out); return out; }
  byClass(cls) { return this.all((el) => String(el.className).split(/\s+/).includes(cls)); }
}
globalThis.document = { createElement: (tag) => new MiniEl(tag) };

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId, zone) {
  const def = REGISTRY.get(cardId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
}

/** Stół: p1 rzuca Release the Ants w p2 — jak w teście O (kartę pokazuje clash). */
function stolZRelease() {
  const state = createGameState({ seed: 2026, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  put(state, 'ants', 'release-the-ants', 'p1', 'hand');
  put(state, 'lib-mine', 'armored-skaab', 'p1', 'library');
  put(state, 'lib-opp', 'goblin-piker', 'p2', 'library');
  addMana(state, 'p1', 2);
  const cast = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'ants', targets: ['p2'] });
  assert.ok(cast.ok, JSON.stringify(cast.events[0]));
  return state;
}

function doClash(state) {
  for (let i = 0; i < 12 && !state.pendingClash; i += 1) {
    const r = execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
    assert.ok(r.ok, JSON.stringify(r.events[0]));
  }
  assert.ok(state.pendingClash, 'clash powinien czekać na decyzje');
}

test('O2/silnik: pendingClash niesie kartę wywołującą (Release the Ants) — jawnie', () => {
  const state = stolZRelease();
  doClash(state);
  assert.equal(state.pendingClash.sourceCardId, 'release-the-ants');
});

test('O2/widok: decyzja clash dla obu graczy niesie sourceCardId', () => {
  const state = stolZRelease();
  doClash(state);
  assert.equal(playerView(state, 'p1').pendingClash.sourceCardId, 'release-the-ants');
  const first = execute(state, { type: 'resolve_clash_choice', playerId: 'p1', putOnBottom: false });
  assert.ok(first.ok, JSON.stringify(first.events[0]));
  assert.equal(playerView(state, 'p2').pendingClash.sourceCardId, 'release-the-ants',
    'drugi gracz też widzi, która karta wywołała clash');
});

test('O2/helper: clashSourceCardIdOf zwraca źródło tylko dla decyzji clash', () => {
  const state = stolZRelease();
  doClash(state);
  const view = playerView(state, 'p1');
  assert.equal(clashSourceCardIdOf({ options: view.legalCommands.filter((c) => c.type === 'resolve_clash_choice') }, view),
    'release-the-ants');
  assert.equal(clashSourceCardIdOf({ options: [{ type: 'resolve_scry_choice' }] }, view), null, 'nie clash');
  assert.equal(clashSourceCardIdOf({ options: view.legalCommands.filter((c) => c.type === 'resolve_clash_choice') }, null),
    null, 'bez widoku brak źródła');
});

test('O2/nagłówek: nazwa karty wywołującej clash stoi NA POCZĄTKU nagłówka i jest klikalna', () => {
  const host = new MiniEl('div');
  const commands = [
    { type: 'resolve_clash_choice', playerId: 'p1', putOnBottom: false },
    { type: 'resolve_clash_choice', playerId: 'p1', putOnBottom: true },
  ];
  const plan = buttonsPlanOf(commands);
  plan.rows = commands.map((c, i) => ({ id: `opt-${i}`, label: i === 0 ? 'Wierzch' : 'Spód', cardId: 'armored-skaab' }));
  const opened = [];
  renderMultiTargetWizard(host, {
    view: { playerId: 'p1', players: [], zones: {} }, session: { nameOf: () => '', nameOfObject: () => '' },
    plan, commands,
    intro: 'Clash: wierzch czy spód?',
    introCard: { cardId: 'release-the-ants', name: 'Release the Ants' },
    onOpenCardByCardId: (cid) => opened.push(cid),
    onComplete: () => {}, onCancel: () => {},
  });
  const intro = host.byClass('choice-request-intro')[0];
  assert.ok(intro, 'nagłówek modala istnieje');
  const name = intro.children[0];
  assert.equal(name.textContent, 'Release the Ants', 'pierwszy element nagłówka to nazwa karty');
  assert.equal(name.dataset.cardId, 'release-the-ants');
  assert.ok(String(name.className).includes('log-card'), 'ta sama klasa co nazwy w kreatorze (klik → pełny ekran)');
  assert.match(intro.textContent, /^Release the Ants — Clash: wierzch czy spód\?/, 'nazwa, potem opis wyboru');
  name.click();
  assert.deepEqual(opened, ['release-the-ants'], 'klik w nazwę w nagłówku otwiera pełny ekran tej karty');
});

test('O2/nagłówek: bez karty źródłowej nagłówek jest zwykłym tekstem (anty-over-fix)', () => {
  const host = new MiniEl('div');
  const commands = [
    { type: 'resolve_clash_choice', playerId: 'p1', putOnBottom: false },
    { type: 'resolve_clash_choice', playerId: 'p1', putOnBottom: true },
  ];
  const plan = buttonsPlanOf(commands);
  plan.rows = commands.map((c, i) => ({ id: `opt-${i}`, label: `opcja ${i}`, cardId: null }));
  renderMultiTargetWizard(host, {
    view: { playerId: 'p1', players: [], zones: {} }, session: { nameOf: () => '', nameOfObject: () => '' },
    plan, commands, intro: 'Clash: wierzch czy spód?', introCard: null,
    onOpenCardByCardId: () => {}, onComplete: () => {}, onCancel: () => {},
  });
  const intro = host.byClass('choice-request-intro')[0];
  assert.equal(intro.children.length, 0, 'bez źródła nagłówek nie ma elementów');
  assert.equal(intro.textContent, 'Clash: wierzch czy spód?');
});

test('O2/ikonki: podgląd w uniwersalnym kreatorze to nazwa karty, nie 🔍', () => {
  const host = new MiniEl('div');
  let opened = null;
  const peek = renderPeekButton(host, { cardId: 'armored-skaab', onOpen: (id) => { opened = id; }, label: 'Armored Skaab' });
  assert.equal(peek.textContent, 'Armored Skaab', 'tekst to nazwa karty');
  assert.ok(!/🔍/.test(peek.textContent), 'żadnej ikonki lupy');
  peek.click();
  assert.equal(opened, 'armored-skaab', 'klik otwiera kartę');
});

test('O2/ikonki: w źródle kreatora nie ma znaku lupy 🔍', () => {
  const src = readFileSync(new URL('../src/table/choice-request.js', import.meta.url), 'utf8');
  const code = src.split('\n').filter((line) => !line.trimStart().startsWith('//') && !line.trimStart().startsWith('*')).join('\n');
  assert.ok(!code.includes('🔍'), 'ikonka lupy nie jest renderowana w kodzie kreatora');
});
