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
import { legalSpellCasts, effectiveSpellManaCost } from '../src/engine/spells.js';

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
