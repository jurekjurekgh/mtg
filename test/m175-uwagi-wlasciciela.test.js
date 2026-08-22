// M175 — uwagi właściciela (2026-08-22, Death-Hood Cobra): A1 log aktywacji
// nazywa nadawany keyword, A2 bot nie dubluje grantu wiszącego na stosie,
// A3 badge nadanego keywordu na kaflu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { describeGameEvent } from '../src/table/session.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { buildStateOverlay, cardInfo } from '../src/table/render.js';

const REGISTRY = createCardRegistry();

function game(activeId = 'p2') {
  const state = createGameState({ seed: 175, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', activeId);
  state.turn.activePlayerId = activeId;
  state.turn.priorityPlayerId = activeId;
  return state;
}

function putCard(state, id, cardId, controllerId, zone = 'battlefield', patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, ...patch,
  });
  return state.objects.get(id);
}

const HELPERS = {
  nameOf: (id) => (id === 'death-hood-cobra' ? 'Death-Hood Cobra' : String(id)),
  nameOfObject: (id) => String(id),
};

// ---- A1: log aktywacji nazywa nadawany keyword -------------------------------

test('A1a: ability_activated niesie grantKeywords (reach) na zdarzeniu', () => {
  const state = game('p2');
  putCard(state, 'cobra', 'death-hood-cobra', 'p2', 'battlefield', { summoningSickness: false });
  addMana(state, 'p2', 2, { colors: ['G'] });
  const res = execute(state, { type: 'activate_ability', playerId: 'p2', objectId: 'cobra', abilityIndex: 0 });
  assert.equal(res.ok, true, `aktywacja przechodzi: ${res.reason ?? ''}`);
  const ev = state.events.filter((e) => e.type === 'ability_activated').at(-1);
  assert.ok(ev, 'zdarzenie ability_activated');
  assert.deepEqual(ev.grantKeywords, ['reach'], 'zdarzenie niesie KONKRETNE keywordy grantu');
});

test('A1b: log „aktywuje zdolność” nazywa keyword po polsku (zasięg), bez ogólnika', () => {
  const state = game('p2');
  putCard(state, 'cobra', 'death-hood-cobra', 'p2', 'battlefield', { summoningSickness: false });
  addMana(state, 'p2', 2, { colors: ['G'] });
  execute(state, { type: 'activate_ability', playerId: 'p2', objectId: 'cobra', abilityIndex: 0 });
  const ev = state.events.filter((e) => e.type === 'ability_activated').at(-1);
  const line = describeGameEvent(ev, HELPERS);
  assert.match(line, /zasięg/, `log nazywa keyword: ${line}`);
  assert.doesNotMatch(line, /nadanie słów kluczowych/, `bez ogólnika: ${line}`);
});

test('A1c: druga zdolność Cobry loguje „dotykanie śmierci”', () => {
  const state = game('p2');
  putCard(state, 'cobra', 'death-hood-cobra', 'p2', 'battlefield', { summoningSickness: false });
  addMana(state, 'p2', 2, { colors: ['G'] });
  execute(state, { type: 'activate_ability', playerId: 'p2', objectId: 'cobra', abilityIndex: 1 });
  const ev = state.events.filter((e) => e.type === 'ability_activated').at(-1);
  const line = describeGameEvent(ev, HELPERS);
  assert.match(line, /dotykanie śmierci/, `log nazywa keyword: ${line}`);
});

// ---- A2: bot nie dubluje grantu wiszącego na stosie --------------------------

function defendingCobra() {
  const state = game('p1');
  putCard(state, 'cobra', 'death-hood-cobra', 'p2', 'battlefield', { summoningSickness: false });
  putCard(state, 'flyer', 'rustwing-falcon', 'p1', 'battlefield', { summoningSickness: false });
  addMana(state, 'p2', 4, { colors: ['G'] });
  state.turn = { ...state.turn, phase: 'combat', step: 'declare_attackers', activePlayerId: 'p1', priorityPlayerId: 'p1' };
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['flyer'] }).ok);
  state.turn.priorityPlayerId = 'p2';
  return state;
}

test('A2a: widok stosu niesie sourceId aktywowanej zdolności (ADR 0017)', () => {
  const state = defendingCobra();
  assert.ok(execute(state, { type: 'activate_ability', playerId: 'p2', objectId: 'cobra', abilityIndex: 0 }).ok);
  const entry = playerView(state, 'p2').zones.stack.find((o) => o.abilityIndex === 0);
  assert.ok(entry, 'wpis aktywacji na stosie');
  assert.equal(entry.sourceId, 'cobra', 'źródło zdolności jest publiczne');
});

