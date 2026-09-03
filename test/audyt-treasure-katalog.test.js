/**
 * Strażnik „jedna zasada — jedna implementacja" dla tokena Skarbu
 * (audyt PR #93, decyzja właściciela: „w katalogu tokenów od dawna jest
 * Treasure Token wykorzystywany przez wiele kart i efektów — składajmy
 * Skarby z niego, nie ręcznie w efektach").
 *
 * Prawda o Skarbie leży w dwóch miejscach, które MUSZĄ się zgadzać:
 *  1. katalog tokenów: `token_treasure` w `src/cards/card-data.js`
 *     (używany przez karty, UI, walidację talii),
 *  2. współdzielony deskryptor silnika: `TREASURE_TOKEN_EFFECT`
 *     w `src/engine/tokens.js` (używany tam, gdzie Skarb powstaje w rdzeniu:
 *     pokój Stash lochu, Marut, rezygnacja z rzutu w oknie zdolności).
 * Silnik celowo nie importuje katalogu (ADR 0002), więc zamiast szukania
 * po nazwie karty mamy dwie definicje i ten test — on zamienia dryf w RED.
 *
 * Test 3 jest behawioralny: Skarb powstający w silniku musi DAĆ MANĘ, czyli
 * deduplikacja deskryptora nie mogła zgubić zdolności.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCardRegistry } from '../src/cards/card-data.js';
import { TREASURE_TOKEN_EFFECT, TREASURE_TOKEN_ABILITY } from '../src/engine/tokens.js';

const REGISTRY = createCardRegistry();
const CATALOG = REGISTRY.get('token_treasure');

/** Rzucenie obiektu do wybranych kluczy (porównanie bez pól domyślnych). */
function project(obj, keys) {
  return Object.fromEntries(keys.map((k) => [k, obj?.[k]]));
}

/**
 * Rekurencyjnie znajdź efekty `create_token` dla danego cardId w definicjach
 * kart (zdolności, efekty, tryby, pokoje lochów — wszystko).
 */
function findTokenEffects(root, cardId) {
  const found = [];
  const seen = new WeakSet();
  const walk = (node, path) => {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, `${path}[${i}]`));
      return;
    }
    if (node.type === 'create_token' && node.cardId === cardId) found.push({ path, effect: node });
    for (const [key, value] of Object.entries(node)) walk(value, `${path}.${key}`);
  };
  walk(root, '');
  return found;
}

test('Skarb: deskryptor silnika == definicja w katalogu tokenów', () => {
  assert.ok(CATALOG, 'katalog musi zawierać token_treasure');
  assert.equal(TREASURE_TOKEN_EFFECT.cardId, CATALOG.id);
  assert.equal(TREASURE_TOKEN_EFFECT.name, CATALOG.name);
  assert.deepEqual(TREASURE_TOKEN_EFFECT.colors, CATALOG.colors, 'kolory Skarbu');
  assert.deepEqual([...TREASURE_TOKEN_EFFECT.subtypes], [...CATALOG.subtypes], 'podtypy Skarbu');
  // Katalog tokenu dokleja typ 'Token' (cecha tokenu, nie zasady Skarbu).
  assert.deepEqual([...TREASURE_TOKEN_EFFECT.types], CATALOG.types.filter((t) => t !== 'Token'),
    'typy Skarbu');

  const keys = ['type', 'timing', 'keyword', 'oncePerTurn', 'mustAttack'];
  assert.deepEqual(project(TREASURE_TOKEN_ABILITY, keys), project(CATALOG.abilities?.[0], keys),
    'rodzaj zdolności Skarbu (aktywowana, instant, bez ograniczeń)');
  assert.deepEqual(TREASURE_TOKEN_ABILITY.cost, { tap: true, sacrificeSelf: true },
    'opłata Skarbu: {T}, Sacrifice this artifact');
  assert.deepEqual(project(CATALOG.abilities?.[0] ?? {}, ['cost']), { cost: { tap: true, sacrificeSelf: true } },
    'katalog musi mieć TĘ SAMĄ opłatę (inaczej dwa Skarby grają różnie)');
  // Kolory są DANYMI efektu (audyt PR #93, tura 3) — silnik nie ma ich prawa
  // znać z litery, więc jeśli którakolwiek z definicji je zgubi, Skarb przestaje
  // płacić za pipy i ten pin to widzi.
  const EFEKT = { type: 'add_mana', amount: 1, colors: ['W', 'U', 'B', 'R', 'G'], fromTreasure: true };
  assert.deepEqual({ ...TREASURE_TOKEN_ABILITY.effect }, EFEKT,
    'efekt Skarbu: 1 mana dowolnego koloru, oznaczona jako skarbowa');
  assert.deepEqual({ ...(CATALOG.abilities?.[0]?.effect ?? {}) }, EFEKT,
    'katalog musi mieć TEN SAM efekt many');
});

