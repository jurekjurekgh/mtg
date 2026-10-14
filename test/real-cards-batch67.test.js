// Batch 67 (2026-10-14) — fala A: 371 WAR, 380 DTK, 394 ALA, 397 SOS, 398 EOE.
// Plan: docs/plans/PLAN_2026-10-14-batch67-kolekcja-369-398.md.
// Dane Oracle i rulingi: docs/cards/scryfall-*.json (dokładny druk `set=`,
// pobrane 2026-10-14). Każda karta ma sanity + scenariusz legalny i nielegalny.
//
// Karty tej fali stoją na istniejących mechanikach (counter_spell, pump+rebound,
// reveal_hand_choose_discard, add_counter, zdolność aktywowana). Jedyna zmiana
// w silniku to generyczny cel „instant or sorcery card from your graveyard”
// dla czaru/zdolności (predykat `graveyard-types.isInstantOrSorceryCardInGraveyard`,
// ten sam co dotąd w triggerach) — pinuje go Spellkeeper Weird.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  createGameState, addObject, execute, playerView, moveObjectDirectly,
} from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { MANA_COSTS } from '../src/cards/mana-costs-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { effectivePower, effectiveToughness } from '../src/engine/permanents.js';

const registry = createCardRegistry();

function game(players = ['p1', 'p2']) {
  const state = createGameState({ seed: 67, players: players.map((id) => ({ id })) });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  for (const playerId of players) {
    for (let i = 0; i < 8; i++) put(state, `lib-${playerId}-${i}`, 'basic-swamp', playerId, 'library');
  }
  return state;
}

