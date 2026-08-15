import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, execute, addObject, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { effectiveKeywords, effectivePower, untapControlled } from '../src/engine/permanents.js';
import { addMana } from '../src/engine/resources.js';

// =============================================================================
// Brązowa odznaka „wyłapywacz błędów" (sesja 2026-08-15, M101) — błędy vs
// zasady MtG znalezione w przeglądzie istniejących kart i mechanik.
// Każdy test jest RED przed naprawą i GREEN po niej (weryfikacja mutacyjna,
// L13). Numeracja B1..B10 zgodna z docs/plans/PLAN_2026-08-15-m101-*.md.
// =============================================================================

const REGISTRY = createCardRegistry();

function newState({ turnNumber = 5 } = {}) {
  const state = createGameState({ seed: 2026, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.number = turnNumber;
  return state;
}

function addRealCard(state, id, cardId, controllerId, zone) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, spell: data.spell, abilities: data.abilities ?? [],
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [], types: def.types ?? [],
    colors: data.colors ?? [], cardName: def.name,
    equipment: def.equipment, morph: def.morph, aura: def.aura, bestow: def.bestow,
    summoningSickness: false,
  });
  return state.objects.get(id);
}

function addCreature(state, id, controllerId, power, toughness, extra = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'x-test', controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost: 2, abilities: [], keywords: [],
    subtypes: [], types: ['Creature'], colors: [], summoningSickness: false, ...extra,
  });
  return state.objects.get(id);
}

function resolveStack(state, limit = 12) {
  for (let i = 0; i < limit && state.zones.stack.length > 0; i += 1) {
    const r = execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
    if (!r.ok) break;
  }
  return state.zones.stack.length === 0;
}

// ----------------------------------------------------------------- B1: equip
// CR 702.6b: „Equip only as a sorcery" — koszt equip aktywuje się WYŁĄCZNIE
// wtedy, gdy gracz mógłby rzucić sorcery (swoja faza main, pusty stos).
// Wszystkie 5 sprzętów katalogu ma to zdanie w Oracle text; kod pozwalał na
// equip w instant speed (audyt PR #41 pomylił 702.6a z 702.6b).

test('B1: equip NIE jest legalny w turze przeciwnika (CR 702.6b — only as a sorcery)', () => {
  const state = newState();
  addRealCard(state, 'sword', 'greatsword-of-tyr', 'p1', 'battlefield');
  addCreature(state, 'knight', 'p1', 2, 2);
  addMana(state, 'p1', 3, { colors: ['W'] });
  // Tura przeciwnika, krok blokujących — gracz ma priorytet, ale to nie jest
  // okno sorcery.
  state.turn = jumpToStep(state.turn, 'declare_blockers', 'p1');
  state.turn.activePlayerId = 'p2';
  const view = playerView(state, 'p1');
  const offered = view.legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === 'sword');
  assert.equal(offered, undefined, 'equip nie jest oferowany poza oknem sorcery');
  const r = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'sword', abilityIndex: 0, targets: ['knight'] });
  assert.equal(r.ok, false, 'equip w turze przeciwnika musi być odrzucony');
});

test('B1: equip NIE jest legalny przy niepustym stosie (CR 702.6b)', () => {
  const state = newState();
  addRealCard(state, 'cloak', 'cloak-of-the-bat', 'p1', 'battlefield');
  addCreature(state, 'carrier', 'p1', 2, 2);
  addMana(state, 'p1', 6, { colors: ['B'] });
  // Coś na stosie (czar przeciwnika) — okno sorcery zamknięte.
  addObject(state, {
    id: 'stackspell', instanceId: 'i-stackspell', cardId: 'x-spell', controllerId: 'p2',
    zone: 'stack', kind: 'spell', power: null, toughness: null, manaCost: 1,
    abilities: [], keywords: [], subtypes: [], types: ['Instant'], colors: [],
  });
  const view = playerView(state, 'p1');
  const offered = view.legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === 'cloak');
  assert.equal(offered, undefined, 'equip nie jest oferowany przy niepustym stosie');
  const r = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'cloak', abilityIndex: 0, targets: ['carrier'] });
  assert.equal(r.ok, false, 'equip przy niepustym stosie musi być odrzucony');
});

