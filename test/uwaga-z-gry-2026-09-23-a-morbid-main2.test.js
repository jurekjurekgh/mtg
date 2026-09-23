// Uwaga A (właściciel, 2026-09-23c): „Somberwald Spider (i inne z Morbid) —
// bot ma je zagrywać tylko we własnej Głównej 2 (chyba że flash i zamierza
// atakować)”.
//
// Deskryptor w danych karty (ADR 0002): `entersWithCountersIf: { morbid: true }`
// — liczniki dostajemy TYLKO, gdy w tej turze coś umarło (CR 614.1c). Własna
// walka to jedyne okno, w którym bot może na to wpłynąć, więc rzut należy
// odłożyć ZA walkę (Główna 2): wtedy śmierć blokera/atakującego zdąży zajść.
// Wyjątek z uwagi: karta z `flash` może wejść w Głównej 1, gdy bot REALNIE
// zamierza atakować w tej turze (chce mieć ciało przed deklaracją) — intencja
// jest pytana TĄ SAMĄ polityką ataku, którą bot stosuje w kroku deklaracji.
//
// Żadna karta katalogu nie ma jednocześnie flash i Morbida, więc wyjątek
// przypinamy kartą lokalną (rejestr nadpisany w instancji bota).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createRegistry, defineCard } from '../src/cards/registry.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const KATALOG = createCardRegistry();
const BOT = 'p1';

// Karta lokalna: flash + Morbid (wyjątek z uwagi A).
const synFlashMorbid = defineCard({
  id: 'syn-flash-morbid', name: 'Test Flash Morbid', types: ['Creature'],
  subtypes: ['Spider'], colors: ['G'], power: 2, toughness: 4, manaCost: 3,
  keywords: ['flash'],
  entersWithCountersIf: { morbid: true, counters: { '+1/+1': 2 } },
  support: { status: 'supported' },
});
const REGISTRY = createRegistry([...KATALOG.all(), synFlashMorbid]);

function gra(step, pid = BOT) {
  const state = createGameState({ seed: 41, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, pid);
  state.turn.activePlayerId = pid;
  state.turn.priorityPlayerId = pid;
  return state;
}

function karta(state, id, cardId, controllerId, zone, patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze testowym`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false, ...patch }));
  return state.objects.get(id);
}

/** Regał: pięć Lasów (płaci {4}{G}) + karta w ręce. */
function stolek(state, cardId, id = 'karta') {
  addMana(state, BOT, 5, { colors: ['G'] });
  karta(state, id, cardId, BOT, 'hand');
  for (let i = 0; i < 5; i += 1) karta(state, `land${i}`, 'basic-forest', BOT, 'battlefield');
  return state;
}

function decyzja(state) {
  const bot = createHeuristicBot({ seed: 3, registry: REGISTRY });
  const chosen = bot.chooseCommand(playerView(state, BOT));
  const options = bot.trace().at(-1)?.options ?? [];
  return { chosen, options };
}

const punkty = (options, prefix) => options
  .find((o) => String(o.cmd).startsWith(prefix))?.score ?? null;

const SPIDER = 'somberwald-spider';

test('A/1: Morbid w Głównej 1 — bot czeka (liczniki liczy się po walce)', () => {
  const { chosen, options } = decyzja(stolek(gra('main1'), SPIDER, 'spider'));
  const rzut = punkty(options, 'cast_permanent(spider)');
  const pass = punkty(options, 'pass_priority');
  assert.notEqual(chosen.type, 'cast_permanent',
    `bot nie może rzucać Morbida w Głównej 1: ${JSON.stringify(chosen)}`);
  assert.ok(rzut < pass,
    `rzut w Głównej 1 ma zejść pod pass: rzut=${rzut}, pass=${pass}`);
});

test('A/2: Morbid w Głównej 2 — bot rzuca (po walce może być martwy stwór)', () => {
  const { chosen } = decyzja(stolek(gra('main2'), SPIDER, 'spider'));
  assert.equal(chosen.type, 'cast_permanent', `bot ma rzucać w Głównej 2: ${JSON.stringify(chosen)}`);
  assert.equal(chosen.objectId, 'spider');
});

test('A/3: wyjątek flash — Główna 1 dopuszczalna, gdy bot zamierza atakować', () => {
  const state = stolek(gra('main1'), 'syn-flash-morbid', 'flashmorbid');
  // Jest czym i po co atakować: 4/4 przy PUSTEJ planszy przeciwnika.
  karta(state, 'napastnik', 'highland-game', BOT, 'battlefield', { power: 4, toughness: 4 });
  const { chosen } = decyzja(state);
  assert.equal(chosen.type, 'cast_permanent',
    `flash + zamiar ataku ma dopuszczać Główną 1: ${JSON.stringify(chosen)}`);
  assert.equal(chosen.objectId, 'flashmorbid');
});

test('A/4 (kontrola): flash BEZ zamiaru ataku nie zdejmuje preferencji Głównej 2', () => {
  const { chosen } = decyzja(stolek(gra('main1'), 'syn-flash-morbid', 'flashmorbid'));
  assert.notEqual(chosen.type, 'cast_permanent',
    `bez ataku w tej turze flash czeka na Główną 2: ${JSON.stringify(chosen)}`);
});

test('A/5 (anty-over-fix): zwykły stwór wchodzi w Głównej 1 jak dotąd', () => {
  const { chosen } = decyzja(stolek(gra('main1'), 'highland-game', 'zwykly'));
  assert.equal(chosen.type, 'cast_permanent',
    `bez deskryptora Morbid rzut w Głównej 1 zostaje: ${JSON.stringify(chosen)}`);
  assert.equal(chosen.objectId, 'zwykly');
});
