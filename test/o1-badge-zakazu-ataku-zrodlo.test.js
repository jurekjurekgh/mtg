// O1 (decyzja właściciela 2026-10-01, audyt PR #147): badge „nie może atakować”
// ma NIE dublować natywnego Obrońcy — słowo kluczowe na kaflu już to mówi.
// Badge pokazuje się, gdy zakaz (albo Obrońca) pochodzi z INNEGO permanentu lub
// czaru: aura/sprzęt „can't attack”, detain, Obrońca nadany efektem, zdolność
// „can't attack unless…” nadana z zewnątrz.
//
// To zmiana PREZENTACJI (nie reguł): legalność ataku nadal liczy jeden helper
// (`staticAttackPreventionOf` ← `staticAttackPrevented`, L48/L41), a bot dalej
// czyta `cantAttackStatic`. Nowe pole widoku `cantAttackExternal` jest faktem
// publicznym (ADR 0017: kontroler/przeciwnik widzą aurę i detain na stole).
//
// Nośniki: karty z katalogu (stirring-bard = natywny defender, lurking-green-
// dragon / chained-throatseeker = własne „unless…”, bonds-of-faith = aura);
// Obrońca nadany i zdolność nadana — dane syntetyczne w obiekcie (ADR 0029).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { staticAttackPrevented, staticAttackPreventionOf } from '../src/engine/combat.js';
import { cardInfo, combatRestrictionBadges } from '../src/table/render.js';

const REGISTRY = createCardRegistry();
const SESSION = {
  nameOf: (cardId) => REGISTRY.get(cardId)?.name ?? cardId,
  nameOfObject: (o) => REGISTRY.get(o?.cardId)?.name ?? o?.id,
  abilitiesOf: () => [],
  cardDetails: (cardId) => REGISTRY.get(cardId) ?? null,
  colorsOf: (cardId) => REGISTRY.get(cardId)?.colors ?? [],
  view: () => ({ zones: { battlefield: [], hand: [], graveyard: [], exile: [] } }),
};

