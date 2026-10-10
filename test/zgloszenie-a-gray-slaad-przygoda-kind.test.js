import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';

/**
 * Zgłoszenie A (właściciel, 2026-10-10): Gray Slaad, który wszedł na pole
 * bitwy Z EXILE po rozstrzygnięciu przygody (Entropic Decay), zachowywał się
 * jak nie-stwór:
 *   A  — Diplomatic Relations nie pokazywało oferty rzutu („tak jakby nie było
 *        legalnych celów”), choć żadna kreatura nie miała hexproof/shroud;
 *   A1 — ETB Warmaker Gunship logował „trigger bez efektu (brak legalnych
 *        celów)”, choć Slaad stał na stole;
 *   A2 — bot mając TYLKO Slaada nie blokował nim ataku, który go zabijał.
 *
 * Przyczyna (jedna, wspólna dla wszystkich trzech objawów): `castAdventure`
 * nadpisuje na obiekcie `kind: 'spell'` (na stosie przygoda jest czarem
 * sorcery — poprawnie), ale ten stan PRZETRWAŁ do exile, a
 * `castAdventureCreature` czyścił tylko deskryptor `spell`, nie `kind`.
 * Permanent wchodził więc na pole bitwy z `kind: 'spell'`, a wszystkie
 * filtry celów i bloków w silniku wymagają `kind === 'creature'`.
 *
 * Naprawa: strona-stwór karty z przygodą odbudowuje `kind` z linii typu
 * (CR 205.2a) — wspólny odczyt `kindFromTypes` (ten sam co druga strona DFC).
 *
 * Pinowane tutaj:
 *  1. ROOT CAUSE: permanent z przygody ma `kind: 'creature'` (i `formerKind`,
 *     które liczy się z `kind` przy zmianie strefy — LKI dla triggerów „dies");
 *  2. objaw A:  Diplomatic Relations oferuje rzut z celem w stwora z przygody;
 *  3. objaw A1: ETB Warmaker Gunship znajduje cel i zadaje obrażenia (brak
 *     wpisu „no_targets");
 *  4. objaw A2: stwór z przygody jest legalnym blokerem (oferta + deklaracja);
 *  5. KONTROLA anty-prze-naprawy: zwykły rzut tej samej karty bez przygody
 *     nadal działa tak samo (fix nie zmienia ścieżki z ręki).
 */

const REGISTRY = createCardRegistry();

function game(seed) {
  const state = createGameState({ seed, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p2');
  state.turn.activePlayerId = 'p2';
  state.turn.priorityPlayerId = 'p2';
  return state;
}

function put(state, id, cardId, playerId = 'p1', zone = 'hand', patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell,
  });
  if (Object.keys(patch).length) state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
  return state.objects.get(id);
}

function settle(state, max = 12) {
  for (let i = 0; i < max && state.zones.stack.length > 0; i += 1) {
    const r = execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
    if (!r.ok) return false;
  }
  return true;
}

/** Tura p2: przygoda Gray Slaada, potem stwór z exile (log partii: tura 3 i 5). */
function slaadZPrzygody(state) {
  put(state, 'slaad', 'gray-slaad', 'p2', 'hand');
  for (let i = 0; i < 6; i += 1) put(state, `lib-${i}`, 'alaborn-trooper', 'p2', 'library');
  addMana(state, 'p2', 5, { colors: ['B'] });
  const adventure = playerView(state, 'p2').legalCommands
    .find((c) => c.type === 'cast_adventure' && c.objectId === 'slaad');
  assert.ok(adventure, 'oferta rzutu przygody (Entropic Decay)');
  assert.ok(execute(state, adventure).ok, 'przygoda rzucona');
  assert.ok(settle(state), 'przygoda rozstrzygnięta');

  const inExile = [...state.objects.values()].find((o) => o.cardId === 'gray-slaad');
  assert.equal(inExile.zone, 'exile', 'karta czeka w exile „on an adventure” (CR 715.3)');

  addMana(state, 'p2', 5, { colors: ['B'] });
  const creature = playerView(state, 'p2').legalCommands.find((c) => c.type === 'cast_adventure_creature');
  assert.ok(creature, 'oferta rzutu strony-stwora z exile');
  assert.ok(execute(state, creature).ok, 'stwór rzucony z exile');
  assert.ok(settle(state), 'stwór rozstrzygnięty');
  const onBoard = [...state.objects.values()].find((o) => o.cardId === 'gray-slaad' && o.zone === 'battlefield');
  assert.ok(onBoard, 'Gray Slaad na polu bitwy');
  return onBoard;
}

