import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { applyEffect } from '../src/engine/effects.js';
import { addCounter } from '../src/engine/counters.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { cardInfo, rulesText, commandLabel } from '../src/table/render.js';
import { describeGameEvent } from '../src/table/session.js';

/**
 * M258/F3 (decyzja właściciela: „nie akceptuję żadnych limitations"):
 * WARD (CR 702.21) jako PEŁNA mechanika, nie wpis w support.limitations.
 *
 * Ward {N}: „Whenever this permanent becomes the target of a spell or
 * ability an opponent controls, counter that spell or ability unless
 * that player pays {N}." Źródłem w katalogu jest CLOAK (CR 702.75 —
 * Veiled Ascension): zakryty permanent to 2/2 z ward {2}.
 *
 * Model silnika: ward jako trigger kolejkowany NAD czarem celującym
 * (CR 603.3 — rozstrzyga się przed nim po rundzie passów), a przy
 * rozstrzygnięciu — decyzja blokująca resolve_ward_pay_choice (jak
 * counter_spell_unless_pays z Batcha 44). Bez many: automatyczny kontr.
 */

const REGISTRY = createCardRegistry();

const SESSION_MOCK = {
  nameOf: (id) => REGISTRY.get(id)?.name ?? String(id),
  nameOfObject: (id) => String(id),
  cardDetails: (id) => REGISTRY.get(id) ?? null,
  colorsOf: (id) => REGISTRY.get(id)?.colors ?? [],
  view: () => ({ zones: { hand: [], battlefield: [], stack: [], graveyard: [], library: [] } }),
};

function game(playerId = 'p1') {
  const state = createGameState({ seed: 42, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', playerId);
  state.turn.activePlayerId = playerId;
  state.turn.priorityPlayerId = playerId;
  return state;
}

function putCard(state, id, cardId, controllerId, zone = 'battlefield', patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, ...patch,
  });
  return state.objects.get(id);
}

/** Cloaked 2/2 gracza `ownerId` (efekt cloak z Veiled Ascension). */
function cloakedCreature(state, ownerId = 'p1') {
  putCard(state, 'va', 'veiled-ascension', ownerId);
  putCard(state, 'lib-top', 'welder-automaton', ownerId, 'library');
  applyEffect(state, { type: 'cloak' }, state.objects.get('va'), []);
  return state.zones.battlefield
    .map((id) => state.objects.get(id))
    .find((o) => o.faceDown && o.controllerId === ownerId);
}

const stackObjects = (state) => state.zones.stack.map((id) => state.objects.get(id));

test('M258/W1: cloak tworzy 2/2 z ward {2} (CR 702.75)', () => {
  const state = game();
  const cloaked = cloakedCreature(state, 'p1');
  assert.ok(cloaked, 'zakryty permanent powstał');
  assert.equal(cloaked.power, 2);
  assert.equal(cloaked.toughness, 2);
  assert.ok((cloaked.keywords ?? []).includes('ward'), 'keyword ward na obiekcie (RED przed fixem)');
  assert.equal(cloaked.ward, 2, 'wartość ward {2} (RED przed fixem)');
});

test('M258/W2: czar przeciwnika celujący w ward — odmowa zapłaty = kontr (CR 702.21)', () => {
  const state = game('p2');
  const cloaked = cloakedCreature(state, 'p1');
  putCard(state, 'shock', 'shock', 'p2', 'hand');
  addMana(state, 'p2', 5, { colors: ['R'] });

  const r = execute(state, { type: 'cast_spell', playerId: 'p2', objectId: 'shock', targets: [cloaked.id] });
  assert.equal(r.ok, true, 'rzut Shocka się udał');

  const wardEntry = stackObjects(state).find((o) => o.triggerEntry?.extra?.wardPay);
  assert.ok(wardEntry, 'trigger ward na stosie NAD czarem (RED przed fixem)');
  assert.equal(wardEntry.triggerEntry.extra.wardPay.amount, 2);
  assert.equal(wardEntry.controllerId, 'p1', 'trigger ward kontroluje właściciel permanentu');

  // pełna runda passów rozstrzyga NAJPIERW trigger ward (LIFO)
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  assert.ok(state.pendingWardPay, 'decyzja zapłaty ward otwarta (RED przed fixem)');
  assert.equal(state.pendingWardPay.playerId, 'p2', 'płaci kontroler czaru celującego');
  assert.equal(state.pendingWardPay.amount, 2);

  const view = playerView(state, 'p2');
  assert.ok(view.legalCommands.some((c) => c.type === 'resolve_ward_pay_choice' && c.pay === false),
    'widok oferuje odmowę zapłaty');

  const r2 = execute(state, { type: 'resolve_ward_pay_choice', playerId: 'p2', pay: false });
  assert.equal(r2.ok, true);
  assert.ok(state.zones.graveyard.map((id) => state.objects.get(id)).some((o) => o.cardId === 'shock'),
    'Shock skontrowany — w grobie');
  assert.ok(state.events.some((e) => e.type === 'spell_countered'), 'zdarzenie spell_countered');
  assert.equal(state.objects.get(cloaked.id)?.zone, 'battlefield', 'zakryty permanent nietykalny');
});

