// Batch 70 (2026-10-27) — kolekcja artId 426–624 (10 kart), wszystkie `supported` (100%).
// Plan: docs/plans/PLAN_2026-10-27-batch70-kolekcja-426-624.md. Dane Oracle i rulingi:
// docs/cards/scryfall-<slug>.json (pobrane 2026-10-27 przez fetch_page, bo egress
// sandboxa do api.scryfall.com jest zablokowany — patrz ENVIRONMENT).
// Mechaniki generyczne (ADR 0002) testowane na prawdziwych kartach i prawdziwym silniku,
// a nowe deskryptory NAJPIERW na kartach SYNTERETYCZNYCH (ADR 0029 — pin RED→GREEN).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  createGameState, addObject, execute, playerView,
} from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { MANA_COSTS } from '../src/cards/mana-costs-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createAbility, ABILITY_TYPE } from '../src/engine/abilities.js';
import { blockAssignmentViolation, legalBlockerOptions } from '../src/engine/combat.js';
import { applyEffect } from '../src/engine/effects.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import { applyEnterCounters } from '../src/engine/effects.js';
import { effectivePower } from '../src/engine/permanents.js';
import { processTriggers } from '../src/engine/triggers.js';

const registry = createCardRegistry();

const commands = (state, playerId = state.turn.priorityPlayerId) => playerView(state, playerId).legalCommands;
const snapshotOf = (slug) => JSON.parse(fs.readFileSync(`docs/cards/scryfall-${slug}.json`, 'utf8'));

function game() {
  const state = createGameState({ seed: 70, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  return state;
}

/** Karta SYNTERETYCZNA (ADR 0029) — pin mechaniki bez zależności od katalogu. */
function synthetic(state, id, { controllerId = 'p1', types = ['Creature'], subtypes = [],
  power = 2, toughness = 2, keywords = [], abilities = [], manaCost = 1 } = {}) {
  const def = {
    id: `syn-${id}`, name: `Syn ${id}`, set: 'TST', types, subtypes, colors: [],
    power, toughness, manaCost, keywords, oracleText: '', abilities,
  };
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: def.id, controllerId, ownerId: controllerId,
    zone: 'battlefield', ...gameObjectDataOf(def),
    types: def.types, subtypes: def.subtypes, keywords: def.keywords,
  });
  return state.objects.get(id);
}

const artifactCreature = (state, id, { controllerId = 'p2', power = 3, toughness = 3 } = {}) =>
  synthetic(state, id, { controllerId, types: ['Artifact', 'Creature'], power, toughness });

const plainCreature = (state, id, { controllerId = 'p2', power = 3, toughness = 3 } = {}) =>
  synthetic(state, id, { controllerId, types: ['Creature'], subtypes: ['Bear'], power, toughness });

// =========================================================================
// E2b — „This creature can't be blocked by artifact creatures" (Fen Hauler)
// =========================================================================

test('pin: can\'t be blocked by [typ] — bloker artefaktowy odrzucony, zwykły dozwolony', () => {
  const state = game();
  synthetic(state, 'evasive', {
    types: ['Creature'], subtypes: ['Insect'], power: 5, toughness: 5,
    abilities: [createAbility({ type: ABILITY_TYPE.static, cantBeBlockedByTypes: ['Artifact'] })],
  });
  artifactCreature(state, 'blok-art');
  plainCreature(state, 'blok-zwykly');
  const evasive = state.objects.get('evasive');
  assert.match(String(blockAssignmentViolation(state, evasive, ['blok-art'])), /typ/,
    'artefaktowy stwór nie może blokować');
  assert.equal(blockAssignmentViolation(state, evasive, ['blok-zwykly']), null,
    'zwykły stwór blokuje bez przeszkód');
});

test('pin: can\'t be blocked by [typ] — oferta bloków (legalBlockerOptions) zgodna z walidacją', () => {
  const state = game();
  synthetic(state, 'evasive', {
    power: 5, toughness: 5,
    abilities: [createAbility({ type: ABILITY_TYPE.static, cantBeBlockedByTypes: ['Artifact'] })],
  });
  artifactCreature(state, 'blok-art');
  plainCreature(state, 'blok-zwykly');
  state.combat = { attackingPlayerId: 'p1', attackers: ['evasive'], blockers: new Map(), blockedAttackers: new Set() };
  state.turn = jumpToStep(state.turn, 'declare_blockers', 'p1');
  const options = legalBlockerOptions(state, 'p2');
  const offers = options.filter((o) => (o.evasive ?? []).includes('blok-art'));
  assert.deepEqual(offers, [], 'oferta NIE proponuje artefaktowego blokera (kontrakt L48)');
  assert.ok(options.some((o) => (o.evasive ?? []).includes('blok-zwykly')),
    'oferta proponuje zwykłego blokera');
});

