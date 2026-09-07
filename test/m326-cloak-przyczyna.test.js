import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { applyEffect } from '../src/engine/effects.js';
import { addMana } from '../src/engine/resources.js';
import { FACE_DOWN_LABEL, faceDownCauseTag, faceDownLabel } from '../src/table/session.js';
import { commandLabel } from '../src/table/render.js';

/**
 * M326 (audyt PR #102, F6): PRZYCZYNA zakrycia jest informacją jawną, więc
 * stół nie może jej wywodzić z flagi znajomości reguły.
 *
 * Ruling WotC do Veiled Ascension (2024-02-02): „You must ensure that your
 * face-down spells and permanents can be easily differentiated [by] what
 * ability caused them to be face down (disguise, cloak, morph, manifest)\" —
 * dotyczy WSZYSTKICH graczy. Silnik znał przyczynę, ale wypuszczał ją do
 * widoku wyłącznie przez `cloakReady`, czyli pole ZNAJOMOŚCI (kto może obrócić),
 * bramkowane przez Fog of War. Efekt zmierzony przed naprawą: cztery z pięciu
 * miejsc stołu (nazwa kafla, badge, etykieta celu w wizardzie, log celu)
 * podpisywały cudzy cloak „Morph\" — kłamstwo o ward {2} i utrata numeru
 * kopii, przez co dwa jednakowe cloak-i przeciwnika były nierozróżnialne.
 *
 * Naprawa: `faceDownCause` (osobne pole obiektu, jawne w widoku dla obu graczy)
 * + dwa helpery w session.js jako JEDNO źródło brzmienia; `cloakReady` zostaje
 * przy decyzji o obrocie i nadal znika u przeciwnika.
 */

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId, zone = 'battlefield', extra = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, morph: def.morph ?? null, ...extra,
  });
  return state.objects.get(id);
}

