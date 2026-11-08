import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { attachAuraToCreature } from '../src/engine/attachments.js';

// Zgłoszenie O (właściciel, 2026-11-07, Lich's Caress): „Bot używa jej
// przeciwko mojej kreaturze 1/1 o TMC 1 (token). To bez sensu. Marnuje silny
// czar na jakiś mój badziew. Nie jest pod presją życia (20). Proponowałbym
// trzymać takie czary (destroy, exile itp.) na kreatury o TMC (z przypiętymi
// aurami i equipment) przynajmniej o TMC 5 (koszt Lich's Caress). No chyba,
// że bot ma presję niskiego życia albo mało kart w bibliotece albo cel jest
// jakiś wyjątkowo zjadliwy (latanie gdy bot nie ma latania, protection
// przeciwko kolorom bota (ale nie kolorowi karty niszczącej), deathtouch
// itp.)."
//
// Reguła: twarde usuwanie z RĘKI (destroy/exile) jest trzymane, dopóki cel
// nie ma TMC (z aurami i equipmentem) ≥ TMC czaru — wyjątki: presja życia
// (<10, ta sama granica co N), deck-out (≤10 kart w bibliotece), cel
// zjadliwy (deathtouch / protekcja od kolorów moich stworów / ewazja, której
// moja plansza nie zablokuje). Bounce i zdolności aktywowane nie podlegają
// regule (nie wydają karty / mają własną ekonomikę zwrotu). Ochrona przed
// kolorem SAMEGO czaru (Protection) wyklucza cel z oferty już przez silnik
// (CR 702.16c).

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId, zone = 'battlefield', over = {}) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, zone,
    kind: data.kind, power: over.power ?? data.power, toughness: over.toughness ?? data.toughness,
    manaCost: over.manaCost ?? data.manaCost, spell: data.spell, abilities: def.abilities ?? [],
    keywords: over.keywords ?? def.keywords ?? [], subtypes: def.subtypes ?? [], types: def.types ?? [],
    colors: data.colors ?? [], cardName: def.name, equipment: data.equipment ?? null,
    aura: data.aura ?? null, isToken: over.isToken ?? false,
  });
}

/** Main 1 bota (p2): Lich's Caress w ręce, 5 zdrofich swapów, biblioteka 30. */
function game({ target = 'token_squirrel', targetOver = {}, life = 20, aura = null, library = 30 } = {}) {
  const state = createGameState({ seed: 88, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p2');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p2';
  state.turn.number = 6;
  put(state, 'cel', target, 'p1', 'battlefield', targetOver);
  if (aura) {
    put(state, 'aura', aura, 'p1');
    attachAuraToCreature(state, 'aura', 'cel');
  }
  put(state, 'caress', 'lichs-caress', 'p2', 'hand');
  for (let i = 0; i < 5; i++) put(state, `sw${i}`, 'basic-swamp', 'p2');
  for (let i = 0; i < library; i++) put(state, `lib${i}`, 'basic-swamp', 'p2', 'library');
  state.players.find((p) => p.id === 'p2').life = life;
  return state;
}

function botPlays(state) {
  const bot = createHeuristicBot({ seed: 88 });
  const cmd = bot.chooseCommand(playerView(state, 'p2'));
  return cmd.type === 'cast_spell' ? `cast:${cmd.targets?.[0] ?? ''}` : cmd.type;
}

test('O/1: bez presji bot TRZYMA Lich\'s Caress na token 1/1 (TMC 0 < 5)', () => {
  assert.equal(botPlays(game()), 'pass_priority',
    'zgłoszenie wprost: 20 życia, token — czar zostaje w ręce');
});

test('O/2: cel o TMC ≥ kosztu czaru (5) — czar leci', () => {
  assert.equal(botPlays(game({ target: 'dromoka-warrior', targetOver: { manaCost: 5, power: 3, toughness: 3 } })),
    'cast:cel', '3/3 TMC 5 jest warty 5-many removal');
});

test('O/3: presja życia (<10) — usuwanie tempa dozwolone mimo niskiego TMC', () => {
  assert.equal(botPlays(game({ life: 6 })), 'cast:cel',
    'przy 6 życia każdy stwór wroga to zegar');
});

test('O/4: cel zjadliwy (latający, bot bez blokerów w powietrzu) — usuwany mimo TMC', () => {
  assert.equal(botPlays(game({ target: 'token_thopter' })), 'cast:cel',
    'latanie bez odpowiedzi = wyjątek właściciela „itp."');
});

test('O/5: cel TMC 2 bez zjadliwości — trzymane (2 < 5)', () => {
  assert.equal(botPlays(game({ target: 'gorehorn-minotaurs', targetOver: { manaCost: 2 } })),
    'pass_priority', '3/3 za 2 to za tanio na 5-many czar');
});

test('O/6: aura celu liczy się do TMC (3 + aura MV 2 = 5)', () => {
  // 3/3 TMC 3 sam w sobie za tani; z Grounded (MV 2, bez zmian P/T) — TMC 5.
  assert.equal(botPlays(game({ target: 'dromoka-warrior', targetOver: { manaCost: 3, power: 3, toughness: 3 }, aura: 'grounded' })),
    'cast:cel', 'inwestycja w aurę podnosi TMC celu ponad próg czaru');
});

test('O/7: deck-out (mało kart w bibliotece) — trzymanie nie ratuje', () => {
  assert.equal(botPlays(game({ library: 10 })), 'cast:cel',
    'przy ≤10 kart trzymanie karty przegrywa z wyliczeniem biblioteki');
});
