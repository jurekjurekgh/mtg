// F1–F5 — audyt Żywym Testerem 2026-09-13 (49 partii, batch
// tmp-audyt-transpozycja-2026-09-13): znaleziska do domknięcia.
//
// F1: bot NIGDY nie załogował (0× w 49 partiach; s29: Balamb + 3× Hero +
// Moogle + Bird, bot atakował drobnicą). Mechanizm: crew nie miało ŻADNEJ
// dodatniej wyceny (goła baza 2), więc przegrywało z każdym realnym ruchem.
// F2: nowy kreator załogi — 0 żywych wykonań (ścieżka jednostkowo pokryta:
// E2/A2/DOM; luka behawioralna, domyka ją F1 + weryfikacja żywą partią).
// F3: kafelek kopii Jwari — 0× na żywo. Ścieżka naturalna (rzut → otwarcie
// pendingu z filtrem podtypu → kopia) nie była nigdy przejechana testem.
// F4: trigger Tillera (rzut celowany w permanent → inkubuj 2) — kod istniał,
// ŻADEN test go nie odpalał (0× na żywo).
// F5: wsad 2-pick — pokryty (a-search-batch A/live); attack-draw Balamb
// (atak → dobranie) — tylko kara D3, brak testu rozstrzygnięcia.
//
// Właściciel: greedy zostaje greedy, heurystyka bota zostaje heurystyką —
// F1 to minimalna wycena generyczna (ADR 0002), nie przebudowa bota.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function newState() {
  const state = createGameState({ seed: 20260913, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  return state;
}

function addCard(state, instanceId, cardId, controllerId, zone) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id: instanceId, instanceId: `i-${instanceId}`, cardId, controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, spell: data.spell, abilities: data.abilities ?? [],
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
    types: def.types ?? [], colors: data.colors ?? [],
    cardName: def.name,
    enterAsCopy: data.enterAsCopy ?? null,
  });
}

function byCardAny(state, cardId) {
  return [...state.objects.values()].find((o) => o.cardId === cardId);
}

function noSickness(state, id) {
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
}

function giveMana(state, playerId, amount, colors = {}) {
  const player = state.players.find((pl) => pl.id === playerId);
  player.mana = amount;
  player.manaPool = { ...(player.manaPool ?? {}), ...colors };
}

function passRounds(state, rounds = 6) {
  for (let g = 0; g < rounds; g += 1) {
    let passes = state.turn.passes;
    let guard = 0;
    while (passes < 2 && guard < 20) {
      const holder = state.turn.priorityPlayerId;
      const r = execute(state, { type: 'pass_priority', playerId: holder });
      if (!r.ok && /(_unresolved|not_your_decision)$/.test(r.events?.[0]?.reason ?? '')) return r;
      passes = state.turn.passes;
      guard += 1;
      if (passes === 0) break;
    }
  }
  return { ok: true };
}

function botChoice(state, botId = 'p1') {
  const bot = createHeuristicBot({ seed: 7 });
  return bot.chooseCommand(playerView(state, botId), {});
}

// ---------------------------------------------------------------- F1: bot załoguje.
function crewState() {
  const s = newState();
  const barge = gameObjectDataOf(REGISTRY.get('bomat-bazaar-barge'));
  addObject(s, {
    id: 'barge', instanceId: 'i-barge', cardId: 'bomat-bazaar-barge', controllerId: 'p1',
    zone: 'battlefield', kind: 'artifact',
    power: barge.power, toughness: barge.toughness,
    abilities: barge.abilities ?? [], keywords: [], subtypes: barge.subtypes ?? [],
    types: barge.types ?? ['Artifact', 'Vehicle'],
  });
  noSickness(s, 'barge');
  for (const id of ['c1', 'c2', 'c3']) {
    addObject(s, {
      id, instanceId: `i-${id}`, cardId: 'highland-game', controllerId: 'p1', zone: 'battlefield',
      kind: 'creature', power: 2, toughness: 2, abilities: [], subtypes: [], types: ['Creature'],
    });
    noSickness(s, id);
  }
  return s;
}

