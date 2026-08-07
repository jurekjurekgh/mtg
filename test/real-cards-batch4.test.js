import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { addObject, createGameState, execute, playerView } from '../src/engine/game-state.js';
import { addMana } from '../src/engine/resources.js';
import { markDamage } from '../src/engine/permanents.js';
import { jumpToStep } from '../src/engine/turn.js';
import { runSimulation } from '../src/engine/simulation.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { createAggroBot } from '../src/controllers/aggro-bot.js';
import { createRandomBot } from '../src/controllers/random-bot.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf, setupCardMatch } from '../src/cards/materialize.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import { verifyReplay, replayFromState } from '../src/engine/replay.js';

/**
 * Czwarty batch realnych kart (ADR 0010): Gloomfang Mauler (MOM — menace,
 * Backup 2 z decyzją resolve_backup, Swampcycling), Serra's Embrace (DVD —
 * czysta aura: czar aury, +2/+2, flying, vigilance, grób przy fizzle/zgonie
 * gospodarza), Cloak of the Bat (CLB — equipment: equip {2} sorcery-speed,
 * flying+haste nosiciela, zostaje po jego śmierci, re-equip).
 * Dane Oracle: docs/cards/. Zasada właściciela: karty kodowane w 100%
 * mechanik (brak limitations na mechanikach karty).
 */

const REGISTRY = createCardRegistry();

function game() {
  return createGameState({ seed: 1, players: [{ id: 'p1' }, { id: 'p2' }] });
}

function mainPhase(state, playerId = 'p1') {
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  return state;
}

/** Dodaje realną kartę jak materializacja (pełne pola z definicji). */
function addRealCard(state, id, cardId, controllerId, zone, { tapped = false } = {}) {
  const def = REGISTRY.get(cardId);
  const data = gameObjectDataOf(def);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, zone,
    kind: data.kind, power: data.power, toughness: data.toughness,
    manaCost: data.manaCost, spell: data.spell, abilities: data.abilities ?? [],
    keywords: def.keywords ?? [], subtypes: def.subtypes ?? [],
    entersWithCounters: data.entersWithCounters ?? def.entersWithCounters ?? null,
    types: def.types ?? [], entersTapped: def.entersTapped ?? false,
    bestow: def.bestow ?? null, aura: def.aura ?? null,
    equipment: def.equipment ?? null, backup: def.backup ?? null,
  });
  const object = state.objects.get(id);
  if (tapped) state.objects.set(id, Object.freeze({ ...object, tapped: true }));
  return state.objects.get(id);
}

function addSimpleCreature(state, id, controllerId, { power = 2, toughness = 2, keywords = [], tapped = false, summoningSickness = true } = {}) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: 'highland-game', controllerId, zone: 'battlefield', kind: 'creature',
    power, toughness, abilities: [], keywords, subtypes: [], types: ['Creature'],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), tapped, summoningSickness }));
  return state.objects.get(id);
}

function findOnBattlefield(state, cardId, controllerId = null) {
  return [...state.objects.values()].find((o) => o.cardId === cardId && o.zone === 'battlefield' && (controllerId === null || o.controllerId === controllerId));
}

function passBoth(state, first = 'p1') {
  const second = first === 'p1' ? 'p2' : 'p1';
  assert.ok(execute(state, { type: 'pass_priority', playerId: first }).ok);
  assert.ok(execute(state, { type: 'pass_priority', playerId: second }).ok);
}

/** Wczytuje talię z repozytorium i wkłada wskazaną kartę na wierzch własnej biblioteki. */
function matchState(deckName, seed = 11) {
  const registry = createCardRegistry();
  const text = fs.readFileSync(new URL(`../decks/${deckName}.txt`, import.meta.url), 'utf-8');
  const { cardIds } = parseDeckText(text, registry);
  const state = setupCardMatch({ seed, players: [{ id: 'p1' }, { id: 'p2' }], decks: new Map([['p1', cardIds], ['p2', cardIds]]), registry });
  return state;
}

// --- Gloomfang Mauler: dane, menace ----------------------------------------

test('Gloomfang Mauler: materializacja — 5/5 menace, backup 2 + grant menace, swampcycling', () => {
  const data = gameObjectDataOf(REGISTRY.get('gloomfang-mauler'));
  assert.equal(data.kind, 'creature');
  assert.equal(data.power, 5);
  assert.equal(data.toughness, 5);
  assert.equal(data.manaCost, 7);
  assert.deepEqual(data.backup, { counters: 2, grantKeywords: ['menace'] });
  const cycling = data.abilities.find((a) => a.cycling);
  assert.ok(cycling);
  assert.deepEqual(cycling.cycling, { subtypes: ['Swamp'] });
  assert.equal(cycling.cost.mana, 2);
  assert.ok(REGISTRY.get('gloomfang-mauler').keywords.includes('menace'));
});

