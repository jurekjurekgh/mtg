import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { moveObjectDirectly } from '../src/engine/objects.js';
import { effectiveKeywords, effectivePower, effectiveToughness } from '../src/engine/permanents.js';
import { addCounter } from '../src/engine/counters.js';
import { effectiveSpellManaCost } from '../src/engine/spells.js';
import { jumpToStep } from '../src/engine/turn.js';
import { verifyReplay, replayFromState } from '../src/engine/replay.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { MANA_COSTS } from '../src/cards/mana-costs-data.js';

/**
 * Batch 19 realnych kart (ADR 0010 §2a), lista właściciela 2026-08-06:
 * - Illvoi Operative (EOE): 2/1, trigger „your second spell each turn";
 * - Grounded (AVR): aura „enchanted creature loses flying" (losesKeywords);
 * - Ruinous Rampage (EOE): sorcery modalny — 3 dmg każdemu przeciwnikowi /
 *   exile wszystkich artefaktów MV ≤ 3 (exile_all);
 * - Tellah, Great Sage (FIN): legendary 3/3, noncreature spell → token Hero,
 *   progi wydanej many 4+ (draw 2) i 8+ (sacrifice + tyle dmg przeciwnikom);
 * - Etherium Sculptor (ALA): statyczna obniżka kosztu artefaktów o {1}
 *   (costModifier z permanentów, CR 601.2f, redukcja tylko generycznej);
 * - Boros Challenger (GRN): mentor (blokujący wybór celu — atakujący o
 *   mniejszej sile) + aktywowany pump {2}{R}{W};
 * - Pilgrim's Eye (GNT): 1/1 flying, ETB szukaj basic landa do ręki;
 * - Dementia Bat (NPH): {4}{B}, poświęć — cel-gracz odrzuca 2 karty
 *   (discard na celu; wybór kart deterministyczny wg ADR 0005);
 * - Seer's Lantern (OGW): {T}: Add {C}; {2}, {T}: Scry 1;
 * - You're Confronted by Robbers (CLB): instant modalny — tap do 3 celowanych
 *   stworów / trzy 1/1 białe tokeny Soldier (współdzieli token_soldier).
 *
 * Dane Oracle: docs/cards/scryfall-*.json (2026-08-06); artId/plan:
 * tools/collection-art-ids.csv.
 */

const REGISTRY = createCardRegistry();

function game() {
  return createGameState({ seed: 2026, players: [{ id: 'p1' }, { id: 'p2' }] });
}

function mainPhase(state, playerId = 'p1') {
  state.turn.phase = 'precombat_main';
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  state.turn.step = 'precombat_main';
  state.turn.stepIndex = 3;
  state.turn.passes = 0;
  return state;
}

function addRealCard(state, id, cardId, controllerId, zone, opts = {}) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, spell: data.spell, abilities: data.abilities ?? [],
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [], types: def.types ?? [],
    colors: data.colors ?? [], cardName: data.cardName ?? null,
    aura: def.aura ?? null, ownerId: opts.ownerId ?? null,
  });
  if (opts.tapped || opts.summoningSickness) {
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), tapped: !!opts.tapped, summoningSickness: !!opts.summoningSickness }));
  }
  return state.objects.get(id);
}

function addSimpleCreature(state, id, controllerId, { power = 1, toughness = 1, keywords = [], subtypes = [], colors = [], types = ['Creature'], manaCost = 1, summoningSickness = false } = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'highland-game', controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost,
    abilities: [], keywords, subtypes, types, colors,
  });
  if (summoningSickness) state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: true }));
  return state.objects.get(id);
}

/** Prosty customowy instant z ręki (kind spell), bez celów; do kosztów/progów. */
function addTestInstant(state, id, controllerId, manaCost, { colors = ['U'], effects = [{ type: 'draw_cards', amount: 1 }] } = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `test-instant-${manaCost}`, controllerId, zone: 'hand',
    kind: 'spell', manaCost, spell: { timing: 'instant', targets: [], effects },
    abilities: [], keywords: [], subtypes: [], types: ['Instant'], colors,
  });
  return state.objects.get(id);
}

/** Prosty customowy artefakt na bitwisku (do filtrów MV). */
function addTestArtifact(state, id, controllerId, manaCost) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `test-artifact-${manaCost}`, controllerId, zone: 'battlefield',
    kind: 'artifact', manaCost, abilities: [], keywords: [], subtypes: [], types: ['Artifact'], colors: [],
  });
  return state.objects.get(id);
}

function passBoth(state) {
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
}

function findId(state, cardId, zone = 'battlefield') {
  for (const [id, obj] of state.objects) {
    if (obj.cardId === cardId && obj.zone === zone) return id;
  }
  return null;
}

function countByCardId(state, cardId, zone = 'battlefield') {
  let n = 0;
  for (const obj of state.objects.values()) if (obj.cardId === cardId && obj.zone === zone) n += 1;
  return n;
}

function handSize(state, playerId) {
  return state.zones.hand.filter((id) => state.objects.get(id)?.controllerId === playerId).length;
}

function hasCommand(view, type, predicate = () => true) {
  return view.legalCommands.some((cmd) => cmd.type === type && predicate(cmd));
}

function lifeOf(state, playerId) {
  return state.players.find((p) => p.id === playerId).life;
}

// =============================================================================
// Dane rejestru / sanity — zgodność definicji z danymi Scryfall i kolekcją
// =============================================================================

const BATCH19 = [
  { id: 'illvoi-operative', name: 'Illvoi Operative', set: 'EOE', cost: '{1}{U}', manaCost: 2, power: 2, toughness: 1, artId: 53, plan: 'The Edge' },
  { id: 'grounded', name: 'Grounded', set: 'AVR', cost: '{1}{G}', manaCost: 2, artId: 62, plan: 'Innistrad' },
  { id: 'ruinous-rampage', name: 'Ruinous Rampage', set: 'EOE', cost: '{1}{R}{R}', manaCost: 3, artId: 475, plan: 'The Edge' },
  { id: 'tellah-great-sage', name: 'Tellah, Great Sage', set: 'FIN', cost: '{3}{U}{R}', manaCost: 5, power: 3, toughness: 3, artId: 15, plan: 'Final Fantasy' },
  { id: 'etherium-sculptor', name: 'Etherium Sculptor', set: 'ALA', cost: '{1}{U}', manaCost: 2, power: 1, toughness: 2, artId: 285, plan: 'Alara' },
  { id: 'boros-challenger', name: 'Boros Challenger', set: 'GRN', cost: '{R}{W}', manaCost: 2, power: 2, toughness: 3, artId: 140, plan: 'Ravnica' },
  { id: 'pilgrims-eye', name: "Pilgrim's Eye", set: 'GNT', cost: '{3}', manaCost: 3, power: 1, toughness: 1, artId: 132, plan: 'Zendikar' },
  { id: 'dementia-bat', name: 'Dementia Bat', set: 'NPH', cost: '{4}{B}', manaCost: 5, power: 2, toughness: 2, artId: 403, plan: 'Mirrodin' },
  { id: 'seers-lantern', name: "Seer's Lantern", set: 'OGW', cost: '{3}', manaCost: 3, artId: 489, plan: 'Śródziemie' },
  { id: 'youre-confronted-by-robbers', name: "You're Confronted by Robbers", set: 'CLB', cost: '{3}{W}', manaCost: 4, artId: 532, plan: 'Warhammer Fantasy' },
];

