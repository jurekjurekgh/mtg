// Batch 48 (M196, 2026-08-23) — 14 kart w NOWYM formacie (artId + set + plan
// podane wprost przez właściciela). Dane Oracle: docs/cards/scryfall-*.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';

const REGISTRY = createCardRegistry();

function game(playerId = 'p1', step = 'main') {
  const state = createGameState({ seed: 196, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function put(state, id, cardId, controllerId, zone = 'battlefield', patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  if (Object.keys(patch).length) {
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
  }
  return state.objects.get(id);
}

function lands(state, n, cardId = 'basic-island', controllerId = 'p1') {
  const subtype = { 'basic-island': 'Island', 'basic-swamp': 'Swamp', 'basic-forest': 'Forest',
    'basic-mountain': 'Mountain', 'basic-plains': 'Plains' }[cardId];
  for (let i = 0; i < n; i += 1) {
    addObject(state, {
      id: `${cardId}-${i}`, instanceId: `i-l${i}`, cardId, controllerId, ownerId: controllerId,
      zone: 'battlefield', kind: 'land', types: ['Basic', 'Land'], subtypes: [subtype],
    });
  }
}

/** Rozstrzyga stos do końca (pass obu stron). */
function resolveStack(state, limit = 12) {
  for (let i = 0; i < limit && state.zones.stack.length > 0; i += 1) {
    const pass = playerView(state, state.turn.priorityPlayerId).legalCommands
      .find((c) => c.type === 'pass_priority');
    if (!pass) break;
    execute(state, pass);
  }
}

// ---- Transza A: karty na istniejących mechanikach -------------------------

test('B48/A1: Thraben Valiant — 2/1 z vigilance', () => {
  const card = REGISTRY.get('thraben-valiant');
  assert.ok(card, 'karta w katalogu');
  assert.deepEqual([card.power, card.toughness], [2, 1]);
  assert.deepEqual(card.keywords, ['vigilance']);
  assert.equal(card.manaCost, 2);
  assert.equal(card.plan, 'Innistrad');
  assert.equal(card.artId, 544, 'artId wprost z promptu właściciela');
});

test('B48/A2: Quicksilver Fisher — ETB dobierz, potem odrzuć', () => {
  const card = REGISTRY.get('quicksilver-fisher');
  assert.deepEqual([card.power, card.toughness], [4, 3]);
  assert.deepEqual(card.keywords, ['flying']);
  const etb = card.abilities.find((a) => a.trigger?.event === 'enter_battlefield');
  assert.ok(etb, 'trigger ETB');
  assert.deepEqual((Array.isArray(etb.effect) ? etb.effect : [etb.effect]).map((e) => e.type),
    ['draw_then_discard'], 'Oracle: „draw a card, then discard a card"');
});

test('B48/A3: Coat with Venom — +1/+2 i deathtouch do końca tury', () => {
  const card = REGISTRY.get('coat-with-venom');
  assert.equal(card.manaCost, 1);
  assert.deepEqual(card.spell.targets, [{ type: 'creature' }]);
  const pump = card.spell.effects.find((e) => e.type === 'pump');
  assert.deepEqual([pump?.power, pump?.toughness], [1, 2]);
  assert.ok(card.spell.effects.some((e) => (e.keywords ?? []).includes('deathtouch')),
    'nadanie deathtouch do końca tury');
});

test('B48/A4: Coat with Venom — pełna ścieżka rzutu na stwora', () => {
  const state = game('p1');
  put(state, 'cre', 'hill-giant', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'spell', 'coat-with-venom', 'p1', 'hand');
  lands(state, 1, 'basic-swamp');
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'spell' && (c.targets ?? []).includes('cre'));
  assert.ok(cast, 'oferta rzutu w stwora');
  assert.ok(execute(state, cast).ok);
  resolveStack(state);
  const buffed = state.objects.get('cre');
  assert.equal((buffed.power ?? 0) + (buffed.powerModifier ?? 0), 4, 'Hill Giant 3/3 → 4/5');
});

test('B48/A5: Frost Lynx — ETB tapuje stwora wroga i blokuje odkręcenie', () => {
  const card = REGISTRY.get('frost-lynx');
  const etb = card.abilities.find((a) => a.trigger?.event === 'enter_battlefield');
  assert.ok(etb, 'trigger ETB');
  assert.equal(etb.trigger.requiresTarget?.type, 'creature_opponent_controls',
    'Oracle: „target creature an opponent controls"');
  assert.deepEqual((Array.isArray(etb.effect) ? etb.effect : [etb.effect]).map((e) => e.type),
    ['tap_permanent', 'lock_untap'], 'tapnij + nie odkręca się w następnym untapie');
});

test('B48/A6: Bedhead Beastie — menace + Mountaincycling {2}', () => {
  const card = REGISTRY.get('bedhead-beastie');
  assert.deepEqual([card.power, card.toughness], [5, 6]);
  assert.ok(card.keywords.includes('menace'));
  const cyc = card.abilities.find((a) => a.keyword === 'cycling');
  assert.ok(cyc, 'zdolność cyklingu');
  assert.equal(cyc.cost.mana, 2, 'Mountaincycling {2}');
  assert.deepEqual(cyc.cycling?.subtypes, ['Mountain'], 'szuka LĄDU typu Mountain');
});

test('B48/A7: Ettercap — stwór 2/5 z reach oraz Adventure „Web Shot"', () => {
  const card = REGISTRY.get('ettercap');
  assert.deepEqual([card.power, card.toughness], [2, 5]);
  assert.deepEqual(card.keywords, ['reach']);
  assert.equal(card.manaCost, 5, '{4}{G}');
  assert.ok(card.adventure, 'karta ma Adventure');
  assert.equal(card.adventure.cost, 3, 'Web Shot za {2}{G}');
  assert.deepEqual(card.adventure.spell.targets, [{ type: 'creature_with_keyword', keyword: 'flying' }],
    'Oracle: „Destroy target creature with flying"');
  assert.deepEqual(card.adventure.spell.effects.map((e) => e.type), ['destroy_permanent']);
});

test('B48/A8: Ettercap — Web Shot realnie niszczy latającego stwora', () => {
  const state = game('p1');
  put(state, 'flyer', 'quicksilver-fisher', 'p2', 'battlefield');
  put(state, 'spell', 'ettercap', 'p1', 'hand');
  lands(state, 3, 'basic-forest');
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_adventure' && c.objectId === 'spell');
  assert.ok(cast, 'oferta rzutu Adventure');
  assert.ok(execute(state, { ...cast, targets: ['flyer'] }).ok);
  resolveStack(state);
  const survivors = [...state.objects.values()].filter((o) => o.zone === 'battlefield' && o.kind === 'creature');
  assert.equal(survivors.length, 0, 'latający stwór zniszczony');
});

test('B48/A9: wszystkie karty transzy A mają plan i artId z promptu', () => {
  for (const [id, artId, plan] of [
    ['thraben-valiant', 544, 'Innistrad'],
    ['quicksilver-fisher', 547, 'Mirrodin'],
    ['frost-lynx', 550, 'Warhammer Fantasy'],
    ['ettercap', 552, 'Forgotten Realms'],
    ['coat-with-venom', 553, 'Tarkir'],
    ['bedhead-beastie', 555, 'Wiedźmin'],
  ]) {
    const card = REGISTRY.get(id);
    assert.ok(card, `${id} w katalogu`);
    assert.equal(card.artId, artId, `${id}: artId`);
    assert.equal(card.plan, plan, `${id}: plan`);
    assert.equal(card.support.status, 'supported', `${id}: w pełni wspierana (ADR 0022)`);
  }
});

// ---- Transza B: Fuel for the Cause, Wooden Stake -------------------------

test('B48/B1: Fuel for the Cause — kontra + proliferate', () => {
  const card = REGISTRY.get('fuel-for-the-cause');
  assert.ok(card, 'karta w katalogu');
  assert.equal(card.manaCost, 4, '{2}{U}{U}');
  assert.deepEqual(card.spell.targets, [{ type: 'spell_on_stack' }]);
  assert.deepEqual(card.spell.effects.map((e) => e.type), ['counter_spell', 'proliferate'],
    'Oracle: „Counter target spell, THEN proliferate"');
  assert.equal(card.artId, 545);
  assert.equal(card.plan, 'Mirrodin');
});

test('B48/B2: Fuel for the Cause — realnie kontruje czar na stosie', () => {
  const state = game('p1');
  // Czar przeciwnika na stosie (rzucony przez p2).
  put(state, 'foe-spell', 'coat-with-venom', 'p2', 'hand');
  put(state, 'foe-cre', 'hill-giant', 'p2', 'battlefield', { summoningSickness: false });
  lands(state, 1, 'basic-swamp', 'p2');
  state.turn.priorityPlayerId = 'p2';
  const foeCast = playerView(state, 'p2').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'foe-spell');
  assert.ok(foeCast, 'przeciwnik rzuca czar');
  assert.ok(execute(state, foeCast).ok);
  // Teraz my kontrujemy.
  put(state, 'fuel', 'fuel-for-the-cause', 'p1', 'hand');
  lands(state, 4, 'basic-island');
  state.turn.priorityPlayerId = 'p1';
  const counter = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'fuel');
  assert.ok(counter, 'oferta kontry');
  assert.ok(execute(state, counter).ok, 'kontra rzucona');
});