function game() {
  const state = createGameState({ seed: 11, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  state.turn.phase = 'precombat_main';
  state.turn.step = 'main1';
  state.turn.number = 5;
  return state;
}

function put(state, id, cardId, ctrl, zone = 'battlefield', extra = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `karta ${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: ctrl, ownerId: ctrl, zone,
    ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes ?? [],
    keywords: def.keywords ?? [], cardName: def.name, ...extra,
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  return state.objects.get(id);
}

/**
 * Mutacja pola obiektu PO wejściu (jak po rozstrzygnięciu efektu): `addObject`
 * przyjmuje tylko pola kontraktu fabryki (L21), więc `detained`/granty ustawiamy
 * jawnie na obiekcie na stole.
 */
function patch(state, id, fields) {
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...fields }));
}

function tileOf(state, objectId, viewerId = 'p1') {
  const entry = playerView(state, viewerId).zones.battlefield.find((o) => o.id === objectId);
  assert.ok(entry, `${objectId} jest w widoku pola bitwy`);
  const info = cardInfo(SESSION, entry, null);
  return {
    entry, info,
    badges: combatRestrictionBadges({ cantAttack: info.cantAttackNow, cantBlock: info.cantBlockNow }),
  };
}

function resolveStack(state) {
  for (let i = 0; state.zones.stack.length && i < 40; i += 1) {
    const cmd = playerView(state, state.turn.priorityPlayerId).legalCommands.find((c) => c.type === 'pass_priority');
    assert.ok(cmd && execute(state, cmd).ok);
  }
}

test('O1/1: natywny Obrońca — brak badge’a, ale zakaz nadal działa (bot + walidacja)', () => {
  const state = game();
  put(state, 'bard', 'stirring-bard', 'p1');
  const { entry, badges } = tileOf(state, 'bard');
  assert.equal(entry.cantAttackStatic, true, 'bot dalej widzi zakaz (M243/F)');
  assert.notEqual(entry.cantAttackExternal, true, 'zakaz jest natywny — widok nie oznacza go jako zewnętrznego');
  assert.deepEqual(badges, [], 'słowo kluczowe „Obrońca” już to mówi — bez badge’a');
  assert.equal(staticAttackPrevented(state, state.objects.get('bard'), 'p1'), true);
  const attackable = playerView(state, 'p1').legalCommands
    .filter((c) => c.type === 'declare_attackers').flatMap((c) => c.attackers ?? []);
  assert.ok(!attackable.includes('bard'), 'Obrońca nie atakuje');
});

test('O1/2: Obrońca NADANY (efekt/statyka z innego źródła) — badge jest', () => {
  const state = game();
  put(state, 'satyr', 'satyr-wayfinder', 'p1');
  patch(state, 'satyr', { keywordGrants: ['defender'] });
  const { entry, badges } = tileOf(state, 'satyr');
  assert.equal(entry.cantAttackStatic, true);
  assert.equal(entry.cantAttackExternal, true, 'defender pochodzi z zewnątrz');
  assert.deepEqual(badges, ['nie może atakować']);
});

test('O1/3: aura „can’t attack” na NATYWNYM Obrońcy — badge jest (aura niesie własną informację)', () => {
  const state = game();
  for (let i = 0; i < 3; i += 1) put(state, `pl${i}`, 'basic-plains', 'p1');
  put(state, 'bof', 'bonds-of-faith', 'p1', 'hand');
  put(state, 'bard', 'stirring-bard', 'p2'); // nie-Human: aura zabrania ataku i bloku
  const cast = playerView(state, 'p1').legalCommands
    .find((c) => c.type === 'cast_permanent' && c.objectId === 'bof' && c.targets?.[0] === 'bard');
  assert.ok(cast, 'oferta aury na Obrońcę');
  assert.ok(execute(state, cast).ok);
  resolveStack(state);
  const { entry, badges } = tileOf(state, 'bard');
  assert.equal(entry.cantAttackExternal, true);
  assert.deepEqual(badges, ['nie może atakować ani blokować']);
});

test('O1/4: detain na natywnym Obrońcy i na zwykłym stworze — badge w obu', () => {
  const state = game();
  put(state, 'bard', 'stirring-bard', 'p1');
  put(state, 'satyr', 'satyr-wayfinder', 'p1');
  patch(state, 'bard', { detained: true });
  patch(state, 'satyr', { detained: true });
  for (const id of ['bard', 'satyr']) {
    const { entry, badges } = tileOf(state, id);
    assert.equal(entry.cantAttackExternal, true, `${id}: detain to efekt z zewnątrz`);
    assert.deepEqual(badges, ['nie może atakować'], id);
  }
});

test('O1/5: własne „can’t attack unless…” — bez badge’a; to samo nadane z zewnątrz — z badge’em', () => {
  const state = game(); // p2 bez latającego / bez trucizny → zakaz aktywny
  put(state, 'dragon', 'lurking-green-dragon', 'p1');
  put(state, 'throat', 'chained-throatseeker', 'p1');
  const grant = { type: 'static', cantAttackUnlessDefenderHasFlying: true };
  put(state, 'satyr', 'satyr-wayfinder', 'p1');
  patch(state, 'satyr', { abilityGrants: [grant] });
  for (const id of ['dragon', 'throat']) {
    const { entry, badges } = tileOf(state, id);
    assert.equal(entry.cantAttackStatic, true, `${id}: zakaz aktywny`);
    assert.notEqual(entry.cantAttackExternal, true, `${id}: zakaz z własnej zdolności`);
    assert.deepEqual(badges, [], id);
  }
  const granted = tileOf(state, 'satyr');
  assert.equal(granted.entry.cantAttackExternal, true, 'zdolność nadana = źródło zewnętrzne');
  assert.deepEqual(granted.badges, ['nie może atakować']);
});

test('O1/6: stwór bez zakazu ataku — brak badge’a i brak pól (anty-over-fix)', () => {
  const state = game();
  put(state, 'satyr', 'satyr-wayfinder', 'p1');
  const { entry, badges } = tileOf(state, 'satyr');
  assert.equal(entry.cantAttackStatic, undefined);
  assert.equal(entry.cantAttackExternal, undefined);
  assert.deepEqual(badges, []);
});

test('O1/7: natywny Obrońca + cantBlock (nie-Human z Bonds) — wspólny helper nie zmienia legalności', () => {
  // Helper zwraca TO SAMO `prevented` co dawna lista warunków: pin, że refaktor
  // nie wpuścił Obrońcy do ataku (atak mimo defendera do końca tury: W-8).
  const state = game();
  put(state, 'bard', 'stirring-bard', 'p1');
  assert.deepEqual(staticAttackPreventionOf(state, state.objects.get('bard'), 'p1'), { prevented: true, external: false });
  patch(state, 'bard', { attacksAsThoughNoDefenderUntilEOT: true });
  assert.deepEqual(staticAttackPreventionOf(state, state.objects.get('bard'), 'p1'), { prevented: false, external: false },
    'W-8: uchylenie defendera zdejmuje zakaz');
});
