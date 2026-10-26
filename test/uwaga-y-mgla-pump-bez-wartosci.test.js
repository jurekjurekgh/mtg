/**
 * Uwaga Y z gry (2026-10-26) — mgła a pompowanie.
 *
 * Zgłoszenie właściciela: „Bot rzucił najpierw Revealing Wind (zapobieganie
 * wszelkim obrażeniom do końca rundy), po czym rzucić Awaken the Bear
 * i dopakował swoje stwory. Totalnie bez sensu, bo to nie ma żadnego efektu po
 * Revealing Wind. Scoring powinien uwzględniać efekty typu «no damage till the
 * end of turn».”
 *
 * Zmierzona przyczyna (sonda `chooseCommand`, nie lektura kodu): wycena pumpu
 * opiera się na SYMULACJI walki (`pumpChangesOutcome`, CR 510), a symulacja nie
 * zna efektów zastępczych — przy aktywnej mgle
 * (`view.preventAllCombatDamage`, silnik zeruje kwoty w `combat.js`, CR 615.6
 * „zapobiegnięte obrażenia nie są zadane”) Awaken the Bear w zadeklarowanej
 * walce dostawał 61 pkt, DOKŁADNIE tyle samo co bez mgły (61). Dlatego bot
 * rzucał trik, którego skutek jest z góry zerowy.
 *
 * Naprawa u root cause: jedno źródło prawdy `combatDamageRelevantNow(view)`.
 * Wyceny oparte WYŁĄCZNIE na obrażeniach walki (pump czasowy, aktywowana
 * zdolność pompująca, keywordy bojowe: first/double strike, deathtouch,
 * trample, lifelink) są przy mgle bez wartości. Debuff (−X/−X) NIE jest
 * zerowany — zabija przez SBA (CR 704.5f), niezależnie od obrażeń.
 *
 * Piny:
 *   Y/1 — czar-pump w zadeklarowanej walce przy mgle: bot PASUJE
 *         (RED przed naprawą: rzucał trik wart 61);
 *   Y/2 — ten sam czar bez mgły: bot RZUCA (anty-over-fix);
 *   Y/3 — aktywowana zdolność pompująca przy mgle: bot PASUJE (RED przed);
 *   Y/4 — ta sama zdolność bez mgły: bot AKTYWUJE (anty-over-fix);
 *   Y/5 — mgła chroni tylko obrażenia BOJOWE: czar zadający obrażenia
 *         niebojowe dalej jest rzucany (nie zero-all).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function game() {
  const state = createGameState({ seed: 60, players: [{ id: 'p1' }, { id: 'p2' }] });
  state.turn.activePlayerId = 'p1';
  state.turn = jumpToStep(state.turn, 'main1', 'p1');
  for (const pid of ['p1', 'p2']) {
    for (let i = 0; i < 10; i += 1) {
      addObject(state, {
        id: `lib-${pid}-${i}`, instanceId: `ilib-${pid}-${i}`, cardId: `test-lib-${pid}-${i}`,
        controllerId: pid, ownerId: pid, zone: 'library', kind: 'spell', manaCost: 2,
      });
    }
  }
  return state;
}

function put(state, id, cardId, controllerId, zone = 'battlefield') {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId, ownerId: controllerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], keywords: def.keywords ?? [],
    subtypes: def.subtypes ?? [], spell: def.spell, abilities: def.abilities,
  });
  if (zone === 'battlefield') {
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  }
}

function creature(state, id, controllerId, power, toughness) {
  addObject(state, {
    id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId, ownerId: controllerId,
    zone: 'battlefield', kind: 'creature', power, toughness, manaCost: 3,
    abilities: [], keywords: [], subtypes: [], types: ['Creature'], colors: [],
  });
  state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
}

function decide(view, seed = 3) {
  const bot = createHeuristicBot({ seed });
  const chosen = bot.chooseCommand(view);
  const options = bot.trace().at(-1)?.options ?? [];
  return { chosen, options };
}

const scoreOf = (options, prefix) => {
  const opt = options.find((o) => String(o.cmd).startsWith(prefix));
  return opt ? opt.score : null;
};

/** Walka zadeklarowana: p1 atakuje `atk`, p2 blokuje `blk`. */
function declaredCombat(state, atkId, blkId) {
  state.turn = jumpToStep(state.turn, 'declare_attackers', 'p1');
  execute(state, { type: 'declare_attackers', playerId: 'p1', attackerIds: [atkId] });
  execute(state, { type: 'declare_blockers', playerId: 'p2', blockers: { [atkId]: [blkId] } });
}

test('Y/1: pump w walce przy mgle to wyrzucona karta — bot PASUJE', () => {
  const state = game();
  put(state, 'bear', 'awaken-the-bear', 'p1', 'hand');
  creature(state, 'atk', 'p1', 3, 3);
  creature(state, 'blk', 'p2', 2, 2);
  declaredCombat(state, 'atk', 'blk');
  addMana(state, 'p1', 3);
  state.preventAllCombatDamage = true;
  const { chosen, options } = decide(playerView(state, 'p1'));
  assert.equal(chosen?.type, 'pass_priority',
    `przy mgle +3/+3 nic nie zmienia (CR 615.6): ${JSON.stringify(chosen)}`);
  assert.ok((scoreOf(options, 'cast_spell(bear->atk)') ?? 0) <= 0,
    `ocena pumpu musi przegrać z passem (było 61): ${scoreOf(options, 'cast_spell(bear->atk)')}`);
});

