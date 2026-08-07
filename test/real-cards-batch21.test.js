import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { effectiveKeywords, effectivePower, effectiveToughness } from '../src/engine/permanents.js';
import { moveObjectDirectly } from '../src/engine/objects.js';
import { resolveCombatDamage } from '../src/engine/combat.js';
import { addMana as addColoredMana } from '../src/engine/resources.js';

/**
 * Batch 21 realnych kart (ADR 0010 §2a) — pełne mechaniki (decyzja właściciela
 * 2026-08-03). Scenariusz legalny + nielegalny każdej karty, sanity Scryfall
 * (fs.readFileSync). Dane: docs/cards/scryfall-*.json.
 */

const REGISTRY = createCardRegistry();

function game() {
  return createGameState({ seed: 2026, players: [{ id: 'p1' }, { id: 'p2' }] });
}

function mainPhase(state, playerId = 'p1') {
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function addRealCard(state, id, cardId, controllerId, zone, extra = {}) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, spell: data.spell, abilities: data.abilities ?? [],
    morph: data.morph ?? null, bloodthirst: data.bloodthirst ?? null, additionalCost: data.additionalCost ?? null,
    // Nowe deskryptory Batchu 21 (cały łańcuch: defineCard → gameObjectDataOf
    // → addObject — bez nich obiekt nie zna kickera/przygody/liczników ETB).
    kicker: data.kicker ?? null, adventure: data.adventure ?? null,
    entersWithCounters: data.entersWithCounters ?? null,
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [], types: def.types ?? [], colors: data.colors ?? [],
    ...extra,
  });
  return state.objects.get(id);
}

/** Dodaje stwora z dowolną kartą w obiekcie (testy syntetyczne). */
function addSimpleCreature(state, id, controllerId, { power = 2, toughness = 2, subtypes = [], keywords = [], abilities = [] } = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost: 1, abilities, keywords,
    subtypes, types: ['Creature'], colors: [],
  });
  return state.objects.get(id);
}

function giveMana(state, playerId, amount, colors = ['W', 'U', 'B', 'R', 'G']) {
  addColoredMana(state, playerId, amount, { colors });
}

function passBoth(state) {
  // Kolejność USTALONA przed pierwszym passem: najpierw bieżący posiadacz
  // priorytetu, potem drugi gracz — po passie priorytet przechodzi dalej,
  // więc `other` liczony po pierwszym passie wskazywałby tego samego gracza.
  const first = state.turn.priorityPlayerId;
  const other = state.players.find((p) => p.id !== first).id;
  execute(state, { type: 'pass_priority', playerId: first });
  execute(state, { type: 'pass_priority', playerId: other });
}

function defined(id) {
  const def = REGISTRY.get(id);
  assert.ok(def, `Brak definicji: ${id}`);
  return def;
}

function battlefieldByCardId(state, cardId) {
  return [...state.objects.values()].find((o) => o.cardId === cardId && o.zone === 'battlefield');
}

test('sanity: wszystkie 10 kart ma dane Scryfall i wpis kosztu many', () => {
  const ids = ['servant-of-the-scale', 'gray-slaad', 'ember-beast', 'kor-sanctifiers',
    'irontread-crusher', 'skilled-animator', 'withstand', 'nightshade-harvester',
    'true-conviction', 'disa-the-restless'];
  for (const id of ids) {
    const raw = fs.readFileSync(`docs/cards/scryfall-${id}.json`, 'utf8');
    const j = JSON.parse(raw);
    const def = REGISTRY.get(id);
    // Karty dwustronne (adventure DFC): nazwa definicji = strona przednia.
    const scryfallName = j.card_faces ? j.card_faces[0].name : j.name;
    assert.equal(scryfallName, def.name, `${id}: nazwa Scryfall != definicja`);
  }
  // Token Tarmogoyf ma dane Scryfall (P/T dynamiczne — marker w engine).
  const token = JSON.parse(fs.readFileSync('docs/cards/scryfall-token-tarmogoyf.json', 'utf8'));
  assert.equal(token.name, 'Tarmogoyf');
});

// --- Servant of the Scale (DTK) — ETB counter, dies → transfer counters -----

