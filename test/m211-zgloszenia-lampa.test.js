// M211 — zgłoszenia właściciela z rozgrywki (Seer's Lantern).
//
// A1: bot co rundę palił manę w upkeepie przeciwnika na „{2},{T}: Scry 1”,
//     przez co brakowało mu jej na sensowne zagrania. Zdolność układająca
//     wierzch WŁASNEJ biblioteki daje ten sam skutek niezależnie od chwili
//     aktywacji, więc opłaca się ją odłożyć na koniec tury przeciwnika —
//     wtedy mana i tak by przepadła, a scry zdąży ustawić najbliższe dobranie.
//
// A2: log pisał „odkłada na spód biblioteki (1/1)”. To były liczby
//     bottomCount/total, ale czytało się je jak SIŁĘ/WYTRZYMAŁOŚĆ odkładanej
//     karty — czyli jak wyciek ukrytej informacji.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { describeGameEvent } from '../src/table/session.js';

const REGISTRY = createCardRegistry();
const NAMES = { p1: 'Ty', p2: 'Nieprzyjaciel' };
const HELPERS = {
  nameOf: (cardId) => REGISTRY.get(cardId)?.name ?? String(cardId ?? '?'),
  seesHiddenOf: (playerId) => playerId === 'p1',
};

function put(state, id, cardId, controllerId, zone = 'battlefield') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
}

/** Stół: bot (p2) z Lampą, 4 lasami i czymś sensownym w ręce. */
function lanternTable(step, activePlayerId) {
  const state = createGameState({ seed: 211, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = {
    ...state.turn,
    phase: step === 'main' ? 'precombat_main' : step,
    step,
    activePlayerId,
    priorityPlayerId: 'p2',
  };
  put(state, 'lantern', 'seers-lantern', 'p2');
  for (let i = 0; i < 4; i += 1) put(state, `f${i}`, 'basic-forest', 'p2');
  for (let i = 0; i < 6; i += 1) put(state, `lib${i}`, 'highland-game', 'p2', 'library');
  put(state, 'h1', 'highland-game', 'p2', 'hand');
  // summoningSickness jest poza kontraktem addObject (L21) — ustawiamy wprost.
  for (const id of ['lantern', 'f0', 'f1', 'f2', 'f3']) {
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  }
  return state;
}

/** Czy bot wybrałby scry (zdolność #1 Lampy) w danym oknie. */
function botActivatesScry(step, activePlayerId) {
  const state = lanternTable(step, activePlayerId);
  const view = playerView(state, 'p2');
  const offered = view.legalCommands.some((c) => c.type === 'activate_ability'
    && c.objectId === 'lantern' && c.abilityIndex === 1);
  assert.equal(offered, true, `oferta scry musi istnieć w oknie ${activePlayerId}/${step}`);
  const bot = createHeuristicBot({ playerId: 'p2', seed: 211 });
  const chosen = bot.chooseCommand(view);
  return chosen?.type === 'activate_ability' && chosen.objectId === 'lantern'
    && chosen.abilityIndex === 1;
}

test('M211/A1: bot NIE pali many na scry w upkeepie ani main przeciwnika', () => {
  // p1 aktywny = tura przeciwnika z punktu widzenia bota (p2).
  assert.equal(botActivatesScry('upkeep', 'p1'), false, 'upkeep przeciwnika: za wcześnie');
  assert.equal(botActivatesScry('draw', 'p1'), false, 'draw przeciwnika: za wcześnie');
  assert.equal(botActivatesScry('main', 'p1'), false, 'main przeciwnika: mana może być potrzebna');
});

test('M211/A1: bot aktywuje scry w KOŃCOWEJ fazie tury przeciwnika', () => {
  assert.equal(botActivatesScry('end', 'p1'), true,
    'end step przeciwnika to okno optymalne — mana i tak przepadnie');
});

test('M211/A1: bot nie pali many na scry we WŁASNEJ turze', () => {
  // We własnej turze mana jest potrzebna na czary; scry poczeka.
  assert.equal(botActivatesScry('main', 'p2'), false, 'własna main: mana na zagrania');
  assert.equal(botActivatesScry('end', 'p2'), false, 'własny end: przed MOIM untapem, nie przed dobraniem');
});

test('M211/A2: log scry nie pokazuje liczb wyglądających jak siła/wytrzymałość', () => {
  const text = describeGameEvent(
    { type: 'scry_resolved', playerId: 'p2', total: 1, bottomCount: 1, bottomCardIds: ['basic-swamp'], topCardIds: [] },
    HELPERS, NAMES,
  );
  // Nie może być segmentu „(1/1)” — właściciel czytał go jako P/T karty.
  assert.ok(!/\(\d+\/\d+\)/.test(text), `zapis wyglądający jak P/T: ${text}`);
  // Nadal FoW: nazwa karty przeciwnika nie wycieka.
  assert.ok(!text.includes('Swamp'), `wyciek nazwy karty bota: ${text}`);
  assert.match(text, /spód biblioteki/, `komunikat stracił sens: ${text}`);
});

test('M211/A2: przy scry 2+ log nadal mówi, ILE kart poszło na spód', () => {
  const text = describeGameEvent(
    { type: 'scry_resolved', playerId: 'p2', total: 2, bottomCount: 1, bottomCardIds: ['basic-swamp'], topCardIds: ['basic-forest'] },
    HELPERS, NAMES,
  );
  assert.ok(!/\(\d+\/\d+\)/.test(text), `zapis wyglądający jak P/T: ${text}`);
  assert.match(text, /1 z 2/, `zgubiona informacja o liczbie kart: ${text}`);
});