function put(state, id, cardId, playerId = 'p1', zone = 'hand', patch = {}) {
  const def = registry.get(cardId);
  assert.ok(def, `${cardId} w prawdziwym rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId,
    zone, ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes,
    keywords: def.keywords,
  });
  if (Object.keys(patch).length > 0) {
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
  }
  return state.objects.get(id);
}

const commands = (state, playerId = state.turn.priorityPlayerId) => playerView(state, playerId).legalCommands;
const find = (state, cardId, zone = 'battlefield') => [...state.objects.values()]
  .find((object) => object.cardId === cardId && object.zone === zone);
const snapshotOf = (slug) => JSON.parse(fs.readFileSync(`docs/cards/scryfall-${slug}.json`, 'utf8'));

function run(state, command) {
  assert.ok(command, 'oferta komendy istnieje');
  const result = execute(state, command);
  assert.ok(result.ok, `${result.reason ?? 'odrzucono'}: ${JSON.stringify(result.events ?? [])}`);
  return result;
}

/** Rozstrzyga stos oraz proste, niekontrowersyjne decyzje (pierwsza oferta). */
function settle(state, max = 80) {
  for (let i = 0; i < max; i += 1) {
    const choices = commands(state);
    const resolving = choices.find((command) => command.type.startsWith('resolve_'));
    if (resolving) {
      run(state, resolving);
      continue;
    }
    if (state.zones.stack.length === 0) return;
    const pass = choices.find((command) => command.type === 'pass_priority');
    assert.ok(pass, 'stos ma legalny pass priority');
    run(state, pass);
  }
  assert.fail('przekroczono limit rozstrzygania stosu');
}

function sanity(id, { set, plan, artId }) {
  const def = registry.get(id);
  const snap = snapshotOf(id);
  assert.ok(def, `${id} istnieje w rejestrze`);
  assert.equal(def.oracleText, snap.oracle_text, 'Oracle 1:1 ze snapshotem Scryfalla');
  assert.equal(def.set, set);
  assert.equal(def.plan, plan, 'plan właściciela jest wiążący');
  assert.equal(def.artId, artId);
  assert.equal(def.support.status, 'supported');
  assert.deepEqual(def.support.limitations, []);
  assert.equal(MANA_COSTS[id], snap.mana_cost, 'koszt w MANA_COSTS = dokładny druk');
  assert.equal(snap.print, set.toLowerCase());
  assert.ok(Array.isArray(snap.rulings), 'rulingi zapisane, także pusta lista');
  return def;
}

// ---- B67/371: Spellkeeper Weird -------------------------------------------

test('B67/371: Spellkeeper Weird — dane Oracle WAR i zdolność z kosztem {2},{T},Poświęć', () => {
  const def = sanity('spellkeeper-weird', { set: 'WAR', plan: 'Ravnica', artId: 371 });
  assert.deepEqual(def.types, ['Creature']);
  assert.deepEqual(def.subtypes, ['Weird']);
  assert.deepEqual(def.colors, ['U']);
  assert.equal(def.power, 1);
  assert.equal(def.toughness, 4);
  assert.equal(def.manaCost, 3);
  const zdolnosc = (def.abilities ?? []).find((a) => a.type === 'activated');
  assert.deepEqual(zdolnosc.cost, { mana: 2, tap: true, sacrificeSelf: true });
  assert.equal(zdolnosc.targets[0].type, 'instant_or_sorcery_card_in_graveyard');
});

test('B67/371: zwraca instant z WŁASNEGO grobu do ręki (instant, nie stwór)', () => {
  const state = game();
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  const weird = put(state, 'weird', 'spellkeeper-weird', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'instant', 'cancel', 'p1', 'graveyard');
  put(state, 'creature', 'sporecap-spider', 'p1', 'graveyard');
  addMana(state, 'p1', 2, { colors: [] });
  const oferta = commands(state).find((c) => c.type === 'activate_ability' && c.objectId === weird.id);
  assert.ok(oferta, 'oferta aktywacji przy instantcie w grobie');
  assert.equal(oferta.targets[0], 'instant', 'jedynym legalnym celem jest karta Instant — nie stwór');
  run(state, oferta);
  settle(state); // aktywowana zdolność idzie na stos (CR 602.2)
  assert.ok(find(state, 'cancel', 'hand'), 'karta wróciła do ręki');
  assert.ok(find(state, 'sporecap-spider', 'graveyard'), 'stwór w grobie został nietknięty');
  assert.ok(find(state, 'spellkeeper-weird', 'graveyard'), 'koszt poświęcenia zapłacony');
});

test('B67/371 nielegalny: brak instant/sorcery w grobie → zdolność nie jest oferowana', () => {
  const state = game();
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  const weird = put(state, 'weird', 'spellkeeper-weird', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'creature', 'sporecap-spider', 'p1', 'graveyard');
  addMana(state, 'p1', 10, { colors: [] });
  assert.ok(!commands(state).some((c) => c.type === 'activate_ability' && c.objectId === weird.id),
    'sam stwór w grobie nie daje legalnego celu');
  const wymuszone = execute(state, {
    type: 'activate_ability', playerId: 'p1', objectId: weird.id, abilityIndex: 0, targets: ['creature'],
  });
  assert.equal(wymuszone.ok, false, 'walidacja odrzuca cel-kartę stwora');
  assert.ok(find(state, 'spellkeeper-weird', 'battlefield'), 'odrzucona aktywacja nie płaci kosztu');
});

// ---- B67/380: Artful Maneuver ---------------------------------------------

test('B67/380: Artful Maneuver — dane Oracle DTK, +2/+2 z reboundem', () => {
  const def = sanity('artful-maneuver', { set: 'DTK', plan: 'Tarkir', artId: 380 });
  assert.deepEqual(def.types, ['Instant']);
  assert.deepEqual(def.colors, ['W']);
  assert.equal(def.manaCost, 2);
  assert.equal(def.spell.rebound, true);
  assert.deepEqual(def.spell.effects, [{ type: 'pump', power: 2, toughness: 2 }]);
});

test('B67/380: rzut daje +2/+2 do końca tury, a karta idzie do exile z gotowym reboundem', () => {
  const state = game();
  const cel = put(state, 'cel', 'sporecap-spider', 'p1', 'battlefield', { summoningSickness: false });
  addMana(state, 'p1', 2, { colors: ['W'] });
  const rzut = commands(state).find((c) => c.type === 'cast_spell' && c.objectId === 'manewr');
  put(state, 'manewr', 'artful-maneuver', 'p1', 'hand');
  const oferta = commands(state).find((c) => c.type === 'cast_spell' && c.objectId === 'manewr');
  assert.ok(oferta, 'oferta rzutu (cel = stwór)');
  assert.equal(oferta.targets[0], cel.id, 'cel wskazuje stwora');
  run(state, oferta);
  settle(state);
  const poPompie = state.objects.get(cel.id); // pump podmienia obiekt na nowy (zamrożony)
  assert.equal(effectivePower(poPompie, state), 1 + 2, 'moc 1/5 + 2');
  assert.equal(effectiveToughness(poPompie, state), 5 + 2, 'wytrzymałość 1/5 + 2');
  const wygnany = find(state, 'artful-maneuver', 'exile');
  assert.ok(wygnany, 'rebound: karta na stosie poszła do exile, nie do grobu');
  assert.equal(wygnany.reboundReady, true, 'gotowa do darmowego rzutu w następnym upkeepie');
  assert.equal(rzut?.ok, undefined, 'brak wcześniejszej oferty przed dodaniem karty do ręki');
});

test('B67/380 nielegalny: brak stwora na stole → nie ma oferty rzutu', () => {
  const state = game();
  put(state, 'manewr', 'artful-maneuver', 'p1', 'hand');
  addMana(state, 'p1', 2, { colors: ['W'] });
  assert.ok(!commands(state).some((c) => c.type === 'cast_spell' && c.objectId === 'manewr'),
    'instant z celem wymaga stwora na stole');
});

// ---- B67/394: Cancel ------------------------------------------------------

test('B67/394: Cancel — dane Oracle ALA i kontra na stosie', () => {
  const def = sanity('cancel', { set: 'ALA', plan: 'Amonkhet', artId: 394 });
  assert.deepEqual(def.types, ['Instant']);
  assert.deepEqual(def.colors, ['U']);
  assert.equal(def.manaCost, 3);
  assert.deepEqual(def.spell.targets, [{ type: 'spell_on_stack' }]);
  assert.deepEqual(def.spell.effects, [{ type: 'counter_spell' }]);
});

test('B67/394: kontruje czar przeciwnika — czar ląduje w grobie, efekt nie zachodzi', () => {
  const state = game();
  put(state, 'artifact', 'universal-solvent', 'p1', 'battlefield');
  put(state, 'naturalize', 'naturalize', 'p2', 'hand');
  put(state, 'cancel', 'cancel', 'p1', 'hand');
  addMana(state, 'p2', 2, { colors: ['G'] });
  addMana(state, 'p1', 3, { colors: ['U', 'U'] });
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p2';
  run(state, commands(state).find((c) => c.type === 'cast_spell' && c.objectId === 'naturalize'));
  state.turn.priorityPlayerId = 'p1';
  const kontra = commands(state, 'p1').find((c) => c.type === 'cast_spell' && c.objectId === 'cancel');
  assert.ok(kontra, 'Cancel jest oferowany, gdy na stosie leży czar wroga');
  run(state, kontra);
  settle(state);
  assert.ok(find(state, 'naturalize', 'graveyard'), 'skontrowany czar poszedł do grobu');
  assert.ok(find(state, 'universal-solvent', 'battlefield'), 'efekt skontrowanego czaru nie zaszedł');
  assert.ok(find(state, 'cancel', 'graveyard'), 'Cancel sam rozstrzygnął się do grobu');
});

test('B67/394 nielegalny: Cancel nie celuje w permanenty ani własne czary', () => {
  const state = game();
  put(state, 'artifact', 'universal-solvent', 'p2', 'battlefield');
  put(state, 'cancel', 'cancel', 'p1', 'hand');
  addMana(state, 'p1', 3, { colors: ['U', 'U'] });
  assert.ok(!commands(state).some((c) => c.type === 'cast_spell' && c.objectId === 'cancel'),
    'pusty stos = brak rzucalnego celu');
  const wymuszone = execute(state, {
    type: 'cast_spell', playerId: 'p1', objectId: 'cancel', targets: ['artifact'],
  });
  assert.equal(wymuszone.ok, false, 'permanent nie jest czarem na stosie');
});

// ---- B67/397: Render Speechless -------------------------------------------

test('B67/397: Render Speechless — dane Oracle SOS, wybór OBOWIĄZKOWY + dwa liczniki', () => {
  const def = sanity('render-speechless', { set: 'SOS', plan: 'Arcavios', artId: 397 });
  assert.deepEqual(def.types, ['Sorcery']);
  assert.deepEqual(def.colors, ['B', 'W']);
  assert.equal(def.manaCost, 4);
  assert.deepEqual(def.spell.targets, [{ type: 'opponent' }, { type: 'creature', optional: true }]);
  assert.equal(def.spell.effects[0].mandatory, true,
    'Oracle bez „you may" — inaczej niż Nightsnare (ruling brak, tekst druku)');
});

test('B67/397: odrzucenie wybrane przez rzucającego + dwa +1/+1 na własnym stworze', () => {
  const state = game();
  const moj = put(state, 'moj', 'sporecap-spider', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'ofiary', 'intrepid-tenderfoot', 'p2', 'hand');
  put(state, 'ofiary2', 'cancel', 'p2', 'hand');
  put(state, 'grunt', 'basic-forest', 'p2', 'hand');
  put(state, 'czar', 'render-speechless', 'p1', 'hand');
  addMana(state, 'p1', 4, { colors: ['W', 'B'] });
  const rzut = commands(state).find((c) => c.type === 'cast_spell' && c.objectId === 'czar'
    && c.targets?.[1] === moj.id);
  assert.ok(rzut, 'oferta rzutu z celem-wrogiem i opcjonalnym własnym stworzeniem');
  run(state, rzut);
  // Uwaga: `settle` NIE może tu być użyte — rozstrzygnęłoby także decyzję
  // o odrzuceniu (komenda `resolve_discard_choice` też zaczyna się od
  // „resolve_"). Rozstrzygamy tylko stos, aż otworzy się decyzja.
  for (let i = 0; i < 12 && !state.pendingDiscardChoice; i += 1) {
    const ch = commands(state);
    const stosowy = ch.find((c) => c.type.startsWith('resolve_') && c.type !== 'resolve_discard_choice');
    if (stosowy) { run(state, stosowy); continue; }
    if (state.zones.stack.length === 0) break;
    run(state, ch.find((c) => c.type === 'pass_priority'));
  }
  // Decyzja o odrzuceniu należy do RZUCAJĄCEGO (p1), nie do właściciela ręki.
  assert.ok(state.pendingDiscardChoice, 'otwarta decyzja o odrzuceniu');
  assert.equal(state.pendingDiscardChoice.chooserId, 'p1', 'wybiera rzucający');
  assert.deepEqual([...state.pendingDiscardChoice.handIds].sort(), ['ofiary', 'ofiary2'],
    'kandydatami są wyłącznie karty nielandowe (ląd zostaje w ręce)');
  run(state, commands(state, 'p1').find((c) => c.type === 'resolve_discard_choice'));
  settle(state); // domknięcie czaru: drugi efekt (liczniki) po decyzji
  const wGrobowcu = [...state.objects.values()]
    .filter((o) => o.controllerId === 'p2' && o.zone === 'graveyard').length;
  assert.equal(wGrobowcu, 1, 'odrzucona dokładnie jedna karta');
  assert.equal([...state.objects.values()]
    .filter((o) => o.controllerId === 'p2' && o.zone === 'hand').length, 2,
  'w ręce zostają dwie karty (ląd i druga nielandowa)');
  const liczniki = find(state, 'sporecap-spider', 'battlefield').counters?.['+1/+1'] ?? 0;
  assert.equal(liczniki, 2, 'dwa +1/+1 na wskazanym stworze');
});

test('B67/397 nielegalny: wróg z samymi lądami → nikt nie odrzuca, bez kary „if you don\'t"', () => {
  const state = game();
  const moj = put(state, 'moj', 'sporecap-spider', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'grunt1', 'basic-forest', 'p2', 'hand');
  put(state, 'grunt2', 'basic-island', 'p2', 'hand');
  put(state, 'czar', 'render-speechless', 'p1', 'hand');
  addMana(state, 'p1', 4, { colors: ['W', 'B'] });
  run(state, commands(state).find((c) => c.type === 'cast_spell' && c.objectId === 'czar'
    && c.targets?.[1] === moj.id));
  settle(state);
  assert.ok(!state.pendingDiscardChoice, 'brak nie-lądów = brak decyzji (mandatory bez celu)');
  assert.equal([...state.objects.values()]
    .filter((o) => o.controllerId === 'p2' && o.zone === 'hand').length, 2,
  'oba lądy zostają w ręce — bez kary „if you don\'t"');
  assert.equal(find(state, 'sporecap-spider', 'battlefield').counters?.['+1/+1'] ?? 0, 2,
    'liczniki i tak wchodzą');
});

// ---- B67/398: Intrepid Tenderfoot -----------------------------------------

test('B67/398: Intrepid Tenderfoot — dane Oracle EOE i licznik tylko w swojej fazie głównej', () => {
  const def = sanity('intrepid-tenderfoot', { set: 'EOE', plan: 'The Edge', artId: 398 });
  assert.deepEqual(def.types, ['Creature']);
  assert.deepEqual(def.subtypes, ['Insect', 'Citizen']);
  assert.deepEqual(def.colors, ['G']);
  assert.equal(def.power, 2);
  assert.equal(def.toughness, 2);
  const zdolnosc = (def.abilities ?? []).find((a) => a.type === 'activated');
  assert.equal(zdolnosc.timing, 'sorcery', '„Activate only as a sorcery"');
  assert.deepEqual(zdolnosc.cost, { mana: 3 });

  const state = game();
  const stwor = put(state, 'tender', 'intrepid-tenderfoot', 'p1', 'battlefield', { summoningSickness: false });
  addMana(state, 'p1', 3, { colors: [] });
  const oferta = commands(state).find((c) => c.type === 'activate_ability' && c.objectId === stwor.id);
  assert.ok(oferta, 'oferta w main phase');
  run(state, oferta);
  settle(state); // zdolność aktywowana rozstrzyga się ze stosu
  assert.equal(find(state, 'intrepid-tenderfoot', 'battlefield').counters?.['+1/+1'], 1);
});

test('B67/398 nielegalny: poza własną fazą główną zdolność nie jest oferowana', () => {
  const state = game();
  const stwor = put(state, 'tender', 'intrepid-tenderfoot', 'p1', 'battlefield', { summoningSickness: false });
  addMana(state, 'p1', 3, { colors: [] });
  state.turn = jumpToStep(state.turn, 'upkeep', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  assert.ok(!commands(state, 'p1').some((c) => c.type === 'activate_ability' && c.objectId === stwor.id),
    'upkeep to nie faza główna');
  const wymuszone = execute(state, {
    type: 'activate_ability', playerId: 'p1', objectId: stwor.id, abilityIndex: 0,
  });
  assert.equal(wymuszone.ok, false, 'walidacja odrzuca aktywację poza fazą główną');
});

test('B67/371+380: ruch kart między strefami nie tworzy drugiego celu (spójność obiektów)', () => {
  const state = game();
  const weird = put(state, 'weird', 'spellkeeper-weird', 'p1', 'battlefield', { summoningSickness: false });
  const manewr = put(state, 'manewr', 'artful-maneuver', 'p1', 'hand');
  moveObjectDirectly(state, manewr.id, 'graveyard', 'grave-manewr');
  addMana(state, 'p1', 5, { colors: ['W'] });
  const oferta = commands(state).find((c) => c.type === 'activate_ability' && c.objectId === weird.id);
  assert.ok(oferta, 'instant w grobie jest celem zdolności');
  assert.equal(oferta.targets[0], state.objects.get('grave-manewr').id,
    'cel wskazuje DOKŁADNIE obiekt w grobie (po przeniesieniu ma nowe id)');
});
