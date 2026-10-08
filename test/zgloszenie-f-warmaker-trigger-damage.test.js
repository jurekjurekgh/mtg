// =============================================================================
// Zgłoszenie F (2026-10-08, właściciel) — Warmaker Gunship:
//   „When this Spacecraft enters, it deals damage equal to the number of
//   artifacts you control to target creature an opponent controls. Bot
//   wprowadza go do gry. Ma 1 artefakt, więc zade 1 obrażenie. Powinien wybrać
//   taką moją kreaturę, dla której będzie to lethal damage (ma 4 do wyboru, w
//   tym dwie 1/1). Mimo to bot wybiera kreaturę 2/4 i nie robi mu żadnej
//   krzywdy, marnując tą zdolność. Scoring do poprawy."
//
// Pomiar PRZED (sonda `.arena/probe-f-warmaker.mjs`, prawdziwa karta):
//   c11a (1/1, lethal) = 33 | c24 (2/4) = 38 | c33 (3/3) = 39 → wybór c33.
//   Przyczyna: gałąź `resolve_trigger_target` premiowała ŚMIERTELNOŚĆ tylko z
//   `debuffKills()` (wymaga `cmd.debuff`); efekt `damage` nie nosił kwoty, więc
//   większe ciało zawsze wygrywało (2P + T).
//
// Fix: kwota obrażeń w komendzie (`cmd.damage`, TEN SAM resolver co
// rozstrzyganie — L41) + wspólny predykat `damageIsLethal` (CR 704.5g) w
// Premii `kill` (+60 wrogi / −60 własny).
//
// Plan: docs/plans/PLAN_2026-10-08-zgloszenie-f-warmaker-trigger-damage.md
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();
const READY = { summoningSick: false, summoningSickness: false };

function game() {
  const s = createGameState({ seed: 41, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main1', 'p1');
  s.turn.activePlayerId = s.turn.priorityPlayerId = 'p1';
  for (const p of ['p1', 'p2']) {
    for (let i = 0; i < 10; i += 1) {
      addObject(s, {
        id: `lib-${p}-${i}`, instanceId: `i-lib-${p}-${i}`, cardId: 'basic-plains',
        controllerId: p, ownerId: p, zone: 'library', kind: 'spell', manaCost: 0,
      });
    }
  }
  return s;
}

function put(s, id, cardId, playerId, zone = 'battlefield', patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `${cardId} w rejestrze`);
  addObject(s, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], subtypes: def.subtypes ?? [],
    keywords: def.keywords ?? [], spell: def.spell,
  });
  if (Object.keys(patch).length) s.objects.set(id, Object.freeze({ ...s.objects.get(id), ...patch }));
  return s.objects.get(id);
}

const creature = (s, id, pid, power, toughness) => addObject(s, {
  id, instanceId: `i-${id}`, cardId: `test-${id}`, controllerId: pid, ownerId: pid, zone: 'battlefield',
  kind: 'creature', power, toughness, manaCost: 2, abilities: [], keywords: [], subtypes: [],
  types: ['Creature'], colors: [],
});

/** Cast permanentu z ręki + przeskok do okna wyboru celu triggera. */
function castToTriggerWindow(s, objectId) {
  const r = execute(s, { type: 'cast_permanent', playerId: 'p1', objectId });
  assert.equal(r.ok, true, `cast ${objectId}: ${JSON.stringify(r).slice(0, 200)}`);
  for (let i = 0; i < 10; i += 1) {
    const view = playerView(s, 'p1');
    if (view.legalCommands.some((c) => c.type === 'resolve_trigger_target')) return view;
    execute(s, { type: 'pass_priority', playerId: s.turn.priorityPlayerId });
  }
  throw new Error('nie osiągnięto okna wyboru celu triggera');
}

/** Scenariusz właściciela: Warmaker Gunship (1 artefakt → 1 obrażenia) + 4 cele. */
function scenaWarmaker({ extraArtifacts = 0 } = {}) {
  const s = game();
  put(s, 'wg', 'warmaker-gunship', 'p1', 'hand');
  for (let i = 0; i < extraArtifacts; i += 1) {
    put(s, `art${i}`, 'warmaker-gunship', 'p1', 'battlefield', { ...READY, kind: 'artifact' });
  }
  addMana(s, 'p1', 3);
  creature(s, 'c11a', 'p2', 1, 1);   // lethal przy kwocie 1
  creature(s, 'c11b', 'p2', 1, 1);   // lethal przy kwocie 1
  creature(s, 'c24', 'p2', 2, 4);    // przeżywa 1 obrażenia — „marnotrawstwo" ze zgłoszenia
  creature(s, 'c33', 'p2', 3, 3);
  return castToTriggerWindow(s, 'wg');
}

