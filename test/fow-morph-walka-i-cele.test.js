// M102/U6 (część 2+3) — mgła wojny dla zakrytych (face-down) stworów przeciwnika
// w WALCE oraz gdy morph jest CELEM czarów/efektów.
//
// Zgłoszenie właściciela (2026-08-16), po doprecyzowaniu:
//   „Jeśli morph ginie, to można ujawnić jego tożsamość — tego nie trzeba łatać.
//    Ale zawsze gdy żyje, musi być morphem."
//
// Reguła testowana tutaj jest więc jednoznaczna:
//   ŻYWY zakryty permanent przeciwnika NIGDY nie zdradza nazwy karty —
//   ani jako źródło obrażeń, ani jako cel czaru/efektu, ani w deklaracji ataku,
//   ani przez aurę/ekwipunek, który go dotyka.
// Ujawnienia DOZWOLONE (nie są błędem i nie mogą zostać zamaskowane):
//   - śmierć / zejście z pola bitwy (CR 708.4),
//   - odwrócenie twarzą do góry (CR 707.9),
//   - własny zakryty stwór w oczach jego kontrolera (CR 708.6).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { describeGameEvent } from '../src/table/session.js';

const REGISTRY = createCardRegistry();
const HUMAN = 'p1';
const FOE = 'p2';
// Karta z morphem, której nazwa NIE może wyciec, dopóki stwór leży zakryty.
const SECRET = 'woolly-loxodon';
const SECRET_NAME = REGISTRY.get(SECRET).name;

function game(seed = 909) {
  return createGameState({ seed, players: [{ id: HUMAN }, { id: FOE }] });
}

function addRealCard(state, id, cardId, playerId, extra = {}) {
  const card = REGISTRY.get(cardId);
  assert.ok(card, `brak karty ${cardId}`);
  const data = gameObjectDataOf(card);
  data.types = card.types ?? [];
  data.keywords = card.keywords ?? [];
  data.subtypes = card.subtypes ?? [];
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId,
    zone: 'battlefield', ...data, ...extra,
  });
  return state.objects.get(id);
}

/** Kładzie kartę na stole ZAKRYTĄ — anonimowe 2/2 (CR 708.2). */
function addFaceDown(state, id, cardId, playerId) {
  addRealCard(state, id, cardId, playerId);
  const base = state.objects.get(id);
  state.objects.set(id, Object.freeze({
    ...base, faceDown: true, faceDownOriginal: cardId,
    power: 2, toughness: 2, summoningSickness: false,
  }));
  return state.objects.get(id);
}

/** Helpery panelu w widoku CZŁOWIEKA — jak w src/table/session.js. */
function humanHelpers(state) {
  const nameOf = (cardId) => REGISTRY.get(cardId)?.name ?? cardId;
  return {
    nameOf,
    nameOfObject: (id) => {
      if (id === HUMAN) return 'Ty';
      if (id === FOE) return 'Nieprzyjaciel';
      const o = state.objects.get(id);
      if (!o) return '?';
      if (o.faceDown) {
        return o.controllerId === HUMAN ? `${nameOf(o.cardId)} (morph)` : 'morph';
      }
      return nameOf(o.cardId);
    },
    isPlayer: (id) => id === HUMAN || id === FOE,
  };
}

function logLines(events, state) {
  const helpers = humanHelpers(state);
  return events.map((e) => describeGameEvent(e, helpers)).filter((t) => t != null);
}

function assertNoLeak(lines, what) {
  const bad = lines.filter((t) => t.includes(SECRET_NAME));
  assert.equal(bad.length, 0,
    `${what}: nazwa ŻYWEGO zakrytego stwora wyciekła:\n${bad.map((l) => `  - ${l}`).join('\n')}\n` +
    `pełny log:\n${lines.map((l) => `  · ${l}`).join('\n')}`);
}

// ---------------------------------------------------------------------------
// A. Silnik: widok gracza nie może w ogóle wysyłać tożsamości żywego morpha.
// ---------------------------------------------------------------------------

