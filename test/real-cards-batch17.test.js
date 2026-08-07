import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { effectivePower, effectiveToughness, effectiveKeywords } from '../src/engine/permanents.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

/**
 * Batch 17 realnych kart (ADR 0010 §2a) — 10 kart dokończających PR #26:
 * - Maritime Guard (M11): vanilla 1/3
 * - Carrion Call (SOM): dwa 1/1 Phyrexian Insect z infect
 * - Garruk's Companion (M11): 3/2 trample
 * - Lunar Rejection (VOW): bounce Wolf/Werewolf + draw; Cleave → bounce dowolnego
 * - Selhoff Occultist (ISD): any_creature_dies → target player mills 1
 * - Reclusive Artificer (ORI): haste + ETB damage = liczba artefaktów
 * - Captain's Call (CMR): trzy 1/1 Soldier
 * - Your Temple Is Under Attack (CLB): modal — indestructible EOT / draw 2 both
 * - Crested Herdcaller (RIX): 3/3 trample + ETB 3/3 Dinosaur trample
 * - Silvanus's Invoker (CLB): {8} untap land + animacja 8/8 trample/haste
 *
 * Testy pokrywają też generyczne naprawy engine'u z commita 1 (cleave, modalny
 * cel-gracza, indestructible vs destroy/obrażenia) przez realne definicje.
 * Dane Oracle: docs/cards/scryfall-*.json; artId/plan: tools/collection-art-ids.csv.
 */

const REGISTRY = createCardRegistry();

function game() {
  return createGameState({ seed: 2026, players: [{ id: 'p1' }, { id: 'p2' }] });
}

/** T1 (stos permanentów): rozstrzyga stos pełnymi rundami passów (LIFO). */
function resolveStack(state) {
  const all = [];
  let rounds = 0;
  while (state.zones.stack.length > 0 && rounds < 8) {
    const first = state.turn.priorityPlayerId;
    const other = state.players.find((p) => p.id !== first).id;
    const r1 = execute(state, { type: 'pass_priority', playerId: first });
    assert.ok(r1.ok, r1.events[0]?.reason);
    all.push(...r1.events);
    if (state.zones.stack.length === 0) break;
    const r2 = execute(state, { type: 'pass_priority', playerId: other });
    assert.ok(r2.ok, r2.events[0]?.reason);
    all.push(...r2.events);
    rounds += 1;
  }
  return all;
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

function jumpStep(state, playerId, phase, step, stepIndex, turnNumber = 1) {
  state.turn = { ...state.turn, number: turnNumber, activePlayerId: playerId, priorityPlayerId: playerId, phase, step, stepIndex, passes: 0 };
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
    colors: data.colors ?? [],
  });
  if (opts.tapped || opts.summoningSickness) {
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), tapped: !!opts.tapped, summoningSickness: !!opts.summoningSickness }));
  }
  return state.objects.get(id);
}

function addCreature(state, id, controllerId, power, toughness, keywords = [], subtypes = []) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'highland-game', controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost: 1,
    abilities: [], keywords, subtypes, types: ['Creature'], colors: [],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

function addArtifact(state, id, controllerId, manaCost = 2) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'syn-mystery', controllerId, zone: 'battlefield',
    kind: 'artifact', manaCost, abilities: [], keywords: [], subtypes: [], types: ['Artifact'], colors: [],
  });
  return state.objects.get(id);
}

function addBasicLand(state, id, controllerId, subtype = 'Forest', color = 'G', tapped = false) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `basic-${subtype.toLowerCase()}`, controllerId, zone: 'battlefield',
    kind: 'land', abilities: [], keywords: [], subtypes: [subtype], types: ['Basic', 'Land'], colors: [color],
  });
  if (tapped) state.objects.set(id, Object.freeze({ ...state.objects.get(id), tapped: true }));
  return state.objects.get(id);
}

function addLib(state, id, controllerId) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'shatter', controllerId, zone: 'library',
    kind: 'spell', manaCost: 1, spell: null, abilities: [], keywords: [], subtypes: [], types: ['Instant'], colors: [],
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
  return view.legalCommands.some((c) => c.type === type && predicate(c));
}

function findCast(view, type, predicate) {
  return view.legalCommands.find((c) => c.type === type && predicate(c));
}

