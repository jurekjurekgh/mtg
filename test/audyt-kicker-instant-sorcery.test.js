/**
 * Kicker (CR 702.33) na instantach i sorcerych — audyt PR #93.
 *
 * Rozstrzygnięcie właściciela (2026-09-02): kicker na instant/sorcery
 * „OCZYWIŚCIE OBSŁUŻYĆ" — czyli NIE wolno tego zgłaszać jako `limitations`
 * karty (ADR 0022), tylko zaimplementować w silniku.
 *
 * Stan przed: kickera rozliczała wyłącznie ścieżka permanentów
 * (`castPermanent` w resources.js — walidacja `object.kicker`, pipy kickera
 * w wymaganiach, `wasKicked` na permanencie, `kicked` w zdarzeniu
 * `permanent_cast`). `castSpell` nie miał nawet takiego parametru, więc
 * instanta albo sorcery z nadrukowanym kickeriem nie dało się rzucić
 * z kickerem wcale — a `triggers.js` (2489-2496) od dawna nasłuchiwał
 * `spell_cast.kicked` dla Merfolk Falconer (ZNR): „Whenever you cast a kicked
 * spell, scry 2."
 *
 * Testy idą PRAWDZIWĄ kartą po stronie triggerów (Merfolk Falconer), a sam
 * instant dostaje DESKRYPTOR kickera wstrzyknięty w obiekt: w katalogu nie ma
 * na razie instantu z nadrukowanym kickeriem (jedyna karta z kickeriem to
 * Kor Sanctifiers, permanent), a dopisanie karty do katalogu to decyzja
 * właściciela, nie audytora. Mechanizm jest generyczny, więc tak go pinujemy
 * (ten sam wzorzec co w `test/m202-n3-koszt-dodatkowy-na-obiekcie.test.js`).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { effectiveSpellManaCost, legalSpellCasts } from '../src/engine/spells.js';
import { processTriggers } from '../src/engine/triggers.js';

const REGISTRY = createCardRegistry();
const SPELL = REGISTRY.get('raise-the-alarm'); // {1}{W}, bez celów, tworzy tokeny
const KICKER = { cost: 1, colors: ['U'] };     // niebieski kicker na białym czarze

function setup({ colors = ['W', 'U'], falconer = false } = {}) {
  const state = createGameState({ seed: 11, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  if (falconer) {
    const def = REGISTRY.get('merfolk-falconer');
    addObject(state, {
      id: 'falconer', instanceId: 'i-falconer', cardId: def.id, controllerId: 'p1', ownerId: 'p1',
      zone: 'battlefield', ...gameObjectDataOf(def), types: ['Creature'],
    });
  }
  addObject(state, {
    id: 'spell', instanceId: 'i-spell', cardId: SPELL.id, controllerId: 'p1', ownerId: 'p1',
    zone: 'hand', ...gameObjectDataOf(SPELL), types: SPELL.types ?? ['Instant'],
    kicker: KICKER,
  });
  state.zones.hand.push('spell');
  addMana(state, 'p1', 10, { colors });
  return state;
}

/** Rozstrzyga stos prawdziwymi komendami (wzorzec test/activated-abilities). */
function resolveStack(state) {
  let guard = 0;
  while (state.zones.stack.length > 0 && guard++ < 250) {
    const holder = state.turn.priorityPlayerId;
    const view = playerView(state, holder);
    const pick = view.legalCommands.find((c) => c.type === 'pass_priority')
      ?? view.legalCommands.find((c) => c.type.startsWith('resolve_'));
    if (!pick) return false;
    const r = execute(state, pick);
    if (!r.ok) return false;
  }
  return state.zones.stack.length === 0;
}

const spellCasts = (state) => legalSpellCasts(state, 'p1').filter((c) => c.objectId === 'spell');

test('oferta: wariant z kickerem jest dokładany, a naturalny rzut pozostaje pierwszy', () => {
  const state = setup();
  const casts = spellCasts(state);
  const plain = casts.findIndex((c) => !c.kicked);
  const kicked = casts.findIndex((c) => c.kicked === true);
  assert.ok(plain >= 0, 'musi być zwykły wariant rzutu');
  assert.ok(kicked >= 0, 'instant z deskryptorem kickera musi mieć wariant `kicked` w ofercie');
  assert.ok(plain < kicked, 'pierwsza pozycja panelu to najtańszy naturalny rzut');
});

