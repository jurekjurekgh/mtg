// AUDYT ŻYWYM TESTEREM (PR #121, 2026-09-15) — partie celowane seed 911
// (tarkir-bg vs innistrad-wu): bot z Civilized Scholar ({T}: dobierz kartę,
// potem odrzuć) na polu aktywował dobór PRZY PUSTEJ BIBLIOTECE i przegrał
// na miejscu („Nieprzyjaciel przegrywa (pusta biblioteka)"), choć pass był
// legalny i bezkosztowy. Transkrypt: koniec partii — bot grał Scholar carta
// za cartą aż do pustej biblioteki, potem aktywował po raz kolejny.
//
// Root cause: pętla wyceny `activate_ability` wycenia `draw_cards`
// (Batch 52, Leonin Surveyor) z `drawDeckingPenalty` (D/Deepwood Denizen),
// ale bliźniaczy typ `draw_then_discard` NIE miał gałęzi — bot widział gołą
// bazę 2 (> pass 0) i żaden guard deck-outu nie działał. Klasy L41
// (bliźniacze gałęzie czarów/zdolności idą razem) + D + C.
//
// Reguła pinowana (CR 121.4/704.5b): próba dobrania z pustej biblioteki
// przegrywa partię; dobór w ostatnich kartach to wyrok. Po naprawie:
// przy bibliotece 0 aktywacja schodzi mocno pod pass (baza 2 + 6 − 126),
// przy zdrowej bibliotece (5+) zdolność ma WARTOŚĆ doboru (anty-over-fix:
// 2 + 6 = 8, nie goła baza 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function game(librarySize) {
  const s = createGameState({ seed: 9, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main', 'p1');
  s.turn.activePlayerId = 'p1';
  s.turn.priorityPlayerId = 'p1';
  const def = REGISTRY.get('civilized-scholar');
  assert.ok(def, 'civilized-scholar w rejestrze');
  const d = gameObjectDataOf(def);
  addObject(s, {
    id: 'scholar', instanceId: 'i-scholar', cardId: 'civilized-scholar',
    controllerId: 'p1', ownerId: 'p1', zone: 'battlefield',
    kind: d.kind, power: d.power, toughness: d.toughness,
    abilities: def.abilities ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], types: def.types ?? ['Creature'],
    activatableAbilities: d.activatableAbilities ?? [],
  });
  for (let i = 0; i < librarySize; i += 1) {
    addObject(s, {
      id: `lib${i}`, instanceId: `i-lib${i}`, cardId: 'basic-forest',
      controllerId: 'p1', ownerId: 'p1', zone: 'library',
    });
  }
  return s;
}

function scholarOption(s) {
  const view = playerView(s, 'p1');
  assert.ok(view.legalCommands.some((c) => c.type === 'activate_ability' && c.objectId === 'scholar'),
    'aktywacja Scholar dostępna w legalnych komendach');
  const bot = createHeuristicBot({ seed: 3 });
  const cmd = bot.chooseCommand(view, {});
  const options = bot.trace().at(-1).options;
  const sch = options.find((o) => String(o.cmd).startsWith('activate_ability(scholar')
    || (String(o.cmd).includes('scholar') && String(o.cmd).includes('activate')));
  assert.ok(sch, `aktywacja Scholar w śladzie wyceny (${JSON.stringify(options.map((o) => o.cmd).slice(0, 8))})`);
  return { cmd, score: sch.score };
}

test('SCHOLAR: biblioteka 0 — aktywacja doboru schodzi pod pass, bot nie.deck-outuje się', () => {
  const { cmd, score } = scholarOption(game(0));
  assert.ok(score < 0, `aktywacja przy bibliotece 0 musi być ujemna (deck-out −126 + baza), jest ${score}`);
  assert.notEqual(cmd.type, 'activate_ability', `bot nie może aktywować doboru z pustej biblioteki (wybrał: ${JSON.stringify(cmd)})`);
});

test('SCHOLAR: biblioteka 1 — strefa krytyczna (C), aktywacja poniżej passa', () => {
  const { cmd, score } = scholarOption(game(1));
  assert.ok(score < 0, `dobór ostatniej karty to wyrok (remaining 0 ≤ 3), jest ${score}`);
  assert.notEqual(cmd.type, 'activate_ability', `bot oszczędza ostatnią kartę (wybrał: ${JSON.stringify(cmd)})`);
});

test('SCHOLAR: zdrowa biblioteka (5) — anty-over-fix, loot ma wartość (4 = baza 2 + LOOT_NET 2, PMSSB-8)', () => {
  const { score } = scholarOption(game(5));
  assert.ok(score >= 4, `przy zdrowej bibliotece wycena = baza 2 + LOOT_NET_VALUE 2, jest ${score}`);
});