// M408 (rewizja pinu, zgłoszenie z gry E 2026-09-22): właściciel zakazał
// załogowania w fazie głównej („bot tapuje stwory, nic z pojazdem nie robi
// i kończy turę… NIGDY WIĘCEJ!"). Dodatnia wycena crew żyje odtąd wyłącznie
// w oknie walki PRZED deklaracją atakujących (moja tura) albo przed blokami
// (tura przeciwnika). Teza F1 — „bot w ogóle potrafi załogować, gdy to ma
// sens" — zostaje, tylko w poprawnym oknie.
test('F1/1: bot WYBIERA crew w oknie walki przed deklaracją atakujących (Barge + 3× 2/2, pusta ręka)', () => {
  const s = crewState();
  s.turn = jumpToStep(s.turn, 'beginning_of_combat', 'p1');
  s.turn.activePlayerId = 'p1';
  s.turn.priorityPlayerId = 'p1';
  const bot = createHeuristicBot({ seed: 7 });
  const cmd = bot.chooseCommand(playerView(s, 'p1'), {});
  assert.equal(cmd?.type, 'activate_ability', `bot ma załogować, wybrał: ${cmd?.type}`);
  assert.equal(cmd?.objectId, 'barge', 'załogowany pojazd to Barge');
  const trace = bot.trace()[0];
  const crew = trace.options.filter((o) => o.cmd.startsWith('activate_ability(barge')).map((o) => o.score);
  assert.ok(crew.length > 0, 'oferta crew istnieje w śladzie');
  assert.ok(Math.max(...crew) >= 8, `crew 5/5 (baza 2 + moc 5×2 − załoga 2×2) musi bić gołą bazę 2, jest: ${JSON.stringify(crew)}`);
});

test('F1/1b: M408 — w precombat main bot NIE crewuje (marnotrawstwo: tap załogi bez ataku)', () => {
  const cmd = botChoice(crewState());
  assert.notEqual(cmd?.objectId, 'barge', `crew w main1 zakazany, bot wybrał: ${cmd?.type} ${cmd?.objectId ?? ''}`);
});

test('F1/2: postcombat main2 — bot NIE crewuje (animacja wygasłaby w EOT, tap traci blok)', () => {
  const s = crewState();
  s.turn = jumpToStep(s.turn, 'main2', 'p1');
  s.turn.activePlayerId = 'p1';
  s.turn.priorityPlayerId = 'p1';
  const cmd = botChoice(s);
  assert.notEqual(cmd?.objectId, 'barge', `postcombat crew bez sensu, bot wybrał: ${cmd?.type} ${cmd?.objectId ?? ''}`);
});

test('F1/3: świeży pojazd (choroba) — bot NIE crewuje (animowany i tak nie zaatakuje, CR 302.6)', () => {
  const s = crewState();
  s.objects.set('barge', Object.freeze({ ...s.objects.get('barge'), summoningSickness: true }));
  const cmd = botChoice(s);
  assert.notEqual(cmd?.objectId, 'barge', `chory pojazd nie zyskuje ataku, bot wybrał: ${cmd?.type} ${cmd?.objectId ?? ''}`);
});

// ---------------------------------------------------------------- F3: Jwari, ścieżka naturalna.
function jwariState({ withAlly = true } = {}) {
  const s = newState();
  if (withAlly) {
    addCard(s, 'coral', 'coralhelm-guide', 'p1', 'battlefield');
    noSickness(s, 'coral');
  }
  addCard(s, 'piker', 'goblin-piker', 'p1', 'battlefield');
  noSickness(s, 'piker');
  addCard(s, 'jwari', 'jwari-shapeshifter', 'p1', 'hand');
  giveMana(s, 'p1', 2, { U: 1 });
  return s;
}

