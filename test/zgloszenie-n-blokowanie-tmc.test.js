import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { attachEquipmentToCreature } from '../src/engine/attachments.js';

// Zgłoszenie N (właściciel, 2026-11-07): „Atakuję kreaturą 1/1. Bot nie jest
// pod presją (ma 20 życia). Ma na stole kreaturę 3/1. Blokuje i obie giną.
// Czy to ma sens? Moja kreatura ma TMC 1, jego 3. Ta wymiana jest mało
// sensowna taktycznie. Raczej skłaniałbym się do nieblokowania jeśli wymiana
// dotyczy kreatury o wyższym TMC (wliczając w to aury i equipment). Chyba,
// że pod presją życia (<10)."
//
// Root cause: wycena bloku liczyła wartość ginącego blokera jako P+T
// (`blockerValueLost` w blockExchangeOf) — proxy, które wycenia CIAŁA, nie
// INWESTYCJĘ. Killing-bonus za małego atakującego + wchłonięte obrażenia
// regularnie biły koszt droższego blokera (pomiar: atakujący 2/2 TMC 2 vs
// bloker 3/1 TMC 3 → +3, blok!). Dokładne liczby właściciela (1/1 vs 3/1)
// dawały −1 — przechodziło tylko o włos, bez żadnej reguły za tym.
//
// Reguła (model właściciela): wymiana „w górę TMC" (suma TMC ginących
// blokerów > TMC atakującego, oba z aurami i equipmentem) pod presją ≥10
// życia i bez śmiertelnego ataku → kara cofająca nagrody wymiany; pass (albo
// wariant bez tej wymiany) wygrywa. Tokeny mają TMC 0 → chump tokenem
// pozostaje zawsze legalny (PMSSB-31: „po to ma te małe token kreatury").

const REGISTRY = createCardRegistry();

function put(state, id, cardId, controllerId, over = {}) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, zone: 'battlefield',
    kind: data.kind, power: over.power ?? data.power, toughness: over.toughness ?? data.toughness,
    manaCost: over.manaCost ?? data.manaCost, spell: data.spell, abilities: def.abilities ?? [],
    keywords: over.keywords ?? def.keywords ?? [], subtypes: def.subtypes ?? [], types: def.types ?? [],
    colors: data.colors ?? [], cardName: def.name, equipment: data.equipment ?? null,
    aura: data.aura ?? null, isToken: over.isToken ?? false,
  });
}

