// =============================================================================
// M135 — „wycena decyzji bota" (temat z backlogu wskazany przez właściciela):
//
//   „Bot przy scry/surveil bierze pierwszą ofertę zamiast wybierać.
//    Gra działa, po prostu mógłby grać lepiej."
//
// ZMIERZONE PRZED ZMIANĄ: wycena istniała, ale rozpoznawała JEDEN przypadek —
// „land przy przesycie lądów". Wszystko inne dostawało równe `20`, więc
// warianty REMISOWAŁY i bot brał pierwszy z listy. Skutek: przy scry 1
// z Highland Game (2/1 za {2}) bot odkładał dobrego, taniego stwora na spód
// biblioteki. Trace potwierdzał remis: obie oferty `score: 20`.
//
// NAPRAWA: jedna wspólna funkcja `cardKeepValue` („czy chcemy tę kartę
// dobrać?") użyta przez scry, surveil i clash — zamiast trzech kopii tego
// samego warunku (L28). Reguły po deskryptorach: kind/types (land),
// manaCost vs liczba lądów (zasięg), power/toughness (ciało). Zero nazw kart
// (ADR 0002).
//
// RÓŻNICA SEMANTYCZNA, która musi być widoczna w wycenie: przy scry karta idzie
// na SPÓD BIBLIOTEKI (odsunięcie w czasie), przy surveil do GROBU (CR 701.44 —
// strata nieodwracalna). Dlatego surveil ma wyższy próg opłacalności.
// =============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();
let counter = 0;