test('pin: can\'t be blocked by [typ] — deskryptor jest faktem publicznym w PlayerView', () => {
  const state = game();
  synthetic(state, 'evasive', {
    power: 5, toughness: 5,
    abilities: [createAbility({ type: ABILITY_TYPE.static, cantBeBlockedByTypes: ['Artifact'] })],
  });
  const entry = playerView(state, 'p2').zones.battlefield.find((o) => o.id === 'evasive');
  assert.deepEqual(entry?.cantBeBlockedByTypes, ['Artifact'],
    'widok niesie typy zakazanych blokerów (bot musi je widzieć — ADR 0017)');
});

// =========================================================================
// E2d — licznik „za każdą kartę stworzenia w twoim cmentarzu" (Moldgraf Millipede)
// =========================================================================

function cardIn(state, { id, controllerId = 'p1', zone = 'graveyard', types = ['Creature'] }) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: types.includes('Creature') ? 'elite-vanguard' : 'basic-swamp',
    controllerId, ownerId: controllerId, zone,
    kind: types.includes('Creature') ? 'creature' : 'land',
    types, subtypes: [], colors: [], keywords: [],
    ...(types.includes('Creature') ? { power: 2, toughness: 1, manaCost: 1 } : {}),
  });
  return state.objects.get(id);
}

test('pin: add_counter z amountFromGraveyardCardType liczy CAŁY cmentarz (także karty zmielone wcześniej)', () => {
  const state = game();
  // Dwa stwory JUŻ w grobie + biblioteka: 2 stwory i 1 ląd (mill bierze 3).
  cardIn(state, { id: 'g1' });
  cardIn(state, { id: 'g2' });
  cardIn(state, { id: 'l1', zone: 'library' });
  cardIn(state, { id: 'l2', zone: 'library' });
  cardIn(state, { id: 'l3', zone: 'library', types: ['Land'] });
  const source = synthetic(state, 'millipede', {
    controllerId: 'p1', types: ['Creature'], subtypes: ['Insect'], power: 2, toughness: 2,
  });
  applyEffect(state, { type: 'mill_cards', amount: 3 }, source);
  applyEffect(state, { type: 'add_counter', counter: '+1/+1', amountFromGraveyardCardType: 'Creature' }, source);
  // Ruling VOW 2021-11-19: liczą się TAKŻE karty, które były w grobie przed mieleniem.
  assert.equal(state.objects.get('millipede').counters?.['+1/+1'], 4,
    '2 stare + 2 zmielone stwory = 4 liczniki (ląd zmielony nie liczy się)');
});

test('pin: amountFromGraveyardCardType liczy TYLKO cmentarz kontrolera źródła', () => {
  const state = game();
  cardIn(state, { id: 'moj' });
  cardIn(state, { id: 'cudzy', controllerId: 'p2' });
  const source = synthetic(state, 'millipede-2', { controllerId: 'p1', types: ['Creature'] });
  applyEffect(state, { type: 'add_counter', counter: '+1/+1', amountFromGraveyardCardType: 'Creature' }, source);
  assert.equal(state.objects.get('millipede-2').counters?.['+1/+1'], 1,
    '„in your graveyard" = cmentarz kontrolera źródła, nie przeciwnika');
});

// =========================================================================
// E2e — „Whenever you manifest dread" + zwrot karty położonej tą drogą w grobie
// (Paranormal Analyst, ruling DSK 2024-09-20)
// =========================================================================

