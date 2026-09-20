// Zgłoszenie właściciela A (2026-09-19): „Lodestone Needle — craft z
// artefaktem: koszt to mana + wygnanie tego permanentu + wygnanie innego
// permanentu (pole bitwy albo grób). Gdy w grze jest DOKŁADNIE JEDEN inny
// artefakt, agent nadal każe klikać «poświęć ten jedyny inny artefakt» —
// a to powinno być automatyczne.”
//
// Zasada właściciela (stała): wybór bez alternatywy nie jest decyzją gracza.
// Root cause: `craft_transform` (effects.js) ZAWSZE wystawiał blokującą
// decyzję `pendingCraftExile`, nawet gdy lista kandydatów miała jeden
// element; gracz (i bot) musiał „wybrać” jedyny możliwy artefakt.
//
// Naprawa: wspólna ścieżka wykonania `resolveCraftExileOutcome` (effects.js)
//   - dokładnie 1 kandydat → wygnanie automatyczne (bez zdarzenia
//     `craft_exile_required`, bez komendy `resolve_craft_exile`),
//   - 2+ kandydatów → decyzja gracza jak dotąd,
//   - 0 kandydatów → no-op (CR 608.2b).
// Handler `resolve_craft_exile` (game-state.js) deleguje do tej samej
// funkcji, więc oferta i walidacja nie mogą się rozjechać (L41/L48).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addMana } from '../src/engine/resources.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId, zone, patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], ...patch,
  });
  return id;
}

/**
 * Payload drugiej strony (Guidestone Compass) — ten sam kształt, który na
 * obiekt gry kładzie `createCardDeck` (materialize.js): silnik nie zna
 * registry (ADR 0002), więc `transformTo` musi nieść komplet charakterystyk.
 * `gameObjectDataOf` sam tego nie robi — karty z talii dostają payload
 * dopiero przy instalacji talii.
 */
function transformToPayload() {
  const back = REGISTRY.get(REGISTRY.get('lodestone-needle').transformTo);
  return {
    cardId: back.id,
    kind: gameObjectDataOf(back).kind,
    power: back.power,
    toughness: back.toughness,
    abilities: back.abilities ?? [],
    keywords: back.keywords ?? [],
    subtypes: back.subtypes ?? [],
    types: back.types ?? [],
    manaCost: REGISTRY.get('lodestone-needle').manaCost ?? 0,
    cardName: back.name,
  };
}

/** Pola bitwy: Lodestone Needle p1 + `inne` artefakty; grób: `wGrobie`. */
function stan({ inne = 0, wGrobie = 0 } = {}) {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  put(state, 'needle', 'lodestone-needle', 'p1', 'battlefield', { transformTo: transformToPayload() });
  for (let i = 0; i < inne; i += 1) put(state, `inne${i}`, 'angels-feather', 'p1', 'battlefield');
  for (let i = 0; i < wGrobie; i += 1) put(state, `gr${i}`, 'seers-lantern', 'p1', 'graveyard');
  // Koszt zdolności: {2}{U} (mana: 3 + pip U).
  addMana(state, 'p1', 4, { colors: ['U'] });
  return state;
}

/** Domknięcie stosu (pass/rozstrzygnięcia) — wzorzec activated-abilities.test.js. */
function resolveStack(state) {
  let guard = 0;
  while (state.zones.stack.length > 0 && guard++ < 250) {
    const holder = state.turn.priorityPlayerId;
    const view = playerView(state, holder);
    const pick = view.legalCommands.find((c) => c.type === 'pass_priority')
      ?? view.legalCommands.find((c) => c.type.startsWith('resolve_'));
    if (!pick) return false;
    if (!execute(state, pick).ok) return false;
  }
  return state.zones.stack.length === 0;
}

/** Komenda aktywacji zdolności Craft (abilityIndex 1 — 0 to trigger ETB). */
function aktywacjaCraft(state) {
  return playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'activate_ability' && c.objectId === 'needle' && c.abilityIndex === 1);
}