test('Y/2: ten sam pump bez mgły dalej jest rzucany (anty-over-fix)', () => {
  const state = game();
  put(state, 'bear', 'awaken-the-bear', 'p1', 'hand');
  creature(state, 'atk', 'p1', 3, 3);
  creature(state, 'blk', 'p2', 2, 2);
  declaredCombat(state, 'atk', 'blk');
  addMana(state, 'p1', 3);
  const { chosen } = decide(playerView(state, 'p1'));
  assert.equal(chosen?.type, 'cast_spell', `bez mgły trik ma sens: ${JSON.stringify(chosen)}`);
  assert.deepEqual(chosen.targets, ['atk']);
});

test('Y/3: aktywowana zdolność pompująca przy mgle — bot PASUJE', () => {
  const state = game();
  put(state, 'hound', 'fiery-hellhound', 'p1');
  creature(state, 'blk', 'p2', 3, 3);
  declaredCombat(state, 'hound', 'blk');
  addMana(state, 'p1', 1, { colors: ['R'] });
  state.preventAllCombatDamage = true;
  const { chosen } = decide(playerView(state, 'p1'));
  assert.equal(chosen?.type, 'pass_priority',
    `{R} na +1/+0 przy mgle to czysta strata many: ${JSON.stringify(chosen)}`);
});

test('Y/4: ta sama zdolność bez mgły — bot AKTYWUJE (anty-over-fix)', () => {
  const state = game();
  put(state, 'hound', 'fiery-hellhound', 'p1');
  creature(state, 'blk', 'p2', 3, 3);
  declaredCombat(state, 'hound', 'blk');
  addMana(state, 'p1', 1, { colors: ['R'] });
  const { chosen } = decide(playerView(state, 'p1'));
  assert.equal(chosen?.type, 'activate_ability',
    `bez mgły pump zmienia wynik walki (2/2 vs 3/3 → zabija blokera): ${JSON.stringify(chosen)}`);
});

test('Y/6: trik „przed atakiem" (Savage Surge) przy mgle — bot PASUJE', () => {
  // Drugie okno pumpu: beginning_of_combat, gdzie wartość bierze się
  // z „atak będzie lepszy”. Przy mgle atak jest bezwartościowy
  // (`attackIntendsCreature` −100), więc okno jest jałowe.
  const state = game();
  put(state, 'surge', 'savage-surge', 'p1', 'hand');
  creature(state, 'atk', 'p1', 2, 2);
  state.turn = jumpToStep(state.turn, 'beginning_of_combat', 'p1');
  addMana(state, 'p1', 2, { colors: ['G'] });
  state.preventAllCombatDamage = true;
  const { chosen } = decide(playerView(state, 'p1'));
  assert.equal(chosen?.type, 'pass_priority',
    `pump przed atakiem przy mgle = strata karty: ${JSON.stringify(chosen)}`);
});

test('Y/7: pump z własnym niebojowym skutkiem (Assert Perfection) dalej jest rzucany', () => {
  // Anty-over-fix NA GRANICY: ten czar (sorcery) pompuje własnego stwora,
  // a potem zadaje NIEBOJOWE obrażenia równe jego mocy — więc nawet przy
  // mgle ma realny skutek. Kara mgły dotyczy tylko samej nogi pumpu.
  const state = game();
  put(state, 'ap', 'assert-perfection', 'p1', 'hand');
  creature(state, 'mine', 'p1', 3, 3);
  creature(state, 'foe', 'p2', 2, 2);
  addMana(state, 'p1', 2, { colors: ['G'] });
  state.preventAllCombatDamage = true;
  const { chosen } = decide(playerView(state, 'p1'));
  assert.equal(chosen?.type, 'cast_spell',
    `niebojowe obrażenia nie są objęte mgłą — czar ma sens: ${JSON.stringify(chosen)}`);
  assert.deepEqual(chosen.targets, ['mine', 'foe']);
});

test('Y/5: mgła chroni tylko obrażenia BOJOWE — removal niebojowy dalej działa', () => {
  const state = game();
  put(state, 'sum', 'summary-judgment', 'p1', 'hand');
  creature(state, 'tap', 'p2', 3, 3);
  state.objects.set('tap', Object.freeze({ ...state.objects.get('tap'), tapped: true }));
  addMana(state, 'p1', 2);
  state.preventAllCombatDamage = true;
  const { chosen } = decide(playerView(state, 'p1'));
  assert.equal(chosen?.type, 'cast_spell',
    `obrażenia niebojowe nie są objęte mgłą — bot ma dobić tapniętego stwora: ${JSON.stringify(chosen)}`);
});
