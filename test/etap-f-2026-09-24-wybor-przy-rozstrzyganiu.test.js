// Etap F (PR #135, polecenie właściciela: „żadnych uproszczeń wpływających na
// grę") — CR 603.5 (dosłownie, CR 2026-09-25 przez mtg.wiki/page/Triggered_ability):
// „Some triggered abilities' effects are optional (they contain “may,” as in
// “At the beginning of your upkeep, you may draw a card”). These abilities go
// on the stack when they trigger, regardless of whether their controller
// intends to exercise the ability's option or not. The choice is made when the
// ability resolves. Likewise, triggered abilities that have an effect “unless”
// something is true or a player chooses to do something will go on the stack
// normally; the “unless” part of the ability is dealt with when the ability
// resolves."
//
// Dawniej silnik pytał w chwili ODPALENIA (a „nie" w ogóle nie kładło
// zdolności na stos), płatność „you may pay" i „sacrifice unless you pay"
// (Rupture Spire, echo) rozliczał od razu — przeciwnik tracił okno odpowiedzi,
// a gracz decydował/płacił przed nim.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { processTriggers } from '../src/engine/triggers.js';
import { moveObjectDirectly } from '../src/engine/objects.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const registry = createCardRegistry();

function game(active = 'p1') {
  const state = createGameState({ seed: 603, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', active);
  state.turn.activePlayerId = active;
  state.turn.priorityPlayerId = active;
  return state;
}

function put(state, id, cardId, controllerId, zone = 'battlefield') {
  const def = registry.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness, manaCost: data.manaCost,
    spell: data.spell, abilities: data.abilities ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], types: def.types ?? [], colors: data.colors ?? [],
    cardName: def.name,
  });
  const extra = {};
  for (const key of ['echo', 'echoColors', 'entersTapped']) if (data[key] !== undefined) extra[key] = data[key];
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false, ...extra }));
  return state.objects.get(id);
}

const pass = (state) => execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
const triggersOnStack = (state) => state.zones.stack.map((id) => state.objects.get(id)).filter((o) => o?.kind === 'trigger');

test('CR 603.5 „you may": zdolność idzie na stos bez pytania; przeciwnik ma okno; wybór przy rozstrzyganiu', () => {
  const state = game('p2');
  put(state, 'feather', 'angels-feather', 'p1');
  put(state, 'white', 'gather-the-townsfolk', 'p2', 'hand');
  addMana(state, 'p2', 2);
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p2', objectId: 'white', targets: [] }).ok);
  assert.equal(state.pendingOptionalTrigger, null, 'brak pytania w chwili odpalenia');
  assert.equal(triggersOnStack(state).length, 1, 'zdolność Pióra jest na stosie NAD czarem');
  // Okno odpowiedzi: priorytet ma aktywny gracz (p2), zwykłe passy są legalne.
  assert.equal(state.turn.priorityPlayerId, 'p2');
  assert.ok(playerView(state, 'p2').legalCommands.some((c) => c.type === 'pass_priority'));
  assert.ok(pass(state).ok);
  assert.ok(pass(state).ok, 'druga strona passuje — zdolność się rozstrzyga');
  assert.ok(state.pendingOptionalTrigger, 'teraz pytanie „you may gain 1 life"');
  assert.equal(state.pendingOptionalTrigger.playerId, 'p1');
  assert.equal(triggersOnStack(state).length, 0, 'zdolność opuściła stos (jest w trakcie rozstrzygania)');
  const lifeBefore = state.players[0].life;
  // „Nie" (pass) — zdolność rozstrzyga się bez skutku i mówi to wprost.
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok);
  assert.equal(state.players[0].life, lifeBefore);
  assert.ok(state.events.some((e) => e.type === 'trigger_resolved' && e.noEffect && e.reason === 'declined'));
  assert.equal(state.turn.priorityPlayerId, 'p2', 'priorytet wraca do aktywnego gracza (CR 117.3b)');
  assert.ok(state.zones.stack.some((id) => state.objects.get(id)?.cardId === 'gather-the-townsfolk'), 'czar nadal czeka');
});

test('CR 603.5 „you may pay": zdolność na stosie także bez many; przy rozstrzyganiu brak płatności = brak efektu', () => {
  const state = game('p1');
  put(state, 'bomb', 'panic-spellbomb', 'p1');
  put(state, 'foe', 'highland-game', 'p2');
  addObject(state, { id: 'top', instanceId: 'it', cardId: 'highland-game', controllerId: 'p1', zone: 'library', kind: 'creature', manaCost: 2, types: ['Creature'], subtypes: [], colors: ['G'] });
  // Aktywacja {T}, Sacrifice — bez żadnej many na {R}.
  assert.ok(execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'bomb', abilityIndex: 0, targets: ['foe'] }).ok);
  assert.equal(triggersOnStack(state).length, 1, 'zdolność „dies" jest na stosie mimo braku many (CR 603.5)');
  assert.equal(state.pendingOptionalPay, null);
  pass(state); pass(state);
  assert.equal(state.pendingOptionalPay, null, 'nie da się zapłacić — brak pytania');
  assert.ok(state.events.some((e) => e.type === 'trigger_resolved' && e.noEffect && e.reason === 'cannot_pay'));
  assert.ok(!state.zones.hand.some((id) => state.objects.get(id)?.controllerId === 'p1'), 'brak dobrania');
});

