// PMSSB-48 (2026-10-03i): karty rzucone za Warp muszą być JAWNIE oznaczone
// w logu i na kaflu (badge), żeby gracz wiedział, że zostaną wygnane na
// najbliższy krok końcowy (zgłoszenie A właściciela: nie odróżniał Warp od
// zwykłego rzutu). Trzy piny:
//   W1 — permanent_cast event ma `warped: true` i log brzmi "(za Warp)"
//   W2 — PlayerView permanentu na polu bitwy ma `enteredViaWarp: true`
//   W3 — badge "Warp · wygnanie na EOT" w overlay kafla
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { describeGameEvent, PLAYER_NAMES } from '../src/table/session.js';
import { buildStateOverlay } from '../src/table/render.js';

const R = createCardRegistry();
const cardDef = (cid) => R.get(cid);

function put(state, id, cid, ctl, zone, patch = {}) {
  const d = cardDef(cid);
  addObject(state, {
    id, instanceId: 'i-' + id, cardId: cid, controllerId: ctl, ownerId: ctl, zone,
    ...gameObjectDataOf(d), types: d.types ?? [], keywords: d.keywords ?? [],
    subtypes: d.subtypes ?? [], spell: d.spell, manaCost: d.manaCost,
    warp: d.warp ? { ...d.warp } : undefined, abilities: d.abilities ?? [],
  });
  if (Object.keys(patch).length) {
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
  }
}

// Helpers dla describeGameEvent (ten sam kształt co używa createSession).
const HELPERS = {
  nameOf: (cid) => cid,
  nameOfObject: (id) => id,
  isPlayer: (id) => id === 'p1' || id === 'p2',
};
function fmt(evt) {
  return describeGameEvent(evt, HELPERS, PLAYER_NAMES, { drugaOsoba: false, fogOfWar: false });
}

describe('PMSSB-48: Warp cast dostaje (a) frazę w logu, (b) pole widoku, (c) badge kafla', () => {
  it('W1 permanent_cast z warped:true ma w logu suffix "(za Warp)"', () => {
    const evt = {
      type: 'permanent_cast', playerId: 'p1', faceDown: false, warped: true,
      object: { cardId: 'weftblade-enhancer' },
      manaSpent: 0, phyrexianSymbols: 0, phyrexianPaidWithLife: 0, manaFromTreasureSpent: 0,
    };
    const line = fmt(evt);
    assert.match(line, /zagrywa weftblade-enhancer.*\(za Warp\)/, `log powinien zawierać "(za Warp)": ${line}`);
  });

  it('W1b permanent_cast BEZ warp nie ma suffixu (kontrola negatywna)', () => {
    const evt = {
      type: 'permanent_cast', playerId: 'p1', faceDown: false, warped: false,
      object: { cardId: 'goblin-piker' },
      manaSpent: 0, phyrexianSymbols: 0, phyrexianPaidWithLife: 0, manaFromTreasureSpent: 0,
    };
    const line = fmt(evt);
    assert.doesNotMatch(line, /za Warp/);
  });

  it('W2 PlayerView permanentu z warped:true ma enteredViaWarp:true', () => {
    const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
    state.turn = { ...jumpToStep(state.turn, 'main', 'p1'), activePlayerId: 'p1', priorityPlayerId: 'p1' };
    // Symulacja: permanent na polu bitwy z warped:true (tak jak ustawia
    // resources.js po warp_cast + resolvePermanentSpell).
    put(state, 'w', 'weftblade-enhancer', 'p1', 'battlefield', { kind: 'creature', warped: true, summoningSickness: true, tapped: false });
    const v = playerView(state, 'p1');
    const w = v.zones.battlefield.find((o) => o.id === 'w');
    assert.ok(w, 'permanent jest na polu bitwy');
    assert.equal(w.enteredViaWarp, true, 'warp flaga jest w widoku');
  });

  it('W2b zwykły permanent (bez warped) nie ma enteredViaWarp', () => {
    const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
    state.turn = { ...jumpToStep(state.turn, 'main', 'p1'), activePlayerId: 'p1', priorityPlayerId: 'p1' };
    put(state, 'g', 'goblin-piker', 'p1', 'battlefield', { kind: 'creature', summoningSickness: false, tapped: false });
    const v = playerView(state, 'p1');
    const g = v.zones.battlefield.find((o) => o.id === 'g');
    assert.ok(g, 'permanent jest na polu bitwy');
    assert.notEqual(g.enteredViaWarp, true, 'flaga warpu nie powinna być ustawiona');
  });

  it('W3 badge overlay zawiera "Warp · wygnanie na EOT" dla enteredViaWarp', () => {
    // Wzorzec jak test/audyt-pmssb41: MiniEl-stub document (bez jsdom).
    class MiniEl {
      constructor(tag) { this.tagName = tag; this.children = []; this.className = ''; this.text = ''; }
      set textContent(v) { this.text = String(v); this.children = []; }
      get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
      appendChild(c) { this.children.push(c); return c; }
      descendants() { return this.children.flatMap((c) => [c, ...c.descendants()]); }
    }
    const prevDoc = globalThis.document;
    globalThis.document = { createElement: (tag) => new MiniEl(tag) };
    try {
      const el = new MiniEl('div');
      buildStateOverlay(el, {
        isBattlefield: true, kind: 'creature', livePower: 3, liveToughness: 4,
        powerMod: 0, toughMod: 0, counters: {}, enteredViaWarp: true,
        grantedKeywords: [], lostKeywordsUntilEOT: [], subtypesAdded: [],
        types: ['Creature'],
      });
      const badges = el.descendants()
        .filter((e) => String(e.className).split(' ').includes('ovl-badge'))
        .map((e) => e.textContent);
      assert.ok(badges.includes('Warp · wygnanie na EOT'), `badge warp musi być wśród ${JSON.stringify(badges)}`);
    } finally {
      if (prevDoc) globalThis.document = prevDoc; else delete globalThis.document;
    }
  });
});
