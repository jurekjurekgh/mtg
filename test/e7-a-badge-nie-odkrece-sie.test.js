// E7/A (zgłoszenie właściciela z testów żywej gry): Chill of the Grave — efekt
// „target creature doesn't untap during its controller's next untap step"
// DZIAŁAŁ, ale właściciel nie zobaczył na kaflu tymczasowego badge'a („chyba
// nie nadaje tymczasowego badge'a tej kreaturze. Albo przeoczyłem.").
//
// Rozpoznanie (sonda żywa, build ownera i branch): ścieżka jest KOMPLETNA —
// effects.js ustawia `dontUntapNextUntapStep` + stats_modified, playerView
// projekcjonuje flagę (M173/C), a kafel buduje badge „nie odkręca się"
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

test('E7/A: Chill of the Grave — flaga w widoku i badge „nie odkręca się" na kaflu; untap zablokowany', () => {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  putFromOracle(state, 'chill-of-the-grave', 'p1', 'hand', 'chill');
  // Chill dobiera: bez biblioteki stary test sprawdzał już zakończoną grę.
  putFromOracle(state, 'basic-island', 'p1', 'library', 'draw');
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
  // 3) Nakładka kafla: badge „nie odkręca się" (ten sam tor co renderTableView).
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
    assert.ok(texts.includes('nie odkręca się'), `badge na kaflu (badges: ${JSON.stringify(texts)})`);
  } finally {
    if (oldCreate) globalThis.document.createElement = oldCreate; else delete globalThis.document.createElement;
  }
  // Oracle (pobrane 2026-09-08): "It doesn't untap during its controller's
  // next untap step." https://api.scryfall.com/cards/named?exact=Chill%20of%20the%20Grave
  // Rulingi tej karty dotyczą tylko kosztu (2021-11-19).
  // CR 502.3: "Normally, all of a player’s permanents untap, but effects can
  // keep one or more of a player’s permanents from untapping."
  // https://mtg.wiki/page/Beginning_phase (pobrane 2026-09-08).
  // jumpToStep SAM nie wykonuje untapu: przechodzimy przez execute i beginTurn.
  const nextTurn = () => {
    assert.equal(state.status, 'active');
    state.turn = jumpToStep(state.turn, 'cleanup', state.turn.activePlayerId);
    for (let i = 0; i < 2; i++) {
      assert.ok(execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId }).ok);
    }
    assert.equal(state.turn.step, 'upkeep', 'untap wykonany, priorytet dopiero w upkeepie');
  };
  nextTurn();
  assert.equal(state.turn.activePlayerId, 'p2');
  assert.equal(state.objects.get('tgt').tapped, true, 'pierwszy untap nie odkręca');
  assert.equal(state.objects.get('tgt').dontUntapNextUntapStep, null, 'jednorazowa flaga zużyta');
  assert.ok(!playerView(state, 'p1').zones.battlefield.find(o => o.id === 'tgt').dontUntapNextUntapStep);
  nextTurn(); // tura p1, nie odkręca cudzego stwora
  assert.equal(state.objects.get('tgt').tapped, true);
  nextTurn(); // drugi untap p2 już normalny
  assert.equal(state.objects.get('tgt').tapped, false);
});