/** Tura p1 po wejściu Slaada. */
function turaP1(state) {
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
}

// --- 1. ROOT CAUSE ---------------------------------------------------------

test('Zgłoszenie A/1: stwór z przygody wchodzi na pole bitwy jako STWÓR (kind, formerKind)', () => {
  const state = game(919670);
  const slaad = slaadZPrzygody(state);
  assert.equal(slaad.kind, 'creature', 'kind z linii typu (CR 205.2a), nie „spell” z przygody');
  assert.deepEqual(slaad.types, ['Creature']);
  assert.equal(slaad.power, 4);
  assert.equal(slaad.toughness, 1);
  assert.equal(slaad.spell, null, 'deskryptor czaru przygody wykreślony');
  // formerKind liczy się z kind przy każdej zmianie strefy (LKI, CR 603.10) —
  // bez naprawy kind niósł tu 'spell' i triggery „dies" czytały zły rodzaj.
  assert.equal(slaad.formerKind, 'creature');
});

test('Zgłoszenie A/1b: stwór z przygody ginie jako stwor (LKI w grobie)', () => {
  const state = game(919670);
  const slaad = slaadZPrzygody(state);
  // 4/1 — wystarczy 1 obrażenie, żeby zginął (SBA przy najbliższej akcji).
  state.objects.set(slaad.id, Object.freeze({ ...state.objects.get(slaad.id), damage: 1 }));
  assert.ok(execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId }).ok);
  const after = [...state.objects.values()].find((o) => o.cardId === 'gray-slaad');
  assert.equal(after.zone, 'graveyard', 'stwór z 1 obrażeniem i wytrzymałością 1 ginie');
  assert.equal(after.kind, 'creature');
  assert.equal(after.formerKind, 'creature', 'LKI: zginął jako stwor');
});

// --- 2. OBJAW A: Diplomatic Relations --------------------------------------

test('Zgłoszenie A/2: Diplomatic Relations oferuje rzut z celem w stwora z przygody', () => {
  const state = game(919670);
  const slaad = slaadZPrzygody(state);
  turaP1(state);
  put(state, 'sentinel', 'nanoform-sentinel', 'p1', 'battlefield');
  put(state, 'relations', 'diplomatic-relations', 'p1', 'hand');
  addMana(state, 'p1', 3, { colors: ['G'] });

  const offers = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'cast_spell' && c.objectId === 'relations');
  assert.ok(offers.length > 0, 'oferta rzutu istnieje (przed naprawą: brak — „brak legalnych celów”)');
  assert.ok(offers.some((c) => (c.targets ?? [])[1] === slaad.id),
    'slot 1 („target creature an opponent controls”) obejmuje stwora z przygody');

  const cast = offers.find((c) => (c.targets ?? [])[1] === slaad.id);
  assert.ok(execute(state, cast).ok, 'rzut z tym celem przechodzi walidację');
  assert.ok(settle(state), 'czar rozstrzygnięty');
  const dmg = state.events.filter((e) => e.type === 'damage_dealt' && e.target === slaad.id);
  assert.ok(dmg.length > 0, 'stwór z przygody dostał obrażenia od Diplomatic Relations');
});

// --- 3. OBJAW A1: ETB Warmaker Gunship -------------------------------------

