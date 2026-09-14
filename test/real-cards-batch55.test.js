import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { MANA_COSTS } from '../src/cards/mana-costs-data.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { effectivePower, effectiveToughness } from '../src/engine/permanents.js';
import { moveObjectDirectly } from '../src/engine/objects.js';

/**
 * Batch 55 (2026-09-14) — karty właściciela: 23, 609–617.
 *
 * Dane Oracle i rulingi: `docs/cards/scryfall-*.json` (pobrane 2026-09-14,
 * ADR 0030). Katalog: `src/cards/card-data.js`; artId/plan:
 * `tools/collection-art-ids.csv`.
 *
 * Podział na sekcje = etapy batcha (B1: 616/617/610, B2: 611/614,
 * B3: 609/615, B4: 23, B5: 612, B6: 613). Każda sekcja ma scenariusz
 * legalny, nielegalny i interakcje z istniejącym katalogiem (ADR 0010).
 */
const registry = createCardRegistry();

function game(players = ['p1', 'p2']) {
  const state = createGameState({ seed: 55, players: players.map((id) => ({ id })) });
  state.turn = jumpToStep(state.turn, 'main', 'p1');
  state.turn.activePlayerId = state.turn.priorityPlayerId = 'p1';
  for (const playerId of players) for (let i = 0; i < 3; i++) put(state, `lib-${playerId}-${i}`, 'basic-swamp', playerId, 'library');
  return state;
}

