/**
 * PMSSB-22 — sonda PRZED: Insatiable Appetite (`sacrifice_food_choice`).
 *
 * Scenariusze wprost ze zgłoszenia właściciela (uwaga A, 2026-09-29):
 * trik bojowy TYLKO na własne stwory, TYLKO w oknie walki (atakujący po
 * deklaracji ataku / blokujący po deklaracji bloków) i TYLKO gdy +3/+3
 * zmienia wynik walki.
 *
 * Uruchomienie: node tools/pmssb22-insatiable-sonda.mjs
 */
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function putCard(state, id, cardId, controllerId, zone, extra = {}) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness, manaCost: data.manaCost,
    spell: data.spell, abilities: data.abilities ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], types: def.types ?? [], colors: data.colors ?? [],
    ...extra,
  });
  return state.objects.get(id);
}

function putCreature(state, id, controllerId, power, toughness, extra = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `x-${id}`, controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost: 2,
    types: ['Creature'], subtypes: [], colors: [], abilities: [], keywords: [], ...extra,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

function baseState(botId = 'p2') {
  const state = createGameState({ seed: 22, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', botId);
  state.turn.activePlayerId = botId;
  state.turn.priorityPlayerId = botId;
  addMana(state, botId, 10);
  for (let i = 0; i < 10; i++) putCard(state, `lib${i}`, 'highland-game', botId, 'library');
  return state;
}

/** Okno PO deklaracji bloków w MOJEJ turze (wzorzec PMSSB-15 `foeCombat`, lustro). */
function ownCombat(state, { attackers, blockers = new Map(), blockedAttackers = new Set() }) {
  state.turn = jumpToStep(state.turn, 'declare_blockers', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  state.combat = { attackingPlayerId: 'p2', attackers, blockers, blockedAttackers };
}

/** Okno PO deklaracji bloków w turze PRZECIWNIKA (dokładnie `foeCombat` z PMSSB-15). */
function foeCombat(state, { attackers, blockers = new Map(), blockedAttackers = new Set() }) {
  state.turn = jumpToStep(state.turn, 'declare_blockers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p2';
  state.combat = { attackingPlayerId: 'p1', attackers, blockers, blockedAttackers };
}

function decide(state, playerId = 'p2') {
  const bot = createHeuristicBot({ seed: 22 });
  const choice = bot.chooseCommand(playerView(state, playerId), {});
  const options = (bot.trace().at(-1)?.options ?? []).slice().sort((a, b) => b.score - a.score);
  return { choice, options };
}

function pokaz(nazwa, state, oczekiwane) {
  const { choice, options } = decide(state);
  const cast = options.filter((o) => o.cmd.startsWith('cast_spell(ia'));
  console.log(`\n=== ${nazwa}`);
  console.log(`    oczekiwane: ${oczekiwane}`);
  console.log(`    wybór bota: ${JSON.stringify(choice)}`);
  for (const o of cast) console.log(`      ${String(o.score.toFixed(1)).padStart(8)}  ${o.cmd}`);
  const pass = options.find((o) => o.cmd === 'pass_priority');
  if (pass) console.log(`      ${String(pass.score.toFixed(1)).padStart(8)}  pass_priority`);
  if (cast.length === 0) {
    console.log('      (brak ofert cast_spell(ia…) — wszystkie opcje:)');
    for (const o of options.slice(0, 8)) console.log(`      ${String(o.score.toFixed(1)).padStart(8)}  ${o.cmd}`);
  }
}

// --- S1: moja główna 1, brak walki — trik nie zdąży pomóc (M146/M96) ---
{
  const s = baseState();
  putCard(s, 'ia', 'insatiable-appetite', 'p2', 'hand');
  putCreature(s, 'mine', 'p2', 2, 2);
  pokaz('S1 moja main1, własny 2/2, BEZ walki', s, 'PASS (pump poza oknem = strata)');
}

// --- S2: po deklaracji atakujących, mój atakujący nieblokowany ---
{
  const s = baseState();
  putCard(s, 'ia', 'insatiable-appetite', 'p2', 'hand');
  putCreature(s, 'mine', 'p2', 2, 2);
  ownCombat(s, { attackers: ['mine'] });
  pokaz('S2 po deklaracji ataku: mój 2/2 nieblokowany (+3/+3 = 5 zamiast 2 w twarz)', s,
    'CAST na „mine” (więcej obrażeń przeciwnikowi)');
}

// --- S3: mój 1/1 zablokowany przez 5/5 — buff nie zmienia wyniku ---
{
  const s = baseState();
  putCard(s, 'ia', 'insatiable-appetite', 'p2', 'hand');
  putCreature(s, 'mine', 'p2', 1, 1);
  putCreature(s, 'foe', 'p1', 5, 5);
  ownCombat(s, { attackers: ['mine'], blockers: new Map([['mine', ['foe']]]), blockedAttackers: new Set(['mine']) });
  pokaz('S3 mój 1/1 zablokowany przez 5/5 (+3/+3 = 4/4, nadal ginie i nie zabija)', s,
    'PASS (buff nie zmienia wyniku — kryterium właściciela)');
}

// --- S4: tura przeciwnika, po deklaracji bloków — mój bloker ratuje wymianę ---
{
  const s = baseState();
  putCard(s, 'ia', 'insatiable-appetite', 'p2', 'hand');
  putCreature(s, 'mine', 'p2', 1, 1);
  putCreature(s, 'foe', 'p1', 3, 3);
  foeCombat(s, { attackers: ['foe'], blockers: new Map([['foe', ['mine']]]), blockedAttackers: new Set(['foe']) });
  pokaz('S4 tura wroga, po blokach: mój 1/1 na jego 3/3 (+3/+3 = zabija i przeżywa)', s,
    'CAST na „mine” (lethal na kreaturze przeciwnika)');
}

// --- S5: ZGŁOSZENIE: tura Czarodziejki, jej kreatura ---
{
  const s = baseState();
  putCard(s, 'ia', 'insatiable-appetite', 'p2', 'hand');
  putCreature(s, 'hers', 'p1', 2, 2);
  putCreature(s, 'mine', 'p2', 2, 2);
  foeCombat(s, { attackers: ['hers'], blockers: new Map([['hers', ['mine']]]), blockedAttackers: new Set(['hers']) });
  pokaz('S5 tura Czarodziejki, jej 2/2 na stole (zgłoszenie: „rzuca w mojej turze na moją kreaturę”)', s,
    'NIGDY na „hers” — kara za wzmacnianie przeciwnika');
}

// --- S6: mój atakujący już zabija blokera — buff nic nie dodaje ---
{
  const s = baseState();
  putCard(s, 'ia', 'insatiable-appetite', 'p2', 'hand');
  putCreature(s, 'mine', 'p2', 4, 4);
  putCreature(s, 'foe', 'p1', 2, 2);
  ownCombat(s, { attackers: ['mine'], blockers: new Map([['mine', ['foe']]]), blockedAttackers: new Set(['mine']) });
  pokaz('S6 mój 4/4 zablokowany przez 2/2 (już zabija; +3/+3 to overkill)', s,
    'PASS (buff nie zmienia wyniku)');
}
