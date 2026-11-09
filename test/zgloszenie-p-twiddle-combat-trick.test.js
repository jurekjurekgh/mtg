// Zgłoszenie P (2026-11-08, właściciel): Twiddle „You may tap or untap
// target artifact, creature, or land.” to combat trick. Bot ma go używać:
// 1) po własnej deklaracji atakujących — tapnąć groźnego blokera;
// 2) przed własną deklaracją — odkręcić własnego tapniętego atakującego;
// 3) przed deklaracją przeciwnika — tapnąć groźnego atakującego;
// 4) po deklaracji przeciwnika — odkręcić własnego blokera (lethal).
//
// CR (mirror nwgarne/mtg-data, wydanie 2026-11-06):
// - 509.1a: „The chosen creatures must be untapped and they can’t also be
//   battles.” (tapnięty nie blokuje)
// - 506.4b: „Tapping or untapping a creature that’s already been declared as
//   an attacker or blocker doesn’t remove it from combat and doesn’t prevent
//   its combat damage.”
// - 510.1d: „A blocking creature assigns combat damage to the creatures it’s
//   blocking.” + 120.6: lethal = damage marked ≥ toughness.
// - 302.6: choroba przywołania / tap symbol ogranicza atak i aktywacje.
// Polityka jest generyczna po deskryptorze tap/untap (ADR 0002), nie po
// nazwie Twiddle. Nośniki stworów syntetyczne (ADR 0029); P/11 używa
// istniejących kart katalogu jako nośnika triggera (bez nowych kart).
//
// Mutacje (końcowy kod, logi .arena/mut-final2-*):
//  mP1: pushPotential ignoruje zadeklarowanych atakujących → P/1, P/1e RED;
//  mP2: untap czaru po własnej deklaracji dalej płaski → P/2 RED;
//  mP3: untap po deklaracji wroga bez blokowalności → P/6, P/7 RED;
//  mP4: tap wroga przed deklaracją bez potencjału ataku → P/5, P/5b RED;
//  mP5: brak kary we własnym upkeep/draw → P/9 RED;
//  mP6: kara okna obejmuje też darmowy trigger → P/11 RED;
//  mP7: rzut czaru nie przekazuje castingSpell → P/2, P/4, P/10 RED.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function game(step, active, priority = active) {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, active);
  state.turn.activePlayerId = active;
  state.turn.priorityPlayerId = priority;
  state.turn.number = 8;
  return state;
}

function putTwiddle(state, controller = 'p1') {
  const def = REGISTRY.get('twiddle');
  addObject(state, {
    id: 'tw', instanceId: 'i-tw', cardId: 'twiddle', controllerId: controller, ownerId: controller, zone: 'hand',
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [], spell: def.spell,
  });
  addMana(state, controller, 1, { colors: ['U'] });
}

function blank(state, id, controllerId, extra = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `x-${id}`, controllerId, ownerId: controllerId, zone: 'battlefield',
    kind: 'creature', power: 2, toughness: 2, manaCost: 1, abilities: [], keywords: [], subtypes: [],
    types: ['Creature'], colors: [], cardName: id, name: id,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false, ...extra }));
  return state.objects.get(id);
}

function choose(state, playerId = 'p1') {
  const bot = createHeuristicBot({ seed: 3 });
  const choice = bot.chooseCommand(playerView(state, playerId), {});
  const options = (bot.trace().at(-1)?.options ?? [])
    .filter((o) => o.cmd.startsWith('cast_spell(tw'))
    .sort((a, b) => b.score - a.score);
  return { choice, options };
}

function declare(state, playerId, attackerIds) {
  state.turn.priorityPlayerId = playerId;
  const result = execute(state, { type: 'declare_attackers', playerId, attackerIds });
  assert.ok(result.ok, JSON.stringify(result.events));
}

const isTwiddle = (choice, target) => choice?.type === 'cast_spell' && choice.objectId === 'tw'
  && (target == null || (choice.targets ?? [])[0] === target);

test('P/1: po własnej deklaracji bot tapuje groźnego blokera, nie odkręca swojego atakującego', () => {
  const state = game('declare_attackers', 'p1');
  putTwiddle(state);
  blank(state, 'atk', 'p1', { power: 3, toughness: 3 });
  blank(state, 'blk', 'p2', { power: 4, toughness: 4 });
  declare(state, 'p1', ['atk']);
  const { choice, options } = choose(state);
  assert.ok(isTwiddle(choice, 'blk'), `bot tapuje blokera: ${JSON.stringify(choice)}`);
  const tapBlocker = options.find((o) => o.cmd === 'cast_spell(tw->blk)');
  const untapSelf = options.find((o) => o.cmd === 'cast_spell(tw->atk)');
  assert.ok(tapBlocker && tapBlocker.score > 0, `tap blokera dodatni: ${JSON.stringify(tapBlocker)}`);
  assert.ok(!untapSelf || tapBlocker.score > untapSelf.score, 'tap blokera bije odkręcenie własnego atakującego');
});