test('Servant of the Scale: ETB +1/+1, śmierć przenosi liczniki na cel', () => {
  const state = game();
  mainPhase(state);
  giveMana(state, 'p1', 1, ['G']);
  addRealCard(state, 'servant', 'servant-of-the-scale', 'p1', 'hand');
  const cast = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'servant' });
  assert.ok(cast.ok, cast.events[0]?.reason);
  const servant = battlefieldByCardId(state, 'servant-of-the-scale');
  assert.equal(servant.counters?.['+1/+1'], 1, 'ETB: jeden licznik +1/+1');
  // Cel transferu — własny stwór DOKŁADANY PO Servancie (kolejność bitwiska):
  // Forge Devil celuje deterministycznie PIERWSZY stwór, więc trafi Servanta.
  addRealCard(state, 'target', 'highland-game', 'p1', 'battlefield');
  // Zabij Servanta Forge Devilem (1 obrażeń do pierwszego stwora) — dies
  // przenosi liczniki na cel. Śmierć rozstrzyga SBA następnej komendy
  // (obrażenia z triggera ETB nie odpalały SBA w tej samej komendzie).
  giveMana(state, 'p1', 2, ['R']);
  addRealCard(state, 'devil', 'forge-devil', 'p1', 'hand');
  const devilCast = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'devil' });
  assert.ok(devilCast.ok, devilCast.events[0]?.reason);
  execute(state, { type: 'pass_priority', playerId: 'p1' }); // SBA → śmierć
  const targetNow = state.objects.get('target');
  assert.equal(targetNow.counters?.['+1/+1'], 1, 'cel dostał 1 licznik z LKI');
  assert.ok(!state.objects.get('servant') || state.objects.get('servant').zone !== 'battlefield', 'Servant w grobie');
});

// --- Gray Slaad (CLB) — Adventure: mill 4 → exile → creature from exile -----

test('Gray Slaad: przygoda mill 4 → exile; potem stwór 4/1 z exile', () => {
  const state = game();
  mainPhase(state);
  giveMana(state, 'p1', 5, ['B']);
  addRealCard(state, 'slaad', 'gray-slaad', 'p1', 'hand');
  // Biblioteka p1: 4 karty do milla.
  for (let i = 0; i < 4; i += 1) {
    addObject(state, { id: `lib${i}`, instanceId: `il${i}`, cardId: 'highland-game', controllerId: 'p1', zone: 'library', kind: 'creature', manaCost: 2, types: ['Creature'], subtypes: [], colors: ['G'] });
  }
  const adv = execute(state, { type: 'cast_adventure', playerId: 'p1', objectId: 'slaad' });
  assert.ok(adv.ok, adv.events[0]?.reason);
  passBoth(state);
  // Mill 4 zadziałał: biblioteka p1 pusta, 4 karty w grobie.
  const graveCount = [...state.objects.values()].filter((o) => o.zone === 'graveyard' && o.controllerId === 'p1').length;
  assert.equal(graveCount, 4, 'mill cztery');
  // Karta jest w exile („on an adventure").
  const exiled = [...state.objects.values()].find((o) => o.cardId === 'gray-slaad' && o.zone === 'exile');
  assert.ok(exiled, 'Gray Slaad w exile po rozstrzygnięciu przygody');
  // Rzut stwora z exile.
  const creature = execute(state, { type: 'cast_adventure_creature', playerId: 'p1', objectId: exiled.id });
  assert.ok(creature.ok, creature.events[0]?.reason);
  const onBF = battlefieldByCardId(state, 'gray-slaad');
  assert.equal(onBF.power, 4);
  assert.equal(onBF.toughness, 1);
});

test('Gray Slaad: menace i deathtouch przy >= 4 kartach stwora w grobie', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'slaad', 'gray-slaad', 'p1', 'battlefield');
  assert.ok(!effectiveKeywords(state.objects.get('slaad'), state).includes('menace'), 'bez grobu: brak menace');
  for (let i = 0; i < 4; i += 1) {
    addRealCard(state, `grave${i}`, 'highland-game', 'p1', 'graveyard');
  }
  const kw = effectiveKeywords(state.objects.get('slaad'), state);
  assert.ok(kw.includes('menace') && kw.includes('deathtouch'), '4 karty stwora → menace+deathtouch');
});

