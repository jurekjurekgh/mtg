// Uwaga z gry właściciela, 2026-09-22 (N) — Bonds of Faith.
//
// „Enchant creature. Enchanted creature gets +2/+2 as long as it's a Human.
// Otherwise, it can't attack or block.” — „Bot rzuca ten czar na moją kreaturę,
// typu human. Dostaję +2/+2. Świetny scoring! Może niech od razu klika
// w »poddaję się«. Masakra.”
//
// Root cause (pomiar śladem bota, scena 3 lądy + aura w ręce):
//   cudzy Human    +67,5  ← PREZENT dla przeciwnika wyceniony jak removal
//   cudzy nie-Human +69,3  (poprawnie: pacyfizm)
//   własny Human   −67,5  ← własny buff wyceniony jak strzał w stopę
// Wycena była DOKŁADNIE ODWRÓCONA na obu warunkowych gałęziach karty.
//
// Dwie przyczyny, obie klasowe (ADR 0002 — deskryptor, nie nazwa karty):
//  1. `auraIsHostile` uznawała aurę za wrogą, gdy deskryptor NIÓSŁ `cantAttack`
//     /`cantBlock`, nie patrząc na bramkę warunku (`hostLacksSubtype`). Aura
//     WARUNKOWA ma dwa rozłączne oblicza i o tym, które zadziała, decyduje
//     KONKRETNY gospodarz (CR 613.1d — warunki czytane read-time), więc
//     wrogość musi być liczona względem celu, nie samej karty.
//  2. Wycena buffa czytała wyłącznie `descriptor.pump`, a „+2/+2 dopóki Human”
//     siedzi w `conditionalPump` (silnik je stosuje — permanents.js). Dla bota
//     buff był ZEREM, więc własny Human wyglądał gorzej niż cudzy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
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

/** Scena ze zgłoszenia: bot (p1) z Bonds of Faith, po obu stronach Human i nie-Human. */
function scene() {
  const state = createGameState({ seed: 3, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.phase = 'precombat_main';
  state.turn.step = 'main1';
  state.turn.number = 5;
  for (let i = 0; i < 3; i += 1) put(state, `pl${i}`, 'basic-plains', 'p1');
  put(state, 'bof', 'bonds-of-faith', 'p1', 'hand');
  put(state, 'wrogiHuman', 'midnight-guard', 'p2');                 // Human — dostałby +2/+2
  put(state, 'wrogiInny', 'satyr-wayfinder', 'p2', 'battlefield', { power: 3, toughness: 3 }); // Satyr — pacyfizm
  put(state, 'mojHuman', 'midnight-guard', 'p1');                   // własny Human — buff
  const view = playerView(state, 'p1');
  const bot = createHeuristicBot({ seed: 3 });
  bot.chooseCommand(view);
  const opts = bot.trace()[0].options;
  const score = (frag) => opts.find((o) => o.cmd.includes(frag))?.score;
  return { chosen: bot.trace()[0].chosen, score };
}

test('N: aura warunkowa NIE trafia na wrogiego Humana — to prezent, nie removal', () => {
  const { score } = scene();
  assert.ok(score('->wrogiHuman') < 0,
    `+2/+2 dla przeciwnika musi być ujemne, było ${score('->wrogiHuman')}`);
  assert.ok(score('->wrogiHuman') < score('->wrogiInny'),
    'zaczarowanie wrogiego Humana musi być gorsze niż unieruchomienie nie-Humana');
});

test('N: na wrogim NIE-Humanie aura działa jak pacyfizm i pozostaje dobrym zagraniem', () => {
  const { score } = scene();
  assert.ok(score('->wrogiInny') > 0,
    'unieruchomienie „can\'t attack or block” u przeciwnika to realne removal');
});

test('N: na WŁASNYM Humanie aura to buff — warunkowy pump musi być policzony', () => {
  const { score, chosen } = scene();
  assert.ok(score('->mojHuman') > 0,
    `własny buff nie może być ujemny, było ${score('->mojHuman')}`);
  // Warunkowy +2/+2 musi być POLICZONY, nie tylko nieujemny: Human 2/3 rośnie
  // do 4/5, co jest lepszym zagraniem niż unieruchomienie wrogiego 3/3.
  // Bez odczytu `conditionalPump` własny buff wypada PONIŻEJ pacyfizmu
  // i bot wybiera cudzego stwora (dokładnie ten objaw co w zgłoszeniu).
  assert.ok(score('->mojHuman') > score('->wrogiInny'),
    `buff +2/+2 na własnym Humanie (${score('->mojHuman')}) musi bić pacyfizm `
    + `na wrogim nie-Humanie (${score('->wrogiInny')}) — inaczej pump nie jest liczony`);
  assert.ok(chosen.includes('->mojHuman'),
    `bot ma zaczarować własnego Humana, a wybrał: ${chosen}`);
  assert.ok(score('->mojHuman') > score('->wrogiHuman') + 50,
    'przepaść między buffem dla siebie a prezentem dla wroga musi być wyraźna');
});

test('N: aura BEZWARUNKOWO unieruchamiająca nadal jest wroga (brak regresji M121)', () => {
  // Granica: naprawa nie może rozbroić kotwic bez bramki warunku — te muszą
  // dalej lecieć w przeciwnika, nie we własnego stwora.
  const state = createGameState({ seed: 4, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.phase = 'precombat_main';
  state.turn.step = 'main1';
  state.turn.number = 5;
  for (let i = 0; i < 3; i += 1) put(state, `pl${i}`, 'basic-plains', 'p1');
  put(state, 'hobble', 'hobble', 'p1', 'hand');
  put(state, 'mine', 'midnight-guard', 'p1');
  put(state, 'theirs', 'midnight-guard', 'p2');
  const view = playerView(state, 'p1');
  const bot = createHeuristicBot({ seed: 4 });
  bot.chooseCommand(view);
  const opts = bot.trace()[0].options;
  const s = (frag) => opts.find((o) => o.cmd.includes(frag))?.score;
  if (s('->mine') == null || s('->theirs') == null) return; // karta spoza puli — granica nie dotyczy
  assert.ok(s('->theirs') > s('->mine'),
    'bezwarunkowa kotwica musi celować w przeciwnika, nie w siebie');
});
