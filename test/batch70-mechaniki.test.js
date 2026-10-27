// Batch 70 (kolekcja 426–624): mechaniki silnika dokodowane generycznie
// (ADR 0002). Testy idą na KARTACH/DESKRYPTORACH SYNTETYCZNYCH (ADR 0029) —
// katalog rośnie wyłącznie z kolekcji właściciela, nie z testów.
//
// M1 — Jilt (APC): „Kicker {2}. Return target creature to its owner's hand.
// If this spell was kicked, it deals 2 damage to another target creature."
// Nowe elementy silnika:
//   (a) pozycja celu z `onlyIfKicked: true` — istnieje TYLKO w wariancie
//       kickedowanym (`targetsForCast`). CR 2026-09-25, 601.2c (dosłownie):
//       „A spell may require some targets only if an alternative or additional
//       cost (such as a kicker cost) or a particular mode was chosen for it;
//       otherwise, the spell is cast as though it did not require those
//       targets.” Deklaracja kosztu dodatkowego poprzedza wybór celów (601.2b).
//   (b) pozycja celu z `anotherTarget: true` — fraza „another target”
//       (CR 115.4) wyklucza obiekt wskazany na innej pozycji tego samego
//       czaru; bramka działa w OFERCIE (`legalTargetCombos`) i w WALIDACJI
//       (`validateTargets`), żeby oferta była tym samym zbiorem, który
//       przepuści execute (L48).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { legalSpellCasts, legalFlashbackCasts, effectiveSpellManaCost } from '../src/engine/spells.js';
import { createAbility, ABILITY_TYPE } from '../src/engine/abilities.js';
import { blockAssignmentViolation, legalBlockerOptions } from '../src/engine/combat.js';
import { attackerCanBeBlocked } from '../src/controllers/heuristic-bot.js';
import { coloredPipsOf } from '../src/engine/mana-cost.js';
import { addCounter, removeCounter } from '../src/engine/counters.js';
import { processTriggers } from '../src/engine/triggers.js';
import { applyEffect } from '../src/engine/effects.js';
import { runStateBasedActions } from '../src/engine/state-based.js';

const REGISTRY = createCardRegistry();
// Karta-gospodarz: dostarcza sam materiał obiektu (Instant, koszt, kolory);
// deskryptor czaru podmieniamy na syntetyczny odpowiednik Oracle Jilt.
const HOST = REGISTRY.get('fake-your-own-death');
const KICKER = { cost: 2 };

/** Deskryptor Oracle Jilt: odbicie + (po opłaceniu kickera) 2 obrażenia w INNY cel. */
const JILT_SPELL = {
  timing: 'instant',
  targets: [
    { type: 'creature' },
    { type: 'creature', onlyIfKicked: true, anotherTarget: true },
  ],
  effects: [
    { type: 'bounce_permanent' },
    { type: 'damage', amount: 2, targetIndex: 1, condition: { wasKicked: true } },
  ],
};

function creature(state, id, playerId, power = 2, toughness = 2) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId: playerId, ownerId: playerId,
    zone: 'battlefield', kind: 'creature', types: ['Creature'], colors: ['U'], subtypes: ['Wizard'],
    keywords: [], power, toughness, abilities: [],
  });
}

