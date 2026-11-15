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
import { effectivePower, effectiveToughness, staticConditionHolds, clearStatModifiers } from '../src/engine/permanents.js';
import { applyEffect } from '../src/engine/effects.js';
import { attachAuraToCreature, attachEquipmentToCreature } from '../src/engine/attachments.js';
import { blockerSeedAssignments, blockCandidatePool, mandatoryBlockerIds, minimalMandatoryBlocks } from '../src/engine/combat.js';
import { moveObjectDirectly } from '../src/engine/objects.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

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

// ---------------------------------------------------------------------------
// F-2 (E2.2): Leonin Lightbringer — „As long as this creature is equipped, it
// gets +1/+1." (warunek `equipped`, CR 301.5a)
// ---------------------------------------------------------------------------

test('Leonin Lightbringer: pump statyczny ma warunek `equipped` i kwoty +1/+1 z Oracle', () => {
  const ability = definition('leonin-lightbringer').abilities.find((a) => a.type === 'static');
  assert.ok(ability, 'zdolność statyczna istnieje');
  assert.deepEqual(ability.condition, { equipped: true }, 'warunek z Oracle („as long as … equipped")');
  assert.deepEqual(ability.pump, { power: 1, toughness: 1 }, '+1/+1 z Oracle');
  assert.deepEqual([definition('leonin-lightbringer').power, definition('leonin-lightbringer').toughness], [3, 2],
    'drukowane 3/2');
  assert.ok(definition('leonin-lightbringer').keywords.includes('ward'), 'Ward {2} jako keyword');
});

test('Leonin Lightbringer: 3/2 bazowo, 4/3 gdy wyposażony, z powrotem 3/2 po odłączeniu (CR 301.5a)', () => {
  const state = game();
  put(state, 'leonin', 'leonin-lightbringer', 'p1');
  put(state, 'cloak', 'cloak-of-the-bat', 'p1');
  assert.equal(pt(state, 'leonin'), '3/2', 'bez sprzętu drukowane 3/2');
  attachEquipmentToCreature(state, 'cloak', 'leonin');
  assert.equal(state.objects.get('cloak').attachedTo, 'leonin', 'sprzęt przyłączony do stwora');
  assert.equal(pt(state, 'leonin'), '4/3', 'Oracle: „As long as this creature is equipped, it gets +1/+1"');
  // Odłączenie (np. sprzęt zniszczony) cofa pump — warunek jest ciągły (CR 611.3a).
  state.objects.set('cloak', Object.freeze({ ...state.objects.get('cloak'), attachedTo: null, zone: 'graveyard' }));
  state.zones.battlefield = state.zones.battlefield.filter((id) => id !== 'cloak');
  state.zones.graveyard = [...state.zones.graveyard, 'cloak'];
  assert.equal(pt(state, 'leonin'), '3/2', 'po utracie sprzętu wraca 3/2');
});