test('F3/1: rzut Jwari przy Sprzymierzeńcu — pending TYLKO z Ally, kopia wchodzi jako Coralhelm', () => {
  const s = jwariState();
  const r = execute(s, { type: 'cast_permanent', playerId: 'p1', objectId: 'jwari' });
  assert.ok(r.ok, 'rzut: ' + (r.events?.[0]?.reason ?? ''));
  passRounds(s, 2);
  assert.ok(s.pendingEnterAsCopy, 'pending kopii otwarty po wejściu (ścieżka naturalna)');
  assert.deepEqual(s.pendingEnterAsCopy.candidateIds, ['coral'], 'kandydat: tylko Ally (piker nie jest Sprzymierzeńcem)');
  const cmd = playerView(s, 'p1').legalCommands
    .find((c) => c.type === 'resolve_enter_as_copy' && c.targetId === 'coral');
  assert.ok(cmd, 'oferta kopii Corala istnieje');
  const sourceId = s.pendingEnterAsCopy.sourceId;
  assert.ok(execute(s, cmd).ok, 'wybór kopii');
  const j = s.objects.get(sourceId);
  assert.equal(s.pendingEnterAsCopy, null, 'pending zamknięty');
  assert.equal(j.zone, 'battlefield', 'kopia żyje na polu bitwy');
  assert.equal(j.cardName, 'Coralhelm Guide', 'nosi nazwę celu (CR 707.2)');
  assert.equal(j.power, 2, 'moc skopiowana (2/1 jak Coralhelm)');
});

test('F3/2: brak Sprzymierzeńca — brak pendingu, Jwari 0/0 ginie (SBA)', () => {
  const s = jwariState({ withAlly: false });
  assert.ok(execute(s, { type: 'cast_permanent', playerId: 'p1', objectId: 'jwari' }).ok);
  passRounds(s, 3);
  assert.equal(s.pendingEnterAsCopy, null, 'bez Ally brak decyzji o kopii');
  assert.equal(byCardAny(s, 'jwari-shapeshifter')?.zone, 'graveyard', '0/0 bez kopii ginie (SBA 704.5f)');
});

test('F3/3: odmowa kopii (targetId null) — pending znika, Jwari 0/0 ginie', () => {
  const s = jwariState();
  assert.ok(execute(s, { type: 'cast_permanent', playerId: 'p1', objectId: 'jwari' }).ok);
  passRounds(s, 2);
  assert.ok(s.pendingEnterAsCopy, 'pending otwarty');
  const r = execute(s, { type: 'resolve_enter_as_copy', playerId: 'p1', targetId: null });
  assert.ok(r.ok, 'odmowa: ' + (r.events?.[0]?.reason ?? ''));
  assert.equal(s.pendingEnterAsCopy, null, 'pending zamknięty po odmowie');
  passRounds(s, 2);
  assert.equal(byCardAny(s, 'jwari-shapeshifter')?.zone, 'graveyard', '0/0 po odmowie ginie');
});

// ---------------------------------------------------------------- F4: trigger Tillera.
function tillerState() {
  const s = newState();
  addCard(s, 'tiller', 'tiller-of-flesh', 'p1', 'battlefield');
  noSickness(s, 'tiller');
  addCard(s, 'foe', 'goblin-piker', 'p2', 'battlefield');
  noSickness(s, 'foe');
  addCard(s, 'shock', 'shock', 'p1', 'hand');
  giveMana(s, 'p1', 1, { R: 1 });
  return s;
}

function incubatorsOf(s, controllerId) {
  return [...s.objects.values()].filter((o) => o.zone === 'battlefield'
    && o.cardId === 'token_incubator' && o.controllerId === controllerId);
}