test('Batch 19: 10 kart w registry ze statusem supported i danymi Scryfall/kolekcji', () => {
  const oracleBySlug = {};
  for (const entry of BATCH19) {
    const raw = JSON.parse(fs.readFileSync(new URL(`../docs/cards/scryfall-${entry.id}.json`, import.meta.url), 'utf8'));
    const cards = Array.isArray(raw) ? raw : [raw];
    oracleBySlug[entry.id] = cards.find((c) => c.name === entry.name);
  }
  for (const entry of BATCH19) {
    const card = REGISTRY.get(entry.id);
    assert.ok(card, `${entry.id} powinien być w registry`);
    assert.equal(card.name, entry.name);
    assert.equal(card.set, entry.set);
    assert.equal(card.manaCost, entry.manaCost);
    assert.equal(card.artId, entry.artId);
    assert.equal(card.plan, entry.plan);
    assert.equal(card.support?.status, 'supported', `${entry.id}: status supported`);
    if (entry.power != null) assert.equal(card.power, entry.power);
    if (entry.toughness != null) assert.equal(card.toughness, entry.toughness);
    const oracle = oracleBySlug[entry.id];
    assert.ok(oracle, `brak danych Scryfall dla ${entry.id}`);
    assert.equal(card.oracleText, oracle.oracle_text, `${entry.id}: oracleText = wydruk Oracle`);
    assert.equal(card.imageUri, oracle.image_uris.large, `${entry.id}: imageUri = obraz Scryfall`);
    assert.equal(MANA_COSTS[entry.id], entry.cost, `${entry.id}: wpis kolorowego kosztu many`);
  }
});

// =============================================================================
// Illvoi Operative — trigger „your second spell each turn" (per gracz)
// =============================================================================

test('Illvoi Operative: materializacja — 2/1 z triggerem drugiego czaru w turze', () => {
  const data = gameObjectDataOf(REGISTRY.get('illvoi-operative'));
  assert.equal(data.kind, 'creature');
  assert.equal(data.power, 2);
  assert.equal(data.toughness, 1);
  const triggers = (data.abilities ?? []).filter((a) => a.trigger?.event === 'you_cast_second_spell_each_turn');
  assert.equal(triggers.length, 1);
  assert.deepEqual(triggers[0].effect, { type: 'add_counter', counter: '+1/+1', amount: 1 });
});

test('Illvoi Operative: pierwszy rzut bez licznika, drugi rzut kładzie +1/+1', () => {
  const state = game();
  mainPhase(state, 'p1');
  addRealCard(state, 'illvoi', 'illvoi-operative', 'p1', 'battlefield');
  addRealCard(state, 'c1', 'highland-game', 'p1', 'hand');
  addRealCard(state, 'c2', 'highland-game', 'p1', 'hand');
  addMana(state, 'p1', 4);
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'c1' }).ok);
  assert.equal(effectivePower(state.objects.get('illvoi'), state), 2, 'pierwszy rzut nie daje licznika');
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'c2' }).ok);
  assert.equal((state.objects.get('illvoi').counters ?? {})['+1/+1'], 1, 'drugi rzut = licznik +1/+1');
  assert.equal(effectivePower(state.objects.get('illvoi'), state), 3);
  assert.deepEqual(state.spellsCastThisTurnByPlayer, { p1: 2 });
});

test('Illvoi Operative: rzuty przeciwnika nie odpalają; trzeci rzut bez licznika', () => {
  const state = game();
  mainPhase(state, 'p1');
  addRealCard(state, 'illvoi', 'illvoi-operative', 'p1', 'battlefield');
  // Rzut przeciwnika (jego pierwszy) — Illvoi p1 milczy.
  addRealCard(state, 'e1', 'highland-game', 'p2', 'hand');
  addMana(state, 'p2', 2);
  mainPhase(state, 'p2');
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p2', objectId: 'e1' }).ok);
  assert.equal((state.objects.get('illvoi').counters ?? {})['+1/+1'] ?? 0, 0, 'cudzy rzut nie odpala Illvoi');
  assert.deepEqual(state.spellsCastThisTurnByPlayer, { p2: 1 });
  // Trzy rzuty p1 — licznik tylko za drugi.
  mainPhase(state, 'p1');
  addRealCard(state, 'a1', 'highland-game', 'p1', 'hand');
  addRealCard(state, 'a2', 'highland-game', 'p1', 'hand');
  addRealCard(state, 'a3', 'highland-game', 'p1', 'hand');
  addMana(state, 'p1', 6);
  for (const id of ['a1', 'a2', 'a3']) execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: id });
  assert.equal((state.objects.get('illvoi').counters ?? {})['+1/+1'], 1, 'dokładnie jeden licznik (za drugi rzut)');
  assert.equal(state.spellsCastThisTurnByPlayer.p1, 3);
});

test('Illvoi Operative: licznik resetuje się z turą — drugi rzut nowej tury znowu odpala', () => {
  const state = game();
  mainPhase(state, 'p1');
  addRealCard(state, 'illvoi', 'illvoi-operative', 'p1', 'battlefield');
  addRealCard(state, 'c1', 'highland-game', 'p1', 'hand');
  addRealCard(state, 'c2', 'highland-game', 'p1', 'hand');
  addMana(state, 'p1', 4);
  execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'c1' });
  execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'c2' });
  assert.equal((state.objects.get('illvoi').counters ?? {})['+1/+1'], 1);
  // Pełne przejście tury — licznik rzutów zeruje się przy zmianie turn.number.
  const turnBefore = state.turn.number;
  let guard = 0;
  while (state.turn.number === turnBefore && guard < 60) {
    passBoth(state);
    guard += 1;
  }
  assert.ok(state.turn.number > turnBefore, 'minęła tura');
  assert.deepEqual(state.spellsCastThisTurnByPlayer, {}, 'reset licznika per gracz');
  mainPhase(state, 'p1');
  addRealCard(state, 'c3', 'highland-game', 'p1', 'hand');
  addRealCard(state, 'c4', 'highland-game', 'p1', 'hand');
  addMana(state, 'p1', 4);
  execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'c3' });
  execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'c4' });
  assert.equal((state.objects.get('illvoi').counters ?? {})['+1/+1'], 2, 'drugi rzut nowej tury = drugi licznik');
});

