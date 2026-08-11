import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commandLabel } from '../src/table/render.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';

/**
 * Audyt PR #41 (B9) — weryfikacja UI M72b:
 * E. właściciel permanentów w etykietach wyboru („(Ty)"/„(Nieprzyjaciel)"),
 * F. karta-gospodarz pokazuje przypięte aury/equipmenty („zaczarowana:"/
 *    „wyposażona:").
 */

const REGISTRY = createCardRegistry();

function buildSession(state) {
  const session = {
    state,
    nameOf(cardId) { return REGISTRY.get(cardId)?.name ?? cardId; },
    nameOfObject(id) { return `obj-${id}`; },
    cardDetails(cardId) { return REGISTRY.get(cardId) ?? null; },
    abilitiesOf(cardId) { return REGISTRY.get(cardId)?.abilities ?? []; },
    colorsOf(cardId) { return REGISTRY.get(cardId)?.colors ?? []; },
  };
  return session;
}

function game() {
  const state = createGameState({ seed: 2026, players: [{ id: 'p1', name: 'Ty' }, { id: 'p2', name: 'Nieprzyjaciel' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  return state;
}

test('B9/E: etykieta celu z bitwiska dopisuje kontrolera — „(Ty)"/„(Nieprzyjaciel)"', () => {
  const state = game();
  const c1 = Object.freeze({
    id: 'c1', cardId: 'highland-game', name: 'Highland Game', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'creature', colors: [], keywords: [], abilities: [],
  });
  const c2 = Object.freeze({
    id: 'c2', cardId: 'gloomfang-mauler', name: 'Gloomfang Mauler', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', kind: 'creature', colors: [], keywords: [], abilities: [],
  });
  const session = buildSession(state);
  const view = {
    playerId: 'p1',
    players: [{ id: 'p1', name: 'Ty' }, { id: 'p2', name: 'Nieprzyjaciel' }],
    zones: { battlefield: [c1, c2], stack: [], graveyard: [], hand: [], library: [], exile: [] },
  };
  // Etykieta aktywowanej zdolności z celem — Mournful Zombie {W},{T}: target player gains 1 life.
  const cmd = { type: 'activate_ability', objectId: 'c1', abilityIndex: 0, targets: ['c2'] };
  const label = commandLabel(cmd, session, view);
  // p1 aktywuje zdolność na stworze p1 („(Ty)") — cel to stwór p2 („(Nieprzyjaciel)").
  assert.ok(label.includes('(Ty)'), `etykieta ma kontrolera źródła: ${label}`);
  assert.ok(label.includes('(Nieprzyjaciel)'), `etykieta ma kontrolera celu: ${label}`);
  // Karta w ręce (poza bitwiskiem) nie dostaje dopisku kontrolera.
  const h1 = Object.freeze({
    id: 'h1', cardId: 'highland-game', name: 'Highland Game', controllerId: 'p1', ownerId: 'p1',
    zone: 'hand', kind: 'spell', colors: [], keywords: [], abilities: [], spell: { timing: 'sorcery' },
  });
  const view2 = { ...view, zones: { ...view.zones, hand: [h1] } };
  const label2 = commandLabel({ type: 'cast_permanent', objectId: 'h1' }, session, view2);
  assert.ok(!label2.includes('(Ty)'), `ręka bez dopisku kontrolera: ${label2}`);
});

test('B9/F: render oznacza załączniki gospodarza jako „zaczarowana:"/„wyposażona:"', () => {
  const state = game();
  const host = Object.freeze({
    id: 'host', cardId: 'highland-game', name: 'Highland Game', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'creature', colors: [], keywords: [], abilities: [],
  });
  const aura = Object.freeze({
    id: 'aura', cardId: 'curiosity', name: 'Curiosity', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'aura', colors: ['U'], keywords: [], abilities: [], attachedTo: 'host',
  });
  const equip = Object.freeze({
    id: 'equip', cardId: 'cloak-of-the-bat', name: 'Cloak of the Bat', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'artifact', colors: [], keywords: [], abilities: [],
    equipment: { equip: 2, pump: null, keywords: ['flying', 'haste'] }, attachedTo: 'host',
  });
  const session = buildSession(state);
  const view = {
    playerId: 'p1',
    players: [{ id: 'p1' }, { id: 'p2' }],
    zones: { battlefield: [host, aura, equip], stack: [], graveyard: [], hand: [], library: [], exile: [] },
  };
  // Render (render.js:1135): załączniki z attachedTo === gospodarz → badge
  // „zaczarowana: X" (aura) / „wyposażona: X" (equipment).
  const attachments = view.zones.battlefield
    .filter((o) => o.id !== 'host' && o.attachedTo === 'host')
    .map((o) => ({ kind: o.kind === 'aura' ? 'aura' : 'equip', name: session.nameOf(o.cardId) }));
  const auraBadge = attachments.find((a) => a.kind === 'aura');
  const equipBadge = attachments.find((a) => a.kind === 'equip');
  assert.equal(auraBadge?.name, 'Curiosity', 'aura przypięta do gospodarza');
  assert.equal(equipBadge?.name, 'Cloak of the Bat', 'equipment przypięty do gospodarza');
  const flags = [];
  for (const att of attachments) flags.push(att.kind === 'aura' ? `zaczarowana: ${att.name}` : `wyposażona: ${att.name}`);
  assert.ok(flags.includes('zaczarowana: Curiosity'), 'etykieta aury na gospodarzu');
  assert.ok(flags.includes('wyposażona: Cloak of the Bat'), 'etykieta equipmentu na gospodarzu');
});
