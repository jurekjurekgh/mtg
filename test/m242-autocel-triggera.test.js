// M242 (zgłoszenie H z listy 2026-08-27, Breaching Hippocamp ETB, „untap
// another target creature you control"): gdy WYMAGANY trigger celowy ma DO-
// KLADNIE JEDNEGO legalnego kandydata, silnik nie ma czego pytać gracza —
// cel wybiera się automatycznie (CR 115.1d-owaty duch + polityka stołu jak
// auto-gang blokery tematu walki). Dotychczas otwierał się modal z jednym
// przyciskiem do kliknięcia (mielenie UI). Autowybór musi:
//  - NIE dotykać triggerów opcjonalnych („you may"/„up to one", allowNone),
//  - NIE dotykać triggerów z więcej niż jednym kandydatem (modal zostaje),
//  - utrzymać trigger na stosie (odpowiedź przeciwnika jak dawniej).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState, execute, playerView, addObject } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';

const REGISTRY = createCardRegistry();

function game() {
  const state = createGameState({ seed: 11, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  for (const pid of ['p1', 'p2']) addMana(state, pid, 20, { U: 4, G: 4, B: 4, R: 4, W: 4 });
  return state;
}

function putCreature(state, id, cardId, controllerId, { tapped = false } = {}) {
  const def = REGISTRY.get(cardId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone: 'battlefield', kind: 'creature',
    manaCost: def.manaCost ?? 0, power: def.power ?? 0, toughness: def.toughness ?? 1,
    types: ['Creature'], subtypes: def.subtypes ?? [], abilities: def.abilities ?? [], keywords: def.keywords ?? [],
  });
  // L21: stan bojowy nadajemy PO dodaniu (addObject kasa ostrzega o polach poza kontraktem).
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false, tapped }));
}

function putInHand(state, id, cardId, controllerId) {
  const def = REGISTRY.get(cardId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone: 'hand',
    kind: (def.types ?? []).includes('Creature') ? 'creature' : ((def.types ?? []).includes('Artifact') ? 'artifact' : 'spell'),
    manaCost: def.manaCost ?? 0, power: def.power ?? 0, toughness: def.toughness ?? 1,
    types: def.types ?? ['Creature'], subtypes: def.subtypes ?? [], colors: def.colors ?? [],
    abilities: def.abilities ?? [], keywords: def.keywords ?? [], spell: def.spell ?? null,
  });
}

function castAtHippocamp(state) {
  putInHand(state, 'hip', 'breaching-hippocamp', 'p1');
  // Mana z puli wolnej (game() ładuje po 20/kolor).
  const offer = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_permanent' && c.objectId === 'hip');
  assert.ok(offer, 'Hippocamp rzucalny z ręki');
  assert.ok(execute(state, offer).ok, 'rzut przyjęty');
  // Rozstrzygnięcie: po rzucie priorytet wraca do RZUCAJĄCEGO (p1), potem p2.
  const pass1 = execute(state, { type: 'pass_priority', playerId: 'p1' });
  if (!pass1.ok) return pass1;
  return execute(state, { type: 'pass_priority', playerId: 'p2' });
}

test('M242/1: wymagany trigger celowy z JEDNYM kandydatem — autowybór, ani jednej oferty resolve_trigger_target', () => {
  const state = game();
  putCreature(state, 'own-a', 'highland-game', 'p1', { tapped: true });
  const res = castAtHippocamp(state);
  assert.ok(res.ok, res.events?.map((e) => e.reason).join(''));
  const hipBf = [...state.objects.values()].find((o) => o.cardId === 'breaching-hippocamp' && o.zone === 'battlefield');
  assert.ok(hipBf, 'hippocamp wszedł na pole bitwy');
  assert.equal(
    state.pendingTriggerTargets.length, 0,
    'jedyny legalny kandydat = decyzji NIE kolejkujemy (zgłoszenie H: modal z jednym przyciskiem do kliknięcia to szum)',
  );
  const offers = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'resolve_trigger_target');
  assert.equal(offers.length, 0, 'żadnej oferty celu — wszystko pójło automatycznie');
  // Rozstrzał zaparkowany na STOSIE z wybranym celem (odpowiedź jak dawniej).
  const triggerEntry = state.zones.stack
    .map((id) => state.objects.get(id))
    .find((o) => o?.kind === 'trigger' && o.cardId === 'breaching-hippocamp');
  assert.ok(triggerEntry, 'trigger na stosie');
  assert.deepEqual(triggerEntry.triggerEntry.targets, ['own-a'], 'jedyny kandydat trafił na stos jako cel');
  const autoEvt = state.events.find((e) => e.type === 'trigger_target_resolved' && e.cardId === 'breaching-hippocamp');
  assert.ok(autoEvt, 'zdarzenie rozstrzygnięcia celu zeszło');
  assert.equal(autoEvt.targetId, 'own-a');
  assert.equal(autoEvt.auto, true, 'payload oznaczony jako autowybór (log zawiera dopisek)');
});

test('M242/2: dwaj kandydaci — modal ZOSTAJE (brak autowyboru)', () => {
  const state = game();
  putCreature(state, 'own-a', 'highland-game', 'p1', { tapped: true });
  putCreature(state, 'own-b', 'highland-game', 'p1', { tapped: true });
  const res = castAtHippocamp(state);
  assert.ok(res.ok, res.events?.map((e) => e.reason).join(''));
  assert.equal(state.pendingTriggerTargets.length, 1, 'następna decyzja — cel triggera');
  const offers = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'resolve_trigger_target');
  assert.equal(offers.length, 2, 'dwoje legalnych kandydatów = dwie oferty');
});

test('M242/3: trigger OPCJONALNY („you may"/„up to one") z jednym kandydatem — modal ZOSTAJE (nigdy automatycznie zgody)', () => {
  const state = game();
  putCreature(state, 'foe-a', 'highland-game', 'p2');
  const ability = REGISTRY.get('lodestone-needle').abilities[0];
  assert.ok(ability.trigger.requiresTarget.optional, 'Lodestone Needle ma opcjonalny cel („up to one")');
  // Pełny flow rzutu (jak /1): gałąź auto przy queueTargetDecision MUSI przepuścić opcjonalny cel.
  putInHand(state, 'needle', 'lodestone-needle', 'p1');
  const offer = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_permanent' && c.objectId === 'needle');
  assert.ok(offer, 'Lodestone Needle rzucalny');
  assert.ok(execute(state, offer).ok, 'rzut przyjęty');
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok);
  const res = execute(state, { type: 'pass_priority', playerId: 'p2' });
  assert.ok(res.ok, res.events?.map((e) => e.reason).join(''));
  assert.equal(state.pendingTriggerTargets.length, 1, 'opcjonalny cel nigdy nie idzie autematycznie — decyzja o zgodzie to treść');
  const offers = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'resolve_trigger_target');
  assert.ok(offers.some((c) => c.targetId === 'foe-a'), 'kandydat oferowany');
  assert.ok(offers.some((c) => c.targetId === null), 'i jest „brak celu" — bez tego auto byłby bezprawne');
});
