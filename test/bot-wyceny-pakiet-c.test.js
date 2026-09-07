// E2/C planu 2026-09-07 (wyceny bota): wartości kart, zasobów i darmowych
// rzutów — decyzje wielowariantowe bez case (default: finish(0) → wybór
// z kolejności ofert, klasa M131/M336). Ekspozycje widoku (destroy_equipment,
// moonlit) są decydent-only i niosą wyłącznie informację publiczną.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { attachEquipmentToCreature } from '../src/engine/attachments.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';

const REGISTRY = createCardRegistry();

function newState() {
  const state = createGameState({ seed: 101, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.number = 5;
  return state;
}

function putCreature(state, id, controllerId, power, toughness, zone = 'battlefield', extra = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: extra.cardId ?? `x-${id}`, controllerId, zone,
    kind: 'creature', power, toughness, manaCost: extra.manaCost ?? 3,
    abilities: [], keywords: extra.keywords ?? [], subtypes: [], types: ['Creature'],
    colors: extra.colors ?? [], cardName: id,
  });
  return state.objects.get(id);
}

function putEquip(state, id, controllerId, hostId) {
  // L21: addObject wypuszcza `attachedTo` z kontraktu — załączenie TYLKO
  // przez attachEquipmentToCreature (jak w prawdziwym flow equiptu).
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `eq-${id}`, controllerId, zone: 'battlefield',
    kind: 'artifact', equipment: true, manaCost: 2,
    abilities: [], keywords: [], subtypes: [], types: ['Artifact'], colors: [], cardName: id,
  });
  attachEquipmentToCreature(state, id, hostId);
}

function botChoice(state) {
  const view = playerView(state, 'p1');
  const bot = createHeuristicBot({ seed: 9 });
  return bot.chooseCommand(view);
}

test('E2/C1: look_top — do ręki idzie najcenniejsza karta z wierzchu (nie pierwsza)', () => {
  const state = newState();
  // kind przez extra — obiekt addObject jest zamrożony (mutacja w miejscu rzuca).
  putCreature(state, 'land', 'p1', 0, 0, 'library', { manaCost: 0, cardId: 'basic-forest', kind: 'land' });
  putCreature(state, 'skarb', 'p1', 5, 5, 'library', { manaCost: 2 });
  state.pendingLookTopN = { playerId: 'p1', objectIds: ['land', 'skarb'], restTo: 'graveyard', sourceCardId: null, restorePriorityTo: null };
  state.turn.priorityPlayerId = 'p1';
  const chosen = botChoice(state);
  assert.equal(chosen.type, 'resolve_look_top_choice');
  assert.equal(chosen.cardId, 'skarb', `bierzemy 5/5 za 2, wybrał: ${JSON.stringify(chosen)}`);
});

test('E2/C2: hand_top — na wierzch własnej biblioteki idzie NAJCENNEJSZA karta (wróci przy dobraniu)', () => {
  const state = newState();
  // Baza many (L116): bez lądów cardKeepValue uzna drogiego stwora za
  // „poza zasięgiem" i wycena odwróci kierunek.
  for (const [i,] of [1, 2, 3, 4].entries()) {
    addObject(state, { id: `l${i}`, instanceId: `i-l${i}`, cardId: 'basic-forest', controllerId: 'p1', zone: 'battlefield', kind: 'land', manaCost: 0, abilities: [], keywords: [], subtypes: [], types: ['Land'], colors: ['G'], cardName: 'Forest' });
  }
  putCreature(state, 'slaby', 'p1', 1, 1, 'hand', { manaCost: 1 });
  putCreature(state, 'mocny', 'p1', 6, 6, 'hand', { manaCost: 6 });
  state.pendingHandTopChoice = { playerId: 'p1', handIds: ['slaby', 'mocny'], sourceCardId: 'sr', restorePriorityTo: null };
  state.turn.priorityPlayerId = 'p1';
  const chosen = botChoice(state);
  assert.equal(chosen.type, 'resolve_hand_top_choice');
  assert.equal(chosen.cardId, 'mocny', `na wierzch idzie 6/6 (to mój następny dobór), wybrał: ${JSON.stringify(chosen)}`);
});