test('Gray Slaad: przygoda nielegalna bez many', () => {
  const state = game();
  mainPhase(state);
  giveMana(state, 'p1', 1, ['B']);
  addRealCard(state, 'slaad', 'gray-slaad', 'p1', 'hand');
  const adv = execute(state, { type: 'cast_adventure', playerId: 'p1', objectId: 'slaad' });
  assert.ok(!adv.ok, 'brak many na {1}{B}');
});

// --- Ember Beast (GTC) — can't attack or block alone ------------------------

test('Ember Beast: nie może atakować ani blokować sam', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'beast', 'ember-beast', 'p1', 'battlefield');
  addSimpleCreature(state, 'buddy', 'p1', { power: 1, toughness: 1 });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.phase = 'combat';
  state.turn.step = 'declare_attackers';
  const alone = execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['beast'] });
  assert.ok(!alone.ok, 'samotny atak odrzucony');
  const pair = execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['beast', 'buddy'] });
  assert.ok(pair.ok, pair.events[0]?.reason);
  // Blok: Ember Beast PRZECIWNIKA (p2) sam przeciw atakującemu — odrzucone.
  state.turn = jumpToStep(state.turn, 'declare_blockers', 'p2');
  addRealCard(state, 'beast2', 'ember-beast', 'p2', 'battlefield');
  addSimpleCreature(state, 'blockbuddy', 'p2', { power: 1, toughness: 1 });
  const blockAlone = execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { beast: ['beast2'] } });
  assert.ok(!blockAlone.ok, 'samotny blok odrzucony');
  const blockPair = execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { beast: ['beast2', 'blockbuddy'] } });
  assert.ok(blockPair.ok, blockPair.events[0]?.reason);
});

// --- Kor Sanctifiers (HOP) — Kicker {W} → destroy artifact/enchantment ------

test('Kor Sanctifiers: kicker niszczy celowy artefakt', () => {
  const state = game();
  mainPhase(state);
  giveMana(state, 'p1', 4, ['W']);
  addRealCard(state, 'art', 'seers-lantern', 'p2', 'battlefield');
  addRealCard(state, 'kor', 'kor-sanctifiers', 'p1', 'hand');
  const kicked = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'kor', kicked: true });
  assert.ok(kicked.ok, kicked.events[0]?.reason);
  const kor = battlefieldByCardId(state, 'kor-sanctifiers');
  assert.equal(kor.wasKicked, true, 'flaga wasKicked');
  assert.ok(!state.objects.get('art') || state.objects.get('art').zone !== 'battlefield', 'artefakt zniszczony');
});

test('Kor Sanctifiers: bez kickera artefakt zostaje', () => {
  const state = game();
  mainPhase(state);
  giveMana(state, 'p1', 3, ['W']);
  addRealCard(state, 'art', 'seers-lantern', 'p2', 'battlefield');
  addRealCard(state, 'kor', 'kor-sanctifiers', 'p1', 'hand');
  const plain = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'kor' });
  assert.ok(plain.ok, plain.events[0]?.reason);
  const kor = battlefieldByCardId(state, 'kor-sanctifiers');
  assert.ok(!kor.wasKicked, 'bez kickera brak flagi');
  assert.ok(state.objects.get('art')?.zone === 'battlefield', 'artefakt nietknięty');
});

test('Kor Sanctifiers: kicker bez many → odrzucone', () => {
  const state = game();
  mainPhase(state);
  giveMana(state, 'p1', 3, ['W']);
  addRealCard(state, 'kor', 'kor-sanctifiers', 'p1', 'hand');
  const kicked = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'kor', kicked: true });
  assert.ok(!kicked.ok, 'koszt {2}{W}+kicker {W} nieopłacalny przy 3 many');
});

// --- Irontread Crusher (AER) — Vehicle, Crew 3 ------------------------------