function cloakedGame(cardId = 'goblin-piker') {
  const state = createGameState({ seed: 326, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  put(state, 'va', 'veiled-ascension', 'p1');
  put(state, 'lib-0', cardId, 'p1', 'library');
  state.zones.library = ['lib-0'];
  applyEffect(state, { type: 'cloak' }, state.objects.get('va'), []);
  const cloak = state.zones.battlefield.map((id) => state.objects.get(id)).find((o) => o.faceDown);
  assert.ok(cloak, 'cloak utworzony');
  return { state, cloakId: cloak.id };
}

const nameOf = (id) => REGISTRY.get(id)?.name ?? id ?? '?';

// ---- A: silnik + widok ------------------------------------------------------

test('M326/A1: obiekt z cloaka nosi jawną przyczynę zakrycia', () => {
  const { state, cloakId } = cloakedGame();
  assert.equal(state.objects.get(cloakId).faceDownCause, 'cloak', 'przyczyna na obiekcie');
});

test('M326/A2: widok Przeciwnika nosi przyczynę, ale NIE prawo obrotu ani tożsamość karty', () => {
  const { state, cloakId } = cloakedGame();
  const foe = playerView(state, 'p2').zones.battlefield.find((o) => o.id === cloakId);
  assert.equal(foe.faceDownCause, 'cloak',
    'CR 708.6 + ruling 2024-02-02: co zakryło kartę muszą widzieć WSZYSCY');
  assert.equal(foe.cardId ?? null, null, 'FoW: tożsamość karty nadal ukryta (CR 708.2a)');
  assert.equal(foe.cloakReady ?? null, null,
    'pole ZNAJOMOŚCI reguły zostaje u kontrolera — przyczyna jest jawnym zastępnikiem');
  const own = playerView(state, 'p1').zones.battlefield.find((o) => o.id === cloakId);
  assert.equal(own.cloakReady, true, 'właściciel nadal widzi prawo obrotu');
  assert.equal(own.faceDownCause, 'cloak', 'właściciel czyta tę samą przyczynę co stół');
});

test('M326/A3: uncover kasuje przyczynę razem z resztą śladów zakrycia', () => {
  const { state, cloakId } = cloakedGame();
  addMana(state, 'p1', 4, { colors: ['R'] }); // uncover płaci koszt karty (1R)
  const own = playerView(state, 'p1');
  const cmd = own.legalCommands.find((c) => c.type === 'turn_cloak_face_up');
  assert.ok(cmd, 'oferta obrotu (m322/A1)');
  // M322 przeniósł sprzątanie śladów do turnFaceUp — tu sprawdzamy, że punkt
  // zbierający obejmuje też nowe pole (inaczej face-up karta „pamiętałaby\" klosz).
  const r = execute(state, cmd);
  assert.ok(r.ok, `obrot przyjęty: ${JSON.stringify(r)}`);
  const after = state.objects.get(cloakId);
  assert.equal(after.faceDown, false, 'twarz do góry');
  assert.equal(after.faceDownCause ?? null, null, 'przyczyna zakrycia zdjęta');
});

// ---- B: morph nie dostaje znacznika cloaka (anty-nadnaprawienie) ------------

test('M326/B: zakrycie NIE z cloaka zostaje przy etykiecie „Morph\"', () => {
  // Tak wygląda w widoku permanent leżący twarzą w dół po rzucie morphem:
  // faceDown bez przyczyny (M260/B1: wygnanie też; manifest osobno).
  const morphLike = { faceDown: true, cardId: 'segmented-krotiq', copyNumber: null };
  assert.equal(faceDownCauseTag(morphLike), FACE_DOWN_LABEL, 'morph: bez zmian');
  assert.match(faceDownLabel(morphLike, nameOf), /\(Morph\)$/, 'własny morph nazwany (M100/E12)');
});

test('M326/B2: pola, którymi stół już nie może się posiłkować — przyczyna > znajomość', () => {
  const cloak = { faceDown: true, faceDownCause: 'cloak', copyNumber: 2, cardId: 'goblin-piker' };
  assert.equal(faceDownCauseTag(cloak), 'Cloak 2', 'sam znacznik z numerem kopii');
  assert.equal(faceDownLabel(cloak, nameOf), 'Goblin Piker (Cloak 2)', 'kontroler: nazwa + znacznik');
  const foeView = { faceDown: true, faceDownCause: 'cloak', copyNumber: 2, cardId: null };
  assert.equal(faceDownLabel(foeView, nameOf), 'Cloak 2',
    'widz bez cardId: sam mechanizm — dawniej „Morph\"');
  assert.equal(faceDownCauseTag({ faceDown: true }), FACE_DOWN_LABEL, 'pusto → Morf');
});

// ---- C: pięciu konsumentów czyta z jednego źródła --------------------------

test('M326/C1: etykieta celu w widoku obu graczy — „Nazwa (Cloak 1)\", u wroga „Cloak 1\"', () => {
  const { state, cloakId } = cloakedGame();
  const castCmd = { type: 'cast_spell', objectId: 'x', targets: [cloakId] };
  const labels = {};
  for (const playerId of ['p1', 'p2']) {
    const view = playerView(state, playerId);
    labels[playerId] = String(commandLabel(castCmd, { nameOf, nameOfObject: () => '?' }, view));
  }
  assert.match(labels.p1, /Goblin Piker \(Cloak 1\)/, `właściciel: ${labels.p1}`);
  assert.match(labels.p2, /Cloak 1/, `przeciwnik widzi przyczynę: ${labels.p2}`);
  assert.doesNotMatch(labels.p2, /Goblin Piker/, `FoW nadal trzyma: ${labels.p2}`);
});

test('M326/C2: żaden konsument stołu nie wyprowadza już etykiety z cloakReady (L135)', () => {
  const files = ['render.js', 'main.js', 'choice-request.js', 'picker.js', 'card-info.js'];
  const braki = [];
  for (const file of files) {
    let source;
    try {
      source = readFileSync(new URL(`../src/table/${file}`, import.meta.url), 'utf8');
    } catch {
      continue; // pliku nie ma — nic do sprawdzenia
    }
    source.split('\n').forEach((line, index) => {
      const t = line.trim();
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
      if (/\.cloakReady\b/.test(t)) braki.push(`${file}:${index + 1}: ${t}`);
    });
  }
  assert.deepEqual(braki, [], `stół znowu zgaduje przyczynę zakrycia ze znajomości reguły: ${braki.join(' ;; ')}`);
});
