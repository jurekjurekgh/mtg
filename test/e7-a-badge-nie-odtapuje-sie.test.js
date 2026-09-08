// E7/A (zgłoszenie właściciela z testów żywej gry): Chill of the Grave — efekt
// „target creature doesn't untap during its controller's next untap step"
// DZIAŁAŁ, ale właściciel nie zobaczył na kaflu tymczasowego badge'a („chyba
// nie nadaje tymczasowego badge'a tej kreaturze. Albo przeoczyłem.").
//
// Rozpoznanie (sonda żywa, build ownera i branch): ścieżka jest KOMPLETNA —
// effects.js ustawia `dontUntapNextUntapStep` + stats_modified, playerView
// projekcjonuje flagę (M173/C), a kafel buduje badge „nie odtapuje się"
// (render.js, gałąź untapLockedNow). Test jest PINEM regresyjnym tej pełnej
// ścieżki silnik → widok → nakładka kafla, żeby żaden refactor jej nie uciął
// po cichu (klasa L1/ADR 0017: skutek bez śladu = błąd).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView, execute } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { renderMiniFace } from '../src/table/render.js';

const REGISTRY = createCardRegistry();

function putFromOracle(state, cardId, controllerId, zone, id, extra = {}) {
  const def = REGISTRY.get(cardId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def),
    types: def.types ?? [], subtypes: def.subtypes ?? [], abilities: def.abilities ?? [],
    ...extra,
  });
  return state.objects.get(id);
}

test('E7/A: Chill of the Grave — flaga w widoku i badge „nie odtapuje się" na kaflu; untap zablokowany', () => {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  putFromOracle(state, 'chill-of-the-grave', 'p1', 'hand', 'chill');
  const target = putFromOracle(state, 'midnight-guard', 'p2', 'battlefield', 'tgt');
  addMana(state, 'p1', 4, { colors: ['U', 'U', 'U', 'U'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'chill' && (c.targets ?? []).includes('tgt'));
  assert.ok(cast, 'oferta rzutu Chilla w stwora przeciwnika');
  assert.ok(execute(state, cast).ok, 'rzut przyjęty');
  for (let i = 0; i < 8 && state.zones.stack.length > 0; i++) {
    const holder = state.turn.priorityPlayerId;
    const pass = playerView(state, holder).legalCommands.find((c) => c.type === 'pass_priority');
    if (!pass || !execute(state, pass).ok) break;
  }
  // 1) Silnik: stwór tapped + flaga następnego odkręcenia.
  assert.equal(state.objects.get('tgt').tapped, true, 'cel tapped');
  assert.ok(state.objects.get('tgt').dontUntapNextUntapStep, 'flaga dontUntapNextUntapStep w stanie');
  // 2) Widok: projekcja niesie flagę (M173/C).
  const entry = playerView(state, 'p1').zones.battlefield.find((o) => o.id === 'tgt');
  assert.ok(entry?.dontUntapNextUntapStep, 'widok gracza niesie flagę');
  // 3) Nakładka kafla: badge „nie odtapuje się" (ten sam tor co renderTableView).
  const badges = [];
  class MiniEl {
    constructor(tag) { this.tagName = tag; this.children = []; this.className = ''; this.text = ''; this.src = ''; this.alt = ''; this.loading = ''; this.dataset = {}; }
    set textContent(v) { this.text = String(v); this.children = []; }
    get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
    appendChild(c) { this.children.push(c); return c; }
    addEventListener(t, l) { (this.listeners ??= {})[t] ??= []; this.listeners[t].push(l); }
    all() { return [this, ...this.children.flatMap((c) => (c.all ? c.all() : [c]))]; }
    findAll(pred) { return this.all().filter(pred); }
  }
  globalThis.document = globalThis.document ?? {};
  const oldCreate = globalThis.document.createElement;
  globalThis.document.createElement = (tag) => new MiniEl(tag);
  try {
    const el = new MiniEl('div');
    renderMiniFace(el, {
      view: () => playerView(state, 'p1'),
      cardDetails: (cardId) => REGISTRY.get(cardId) ?? null,
      colorsOf: (cardId) => REGISTRY.get(cardId)?.colors ?? [],
      nameOf: (cardId) => REGISTRY.get(cardId)?.name ?? cardId,
    }, 'tgt');
    const texts = el.findAll((n) => String(n.className).includes('ovl-badge')).map((n) => n.textContent);
    assert.ok(texts.includes('nie odtapuje się'), `badge na kaflu (badges: ${JSON.stringify(texts)})`);
  } finally {
    if (oldCreate) globalThis.document.createElement = oldCreate; else delete globalThis.document.createElement;
  }
  // 4) Untap step kontrolera celu: stwór ZOSTAJE odkręcony, flaga gaśnie po
  //    swoim jednorazowym działaniu (CR 510.1 — efekt „next untap step").
  state.turn = jumpToStep(state.turn, 'untap', 'p2');
  state.turn.activePlayerId = 'p2';
  assert.equal(state.objects.get('tgt').tapped, true, 'stwór NIE odkręca się w swoim untap step');
});