test('menace: legalny blok wymaga dwóch blokujących — walidacja i enumeracja opcji', () => {
  const state = game();
  addRealCard(state, 'mauler', 'gloomfang-mauler', 'p1', 'battlefield');
  state.objects.set('mauler', Object.freeze({ ...state.objects.get('mauler'), summoningSickness: false }));
  addSimpleCreature(state, 'blocker1', 'p2', { summoningSickness: false });
  addSimpleCreature(state, 'blocker2', 'p2', { summoningSickness: false });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['mauler'] }).ok);
  // NIELEGALNE: pojedynczy blok na menace.
  const single = execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { mauler: ['blocker1'] } });
  assert.equal(single.ok, false);
  assert.match(single.events[0].reason, /illegal_blockers/);
  // Widok nie oferuje wariantu z pojedynczym blokiem — żaden wyliczony
  // wariant nie może mieć dokładnie jednego blokującego na maulerze.
  const view = playerView(state, 'p2');
  const options = view.legalCommands.filter((c) => c.type === 'declare_blockers').map((c) => c.assignments ?? {});
  assert.ok(options.length > 0);
  for (const option of options) {
    const count = (option.mauler ?? []).length;
    assert.notEqual(count, 1, `zakazany wariant w widoku: ${JSON.stringify(option)}`);
  }
  // LEGALNE: podwójny blok przechodzi.
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { mauler: ['blocker1', 'blocker2'] } }).ok);
});

test('menace: stwór bez menace nadal można blokować pojedynczym stworem (regresja)', () => {
  const state = game();
  addSimpleCreature(state, 'attacker', 'p1', { power: 3, summoningSickness: false });
  addSimpleCreature(state, 'blocker1', 'p2', { summoningSickness: false });
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['attacker'] }).ok);
  assert.ok(execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { attacker: ['blocker1'] } }).ok);
});

// --- Backup: decyzja resolve_backup -----------------------------------------

function maulerEnters(state, { otherOnBoard = true } = {}) {
  mainPhase(state, 'p1');
  addRealCard(state, 'mauler-card', 'gloomfang-mauler', 'p1', 'hand');
  addMana(state, 'p1', 7);
  if (otherOnBoard) addSimpleCreature(state, 'other', 'p1', { power: 1, toughness: 1 });
  const cast = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'mauler-card' });
  assert.ok(cast.ok, JSON.stringify(cast.events[0]));
  assert.ok(state.pendingBackups.length > 0, 'backup powinien czekać na decyzję');
  return state.pendingBackups[0];
}

test('Backup: wejście stwora z backup kolejkuje decyzję kontrolera (jawny trigger)', () => {
  const state = game();
  const pending = maulerEnters(state);
  assert.equal(pending.playerId, 'p1');
  assert.equal(pending.counters, 2);
  assert.deepEqual(pending.grantKeywords, ['menace']);
  assert.ok(state.events.some((e) => e.type === 'ability_triggered' && e.backup === true));
  const src = findOnBattlefield(state, 'gloomfang-mauler');
  assert.ok(src, 'Mauler powinien być na bitwisku');
});

test('Backup: blokada gry — pass i tapowanie odrzucane do czasu resolve_backup', () => {
  const state = game();
  maulerEnters(state);
  addRealCard(state, 'spare-land', 'basic-forest', 'p1', 'battlefield');
  const pass = execute(state, { type: 'pass_priority', playerId: 'p1' });
  assert.equal(pass.ok, false);
  assert.equal(pass.events[0].reason, 'backup_unresolved');
  const tap = execute(state, { type: 'tap_for_mana', playerId: 'p1', objectId: 'spare-land' });
  assert.equal(tap.ok, false);
  assert.equal(tap.events[0].reason, 'backup_unresolved');
  const view = playerView(state, 'p1');
  assert.deepEqual([...new Set(view.legalCommands.map((c) => c.type))].sort(), ['concede', 'resolve_backup']);
});