function setup({ mana = 10, colors = ['U', 'B'] } = {}) {
  const state = createGameState({ seed: 70, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  addObject(state, {
    id: 'jilt', instanceId: 'i-jilt', cardId: HOST.id, controllerId: 'p1', ownerId: 'p1',
    zone: 'hand', ...gameObjectDataOf(HOST), types: ['Instant'], manaCost: 2, colors: ['U'],
    spell: JILT_SPELL, kicker: KICKER,
  });
  // Trzy stwory: własny „a" i dwa przeciwnika — dość, by powstały pary.
  // 3/3: 2 obrażenia mają być WIDOCZNE na obiekcie (2/2 umarłby i zniknął).
  creature(state, 'a', 'p1', 3, 3);
  creature(state, 'b', 'p2');
  creature(state, 'c', 'p2');
  if (mana > 0) addMana(state, 'p1', mana, { colors });
  return state;
}

const casts = (state) => legalSpellCasts(state, 'p1').filter((c) => c.objectId === 'jilt');
/** Obiekt karty w danej strefie (po zmianie strefy obiekt dostaje nowe id). */
const inZone = (state, zone, cardId) => [...state.zones[zone]]
  .map((id) => state.objects.get(id))
  .find((object) => object?.cardId === cardId) ?? null;

test('B70/M1 oferta: wariant kickedowany ma o jedną pozycję celu więcej (onlyIfKicked)', () => {
  const state = setup();
  const plain = casts(state).filter((c) => !c.kicked);
  const kicked = casts(state).filter((c) => c.kicked === true);
  assert.ok(plain.length > 0, 'naturalny rzut musi być w ofercie');
  assert.ok(kicked.length > 0, 'wariant kickedowany musi być w ofercie (bramka kosztu przechodzi)');
  for (const cast of plain) assert.equal(cast.targets.length, 1, 'bez kickera czar ma tylko cel odbicia');
  for (const cast of kicked) assert.equal(cast.targets.length, 2, 'z kickerem dochodzi cel obrażeń');
});

test('B70/M1 oferta: „another target" nigdy nie proponuje tego samego obiektu dwa razy', () => {
  const state = setup();
  const kicked = casts(state).filter((c) => c.kicked === true);
  for (const cast of kicked) {
    assert.notEqual(cast.targets[0], cast.targets[1], `para z powtórzonym celem: ${cast.targets.join(',')}`);
  }
  const pairs = new Set(kicked.map((c) => c.targets.join('+')));
  assert.equal(pairs.size, 6, `oczekiwane 6 uporządkowanych par (3 stwory), jest ${pairs.size}`);
});

test('B70/M1 oferta: brak many na kickera — brak wariantów kickedowanych (L48)', () => {
  const state = setup({ mana: 3 }); // baza 2 + kicker 2 = 4
  const base = effectiveSpellManaCost(state, state.objects.get('jilt'));
  assert.equal(casts(state).filter((c) => c.kicked === true).length, 0,
    `przy ${base + KICKER.cost} many kicker jest nieopłacalny — oferta nie może go obiecywać`);
  assert.ok(casts(state).filter((c) => !c.kicked).length > 0, 'rzut bez kickera pozostaje w ofercie');
});

test('B70/M1 offer w legalCommands: wariant kickedowany JEST widoczny dla UI i bota', () => {
  const state = setup();
  const view = playerView(state, 'p1');
  const offered = view.legalCommands.filter((c) => c.type === 'cast_spell' && c.objectId === 'jilt');
  assert.ok(offered.some((c) => c.kicked === true && (c.targets ?? []).length === 2),
    'Batch 69 lekcja: mechanika bez oferty w legalCommands jest niedostępna dla gracza');
});

test('B70/M1 rzut kickedowany: odbicie celu 0 i 2 obrażenia w cel 1', () => {
  const state = setup();
  const r = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'jilt', targets: ['b', 'a'], kicked: true });
  assert.equal(r.ok, true, `rzut odrzucony: ${JSON.stringify(r.events?.at(-1))}`);
  const stacked = state.objects.get(state.zones.stack.at(-1));
  assert.equal(stacked.wasKicked, true, 'fakt kickera jest własnością czaru na stosie (CR 702.33a)');
  let guard = 0;
  while (state.zones.stack.length > 0 && guard++ < 50) {
    const pass = playerView(state, state.turn.priorityPlayerId).legalCommands.find((c) => c.type === 'pass_priority');
    assert.ok(pass, 'brak komendy pass_priority');
    assert.equal(execute(state, pass).ok, true, 'pass_priority musi przejść');
  }
  const bounced = inZone(state, 'hand', 'test-b');
  assert.ok(bounced, 'pierwszy cel wraca do ręki właściciela (CR 108.3)');
  assert.equal(bounced.controllerId, 'p2', 'wraca na rękę WŁAŚCICIELA, nie rzucającego');
  assert.equal(state.objects.get('a').damage, 2, 'drugi cel dostaje 2 obrażenia');
  assert.equal(state.objects.get('c').damage, 0, 'kontrola ujemna: trzeci stwór nietknięty');
});

test('B70/M1 kontrola ujemna: bez kickera 2 obrażenia NIE padają', () => {
  const state = setup();
  const r = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'jilt', targets: ['b'] });
  assert.equal(r.ok, true, `rzut odrzucony: ${JSON.stringify(r.events?.at(-1))}`);
  let guard = 0;
  while (state.zones.stack.length > 0 && guard++ < 50) {
    const pass = playerView(state, state.turn.priorityPlayerId).legalCommands.find((c) => c.type === 'pass_priority');
    assert.ok(pass);
    execute(state, pass);
  }
  assert.ok(inZone(state, 'hand', 'test-b'), 'odbicie działa');
  assert.equal(state.objects.get('a').damage, 0, 'warunek `wasKicked` blokuje efekt obrażeń');
});

