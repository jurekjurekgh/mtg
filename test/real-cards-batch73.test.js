// Batch 73 (kolekcja 645–655, PR #185) — zgodność z Oracle i zachowanie 11 wpisów.
//
// Audyt PR #185 (`docs/audits/AUDYT_PR185_2026-11-15.md`, F-11) zmierzył, że batch
// nie miał ŻADNEGO testu kart: `test/real-cards-batch73.test.js` był wymagany przez
// plan (`docs/plans/PLAN_2026-11-11-batch73-kolekcja-645-655.md`, commit #11 i
// kryteria ukończenia), a 6 z 7 sond mutacyjnych na kodzie batcha PRZEŻYWAŁO (rc=0).
// Ten plik jest strażnikiem zgodności z Oracle (snapshoty `docs/cards/scryfall-*.json`
// dołączone w tym samym PR — źródło prawdy wg ADR 0022/0030 i L57) oraz zachowania
// każdej naprawy E2 (F-1..F-7), z mutacją dowodzącą, że pin czerwieni (L34).
//
// Harness (L21): obiekty gier budujemy payloadem z `createCardDeck` — to TA sama
// funkcja, którą `setupGame`/`installDeck` kładzie do biblioteki. Sam spread
// `gameObjectDataOf` NIE niesie `keywords`/`types`/`subtypes`/`transformTo`, więc
// test oparty na nim mierzyłby helper, nie produkt (pomiar audytu: craft dawał
// 0 ofert właśnie przez ten brak).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createCardDeck } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { effectivePower, effectiveToughness } from '../src/engine/permanents.js';

const registry = createCardRegistry();
const definition = (id) => registry.get(id);
const snapshot = (id) => JSON.parse(fs.readFileSync(`docs/cards/scryfall-${id}.json`, 'utf8'));
const commands = (state, playerId = 'p1') => playerView(state, playerId).legalCommands;
const lifeOf = (state, playerId) => state.players.find((p) => p.id === playerId).life;
const pt = (state, id) => {
  const object = state.objects.get(id);
  return object ? `${effectivePower(object, state)}/${effectiveToughness(object, state)}` : null;
};

function game(seed = 73, step = 'main', priority = 'p1') {
  const state = createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, priority);
  state.turn.activePlayerId = state.turn.priorityPlayerId = priority;
  return state;
}

/** Payload karty dokładnie taki, jaki instaluje `createCardDeck` (bez pól wpisu talii). */
function deckPayload(cardId, ownerId) {
  const [entry] = createCardDeck({ cardIds: [cardId], ownerId, registry });
  const { id, instanceId, cardId: _cardId, ownerId: _ownerId, controllerId, zone, objectId, ...rest } = entry;
  return rest;
}

