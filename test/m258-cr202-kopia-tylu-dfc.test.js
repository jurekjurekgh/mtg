import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState, addObject } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { applyEffect } from '../src/engine/effects.js';
import { execute } from '../src/engine/game-state.js';
import { createCardDeck } from '../src/cards/materialize.js';

/**
 * M258 (Etap 2.3 — CR hunt): CR 202.3b — „The mana value of a transforming
 * double-faced permanent or spell's back face is calculated as though it
 * had the mana cost of its front face. If a permanent or spell is a copy
 * of the back face of a transforming double-faced card (even if the card
 * representing that copy is itself a double-faced card), the mana value
 * of the copy is 0."
 *
 * Sam przekształcony permanent ma MV przedniej strony (712.8e) — silnik
 * modeluje to polam manaCost, którego transform NIE rusza (koszt przedni).
 * Ale KOPIA takiego obiektu (token-kopia z Cogwork Assemblera, kopia
 * „enter as copy" Jwari) ma MV 0 — obie ścieżki kopiowania brały koszt
 * przedniej strony (albo, jak enterAsCopy, NIE kopiowały kosztu wcale —
 * CR 707.2: koszt many jest wartością kopiowalną).
 *
 * Osiągalne w katalogu: Lodestone Needle (przód MV 2) → craft →
 * Guidestone Compass (tył, artefakt) kopiowany Cogwork Assemblerem;
 * Jwari Shapeshifter kopiujący przekształconego civilized-scholar
 * (tył = Homicidal Brute).
 */

const REGISTRY = createCardRegistry();

function game(playerId = 'p1') {
  const state = createGameState({ seed: 42, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

/** Pełna materializacja karty z talii (createCardDeck) — z transformTo
 * zbudowanym przez realną fabrykę (L94: ręczny payload w teście omija warstwę,
 * w której giną pola). */
function materializedEntry(cardId, ownerId = 'p1') {
  return createCardDeck({ cardIds: [cardId], ownerId, registry: REGISTRY })[0];
}

function putMaterialized(state, id, entry, controllerId = 'p1') {
  const { instanceId, objectId, cardId, ownerId, ...data } = entry;
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId,
    zone: 'battlefield', ...data,
  });
  return state.objects.get(id);
}

function putOnBattlefield(state, id, cardId, controllerId = 'p1', extra = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId,
    zone: 'battlefield', kind: def.kind ?? (def.types ?? []).includes('Creature') ? 'creature' : 'artifact',
    power: def.power ?? null, toughness: def.toughness ?? null,
    manaCost: def.manaCost ?? 0, abilities: def.abilities ?? [],
    colors: def.colors ?? [], types: def.types ?? [], keywords: [],
    subtypes: def.subtypes ?? [], ...extra,
  });
  return state.objects.get(id);
}

test('M258/C1: token-kopia TYLNEJ twarzy DFC ma MV 0 (CR 202.3b, Cogwork Assembler)', () => {
  const state = game();
  // Lodestone Needle (MV 2) na polu bitwy przez REALNĄ materializację
  // (payload transformTo buduje createCardDeck — L94).
  putMaterialized(state, 'needle', materializedEntry('lodestone-needle'));
  // Craft = exile + return transformed; efekt `transform` daje ten sam stan
  // „tył w górę" (cardId = tył, manaCost pozostaje przedni — 712.8e).
  applyEffect(state, { type: 'transform' }, state.objects.get('needle'), []);
  const transformed = state.objects.get('needle');
  assert.equal(transformed.cardId, 'guidestone-compass', 'tył w górę po transformacji');
  assert.equal(transformed.manaCost, 2, 'sam permanent ma MV przedniej strony (712.8e)');

  // Cogwork Assembler kopiuje przekształcony artefakt.
  const cogwork = putOnBattlefield(state, 'cogwork', 'cogwork-assembler', 'p1');
  applyEffect(state, { type: 'create_copy_token' }, cogwork, ['needle']);

  const token = state.zones.battlefield
    .map((id) => state.objects.get(id))
    .find((o) => o.id !== 'needle' && o.id !== 'cogwork' && o.cardId === 'guidestone-compass');
  assert.ok(token, 'token-kopia powstał');
  assert.equal(token.manaCost, 0, 'kopia tylnej twarzy ma MV 0 (CR 202.3b) — RED przed fixem: 2');
  assert.ok(token.transformTo, 'token dwustronny (M90/CR 707.8a)');
});