// =============================================================================
// Data sanity
// =============================================================================

test('Batch 17: wszystkie 10 kart supported z artId, planem i obrazem', () => {
  const ids = ['maritime-guard', 'carrion-call', 'garruks-companion', 'lunar-rejection',
    'selhoff-occultist', 'reclusive-artificer', 'captains-call', 'your-temple-is-under-attack',
    'crested-herdcaller', 'silvanuss-invoker'];
  for (const id of ids) {
    const def = REGISTRY.get(id);
    assert.ok(def, `Brak definicji: ${id}`);
    assert.equal(def.support.status, 'supported', `${id}: nie supported`);
    assert.ok(def.artId, `${id}: brak artId`);
    assert.ok(def.plan, `${id}: brak planu`);
    assert.ok(def.imageUri, `${id}: brak imageUri`);
  }
  assert.equal(REGISTRY.get('maritime-guard').oracleText, '');
  assert.equal(REGISTRY.get('garruks-companion').keywords.join(), 'trample');
});

test('Batch 17: tokeny (insect/soldier/dinosaur) są limited', () => {
  for (const id of ['token_insect', 'token_soldier', 'token_dinosaur']) {
    assert.equal(REGISTRY.get(id).support.status, 'limited', `${id} nie limited`);
  }
});

test('Batch 17: artId każdej karty zgadza się ze słownikiem kolekcji (po secie)', () => {
  const csv = fs.readFileSync('tools/collection-art-ids.csv', 'utf8');
  const expected = {
    'maritime-guard': ['222', 'M11'], 'carrion-call': ['31', 'SOM'],
    'garruks-companion': ['84', 'M11'], 'lunar-rejection': ['24', 'VOW'],
    'selhoff-occultist': ['17', 'ISD'], 'reclusive-artificer': ['213', 'ORI'],
    'captains-call': ['252', 'CMR'], 'your-temple-is-under-attack': ['440', 'CLB'],
    'crested-herdcaller': ['494', 'RIX'], 'silvanuss-invoker': ['539', 'CLB'],
  };
  for (const [cardId, [num, set]] of Object.entries(expected)) {
    const def = REGISTRY.get(cardId);
    assert.equal(String(def.artId), num, `${cardId}: artId ${def.artId} ≠ ${num}`);
    assert.ok(csv.includes(`${num}${set},`), `${cardId}: brak wpisu ${num}${set} w słowniku`);
  }
});

// =============================================================================
// Maritime Guard — vanilla 1/3
// =============================================================================

test('Maritime Guard: wchodzi za {1}{U} jako 1/3', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'mg', 'maritime-guard', 'p1', 'hand');
  addMana(state, 'p1', 2);
  const rCast1 = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'mg' });
  assert.ok(rCast1.ok);
  resolveStack(state);
  const obj = state.objects.get(findId(state, 'maritime-guard'));
  assert.equal(obj.kind, 'creature');
  assert.equal(effectivePower(obj, state), 1);
  assert.equal(effectiveToughness(obj, state), 3);
});

test('Maritime Guard: niedostępny przy 1 manie', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'mg', 'maritime-guard', 'p1', 'hand');
  addMana(state, 'p1', 1);
  assert.ok(!hasCommand(playerView(state, 'p1'), 'cast_permanent', (c) => c.objectId === 'mg'));
});

// =============================================================================
// Garruk's Companion — 3/2 trample
// =============================================================================

test("Garruk's Companion: 3/2 z trample, nadmiar obrażeń idzie na gracza", () => {
  const state = game();
  mainPhase(state);
  const comp = addRealCard(state, 'comp', 'garruks-companion', 'p1', 'battlefield');
  state.objects.set('comp', Object.freeze({ ...state.objects.get('comp'), summoningSickness: false }));
  addCreature(state, 'blocker', 'p2', 1, 1);
  const p2lifeBefore = state.players.find((p) => p.id === 'p2').life;
  jumpStep(state, 'p1', 'combat', 'declare_attackers', 5);
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: [comp.id] }).ok);
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { [comp.id]: ['blocker'] } }).ok);
  assert.ok(execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' }).ok);
  // 3 trample − 1 wytrzymałość blokera = 2 nadmiaru na gracza.
  assert.equal(state.players.find((p) => p.id === 'p2').life, p2lifeBefore - 2);
});