function put(state, id, cardId, playerId = 'p1', zone = 'hand') {
  const def = registry.get(cardId);
  assert.ok(def, `${cardId} w prawdziwym rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId,
    zone, ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes, keywords: def.keywords,
  });
  return state.objects.get(id);
}

const commands = (s, p = s.turn.priorityPlayerId) => playerView(s, p).legalCommands;

function run(s, cmd) {
  assert.ok(cmd, 'oferta komendy istnieje');
  const r = execute(s, cmd);
  assert.ok(r.ok, JSON.stringify(r.events));
  return r;
}

function resolve(s) {
  for (let i = 0; s.zones.stack.length && i < 40; i++) {
    const choices = commands(s);
    run(s, choices.find((c) => c.type.startsWith('resolve_')) ?? choices.find((c) => c.type === 'pass_priority'));
  }
  assert.equal(s.zones.stack.length, 0, 'cały stos rozstrzygnięty');
}

const find = (s, cardId, zone = 'battlefield') => [...s.objects.values()].find((o) => o.cardId === cardId && o.zone === zone);
const life = (s, p) => s.players.find((o) => o.id === p).life;

/** Sprite do końca tury: przechodzi same passy, aż zmieni się numer tury. */
function passTurnToEnd(state, targetTurn) {
  for (let i = 0; i < 200 && state.turn.number < targetTurn; i += 1) {
    const holder = state.turn.priorityPlayerId;
    const view = playerView(state, holder);
    const cmd = view.legalCommands.find((c) => c.type === 'pass_priority')
      ?? view.legalCommands.find((c) => c.type.startsWith('declare_'))
      ?? view.legalCommands[0];
    if (!cmd) break;
    if (!execute(state, cmd).ok) break;
  }
  assert.ok(state.turn.number >= targetTurn, 'tura przeszła do końca (cleanup się wykonał)');
}

/** Sanity danych karty: snapshot ↔ katalog ↔ arkusz (jedna reguła dla sekcji). */
function sanity(id, artId, set, plan) {
  test(`B55: ${id} — druk, Oracle, artId, plan, pełne wsparcie`, () => {
    const def = registry.get(id);
    const src = JSON.parse(fs.readFileSync(new URL(`../docs/cards/scryfall-${id}.json`, import.meta.url)));
    assert.ok(def);
    assert.equal(def.artId, artId); assert.equal(def.set, set); assert.equal(def.plan, plan);
    assert.equal(def.oracleText, src.oracle_text);
    assert.equal(def.imageUri, src.image_uris.large);
    assert.equal(def.manaCost, src.cmc); assert.equal(MANA_COSTS[id], src.mana_cost);
    assert.deepEqual(def.colors, src.colors);
    assert.equal(def.support.status, 'supported'); assert.deepEqual(def.support.limitations, []);
    assert.ok(Array.isArray(src.rulings));
    assert.equal(src.rulingsPobrano, '2026-09-14');
  });
}

function tooLittleMana(id, castType, setup = () => {}, wrongColor = 'U') {
  test(`B55: ${id} — za mało many / zły kolor, brak oferty i odrzucona komenda`, () => {
    for (const [mana, colors] of [[0, []], [9, Array(9).fill(wrongColor)]]) {
      const s = game(); put(s, 'card', id); setup(s);
      if (mana) addMana(s, 'p1', mana, { colors });
      assert.equal(commands(s).some((c) => c.objectId === 'card' && c.type.startsWith('cast_')), false);
      const r = execute(s, { type: castType, playerId: 'p1', objectId: 'card', targets: ['tgt'] });
      assert.equal(r.ok, false); assert.ok(r.events.some((e) => typeof e.reason === 'string'));
      assert.equal(s.objects.get('card').zone, 'hand');
    }
  });
}

// ---------------------------------------------------------------------------
// B1 (M351) — 616 Act of Treason, 617 Douse in Gloom, 610 Gearsmith Prodigy
// ---------------------------------------------------------------------------

sanity('act-of-treason', 616, 'KTK', 'Tarkir');
tooLittleMana('act-of-treason', 'cast_spell', (s) => put(s, 'tgt', 'rotting-legion', 'p2', 'battlefield'), 'U');

test('B55/B1: 616 Act of Treason — przejęcie: untap, haste i powrót do właściciela po turze', () => {
  const s = game();
  put(s, 'treason', 'act-of-treason');
  put(s, 'prey', 'rotting-legion', 'p2', 'battlefield');
  s.objects.set('prey', Object.freeze({ ...s.objects.get('prey'), tapped: true, summoningSickness: true }));
  addMana(s, 'p1', 3, { colors: ['R'] });

  run(s, commands(s).find((c) => c.type === 'cast_spell' && c.objectId === 'treason' && c.targets?.[0] === 'prey'));
  resolve(s);

  const prey = s.objects.get('prey');
  assert.equal(prey.controllerId, 'p1', 'kontrola przejęta (CR 800.4a)');
  assert.equal(prey.tapped, false, '„Untap that creature"');
  assert.ok((prey.keywordGrants ?? []).includes('haste'), '„It gains haste until end of turn"');
  assert.equal(prey.summoningSickness, false, 'przejęty stwór może atakować od razu');
  assert.ok(s.events.some((e) => e.type === 'control_changed' && e.objectId === 'prey'), 'zdarzenie zmiany kontroli (L24)');

  // Ruling 2019-07-12 (docs/cards/scryfall-act-of-treason.json): kontrola wraca
  // na końcu tury (cleanup rewersuje kontrolera) — sprawdzamy realnym przejściem tur.
  passTurnToEnd(s, s.turn.number + 1);
  const after = s.objects.get('prey');
  assert.equal(after.controllerId, 'p2', 'stwór wrócił do właściciela po turze');
  assert.equal(after.tempControlUntilTurn, null, 'flaga czasowej kontroli wyczyszczona');
});

test('B55/B1: 616 Act of Treason — wolno wskazać własnego stwora (ruling), bez zdarzenia zmiany kontroli', () => {
  const s = game();
  put(s, 'treason', 'act-of-treason');
  put(s, 'own', 'rotting-legion', 'p1', 'battlefield');
  s.objects.set('own', Object.freeze({ ...s.objects.get('own'), tapped: true }));
  addMana(s, 'p1', 3, { colors: ['R'] });

  // Ruling 2019-07-12: „Act of Treason can target any creature, even one that's
  // untapped or one you already control." — oferta musi zawierać własnego stwora.
  const offer = commands(s).find((c) => c.type === 'cast_spell' && c.objectId === 'treason');
  assert.ok(offer?.targets?.includes('own'), `własny stwór w ofercie celów: ${JSON.stringify(offer?.targets)}`);
  run(s, offer);
  resolve(s);

  const own = s.objects.get('own');
  assert.equal(own.controllerId, 'p1', 'właściciel nadal kontroluje');
  assert.equal(own.tapped, false, 'untap wykonany mimo braku zmiany kontrolera (CR 506.4: bez ruchu w walce)');
  assert.ok((own.keywordGrants ?? []).includes('haste'));
  assert.equal(s.events.filter((e) => e.type === 'control_changed' && e.objectId === 'own').length, 0,
    'brak zdarzenia zmiany kontroli, bo kontroler się nie zmienił');
});

sanity('douse-in-gloom', 617, 'FRF', 'Tarkir');
tooLittleMana('douse-in-gloom', 'cast_spell', (s) => put(s, 'tgt', 'rotting-legion', 'p2', 'battlefield'), 'U');

test('B55/B1: 617 Douse in Gloom — 2 obrażenia dla celu i 2 życia dla kontrolera', () => {
  const s = game();
  put(s, 'douse', 'douse-in-gloom');
  put(s, 'prey', 'rotting-legion', 'p2', 'battlefield'); // 4/5 — przeżywa 2 obrażenia
  addMana(s, 'p1', 3, { colors: ['B'] });
  const lifeBefore = life(s, 'p1');

  run(s, commands(s).find((c) => c.type === 'cast_spell' && c.objectId === 'douse'));
  resolve(s);

  assert.equal(s.objects.get('prey').damage, 2, 'dokładnie 2 obrażenia (nie więcej: brak deathtouch)');
  assert.equal(life(s, 'p1'), lifeBefore + 2, 'kontroler czaru zyskuje 2 życia');
  assert.equal(life(s, 'p2'), 20, 'przeciwnik nie traci życia');
});

test('B55/B1: 617 Douse in Gloom — cel nielegalny przy rozstrzygnięciu = brak efektu (CR 608.2b)', () => {
  const s = game();
  put(s, 'douse', 'douse-in-gloom');
  put(s, 'prey', 'rotting-legion', 'p2', 'battlefield');
  addMana(s, 'p1', 3, { colors: ['B'] });
  const lifeBefore = life(s, 'p1');
  run(s, commands(s).find((c) => c.type === 'cast_spell' && c.objectId === 'douse'));

  // Cel znika z pola bitwy w oknie odpowiedzi (właściwy mover stref — mutacja
  // `state.objects.set` zostawiłaby id w tablicy strefy i złamała inwarianty).
  moveObjectDirectly(s, 'prey', 'graveyard', 'prey-grave');
  resolve(s);

  assert.equal(life(s, 'p1'), lifeBefore, 'brak zysku życia przy nielegalnym jedynym celu');
  assert.equal(s.events.filter((e) => e.type === 'life_gained' && e.playerId === 'p1').length, 0);
});

test('B55/B1: 617 Douse in Gloom — instant: rzucalny w turze przeciwnika', () => {
  const s = game();
  put(s, 'douse', 'douse-in-gloom');
  put(s, 'prey', 'rotting-legion', 'p2', 'battlefield');
  addMana(s, 'p1', 3, { colors: ['B'] });
  s.turn = jumpToStep(s.turn, 'main', 'p2');
  s.turn.activePlayerId = 'p2';
  s.turn.priorityPlayerId = 'p1';

  const offer = commands(s, 'p1').find((c) => c.type === 'cast_spell' && c.objectId === 'douse');
  assert.ok(offer, 'instant ma ofertę rzutu w cudzej turze');
  run(s, offer);
  resolve(s);
  assert.equal(s.objects.get('prey').damage, 2);
});

sanity('gearsmith-prodigy', 610, 'M19', 'Kaladesh');
tooLittleMana('gearsmith-prodigy', 'cast_permanent', () => {}, 'R');

test('B55/B1: 610 Gearsmith Prodigy — +1/+0, dopóki kontrolujesz artefakt (warunek statyczny)', () => {
  const s = game();
  put(s, 'prodigy', 'gearsmith-prodigy', 'p1', 'battlefield');
  assert.equal(effectivePower(s.objects.get('prodigy'), s), 1, 'bez artefaktu baza 1/2');
  assert.equal(effectiveToughness(s.objects.get('prodigy'), s), 2);

  put(s, 'rock', 'skymarch-bloodletter', 'p2', 'battlefield'); // cudzy NIE-artefakt — kontrola negatywna
  assert.equal(effectivePower(s.objects.get('prodigy'), s), 1, 'cudzy stwór to nie artefakt');

  put(s, 'art', 'token_food', 'p1', 'battlefield');
  assert.equal(effectivePower(s.objects.get('prodigy'), s), 2, 'własny artefakt włącza warunek');
  assert.equal(effectiveToughness(s.objects.get('prodigy'), s), 2, '+1/+0, nie +1/+1');

  // Artefakt znika z pola bitwy → warunek gaśnie natychmiast (liczony przy odczycie).
  moveObjectDirectly(s, 'art', 'graveyard', 'art-grave');
  assert.equal(effectivePower(s.objects.get('prodigy'), s), 1, 'bez artefaktu bonus gaśnie');

  // Artefaktowy STWÓR też jest artefaktem (typ, nie rodzaj karty).
  put(s, 'artcreature', 'token_thopter', 'p1', 'battlefield');
  assert.equal(effectivePower(s.objects.get('prodigy'), s), 2, 'artefakt-stwór włącza warunek');
});

test('B55/B1: 610 Gearsmith Prodigy — sam nie jest artefaktem, więc nie włącza własnego bonusu', () => {
  const s = game();
  const prodigy = put(s, 'prodigy', 'gearsmith-prodigy', 'p1', 'battlefield');
  assert.ok(!(prodigy.types ?? []).includes('Artifact'), 'Oracle: Creature — Human Artificer');
  assert.equal(effectivePower(prodigy, s), 1, 'własny typ nie może włączyć warunku „kontrolujesz artefakt"');
});