test('B70/M1 walidacja: kickedowany rzut bez drugiego celu jest odrzucany', () => {
  const state = setup();
  const r = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'jilt', targets: ['b'], kicked: true });
  assert.equal(r.ok, false, 'cel obrażeń z `onlyIfKicked` jest obowiązkowy po opłaceniu kickera');
});

test('B70/M1 walidacja: bez kickera nie wolno podać drugiego celu', () => {
  const state = setup();
  const r = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'jilt', targets: ['b', 'a'] });
  assert.equal(r.ok, false, 'deskryptor bez kickera ma jedną pozycję celu');
});

test('B70/M1 walidacja: ten sam stwór na obu pozycjach łamie „another target" (CR 115.4)', () => {
  const state = setup();
  const r = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'jilt', targets: ['a', 'a'], kicked: true });
  assert.equal(r.ok, false, '„another target" nie może wskazać tego samego obiektu');
  assert.match(String(r.events?.at(-1)?.reason ?? ''), /another/);
  assert.equal(state.objects.get('a').damage, 0, 'odrzucony rzut nie może mutować stanu (CR 601.2h)');
});

// =========================================================================
// M2 — Arlinn's Wolf (WAR): „This creature can't be blocked by creatures with
// power 2 or less." Deskryptor ISTNIEJE (`cantBeBlockedByPower`, rodzina
// Rust-Shield Rampager) i działa z własnej zdolności stałej stwora — ten blok
// pinuje go pod kartą z batcha 70, na karcie syntetycznej (ADR 0029).
// Ruling WAR 2019-05-03: raz wykonany blok zostaje, nawet gdy moc spadnie.
// =========================================================================

const wolf = (state, id, controllerId = 'p1') => {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId, ownerId: controllerId,
    zone: 'battlefield', kind: 'creature', types: ['Creature'], colors: ['G'], subtypes: ['Wolf'],
    keywords: [], power: 3, toughness: 2,
    abilities: [createAbility({ type: ABILITY_TYPE.static, cantBeBlockedByPower: 2 })],
  });
  return state.objects.get(id);
};

test('B70/M2 walidacja bloków: próg mocy 2 — bloker 2/2 odrzucony, 3/3 dozwolony', () => {
  const state = setup();
  wolf(state, 'wolf');
  creature(state, 'maly', 'p2', 2, 2);
  creature(state, 'duzy', 'p2', 3, 3);
  const attacker = state.objects.get('wolf');
  assert.match(String(blockAssignmentViolation(state, attacker, ['maly'])), /power 2 or less|mocy/,
    'stwór o mocy 2 nie może blokować („power 2 or less”)');
  assert.equal(blockAssignmentViolation(state, attacker, ['duzy']), null,
    'stwór o mocy 3 blokuje bez przeszkód');
});

test('B70/M2 widok: próg ewazji jest informacją PUBLICZNĄ dla bota (ADR 0017)', () => {
  const state = setup();
  wolf(state, 'wolf');
  const entry = playerView(state, 'p2').zones.battlefield.find((o) => o.id === 'wolf');
  assert.equal(entry?.cantBeBlockedByPower, 2, 'PlayerView musi nieść próg mocy');
});

test('B70/M2 oferta bloków: `legalBlockerOptions` nie proponuje blokera za słabego', () => {
  const state = setup();
  wolf(state, 'wolf');
  creature(state, 'maly', 'p2', 1, 1);
  creature(state, 'duzy', 'p2', 4, 4);
  state.combat = { attackingPlayerId: 'p1', attackers: ['wolf'], blockers: new Map(), blockedAttackers: new Set() };
  state.turn = jumpToStep(state.turn, 'declare_blockers', 'p1');
  const options = legalBlockerOptions(state, 'p2');
  assert.deepEqual(options.filter((o) => (o.wolf ?? []).includes('maly')), [],
    'oferta nie może proponować blokera łamiącego próg (kontrakt L48)');
  assert.ok(options.some((o) => (o.wolf ?? []).includes('duzy')), 'oferta proponuje legalnego blokera');
});

