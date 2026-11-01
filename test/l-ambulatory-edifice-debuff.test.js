// L (zgłoszenie właściciela 2026-10-29): „Karta Ambulatory Edifice. Bot
// korzysta z ETB i płaci 2 life praktycznie za nic. Nadaje do końca tury
// −1/−1 mojej kreaturze, która ma 2/2. Kompletnie bezsensowne zagranie.
// Ta zdolność ma w ogóle jakikolwiek sens TYLKO wtedy gdy zadaje lethal
// damage. Ale nawet wtedy płacenie 2 życia ma wątpliwy sens. To musiałby być
// jakiś super ważny stwór do zabicia u mnie — np. taki, którego TMC (z aurami
// i equipment) wynosi przynajmniej 5, albo taki, który ma jakieś super
// unikalne zdolności (jedyny z lataniem na stole, jedyny z manace, jedyny
// z protection albo landwalkiem który może być wykorzystany przeciwko botowi).”
//
// Root cause (L41): decyzja `resolve_optional_pay_choice` dawała bazę 75 pkt
// za SAM FAKT, że po zapłacie istnieje jakikolwiek wrogi cel (−1 + modalne
// „coś”), a koszt 2 życia to 4 pkt — więc 75 + 1 − 4 = 72 > 15 (odmowa)
// i bot płacił ZAWSZE. Wycena rzutu (tabela ETB) liczyła ujemną pompę jako
// min(3 × (|P|+|T|), 15) = 6 pkt bez sprawdzenia, czy cokolwiek ginie.
//
// Naprawa: JEDEN czytnik `debuffPayoffValue(view, target, delta)` (L41) —
// debuff „−X/−X do końca tury” jest wart czegokolwiek tylko wtedy, gdy
// (1) ZABIJA (CR 704.5f, `pumpRemovesCreature`) i (2) cel jest WAŻNY:
// inwestycja (TMC permanentu + TMC aur + TMC equipmentów) ≥
// `debuffPayoffMinInvestment` ALBO cel ma unikalną zdolność (jedyny stwór na
// stole z lataniem/menace/ochroną, landwalk działający przeciwko botowi,
// CR 702.14). Płatność musi dodatkowo przewyższyć koszt życia (L48).
// Zero nazw i ID kart (ADR 0002), zero zmian legalności — oferta i walidacja
// celu nietknięte (L48/L57).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameState, addObject, execute, playerView } from '../src/engine/game-state.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { jumpToStep } from '../src/engine/turn.js';
import { addMana } from '../src/engine/resources.js';
import { effectivePower, effectiveToughness } from '../src/engine/permanents.js';
import { createHeuristicBot } from '../src/controllers/heuristic-bot.js';
import { resolveUntilDecision, optionalPayOpen } from './helpers/deferred-trigger.js';

const REGISTRY = createCardRegistry();
const SEED = 650340;

function put(state, id, cardId, playerId, zone, patch = {}) {
  const def = REGISTRY.get(cardId);
  assert.ok(def, `${cardId} w rejestrze`);
  addObject(state, {
    id, instanceId: `i-${id}`, cardId, controllerId: playerId, ownerId: playerId, zone,
    ...gameObjectDataOf(def), types: def.types, subtypes: def.subtypes, keywords: def.keywords,
  });
  if (Object.keys(patch).length) {
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSuffix: undefined, ...patch }));
  }
  return state.objects.get(id);
}

const commands = (s) => playerView(s, s.turn.priorityPlayerId).legalCommands;

/**
 * Stół: Ambulatory Edifice w ręce, 3 many, opcjonalny wrogi stwór (`foe`
 * nadpisuje P/T/TMC — `foe()` ustawia TMC ręcznie, bo w tej rodzinie to TMC
 * decyduje o „ważności” celu), opcjonalne aury/equipmenty na celu, opcjonalny
 * mój stwór z lataniem i mój las.
 */
