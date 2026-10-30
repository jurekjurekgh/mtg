// I (zgłoszenie właściciela 2026-10-29): „Bot bezsensownie poświęca tę
// kreaturę [Spellkeeper Weird]. Zdolności wymagające poświęcenia powinny być
// możliwe do zagrania przez bota tylko wtedy gdy dana kreatura już ginie — np.
// celuje w nie lethal damage albo destroy albo exile i wtedy można ją
// poświęcić. Także jeśli kreatura już blokuje i dostanie w blokowaniu lethal
// damage to można ją poświęcić. W innych wypadkach poświęcenie powinno mieć
// ujemny scoring.”
//
// Reguła jest generyczna (ADR 0002 — zero nazw/ID kart w kodzie): koszt
// `cost.sacrificeSelf` na STWORZE wycenia `sacrificeSelfCostLoss`
// (heuristic-bot.js). Stwór „już ginący w tej turze” (wspólny czytnik
// `permanentDoomedThisTurn`: bloker umierający w zadeklarowanej walce,
// śmiertelne obrażenia czaru/zdolności wroga na stosie, wrogie
// destroy/exile celujące w niego) → koszt 0; bez zagrożenia → wartość ciała
// (2p+t+MV), czyli wynik poniżej passa.
// Poświęcenie NIE-stworzenia (Skarb, Clue) oraz zdolność MANY (Spawn, Blood
// Pet, ramp) zachowują własne, dotychczasowe gałęzie wyceny — to zwykłe użycie
// zasobu, nie strata ciała; ich piny (58/A11–A17, zgloszenie-n Scion) zostają
// zielone bez zmian.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { createBattlefieldToken } from '../src/engine/tokens.js';

const REGISTRY = createCardRegistry();