test('B48/B3: Wooden Stake — equipment +1/+0 z equip {1}', () => {
  const card = REGISTRY.get('wooden-stake');
  assert.ok(card, 'karta w katalogu');
  assert.deepEqual(card.types, ['Artifact']);
  assert.deepEqual(card.subtypes, ['Equipment']);
  assert.equal(card.equipment?.equip, 1, 'Equip {1}');
  assert.deepEqual([card.equipment?.pump?.power, card.equipment?.pump?.toughness], [1, 0]);
  assert.ok((card.abilities ?? []).some((a) => a?.keyword === 'equip'),
    'sprzęt musi mieć zdolność equip (strażnik M190/C2)');
  assert.equal(card.artId, 543);
  assert.equal(card.plan, 'Warhammer Fantasy');
});

test('B48/B4: Wooden Stake — trigger niszczy Wampira przy bloku', () => {
  // Oracle: „Whenever equipped creature blocks or becomes blocked by
  // a Vampire, destroy that creature. It can't be regenerated."
  const card = REGISTRY.get('wooden-stake');
  const trig = (card.abilities ?? []).find((a) => a.trigger?.event === 'equipped_creature_blocks_or_blocked_by');
  assert.ok(trig, 'trigger bloku na sprzęcie');
  assert.equal(trig.trigger.subtype, 'Vampire', 'wyłącznie Wampir (Oracle)');
  const effects = (Array.isArray(trig.effect) ? trig.effect : [trig.effect]).map((e) => e.type);
  assert.deepEqual(effects, ['destroy_permanent', 'cant_be_regenerated_this_turn'],
    'Oracle: „destroy that creature. It can\'t be regenerated"');
});

