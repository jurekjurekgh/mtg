// G (zgłoszenie właściciela 2026-11-21, „uwagi z testów"): Glorifier of
// Suffering — „you may sacrifice another creature or artifact. When you do,
// put a +1/+1 counter on each of up to two target creatures."
//
// Właściciel: „Bot nie umie z tego korzystać. Poświęca super fajny artefakt
// za 4 many, po to, żeby zyskać marne +1/+1. Bot powinien mieć zakaz
// (ujemny scoring) poświęcania kreatur lub artefaktów na tą zdolność,
// chyba, że dana kreatura/artefakt jest w jakiś sposób ułomny (np. ma obcą
// aurę) albo jego TMC (z pozytywnymi aurami, equipment włącznie) = 1 (lub
// jest tokenem 1/1 bez zdolności)."
//
// Kontrakt (deskryptorowy, ADR 0002 — rodzina „refleks licznikowy":
// zdolność `reflexive_sacrifice` + refleks z efektem `add_counter`):
//  - zdrowy kandydat (TMC ≥ 2, brak obcej aury, nie-token 1/1) → ujemny
//    wynik, skip wygrywa;
//  - ułomny kandydat → poświęcenie opłaca się (40 − strata jak dawniej);
//  - pokrętło `counterReflexSacrificeGuard` ×0 przywraca dawne zachowanie
//    (anti-over-fix M429).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { attachAuraToCreature } from '../src/engine/attachments.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function game(step = 'main', pid = 'p1') {
  const s = createGameState({ seed: 71, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, step, pid);
  s.turn.activePlayerId = pid;
  s.turn.priorityPlayerId = pid;
  return s;
}

