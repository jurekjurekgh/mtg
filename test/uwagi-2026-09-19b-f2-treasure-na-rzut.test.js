// =============================================================================
// P7 (uwaga właściciela 2026-09-19b, F/2) — WYCENA bota: Skarb ma iść na rzut,
// który go ZWRACA (Marut), a nie na późniejszy tańszy czar.
//
// Log właściciela (precombat_main, gracz = Nieprzyjaciel):
//   … Zagrywa Marut → aktywuje Stirring Bard → aktywuje Treasure (poświęcony)
//   → Marut wchodzi na pole bitwy → „trigger bez efektu (nie było czego
//   wykonać)” → Zagrywa Scorch Spitter.
//
// Odtworzenie sceną (przed fixem): bot rzuca Maruta ZA LĄDY (stempel
// `manaFromTreasureSpent` = 0 → ETB tworzy 0 tokenów), a dopiero POTEM
// poświęca Skarb, którego mana finansuje Scorch Spittera. Tymczasem karta
// Marut zwraca każdą manę ze Skarbów wydaną na rzut (deskryptor `create_token`
// z `amount: 'mana_from_treasure_spent'`), a płatność i tak zużywa Skarb
// PIERWSZY (`spendMana`: treasure-first) — więc aktywacja Skarba PRZED rzutem
// jest darmowa, a aktywacja PO rzucie przepada. To błąd wyceny heurystycznej,
// nie płatności (właściciel: „bot rzucając Maruta powinien maksymalizować
// wykorzystanie Treasure Tokens, bo to free mana”).
// =============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createBattlefieldToken } from '../src/engine/tokens.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId, zone = 'battlefield') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  return state.objects.get(id);
}

function treasure(state, controllerId, extraColors = ['W', 'U', 'B', 'R', 'G']) {
  return createBattlefieldToken(state, controllerId, {
    cardId: 'token_treasure', name: 'Treasure', kind: 'artifact', colors: [],
    types: ['Artifact'], subtypes: ['Treasure'],
    abilities: [{
      type: 'activated', cost: { tap: true, sacrificeSelf: true },
      effect: { type: 'add_mana', amount: 1, colors: extraColors, fromTreasure: true },
    }],
  });
}