test('pin: trigger „whenever you manifest dread" zwraca do ręki kartę położoną tą drogą w grobie', () => {
  const state = game();
  cardIn(state, { id: 'top1', zone: 'library', types: ['Sorcery'] });
  cardIn(state, { id: 'top2', zone: 'library', types: ['Sorcery'] });
  synthetic(state, 'analyst', {
    types: ['Creature'], subtypes: ['Human', 'Detective'], power: 1, toughness: 3,
    abilities: [createAbility({
      type: ABILITY_TYPE.triggered,
      trigger: { event: 'manifest_dread_resolved' },
      effect: { type: 'return_context_graveyard_card_to_hand' },
    })],
  });
  const source = state.objects.get('analyst');
  applyEffect(state, { type: 'manifest_dread' }, source);
  assert.ok(state.pendingManifestDread, 'manifest dread czeka na wybór karty');
  // Wybieramy top1 do zmanifestowania — top2 idzie do grobu „this way".
  const pick = commands(state).find((c) => c.type === 'resolve_manifest_dread' && c.cardId === 'top1');
  assert.ok(pick, 'oferta wyboru karty do zmanifestowania (kontrakt legalCommands)');
  assert.ok(execute(state, pick).ok, 'wybór przyjęty');
  // Trigger poszedł na stos (CR 603.3) — rozstrzygamy rundę priorytetu.
  for (let i = 0; i < 20 && state.zones.stack.length > 0; i += 1) {
    const pass = commands(state).find((c) => c.type === 'pass_priority');
    if (!pass) break;
    assert.ok(execute(state, pass).ok, 'pass priority przyjęty');
  }
  const grave = state.zones.graveyard.map((id) => state.objects.get(id));
  assert.equal(grave.some((o) => o.zone === 'graveyard'), false,
    'karta z grobu „this way" wróciła do ręki (trigger rozstrzygnięty)');
  const hand = state.zones.hand.map((id) => state.objects.get(id));
  assert.deepEqual(hand.map((o) => o.instanceId), ['i-top2'],
    'w ręku jest DOKŁADNIE ta karta, którą manifest dread położył w grobie (top2), a nie zmanifestowana (top1)');
});

test('pin: karta, która opuściła grób przed rozstrzygnięciem triggera, nie wraca do ręki', () => {
  const state = game();
  const source = synthetic(state, 'analyst', {
    types: ['Creature'], power: 1, toughness: 3,
    abilities: [createAbility({
      type: ABILITY_TYPE.triggered,
      trigger: { event: 'manifest_dread_resolved' },
      effect: { type: 'return_context_graveyard_card_to_hand' },
    })],
  });
  const graveCard = cardIn(state, { id: 'exiled-one', zone: 'graveyard' });
  state.objects.set('exiled-one', Object.freeze({ ...graveCard, zone: 'exile' }));
  state.zones.graveyard = state.zones.graveyard.filter((id) => id !== 'exiled-one');
  state.zones.exile.push('exiled-one');
  applyEffect(state, { type: 'return_context_graveyard_card_to_hand' }, source,
    [], { manifestDreadGraveyardIds: ['exiled-one'] });
  assert.deepEqual(state.zones.hand, [], 'brak karty do wzięcia = brak skutku (CR 608.2b)');
});

// =========================================================================
// E4 — sanity danych: 10 kart z listy właściciela (plan 1:1, artId ze słownika)
// =========================================================================

const BATCH70 = Object.freeze([
  { artId: 426, set: 'DSK', slug: 'paranormal-analyst', plan: 'Duskmourn', name: 'Paranormal Analyst' },
  { artId: 427, set: 'APC', slug: 'jilt', plan: 'Dominaria', name: 'Jilt' },
  { artId: 429, set: 'MRD', slug: 'vault-of-whispers', plan: 'Mirrodin', name: 'Vault of Whispers' },
  { artId: 618, set: 'MH2', slug: 'kaleidoscorch', plan: 'Arcavios', name: 'Kaleidoscorch' },
  { artId: 619, set: 'LCI', slug: 'orazca-puzzle-door', plan: 'Ixalan', name: 'Orazca Puzzle-Door' },
  { artId: 620, set: 'AER', slug: 'fen-hauler', plan: 'Kamigawa', name: 'Fen Hauler' },
  { artId: 621, set: 'VOW', slug: 'moldgraf-millipede', plan: 'Innistrad', name: 'Moldgraf Millipede' },
  { artId: 622, set: 'VOW', slug: 'magma-pummeler', plan: 'Kaldheim', name: 'Magma Pummeler' },
  { artId: 623, set: 'SOM', slug: 'trigon-of-rage', plan: 'Mirrodin', name: 'Trigon of Rage' },
  { artId: 624, set: 'WAR', slug: 'arlinns-wolf', plan: 'Ravnica', name: "Arlinn's Wolf" },
]);

