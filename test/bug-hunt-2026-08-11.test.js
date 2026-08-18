import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { jumpToStep, initialTurn } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { queueSearchChoice } from '../src/engine/effects.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { createAggroBot } from '../src/controllers/aggro-bot.js';

// =============================================================================
// Polowanie na błędy 2026-08-11 (próba srebrnej odznaki) — behawioralnie, nie
// definicyjnie: każdy test odtwarza realny przebieg gry (jak bug-hunt-08-10).
//
// ZNALEZIONE BŁĘDY:
//  1) resolveCombatDamage używa `startPass = resume.pass` (boolean) jako
//     INDEKSU tablicy passes=[true,false] → `passes[true]` = `passes[1]` =
//     `false`. Wznowienie decyzji rozdzielania obrażeń stwora z first/double
//     strike POMIJA cały przebieg first strike (CR 510.4) — stwór z first
//     strike zablokowany wieloma blokerami albo z trample nie zadaje NIC
//     w pierwszym przebiegu (a w zwykłym przebiegu first strike nie zadaje —
//     CR 510.5). Realne karty: porcelain-legionnaire (3/1 FS), ainok-tracker.
//  2) Lifelink liczy obrażenia PRZED prewencją protection (CR 702.16d + 702.15):
//     w assignDamageToBlockers oraz w ścieżce bloker→atakujący w
//     processCombatPass kwota lifelink/deathtouch pochodzi z `dealt` sprzed
//     prewencji, którą robi dopiero `markDamage`. Gdy cel dostanie protection
//     od koloru źródła (osiągalne: aura z flash Benevolent Blessing po
//     deklaracji bloków), źródło z lifelink zyskuje życie za obrażenia, których
//     nie zadało (CR 702.15: tylko za FAKTYCZNIE zadane).
// =============================================================================

function game() {
  return createGameState({ seed: 1, players: [{ id: 'att' }, { id: 'def' }] });
}

function addCreature(state, id, controller, power, toughness, extra = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `card-${id}`, controllerId: controller,
    zone: 'battlefield', kind: 'creature', power, toughness,
    keywords: [], ...extra,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
}

function startCombat(state, attackers) {
  state.turn = jumpToStep({ ...initialTurn('att') }, 'declare_attackers', 'att');
  return execute(state, { type: 'declare_attackers', playerId: 'att', attackerIds: attackers });
}

function declareBlocks(state, assignments) {
  state.turn.priorityPlayerId = 'def';
  return execute(state, { type: 'declare_blockers', playerId: 'def', assignments });
}

function resolveCombat(state) {
  state.turn.priorityPlayerId = 'att';
  const r = execute(state, { type: 'resolve_combat', playerId: 'att', defendingPlayerId: 'def' });
  assert.ok(r.ok, 'resolve_combat: ' + (r.events?.[0]?.reason ?? ''));
  return r;
}

function life(state, id) {
  return state.players.find((p) => p.id === id).life;
}

// ---------------------------------------------------------------------------
// Błąd 1a: first strike + trample — pierwszy przebieg obrażeń NIE ginie
// ---------------------------------------------------------------------------
test('Sherlock 2026-08-11 1a: stwór z first strike + trample zadaje obrażenia w przebiegu first strike (CR 510.4)', () => {
  const state = game();
  addCreature(state, 'a', 'att', 3, 3, { keywords: ['first_strike', 'trample'] });
  addCreature(state, 'b', 'def', 2, 2);
  assert.ok(startCombat(state, ['a']).ok);
  assert.ok(declareBlocks(state, { a: ['b'] }).ok);
  const before = life(state, 'def');
  const r = resolveCombat(state); // kolejkuje decyzję rozdzielania (trample)
  assert.ok(state.pendingDamageAssignment, 'trample wymaga decyzji atakującego (CR 510.1c)');
  // Gracz przydziela lethal (2) blokerowi, resztę (1) z trample graczowi.
  const a = execute(state, {
    type: 'resolve_damage_assignment', playerId: 'att',
    assignments: { a: [{ blockerId: 'b', amount: 2 }] },
  });
  assert.ok(a.ok, 'rozdzielenie obrażeń: ' + (a.events?.[0]?.reason ?? ''));
  // Stwór z first strike zadaje WYŁĄCZNIE w pierwszym przebiegu (CR 510.4/510.5):
  // 2 (lethal) dla blokera + 1 trample dla gracza = pełna moc 3; bloker ginie,
  // a w drugim przebiegu first strike nie zadaje (brak double strike).
  assert.equal(life(state, 'def'), before - 1,
    'first strike zadaje lethal + trample w pierwszym przebiegu (CR 510.4); błąd: pierwszy przebieg pomijany');
  const b = state.objects.get('b');
  assert.ok(!b || b.zone !== 'battlefield', 'bloker 2/2 ginie od first strike (CR 702.4/510.4)');
});