test('CR 603.5 „you may pay": płatność pobierana przy ROZSTRZYGANIU, nie przy odpaleniu', () => {
  const state = game('p1');
  put(state, 'bomb', 'panic-spellbomb', 'p1');
  put(state, 'foe', 'highland-game', 'p2');
  addObject(state, { id: 'top', instanceId: 'it', cardId: 'highland-game', controllerId: 'p1', zone: 'library', kind: 'creature', manaCost: 2, types: ['Creature'], subtypes: [], colors: ['G'] });
  addMana(state, 'p1', 1, { colors: ['R'] });
  assert.ok(execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'bomb', abilityIndex: 0, targets: ['foe'] }).ok);
  assert.equal(state.players[0].mana, 1, 'mana nietknięta, dopóki zdolność czeka na stosie');
  pass(state); pass(state);
  assert.ok(state.pendingOptionalPay?.onResolution, 'pytanie w trakcie rozstrzygania');
  assert.ok(execute(state, { type: 'resolve_optional_pay_choice', playerId: 'p1', pay: true }).ok);
  assert.equal(state.players[0].mana, 0, '{R} zapłacone');
  assert.ok(state.zones.hand.some((id) => state.objects.get(id)?.cardId === 'highland-game'),
    '„If you do, draw a card" — dobranie w TYM SAMYM rozstrzygnięciu (bez nowego wpisu na stosie)');
  assert.equal(triggersOnStack(state).length, 0);
});

test('CR 603.5 „unless": Rupture Spire — trigger na stosie; gdy Spire zniknie w odpowiedzi, nic się nie dzieje', () => {
  const state = game('p1');
  put(state, 'spire', 'rupture-spire', 'p1', 'hand');
  addMana(state, 'p1', 1);
  assert.ok(execute(state, { type: 'play_land', playerId: 'p1', objectId: 'spire' }).ok);
  assert.equal(state.pendingPayOrSacrifice, null, 'brak decyzji w chwili odpalenia');
  const [entry] = triggersOnStack(state);
  assert.ok(entry, 'trigger ETB na stosie');
  // Odpowiedź: Spire opuszcza pole bitwy, zanim trigger się rozstrzygnie.
  const spireId = entry.triggerEntry.sourceId;
  moveObjectDirectly(state, spireId, 'graveyard', 'grave-spire');
  pass(state); pass(state);
  assert.equal(state.pendingPayOrSacrifice, null, 'nie ma czego poświęcić — brak decyzji');
  assert.equal(state.players[0].mana, 1, 'nikt nie płaci za nieobecny permanent');
  assert.ok(state.events.some((e) => e.type === 'trigger_resolved' && e.noEffect && e.reason === 'source_left'));
});

test('CR 702.30a + 603.5: echo idzie na stos w upkeepie; zapłać/poświęć przy rozstrzyganiu', () => {
  const state = game('p1');
  put(state, 'shredder', 'bone-shredder', 'p1');
  for (let i = 0; i < 3; i += 1) put(state, `sw${i}`, 'basic-swamp', 'p1');
  state.objects.set('shredder', Object.freeze({ ...state.objects.get('shredder'), echoUnpaid: true }));
  state.turn = jumpToStep(state.turn, 'upkeep', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  processTriggers(state, [{ type: 'step_advanced', step: 'upkeep', playerId: 'p1' }]);
  assert.equal(state.pendingPayOrSacrifice, null, 'brak decyzji w chwili odpalenia');
  const [entry] = triggersOnStack(state);
  assert.equal(entry?.triggerEntry?.ability?.keyword, 'echo', 'zdolność echa na stosie');
  pass(state); pass(state);
  assert.ok(state.pendingPayOrSacrifice, 'decyzja przy rozstrzyganiu');
  assert.equal(state.pendingPayOrSacrifice.amount, 3);
  assert.ok(execute(state, { type: 'resolve_pay_or_sacrifice', playerId: 'p1', pay: true }).ok);
  assert.equal(state.objects.get('shredder')?.zone, 'battlefield');
});

// --- „you may [czasownik] target" (CR 603.3d + 603.5) -----------------------

test('CR 603.3d + 603.5 „you may … target": cel obowiązkowy przy kładzeniu na stos, „may" przy rozstrzyganiu', () => {
  const state = game('p1');
  put(state, 'art', 'reclusive-artificer', 'p1', 'hand');
  put(state, 'foe', 'highland-game', 'p2');
  addMana(state, 'p1', 4);
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'art' }).ok);
  pass(state); pass(state);
  const pend = state.pendingTriggerTargets[0];
  assert.ok(pend, 'wybór celu przy kładzeniu na stos (Artificer i foe)');
  assert.equal(pend.allowNone, false, 'brak „bez celu" — cel obowiązkowy');
  assert.ok(execute(state, { type: 'resolve_trigger_target', playerId: 'p1', targetId: 'foe' }).ok);
  assert.equal(state.pendingOptionalTrigger, null, 'jeszcze bez pytania');
  assert.equal(triggersOnStack(state).length, 1);
  pass(state); pass(state);
  assert.deepEqual(state.pendingOptionalTrigger?.targets, ['foe'], '„you may" przy rozstrzyganiu, z celem');
});

