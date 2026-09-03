// Audyt PR #93 (2026-09-03), znalezisko A — czar MODALNY wygnany w oknie
// zdolności (Vaan, Street Thief) nie był rzucalny wcale.
//
// Oracle Vaana: „… exile the top card of that player's library. You may cast
// it. If you don't, create a Treasure token.” — bez wyjątku dla czarów z
// „Choose one”. Tymczasem unifikacja filtru `outsideHandCastScope` (znalezisko
// 5 z PR #92) przeniosła na to okno wykluczenie `spell.modes`, a po zdjęciu
// stempla `playableUntilTurn` (ruling WotC 2025-02-10) ścieżka modalna nie ma
// żadnego uprawnienia do rzutu z exile. Skutek: oferta to TYLKO rezygnacja.
//
// Naprawa: `castModalSpell` zna `abilityWindowCast` (mirror `requireSpell`),
// a `outsideHandCastScope` dostaje jawny `allowModes`.
//
// Testy są na realnych kartach + skan katalogu (ADR 0002: reguła ma działać
// dla każdej karty modalnej, nie dla wybranej).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';

const REGISTRY = createCardRegistry();
const MODAL_SORCERY = 'aerith-rescue-mission';   // MV 4, sorcery, 2 tryby (Winda / Schody)

function game(playerId = 'p1', step = 'main') {
  const state = createGameState({ seed: 52, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, step, playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function put(state, id, cardId, controllerId, zone = 'battlefield', patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  if (Object.keys(patch).length) {
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
  }
  return state.objects.get(id);
}

function addSimpleCreature(state, id, controllerId, { power = 2, toughness = 2, subtypes = [] } = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId, ownerId: controllerId, zone: 'battlefield',
    kind: 'creature', power, toughness, manaCost: 1, abilities: [], keywords: [],
    subtypes, types: ['Creature'], colors: [],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

const commands = (state, playerId = 'p1') => playerView(state, playerId).legalCommands;

function resolveStack(state, limit = 40) {
  for (let i = 0; i < limit && state.zones.stack.length > 0; i += 1) {
    const pass = commands(state, state.turn.priorityPlayerId).find((c) => c.type === 'pass_priority');
    if (!pass) break;
    const r = execute(state, pass);
    if (!r.ok && /(_unresolved|not_your_decision)$/.test(r.events[0]?.reason ?? '')) break;
  }
}

function attackUnblocked(state, attackerIds) {
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds }).ok);
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: {} }).ok);
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  return execute(state, { type: 'resolve_combat', playerId: 'p1', defendingPlayerId: 'p2' });
}

/** Partia po triggerze Vaana: wygnany wierzch biblioteki p2 = `topCardId`. */
function vaanExileState(topCardId) {
  const state = game();
  addMana(state, 'p1', 10, { colors: ['W', 'U', 'B', 'R', 'G'] });
  put(state, 'vaan', 'vaan-street-thief', 'p1');
  addSimpleCreature(state, 'atk', 'p1', { power: 2, toughness: 2, subtypes: ['Scout'] });
  // Cel dla trybów z celami (strażnik klasy niżej): stwór przeciwnika.
  addSimpleCreature(state, 'foe', 'p2', { power: 2, toughness: 2 });
  // Bogaty stół dla strażnika klasy: tryby celujące w artefakt, uroczysko i
  // ląd (Vandalize, Steel Sabotage, Sea God's Scorn) muszą mieć kandydata,
  // inaczej „brak oferty" byłby winą stołu, nie reguły.
  for (const [id, kind, type] of [['art', 'artifact', 'Artifact'], ['enc', 'enchantment', 'Enchantment'], ['lnd', 'land', 'Land']]) {
    addObject(state, {
      id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId: 'p2', ownerId: 'p2',
      zone: 'battlefield', kind, types: [type], subtypes: [], keywords: [],
      manaCost: 0, colors: [], abilities: [],
    });
  }
  put(state, 'top', topCardId, 'p2', 'library');
  state.zones.library = ['top', ...state.zones.library.filter((id) => id !== 'top')];
  const combat = attackUnblocked(state, ['atk']);
  assert.ok(combat.ok, combat.events[0]?.reason);
  resolveStack(state);
  assert.ok(state.pendingExileCast, 'decyzja rzut-albo-Skarb po triggerze Vaana');
  return state;
}

const castOffers = (state) => commands(state, 'p1')
  .filter((c) => c.type === 'resolve_exile_cast' && c.cast === true);

test('A93/A: czar modalny wygnany przez Vaana jest RZUCALNY (Oracle: „You may cast it”)', () => {
  const state = vaanExileState(MODAL_SORCERY);
  const offers = castOffers(state);
  assert.ok(offers.length > 0,
    'oferta musi proponować rzut czaru modalnego — dziś proponuje wyłącznie rezygnację, '
    + 'czyli odbiera ruch gwarantowany przez Oracle (ADR 0022)');
  assert.ok(offers.some((c) => c.modeIndex === 0), 'wariant z wybranym trybem (Winda)');
});