test('Leonin Lightbringer: AURA nie jest sprzętem — „equipped" nie zachodzi od enchant creature (CR 301.5a/303.4b)', () => {
  const state = game();
  put(state, 'leonin', 'leonin-lightbringer', 'p1');
  put(state, 'aura', 'messengers-speed', 'p1'); // Enchant creature, trample + haste — bez P/T
  attachAuraToCreature(state, 'aura', 'leonin');
  assert.equal(state.objects.get('aura').attachedTo, 'leonin', 'aura przyłączona');
  assert.equal(pt(state, 'leonin'), '3/2', 'aura nie „wyposaża" stwora — pump z `equipped` nie działa');
  // Ten sam stwór z aurą I sprzętem dostaje pump (sprzęt decyduje).
  put(state, 'cloak', 'cloak-of-the-bat', 'p1');
  attachEquipmentToCreature(state, 'cloak', 'leonin');
  assert.equal(pt(state, 'leonin'), '4/3', 'sprzęt przy aurze nadal daje +1/+1');
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

// ---------------------------------------------------------------------------
// F-1 (E2.3): Seton's Desire — „Threshold — As long as there are seven or more
// cards in your graveyard, all creatures able to block enchanted creature do so."
// Pomiar audytu (sonda 4B/7a, stan 5df0e96): warunek `minGraveyardCards` nie był
// ewaluowany (cichy no-op → `false`), a `must_block_enchanted` pisało flagę na
// AURZE, której nie czytał ŻADEN konsument (grep: 0) — pusty blob
// `declare_blockers` przechodził z `ok=true` mimo wymogu z Oracle.
// CR 509.1c: „If the number of requirements that are being obeyed is fewer than
// the maximum possible number of requirements that could be obeyed without
// disobeying any restrictions, the declaration of blockers is illegal."
// ---------------------------------------------------------------------------

/** Stwór gotowy do ataku/bloku (bez summoning sickness — CR 302.6). */
function ready(state, id) {
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

/** Karty (nie tokeny — CR 108.2b) w grobie gracza; próg liczy kontroler aury. */
function fillGraveyard(state, playerId, count, prefix = 'gy') {
  const ids = [];
  for (let i = 0; i < count; i += 1) {
    const id = `${prefix}-${i}`;
    put(state, id, 'plummet', playerId, 'graveyard');
    ids.push(id);
  }
  return ids;
}

/** Atak p1 → krok deklaracji blokujących z priorytetem p2 (wzorzec audyt-pr140). */
function combat(state, attackerIds) {
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  assert.equal(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds }).ok, true,
    'atak jest legalny');
  state.turn = jumpToStep(state.turn, 'declare_blockers', 'p2');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p2';
}

const blocks = (state, assignments) => execute(state, { type: 'declare_blockers', playerId: 'p2', assignments });

/** Runda passów obu graczy (auto-deklaracja wymuszonych bloków — lustro J). */
function passRound(state, limit = 8) {
  const step = state.turn.step;
  for (let i = 0; i < limit && state.turn.step === step; i += 1) {
    const holder = state.turn.priorityPlayerId;
    const pass = commands(state, holder).find((c) => c.type === 'pass_priority');
    if (!pass || !execute(state, pass).ok) return;
  }
}

function enchantedHost(state, { hostId = 'host', hostCard = 'river-herald-guide', graveyard = 7, controller = 'p1' } = {}) {
  put(state, hostId, hostCard, controller);
  ready(state, hostId);
  put(state, 'aura', 'setons-desire', controller);
  attachAuraToCreature(state, 'aura', hostId);
  if (graveyard > 0) fillGraveyard(state, controller, graveyard);
  return state.objects.get(hostId);
}

test("Seton's Desire: +2/+2 z aury jest bezwarunkowe, a próg 7+ kart w grobie to warunek ciągły (CR 611.3a)", () => {
  const card = definition('setons-desire');
  const ability = card.abilities.find((a) => a.type === 'static');
  assert.ok(ability, 'zdolność statyczna progu istnieje');
  assert.deepEqual(ability.condition, { minGraveyardCards: 7 }, 'próg z Oracle: siedem lub więcej KART w grobie');
  assert.deepEqual(card.aura?.pump, { power: 2, toughness: 2 }, '„Enchanted creature gets +2/+2"');

  const state = game();
  put(state, 'host', 'river-herald-guide');
  put(state, 'aura', 'setons-desire');
  attachAuraToCreature(state, 'aura', 'host');
  const aura = state.objects.get('aura');
  assert.equal(pt(state, 'host'), '5/3', 'pump działa bez progu');
  assert.equal(staticConditionHolds(state, aura, ability.condition), false, 'pusty grób → próg nieosiągnięty');
  fillGraveyard(state, 'p1', 6);
  assert.equal(staticConditionHolds(state, aura, ability.condition), false, '6 kart → poniżej progu');
  fillGraveyard(state, 'p1', 1, 'gy2');
  assert.equal(staticConditionHolds(state, aura, ability.condition), true, '7 kart → próg osiągnięty');
  // Tokeny NIE są kartami (CR 108.2b) — nie wchodzą w próg.
  addObject(state, {
    id: 'gy-token', instanceId: 'instance-gy-token', cardId: 'token_spirit_red_white',
    controllerId: 'p1', ownerId: 'p1', zone: 'graveyard', kind: 'creature',
    types: ['Creature'], subtypes: ['Spirit'], colors: ['R', 'W'], isToken: true,
  });
  assert.equal(staticConditionHolds(state, aura, ability.condition), true, 'token nie zmienia progu');
  // Grób PRZECIWNIKA nie liczy się („your graveyard" = kontroler aury, CR 109.5).
  const state2 = game(74);
  put(state2, 'host', 'river-herald-guide', 'p2');
  put(state2, 'aura', 'setons-desire', 'p1');
  attachAuraToCreature(state2, 'aura', 'host');
  fillGraveyard(state2, 'p2', 9, 'foe');
  assert.equal(staticConditionHolds(state2, state2.objects.get('aura'), ability.condition), false,
    'karty w grobie przeciwnika nie liczą się do progu kontrolera aury');
});

test("Seton's Desire: poniżej progu brak wymogu bloku — pusta deklaracja jest legalna", () => {
  const state = game();
  enchantedHost(state, { graveyard: 6 });
  put(state, 'foe1', 'kraken-hatchling', 'p2');
  put(state, 'foe2', 'pheres-band-centaurs', 'p2');
  combat(state, ['host']);
  assert.deepEqual(mandatoryBlockerIds(state, 'p2'), [], 'bez progu nie ma wymogów');
  assert.equal(blocks(state, {}).ok, true, 'obrońca może nie blokować');
});

test("Seton's Desire (próg): WSZYSTKIE stworzenia zdolne blokować zaklętego muszą to zrobić (CR 509.1c)", () => {
  const state = game();
  enchantedHost(state, { graveyard: 7 });
  put(state, 'foe1', 'kraken-hatchling', 'p2');
  put(state, 'foe2', 'pheres-band-centaurs', 'p2');
  combat(state, ['host']);
  assert.deepEqual(mandatoryBlockerIds(state, 'p2').sort(), ['foe1', 'foe2'],
    'oba stwory są zdolne blokować zaklętego → oba mają wymóg');
  assert.equal(blocks(state, {}).ok, false, 'pusta deklaracja jest NIELEGALNA (pomiar audytu: ok=true)');
  assert.equal(blocks(state, { host: ['foe1'] }).ok, false,
    'jeden z dwóch wymogów = mniej niż maksimum (CR 509.1c)');
  // Wymóg jest informacją publiczną (badge na kaflu + boty — lustro goad i
  // Batch60): widok obrońcy niesie go bez flagi na obiekcie silnika.
  const foeView = playerView(state, 'p2').zones.battlefield.find((entry) => entry.id === 'foe1');
  assert.equal(foeView.blocksIfAble, true, 'widok pokazuje wymóg bloku');
  assert.equal(foeView.blockRequirementCount, 1, 'jeden wymóg z jednej aury');
  assert.equal(state.objects.get('foe1').blocksIfAble ?? false, false,
    'wymóg ciągły NIE jest zatrzaskiwany na obiekcie (CR 611.3a)');
  assert.equal(blocks(state, { host: ['foe1', 'foe2'] }).ok, true, 'pełne pokrycie wymogów jest legalne');
  assert.deepEqual([...(state.combat.blockers.get('host') ?? [])].sort(), ['foe1', 'foe2']);
});

test("Seton's Desire: wymóg dotyczy ZAKLĘTEGO stwora — blok innego atakującego go nie spełnia", () => {
  const state = game();
  enchantedHost(state, { graveyard: 7 });
  put(state, 'other', 'feral-ridgewolf'); // drugi atakujący bez wymogu
  ready(state, 'other');
  put(state, 'foe1', 'kraken-hatchling', 'p2');
  put(state, 'foe2', 'pheres-band-centaurs', 'p2');
  combat(state, ['host', 'other']);
  assert.equal(blocks(state, { other: ['foe1', 'foe2'] }).ok, false,
    'wymóg jest celowany: bloki innego atakującego nie spełniają „block enchanted creature"');
  assert.equal(blocks(state, { host: ['foe1'], other: ['foe2'] }).ok, false,
    'rozdzielenie bloków spełnia tylko jeden z dwóch wymogów');
  assert.equal(blocks(state, { host: ['foe1', 'foe2'] }).ok, true, 'zaklęty zablokowany przez oba');
});

test("Seton's Desire: stwór NIEZDOLNY blokować zaklętego nie ma wymogu (CR 509.1 „if able”)", () => {
  const state = game();
  // Zaklęty stwór z lataniem: blockers bez latania/zasięgu nie jest „able".
  enchantedHost(state, { hostCard: 'shining-aerosaur', graveyard: 7 });
  assert.ok(definition('shining-aerosaur').keywords.includes('flying'), 'gospodarz ma latanie');
  put(state, 'foe-ground', 'kraken-hatchling', 'p2');
  combat(state, ['host']);
  assert.deepEqual(mandatoryBlockerIds(state, 'p2'), [], 'brak zdolnego blokera → brak wymogu');
  assert.equal(blocks(state, {}).ok, true, 'niezdolny stwór nie musi (i nie może) blokować');
});

test("Seton's Desire: bloker z lataniem jest zdolny → ma wymóg, a oferty i pula to odzwierciedlają", () => {
  const state = game();
  enchantedHost(state, { hostCard: 'shining-aerosaur', graveyard: 7 });
  put(state, 'foe-ground', 'kraken-hatchling', 'p2');
  put(state, 'foe-fly', 'shining-aerosaur', 'p2');
  combat(state, ['host']);
  assert.deepEqual(mandatoryBlockerIds(state, 'p2'), ['foe-fly'], 'tylko zdolny bloker ma wymóg');
  const seeds = blockerSeedAssignments(state, 'p2');
  assert.ok(seeds.length > 0, 'ziarna oferty istnieją');
  assert.ok(!seeds.some((seed) => Object.values(seed).flat().length === 0),
    'pusta deklaracja nie jest ziarnem (wymóg jest osiągalny)');
  assert.deepEqual(minimalMandatoryBlocks(state, 'p2', mandatoryBlockerIds(state, 'p2')), { host: ['foe-fly'] },
    'minimalny świadek maksimum wymogów');
  assert.deepEqual(blockCandidatePool(state, 'p2').host.sort(), ['foe-fly'],
    'pula kandydatów: tylko zdolny bloker');
  assert.equal(blocks(state, { host: ['foe-fly'] }).ok, true);
});

test("Seton's Desire: wymóg jest ciągły — znika z aurą i ze spadkiem poniżej progu (CR 611.3a)", () => {
  const state = game();
  enchantedHost(state, { graveyard: 7 });
  put(state, 'foe1', 'kraken-hatchling', 'p2');
  combat(state, ['host']);
  assert.equal(blocks(state, {}).ok, false, 'przy progu pusta deklaracja jest nielegalna');
  // Spadek poniżej progu (karta opuszcza grób) odbiera wymóg natychmiast.
  moveObjectDirectly(state, 'gy-0', 'exile', 'gy-0-exiled');
  assert.deepEqual(mandatoryBlockerIds(state, 'p2'), [], 'poniżej progu brak wymogu');
  assert.equal(blocks(state, {}).ok, true, 'po spadku poniżej progu można nie blokować');
  // Powrót nad próg przywraca wymóg (nic nie jest zatrzaskiwane na obiekcie).
  moveObjectDirectly(state, 'gy-0-exiled', 'graveyard', 'gy-0-returned');
  assert.deepEqual(mandatoryBlockerIds(state, 'p2'), ['foe1'], 'wymóg wraca razem z progiem');

  // Odłączenie aury (np. zniszczona) też odbiera wymóg.
  const state2 = game(75);
  enchantedHost(state2, { graveyard: 7 });
  put(state2, 'foe1', 'kraken-hatchling', 'p2');
  combat(state2, ['host']);
  assert.equal(blocks(state2, {}).ok, false);
  state2.objects.set('aura', Object.freeze({ ...state2.objects.get('aura'), attachedTo: null, zone: 'graveyard' }));
  state2.zones.battlefield = state2.zones.battlefield.filter((id) => id !== 'aura');
  state2.zones.graveyard = [...state2.zones.graveyard, 'aura'];
  assert.deepEqual(mandatoryBlockerIds(state2, 'p2'), [], 'bez aury brak wymogu');
  assert.equal(blocks(state2, {}).ok, true, 'po zniszczeniu aury można nie blokować');
});

test("Seton's Desire: runda passów deklaruje wymuszone bloki automatycznie (lustro znaleziska J)", () => {
  const state = game();
  enchantedHost(state, { graveyard: 7 });
  put(state, 'foe1', 'kraken-hatchling', 'p2');
  put(state, 'foe2', 'pheres-band-centaurs', 'p2');
  combat(state, ['host']);
  assert.equal(state.combat.blockers.size, 0, 'przed passami brak deklaracji');
  passRound(state);
  assert.deepEqual([...(state.combat?.blockers?.get('host') ?? [])].sort(), ['foe1', 'foe2'],
    'spasowanie nie pomija osiągalnych wymogów (CR 509.1c)');
});

// ---------------------------------------------------------------------------
// F-3 (E2.4): Spring-Loaded Sawblades — „When this artifact enters, it deals 5
// damage to target tapped creature an opponent controls."
// Pomiar audytu (sonda 4C, stan 5df0e96): wpis niósł
// `requiresTarget: { type: 'creature', qualifier: { tapped: true, controller:
// 'opponent' } }`, a klucz `qualifier` NIE ISTNIEJE w języku deskryptorów celu
// (silnik zna `qualifier` wyłącznie dla przeszukiwań biblioteki) — filtr był
// cicho ignorowany, więc ETB oznaczał `damage_marked 5` na WŁASNYM, ODKRĘCONYM
// stworze i nie pytał o cel przy wielu kandydatach (CR 115.1, 601.2c, 608.2b).
// ---------------------------------------------------------------------------

/** Ustawia stan tapped (addObject nie przyjmuje `tapped` — kontrakt L21). */
function tapped(state, id) {
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), tapped: true }));
  return state.objects.get(id);
}

/**
 * Rzuca Sawblades z ręki (Flash) i doprowadza do wejścia na pole bitwy.
 * Zmiana strefy tworzy NOWY obiekt (CR 400.7), więc permanentu szukamy po
 * `cardId`, nie po id karty z ręki.
 */
function castSawblades(state, controller = 'p1') {
  put(state, 'saw', 'spring-loaded-sawblades', controller, 'hand');
  addMana(state, controller, 6, { colors: [] });
  addMana(state, controller, 2, { colors: ['W'] });
  const cast = commands(state, controller).find((c) => (c.type === 'cast_permanent' || c.type === 'cast_spell')
    && c.objectId === 'saw');
  assert.ok(cast, 'Sawblades jest rzucalne z ręki');
  assert.equal(execute(state, cast).ok, true, 'rzut przyjęty');
  const onBattlefield = () => state.zones.battlefield
    .find((id) => state.objects.get(id)?.cardId === 'spring-loaded-sawblades'
      && state.objects.get(id)?.controllerId === controller);
  for (let i = 0; i < 12 && state.zones.stack.length && !onBattlefield(); i += 1) {
    const pass = commands(state, state.turn.priorityPlayerId).find((c) => c.type === 'pass_priority');
    if (!pass || !execute(state, pass).ok) break;
  }
  assert.ok(onBattlefield(), 'artefakt wszedł na pole bitwy');
  return onBattlefield();
}

