/**
 * Kontrzenie ZDOLNOŚCI (Stifle) — audyt PR #93, tura 3, wątek 3 z HANDOFF.
 *
 * Do tej pory silnik umiał kontrować wyłącznie CZARY (`counter_spell` dla
 * Negate / Stoic Rebuttal / Steel Sabotage). `counterStackObject` radził sobie
 * z wpisami zdolności (`activatedEntry`, `triggerEntry`), ale nikt go o zdolność
 * nie pytał: nie było typu celu „zdolność na stosie", nie było efektu
 * „kontruj zdolność" i nie było karty, która by to robiła. Skutek uboczny:
 * pytanie z tury 2 — „co z `pendingExileCast` Vaana, kiedy cały trigger
 * zostanie skontrowany" — było nie-do-udowodnienia, więc zostało w HANDOFF
 * jako otwarte.
 *
 * Teraz dowód istnieje i jest zgodny z CR 118.12/608.2a: skontrowana zdolność
 * znika ze stosu i NIE rozstrzyga się, więc NIE ma wygnania i NIE ma Skarbu
 * (nie ma też decyzji do podjęcia). Dodatkowo klauzula Oracle
 * „(Mana abilities can't be targeted.)" jest w tym silniku spełniona
 * KONSTRUKCJĄ, nie warunkiem: zdolność many rozstrzyga się bez stosu
 * (CR 605.1a), więc nie ma czego wskazać — test 4 pilnuje, żeby nikt kiedyś
 * nie „poprawił" tego wpuszczaniem mana abilities na stos.
 *
 * Źródło danych: `docs/cards/scryfall-stifle.json` (CNS #108, wraz z trzema
 * rulingami WotC 2004-10-04 — ADR 0022).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { MANA_COSTS } from '../src/cards/mana-costs-data.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { legalTargetCandidates, validateTargets } from '../src/engine/spells.js';

const REGISTRY = createCardRegistry();
const STIFLE = REGISTRY.get('stifle');
const VAAN = REGISTRY.get('vaan-street-thief');
const SOULMENDER = REGISTRY.get('soulmender');

function game({ seed = 5 } = {}) {
  const state = createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  return state;
}

function put(state, id, def, controllerId, zone = 'battlefield') {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: def.id, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? ['Creature'],
    // Podtypy MUSZĄ jechać jawne: `gameObjectDataOf` ich nie przenosi, a bez
    // tego Vaan nie widzi „Scout, Pirate, Rogue" i trigger w ogóle nie wpada
    // (test przechodziłby na pustym stosie — L48: harness ma mówić PRAWDĘ).
    subtypes: def.subtypes ?? [],
  });
  if (zone === 'battlefield') {
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  }
  return state.objects.get(id);
}

function putToken(state, id, def, controllerId) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: def.id, controllerId, ownerId: controllerId,
    zone: 'battlefield', ...gameObjectDataOf(def), types: def.types ?? ['Artifact'],
    subtypes: def.subtypes ?? ['Treasure'],
  });
  return state.objects.get(id);
}

/** p1 atakuje bez bloków — obrażenia trafiają w p2 (wzorzec batch52). */
function attackUnblocked(state, attackerIds) {
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds }).ok);
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: {} }).ok);
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  return execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' });
}

const commands = (state, playerId) => playerView(state, playerId).legalCommands;

/** Przytrzymuje zdolność na stosu: podaje priorytet, aż dojdzie do gracza `pid`. */
function przekażPriorytet(state, pid, limit = 6) {
  for (let i = 0; i < limit && state.turn.priorityPlayerId !== pid; i += 1) {
    const pass = commands(state, state.turn.priorityPlayerId).find((c) => c.type === 'pass_priority');
    if (!pass) break;
    execute(state, pass);
  }
  assert.equal(state.turn.priorityPlayerId, pid, 'priorytet u odpowiadającego');
}

const zdolnościNaStosie = (state) => [...state.zones.stack]
  .filter((id) => state.objects.get(id)?.zone === 'stack'
    && (state.objects.get(id)?.activatedEntry || state.objects.get(id)?.triggerEntry));

/** Vaan p1 zadaje obrażenia p2 i jego trigger leży na stosie (przed rozstrzygnięciem). */
function stółZTriggeremVaana() {
  const state = game();
  put(state, 'vaan', VAAN, 'p1'); // Sam Vaan jest Scoutem — jego własny cios uzbraja trigger.
  const top = REGISTRY.get('highland-game');
  put(state, 'top', top, 'p2', 'library');
  state.zones.library = ['top', ...state.zones.library.filter((id) => id !== 'top')];
  assert.ok(attackUnblocked(state, ['vaan']).ok);
  const ids = zdolnościNaStosie(state);
  assert.equal(ids.length, 1, `na stosie ma leżeć dokładnie jedna zdolność, leży: ${JSON.stringify(ids)}`);
  return { state, abilityId: ids[0] };
}