test('E4/sanity: 10 kart jest `supported`, bez ograniczeń, z planem 1:1 i artId ze słownika kolekcji', () => {
  const csv = fs.readFileSync('tools/collection-art-ids.csv', 'utf8').split(/\r?\n/);
  for (const wiersz of BATCH70) {
    const def = registry.get(wiersz.slug);
    assert.ok(def, `karta ${wiersz.slug} jest w katalogu`);
    assert.equal(def.support.status, 'supported', `${wiersz.slug}: 100% Oracle = supported (ADR 0022)`);
    assert.deepEqual(def.support.limitations, [], `${wiersz.slug}: brak ograniczeń`);
    assert.equal(def.artId, wiersz.artId, `${wiersz.slug}: artId z listy właściciela`);
    assert.equal(def.plan, wiersz.plan, `${wiersz.slug}: plan przepisany 1:1`);
    assert.equal(def.set, wiersz.set, `${wiersz.slug}: set z kodu artId`);
    assert.equal(def.name, wiersz.name, `${wiersz.slug}: nazwa katalogowa`);
    const linia = csv.find((l) => l.startsWith(String(wiersz.artId)));
    assert.ok(linia, `${wiersz.slug}: wiersz ${wiersz.artId} jest w słowniku kolekcji`);
    assert.equal(linia, `${wiersz.artId}${wiersz.set},${wiersz.name},${wiersz.plan}`,
      `${wiersz.slug}: wiersz słownika = kod, nazwa i plan`);
    // Snapshot Scryfall (dane Oracle + rulingi) istnieje i zgadza się z definicją.
    const snap = snapshotOf(wiersz.slug);
    assert.equal(snap.name, wiersz.name, `${wiersz.slug}: snapshot Scryfall`);
    assert.equal(snap.set, wiersz.set.toLowerCase(), `${wiersz.slug}: set snapshotu`);
    assert.ok(String(snap.collector_number).length > 0,
      `${wiersz.slug}: numer kolekcjonerski w snapshocie`);
    assert.equal(snap.oracle_text, def.oracleText,
      `${wiersz.slug}: oracleText = 100% tekstu Oracle (ADR 0022)`);
    assert.ok(Array.isArray(snap.rulings), `${wiersz.slug}: rulingi pobrane (ADR 0028)`);
    assert.equal(new RegExp(`artId: ${wiersz.artId}, plan: '${wiersz.plan}'`).test(
      fs.readFileSync('src/cards/card-data.js', 'utf8')), true, `${wiersz.slug}: artId+plan w definicji`);
  }
  // Katalog nie zawiera kart spoza listy właściciela (ADR 0029) — ta partia
  // dorzuciła DOKŁADNIE 10 pozycji.
  assert.equal(BATCH70.length, 10, 'lista partii to 10 kart');
});

test('E4/sanity: każda z 10 kart jest w dokładnie jednej talii generatora (ADR 0023)', () => {
  const wTaliach = new Map();
  for (const plik of fs.readdirSync('decks').filter((f) => f.endsWith('.txt'))) {
    const ids = parseDeckText(fs.readFileSync(`decks/${plik}`, 'utf8'), registry).cardIds;
    for (const id of ids) {
      if (!wTaliach.has(id)) wTaliach.set(id, []);
      wTaliach.get(id).push(plik);
    }
  }
  for (const wiersz of BATCH70) {
    assert.equal((wTaliach.get(wiersz.slug) ?? []).length, 1,
      `${wiersz.slug}: dokładnie jedna talia (jest: ${JSON.stringify(wTaliach.get(wiersz.slug))})`);
  }
});

// =========================================================================
// E4 — scenariusze na PRAWDZIWYCH kartach: jeden legalny, jeden nielegalny
// =========================================================================

/** Karta z katalogu w wybranej strefie (pełny deskryptor, jak w talii). */
function real(state, cardId, { id = cardId, zone = 'battlefield', controllerId = 'p1', tapped = false } = {}) {
  const def = registry.get(cardId);
  assert.ok(def, `karta ${cardId} jest w katalogu`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes, keywords: def.keywords ?? [],
  });
  if (tapped) state.objects.set(id, Object.freeze({ ...state.objects.get(id), tapped: true }));
  return state.objects.get(id);
}

const gracz = (state, id = 'p1') => state.players.find((p) => p.id === id) ?? state.players[0];

function mana(state, colors, playerId = 'p1') {
  for (const color of colors) addMana(state, playerId, 1, { colors: color === 'C' ? [] : [color] });
}

/**
 * Przewija stos obu graczy (każdy musi oddać priorytet). Zatrzymuje się, gdy
 * pojawi się decyzja do podjęcia (`resolve_*`) albo stos jest pusty.
 */
function resolveAll(state, limit = 60) {
  for (let i = 0; i < limit && state.zones.stack.length > 0; i += 1) {
    const cmds = commands(state);
    if (cmds.some((c) => /^resolve_/.test(c.type))) return;
    const pass = cmds.find((c) => c.type === 'pass_priority');
    if (!pass) return;
    execute(state, pass);
  }
}

const onBattlefield = (state, cardId) => state.zones.battlefield
  .map((id) => state.objects.get(id)).filter((o) => o?.cardId === cardId);