test('Spring-Loaded Sawblades: deskryptor celu mówi językiem silnika (tapped_creature + opponentControls)', () => {
  const ability = definition('spring-loaded-sawblades').abilities.find((a) => a.type === 'triggered');
  assert.equal(ability.trigger.event, 'enter_battlefield', 'trigger wejścia');
  assert.deepEqual(ability.effect, { type: 'damage', amount: 5 }, '5 obrażeń z Oracle');
  const spec = ability.trigger.requiresTarget;
  assert.equal(spec.type, 'tapped_creature', '„target tapped creature" — typ znany silnikowi');
  assert.equal(spec.opponentControls, true, '„an opponent controls" — flaga znana silnikowi');
  assert.equal('qualifier' in spec, false,
    'klucz `qualifier` nie istnieje w deskryptorach celu (F-3: cicho ignorowany filtr)');
});

test('Spring-Loaded Sawblades: ETB zadaje 5 obrażeń TAPNIĘTEMU stworowi przeciwnika, nie własnemu ani odkręconemu', () => {
  const state = game();
  put(state, 'foeTap', 'pheres-band-centaurs', 'p2'); tapped(state, 'foeTap'); // 3/7 → przeżyje 5
  put(state, 'ownTap', 'kraken-hatchling', 'p1'); tapped(state, 'ownTap');     // własny tapnięty
  put(state, 'foeUp', 'river-herald-guide', 'p2');                             // odkręcony przeciwnika
  castSawblades(state);
  // Jeden legalny kandydat → cel wybierany automatycznie (M242: wybór bez
  // alternatywy nie jest decyzją gracza), trigger wchodzi na stos i rozstrzyga.
  resolveStack(state);
  assert.equal(state.objects.get('foeTap')?.damage, 5, 'tapnięty stwór przeciwnika dostał 5');
  assert.equal(state.objects.get('ownTap')?.damage ?? 0, 0, 'własny stwór nietknięty');
  assert.equal(state.objects.get('foeUp')?.damage ?? 0, 0, 'odkręcony stwór przeciwnika nietknięty');
  assert.ok(!eventTypes(state).includes('damage_fizzled'), 'obrażenia nie fizzlują');
  assert.equal(lifeOf(state, 'p2'), 20, 'to nie są obrażenia w gracza');
});

test('Spring-Loaded Sawblades: przy dwóch legalnych celach kontroler WYBIERA cel (CR 115.1b/603.3d)', () => {
  const state = game();
  put(state, 'foeA', 'pheres-band-centaurs', 'p2'); tapped(state, 'foeA');
  put(state, 'foeB', 'kraken-hatchling', 'p2'); tapped(state, 'foeB');
  put(state, 'ownTap', 'river-herald-guide', 'p1'); tapped(state, 'ownTap');
  castSawblades(state);
  const pending = state.pendingTriggerTargets ?? [];
  assert.equal(pending.length, 1, 'decyzja celu jest odłożona (nie auto-wybór)');
  assert.deepEqual([...pending[0].candidates].sort(), ['foeA', 'foeB'],
    'kandydaci: wyłącznie tapnięte stwory przeciwnika');
  const offers = commands(state, 'p1').filter((c) => c.type === 'resolve_trigger_target');
  assert.deepEqual(offers.map((c) => c.targetId).sort(), ['foeA', 'foeB'], 'oferta niesie oba cele');
  assert.equal(execute(state, offers.find((c) => c.targetId === 'foeB')).ok, true, 'wybór przyjęty');
  resolveStack(state);
  // Śmierć to zmiana strefy = nowy obiekt (CR 400.7), więc sprawdzamy strefę
  // i cardId, nie id sprzed walki.
  assert.equal(state.zones.battlefield.includes('foeB'), false, 'trafiony stwór opuścił pole bitwy');
  assert.ok(state.zones.graveyard.some((id) => state.objects.get(id)?.cardId === 'kraken-hatchling'
    && state.objects.get(id)?.controllerId === 'p2'),
    '0/4 z 5 obrażeniami umiera (CR 704.3)');
  assert.equal(state.objects.get('foeA')?.damage ?? 0, 0, 'drugi kandydat nietknięty');
  assert.equal(state.objects.get('ownTap')?.damage ?? 0, 0, 'własny stwór nietknięty');
});

test('Spring-Loaded Sawblades: bez legalnego celu zdolność nie wchodzi na stos (CR 603.3d)', () => {
  for (const scenario of ['własny tapnięty', 'odkręcony przeciwnika']) {
    const state = game();
    if (scenario === 'własny tapnięty') { put(state, 'ownTap', 'kraken-hatchling', 'p1'); tapped(state, 'ownTap'); }
    if (scenario === 'odkręcony przeciwnika') put(state, 'foeUp', 'pheres-band-centaurs', 'p2');
    castSawblades(state);
    resolveStack(state);
    assert.ok(state.events.some((e) => e.type === 'trigger_resolved' && e.noEffect === true && e.reason === 'no_targets'),
      `${scenario}: gracz dostaje wpis o braku celu (M106/Z2)`);
    assert.equal(state.zones.stack.length, 0, `${scenario}: stos pusty — zdolność usunięta`);
    assert.equal(state.objects.get('ownTap')?.damage ?? 0, 0, `${scenario}: własny stwór nietknięty`);
    assert.equal(state.objects.get('foeUp')?.damage ?? 0, 0, `${scenario}: odkręcony stwór nietknięty`);
    assert.ok(!state.events.some((e) => e.type === 'damage_marked'), `${scenario}: brak obrażeń`);
  }
});

// ---------------------------------------------------------------------------
// F-4 (E2.5): Necrosavant — „{3}{B}{B}, Sacrifice a creature: Return this card
// from your graveyard to the battlefield. Activate only during your upkeep."
// Pomiar audytu (sonda 6 §4, stan 5df0e96): oferty aktywacji z grobu i
// `execute` z `ok=true` w upkeep, main1 I end — restrykcja czasu istniała
// wyłącznie jako kara w heurystyce bota (`step !== 'upkeep' → finish(-100)`),
// więc człowiek/Żywy Tester/inny kontroler mógł aktywować kiedy chciał.
// CR 602.1b (tekst po dwukropku ograniczający czas aktywacji „functions at all
// times" i nie jest częścią efektu) + CR 602.5 („A player can't begin to
// activate an ability that's prohibited from being activated").
// ---------------------------------------------------------------------------

function necrosavantInGraveyard(state, controller = 'p1') {
  put(state, 'necro', 'necrosavant', controller, 'graveyard');
  put(state, 'fodder', 'river-herald-guide', controller);
  addMana(state, controller, 6, { colors: [] });
  addMana(state, controller, 4, { colors: ['B'] });
  return state.objects.get('necro');
}

test('Necrosavant: restrykcja „Activate only during your upkeep" jest deskryptorem zdolności, nie karą w bocie', () => {
  const ability = definition('necrosavant').abilities.find((a) => a.type === 'activated');
  assert.equal(ability.fromGraveyard, true, 'zdolność działa z grobu (CR 113.6)');
  assert.equal(ability.onlyInStep, 'upkeep', 'Oracle: „Activate only during your upkeep"');
  assert.deepEqual(ability.cost, { mana: 5, colors: ['B', 'B'], sacrificeCreature: true }, 'koszt {3}{B}{B} + poświęcenie stwora');
  assert.equal(ability.effect.type, 'reanimate_under_your_control', 'efekt z Oracle');
});

test('Necrosavant: w swoim upkeepie aktywacja jest oferowana i wraca kartę na pole bitwy', () => {
  const state = game(76, 'upkeep', 'p1');
  necrosavantInGraveyard(state);
  const offers = commands(state, 'p1').filter((c) => c.type === 'activate_ability' && c.objectId === 'necro');
  assert.equal(offers.length, 1, 'dokładnie jedna oferta aktywacji z grobu');
  assert.equal(execute(state, { ...offers[0], sacrificeCreatureId: 'fodder' }).ok, true, 'aktywacja przyjęta');
  resolveStack(state);
  const back = [...state.objects.values()].filter((o) => o.cardId === 'necrosavant');
  assert.equal(back.length, 1, 'karta wróciła jako jeden obiekt');
  assert.equal(back[0].zone, 'battlefield', 'Necrosavant jest na polu bitwy');
  assert.equal(back[0].controllerId, 'p1', 'wraca pod Twoją kontrolę');
  // Poświęcenie to zmiana strefy = nowy obiekt (CR 400.7), więc sprawdzamy cardId.
  assert.ok(state.zones.graveyard.some((id) => state.objects.get(id)?.cardId === 'river-herald-guide'),
    'poświęcony stwór trafił do grobu jako zapłata kosztu');
  assert.equal(state.zones.battlefield.includes('fodder'), false, 'poświęcony stwór opuścił pole bitwy');
});

