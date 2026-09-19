// E4 sesji 2026-09-19 (pętla jakości, ADR 0021 pkt 4a) — punkt otwarty
// z poprzednich sesji: „kierunek odwrotny oferty bloków (Math.min(slots, 2))”.
//
// Defekt (odwrotny kierunek, L48): `legalBlockerOptions` w gałęzi pełnej
// enumeracji przetwarzał blokera z dodatkowymi slotami tylko DWA razy
// (`Math.min(slots, 2)`), więc bloker o 3 slotach (Highland Game z licznikiem
// +1/+1 + 2× Cenn's Tactician) nigdy nie dostawał w ofercie potrójnego bloku —
// choć `declareBlockers` (i `blockAssignmentViolation`) taki blok przyjmują.
// Oferta była więc NIEKOMPLETNA: człowiek (panel bloków) i bot nie mogli
// zadeklarować legalnego ruchu, mimo że silnik by go przyjął.
//
// Naprawa: liczba przebiegów = min(prawdziwe sloty, liczba atakujących)
// (bloker nie zablokuje więcej atakujących, niż ich jest).
//
// Piny pilnują OBU kierunków spójności (L41 — jedno źródło prawdy):
//   • kompletność: legalny potrójny blok JEST w ofercie (przed naprawą: brak),
//   • dźwięczność: KAŻDA opcja z oferty przechodzi przez `declareBlockers`,
//   • anty-over-fix: bloker o 1 slocie nadal nie dostaje podwójnego bloku.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addCounter } from '../src/engine/counters.js';
import { replaceObject } from '../src/engine/permanents.js';
import { legalBlockerOptions, blockSlotsFor, COMBAT_OPTION_CAP } from '../src/engine/combat.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId, zone = 'battlefield', patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], ...patch,
  });
  return state.objects.get(id);
}

/**
 * Scena: p2 atakuje trzema Goblin Pikerami; p1 ma blokera o `slots` slotach.
 * Highland Game (reach: drzewo) + Cenn's Tactician (statyka: stwór
 * z licznikiem +1/+1 blokuje dodatkowego stwora) — obaj taktycy ZATAPNIĘCI,
 * więc jedynym blokerem w ofercie jest bloker z licznikiem.
 */
function scena({ atakujacych = 3, licznik = true, taktycy = 2 } = {}) {
  const state = createGameState({ seed: 9, players: [{ id: 'p1' }, { id: 'p2' }] });
  const attackers = [];
  for (let i = 0; i < atakujacych; i += 1) {
    attackers.push(`a${i + 1}`);
    put(state, `a${i + 1}`, 'goblin-piker', 'p2');
  }
  put(state, 'b1', 'highland-game', 'p1');
  for (let i = 0; i < taktycy; i += 1) {
    // `tapped` jest poza kontraktem `addObject` (L21) — zatapiamy przez
    // `replaceObject`, żeby taktycy nie byli kandydatami do blokowania.
    put(state, `tac${i + 1}`, 'cenns-tactician', 'p1');
    replaceObject(state, state.objects.get(`tac${i + 1}`), { tapped: true });
  }
  if (licznik) addCounter(state, 'b1', '+1/+1', 1);
  state.turn.phase = 'combat';
  state.turn.step = 'declare_blockers';
  state.combat = { attackingPlayerId: 'p2', defendingPlayerId: 'p1', attackers, blockers: new Map() };
  return state;
}

const opcjeZ = (options, blockerId) => options.filter((o) =>
  Object.values(o).flat().filter((id) => id === blockerId).length >= 2);

test('E4/1: bloker o 3 slotach — oferta zawiera potrójny blok i silnik go przyjmuje', () => {
  const state = scena();
  assert.equal(blockSlotsFor(state, state.objects.get('b1')), 3, '1 + 2× statyka Cenn\'s Tactician');
  const options = legalBlockerOptions(state, 'p1');
  const potrojny = { a1: ['b1'], a2: ['b1'], a3: ['b1'] };
  assert.ok(options.some((o) => JSON.stringify(o) === JSON.stringify(potrojny)),
    `legalny potrójny blok musi być w ofercie (L48): ${JSON.stringify(options)}`);
  const r = execute(state, { type: 'declare_blockers', playerId: 'p1', assignments: potrojny });
  assert.ok(r.ok, `silnik przyjmuje to samo przypisanie co oferta: ${JSON.stringify(r.events)}`);
});

test('E4/2 (dźwięczność): każda opcja oferty przechodzi przez declareBlockers', () => {
  const wzorcowa = scena();
  const options = legalBlockerOptions(wzorcowa, 'p1');
  assert.ok(options.length > 0);
  for (const assignment of options) {
    const swiezy = scena();
    const r = execute(swiezy, { type: 'declare_blockers', playerId: 'p1', assignments: assignment });
    assert.ok(r.ok, `oferta proponuje coś, co walidacja odrzuca: ${JSON.stringify(assignment)}`);
  }
});

test('E4/3 (anty-over-fix): bloker o 1 slocie nadal bez podwójnego bloku', () => {
  const state = scena({ licznik: false });
  assert.equal(blockSlotsFor(state, state.objects.get('b1')), 1, 'bez licznika brak dodatkowych slotów');
  const options = legalBlockerOptions(state, 'p1');
  assert.equal(opcjeZ(options, 'b1').length, 0,
    `bez dodatkowych slotów podwójny blok nie może być oferowany: ${JSON.stringify(options)}`);
  const r = execute(scena({ licznik: false }), {
    type: 'declare_blockers', playerId: 'p1', assignments: { a1: ['b1'], a2: ['b1'] },
  });
  assert.equal(r.ok, false, 'silnik odrzuca podwójne użycie blokera o 1 slocie');
});

test('E4/4: oferta nadal mieści się w capie i nie ma duplikatów przypisań', () => {
  const state = scena();
  const options = legalBlockerOptions(state, 'p1');
  assert.ok(options.length <= COMBAT_OPTION_CAP,
    `rozrost przebiegów nie może wysadzić limitu oferty (jest ${options.length})`);
  // To samo przypisanie powstawało wieloma ścieżkami enumeracji (kolejność
  // atakujących, powtórzone przebiegi) — oferta ma mieć JEDEN wpis na
  // przypisanie, inaczej „liczba opcji” rośnie ponad cap.
  const klucz = (o) => Object.keys(o).sort().map((a) => `${a}=${o[a].join(',')}`).join('|');
  const klucze = options.map(klucz);
  assert.equal(new Set(klucze).size, klucze.length,
    `zduplikowane przypisania w ofercie: ${JSON.stringify(klucze)}`);
});