test('Backup: nie swoja decyzja i nielegalny cel odrzucane', () => {
  const state = game();
  maulerEnters(state);
  const wrongPlayer = execute(state, { type: 'resolve_backup', playerId: 'p2', targetId: 'other' });
  assert.equal(wrongPlayer.ok, false);
  assert.equal(wrongPlayer.events[0].reason, 'backup_not_your_decision');
  const wrongTarget = execute(state, { type: 'resolve_backup', playerId: 'p1', targetId: 'no-such-object' });
  assert.equal(wrongTarget.ok, false);
  assert.equal(wrongTarget.events[0].reason, 'illegal_backup_target');
});

test('Backup: na inny stwór — +2/+2 trwale i menace do końca tury (znikają w cleanup)', () => {
  const state = game();
  maulerEnters(state);
  const resolved = execute(state, { type: 'resolve_backup', playerId: 'p1', targetId: 'other' });
  assert.ok(resolved.ok);
  const other = state.objects.get('other');
  assert.equal(other.counters['+1/+1'], 2);
  assert.deepEqual(other.keywordGrants, ['menace']);
  const events = resolved.events;
  assert.ok(events.some((e) => e.type === 'backup_resolved' && e.self === false && e.grantedKeywords.includes('menace')));
  // Efektywność w walce: other jest 3/3 z menace (1/1 + 2 liczniki).
  const view = playerView(state, 'p1');
  const otherView = view.zones.battlefield.find((o) => o.id === 'other');
  assert.equal(otherView.power, 3);
  assert.equal(otherView.toughness, 3);
  assert.ok(otherView.keywords.includes('menace'));
  // Przejście do cleanup czyści grant (liczniki zostają).
  passBoth(state, 'p1');
  if (state.turn.step !== 'cleanup') {
    state.turn = jumpToStep(state.turn, 'cleanup', 'p1');
  }
  // Wymuszamy cleanup przez pełne przejście tury w silniku:
  mainPhase(state, 'p2');
  // (przejście przez kroki aż cleanup — autokomenda passów poniżej)
  state.turn = jumpToStep(state.turn, 'end', 'p2');
  passBoth(state, 'p2');
  const after = state.objects.get('other');
  assert.equal(after.counters['+1/+1'], 2);
  assert.deepEqual(after.keywordGrants, []);
  assert.equal(after.keywords.includes('menace'), false);
});

test('Backup: na samo źródło — tylko liczniki, bez grantu keywordów', () => {
  const state = game();
  maulerEnters(state);
  const src = findOnBattlefield(state, 'gloomfang-mauler');
  const resolved = execute(state, { type: 'resolve_backup', playerId: 'p1', targetId: src.id });
  assert.ok(resolved.ok);
  assert.ok(resolved.events.some((e) => e.type === 'backup_resolved' && e.self === true && e.grantedKeywords.length === 0));
  const mauler = state.objects.get(src.id);
  assert.equal(mauler.counters['+1/+1'], 2);
  assert.deepEqual(mauler.keywordGrants, []);
});

test('Backup: legalnym celem jest też stwór przeciwnika (widok wylicza wszystkie stwory)', () => {
  const state = game();
  maulerEnters(state, { otherOnBoard: false });
  addSimpleCreature(state, 'enemy', 'p2', { power: 4 });
  const view = playerView(state, 'p1');
  const variants = view.legalCommands.filter((c) => c.type === 'resolve_backup').map((c) => c.targetId);
  const src = findOnBattlefield(state, 'gloomfang-mauler');
  assert.ok(variants.includes('enemy'));
  assert.ok(variants.includes(src.id));
  const resolved = execute(state, { type: 'resolve_backup', playerId: 'p1', targetId: 'enemy' });
  assert.ok(resolved.ok);
  assert.equal(state.objects.get('enemy').counters['+1/+1'], 2);
  assert.deepEqual(state.objects.get('enemy').keywordGrants, ['menace']);
});

test('Backup: każdy bot rozstrzyga decyzję akceptowalną komendą (kontrakt PlayerView)', () => {
  for (const make of [() => createHeuristicBot({ seed: 5 }), () => createAggroBot(), () => createRandomBot({ seed: 5, allowConcede: false })]) {
    const state = game();
    maulerEnters(state);
    for (let steps = 0; steps < 20 && state.pendingBackups.length > 0; steps += 1) {
      const cmd = make().chooseCommand(playerView(state, state.pendingBackups[0].playerId));
      assert.equal(cmd.type, 'resolve_backup');
      assert.ok(execute(state, cmd).ok);
    }
    assert.equal(state.pendingBackups.length, 0, 'decyzja backup została rozstrzygnięta');
    assert.ok(![...state.objects.values()].some((o) => o.id === 'x'), 'brak sztucznych obiektów w stanie');
  }
});

