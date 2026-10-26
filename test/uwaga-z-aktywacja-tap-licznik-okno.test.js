// Uwaga Z (zgłoszenie właściciela z gry, 2026-10-26) — Karta Cenn's Tactician.
//
// Cytat: „Bot ma jedną kreaturę Cenn's Tactician (2/2 bo z jednym counterem
// +1/+1). Ja nie mam żadnych kreatur. Bot mógłby mnie zaatakować i bezkarnie
// uderzyć za dwa. Zamiast tego bot w Main 1 tapuje Tacticiana i dodaje sobie
// kolejny counter. To złe zagranie i błędny scoring. Tego typu działania
// (zapłacenie i tapowanie) powinny być wykonywane TYLKO na sam koniec tury
// przeciwnika (…) Ewentualnie można tą zdolność wykorzystać jako combat trick.”
//
// Pomiar PRZED (sonda `.arena/probe-z.mjs`): w Głównej 1 aktywacja dostawała
// 13 (1/1) / 19 (2/2), czyli bot tapował jedyne ciało i nie atakował mimo
// pustego stołu wroga. Przyczyna w kodzie: reguła PMSSB-66 („trwały skutek
// płacimy w oknie end step przeciwnika”) jawnie WYKLUCZAŁA koszt tapnięcia
// (`ability?.cost?.tap`), choć tap jest dodatkowym powodem, by poczekać — traci
// się atak (w cudzej turze: blok). Ten wyjątek powstał, gdy model dotyczył
// zdolności za SAMĄ manę; po zgłoszeniu właściciela koszt tapnięcia jest
// obsługiwany tą samą regułą (jeden model okna, L41), a granicę dla usunięcia
// stawia rodzaj licznika (Z/10: −1/−1 na wrogu NIE jest odkładane).
// Po naprawie: Główna 1 / Główna 2 / cudza Główna 1 → pass, end step
// przeciwnika, okna walki (combat trick) i ratunek licznikiem bez zmian.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addObject, createGameState, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function game(step = 'main1', activePlayerId = 'p1', priorityPlayerId = activePlayerId) {
  const state = createGameState({ seed: 429, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, priorityPlayerId);
  state.turn.activePlayerId = activePlayerId;
  state.turn.priorityPlayerId = priorityPlayerId;
  return state;
}

