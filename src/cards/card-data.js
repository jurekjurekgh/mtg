import { defineCard, createRegistry } from './registry.js';
import { ABILITY_TYPE, createAbility } from '../engine/abilities.js';

/**
 * Syntetyczny katalog testowy.
 *
 * To NIE są realne karty MtG. Zgodnie z ADR 0010 realne karty wejdą dopiero
 * z listy właściciela, każda poprzedzona pobraniem danych ze Scryfall. Do tego
 * czasu katalog celowo zawiera wyłącznie definicje testowe (oznaczone setem
 * SYNTH), które zasilają pełny przepływ danych: registry → walidacja talii →
 * materializacja obiektów gry → symulacja partii.
 *
 * Katalog obejmuje też statusy in-development/limited/unsupported, żeby
 * testy negatywne miały stałe punkty odniesienia.
 */

export const SYNTHETIC_SET = 'SYNTH';

export const SYNTHETIC_CARDS = Object.freeze([
  defineCard({
    id: 'syn-mountain', name: 'Synthetic Mountain', set: SYNTHETIC_SET, plan: 'Test Aggro',
    types: ['Basic', 'Land'], colors: ['R'],
    support: { status: 'supported' },
  }),
  defineCard({
    id: 'syn-forest', name: 'Synthetic Forest', set: SYNTHETIC_SET, plan: 'Test Growth',
    types: ['Basic', 'Land'], colors: ['G'],
    support: { status: 'supported' },
  }),
  defineCard({
    id: 'syn-razorback', name: 'Synthetic Razorback', set: SYNTHETIC_SET, plan: 'Test Aggro',
    types: ['Creature'], colors: ['R'], power: 2, toughness: 2, manaCost: 1,
    support: { status: 'supported' },
  }),
  defineCard({
    id: 'syn-pummeler', name: 'Synthetic Pummeler', set: SYNTHETIC_SET, plan: 'Test Aggro',
    types: ['Creature'], colors: ['R'], power: 3, toughness: 2, manaCost: 2,
    support: { status: 'supported' },
  }),
  defineCard({
    id: 'syn-woodcaller', name: 'Synthetic Woodcaller', set: SYNTHETIC_SET, plan: 'Test Growth',
    types: ['Creature'], colors: ['G'], power: 2, toughness: 3, manaCost: 2,
    support: { status: 'supported' },
  }),
  defineCard({
    id: 'syn-elder-tusker', name: 'Synthetic Elder Tusker', set: SYNTHETIC_SET, plan: 'Test Growth',
    types: ['Creature'], colors: ['G'], power: 4, toughness: 4, manaCost: 3,
    support: { status: 'supported' },
  }),
  defineCard({
    id: 'syn-shock', name: 'Synthetic Shock', set: SYNTHETIC_SET, plan: 'Test Aggro',
    types: ['Instant'], colors: ['R'], manaCost: 1,
    spell: { timing: 'instant', targets: [{ type: 'creature' }], effects: [{ type: 'damage', amount: 2 }] },
    support: { status: 'supported' },
  }),
  defineCard({
    id: 'syn-might', name: 'Synthetic Might', set: SYNTHETIC_SET, plan: 'Test Growth',
    types: ['Instant'], colors: ['G'], manaCost: 1,
    spell: { timing: 'instant', targets: [{ type: 'creature' }], effects: [{ type: 'pump', power: 2, toughness: 2 }] },
    support: { status: 'supported' },
  }),
  defineCard({
    id: 'syn-apprentice', name: 'Synthetic Apprentice', set: SYNTHETIC_SET, plan: 'Test Aggro',
    types: ['Creature'], colors: ['R'], power: 1, toughness: 1, manaCost: 1,
    support: { status: 'in-development', limitations: ['przykładowa karta bez zakończonej obsługi'] },
  }),
  defineCard({
    id: 'syn-colossus', name: 'Synthetic Colossus', set: SYNTHETIC_SET, plan: 'Test Growth',
    types: ['Creature'], colors: ['G'], power: 6, toughness: 6, manaCost: 5,
    support: { status: 'limited', limitations: ['dozwolona wyłącznie w scenariuszach testowych'] },
  }),
  defineCard({
    id: 'syn-mystery', name: 'Synthetic Mystery', set: SYNTHETIC_SET, plan: 'Test Growth',
    types: ['Instant'], colors: ['G'], manaCost: 1,
    support: { status: 'unsupported' },
  }),
  // Zdolność aktywowana: {T}: +1/+1 do końca tury (na sobie).
  defineCard({
    id: 'syn-warboar', name: 'Synthetic Warboar', set: SYNTHETIC_SET, plan: 'Test Growth',
    types: ['Creature'], colors: ['G'], power: 2, toughness: 2, manaCost: 2,
    abilities: [
      createAbility({
        type: ABILITY_TYPE.activated,
        cost: { tap: true },
        effect: { type: 'pump', power: 1, toughness: 1 },
      }),
    ],
    support: { status: 'supported' },
  }),
  // Czarny: stwórz 1/1 token Goblina.
  defineCard({
    id: 'syn-swarmsummon', name: 'Synthetic Swarmsummon', set: SYNTHETIC_SET, plan: 'Test Aggro',
    types: ['Sorcery'], colors: ['R'], manaCost: 2,
    spell: {
      timing: 'sorcery', targets: [],
      effects: [{ type: 'create_token', name: 'Goblin', cardId: 'token_goblin', power: 1, toughness: 1, colors: ['R'] }],
    },
    support: { status: 'supported' },
  }),
  // Definicja tokenu — nie jest taliowalna (limited), a służy renderowi i nazwie.
  defineCard({
    id: 'token_goblin', name: 'Synthetic Goblin', set: SYNTHETIC_SET, plan: 'Test Aggro',
    types: ['Creature', 'Token'], colors: ['R'], power: 1, toughness: 1, manaCost: 0,
    support: { status: 'limited', limitations: ['token — nie można umieścić w talii'] },
  }),
]);

/** Registry repozytorium — dziś wyłącznie katalog syntetyczny, realne karty dopią się tu. */
export function createCardRegistry() {
  return createRegistry(SYNTHETIC_CARDS);
}