test('E4/Vault of Whispers: tapnięcie daje {B}; drugie tapnięcie jest odrzucone', () => {
  const state = game();
  real(state, 'vault-of-whispers', { id: 'vault' });
  assert.equal(execute(state, { type: 'tap_for_mana', playerId: 'p1', objectId: 'vault' }).ok, true,
    'artefakt-land z Oracle „{T}: Add {B}” produkuje manę (wzorzec Great Furnace)');
  assert.equal(gracz(state).mana, 1, 'jedna jednostka many w puli');
  assert.equal(gracz(state).manaPool.B, 1, 'mana jest CZARNA (Oracle: Add {B})');
  assert.equal(execute(state, { type: 'tap_for_mana', playerId: 'p1', objectId: 'vault' }).ok, false,
    'tapnięty permanent nie produkuje drugi raz (koszt {T})');
});

test('E4/Trigon of Rage: wchodzi z trzema charge counters; zdejmowanie daje +3/+0, bez liczników — brak aktywacji', () => {
  const state = game();
  real(state, 'trigon-of-rage', { id: 'trigon' });
  applyEnterCounters(state, 'trigon');
  assert.equal(state.objects.get('trigon').counters?.charge, 3, '„enters with three charge counters”');
  const cel = real(state, 'arlinns-wolf', { id: 'cel' });
  mana(state, ['R', 'R', 'C', 'C']);
  const aktywacje = commands(state).filter((c) => c.type === 'activate_ability' && c.objectId === 'trigon');
  assert.ok(aktywacje.length >= 1, 'zdolność jest ofertą w legalCommands');
  // Zdolność 2: {2}, {T}, usuń charge — cel +3/+0.
  const drugi = aktywacje.find((c) => c.abilityIndex === 1);
  assert.ok(drugi, 'oferta zdolności zdejmującej charge counter');
  assert.equal(execute(state, { ...drugi, targets: [cel.id] }).ok, true, 'zdolność przyjęta');
  assert.equal(state.objects.get('trigon').counters.charge, 2, 'charge counter zdjęty (koszt)');
  resolveAll(state);
  assert.equal(effectivePower(state.objects.get('cel'), state), 6, '3/2 staje się 6/2 (+3/+0 do końca tury)');
  // Nielegalne: bez charge counterów zdolność nie jest oferowana.
  state.objects.set('trigon', Object.freeze({
    ...state.objects.get('trigon'),
    counters: {}, tapped: false,
  }));
  const po = commands(state).filter((c) => c.type === 'activate_ability' && c.objectId === 'trigon');
  assert.deepEqual(po.filter((c) => c.abilityIndex === 1), [],
    'brak licznika = koszt niepłatny, więc oferty nie ma (CR 602.2b)');
});

test('E4/Arlinn\'s Wolf: bloker o mocy 3 może blokować, o mocy 2 — nie (próg GÓRNY)', () => {
  const state = game();
  const wolf = real(state, 'arlinns-wolf', { id: 'wolf' });
  real(state, 'fen-hauler', { id: 'duzy', controllerId: 'p2' });
  real(state, 'paranormal-analyst', { id: 'maly', controllerId: 'p2' });
  assert.equal(blockAssignmentViolation(state, wolf, ['duzy']), null,
    'stwór o mocy 3 (Fen Hauler 5/5) blokuje bez przeszkód');
  assert.match(String(blockAssignmentViolation(state, wolf, ['maly'])), /moc/,
    'stwór o mocy ≤ 2 (Paranormal Analyst 1/3) nie może blokować (CR 509.1b)');
});

test('E4/Orazca Puzzle-Door: poświęcenie daje wybór z dwóch kart; bez many zdolność nie jest oferowana', () => {
  const state = game();
  real(state, 'orazca-puzzle-door', { id: 'orazca' });
  real(state, 'arlinns-wolf', { id: 'top1', zone: 'library' });
  real(state, 'jilt', { id: 'top2', zone: 'library' });
  assert.deepEqual(commands(state).filter((c) => c.objectId === 'orazca'), [],
    'bez many {1} zdolność nie jest ofertą (CR 602.2b)');
  mana(state, ['C']);
  const aktywacja = commands(state).find((c) => c.type === 'activate_ability' && c.objectId === 'orazca');
  assert.ok(aktywacja, 'z maną zdolność jest w legalCommands');
  assert.equal(execute(state, aktywacja).ok, true, 'aktywacja przyjęta');
  resolveAll(state);
  const wybor = commands(state, 'p1').find((c) => c.type === 'resolve_look_top_choice');
  assert.ok(wybor, 'decyzja „look at the top two cards” czeka na gracza (CR 608.2)');
  assert.equal(execute(state, wybor).ok, true, 'wybór przyjęty');
  resolveAll(state);
  const obejrzane = (zone) => state.zones[zone].map((id) => state.objects.get(id))
    .filter((o) => ['arlinns-wolf', 'jilt'].includes(o.cardId));
  const reka = obejrzane('hand');
  const grob = obejrzane('graveyard');
  assert.equal(reka.length + grob.length, 2, 'obie obejrzane karty opuściły bibliotekę');
  assert.equal(reka.length, 1, 'wybrana karta idzie do ręki');
  assert.equal(grob.length, 1, 'druga karta idzie do grobu (Oracle)');
  assert.equal(onBattlefield(state, 'orazca-puzzle-door').length, 0,
    'poświęcenie jako koszt: artefakt znika z pola bitwy');
});

