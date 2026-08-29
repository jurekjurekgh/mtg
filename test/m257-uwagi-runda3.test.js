// M257 runda 3 — „Uwagi z testów” właściciela (2026-08-29), taliow Warhammer.
//
// A: Bot rzuca kartę z Morph — w logu i Rozgrywce FoW jest zachowane, ALE
//    warstwa wysoko-graficzna (FOT/KON/Scryfall przy rzucaniu) pokazywała
//    DOKŁADNIE co bot rzucił twarzą w dół. Właściciel: „Przy kartach
//    ukrytych rzucanych przez bota w ogóle ta warstwa nie powinna się
//    pokazywać.” Root cause: obserwator onCast dostawał cardId bez żadnej
//    informacji o twarzu — warstwa renderowała pełną definicję karty.
//    Fix: zdarzenie permanent_cast NIESIE faceDown (engine już je znosi,
//    resources.js), sesja przekazuje je w payloaddzie onCast, a warstwa
//    (main.js) dla faceDown w ogóle się nie otwiera (CR 708.2 — twarzą w
//    dół tożsamość jest ukryta przed OBU stronami).
//
// B: „Przygoda: Gray Slaad” (cast_adventure) w menu „Twoje działania”
//    pojawiało się NA SAMYM DOLE, pod pass/poddaniem. Root cause: sort
//    panelu wg ACTION_RANK[type] ?? 99, a mapa ranków nie znała
//    cast_adventure/cast_adventure_creature (ani cast_escape/cast_flashback
//    /turn_manifest_face_up) → 99 > pass(8)/concede(9). Fix: wszystkie
//    rzuty w ranku 5 (razem z czarami) + pass i poddanie Z ZASADY
//    ostatnie (actionMenuRank 1000/1001), więc żadna nowa komenda
//    (fallback 99) nie wypadnie poniżej „Poddaj partię”.
//
// C: Greatsword of Tyr — Oracle „Equip {W}”, a silnik akceptował JEDNĄ
//    DOWOLNĄ manę (właściciel zapłacił tapując Górę). Root cause (2 pola):
//    (1) deskryptor equipment w danych karty nie niosł `colors` (cały łań-
//    cuch L21: card-data → registry → identity); (2) OFERTA sprawdzała
//    pipy (canPayColoredCost), a PŁATNOŚĆ (activateEquip → spendMana) ich
//    ignorowała — rozjazd L48. Fix: `colors: ['W']` w deskryptorze +
//    koszcie zdolności, przepływ przez registry i identity, spendMana
//    z wymaganiami koloru, pipy na kaflu (equipLine) i w etykiecie wariantu
//    equipFor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

class MiniEl {
  constructor(tag) { this.tagName = tag; }
}
// render.js dotyka `document` tylko w funkcjach renderu — stub na import.
globalThis.document = globalThis.document ?? { createElement: (tag) => new MiniEl(tag) };

import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createGameState, execute, playerView, addObject } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { actionMenuRank } from '../src/table/render.js';
import { createSession, HUMAN_ID, BOT_ID } from '../src/table/session.js';
import { parseDeckText } from '../src/cards/deck-text.js';

const REGISTRY = createCardRegistry();

/** Stół: p1 (faza główna p1), p2 pusty. Bez many — każdy test karmi pulę. */
function game() {
  const state = createGameState({ seed: 9, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  return state;
}

function addHand(state, id, cardId, controllerId = 'p1') {
  const def = REGISTRY.get(cardId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId,
    zone: 'hand', ...gameObjectDataOf(def),
    types: def.types ?? [], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
  });
  return state.objects.get(id);
}

function addEquipmentOnBoard(state, id, cardId, controllerId = 'p1') {
  const def = REGISTRY.get(cardId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId,
    zone: 'battlefield', kind: 'artifact', ...gameObjectDataOf(def),
    types: def.types ?? ['Artifact'], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
    abilities: def.abilities ?? [],
  });
  return state.objects.get(id);
}