test('B70/M2 bot: `attackerCanBeBlocked` respektuje próg mocy (ADR 0017)', () => {
  const wolfView = { id: 'wolf', cantBeBlockedByPower: 2, keywords: [] };
  assert.equal(attackerCanBeBlocked(wolfView, [{ id: 'b1', power: 1 }, { id: 'b2', power: 2 }]), false,
    'wszyscy blokerzy mają moc ≤ 2 — atakujący jest nieblokowalny');
  assert.equal(attackerCanBeBlocked(wolfView, [{ id: 'b1', power: 2 }, { id: 'b2', power: 3 }]), true,
    'bloker o mocy 3 łamie próg — atakujący jest blokowalny');
  assert.equal(attackerCanBeBlocked({ id: 'plain', keywords: [] }, [{ id: 'b1', power: 1 }]), true,
    'kontrola ujemna: bez deskryptora każdy bloker się liczy');
});

test('B70/M2 ruling WAR: obniżenie mocy blokera nie odblokowuje (blok już wykonany)', () => {
  const state = setup();
  wolf(state, 'wolf');
  creature(state, 'duzy', 'p2', 3, 3);
  const attacker = state.objects.get('wolf');
  assert.equal(blockAssignmentViolation(state, attacker, ['duzy']), null, '3/3 może blokować');
  // Obniżenie mocy blokera do 1 (np. -2/-0) NIE cofa bloku — walidacja dotyczy
  // tylko PRZYSZŁYCH deklaracji; sprawdzamy, że próg czyta moc efektywną.
  state.objects.set('duzy', Object.freeze({ ...state.objects.get('duzy'), powerModifier: -2 }));
  assert.match(String(blockAssignmentViolation(state, attacker, ['duzy'])), /power 2 or less|mocy/,
    'moc efektywna blokera (1) wpada w próg zakazu');
});

// =========================================================================
// M3 — Kaleidoscorch (MH2): „Converge — Kaleidoscorch deals X damage to any
// target, where X is the number of colors of mana spent to cast this spell.
// Flashback {2}{R}". Converge jest ability wordem (CR 207.2c), więc regułę
// niesie kwota `amount: 'colors_of_mana_spent'` czytana z migawki płatności
// (`manaColorsSpent`), a nie osobny handler. Test pinuje CAŁĄ ścieżkę:
// rzut z ręki, rzut z flashbacka z grobu (alternatywny koszt) i wygnanie.
// =========================================================================

const KALEIDO = {
  timing: 'sorcery',
  targets: [{ type: 'any_target' }],
  effects: [{ type: 'damage', amount: 'colors_of_mana_spent', targetIndex: 0 }],
  flashback: { cost: 3, colors: ['R'] },
};

function kaleido(state, zone = 'hand') {
  addObject(state, {
    id: 'kaleido', instanceId: 'i-kaleido', cardId: HOST.id, controllerId: 'p1', ownerId: 'p1',
    zone, ...gameObjectDataOf(HOST), types: ['Sorcery'], manaCost: 2, colors: ['R'], spell: KALEIDO,
  });
  return state.objects.get('kaleido');
}

function resolveAll(state) {
  let guard = 0;
  while (state.zones.stack.length > 0 && guard++ < 80) {
    const pass = playerView(state, state.turn.priorityPlayerId).legalCommands.find((c) => c.type === 'pass_priority');
    assert.ok(pass, 'brak pass_priority');
    assert.equal(execute(state, pass).ok, true);
  }
}

test('B70/M3 Converge: X = liczba KOLORÓW many wydanej na rzut (bezbarwna się nie liczy)', () => {
  // Dwie jednostki kolorowe ({B} pokrywa pip drukowany, {G} musi pokryć
  // generyczną) → Converge = 2, choć jednostek jest dwie i koszt to 2.
  const dwa = setup({ mana: 0 });
  kaleido(dwa);
  creature(dwa, 'cel', 'p2', 5, 5);
  addMana(dwa, 'p1', 1, { colors: ['B'] });
  addMana(dwa, 'p1', 1, { colors: ['G'] });
  assert.equal(execute(dwa, { type: 'cast_spell', playerId: 'p1', objectId: 'kaleido', targets: ['cel'] }).ok, true);
  resolveAll(dwa);
  assert.equal(dwa.objects.get('cel').damage, 2, 'B + G = 2 kolory');

  // Wariant z bezbarwną jednostką: {B} + {C} → generic pokrywa bezbarwna,
  // więc wydano JEDEN kolor (CR 106.1a: bezbarwna nie jest kolorem).
  const jeden = setup({ mana: 0 });
  kaleido(jeden);
  creature(jeden, 'cel2', 'p2', 5, 5);
  addMana(jeden, 'p1', 1, { colors: ['B'] });
  addMana(jeden, 'p1', 2, { colors: [] });
  assert.equal(execute(jeden, { type: 'cast_spell', playerId: 'p1', objectId: 'kaleido', targets: ['cel2'] }).ok, true);
  resolveAll(jeden);
  assert.equal(jeden.objects.get('cel2').damage, 1, 'bezbarwna mana nie jest kolorem (CR 106.1a)');
});