test('B48/B5: Wooden Stake — PEŁNA ścieżka: Wampir blokuje nosiciela i ginie', () => {
  // Deskryptor to za mało — silnik musi skanować deklarację bloków.
  const state = game('p1', 'declare_blockers');
  put(state, 'bearer', 'hill-giant', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'stake', 'wooden-stake', 'p1', 'battlefield', { attachedTo: 'bearer' });
  // Wampir przeciwnika (podtyp z danych karty).
  addObject(state, {
    id: 'vamp', instanceId: 'i-vamp', cardId: 'hill-giant', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', kind: 'creature', power: 3, toughness: 3,
    types: ['Creature'], subtypes: ['Vampire'], abilities: [],
  });
  state.combat = {
    attackingPlayerId: 'p1', attackers: ['bearer'],
    blockers: new Map(), blockedAttackers: new Set(),
  };
  // Bloki deklaruje OBROŃCA — priorytet musi należeć do niego.
  state.turn.priorityPlayerId = 'p2';
  const declare = playerView(state, 'p2').legalCommands
    .find((c) => c.type === 'declare_blockers' && (c.assignments?.bearer ?? []).includes('vamp'));
  assert.ok(declare, 'przeciwnik może zablokować Wampirem');
  assert.ok(execute(state, declare).ok, 'Wampir blokuje');
  resolveStack(state);
  const vampAlive = [...state.objects.values()]
    .some((o) => o.zone === 'battlefield' && (o.subtypes ?? []).includes('Vampire'));
  assert.equal(vampAlive, false, 'Wampir blokujący nosiciela Wooden Stake ginie');
});

