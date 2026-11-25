// J2 (zgłoszenie właściciela 2026-11-23): JEDNA bramka drenażu biblioteki.
//
// > „A czemu ta zasada nie może być wspólna dla wszystkich kart opróżniających
// > bibliotekę? Po co robić wiele różnych blokerów/funkcji? Powinna być jedna
// > dla wszystkich sytuacji gdy czar opróżnia bibliotekę ponad standardowe
// > draw. Nie powinieneś pisać 100 podobnych funkcji tylko unifikować takie
// > sytuacje do jednej wspólnej funkcji."
// > „Skoro uznaliśmy, że po wykonaniu czary library nie powinna spaść poniżej
// > 10, to wszędzie powinno to być respektowane. Jak jakiś test liczy to
// > inaczej, to trzeba zmienić test."
//
// Kontrakt: `libraryDrainVeto` — jedyna implementacja podłogi10 PO drenażu,
// dla KAŻDEJ komendy, która opróżnia własną bibliotekę (mill, tutor,
// płatność-mill, doboru efektowe, aktywacje, ataki) — wszystko poza
// standardowym draw stepem. Kroki graniczne:
//   • draw1 (Rager): 10 → weto, 11 → rzut;
//   • aktywacja mill1 (Bell): (10,5) → weto mimo prowadzenia, (11,5) → rzut;
//   • mill3 (Moldgraf): patrz zgloszenie-j-moldgraf-selfmill J/5/J/6;
//   • tutor2 (Roiling): patrz zgloszenie-roiling-regrowth-drenaz R/2/R/2b;
//   • loot2 (Izzet Charm): patrz zgloszenie-j-izzet-charm-loot J/5.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REG = createCardRegistry();

function put(state, id, cardId, pid, zone) {
  const def = REG.get(cardId);
  assert.ok(def, `${cardId} w rejestrze`);
  addObject(state, {
    ...gameObjectDataOf(def), id, instanceId: `i-${id}`, cardId,
    controllerId: pid, ownerId: pid, zone,
    types: def.types ?? [], subtypes: def.subtypes ?? [], keywords: def.keywords ?? [],
    spell: def.spell,
  });
  if (zone === 'battlefield') {
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  }
  return state.objects.get(id);
}

function scene({ myLib, foeLib, cardId, id, zone = 'hand', manaPool = { C: 4 } }) {
  const state = createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  state.pendingMulligans = [];
  for (let i = 0; i < myLib; i += 1) put(state, `mylib${i}`, 'highland-game', 'p1', 'library');
  for (let i = 0; i < foeLib; i += 1) put(state, `foelib${i}`, 'highland-game', 'p2', 'library');
  for (let i = 0; i < 4; i += 1) put(state, `land${i}`, 'basic-forest', 'p1', 'battlefield');
  const player = state.players.find((pl) => pl.id === 'p1');
  player.mana = 4; player.manaPool = { ...manaPool };
  put(state, id, cardId, 'p1', zone);
  return state;
}

function pick(state) {
  const bot = createHeuristicBot({ seed: 1 });
  const cmd = bot.chooseCommand(playerView(state, 'p1'));
  const t = bot.trace().at(-1);
  return { cmd, options: (t?.options ?? []).map((o) => ({ cmd: o.cmd, score: o.score })) };
}

test('U/1 (draw efektowy): Rager dobiera 1 — lib10 → weto, lib11 → rzut', () => {
  const cienka = pick(scene({ myLib: 10, foeLib: 20, cardId: 'phyrexian-rager', id: 'rag', manaPool: { B: 4 } }));
  assert.ok(!(cienka.cmd.type === 'cast_permanent' && cienka.cmd.objectId === 'rag'),
    `10 − 1 = 9 < 10 — weto; bot wybrał ${cienka.cmd.type}(${cienka.cmd.objectId ?? ''}) — ${JSON.stringify(cienka.options)}`);
  const granica = pick(scene({ myLib: 11, foeLib: 20, cardId: 'phyrexian-rager', id: 'rag', manaPool: { B: 4 } }));
  assert.ok(granica.cmd.type === 'cast_permanent' && granica.cmd.objectId === 'rag',
    `11 − 1 = 10 — granica przechodzi; bot wybrał ${granica.cmd.type}(${granica.cmd.objectId ?? ''}) — ${JSON.stringify(granica.options)}`);
});

test('U/2 (aktywacja): Bell mill1 — (10,5) weto mimo prowadzenia, (11,5) aktywacja', () => {
  const cienka = scene({ myLib: 10, foeLib: 5, cardId: 'ghoulcallers-bell', id: 'bell', zone: 'battlefield' });
  // Bell jest na stole — przenieść z ręki: scena daje kartę w ręce, potrzebny battlefield.
  const bell1 = pick(cienka);
  assert.ok(!(bell1.cmd.type === 'activate_ability' && bell1.cmd.objectId === 'bell'),
    `10 − 1 = 9 < 10 — weto nawet przy prowadzeniu; bot wybrał ${JSON.stringify(bell1.cmd)}`);

  const zdrowa = scene({ myLib: 11, foeLib: 5, cardId: 'ghoulcallers-bell', id: 'bell', zone: 'battlefield' });
  const bell2 = pick(zdrowa);
  assert.ok(bell2.cmd.type === 'activate_ability' && bell2.cmd.objectId === 'bell',
    `11 − 1 = 10 — aktywacja przechodzi; bot wybrał ${JSON.stringify(bell2.cmd)} — ${JSON.stringify(bell2.options)}`);
});
