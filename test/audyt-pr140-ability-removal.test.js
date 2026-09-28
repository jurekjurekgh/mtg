import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { createCardDeck } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana, producibleMana } from '../src/engine/resources.js';
import { effectiveAbilities, effectiveKeywords, effectivePower, grantedActivatedAbilities,
  grantAbilitiesUntilEndOfTurn, grantKeywordsUntilEndOfTurn, hasCreatureType } from '../src/engine/permanents.js';
import { effectiveProtectionFromColors, attachAuraToCreature } from '../src/engine/attachments.js';
import { moveObjectDirectly } from '../src/engine/objects.js';
import { setDayNight } from '../src/engine/triggers.js';
import { nextTimestamp } from '../src/engine/timestamps.js';

// F5 / ADR0030: pobrano 2026-09-28 pełny CR (wydanie 2026-09-25) z
// https://api.github.com/repos/nwgarne/mtg-data/contents/rules/cr-raw.txt
// SHA256: 8d860e451f20f38865b725b42d82feb714c725373dd8f3b32b8652b3eeb070ca.
// CR 604.2: „These effects are active as long as the permanent with the
// ability remains on the battlefield and has the ability”.
// CR 613.7: „An effect with an earlier timestamp is applied before an
// effect with a later timestamp.” (także https://mtg.wiki/page/Layer)
// CR 613.7a: statyka ma timestamp źródła lub efektu nadającego zdolność,
// whichever is later. CR 613.7n: własna statyka wchodzącego otrzymuje
// „an earlier relative timestamp” niż efekt nadający mu cechy przy wejściu.
// Ruling Xu-Ifit, 2025-07-25 (pobrany online): „If a permanent returned to
// the battlefield with Xu-Ifit's ability gains an ability after being
// returned to the battlefield this way, it will keep that ability.”
// https://mtg.wtf/card/eoe/127/Xu-Ifit-Osteoharmonist
// Dlatego nie wystarczy pominąć wyłącznie własnego ETB ani wyłączyć obiektu
// ze wszystkich czytników na zawsze. Kopiowanie/warstwa typów to inne dane.
const registry = createCardRegistry();

function put(state, id, cardId, zone = 'battlefield', playerId = 'p1', patch = {}) {
  // Pełna produkcyjna materializacja talii (zwłaszcza keywords, types i DFC),
  // nie samo gameObjectDataOf, które nie przenosi wspólnych pól ani tyłu DFC.
  const [{ objectId, ...data }] = createCardDeck({ cardIds: [cardId], ownerId: playerId, registry });
  addObject(state, { ...data, id, instanceId: `i-${id}`, controllerId: playerId, zone });
  if (Object.keys(patch).length) state.objects.set(id, Object.freeze({ ...state.objects.get(id), ...patch }));
  return state.objects.get(id);
}