test('M258/C2: token-kopia PRZEDNIEJ twarzy DFC ma koszt przedni (anty-over-fix)', () => {
  const state = game();
  putMaterialized(state, 'needle', materializedEntry('lodestone-needle'));
  const cogwork = putOnBattlefield(state, 'cogwork', 'cogwork-assembler', 'p1');
  applyEffect(state, { type: 'create_copy_token' }, cogwork, ['needle']);
  const token = state.zones.battlefield
    .map((id) => state.objects.get(id))
    .find((o) => o.id !== 'needle' && o.id !== 'cogwork' && o.cardId === 'lodestone-needle');
  assert.ok(token, 'token-kopia powstał');
  assert.equal(token.manaCost, 2, 'kopia przedniej twarzy zachowuje koszt {2}');
});

test('M258/C3: „enter as copy" tyłu DFC — MV kopii 0 (CR 202.3b; wcześniej w ogóle bez kosztu)', () => {
  const state = game();
  putMaterialized(state, 'scholar', materializedEntry('civilized-scholar'));
  applyEffect(state, { type: 'transform' }, state.objects.get('scholar'), []);
  assert.equal(state.objects.get('scholar').cardId, 'homicidal-brute', 'tył w górę');

  putOnBattlefield(state, 'jwari', 'jwari-shapeshifter', 'p1');
  state.pendingEnterAsCopy = {
    playerId: 'p1', sourceId: 'jwari', candidateIds: ['scholar'], restorePriorityTo: 'p1',
  };
  const result = execute(state, { type: 'resolve_enter_as_copy', playerId: 'p1', targetId: 'scholar' });
  assert.equal(result.ok, true, 'kopiowanie się udaje');
  const copy = state.objects.get('jwari');
  assert.equal(copy.manaCost, 0, 'kopia tylnej twarzy ma MV 0 — RED przed fixem: 2 (własny koszt Jwari)');
});

test('M258/C4: „enter as copy" przodu — kopia przejmuje koszt many celu (CR 707.2)', () => {
  const state = game();
  // civilized-scholar: {2}{U} = MV 3, Jwari: {1}{U} = MV 2 — różnica obserwowalna.
  putMaterialized(state, 'scholar', materializedEntry('civilized-scholar'));
  putOnBattlefield(state, 'jwari', 'jwari-shapeshifter', 'p1');
  state.pendingEnterAsCopy = {
    playerId: 'p1', sourceId: 'jwari', candidateIds: ['scholar'], restorePriorityTo: 'p1',
  };
  const result = execute(state, { type: 'resolve_enter_as_copy', playerId: 'p1', targetId: 'scholar' });
  assert.equal(result.ok, true);
  const copy = state.objects.get('jwari');
  assert.equal(copy.manaCost, 3, 'koszt many jest wartością kopiowalną (CR 707.2) — RED przed fixem: 2');
});

// ---- Etap 2.3b: likwidacja „znanego ograniczenia" — kopia tyłu, która
// przekształca się z powrotem w przód, ma MV przedniej strony (CR 707.8a +
// 202.3b: token-kopia jest tokenem dwustronnym; z przodem w górę jego
// kopiowalnym kosztem many jest koszt skopiowanej twarzy przedniej).

test('M258/C5: token-kopia tyłu po transformacji na przód ma MV przedniej twarzy (CR 707.8a)', () => {
  const state = game();
  const needle = putMaterialized(state, 'needle', materializedEntry('lodestone-needle'));
  applyEffect(state, { type: 'transform' }, needle, []);
  assert.equal(state.objects.get('needle').cardId, 'guidestone-compass', 'tył w górę');

  const cogwork = putOnBattlefield(state, 'cogwork', 'cogwork-assembler', 'p1');
  applyEffect(state, { type: 'create_copy_token' }, cogwork, ['needle']);
  const token = state.zones.battlefield
    .map((id) => state.objects.get(id))
    .find((o) => o.isToken && o.cardId === 'guidestone-compass');
  assert.ok(token, 'token-kopia tyłu powstał');
  assert.equal(token.manaCost, 0, 'tył w górę: MV 0 (CR 202.3b)');

  // Token jest dwustronny — craft/transform z powrotem na przód.
  applyEffect(state, { type: 'transform' }, token, []);
  const flipped = state.objects.get(token.id);
  assert.equal(flipped.cardId, 'lodestone-needle', 'token z powrotem na przedniej twarzy');
  assert.equal(flipped.manaCost, 2, 'przód w górę: MV = koszt przedniej twarzy (RED przed fixem: 0)');
});

