#!/usr/bin/env node
// PMSSB-8 krok-2: sonda loot-net-unification (combined-+6 vs split-+2 vs M67-5).
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REG = createCardRegistry();
const mk = (step = 'main', who = 'p1') => {
  const s = createGameState({ seed: 42, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, step, who);
  s.turn.activePlayerId = who; s.turn.priorityPlayerId = 'p1';
  addMana(s, 'p1', 14); return s;
};
const put = (s, id, cid, ctl, zone) => {
  const d = REG.get(cid);
  addObject(s, { id, instanceId: 'i-' + id, cardId: cid, controllerId: ctl, ownerId: ctl, zone, ...gameObjectDataOf(d) });
};
const stats = (cid) => { const d = REG.get(cid); return `${cid} MV${d.manaCost} ${d.power}/${d.toughness}`; };
const probe = (s, label, match) => {
  const v = playerView(s, 'p1');
  const b = createHeuristicBot({ seed: 9 });
  const ch = b.chooseCommand(v);
  const opts = b.trace().at(-1).options.filter((o) => o.cmd.includes(match))
    .map((o) => o.score.toFixed(1) + ' ' + o.cmd).join(' | ') || '(brak oferty)';
  console.log(label, '→', ch.type, '|', opts);
};
const fillLib = (s, n = 10) => {
  for (let i = 0; i < n; i++) addObject(s, { id: `lb${i}`, instanceId: `i-lb${i}`, cardId: `x-lb${i}`, controllerId: 'p1', zone: 'library', kind: 'sorcery', power: 0, toughness: 0, manaCost: 2, abilities: [], keywords: [], subtypes: [], types: ['Sorcery'], colors: [], cardName: `lb${i}` });
};

console.log('STATS:', stats('quicksilver-fisher'), '|', stats('evangel-of-synthesis'), '|', stats('civilized-scholar'), '|', stats('talions-messenger'), '|', stats('murder-of-crows'));
let s = mk(); fillLib(s); put(s, 'fi', 'quicksilver-fisher', 'p1', 'hand');
probe(s, 'L01 fisher-cast', 'cast_permanent(fi');
s = mk(); fillLib(s); put(s, 'ev', 'evangel-of-synthesis', 'p1', 'hand');
probe(s, 'L02 evangel-cast', 'cast_permanent(ev');
s = mk(); fillLib(s); put(s, 'sc', 'civilized-scholar', 'p1', 'battlefield');
probe(s, 'L03a scholar-tap-main', 'activate_ability(sc');
s = mk('end', 'p2'); fillLib(s); put(s, 'sc', 'civilized-scholar', 'p1', 'battlefield');
probe(s, 'L03b scholar-tap-EOTfoe', 'activate_ability(sc');
s = mk(); fillLib(s); put(s, 'tm', 'talions-messenger', 'p1', 'hand');
probe(s, 'L04 talions-cast', 'cast_permanent(tm');
s = mk(); fillLib(s); put(s, 'cr', 'murder-of-crows', 'p1', 'hand');
probe(s, 'L05a crows-cast', 'cast_permanent(cr');
// L05b/c: mayFire-choice wymaga stosu z triggerem — kształt w pinach (pendingOptionalEffects).
s = mk(); fillLib(s); put(s, 'fa', 'force-away', 'p1', 'hand');
addObject(s, { id: 'big', instanceId: 'i-big', cardId: 'x', controllerId: 'p1', ownerId: 'p1', zone: 'battlefield', kind: 'creature', power: 4, toughness: 4, manaCost: 4, abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [], cardName: 'big' });
addObject(s, { id: 'foe', instanceId: 'i-foe', cardId: 'x', controllerId: 'p2', ownerId: 'p2', zone: 'battlefield', kind: 'creature', power: 2, toughness: 2, manaCost: 2, abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [], cardName: 'foe' });
probe(s, 'L06 force-away-ferocious', 'cast_spell(fa');
s = mk(); fillLib(s); put(s, 'sc', 'civilized-scholar', 'p1', 'battlefield');
probe(s, 'L07 scholar-pusta-reka', 'activate_ability(sc');
s = mk(); fillLib(s); put(s, 'sc', 'civilized-scholar', 'p1', 'battlefield'); put(s, 'h1', 'shock', 'p1', 'hand');
probe(s, 'L08 scholar-1-karta', 'activate_ability(sc');
