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
import { effectivePower, effectiveToughness, staticConditionHolds } from '../src/engine/permanents.js';
import { attachAuraToCreature, attachEquipmentToCreature } from '../src/engine/attachments.js';
import { blockerSeedAssignments, blockCandidatePool, mandatoryBlockerIds, minimalMandatoryBlocks } from '../src/engine/combat.js';
import { moveObjectDirectly } from '../src/engine/objects.js';

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