test('Necrosavant: poza swoim upkeepem brak oferty, a komenda spoza oferty jest odrzucona (CR 602.5)', () => {
  for (const [step, priority, kto] of [['main', 'p1', 'własna faza główna'], ['end', 'p1', 'własny krok końcowy'],
    ['declare_attackers', 'p1', 'własna deklaracja atakujących'], ['upkeep', 'p2', 'upkeep przeciwnika']]) {
    const state = game(77, step, priority);
    necrosavantInGraveyard(state, 'p1');
    const offers = commands(state, 'p1').filter((c) => c.type === 'activate_ability' && c.objectId === 'necro');
    assert.equal(offers.length, 0, `${kto}: brak oferty aktywacji`);
    const forced = execute(state, {
      type: 'activate_ability', playerId: 'p1', objectId: 'necro', abilityIndex: 0, sacrificeCreatureId: 'fodder',
    });
    assert.equal(forced.ok, false, `${kto}: komenda spoza oferty odrzucona`);
    if (priority === 'p1') {
      assert.match(forced.reason ?? '', /upkeep/i, `${kto}: powód mówi o restrykcji kroku`);
    } else {
      // W upkeepie przeciwnika p1 nie ma nawet priorytetu (CR 117.1) — odrzucenie
      // następuje wcześniej niż bramka kroku, i to jest poprawna kolejność bramek.
      assert.match(forced.reason ?? '', /priority|upkeep/i, `${kto}: powód odrzucenia`);
    }
    const back = [...state.objects.values()].filter((o) => o.cardId === 'necrosavant' && o.zone === 'battlefield');
    assert.equal(back.length, 0, `${kto}: karta nie wróciła na pole bitwy`);
    assert.equal(state.zones.battlefield.includes('fodder'), true, `${kto}: koszt nie został zapłacony`);
  }
});

// ---------------------------------------------------------------------------
// F-6 (E2.6): Bladewheel Chariot — tył TDFC (Artifact — Vehicle 5/5) po craft.
// Oracle tyłu (snapshot `scryfall-spring-loaded-sawblades.json`): „Tap two other
// untapped artifacts you control: This Vehicle becomes an artifact creature
// until end of turn. // Crew 1 (…)".
// Pomiar audytu (sonda 6 §5 / sonda 5, stan 5df0e96): po poprawnie rozliczonym
// craft obiekt tyłu miał `abilities=0`, `keywords=[]` i OFERTY `[]` — Vehicle
// 5/5, który nigdy nie staje się stworem (CR 702.122a: „Crew is an activated
// ability of Vehicle cards"). Wpis tyłu nie miał żadnej zdolności w katalogu.
// ---------------------------------------------------------------------------

/**
 * Front Sawblades na polu bitwy, obrócony na tył przez craft (CR 702.167a).
 * Dokładnie JEDEN inny artefakt → wygnanie automatyczne (decyzja właściciela:
 * craft z jednym kandydatem nie otwiera modalu), więc transform jest
 * synchroniczny i test mierzy tył, nie decyzję wygnania.
 */
function chariotAfterCraft(state, controller = 'p1') {
  put(state, 'saw', 'spring-loaded-sawblades', controller);
  put(state, 'mat', 'spring-loaded-sawblades', controller);
  applyEffect(state, { type: 'craft_transform' }, state.objects.get('saw'), [], {});
  const id = state.zones.battlefield.find((oid) => state.objects.get(oid)?.cardId === 'bladewheel-chariot'
    && state.objects.get(oid)?.controllerId === controller);
  assert.ok(id, 'po craft tył DFC (Bladewheel Chariot) jest na polu bitwy');
  return id;
}

test('Bladewheel Chariot: tył ma obie zdolności z Oracle jako deskryptory (tap 2 artefakty + Crew 1)', () => {
  const back = definition('bladewheel-chariot');
  assert.equal(back.support?.status, 'back', 'wpis tyłu nie trafia do talii (ADR 0022)');
  assert.deepEqual(back.types, ['Artifact'], 'Artifact — Vehicle');
  assert.deepEqual(back.subtypes ?? [], ['Vehicle'], 'podtyp Vehicle');
  assert.equal(`${back.power}/${back.toughness}`, '5/5', 'P/T tyłu');
  const acts = (back.abilities ?? []).filter((a) => a.type === 'activated');
  assert.equal(acts.length, 2, 'dwa zdania Oracle tyłu = dwie zdolności aktywowane');
  const [tapTwo, crew] = acts;
  assert.deepEqual(tapTwo.cost, { tapOtherArtifacts: 2 },
    '„Tap two other untapped artifacts you control" — stała liczba, nie X');
  assert.equal(tapTwo.timing, 'instant', 'bez ograniczenia czasu aktywacji');
  assert.deepEqual(crew.cost, { crewPower: 1 }, '„Crew 1" tym samym deskryptorem co inne pojazdy (CR 702.122a)');
  assert.equal(crew.keyword ?? null, null,
    'crew wyraża `cost.crewPower` — jak pozostałe 4 pojazdy katalogu (jedno źródło, L41)');
  for (const ability of acts) {
    assert.deepEqual(ability.effect, { type: 'animate_permanent_until_end_of_turn', typesAdd: ['Creature'] },
      '„This Vehicle becomes an artifact creature until end of turn"');
  }
  // Źródło prawdy: twarz tylna w snapshocie Oracle (ADR 0022/0030, L57).
  const face = snapshot('spring-loaded-sawblades').card_faces.find((f) => f.name === back.name);
  assert.ok(face, 'twarz tylna w snapshocie');
  assert.match(face.oracle_text, /Tap two other untapped artifacts you control/, 'zdanie 1 Oracle');
  assert.match(face.oracle_text, /Crew 1/, 'zdanie 2 Oracle');
  assert.deepEqual(back.keywords ?? [], [],
    'keyword `crew` nie istnieje w języku deskryptorów — UI czyta `cost.crewPower` (F-6)');
});

test('Bladewheel Chariot: po craft obiekt tyłu niesie obie zdolności i obie są oferowane', () => {
  const state = game(91);
  const chariot = chariotAfterCraft(state);
  put(state, 'artA', 'spring-loaded-sawblades', 'p1');
  put(state, 'artB', 'spring-loaded-sawblades', 'p1');
  put(state, 'guide', 'river-herald-guide', 'p1'); // 3/1 → załoga dla Crew 1
  assert.equal((state.objects.get(chariot).abilities ?? []).length, 2,
    'transform przenosi zdolności tyłu na obiekt (payload `transformTo.abilities`)');
  const offers = commands(state, 'p1').filter((c) => c.type === 'activate_ability' && c.objectId === chariot);
  const tapOffer = offers.find((c) => c.abilityIndex === 0);
  assert.ok(tapOffer, 'oferta „tap two other untapped artifacts"');
  assert.equal(tapOffer.tapArtifactIds?.length, 2, 'default kosztu: dokładnie dwa artefakty (jak default załogi)');
  assert.deepEqual(tapOffer.tapArtifactIds, ['artA', 'artB'], 'default bierze inne własne nietapnięte artefakty');
  const crewOffer = offers.find((c) => c.abilityIndex === 1);
  assert.ok(crewOffer?.crewCreatureIds?.length >= 1, 'oferta Crew 1 z domyślną załogą');
});

test('Bladewheel Chariot: tap dwóch innych artefaktów robi z pojazdu artefakt-stwora 5/5 do końca tury', () => {
  const state = game(92);
  const chariot = chariotAfterCraft(state);
  put(state, 'artA', 'spring-loaded-sawblades', 'p1');
  put(state, 'artB', 'spring-loaded-sawblades', 'p1');
  const offer = commands(state, 'p1')
    .find((c) => c.type === 'activate_ability' && c.objectId === chariot && c.abilityIndex === 0);
  assert.ok(offer, 'oferta istnieje');
  assert.equal(execute(state, offer).ok, true, 'aktywacja przyjęta');
  resolveStack(state);
  const animated = state.objects.get(chariot);
  assert.deepEqual([...(animated.types ?? [])].sort(), ['Artifact', 'Creature'], 'artifact creature (typy, nie podmiana)');
  assert.equal(animated.kind, 'creature', 'rodzaj obiektu: stwór (może atakować i blokować)');
  assert.equal(pt(state, chariot), '5/5', 'drukowane 5/5 tyłu');
  for (const id of offer.tapArtifactIds) {
    assert.equal(state.objects.get(id).tapped, true, `koszt zapłacony: ${id} tapnięty`);
  }
  clearStatModifiers(state); // cleanup (CR 514.2): efekty „until end of turn" wygasają
  const after = state.objects.get(chariot);
  assert.deepEqual(after.types ?? [], ['Artifact'], 'animacja wygasa w cleanup');
  assert.equal(after.kind, 'artifact', 'z powrotem Vehicle-artefakt');
});