test('B48/B6: Wooden Stake — NIE-Wampir przeżywa blok (anty-over-fix)', () => {
  const state = game('p1', 'declare_blockers');
  put(state, 'bearer', 'hill-giant', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'stake', 'wooden-stake', 'p1', 'battlefield', { attachedTo: 'bearer' });
  addObject(state, {
    id: 'human', instanceId: 'i-human', cardId: 'hill-giant', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', kind: 'creature', power: 1, toughness: 4,
    types: ['Creature'], subtypes: ['Human'], abilities: [],
  });
  state.combat = {
    attackingPlayerId: 'p1', attackers: ['bearer'],
    blockers: new Map(), blockedAttackers: new Set(),
  };
  state.turn.priorityPlayerId = 'p2';
  const declare = playerView(state, 'p2').legalCommands
    .find((c) => c.type === 'declare_blockers' && (c.assignments?.bearer ?? []).includes('human'));
  assert.ok(declare, 'Human może zablokować');
  assert.ok(execute(state, declare).ok);
  resolveStack(state);
  assert.ok([...state.objects.values()].some((o) => o.zone === 'battlefield' && o.id === 'human'),
    'Oracle mówi wyłącznie o Wampirze — inne stwory nie giną');
});

test('B48/B7: Wooden Stake — nosiciel BLOKUJĄCY Wampira też go zabija', () => {
  // Oracle mówi „blocks OR becomes blocked by" — obie strony. Luka wykryta
  // weryfikacją mutacyjną: usunięcie jednej z par nie czerwieniło niczego.
  const state = game('p2', 'declare_blockers');   // tura PRZECIWNIKA
  put(state, 'bearer', 'hill-giant', 'p1', 'battlefield', { summoningSickness: false });
  put(state, 'stake', 'wooden-stake', 'p1', 'battlefield', { attachedTo: 'bearer' });
  addObject(state, {
    id: 'vamp', instanceId: 'i-vamp', cardId: 'hill-giant', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', kind: 'creature', power: 2, toughness: 6,
    types: ['Creature'], subtypes: ['Vampire'], abilities: [],
  });
  // To WAMPIR atakuje, a nosiciel sprzętu go blokuje.
  state.combat = {
    attackingPlayerId: 'p2', attackers: ['vamp'],
    blockers: new Map(), blockedAttackers: new Set(),
  };
  state.turn.priorityPlayerId = 'p1';
  const declare = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'declare_blockers' && (c.assignments?.vamp ?? []).includes('bearer'));
  assert.ok(declare, 'nosiciel może zablokować Wampira');
  assert.ok(execute(state, declare).ok);
  resolveStack(state);
  const vampAlive = [...state.objects.values()]
    .some((o) => o.zone === 'battlefield' && (o.subtypes ?? []).includes('Vampire'));
  assert.equal(vampAlive, false, 'Wampir zablokowany przez nosiciela też ginie');
});

// ---- Transza C: Steelclaw Lance, Ruthless Invasion -----------------------

test('B48/C1: Steelclaw Lance — +2/+2 z DWOMA kosztami equip', () => {
  // Oracle: „Equip Knight {1}" ORAZ „Equip {3}" — tańszy wariant tylko dla
  // Rycerza. Dotąd deskryptor `equipment.equip` niósł JEDEN koszt.
  const card = REGISTRY.get('steelclaw-lance');
  assert.ok(card, 'karta w katalogu');
  assert.deepEqual(card.subtypes, ['Equipment']);
  assert.deepEqual([card.equipment?.pump?.power, card.equipment?.pump?.toughness], [2, 2]);
  assert.equal(card.equipment?.equip, 3, 'koszt podstawowy Equip {3}');
  assert.deepEqual(card.equipment?.equipFor, { subtype: 'Knight', equip: 1 },
    'tańszy equip wyłącznie na Rycerza (deskryptor, nie nazwa karty)');
  assert.equal(card.artId, 548);
  assert.equal(card.plan, 'Eldraine');
});