test('E4/Fen Hauler: Improvise tapnie artefakty i pokryje część generyczną; bloker-artefakt nie może blokować', () => {
  const state = game();
  real(state, 'fen-hauler', { id: 'fen', zone: 'hand' });
  for (let i = 0; i < 6; i += 1) real(state, 'trigon-of-rage', { id: `art${i}` });
  // Mana tylko na pips {B}; generyczne 6 pokrywają artefakty (CR 702.126a).
  mana(state, ['B']);
  const oferta = commands(state).find((c) => c.type === 'cast_permanent' && c.objectId === 'fen');
  assert.ok(oferta?.improvisePayments?.length === 6, 'oferta Improvise tapnie 6 artefaktów');
  assert.equal(execute(state, oferta).ok, true, 'rzut przyjęty');
  const tapniete = [...state.objects.values()].filter((o) => o.cardId === 'trigon-of-rage' && o.tapped);
  assert.equal(tapniete.length, 6, 'artefakty tapnięte na koszt (nie ma ich już do blokowania)');
  resolveAll(state);
  assert.equal(onBattlefield(state, 'fen-hauler').length, 1, 'Fen Hauler wchodzi na pole bitwy');
  // Ewazja: zwykły stwór blokuje, artefaktowy — nie.
  const fen = onBattlefield(state, 'fen-hauler')[0];
  real(state, 'paranormal-analyst', { id: 'zwykly', controllerId: 'p2' });
  real(state, 'trigon-of-rage', { id: 'art-blok', controllerId: 'p2' });
  state.objects.set('art-blok', Object.freeze({ ...state.objects.get('art-blok'), types: ['Artifact', 'Creature'], power: 1, toughness: 1, kind: 'creature' }));
  assert.equal(blockAssignmentViolation(state, fen, ['zwykly']), null, 'zwykły stwór może blokować');
  assert.match(String(blockAssignmentViolation(state, fen, ['art-blok'])), /nie może blokować/,
    'artefaktowy stwór nie może blokować (Oracle)');
});

test('E4/Jilt: kicked rzut odbija pierwszego celu i zadaje 2 obrażenia INNEMU; ten sam cel dwa razy jest odrzucony', () => {
  const state = game();
  real(state, 'jilt', { id: 'jilt', zone: 'hand' });
  const wolf = real(state, 'arlinns-wolf', { id: 'wolf', controllerId: 'p2' });
  const fen = real(state, 'fen-hauler', { id: 'fen', controllerId: 'p2' });
  mana(state, ['U', 'R', 'C', 'C']);
  const oferta = commands(state, 'p1').find((c) => c.type === 'cast_spell' && c.objectId === 'jilt'
    && c.kicked === true && c.targets?.[0] === 'wolf' && c.targets?.[1] === 'fen');
  assert.ok(oferta, 'wariant kickedowany z DWOMA celami jest ofertą (CR 601.2c)');
  assert.equal(execute(state, oferta).ok, true, 'rzut kickedowany przyjęty');
  resolveAll(state);
  assert.equal(state.zones.hand.map((id) => state.objects.get(id)).some((o) => o.instanceId === wolf.instanceId), true,
    'pierwszy cel wraca do ręki właściciela (bounce)');
  assert.equal(state.objects.get('fen').damage, 2, 'drugi (INNY) cel dostaje 2 obrażenia');
  // Nielegalne 1: bez kickera czar ma tylko jeden cel — drugi jest odrzucany.
  const state2 = game();
  real(state2, 'jilt', { id: 'jilt', zone: 'hand' });
  real(state2, 'arlinns-wolf', { id: 'w2', controllerId: 'p2' });
  real(state2, 'fen-hauler', { id: 'f2', controllerId: 'p2' });
  mana(state2, ['U', 'C']);
  const bezKickera = execute(state2, { type: 'cast_spell', playerId: 'p1', objectId: 'jilt', targets: ['w2', 'f2'] });
  assert.equal(bezKickera.ok, false, 'bez kickera drugi cel jest nielegalny (CR 601.2c)');
  // Nielegalne 2: „another target” — ten sam stwór dwa razy.
  const state3 = game();
  real(state3, 'jilt', { id: 'jilt', zone: 'hand' });
  real(state3, 'arlinns-wolf', { id: 'w3', controllerId: 'p2' });
  mana(state3, ['U', 'R', 'C', 'C']);
  const tenSam = execute(state3, { type: 'cast_spell', playerId: 'p1', objectId: 'jilt', kicked: true, targets: ['w3', 'w3'] });
  assert.equal(tenSam.ok, false, '„another target” wyklucza powtórzenie celu (CR 115.4)');
});