/** Stół bota z oczekującą decyzją scry albo surveil. */
function lookBoard({ look, hand = [], lands = 3, kind = 'scry' }) {
  const state = createGameState({ seed: 9, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  state.turn.number = 6;
  const put = (cardId, zone) => {
    const def = REGISTRY.get(cardId);
    assert.ok(def, `karta ${cardId} istnieje`);
    const data = gameObjectDataOf(def);
    const id = `${cardId}#${counter += 1}`;
    addObject(state, {
      id, instanceId: `i-${id}`, cardId, controllerId: 'p2', ownerId: 'p2', zone,
      kind: data.kind, power: data.power, toughness: data.toughness, manaCost: data.manaCost,
      abilities: data.abilities ?? [], keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
      types: def.types ?? [], colors: data.colors ?? [], cardName: def.name, spell: def.spell,
    });
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
    return id;
  };
  for (let i = 0; i < lands; i += 1) put('basic-forest', 'battlefield');
  hand.forEach((c) => put(c, 'hand'));
  const lookIds = look.map((c) => put(c, 'library'));
  if (kind === 'scry') state.pendingScry = { playerId: 'p2', objectIds: lookIds };
  else state.pendingSurveil = { playerId: 'p2', objectIds: lookIds };
  return { state, lookIds, view: playerView(state, 'p2') };
}

const decide = (view) => createHeuristicBot({ seed: 3 }).chooseCommand(view);
const cardIdOf = (objectId) => String(objectId).split('#')[0];

// --- Regresja wprost na zgłoszenie -----------------------------------------

test('M135: bot NIE odkłada na spód dobrego, taniego stwora (scry)', () => {
  // Highland Game 2/1 za {2} przy 3 lądach — karta, którą chcemy dobrać.
  // Przed naprawą: oba warianty miały score 20 (remis) i bot brał pierwszy,
  // czyli „na spód".
  const { view } = lookBoard({ look: ['highland-game'], lands: 3 });
  const chosen = decide(view);
  assert.equal(chosen.type, 'resolve_scry');
  assert.deepEqual(chosen.bottomIds ?? [], [],
    `dobry tani stwór ma zostać na wierzchu: ${JSON.stringify(chosen)}`);
});

test('M135: warianty scry NIE remisują już punktacją', () => {
  // Sedno usterki: remis oznaczał „pierwsza oferta z listy". Sprawdzamy
  // bezpośrednio, że wycena rozróżnia warianty.
  const { view } = lookBoard({ look: ['highland-game'], lands: 3 });
  const bot = createHeuristicBot({ seed: 3 });
  bot.chooseCommand(view);
  const last = bot.trace().at(-1);
  const scores = last.options.filter((o) => String(o.cmd).startsWith('resolve_scry')).map((o) => o.score);
  assert.equal(scores.length, 2, 'dwa warianty scry');
  assert.notEqual(scores[0], scores[1],
    `warianty muszą się różnić punktacją, inaczej wybór jest przypadkowy: ${JSON.stringify(scores)}`);
});

// --- Anty-over-fix: dotychczasowe dobre zachowania zostają ------------------

test('M135 (anty-over-fix): zbędny land przy przesycie DALEJ idzie na spód', () => {
  const { view, lookIds } = lookBoard({
    look: ['basic-forest'],
    hand: ['basic-forest', 'basic-forest', 'basic-forest', 'basic-forest', 'basic-forest'],
    lands: 6,
  });
  const chosen = decide(view);
  assert.deepEqual(chosen.bottomIds ?? [], lookIds,
    `przy przesycie lądów bot ma odłożyć land: ${JSON.stringify(chosen)}`);
});

test('M135: karta daleko poza zasięgiem many idzie na spód', () => {
  // Woolly Loxodon za {7} przy 3 lądach — martwa na wiele tur.
  const { view, lookIds } = lookBoard({ look: ['woolly-loxodon'], lands: 3 });
  const chosen = decide(view);
  assert.deepEqual(chosen.bottomIds ?? [], lookIds,
    `karta poza zasięgiem ma iść na spód: ${JSON.stringify(chosen)}`);
});

test('M135: scry 2 — bot rozdziela decyzję per karta (land w dół, stwór zostaje)', () => {
  const { view, lookIds } = lookBoard({
    look: ['basic-forest', 'highland-game'],
    hand: ['basic-forest', 'basic-forest', 'basic-forest'],
    lands: 6,
  });
  const chosen = decide(view);
  const bottom = chosen.bottomIds ?? [];
  assert.equal(bottom.length, 1, `dokładnie jedna karta na spód: ${JSON.stringify(bottom)}`);
  assert.equal(cardIdOf(bottom[0]), 'basic-forest', 'na spód idzie zbędny land, nie stwór');
  assert.ok(!bottom.includes(lookIds[1]), 'Highland Game zostaje na wierzchu');
});

// --- Surveil: grób to nie spód biblioteki ----------------------------------

test('M135: surveil mieli zbędny land (jak scry)', () => {
  const { view, lookIds } = lookBoard({
    look: ['basic-forest'],
    hand: ['basic-forest', 'basic-forest', 'basic-forest', 'basic-forest'],
    lands: 6,
    kind: 'surveil',
  });
  const chosen = decide(view);
  assert.equal(chosen.type, 'resolve_surveil');
  assert.deepEqual(chosen.millIds ?? [], lookIds,
    `zbędny land wolno zmielić: ${JSON.stringify(chosen)}`);
});

test('M135: surveil NIE mieli dobrego stwora (grób = strata nieodwracalna, CR 701.44)', () => {
  const { view } = lookBoard({ look: ['highland-game'], lands: 3, kind: 'surveil' });
  const chosen = decide(view);
  assert.deepEqual(chosen.millIds ?? [], [],
    `dobrej karty nie mielimy do grobu: ${JSON.stringify(chosen)}`);
});

test('M135: surveil jest OSTROŻNIEJSZY od scry (grób vs spód biblioteki)', () => {
  // Ta sama karta, ten sam stół — różni się tylko rodzaj decyzji. Karta na
  // granicy opłacalności: scry może ją odłożyć, surveil powinien się wahać
  // bardziej. Sprawdzamy relację punktacji, nie konkretny wybór.
  // M203/2: opcje w `trace()` są SORTOWANE po punktach, więc parowanie ich
  // z `legalCommands` po indeksie przechodziło przypadkiem (dopóki obie
  // kolejności się zgadzały). Parujemy po OPISIE wariantu w śladzie
  // (`resolve_scry(bottom:…)` / `resolve_scry(keep)` — M203/2 w heuristic-bot).
  const scoreOf = (kind, cmdType, listLabel) => {
    const { view, lookIds } = lookBoard({ look: ['woolly-loxodon'], lands: 3, kind });
    const bot = createHeuristicBot({ seed: 3 });
    bot.chooseCommand(view);
    const last = bot.trace().at(-1);
    const opts = last.options.filter((o) => String(o.cmd).startsWith(cmdType));
    const discard = opts.find((o) => String(o.cmd).includes(`${listLabel}:`));
    const keep = opts.find((o) => String(o.cmd).endsWith('(keep)'));
    assert.ok(discard && keep, `ślad musi rozróżniać warianty ${cmdType}: ${JSON.stringify(opts)}`);
    return { discard: discard.score, keep: keep.score, lookIds };
  };
  const scry = scoreOf('scry', 'resolve_scry', 'bottom');
  const surveil = scoreOf('surveil', 'resolve_surveil', 'mill');
  const scryGain = scry.discard - scry.keep;
  const surveilGain = surveil.discard - surveil.keep;
  assert.ok(surveilGain < scryGain,
    `pozbycie się karty ma być mniej atrakcyjne przy surveil (grób) niż przy scry (spód): `
    + `scry ${scryGain} vs surveil ${surveilGain}`);
});
