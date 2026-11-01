// Zgłoszenie R: prawdziwa aura → playerView → cardInfo → nakładka kafla.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { cardInfo, buildStateOverlay } from '../src/table/render.js';

const REGISTRY = createCardRegistry();

/** Minimalna sesja dla `cardInfo` (wzorzec `audit-m83-tester.test.js`). */
const SESSION = {
  nameOf: (cardId) => REGISTRY.get(cardId)?.name ?? cardId,
  nameOfObject: (o) => REGISTRY.get(o?.cardId)?.name ?? o?.id,
  abilitiesOf: () => [],
  cardDetails: (cardId) => REGISTRY.get(cardId) ?? null,
  colorsOf: (cardId) => REGISTRY.get(cardId)?.colors ?? [],
  view: () => ({ zones: { battlefield: [], hand: [], graveyard: [], exile: [] } }),
};

function game() {
  const state = createGameState({ seed: 11, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.phase = 'precombat_main';
  state.turn.step = 'main1';
  state.turn.number = 5;
  return state;
}

function put(state, id, cardId, ctrl, zone = 'battlefield', extra = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: ctrl, ownerId: ctrl, zone,
    ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes ?? [],
    keywords: def.keywords ?? [], cardName: def.name, ...extra,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

function resolve(state) {
  for (let i = 0; state.zones.stack.length && i < 40; i += 1) {
    const cmd = playerView(state, state.turn.priorityPlayerId).legalCommands
      .find((c) => c.type === 'pass_priority');
    assert.ok(cmd, 'gracz z priorytetem ma co zrobić');
    assert.ok(execute(state, cmd).ok, 'priorytet przechodzi');
  }
  assert.equal(state.zones.stack.length, 0, 'stos rozstrzygnięty');
}

/** Rzuca aurę z ręki na wskazany cel — realną ofertą (cele z widoku). */
function castAuraOn(state, auraId, targetId) {
  const cmd = playerView(state, 'p1').legalCommands
    // Aura to permanent — oferta ma typ `cast_permanent` (nie `cast_spell`).
    .find((c) => c.type === 'cast_permanent' && c.objectId === auraId && c.targets?.[0] === targetId);
  assert.ok(cmd, `oferta rzucenia ${auraId} na ${targetId}`);
  assert.ok(execute(state, cmd).ok, 'rzut przyjęty');
  resolve(state);
}

import { destroyPermanents } from '../src/engine/destruction.js';

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
    .filter((el) => String(el.className).includes('ovl-badge') && el.children.length === 0)
    .map((el) => el.textContent);
};

function tile(state, viewer) {
  const entry = playerView(state, viewer).zones.battlefield.find(o => o.id === 'host');
  const info = cardInfo(SESSION, entry);
  return { entry, info, badges: badgesOf(info) };
}
function setup({ tapped = false, controller = 'p1' } = {}) {
  const state = game();
  for (let i = 0; i < 4; i++) put(state, `m${i}`, 'basic-mountain', 'p1');
  put(state, 'host', 'alaborn-trooper', controller, 'battlefield');
  if (tapped) state.objects.set('host', Object.freeze({ ...state.objects.get('host'), tapped: true }));
  put(state, 'aura', 'infectious-bloodlust', 'p1', 'hand');
  castAuraOn(state, 'aura', 'host');
  return state;
}
const label = 'Atakuje w każdej turze jeśli może';

test('R/1: po rzuceniu Bloodlust obaj gracze widzą wymóg ataku na gospodarzu', () => {
  const state = setup({ controller: 'p2', tapped: true });
  for (const viewer of ['p1', 'p2']) {
    const { entry, info, badges } = tile(state, viewer);
    assert.equal(entry.mustAttackFromAttachment, true);
    assert.equal(info.mustAttackFromAttachment, true);
    assert.ok(badges.includes(label), `${viewer}: ${badges}`);
    assert.ok(badges.includes('+2/+1'), 'inne badge efektu aury pozostają');
  }
});

test('R/2: po zniszczeniu aury badge znika, bez zmiany gospodarza', () => {
  const state = setup();
  const aura = [...state.objects.values()].find(o => o.cardId === 'infectious-bloodlust' && o.zone === 'battlefield');
  assert.ok(tile(state, 'p1').badges.includes(label));
  assert.ok(destroyPermanents(state, [aura.id]));
  assert.notEqual(tile(state, 'p1').entry.mustAttackFromAttachment, true);
  assert.ok(!tile(state, 'p1').badges.includes(label));
});

test('R/3: dwa źródła dają jeden badge; po utracie jednego nadal jest', () => {
  const state = setup();
  put(state, 'aura2', 'infectious-bloodlust', 'p1', 'hand');
  castAuraOn(state, 'aura2', 'host');
  const auras = [...state.objects.values()].filter(o => o.cardId === 'infectious-bloodlust' && o.zone === 'battlefield');
  assert.equal(auras.length, 2);
  assert.equal(tile(state, 'p1').badges.filter(b => b === label).length, 1);
  assert.ok(destroyPermanents(state, [auras[0].id]));
  assert.equal(tile(state, 'p1').badges.filter(b => b === label).length, 1);
  assert.ok(destroyPermanents(state, [auras[1].id]));
  assert.ok(!tile(state, 'p1').badges.includes(label));
});
