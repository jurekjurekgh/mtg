// PMSSB-5 krok-1: sonda PRZED rodziny counter_spell* (7 kart).
// Uruchomienie: node tools/pmssb5-kontry-sonda.mjs [filtr]
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REG = createCardRegistry();
const FILTER = process.argv[2] ?? '';
let n = 0;

// Tura wroga (p2), priorytet bota (p1) — okno odpowiedzi na czar ze stosu.
function newState() {
  const state = createGameState({ seed: 42, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p1';
  state.turn.number = 5;
  addMana(state, 'p1', 9);
  return state;
}
function handCard(state, id, cardId) {
  const def = REG.get(cardId);
  addObject(state, { id, instanceId: `i-${id}`, cardId, controllerId: 'p1', zone: 'hand', ...gameObjectDataOf(def) });
}
function stackSpell(state, id, cardId, controllerId) {
  const def = REG.get(cardId);
  if (!def) throw new Error(`brak karty ${cardId}`);
  addObject(state, { id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone: 'stack', ...gameObjectDataOf(def) });
}
function foeLand(state, id, tapped) {
  const def = REG.get('basic-island');
  addObject(state, { id, instanceId: `i-${id}`, cardId: def.id, controllerId: 'p2', ownerId: 'p2', zone: 'battlefield', ...gameObjectDataOf(def) });
  if (tapped) state.objects.set(id, Object.freeze({ ...state.objects.get(id), tapped: true }));
}
function fieldArtifact(state, id, controllerId, mv) {
  addObject(state, { id, instanceId: `i-${id}`, cardId: `x-${id}`, controllerId, ownerId: controllerId, zone: 'battlefield', kind: 'artifact', power: 0, toughness: 0, manaCost: mv, abilities: [], keywords: [], subtypes: [], types: ['Artifact'], colors: [], cardName: id });
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
  if (!rows.length) console.log('    BRAK OFERT PASUJACYCH DO ' + match);
  for (const o of rows.slice(0, limit)) console.log(`    ${o.score.toFixed(4).padStart(10)}  ${o.cmd}`);
}

// K01: Negate we wrogi fireball (HIGH_IMPACT) — prognoza: 50 (flat base, H1)
{
  const s = newState(); handCard(s, 'ng', 'negate'); stackSpell(s, 'fb', 'fireball', 'p2');
  show('K01-negate-vs-impactful', 'cast_spell(ng', s, { limit: 3 });
}
// K02: Negate we wrogi Twiddle (trywialny MV1) — prognoza: -10 (hold M237/2, H2)
{
  const s = newState(); handCard(s, 'ng', 'negate'); stackSpell(s, 'tw', 'twiddle', 'p2');
  show('K02-negate-vs-trivial', 'cast_spell(ng', s, { limit: 3 });
}
// K02b: kontrola — Shock MV1 ale damage (HIGH_IMPACT) — prognoza: 50 (strzela)
{
  const s = newState(); handCard(s, 'ng', 'negate'); stackSpell(s, 'sh', 'shock', 'p2');
  show('K02b-negate-vs-shock-MV1', 'cast_spell(ng', s, { limit: 3 });
}
// K03: Negate we WLASNY czar — prognoza: -90 twardo (M120)
{
  const s = newState(); handCard(s, 'ng', 'negate'); stackSpell(s, 'mine', 'shock', 'p1');
  show('K03-negate-vs-own', 'cast_spell(ng', s, { limit: 3 });
}
// K04: Stoic we wrogi fireball, bez i z metalcraftem — prognoza: 50 == 50 (znizka niewidzialna)
for (const mc of [0, 3]) {
  const s = newState(); handCard(s, 'st', 'stoic-rebuttal'); stackSpell(s, 'fb', 'fireball', 'p2');
  for (let i = 0; i < mc; i += 1) fieldArtifact(s, `art${i}`, 'p1', 2);
  show(`K04-stoic-mc${mc}`, 'cast_spell(st', s, { limit: 3 });
}
// K05a: Sabotage-kontra we wrogi czar-artefakt (talizman MV3) — prognoza: 50
{
  const s = newState(); handCard(s, 'sb', 'steel-sabotage'); stackSpell(s, 'pt', 'pristine-talisman', 'p2');
  show('K05a-sabotage-counter-mode', 'cast_spell(sb', s, { limit: 4 });
}
// K05b: Sabotage-bounce w artefakt na stole — pomiar wartosci trybu (H7)
{
  const s = newState(); handCard(s, 'sb', 'steel-sabotage'); fieldArtifact(s, 'art', 'p2', 3);
  show('K05b-sabotage-bounce-mode', 'cast_spell(sb', s, { limit: 4 });
}
// K05c: Sabotage a na stosie tylko fireball (nie-artefakt) — prognoza: BRAK OFERT
{
  const s = newState(); handCard(s, 'sb', 'steel-sabotage'); stackSpell(s, 'fb', 'fireball', 'p2');
  show('K05c-sabotage-no-target', 'cast_spell(sb', s, { limit: 4 });
}
// K06: Delusion vs fireball; platnik MOZE / NIE MOZE doplacic — prognoza: -40 / 50 (H4)
for (const [tag, tapped] of [['placi', false], ['tapped-out', true]]) {
  const s = newState(); handCard(s, 'dl', 'frightful-delusion'); stackSpell(s, 'fb', 'fireball', 'p2');
  foeLand(s, 'isl', tapped);
  show(`K06-delusion-${tag}`, 'cast_spell(dl', s, { limit: 3 });
}
// K07: strona platnika — ratowany 1-drop vs 7-drop — prognoza: 85/10 == 85/10 (flat, H5)
for (const [tag, id] of [['1drop', 'shock'], ['7drop', 'howl-of-the-night-pack']]) {
  const s = newState(); stackSpell(s, 'mine', id, 'p1');
  s.pendingCounterPay = { playerId: 'p1', targetId: 'mine', amount: 1, sourceId: 'x', discardCount: 1 };
  show(`K07-payer-${tag}`, 'resolve_counter_pay_choice', s, { limit: 4 });
}
// K08: Fuel vs fireball — prognoza: 50 (proliferate = 0, H6)
{
  const s = newState(); handCard(s, 'ff', 'fuel-for-the-cause'); stackSpell(s, 'fb', 'fireball', 'p2');
  show('K08-fuel-rider-zero', 'cast_spell(ff', s, { limit: 3 });
}
// K09: Abstruse vs fireball; platnik tapped-out (token!) i placi — pomiar (H6)
for (const [tag, tapped] of [['tapped-out', true], ['placi', false]]) {
  const s = newState(); handCard(s, 'ab', 'abstruse-interference'); stackSpell(s, 'fb', 'fireball', 'p2');
  foeLand(s, 'isl', tapped);
  show(`K09-abstruse-${tag}`, 'cast_spell(ab', s, { limit: 3 });
}
// K10: luki HIGH_IMPACT (MV<3, typ spoza zbioru) — prognoza: WSZYSTKIE -10 (trzyma!, H3)
for (const id of ['divest', 'divine-offering', 'unearth', 'forced-landing', 'lilianas-triumph', 'dreams-of-steel-and-oil']) {
  const s = newState(); handCard(s, 'ng', 'negate'); stackSpell(s, 'foe', id, 'p2');
  show(`K10-hole-${id}`, 'cast_spell(ng', s, { limit: 2 });
}
// K11: wojna kontr — wrogi Negate na stosie celuje w moj czar — prognoza: 50 (strzela)
{
  const s = newState(); handCard(s, 'ng', 'negate'); stackSpell(s, 'mine', 'shock', 'p1'); stackSpell(s, 'fn', 'negate', 'p2');
  show('K11-counter-war', 'cast_spell(ng', s, { limit: 4 });
}
// K12: Negate a na stosie STWOR wroga (noncreature-only!) — prognoza: BRAK OFERT
{
  const s = newState(); handCard(s, 'ng', 'negate'); stackSpell(s, 'cr', 'rotting-legion', 'p2');
  show('K12-negate-vs-creature', 'cast_spell(ng', s, { limit: 4 });
}
// K13: dwa cele (fireball + twiddle) — prognoza: 50 vs -10 (wybor poprawny)
{
  const s = newState(); handCard(s, 'ng', 'negate'); stackSpell(s, 'fb', 'fireball', 'p2'); stackSpell(s, 'tw', 'twiddle', 'p2');
  show('K13-two-targets', 'cast_spell(ng', s, { limit: 4 });
}
console.log(`\nsony: ${n}`);
