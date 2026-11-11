// Audyt PR #183, F2 (2026-11-08c): dynamiczny pump SIŁY musi dotrzeć do
// oferty `resolve_trigger_target` jako LICZBA, tak jak kwota obrażeń
// (`triggerDamageField` → resolveDamageAmount). Beastmaster ma
// `power:'source_power'`; stary `triggerTargetPowerPumpOf` porównywał tekst
// z liczbą (`'source_power' > 0` = false), oferta nie miała `pump`, a bot
// nie stosował polityki „pump siły na atakującego” (Battle-Rattle Shaman):
// wybierał chorego 11/11 zamiast atakującego 2/2, +2/+0 wygasało w cleanup.
//
// CR 603.3d (wybór celu przy wejściu na stos) i 608.2h (informacja o źródle
// przy rozstrzygnięciu); polityka bota: CR 508.1 / 702.10 (Haste) — buff
// „do końca tury” na stworze, który nie zaatakuje, jest zmarnowany (CR 514.2).
// Nośnik wielocelowy jest SYNTETYCZNY (ADR 0029) — katalog nie ma
// wielocelowego triggera z pumpem siły.
//
// Mutacja: cofnięcie resolvera w ofercie (sam liczbowy helper) → F2-1,
// F2-2, F2-3 i F2-7 czerwienieją; kontrole liczbowa/ujemna pozostają zielone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { effectivePower } from '../src/engine/permanents.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { triggerTargetPowerPumpOf } from '../src/engine/effect-intent.js';

const REGISTRY = createCardRegistry();

function game(step = 'declare_attackers') {
  const state = createGameState({ seed: 183, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.players.find((p) => p.id === 'p2').life = 20;
  state.turn = jumpToStep(state.turn, step, 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  return state;
}

function putCard(state, id, cardId, extra = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: 'p1', ownerId: 'p1', zone: 'battlefield',
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false, ...extra }));
  return state.objects.get(id);
}

function run(state, command) {
  assert.ok(command, 'oferta istnieje');
  const result = execute(state, command);
  assert.ok(result.ok, JSON.stringify(result.events));
  return result;
}

function passBoth(state) {
  for (let i = 0; i < 2; i++) run(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
}

function triggerOffers(state) {
  return playerView(state, 'p1').legalCommands.filter((c) => c.type === 'resolve_trigger_target');
}

function debuffBeast(state) {
  const beast = state.objects.get('beast');
  const synthetic = { type: 'activated', cost: {}, effect: { type: 'pump', power: -3, toughness: 3 } };
  state.objects.set('beast', Object.freeze({ ...beast, abilities: [synthetic, ...beast.abilities] }));
  run(state, playerView(state, 'p1').legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === 'beast' && c.abilityIndex === 0));
  passBoth(state);
}

test('F2-1: oferta Beastmastera niesie resolved pump {power:2, toughness:0}', () => {
  const state = game();
  putCard(state, 'beast', 'gruul-beastmaster');
  putCard(state, 'elk', 'highland-game');
  putCard(state, 'sick', 'hill-giant', { power: 11, toughness: 11, summoningSickness: true });
  run(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['beast', 'elk'] });
  const offers = triggerOffers(state);
  assert.deepEqual(offers.map((c) => c.targetId).sort(), ['elk', 'sick']);
  for (const offer of offers) {
    assert.deepEqual(offer.pump, { power: 2, toughness: 0 }, 'kwota z resolvera, nie deskryptor tekstowy');
    assert.equal(offer.friendly, true);
  }
});

test('F2-2: bot pompuje atakującego 2/2, nie chorego 11/11', () => {
  const state = game();
  putCard(state, 'beast', 'gruul-beastmaster');
  putCard(state, 'elk', 'highland-game');
  putCard(state, 'sick', 'hill-giant', { power: 11, toughness: 11, summoningSickness: true });
  run(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['beast', 'elk'] });
  const cmd = createHeuristicBot({ seed: 183 }).chooseCommand(playerView(state, 'p1'));
  assert.equal(cmd?.type, 'resolve_trigger_target');
  assert.equal(cmd.targetId, 'elk', 'chory 11/11 nie może skorzystać z +2/+0 do końca tury');
});

