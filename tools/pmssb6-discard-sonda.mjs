// PMSSB-6 krok-1: sonda PRZED rodziny discard foe-side (13 nosicieli).
// Uruchomienie: node tools/pmssb6-discard-sonda.mjs [filtr]
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REG = createCardRegistry();
const FILTER = process.argv[2] ?? '';
let n = 0;

function newState() {
  const state = createGameState({ seed: 42, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.number = 5;
  addMana(state, 'p1', 12);
  return state;
}
function handCard(state, id, cardId, controllerId = 'p1') {
  const def = REG.get(cardId);
  addObject(state, { id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone: 'hand', ...gameObjectDataOf(def) });
}
function foeHand(state, cardIds) {
  cardIds.forEach((cid, i) => handCard(state, `fh${i}`, cid, 'p2'));
}
function fieldCard(state, id, cardId, controllerId = 'p1') {
  const def = REG.get(cardId);
  addObject(state, { id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone: 'battlefield', ...gameObjectDataOf(def) });
}
function fillLibrary(state, nSelf = 10, nFoe = 10) {
  for (let i = 0; i < nSelf; i += 1) addObject(state, { id: `libS${i}`, instanceId: `i-libS${i}`, cardId: `x-libS${i}`, controllerId: 'p1', zone: 'library', kind: 'creature', power: 0, toughness: 0, manaCost: 2, abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [], cardName: `libS${i}` });
  for (let i = 0; i < nFoe; i += 1) addObject(state, { id: `libF${i}`, instanceId: `i-libF${i}`, cardId: `x-libF${i}`, controllerId: 'p2', zone: 'library', kind: 'creature', power: 0, toughness: 0, manaCost: 2, abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [], cardName: `libF${i}` });
}
function foeCreature(state, id = 'wrog') {
  addObject(state, { id, instanceId: `i-${id}`, cardId: `x-${id}`, controllerId: 'p2', ownerId: 'p2', zone: 'battlefield', kind: 'creature', power: 2, toughness: 2, manaCost: 2, abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [], cardName: id });
}
function scoreAll(state) {
  const view = playerView(state, 'p1');
  const bot = createHeuristicBot({ seed: 9 });
  const chosen = bot.chooseCommand(view);
  return { chosen, options: bot.trace().at(-1).options, view };
}
function show(name, match, state, { limit = 8 } = {}) {
  if (FILTER && !name.includes(FILTER)) return;
  n += 1;
  const { chosen, options } = scoreAll(state);
  console.log(`--- ${name} (ofert: ${options.length}, wybrano: ${chosen.type})`);
  const rows = options.filter((o) => o.cmd.includes(match));
  if (!rows.length) console.log('    BRAK OFERT PASUJACYCH DO ' + match);
  for (const o of rows.slice(0, limit)) console.log(`    ${o.score.toFixed(4).padStart(10)}  ${o.cmd}`);
}

// D00: co bot WIDZI z reki wroga (cardId jawne czy zakryte)? — rozstrzyga H2b.
if (!FILTER || 'D00'.includes(FILTER)) {
  const s = newState(); foeHand(s, ['shock', 'basic-island', 'basic-island']);
  const { view } = scoreAll(s);
  const foe = (view.zones.hand ?? []).filter((o) => o.controllerId === 'p2');
  console.log('--- D00-foe-hand-view (kart: ' + foe.length + '): ' + JSON.stringify(foe.map((o) => ({ id: o.cardId, name: o.cardName, types: o.types }))));
  n += 1;
}
// D01: 5 czarodziej vs reka-3 — prognoza: wszystkie 50 (toll = 50 + amass?) (H1/H9)
for (const id of ['divest', 'dreams-of-steel-and-oil', 'mindstab', 'nightsnare', 'toll-of-the-invasion']) {
  const s = newState(); handCard(s, 'rip', id); foeHand(s, ['shock', 'twiddle', 'fireball']);
  show(`D01-cast-${id}`, 'cast_spell(rip', s, { limit: 3 });
}
// D02: 5 czarodziej vs PUSTA reka — prognoza: wszystkie 50 (slepota-na-liczbe! H2a)
for (const id of ['divest', 'dreams-of-steel-and-oil', 'mindstab', 'nightsnare', 'toll-of-the-invasion']) {
  const s = newState(); handCard(s, 'rip', id);
  show(`D02-empty-${id}`, 'cast_spell(rip', s, { limit: 3 });
}
// D03: divest vs same-landy (3x island) — prognoza: 50 (widok zakrywa? H2b)
{
  const s = newState(); handCard(s, 'rip', 'divest'); foeHand(s, ['basic-island', 'basic-island', 'basic-island']);
  show('D03-divest-vs-all-land', 'cast_spell(rip', s, { limit: 3 });
}
// D04: hecteyes (ETB discard_each) — prognoza: cialo + 3 (H6)
{
  const s = newState(); handCard(s, 'he', 'hecteyes');
  show('D04-hecteyes-cast', 'cast_permanent(he', s, { limit: 2 });
}
// D05: dementia-bat-aktywacja ({5}+sac: discard-2) — pomiar (H5)
{
  const s = newState(); fieldCard(s, 'bat', 'dementia-bat'); foeHand(s, ['shock', 'twiddle', 'fireball']);
  show('D05-bat-activation', 'activate_ability(bat', s, { limit: 3 });
}
// D06: skullcairn-aktywacja (dmg-3 + discard-1) — pomiar (H5)
{
  const s = newState(); fieldCard(s, 'sk', 'immersturm-skullcairn'); foeHand(s, ['shock', 'twiddle']); foeCreature(s);
  show('D06-skullcairn-activation', 'activate_ability(sk', s, { limit: 4 });
}
// D05b: bat vs PUSTA reka — prognoza: +2 (slepota-fizzle jak cast!) (H2a)
// D06b: skullcairn vs PUSTA reka — prognoza: -58 (stabilne) (H2a)
{
  const s = newState(); fieldCard(s, 'bat', 'dementia-bat');
  show('D05b-bat-empty', 'activate_ability(bat', s, { limit: 3 });
}
{
  const s = newState(); fieldCard(s, 'sk', 'immersturm-skullcairn'); foeCreature(s);
  show('D06b-skullcairn-empty', 'activate_ability(sk#1', s, { limit: 3 });
}
// D07a: scholar-aktywacja (tap: loot) — pomiar (H7)
{
  const s = newState(); fillLibrary(s); fieldCard(s, 'sc', 'civilized-scholar');
  handCard(s, 'c1', 'shock'); handCard(s, 'c2', 'twiddle');
  show('D07a-scholar-loot', 'activate_ability(sc', s, { limit: 3 });
}
// D07b: fisher-rzut (ETB: loot) — pomiar (H7)
{
  const s = newState(); fillLibrary(s); handCard(s, 'fi', 'quicksilver-fisher');
  handCard(s, 'c1', 'shock'); handCard(s, 'c2', 'twiddle');
  show('D07b-fisher-cast', 'cast_permanent(fi', s, { limit: 2 });
}
// D12: self-target (lustro selfHarmPenalty) — prognoza: divest +3, mindstab -1
for (const id of ['divest', 'mindstab', 'nightsnare']) {
  const s = newState(); handCard(s, 'rip', id); foeHand(s, ['shock', 'twiddle', 'fireball']);
  handCard(s, 'c1', 'shock'); handCard(s, 'c2', 'twiddle');
  show(`D12-self-${id}`, 'cast_spell(rip', s, { limit: 4 });
}
// D15: skala rozmiaru reki (divest vs 1 vs 7 kart) — prognoza: 50 == 50 (H4b)
for (const k of [1, 7]) {
  const s = newState(); handCard(s, 'rip', 'divest');
  foeHand(s, Array.from({ length: k }, (_, i) => ['shock', 'twiddle', 'fireball'][i % 3]));
  show(`D15-hand-size-${k}`, 'cast_spell(rip->p2', s, { limit: 2 });
}
// D16: toll vs PUSTA reka (sam amass!) — pomiar (H9b)
{
  const s = newState(); handCard(s, 'rip', 'toll-of-the-invasion');
  show('D16-toll-empty', 'cast_spell(rip', s, { limit: 3 });
}
console.log(`\nsony: ${n}`);