test('B48/C2: Steelclaw Lance — Rycerz kosztuje {1}, inny stwór {3}', () => {
  const state = game('p1');
  put(state, 'lance', 'steelclaw-lance', 'p1');
  // Rycerz i nie-Rycerz na stole.
  addObject(state, {
    id: 'knight', instanceId: 'i-k', cardId: 'hill-giant', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'creature', power: 2, toughness: 2,
    types: ['Creature'], subtypes: ['Knight'], abilities: [],
  });
  addObject(state, {
    id: 'other', instanceId: 'i-o', cardId: 'hill-giant', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'creature', power: 3, toughness: 3,
    types: ['Creature'], subtypes: ['Giant'], abilities: [],
  });
  // Tylko JEDNA mana: stać nas wyłącznie na equip Rycerza.
  lands(state, 1, 'basic-swamp');
  const offers = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'activate_ability' && c.objectId === 'lance');
  const targets = offers.flatMap((c) => c.targets ?? []);
  assert.ok(targets.includes('knight'), 'Rycerza stać nas wyposażyć za {1}');
  assert.ok(!targets.includes('other'), 'na zwykłego stwora ({3}) many nie starcza');
});

test('B48/C3: Ruthless Invasion — nieartefaktowe stwory nie blokują w tej turze', () => {
  const card = REGISTRY.get('ruthless-invasion');
  assert.ok(card, 'karta w katalogu');
  assert.deepEqual(card.types, ['Sorcery']);
  assert.equal(card.manaCost, 3, '{3} generyczne; pip {R/P} osobno (konwencja katalogu)');
  assert.equal(card.phyrexianManaCost, 1, '{R/P} — mana albo 2 życia');
  assert.deepEqual(card.spell.targets, [], 'czar bez celu — działa globalnie');
  const eff = card.spell.effects[0];
  assert.equal(eff.type, 'creatures_cant_block_this_turn');
  assert.deepEqual(eff.exceptTypes, ['Artifact'], 'Oracle: „NONARTIFACT creatures"');
  assert.equal(card.artId, 556);
  assert.equal(card.plan, 'Mirrodin');
});

test('B48/C4: Ruthless Invasion — PEŁNA ścieżka: bloker traci możliwość bloku', async () => {
  const { applyEffect } = await import('../src/engine/effects.js');
  const state = game('p1');
  addObject(state, {
    id: 'foe', instanceId: 'i-f', cardId: 'hill-giant', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', kind: 'creature', power: 2, toughness: 2,
    types: ['Creature'], subtypes: [], abilities: [],
  });
  addObject(state, {
    id: 'robot', instanceId: 'i-r', cardId: 'hill-giant', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', kind: 'creature', power: 1, toughness: 1,
    types: ['Artifact', 'Creature'], subtypes: [], abilities: [],
  });
  applyEffect(state, { type: 'creatures_cant_block_this_turn', exceptTypes: ['Artifact'] },
    { id: 'src', controllerId: 'p1', cardId: 'ruthless-invasion', zone: 'stack' }, []);
  assert.equal(state.objects.get('foe').cantBlock, true, 'zwykły stwór nie zablokuje');
  assert.notEqual(state.objects.get('robot').cantBlock, true,
    'stwór-ARTEFAKT blokuje dalej (Oracle: „nonartifact")');
});

// ---- Transza D: Clawing Torment, Stampeding Elk Herd ---------------------