test('E2/C3: reveal_exile_grave — z grobu WROGA wygnaj najcenniejszą (ucina recursję)', () => {
  const state = newState();
  for (const [i,] of [1, 2, 3, 4].entries()) {
    addObject(state, { id: `l${i}`, instanceId: `i-l${i}`, cardId: 'basic-forest', controllerId: 'p1', zone: 'battlefield', kind: 'land', manaCost: 0, abilities: [], keywords: [], subtypes: [], types: ['Land'], colors: ['G'], cardName: 'Forest' });
  }
  putCreature(state, 'tani', 'p2', 1, 1, 'graveyard', { manaCost: 1 });
  putCreature(state, 'silny', 'p2', 6, 6, 'graveyard', { manaCost: 5 });
  state.pendingRevealExile = {
    playerId: 'p1', opponentId: 'p2', cardId: null, stage: 'grave',
    handIds: [], graveIds: ['tani', 'silny'], chosenHand: null, chosenGrave: null,
    restorePriorityTo: null,
  };
  state.turn.priorityPlayerId = 'p1';
  const chosen = botChoice(state);
  assert.equal(chosen.type, 'resolve_reveal_exile_grave');
  assert.equal(chosen.cardId, 'silny', `wygnanie z grobu wroga: 6/6, wybrał: ${JSON.stringify(chosen)}`);
});

test('E2/C4: destroy_equipment — WŁASNY sprzęt na własnym gospodarzu zostaje', () => {
  const state = newState();
  putCreature(state, 'moj-host', 'p1', 3, 3);
  putEquip(state, 'moj-miecz', 'p1', 'moj-host');
  state.pendingDestroyEquipment = { playerId: 'p1', targetId: 'moj-host', restorePriorityTo: null };
  state.turn.priorityPlayerId = 'p1';
  const chosen = botChoice(state);
  assert.equal(chosen.type, 'resolve_destroy_equipment_choice');
  assert.equal(chosen.destroy, false, `własny sprzęt zostaje, wybrał: ${JSON.stringify(chosen)}`);
});

test('E2/C4b: destroy_equipment — WROGI SPRZĘT pada, nawet gdy gospodarz przejęty (m257r5b/C2)', () => {
  const state = newState();
  // Scenariusz Awaken: stwór wroga PRZEJĘTY przez bota, ale miecz nadal
  // kontroluje wroga (może go później odpikować) — niszczymy.
  putCreature(state, 'przejety', 'p1', 3, 3);
  putEquip(state, 'wrogi-miecz', 'p2', 'przejety');
  state.pendingDestroyEquipment = { playerId: 'p1', targetId: 'przejety', restorePriorityTo: null };
  state.turn.priorityPlayerId = 'p1';
  const chosen = botChoice(state);
  assert.equal(chosen.destroy, true, `sprzęt wroga pada, wybrał: ${JSON.stringify(chosen)}`);
});

test('E2/C5: land_type — typ pod niepokryte pipy ręki (Forest przy zielonej ręce)', () => {
  const state = newState();
  // Pipy czyta coloredPipsOf(cardId) z REJESTRU (L48) — w ręce realne zielone
  // karty katalogu (ADR 0029: katalog bez zmian, karty tylko z niego).
  const putReal = (id, cardId) => {
    const def = REGISTRY.get(cardId);
    const data = gameObjectDataOf(def);
    addObject(state, {
      id, instanceId: `i-${id}`, cardId, controllerId: 'p1', zone: 'hand',
      kind: data.kind, power: data.power, toughness: data.toughness, manaCost: data.manaCost,
      spell: data.spell, abilities: data.abilities ?? [], keywords: def.keywords ?? [],
      subtypes: def.subtypes ?? [], types: def.types ?? [], colors: data.colors ?? [],
      cardName: def.name,
    });
  };
  putReal('g1', 'inspiring-bard');
  putReal('g2', 'servant-of-the-scale');
  state.pendingLandTypeChoice = { playerId: 'p1', targetId: 'frontier', restorePriorityTo: null };
  state.turn.priorityPlayerId = 'p1';
  const chosen = botChoice(state);
  assert.equal(chosen.type, 'resolve_land_type_choice');
  assert.equal(chosen.landType, 'Forest', `pip {G} w ręce → Forest, wybrał: ${JSON.stringify(chosen)}`);
});

