// PMSSB-4 krok-1: sonda PRZED rodziny gain_life (28 kart).
// Uruchomienie: node tools/pmssb4-zycie-sonda.mjs [filtr]
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

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
function setLife(state, me, foe = 20) {
  state.players.find((p) => p.id === 'p1').life = me;
  state.players.find((p) => p.id === 'p2').life = foe;
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
function handCard(state, id, cardId) {
  const def = REG.get(cardId);
  addObject(state, { id, instanceId: `i-${id}`, cardId, controllerId: 'p1', zone: 'hand', ...gameObjectDataOf(def) });
}
function fieldCreature(state, id, controllerId, power, toughness, extra = {}) {
  addObject(state, { id, instanceId: `i-${id}`, cardId: `x-${id}`, controllerId, zone: 'battlefield', kind: 'creature', power, toughness, manaCost: 3, abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [], cardName: id, ...extra });
}
function fieldArtifact(state, id, controllerId, mv) {
  addObject(state, { id, instanceId: `i-${id}`, cardId: `x-${id}`, controllerId, zone: 'battlefield', kind: 'artifact', power: 0, toughness: 0, manaCost: mv, abilities: [], keywords: [], subtypes: [], types: ['Artifact'], colors: [], cardName: id });
}
function fieldCard(state, id, cardId, controllerId = 'p1') {
  const def = REG.get(cardId);
  addObject(state, { id, instanceId: `i-${id}`, cardId, controllerId, zone: 'battlefield', ...gameObjectDataOf(def) });
}
function scoreAll(state) {
  const view = playerView(state, 'p1');
  const bot = createHeuristicBot({ seed: 9 });
  const chosen = bot.chooseCommand(view);
  return { chosen, options: bot.trace().at(-1).options };
}
function show(name, match, state, { all = false, limit = 14 } = {}) {
  if (FILTER && !name.includes(FILTER)) return;
  n += 1;
  const { chosen, options } = scoreAll(state);
  console.log(`--- ${name} (ofert: ${options.length}, wybrano: ${chosen.type})`);
  const rows = all ? options : options.filter((o) => o.cmd.includes(match));
  for (const o of rows.slice(0, limit)) console.log(`    ${o.score.toFixed(4).padStart(10)}  ${o.cmd}`);
}

// L01: Douse (dmg2 + gain2 w stwora 3/3) przy zyciu 20 vs 5 (H1/H2: noga-gain niewidzialna?)
for (const life of [20, 5]) {
  const s = newState(); fillLibrary(s); setLife(s, life); addBasics(s, ['B'], 5); handCard(s, 'dg', 'douse-in-gloom');
  fieldCreature(s, 'wrog', 'p2', 3, 3);
  show(`L01-douse-life${life}`, 'cast_spell(dg', s, { limit: 4 });
}
// L02: Consume Spirit X w twarz, mana 6, zycie 20 vs 5 (H12: skala z X? gain?)
for (const life of [20, 5]) {
  const s = newState(); fillLibrary(s); setLife(s, life); addBasics(s, ['B'], 6); handCard(s, 'cs', 'consume-spirit');
  show(`L02-consume-life${life}`, 'cast_spell(cs', s, { limit: 10 });
}
// L03: Severed Strands, karma 1/1-CMC1 vs 1/4-CMC1 (H2/H10: rozniczka = sam sac?)
for (const [tag, t] of [['L03a-strands-T1', 1], ['L03b-strands-T4', 4], ['L03c-strands-T7', 7]]) {
  const s = newState(); fillLibrary(s); setLife(s, 20); addBasics(s, ['B'], 4); handCard(s, 'ss', 'severed-strands');
  fieldCreature(s, 'cel', 'p2', 2, 2);
  fieldCreature(s, 'fod', 'p1', 1, t, { manaCost: 1 });
  show(tag, 'cast_spell(ss', s, { limit: 4 });
}
// L04: Divine Offering w artefakt MV1 i MV4 (H2/H3: noga-gain-MV?)
{
  const s = newState(); fillLibrary(s); setLife(s, 20); addBasics(s, ['W'], 4); handCard(s, 'do', 'divine-offering');
  fieldArtifact(s, 'art1', 'p2', 1); fieldArtifact(s, 'art4', 'p2', 4);
  show('L04-divine-MV1-vs-MV4', 'cast_spell(do', s, { limit: 6 });
}
// L05: Soulmender {T}:+1 przy zyciu 20/10/5 (H4: warstwy M236?)
for (const life of [20, 10, 5]) {
  const s = newState(); fillLibrary(s); setLife(s, life);
  fieldCard(s, 'sm', 'soulmender');
  show(`L05-soulmender-life${life}`, 'activate_ability(sm', s, { limit: 3 });
}
// L06: Food {2}T,sac:+3 przy zyciu 20/5 (H4: tani-sac bez kary?)
for (const life of [20, 5]) {
  const s = newState(); fillLibrary(s); setLife(s, life); addBasics(s, ['W', 'U', 'B', 'R', 'G'], 4);
  fieldCard(s, 'food', 'token_food');
  show(`L06-food-life${life}`, 'activate_ability(food', s, { limit: 3 });
}
// L07: Kheru sac 1/1 vs 1/4 (H4/H10: gain-T vs koszt-sac?)
for (const [tag, t] of [['L07a-kheru-T1', 1], ['L07b-kheru-T4', 4]]) {
  const s = newState(); fillLibrary(s); setLife(s, 20); addBasics(s, ['G'], 4);
  void tag;
  fieldCard(s, 'kh', 'kheru-dreadmaw');
  fieldCreature(s, 'fod', 'p1', 1, t, { manaCost: 2 });
  show(tag, 'activate_ability(kh', s, { limit: 4 });
}
for (const [tag, t] of [['L07c-kheru-T1-life5', 1], ['L07d-kheru-T4-life5', 4]]) {
  const s = newState(); fillLibrary(s); setLife(s, 5); addBasics(s, ['G'], 4);
  fieldCard(s, 'kh', 'kheru-dreadmaw');
  fieldCreature(s, 'fod', 'p1', 1, t, { manaCost: 2 });
  show(tag, 'activate_ability(kh', s, { limit: 4 });
}
// L08: Ramen {2}T,sac:+3 przy zyciu 20/5 (H4: drogi-sac z kara?)
for (const life of [20, 5]) {
  const s = newState(); fillLibrary(s); setLife(s, life); addBasics(s, ['W', 'U', 'B', 'R', 'G'], 4);
  fieldCard(s, 'ram', 'instant-ramen');
  show(`L08-ramen-life${life}`, 'activate_ability(ram', s, { limit: 4 });
}
// L09: Zombie w siebie vs we wroga (H7: straznik -25-x?)
{
  const s = newState(); fillLibrary(s); setLife(s, 20); addBasics(s, ['W'], 3);
  fieldCard(s, 'zom', 'mournful-zombie');
  show('L09-zombie-self-vs-foe', 'activate_ability(zom', s, { limit: 4 });
}
// L10: Healer ETB+3 rzut (H5: min(6,8)?)
{
  const s = newState(); fillLibrary(s); setLife(s, 20); addBasics(s, ['G'], 3); handCard(s, 'heal', 'healer-of-the-glade');
  show('L10-healer-cast', 'cast_permanent(heal', s, { limit: 3 });
}
// L10b: Paladin ETB+3 rzut (H5/H10: koszt 5 vs 1?)
{
  const s = newState(); fillLibrary(s); setLife(s, 20); addBasics(s, ['G'], 7); handCard(s, 'pal', 'spinewoods-paladin');
  show('L10b-paladin-cast', 'cast_permanent(pal', s, { limit: 3 });
}
// L11: gain-land vs basic (H5: ETB-gain w play_land?)
{
  const s = newState(); fillLibrary(s); setLife(s, 20);
  handCard(s, 'tw', 'thornwood-falls'); handCard(s, 'isl', 'basic-island');
  show('L11-gainland-vs-basic', 'play_land', s, { all: false, limit: 4 });
}
// L12: Page modal (gain2/surveil/lose1) przy zyciu 20/5 (H6: warstwy?)
for (const life of [20, 5]) {
  const s = newState(); fillLibrary(s); setLife(s, life);
  fieldCard(s, 'page', 'etherwrought-page');
  const def = REG.get('etherwrought-page');
  const ab = def.abilities.find((a) => a.trigger?.modes);
  s.pendingModalTrigger = { playerId: 'p1', sourceId: 'page', cardId: 'etherwrought-page', ability: ab, modes: ab.trigger.modes, extra: {}, restorePriorityTo: null };
  s.turn.priorityPlayerId = 'p1';
  show(`L12-page-life${life}`, 'resolve_modal_choice', s, { limit: 6 });
}
// L12b: Bard modal (pump/gain3) przy zyciu 20/5 (H6)
for (const life of [20, 5]) {
  const s = newState(); fillLibrary(s); setLife(s, life);
  fieldCard(s, 'bard', 'inspiring-bard');
  fieldCreature(s, 'moj', 'p1', 2, 2); fieldCreature(s, 'wrogi', 'p2', 2, 2);
  const def = REG.get('inspiring-bard');
  const ab = def.abilities.find((a) => a.trigger?.modes);
  s.pendingModalTrigger = { playerId: 'p1', sourceId: 'bard', cardId: 'inspiring-bard', ability: ab, modes: ab.trigger.modes, extra: {}, restorePriorityTo: null };
  s.turn.priorityPlayerId = 'p1';
  show(`L12b-bard-life${life}`, 'resolve_modal_choice', s, { limit: 6 });
}
// L13-L16: triggery-gain w rzucie (H8: 0?)
for (const [tag, id, colors, nmana] of [['L13-highland-dies', 'highland-game', ['G'], 4], ['L14-gladehart-landfall', 'grazing-gladehart', ['G'], 5], ['L15-feather-cast', 'angels-feather', ['W'], 4], ['L16-zoraline-attacks', 'zoraline', ['W', 'B'], 5]]) {
  const s = newState(); fillLibrary(s); setLife(s, 20); addBasics(s, colors, nmana); handCard(s, 'k', id);
  show(tag, 'cast_permanent(k', s, { limit: 3 });
}
// L17: Time to Feed, ten sam kill, zycie 20 vs 5 (H2: noga-gain2?)
for (const life of [20, 5]) {
  const s = newState(); fillLibrary(s); setLife(s, life); addBasics(s, ['G'], 5); handCard(s, 'tf', 'time-to-feed');
  fieldCreature(s, 'moj', 'p1', 3, 3); fieldCreature(s, 'slaby', 'p2', 2, 2); fieldCreature(s, 'mocny', 'p2', 5, 5);
  show(`L17-timetofeed-life${life}`, 'cast_spell(tf', s, { limit: 6 });
}
// L18: Soulmender EOT-wroga vs main (H11: flat?)
{
  const s = newState('end'); fillLibrary(s); setLife(s, 20);
  fieldCard(s, 'sm', 'soulmender');
  s.turn.activePlayerId = 'p2'; s.turn.priorityPlayerId = 'p1';
  show('L18-soulmender-foe-EOT', 'activate_ability(sm', s, { limit: 3 });
}
// L19: Food przy zyciu 3 z presja vs bez (H9: waga wyscigu?)
for (const pres of [false, true]) {
  const s = newState(); fillLibrary(s); setLife(s, 3); addBasics(s, ['W', 'U', 'B', 'R', 'G'], 4);
  fieldCard(s, 'food', 'token_food');
  if (pres) { fieldCreature(s, 'a5', 'p2', 5, 5); fieldCreature(s, 'a4', 'p2', 4, 4); }
  show(`L19-food-pres-${pres}`, 'activate_ability(food', s, { limit: 3 });
}
// L20: Talisman {T}:mana+gain1 przy zyciu 20 vs 5 (bundle: gain liczony?)
for (const life of [20, 5]) {
  const s = newState(); fillLibrary(s); setLife(s, life);
  fieldCard(s, 'tal', 'pristine-talisman');
  show(`L20-talisman-life${life}`, 'activate_ability(tal', s, { limit: 3 });
}

// L19b: Food przy zyciu 12 bez presji vs z presja 5/5+4/4 (H8/H9: prog cisnienia?)
for (const pres of [false, true]) {
  const s = newState(); fillLibrary(s); setLife(s, 12); addBasics(s, ['W', 'U', 'B', 'R', 'G'], 4);
  fieldCard(s, 'food', 'token_food');
  if (pres) { fieldCreature(s, 'a5', 'p2', 5, 5); fieldCreature(s, 'a4', 'p2', 4, 4); }
  show(`L19b-food-life12-pres-${pres}`, 'activate_ability(food', s, { limit: 3 });
}
// L22b: Soulmender przy ZADEKLAROWANYM ataku 2/2 (neededToBlock istnieje?)
{
  const s = newState(); fillLibrary(s); setLife(s, 20);
  fieldCard(s, 'sm', 'soulmender');
  fieldCreature(s, 'atk', 'p2', 2, 2);
  s.combat = { attackingPlayerId: 'p2', attackers: [{ id: 'atk' }], blockers: [] };
  show('L22b-soulmender-declared-attack', 'activate_ability(sm', s, { limit: 3 });
}
// L22: Soulmender main1 przy wrogu 2/2 untapped (H10: strzela mimo bloku?)
{
  const s = newState(); fillLibrary(s); setLife(s, 20);
  fieldCard(s, 'sm', 'soulmender');
  fieldCreature(s, 'atk', 'p2', 2, 2);
  show('L22-soulmender-threat-main1', 'activate_ability(sm', s, { limit: 3 });
}
// L24: Healer/Paladin rzut przy zyciu 20 vs 5 (H5: ETB slepe na zycie?)
for (const life of [20, 5]) {
  const s = newState(); fillLibrary(s); setLife(s, life); addBasics(s, ['G'], 6); handCard(s, 'k', 'healer-of-the-glade');
  show(`L24a-healer-life${life}`, 'cast_permanent(k', s, { limit: 3 });
  const t = newState(); fillLibrary(t); setLife(t, life); addBasics(t, ['G'], 7); handCard(t, 'k', 'spinewoods-paladin');
  show(`L24b-paladin-life${life}`, 'cast_permanent(k', t, { limit: 3 });
}
// L26: Scroll {1}sac:draw1+Angel?gain5, z Aniolem vs bez, zycie 20 vs 5 (conditional-gain?)
for (const angel of [false, true]) {
  for (const life of [20, 5]) {
    const s = newState(); fillLibrary(s); setLife(s, life); addBasics(s, ['W'], 4);
    fieldCard(s, 'scr', 'scroll-of-avacyn');
    if (angel) fieldCreature(s, 'ang', 'p1', 4, 4, { subtypes: ['Angel'] });
    show(`L26-scroll-angel${angel}-life${life}`, 'activate_ability(scr', s, { limit: 3 });
  }
}
// L21: Skymarch ETB-drain (tabela: lose-miss + gain-2?)
{
  const s = newState(); fillLibrary(s); setLife(s, 20); addBasics(s, ['B'], 5); handCard(s, 'sk', 'skymarch-bloodletter');
  fieldCreature(s, 'wrog', 'p2', 2, 2);
  show('L21-skymarch-cast', 'cast_permanent(sk', s, { limit: 3 });
}
console.log(`\nScenariuszy: ${n}`);