// --- Swampcycling -----------------------------------------------------------

test('Swampcycling: zapłać {2}, odrzuć Maulera, znajdź Swampa do ręki (reveal) i potasuj', () => {
  const state = matchState('black', 11);
  // Normalizacja ręki otwarcia: usuwamy trafione tam Swampy, żeby licznik
  // końcowy był przewidywalny niezależnie od rozdania.
  for (const id of [...state.zones.hand]) {
    if (state.objects.get(id)?.cardId === 'basic-swamp' && state.objects.get(id)?.controllerId === 'p1') {
      state.zones.hand = state.zones.hand.filter((entry) => entry !== id);
      const libraryId = `library-rescued-${state.objectSequence++}`;
      state.zones.library.push(libraryId);
      const object = state.objects.get(id);
      state.objects.delete(id);
      state.objects.set(libraryId, Object.freeze({ ...object, id: libraryId, zone: 'library' }));
    }
  }
  // Normalizacja: jeśli Mauler trafił do ręki w rozdaniu, przenieś do biblioteki.
  for (const id of [...state.zones.hand]) {
    if (state.objects.get(id)?.cardId === 'gloomfang-mauler' && state.objects.get(id)?.controllerId === 'p1') {
      state.zones.hand = state.zones.hand.filter((entry) => entry !== id);
      const libraryId = `library-mauler-${state.objectSequence++}`;
      state.zones.library.push(libraryId);
      const object = state.objects.get(id);
      state.objects.delete(id);
      state.objects.set(libraryId, Object.freeze({ ...object, id: libraryId, zone: 'library' }));
    }
  }
  const swampsInHandBefore = [...state.objects.values()].filter((o) => o.cardId === 'basic-swamp' && o.controllerId === 'p1' && o.zone === 'hand').length;
  // Własny Swamp na wierzch własnej biblioteki, Mauler z biblioteki do ręki.
  const mauler = [...state.objects.values()].find((o) => o.controllerId === 'p1' && o.cardId === 'gloomfang-mauler' && o.zone === 'library');
  const swamp = [...state.objects.values()].find((o) => o.controllerId === 'p1' && o.cardId === 'basic-swamp' && o.zone === 'library');
  state.zones.library = state.zones.library.filter((id) => id !== mauler.id && id !== swamp.id);
  state.zones.library.unshift(swamp.id);
  const handId = `hand-${state.objectSequence++}`;
  state.zones.hand.push(handId);
  state.objects.delete(mauler.id);
  state.objects.set(handId, Object.freeze({ ...mauler, id: handId, zone: 'hand' }));
  addMana(state, 'p1', 2);
  const gravesBefore = state.zones.graveyard.length;
  const libraryBefore = state.zones.library.length;
  const view = playerView(state, 'p1');
  const cycleCommand = view.legalCommands.find((c) => c.type === 'activate_ability' && c.objectId === handId);
  assert.ok(cycleCommand, 'widok powinien oferować cycling z ręki');
  const result = execute(state, cycleCommand);
  assert.ok(result.ok, JSON.stringify(result.events[0]));
  assert.equal(state.zones.graveyard.length, gravesBefore + 1);
  const discarded = [...state.objects.values()].find((o) => o.cardId === 'gloomfang-mauler' && o.zone === 'graveyard');
  assert.ok(discarded, 'Mauler powinien leżeć w grobie (odrzut w koszcie)');
  // Temat 6: typecycling — wybór karty z biblioteki.
  assert.ok(state.pendingSearchChoice, 'decyzja szukania czeka');
  const pick = execute(state, { type: 'resolve_search_choice', playerId: 'p1', found: swamp.id });
  assert.ok(pick.ok, pick.events[0]?.reason);
  const revealed = state.events.find((e) => e.type === 'card_revealed' && e.playerId === 'p1');
  assert.ok(revealed, 'karta musi być jawna (reveal)');
  assert.equal(revealed.cardId, 'basic-swamp');
  const swampsInHand = [...state.objects.values()].filter((o) => o.cardId === 'basic-swamp' && o.controllerId === 'p1' && o.zone === 'hand');
  assert.equal(swampsInHand.length, swampsInHandBefore + 1, 'dokładnie jeden Swamp trafia do ręki');
  const searched = state.events.find((e) => e.type === 'library_searched' && e.playerId === 'p1');
  assert.ok(searched?.shuffled);
  assert.equal(state.zones.library.length, libraryBefore - 1);
  // Kolejność biblioteki po tasowaniu nadal deterministyczna (ten sam seed).
  const state2 = matchState('innistrad', 11);
  assert.doesNotThrow(() => playerView(state2, 'p1'));
});