function put(state, id, cardId, controllerId = 'p1', zone = 'battlefield', patch = {}) {
  addObject(state, {
    id, instanceId: `instance-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...deckPayload(cardId, controllerId), ...patch,
  });
  return state.objects.get(id);
}

/** Pełna runda passów aż do pustego stosu (wzorzec: real-cards-batch72). */
function resolveStack(state, limit = 40) {
  for (let i = 0; i < limit && state.zones.stack.length; i += 1) {
    const holder = state.turn.priorityPlayerId;
    const options = commands(state, holder);
    const pick = options.find((c) => c.type.startsWith('resolve_'))
      ?? options.find((c) => c.type === 'pass_priority');
    if (!pick) return;
    if (!execute(state, pick).ok) return;
  }
}

const eventTypes = (state) => state.events.map((e) => e.type);

// ---------------------------------------------------------------------------
// Dane: 11 wpisów kontra snapshoty Oracle i arkusz kolekcji
// ---------------------------------------------------------------------------

test('Batch 73: wszystkie jedenaście wpisów zgadza się ze snapshotami Oracle i arkuszem kolekcji', () => {
  const expected = [
    ['might-beyond-reason', 645, 'SOI', 'Teenage Mutant Ninja Turtles', 'supported'],
    ['messengers-speed', 646, 'THS', 'Theros', 'supported'],
    ['get-the-point', 647, 'RNA', 'Ravnica', 'supported'],
    ['setons-desire', 648, 'DMR', 'Dominaria', 'supported'],
    ['spring-loaded-sawblades', 649, 'LCI', 'Forgotten Realms', 'supported'],
    ['bladewheel-chariot', 650, 'LCI', 'Forgotten Realms', 'back'],
    ['leonin-lightbringer', 651, 'ONE', 'Mirrodin', 'supported'],
    ['river-herald-guide', 652, 'LCI', 'Ixalan', 'supported'],
    ['necrosavant', 653, 'DMR', 'Arcavios', 'supported'],
    ['kessig-flamebreather', 654, 'VOW', 'Innistrad', 'supported'],
    ['plummet', 655, 'M20', 'Ixalan', 'supported'],
  ];
  assert.equal(expected.length, 11, 'kolekcja 645–655 to jedenaście pozycji (649/650 = para TDFC)');
  for (const [id, artId, set, plan, status] of expected) {
    const card = definition(id);
    assert.equal(card.artId, artId, `${id}: artId z arkusza`);
    assert.equal(card.set, set, `${id}: set`);
    assert.equal(card.plan, plan, `${id}: plan (fabularne przyporządkowanie właściciela)`);
    assert.equal(card.support?.status, status, `${id}: status wsparcia`);
    if (status === 'supported') {
      assert.deepEqual(card.support?.limitations, [], `${id}: supported = bez limitations (ADR 0022)`);
    }
  }
  // Snapshoty: nazwa, koszt (cmc), linia typów i P/T — twarz przednia dla TDFC.
  for (const [id, , set] of expected) {
    const snap = snapshot(id === 'bladewheel-chariot' ? 'spring-loaded-sawblades' : id);
    const face = snap.card_faces
      ? snap.card_faces.find((f) => f.name === definition(id).name)
      : snap;
    assert.ok(face, `${id}: twarz w snapshocie`);
    const card = definition(id);
    assert.equal(card.name, face.name, `${id}: nazwa ze snapshotu`);
    if (card.support?.status === 'back') {
      // CR 202.3b: „The mana value of the back face of a nonmodal double-faced
      // permanent or spell's back face is calculated as though it had the mana
      // cost of its front face.” Wpis tyłu nie ma własnego kosztu (0), a payload
      // transformu niesie MV przodu (`createCardDeck` → `transformTo.manaCost`).
      assert.equal(card.manaCost ?? 0, 0, `${id}: tył DFC bez drukowanego kosztu`);
      const front = definition('spring-loaded-sawblades');
      const [frontEntry] = createCardDeck({ cardIds: ['spring-loaded-sawblades'], ownerId: 'p1', registry });
      assert.equal(frontEntry.transformTo?.cardId, card.id, `${id}: front wskazuje tył`);
      assert.equal(frontEntry.transformTo?.manaCost, snap.cmc, `${id}: MV tyłu = MV przodu (CR 202.3b)`);
      assert.equal(front.manaCost, snap.cmc, `${id}: MV przodu ze snapshotu`);
    } else {
      assert.equal(card.manaCost ?? 0, face.cmc ?? snap.cmc ?? 0, `${id}: wartość many (cmc)`);
    }
    const [supertypes, subtypes] = (face.type_line ?? '').split(' — ');
    assert.deepEqual(card.types, supertypes.split(' '), `${id}: typy z type_line`);
    assert.deepEqual(card.subtypes ?? [], subtypes ? subtypes.split(' ') : [], `${id}: podtypy z type_line`);
    if (face.power != null) {
      assert.equal(String(card.power), face.power, `${id}: power`);
      assert.equal(String(card.toughness), face.toughness, `${id}: toughness`);
    }
    assert.equal(card.set.toLowerCase(), (face.set ?? snap.set ?? set).toLowerCase(), `${id}: kod setu`);
  }
});

// ---------------------------------------------------------------------------
// F-5 (E2.1): Kessig Flamebreather — „Whenever you cast a noncreature spell, this
// creature deals 1 damage to each opponent."
// ---------------------------------------------------------------------------

test('Kessig Flamebreather: efekt to silnikowy damage_each_opponent, nie wymyślone pole toEachOpponent', () => {
  const ability = definition('kessig-flamebreather').abilities.find((a) => a.type === 'triggered');
  assert.equal(ability.trigger.event, 'you_cast_noncreature_spell', 'trigger z Oracle');
  // Pomiar audytu (F-5): wpis niósł `{ type: 'damage', amount: 1, toEachOpponent: true }`,
  // a `toEachOpponent` nie występuje w silniku NIGDZIE (grep: 1 trafienie — ten wpis),
  // więc efekt bez celu fizzlował (`damage_fizzled`, życie 20/20).
  assert.equal(ability.effect.type, 'damage_each_opponent',
    'deskryptor „deals 1 damage to each opponent" istnieje w silniku (effects.js)');
  assert.equal(ability.effect.amount, 1, 'kwota z Oracle');
  assert.equal('toEachOpponent' in ability.effect, false, 'brak martwego pola w danych karty');
});

test('Kessig Flamebreather: rzucenie czaru niebędącego stworem zadaje 1 obrażenie każdemu przeciwnikowi (CR 119.3)', () => {
  const state = game();
  put(state, 'kessig', 'kessig-flamebreather', 'p1');
  put(state, 'spell', 'might-beyond-reason', 'p1', 'hand'); // {3}{G}, cel: stwór
  put(state, 'body', 'river-herald-guide', 'p1');           // legalny cel czaru
  addMana(state, 'p1', 6, { colors: [] });
  addMana(state, 'p1', 2, { colors: ['G'] });
  const cast = commands(state).find((c) => c.type === 'cast_spell' && c.objectId === 'spell');
  assert.ok(cast, 'czar niebędący stworem jest rzucalny');
  assert.equal(execute(state, { ...cast, targets: ['body'] }).ok, true);
  resolveStack(state);
  assert.equal(lifeOf(state, 'p2'), 19, 'przeciwnik dostał 1 obrażenie z triggera');
  assert.equal(lifeOf(state, 'p1'), 20, 'kontroler źródła jest nietknięty (each OPPONENT)');
  assert.ok(!eventTypes(state).includes('damage_fizzled'), 'trigger nie fizzluje');
  assert.ok(eventTypes(state).includes('ability_triggered'), 'trigger wszedł na stos');
});

test('Kessig Flamebreather: obrażenia są nie-combat, a trigger nie odpala się po rzuceniu stwora', () => {
  const state = game();
  put(state, 'kessig', 'kessig-flamebreather', 'p1');
  put(state, 'creatureSpell', 'river-herald-guide', 'p1', 'hand'); // czar BĘDĄCY stworem
  addMana(state, 'p1', 6, { colors: [] });
  addMana(state, 'p1', 2, { colors: ['G'] });
  const cast = commands(state).find((c) => (c.type === 'cast_permanent' || c.type === 'cast_spell')
    && c.objectId === 'creatureSpell');
  assert.ok(cast, 'stwór z ręki jest rzucalny');
  assert.equal(execute(state, cast).ok, true);
  resolveStack(state);
  assert.equal(lifeOf(state, 'p2'), 20, 'rzucenie stwora NIE odpala triggera (noncreature spell)');
  // Źródło obrażeń to SAM Kessig (CR 608.2h — „this creature deals"), więc
  // obrażenia dziedziczą jego właściwości (np. lifelink) i są nie-combat.
  const damage = state.events.filter((e) => e.type === 'damage_dealt');
  assert.ok(damage.length === 0, 'brak obrażeń od czaru będącego stworem');
});