function game() {
  const state = createGameState({ seed: 142, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  for (const p of ['p1', 'p2']) for (let i = 0; i < 8; i++) put(state, `lib-${p}-${i}`, 'basic-swamp', 'library', p);
  put(state, 'xu', 'xu-ifit-osteoharmonist', 'battlefield', 'p1', { summoningSickness: false });
  return state;
}
const commands = (state) => playerView(state, 'p1').legalCommands;
function run(state, command) {
  assert.ok(command, 'oferta istnieje');
  const result = execute(state, command);
  assert.equal(result.ok, true, JSON.stringify(result));
  return result;
}
function resolve(state) {
  for (let i = 0; state.zones.stack.length && i < 40; i++) {
    run(state, playerView(state, state.turn.priorityPlayerId).legalCommands.find((c) => c.type === 'pass_priority'));
  }
  assert.equal(state.zones.stack.length, 0, 'stos rozstrzygnięty');
}
function reanimate(state, cardId, patch = {}) {
  put(state, 'dead', cardId, 'graveyard', 'p1', patch);
  run(state, commands(state).find((c) => c.type === 'activate_ability' && c.objectId === 'xu' && c.targets?.includes('dead')));
  resolve(state);
  const returned = [...state.objects.values()].find((o) => o.zone === 'battlefield' && o.abilitiesStripped);
  assert.ok(returned, 'rzeczywiste rozstrzygnięcie Xu-Ifita');
  assert.deepEqual(effectiveAbilities(returned), [], 'własne zdolności usunięte');
  return returned;
}
function ready(state, object) {
  // Badamy mana/outlast w późniejszym oknie bez choroby przywołania.
  state.objects.set(object.id, Object.freeze({ ...object, summoningSickness: false }));
}
function cast(state, objectId) {
  run(state, commands(state).find((c) => c.type === 'cast_permanent' && c.objectId === objectId));
  resolve(state);
}

test('PR140/F5: Trostani bez zdolności nie daje hymnu innym stworom', () => {
  const state = game();
  const ally = put(state, 'ally', 'highland-game');
  reanimate(state, 'trostani-discordant');
  assert.equal(effectivePower(ally, state), 2);
  assert.equal(playerView(state, 'p1').zones.battlefield.find((o) => o.id === ally.id).power, 2);
});

test('PR140/F5: Enduring Sliver bez zdolności nie daje aktywacji innemu Sliverowi', () => {
  const state = game();
  const ally = put(state, 'ally', 'barkform-harvester', 'battlefield', 'p1', { summoningSickness: false });
  reanimate(state, 'enduring-sliver');
  addMana(state, 'p1', 2);
  assert.equal(hasCreatureType(ally, 'Sliver', state), true, 'prawdziwy changeling, nie sztuczny kolor/typ');
  const index = effectiveAbilities(ally).length;
  assert.deepEqual(grantedActivatedAbilities(state, ally), []);
  assert.equal(commands(state).some((c) => c.type === 'activate_ability' && c.objectId === ally.id && c.abilityIndex === index), false);
  assert.equal(execute(state, { type: 'activate_ability', playerId: 'p1', objectId: ally.id, abilityIndex: index }).ok, false);
  assert.deepEqual(state.objects.get(ally.id).counters ?? {}, {});
});

test('PR140/F5: Etherium Sculptor bez zdolności nie obniża kosztu artefaktu', () => {
  const state = game();
  reanimate(state, 'etherium-sculptor');
  put(state, 'spell', 'trigon-of-thought', 'hand');
  addMana(state, 'p1', 4);
  assert.equal(commands(state).some((c) => c.type === 'cast_permanent' && c.objectId === 'spell'), false);
  assert.equal(execute(state, { type: 'cast_permanent', playerId: 'p1', objectId: 'spell' }).ok, false);
  assert.equal(state.objects.get('spell').zone, 'hand');
  assert.equal(state.players[0].mana, 4);
});

test('PR140/F5: zwykły Sculptor nadal obniża koszt (anty-overfix)', () => {
  const state = game();
  put(state, 'reducer', 'etherium-sculptor');
  put(state, 'spell', 'trigon-of-thought', 'hand');
  addMana(state, 'p1', 4);
  cast(state, 'spell');
  assert.equal(state.players[0].mana, 0);
});

for (const [sourceCard, spellCard, colors, target] of [
  ['scorned-villager', 'highland-game', ['G'], null],
  ['apprentice-wizard', 'pristine-talisman', ['U'], null],
  ['jeskai-devotee', 'shock', ['G'], 'p2'],
]) {
  test(`PR140/F5: ${sourceCard} bez zdolności nie finansuje czaru auto-tapem/filtrem`, () => {
    const state = game();
    const returned = reanimate(state, sourceCard);
    ready(state, returned);
    put(state, 'spell', spellCard, 'hand');
    addMana(state, 'p1', 1, { colors });
    const view = playerView(state, 'p1');
    assert.equal(view.legalCommands.some((c) => c.type === 'activate_ability' && c.objectId === returned.id), false);
    assert.equal(view.legalCommands.some((c) => ['cast_spell', 'cast_permanent'].includes(c.type) && c.objectId === 'spell'), false);
    if (sourceCard !== 'jeskai-devotee') {
      assert.equal(producibleMana(state, 'p1'), 1);
      assert.equal(view.zones.battlefield.find((o) => o.id === returned.id).manaSource ?? null, null);
    }
    const type = target ? 'cast_spell' : 'cast_permanent';
    const result = execute(state, { type, playerId: 'p1', objectId: 'spell', ...(target ? { targets: [target] } : {}) });
    assert.equal(result.ok, false, 'walidator odrzuca mimo ręcznie podanej komendy');
    assert.equal(state.objects.get(returned.id).tapped, false);
    assert.equal(state.players[0].mana, 1);
  });
}

test('PR140/F5: wcześniejszy hymn z keywordami przegrywa ze stripem', () => {
  const state = game();
  put(state, 'grant', 'true-conviction');
  const returned = reanimate(state, 'highland-game');
  assert.deepEqual(effectiveKeywords(returned, state), []);
  assert.deepEqual(playerView(state, 'p1').zones.battlefield.find((o) => o.id === returned.id).keywords ?? [], []);
});

test('PR140/F5: późniejszy hymn z keywordami działa, hymn P/T także przed stripem', () => {
  const state = game();
  put(state, 'anthem', 'trostani-discordant');
  const returned = reanimate(state, 'highland-game');
  assert.equal(effectivePower(returned, state), 3, 'P/T w warstwie 7, nie usunięta zdolność celu');
  put(state, 'late', 'true-conviction', 'hand');
  addMana(state, 'p1', 6);
  cast(state, 'late');
  assert.deepEqual(effectiveKeywords(state.objects.get(returned.id), state).sort(), ['double_strike', 'lifelink']);
});

test('PR140/F5: wcześniejszy Enduring nie nadaje outlast nowemu obiektowi po stripie', () => {
  const state = game();
  put(state, 'early', 'enduring-sliver');
  const returned = reanimate(state, 'barkform-harvester');
  // Typy (warstwa 4) rozstrzygamy PRZED usunięciem zdolności (warstwa 6).
  assert.equal(hasCreatureType(returned, 'Sliver', state), true, 'nie usuwać changelingowi typów przez guard keywordów');
  assert.deepEqual(grantedActivatedAbilities(state, returned), []);
});

test('PR140/F5: późniejszy Enduring daje działające outlast mimo stripu', () => {
  const state = game();
  const returned = reanimate(state, 'barkform-harvester');
  ready(state, returned);
  put(state, 'late', 'enduring-sliver', 'hand');
  addMana(state, 'p1', 4);
  cast(state, 'late');
  assert.equal(grantedActivatedAbilities(state, state.objects.get(returned.id)).length, 1);
  run(state, commands(state).find((c) => c.type === 'activate_ability' && c.objectId === returned.id));
  resolve(state);
  assert.equal(state.objects.get(returned.id).counters['+1/+1'], 1);
});

for (const initial of [null, 'night']) {
  test(`PR140/F5: wejście bez daybound nie zmienia dnia ani twarzy (start=${initial})`, () => {
    const state = game();
    state.dayNight = initial;
    const returned = reanimate(state, 'bird-admirer');
    // CR 702.145d: „Any time a player controls a permanent with daybound,
    // if it's neither day nor night, it becomes day.” Tu NIE ma daybound.
    assert.equal(state.dayNight, initial);
    assert.equal(returned.cardId, 'bird-admirer');
    assert.equal(hasCreatureType(returned, 'Skeleton', state), true);
    assert.deepEqual(effectiveKeywords(returned, state), []);
  });
}

test('PR140/F5: późniejsza zmiana na noc też nie obraca obiektu bez daybound', () => {
  const state = game();
  state.dayNight = 'day';
  const returned = reanimate(state, 'bird-admirer');
  setDayNight(state, 'night');
  assert.equal(state.objects.get(returned.id).cardId, 'bird-admirer');
  assert.equal(hasCreatureType(state.objects.get(returned.id), 'Skeleton', state), true);
});

test('PR140/F5: później nadana mana działa w aktywacji i auto-płatności', () => {
  const state = game();
  const returned = reanimate(state, 'highland-game');
  ready(state, returned);
  grantAbilitiesUntilEndOfTurn(state, returned.id, [registry.get('scorned-villager').abilities[0]]);
  put(state, 'spell', 'highland-game', 'hand');
  addMana(state, 'p1', 1, { colors: ['G'] });
  assert.ok(commands(state).some((c) => c.type === 'activate_ability' && c.objectId === returned.id));
  cast(state, 'spell');
  assert.equal(state.objects.get(returned.id).tapped, true);
  assert.equal(state.players[0].mana, 0);
});

test('PR140/F5: późniejsza statyka własna działa, mimo usunięcia druku', () => {
  const state = game();
  const returned = reanimate(state, 'highland-game');
  // Testowy nośnik istniejącego deskryptora pump, bez nowej karty w katalogu.
  grantAbilitiesUntilEndOfTurn(state, returned.id, [{ type: 'static', pump: { power: 2, toughness: 0 } }]);
  assert.equal(effectivePower(state.objects.get(returned.id), state), 4);
});

test('PR140/F5: statyka nadana starszemu źródłu używa czasu nadania, nie wejścia źródła', () => {
  const state = game();
  put(state, 'source', 'highland-game');
  const returned = reanimate(state, 'highland-game');
  grantAbilitiesUntilEndOfTurn(state, 'source', registry.get('true-conviction').abilities);
  assert.deepEqual(effectiveKeywords(state.objects.get(returned.id), state).sort(), ['double_strike', 'lifelink']);
});

test('PR140/F5: drukowany deskryptor protection również znika (nośnik testowy)', () => {
  const state = game();
  const returned = reanimate(state, 'highland-game', { protectionFromColors: ['R'] });
  assert.deepEqual(effectiveProtectionFromColors(state, returned), []);
  put(state, 'shock', 'shock', 'hand', 'p2');
  addMana(state, 'p2', 1, { colors: ['R'] });
  run(state, { type: 'pass_priority', playerId: 'p1' });
  run(state, playerView(state, 'p2').legalCommands.find((c) => c.type === 'cast_spell' && c.targets?.includes(returned.id)));
});

test('PR140/F5: zmiana strefy przywraca druk; późniejszy grant keywordu nie ginie przedtem', () => {
  const state = game();
  const returned = reanimate(state, 'bone-shredder');
  grantKeywordsUntilEndOfTurn(state, returned.id, ['flying']);
  assert.deepEqual(effectiveKeywords(state.objects.get(returned.id), state), ['flying']);
  moveObjectDirectly(state, returned.id, 'hand', 'again');
  const inHand = state.objects.get('again');
  assert.equal(inHand.abilitiesStripped, false);
  assert.equal(inHand.abilitiesStrippedAt ?? null, null, 'timestamp efektu też zostaje za granicą strefy');
  assert.equal(effectiveAbilities(inHand).length, registry.get('bone-shredder').abilities.length);
  assert.equal(inHand.subtypes.includes('Skeleton'), false);
});


test('PR140/F5: późniejszy timestamp odbiorcy nie przesuwa czasu utraty zdolności', () => {
  const state = game();
  const returned = reanimate(state, 'highland-game');
  put(state, 'late', 'true-conviction');
  assert.deepEqual(effectiveKeywords(state.objects.get(returned.id), state).sort(), ['double_strike', 'lifelink']);
  // Fixture resolvera warstw: późniejszy timestamp OBIEKTU (np. status/twarz)
  // nie jest nowym rozstrzygnięciem efektu „has no abilities”. Utrata ma
  // swój czas utworzenia (613.7b), nie bieżący czas obiektu-odbiorcy.
  state.objects.set(returned.id, Object.freeze({ ...state.objects.get(returned.id), timestamp: nextTimestamp(state) }));
  assert.deepEqual(effectiveKeywords(state.objects.get(returned.id), state).sort(), ['double_strike', 'lifelink']);
});

test('PR140/F5: statyka wejścia nadana po stripie działa także przez rzut morpha', () => {
  const state = game();
  const returned = reanimate(state, 'highland-game');
  grantAbilitiesUntilEndOfTurn(state, returned.id,
    registry.get('veiled-ascension').abilities.filter((a) => a.type === 'static'));
  put(state, 'morph', 'segmented-krotiq', 'hand');
  addMana(state, 'p1', 3);
  run(state, commands(state).find((c) => c.type === 'cast_permanent' && c.objectId === 'morph' && c.faceDown));
  resolve(state);
  const faceDown = [...state.objects.values()].find((o) => o.zone === 'battlefield' && o.faceDown);
  assert.ok(faceDown, 'prawdziwy rzut zakrytego permanenta');
  assert.equal(faceDown.counters.flying, 1);
});

test('PR140/F5: ochrona nadana późniejszą aurą zostaje', () => {
  const state = game();
  const returned = reanimate(state, 'highland-game');
  const aura = registry.get('benevolent-blessing');
  assert.ok(aura);
  put(state, 'aura', aura.id, 'battlefield', 'p1', { aura: { ...aura.aura, chosenColor: 'R' } });
  attachAuraToCreature(state, 'aura', returned.id);
  assert.deepEqual(effectiveProtectionFromColors(state, state.objects.get(returned.id)), ['R']);
});