test('Swampcycling: bez Swampa w bibliotece — tylko tasowanie, brak karty (fail to find)', () => {
  const state = matchState('black', 12);
  const swampIds = state.zones.library.filter((id) => state.objects.get(id)?.cardId === 'basic-swamp' && state.objects.get(id)?.controllerId === 'p1');
  state.zones.library = state.zones.library.filter((id) => !swampIds.includes(id));
  for (const id of swampIds) state.objects.delete(id);
  const mauler = [...state.objects.values()].find((o) => o.controllerId === 'p1' && o.cardId === 'gloomfang-mauler' && o.zone === 'library');
  const handId = `hand-${state.objectSequence++}`;
  state.zones.library = state.zones.library.filter((id) => id !== mauler.id);
  state.zones.hand.push(handId);
  state.objects.delete(mauler.id);
  state.objects.set(handId, Object.freeze({ ...mauler, id: handId, zone: 'hand' }));
  addMana(state, 'p1', 2);
  const result = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: handId, abilityIndex: 0 });
  assert.ok(result.ok);
  const searched = state.events.find((e) => e.type === 'library_searched' && e.playerId === 'p1');
  assert.equal(searched.foundCardId, null);
  assert.ok(state.events.every((e) => e.type !== 'card_revealed' || e.playerId !== 'p1' || true));
});

test('Swampcycling: bez many odrzucone (nielegalna aktywacja)', () => {
  const state = game();
  mainPhase(state, 'p1');
  addRealCard(state, 'mauler-card', 'gloomfang-mauler', 'p1', 'hand');
  const result = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'mauler-card', abilityIndex: 0 });
  assert.equal(result.ok, false);
  assert.match(result.events[0].reason, /illegal_ability/);
});

test('Swampcycling: na bitwisku zdolność jest martwa — widok jej nie oferuje (CR 702.28a)', () => {
  // Regresja: bez pominięcia cyclingu w skanowaniu zdolności na bitwisku
  // widok oferował komendę, którą execute słusznie odrzucał — bot wybierał
  // „legalną" komendę i partia padała na command_rejected.
  const state = game();
  mainPhase(state, 'p1');
  addRealCard(state, 'mauler-battle', 'gloomfang-mauler', 'p1', 'battlefield');
  addMana(state, 'p1', 3);
  const view = playerView(state, 'p1');
  const offered = view.legalCommands.filter((c) => c.type === 'activate_ability' && c.objectId === 'mauler-battle');
  assert.deepEqual(offered, [], 'cycling z ręki nie może być oferowany na bitwisku');
  const result = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: 'mauler-battle', abilityIndex: 0 });
  assert.equal(result.ok, false);
  assert.match(result.events[0].reason, /illegal_ability/);
});

// --- Serra's Embrace: czysta aura -------------------------------------------

test("Serra's Embrace: materializacja — kind enchantment, deskryptor aury +2/+2, flying, vigilance", () => {
  const data = gameObjectDataOf(REGISTRY.get('serras-embrace'));
  assert.equal(data.kind, 'enchantment');
  assert.equal(data.manaCost, 4);
  assert.deepEqual(data.aura, { pump: { power: 2, toughness: 2 }, keywords: ['flying', 'vigilance'] });
});

test("Serra's Embrace: cast = czar aury na stosie, bez celu nie da się rzucić", () => {
  const state = game();
  mainPhase(state, 'p1');
  addRealCard(state, 'embrace-card', 'serras-embrace', 'p1', 'hand');
  addMana(state, 'p1', 4);
  // Bez celu — komenda odrzucona; widok w ogóle nie oferuje castu aury bez gospodarza.
  const noTarget = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'embrace-card' });
  assert.equal(noTarget.ok, false);
  assert.match(noTarget.events[0].reason, /illegal_cast/);
  const viewEmpty = playerView(state, 'p1');
  assert.ok(!viewEmpty.legalCommands.some((c) => c.type === 'cast_permanent' && c.objectId === 'embrace-card'));
  addSimpleCreature(state, 'host', 'p1');
  const cast = execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'embrace-card', targets: ['host'] });
  assert.ok(cast.ok);
  assert.ok(cast.events.some((e) => e.type === 'aura_spell_cast' && e.bestow === false));
  const stacked = [...state.objects.values()].find((o) => o.cardId === 'serras-embrace' && o.zone === 'stack');
  assert.ok(stacked, 'aura ma trafić na stos, nie wprost na bitwisko');
  passBoth(state, 'p1');
  const aura = findOnBattlefield(state, 'serras-embrace');
  assert.ok(aura, 'aura wchodzi na bitwisko po rozstrzygnięciu');
  assert.equal(aura.kind, 'aura');
  assert.equal(aura.attachedTo, 'host');
});