// =============================================================================
// Grounded — aura odbierająca flying (losesKeywords)
// =============================================================================

test('Grounded: materializacja — aura z losesKeywords [flying]', () => {
  const data = gameObjectDataOf(REGISTRY.get('grounded'));
  assert.equal(data.kind, 'enchantment');
  assert.deepEqual(data.aura.losesKeywords, ['flying']);
  assert.equal(data.aura.pump, null);
});

function groundedAttached(state, hostId, hostKeywords = ['flying']) {
  mainPhase(state, 'p1');
  addRealCard(state, 'grounded-card', 'grounded', 'p1', 'hand');
  addMana(state, 'p1', 2);
  addSimpleCreature(state, hostId, 'p2', { power: 3, toughness: 3, keywords: hostKeywords });
  const cast = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'grounded-card', targets: [hostId] });
  assert.ok(cast.ok);
  passBoth(state);
  return state.objects.get(findId(state, 'grounded'));
}

test('Grounded: zaczarowany stwór traci flying; odłączenie przywraca', () => {
  const state = game();
  groundedAttached(state, 'flyer');
  assert.ok(!effectiveKeywords(state.objects.get('flyer'), state).includes('flying'), 'flying odebrany');
  // Odłączenie (aura do grobu) — flying wraca (warstwa liczona na żywo).
  const auraId = findId(state, 'grounded');
  moveObjectDirectly(state, auraId, 'graveyard', `grave-${state.objectSequence++}`);
  assert.ok(effectiveKeywords(state.objects.get('flyer'), state).includes('flying'), 'po odłączeniu flying wraca');
});

test('Grounded: warstwa ostatnia — wygrywa z grantem flying z innej aury', () => {
  const state = game();
  mainPhase(state, 'p1');
  addSimpleCreature(state, 'host', 'p2', { power: 2, toughness: 2 });
  // Najpierw Serra's Embrace (grant +2/+2, flying, vigilance), potem Grounded.
  addRealCard(state, 'embrace-card', 'serras-embrace', 'p1', 'hand');
  addMana(state, 'p1', 4);
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'embrace-card', targets: ['host'] }).ok);
  passBoth(state);
  const kws = effectiveKeywords(state.objects.get('host'), state);
  assert.ok(kws.includes('flying') && kws.includes('vigilance'), 'embrace daje flying i vigilance');
  // Grounded od drugiego gracza.
  addRealCard(state, 'grounded-card', 'grounded', 'p2', 'hand');
  addMana(state, 'p2', 2);
  mainPhase(state, 'p2');
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p2', objectId: 'grounded-card', targets: ['host'] }).ok);
  passBoth(state);
  const after = effectiveKeywords(state.objects.get('host'), state);
  assert.ok(!after.includes('flying'), 'Grounded odbiera flying mimo grantu');
  assert.ok(after.includes('vigilance'), 'vigilance zostaje');
});

test('Grounded: bez stwora na bitwisku rzut odrzucany (czysta aura wymaga celu)', () => {
  const state = game();
  mainPhase(state, 'p1');
  addRealCard(state, 'grounded-card', 'grounded', 'p1', 'hand');
  addMana(state, 'p1', 2);
  const res = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'grounded-card', targets: [] });
  assert.ok(!res.ok, 'brak celu = odrzucenie');
  assert.ok(res.events.some((e) => e.type === 'command_rejected') || res.error, 'odrzucenie maszynowo rozpoznawalne');
});

// =============================================================================
// Ruinous Rampage — sorcery modalny (damage_each_opponent / exile_all)
// =============================================================================

test('Ruinous Rampage: materializacja — dwa tryby modalnego sorcery', () => {
  const data = gameObjectDataOf(REGISTRY.get('ruinous-rampage'));
  assert.equal(data.kind, 'spell');
  assert.equal(data.spell.timing, 'sorcery');
  assert.equal(data.spell.modes.length, 2);
  assert.deepEqual(data.spell.modes[0].effects, [{ type: 'damage_each_opponent', amount: 3 }]);
  assert.equal(data.spell.modes[1].effects[0].type, 'exile_all');
  assert.deepEqual(data.spell.modes[1].effects[0].filter, { types: ['Artifact'], manaValueAtMost: 3 });
});

test('Ruinous Rampage: tryb obrażeń zadaje 3 każdemu przeciwnikowi (nie kontrolerowi)', () => {
  const state = game();
  mainPhase(state, 'p1');
  addRealCard(state, 'rampage', 'ruinous-rampage', 'p1', 'hand');
  addMana(state, 'p1', 3);
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'rampage', targets: [], modeIndex: 0 }).ok);
  passBoth(state);
  assert.equal(lifeOf(state, 'p2'), 17);
  assert.equal(lifeOf(state, 'p1'), 20, 'kontroler nie dostaje obrażeń');
});

test('Ruinous Rampage: tryb wygnania zdejmuje artefakty MV ≤ 3, droższe zostają', () => {
  const state = game();
  mainPhase(state, 'p1');
  addTestArtifact(state, 'art1', 'p1', 1);
  addTestArtifact(state, 'art2', 'p2', 2);
  addTestArtifact(state, 'art4', 'p2', 4);
  addSimpleCreature(state, 'beast', 'p2', { power: 2, toughness: 2 });
  addRealCard(state, 'rampage', 'ruinous-rampage', 'p1', 'hand');
  addMana(state, 'p1', 3);
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'rampage', targets: [], modeIndex: 1 }).ok);
  passBoth(state);
  // Klucz obiektu zmienia się przy zmianie strefy (CR 400.7) — szukamy po cardId.
  assert.ok(findId(state, 'test-artifact-1', 'exile'), 'MV 1 wygnane');
  assert.ok(findId(state, 'test-artifact-2', 'exile'), 'MV 2 wygnane (także u przeciwnika)');
  assert.ok(findId(state, 'test-artifact-4', 'battlefield'), 'MV 4 zostaje');
  assert.ok(findId(state, 'highland-game', 'battlefield'), 'nie-artefakt zostaje');
});