test('Bladewheel Chariot: koszt to DWA inne, nietapnięte, WŁASNE artefakty (CR 118.3, 602.5b)', () => {
  const state = game(93);
  const chariot = chariotAfterCraft(state);
  put(state, 'artA', 'spring-loaded-sawblades', 'p1');
  const onlyOne = commands(state, 'p1')
    .filter((c) => c.type === 'activate_ability' && c.objectId === chariot && c.abilityIndex === 0);
  assert.equal(onlyOne.length, 0, 'przy jednym innym artefakcie kosztu nie da się zapłacić — brak oferty');
  put(state, 'artB', 'spring-loaded-sawblades', 'p1');
  put(state, 'foeArt', 'spring-loaded-sawblades', 'p2');
  put(state, 'guide', 'river-herald-guide', 'p1'); // stwór, nie artefakt
  // Kontrola dodatnia: sama zdolność musi istnieć, inaczej każde odrzucenie
  // poniżej byłoby „zielone" z powodu braku zdolności, nie z powodu kosztu.
  assert.equal((state.objects.get(chariot).abilities ?? []).length, 2,
    'tył po craft ma obie zdolności (bez tego test mierzyłby pustkę)');
  tapped(state, 'artB');
  const nielegalne = [
    ['za mało artefaktów', ['artA']],
    ['pusty koszt', []],
    ['duplikat', ['artA', 'artA']],
    ['źródło w koszcie (Oracle: „other")', ['artA', chariot]],
    ['tapnięty artefakt', ['artA', 'artB']],
    ['artefakt przeciwnika', ['artA', 'foeArt']],
    ['stwór zamiast artefaktu', ['artA', 'guide']],
  ];
  for (const [powod, tapArtifactIds] of nielegalne) {
    const before = eventTypes(state).length;
    const result = execute(state, {
      type: 'activate_ability', playerId: 'p1', objectId: chariot, abilityIndex: 0, tapArtifactIds,
    });
    assert.equal(result.ok, false, `${powod}: komenda odrzucona`);
    assert.equal(state.objects.get('artA').tapped, false, `${powod}: odrzucona aktywacja niczego nie tapuje (CR 601.2h)`);
    assert.equal((state.objects.get(chariot).types ?? []).includes('Creature'), false,
      `${powod}: pojazd nie stał się stworem`);
    assert.equal(eventTypes(state).length, before, `${powod}: brak zdarzeń po odrzuceniu`);
  }
});

test('Bladewheel Chariot: Crew 1 wymaga łącznej mocy ≥ 1 — stwór 0/4 nie wystarczy (CR 702.122a)', () => {
  const state = game(94);
  const chariot = chariotAfterCraft(state);
  put(state, 'hatch', 'kraken-hatchling', 'p1'); // 0/4
  const crewOffers = commands(state, 'p1')
    .filter((c) => c.type === 'activate_ability' && c.objectId === chariot && c.abilityIndex === 1);
  assert.equal(crewOffers.length, 0, 'stwory o mocy 0 nie tworzą defaultu załogi (A3: tap za nic)');
  const forced = execute(state, {
    type: 'activate_ability', playerId: 'p1', objectId: chariot, abilityIndex: 1, crewCreatureIds: ['hatch'],
  });
  assert.equal(forced.ok, false, 'silnik re-waliduje podzbiór załogi (L48)');
  assert.match(forced.reason ?? '', /moc|crew/i, 'powód mówi o łącznej mocy');
  assert.equal(state.objects.get('hatch').tapped, false, 'odrzucona aktywacja nie tapuje załogi');
  put(state, 'guide', 'river-herald-guide', 'p1'); // 3/1
  const offer = commands(state, 'p1')
    .find((c) => c.type === 'activate_ability' && c.objectId === chariot && c.abilityIndex === 1);
  assert.ok(offer?.crewCreatureIds?.length >= 1, 'Crew 1 z 3/1 jest oferowane');
  assert.equal(execute(state, offer).ok, true, 'aktywacja przyjęta');
  resolveStack(state);
  assert.equal((state.objects.get(chariot).types ?? []).includes('Creature'), true, 'Crew 1 animuje pojazd');
  assert.equal(pt(state, chariot), '5/5', 'drukowane 5/5');
});

test('Bladewheel Chariot: bot liczy tap dwóch artefaktów jako koszt — tańsze Crew 1 wygrywa (F-6)', () => {
  // Wycena musi znać NOWY koszt: bez `artifactCost` mutacja przeżywała (L34),
  // a bot wolałby droższą aktywację. Scenariusz: okno walki przed deklaracją
  // atakujących (jedyne okno z dodatnią wyceną animacji, M408), pojazd 5/5 bez
  // choroby przywołania, dwa artefakty na koszt „tap two other" i stwór 1/1 na
  // Crew 1 (koszt załogi = moc 1 < 2 tapnięcia artefaktów).
  const state = game(95, 'beginning_of_combat', 'p1');
  const back = definition('bladewheel-chariot');
  addObject(state, {
    id: 'chariot', instanceId: 'instance-chariot', cardId: 'bladewheel-chariot', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'artifact', power: back.power, toughness: back.toughness,
    types: back.types, subtypes: back.subtypes ?? [], abilities: back.abilities ?? [], keywords: [],
  });
  for (const id of ['a0', 'a1']) {
    addObject(state, {
      id, instanceId: `instance-${id}`, cardId: 'angels-feather', controllerId: 'p1', ownerId: 'p1',
      zone: 'battlefield', kind: 'artifact', abilities: [], subtypes: [], types: ['Artifact'],
    });
  }
  addObject(state, {
    id: 'c1', instanceId: 'instance-c1', cardId: 'highland-game', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'creature', power: 1, toughness: 1, abilities: [], subtypes: [], types: ['Creature'],
  });
  for (const id of ['chariot', 'c1']) {
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  }
  const view = playerView(state, 'p1');
  const bot = createHeuristicBot({ seed: 1 });
  const pick = bot.chooseCommand(view, {});
  const trace = bot.trace()[0];
  const scoreOf = (index) => trace.options.find((o) => o.cmd === `activate_ability(chariot#${index})`)?.score;
  const pass = trace.options.find((o) => o.cmd === 'pass_priority')?.score ?? 0;
  assert.ok(Number.isFinite(scoreOf(0)), 'aktywacja „tap two other artifacts" jest w ofercie bota');
  assert.ok(Number.isFinite(scoreOf(1)), 'aktywacja Crew 1 jest w ofercie bota');
  assert.ok(scoreOf(0) > pass, `animacja za tap artefaktów powyżej passu (${scoreOf(0)} vs ${pass}) — anty-over-fix`);
  // Obie zdolności animują TO SAMO ciało 5/5 w tym samym oknie, więc ich wycena
  // może się różnić WYŁĄCZNIE kosztem: moc załogi 1 (stwór 1/1) kontra dwa
  // tapnięcia artefaktów. Bez wyceny animacji dla nowego kosztu (mutacja:
  // `ability?.cost?.tapOtherArtifacts` usunięte z gałęzi) tap dostawał gołą bazę
  // i różnica rosła do ~9 — pin łapie obie wady naraz (L34).
  const roznica = scoreOf(1) - scoreOf(0);
  assert.ok(roznica > 0 && roznica <= 2,
    `Crew 1 (koszt: moc 1) tańsze niż tap DWÓCH artefaktów (koszt 2), różnica = sama różnica kosztów: crew=${scoreOf(1)} vs tap=${scoreOf(0)}`);
  const command = pick?.command ?? pick;
  assert.equal(command?.abilityIndex, 1, `bot wybiera tańszą aktywację: ${JSON.stringify(command)}`);
});

// ---------------------------------------------------------------------------
// F-7 (E2.7): Leonin Lightbringer — „Ward {2}". Kwota dopłaty musi podróżować
// z danymi karty (rejestr → materialize → installDeck → obiekt), a nie być
// zgadywana: `wardAmountOf` miało fallback `object.ward ?? 2`, a ścieżka danych
// w ogóle nie niosła pola, więc mechanika działała wyłącznie dlatego, że ta
// karta ma drukowane {2}. CR 702.21a: „Ward is a triggered ability. Ward [cost]
// means ‘Whenever this permanent becomes the target of a spell or ability an
// opponent controls, counter that spell or ability unless that player pays
// [cost].'" — dopłaca kontroler CZARU (that player), nie kontroler permanentu.
// Ścieżkę danych pinuje test/audyt-pr185-f7-ward-sciezka-danych.test.js.
// ---------------------------------------------------------------------------

/**
 * p2 rzuca Shocka ({R}, 2 obrażenia, any target) w Leonina 3/2 i doprowadza do
 * rozstrzygnięcia triggera ward. `p2Extra` = mana p2 PONAD koszt rzutu: bez niej
 * dopłata jest niemożliwa i silnik kontruje automatycznie (CR 702.21a +
 * `producibleMana` w triggers.js — wybór bez alternatywy nie jest decyzją).
 */
function wardScena(state, { p2Extra = 0 } = {}) {
  put(state, 'leonin', 'leonin-lightbringer', 'p1');
  put(state, 'bolt', 'shock', 'p2', 'hand');
  addMana(state, 'p2', 1 + p2Extra, { colors: ['R'] });
  const cast = commands(state, 'p2')
    .find((c) => c.type === 'cast_spell' && c.objectId === 'bolt' && (c.targets ?? []).includes('leonin'));
  assert.ok(cast, 'Shock (any target) może celować w Leonina');
  assert.equal(execute(state, cast).ok, true, 'rzut przyjęty');
  assert.ok(eventTypes(state).includes('ability_triggered'), 'trigger ward wszedł na stos');
  return cast;
}

const leoninWGrobie = (state) => state.zones.graveyard
  .some((id) => state.objects.get(id)?.cardId === 'leonin-lightbringer');

/**
 * Rundy passów aż do OTWARCIA decyzji ward. Nie `resolveStack`: ten helper
 * bierze pierwszą komendę `resolve_*`, a `resolve_ward_pay_choice` też tak się
 * zaczyna — połknąłby decyzję, którą test ma zmierzyć.
 */
function doDecyzjiWard(state, limit = 8) {
  for (let i = 0; i < limit && !state.pendingWardPay; i += 1) {
    const pass = commands(state, state.turn.priorityPlayerId).find((c) => c.type === 'pass_priority');
    if (!pass || !execute(state, pass).ok) return;
  }
}