// ---------------------------------------------------------------------------
// Błąd 1b: double strike + trample — oba przebiegi zadają
// ---------------------------------------------------------------------------
test('Sherlock 2026-08-11 1b: stwór z double strike + trample zadaje w OBA przebiegi (CR 702.4b/510.4)', () => {
  const state = game();
  addCreature(state, 'a', 'att', 3, 3, { keywords: ['double_strike', 'trample'] });
  addCreature(state, 'b', 'def', 2, 2);
  assert.ok(startCombat(state, ['a']).ok);
  assert.ok(declareBlocks(state, { a: ['b'] }).ok);
  const before = life(state, 'def');
  resolveCombat(state);
  assert.ok(state.pendingDamageAssignment, 'trample wymaga decyzji atakującego');
  const a = execute(state, {
    type: 'resolve_damage_assignment', playerId: 'att',
    assignments: { a: [{ blockerId: 'b', amount: 2 }] },
  });
  assert.ok(a.ok, 'rozdzielenie obrażeń: ' + (a.events?.[0]?.reason ?? ''));
  // Poprawnie: first strike 2 (bloker ginie)+1 trample; zwykły przebieg trample
  // 3. Gracz traci 4.
  assert.equal(life(state, 'def'), before - 4,
    'double strike zadaje w obu przebiegach (CR 702.4b); błąd: pierwszy przebieg pomijany');
});

// ---------------------------------------------------------------------------
// Błąd 1c: first strike zablokowany WIELOMA blokerami (bez trample) — też zadaje
// ---------------------------------------------------------------------------
test('Sherlock 2026-08-11 1c: first strike + wielu blokerów — przebieg first strike nie ginie (CR 510.1c/510.4)', () => {
  const state = game();
  addCreature(state, 'a', 'att', 4, 4, { keywords: ['first_strike'] });
  addCreature(state, 'b1', 'def', 1, 1);
  addCreature(state, 'b2', 'def', 1, 1);
  assert.ok(startCombat(state, ['a']).ok);
  assert.ok(declareBlocks(state, { a: ['b1', 'b2'] }).ok);
  resolveCombat(state);
  assert.ok(state.pendingDamageAssignment, 'wielu blokerów wymaga decyzji (CR 510.1c)');
  const a = execute(state, {
    type: 'resolve_damage_assignment', playerId: 'att',
    assignments: { a: [{ blockerId: 'b1', amount: 1 }, { blockerId: 'b2', amount: 1 }] },
  });
  assert.ok(a.ok, 'rozdzielenie: ' + (a.events?.[0]?.reason ?? ''));
  const b1 = state.objects.get('b1');
  const b2 = state.objects.get('b2');
  assert.ok((!b1 || b1.zone !== 'battlefield') && (!b2 || b2.zone !== 'battlefield'),
    'first strike 4/4 zabija oba 1/1 w pierwszym przebiegu (CR 510.4); błąd: przebieg pomijany');
});

