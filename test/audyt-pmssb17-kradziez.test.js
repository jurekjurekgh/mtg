import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { attachEquipmentToCreature } from '../src/engine/attachments.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

// PMSSB-17 (metoda M429) — kradzież do końca tury
// (`gain_control_until_end_of_turn`, 3 karty: Act of Treason / Awaken the
// Sleeper / Spreading Insurrection). Czasowa zmiana kontroli: CR 110.2
// (właściciel ≠ kontroler — obrażenia idą w właściciela), CR 506.4 (zmiana
// kontroli usuwa z walki), CR 514.2 („do końca tury" kończy się w cleanup —
// kreatura WRACA przed ich turą).
//
// Findingi (pomiar PRZED: /tmp/pmssb17-kradziez-przed.mjs):
//   R1 — DOUBLE-COUNTING: dwa bloki z epok M257-r5b/C i M157/L28 SUMOWAŁY
//     się (3·power + 12 + 2p + t = 37 dla 4/5 wroga → 87). Unifikacja w
//     `gainControlValue` (L41).
//   R2 — drabina: jeden pewny atak z haste w właściciela (2·moc) + luki w
//     bloku (skradziony wypada z ich blokujących) + equipment (M257 — bonus
//     jest wyceną ridera `destroy_equipment_attached`).
//   R3 — ZERO osi obronnej (werdykt z ujemnym wynikiem): sorcery-speed
//     kradzież wraca PRZED ich turą (CR 514.2) — nie foguje ich ataku.
//     S07 (życie 5, ich 5/5) = tylko większa moc, bez dopłaty ratunku.
//   R4 — ZERO premii trwałej: karta wraca — zysk trwały tylko gdy ginie
//     (nie zgadujemy bloków; combo z poświęceniem = PMSSB-11).
//   R5 — storm (Spreading Insurrection) poza zakresem (rodzina storm).
//
// Anty-over-fix (M429): M231 (własna < pass), M157 (cel = najsilniejszy),
// M257 (przejęcie z equipmentem + zniszczenie) — progi behawioralne
// nietknięte; kotwice PRZED→PO: 87→67, 74→63, −60→−20, 117→97, 92→69, 68→69.

const REGISTRY = createCardRegistry();

function putSpell(state, id, cardId, controllerId, zone) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness, manaCost: data.manaCost,
    spell: data.spell, abilities: data.abilities ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], types: def.types ?? [], colors: data.colors ?? [],
  });
  return state.objects.get(id);
}

function putCreature(state, id, controllerId, power, toughness, extra = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `x-${id}`, controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost: 3,
    types: ['Creature'], subtypes: [], colors: [], abilities: [], keywords: [],
    ...extra,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

function putEquipment(state, id, controllerId, hostId) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `x-${id}`, controllerId, zone: 'battlefield',
    kind: 'artifact', manaCost: 2, types: ['Artifact'], subtypes: ['Equipment'],
    colors: [], abilities: [], keywords: [], equipment: { equip: 2 },
  });
  attachEquipmentToCreature(state, id, hostId);
  return state.objects.get(id);
}

function base() {
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  addMana(state, 'p2', 12);
  for (let i = 0; i < 8; i++) putSpell(state, `lib${i}`, 'highland-game', 'p2', 'library');
  return state;
}

function decide(state, params = undefined) {
  const view = playerView(state, 'p2');
  const bot = createHeuristicBot({ seed: 99, ...(params ? { params } : {}) });
  const choice = bot.chooseCommand(view, {});
  const last = bot.trace().at(-1) ?? {};
  return { choice, options: last.options ?? [] };
}

function optionScore(options, cmd) {
  const found = options.find((o) => o.cmd === cmd);
  assert.ok(found, `brak opcji ${cmd} w: ${options.map((o) => o.cmd).join(' | ')}`);
  return found.score;
}

function stealBoard({ myCard = 'act-of-treason', foe = [], mine = [], life = 20, eqOn = null } = {}) {
  const state = base();
  putSpell(state, 'a', myCard, 'p2', 'hand');
  state.players.find((p) => p.id === 'p2').life = life;
  for (const [id, p, t] of mine) putCreature(state, id, 'p2', p, t);
  for (const [id, p, t] of foe) putCreature(state, id, 'p1', p, t);
  if (eqOn) putEquipment(state, 'eq', 'p1', eqOn);
  return state;
}

// ---------------------------------------------------------------------------
// R1 — kotwice drabiny (PRZED→PO): double-counting skasowany.
// ---------------------------------------------------------------------------

test('PMSSB-17/R1: treason na 4/5 wroga = 67 (było 87: 37 z double-countu)', () => {
  const state = stealBoard({ foe: [['big', 4, 5]] });
  const { choice, options } = decide(state);
  assert.deepEqual(choice, { type: 'cast_spell', playerId: 'p2', objectId: 'a', targets: ['big'] });
  assert.equal(optionScore(options, 'cast_spell(a->big)'), 67);
});

test('PMSSB-17/R1: treason na 2/2 = 63 (było 74) — różnica do S01 = 2·moc', () => {
  const state = stealBoard({ foe: [['small', 2, 2]] });
  const { options } = decide(state);
  assert.equal(optionScore(options, 'cast_spell(a->small)'), 63);
});