test('Leonin Lightbringer: ward {2} kontruje czar przeciwnika, który nie ma czym dopłacić (CR 702.21a)', () => {
  const state = game(96, 'main', 'p2');
  wardScena(state);
  resolveStack(state);
  assert.equal(state.pendingWardPay, null, 'bez many na dopłatę nie ma decyzji (wybór bez alternatywy)');
  assert.equal(eventTypes(state).includes('ward_choice_required'), false, 'brak oferty dopłaty');
  assert.ok(eventTypes(state).includes('spell_countered'), 'Shock skontrowany przez ward');
  assert.equal(state.objects.get('leonin')?.damage ?? 0, 0, 'Leonin bez obrażeń');
  assert.equal(leoninWGrobie(state), false, 'Leonin żyje');
});

test('Leonin Lightbringer: przeciwnik z maną dostaje decyzję dopłaty o kwocie Z DANYCH karty (CR 702.21a)', () => {
  const state = game(97, 'main', 'p2');
  wardScena(state, { p2Extra: 2 });
  doDecyzjiWard(state);
  const pending = state.pendingWardPay;
  assert.ok(pending, 'decyzja dopłaty jest otwarta');
  assert.equal(pending.playerId, 'p2', 'dopłaca kontroler czaru („unless that player pays")');
  assert.equal(pending.amount, definition('leonin-lightbringer').ward,
    'kwota pochodzi z danych karty (F-7: silnik niczego nie zgaduje)');
  assert.ok(eventTypes(state).includes('ward_choice_required'), 'zdarzenie decyzji ward');
  const offers = commands(state, 'p2').filter((c) => c.type === 'resolve_ward_pay_choice');
  assert.deepEqual(offers.map((c) => c.pay).sort(), [false, true], 'wybór: zapłać albo nie');
  assert.equal(execute(state, offers.find((c) => c.pay === true)).ok, true, 'dopłata przyjęta');
  resolveStack(state);
  assert.equal(eventTypes(state).includes('spell_countered'), false, 'opłacony czar NIE jest kontrowany');
  assert.equal(leoninWGrobie(state), true, '2 obrażenia w 3/2 są śmiertelne — Leonin w grobie (CR 704.5g)');
});

test('Leonin Lightbringer: odmowa dopłaty kontruje czar, choć mana była (CR 702.21a)', () => {
  const state = game(98, 'main', 'p2');
  wardScena(state, { p2Extra: 2 });
  doDecyzjiWard(state);
  assert.ok(state.pendingWardPay, 'decyzja otwarta');
  const refuse = commands(state, 'p2').find((c) => c.type === 'resolve_ward_pay_choice' && c.pay === false);
  assert.ok(refuse, 'oferta odmowy');
  assert.equal(execute(state, refuse).ok, true, 'odmowa przyjęta');
  resolveStack(state);
  assert.ok(eventTypes(state).includes('spell_countered'), 'Shock skontrowany');
  assert.equal(leoninWGrobie(state), false, 'Leonin żyje');
  assert.equal(state.objects.get('leonin')?.damage ?? 0, 0, 'bez obrażeń');
});

test('Leonin Lightbringer: WŁASNY czar nie odpala warda (CR 702.21a — „an opponent controls")', () => {
  const state = game(99, 'main', 'p1');
  put(state, 'leonin', 'leonin-lightbringer', 'p1');
  put(state, 'bolt', 'shock', 'p1', 'hand');
  addMana(state, 'p1', 1, { colors: ['R'] });
  const cast = commands(state, 'p1')
    .find((c) => c.type === 'cast_spell' && c.objectId === 'bolt' && (c.targets ?? []).includes('leonin'));
  assert.ok(cast, 'własny Shock może celować we własnego Leonina');
  assert.equal(execute(state, cast).ok, true, 'rzut przyjęty');
  resolveStack(state);
  assert.equal(state.pendingWardPay, null, 'brak decyzji dopłaty');
  assert.equal(eventTypes(state).includes('spell_countered'), false, 'czar się rozstrzyga');
  assert.equal(leoninWGrobie(state), true, '2 obrażenia w 3/2 — Leonin ginie bez ochrony warda');
});

// ---------------------------------------------------------------------------
// F-11 (E2.9): sanity/zachowanie czterech kart batcha, które nie miały własnej
// naprawy (Might Beyond Reason, Get the Point, River Herald Guide, Plummet).
// Audyt zmierzył, że batch 73 nie miał ŻADNEGO testu kart, a 6 z 7 sond
// mutacyjnych przeżywało; piny danych (koszt/typy/P/T/tekst kontra snapshoty
// Oracle) są na górze pliku — tu jest ZACHOWANIE: scenariusz legalny +
// nielegalny per karta (kryterium ukończenia planu batcha, commit #11).
// ---------------------------------------------------------------------------

/**
 * Rundy SAMYCH passów (bez komend `resolve_*`): decyzje blokujące — scry,
 * explore, ward — muszą zostać OTWARTE, bo to je mierzymy. `resolveStack`
 * bierze pierwszą komendę `resolve_*`, więc połknąłby decyzję (lekcja z F-7).
 */
function pasyBezDecyzji(state, limit = 14) {
  for (let i = 0; i < limit && state.zones.stack.length; i += 1) {
    const pass = commands(state, state.turn.priorityPlayerId).find((c) => c.type === 'pass_priority');
    if (!pass || !execute(state, pass).ok) return;
  }
}

const liczniki = (state, id) => state.objects.get(id)?.counters?.['+1/+1'] ?? 0;
const wGrobie = (state, cardId) => state.zones.graveyard
  .some((id) => state.objects.get(id)?.cardId === cardId);

/** Biblioteka p1 od wierzchu (`zones.library[0]` = wierzch). */
function biblioteka(state, cardIds) {
  cardIds.forEach((cardId, i) => put(state, `lib-${i}`, cardId, 'p1', 'library'));
}

// === Might Beyond Reason (645, SOI) — „Put two +1/+1 counters on target
// creature. Delirium — Put three +1/+1 counters on that creature instead if
// there are four or more card types among cards in your graveyard." ===

test('Might Beyond Reason: „three instead" to dwa efekty licznikowe, a delirium jest warunkiem drugiego (CR 207.2c)', () => {
  const spell = definition('might-beyond-reason').spell;
  assert.deepEqual(spell.targets, [{ type: 'creature' }], 'cel: stwór (dowolny, także własny)');
  assert.deepEqual(spell.effects, [
    { type: 'add_counter', counter: '+1/+1', amount: 2 },
    { type: 'add_counter', counter: '+1/+1', amount: 1, condition: { delirium: true } },
  ], '„two … three instead" = 2 + warunkowy 1: słowo zdolności jest warunkiem EFEKTU, nie osobną gałęzią');
  assert.equal(spell.timing, 'instant', 'Instant (Oracle)');
});

/** Scena MBR: cel na polu, grób o zadanych typach, mana {3}{G}, czar w ręce. */
function mbrScena(state, { graveyard, cel = 'river-herald-guide' }) {
  put(state, 'cel', cel, 'p1');
  ready(state, 'cel');
  put(state, 'mbr', 'might-beyond-reason', 'p1', 'hand');
  graveyard.forEach((cardId, i) => put(state, `gy-${i}`, cardId, 'p1', 'graveyard'));
  addMana(state, 'p1', 3);
  addMana(state, 'p1', 1, { colors: ['G'] });
  const cast = commands(state, 'p1').find((c) => c.type === 'cast_spell' && c.objectId === 'mbr');
  assert.ok(cast, 'MBR jest oferowany (cel legalny)');
  assert.equal(execute(state, cast).ok, true, 'rzut przyjęty');
  pasyBezDecyzji(state);
  return state;
}

test('Might Beyond Reason: bez delirium dwa liczniki — River Herald Guide 3/1 → 5/3', () => {
  const state = mbrScena(game(780), { graveyard: ['plummet', 'river-herald-guide', 'unbreakable-bond'] });
  assert.equal(liczniki(state, 'cel'), 2, 'trzy typy kart w grobie to za mało na delirium');
  assert.equal(pt(state, 'cel'), '5/3', 'dwa liczniki +1/+1');
});

test('Might Beyond Reason: delirium (cztery lub więcej TYPÓW kart w grobie) daje trzy liczniki — 3/1 → 6/4', () => {
  const state = mbrScena(game(781), {
    graveyard: ['plummet', 'river-herald-guide', 'unbreakable-bond', 'basic-plains', 'setons-desire'],
  });
  assert.equal(liczniki(state, 'cel'), 3, 'pięć typów: Instant, Creature, Sorcery, Land, Enchantment');
  assert.equal(pt(state, 'cel'), '6/4', 'trzy liczniki +1/+1');
});

test('Might Beyond Reason: CZTERY karty jednego typu to NIE delirium — liczy typy, nie sztuki', () => {
  const state = mbrScena(game(782), { graveyard: ['plummet', 'shock', 'get-the-point', 'might-beyond-reason'] });
  const typyWGrobie = new Set(state.zones.graveyard.flatMap((id) => state.objects.get(id)?.types ?? []));
  assert.deepEqual([...typyWGrobie], ['Instant'], 'warunek testu: wszystkie karty w grobie (4 + rozstrzygnięty MBR) to Instanty');
  assert.equal(liczniki(state, 'cel'), 2, 'wszystkie to Instanty — jeden typ, więc dwa liczniki');
  assert.equal(pt(state, 'cel'), '5/3');
});

