// M150 — uwagi właściciela (A, A1-refinacja, C1):
//
// A   — Battle-Rattle Shaman: trigger PRZYJAZNY („you may have target creature
//       get +2/+0”) na początku walki. Bot ma celować WŁASNY stwór, nie wrogi.
// C1  — Jeskai Devotee „{1}: Add {U}, {R}, or {W}”: filtr koloru (net<=0) bez
//       realnego odblokowania to strata tempa — bot nie aktywuje na zapas,
//       także gdy „coś jest w ręce” (kara nie zależy od hasPlayable).
// A1-r— refinacja m149: po opłaceniu czaru tapniętym Swampem bot NIE poświęca
//       dodatkowo Treasure, skoro manę i tak nie wyda (float-and-waste).
//
// Reguły generyczne (ADR 0002), zero nazw kart po stronie engine — flagi
// `friendly` / kara net<=0 liczone z deskryptorów efektów.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function newState(step = 'main') {
  const state = createGameState({ seed: 150, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.number = 5;
  return state;
}

function put(state, id, cardId, controllerId = 'p1', zone = 'battlefield', over = {}) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, zone,
    kind: over.kind ?? data.kind, power: over.power ?? data.power,
    toughness: over.toughness ?? data.toughness, manaCost: over.manaCost ?? data.manaCost,
    spell: data.spell, abilities: data.abilities ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], types: def.types ?? [], colors: data.colors ?? [],
    cardName: def.name,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

// --- A: Battle-Rattle Shaman celuje własny stwór ---------------------------
test('A: bot celuje WŁASNY stwór przyjaznym triggerem (Battle-Rattle Shaman +2/+0)', () => {
  const state = newState();
  const shamanDef = REGISTRY.get('battle-rattle-shaman');
  const shaman = put(state, 'shaman', 'battle-rattle-shaman', 'p1', 'battlefield');
  // Własny stwór i wrogi — oba legalne cele triggera „target creature”.
  put(state, 'own', 'highland-game', 'p1', 'battlefield', { power: 2, toughness: 1 });
  put(state, 'enemy', 'highland-game', 'p2', 'battlefield', { power: 4, toughness: 4 });
  // Zbuduj oczekującą decyzję celu triggera (Temat 2) z prawdziwą zdolnością
  // Shaman (requiresTarget creature + pump +2/+0). Flagę `friendly` wylicza
  // playerView z deskryptora efektu (ADR 0002).
  state.pendingTriggerTargets.push({
    playerId: 'p1',
    sourceId: shaman.id,
    cardId: shaman.cardId,
    ability: shamanDef.abilities[0],
    candidates: ['own', 'enemy'],
    allowNone: true,
    fixedTargetIds: [],
    extra: {},
    restorePriorityTo: 'p1',
  });
  const view = playerView(state, 'p1');
  const targetOffers = view.legalCommands.filter((cmd) => cmd.type === 'resolve_trigger_target');
  assert.ok(targetOffers.length >= 2, 'oferty celu triggera powinny obejmować oba stwory');
  // Komenda niesie flagę `friendly` (root cause — bez niej bot brał wrogiego).
  assert.ok(targetOffers.every((cmd) => cmd.friendly === true),
    `friendly powinno być true dla pump: ${JSON.stringify(targetOffers[0])}`);

  const bot = createHeuristicBot({ seed: 150 });
  const chosen = bot.chooseCommand(view);
  assert.equal(chosen.type, 'resolve_trigger_target',
    `bot powinien wybrać cel triggera: ${JSON.stringify(chosen)}`);
  // Kluczowe: nie celujemy WROGIEGO stwora (4/4). Własny wybór to dowolny
  // stwór p1 (najsilniejszy — w teście: sam Shaman, wartość 6 > 5 highland-game).
  assert.notEqual(chosen.targetId, 'enemy',
    `bot celuje WROGIEGO stwora przyjaznym pumpem: ${JSON.stringify(chosen)}`);
  const chosenTarget = view.zones.battlefield.find((o) => o.id === chosen.targetId);
  assert.ok(chosenTarget && chosenTarget.controllerId === 'p1',
    `przyjazny pump powinien trafić WŁASNY stwór: ${JSON.stringify(chosen)}`);
});

// --- C1: Jeskai Devotee nie aktywowany bez potrzeby ------------------------
test('C1: bot NIE aktywuje filtra many (Jeskai Devotee net<=0), gdy many nie potrzebuje', () => {
  const state = newState();
  put(state, 'jd', 'jeskai-devotee', 'p1', 'battlefield');
  // Trzy nietapnięte góry = manabaza; w ręce 2-kosztowy stwór, którego stać
  // nas ZA DARMO (bez filtra). Aktywacja filtra (tap lądu + {1}) niczego nie
  // odblokowuje, a manę i tak zje cleanup (CR 500.4).
  put(state, 'm1', 'basic-mountain', 'p1', 'battlefield');
  put(state, 'm2', 'basic-mountain', 'p1', 'battlefield');
  put(state, 'm3', 'basic-mountain', 'p1', 'battlefield');
  put(state, 'creature', 'highland-game', 'p1', 'hand', { manaCost: 2 });

  const bot = createHeuristicBot({ seed: 150 });
  const chosen = bot.chooseCommand(playerView(state, 'p1'));
  assert.ok(!(chosen.type === 'activate_ability' && chosen.objectId === 'jd'),
    `bot filtrował manę bez potrzeby: ${JSON.stringify(chosen)}`);
});

// --- A1-refinacja: nie poświęcaj Treasure po opłaconym czarze ---------------
test('A1-refinacja: bot NIE poświęca Treasure, gdy manę i tak nie wyda (po opłaconym czarze)', () => {
  const state = newState();
  put(state, 'treasure', 'token_treasure', 'p1', 'battlefield');
  // Swamp TAPPED — poszedł już na opłacenie Bone Splinters (symulacja stanu
  // po rzucie). Zostało tylko Treasure = 1 mana, a czar w ręce kosztuje 3 —
  // po poświęceniu i tak nie uda się go rzucić (unlocksSomething false).
  const swamp = put(state, 'swamp', 'basic-swamp', 'p1', 'battlefield');
  state.objects.set('swamp', Object.freeze({ ...state.objects.get('swamp'), tapped: true }));
  put(state, 'big', 'highland-game', 'p1', 'hand', { manaCost: 3 });

  const bot = createHeuristicBot({ seed: 150 });
  const chosen = bot.chooseCommand(playerView(state, 'p1'));
  assert.ok(!(chosen.type === 'activate_ability' && chosen.objectId === 'treasure'),
    `bot poświęcił Treasure na manę-w-miot: ${JSON.stringify(chosen)}`);
});
