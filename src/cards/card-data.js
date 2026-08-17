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

// Batch 9 token ability: kept as a reusable descriptor for both the token
// registry entry and Dragonbroods' Relic's create_token effect (ADR 0002).
const BATCH9_RELIQUARY_DRAGON_ETB = createAbility({
  type: ABILITY_TYPE.triggered,
  trigger: { event: 'enter_battlefield', requiresTarget: { type: 'any_target', prefer: 'opponent' } },
  effect: { type: 'damage', amount: 3 },
});

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
    // M100/E10 (P10): podtyp wg Oracle (Creature — Elk).
    types: ['Creature'], subtypes: ['Elk'], colors: ['G'], power: 2, toughness: 1, manaCost: 2,
    oracleText: 'When this creature dies, you gain 2 life.',
    imageUri: 'https://cards.scryfall.io/large/front/7/f/7fbb10a9-486a-4b9a-b3f5-c17f661af2b2.jpg?1783939067',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'dies' },
        effect: [{ type: 'gain_life', amount: 2 }],
      }),
    ],
    artId: 509,
    plan: 'Tarkir',
    support: { status: 'supported', limitations: [] },
  }),
  defineCard({
    id: 'kappa-tech-wrecker', name: 'Kappa Tech-Wrecker', set: 'NEO',
    // M100/E10 (P10): podtypy wg Oracle (Creature — Turtle Ninja).
    types: ['Creature'], subtypes: ['Turtle', 'Ninja'], colors: ['G'], power: 1, toughness: 3, manaCost: 2,
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
          // Temat 2: „you may remove a deathtouch counter... When you do, exile
          // target artifact or enchantment" — cel wybiera kontroler, a „you
          // may" daje opcję odmowy (allowNone).
          requiresTarget: { type: 'artifact_or_enchantment', controlledBy: 'damaged_player', optional: true },
        },
        effect: [
          { type: 'remove_counter', counter: 'deathtouch', amount: 1 },
          { type: 'exile_permanent', targetType: 'artifact_or_enchantment', controlledBy: 'damaged_player' },
        ],
      }),
    ],
    artId: 278,
    plan: 'Kamigawa',
    support: { status: 'supported', limitations: [] },
  }),
  defineCard({
    id: 'segmented-krotiq', name: 'Segmented Krotiq', set: 'DTK',
    // M100/E10 (P10): podtyp wg Oracle (Creature — Insect).
    types: ['Creature'], subtypes: ['Insect'], colors: ['G'], power: 6, toughness: 5, manaCost: 6,
    oracleText: 'Megamorph {6}{G} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its megamorph cost and put a +1/+1 counter on it.)',
    imageUri: 'https://cards.scryfall.io/large/front/d/c/dcdbe824-f9c7-4f4d-af92-438b16057d99.jpg?1783938576',
    morph: { cost: 3, megamorphCost: 7, colors: ['G'] },
    artId: 523,
    plan: 'Wiedźmin',
    support: { status: 'supported', limitations: [] },
    notes: ['obrót twarzą do góry tylko za koszt megamorph (bez wariantu {3} bez licznika)'],
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
        // „At the beginning of EACH upkeep..." — jawne: każdy upkeep (CR 504.x).
        trigger: { event: 'upkeep', condition: { noSpellsLastTurn: true, eachUpkeep: true } },
        effect: [{ type: 'transform' }],
      }),
    ],
    artId: 171,
    plan: 'Innistrad',
    support: { status: 'supported', limitations: [] },
    notes: ['transform tylko przez trigger upkeep (bez ręcznego obrotu)'],
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
        trigger: { event: 'upkeep', condition: { minSpellsLastTurn: 2, eachUpkeep: true } },
        effect: [{ type: 'transform' }],
      }),
    ],
    artId: 486,
    plan: 'Innistrad',
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
        cost: { tap: true, manaX: true, maxPowerX: true },
        targets: [{ type: 'creature' }],
        effect: [
          { type: 'tap_permanent' },
          { type: 'lock_untap' },
        ],
      }),
    ],
    artId: 195,
    plan: 'Theros',
    support: { status: 'supported', limitations: [] },
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
          payMana: 2, payColors: ['W', 'B'], payLife: 2,
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
          payMana: 2, payColors: ['W', 'B'], payLife: 2,
        },
        effect: [
          { type: 'pay_mana', amount: 2 },
          { type: 'pay_life', amount: 2 },
          { type: 'return_permanent_from_graveyard', finalityCounter: true },
        ],
      }),
    ],
    artId: 480,
    plan: 'Bloomburrow',
    support: { status: 'supported', limitations: [] },
  }),
  // Trzeci batch realnych kart (2026-08-01): Rupture Spire (CON),
  // Leafcrown Dryad (THS), Prismari Campus (STX).
  defineCard({
    id: 'rupture-spire', name: 'Rupture Spire', set: 'CON',
    types: ['Land'], entersTapped: true,
    oracleText: 'This land enters tapped.\nWhen this land enters, sacrifice it unless you pay {1}.\n{T}: Add one mana of any color.',
    imageUri: 'https://cards.scryfall.io/large/front/5/6/568df642-3ad7-401c-a133-edb56970c3a1.jpg?1783942460',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'enter_battlefield', payMana: 1, sacrificeIfUnpaid: true },
        effect: [],
      }),
    ],
    artId: 448,
    plan: 'Warhammer Fantasy',
    support: { status: 'supported', limitations: [] },
  }),
  defineCard({
    id: 'leafcrown-dryad', name: 'Leafcrown Dryad', set: 'THS',
    types: ['Enchantment', 'Creature'], subtypes: ['Nymph', 'Dryad'], colors: ['G'],
    keywords: ['reach'], power: 2, toughness: 2, manaCost: 2,
    // Bestow {3}{G} (CR 702.103): alternatywny koszt — czar staje się czarem
    // aury z celem „stwór\"; po wejściu załączony NIE jest stworem, a po
    // odłączeniu znów nim jest. Buff zaczarowanego stwora: +2/+2 i reach.
    bestow: { cost: 4, pump: { power: 2, toughness: 2 }, keywords: ['reach'] },
    oracleText: 'Bestow {3}{G} (If you cast this card for its bestow cost, it\'s an Aura spell with enchant creature. It becomes a creature again if it\'s not attached.)\nReach\nEnchanted creature gets +2/+2 and has reach.',
    imageUri: 'https://cards.scryfall.io/large/front/8/2/8202e426-ad91-4d2e-9373-7a829b58fff5.jpg?1783939745',
    artId: 521,
    plan: 'Wiedźmin',
    support: { status: 'supported', limitations: [] },
  }),
  defineCard({
    id: 'prismari-campus', name: 'Prismari Campus', set: 'STX',
    types: ['Land'], entersTapped: true,
    oracleText: 'This land enters tapped.\n{T}: Add {U} or {R}.\n{4}, {T}: Scry 1. (Look at the top card of your library. You may put that card on the bottom.)',
    imageUri: 'https://cards.scryfall.io/large/front/7/6/768120f5-9401-4e52-924e-3374bde65b3d.jpg?1783927271',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.activated,
        cost: { mana: 4, tap: true },
        effect: { type: 'scry', amount: 1 },
      }),
    ],
    artId: 459,
    plan: 'Arcavios',
    support: { status: 'supported', limitations: [] },
    notes: ['scry 1: decyzja wierzch/spód jest realna (komenda resolve_scry); gracz widzi wyłącznie własne przeglądane karty'],
  }),
  // Czwarty batch realnych kart (2026-08-01): Gloomfang Mauler (MOM),
  // Serra's Embrace (DVD), Cloak of the Bat (CLB). Dane pobrane ze Scryfall
  // przed kodowaniem (docs/cards/), Oracle text dosłownie. Zasada
  // właściciela: karta kodowana w 100% mechanik — limitations na mechanikach
  // samej karty nie wchodzą w grę (puste listy poniżej to konsekwencja).
  defineCard({
    id: 'gloomfang-mauler', name: 'Gloomfang Mauler', set: 'MOM',
    types: ['Creature'], subtypes: ['Nightmare'], colors: ['B'],
    keywords: ['menace'], power: 5, toughness: 5, manaCost: 7,
    // Backup 2 (CR 702.165): ETB trigger — dwa liczniki +1/+1 na docelowym
    // stworze; jeśli to INNY stwór niż źródło, zyskuje menace do końca tury.
    // Cel wybiera kontroler blokującą decyzją resolve_backup.
    backup: { counters: 2, grantKeywords: ['menace'] },
    oracleText: 'Swampcycling {2} ({2}, Discard this card: Search your library for a Swamp card, reveal it, put it into your hand, then shuffle.)\nBackup 2 (When this creature enters, put two +1/+1 counters on target creature. If that\'s another creature, it gains the following ability until end of turn.)\nMenace',
    imageUri: 'https://cards.scryfall.io/large/front/0/2/025a5338-133f-486d-9f73-0896226685c0.jpg?1783917008',
    abilities: [
      // Swampcycling {2} (CR 702.28-29): cycling z kwalifikacją na podtyp
      // Swamp — szuka własnej biblioteki, reveal do ręki, tasowanie.
      createAbility({
        type: ABILITY_TYPE.activated,
        keyword: 'cycling',
        cost: { mana: 2 },
        cycling: { subtypes: ['Swamp'] },
        effect: [],
      }),
    ],
    artId: 199,
    plan: 'Mirrodin',
    support: { status: 'supported', limitations: [] },
  }),
  defineCard({
    id: 'serras-embrace', name: 'Serra\'s Embrace', set: 'DVD',
    types: ['Enchantment'], subtypes: ['Aura'], colors: ['W'], manaCost: 4,
    // Czysta aura (CR 303.4): „enchant creature" — czar aury z celem (każdy
    // stwór); buff zaczarowanego stwora; przy nielegalnym celu w rozstrzygnięciu
    // trafia do grobu (inaczej niż bestow), ginie też po stracie gospodarza
    // (CR 704.5m).
    aura: { pump: { power: 2, toughness: 2 }, keywords: ['flying', 'vigilance'] },
    oracleText: 'Enchant creature\nEnchanted creature gets +2/+2 and has flying and vigilance. (Attacking doesn\'t cause it to tap.)',
    imageUri: 'https://cards.scryfall.io/large/front/2/c/2c45c4b3-f652-4b55-a316-55a864ac2342.jpg?1783938784',
    artId: 110,
    plan: 'Dominaria',
    support: { status: 'supported', limitations: [] },
  }),
  defineCard({
    id: 'cloak-of-the-bat', name: 'Cloak of the Bat', set: 'CLB',
    types: ['Artifact'], subtypes: ['Equipment'], colors: [], manaCost: 2,
    // Equipment (CR 301.5/702.6): equip {2} — sorcery-speed, cel własny stwór;
    // nosiciel ma flying i haste; equipment ZOSTAJE na bitwisku gdy nosiciel
    // odejdzie (CR 704.5n) i można je przełożyć na innego własnego stwora.
    equipment: { equip: 2, keywords: ['flying', 'haste'] },
    oracleText: 'Equipped creature has flying and haste.\nEquip {2} ({2}: Attach to target creature you control. Equip only as a sorcery.)',
    imageUri: 'https://cards.scryfall.io/large/front/2/f/2f508a65-ff32-480a-b9c6-075074d0c3c3.jpg?1783922679',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.activated,
        keyword: 'equip',
        cost: { mana: 2 },
        effect: [],
      }),
    ],
    artId: 200,
    plan: 'Forgotten Realms',
    support: { status: 'supported', limitations: [] },
  }),
  // Piąty batch realnych kart (2026-08-02): Midnight Guard (DKA), Holdout
  // Settlement (OGW), Skyclave Geopede (ZNR). Dane Oracle w docs/cards/.
  defineCard({
    id: 'midnight-guard', name: 'Midnight Guard', set: 'DKA',
    types: ['Creature'], subtypes: ['Human', 'Soldier'], colors: ['W'],
    power: 2, toughness: 3, manaCost: 3,
    oracleText: 'Whenever another creature enters, untap this creature.',
    imageUri: 'https://cards.scryfall.io/large/front/2/2/2264b760-c527-470d-bad0-d8baaf543631.jpg?1783940853',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'another_creature_enters' },
        effect: { type: 'untap_permanent' },
      }),
    ],
    artId: 385,
    plan: 'Innistrad',
    support: { status: 'supported', limitations: [] },
  }),
  defineCard({
    id: 'holdout-settlement', name: 'Holdout Settlement', set: 'OGW',
    types: ['Land'], colors: [],
    oracleText: '{T}: Add {C}. ({C} represents colorless mana.)\n{T}, Tap an untapped creature you control: Add one mana of any color.',
    imageUri: 'https://cards.scryfall.io/large/front/c/f/cf08c317-6f2d-47e3-ab5b-8af73fd3e404.jpg?1783937892',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.activated,
        cost: { tap: true, tapCreature: true },
        effect: { type: 'add_mana', amount: 1 },
      }),
    ],
    artId: 79,
    plan: 'Zendikar',
    support: { status: 'supported', limitations: [] },
  }),
  defineCard({
    id: 'skyclave-geopede', name: 'Skyclave Geopede', set: 'ZNR',
    types: ['Creature'], subtypes: ['Insect'], colors: ['R'],
    keywords: ['trample'], power: 3, toughness: 1, manaCost: 3,
    oracleText: 'Trample\nLandfall — Whenever a land you control enters, this creature gets +2/+2 until end of turn.',
    imageUri: 'https://cards.scryfall.io/large/front/d/b/db9103c9-084f-4ad2-8b7b-ca52be97619d.jpg?1783929349',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'land_entered_under_your_control' },
        effect: { type: 'pump', power: 2, toughness: 2 },
      }),
    ],
    artId: 493,
    plan: 'Zendikar',
    support: { status: 'supported', limitations: [] },
  }),
  // Szósty batch realnych kart (2026-08-02): Soulmender (M20), Illusory
  // Demon (ARB), Jyoti, Moag Ancient (M3C). Dane Oracle w docs/cards/.
  defineCard({
    id: 'soulmender', name: 'Soulmender', set: 'M20',
    types: ['Creature'], subtypes: ['Human', 'Cleric'], colors: ['W'],
    power: 1, toughness: 1, manaCost: 1,
    oracleText: '{T}: You gain 1 life.',
    imageUri: 'https://cards.scryfall.io/large/front/3/1/31b83ffd-bd08-48c6-98a3-811abc203f60.jpg?1783933019',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.activated,
        cost: { tap: true },
        effect: { type: 'gain_life', amount: 1 },
      }),
    ],
    artId: 13,
    plan: 'Śródziemie',
    support: { status: 'supported', limitations: [] },
  }),
  defineCard({
    id: 'illusory-demon', name: 'Illusory Demon', set: 'ARB',
    types: ['Creature'], subtypes: ['Demon', 'Illusion'], colors: ['B', 'U'],
    keywords: ['flying'], power: 4, toughness: 3, manaCost: 3,
    oracleText: 'Flying\nWhen you cast a spell, sacrifice this creature.',
    imageUri: 'https://cards.scryfall.io/large/front/f/4/f4d69f7f-ac70-477b-9246-8d81fef7d335.jpg?1783942438',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'when_you_cast_spell' },
        effect: { type: 'sacrifice_permanent' },
      }),
    ],
    artId: 305,
    plan: 'Alara',
    support: { status: 'supported', limitations: [] },
  }),
  defineCard({
    id: 'jyoti-moag-ancient', name: 'Jyoti, Moag Ancient', set: 'M3C',
    types: ['Legendary', 'Creature'], subtypes: ['Elemental'], colors: ['G', 'U'],
    power: 2, toughness: 4, manaCost: 4,
    oracleText: 'When Jyoti enters, create a 1/1 green Forest Dryad land creature token for each time you\'ve cast your commander from the command zone this game. (They\'re affected by summoning sickness.)\nAt the beginning of each combat, land creatures you control get +X/+X until end of turn, where X is Jyoti\'s power.',
    imageUri: 'https://cards.scryfall.io/large/front/9/d/9d2cb8d1-6aaa-487f-bf5a-89d657c0f37e.jpg?1783911437',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'enter_battlefield' },
        effect: {
          type: 'create_token',
          cardId: 'token_forest_dryad',
          name: 'Forest Dryad',
          kind: 'creature', power: 1, toughness: 1, colors: ['G'],
          types: ['Land', 'Creature'], subtypes: ['Forest', 'Dryad'],
          // Liczba rzuceń commandera z command zone — w obecnym formacie bez
          // command zone zawsze 0, więc 0 tokenów (mechanicznie poprawne).
          amount: 'commander_casts',
        },
      }),
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'beginning_of_combat' },
        effect: { type: 'buff_land_creatures', power: 'source_power', toughness: 'source_power' },
      }),
    ],
    artId: 307,
    plan: 'Moag',
    support: { status: 'supported', limitations: ['brak command zone w engine — liczba rzuceń commandera zawsze 0, więc ETB nie tworzy tokenów w tym formacie (mechanicznie poprawne); token Forest Dryad zdefiniowany i testowany'] },
    notes: ['land creatures to obiekty z typem Land i rodzajem creature (walczą i tapują się na manę)'],
  }),
  // Token Jyoti (M3C): 1/1 zielony Forest Dryad — land creature (typ Land
  // + rodzaj creature): walczy jak stwór i tapuje się na manę jak land.
  // Definicja tokena — nie taliowalna (limited), jak token_goblin.
  defineCard({
    id: 'token_forest_dryad', name: 'Forest Dryad', set: null,
    types: ['Land', 'Creature', 'Token'], subtypes: ['Forest', 'Dryad'], colors: ['G'],
    power: 1, toughness: 1, manaCost: 0,
    imageUri: 'https://cards.scryfall.io/large/front/1/0/107be8ee-ee22-4d37-94f1-2a5b438fbe05.jpg?1783911122',  // tm3c
    support: { status: 'limited', limitations: ['token — nie można umieścić w talii'] },
  }),
  // Siódmy batch realnych kart (2026-08-02): Fake Your Own Death (OTJ),
  // Puppeteer Clique (SHM), Unstable Frontier (CON), Apprentice Wizard (2XM),
  // Delta Bloodflies (TDM). Dane Oracle w docs/cards/.
  defineCard({
    id: 'fake-your-own-death', name: 'Fake Your Own Death', set: 'OTJ',
    types: ['Instant'], colors: ['B'], manaCost: 2,
    oracleText: 'Until end of turn, target creature gets +2/+0 and gains "When this creature dies, return it to the battlefield tapped under its owner\'s control and you create a Treasure token." (It\'s an artifact with "{T}, Sacrifice this token: Add one mana of any color.")',
    imageUri: 'https://cards.scryfall.io/large/front/7/9/79a17ab9-13c9-41d4-a143-82d8caacfd8b.jpg?1783911832',
    spell: {
      timing: 'instant',
      targets: [{ type: 'creature' }],
      effects: [
        { type: 'pump', power: 2, toughness: 0 },
        // Nadanie zdolności „do końca tury\": trigger dies, który zwraca
        // stwora zatapniętego i tworzy token Treasure. Deskryptor jest
        // generyczny (grant_abilities + return_to_battlefield_tapped).
        {
          type: 'grant_abilities',
          abilities: [
            createAbility({
              type: ABILITY_TYPE.triggered,
              trigger: { event: 'dies' },
              effect: [
                { type: 'return_to_battlefield_tapped' },
                {
                  type: 'create_token', cardId: 'token_treasure', name: 'Treasure',
                  kind: 'artifact', colors: [], types: ['Artifact'], subtypes: ['Treasure'],
                  abilities: [
                    createAbility({
                      type: ABILITY_TYPE.activated,
                      cost: { tap: true, sacrificeSelf: true },
                      // Mana ze Skarba jest identyfikowalna (Marut, Batch 16).
                      effect: { type: 'add_mana', amount: 1, fromTreasure: true },
                    }),
                  ],
                },
              ],
            }),
          ],
        },
      ],
    },
    artId: 295,
    plan: 'Thunder Junction',
    support: { status: 'supported', limitations: [] },
    notes: ['nadany trigger dies działa z LKI: przechodzi z obiektem do grobu w tej samej turze (formerAbilityGrants)'],
  }),
  defineCard({
    id: 'puppeteer-clique', name: 'Puppeteer Clique', set: 'SHM',
    types: ['Creature'], subtypes: ['Faerie', 'Wizard'], colors: ['B'],
    keywords: ['flying', 'persist'], power: 3, toughness: 2, manaCost: 5,
    oracleText: 'Flying\nWhen this creature enters, put target creature card from an opponent\'s graveyard onto the battlefield under your control. It gains haste. At the beginning of your next end step, exile it.\nPersist (When this creature dies, if it had no -1/-1 counters on it, return it to the battlefield under its owner\'s control with a -1/-1 counter on it.)',
    imageUri: 'https://cards.scryfall.io/large/front/6/f/6ff839e1-6f76-4a24-a87c-d4589b1abf66.jpg?1783942753',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: {
          event: 'enter_battlefield',
          requiresTarget: { type: 'creature_card_in_opponent_graveyard' },
        },
        effect: [{ type: 'reanimate_under_your_control', grantKeywords: ['haste'], exileAtNextEndStep: true }],
      }),
      // Persist (CR 702.79) — trigger dies z warunkiem LKI „brak liczników -1/-1\".
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'dies', condition: { noMinusCountersWhenDied: true } },
        effect: [{ type: 'return_with_counter', counter: '-1/-1', amount: 1 }],
      }),
    ],
    artId: 343,
    plan: 'Lorwyn',
    support: { status: 'supported', limitations: [] },
  }),

  // 4. Courage in Crisis (WAR) {2}{G} Instant — +1/+1 counter on target
  // creature, then proliferate. Dwa efekty w spell (sekwencyjnie):
  // add_counter, potem proliferate. Proliferate wybiera cele (każdy
  // gracz/permanent z licznikami) — batch22 (mechanika z commit b8c43a8).
  defineCard({
    id: 'courage-in-crisis', name: 'Courage in Crisis', set: 'WAR',
    types: ['Instant'], colors: ['G'], manaCost: 3,
    oracleText: 'Put a +1/+1 counter on target creature, then proliferate.',
    imageUri: 'https://cards.scryfall.io/large/front/6/7/67a22083-9ef9-4ff7-8502-3a77e69299df.jpg?1783933415',
    spell: {
      timing: 'instant',
      targets: [{ type: 'creature' }],
      effects: [
        { type: 'add_counter', counter: '+1/+1', amount: 1 },
        // Proliferate (CR 701.27): po +1/+1 counter wybieramy DOWOLNĄ
        // liczbę celów (permanenty z licznikami + gracze z poison > 0);
        // każdy dostaje +1 do każdego typu licznika. Brak wybranych
        // celów → czeka na resolve_proliferate z listą (kolejka
        // pendingProliferate ustawiana wewnętrznie).
        { type: 'proliferate' },
      ],
    },
    artId: 124,
    plan: 'Ravnica',
    support: { status: 'supported', limitations: [] },
    notes: ['proliferate kolejkuje pendingProliferate po add_counter; gracz musi jawnie wywołać resolve_proliferate'],
  }),

  // 5. Selesnya Charm (RTR) {G}{W} Instant — modalne 3 tryby.
  defineCard({
    id: 'selesnya-charm', name: 'Selesnya Charm', set: 'RTR',
    types: ['Instant'], colors: ['G', 'W'], manaCost: 2,
    oracleText: 'Choose one —\n• Target creature gets +2/+2 and gains trample until end of turn.\n• Exile target creature with power 5 or greater.\n• Create a 2/2 white Knight creature token with vigilance.',
    imageUri: 'https://cards.scryfall.io/large/front/a/9/a9848eab-1d3a-4ab0-adf6-c20858aa3afb.jpg?1783940333',
    spell: {
      timing: 'instant',
      modes: [
        // Tryb A (Pump): +2/+2 trample EOT.
        { name: 'Pump', targets: [{ type: 'creature' }],
          effects: [
            { type: 'pump', power: 2, toughness: 2 },
            { type: 'grant_keywords_until_end_of_turn', keywords: ['trample'] },
          ] },
        // Tryb B (Exile): stwór z mocą ≥ 5.
        { name: 'Wygnanie', targets: [{ type: 'creature_with_power_at_least', min: 5 }],
          effects: [{ type: 'exile_permanent' }] },
        // Tryb C (Token): 2/2 biały Knight z vigilance.
        { name: 'Rycerz',
          effects: [{
            type: 'create_token', cardId: 'token_knight', name: 'Knight',
            kind: 'creature', power: 2, toughness: 2, colors: ['W'],
            types: ['Creature'], subtypes: ['Knight'], keywords: ['vigilance'],
            amount: 1,
          }] },
      ],
    },
    artId: 46,
    plan: 'Ravnica',
    support: { status: 'supported', limitations: [] },
  }),

  // 6. Wormfang Newt (JUD) {1}{U} 2/2 Salamander — ETB exile land you control
  // (T2: cel wybiera kontroler, nowy efekt exile_own_land zapamiętuje
  // exiledCardIds na źródle). LTB return exiled card to battlefield under
  // owner's control (return_exiled_to_battlefield czyta exiledCardId z LKI).
  defineCard({
    id: 'wormfang-newt', name: 'Wormfang Newt', set: 'JUD',
    types: ['Creature'], subtypes: ['Salamander'], colors: ['U'],
    power: 2, toughness: 2, manaCost: 2,
    oracleText: 'When this creature enters, exile a land you control.\nWhen this creature leaves the battlefield, return the exiled card to the battlefield under its owner\'s control.',
    imageUri: 'https://cards.scryfall.io/large/front/d/f/df8012c1-76ec-4c36-8b38-5bc41ce5e156.jpg?1783945125',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: {
          event: 'enter_battlefield',
          requiresTarget: { type: 'land_you_control' },
        },
        effect: [{ type: 'exile_own_land' }],
      }),
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'leaves_battlefield' },
        effect: [{ type: 'return_exiled_to_battlefield' }],
      }),
    ],
    artId: 316,
    plan: 'Dominaria',
    support: { status: 'supported', limitations: [] },
    notes: ['ETB exile land bez innych landów: trigger odpala się, ale exile_own_land nic nie robi (brak celu) — LTB też no-op'],
  }),


  // 7. Raise the Alarm (CMR) {1}{W} Instant — create two 1/1 white Soldier
  // creature tokens (re-uses token_soldier z Captain's Call).
  defineCard({
    id: 'raise-the-alarm', name: 'Raise the Alarm', set: 'CMR',
    types: ['Instant'], colors: ['W'], manaCost: 2,
    oracleText: 'Create two 1/1 white Soldier creature tokens.',
    imageUri: 'https://cards.scryfall.io/large/front/6/c/6c7c8527-55f6-494d-b4f7-c427a5735053.jpg?1783928875',
    spell: {
      timing: 'instant', targets: [],
      effects: [{
        type: 'create_token', cardId: 'token_soldier', name: 'Soldier',
        kind: 'creature', power: 1, toughness: 1, colors: ['W'],
        types: ['Creature'], subtypes: ['Soldier'], amount: 2,
      }],
    },
    artId: 298,
    plan: 'Śródziemie',
    support: { status: 'supported', limitations: [] },
  }),

  // 8. Cellar Door (ISD) {2} Artifact — activated {3},{T} mill bottom +
  // conditional 2/2 B Zombie token if milled creature (re-uses
  // token_zombie z Undead Servant + mill_from_bottom z engine-batch22).
  defineCard({
    id: 'cellar-door', name: 'Cellar Door', set: 'ISD',
    types: ['Artifact'], colors: [], manaCost: 2,
    // M117: Oracle mówi o karcie ze SPODU biblioteki („puts the bottom card”),
    // nie o mill 1 (wierzch). Mechanika (`mill_from_bottom`) była poprawna —
    // błędny był tekst pokazywany graczowi.
    oracleText: '{3}, {T}: Target player puts the bottom card of their library into their graveyard. If it\'s a creature card, you create a 2/2 black Zombie creature token.',
    imageUri: 'https://cards.scryfall.io/large/front/9/7/97bdfb00-7773-4af6-895c-c90088a96b07.jpg?1783940904',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.activated,
        cost: { tap: true, mana: 3 },
        targets: [{ type: 'player' }],
        effect: [{
          type: 'mill_from_bottom',
          amount: 1,
          if_creature_create_token: {
            cardId: 'token_zombie', name: 'Zombie', kind: 'creature',
            power: 2, toughness: 2, colors: ['B'],
            types: ['Creature'], subtypes: ['Zombie'],
          },
        }],
      }),
    ],
    artId: 420,
    plan: 'Warhammer Fantasy',
    support: { status: 'supported', limitations: [] },
  }),

  // 9. Healer of the Glade (M20) {G} 1/2 Elf — ETB gain 3 life.
  defineCard({
    id: 'healer-of-the-glade', name: 'Healer of the Glade', set: 'M20',
    types: ['Creature'], subtypes: ['Elf'], colors: ['G'],
    power: 1, toughness: 2, manaCost: 1,
    oracleText: 'When this creature enters, you gain 3 life.',
    imageUri: 'https://cards.scryfall.io/large/front/c/b/cbe262f2-e35b-4c85-938d-3e9e9c764c1b.jpg?1783932964',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'enter_battlefield' },
        effect: [{ type: 'gain_life', amount: 3, scope: 'controller' }],
      }),
    ],
    artId: 471,
    plan: 'Zendikar',
    support: { status: 'supported', limitations: [] },
  }),

  // 10. Enter the Enigma (MKM) {U} Instant — target creature can't be
  // blocked + draw 1 (re-uses cant_be_blocked i draw_cards).
  defineCard({
    id: 'enter-the-enigma', name: 'Enter the Enigma', set: 'MKM',
    types: ['Instant'], colors: ['U'], manaCost: 1,
    oracleText: 'Target creature can\'t be blocked this turn.\nDraw a card.',
    imageUri: 'https://cards.scryfall.io/large/front/c/f/cf5479c7-9e46-4a57-abe7-8cc670de89e4.jpg?1783909497',
    spell: {
      timing: 'instant',
      targets: [{ type: 'creature' }],
      effects: [
        { type: 'cant_be_blocked' },
        { type: 'draw_cards', amount: 1 },
      ],
    },
    artId: 528,
    plan: 'Duskmourn',
    support: { status: 'supported', limitations: [] },
  }),

  // Token Selesnya Charm (RTR): 2/2 biały Knight z vigilance.
  defineCard({
    id: 'token_knight', name: 'Knight', set: null,
    types: ['Creature', 'Token'], subtypes: ['Knight'], colors: ['W'],
    keywords: ['vigilance'], power: 2, toughness: 2, manaCost: 0,
    imageUri: 'https://cards.scryfall.io/large/front/b/f/bf9acfe1-de7a-48fe-aed3-28a72db6d1c0.jpg?1783940863',  // l12
    support: { status: 'limited', limitations: ['token — nie można umieścić w talii; tworzony przez Selesnya Charm'] },
  }),
  defineCard({
    id: 'unstable-frontier', name: 'Unstable Frontier', set: 'CON',
    types: ['Land'], colors: [],
    oracleText: '{T}: Add {C}.\n{T}: Target land you control becomes the basic land type of your choice until end of turn.',
    imageUri: 'https://cards.scryfall.io/large/front/d/9/d97e739f-8675-488e-be2b-4e455fbe390b.jpg?1783942460',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.activated,
        cost: { tap: true },
        targets: [{ type: 'land_you_control' }],
        effect: { type: 'become_basic_land_type' },
      }),
    ],
    artId: 49,
    plan: 'Alara',
    support: { status: 'supported', limitations: [] },
  }),
  defineCard({
    id: 'apprentice-wizard', name: 'Apprentice Wizard', set: '2XM',
    types: ['Creature'], subtypes: ['Human', 'Wizard'], colors: ['U'],
    power: 0, toughness: 1, manaCost: 3,
    oracleText: '{U}, {T}: Add {C}{C}{C}.',
    imageUri: 'https://cards.scryfall.io/large/front/e/1/e13026a8-7e3c-45b2-9838-080f14ae4b29.jpg?1783930205',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.activated,
        cost: { tap: true, mana: 1, colors: ['U'] },
        effect: { type: 'add_mana', amount: 3 },
      }),
    ],
    artId: 188,
    plan: 'Wiedźmin',
    support: { status: 'supported', limitations: [] },
  }),
  defineCard({
    id: 'delta-bloodflies', name: 'Delta Bloodflies', set: 'TDM',
    types: ['Creature'], subtypes: ['Insect'], colors: ['B'],
    keywords: ['flying'], power: 1, toughness: 2, manaCost: 2,
    oracleText: 'Flying\nWhenever this creature attacks, if you control a creature with a counter on it, each opponent loses 1 life.',
    imageUri: 'https://cards.scryfall.io/large/front/1/1/119bb72d-aed9-47dc-9285-7bc836cc3776.jpg?1783907378',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'attacks', condition: { controlsCreatureWithCounter: true } },
        effect: { type: 'lose_life', amount: 1, scope: 'each_opponent' },
      }),
    ],
    artId: 431,
    plan: 'Tarkir',
    support: { status: 'supported', limitations: [] },
  }),
  // Token Fake Your Own Death (OTJ): Treasure — artefakt bez statystyk ze
  // zdolnością „{T}, Sacrifice this token: Add one mana of any color\".
  // Definicja tokena — nie taliowalna (limited), jak token_goblin.
  defineCard({
    id: 'token_treasure', name: 'Treasure', set: null,
    types: ['Artifact', 'Token'], subtypes: ['Treasure'], colors: [],
    manaCost: 0,
    imageUri: 'https://cards.scryfall.io/large/front/7/e/7ec6f053-96f7-4e57-b2eb-4e7699a40a4f.jpg?1783911520',  // totj
    support: { status: 'limited', limitations: ['token — nie można umieścić w talii'] },
  }),
  // Ósmy batch realnych kart (2026-08-02): Phyrexian Rager (DMU), Nefarious
  // Imp (CLB), Gather the Townsfolk (DDQ), Evangel of Synthesis (BRO),
  // Woolly Loxodon (KTK). Dane Oracle w docs/cards/.
  defineCard({
    id: 'phyrexian-rager', name: 'Phyrexian Rager', set: 'DMU',
    types: ['Creature'], subtypes: ['Phyrexian', 'Horror'], colors: ['B'],
    power: 2, toughness: 2, manaCost: 3,
    oracleText: 'When this creature enters, you draw a card and you lose 1 life.',
    imageUri: 'https://cards.scryfall.io/large/front/6/f/6fd574e7-705f-4a65-aad0-68ff6d63bf0f.jpg?1783921329',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'enter_battlefield' },
        effect: [
          { type: 'draw_cards', amount: 1 },
          { type: 'lose_life', amount: 1, scope: 'controller' },
        ],
      }),
    ],
    artId: 75,
    plan: 'Dominaria',
    support: { status: 'supported', limitations: [] },
  }),
  defineCard({
    id: 'nefarious-imp', name: 'Nefarious Imp', set: 'CLB',
    types: ['Creature'], subtypes: ['Imp'], colors: ['B'],
    keywords: ['flying'], power: 2, toughness: 1, manaCost: 3,
    oracleText: 'Flying\nWhenever one or more permanents you control leave the battlefield, scry 1. (Look at the top card of your library. You may put that card on the bottom.)',
    imageUri: 'https://cards.scryfall.io/large/front/0/d/0dc61b93-b87a-47f4-b5b5-eedb1db48288.jpg?1783922758',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'permanents_you_control_leave_battlefield' },
        effect: { type: 'scry', amount: 1 },
      }),
    ],
    artId: 3,
    plan: 'Forgotten Realms',
    support: { status: 'supported', limitations: [] },
    notes: ['„one or more" liczone per komenda: kilka permanentów odchodzących naraz daje jeden trigger (zgodne z CR 603.2)'],
  }),
  defineCard({
    id: 'gather-the-townsfolk', name: 'Gather the Townsfolk', set: 'DDQ',
    types: ['Sorcery'], colors: ['W'], manaCost: 2,
    oracleText: 'Create two 1/1 white Human creature tokens.\nFateful hour — If you have 5 or less life, create five of those tokens instead.',
    imageUri: 'https://cards.scryfall.io/large/front/7/6/76f66ee8-8289-4780-aaec-feabd8ea9e3d.jpg?1783937856',
    spell: {
      timing: 'sorcery',
      targets: [],
      effects: [
        {
          type: 'create_token', cardId: 'token_human', name: 'Human',
          kind: 'creature', power: 1, toughness: 1, colors: ['W'],
          types: ['Creature'], subtypes: ['Human'],
          amount: 2,
          // Fateful hour (CR 702.86 w minimalnym wymiarze): przy życiu ≤ 5
          // powstaje pięć tokenów zamiast dwóch.
          ifLifeAtMost: 5, amountIfCondition: 5,
        },
      ],
    },
    artId: 335,
    plan: 'Innistrad',
    support: { status: 'supported', limitations: [] },
  }),
  defineCard({
    id: 'evangel-of-synthesis', name: 'Evangel of Synthesis', set: 'BRO',
    types: ['Creature'], subtypes: ['Phyrexian', 'Human', 'Cleric'], colors: ['B', 'U'],
    power: 2, toughness: 3, manaCost: 2,
    oracleText: 'When this creature enters, draw a card, then discard a card.\nAs long as you\'ve drawn two or more cards this turn, this creature gets +1/+0 and has menace.',
    imageUri: 'https://cards.scryfall.io/large/front/e/8/e8b60003-a987-49b0-a0f8-bb825c97da4d.jpg?1783920031',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'enter_battlefield' },
        effect: [
          { type: 'draw_cards', amount: 1 },
          { type: 'discard_cards', amount: 1 },
        ],
      }),
      // Zdolność STATYCZNA (CR 604.3): buff obowiązuje, dopóki warunek jest
      // spełniony — przeliczany przy każdym odczycie statystyk, nie „do końca
      // tury\" (licznik dobrań zeruje się przy zmianie tury).
      createAbility({
        type: ABILITY_TYPE.static,
        condition: { minCardsDrawnThisTurn: 2 },
        pump: { power: 1, toughness: 0 },
        keywords: ['menace'],
      }),
    ],
    artId: 352,
    plan: 'Dominaria',
    support: { status: 'supported', limitations: [] },
  }),
  defineCard({
    id: 'woolly-loxodon', name: 'Woolly Loxodon', set: 'KTK',
    types: ['Creature'], subtypes: ['Elephant', 'Warrior'], colors: ['G'],
    power: 6, toughness: 7, manaCost: 7, keywords: ['morph'],
    oracleText: 'Morph {5}{G} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)',
    imageUri: 'https://cards.scryfall.io/large/front/a/8/a890c55a-8746-4233-b75a-19cc760c1e8e.jpg?1783939063',
    // Zwykły morph (CR 702.37) — obrót za koszt morph BEZ licznika +1/+1
    // (megamorph Segmented Krotiq kładzie licznik; to inne pole).
    morph: { cost: 3, morphCost: 6, colors: ['G'] },
    artId: 518,
    plan: 'Tarkir',
    support: { status: 'supported', limitations: [] },
  }),
  // Token Gather the Townsfolk (DDQ): 1/1 biały Human.
  // Definicja tokena — nie taliowalna (limited), jak token_goblin.
  defineCard({
    id: 'token_human', name: 'Human', set: null,
    types: ['Creature', 'Token'], subtypes: ['Human'], colors: ['W'],
    power: 1, toughness: 1, manaCost: 0,
    imageUri: 'https://cards.scryfall.io/large/front/1/5/15a620da-5056-4582-8da5-2c955c3f4c0d.jpg?1783937829',  // ddq
    support: { status: 'limited', limitations: ['token — nie można umieścić w talii'] },
  }),
  // Token Food (ELD): artefakt ze zdolnością „{2}, {T}, Sacrifice this
  // artifact: You gain 3 life\". Tworzony przez karty generujące Food.
  defineCard({
    id: 'token_food', name: 'Food', set: null,
    types: ['Artifact', 'Token'], subtypes: ['Food'], colors: [],
    manaCost: 0,
    abilities: [
      createAbility({
        type: ABILITY_TYPE.activated,
        cost: { mana: 2, tap: true, sacrificeSelf: true },
        effect: { type: 'gain_life', amount: 3 },
      }),
    ],
    imageUri: 'https://cards.scryfall.io/large/front/b/f/bf36408d-ed85-497f-8e68-d3a922c388a0.jpg?1783932477',  // teld
    support: { status: 'limited', limitations: ['token — nie można umieścić w talii'] },
  }),
  // Dziewiąty batch realnych kart (2026-08-03): Kor Cartographer (CMR),
  // Scorpion Sentinel (FIN), Dunland Crebain (LTR), Dragonbroods' Relic (TDM),
  // Secluded Steppe (DDO). Dane Oracle w docs/cards/.
  defineCard({
    id: 'kor-cartographer', name: 'Kor Cartographer', set: 'CMR',
    types: ['Creature'], subtypes: ['Kor', 'Scout'], colors: ['W'],
    power: 2, toughness: 2, manaCost: 4,
    oracleText: 'When this creature enters, you may search your library for a Plains card, put it onto the battlefield tapped, then shuffle.',
    imageUri: 'https://cards.scryfall.io/large/front/5/8/583ef638-1ea1-4301-bb86-78cb2b5f3aab.jpg?1783928881',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'enter_battlefield' },
        effect: {
          type: 'search_library_to_battlefield',
          qualifier: { subtypes: ['Plains'] },
          entersTapped: true,
        },
      }),
    ],
    artId: 537,
    plan: 'Zendikar',
    support: { status: 'supported', limitations: [] },
  }),
  defineCard({
    id: 'scorpion-sentinel', name: 'Scorpion Sentinel', set: 'FIN',
    types: ['Artifact', 'Creature'], subtypes: ['Robot', 'Scorpion'], colors: ['U'],
    power: 1, toughness: 4, manaCost: 2,
    oracleText: 'As long as you control seven or more lands, this creature gets +3/+0.',
    imageUri: 'https://cards.scryfall.io/large/front/0/8/08ab5220-e5c1-472e-8217-97fd60e1773c.jpg?1783906630',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.static,
        condition: { minLandsControlled: 7 },
        pump: { power: 3, toughness: 0 },
      }),
    ],
    artId: 67,
    plan: 'Final Fantasy',
    support: { status: 'supported', limitations: [] },
  }),
  defineCard({
    id: 'dunland-crebain', name: 'Dunland Crebain', set: 'LTR',
    types: ['Creature'], subtypes: ['Bird', 'Horror'], colors: ['B'],
    keywords: ['flying'], power: 1, toughness: 1, manaCost: 3,
    oracleText: 'Flying\nWhen this creature enters, amass Orcs 2.',
    imageUri: 'https://cards.scryfall.io/large/front/6/9/695c05ab-e46e-46c7-bd2e-ef0b2307e449.jpg?1783916311',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'enter_battlefield' },
        effect: {
          type: 'amass', amount: 2, subtype: 'Orc', name: 'Orc Army',
          cardId: 'token_orc_army', colors: ['B'],
        },
      }),
    ],
    artId: 1,
    plan: 'Śródziemie',
    support: { status: 'supported', limitations: [] },
  }),
  defineCard({
    id: 'dragonbroods-relic', name: "Dragonbroods' Relic", set: 'TDM',
    types: ['Artifact'], colors: ['G'], manaCost: 2,
    oracleText: '{T}, Tap an untapped creature you control: Add one mana of any color.\n{3}{W}{U}{B}{R}{G}, Sacrifice this artifact: Create a 4/4 Dragon creature token named Reliquary Dragon that\'s all colors. It has flying, lifelink, and "When this token enters, it deals 3 damage to any target." Activate only as a sorcery.',
    imageUri: 'https://cards.scryfall.io/large/front/3/d/3d634087-77ba-4543-aa7a-8a3774d69cd7.jpg?1783907343',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.activated,
        cost: { tap: true, tapCreature: true },
        effect: { type: 'add_mana', amount: 1 },
      }),
      createAbility({
        type: ABILITY_TYPE.activated,
        timing: 'sorcery',
        cost: { mana: 8, sacrificeSelf: true, colors: ['W', 'U', 'B', 'R', 'G'] },
        effect: {
          type: 'create_token', cardId: 'token_reliquary_dragon', name: 'Reliquary Dragon',
          kind: 'creature', power: 4, toughness: 4,
          colors: ['W', 'U', 'B', 'R', 'G'], types: ['Creature'], subtypes: ['Dragon'],
          keywords: ['flying', 'lifelink'], abilities: [BATCH9_RELIQUARY_DRAGON_ETB],
        },
      }),
    ],
    artId: 372,
    plan: 'Tarkir',
    support: { status: 'supported', limitations: [] },
  }),
  defineCard({
    id: 'secluded-steppe', name: 'Secluded Steppe', set: 'DDO',
    types: ['Land'], colors: [], entersTapped: true,
    oracleText: 'This land enters tapped.\n{T}: Add {W}.\nCycling {W} ({W}, Discard this card: Draw a card.)',
    imageUri: 'https://cards.scryfall.io/large/front/d/d/dd65f598-c8f5-4e53-a011-9742c66a1698.jpg?1783938631',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.activated,
        keyword: 'cycling',
        cost: { mana: 1, colors: ['W'] },
        cycling: { drawCards: 1 },
        effect: [],
      }),
    ],
    artId: 492,
    plan: 'Śródziemie',
    support: { status: 'supported', limitations: [] },
  }),
  // Tokeny Batch 9 — limited, nie są legalne w talii.
  defineCard({
    id: 'token_orc_army', name: 'Orc Army', set: null,
    types: ['Creature', 'Token'], subtypes: ['Orc', 'Army'], colors: ['B'],
    power: 0, toughness: 0, manaCost: 0,
    imageUri: 'https://cards.scryfall.io/large/front/2/f/2f8b43e8-dd89-452e-b572-8559e19fdea2.jpg?1783916049',  // tltr
    support: { status: 'limited', limitations: ['token — nie można umieścić w talii; statystyki rosną przez amass'] },
  }),
  defineCard({
    id: 'token_reliquary_dragon', name: 'Reliquary Dragon', set: null,
    types: ['Creature', 'Token'], subtypes: ['Dragon'], colors: ['W', 'U', 'B', 'R', 'G'],
    keywords: ['flying', 'lifelink'], power: 4, toughness: 4, manaCost: 0,
    abilities: [BATCH9_RELIQUARY_DRAGON_ETB],
    imageUri: 'https://cards.scryfall.io/large/front/4/4/44465924-8cc2-49a4-bc07-8dbae7570af6.jpg?1783906782',  // ttdm
    support: { status: 'limited', limitations: ['token — nie można umieścić w talii; tworzony przez Dragonbroods\' Relic'] },
  }),
  defineCard({
    id: 'token_elemental', name: 'Elemental', set: null,
    types: ['Creature', 'Token'], subtypes: ['Elemental'], colors: ['G'],
    power: 1, toughness: 1, manaCost: 0,
    imageUri: 'https://cards.scryfall.io/large/front/0/0/008695e6-6d6f-4c16-bf05-377e8cc5f5ff.jpg?1783911524',  // totj
    support: { status: 'limited', limitations: ['token — nie można umieścić w talii; P/T ustala efekt Tumbleweed Rising'] },
  }),
  // Dziesiąty batch realnych kart (2026-08-03): Goblin Piker (M11), Angel of
  // the Dawn (M19), Armored Skaab (ISD), Tumbleweed Rising (OTJ), Dawntreader
  // Elk (DKA). Dane Oracle w docs/cards/.
  defineCard({
    id: 'goblin-piker', name: 'Goblin Piker', set: 'M11',
    types: ['Creature'], subtypes: ['Goblin', 'Warrior'], colors: ['R'],
    power: 2, toughness: 1, manaCost: 2, oracleText: '',
    imageUri: 'https://cards.scryfall.io/large/front/8/5/85516547-2c1a-432b-9fc5-8d2c91156c77.jpg?1783941805',
    artId: 232,
    plan: 'Warhammer Fantasy',
    support: { status: 'supported', limitations: [] },
    notes: ['karta bez zdolności — standardowa istota 2/1'],
  }),
  defineCard({
    id: 'angel-of-the-dawn', name: 'Angel of the Dawn', set: 'M19',
    types: ['Creature'], subtypes: ['Angel'], colors: ['W'],
    keywords: ['flying'], power: 3, toughness: 3, manaCost: 5,
    oracleText: 'Flying\nWhen this creature enters, creatures you control get +1/+1 and gain vigilance until end of turn.',
    imageUri: 'https://cards.scryfall.io/large/front/f/4/f4bae0e4-1143-4dc4-afb1-e6b4201ff101.jpg?1783934610',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'enter_battlefield' },
        effect: { type: 'buff_creatures_you_control', power: 1, toughness: 1, keywords: ['vigilance'] },
      }),
    ],
    artId: 510,
    plan: 'Forgotten Realms',
    support: { status: 'supported', limitations: [] },
  }),
  defineCard({
    id: 'armored-skaab', name: 'Armored Skaab', set: 'ISD',
    types: ['Creature'], subtypes: ['Zombie', 'Warrior'], colors: ['U'],
    power: 1, toughness: 4, manaCost: 3,
    oracleText: 'When this creature enters, mill four cards.',
    imageUri: 'https://cards.scryfall.io/large/front/c/e/ce4d00f2-30e6-41d5-b997-c66350fe783c.jpg?1783940980',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'enter_battlefield' },
        effect: { type: 'mill_cards', amount: 4 },
      }),
    ],
    artId: 216,
    plan: 'Innistrad',
    support: { status: 'supported', limitations: [] },
    notes: ['mill nie kończy gry poza draw stepem; pusta biblioteka po prostu mieli mniej kart'],
  }),
  defineCard({
    id: 'tumbleweed-rising', name: 'Tumbleweed Rising', set: 'OTJ',
    types: ['Sorcery'], colors: ['G'], manaCost: 2,
    oracleText: 'Create an X/X green Elemental creature token, where X is the greatest power among creatures you control.\nPlot {2}{G}',
    imageUri: 'https://cards.scryfall.io/large/front/2/7/275d2d2a-ef85-48c9-919d-bc62cdad8a10.jpg?1783911802',
    plot: { cost: 3 },
    spell: {
      timing: 'sorcery', targets: [],
      effects: [{
        type: 'create_token', cardId: 'token_elemental', name: 'Elemental',
        kind: 'creature', power: 'greatest_power_you_control',
        toughness: 'greatest_power_you_control', colors: ['G'],
        types: ['Creature'], subtypes: ['Elemental'], amount: 1,
      }],
    },
    artId: 294,
    plan: 'Thunder Junction',
    support: { status: 'supported', limitations: [] },
    notes: ['Plot działa jako deterministyczna akcja z ręki: zapłać {2}{G}, exile, a w późniejszej fazie main rzuć bez many; X to największa moc własnego stwora'],
  }),
  defineCard({
    id: 'dawntreader-elk', name: 'Dawntreader Elk', set: 'DKA',
    types: ['Creature'], subtypes: ['Elk'], colors: ['G'],
    power: 2, toughness: 2, manaCost: 2,
    oracleText: '{G}, Sacrifice this creature: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.',
    imageUri: 'https://cards.scryfall.io/large/front/1/2/127c969b-1c9a-4265-af0e-5b9dbe136064.jpg?1783940809',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.activated,
        cost: { mana: 1, sacrificeSelf: true, colors: ['G'] },
        effect: { type: 'search_library_to_battlefield', qualifier: { types: ['Basic', 'Land'] }, entersTapped: true },
      }),
    ],
    artId: 481,
    plan: 'Wiedźmin',
    support: { status: 'supported', limitations: [] },
  }),
  // Jedenasty batch realnych kart (2026-08-03): Underdark Explorer (CLB),
  // Angel's Feather (M11), Release the Ants (MOR), Porcelain Legionnaire
  // (NPH), Curate (BRO), Canonized in Blood (LCI). Dane Oracle w docs/cards/.
  defineCard({
    id: 'underdark-explorer', name: 'Underdark Explorer', set: 'CLB',
    types: ['Creature'], subtypes: ['Lizard', 'Warrior'], colors: ['B'],
    keywords: ['menace'], power: 5, toughness: 3, manaCost: 5,
    oracleText: 'Menace (This creature can\'t be blocked except by two or more creatures.)\nWhen this creature enters, you take the initiative.',
    imageUri: 'https://cards.scryfall.io/large/front/a/2/a2bf9736-b5f5-4fd4-8406-9f57fefd86e7.jpg?1783922750',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'enter_battlefield' },
        effect: [{ type: 'take_initiative' }],
      }),
    ],
    artId: 44,
    plan: 'Forgotten Realms',
    support: { status: 'supported', limitations: [] },
  }),
  defineCard({
    id: 'angels-feather', name: 'Angel\'s Feather', set: 'M11',
    types: ['Artifact'], colors: [], manaCost: 2,
    oracleText: 'Whenever a player casts a white spell, you may gain 1 life.',
    imageUri: 'https://cards.scryfall.io/large/front/e/f/ef2caa08-1b25-4ace-9204-068777f82e69.jpg?1783941792',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        // Temat 2: „you may gain 1 life" — decyzja kontrolera (tak/nie,
        // resolve_optional_trigger_choice); wcześniej deterministyczne „tak".
        trigger: { event: 'player_casts_spell', condition: { spellColorsInclude: ['W'] }, mayFire: true },
        effect: [{ type: 'gain_life', amount: 1 }],
      }),
    ],
    artId: 223,
    plan: 'Śródziemie',
    support: { status: 'supported', limitations: [] },
  }),
  defineCard({
    id: 'release-the-ants', name: 'Release the Ants', set: 'MOR',
    types: ['Instant'], colors: ['R'], manaCost: 2,
    oracleText: 'Release the Ants deals 1 damage to any target. Clash with an opponent. If you win, return Release the Ants to its owner\'s hand. (Each clashing player reveals the top card of their library, then puts that card on their choice of the top or bottom. A player wins if their card had a greater mana value.)',
    imageUri: 'https://cards.scryfall.io/large/front/1/b/1b6f1afb-2451-4611-ac3e-3513a4651719.jpg?1783942785',
    spell: {
      timing: 'instant',
      targets: [{ type: 'any_target' }],
      effects: [
        { type: 'damage', amount: 1 },
        { type: 'clash', returnToHandOnWin: true },
      ],
    },
    artId: 89,
    plan: 'Lorwyn',
    support: { status: 'supported', limitations: [] },
    notes: ['clash: obaj gracze realnie wybierają wierzch/spód swojej odsłoniętej karty (resolve_clash_choice); pusta biblioteka przegrywa clash', 'wygrany czar wraca do ręki właściciela; remis i przegrana = grób'],
  }),
  defineCard({
    id: 'porcelain-legionnaire', name: 'Porcelain Legionnaire', set: 'NPH',
    types: ['Artifact', 'Creature'], subtypes: ['Phyrexian', 'Soldier'], colors: ['W'],
    keywords: ['first_strike'], power: 3, toughness: 1, manaCost: 2, phyrexianManaCost: 1,
    oracleText: '({W/P} can be paid with either {W} or 2 life.)\nFirst strike',
    imageUri: 'https://cards.scryfall.io/large/front/2/6/2616aa0e-8413-4e63-877c-bffd5263f552.jpg?1783941324',
    artId: 345,
    plan: 'Mirrodin',
    support: { status: 'supported', limitations: [] },
    notes: ['phyrexian mana: gracz wybiera dla każdego symbolu {W/P} — mana albo 2 życia (warianty komendy cast_permanent, UI grupuje je jak X)', 'first strike: dwa przebiegi obrażeń w combat (najpierw first strike, potem SBA i zwykłe) — bez double strike'],
  }),
  defineCard({
    id: 'curate', name: 'Curate', set: 'BRO',
    types: ['Instant'], colors: ['U'], manaCost: 2,
    oracleText: 'Surveil 2. (Look at the top two cards of your library, then put any number of them into your graveyard and the rest on top of your library in any order.)\nDraw a card.',
    imageUri: 'https://cards.scryfall.io/large/front/f/e/fe8c3fc8-c1cc-4dfc-94cb-1538bff9d09a.jpg?1783920114',
    spell: {
      timing: 'instant',
      targets: [],
      effects: [
        { type: 'surveil', amount: 2 },
        { type: 'draw_cards', amount: 1 },
      ],
    },
    artId: 302,
    plan: 'Forgotten Realms',
    support: { status: 'supported', limitations: [] },
    notes: ['surveil jest realną, blokującą decyzją (resolve_surveil — jak scry): gracz wybiera karty do grobu ORAZ kolejność reszty na wierzchu („in any order")', 'dobranie czeka na decyzję surveil (czar wisi na stosie do resolve_surveil)'],
  }),
  defineCard({
    id: 'canonized-in-blood', name: 'Canonized in Blood', set: 'LCI',
    types: ['Enchantment'], colors: ['B'], manaCost: 2,
    oracleText: 'At the beginning of your end step, if you descended this turn, put a +1/+1 counter on target creature you control. (You descended if a permanent card was put into your graveyard from anywhere.)\n{5}{B}{B}, Sacrifice this enchantment: Create a 4/3 white and black Vampire Demon creature token with flying.',
    imageUri: 'https://cards.scryfall.io/large/front/3/8/384b6892-5dfc-4607-b511-cf83544a9357.jpg?1783913782',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: {
          event: 'end_step',
          condition: { descendedThisTurn: true },
          requiresTarget: { type: 'creature_you_control' },
        },
        effect: [{ type: 'add_counter', counter: '+1/+1', amount: 1 }],
      }),
      createAbility({
        type: ABILITY_TYPE.activated,
        cost: { mana: 7, sacrificeSelf: true, colors: ['B', 'B'] },
        effect: [{
          type: 'create_token', cardId: 'token_vampire_demon', name: 'Vampire Demon',
          kind: 'creature', power: 4, toughness: 3, colors: ['W', 'B'],
          types: ['Creature'], subtypes: ['Vampire', 'Demon'], keywords: ['flying'],
        }],
      }),
    ],
    artId: 526,
    plan: 'Ixalan',
    support: { status: 'supported', limitations: [] },
  }),
  // Token Canonized in Blood (LCI): 4/3 czarno-biały Vampire Demon z flying.
  // Definicja tokena — nie taliowalna (limited), jak token_goblin.
  defineCard({
    id: 'token_vampire_demon', name: 'Vampire Demon', set: null,
    types: ['Creature', 'Token'], subtypes: ['Vampire', 'Demon'], colors: ['W', 'B'],
    keywords: ['flying'], power: 4, toughness: 3, manaCost: 0,
    imageUri: 'https://cards.scryfall.io/large/front/3/0/3005eb0a-5c96-4a07-a6b9-a907d1095cdf.jpg?1783913605',  // tlci
    support: { status: 'limited', limitations: ['token — nie można umieścić w talii; tworzony przez Canonized in Blood'] },
  }),
  // Token lochu Undercity (Catacombs): 4/1 czarny Skeleton z menace.
  // Definicja tokena — nie taliowalna (limited), jak token_goblin.
  defineCard({
    id: 'token_skeleton', name: 'Skeleton', set: null,
    types: ['Creature', 'Token'], subtypes: ['Skeleton'], colors: ['B'],
    keywords: ['menace'], power: 4, toughness: 1, manaCost: 0,
    imageUri: 'https://cards.scryfall.io/large/front/c/f/cf4c245f-af2f-46a7-81f3-670a04940901.jpg?1783922321',  // tclb
    support: { status: 'limited', limitations: ['token — nie można umieścić w talii; tworzony przez pokój Catacombs lochu Undercity'] },
  }),
  // Dwunasty batch realnych kart (2026-08-03): Grave Exchange (AVR),
  // Hysterical Blindness (ISD), Barkform Harvester (BLB), Undead Servant
  // (ORI), Rage of Purphoros (THS). Dane Oracle w docs/cards/.
  defineCard({
    id: 'grave-exchange', name: 'Grave Exchange', set: 'AVR',
    types: ['Sorcery'], colors: ['B'], manaCost: 6,
    oracleText: 'Return target creature card from your graveyard to your hand. Target player sacrifices a creature of their choice.',
    imageUri: 'https://cards.scryfall.io/large/front/1/4/14f420c4-801b-48e7-a10b-de44a2417265.jpg?1783940698',
    spell: {
      timing: 'sorcery',
      targets: [{ type: 'creature_card_in_graveyard' }, { type: 'player' }],
      effects: [
        { type: 'return_creature_card_to_hand', targetIndex: 0 },
        // Wybór „of their choice\" należy do CELU (blokująca decyzja
        // resolve_sacrifice_choice); boty odpowiadają deterministycznie.
        { type: 'player_sacrifices_creature', targetIndex: 1 },
      ],
    },
    artId: 101,
    plan: 'Innistrad',
    support: { status: 'supported', limitations: [] },
    notes: ['gracz bez stworów nie poświęca niczego; wybór poświęcanego stwora jest decyzją CELU (resolve_sacrifice_choice)'],
  }),
  defineCard({
    id: 'hysterical-blindness', name: 'Hysterical Blindness', set: 'ISD',
    types: ['Instant'], colors: ['U'], manaCost: 3,
    oracleText: 'Creatures your opponents control get -4/-0 until end of turn.',
    imageUri: 'https://cards.scryfall.io/large/front/5/a/5aeaa757-e3b0-4606-a689-e8a20a686c3a.jpg?1783940973',
    spell: {
      timing: 'instant',
      targets: [],
      effects: [{ type: 'buff_opponents_creatures', power: -4, toughness: 0 }],
    },
    artId: 282,
    plan: 'Innistrad',
    support: { status: 'supported', limitations: [] },
    notes: ['globalny -4/-0 do końca tury na stworach przeciwnika (ujemna moc nie zabija stwora)'],
  }),
  defineCard({
    id: 'barkform-harvester', name: 'Barkform Harvester', set: 'BLB',
    types: ['Artifact', 'Creature'], subtypes: ['Shapeshifter'], colors: [],
    power: 2, toughness: 3, manaCost: 3, keywords: ['reach', 'changeling'],
    oracleText: 'Changeling (This card is every creature type.)\nReach\n{2}: Put target card from your graveyard on the bottom of your library.',
    imageUri: 'https://cards.scryfall.io/large/front/f/7/f77049a6-0f22-415b-bc89-20bcb32accf6.jpg?1783910787',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.activated,
        cost: { mana: 2 },
        targets: [{ type: 'card_in_graveyard' }],
        effect: { type: 'put_graveyard_card_on_bottom' },
      }),
    ],
    artId: 233,
    plan: 'Bloomburrow',
    support: { status: 'supported', limitations: [] },
    notes: ['changeling reprezentowany jako keyword (żadna mechanika katalogu nie pyta o typy stwora)'],
  }),
  defineCard({
    id: 'undead-servant', name: 'Undead Servant', set: 'ORI',
    types: ['Creature'], subtypes: ['Zombie'], colors: ['B'],
    power: 3, toughness: 2, manaCost: 4,
    oracleText: 'When this creature enters, create a 2/2 black Zombie creature token for each card named Undead Servant in your graveyard.',
    imageUri: 'https://cards.scryfall.io/large/front/3/6/36afdfd4-8db7-45b6-9b6d-b9293fe6c26d.jpg?1783938335',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'enter_battlefield' },
        effect: [{
          type: 'create_token', cardId: 'token_zombie', name: 'Zombie',
          kind: 'creature', power: 2, toughness: 2, colors: ['B'],
          types: ['Creature'], subtypes: ['Zombie'],
          amount: 'cards_named_in_graveyard', countCardId: 'undead-servant',
        }],
      }),
    ],
    artId: 128,
    plan: 'Dominaria',
    support: { status: 'supported', limitations: [] },
    notes: ['liczba tokenów = liczba innych kopii Undead Servant w grobie kontrolera (token Zombie nie jest liczony)'],
  }),
  defineCard({
    id: 'rage-of-purphoros', name: 'Rage of Purphoros', set: 'THS',
    types: ['Sorcery'], colors: ['R'], manaCost: 5,
    oracleText: 'Rage of Purphoros deals 4 damage to target creature. It can\'t be regenerated this turn. Scry 1. (Look at the top card of your library. You may put that card on the bottom.)',
    imageUri: 'https://cards.scryfall.io/large/front/1/e/1e249f31-cc67-4d0c-9db5-962d10cf74ca.jpg?1783939756',
    spell: {
      timing: 'sorcery',
      targets: [{ type: 'creature' }],
      effects: [
        { type: 'damage', amount: 4 },
        // CR 701.12b: „It can't be regenerated this turn" — flaga trwała
        // do końca tury ustawiana na celu (effects.js). tryRegenerate
        // (SBA) i destroy_permanent (efekty) sprawdzają listę
        // state.cantBeRegeneratedThisTurn, więc tarcza regeneracji
        // (regenerate albo drugi efekt) nie chroni tego stwora.
        { type: 'cant_be_regenerated_this_turn' },
        { type: 'scry', amount: 1 },
      ],
    },
    artId: 401,
    plan: 'Theros',
    support: { status: 'supported', limitations: [] },
    notes: ['scry 1 to blokująca decyzja'],
  }),
  // Token Undead Servant (ORI/M20): 2/2 czarny Zombie. Definicja tokena —
  // nie taliowalna (limited), jak token_goblin.
  defineCard({
    id: 'token_zombie', name: 'Zombie', set: null,
    types: ['Creature', 'Token'], subtypes: ['Zombie'], colors: ['B'],
    power: 2, toughness: 2, manaCost: 0,
    imageUri: 'https://cards.scryfall.io/large/front/7/c/7c60e495-8fb7-43bb-b11d-52882c0246bc.jpg?1783937829',  // ddq
    support: { status: 'limited', limitations: ['token — nie można umieścić w talii; tworzony przez Undead Servant'] },
  }),
  // Trzynasty batch realnych kart (2026-08-03): Scorned Villager (DKA),
  // Curse of the Pierced Heart (ISD), Emissary Escort (EOE), Snarling Wolf
  // (VOW), Negate (M20). Dane Oracle w docs/cards/.
  defineCard({
    id: 'scorned-villager', name: 'Scorned Villager', set: 'DKA',
    types: ['Creature'], subtypes: ['Human', 'Werewolf'], colors: ['G'],
    power: 1, toughness: 1, manaCost: 2, keywords: ['transform'],
    oracleText: '{T}: Add {G}.\nAt the beginning of each upkeep, if no spells were cast last turn, transform this creature.',
    imageUri: 'https://cards.scryfall.io/large/front/6/f/6f35e364-81d9-4888-993b-acc7a53d963c.jpg?1783940808',
    transformTo: 'moonscarred-werewolf',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.activated,
        cost: { tap: true },
        effect: { type: 'add_mana', amount: 1 },
      }),
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'upkeep', condition: { noSpellsLastTurn: true, eachUpkeep: true } },
        effect: [{ type: 'transform' }],
      }),
    ],
    artId: 443,
    plan: 'Innistrad',
    support: { status: 'supported', limitations: [] },
    notes: ['transform tylko przez trigger upkeep (bez ręcznego obrotu)'],
  }),
  // Tylna strona Scorned Villager — Moonscarred Werewolf (DKA). Limited,
  // nie taliowalna (jak krallenhorde-wantons).
  defineCard({
    id: 'moonscarred-werewolf', name: 'Moonscarred Werewolf', set: 'DKA',
    types: ['Creature'], subtypes: ['Werewolf'], colors: ['G'],
    power: 2, toughness: 2, manaCost: 2, keywords: ['transform', 'vigilance'],
    oracleText: 'Vigilance\n{T}: Add {G}{G}.\nAt the beginning of each upkeep, if a player cast two or more spells last turn, transform this creature.',
    imageUri: 'https://cards.scryfall.io/large/back/6/f/6f35e364-81d9-4888-993b-acc7a53d963c.jpg?1783940808',
    transformTo: 'scorned-villager',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.activated,
        cost: { tap: true },
        effect: { type: 'add_mana', amount: 2 },
      }),
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'upkeep', condition: { minSpellsLastTurn: 2, eachUpkeep: true } },
        effect: [{ type: 'transform' }],
      }),
    ],
    artId: 485,
    plan: 'Innistrad',
    support: { status: 'limited', limitations: ['tylna strona transform — nie można umieścić w talii'] },
  }),
  defineCard({
    id: 'curse-of-the-pierced-heart', name: 'Curse of the Pierced Heart', set: 'ISD',
    types: ['Enchantment'], subtypes: ['Aura', 'Curse'], colors: ['R'], manaCost: 2,
    oracleText: 'Enchant player\nAt the beginning of enchanted player\'s upkeep, this Aura deals 1 damage to that player or a planeswalker that player controls.',
    imageUri: 'https://cards.scryfall.io/large/front/7/1/71010182-c004-4d18-adab-80319cd1e625.jpg?1783940940',
    aura: { enchant: 'player' },
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'upkeep', condition: { enchantedPlayerUpkeep: true } },
        effect: [{ type: 'damage_enchanted_player', amount: 1 }],
      }),
    ],
    artId: 91,
    plan: 'Innistrad',
    support: { status: 'supported', limitations: [] },
    notes: ['„Enchant player": zaczarowany gracz wybierany przy rzucaniu (decyzja gracza); planeswalkery nie istnieją w engine, więc 1 obrażeń zawsze trafia zaczarowanego gracza'],
  }),
  defineCard({
    id: 'emissary-escort', name: 'Emissary Escort', set: 'EOE',
    types: ['Artifact', 'Creature'], subtypes: ['Robot', 'Soldier'], colors: ['U'],
    power: 0, toughness: 4, manaCost: 2,
    oracleText: 'This creature gets +X/+0, where X is the greatest mana value among other artifacts you control.',
    imageUri: 'https://cards.scryfall.io/large/front/b/5/b52ba87f-3ac7-4f32-901c-d089df979f94.jpg?1783905982',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.static,
        pump: { power: 'greatest_mana_among_other_artifacts', toughness: 0 },
      }),
    ],
    artId: 100,
    plan: 'The Edge',
    support: { status: 'supported', limitations: [] },
    notes: ['X = największa mana value wśród INNYCH artefaktów kontrolera (bez samego źródła), przeliczane przy odczycie statystyk (CR 604.3)'],
  }),
  defineCard({
    id: 'snarling-wolf', name: 'Snarling Wolf', set: 'VOW',
    types: ['Creature'], subtypes: ['Wolf'], colors: ['G'],
    power: 1, toughness: 1, manaCost: 1,
    oracleText: '{1}{G}: This creature gets +2/+2 until end of turn. Activate only once each turn.',
    imageUri: 'https://cards.scryfall.io/large/front/e/c/ecd271d7-a3c8-4448-b8e2-bcef5d7e9118.jpg?1783924801',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.activated,
        cost: { mana: 2, colors: ['G'] },
        effect: { type: 'pump', power: 2, toughness: 2 },
        oncePerTurn: true,
      }),
    ],
    artId: 214,
    plan: 'Innistrad',
    support: { status: 'supported', limitations: [] },
    notes: ['„activate only once each turn" przez limit aktywacji zdolności (reset co turę)'],
  }),
  defineCard({
    id: 'negate', name: 'Negate', set: 'M20',
    types: ['Instant'], colors: ['U'], manaCost: 2,
    oracleText: 'Counter target noncreature spell.',
    imageUri: 'https://cards.scryfall.io/large/front/3/3/33b83158-78b4-425e-8379-be3ef038295c.jpg?1783933006',
    spell: {
      timing: 'instant',
      targets: [{ type: 'noncreature_spell_on_stack' }],
      effects: [{ type: 'counter_spell' }],
    },
    artId: 461,
    plan: 'Wiedźmin',
    support: { status: 'supported', limitations: [] },
    notes: ['„noncreature spell" = czar na stosie niebędący stworem (instants/sorceries i czyste aury); cast bestow (stwór) nie jest celem Negate'],
  }),

  // =========================================================================
  // Batch 14 (10 kart, 2026-08-04)
  // =========================================================================

  // 1. Ainok Tracker (KTK) — First strike + Morph {4}{R}
  defineCard({
    id: 'ainok-tracker', name: 'Ainok Tracker', set: 'KTK',
    types: ['Creature'], subtypes: ['Dog', 'Scout'], colors: ['R'],
    power: 3, toughness: 3, manaCost: 6,
    oracleText: 'First strike\nMorph {4}{R} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)',
    imageUri: 'https://cards.scryfall.io/large/front/0/f/0ff9400d-4842-471f-bf7e-3b21df352e0a.jpg?1783939076',
    keywords: ['first_strike'],
    morph: { cost: 3, morphCost: 5, colors: ['R'] },
    artId: 68,
    plan: 'Tarkir',
    support: { status: 'supported', limitations: [] },
  }),

  // 2. Spectral Prison (AVR) — Aura: doesn't untap, sac on targeting
  defineCard({
    id: 'spectral-prison', name: 'Spectral Prison', set: 'AVR',
    types: ['Enchantment'], colors: ['U'], manaCost: 2,
    oracleText: "Enchant creature\nEnchanted creature doesn't untap during its controller's untap step.\nWhen enchanted creature becomes the target of a spell, sacrifice this Aura.",
    imageUri: 'https://cards.scryfall.io/large/front/8/9/89d141bc-7307-40c2-a7ed-427caaec5efc.jpg?1783940711',
    aura: { keywords: [] },
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'enter_battlefield' },
        effect: { type: 'lock_untap' },
      }),
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'aura_host_targeted_by_spell' },
        effect: { type: 'sacrifice_permanent' },
      }),
    ],
    artId: 181,
    plan: 'Innistrad',
    support: { status: 'supported', limitations: [] },
    notes: ['lock_untap: zablokowane do końca tury (jak Entrancing Lyre); sacrifice on targeting przez aura_host_targeted_by_spell trigger'],
  }),

  // 3. Raucous Carnival (DSK) — Conditional entersTapped based on life
  defineCard({
    id: 'raucous-carnival', name: 'Raucous Carnival', set: 'DSK',
    types: ['Land'], colors: [],
    oracleText: "This land enters tapped unless a player has 13 or less life.\n{T}: Add {R} or {W}.",
    imageUri: 'https://cards.scryfall.io/large/front/3/6/3604a211-9bf7-474e-bd78-32a862f4259c.jpg?1783909427',
    entersTapped: true,
    entersTappedCondition: { type: 'player_life_at_most', amount: 13 },
    artId: 48,
    plan: 'Duskmourn',
    support: { status: 'supported', limitations: [] },
  }),

  // 4. Cloudbound Moogle (FIN) — Flying, ETB +1/+1 counter, Plainscycling
  defineCard({
    id: 'cloudbound-moogle', name: 'Cloudbound Moogle', set: 'FIN',
    types: ['Creature'], subtypes: ['Moogle'], colors: ['W'],
    power: 2, toughness: 3, manaCost: 5,
    oracleText: "Flying\nWhen this creature enters, put a +1/+1 counter on target creature.\nPlainscycling {2} ({2}, Discard this card: Search your library for a Plains card, reveal it, put it into your hand, then shuffle.)",
    imageUri: 'https://cards.scryfall.io/large/front/7/3/7387bca7-f496-45da-a0ac-6be049303a8f.jpg?1783906653',
    keywords: ['flying'],
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'enter_battlefield', requiresTarget: { type: 'creature' } },
        effect: { type: 'add_counter', counter: '+1/+1', amount: 1 },
      }),
      createAbility({
        type: ABILITY_TYPE.activated,
        cost: { mana: 2 },
        cycling: { subtypes: ['Plains'] },
        effect: {},
      }),
    ],
    artId: 86,
    plan: 'Final Fantasy',
    support: { status: 'supported', limitations: [] },
  }),

  // 5. Insatiable Appetite (ELD) — Instant, may sacrifice Food for +5/+5
  defineCard({
    id: 'insatiable-appetite', name: 'Insatiable Appetite', set: 'ELD',
    types: ['Instant'], colors: ['G'], manaCost: 2,
    oracleText: "You may sacrifice a Food. If you do, target creature gets +5/+5 until end of turn. Otherwise, that creature gets +3/+3 until end of turn.",
    imageUri: 'https://cards.scryfall.io/large/front/2/3/2357f2db-00c2-41f6-bd04-93f905dea461.jpg?1783932609',
    spell: {
      timing: 'instant',
      targets: [{ type: 'creature' }],
      effects: [{ type: 'sacrifice_food_choice' }],
    },
    artId: 386,
    plan: 'Eldraine',
    support: { status: 'supported', limitations: [] },
    notes: ['Food tokens: gracz musi mieć token Food na bitwisku; jeśli nie ma — automatycznie +3/+3'],
  }),

  // 6. Stirring Bard (CLB) — Defender, initiative, grant menace + haste
  defineCard({
    id: 'stirring-bard', name: 'Stirring Bard', set: 'CLB',
    types: ['Creature'], subtypes: ['Dragon', 'Bard'], colors: ['R'],
    power: 0, toughness: 4, manaCost: 4,
    oracleText: "Defender\nWhen this creature enters, you take the initiative.\nMantle of Inspiration — {T}: Target creature gains menace and haste until end of turn.",
    imageUri: 'https://cards.scryfall.io/large/front/d/0/d06d9d83-d1e6-4499-a1ac-6f865159f6b6.jpg?1783922729',
    keywords: ['defender'],
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'enter_battlefield' },
        effect: { type: 'take_initiative' },
      }),
      createAbility({
        type: ABILITY_TYPE.activated,
        cost: { tap: true },
        effect: { type: 'grant_keywords_until_end_of_turn', keywords: ['menace', 'haste'] },
        targets: [{ type: 'creature' }],
      }),
    ],
    artId: 251,
    plan: 'Forgotten Realms',
    support: { status: 'supported', limitations: [] },
  }),

  // 7. Hunter's Blowgun (LCI) — Equipment, conditional deathtouch/reach
  defineCard({
    id: 'hunters-blowgun', name: "Hunter's Blowgun", set: 'LCI',
    // M100/E10 (P10): podtyp wg Oracle (Artifact — Equipment) — dotąd tile
    // pokazywał gołe „Artifact", a typ Equipment jest regułowo istotny.
    types: ['Artifact'], subtypes: ['Equipment'], colors: [], manaCost: 1,
    oracleText: "Equipped creature gets +1/+1.\nEquipped creature has deathtouch during your turn. Otherwise, it has reach.\nEquip {2} ({2}: Attach to target creature you control. Equip only as a sorcery.)",
    imageUri: 'https://cards.scryfall.io/large/front/3/3/3348abe7-6aa3-47f7-8203-a15f75007e33.jpg?1783913724',
    equipment: {
      equip: 2,
      pump: { power: 1, toughness: 1 },
      keywords: [],
      conditionalKeywords: [
        { condition: { activePlayerIsController: true }, keywords: ['deathtouch'] },
        { condition: { activePlayerIsController: false }, keywords: ['reach'] },
      ],
    },
    abilities: [
      createAbility({
        type: ABILITY_TYPE.activated,
        keyword: 'equip',
        cost: { mana: 2 },
        effect: {},
      }),
    ],
    artId: 267,
    plan: 'Ixalan',
    support: { status: 'supported', limitations: [] },
    notes: ['deathtouch w walce: obrażenia ≥1 od stwora z deathtouch niszczą cel (SBA); warunkowe keywordy wg whose turn'],
  }),

  // 8. Geological Appraiser (LCI) — ETB if cast, discover 3
  defineCard({
    id: 'geological-appraiser', name: 'Geological Appraiser', set: 'LCI',
    types: ['Creature'], subtypes: ['Human', 'Artificer'], colors: ['R'],
    power: 3, toughness: 2, manaCost: 4,
    oracleText: "When this creature enters, if you cast it, discover 3. (Exile cards from the top of your library until you exile a nonland card with mana value 3 or less. Cast it without paying its mana cost or put it into your hand. Put the rest on the bottom in a random order.)",
    imageUri: 'https://cards.scryfall.io/large/front/7/f/7f9c1a82-695b-4df2-8e51-2d71a62e7baf.jpg?1783913759',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'enter_battlefield', condition: { ifCast: true } },
        effect: { type: 'discover', amount: 3 },
      }),
    ],
    artId: 382,
    plan: 'Ixalan',
    support: { status: 'supported', limitations: [] },
    notes: ['discover: odsłanianie do MV≤3, rzuć bez kosztu albo do ręki, reszta na spód; blokująca decyzja resolve_discover_choice'],
  }),

  // 9. Lodestone Needle // Guidestone Compass (LCI) — DFC Transform
  defineCard({
    id: 'lodestone-needle', name: 'Lodestone Needle', set: 'LCI',
    types: ['Artifact'], colors: ['U'], manaCost: 2,
    oracleText: "Flash\nWhen this artifact enters, tap up to one target artifact or creature and put two stun counters on it.\nCraft with artifact {2}{U} ({2}{U}, Exile this artifact, Exile another artifact you control or an artifact card from your graveyard: Return this card transformed under its owner's control. Craft only as a sorcery.)",
    imageUri: 'https://cards.scryfall.io/large/front/d/e/dedd7a22-92e2-41fd-aa80-944c69653a5e.jpg?1783913799',
    keywords: ['flash'],
    transformTo: 'guidestone-compass',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        // „tap UP TO ONE target artifact or creature" — cel opcjonalny
        // (CR 601.2c); bez `optional` gracz musiał wskazać cel, nawet gdy
        // jedynym kandydatem był jego własny permanent (M105/B5).
        trigger: { event: 'enter_battlefield', requiresTarget: { type: 'artifact_or_creature', optional: true } },
        effect: [
          { type: 'tap_permanent' },
          { type: 'add_counter', counter: 'stun', amount: 2 },
        ],
      }),
      createAbility({
        type: ABILITY_TYPE.activated,
        keyword: 'craft',
        cost: { mana: 3 },
        timing: 'sorcery',
        effect: { type: 'craft_transform' },
      }),
    ],
    artId: 483,
    plan: 'Ixalan',
    support: { status: 'supported', limitations: [] },
  }),
  // Guidestone Compass — back face of Lodestone Needle. Tyły kart
  // dwustronnych NIE są osobnymi pozycjami do talii (poza bitwiskiem karta
  // istnieje tylko stroną frontową, CR 711.4) — bug ze stołu 2026-08-05:
  // backside na ręku nie da się rzucić. Jak przy Shiva/tokenach: limited
  // (walidacja talii i kreator odrzucają ten wpis).
  defineCard({
    id: 'guidestone-compass', name: 'Guidestone Compass', set: 'LCI',
    types: ['Artifact'], colors: ['U'],
    oracleText: "{1}, {T}: Target creature you control explores. Activate only as a sorcery.",
    imageUri: 'https://cards.scryfall.io/large/back/d/e/dedd7a22-92e2-41fd-aa80-944c69653a5e.jpg?1783913799',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.activated,
        cost: { mana: 1, tap: true },
        timing: 'sorcery',
        effect: { type: 'explore' },
        targets: [{ type: 'creature_you_control' }],
      }),
    ],
    artId: 484,
    plan: 'Ixalan',
    support: { status: 'limited', limitations: ['Tył karty dwustronnej (Lodestone Needle) — nie do talii ani kreatora; do gry trafia wyłącznie przez transform frontu'] },
    notes: ['Explore: reveal top, if land → hand, else +1/+1 counter + choose back/graveyard; blokująca decyzja resolve_explore_choice'],
  }),

  // 10. Panic Spellbomb (SOM) — Artifact, sacrifice for can't block, dies draw
  defineCard({
    id: 'panic-spellbomb', name: 'Panic Spellbomb', set: 'SOM',
    types: ['Artifact'], colors: [], manaCost: 1,
    oracleText: "{T}, Sacrifice this artifact: Target creature can't block this turn.\nWhen this artifact is put into a graveyard from the battlefield, you may pay {R}. If you do, draw a card.",
    imageUri: 'https://cards.scryfall.io/large/front/e/9/e9a29832-8630-498a-9ac3-bc709a6dc95d.jpg?1783941699',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.activated,
        cost: { tap: true, sacrificeSelf: true },
        effect: { type: 'cant_block' },
        targets: [{ type: 'creature' }],
      }),
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'dies', payMana: 1, payColors: ['R'] },
        effect: { type: 'draw_cards', amount: 1 },
      }),
    ],
    artId: 542,
    plan: 'Mirrodin',
    support: { status: 'supported', limitations: [] },
    notes: ['can\'t block = tymczasowy znacznik do cleanup; dies trigger z opcjonalną płatnością {R}'],
  }),

  // =========================================================================
  // Batch 15 (10 kart, 2026-08-04) — lista właściciela
  // Howl of the Night Pack, Goblin Picker, Dragon Arch, Trigon of Corruption,
  // Aerith Rescue Mission, Esper Stormblade, Forge Devil, Shatter,
  // Sweet Oblivion, Village Rites. Dane Oracle pobrane ze Scryfall
  // (docs/cards/scryfall-*.json), artId ze słownika kolekcji.
  // =========================================================================

  // 1. Howl of the Night Pack (M10) — Sorcery, token Wolf za każdy Forest
  defineCard({
    id: 'howl-of-the-night-pack', name: 'Howl of the Night Pack', set: 'M10',
    types: ['Sorcery'], colors: ['G'], manaCost: 7,
    oracleText: 'Create a 2/2 green Wolf creature token for each Forest you control.',
    imageUri: 'https://cards.scryfall.io/large/front/a/3/a37ba2c4-dd92-4b23-a830-5dbabc9a972b.jpg?1783942361',
    spell: {
      timing: 'sorcery', targets: [],
      effects: [{
        type: 'create_token', cardId: 'token_wolf', name: 'Wolf',
        kind: 'creature', power: 2, toughness: 2, colors: ['G'],
        types: ['Creature'], subtypes: ['Wolf'],
        // Liczba tokenów = liczba kontrolowanych landów z podtypem Forest
        // („for each Forest you control") — źródło dynamiczne.
        amount: 'lands_with_subtype_you_control', subtype: 'Forest',
      }],
    },
    artId: 37,
    plan: 'Wiedźmin',
    support: { status: 'supported', limitations: [] },
  }),

  // 2. Goblin Picker (DMU) — {R},{T},Discard a card: Draw a card
  defineCard({
    id: 'goblin-picker', name: 'Goblin Picker', set: 'DMU',
    types: ['Creature'], subtypes: ['Goblin'], colors: ['R'],
    power: 2, toughness: 2, manaCost: 2,
    oracleText: '{R}, {T}, Discard a card: Draw a card.',
    imageUri: 'https://cards.scryfall.io/large/front/6/d/6d8f1f06-dde5-41f2-923c-67d1d4d13fab.jpg?1783921317',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.activated,
        // {R} — pip czerwony (CR 202.1); bez `colors` zdolność opłacała
        // dowolna mana (M105/B2).
        cost: { mana: 1, tap: true, colors: ['R'], discardCard: true },
        effect: { type: 'draw_cards', amount: 1 },
      }),
    ],
    artId: 388,
    plan: 'Dominaria',
    support: { status: 'supported', limitations: [] },
  }),

  // 3. Dragon Arch (APC) — {2},{T}: połóż wielokolorowego stwora z ręki
  defineCard({
    id: 'dragon-arch', name: 'Dragon Arch', set: 'APC',
    types: ['Artifact'], colors: [], manaCost: 5,
    oracleText: '{2}, {T}: You may put a multicolored creature card from your hand onto the battlefield.',
    imageUri: 'https://cards.scryfall.io/large/front/e/e/eec581b8-e509-420c-b142-afaa6dd06cc8.jpg?1783945326',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.activated,
        cost: { mana: 2, tap: true },
        effect: { type: 'put_multicolored_creature_from_hand' },
      }),
    ],
    artId: 72,
    plan: 'Dominaria',
    support: { status: 'supported', limitations: [] },
    notes: ['wybór stwora z ręki jest decyzją GRACZA (resolve_hand_creature); „you may" pozwala nic nie kłaść; wielokolorowy = colors.length >= 2'],
  }),

  // 4. Trigon of Corruption (SOM) — charge counters, -1/-1 na cel
  defineCard({
    id: 'trigon-of-corruption', name: 'Trigon of Corruption', set: 'SOM',
    types: ['Artifact'], colors: [], manaCost: 4,
    oracleText: 'This artifact enters with three charge counters on it.\n{B}{B}, {T}: Put a charge counter on this artifact.\n{2}, {T}, Remove a charge counter from this artifact: Put a -1/-1 counter on target creature.',
    imageUri: 'https://cards.scryfall.io/large/front/2/6/26e215e0-836c-4b37-8f9a-9093a535bff1.jpg?1783941694',
    entersWithCounters: { charge: 3 },
    abilities: [
      // {B}{B}, {T}: doładuj charge counter. Koszt jest DWUKOLOROWY (dwa pipy
      // czarne, CR 202.1) — bez `colors` zdolność opłacało dowolne 2 many
      // (M105/B1).
      createAbility({
        type: ABILITY_TYPE.activated,
        cost: { mana: 2, tap: true, colors: ['B', 'B'] },
        effect: { type: 'add_counter', counter: 'charge', amount: 1 },
      }),
      // {2}, {T}, Remove a charge counter: -1/-1 na docelowym stworze.
      createAbility({
        type: ABILITY_TYPE.activated,
        cost: { mana: 2, tap: true, removeCounter: { name: 'charge', amount: 1 } },
        targets: [{ type: 'creature' }],
        effect: { type: 'add_counter', counter: '-1/-1', amount: 1 },
      }),
    ],
    artId: 218,
    plan: 'Mirrodin',
    support: { status: 'supported', limitations: [] },
  }),

  // 5. Aerith Rescue Mission (FIN) — modal „Choose one"
  defineCard({
    id: 'aerith-rescue-mission', name: 'Aerith Rescue Mission', set: 'FIN',
    types: ['Sorcery'], colors: ['W'], manaCost: 4,
    oracleText: "Choose one —\n• Take the Elevator — Create three 1/1 colorless Hero creature tokens.\n• Take 59 Flights of Stairs — Tap up to three target creatures. Put a stun counter on one of them. (If a permanent with a stun counter would become untapped, remove one from it instead.)",
    imageUri: 'https://cards.scryfall.io/large/front/3/1/3123d16c-e1e6-4659-a7a3-2ec6efc6bf08.jpg?1783906653',
    spell: {
      timing: 'sorcery',
      modes: [
        // Tryb A (Take the Elevator): trzy 1/1 bezbarwne tokeny Hero.
        {
          // Nazwa trybu z Oracle text (M30): widoczna w etykiecie akcji,
          // żeby gracz rozróżnił warianty "Choose one".
          name: 'Winda',
          effects: [{
            type: 'create_token', cardId: 'token_hero', name: 'Hero',
            kind: 'creature', power: 1, toughness: 1, colors: [],
            types: ['Creature'], subtypes: ['Hero'], amount: 3,
          }],
        },
        // Tryb B (Take 59 Flights of Stairs): tap do 3 celowanych stworów
        // + stun counter na jednym z nich (wybór gracza).
        {
          name: 'Schody',
          // „Tap up to three target creatures" — CR 601.2c dopuszcza wybór
          // ZERO celów (M105/B4: min 1 blokowało tryb przy pustym stole).
          variableTargets: { type: 'creature', min: 0, max: 3 },
          stunAmongTargets: true,
          effects: [
            { type: 'tap_permanents', applyTo: 'allChosen' },
            { type: 'add_counter', counter: 'stun', amount: 1, applyTo: 'extra:stunTargetId' },
          ],
        },
      ],
    },
    artId: 275,
    plan: 'Final Fantasy',
    support: { status: 'supported', limitations: [] },
    notes: ['modal „Choose one": gracz wybiera tryb i cele (enumeracja wariantów); stun counters istnieją od Batchu 14'],
  }),

  // 6. Esper Stormblade (ARB) — hybrid {W/B}{U}, statyczny bonus
  defineCard({
    id: 'esper-stormblade', name: 'Esper Stormblade', set: 'ARB',
    types: ['Artifact', 'Creature'], subtypes: ['Vedalken', 'Wizard'],
    colors: ['W', 'B', 'U'], power: 2, toughness: 1, manaCost: 2,
    oracleText: 'As long as you control another multicolored permanent, this creature gets +1/+1 and has flying.',
    imageUri: 'https://cards.scryfall.io/large/front/e/6/e60ac6f0-fdec-4e2c-86c6-02d36c7bbaf5.jpg?1783942412',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.static,
        condition: { controlsAnotherMulticolored: true },
        pump: { power: 1, toughness: 1 },
        keywords: ['flying'],
      }),
    ],
    artId: 191,
    plan: 'Alara',
    support: { status: 'supported', limitations: [] },
    notes: ['wielokolorowy permanent = colors.length >= 2'],
  }),

  // 7. Forge Devil (DKA) — ETB 1 dmg do stwora + 1 dmg do ciebie
  defineCard({
    id: 'forge-devil', name: 'Forge Devil', set: 'DKA',
    types: ['Creature'], subtypes: ['Devil'], colors: ['R'],
    power: 1, toughness: 1, manaCost: 1,
    oracleText: 'When this creature enters, it deals 1 damage to target creature and 1 damage to you.',
    imageUri: 'https://cards.scryfall.io/large/front/6/3/63b565a5-d706-47b4-bfa2-deebcc0e2e60.jpg?1783940817',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'enter_battlefield', requiresTarget: { type: 'creature' } },
        effect: [
          { type: 'damage', amount: 1 },
          { type: 'damage_to_controller', amount: 1 },
        ],
      }),
    ],
    artId: 393,
    plan: 'Innistrad',
    support: { status: 'supported', limitations: [] },
  }),

  // 8. Shatter (SOM) — Destroy target artifact
  defineCard({
    id: 'shatter', name: 'Shatter', set: 'SOM',
    types: ['Instant'], colors: ['R'], manaCost: 2,
    oracleText: 'Destroy target artifact.',
    imageUri: 'https://cards.scryfall.io/large/front/0/4/04d70f7e-5ae9-455f-8430-123623920a92.jpg?1783941722',
    spell: {
      timing: 'instant',
      targets: [{ type: 'artifact' }],
      effects: [{ type: 'destroy_permanent' }],
    },
    artId: 507,
    plan: 'Mirrodin',
    support: { status: 'supported', limitations: [] },
  }),

  // 9. Sweet Oblivion (THB) — mill 4 celu + Escape z cmentarza
  defineCard({
    id: 'sweet-oblivion', name: 'Sweet Oblivion', set: 'THB',
    types: ['Sorcery'], colors: ['U'], manaCost: 2,
    oracleText: 'Target player mills four cards.\nEscape—{3}{U}, Exile four other cards from your graveyard. (You may cast this card from your graveyard for its escape cost.)',
    imageUri: 'https://cards.scryfall.io/large/front/5/1/51ac77d4-f918-4bbc-b023-8117a8c401ee.jpg?1783931576',
    spell: {
      timing: 'sorcery',
      targets: [{ type: 'player' }],
      effects: [{ type: 'mill_cards', amount: 4 }],
      // Escape (CR 702.138): rzuć z grobu za {3}{U} + wygnaj 4 inne karty z grobu.
      escape: { cost: 4, exileCount: 4 },
    },
    artId: 103,
    plan: 'Theros',
    support: { status: 'supported', limitations: [] },
    notes: ['Escape: czar z grobu za koszt escape + wygnanie 4 innych kart z grobu (wybór gracza); po rozstrzygnięciu wraca do grobu i można go uciec ponownie'],
  }),

  // 10. Village Rites (M21) — dodatkowy koszt sacrifice a creature, dobierz 2
  defineCard({
    id: 'village-rites', name: 'Village Rites', set: 'M21',
    types: ['Instant'], colors: ['B'], manaCost: 1,
    oracleText: 'As an additional cost to cast this spell, sacrifice a creature.\nDraw two cards.',
    imageUri: 'https://cards.scryfall.io/large/front/9/c/9c0f60a6-b5c8-4704-8b61-94e8fc463e5d.jpg?1783930699',
    spell: {
      timing: 'instant',
      targets: [],
      additionalCost: { sacrificeCreature: true },
      effects: [{ type: 'draw_cards', amount: 2 }],
    },
    artId: 279,
    plan: 'Wiedźmin',
    support: { status: 'supported', limitations: [] },
    notes: ['dodatkowy koszt „sacrifice a creature": gracz wybiera, którego stwora poświęcić (enumeracja wariantów); bez stwora czar nie jest dostępny'],
  }),

  // =========================================================================
  // Batch 16 (10 kart, 2026-08-04) — lista właściciela
  // Alaborn Trooper, Wedgelight Rammer, Jill Shiva's Dominant // Shiva Warden
  // of Ice, Ethersworn Shieldmage, Fiery Fall, Plague Reaver, Greatsword
  // of Tyr, Ramroller, Marut, Stoic Rebuttal. Dane Oracle pobrane ze Scryfall
  // (docs/cards/scryfall-*.json), artId ze słownika kolekcji.
  // =========================================================================

  // 1. Alaborn Trooper (P02 — Portal Second Age) — vanilla 2/3
  defineCard({
    id: 'alaborn-trooper', name: 'Alaborn Trooper', set: 'P02',
    types: ['Creature'], subtypes: ['Human', 'Soldier'], colors: ['W'],
    power: 2, toughness: 3, manaCost: 3, oracleText: '',
    imageUri: 'https://cards.scryfall.io/large/front/e/1/e1cd30b4-4ed8-467e-808e-b0caf4196d90.jpg?1783946495',
    artId: 185,
    plan: 'Dominaria',
    support: { status: 'supported', limitations: [] },
    notes: ['karta bez zdolności — standardowa istota 2/3'],
  }),

  // 2. Wedgelight Rammer (EOE) — Artifact Spacecraft z mechaniką Station
  defineCard({
    id: 'wedgelight-rammer', name: 'Wedgelight Rammer', set: 'EOE',
    types: ['Artifact'], subtypes: ['Spacecraft'], colors: ['W'],
    // Station: obiekt NIE jest stworem, dopóki nie osiągnie progu liczników
    // charge (9+); wydrukowane P/T 3/4 nosimy na obiekcie, a przełączaniem
    // kind steruje counters.js (syncStationKind przy każdej zmianie liczników).
    power: 3, toughness: 4, manaCost: 4,
    station: { threshold: 9, keywords: ['flying', 'first_strike'] },
    oracleText: 'When this Spacecraft enters, create a 2/2 colorless Robot artifact creature token.\nStation (Tap another creature you control: Put charge counters equal to its power on this Spacecraft. Station only as a sorcery. It\'s an artifact creature at 9+.)\n9+ | Flying, first strike',
    imageUri: 'https://cards.scryfall.io/large/front/2/c/2cb0984f-dc8b-4bb3-a4fd-8d6d4ae20198.jpg?1783905986',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'enter_battlefield' },
        effect: [{
          type: 'create_token', cardId: 'token_robot', name: 'Robot',
          kind: 'creature', power: 2, toughness: 2, colors: [],
          types: ['Artifact', 'Creature'], subtypes: ['Robot'],
        }],
      }),
      // Station — tap another creature you control: charge counters = jego moc.
      createAbility({
        type: ABILITY_TYPE.activated,
        keyword: 'station',
        cost: { tapOtherCreature: true },
        timing: 'sorcery',
        effect: [{ type: 'station_counters', counter: 'charge' }],
      }),
    ],
    artId: 288,
    plan: 'The Edge',
    support: { status: 'supported', limitations: [] },
  }),

  // 3. Jill, Shiva's Dominant // Shiva, Warden of Ice (FIN) — transform DFC;
  // strona tylna to osobna definicja 'shiva-warden-of-ice' (limited, jak
  // krallenhorde-wantons).
  defineCard({
    id: 'jill-shivas-dominant', name: "Jill, Shiva's Dominant", set: 'FIN',
    types: ['Legendary', 'Creature'], subtypes: ['Human', 'Noble', 'Warrior'], colors: ['U'],
    power: 2, toughness: 2, manaCost: 3,
    transformTo: 'shiva-warden-of-ice',
    oracleText: "When Jill enters, return up to one other target nonland permanent to its owner's hand.\n{3}{U}{U}, {T}: Exile Jill, then return it to the battlefield transformed under its owner's control. Activate only as a sorcery.",
    imageUri: 'https://cards.scryfall.io/large/front/1/f/1f163763-4802-4a96-a5bc-f3c381db7b5c.jpg?1783906640',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        // Temat 2: „up to one other target nonland permanent" — cel wybiera
        // kontroler; „up to one" daje opcję odmowy (allowNone).
        trigger: { event: 'enter_battlefield', requiresTarget: { type: 'other_nonland_permanent', optional: true } },
        effect: [{ type: 'bounce_permanent' }],
      }),
      // {3}{U}{U}, {T}: exile+return transformed (sorcery-speed). Ta sama
      // mechanika obsługuje powrót stroną przednią z rozdziału III Sagi.
      createAbility({
        type: ABILITY_TYPE.activated,
        cost: { mana: 5, tap: true, colors: ['U', 'U'] },
        timing: 'sorcery',
        effect: [{ type: 'exile_return_transformed' }],
      }),
    ],
    artId: 525,
    plan: 'Final Fantasy',
    support: { status: 'supported', limitations: [] },
  }),
  // Shiva, Warden of Ice — tylna strona DFC: Legendary Enchantment Creature
  // — Saga Elemental. Rozdziały Sagi odpalają liczniki lore (CR 714): wejście
  // = rozdział I, po kroku dobierania kontrolera = kolejne.
  defineCard({
    id: 'shiva-warden-of-ice', name: 'Shiva, Warden of Ice', set: 'FIN',
    types: ['Legendary', 'Enchantment', 'Creature'], subtypes: ['Saga', 'Elemental'], colors: ['U'],
    power: 4, toughness: 5, manaCost: 3,
    transformTo: 'jill-shivas-dominant',
    saga: {
      chapters: [
                // I, II — Mesmerize: "Target creature can't be blocked this turn."
        // Temat 2 dla Sag: cel wybiera KONTROLER Sagi (resolve_trigger_target)
        // — nie dawny deterministyczny "najsilniejszy własny stwór". Domyślna
        // kolejność kandydatów (bitwisko) oznacza, że boty (pierwsza oferta)
        // zachowują dotychczasowe zachowanie: najsilniejszy własny stwór.
        [{ type: 'cant_be_blocked', requiresTarget: { type: 'creature_you_control' } }],
        [{ type: 'cant_be_blocked', requiresTarget: { type: 'creature_you_control' } }],
        // III — Cold Snap: tap wszystkich landów przeciwników + exile+return
        // stroną przednią (Saga znika przed warunkiem poświęcenia CR 714.4).
        // Efekty bezcelowe — idą od razu na stos, bez requiresTarget.
        [{ type: 'tap_all_lands_opponents_control' }, { type: 'exile_return_transformed' }],
      ],
    },
    oracleText: '(As this Saga enters and after your draw step, add a lore counter.)\nI, II — Mesmerize — Target creature can\'t be blocked this turn.\nIII — Cold Snap — Tap all lands your opponents control. Exile Shiva, then return it to the battlefield (front face up).',
    imageUri: 'https://cards.scryfall.io/large/back/1/f/1f163763-4802-4a96-a5bc-f3c381db7b5c.jpg?1783906640',
    artId: 527,
    plan: 'Final Fantasy',
    support: { status: 'limited', limitations: ['tylna strona transform — nie można umieścić w talii'] },
  }),

  // 4. Ethersworn Shieldmage (ARB) — artifact creature z flash + prewencją
  // obrażeń. Druk ARB (Alara Reborn) potwierdzony przez właściciela
  // 2026-08-05 (wcześniej podany „CON\" ze względu na plan Alara w arkuszu;
  // Scryfall zna wyłącznie ARC i ARB). artId 536 ze słownika kolekcji.
  defineCard({
    id: 'ethersworn-shieldmage', name: 'Ethersworn Shieldmage', set: 'ARB',
    types: ['Artifact', 'Creature'], subtypes: ['Vedalken', 'Wizard'],
    colors: ['U', 'W'], power: 2, toughness: 2, manaCost: 3,
    keywords: ['flash'],
    oracleText: 'Flash\nWhen this creature enters, prevent all damage that would be dealt to artifact creatures this turn.',
    imageUri: 'https://cards.scryfall.io/large/front/c/5/c5340e18-faed-4787-a42c-c12935bb0646.jpg?1783942442',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'enter_battlefield' },
        // Prewencja do cleanup: wszystkie ARTEFAKTOWE STWORY (obu graczy —
        // tak mówi karta) nie otrzymują obrażeń do końca tury.
        effect: [{ type: 'prevent_damage_this_turn', typesInclude: ['Artifact'], isCreature: true }],
      }),
    ],
    artId: 536,
    plan: 'Alara',
    support: { status: 'supported', limitations: [] },
  }),

  // 5. Fiery Fall (MM2) — 5 obrażeń do stwora + Basic landcycling
  defineCard({
    id: 'fiery-fall', name: 'Fiery Fall', set: 'MM2',
    types: ['Instant'], colors: ['R'], manaCost: 6,
    oracleText: 'Fiery Fall deals 5 damage to target creature.\nBasic landcycling {1}{R} ({1}{R}, Discard this card: Search your library for a basic land card, reveal it, put it into your hand, then shuffle.)',
    imageUri: 'https://cards.scryfall.io/large/front/2/2/22014836-8a81-4385-bdb0-b9a080fa57af.jpg?1783938405',
    spell: {
      timing: 'instant',
      targets: [{ type: 'creature' }],
      effects: [{ type: 'damage', amount: 5 }],
    },
    abilities: [
      // Basic landcycling {1}{R}: szuka karty z WSZYSTKIMI typami Basic+Land.
      createAbility({
        type: ABILITY_TYPE.activated,
        keyword: 'cycling',
        cycling: { allTypes: ['Basic', 'Land'] },
        cost: { mana: 2, colors: ['R'] },
        effect: [],
      }),
    ],
    artId: 102,
    plan: 'Alara',
    support: { status: 'supported', limitations: [] },
  }),

  // 6. Plague Reaver (CMR) — 6/5, end-step poświęca inne stwory, ping-pong
  defineCard({
    id: 'plague-reaver', name: 'Plague Reaver', set: 'CMR',
    types: ['Creature'], subtypes: ['Beast'], colors: ['B'],
    power: 6, toughness: 5, manaCost: 3,
    oracleText: 'At the beginning of your end step, sacrifice each other creature you control.\nDiscard two cards, Sacrifice this creature: Choose target opponent. Return this creature to the battlefield under that player\'s control at the beginning of their next upkeep.',
    imageUri: 'https://cards.scryfall.io/large/front/2/3/230b9bc8-29c8-49cb-b4f5-1aceeda8bf45.jpg?1783928829',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'end_step' },
        effect: [{ type: 'sacrifice_each_other_creature' }],
      }),
      // Ping-pong: odrzuć 2 + poświęć → wraca w następnym upkeepu celu-pod
      // jego kontrolą (opóźniony trigger CR 603.7 — patrz triggers.js).
      createAbility({
        type: ABILITY_TYPE.activated,
        cost: { discardCards: 2, sacrificeSelf: true },
        targets: [{ type: 'opponent' }],
        effect: [{ type: 'return_to_battlefield_under_control_at_upkeep' }],
      }),
    ],
    artId: 291,
    plan: 'Alara',
    support: { status: 'supported', limitations: [] },
  }),

  // 7. Greatsword of Tyr (CLB) — Equipment z triggerem ataku nosiciela
  defineCard({
    id: 'greatsword-of-tyr', name: 'Greatsword of Tyr', set: 'CLB',
    types: ['Artifact'], subtypes: ['Equipment'], colors: ['W'], manaCost: 2,
    equipment: { equip: 1 },
    oracleText: 'Whenever equipped creature attacks, put a +1/+1 counter on it and tap up to one target creature defending player controls.\nEquip {W} ({W}: Attach to target creature you control. Equip only as a sorcery.)',
    imageUri: 'https://cards.scryfall.io/large/front/5/0/50088a60-642b-47ed-a289-ef0b617b688f.jpg?1783922813',
    abilities: [
      // Trigger siedzi na EQUIPMENTU (nie na nosicielu): przy deklaracji ataku
      // nosiciela cel 0 = atakujący, cel 1 = stwór gracza broniącego albo null
      // („up to one\" — obsługa w triggers.js, efekty po targetIndex).
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'equipped_creature_attacks' },
        effect: [
          { type: 'add_counter', counter: '+1/+1', amount: 1 },
          { type: 'tap_permanent', targetIndex: 1 },
        ],
      }),
      createAbility({
        type: ABILITY_TYPE.activated,
        keyword: 'equip',
        cost: { mana: 1 },
        effect: [],
      }),
    ],
    artId: 308,
    plan: 'Forgotten Realms',
    support: { status: 'supported', limitations: [] },
  }),

  // 8. Ramroller (ORI) — Juggernaut: atakuje co turę, +2/+0 za inny artefakt
  defineCard({
    id: 'ramroller', name: 'Ramroller', set: 'ORI',
    types: ['Artifact', 'Creature'], subtypes: ['Juggernaut'], colors: [],
    power: 2, toughness: 3, manaCost: 3,
    oracleText: 'This creature attacks each combat if able.\nThis creature gets +2/+0 as long as you control another artifact.',
    imageUri: 'https://cards.scryfall.io/large/front/0/7/07f7ba4d-26bb-4631-a135-f27d94f376d1.jpg?1783938308',
    abilities: [
      // „Attacks each combat if able\" (CR 508.1c): statyczny wymóg ataku —
      // combat traktuje go jak stały goad (walidacja i opcje deklaracji).
      createAbility({ type: ABILITY_TYPE.static, mustAttack: true }),
      createAbility({
        type: ABILITY_TYPE.static,
        condition: { controlsAnotherArtifact: true },
        pump: { power: 2, toughness: 0 },
      }),
    ],
    artId: 238,
    plan: 'Warhammer Fantasy',
    support: { status: 'supported', limitations: [] },
  }),

  // 9. Marut (CLB) — 7/7 trample za 8; ETB liczy manę wydaną ze Skarbów
  defineCard({
    id: 'marut', name: 'Marut', set: 'CLB',
    types: ['Artifact', 'Creature'], subtypes: ['Construct'], colors: [],
    keywords: ['trample'], power: 7, toughness: 7, manaCost: 8,
    oracleText: 'Trample\nWhen this creature enters, if mana from a Treasure was spent to cast it, create a Treasure token for each mana from a Treasure spent to cast it. (It\'s an artifact with "{T}, Sacrifice this token: Add one mana of any color.")',
    imageUri: 'https://cards.scryfall.io/large/front/a/3/a3ce857f-2870-4dc9-a763-9ce710e4b375.jpg?1783922671',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'enter_battlefield' },
        // Mana ze Skarba wydana na rzut jest wpisana na obiekcie
        // (manaFromTreasureSpent — patrz resources.castPermanent); wejście
        // inną drogą (reanimacja, token) daje 0 tokenów — zgodnie z „if\".
        effect: [{
          type: 'create_token', cardId: 'token_treasure', name: 'Treasure',
          kind: 'artifact', colors: [], types: ['Artifact'], subtypes: ['Treasure'],
          amount: 'mana_from_treasure_spent',
          abilities: [
            createAbility({
              type: ABILITY_TYPE.activated,
              cost: { tap: true, sacrificeSelf: true },
              effect: { type: 'add_mana', amount: 1, fromTreasure: true },
            }),
          ],
        }],
      }),
    ],
    artId: 462,
    plan: 'Forgotten Realms',
    support: { status: 'supported', limitations: [] },
    notes: ['„mana from a Treasure" = pula many wytworzonej zdolnościami Skarba oznaczonymi fromTreasure; spendMana zużywa ją deterministycznie jako pierwszą'],
  }),

  // 10. Stoic Rebuttal (SOM) — Metalcraft counterspell „Counter target spell"
  defineCard({
    id: 'stoic-rebuttal', name: 'Stoic Rebuttal', set: 'SOM',
    types: ['Instant'], colors: ['U'], manaCost: 3,
    oracleText: 'Metalcraft — This spell costs {1} less to cast if you control three or more artifacts.\nCounter target spell.',
    imageUri: 'https://cards.scryfall.io/large/front/f/2/f2805239-f30a-4eca-a10b-41673daaa287.jpg?1783941736',
    spell: {
      timing: 'instant',
      // „Counter target spell\" (bez „noncreature\" jak w Negate) — nowy typ
      // celu spell_on_stack: dowolny czar na stosie, także czar-stwór bestow.
      targets: [{ type: 'spell_on_stack' }],
      effects: [{ type: 'counter_spell' }],
      // Metalcraft (CR 702.80): koszt o 1 mniejszy przy >= 3 artefaktach
      // kontrolera (warunek oceniany w chwili rzutu — spells.js).
      costReduction: { amount: 1, condition: { controlsArtifactsAtLeast: 3 } },
    },
    artId: 487,
    plan: 'Mirrodin',
    support: { status: 'supported', limitations: [] },
  }),

  // Token Wedgelight Rammer (EOE): 2/2 bezbarwny Robot — artefaktowy stwór.
  // Definicja tokena — nie taliowalna (limited), jak token_wolf.
  defineCard({
    id: 'token_robot', name: 'Robot', set: null,
    types: ['Artifact', 'Creature', 'Token'], subtypes: ['Robot'], colors: [],
    power: 2, toughness: 2, manaCost: 0,
    imageUri: 'https://cards.scryfall.io/large/front/c/4/c46f9a07-005c-44b7-8057-b2f00b274dd6.jpg?1783905782',  // teoe
    support: { status: 'limited', limitations: ['token — nie można umieścić w talii; tworzony przez Wedgelight Rammer'] },
  }),

  // Token Howl of the Night Pack (M10): 2/2 zielony Wolf.
  // Definicja tokena — nie taliowalna (limited), jak token_goblin.
  defineCard({
    id: 'token_wolf', name: 'Wolf', set: null,
    types: ['Creature', 'Token'], subtypes: ['Wolf'], colors: ['G'],
    power: 2, toughness: 2, manaCost: 0,
    imageUri: 'https://cards.scryfall.io/large/front/0/f/0f63920d-18a0-4267-bb4e-a972ba86067d.jpg?1783942345',  // tm10
    support: { status: 'limited', limitations: ['token — nie można umieścić w talii; tworzony przez Howl of the Night Pack'] },
  }),
  // Token Aerith Rescue Mission (FIN): 1/1 bezbarwny Hero.
  defineCard({
    id: 'token_hero', name: 'Hero', set: null,
    types: ['Creature', 'Token'], subtypes: ['Hero'], colors: [],
    power: 1, toughness: 1, manaCost: 0,
    imageUri: 'https://cards.scryfall.io/large/front/d/0/d0657ce1-bf75-4007-ac1b-0623eb263357.jpg?1783906138',  // tfin
    support: { status: 'limited', limitations: ['token — nie można umieścić w talii; tworzony przez Aerith Rescue Mission'] },
  }),

  // =========================================================================
  // Batch 17 (10 kart, 2026-08-05) — lista właściciela. Mechaniki (infect,
  // cleave, indestructible, animacja lądu, any_creature_dies, draw_cards both
  // players) wniósł do engine'u PR #26; ten batch DOKOŃCZA go definicjami
  // kart, testami i dopisaniem do talii. Dane Oracle w docs/cards/scryfall-*.json,
  // artId i plan ze słownika kolekcji (tools/collection-art-ids.csv).
  // =========================================================================

  // 1. Maritime Guard (M11) — vanilla 1/3 Merfolk Soldier.
  defineCard({
    id: 'maritime-guard', name: 'Maritime Guard', set: 'M11',
    types: ['Creature'], subtypes: ['Merfolk', 'Soldier'], colors: ['U'],
    power: 1, toughness: 3, manaCost: 2, oracleText: '',
    imageUri: 'https://cards.scryfall.io/large/front/f/3/f365d82a-88a3-403b-92a6-91c9ccb3421f.jpg?1783941824',
    artId: 222,
    plan: 'Wiedźmin',
    support: { status: 'supported', limitations: [] },
    notes: ['karta bez zdolności — standardowa istota 1/3'],
  }),

  // 2. Carrion Call (SOM) — Instant, dwa 1/1 zielone Phyrexian Insect z infect.
  defineCard({
    id: 'carrion-call', name: 'Carrion Call', set: 'SOM',
    types: ['Instant'], colors: ['G'], manaCost: 4,
    oracleText: 'Create two 1/1 green Phyrexian Insect creature tokens with infect. (They deal damage to creatures in the form of -1/-1 counters and to players in the form of poison counters.)',
    imageUri: 'https://cards.scryfall.io/large/front/b/c/bc3c1a8e-3bdb-42cf-9442-5de7e4670d66.jpg?1783941719',
    spell: {
      timing: 'instant', targets: [],
      effects: [{
        type: 'create_token', cardId: 'token_insect', name: 'Phyrexian Insect',
        kind: 'creature', power: 1, toughness: 1, colors: ['G'],
        types: ['Creature'], subtypes: ['Phyrexian', 'Insect'], keywords: ['infect'],
        amount: 2,
      }],
    },
    artId: 31,
    plan: 'Mirrodin',
    support: { status: 'supported', limitations: [] },
    notes: ['tokeny z infect: obrażenia do gracza dają znaki trucizny (przegrana przy 10), do stwora — liczniki -1/-1 (CR 702.89)'],
  }),

  // 3. Garruk's Companion (M11) — 3/2 Beast z trample.
  defineCard({
    id: 'garruks-companion', name: "Garruk's Companion", set: 'M11',
    types: ['Creature'], subtypes: ['Beast'], colors: ['G'],
    keywords: ['trample'], power: 3, toughness: 2, manaCost: 2,
    oracleText: "Trample (This creature can deal excess combat damage to the player or planeswalker it's attacking.)",
    imageUri: 'https://cards.scryfall.io/large/front/8/6/863c9a10-d83f-415b-adf2-2d0f870410b2.jpg?1783941798',
    artId: 84,
    plan: 'Shandalar',
    support: { status: 'supported', limitations: [] },
  }),

  // 4. Lunar Rejection (VOW) — Instant z Cleave. Zwykły rzut odbija stwora
  // Wolf/Werewolf i dobiera kartę; Cleave {3}{U} odbija dowolnego stwora
  // („wykreślony" fragment [Wolf or Werewolf] znosi ograniczenie podtypu).
  defineCard({
    id: 'lunar-rejection', name: 'Lunar Rejection', set: 'VOW',
    types: ['Instant'], colors: ['U'], manaCost: 2,
    oracleText: "Cleave {3}{U} (You may cast this spell for its cleave cost. If you do, remove the words in square brackets.)\nReturn target [Wolf or Werewolf] creature to its owner's hand.\nDraw a card.",
    imageUri: 'https://cards.scryfall.io/large/front/0/f/0f66511c-355f-4e8a-96fc-3afc7a315231.jpg?1783924891',
    spell: {
      timing: 'instant',
      targets: [{ type: 'creature_with_subtypes', subtypes: ['Wolf', 'Werewolf'] }],
      effects: [
        { type: 'bounce_permanent' },
        { type: 'draw_cards', amount: 1 },
      ],
      // Cleave (CR 701.33): alternatywny koszt, który „wykreśla" ograniczenie
      // podtypu celu — cleave celuje dowolnego stwora (creature), nie tylko
      // Wolf/Werewolf. Efekt i cele pochodzą z deskryptora cleave.
      cleave: {
        manaCost: 4,
        targets: [{ type: 'creature' }],
        effects: [
          { type: 'bounce_permanent' },
          { type: 'draw_cards', amount: 1 },
        ],
      },
    },
    artId: 24,
    plan: 'Innistrad',
    support: { status: 'supported', limitations: [] },
  }),

  // 5. Selhoff Occultist (ISD) — 2/3, „whenever this creature or another
  // creature dies, target player mills a card" (trigger any_creature_dies).
  defineCard({
    id: 'selhoff-occultist', name: 'Selhoff Occultist', set: 'ISD',
    types: ['Creature'], subtypes: ['Human', 'Rogue'], colors: ['U'],
    power: 2, toughness: 3, manaCost: 3,
    oracleText: 'Whenever this creature or another creature dies, target player mills a card.',
    imageUri: 'https://cards.scryfall.io/large/front/a/e/aeac4885-bd04-42bd-8e10-06c3efbce108.jpg?1783940967',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        // any_creature_dies odpala się przy śmierci dowolnego stwora — też
        // samego źródła (abilitiesOnDeath w triggers.js).
        trigger: { event: 'any_creature_dies', requiresTarget: { type: 'player', prefer: 'opponent' } },
        effect: { type: 'mill_cards', amount: 1 },
      }),
    ],
    artId: 17,
    plan: 'Innistrad',
    support: { status: 'supported', limitations: [] },
  }),

  // 6. Reclusive Artificer (ORI) — {2}{U}{R} 2/3 Haste, ETB „you may have it
  // deal damage to target creature equal to the number of artifacts you control".
  defineCard({
    id: 'reclusive-artificer', name: 'Reclusive Artificer', set: 'ORI',
    types: ['Creature'], subtypes: ['Human', 'Artificer'], colors: ['U', 'R'],
    keywords: ['haste'], power: 2, toughness: 3, manaCost: 4,
    oracleText: "Haste (This creature can attack and {T} as soon as it comes under your control.)\nWhen this creature enters, you may have it deal damage to target creature equal to the number of artifacts you control.",
    imageUri: 'https://cards.scryfall.io/large/front/5/2/5299a549-06cf-47e8-b6cd-7e44d9f1efb8.jpg?1783938313',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        // Temat 2: „you may have it deal damage to target creature" — cel
        // wybiera kontroler, a „you may" daje opcję odmowy (allowNone).
        // Obrażenia = liczba artefaktów kontrolera źródła (wartość dynamiczna
        // 'artifacts_you_control').
        trigger: { event: 'enter_battlefield', requiresTarget: { type: 'creature', optional: true } },
        effect: { type: 'damage', amount: 'artifacts_you_control' },
      }),
    ],
    artId: 213,
    plan: 'Kaladesh',
    support: { status: 'supported', limitations: [] },
  }),

  // 7. Captain's Call (CMR) — Sorcery, trzy 1/1 białe tokeny Soldier.
  defineCard({
    id: 'captains-call', name: "Captain's Call", set: 'CMR',
    types: ['Sorcery'], colors: ['W'], manaCost: 4,
    oracleText: 'Create three 1/1 white Soldier creature tokens.',
    imageUri: 'https://cards.scryfall.io/large/front/a/c/ac907330-492d-4705-bb8a-1fdb080632e1.jpg?1783928889',
    spell: {
      timing: 'sorcery', targets: [],
      effects: [{
        type: 'create_token', cardId: 'token_soldier', name: 'Soldier',
        kind: 'creature', power: 1, toughness: 1, colors: ['W'],
        types: ['Creature'], subtypes: ['Soldier'],
        amount: 3,
      }],
    },
    artId: 252,
    plan: 'Shandalar',
    support: { status: 'supported', limitations: [] },
  }),

  // 8. Your Temple Is Under Attack (CLB) — Instant, modal „Choose one":
  //   • Pray for Protection — stwory kontrolera zyskują indestructible do EOT;
  //   • Strike a Deal — kontroler i cel-oponent dobierają po 2 karty.
  defineCard({
    id: 'your-temple-is-under-attack', name: 'Your Temple Is Under Attack', set: 'CLB',
    types: ['Instant'], colors: ['W'], manaCost: 3,
    oracleText: "Choose one —\n• Pray for Protection — Creatures you control gain indestructible until end of turn.\n• Strike a Deal — You and target opponent each draw two cards.",
    imageUri: 'https://cards.scryfall.io/large/front/7/a/7ad8aa76-b643-4bd2-aaeb-036c1d50db54.jpg?1783922798',
    spell: {
      timing: 'instant',
      modes: [
        // Pray for Protection: globalny grant indestructible do końca tury
        // (buff_creatures_you_control z keywords; cleanup zdejmuje grant).
        {
          // Nazwa trybu z Oracle text (CLB): widoczna w etykiecie akcji.
          name: 'Modlitwa o ochronę',
          effects: [{ type: 'buff_creatures_you_control', power: 0, toughness: 0, keywords: ['indestructible'] }],
        },
        // Strike a Deal: kontroler i cel-oponent dobierają po 2 karty
        // (draw_cards_both_players używa targets[0] jako drugiego gracza).
        {
          name: 'Zawrzyj pakt',
          targets: [{ type: 'opponent' }],
          effects: [{ type: 'draw_cards_both_players', amount: 2 }],
        },
      ],
    },
    artId: 440,
    plan: 'Forgotten Realms',
    support: { status: 'supported', limitations: [] },
    notes: ['modal „Choose one": gracz wybiera tryb (enumeracja wariantów); indestructible chroni przed śmiertelnymi obrażeniami, deathtouch i efektem destroy, wygasa w cleanup'],
  }),

  // 9. Crested Herdcaller (RIX) — 3/3 Dinosaur z trample, ETB tworzy 3/3
  // zielony token Dinosaur z trample.
  defineCard({
    id: 'crested-herdcaller', name: 'Crested Herdcaller', set: 'RIX',
    types: ['Creature'], subtypes: ['Dinosaur'], colors: ['G'],
    keywords: ['trample'], power: 3, toughness: 3, manaCost: 5,
    oracleText: 'Trample\nWhen this creature enters, create a 3/3 green Dinosaur creature token with trample.',
    imageUri: 'https://cards.scryfall.io/large/front/8/0/80bccca0-6425-4676-a98a-e0721a6beff7.jpg?1783935290',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'enter_battlefield' },
        effect: [{
          type: 'create_token', cardId: 'token_dinosaur', name: 'Dinosaur',
          kind: 'creature', power: 3, toughness: 3, colors: ['G'],
          types: ['Creature'], subtypes: ['Dinosaur'], keywords: ['trample'],
        }],
      }),
    ],
    artId: 494,
    plan: 'Ixalan',
    support: { status: 'supported', limitations: [] },
  }),

  // 10. Silvanus's Invoker (CLB) — {8}: untap target land you control, animuje
  // go w 8/8 Elemental z trample i haste do końca tury („It's still a land").
  defineCard({
    id: 'silvanuss-invoker', name: "Silvanus's Invoker", set: 'CLB',
    types: ['Creature'], subtypes: ['Dragon', 'Druid'], colors: ['G'],
    power: 3, toughness: 2, manaCost: 3,
    oracleText: "Conjure Elemental — {8}: Untap target land you control. It becomes an 8/8 Elemental creature with trample and haste until end of turn. It's still a land.",
    imageUri: 'https://cards.scryfall.io/large/front/f/1/f1dd1bb8-013b-4028-becd-e0cb4b84f1ad.jpg?1783922702',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.activated,
        cost: { mana: 8 },
        targets: [{ type: 'land_you_control' }],
        effect: [
          { type: 'untap_permanent' },
          // Animacja lądu w istotę z zachowaniem typu Land (retainTypes) —
          // granty trample/haste i animacja znikają w cleanup.
          { type: 'animate_permanent_until_end_of_turn', power: 8, toughness: 8, typesAdd: ['Creature'], subtypesAdd: ['Elemental'], keywordsAdd: ['trample', 'haste'], retainTypes: true },
        ],
      }),
    ],
    artId: 539,
    plan: 'Forgotten Realms',
    support: { status: 'supported', limitations: [] },
    notes: ['„It\'s still a land" — animowany land zachowuje typ Land (retainTypes: true); animacja i nadane keywordy (trample, haste) wygasają w cleanup'],
  }),

  // Token Carrion Call (SOM): 1/1 zielony Phyrexian Insect z infect.
  // Definicja tokena — nie taliowalna (limited), jak token_wolf.
  defineCard({
    id: 'token_insect', name: 'Phyrexian Insect', set: null,
    types: ['Creature', 'Token'], subtypes: ['Phyrexian', 'Insect'], colors: ['G'],
    keywords: ['infect'], power: 1, toughness: 1, manaCost: 0,
    imageUri: 'https://cards.scryfall.io/large/front/5/a/5a90e8ab-5a76-4834-9cd6-186af939ea41.jpg?1783918174',  // tonc
    support: { status: 'limited', limitations: ['token — nie można umieścić w talii; tworzony przez Carrion Call'] },
  }),
  // Token Captain's Call (CMR): 1/1 biały Soldier.
  defineCard({
    id: 'token_soldier', name: 'Soldier', set: null,
    types: ['Creature', 'Token'], subtypes: ['Soldier'], colors: ['W'],
    power: 1, toughness: 1, manaCost: 0,
    imageUri: 'https://cards.scryfall.io/large/front/4/3/430ed737-b918-4485-a623-e781c0beb67b.jpg?1783928591',  // tcmr
    support: { status: 'limited', limitations: ['token — nie można umieścić w talii; tworzony przez Captain\'s Call'] },
  }),
  // Token Crested Herdcaller (RIX): 3/3 zielony Dinosaur z trample.
  defineCard({
    id: 'token_dinosaur', name: 'Dinosaur', set: null,
    types: ['Creature', 'Token'], subtypes: ['Dinosaur'], colors: ['G'],
    keywords: ['trample'], power: 3, toughness: 3, manaCost: 0,
    imageUri: 'https://cards.scryfall.io/large/front/b/1/b1ade1a5-74bf-41cd-b3b4-3bf33cf6d016.jpg?1783931642',  // tgn2
    support: { status: 'limited', limitations: ['token — nie można umieścić w talii; tworzony przez Crested Herdcaller'] },
  }),

  // =========================================================================
  // Batch 18 (10 kart, 2026-08-05) — lista właściciela
  // Ainok Artillerist (DTK), Kin-Tree Nurturer (TDM), Gorger Wurm (ARB),
  // Bone Splinters (ALA), Brute Force (MM2), Forever Young (ELD),
  // Trostani Discordant (CLU), Fear of Burning Alive (DSK),
  // Jeskai Windscout (KTK), Hobble (PLS). Dane Oracle pobrane ze Scryfall
  // (docs/cards/scryfall-*.json, 2026-08-05), artId ze słownika kolekcji.
  // =========================================================================

  // 1. Ainok Artillerist (DTK) — 4/1 Dog Archer; reach, dopóki ma licznik +1/+1
  defineCard({
    id: 'ainok-artillerist', name: 'Ainok Artillerist', set: 'DTK',
    types: ['Creature'], subtypes: ['Dog', 'Archer'], colors: ['G'],
    power: 4, toughness: 1, manaCost: 3,
    oracleText: 'This creature has reach as long as it has a +1/+1 counter on it. (It can block creatures with flying.)',
    imageUri: 'https://cards.scryfall.io/large/front/3/a/3a4c8964-06e4-4a24-9a7e-9cac0fb8518e.jpg?1783938582',
    abilities: [
      // Zdolność STATYCZNA (CR 604.3): reach obowiązuje, dopóki źródło ma
      // co najmniej jeden licznik +1/+1 — przeliczanie przy każdym odczycie
      // (warunek generyczny hasCounter, kwalifikacja licznika danymi).
      createAbility({
        type: ABILITY_TYPE.static,
        condition: { hasCounter: '+1/+1' },
        keywords: ['reach'],
      }),
    ],
    artId: 321,
    plan: 'Tarkir',
    support: { status: 'supported', limitations: [] },
    notes: ['reach warunkowy licznikiem +1/+1 — znika wraz ze zdjęciem licznika (przeliczanie przy odczycie)'],
  }),

  // 2. Kin-Tree Nurturer (TDM) — 2/1 Human Druid z lifelink, ETB endures 1
  defineCard({
    id: 'kin-tree-nurturer', name: 'Kin-Tree Nurturer', set: 'TDM',
    types: ['Creature'], subtypes: ['Human', 'Druid'], colors: ['B'],
    keywords: ['lifelink'], power: 2, toughness: 1, manaCost: 3,
    // Endure 1 (TDM, CR w tej implementacji): przy wejściu wybór gracza —
    // 1 licznik +1/+1 na źródle ALBO token 1/1 biały Spirit
    // (resolve_endure_choice, cz. 2 batchu).
    endure: 1,
    oracleText: 'Lifelink\nWhen this creature enters, it endures 1. (Put a +1/+1 counter on it or create a 1/1 white Spirit creature token.)',
    imageUri: 'https://cards.scryfall.io/large/front/2/1/2177ef64-28bf-4acf-b1f1-c1408f03c411.jpg?1783907376',
    artId: 502,
    plan: 'Tarkir',
    support: { status: 'supported', limitations: [] },
    notes: ['endure: wybór liczniki/token należy do kontrolera (blokująca decyzja); liczniki dostępne tylko, gdy źródło wciąż jest stworem na bitwisku'],
  }),

  // 3. Gorger Wurm (ARB) — 5/5 Wurm z Devour 1
  defineCard({
    id: 'gorger-wurm', name: 'Gorger Wurm', set: 'ARB',
    types: ['Creature'], subtypes: ['Wurm'], colors: ['G', 'R'],
    power: 5, toughness: 5, manaCost: 5,
    // Devour 1 (CR 702.82): „As this creature enters, you may sacrifice any
    // number of creatures. It enters with that many +1/+1 counters on it."
    // Sekwencyjna decyzja kontrolera (resolve_devour_choice) — każde
    // poświęcenie to counters liczników na źródle; samo źródło jest wyłączone.
    devour: { counters: 1 },
    oracleText: 'Devour 1 (As this creature enters, you may sacrifice any number of creatures. It enters with that many +1/+1 counters on it.)',
    imageUri: 'https://cards.scryfall.io/large/front/0/0/00e5a9be-bfb2-466b-b0fe-3b24694e9f84.jpg?1783942430',
    artId: 342,
    plan: 'Alara',
    support: { status: 'supported', limitations: [] },
    notes: ['devour rozstrzygany po wejściu (po zdarzeniu ETB), nie jako zastępstwo wejścia — żaden kolejny trigger nie może wpaść między wejście a poświęcenia (stan silnika: decyzje blokujące)'],
  }),

  // 4. Bone Splinters (ALA) — sorcery, dodatkowy koszt sacrifice, destroy
  defineCard({
    id: 'bone-splinters', name: 'Bone Splinters', set: 'ALA',
    types: ['Sorcery'], colors: ['B'], manaCost: 1,
    oracleText: 'As an additional cost to cast this spell, sacrifice a creature.\nDestroy target creature.',
    imageUri: 'https://cards.scryfall.io/large/front/d/4/d4a4b3a3-b7ae-4210-8037-098fdf5808d0.jpg?1783942568',
    spell: {
      timing: 'sorcery',
      targets: [{ type: 'creature' }],
      additionalCost: { sacrificeCreature: true },
      effects: [{ type: 'destroy_permanent' }],
    },
    artId: 136,
    plan: 'Alara',
    support: { status: 'supported', limitations: [] },
    notes: ['dodatkowy koszt „sacrifice a creature": gracz wybiera, którego stwora poświęcić (enumeracja wariantów); bez stwora czar nie jest dostępny'],
  }),

  // 5. Brute Force (MM2) — instant, cel dostaje +3/+3 do końca tury
  defineCard({
    id: 'brute-force', name: 'Brute Force', set: 'MM2',
    types: ['Instant'], colors: ['R'], manaCost: 1,
    oracleText: 'Target creature gets +3/+3 until end of turn.',
    imageUri: 'https://cards.scryfall.io/large/front/e/f/efa32b2a-ce3c-441a-88d4-1ee853a7c265.jpg?1783938406',
    spell: {
      timing: 'instant',
      targets: [{ type: 'creature' }],
      effects: [{ type: 'pump', power: 3, toughness: 3 }],
    },
    artId: 39,
    plan: 'Warhammer Fantasy',
    support: { status: 'supported', limitations: [] },
  }),

  // 6. Forever Young (ELD) — karty-stwory z grobu na wierzch biblioteki + draw
  defineCard({
    id: 'forever-young', name: 'Forever Young', set: 'ELD',
    types: ['Sorcery'], colors: ['B'], manaCost: 2,
    oracleText: 'Put any number of target creature cards from your graveyard on top of your library.\nDraw a card.',
    imageUri: 'https://cards.scryfall.io/large/front/7/8/7873c1f9-572c-4740-82f8-cf3cbc7318d0.jpg?1783932639',
    spell: {
      timing: 'sorcery',
      // Cele wybierane przy rozstrzyganiu („any number of target creature
      // cards ... from YOUR graveyard" — tylko własny grób rzucającego):
      // sekwencyjna decyzja resolve_graveyard_top_choice, nie cast-time
      // targeting, więc targets jest puste.
      targets: [],
      effects: [
        { type: 'graveyard_creatures_to_library_top_choice' },
        { type: 'draw_cards', amount: 1 },
      ],
    },
    artId: 293,
    plan: 'Eldraine',
    support: { status: 'supported', limitations: [] },
    notes: ['na wierzch biblioteki ląduje każdy wybór po kolei (ostatni najwyżej); bez kart-stworów w grobie pierwszy efekt nic nie robi i „Draw a card." rozstrzyga się normalnie'],
  }),

  // 7. Trostani Discordant (CLU) — legendary 1/4: hymn + ETB 2 tokeny, end step
  defineCard({
    id: 'trostani-discordant', name: 'Trostani Discordant', set: 'CLU',
    types: ['Legendary', 'Creature'], subtypes: ['Dryad'], colors: ['G', 'W'],
    power: 1, toughness: 4, manaCost: 5,
    oracleText: 'Other creatures you control get +1/+1.\nWhen Trostani enters, create two 1/1 white Soldier creature tokens with lifelink.\nAt the beginning of your end step, each player gains control of all creatures they own.',
    imageUri: 'https://cards.scryfall.io/large/front/7/9/79d61bba-4404-4336-8290-51d1576f728d.jpg?1783912513',
    abilities: [
      // Hymn (CR 604): zasięg scope.affects — buffuje INNE stwory kontrolera
      // (nie samą Trostani). Przeliczane przy każdym odczycie statystyk.
      createAbility({
        type: ABILITY_TYPE.static,
        scope: { affects: 'other_creatures_you_control' },
        pump: { power: 1, toughness: 1 },
      }),
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'enter_battlefield' },
        effect: [{
          type: 'create_token', cardId: 'token_soldier_lifelink', name: 'Soldier',
          kind: 'creature', amount: 2, power: 1, toughness: 1, colors: ['W'],
          types: ['Creature'], subtypes: ['Soldier'], keywords: ['lifelink'],
        }],
      }),
      // „At the beginning of your end step, each player gains control of all
      // creatures they own." (CR 108.3 — pole ownerId na obiekcie).
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'end_step' },
        effect: [{ type: 'control_to_owners_all_creatures' }],
      }),
    ],
    artId: 331,
    plan: 'Ravnica',
    support: { status: 'supported', limitations: [] },
    notes: ['hymn obejmuje tokeny i stwory dowolnych źródeł pod kontrolą gracza; zmiana kontroli w kroku końcowym nakłada chorobę atakową (CR 302.6)'],
  }),

  // 8. Fear of Burning Alive (DSK) — Enchantment Creature 4/4, ETB 4 dmg,
  //    delirium przy niecombatowych obrażeniach w przeciwnika
  defineCard({
    id: 'fear-of-burning-alive', name: 'Fear of Burning Alive', set: 'DSK',
    types: ['Enchantment', 'Creature'], subtypes: ['Nightmare'], colors: ['R'],
    power: 4, toughness: 4, manaCost: 6,
    oracleText: 'When this creature enters, it deals 4 damage to each opponent.\nDelirium — Whenever a source you control deals noncombat damage to an opponent, if there are four or more card types among cards in your graveyard, this creature deals that amount of damage to target creature that player controls.',
    imageUri: 'https://cards.scryfall.io/large/front/b/2/b282f8e3-8b79-47e9-8c18-62284211442b.jpg?1783909470',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'enter_battlefield' },
        effect: [{ type: 'damage_each_opponent', amount: 4 }],
      }),
      // Delirium (CR 702.34, intervening if CR 603.4): warunek 4+ typów kart
      // w grobie kontrolera sprawdzany przy odpaleniu i przy rozstrzyganiu.
      // Cel (stwór poszkodowanego gracza) wybiera kontroler triggera
      // (resolve_delirium_target); obrażenia w wysokości zdarzenia.
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'noncombat_damage_to_opponent', condition: { delirium: true } },
        effect: [],
      }),
    ],
    artId: 419,
    plan: 'Duskmourn',
    support: { status: 'supported', limitations: [] },
    notes: ['trigger bez legalnego celu nie trafia na stos (nie kolejkuje decyzji); źródło obrażeń może już być w grobie — kontroler czytany z ostatniej znanej informacji (CR 603.10)'],
  }),

  // 9. Jeskai Windscout (KTK) — 2/1 Bird Scout z flying i prowess
  defineCard({
    id: 'jeskai-windscout', name: 'Jeskai Windscout', set: 'KTK',
    types: ['Creature'], subtypes: ['Bird', 'Scout'], colors: ['U'],
    keywords: ['flying'], power: 2, toughness: 1, manaCost: 3,
    oracleText: 'Flying\nProwess (Whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn.)',
    imageUri: 'https://cards.scryfall.io/large/front/6/6/66356e38-38e1-4b09-80c2-be26007ff99c.jpg?1783939088',
    abilities: [
      // Prowess (CR 702.108 — generyczny trigger „you cast a noncreature
      // spell"): instant/sorcery, czar aury (także karta-stwór rzucona za
      // bestow — jest wtedy czarem aury, CR 702.103a) albo permanent
      // nie-będący stworem. Land drop nie jest rzutem.
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'you_cast_noncreature_spell' },
        effect: { type: 'pump', power: 1, toughness: 1 },
      }),
    ],
    artId: 477,
    plan: 'Tarkir',
    support: { status: 'supported', limitations: [] },
  }),

  // 10. Hobble (PLS) — aura: gospodarz nie atakuje, nie blokuje gdy czarny
  defineCard({
    id: 'hobble', name: 'Hobble', set: 'PLS',
    types: ['Enchantment'], subtypes: ['Aura'], colors: ['W'], manaCost: 3,
    // Czysta aura (CR 303.4, jak Serra's Embrace): „enchant creature" — czar
    // aury z celem. Ograniczenia gospodarza egzekwuje combat
    // (permanents.attachmentRestrictions): `cantBlock` warunkowe kolorami
    // gospodarza („can't block if it's black").
    aura: { cantAttack: true, cantBlock: { hostHasColor: 'B' } },
    oracleText: "Enchant creature\nWhen this Aura enters, draw a card.\nEnchanted creature can't attack.\nEnchanted creature can't block if it's black.",
    imageUri: 'https://cards.scryfall.io/large/front/5/4/54c76a22-f9e3-408b-a5bd-403add57e31a.jpg?1783945630',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'enter_battlefield' },
        effect: [{ type: 'draw_cards', amount: 1 }],
      }),
    ],
    artId: 522,
    plan: 'Warhammer Fantasy',
    support: { status: 'supported', limitations: [] },
    notes: ['ograniczenia liczone przy odczycie — odłączenie aury znosi je natychmiast; „can\'t block if it\'s black" ocenia bieżące kolory gospodarza'],
  }),

  // Token Kin-Tree Nurturer (TDM) — endure: N/N biały Spirit (N=1).
  defineCard({
    id: 'token_spirit', name: 'Spirit', set: null,
    types: ['Creature', 'Token'], subtypes: ['Spirit'], colors: ['W'],
    power: 1, toughness: 1, manaCost: 0,
    imageUri: 'https://cards.scryfall.io/large/front/f/2/f22410b3-5c0b-4282-9b0b-5ba61229b6e7.jpg?1783906786',  // ttdm
    support: { status: 'limited', limitations: ['token — nie można umieścić w talii; tworzony przez endure (Kin-Tree Nurturer)'] },
  }),
  // Token Trostani Discordant (CLU): 1/1 biały Soldier z lifelink.
  defineCard({
    id: 'token_soldier_lifelink', name: 'Soldier', set: null,
    types: ['Creature', 'Token'], subtypes: ['Soldier'], colors: ['W'],
    keywords: ['lifelink'], power: 1, toughness: 1, manaCost: 0,
    imageUri: 'https://cards.scryfall.io/large/front/1/7/1774c68a-3d76-4fe1-b741-e6acf6b9214c.jpg?1783916674',  // tmom
    support: { status: 'limited', limitations: ['token — nie można umieścić w talii; tworzony przez Trostani Discordant'] },
  }),

  // ------------------------- Batch 19 (2026-08-06, lista właściciela) -----

  // 1. Illvoi Operative (EOE) — trigger „your second spell each turn"
  defineCard({
    id: 'illvoi-operative', name: 'Illvoi Operative', set: 'EOE',
    types: ['Creature'], subtypes: ['Jellyfish', 'Rogue'], colors: ['U'],
    power: 2, toughness: 1, manaCost: 2,
    oracleText: 'Whenever you cast your second spell each turn, put a +1/+1 counter on this creature.',
    imageUri: 'https://cards.scryfall.io/large/front/d/0/d0ae9fc7-1802-4806-9996-1f1f458ff6a7.jpg?1783905980',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'you_cast_second_spell_each_turn' },
        effect: { type: 'add_counter', counter: '+1/+1', amount: 1 },
      }),
    ],
    artId: 53,
    plan: 'The Edge',
    support: { status: 'supported', limitations: [] },
    notes: ['rzut aury liczy się do „second spell" (zdarzenie aura_spell_cast), jak w MtG'],
  }),

  // 2. Grounded (AVR) — czysta aura: gospodarz traci flying
  defineCard({
    id: 'grounded', name: 'Grounded', set: 'AVR',
    types: ['Enchantment'], subtypes: ['Aura'], colors: ['G'], manaCost: 2,
    aura: { losesKeywords: ['flying'] },
    oracleText: "Enchant creature\nEnchanted creature loses flying.",
    imageUri: 'https://cards.scryfall.io/large/front/d/c/dc4982f0-0ede-4846-82c8-bcf7ad63d099.jpg?1783940666',
    artId: 62,
    plan: 'Innistrad',
    support: { status: 'supported', limitations: [] },
    notes: ['odbiór liczony w warstwie ostatniej effectiveKeywords (po grantach) — wygrywa np. z buffem „gains flying" z innej aury'],
  }),

  // 3. Ruinous Rampage (EOE) — sorcery modalny „Choose one"
  defineCard({
    id: 'ruinous-rampage', name: 'Ruinous Rampage', set: 'EOE',
    types: ['Sorcery'], colors: ['R'], manaCost: 3,
    oracleText: "Choose one —\n• Ruinous Rampage deals 3 damage to each opponent.\n• Exile all artifacts with mana value 3 or less.",
    imageUri: 'https://cards.scryfall.io/large/front/9/1/91d7a4c2-1a4b-4e9f-b543-225b6906752f.jpg?1783905947',
    spell: {
      timing: 'sorcery',
      modes: [
        // 3 obrażenia każdemu przeciwnikowi (jak ETB Fear of Burning Alive).
        // Oracle: pierwszy tryb nie ma własnej nazwy ("• Ruinous Rampage deals…"),
        // więc używamy nazwy karty jako nazwy trybu ("Ruinous Rampage").
        {
          name: '3 obrażenia dla każdego przeciwnika',
          effects: [{ type: 'damage_each_opponent', amount: 3 }],
        },
        // Bezcelowe wygnanie wszystkich artefaktów o MV ≤ 3.
        // Oracle: "• Exile all artifacts with mana value 3 or less" — brak
        // własnej nazwy, więc skrócona "Exile Artifacts".
        {
          name: 'Wygnaj artefakty',
          effects: [{ type: 'exile_all', filter: { types: ['Artifact'], manaValueAtMost: 3 } }],
        },
      ],
    },
    artId: 475,
    plan: 'The Edge',
    support: { status: 'supported', limitations: [] },
  }),

  // 4. Tellah, Great Sage (FIN) — progi wydanej many na triggerze noncreature
  defineCard({
    id: 'tellah-great-sage', name: 'Tellah, Great Sage', set: 'FIN',
    types: ['Legendary', 'Creature'], subtypes: ['Human', 'Wizard'], colors: ['U', 'R'],
    power: 3, toughness: 3, manaCost: 5,
    oracleText: 'Whenever you cast a noncreature spell, create a 1/1 colorless Hero creature token. If four or more mana was spent to cast that spell, draw two cards. If eight or more mana was spent to cast that spell, sacrifice Tellah and it deals that much damage to each opponent.',
    imageUri: 'https://cards.scryfall.io/large/front/a/6/a67793ef-ef80-4434-9c54-e3fd8a270bbe.jpg?1783906561',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'you_cast_noncreature_spell' },
        effect: [
          { type: 'create_token', cardId: 'token_hero', name: 'Hero', kind: 'creature', power: 1, toughness: 1, colors: [], types: ['Creature'], subtypes: ['Hero'], amount: 1 },
          { type: 'draw_cards', amount: 2, condition: { manaSpentAtLeast: 4 } },
          { type: 'sacrifice_permanent', condition: { manaSpentAtLeast: 8 } },
          { type: 'damage_each_opponent', amountFrom: 'manaSpent', condition: { manaSpentAtLeast: 8 } },
        ],
      }),
    ],
    artId: 15,
    plan: 'Final Fantasy',
    support: { status: 'supported', limitations: [] },
    notes: ['wydana mana = efektywny koszt many rzutu (bez części opłaconej życiem; koszty dodatkowe nie zwiększają licznika)'],
  }),

  // 5. Etherium Sculptor (ALA) — statyczna obniżka kosztu artefaktów o {1}
  defineCard({
    id: 'etherium-sculptor', name: 'Etherium Sculptor', set: 'ALA',
    types: ['Artifact', 'Creature'], subtypes: ['Vedalken', 'Artificer'], colors: ['U'],
    power: 1, toughness: 2, manaCost: 2,
    oracleText: 'Artifact spells you cast cost {1} less to cast.',
    imageUri: 'https://cards.scryfall.io/large/front/0/d/0d050f2d-bd65-4ab9-9ea6-9deba91b2792.jpg?1783942575',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.static,
        costModifier: { spellTypes: ['Artifact'], amount: 1 },
      }),
    ],
    artId: 285,
    plan: 'Alara',
    support: { status: 'supported', limitations: [] },
  }),

  // 6. Boros Challenger (GRN) — mentor + aktywowany pump
  defineCard({
    id: 'boros-challenger', name: 'Boros Challenger', set: 'GRN',
    types: ['Creature'], subtypes: ['Human', 'Soldier'], colors: ['R', 'W'],
    power: 2, toughness: 3, manaCost: 2,
    oracleText: 'Mentor (Whenever this creature attacks, put a +1/+1 counter on target attacking creature with lesser power.)\n{2}{R}{W}: This creature gets +1/+1 until end of turn.',
    imageUri: 'https://cards.scryfall.io/large/front/5/4/545f3a30-7984-4046-8a14-51bc9cbc3fe0.jpg?1783934141',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'mentor_attacks' },
        effect: [],
      }),
      createAbility({
        type: ABILITY_TYPE.activated,
        cost: { mana: 4, colors: ['R', 'W'] },
        effect: { type: 'pump', power: 1, toughness: 1 },
      }),
    ],
    artId: 140,
    plan: 'Ravnica',
    support: { status: 'supported', limitations: [] },
  }),

  // 7. Pilgrim's Eye (GNT) — ETB: szukaj basic landa do ręki (reveal+shuffle)
  defineCard({
    id: 'pilgrims-eye', name: "Pilgrim's Eye", set: 'GNT',
    types: ['Artifact', 'Creature'], subtypes: ['Thopter'], colors: [],
    keywords: ['flying'], power: 1, toughness: 1, manaCost: 3,
    oracleText: "Flying\nWhen this creature enters, you may search your library for a basic land card, reveal it, put it into your hand, then shuffle.",
    imageUri: 'https://cards.scryfall.io/large/front/3/b/3bef04f5-4498-40c7-bfc2-0e2e619fcca1.jpg?1783933968',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'enter_battlefield' },
        effect: [{ type: 'search_library_to_hand', qualifier: { types: ['Basic', 'Land'] } }],
      }),
    ],
    artId: 132,
    plan: 'Zendikar',
    support: { status: 'supported', limitations: [] },
  }),

  // 8. Dementia Bat (NPH) — {4}{B}, poświęć: cel-gracz odrzuca 2 karty
  defineCard({
    id: 'dementia-bat', name: 'Dementia Bat', set: 'NPH',
    types: ['Creature'], subtypes: ['Phyrexian', 'Bat'], colors: ['B'],
    keywords: ['flying'], power: 2, toughness: 2, manaCost: 5,
    oracleText: 'Flying\n{4}{B}, Sacrifice this creature: Target player discards two cards.',
    imageUri: 'https://cards.scryfall.io/large/front/7/2/72ae22c3-2dea-463e-894a-188657849909.jpg?1783941315',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.activated,
        cost: { mana: 5, sacrificeSelf: true, colors: ['B'] },
        targets: [{ type: 'opponent' }],
        effect: [{ type: 'discard_cards', amount: 2, applyTo: 'target' }],
      }),
    ],
    artId: 403,
    plan: 'Mirrodin',
    support: { status: 'supported', limitations: [] },
  }),

  // 9. Seer's Lantern (OGW) — artefakt many {C} + aktywowane scry 1
  defineCard({
    id: 'seers-lantern', name: "Seer's Lantern", set: 'OGW',
    types: ['Artifact'], colors: [], manaCost: 3,
    oracleText: '{T}: Add {C}.\n{2}, {T}: Scry 1. (Look at the top card of your library. You may put that card on the bottom.)',
    imageUri: 'https://cards.scryfall.io/large/front/6/6/6618a854-7d9c-4e57-b959-4c0259cb4d97.jpg?1783937894',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.activated,
        cost: { tap: true },
        effect: { type: 'add_mana', amount: 1 },
      }),
      createAbility({
        type: ABILITY_TYPE.activated,
        cost: { mana: 2, tap: true },
        effect: { type: 'scry', amount: 1 },
      }),
    ],
    artId: 489,
    plan: 'Śródziemie',
    support: { status: 'supported', limitations: [] },
    notes: ['produkcja {C} = 1 bezbarwna many (pula engine jest bezbarwna); zdolność many w MANA_SOURCE_MAP jak inne artefakty many'],
  }),

  // 10. You're Confronted by Robbers (CLB) — instant modalny „Choose one"
  defineCard({
    id: 'youre-confronted-by-robbers', name: "You're Confronted by Robbers", set: 'CLB',
    types: ['Instant'], colors: ['W'], manaCost: 4,
    oracleText: "Choose one —\n• Stall for Time — Tap up to three target creatures.\n• Call for Aid — Create three 1/1 white Soldier creature tokens.",
    imageUri: 'https://cards.scryfall.io/large/front/f/7/f76e5d23-a45f-4100-8638-fce33f290fc6.jpg?1783922797',
    spell: {
      timing: 'instant',
      modes: [
        // Stall for Time: tap do 3 celowanych stworów (jak Aerith tryb B bez stun).
        {
          // Nazwa trybu z Oracle text (CLB): widoczna w etykiecie akcji.
          name: 'Zyskiwanie czasu',
          variableTargets: { type: 'creature', min: 0, max: 3 },
          effects: [{ type: 'tap_permanents', applyTo: 'allChosen' }],
        },
        // Call for Aid: trzy 1/1 białe tokeny Soldier.
        {
          name: 'Wezwanie pomocy',
          effects: [{
            type: 'create_token', cardId: 'token_soldier', name: 'Soldier',
            kind: 'creature', power: 1, toughness: 1, colors: ['W'],
            types: ['Creature'], subtypes: ['Soldier'], amount: 3,
          }],
        },
      ],
    },
    artId: 532,
    plan: 'Warhammer Fantasy',
    support: { status: 'supported', limitations: [] },
  }),


  // ===================== Batch 20 (10 kart, 2026-08-06) ======================

  // 1. Rustwing Falcon (M19) — vanilla 1/2 Bird z flying.
  defineCard({
    id: 'rustwing-falcon', name: 'Rustwing Falcon', set: 'M19',
    types: ['Creature'], subtypes: ['Bird'], colors: ['W'],
    power: 1, toughness: 2, manaCost: 1, keywords: ['flying'],
    oracleText: 'Flying',
    imageUri: 'https://cards.scryfall.io/large/front/c/6/c6691e62-8887-41e8-8e74-76ee2353d45e.jpg?1783934596',
    artId: 503, plan: 'Śródziemie',
    support: { status: 'supported', limitations: [] },
  }),

  // 2. Monastery Flock (KTK) — 0/5 Bird, defender + flying, Morph {U}.
  defineCard({
    id: 'monastery-flock', name: 'Monastery Flock', set: 'KTK',
    types: ['Creature'], subtypes: ['Bird'], colors: ['U'],
    // {2}{U} — mana value 3 (M105/B3: było 2, czyli stwór o manę tańszy).
    power: 0, toughness: 5, manaCost: 3, keywords: ['defender', 'flying'],
    morph: { cost: 3, morphCost: 1, colors: ['U'] },
    oracleText: 'Defender, flying\nMorph {U} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)',
    imageUri: 'https://cards.scryfall.io/large/front/e/5/e53c0e50-4b0b-43d8-80c0-2c216722c87a.jpg?1783939087',
    artId: 467, plan: 'Tarkir',
    support: { status: 'supported', limitations: [] },
  }),

  // 3. Death-Hood Cobra (2XM) — {1}{G}: reach EOT; {1}{G}: deathtouch EOT (self).
  defineCard({
    id: 'death-hood-cobra', name: 'Death-Hood Cobra', set: '2XM',
    types: ['Creature'], subtypes: ['Phyrexian', 'Snake'], colors: ['G'],
    power: 2, toughness: 2, manaCost: 2,
    oracleText: '{1}{G}: This creature gains reach until end of turn.\n{1}{G}: This creature gains deathtouch until end of turn.',
    imageUri: 'https://cards.scryfall.io/large/front/d/e/def88ab5-1b82-46f5-a136-ee1addff4214.jpg?1783930149',
    artId: 533, plan: 'Mirrodin',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.activated,
        cost: { mana: 2, colors: ['G'] },
        effect: { type: 'grant_keywords_until_end_of_turn', keywords: ['reach'] },
      }),
      createAbility({
        type: ABILITY_TYPE.activated,
        cost: { mana: 2, colors: ['G'] },
        effect: { type: 'grant_keywords_until_end_of_turn', keywords: ['deathtouch'] },
      }),
    ],
    support: { status: 'supported', limitations: [] },
  }),

  // 4. Coralhelm Guide (BFZ) — {4}{U}: target creature can't be blocked this turn
  defineCard({
    id: 'coralhelm-guide', name: 'Coralhelm Guide', set: 'BFZ',
    types: ['Creature'], subtypes: ['Merfolk', 'Scout', 'Ally'], colors: ['U'],
    power: 2, toughness: 1, manaCost: 2,
    oracleText: '{4}{U}: Target creature can\'t be blocked this turn.',
    imageUri: 'https://cards.scryfall.io/large/front/3/3/33787a5b-d1d1-4d60-ba09-d9c98025e9b3.jpg?1783938210',
    artId: 2, plan: 'Zendikar',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.activated,
        cost: { mana: 5, colors: ['U'] },
        targets: [{ type: 'creature' }],
        effect: { type: 'cant_be_blocked' },
      }),
    ],
    support: { status: 'supported', limitations: [] },
  }),

  // 5. Gorehorn Minotaurs (MM2) — Bloodthirst 2
  defineCard({
    id: 'gorehorn-minotaurs', name: 'Gorehorn Minotaurs', set: 'MM2',
    types: ['Creature'], subtypes: ['Minotaur', 'Warrior'], colors: ['R'],
    power: 3, toughness: 3, manaCost: 4,
    bloodthirst: 2,
    oracleText: 'Bloodthirst 2 (If an opponent was dealt damage this turn, this creature enters with two +1/+1 counters on it.)',
    imageUri: 'https://cards.scryfall.io/large/front/c/d/cda652b4-3ae5-4a5b-be82-c0e47a886907.jpg?1783938405',
    artId: 83, plan: 'Warhammer Fantasy',
    support: { status: 'supported', limitations: [] },
  }),

  // 6. Caravan Vigil (ISD) — search basic land; Morbid → battlefield instead
  defineCard({
    id: 'caravan-vigil', name: 'Caravan Vigil', set: 'ISD',
    types: ['Sorcery'], colors: ['G'], manaCost: 1,
    oracleText: 'Search your library for a basic land card, reveal it, put it into your hand, then shuffle.\nMorbid — You may put that card onto the battlefield instead of putting it into your hand if a creature died this turn.',
    imageUri: 'https://cards.scryfall.io/large/front/9/a/9a8dfb98-a975-41bf-8aac-c0001c9ddaa7.jpg?1783940922',
    artId: 381, plan: 'Innistrad',
    spell: {
      timing: 'sorcery', targets: [],
      effects: [{ type: 'search_basic_land_morbid' }],
    },
    support: { status: 'supported', limitations: [] },
  }),

  // 7. Chittering Rats (DST) — ETB: opponent puts hand card on top of library
  defineCard({
    id: 'chittering-rats', name: 'Chittering Rats', set: 'DST',
    types: ['Creature'], subtypes: ['Rat'], colors: ['B'],
    power: 2, toughness: 2, manaCost: 3,
    oracleText: 'When this creature enters, target opponent puts a card from their hand on top of their library.',
    imageUri: 'https://cards.scryfall.io/large/front/9/8/980135d5-dfaa-4beb-b4b3-1e256bb46e61.jpg?1783944446',
    artId: 540, plan: 'Świat Wiedźmina',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'enter_battlefield', requiresTarget: { type: 'opponent' } },
        effect: [{ type: 'opponent_hand_card_to_top' }],
      }),
    ],
    support: { status: 'supported', limitations: [] },
  }),

  // 8. Goldmeadow Nomad (ECL) — {W}, Exile from graveyard: 1/1 Kithkin token
  defineCard({
    id: 'goldmeadow-nomad', name: 'Goldmeadow Nomad', set: 'ECL',
    types: ['Creature'], subtypes: ['Kithkin', 'Scout'], colors: ['W'],
    power: 1, toughness: 2, manaCost: 1,
    oracleText: '{W}, Exile this card from your graveyard: Create a 1/1 green and white Kithkin creature token. Activate only as a sorcery.',
    imageUri: 'https://cards.scryfall.io/large/front/0/0/00ddbe6c-11de-4bc6-aabe-d6d8385a838a.jpg?1783904506',
    artId: 190, plan: 'Lorwyn',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.activated,
        cost: { mana: 1, exileFromGraveyard: true, colors: ['W'] },
        timing: 'sorcery',
        fromGraveyard: true,
        effect: { type: 'create_token', cardId: 'token_kithkin', name: 'Kithkin', kind: 'creature', power: 1, toughness: 1, colors: ['G', 'W'], types: ['Creature'], subtypes: ['Kithkin'] },
      }),
    ],
    support: { status: 'supported', limitations: [] },
  }),

  // Token Goldmeadow Nomad (ECL): 1/1 green/white Kithkin.
  defineCard({
    id: 'token_kithkin', name: 'Kithkin', set: null,
    types: ['Creature', 'Token'], subtypes: ['Kithkin'], colors: ['G', 'W'],
    power: 1, toughness: 1, manaCost: 0,
    imageUri: 'https://cards.scryfall.io/large/front/2/e/2ed11e1b-2289-48d2-8d96-ee7e590ecfd4.jpg?1783904325',  // tecl
    support: { status: 'limited', limitations: ['token — nie można umieścić w talii; tworzony przez Goldmeadow Nomad'] },
  }),

  // 9. Fear of Abduction (DSK) — exile own creature cost + ETB exile opp + LTB return
  defineCard({
    id: 'fear-of-abduction', name: 'Fear of Abduction', set: 'DSK',
    types: ['Enchantment', 'Creature'], subtypes: ['Nightmare'], colors: ['W'],
    power: 5, toughness: 5, manaCost: 6, keywords: ['flying'],
    additionalCost: { exileCreature: true },
    oracleText: 'As an additional cost to cast this spell, exile a creature you control.\nFlying\nWhen this creature enters, exile target creature an opponent controls.\nWhen this creature leaves the battlefield, put each card exiled with it into its owner\'s hand.',
    imageUri: 'https://cards.scryfall.io/large/front/f/c/fc9374be-5e4b-4c23-8b6e-94c03d4f5ef1.jpg?1783909510',
    artId: 373, plan: 'Duskmourn',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'enter_battlefield', requiresTarget: { type: 'creature_opponent_controls' } },
        effect: [{ type: 'exile_opponent_creature' }],
      }),
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'leaves_battlefield' },
        effect: [{ type: 'return_banished_to_hand' }],
      }),
    ],
    support: { status: 'supported', limitations: [] },
  }),

  // 10. Moonlit Meditation (EOE) — replacement: first token → copies of enchanted permanent
  defineCard({
    id: 'moonlit-meditation', name: 'Moonlit Meditation', set: 'EOE',
    types: ['Enchantment'], subtypes: ['Aura'], colors: ['U'], manaCost: 3,
    // M117 (ADR 0002): efekt zastępczy jako DESKRYPTOR karty. Wcześniej
    // engine rozpoznawał tę kartę po `cardId === 'moonlit-meditation'`.
    aura: {
      enchantType: 'artifact_or_creature',
      replaceTokenCreation: { copiesOfEnchanted: true, oncePerTurn: true, optional: true },
    },
    oracleText: 'Enchant artifact or creature you control\\nThe first time you would create one or more tokens each turn, you may instead create that many tokens that are copies of enchanted permanent.',
    imageUri: 'https://cards.scryfall.io/large/front/f/2/f2a56007-5bca-4edf-9cc4-5f77a273636c.jpg?1783905978',
    artId: 281, plan: 'The Edge',
    support: { status: 'supported', limitations: [] },
  }),

  // Token-klon (Moonlit Meditation): kopia zaczarowanego permanentu — nie taliowalna.
  defineCard({
    id: 'token_clone', name: 'Clone', set: null,
    types: ['Token'], colors: [],
    imageUri: 'https://cards.scryfall.io/large/front/b/2/b2a03ba1-2182-4074-99f5-f3952c1d37ec.jpg?1783902815',  // tmsc
    support: { status: 'limited', limitations: [] },
    notes: ['token-klon — tworzony przez Moonlit Meditation; P/T/typy zależą od zaczarowanego permanentu'],
  }),

  // Uwaga (Batch 19): tokeny Soldier z CLB to istniejący `token_soldier`
  // (definicja z Captain's Call) — identyczny profil 1/1 biały Soldier;
  // nowego tokena nie dodajemy (deduplikacja).


  // ===================== Batch 21 (10 kart, 2026-08-07) ======================

  // 1. Servant of the Scale (DTK) — ETB +1/+1; dies przenosi liczniki na cel.
  defineCard({
    id: 'servant-of-the-scale', name: 'Servant of the Scale', set: 'DTK',
    types: ['Creature'], subtypes: ['Human', 'Soldier'], colors: ['G'],
    power: 0, toughness: 0, manaCost: 1,
    entersWithCounters: { '+1/+1': 1 },
    oracleText: 'This creature enters with a +1/+1 counter on it.\nWhen this creature dies, put X +1/+1 counters on target creature you control, where X is the number of +1/+1 counters on this creature.',
    imageUri: 'https://cards.scryfall.io/large/front/c/a/ca887c41-a8ee-4751-a902-87149c29a9df.jpg?1783938577',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'dies', requiresTarget: { type: 'creature_you_control' } },
        effect: [{ type: 'transfer_counters_on_dies', counter: '+1/+1' }],
      }),
    ],
    artId: 10, plan: 'Tarkir',
    support: { status: 'supported', limitations: [] },
  }),

  // 2. Gray Slaad (CLB) — Adventure: Entropic Decay {1}{B} mill 4 → exile,
  //    potem rzut stwora z exile; menace+deathtouch przy >= 4 kartach stwora.
  defineCard({
    id: 'gray-slaad', name: 'Gray Slaad', set: 'CLB',
    types: ['Creature'], subtypes: ['Frog', 'Horror'], colors: ['B'],
    power: 4, toughness: 1, manaCost: 3,
    oracleText: 'As long as there are four or more creature cards in your graveyard, this creature has menace and deathtouch.\nEntropic Decay — {1}{B} (Then exile this card. You may cast the creature later from exile.)',
    imageUri: 'https://cards.scryfall.io/large/front/0/c/0c2b6960-ff4c-4557-ba6d-d504f87d4516.jpg?1783922760',
    adventure: {
      cost: 2, colors: ['B'],
      spell: { timing: 'sorcery', targets: [], effects: [{ type: 'mill_cards', amount: 4 }] },
    },
    abilities: [
      createAbility({
        type: ABILITY_TYPE.static,
        condition: { minCreatureCardsInGraveyard: 4 },
        keywords: ['menace', 'deathtouch'],
      }),
    ],
    artId: 234, plan: 'Forgotten Realms',
    support: { status: 'supported', limitations: [] },
  }),

  // 3. Ember Beast (GTC) — „can't attack or block alone".
  defineCard({
    id: 'ember-beast', name: 'Ember Beast', set: 'GTC',
    types: ['Creature'], subtypes: ['Beast'], colors: ['R'],
    power: 3, toughness: 4, manaCost: 3,
    oracleText: "This creature can't attack or block alone.",
    imageUri: 'https://cards.scryfall.io/large/front/8/a/8a6d9cab-b07b-456b-9562-7ea7f6bec7f3.jpg?1783940125',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.static,
        cantAttackAlone: true, cantBlockAlone: true,
      }),
    ],
    artId: 26, plan: 'Ravnica',
    support: { status: 'supported', limitations: [] },
  }),

  // 4. Kor Sanctifiers (HOP) — Kicker {W}; ETB „if it was kicked" niszczy
  //    celowy artefakt/enchantment.
  defineCard({
    id: 'kor-sanctifiers', name: 'Kor Sanctifiers', set: 'HOP',
    types: ['Creature'], subtypes: ['Kor', 'Cleric'], colors: ['W'],
    power: 2, toughness: 3, manaCost: 3,
    kicker: { cost: 1, colors: ['W'] },
    oracleText: 'Kicker {W} (You may pay an additional {W} as you cast this spell.)\nWhen this creature enters, if it was kicked, destroy target artifact or enchantment.',
    imageUri: 'https://cards.scryfall.io/large/front/2/c/2c1544bf-d4f4-4e3a-9b93-8ea50bc86922.jpg?1783942336',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: {
          event: 'enter_battlefield',
          requiresTarget: { type: 'artifact_or_enchantment' },
          condition: { wasKicked: true },
        },
        effect: [{ type: 'destroy_permanent' }],
      }),
    ],
    artId: 43, plan: 'Zendikar',
    support: { status: 'supported', limitations: [] },
  }),

  // 5. Irontread Crusher (AER) — Vehicle, Crew 3 (6/6 artefaktowy stwór do
  //    końca tury po zatapnięciu stworów o łącznej mocy >= 3).
  defineCard({
    id: 'irontread-crusher', name: 'Irontread Crusher', set: 'AER',
    types: ['Artifact'], subtypes: ['Vehicle'], colors: [],
    power: 6, toughness: 6, manaCost: 4,
    oracleText: 'Crew 3 (Tap any number of creatures you control with total power 3 or more: This Vehicle becomes an artifact creature until end of turn.)',
    imageUri: 'https://cards.scryfall.io/large/front/8/1/81873223-29c7-466b-b922-6717ec84afff.jpg?1783936726',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.activated,
        // Crew (CR 701.36) NIE ma w Oracle „Activate only as a sorcery" —
        // aktywuje się jak instant (z priorytetem, także w turze przeciwnika).
        // Audyt Batchu 26 (M65): timing 'sorcery' blokował crew w odpowiedzi
        // na czar i w turze przeciwnika.
        cost: { crewPower: 3 },
        effect: { type: 'animate_permanent_until_end_of_turn', power: 6, toughness: 6, typesAdd: ['Creature'] },
      }),
    ],
    artId: 455, plan: 'Warhammer Fantasy',
    support: { status: 'supported', limitations: [] },
  }),

  // 6. Skilled Animator (CMR) — ETB: celowy artefakt staje się artefaktowym
  //    stworem 5/5, DOPÓKI animator jest na bitwisku (linked animation).
  defineCard({
    id: 'skilled-animator', name: 'Skilled Animator', set: 'CMR',
    types: ['Creature'], subtypes: ['Human', 'Artificer'], colors: ['U'],
    power: 1, toughness: 3, manaCost: 3,
    oracleText: "When this creature enters, target artifact you control becomes an artifact creature with base power and toughness 5/5 for as long as this creature remains on the battlefield.",
    imageUri: 'https://cards.scryfall.io/large/front/b/c/bc396c69-9773-4d57-a955-280742a10a91.jpg?1783928850',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'enter_battlefield', requiresTarget: { type: 'artifact_you_control' } },
        effect: [{ type: 'animate_linked', power: 5, toughness: 5, typesAdd: ['Artifact', 'Creature'] }],
      }),
    ],
    artId: 204, plan: 'Kaladesh',
    support: { status: 'supported', limitations: [] },
  }),

  // 7. Withstand (GPT) — tarcza prewencji „next 3 damage" na dowolny cel + draw.
  defineCard({
    id: 'withstand', name: 'Withstand', set: 'GPT',
    types: ['Instant'], colors: ['W'], manaCost: 3,
    oracleText: 'Prevent the next 3 damage that would be dealt to any target this turn.\nDraw a card.',
    imageUri: 'https://cards.scryfall.io/large/front/b/b/bb458f79-13dd-4446-be75-463f19548867.jpg?1783943523',
    spell: {
      timing: 'instant',
      targets: [{ type: 'any_target' }],
      effects: [
        { type: 'prevent_next_damage', amount: 3 },
        { type: 'draw_cards', amount: 1 },
      ],
    },
    artId: 137, plan: 'Ravnica',
    support: { status: 'supported', limitations: [] },
  }),

  // 8. Nightshade Harvester (CMR) — landfall przeciwnika: ten gracz traci
  //    życie, źródło dostaje +1/+1.
  defineCard({
    id: 'nightshade-harvester', name: 'Nightshade Harvester', set: 'CMR',
    types: ['Creature'], subtypes: ['Elf', 'Shaman'], colors: ['B'],
    power: 2, toughness: 2, manaCost: 4,
    oracleText: 'Whenever a land an opponent controls enters, that player loses 1 life. Put a +1/+1 counter on this creature.',
    imageUri: 'https://cards.scryfall.io/large/front/8/2/8297ab13-d6f3-487b-86ec-6eb299eb0614.jpg?1783928832',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'land_entered_under_opponent_control' },
        effect: [
          { type: 'lose_life', amount: 1, applyTo: 'event_player' },
          { type: 'add_counter', counter: '+1/+1', amount: 1 },
        ],
      }),
    ],
    artId: 430, plan: 'Wiedźmin',
    support: { status: 'supported', limitations: [] },
  }),

  // 9. True Conviction (SOM) — globalny anthem keywordów: double strike
  //    i lifelink dla stworów kontrolera.
  defineCard({
    id: 'true-conviction', name: 'True Conviction', set: 'SOM',
    types: ['Enchantment'], colors: ['W'], manaCost: 6,
    oracleText: 'Creatures you control have double strike and lifelink.',
    imageUri: 'https://cards.scryfall.io/large/front/2/3/23a1d384-1b36-42d0-957f-48103f9cdbdd.jpg?1783941741',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.static,
        scope: { affects: 'other_creatures_you_control' },
        keywords: ['double_strike', 'lifelink'],
      }),
    ],
    artId: 482, plan: 'Mirrodin',
    support: { status: 'supported', limitations: [] },
  }),

  // 10. Disa the Restless (M3C) — Lhurgoyf z dowolnej strefy do grobu → na
  //     bitwisko; combat damage stworami → token Tarmogoyf (dynamiczne P/T).
  defineCard({
    id: 'disa-the-restless', name: 'Disa the Restless', set: 'M3C',
    types: ['Legendary', 'Creature'], subtypes: ['Human', 'Scout'], colors: ['B', 'R', 'G'],
    power: 5, toughness: 6, manaCost: 5,
    oracleText: 'Whenever a Lhurgoyf permanent card is put into your graveyard from anywhere other than the battlefield, put it onto the battlefield.\nWhenever one or more creatures you control deal combat damage to a player, create a Tarmogoyf token.',
    imageUri: 'https://cards.scryfall.io/large/front/c/9/c976edeb-0fa1-4647-a16c-870d8a3c30c6.jpg?1783911438',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'card_put_into_graveyard_from_nonbattlefield', subtypes: ['Lhurgoyf'] },
        effect: [{ type: 'put_graveyard_card_onto_battlefield' }],
      }),
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'any_combat_damage_to_player' },
        effect: [{
          type: 'create_token', cardId: 'token_tarmogoyf', name: 'Tarmogoyf',
          kind: 'creature', power: 0, toughness: 0, colors: ['G'],
          types: ['Creature'], subtypes: ['Lhurgoyf'],
          // Dynamiczne P/T: liczba typów kart we WSZYSTKICH grobach (+1
          // do wytrzymałości) — marker liczony w permanents.staticBonuses.
          abilities: [createAbility({
            type: ABILITY_TYPE.static,
            pump: { power: 'card_types_in_all_graveyards', toughness: 'card_types_in_all_graveyards_plus_1' },
          })],
        }],
      }),
    ],
    artId: 531, plan: 'Dominaria',
    support: { status: 'supported', limitations: [] },
  }),

  // Token Tarmogoyf (Disa the Restless, M3C): */*+1 — nie taliowalny.
  defineCard({
    id: 'token_tarmogoyf', name: 'Tarmogoyf', set: null,
    types: ['Creature', 'Token'], subtypes: ['Lhurgoyf'], colors: ['G'],
    power: 0, toughness: 0, manaCost: 0,
    oracleText: "Tarmogoyf's power is equal to the number of card types among cards in all graveyards and its toughness is equal to that number plus 1.",
    abilities: [
      createAbility({
        type: ABILITY_TYPE.static,
        pump: { power: 'card_types_in_all_graveyards', toughness: 'card_types_in_all_graveyards_plus_1' },
      }),
    ],
    imageUri: 'https://cards.scryfall.io/large/front/f/2/f26e1f55-284c-4540-bf5c-ebc7ab9687ab.jpg?1783911122',  // tm3c
    support: { status: 'limited', limitations: ['token — nie można umieścić w talii; tworzony przez Disa the Restless'] },
  }),

  // =========================================================================
  // Batch 22 (10 kart, 2026-08-08) — lista właściciela
  // Thistledown Players, Etherwrought Page, Stomping Slabs, Courage in
  // Crisis, Selesnya Charm, Wormfang Newt, Raise the Alarm, Cellar Door,
  // Healer of the Glade, Enter the Enigma. Dane Oracle w
  // docs/cards/scryfall-*.json, artId i plan ze słownika
  // tools/collection-art-ids.csv.
  // =========================================================================

  // 1. Thistledown Players (BLB) {2}{W} 3/3 — trigger attacks + untap
  // target nonland permanent (T2: cel wybiera kontroler).
  defineCard({
    id: 'thistledown-players', name: 'Thistledown Players', set: 'BLB',
    types: ['Creature'], subtypes: ['Mouse', 'Bard'], colors: ['W'],
    power: 3, toughness: 3, manaCost: 3,
    oracleText: 'Whenever this creature attacks, untap target nonland permanent.',
    imageUri: 'https://cards.scryfall.io/large/front/a/f/afa8d83f-8586-4127-8b55-9715e9547488.jpg?1783910855',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'attacks', requiresTarget: { type: 'nonland_permanent' } },
        effect: [{ type: 'untap_permanent' }],
      }),
    ],
    artId: 374,
    plan: 'Bloomburrow',
    support: { status: 'supported', limitations: [] },
  }),

  // 2. Etherwrought Page (ARB) {1}{W}{U}{B} Artifact — upkeep trigger
  // "choose one" (modalne tryby). Boty deterministycznie biorą
  // pierwszą (tryb 0 = gain 2 life) — modalność zostawiamy dla
  // graczy (resolve_modal_choice).
  defineCard({
    id: 'etherwrought-page', name: 'Etherwrought Page', set: 'ARB',
    types: ['Artifact'], colors: ['B', 'U', 'W'], manaCost: 4,
    oracleText: 'At the beginning of your upkeep, choose one —\n• You gain 2 life.\n• Surveil 1. (Look at the top card of your library. You may put that card into your graveyard.)\n• Each opponent loses 1 life.',
    imageUri: 'https://cards.scryfall.io/large/front/5/6/568785f1-47c7-4011-926f-44693f7e0233.jpg?1783942417',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: {
          event: 'upkeep',
          // Modalne tryby (Batch 22): kolejka pendingModalTrigger →
          // resolve_modal_choice. Boty biorą pierwszą opcję (tryb 0).
          modes: [
            { name: 'Zysk 2 życia', effects: [{ type: 'gain_life', amount: 2, scope: 'controller' }] },
            { name: 'Surveil 1',  effects: [{ type: 'surveil', amount: 1 }] },
            { name: 'Utrata życia',    effects: [{ type: 'lose_life', amount: 1, scope: 'each_opponent' }] },
          ],
        },
        effect: [],
      }),
    ],
    artId: 55,
    plan: 'Alara',
    support: { status: 'supported', limitations: [] },
  }),

  // 3. Stomping Slabs (MOR) {2}{R} Sorcery — reveal top 7 + put bottom
  // in any order; if „Stomping Slabs" was in reveal, deal 7 to any
  // target. Mechaniki: reveal_top_to_bottom_order (Batch 22) + kolejka
  // pendingDamageTarget (resolve_damage_target).
  defineCard({
    id: 'stomping-slabs', name: 'Stomping Slabs', set: 'MOR',
    types: ['Sorcery'], colors: ['R'], manaCost: 3,
    oracleText: 'Reveal the top seven cards of your library, then put those cards on the bottom of your library in any order. If a card named Stomping Slabs was revealed this way, Stomping Slabs deals 7 damage to any target.',
    imageUri: 'https://cards.scryfall.io/large/front/8/2/820f1acf-7f0c-4ee5-9f18-b5627aac7c81.jpg?1783942782',
    spell: {
      timing: 'sorcery', targets: [],
      effects: [{
        type: 'reveal_top_to_bottom_order',
        amount: 7,
        namedCard: 'Stomping Slabs',
        thenDamage: 7,
      }],
    },
    artId: 182,
    plan: 'Lorwyn',
    support: { status: 'supported', limitations: [] },
  }),

  // =========================================================================
  // Batch 23 (10 kart, 2026-08-08) — lista właściciela
  // Vandalize, Expunge, Shiv's Embrace, Deepwood Denizen, Welder Automaton,
  // Feedback, Vow of Wildness, Greater Tanuki, Scorch Spitter, Turn the Tide.
  // Dane Oracle w docs/cards/scryfall-*.json, artId i plan ze słownika
  // tools/collection-art-ids.csv.
  // =========================================================================

  // 1. Vandalize (DTK) {4}{R} Sorcery — Choose one or both — Destroy artifact, Destroy land.
  // Uproszczenie Oracle "one or both" do 3 trybów (artifact / land / both) — 100% pokrycia wyborów.
  defineCard({
    id: 'vandalize', name: 'Vandalize', set: 'DTK',
    types: ['Sorcery'], colors: ['R'], manaCost: 5,
    oracleText: 'Choose one or both —\n• Destroy target artifact.\n• Destroy target land.',
    imageUri: 'https://cards.scryfall.io/large/front/4/8/48b04f7a-4fd6-47d2-b378-99c7fb0c1809.jpg?1783938584',
    spell: {
      timing: 'sorcery',
      modes: [
        { name: 'Destroy artifact', targets: [{ type: 'artifact' }], effects: [{ type: 'destroy_permanent' }] },
        { name: 'Destroy land', targets: [{ type: 'land' }], effects: [{ type: 'destroy_permanent' }] },
        { name: 'Destroy both', targets: [{ type: 'artifact' }, { type: 'land' }], effects: [{ type: 'destroy_permanent', targetIndex: 0 }, { type: 'destroy_permanent', targetIndex: 1 }] },
      ],
    },
    artId: 499,
    plan: 'Tarkir',
    support: { status: 'supported', limitations: [] },
  }),

  // 2. Expunge (USG) {2}{B} Instant — Destroy nonartifact, nonblack creature, can't be regenerated. Cycling {2}.
  defineCard({
    id: 'expunge', name: 'Expunge', set: 'USG',
    types: ['Instant'], colors: ['B'], manaCost: 3,
    oracleText: 'Destroy target nonartifact, nonblack creature. It can\'t be regenerated.\nCycling {2} ({2}, Discard this card: Draw a card.)',
    imageUri: 'https://cards.scryfall.io/large/front/1/b/1b4650f3-f3d5-48b1-9fc9-264d03442021.jpg?1783939291',
    spell: {
      timing: 'instant', targets: [{ type: 'nonartifact_nonblack_creature' }],
      effects: [
        { type: 'cant_be_regenerated_this_turn' },
        { type: 'destroy_permanent' },
      ],
    },
    abilities: [
      createAbility({
        type: ABILITY_TYPE.activated,
        keyword: 'cycling',
        cost: { mana: 2 },
        cycling: { drawCards: 1 },
      }),
    ],
    artId: 40,
    plan: 'Dominaria',
    support: { status: 'supported', limitations: [] },
  }),

  // 3. Shiv's Embrace (M11) {2}{R}{R} Aura — Enchant creature, +2/+2 flying, {R}: +1/+0 until EOT.
  defineCard({
    id: 'shivs-embrace', name: "Shiv's Embrace", set: 'M11',
    types: ['Enchantment'], subtypes: ['Aura'], colors: ['R'], manaCost: 4,
    oracleText: "Enchant creature\nEnchanted creature gets +2/+2 and has flying.\n{R}: Enchanted creature gets +1/+0 until end of turn.",
    imageUri: 'https://cards.scryfall.io/large/front/8/a/8a42fcd6-32ce-4a20-af4d-83bd32a7ed3e.jpg?1783939910',
    aura: { pump: { power: 2, toughness: 2 }, keywords: ['flying'] },
    abilities: [
      createAbility({
        type: ABILITY_TYPE.activated,
        cost: { mana: 1, colors: ['R'] },
        effect: { type: 'pump_enchanted_creature', power: 1, toughness: 0 },
      }),
    ],
    artId: 496,
    plan: 'Dominaria',
    support: { status: 'supported', limitations: [] },
  }),
  // 4. Deepwood Denizen (MH2) {2}{G} 3/2 — Vigilance, {5}{G},{T}: Draw a card, costs {1} less per +1/+1 counter.
  defineCard({
    id: 'deepwood-denizen', name: 'Deepwood Denizen', set: 'MH2',
    types: ['Creature'], subtypes: ['Elf', 'Warrior'], colors: ['G'],
    power: 3, toughness: 2, manaCost: 3, keywords: ['vigilance'],
    oracleText: 'Vigilance\\n{5}{G}, {T}: Draw a card. This ability costs {1} less to activate for each +1/+1 counter on creatures you control.',
    imageUri: 'https://cards.scryfall.io/large/front/3/3/333f02f7-3b8a-41e3-9ae5-2151539e64ad.jpg?1783926833',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.activated,
        cost: { mana: 6, colors: ['G'], tap: true },
        costReduction: { perCounter: '+1/+1', amount: 1 },
        effect: { type: 'draw_cards', amount: 1 },
      }),
    ],
    artId: 51,
    plan: 'Śródziemie',
    support: { status: 'supported', limitations: [] },
  }),

  // 5. Welder Automaton (AER) {2} 2/1 — {3}{R}: 1 damage to each opponent.
  defineCard({
    id: 'welder-automaton', name: 'Welder Automaton', set: 'AER',
    types: ['Artifact', 'Creature'], subtypes: ['Construct'], colors: [],
    power: 2, toughness: 1, manaCost: 2,
    oracleText: '{3}{R}: This creature deals 1 damage to each opponent.',
    imageUri: 'https://cards.scryfall.io/large/front/9/3/938066de-d111-4df2-87f0-9eb72aa4cdac.jpg?1783933968',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.activated,
        cost: { mana: 4, colors: ['R'] },
        effect: { type: 'damage_each_opponent', amount: 1 },
      }),
    ],
    artId: 113,
    plan: 'Kaladesh',
    support: { status: 'supported', limitations: [] },
  }),

  // 6. Feedback (5ED) {2}{U} Aura — Enchant enchantment, upkeep 1 damage to enchanted controller.
  defineCard({
    id: 'feedback', name: 'Feedback', set: '5ED',
    types: ['Enchantment'], subtypes: ['Aura'], colors: ['U'], manaCost: 3,
    oracleText: "Enchant enchantment\\nAt the beginning of the upkeep of enchanted enchantment's controller, this Aura deals 1 damage to that player.",
    imageUri: 'https://cards.scryfall.io/large/front/1/d/1d452de7-3f44-4594-bb24-2178812da9d6.jpg?1783946949',
    aura: { enchant: 'enchantment' },
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'upkeep', condition: { enchantedPermanentControllerUpkeep: true } },
        effect: { type: 'damage_enchanted_permanent_controller', amount: 1 },
      }),
    ],
    artId: 249,
    plan: 'Warhammer Fantasy',
    support: { status: 'supported', limitations: [] },
  }),
  // 7. Vow of Wildness (CMR) {2}{G} Aura — +3/+3 trample, can't attack you.
  defineCard({
    id: 'vow-of-wildness', name: 'Vow of Wildness', set: 'CMR',
    types: ['Enchantment'], subtypes: ['Aura'], colors: ['G'], manaCost: 3,
    oracleText: "Enchant creature\\nEnchanted creature gets +3/+3, has trample, and can't attack you or planeswalkers you control.",
    imageUri: 'https://cards.scryfall.io/large/front/7/6/764fa7f1-b92b-42cc-983e-e0b5457369a7.jpg?1783928780',
    aura: { pump: { power: 3, toughness: 3 }, keywords: ['trample'], cantAttackYou: true },
    artId: 396,
    plan: 'Tarkir',
    support: { status: 'supported', limitations: [] },
    notes: ['can\'t attack you — w 1v1 stwór przeciwnika z Vow nie może atakować (jedyny przeciwnik to Ty)'],
  }),

  // 8. Greater Tanuki (NEO) {4}{G}{G} 6/5 — Trample, Channel {2}{G}, discard: search basic land tapped.
  defineCard({
    id: 'greater-tanuki', name: 'Greater Tanuki', set: 'NEO',
    types: ['Enchantment', 'Creature'], subtypes: ['Dog'], colors: ['G'],
    power: 6, toughness: 5, manaCost: 6, keywords: ['trample'],
    oracleText: 'Trample\\nChannel — {2}{G}, Discard this card: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.',
    imageUri: 'https://cards.scryfall.io/large/front/b/4/b4fbaee3-a10f-4b2d-b07e-d041a96a7e27.jpg?1783923849',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.activated,
        cost: { mana: 3, colors: ['G'] },
        channel: { searchBasicLandTapped: true },
        effect: { type: 'search_library_to_battlefield_tapped', qualifier: { types: ['Basic', 'Land'] } },
      }),
    ],
    artId: 449,
    plan: 'Kamigawa',
    support: { status: 'supported', limitations: [] },
  }),

  // 9. Scorch Spitter (M20) {R} 1/1 — Whenever attacks, deals 1 damage to defending player.
  defineCard({
    id: 'scorch-spitter', name: 'Scorch Spitter', set: 'M20',
    types: ['Creature'], subtypes: ['Elemental', 'Lizard'], colors: ['R'],
    power: 1, toughness: 1, manaCost: 1,
    oracleText: "Whenever this creature attacks, it deals 1 damage to the player or planeswalker it's attacking.",
    imageUri: 'https://cards.scryfall.io/large/front/b/b/bb701a84-24bd-41ed-9f06-25c8338902a5.jpg?1783932970',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'attacks' },
        effect: { type: 'damage_defending_player', amount: 1 },
      }),
    ],
    artId: 495,
    plan: 'Forgotten Realms',
    support: { status: 'supported', limitations: [] },
  }),

  // 10. Turn the Tide (MBS) {1}{U} Instant — Creatures opponents control get -2/-0 until EOT.
  defineCard({
    id: 'turn-the-tide', name: 'Turn the Tide', set: 'MBS',
    types: ['Instant'], colors: ['U'], manaCost: 2,
    oracleText: "Creatures your opponents control get -2/-0 until end of turn.",
    imageUri: 'https://cards.scryfall.io/large/front/b/d/bdc91fc7-7927-4c5d-888a-f40cbf658866.jpg?1783941386',
    spell: {
      timing: 'instant',
      targets: [],
      effects: [{ type: 'buff_opponents_creatures', power: -2, toughness: 0 }],
    },
    artId: 529,
    plan: 'Mirrodin',
    support: { status: 'supported', limitations: [] },
  }),
]);