function decyzja(view, seed = 5) {
  const bot = createHeuristicBot({ seed });
  const cmd = bot.chooseCommand(view);
  const scores = {};
  for (const o of bot.trace().at(-1)?.options ?? []) scores[o.cmd] = o.score;
  return { cmd, scores };
}

// =============================================================================
// F/1 — SILNIK: oferta celu triggera niesie KWOTĘ obrażeń
// =============================================================================

test('F/1: oferta resolve_trigger_target niesie `damage` = liczba artefaktów (kwota dynamiczna)', () => {
  const view = scenaWarmaker();
  const oferty = view.legalCommands.filter((c) => c.type === 'resolve_trigger_target');
  assert.equal(oferty.length, 4, `cztery cele przeciwnika (${oferty.length})`);
  // Sam statek na stole = 1 artefakt → kwota 1 (Warmaker sam się liczy).
  assert.ok(oferty.every((c) => c.damage === 1),
    `każda oferta zna kwotę 1: ${JSON.stringify(oferty.map((c) => c.damage))}`);
  assert.equal(view.pendingTriggerTarget?.effectType, 'damage');
});

test('F/1b: kwota rośnie z liczbą artefaktów (2 artefakty → 2 obrażenia)', () => {
  const view = scenaWarmaker({ extraArtifacts: 1 });
  const oferty = view.legalCommands.filter((c) => c.type === 'resolve_trigger_target');
  assert.ok(oferty.length > 0, 'są oferty celu triggera');
  assert.ok(oferty.every((c) => c.damage === 2),
    `każda oferta zna kwotę 2 (statek + dodatkowy artefakt): ${JSON.stringify(oferty.map((c) => c.damage))}`);
});

// =============================================================================
// F/2 — BOT: lethal bije większe ciało (scenariusz właściciela)
// =============================================================================

test('F/2: bot wybiera 1/1 (lethal), nie 2/4 — scenariusz właściciela', () => {
  const { cmd, scores } = decyzja(scenaWarmaker());
  assert.equal(cmd.type, 'resolve_trigger_target');
  assert.ok(['c11a', 'c11b'].includes(cmd.targetId),
    `ma trafić w 1/1, wybrał ${cmd.targetId}: ${JSON.stringify(cmd)}`);
  const lethal = Math.max(scores['resolve_trigger_target(c11a)'], scores['resolve_trigger_target(c11b)']);
  const big = Math.max(scores['resolve_trigger_target(c24)'], scores['resolve_trigger_target(c33)']);
  assert.ok(lethal > big, `lethal (${lethal}) > większe ciało (${big})`);
});

test('F/3: nota zależy od ŚMIERTELNOŚCI, nie od rozmiaru (pin formuły)', () => {
  const { scores } = decyzja(scenaWarmaker());
  // 30 + wartość(2P+T) + 60 za zabójstwo = 30 + 3 + 60 = 93; bez zabójstwa:
  // 2/4 → 30 + 8 = 38, 3/3 → 30 + 9 = 39.
  assert.equal(scores['resolve_trigger_target(c11a)'], 93);
  assert.equal(scores['resolve_trigger_target(c11b)'], 93);
  assert.equal(scores['resolve_trigger_target(c24)'], 38);
  assert.equal(scores['resolve_trigger_target(c33)'], 39);
});

// =============================================================================
// F/4 — BOT: własny stwór nie ginie od własnego triggera (Reclusive Artificer)
// =============================================================================

test('F/4: Reclusive Artificer bije WROGĄ 1/1, nie własną (lethal na własnym = kara)', () => {
  const s = game();
  put(s, 'art', 'warmaker-gunship', 'p1', 'battlefield', { ...READY, kind: 'artifact' }); // kwota 1
  put(s, 'ra', 'reclusive-artificer', 'p1', 'hand');
  addMana(s, 'p1', 4);
  creature(s, 'my11', 'p1', 1, 1);  // własna — lethal = samookaleczenie
  creature(s, 'foe11', 'p2', 1, 1); // wroga — lethal = zysk
  creature(s, 'foe24', 'p2', 2, 4); // wroga — przeżywa
  const view = castToTriggerWindow(s, 'ra');
  const { cmd, scores } = decyzja(view);
  assert.equal(cmd.targetId, 'foe11', `ma bić wrogą 1/1: ${JSON.stringify(cmd)}`);
  assert.ok(scores['resolve_trigger_target(my11)'] < scores['resolve_trigger_target(foe24)'],
    `własna 1/1 (${scores['resolve_trigger_target(my11)']}) gorzej niż nieletalny wrogi 2/4 (${scores['resolve_trigger_target(foe24)']})`);
  // Własny cel z obrażeniami śmiertelnymi: −20 − wartość(3) − 40 kary za lethal = −63.
  assert.equal(scores['resolve_trigger_target(my11)'], -63);
});

