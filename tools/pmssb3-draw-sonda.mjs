// PMSSB-3: sonda draw-family (krok-2 v3, fale A/B weryfikacja). S-piny draw-family, biblioteka 10, trace-based scoring.
// Uruchomienie: node tools/pmssb3-draw-sonda.mjs [filtr-nazwy-scenariusza]
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { addCounter } from '../src/engine/counters.js';

const REG = createCardRegistry();
const FILTER = process.argv[2] ?? '';
let n = 0;

function newState(step = 'main') {
  const state = createGameState({ seed: 42, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.number = 5;
  return state;
}
function fillLibrary(state, nSelf = 10, nFoe = 10) {
  for (let i = 0; i < nSelf; i += 1) addObject(state, { id: `libS${i}`, instanceId: `i-libS${i}`, cardId: `x-libS${i}`, controllerId: 'p1', zone: 'library', kind: 'creature', power: 0, toughness: 0, manaCost: 2, abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [], cardName: `libS${i}` });
  for (let i = 0; i < nFoe; i += 1) addObject(state, { id: `libF${i}`, instanceId: `i-libF${i}`, cardId: `x-libF${i}`, controllerId: 'p2', zone: 'library', kind: 'creature', power: 0, toughness: 0, manaCost: 2, abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [], cardName: `libF${i}` });
}
const BASIC = { W: 'basic-plains', U: 'basic-island', B: 'basic-swamp', R: 'basic-mountain', G: 'basic-forest' };
function addBasics(state, colors, count, tag = 'm') {
  for (let i = 0; i < count; i += 1) {
    const color = colors[i % colors.length];
    const def = REG.get(BASIC[color]);
    addObject(state, { id: `${tag}L${i}`, instanceId: `i-${tag}L${i}`, cardId: def.id, controllerId: 'p1', zone: 'battlefield', ...gameObjectDataOf(def) });
  }
}
function handCard(state, id, cardId, controllerId = 'p1') {
  const def = REG.get(cardId);
  if (!def) throw new Error(`brak karty ${cardId}`);
  addObject(state, { id, instanceId: `i-${id}`, cardId, controllerId, zone: 'hand', ...gameObjectDataOf(def) });
}
function filler(state, id, power = 2, toughness = 2, manaCost = 9) {
  addObject(state, { id, instanceId: `i-${id}`, cardId: `x-${id}`, controllerId: 'p1', zone: 'hand', kind: 'creature', power, toughness, manaCost, abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [], cardName: id });
}
function fieldCreature(state, id, controllerId, power, toughness, extra = {}) {
  addObject(state, { id, instanceId: `i-${id}`, cardId: `x-${id}`, controllerId, zone: 'battlefield', kind: 'creature', power, toughness, manaCost: 3, abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [], cardName: id, ...extra });
  return state.objects.get(id);
}
function fieldCard(state, id, cardId, controllerId = 'p1') {
  const def = REG.get(cardId);
  addObject(state, { id, instanceId: `i-${id}`, cardId, controllerId, zone: 'battlefield', ...gameObjectDataOf(def) });
  return state.objects.get(id);
}
function scoreAll(state) {
  const view = playerView(state, 'p1');
  const bot = createHeuristicBot({ seed: 9 });
  const chosen = bot.chooseCommand(view);
  const entry = bot.trace().at(-1);
  return { chosen, options: entry.options, view };
}
function show(name, match, state, { all = false, limit = 12 } = {}) {
  if (FILTER && !name.includes(FILTER)) return;
  n += 1;
  const { chosen, options } = scoreAll(state);
  console.log(`--- ${name} (ofert: ${options.length}, wybrano: ${chosen.type})`);
  const rows = all ? options : options.filter((o) => o.cmd.includes(match));
  for (const o of rows.slice(0, limit)) console.log(`    ${o.score.toFixed(4).padStart(10)}  ${o.cmd}`);
}
function showSynthetic(name, view, commands) {
  if (FILTER && !name.includes(FILTER)) return;
  n += 1;
  view = { ...view, legalCommands: commands };
  const bot = createHeuristicBot({ seed: 9 });
  const chosen = bot.chooseCommand(view);
  const entry = bot.trace().at(-1);
  console.log(`--- ${name} (wybrano: ${JSON.stringify(chosen)}))`);
  for (const o of entry.options) console.log(`    ${o.score.toFixed(4).padStart(10)}  ${o.cmd}`);
}
function baseView(state) {
  return playerView(state, 'p1');
}

// S01 rager-cast (oczek. ~71.1018)
{
  const s = newState(); fillLibrary(s); addBasics(s, ['B'], 5); handCard(s, 'rager', 'phyrexian-rager');
  show('S01-rager-cast', 'cast_permanent(rager)', s);
}
// S02 inspiration self/foe (oczek. 11 / -13)
{
  const s = newState(); fillLibrary(s); addBasics(s, ['U'], 6); handCard(s, 'in', 'inspiration');
  show('S02-inspiration-oba-cele', 'cast_spell(in', s, { all: false, limit: 6 });
}
// S03 reunion + R5 (oczek. top 17; warianty = które discardy)
{
  const s = newState(); fillLibrary(s); addBasics(s, ['R'], 4);
  handCard(s, 'reu', 'cathartic-reunion'); filler(s, 'fA', 1, 1, 1); filler(s, 'fB', 2, 2, 2); filler(s, 'fC', 5, 5, 5); filler(s, 'fD', 3, 3, 3);
  show('S03-reunion-warianty', 'cast_spell(reu', s, { all: false, limit: 14 });
}
// S04 rites: karma 1/2-CMC2 / 1/1-CMC0-token / 5/5-CMC5 (oczek. 6 / 8 / -4)
for (const [tag, p, t, cmc] of [['S04a-rites-1/2', 1, 2, 2], ['S04b-rites-token1/1', 1, 1, 0], ['S04c-rites-5/5', 5, 5, 5]]) {
  const s = newState(); fillLibrary(s); addBasics(s, ['B'], 3); handCard(s, 'rit', 'village-rites');
  fieldCreature(s, 'fod', 'p1', p, t, { manaCost: cmc });
  show(tag, 'cast_spell(rit', s, { all: false, limit: 6 });
}
// S05 hand3 vs hand8 (oczek. 11 == 11)
for (const k of [3, 8]) {
  const s = newState(); fillLibrary(s); addBasics(s, ['U'], 6); handCard(s, 'in', 'inspiration');
  for (let i = 0; i < k - 1; i += 1) filler(s, `h${i}`);
  show(`S05-hand${k}`, 'cast_spell(in', s, { all: false, limit: 4 });
}
// S06 thief-attack (różniczka thief vs vanilia) + blok
{
  const s = newState('declare_attackers'); fillLibrary(s);
  fieldCard(s, 'thief', 'scroll-thief'); fieldCreature(s, 'van', 'p1', 1, 3);
  show('S06a-thief-atak', 'attack[', s, { all: true, limit: 8 });
}
// S06b-thief-blok: POMINIĘTY (flaga attacking spoza kontraktu L21; H6-attack zamknięte różnicą S06a).
// S07 curiosity-cast na 1/1 (oczek. ~61.1982) + echo gospodarza
{
  const s = newState(); fillLibrary(s); addBasics(s, ['U'], 3); handCard(s, 'cur', 'curiosity');
  const host = fieldCreature(s, 'host', 'p1', 1, 1);
  console.log(`    (host P/T: ${host.power}/${host.toughness})`);
  show('S07-curiosity-cast', 'cast_permanent(cur', s, { all: false, limit: 4 });
}
// S07b curiosity na WROGIM stworze (aura-wroga-na-wrogu?)
{
  const s = newState(); fillLibrary(s); addBasics(s, ['U'], 3); handCard(s, 'cur', 'curiosity');
  fieldCreature(s, 'foe', 'p2', 3, 3);
  show('S07b-curiosity-foe-host', 'cast_permanent(cur', s, { all: false, limit: 4 });
}
// S07c curiosity na wrogim 1/1 (prognoza +61.2?)
{
  const s = newState(); fillLibrary(s); addBasics(s, ['U'], 3); handCard(s, 'cur', 'curiosity');
  fieldCreature(s, 'foe1', 'p2', 1, 1);
  show('S07c-curiosity-foe-1/1', 'cast_permanent(cur', s, { all: false, limit: 4 });
}
// S08 prowler-attack z blokerem 3/3 (oczek. różniczka +4?)
{
  const s = newState('declare_attackers'); fillLibrary(s);
  fieldCard(s, 'prow', 'guildsworn-prowler'); fieldCreature(s, 'blk', 'p2', 3, 3);
  show('S08-prowler-atak', 'attack[', s, { all: true, limit: 8 });
}
// S08b prowler-attack bez blokera
{
  const s = newState('declare_attackers'); fillLibrary(s);
  fieldCard(s, 'prow', 'guildsworn-prowler');
  show('S08b-prowler-bez-blokera', 'attack[', s, { all: true, limit: 6 });
}
// S08c vanilia 2/1 ginie w ataku (kontrola: trigger-0?)
{
  const s = newState('declare_attackers'); fillLibrary(s);
  fieldCreature(s, 'van2', 'p1', 2, 1); fieldCreature(s, 'blk', 'p2', 3, 3);
  show('S08c-vanilla-dies', 'attack[', s, { all: true, limit: 6 });
}
// S09 force-away: cel + ferocious ON/OFF
for (const fero of [true, false]) {
  const s = newState(); fillLibrary(s); addBasics(s, ['U'], 4); handCard(s, 'fa', 'force-away');
  fieldCreature(s, 'cel', 'p2', 3, 3);
  if (fero) fieldCreature(s, 'big', 'p1', 4, 4);
  show(`S09-forceaway-fero-${fero ? 'ON' : 'OFF'}`, 'cast_spell(fa', s, { all: false, limit: 4 });
}
// S10 murder-mayFire syntetycznie: fire/decline @lib10 i @lib0
for (const lib of [10, 0]) {
  const s = newState(); fillLibrary(s, lib, lib);
  const v = baseView(s);
  showSynthetic(`S10-murder-mayfire-lib${lib}`, v, [
    { type: 'resolve_optional_trigger_choice', playerId: 'p1', fire: true },
    { type: 'resolve_optional_trigger_choice', playerId: 'p1', fire: false },
  ]);
}
// S10b murder-cast (kontekst: 4/4 flying + trigger-0?)
{
  const s = newState(); fillLibrary(s); addBasics(s, ['U'], 7); handCard(s, 'mur', 'murder-of-crows');
  show('S10b-murder-cast', 'cast_permanent(mur', s, { all: false, limit: 4 });
}
// S11 temple-mody (oczek. mode1 ~62)
{
  const s = newState(); fillLibrary(s); addBasics(s, ['W'], 5); handCard(s, 'yt', 'your-temple-is-under-attack');
  fieldCreature(s, 'mine', 'p1', 2, 2); fieldCreature(s, 'yours', 'p2', 2, 2);
  show('S11-temple-mody', 'cast_spell(yt', s, { all: false, limit: 8 });
}
// S12 mysteries: BEZ landEnteredThisTurn (oczek. 18 = optymistyczny-then!) + Z
for (const dropped of [false, true]) {
  const s = newState(); fillLibrary(s); addBasics(s, ['U'], 7); handCard(s, 'mys', 'mysteries-of-the-deep');
  if (dropped) s.landEnteredThisTurn = { p1: 1 };
  show(`S12-mysteries-dropped-${dropped}`, 'cast_spell(mys', s, { all: false, limit: 4 });
}
// S13 envoy ±counter (oczek. równe ~68.4054)
for (const ctr of [false, true]) {
  const s = newState(); fillLibrary(s); addBasics(s, ['G'], 6); handCard(s, 'env', 'trade-route-envoy');
  fieldCreature(s, 'kolega', 'p1', 2, 2);
  if (ctr) addCounter(s, 'kolega', '+1/+1', 1);
  show(`S13-envoy-counter-${ctr}`, 'cast_permanent(env', s, { all: false, limit: 4 });
}
// S14 scroll-ability ±Angel
for (const angel of [false, true]) {
  const s = newState(); fillLibrary(s); addBasics(s, ['W', 'U', 'B', 'R', 'G'], 3);
  fieldCard(s, 'scr', 'scroll-of-avacyn');
  if (angel) fieldCreature(s, 'ang', 'p1', 4, 4, { subtypes: ['Angel'], types: ['Creature'] });
  show(`S14-scroll-angel-${angel}`, 'activate_ability(scr', s, { all: false, limit: 4 });
}
// S15 feed-cast (lib10)
{
  const s = newState(); fillLibrary(s); addBasics(s, ['B'], 6); handCard(s, 'fee', 'feed-the-infection');
  show('S15-feed-cast', 'cast_spell(fee', s, { all: false, limit: 4 });
}
// S16 quicksilver-cast (ETB-loot-6)
{
  const s = newState(); fillLibrary(s); addBasics(s, ['U'], 7); handCard(s, 'q', 'quicksilver-fisher');
  show('S16-quicksilver-cast', 'cast_permanent(q)', s, { all: false, limit: 4 });
}
// S17 tellah-cast (optymistyczny?)
{
  const s = newState(); fillLibrary(s); addBasics(s, ['U', 'R'], 7); handCard(s, 'tel', 'tellah-great-sage');
  show('S17-tellah-cast', 'cast_permanent(tel', s, { all: false, limit: 4 });
}
// S19 game-ball-ability
{
  const s = newState(); fillLibrary(s); addBasics(s, ['W', 'U', 'B', 'R', 'G'], 4);
  fieldCard(s, 'gb', 'contested-game-ball');
  show('S19-gameball-ability', 'activate_ability(gb', s, { all: false, limit: 4 });
}
// S20 deepwood-ability ({6G}: 8 landów)
{
  const s = newState(); fillLibrary(s); addBasics(s, ['G'], 8);
  fieldCard(s, 'dd', 'deepwood-denizen');
  show('S20-deepwood-ability', 'activate_ability(dd', s, { all: false, limit: 4 });
}
// S21 floodhound-ability (investigate — nie draw_cards!)
{
  const s = newState(); fillLibrary(s); addBasics(s, ['W', 'U', 'B', 'R', 'G'], 5);
  fieldCard(s, 'fh', 'floodhound');
  show('S21-floodhound-ability', 'activate_ability(fh', s, { all: false, limit: 4 });
}
// S22 foe-EOT: inspiration-self w end p2 (H2!)
{
  const s = newState('end'); fillLibrary(s); addBasics(s, ['U'], 6); handCard(s, 'in', 'inspiration');
  s.turn.activePlayerId = 'p2'; s.turn.priorityPlayerId = 'p1';
  show('S22-inspiration-foe-EOT', 'cast_spell(in', s, { all: false, limit: 4 });
}
// S03b reunion w main2 (F3-flat: main1 == main2?)
{
  const s = newState('main2'); fillLibrary(s); addBasics(s, ['R'], 4);
  handCard(s, 'reu', 'cathartic-reunion'); filler(s, 'fA', 1, 1, 1); filler(s, 'fB', 2, 2, 2); filler(s, 'fC', 5, 5, 5); filler(s, 'fD', 3, 3, 3);
  show('S03b-reunion-main2', 'cast_spell(reu', s, { all: false, limit: 6 });
}
console.log(`\nScenariuszy: ${n}`);