test('rzut z kickerem: koszt = baza + kicker, wasKicked na stosie, kicked w zdarzeniu', () => {
  const state = setup();
  const baza = effectiveSpellManaCost(state, state.objects.get('spell'));
  const manaPrzed = state.players.find((p) => p.id === 'p1').mana;
  const r = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'spell', targets: [], kicked: true });
  assert.equal(r.ok, true, `rzut odrzucony: ${JSON.stringify(r.events?.at(-1))}`);
  assert.equal(manaPrzed - state.players.find((p) => p.id === 'p1').mana, baza + KICKER.cost,
    'zapłacona suma musi obejmować kickera');

  const stacked = state.objects.get(state.zones.stack.at(-1));
  assert.equal(stacked.wasKicked, true, 'fakt kickera jest własnością czaru na stosie (CR 702.33a)');
  const cast = state.events.find((e) => e.type === 'spell_cast');
  assert.equal(cast.kicked, true, 'spell_cast musi nieść `kicked` (kontrakt lustrzany do permanent_cast)');
  assert.equal(cast.manaSpent, baza + KICKER.cost, 'manaSpent w zdarzeniu liczy kickera');
});

test('bez koloru na kickera: oferta milczy, a komenda jest odrzucana (parzysta bramka L48)', () => {
  const state = setup({ colors: ['W'] }); // tylko biała mana — {U} kickera nieopłacalne
  assert.equal(spellCasts(state).filter((c) => c.kicked).length, 0,
    'oferta nie może obiecywać rzutu, którego walidacja odrzuci');
  const r = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'spell', targets: [], kicked: true });
  assert.equal(r.ok, false, 'walidacja musi odrzucić nieopłacony pip kickera');
  assert.match(String(r.events?.at(-1)?.reason ?? ''), /kolorow|kicker/);
  const plain = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'spell', targets: [] });
  assert.equal(plain.ok, true, 'rzut bez kickera pozostaje legalny — bramka nie mogła zepsuć ścieżki podstawowej');
});

test('brak mechaniki kickera na karcie: jawny błąd, nie ciche zignorowanie', () => {
  const state = setup();
  const object = state.objects.get('spell');
  state.objects.set('spell', Object.freeze({ ...object, kicker: null }));
  assert.equal(spellCasts(state).filter((c) => c.kicked).length, 0,
    'bez kickera w karcie oferta nie może proponować wariantu kicked');
  const r = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'spell', targets: [], kicked: true });
  assert.equal(r.ok, false, 'płacenie kickera kartą bez kickera musi być odrzucone');
  assert.match(String(r.events?.at(-1)?.reason ?? ''), /kicker/);
});

test('Merfolk Falconer: „whenever you cast a kicked spell" łapie instant (scry 2)', () => {
  const state = setup({ falconer: true });
  const before = state.events.length;
  const r = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'spell', targets: [], kicked: true });
  assert.equal(r.ok, true, `rzut odrzucony: ${JSON.stringify(r.events?.at(-1))}`);
  processTriggers(state, state.events.slice(before));
  assert.ok(resolveStack(state), 'stos rozstrzygnięty');
  const triggered = state.events.filter((e) => e.type === 'ability_triggered' && e.cardId === 'merfolk-falconer');
  assert.ok(triggered.length > 0,
    'Falconer musi zobaczyć kickowanego instanta — o to chodziło w nasłuchiwaniu `spell_cast.kicked`');
  assert.ok(state.pendingScry || state.events.some((e) => /^scry/.test(e.type)),
    'scry 2 musi zostać uruchomione (decyzja albo zdarzenie)');
});

test('kontrola ujemna: ten sam instant BEZ kickera nie odpala Falconera', () => {
  const state = setup({ falconer: true });
  const before = state.events.length;
  const r = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'spell', targets: [] });
  assert.equal(r.ok, true, `rzut odrzucony: ${JSON.stringify(r.events?.at(-1))}`);
  processTriggers(state, state.events.slice(before));
  assert.ok(resolveStack(state), 'stos rozstrzygnięty');
  assert.equal(state.events.filter((e) => e.type === 'ability_triggered' && e.cardId === 'merfolk-falconer').length, 0,
    'rzut bez opłaconego kickera nie może odpalać „kicked spell"');
});
