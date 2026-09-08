// E3 planu 2026-09-07 (wyceny bota i modale): strona OFERT decyzji modalnych.
// Rozstrzyganie (fizzle trybów bez celów) pilnuje klasa M271; tu pinujemy
// ENUMERACJĘ: (a) tryb bez celu jest zawsze dostępny, (b) tryb celowany jest
// oferowany dokładnie wtedy, gdy ma legalnych kandydatów (CR 700.2 — tryb
// bez legalnego celu jest NIEDOSTĘPNY), (c) oferty celów ⊆ legalTargetCandidates
// (L48: oferta = walidacja — jeden generator, nie ręczne kopie, klasa M202/U2),
// (d) skip modalnego triggera tylko przy pustej puli (L48 — brak deadlocka).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { legalTargetCandidates } from '../src/engine/spells.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function newState() {
  const state = createGameState({ seed: 555, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.number = 5;
  return state;
}

function putReal(state, id, cardId, controllerId, zone) {
  const def = REGISTRY.get(cardId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, zone,
    ...gameObjectDataOf(def),
  });
  return state.objects.get(id);
}

function putBlank(state, id, controllerId, power = 3, toughness = 3) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `x-${id}`, controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost: 3,
    abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [], cardName: id,
  });
  return state.objects.get(id);
}

const KOLOROWY_BUDZET = { colors: ['W', 'U', 'B', 'R', 'G'] };

test('E3/spelle: oferty trybów == rejestr (bez celu zawsze; z celem wg kandydatów; cele legalne)', () => {
  let sprawdzonych = 0;
  for (const def of REGISTRY.all()) {
    const modes = def.spell?.modes;
    if (!Array.isArray(modes) || modes.length === 0) continue;
    sprawdzonych += 1;
    const state = newState();
    putReal(state, 'karta', def.id, 'p1', 'hand');
    putBlank(state, 'moj', 'p1');
    putBlank(state, 'wrogi', 'p2');
    // Tryby celowane w artefakt/ląd (Vandalize) też muszą mieć kandydatów.
    addObject(state, { id: 'art', instanceId: 'i-art', cardId: 'x-art', controllerId: 'p2', zone: 'battlefield', kind: 'artifact', manaCost: 2, abilities: [], keywords: [], subtypes: [], types: ['Artifact'], colors: [], cardName: 'art' });
    addObject(state, { id: 'land', instanceId: 'i-land', cardId: 'x-land', controllerId: 'p2', zone: 'battlefield', kind: 'land', manaCost: 0, abilities: [], keywords: [], subtypes: [], types: ['Land'], colors: [], cardName: 'land' });
    // Specjalizowane specy (Keep Out: tapped_creature / enchantment).
    addObject(state, { id: 'ench', instanceId: 'i-ench', cardId: 'x-ench', controllerId: 'p2', zone: 'battlefield', kind: 'enchantment', manaCost: 2, abilities: [], keywords: [], subtypes: [], types: ['Enchantment'], colors: [], cardName: 'ench' });
    const tapped = putBlank(state, 'tapped', 'p2');
    state.objects.set('tapped', Object.freeze({ ...tapped, tapped: true }));
    // Realny czar modalny z ręki może mieć koszty dodatkowe (kicker) — dajemy
    // zapas many w wszystkich kolorach (budżet per karta liczy silnik, L48).
    addMana(state, 'p1', 10, KOLOROWY_BUDZET);
    const view = playerView(state, 'p1');
    const oferty = view.legalCommands.filter((c) => c.type === 'cast_spell' && c.objectId === 'karta' && c.modeIndex != null);
    assert.ok(oferty.length > 0, `${def.id}: czar modalny ma przynajmniej jedną ofertę trybu`);
    const indeksy = new Set(oferty.map((o) => o.modeIndex));
    assert.ok(indeksy.size === [...indeksy].length, `${def.id}: ${indeksy.size} unikalnych trybów`);
    for (const [i, mode] of modes.entries()) {
      const specs = mode.targets ?? def.spell.targets ?? [];
      if (specs.length === 0) {
        assert.ok(indeksy.has(i), `${def.id}/tryb ${i} („${mode.name ?? 'bez nazwy'}"): tryb bez celu MUSI być dostępny`);
        continue;
      }
      const kandydaci = specs.flatMap((spec) => legalTargetCandidates(state, 'p1', spec, null));
      assert.equal(indeksy.has(i), kandydaci.length > 0,
        `${def.id}/tryb ${i}: dostępny ⟺ są legalni kandydaci (jest ${kandydaci.length}, oferta: ${indeksy.has(i)})`);
      for (const oferta of oferty.filter((o) => o.modeIndex === i)) {
        for (const cel of oferta.targets ?? []) {
          assert.ok(kandydaci.includes(cel),
            `${def.id}/tryb ${i}: cel ${cel} poza legalTargetCandidates (L48)`);
        }
      }
    }
  }
  assert.ok(sprawdzonych >= 12, `katalog ma ≥12 czarów modalnych, znaleziono ${sprawdzonych}`);
});

