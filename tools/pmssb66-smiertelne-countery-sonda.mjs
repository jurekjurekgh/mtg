// PMSSB-66 · Ad 2 (właściciel 2026-10-17) — sonda POMIARU PRZED / PO: „skutki licznikowe ŚMIERTELNE
// wykonujemy ASAP, bez odroczenia do okna end step przeciwnika”.
//  • −1/−1 (generycznie: każdy licznik zmniejszający wytrzymałość), które ZABIJA wrogiego stwora.
//  • +1/+1 (generycznie: licznik zwiększający wytrzymałość), które RATUJE nasz stwór przed śmiertelnym
//    uszkodzeniem wiszącym na stosie (Shock przeciwnika w odpowiedzi).
// Pozostałe skutki licznikowe — bez zmian (odroczenie do okna many, zasada PMSSB-66).
// Uruchomienie: node tools/pmssb66-smiertelne-countery-sonda.mjs
import { playerView, addObject } from '../src/engine/game-state.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { ABILITY_TYPE, createAbility } from '../src/engine/abilities.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { botTurn, putCard } from './pmssb63-batch68-sonda.mjs';

const REAL = createCardRegistry();

/** Syntetyczny stwór z jedną zdolnością za {1} (bez celu = na sobie, albo z celem = wrogi stwór). */
function syntheticRegistry(kind) {
  const base = REAL.get('hill-giant');
  let abilities;
  if (kind === 'minus') {
    // −1/−1 na WROGIM stworze (cel = creature). Wytrzymałość maleje → zabójstwo, gdy toughness ≤ 1.
    abilities = [createAbility({ type: ABILITY_TYPE.activated, cost: { mana: 1 }, targets: [{ type: 'creature' }],
      effect: { type: 'add_counter', counter: '-1/-1', amount: 1 } })];
  } else {
    // +1/+1 na SOBIE (jak W5 w sondzie okna).
    abilities = [createAbility({ type: ABILITY_TYPE.activated, cost: { mana: 1 }, effect: { type: 'add_counter', counter: '+1/+1', amount: 1 } })];
  }
  const def = { ...base, id: `syn-${kind}`, name: `syn-${kind}`, abilities };
  return {
    ...REAL,
    get: (id) => (id === def.id ? def : REAL.get(id)),
    has: (id) => id === def.id || REAL.has(id),
  };
}

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

/** Nasz stwór (syntetyczny), opcjonalnie z nadanymi obrażeniami/wytrzymałością. */
function ourCreature(state, { kind, power = 1, toughness = 3 }) {
  const registry = syntheticRegistry(kind);
  const def = registry.get(`syn-${kind}`);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id: 'cnt', instanceId: 'i-cnt', cardId: `syn-${kind}`, controllerId: 'p2', ownerId: 'p2', zone: 'battlefield',
    kind: 'creature', types: ['Creature'], subtypes: [], power, toughness, colors: data.colors ?? [],
    manaCost: 0, abilities: def.abilities, keywords: [],
  });
  state.objects.set('cnt', Object.freeze({ ...state.objects.get('cnt'), summoningSickness: false }));
  return registry;
}

/** Wróg (p1) — stwór-cel. */
function enemyBody(state, { power = 2, toughness = 2, id = 'enemy-body' } = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'hill-giant', controllerId: 'p1', ownerId: 'p1', zone: 'battlefield',
    kind: 'creature', types: ['Creature'], subtypes: [], power, toughness, manaCost: 2, abilities: [], keywords: [], colors: ['R'],
  });
}

/** Czar p1 na stosie celujący w `victimId` (Shock = 2 obrażenia). */
function shockOnStack(state, id, victimId) {
  putCard(state, id, 'shock', 'p1', 'stack');
  const o = state.objects.get(id);
  state.objects.set(id, Object.freeze({ ...o, chosenTargets: [victimId] }));
  // addObject w strefie `stack` sam wpisuje id na stos (bez drugiego push — inwariant L21).
}

/**
 * Decyzja bota (p2) w zadanym kroku. `opp-main-stack`: tura PRZECIWNIKA, Shock(y) na stosie w odpowiedzi.
 * Zwraca wybór, wynik `pass_priority` i wyniki aktywacji `cnt` (ta sama skala co sonda okna).
 */
