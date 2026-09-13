// C — znalezisko właściciela 2026-09-12 (Jwari Shapeshifter): kopia
// „enter as copy" niosła TYLKO cardName — widok nie wysyłał `name` dla
// nietokenów, więc kafel wracał do session.nameOf(cardId) i pokazywał
// gołe „Jwari Shapeshifter" (kłamstwo: to już Legion). Token-kopia ten
// problem rozwiązała w M172/D (name + copyNumber → „X (kopia N)"), ale
// ścieżka enter-as-copy nie dostała tego samego (L48).
//
// Naprawa (lustro L48): enter-as-copy stawia name (nazwa celu, CR 707.2)
// + copyNumber (nextCopyNumber), widok rzutuje name dla kopii — kafel
// „Rotting Legion (kopia 1)" istniejącą ścieżką M172/D, bez nowych badge'ów.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { replaceObject } from '../src/engine/permanents.js';
import { renderTableView } from '../src/table/render.js';

const REGISTRY = createCardRegistry();

function put(s, id, cardId, zone = 'battlefield') {
  const d = REGISTRY.get(cardId);
  addObject(s, { ...gameObjectDataOf(d), types: d.types, keywords: d.keywords, subtypes: d.subtypes ?? [], id, instanceId: `i-${id}`, cardId, ownerId: 'p1', controllerId: 'p1', zone });
}
function state() {
  const s = createGameState({ seed: 106, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main', 'p1');
  s.turn.activePlayerId = s.turn.priorityPlayerId = 'p1';
  return s;
}
function resolveCopyAs(s, sourceId, targetId) {
  replaceObject(s, s.objects.get(sourceId), { enteringAsCopy: true });
  s.pendingEnterAsCopy = { playerId: 'p1', sourceId, candidateIds: [targetId], restorePriorityTo: null };
  const cmd = playerView(s, 'p1').legalCommands.find((c) => c.type === 'resolve_enter_as_copy' && c.targetId === targetId);
  assert.ok(cmd, `kopia ${targetId} oferowana dla ${sourceId}`);
  assert.ok(execute(s, cmd).ok);
}

test('C: Jwari jako kopia Legionu nosi nazwę celu + numer kopii (stan)', () => {
  const s = state();
  put(s, 'jwari', 'jwari-shapeshifter');
  put(s, 'legion', 'rotting-legion');
  resolveCopyAs(s, 'jwari', 'legion');
  const j = s.objects.get('jwari');
  assert.equal(j.cardName, 'Rotting Legion');
  assert.equal(j.name, 'Rotting Legion', 'nazwa kopiowalna (CR 707.2), jak token-kopia');
  assert.equal(j.copyNumber, 1, 'pierwsza żywa kopia tej nazwy');
});

test('C: widok rzutuje name kopii dla NIETOKENA (kafel ma dane)', () => {
  const s = state();
  put(s, 'jwari', 'jwari-shapeshifter');
  put(s, 'legion', 'rotting-legion');
  resolveCopyAs(s, 'jwari', 'legion');
  const entry = playerView(s, 'p1').zones.battlefield.find((o) => o.id === 'jwari');
  assert.equal(entry.name, 'Rotting Legion');
  assert.equal(entry.copyNumber, 1);
  assert.notEqual(entry.isToken, true, 'karta wchodząca jako kopia to NIE token');
});

test('C: druga kopia tej samej nazwy dostaje numer 2 (oryginał bez numeru)', () => {
  const s = state();
  put(s, 'jwari1', 'jwari-shapeshifter');
  put(s, 'jwari2', 'jwari-shapeshifter');
  put(s, 'legion', 'rotting-legion');
  // Oba z flagą ZANIM pierwsze rozstrzygnięcie odpali SBA (inaczej gołe
  // 0/0 drugiego ginie w 704.5f, zanim zdąży wybrać kopię).
  replaceObject(s, s.objects.get('jwari2'), { enteringAsCopy: true });
  resolveCopyAs(s, 'jwari1', 'legion');
  resolveCopyAs(s, 'jwari2', 'legion');
  assert.equal(s.objects.get('jwari1').copyNumber, 1);
  assert.equal(s.objects.get('jwari2').copyNumber, 2, 'nextCopyNumber liczy żywe kopie nazwy');
  assert.equal(s.objects.get('legion').copyNumber, undefined, 'oryginał bez numeru (nie koliduje)');
});

test('C: odmowa kopii nie stawia nazwy ani numeru (kontrola negatywna)', () => {
  const s = state();
  put(s, 'jwari', 'jwari-shapeshifter');
  // Drugi Jwari jako cel-niecel: odmowa = 0/0 ginie w SBA — bierzemy cel,
  // ale tu liczy się tylko gałąź „bez wyboru".
  put(s, 'legion', 'rotting-legion');
  replaceObject(s, s.objects.get('jwari'), { enteringAsCopy: true });
  s.pendingEnterAsCopy = { playerId: 'p1', sourceId: 'jwari', candidateIds: ['legion'], restorePriorityTo: null };
  const cmd = playerView(s, 'p1').legalCommands.find((c) => c.type === 'resolve_enter_as_copy' && c.targetId == null);
  assert.ok(cmd, 'odmowa oferowana');
  assert.ok(execute(s, cmd).ok);
  assert.equal(s.objects.get('jwari'), undefined, '0/0 bez kopii ginie w SBA (704.5f)');
});

// Kafel (harness jak batch53-tiles): wpis NIETOKENA z name+copyNumber
// (tak rzutuje widok po fixie) → „Rotting Legion (kopia 1)".
class MiniEl {
  constructor(tag) { this.tagName = tag; this.children = []; this.className = ''; this.text = ''; this.listeners = {}; this.style = {}; this.dataset = {}; this.hidden = false; this.type = ''; }
  set textContent(v) { this.text = String(v); this.children = []; }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  appendChild(c) { this.children.push(c); return c; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  setAttribute(name, value) { this.dataset[name] = value; }
  createTextNode() { return new MiniEl('#text'); }
}
globalThis.document = globalThis.document ?? { createElement: (tag) => new MiniEl(tag), createTextNode: () => new MiniEl('#text') };

test('C: kafel kopii na karcie pokazuje „Rotting Legion (kopia 1)" (ścieżka M172/D)', () => {
  const view = {
    status: 'active', winnerId: null, playerId: 'p1',
    players: [{ id: 'p1', name: 'Ty', life: 20 }, { id: 'p2', name: 'Nieprzyjaciel', life: 20 }],
    zones: {
      stack: [], graveyard: [], exile: [], library: [], hand: [],
      battlefield: [
        { id: 'jwari', cardId: 'jwari-shapeshifter', name: 'Rotting Legion', copyNumber: 1, controllerId: 'p1', zone: 'battlefield', kind: 'creature', power: 4, toughness: 5, summoningSickness: false, damage: 0 },
        { id: 'legion', cardId: 'rotting-legion', controllerId: 'p1', zone: 'battlefield', kind: 'creature', power: 4, toughness: 5, summoningSickness: false, damage: 0 },
      ],
    },
    turn: { number: 1, activePlayerId: 'p1', phase: 'precombat_main', step: 'precombat_main' },
    legalCommands: [],
  };
  const session = {
    view: () => view, log: [], reasoning: [], state: { seed: 13 },
    nameOf: (id) => REGISTRY.get(id)?.name ?? id ?? '?',
    nameOfObject: (objectId) => objectId,
    cardDetails: (id) => REGISTRY.get(id) ?? null,
    colorsOf: (id) => REGISTRY.get(id)?.colors ?? [],
    abilitiesOf: (id) => REGISTRY.get(id)?.abilities ?? [],
  };
  const els = {};
  for (const key of ['banner', 'status', 'stackZone', 'bfEnemy', 'bfOwn', 'graveEnemy', 'graveOwn',
    'exileZone', 'hand', 'handEnemy', 'handEnemyLabel', 'actions', 'log',
    'graveOwnWrap', 'exileZoneWrap', 'graveEnemyWrap']) {
    els[key] = new MiniEl(`#${key}`);
  }
  renderTableView({ els, session, play: () => {}, onCardClick: () => {} });
  const text = els.bfOwn.textContent;
  assert.ok(text.includes('Rotting Legion (kopia 1)'), `kafel kopii: ${text}`);
  assert.ok(!text.includes('Jwari Shapeshifter (kopia'), `karta-źródło nie podszywa się pod kopię: ${text}`);
});