test('Zgłoszenie A/3: ETB Warmaker Gunship znajduje cel w stworze z przygody (bez „no_targets”)', () => {
  const state = game(919670);
  const slaad = slaadZPrzygody(state);
  turaP1(state);
  put(state, 'gun', 'warmaker-gunship', 'p1', 'hand');
  addMana(state, 'p1', 4, { colors: ['R'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'gun');
  assert.ok(execute(state, cast).ok, 'Warmaker Gunship rzucony');
  assert.ok(settle(state), 'stwór i trigger rozstrzygnięte');

  const noTargets = state.events.filter((e) => e.reason === 'no_targets');
  assert.deepEqual(noTargets, [], 'trigger NIE rozstrzyga się jako „brak legalnych celów”');
  const chosen = state.events.filter((e) => e.type === 'trigger_target_resolved');
  assert.ok(chosen.some((e) => e.targetId === slaad.id), 'celem ETB został stwór z przygody');
  const dmg = state.events.filter((e) => e.type === 'damage_dealt' && e.target === slaad.id);
  assert.equal(dmg.length, 1, 'obrażenia zadane');
  assert.equal(dmg[0].amount, 1, '1 artefakt pod kontrolą = 1 obrażenie');
});

// --- 4. OBJAW A2: blokowanie -----------------------------------------------

test('Zgłoszenie A/4: stwór z przygody może blokować (oferta i deklaracja)', () => {
  const state = game(919670);
  const slaad = slaadZPrzygody(state);
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  put(state, 'atak', 'alaborn-trooper', 'p1', 'battlefield');
  assert.ok(execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: ['atak'] }).ok);
  state.turn = jumpToStep(state.turn, 'declare_blockers', 'p2');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p2';

  const wanted = JSON.stringify({ atak: [slaad.id] });
  assert.ok(playerView(state, 'p2').legalCommands
    .some((c) => c.type === 'declare_blockers' && JSON.stringify(c.assignments ?? {}) === wanted),
    'oferta bloku stworem z przygody istnieje');
  const r = execute(state, { type: 'declare_blockers', playerId: 'p2', assignments: { atak: [slaad.id] } });
  assert.ok(r.ok, 'deklaracja bloku przechodzi (przed naprawą: stwór nie był stworem dla silnika)');
});

// --- 5. KONTROLA anty-prze-naprawy -----------------------------------------

test('Zgłoszenie A/5: zwykły rzut Gray Slaada (bez przygody) działa tak samo', () => {
  const state = game(919671);
  put(state, 'slaad', 'gray-slaad', 'p2', 'hand');
  addMana(state, 'p2', 5, { colors: ['B'] });
  const cast = playerView(state, 'p2').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'slaad');
  assert.ok(cast, 'oferta zwykłego rzutu');
  assert.ok(execute(state, cast).ok);
  assert.ok(settle(state));
  const onBoard = [...state.objects.values()].find((o) => o.cardId === 'gray-slaad' && o.zone === 'battlefield');
  assert.equal(onBoard.kind, 'creature');
  assert.equal(onBoard.power, 4);
  assert.equal(onBoard.toughness, 1);
  // Druga karta z przygodą w katalogu — ta sama ścieżka, ten sam kontrakt.
  const state2 = game(919672);
  put(state2, 'ettercap', 'ettercap', 'p2', 'hand');
  for (let i = 0; i < 6; i += 1) put(state2, `lib-${i}`, 'alaborn-trooper', 'p2', 'library');
  addMana(state2, 'p2', 6, { colors: ['G'] });
  const adv = playerView(state2, 'p2').legalCommands
    .find((c) => c.type === 'cast_adventure' && c.objectId === 'ettercap');
  if (adv) {
    assert.ok(execute(state2, adv).ok, 'przygoda Ettercap rzucona');
    assert.ok(settle(state2));
    addMana(state2, 'p2', 6, { colors: ['G'] });
    const creature = playerView(state2, 'p2').legalCommands.find((c) => c.type === 'cast_adventure_creature');
    if (creature) {
      assert.ok(execute(state2, creature).ok);
      assert.ok(settle(state2));
      const ettercap = [...state2.objects.values()].find((o) => o.cardId === 'ettercap' && o.zone === 'battlefield');
      assert.equal(ettercap.kind, 'creature', 'Ettercap z przygody też jest stworem');
    }
  }
});
