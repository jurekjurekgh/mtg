// M381 (wyzwanie „brązowa odznaka", ADR 0030): GRANT TURY na czar
// („you may cast Dinosaur spells this turn as though they had flash, and
// whenever you cast a Dinosaur spell this turn, it gains ...") — jedno źródło
// prawdy dla oferty i walidacji ORAZ realna zdolność nadawana czarowi.
//
// Źródła online (dostęp 2026-09-18):
//  • Oracle + rulings Cherished Hatchling (RIX):
//    https://api.scryfall.com/cards/named?exact=Cherished%20Hatchling
//    „When this creature dies, you may cast Dinosaur spells this turn as
//     though they had flash, and whenever you cast a Dinosaur spell this turn,
//     it gains »When this creature enters, you may have it fight another
//     target creature.«"
//    https://api.scryfall.com/cards/0a14fe6c-b272-415b-974d-c60d016ab786/rulings
//    — „During the turn Cherished Hatchling dies, you may cast any number of
//       Dinosaurs as though they had flash."
//    — „For the triggered ability that the entering Dinosaur gains, if the
//       target is illegal when it tries to resolve or if the Dinosaur that
//       entered the battlefield has left the battlefield, no creature will
//       deal or be dealt damage."
//  • CR 702.8 (flash): rzut „as though it had flash" = w każdej chwili, gdy
//    można rzucić instant (https://media.wizards.com/2026/downloads/
//    MagicCompRules%2020260819.txt, efektywne 2026-08-07).
//  • CR 701.12 (fight): dwa stwory zadają sobie NAWZAJEM obrażenia równe
//    swojej mocy (701.12b jednocześnie; 701.12c — nielegalny uczestnik =
//    żaden nie zadaje obrażeń).
//  • CR 603.6a (enters-the-battlefield): zdolność ETB odpala się, gdy
//    permanent wchodzi — także zdolność nadana mu na turę.
//
// Stan przed M381: `state.subtypeFlashThisTurn` niosło flagę `etbFight`,
// której NIKT nie czytał (druga połowa zdolności nie istniała), a pozwolenie
// na flash znała WYŁĄCZNIE oferta (`playerView`) — walidacja
// `castPermanent` patrzyła tylko na wydrukowany keyword, więc opublikowaną
// komendę `cast_permanent` odrzucała („Zagranie poza main phase"), czyli
// dokładnie złamany kontrakt „oferta = walidacja" (L41/L48).
//
// Piny: (A) komenda z oferty w end stepie jest PRZYJMOWANA (grant flash),
// (B) nadana zdolność istnieje i walczy (cel wybrany → 6/5 kontra 2/1),
// (C) bez grantu nie ma ani zdolności, ani decyzji (kontrola), (D) „you may"
// — oferta z `targetId: null` nic nie robi, (E) grant wygasa w cleanupie.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { clearStatModifiers } from '../src/engine/permanents.js';

const REGISTRY = createCardRegistry();
const HATCHLING = 'cherished-hatchling';
const DINO = 'seismic-monstrosaur';   // 6/5 trample, MV 6
const FOE = 'highland-game';          // 2/1