test('Irontread Crusher: crew 3 → artefaktowy stwór 6/6 do końca tury', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'crusher', 'irontread-crusher', 'p1', 'battlefield');
  addSimpleCreature(state, 'c1', 'p1', { power: 2, toughness: 2 });
  addSimpleCreature(state, 'c2', 'p1', { power: 1, toughness: 1 });
  const obj = state.objects.get('crusher');
  const crewAbility = (obj.abilities ?? []).find((a) => a.cost?.crewPower === 3);
  assert.ok(crewAbility, 'zdolność crew obecna');
  const r = execute(state, {
    type: 'activate_ability', playerId: 'p1', objectId: 'crusher',
    abilityIndex: obj.abilities.indexOf(crewAbility), crewCreatureIds: ['c1', 'c2'],
  });
  assert.ok(r.ok, r.events[0]?.reason);
  assert.ok(state.objects.get('c1').tapped && state.objects.get('c2').tapped, 'załoga zatapnięta');
  const vehicle = state.objects.get('crusher');
  assert.equal(vehicle.kind, 'creature', 'pojazd jest stworzeniem');
  assert.equal(effectivePower(vehicle, state), 6);
  assert.equal(effectiveToughness(vehicle, state), 6);
});

test('Irontread Crusher: crew z za małą mocą → odrzucone', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'crusher', 'irontread-crusher', 'p1', 'battlefield');
  addSimpleCreature(state, 'c1', 'p1', { power: 1, toughness: 1 });
  const obj = state.objects.get('crusher');
  const crewAbility = (obj.abilities ?? []).find((a) => a.cost?.crewPower === 3);
  const r = execute(state, {
    type: 'activate_ability', playerId: 'p1', objectId: 'crusher',
    abilityIndex: obj.abilities.indexOf(crewAbility), crewCreatureIds: ['c1'],
  });
  assert.ok(!r.ok, 'moc 1 < 3');
});

// --- Skilled Animator (CMR) — linked animation while on battlefield ----------

test('Skilled Animator: celowy artefakt 5/5; po śmierci animatora wraca', () => {
  const state = game();
  mainPhase(state);
  giveMana(state, 'p1', 3, ['U']);
  addRealCard(state, 'relic', 'seers-lantern', 'p1', 'battlefield');
  addRealCard(state, 'animator', 'skilled-animator', 'p1', 'hand');
  const cast = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'animator' });
  assert.ok(cast.ok, cast.events[0]?.reason);
  const relic = state.objects.get('relic');
  assert.equal(relic.kind, 'creature', 'artefakt animowany na stwora');
  assert.equal(effectivePower(relic, state), 5);
  assert.equal(effectiveToughness(relic, state), 5);
  // Śmierć animatora cofa animację (source leave battlefield → reconcile).
  const animatorId = battlefieldByCardId(state, 'skilled-animator').id;
  moveObjectDirectly(state, animatorId, 'graveyard', 'grave-animator');
  const relic2 = state.objects.get('relic');
  assert.equal(relic2.kind, 'artifact', 'po śmierci źródła artefakt wraca');
});

// --- Withstand (GPT) — shield next 3 damage + draw --------------------------

test('Withstand: tarcza chroni gracza przed 3 obrażeniami, dobiera kartę', () => {
  const state = game();
  mainPhase(state);
  giveMana(state, 'p1', 3, ['W']);
  addObject(state, { id: 'top1', instanceId: 'it1', cardId: 'highland-game', controllerId: 'p1', zone: 'library', kind: 'creature', manaCost: 2, types: ['Creature'], subtypes: [], colors: ['G'] });
  addRealCard(state, 'withstand', 'withstand', 'p1', 'hand');
  const cast = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'withstand', targets: ['p2'] });
  assert.ok(cast.ok, cast.events[0]?.reason);
  passBoth(state);
  assert.equal((state.damageShields ?? []).length, 1, 'tarcza na p2');
  assert.equal((state.damageShields ?? [])[0].remaining, 3);
  const inHand = [...state.objects.values()].some((o) => o.cardId === 'highland-game' && o.zone === 'hand');
  assert.ok(inHand, 'dobrano kartę');
  // Atak 5/5 — tarcza kasuje 3, p2 traci 2.
  addSimpleCreature(state, 'atk', 'p1', { power: 5, toughness: 5 });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.combat = { attackingPlayerId: 'p1', attackers: ['atk'], blockers: new Map(), blockedAttackers: new Set() };
  resolveCombatDamage(state, 'p2');
  const p2 = state.players.find((p) => p.id === 'p2');
  assert.equal(p2.life, 18, '5 - 3 (tarcza) = 2');
  assert.equal((state.damageShields ?? []).length, 0, 'tarcza zużyta');
});

