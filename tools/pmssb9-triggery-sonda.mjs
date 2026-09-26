#!/usr/bin/env node
// PMSSB-9 krok-2: sonda anticipacji triggerów non-ETB (PRZED: body-only?).
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
const fillLib = (s, n = 30) => {
  for (let i = 0; i < n; i++) addObject(s, { id: `lb${i}`, instanceId: `i-lb${i}`, cardId: `x-lb${i}`, controllerId: 'p1', zone: 'library', kind: 'sorcery', power: 0, toughness: 0, manaCost: 2, abilities: [], keywords: [], subtypes: [], types: ['Sorcery'], colors: [], cardName: `lb${i}` });
};
const probe = (s, label, match) => {
  const v = playerView(s, 'p1');
  const b = createHeuristicBot({ seed: 9 });
  const ch = b.chooseCommand(v);
  const opts = b.trace().at(-1).options.filter((o) => o.cmd.includes(match))
    .map((o) => o.score.toFixed(1) + ' ' + o.cmd).join(' | ') || '(brak oferty)';
  console.log(label, '→', ch.type, '|', opts);
};

let s = mk(); fillLib(s); put(s, 'pr', 'guildsworn-prowler', 'p1', 'hand');
probe(s, 'T01 prowler-cast', 'cast_permanent(pr');
s = mk(); fillLib(s); put(s, 'pk', 'goblin-piker', 'p1', 'hand');
probe(s, 'T01b piker-twin', 'cast_permanent(pk');
s = mk(); fillLib(s); put(s, 'hg', 'highland-game', 'p1', 'hand');
probe(s, 'T01c game-twin(dies-gain)', 'cast_permanent(hg');
s = mk(); fillLib(s); put(s, 'dd', 'doomed-dissenter', 'p1', 'hand');
probe(s, 'T02 dissenter-cast', 'cast_permanent(dd');
s = mk(); fillLib(s); put(s, 'pc', 'puppeteer-clique', 'p1', 'hand');
probe(s, 'T03 clique-cast', 'cast_permanent(pc');
s = mk(); fillLib(s); put(s, 'bf', 'delta-bloodflies', 'p1', 'hand');
probe(s, 'T04 bloodflies-cast', 'cast_permanent(bf');
s = mk(); fillLib(s); put(s, 'gc', 'gila-courser', 'p1', 'hand');
probe(s, 'T05 courser-cast', 'cast_permanent(gc');
s = mk(); fillLib(s); put(s, 'zo', 'zoraline', 'p1', 'hand');
probe(s, 'T06 zoraline-cast', 'cast_permanent(zo');
s = mk(); fillLib(s); put(s, 'go', 'grizzled-outcasts', 'p1', 'hand');
probe(s, 'T07 outcasts-cast', 'cast_permanent(go');
s = mk(); fillLib(s); put(s, 'fb', 'faceless-butcher', 'p1', 'hand');
probe(s, 'T08 butcher-cast', 'cast_permanent(fb');
s = mk(); fillLib(s); put(s, 'ox', 'emerald-oryx', 'p1', 'hand');
probe(s, 'T08b oryx-twin', 'cast_permanent(ox');
s = mk(); fillLib(s); put(s, 'st', 'scroll-thief', 'p1', 'hand');
probe(s, 'T09 scrollthief-cast', 'cast_permanent(st');
s = mk(); fillLib(s); put(s, 'af', 'angels-feather', 'p1', 'hand'); put(s, 'sp', 'shock', 'p1', 'hand');
probe(s, 'T10 feather+czerwony (kolor-miss → 0, poprawnie!)', 'cast_permanent(af');
s = mk(); fillLib(s); put(s, 'af', 'angels-feather', 'p1', 'hand');
probe(s, 'T10b feather-bez-spella', 'cast_permanent(af');
// (live-case imminent-gain (biały czar + W-mana) pokrywają piny PMSSB-4 — referencja.)
s = mk(); fillLib(s); put(s, 'gp', 'skyclave-geopede', 'p1', 'hand'); put(s, 'ln', 'rupture-spire', 'p1', 'hand');
probe(s, 'T10c geopede+land (kontrola-negatywna: licznik, nie gain)', 'cast_permanent(gp');
console.log('T11 survival-model: BRAK w bocie (grep survival/survive/diesThisTurn/removalRisk pusty)');
console.log('T12 modal-+5-ETB (4977/5119): picker reanimacji (premia za cel-ETB), nie anticipacja-cast');