function addCreatureOnBoard(state, id, cardId, controllerId = 'p1') {
  const def = REGISTRY.get(cardId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId,
    zone: 'battlefield', kind: 'creature', ...gameObjectDataOf(def),
    types: def.types ?? ['Creature'], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
    abilities: def.abilities ?? [],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

/** Pula BEZBARWNA (jak w realnej grze po tapnięciu np. Góry) — `colors: []`. */
function addColorlessMana(state, playerId, amount) {
  addMana(state, playerId, amount, { colors: [] });
}

function addWhiteMana(state, playerId, amount) {
  addMana(state, playerId, amount, { colors: ['W'] });
}

// ---------------------------------------------------------------------------
// C — Greatsword of Tyr: „Equip {W}” (pita biała, nie dowolna)
// ---------------------------------------------------------------------------

test('M257C1: łańcuch L21 — deskryptor equipment niesie colors [W] na każdej warstwie', () => {
  const regDef = REGISTRY.get('greatsword-of-tyr');
  assert.deepEqual([...(regDef.equipment.colors ?? [])], ['W'], 'rejestru: pipy z Oracle „Equip {W}”');
  assert.equal(regDef.equipment.equip, 1, 'jednostek generycznych zero (koszt = {W}, nie {1}{W})');
  const objectDef = gameObjectDataOf(regDef);
  assert.deepEqual([...(objectDef.equipment.colors ?? [])], ['W'], 'materializacja (identity) niesie pipy');
  // Zdolność equip (UI/wizard) spójna z deskryptorem.
  const equipAbility = regDef.abilities.find((a) => a.keyword === 'equip');
  assert.deepEqual([...(equipAbility.cost.colors ?? [])], ['W'], 'koszt zdolności = {W} (etykieta przycisku)');
  assert.equal(equipAbility.cost.mana, 1, 'koszt zdolności niesie 1 jednostkę (pita)');
});

function tyrState() {
  const state = game();
  addEquipmentOnBoard(state, 'sword', 'greatsword-of-tyr');
  addCreatureOnBoard(state, 'host', 'highland-game');
  return state;
}

function tyrOffer(state, playerId = 'p1') {
  return playerView(state, playerId).legalCommands.filter(
    (c) => c.type === 'activate_ability' && c.objectId === 'sword',
  );
}

test('M257C2: oferta — maną BEZBARWNĄ {W} się NIE ZAPŁACI (brak oferty)', () => {
  const state = tyrState();
  addColorlessMana(state, 'p1', 1); // „zapłacił tapując górę” — 1 bezbarwna
  const offers = tyrOffer(state);
  assert.equal(offers.length, 0,
    'bez białej many oferta equipu {W} nie może istnieć (root cause uwagi: była)');
});

test('M257C3: walidacja L48 — bezpośrednia aktywacja za bezbarwną manę ODRZUCONA', () => {
  // UI (po fixie) oferty nie da, ale klient/odsyłka mógłby wysłać komendę
  // — płatność musi ją odrzucić, a nie przyczepić miecz (uwaga C: „można
  // było zapłacić jedną dowolną i zadziałało”).
  const state = tyrState();
  addColorlessMana(state, 'p1', 1);
  const r = execute(state, {
    type: 'activate_ability', playerId: 'p1', objectId: 'sword',
    abilityIndex: 1, targets: ['host'],
  });
  assert.equal(r.ok, false, `spendMana z wymaganiem [W] musi rzucić (powód: ${r.reason ?? '—'})`);
  const sword = state.objects.get('sword');
  assert.equal(sword?.attachedTo, null, 'miecz nie przykleił się za bezbarwną maną');
  // Płatność atomowa (CR 601.2h): bezbarwna jednostka nie zużyta.
  assert.equal(state.players.find((p) => p.id === 'p1').mana, 1, 'mana wróciła (brak częściowej płatności)');
});

test('M257C4: biała mana — oferta istnieje i equip PRZECHODZI (anti-overfix)', () => {
  const state = tyrState();
  addWhiteMana(state, 'p1', 1);
  const offers = tyrOffer(state);
  assert.equal(offers.length, 1, 'biała pita w puli = oferta {W} oferowana');
  const r = execute(state, { ...offers[0], playerId: 'p1' });
  assert.ok(r.ok, `aktywacja za białą manę przechodzi: ${r.reason ?? ''}`);
  // Equip na stosie (CR 602.2a) — rozstrzygnij obie passy i sprawdź założenie.
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok);
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p2' }).ok);
  const sword = state.objects.get('sword');
  assert.equal(sword?.zone, 'battlefield', 'miecz wrócił na pole bitwy (przyklejony)');
  assert.equal(sword?.attachedTo, 'host', 'wyposażony do Highland Game');
  assert.equal(state.players.find((p) => p.id === 'p1').mana, 0, 'biała pita zużyta');
});

test('M257C5: inna karta sprzętowa NIE ZMIENIŁA SIĘ — Blazing Torch (generyczny {1}) działa bez kolorów', () => {
  // Anti-overfix klasy L21: przepływ `colors` jest warunkowy (pole tylko
  // gdy niepuste) — bezkolorowe sprzęty zachowują dawną ofertę/walidację.
  const state = game();
  addEquipmentOnBoard(state, 'torch', 'blazing-torch');
  addCreatureOnBoard(state, 'host', 'highland-game');
  addColorlessMana(state, 'p1', 1);
  const offers = playerView(state, 'p1').legalCommands.filter(
    (c) => c.type === 'activate_ability' && c.objectId === 'torch',
  );
  assert.equal(offers.length, 1, 'generyczny {1} nadal płaci się bezbarwną maną');
  const r = execute(state, { ...offers[0], playerId: 'p1' });
  assert.ok(r.ok, `Blazing Torch {1} przechodzi: ${r.reason ?? ''}`);
});

// ---------------------------------------------------------------------------
// B — menu „Twoje działania”: pass i poddanie ZAWSZE ostatnie;
//    Przygoda tam, gdzie inne czary
// ---------------------------------------------------------------------------

test('M257B1: ranki rzutów — adventure/escape/flashback/manifest w ranku 5 (z innymi czarami)', () => {
  const castTypes = ['cast_adventure', 'cast_adventure_creature', 'cast_escape', 'cast_flashback', 'turn_manifest_face_up'];
  for (const type of castTypes) {
    assert.equal(actionMenuRank(type), 5, `${type} w ranku 5 (tam gdzie inne czary)`);
  }
  assert.equal(actionMenuRank('cast_spell'), 5, 'spójność: cast_spell = 5');
});

test('M257B2: pass i poddanie partii Z ZASADY ostatnie (nie z ranku 8/9)', () => {
  // Fallback dla nierankowanych typów to 99 — dawniej przez to Przygoda
  // (99) wypadała PO pass(8)/concede(9). Teraz pass=1000, concede=1001:
  // każda komenda (nawet nowa, nierankowana) jest przed nimi.
  assert.ok(actionMenuRank('pass_priority') > actionMenuRank('cast_adventure'), 'pass po przygodzie');
  assert.ok(actionMenuRank('pass_priority') > 99, 'pass po fallbackzie 99 (nowe komendy)');
  assert.ok(actionMenuRank('concede') > actionMenuRank('pass_priority'), 'poddanie jako ostatnie');
  assert.ok(actionMenuRank('unknown_future_type') < actionMenuRank('pass_priority'),
    'nierankowana przyszła komenda przed pass (reguła właściciela)');
});

test('M257B3: sort panelu — Przygoda z czarami, pass przed poddaniem na dole', () => {
  // Ten sam porządkownik co renderTableView (render.js) — pinuje zachowanie
  // menu, nie tylko mapę ranków.
  const commands = [
    { type: 'pass_priority' },
    { type: 'concede' },
    { type: 'cast_adventure', objectId: 'slaad' },
    { type: 'cast_spell', objectId: 'bolt' },
    { type: 'activate_ability', objectId: 'sword' },
    { type: 'play_land', objectId: 'plains' },
    { type: 'resolve_scry', objectId: 'scry' },
  ];
  const sorted = commands.slice().sort((a, b) => actionMenuRank(a.type) - actionMenuRank(b.type));
  const pos = (type) => sorted.findIndex((c) => c.type === type);
  assert.ok(pos('cast_adventure') < pos('pass_priority'), 'Przygoda NAD pass (uwaga B)');
  assert.ok(Math.abs(pos('cast_adventure') - pos('cast_spell')) <= 1, 'Przygoda w grupie czarów');
  assert.equal(pos('pass_priority'), sorted.length - 2, 'pass przedostatnie');
  assert.equal(pos('concede'), sorted.length - 1, 'poddanie partii jako ostatnie');
});

// ---------------------------------------------------------------------------
// A — Morph twarzą w dół: warstwa ilustracji NIE WYCIEKA tożsamości (FoW)
// ---------------------------------------------------------------------------

function morphGameSession(onCast, { seed = 1 } = {}) {
  const registry = createCardRegistry();
  // Bot (p2) = tarkir-bg (m.in. Woolly Loxodon, Morph {3}, artId 518 —
  // karta, którą właściciel zobaczył na warstwie); gracz = warhammer-brg.
  const decks = new Map([
    [HUMAN_ID, parseDeckText(fs.readFileSync('decks/warhammer-brg.txt', 'utf8'), registry).cardIds],
    [BOT_ID, parseDeckText(fs.readFileSync('decks/tarkir-bg.txt', 'utf8'), registry).cardIds],
  ]);
  return { registry, session: createSession({ seed, registry, decks, onCast }) };
}

const MORPH_IDS = new Set(['segmented-krotiq', 'woolly-loxodon', 'ainok-tracker', 'monastery-flock', 'willbender']);

test('M257A1: paylod onCast — rzut twarzą w dół niesie faceDown:true (wypływ FoW zamknięty u źródła)', () => {
  const calls = [];
  const { registry, session } = morphGameSession((p) => calls.push(p), { seed: 1 });
  for (let i = 0; i < 400 && session.state.status === 'active'; i += 1) {
    if (session.botPausePending) { session.continueBotPlay(); continue; }
    if (session.artPausePending) { session.continueArtPlay(); continue; }
    const view = session.view();
    const meaningful = view.legalCommands.filter(
      (c) => !['pass_priority', 'concede', 'tap_for_mana', 'resolve_combat'].includes(c.type),
    );
    const cmd = meaningful[0]
      ?? view.legalCommands.find((c) => c.type === 'pass_priority')
      ?? view.legalCommands.find((c) => c.type !== 'concede');
    if (!cmd) break;
    if (!session.apply(cmd).ok) break;
  }
  const morphCalls = calls.filter((c) => MORPH_IDS.has(c.cardId));
  assert.ok(morphCalls.length > 0, 'w partii rzut morpha się wydarzył (test nie pusty)');
  for (const call of morphCalls) {
    assert.equal(call.faceDown, true, `rzut ${call.cardId} twarzą w dół = faceDown:true w payloaddzie onCast`);
  }
  // Reszta (jawne czary/permanenty) — flaga fałszywa, warstwa działa jak dotąd.
  const openCalls = calls.filter((c) => !MORPH_IDS.has(c.cardId));
  assert.ok(openCalls.length > 0, 'jawne rzuty też w payloaddzie (anti-overfix: warstwa nie umarła)');
  for (const call of openCalls) {
    assert.equal(call.faceDown, false, `${call.cardId}: jawny rzut = faceDown:false`);
  }
  // Karta, którą warstwa by pokazała, MA ilustracje (cardHasShowcaseArt) —
  // bez flagi leak byłby widoczny dokładnie tak jak w uwadze właściciela.
  const leaky = REGISTRY.get(morphCalls[0].cardId);
  assert.ok(leaky?.artId, 'morph w talii bota ma artId (warstwa by się odpaliła)');
  void registry;
});