function put(state, id, cardId, controllerId, zone = 'battlefield', extra = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  const d = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    kind: d.kind, power: d.power, toughness: d.toughness, manaCost: d.manaCost, spell: d.spell,
    abilities: d.abilities ?? [], keywords: def.keywords ?? [], subtypes: d.subtypes ?? def.subtypes ?? [],
    types: def.types ?? [], colors: d.colors ?? [], ...extra,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

/** Uwaga Z: jedyny stwór bota to Cenn's Tactician (1/1, opcjonalnie już 2/2). */
function tylkoTactician({ power = 1, toughness = 1 } = {}) {
  const state = game('main1');
  put(state, 'tac', 'cenns-tactician', 'p1', 'battlefield', { power, toughness });
  addMana(state, 'p1', 4, { colors: ['W'] });
  return state;
}

function decide(state, playerId = 'p1') {
  const bot = createHeuristicBot({ seed: 429 });
  const cmd = bot.chooseCommand(playerView(state, playerId), {});
  const entry = bot.trace().at(-1);
  const scores = {};
  for (const o of entry?.options ?? []) {
    if (!o) continue;
    scores[o.cmd] = o.score;
  }
  return { cmd, entry, scores };
}

const label = (cmd) => (cmd
  ? `${cmd.type}(${cmd.objectId ?? ''}${cmd.targets ? `->${cmd.targets.join('+')}` : ''})`
  : 'brak');
const aktywacje = (scores) => Object.entries(scores).filter(([k]) => k.startsWith('activate_ability(tac'));

// =====================================================================
// Z/1–Z/2 — zgłoszenie: Główna 1, puste stwory wroga, bot ma jedno ciało
// =====================================================================

test('Z/1 (zgłoszenie): bot NIE tapuje Tacticiana w Głównej 1 — atak za 2 jest lepszy', () => {
  const { cmd, scores } = decide(tylkoTactician());
  assert.equal(cmd.type, 'pass_priority', `wybrano ${label(cmd)} — tapowanie ciała w Głównej 1`);
  const a = aktywacje(scores);
  assert.ok(a.length > 0, 'oferta aktywacji istnieje (inaczej pin niczego nie mierzy)');
  for (const [k, v] of a) assert.ok(v < 0, `${k} = ${v} musi przegrać z passem (L3)`);
});

test('Z/2 (zgłoszenie, 2/2 z licznikiem): nadal pass — ciało ma atakować, nie tapować się', () => {
  const { cmd, scores } = decide(tylkoTactician({ power: 2, toughness: 2 }));
  assert.equal(cmd.type, 'pass_priority', `wybrano ${label(cmd)}`);
  for (const [k, v] of aktywacje(scores)) assert.ok(v < 0, `${k} = ${v}`);
});

test('Z/3: po passie w Głównej 1 bot ATAKUJE Tacticianem (bezkarne obrażenia, o które chodziło)', () => {
  const state = game('declare_attackers', 'p1');
  put(state, 'tac', 'cenns-tactician', 'p1', 'battlefield', { power: 2, toughness: 2 });
  const { cmd, scores } = decide(state);
  assert.equal(cmd.type, 'declare_attackers');
  assert.deepEqual(cmd.attackerIds, ['tac'], `zaatakuj Tacticianem, wybrano ${label(cmd)}`);
  assert.ok(scores['attack[tac]'] > 0, `atak musi być dodatni (jest ${scores['attack[tac]']})`);
});

// =====================================================================
// Z/4–Z/6 — gdzie aktywacja MA sens: okno end step przeciwnika
// =====================================================================

test('Z/4: end step przeciwnika → aktywuj (licznik trwały, ciało i tak nic nie zrobi)', () => {
  const state = game('end', 'p2', 'p1');
  put(state, 'tac', 'cenns-tactician', 'p1');
  addMana(state, 'p1', 4, { colors: ['W'] });
  const { cmd, scores } = decide(state);
  assert.equal(cmd.type, 'activate_ability', `wybrano ${label(cmd)}`);
  assert.deepEqual(cmd.targets, ['tac']);
  assert.ok(scores['activate_ability(tac#1->tac)'] > 0, `wynik ${scores['activate_ability(tac#1->tac)']}`);
});

test('Z/5: moja Główna 2 też czeka (ta sama zasada PMSSB-66 — mana/tempo bez zysku)', () => {
  const state = game('main2', 'p1');
  put(state, 'tac', 'cenns-tactician', 'p1', 'battlefield', { power: 2, toughness: 2 });
  addMana(state, 'p1', 4, { colors: ['W'] });
  const { cmd, scores } = decide(state);
  assert.equal(cmd.type, 'pass_priority', `wybrano ${label(cmd)}`);
  for (const [k, v] of aktywacje(scores)) assert.ok(v < 0, `${k} = ${v}`);
});

test('Z/6: cudza Główna 1 → pass (Tactician zostaje jako BLOKER)', () => {
  const state = game('main1', 'p2', 'p1');
  put(state, 'tac', 'cenns-tactician', 'p1');
  addMana(state, 'p1', 4, { colors: ['W'] });
  const { cmd, scores } = decide(state);
  assert.equal(cmd.type, 'pass_priority', `wybrano ${label(cmd)}`);
  for (const [k, v] of aktywacje(scores)) assert.ok(v < 0, `${k} = ${v}`);
});

// =====================================================================
// Z/7–Z/9 — ANTY-OVER-FIX: okna, w których licznik nadal kupuje wynik
// =====================================================================

test('Z/7 (anty-over-fix): combat trick — blok 2/2 vs 3/3, licznik zabija blokującego atakującego', () => {
  const state = game('declare_blockers', 'p2', 'p1');
  put(state, 'tac', 'cenns-tactician', 'p1');
  put(state, 'mine', 'token_human', 'p1', 'battlefield', { subtypes: ['Soldier'], power: 2, toughness: 2 });
  put(state, 'foe', 'hill-giant', 'p2', 'battlefield', { power: 3, toughness: 3 });
  state.combat = {
    attackingPlayerId: 'p2', defendingPlayerId: 'p1',
    attackers: ['foe'], blockers: new Map([['foe', ['mine']]]),
  };
  addMana(state, 'p1', 4, { colors: ['W'] });
  const { cmd, scores } = decide(state);
  assert.equal(cmd.type, 'activate_ability', `wybrano ${label(cmd)}`);
  assert.deepEqual(cmd.targets, ['mine'], 'licznik idzie na walczącego blokera');
  assert.ok(scores['activate_ability(tac#1->mine)'] > 0, `wynik ${scores['activate_ability(tac#1->mine)']}`);
});

test('Z/8 (anty-over-fix): moje declare_attackers — licznik na ATAKUJĄCYM nadal ma wartość', () => {
  const state = game('declare_attackers', 'p1');
  put(state, 'tac', 'cenns-tactician', 'p1');
  put(state, 'mine', 'token_human', 'p1', 'battlefield', { subtypes: ['Soldier'], power: 2, toughness: 2 });
  state.combat = {
    attackingPlayerId: 'p1', defendingPlayerId: 'p2', attackers: ['tac', 'mine'], blockers: new Map(),
  };
  addMana(state, 'p1', 4, { colors: ['W'] });
  const { cmd, scores } = decide(state);
  assert.equal(cmd.type, 'activate_ability', `wybrano ${label(cmd)}`);
  assert.deepEqual(cmd.targets, ['mine'], 'atakujący dostaje licznik');
  assert.ok(scores['activate_ability(tac#1->mine)'] > 0, `wynik ${scores['activate_ability(tac#1->mine)']}`);
});

test('Z/9 (anty-over-fix): ratunek — Shock na moim 2/2, tap+licznik ratuje stwora TERAZ', () => {
  const state = game('main1', 'p1', 'p1');
  put(state, 'tac', 'cenns-tactician', 'p1');
  put(state, 'mine', 'token_human', 'p1', 'battlefield', { subtypes: ['Soldier'], power: 2, toughness: 2 });
  put(state, 'shock', 'shock', 'p2', 'stack');
  const o = state.objects.get('shock');
  state.objects.set('shock', Object.freeze({ ...o, chosenTargets: ['mine'] }));
  addMana(state, 'p1', 4, { colors: ['W'] });
  const { cmd, scores } = decide(state);
  assert.equal(cmd.type, 'activate_ability', `ratunek musi wygrać (wybrano ${label(cmd)})`);
  assert.deepEqual(cmd.targets, ['mine']);
  assert.ok(scores['activate_ability(tac#1->mine)'] > 0, `wynik ${scores['activate_ability(tac#1->mine)']}`);
});

// =====================================================================
// Z/10–Z/11 — granice klasy: licznik WROGI i koszt BEZ many
// =====================================================================

test('Z/10 (granica): licznik WROGI z tapem to usunięcie — nie jest odraczany do okna', () => {
  // Trigon of Corruption: „{2}, {T}, remove a charge counter: −1/−1 na docelowym
  // stworze”. Osłabienie blokera PRZED moją walką jest warte tyle samo co
  // w end stepie, ale okno ma znaczenie (CR 704.5f — po walce cel może już
  // nie żyć albo nie być blokerem), więc USUNIĘCIE nie wchodzi do odroczenia.
  // Cel 4/4 (NIE ginie) — dobicie ma osobny wyjątek `lethalNow` (K1/A6).
  const state = game('main1', 'p1');
  put(state, 'trig', 'trigon-of-corruption', 'p1', 'battlefield');
  state.objects.set('trig', Object.freeze({ ...state.objects.get('trig'), counters: { charge: 3 } }));
  put(state, 'duzy', 'token_human', 'p2', 'battlefield', { power: 4, toughness: 4 });
  addMana(state, 'p1', 4, { colors: ['B'] });
  const { scores } = decide(state);
  const debuff = scores['activate_ability(trig#1->duzy)'];
  assert.ok(debuff > 0, `osłabienie musi być dodatnie w Głównej 1 (jest ${debuff})`);
});