function scene({ foe = null, att = [], myFlying = false, myForest = false, life = 20 } = {}) {
  const s = createGameState({ seed: 65, players: [{ id: 'p1' }, { id: 'p2' }] });
  s.turn = jumpToStep(s.turn, 'main', 'p1');
  s.turn.activePlayerId = s.turn.priorityPlayerId = 'p1';
  s.players.find((p) => p.id === 'p1').life = life;
  for (const p of ['p1', 'p2']) for (let i = 0; i < 6; i++) put(s, `lib-${p}-${i}`, 'basic-swamp', p, 'library');
  put(s, 'edifice', 'ambulatory-edifice', 'p1', 'hand');
  if (foe) put(s, 'theirs', 'alaborn-trooper', 'p2', 'battlefield', foe);
  for (const [i, cardId] of att.entries()) {
    put(s, `att${i}`, cardId, 'p2', 'battlefield',
      { attachedTo: 'theirs', kind: 'aura', aura: REGISTRY.get(cardId).aura ?? null });
  }
  if (myFlying) put(s, 'mine-fly', 'alaborn-trooper', 'p1', 'battlefield', { keywords: ['flying'] });
  if (myForest) put(s, 'my-forest', 'basic-forest', 'p1', 'battlefield');
  addMana(s, 'p1', 3, { colors: ['B'] });
  return s;
}

/** Rzuca Edifice, dochodzi do decyzji „you may pay 2 life” i pyta bota. */
function decyzja(opts = {}, params = undefined) {
  const s = scene(opts);
  const cast = commands(s).find((c) => c.type === 'cast_permanent' && c.objectId === 'edifice');
  assert.ok(cast, 'oferta rzutu Ambulatory Edifice');
  assert.ok(execute(s, cast).ok);
  assert.ok(resolveUntilDecision(s, optionalPayOpen), 'decyzja „you may pay 2 life” otwarta');
  const bot = createHeuristicBot({ seed: SEED, randomness: 0, lookahead: 0, registry: REGISTRY, params });
  const choice = bot.chooseCommand(playerView(s, 'p1'));
  const options = bot.trace().at(-1)?.options ?? [];
  assert.equal(choice.type, 'resolve_optional_pay_choice', JSON.stringify(choice));
  return { state: s, choice, options, payScore: options.find((o) => o.cmd.includes('pay'))?.score,
    declineScore: options.find((o) => o.cmd.includes('pay') === false || /decline/.test(o.cmd))?.score };
}

// ── L/1: SEDNO zgłoszenia — wróg 2/2, −1/−1 nie zabija ────────────────────
test('L/1: nie płaci 2 życia za −1/−1 na wrogu 2/2 (debuff znika w cleanupie)', () => {
  const { choice } = decyzja({ foe: { power: 2, toughness: 2, manaCost: 2 } });
  assert.equal(choice.pay, false, `płacił za nic: ${JSON.stringify(choice)}`);
});

test('L/2: wrogi 2/3 (także żyje po −1/−1) — odmowa', () => {
  const { choice } = decyzja({ foe: { power: 2, toughness: 3, manaCost: 3 } });
  assert.equal(choice.pay, false);
});

test('L/3: zabija, ale cel NIEWAŻNY (1/1 za 1 manę) — odmowa', () => {
  const { state, choice } = decyzja({ foe: { power: 1, toughness: 1, manaCost: 1 } });
  assert.equal(choice.pay, false, 'wymiana 2 życia na 1/1 to strata');
  assert.equal(state.players.find((p) => p.id === 'p1').life, 20, 'życie nietknięte');
});