test('A1: playerView nie zdradza cardId żywego zakrytego stwora przeciwnika', () => {
  const state = game();
  addFaceDown(state, 'foe-morph', SECRET, FOE);
  addFaceDown(state, 'my-morph', SECRET, HUMAN);

  const view = playerView(state, HUMAN);
  const dump = JSON.stringify(view);
  assert.ok(!dump.includes(SECRET_NAME),
    'widok gracza nie może zawierać nazwy zakrytej karty przeciwnika');

  const foe = findObject(view, 'foe-morph');
  assert.ok(foe, 'morph przeciwnika jest w widoku');
  assert.equal(foe.cardId ?? null, null,
    'morph przeciwnika nie może nieść cardId do klienta (CR 708.2)');

  const mine = findObject(view, 'my-morph');
  assert.ok(mine, 'własny morph jest w widoku');
  assert.equal(mine.cardId, SECRET,
    'własny morph MA być rozpoznawalny dla kontrolera (CR 708.6)');
});

function findObject(view, id) {
  let found = null;
  const walk = (node) => {
    if (found) return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === 'object') {
      if (node.id === id) { found = node; return; }
      Object.values(node).forEach(walk);
    }
  };
  walk(view);
  return found;
}

// ---------------------------------------------------------------------------
// B. Walka: morph żyje przez całą walkę → żadna linia nie zdradza nazwy.
// ---------------------------------------------------------------------------

test('B1: morph przeciwnika atakuje i przeżywa — cały log walki mówi „morph"', () => {
  const state = game();
  addFaceDown(state, 'foe-morph', SECRET, FOE);

  state.turn = jumpToStep(state.turn, 'declare_attackers', FOE);
  state.turn.activePlayerId = FOE;
  state.turn.priorityPlayerId = FOE;

  const ra = execute(state, { type: 'declare_attackers', playerId: FOE, attackerIds: ['foe-morph'] });
  assert.ok(ra.ok, 'atak zadeklarowany');

  state.turn = jumpToStep(state.turn, 'combat_damage', FOE);
  state.turn.activePlayerId = FOE;
  state.turn.priorityPlayerId = FOE;
  const rc = execute(state, { type: 'resolve_combat', playerId: FOE, defendingPlayerId: HUMAN });
  assert.ok(rc.ok, 'walka rozstrzygnięta');

  // Morph przeżył — obowiązuje pełne maskowanie.
  assert.equal(state.objects.get('foe-morph')?.zone, 'battlefield', 'morph żyje');
  assert.equal(state.objects.get('foe-morph')?.faceDown, true, 'morph nadal zakryty');

  const lines = [...logLines(ra.events, state), ...logLines(rc.events, state)];
  assert.ok(lines.some((t) => t.includes('morph')), `log wspomina morpha: ${lines.join(' | ')}`);
  assertNoLeak(lines, 'walka z przeżywającym morphem');
});

test('B2: morph blokuje — deklaracja bloków nie zdradza nazwy', () => {
  const state = game();
  addFaceDown(state, 'foe-morph', SECRET, FOE);
  addRealCard(state, 'my-attacker', 'ainok-tracker', HUMAN, { summoningSickness: false });

  state.turn = jumpToStep(state.turn, 'declare_attackers', HUMAN);
  state.turn.activePlayerId = HUMAN;
  state.turn.priorityPlayerId = HUMAN;

  const ra = execute(state, { type: 'declare_attackers', playerId: HUMAN, attackerIds: ['my-attacker'] });
  assert.ok(ra.ok);
  const rb = execute(state, {
    type: 'declare_blockers', playerId: FOE, assignments: { 'my-attacker': ['foe-morph'] },
  });
  assert.ok(rb.ok, 'blok zadeklarowany');

  assertNoLeak([...logLines(ra.events, state), ...logLines(rb.events, state)], 'blok morphem');
});

// ---------------------------------------------------------------------------
// C. Morph jako CEL czarów i efektów (rozszerzenie zakresu przez właściciela).
//    Morph przez cały czas ŻYJE na bitwisku.
// ---------------------------------------------------------------------------