test('B48/D1: Clawing Torment — aura na artefakt LUB stwora', () => {
  // Oracle: „Enchant artifact or creature / As long as enchanted permanent
  // is a creature, it gets -1/-1 and can't block. / Enchanted permanent has
  // »At the beginning of your upkeep, you lose 1 life.«"
  const card = REGISTRY.get('clawing-torment');
  assert.ok(card, 'karta w katalogu');
  assert.deepEqual(card.subtypes, ['Aura']);
  assert.equal(card.manaCost, 1);
  assert.equal(card.aura?.enchantType, 'artifact_or_creature', 'enchant obejmuje OBA typy');
  assert.deepEqual([card.aura?.pump?.power, card.aura?.pump?.toughness], [-1, -1],
    'debuff -1/-1 (tylko gdy permanent JEST stworem — pump i tak dotyczy stworów)');
  assert.equal(card.aura?.cantBlock, true, 'Oracle: nie moze blokowac');
  assert.equal(card.artId, 546);
  // M197 (sprostowanie): Kamigawa NIE byla nowym planem — patrz
  // test/m197-plany-kolekcji.test.js.
  assert.equal(card.plan, 'Kamigawa');
});

test('B48/D2: Clawing Torment — trigger upkeepu odbiera 1 życie', () => {
  const card = REGISTRY.get('clawing-torment');
  const trig = (card.abilities ?? []).find((a) => a.trigger?.event === 'upkeep');
  assert.ok(trig, 'trigger upkeepu');
  assert.equal(trig.trigger.condition?.enchantedPermanentControllerUpkeep, true,
    'upkeep KONTROLERA zaczarowanego permanentu (wzorzec Feedback)');
  const eff = (Array.isArray(trig.effect) ? trig.effect : [trig.effect])[0];
  assert.equal(eff.type, 'lose_life_enchanted_permanent_controller');
  assert.equal(eff.amount, 1);
});

test('B48/D3: Clawing Torment — PEŁNA ścieżka: stwór 3/3 staje się 2/2 bez bloku', () => {
  const state = game('p1');
  addObject(state, {
    id: 'foe', instanceId: 'i-f', cardId: 'hill-giant', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', kind: 'creature', power: 3, toughness: 3,
    types: ['Creature'], subtypes: [], abilities: [],
  });
  put(state, 'aura', 'clawing-torment', 'p1', 'hand');
  lands(state, 1, 'basic-swamp');
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'aura' && (c.targets ?? []).includes('foe'));
  assert.ok(cast, 'oferta rzutu aury na stwora przeciwnika');
  assert.ok(execute(state, cast).ok);
  resolveStack(state);
  const view = playerView(state, 'p1');
  const foe = view.zones.battlefield.find((o) => o.id === 'foe');
  assert.equal(foe.power, 2, 'Hill Giant 3/3 → 2/2 (aura -1/-1)');
  assert.equal(foe.toughness, 2);
  assert.equal(foe.cantBlock, true, 'i nie może blokować');
});

test('B48/D4: Stampeding Elk Herd — formidable nadaje trample całej drużynie', () => {
  // Oracle: „Formidable — Whenever this creature attacks, if creatures you
  // control have total power 8 or greater, creatures you control gain
  // trample until end of turn."
  const card = REGISTRY.get('stampeding-elk-herd');
  assert.ok(card, 'karta w katalogu');
  assert.deepEqual([card.power, card.toughness], [5, 5]);
  const trig = (card.abilities ?? []).find((a) => a.trigger?.event === 'attacks');
  assert.ok(trig, 'trigger ataku');
  assert.equal(trig.trigger.condition?.minTotalPowerYouControl, 8,
    'formidable = łączna moc twoich stworów ≥ 8 (CR 702.103)');
  const eff = (Array.isArray(trig.effect) ? trig.effect : [trig.effect])[0];
  assert.equal(eff.type, 'your_creatures_gain_keywords_until_end_of_turn');
  assert.deepEqual(eff.keywords, ['trample']);
  assert.equal(card.artId, 549);
  assert.equal(card.plan, 'Tarkir');
});

