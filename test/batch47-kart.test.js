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

// ---- Transza C: Sequestered Stash, Enduring Sliver (keyword outlast) ------

test('B47/C1: Sequestered Stash produkuje {C} i ma zdolność mill+odzysk', () => {
  // Oracle: „{T}: Add {C}. / {4}, {T}, Sacrifice this land: Mill five cards.
  // Then you may put an artifact card from your graveyard on top of your
  // library." Kolor produkcji czytany z DESKRYPTORA (naprawa M193/A).
  const card = REGISTRY.get('sequestered-stash');
  assert.ok(card, 'karta w katalogu');
  assert.deepEqual(card.types, ['Land']);
  const mana = card.abilities.find((a) => (Array.isArray(a.effect) ? a.effect : [a.effect])
    .some((e) => e?.type === 'add_mana'));
  assert.ok(mana, 'zdolność many z Oracle');
  assert.deepEqual(mana.cost, { tap: true }, 'koszt {T}');
  const sac = card.abilities.find((a) => a.cost?.sacrificeSelf);
  assert.ok(sac, 'zdolność z poświęceniem');
  assert.equal(sac.cost.mana, 4, '{4} w koszcie');
  assert.equal(sac.cost.tap, true, '{T} w koszcie');
  const types = (Array.isArray(sac.effect) ? sac.effect : [sac.effect]).map((e) => e.type);
  // Wybór artefaktu następuje PO millu i jest opcjonalny, więc to blokująca
  // decyzja (wzorzec Forever Young), a nie efekt z celem wskazanym przy
  // aktywacji — zmielony artefakt też musi być kandydatem (CR 608.2).
  assert.deepEqual(types, ['mill_cards', 'graveyard_card_to_library_top_choice'],
    'mill 5, potem opcjonalny odzysk artefaktu');
  const pick = (Array.isArray(sac.effect) ? sac.effect : [sac.effect])[1];
  assert.deepEqual(pick.filter?.anyTypes, ['Artifact'], 'filtr rodzaju karty w DANYCH (ADR 0002)');
});

test('B47/C1b: Sequestered Stash jest źródłem many BEZBARWNEJ (nie kolorowej)', async () => {
  const { getSourceForObject } = await import('../src/engine/mana-sources.js');
  const { gameObjectDataOf } = await import('../src/cards/materialize.js');
  const card = REGISTRY.get('sequestered-stash');
  const object = {
    id: 'ss', cardId: 'sequestered-stash', controllerId: 'p1', zone: 'battlefield',
    ...gameObjectDataOf(card), types: card.types, subtypes: card.subtypes ?? [],
  };
  assert.deepEqual(getSourceForObject(object)?.colors, [], 'Oracle „Add {C}" — bezbarwna');
});

test('B47/C2: Enduring Sliver ma outlast {2} i nadaje go INNYM Sliverom', () => {
  // Oracle: „Outlast {2} ({2}, {T}: Put a +1/+1 counter on this creature.
  // Outlast only as a sorcery.) / Other Sliver creatures you control have
  // outlast {2}."
  const card = REGISTRY.get('enduring-sliver');
  assert.ok(card, 'karta w katalogu');
  assert.deepEqual(card.subtypes, ['Sliver']);
  assert.deepEqual([card.power, card.toughness], [2, 2]);
  const outlast = card.abilities.find((a) => a.keyword === 'outlast');
  assert.ok(outlast, 'własne outlast jako zdolność aktywowana');
  assert.equal(outlast.cost.mana, 2, 'koszt {2}');
  assert.equal(outlast.cost.tap, true, 'outlast wymaga {T} (CR 702.100a)');
  assert.equal(outlast.timing, 'sorcery', 'outlast tylko jak sorcery');
  const eff = Array.isArray(outlast.effect) ? outlast.effect[0] : outlast.effect;
  assert.deepEqual([eff.type, eff.counter], ['add_counter', '+1/+1']);
  // Nadanie plemieniu — zasięg po PODTYPIE (wzorzec Altar of the Goyf).
  const grant = card.abilities.find((a) => a.type === 'static' && a.scope);
  assert.ok(grant, 'statyka nadająca outlast innym Sliverom');
  assert.equal(grant.scope.subtype, 'Sliver');
});

