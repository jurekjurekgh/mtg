import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { createGameState, playerView, addObject } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';

/**
 * M258/A1 (audyt PR #88) — piny SYMETRYCZNEJ gałęzi `cant_be_blocked`
 * (r5b/D „Symetrycznie…" — celowany „can't be blocked" na własnym stworze,
 * np. Enter the Enigma). Gałąź dostała pełną logikę okna ataku
 * (attackingWindow + canAttack + blokerzy + lethal), ale ŻADEN test jej nie
 * pilnował: mutacja M9 (okno zawsze otwarte) przechodziła CAŁY szybki rdzeń
 * 3801/3801 (L61: „zielony" nie znaczy „pilnuje"). Istniejący pin z
 * 2026-08-16 (bot-owner-reports B) testuje wyłącznie OKNO OTWARTE.
 *
 * Piny: (1) main2 — okno zamknięte, NIE rzuca; (2) main1, stwór tapnięty —
 * atak niemożliwy, NIE rzuca; (3) main1, stwór gotowy — OKNO OTWARTE,
 * rzuca (kontrola pozytywna, żeby piny (1)/(2) nie były zielone przez
 * „nic się nie dzieje" — klasa M255/G2).
 *
 * Weryfikacja mutacyjna (L61): cofnięcie okna (M9: attackingWindow = true,
 * canAttack = true) czyni (1) i (2) CZERWONYMI.
 */

function setup({ step = 'main1', myTapped = false, enemyBlockers = 1 }) {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  // Enter the Enigma w ręce ({U}, instant: cel nie może być blokowany + dobierz).
  addObject(state, {
    id: 'h0', instanceId: 'i-h0', cardId: 'enter-the-enigma', controllerId: 'p2',
    ownerId: 'p2', zone: 'hand', kind: 'spell', manaCost: 1,
    spell: {
      timing: 'instant', targets: [{ type: 'creature' }],
      effects: [{ type: 'cant_be_blocked' }, { type: 'draw_cards', amount: 1 }],
    },
    abilities: [], keywords: [], subtypes: [], types: ['Instant'], colors: ['U'],
  });
  // Własny stwór bota 3/3 (gotowy do ataku, chyba że tapnięty).
  addObject(state, {
    id: 'mine', instanceId: 'i-mine', cardId: 'x-test', controllerId: 'p2',
    ownerId: 'p2', zone: 'battlefield', kind: 'creature', power: 3, toughness: 3,
    manaCost: 0, abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: ['U'],
  });
  state.objects.set('mine', Object.freeze({
    ...state.objects.get('mine'), tapped: myTapped, summoningSickness: false,
  }));
  // Blokerzy przeciwnika (2/2) — bez nich ewazja niczego nie odblokowuje,
  // a pin „rzucania" musiałby liczyć na samą wartość doboru karty.
  for (let i = 0; i < enemyBlockers; i += 1) {
    const id = `foe-${i}`;
    addObject(state, {
      id, instanceId: `i-${id}`, cardId: 'x-test', controllerId: 'p1', ownerId: 'p1',
      zone: 'battlefield', kind: 'creature', power: 2, toughness: 2,
      manaCost: 0, abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: ['R'],
    });
    state.objects.set(id, Object.freeze({
      ...state.objects.get(id), tapped: false, summoningSickness: false,
    }));
  }
  addMana(state, 'p2', 2, { colors: ['U', 'U'] });
  return state;
}

function botCasts(state) {
  const view = playerView(state, 'p2');
  const choice = createHeuristicBot({ seed: 7 }).chooseCommand(view, {});
  return choice.type === 'cast_spell' && choice.objectId === 'h0';
}

test('A1a: main2 (po combacie) — ewazja „this turn" nic nie zmieni, bot NIE rzuca', () => {
  assert.equal(botCasts(setup({ step: 'main2' })), false,
    'cant_be_blocked w main2 to czyste marnotrawstwo (okno zamknięte, symetrycznie do D2d Ruthless Invasion)');
});

test('A1b: main1, stwór TAPNIĘTY (atak niemożliwy) — bot NIE rzuca', () => {
  assert.equal(botCasts(setup({ myTapped: true })), false,
    'ewazja stwora, który nie zaatakuje, to czyste marnotrawstwo (symetrycznie do D2c Ruthless Invasion)');
});

test('A1c (kontrola pozytywna): main1, stwór gotowy, bloker 2/2 — bot RZUCA', () => {
  assert.equal(botCasts(setup({ step: 'main1', myTapped: false, enemyBlockers: 1 })), true,
    'w otwartym oknie ewazja + dobranie na gotowym stworu to dobry ruch (anty-overfix dla A1a/A1b)');
});
