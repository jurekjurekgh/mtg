// M221/D — zgłoszenie właściciela z realnej gry (Bladed Sentinel „{W}:
// vigilance do końca tury"): bot wykupywał vigilance w MOJEJ (przeciwnika)
// turze walki, nawet na ZATAPNIĘTEJ kreaturze — podwójne marnotrawstwo many.
// Vigilance = „nie tapuje się przy ataku" (CR 702.21): ma sens tylko, gdy
// stwór zaraz zaatakuje w turze bota i jest odkręcony.
//
// Reguła po STANIE (moja tura + gotowość do ataku), nie po nazwie kroku/karty
// (L42/L64, ADR 0002). Wspólny helper keywordGrantWindowValue (L41 — czary
// i zdolności).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function setup({ step, active, tapped, priority = 'p1' }) {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, active);
  state.turn.activePlayerId = active;
  state.turn.priorityPlayerId = priority;
  addMana(state, 'p1', 10);
  const bs = gameObjectDataOf(REGISTRY.get('bladed-sentinel'));
  addObject(state, {
    id: 'bs', instanceId: 'i-bs', cardId: 'bladed-sentinel', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: bs.kind, power: bs.power, toughness: bs.toughness,
    abilities: bs.abilities ?? [], keywords: bs.keywords ?? [], subtypes: bs.subtypes ?? [],
    types: bs.types ?? ['Artifact', 'Creature'],
  });
  state.objects.set('bs', Object.freeze({ ...state.objects.get('bs'), summoningSickness: false, tapped }));
  return state;
}

function vigScores(state) {
  const view = playerView(state, 'p1');
  const bot = createHeuristicBot({ seed: 1 });
  bot.chooseCommand(view, {});
  const trace = bot.trace()[0];
  const pass = trace.options.find((o) => o.cmd === 'pass_priority')?.score ?? 0;
  const vig = trace.options.filter((o) => o.cmd.startsWith('activate_ability(bs')).map((o) => o.score);
  return { pass, vig };
}

test('M221/D: vigilance NADANE przed własnym atakiem (moja tura, odkręcony) — bot wykupuje', () => {
  const { pass, vig } = vigScores(setup({ step: 'main1', active: 'p1', tapped: false }));
  assert.ok(vig.length > 0 && vig.some((s) => s > pass),
    `w mojej turze przed atakiem vigilance > pass (${pass}): ${JSON.stringify(vig)}`);
});

test('M221/D: NIE wykupuje vigilance w turze przeciwnika', () => {
  const { pass, vig } = vigScores(setup({ step: 'declare_blockers', active: 'p2', tapped: false }));
  assert.ok(vig.length > 0, 'zdolność musi być w ofercie (mam manę)');
  for (const s of vig) assert.ok(s < pass, `tura przeciwnika: vigilance < pass (${pass}), było ${s}`);
});

test('M221/D: NIE wykupuje vigilance na ZATAPNIĘTEJ kreaturze (moja tura)', () => {
  const { pass, vig } = vigScores(setup({ step: 'main1', active: 'p1', tapped: true }));
  assert.ok(vig.length > 0, 'zdolność musi być w ofercie');
  for (const s of vig) assert.ok(s < pass, `zatapniętej vigilance nic nie daje: < pass (${pass}), było ${s}`);
});
