import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addCounter } from '../src/engine/counters.js';
import { markDamage, replaceObject } from '../src/engine/permanents.js';
import { runStateBasedActions, addRegenerationShield } from '../src/engine/state-based.js';
import { destroyPermanentByEffect } from '../src/engine/effects.js';
const registry = createCardRegistry();
function board() {
  const s = createGameState({ seed: 54, players: [{ id: 'p1' }, { id: 'p2' }] });
  const def = registry.get('giant-spider');
  addObject(s, { ...gameObjectDataOf(def), types: def.types, id: 'host', instanceId: 'i-host',
    cardId: def.id, zone: 'battlefield', ownerId: 'p1', controllerId: 'p1' });
  return s;
}
// CR122.1c (https://mtg.wiki/page/Shield_counter, CR2026-08-07,
// fetched2026-09-08): “If this permanent would be destroyed as the result
// of an effect, instead remove a shield counter from it”. NIE lethal SBA.
for (const shields of [1, 2]) test(`B54 destruction: ${shields} shield nie chroni przed lethal po spadku toughness`, () => {
  const s = board(); markDamage(s, 'host', 3); // 2/4 przeżywa — wtedy jeszcze bez tarczy.
  addCounter(s, 'host', 'shield', shields);
  replaceObject(s, s.objects.get('host'), { toughnessModifier: -1 });
  runStateBasedActions(s);
  assert.notEqual(s.objects.get('host')?.zone, 'battlefield');
  assert.equal(s.events.some(e => e.type === 'shield_consumed'), false);
  assert.equal(s.pendingReplacementChoice, null, 'SBA nie oferuje nieistniejącego replacement');
});
test('B54 destruction: lethal SBA regeneruje bez pytania, pozostawia shield', () => {
  const s = board(); markDamage(s, 'host', 3); addCounter(s, 'host', 'shield', 1);
  addRegenerationShield(s, 'host'); replaceObject(s, s.objects.get('host'), { toughnessModifier: -1 });
  runStateBasedActions(s);
  assert.equal(s.pendingReplacementChoice, null);
  assert.equal(s.objects.get('host').damage, 0); assert.equal(s.objects.get('host').tapped, true);
  assert.equal(s.objects.get('host').counters.shield, 1); assert.deepEqual(s.regenerationShields, []);
});
test('B54 destruction: destroy efektem usuwa jedną tarczę, nie usuwa zaznaczonych obrażeń', () => {
  const s = board(); markDamage(s, 'host', 2); addCounter(s, 'host', 'shield', 2);
  const before = s.events.length;
  assert.equal(destroyPermanentByEffect(s, 'host'), false);
  assert.equal(s.objects.get('host').damage, 2); assert.equal(s.objects.get('host').counters.shield, 1);
  assert.equal(s.events.slice(before).filter(e => e.type === 'counter_removed').length, 1, 'wspólny helper, nie ręczna zmiana counters');
  assert.equal(s.events.slice(before).filter(e => e.type === 'shield_consumed').length, 1);
});
test('B54 destruction: indestructible nie zużywa tarczy ani regeneracji', () => {
  const s = board(); addCounter(s, 'host', 'shield', 1); addRegenerationShield(s, 'host');
  replaceObject(s, s.objects.get('host'), { keywords: ['indestructible'], damage: 8 });
  destroyPermanentByEffect(s, 'host'); runStateBasedActions(s);
  assert.equal(s.objects.get('host').damage, 8); assert.equal(s.objects.get('host').counters.shield, 1);
  assert.deepEqual(s.regenerationShields, ['host']);
});
