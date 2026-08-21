// M170/C (rozszerzenie zgłoszenia C z M168) — Incubator {2}: Transform:
// kliknięcie zdolności DWUKROTNIE w tej samej turze (przed rozstrzygnięciem)
// płaci podwójnie i robi transform→re-transform — zero efektu, 4 many w błoto.
// Fix generyczny (ADR 0002): aktywacja „{N}: Transform this permanent" jest
// JEDNORAZOWA — oferta chowa zdolność, gdy jej aktywacja czeka na stosie,
// a wykonanie odrzuca przed płatnością (oferta=walidacja, L48).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { applyEffect } from '../src/engine/effects.js';

const REGISTRY = createCardRegistry();

function game() {
  const state = createGameState({ seed: 170, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  return state;
}

function incubatorInPlay(state) {
  const def = REGISTRY.get('tiller-of-flesh');
  addObject(state, {
    id: 'tiller', instanceId: 'i-t', cardId: 'tiller-of-flesh', controllerId: 'p1', ownerId: 'p1', zone: 'battlefield',
    ...gameObjectDataOf(def), types: def.types, keywords: def.keywords ?? [], subtypes: def.subtypes,
  });
  applyEffect(state, { type: 'incubate', amount: 2 }, state.objects.get('tiller'), []);
  return [...state.objects.values()].find((o) => o.cardId === 'token_incubator');
}

test('M170/C1: po pierwszej aktywacji transform DRUGA nie jest oferowana', () => {
  const state = game();
  const token = incubatorInPlay(state);
  addMana(state, 'p1', 4, { colors: ['W'] });
  const first = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === token.id);
  assert.ok(first, 'pierwsza oferta dostępna');
  assert.ok(execute(state, first).ok, 'pierwsza aktywacja');
  const second = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === token.id);
  assert.ok(!second, 'transform czeka na stosie — bez drugiej oferty (jednorazowa)');
});

test('M170/C2: ręczna druga komenda — odrzucona PRZED płatnością', () => {
  const state = game();
  const token = incubatorInPlay(state);
  addMana(state, 'p1', 4, { colors: ['W'] });
  const first = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === token.id);
  execute(state, first);
  const manaBefore = state.players.find((p) => p.id === 'p1').mana;
  const result = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: token.id, abilityIndex: 0 });
  assert.ok(!result.ok, 'druga aktywacja odrzucona');
  assert.match(result.events[0].reason, /Transform już czeka/,
    `powód nazywa przyczynę: ${result.events[0].reason}`);
  assert.equal(state.players.find((p) => p.id === 'p1').mana, manaBefore, 'mana NIE pobrana drugi raz');
});

test('M170/C3: pojedyncza aktywacja — transform rozstrzyga się poprawnie (Phyrexian 0/0 + 2)', () => {
  const state = game();
  const token = incubatorInPlay(state);
  addMana(state, 'p1', 2, { colors: ['W'] });
  const first = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === token.id);
  execute(state, first);
  for (let i = 0; i < 8; i += 1) {
    if (state.zones.stack.length === 0) break;
    execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  }
  const after = state.objects.get(token.id);
  assert.equal(after.cardId, 'token_phyrexian', 'transform do Phyrexiana');
  assert.equal(after.kind, 'creature');
  assert.equal((after.counters ?? {})['+1/+1'], 2, 'liczniki przeniesione');
  assert.equal(state.players.find((p) => p.id === 'p1').mana, 0, 'dokładnie 2 many wydane');
});

test('M170/C4: w NOWEJ turze zdolność wraca do oferty (jednorazowa per aktywnacja, nie na zawsze)', () => {
  const state = game();
  const token = incubatorInPlay(state);
  addMana(state, 'p1', 4, { colors: ['W'] });
  execute(state, playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === token.id));
  for (let i = 0; i < 8; i += 1) {
    if (state.zones.stack.length === 0) break;
    execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  }
  const phyrexian = state.objects.get(token.id);
  assert.equal(phyrexian.cardId, 'token_phyrexian');
  // Phyrexian nie MA zdolności transform (0 abilities) — brak oferty z definicji.
  assert.equal((phyrexian.abilities ?? []).length, 0, 'transformowana strona bez zdolności');
});
