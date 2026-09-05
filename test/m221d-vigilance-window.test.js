// M221/D + B (zgłoszenie właściciela z realnej gry, Bladed Sentinel „{W}:
// vigilance do końca tury"): bot wykupywał vigilance w MAIN1, po czym NIE
// ATAKOW — zmarnowana mana {W}. Vigilance = „nie tapuje się przy ataku"
// (CR 702.21) daje korzyść TYLKO jeśli stwór rzeczywiście atakuje w tej
// turze (wtedy zostaje odkręcony do bloku). Kupowanie w main1/beginning_of_combat
// (przed decyzją o ataku) to marnowanie many. Reguła po STANIE: kupuj vigilance
// dopiero w kroku deklaracji atakujących (gdy decyzja o ataku zapada razem z
// grantem) albo w odpowiedzi na bloki. Nie kupuj w main1, w turze przeciwnika,
// na zatapniętym stwoże.
//
// Reguła po STANIE (moja tura + krok deklaracji atakujących + stwór gotowy),
// nie po nazwie kroku/karty (L42/L64, ADR 0002). Wspólny helper
// keywordGrantWindowValue (L41 — czary i zdolności).
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

// B (zgłoszenie właściciela z żywej gry): Bladed Sentinel w main1 kupował
// vigilance za {W}, po czym nie atakował — zmarnowana mana. W main1 bot NIE
// wie jeszcze, czy będzie atakować (presja wroga, stwory z deathtouch,
// itd.), więc nie kupujmy tam. Właściwy moment to krok declare_attackers,
// kiedy wybór atakujących zapada RÓWNOLEGLE z grantem.
test('M221/B: NIE kupuje vigilance w MAIN1 (przed decyzją o ataku)', () => {
  const { pass, vig } = vigScores(setup({ step: 'main1', active: 'p1', tapped: false }));
  assert.ok(vig.length > 0, 'zdolność musi być w ofercie');
  for (const s of vig) assert.ok(s < pass, `main1: vigilance < pass (${pass}), było ${s}`);
});

// B: to samo w kroku beginning_of_combat — decyzja o ataku jeszcze nie zapadła.
test('M221/B: NIE kupuje vigilance w beginning_of_combat', () => {
  const { pass, vig } = vigScores(setup({ step: 'beginning_of_combat', active: 'p1', tapped: false }));
  assert.ok(vig.length > 0, 'zdolność musi być w ofercie');
  for (const s of vig) assert.ok(s < pass, `beginning_of_combat: vigilance < pass (${pass}), było ${s}`);
});

// M221/D (skorygowane po B): w KROKU DEKLARACJI ATAKUJĄCYCH, kiedy atak jest
// w toku i stwór odkręcony, bot KUPUJE vigilance (pozostaje odkręcony do bloku).
test('M221/D: w declare_attackers (przed atakiem, odkręcony) bot kupuje vigilance', () => {
  const { pass, vig } = vigScores(setup({ step: 'declare_attackers', active: 'p1', tapped: false }));
  assert.ok(vig.length > 0 && vig.some((s) => s > pass),
    `declare_attackers, odkręcony: vigilance > pass (${pass}): ${JSON.stringify(vig)}`);
});

test('M221/D: NIE kupuje vigilance w turze przeciwnika', () => {
  const { pass, vig } = vigScores(setup({ step: 'declare_blockers', active: 'p2', tapped: false }));
  assert.ok(vig.length > 0, 'zdolność musi być w ofercie (mam manę)');
  for (const s of vig) assert.ok(s < pass, `tura przeciwnika: vigilance < pass (${pass}), było ${s}`);
});

test('M221/D: NIE kupuje vigilance na ZATAPNIĘTEJ kreaturze (nawet w declare_attackers)', () => {
  const { pass, vig } = vigScores(setup({ step: 'declare_attackers', active: 'p1', tapped: true }));
  assert.ok(vig.length > 0, 'zdolność musi być w ofercie');
  for (const s of vig) assert.ok(s < pass, `zatapniętej vigilance nic nie daje: < pass (${pass}), było ${s}`);
});
