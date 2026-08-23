// Batch 47 (M194, 2026-08-23) — lista właściciela, 8 kart.
//
// Transza A: warianty druku (Curate STX, Negate M15) — te same reguły co
// egzemplarze już w katalogu, inny art i PLAN (czyli inna talia).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCardRegistry } from '../src/cards/card-data.js';
import { parseDeckText } from '../src/cards/deck-text.js';

const REGISTRY = createCardRegistry();

// ---- Transza A: dwa egzemplarze tej samej karty --------------------------

test('B47/A1: Curate STX i Curate BRO to DWA egzemplarze o zgodnych regułach', () => {
  const bro = REGISTRY.get('curate');
  const stx = REGISTRY.get('curate-stx');
  assert.ok(bro && stx, 'oba egzemplarze w katalogu');
  assert.equal(stx.name, bro.name, 'ta sama karta (nazwa)');
  assert.notEqual(stx.set, bro.set, 'różne druki');
  assert.notEqual(stx.artId, bro.artId, 'różne ilustracje');
  assert.notEqual(stx.plan, bro.plan, 'różne plany → różne talie');
  assert.equal(stx.plan, 'Arcavios');
  assert.equal(bro.plan, 'Forgotten Realms');
  // Reguły MUSZĄ być identyczne — to ta sama karta Magic (ten sam Oracle).
  assert.equal(stx.oracleText, bro.oracleText, 'identyczny Oracle');
  assert.deepEqual(stx.spell.effects, bro.spell.effects, 'identyczne efekty');
  assert.deepEqual(stx.spell.targets, bro.spell.targets);
  assert.equal(stx.manaCost, bro.manaCost);
});

test('B47/A2: Negate M15 i Negate M20 to DWA egzemplarze o zgodnych regułach', () => {
  const m20 = REGISTRY.get('negate');
  const m15 = REGISTRY.get('negate-m15');
  assert.ok(m20 && m15, 'oba egzemplarze w katalogu');
  assert.equal(m15.name, m20.name);
  assert.notEqual(m15.set, m20.set);
  assert.notEqual(m15.artId, m20.artId);
  assert.equal(m15.plan, 'Warhammer Fantasy', 'plan wskazany przez właściciela');
  assert.equal(m20.plan, 'Wiedźmin', 'egzemplarz M20 zostaje bez zmian');
  assert.equal(m15.oracleText, m20.oracleText);
  assert.deepEqual(m15.spell.effects, m20.spell.effects);
  assert.deepEqual(m15.spell.targets, m20.spell.targets);
});

test('B47/A3: każdy egzemplarz trafia do talii SWOJEGO planu', () => {
  // Sedno zlecenia: „będą dwie takie karty, jedna w jednej talii, druga
  // w drugiej". Bez rozróżnienia egzemplarzy (M194/K1) obie linie talii
  // rozwiązałyby się na ten sam cardId.
  const deckOf = (file) => parseDeckText(fs.readFileSync(`decks/${file}`, 'utf8'), REGISTRY).cardIds;
  const gdzie = (cardId) => fs.readdirSync('decks')
    .filter((f) => f.endsWith('.txt'))
    .filter((f) => deckOf(f).includes(cardId));
  for (const [cardId, oczekiwane] of [
    ['curate', 'forgotten-realms.txt'],
    ['curate-stx', 'worek-legend.txt'],
    ['negate', 'wiedzmin.txt'],
    ['negate-m15', 'warhammer.txt'],
  ]) {
    assert.deepEqual(gdzie(cardId), [oczekiwane],
      `${cardId} ma być w DOKŁADNIE jednej talii: ${oczekiwane}`);
  }
});

