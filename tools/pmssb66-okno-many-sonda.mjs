// PMSSB-66 (batch 68 → generyczna zasada) — sonda POMIARU PRZED / PO: „okno darmowej many”.
// Zasada właściciela (2026-10-17): zdolność za manę, która daje trwały efekt (token, countery
// +1/+1 / −1/−1 / stun / oil / charge), płaci się W END STEP PRZECIWNIKA — lądy i tak odtapowują się
// w naszym kroku odnowienia, więc ta mana jest darmowa. W naszej turze (i w innych krokach) — nie.
// Uruchomienie: node tools/pmssb66-okno-many-sonda.mjs
import { playerView, addObject } from '../src/engine/game-state.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { ABILITY_TYPE, createAbility } from '../src/engine/abilities.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { botTurn, putCard } from './pmssb63-batch68-sonda.mjs';

const REAL = createCardRegistry();

/** Rejestr z podmienioną definicją jednego `cardId` (syntetyczne zdolności do pomiaru). */
function registryWith(cardId, def) {
  return { ...REAL, get: (id) => (id === cardId ? def : REAL.get(id)), has: (id) => id === cardId || REAL.has(id) };
}

/** Stwór z jedną syntetyczną zdolnością za manę (bez celu — działa na sobie). */
function syntheticCreature(cardId, abilities) {
  const base = REAL.get('hill-giant');
  return { ...base, id: cardId, name: cardId, abilities };
}

/** Lądy pod kontrolą (nietapnięte), jak w sondach PMSSB-64/65. */
function addLands(state, n) {
  const landDef = gameObjectDataOf(REAL.get('basic-forest'));
  for (let i = 0; i < n; i += 1) {
    addObject(state, {
      id: `l${i}`, instanceId: `i-l${i}`, cardId: 'basic-forest', controllerId: 'p2', ownerId: 'p2',
      zone: 'battlefield', kind: 'land', types: ['Land'], subtypes: [], colors: ['G'],
      abilities: landDef.abilities ?? [], keywords: [],
    });
  }
}

/**
 * Wynik decyzji bota. `step`: 'main' (nasza główna) | 'end-opp' (end step przeciwnika).
 * `objectId`/`prefix`: które opcje zwracamy (np. 'activate_ability(halo'). Zwraca { chosen, options }.
 */
export function oknoDecision({ step = 'main', lands = 2, cardId = 'halo-scarab', where = 'graveyard', objectId = 'halo',
  registryOverride = null, hand = [], board = () => {}, params = undefined }) {
  const state = botTurn({ life: 20 });
  if (step === 'end-opp') {
    state.turn = { ...state.turn, activePlayerId: 'p1', step: 'end' };
    state.turn.priorityPlayerId = 'p2';
  }
  if (step === 'opp-blockers') {
    state.turn = { ...state.turn, activePlayerId: 'p1', step: 'declare_blockers' };
    state.turn.priorityPlayerId = 'p2';
  }
  addLands(state, lands);
  if (cardId && registryOverride) {
    // Syntetyczna karta (nie ma jej w prawdziwym rejestrze) — obiekt stawiamy wprost.
    const def = registryOverride.get(cardId);
    const data = gameObjectDataOf(def);
    addObject(state, {
      id: objectId, instanceId: `i-${objectId}`, cardId, controllerId: 'p2', ownerId: 'p2', zone: where,
      kind: data.kind, power: data.power, toughness: data.toughness, manaCost: data.manaCost, spell: data.spell,
      abilities: data.abilities ?? [], keywords: [], subtypes: [], types: def.types ?? ['Creature'], colors: data.colors ?? [],
    });
    state.objects.set(objectId, Object.freeze({ ...state.objects.get(objectId), summoningSickness: false }));
  } else if (cardId) putCard(state, objectId, cardId, 'p2', where);
  for (const [i, sid] of hand.entries()) putCard(state, `h${i}`, sid, 'p2', 'hand');
  board(state);
  const registry = registryOverride ?? REAL;
  const bot = createHeuristicBot({ seed: 68, registry, params });
  const cmd = bot.chooseCommand(playerView(state, 'p2'), {});
  const entry = bot.trace().at(-1);
  const options = (entry?.options ?? []).map((o) => ({ cmd: o.cmd, score: o.score }));
  return { chosen: cmd?.type ?? entry?.chosen ?? null, chosenCmd: entry?.chosen ?? null, options };
}

const ACT = (id) => (o) => o.cmd?.startsWith(`activate_ability(${id}`);

/** Wróg z nietapniętym stworem (cel dla konsumenta „tap”). */
function enemyBody(state) {
  addObject(state, {
    id: 'enemy-body', instanceId: 'i-enemy-body', cardId: 'hill-giant', controllerId: 'p1', ownerId: 'p1', zone: 'battlefield',
    kind: 'creature', types: ['Creature'], subtypes: [], power: 2, toughness: 2, manaCost: 2, abilities: [], keywords: [], colors: ['R'],
  });
}