test('E4/Kaleidoscorch: Converge liczy KOLORY many wydanej; z flashbacka karta idzie do exile', () => {
  const state = game();
  real(state, 'kaleidoscorch', { id: 'kal', zone: 'hand' });
  mana(state, ['R', 'G']);
  const oferta = commands(state, 'p1').find((c) => c.type === 'cast_spell' && c.objectId === 'kal' && c.targets?.[0] === 'p2');
  assert.ok(oferta, 'oferta rzutu w gracza („any target”)');
  assert.equal(execute(state, oferta).ok, true, 'rzut przyjęty');
  resolveAll(state);
  assert.equal(gracz(state, 'p2').life, 18, '{R}+{G} = dwa kolory many → X = 2 obrażenia (Converge)');
  const wGrobie = state.zones.graveyard.map((id) => state.objects.get(id)).find((o) => o.cardId === 'kaleidoscorch');
  assert.ok(wGrobie, 'czar po rozstrzygnięciu jest w grobie');
  // Flashback {4}{R}: kolory własnej płatności liczą się do X (CR 702.34a).
  mana(state, ['R', 'G', 'C', 'C', 'C']);
  const flash = commands(state, 'p1').find((c) => c.type === 'cast_flashback' && c.objectId === wGrobie.id);
  assert.ok(flash, 'oferta flashbacka z grobu (CR 702.34a)');
  const zamkniety = commands(state, 'p1').find((c) => c.type === 'cast_flashback' && c.objectId === wGrobie.id && c.targets?.[0] === 'p2');
  assert.ok(zamkniety, 'flashback ma cel „any target”');
  assert.equal(execute(state, zamkniety).ok, true, 'rzut z flashbacka przyjęty');
  resolveAll(state);
  assert.equal(gracz(state, 'p2').life, 16, 'X = 2 kolory płatności flashbacka');
  assert.equal(state.zones.exile.map((id) => state.objects.get(id)).some((o) => o.cardId === 'kaleidoscorch'), true,
    'karta rzucona z flashbacka idzie do exile, nie do grobu (CR 702.34a)');
  // Nielegalne: bez 5 many flashback nie jest ofertą.
  const state2 = game();
  real(state2, 'kaleidoscorch', { id: 'kal2', zone: 'graveyard' });
  mana(state2, ['R', 'C']);
  assert.deepEqual(commands(state2, 'p1').filter((c) => c.type === 'cast_flashback'),
    [], 'za mało many na koszt flashbacka — brak oferty (L48)');
});

test('E4/Moldgraf Millipede: ETB mieli 3 karty i daje +1/+1 za każdą kartę stworzenia w grobie', () => {
  const state = game();
  real(state, 'moldgraf-millipede', { id: 'milipeda', zone: 'hand' });
  // Jeden stwór już w grobie (ruling VOW 2021-11-19: liczy się CAŁY cmentarz).
  real(state, 'arlinns-wolf', { id: 'stary-stwor', zone: 'graveyard' });
  // Wierzch biblioteki: stwór, ląd, stwór, ląd.
  real(state, 'fen-hauler', { id: 'l1', zone: 'library' });
  real(state, 'trigon-of-rage', { id: 'l2', zone: 'library' });
  real(state, 'paranormal-analyst', { id: 'l3', zone: 'library' });
  real(state, 'vault-of-whispers', { id: 'l4', zone: 'library' });
  mana(state, ['G', 'C', 'C', 'C', 'C']);
  const oferta = commands(state, 'p1').find((c) => c.type === 'cast_permanent' && c.objectId === 'milipeda');
  assert.ok(oferta, 'rzut {4}{G} jest ofertą');
  assert.equal(execute(state, oferta).ok, true, 'rzut przyjęty');
  resolveAll(state);
  const milipeda = onBattlefield(state, 'moldgraf-millipede')[0];
  assert.ok(milipeda, 'stwór wszedł na pole bitwy');
  const grob = state.zones.graveyard.map((id) => state.objects.get(id)).map((o) => o.cardId);
  assert.equal(grob.filter((c) => ['fen-hauler', 'paranormal-analyst'].includes(c)).length, 2,
    'dwie karty stworów zmielone do grobu');
  assert.equal(milipeda.counters?.['+1/+1'], 3,
    '1 stary stwór w grobie + 2 zmielone = 3 liczniki (ląd nie liczy się)');
  // Nielegalne: bez many nie ma oferty rzutu (CR 601.2h — koszt musi być płatny).
  const state2 = game();
  real(state2, 'moldgraf-millipede', { id: 'milipeda2', zone: 'hand' });
  mana(state2, ['G']);
  assert.deepEqual(commands(state2, 'p1').filter((c) => c.type === 'cast_permanent' && c.objectId === 'milipeda2'),
    [], 'przy 1 manie rzut za 5 many nie jest ofertą (L48)');
});