test('M258/W3: zapłata {2} — czar przechodzi i rozstrzyga się normalnie', () => {
  const state = game('p2');
  const cloaked = cloakedCreature(state, 'p1');
  putCard(state, 'shock', 'shock', 'p2', 'hand');
  addMana(state, 'p2', 5, { colors: ['R'] });

  execute(state, { type: 'cast_spell', playerId: 'p2', objectId: 'shock', targets: [cloaked.id] });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  assert.ok(state.pendingWardPay);
  const manaBefore = state.players.find((p) => p.id === 'p2').mana;
  const r = execute(state, { type: 'resolve_ward_pay_choice', playerId: 'p2', pay: true });
  assert.equal(r.ok, true);
  assert.ok(state.players.find((p) => p.id === 'p2').mana <= manaBefore - 2, 'zapłacono {2}');
  assert.ok(!state.events.some((e) => e.type === 'spell_countered'), 'bez kontra');

  // runda passów rozstrzyga Shock: 2 obrażenia zabijają 2/2
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  assert.ok(state.zones.graveyard.map((id) => state.objects.get(id)).some((o) => o.cardId === 'shock'),
    'Shock rozstrzygnięty (grobowiec)');
  assert.ok(state.events.some((e) => e.type === 'ward_pay_resolved'), 'zdarzenie ward_pay_resolved');
});

test('M258/W4: bez many na ward — czar skontrowany automatycznie („unless")', () => {
  const state = game('p2');
  const cloaked = cloakedCreature(state, 'p1');
  putCard(state, 'shock', 'shock', 'p2', 'hand');
  addMana(state, 'p2', 1, { colors: ['R'] }); // tylko na Shock

  execute(state, { type: 'cast_spell', playerId: 'p2', objectId: 'shock', targets: [cloaked.id] });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  assert.equal(state.pendingWardPay, null, 'bez many nie ma decyzji — automatyczny kontr');
  assert.ok(state.zones.graveyard.map((id) => state.objects.get(id)).some((o) => o.cardId === 'shock'),
    'Shock skontrowany');
  assert.equal(state.objects.get(cloaked.id)?.zone, 'battlefield', 'zakryty permanent ocalał');
});

test('M258/W5: WŁASNY czar na własnego ward — trigger nie odpala (anty-over-fix)', () => {
  const state = game('p1');
  const cloaked = cloakedCreature(state, 'p1');
  putCard(state, 'shock', 'shock', 'p1', 'hand');
  addMana(state, 'p1', 3, { colors: ['R'] });

  const r = execute(state, { type: 'cast_spell', playerId: 'p1', objectId: 'shock', targets: [cloaked.id] });
  assert.equal(r.ok, true);
  assert.equal(stackObjects(state).filter((o) => o.triggerEntry?.extra?.wardPay).length, 0,
    'ward chroni tylko przed CZARAMI PRZECIWNIKÓW');
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  assert.equal(state.pendingWardPay, null);
  assert.ok(state.zones.graveyard.map((id) => state.objects.get(id)).some((o) => o.cardId === 'shock'),
    'Shock rozstrzygnięty normalnie (2 obrażenia na własnego 2/2)');
});

test('M258/W6: zdolność aktywowana przeciwnika celująca w ward — kontr przy odmowie', () => {
  const state = game('p2');
  const cloaked = cloakedCreature(state, 'p1');
  // Trigon of Corruption: {2}, {T}, usuń licznik charge: -1/-1 na celowany
  // stwór — zdolność nr 1 (nr 0 to doładowanie bez celu).
  const trigon = putCard(state, 'trigon', 'trigon-of-corruption', 'p2', 'battlefield');
  addCounter(state, 'trigon', 'charge', 1);
  addMana(state, 'p2', 6, { colors: ['B'] });

  const r = execute(state, { type: 'activate_ability', playerId: 'p2', objectId: 'trigon', abilityIndex: 1, targets: [cloaked.id] });
  assert.equal(r.ok, true, 'aktywacja się udała');
  const wardEntry = stackObjects(state).find((o) => o.triggerEntry?.extra?.wardPay);
  assert.ok(wardEntry, 'ward odpala też na ZDOLNOŚCI (CR 702.21: „spell or ability") — RED przed fixem');

  execute(state, { type: 'pass_priority', playerId: 'p2' });
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  assert.ok(state.pendingWardPay, 'decyzja zapłaty otwarta');
  const r2 = execute(state, { type: 'resolve_ward_pay_choice', playerId: 'p2', pay: false });
  assert.equal(r2.ok, true);

  // zdolność skontrowana: brak -1/-1 na celu; koszty (mana, tap, licznik) nie wracają
  assert.equal((state.objects.get(cloaked.id)?.counters ?? {})['-1/-1'], undefined,
    'zdolność skontrowana — licznik -1/-1 nie nałożony');
  assert.ok(state.objects.get('trigon')?.tapped, 'koszt tapnięcia nie zwracany (rzut nieudany ≠ zwrot kosztów)');
});