// ── L/4: lethal + ważny cel (TMC 5) → płaci i zabija ──────────────────────
test('L/4: zabija WAŻNY cel (TMC 5) — płaci 2 życia i stwor ginie (pełna ścieżka)', () => {
  const { state, choice, payScore } = decyzja({ foe: { power: 5, toughness: 1, manaCost: 5 } });
  assert.equal(choice.pay, true, `powinien zapłacić: ${JSON.stringify(choice)}`);
  assert.ok(payScore > 15, `zapłata musi bić odmowę (15), jest ${payScore}`);
  assert.ok(execute(state, choice).ok);
  assert.equal(state.players.find((p) => p.id === 'p1').life, 18, '2 życia zapłacone');
  const target = commands(state).find((c) => c.type === 'resolve_trigger_target' && c.targetId === 'theirs');
  assert.ok(target, 'cel refleksu wybierany po zapłacie (ruling 2023-02-04)');
  assert.ok(execute(state, target).ok);
  for (let i = 0; i < 8 && state.zones.stack.length; i += 1) {
    execute(state, { type: 'pass_priority', playerId: state.turn.priorityPlayerId });
  }
  assert.equal(state.zones.battlefield.includes('theirs'), false, '−1/−1 zabiło 5/1 (CR 704.5f)');
  assert.ok(state.zones.graveyard.length > 0, 'karta w cmentarzu');
});

// ── L/5–L/8: unikalne zdolności (model właściciela) ───────────────────────
test('L/5: jedyny stwór na stole z lataniem — płaci', () => {
  const { choice } = decyzja({ foe: { power: 1, toughness: 1, manaCost: 1, keywords: ['flying'] } });
  assert.equal(choice.pay, true);
});

test('L/6: kontra do L/5 — mój stwór też lata, więc nie jest „jedyny” — odmowa', () => {
  const { choice } = decyzja({
    foe: { power: 1, toughness: 1, manaCost: 1, keywords: ['flying'] }, myFlying: true,
  });
  assert.equal(choice.pay, false);
});

test('L/7: jedyny z menace — płaci', () => {
  const { choice } = decyzja({ foe: { power: 1, toughness: 1, manaCost: 1, keywords: ['menace'] } });
  assert.equal(choice.pay, true);
});

test('L/8: ochrona (jakość z aury) — płaci', () => {
  const { choice } = decyzja({
    foe: { power: 1, toughness: 1, manaCost: 1 }, att: ['guildscorn-ward'],
  });
  assert.equal(choice.pay, true);
});

// ── L/9: landwalk liczy się tylko wtedy, gdy działa PRZECIWKO botowi ──────
test('L/9: forestwalk działa przeciwko botowi (mam Forest) → płaci; bez Forestu → odmowa', () => {
  // Landwalk to wydrukowana statyczna zdolność (`entry.landwalk` z widoku,
  // CR 702.14) — bierzemy prawdziwą kartę, bo deskryptor siedzi w `abilities`.
  const pytaj = (myForest) => {
    const s = scene({ myForest });
    put(s, 'walk', 'emerald-oryx', 'p2', 'battlefield', { power: 1, toughness: 1, manaCost: 1 });
    const cast = commands(s).find((c) => c.type === 'cast_permanent' && c.objectId === 'edifice');
    assert.ok(execute(s, cast).ok);
    assert.ok(resolveUntilDecision(s, optionalPayOpen));
    const bot = createHeuristicBot({ seed: SEED, randomness: 0, lookahead: 0, registry: REGISTRY });
    return bot.chooseCommand(playerView(s, 'p1'));
  };
  assert.equal(pytaj(true).pay, true, 'landwalk realnie omija moją obronę');
  assert.equal(pytaj(false).pay, false, 'bez lasu landwalk nic nie daje');
});

test('L/10: TMC celu Z AURĄ (2 + aura 3 = 5) — płaci, choć samo TMC za małe', () => {
  const bez = decyzja({ foe: { power: 2, toughness: 1, manaCost: 2 } });
  assert.equal(bez.choice.pay, false, 'TMC 2 < próg 5');
  const z = decyzja({ foe: { power: 2, toughness: 1, manaCost: 2 }, att: ['containment-membrane'] });
  assert.equal(z.choice.pay, true, 'aura podnosi inwestycję do 5');
});