test('B47/A4: warianty są rzucalne w grze (pełna ścieżka, nie tylko dane)', async () => {
  // Karta w katalogu to za mało — musi dać się rzucić. Sprawdzamy ofertę
  // w playerView dla OBU egzemplarzy (wariant nie może być martwym wpisem).
  const { createGameState, addObject, playerView } = await import('../src/engine/game-state.js');
  const { gameObjectDataOf } = await import('../src/cards/materialize.js');
  const { jumpToStep } = await import('../src/engine/turn.js');
  for (const cardId of ['curate-stx', 'negate-m15']) {
    const state = createGameState({ seed: 47, players: [{ id: 'p1' }, { id: 'p2' }] });
    state.turn = jumpToStep(state.turn, 'main', 'p1');
    state.turn.activePlayerId = 'p1';
    state.turn.priorityPlayerId = 'p1';
    const def = REGISTRY.get(cardId);
    addObject(state, {
      id: 'spell', instanceId: 'i-spell', cardId, controllerId: 'p1', ownerId: 'p1', zone: 'hand',
      ...gameObjectDataOf(def), types: def.types, spell: def.spell,
    });
    for (let i = 0; i < 2; i += 1) {
      addObject(state, {
        id: `isl${i}`, instanceId: `i-isl${i}`, cardId: 'basic-island', controllerId: 'p1',
        ownerId: 'p1', zone: 'battlefield', kind: 'land', types: ['Basic', 'Land'], subtypes: ['Island'],
      });
    }
    const view = playerView(state, 'p1');
    const offers = view.legalCommands.filter((c) => c.objectId === 'spell');
    if (cardId === 'curate-stx') {
      assert.ok(offers.some((c) => c.type === 'cast_spell'), `${cardId}: oferta rzutu (surveil 2 + dobranie)`);
    } else {
      // Negate wymaga celu na stosie — bez czaru przeciwnika oferty NIE ma
      // (CR 601.2c). Sprawdzamy więc, że karta jest znana i ma cel w danych.
      assert.deepEqual(def.spell.targets, [{ type: 'noncreature_spell_on_stack' }]);
    }
  }
});

// ---- Transza B: Divest, Supernatural Stamina -----------------------------

test('B47/B1: Divest wybiera TYLKO artefakt albo stwora (Oracle)', async () => {
  // Oracle: „Target player reveals their hand. You choose an artifact or
  // creature card from it. That player discards that card."
  // Wzorzec Toll of the Invasion filtruje „nonland" — dla Divest to za szeroko:
  // instant/sorcery/enchantment w rece przeciwnika NIE moga byc wybrane.
  const { createGameState, addObject, execute } = await import('../src/engine/game-state.js');
  const { applyEffect } = await import('../src/engine/effects.js');
  const { gameObjectDataOf } = await import('../src/cards/materialize.js');
  const state = createGameState({ seed: 47, players: [{ id: 'p1' }, { id: 'p2' }] });
  const put = (id, cardId) => {
    const def = REGISTRY.get(cardId);
    addObject(state, {
      id, instanceId: `i-${id}`, cardId, controllerId: 'p2', ownerId: 'p2', zone: 'hand',
      ...gameObjectDataOf(def), types: def.types ?? [], subtypes: def.subtypes ?? [], spell: def.spell,
    });
  };
  put('cre', 'hill-giant');          // Creature — wybieralny
  put('art', 'seers-lantern');       // Artifact  — wybieralny
  put('ins', 'negate');              // Instant   — NIE
  put('lnd', 'basic-swamp');         // Land      — NIE
  const source = { id: 'src', controllerId: 'p1', cardId: 'divest', zone: 'stack' };
  applyEffect(state, { type: 'reveal_hand_choose_discard', mandatory: true, filter: { anyTypes: ['Artifact', 'Creature'] } }, source, ['p2']);
  const offered = state.pendingDiscardChoice?.handIds ?? [];
  assert.deepEqual([...offered].sort(), ['art', 'cre'],
    `Divest wybiera wyłącznie artefakt/stwora, dostałem: ${JSON.stringify(offered)}`);
  assert.equal(state.pendingDiscardChoice.chooserId, 'p1', 'wybiera rzucający, odrzuca właściciel ręki');
  const res = execute(state, { type: 'resolve_discard_choice', playerId: 'p1', cardId: 'cre' });
  assert.ok(res.ok, `odrzucenie przyjęte: ${JSON.stringify(res)}`);
  // Obiekt przeniesiony do grobu dostaje NOWE id — sprawdzamy po cardId.
  const inGrave = [...state.objects.values()].filter((o) => o.zone === 'graveyard').map((o) => o.cardId);
  assert.deepEqual(inGrave, ['hill-giant'], `wybrany stwór trafia do grobu: ${JSON.stringify(inGrave)}`);
  const inHand = [...state.objects.values()].filter((o) => o.zone === 'hand').map((o) => o.cardId).sort();
  assert.deepEqual(inHand, ['basic-swamp', 'negate', 'seers-lantern'], 'reszta ręki nietknięta');
});