test('Ruinous Rampage: bez czerwonego źródła many rzut odrzucany', () => {
  const state = game();
  mainPhase(state, 'p1');
  addRealCard(state, 'island-1', 'basic-island', 'p1', 'battlefield');
  addRealCard(state, 'rampage', 'ruinous-rampage', 'p1', 'hand');
  addMana(state, 'p1', 3);
  const res = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'rampage', targets: [], modeIndex: 0 });
  assert.ok(!res.ok, 'sama niebieska mana nie rzuci {1}{R}{R}');
});

// =============================================================================
// Tellah, Great Sage — progi wydanej many 4+/8+ na triggerze noncreature
// =============================================================================

test('Tellah, Great Sage: materializacja — legendary 3/3 z 4 efektami triggera', () => {
  const def = REGISTRY.get('tellah-great-sage');
  const data = gameObjectDataOf(def);
  assert.equal(data.kind, 'creature');
  assert.ok(def.types.includes('Legendary'), 'nadtyp Legendary w linii typów definicji');
  const trigger = (data.abilities ?? []).find((a) => a.trigger?.event === 'you_cast_noncreature_spell');
  assert.ok(trigger, 'trigger noncreature spell');
  const effects = Array.isArray(trigger.effect) ? trigger.effect : [trigger.effect];
  assert.equal(effects.length, 4);
  assert.equal(effects[0].type, 'create_token');
  assert.deepEqual(effects[1].condition, { manaSpentAtLeast: 4 });
  assert.equal(effects[2].type, 'sacrifice_permanent');
  assert.deepEqual(effects[2].condition, { manaSpentAtLeast: 8 });
  assert.equal(effects[3].amountFrom, 'manaSpent');
});

test('Tellah, Great Sage: tani czar (<4 many) — tylko token Hero, bez draw i bez poświęcenia', () => {
  const state = game();
  mainPhase(state, 'p1');
  addRealCard(state, 'tellah', 'tellah-great-sage', 'p1', 'battlefield');
  addRealCard(state, 'lib-1', 'highland-game', 'p1', 'library');
  addTestInstant(state, 'cheap', 'p1', 2);
  addMana(state, 'p1', 2);
  const beforeHand = handSize(state, 'p1');
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'cheap', targets: [] }).ok);
  assert.equal(countByCardId(state, 'token_hero'), 1, 'token Hero 1/1 bezbarwny');
  passBoth(state);
  assert.equal(handSize(state, 'p1'), beforeHand - 1 + 1, 'draw z efektu czaru (1), nie z Tellah (+0)');
  assert.equal(state.objects.get('tellah').zone, 'battlefield', 'Tellah żyje');
  assert.equal(lifeOf(state, 'p2'), 20);
});

test('Tellah, Great Sage: czar za 4+ many — token i draw 2, Tellah zostaje', () => {
  const state = game();
  mainPhase(state, 'p1');
  addRealCard(state, 'tellah', 'tellah-great-sage', 'p1', 'battlefield');
  addRealCard(state, 'lib-1', 'highland-game', 'p1', 'library');
  addRealCard(state, 'lib-2', 'shatter', 'p1', 'library');
  addRealCard(state, 'lib-3', 'curate', 'p1', 'library');
  addTestInstant(state, 'mid', 'p1', 5);
  addMana(state, 'p1', 5);
  const beforeHand = handSize(state, 'p1');
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'mid', targets: [] }).ok);
  passBoth(state);
  assert.equal(handSize(state, 'p1'), beforeHand - 1 + 1 + 2, 'rzut (-1) + draw 1 z czaru + 2 z progu Tellah');
  assert.equal(countByCardId(state, 'token_hero'), 1);
  assert.equal(state.objects.get('tellah').zone, 'battlefield', 'próg 8 niespełniony');
});

test('Tellah, Great Sage: czar za 8+ many — Tellah poświęcony i zadaje 8 każdemu przeciwnikowi', () => {
  const state = game();
  mainPhase(state, 'p1');
  addRealCard(state, 'tellah', 'tellah-great-sage', 'p1', 'battlefield');
  addTestInstant(state, 'mega', 'p1', 8);
  addMana(state, 'p1', 8);
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'mega', targets: [] }).ok);
  assert.equal(countByCardId(state, 'token_hero'), 1, 'token też powstaje');
  assert.ok(findId(state, 'tellah-great-sage', 'graveyard'), 'Tellah poświęcony (klucz zmienia się przy zmianie strefy)');
  assert.equal(lifeOf(state, 'p2'), 12, '8 obrażeń każdemu przeciwnikowi');
  assert.equal(lifeOf(state, 'p1'), 20, 'kontroler nietknięty');
});

test('Tellah, Great Sage: rzut stwora NIE odpala triggera; prawo legend łapie dublet', () => {
  const state = game();
  mainPhase(state, 'p1');
  addRealCard(state, 'tellah', 'tellah-great-sage', 'p1', 'battlefield');
  addRealCard(state, 'beast', 'highland-game', 'p1', 'hand');
  addMana(state, 'p1', 2);
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'beast' }).ok);
  assert.equal(countByCardId(state, 'token_hero'), 0, 'stwór nie jest czarem noncreature');
  // Druga Tellah na bitwisku — prawo legend (M37) wymusza wybór.
  addRealCard(state, 'tellah-2', 'tellah-great-sage', 'p1', 'battlefield');
  passBoth(state);
  assert.equal(state.pendingLegendChoice?.playerId, 'p1');
  assert.equal(state.pendingLegendChoice?.name, 'Tellah, Great Sage');
  assert.ok(execute(state, { type: 'resolve_legend_choice', playerId: 'p1', keepId: 'tellah' }).ok);
  assert.equal(state.objects.get('tellah').zone, 'battlefield');
  assert.ok(!state.objects.has('tellah-2') && findId(state, 'tellah-great-sage', 'graveyard'), 'dublet w grobie (przekluczowany)');
});

// =============================================================================
// Etherium Sculptor — modyfikator kosztu artefaktów z permanentów
// =============================================================================

test('Etherium Sculptor: materializacja — static costModifier {spellTypes:[Artifact], amount:1}', () => {
  const def = REGISTRY.get('etherium-sculptor');
  const data = gameObjectDataOf(def);
  assert.equal(data.kind, 'creature', 'artefaktowy stwór materializuje się jako creature (typ Artifact zostaje w linii)');
  const statics = (data.abilities ?? []).filter((a) => a.type === 'static');
  assert.equal(statics.length, 1);
  assert.deepEqual(statics[0].costModifier, { spellTypes: ['Artifact'], amount: 1 });
});