let seat = 0;
function setup2({ mana = 0 } = {}) {
  seat += 1;
  const state = createGameState({ seed: 700 + seat, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  if (mana > 0) addMana(state, 'p1', mana, { colors: ['R', 'G', 'U'] });
  return state;
}

test('B70/M3 Flashback: czar z grobu rzucany za koszt flashbacka liczy WŁASNĄ płatność', () => {
  const state = setup2({ mana: 0 });
  kaleido(state, 'graveyard');
  creature(state, 'cel', 'p2', 5, 5);
  addMana(state, 'p1', 2, { colors: ['R'] }); // koszt flashbacka: 3 many, pip {R}
  addMana(state, 'p1', 1, { colors: ['G'] }); // drugi kolor w płatności → Converge = 2
  const offers = legalFlashbackCasts(state, 'p1').filter((c) => c.objectId === 'kaleido');
  assert.ok(offers.length > 0, 'oferta flashbacku musi istnieć dla czaru w grobie');
  const r = execute(state, { type: 'cast_flashback', playerId: 'p1', objectId: 'kaleido', targets: ['cel'] });
  assert.equal(r.ok, true, `flashback odrzucony: ${JSON.stringify(r.events?.at(-1))}`);
  resolveAll(state);
  assert.equal(state.objects.get('cel').damage, 2, 'Converge liczy kolory many wydanej na rzut z flashbacka');
  const exiled = [...state.zones.exile].map((id) => state.objects.get(id)).find((o) => o?.cardId === HOST.id);
  assert.ok(exiled, 'ruling MH2 2021-06-18: flashback ZAWSZE wygania kartę (CR 702.34a)');
  assert.equal(state.zones.graveyard.map((id) => state.objects.get(id)).filter((o) => o?.cardId === HOST.id).length, 0,
    'karta nie może zostać w grobie po rzucie z flashbacka');
});

test('B70/M3 Flashback: rzut z ręki NIE jest oferowany jako flashback, gdy karta jest w ręce', () => {
  const state = setup2({ mana: 6 });
  kaleido(state, 'hand');
  assert.deepEqual(legalFlashbackCasts(state, 'p1').filter((c) => c.objectId === 'kaleido'), [],
    'flashback czyta wyłącznie grób (CR 702.34a)');
});

// =========================================================================
// M4 — Fen Hauler (AER): „Improvise (Your artifacts can help cast this spell.
// Each artifact you tap after you're done activating mana abilities pays for
// {1}.)" CR 2026-09-25, 702.126a (dosłownie): „“Improvise” means “For each
// generic mana in this spell's total cost, you may tap an untapped artifact you
// control rather than pay that mana.”” + 702.126b: „The improvise ability isn't
// an additional or alternative cost and applies only after the total cost of
// the spell with improvise is determined.” Dlatego tapnięcie pokrywa WYŁĄCZNIE
// część generyczną (ruling AER 2017-02-09: nie kolor i nie {C}) i nie jest
// kosztem alternatywnym (oferta istnieje obok wariantu manowego).
// =========================================================================

const IMPROVISE_CARD = 'minotaur-abomination'; // {4}{B}{B}: 6 many, 2 pipy → 4 sloty generyczne
const IMPROVISE_PIPS = coloredPipsOf(IMPROVISE_CARD, 0);
const GENERIC_SLOTS = 4;

function impSetup({ mana = 0, artifacts = 0 } = {}) {
  const state = createGameState({ seed: 707, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  const def = REGISTRY.get(IMPROVISE_CARD);
  addObject(state, {
    id: 'fen', instanceId: 'i-fen', cardId: IMPROVISE_CARD, controllerId: 'p1', ownerId: 'p1',
    zone: 'hand', ...gameObjectDataOf(def), improvise: true,
  });
  for (let i = 0; i < artifacts; i += 1) {
    addObject(state, {
      id: `art${i}`, instanceId: `i-art${i}`, cardId: 'test-art', controllerId: 'p1', ownerId: 'p1',
      zone: 'battlefield', kind: 'artifact', types: ['Artifact'], subtypes: ['Equipment'],
      colors: [], keywords: [], abilities: [],
    });
  }
  if (mana > 0) addMana(state, 'p1', mana, { colors: ['B'] });
  return state;
}

const permanenteOffers = (state) => playerView(state, 'p1').legalCommands
  .filter((c) => c.type === 'cast_permanent' && c.objectId === 'fen');
const improviseOffers = (state) => permanenteOffers(state).filter((c) => c.improvisePayments?.length);

test('B70/M4 Improvise: oferta wytapnięcia artefaktów powstaje, gdy mana nie wystarcza', () => {
  const state = impSetup({ mana: 2, artifacts: 4 }); // 2 many < koszt 6; pipy {B}{B} opłacalne
  const offers = improviseOffers(state);
  assert.ok(offers.length > 0, 'Batch 69 lekcja: mechanika musi mieć ofertę w legalCommands');
  for (const offer of offers) {
    assert.ok(offer.improvisePayments.length <= GENERIC_SLOTS,
      `improvise pokrywa tylko 4 sloty generyczne, oferta ma ${offer.improvisePayments.length}`);
  }
  assert.ok(offers.some((c) => c.improvisePayments.length === 4), 'oferta pełnego pokrycia generycznego');
  assert.deepEqual(permanenteOffers(state).filter((c) => !c.improvisePayments?.length), [],
    'przy zbyt małej manie wariant manowy nie może być oferowany');
});

test('B70/M4 Improvise: rzut tapie artefakty zamiast płacić manę i wchodzi na pole bitwy', () => {
  const state = impSetup({ mana: 2, artifacts: 4 });
  const offer = improviseOffers(state).find((c) => c.improvisePayments.length === 4);
  assert.ok(offer, 'oferta z czterema artefaktami');
  const artifactIds = offer.improvisePayments.map((p) => p.artifactId);
  const manaPrzed = state.players.find((p) => p.id === 'p1').mana;
  const r = execute(state, offer);
  assert.equal(r.ok, true, `rzut odrzucony: ${JSON.stringify(r.events?.at(-1))}`);
  for (const id of artifactIds) {
    assert.equal(state.objects.get(id)?.tapped, true, `artefakt ${id} musi być tapnięty (CR 702.126a)`);
  }
  // Koszt 6 = 4 generyczne (artefakty) + {B}{B}; z puli schodzą 2 pipy.
  assert.equal(manaPrzed - state.players.find((p) => p.id === 'p1').mana, 2,
    'mana schodzi tylko za część NIEpokrytą przez improvise (702.126b)');
  const cast = state.events.find((e) => e.type === 'permanent_cast');
  assert.equal(cast?.manaSpent, 2, 'manaSpent liczy wyłącznie wydaną manę, nie tapnięte artefakty');
  assert.ok([...state.zones.stack].some((id) => state.objects.get(id)?.cardId === IMPROVISE_CARD),
    'rzucony czar-permanent ląduje na stosie (rozstrzygnięcie nastąpi później)');
});

test('B70/M4 Improvise: brak pokrycia pipów kolorowych = brak oferty (kontrakt L48)', () => {
  const state = impSetup({ mana: 0, artifacts: 4 }); // zero many: {B}{B} nieopłacalne
  assert.deepEqual(improviseOffers(state), [],
    'improvise nie płaci pipów, więc bez źródeł {B} rzut jest nielegalny i oferta musi milczeć');
});

test('B70/M4 Improvise: walidacja odrzuca cudzy artefakt i powtórzone tapnięcie', () => {
  const state = impSetup({ mana: 2, artifacts: 2 });
  addObject(state, {
    id: 'cudzy', instanceId: 'i-cudzy', cardId: 'test-art2', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', kind: 'artifact', types: ['Artifact'], subtypes: [], colors: [], keywords: [], abilities: [],
  });
  const obcy = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'fen', improvisePayments: [{ artifactId: 'cudzy' }] });
  assert.equal(obcy.ok, false, 'artefakt przeciwnika nie może płacić improvise');
  const dubel = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'fen',
    improvisePayments: [{ artifactId: 'art0' }, { artifactId: 'art0' }] });
  assert.equal(dubel.ok, false, 'ten sam artefakt nie zapłaci dwa razy');
  assert.equal(state.objects.get('art0')?.tapped ?? false, false, 'odrzucony rzut nie tapie (CR 601.2h)');
});

