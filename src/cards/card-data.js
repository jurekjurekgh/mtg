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
    artId: 509,
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
    artId: 278,
    support: { status: 'supported', limitations: ['trigger odpala się tylko, gdy cel wygnania istnieje (deterministyczne „you may")', 'deathtouch licznik nie nadaje samego deathtouch w walce'] },
  }),
  defineCard({
    id: 'segmented-krotiq', name: 'Segmented Krotiq', set: 'DTK',
    types: ['Creature'], colors: ['G'], power: 6, toughness: 5, manaCost: 6,
    oracleText: 'Megamorph {6}{G} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its megamorph cost and put a +1/+1 counter on it.)',
    imageUri: 'https://cards.scryfall.io/large/front/d/c/dcdbe824-f9c7-4f4d-af92-438b16057d99.jpg?1783938576',
    morph: { cost: 3, megamorphCost: 7 },
    artId: 523,
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
    artId: 171,
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
    artId: 486,
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
    artId: 195,
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
    artId: 480,
    support: { status: 'supported', limitations: ['„you may" deterministyczne: trigger odpala się tylko przy legalnym celu i opłacalnym koszcie', 'finality counter działa tylko przy śmierci z obrażeń (jedyna przyczyna śmierci w engine)'] },
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
    support: { status: 'supported', limitations: ['płatność {1} jest automatyczna (z puli, a gdy brak — engine tapuje pierwszego nietapniętego innego landa kontrolera); gracz nie może odmówić zapłaty', '„one mana of any color" = 1 bezbarwna (pula many jest bezbarwna, jak u pozostałych landów)'] },
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
    support: { status: 'supported', limitations: ['{T}: Add {U} or {R} = 1 bezbarwna bez wyboru koloru (pula many jest bezbarwna)', 'scry 1: decyzja wierzch/spód jest realna (komenda resolve_scry); gracz widzi wyłącznie własne przeglądane karty'] },
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
    support: { status: 'supported', limitations: ['„one mana of any color" = 1 bezbarwna (pula many jest bezbarwna, jak u pozostałych landów)', 'koszt „Tap an untapped creature you control" tapuje deterministycznie pierwszego nietapniętego stwora (jak auto-płatność Rupture Spire)'] },
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
    support: { status: 'supported', limitations: ['brak command zone w engine — liczba rzuceń commandera zawsze 0, więc ETB nie tworzy tokenów w tym formacie (mechanicznie poprawne); token Forest Dryad zdefiniowany i testowany', 'land creatures to obiekty z typem Land i rodzajem creature (walczą i tapują się na manę)'] },
  }),
  // Token Jyoti (M3C): 1/1 zielony Forest Dryad — land creature (typ Land
  // + rodzaj creature): walczy jak stwór i tapuje się na manę jak land.
  // Definicja tokena — nie taliowalna (limited), jak token_goblin.
  defineCard({
    id: 'token_forest_dryad', name: 'Forest Dryad', set: SYNTHETIC_SET,
    types: ['Land', 'Creature', 'Token'], subtypes: ['Forest', 'Dryad'], colors: ['G'],
    power: 1, toughness: 1, manaCost: 0,
    support: { status: 'limited', limitations: ['token — nie można umieścić w talii'] },
  }),
]);

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
]);

/** Registry repozytorium: katalog syntetyczny (stabilna baza testów) + realne karty + wirtualne landy podstawowe. */
export function createCardRegistry() {
  return createRegistry([...SYNTHETIC_CARDS, ...REAL_CARDS, ...VIRTUAL_BASIC_LANDS]);
}