test('1) Stifle: definicja karty == snapshot Scryfall, koszt ma pipy, typ celu ma etykietę', () => {
  const snapshot = JSON.parse(fs.readFileSync(new URL('../docs/cards/scryfall-stifle.json', import.meta.url), 'utf8'));
  assert.equal(STIFLE.name, snapshot.name);
  assert.equal(STIFLE.oracleText, snapshot.oracle_text, 'Oracle bez zmian (L57)');
  assert.deepEqual(STIFLE.types, ['Instant']);
  assert.deepEqual(STIFLE.colors, snapshot.colors);
  assert.equal(MANA_COSTS.stifle, snapshot.mana_cost,
    'bez wpisu w MANA_COSTS koszt {U} straciłpipę koloru i dałby się zapłacić bezbarwną maną');
  assert.equal(STIFLE.spell.targets[0].type, 'ability_on_stack');
  assert.equal(STIFLE.spell.effects[0].type, 'counter_ability');
  // Etykieta typu celu (ogólny strażnik: `card-sources-guard.test.js`); tu
  // tylko sprawdzam, że NOWY typ jej nie zgubił.
  const render = fs.readFileSync(new URL('../src/table/render.js', import.meta.url), 'utf8');
  assert.match(render, /ability_on_stack:\s*'[^']+'/,
    'typ celu bez etykiety w render.js — na stole świeci surowy slug (klasa M126/#4)');
  assert.equal(snapshot.rulings.length, 3, 'rulingi WotC są w snapshotcie (ADR 0022)');
});

test('2) skontrowany trigger: ani wygnania, ani Skarbu, ani decyzji do podjęcia', () => {
  const { state, abilityId } = stółZTriggeremVaana();
  const przed = state.zones.library.length;
  addMana(state, 'p2', 1, { colors: ['U'] });
  put(state, 'stifle', STIFLE, 'p2', 'hand');
  przekażPriorytet(state, 'p2');

  const r = execute(state, {
    type: 'cast_spell', playerId: 'p2', cardId: 'stifle', objectId: 'stifle', targets: [abilityId],
  });
  assert.equal(r.ok, true, `Stifle musi przyjąć zdolność na stosie jako cel: ${r.events?.[0]?.reason ?? r.events?.[0]?.type}`);

  // Rozstrzygnięcia: najpierw Stifle (kontra), potem NIC — trigger znika.
  for (let i = 0; i < 6 && state.zones.stack.length > 0; i += 1) {
    const pass = commands(state, state.turn.priorityPlayerId).find((c) => c.type === 'pass_priority');
    if (!pass) break;
    execute(state, pass);
  }

  const kontr = state.events.filter((e) => e.type === 'spell_countered');
  assert.equal(kontr.length, 1, `jedna kontra: ${JSON.stringify(kontr.map((e) => e.type))}`);
  assert.equal(kontr[0].counteredByCardId, 'stifle', 'LKI kontrującego (CR 603.10)');
  assert.equal(state.objects.get(abilityId), undefined, 'skontrowana zdolność nie ma już obiektu na stosie');
  assert.equal(state.pendingExileCast, null, 'brak decyzji „rzucisz wygnaną kartę?" — nie ma czego pytać');
  assert.equal(state.objects.get('top')?.zone, 'library', 'karta NIE została wygnana (CR 118.12: skontrowana zdolność się nie rozstrzyga)');
  assert.equal(state.zones.library.length, przed, 'biblioteka p2 bez zmian');
  assert.equal([...state.objects.values()].some((o) => (o.subtypes ?? []).includes('Treasure')), false,
    "ani rezygnacji, ani Skarbu — „If you don’t” w ogóle nie nastąpiło");
  assert.equal(state.players.find((p) => p.id === 'p2').life, 18, 'obrażenia walki zostają (kontra nie cofa faktu)');
});

test('3) skontrowana zdolność aktywowana: koszt zapłacony, efekt nie (CR 118.12)', () => {
  const state = game();
  put(state, 'soul', SOULMENDER, 'p1');
  addMana(state, 'p2', 1, { colors: ['U'] });
  put(state, 'stifle', STIFLE, 'p2', 'hand');

  const r1 = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'soul', abilityIndex: 0 });
  assert.equal(r1.ok, true, `Soulmender aktywuje się: ${r1.events?.[0]?.reason}`);
  const ids = zdolnościNaStosie(state);
  assert.equal(ids.length, 1, 'nie-mana zdolność aktywowana idzie na stos (CR 602.2a)');

  przekażPriorytet(state, 'p2');
  assert.ok(execute(state, {
    type: 'cast_spell', playerId: 'p2', cardId: 'stifle', objectId: 'stifle', targets: ids,
  }).ok);
  for (let i = 0; i < 6 && state.zones.stack.length > 0; i += 1) {
    const pass = commands(state, state.turn.priorityPlayerId).find((c) => c.type === 'pass_priority');
    if (!pass) break;
    execute(state, pass);
  }
  const p1 = state.players.find((p) => p.id === 'p1');
  assert.equal(p1.life, 20, 'życie NIE rośnie — efekt skontrowany');
  assert.equal(state.objects.get('soul').tapped, true, 'tapnięcie to KOSZT, nie efekt — kontrzenie go nie cofa');
});

