// =============================================================================
// Zgłoszenie C (2026-11-04, właściciel) — Magma Pummeler:
//   „Bot wybiera największą kreaturę i zadaje jej nieśmiertelne obrażenia,
//   marnując zdolność. Powinien wybrać cel, któremu obrażenia będą lethal
//   (uwzględniając obrażenia zadane mu w walce), a jeśli nie ma takiego
//   celu — przeciwnika.”
//
// Oracle (docs/cards/scryfall-magma-pummeler.json, VOW 2021-11-19):
//   „When one or more counters are removed from this creature this way, it
//   deals that much damage to any target.” Refleks działa także po śmierci
//   źródła (LKI). Kwota = liczba ZDJĘTYCH liczników, nie bieżąca liczba
//   liczników ani kwota zapobiegniętych obrażeń.
//
// Pomiar PRZED (sonda `.arena/checkpoint/c-magma-probe.mjs`, realne karty):
//   oferty resolve_trigger_target NIE niosły `damage` (resolver kwoty nie
//   dostał kontekstu zdarzenia), więc bot omijał wspólną damageTargetValue
//   i wybierał największe ciało: shock-survives/dies → big, combat-lethal/
//   no-lethal → big. Po naprawieniu kontekstu: mniejszy cel śmiertelny,
//   ranny napastnik, a bez śmiertelnego celu przeciwnik.
//
// CR: 603.3d (cel przy ogłoszeniu), 608.2h (LKI), 120.3e (oznaczone
// obrażenia), 704.5g (śmiertelność), 510.2–510.3a (obrażenia bojowe).
// Plan: docs/plans/PLAN_2026-11-04-c-magma-lethal.md
// =============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { addCounter } from '../src/engine/counters.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';

const REGISTRY = createCardRegistry();

function game() {
  return createGameState({ seed: 17730, players: [{ id: 'p1' }, { id: 'p2' }] });
}

function put(s, id, cardId, zone, pid, patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `${cardId} w rejestrze`);
  addObject(s, {
    id, instanceId: `i-${id}`, cardId, controllerId: pid, ownerId: pid, zone,
    ...gameObjectDataOf(def), types: def.types ?? [], subtypes: def.subtypes ?? [],
    keywords: def.keywords ?? [], spell: def.spell,
  });
  if (zone === 'battlefield') {
    s.objects.set(id, Object.freeze({ ...s.objects.get(id), summoningSickness: false, tapped: false, ...patch }));
  } else if (Object.keys(patch).length) {
    s.objects.set(id, Object.freeze({ ...s.objects.get(id), ...patch }));
  }
  return s.objects.get(id);
}

function act(s, cmd) {
  assert.ok(cmd, 'brak legalnej oferty');
  const r = execute(s, cmd);
  assert.equal(r.ok, true, JSON.stringify(r).slice(0, 300));
  return r;
}

function pass(s) {
  act(s, playerView(s, s.turn.priorityPlayerId).legalCommands.find((c) => c.type === 'pass_priority'));
}

/** Okno wyboru celu refleksu: odpowiada na płatności/„you may”, potem pasuje. */
function triggerWindow(s) {
  for (let i = 0; i < 40; i += 1) {
    const pid = s.turn.priorityPlayerId ?? 'p1';
    const v = playerView(s, pid);
    if (v.legalCommands.some((c) => c.type === 'resolve_trigger_target')) return v;
    const opt = v.legalCommands.find((c) => c.type === 'resolve_optional_pay_choice')
      ?? v.legalCommands.find((c) => c.type === 'resolve_optional_trigger_choice');
    if (opt) { act(s, { ...opt, pay: true, fire: true }); continue; }
    const p = v.legalCommands.find((c) => c.type === 'pass_priority');
    if (p) { act(s, p); continue; }
    const fallback = playerView(s, 'p1');
    if (fallback.legalCommands.some((c) => c.type === 'resolve_trigger_target')) return fallback;
    throw new Error(`nie osiągnięto okna celu (krok ${s.turn.step}, priorytet ${pid})`);
  }
  throw new Error('limit rund w triggerWindow');
}

/** Dociąga stos po wyborze celu (śmierć Highland Game też może wyzwolić). */
function settle(s) {
  for (let i = 0; i < 40; i += 1) {
    const v = playerView(s, s.turn.priorityPlayerId ?? 'p1');
    const opt = v.legalCommands.find((c) => c.type === 'resolve_optional_pay_choice')
      ?? v.legalCommands.find((c) => c.type === 'resolve_optional_trigger_choice');
    if (opt) { act(s, { ...opt, pay: true, fire: true }); continue; }
    const p = v.legalCommands.find((c) => c.type === 'pass_priority');
    if (!p) return;
    act(s, p);
  }
}