const ZYWY_MORPH_JAKO_CEL = [
  ['obrażenia zadane morphowi', (s) => ({
    type: 'damage_dealt', source: 'my-guy', sourceCardId: 'ainok-tracker',
    target: 'foe-morph', targetCardId: SECRET, amount: 1,
  })],
  ['obrażenia zadane PRZEZ morpha', () => ({
    type: 'damage_dealt', source: 'foe-morph', sourceCardId: SECRET,
    target: HUMAN, amount: 2,
  })],
  ['prewencja obrażeń na morphie', () => ({
    type: 'damage_prevented', target: 'foe-morph', objectId: 'foe-morph',
    cardId: SECRET, targetCardId: SECRET, amount: 2,
  })],
  ['aura zaczarowuje morpha', () => ({
    type: 'object_attached', cardId: 'vow-of-wildness', objectId: 'aura-1',
    hostId: 'foe-morph', hostCardId: SECRET, via: 'aura',
  })],
  ['ekwipunek na morphie', () => ({
    type: 'object_attached', cardId: 'vow-of-wildness', objectId: 'eq-1',
    hostId: 'foe-morph', hostCardId: SECRET, via: 'equip',
  })],
  ['morph nie może blokować', () => ({
    type: 'cant_block_granted', objectId: 'foe-morph', cardId: SECRET,
  })],
  ['tarcza prewencji na morphie', () => ({
    type: 'damage_shield_created', cardId: 'vow-of-wildness',
    target: 'foe-morph', remaining: 2,
  })],
  ['koniec animacji morpha', () => ({
    type: 'permanent_animation_ended', objectId: 'foe-morph', cardId: SECRET,
  })],
];

for (const [label, makeEvent] of ZYWY_MORPH_JAKO_CEL) {
  test(`C: ${label} — log nie zdradza nazwy żywego morpha`, () => {
    const state = game();
    addFaceDown(state, 'foe-morph', SECRET, FOE);
    addRealCard(state, 'my-guy', 'ainok-tracker', HUMAN, { summoningSickness: false });
    const lines = logLines([makeEvent(state)], state);
    assertNoLeak(lines, label);
    assert.ok(lines.length > 0, `zdarzenie „${label}" musi mieć opis w panelu`);
  });
}

// ---------------------------------------------------------------------------
// D. Anty-over-masking — ujawnienia, które MUSZĄ pozostać widoczne.
// ---------------------------------------------------------------------------

test('D1: śmierć morpha ujawnia tożsamość (CR 708.4) — maskowanie nie może tego zjeść', () => {
  const state = game();
  addFaceDown(state, 'foe-morph', SECRET, FOE);
  const event = { type: 'creature_destroyed', fromId: 'foe-morph', cardId: SECRET };
  state.objects.delete('foe-morph'); // zszedł z pola — twarz odkryta
  const lines = logLines([event], state);
  assert.ok(lines.some((t) => t.includes(SECRET_NAME)),
    `po śmierci nazwa MA być ujawniona; log: ${lines.join(' | ')}`);
});

test('D2: odwrócenie twarzą do góry ujawnia nazwę (CR 707.9)', () => {
  const state = game();
  addRealCard(state, 'foe-morph', SECRET, FOE, { summoningSickness: false });
  const lines = logLines([{ type: 'turned_face_up', objectId: 'foe-morph', cardId: SECRET }], state);
  assert.ok(lines.some((t) => t.includes(SECRET_NAME)),
    `odwrócenie twarzą do góry MA ujawniać nazwę; log: ${lines.join(' | ')}`);
});

test('D3: własny zakryty stwór pozostaje rozpoznawalny dla właściciela (CR 708.6)', () => {
  const state = game();
  addFaceDown(state, 'my-morph', SECRET, HUMAN);
  const lines = logLines([{
    type: 'damage_dealt', source: 'my-morph', sourceCardId: SECRET, target: FOE, amount: 2,
  }], state);
  assert.ok(lines.some((t) => t.includes(SECRET_NAME)),
    `własny morph ma być rozpoznawalny; log: ${lines.join(' | ')}`);
});