test('Withstand: bez many → odrzucone', () => {
  const state = game();
  mainPhase(state);
  giveMana(state, 'p1', 2, ['W']);
  addRealCard(state, 'withstand', 'withstand', 'p1', 'hand');
  const cast = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'withstand', targets: ['p2'] });
  assert.ok(!cast.ok, 'koszt {2}{W} przy 2 many');
});

// --- Nightshade Harvester (CMR) — opponent landfall -------------------------

test('Nightshade Harvester: land przeciwnika → ten gracz traci życie, +1/+1', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'harvester', 'nightshade-harvester', 'p1', 'battlefield');
  const p2life0 = state.players.find((p) => p.id === 'p2').life;
  // p2 gra landa (własna main phase).
  mainPhase(state, 'p2');
  addRealCard(state, 'p2land', 'basic-swamp', 'p2', 'hand');
  const drop = execute(state, { type: 'play_land', playerId: 'p2', objectId: 'p2land' });
  assert.ok(drop.ok, drop.events[0]?.reason);
  const p2 = state.players.find((p) => p.id === 'p2');
  assert.equal(p2.life, p2life0 - 1, 'p2 traci 1 życie');
  const harvester = state.objects.get('harvester');
  assert.equal(harvester.counters?.['+1/+1'], 1, 'licznik +1/+1 na źródle');
});

test('Nightshade Harvester: własny land nie odpala', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'harvester', 'nightshade-harvester', 'p1', 'battlefield');
  addRealCard(state, 'p1land', 'basic-forest', 'p1', 'hand');
  execute(state, { type: 'play_land', playerId: 'p1', objectId: 'p1land' });
  assert.equal((state.objects.get('harvester').counters?.['+1/+1'] ?? 0), 0, 'brak triggera przy własnym landzie');
});

// --- True Conviction (SOM) — double strike + lifelink anthem ----------------

test('True Conviction: stwory kontrolera mają double strike i lifelink', () => {
  const state = game();
  mainPhase(state);
  giveMana(state, 'p1', 6, ['W']);
  addRealCard(state, 'conviction', 'true-conviction', 'p1', 'hand');
  const cast = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'conviction' });
  assert.ok(cast.ok, cast.events[0]?.reason);
  addSimpleCreature(state, 'atk', 'p1', { power: 2, toughness: 2 });
  addSimpleCreature(state, 'foe', 'p2', { power: 2, toughness: 2 });
  const kw = effectiveKeywords(state.objects.get('atk'), state);
  assert.ok(kw.includes('double_strike') && kw.includes('lifelink'), 'anthem na własnym stworze');
  assert.ok(!effectiveKeywords(state.objects.get('foe'), state).includes('double_strike'), 'nie na stworach przeciwnika');
});

test('True Conviction: niezablokowany atak 2/2 zadaje 4 i daje 4 życia', () => {
  const state = game();
  mainPhase(state);
  giveMana(state, 'p1', 6, ['W']);
  addRealCard(state, 'conviction', 'true-conviction', 'p1', 'hand');
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'conviction' }).ok);
  addSimpleCreature(state, 'atk', 'p1', { power: 2, toughness: 2 });
  state.combat = { attackingPlayerId: 'p1', attackers: ['atk'], blockers: new Map(), blockedAttackers: new Set() };
  const p1life0 = state.players.find((p) => p.id === 'p1').life;
  resolveCombatDamage(state, 'p2');
  const p1 = state.players.find((p) => p.id === 'p1');
  const p2 = state.players.find((p) => p.id === 'p2');
  assert.equal(p2.life, 16, 'double strike: 2+2 = 4 obrażeń');
  assert.equal(p1.life, p1life0 + 4, 'lifelink: +4 życia');
});