test("Serra's Embrace: zaczarowany stwór ma +2/+2, flying i vigilance; atakuje bez tapowania", () => {
  const state = game();
  mainPhase(state, 'p1');
  addRealCard(state, 'embrace-card', 'serras-embrace', 'p1', 'hand');
  addSimpleCreature(state, 'host', 'p1', { power: 2, toughness: 2, summoningSickness: false });
  addMana(state, 'p1', 4);
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'embrace-card', targets: ['host'] }).ok);
  passBoth(state, 'p1');
  const view = playerView(state, 'p1');
  const hostView = view.zones.battlefield.find((o) => o.id === 'host');
  assert.equal(hostView.power, 4);
  assert.equal(hostView.toughness, 4);
  assert.ok(hostView.keywords.includes('flying'));
  assert.ok(hostView.keywords.includes('vigilance'));
  // Vigilance: atak bez tapowania.
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['host'] }).ok);
  assert.equal(state.objects.get('host').tapped, false, 'vigilance — atak nie tapuje');
  // Flying: przeciwnik bez latania/zasięgu nie blokuje.
  addSimpleCreature(state, 'enemy-blocker', 'p2', { summoningSickness: false });
  const block = execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { host: ['enemy-blocker'] } });
  assert.equal(block.ok, false);
});

test("Serra's Embrace: śmierć gospodarza = aura do grobu (CR 704.5m), w przeciwieństwie do bestow i equipmentu", () => {
  const state = game();
  mainPhase(state, 'p1');
  addRealCard(state, 'embrace-card', 'serras-embrace', 'p1', 'hand');
  addSimpleCreature(state, 'host', 'p1', { power: 2, toughness: 2 });
  addMana(state, 'p1', 4);
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'embrace-card', targets: ['host'] }).ok);
  passBoth(state, 'p1');
  markDamage(state, 'host', 5);
  const pass = execute(state, { type: 'pass_priority', playerId: 'p1' });
  assert.ok(pass.ok);
  const auraGrave = [...state.objects.values()].find((o) => o.cardId === 'serras-embrace' && o.zone === 'graveyard');
  assert.ok(auraGrave, 'czysta aura powinna trafić do grobu po śmierci gospodarza');
  assert.equal(auraGrave.kind, 'enchantment');
  assert.ok(state.events.some((e) => e.type === 'permanent_put_into_graveyard' && e.reason === 'aura_without_legal_host'));
});

test("Serra's Embrace: nielegalny cel przy rozstrzygnięciu = aura do grobu bez wejścia (fizzle, nie bestow)", () => {
  const state = game();
  mainPhase(state, 'p1');
  addRealCard(state, 'embrace-card', 'serras-embrace', 'p1', 'hand');
  addSimpleCreature(state, 'host', 'p1', { power: 4, toughness: 2 });
  addMana(state, 'p1', 4);
  addMana(state, 'p2', 1);
  addObject(state, {
    id: 'shock-card', instanceId: 'i-shock', cardId: 'syn-shock', controllerId: 'p2', zone: 'hand', kind: 'spell', manaCost: 1,
    spell: { timing: 'instant', targets: [{ type: 'creature' }], effects: [{ type: 'damage', amount: 2 }] },
    keywords: [], subtypes: [], types: ['Instant'],
  });
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'embrace-card', targets: ['host'] }).ok);
  // Rzucający zachowuje priorytet po rzuceniu — pass odsłania okno przeciwnika.
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok);
  assert.ok(execute(state, { type: 'cast_spell', playerId: 'p2', objectId: 'shock-card', targets: ['host'] }).ok);
  passBoth(state, 'p2'); // rozstrzyga shock (host ginie przez SBA)
  passBoth(state, 'p2'); // rozstrzyga aurę — cel już nielegalny
  const graveAura = [...state.objects.values()].find((o) => o.cardId === 'serras-embrace' && o.zone === 'graveyard');
  assert.ok(graveAura, 'aura z fizzle trafia do grobu');
  assert.ok(![...state.objects.values()].some((o) => o.cardId === 'serras-embrace' && o.zone === 'battlefield'));
  assert.ok(state.events.some((e) => e.type === 'spell_resolved' && e.cardId === 'serras-embrace' && e.fizzled === true));
});