// =============================================================================
// F/5 — L41: kwota w OFERCIE równa się kwocie ROZSTRZYGNIĘCIA (jeden resolver)
// =============================================================================

test('F/5: kwota oferty == kwota efektu (2 artefakty: oferta 2, rozstrzygnięcie 2)', () => {
  const s = game();
  put(s, 'wg', 'warmaker-gunship', 'p1', 'hand');
  put(s, 'art', 'warmaker-gunship', 'p1', 'battlefield', { ...READY, kind: 'artifact' });
  addMana(s, 'p1', 3);
  creature(s, 'victim', 'p2', 2, 2);     // 2 obrażenia = lethal
  creature(s, 'bystander', 'p2', 5, 5);  // drugi kandydat — inaczej silnik sam dobiera jedyny cel
  const view = castToTriggerWindow(s, 'wg');
  const oferty = view.legalCommands.filter((c) => c.type === 'resolve_trigger_target');
  assert.equal(oferty.length, 2, `dwa kandydaci (${oferty.length})`);
  const oferta = oferty.find((c) => c.targetId === 'victim');
  assert.ok(oferta, 'jest oferta z celem victim');
  assert.equal(oferta.damage, 2, 'oferta zna kwotę 2');

  const r = execute(s, { ...oferta });
  assert.equal(r.ok, true);
  let dealt = null;
  let zginiony = null;
  for (let i = 0; i < 10 && (dealt == null || zginiony == null); i += 1) {
    const pass = execute(s, { type: 'pass_priority', playerId: s.turn.priorityPlayerId });
    for (const e of pass.events ?? []) {
      if (e.type === 'damage_dealt' && e.target === 'victim') dealt = e;
      // SBA (CR 704.3) niszczy stwora po rozstrzygnięciu — destruction.js emituje
      // `creature_destroyed` z `fromId` (obiekt ze stołu) i `object` (LKI).
      if (e.type === 'creature_destroyed' && e.fromId === 'victim') zginiony = e;
    }
  }
  assert.ok(dealt, `efekt zadał obrażenia: ${JSON.stringify(r.events)}`);
  assert.equal(dealt.amount, oferta.damage,
    `kwota efektu (${dealt.amount}) = kwota oferty (${oferta.damage}) — L41`);
  assert.ok(zginiony, '2/2 ginie od 2 obrażeń (SBA, CR 704.5g)');
  assert.equal(s.zones.battlefield.includes('victim'), false, '2/2 zeszło ze stołu');
});

// =============================================================================
// F/6 — CR 702.12b: indestructible nie ginie od obrażeń śmiertelnych
// =============================================================================

test('F/6: indestructible 1/1 NIE dostaje premii za lethal (obrażenia go nie zabiją)', () => {
  const s = game();
  put(s, 'wg', 'warmaker-gunship', 'p1', 'hand');
  addMana(s, 'p1', 3);
  creature(s, 'trup', 'p2', 1, 1);      // zwykła 1/1 — lethal
  // Ta sama 1/1, ale niezniszczalna: obrażenia są OZNACZANE, stwor przeżyje
  // (CR 702.12b) — premia za zabójstwo nie może jej przypadać.
  addObject(s, {
    id: 'trup2', instanceId: 'i-trup2', cardId: 'test-trup2', controllerId: 'p2', ownerId: 'p2',
    zone: 'battlefield', kind: 'creature', power: 1, toughness: 1, manaCost: 2, abilities: [],
    keywords: ['indestructible'], subtypes: [], types: ['Creature'], colors: [],
  });
  creature(s, 'c24', 'p2', 2, 4);       // przeżywa 1 obrażenia
  const view = castToTriggerWindow(s, 'wg');
  const { cmd, scores } = decyzja(view);
  assert.equal(cmd.targetId, 'trup', `ma bić zwykłą 1/1: ${JSON.stringify(cmd)}`);
  assert.equal(scores['resolve_trigger_target(trup)'], 93, 'lethal na zwykłym 1/1');
  assert.equal(scores['resolve_trigger_target(trup2)'], 33,
    'indestructible 1/1 = zwykła wartość ciała, BEZ premii za zabójstwo (CR 702.12b)');
  assert.equal(scores['resolve_trigger_target(c24)'], 38, '2/4 bez premii');
});