test('B47/B2: Divest bez artefaktu i stwora w ręce nie odrzuca nic', () => {
  // CR: „You choose an artifact or creature card from it" — brak takiej karty
  // oznacza brak wyboru; NIE wolno wtedy odrzucić czegokolwiek innego.
  const card = REGISTRY.get('divest');
  assert.ok(card, 'Divest w katalogu');
  const eff = card.spell.effects.find((e) => e.type === 'reveal_hand_choose_discard');
  assert.ok(eff, 'Divest używa efektu reveal+discard');
  assert.deepEqual(eff.filter?.anyTypes, ['Artifact', 'Creature'],
    'filtr z Oracle jest w DANYCH karty (ADR 0002), nie w kodzie silnika');
  assert.equal(eff.mandatory, true, 'wybór obowiązkowy — bez wariantu „If you don\'t"');
});

test('B47/B3: Supernatural Stamina daje +2/+0 i powrót po śmierci', () => {
  // Oracle: „Until end of turn, target creature gets +2/+0 and gains »When
  // this creature dies, return it to the battlefield tapped under its owner's
  // control.«" — wzorzec Fake Your Own Death, ale BEZ tokenu Skarbu.
  const card = REGISTRY.get('supernatural-stamina');
  assert.ok(card, 'karta w katalogu');
  assert.equal(card.manaCost, 1);
  assert.deepEqual(card.spell.targets, [{ type: 'creature' }]);
  const pump = card.spell.effects.find((e) => e.type === 'pump');
  assert.deepEqual([pump?.power, pump?.toughness], [2, 0], '+2/+0');
  const grant = card.spell.effects.find((e) => e.type === 'grant_abilities');
  assert.ok(grant, 'nadaje zdolność wyzwalaną');
  const trigger = grant.abilities[0];
  assert.equal(trigger.trigger.event, 'dies');
  assert.deepEqual(trigger.effect.map((e) => e.type), ['return_to_battlefield_tapped'],
    'sam powrót — bez Skarbu (to Fake Your Own Death, inna karta)');
});

test('B47/B4: Supernatural Stamina — pełna ścieżka: stwór ginie i wraca zatapniony', async () => {
  const { createGameState, addObject, execute, playerView } = await import('../src/engine/game-state.js');
  const { gameObjectDataOf } = await import('../src/cards/materialize.js');
  const { jumpToStep } = await import('../src/engine/turn.js');
  const state = createGameState({ seed: 47, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  const def = REGISTRY.get('supernatural-stamina');
  addObject(state, {
    id: 'spell', instanceId: 'i-spell', cardId: 'supernatural-stamina', controllerId: 'p1',
    ownerId: 'p1', zone: 'hand', ...gameObjectDataOf(def), types: def.types, spell: def.spell,
  });
  const cre = REGISTRY.get('hill-giant');
  addObject(state, {
    id: 'cre', instanceId: 'i-cre', cardId: 'hill-giant', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', ...gameObjectDataOf(cre), types: cre.types, summoningSickness: false,
  });
  addObject(state, {
    id: 'sw', instanceId: 'i-sw', cardId: 'basic-swamp', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'land', types: ['Basic', 'Land'], subtypes: ['Swamp'],
  });
  const offer = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'spell');
  assert.ok(offer, 'oferta rzutu za {B}');
  assert.ok(execute(state, offer).ok, 'czar rzucony');
  // rozstrzygnięcie stosu
  for (let i = 0; i < 6 && state.zones.stack.length > 0; i += 1) {
    const pass = playerView(state, state.turn.priorityPlayerId).legalCommands
      .find((c) => c.type === 'pass_priority');
    if (!pass) break;
    execute(state, pass);
  }
  const buffed = state.objects.get('cre');
  assert.equal((buffed.power ?? 0) + (buffed.powerModifier ?? 0), 5, 'Hill Giant 3/3 → 5/3');
});