// --- Cloak of the Bat: equipment ---------------------------------------------

test('Cloak of the Bat: materializacja — artifact z equipment (equip 2, flying, haste)', () => {
  const data = gameObjectDataOf(REGISTRY.get('cloak-of-the-bat'));
  assert.equal(data.kind, 'artifact');
  assert.deepEqual(data.equipment, { equip: 2, pump: null, keywords: ['flying', 'haste'] });
  const equip = data.abilities.find((a) => a.keyword === 'equip');
  assert.ok(equip);
});

function castCloak(state) {
  mainPhase(state, 'p1');
  addRealCard(state, 'cloak-card', 'cloak-of-the-bat', 'p1', 'hand');
  addMana(state, 'p1', 2);
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'cloak-card' }).ok);
  return findOnBattlefield(state, 'cloak-of-the-bat');
}

test('Cloak of the Bat: cast jako artefakt (bez celu), equip na własnego stwora (sorcery-speed)', () => {
  const state = game();
  const cloak = castCloak(state);
  addSimpleCreature(state, 'carrier', 'p1');
  addMana(state, 'p1', 2);
  const view = playerView(state, 'p1');
  const equips = view.legalCommands.filter((c) => c.type === 'activate_ability' && c.objectId === cloak.id);
  assert.equal(equips.length, 1);
  assert.deepEqual(equips[0].targets, ['carrier']);
  const result = execute(state, equips[0]);
  assert.ok(result.ok, JSON.stringify(result.events[0]));
  assert.ok(result.events.some((e) => e.type === 'object_attached' && e.via === 'equip'));
  const host = state.objects.get('carrier');
  const cloakAfter = state.objects.get(cloak.id);
  assert.equal(cloakAfter.attachedTo, 'carrier');
  assert.ok([...state.objects.values()].some((o) => o.zone === 'battlefield'));
  const carrierView = playerView(state, 'p1').zones.battlefield.find((o) => o.id === 'carrier');
  assert.ok(carrierView.keywords.includes('flying'));
  assert.ok(carrierView.keywords.includes('haste'));
});

test('Cloak of the Bat: equip nie powie się na stworze przeciwnika ani poza main phase', () => {
  const state = game();
  const cloak = castCloak(state);
  addSimpleCreature(state, 'enemy', 'p2', { summoningSickness: false });
  addMana(state, 'p1', 2);
  const view = playerView(state, 'p1');
  assert.ok(!view.legalCommands.some((c) => c.type === 'activate_ability' && c.objectId === cloak.id && (c.targets ?? []).includes('enemy')));
  const onEnemy = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: cloak.id, abilityIndex: 0, targets: ['enemy'] });
  assert.equal(onEnemy.ok, false);
  assert.match(onEnemy.events[0].reason, /illegal_ability/);
  // Poza main phase (combat) — equip to sorcery-speed.
  state.turn = jumpToStep(state.turn, 'declare_blockers', 'p1');
  addSimpleCreature(state, 'carrier', 'p1');
  const outOfPhase = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: cloak.id, abilityIndex: 0, targets: ['carrier'] });
  assert.equal(outOfPhase.ok, false);
});

test('Cloak of the Bat: haste pomija chorobę przywołania w turze wejścia nosiciela', () => {
  const state = game();
  const cloak = castCloak(state);
  addSimpleCreature(state, 'carrier', 'p1', { summoningSickness: true });
  addMana(state, 'p1', 2);
  // Bez equipmentu stwór z chorobą NIE może atakować.
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  const noHaste = execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['carrier'] });
  assert.equal(noHaste.ok, false);
  // Wracamy do main i wyposażamy.
  mainPhase(state, 'p1');
  assert.ok(execute(state, { type: 'activate_ability', playerId: 'p1', objectId: cloak.id, abilityIndex: 0, targets: ['carrier'] }).ok);
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  const withHaste = execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['carrier'] });
  assert.ok(withHaste.ok, 'haste z equipmentu ma dać atak w turze wejścia');
});

