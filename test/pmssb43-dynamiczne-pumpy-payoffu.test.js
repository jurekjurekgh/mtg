// PMSSB-43 (2026-10-03d) — piny luk komentarza „dynamiczne X poza modelem" w
// temporaryPumpPayoff / pumpDelta. Deskryptory dynamiczne (`card_types_in_all_graveyards`,
// `source_power`, `oil_counters`) w pompie do końca tury muszą być rozwiązywane
// z widoku (ADR 0017), tak samo jak silnik liczy je w permanents/effects (L41/L28).
//
// Mutacje docelowe (czerwienieją po cofnięciu):
//  m1: usunięcie resolvera `card_types_in_all_graveyards` w pumpDelta
//  m2: usunięcie resolvera `source_power`
//  m3: usunięcie resolvera `oil_counters`
//  m4: usunięcie `buff_attacking_creatures` z PAYOFF_TEMP_PUMP_EFFECTS (pin że należy do rodziny)
//  m5: temporaryPumpOf bez obsługi nie-liczb (gdy power jest string, zwraca 0 zamiast NaN)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { temporaryPumpOf } from '../src/controllers/heuristic-bot.js';

function viewWithGrave(types) {
  return { zones: { graveyard: types.map((t, i) => ({ id: `g${i}`, types: [t] })), battlefield: [] } };
}

describe('PMSSB-43/A: pumpDelta rozwiązuje dynamiczne deskryptory pomp z widoku', () => {
  it('A1 card_types_in_all_graveyards liczy unikalne typy kart we wszystkich grobach', () => {
    const view = viewWithGrave(['Creature', 'Instant', 'Land', 'Creature']); // 3 unikalne
    const pump = temporaryPumpOf({ type: 'buff_creature_until_end_of_turn', power: 'card_types_in_all_graveyards', toughness: 'card_types_in_all_graveyards' }, view);
    assert.deepEqual(pump, { power: 3, toughness: 3 }, 'Altar of the Goyf: X = liczba typów kart w grobach (podobnie jak silnik)');
  });

  it('A2 card_types_in_all_graveyards ignoruje tokeny (name ustawione = nie jest kartą)', () => {
    const view = { zones: { graveyard: [{ id: 't', name: 'Soldier', types: ['Creature'] }], battlefield: [] } };
    const pump = temporaryPumpOf({ type: 'buff_creature_until_end_of_turn', power: 'card_types_in_all_graveyards', toughness: 0 }, view);
    assert.equal(pump.power, 0, 'tokeny (name ustawione) nie są kartami i się nie liczą');
  });

  it('A3 source_power bierze moc z hosta/source', () => {
    const view = { zones: { graveyard: [], battlefield: [] } };
    const source = { id: 's', power: 5, toughness: 3 };
    const pump = temporaryPumpOf({ type: 'buff_creature_until_end_of_turn', power: 'source_power', toughness: 'source_power' }, view, source);
    assert.deepEqual(pump, { power: 5, toughness: 5 });
  });

  it('A4 oil_counters liczy liczniki oil z hosta', () => {
    const view = { zones: { graveyard: [], battlefield: [] } };
    const source = { id: 's', power: 1, toughness: 1, counters: { oil: 3 } };
    const pump = temporaryPumpOf({ type: 'buff_creature_until_end_of_turn', power: 'oil_counters', toughness: 'oil_counters' }, view, source);
    assert.deepEqual(pump, { power: 3, toughness: 3 });
  });

  it('A5 nie-liczbowy deskryptor bez resolvera nie rzuca i zwraca 0 (miękka degradacja)', () => {
    const view = { zones: { graveyard: [], battlefield: [] } };
    const pump = temporaryPumpOf({ type: 'buff_creature_until_end_of_turn', power: 'nieznany_deskryptor', toughness: 0 }, view);
    assert.equal(pump.power, 0);
  });

  it('A6 buff_attacking_creatures należy do TEMPORARY_PUMP_EFFECTS (kształt rozpoznawany)', () => {
    const view = { zones: { graveyard: [], battlefield: [] } };
    const pump = temporaryPumpOf({ type: 'buff_attacking_creatures', power: 1, toughness: 0 }, view);
    assert.deepEqual(pump, { power: 1, toughness: 0 }, 'buff_attacking_creatures jest pumpem do końca tury (kształt zarejestrowany)');
  });

  it('A7 puste groby → 0 (Altar bez kart w grobach daje +0/+0, payoff wyjdzie 0)', () => {
    const view = { zones: { graveyard: [], battlefield: [] } };
    const pump = temporaryPumpOf({ type: 'buff_creature_until_end_of_turn', power: 'card_types_in_all_graveyards', toughness: 'card_types_in_all_graveyards' }, view);
    assert.deepEqual(pump, { power: 0, toughness: 0 });
  });
});
