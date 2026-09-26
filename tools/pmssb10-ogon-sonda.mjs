#!/usr/bin/env node
// PMSSB-10 krok-2: sonda ogona-triggerów (PRZED: body-only?).
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
  b.chooseCommand(v);
  const opts = b.trace().at(-1).options.filter((o) => o.cmd.includes(match))
    .map((o) => o.score.toFixed(1) + ' ' + o.cmd).join(' | ') || '(brak oferty)';
  console.log(label, '|', opts);
};

let s;
for (const [id, cid, lab] of [
  ['kw', 'kappa-tech-wrecker', 'O01a wrecker'], ['st', 'scroll-thief', 'O01b scrollthief'],
  ['rr', 'relic-robber', 'O01c robber'], ['di', 'disa-the-restless', 'O01d disa'],
  ['cu', 'curiosity', 'O02 curiosity'], ['gj', 'goblin-battle-jester', 'O03 jester'],
  ['id', 'illusory-demon', 'O04 demon'], ['tg', 'tellah-great-sage', 'O05 tellah'],
  ['go', 'grizzled-outcasts', 'O06a outcasts'], ['mh', 'moonscarred-werewolf', 'O06b moonscarred'],
  ['cp', 'curse-of-the-pierced-heart', 'O07a curse'], ['fb', 'feedback', 'O07b feedback'],
  ['fb2', 'faceless-butcher', 'O08 butcher'], ['cb', 'canonized-in-blood', 'O09a canonized'],
  ['pr', 'plague-reaver', 'O09b reaver'], ['td', 'trostani-discordant', 'O09c trostani'],
  ['jy', 'jyoti-moag-ancient', 'O10a jyoti'], ['so', 'selhoff-occultist', 'O10b selhoff'],
  ['nh', 'nightshade-harvester', 'O10c harvester'], ['wb', 'willbender', 'O10d willbender'],
  ['bs', 'battle-rattle-shaman', 'O11 shaman'], ['tw', 'token_wizard', 'O12 token-wizard'],
]) {
  s = mk(); fillLib(s);
  try { put(s, id, cid, 'p1', 'hand'); probe(s, lab, 'cast_permanent(' + id); }
  catch (e) { console.log(lab, '| BLAD-KARTY:', e.message.slice(0, 60)); }
}