test('P/1e: pełne execute — Twiddle tapuje blokera po deklaracji (nie może blokować)', () => {
  const state = game('declare_attackers', 'p1');
  putTwiddle(state);
  blank(state, 'atk', 'p1', { power: 3, toughness: 3 });
  blank(state, 'blk', 'p2', { power: 4, toughness: 4 });
  declare(state, 'p1', ['atk']);
  const { choice } = choose(state);
  assert.ok(isTwiddle(choice, 'blk'));
  assert.ok(execute(state, choice).ok);
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok);
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p2' }).ok);
  const may = playerView(state, 'p1').legalCommands.find((c) => c.type === 'resolve_optional_spell_effect' && c.apply === true);
  assert.ok(may, 'oferta „you may” istnieje');
  assert.ok(execute(state, may).ok);
  assert.equal(state.objects.get('blk').tapped, true, 'bloker tapnięty przed deklaracją bloków');
});

test('P/2: po własnej deklaracji bez groźnego blokera bot NIE marnuje Twiddle na odkręcenie atakującego', () => {
  const state = game('declare_attackers', 'p1');
  putTwiddle(state);
  blank(state, 'atk', 'p1', { power: 3, toughness: 3 });
  // brak stworów przeciwnika — odkręcenie własnego atakującego nie dokłada akcji
  declare(state, 'p1', ['atk']);
  const { choice } = choose(state);
  assert.ok(!isTwiddle(choice), `bot nie marnuje Twiddle po deklaracji: ${JSON.stringify(choice)}`);
});

test('P/3 (kontrola): przed własną deklaracją bot odkręca tapniętego atakującego', () => {
  const state = game('beginning_of_combat', 'p1');
  putTwiddle(state);
  blank(state, 'atk', 'p1', { power: 3, toughness: 3, tapped: true });
  blank(state, 'blk', 'p2', { power: 2, toughness: 2 });
  const { choice } = choose(state);
  assert.ok(isTwiddle(choice, 'atk'), `odkręcenie własnego atakującego: ${JSON.stringify(choice)}`);
});

test('P/4: przed deklaracją bot NIE odkręca własnego obrońcy, który nie może atakować', () => {
  const state = game('beginning_of_combat', 'p1');
  putTwiddle(state);
  blank(state, 'wall', 'p1', { power: 0, toughness: 4, tapped: true, keywords: ['defender'] });
  blank(state, 'enemy', 'p2', { power: 2, toughness: 2 });
  const { choice } = choose(state);
  assert.ok(!isTwiddle(choice, 'wall'), `obrońca bez ataku nie jest celem odkręcenia: ${JSON.stringify(choice)}`);
});

test('P/5: przed deklaracją przeciwnika bot tapuje groźnego atakującego, nie obrońcę', () => {
  const state = game('beginning_of_combat', 'p2', 'p1');
  putTwiddle(state);
  blank(state, 'defender', 'p2', { power: 6, toughness: 6, keywords: ['defender'] });
  blank(state, 'threat', 'p2', { power: 3, toughness: 3 });
  blank(state, 'mine', 'p1', { power: 2, toughness: 2 });
  const { choice } = choose(state);
  assert.ok(isTwiddle(choice, 'threat'), `tapujemy potencjalnego atakującego, nie obrońcę: ${JSON.stringify(choice)}`);
});

test('P/5b: przed deklaracją przeciwnika sam obrońca nie jest wart Twiddle', () => {
  const state = game('beginning_of_combat', 'p2', 'p1');
  putTwiddle(state);
  blank(state, 'defender', 'p2', { power: 6, toughness: 6, keywords: ['defender'] });
  blank(state, 'mine', 'p1', { power: 2, toughness: 2 });
  const { choice } = choose(state);
  assert.ok(!isTwiddle(choice), `bot nie tapuje obrońcy przed atakiem: ${JSON.stringify(choice)}`);
});

test('P/6: po deklaracji przeciwnika bot odkręca blokera zdolnego zabić atakującego (lethal), nie większego bez bloku', () => {
  const state = game('declare_attackers', 'p2');
  putTwiddle(state);
  blank(state, 'flyer', 'p2', { power: 3, toughness: 3, keywords: ['flying'] });
  blank(state, 'killer', 'p1', { power: 4, toughness: 4, tapped: true, keywords: ['reach'] });
  blank(state, 'chaff', 'p1', { power: 5, toughness: 5, tapped: true }); // nie zablokuje flying
  declare(state, 'p2', ['flyer']);
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p2' }).ok, 'priorytet dla bota po deklaracji');
  const { choice } = choose(state);
  assert.ok(isTwiddle(choice, 'killer'), `odkręcamy blokera z lethal, nie większego bez bloku: ${JSON.stringify(choice)}`);
});