test('F2-3: pełne execute po wyborze bota — elk 4/1, chory bez pompy', () => {
  const state = game();
  putCard(state, 'beast', 'gruul-beastmaster');
  putCard(state, 'elk', 'highland-game');
  putCard(state, 'sick', 'hill-giant', { power: 11, toughness: 11, summoningSickness: true });
  run(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['beast', 'elk'] });
  const cmd = createHeuristicBot({ seed: 183 }).chooseCommand(playerView(state, 'p1'));
  run(state, cmd);
  passBoth(state);
  assert.equal(effectivePower(state.objects.get('elk'), state), 4);
  assert.equal(effectivePower(state.objects.get('sick'), state), 11);
});

test('F2-4 (kontrola ujemna): X=0 nie daje sygnału dodatniego pumpa ani zmiany P/T', () => {
  const state = game('main1');
  putCard(state, 'beast', 'gruul-beastmaster');
  putCard(state, 'elk', 'highland-game');
  putCard(state, 'sick', 'hill-giant', { power: 11, toughness: 11, summoningSickness: true });
  debuffBeast(state);
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  run(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['beast', 'elk'] });
  const offers = triggerOffers(state);
  assert.ok(offers.length > 0);
  for (const offer of offers) assert.ok(!(offer.pump?.power > 0), 'zero nie jest dodatnim pumpem');
  run(state, offers[0]);
  passBoth(state);
  assert.equal(effectivePower(state.objects.get('elk'), state), 2);
  assert.equal(effectivePower(state.objects.get('sick'), state), 11);
});

test('F2-5 (kontrola liczbowa): helper bez resolvera zachowuje stare liczby', () => {
  const ability = { effect: { type: 'pump', power: 2, toughness: 0 } };
  assert.deepEqual(triggerTargetPowerPumpOf(ability), { power: 2, toughness: 0 });
  assert.equal(triggerTargetPowerPumpOf({ effect: { type: 'pump', power: -1, toughness: 0 } }), null);
  assert.equal(triggerTargetPowerPumpOf({ effect: { type: 'pump', power: 0, toughness: 2 } }), null, 'sama toughness poza sygnałem pumpa siły');
});

test('F2-6: helper dynamiczny bez resolvera nie zwraca tekstu jako liczby', () => {
  const ability = { effect: { type: 'pump', power: 'source_power', toughness: 0 } };
  assert.equal(triggerTargetPowerPumpOf(ability), null, 'bez stanu nie zgadujemy kwoty');
  assert.deepEqual(triggerTargetPowerPumpOf(ability, (v) => (v === 'source_power' ? 4 : v ?? 0)), { power: 4, toughness: 0 });
  assert.equal(triggerTargetPowerPumpOf(ability, () => 0), null, 'resolved zero nie jest sygnałem dodatnim');
});

test('F2-7 (nośnik syntetyczny): wielocelowa oferta też niesie resolved pump', () => {
  const state = game();
  const synthetic = {
    type: 'triggered',
    trigger: { event: 'attacks', requiresTarget: { type: 'creature_you_control', notSelf: true, count: 2, upTo: true } },
    effect: { type: 'pump', power: 'source_power', toughness: 0 },
  };
  putCard(state, 'giant', 'hill-giant', { abilities: [synthetic] });
  putCard(state, 'elk', 'highland-game');
  putCard(state, 'sick', 'hill-giant', { summoningSickness: true });
  run(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['giant', 'elk'] });
  const offers = triggerOffers(state).filter((c) => Array.isArray(c.targetIds));
  assert.ok(offers.length > 0, 'warianty wielocelowe istnieją');
  for (const offer of offers) assert.deepEqual(offer.pump, { power: 3, toughness: 0 }, 'moc Hill Giant = 3');
});