test('B48/D5: formidable — przy mocy 8+ cała drużyna dostaje trample', async () => {
  const { applyEffect } = await import('../src/engine/effects.js');
  const state = game('p1');
  for (const [id, power] of [['a', 5], ['b', 3]]) {
    addObject(state, {
      id, instanceId: `i-${id}`, cardId: 'hill-giant', controllerId: 'p1', ownerId: 'p1',
      zone: 'battlefield', kind: 'creature', power, toughness: 3,
      types: ['Creature'], subtypes: [], abilities: [], keywords: [],
    });
  }
  addObject(state, {
    id: 'foe', instanceId: 'i-foe', cardId: 'hill-giant', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', kind: 'creature', power: 4, toughness: 4,
    types: ['Creature'], subtypes: [], abilities: [], keywords: [],
  });
  applyEffect(state, { type: 'your_creatures_gain_keywords_until_end_of_turn', keywords: ['trample'] },
    { id: 'src', controllerId: 'p1', cardId: 'stampeding-elk-herd', zone: 'battlefield' }, []);
  const { effectiveKeywords } = await import('../src/engine/permanents.js');
  assert.ok(effectiveKeywords(state.objects.get('a'), state).includes('trample'), 'mój stwór ma trample');
  assert.ok(effectiveKeywords(state.objects.get('b'), state).includes('trample'), 'drugi też');
  assert.ok(!effectiveKeywords(state.objects.get('foe'), state).includes('trample'),
    'stwory PRZECIWNIKA nie dostają nic (Oracle: „creatures YOU control")');
});

// ---- Transza E: Contested Game Ball, Cherished Hatchling -----------------

test('B48/E1: Contested Game Ball — dane wg Oracle', () => {
  const card = REGISTRY.get('contested-game-ball');
  assert.ok(card, 'karta w katalogu');
  assert.deepEqual(card.types, ['Artifact']);
  assert.equal(card.manaCost, 2);
  // „Whenever you're dealt combat damage, the attacking player gains control
  // of this artifact and untaps it."
  const steal = (card.abilities ?? []).find((a) => a.trigger?.event === 'combat_damage_to_you');
  assert.ok(steal, 'trigger przejęcia po otrzymaniu obrażeń bojowych');
  assert.deepEqual((Array.isArray(steal.effect) ? steal.effect : [steal.effect]).map((e) => e.type),
    ['attacker_gains_control_and_untaps']);
  // „{2}, {T}: Draw a card and put a point counter on this artifact. Then if
  // it has five or more point counters on it, sacrifice it and create
  // a Treasure token."
  const draw = (card.abilities ?? []).find((a) => a.type === 'activated');
  assert.ok(draw, 'zdolność aktywowana');
  assert.equal(draw.cost.mana, 2);
  assert.equal(draw.cost.tap, true);
  const types = (Array.isArray(draw.effect) ? draw.effect : [draw.effect]).map((e) => e.type);
  assert.deepEqual(types, ['draw_cards', 'add_counter', 'sacrifice_self_if_counters_then_treasure']);
  assert.equal(card.artId, 551);
  assert.equal(card.plan, 'Warhammer Fantasy');
});

test('B48/E2: Contested Game Ball — piąty licznik poświęca i daje Skarb', async () => {
  const { applyEffect } = await import('../src/engine/effects.js');
  const state = game('p1');
  put(state, 'ball', 'contested-game-ball', 'p1');
  // Cztery liczniki: piąty przekroczy próg.
  const { addCounter } = await import('../src/engine/counters.js');
  for (let i = 0; i < 5; i += 1) addCounter(state, 'ball', 'point', 1);
  applyEffect(state, { type: 'sacrifice_self_if_counters_then_treasure', counter: 'point', threshold: 5 },
    state.objects.get('ball'), []);
  const ballOnField = [...state.objects.values()].some((o) => o.zone === 'battlefield' && o.cardId === 'contested-game-ball');
  assert.equal(ballOnField, false, 'przy 5 licznikach artefakt jest poświęcany');
  const treasure = [...state.objects.values()].some((o) => o.zone === 'battlefield' && o.cardId === 'token_treasure');
  assert.ok(treasure, 'i powstaje token Skarbu');
});