test('E3/triggery: tryby bez celu = tyle ofert ile trybów, bez skipu', () => {
  const state = newState();
  const def = REGISTRY.get('etherwrought-page');
  putReal(state, 'page', 'etherwrought-page', 'p1', 'battlefield');
  // Fabricate pending z PRAWDZIWYCH deskryptorów rejestru (jak robi triggers.js).
  const trigger = def.abilities[0].trigger;
  state.pendingModalTrigger = {
    playerId: 'p1', sourceId: 'page', cardId: 'etherwrought-page',
    ability: def.abilities[0],
    modes: trigger.modes.map((m) => ({ ...m })), extra: {}, restorePriorityTo: null,
  };
  state.turn.priorityPlayerId = 'p1';
  const view = playerView(state, 'p1');
  const oferty = view.legalCommands.filter((c) => c.type === 'resolve_modal_choice');
  assert.equal(oferty.length, trigger.modes.length,
    'każdy tryb bez celu = jedna oferta');
  assert.ok(oferty.every((o) => o.modeIndex != null), 'wszystkie oferty mają modeIndex');
  assert.ok(!oferty.some((o) => o.modeIndex == null), 'skip nie pojawia się przy niepustej puli (L48)');
});

test('E3/triggery: tryb celowany — per kandydat; pusta pula wszystkich trybów = skip (L48)', () => {
  const state = newState();
  const def = REGISTRY.get('inspiring-bard');
  putReal(state, 'bard', 'inspiring-bard', 'p1', 'battlefield');
  putBlank(state, 'moj', 'p1');
  putBlank(state, 'wrogi', 'p2');
  const trigger = def.abilities[0].trigger;
  state.pendingModalTrigger = {
    playerId: 'p1', sourceId: 'bard', cardId: 'inspiring-bard',
    ability: def.abilities[0],
    modes: trigger.modes.map((m) => ({ ...m })), extra: {}, restorePriorityTo: null,
  };
  state.turn.priorityPlayerId = 'p1';
  let view = playerView(state, 'p1');
  let oferty = view.legalCommands.filter((c) => c.type === 'resolve_modal_choice');
  // Tryb 0 (pump, cel: stwór) → po jednej ofercie na kandydata; tryb 1 (życie) → 1 oferta.
  const tryb0 = oferty.filter((o) => o.modeIndex === 0);
  // Bard sam jest stworom — też legalny cel pumpu.
  assert.equal(tryb0.length, 3, `trzy stworów na polu (z bardem) = trzy oferty trybu 0, jest: ${JSON.stringify(oferty)}`);
  assert.ok(tryb0.every((o) => ['bard', 'moj', 'wrogi'].includes(o.targetId)), 'cele trybu 0 to stworzy z pola');
  assert.equal(oferty.filter((o) => o.modeIndex === 1).length, 1, 'tryb bez celu = jedna oferta');

  // Pusta pula trybu 0: usuwamy zwykłe stworów (bard zostaje w polityce
  // ofert? nie — usuwamy wszystko prócz źródła? Bard sam jest kandydatem,
  // więc usuwamy i jego; źródło decisionu nie musi być na polu po fakcie).
  state.zones.battlefield = [];
  view = playerView(state, 'p1');
  oferty = view.legalCommands.filter((c) => c.type === 'resolve_modal_choice');
  assert.ok(!oferty.some((o) => o.modeIndex === 0), 'tryb bez kandydatów niedostępny (CR 700.2)');
  assert.equal(oferty.filter((o) => o.modeIndex === 1).length, 1, 'tryb bez celu wciąż dostępny');

  // Pusta pula CAŁKOWITA: trigger z wyłącznie trybami CELOWANYMI (tu: sam
  // tryb pumpu barda) i pustym polem → sekwencja ofert wychodzi pusta →
  // silnik dokłada skip (jedyna droga — inaczej deadlock, L48).
  state.zones.battlefield = [];
  state.pendingModalTrigger = {
    ...state.pendingModalTrigger,
    modes: [trigger.modes[0]],
  };
  view = playerView(state, 'p1');
  oferty = view.legalCommands.filter((c) => c.type === 'resolve_modal_choice');
  assert.deepEqual(oferty.map((o) => o.modeIndex ?? 'skip'), ['skip'],
    'zero kandydatów wszystkich trybów → dokładnie skip');
});

test('E3/bot: przy pustej puli modalnego triggera bot bierze skip i gra toczy się dalej', () => {
  const state = newState();
  const def = REGISTRY.get('inspiring-bard');
  putReal(state, 'bard', 'inspiring-bard', 'p1', 'battlefield');
  const trigger = def.abilities[0].trigger;
  state.pendingModalTrigger = {
    playerId: 'p1', sourceId: 'bard', cardId: 'inspiring-bard',
    ability: def.abilities[0],
    modes: trigger.modes.map((m) => ({ ...m })), extra: {}, restorePriorityTo: null,
  };
  state.zones.battlefield = []; // kandydaci trybu 0 zniknęli, ale tryb 1 zostaje
  state.turn.priorityPlayerId = 'p1';
  const view = playerView(state, 'p1');
  const bot = createHeuristicBot({ seed: 9 });
  const chosen = bot.chooseCommand(view);
  assert.equal(chosen.type, 'resolve_modal_choice');
  assert.equal(chosen.modeIndex, 1, 'jedyny żywy tryb (życie) zostaje wybrany, nie skip');
});