test('M258/W7: zdolność TRIGGEROWANA przeciwnika z celem w ward — kontr przy odmowie', () => {
  const state = game('p2');
  const cloaked = cloakedCreature(state, 'p1');
  // Molten Nursery: whenever cast colorless spell → 1 damage to any target
  putCard(state, 'nursery', 'molten-nursery', 'p2');
  putCard(state, 'auto', 'welder-automaton', 'p2', 'hand'); // bezbarwny czar
  addMana(state, 'p2', 6, { colors: ['R'] });

  const r = execute(state, { type: 'cast_permanent', playerId: 'p2', objectId: 'auto' });
  assert.equal(r.ok, true, 'bezbarwny czar rzucony');
  assert.ok(state.pendingTriggerTargets?.length, 'decyzja celu triggera Nursery otwarta');
  const r2 = execute(state, {
    type: 'resolve_trigger_target', playerId: 'p2',
    targetId: cloaked.id,
  });
  assert.equal(r2.ok, true, 'cel wskazany');

  const wardEntry = stackObjects(state).find((o) => o.triggerEntry?.extra?.wardPay);
  assert.ok(wardEntry, 'ward odpala na triggerze z celem — RED przed fixem');

  execute(state, { type: 'pass_priority', playerId: 'p2' });
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  const r3 = execute(state, { type: 'resolve_ward_pay_choice', playerId: 'p2', pay: false });
  assert.equal(r3.ok, true);

  // trigger Nursery skontrowany — brak obrażeń na zakrytym
  const after = state.objects.get(cloaked.id);
  assert.equal(after?.zone, 'battlefield', 'zakryty permanent nietknięty');
  assert.equal(after?.damage ?? 0, 0, 'obrażenia z triggera nie zadane (zdolność skontrowana)');
});

test('M258/W8: kafel zakrytego z ward pokazuje „Ward {2}" (oś 2 — to nie informacja ukryta)', () => {
  const state = game();
  const cloaked = cloakedCreature(state, 'p1');
  const info = cardInfo(SESSION_MOCK, cloaked);
  assert.ok((info.keywords ?? []).includes('ward'), 'cardInfo niesie keyword ward');
  assert.equal(info.ward, 2, 'cardInfo niesie wartość ward');
  const text = rulesText(info);
  assert.ok(text.includes('Ward {2}'), `linia reguł pokazuje „Ward {2}" (jest: „${text}")`);
  // Audyt PR #89 (L1/ADR 0017): PRAWDZIWY kafel renderuje z wpisu playerView,
  // nie z surowego obiektu — bez kwoty w widoku karta z widoku nie pokazywała
  // „Ward {2}" mimo zielonego testu na surowym obiekcie.
  for (const viewer of ['p1', 'p2']) {
    const entry = playerView(state, viewer).zones.battlefield.find((o) => o.faceDown);
    assert.ok(entry, `zakryty w widoku ${viewer}`);
    assert.equal(entry.ward, 2, `playerView(${viewer}) niesie kwotę ward — RED przed fixem: undefined`);
    const info2 = cardInfo(SESSION_MOCK, entry);
    assert.ok((info2.keywords ?? []).includes('ward'), `cardInfo z widoku ${viewer} niesie keyword ward`);
    assert.equal(info2.ward, 2, `cardInfo z widoku ${viewer} niesie wartość ward`);
    assert.ok(rulesText(info2).includes('Ward {2}'), `kafel z widoku ${viewer} pokazuje „Ward {2}"`);
  }
});

test('M258/W12 (M264): trigger_resolved niesie sourceId — renderer maskuje zakryte źródło', () => {
  const state = game('p2');
  const cloaked = cloakedCreature(state, 'p1');
  putCard(state, 'shock', 'shock', 'p2', 'hand');
  addMana(state, 'p2', 5, { colors: ['R'] });

  const r = execute(state, { type: 'cast_spell', playerId: 'p2', objectId: 'shock', targets: [cloaked.id] });
  assert.equal(r.ok, true, 'rzut Shocka się udał');
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  assert.ok(state.pendingWardPay, 'decyzja ward otwarta');
  execute(state, { type: 'resolve_ward_pay_choice', playerId: 'p2', pay: false });

  // Zdarzenie trigger_resolved musi wskazywać ŹRÓDŁO triggera — renderer
  // rozstrzyga zakrycie po żywym obiekcie (RED przed fixem: brak sourceId).
  const resolved = state.events.find((ev) => ev.type === 'trigger_resolved' && ev.ward);
  assert.ok(resolved, 'trigger_resolved ward w strumieniu');
  assert.equal(resolved.sourceId, cloaked.id, 'sourceId wskazuje zakryty permanent (RED przed fixem)');
});