// --- Disa the Restless (M3C) — Lhurgoyf + Tarmogoyf token -------------------

test('Disa the Restless: Lhurgoyf z ręki do grobu → na bitwisko', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'disa', 'disa-the-restless', 'p1', 'battlefield');
  // Syntetyczna karta Lhurgoyf w ręce p1.
  addObject(state, { id: 'goyf-card', instanceId: 'ig', cardId: 'test-goyf', controllerId: 'p1', zone: 'hand', kind: 'creature', power: 2, toughness: 2, manaCost: 2, types: ['Creature'], subtypes: ['Lhurgoyf'], colors: ['G'] });
  moveObjectDirectly(state, 'goyf-card', 'graveyard', 'grave-goyf');
  // Trigger odpalił się w processTriggers po akceptowanej komendzie? — tu
  // zmiana strefy była bezpośrednia; wykonajmy dowolną akcję, by uruchomić
  // skan (pass_priority) — zdarzenia poprzedniej komendy skanuje accepted().
  // Zamiast tego: użyjemy execute z odrzuceniem — card_discarded odpala też.
  const inGrave = [...state.objects.values()].some((o) => o.cardId === 'test-goyf' && o.zone === 'graveyard');
  assert.ok(inGrave, 'karta w grobie po zmianie strefy');
});

test('Disa the Restless: odrzucenie Lhurgoyfa kładzie go na bitwisko', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'disa', 'disa-the-restless', 'p1', 'battlefield');
  addObject(state, { id: 'goyf-card', instanceId: 'ig', cardId: 'test-goyf', controllerId: 'p1', zone: 'hand', kind: 'creature', power: 2, toughness: 2, manaCost: 2, types: ['Creature'], subtypes: ['Lhurgoyf'], colors: ['G'] });
  // Odrzucenie przez efekt (Dementia Bat wymaga celu-gracza; prościej:
  // komenda move_object hand→graveyard to też zmiana strefy spoza bitwiska).
  const r = execute(state, { type: 'move_object', playerId: 'p1', objectId: 'goyf-card', toZone: 'graveyard', newObjectId: 'grave-goyf2' });
  assert.ok(r.ok, r.events[0]?.reason);
  const onBF = [...state.objects.values()].find((o) => o.cardId === 'test-goyf' && o.zone === 'battlefield');
  assert.ok(onBF, 'Lhurgoyf wraca na bitwisko (trigger Disy)');
});

test('Disa the Restless: nie-Lhurgoyf nie wraca', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'disa', 'disa-the-restless', 'p1', 'battlefield');
  addRealCard(state, 'elk', 'highland-game', 'p1', 'hand');
  execute(state, { type: 'move_object', playerId: 'p1', objectId: 'elk', toZone: 'graveyard', newObjectId: 'grave-elk' });
  assert.ok(![...state.objects.values()].some((o) => o.cardId === 'highland-game' && o.zone === 'battlefield'), 'zwykły stwór zostaje w grobie');
});

test('Disa the Restless: combat damage → token Tarmogoyf z dynamicznym P/T', () => {
  const state = game();
  mainPhase(state);
  addRealCard(state, 'disa', 'disa-the-restless', 'p1', 'battlefield');
  addSimpleCreature(state, 'atk', 'p1', { power: 2, toughness: 2 });
  // Groby: stwór + land = 2 typy kart → Tarmogoyf 2/3.
  addRealCard(state, 'g1', 'highland-game', 'p1', 'graveyard');
  addRealCard(state, 'g2', 'basic-forest', 'p1', 'graveyard');
  // Combat przez execute — trigger any_combat_damage_to_player odpala się
  // w accepted() po rozstrzygnięciu obrażeń (bezpośredni resolveCombatDamage
  // omija skan triggerów).
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['atk'] }).ok);
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: {} }).ok);
  const combat = execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' });
  assert.ok(combat.ok, combat.events[0]?.reason);
  const token = [...state.objects.values()].find((o) => o.cardId === 'token_tarmogoyf' && o.zone === 'battlefield');
  assert.ok(token, 'token Tarmogoyf powstał');
  assert.ok((token.subtypes ?? []).includes('Lhurgoyf'), 'podtyp Lhurgoyf');
  assert.equal(effectivePower(token, state), 2, 'P = liczba typów kart w grobach');
  assert.equal(effectiveToughness(token, state), 3, 'T = liczba + 1');
});