export function lethalDecision({ step, kind, lands = 1, creatureOpts = {}, enemy = null, shocks = 0, attackerPower = 2 }) {
  const state = botTurn({ life: 20 });
  if (step === 'opp-main-stack') {
    state.turn = { ...state.turn, activePlayerId: 'p1', step: 'main' };
    state.turn.priorityPlayerId = 'p2';
  }
  // Walka: przeciwnik atakuje, nasz stwór (cnt) BLOKUJE; obrażenia od atakującego są śmiertelne.
  if (step === 'opp-blocked') {
    state.turn = { ...state.turn, activePlayerId: 'p1', step: 'declare_blockers' };
    state.turn.priorityPlayerId = 'p2';
  }
  addLands(state, lands);
  const registry = ourCreature(state, { kind, ...creatureOpts });
  if (enemy) enemyBody(state, enemy);
  if (step === 'opp-blocked') {
    addObject(state, {
      id: 'att', instanceId: 'i-att', cardId: 'hill-giant', controllerId: 'p1', ownerId: 'p1', zone: 'battlefield',
      kind: 'creature', types: ['Creature'], subtypes: [], power: attackerPower, toughness: 3, manaCost: 2,
      abilities: [], keywords: [], colors: ['R'],
    });
    state.objects.set('att', Object.freeze({ ...state.objects.get('att'), summoningSickness: false }));
    state.combat = { attackingPlayerId: 'p1', attackers: ['att'], blockers: new Map([['att', ['cnt']]]), blockedAttackers: new Set(['att']) };
  }
  for (let i = 0; i < shocks; i += 1) shockOnStack(state, `shock${i}`, 'cnt');
  const bot = createHeuristicBot({ seed: 68, registry });
  const cmd = bot.chooseCommand(playerView(state, 'p2'), {});
  const entry = bot.trace().at(-1);
  const options = (entry?.options ?? []).map((o) => ({ cmd: o.cmd, score: o.score }));
  const act = options.filter((o) => o.cmd?.startsWith('activate_ability(cnt')).map((o) => o.score);
  const pass = options.find((o) => o.cmd === 'pass_priority' || o.cmd?.startsWith('pass_priority'))?.score ?? null;
  return { chosenCmd: entry?.chosen ?? null, chosen: cmd?.type ?? null, act, pass, options };
}

export const LETHAL_SCENARIOS = [
  { id: 'K1-minus-zabija-nasza-main', opis: '−1/−1 ZABIJA wrogiego 1/1 (toughness 1 → 0), nasza główna, 1 land → wykonaj (ASAP)',
    args: { step: 'main', kind: 'minus', lands: 1, enemy: { toughness: 1, power: 1 } },
    oczekuje: (r) => r.chosenCmd?.startsWith('activate_ability(cnt') },
  { id: 'K2-minus-nie-zabija-nasza-main', opis: 'kontrola: −1/−1 na wrogim 4/4 NIE zabija → odroczenie (pass w naszej głównej)',
    args: { step: 'main', kind: 'minus', lands: 1, enemy: { toughness: 4, power: 4 } },
    oczekuje: (r) => r.chosen === 'pass_priority' },
  { id: 'K3-plus-ratuje-stos', opis: 'Shock (2) na stosie przeciw naszemu 1/2 (toughness 2): +1/+1 → 3 > 2 ratuje → wykonaj (ASAP)',
    args: { step: 'opp-main-stack', kind: 'plus', lands: 1, creatureOpts: { power: 1, toughness: 2 }, shocks: 1 },
    oczekuje: (r) => r.chosenCmd?.startsWith('activate_ability(cnt') },
  { id: 'K4-plus-bez-zagrozenia', opis: 'kontrola: Shock (2) przeciw naszemu 1/4 (nie śmiertelny) → +1/+1 nie ratuje, odroczenie (pass)',
    args: { step: 'opp-main-stack', kind: 'plus', lands: 1, creatureOpts: { power: 1, toughness: 4 }, shocks: 1 },
    oczekuje: (r) => r.chosen === 'pass_priority' },
  { id: 'K5-plus-za-malo', opis: 'kontrola: DWA Shocki (4) przeciw 1/2: +1/+1 (toughness 3) nie wystarcza → odroczenie (pass)',
    args: { step: 'opp-main-stack', kind: 'plus', lands: 1, creatureOpts: { power: 1, toughness: 2 }, shocks: 2 },
    oczekuje: (r) => r.chosen === 'pass_priority' },
  { id: 'K6-plus-ratuje-walke', opis: 'walka: nasz 1/2 blokuje 2-mocnego atakującego (śmiertelne): +1/+1 → 3 > 2 ratuje → wykonaj (ASAP)',
    args: { step: 'opp-blocked', kind: 'plus', lands: 1, creatureOpts: { power: 1, toughness: 2 }, attackerPower: 2 },
    oczekuje: (r) => r.chosenCmd?.startsWith('activate_ability(cnt') },
  { id: 'K7-plus-za-malo-walka', opis: 'kontrola walki: 4-mocny atakujący zabija 1/2 mimo +1/+1 (toughness 3 < 4) → odroczenie (pass)',
    args: { step: 'opp-blocked', kind: 'plus', lands: 1, creatureOpts: { power: 1, toughness: 2 }, attackerPower: 4 },
    oczekuje: (r) => r.act.every((x) => x <= -1 + 1e-9) },
];

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const sc of LETHAL_SCENARIOS) {
    const r = lethalDecision(sc.args);
    const ok = sc.oczekuje(r);
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${sc.id.padEnd(32)} wybór=${r.chosenCmd} aktywacje=${r.act.map((x) => x.toFixed(2)).join('/') || '-'} pass=${r.pass?.toFixed?.(2) ?? r.pass}`);
  }
}