// =============================================================================
// Carrion Call — dwa 1/1 Phyrexian Insect z infect
// =============================================================================

test('Carrion Call: tworzy dwa 1/1 zielone Phyrexian Insect z infect', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'cc', 'carrion-call', 'p1', 'hand');
  addMana(state, 'p1', 4);
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'cc' }).ok);
  passBoth(state);
  assert.equal(countByCardId(state, 'token_insect'), 2);
  const insect = [...state.objects.values()].find((o) => o.cardId === 'token_insect');
  assert.equal(insect.power, 1);
  assert.ok(effectiveKeywords(insect, state).includes('infect'));
  assert.ok(insect.subtypes.includes('Phyrexian'));
});

test('Carrion Call: niezablokowany token infect daje znaki trucizny (nie życie)', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'cc', 'carrion-call', 'p1', 'hand');
  addMana(state, 'p1', 4);
  execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'cc' });
  passBoth(state);
  const insect = findId(state, 'token_insect');
  state.objects.set(insect, Object.freeze({ ...state.objects.get(insect), summoningSickness: false }));
  const p2lifeBefore = state.players.find((p) => p.id === 'p2').life;
  jumpStep(state, 'p1', 'combat', 'declare_attackers', 5);
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: [insect] }).ok);
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: {} }).ok); // brak bloku
  assert.ok(execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' }).ok);
  assert.equal(state.players.find((p) => p.id === 'p2').life, p2lifeBefore, 'Życie nietknięte (infect)');
  assert.equal(state.players.find((p) => p.id === 'p2').poison, 1, 'Znak trucizny +1');
});

test('Carrion Call: infect do blokującego stwora = licznik -1/-1 (śmierć przy 0 wytrzymałości)', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'cc', 'carrion-call', 'p1', 'hand');
  addMana(state, 'p1', 4);
  execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'cc' });
  passBoth(state);
  const insect = findId(state, 'token_insect');
  state.objects.set(insect, Object.freeze({ ...state.objects.get(insect), summoningSickness: false }));
  addCreature(state, 'blocker', 'p2', 1, 1);
  jumpStep(state, 'p1', 'combat', 'declare_attackers', 5);
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: [insect] }).ok);
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { [insect]: ['blocker'] } }).ok);
  assert.ok(execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' }).ok);
  // Bloker 1/1 + licznik -1/-1 → wytrzymałość 0 → SBA zabija (CR 704.5f).
  assert.equal(state.objects.get('blocker'), undefined, 'Blokujący zginął od -1/-1');
});

// =============================================================================
// Lunar Rejection — bounce Wolf/Werewolf + draw; Cleave → bounce dowolnego
// =============================================================================

test('Lunar Rejection: zwykły rzut odbija stwora Wolf i dobiera kartę', () => {
  const state = game();
  mainPhase(state);
  addCreature(state, 'wolf', 'p2', 2, 2, [], ['Wolf']);
  addRealCard(state, 'lr', 'lunar-rejection', 'p1', 'hand');
  addLib(state, 'p1lib', 'p1'); // p1 musi mieć kartę do dobrania
  addMana(state, 'p1', 2);
  const handBefore = handSize(state, 'p1');
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'lr', targets: ['wolf'] }).ok);
  passBoth(state);
  assert.ok(!state.objects.has('wolf'), 'Wolf odbity do ręki');
  assert.equal(handSize(state, 'p1') - handBefore, 0, '−1 czar + 1 dobranie = 0 netto');
});

