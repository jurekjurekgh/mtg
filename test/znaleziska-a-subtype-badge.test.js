// F-A (znalezisko właściciela 2026-09-09): Wishful Merfolk — zdolność
// {1}{U} zdejmuje defender (badge „bez: obrońca" był) i „becomes a Human
// until end of turn". Drugi skutek (nadpisanie podtypu na Human DO KOŃCA
// TURY) nie był pokazywany jako badge — typ-line już czytał „Human", ale nie
// sygnalizował, że to stan czasowy. Root cause: subtypesBeforeOverride istniał
// tylko w stanie, nie w PlayerView, więc warstwa opisu nie odróżniała
// czasowego nadpisania podtypu od trwałego (ADR 0017).
//
// Fix: view battlefield entry niesie subtypesBeforeOverride (active),
// cardInfo → subtypesOverride, buildStateOverlay dorzuca badge
// „typ: <podtyp> do końca tury" (jak tempControlNow/untapLockedNow).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { buildStateOverlay } from '../src/table/render.js';

const REGISTRY = createCardRegistry();

function game(playerId = 'p1') {
  const state = createGameState({ seed: 9001, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
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

class MiniEl {
  constructor(tag) { this.tagName = tag; this.children = []; this.className = ''; this.text = ''; }
  set textContent(v) { this.text = String(v); this.children = []; }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  appendChild(c) { this.children.push(c); return c; }
  descendants() { return this.children.flatMap((c) => [c, ...c.descendants()]); }
}
globalThis.document = { createElement: (tag) => new MiniEl(tag) };

const badgesOf = (info) => {
  const visual = new MiniEl('div');
  buildStateOverlay(visual, info);
  return visual.descendants()
    .filter((el) => String(el.className).includes('ovl-badge'))
    .map((el) => el.textContent);
};

function activateAbility(state, objectId, playerId, manaAmount = 2) {
  addMana(state, playerId, manaAmount, { colors: ['U'] });
  const offer = playerView(state, playerId).legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === objectId);
  assert.ok(offer, `aktywacja ${objectId} oferowana`);
  assert.ok(execute(state, offer).ok, 'aktywacja przyjęta');
  for (let i = 0; i < 20 && state.zones.stack.length > 0; i += 1) {
    execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  }
}

test('F-A: Wishful Merfolk — po aktywacji podtypy = Human, nadpisanie w widoku', () => {
  const state = game('p1');
  const wm = putCard(state, 'wm', 'wishful-merfolk', 'p1', 'battlefield');
  activateAbility(state, 'wm', 'p1');
  const obj = state.objects.get(wm.id);
  assert.deepEqual(obj.subtypes, ['Human'], 'podtypy nadpisane na Human (do EOT)');
  assert.deepEqual(obj.subtypesBeforeOverride, ['Merfolk'], 'zapamiętany oryginał');
  assert.ok((obj.lostKeywordsUntilEOT ?? []).includes('defender'), 'defender stracony do EOT');
  // ADR 0017: widok niesie nadpisanie — warstwa opisu może je pokazać.
  const entry = playerView(state, 'p1').zones.battlefield.find((o) => o.id === wm.id);
  assert.deepEqual(entry.subtypesBeforeOverride, ['Merfolk'], 'nadpisanie w PlayerView');
});

test('F-A: Wishful Merfolk — badge „typ: Human do końca tury" na nakładce', () => {
  const badges = badgesOf({
    isBattlefield: true, kind: 'creature',
    subtypes: ['Human'], subtypesOverride: true,
    lostKeywordsUntilEOT: ['defender'], grantedKeywords: [],
    cantBlockNow: false, cantBeBlockedNow: false,
    counters: {}, powerMod: 0, toughMod: 0,
  });
  assert.ok(badges.some((t) => t === 'typ: Human do końca tury'),
    `badge podtypu-czasowego: [${badges}]`);
});

test('F-A: Wishful Merfolk — bez nadpisania (karta zwykła) brak badge „typ ... do końca tury"', () => {
  const badges = badgesOf({
    isBattlefield: true, kind: 'creature',
    subtypes: ['Merfolk'], subtypesOverride: false,
    lostKeywordsUntilEOT: [], grantedKeywords: [],
    cantBlockNow: false, cantBeBlockedNow: false,
    counters: {}, powerMod: 0, toughMod: 0,
  });
  assert.ok(!badges.some((t) => t.includes('do końca tury') && t.includes('typ:')),
    `spokojna karta nie pokazuje badge czasowego podtypu: [${badges}]`);
});
