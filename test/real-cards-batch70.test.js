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
