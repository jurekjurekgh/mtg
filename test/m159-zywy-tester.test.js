// M159 — pętla jakości (Żywy Tester, partie g1–g7 na kartach Batch 39).
//
// Z1: `regenerationShields`/`cantBeRegeneratedThisTurn` oraz pola obiektu
//     `lostKeywordsUntilEOT`/`subtypesBeforeOverride`/`madnessReady` nie były
//     częścią fingerprinta (klasa M122/#1) — sonda „oferta bez skutku"
//     fałszywie zgłaszała działający Regenerate (Exterminator Magmarch, g7),
//     a weryfikacja replayów nie odróżniała stanów z tarczą i bez.
// Z2: trigger z warunkiem multiplayer (anotherOpponentExists) renderował
//     pusty szum „Gdy rzucisz czar: ." na kaflu karty (g7) — kafel ma mówić
//     wprost, że trigger jest nieaktywny w 1v1.
// Z3 (strażnik klasy): ŻADNA karta katalogu nie renderuje opisu zdolności
//     kończącego się „: ." (pusta treść po dwukropku).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { stateFingerprint } from '../src/engine/fingerprint.js';
import { applyEffect } from '../src/engine/effects.js';
import { rulesText } from '../src/table/render.js';

const REGISTRY = createCardRegistry();

function game() {
  const state = createGameState({ seed: 159, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.status = 'active';
  return state;
}

function putCard(state, id, cardId, controllerId = 'p1', zone = 'battlefield') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  return state.objects.get(id);
}

test('Z1a: tarcza regeneracji zmienia fingerprint stanu', () => {
  const state = game();
  const magmarch = putCard(state, 'mag', 'exterminator-magmarch', 'p1');
  const before = stateFingerprint(state);
  applyEffect(state, { type: 'regenerate' }, magmarch, []);
  assert.ok((state.regenerationShields ?? []).includes('mag'), 'tarcza dodana');
  assert.notEqual(stateFingerprint(state), before,
    'stan z tarczą regeneracji ≠ stan bez tarczy (sonda noop / replay)');
});

test('Z1b: cantBeRegeneratedThisTurn zmienia fingerprint stanu', () => {
  const state = game();
  putCard(state, 'mag', 'exterminator-magmarch', 'p1');
  const before = stateFingerprint(state);
  state.cantBeRegeneratedThisTurn = ['mag'];
  assert.notEqual(stateFingerprint(state), before);
});

test('Z1c: lostKeywordsUntilEOT (bez zmiany podtypów) zmienia fingerprint', () => {
  const state = game();
  const merfolk = putCard(state, 'wish', 'wishful-merfolk', 'p1');
  const before = stateFingerprint(state);
  // Sama utrata keyworda (podtypy bez zmian) — musi być widoczna w odcisku.
  applyEffect(state, {
    type: 'becomes_subtype_until_end_of_turn', subtypes: [], losesKeywords: ['defender'],
  }, merfolk, ['wish']);
  assert.deepEqual([...state.objects.get('wish').lostKeywordsUntilEOT], ['defender']);
  assert.notEqual(stateFingerprint(state), before);
});

test('Z1d: madnessReady na karcie w exile zmienia fingerprint', () => {
  const state = game();
  putCard(state, 'rev', 'revolutionist', 'p1', 'exile');
  const before = stateFingerprint(state);
  state.objects.set('rev', Object.freeze({ ...state.objects.get('rev'), madnessReady: true }));
  assert.notEqual(stateFingerprint(state), before);
});

test('Z2: kafel Magmarcha mówi o martwym triggerze 1v1 zamiast „Gdy rzucisz czar: ."', () => {
  const def = REGISTRY.get('exterminator-magmarch');
  const text = rulesText({
    cardId: def.id, controllerId: 'p1', abilities: def.abilities,
    keywords: def.keywords ?? [], spell: null, equipment: null, plot: null,
  });
  assert.ok(!text.includes('Gdy rzucisz czar: .'), `pusty szum na kaflu: ${text}`);
  assert.ok(text.includes('nieaktywny w grze 1v1'), `brak informacji o martwym triggerze: ${text}`);
  assert.ok(text.includes('tarcza regeneracji'), `opis Regenerate zniknął: ${text}`);
});

test('Z4: kafel Sagi opisuje rozdziały (Invasion of the Giants nie jest pustym kaflem)', () => {
  const def = REGISTRY.get('invasion-of-the-giants');
  const text = rulesText({
    cardId: def.id, controllerId: 'p1', abilities: def.abilities ?? [],
    keywords: def.keywords ?? [], spell: def.spell ?? null,
    equipment: def.equipment ?? null, plot: def.plot ?? null, saga: def.saga ?? null,
  });
  assert.ok(text.includes('Saga'), `kafel Sagi bez treści: ${text}`);
  assert.ok(text.includes('I:') && text.includes('II:') && text.includes('III:'),
    `kafel Sagi nie opisuje rozdziałów: ${text}`);
  assert.ok(text.includes('scry 2'), `rozdział I bez opisu scry: ${text}`);
});

test('Z3 (strażnik): żadna karta katalogu nie renderuje opisu „...: ."', () => {
  for (const def of REGISTRY.all()) {
    const text = rulesText({
      cardId: def.id, controllerId: 'p1', abilities: def.abilities ?? [],
      keywords: def.keywords ?? [], spell: def.spell ?? null,
      equipment: def.equipment ?? null, plot: def.plot ?? null, saga: def.saga ?? null,
    });
    assert.ok(!text.includes(': .'), `${def.id}: pusty opis zdolności na kaflu — „${text}"`);
    // M159/Z4: karta z rozdziałami Sagi musi mieć linię „Saga — …” na kaflu.
    if (def.saga?.chapters?.length) {
      assert.ok(text.includes('Saga —'), `${def.id}: Saga bez opisu rozdziałów — ${text}`);
    }
  }
});