test('B1: equip w swojej fazie main przy pustym stosie działa jak dotąd', () => {
  const state = newState();
  addRealCard(state, 'sword', 'greatsword-of-tyr', 'p1', 'battlefield');
  addCreature(state, 'knight', 'p1', 2, 2);
  addMana(state, 'p1', 3, { colors: ['W'] });
  const view = playerView(state, 'p1');
  const offered = view.legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === 'sword');
  assert.ok(offered, 'equip oferowany w oknie sorcery');
  const r = execute(state, { ...offered, targets: ['knight'] });
  assert.ok(r.ok, 'equip w main phase: ' + (r.events?.[0]?.reason ?? ''));
  assert.ok(resolveStack(state), 'stos equipu rozstrzygnięty');
  assert.equal(state.objects.get('sword').attachedTo, 'knight', 'sprzęt założony');
});

// ------------------------------------------------------- B2: CR 611.2c zbiór
// CR 611.2c: efekt ciągły z czaru/zdolności, który modyfikuje cechy zbioru
// obiektów („creatures you control get +1/+1 until end of turn"), ustala ten
// zbiór W CHWILI ROZSTRZYGNIĘCIA. Permanent, który wszedł później, NIE jest
// objęty. Kod traktował te buffy jako „czytane przy każdym odczycie".

test('B2: buff „do końca tury" nie obejmuje stwora, który wszedł PO rozstrzygnięciu (CR 611.2c)', () => {
  const state = newState();
  addRealCard(state, 'temple', 'your-temple-is-under-attack', 'p1', 'hand');
  addCreature(state, 'old', 'p1', 2, 2);
  addMana(state, 'p1', 5, { colors: ['W'] });
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'temple', targets: [], modeIndex: 0 }).ok);
  assert.ok(resolveStack(state), 'czar rozstrzygnięty');
  assert.ok(effectiveKeywords(state.objects.get('old'), state).includes('indestructible'),
    'stwór obecny przy rozstrzygnięciu ma indestructible');
  addCreature(state, 'fresh', 'p1', 3, 3);
  assert.equal(effectiveKeywords(state.objects.get('fresh'), state).includes('indestructible'), false,
    'stwór, który wszedł później, NIE dostaje indestructible (CR 611.2c)');
});

test('B2: buff „creatures your opponents control get -X/-0" nie łapie później wchodzących (CR 611.2c)', () => {
  const state = newState();
  addRealCard(state, 'hb', 'hysterical-blindness', 'p1', 'hand');
  addCreature(state, 'enemy', 'p2', 3, 3);
  addMana(state, 'p1', 3, { colors: ['U'] });
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'hb', targets: [] }).ok);
  assert.ok(resolveStack(state), 'czar rozstrzygnięty');
  assert.equal(effectivePower(state.objects.get('enemy'), state), -1, 'obecny stwór przeciwnika -4/-0');
  addCreature(state, 'enemy2', 'p2', 5, 5);
  assert.equal(effectivePower(state.objects.get('enemy2'), state), 5,
    'stwór przeciwnika wchodzący później NIE dostaje -4/-0 (CR 611.2c)');
});

// -------------------------------------------------------------- B3: stun
// CR 122.1b (liczniki stun): „If a permanent with a stun counter on it would
// become untapped, remove one from it instead." Dotyczy KAŻDEGO odkręcania —
// w tym kroku odkręcania (untap step). Kod obsługiwał tylko untapObject.

test('B3: krok odkręcania honoruje licznik stun (CR 122.1b)', () => {
  const state = newState();
  addCreature(state, 'stunned', 'p1', 2, 2);
  state.objects.set('stunned', Object.freeze({
    ...state.objects.get('stunned'), tapped: true, counters: Object.freeze({ stun: 2 }),
  }));
  untapControlled(state, 'p1');
  const after = state.objects.get('stunned');
  assert.equal(after.tapped, true, 'permanent zostaje zatapniety (stun zamiast odkręcenia)');
  assert.equal((after.counters ?? {}).stun, 1, 'jeden licznik stun zdjęty');
  // Drugi untap step: zdejmuje ostatni licznik, wciąż bez odkręcenia.
  untapControlled(state, 'p1');
  const second = state.objects.get('stunned');
  assert.equal(second.tapped, true, 'nadal zatapniety przy ostatnim liczniku');
  assert.equal((second.counters ?? {}).stun ?? 0, 0, 'liczniki stun wyczerpane');
  // Trzeci untap step: brak liczników → normalne odkręcenie.
  untapControlled(state, 'p1');
  assert.equal(state.objects.get('stunned').tapped, false, 'bez liczników permanent się odkręca');
});