test('M258/C6: craft na tokenie-kopii tyłu wraca przodem z kosztem przednim (pełna ścieżka craft)', () => {
  const state = game();
  const needle = putMaterialized(state, 'needle', materializedEntry('lodestone-needle'));
  const fodder = putMaterialized(state, 'fodder', materializedEntry('lodestone-needle'));
  // craft: needle -> compass (pełny resolver resolve_craft_exile)
  state.pendingCraftExile = {
    playerId: 'p1', sourceId: 'needle', candidateIds: ['fodder'],
    transformTo: needle.transformTo, restorePriorityTo: 'p1',
  };
  let result = execute(state, { type: 'resolve_craft_exile', playerId: 'p1', targetId: 'fodder' });
  assert.equal(result.ok, true, 'craft się udał');
  // craft zwraca NOWY obiekt (CR 400.7) — szukamy po cardId, nie po starym id
  const compass = state.zones.battlefield
    .map((id) => state.objects.get(id))
    .find((o) => o.cardId === 'guidestone-compass');
  assert.ok(compass, 'needle wrócił jako compass');
  assert.equal(compass.manaCost, 2, 'compass (tył): MV przedniej strony (CR 202.3b)');

  // kopia tyłu (MV 0), potem craft na KOPII z powrotem na przód
  const cogwork = putOnBattlefield(state, 'cogwork', 'cogwork-assembler', 'p1');
  applyEffect(state, { type: 'create_copy_token' }, cogwork, [compass.id]);
  const token = state.zones.battlefield
    .map((id) => state.objects.get(id))
    .find((o) => o.isToken && o.cardId === 'guidestone-compass');
  assert.ok(token, 'token-kopia tyłu powstał');
  assert.equal(token.manaCost, 0);

  const fodder2 = putMaterialized(state, 'fodder2', materializedEntry('lodestone-needle'));
  state.pendingCraftExile = {
    playerId: 'p1', sourceId: token.id, candidateIds: ['fodder2'],
    transformTo: token.transformTo, restorePriorityTo: 'p1',
  };
  result = execute(state, { type: 'resolve_craft_exile', playerId: 'p1', targetId: 'fodder2' });
  assert.equal(result.ok, true, 'craft na tokenie się udał');
  const recrafted = state.zones.battlefield
    .map((id) => state.objects.get(id))
    .find((o) => o.cardId === 'lodestone-needle' && o.isToken);
  assert.ok(recrafted, 'token wrócił przodem');
  assert.equal(recrafted.manaCost, 2, 'craft na kopii: MV przedniej twarzy (RED przed fixem: 0)');
});

test('M258/C7: wilkołak w obie strony trzyma MV przedniej twarzy (anty-over-fix, CR 202.3b zd. 1)', () => {
  const state = game();
  const scholar = putMaterialized(state, 'scholar', materializedEntry('civilized-scholar'));
  assert.equal(scholar.manaCost, 3);
  applyEffect(state, { type: 'transform' }, scholar, []);
  const brute = state.objects.get('scholar');
  assert.equal(brute.cardId, 'homicidal-brute');
  assert.equal(brute.manaCost, 3, 'tył w górę: MV przedniej (3)');
  applyEffect(state, { type: 'transform' }, brute, []);
  const back = state.objects.get('scholar');
  assert.equal(back.cardId, 'civilized-scholar');
  assert.equal(back.manaCost, 3, 'z powrotem przód: wciąż 3');
});

test('M258/C8: reset K5 przy opuszczeniu pola niesie koszt w payloadzie transformTo (kontrakt L94)', () => {
  const state = game();
  const needle = putMaterialized(state, 'needle', materializedEntry('lodestone-needle'));
  applyEffect(state, { type: 'transform' }, needle, []);
  // bounce do ręki (K5: reset na przód poza polem bitwy) — źródłem dowolny spell-stub
  const src = putOnBattlefield(state, 'src', 'cogwork-assembler', 'p2');
  applyEffect(state, { type: 'bounce_permanent' }, src, ['needle']);
  const inHand = state.zones.hand.map((id) => state.objects.get(id)).find((o) => o.cardId === 'lodestone-needle');
  assert.ok(inHand, 'needle wrócił do ręki przodem (K5)');
  assert.equal(inHand.manaCost, 2, 'karta w ręce: koszt przedni');
  assert.equal(inHand.transformTo?.manaCost, 2, 'payload tylnej twarzy niesie MV tej twarzy (RED przed fixem: undefined)');
});
