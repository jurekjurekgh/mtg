// M209 — aura, ktorej cala wartoscia jest OCHRONA, ma sens tylko wobec
// realnego zagrozenia (zglosenie wlasciciela po audycie M207).
//
// Objaw: bot rzucal Guildscorn Ward („enchanted creature has protection from
// multicolored", CR 702.16e) w matchupie, gdzie przeciwnik mial 1 karte
// wielokolorowa na 48 — placil karte i mane za ochrone, ktora nic nie blokuje.
// Wycena `cast_permanent` traktowala kazda nie-wroga aure na wlasnym stworze
// jak buff wart +66.
//
// Blokada, ktora trzeba bylo najpierw usunac: `playerView` NIE wysylal `colors`
// dla obiektow na polu bitwy ani w grobie, wiec bot fizycznie nie mial jak
// ocenic, czy ochrona cokolwiek wylacza (klasa L1/ADR 0017 — „bot robi cos
// glupiego" bywa slepota, nie glupota).
//
// Wymaganie wlasciciela: dodatnia wycena TYLKO gdy u przeciwnika pojawi sie
// cos wielokolorowego „w zakresie wiedzy bota, czyli w ramach jego FoW, bez
// oszukiwania". Inaczej lepiej trzymac karte w rece.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, playerView, addObject } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

/** Stol: wlasny stwor-gospodarz, jednokolorowy stwor wroga, Ward w rece. */
function scenariusz(dodajWiedze = () => {}) {
  const state = createGameState({ players: [{ id: 'p1' }, { id: 'p2' }], registry: REGISTRY, seed: 11 });

  // M257-r5b/B: test niezależny od strony startu — pin aktora (p1).
  state.turn.activePlayerId = 'p1'; state.turn.priorityPlayerId = 'p1';
  addObject(state, {
    id: 'mine', instanceId: 'mine-i', cardId: 'hill-giant', controllerId: 'p1', zone: 'battlefield',
    kind: 'creature', power: 3, toughness: 3, colors: ['G'], types: ['Creature'],
  });
  // summoningSickness spoza kontraktu fabryki (L21) — ustawiamy jawnie.
  state.objects.set('mine', Object.freeze({ ...state.objects.get('mine'), summoningSickness: false }));
  addObject(state, {
    id: 'foe1', instanceId: 'foe1-i', cardId: 'hill-giant', controllerId: 'p2', zone: 'battlefield',
    kind: 'creature', power: 3, toughness: 3, colors: ['R'], types: ['Creature'],
  });
  dodajWiedze(state);
  addObject(state, {
    id: 'gw', instanceId: 'gw-i', cardId: 'guildscorn-ward', controllerId: 'p1', zone: 'hand',
    kind: 'enchantment', manaCost: 1, colors: ['W'], types: ['Enchantment'], subtypes: ['Aura'],
    aura: REGISTRY.get('guildscorn-ward').aura,
  });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  addMana(state, 'p1', 5);
  return state;
}

const rzucaWard = (state) => createHeuristicBot({ seed: 3 }).chooseCommand(playerView(state, 'p1')).objectId === 'gw';

const wielokolorowyNaPolu = (state) => addObject(state, {
  id: 'gold', instanceId: 'gold-i', cardId: 'boros-challenger', controllerId: 'p2', zone: 'battlefield',
  kind: 'creature', power: 2, toughness: 3, colors: ['R', 'W'], types: ['Creature'],
});

test('M209/A: widok pola bitwy niesie kolory, ale zakryty permanent zostaje bezbarwny (CR 708.2)', () => {
  const state = createGameState({ players: [{ id: 'p1' }, { id: 'p2' }], registry: REGISTRY, seed: 5 });

  // M257-r5b/B: test niezależny od strony startu — pin aktora (p1).
  state.turn.activePlayerId = 'p1'; state.turn.priorityPlayerId = 'p1';
  addObject(state, {
    id: 'gold', instanceId: 'gold-i', cardId: 'boros-challenger', controllerId: 'p2', zone: 'battlefield',
    kind: 'creature', power: 2, toughness: 3, colors: ['R', 'W'], types: ['Creature'],
  });
  addObject(state, {
    id: 'fd', instanceId: 'fd-i', cardId: 'boros-challenger', controllerId: 'p2', zone: 'battlefield',
    kind: 'creature', power: 2, toughness: 2, colors: ['R', 'W'], types: ['Creature'],
  });
  state.objects.set('fd', Object.freeze({ ...state.objects.get('fd'), faceDown: true }));

  const wrog = playerView(state, 'p1').zones.battlefield;
  assert.deepEqual(wrog.find((o) => o.id === 'gold').colors, ['R', 'W'],
    'kolory permanentu odkrytego sa publiczne (CR 105.2)');
  assert.equal(wrog.find((o) => o.id === 'fd').colors, undefined,
    'zakryty permanent nie ujawnia kolorow przeciwnikowi (CR 708.2)');

  // Kontroler swoja karte zna — mgla wojny dziala w jedna strone.
  const swoj = playerView(state, 'p2').zones.battlefield;
  assert.deepEqual(swoj.find((o) => o.id === 'fd').colors, ['R', 'W'],
    'kontroler zna kolory wlasnego zakrytego permanentu');
});