/**
 * Karta lochu „The Undercity" (dungeon z inicjatywy, CR 725; karta
 * „Undercity // The Initiative" z CLB). W legacy aplikacji to karta specjalna
 * 990006 („Dungeon: The Undercity"), a jej druk pobiera Scryfall przez
 * `api.scryfall.com/cards/tclb/20?format=image` — używamy tego samego adresu.
 * Nie jest taliowalna; stół renderuje ją jako kartę-obserwator z zaznaczeniem
 * pokoju każdego gracza (M24).
 */
// M68 — token „Day // Night" (TVOW 21): globalny znacznik dnia/nocy (CR 708.9),
// renderowany na stole jak karta lochu — front (Day) gdy dzień, back (Night)
// gdy noc. Pobrane ze Scryfall przez fetch_page.
export const DAY_NIGHT_TOKEN = Object.freeze({
  id: 'day-night',
  name: 'Day // Night',
  typeLine: 'Card // Card',
  imageUriDay: 'https://cards.scryfall.io/large/front/d/c/dc26e13b-7a0f-4e7f-8593-4f22234f4517.jpg?1783924696',
  imageUriNight: 'https://cards.scryfall.io/large/back/d/c/dc26e13b-7a0f-4e7f-8593-4f22234f4517.jpg?1783924696',
});