export const OKNO_SCENARIOS = [
  { id: 'W1-halo-end-opp', opis: 'Halo na cmentarzu, 2 nietapnięte lądy, nic w ręce, END STEP PRZECIWNIKA → aktywuj (mana darmowa)',
    args: { step: 'end-opp', lands: 2 }, oczekuje: (r) => r.chosenCmd?.startsWith('activate_ability(halo') },
  { id: 'W2-halo-nasza-main', opis: 'to samo w NASZEJ głównej → pass (odroczenie: tę samą manę zapłacimy za darmo w end step przeciwnika)',
    args: { step: 'main', lands: 2 }, oczekuje: (r) => r.chosen === 'pass_priority' },
  { id: 'W3-halo-instant-w-rece', opis: 'end step przeciwnika, 2 lądy, Shock w ręce (1 many): nadwyżka 2−1=1 < 2 → Halo płatne, Shock zostaje zagrywalny → pass',
    args: { step: 'end-opp', lands: 2, hand: ['shock'] }, oczekuje: (r) => r.chosen === 'pass_priority' },
  { id: 'W4-halo-duzo-many-instant', opis: 'end step przeciwnika, 4 lądy, Shock w ręce: nadwyżka 4−1=3 ≥ 2 → Halo darmowe → aktywuj',
    args: { step: 'end-opp', lands: 4, hand: ['shock'] }, oczekuje: (r) => r.chosenCmd?.startsWith('activate_ability(halo') },
  { id: 'W5-countery-end-opp', opis: 'syntetyczny stwór {1}: +1/+1 na sobie, end step przeciwnika, 1 land → aktywuj',
    args: { step: 'end-opp', lands: 1, cardId: 'syn-plus', where: 'battlefield', objectId: 'cnt', registryOverride: 'plus' },
    oczekuje: (r) => r.chosenCmd?.startsWith('activate_ability(cnt') },
  { id: 'W6-countery-nasza-main', opis: 'to samo w naszej głównej → pass (odroczenie)',
    args: { step: 'main', lands: 1, cardId: 'syn-plus', where: 'battlefield', objectId: 'cnt', registryOverride: 'plus' },
    oczekuje: (r) => r.chosen === 'pass_priority' },
  { id: 'W9-countery-walka-przeciwnika', opis: 'producent +1/+1 w deklaracji blokerów PRZECIWNIKA (walka): bez odroczenia — licznik może zmienić blok',
    args: { step: 'opp-blockers', lands: 1, cardId: 'syn-plus', where: 'battlefield', objectId: 'cnt', registryOverride: 'plus' },
    oczekuje: (r) => r.options.some((o) => o.cmd?.startsWith('activate_ability(cnt') && o.score > -1) },
  { id: 'W10-sorcery-end-opp', opis: 'zdolność SORCERY w end step przeciwnika: okno nie dotyczy (nie do zagrania) → nie wybieraj',
    args: { step: 'end-opp', lands: 1, cardId: 'syn-plus-sorcery', where: 'battlefield', objectId: 'cnt', registryOverride: 'plus-sorcery' },
    oczekuje: (r) => !(r.chosenCmd?.startsWith('activate_ability(cnt')) },
  { id: 'W7-oil-end-opp', opis: 'syntetyczny stwór {2}: oil na sobie (do wydania na tapowanie), end step przeciwnika → aktywuj',
    args: { step: 'end-opp', lands: 2, cardId: 'syn-oil', where: 'battlefield', objectId: 'oil', registryOverride: 'oil', board: enemyBody },
    oczekuje: (r) => r.chosenCmd?.startsWith('activate_ability(oil') },
  { id: 'W8-oil-nasza-main', opis: 'to samo w naszej głównej → pass (odroczenie)',
    args: { step: 'main', lands: 2, cardId: 'syn-oil', where: 'battlefield', objectId: 'oil', registryOverride: 'oil', board: enemyBody },
    oczekuje: (r) => r.chosen === 'pass_priority' },
];

/** Buduje rejestr syntetycznych kart dla W5–W8 (zdolności za manę). */
export function syntheticRegistry(kind) {
  const add = (abilities) => ({ ...syntheticCreature(`syn-${kind}`, abilities), id: `syn-${kind}` });
  let def;
  if (kind === 'plus') {
    def = add([createAbility({ type: ABILITY_TYPE.activated, cost: { mana: 1 }, effect: { type: 'add_counter', counter: '+1/+1', amount: 1 } })]);
  } else if (kind === 'plus-sorcery') {
    // Ta sama zdolność, ale sorcery-speed: w cudzym kroku nie do zagrania.
    def = add([{ ...createAbility({ type: ABILITY_TYPE.activated, cost: { mana: 1 }, effect: { type: 'add_counter', counter: '+1/+1', amount: 1 } }), timing: 'sorcery' }]);
  } else {
    // Owner: „stwór tworzy na sobie countery oil do wydania na tapowanie przeciwnika”.
    // Producent: {2}: +1 oil na sobie. Konsument: {T}, usuń oil: tap docelowego stwora.
    // Bez konsumenta licznik zasobowy ma wartość 0 (M173/D) — to nie byłby test tej zasady.
    def = add([
      createAbility({ type: ABILITY_TYPE.activated, cost: { mana: 2 }, effect: { type: 'add_counter', counter: 'oil', amount: 1 } }),
      createAbility({ type: ABILITY_TYPE.activated, cost: { tap: true, removeCounter: { name: 'oil', amount: 1 } },
        targets: [{ type: 'creature' }], effect: { type: 'tap_permanent' } }),
    ]);
  }
  return registryWith(`syn-${kind}`, def);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const sc of OKNO_SCENARIOS) {
    const args = { ...sc.args };
    if (args.registryOverride) args.registryOverride = syntheticRegistry(args.registryOverride);
    const r = oknoDecision(args);
    const ok = sc.oczekuje(r);
    const oid = args.objectId ?? 'halo';
    const best = r.options.filter((o) => o.cmd?.startsWith(`activate_ability(${oid}`)).map((o) => o.score);
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${sc.id.padEnd(28)} wybór=${r.chosenCmd} aktywacje=${best.map((x) => x.toFixed(2)).join('/') || '-'}`);
  }
}