/** Gracz (p1) atakuje jednym stworem; zwraca stan w kroku deklaracji bloków. */
function attackPhase({ attacker = [1, 1, 1], blocker = [3, 1, 3], life = 20, blockerExtra = null } = {}) {
  const state = createGameState({ seed: 77, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  state.turn.number = 7;
  put(state, 'atk', 'dromoka-warrior', 'p1',
    { power: attacker[0], toughness: attacker[1], manaCost: attacker[2], keywords: [] });
  put(state, 'blo', 'dromoka-warrior', 'p2',
    { power: blocker[0], toughness: blocker[1], manaCost: blocker[2], keywords: [] });
  if (blockerExtra) {
    // Załącznik blokera (aura/equipment) — wchodzi do TMC po stronie właściciela.
    // `attachedTo` jest POZA kontraktem addObject (L21) — przypięcie helperem.
    put(state, 'extra', blockerExtra, 'p2');
    attachEquipmentToCreature(state, 'extra', 'blo');
  }
  state.players.find((p) => p.id === 'p2').life = life;
  const declaration = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'declare_attackers' && c.attackerIds?.includes('atk'));
  assert.ok(declaration, 'oferta deklaracji ataku');
  execute(state, declaration);
  for (const pid of ['p1', 'p2']) {
    const pass = playerView(state, pid).legalCommands.find((c) => c.type === 'pass_priority');
    if (pass) execute(state, pass);
  }
  return state;
}

function botBlocks(state) {
  const bot = createHeuristicBot({ seed: 77 });
  const cmd = bot.chooseCommand(playerView(state, 'p2'));
  return cmd.type === 'declare_blockers' ? cmd.assignments : {};
}

test('N/1: bez presji bot nie wymienia droższego blokera na tańszego atakującego', () => {
  // Klasa zgłoszenia (mierzalna przed fixem: +3 → blok): 2/2 TMC 2 vs 3/1 TMC 3.
  const bothDie = attackPhase({ attacker: [2, 2, 2], blocker: [3, 1, 3] });
  assert.deepEqual(botBlocks(bothDie), {}, '2/2 TMC2 ginie z 3/1 TMC3 — nieblokowanie');
  // Dokładne liczby właściciela: 1/1 TMC 1 vs 3/1 TMC 3 (przed fixem −1, o włos).
  const exact = attackPhase({ attacker: [1, 1, 1], blocker: [3, 1, 3] });
  assert.deepEqual(botBlocks(exact), {}, 'zgłoszenie wprost: 1/1 TMC1 vs 3/1 TMC3');
});

test('N/2: anty-over-fix — równa TMC i chump tokenem pozostają blokowane', () => {
  // Równo TMC (3 vs 3): wymiana fair, reguła właściciela jej nie zakazuje.
  const fair = attackPhase({ attacker: [3, 3, 3], blocker: [3, 2, 3] });
  assert.deepEqual(botBlocks(fair), { atk: ['blo'] }, 'równa wymiana TMC 3=3 blokowana');
  // Token TMC 0 chumpuje 3/3 TMC 3 (PMSSB-31 — małe tokeny są tarczą).
  const state = createGameState({ seed: 77, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  state.turn.number = 7;
  put(state, 'atk', 'dromoka-warrior', 'p1', { power: 3, toughness: 3, manaCost: 3, keywords: [] });
  put(state, 'blo', 'token_squirrel', 'p2', { manaCost: 0, isToken: true });
  const declaration = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'declare_attackers' && c.attackerIds?.includes('atk'));
  execute(state, declaration);
  for (const pid of ['p1', 'p2']) {
    const pass = playerView(state, pid).legalCommands.find((c) => c.type === 'pass_priority');
    if (pass) execute(state, pass);
  }
  assert.deepEqual(botBlocks(state), { atk: ['blo'] }, 'chump tokenem TMC 0 zawsze legalny');
});

test('N/3: presja życia (<10) — wymiana w górę TMC dozwolona', () => {
  const pressured = attackPhase({ attacker: [1, 1, 1], blocker: [3, 1, 3], life: 6 });
  assert.deepEqual(botBlocks(pressured), { atk: ['blo'] },
    'przy 6 życia blok 3/1 jest tempem, nie marnotrawstwem');
});

test('N/4: aury i equipment liczą się do TMC blokera', () => {
  // Ten sam bloker 3/2 TMC 3 vs atakujący 3/3 TMC 3 (obie giną):
  // goły — równa wymiana (blok); z equipmentem MV 2 (TMC 5 > 3) — w górę, bez bloku.
  const bare = attackPhase({ attacker: [3, 3, 3], blocker: [3, 2, 3] });
  assert.deepEqual(botBlocks(bare), { atk: ['blo'] }, 'kontrola: goły bloker TMC 3 blokuje');
  const equipped = attackPhase({ attacker: [3, 3, 3], blocker: [3, 2, 3], blockerExtra: 'thieves-tools' });
  assert.deepEqual(botBlocks(equipped), {}, 'equipment MV 2 podnosi TMC blokera do 5 — nieblokowanie');
});

test('N/5: atak śmiertelny — blok ratujący życie wygrywa mimo w górę TMC', () => {
  // Bot przy 2 życia: atak 2/2 (threat ≥ life) jest śmiertelny — jedyny blok
  // (3/1 TMC 3) zatrzymuje go. Ratunek życia (M146) jest ponad ekonomią TMC.
  const lethal = attackPhase({ attacker: [2, 2, 2], blocker: [3, 1, 3], life: 2 });
  assert.deepEqual(botBlocks(lethal), { atk: ['blo'] }, 'blok ratujący życie M146 nietknięty');
});