test('A93/A: rzut idzie na stos z wybranym trybem, rozstrzyga efekt TRYBU i pobiera koszt', () => {
  const state = vaanExileState(MODAL_SORCERY);
  const cast = castOffers(state).find((c) => c.modeIndex === 0);
  const manaBefore = state.players.find((p) => p.id === 'p1').mana;
  const r = execute(state, cast);
  assert.ok(r.ok, `rzut w oknie zdolności przyjęty (${r.events[0]?.reason ?? ''})`);
  // Na stosie jest też ŹRÓDŁO okna (trigger Vaana rozstrzyga się w trakcie
  // rzutu) — sprawdzamy obiekt samego czaru, nie długość stosu.
  const stacked = [...state.objects.values()].find((o) => o.zone === 'stack' && o.cardId === MODAL_SORCERY);
  assert.ok(stacked, 'czar modalny trafia na stos');
  assert.equal(stacked.chosenMode, 0, 'obiekt na stosie pamięta wybrany tryb');
  const spellsCast = state.spellsCastThisTurn;
  assert.ok(spellsCast >= 1, 'rzut liczy się do czarów w turze');
  resolveStack(state);
  const heroes = [...state.objects.values()].filter((o) => o.cardId === 'token_hero' && o.zone === 'battlefield');
  assert.equal(heroes.length, 3, 'tryb „Winda” tworzy trzy tokeny Hero — efekt WYBRANEGO trybu');
  const manaAfter = state.players.find((p) => p.id === 'p1').mana;
  assert.ok(manaAfter < manaBefore, 'Vaan nie zwalnia z kosztu many — MV 4 pobrane w całości');
});

test('A93/A: sorcery w oknie zdolności ignoruje timing (ruling WotC 2025-02-10)', () => {
  const state = vaanExileState(MODAL_SORCERY);
  assert.ok(!['precombat_main', 'postcombat_main'].includes(state.turn.phase),
    'repro biegnie poza main phase (obrażenia bojowe) — timing czaru musi być pomijany');
  const cast = castOffers(state).find((c) => c.modeIndex === 0);
  assert.ok(execute(state, cast).ok, 'sorcery rzucona w oknie zdolności nie pyta o fazę');
});

test('A93/A: anty-over-fix — po rezygnacji karta NIE jest rzucalna później w turze', () => {
  const state = vaanExileState(MODAL_SORCERY);
  const decline = commands(state, 'p1').find((c) => c.type === 'resolve_exile_cast' && c.cast === false);
  assert.ok(execute(state, decline).ok);
  const exileId = [...state.objects.values()].find((o) => o.cardId === MODAL_SORCERY && o.zone === 'exile')?.id;
  assert.ok(exileId, 'karta zostaje w wygnaniu po rezygnacji');
  const exiled = state.objects.get(exileId);
  assert.equal(exiled.playableUntilTurn ?? null, null,
    'żadnego stempla „grywalna do końca tury” (ruling WotC 2025-02-10) — oknem '
    + 'rzutu jest wyłącznie nierozstrzygnięta decyzja');
  assert.ok(commands(state, 'p1').every((c) => !(c.type === 'cast_spell' && c.objectId === exileId)),
    'po rezygnacji nie pojawia się oferta rzutu „później w turze”');
  const late = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: exileId, targets: [], modeIndex: 0 });
  assert.equal(late.ok, false, 'próba rzutu poza oknem decyzji jest odrzucona');
});

test('A93/A: tryb z celami ZMIENNYMI („up to N target …") też wchodzi do oferty okna', () => {
  const state = vaanExileState(MODAL_SORCERY);
  // Tryb „Schody”: tap do 3 stworów + stun counter na jednym z nich.
  const offers = castOffers(state).filter((c) => c.modeIndex === 1);
  assert.ok(offers.length > 0,
    'tryb z `variableTargets` jest oferowany — z ręki jest (legalModeCasts), '
    + 'więc okno „you may cast it” nie może go gubić (L74: jedna implementacja)');
  const withTargets = offers.find((c) => c.targets.length > 0);
  assert.ok(withTargets, 'wariant z co najmniej jednym celem');
  assert.ok(withTargets.stunTargetId, 'wariant niesie dodatkowy wybór (stun) — wykonanie go wymaga');
  const r = execute(state, withTargets);
  assert.ok(r.ok, `komenda z celem zmiennym przyjęta (${r.events[0]?.reason ?? ''})`);
  const stacked = [...state.objects.values()].find((o) => o.zone === 'stack' && o.cardId === MODAL_SORCERY);
  assert.equal(stacked.chosenMode, 1, 'wybrany tryb jedzie na stos');
  assert.deepEqual([...(stacked.chosenTargets ?? [])].sort(), [...withTargets.targets].sort());
  resolveStack(state);
  const stunned = state.objects.get(withTargets.stunTargetId);
  assert.ok(stunned.tapped, 'cel trybu zostaje stępiony (tap)');
  assert.ok((stunned.counters?.stun ?? 0) > 0, 'DODATKOWY cel (stunTargetId) dostaje licznik stun');
});

test('A93/A: strażnik klasy — KAŻDY modalny czar katalogu da się rzucić z okna zdolności', () => {
  const modalCards = REGISTRY.all().filter((card) => (card.spell?.modes ?? []).length > 0);
  assert.ok(modalCards.length >= 10, `katalog ma czary modalne (znaleziono ${modalCards.length})`);
  const bezOferty = [];
  for (const card of modalCards) {
    const state = vaanExileState(card.id);
    if (castOffers(state).length === 0) bezOferty.push(card.id);
  }
  assert.deepEqual(bezOferty, [],
    'każdy czar modalny w katalogu musi mieć ofertę rzutu w oknie zdolności — reguła '
    + 'nie może zależeć od tego, który tryb akurat testujemy (ADR 0002)');
});