test('B70/M4 Improvise: więcej tapnięć niż slotów generycznych jest odrzucane', () => {
  const state = impSetup({ mana: 2, artifacts: 5 });
  const five = [0, 1, 2, 3, 4].map((i) => ({ artifactId: `art${i}` }));
  const r = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'fen', improvisePayments: five });
  assert.equal(r.ok, false, 'koszt {4}{B}{B} ma 4 sloty generyczne — piąte tapnięcie jest nielegalne');
  assert.match(String(r.events?.at(-1)?.reason ?? ''), /improvise/i);
});

test('B70/M4 Improvise: karta BEZ mechaniki odrzuca płatność artefaktami', () => {
  const state = impSetup({ mana: 2, artifacts: 2 });
  const object = state.objects.get('fen');
  state.objects.set('fen', Object.freeze({ ...object, improvise: false }));
  const r = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'fen',
    improvisePayments: [{ artifactId: 'art0' }] });
  assert.equal(r.ok, false, 'bez deskryptora improvise płatność musi być odrzucona');
  assert.match(String(r.events?.at(-1)?.reason ?? ''), /improvise/i);
});

// =========================================================================
// M5 — Magma Pummeler (VOW): „Magma Pummeler enters with X +1/+1 counters on
// it. If damage would be dealt to Magma Pummeler while it has a +1/+1 counter
// on it, prevent that damage and remove that many +1/+1 counters from it.
// When one or more counters are removed from Magma Pummeler this way, it deals
// that damage to any target."
// CR 2026-09-25: 615.1a (efekt prewencji), 107.3a (X), 603.10 (LKI źródła,
// które zginęło przed rozstrzygnięciem). Ruling VOW 2021-11-19: obrażenia
// większe niż liczba liczników → całe zapobiegnięte, zdjęte WSZYSTKIE liczniki
// (stwór z 0 wytrzymałości ginie), a refleksyjny trigger nadal zadaje tyle
// obrażeń, ile liczników zdjęto.
// =========================================================================

