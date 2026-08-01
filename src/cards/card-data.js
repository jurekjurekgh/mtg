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

/**
 * Pierwszy batch realnych kart (ADR 0010, decyzja właściciela 2026-08-01):
 * Highland Game (KTK), Kappa Tech-Wrecker (NEO), Segmented Krotiq (DTK).
 * Dane pobrane ze Scryfall przed kodowaniem (odfiltrowane JSON-y w docs/cards/),
 * a Oracle text zapisany dosłownie poniżej. Koszt many jest uproszczony do
 * liczby całkowitej (pula many jest bezbarwna) — {1}{G} = 2, {5}{G} = 6.
 * Świadome ograniczenia wsparcia każdej karty są opisane w ENGINE_MILESTONES.md.
 */
export const REAL_CARDS = Object.freeze([
  defineCard({
    id: 'highland-game', name: 'Highland Game', set: 'KTK',
    types: ['Creature'], colors: ['G'], power: 2, toughness: 1, manaCost: 2,
    oracleText: 'When this creature dies, you gain 2 life.',
    imageUri: 'https://cards.scryfall.io/large/front/7/f/7fbb10a9-486a-4b9a-b3f5-c17f661af2b2.jpg?1783939067',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'dies' },
        effect: [{ type: 'gain_life', amount: 2 }],
      }),
    ],
    support: { status: 'supported', limitations: ['trigger dies rozstrzyga się od razu, bez okna priorytetu'] },
  }),
  defineCard({
    id: 'kappa-tech-wrecker', name: 'Kappa Tech-Wrecker', set: 'NEO',
    types: ['Creature'], colors: ['G'], power: 1, toughness: 3, manaCost: 2,
    oracleText: 'Ninjutsu {1}{G}\nThis creature enters with a deathtouch counter on it.\nWhenever this creature deals combat damage to a player, you may remove a deathtouch counter from it. When you do, exile target artifact or enchantment that player controls.',
    imageUri: 'https://cards.scryfall.io/large/front/d/3/d3a7bc69-4500-4e7e-94e4-67b85597bd82.jpg?1783923845',
    entersWithCounters: { deathtouch: 1 },
    abilities: [
      createAbility({
        type: ABILITY_TYPE.activated,
        keyword: 'ninjutsu',
        cost: { mana: 2 },
      }),
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: {
          event: 'combat_damage_to_player',
          requiresTarget: { type: 'artifact_or_enchantment', controlledBy: 'damaged_player' },
        },
        effect: [
          { type: 'remove_counter', counter: 'deathtouch', amount: 1 },
          { type: 'exile_permanent', targetType: 'artifact_or_enchantment', controlledBy: 'damaged_player' },
        ],
      }),
    ],
    support: { status: 'supported', limitations: ['trigger odpala się tylko, gdy cel wygnania istnieje (deterministyczne „you may")', 'deathtouch licznik nie nadaje samego deathtouch w walce'] },
  }),
  defineCard({
    id: 'segmented-krotiq', name: 'Segmented Krotiq', set: 'DTK',
    types: ['Creature'], colors: ['G'], power: 6, toughness: 5, manaCost: 6,
    oracleText: 'Megamorph {6}{G} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its megamorph cost and put a +1/+1 counter on it.)',
    imageUri: 'https://cards.scryfall.io/large/front/d/c/dcdbe824-f9c7-4f4d-af92-438b16057d99.jpg?1783938576',
    morph: { cost: 3, megamorphCost: 7 },
    support: { status: 'supported', limitations: ['obrót twarzą do góry tylko za koszt megamorph (bez wariantu {3} bez licznika)'] },
  }),
  // Drugi batch realnych kart (2026-08-01): Grizzled Outcasts (ISD),
  // Entrancing Lyre (THB), Zoraline, Cosmos Caller (BLB).
  // Strona przednia wilkołaka (transform DFC); tył to osobna definicja
  // 'krallenhorde-wantons' (limited — nie taliowalna, jak token).
  defineCard({
    id: 'grizzled-outcasts', name: 'Grizzled Outcasts', set: 'ISD',
    types: ['Creature'], subtypes: ['Human', 'Werewolf'], colors: ['G'],
    power: 4, toughness: 4, manaCost: 5, keywords: ['transform'],
    oracleText: 'At the beginning of each upkeep, if no spells were cast last turn, transform this creature.',
    imageUri: 'https://cards.scryfall.io/large/front/4/b/4b43b0cb-a5a3-47b4-9b6b-9d2638222bb6.jpg?1783940923',
    transformTo: 'krallenhorde-wantons',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'upkeep', condition: { noSpellsLastTurn: true } },
        effect: [{ type: 'transform' }],
      }),
    ],
    support: { status: 'supported', limitations: ['transform tylko przez trigger upkeep (bez ręcznego obrotu)'] },
  }),
  defineCard({
    id: 'krallenhorde-wantons', name: 'Krallenhorde Wantons', set: 'ISD',
    types: ['Creature'], subtypes: ['Werewolf'], colors: ['G'],
    power: 7, toughness: 7, manaCost: 5, keywords: ['transform'],
    oracleText: 'At the beginning of each upkeep, if a player cast two or more spells last turn, transform this creature.',
    imageUri: 'https://cards.scryfall.io/large/back/4/b/4b43b0cb-a5a3-47b4-9b6b-9d2638222bb6.jpg?1783940923',
    transformTo: 'grizzled-outcasts',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'upkeep', condition: { minSpellsLastTurn: 2 } },
        effect: [{ type: 'transform' }],
      }),
    ],
    support: { status: 'limited', limitations: ['tylna strona transform — nie można umieścić w talii'] },
  }),
  defineCard({
    id: 'entrancing-lyre', name: 'Entrancing Lyre', set: 'THB',
    types: ['Artifact'], colors: [], manaCost: 3,
    oracleText: 'You may choose not to untap this artifact during your untap step.\n{X}, {T}: Tap target creature with power X or less. It doesn\'t untap during its controller\'s untap step for as long as this artifact remains tapped.',
    imageUri: 'https://cards.scryfall.io/large/front/0/6/064abee6-7394-4b75-946f-4ad9840034ac.jpg?1783931515',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.activated,
        cost: { tap: true, manaX: true },
        targets: [{ type: 'creature' }],
        effect: [
          { type: 'tap_permanent' },
          { type: 'lock_untap' },
        ],
      }),
    ],
    support: { status: 'supported', limitations: ['X zawsze równe mocy celu (najtańsze legalne)', '„you may choose not to untap" nieimplementowane — lira odkręca się sama w swoim untap step'] },
  }),
  defineCard({
    id: 'zoraline', name: 'Zoraline, Cosmos Caller', set: 'BLB',
    types: ['Legendary', 'Creature'], subtypes: ['Bat', 'Cleric'], colors: ['W', 'B'],
    keywords: ['flying', 'vigilance'], power: 3, toughness: 3, manaCost: 3,
    oracleText: 'Flying, vigilance\nWhenever a Bat you control attacks, you gain 1 life.\nWhenever Zoraline enters or attacks, you may pay {W}{B} and 2 life. When you do, return target nonland permanent card with mana value 3 or less from your graveyard to the battlefield with a finality counter on it.',
    imageUri: 'https://cards.scryfall.io/large/front/b/7/b7f99fd5-5298-4b27-923d-9d31203c931a.jpg?1783910787',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'bat_attacks' },
        effect: [{ type: 'gain_life', amount: 1 }],
      }),
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: {
          event: 'enter_battlefield',
          requiresTarget: { type: 'permanent_card_in_graveyard', controlledBy: 'controller', maxManaValue: 3 },
          payMana: 2, payLife: 2,
        },
        effect: [
          { type: 'pay_mana', amount: 2 },
          { type: 'pay_life', amount: 2 },
          { type: 'return_permanent_from_graveyard', finalityCounter: true },
        ],
      }),
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: {
          event: 'attacks',
          requiresTarget: { type: 'permanent_card_in_graveyard', controlledBy: 'controller', maxManaValue: 3 },
          payMana: 2, payLife: 2,
        },
        effect: [
          { type: 'pay_mana', amount: 2 },
          { type: 'pay_life', amount: 2 },
          { type: 'return_permanent_from_graveyard', finalityCounter: true },
        ],
      }),
    ],
    support: { status: 'supported', limitations: ['„you may" deterministyczne: trigger odpala się tylko przy legalnym celu i opłacalnym koszcie', 'finality counter działa tylko przy śmierci z obrażeń (jedyna przyczyna śmierci w engine)'] },
  }),
]);

/** Registry repozytorium: katalog syntetyczny (stabilna baza testów) + realne karty. */
export function createCardRegistry() {
  return createRegistry([...SYNTHETIC_CARDS, ...REAL_CARDS]);
}
