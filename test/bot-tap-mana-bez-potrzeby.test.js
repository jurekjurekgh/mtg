// E6/A1 planu 2026-09-07 (zgłoszenie właściciela, Moonscarred Werewolf
// „{T}: Add {G}{G}"): bot przemienił wilkołaka w upkeepie GRACZA i natychmiast
// go tapnął dla many — mana wyparowała na końcu kroku (CR 500.4), a źródło
// zostało zatapiane i nie zablokowało ataku („ten pierwszy tap był bez sensu").
//
// Root cause: wycena add_mana (M128 `unlocksSomething`) liczyła kandydatów
// po generycznym koszcie liczbowym RĘKI bez TIMINGU rzucania: sorcery albo
// stwór w ręce nie jest rzutowalny w upkeepie przeciwnika (CR 307.1/117.1a),
// więc „odblokowanie" było złudzeniem — +8 za nic, tap wygrywał z passem.
//
// Fix = jedna reguła timingowa (ADR 0002, deskryptory kind/types, L28):
// kandydatem odblokowania many jest karta RZUTOWALNA W TYM KROKU — instant
// zawsze (CR 307.5 z priorytetem), pozostałe wyłącznie we WŁASNEJ głównej
// fazie. Manę na odpowiedź „na zapas" świadomie pomijamy (L119: bez wag
// „na wszelki wypadek").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const ŻRÓDŁO = {
  id: 'bf-src', cardId: 'x-mana-source', kind: 'creature', controllerId: 'p1',
  tapped: false, power: 2, toughness: 2,
  activatableAbilities: [{ cost: { tap: true }, effect: { type: 'add_mana', amount: 2, colors: ['G'] } }],
};
const LĄD = (i) => ({ id: `l${i}`, cardId: 'x-land', kind: 'land', controllerId: 'p1', tapped: false });
const KARTA = (id, kind, koszt = 4) => ({ id, cardId: `x-${id}`, kind, manaCost: koszt, power: 2, toughness: 2 });

const WIDOK = (hand, turn) => ({
  playerId: 'p1',
  turn: { number: 3, step: turn.step, activePlayerId: turn.activePlayerId, priorityPlayerId: 'p1' },
  players: [{ id: 'p1', life: 20, mana: 0 }, { id: 'p2', life: 20, mana: 0 }],
  zones: {
    hand, battlefield: [LĄD(1), LĄD(2), ŻRÓDŁO],
    library: [{ id: 'lib' }], graveyard: [], exile: [], stack: [],
  },
  legalCommands: [
    { type: 'activate_ability', playerId: 'p1', objectId: 'bf-src', abilityIndex: 0 },
    { type: 'pass_priority', playerId: 'p1' },
  ],
});

const wybór = (hand, turn) => createHeuristicBot({ seed: 9 }).chooseCommand(WIDOK(hand, turn), {});
const OBCE_UPKEEP = { step: 'upkeep', activePlayerId: 'p2' };
const MOJA_GŁÓWNA = { step: 'main', activePlayerId: 'p1' };

test('E6/A1: upkeep przeciwnika + sorcery w ręce — tap many nie wygrywa z passem', () => {
  // Scenariusz właściciela: sorcery/stwora nie da się rzucić w cudzym
  // upkeepie, mana wyparuje na końcu kroku (CR 500.4) — tap = zatapiane
  // źródło bez żadnego zysku (nie zablokuje też ataku).
  const chosen = wybór([KARTA('h-sorc', 'sorcery')], OBCE_UPKEEP);
  assert.equal(chosen.type, 'pass_priority',
    `bot wybrał ${chosen.type} — tap many pod kartę nielegalną w tym kroku to marnotrawstwo`);
});

test('E6/A1: upkeep przeciwnika + instant w ręce — tap ODBLOKOWUJE i zostaje', () => {
  // Instant rzucisz w każdym kroku mając priorytet (CR 307.5) — tu tap ma sens.
  const chosen = wybór([KARTA('h-inst', 'instant')], OBCE_UPKEEP);
  assert.equal(chosen.type, 'activate_ability',
    'instant w ręce jest legalnym odblokowaniem — anty-over-fix');
});

test('E6/A1: własna Główna + stwór w ręce — tap ODBLOKOWUJE rzut i zostaje', () => {
  // Pin dobrego zachowania sprzed naprawy: timing sorcery-speed spełniony
  // (własna główna), koszt 4 poza zasięgiem 2 lądów, w zasięgu po {G}{G}.
  const chosen = wybór([KARTA('h-stw', 'creature')], MOJA_GŁÓWNA);
  assert.equal(chosen.type, 'activate_ability',
    'tap, który realnie odblokowuje rzut we własnej głównej, ma zostać wybrany');
});

test('E6/A1: pusta ręka we własnej głównej — tap na zapas nie wygrywa (pin M167/D)', () => {
  const chosen = wybór([], MOJA_GŁÓWNA);
  assert.equal(chosen.type, 'pass_priority',
    `bot wybrał ${chosen.type} — bez niczego do zagrania tap czystej zdolności many to strata`);
});

test('E6/A1: własna Główna + koszt poza zasięgiem nawet po tapnięciu — pass', () => {
  // 2 lądy + 2 z tapu = 4 < 9: bramka liczbowa M128 pozostaje — timing nie
  // zastępuje testu „czy w ogóle dosięgam progu opłacalności".
  const chosen = wybór([KARTA('h9', 'creature', 9)], MOJA_GŁÓWNA);
  assert.equal(chosen.type, 'pass_priority',
    `bot wybrał ${chosen.type} — mana poza zasięgiem rzutu to czysta strata`);
});