test('Etherium Sculptor: rzut artefaktu tańszy o {1} — Pilgrim\'s Eye za 2 many', () => {
  const state = game();
  mainPhase(state, 'p1');
  addRealCard(state, 'sculptor', 'etherium-sculptor', 'p1', 'battlefield');
  addRealCard(state, 'eye', 'pilgrims-eye', 'p1', 'hand');
  assert.equal(effectiveSpellManaCost(state, state.objects.get('eye')), 2, '{3} → {2}');
  addMana(state, 'p1', 2);
  const res = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'eye' });
  assert.ok(res.ok, 'rzut za 2 many przechodzi ze Sculptorem');
  assert.ok(findId(state, 'pilgrims-eye', 'battlefield'), 'Pilgrim na bitwisku (rzut przekluczowuje obiekt)');
});

test('Etherium Sculptor: redukcja obejmuje tylko część generyczną (cap)', () => {
  const state = game();
  mainPhase(state, 'p1');
  addRealCard(state, 'sc1', 'etherium-sculptor', 'p1', 'battlefield');
  addRealCard(state, 'sc2', 'etherium-sculptor', 'p1', 'battlefield');
  addRealCard(state, 'lantern', 'seers-lantern', 'p1', 'hand');
  assert.equal(effectiveSpellManaCost(state, state.objects.get('lantern')), 1, '{3} - 2 = 1 (całość generyczna)');
  addRealCard(state, 'grounded', 'grounded', 'p1', 'hand');
  assert.equal(effectiveSpellManaCost(state, state.objects.get('grounded')), 2, 'nie-artefakt bez zniżki');
  // Trzeci Sculptor ({1}{U}) z dwiema zniżkami na stole: generyczna {1} - 2 → 0,
  // kolorowa {U} zostaje — koszt nigdy poniżej części kolorowej.
  addRealCard(state, 'sc3', 'etherium-sculptor', 'p1', 'hand');
  assert.equal(effectiveSpellManaCost(state, state.objects.get('sc3')), 1, 'cap: {1}{U} schodzi tylko do {U}');
});

test('Etherium Sculptor: oferta rzutu respektuje koszt efektywny; odejście przywraca cenę', () => {
  const state = game();
  mainPhase(state, 'p1');
  addRealCard(state, 'sculptor', 'etherium-sculptor', 'p1', 'battlefield');
  addRealCard(state, 'eye', 'pilgrims-eye', 'p1', 'hand');
  let view = playerView(state, 'p1');
  assert.ok(!hasCommand(view, 'cast_permanent', (c) => c.objectId === 'eye'), 'za 0 many brak oferty');
  addMana(state, 'p1', 2);
  view = playerView(state, 'p1');
  assert.ok(hasCommand(view, 'cast_permanent', (c) => c.objectId === 'eye'), 'za 2 many oferta ze zniżką');
  moveObjectDirectly(state, 'sculptor', 'graveyard', `grave-${state.objectSequence++}`);
  assert.equal(effectiveSpellManaCost(state, state.objects.get('eye')), 3, 'bez Sculptora cena wraca');
  view = playerView(state, 'p1');
  assert.ok(!hasCommand(view, 'cast_permanent', (c) => c.objectId === 'eye'), 'oferta znika');
});

test('Etherium Sculptor: wydana mana na evencie rzutu to koszt EFEKTYWNY (dla progów Tellah)', () => {
  const state = game();
  mainPhase(state, 'p1');
  addRealCard(state, 'sculptor', 'etherium-sculptor', 'p1', 'battlefield');
  addRealCard(state, 'eye', 'pilgrims-eye', 'p1', 'hand');
  addMana(state, 'p1', 2);
  const res = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'eye' });
  assert.ok(res.ok);
  const castEv = res.events.find((e) => e.type === 'permanent_cast');
  assert.ok(castEv, 'zdarzenie permanent_cast');
  assert.equal(castEv.manaSpent, 2, 'wydano 2 (nie 3) — próg Tellah liczy efektywną cenę');
});

// =============================================================================
// Boros Challenger — mentor (blokujący wybór celu) + aktywowany pump
// =============================================================================

test('Boros Challenger: materializacja — trigger mentora i pump {2}{R}{W}', () => {
  const data = gameObjectDataOf(REGISTRY.get('boros-challenger'));
  assert.equal(data.power, 2);
  assert.equal(data.toughness, 3);
  const mentor = (data.abilities ?? []).find((a) => a.trigger?.event === 'mentor_attacks');
  assert.ok(mentor, 'trigger mentor_attacks');
  const pump = (data.abilities ?? []).find((a) => a.type === 'activated');
  assert.deepEqual(pump.cost, { mana: 4 });
  assert.deepEqual(pump.effect, { type: 'pump', power: 1, toughness: 1 });
});

function mentorDeclared(state) {
  addRealCard(state, 'challenger', 'boros-challenger', 'p1', 'battlefield');
  addSimpleCreature(state, 'small', 'p1', { power: 1, toughness: 1 });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  const res = execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['challenger', 'small'] });
  assert.ok(res.ok);
  return state;
}

test('Boros Challenger: atak kolejkuje decyzję mentora i blokuje grę; licznik na celu', () => {
  const state = mentorDeclared(game());
  assert.equal(state.pendingMentorTargets.length, 1);
  assert.equal(state.pendingMentorTargets[0].playerId, 'p1');
  assert.deepEqual(state.pendingMentorTargets[0].candidateIds, ['small']);
  assert.ok(state.events.some((e) => e.type === 'mentor_target_required'));
  const view = playerView(state, 'p1');
  assert.ok(hasCommand(view, 'resolve_mentor_target', (c) => c.targetId === 'small'));
  assert.ok(!hasCommand(view, 'pass_priority'), 'decyzja mentora blokuje pass');
  assert.ok(execute(state, { type: 'resolve_mentor_target', playerId: 'p1', targetId: 'small' }).ok);
  assert.equal(state.objects.get('small').counters['+1/+1'], 1, 'cel dostał licznik');
  assert.equal(state.objects.get('challenger').zone, 'battlefield');
  assert.equal(state.pendingMentorTargets.length, 0);
  assert.ok(state.events.some((e) => e.type === 'mentor_target_resolved' && e.targetId === 'small'));
});

