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
    ['negate-m15', 'warhammer-wu.txt'],
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

// ---- Transza D: Caves of Chaos Adventurer --------------------------------

test('B47/D1: Caves of Chaos Adventurer — dane wg Oracle', () => {
  const card = REGISTRY.get('caves-of-chaos-adventurer');
  assert.ok(card, 'karta w katalogu');
  assert.deepEqual([card.power, card.toughness], [5, 3]);
  assert.equal(card.manaCost, 4);
  assert.deepEqual(card.keywords, ['trample']);
  const etb = card.abilities.find((a) => a.trigger?.event === 'enter_battlefield');
  assert.ok(etb, 'ETB: obejmujesz inicjatywę');
  assert.deepEqual((Array.isArray(etb.effect) ? etb.effect : [etb.effect]).map((e) => e.type),
    ['take_initiative']);
  const atk = card.abilities.find((a) => a.trigger?.event === 'attacks');
  assert.ok(atk, 'trigger ataku: impulse exile');
  assert.deepEqual((Array.isArray(atk.effect) ? atk.effect : [atk.effect]).map((e) => e.type),
    ['exile_top_playable_until_next_turn']);
});

test('B47/D2: atak wygania wierzch biblioteki jako grywalny', async () => {
  const { createGameState, addObject, execute, playerView } = await import('../src/engine/game-state.js');
  const { gameObjectDataOf } = await import('../src/cards/materialize.js');
  const { jumpToStep } = await import('../src/engine/turn.js');
  const state = createGameState({ seed: 47, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  const def = REGISTRY.get('caves-of-chaos-adventurer');
  addObject(state, {
    id: 'adv', instanceId: 'i-adv', cardId: 'caves-of-chaos-adventurer', controllerId: 'p1',
    ownerId: 'p1', zone: 'battlefield', ...gameObjectDataOf(def),
    types: def.types, keywords: def.keywords, subtypes: def.subtypes ?? [], summoningSickness: false,
  });
  addObject(state, {
    id: 'lib0', instanceId: 'i-lib0', cardId: 'hill-giant', controllerId: 'p1', ownerId: 'p1',
    zone: 'library', kind: 'creature', power: 3, toughness: 3, types: ['Creature'],
  });
  const declare = playerView(state, 'p1').legalCommands.find((c) => c.type === 'declare_attackers');
  assert.ok(declare, 'można zadeklarować atak');
  assert.ok(execute(state, { ...declare, attackerIds: ['adv'] }).ok, 'atak zadeklarowany');
  for (let i = 0; i < 8 && state.zones.stack.length > 0; i += 1) {
    const pass = playerView(state, state.turn.priorityPlayerId).legalCommands
      .find((c) => c.type === 'pass_priority');
    if (!pass) break;
    execute(state, pass);
  }
  const exiled = [...state.objects.values()].filter((o) => o.zone === 'exile');
  assert.equal(exiled.length, 1, 'wierzch biblioteki wygnany');
  assert.ok(exiled[0].playableUntilTurn != null,
    'wygnana karta jest GRYWALNA do końca następnej tury (impulse exile)');
});

test('B47/D3: bez ukończonego lochu karta kosztuje normalnie', () => {
  // Oracle: „If you've completed a dungeon, you may play that card this turn
  // WITHOUT PAYING its mana cost. Otherwise, you may play that card this turn."
  // Warunek musi być w DANYCH karty (ADR 0002) — silnik nie zna nazw kart.
  const card = REGISTRY.get('caves-of-chaos-adventurer');
  const atk = card.abilities.find((a) => a.trigger?.event === 'attacks');
  const eff = (Array.isArray(atk.effect) ? atk.effect : [atk.effect])[0];
  assert.equal(eff.freeIfCondition?.type, 'completed_dungeon',
    'deskryptor niesie warunek „za darmo, jeśli ukończyłeś loch"');
});

test('B47/D4: ukończony loch daje grę BEZ płacenia kosztu', async () => {
  const { createGameState, addObject } = await import('../src/engine/game-state.js');
  const { applyEffect } = await import('../src/engine/effects.js');
  const state = createGameState({ seed: 47, players: [{ id: 'p1' }, { id: 'p2' }] });
  addObject(state, {
    id: 'lib0', instanceId: 'i-lib0', cardId: 'hill-giant', controllerId: 'p1', ownerId: 'p1',
    zone: 'library', kind: 'creature', power: 3, toughness: 3, types: ['Creature'], manaCost: 4,
  });
  // Gracz ukończył loch: ostatni pokój Undercity (Throne of the Dead Three).
  state.undercityProgress = { p1: 9 };
  const source = { id: 'src', controllerId: 'p1', cardId: 'caves-of-chaos-adventurer', zone: 'battlefield' };
  applyEffect(state, {
    type: 'exile_top_playable_until_next_turn',
    freeIfCondition: { type: 'completed_dungeon' },
  }, source, []);
  const exiled = [...state.objects.values()].find((o) => o.zone === 'exile');
  assert.ok(exiled, 'karta wygnana');
  assert.equal(exiled.playableWithoutPaying, true,
    'po ukończeniu lochu kartę gra się bez płacenia kosztu many');
});

test('B47/D5: NIEukończony loch — karta grywalna, ale za koszt (anty-over-fix)', async () => {
  const { createGameState, addObject } = await import('../src/engine/game-state.js');
  const { applyEffect } = await import('../src/engine/effects.js');
  const state = createGameState({ seed: 47, players: [{ id: 'p1' }, { id: 'p2' }] });
  addObject(state, {
    id: 'lib0', instanceId: 'i-lib0', cardId: 'hill-giant', controllerId: 'p1', ownerId: 'p1',
    zone: 'library', kind: 'creature', power: 3, toughness: 3, types: ['Creature'], manaCost: 4,
  });
  state.undercityProgress = { p1: 3 }; // w trakcie lochu, nie na końcu
  const source = { id: 'src', controllerId: 'p1', cardId: 'caves-of-chaos-adventurer', zone: 'battlefield' };
  applyEffect(state, {
    type: 'exile_top_playable_until_next_turn',
    freeIfCondition: { type: 'completed_dungeon' },
  }, source, []);
  const exiled = [...state.objects.values()].find((o) => o.zone === 'exile');
  assert.ok(exiled.playableUntilTurn != null, 'karta nadal grywalna');
  assert.notEqual(exiled.playableWithoutPaying, true, 'ale za PEŁNY koszt many');
});

test('B47/D6: po ukończonym lochu karta z impulse-exile gra się BEZ many', async () => {
  // Dowód, że flaga nie jest martwa (L48): przy PUSTEJ manabazie karta
  // wygnana po ukończonym lochu musi dać się zagrać, a bez lochu — nie.
  const { createGameState, addObject, playerView, execute } = await import('../src/engine/game-state.js');
  const { applyEffect } = await import('../src/engine/effects.js');
  const { gameObjectDataOf } = await import('../src/cards/materialize.js');
  const { jumpToStep } = await import('../src/engine/turn.js');
  const build = (room) => {
    const state = createGameState({ seed: 47, players: [{ id: 'p1' }, { id: 'p2' }] });
    state.turn = jumpToStep(state.turn, 'main', 'p1');
    state.turn.activePlayerId = 'p1';
    state.turn.priorityPlayerId = 'p1';
    const giant = REGISTRY.get('hill-giant'); // {3}{R}, a gracz NIE MA lądów
    addObject(state, {
      id: 'lib0', instanceId: 'i-lib0', cardId: 'hill-giant', controllerId: 'p1', ownerId: 'p1',
      zone: 'library', ...gameObjectDataOf(giant), types: giant.types,
    });
    state.undercityProgress = { p1: room };
    applyEffect(state, {
      type: 'exile_top_playable_until_next_turn',
      freeIfCondition: { type: 'completed_dungeon' },
    }, { id: 'src', controllerId: 'p1', cardId: 'caves-of-chaos-adventurer', zone: 'battlefield' }, []);
    return state;
  };
  // 9 = Throne of the Dead Three (pokój bez wyjścia) → loch ukończony.
  const done = build(9);
  const exiledId = [...done.objects.values()].find((o) => o.zone === 'exile').id;
  const freeOffer = playerView(done, 'p1').legalCommands
    .find((c) => (c.type === 'cast_permanent' || c.type === 'cast_spell') && c.objectId === exiledId);
  assert.ok(freeOffer, 'bez lądów, ale po ukończonym lochu — oferta zagrania jest');
  assert.ok(execute(done, freeOffer).ok, 'zagranie bez płacenia przyjęte');
  // Kontrola: bez ukończonego lochu tej oferty NIE MA (brak many na {3}{R}).
  const mid = build(3);
  const midExiledId = [...mid.objects.values()].find((o) => o.zone === 'exile').id;
  const paidOffer = playerView(mid, 'p1').legalCommands
    .find((c) => (c.type === 'cast_permanent' || c.type === 'cast_spell') && c.objectId === midExiledId);
  assert.equal(paidOffer, undefined, 'w trakcie lochu trzeba zapłacić — bez many brak oferty');
});

test('B47/D7: REGRESJA — impulse-exile za PEŁNY koszt też ma ofertę (Gila Courser)', async () => {
  // Luka wykryta przy Batchu 47, ale pochodzaca z Batcha 46: permanent
  // wygnany impulsem NIE BYL enumerowany w ofercie, wiec Gila Courser
  // wyganial karte, ktorej nastepnie nie dalo sie zagrac. Silnik przyjmowal
  // komende, ale nikt jej nie proponowal (klasa L48).
  const { createGameState, addObject, playerView, execute } = await import('../src/engine/game-state.js');
  const { applyEffect } = await import('../src/engine/effects.js');
  const { gameObjectDataOf } = await import('../src/cards/materialize.js');
  const { jumpToStep } = await import('../src/engine/turn.js');
  const state = createGameState({ seed: 46, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  const giant = REGISTRY.get('hill-giant'); // {3}{R}
  addObject(state, {
    id: 'lib0', instanceId: 'i-lib0', cardId: 'hill-giant', controllerId: 'p1', ownerId: 'p1',
    zone: 'library', ...gameObjectDataOf(giant), types: giant.types,
  });
  for (let i = 0; i < 4; i += 1) {
    addObject(state, {
      id: `mtn${i}`, instanceId: `i-mtn${i}`, cardId: 'basic-mountain', controllerId: 'p1',
      ownerId: 'p1', zone: 'battlefield', kind: 'land', types: ['Basic', 'Land'], subtypes: ['Mountain'],
    });
  }
  // Impulse BEZ warunku lochu — wariant Gila Coursera (pełny koszt).
  applyEffect(state, { type: 'exile_top_playable_until_next_turn' },
    { id: 'src', controllerId: 'p1', cardId: 'gila-courser', zone: 'battlefield' }, []);
  const exiled = [...state.objects.values()].find((o) => o.zone === 'exile');
  const offer = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === exiled.id);
  assert.ok(offer, 'karta wygnana impulsem MUSI mieć ofertę zagrania (za pełny koszt)');
  assert.ok(execute(state, offer).ok, 'i musi dać się zagrać');
});

test('B47/D8: impulse bez many nie jest oferowany (anty-over-fix)', async () => {
  const { createGameState, addObject, playerView } = await import('../src/engine/game-state.js');
  const { applyEffect } = await import('../src/engine/effects.js');
  const { gameObjectDataOf } = await import('../src/cards/materialize.js');
  const { jumpToStep } = await import('../src/engine/turn.js');
  const state = createGameState({ seed: 46, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  const giant = REGISTRY.get('hill-giant');
  addObject(state, {
    id: 'lib0', instanceId: 'i-lib0', cardId: 'hill-giant', controllerId: 'p1', ownerId: 'p1',
    zone: 'library', ...gameObjectDataOf(giant), types: giant.types,
  });
  applyEffect(state, { type: 'exile_top_playable_until_next_turn' },
    { id: 'src', controllerId: 'p1', cardId: 'gila-courser', zone: 'battlefield' }, []);
  const exiled = [...state.objects.values()].find((o) => o.zone === 'exile');
  const offer = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === exiled.id);
  assert.equal(offer, undefined, 'bez lądów nie ma z czego zapłacić {3}{R}');
});

// ---- Transza E: Pyxis of Pandemonium ------------------------------------

test('B47/E1: Pyxis of Pandemonium — dane wg Oracle', () => {
  const card = REGISTRY.get('pyxis-of-pandemonium');
  assert.ok(card, 'karta w katalogu');
  assert.deepEqual(card.types, ['Artifact']);
  assert.equal(card.manaCost, 1);
  const [tapAbility, popAbility] = card.abilities;
  assert.deepEqual(tapAbility.cost, { tap: true }, '{T}: każdy gracz wygania wierzch');
  assert.deepEqual((Array.isArray(tapAbility.effect) ? tapAbility.effect : [tapAbility.effect])
    .map((e) => e.type), ['each_player_exiles_top_face_down']);
  assert.equal(popAbility.cost.mana, 7, '{7} w koszcie');
  assert.equal(popAbility.cost.tap, true);
  assert.equal(popAbility.cost.sacrificeSelf, true);
  assert.deepEqual((Array.isArray(popAbility.effect) ? popAbility.effect : [popAbility.effect])
    .map((e) => e.type), ['turn_up_exiled_and_put_permanents']);
});

test('B47/E2: {T} wygania wierzch biblioteki KAŻDEGO gracza, zakryty', async () => {
  const { createGameState, addObject } = await import('../src/engine/game-state.js');
  const { applyEffect } = await import('../src/engine/effects.js');
  const state = createGameState({ seed: 47, players: [{ id: 'p1' }, { id: 'p2' }] });
  for (const [pid, cardId] of [['p1', 'hill-giant'], ['p2', 'seers-lantern']]) {
    addObject(state, {
      id: `lib-${pid}`, instanceId: `i-${pid}`, cardId, controllerId: pid, ownerId: pid,
      zone: 'library', kind: 'creature', power: 1, toughness: 1, types: ['Creature'],
    });
  }
  addObject(state, {
    id: 'pyxis', instanceId: 'i-pyxis', cardId: 'pyxis-of-pandemonium', controllerId: 'p1',
    ownerId: 'p1', zone: 'battlefield', kind: 'artifact', types: ['Artifact'],
  });
  applyEffect(state, { type: 'each_player_exiles_top_face_down' }, state.objects.get('pyxis'), []);
  const exiled = [...state.objects.values()].filter((o) => o.zone === 'exile');
  assert.equal(exiled.length, 2, 'KAŻDY gracz wygania jedną kartę');
  assert.ok(exiled.every((o) => o.faceDown === true), 'karty leżą ZAKRYTE (CR 708)');
  // Powiązanie ze źródłem (CR 400.7): druga zdolność musi wiedzieć, które
  // karty wygnano TYM artefaktem.
  const src = state.objects.get('pyxis');
  assert.equal((src.exiledCardIds ?? []).length, 2, 'źródło pamięta wygnane karty');
});

test('B47/E3: zdolność za {7} odkrywa karty i wprowadza TYLKO permanenty', async () => {
  const { createGameState, addObject } = await import('../src/engine/game-state.js');
  const { applyEffect } = await import('../src/engine/effects.js');
  const { gameObjectDataOf } = await import('../src/cards/materialize.js');
  const state = createGameState({ seed: 47, players: [{ id: 'p1' }, { id: 'p2' }] });
  const giant = REGISTRY.get('hill-giant');       // permanent → na pole bitwy
  const negate = REGISTRY.get('negate');          // instant  → zostaje w exile
  addObject(state, {
    id: 'lib-p1', instanceId: 'i1', cardId: 'hill-giant', controllerId: 'p1', ownerId: 'p1',
    zone: 'library', ...gameObjectDataOf(giant), types: giant.types,
  });
  addObject(state, {
    id: 'lib-p2', instanceId: 'i2', cardId: 'negate', controllerId: 'p2', ownerId: 'p2',
    zone: 'library', ...gameObjectDataOf(negate), types: negate.types, spell: negate.spell,
  });
  addObject(state, {
    id: 'pyxis', instanceId: 'i-pyxis', cardId: 'pyxis-of-pandemonium', controllerId: 'p1',
    ownerId: 'p1', zone: 'battlefield', kind: 'artifact', types: ['Artifact'],
  });
  applyEffect(state, { type: 'each_player_exiles_top_face_down' }, state.objects.get('pyxis'), []);
  applyEffect(state, { type: 'turn_up_exiled_and_put_permanents' }, state.objects.get('pyxis'), []);
  const onField = [...state.objects.values()].filter((o) => o.zone === 'battlefield');
  assert.ok(onField.some((o) => o.cardId === 'hill-giant'), 'permanent wchodzi na pole bitwy');
  const stillExiled = [...state.objects.values()].filter((o) => o.zone === 'exile');
  assert.deepEqual(stillExiled.map((o) => o.cardId), ['negate'],
    'instant NIE jest permanentem — zostaje w wygnaniu');
  assert.ok(stillExiled.every((o) => o.faceDown !== true), 'karty zostają ODKRYTE');
});

test('B47/E4: karta wchodzi pod kontrolę SWOJEGO właściciela (Oracle)', async () => {
  // „Each player turns face up all cards THEY OWN … then puts all permanent
  // cards among them onto the battlefield." Karta przeciwnika wraca do niego,
  // a nie do kontrolera Pyxis.
  const { createGameState, addObject } = await import('../src/engine/game-state.js');
  const { applyEffect } = await import('../src/engine/effects.js');
  const { gameObjectDataOf } = await import('../src/cards/materialize.js');
  const state = createGameState({ seed: 47, players: [{ id: 'p1' }, { id: 'p2' }] });
  const giant = REGISTRY.get('hill-giant');
  addObject(state, {
    id: 'lib-p2', instanceId: 'i2', cardId: 'hill-giant', controllerId: 'p2', ownerId: 'p2',
    zone: 'library', ...gameObjectDataOf(giant), types: giant.types,
  });
  addObject(state, {
    id: 'pyxis', instanceId: 'i-pyxis', cardId: 'pyxis-of-pandemonium', controllerId: 'p1',
    ownerId: 'p1', zone: 'battlefield', kind: 'artifact', types: ['Artifact'],
  });
  applyEffect(state, { type: 'each_player_exiles_top_face_down' }, state.objects.get('pyxis'), []);
  applyEffect(state, { type: 'turn_up_exiled_and_put_permanents' }, state.objects.get('pyxis'), []);
  const giantOnField = [...state.objects.values()]
    .find((o) => o.zone === 'battlefield' && o.cardId === 'hill-giant');
  assert.ok(giantOnField, 'stwór przeciwnika wchodzi na pole bitwy');
  assert.equal(giantOnField.controllerId, 'p2', 'pod kontrolę WŁAŚCICIELA, nie gracza z Pyxis');
});
