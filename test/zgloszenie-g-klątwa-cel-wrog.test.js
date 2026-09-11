// Zgłoszenie właściciela G (2026-09-11, dopełnienie F) — „Rzut klątwy na
// siebie to jakaś aberracja — to powinno mieć -1000 scoringu".
//
// Pomiar przed fixem (sonda na stanie: klątwa w ręce bota, 8 many):
//   warianty cast_permanent: [curse->p1, curse->p2]
//   score(curse->p1) = -45   score(curse->p2) = -45   → wybrany pass_priority
// czyli oba cele wycenione IDENTYCZNIE i oba odrzucone: gałąź aury w
// `cast_permanent` szuka celu przez `objectOnBoard`, a celem klątwy jest GRACZ
// (CR 303.4 „Enchant player"), więc `!target` → `auraNoTargetPenalty`. Skutki:
//   1. klątwa na WŁASNEGO gracza nie jest w żaden sposób odróżniona od klątwy
//      na przeciwnika (brak jakiejkolwiek kary — właściciel: -1000);
//   2. bot w ogóle nie rzuca klątw (karta z katalogu jest martwa w jego ręce).
//
// Fix rozróżnia cel po deskryptorze `aura.enchant === 'player'` i po tym, czy
// efekty aury szkodzą zaczarowanemu graczowi (ADR 0002: bez nazw kart).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { DEFAULT_HEURISTIC_PARAMS } from '../src/controllers/heuristic-params.js';
import { DEFAULT_HEURISTIC_WEIGHTS } from '../src/controllers/heuristic-weights.js';

const REGISTRY = createCardRegistry();

function gra({ reka, pola = [] }) {
  const s = createGameState({ seed: 11, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main', 'p2');
  s.turn.activePlayerId = 'p2';
  s.turn.priorityPlayerId = 'p2';
  for (const [id, cardId, zone] of reka) {
    const def = REGISTRY.get(cardId);
    assert.ok(def, `${cardId} w katalogu`);
    addObject(s, {
      id, instanceId: `i-${id}`, cardId, controllerId: 'p2', ownerId: 'p2', zone,
      ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
      subtypes: def.subtypes ?? [], spell: def.spell,
    });
  }
  for (const [id, cardId, wlasciciel] of pola) {
    const def = REGISTRY.get(cardId);
    addObject(s, {
      id, instanceId: `i-${id}`, cardId, controllerId: wlasciciel, ownerId: wlasciciel,
      zone: 'battlefield', ...gameObjectDataOf(def), types: def.types ?? [],
      keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
    });
    s.objects.set(id, Object.freeze({ ...s.objects.get(id), summoningSickness: false }));
  }
  addMana(s, 'p2', 8, { colors: ['W', 'U', 'B', 'R', 'G'] });
  return s;
}

/** Score wariantu z ostatniego wpisu trace bota (kształt: {cmd, score}). */
function scoreWariantu(bot, fragment) {
  const wpis = bot.trace().at(-1);
  const opcja = wpis.options.find((o) => String(o.cmd).includes(fragment));
  assert.ok(opcja, `wariant „${fragment}" w trace: ${JSON.stringify(wpis.options)}`);
  return opcja.score;
}

test('G/1: klątwa na WŁASNEGO gracza jest wyceniona katastrofalnie (-1000 wg właściciela)', () => {
  const s = gra({ reka: [['curse', 'curse-of-the-pierced-heart', 'hand']] });
  const bot = createHeuristicBot({ seed: 11 });
  bot.chooseCommand(playerView(s, 'p2'));
  const naSiebie = scoreWariantu(bot, 'cast_permanent(curse->p2)');
  // Właściciel: „to powinno mieć -1000 scoringu". Trace niesie wynik PO wadze
  // rodziny komend (`weightedScore`: cast_permanent → 'permanent' = 0.9), więc
  // -1000 z parametru czyta się w trace jako -900. Wartość pinujemy DOSŁOWNIE:
  // asercja liczona z tego samego parametru byłaby tautologią — zmierzona
  // mutacja `curseSelfTargetPenalty: 1000 → 50` przechodziła na zielono (L13).
  assert.equal(naSiebie, -900, 'klątwa na siebie = -1000 × waga rodziny „permanent" 0.9');
  assert.equal(
    naSiebie,
    -DEFAULT_HEURISTIC_PARAMS.curseSelfTargetPenalty * DEFAULT_HEURISTIC_WEIGHTS.permanent,
    'ta sama liczba musi wynikać z parametru curseSelfTargetPenalty i wagi rodziny',
  );
});

test('G/2: ta sama klątwa na PRZECIWNIKA jest zyskiem i bot ją rzuca', () => {
  const s = gra({ reka: [['curse', 'curse-of-the-pierced-heart', 'hand']] });
  const bot = createHeuristicBot({ seed: 11 });
  const cmd = bot.chooseCommand(playerView(s, 'p2'));
  const naWroga = scoreWariantu(bot, 'cast_permanent(curse->p1)');
  assert.ok(naWroga > 0, `klątwa na przeciwnika musi być zyskiem, jest ${naWroga}`);
  assert.equal(cmd.type, 'cast_permanent', `bot ma rzucić klątwę, wybrał ${cmd.type}`);
  assert.deepEqual(cmd.targets, ['p1'], 'cel to przeciwnik, nie własny gracz');
});

test('G/3 anty-over-fix: zwykła aura-buff na stworze nie dostaje kary klątwy', () => {
  // Nature's Embrace ({3}, +2/+2, bez keywordów) — czysty buff, więc jego
  // wycena NIE zależy od jakości ochrony ani od zagrożeń u przeciwnika
  // (Guildscorn Ward się do tej roli nie nadaje: to czysta ochrona i przy
  // braku wielokolorowych celów jest słusznie wyceniona na minus — M209).
  const s = gra({
    reka: [['ward', 'natures-embrace', 'hand']],
    pola: [['moj', 'alaborn-trooper', 'p2']],
  });
  const bot = createHeuristicBot({ seed: 11 });
  const cmd = bot.chooseCommand(playerView(s, 'p2'));
  const wpis = bot.trace().at(-1);
  const aura = wpis.options.find((o) => String(o.cmd).startsWith('cast_permanent(ward'));
  assert.ok(aura, `wariant aury w trace: ${JSON.stringify(wpis.options)}`);
  assert.ok(aura.score > 0, `buff-aura na własnym stworze nadal opłacalna, jest ${aura.score}`);
  // `concede` ma z definicji -Infinity (nigdy nie wybierane dobrowolnie), więc
  // porównujemy tylko realne warianty gry.
  const realne = wpis.options.filter((o) => o.cmd !== 'concede');
  assert.ok(
    !realne.some((o) => (o.score ?? 0) <= -DEFAULT_HEURISTIC_PARAMS.curseSelfTargetPenalty),
    `kara klątwy nie może przeciekać na inne warianty: ${JSON.stringify(realne)}`,
  );
  assert.equal(cmd.type, 'cast_permanent', `bot ma rzucić aurę, wybrał ${cmd.type}`);
});
