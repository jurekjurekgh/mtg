// Zgłoszenie właściciela 2026-09-29 (B) — Bonds of Faith, badge na kaflu.
//
// „Enchant creature. Enchanted creature gets +2/+2 as long as it's a Human.
// Otherwise, it can't attack **or block**." Na nie-Humanie aura nakłada DWA
// zakazy, a kafel pokazywał wyłącznie „nie może blokować".
//
// Root cause (pomiar, nie hipoteza):
//   - silnik liczy oba zakazy (`attachmentRestrictions` w permanents.js —
//     `cantAttack` i `cantBlock` z warunkiem `hostLacksSubtype: 'Human'`);
//   - PlayerView niesie `cantBlock` (→ badge) oraz `cantAttackStatic`
//     (M243/F — czyta go bot, żeby nie marnować Equip), ale
//   - `buildStateOverlay` w render.js zamieniał na badge WYŁĄCZNIE
//     `cantBlockNow`; dla zakazu ataku nie było ani pola `info`, ani etykiety.
// Klasa: skutek widoczny w grze musi być widoczny na stole (ADR 0017 / L1) —
// tutaj widok niósł fakt, a warstwa stołu go gubiła.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { cardInfo, combatRestrictionBadges } from '../src/table/render.js';

const REGISTRY = createCardRegistry();

/** Minimalna sesja dla `cardInfo` (wzorzec `audit-m83-tester.test.js`). */
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

function resolve(state) {
  for (let i = 0; state.zones.stack.length && i < 40; i += 1) {
    const cmd = playerView(state, state.turn.priorityPlayerId).legalCommands
      .find((c) => c.type === 'pass_priority');
    assert.ok(cmd, 'gracz z priorytetem ma co zrobić');
    assert.ok(execute(state, cmd).ok, 'priorytet przechodzi');
  }
  assert.equal(state.zones.stack.length, 0, 'stos rozstrzygnięty');
}

/** Rzuca aurę z ręki na wskazany cel — realną ofertą (cele z widoku). */
function castAuraOn(state, auraId, targetId) {
  const cmd = playerView(state, 'p1').legalCommands
    // Aura to permanent — oferta ma typ `cast_permanent` (nie `cast_spell`).
    .find((c) => c.type === 'cast_permanent' && c.objectId === auraId && c.targets?.[0] === targetId);
  assert.ok(cmd, `oferta rzucenia ${auraId} na ${targetId}`);
  assert.ok(execute(state, cmd).ok, 'rzut przyjęty');
  resolve(state);
}

/** Pełna ścieżka badge: widok → cardInfo → etykieta (jak na kaflu). */
function tileOf(state, viewerId, objectId) {
  const entry = playerView(state, viewerId).zones.battlefield.find((o) => o.id === objectId);
  assert.ok(entry, `${objectId} jest w widoku pola bitwy`);
  const info = cardInfo(SESSION, entry, null);
  return {
    entry,
    info,
    badges: combatRestrictionBadges({
      cantAttack: info.cantAttackNow, cantBlock: info.cantBlockNow,
    }),
  };
}

test('B/etykieta: oba zakazy = jedno wspólne zdanie, pojedyncze = osobne', () => {
  assert.deepEqual(combatRestrictionBadges({ cantAttack: true, cantBlock: true }),
    ['nie może atakować ani blokować'], 'druk karty mówi „can\'t attack or block"');
  assert.deepEqual(combatRestrictionBadges({ cantAttack: true, cantBlock: false }),
    ['nie może atakować']);
  assert.deepEqual(combatRestrictionBadges({ cantAttack: false, cantBlock: true }),
    ['nie może blokować'], 'dotychczasowa etykieta musi przetrwać (klawing-torment)');
  assert.deepEqual(combatRestrictionBadges({}), [], 'bez restrykcji nie ma badge’a');
  assert.deepEqual(combatRestrictionBadges(), [], 'brak argumentu = brak badge’a');
});

test('B: Bonds of Faith na NIE-Humanie — kafel mówi „nie może atakować ani blokować"', () => {
  const state = game();
  for (let i = 0; i < 3; i += 1) put(state, `pl${i}`, 'basic-plains', 'p1');
  put(state, 'bof', 'bonds-of-faith', 'p1', 'hand');
  put(state, 'satyr', 'satyr-wayfinder', 'p2'); // Satyr — nie Human
  castAuraOn(state, 'bof', 'satyr');

  const { entry, info, badges } = tileOf(state, 'p1', 'satyr');
  assert.equal(entry.cantAttackStatic, true, 'widok niesie statyczny zakaz ataku');
  assert.equal(entry.cantBlock, true, 'widok niesie zakaz bloku');
  assert.equal(info.cantAttackNow, true, 'cardInfo wystawia cantAttackNow (brakowało przed naprawą)');
  assert.equal(info.cantBlockNow, true, 'cardInfo wystawia cantBlockNow');
  assert.deepEqual(badges, ['nie może atakować ani blokować'],
    `badge na kaflu: ${JSON.stringify(badges)}`);
});

test('B: Bonds of Faith na Humanie — brak restrykcji, widoczny +2/+2', () => {
  const state = game();
  for (let i = 0; i < 3; i += 1) put(state, `pl${i}`, 'basic-plains', 'p1');
  put(state, 'bof', 'bonds-of-faith', 'p1', 'hand');
  put(state, 'czlowiek', 'midnight-guard', 'p1'); // Human — dostaje buff
  castAuraOn(state, 'bof', 'czlowiek');

  const { info, badges } = tileOf(state, 'p1', 'czlowiek');
  assert.deepEqual(badges, [], 'Human nie jest unieruchomiony — żadnych badge’y restrykcji');
  assert.equal(info.grantedPower, 2, 'warunkowy +2/+2 widoczny na kaflu');
  assert.equal(info.grantedToughness, 2);
});

test('B/regresja: aura z SAMYM zakazem bloku dalej ma swoją etykietę', () => {
  // Clawing Torment: „…it gets -1/-1 and can't block" — jeden zakaz, więc badge
  // nie może się zamienić w zdanie o ataku (granica nowej reguły etykiet).
  const state = game();
  put(state, 'swamp', 'basic-swamp', 'p1');
  put(state, 'ct', 'clawing-torment', 'p1', 'hand');
  // Cel musi przeżyć -1/-1 z tej aury (satyr-wayfinder to 1/1 — padłby).
  put(state, 'wrogi', 'midnight-guard', 'p2');
  castAuraOn(state, 'ct', 'wrogi');

  const { entry, info, badges } = tileOf(state, 'p1', 'wrogi');
  assert.equal(entry.cantBlock, true, 'zakaz bloku z aury w widoku');
  assert.notEqual(entry.cantAttackStatic, true, 'ta aura NIE zabrania ataku');
  assert.equal(info.cantAttackNow, false);
  assert.deepEqual(badges, ['nie może blokować']);
});