// ── L/15: ważny cel, ale −1/−1 go NIE zabija → nadal odmowa ───────────────
test('L/15: ważny cel (TMC 5) przeżywający −1/−1 — odmowa (lethal jest warunkiem koniecznym)', () => {
  const { choice } = decyzja({ foe: { power: 2, toughness: 2, manaCost: 5 } });
  assert.equal(choice.pay, false, `TMC 5, ale 2/2 żyje po −1/−1: ${JSON.stringify(choice)}`);
});

// ── L/11: pokrętła sterują decyzją (nie stała w kodzie) ───────────────────
test('L/11: `debuffPayoffMinInvestment: 0` przywraca płatność na 1/1; `debuffPayoffPerPoint: 0` — odmowa nawet przy 5/1', () => {
  const luz = decyzja({ foe: { power: 1, toughness: 1, manaCost: 1 } },
    { debuffPayoffMinInvestment: 0 });
  assert.equal(luz.choice.pay, true, 'próg 0 = każdy zabity cel jest „ważny”');
  const zero = decyzja({ foe: { power: 5, toughness: 1, manaCost: 5 } },
    { debuffPayoffPerPoint: 0 });
  assert.equal(zero.choice.pay, false, 'zerowa wypłata nigdy nie przebija kosztu życia');
});

// ── L/12: kotwica anty-over-fix — sama karta dalej jest rzucana ───────────
test('L/12: karta z ciałem 3/2 dalej jest rzucana (kara dotyczy tylko opłaty za trigger)', () => {
  const s = scene({ foe: { power: 2, toughness: 2, manaCost: 2 } });
  const bot = createHeuristicBot({ seed: SEED, randomness: 0, lookahead: 0, registry: REGISTRY });
  bot.chooseCommand(playerView(s, 'p1'));
  const play = (bot.trace().at(-1)?.options ?? []).find((o) => o.cmd.includes('(edifice'));
  assert.ok(play && play.score > 60, `rzut ma sens bez opłaty: ${JSON.stringify(play)}`);
});

// ── L/13: 2 życia przy niskim stanie — koszt przebija zysk ────────────────
test('L/13: przy 5 życiach nawet ważny kill nie opłaca płatności', () => {
  const { choice } = decyzja({ foe: { power: 5, toughness: 1, manaCost: 5 }, life: 5 });
  assert.equal(choice.pay, false, `płatność przy 5 życiach: ${JSON.stringify(choice)}`);
});

// ── L/14: sanity P/T celu po pełnej ścieżce (efekt nietknięty) ────────────
test('L/14: L48/L57 — oferta, walidacja i płatność bez zmian (decyzja bota jej nie zawęża)', () => {
  // Bot NIE płaci tu (2/3 przeżyje −1/−1, patrz L/2), ale oferta i sama
  // płatność muszą działać dokładnie tak jak przed L: gramy komendy silnika
  // ręcznie, z pominięciem wyceny.
  const s = scene({ foe: { power: 2, toughness: 3, manaCost: 3 } });
  const cast = commands(s).find((c) => c.type === 'cast_permanent' && c.objectId === 'edifice');
  assert.ok(execute(s, cast).ok);
  assert.ok(resolveUntilDecision(s, optionalPayOpen));
  const pay = commands(s).find((c) => c.type === 'resolve_optional_pay_choice' && c.pay === true);
  assert.ok(pay, 'oferta zapłaty istnieje niezależnie od wyceny');
  assert.equal(pay.lifeCost, 2);
  assert.ok(execute(s, pay).ok);
  const target = commands(s).find((c) => c.type === 'resolve_trigger_target' && c.targetId === 'theirs');
  assert.ok(execute(s, target).ok);
  for (let i = 0; i < 8 && s.zones.stack.length; i += 1) {
    execute(s, { type: 'pass_priority', playerId: s.turn.priorityPlayerId });
  }
  const theirs = s.objects.get('theirs');
  assert.equal(effectivePower(theirs, s), 1, 'moc −1');
  assert.equal(effectiveToughness(theirs, s), 2, 'wytrzymałość −1 do końca tury');
});