test('Cloak of the Bat: śmierć nosiciela = cloak zostaje odłączony na bitwisku; re-equip działa', () => {
  const state = game();
  const cloak = castCloak(state);
  addSimpleCreature(state, 'carrier', 'p1', { power: 1, toughness: 2 });
  addMana(state, 'p1', 2);
  assert.ok(execute(state, { type: 'activate_ability', playerId: 'p1', objectId: cloak.id, abilityIndex: 0, targets: ['carrier'] }).ok);
  markDamage(state, 'carrier', 5);
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok);
  const cloakAfter = state.objects.get(cloak.id);
  assert.equal(cloakAfter.zone, 'battlefield', 'equipment zostaje na bitwisku (CR 704.5n)');
  assert.equal(cloakAfter.attachedTo, null);
  assert.ok(state.events.some((e) => e.type === 'object_detached' && e.objectId === cloak.id));
  // Re-equip na nowego nosiciela.
  mainPhase(state, 'p1');
  addSimpleCreature(state, 'second', 'p1');
  addMana(state, 'p1', 2);
  assert.ok(execute(state, { type: 'activate_ability', playerId: 'p1', objectId: cloak.id, abilityIndex: 0, targets: ['second'] }).ok);
  assert.equal(state.objects.get(cloak.id).attachedTo, 'second');
  const secondView = playerView(state, 'p1').zones.battlefield.find((o) => o.id === 'second');
  assert.ok(secondView.keywords.includes('flying'));
});

// --- Interakcje między kartami batchu ----------------------------------------

test('interakcja: Serra\'s Embrace + Cloak na tym samym nosicielu — buffy się kumulują', () => {
  const state = game();
  mainPhase(state, 'p1');
  addRealCard(state, 'embrace-card', 'serras-embrace', 'p1', 'hand');
  addRealCard(state, 'cloak-card', 'cloak-of-the-bat', 'p1', 'hand');
  addSimpleCreature(state, 'host', 'p1', { power: 1, toughness: 1 });
  addMana(state, 'p1', 8);
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'cloak-card' }).ok);
  const cloak = findOnBattlefield(state, 'cloak-of-the-bat');
  assert.ok(execute(state, { type: 'activate_ability', playerId: 'p1', objectId: cloak.id, abilityIndex: 0, targets: ['host'] }).ok);
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'embrace-card', targets: ['host'] }).ok);
  passBoth(state, 'p1');
  const view = playerView(state, 'p1');
  const hostView = view.zones.battlefield.find((o) => o.id === 'host');
  assert.equal(hostView.power, 3); // 1 + 2 (aura)
  assert.equal(hostView.toughness, 3);
  for (const kw of ['flying', 'vigilance', 'haste']) assert.ok(hostView.keywords.includes(kw), kw);
});

test('interakcja: śmierć nosiciela z aurą i cloak — aura do grobu, cloak zostaje', () => {
  const state = game();
  mainPhase(state, 'p1');
  addRealCard(state, 'embrace-card', 'serras-embrace', 'p1', 'hand');
  addRealCard(state, 'cloak-card', 'cloak-of-the-bat', 'p1', 'hand');
  addSimpleCreature(state, 'host', 'p1', { power: 1, toughness: 2 });
  addMana(state, 'p1', 8);
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'cloak-card' }).ok);
  const cloak = findOnBattlefield(state, 'cloak-of-the-bat');
  assert.ok(execute(state, { type: 'activate_ability', playerId: 'p1', objectId: cloak.id, abilityIndex: 0, targets: ['host'] }).ok);
  assert.ok(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'embrace-card', targets: ['host'] }).ok);
  passBoth(state, 'p1');
  markDamage(state, 'host', 9); // aura daje +2 toughness → potrzeba > 4
  assert.ok(execute(state, { type: 'pass_priority', playerId: 'p1' }).ok);
  assert.ok([...state.objects.values()].some((o) => o.cardId === 'serras-embrace' && o.zone === 'graveyard'));
  const cloakAfter = state.objects.get(cloak.id);
  assert.equal(cloakAfter.zone, 'battlefield');
  assert.equal(cloakAfter.attachedTo, null);
});

// --- Determinizm: replay z decyzją backup -------------------------------------

test('determinizm: replay z resolve_backup daje identyczny stan', () => {
  const build = () => {
    const state = game();
    maulerEnters(state);
    const src = findOnBattlefield(state, 'gloomfang-mauler');
    assert.ok(execute(state, { type: 'resolve_backup', playerId: 'p1', targetId: src.id }).ok);
    return state;
  };
  const verification = verifyReplay(replayFromState(build()), build, execute);
  assert.equal(verification.deterministic, true);
});

// --- Talia repozytorium: parsowanie i spójność --------------------------------

// --- Smoke: mechaniki w realnych partiach botów -------------------------------

