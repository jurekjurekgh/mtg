// AUDYT PR #120 / A4 (2026-09-15) — port znaleziska z niezależnego audytu
// PR #122 (sesja arena/01a0a506) do napraw w PR #121.
//
// Zgłoszenie B (PR #120, Spare from Evil {1}{W}, protection from non-Human
// creatures): okno „po blokach" obejmowało end_of_combat. To krok, w którym
// obrażenia bojowe są JUŻ rozdane (CR 510.2 — rozdawane jednocześnie w kroku
// combat_damage, bez okna na zaklęcia między przydzieleniem a rozdaniem;
// CR 511.1 — end_of_combat ma tylko priorytet), a ochrona prewenuje wyłącznie
// obrażenia JESZCZE NIEzadane (CR 702.16 DEBT). Ochrona kupiona w
// end_of_combat nie prewenuje niczego z tej walki, a wycena dawała +35
// („chroni przed lethal") → bot palił kartę i manę bez efektu (klasa oś 4:
// oferta bez skutku).
//
// Reguła pinowana: okno „po blokach" = declare_blockers i combat_damage —
// okno priorytetu PO BLOKACH (CR 509.2: „Second, the active player gets
// priority."; silnik skacze declare_blockers→combat_damage, M172/C);
// przydział i rozdanie dzieją się razem w resolve_combat (CR 510.1+510.2,
// bez okna na czary pomiędzy). Anty-over-fix: w oknie bot NADAL
// preparuje ochronę przed lethal (50+35=85 > pass).
// (Cytat sprostowany G1 w audycie PR #121: wcześniej „CR 510.1" — 510.1 to
// przydział, nie priorytet; priorytet przed rozdaniem daje 509.2.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();
const SPARE_LABEL = 'cast_spell(spare->)';

function game(step) {
  const s = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, step, 'p2'); // aktywny = atakujący p2
  s.turn.activePlayerId = 'p2';
  s.turn.priorityPlayerId = 'p1'; // my (obrońca) mamy priorytet
  for (const p of s.players) p.life = 20;
  // Nie-Człowiek 2/1 atakuje, mój Człowiek 2/2 blokuje — bez ochrony to
  // lethal (2 ≥ 2), z ochroną obrażenia od Goblina = 0 → „saves".
  addObject(s, {
    id: 'atk', instanceId: 'i-atk', cardId: 'test-atk', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', kind: 'creature', power: 2, toughness: 1,
    types: ['Creature'], subtypes: ['Goblin'], abilities: [], keywords: [], colors: ['R'],
  });
  addObject(s, {
    id: 'blk', instanceId: 'i-blk', cardId: 'test-blk', controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', kind: 'creature', power: 2, toughness: 2,
    types: ['Creature'], subtypes: ['Human'], abilities: [], keywords: [], colors: ['W'],
  });
  const def = REGISTRY.get('spare-from-evil');
  assert.ok(def, 'spare-from-evil w rejestrze');
  addObject(s, {
    id: 'spare', instanceId: 'i-spare', cardId: 'spare-from-evil', controllerId: 'p1', ownerId: 'p1',
    zone: 'hand', ...gameObjectDataOf(def), types: def.types ?? [], subtypes: def.subtypes ?? [],
    spell: def.spell, abilities: def.abilities ?? [], keywords: def.keywords ?? [],
  });
  addMana(s, 'p1', 2, { colors: ['W'] });
  s.combat = {
    attackingPlayerId: 'p2', defendingPlayerId: 'p1',
    attackers: ['atk'], blockers: new Map([['atk', ['blk']]]),
    blockedAttackers: new Set(['atk']), declared: true,
  };
  return s;
}

function spareOption(s) {
  const view = playerView(s, 'p1');
  assert.ok(view.legalCommands.some((c) => c.type === 'cast_spell'), 'rzut Spare dostępny');
  const bot = createHeuristicBot({ seed: 3 });
  const cmd = bot.chooseCommand(view, {});
  const options = Object.fromEntries(bot.trace().at(-1).options.map((o) => [o.cmd, o.score]));
  assert.ok(SPARE_LABEL in options, 'Spare w śladzie wyceny');
  return { cmd, score: options[SPARE_LABEL], options };
}

test('A4/#122: w oknie po blokach (declare_blockers) bot preparuje Spare przed lethal (anty-over-fix)', () => {
  const { score } = spareOption(game('declare_blockers'));
  assert.ok(score > 0, `okno poprawne: Spare musi mieć wartość (>0), jest ${score} (baza 50 + saves 35)`);
});

test('A4/#122: end_of_combat po rozdaniu obrażeń — wycena ujemna, bot nie pali karty', () => {
  const { cmd, score } = spareOption(game('end_of_combat'));
  assert.ok(score < 0, `end_of_combat poza oknem: kara −95 ma przebić bazę (oczekiwane −45), jest ${score}`);
  assert.notEqual(cmd.type, 'cast_spell', `bot nie może rzucić Spare po obrażeniach (wybrał: ${JSON.stringify(cmd)})`);
});

test('A4/#122: combat_damage przed pasem aktywnego — nadal okno (obrona w kroku obrażeń)', () => {
  const { score } = spareOption(game('combat_damage'));
  assert.ok(score > 0, `combat_damage (priorytet przed rozdaniem, CR 510.1): Spare ma wartość, jest ${score}`);
});