export const UNDERCITY_DUNGEON = Object.freeze({
  id: 'undercity',
  name: 'The Undercity',
  typeLine: 'Dungeon — Undercity',
  imageUri: 'https://api.scryfall.com/cards/tclb/20?format=image',
});

/**
 * Wirtualne landy podstawowe (rozstrzygnięcie właściciela 2026-08-01): NIE
 * należą do katalogu batchowych kart — to prymitywy gry obecne zawsze, bez
 * procedury Scryfall i bez limitu kopii w talii (deck-validation po polu
 * „Basic"). Są w rejestrze, żeby talie i cycling mogły się do nich odwołać
 * jak do zwykłych obiektów (subtype napędza szukanie typecyclingiem).
 *
 * Ilustracja (decyzja właściciela 2026-08-01, poz. 10.1): druk domyślny
 * Scryfalla przez przekierowanie po nazwie — dokładnie jak w pliku legacy
 * (`getPlaytableFullCardImage` dla ID 990001–990005). Adres jest „stałym
 * drukiem" w tym sensie, że nie zależy od konkretnego setu: Scryfall zwraca
 * swój druk domyślny, a my nie musimy pilnować rotacji setów.
 */
const basicLandImage = (name) =>
  `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image&version=normal`;

export const VIRTUAL_BASIC_LANDS = Object.freeze([
  defineCard({ id: 'basic-plains', name: 'Plains', set: null, types: ['Basic', 'Land'], subtypes: ['Plains'], colors: ['W'], imageUri: basicLandImage('Plains'), support: { status: 'supported' } }),
  defineCard({ id: 'basic-island', name: 'Island', set: null, types: ['Basic', 'Land'], subtypes: ['Island'], colors: ['U'], imageUri: basicLandImage('Island'), support: { status: 'supported' } }),
  defineCard({ id: 'basic-swamp', name: 'Swamp', set: null, types: ['Basic', 'Land'], subtypes: ['Swamp'], colors: ['B'], imageUri: basicLandImage('Swamp'), support: { status: 'supported' } }),
  defineCard({ id: 'basic-mountain', name: 'Mountain', set: null, types: ['Basic', 'Land'], subtypes: ['Mountain'], colors: ['R'], imageUri: basicLandImage('Mountain'), support: { status: 'supported' } }),
  defineCard({ id: 'basic-forest', name: 'Forest', set: null, types: ['Basic', 'Land'], subtypes: ['Forest'], colors: ['G'], imageUri: basicLandImage('Forest'), support: { status: 'supported' } }),
  // =========================================================================
  // Batch 24 (10 kart, 2026-08-08) — lista właściciela
  // Faceless Butcher, Unbreakable Bond, Spinewoods Paladin, Tome Scour,
  // Goblin Battle Jester, Brawler's Plate, Glitch Ghost Surveyor, Mystic
  // Sanctuary, Willbender, Scion Summoner. Dane Oracle w docs/cards/scryfall-*
  // (pobrane z parametrem set= — lekcja M54), artId i plan ze słownika
  // tools/collection-art-ids.csv.
  // =========================================================================

  // 1. Faceless Butcher (TOR) {2}{B}{B} 2/3 — ETB exile another creature, LTB return.
  defineCard({
    id: 'faceless-butcher', name: 'Faceless Butcher', set: 'TOR',
    types: ['Creature'], subtypes: ['Nightmare', 'Horror'], colors: ['B'],
    power: 2, toughness: 3, manaCost: 4,
    oracleText: "When this creature enters, exile another target creature.\nWhen this creature leaves the battlefield, return the exiled card to the battlefield under its owner's control.",
    imageUri: 'https://cards.scryfall.io/large/front/4/0/4073be21-c54a-4eee-9109-f3adfe757c4e.jpg?1783945157',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'enter_battlefield', requiresTarget: { type: 'creature', notSelf: true } },
        effect: [{ type: 'exile_target_creature' }],
      }),
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'leaves_battlefield' },
        effect: [{ type: 'return_exiled_to_battlefield' }],
      }),
    ],
    artId: 313,
    plan: 'Dominaria',
    support: { status: 'supported', limitations: [] },
  }),

  // 2. Unbreakable Bond (IKO) {4}{B} Sorcery — reanimacja z lifelink counter.
  defineCard({
    id: 'unbreakable-bond', name: 'Unbreakable Bond', set: 'IKO',
    types: ['Sorcery'], colors: ['B'], manaCost: 5,
    oracleText: "Return target creature card from your graveyard to the battlefield with a lifelink counter on it.",
    imageUri: 'https://cards.scryfall.io/large/front/c/9/c9da02a1-7b39-4a0e-8466-6512a02f3e3b.jpg?1783931056',
    spell: {
      timing: 'sorcery',
      targets: [{ type: 'creature_card_in_graveyard' }],
      effects: [{ type: 'return_permanent_from_graveyard', counters: { lifelink: 1 } }],
    },
    artId: 446,
    plan: 'Ikoria',
    support: { status: 'supported', limitations: [] },
  }),

  // 3. Spinewoods Paladin (OTJ) {4}{G} 5/4 Trample — ETB gain 3 life, Plot {3}{G}.
  defineCard({
    id: 'spinewoods-paladin', name: 'Spinewoods Paladin', set: 'OTJ',
    types: ['Creature'], subtypes: ['Human', 'Knight'], colors: ['G'],
    keywords: ['trample'], power: 5, toughness: 4, manaCost: 5,
    oracleText: "Trample\nWhen this creature enters, you gain 3 life.\nPlot {3}{G} (You may pay {3}{G} and exile this card from your hand. Cast it as a sorcery on a later turn without paying its mana cost. Plot only as a sorcery.)",
    imageUri: 'https://cards.scryfall.io/large/front/1/b/1b2b432d-9e73-4ab2-a098-546d406df6c0.jpg?1783911802',
    // Plot {3}{G} = 4 many z pipem G — koszt niesie kolory (walidacja jak rzut).
    plot: { cost: 4, colors: ['G'] },
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'enter_battlefield' },
        effect: [{ type: 'gain_life', amount: 3 }],
      }),
    ],
    artId: 277,
    plan: 'Thunder Junction',
    support: { status: 'supported', limitations: [] },
  }),

  // 4. Tome Scour (M11) {U} Sorcery — target player mills five.
  defineCard({
    id: 'tome-scour', name: 'Tome Scour', set: 'M11',
    types: ['Sorcery'], colors: ['U'], manaCost: 1,
    oracleText: 'Target player mills five cards.',
    imageUri: 'https://cards.scryfall.io/large/front/6/4/6445f013-8b50-4ea3-9013-df85289c2605.jpg?1783941820',
    spell: {
      timing: 'sorcery',
      targets: [{ type: 'player' }],
      effects: [{ type: 'mill_cards', amount: 5 }],
    },
    artId: 69,
    plan: 'Warhammer Fantasy',
    support: { status: 'supported', limitations: [] },
  }),

  // 5. Goblin Battle Jester (M13) {3}{R} 2/2 — red spell → target creature can't block.
  defineCard({
    id: 'goblin-battle-jester', name: 'Goblin Battle Jester', set: 'M13',
    types: ['Creature'], subtypes: ['Goblin'], colors: ['R'],
    power: 2, toughness: 2, manaCost: 4,
    oracleText: "Whenever you cast a red spell, target creature can't block this turn.",
    imageUri: 'https://cards.scryfall.io/large/front/c/1/c13e56b0-becc-4bc2-9ba3-23b3ca8bfe58.jpg?1783940483',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: {
          event: 'when_you_cast_spell',
          condition: { spellColorsInclude: ['R'] },
          requiresTarget: { type: 'creature' },
        },
        effect: [{ type: 'cant_block' }],
      }),
    ],
    artId: 312,
    plan: 'Warhammer Fantasy',
    support: { status: 'supported', limitations: [] },
  }),

  // 6. Brawler's Plate (M15) {3} Equipment — +2/+2 trample, Equip {4}.
  defineCard({
    id: 'brawlers-plate', name: "Brawler's Plate", set: 'M15',
    types: ['Artifact'], subtypes: ['Equipment'], colors: [], manaCost: 3,
    oracleText: "Equipped creature gets +2/+2 and has trample. (It can deal excess combat damage to the player or planeswalker it's attacking.)\nEquip {4} ({4}: Attach to target creature you control. Equip only as a sorcery.)",
    imageUri: 'https://cards.scryfall.io/large/front/e/d/eddc4ee6-7855-4dc7-9488-5e019609bd09.jpg?1783939159',
    equipment: { equip: 4, pump: { power: 2, toughness: 2 }, keywords: ['trample'] },
    abilities: [
      // Equip {4} — zdolność aktywowana (jak Cloak of the Bat); koszt czyta
      // deskryptor equipment (equip: 4) — jedno źródło dla oferty i buffu.
      createAbility({
        type: ABILITY_TYPE.activated,
        keyword: 'equip',
        cost: { mana: 4 },
      }),
    ],
    artId: 16,
    plan: 'Warhammer Fantasy',
    support: { status: 'supported', limitations: [] },
  }),

  // 7. Glitch Ghost Surveyor (DFT) {2}{U} 2/2 Flying — Start your engines! / Max speed.
  defineCard({
    id: 'glitch-ghost-surveyor', name: 'Glitch Ghost Surveyor', set: 'DFT',
    types: ['Creature'], subtypes: ['Spirit', 'Scout'], colors: ['U'],
    keywords: ['flying'], power: 2, toughness: 2, manaCost: 3,
    oracleText: "Flying\nStart your engines! (If you have no speed, it starts at 1. It increases once on each of your turns when an opponent loses life. Max speed is 4.)\nMax speed — {3}, Exile this card from your graveyard: Draw a card.",
    imageUri: 'https://cards.scryfall.io/large/front/b/9/b9bb89b9-50dd-4b36-aa10-aba585e50246.jpg?1783907909',
    abilities: [
      // „Start your engines!" — speed startuje od 1 (mechanika DFT; speed to
      // cecha GRACZA — trwa po odejściu źródła, wzrost przy obrażeniach
      // przeciwnika w triggers.js, max 4).
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'enter_battlefield' },
        effect: [{ type: 'start_engines' }],
      }),
      // „Max speed — {3}, Exile this card from your graveyard: Draw a card."
      createAbility({
        type: ABILITY_TYPE.activated,
        fromGraveyard: true,
        cost: { mana: 3, exileFromGraveyard: true },
        condition: { maxSpeed: true },
        effect: { type: 'draw_cards', amount: 1 },
      }),
    ],
    artId: 104,
    plan: 'Kaladesh',
    support: { status: 'supported', limitations: [] },
    notes: ['speed: start 1 przy ETB, wzrost raz na turę aktywnego gracza przy obrażeniach przeciwnika (max 4); „max speed" bramkuje zdolność z grobu'],
  }),

  // 8. Mystic Sanctuary (ELD) Land — Island, enters tapped unless 3+ other Islands.
  defineCard({
    id: 'mystic-sanctuary', name: 'Mystic Sanctuary', set: 'ELD',
    types: ['Land'], subtypes: ['Island'], colors: [],
    entersTapped: true,
    entersTappedCondition: { type: 'islands_you_control_at_least', amount: 3 },
    oracleText: "({T}: Add {U}.)\nThis land enters tapped unless you control three or more other Islands.\nWhen this land enters untapped, you may put target instant or sorcery card from your graveyard on top of your library.",
    imageUri: 'https://cards.scryfall.io/large/front/1/7/170e792c-80d5-4775-ad95-37614574ab84.jpg?1783932577',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: {
          event: 'enter_battlefield',
          condition: { enteredUntapped: true },
          requiresTarget: { type: 'instant_or_sorcery_card_in_graveyard', controlledBy: 'controller', optional: true },
        },
        effect: [{ type: 'put_graveyard_card_on_top' }],
      }),
    ],
    artId: 4,
    plan: 'Eldraine',
    support: { status: 'supported', limitations: [] },
  }),

  // 9. Willbender (DD2) {1}{U} 1/2 — Morph {1}{U}, face up → change target.
  defineCard({
    id: 'willbender', name: 'Willbender', set: 'DD2',
    types: ['Creature'], subtypes: ['Human', 'Wizard'], colors: ['U'],
    power: 1, toughness: 2, manaCost: 2, keywords: ['morph'],
    oracleText: "Morph {1}{U} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)\nWhen this creature is turned face up, change the target of target spell or ability with a single target.",
    imageUri: 'https://cards.scryfall.io/large/front/7/c/7c35a94e-4449-4093-9652-5db0ec8b8bdd.jpg?1783942522',
    morph: { cost: 3, morphCost: 2, colors: ['U'] },
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'turned_face_up', requiresTarget: { type: 'spell_with_single_target_on_stack' } },
        effect: [{ type: 'redirect_spell_target' }],
      }),
    ],
    artId: 243,
    plan: 'Dominaria',
    support: { status: 'supported', limitations: [] },
  }),

  // 10. Scion Summoner (OGW) {2}{G} 2/2 Devoid — ETB token Eldrazi Scion.
  defineCard({
    id: 'scion-summoner', name: 'Scion Summoner', set: 'OGW',
    types: ['Creature'], subtypes: ['Eldrazi', 'Drone'], colors: [],
    power: 2, toughness: 2, manaCost: 3,
    oracleText: "Devoid (This card has no color.)\nWhen this creature enters, create a 1/1 colorless Eldrazi Scion creature token. It has \"Sacrifice this token: Add {C}.\" ({C} represents colorless mana.)",
    imageUri: 'https://cards.scryfall.io/large/front/8/2/826a882e-c4bd-4132-b797-9e1aa2d0bce4.jpg?1783937903',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'enter_battlefield' },
        effect: [{
          type: 'create_token', cardId: 'token_eldrazi_scion', name: 'Eldrazi Scion',
          kind: 'creature', power: 1, toughness: 1, colors: [],
          types: ['Creature'], subtypes: ['Eldrazi', 'Scion'],
          abilities: [
            createAbility({
              type: ABILITY_TYPE.activated,
              cost: { sacrificeSelf: true },
              effect: { type: 'add_mana', amount: 1 },
            }),
          ],
        }],
      }),
    ],
    artId: 473,
    plan: 'Zendikar',
    support: { status: 'supported', limitations: [] },
  }),

  // Diament (2026-08-11): token Eldrazi Scion ZAREJESTROWANY — wcześniej tylko
  // inline w create_token (Scion Summoner), więc nameById nie znał nazwy i
  // etykiety pokazywały surowy „token_eldrazi_scion" (audyt żywym testerem).
  defineCard({
    id: 'token_eldrazi_scion', name: 'Eldrazi Scion', set: null,
    types: ['Creature', 'Token'], subtypes: ['Eldrazi', 'Scion'], colors: [],
    power: 1, toughness: 1, manaCost: 0,
    abilities: [
      createAbility({
        type: ABILITY_TYPE.activated,
        cost: { sacrificeSelf: true },
        effect: { type: 'add_mana', amount: 1 },
      }),
    ],
    support: { status: 'limited', limitations: ['token — nie można umieścić w talii; tworzony przez Scion Summoner'] },
  }),

  // =========================================================================
  // Batch 25 — 10 kart (2026-08-09)
  // =========================================================================

  // 1. Trestle Troll (RTR) — BG 1/4: defender, reach, {1}{B}{G}: Regenerate
  defineCard({
    id: 'trestle-troll', name: 'Trestle Troll', set: 'RTR',
    types: ['Creature'], subtypes: ['Troll'], colors: ['B', 'G'],
    power: 1, toughness: 4, manaCost: 3,
    oracleText: 'Defender\nReach (This creature can block creatures with flying.)\n{1}{B}{G}: Regenerate this creature.',
    imageUri: 'https://cards.scryfall.io/large/front/6/d/6d224279-83f3-4a29-9fd9-86b72407b87a.jpg?1783940330',
    keywords: ['defender', 'reach'],
    abilities: [
      createAbility({
        type: ABILITY_TYPE.activated,
        cost: { mana: 3, colors: ['B', 'G'] },
        keyword: 'regenerate',
        // Efekt pusty: tarczę regeneracji zakłada ścieżka keyword
        // (performActivation → addRegenerationShield, CR 701.12); efekt
        // {type:'regenerate'} nie istnieje w applyEffect — audyt B26 (M65)
        // wykrył, że z nim aktywacja była ODRZUCANA („Nieznany typ efektu").
        effect: [],
      }),
    ],
    artId: 235, plan: 'Ravnica',
    support: { status: 'supported', limitations: [] },
  }),

  // 2. Lab Rats (STH) — {B} Sorcery: Buyback {4}, Create 1/1 Rat token
  defineCard({
    id: 'lab-rats', name: 'Lab Rats', set: 'STH',
    types: ['Sorcery'], colors: ['B'], manaCost: 1,
    oracleText: 'Buyback {4} (You may pay an additional {4} as you cast this spell. If you do, put this card into your hand as it resolves.)\nCreate a 1/1 black Rat creature token.',
    imageUri: 'https://cards.scryfall.io/large/front/3/1/3132c128-e0bd-4524-9526-914b3c7181fc.jpg?1783946562',
    spell: {
      timing: 'sorcery',
      buyback: { cost: 4 },
      effects: [
        { type: 'create_token', cardId: 'token_rat', name: 'Rat', kind: 'creature', power: 1, toughness: 1, colors: ['B'], types: ['Creature'], subtypes: ['Rat'] },
      ],
    },
    artId: 535, plan: 'Rath',
    support: { status: 'supported', limitations: [] },
  }),

  // Token: 1/1 black Rat (Lab Rats)
  defineCard({
    id: 'token_rat', name: 'Rat', set: null,
    types: ['Creature', 'Token'], subtypes: ['Rat'], colors: ['B'],
    power: 1, toughness: 1, manaCost: 0,
    imageUri: 'https://cards.scryfall.io/large/front/3/1/3132c128-e0bd-4524-9526-914b3c7181fc.jpg?1783946562',
    support: { status: 'limited', limitations: [] },
    notes: ['token'],
  }),

  // 3. Anthem of Champions (FDN) — {G}{W} Enchantment: Creatures you control get +1/+1.
  defineCard({
    id: 'anthem-of-champions', name: 'Anthem of Champions', set: 'FDN',
    types: ['Enchantment'], colors: ['G', 'W'], manaCost: 2,
    oracleText: 'Creatures you control get +1/+1.',
    imageUri: 'https://cards.scryfall.io/large/front/4/2/42fe3a40-9cbe-4235-86f9-32576aaebba8.jpg?1783909093',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.static,
        pump: { power: 1, toughness: 1 },
        scope: { affects: 'all_creatures_you_control' },
      }),
    ],
    artId: 231, plan: 'Theros',
    support: { status: 'supported', limitations: [] },
  }),

  // 4. Goblin Deathraiders (ALA) — {B}{R} 3/1: Trample
  defineCard({
    id: 'goblin-deathraiders', name: 'Goblin Deathraiders', set: 'ALA',
    types: ['Creature'], subtypes: ['Goblin', 'Warrior'], colors: ['B', 'R'],
    power: 3, toughness: 1, manaCost: 2,
    oracleText: 'Trample',
    imageUri: 'https://cards.scryfall.io/large/front/7/6/76fd1253-1af1-42a7-9875-4d6ac9ce722c.jpg?1783942545',
    keywords: ['trample'],
    artId: 8, plan: 'Alara',
    support: { status: 'supported', limitations: [] },
  }),

  // 5. Fertile Thicket (BFZ) — Land: enters tapped, ETB reveal top 5 for basic land
  defineCard({
    id: 'fertile-thicket', name: 'Fertile Thicket', set: 'BFZ',
    types: ['Land'], colors: [],
    oracleText: 'This land enters tapped.\nWhen this land enters, you may look at the top five cards of your library. If you do, reveal up to one basic land card from among them, then put that card on top of your library and the rest on the bottom in any order.\n{T}: Add {G}.',
    imageUri: 'https://cards.scryfall.io/large/front/1/5/15231a9b-1956-4ff6-b637-942444d3349f.jpg?1783938175',
    entersTapped: true,
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'enter_battlefield' },
        effect: [{ type: 'fertile_thicket_reveal' }],
      }),
    ],
    artId: 273, plan: 'Zendikar',
    support: { status: 'supported', limitations: [] },
  }),

  // 6. Reassembling Skeleton (M19) — {1}{B} 1/1: {1}{B}: Return from graveyard tapped
  defineCard({
    id: 'reassembling-skeleton', name: 'Reassembling Skeleton', set: 'M19',
    types: ['Creature'], subtypes: ['Skeleton', 'Warrior'], colors: ['B'],
    power: 1, toughness: 1, manaCost: 2,
    oracleText: '{1}{B}: Return this card from your graveyard to the battlefield tapped.',
    imageUri: 'https://cards.scryfall.io/large/front/a/3/a3d4ac21-2203-45f4-b5f2-dc186ccdbe69.jpg?1783934563',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.activated,
        cost: { mana: 2, colors: ['B'] },
        fromGraveyard: true,
        effect: { type: 'return_to_battlefield_tapped' },
      }),
    ],
    artId: 248, plan: 'Dominaria',
    support: { status: 'supported', limitations: [] },
  }),

  // 7. Idyllic Grange (ELD) — Land — Plains: enters tapped unless 3+ other Plains,
  //    ETB +1/+1 counter on target creature when enters untapped
  defineCard({
    id: 'idyllic-grange', name: 'Idyllic Grange', set: 'ELD',
    types: ['Land'], subtypes: ['Plains'], colors: [],
    oracleText: '({T}: Add {W}.)\nThis land enters tapped unless you control three or more other Plains.\nWhen this land enters untapped, put a +1/+1 counter on target creature you control.',
    imageUri: 'https://cards.scryfall.io/large/front/c/a/ca2c611c-3a6f-44b0-9daa-837a465845e0.jpg?1783932578',
    // enters tapped UNLESS 3+ inne Plains — flaga obowiązkowa przy warunku
    // (playLand czyta entersTapped; warunek ją tylko uchyla) — bug C 2026-08-10.
    entersTapped: true,
    entersTappedCondition: { minOtherPlains: 3 },
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: {
          event: 'enter_battlefield',
          condition: { enteredUntapped: true },
          requiresTarget: { type: 'creature_you_control' },
        },
        effect: [{ type: 'add_counter', counter: '+1/+1', amount: 1 }],
      }),
    ],
    artId: 187, plan: 'Eldraine',
    support: { status: 'supported', limitations: [] },
  }),

  // 8. Deadly Recluse (M10) — {1}{G} 1/2: Reach, Deathtouch
  defineCard({
    id: 'deadly-recluse', name: 'Deadly Recluse', set: 'M10',
    types: ['Creature'], subtypes: ['Spider'], colors: ['G'],
    power: 1, toughness: 2, manaCost: 2,
    oracleText: 'Reach (This creature can block creatures with flying.)\nDeathtouch (Any amount of damage this deals to a creature is enough to destroy it.)',
    imageUri: 'https://cards.scryfall.io/large/front/6/a/6ab810f1-21d6-4a98-b77a-e455370aa6cc.jpg?1783942364',
    keywords: ['reach', 'deathtouch'],
    artId: 375, plan: 'Core',
    support: { status: 'supported', limitations: [] },
  }),

  // 9. Benevolent Blessing (CMR) — {1}{W} Aura: Flash, Enchant creature,
  //    choose color on entry, protection from chosen color
  defineCard({
    id: 'benevolent-blessing', name: 'Benevolent Blessing', set: 'CMR',
    types: ['Enchantment'], subtypes: ['Aura'], colors: ['W'], manaCost: 2,
    oracleText: 'Flash\nEnchant creature\nAs this Aura enters, choose a color.\nEnchanted creature has protection from the chosen color. This effect doesn\'t remove Auras and Equipment you control that are already attached to it.',
    imageUri: 'https://cards.scryfall.io/large/front/0/d/0d5c2401-da2c-46f9-b850-f37edcbb85cd.jpg?1783928890',
    keywords: ['flash'],
    aura: { enchant: 'creature', chooseColor: true },
    // Protection from chosen color: when aura enters, player chooses a color.
    // The chosenColor is set on the aura permanent, and effectiveKeywords
    // computes protectionFromColors from it (attachments.js + permanents.js).
    artId: 422, plan: 'Commander',
    support: { status: 'supported', limitations: [] },
  }),

  // 10. Springbloom Druid (MH1) — {2}{G} 1/1: ETB sacrifice land → search 2 basic lands tapped
  defineCard({
    id: 'springbloom-druid', name: 'Springbloom Druid', set: 'MH1',
    types: ['Creature'], subtypes: ['Elf', 'Druid'], colors: ['G'],
    power: 1, toughness: 1, manaCost: 3,
    oracleText: 'When this creature enters, you may sacrifice a land. If you do, search your library for up to two basic land cards, put them onto the battlefield tapped, then shuffle.',
    imageUri: 'https://cards.scryfall.io/large/front/6/1/6161d2ed-7cff-4c90-9e74-1d179a6c1498.jpg?1783933092',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'enter_battlefield' },
        effect: [{ type: 'springbloom_sacrifice_search' }],
      }),
    ],
    artId: 470, plan: 'Modern Horizons',
    support: { status: 'supported', limitations: [] },
  }),

  // =========================================================================
  // Batch 26 — 10 kart (2026-08-09)
  // =========================================================================

  // 1. Kabira Vindicator (ROE) — {3}{W} 2/4 Human Knight: Level up {2}{W}, LEVEL 2-4 3/6 other +1/+1, LEVEL 5+ 4/8 other +2/+2
  defineCard({
    id: 'kabira-vindicator', name: 'Kabira Vindicator', set: 'ROE',
    types: ['Creature'], subtypes: ['Human', 'Knight'], colors: ['W'],
    power: 2, toughness: 4, manaCost: 4,
    oracleText: 'Level up {2}{W} ({2}{W}: Put a level counter on this. Level up only as a sorcery.)\nLEVEL 2-4\n3/6\nOther creatures you control get +1/+1.\nLEVEL 5+\n4/8\nOther creatures you control get +2/+2.',
    imageUri: 'https://cards.scryfall.io/large/front/6/d/6d31551a-ab7a-4e49-b545-77afb3be72d3.jpg?1783942007',
    keywords: ['level_up'],
    abilities: [
      createAbility({
        type: ABILITY_TYPE.activated,
        cost: { mana: 3, colors: ['W'] },
        timing: 'sorcery',
        effect: { type: 'add_counter', counter: 'level', amount: 1 },
      }),
      // Self P/T for level 2-4: 2/4 -> 3/6 => +1/+2
      createAbility({
        type: ABILITY_TYPE.static,
        condition: { minLevel: 2, maxLevel: 4 },
        pump: { power: 1, toughness: 2 },
      }),
      // Self P/T for level 5+: 2/4 -> 4/8 => +2/+4
      createAbility({
        type: ABILITY_TYPE.static,
        condition: { minLevel: 5 },
        pump: { power: 2, toughness: 4 },
      }),
      // Other creatures +1/+1 for level 2-4
      createAbility({
        type: ABILITY_TYPE.static,
        condition: { minLevel: 2, maxLevel: 4 },
        pump: { power: 1, toughness: 1 },
        scope: { affects: 'other_creatures_you_control' },
      }),
      // Other creatures +2/+2 for level 5+
      createAbility({
        type: ABILITY_TYPE.static,
        condition: { minLevel: 5 },
        pump: { power: 2, toughness: 2 },
        scope: { affects: 'other_creatures_you_control' },
      }),
    ],
    artId: 143, plan: 'Zendikar',
    support: { status: 'supported', limitations: [] },
  }),

  // 2. Great Furnace (MRD) — Artifact Land: {T}: Add {R}
  defineCard({
    id: 'great-furnace', name: 'Great Furnace', set: 'MRD',
    types: ['Artifact', 'Land'], colors: [],
    oracleText: '{T}: Add {R}.',
    imageUri: 'https://cards.scryfall.io/large/front/2/8/2877281d-c85d-4f32-b40d-828b93c4ee8e.jpg?1783944493',
    artId: 97, plan: 'Mirrodin',
    support: { status: 'supported', limitations: [] },
  }),

  // 3. Bomat Bazaar Barge (KLD) — {4} 5/5 Vehicle: ETB draw, Crew 3
  defineCard({
    id: 'bomat-bazaar-barge', name: 'Bomat Bazaar Barge', set: 'KLD',
    types: ['Artifact'], subtypes: ['Vehicle'], colors: [],
    power: 5, toughness: 5, manaCost: 4,
    oracleText: 'When this Vehicle enters, draw a card.\nCrew 3 (Tap any number of creatures you control with total power 3 or more: This Vehicle becomes an artifact creature until end of turn.)',
    imageUri: 'https://cards.scryfall.io/large/front/0/f/0f32be75-979d-43a9-9132-2cf013ddaf3b.jpg?1783937161',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'enter_battlefield' },
        effect: { type: 'draw_cards', amount: 1 },
      }),
      createAbility({
        type: ABILITY_TYPE.activated,
        // Crew (CR 701.36) — jak wyżej: instant, bez „Activate only as a
        // sorcery" w Oracle (audyt Batchu 26, M65).
        cost: { crewPower: 3 },
        effect: { type: 'animate_permanent_until_end_of_turn', power: 5, toughness: 5, typesAdd: ['Creature'] },
      }),
    ],
    artId: 541, plan: 'Kaladesh',
    support: { status: 'supported', limitations: [] },
  }),

  // 4. Index (APC) — {U} Sorcery: Look at top 5, put back any order
  defineCard({
    id: 'index', name: 'Index', set: 'APC',
    types: ['Sorcery'], colors: ['U'], manaCost: 1,
    oracleText: 'Look at the top five cards of your library, then put them back in any order.',
    imageUri: 'https://cards.scryfall.io/large/front/6/3/637ebd57-ba92-48ff-9ad4-d40dad2ff418.jpg?1783945353',
    spell: {
      timing: 'sorcery',
      effects: [{ type: 'index_look' }],
    },
    artId: 179, plan: 'Warhammer Fantasy',
    support: { status: 'supported', limitations: [] },
  }),

  // 5. Bladed Sentinel (MBS) — {4} 2/4 Artifact Creature: {W}: vigilance until EOT
  defineCard({
    id: 'bladed-sentinel', name: 'Bladed Sentinel', set: 'MBS',
    types: ['Artifact', 'Creature'], subtypes: ['Construct'], colors: [],
    power: 2, toughness: 4, manaCost: 4,
    oracleText: '{W}: This creature gains vigilance until end of turn.',
    imageUri: 'https://cards.scryfall.io/large/front/6/9/69959c54-1350-4c64-8e5a-fc8447bb979c.jpg?1783941370',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.activated,
        cost: { mana: 1, colors: ['W'] },
        effect: { type: 'grant_keywords_until_end_of_turn', keywords: ['vigilance'] },
      }),
    ],
    artId: 73, plan: 'Mirrodin',
    support: { status: 'supported', limitations: [] },
  }),

  // 6. Might of the Masses (2XM) — {G} Instant: Target creature +1/+1 per creature you control
  defineCard({
    id: 'might-of-the-masses', name: 'Might of the Masses', set: '2XM',
    types: ['Instant'], colors: ['G'], manaCost: 1,
    oracleText: 'Target creature gets +1/+1 until end of turn for each creature you control.',
    imageUri: 'https://cards.scryfall.io/large/front/9/9/9900f47d-e1ec-411d-92f3-aed8e01ee535.jpg?1783930143',
    spell: {
      timing: 'instant',
      targets: [{ type: 'creature' }],
      effects: [{ type: 'pump_by_creature_count', perCreature: 1 }],
    },
    artId: 268, plan: 'Zendikar',
    support: { status: 'supported', limitations: [] },
  }),

  // 7. Magic Damper (FIN) — {U} Instant: Target creature you control +1/+1 hexproof until EOT, untap it
  defineCard({
    id: 'magic-damper', name: 'Magic Damper', set: 'FIN',
    types: ['Instant'], colors: ['U'], manaCost: 1,
    oracleText: 'Target creature you control gets +1/+1 and gains hexproof until end of turn. Untap it.',
    imageUri: 'https://cards.scryfall.io/large/front/4/4/44921b2e-5938-4f63-92b9-0b719a2f8c68.jpg?1783906635',
    spell: {
      timing: 'instant',
      targets: [{ type: 'creature_you_control' }],
      effects: [
        { type: 'pump', power: 1, toughness: 1 },
        { type: 'grant_keywords_until_end_of_turn', keywords: ['hexproof'] },
        { type: 'untap_permanent' },
      ],
    },
    artId: 283, plan: 'Final Fantasy',
    support: { status: 'supported', limitations: [] },
  }),

  // 8. Hecteyes (FIN) — {1}{B} 1/1 Ooze Horror: ETB each opponent discards 1
  defineCard({
    id: 'hecteyes', name: 'Hecteyes', set: 'FIN',
    types: ['Creature'], subtypes: ['Ooze', 'Horror'], colors: ['B'],
    power: 1, toughness: 1, manaCost: 2,
    oracleText: 'When this creature enters, each opponent discards a card.',
    imageUri: 'https://cards.scryfall.io/large/front/8/6/8680d052-c07b-4d9b-bda9-b5f69f44f424.jpg?1783906618',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'enter_battlefield' },
        effect: { type: 'discard_each_opponent', amount: 1 },
      }),
    ],
    artId: 439, plan: 'Final Fantasy',
    support: { status: 'supported', limitations: [] },
  }),

  // 9. Carapace Forger (SOM) — {1}{G} 2/2 Elf Artificer: Metalcraft +2/+2 if 3+ artifacts
  defineCard({
    id: 'carapace-forger', name: 'Carapace Forger', set: 'SOM',
    types: ['Creature'], subtypes: ['Elf', 'Artificer'], colors: ['G'],
    power: 2, toughness: 2, manaCost: 2,
    oracleText: 'Metalcraft — This creature gets +2/+2 as long as you control three or more artifacts.',
    imageUri: 'https://cards.scryfall.io/large/front/e/9/e9948e4c-d583-4fde-a305-df926cf00199.jpg?1783941719',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.static,
        condition: { minArtifactsControlled: 3 },
        pump: { power: 2, toughness: 2 },
      }),
    ],
    artId: 488, plan: 'Mirrodin',
    support: { status: 'supported', limitations: [] },
  }),

  // 10. Lurking Green Dragon (CLB) — {3}{G} 4/4 Dragon Flying, can't attack unless defender has flying
  defineCard({
    id: 'lurking-green-dragon', name: 'Lurking Green Dragon', set: 'CLB',
    types: ['Creature'], subtypes: ['Dragon'], colors: ['G'],
    power: 4, toughness: 4, manaCost: 4, keywords: ['flying'],
    oracleText: 'Flying\nThis creature can\'t attack unless defending player controls a creature with flying.',
    imageUri: 'https://cards.scryfall.io/large/front/6/6/66de5a3e-7b08-438b-866e-9fce1a36b243.jpg?1783922710',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.static,
        cantAttackUnlessDefenderHasFlying: true,
      }),
    ],
    artId: 519, plan: 'Forgotten Realms',
    support: { status: 'supported', limitations: [] },
  }),



  // =========================================================================
  // Batch 27 — 10 kart (2026-08-09)
  // =========================================================================

  // 1. Civilized Scholar (ISD) — DFC: {2}{U} 0/1 Human Advisor
  defineCard({
    id: 'civilized-scholar', name: 'Civilized Scholar', set: 'ISD',
    types: ['Creature'], subtypes: ['Human', 'Advisor'], colors: ['U'],
    power: 0, toughness: 1, manaCost: 3, keywords: ['transform'],
    oracleText: '{T}: Draw a card, then discard a card. If a creature card is discarded this way, untap this creature, then transform it.',
    imageUri: 'https://cards.scryfall.io/large/front/7/b/7bf864db-4754-433d-9d77-6695f78f6c09.jpg?1783940983',
    transformTo: 'homicidal-brute',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.activated,
        cost: { tap: true },
        // M67: draw 1 → decyzja odrzucenia → po odrzuceniu stwora untap+transform
        // (pendingDiscardChoice.onCreatureDiscard w resolve_discard_choice).
        effect: { type: 'draw_then_discard', amount: 1, transformOnCreatureDiscard: true },
      }),
    ],
    artId: 309, plan: 'Innistrad',
    support: { status: 'supported', limitations: [] },
  }),
  // Tył Civilized Scholar — Homicidal Brute (ISD). Limited (nie taliowalna).
  defineCard({
    id: 'homicidal-brute', name: 'Homicidal Brute', set: 'ISD',
    types: ['Creature'], subtypes: ['Human', 'Mutant'], colors: ['R'],
    power: 5, toughness: 1, manaCost: 0, keywords: ['transform'],
    oracleText: 'At the beginning of your end step, if this creature didn\'t attack this turn, tap this creature, then transform it.',
    imageUri: 'https://cards.scryfall.io/large/back/7/b/7bf864db-4754-433d-9d77-6695f78f6c09.jpg?1783940983',
    transformTo: 'civilized-scholar',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'end_step', condition: { didntAttackThisTurn: true } },
        effect: [{ type: 'tap_permanent' }, { type: 'transform' }],
      }),
    ],
    artId: 180, plan: 'Innistrad',
    support: { status: 'limited', limitations: ['tylna strona transform — nie można umieścić w talii'] },
  }),

  // 2. Battle-Rattle Shaman (M21) — {3}{R} 2/2 Goblin Shaman
  defineCard({
    id: 'battle-rattle-shaman', name: 'Battle-Rattle Shaman', set: 'M21',
    types: ['Creature'], subtypes: ['Goblin', 'Shaman'], colors: ['R'],
    power: 2, toughness: 2, manaCost: 4,
    oracleText: 'At the beginning of combat on your turn, you may have target creature get +2/+0 until end of turn.',
    imageUri: 'https://cards.scryfall.io/large/front/f/a/faca827d-0b35-48d7-acd6-13ecacc32b82.jpg?1783930695',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'beginning_of_combat', requiresTarget: { type: 'creature', optional: true } },
        effect: { type: 'pump', power: 2, toughness: 0 },
      }),
    ],
    artId: 367, plan: 'Zendikar',
    support: { status: 'supported', limitations: [] },
  }),

  // 3. Jeskai Devotee (TDM) — {1}{R} 2/2 Orc Monk
  defineCard({
    id: 'jeskai-devotee', name: 'Jeskai Devotee', set: 'TDM',
    types: ['Creature'], subtypes: ['Orc', 'Monk'], colors: ['R'],
    power: 2, toughness: 2, manaCost: 2,
    oracleText: 'Flurry — Whenever you cast your second spell each turn, this creature gets +1/+1 until end of turn.\n{1}: Add {U}, {R}, or {W}. Activate only once each turn.',
    imageUri: 'https://cards.scryfall.io/large/front/2/7/27f31f9c-7149-4608-9b18-b3530a2efd4a.jpg?1783907361',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'you_cast_second_spell_each_turn' },
        effect: { type: 'pump', power: 1, toughness: 1 },
      }),
      createAbility({
        type: ABILITY_TYPE.activated,
        cost: { mana: 1 },
        oncePerTurn: true,
        effect: { type: 'add_mana', amount: 1, colors: ['U', 'R', 'W'] },
      }),
    ],
    artId: 20, plan: 'Tarkir',
    support: { status: 'supported', limitations: [] },
  }),

  // 4. High Stride (BLB) — {G} Instant
  defineCard({
    id: 'high-stride', name: 'High Stride', set: 'BLB',
    types: ['Instant'], colors: ['G'], manaCost: 1,
    oracleText: 'Target creature gets +1/+3 and gains reach until end of turn. Untap it.',
    imageUri: 'https://cards.scryfall.io/large/front/0/9/09c8cf4b-8e65-4a1c-b458-28b5ab56b390.jpg?1783910809',
    spell: {
      timing: 'instant',
      targets: [{ type: 'creature' }],
      effects: [
        { type: 'pump', power: 1, toughness: 3 },
        { type: 'grant_keywords_until_end_of_turn', keywords: ['reach'] },
        { type: 'untap_permanent' },
      ],
    },
    artId: 206, plan: 'Bloomburrow',
    support: { status: 'supported', limitations: [] },
  }),

  // 5. Inspiration (8ED) — {3}{U} Instant
  defineCard({
    id: 'inspiration', name: 'Inspiration', set: '8ED',
    types: ['Instant'], colors: ['U'], manaCost: 4,
    oracleText: 'Target player draws two cards.',
    imageUri: 'https://cards.scryfall.io/large/front/b/e/be039716-30fc-4f84-8f84-6019065560e4.jpg?1783944797',
    spell: {
      timing: 'instant',
      targets: [{ type: 'player' }],
      effects: [{ type: 'draw_cards', amount: 2, applyTo: 'target' }],
    },
    artId: 360, plan: 'Wiedźmin',
    support: { status: 'supported', limitations: [] },
  }),

  // 6. Minotaur Abomination (M14) — {4}{B}{B} 4/6 Zombie Minotaur (vanilla)
  defineCard({
    id: 'minotaur-abomination', name: 'Minotaur Abomination', set: 'M14',
    types: ['Creature'], subtypes: ['Zombie', 'Minotaur'], colors: ['B'],
    power: 4, toughness: 6, manaCost: 6,
    oracleText: '',
    imageUri: 'https://cards.scryfall.io/large/front/9/d/9dca75a1-443d-4f8e-b12b-2aada3a8e3e4.jpg?1783939921',
    artId: 296, plan: 'Warhammer Fantasy',
    support: { status: 'supported', limitations: [] },
  }),

  // 7. Guildsworn Prowler (CLB) — {1}{B} 2/1 Tiefling Rogue Assassin
  defineCard({
    id: 'guildsworn-prowler', name: 'Guildsworn Prowler', set: 'CLB',
    types: ['Creature'], subtypes: ['Tiefling', 'Rogue', 'Assassin'], colors: ['B'],
    power: 2, toughness: 1, manaCost: 2, keywords: ['deathtouch'],
    oracleText: 'Deathtouch\nWhen this creature dies, if it wasn\'t blocking, draw a card.',
    imageUri: 'https://cards.scryfall.io/large/front/d/7/d7efb10f-c760-431c-8ac6-904965d850dc.jpg?1783922760',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'dies', condition: { notBlocking: true } },
        effect: { type: 'draw_cards', amount: 1 },
      }),
    ],
    artId: 311, plan: 'Forgotten Realms',
    support: { status: 'supported', limitations: [] },
  }),

  // 8. Giant Spider (M19) — {3}{G} 2/4 Spider (reach)
  defineCard({
    id: 'giant-spider', name: 'Giant Spider', set: 'M19',
    types: ['Creature'], subtypes: ['Spider'], colors: ['G'],
    power: 2, toughness: 4, manaCost: 4, keywords: ['reach'],
    oracleText: 'Reach (This creature can block creatures with flying.)',
    imageUri: 'https://cards.scryfall.io/large/front/8/0/80996b0d-cd44-445e-96de-677e0018255c.jpg?1783934535',
    artId: 437, plan: 'Dominaria',
    support: { status: 'supported', limitations: [] },
  }),

  // 9. Scroll Thief (M13) — {2}{U} 1/3 Merfolk Rogue
  defineCard({
    id: 'scroll-thief', name: 'Scroll Thief', set: 'M13',
    types: ['Creature'], subtypes: ['Merfolk', 'Rogue'], colors: ['U'],
    power: 1, toughness: 3, manaCost: 3,
    oracleText: 'Whenever this creature deals combat damage to a player, draw a card.',
    imageUri: 'https://cards.scryfall.io/large/front/d/c/dc201a82-fb48-4bb4-b072-e206e6872aa5.jpg?1783940502',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'combat_damage_to_player' },
        effect: { type: 'draw_cards', amount: 1 },
      }),
    ],
    artId: 474, plan: 'Shandalar',
    support: { status: 'supported', limitations: [] },
  }),

  // 10. Force Away (KTK) — {1}{U} Instant
  defineCard({
    id: 'force-away', name: 'Force Away', set: 'KTK',
    types: ['Instant'], colors: ['U'], manaCost: 2,
    oracleText: 'Return target creature to its owner\'s hand.\nFerocious — If you control a creature with power 4 or greater, you may draw a card. If you do, discard a card.',
    imageUri: 'https://cards.scryfall.io/large/front/d/d/dda70b3e-4b70-404e-a579-41dd126be084.jpg?1783939088',
    spell: {
      timing: 'instant',
      targets: [{ type: 'creature' }],
      effects: [
        { type: 'bounce_permanent' },
        { type: 'ferocious_draw_discard' },
      ],
    },
    artId: 517, plan: 'Tarkir',
    support: { status: 'supported', limitations: [] },
  }),


  // =========================================================================
  // Batch 28 — 9 kart (2026-08-10); Moonscarred Werewolf zostaje tyłem DFC
  // =========================================================================

  // 1. Silumgar Butcher (DTK) — {4}{B} 3/3 Zombie Djinn (Exploit)
  defineCard({
    id: 'silumgar-butcher', name: 'Silumgar Butcher', set: 'DTK',
    types: ['Creature'], subtypes: ['Zombie', 'Djinn'], colors: ['B'],
    power: 3, toughness: 3, manaCost: 5,
    oracleText: 'Exploit (When this creature enters, you may sacrifice a creature.)\nWhen this creature exploits a creature, target creature gets -3/-3 until end of turn.',
    imageUri: 'https://cards.scryfall.io/large/front/4/0/40cb67f7-b4e1-423b-8f55-d44ed383e778.jpg?1783938593',
    // Exploit (CR 702.110): opcjonalne poświęcenie przy wejściu (decyzja
    // kontrolera — resolve_exploit_choice); po poświęceniu trigger „exploits".
    exploit: { },
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'exploits', requiresTarget: { type: 'creature' } },
        effect: { type: 'pump', power: -3, toughness: -3 },
      }),
    ],
    artId: 92, plan: 'Tarkir',
    support: { status: 'supported', limitations: [] },
  }),

  // 2. Relic Robber (ZNR) — {2}{R} 2/2 Goblin Rogue (haste)
  defineCard({
    id: 'relic-robber', name: 'Relic Robber', set: 'ZNR',
    types: ['Creature'], subtypes: ['Goblin', 'Rogue'], colors: ['R'],
    power: 2, toughness: 2, manaCost: 3, keywords: ['haste'],
    oracleText: 'Haste\nWhenever this creature deals combat damage to a player, that player creates a 0/1 colorless Goblin Construct artifact creature token with \"This token can\'t block\" and \"At the beginning of your upkeep, this token deals 1 damage to you.\"',
    imageUri: 'https://cards.scryfall.io/large/front/4/5/4540205c-eee8-4db3-8757-710de874b313.jpg?1783929355',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'combat_damage_to_player' },
        // „That player creates a token" — kontroler tokenu to CEL (ofiara);
        // context triggera niesie damagedPlayerId.
        effect: {
          type: 'create_token', cardId: 'token_goblin_construct', name: 'Goblin Construct',
          kind: 'creature', power: 0, toughness: 1, colors: [], types: ['Artifact', 'Creature'],
          subtypes: ['Goblin', 'Construct'], controllerFromEvent: 'damagedPlayerId',
          // „This token can't block" (CR 702.16e — stała cecha tokenu).
          cantBlock: true,
          // „At the beginning of your upkeep, this token deals 1 damage to you."
          abilities: [{
            type: 'triggered', trigger: { event: 'upkeep' },
            effect: { type: 'damage_to_controller', amount: 1 },
          }],
        },
      }),
    ],
    artId: 109, plan: 'Zendikar',
    support: { status: 'supported', limitations: [] },
  }),

  // 3. Flurry of Wings (ARB) — {G}{W}{U} Instant
  defineCard({
    id: 'flurry-of-wings', name: 'Flurry of Wings', set: 'ARB',
    types: ['Instant'], colors: ['G', 'W', 'U'], manaCost: 3,
    oracleText: 'Create X 1/1 white Bird Soldier creature tokens with flying, where X is the number of attacking creatures.',
    imageUri: 'https://cards.scryfall.io/large/front/d/b/dbabaf1d-0220-438d-8263-e23d8010fe24.jpg?1783942412',
    spell: {
      timing: 'instant',
      effects: [{
        type: 'create_token', cardId: 'token_bird_soldier', name: 'Bird Soldier',
        kind: 'creature', power: 1, toughness: 1, colors: ['W'],
        types: ['Creature'], subtypes: ['Bird', 'Soldier'], keywords: ['flying'],
        amount: 'attacking_creatures_count',
      }],
    },
    artId: 112, plan: 'Alara',
    support: { status: 'supported', limitations: [] },
  }),

  // 4. Expose to Daylight (RNA) — {2}{W} Instant
  defineCard({
    id: 'expose-to-daylight', name: 'Expose to Daylight', set: 'RNA',
    types: ['Instant'], colors: ['W'], manaCost: 3,
    oracleText: 'Destroy target artifact or enchantment. Scry 1.',
    imageUri: 'https://cards.scryfall.io/large/front/0/9/094c2ac3-040f-41fe-9a37-c037d90baec0.jpg?1783933723',
    spell: {
      timing: 'instant',
      targets: [{ type: 'artifact_or_enchantment' }],
      effects: [
        { type: 'destroy_permanent' },
        { type: 'scry', amount: 1 },
      ],
    },
    artId: 271, plan: 'Ravnica',
    support: { status: 'supported', limitations: [] },
  }),

  // 5. Etherium Abomination (ARB) — {3}{U}{B} 4/3 Artifact Creature (Unearth)
  defineCard({
    id: 'etherium-abomination', name: 'Etherium Abomination', set: 'ARB',
    types: ['Artifact', 'Creature'], subtypes: ['Horror'], colors: ['B', 'U'],
    power: 4, toughness: 3, manaCost: 5,
    oracleText: 'Unearth {1}{U}{B} ({1}{U}{B}: Return this card from your graveyard to the battlefield. It gains haste. Exile it at the beginning of the next end step or if it would leave the battlefield. Unearth only as a sorcery.)',
    imageUri: 'https://cards.scryfall.io/large/front/3/1/312bbd63-d6ff-4da5-868f-ed68cbc12d43.jpg?1783942438',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.activated,
        timing: 'sorcery',
        cost: { mana: 2, colors: ['U', 'B'] },
        fromGraveyard: true,
        effect: { type: 'unearth_return' },
      }),
    ],
    artId: 36, plan: 'Alara',
    support: { status: 'supported', limitations: [] },
  }),

  // 6. Awaken the Bear (KTK) — {2}{G} Instant
  defineCard({
    id: 'awaken-the-bear', name: 'Awaken the Bear', set: 'KTK',
    types: ['Instant'], colors: ['G'], manaCost: 3,
    oracleText: 'Target creature gets +3/+3 and gains trample until end of turn.',
    imageUri: 'https://cards.scryfall.io/large/front/8/0/803a6ac7-9327-4c2f-b023-93f5f65f83b8.jpg?1783939068',
    spell: {
      timing: 'instant',
      targets: [{ type: 'creature' }],
      effects: [
        { type: 'pump', power: 3, toughness: 3 },
        { type: 'grant_keywords_until_end_of_turn', keywords: ['trample'] },
      ],
    },
    artId: 173, plan: 'Tarkir',
    support: { status: 'supported', limitations: [] },
  }),

  // 7. Security Rhox (SNC) — {2}{R}{G} 5/4 Rhino Warrior (alternatywny koszt ze Skarbów)
  defineCard({
    id: 'security-rhox', name: 'Security Rhox', set: 'SNC',
    types: ['Creature'], subtypes: ['Rhino', 'Warrior'], colors: ['G', 'R'],
    power: 5, toughness: 4, manaCost: 4,
    oracleText: 'You may pay {R}{G} rather than pay this spell\'s mana cost. Spend only mana produced by Treasures to cast it this way.',
    imageUri: 'https://cards.scryfall.io/large/front/0/0/0050dd40-9a18-41e4-97e6-fce5bf220ccf.jpg?1783923072',
    // M69: alternatywny koszt {R}{G} płatny WYŁĄCZNIE maną ze Skarbów.
    treasureAltCost: { mana: 2, colors: ['R', 'G'] },
    artId: 71, plan: 'New Capenna',
    support: { status: 'supported', limitations: [] },
  }),

  // 8. Dreams of Steel and Oil (BRO) — {B} Sorcery
  defineCard({
    id: 'dreams-of-steel-and-oil', name: 'Dreams of Steel and Oil', set: 'BRO',
    types: ['Sorcery'], colors: ['B'], manaCost: 1,
    oracleText: 'Target opponent reveals their hand. You choose an artifact or creature card from it, then choose an artifact or creature card from their graveyard. Exile the chosen cards.',
    imageUri: 'https://cards.scryfall.io/large/front/2/6/261ac92e-c61a-4c11-aa6a-9ae1cb703e5c.jpg?1783920092',
    spell: {
      timing: 'sorcery',
      targets: [{ type: 'player', opponent: true }],
      effects: [{ type: 'reveal_hand_choose_exile' }],
    },
    artId: 421, plan: 'Dominaria',
    support: { status: 'supported', limitations: [] },
  }),

  // 9. Tenth District Veteran (RNA) — {2}{W} 2/3 Human Soldier (vigilance)
  defineCard({
    id: 'tenth-district-veteran', name: 'Tenth District Veteran', set: 'RNA',
    types: ['Creature'], subtypes: ['Human', 'Soldier'], colors: ['W'],
    power: 2, toughness: 3, manaCost: 3, keywords: ['vigilance'],
    oracleText: 'Vigilance\nWhenever this creature attacks, untap another target creature you control.',
    imageUri: 'https://cards.scryfall.io/large/front/e/f/ef573e92-3106-4b42-90e8-0e165de0659f.jpg?1783933715',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'attacks', requiresTarget: { type: 'creature_you_control' } },
        effect: { type: 'untap_permanent' },
      }),
    ],
    artId: 516, plan: 'Ravnica',
    support: { status: 'supported', limitations: [] },
  }),

  // Tokeny Batchu 28
  defineCard({
    id: 'token_bird_soldier', name: 'Bird Soldier', set: null,
    types: ['Creature', 'Token'], subtypes: ['Bird', 'Soldier'], colors: ['W'],
    keywords: ['flying'], power: 1, toughness: 1, manaCost: 0,
    support: { status: 'limited', limitations: ['token — nie można umieścić w talii; tworzony przez Flurry of Wings'] },
  }),
  defineCard({
    id: 'token_goblin_construct', name: 'Goblin Construct', set: null,
    types: ['Artifact', 'Creature', 'Token'], subtypes: ['Goblin', 'Construct'], colors: [],
    power: 0, toughness: 1, manaCost: 0,
    oracleText: 'This token can\'t block.\nAt the beginning of your upkeep, this token deals 1 damage to you.',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'upkeep' },
        effect: { type: 'damage_to_controller', amount: 1 },
      }),
    ],
    support: { status: 'limited', limitations: ['token — nie można umieścić w talii; tworzony przez Relic Robber'] },
  }),

  // =========================================================================
  // Batch 29 (10 kart, 2026-08-11) — lista właściciela
  // Mournful Zombie, Necrosquito, Curiosity, Veiled Ascension, Angelic
  // Benediction, Frontline War-Rager, Lash of the Balrog, Fireball,
  // Spread the Sickness, Warmaker Gunship. Dane Oracle w docs/cards/scryfall-*
  // (set=). artId i plan ze słownika tools/collection-art-ids.csv.
  // =========================================================================

  // 1. Mournful Zombie (APC) {2}{B} 2/1 — {W}, {T}: target player gains 1 life.
  defineCard({
    id: 'mournful-zombie', name: 'Mournful Zombie', set: 'APC',
    types: ['Creature'], subtypes: ['Zombie'], colors: ['B'],
    power: 2, toughness: 1, manaCost: 3,
    oracleText: '{W}, {T}: Target player gains 1 life.',
    imageUri: 'https://cards.scryfall.io/large/front/9/b/9ba12fb1-de8c-46c6-b33f-e0580ed2a3ee.jpg?1783945349',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.activated,
        cost: { tap: true, mana: 1, colors: ['W'] },
        targets: [{ type: 'player' }],
        effect: { type: 'gain_life_target', amount: 1 },
      }),
    ],
    artId: 172, plan: 'Dominaria',
    support: { status: 'supported', limitations: [] },
  }),

  // 2. Necrosquito (ONE) {3}{B} 0/0 flying — enters 2 oil; +1/+1 per oil;
  //    another creature/artifact you control dies -> oil counter.
  defineCard({
    id: 'necrosquito', name: 'Necrosquito', set: 'ONE',
    types: ['Creature'], subtypes: ['Phyrexian', 'Insect'], colors: ['B'],
    keywords: ['flying'], power: 0, toughness: 0, manaCost: 4,
    entersWithCounters: { oil: 2 },
    oracleText: 'Flying\nThis creature enters with two oil counters on it.\nThis creature gets +1/+1 for each oil counter on it.\nWhenever another creature or artifact you control is put into a graveyard from the battlefield, put an oil counter on this creature.',
    imageUri: 'https://cards.scryfall.io/large/front/7/2/72af72d2-5995-4cad-82f1-e2d0c465d6f1.jpg?1783918044',
    abilities: [
      // Static: „This creature gets +1/+1 for each oil counter on it."
      // (CR 604.3) — dynamiczny pump liczony w staticBonuses (oil_counters);
      // sam licznik oil nie daje P/T (audyt PR #41, B5).
      createAbility({
        type: ABILITY_TYPE.static,
        pump: { power: 'oil_counters', toughness: 'oil_counters' },
      }),
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'other_permanent_you_control_dies' },
        effect: { type: 'add_counter', counter: 'oil', amount: 1 },
      }),
    ],
    artId: 346, plan: 'Mirrodin',
    support: { status: 'supported', limitations: [] },
  }),

  // 3. Curiosity (ISD) {U} Aura — Enchant creature; enchanted creature deals
  //    damage to an opponent -> you may draw a card.
  defineCard({
    id: 'curiosity', name: 'Curiosity', set: 'ISD',
    types: ['Enchantment'], subtypes: ['Aura'], colors: ['U'], manaCost: 1,
    oracleText: 'Enchant creature\nWhenever enchanted creature deals damage to an opponent, you may draw a card.',
    imageUri: 'https://cards.scryfall.io/large/front/c/5/c5a0be10-c20f-4ac0-89a5-1770ecf48aad.jpg?1783930457',
    aura: { enchant: 'creature' },
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'enchanted_creature_damage_to_opponent', mayFire: true },
        effect: { type: 'draw_cards', amount: 1 },
      }),
    ],
    artId: 428, plan: 'Wiedźmin',
    support: { status: 'supported', limitations: [] },
  }),

  // 4. Veiled Ascension (MKC) {3}{W} Enchantment — enters: flying counter on
  //    each face-down creature you control; face-down enter with flying counter;
  //    upkeep: you may cloak top card.
  defineCard({
    id: 'veiled-ascension', name: 'Veiled Ascension', set: 'MKC',
    types: ['Enchantment'], colors: ['W'], manaCost: 4,
    oracleText: 'When this enchantment enters, put a flying counter on each face-down creature you control.\nFace-down creatures you control enter with a flying counter on them.\nAt the beginning of your upkeep, you may cloak the top card of your library.',
    imageUri: 'https://cards.scryfall.io/large/front/5/1/5196eb5b-9330-46f7-b6f7-9c1164ea27d7.jpg?1783913050',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'enter_battlefield' },
        effect: { type: 'add_flying_counter_to_face_down_you_control' },
      }),
      createAbility({
        type: ABILITY_TYPE.static,
        faceDownEnterFlyingCounter: true,
      }),
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'upkeep', mayFire: true },
        effect: { type: 'cloak' },
      }),
    ],
    artId: 57, plan: 'Ravnica',
    support: { status: 'supported', limitations: [] },
  }),

  // 5. Angelic Benediction (ALA) {3}{W} Enchantment — Exalted; attacks alone
  //    -> you may tap target creature.
  defineCard({
    id: 'angelic-benediction', name: 'Angelic Benediction', set: 'ALA',
    types: ['Enchantment'], colors: ['W'], manaCost: 4,
    keywords: ['exalted'],
    oracleText: 'Exalted (Whenever a creature you control attacks alone, that creature gets +1/+1 until end of turn.)\nWhenever a creature you control attacks alone, you may tap target creature.',
    imageUri: 'https://cards.scryfall.io/large/front/a/2/a2a782a3-cc30-47c2-aab3-18abcda3df0a.jpg?1783938785',
    abilities: [
      // Exalted: atakujący samotnie dostaje +1/+1 do końca tury.
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'attacks_alone' },
        effect: { type: 'exalted_pump', power: 1, toughness: 1 },
      }),
      // Druga zdolność: „you may tap target creature" przy samotnym ataku.
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'attacks_alone', requiresTarget: { type: 'creature', optional: true } },
        effect: { type: 'tap_permanent' },
      }),
    ],
    artId: 87, plan: 'Alara',
    support: { status: 'supported', limitations: [] },
  }),

  // 6. Frontline War-Rager (EOE) {2}{R} 2/3 — your end step: if 2+ tapped
  //    creatures you control, +1/+1 counter.
  defineCard({
    id: 'frontline-war-rager', name: 'Frontline War-Rager', set: 'EOE',
    types: ['Creature'], subtypes: ['Kavu', 'Soldier'], colors: ['R'],
    power: 2, toughness: 3, manaCost: 3,
    oracleText: 'At the beginning of your end step, if you control two or more tapped creatures, put a +1/+1 counter on this creature.',
    imageUri: 'https://cards.scryfall.io/large/front/f/a/fa232943-818b-4944-be60-2d80c806bf62.jpg?1783905954',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'end_step', condition: { minTappedCreaturesControlled: 2 } },
        effect: { type: 'add_counter', counter: '+1/+1', amount: 1 },
      }),
    ],
    artId: 358, plan: 'The Edge',
    support: { status: 'supported', limitations: [] },
  }),

  // 7. Lash of the Balrog (LTR) {B} Sorcery — additional cost sacrifice a
  //    creature OR pay {4}; destroy target creature.
  defineCard({
    id: 'lash-of-the-balrog', name: 'Lash of the Balrog', set: 'LTR',
    types: ['Sorcery'], colors: ['B'], manaCost: 1,
    oracleText: 'As an additional cost to cast this spell, sacrifice a creature or pay {4}.\nDestroy target creature.',
    imageUri: 'https://cards.scryfall.io/large/front/8/1/812fee97-e145-4458-b495-bc6ad227335b.jpg?1783916302',
    spell: {
      timing: 'sorcery',
      targets: [{ type: 'creature' }],
      additionalCost: { sacrificeCreature: true, orPayMana: 4 },
      effects: [{ type: 'destroy_permanent' }],
    },
    artId: 257, plan: 'Śródziemie',
    support: { status: 'supported', limitations: [] },
  }),

  // 8. Fireball (X-cost, any number of targets, divided damage).
  defineCard({
    id: 'fireball', name: 'Fireball', set: 'JVC',
    types: ['Sorcery'], colors: ['R'], manaCost: 1,
    oracleText: 'This spell costs {1} more to cast for each target beyond the first.\nFireball deals X damage divided evenly, rounded down, among any number of targets.',
    imageUri: 'https://cards.scryfall.io/large/front/d/f/df45a43e-a5b7-4fd4-873b-7b3c021be198.jpg?1783922739',
    spell: { timing: 'sorcery', fireball: true, effects: [{ type: 'fireball_resolve' }] },
    artId: 436, plan: 'Warhammer Fantasy',
    support: { status: 'supported', limitations: [] },
  }),

  // 9. Spread the Sickness (MBS) {4}{B} Sorcery — destroy target creature,
  //    then proliferate.
  defineCard({
    id: 'spread-the-sickness', name: 'Spread the Sickness', set: 'MBS',
    types: ['Sorcery'], colors: ['B'], manaCost: 5,
    oracleText: 'Destroy target creature, then proliferate.',
    imageUri: 'https://cards.scryfall.io/large/front/0/0/003bc8f1-f282-491c-984d-1ce7ac027053.jpg?1783938409',
    spell: {
      timing: 'sorcery',
      targets: [{ type: 'creature' }],
      effects: [
        { type: 'destroy_permanent' },
        { type: 'proliferate' },
      ],
    },
    artId: 506, plan: 'Mirrodin',
    support: { status: 'supported', limitations: [] },
    notes: ['proliferate kolejkuje pendingProliferate po destroy; gracz wybiera cele'],
  }),

  // =========================================================================
  // Batch 30 (10 kart, 2026-08-11) — lista właściciela
  // Banishment Decree, Crew Captain, Consume Spirit, Altar of the Goyf,
  // Instant Ramen, Inspiring Bard, Seismic Monstrosaur, Epic Experiment,
  // Gurmag Drowner, Wavecrash Triton. Dane Oracle ze Scryfall (set=),
  // artId ze słownika kolekcji.
  // =========================================================================

  // 1. Banishment Decree (MBS) {3}{W}{W} Instant — bounce to owner's library top
  defineCard({
    id: 'banishment-decree', name: 'Banishment Decree', set: 'MBS',
    types: ['Instant'], colors: ['W'], manaCost: 5,
    oracleText: "Put target artifact, creature, or enchantment on top of its owner's library.",
    imageUri: 'https://cards.scryfall.io/large/front/2/c/2c5f605c-9d16-493e-bc44-0e15bdf8c0bf.jpg?1783941394',
    spell: {
      timing: 'instant',
      targets: [{ type: 'artifact_or_creature_or_enchantment' }],
      effects: [{ type: 'bounce_to_library_top' }],
    },
    artId: 476, plan: 'Mirrodin',
    support: { status: 'supported', limitations: [] },
  }),

  // 2. Crew Captain (SNC) {B}{R}{G} 4/2 — Haste; indestructible while entered this turn
  defineCard({
    id: 'crew-captain', name: 'Crew Captain', set: 'SNC',
    types: ['Creature'], subtypes: ['Human', 'Warrior'], colors: ['B', 'G', 'R'],
    power: 4, toughness: 2, manaCost: 3, keywords: ['haste'],
    oracleText: 'Haste\nThis creature has indestructible as long as it entered this turn.',
    imageUri: 'https://cards.scryfall.io/large/front/9/9/99806615-2f4a-4fe4-82f8-83445ae93a97.jpg?1783923089',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.static,
        condition: { enteredThisTurn: true },
        keywords: ['indestructible'],
      }),
    ],
    artId: 14, plan: 'New Capenna',
    support: { status: 'supported', limitations: [] },
  }),

  // 3. Consume Spirit (MRD) {X}{1}{B} Sorcery — X damage to any target, gain X life
  defineCard({
    id: 'consume-spirit', name: 'Consume Spirit', set: 'MRD',
    types: ['Sorcery'], colors: ['B'], manaCost: 2,
    oracleText: 'Spend only black mana on X.\nConsume Spirit deals X damage to any target and you gain X life.',
    imageUri: 'https://cards.scryfall.io/large/front/f/3/f375a49c-806a-4d8b-9513-6b4afc19497b.jpg?1783944549',
    spell: {
      timing: 'sorcery',
      xCost: { cap: 15, black: true },
      targets: [{ type: 'any_target' }],
      effects: [
        { type: 'damage', amount: 'X' },
        { type: 'gain_life', amount: 'X' },
      ],
    },
    artId: 370, plan: 'Mirrodin',
    support: { status: 'supported', limitations: [] },
  }),

  // 4. Altar of the Goyf (MH2) {5} Kindred Artifact — attacks alone pump + Lhurgoyf trample
  defineCard({
    id: 'altar-of-the-goyf', name: 'Altar of the Goyf', set: 'MH2',
    types: ['Kindred', 'Artifact'], subtypes: ['Lhurgoyf'], colors: [], manaCost: 5,
    oracleText: 'Whenever a creature you control attacks alone, it gets +X/+X until end of turn, where X is the number of card types among cards in all graveyards.\nLhurgoyf creatures you control have trample.',
    imageUri: 'https://cards.scryfall.io/large/front/e/0/e0b3a98f-2b3c-438b-b78c-eef8d917f68e.jpg?1783926806',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'attacks_alone' },
        effect: { type: 'buff_creature_until_end_of_turn', power: 'card_types_in_all_graveyards', toughness: 'card_types_in_all_graveyards' },
      }),
      createAbility({
        type: ABILITY_TYPE.static,
        scope: { affects: 'creatures_with_subtype', subtype: 'Lhurgoyf' },
        keywords: ['trample'],
      }),
    ],
    artId: 184, plan: 'Dominaria',
    support: { status: 'supported', limitations: [] },
  }),

  // 5. Instant Ramen (FIN) {2} Artifact — Food; Flash; ETB draw; {2},{T},sac: gain 3
  defineCard({
    id: 'instant-ramen', name: 'Instant Ramen', set: 'FIN',
    types: ['Artifact'], subtypes: ['Food'], colors: [], manaCost: 2,
    keywords: ['flash'],
    oracleText: 'Flash\nWhen this artifact enters, draw a card.\n{2}, {T}, Sacrifice this artifact: You gain 3 life.',
    imageUri: 'https://cards.scryfall.io/large/front/e/f/ef7011f4-fc08-4b15-973d-d15357cbe744.jpg?1783906556',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'enter_battlefield' },
        effect: { type: 'draw_cards', amount: 1 },
      }),
      createAbility({
        type: ABILITY_TYPE.activated,
        cost: { tap: true, mana: 2, sacrificeSelf: true },
        effect: { type: 'gain_life', amount: 3 },
      }),
    ],
    artId: 500, plan: 'Final Fantasy',
    support: { status: 'supported', limitations: [] },
  }),

  // 6. Inspiring Bard (AFR) {3}{G} 3/3 — ETB choose one: +2/+2 target or gain 3 life
  defineCard({
    id: 'inspiring-bard', name: 'Inspiring Bard', set: 'AFR',
    types: ['Creature'], subtypes: ['Elf', 'Bard'], colors: ['G'],
    power: 3, toughness: 3, manaCost: 4,
    oracleText: 'When this creature enters, choose one —\n• Bardic Inspiration — Target creature gets +2/+2 until end of turn.\n• Song of Rest — You gain 3 life.',
    imageUri: 'https://cards.scryfall.io/large/front/0/b/0b33db66-d205-4164-b168-6084df562ebb.jpg?1783926461',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: {
          event: 'enter_battlefield',
          modes: [
            { name: 'Inspiracja barda', targets: [{ type: 'creature' }], effects: [{ type: 'pump', power: 2, toughness: 2 }] },
            { name: 'Pieśń odpoczynku', effects: [{ type: 'gain_life', amount: 3 }] },
          ],
        },
        effect: [],
      }),
    ],
    artId: 253, plan: 'Forgotten Realms',
    support: { status: 'supported', limitations: [] },
  }),

  // 7. Seismic Monstrosaur (LCI) {4}{R}{R} 6/5 — Trample; {2}{R}, sac a land: draw; Mountaincycling {2}
  defineCard({
    id: 'seismic-monstrosaur', name: 'Seismic Monstrosaur', set: 'LCI',
    types: ['Creature'], subtypes: ['Dinosaur'], colors: ['R'],
    power: 6, toughness: 5, manaCost: 6, keywords: ['trample'],
    oracleText: 'Trample\n{2}{R}, Sacrifice a land: Draw a card.\nMountaincycling {2} ({2}, Discard this card: Search your library for a Mountain card, reveal it, put it into your hand, then shuffle.)',
    imageUri: 'https://cards.scryfall.io/large/front/9/8/98aeb9dc-18f9-4120-ac3d-226c62a1dc1d.jpg?1783913754',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.activated,
        cost: { mana: 3, colors: ['R'], sacrificeLand: true },
        effect: { type: 'draw_cards', amount: 1 },
      }),
      createAbility({
        type: ABILITY_TYPE.activated,
        keyword: 'cycling',
        cost: { mana: 2 },
        cycling: { subtypes: ['Mountain'] },
        effect: [],
      }),
    ],
    artId: 211, plan: 'Ixalan',
    support: { status: 'supported', limitations: [] },
  }),

  // 8. Epic Experiment (OTC) {X}{U}{R} Sorcery — exile top X, cast inst/sorc MV<=X free, rest to grave
  defineCard({
    id: 'epic-experiment', name: 'Epic Experiment', set: 'OTC',
    types: ['Sorcery'], colors: ['R', 'U'], manaCost: 2,
    oracleText: "Exile the top X cards of your library. You may cast instant and sorcery spells with mana value X or less from among them without paying their mana costs. Then put all cards exiled this way that weren't cast into your graveyard.",
    imageUri: 'https://cards.scryfall.io/large/front/d/3/d3ad9626-3124-4ad6-9cac-49aa9c3ce88c.jpg?1783911901',
    spell: {
      timing: 'sorcery',
      xCost: { cap: 15 },
      targets: [],
      effects: [{ type: 'epic_experiment', amount: 'X' }],
    },
    artId: 434, plan: 'Ravnica',
    support: { status: 'supported', limitations: [] },
  }),

  // 9. Gurmag Drowner (DTK) {3}{U} 2/4 — Exploit; when exploits, look top 4, one to hand rest to grave
  defineCard({
    id: 'gurmag-drowner', name: 'Gurmag Drowner', set: 'DTK',
    types: ['Creature'], subtypes: ['Snake', 'Wizard'], colors: ['U'],
    power: 2, toughness: 4, manaCost: 4,
    oracleText: 'Exploit (When this creature enters, you may sacrifice a creature.)\nWhen this creature exploits a creature, look at the top four cards of your library. Put one of them into your hand and the rest into your graveyard.',
    imageUri: 'https://cards.scryfall.io/large/front/5/0/5087a664-6ed7-43a1-8851-71bbee204eb1.jpg?1783938607',
    exploit: {},
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'exploits' },
        effect: { type: 'look_top_put_one_hand_rest_grave', amount: 4 },
      }),
    ],
    artId: 465, plan: 'Tarkir',
    support: { status: 'supported', limitations: [] },
  }),

  // 10. Wavecrash Triton (THS) {2}{U} 1/4 — Heroic: tap creature opponent controls (no untap)
  defineCard({
    id: 'wavecrash-triton', name: 'Wavecrash Triton', set: 'THS',
    types: ['Creature'], subtypes: ['Merfolk', 'Wizard'], colors: ['U'],
    power: 1, toughness: 4, manaCost: 3,
    oracleText: "Heroic — Whenever you cast a spell that targets this creature, tap target creature an opponent controls. That creature doesn't untap during its controller's next untap step.",
    imageUri: 'https://cards.scryfall.io/large/front/7/3/7336ca1e-13ef-4e49-a526-3f285bc339bb.jpg?1783939786',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'spell_targets_this_creature', requiresTarget: { type: 'creature_opponent_controls' } },
        effect: [{ type: 'tap_permanent' }, { type: 'dont_untap_next_untap_step' }],
      }),
    ],
    artId: 508, plan: 'Theros',
    support: { status: 'supported', limitations: [] },
  }),

  // 10. Warmaker Gunship (EOE) {2}{R} 4/3 Artifact Spacecraft — enters: deals
  //     damage = artifacts you control to target creature an opponent controls;
  //     Station (tap another creature: charge = its power; 6+ artifact creature);
  //     6+ Flying.
  defineCard({
    id: 'warmaker-gunship', name: 'Warmaker Gunship', set: 'EOE',
    types: ['Artifact'], subtypes: ['Spacecraft'], colors: ['R'],
    power: 4, toughness: 3, manaCost: 3,
    station: { threshold: 6, keywords: ['flying'] },
    oracleText: 'When this Spacecraft enters, it deals damage equal to the number of artifacts you control to target creature an opponent controls.\nStation (Tap another creature you control: Put charge counters equal to its power on this Spacecraft. Station only as a sorcery. It\'s an artifact creature at 6+.)\n6+ | Flying',
    imageUri: 'https://cards.scryfall.io/large/front/9/e/9e5957f4-1cae-4989-8b40-27fc6e2fcf5e.jpg?1783905944',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'enter_battlefield', requiresTarget: { type: 'creature_opponent_controls' } },
        effect: { type: 'damage', amount: 'artifacts_you_control' },
      }),
      createAbility({
        type: ABILITY_TYPE.activated,
        keyword: 'station',
        cost: { tapOtherCreature: true },
        timing: 'sorcery',
        effect: [{ type: 'station_counters', counter: 'charge' }],
      }),
    ],
    artId: 515, plan: 'The Edge',
    support: { status: 'supported', limitations: [] },
  }),

  // =========================================================================
  // Batch 31 (10 kart, 2026-08-13) — lista właściciela
  // Furious Forebear, Jwari Shapeshifter, Floodhound, Inspire Awe,
  // Cogwork Assembler, Dread Warlock, Steel Sabotage, Warrior's Sword,
  // Awaken the Sleeper, Impact Tremors. Dane Oracle ze Scryfall (set=),
  // artId ze słownika kolekcji.
  // =========================================================================

  // 1. Furious Forebear (TDM) {1}{W} 3/1 Spirit Warrior — dies-in-graveyard
  defineCard({
    id: 'furious-forebear', name: 'Furious Forebear', set: 'TDM',
    types: ['Creature'], subtypes: ['Spirit', 'Warrior'], colors: ['W'],
    power: 3, toughness: 1, manaCost: 2,
    oracleText: "Whenever a creature you control dies while this card is in your graveyard, you may pay {1}{W}. If you do, return this card from your graveyard to your hand.",
    imageUri: 'https://cards.scryfall.io/large/front/a/4/a4f247b6-8212-4e78-a452-d2d3be228d8e.jpg?1783907413',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        // Trigger żyje na karcie w GROBIE; odpala się na śmierć kontrolowanego
        // stwora (skan w fireDeathTriggers). Opcjonalna płatność {1}{W}.
        trigger: { event: 'other_creature_you_control_dies', payMana: 2, payColors: ['W'] },
        effect: { type: 'return_source_from_graveyard_to_hand' },
      }),
    ],
    artId: 225, plan: 'Tarkir',
    support: { status: 'supported', limitations: [] },
  }),

  // 2. Jwari Shapeshifter (WWK) {1}{U} 0/0 — copy Ally on enter
  defineCard({
    id: 'jwari-shapeshifter', name: 'Jwari Shapeshifter', set: 'WWK',
    types: ['Creature'], subtypes: ['Shapeshifter', 'Ally'], colors: ['U'],
    power: 0, toughness: 0, manaCost: 2,
    oracleText: 'You may have this creature enter as a copy of any Ally creature on the battlefield.',
    imageUri: 'https://cards.scryfall.io/large/front/5/8/587f91f6-b46e-4dd5-a86d-1048054dd3c0.jpg?1783942061',
    // „enter as a copy" — rozstrzygane przy wejściu (przed SBA), inaczej 0/0
    // ginie, zanim trigger ETB by się odpalił (CR 707 / 704.5e).
    enterAsCopy: { subtype: 'Ally' },
    artId: 227, plan: 'Zendikar',
    support: { status: 'supported', limitations: [] },
  }),

  // 3. Floodhound (MH2) {U} 1/2 — Investigate
  defineCard({
    id: 'floodhound', name: 'Floodhound', set: 'MH2',
    types: ['Creature'], subtypes: ['Elemental', 'Dog'], colors: ['U'],
    power: 1, toughness: 2, manaCost: 1,
    oracleText: "{3}, {T}: Investigate. (Create a Clue token. It's an artifact with \"{2}, Sacrifice this token: Draw a card.\")",
    imageUri: 'https://cards.scryfall.io/large/front/a/5/a5b1ac05-bd87-4605-8443-0469276e1e3a.jpg?1783926879',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.activated,
        cost: { mana: 3, tap: true },
        effect: { type: 'investigate', amount: 1 },
      }),
    ],
    artId: 193, plan: 'Wiedźmin',
    support: { status: 'supported', limitations: [] },
  }),

  // 4. Inspire Awe (THB) {3}{G} Instant — prevent combat damage except enchanted/enchantment creatures + scry 2
  defineCard({
    id: 'inspire-awe', name: 'Inspire Awe', set: 'THB',
    types: ['Instant'], colors: ['G'], manaCost: 4,
    oracleText: 'Prevent all combat damage that would be dealt this turn except combat damage that would be dealt by enchanted creatures and enchantment creatures. Scry 2.',
    imageUri: 'https://cards.scryfall.io/large/front/b/2/b23c8b5a-2e18-4dd8-b236-5b1fd356f867.jpg?1783931537',
    spell: {
      timing: 'instant', targets: [],
      effects: [
        { type: 'prevent_combat_damage_except_enchanted' },
        { type: 'scry', amount: 2 },
      ],
    },
    artId: 433, plan: 'Theros',
    support: { status: 'supported', limitations: [] },
  }),

  // 5. Cogwork Assembler (2XM) {3} 2/3 — copy artifact token, haste, delayed exile
  defineCard({
    id: 'cogwork-assembler', name: 'Cogwork Assembler', set: '2XM',
    types: ['Artifact', 'Creature'], subtypes: ['Assembly-Worker'], colors: [],
    power: 2, toughness: 3, manaCost: 3,
    oracleText: "{7}: Create a token that's a copy of target artifact. That token gains haste. Exile it at the beginning of the next end step.",
    imageUri: 'https://cards.scryfall.io/large/front/e/4/e4bfde3f-f7d3-4902-b3cd-23f3fa53eff4.jpg?1783930116',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.activated,
        cost: { mana: 7 },
        targets: [{ type: 'artifact' }],
        effect: { type: 'create_copy_token' },
      }),
    ],
    artId: 186, plan: 'Kaladesh',
    support: { status: 'supported', limitations: [] },
  }),

  // 6. Dread Warlock (M10) {1}{B}{B} 2/2 — can't be blocked except by black creatures
  defineCard({
    id: 'dread-warlock', name: 'Dread Warlock', set: 'M10',
    types: ['Creature'], subtypes: ['Human', 'Wizard', 'Warlock'], colors: ['B'],
    power: 2, toughness: 2, manaCost: 3,
    oracleText: "This creature can't be blocked except by black creatures.",
    imageUri: 'https://cards.scryfall.io/large/front/4/f/4f964660-c2db-4995-bb16-65383362cf19.jpg?1783942384',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.static,
        cantBeBlockedExceptByColors: ['B'],
      }),
    ],
    artId: 245, plan: 'Wiedźmin',
    support: { status: 'supported', limitations: [] },
  }),

  // 7. Steel Sabotage (2XM) {U} Instant — modal counter artifact spell / return artifact
  defineCard({
    id: 'steel-sabotage', name: 'Steel Sabotage', set: '2XM',
    types: ['Instant'], colors: ['U'], manaCost: 1,
    oracleText: 'Choose one —\n• Counter target artifact spell.\n• Return target artifact to its owner\'s hand.',
    imageUri: 'https://cards.scryfall.io/large/front/c/2/c227437d-1fc7-4a00-ace5-80795adc51d3.jpg?1783930190',
    spell: {
      timing: 'instant',
      modes: [
        { name: 'Kontr', targets: [{ type: 'artifact_spell_on_stack' }],
          effects: [{ type: 'counter_spell' }] },
        { name: 'Odbicie', targets: [{ type: 'artifact' }],
          effects: [{ type: 'bounce_permanent' }] },
      ],
    },
    artId: 168, plan: 'Mirrodin',
    support: { status: 'supported', limitations: [] },
  }),

  // 8. Warrior's Sword (FIN) {3}{R} Equipment — Job select, +3/+2 Warrior, Equip {5}
  defineCard({
    id: 'warriors-sword', name: "Warrior's Sword", set: 'FIN',
    types: ['Artifact'], subtypes: ['Equipment'], colors: ['R'], manaCost: 4,
    equipment: { equip: 5, pump: { power: 3, toughness: 2 }, subtypes: ['Warrior'] },
    oracleText: "Job select (When this Equipment enters, create a 1/1 colorless Hero creature token, then attach this to it.)\nEquipped creature gets +3/+2 and is a Warrior in addition to its other types.\nEquip {5} ({5}: Attach to target creature you control. Equip only as a sorcery.)",
    imageUri: 'https://cards.scryfall.io/large/front/c/b/cb98a7dd-542e-4448-b3bb-ff5d67a36535.jpg?1783906593',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'enter_battlefield' },
        effect: { type: 'job_select' },
      }),
      createAbility({
        type: ABILITY_TYPE.activated,
        keyword: 'equip',
        cost: { mana: 5 },
        effect: [],
      }),
    ],
    artId: 435, plan: 'Final Fantasy',
    support: { status: 'supported', limitations: [] },
  }),

  // 9. Awaken the Sleeper (ONE) {3}{R} Sorcery — gain control until EOT + untap + haste + destroy equipment
  defineCard({
    id: 'awaken-the-sleeper', name: 'Awaken the Sleeper', set: 'ONE',
    types: ['Sorcery'], colors: ['R'], manaCost: 4,
    oracleText: "Gain control of target creature until end of turn. Untap that creature. It gains haste until end of turn. If it's equipped, you may destroy all Equipment attached to that creature.",
    imageUri: 'https://cards.scryfall.io/large/front/3/b/3b92f866-2522-4f2a-a5ca-7d01ad79b927.jpg?1783918036',
    spell: {
      timing: 'sorcery',
      targets: [{ type: 'creature' }],
      effects: [
        { type: 'gain_control_until_end_of_turn' },
        { type: 'destroy_equipment_attached' },
      ],
    },
    artId: 490, plan: 'Mirrodin',
    support: { status: 'supported', limitations: [] },
  }),

  // 10. Impact Tremors (DTK) {1}{R} Enchantment — creature you control enters → 1 dmg each opponent
  defineCard({
    id: 'impact-tremors', name: 'Impact Tremors', set: 'DTK',
    types: ['Enchantment'], colors: ['R'], manaCost: 2,
    oracleText: 'Whenever a creature you control enters, this enchantment deals 1 damage to each opponent.',
    imageUri: 'https://cards.scryfall.io/large/front/5/6/56fb4035-197b-4d28-9bf7-bb62c304067e.jpg?1783938589',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'creature_you_control_enters' },
        effect: { type: 'damage_each_opponent', amount: 1 },
      }),
    ],
    artId: 479, plan: 'Tarkir',
    support: { status: 'supported', limitations: [] },
  }),


  // =========================================================================
  // Batch 32 (10 kart, 2026-08-13) — lista właściciela
  // Dream Twist, Voice of the Vermin, Setessan Skirmisher, Fathom Fleet
  // Cutthroat, Fierce Empath, Soulbright Flamekin, Rustvine Cultivator,
  // Trained Arynx, Nature's Embrace, Ballista Watcher. Dane Oracle ze Scryfall.
  // =========================================================================

  defineCard({
    id: 'dream-twist', name: 'Dream Twist', set: 'ISD',
    types: ['Instant'], colors: ['U'], manaCost: 1,
    oracleText: "Target player mills three cards.\\nFlashback {1}{U} (You may cast this card from your graveyard for its flashback cost. Then exile it.)",
    imageUri: 'https://cards.scryfall.io/large/front/d/5/d5dd8790-bfdf-427d-8e8d-a5c3a64a3063.jpg?1783940975',
    spell: {
      timing: 'instant',
      targets: [{ type: 'player' }],
      effects: [{ type: 'mill_cards', amount: 3 }],
      flashback: { cost: 2, colors: ['U'] },
    },
    artId: 50, plan: 'Innistrad',
    support: { status: 'supported', limitations: [] },
  }),

  defineCard({
    id: 'voice-of-the-vermin', name: 'Voice of the Vermin', set: 'SNC',
    types: ['Creature'], subtypes: ['Human', 'Citizen'], colors: ['G'],
    power: 2, toughness: 2, manaCost: 4,
    entersWithCounters: { shield: 1 },
    oracleText: "This creature enters with a shield counter on it.\\nWhenever this creature attacks, target creature you control has base power and toughness 4/4 until end of turn.",
    imageUri: 'https://cards.scryfall.io/large/front/b/f/bfe4e0eb-23a5-46a5-b719-5a6f9a1fc4ce.jpg?1783923096',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'attacks', requiresTarget: { type: 'creature_you_control' } },
        effect: { type: 'set_base_pt_until_end_of_turn', power: 4, toughness: 4 },
      }),
    ],
    artId: 96, plan: 'New Capenna',
    support: { status: 'supported', limitations: [] },
  }),

  defineCard({
    id: 'setessan-skirmisher', name: 'Setessan Skirmisher', set: 'THB',
    types: ['Creature'], subtypes: ['Human', 'Warrior'], colors: ['G'],
    power: 2, toughness: 1, manaCost: 2,
    oracleText: "Constellation — Whenever an enchantment you control enters, this creature gets +1/+1 until end of turn.",
    imageUri: 'https://cards.scryfall.io/large/front/4/6/46739993-6afe-428d-bf63-b57649e38a65.jpg?1783931527',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'enchantment_you_control_enters' },
        effect: { type: 'pump', power: 1, toughness: 1 },
      }),
    ],
    artId: 454, plan: 'Theros',
    support: { status: 'supported', limitations: [] },
  }),

  defineCard({
    id: 'fathom-fleet-cutthroat', name: 'Fathom Fleet Cutthroat', set: 'M20',
    types: ['Creature'], subtypes: ['Human', 'Pirate'], colors: ['B'],
    power: 3, toughness: 3, manaCost: 4,
    oracleText: "When this creature enters, destroy target creature an opponent controls that was dealt damage this turn.",
    imageUri: 'https://cards.scryfall.io/large/front/6/5/65a7004c-1952-41df-b645-b34bcbc3e401.jpg?1783932994',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'enter_battlefield', requiresTarget: { type: 'creature_opponent_damaged_this_turn' } },
        effect: { type: 'destroy_permanent' },
      }),
    ],
    artId: 498, plan: 'Ixalan',
    support: { status: 'supported', limitations: [] },
  }),

  defineCard({
    id: 'fierce-empath', name: 'Fierce Empath', set: '2XM',
    types: ['Creature'], subtypes: ['Elf'], colors: ['G'],
    power: 1, toughness: 1, manaCost: 3,
    oracleText: "When this creature enters, you may search your library for a creature card with mana value 6 or greater, reveal it, put it into your hand, then shuffle.",
    imageUri: 'https://cards.scryfall.io/large/front/f/1/f13ddd38-397c-4119-8d55-50c7407883f9.jpg?1783930147',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'enter_battlefield' },
        effect: { type: 'search_library_to_hand', qualifier: { types: ['Creature'], minManaValue: 6 } },
      }),
    ],
    artId: 33, plan: 'Śródziemie',
    support: { status: 'supported', limitations: [] },
  }),

  defineCard({
    id: 'soulbright-flamekin', name: 'Soulbright Flamekin', set: 'MM2',
    types: ['Creature'], subtypes: ['Elemental', 'Shaman'], colors: ['R'],
    power: 2, toughness: 1, manaCost: 2,
    oracleText: "{2}: Target creature gains trample until end of turn. If this is the third time this ability has resolved this turn, you may add {R}{R}{R}{R}{R}{R}{R}{R}.",
    imageUri: 'https://cards.scryfall.io/large/front/6/d/6d622758-b182-4a2d-9746-9b03611c1212.jpg?1783938403',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.activated,
        cost: { mana: 2 },
        targets: [{ type: 'creature' }],
        effect: { type: 'grant_keywords_until_end_of_turn', keywords: ['trample'] },
        onNthResolve: { n: 3, may: true, effect: { type: 'add_mana', amount: 8, colors: ['R'] } },
      }),
    ],
    artId: 290, plan: 'Lorwyn',
    support: { status: 'supported', limitations: [] },
  }),

  defineCard({
    id: 'rustvine-cultivator', name: 'Rustvine Cultivator', set: 'ONE',
    types: ['Creature'], subtypes: ['Phyrexian', 'Elf', 'Druid'], colors: ['G'],
    power: 1, toughness: 2, manaCost: 1,
    oracleText: "{T}: Put an oil counter on this creature.\\n{T}, Remove an oil counter from this creature: Untap target land.",
    imageUri: 'https://cards.scryfall.io/large/front/6/b/6b71fd8f-e688-4210-bc5b-a3f19b5b3497.jpg?1783918010',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.activated,
        cost: { tap: true },
        effect: { type: 'add_counter', counter: 'oil', amount: 1 },
      }),
      createAbility({
        type: ABILITY_TYPE.activated,
        cost: { tap: true, removeCounter: { name: 'oil', amount: 1 } },
        targets: [{ type: 'land' }],
        effect: { type: 'untap_permanent' },
      }),
    ],
    artId: 289, plan: 'Mirrodin',
    support: { status: 'supported', limitations: [] },
  }),

  defineCard({
    id: 'trained-arynx', name: 'Trained Arynx', set: 'OTJ',
    types: ['Creature'], subtypes: ['Cat', 'Beast', 'Mount'], colors: ['W'],
    power: 3, toughness: 1, manaCost: 2,
    oracleText: "Whenever this creature attacks while saddled, it gains first strike until end of turn. Scry 1.\\nSaddle 2 (Tap any number of other creatures you control with total power 2 or more: This Mount becomes saddled until end of turn. Saddle only as a sorcery.)",
    imageUri: 'https://cards.scryfall.io/large/front/e/f/ef32a5f8-f69d-47dc-a800-4f0ddf4eada5.jpg?1783911851',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'attacks', condition: { saddled: true } },
        effect: [
          { type: 'grant_keywords_until_end_of_turn', keywords: ['first_strike'] },
          { type: 'scry', amount: 1 },
        ],
      }),
      createAbility({
        type: ABILITY_TYPE.activated,
        keyword: 'saddle',
        timing: 'sorcery',
        cost: { saddlePower: 2 },
        effect: { type: 'set_saddled' },
      }),
    ],
    artId: 458, plan: 'Thunder Junction',
    support: { status: 'supported', limitations: [] },
  }),

  defineCard({
    id: 'natures-embrace', name: "Nature's Embrace", set: 'VOW',
    types: ['Enchantment'], subtypes: ['Aura'], colors: ['G'], manaCost: 3,
    oracleText: "Enchant creature or land\\nAs long as enchanted permanent is a creature, it gets +2/+2.\\nAs long as enchanted permanent is a land, it has \"{T}: Add two mana of any one color.\"",
    imageUri: 'https://cards.scryfall.io/large/front/3/9/39d757af-86fd-4f99-a09a-0f3898ed95f6.jpg?1783924808',
    aura: { enchantType: 'creature_or_land', pump: { power: 2, toughness: 2 }, grantMana: { amount: 2 } },
    artId: 491, plan: 'Wiedźmin',
    support: { status: 'supported', limitations: [] },
  }),

  defineCard({
    id: 'ballista-watcher', name: 'Ballista Watcher', set: 'VOW',
    types: ['Creature'], subtypes: ['Human', 'Soldier', 'Werewolf'], colors: ['R'],
    power: 4, toughness: 3, manaCost: 4, keywords: ['daybound'],
    oracleText: "{2}{R}, {T}: This creature deals 1 damage to any target.\\nDaybound (If a player casts no spells during their own turn, it becomes night next turn.)",
    imageUri: 'https://cards.scryfall.io/large/front/6/3/63d96c52-66ce-4b46-9a0b-7cd9a43f9253.jpg?1783924852',
    transformTo: 'ballista-wielder',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.activated,
        cost: { mana: 3, tap: true, colors: ['R'] },
        targets: [{ type: 'any_target' }],
        effect: { type: 'damage', amount: 1 },
      }),
    ],
    artId: 504, plan: 'Innistrad',
    support: { status: 'supported', limitations: [] },
  }),
  defineCard({
    id: 'ballista-wielder', name: 'Ballista Wielder', set: 'VOW',
    types: ['Creature'], subtypes: ['Werewolf'], colors: ['R'],
    power: 5, toughness: 5, manaCost: 4, keywords: ['nightbound'],
    oracleText: "{2}{R}: This creature deals 1 damage to any target. A creature dealt damage this way can't block this turn.\\nNightbound (If a player casts at least two spells during their own turn, it becomes day next turn.)",
    imageUri: 'https://cards.scryfall.io/large/back/6/3/63d96c52-66ce-4b46-9a0b-7cd9a43f9253.jpg?1783924852',
    transformTo: 'ballista-watcher',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.activated,
        cost: { mana: 3, colors: ['R'] },
        targets: [{ type: 'any_target' }],
        effect: [
          { type: 'damage', amount: 1 },
          { type: 'cant_block', ifDealtDamage: true },
        ],
      }),
    ],
    artId: 505, plan: 'Innistrad',
    support: { status: 'limited', limitations: ['tylna strona daybound/nightbound — nie można umieścić w talii'] },
  }),

  // =========================================================================
  // Batch 33 (2026-08-16, lista właściciela) — TRANSZA 1.
  // Somberwald Spider, Murder of Crows, Kazuul's Toll Collector.
  // Dane Oracle ze Scryfall (zweryfikowane w tej sesji). Pozostałe karty
  // z listy (Sagittars' Volley, Nightsnare, Spreading Insurrection, Tiller of
  // Flesh, Diplomatic Relations, Chill of the Grave, Spare from Evil)
  // wymagają nowych mechanik i mają rozpisane wdrożenie w
  // docs/plans/2026-08-16-m108-batch33.md.
  // =========================================================================
  defineCard({
    id: 'somberwald-spider', name: 'Somberwald Spider', set: 'ISD',
    types: ['Creature'], subtypes: ['Spider'], colors: ['G'],
    power: 2, toughness: 4, manaCost: 5, keywords: ['reach'],
    oracleText: 'Reach\nMorbid — This creature enters with two +1/+1 counters on it if a creature died this turn.',
    imageUri: 'https://cards.scryfall.io/large/front/4/3/43003ad7-2f42-4c85-8b00-77cbf3f50a7b.jpg?1783940910',
    // Morbid (CR 614.1c): liczniki WARUNKOWE przy wejściu — deskryptor
    // generyczny, warunek liczony w chwili wejścia (state.creatureDiedThisTurn).
    entersWithCountersIf: { morbid: true, counters: { '+1/+1': 2 } },
    artId: 107, plan: 'Innistrad',
    support: { status: 'supported', limitations: [] },
  }),

  defineCard({
    id: 'murder-of-crows', name: 'Murder of Crows', set: 'ISD',
    types: ['Creature'], subtypes: ['Bird'], colors: ['U'],
    power: 4, toughness: 4, manaCost: 5, keywords: ['flying'],
    oracleText: 'Flying\nWhenever another creature dies, you may draw a card. If you do, discard a card.',
    imageUri: 'https://cards.scryfall.io/large/front/1/c/1c7dc810-c4cb-4dca-ae06-d79daf8e1477.jpg',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        // „ANOTHER creature dies" — excludeSelf wyłącza własną śmierć źródła
        // (any_creature_dies odpala się domyślnie także dla niego).
        // „You may draw ... If you do, discard" = jedna opcjonalna decyzja.
        trigger: { event: 'any_creature_dies', excludeSelf: true, mayFire: true },
        effect: { type: 'draw_then_discard', amount: 1 },
      }),
    ],
    artId: 42, plan: 'Innistrad',
    support: { status: 'supported', limitations: [] },
  }),

  defineCard({
    id: 'kazuuls-toll-collector', name: "Kazuul's Toll Collector", set: '2XM',
    types: ['Creature'], subtypes: ['Ogre', 'Warrior'], colors: ['R'],
    power: 3, toughness: 2, manaCost: 3,
    oracleText: "{0}: Attach target Equipment you control to this creature. Activate only as a sorcery.",
    imageUri: 'https://cards.scryfall.io/large/front/7/3/7377e5a7-b479-48cc-8fbb-01af87c62566.jpg?1783930163',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.activated,
        cost: { mana: 0 },
        timing: 'sorcery',
        targets: [{ type: 'equipment_you_control' }],
        effect: { type: 'attach_equipment_to_source' },
      }),
    ],
    artId: 472, plan: 'Zendikar',
    support: { status: 'supported', limitations: [] },
  }),

  // =========================================================================
  // Batch 33 — TRANSZA 2 (M109). Karty wymagające nowych mechanik silnika;
  // analiza: docs/plans/2026-08-16-m108-batch33.md.
  // =========================================================================

  defineCard({
    id: 'chill-of-the-grave', name: 'Chill of the Grave', set: 'VOW',
    types: ['Instant'], colors: ['U'], manaCost: 3,
    oracleText: "This spell costs {1} less to cast if you control a Zombie.\nTap target creature. It doesn't untap during its controller's next untap step.\nDraw a card.",
    imageUri: 'https://cards.scryfall.io/large/front/6/0/60222e91-a688-4113-a8c2-ab08f52bb6e1.jpg?1783924898',
    spell: {
      timing: 'instant',
      targets: [{ type: 'creature' }],
      // Warunkowa obniżka kosztu (CR 601.2f) — warunek generyczny
      // `controlsSubtype`, nie nazwa karty (ADR 0002).
      costReduction: { amount: 1, condition: { controlsSubtype: 'Zombie' } },
      effects: [
        { type: 'tap_permanent' },
        { type: 'dont_untap_next_untap_step' },
        { type: 'draw_cards', amount: 1 },
      ],
    },
    artId: 399, plan: 'Innistrad',
    support: { status: 'supported', limitations: [] },
  }),

  defineCard({
    id: 'diplomatic-relations', name: 'Diplomatic Relations', set: 'EOE',
    types: ['Instant'], colors: ['G'], manaCost: 3,
    oracleText: 'Target creature you control gets +1/+0 and gains vigilance until end of turn. It deals damage equal to its power to target creature an opponent controls.',
    imageUri: 'https://cards.scryfall.io/large/front/1/4/143e5853-9a31-4c8d-b21d-5ef120eb6952.jpg?1783904003',
    spell: {
      timing: 'instant',
      // DWA cele w jednym czarze: slot 0 (twój stwór) i slot 1 (stwór
      // przeciwnika); efekty wskazują slot przez targetIndex.
      targets: [{ type: 'creature_you_control' }, { type: 'creature_opponent_controls' }],
      effects: [
        { type: 'pump', power: 1, toughness: 0 },
        { type: 'grant_keywords_until_end_of_turn', keywords: ['vigilance'] },
        { type: 'damage_from_target_power', sourceTargetIndex: 0, targetIndex: 1 },
      ],
    },
    artId: 56, plan: 'The Edge',
    support: { status: 'supported', limitations: [] },
  }),

  defineCard({
    id: 'sagittars-volley', name: "Sagittars' Volley", set: 'RNA',
    types: ['Instant'], colors: ['G'], manaCost: 3,
    oracleText: "Destroy target creature with flying. Sagittars' Volley deals 1 damage to each creature with flying your opponents control.",
    imageUri: 'https://cards.scryfall.io/large/front/d/3/d3104cad-e684-4bd7-b26b-5aa862f7a2b3.jpg?1783933665',
    spell: {
      timing: 'instant',
      targets: [{ type: 'creature_with_keyword', keyword: 'flying' }],
      effects: [
        { type: 'destroy_permanent' },
        { type: 'damage_creatures_with_keyword', keyword: 'flying', amount: 1, opponentsOnly: true },
      ],
    },
    artId: 304, plan: 'Ravnica',
    support: { status: 'supported', limitations: [] },
  }),

  defineCard({
    id: 'nightsnare', name: 'Nightsnare', set: 'ORI',
    types: ['Sorcery'], colors: ['B'], manaCost: 4,
    oracleText: "Target opponent reveals their hand. You may choose a nonland card from it. If you do, that player discards that card. If you don't, that player discards two cards.",
    imageUri: 'https://cards.scryfall.io/large/front/3/9/391a1023-69e7-425c-ac54-987ba366f8f4.jpg?1783938338',
    spell: {
      timing: 'sorcery',
      targets: [{ type: 'opponent' }],
      effects: [{ type: 'reveal_hand_choose_discard', declineAmount: 2 }],
    },
    artId: 78, plan: 'Wiedźmin',
    support: { status: 'supported', limitations: [] },
  }),

  defineCard({
    id: 'tiller-of-flesh', name: 'Tiller of Flesh', set: 'MOM',
    types: ['Creature'], subtypes: ['Phyrexian', 'Knight'], colors: ['W'],
    power: 2, toughness: 4, manaCost: 4,
    oracleText: 'Whenever you cast a spell that targets one or more permanents, incubate 2. (Create an Incubator token with two +1/+1 counters on it and "{2}: Transform this token." It transforms into a 0/0 Phyrexian artifact creature.)',
    imageUri: 'https://cards.scryfall.io/large/front/4/9/49e206f2-1647-4456-8f2f-b67d053413e2.jpg?1783917044',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'you_cast_spell_targeting_permanent' },
        effect: { type: 'incubate', amount: 2 },
      }),
    ],
    artId: 201, plan: 'Ikoria',
    support: { status: 'supported', limitations: [] },
  }),

  defineCard({
    id: 'spare-from-evil', name: 'Spare from Evil', set: 'ISD',
    types: ['Instant'], colors: ['W'], manaCost: 2,
    oracleText: 'Creatures you control gain protection from non-Human creatures until end of turn.',
    imageUri: 'https://cards.scryfall.io/large/front/d/0/d01b5d97-b5ae-42a7-944a-feb12febd63c.jpg?1783940984',
    spell: {
      timing: 'instant',
      targets: [],
      // Ochrona przed JAKOŚCIĄ (CR 702.16): deskryptor generyczny —
      // „stwór, który nie jest Człowiekiem".
      effects: [{
        type: 'grant_protection_until_end_of_turn',
        protection: { notSubtype: 'Human', kind: 'creature' },
      }],
    },
    artId: 478, plan: 'Innistrad',
    support: { status: 'supported', limitations: [] },
  }),

  defineCard({
    id: 'spreading-insurrection', name: 'Spreading Insurrection', set: 'MH2',
    types: ['Sorcery'], colors: ['R'], manaCost: 5,
    oracleText: 'Gain control of target creature you don\'t control until end of turn. Untap that creature. It gains haste until end of turn.\nStorm (When you cast this spell, copy it for each spell cast before it this turn. You may choose new targets for the copies.)',
    imageUri: 'https://cards.scryfall.io/large/front/f/1/f1c1918b-2f7a-4cab-9547-029ebc589000.jpg?1783926838',
    spell: {
      timing: 'sorcery',
      storm: true,
      targets: [{ type: 'creature_opponent_controls' }],
      effects: [{ type: 'gain_control_until_end_of_turn' }],
    },
    artId: 513, plan: 'Ixalan',
    support: { status: 'supported', limitations: [] },
  }),

  // =========================================================================
  // Batch 34 (2026-08-17, lista właściciela) — transza A: karty oparte
  // o mechaniki już obecne w silniku. Oracle ze Scryfalla.
  // =========================================================================

  defineCard({
    id: 'akrasan-squire', name: 'Akrasan Squire', set: 'ALA',
    types: ['Creature'], subtypes: ['Human', 'Soldier'], colors: ['W'],
    power: 1, toughness: 1, manaCost: 1, keywords: ['exalted'],
    oracleText: 'Exalted (Whenever a creature you control attacks alone, that creature gets +1/+1 until end of turn.)',
    imageUri: 'https://cards.scryfall.io/large/front/5/9/59fdc045-b938-4321-aec3-51685cbbaa52.jpg?1783942584',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'attacks_alone' },
        effect: { type: 'exalted_pump', power: 1, toughness: 1 },
      }),
    ],
    artId: 274, plan: 'Alara',
    support: { status: 'supported', limitations: [] },
  }),

  defineCard({
    id: 'elgaud-inquisitor', name: 'Elgaud Inquisitor', set: 'DKA',
    types: ['Creature'], subtypes: ['Human', 'Cleric'], colors: ['W'],
    power: 2, toughness: 2, manaCost: 4, keywords: ['lifelink'],
    oracleText: 'Lifelink (Damage dealt by this creature also causes you to gain that much life.)\nWhen this creature dies, create a 1/1 white Spirit creature token with flying.',
    imageUri: 'https://cards.scryfall.io/large/front/c/3/c342e1da-7ab9-4e29-96e6-77d820a45ede.jpg?1783940857',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'dies' },
        effect: {
          type: 'create_token', cardId: 'token_spirit_flying', name: 'Spirit',
          kind: 'creature', power: 1, toughness: 1, colors: ['W'],
          types: ['Creature'], subtypes: ['Spirit'], keywords: ['flying'],
        },
      }),
    ],
    artId: 453, plan: 'Innistrad',
    support: { status: 'supported', limitations: [] },
  }),

  // Token Spirit 1/1 z lataniem (Elgaud Inquisitor). Istniejący token_spirit
  // (endure) jest BEZ latania — to inny token, więc osobna definicja.
  defineCard({
    id: 'token_spirit_flying', name: 'Spirit', set: null,
    types: ['Creature', 'Token'], subtypes: ['Spirit'], colors: ['W'],
    keywords: ['flying'], power: 1, toughness: 1, manaCost: 0,
    support: { status: 'limited', limitations: ['token — nie można umieścić w talii'] },
  }),

  defineCard({
    id: 'fledgling-imp', name: 'Fledgling Imp', set: 'ODY',
    types: ['Creature'], subtypes: ['Imp'], colors: ['B'],
    power: 2, toughness: 2, manaCost: 3,
    oracleText: '{B}, Discard a card: This creature gains flying until end of turn.',
    imageUri: 'https://cards.scryfall.io/large/front/d/1/d11770ee-dcf0-4dd4-ab43-b98f1133cec7.jpg?1783945246',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.activated,
        // Oracle NIE ma tapnięcia w koszcie — {B} plus odrzucenie karty.
        cost: { mana: 1, colors: ['B'], discardCard: true },
        effect: { type: 'grant_keywords_until_end_of_turn', keywords: ['flying'] },
      }),
    ],
    artId: 114, plan: 'Warhammer Fantasy',
    support: { status: 'supported', limitations: [] },
  }),

  defineCard({
    id: 'chained-throatseeker', name: 'Chained Throatseeker', set: 'NPH',
    types: ['Creature'], subtypes: ['Phyrexian', 'Horror'], colors: ['U'],
    power: 5, toughness: 5, manaCost: 6, keywords: ['infect'],
    oracleText: "Infect (This creature deals damage to creatures in the form of -1/-1 counters and to players in the form of poison counters.)\nThis creature can't attack unless defending player is poisoned.",
    imageUri: 'https://cards.scryfall.io/large/front/3/a/3a7bb447-c2b0-429e-bf82-02d6a966fe73.jpg?1783941321',
    abilities: [
      createAbility({ type: ABILITY_TYPE.static, cantAttackUnlessDefenderPoisoned: true }),
    ],
    artId: 469, plan: 'Mirrodin',
    support: { status: 'supported', limitations: [] },
  }),

  defineCard({
    id: 'sterling-keykeeper', name: 'Sterling Keykeeper', set: 'OTJ',
    types: ['Creature'], subtypes: ['Human', 'Mercenary'], colors: ['W'],
    power: 2, toughness: 2, manaCost: 2,
    oracleText: '{2}, {T}: Tap target non-Mount creature.',
    imageUri: 'https://cards.scryfall.io/large/front/0/1/019d539f-04c2-43f1-8677-6d6fbb0e94f7.jpg?1783911850',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.activated,
        cost: { mana: 2, tap: true },
        targets: [{ type: 'creature_without_subtype', subtype: 'Mount' }],
        effect: { type: 'tap_permanent' },
      }),
    ],
    artId: 229, plan: 'Thunder Junction',
    support: { status: 'supported', limitations: [] },
  }),

  defineCard({
    id: 'circle-of-the-land-druid', name: 'Circle of the Land Druid', set: 'CLB',
    types: ['Creature'], subtypes: ['Gnome', 'Druid'], colors: ['G'],
    power: 1, toughness: 1, manaCost: 2,
    oracleText: 'When this creature enters, you may mill four cards. (You may put the top four cards of your library into your graveyard.)\nNatural Recovery — When this creature dies, return target land card from your graveyard to your hand.',
    imageUri: 'https://cards.scryfall.io/large/front/1/e/1e84fc74-5b33-423a-82c7-983320fce7a3.jpg?1783922718',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        // „You MAY mill" — opcjonalny trigger (decyzja gracza, nie automat).
        trigger: { event: 'enter_battlefield', mayFire: true },
        effect: { type: 'mill_cards', amount: 4 },
      }),
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'dies', requiresTarget: { type: 'land_card_in_graveyard' } },
        effect: { type: 'return_card_from_graveyard_to_hand', cardKind: 'land' },
      }),
    ],
    artId: 438, plan: 'Forgotten Realms',
    support: { status: 'supported', limitations: [] },
  }),

  defineCard({
    id: 'academy-journeymage', name: 'Academy Journeymage', set: 'DOM',
    types: ['Creature'], subtypes: ['Human', 'Wizard'], colors: ['U'],
    power: 3, toughness: 2, manaCost: 5,
    oracleText: "This spell costs {1} less to cast if you control a Wizard.\nWhen this creature enters, return target creature an opponent controls to its owner's hand.",
    imageUri: 'https://cards.scryfall.io/large/front/a/4/a46a65e0-66a3-4896-8acc-0ad5e9927c40.jpg?1783935034',
    // CR 601.2f: warunkowa obniżka na poziomie KARTY (permanent nie ma
    // deskryptora czaru); warunek generyczny — kontrolowany podtyp.
    costReduction: { amount: 1, condition: { controlsSubtype: 'Wizard' } },
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'enter_battlefield', requiresTarget: { type: 'creature_opponent_controls' } },
        effect: { type: 'bounce_permanent' },
      }),
    ],
    artId: 5, plan: 'Dominaria',
    support: { status: 'supported', limitations: [] },
  }),

  defineCard({
    id: 'chronic-flooding', name: 'Chronic Flooding', set: 'RTR',
    types: ['Enchantment'], subtypes: ['Aura'], colors: ['U'], manaCost: 2,
    oracleText: 'Enchant land\nWhenever enchanted land becomes tapped, its controller mills three cards.',
    imageUri: 'https://cards.scryfall.io/large/front/1/a/1a757425-3cf2-4aca-b415-5ec2d5f753fe.jpg?1783940370',
    // „Enchant land" — gospodarzem jest LAND (dotąd aury zaczarowywały stwora,
    // gracza, enchantment albo stwora/ląd).
    aura: { enchant: 'land' },
    abilities: [
      createAbility({
        type: ABILITY_TYPE.triggered,
        trigger: { event: 'enchanted_permanent_tapped' },
        effect: { type: 'mill_cards', amount: 3, applyTo: 'enchanted_controller' },
      }),
    ],
    artId: 315, plan: 'Ravnica',
    support: { status: 'supported', limitations: [] },
  }),

  defineCard({
    id: 'krumar-initiate', name: 'Krumar Initiate', set: 'TDM',
    types: ['Creature'], subtypes: ['Human', 'Cleric'], colors: ['B'],
    power: 2, toughness: 2, manaCost: 2,
    oracleText: '{X}{B}, {T}, Pay X life: This creature endures X. Activate only as a sorcery. (Put X +1/+1 counters on it or create an X/X white Spirit creature token.)',
    imageUri: 'https://cards.scryfall.io/large/front/b/c/bc66680f-24ab-433a-8197-feac3a174075.jpg?1783907376',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.activated,
        // {X}{B} + tapnięcie + zapłata X życia; X wybiera gracz (warianty
        // komendy), a endure X to WYBÓR kontrolera przy rozstrzyganiu.
        cost: { manaX: true, mana: 1, colors: ['B'], tap: true, payLifeX: true },
        timing: 'sorcery',
        effect: { type: 'endure_x' },
      }),
    ],
    artId: 95, plan: 'Tarkir',
    support: { status: 'supported', limitations: [] },
  }),

  defineCard({
    id: 'cuombajj-witches', name: 'Cuombajj Witches', set: 'CMR',
    types: ['Creature'], subtypes: ['Human', 'Wizard'], colors: ['B'],
    power: 1, toughness: 3, manaCost: 2,
    oracleText: "{T}: This creature deals 1 damage to any target and 1 damage to any target of an opponent's choice.",
    imageUri: 'https://cards.scryfall.io/large/front/6/a/6a26e910-275a-4981-831b-bfed936a7e3f.jpg?1783928842',
    abilities: [
      createAbility({
        type: ABILITY_TYPE.activated,
        cost: { tap: true },
        targets: [{ type: 'any_target' }],
        // DRUGI cel wskazuje przeciwnik (CR 601.2c) — aktywacja czeka na jego
        // decyzję, zanim zapłaci koszty.
        opponentChoosesTarget: { type: 'any_target' },
        effect: [
          { type: 'damage', amount: 1, targetIndex: 0 },
          { type: 'damage', amount: 1, targetIndex: 1 },
        ],
      }),
    ],
    artId: 246, plan: 'Rabiah',
    support: { status: 'supported', limitations: [] },
  }),

  // Token Incubator (incubate, CR 701.47) — artefakt z licznikami +1/+1
  // i zdolnością „{2}: Transform this token"; druga strona to token_phyrexian.
  defineCard({
    id: 'token_incubator', name: 'Incubator', set: null,
    types: ['Artifact', 'Token'], subtypes: ['Incubator'], colors: [],
    manaCost: 0,
    abilities: [
      createAbility({
        type: ABILITY_TYPE.activated,
        cost: { mana: 2 },
        effect: { type: 'transform' },
      }),
    ],
    transformTo: 'token_phyrexian',
    support: { status: 'limited', limitations: ['token — nie można umieścić w talii'] },
  }),

  // Token Phyrexian — tylna strona Incubatora: 0/0 artefaktowy stwór
  // (na stole żywy dzięki licznikom +1/+1 przeniesionym z przedniej strony).
  defineCard({
    id: 'token_phyrexian', name: 'Phyrexian', set: null,
    types: ['Artifact', 'Creature', 'Token'], subtypes: ['Phyrexian'], colors: [],
    power: 0, toughness: 0, manaCost: 0,
    support: { status: 'limited', limitations: ['token — nie można umieścić w talii'] },
  }),

  // Token Clue (Investigate — Floodhound): {2}, Sacrifice: draw a card.
  defineCard({
    id: 'token_clue', name: 'Clue', set: null,
    types: ['Artifact', 'Token'], subtypes: ['Clue'], colors: [],
    manaCost: 0,
    abilities: [
      createAbility({
        type: ABILITY_TYPE.activated,
        cost: { mana: 2, sacrificeSelf: true },
        effect: { type: 'draw_cards', amount: 1 },
      }),
    ],
    imageUri: 'https://cards.scryfall.io/large/front/e/b/eb129b0d-1349-4e88-a6a7-b7968b26ee7e.jpg?1783926587',
    support: { status: 'limited', limitations: ['token — nie można umieścić w talii'] },
  }),

]);

/** Registry repozytorium: katalog syntetyczny (stabilna baza testów) + realne karty + wirtualne landy podstawowe. */
export function createCardRegistry() {
  return createRegistry([...REAL_CARDS, ...VIRTUAL_BASIC_LANDS]);
}
