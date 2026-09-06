import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView, execute } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

/**
 * M320 (zgłoszenie właściciela, cz. 5 / NA2): bot celował zdolnościami/czarami
 * w kreatury z Ward {2} (cloakowane 2/2 z Veiled Ascension), nie mając many na
 * dopłatę ward — czar/zdolność zostawała SKONTROWANA (CR 702.21), a mana
 * przepadała. „Bez sensu".
 *
 * Naprawa: wycena wariantów cast / activate_ability / resolve_trigger_target
 * dolicza podatek ward: dopłata {N} po odjęciu many zarezerwowanej na koszt
 * główny; gdy many brak — wariant fiknie i schodzi mocno poniżej passu
 * (wardTargetTax + reservedManaOf + ownOpenMana w heuristic-bot).
 */

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId, zone, extra = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, ...extra,
  });
  return state.objects.get(id);
}

function swamp(state, id, controllerId) {
  put(state, id, 'basic-swamp', controllerId, 'battlefield');
  return state.objects.get(id);
}

function vanilla(state, id, controllerId) {
  const o = put(state, id, 'goblin-piker', controllerId, 'battlefield');
  state.objects.set(id, Object.freeze({ ...o, summoningSickness: false }));
  return state.objects.get(id);
}

/** Wrogi (dla bota) cloakowany 2/2 z ward {2} — jak z Veiled Ascension. */
function enemyCloak(state, id, controllerId) {
  const o = put(state, id, 'goblin-piker', controllerId, 'battlefield', { keywords: ['ward'] });
  state.objects.set(id, Object.freeze({ ...o, faceDown: true, ward: 2, summoningSickness: false }));
  return state.objects.get(id);
}

/**
 * CENNY wrogi stwór z ward {2} (twarzą do góry). Zakryty 2/2 ma wycenę ~0
 * (manaCost 0 pod zakryciem), więc removal w niego i tak przegrywa z passem —
 * żeby zweryfikować sam PODATEK ward, cel musi mieć wartość wartą removalu.
 * Kształt obiektu (keyword + kwota w polu ward) jest zgodny z widokiem silnika
 * (wardAmountOf: keyword 'ward', kwota z pola `ward`).
 */
function enemyWardFatty(state, id, controllerId) {
  const o = put(state, id, 'goblin-piker', controllerId, 'battlefield', { keywords: ['ward'] });
  state.objects.set(id, Object.freeze({
    ...o, power: 5, toughness: 5, manaCost: 6, ward: 2, summoningSickness: false,
  }));
  return state.objects.get(id);
}

/** Bot (p2) w main1: `botSwamps` lądów, ręka = [expunge], plansza wg setup. */
function botChoice({ botSwamps = 0, foeVanilla = false, fatty = false, twinFatty = false, seed = 320 } = {}) {
  const state = createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  for (let i = 0; i < botSwamps; i++) swamp(state, `sw${i}`, 'p2');
  vanilla(state, 'fodder', 'p2'); // własny stwór (krawędź wyceny ataku/bloku)
  enemyCloak(state, 'cloak', 'p1');
  if (foeVanilla) vanilla(state, 'foe-v', 'p1');
  if (fatty) enemyWardFatty(state, 'fatty', 'p1');
  if (twinFatty) {
    enemyWardFatty(state, 'fatty-ward', 'p1');
    const o = put(state, 'fatty-plain', 'goblin-piker', 'p1', 'battlefield');
    state.objects.set('fatty-plain', Object.freeze({ ...o, power: 5, toughness: 5, manaCost: 6, summoningSickness: false }));
  }
  put(state, 'hand-ss', 'expunge', 'p2', 'hand'); // {2}{B} destroy nonblack creature, bez ofiary
  const view = playerView(state, 'p2');
  const bot = createHeuristicBot({ seed });
  const choice = bot.chooseCommand(view, {});
  return { choice, view, state };
}

test('M320/A: removal w CENNY cel z ward {2} bez many na dopłatę — bot NIE rzuca (fizzle)', () => {
  // 3 bagna = koszt {2}{B} Expunge; po rzuceniu pula 0 — ward {2} nie do
  // zapłacenia → wariant fiknie. Bez podatku ward removal 5/5 za 6 man
  // bije pass z dużą nadwyżką i bot rzucił (RED potwierdzony stashem).
  const { choice } = botChoice({ botSwamps: 3, fatty: true });
  assert.notEqual(choice.type, 'cast_spell', `bot nie może rzucać w ward bez many: ${JSON.stringify(choice)}`);
});

test('M320/B: zapas many na ward — rzut legalny, ale bliźniak bez ward wygrywa wycenę', () => {
  // 5 bagien: koszt 3 + ward 2 do zapłacenia — wariant dozwolony (podatek 2).
  // Dwa identyczne 5/5 za 6 — jeden z ward {2}: podstawy równe, podatek
  // rozstrzyga → bot woli cel bez ward.
  const { choice } = botChoice({ botSwamps: 5, twinFatty: true });
  assert.equal(choice.type, 'cast_spell', `z zapasem many rzut jest OK: ${JSON.stringify(choice)}`);
  assert.deepEqual(choice.targets, ['fatty-plain'], `cel bez ward wygrywa: ${JSON.stringify(choice.targets)}`);
});

test('M320/C: zapas many, tylko cloak jako cel — rzut + DOPLATA ward przechodzi (łańcuch silnika)', () => {
  // 5 bagien: koszt Expunge 3 + ward {2} — łańcuch legalny. Wariant cast w cloak
  // ma zostać W OFERCIE (podatek ward wyceny nie wyklucza legalności), a po
  // rzucie decyzja dopłaty ward z pay:true musi być dostępna (czar dochodzi).
  const { view, state } = botChoice({ botSwamps: 5, fatty: true });
  const castCmd = view.legalCommands.find((c) => c.type === 'cast_spell' && c.targets?.[0] === 'cloak');
  assert.ok(castCmd, 'wariant cast w cloak legalny (ward wyceniony, nie wykluczony)');
  const r = execute(state, castCmd);
  assert.ok(r.ok, `rzut przyjęty: ${JSON.stringify(r.events?.slice(-1))}`);
  // ward trigger dojdzie do rozstrzygnięcia, gdy OBAJ gracze przepuszczą
  // priorytet — w teście silnikowym prowadzimy obie strony (bez sesji).
  const pay = () => {
    for (let i = 0; i < 12; i++) {
      const cmds = playerView(state, 'p2').legalCommands;
      const ward = cmds.filter((c) => c.type === 'resolve_ward_pay_choice');
      if (ward.some((c) => c.pay === true)) return true;
      const pass2 = cmds.find((c) => c.type === 'pass_priority');
      if (pass2) { execute(state, pass2); }
      const cmds1 = playerView(state, 'p1').legalCommands;
      const pass1 = cmds1.find((c) => c.type === 'pass_priority');
      if (pass1) { execute(state, pass1); }
    }
    return false;
  };
  assert.ok(pay(), 'wariant dopłaty ward dostępny (many starczyło)');
});