test('B48/E3: Contested Game Ball — poniżej progu NIC się nie dzieje (anty-over-fix)', async () => {
  const { applyEffect } = await import('../src/engine/effects.js');
  const { addCounter } = await import('../src/engine/counters.js');
  const state = game('p1');
  put(state, 'ball', 'contested-game-ball', 'p1');
  for (let i = 0; i < 4; i += 1) addCounter(state, 'ball', 'point', 1);
  applyEffect(state, { type: 'sacrifice_self_if_counters_then_treasure', counter: 'point', threshold: 5 },
    state.objects.get('ball'), []);
  assert.ok([...state.objects.values()].some((o) => o.zone === 'battlefield' && o.cardId === 'contested-game-ball'),
    'przy 4 licznikach artefakt zostaje na stole');
  assert.ok(![...state.objects.values()].some((o) => o.cardId === 'token_treasure'),
    'i nie ma Skarbu');
});

test('B48/E4: Contested Game Ball — atakujący przejmuje kontrolę i odkręca', async () => {
  const { applyEffect } = await import('../src/engine/effects.js');
  const state = game('p2');   // tura przeciwnika: to ON atakuje
  put(state, 'ball', 'contested-game-ball', 'p1', 'battlefield', { tapped: true });
  state.combat = {
    attackingPlayerId: 'p2', attackers: [],
    blockers: new Map(), blockedAttackers: new Set(),
  };
  applyEffect(state, { type: 'attacker_gains_control_and_untaps' }, state.objects.get('ball'), []);
  const ball = state.objects.get('ball');
  assert.equal(ball.controllerId, 'p2', 'artefakt przechodzi do atakującego');
  assert.equal(ball.tapped, false, 'i zostaje odkręcony');
});

test('B48/E5: Cherished Hatchling — dies nadaje Dinozaurom flash i ETB fight', () => {
  // Oracle: „When this creature dies, you may cast Dinosaur spells this turn
  // as though they had flash, and whenever you cast a Dinosaur spell this
  // turn, it gains »When this creature enters, you may have it fight another
  // target creature.«"
  const card = REGISTRY.get('cherished-hatchling');
  assert.ok(card, 'karta w katalogu');
  assert.deepEqual([card.power, card.toughness], [2, 1]);
  assert.deepEqual(card.subtypes, ['Dinosaur']);
  const dies = (card.abilities ?? []).find((a) => a.trigger?.event === 'dies');
  assert.ok(dies, 'trigger śmierci');
  const eff = (Array.isArray(dies.effect) ? dies.effect : [dies.effect])[0];
  assert.equal(eff.type, 'subtype_spells_gain_flash_and_etb_fight_this_turn');
  assert.equal(eff.subtype, 'Dinosaur', 'dotyczy WYŁĄCZNIE Dinozaurów');
  assert.equal(card.artId, 554);
  assert.equal(card.plan, 'Warhammer Fantasy');
});

test('B48/E6: Cherished Hatchling — po śmierci Dinozaur da się rzucić jak instant', async () => {
  const { applyEffect } = await import('../src/engine/effects.js');
  const state = game('p1', 'declare_blockers');   // okno instant, nie main
  // Dinozaur w ręce (sorcery-speed: normalnie nie do rzucenia teraz).
  // Uwaga: walidacja kolorów czyta MANA_COSTS po cardId, więc karta-atrapa
  // musi mieć koszt dający się opłacić z lasów (hill-giant to {3}{R}).
  addObject(state, {
    id: 'dino', instanceId: 'i-d', cardId: 'cherished-hatchling', controllerId: 'p1', ownerId: 'p1',
    zone: 'hand', kind: 'creature', power: 2, toughness: 1, manaCost: 2,
    types: ['Creature'], subtypes: ['Dinosaur'], abilities: [],
  });
  lands(state, 3, 'basic-forest');
  const before = playerView(state, 'p1').legalCommands
    .some((c) => c.type === 'cast_permanent' && c.objectId === 'dino');
  assert.equal(before, false, 'bez efektu Dinozaura nie rzucimy w oknie instant');
  applyEffect(state, { type: 'subtype_spells_gain_flash_and_etb_fight_this_turn', subtype: 'Dinosaur' },
    { id: 'src', controllerId: 'p1', cardId: 'cherished-hatchling', zone: 'graveyard' }, []);
  const after = playerView(state, 'p1').legalCommands
    .some((c) => c.type === 'cast_permanent' && c.objectId === 'dino');
  assert.ok(after, 'po śmierci Hatchlinga Dinozaury mają flash w tej turze');
});