function addCard(s, id, cardId, pid, zone = 'hand') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(s, {
    id, instanceId: `i-${id}`, cardId, controllerId: pid, ownerId: pid, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  return s.objects.get(id);
}

function library(s, pid, n) {
  for (let i = 0; i < n; i += 1) addCard(s, `L${pid}${i}`, 'basic-forest', pid, 'library');
}

/** Stwór/testowy permanent z jawnym kosztem (TMC) i flagą tokena. */
function addBody(s, id, pid, {
  power = 2, toughness = 2, manaCost = 2, isToken = false, keywords = [],
} = {}) {
  addObject(s, {
    id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId: pid, ownerId: pid,
    zone: 'battlefield', kind: 'creature', power, toughness, manaCost,
    abilities: [], keywords, subtypes: [], types: ['Creature'], colors: [],
  });
  if (isToken) {
    // isToken poza kontraktem addObject (L21) — patch jak w batch43/pr134.
    s.objects.set(id, Object.freeze({ ...s.objects.get(id), isToken: true }));
  }
  return s.objects.get(id);
}

function addArt(s, id, pid, manaCost = 4) {
  addObject(s, {
    id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId: pid, ownerId: pid,
    zone: 'battlefield', kind: 'artifact', manaCost, power: null, toughness: null,
    abilities: [], keywords: [], subtypes: [], types: ['Artifact'], colors: [],
  });
  return s.objects.get(id);
}

/** Aura przypięta do `hostId`; `controllerId` pozwala dać aurę WROGA. */
function addAura(s, id, hostId, controllerId, manaCost = 2) {
  addObject(s, {
    id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId, ownerId: controllerId,
    zone: 'battlefield', kind: 'enchantment', power: null, toughness: null, manaCost,
    abilities: [], keywords: [], subtypes: ['Aura'], types: ['Enchantment'], colors: [],
    aura: { enchant: 'creature' },
  });
  // attachedTo tylko przez silnikowe przypięcie (obiekty są zamrożone;
  // wzorzec audyt-pmssb15-prewencja).
  return attachAuraToCreature(s, id, hostId);
}

function resolveStack(s, limit = 24) {
  for (let i = 0; i < limit && s.zones.stack.length > 0; i += 1) {
    const v = playerView(s, s.turn.priorityPlayerId);
    const pass = v.legalCommands.find((c) => c.type === 'pass_priority');
    if (!pass) break;
    if (!execute(s, pass).ok) break;
  }
}

function pick(s, params = undefined) {
  const b = createHeuristicBot({ seed: 7, ...(params ? { params } : {}) });
  const cmd = b.chooseCommand(playerView(s, 'p1'));
  return { cmd, entry: b.trace().at(-1) };
}

/** Scena właściciela: Glorifier wchodzi, na stole zdrowe trupy. */
function castGlorifier(s) {
  library(s, 'p1', 5);
  addMana(s, 'p1', 8, { colors: ['W', 'U', 'B', 'R', 'G'] });
  addCard(s, 'glor', 'glorifier-of-suffering', 'p1');
  assert.ok(execute(s, { type: 'cast_permanent', playerId: 'p1', objectId: 'glor' }).ok);
  resolveStack(s);
}

test('G/1: zdrowy artefakt za 4 many NIE idzie w ofiarę — bot rezygnuje (zgłoszenie właściciela)', () => {
  const s = game();
  addArt(s, 'art4', 'p1', 4); // „super fajny artefakt za 4 many"
  addBody(s, 'grub', 'p1', { power: 5, toughness: 5, manaCost: 5 }); // zdrowy 5/5
  castGlorifier(s); // kandydaci MUSZĄ być na stole przed ETB (liczeni przy rozstrzygnięciu)
  const { cmd } = pick(s);
  assert.equal(cmd.type, 'resolve_sacrifice_choice');
  assert.strictEqual(cmd.skip, true,
    `ofiara zdrowego permanentu dla +1/+1 jest zakazana — oczekiwano skip, wybrano ${cmd.targetId ?? '?'}`);
});

test('G/2: ułomna ofiara (TMC 1) jest poświęcana — karta działa na odpadkach', () => {
  const s = game();
  addBody(s, 'junk', 'p1', { power: 1, toughness: 1, manaCost: 1 }); // TMC 1
  addArt(s, 'art4', 'p1', 4);
  castGlorifier(s);
  const { cmd } = pick(s);
  assert.equal(cmd.type, 'resolve_sacrifice_choice');
  assert.equal(cmd.targetId, 'junk', 'najtańszy odpad (TMC 1) przed zdrowym artefaktem i skip');
});

test('G/3: stwór z obcą (wrogą) aurą jest ułomny — bot poświęca JEGO, nie zdrowy artefakt', () => {
  const s = game();
  addBody(s, 'auraCr', 'p1', { power: 2, toughness: 2, manaCost: 2 });
  addAura(s, 'deadweight', 'auraCr', 'p2', 2); // wroga aura — stwór wyłączony z gry
  addArt(s, 'art2', 'p1', 2); // zdrowy artefakt 2 many (wartość straty 4 < 6 stwora)
  castGlorifier(s);
  const { cmd } = pick(s);
  assert.equal(cmd.type, 'resolve_sacrifice_choice');
  assert.equal(cmd.targetId, 'auraCr',
    `obca aura = ułomność; zdrowy artefakt jest zakazany — wybrano ${cmd.targetId ?? '?'}`);
});

test('G/4: token 1/1 bez zdolności jest ułomny nawet z własną aurą podbijającą TMC', () => {
  const s = game();
  addBody(s, 'tok', 'p1', { power: 1, toughness: 1, manaCost: 0, isToken: true });
  addAura(s, 'buff', 'tok', 'p1', 3); // własna aura → TMC tokenu = 3 > 1
  addArt(s, 'art2', 'p1', 2);
  castGlorifier(s);
  const { cmd } = pick(s);
  assert.equal(cmd.type, 'resolve_sacrifice_choice');
  assert.equal(cmd.targetId, 'tok',
    `token 1/1 bez zdolności = ułomność wg wzoru właściciela — wybrano ${cmd.targetId ?? '?'}`);
});

test('G/5: anti-over-fix — counterReflexSacrificeGuard ×0 przywraca dawne 40 − strata', () => {
  const s = game();
  addArt(s, 'art4', 'p1', 4);
  addBody(s, 'grub', 'p1', { power: 5, toughness: 5, manaCost: 5 });
  castGlorifier(s);
  const { cmd } = pick(s, { counterReflexSacrificeGuard: 0 });
  assert.equal(cmd.type, 'resolve_sacrifice_choice');
  assert.equal(cmd.targetId, 'art4',
    `pokrętło ×0 = dawna polityka (najniższa strata: artefakt 8 < 15) — wybrano ${cmd.targetId ?? '?'}`);
});