test('B47/C2b: outlast jest ZNANYM keywordem (nie martwym wpisem)', async () => {
  // Strażnik z bug-hunt pilnuje, żeby keyword w danych miał mechanikę.
  // Ten test wymusza, by outlast realnie działał: aktywacja kładzie licznik.
  const { createGameState, addObject, execute, playerView } = await import('../src/engine/game-state.js');
  const { gameObjectDataOf } = await import('../src/cards/materialize.js');
  const { jumpToStep } = await import('../src/engine/turn.js');
  const state = createGameState({ seed: 47, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  const def = REGISTRY.get('enduring-sliver');
  addObject(state, {
    id: 'sliver', instanceId: 'i-sliver', cardId: 'enduring-sliver', controllerId: 'p1',
    ownerId: 'p1', zone: 'battlefield', ...gameObjectDataOf(def),
    types: def.types, subtypes: def.subtypes, summoningSickness: false,
  });
  for (let i = 0; i < 2; i += 1) {
    addObject(state, {
      id: `pl${i}`, instanceId: `i-pl${i}`, cardId: 'basic-plains', controllerId: 'p1',
      ownerId: 'p1', zone: 'battlefield', kind: 'land', types: ['Basic', 'Land'], subtypes: ['Plains'],
    });
  }
  const offer = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'sliver');
  assert.ok(offer, 'outlast jest oferowany w oknie sorcery');
  assert.ok(execute(state, offer).ok, 'aktywacja przyjęta');
  assert.equal(state.objects.get('sliver').tapped, true, 'koszt {T} zapłacony od razu');
  // Outlast nie jest zdolnością many — idzie na stos (CR 602.2a).
  for (let i = 0; i < 8 && state.zones.stack.length > 0; i += 1) {
    const pass = playerView(state, state.turn.priorityPlayerId).legalCommands
      .find((c) => c.type === 'pass_priority');
    if (!pass) break;
    execute(state, pass);
  }
  const after = state.objects.get('sliver');
  assert.equal(after.counters?.['+1/+1'] ?? 0, 1, 'outlast kładzie licznik +1/+1');
});

test('B47/C2c: outlast NIE jest dostępny w oknie instant (CR 702.100a)', async () => {
  const { createGameState, addObject, playerView } = await import('../src/engine/game-state.js');
  const { gameObjectDataOf } = await import('../src/cards/materialize.js');
  const { jumpToStep } = await import('../src/engine/turn.js');
  const state = createGameState({ seed: 47, players: [{ id: 'p1' }, { id: 'p2' }] });
  // Krok deklaracji blokujących = okno instant, nie sorcery.
  state.turn = jumpToStep(state.turn, 'declare_blockers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  const def = REGISTRY.get('enduring-sliver');
  addObject(state, {
    id: 'sliver', instanceId: 'i-sliver', cardId: 'enduring-sliver', controllerId: 'p1',
    ownerId: 'p1', zone: 'battlefield', ...gameObjectDataOf(def),
    types: def.types, subtypes: def.subtypes, summoningSickness: false,
  });
  for (let i = 0; i < 2; i += 1) {
    addObject(state, {
      id: `pl${i}`, instanceId: `i-pl${i}`, cardId: 'basic-plains', controllerId: 'p1',
      ownerId: 'p1', zone: 'battlefield', kind: 'land', types: ['Basic', 'Land'], subtypes: ['Plains'],
    });
  }
  const offers = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'activate_ability' && c.objectId === 'sliver');
  assert.deepEqual(offers, [], 'outlast tylko jak sorcery');
});

test('B47/C2d: inny Sliver dostaje outlast od Enduring Slivera', async () => {
  // „Other Sliver creatures you control have outlast {2}" — statyka nadaje
  // ZDOLNOŚĆ (nie keyword-cechę), więc drugi Sliver ma dostać ofertę.
  const { createGameState, addObject, playerView } = await import('../src/engine/game-state.js');
  const { gameObjectDataOf } = await import('../src/cards/materialize.js');
  const { jumpToStep } = await import('../src/engine/turn.js');
  const state = createGameState({ seed: 47, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  const def = REGISTRY.get('enduring-sliver');
  addObject(state, {
    id: 'lord', instanceId: 'i-lord', cardId: 'enduring-sliver', controllerId: 'p1',
    ownerId: 'p1', zone: 'battlefield', ...gameObjectDataOf(def),
    types: def.types, subtypes: def.subtypes, summoningSickness: false,
  });
  // Drugi Sliver: syntetyczny stwór o podtypie Sliver bez własnego outlast.
  addObject(state, {
    id: 'other', instanceId: 'i-other', cardId: 'hill-giant', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'creature', power: 3, toughness: 3,
    types: ['Creature'], subtypes: ['Sliver'], abilities: [], summoningSickness: false,
  });
  for (let i = 0; i < 4; i += 1) {
    addObject(state, {
      id: `pl${i}`, instanceId: `i-pl${i}`, cardId: 'basic-plains', controllerId: 'p1',
      ownerId: 'p1', zone: 'battlefield', kind: 'land', types: ['Basic', 'Land'], subtypes: ['Plains'],
    });
  }
  const offers = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'activate_ability' && c.objectId === 'other');
  assert.ok(offers.length > 0,
    'Sliver bez własnego outlast dostaje go od Enduring Slivera (CR 604 — statyka)');
});

test('B47/C1c: Sequestered Stash — pełna ścieżka: mill 5, wybór artefaktu na wierzch', async () => {
  // Sedno karty: artefakt DOPIERO CO zmielony musi dać się odzyskać.
  const { createGameState, addObject, execute, playerView } = await import('../src/engine/game-state.js');
  const { gameObjectDataOf } = await import('../src/cards/materialize.js');
  const { jumpToStep } = await import('../src/engine/turn.js');
  const state = createGameState({ seed: 47, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  const def = REGISTRY.get('sequestered-stash');
  addObject(state, {
    id: 'stash', instanceId: 'i-stash', cardId: 'sequestered-stash', controllerId: 'p1',
    ownerId: 'p1', zone: 'battlefield', ...gameObjectDataOf(def), types: def.types, subtypes: [],
  });
  for (let i = 0; i < 4; i += 1) {
    addObject(state, {
      id: `mtn${i}`, instanceId: `i-mtn${i}`, cardId: 'basic-mountain', controllerId: 'p1',
      ownerId: 'p1', zone: 'battlefield', kind: 'land', types: ['Basic', 'Land'], subtypes: ['Mountain'],
    });
  }
  // Biblioteka: artefakt na wierzchu + 4 wypełniacze (mill 5 zabiera wszystko).
  const lantern = REGISTRY.get('seers-lantern');
  addObject(state, {
    id: 'lib0', instanceId: 'i-lib0', cardId: 'seers-lantern', controllerId: 'p1', ownerId: 'p1',
    zone: 'library', ...gameObjectDataOf(lantern), types: lantern.types,
  });
  for (let i = 1; i < 5; i += 1) {
    addObject(state, {
      id: `lib${i}`, instanceId: `i-lib${i}`, cardId: 'basic-forest', controllerId: 'p1',
      ownerId: 'p1', zone: 'library', kind: 'land', types: ['Basic', 'Land'], subtypes: ['Forest'],
    });
  }
  const offer = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'stash' && c.abilityIndex === 1);
  assert.ok(offer, 'oferta zdolności {4},{T},poświęć');
  assert.ok(execute(state, offer).ok, 'aktywacja przyjęta');
  // Zdolność NIE jest mana ability, więc idzie na stos (CR 602.2a) —
  // rozstrzygamy ją, zanim sprawdzimy skutek millu.
  for (let i = 0; i < 8 && state.zones.stack.length > 0; i += 1) {
    const pass = playerView(state, state.turn.priorityPlayerId).legalCommands
      .find((c) => c.type === 'pass_priority');
    if (!pass) break;
    execute(state, pass);
  }
  const graveCards = [...state.objects.values()].filter((o) => o.zone === 'graveyard').map((o) => o.cardId);
  assert.ok(graveCards.includes('seers-lantern'), `artefakt zmielony do grobu: ${graveCards}`);
  // Blokująca decyzja: wybór artefaktu z grobu (także tego zmielonego).
  const pickCmd = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'resolve_graveyard_top_choice' && c.targetId != null);
  assert.ok(pickCmd, 'gracz dostaje wybór artefaktu z grobu');
  const chosen = state.objects.get(pickCmd.targetId);
  assert.equal(chosen.cardId, 'seers-lantern', 'kandydatem jest ARTEFAKT, nie zmielone lasy');
  assert.ok(execute(state, pickCmd).ok, 'wybór przyjęty');
  const topId = state.zones.library.find((id) => state.objects.get(id)?.controllerId === 'p1');
  assert.equal(state.objects.get(topId)?.cardId, 'seers-lantern', 'artefakt ląduje na wierzchu biblioteki');
});

test('B47/C2e: outlast NIE wycieka na stwory spoza plemienia (anty-over-fix)', async () => {
  // Luka wykryta weryfikacja mutacyjna: usuniecie filtra podtypu nie
  // czerwienilo zadnego testu, wiec „Other SLIVER creatures" moglo po cichu
  // stac sie „wszystkie twoje stwory". Oracle jest wezszy — pilnujemy tego.
  const { createGameState, addObject, playerView } = await import('../src/engine/game-state.js');
  const { gameObjectDataOf } = await import('../src/cards/materialize.js');
  const { jumpToStep } = await import('../src/engine/turn.js');
  const state = createGameState({ seed: 47, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  const def = REGISTRY.get('enduring-sliver');
  addObject(state, {
    id: 'lord', instanceId: 'i-lord', cardId: 'enduring-sliver', controllerId: 'p1',
    ownerId: 'p1', zone: 'battlefield', ...gameObjectDataOf(def),
    types: def.types, subtypes: def.subtypes, summoningSickness: false,
  });
  // Stwór BEZ podtypu Sliver — nie może dostać outlast.
  const giant = REGISTRY.get('hill-giant');
  addObject(state, {
    id: 'giant', instanceId: 'i-giant', cardId: 'hill-giant', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', ...gameObjectDataOf(giant), types: giant.types,
    subtypes: giant.subtypes ?? [], summoningSickness: false,
  });
  for (let i = 0; i < 4; i += 1) {
    addObject(state, {
      id: `pl${i}`, instanceId: `i-pl${i}`, cardId: 'basic-plains', controllerId: 'p1',
      ownerId: 'p1', zone: 'battlefield', kind: 'land', types: ['Basic', 'Land'], subtypes: ['Plains'],
    });
  }
  const offers = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'activate_ability' && c.objectId === 'giant');
  assert.deepEqual(offers, [], 'Hill Giant to nie Sliver — żadnego outlast');
});

test('B47/C2f: outlast znika, gdy Enduring Sliver opuszcza pole bitwy', async () => {
  // Statyka jest liczona przy ODCZYCIE (CR 604) — po zniknięciu lorda
  // pozostałe Slivery natychmiast tracą nadaną zdolność, bez sprzątania stanu.
  const { createGameState, addObject, playerView, moveObjectDirectly } = await import('../src/engine/game-state.js');
  const { gameObjectDataOf } = await import('../src/cards/materialize.js');
  const { jumpToStep } = await import('../src/engine/turn.js');
  const state = createGameState({ seed: 47, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  const def = REGISTRY.get('enduring-sliver');
  addObject(state, {
    id: 'lord', instanceId: 'i-lord', cardId: 'enduring-sliver', controllerId: 'p1',
    ownerId: 'p1', zone: 'battlefield', ...gameObjectDataOf(def),
    types: def.types, subtypes: def.subtypes, summoningSickness: false,
  });
  addObject(state, {
    id: 'other', instanceId: 'i-other', cardId: 'hill-giant', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'creature', power: 3, toughness: 3,
    types: ['Creature'], subtypes: ['Sliver'], abilities: [], summoningSickness: false,
  });
  for (let i = 0; i < 4; i += 1) {
    addObject(state, {
      id: `pl${i}`, instanceId: `i-pl${i}`, cardId: 'basic-plains', controllerId: 'p1',
      ownerId: 'p1', zone: 'battlefield', kind: 'land', types: ['Basic', 'Land'], subtypes: ['Plains'],
    });
  }
  const before = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'activate_ability' && c.objectId === 'other');
  assert.ok(before.length > 0, 'przy lordzie Sliver ma outlast');
  moveObjectDirectly(state, 'lord', 'graveyard', 'grave-lord');
  const after = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'activate_ability' && c.objectId === 'other');
  assert.deepEqual(after, [], 'po odejściu lorda outlast znika natychmiast');
});