test('Might Beyond Reason: delirium jest liczone PRZY ROZSTRZYGNIĘCIU, nie przy rzucaniu (CR 608.2)', () => {
  const state = game(783);
  put(state, 'cel', 'river-herald-guide', 'p1');
  ready(state, 'cel');
  put(state, 'mbr', 'might-beyond-reason', 'p1', 'hand');
  put(state, 'plains-in-hand', 'basic-plains', 'p1', 'hand');
  // Przy rzucie trzy typy (za mało), w oknie odpowiedzi dochodzi czwarty.
  ['plummet', 'river-herald-guide', 'unbreakable-bond'].forEach((cardId, i) => put(state, `gy-${i}`, cardId, 'p1', 'graveyard'));
  addMana(state, 'p1', 3);
  addMana(state, 'p1', 1, { colors: ['G'] });
  const cast = commands(state, 'p1').find((c) => c.type === 'cast_spell' && c.objectId === 'mbr');
  assert.equal(execute(state, cast).ok, true, 'rzut przyjęty');
  assert.equal(state.zones.stack.length, 1, 'czar na stosie (okno odpowiedzi)');
  moveObjectDirectly(state, 'plains-in-hand', 'graveyard', 'gy-dorzucony');
  pasyBezDecyzji(state);
  assert.equal(liczniki(state, 'cel'), 3, 'czwarty typ doszedł w oknie → trzy liczniki (CR 608.2)');
  assert.equal(pt(state, 'cel'), '6/4');
});

test('Might Beyond Reason: bez stwora brak oferty, a wymuszony rzut jest odrzucony (CR 115.1b/601.2c)', () => {
  const state = game(784);
  put(state, 'mbr', 'might-beyond-reason', 'p1', 'hand');
  put(state, 'land', 'basic-plains', 'p1');
  addMana(state, 'p1', 3);
  addMana(state, 'p1', 1, { colors: ['G'] });
  const oferty = commands(state, 'p1').filter((c) => c.type === 'cast_spell' && c.objectId === 'mbr');
  assert.equal(oferty.length, 0, 'ląd nie jest stworem — brak legalnego celu, brak oferty');
  const wymuszony = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'mbr', targets: ['land'] });
  assert.equal(wymuszony.ok, false, 'komenda spoza oferty odrzucona');
  assert.match(wymuszony.reason ?? '', /cel|illegal/i, `powód mówi o celu: ${wymuszony.reason}`);
  assert.equal(state.zones.hand.includes('mbr'), true, 'odrzucona komenda niczego nie rusza — czar zostaje w ręce');
});

// === Get the Point (647, RNA) — „Destroy target creature. Scry 1." ===

test('Get the Point: deskryptor niesie OBA zdania Oracle — zniszczenie i scry 1', () => {
  const spell = definition('get-the-point').spell;
  assert.deepEqual(spell.targets, [{ type: 'creature' }], 'cel: stwór');
  assert.deepEqual(spell.effects, [{ type: 'destroy_permanent' }, { type: 'scry', amount: 1 }],
    '„Destroy target creature. Scry 1." — dwa efekty, drugi nie może zniknąć');
});

test('Get the Point: niszczy stwora i OTWIERA decyzję scry, która blokuje inne działania (CR 701.22a)', () => {
  const state = game(785);
  put(state, 'foe', 'rustwing-falcon', 'p2');
  put(state, 'gtp', 'get-the-point', 'p1', 'hand');
  biblioteka(state, ['basic-plains', 'shock', 'plummet', 'river-herald-guide']);
  addMana(state, 'p1', 3);
  addMana(state, 'p1', 2, { colors: ['B'] });
  const cast = commands(state, 'p1').find((c) => c.type === 'cast_spell' && c.objectId === 'gtp');
  assert.ok(cast, 'oferta rzutu z celem w stwora przeciwnika');
  assert.equal(execute(state, cast).ok, true);
  pasyBezDecyzji(state);
  assert.ok(wGrobie(state, 'rustwing-falcon'), 'cel zniszczony (CR 704.5g — w grobie jako karta)');
  assert.ok(state.pendingScry, 'scry 1 otwiera decyzję (nie dzieje się po cichu)');
  assert.deepEqual(state.pendingScry.objectIds, ['lib-0'], 'przeglądana jest dokładnie jedna karta z wierzchu');
  assert.equal(execute(state, { type: 'pass_priority', playerId: 'p1' }).reason, 'scry_unresolved',
    'dopóki decyzja scry nie jest rozstrzygnięta, inne komendy są odrzucane');
  assert.equal(execute(state, { type: 'resolve_scry', playerId: 'p1', bottomIds: ['lib-0'] }).ok, true,
    'wybór „na spód" przyjęty');
  assert.deepEqual(state.zones.library.map((id) => state.objects.get(id).cardId),
    ['shock', 'plummet', 'river-herald-guide', 'basic-plains'],
    'karta z wierzchu wędruje na spód, reszta zachowuje kolejność (CR 701.22a)');
  assert.equal(state.pendingScry, null, 'decyzja zamknięta');
});

test('Get the Point: nie celuje w nic poza stworem — ląd i gracz nie mają oferty (CR 115.1b)', () => {
  const state = game(786);
  put(state, 'land', 'basic-plains', 'p2');
  put(state, 'gtp', 'get-the-point', 'p1', 'hand');
  addMana(state, 'p1', 3);
  addMana(state, 'p1', 2, { colors: ['B'] });
  const oferty = commands(state, 'p1').filter((c) => c.type === 'cast_spell' && c.objectId === 'gtp');
  assert.equal(oferty.length, 0, 'brak stwora = brak legalnego celu = brak oferty');
  for (const cel of ['land', 'p2']) {
    const wymuszony = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'gtp', targets: [cel] });
    assert.equal(wymuszony.ok, false, `cel ${cel} odrzucony`);
    assert.match(wymuszony.reason ?? '', /cel|illegal/i, `powód mówi o celu: ${wymuszony.reason}`);
  }
  assert.equal(state.pendingScry, null, 'bez rzutu nie ma też scry');
});

// === River Herald Guide (652, LCI) — „Vigilance // When this creature enters,
// it explores." (3/1 za {2}{G}) ===

test('River Herald Guide: vigilance to keyword, a ETB to deskryptor explore bez celu („it explores")', () => {
  const card = definition('river-herald-guide');
  assert.deepEqual(card.keywords, ['vigilance'], 'Vigilance z Oracle');
  assert.equal(card.power, 3, '3/1 (snapshot Oracle)');
  assert.equal(card.toughness, 1);
  const [trigger] = card.abilities;
  assert.equal(trigger.type, 'triggered');
  assert.deepEqual(trigger.trigger, { event: 'enter_battlefield' }, '„When this creature enters"');
  assert.deepEqual(trigger.effect, { type: 'explore' }, '„it explores" — eksploruje ŹRÓDŁO, nie wybrany cel');
  assert.equal(trigger.targets, null, 'zdolność nie celuje (CR 701.44a: licznik idzie na eksplorujący permanent)');
});

test('River Herald Guide: vigilance — atakuje i zostaje odkręcony (CR 702.20)', () => {
  const state = game(787, 'declare_attackers', 'p1');
  put(state, 'guide', 'river-herald-guide', 'p1');
  put(state, 'leonin', 'leonin-lightbringer', 'p1');
  ready(state, 'guide');
  ready(state, 'leonin');
  assert.equal(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['guide', 'leonin'] }).ok, true,
    'atak obu stworów legalny');
  assert.equal(state.objects.get('guide').tapped, false, 'vigilance: atak nie tapuje (CR 702.20)');
  assert.equal(state.objects.get('leonin').tapped, true, 'kontrola: stwór bez vigilance tapuje (CR 508.1f)');
});

/** RHG rzucony z ręki przy bibliotece `top` — zwraca id obiektu na polu bitwy. */
function guideWchodzi(state, top) {
  biblioteka(state, top);
  put(state, 'guide', 'river-herald-guide', 'p1', 'hand');
  addMana(state, 'p1', 2);
  addMana(state, 'p1', 1, { colors: ['G'] });
  const cast = commands(state, 'p1').find((c) => c.type === 'cast_permanent' && c.objectId === 'guide');
  assert.ok(cast, 'stwór z ręki jest oferowany jako cast_permanent');
  assert.equal(execute(state, cast).ok, true, 'rzut przyjęty');
  pasyBezDecyzji(state);
  const naPolu = state.zones.battlefield.find((id) => state.objects.get(id)?.cardId === 'river-herald-guide');
  assert.ok(naPolu, 'Guide wszedł na pole bitwy');
  return naPolu;
}

test('River Herald Guide: explore z LĄDEM na wierzchu — ląd do ręki, bez licznika i bez decyzji (CR 701.44a)', () => {
  const state = game(788);
  const guide = guideWchodzi(state, ['basic-plains', 'shock', 'plummet']);
  assert.equal(state.pendingExplore, null, 'gałąź lądu nie otwiera decyzji');
  assert.ok(eventTypes(state).includes('card_revealed'), 'odsłonięcie karty jest w logu');
  assert.ok(state.zones.hand.some((id) => state.objects.get(id)?.cardId === 'basic-plains'),
    'odsłonięty ląd trafia do ręki (CR 701.44a)');
  assert.equal(liczniki(state, guide), 0, 'ląd na wierzchu = brak licznika +1/+1');
  assert.equal(pt(state, guide), '3/1', 'ciało bez zmian');
  assert.deepEqual(state.zones.library.map((id) => state.objects.get(id).cardId), ['shock', 'plummet'],
    'ląd opuścił bibliotekę');
});

