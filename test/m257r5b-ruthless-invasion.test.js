// M257 r5b/D (uwaga z testów, właściciel): Ruthless Invasion {3}{R/P}.
//
// „Można go zapłacić życiem zamiast R. Bot robi dwa błędy na raz:
//  D1. Ma czerwoną manę (akurat zatapniętą, ale w przyszłej turze będzie
//      ją miał odtapowaną) i koniecznie chce rzucić ten czar więc płaci
//      życiem. Ja bym w ogóle nie pozwolił mi płacić życiem, chyba, że
//      naprawdę policzy, że jego atak zabije przeciwnika w tej turze
//      dzięki temu zakazowi blokowania.
//  D2. Bot rzuca Ruthless Invasion po czym kończy turę bez ataku. No to
//      już jest kompletny bezsens. Skoro nie zamierza atakować to ten
//      czar to czyste marnotrawstwo.”
//
// Root causes (docs/plans/PLAN_2026-08-30-m257r5b-uwagi-testow.md):
// - czysto-utylitarny czar startował od bazy 50 (spellBase) — wartość
//   efektu (do +40) tylko ją podbijała, więc bot rzucał wariant życiowy
//   niezależnie od tego, czy atak cokolwiek zrobi;
// - efekt `creatures_cant_block_this_turn` nie sprawdzał, czy bot W OGÓLE
//   może zaatakować w tej turze (okno + gotowi atakujący).
// Fix: baza −1 (czysto-utylitarny, wzorzec M146) + wycena warunkowa:
// okno (moja tura, main1/beginning_of_combat przed walką) + gotowi
// atakujący (nietapnięci, bez choroby/haste, power>0) + blokerzy, których
// czar realnie usuwa (non-artifact, nietapnięci) + premia LETHAL (D1).
// Symetrycznie: celowany `cant_be_blocked` na własnym stworze (Enter the
// Enigma) — ta sama reguła dla konkretnego celu.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

/**
 * Tura bota (p2) w `step`: Ruthless Invasion w ręce, stwór bota
 * `myPower/myToughness` na polu (opcjonalnie tapnięty/chorowity), plansza
 * wroga `enemyCreatures` ([{power, toughness, artifact}]), pula many
 * `pool` (np. { '': 4 } = 4 generyczne; { '': 3, R: 1 } = z czerwienią).
 */
function setup({
  step = 'main1', myPower = 3, myToughness = 3, myTapped = false, mySick = false,
  enemyCreatures = [], pool = { '': 4, R: 1 }, enemyLife = 20,
}) {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  state.players.find((p) => p.id === 'p1').life = enemyLife;
  // Czar w ręce.
  const registry = null; // niepotrzebne — cardId wprost (efekt globalny, bez deskryptora)
  void registry;
  addObject(state, {
    id: 'h0', instanceId: 'i-h0', cardId: 'ruthless-invasion', controllerId: 'p2',
    ownerId: 'p2', zone: 'hand', kind: 'spell', manaCost: 3, phyrexianManaCost: 1,
    spell: {
      timing: 'sorcery', targets: [],
      effects: [{ type: 'creatures_cant_block_this_turn', exceptTypes: ['Artifact'] }],
    },
    abilities: [], keywords: [], subtypes: [], types: ['Sorcery'], colors: ['R'],
  });
  // Stwór bota.
  addObject(state, {
    id: 'mine', instanceId: 'i-mine', cardId: 'x-test', controllerId: 'p2',
    ownerId: 'p2', zone: 'battlefield', kind: 'creature', power: myPower, toughness: myToughness,
    manaCost: 0, abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: ['R'],
    tapped: myTapped,
  });
  state.objects.set('mine', Object.freeze({ ...state.objects.get('mine'), tapped: myTapped, summoningSickness: mySick }));
  // Stwory wroga.
  enemyCreatures.forEach((c, i) => {
    const id = `foe-${i}`;
    addObject(state, {
      id, instanceId: `i-${id}`, cardId: 'x-test', controllerId: 'p1', ownerId: 'p1',
      zone: 'battlefield', kind: 'creature', power: c.power, toughness: c.toughness,
      manaCost: 0, abilities: [], keywords: [], subtypes: [],
      types: c.artifact ? ['Artifact', 'Creature'] : ['Creature'], colors: ['R'],
    });
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  });
  // Pula many: addMana(state, 'p2', n, { colors }) — kolory per many.
  const total = Object.values(pool).reduce((a, b) => a + b, 0);
  if (total > 0) {
    const colors = Object.entries(pool).flatMap(([color, n]) => Array(n).fill(color));
    addMana(state, 'p2', total, { colors });
  }
  return state;
}

/** Wybór bota dla widoku p2 (heurystyka, seed stały = determinizm). */
function botChoice(state) {
  const view = playerView(state, 'p2');
  const choice = createHeuristicBot({ seed: 7 }).chooseCommand(view, {});
  const casts = view.legalCommands.filter((c) => c.type === 'cast_spell' && c.objectId === 'h0');
  return { choice, casts };
}

// --- D2a: realna wartość — 3/3 + wrogie 2/2 (nie-artefakt) → RZUCA --------

