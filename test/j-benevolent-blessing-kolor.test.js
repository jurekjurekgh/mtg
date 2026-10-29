// J (zgłoszenie właściciela 2026-10-29): „Karta Benevolent Blessing. Bot
// poprawnie nadaje flash protection tą kartą swojej blokującej kreaturze, ale
// wybiera kolor inny niż kolor kreatury, którą ta jego kreatura blokuje. Bez
// sensu. Kreatura bota ginie, aura idzie do piachu.”
//
// Root cause (L41): kolor ochrony dla aury `chooseColor` wybierała jedna
// heurystyka liczby wrogich stworów w kolorze (`5 + enemyInColor × 6`), a
// istniejąca gałąź „ratująca życie” (`lethalProtectionThreatColors`) pokrywała
// WYŁĄCZNIE przypadki, w których host i tak ginie. Gdy host przeżywał — a
// ochrona i tak zerwałaby obrażenia od blokowanego atakującego (CR 702.16) —
// bot brał kolor, którego na stole było najwięcej. Przy trzech czerwonych
// stworach wroga i blokowanym ZIELONYM atakującym wybierał {R}.
//
// Reguła (jedno miejsce, generyczna — ADR 0002): host aury, który bierze
// udział w walce, ma JEDNEGO realnego przeciwnika (blokowany atakujący albo
// blokerzy, którzy go blokują). Ochrona przed JEGO kolorem zatrzymuje jego
// obrażenia, więc kolor partnera bije każdy inny — wartość rośnie z mocą
// źródła (trample dopłaca, CR 702.19). Kolory spoza walki dostają gołą bazę 5,
// więc nie wyprzedzą partnera nawet przy szerokim stole wroga. Bez walki
// (aury w fazie głównej) zostaje dotychczasowa heurystyka — kotwica
// anty-over-fix.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();
const BOT = 'p1';
const FOE = 'p2';

function put(state, cardId, zone, id, controllerId, extra = {}) {
  const def = REGISTRY.get(cardId);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types, keywords: def.keywords ?? [],
    subtypes: def.subtypes, ...extra,
  });
  return state.objects.get(id);
}