test('River Herald Guide: explore z NIE-LĄDEM — licznik +1/+1 na Guide i decyzja wierzch/grób (CR 701.44a)', () => {
  // F-19 (znalezisko E2.9): efekt `explore` brał licznik z `targets[0]`, a ETB
  // Guide'a NIE celuje („it explores") — więc licznik nie trafiał nigdzie
  // (zmierzone: `counters: {}`, P/T 3/1 po explore). CR 701.44a: „Otherwise,
  // that player puts a +1/+1 counter on the exploring permanent" — eksplorujący
  // permanent to ŹRÓDŁO zdolności, gdy efekt nie ma celu.
  const state = game(789);
  const guide = guideWchodzi(state, ['shock', 'plummet', 'basic-plains']);
  assert.ok(state.pendingExplore, 'nie-ląd otwiera decyzję „wierzch albo grób"');
  assert.equal(state.pendingExplore.cardId, 'shock', 'odsłonięta karta');
  assert.equal(state.pendingExplore.sourceCardId, 'river-herald-guide', 'decyzja nazywa źródło eksploracji (zgłoszenie H)');
  assert.equal(liczniki(state, guide), 1, 'licznik +1/+1 NA EKSPLORUJĄCYM PERMANENCIE (F-19)');
  assert.equal(pt(state, guide), '4/2', '3/1 + licznik = 4/2');
  const oferty = commands(state, 'p1').filter((c) => c.type === 'resolve_explore_choice');
  assert.deepEqual(oferty.map((c) => c.putInGraveyard).sort(), [false, true], 'wybór: wierzch albo grób');
  assert.equal(execute(state, { type: 'resolve_explore_choice', playerId: 'p2', putInGraveyard: true }).reason,
    'explore_not_your_decision', 'decyzja należy do kontrolera eksploracji');
  assert.equal(execute(state, { type: 'resolve_explore_choice', playerId: 'p1', putInGraveyard: false }).ok, true,
    'wybór „na wierzch" przyjęty');
  assert.deepEqual(state.zones.library.map((id) => state.objects.get(id).cardId), ['shock', 'plummet', 'basic-plains'],
    'karta zostaje na wierzchu biblioteki');
  assert.equal(state.zones.graveyard.length, 0, 'nic nie trafiło do grobu');
  assert.equal(liczniki(state, guide), 1, 'licznik zostaje po decyzji (CR 701.44a — licznik przed wyborem karty)');
});

test('River Herald Guide: explore z nie-lądem — wybór „do grobu" miele odsłoniętą kartę', () => {
  const state = game(790);
  const guide = guideWchodzi(state, ['shock', 'plummet', 'basic-plains']);
  assert.ok(state.pendingExplore, 'decyzja otwarta');
  assert.equal(execute(state, { type: 'resolve_explore_choice', playerId: 'p1', putInGraveyard: true }).ok, true);
  assert.ok(wGrobie(state, 'shock'), 'odsłonięty Shock w grobie');
  assert.deepEqual(state.zones.library.map((id) => state.objects.get(id).cardId), ['plummet', 'basic-plains'],
    'karta opuściła bibliotekę');
  assert.equal(liczniki(state, guide), 1, 'licznik niezależny od wyboru karty');
  assert.equal(state.pendingExplore, null, 'decyzja zamknięta');
});

test('River Herald Guide: explore przy PUSTEJ bibliotece i tak daje licznik (CR 701.44a/b)', () => {
  // „If a land card is revealed this way" jest fałszywe, gdy nic nie odsłonięto,
  // więc działa gałąź „Otherwise … +1/+1 counter"; permanent i tak „explores"
  // (CR 701.44b — nawet gdy część kroków była niemożliwa). Pin audytu PR #134
  // mierzył to dla Guidestone Compass (explore z CELEM); tu jest ta sama reguła
  // dla źródła bez celu (F-19).
  const state = game(791);
  const guide = guideWchodzi(state, []);
  assert.equal(state.pendingExplore, null, 'nie ma czego odsłonić → brak decyzji');
  assert.equal(liczniki(state, guide), 1, 'licznik +1/+1 na Guide (F-19)');
  assert.equal(pt(state, guide), '4/2');
});

// === Plummet (655, M20) — „Destroy target creature with flying." ===

test('Plummet: niszczy stwora z lataniem (scenariusz legalny)', () => {
  const state = game(792);
  put(state, 'falcon', 'rustwing-falcon', 'p2');
  put(state, 'plummet', 'plummet', 'p1', 'hand');
  addMana(state, 'p1', 1);
  addMana(state, 'p1', 1, { colors: ['G'] });
  const oferty = commands(state, 'p1').filter((c) => c.type === 'cast_spell' && c.objectId === 'plummet');
  assert.equal(oferty.length, 1, 'dokładnie jeden legalny cel (stwór z flying)');
  assert.deepEqual(oferty[0].targets, ['falcon']);
  assert.equal(execute(state, oferty[0]).ok, true, 'rzut przyjęty');
  pasyBezDecyzji(state);
  assert.equal(state.zones.battlefield.includes('falcon'), false, 'Falcon zszedł z pola');
  assert.ok(wGrobie(state, 'rustwing-falcon'), 'zniszczony stwór w grobie właściciela (CR 704.5g + 108.3)');
});

test('Plummet: stwór BEZ latania nie jest legalnym celem (CR 115.1b/601.2c)', () => {
  const state = game(793);
  put(state, 'guide', 'river-herald-guide', 'p2'); // 3/1, vigilance — bez flying
  put(state, 'plummet', 'plummet', 'p1', 'hand');
  addMana(state, 'p1', 1);
  addMana(state, 'p1', 1, { colors: ['G'] });
  assert.equal(commands(state, 'p1').filter((c) => c.type === 'cast_spell' && c.objectId === 'plummet').length, 0,
    'brak legalnego celu → brak oferty');
  const wymuszony = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'plummet', targets: ['guide'] });
  assert.equal(wymuszony.ok, false, 'wymuszony rzut odrzucony');
  assert.match(wymuszony.reason ?? '', /flying/i, `powód nazywa brakujący keyword: ${wymuszony.reason}`);
  assert.equal(state.zones.battlefield.includes('guide'), true, 'cel nietknięty');
});

test('Plummet: cel, który STRACIŁ latanie przed rozstrzygnięciem, unieważnia czar (CR 608.2b)', () => {
  const state = game(794);
  put(state, 'falcon', 'rustwing-falcon', 'p2');
  put(state, 'plummet', 'plummet', 'p1', 'hand');
  addMana(state, 'p1', 1);
  addMana(state, 'p1', 1, { colors: ['G'] });
  const cast = commands(state, 'p1').find((c) => c.type === 'cast_spell' && c.objectId === 'plummet');
  assert.equal(execute(state, cast).ok, true, 'rzut w latającego Falcona przyjęty');
  const falcon = state.objects.get('falcon');
  state.objects.set('falcon', Object.freeze({ ...falcon, keywords: [], lostKeywordsUntilEOT: ['flying'] }));
  pasyBezDecyzji(state);
  const resolved = state.events.filter((e) => e.type === 'spell_resolved').at(-1);
  assert.equal(resolved?.fizzled, true, 'wszystkie wybrane cele nielegalne → czar się nie rozstrzyga');
  assert.equal(state.zones.battlefield.includes('falcon'), true, 'Falcon przeżył (efekt nie zaszedł)');
  assert.ok(wGrobie(state, 'plummet'), 'Plummet schodzi z gry do grobu jak każdy rozstrzygany/kontrowany instant');
});

test('River Herald Guide: explore rozstrzyga się po śmierci Guide’a, ale licznik nie trafia na nie-permanent (CR 122.1)', () => {
  // Trigger explore nie ma intervening-if, więc wchodzi na stos i rozstrzyga się
  // nawet bez źródła (CR 603.3/608.2b — „last known information"), ale liczniki
  // istnieją tylko na permanentach (CR 122.1): eksplorujący permanent, który
  // zszedł z pola, nie dostaje +1/+1. Zmiana strefy tworzy NOWY obiekt (CR 400.7),
  // więc stary id nie jest już permanentem — bramka strefy w efekcie explore.
  const state = game(796);
  biblioteka(state, ['shock', 'plummet']);
  put(state, 'guide', 'river-herald-guide', 'p1', 'hand');
  addMana(state, 'p1', 2);
  addMana(state, 'p1', 1, { colors: ['G'] });
  const cast = commands(state, 'p1').find((c) => c.type === 'cast_permanent' && c.objectId === 'guide');
  assert.equal(execute(state, cast).ok, true, 'rzut przyjęty');
  const krok = () => {
    const pass = commands(state, state.turn.priorityPlayerId).find((c) => c.type === 'pass_priority');
    return pass ? execute(state, pass).ok : false;
  };
  krok();
  krok();
  const naPolu = state.zones.battlefield.find((id) => state.objects.get(id)?.cardId === 'river-herald-guide');
  assert.ok(naPolu, 'Guide wszedł, a jego trigger explore jest na stosie');
  assert.equal(state.zones.stack.length, 1, 'trigger czeka na rozstrzygnięcie (okno odpowiedzi)');
  applyEffect(state, { type: 'destroy_permanent' }, { id: 'src', controllerId: 'p2', cardId: 'shock' }, [naPolu]);
  assert.ok(wGrobie(state, 'river-herald-guide'), 'Guide zniszczony w oknie odpowiedzi');
  for (let i = 0; i < 8 && state.zones.stack.length; i += 1) krok();
  assert.ok(eventTypes(state).includes('card_revealed'), 'odsłonięcie i tak zaszło (trigger bez intervening-if)');
  assert.ok(state.pendingExplore, 'decyzja „wierzch albo grób" nadal należy do kontrolera');
  assert.equal(state.events.filter((e) => e.type === 'counter_added').length, 0,
    'żaden licznik nie został położony (CR 122.1 — liczniki tylko na permanentach)');
});
