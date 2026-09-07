// M319 — zgloszenie wlasciciela (2026-09-06, cz. 5 / NA1):
// „W opcjach wyboru (cele czarow/zdolnosci) zakryte maja byc Cloak(ed), nie
// Morph, i miec STALE numery kolejne (‚Cloaked 1, Cloaked 2’) do rozpoznawania;
// spojnie z tokenami tej samej nazwy („kopia N”).”
//
// Stan przed: etykiety celow i kafli mowily „(Morph)” o cloakach (mechanika
// klamala — cloak ma ward {2}), a kilka jednakowych zakrytych kart bylo
// nierozroznialnych (tokeny-kopie maja „kopia N” (M172/D), cloaki nic).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState, playerView, execute, addObject } from '../src/engine/game-state.js';
import { applyEffect } from '../src/engine/effects.js';
import { addMana } from '../src/engine/resources.js';
import { jumpToStep } from '../src/engine/turn.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { cloakFaceDownName, CLOAK_LABEL } from '../src/table/session.js';
import { commandLabel } from '../src/table/render.js';

const REGISTRY = createCardRegistry();

function game(playerId = 'p1') {
  const state = createGameState({ seed: 319, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function putCard(state, id, cardId, controllerId, zone = 'battlefield') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  return state.objects.get(id);
}

/** Cloakuje `n` wierzchowych kart biblioteki kontrolera (Veiled Ascension). */
function cloakTop(state, controllerId, n, topCardId = 'goblin-piker') {
  putCard(state, 'va', 'veiled-ascension', controllerId);
  const lib = [];
  for (let i = 0; i < n; i++) {
    putCard(state, `lib-${i}`, topCardId, controllerId, 'library');
    lib.push(`lib-${i}`);
  }
  state.zones.library = lib;
  for (let i = 0; i < n; i++) applyEffect(state, { type: 'cloak' }, state.objects.get('va'), []);
  return state.zones.battlefield
    .map((id) => state.objects.get(id))
    .filter((o) => o.faceDown && o.controllerId === controllerId);
}

// ---- A: stalą numeracja przy tworzeniu zakrycia -----------------------------

test('M319/A: dwa cloak-i tej samej karty dostaja copyNumber 1 i 2 (jak tokeny „kopia N”)', () => {
  const state = game();
  const cloaks = cloakTop(state, 'p1', 2);
  const numbers = cloaks.map((c) => c.copyNumber).sort((a, b) => a - b);
  assert.deepEqual(numbers, [1, 2], `zakrycia numerowane po kolei: ${numbers}`);
});

test('M319/A: numer liczy ZYWE cloak-i kontrolera — po uncover kolejny dostaje wolny numer', () => {
  const state = game();
  const [first] = cloakTop(state, 'p1', 3);
  addMana(state, 'p1', 5, { colors: ['R'] });
  const cmd = playerView(state, 'p1').legalCommands.find((c) => c.type === 'turn_cloak_face_up' && c.objectId === first.id);
  assert.ok(cmd, 'oferta uncover pierwszego');
  const r = execute(state, cmd);
  assert.ok(r.ok, `uncover przyjety: ${JSON.stringify(r)}`);
  assert.equal(state.objects.get(first.id).copyNumber ?? null, null, 'po uncover numer kopii znika (face-up karta go nie nosi)');
  assert.ok(!state.objects.get(first.id).cloakReady, 'flaga cloak zdjęta');
  // trzecie zakrycie: max z ŻYWYCH numerów = 2 → nowy cloak dostaje 3
  applyEffect(state, { type: 'cloak' }, state.objects.get('va'), []);
  const alive = state.zones.battlefield.map((id) => state.objects.get(id)).filter((o) => o.faceDown && o.controllerId === 'p1');
  const numbers = alive.map((c) => c.copyNumber).sort((a, b) => a - b);
  assert.deepEqual(numbers, [2, 3], `numeracja po ZYWYCH cloakach (odsłonięta „1" nie wraca): ${numbers}`);
});

// ---- B: widok ---------------------------------------------------------------

test('M319/B: widok wlasciciela niesie cloakReady + copyNumber; przeciwnik — bez cloakReady (FoW)', () => {
  const state = game();
  const [cloak] = cloakTop(state, 'p1', 1);
  const own = playerView(state, 'p1').zones.battlefield.find((o) => o.id === cloak.id);
  assert.equal(own.cloakReady, true, 'wlasciciel widzi flage cloak (M315)');
  assert.equal(own.copyNumber, 1, 'numer kopii w widoku (etykiety celow go czytaja)');
  assert.ok(own.cardId, 'wlasciciel zna tozsamosc wlasnego zakrycia (CR 708.6)');
  const foe = playerView(state, 'p2').zones.battlefield.find((o) => o.id === cloak.id);
  assert.equal(foe.cardId ?? null, null, 'przeciwnik nie zna cardId (FoW, CR 708.2)');
  assert.equal(foe.cloakReady ?? null, null, 'cloak-vs-morph to informacja ukryta — bez flagi');
});

// ---- C: etykiety ------------------------------------------------------------

test('M319/C: cloakFaceDownName — „Nazwa (Cloak N)”, bez nazwy „Cloak N”', () => {
  assert.equal(cloakFaceDownName('Goblin Piker', 1), 'Goblin Piker (Cloak 1)');
  assert.equal(cloakFaceDownName('Goblin Piker', 2), 'Goblin Piker (Cloak 2)');
  assert.equal(cloakFaceDownName(null, 2), 'Cloak 2');
  assert.equal(cloakFaceDownName(null), CLOAK_LABEL);
});

test('M319/C: etykieta celu cloakowanego — „Nazwa (Cloak 2)” (commandLabel, jak „kopia N” u tokenow)', () => {
  const fakeView = {
    playerId: 'p1',
    players: [{ id: 'p1', name: 'Ty' }, { id: 'p2', name: 'Nieprzyjaciel' }],
    zones: {
      hand: [], stack: [], graveyard: [], library: [], exile: [],
      battlefield: [
        // faceDownCause: 'cloak' — jawna przyczyna zakrycia z widoku (M326);
        // fikcja musi oddawać kształt, który produkuje playerView.
        { id: 'c1', faceDown: true, cardId: 'goblin-piker', cloakReady: true, faceDownCause: 'cloak', copyNumber: 1, controllerId: 'p1', zone: 'battlefield' },
        { id: 'c2', faceDown: true, cardId: 'goblin-piker', cloakReady: true, faceDownCause: 'cloak', copyNumber: 2, controllerId: 'p1', zone: 'battlefield' },
      ],
    },
  };
  const fakeSession = {
    nameOf: (id) => REGISTRY.get(id)?.name ?? id ?? '?',
    nameOfObject: () => '?',
    faceDownName: (n) => (n == null ? 'Morph' : `${n} (Morph)`),
    cloakFaceDownName,
  };
  const label1 = commandLabel({ type: 'cast_spell', objectId: 'x', targets: ['c1'] }, fakeSession, fakeView);
  const label2 = commandLabel({ type: 'cast_spell', objectId: 'x', targets: ['c2'] }, fakeSession, fakeView);
  assert.match(String(label1), /Goblin Piker \(Cloak 1\)/, `cel cloak 1: ${label1}`);
  assert.match(String(label2), /Goblin Piker \(Cloak 2\)/, `cel cloak 2: ${label2}`);
  assert.doesNotMatch(String(label2), /Morph/, 'etykieta cloak nie moze mowic „Morph”');
});