test('E2/C6: moonlit — słaby pierwowzór: zostawiamy zwykłe tokeny (replace:false)', () => {
  const state = newState();
  putCreature(state, 'zniszczony', 'p1', 1, 1);
  state.pendingMoonlitChoice = {
    playerId: 'p1', sourceId: 'aura', enchantedId: 'zniszczony', sourceObjectId: 'aura',
    effect: { type: 'create_token', amount: 2, power: 4, toughness: 4 },
    targets: [], restorePriorityTo: null,
  };
  state.turn.priorityPlayerId = 'p1';
  const chosen = botChoice(state);
  assert.equal(chosen.type, 'resolve_moonlit_choice');
  assert.equal(chosen.replace, false, `kopie 1/1 < tokeny 4/4, wybrał: ${JSON.stringify(chosen)}`);
});

test('E2/C6b: moonlit — potężny pierwowzór: zamieniamy na kopie (replace:true)', () => {
  const state = newState();
  putCreature(state, 'demon', 'p1', 6, 6);
  state.pendingMoonlitChoice = {
    playerId: 'p1', sourceId: 'aura', enchantedId: 'demon', sourceObjectId: 'aura',
    effect: { type: 'create_token', amount: 2, power: 1, toughness: 1 },
    targets: [], restorePriorityTo: null,
  };
  state.turn.priorityPlayerId = 'p1';
  const chosen = botChoice(state);
  assert.equal(chosen.replace, true, `kopie 6/6 >> tokeny 1/1, wybrał: ${JSON.stringify(chosen)}`);
});

test('E2/C7: cast_adventure_creature — duże ciało przegrywa ląd, małe wygrywa z pasem; wybór WYCIENIONY', () => {
  const state = newState();
  // Koszt {3}{G} rozlicza silnik — oferty powstają tylko przy budżecie (L48):
  // 3 lasy na stole (basic-forest z rejestru daje źródło G).
  for (const [i,] of [1, 2, 3].entries()) {
    addObject(state, { id: `l${i}`, instanceId: `i-l${i}`, cardId: 'basic-forest', controllerId: 'p1', zone: 'battlefield', kind: 'land', manaCost: 0, abilities: [], keywords: [], subtypes: [], types: ['Land'], colors: ['G'], cardName: 'Forest' });
  }
  addObject(state, {
    id: 'adv', instanceId: 'i-adv', cardId: 'x-adv', controllerId: 'p1', zone: 'exile',
    kind: 'creature', power: 10, toughness: 10, manaCost: 3, colors: ['G'],
    adventure: { name: 'Wyprawa', spell: { timing: 'instant', targets: [], effects: [] } },
    abilities: [], keywords: [], subtypes: [], types: ['Creature'], cardName: 'x-adv',
  });
  // Ręka: zwykły ląd (play_land = 90) jako realna alternatywa — tylko
  // faktyczna wycena ciała (creatureBase 70 + 2*10+10 = 100) ją pokona;
  // mutacja „remis z pasem (0)" spadłaby za ląd i test by ją wykrył.
  addObject(state, {
    id: 'lhand', instanceId: 'i-lhand', cardId: 'basic-forest', controllerId: 'p1', zone: 'hand',
    kind: 'land', manaCost: 0, abilities: [], keywords: [], subtypes: [], types: ['Land'],
    colors: ['G'], cardName: 'Forest',
  });
  state.zones.exile = ['adv'];
  const view = playerView(state, 'p1');
  const bot = createHeuristicBot({ seed: 9 });
  const chosen = bot.chooseCommand(view);
  assert.equal(chosen.type, 'cast_adventure_creature',
    `ciało 10/10 (100) > ląd (90), wybrał: ${JSON.stringify(chosen)} (oferty: ${view.legalCommands.map((c) => c.type).join(',')})`);
  assert.equal(chosen.objectId, 'adv');
});
