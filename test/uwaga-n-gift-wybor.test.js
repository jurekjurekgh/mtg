// N (zgłoszenie właściciela 2026-10-09, Crumb and Get It): „Rzucając ten czar
// nie mam żadnego wyboru, a chyba powinienem móc wybrać czy obiecuję gift”.
//
// Root cause: grupa wariantów „cel × obietnica daru” (CR 702.174a) łapała
// `singleTargetPlanOf` — kreator celów — a jego zatwierdzenie szuka komendy
// przez `commandForSelection`, który dopasowuje TYLKO po `targets` (+ `xValue`)
// i nie zna `gifted`. Zatwierdzenie wybierało pierwszy pasujący wariant (bez
// daru) — wybór obietnicy przepadał. K (2026-09-19b) pinował tylko
// grupowanie panelu (jeden wpis, modal z wariantami), nie ścieżkę kreatora.
//
// Fix: strażnik `uniformGiftOf` w planach kreatora (singleTarget /
// multiTarget / castMode / sacrifice / divided) — grupa z NIEJEDNOLITYM
// giftem wraca null i pada na fallback `buttonsPlanOf`: osobny przycisk na
// wariant, etykieta „(dar)” rozróżnia. Kontrakt K trzymany (nadal JEDEN wpis
// panelu; modal otwiera wybór). ADR 0002 — po polu komendy, nie po karcie.
import test from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addMana } from '../src/engine/resources.js';
import { buildActionEntries } from '../src/table/render.js';
import {
  singleTargetPlanOf,
  multiTargetPlanOf,
  castModePlanOf,
  buttonsPlanOf,
} from '../src/table/multi-target.js';

const REGISTRY = createCardRegistry();
const SESSION = {
  nameOf: (id) => REGISTRY.get(id)?.name ?? id,
  nameOfObject: (id) => REGISTRY.get(String(id).split('#')[0])?.name ?? id,
  cardDetails: (id) => REGISTRY.get(id),
  abilitiesOf: (id) => gameObjectDataOf(REGISTRY.get(id)).abilities ?? [],
  colorsOf: () => [],
};

let counter = 0;
function giftBoard() {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  const put = (cardId, zone, controllerId = 'p1') => {
    const def = REGISTRY.get(cardId);
    const data = gameObjectDataOf(def);
    const id = `${cardId}#${counter += 1}`;
    addObject(state, {
      id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
      kind: data.kind, manaCost: data.manaCost, cardName: def.name, spell: def.spell,
      gift: def.gift ?? null,
    });
    return id;
  };
  put('basic-plains', 'battlefield');
  put('dawntreader-elk', 'battlefield');
  put('crumb-and-get-it', 'hand');
  addMana(state, 'p1', 1, { colors: ['W'] });
  return state;
}

const bazowy = { type: 'cast_spell', objectId: 'cag', targets: ['my'] };
const zDarem = { ...bazowy, gifted: true, giftRecipientId: 'p2' };

test('N/1: singleTargetPlanOf odrzuca grupę z niejednolitym darem (był kreator celów)', () => {
  // PRZED: plan łapał grupę (1 cel, ten sam objectId) i zatwierdzenie
  // wybierało wariant bez daru — użytkownik nie miał wyboru.
  assert.equal(singleTargetPlanOf([bazowy, zDarem]), null,
    'grupa „cel × obietnica” nie może iść przez kreator celów');
});

test('N/2: multiTargetPlanOf odrzuca grupę wielocelową z niejednolitym darem', () => {
  const grupa = [
    { type: 'cast_spell', objectId: 'o', targets: ['a'] },
    { type: 'cast_spell', objectId: 'o', targets: ['b'] },
    { type: 'cast_spell', objectId: 'o', targets: ['a', 'b'] },
    { type: 'cast_spell', objectId: 'o', targets: ['a'], gifted: true, giftRecipientId: 'p2' },
  ];
  assert.equal(multiTargetPlanOf(grupa), null, 'commandForSelection nie zna gifted');
});

test('N/3: castModePlanOf odrzuca grupę modalną z niejednolitym darem', () => {
  const grupa = [
    { type: 'cast_spell', objectId: 'o', modeIndex: 0, targets: ['a'] },
    { type: 'cast_spell', objectId: 'o', modeIndex: 1, targets: ['a'] },
    { type: 'cast_spell', objectId: 'o', modeIndex: 0, targets: ['a'], gifted: true, giftRecipientId: 'p2' },
  ];
  assert.equal(castModePlanOf(grupa), null, 'reps biorą pierwszy wariant — dar przepadłby');
});

test('N/4: fallback buttonsPlanOf łapie grupę — osobny przycisk na wariant', () => {
  const plan = buttonsPlanOf([bazowy, zDarem]);
  assert.ok(plan, 'fallback istnieje');
  assert.equal(plan.rows.length, 2, 'dwa wiersze: bez daru i z darem');
});

test('N/5: integracja — panel ma JEDEN wpis (kontrakt K), modal nie używa kreatora celów', () => {
  const state = giftBoard();
  const view = playerView(state, 'p1');
  const wpisy = buildActionEntries(view.legalCommands, SESSION, view)
    .filter((e) => e.request?.options?.some((c) => c.type === 'cast_spell')
      || e.command?.type === 'cast_spell');
  assert.equal(wpisy.length, 1, 'jeden wpis na czar w panelu (K)');
  const opcje = wpisy[0].request.options.filter((c) => c.type === 'cast_spell');
  assert.ok(opcje.some((c) => c.gifted), 'modal niesie wariant z darem (K)');
  assert.ok(opcje.some((c) => !c.gifted), 'modal niesie wariant bez daru (K)');
  assert.equal(singleTargetPlanOf(opcje), null,
    'modal idzie w przyciski (wybór daru), nie w kreator celów');
});

test('N/6 kontrola: grupa bez daru nadal idzie przez kreator celów', () => {
  const grupa = [
    { type: 'cast_spell', objectId: 'o', targets: ['a'] },
    { type: 'cast_spell', objectId: 'o', targets: ['b'] },
  ];
  assert.ok(singleTargetPlanOf(grupa), 'Shock (2 cele, bez daru) — kreator jak dawniej');
});

test('N/7 kontrola: jednolity dar (wszędzie obiecany) nie jest wyborem — plan wolny', () => {
  const grupa = [
    { type: 'cast_spell', objectId: 'o', targets: ['a'], gifted: true, giftRecipientId: 'p2' },
    { type: 'cast_spell', objectId: 'o', targets: ['b'], gifted: true, giftRecipientId: 'p2' },
  ];
  assert.ok(singleTargetPlanOf(grupa), 'stały dar nie wymaga decyzji — kreator OK');
});

test('N/8: silnik oferuje oba warianty rzutu (kontrakt CR 702.174a)', () => {
  const state = giftBoard();
  const view = playerView(state, 'p1');
  const czary = view.legalCommands.filter((c) => c.type === 'cast_spell');
  assert.ok(czary.some((c) => !c.gifted), 'wariant bez obietnicy');
  const dar = czary.find((c) => c.gifted);
  assert.ok(dar, 'wariant z obietnicą');
  assert.equal(dar.giftRecipientId, 'p2', 'odbiorca daru wskazany');
});
