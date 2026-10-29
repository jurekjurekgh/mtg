// PMSSB-8 Wave-A: loot-net-unification (combined-+6 → +2, parytet-cyclingu).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
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
const put = (s, id, cid, ctl = 'p1', zone = 'hand') => {
  const d = REG.get(cid);
  addObject(s, { id, instanceId: 'i-' + id, cardId: cid, controllerId: ctl, ownerId: ctl, zone, ...gameObjectDataOf(d) });
};
const fillLib = (s, n = 30) => {
  for (let i = 0; i < n; i++) addObject(s, { id: `lb${i}`, instanceId: `i-lb${i}`, cardId: `x-lb${i}`, controllerId: 'p1', zone: 'library', kind: 'sorcery', power: 0, toughness: 0, manaCost: 2, abilities: [], keywords: [], subtypes: [], types: ['Sorcery'], colors: [], cardName: `lb${i}` });
};
const decide = (s) => {
  const v = playerView(s, 'p1');
  const b = createHeuristicBot({ seed: 9 });
  const ch = b.chooseCommand(v);
  return { ch, opts: b.trace().at(-1).options };
};
const scoreOf = (opts, frag) => opts.find((o) => o.cmd.includes(frag))?.score;
const disp = (opts, frag) => Number(scoreOf(opts, frag).toFixed(1));

describe('PMSSB-8 Wave-A: loot-net-unification', () => {
  it('F-L1: scholar-tap-main = 4 (2 baza + 2 loot, było 8)', () => {
    const s = mk(); fillLib(s); put(s, 'sc', 'civilized-scholar', 'p1', 'battlefield');
    assert.equal(scoreOf(decide(s).opts, 'activate_ability(sc'), 4);
  });
  it('F-L1: scholar-tap-EOT-foe = 14 (2+2+10, było 18)', () => {
    const s = mk('end', 'p2'); fillLib(s); put(s, 'sc', 'civilized-scholar', 'p1', 'battlefield');
    assert.equal(scoreOf(decide(s).opts, 'activate_ability(sc'), 14);
  });
  it('F-L1: cycle {2} z 0 lądami = 33 (typecycling = wymiana karty na ląd, PMSSB-63/K)', () => {
    // ZMIANA ŚWIADOMA (PMSSB-63/K, L41): dawny pin „= 2” zakładał parytet z loot dla
    // każdego cyklingu. Swampcycling to wymiana karty na ląd — ta sama miara co
    // basic landcycling Kulratha: landKeepValue(znaleziony ląd) − cardKeepValue(oddany
    // 7-drop poza zasięgiem) = 30 − (−3) = 33 przy 0 lądach na stole.
    const s = mk(); fillLib(s, 10); put(s, 'gm', 'gloomfang-mauler');
    assert.equal(scoreOf(decide(s).opts, 'activate_ability(gm'), 33);
  });
  it('F-L1: cycle {2} przy 6 lądach = BRAK landcyklingu (bramka −5: ziem wystarczy, 7-drop zagra)', () => {
    const s = mk(); fillLib(s, 10); put(s, 'gm', 'gloomfang-mauler');
    for (let i = 0; i < 6; i++) put(s, `ld${i}`, 'basic-forest', 'p1', 'battlefield');
    assert.equal(scoreOf(decide(s).opts, 'activate_ability(gm'), -5);
  });
  it('F-L1: fisher-cast = 78.0 (PMSSB-64 latanie 4-mocy +6.9; noga −4 ×0.9)', () => {
    const s = mk(); fillLib(s); put(s, 'fi', 'quicksilver-fisher');
    assert.equal(disp(decide(s).opts, 'cast_permanent(fi'), 78.0);
  });
  it('F-L1: evangel-cast = 67.5 BEZ ZMIAN (split +2 już dobry)', () => {
    const s = mk(); fillLib(s); put(s, 'ev', 'evangel-of-synthesis');
    assert.equal(disp(decide(s).opts, 'cast_permanent(ev'), 67.5);
  });
  // G (2026-10-29): +12 — cel 2/2 za 2 many dostaje wymiar inwestycji
  // (TMC 2 × waga 6). Różnica ferocious/bez ferocious (−2 rider) bez zmian.
  it('F-L1b: force-away-ferocious = 96 (rider 5→2, było 87)', () => {
    const s = mk(); fillLib(s); put(s, 'fa', 'force-away');
    addObject(s, { id: 'big', instanceId: 'i-big', cardId: 'x', controllerId: 'p1', ownerId: 'p1', zone: 'battlefield', kind: 'creature', power: 4, toughness: 4, manaCost: 4, abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [], cardName: 'big' });
    addObject(s, { id: 'foe', instanceId: 'i-foe', cardId: 'x', controllerId: 'p2', ownerId: 'p2', zone: 'battlefield', kind: 'creature', power: 2, toughness: 2, manaCost: 2, abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [], cardName: 'foe' });
    assert.equal(scoreOf(decide(s).opts, 'cast_spell(fa->foe)'), 96);
  });
  it('F-L1b-guard: force-away-bez-ferocious = 94 (G: +12 inwestycji celu)', () => {
    const s = mk(); fillLib(s); put(s, 'fa', 'force-away');
    addObject(s, { id: 'mid', instanceId: 'i-mid', cardId: 'x', controllerId: 'p1', ownerId: 'p1', zone: 'battlefield', kind: 'creature', power: 3, toughness: 3, manaCost: 3, abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [], cardName: 'mid' });
    addObject(s, { id: 'foe', instanceId: 'i-foe', cardId: 'x', controllerId: 'p2', ownerId: 'p2', zone: 'battlefield', kind: 'creature', power: 2, toughness: 2, manaCost: 2, abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [], cardName: 'foe' });
    assert.equal(scoreOf(decide(s).opts, 'cast_spell(fa->foe)'), 94);
  });
  it('guard: crows-lib30 = 78.4 (PMSSB-64 latanie 4-mocy +6.9; PMSSB-10-B2: any_dies-loot +1.3!)', () => {
    const s = mk(); fillLib(s); put(s, 'cr', 'murder-of-crows');
    assert.equal(disp(decide(s).opts, 'cast_permanent(cr'), 78.4);
  });
  it('guard: talions-lib30 = 66.3 (future-trigger bez anticipacji; PMSSB-67/F5 (próg latania skalowany mocą): lot 1-mocowy −0.3)', () => {
    const s = mk(); fillLib(s); put(s, 'tm', 'talions-messenger');
    assert.equal(disp(decide(s).opts, 'cast_permanent(tm'), 66.3);
  });
  it('guard: scholar ignoruje rękę (pusta / 1 karta = 4)', () => {
    const a = mk(); fillLib(a); put(a, 'sc', 'civilized-scholar', 'p1', 'battlefield');
    assert.equal(scoreOf(decide(a).opts, 'activate_ability(sc'), 4);
    const b = mk(); fillLib(b); put(b, 'sc', 'civilized-scholar', 'p1', 'battlefield'); put(b, 'h1', 'shock');
    assert.equal(scoreOf(decide(b).opts, 'activate_ability(sc'), 4);
  });
});