test('M209/B: bez wielokolorowych u przeciwnika bot NIE rzuca aury ochronnej', () => {
  assert.equal(rzucaWard(scenariusz()), false,
    'ochrona przed multicolored przy samych jednokolorowych = zmarnowana karta i mana');
});

test('M209/C: wielokolorowy stwor przeciwnika wlacza aure', () => {
  assert.equal(rzucaWard(scenariusz(wielokolorowyNaPolu)), true,
    'jest przed czym chronic — aura ma sens');
});

test('M209/D: grob przeciwnika liczy sie jako wiedza (strefa jawna, CR 400.2)', () => {
  const state = scenariusz((s) => addObject(s, {
    id: 'gy', instanceId: 'gy-i', cardId: 'selesnya-charm', controllerId: 'p2', zone: 'graveyard',
    kind: 'card', colors: ['G', 'W'], types: ['Instant'],
  }));
  assert.deepEqual(playerView(state, 'p1').zones.graveyard.find((o) => o.id === 'gy').colors, ['G', 'W'],
    'grob jest jawny, wiec niesie kolory');
  assert.equal(rzucaWard(state), true,
    'przeciwnik POKAZAL karte wielokolorowa — to legalna przeslanka');
});

test('M209/E: bot nie oszukuje — ukryta reka i zakryty permanent nie wlaczaja aury', () => {
  const wRece = scenariusz((s) => addObject(s, {
    id: 'h', instanceId: 'h-i', cardId: 'boros-challenger', controllerId: 'p2', zone: 'hand',
    kind: 'creature', power: 2, toughness: 3, colors: ['R', 'W'], types: ['Creature'],
  }));
  assert.equal(rzucaWard(wRece), false, 'reka przeciwnika jest ukryta (FoW) — nie wolno z niej korzystac');

  const zakryty = scenariusz((s) => {
    addObject(s, {
      id: 'fd', instanceId: 'fd-i', cardId: 'boros-challenger', controllerId: 'p2', zone: 'battlefield',
      kind: 'creature', power: 2, toughness: 2, colors: ['R', 'W'], types: ['Creature'],
    });
    s.objects.set('fd', Object.freeze({ ...s.objects.get('fd'), faceDown: true }));
  });
  assert.equal(rzucaWard(zakryty), false, 'zakryty permanent jest bezbarwny dla przeciwnika (CR 708.2)');

  const swoj = scenariusz((s) => addObject(s, {
    id: 'm2', instanceId: 'm2-i', cardId: 'boros-challenger', controllerId: 'p1', zone: 'battlefield',
    kind: 'creature', power: 2, toughness: 3, colors: ['R', 'W'], types: ['Creature'],
  }));
  assert.equal(rzucaWard(swoj), false, 'wlasny wielokolorowy stwor nie jest zagrozeniem dla samego siebie');
});

test('M209/F: anty-over-fix — zwykla aura-buff dziala jak dotad', () => {
  // Regula ma dotyczyc WYLACZNIE aur, ktorych cala wartoscia jest ochrona.
  // Aura z pumpem musi zostac zagrana mimo braku wielokolorowych u wroga.
  const state = createGameState({ players: [{ id: 'p1' }, { id: 'p2' }], registry: REGISTRY, seed: 11 });

  // M257-r5b/B: test niezależny od strony startu — pin aktora (p1).
  state.turn.activePlayerId = 'p1'; state.turn.priorityPlayerId = 'p1';
  addObject(state, {
    id: 'mine', instanceId: 'mine-i', cardId: 'hill-giant', controllerId: 'p1', zone: 'battlefield',
    kind: 'creature', power: 3, toughness: 3, colors: ['G'], types: ['Creature'],
  });
  state.objects.set('mine', Object.freeze({ ...state.objects.get('mine'), summoningSickness: false }));
  addObject(state, {
    id: 'buff', instanceId: 'buff-i', cardId: 'test-buff-aura', controllerId: 'p1', zone: 'hand',
    kind: 'enchantment', manaCost: 1, colors: ['W'], types: ['Enchantment'], subtypes: ['Aura'],
    aura: { enchant: 'creature', pump: { power: 2, toughness: 2 }, keywords: [] },
  });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  addMana(state, 'p1', 5);
  assert.equal(createHeuristicBot({ seed: 3 }).chooseCommand(playerView(state, 'p1')).objectId, 'buff',
    'aura dajaca +2/+2 nie podlega regule ochrony — ma byc zagrana');
});