test('P/7: po deklaracji przeciwnika bot NIE odkręca stwora, który nie może blokować żadnego atakującego', () => {
  const state = game('declare_attackers', 'p2');
  putTwiddle(state);
  blank(state, 'flyer', 'p2', { power: 3, toughness: 3, keywords: ['flying'] });
  blank(state, 'ground', 'p1', { power: 5, toughness: 5, tapped: true }); // bez reach/flying
  declare(state, 'p2', ['flyer']);
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p2' }).ok);
  const { choice } = choose(state);
  assert.ok(!isTwiddle(choice), `brak bloku = brak marnowania Twiddle: ${JSON.stringify(choice)}`);
});

test('P/8 (kontrola klasy): denial many w upkeepie przeciwnika zostaje wartościowy', () => {
  const state = game('upkeep', 'p2', 'p1');
  putTwiddle(state);
  const landDef = REGISTRY.get('basic-island') ?? REGISTRY.get('basic-forest');
  assert.ok(landDef, 'basic land w rejestrze');
  addObject(state, {
    id: 'lad', instanceId: 'i-lad', cardId: landDef.id, controllerId: 'p2', ownerId: 'p2', zone: 'battlefield',
    ...gameObjectDataOf(landDef), types: landDef.types ?? [], keywords: landDef.keywords ?? [], subtypes: landDef.subtypes ?? [],
  });
  const { choice } = choose(state);
  assert.ok(isTwiddle(choice, 'lad'), `tapnięcie lądu w upkeepie wroga: ${JSON.stringify(choice)}`);
});

test('P/9: we WŁASNYM podtrzymaniu bot nie rzuca Twiddle na wrogiego stwora (trzyma na okno walki)', () => {
  const state = game('upkeep', 'p1');
  putTwiddle(state);
  blank(state, 'mine', 'p1', { power: 3, toughness: 3 });
  blank(state, 'enemy', 'p2', { power: 2, toughness: 2 });
  const { choice, options } = choose(state);
  assert.ok(!isTwiddle(choice), `bot nie rzuca w swoim upkeepie: ${JSON.stringify(choice)}`);
  for (const o of options) assert.ok(o.score <= 0, `wariant poza oknem nie może być dodatni: ${o.cmd}=${o.score}`);
});

test('P/10: we WŁASNYM podtrzymaniu bot nie odkręca własnego stwora „bo tapnięty”', () => {
  const state = game('upkeep', 'p1');
  putTwiddle(state);
  blank(state, 'mine', 'p1', { power: 3, toughness: 3, tapped: true });
  blank(state, 'enemy', 'p2', { power: 2, toughness: 2 });
  const { choice } = choose(state);
  assert.ok(!isTwiddle(choice), `odkręcenie w upkeepie bez okna ataku: ${JSON.stringify(choice)}`);
});

// P/11 — anty-over-fix wspólnej miary (L41/L169): kara „trzymaj kartę” po
// własnej deklaracji dotyczy RZUTU czaru z ręki (Twiddle), nie darmowego
// triggera/aktywacji. Trigger „untap another target creature you control”
// (Tenth District Veteran) po ataku nadal ma wybrać najlepszego tapniętego
// stwora, a nie remisować wszystkie cele na −4 i brać pierwszego z brzegu.
// Nośniki z istniejącego katalogu (bez nowych kart, ADR 0029).
function putReal(state, id, cardId, controllerId, extra = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone: 'battlefield',
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false, ...extra }));
}

test('P/11: darmowy trigger untap po własnej deklaracji nie remisuje tapniętych celów (L169)', () => {
  const state = game('declare_attackers', 'p1');
  putReal(state, 'vet', 'tenth-district-veteran', 'p1');
  putReal(state, 'warden', 'ghost-warden', 'p1', { tapped: true });
  blank(state, 'flyer', 'p1', { power: 2, toughness: 2, tapped: true, keywords: ['flying'] });
  blank(state, 'standing', 'p1', { power: 5, toughness: 5, tapped: false });
  declare(state, 'p1', ['vet']);
  const view = playerView(state, 'p1');
  assert.ok(view.pendingTriggerTarget, 'trigger celu untap istnieje');
  const bot = createHeuristicBot({ seed: 3 });
  const choice = bot.chooseCommand(view, {});
  assert.equal(choice.type, 'resolve_trigger_target');
  const options = bot.trace().at(-1).options.filter((o) => o.cmd.startsWith('resolve_trigger_target('));
  const score = (id) => options.find((o) => o.cmd === `resolve_trigger_target(${id})`)?.score;
  assert.ok(score('flyer') > score('warden'), `większy tapnięty cel bije mniejszego: flyer=${score('flyer')} warden=${score('warden')}`);
  assert.ok(score('warden') > score('standing'), `tapnięty cel bije nietapniętego: warden=${score('warden')} standing=${score('standing')}`);
  assert.equal(choice.targetId, 'flyer', 'wybrany najlepszy tapnięty cel, nie pierwszy z remisu');
});
