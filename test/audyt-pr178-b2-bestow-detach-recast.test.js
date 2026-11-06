// Audyt PR #178, B2: bestow kończy się także przez odłączenie (CR 702.103f),
// nie tylko przez zmianę strefy. Po śmierci gospodarza Dryada jest znów stworem
// z wydrukowanym deskryptorem; późniejsze odbicie i zwykły rzut nie mogą
// odziedziczyć deskryptora aury z poprzedniego bestowed rzutu (CR 400.7).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createCardDeck } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { stateFingerprint } from '../src/engine/fingerprint.js';

const reg = createCardRegistry();
function put(s, id, card, zone = 'hand', player = 'p1') {
  const [{ objectId, ...data }] = createCardDeck({ cardIds: [card], ownerId: player, registry: reg });
  addObject(s, { ...data, id, instanceId: `i-${id}`, zone, controllerId: player });
}
const view = s => playerView(s, s.turn.priorityPlayerId);
function act(s, c) {
  assert.ok(c, JSON.stringify(view(s).legalCommands));
  const r = execute(s, c);
  assert.ok(r.ok, JSON.stringify(r));
  return r;
}
function drain(s, preferredTargetId = null) {
  for (let i = 0; i < 80 && (s.zones.stack.length || view(s).legalCommands.some(c => c.type === 'resolve_trigger_target')); i++) {
    const cmds = view(s).legalCommands;
    const target = cmds.find(c => c.type === 'resolve_trigger_target'
      && (preferredTargetId == null || c.targetId === preferredTargetId));
    act(s, target ?? cmds.find(c => c.type === 'pass_priority'));
  }
  assert.equal(s.zones.stack.length, 0);
}
const find = (s, id, zone) => [...s.objects.values()].find(o => o.instanceId === `i-${id}` && o.zone === zone);
function scene() {
  const s = createGameState({ seed: 17802, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main1', 'p1');
  s.turn.activePlayerId = s.turn.priorityPlayerId = 'p1';
  put(s, 'host', 'highland-game', 'battlefield', 'p2');
  put(s, 'dryad', 'leafcrown-dryad');
  put(s, 'shock', 'shock');
  put(s, 'shock2', 'shock');
  put(s, 'jelly', 'man-o-war');
  put(s, 'neg', 'negate', 'hand', 'p2');
  addMana(s, 'p1', 30, { colors: ['W', 'U', 'B', 'R', 'G'] });
  addMana(s, 'p2', 4, { colors: ['U'] });
  return s;
}
function castBestow(s) {
  act(s, view(s).legalCommands.find(c => c.objectId === 'dryad' && c.bestow && c.targets?.[0] === 'host'));
  drain(s);
  const d = find(s, 'dryad', 'battlefield');
  assert.equal(d.kind, 'aura');
  assert.equal(d.attachedTo, 'host');
  // Po B1 deskryptor czaru aury żyje na stosie; permanent na polu nie musi
  // go nieść. Ważne, że późniejsze odłączenie/odbicie nie odzyskuje aury.
  return d;
}
function detachByKillingHost(s) {
  const d = castBestow(s);
  // Leafcrown Dryad daje gospodarzowi +2/+2, więc pojedynczy Shock nie wystarcza.
  for (const id of ['shock', 'shock2']) {
    act(s, view(s).legalCommands.find(c => c.type === 'cast_spell' && c.objectId === id && c.targets?.[0] === 'host'));
    drain(s);
  }
  assert.ok(!find(s, 'host', 'battlefield'), 'gospodarz ginie od dwóch Shocków');
  const creature = find(s, 'dryad', 'battlefield');
  assert.ok(creature, 'bestow po odłączeniu zostaje na polu jako stwór');
  assert.equal(creature.kind, 'creature');
  assert.equal(creature.attachedTo, null);
  return creature;
}
function bounceDetached(s, creature) {
  act(s, view(s).legalCommands.find(c => c.type === 'cast_permanent' && c.objectId === 'jelly'));
  // Man-o'-War wybiera cel ETB; interesuje nas odbicie odłączonej Dryady.
  drain(s, creature.id);
  const hand = find(s, 'dryad', 'hand');
  assert.ok(hand, 'Man-o\'War odbija Dryadę do ręki');
  return hand;
}
function bounceDryad(s) {
  return bounceDetached(s, detachByKillingHost(s));
}
function negateOffers(s) {
  return playerView(s, 'p2').legalCommands.filter(c => c.type === 'cast_spell' && c.objectId === 'neg');
}

test('B2: odłączenie bestow przywraca wydrukowany deskryptor, a ponowny zwykły rzut jest czarem stwora', () => {
  const s = scene();
  const creature = detachByKillingHost(s);
  assert.notEqual(creature.spell?.aura, true, 'po ustaniu bestow permanent nie niesie deskryptora czaru aury');
  assert.equal(creature.bestowOriginalSpell ?? null, null, 'nie zostaje zapasowy deskryptor do późniejszego resetu');

  const hand = bounceDetached(s, creature);
  assert.notEqual(hand.spell?.aura, true, 'odbicie odłączonego stwora nie dziedziczy aury');
  act(s, view(s).legalCommands.find(c => c.objectId === hand.id && c.type === 'cast_permanent' && !c.bestow));
  const stack = find(s, 'dryad', 'stack');
  assert.equal(stack.kind, 'creature');
  assert.notEqual(stack.spell?.aura, true);
  act(s, { type: 'pass_priority', playerId: 'p1' });
  assert.ok(!negateOffers(s).some(c => c.targets?.includes(stack.id)), 'Negate nie oferuje zwykłego czaru stwora');
  const before = stateFingerprint(s);
  const rejected = execute(s, { type: 'cast_spell', playerId: 'p2', objectId: 'neg', targets: [stack.id] });
  assert.equal(rejected.ok, false);
  assert.equal(stateFingerprint(s), before, 'odrzucona kontra jest atomowa');
  drain(s);
  const permanent = find(s, 'dryad', 'battlefield');
  assert.equal(permanent.kind, 'creature');
  assert.equal(permanent.attachedTo, null);
  assert.notEqual(permanent.spell?.aura, true);
});

test('B2: po odłączeniu i odbiciu można ponownie rzucić Dryadę za bestow', () => {
  const s = scene();
  // Drugi gospodarz pozwala sprawdzić ponowny bestow po pełnej pętli.
  put(s, 'host2', 'highland-game', 'battlefield', 'p2');
  const hand = bounceDryad(s);
  act(s, view(s).legalCommands.find(c => c.objectId === hand.id && c.bestow && c.targets?.[0] === 'host2'));
  const stack = find(s, 'dryad', 'stack');
  assert.equal(stack.kind, 'aura');
  assert.equal(stack.spell?.aura, true);
  act(s, { type: 'pass_priority', playerId: 'p1' });
  assert.ok(negateOffers(s).some(c => c.targets?.includes(stack.id)), 'bestow nadal jest nie-stworowym czarem aury');
  act(s, { type: 'cast_spell', playerId: 'p2', objectId: 'neg', targets: [stack.id] });
  drain(s);
  assert.ok(find(s, 'dryad', 'graveyard'));
  assert.equal(find(s, 'host2', 'battlefield').attachments?.length ?? 0, 0);
});

test('B2 kontrola: odłączenie nie usuwa samego bestow z karty ani nie zmienia gospodarza', () => {
  const s = scene();
  const creature = detachByKillingHost(s);
  assert.ok(creature.bestow, 'wydrukowana zdolność bestow pozostaje');
  assert.ok((creature.types ?? []).includes('Creature'));
  assert.ok(!(creature.types ?? []).includes('Enchantment') || (creature.subtypes ?? []).includes('Aura') === false,
    'linia typów wraca do wydrukowanej Enchantment Creature, nie Aura');
  assert.ok(find(s, 'host', 'graveyard'));
});