test('A2b: bot NIE aktywuje tego samego grantu drugi raz, gdy pierwszy wisi na stosie', () => {
  const state = defendingCobra();
  // Sanity: w tym oknie bot CHCE aktywować reach (jak M173/E2).
  const first = createHeuristicBot({ seed: 1 }).chooseCommand(playerView(state, 'p2'));
  assert.ok(first.type === 'activate_ability' && first.objectId === 'cobra' && first.abilityIndex === 0,
    `pierwsza aktywacja reach ma sens (wybrał: ${first.type} ${first.abilityIndex ?? ''})`);
  assert.ok(execute(state, first).ok);
  state.turn.priorityPlayerId = 'p2';
  const view = playerView(state, 'p2');
  const again = view.legalCommands.find((c) => c.type === 'activate_ability'
    && c.objectId === 'cobra' && c.abilityIndex === 0);
  assert.ok(again, 'oferta drugiej aktywacji istnieje (legalna wg CR)');
  const chosen = createHeuristicBot({ seed: 1 }).chooseCommand(view);
  assert.ok(!(chosen.type === 'activate_ability' && chosen.objectId === 'cobra' && chosen.abilityIndex === 0),
    `duplikat grantu wisi na stosie — druga aktywacja to strata many (wybrał: ${chosen.type})`);
});

// ---- A3: badge nadanego keywordu na kaflu -------------------------------------

class MiniEl {
  constructor(tag) { this.tagName = tag; this.children = []; this.className = ''; this.text = ''; }
  set textContent(v) { this.text = String(v); this.children = []; }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  appendChild(c) { this.children.push(c); return c; }
  descendants() { return this.children.flatMap((c) => [c, ...c.descendants()]); }
}
globalThis.document = { createElement: (tag) => new MiniEl(tag) };

const SESSION_MOCK = {
  nameOf: (id) => REGISTRY.get(id)?.name ?? String(id),
  nameOfObject: (id) => String(id),
  cardDetails: (id) => REGISTRY.get(id) ?? null,
  colorsOf: (id) => REGISTRY.get(id)?.colors ?? [],
  view: () => ({ zones: { battlefield: [] } }),
};

function badgesOf(info) {
  const visual = new MiniEl('div');
  buildStateOverlay(visual, info);
  return visual.descendants()
    .filter((el) => String(el.className).includes('ovl-badge'))
    .map((el) => el.textContent);
}

function resolveStack(state) {
  for (let i = 0; i < 8; i += 1) {
    if (state.zones.stack.length === 0) break;
    assert.ok(execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId }).ok);
  }
  assert.equal(state.zones.stack.length, 0, 'stos pusty');
}

test('A3a: playerView niesie grantedKeywords po rozstrzygnięciu grantu (klasa L1/ADR 0017)', () => {
  const state = defendingCobra();
  assert.ok(execute(state, { type: 'activate_ability', playerId: 'p2', objectId: 'cobra', abilityIndex: 0 }).ok);
  resolveStack(state);
  const entry = playerView(state, 'p1').zones.battlefield.find((o) => o.id === 'cobra');
  assert.ok(entry.keywords?.includes('reach'), 'keywordy efektywne zawierają reach');
  assert.deepEqual(entry.grantedKeywords, ['reach'], 'NADANE keywordy jawnie w widoku');
});

test('A3b: kafel przez cardInfo pokazuje badge „Zasięg” (pełna ścieżka render)', () => {
  const state = defendingCobra();
  assert.ok(execute(state, { type: 'activate_ability', playerId: 'p2', objectId: 'cobra', abilityIndex: 0 }).ok);
  resolveStack(state);
  const entry = playerView(state, 'p1').zones.battlefield.find((o) => o.id === 'cobra');
  const info = cardInfo(SESSION_MOCK, { ...entry, isBattlefield: true });
  info.isBattlefield = true;
  assert.deepEqual(info.grantedKeywords, ['reach'], 'cardInfo czyta pole widoku');
  const badges = badgesOf(info);
  assert.ok(badges.some((t) => /zasięg/i.test(t)), `badge Zasięg na kaflu: [${badges}]`);
});

test('A3c (regresja m168/B pełną ścieżką): Gray Slaad — badge menace+deathtouch z WIDOKU', () => {
  const state = game('p1');
  putCard(state, 'slaad', 'gray-slaad', 'p1', 'battlefield', { summoningSickness: false });
  for (let i = 0; i < 4; i += 1) putCard(state, `dead${i}`, 'highland-game', 'p1', 'graveyard');
  const entry = playerView(state, 'p1').zones.battlefield.find((o) => o.id === 'slaad');
  assert.ok(entry.grantedKeywords?.includes('menace') && entry.grantedKeywords?.includes('deathtouch'),
    `statyki warunkowe jako granted w widoku: ${JSON.stringify(entry.grantedKeywords)}`);
  const info = cardInfo(SESSION_MOCK, { ...entry, isBattlefield: true });
  info.isBattlefield = true;
  const badges = badgesOf(info);
  assert.ok(badges.some((t) => /postrach/i.test(t)), `badge Postrach: [${badges}]`);
  assert.ok(badges.some((t) => /dotykanie śmierci/i.test(t)), `badge Dotykanie śmierci: [${badges}]`);
});