// ---------------------------------------------------------------------------
// Błąd 2a: lifelink NIE zyskuje życia za obrażenia zapobiegnięte przez
// protection (ścieżka atakujący→bloker, CR 702.16d + 702.15)
// ---------------------------------------------------------------------------
test('Sherlock 2026-08-11 2a: lifelink atakującego = 0, gdy obrażenia zapobiegnięte protection blokera', () => {
  const state = game();
  addCreature(state, 'a', 'att', 2, 2, { keywords: ['lifelink'], colors: ['Black'] });
  addCreature(state, 'b', 'def', 2, 2, { colors: ['White'] });
  assert.ok(startCombat(state, ['a']).ok);
  assert.ok(declareBlocks(state, { a: ['b'] }).ok);
  // Simulujemy legalny efekt po deklaracji bloków: bloker dostaje protection
  // od koloru atakującego (Benevolent Blessing — aura z flash w kroku bloków).
  const b = state.objects.get('b');
  state.objects.set('b', Object.freeze({ ...b, protectionFromColors: ['Black'] }));
  const attLifeBefore = life(state, 'att');
  resolveCombat(state);
  assert.equal(life(state, 'att'), attLifeBefore,
    'obrażenia zapobiegnięte protection → lifelink daje 0 (CR 702.16d + 702.15); błąd: lifelink za zapobiegnięte');
  assert.equal(state.objects.get('b')?.zone, 'battlefield', 'bloker z protection przeżywa');
});

// ---------------------------------------------------------------------------
// Błąd 2b: lifelink blokera NIE zyskuje życia za obrażenia zapobiegnięte
// protection atakującego (ścieżka bloker→atakujący)
// ---------------------------------------------------------------------------
test('Sherlock 2026-08-11 2b: lifelink blokera = 0, gdy protection atakującego zapobiega obrażeniom', () => {
  const state = game();
  addCreature(state, 'a', 'att', 2, 2, { colors: ['White'] });
  addCreature(state, 'b', 'def', 3, 3, { keywords: ['lifelink'], colors: ['Black'] });
  assert.ok(startCombat(state, ['a']).ok);
  assert.ok(declareBlocks(state, { a: ['b'] }).ok);
  // Atakujący dostaje protection od koloru blokera (efekt po blokach).
  const a = state.objects.get('a');
  state.objects.set('a', Object.freeze({ ...a, protectionFromColors: ['Black'] }));
  const defLifeBefore = life(state, 'def');
  resolveCombat(state);
  assert.equal(life(state, 'def'), defLifeBefore,
    'protection atakującego zapobiega obrażeniom blokera → lifelink 0 (CR 702.16d + 702.15)');
  assert.equal(state.objects.get('a')?.zone, 'battlefield', 'atakujący z protection przeżywa');
});


// ---------------------------------------------------------------------------
// Błąd 3: protection (CR 702.16b) NIE blokuje celowania czarem źródła
// chronionego koloru — check w validateTargets brał kolory GRACZA (zawsze
// puste), nie kolory źródła (czar/zdolność). „A permanent with protection
// from a quality can't be the target of spells or abilities with that
// quality" — czarny czar NIE może celować w stwora z protection od black
// (osiągalne: stwór zaczarowany Benevolent Blessing wybierającym czarny).
// ---------------------------------------------------------------------------
function addSpellObject(state, id, controllerId, colors) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `syn-${id}`, controllerId, zone: 'hand',
    kind: 'spell', manaCost: 2, colors,
    spell: { timing: 'instant', targets: [{ type: 'creature' }], effects: [{ type: 'destroy_permanent' }] },
    abilities: [], keywords: [], subtypes: [], types: ['Instant'],
  });
}