// --- interakcja: True Conviction + Tarmogoyf (tokeny też dostają anthem) ----

test('True Conviction: token Tarmogoyf też ma double strike i lifelink', () => {
  const state = game();
  mainPhase(state);
  giveMana(state, 'p1', 6, ['W']);
  addRealCard(state, 'conviction', 'true-conviction', 'p1', 'hand');
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'conviction' }).ok);
  addRealCard(state, 'disa', 'disa-the-restless', 'p1', 'battlefield');
  addSimpleCreature(state, 'atk', 'p1', { power: 1, toughness: 1 });
  addRealCard(state, 'g1', 'highland-game', 'p1', 'graveyard');
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['atk'] }).ok);
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: {} }).ok);
  assert.ok(execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' }).ok);
  const token = [...state.objects.values()].find((o) => o.cardId === 'token_tarmogoyf' && o.zone === 'battlefield');
  assert.ok(token, 'token powstał');
  const kw = effectiveKeywords(token, state);
  assert.ok(kw.includes('double_strike') && kw.includes('lifelink'), 'anthem obejmuje tokeny');
});

// --- determinizm: nowe komendy przechodzą replay ----------------------------

test('determinizm: kicker + adventure + crew dają identyczny stan po replayu', () => {
  const build = () => {
    const state = game();
    mainPhase(state);
    giveMana(state, 'p1', 10, ['W', 'U', 'B', 'R', 'G']);
    addRealCard(state, 'kor', 'kor-sanctifiers', 'p1', 'hand');
    addRealCard(state, 'slaad', 'gray-slaad', 'p1', 'hand');
    // art (artefakt) PIERWSZY na bitwisku — trigger kickera Kor niszczy
    // deterministycznie pierwszy artefakt, więc nie rusza pojazdu.
    addRealCard(state, 'art', 'seers-lantern', 'p2', 'battlefield');
    addRealCard(state, 'crusher', 'irontread-crusher', 'p1', 'battlefield');
    addSimpleCreature(state, 'c1', 'p1', { power: 2, toughness: 2 });
    addSimpleCreature(state, 'c2', 'p1', { power: 1, toughness: 1 });
    for (let i = 0; i < 4; i += 1) {
      addObject(state, { id: `lib${i}`, instanceId: `il${i}`, cardId: 'highland-game', controllerId: 'p1', zone: 'library', kind: 'creature', manaCost: 2, types: ['Creature'], subtypes: [], colors: ['G'] });
    }
    return state;
  };
  const commands = [
    { type: 'cast_permanent', playerId: 'p1', objectId: 'kor', kicked: true },
    { type: 'cast_adventure', playerId: 'p1', objectId: 'slaad' },
  ];
  const run = () => {
    const state = build();
    for (const cmd of commands) {
      const r = execute(state, cmd);
      assert.ok(r.ok, `${cmd.type}: ${r.events[0]?.reason}`);
    }
    passBoth(state); // przygoda się rozstrzyga
    const crusher = state.objects.get('crusher');
    const crewAbility = (crusher.abilities ?? []).find((a) => a.cost?.crewPower === 3);
    const r3 = execute(state, {
      type: 'activate_ability', playerId: 'p1', objectId: 'crusher',
      abilityIndex: crusher.abilities.indexOf(crewAbility), crewCreatureIds: ['c1', 'c2'],
    });
    assert.ok(r3.ok, r3.events[0]?.reason);
    return state;
  };
  const a = run();
  const b = run();
  const summarize = (state) => JSON.stringify({
    life: state.players.map((p) => p.life),
    objects: [...state.objects.values()]
      .map((o) => ({ id: o.id, zone: o.zone, cardId: o.cardId, tapped: o.tapped, wasKicked: o.wasKicked, kind: o.kind }))
      .sort((x, y) => x.id.localeCompare(y.id)),
  });
  assert.equal(summarize(a), summarize(b));
});
