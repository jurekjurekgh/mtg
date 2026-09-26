#!/usr/bin/env node
// PMSSB-7 krok-2: sonda domknięcia hold (inert × puste scenariusze + self-harm).
// SKIP = brak nosiciela w katalogu (udokumentowane, nie blokuje).
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REG = createCardRegistry();
const mk = () => {
  const s = createGameState({ seed: 42, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main', 'p1');
  s.turn.activePlayerId = 'p1'; s.turn.priorityPlayerId = 'p1';
  addMana(s, 'p1', 14); return s;
};
const put = (s, id, cid, ctl, zone) => {
  const d = REG.get(cid);
  addObject(s, { id, instanceId: 'i-' + id, cardId: cid, controllerId: ctl, ownerId: ctl, zone, ...gameObjectDataOf(d) });
};
const probe = (s, label, match) => {
  const v = playerView(s, 'p1');
  const b = createHeuristicBot({ seed: 9 });
  const ch = b.chooseCommand(v);
  const opts = b.trace().at(-1).options.filter((o) => o.cmd.includes(match))
    .map((o) => o.score.toFixed(1) + ' ' + o.cmd).join(' | ') || '(brak oferty)';
  console.log(label, '→', ch.type, '|', opts);
};
const mine22 = (s) => addObject(s, { id: 'mine', instanceId: 'i-mine', cardId: 'x', controllerId: 'p1', ownerId: 'p1', zone: 'battlefield', kind: 'creature', power: 2, toughness: 2, manaCost: 2, abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [], cardName: 'mine' });

let s = mk(); put(s, 'fl', 'flurry-of-wings', 'p1', 'hand');
probe(s, 'S01 flurry-main-bez-ataku', 'cast_spell(fl');
s = mk(); put(s, 'hw', 'howl-of-the-night-pack', 'p1', 'hand');
probe(s, 'S02 howl-bez-ziemi', 'cast_spell(hw');
s = mk(); put(s, 'tp', 'your-temple-is-under-attack', 'p1', 'hand');
probe(s, 'S03 temple-bez-stworow', 'cast_spell(tp');
s = mk(); put(s, 'sp', 'spare-from-evil', 'p1', 'hand');
probe(s, 'S04 spare-bez-stworow', 'cast_spell(sp');
s = mk(); put(s, 'sv', 'sagittars-volley', 'p1', 'hand');
probe(s, 'S05 volley-bez-flying-wroga', 'cast_spell(sv');
s = mk(); put(s, 'wf', 'wrap-in-flames', 'p1', 'hand');
probe(s, 'S08 wrap-pusty-stol', 'cast_spell(wf');
s = mk(); put(s, 'fb', 'fireball', 'p1', 'hand');
probe(s, 'S10 fireball-X(legal?)', 'cast_spell(fb');
s = mk(); put(s, 'hb', 'hysterical-blindness', 'p1', 'hand');
probe(s, 'S14 blindness-bez-stworow-wroga', 'cast_spell(hb');
s = mk(); put(s, 'lr', 'lunar-rejection', 'p1', 'hand'); mine22(s);
probe(s, 'S17 lunar-na-wlasnego-2/2', 'cast_spell(lr');
s = mk(); put(s, 'dv', 'divest', 'p1', 'hand'); put(s, 'f1', 'shock', 'p1', 'hand'); put(s, 'f2', 'shock', 'p1', 'hand');
probe(s, 'S18 divest-SELF+2friends (PRZED: +3)', 'cast_spell(dv');
// (samotny divest = -70 przez F-A2 (pusta ręka); dziura +3 wymaga kart w ręce)
s = mk(); put(s, 'fa', 'force-away', 'p1', 'hand');
addObject(s, { id: 'mine', instanceId: 'i-m', cardId: 'x', controllerId: 'p1', ownerId: 'p1', zone: 'battlefield', kind: 'creature', power: 2, toughness: 2, manaCost: 2, abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [], cardName: 'mine' });
probe(s, 'S17b force-away-na-wlasnego-2/2', 'cast_spell(fa');
console.log('SKIP S06 scry-cast: brak czystego nosiciela (rage mieszany; M126 to ability, pin gdzie indziej)');
console.log('SKIP S07 reanimate: brak nosiciela-spell (ability-only)');
console.log('SKIP S09 mill-0 / S11 counter-0 / S16 poison-self / S13 buff-lands: brak nosicieli (martwe przypadki → forward)');
console.log('SKIP S12 multicolored: ability-only (Dragon Arch)');
console.log('SKIP S15 lose-life-self: feed-the-infection to NET mieszany (draw-2 za 3 życia, dodatni słusznie)');