test('Sherlock 2026-08-11 3: czarny czar NIE może celować w stwora z protection od black (CR 702.16b)', () => {
  const state = game();
  state.turn.phase = 'precombat_main';
  state.turn.activePlayerId = 'att';
  state.turn.priorityPlayerId = 'att';
  state.turn.step = 'precombat_main';
  addSpellObject(state, 'spell', 'att', ['Black']);
  addMana(state, 'att', 2);
  // Cel: stwór def z protection od black (simulacja efektu Benevolent Blessing
  // wybierającego czarny — CR 702.16: „can't be the target of black spells").
  addObject(state, {
    id: 'prot', instanceId: 'i-prot', cardId: 'card-prot', controllerId: 'def', zone: 'battlefield',
    kind: 'creature', power: 2, toughness: 2, keywords: [], protectionFromColors: ['Black'],
  });
  const r = execute(state, { type: 'cast_spell', playerId: 'att', objectId: 'spell', targets: ['prot'] });
  assert.ok(!r.ok,
    'czar koloru czarnego nie może celować w stwora z protection od czarnego (CR 702.16b); błąd: walidacja brała kolory gracza (puste)');
  const reason = r.events?.[0]?.reason ?? '';
  assert.match(reason, /protection/i, 'powód odrzucenia ma wskazywać protection (obecnie: ' + reason + ')');
  assert.ok(!state.zones.stack.some((id) => state.objects.get(id)?.cardId === 'syn-spell'),
    'czar nie ląduje na stosie — cel był nielegalny');
});

// ---------------------------------------------------------------------------
// Błąd 4 (zgłoszenie właściciela D, 2026-08-11): „walka rozstrzygnęła się
// dwukrotnie — dwa razy zadane obrażenia". Objaw: niezablokowani atakujący
// (przed atakującym z decyzją rozdzielania) zadawali obrażenia graczowi DWA
// RAZY. Root cause = TEN SAM błąd co BUG 1: na wznowieniu decyzji przebiegu
// ZWYKŁEGO `startPass = resume.pass` = false koercjował `passes[false]` na
// `passes[0]` (first strike), który dla niezablokowanych atakujących nie robił
// nic, a potem regularny przebieg startował od INDEXSU 0 — ponownie rozdając
// obrażenia wcześniejszych (niezablokowanych) atakujących.
// ---------------------------------------------------------------------------
test('Sherlock 2026-08-11 4: niezablokowani atakujący zadają obrażenia RAZ, gdy inny atakujący wymaga rozdzielenia (CR 510.1c)', () => {
  const state = game();
  // a1 i a2 NIEZABLOKOWANI; a3 zablokowany przez d1+d2 (decyzja rozdzielania).
  addCreature(state, 'a1', 'att', 1, 1);
  addCreature(state, 'a2', 'att', 7, 7);
  addCreature(state, 'a3', 'att', 4, 4);
  addCreature(state, 'd1', 'def', 2, 2);
  addCreature(state, 'd2', 'def', 2, 2);
  assert.ok(startCombat(state, ['a1', 'a2', 'a3']).ok);
  assert.ok(declareBlocks(state, { a3: ['d1', 'd2'] }).ok);
  const before = life(state, 'def');
  resolveCombat(state);
  assert.ok(state.pendingDamageAssignment, 'a3 (wielu blokerów) wymaga decyzji');
  const r = execute(state, {
    type: 'resolve_damage_assignment', playerId: 'att',
    assignments: { a3: [{ blockerId: 'd1', amount: 2 }, { blockerId: 'd2', amount: 2 }] },
  });
  assert.ok(r.ok, 'rozdzielenie: ' + (r.events?.[0]?.reason ?? ''));
  // a1 (1) + a2 (7) = 8 — DOKŁADNIE RAZ (a3 zablokowany, bez trample).
  assert.equal(before - life(state, 'def'), 8,
    'niezablokowani atakujący zadają obrażenia raz (CR 510.1c); błąd: podwójne rozstrzygnięcie walki');
});

// ---------------------------------------------------------------------------
// Błąd 5 (zgłoszenie właściciela C, 2026-08-11): log walki pokazywał „? ginie"
// przy wzajemnym zabiciu atakującego i blokującego — zdarzenie creature_destroyed
// nie niosło cardId, a nameOfObject(fromId) nie znajdował obiektu (nowe id w
// grobie). Strażnik: zdarzenie ma cardId do nazwania stworzenia.
// ---------------------------------------------------------------------------
test('Sherlock 2026-08-11 5: creature_destroyed niesie cardId — log może nazwać poległego (CR 702/704)', () => {
  const state = game();
  addCreature(state, 'atk', 'att', 3, 3);
  addCreature(state, 'blk', 'def', 3, 3);
  assert.ok(startCombat(state, ['atk']).ok);
  assert.ok(declareBlocks(state, { atk: ['blk'] }).ok);
  const r = resolveCombat(state); // wzajemne zabicie 3/3 vs 3/3
  const destroyed = r.events.filter((e) => e.type === 'creature_destroyed');
  assert.equal(destroyed.length, 2, 'obaj polegli (atakujący i bloker)');
  for (const d of destroyed) {
    assert.ok(d.cardId, 'creature_destroyed niesie cardId (log nie pokaże „? ginie"): ' + JSON.stringify(d));
  }
});