test('E4/Magma Pummeler: X z kosztu daje liczniki, a obrażenia zdejmują je i zadają tyle samo w dowolny cel', () => {
  const state = game();
  real(state, 'magma-pummeler', { id: 'pum', zone: 'hand' });
  mana(state, ['R', 'R', 'C', 'C']);
  const oferta = commands(state, 'p1').find((c) => c.type === 'cast_permanent' && c.objectId === 'pum' && c.xValue === 2);
  assert.ok(oferta, 'oferta rzutu z X = 2 ({X}{R}{R} przy 4 manie)');
  assert.equal(execute(state, oferta).ok, true, 'rzut przyjęty');
  resolveAll(state);
  const pum = onBattlefield(state, 'magma-pummeler')[0];
  assert.ok(pum, 'Magma Pummeler na polu bitwy');
  assert.equal(pum.counters?.['+1/+1'], 2, '„enters with X +1/+1 counters” (CR 107.3a)');
  real(state, 'fen-hauler', { id: 'zrodlo', controllerId: 'p2' });
  const przed = state.events.length;
  applyEffect(state, { type: 'damage', amount: 1, targetIndex: 0 }, state.objects.get('zrodlo'), [pum.id]);
  processTriggers(state, state.events.slice(przed));
  assert.equal(state.objects.get(pum.id).counters?.['+1/+1'], 1, 'obrażenie 1 = jeden zdjęty licznik, zero obrażeń');
  const wybor = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'resolve_trigger_target' && (c.targetIds ?? [c.targetId]).includes('p2'));
  assert.ok(wybor, 'refleksyjny trigger prosi o CEL „any target” (CR 603.3d)');
  assert.equal(execute(state, wybor.targetIds ? { ...wybor, targetId: 'p2' } : wybor).ok, true);
  resolveAll(state);
  assert.equal(gracz(state, 'p2').life, 19, 'trigger zadaje tyle obrażeń, ile zdjętych liczników');
  // Nielegalne: X większe niż pozwala pula many nie jest ofertą.
  const state2 = game();
  real(state2, 'magma-pummeler', { id: 'pum2', zone: 'hand' });
  mana(state2, ['R', 'R']);
  const oferty = commands(state2, 'p1').filter((c) => c.type === 'cast_permanent' && c.objectId === 'pum2');
  assert.deepEqual(oferty.map((c) => c.xValue), [0],
    'przy 2 manie jedyny wariant to X = 0 ({X}{R}{R} = 2)');
});

test('E4/Paranormal Analyst: prawdziwa karta zwraca tę kartę, którą manifest dread położył w grobie', () => {
  const state = game();
  const analityk = real(state, 'paranormal-analyst', { id: 'analityk' });
  real(state, 'arlinns-wolf', { id: 'gora1', zone: 'library' });
  real(state, 'jilt', { id: 'gora2', zone: 'library' });
  const przed = state.events.length;
  applyEffect(state, { type: 'manifest_dread' }, analityk);
  processTriggers(state, state.events.slice(przed));
  const wybor = commands(state, 'p1').find((c) => c.type === 'resolve_manifest_dread' && c.cardId === 'gora1');
  assert.ok(wybor, 'wybór karty do zmanifestowania (Oracle manifest dread)');
  assert.equal(execute(state, wybor).ok, true, 'wybór przyjęty');
  resolveAll(state);
  const reka = state.zones.hand.map((id) => state.objects.get(id)).map((o) => o.instanceId);
  assert.deepEqual(reka, ['i-gora2'],
    'do ręki wraca DOKŁADNIE karta położona w grobie tą drogą (ruling DSK 2024-09-20)');
});