test('PMSSB-17/R1+M231: cel własny = −20 (było −60: −40 i −70 liczone razem)', () => {
  const state = stealBoard({ mine: [['mine', 2, 2]] });
  const { options } = decide(state);
  assert.equal(optionScore(options, 'cast_spell(a->mine)'), -20);
});

test('PMSSB-17/M231: progi — własna poniżej passu, wroga powyżej', () => {
  const own = stealBoard({ mine: [['mine', 4, 5]] });
  const foe = stealBoard({ foe: [['big', 4, 5]] });
  const so = decide(own).options;
  const sf = decide(foe).options;
  const ownScore = optionScore(so, 'cast_spell(a->mine)');
  const foeScore = optionScore(sf, 'cast_spell(a->big)');
  const passScore = so.find((o) => o.cmd === 'pass_priority')?.score ?? 0;
  assert.ok(ownScore < passScore, `własna ${ownScore} < pass ${passScore}`);
  assert.ok(foeScore > passScore, `wroga ${foeScore} > pass ${passScore}`);
});

// ---------------------------------------------------------------------------
// R2 — equipment (M257) i luki w bloku.
// ---------------------------------------------------------------------------

test('PMSSB-17/M257: awaken na 4/5 z EQ = 97 (67 + 25 + 5·1)', () => {
  const state = stealBoard({ myCard: 'awaken-the-sleeper', foe: [['big', 4, 5]], eqOn: 'big' });
  const { options } = decide(state);
  assert.equal(optionScore(options, 'cast_spell(a->big)'), 97);
});

test('PMSSB-17/M257: awaken bez EQ = 67 — delta 30 = bonus equipmentu', () => {
  const state = stealBoard({ myCard: 'awaken-the-sleeper', foe: [['big', 4, 5]] });
  const { options } = decide(state);
  assert.equal(optionScore(options, 'cast_spell(a->big)'), 67);
});

test('PMSSB-17/R2: kradzież ich jedynego blokera = 69 (5+2·1+4·3 luki)', () => {
  const state = stealBoard({ foe: [['bl', 1, 1]], mine: [['m1', 3, 3], ['m2', 3, 3]] });
  const { options } = decide(state);
  assert.equal(optionScore(options, 'cast_spell(a->bl)'), 69);
  // Cel własny w tym samym stanie — guard kierunku.
  assert.equal(optionScore(options, 'cast_spell(a->m1)'), -20);
});

test('PMSSB-17/R2: bez moich atakujących kradzież blokera = 57 (brak luk)', () => {
  const state = stealBoard({ foe: [['bl', 1, 1], ['b2', 2, 2]] });
  const { options } = decide(state);
  // Skradziony 1/1 dołącza do moich (1), ich bloker zostaje (1) → luki 0.
  assert.equal(optionScore(options, 'cast_spell(a->bl)'), 57);
});

test('PMSSB-17/R2+M157: cel = najsilniejszy; ich druga kreatura blokuje lukę (63 vs 59)', () => {
  const state = stealBoard({ myCard: 'spreading-insurrection', foe: [['big', 4, 5], ['small', 2, 2]] });
  const { choice, options } = decide(state);
  assert.equal(choice.targets?.[0], 'big', `cel = najsilniejszy: ${JSON.stringify(choice)}`);
  assert.equal(optionScore(options, 'cast_spell(a->big)'), 63);
  assert.equal(optionScore(options, 'cast_spell(a->small)'), 59);
});

// ---------------------------------------------------------------------------
// R3 — brak osi obronnej (werdykt z ujemnym wynikiem, CR 514.2).
// ---------------------------------------------------------------------------

test('PMSSB-17/R3: obrona @5 vs ich 5/5 = 69 — bez fog (wraca na EOT)', () => {
  const state = stealBoard({ foe: [['att', 5, 5]], life: 5 });
  const { options } = decide(state);
  // 50 + 5 + 2·5 + 4·1 = 69 — DOKŁADNIE jak zwykły atak; brak dopłaty
  // ratunku (fogWindowLethalSaveValue) — kradzież sorcery nie chroni.
  assert.equal(optionScore(options, 'cast_spell(a->att)'), 69);
});

// ---------------------------------------------------------------------------
// Pokrętła — każde przesuwa Tylko swoją oś.
// ---------------------------------------------------------------------------

test('PMSSB-17/pokrętło: gainControlOwnPenalty:0 → cel własny = 50 (baza)', () => {
  const state = stealBoard({ mine: [['mine', 2, 2]] });
  const { options } = decide(state, { gainControlOwnPenalty: 0 });
  assert.equal(optionScore(options, 'cast_spell(a->mine)'), 50);
});

test('PMSSB-17/pokrętło: gainControlAttackWeight:0 → S01 = 59 (67 − 2·4)', () => {
  const state = stealBoard({ foe: [['big', 4, 5]] });
  const { options } = decide(state, { gainControlAttackWeight: 0 });
  assert.equal(optionScore(options, 'cast_spell(a->big)'), 59);
});

test('PMSSB-17/pokrętło: gainControlOpenValue:0 → kradzież blokera = 57 (69 − 12)', () => {
  const state = stealBoard({ foe: [['bl', 1, 1]], mine: [['m1', 3, 3], ['m2', 3, 3]] });
  const { options } = decide(state, { gainControlOpenValue: 0 });
  assert.equal(optionScore(options, 'cast_spell(a->bl)'), 57);
});