test('D2a: 3/3 + wrogie 2/2 nietapnięte, main1 — bot RZUCA (atak przepuści dzięki zakazowi)', () => {
  const { choice, casts } = botChoice(setup({ enemyCreatures: [{ power: 2, toughness: 2 }] }));
  assert.ok(casts.length > 0, 'czar jest w ofercie (mana {3}{R} dostępna)');
  assert.equal(choice.type, 'cast_spell', `bot rzuca Ruthless: ${JSON.stringify(choice)}`);
  assert.equal(choice.objectId, 'h0');
});

// --- D2b: artifact-bloker zostaje — chump i tak → NIE RZUCA (RED dziś) ----
// Ruthless: „NONARTIFACT creatures can't block” — artifact-creature 5/5
// blokuje mimo zakazu. 3/3 chumpuje w 5/5 (0 obrażeń, ginie) — czar
// nie zmienia wyniku ataku = czyste marnotrawstwo.

test('D2b: 3/3 + wrogie 5/5 ARTIFAKT nietapnięte, main1 — bot NIE RZUCA (atak i tak chumpuje)', () => {
  const { choice } = botChoice(setup({ enemyCreatures: [{ power: 5, toughness: 5, artifact: true }] }));
  assert.notEqual(choice.type === 'cast_spell' && choice.objectId === 'h0', true,
    `czar bez sensu (artifact blokuje mimo zakazu; atak chumpuje): ${JSON.stringify(choice)}`);
});

// --- D2c: bez gotowego atakującego → NIE RZUCA (D2: „skoro nie zamierza atakować”)

test('D2c: 3/3 TAPNĘTY (atak niemożliwy), main1 — bot NIE RZUCA', () => {
  const { choice } = botChoice(setup({ myTapped: true, enemyCreatures: [{ power: 2, toughness: 2 }] }));
  assert.notEqual(choice.type === 'cast_spell' && choice.objectId === 'h0', true,
    `bez ataku czar to marnotrawstwo: ${JSON.stringify(choice)}`);
});

test('D2d: okno zamknięte — main2 (po combacie) — bot NIE RZUCA', () => {
  const { choice, casts } = botChoice(setup({ step: 'main2', enemyCreatures: [{ power: 2, toughness: 2 }] }));
  if (casts.length > 0) {
    assert.notEqual(choice.type === 'cast_spell' && choice.objectId === 'h0', true,
      `main2 po combacie — efekt „this turn” już nic nie zmieni: ${JSON.stringify(choice)}`);
  }
});

// --- D1a: LETHAL w tej turze → płaci życiem (jedyny uzasadniony powód) -----
// Bez czerwieni engine oferuje TYLKO wariant życiowy (CR 118.9). 4/4
// nietapnięte + wrogi 5/5 (który bez czaru zablokowałby 4/4 na chumpa)
// + wróg przy 4 życiu: atak przepuszczony dzięki zakazowi = LETHAL.

test('D1a: bez czerwieni, 4/4 + wrogi 5/5 bloker, wróg przy 4 życiu — bot RZUCA wariantem ŻYCIOWYM (lethal)', () => {
  const { choice, casts } = botChoice(setup({
    myPower: 4, myToughness: 4, enemyCreatures: [{ power: 5, toughness: 5 }],
    pool: { '': 3 }, enemyLife: 4,
  }));
  assert.ok(casts.length > 0, 'wariant życiowy w ofercie');
  assert.equal(casts.map((c) => c.phyrexianPayWithLife ?? 0).join(','), '1', 'bez czerwieni tylko k=1');
  assert.equal(choice.type, 'cast_spell', `lethal uzasadnia życiowe: ${JSON.stringify(choice)}`);
  assert.equal(choice.objectId, 'h0');
  assert.equal(choice.phyrexianPayWithLife, 1, 'wariant opłacony 2 życiami');
});

// --- D1b: bez lethalu płacić życiem = „życie za nic” → NIE RZUCA ----------

test('D1b: bez czerwieni, 4/4, otwarte pole, wróg przy 12 życiu — bot NIE RZUCA (życie za nic)', () => {
  const { choice } = botChoice(setup({
    myPower: 4, myToughness: 4, enemyCreatures: [], pool: { '': 3 }, enemyLife: 12,
  }));
  assert.notEqual(choice.type === 'cast_spell' && choice.objectId === 'h0', true,
    `atak i tak przechodzi (otwarte pole) — 2 życia za nic: ${JSON.stringify(choice)}`);
});

// --- D1c (anty-overfix): gdy jest czerwień, bot woli wariant MANOWY -------

test('D1c (anty-overfix): z czerwienią bot bierze wariant manowy (k=0), nie życiowy', () => {
  const { choice, casts } = botChoice(setup({
    myPower: 4, myToughness: 4, enemyCreatures: [{ power: 5, toughness: 5 }],
    pool: { '': 3, R: 1 }, enemyLife: 4,
  }));
  assert.deepEqual(casts.map((c) => c.phyrexianPayWithLife ?? 0), [0, 1], 'oba warianty w ofercie');
  assert.equal(choice.type, 'cast_spell', `lethal — bot rzuca: ${JSON.stringify(choice)}`);
  assert.equal(choice.phyrexianPayWithLife ?? 0, 0, 'wariant manowy (najtańszy) wygrywa');
});