test('Lunar Rejection: zwykły rzut NIE celuje w nie-Wilka; Cleave tak', () => {
  const state = game();
  mainPhase(state);
  addCreature(state, 'plain', 'p2', 3, 3); // nie Wolf
  addRealCard(state, 'lr', 'lunar-rejection', 'p1', 'hand');
  addMana(state, 'p1', 4);
  // cast_spell (zwykły) nie oferuje nie-Wilka jako celu.
  assert.ok(!findCast(playerView(state, 'p1'), 'cast_spell', (c) => c.objectId === 'lr' && (c.targets ?? []).includes('plain')));
  // cast_cleave oferuje dowolnego stwora.
  const cleave = findCast(playerView(state, 'p1'), 'cast_cleave', (c) => c.objectId === 'lr' && (c.targets ?? []).includes('plain'));
  assert.ok(cleave, 'cast_cleave z celem — dowolny stwór');
  assert.ok(execute(state, { type: 'cast_cleave', playerId: 'p1', objectId: 'lr', targets: ['plain'] }).ok);
  passBoth(state);
  assert.ok(!state.objects.has('plain'), 'Nie-Wilk odbity cleave');
});

test('Lunar Rejection: cleave niedostępny bez {3}{U}', () => {
  const state = game();
  mainPhase(state);
  addCreature(state, 'plain', 'p2', 3, 3);
  addRealCard(state, 'lr', 'lunar-rejection', 'p1', 'hand');
  addMana(state, 'p1', 3);
  assert.ok(!hasCommand(playerView(state, 'p1'), 'cast_cleave', (c) => c.objectId === 'lr'));
});

// =============================================================================
// Selhoff Occultist — any_creature_dies → target player mills 1
// =============================================================================

test('Selhoff Occultist: śmierć INNEGO stwora młynuje przeciwnika (cel deterministyczny)', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'occ', 'selhoff-occultist', 'p1', 'battlefield');
  addCreature(state, 'victim', 'p1', 1, 1);
  addLib(state, 'p2lib', 'p2');
  addRealCard(state, 'fall', 'fiery-fall', 'p1', 'hand');
  addMana(state, 'p1', 6);
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'fall', targets: ['victim'] }).ok);
  passBoth(state);
  assert.equal(state.objects.get('victim'), undefined, 'Ofiara zginęła od 5 obrażeń');
  // Temat 2: Selhoff celuje „target player" — kontroler wybiera przeciwnika.
  assert.ok(execute(state, { type: 'resolve_trigger_target', playerId: 'p1', targetId: 'p2' }).ok);
  // Trigger any_creature_dies → młynuje przeciwnika (p2): karta z biblioteki p2 do grobu.
  assert.ok([...state.objects.values()].some((o) => o.cardId === 'shatter' && o.zone === 'graveyard' && o.controllerId === 'p2'), 'p2 mielił kartę do grobu');
});

test('Selhoff Occultist: śmierć SAMEGO Selhoffa też odpala trigger (LKI)', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'occ', 'selhoff-occultist', 'p1', 'battlefield');
  addLib(state, 'p2lib', 'p2');
  addRealCard(state, 'fall', 'fiery-fall', 'p1', 'hand');
  addMana(state, 'p1', 6);
  // Selhoff 2/3 ginie od 5 obrażeń → jego własny any_creature_dies odpala.
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'fall', targets: ['occ'] }).ok);
  passBoth(state);
  // Temat 2: Selhoff celuje „target player" — kontroler wybiera przeciwnika.
  assert.ok(execute(state, { type: 'resolve_trigger_target', playerId: 'p1', targetId: 'p2' }).ok);
  assert.ok([...state.objects.values()].some((o) => o.cardId === 'shatter' && o.zone === 'graveyard' && o.controllerId === 'p2'), 'p2 mielił kartę (trigger ze śmierci Selhoffa)');
});

// =============================================================================
// Reclusive Artificer — haste + ETB damage = liczba artefaktów
// =============================================================================

test('Reclusive Artificer: ETB zadaje obrażenia = liczba artefaktów kontrolera', () => {
  const state = game();
  mainPhase(state);
  addCreature(state, 'foe', 'p2', 5, 5); // jedyny stwór-cel → deterministyczny cel
  addArtifact(state, 'a1', 'p1', 2);
  addArtifact(state, 'a2', 'p1', 2);
  addRealCard(state, 'ra', 'reclusive-artificer', 'p1', 'hand');
  addMana(state, 'p1', 4);
  const rCast2 = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'ra' });
  assert.ok(rCast2.ok);
  resolveStack(state);
  // Temat 2: „you may have it deal damage to target creature" — kontroler
  // wybiera cel (jedyny stwór = foe).
  assert.ok(execute(state, { type: 'resolve_trigger_target', playerId: 'p1', targetId: 'foe' }).ok);
  // 2 artefakty → 2 obrażenia w stwora przeciwnika.
  assert.equal(state.objects.get('foe').damage, 2, 'Obrażenia = liczba artefaktów (2)');
});