function base(step = 'combat_damage') {
  const state = createGameState({ seed: 91, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, BOT);
  state.turn.activePlayerId = FOE;
  state.turn.priorityPlayerId = BOT;
  return state;
}

/** Aura w ręce + mana na nią (Benevolent Blessing to {1}{W} z flashem). */
function blessingInHand(state) {
  put(state, 'benevolent-blessing', 'hand', 'aura', BOT);
  addMana(state, BOT, 3, { colors: ['W'] });
}

/** Rzuca aurę i rozstrzyga stos — dopiero wtedy powstaje wybór koloru. */
function castBlessing(state, targetId) {
  const cast = execute(state, {
    type: 'cast_permanent', playerId: BOT, objectId: 'aura', targets: [targetId],
  });
  assert.ok(cast.ok, `rzut aury nie powiódł się: ${cast.reason ?? '?'}`);
  for (let i = 0; i < 6 && state.zones.stack.length > 0; i += 1) {
    execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  }
  assert.equal(state.pendingColorChoice?.purpose, 'protection', 'brak wyboru koloru ochrony');
  return state;
}

function chooseColor(state) {
  const bot = createHeuristicBot({ seed: 5 });
  const chosen = bot.chooseCommand(playerView(state, BOT));
  assert.equal(chosen?.type, 'resolve_color_choice', `bot nie wybrał koloru: ${chosen?.type}`);
  return chosen.color;
}

function scoreOf(state, color, params = undefined) {
  const bot = createHeuristicBot({ seed: 5, ...(params ? { params } : {}) });
  bot.chooseCommand(playerView(state, BOT));
  const options = bot.trace().at(-1)?.options ?? [];
  const found = options.find((option) => option.cmd === `resolve_color_choice(${color})`);
  assert.ok(found, `brak opcji ${color} w: ${options.map((option) => option.cmd).join(' | ')}`);
  return found.score;
}

/** Trzy CZERWONE stwory wroga poza walką — dokładnie ten „bias” ze zgłoszenia. */
function redBias(state) {
  put(state, 'goblin-piker', 'battlefield', 'red1', FOE);
  put(state, 'goblin-picker', 'battlefield', 'red2', FOE);
  put(state, 'forge-devil', 'battlefield', 'red3', FOE);
}

// ── J/1: sedno zgłoszenia — bloker przeżywa, wybór koloru ma iść za blokiem ──
test('J/1: blokowany atakujący jest ZIELONY, a na stole więcej CZERWONYCH stworów — ochrona {G}', () => {
  const state = base();
  put(state, 'leafcrown-dryad', 'battlefield', 'attacker', FOE); // G 2/2
  put(state, 'scorpion-sentinel', 'battlefield', 'blocker', BOT); // U 1/4 — przeżyje
  redBias(state);
  blessingInHand(state);
  state.combat = {
    attackers: ['attacker'], attackingPlayerId: FOE, defendingPlayerId: BOT,
    blockers: new Map([['attacker', ['blocker']]]),
    blockedAttackers: ['attacker'], unblockedAttackers: [], damageAssigned: false,
  };
  castBlessing(state, 'blocker');
  assert.equal(chooseColor(state), 'G', 'kolor blokowanego atakującego, nie najliczniejszy kolor wroga');
  assert.ok(scoreOf(state, 'G') > scoreOf(state, 'R'), 'G musi wyceniać się wyżej niż R');
});

// ── J/2: regresja — host ginie, ochrona ratuje życie (dotąd działało) ────────
test('J/2: bloker ginie od 5/5 — ochrona {G} (próg dobicia dalej wygrywa)', () => {
  const state = base();
  put(state, 'stampeding-elk-herd', 'battlefield', 'attacker', FOE); // G 5/5
  put(state, 'scorpion-sentinel', 'battlefield', 'blocker', BOT); // U 1/4
  redBias(state);
  blessingInHand(state);
  state.combat = {
    attackers: ['attacker'], attackingPlayerId: FOE, defendingPlayerId: BOT,
    blockers: new Map([['attacker', ['blocker']]]),
    blockedAttackers: ['attacker'], unblockedAttackers: [], damageAssigned: false,
  };
  castBlessing(state, 'blocker');
  assert.equal(chooseColor(state), 'G');
});

// ── J/3: symetria — host ATAKUJE i jest blokowany ───────────────────────────
test('J/3: host atakuje, blokuje go CZERWONY stwór, na stole dwa NIEBIESKIE — ochrona {R}', () => {
  const state = base();
  put(state, 'scorpion-sentinel', 'battlefield', 'attacker', BOT); // U 1/4 atakuje
  put(state, 'goblin-piker', 'battlefield', 'blocker', FOE); // R 2/1 blokuje
  put(state, 'emissary-escort', 'battlefield', 'blue1', FOE); // U 0/4 poza walką
  put(state, 'emissary-escort', 'battlefield', 'blue2', FOE);
  blessingInHand(state);
  state.combat = {
    attackers: ['attacker'], attackingPlayerId: BOT, defendingPlayerId: FOE,
    blockers: new Map([['attacker', ['blocker']]]),
    blockedAttackers: ['attacker'], unblockedAttackers: [], damageAssigned: false,
  };
  castBlessing(state, 'attacker');
  assert.equal(chooseColor(state), 'R');
});

// ── J/4: blok jeszcze niezadeklarowany, ale host może blokować ──────────────
test('J/4: krok declare_blockers — host może zablokować BIAŁEGO atakującego, ochrona {W}', () => {
  const state = base('declare_blockers');
  put(state, 'soulmender', 'battlefield', 'attacker', FOE); // W 1/1
  put(state, 'scorpion-sentinel', 'battlefield', 'host', BOT);
  redBias(state);
  blessingInHand(state);
  state.combat = {
    attackers: ['attacker'], attackingPlayerId: FOE, defendingPlayerId: BOT,
    blockers: new Map(), blockedAttackers: [], unblockedAttackers: ['attacker'],
    damageAssigned: false,
  };
  state.blockCandidates = { attacker: ['host'] };
  castBlessing(state, 'host');
  assert.equal(chooseColor(state), 'W');
});

// ── J/5: atakujący BEZ koloru — nie wymyślamy koloru partnera ───────────────
test('J/5: bezbarwny atakujący — wracamy do dotychczasowej heurystyki (najliczniejszy kolor)', () => {
  const state = base();
  put(state, 'marut', 'battlefield', 'attacker', FOE); // 7/7 bez koloru
  put(state, 'scorpion-sentinel', 'battlefield', 'host', BOT);
  redBias(state);
  blessingInHand(state);
  state.combat = {
    attackers: ['attacker'], attackingPlayerId: FOE, defendingPlayerId: BOT,
    blockers: new Map([['attacker', ['host']]]),
    blockedAttackers: ['attacker'], unblockedAttackers: [], damageAssigned: false,
  };
  castBlessing(state, 'host');
  assert.equal(chooseColor(state), 'R');
});

// ── J/6: kotwica anty-over-fix — aura poza walką ────────────────────────────
test('J/6: aura w fazie głównej (host nie walczy) — zostaje dawna heurystyka', () => {
  const state = base('main1');
  state.turn.activePlayerId = BOT;
  put(state, 'scorpion-sentinel', 'battlefield', 'host', BOT);
  redBias(state);
  put(state, 'emissary-escort', 'battlefield', 'blue1', FOE);
  blessingInHand(state);
  castBlessing(state, 'host');
  // 3 czerwone stwory → {R} = 5 + 3×6 = 23, {U} = 5 + 1×6 = 11.
  assert.equal(scoreOf(state, 'R'), 23);
  assert.equal(scoreOf(state, 'U'), 11);
  assert.equal(chooseColor(state), 'R');
});

// ── J/7: pokrętła, nie stałe w kodzie + brak wpływu na wybór many ───────────
test('J/7: ochrona w walce to pokrętła; cel `mana` (Manor Gate) bez zmian', () => {
  const state = base();
  put(state, 'leafcrown-dryad', 'battlefield', 'attacker', FOE);
  put(state, 'scorpion-sentinel', 'battlefield', 'blocker', BOT);
  blessingInHand(state);
  state.combat = {
    attackers: ['attacker'], attackingPlayerId: FOE, defendingPlayerId: BOT,
    blockers: new Map([['attacker', ['blocker']]]),
    blockedAttackers: ['attacker'], unblockedAttackers: [], damageAssigned: false,
  };
  castBlessing(state, 'blocker');
  // 2/2 → 40 + 2×2 = 44; po wyzerowaniu pokręteł kolor partnera spada do 0
  // i przegrywa z bazą 5, czyli pin realnie zależy od tych wag.
  assert.equal(scoreOf(state, 'G'), 44);
  assert.equal(scoreOf(state, 'W'), 5);
  const off = { colorProtectionCombatBonus: 0, colorProtectionCombatDamageWeight: 0 };
  assert.equal(scoreOf(state, 'G', off), 0);

  // Cel 'mana' (land z chooseColor) liczy się wyłącznie z potrzeby many.
  const mana = base('main1');
  mana.turn.activePlayerId = BOT;
  put(mana, 'basic-forest', 'battlefield', 'f1', BOT);
  put(mana, 'delta-bloodflies', 'hand', 'h0', BOT);
  mana.pendingColorChoice = { playerId: BOT, purpose: 'mana', sourceCardId: 'manor-gate' };
  assert.equal(scoreOf(mana, 'B'), 11, '5 + 1×6 — motyw many nietknięty');
  assert.equal(scoreOf(mana, 'R'), 5);
});