function game() {
  const state = createGameState({ seed: 77, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  return state;
}

function put(state, cardId, zone, id, controllerId = 'p1', extra = {}) {
  const def = REGISTRY.get(cardId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types, keywords: def.keywords ?? [], subtypes: def.subtypes, ...extra,
  });
  return state.objects.get(id);
}

/** Stół: Spellkeeper Weird (1/4, MV 3) + Shock w grobie + 2 many. */
function weirdBoard() {
  const state = game();
  put(state, 'spellkeeper-weird', 'battlefield', 'weird');
  put(state, 'shock', 'graveyard', 'gy1');
  put(state, 'basic-forest', 'battlefield', 'land1');
  addMana(state, 'p1', 2, { colors: ['U'] });
  return state;
}

const sacrificeOffer = (state) => playerView(state, 'p1').legalCommands
  .find((c) => c.type === 'activate_ability' && c.objectId === 'weird');

function botChoice(state) {
  const bot = createHeuristicBot({ seed: 5 });
  return bot.chooseCommand(playerView(state, 'p1'));
}

const isSacrifice = (cmd) => cmd?.type === 'activate_ability' && cmd.objectId === 'weird';

test('I/1: brak zagrożenia — bot NIE poświęca stwora (aktywacja schodzi pod pass)', () => {
  const state = weirdBoard();
  const offer = sacrificeOffer(state);
  assert.ok(offer, 'oferta istnieje (zdolność jest legalna — to nie zmiana legalności)');
  const cmd = botChoice(state);
  assert.ok(!isSacrifice(cmd),
    `RED bez poprawki: bot oddawał 1/4 za instanta z grobu — wybrał ${JSON.stringify(cmd)}`);
  assert.equal(cmd.type, 'pass_priority', 'bez zagrożenia wygrywa pass');
});

test('I/2: wrogi destroy celujący w stwora na stosie — poświęcenie dozwolone', () => {
  const state = weirdBoard();
  put(state, 'expunge', 'hand', 'exp', 'p2');
  addMana(state, 'p2', 3, { colors: ['B'] });
  state.turn.priorityPlayerId = 'p2';
  const cast = execute(state, { type: 'cast_spell', playerId: 'p2', objectId: 'exp', targets: ['weird'] });
  assert.ok(cast.ok, `Expunge rzucony: ${JSON.stringify(cast.events?.[0] ?? {})}`);
  state.turn.priorityPlayerId = 'p1';
  const cmd = botChoice(state);
  assert.ok(isSacrifice(cmd), `stwór i tak zginie — poświęcenie ma sens, było ${JSON.stringify(cmd)}`);
  assert.deepEqual(cmd.targets, ['gy1'], 'aktywacja celuje w kartę z grobu');
});

test('I/3: NIEśmiertelne obrażenia na stosie — to jeszcze nie „ginie”, pass', () => {
  const state = weirdBoard();
  put(state, 'shock', 'hand', 'shk', 'p2');
  addMana(state, 'p2', 1, { colors: ['R'] });
  state.turn.priorityPlayerId = 'p2';
  const cast = execute(state, { type: 'cast_spell', playerId: 'p2', objectId: 'shk', targets: ['weird'] });
  assert.ok(cast.ok, 'Shock rzucony');
  state.turn.priorityPlayerId = 'p1';
  const cmd = botChoice(state);
  assert.ok(!isSacrifice(cmd),
    `2 obrażenia przy toughness 4 nie zabijają — wybrano ${JSON.stringify(cmd)}`);
});

test('I/4: śmiertelne obrażenia na stosie — poświęcenie dozwolone', () => {
  const state = weirdBoard();
  put(state, 'fiery-fall', 'hand', 'ff', 'p2');
  addMana(state, 'p2', 6, { colors: ['R'] });
  state.turn.priorityPlayerId = 'p2';
  const cast = execute(state, { type: 'cast_spell', playerId: 'p2', objectId: 'ff', targets: ['weird'] });
  assert.ok(cast.ok, 'Fiery Fall rzucony');
  state.turn.priorityPlayerId = 'p1';
  const cmd = botChoice(state);
  assert.ok(isSacrifice(cmd), `5 obrażeń przy toughness 4 zabija — wybrano ${JSON.stringify(cmd)}`);
});

test('I/5: bloker ginący w zadeklarowanej walce — poświęcenie dozwolone', () => {
  const state = weirdBoard();
  put(state, 'gorger-wurm', 'battlefield', 'wurm', 'p2');
  state.turn.phase = 'combat';
  state.turn.step = 'declare_blockers';
  state.combat = {
    attackers: ['wurm'], attackingPlayerId: 'p2', defendingPlayerId: 'p1',
    blockers: new Map([['wurm', ['weird']]]),
    blockedAttackers: ['wurm'], unblockedAttackers: [], damageAssigned: false,
  };
  const cmd = botChoice(state);
  assert.ok(isSacrifice(cmd), `blok + lethal: stwór ginie w walce — wybrano ${JSON.stringify(cmd)}`);
});

test('I/6: guard — TA SAMA zdolność na NIE-stworzeniu nie dostaje nowej kary', () => {
  // Lustro I/1: token-artefakt z identycznym kosztem (2 many + poświęcenie
  // siebie) i tym samym efektem. Poświęcenie Skarbu/Clue to zwykłe użycie
  // zasobu, nie strata ciała — reguła właściciela dotyczy KREATURY.
  const state = game();
  put(state, 'shock', 'graveyard', 'gy1');
  const relic = createBattlefieldToken(state, 'p1', {
    cardId: 'token_probe_relic', name: 'Probe Relic', kind: 'artifact',
    // Cena many > 0: bez tego „wartość ciała” artefaktu wynosi 0 i mutacja
    // „kara dla każdego permanentu” przeszłaby niezauważona.
    manaCost: 6,
    types: ['Artifact', 'Token'], subtypes: [], colors: [], keywords: [],
    abilities: [Object.freeze({
      type: 'activated', timing: 'instant', keyword: null,
      cost: Object.freeze({ mana: 2, sacrificeSelf: true }),
      effect: Object.freeze({ type: 'return_card_from_graveyard_to_hand' }),
      trigger: null, targets: null, cycling: null, condition: null, pump: null,
      keywords: null, oncePerTurn: false, mustAttack: false,
    })],
  });
  addMana(state, 'p1', 2, { colors: [] });
  const cmd = botChoice(state);
  assert.equal(cmd?.type, 'activate_ability', `artefakt: aktywacja nadal opłacalna — było ${JSON.stringify(cmd)}`);
  assert.equal(cmd.objectId, relic.id);
});