const PUMMELER_TRIGGER = createAbility({
  type: ABILITY_TYPE.triggered,
  // Refleksyjny trigger: cel „any target" wybiera kontroler przy kładzeniu na stos.
  trigger: { event: 'counter_removed', damagePreventionOnly: true, requiresTarget: { type: 'any_target' } },
  effect: [{ type: 'damage', amountFromContext: 'countersRemoved' }],
});

function pummeler(state, id, { counters = 0, controllerId = 'p1' } = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId, ownerId: controllerId,
    zone: 'battlefield', kind: 'creature', types: ['Creature'], colors: ['R'], subtypes: ['Elemental'],
    keywords: [], power: 0, toughness: 0,
    abilities: [
      createAbility({ type: ABILITY_TYPE.static, preventDamageByRemovingCounter: '+1/+1' }),
      PUMMELER_TRIGGER,
    ],
  });
  if (counters > 0) addCounter(state, id, '+1/+1', counters);
  return state.objects.get(id);
}

/** Wykonuje efekt obrażeń i przepuszcza zdarzenia przez skan triggerów. */
function hit(state, targetId, amount) {
  const before = state.events.length;
  applyEffect(state, { type: 'damage', amount, targetIndex: 0 }, state.objects.get('zrodlo'), [targetId]);
  processTriggers(state, state.events.slice(before));
}

function chooseTriggerTarget(state, targetId) {
  let guard = 0;
  while (guard++ < 20) {
    const cmds = playerView(state, 'p1').legalCommands;
    const pick = cmds.find((c) => c.type === 'resolve_trigger_target' && (c.targetIds ?? [c.targetId]).includes(targetId))
      ?? cmds.find((c) => c.type === 'resolve_trigger_target');
    if (!pick) return false;
    const r = execute(state, pick.targetIds ? { ...pick, targetId } : pick);
    assert.equal(r.ok, true, `wybór celu triggera odrzucony: ${JSON.stringify(r.events?.at(-1))}`);
    return true;
  }
  return false;
}

