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
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { stateFingerprint } from '../src/engine/fingerprint.js';
import { applyEffect } from '../src/engine/effects.js';
import { rulesText } from '../src/table/render.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';

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

// ---- Z5: Saga bez typu Creature działa na stole (Invasion of the Giants) ---

test('Z5a: rzut Invasion of the Giants z ręki — lore 1 i rozdział I (scry 2) odpala', () => {
  const state = game();
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  putCard(state, 'inv', 'invasion-of-the-giants', 'p1', 'hand');
  // Scry potrzebuje niepustej biblioteki (inaczej rozdział I to no-op).
  putCard(state, 'lib1', 'wrap-in-flames', 'p1', 'library');
  putCard(state, 'lib2', 'revolutionist', 'p1', 'library');
  addMana(state, 'p1', 2, { colors: ['U', 'R'] });
  const offer = playerView(state, 'p1').legalCommands.find((c) => c.type === 'cast_permanent' && c.objectId === 'inv');
  assert.ok(offer, 'oferta rzutu Sagi');
  assert.ok(execute(state, offer).ok);
  for (let i = 0; i < 8 && !state.pendingScry; i += 1) {
    execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  }
  const onBf = [...state.objects.values()].find((o) => o.cardId === 'invasion-of-the-giants' && o.zone === 'battlefield');
  assert.ok(onBf, 'Saga na polu bitwy');
  assert.ok(onBf.saga, 'obiekt na stole NIESIE deskryptor saga (nie tylko rejestr — L5/L21)');
  assert.equal(onBf.counters?.lore, 1, 'licznik lore po wejściu (CR 714.3a)');
  assert.ok(state.pendingScry, 'rozdział I: scry 2 czeka na decyzję');
  assert.equal(state.pendingScry.playerId, 'p1');
});

test('Z5b (strażnik łańcucha pól): żaden deskryptor mechaniki nie ginie w materialize', () => {
  // Klasa Z5: gameObjectDataOf ma osobne gałęzie per kind i każda kopiuje
  // pola RĘCZNIE — karta z mechaniką w „nietypowej” gałęzi (Saga-enchantment,
  // w przyszłości np. instant z madness) gubi deskryptor PO CICHU. Każde
  // pole mechaniki obecne na definicji musi trafić na obiekt gry.
  const MECHANIC_FIELDS = ['madness', 'saga', 'warp', 'suspend', 'plot', 'kicker',
    'adventure', 'buyback', 'bestow', 'devour', 'endure', 'exploit', 'backup',
    'bloodthirst', 'additionalCost', 'costReduction', 'treasureAltCost',
    'equipment', 'aura', 'station', 'morph', 'entersWithCounters', 'rebound',
    // M200/N2: gałąź spell gubiła pole — karta-czar z pitem phyrexian
    // (Ruthless Invasion) nie miała wariantów płatności życiem.
    'phyrexianManaCost'];
  for (const def of REGISTRY.all()) {
    const data = gameObjectDataOf(def);
    for (const field of MECHANIC_FIELDS) {
      if (!def[field]) continue;
      assert.ok(data[field],
        `${def.id}: gameObjectDataOf gubi deskryptor ${field} (gałąź kind=${data.kind})`);
    }
  }
});