/** Scena z logu właściciela: 7 Plains + Mountain, ręka: Marut + Scorch Spitter. */
function logScene({ plains = 7, mountains = 1, treasures = 1, hand = ['marut', 'scorch-spitter'] } = {}) {
  const state = createGameState({ seed: 9, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  state.turn.number = 8;
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  for (let i = 0; i < plains; i += 1) put(state, `pl${i}`, 'basic-plains', 'p1');
  for (let i = 0; i < mountains; i += 1) put(state, `mt${i}`, 'basic-mountain', 'p1');
  hand.forEach((cardId, i) => put(state, `h${i}`, cardId, 'p1', 'hand'));
  for (let i = 0; i < treasures; i += 1) treasure(state, 'p1');
  put(state, 'foe', 'basic-island', 'p2');
  return state;
}

const treasuresOnBoard = (state) => [...state.objects.values()]
  .filter((o) => o.zone === 'battlefield' && o.cardId === 'token_treasure').length;
const onBoard = (state, cardId) => [...state.objects.values()]
  .some((o) => o.zone === 'battlefield' && o.cardId === cardId);

/** Pełna rozgrywka bota po jego komendach + rozstrzyganie stosu. */
function playStep(state, { botSeed = 5, maxCommands = 30 } = {}) {
  const bot = createHeuristicBot({ seed: botSeed, randomness: 0, registry: REGISTRY });
  const played = [];
  for (let i = 0; i < maxCommands && state.status === 'active'; i += 1) {
    if (state.zones.stack.length > 0) {
      const rv = playerView(state, state.turn.priorityPlayerId);
      const resolve = rv.legalCommands.find((c) => c.type.startsWith('resolve_'))
        ?? rv.legalCommands.find((c) => c.type === 'pass_priority');
      if (!resolve) break;
      assert.ok(execute(state, resolve).ok, 'rozstrzygnięcie stosu');
      continue;
    }
    const view = playerView(state, 'p1');
    const cmd = bot.chooseCommand(view);
    if (!cmd) break;
    const object = cmd.objectId ? state.objects.get(cmd.objectId) : null;
    played.push(`${cmd.type}:${object?.cardId ?? ''}`);
    const result = execute(state, cmd);
    assert.ok(result.ok, `komenda ${cmd.type} legalna`);
    if (cmd.type === 'pass_priority' && onBoard(state, 'marut') && onBoard(state, 'scorch-spitter')) break;
    if (cmd.type === 'pass_priority' && !onBoard(state, 'marut')) break;
  }
  return played;
}

test('F2/1: bot aktywuje Skarb PRZED rzutem Maruta — mana wraca jako token (scena z logu)', () => {
  const state = logScene();
  const played = playStep(state);
  const castIndex = played.indexOf('cast_permanent:marut');
  const activateIndex = played.indexOf('activate_ability:token_treasure');
  assert.ok(castIndex >= 0, `Marut zagrany (przebieg: ${played.join(' → ')})`);
  assert.ok(activateIndex >= 0, `Skarb aktywowany (przebieg: ${played.join(' → ')})`);
  assert.ok(activateIndex < castIndex,
    `Skarb musi być poświęcony PRZED rzutem Maruta (przebieg: ${played.join(' → ')})`);
  const cast = state.events.find((e) => e.type === 'permanent_cast' && e.object?.cardId === 'marut');
  assert.equal(cast.manaFromTreasureSpent, 1,
    'mana ze Skarba wydana NA RZUT Maruta — inaczej ETB tworzy 0 tokenów');
  // ETB „za każdą manę ze Skarbów wydaną na rzut": 1 sztuka = 1 nowy Skarb.
  assert.equal(treasuresOnBoard(state), 1, 'jeden Skarb wrócił na pole bitwy (koszt rzutu = 0)');
  assert.ok(onBoard(state, 'scorch-spitter'),
    'Scorch Spitter nadal zagrany w tej samej turze (manę daje nietknięty ląd albo zwrócony Skarb)');
});

test('F2/2: bez pokrycia w ofercie Maruta bot NIE poświęca Skarba (anty-over-fix)', () => {
  // 5 lądów + Skarb to za mało na {8} — nie ma czego „zwracać”, więc Skarb
  // musi zostać nietknięty (jego mana wyparowałaby w cleanupie, CR 500.4).
  const state = logScene({ plains: 5, mountains: 0, hand: ['marut'] });
  const view = playerView(state, 'p1');
  const bot = createHeuristicBot({ seed: 5, randomness: 0, registry: REGISTRY });
  const chosen = bot.chooseCommand(view);
  assert.notEqual(chosen?.type, 'activate_ability', 'brak aktywacji Skarba bez realnego rzutu');
  assert.equal(treasuresOnBoard(state), 1, 'Skarb nadal na polu bitwy');
});

test('F2/3: dwa Skarby — oba idą na Maruta („for each mana from a Treasure spent”)', () => {
  const state = logScene({ plains: 6, mountains: 1, treasures: 2, hand: ['marut'] });
  const played = playStep(state);
  const castIndex = played.indexOf('cast_permanent:marut');
  assert.ok(castIndex >= 0, `Marut zagrany (przebieg: ${played.join(' → ')})`);
  assert.equal(played.slice(0, castIndex).filter((p) => p === 'activate_ability:token_treasure').length, 2,
    `oba Skarby aktywowane przed rzutem (przebieg: ${played.join(' → ')})`);
  const cast = state.events.find((e) => e.type === 'permanent_cast' && e.object?.cardId === 'marut');
  assert.equal(cast.manaFromTreasureSpent, 2, 'dwie sztuki many ze Skarbów na rzut');
  assert.equal(treasuresOnBoard(state), 2, 'ETB zwrócił oba Skarby');
});

test('F2/4: karta bez deskryptora zwrotu nie zmienia zachowania bota (Skarb zostaje)', () => {
  // Cloak of the Bat nie zwraca Skarbów — z jednym lądem bot nie poświęca
  // Skarba „na” rzut, którego sam nie zrobi (kara M128 + brak zwrotu).
  const state = logScene({ plains: 1, mountains: 0, treasures: 1, hand: ['cloak-of-the-bat'] });
  const bot = createHeuristicBot({ seed: 5, randomness: 0, registry: REGISTRY });
  const chosen = bot.chooseCommand(playerView(state, 'p1'));
  assert.notEqual(chosen?.type, 'activate_ability', 'brak aktywacji Skarba pod kartę bez zwrotu');
  assert.equal(treasuresOnBoard(state), 1, 'Skarb nadal na polu bitwy');
});