test('Boros Challenger: stwór o równej/większej sile nie jest kandydatem — bez decyzji', () => {
  const state = game();
  addRealCard(state, 'challenger', 'boros-challenger', 'p1', 'battlefield');
  addSimpleCreature(state, 'peer', 'p1', { power: 2, toughness: 2 });
  addSimpleCreature(state, 'big', 'p1', { power: 5, toughness: 5 });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['challenger', 'peer', 'big'] }).ok);
  assert.equal(state.pendingMentorTargets.length, 0, 'równa siła nie jest „lesser power\"');
  assert.equal(state.turn.step, 'declare_blockers', 'gra przeszła do deklaracji blokerów');
  const view = playerView(state, 'p2');
  assert.ok(hasCommand(view, 'pass_priority') || hasCommand(view, 'declare_blockers'), 'bez decyzji mentora gra toczy się dalej (priorytet obrońcy)');
});

test('Boros Challenger: cudza decyzja i celu-spoza-kandydatów nie wolno rozstrzygnąć', () => {
  const state = mentorDeclared(game());
  const wrong = execute(state, { type: 'resolve_mentor_target', playerId: 'p2', targetId: 'small' });
  assert.ok(!wrong.ok, 'p2 nie rozstrzyga decyzji p1');
  const self = execute(state, { type: 'resolve_mentor_target', playerId: 'p1', targetId: 'challenger' });
  assert.ok(!self.ok, 'sam Challenger nie jest legalnym celem (siła nie jest mniejsza)');
  assert.equal(state.pendingMentorTargets.length, 1, 'decyzja wciąż otwarta');
});

test('Boros Challenger: intervening — cel, który urósł przed rozstrzygnięciem, odrzucany; ślepy wpis znika', () => {
  const state = mentorDeclared(game());
  addCounter(state, 'small', '+1/+1', 2); // small 1/1 → 3/3 > 2 (siła Challangera)
  const res = execute(state, { type: 'resolve_mentor_target', playerId: 'p1', targetId: 'small' });
  assert.ok(!res.ok, 'cel z równą/większą siłą odpada (intervening)');
  // Ślepa głowa kolejki wygasa przy odrzuceniu (noEffect) — trigger bez efektu,
  // gra płynie dalej (priorytet przeszedł do obrońcy w declare_blockers).
  assert.equal(state.pendingMentorTargets.length, 0, 'ślepy wpis oczyszczony');
  assert.ok(state.events.some((e) => e.type === 'mentor_target_resolved' && e.noEffect === true));
  assert.equal(state.objects.get('small').counters['+1/+1'], 2, 'mentor nie dołożył trzeciego licznika');
  const pass = execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  assert.ok(pass.ok, 'po wygaszeniu triggera decyzja nie blokuje gry');
});

test('Boros Challenger: aktywowany pump {2}{R}{W} — +1/+1 do końca tury, bez many odrzucany', () => {
  const state = game();
  mainPhase(state, 'p1');
  addRealCard(state, 'challenger', 'boros-challenger', 'p1', 'battlefield');
  addMana(state, 'p1', 4);
  assert.ok(execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'challenger', abilityIndex: 1 }).ok);
  assert.equal(effectivePower(state.objects.get('challenger'), state), 3);
  assert.equal(effectiveToughness(state.objects.get('challenger'), state), 4);
  const poor = game();
  mainPhase(poor, 'p1');
  addRealCard(poor, 'challenger', 'boros-challenger', 'p1', 'battlefield');
  addMana(poor, 'p1', 3);
  const res = execute(poor, { type: 'activate_ability', playerId: 'p1', objectId: 'challenger', abilityIndex: 1 });
  assert.ok(!res.ok, 'za 3 many pump nie przechodzi');
});

// =============================================================================
// Pilgrim's Eye — ETB: szukaj basic landa do ręki (reveal + shuffle)
// =============================================================================

test('Pilgrim\'s Eye: materializacja — artefakt-stwór flying z ETB search', () => {
  const def = REGISTRY.get('pilgrims-eye');
  const data = gameObjectDataOf(def);
  assert.equal(data.kind, 'creature', 'artefaktowy stwór materializuje się jako creature');
  assert.ok(def.types.includes('Artifact') && def.types.includes('Creature'));
  assert.ok((def.keywords ?? []).includes('flying'));
  const etb = (data.abilities ?? []).find((a) => a.trigger?.event === 'enter_battlefield');
  assert.deepEqual(etb.effect, [{ type: 'search_library_to_hand', qualifier: { types: ['Basic', 'Land'] } }]);
});

test('Pilgrim\'s Eye: wejście bierze pierwszego basic landa z biblioteki do ręki', () => {
  const state = game();
  mainPhase(state, 'p1');
  addRealCard(state, 'lib-island', 'basic-island', 'p1', 'library');
  addRealCard(state, 'lib-mountain', 'basic-mountain', 'p1', 'library');
  addRealCard(state, 'lib-card', 'curate', 'p1', 'library');
  addRealCard(state, 'eye', 'pilgrims-eye', 'p1', 'hand');
  addMana(state, 'p1', 3);
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'eye' }).ok);
  const islandInHand = state.zones.hand.some((id) => state.objects.get(id)?.cardId === 'basic-island');
  assert.ok(islandInHand, 'basic land trafił do ręki');
  assert.ok(!state.zones.library.some((id) => state.objects.get(id)?.cardId === 'basic-island'), 'zniknął z biblioteki');
  assert.ok(state.events.some((e) => e.type === 'card_revealed' && e.cardId === 'basic-island'), 'karta ujawniona');
  assert.ok(state.events.some((e) => e.type === 'library_searched' && e.shuffled === true), 'biblioteka potasowana');
  assert.ok(findId(state, 'pilgrims-eye', 'battlefield'), 'Pilgrim na bitwisku');
});

test('Pilgrim\'s Eye: bez basic landów w bibliotece — brak znaleziska, tasowanie i tak przechodzi', () => {
  const state = game();
  mainPhase(state, 'p1');
  addRealCard(state, 'lib-card-1', 'curate', 'p1', 'library');
  addRealCard(state, 'lib-card-2', 'brute-force', 'p1', 'library');
  addRealCard(state, 'eye', 'pilgrims-eye', 'p1', 'hand');
  addMana(state, 'p1', 3);
  const handBefore = handSize(state, 'p1');
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'eye' }).ok);
  assert.equal(handSize(state, 'p1'), handBefore - 1, 'tylko rzucony Pilgrim zniknął z ręki');
  const searched = state.events.find((e) => e.type === 'library_searched');
  assert.ok(searched, 'zdarzenie przeszukania jest');
  assert.equal(searched.foundCardId, null, 'nic nie znaleziono (bez limitu czasu gry)');
});

// =============================================================================
// Dementia Bat — {4}{B}, poświęć: cel-gracz odrzuca 2 karty
// =============================================================================