test('F4/1: Tiller + Shock w stwora — inkubuj 2 (token + 2 liczniki)', () => {
  const s = tillerState();
  const r = execute(s, { type: 'cast_spell', playerId: 'p1', cardId: 'shock', objectId: 'shock', targets: ['foe'] });
  assert.ok(r.ok, 'rzut: ' + (r.events?.[0]?.reason ?? ''));
  passRounds(s, 4);
  const tokens = incubatorsOf(s, 'p1');
  assert.equal(tokens.length, 1, 'jeden Incubator Tillera');
  assert.equal((tokens[0].counters ?? {})['+1/+1'], 2, 'dwa liczniki +1/+1 (inkubuj 2)');
});

test('F4/2: Shock w GRACZA — Tiller nie odpala (cel nie jest permanentem, CR 110.1)', () => {
  const s = tillerState();
  const r = execute(s, { type: 'cast_spell', playerId: 'p1', cardId: 'shock', objectId: 'shock', targets: ['p2'] });
  assert.ok(r.ok, 'rzut w gracza: ' + (r.events?.[0]?.reason ?? ''));
  passRounds(s, 4);
  assert.equal(incubatorsOf(s, 'p1').length, 0, 'brak Incubatora (gracz ≠ permanent)');
});

test('F4/3: CUDZY rzut celowany w permanent — Tiller nie odpala (tylko „you cast”)', () => {
  const s = newState();
  addCard(s, 'tiller', 'tiller-of-flesh', 'p1', 'battlefield');
  noSickness(s, 'tiller');
  addCard(s, 'mine', 'goblin-piker', 'p1', 'battlefield');
  noSickness(s, 'mine');
  addCard(s, 'eshock', 'shock', 'p2', 'hand');
  giveMana(s, 'p2', 1, { R: 1 });
  s.turn.priorityPlayerId = 'p2';
  const r = execute(s, { type: 'cast_spell', playerId: 'p2', cardId: 'shock', objectId: 'eshock', targets: ['mine'] });
  assert.ok(r.ok, 'rzut wroga: ' + (r.events?.[0]?.reason ?? ''));
  passRounds(s, 4);
  assert.equal(incubatorsOf(s, 'p1').length + incubatorsOf(s, 'p2').length, 0, 'brak Incubatora (nie mój rzut)');
});

// ---------------------------------------------------------------- F5: attack-draw Balamb.
test('F5: animowany Balamb atakuje — trigger „attacks → dobierz” rozstrzyga się (+1 karta)', () => {
  const s = createGameState({ seed: 44, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'declare_attackers', 'p1');
  s.turn.activePlayerId = 'p1';
  s.turn.priorityPlayerId = 'p1';
  const back = gameObjectDataOf(REGISTRY.get('balamb-garden-airborne'));
  addObject(s, {
    ...back, id: 'balamb', instanceId: 'i-balamb', cardId: 'balamb-garden-airborne',
    controllerId: 'p1', ownerId: 'p1', zone: 'battlefield', kind: 'creature',
    power: 5, toughness: 4, types: ['Legendary', 'Artifact', 'Creature'],
    subtypes: back.subtypes ?? ['Vehicle'],
  });
  s.objects.set('balamb', Object.freeze({ ...s.objects.get('balamb'), tapped: false, summoningSickness: false }));
  for (let i = 0; i < 5; i++) {
    addObject(s, { id: `L${i}`, instanceId: `i-L${i}`, cardId: 'goblin-piker', controllerId: 'p1', ownerId: 'p1', zone: 'library' });
  }
  const handBefore = [...s.objects.values()].filter((o) => o.zone === 'hand' && o.controllerId === 'p1').length;
  const r = execute(s, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['balamb'] });
  assert.ok(r.ok, 'deklaracja: ' + (r.events?.[0]?.reason ?? ''));
  passRounds(s, 4);
  const handAfter = [...s.objects.values()].filter((o) => o.zone === 'hand' && o.controllerId === 'p1').length;
  assert.equal(handAfter, handBefore + 1, 'Balamb dobrał 1 kartę przy ataku');
});