test('M258/W9: log opisuje decyzję ward (oś 2 — log to jedyne źródło wiedzy gracza)', () => {
  const helpers = {
    nameOf: (cardId) => REGISTRY.get(cardId)?.name ?? cardId,
    nameOfObject: (id) => String(id),
  };
  const req = describeGameEvent({
    type: 'ward_choice_required', playerId: 'p2', cardId: 'shock', amount: 2,
    targetingStackId: 'spell-1', wardSourceId: 'perm-1',
  }, helpers);
  assert.ok(typeof req === 'string' && req.length > 0, 'ward_choice_required ma opis');
  assert.ok(req.includes('ward') || req.includes('Ward'), `opis nazywa ward (jest: „${req}")`);
  const res = describeGameEvent({
    type: 'ward_pay_resolved', playerId: 'p2', cardId: 'shock', paid: false, amount: 2,
  }, helpers);
  assert.ok(typeof res === 'string' && res.length > 0, 'ward_pay_resolved ma opis');
  // etykieta komendy w panelu
  const label = commandLabel({ type: 'resolve_ward_pay_choice', playerId: 'p2', pay: true, cost: 2, targetId: 'spell-1' }, SESSION_MOCK, SESSION_MOCK.view());
  assert.ok(typeof label === 'string' && label.length > 0, 'komenda resolve_ward_pay_choice ma etykietę panelu');
});

test('M258/W10: ward odpala także na KOPII czaru (Storm, CR 702.40a+702.21) — pin audytu A1', () => {
  const state = game('p1');
  const cloaked = cloakedCreature(state, 'p2');
  putCard(state, 'ins', 'spreading-insurrection', 'p1', 'hand');
  state.spellsCastThisTurn = 1; // 1 wcześniejszy czar → 1 kopia
  addMana(state, 'p1', 9, { colors: ['R'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_spell' && c.objectId === 'ins' && (c.targets ?? [])[0] === cloaked.id);
  assert.ok(cast, 'rzut Spreading Insurrection z celem');
  assert.equal(execute(state, cast).ok, true);
  // Ward ORYGINAŁU: LIFO — rozstrzyga się przed czarem.
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  assert.ok(state.pendingWardPay, 'ward oryginału otwarty');
  execute(state, { type: 'resolve_ward_pay_choice', playerId: 'p1', pay: true });
  // Rozstrzygnięcie triggera Storma → kopia (spell_copied) z celem oryginału.
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  assert.ok(state.zones.stack.some((id) => state.objects.get(id)?.isSpellCopy), 'kopia na stosie po stormie');
  const copyTarget = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'resolve_copy_targets' && c.targetId === cloaked.id);
  assert.ok(copyTarget, 'wybór celu kopii');
  execute(state, copyTarget);
  // Ward KOPII — też LIFO nad kopią.
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  assert.ok(state.pendingWardPay, 'ward na KOPII otwarty (spell_copied — RED przed fixem A1: brak triggera)');
  assert.equal(state.pendingWardPay.targetingStackId, copyTarget.copyId, 'ward dotyczy KOPII, nie oryginału');
  assert.equal(state.pendingWardPay.amount, 2, 'kwota ward kopii = 2');
});

test('M258/W11: czar AURY celujący w ward — gałąź aura_spell_cast (pin audytu A1)', () => {
  const state = game('p1');
  const cloaked = cloakedCreature(state, 'p2');
  putCard(state, 'embrace', 'serras-embrace', 'p1', 'hand');
  addMana(state, 'p1', 6, { colors: ['W'] });
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'embrace' && (c.targets ?? [])[0] === cloaked.id);
  assert.ok(cast, 'ofiaru aury z celem');
  const r = execute(state, cast);
  assert.ok(r.ok, 'rzut aury przyjęty');
  assert.ok(state.zones.stack.some((id) => state.objects.get(id)?.triggerEntry?.extra?.wardPay),
    'ward nad aurą jest na stosie (aura_spell_cast — RED: brak gałęzi)');
  execute(state, { type: 'pass_priority', playerId: 'p1' });
  execute(state, { type: 'pass_priority', playerId: 'p2' });
  assert.ok(state.pendingWardPay, 'decyzja ward dla aury');
  assert.equal(state.pendingWardPay.targetingCardId, 'serras-embrace');
});