test('Dementia Bat: materializacja — zdolność z kosztem sacrificeSelf i celem-oponentem', () => {
  const def = REGISTRY.get('dementia-bat');
  const data = gameObjectDataOf(def);
  assert.ok((def.keywords ?? []).includes('flying'));
  const ability = (data.abilities ?? []).find((a) => a.type === 'activated');
  assert.deepEqual(ability.cost, { mana: 5, sacrificeSelf: true });
  assert.deepEqual(ability.targets, [{ type: 'opponent' }]);
  assert.deepEqual(ability.effect, [{ type: 'discard_cards', amount: 2, applyTo: 'target' }]);
});

function addHandCard(state, id, controllerId, manaCost) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `test-hand-${manaCost}`, controllerId, zone: 'hand',
    kind: 'spell', manaCost, spell: { timing: 'instant', targets: [], effects: [] },
    abilities: [], keywords: [], subtypes: [], types: ['Instant'], colors: ['R'],
  });
}

test('Dementia Bat: aktywacja poświęca nietoperza; cel odrzuca 2 najdroższe karty', () => {
  const state = game();
  mainPhase(state, 'p1');
  addRealCard(state, 'bat', 'dementia-bat', 'p1', 'battlefield');
  addHandCard(state, 'h5', 'p2', 5);
  addHandCard(state, 'h3', 'p2', 3);
  addHandCard(state, 'h1', 'p2', 1);
  addMana(state, 'p1', 5);
  assert.ok(execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'bat', abilityIndex: 0, targets: ['p2'] }).ok);
  // Klucze obiektów zmieniają się przy zmianie strefy — asercje po cardId.
  assert.ok(findId(state, 'dementia-bat', 'graveyard'), 'nietoperz poświęcony (koszt)');
  assert.ok(findId(state, 'test-hand-5', 'graveyard'), 'najdroższa odrzucona');
  assert.ok(findId(state, 'test-hand-3', 'graveyard'), 'druga najdroższa odrzucona');
  assert.ok(findId(state, 'test-hand-1', 'hand'), 'najtańsza zostaje');
  assert.equal(state.events.filter((e) => e.type === 'card_discarded' && e.playerId === 'p2').length, 2);
});

test('Dementia Bat: ręka celu mniejsza niż 2 karty — odrzuca wszystko, co ma', () => {
  const state = game();
  mainPhase(state, 'p1');
  addRealCard(state, 'bat', 'dementia-bat', 'p1', 'battlefield');
  addHandCard(state, 'only', 'p2', 2);
  addMana(state, 'p1', 5);
  assert.ok(execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'bat', abilityIndex: 0, targets: ['p2'] }).ok);
  assert.ok(findId(state, 'test-hand-2', 'graveyard'), 'jedyna karta odrzucona');
  assert.equal(handSize(state, 'p2'), 0);
});

test('Dementia Bat: bez many aktywacja odrzucana; oferta wymaga celu-oponenta', () => {
  const state = game();
  mainPhase(state, 'p1');
  addRealCard(state, 'bat', 'dementia-bat', 'p1', 'battlefield');
  addHandCard(state, 'h1', 'p2', 1);
  addMana(state, 'p1', 4);
  const res = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'bat', abilityIndex: 0, targets: ['p2'] });
  assert.ok(!res.ok, 'za 4 many (koszt 5) nie przechodzi');
  addMana(state, 'p1', 1);
  const view = playerView(state, 'p1');
  assert.ok(hasCommand(view, 'activate_ability', (c) => c.objectId === 'bat' && (c.targets ?? []).includes('p2')), 'oferta z celem p2');
  assert.equal(state.objects.get('bat').zone, 'battlefield', 'bez aktywacji nietoperz żyje');
});

// =============================================================================
// Seer's Lantern — {T}: Add {C}; {2}, {T}: Scry 1
// =============================================================================

test('Seer\'s Lantern: materializacja — artefakt ze zdolnością many i scry', () => {
  const data = gameObjectDataOf(REGISTRY.get('seers-lantern'));
  assert.equal(data.kind, 'artifact');
  const abilities = data.abilities ?? [];
  assert.equal(abilities.length, 2);
  assert.deepEqual(abilities[0].cost, { tap: true });
  assert.deepEqual(abilities[0].effect, { type: 'add_mana', amount: 1 });
  assert.deepEqual(abilities[1].cost, { mana: 2, tap: true });
  assert.deepEqual(abilities[1].effect, { type: 'scry', amount: 1 });
});

test('Seer\'s Lantern: zdolność many daje 1 bezbarwną i tapuje latarnię', () => {
  const state = game();
  mainPhase(state, 'p1');
  addRealCard(state, 'lantern', 'seers-lantern', 'p1', 'battlefield');
  const manaBefore = state.players.find((p) => p.id === 'p1').mana;
  assert.ok(execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'lantern', abilityIndex: 0 }).ok);
  assert.equal(state.players.find((p) => p.id === 'p1').mana, manaBefore + 1);
  assert.equal(state.objects.get('lantern').tapped, true);
});

test('Seer\'s Lantern: scry 1 — wierzch zostaje albo schodzi na spód', () => {
  const state = game();
  mainPhase(state, 'p1');
  addRealCard(state, 'top-1', 'brute-force', 'p1', 'library');
  addRealCard(state, 'top-2', 'curate', 'p1', 'library');
  addRealCard(state, 'lantern', 'seers-lantern', 'p1', 'battlefield');
  addMana(state, 'p1', 2);
  // I. wierzch zostaje.
  assert.ok(execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'lantern', abilityIndex: 1 }).ok);
  assert.ok(state.pendingScry, 'scry blokuje grę');
  assert.ok(execute(state, { type: 'resolve_scry', playerId: 'p1' }).ok);
  assert.equal(state.zones.library.find((id) => state.objects.get(id)?.controllerId === 'p1'), 'top-1', 'wierzch bez zmian');
  passBoth(state);
  // II. wierzch na spód (odtapuj latarnię ręcznie — nowa aktywacja).
  state.objects.set('lantern', Object.freeze({ ...state.objects.get('lantern'), tapped: false }));
  mainPhase(state, 'p1');
  addMana(state, 'p1', 2);
  assert.ok(execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'lantern', abilityIndex: 1 }).ok);
  assert.ok(execute(state, { type: 'resolve_scry', playerId: 'p1', bottomIds: ['top-1'] }).ok);
  const ownLibrary = state.zones.library.filter((id) => state.objects.get(id)?.controllerId === 'p1');
  assert.equal(ownLibrary[0], 'top-2', 'po spodzie nowy wierzch');
  assert.equal(ownLibrary[ownLibrary.length - 1], 'top-1', 'stary wierzch na spodzie');
});