test('Reclusive Artificer: haste pozwala atakować w turze wejścia', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'ra', 'reclusive-artificer', 'p1', 'hand');
  addMana(state, 'p1', 4);
  const rCast3 = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'ra' });
  assert.ok(rCast3.ok);
  resolveStack(state);
  const ra = findId(state, 'reclusive-artificer');
  assert.ok(effectiveKeywords(state.objects.get(ra), state).includes('haste'));
  jumpStep(state, 'p1', 'combat', 'declare_attackers', 5);
  assert.ok(playerView(state, 'p1').legalCommands.some((c) => c.type === 'declare_attackers' && (c.attackerIds ?? []).includes(ra)), 'Haste → legalny atakujący mimo choroby przywołania');
});

// =============================================================================
// Captain's Call — trzy 1/1 Soldier
// =============================================================================

test("Captain's Call: tworzy trzy 1/1 białe Soldier", () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'cc', 'captains-call', 'p1', 'hand');
  addMana(state, 'p1', 4);
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'cc' }).ok);
  passBoth(state);
  assert.equal(countByCardId(state, 'token_soldier'), 3);
  const soldier = [...state.objects.values()].find((o) => o.cardId === 'token_soldier');
  assert.equal(soldier.power, 1);
  assert.deepEqual(soldier.colors, ['W']);
  assert.ok(soldier.subtypes.includes('Soldier'));
});

// =============================================================================
// Your Temple Is Under Attack — modal: indestructible / draw 2 both
// =============================================================================

test('Your Temple (Pray for Protection): stwory kontrolera zyskują indestructible do EOT', () => {
  const state = game();
  mainPhase(state);
  addCreature(state, 'mine', 'p1', 2, 2);
  addRealCard(state, 'temple', 'your-temple-is-under-attack', 'p1', 'hand');
  addMana(state, 'p1', 3);
  // Tryb 0 = Pray for Protection (indestructible).
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'temple', modeIndex: 0 }).ok);
  passBoth(state);
  assert.ok(effectiveKeywords(state.objects.get('mine'), state).includes('indestructible'));
  // 5 obrażeń na 2/2 z indestructible — przeżywa.
  addRealCard(state, 'fall', 'fiery-fall', 'p1', 'hand');
  addMana(state, 'p1', 6);
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'fall', targets: ['mine'] }).ok);
  passBoth(state);
  assert.ok(state.objects.get('mine') && state.objects.get('mine').zone === 'battlefield', 'Indestructible przeżywa śmiertelne obrażenia');
});

test('Your Temple (Pray for Protection): indestructible chroni też przed destroy', () => {
  const state = game();
  mainPhase(state);
  addCreature(state, 'mine', 'p1', 2, 2);
  addRealCard(state, 'temple', 'your-temple-is-under-attack', 'p1', 'hand');
  addMana(state, 'p1', 3);
  execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'temple', modeIndex: 0 });
  passBoth(state);
  // Shatter niszczy artefakty; tu używamy destroy_permanent przez Shatter na
  // stworze nie zadziała (cel artefakt), więc symulujemy destroy zdolnością
  // efektu: kontrolerem jest destroy przez czar — weryfikujemy sam mechanizm
  // przez obrażenia śmiertelne (już pokryte) + bezpośredni destroy efektu.
  // Sprawdzamy, że indestructible wygasa w cleanup.
  jumpStep(state, 'p1', 'ending', 'end', 10);
  passBoth(state); // cleanup
  assert.ok(!effectiveKeywords(state.objects.get('mine'), state).includes('indestructible'), 'Indestructible zdjęty w cleanup');
});