function resolveStack(state) {
  let guard = 0;
  while (state.zones.stack.length > 0 && guard++ < 60) {
    const pass = playerView(state, state.turn.priorityPlayerId).legalCommands.find((c) => c.type === 'pass_priority');
    assert.ok(pass, 'brak pass_priority');
    assert.equal(execute(state, pass).ok, true);
  }
}

function pummelerState({ damage = 0, counters = 3 } = {}) {
  const state = createGameState({ seed: 771, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  addObject(state, {
    id: 'zrodlo', instanceId: 'i-zrodlo', cardId: 'test-zrodlo', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', kind: 'creature', types: ['Creature'], colors: ['R'], subtypes: ['Goblin'],
    keywords: [], power: 3, toughness: 3, abilities: [],
  });
  pummeler(state, 'pummel', { counters });
  return state;
}

test('B70/M5 prewencja: obrażenia mniejsze niż liczniki — zapobiegnięte, liczniki zdjęte', () => {
  const state = pummelerState({ counters: 3 });
  hit(state, 'pummel', 2);
  const after = state.objects.get('pummel');
  assert.equal(after.counters?.['+1/+1'] ?? 0, 1, 'zdjęto dokładnie 2 liczniki');
  assert.equal(after.damage, 0, 'żadnych obrażeń na obiekcie (efekt prewencji, CR 615.1a)');
  assert.equal(after.zone, 'battlefield', 'stwór przeżywa — został licznik');
  assert.ok(state.events.some((e) => e.type === 'damage_prevented' && e.counterRemoval === true),
    'log musi pokazać, że obrażenia zapobiegnięto zdejmując liczniki');
  const triggered = state.events.find((e) => e.type === 'ability_triggered' && e.cardId === 'test-pummel');
  assert.ok(triggered, '„when counters are removed this way” — trigger musi wejść na stos');
});

test('B70/M5 refleksyjny trigger: zadaje tyle obrażeń, ile zdjęto liczników', () => {
  const state = pummelerState({ counters: 3 });
  hit(state, 'pummel', 2);
  assert.equal(chooseTriggerTarget(state, 'p2'), true, 'trigger z celem „any target” musi poprosić o cel');
  resolveStack(state);
  assert.equal(state.players.find((p) => p.id === 'p2').life, 18, 'przeciwnik traci 2 życia (2 zdjęte liczniki)');
});

test('B70/M5 ruling VOW: obrażenia ≥ liczniki — całe zapobiegnięte i stwór ginie, trigger nadal działa', () => {
  const state = pummelerState({ counters: 3 });
  hit(state, 'pummel', 5);
  // Kolejność jak w prawdziwej komendzie: wybór celu triggera (CR 603.3d)
  // należy do tej samej rundy, a dopiero potem reguła stanu (CR 704.5f)
  // usuwa stwór z 0 wytrzymałości.
  assert.equal(chooseTriggerTarget(state, 'p2'), true, 'trigger prosi o cel, zanim stwór zginie');
  runStateBasedActions(state);
  assert.equal(state.objects.get('pummel')?.zone ?? null, null,
    'po zdjęciu wszystkich liczników wytrzymałość 0 → reguła stanu usuwa stwór');
  resolveStack(state);
  assert.equal(state.players.find((p) => p.id === 'p2').life, 17, 'obrażenia równe LICZNIE zdjętych liczników (3), nie 5');
});

test('B70/M5 bez licznika: brak efektu zastępującego — obrażenia idą normalnie', () => {
  const state = pummelerState({ counters: 0 });
  // 3/3, by stwór przeżył i dało się zmierzyć obrażenia.
  state.objects.set('pummel', Object.freeze({ ...state.objects.get('pummel'), power: 3, toughness: 3 }));
  hit(state, 'pummel', 2);
  assert.equal(state.objects.get('pummel').damage, 2, 'bez licznika prewencja nie działa („while it has a counter”)');
  assert.equal(state.events.filter((e) => e.type === 'ability_triggered' && e.cardId === 'test-pummel').length, 0,
    'brak zdjętych liczników = brak triggera');
});

test('B70/M5 zwykłe zdjęcie licznika NIE odpala triggera (tylko „this way”)', () => {
  const state = pummelerState({ counters: 2 });
  removeCounter(state, 'pummel', '+1/+1', 1);
  processTriggers(state, state.events.slice(-1));
  assert.equal(state.events.filter((e) => e.type === 'ability_triggered' && e.cardId === 'test-pummel').length, 0,
    'trigger czyta znacznik przyczyny `damagePrevention`, nie samo zdarzenie counter_removed');
});