// ---------------------------------------------------------------------------
// Błąd 6 (zgłoszenie właściciela B, 2026-08-11): bot „skipował szukanie" —
// Secret Entrance (pierwsza komnata Undercity) szuka basic landu do ręki, ale
// boty wybierały `resolve_search_choice { found: null }` (fail-to-find), bo
// oferta rezygnacji jest PIERWSZA, a boty nie premiowały znalezienia karty.
// ---------------------------------------------------------------------------
function setupSearch(view) {
  return view.pendingSearchChoice;
}
test('Sherlock 2026-08-11 6: heuristic bot SZUKA basic landu (Secret Entrance), nie skipuje (found != null)', () => {
  const state = game();
  state.turn.phase = 'precombat_main';
  state.turn.activePlayerId = 'att';
  state.turn.priorityPlayerId = 'att';
  state.turn.step = 'precombat_main';
  // Biblioteka: basic swamp do znalezienia (Secret Entrance: Basic Land do ręki).
  addObject(state, {
    id: 'lib-swamp', instanceId: 'i-sw', cardId: 'basic-swamp', controllerId: 'att',
    zone: 'library', kind: 'land', types: ['Basic', 'Land'], subtypes: ['Swamp'], colors: ['B'],
  });
  queueSearchChoice(state, { controllerId: 'att', cardId: 'undercity' }, {
    qualifier: { types: ['Basic', 'Land'] }, destination: 'hand',
  });
  assert.ok(state.pendingSearchChoice, 'Secret Entrance kolejkuje decyzję szukania');
  const view = playerView(state, 'att');
  const cmd = createHeuristicBot({ seed: 1 }).chooseCommand(view);
  assert.equal(cmd.type, 'resolve_search_choice');
  assert.ok(cmd.found != null,
    'bot wybiera znalezienie karty, nie fail-to-find (found: null) — zgłoszenie B');
  const r = execute(state, cmd);
  assert.ok(r.ok, 'komenda bota zaakceptowana: ' + (r.events?.[0]?.reason ?? ''));
  const inHand = state.zones.hand.some((id) => state.objects.get(id)?.cardId === 'basic-swamp');
  assert.ok(inHand, 'bot wziął basic land do ręki (Secret Entrance działa)');
});

test('Sherlock 2026-08-11 7: aggro bot SZUKA basic landu, nie skipuje (found != null)', () => {
  const state = game();
  state.turn.phase = 'precombat_main';
  state.turn.activePlayerId = 'att';
  state.turn.priorityPlayerId = 'att';
  state.turn.step = 'precombat_main';
  addObject(state, {
    id: 'lib-swamp', instanceId: 'i-sw', cardId: 'basic-swamp', controllerId: 'att',
    zone: 'library', kind: 'land', types: ['Basic', 'Land'], subtypes: ['Swamp'], colors: ['B'],
  });
  queueSearchChoice(state, { controllerId: 'att', cardId: 'undercity' }, {
    qualifier: { types: ['Basic', 'Land'] }, destination: 'hand',
  });
  const view = playerView(state, 'att');
  const cmd = createAggroBot({ seed: 1 }).chooseCommand(view);
  assert.equal(cmd.type, 'resolve_search_choice');
  assert.ok(cmd.found != null, 'aggro bot też bierze landa (found != null) — zgłoszenie B');
  assert.ok(execute(state, cmd).ok, 'komenda zaakceptowana');
  const inHand = state.zones.hand.some((id) => state.objects.get(id)?.cardId === 'basic-swamp');
  assert.ok(inHand, 'aggro bot wziął basic land do ręki');
});
