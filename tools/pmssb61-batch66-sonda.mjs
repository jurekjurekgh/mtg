// PMSSB-61 (batch 66) — powtarzalna sonda pomiarowa.
//
// Metoda: realny createHeuristicBot, produkcyjne randomness/lookahead = 0,
// seed 2066, punkty z trace(). Kontrfaktyki składają rejestr z OBU list kart
// i przekazują go scenie oraz botowi. Uruchomienie:
//   node tools/pmssb61-batch66-sonda.mjs
//
// Wartości PRZED zapisano w planie PMSSB-61; ta sama macierz służy do pomiaru
// PO, dzięki czemu nie porównujemy różnych fixture'ów.
import { createGameState, addObject, playerView, execute } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry, REAL_CARDS, VIRTUAL_BASIC_LANDS } from '../src/cards/card-data.js';
import { createRegistry } from '../src/cards/registry.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { processTriggers } from '../src/engine/triggers.js';

const REG = createCardRegistry();
const SEED = 2066;
const allDefs = () => [...REAL_CARDS, ...VIRTUAL_BASIC_LANDS];
function registryKontra(id, mut, extras = []) {
  return createRegistry([...allDefs().map((c) => (c.id === id ? mut({ ...c }) : c)), ...extras]);
}
function scene({ registry = REG, many = 14, step = 'main', active = 'p1', priority = active,
  lib = 30, setup = () => {} } = {}) {
  const s = createGameState({ seed: SEED, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, step, active);
  s.turn.activePlayerId = active; s.turn.priorityPlayerId = priority;
  if (many > 0) addMana(s, priority, many);
  for (const pid of ['p1', 'p2']) for (let i = 0; i < lib; i++) addObject(s, {
    id: `lb-${pid}-${i}`, instanceId: `i-lb-${pid}-${i}`, cardId: 'x',
    controllerId: pid, ownerId: pid, zone: 'library', kind: 'sorcery', power: 0,
    toughness: 0, manaCost: 2, abilities: [], keywords: [], subtypes: [],
    types: ['Sorcery'], colors: [], cardName: 'lb',
  });
  setup(s, registry);
  s.__registry = registry;
  return s;
}
function put(s, id, cardId, controllerId = 'p1', zone = 'battlefield', registry = REG, patch = {}) {
  const def = registry.get(cardId);
  if (!def) throw new Error(`brak karty ${cardId}`);
  addObject(s, { id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId,
    zone, ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes, keywords: def.keywords });
  const cur = s.objects.get(id);
  s.objects.set(id, Object.freeze({ ...cur, summoningSickness: false, ...patch }));
  return s.objects.get(id);
}
function creature(s, id, who, p, t, patch = {}) {
  addObject(s, { id, instanceId: `i-${id}`, cardId: `synthetic-${id}`, controllerId: who,
    ownerId: who, zone: 'battlefield', kind: 'creature', power: p, toughness: t,
    manaCost: Math.max(p, 1), abilities: [], keywords: [], subtypes: [], types: ['Creature'],
    colors: [], cardName: id, summoningSickness: false, ...patch });
  const cur = s.objects.get(id);
  s.objects.set(id, Object.freeze({ ...cur, summoningSickness: false, ...patch }));
}
function options(s, botOptions = {}) {
  const b = createHeuristicBot({ seed: SEED + 1, registry: s.__registry ?? REG, ...botOptions });
  const choice = b.chooseCommand(playerView(s, s.turn.priorityPlayerId));
  return { choice, options: b.trace().at(-1)?.options ?? [] };
}
function show(label, s, filter = () => true, botOptions = {}) {
  const got = options(s, botOptions);
  const rows = got.options.filter(filter);
  console.log(`\n${label}`);
  console.log(` choice: ${JSON.stringify(got.choice)}`);
  console.log(rows.length ? rows.map((o) => `  ${o.cmd} = ${o.score.toFixed(4)}`).join('\n') : `  BRAK; all=${got.options.slice(0, 12).map((o) => `${o.cmd}:${o.score.toFixed(2)}`).join(' | ')}`);
  return rows;
}
const starts = (prefix) => (o) => o.cmd.startsWith(prefix);
const includes = (piece) => (o) => o.cmd.includes(piece);

console.log('=== PMSSB-61 batch 66 — powtarzalna sonda scoringu ===');

// F1 Sporecap: reach w realnym wyborze bloku.
{
  const s = scene({ many: 0, step: 'declare_blockers', active: 'p2', priority: 'p1', setup: (st) => {
    put(st, 'spider', 'sporecap-spider', 'p1', 'battlefield');
    creature(st, 'flyer', 'p2', 3, 3, { keywords: ['flying'], attacking: true });
    st.combat = { attackingPlayerId: 'p2', defendingPlayerId: 'p1', attackers: ['flyer'],
      blockers: new Map(), blockedAttackers: new Set() };
  }});
  show('F1 Sporecap — blok flying', s, (o) => o.cmd.startsWith('declare_blockers'));
}

// F2 Warden: vigilance powinno zachować gardę po ataku.
function wardenAttack(withVigilance) {
  const reg = withVigilance ? REG : registryKontra('warden-of-geometries', (d) => ({
    ...d, keywords: (d.keywords ?? []).filter((k) => k !== 'vigilance'),
  }));
  return scene({ registry: reg, many: 0, step: 'declare_attackers', active: 'p1', priority: 'p1', setup: (st, r) => {
    put(st, 'warden', 'warden-of-geometries', 'p1', 'battlefield', r);
    creature(st, 'crackback', 'p2', 4, 4, { cantBlock: true });
    st.players.find((p) => p.id === 'p1').life = 4;
  }});
}
show('F2 Warden vigilance — atak', wardenAttack(true), starts('declare_attackers'));
show('F2 KONTRA bez vigilance — atak', wardenAttack(false), starts('declare_attackers'));
{
  const s = scene({ many: 0, setup: (st) => {
    put(st, 'warden', 'warden-of-geometries', 'p1', 'battlefield');
    put(st, 'spell', 'naturalize', 'p1', 'hand');
    creature(st, 'artifact', 'p2', 0, 1, { kind: 'artifact', types: ['Artifact'] });
    addMana(st, 'p1', 1, { colors: ['G'] });
  }});
  show('F2 Warden — manual mana vs auto-pay', s, (o) => o.cmd.includes('(warden') || o.cmd.includes('(spell'));
}

// F3 Cazur: cast/Partner availability and combat counter payoff.
const cazurNoPartner = registryKontra('cazur-ruthless-stalker', (d) => ({
  ...d, abilities: (d.abilities ?? []).filter((a) => a.effect?.type !== 'search_library_to_hand'),
}));
const cazurNoCombat = registryKontra('cazur-ruthless-stalker', (d) => ({
  ...d, abilities: (d.abilities ?? []).filter((a) => a.trigger?.event !== 'any_combat_damage_to_player'),
}));
function cazurCast(reg = REG) {
  return scene({ registry: reg, setup: (st, r) => put(st, 'cazur-card', 'cazur-ruthless-stalker', 'p1', 'hand', r) });
}
show('F3 Cazur pełny — cast (brak ownDeck)', cazurCast(), includes('(cazur-card'));
show('F3 Cazur bez Partner — cast', cazurCast(cazurNoPartner), includes('(cazur-card'));
show('F3 Cazur bez combat trigger — cast', cazurCast(cazurNoCombat), includes('(cazur-card'));
show('F3 Cazur ownDeck BEZ Ukkimy', cazurCast(), includes('(cazur-card'), { ownDeck: ['cazur-ruthless-stalker'] });
const fakeUkkima = { ...REG.get('druid-of-the-cowl'), id: 'fake-ukkima', name: 'Ukkima, Stalking Shadow',
  oracleText: '', artId: null, imageUri: null };
const regUkkima = registryKontra('__none__', (d) => d, [fakeUkkima]);
show('F3 Cazur ownDeck Z Ukkimą', cazurCast(regUkkima), includes('(cazur-card'),
  { ownDeck: ['cazur-ruthless-stalker', 'fake-ukkima'] });
function cazurAttack(reg) {
  return scene({ registry: reg, many: 0, step: 'declare_attackers', setup: (st, r) => {
    put(st, 'cazur', 'cazur-ruthless-stalker', 'p1', 'battlefield', r);
    creature(st, 'a', 'p1', 2, 2);
  }});
}
show('F3 Cazur board — ataki z counter payoff', cazurAttack(REG), starts('declare_attackers'));
show('F3 KONTRA bez combat trigger — ataki', cazurAttack(cazurNoCombat), starts('declare_attackers'));

// F4 Lorescale: cast anticipation + draw synergies in cast_spell / activated / ETB permanent.
const coatlNoAbility = registryKontra('lorescale-coatl', (d) => ({ ...d, abilities: [] }));
function coatlCast(reg) { return scene({ registry: reg, setup: (st, r) => put(st, 'coatl-card', 'lorescale-coatl', 'p1', 'hand', r) }); }
show('F4 Lorescale pełny — cast', coatlCast(REG), includes('(coatl-card'));
show('F4 Lorescale KONTRA bez triggera — cast', coatlCast(coatlNoAbility), includes('(coatl-card'));
function withCoatl(reg, setup) {
  return scene({ registry: reg, setup: (st, r) => { put(st, 'coatl', 'lorescale-coatl', 'p1', 'battlefield', r); setup(st, r); } });
}
show('F4 draw spell + Lorescale', withCoatl(REG, (st) => put(st, 'draw', 'inspiration', 'p1', 'hand')),
  (o) => o.cmd.includes('(draw->p1'));
show('F4 draw spell + KONTRA', withCoatl(coatlNoAbility, (st, r) => put(st, 'draw', 'inspiration', 'p1', 'hand', r)),
  (o) => o.cmd.includes('(draw->p1'));
show('F4 draw ability + Lorescale', withCoatl(REG, (st) => {
  put(st, 'scholar', 'civilized-scholar', 'p1', 'battlefield');
  put(st, 'fodder', 'naturalize', 'p1', 'hand');
}), includes('(scholar'));
show('F4 draw ability + KONTRA', withCoatl(coatlNoAbility, (st, r) => {
  put(st, 'scholar', 'civilized-scholar', 'p1', 'battlefield', r);
  put(st, 'fodder', 'naturalize', 'p1', 'hand', r);
}), includes('(scholar'));
show('F4 ETB draw permanent + Lorescale', withCoatl(REG, (st) => put(st, 'rager', 'phyrexian-rager', 'p1', 'hand')),
  includes('(rager'));
show('F4 ETB draw permanent + KONTRA', withCoatl(coatlNoAbility, (st, r) => put(st, 'rager', 'phyrexian-rager', 'p1', 'hand', r)),
  includes('(rager'));

// F5 Foul Orchard: rodzina tapped dual / potrzeby kolorów.
{
  const s = scene({ many: 0, setup: (st) => {
    put(st, 'orchard', 'foul-orchard', 'p1', 'hand');
    put(st, 'forest', 'basic-forest', 'p1', 'hand');
    put(st, 'green-spell', 'naturalize', 'p1', 'hand');
    put(st, 'black-spell', 'village-rites', 'p1', 'hand');
    creature(st, 'fodder', 'p1', 1, 1);
  }});
  show('F5 Foul Orchard — play_land', s, starts('play_land'));
}

// F6 Noble Vestige: aktywacja prewencji musi używać tej samej miary co spell.
function nobleNoThreat() {
  return scene({ many: 0, setup: (st) => put(st, 'noble', 'noble-vestige', 'p1', 'battlefield') });
}
show('F6 Noble — brak nadchodzących obrażeń', nobleNoThreat(), (o) => o.cmd.includes('(noble'));
function nobleCombat() {
  return scene({ many: 0, step: 'declare_blockers', active: 'p2', priority: 'p1', setup: (st) => {
    put(st, 'noble', 'noble-vestige', 'p1', 'battlefield');
    put(st, 'withstand', 'withstand', 'p1', 'hand');
    addMana(st, 'p1', 4, { colors: ['W'] });
    creature(st, 'attacker', 'p2', 3, 3, { attacking: true, cantBeBlocked: true });
    st.combat = { attackingPlayerId: 'p2', defendingPlayerId: 'p1', attackers: ['attacker'],
      blockers: new Map(), blockedAttackers: new Set() };
  }});
}
show('F6 Noble — wróg uderza w twarz (vs Withstand)', nobleCombat(), (o) => o.cmd.includes('(noble') || o.cmd.includes('(withstand->p1'));

// F7 Wild Celebrants / F8 Naturalize: zamknięte rodziny removal.
const wildNoEtb = registryKontra('wild-celebrants', (d) => ({ ...d, abilities: [] }));
function wildCast(reg, enemyArtifact = true) {
  return scene({ registry: reg, setup: (st, r) => {
    if (enemyArtifact) put(st, 'artifact', 'universal-solvent', 'p2', 'battlefield', r);
    put(st, 'wild-card', 'wild-celebrants', 'p1', 'hand', r);
  }});
}
show('F7 Wild pełny + enemy artifact', wildCast(REG, true), includes('(wild-card'));
show('F7 Wild KONTRA bez ETB', wildCast(wildNoEtb, true), includes('(wild-card'));
show('F7 Wild pełny bez artifact', wildCast(REG, false), includes('(wild-card'));
{
  const s = scene({ setup: (st) => {
    put(st, 'nat', 'naturalize', 'p1', 'hand');
    addMana(st, 'p1', 2, { colors: ['G'] });
    put(st, 'small', 'universal-solvent', 'p2', 'battlefield');
    put(st, 'big', 'bomat-bazaar-barge', 'p2', 'battlefield');
    put(st, 'own', 'universal-solvent', 'p1', 'battlefield');
  }});
  show('F8 Naturalize — target ranking', s, (o) => o.cmd.includes('(nat->'));
}

// F9 Rakish: activation cost, target land and later cast.
function rakishTargets(reg = REG) {
  return scene({ registry: reg, many: 2, setup: (st, r) => {
    put(st, 'forest', 'basic-forest', 'p1', 'battlefield', r);
    put(st, 'plains', 'basic-plains', 'p1', 'battlefield', r);
    put(st, 'swamp', 'basic-swamp', 'p1', 'battlefield', r);
    put(st, 'swamp2', 'basic-swamp', 'p1', 'battlefield', r);
    put(st, 'swamp3', 'basic-swamp', 'p1', 'battlefield', r);
    put(st, 'foe-land', 'basic-mountain', 'p2', 'battlefield', r);
    put(st, 'rakish', 'rakish-revelers', 'p1', 'hand', r);
  }});
}
show('F9 Rakish — wybór target land + cast bez aktywacji', rakishTargets(), (o) => o.cmd.includes('(rakish'));
const rakishFree = registryKontra('rakish-revelers', (d) => ({ ...d, abilities: d.abilities.map((a) =>
  a.fromHand ? { ...a, cost: { ...a.cost, mana: 0 } } : a) }));
show('F9 Rakish KONTRA koszt aktywacji 0', rakishTargets(rakishFree), (o) => o.cmd.includes('(rakish'));

// F10 Scythe Tiger: liczba/kolor landów oraz decyzja ofiary.
function tigerCast(lands, reg = REG, withDemand = false) {
  return scene({ registry: reg, many: 1, setup: (st, r) => {
    const ids = ['basic-forest', 'basic-swamp', 'basic-plains', 'basic-island', 'foul-orchard'];
    for (let i = 0; i < lands; i++) put(st, `land${i}`, ids[i % ids.length], 'p1', 'battlefield', r);
    if (withDemand) put(st, 'demand', 'naturalize', 'p1', 'hand', r);
    put(st, 'tiger-card', 'scythe-tiger', 'p1', 'hand', r);
  }});
}
for (const n of [0, 1, 2, 3, 5]) show(`F10 Tiger cast — ${n} landów`, tigerCast(n), includes('(tiger-card'));
show('F10 Tiger cast — 3 landy + green demand', tigerCast(3, REG, true), includes('(tiger-card'));
const tigerNoEtb = registryKontra('scythe-tiger', (d) => ({ ...d, abilities: [] }));
show('F10 Tiger KONTRA bez ETB — 1 land', tigerCast(1, tigerNoEtb), includes('(tiger-card'));

function tigerSacrifice(lands, withDemand = false) {
  const s = scene({ many: 0, setup: (st) => {
    const ids = ['basic-forest', 'basic-swamp', 'basic-plains', 'basic-island'];
    for (let i = 0; i < lands; i++) put(st, `land${i}`, ids[i % ids.length], 'p1', 'battlefield');
    if (withDemand) put(st, 'demand', 'naturalize', 'p1', 'hand');
    put(st, 'tiger', 'scythe-tiger', 'p1', 'battlefield');
    processTriggers(st, [{ type: 'permanent_entered_battlefield', object: st.objects.get('tiger') }]);
  }});
  for (let i = 0; i < 10 && !s.pendingSacrifice; i++) {
    const cmd = playerView(s, s.turn.priorityPlayerId).legalCommands.find((c) => c.type === 'pass_priority');
    if (!cmd) break;
    const out = execute(s, cmd);
    if (!out.ok) throw new Error(out.reason);
  }
  return s;
}
show('F10 Tiger sacrifice — 1 land', tigerSacrifice(1), starts('resolve_sacrifice_choice'));
show('F10 Tiger sacrifice — 3 lands + green demand', tigerSacrifice(3, true), starts('resolve_sacrifice_choice'));
