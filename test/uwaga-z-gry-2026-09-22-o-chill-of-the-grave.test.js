// Uwaga z gry właściciela, 2026-09-22 (O) — Chill of the Grave.
//
// „Tap target creature. It doesn't untap during its controller's next untap
// step.” — „Bot może rzucić ją na moją kreaturę 3/3 (1/1 z aurą +2/+2) albo na
// kreaturę 1/1. Oczywiście rzuca na kreaturę 1/1. Brawo! Mistrz! Masakra.”
//
// Root cause (pomiar śladem bota, sonda na składowych wyceny): taki czar to
// JEDEN skutek rozpisany na DWA deskryptory (`tap_permanent` +
// `dont_untap_next_untap_step`), a wycena liczyła każdy osobno przez
// `tapTargetValue`. Skutki:
//   1. dla celu ODKRĘCONEGO wartość ciała wchodziła DWA razy (base+timing
//      w obu składowych), dla celu już tapniętego tylko raz — drobny,
//      odkręcony 1/1 bił groźną, tapniętą kreaturę;
//   2. składowa „tap” na celu już tapniętym zwracała −12 („nic nie zmienia”)
//      i ta kara przeważała sumę, choć blokada odkręcania jest wtedy warta
//      NAJWIĘCEJ — stwór nie odkręci się i wypada z następnej tury
//      (CR 302.6, 701.26);
//   3. baza liczyła surowe `power` wydruku zamiast mocy EFEKTYWNEJ, więc
//      „1/1 z aurą +2/+2” było dla bota jedynką, a nie trójką.
//
// Naprawa (ADR 0002 — po deskryptorach, bez nazw kart): całość wycenia gałąź
// `locking`, składowa „tap” przy niej milczy (0), a moc czytamy przez
// `combatPower` (aury/liczniki wliczone).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { attachAuraToCreature } from '../src/engine/attachments.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, ctrl, zone = 'battlefield', extra = {}) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: ctrl, ownerId: ctrl, zone,
    ...data, types: def.types, subtypes: def.subtypes ?? [],
    keywords: def.keywords ?? [], cardName: def.name, ...extra,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
}

/**
 * Scena ze zgłoszenia: po stronie przeciwnika goła 1/1 i 1/1 z aurą +2/+2
 * (efektywnie 3/3). `tappedBig` odtwarza wariant, w którym groźna kreatura
 * właśnie zaatakowała i stoi tapnięta.
 */
function scene({ step, phase, active, tappedBig = false }) {
  const state = createGameState({ seed: 5, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, active);
  state.turn.activePlayerId = active;
  state.turn.priorityPlayerId = 'p1';
  state.turn.phase = phase;
  state.turn.step = step;
  state.turn.number = 6;
  for (let i = 0; i < 4; i += 1) put(state, `isl${i}`, 'basic-island', 'p1');
  put(state, 'chill', 'chill-of-the-grave', 'p1', 'hand');
  for (let i = 0; i < 20; i += 1) put(state, `lib${i}`, 'basic-island', 'p1', 'library');
  put(state, 'maly', 'midnight-guard', 'p2', 'battlefield', { power: 1, toughness: 1 });
  put(state, 'duzy', 'midnight-guard', 'p2', 'battlefield', { power: 1, toughness: 1 });
  put(state, 'aura', 'feral-invocation', 'p2');
  attachAuraToCreature(state, 'aura', 'duzy');
  if (tappedBig) {
    state.objects.set('duzy', Object.freeze({ ...state.objects.get('duzy'), tapped: true }));
  }
  const view = playerView(state, 'p1');
  const bot = createHeuristicBot({ seed: 5 });
  bot.chooseCommand(view);
  const opts = bot.trace()[0].options;
  return {
    chosen: bot.trace()[0].chosen,
    duzy: opts.find((o) => o.cmd.includes('->duzy'))?.score,
    maly: opts.find((o) => o.cmd.includes('->maly'))?.score,
    efektywnaMoc: view.zones.battlefield.find((o) => o.id === 'duzy')?.power,
  };
}

test('O: scena ze zgłoszenia — cel z aurą jest realną 3/3, nie 1/1', () => {
  const r = scene({ step: 'upkeep', phase: 'beginning', active: 'p2' });
  assert.equal(r.efektywnaMoc, 3, 'widok musi pokazywać moc z aurą (kontrola sceny)');
});

test('O: bot celuje w GROŹNIEJSZĄ kreaturę, nie w gołą 1/1', () => {
  const r = scene({ step: 'upkeep', phase: 'beginning', active: 'p2' });
  assert.ok(r.chosen.includes('->duzy'), `celem ma być 3/3, a bot wybrał: ${r.chosen}`);
  assert.ok(r.duzy > r.maly, `3/3 (${r.duzy}) musi bić 1/1 (${r.maly})`);
});

test('O: gdy groźna kreatura jest JUŻ TAPNIĘTA, nadal jest lepszym celem', () => {
  // Sedno zgłoszenia: blokada odkręcania na tapniętym stworze zabiera go
  // z CAŁEJ następnej tury (CR 302.6) — to najlepszy, nie najgorszy scenariusz.
  const r = scene({ step: 'upkeep', phase: 'beginning', active: 'p2', tappedBig: true });
  assert.ok(r.chosen.includes('->duzy'),
    `tapnięta 3/3 ma pozostać celem, a bot wybrał: ${r.chosen}`);
  assert.ok(r.duzy > r.maly,
    `tapnięta 3/3 (${r.duzy}) musi bić nietapniętą 1/1 (${r.maly})`);
});

test('O: ranking celów jest stabilny w każdym oknie tury', () => {
  const okna = [
    ['upkeep wroga', { step: 'upkeep', phase: 'beginning', active: 'p2' }],
    ['main1 wroga', { step: 'main1', phase: 'precombat_main', active: 'p2' }],
    ['end wroga', { step: 'end', phase: 'ending', active: 'p2' }],
    ['moja main1', { step: 'main1', phase: 'precombat_main', active: 'p1' }],
  ];
  for (const [nazwa, cfg] of okna) {
    for (const tappedBig of [false, true]) {
      const r = scene({ ...cfg, tappedBig });
      assert.ok(r.duzy > r.maly,
        `${nazwa}${tappedBig ? ' (3/3 tapnięta)' : ''}: 3/3 (${r.duzy}) musi bić 1/1 (${r.maly})`);
    }
  }
});