function decyzja(view, seed = 7) {
  const bot = createHeuristicBot({ seed });
  const cmd = bot.chooseCommand(view);
  const scores = {};
  for (const o of bot.trace().at(-1)?.options ?? []) scores[o.cmd] = o.score;
  return { cmd, scores };
}

/** Shock przeciwnika w Magma Pummeler; bot p1 wybiera cel refleksu. */
function shockScene(counters, { small = null, ownSmall = false, foeLife = 20 } = {}) {
  const s = game();
  s.turn = jumpToStep(s.turn, 'main1', 'p2');
  s.turn.activePlayerId = s.turn.priorityPlayerId = 'p2';
  s.players.find((p) => p.id === 'p2').life = foeLife;
  put(s, 'magma', 'magma-pummeler', 'battlefield', 'p1');
  addCounter(s, 'magma', '+1/+1', counters);
  if (small) put(s, 'small', small, 'battlefield', 'p2');
  if (ownSmall) put(s, 'own', 'scouting-hawk', 'battlefield', 'p1');
  put(s, 'big', 'woolly-loxodon', 'battlefield', 'p2');
  put(s, 'shock', 'shock', 'hand', 'p2');
  addMana(s, 'p2', 1, { colors: ['R'] });
  act(s, playerView(s, 'p2').legalCommands.find((c) => c.type === 'cast_spell' && c.objectId === 'shock' && c.targets?.includes('magma')));
  pass(s); pass(s);
  return { s, view: triggerWindow(s) };
}

/** Magma blokuje Gorger Wurm; po obrażeniach bot p1 wybiera cel refleksu. */
function combatScene(counters) {
  const s = game();
  s.turn = jumpToStep(s.turn, 'declare_attackers', 'p2');
  s.turn.activePlayerId = s.turn.priorityPlayerId = 'p2';
  put(s, 'magma', 'magma-pummeler', 'battlefield', 'p1');
  addCounter(s, 'magma', '+1/+1', counters);
  put(s, 'att', 'gorger-wurm', 'battlefield', 'p2');
  put(s, 'big', 'woolly-loxodon', 'battlefield', 'p2');
  act(s, playerView(s, 'p2').legalCommands.find((c) => c.type === 'declare_attackers' && c.attackerIds?.includes('att')));
  pass(s); pass(s);
  act(s, playerView(s, 'p1').legalCommands.find((c) => c.type === 'declare_blockers' && c.assignments?.att?.includes('magma')));
  pass(s);
  act(s, playerView(s, s.turn.priorityPlayerId).legalCommands.find((c) => c.type === 'resolve_combat'));
  return { s, view: triggerWindow(s) };
}

// =============================================================================
// C/1 — źródło przeżywa: kwota w ofercie = zdjęte liczniki, cel śmiertelny
// =============================================================================

test('C/1: Shock w Magma (3 liczniki) — oferta damage=2, bot bije 2/1 nie 6/7, cel ginie', () => {
  const { s, view } = shockScene(3, { small: 'highland-game' });
  const offers = view.legalCommands.filter((c) => c.type === 'resolve_trigger_target');
  assert.ok(offers.length >= 4, `są oferty celów (${offers.length})`);
  assert.ok(offers.every((c) => c.damage === 2), `każda oferta zna kwotę 2: ${JSON.stringify(offers.map((c) => c.damage))}`);
  const { cmd } = decyzja(view);
  assert.equal(cmd.targetId, 'small', `ma bić śmiertelnie w 2/1: ${JSON.stringify(cmd)}`);
  const start = s.events.length;
  act(s, cmd);
  settle(s);
  assert.notEqual(s.objects.get('small')?.zone, 'battlefield', 'Highland Game ginie od 2 obrażeń');
  assert.equal(s.objects.get('big')?.zone, 'battlefield', 'większe ciało nie jest marnowane');
  const dealt = s.events.slice(start).find((e) => e.type === 'damage_dealt' && e.target === 'small');
  assert.ok(dealt, `refleks zadał obrażenia: ${JSON.stringify(s.events.slice(start).map((e) => e.type))}`);
  assert.equal(dealt.amount, 2, 'kwota rozstrzygnięcia = kwota oferty');
});

// =============================================================================
// C/2 — źródło ginie: LKI i kwota z kontekstu, nie z bieżących liczników
// =============================================================================