test('4) zdolność many nie ma wpisu na stosie, więc nie ma czego skontrować', () => {
  const state = game();
  const treasure = REGISTRY.get('token_treasure');
  putToken(state, 'skarb', treasure, 'p1');
  const r = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'skarb', abilityIndex: 0 });
  assert.equal(r.ok, true, `Skarb tapuje i dodaje manę: ${r.events?.[0]?.reason}`);
  assert.equal(state.players.find((p) => p.id === 'p1').mana, 1, 'mana w puli');
  assert.deepEqual(zdolnościNaStosie(state), [],
    'CR 605.1a — zdolność many rozstrzyga się natychmiast i nie wchodzi na stos; '
    + 'to ona realizuje klauzulę „(Mana abilities can\'t be targeted.)", nie żaden warunek w kodzie');
  assert.deepEqual(legalTargetCandidates(state, 'p2', { type: 'ability_on_stack' }), [],
    'oferta celów Stifle też nie może wymyślić zdolności many');
});

test('5) oferta i walidacja mówią to samo; zdolność ≠ czar i odwrotnie (L48)', () => {
  const { state, abilityId } = stółZTriggeremVaana();
  // (a) Cel-zdolność jest w ofercie i przechodzi walidację.
  assert.deepEqual(legalTargetCandidates(state, 'p2', { type: 'ability_on_stack' }), [abilityId]);
  assert.deepEqual(validateTargets(state, [{ type: 'ability_on_stack' }], [abilityId], 'p2'),
    [state.objects.get(abilityId)]);
  // (b) Ten SAM wpis odrzuca spec „czar na stosie" (Negate i spółka nie kontrują zdolności).
  assert.throws(() => validateTargets(state, [{ type: 'spell_on_stack' }], [abilityId], 'p2'),
    /Nielegalny cel/);
  assert.throws(() => validateTargets(state, [{ type: 'noncreature_spell_on_stack' }], [abilityId], 'p2'),
    /Nielegalny cel/);
  // (c) Odwrotnie: spec „zdolność" nie przyjmuje czaru na stosie.
  const bezcelowy = [...REGISTRY.supported()].find((c) => (c.types ?? []).includes('Instant')
    && c.spell?.timing === 'instant' && !(c.spell.targets ?? []).length && !c.spell.modes
    && !c.spell.xCost && !c.additionalCost && !c.spell.fireball && !c.kicker);
  addMana(state, 'p1', 10, { colors: ['W', 'U', 'B', 'R', 'G'] });
  put(state, 'czar', bezcelowy, 'p1', 'hand');
  const rCzar = execute(state, {
    type: 'cast_spell', playerId: 'p1', cardId: bezcelowy.id, objectId: 'czar', targets: [],
  });
  assert.equal(rCzar.ok, true, `czar bez celu musi dać się rzucić (${bezcelowy.id}): ${rCzar.events?.[0]?.reason}`);
  const czarNaStosie = [...state.zones.stack].find((id) => !zdolnościNaStosie(state).includes(id));
  assert.ok(czarNaStosie, 'drugi wpis na stosie to czar — poza zakresem celu Stifle');
  assert.throws(() => validateTargets(state, [{ type: 'ability_on_stack' }], [czarNaStosie], 'p2'),
    /Nielegalny cel/);
});

test('6) bez zdolności na stosie Stifle nie jest w ogóle oferowany (CR 601.2a)', () => {
  // Filtr po `objectId`, NIE po `cardId`: komenda z playerView nie niesie
  // cardId, więc filter(c => c.cardId === …) byłby pusty ZAWSZE — asercja
  // „brak oferty" przechodziłaby nawet przy pełnej ofercie (pusty pin, L48).
  const oferyStifle = (state) => commands(state, 'p2')
    .filter((c) => c.type === 'cast_spell' && c.objectId === 'stifle');

  const state = game();
  addMana(state, 'p2', 1, { colors: ['U'] });
  put(state, 'stifle', STIFLE, 'p2', 'hand');
  state.turn.priorityPlayerId = 'p2';
  assert.deepEqual(oferyStifle(state), [],
    'bez legalnego celu nie ma oferty rzutu (oferta = walidacja, L48)');

  const zTriggerem = stółZTriggeremVaana();
  addMana(zTriggerem.state, 'p2', 1, { colors: ['U'] });
  put(zTriggerem.state, 'stifle', STIFLE, 'p2', 'hand');
  przekażPriorytet(zTriggerem.state, 'p2');
  const oferta = oferyStifle(zTriggerem.state);
  assert.equal(oferta.length, 1, `oferta rzutu z celem, jest: ${JSON.stringify(oferta)}`);
  assert.deepEqual([...oferta[0].targets], [zTriggerem.abilityId],
    'w ofercie musi być widać, CO jest celem (panel nie zgaduje — ta sama enumeracja co w walidacji)');
});