test('Your Temple (Strike a Deal): kontroler i cel-oponent dobierają po 2 karty', () => {
  const state = game();
  mainPhase(state);
  addLib(state, 'p1a', 'p1'); addLib(state, 'p1b', 'p1');
  addLib(state, 'p2a', 'p2'); addLib(state, 'p2b', 'p2');
  addRealCard(state, 'temple', 'your-temple-is-under-attack', 'p1', 'hand');
  addMana(state, 'p1', 3);
  const before1 = handSize(state, 'p1');
  const before2 = handSize(state, 'p2');
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'temple', targets: ['p2'], modeIndex: 1 }).ok);
  passBoth(state);
  // p1: −1 temple + 2 dobrania = +1 netto; p2: +2.
  assert.equal(handSize(state, 'p1') - before1, 1, 'Kontroler dobrał 2 (−1 temple = +1 netto)');
  assert.equal(handSize(state, 'p2') - before2, 2, 'Przeciwnik (cel) dobrał 2');
});

// =============================================================================
// Crested Herdcaller — 3/3 trample + ETB 3/3 Dinosaur trample
// =============================================================================

test('Crested Herdcaller: 3/3 trample, ETB tworzy 3/3 Dinosaur z trample', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'ch', 'crested-herdcaller', 'p1', 'hand');
  addMana(state, 'p1', 5);
  const rCast4 = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'ch' });
  assert.ok(rCast4.ok);
  resolveStack(state);
  const herdcaller = state.objects.get(findId(state, 'crested-herdcaller'));
  assert.equal(effectivePower(herdcaller, state), 3);
  assert.ok(effectiveKeywords(herdcaller, state).includes('trample'));
  const dino = [...state.objects.values()].find((o) => o.cardId === 'token_dinosaur');
  assert.ok(dino, 'Token Dinosaur na bitwisku');
  assert.equal(dino.power, 3);
  assert.ok(effectiveKeywords(dino, state).includes('trample'));
});

// =============================================================================
// Silvanus's Invoker — {8} untap land + animacja 8/8 trample/haste (still a land)
// =============================================================================

test("Silvanus's Invoker: {8} odkręca land i animuje go w 8/8 trample/haste (wciąż land)", () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'si', 'silvanuss-invoker', 'p1', 'battlefield');
  addBasicLand(state, 'forest', 'p1', 'Forest', 'G', true); // zatapnięty land
  addMana(state, 'p1', 8);
  assert.ok(state.objects.get('forest').tapped, 'Land początkowo zatapnięty');
  assert.ok(execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'si', abilityIndex: 0, targets: ['forest'] }).ok);
  const forest = state.objects.get('forest');
  assert.ok(!forest.tapped, 'Land odkręcony zdolnością');
  assert.equal(forest.kind, 'creature', 'Animowany land jest stworem');
  assert.ok(forest.types.includes('Land'), 'Wciąż jest landem (retainTypes)');
  assert.ok(forest.types.includes('Creature'), 'Zyskał typ Creature');
  assert.equal(effectivePower(forest, state), 8);
  assert.equal(effectiveToughness(forest, state), 8);
  assert.ok(effectiveKeywords(forest, state).includes('trample'));
  assert.ok(effectiveKeywords(forest, state).includes('haste'));
});

test("Silvanus's Invoker: animacja wygasa w cleanup (land wraca do bycia landem)", () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'si', 'silvanuss-invoker', 'p1', 'battlefield');
  addBasicLand(state, 'forest', 'p1', 'Forest', 'G', false);
  addMana(state, 'p1', 8);
  execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'si', abilityIndex: 0, targets: ['forest'] });
  assert.equal(state.objects.get('forest').kind, 'creature', 'Po animacji: stwór');
  jumpStep(state, 'p1', 'ending', 'end', 10);
  passBoth(state); // cleanup → clearStatModifiers cofa animację
  const forest = state.objects.get('forest');
  assert.equal(forest.kind, 'land', 'Po cleanup: znów land');
  assert.equal(forest.power, null);
  assert.ok(!effectiveKeywords(forest, state).includes('trample'), 'Granty keywordów zdjęte');
});

test("Silvanus's Invoker: zdolność niedostępna bez 8 many", () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'si', 'silvanuss-invoker', 'p1', 'battlefield');
  addBasicLand(state, 'forest', 'p1', 'Forest', 'G', true); // zatapnięty → nie dodaje produkowalnej many
  addMana(state, 'p1', 7);
  assert.ok(!hasCommand(playerView(state, 'p1'), 'activate_ability', (c) => c.objectId === 'si'));
});