test('A/1: JEDEN inny artefakt — craft rozwiązuje się bez pytania gracza', () => {
  const state = stan({ inne: 1 });
  const cmd = aktywacjaCraft(state);
  assert.ok(cmd, 'setup: zdolność Craft jest oferowana');
  const wynik = execute(state, cmd);
  assert.ok(wynik.ok !== false, `aktywacja przyjęta: ${JSON.stringify(wynik?.error ?? null)}`);
  assert.ok(resolveStack(state), 'stos domknięty (zdolność rozstrzygnięta)');
  assert.equal(state.pendingCraftExile, null,
    'wybór bez alternatywy nie może wystawiać blokującej decyzji');
  assert.ok(!state.events.some((e) => e.type === 'craft_exile_required'),
    'brak zdarzenia „wymagany wybór” przy jedynym kandydacie');
  // Skutek: drugi artefakt w wygnaniu, Needle wróciła jako Guidestone Compass.
  const wygnane = state.zones.exile.map((id) => state.objects.get(id)?.cardId);
  assert.deepEqual(wygnane.sort(), ['angels-feather'], `wygnany materiał: ${JSON.stringify(wygnane)}`);
  const przod = state.zones.battlefield
    .map((id) => state.objects.get(id))
    .filter((o) => o?.cardId === 'guidestone-compass');
  assert.equal(przod.length, 1, 'źródło wróciło przemienione (CR 702.167)');
  assert.equal(state.zones.battlefield.some((id) => state.objects.get(id)?.cardId === 'lodestone-needle'), false,
    'przednia twarz nie zostaje na polu bitwy');
  // Panel nie oferuje martwej komendy decyzji.
  assert.equal(playerView(state, 'p1').legalCommands.some((c) => c.type === 'resolve_craft_exile'), false,
    'automat = żadnej komendy resolve_craft_exile w ofercie');
});

test('A/2: kandydat tylko w grobie (1 karta) też jest automatyczny', () => {
  const state = stan({ wGrobie: 1 });
  assert.ok(execute(state, aktywacjaCraft(state)).ok !== false, 'aktywacja przyjęta');
  assert.ok(resolveStack(state), 'stos domknięty');
  assert.equal(state.pendingCraftExile, null, 'jeden kandydat = automat');
  const wygnane = state.zones.exile.map((id) => state.objects.get(id)?.cardId).sort();
  assert.deepEqual(wygnane, ['seers-lantern'], `wygnany materiał z grobu: ${JSON.stringify(wygnane)}`);
  assert.equal(state.zones.battlefield.some((id) => state.objects.get(id)?.cardId === 'guidestone-compass'), true);
});

test('A/3 (anty-over-fix): DWA artefakty to nadal decyzja gracza', () => {
  const state = stan({ inne: 2 });
  assert.ok(execute(state, aktywacjaCraft(state)).ok !== false, 'aktywacja przyjęta');
  assert.ok(resolveStack(state), 'stos domknięty');
  assert.ok(state.pendingCraftExile, 'dwóch kandydatów = realny wybór, decyzja zostaje');
  assert.deepEqual([...state.pendingCraftExile.candidateIds].sort(), ['inne0', 'inne1']);
  assert.ok(state.events.some((e) => e.type === 'craft_exile_required'), 'zdarzenie decyzji obecne');
  const oferta = playerView(state, 'p1').legalCommands.filter((c) => c.type === 'resolve_craft_exile');
  assert.equal(oferta.length, 2, `jedna komenda na kandydata: ${JSON.stringify(oferta)}`);
  assert.ok(oferta.every((c) => state.pendingCraftExile.candidateIds.includes(c.targetId)));
  // Rozstrzygnięcie komendą: ta sama ścieżka co automat (L48).
  assert.ok(execute(state, oferta[0]).ok !== false, 'wybór przyjęty');
  assert.equal(state.pendingCraftExile, null, 'decyzja zdjęta');
  assert.equal(state.zones.battlefield.some((id) => state.objects.get(id)?.cardId === 'guidestone-compass'), true);
});

test('A/4: brak jakiegokolwiek kandydata — kosztu nie da się zapłacić, brak oferty (CR 602.2b)', () => {
  // Craft wymaga wygnania INNEGO artefaktu — bez materiału koszt jest
  // niepłacalny, więc zdolność nie jest w ofercie (ta sama bramka co
  // `hasOtherArtifact` w abilities.js). Pin: brak oferty i brak decyzji.
  const state = stan({});
  assert.equal(aktywacjaCraft(state), undefined,
    'bez artefaktu do wygnania nie ma czego aktywować — oferta milczy (oferta = walidacja, L48)');
  assert.equal(state.pendingCraftExile, null, 'nie ma czego wybierać — żadnej decyzji');
  assert.equal(state.zones.battlefield.some((id) => state.objects.get(id)?.cardId === 'lodestone-needle'), true,
    'źródło zostaje na polu bitwy');
});