test('Skarb: każda karta tworzy go z definicji katalogu (brak własnych wersji)', () => {
  const sites = REGISTRY.all().flatMap((card) => findTokenEffects(card, 'token_treasure')
    .map((entry) => ({ ...entry, card: card.id })));
  // Pin anty-vacuous (L48): strażnik bez znalezionych prób jest bezwartościowy.
  assert.ok(sites.length >= 5,
    `oczekiwałem >= 5 miejsc tworzenia Skarbu w katalogu, znaleziono ${sites.length} — zmienił się wzorzec?`);
  const bad = sites.filter(({ effect }) => {
    if (effect.name !== TREASURE_TOKEN_EFFECT.name) return true;
    if (effect.kind !== TREASURE_TOKEN_EFFECT.kind) return true;
    if (JSON.stringify(effect.colors ?? []) !== JSON.stringify(TREASURE_TOKEN_EFFECT.colors)) return true;
    if (JSON.stringify(effect.subtypes ?? []) !== JSON.stringify(TREASURE_TOKEN_EFFECT.subtypes)) return true;
    const ability = (effect.abilities ?? [])[0] ?? {};
    const keys = ['type', 'timing', 'oncePerTurn', 'mustAttack'];
    for (const k of keys) if (ability[k] !== TREASURE_TOKEN_ABILITY[k]) return true;
    for (const k of ['tap', 'sacrificeSelf']) {
      if (Boolean(ability.cost?.[k]) !== Boolean(TREASURE_TOKEN_ABILITY.cost[k])) return true;
    }
    for (const k of ['type', 'amount', 'fromTreasure', 'colors']) {
      if (JSON.stringify(ability.effect?.[k] ?? null) !== JSON.stringify(TREASURE_TOKEN_ABILITY.effect[k] ?? null)) return true;
    }
    return false;
  });
  assert.deepEqual(bad.map((b) => b.card), [],
    `te karty składają Skarba po swojemu (powinny używać wspólnego deskryptora): ${bad.map((b) => b.card).join(', ')}`);
});

test('Skarb z rezygnacji w oknie zdolności działa: tap + poświęcenie = 1 mana', async () => {
  const { createGameState, addObject, execute } = await import('../src/engine/game-state.js');
  const { gameObjectDataOf } = await import('../src/cards/materialize.js');
  const { jumpToStep } = await import('../src/engine/turn.js');
  const { applyEffect } = await import('../src/engine/effects.js');
  const VAAN = REGISTRY.get('vaan-street-thief');
  const state = createGameState({ seed: 7, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = 'p1';
  state.turn.priorityPlayerId = 'p1';
  addObject(state, {
    id: 'vaan', instanceId: 'i-vaan', cardId: VAAN.id, controllerId: 'p1', ownerId: 'p1',
    zone: 'battlefield', ...gameObjectDataOf(VAAN), types: ['Creature'],
  });
  const victim = REGISTRY.all().find((c) => c.id === 'highland-game') ?? REGISTRY.all()[0];
  addObject(state, {
    id: 'top', instanceId: 'i-top', cardId: victim.id, controllerId: 'p2', ownerId: 'p2',
    zone: 'library', ...gameObjectDataOf(victim), types: victim.types ?? ['Instant'],
  });
  state.zones.library.push('top');
  applyEffect(state, { type: 'exile_top_of_player_library_and_may_cast' },
    { id: 'vaan', controllerId: 'p1', cardId: VAAN.id, zone: 'battlefield', kind: 'creature' }, [],
    { damagedPlayerId: 'p2' });
  assert.equal(execute(state, { type: 'resolve_exile_cast', playerId: 'p1', cast: false }).ok, true);

  const treasure = [...state.objects.values()].find((o) => o.cardId === 'token_treasure'
    && o.zone === 'battlefield' && o.controllerId === 'p1');
  assert.ok(treasure, 'rezygnacja tworzy Skarb');
  assert.equal(treasure.abilities.length, 1, 'Skarb ma jedną zdolność (z deskryptora)');
  const before = (state.players.find((p) => p.id === 'p1').treasureMana ?? 0);
  const act = execute(state, { type: 'activate_ability', playerId: 'p1', objectId: treasure.id, abilityIndex: 0 });
  assert.equal(act.ok, true, `aktywacja Skarbu odrzucona: ${JSON.stringify(act.events?.at(-1))}`);
  const after = state.players.find((p) => p.id === 'p1').treasureMana ?? 0;
  assert.equal(after, before + 1, 'mana skarbowa trafiła do puli');
  // CR 111.7: token POŚWIĘCONY przestaje istnieć (nie trafia do grobu) —
  // stąd obiekt znika ze `state.objects`, a nie zmienia strefy.
  assert.equal(state.objects.has(treasure.id), false, 'Skarb zużyty — token przestaje istnieć');
  assert.equal(state.zones.battlefield.includes(treasure.id), false, 'Skarb opuszcza pole bitwy');
});