test('C/2: Shock w Magma (1 licznik) — źródło ginie, refleks damage=1 bije 1/1', () => {
  const { s, view } = shockScene(1, { small: 'scouting-hawk' });
  assert.notEqual(s.objects.get('magma')?.zone, 'battlefield', 'Magma ginie (0 toughness po zdjęciu licznika)');
  const offers = view.legalCommands.filter((c) => c.type === 'resolve_trigger_target');
  assert.ok(offers.every((c) => c.damage === 1), `LKI: kwota 1 z kontekstu: ${JSON.stringify(offers.map((c) => c.damage))}`);
  const { cmd } = decyzja(view);
  assert.equal(cmd.targetId, 'small', `ma bić śmiertelnie w 1/1: ${JSON.stringify(cmd)}`);
  act(s, cmd);
  settle(s);
  assert.notEqual(s.objects.get('small')?.zone, 'battlefield', 'Scouting Hawk ginie od 1 obrażenia');
});

// =============================================================================
// C/3 — brak śmiertelnego celu: przeciwnik, nie największe ciało ani własny stwór
// =============================================================================

test('C/3: brak śmiertelnego celu — bot wybiera przeciwnika, nie 6/7 ani własnego 1/1', () => {
  const { view } = shockScene(3, { ownSmall: true });
  const { cmd, scores } = decyzja(view);
  assert.equal(cmd.targetId, 'p2', `ma bić w przeciwnika: ${JSON.stringify(cmd)}`);
  assert.ok(scores['resolve_trigger_target(big)'] < scores['resolve_trigger_target(p2)'],
    `nieletalny chip (${scores['resolve_trigger_target(big)']}) < twarz (${scores['resolve_trigger_target(p2)']})`);
  assert.ok(scores['resolve_trigger_target(own)'] < scores['resolve_trigger_target(p2)'],
    `własny stwór (${scores['resolve_trigger_target(own)']}) < twarz`);
});

// =============================================================================
// C/4 — walka: śmiertelność liczy oznaczone obrażenia bojowe
// =============================================================================

test('C/4: Magma blokuje 5/5 — refleks 3 dobija rannego napastnika (5−3=2 ≤ 3), nie 6/7', () => {
  const { s, view } = combatScene(3);
  assert.equal(s.objects.get('att')?.damage, 3, 'obrażenia bojowe oznaczone na napastniku');
  const offers = view.legalCommands.filter((c) => c.type === 'resolve_trigger_target');
  assert.ok(offers.every((c) => c.damage === 3), `kwota 3 zdjętych liczników: ${JSON.stringify(offers.map((c) => c.damage))}`);
  const { cmd } = decyzja(view);
  assert.equal(cmd.targetId, 'att', `ma dobić rannego napastnika: ${JSON.stringify(cmd)}`);
  act(s, cmd);
  settle(s);
  assert.notEqual(s.objects.get('att')?.zone, 'battlefield', 'Gorger Wurm ginie po dobiciu');
  assert.equal(s.objects.get('big')?.zone, 'battlefield', 'zdrowy 6/7 przeżywa (nie był śmiertelnym celem)');
});

// =============================================================================
// C/5 — walka bez śmiertelnego celu: przeciwnik
// =============================================================================

test('C/5: Magma blokuje 5/5 (2 liczniki) — 2 obrażenia nie dobiją, bot wybiera przeciwnika', () => {
  const { s, view } = combatScene(2);
  assert.equal(s.objects.get('att')?.damage, 2, 'obrażenia bojowe oznaczone');
  const { cmd, scores } = decyzja(view);
  assert.equal(cmd.targetId, 'p2', `brak śmiertelnego celu → przeciwnik: ${JSON.stringify(cmd)}`);
  assert.ok(scores['resolve_trigger_target(att)'] < scores['resolve_trigger_target(p2)'],
    `ranny ale nieśmiertelny (${scores['resolve_trigger_target(att)']}) < twarz (${scores['resolve_trigger_target(p2)']})`);
});

// =============================================================================
// C/6 — śmiertelne obrażenia w gracza wygrywają z celem w stwora
// =============================================================================

test('C/6: przeciwnik na 2 życia — refleks 2 kończy grę, bot wybiera gracza nie 2/1', () => {
  const { view } = shockScene(3, { small: 'highland-game', foeLife: 2 });
  const { cmd } = decyzja(view);
  assert.equal(cmd.targetId, 'p2', `dobicie gracza: ${JSON.stringify(cmd)}`);
});