test('Bot: „you may … target", gdy jedynym celem był własny stwór — odmawia przy rozstrzyganiu', () => {
  const state = game('p2');
  put(state, 'art', 'reclusive-artificer', 'p2', 'hand');
  put(state, 'relic', 'angels-feather', 'p2');
  addMana(state, 'p2', 4);
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p2', objectId: 'art' }).ok);
  pass(state); pass(state);
  // Jedyny kandydat (sam Artificer) wybrany automatycznie (M242).
  pass(state); pass(state);
  assert.deepEqual(state.pendingOptionalTrigger?.targets?.length, 1);
  const bot = createHeuristicBot({ seed: 1 });
  const chosen = bot.chooseCommand(playerView(state, 'p2'));
  assert.equal(chosen.type, 'pass_priority', 'bot nie strzela we własnego stwora');
});

// --- „you may [koszt]. When you do, … target" (CR 603.5 + 603.12) ----------

function kappaAfterDamage({ withArtifact = true } = {}) {
  const state = game('p1');
  put(state, 'kappa', 'kappa-tech-wrecker', 'p1');
  state.objects.set('kappa', Object.freeze({ ...state.objects.get('kappa'), counters: { deathtouch: 1 } }));
  if (withArtifact) put(state, 'relic', 'angels-feather', 'p2');
  processTriggers(state, [{ type: 'damage_dealt', source: 'kappa', target: 'p2', amount: 1, combat: true }]);
  return state;
}

test('CR 603.12 Kappa: zdolność bez celu na stosie; znacznik to koszt przy rozstrzyganiu; cel po zapłacie', () => {
  const state = kappaAfterDamage();
  assert.equal(state.pendingTriggerTargets.length, 0, 'brak celu przy odpaleniu');
  assert.equal(triggersOnStack(state).length, 1);
  assert.equal(state.objects.get('kappa').counters.deathtouch, 1, 'znacznik nietknięty, dopóki zdolność czeka');
  pass(state); pass(state);
  assert.ok(state.pendingOptionalPay, 'decyzja „usuń znacznik" przy rozstrzyganiu');
  assert.ok(execute(state, { type: 'resolve_optional_pay_choice', playerId: 'p1', pay: true }).ok);
  assert.equal(state.objects.get('kappa').counters?.deathtouch, undefined, 'znacznik usunięty jako koszt');
  assert.deepEqual(state.pendingTriggerTargets[0]?.candidates, ['relic'], 'cel refleksyjnej zdolności — teraz');
});

test('CR 603.12 Kappa: gdy Kappa zniknie w odpowiedzi, nie da się usunąć znacznika — brak efektu', () => {
  const state = kappaAfterDamage();
  moveObjectDirectly(state, 'kappa', 'graveyard', 'grave-kappa');
  pass(state); pass(state);
  assert.equal(state.pendingOptionalPay, null);
  assert.ok(state.events.some((e) => e.type === 'trigger_resolved' && e.noEffect && e.reason === 'cannot_pay'));
  assert.equal(state.objects.get('relic').zone, 'battlefield');
});

test('Bot: refleksyjne „When you do" bez legalnego celu — nie płaci (oferta niesie reflexiveTargetCount 0)', () => {
  const state = kappaAfterDamage({ withArtifact: false });
  pass(state); pass(state);
  const offer = playerView(state, 'p1').legalCommands.find((c) => c.type === 'resolve_optional_pay_choice' && c.pay);
  assert.equal(offer.reflexiveTargetCount, 0);
  const chosen = createHeuristicBot({ seed: 1 }).chooseCommand(playerView(state, 'p1'));
  assert.equal(chosen.type, 'resolve_optional_pay_choice');
  assert.equal(chosen.pay, false, 'bot nie marnuje znacznika');
});