test('B3: stun nie blokuje zniknięcia choroby przywołania stwora bez tapped', () => {
  const state = newState();
  addCreature(state, 'sick', 'p1', 2, 2, { summoningSickness: true });
  untapControlled(state, 'p1');
  assert.equal(state.objects.get('sick').summoningSickness, false, 'choroba znika w untap step');
});

// ------------------------------------------------------- B4: face-down cechy
// CR 708.2: permanent twarzą w dół to bezimienny stwór 2/2 BEZ typów
// kreaturowych poza „Creature", bez podtypów, bez kosztu many (mana value 0)
// i BEZBARWNY. Kod zachowywał kolory, podtypy, koszt i nazwę karty.

test('B4: zakryty stwór jest bezbarwny, bezimienny, bez podtypów i o koszcie 0 (CR 708.2)', () => {
  const state = newState();
  const def = REGISTRY.get('monastery-flock');
  const data = gameObjectDataOf(def);
  addObject(state, {
    id: 'flock', instanceId: 'i-flock', cardId: 'monastery-flock', controllerId: 'p1', zone: 'hand',
    kind: data.kind, power: data.power, toughness: data.toughness, manaCost: data.manaCost,
    abilities: data.abilities ?? [], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
    types: def.types ?? [], colors: data.colors ?? [], cardName: def.name, morph: def.morph,
  });
  addMana(state, 'p1', 6, { colors: ['U'] });
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'flock', faceDown: true }).ok);
  assert.ok(resolveStack(state), 'czar face-down rozstrzygnięty');
  const fd = [...state.objects.values()].find((o) => o.zone === 'battlefield' && o.faceDown);
  assert.ok(fd, 'zakryty stwór na bitwisku');
  assert.deepEqual([...(fd.colors ?? [])], [], 'face-down jest bezbarwny (CR 708.2)');
  assert.deepEqual([...(fd.subtypes ?? [])], [], 'face-down nie ma podtypów (CR 708.2)');
  assert.equal(fd.manaCost, 0, 'face-down ma mana value 0 (CR 708.2)');
  assert.equal(fd.cardName ?? null, null, 'face-down nie ma nazwy (CR 708.2)');
  assert.equal(fd.power, 2, 'face-down to 2/2');
  assert.equal(fd.toughness, 2, 'face-down to 2/2');
  // cardId zostaje w obiekcie (FoW filtruje go w playerView) — to nośnik
  // tożsamości karty potrzebny przy obrocie twarzą do góry.
  assert.equal(fd.cardId, 'monastery-flock', 'cardId zachowany dla obrotu twarzą do góry');
});

test('B4: obrót twarzą do góry przywraca kolory, podtypy, koszt i nazwę karty', () => {
  const state = newState();
  const def = REGISTRY.get('monastery-flock');
  const data = gameObjectDataOf(def);
  addObject(state, {
    id: 'flock', instanceId: 'i-flock', cardId: 'monastery-flock', controllerId: 'p1', zone: 'hand',
    kind: data.kind, power: data.power, toughness: data.toughness, manaCost: data.manaCost,
    abilities: data.abilities ?? [], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
    types: def.types ?? [], colors: data.colors ?? [], cardName: def.name, morph: def.morph,
  });
  addMana(state, 'p1', 10, { colors: ['U'] });
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'flock', faceDown: true }).ok);
  assert.ok(resolveStack(state), 'czar face-down rozstrzygnięty');
  const fd = [...state.objects.values()].find((o) => o.zone === 'battlefield' && o.faceDown);
  const r = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: fd.id, abilityIndex: 0 });
  assert.ok(r.ok, 'morph twarzą do góry: ' + (r.events?.[0]?.reason ?? ''));
  const up = state.objects.get(fd.id);
  assert.equal(up.faceDown, false, 'stwór odsłonięty');
  assert.deepEqual([...(up.colors ?? [])], ['U'], 'kolory karty wrócily');
  assert.deepEqual([...(up.subtypes ?? [])], ['Bird'], 'podtypy karty wrócily');
  assert.equal(up.manaCost, 2, 'koszt many karty wrócil');
  assert.equal(up.cardName, 'Monastery Flock', 'nazwa karty wrócila');
  assert.ok(effectiveKeywords(up, state).includes('flying'), 'keywordy karty wrócily');
});