test('Seer\'s Lantern: scry bez 2 many niedostępny; latarnia nie jest lądem', () => {
  const state = game();
  mainPhase(state, 'p1');
  addRealCard(state, 'lantern', 'seers-lantern', 'p1', 'battlefield');
  addMana(state, 'p1', 1);
  const res = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'lantern', abilityIndex: 1 });
  assert.ok(!res.ok, 'za 1 manę (koszt 2) scry nie przechodzi');
  assert.equal(state.pendingScry, null);
});

// =============================================================================
// You're Confronted by Robbers — instant modalny (tap do 3 / 3 tokeny Soldier)
// =============================================================================

test('Robbers: materializacja — dwa tryby: variableTargets min 0 i 3 tokeny Soldier', () => {
  const data = gameObjectDataOf(REGISTRY.get('youre-confronted-by-robbers'));
  assert.equal(data.spell.timing, 'instant');
  assert.deepEqual(data.spell.modes[0].variableTargets, { type: 'creature', min: 0, max: 3 });
  assert.deepEqual(data.spell.modes[0].effects, [{ type: 'tap_permanents', applyTo: 'allChosen' }]);
  assert.equal(data.spell.modes[1].effects[0].type, 'create_token');
  assert.equal(data.spell.modes[1].effects[0].cardId, 'token_soldier');
  assert.equal(data.spell.modes[1].effects[0].amount, 3);
  assert.equal(data.spell.modes[1].effects[0].keywords, undefined, 'chatny Soldier bez lifelink (wspólny token)');
});

test('Robbers: tryb tapu obezwładnia wskazane stwory (dowolnego gracza), do 3 celów', () => {
  const state = game();
  mainPhase(state, 'p1');
  addSimpleCreature(state, 'foe1', 'p2', { power: 3, toughness: 3 });
  addSimpleCreature(state, 'foe2', 'p2', { power: 2, toughness: 2 });
  addRealCard(state, 'robbers', 'youre-confronted-by-robbers', 'p1', 'hand');
  addMana(state, 'p1', 4);
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'robbers', targets: ['foe2', 'foe1'], modeIndex: 0 }).ok);
  passBoth(state);
  assert.equal(state.objects.get('foe1').tapped, true);
  assert.equal(state.objects.get('foe2').tapped, true);
});

test('Robbers: „up to three" pozwala rzucić tryb bez żadnego celu', () => {
  const state = game();
  mainPhase(state, 'p1');
  addSimpleCreature(state, 'foe', 'p2', { power: 3, toughness: 3 });
  addRealCard(state, 'robbers', 'youre-confronted-by-robbers', 'p1', 'hand');
  addMana(state, 'p1', 4);
  const res = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'robbers', targets: [], modeIndex: 0 });
  assert.ok(res.ok, 'zero celów jest legalne (up to)');
  passBoth(state);
  assert.equal(state.objects.get('foe').tapped, false, 'nic nie zatapowane');
});

test('Robbers: tryb tokenów tworzy trzech 1/1 białych Soldierów pod kontrolą rzucającego', () => {
  const state = game();
  mainPhase(state, 'p1');
  addRealCard(state, 'robbers', 'youre-confronted-by-robbers', 'p1', 'hand');
  addMana(state, 'p1', 4);
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'robbers', targets: [], modeIndex: 1 }).ok);
  passBoth(state);
  assert.equal(countByCardId(state, 'token_soldier'), 3, 'trzy tokeny Soldier');
  for (const obj of state.objects.values()) {
    if (obj.cardId !== 'token_soldier' || obj.zone !== 'battlefield') continue;
    assert.equal(obj.controllerId, 'p1');
    assert.equal(effectivePower(obj, state), 1);
    assert.ok(!effectiveKeywords(obj, state).includes('lifelink'), 'chatny Soldier bez lifelink');
  }
});

test('Robbers: cztery cele odrzucane (max 3)', () => {
  const state = game();
  mainPhase(state, 'p1');
  for (const id of ['t1', 't2', 't3', 't4']) addSimpleCreature(state, id, 'p2', { power: 1, toughness: 1 });
  addRealCard(state, 'robbers', 'youre-confronted-by-robbers', 'p1', 'hand');
  addMana(state, 'p1', 4);
  const res = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'robbers', targets: ['t1', 't2', 't3', 't4'], modeIndex: 0 });
  assert.ok(!res.ok, 'więcej niż 3 cele jest nielegalne');
  assert.equal(state.objects.get('t1').tapped, false);
});

// =============================================================================
// Determinizm: replay z nowymi decyzjami (mentor, Tellah, discard, modal)
// =============================================================================

test('determinizm: replay z mentor/discard/Tellah/Robbers daje identyczny stan', () => {
  const build = () => {
    const state = game();
    mainPhase(state, 'p1');
    // Illvoi + dwa rzuty stworów (licznik za drugi).
    addRealCard(state, 'illvoi', 'illvoi-operative', 'p1', 'battlefield');
    addRealCard(state, 'c1', 'highland-game', 'p1', 'hand');
    addRealCard(state, 'c2', 'highland-game', 'p1', 'hand');
    addMana(state, 'p1', 4);
    execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'c1' });
    execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'c2' });
    // Dementia Bat — aktywacja (deterministyczny discard u p2).
    addRealCard(state, 'bat', 'dementia-bat', 'p1', 'battlefield');
    addHandCard(state, 'h5', 'p2', 5);
    addHandCard(state, 'h3', 'p2', 3);
    addMana(state, 'p1', 5);
    execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'bat', abilityIndex: 0, targets: ['p2'] });
    // Tellah — czar za 5 (token + draw 2).
    addRealCard(state, 'tellah', 'tellah-great-sage', 'p1', 'battlefield');
    addTestInstant(state, 'mid', 'p1', 5, { effects: [] });
    addMana(state, 'p1', 5);
    execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'mid', targets: [] });
    passBoth(state);
    // Mentor w fazie ataku.
    addRealCard(state, 'challenger', 'boros-challenger', 'p1', 'battlefield');
    addSimpleCreature(state, 'small', 'p1', { power: 1, toughness: 1 });
    state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
    execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['challenger', 'small'] });
    execute(state, { type: 'resolve_mentor_target', playerId: 'p1', targetId: 'small' });
    // Robbers — tokeny.
    addRealCard(state, 'robbers', 'youre-confronted-by-robbers', 'p1', 'hand');
    addMana(state, 'p1', 4);
    execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'robbers', targets: [], modeIndex: 1 });
    passBoth(state);
    return state;
  };
  const verification = verifyReplay(replayFromState(build()), build, execute);
  assert.equal(verification.deterministic, true);
});