/** Partia: Hatchling na polu, Dinozaur i Shock w ręce, wróg 2/1 u p2. */
function scenario({ step = 'main1', active = 'p1' } = {}) {
  const state = createGameState({ seed: 381, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, active);
  state.turn.activePlayerId = active;
  state.turn.priorityPlayerId = active;
  state.turn.number = 13;
  state.pendingMulligans = [];
  const put = (id, cardId, playerId, zone) => {
    const card = REGISTRY.get(cardId);
    addObject(state, {
      id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId, zone,
      types: card.types ?? [], keywords: card.keywords ?? [], subtypes: card.subtypes ?? [],
      cardName: card.name, ...gameObjectDataOf(card),
    });
    return state.objects.get(id);
  };
  for (const pid of ['p1', 'p2']) {
    for (let i = 0; i < 8; i += 1) put(`lib-${pid}-${i}`, 'basic-forest', pid, 'library');
  }
  for (let i = 0; i < 8; i += 1) put(`forest-${i}`, 'basic-forest', 'p1', 'battlefield');
  put('hatch', HATCHLING, 'p1', 'battlefield');
  put('dino', DINO, 'p1', 'hand');
  put('shock', 'shock', 'p1', 'hand');
  put('foe', FOE, 'p2', 'battlefield');
  state.players = state.players.map((player) => (player.id === 'p1'
    ? { ...player, mana: 20, manaPool: { R: 6, G: 6 } } : player));
  return state;
}

const ofType = (state, type, playerId = 'p1') => playerView(state, playerId).legalCommands.filter((c) => c.type === type);
const why = (result) => result.reason ?? result.events?.[0]?.reason ?? '?';

/** Uruchamia triggery Hatchlinga: Shock (2 obrażenia) zabija 2/1. */
function armGrant(state) {
  const shock = ofType(state, 'cast_spell').find((c) => c.objectId === 'shock' && c.targets.includes('hatch'));
  assert.ok(shock, 'Shock na Hatchlinga jest oferowany');
  assert.ok(execute(state, shock).ok, 'rzut Shocka');
  resolveStack(state);
  assert.equal(state.objects.get('hatch')?.zone, undefined, 'Hatchling zginął');
  const grant = (state.subtypeFlashThisTurn ?? [])[0];
  assert.ok(grant, 'grant tury został zarejestrowany');
  assert.equal(grant.subtype, 'Dinosaur');
  assert.ok(grant.grantedAbility, 'grant niesie deskryptor nadawanej zdolności');
  return grant;
}

/** Rozstrzyga stos i — gdy trzeba — wybiera cel nadanej zdolności. */
function resolveStack(state, { chooseTarget = null } = {}) {
  for (let i = 0; i < 30; i += 1) {
    const commands = playerView(state, state.turn.priorityPlayerId).legalCommands;
    const decision = commands.find((c) => c.type === 'resolve_trigger_target');
    if (decision) {
      const wanted = chooseTarget ?? decision.targetId;
      const pick = commands.find((c) => c.type === 'resolve_trigger_target' && c.targetId === wanted) ?? decision;
      const result = execute(state, pick);
      assert.ok(result.ok, `decyzja celu: ${why(result)}`);
      continue;
    }
    const pass = commands.find((c) => c.type === 'pass_priority');
    if (!pass || state.zones.stack.length === 0) return;
    execute(state, pass);
  }
}

test('M381/A: grant flash — komenda z OFERTY jest przyjmowana (L41/L48)', () => {
  const state = scenario();
  armGrant(state);
  // Krok końcowy: priorytet ma p1 (właściciel grantu), nie jego tura.
  state.turn = jumpToStep(state.turn, 'end', 'p1');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p1';
  const offered = ofType(state, 'cast_permanent').filter((c) => c.objectId === 'dino');
  assert.equal(offered.length, 1, 'oferta rzutu Dinozaura w end stepie istnieje');
  const result = execute(state, offered[0]);
  assert.ok(result.ok, `oferta musi być wykonalna: ${why(result)}`);
});

test('M381/B: nadana zdolność istnieje i walczy (CR 701.12 + 603.6a)', () => {
  const state = scenario();
  armGrant(state);
  const cast = ofType(state, 'cast_permanent').find((c) => c.objectId === 'dino');
  assert.ok(cast, 'rzut Dinozaura oferowany w main phase (grant nie ogranicza)');
  assert.ok(execute(state, cast).ok);
  const foeBefore = state.players.find((p) => p.id === 'p2').life;
  resolveStack(state, { chooseTarget: 'foe' });
  const monster = [...state.objects.values()].find((o) => o.cardId === DINO && o.zone === 'battlefield');
  assert.ok(monster, 'Dinozaur wszedł na pole bitwy');
  assert.ok((monster.abilityGrants ?? []).length > 0, 'permanent nosi nadaną zdolność (this turn)');
  // 6/5 kontra 2/1: wróg ginie od 6 obrażeń, Dinozaur dostaje 2.
  const foe = state.objects.get('foe');
  const foeIsDead = foe == null || foe.zone !== 'battlefield';
  assert.ok(foeIsDead, 'Highland Game (2/1) zginął od walki');
  assert.equal(state.objects.get(monster.id)?.damage, 2, 'Dinozaur dostał 2 obrażenia od walki');
  // Walka nie dotyka gracza; Highland Game ma trigger śmierci „you gain 2 life",
  // więc różnica życia p2 to WYŁĄCZNIE ten trigger — nie obrażenia z walki.
  assert.equal(state.players.find((p) => p.id === 'p2').life, foeBefore + 2,
    'walka nie zadaje obrażeń graczowi (2 życia to trigger śmierci Highland Game)');
});

test('M381/C: bez grantu nie ma zdolności (kontrola)', () => {
  const state = scenario();
  const cast = ofType(state, 'cast_permanent').find((c) => c.objectId === 'dino');
  assert.ok(execute(state, cast).ok);
  resolveStack(state);
  const monster = [...state.objects.values()].find((o) => o.cardId === DINO && o.zone === 'battlefield');
  assert.ok(monster, 'Dinozaur na polu');
  assert.deepEqual(monster.abilityGrants ?? [], [], 'brak grantu = brak nadanej zdolności');
  assert.equal(state.objects.get('foe')?.damage ?? 0, 0, 'nikt nie walczył');
});

test('M381/D: „you may" — rezygnacja z celu nic nie robi', () => {
  const state = scenario();
  armGrant(state);
  const cast = ofType(state, 'cast_permanent').find((c) => c.objectId === 'dino');
  assert.ok(execute(state, cast).ok);
  // Decyzja ma wariant rezygnacji (`targetId: null`) — „you may".
  let declined = false;
  for (let i = 0; i < 20 && !declined; i += 1) {
    const commands = playerView(state, state.turn.priorityPlayerId).legalCommands;
    const none = commands.find((c) => c.type === 'resolve_trigger_target' && c.targetId === null);
    if (none) { assert.ok(execute(state, none).ok); declined = true; break; }
    const pass = commands.find((c) => c.type === 'pass_priority');
    if (!pass || state.zones.stack.length === 0) break;
    execute(state, pass);
  }
  assert.ok(declined, 'oferta rezygnacji (targetId: null) istnieje');
  resolveStack(state);
  const monster = [...state.objects.values()].find((o) => o.cardId === DINO && o.zone === 'battlefield');
  assert.equal(state.objects.get('foe')?.damage ?? 0, 0, 'wróg bez obrażeń');
  assert.equal(state.objects.get(monster.id)?.damage ?? 0, 0, 'Dinozaur bez obrażeń');
});

test('M381/E: grant wygasa w cleanupie (efekt „this turn")', () => {
  const state = scenario();
  armGrant(state);
  const cast = ofType(state, 'cast_permanent').find((c) => c.objectId === 'dino');
  assert.ok(execute(state, cast).ok);
  resolveStack(state, { chooseTarget: null });
  const monster = [...state.objects.values()].find((o) => o.cardId === DINO && o.zone === 'battlefield');
  assert.ok((monster.abilityGrants ?? []).length > 0, 'przed cleanupem grant jest');
  clearStatModifiers(state);
  assert.deepEqual(state.objects.get(monster.id)?.abilityGrants ?? [], [], 'po cleanupie grant znika');
  assert.deepEqual(state.subtypeFlashThisTurn ?? [], [], 'pozwolenie na flash znika razem z turą');
});
