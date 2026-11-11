// Zgłoszenie KV właściciela (2026-11-09, Kishla Village):
//
//   „Auto-tapowanie do rzucenia czarów «nie widzi» tej karty. Mam 1 swamp,
//    4 foresty i Kishla Village. Rzucam czar za 4B. Powinienem dostać mana
//    wizard z wyborem co chcę tapnąć na te 4 colorless. Nie dostaję.
//    Auto-płatność tapuje swamp i 4 foresty.”
//
// Przyczyna ZMIERZONA sondą headless (.arena/probe-kishla.mjs, scena jak
// niżej): Kishla JEST widziana jako źródło {G} (getSourceForObject,
// manaSourcesOf, playerView.manaSource) — nie tam leży błąd. Bramka
// `countPaymentVariants` buduje klucz kształtu płatności wyłącznie
// z profilu many (`kind:kolory#ilość#kosztAktywacji`), więc podzbiór
// „Swamp + 4 Foresty” i „Swamp + 3 Foresty + Kishla” sklejają się w JEDEN
// kształt → 1 wariant → shouldOpenManaWizard false → stół wykonuje komendę
// bezpośrednio, a silnik tapuje pierwsze źródła z kolei.
//
// To klasa zgłoszenia A (2026-09-10) o poziom głębiej: A rozróżnił RODZAJ
// źródła, bo tapnięcie stwora ma koszt alternatywny (nie atakuje/nie blokuje).
// Tu koszt alternatywny ponosi LĄD z dodatkową zdolnością tapującą:
// Kishla Village ma `{T}: Add {G}` ORAZ `{3}{G}, {T}: Surveil 2`. Tapnięcie
// jej na manę zabiera surveil w tej turze; tapnięcie Forestu nie zabiera nic.
//
// CR 601.2g (dosłownie, wydanie 2026-11-06): „If the total cost includes a
// mana payment, the player then has a chance to activate mana abilities
// (see rule 605, “Mana Abilities”). Mana abilities must be activated before
// costs are paid.” — wybór źródła należy do gracza.
//
// CR 602.1a (dosłownie): „The activation cost is everything before the
// colon (:). An ability’s activation cost must be paid by the player who
// is activating it.” — {T} jest kosztem obu zdolności, więc użycia
// konkurują o ten sam zasób.
//
// CR 605.1a (dosłownie): „An activated ability is a mana ability if it
// meets all of the following criteria: it doesn’t require a target (see
// rule 115.6), it could add mana to a player’s mana pool when it resolves,
// it’s not a loyalty ability (see rule 606, “Loyalty Abilities”), and its
// cost and effect don’t move any card to or from a library. Do not take
// into account replacement effects that may apply, other than
// self-replacement effects, when evaluating these criteria.” — surveil 2
// NIE jest zdolnością many, więc jest konkurencyjnym użyciem {T}.
//
// Anty-over-fix: dwa identyczne lądy (A/2, M202/O) i dwie identyczne Kishle
// zostają JEDNYM kształtem — sygnatura jest ta sama.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { createSession, HUMAN_ID, BOT_ID } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { gameObjectDataOf } from '../src/cards/materialize.js';
import { addObject } from '../src/engine/game-state.js';
import { jumpToStep } from '../src/engine/turn.js';
import * as manaWizard from '../src/table/mana-wizard.js';
const {
  finishWizardPayment, paymentDescriptorOf, shouldOpenManaWizard, manaSourcesOf,
  wizardProgress, countPaymentVariants,
} = manaWizard;
// Sygnatura kosztu alternatywnego: wołana przez namespace, żeby RED pokazał
// OSOBNE faile pinów (brak eksportu = TypeError w pinie), a nie jeden
// SyntaxError importu maskujący pozostałe świadków.
const alternativeTapCostSignature = (...args) => manaWizard.alternativeTapCostSignature(...args);
import { expandManaPool, producibleMana, canPayColoredCost } from '../src/engine/resources.js';
import { getSourceForObject, manaAbilityProductionOf, isSingleManualTapColorAbility } from '../src/engine/mana-sources.js';
import { activatableAbilities } from '../src/engine/permanents.js';
import { effectiveSpellManaCost } from '../src/engine/spells.js';
import { parseManaCost } from '../src/engine/mana-cost.js';
import { MANA_COSTS } from '../src/cards/mana-costs-data.js';

const source = readFileSync(new URL('../src/table/main.js', import.meta.url), 'utf8');
function localFunction(name) {
  const from = source.indexOf(`  function ${name}(`), end = source.indexOf('\n  }', from);
  assert.ok(from >= 0 && end > from, `main.js musi mieć funkcję ${name}`);
  return source.slice(from, end + 4);
}

/**
 * Scena właściciela: 1 Swamp, 4 Foresty, Kishla Village, czar za {4}{B}.
 * `lands` pozwala zbudować warianty anty-over-fix na TYM samym routerze.
 */
function fixture({ forests = 4, kishlas = 1 } = {}) {
  const registry = createCardRegistry();
  const session = createSession({ seed: 348, registry, decks: new Map([
    [HUMAN_ID, Array(20).fill('basic-forest')], [BOT_ID, Array(20).fill('basic-forest')],
  ]) });
  session.apply(session.view().legalCommands.find((c) => c.type === 'resolve_mulligan_choice' && c.keep));
  const state = session.state;
  state.turn = jumpToStep(state.turn, 'main1', HUMAN_ID);
  state.turn.activePlayerId = state.turn.priorityPlayerId = HUMAN_ID;
  function put(id, cardId, zone) {
    const card = registry.get(cardId);
    addObject(state, { id, instanceId: `i-${id}`, cardId, zone, controllerId: HUMAN_ID, ownerId: HUMAN_ID,
      ...gameObjectDataOf(card), types: card.types, subtypes: card.subtypes, keywords: card.keywords });
    state.objects.set(id, Object.freeze({ ...state.objects.get(id), summoningSickness: false }));
  }
  put('spell', 'zombie-boa', 'hand'); // {4}{B} — koszt ze zgłoszenia
  put('swamp', 'basic-swamp', 'battlefield');
  for (let i = 1; i <= forests; i += 1) put(`f${i}`, 'basic-forest', 'battlefield');
  for (let i = 1; i <= kishlas; i += 1) put(`k${i}`, 'kishla-village', 'battlefield');
  const cmd = session.view().legalCommands.find((c) => c.type === 'cast_permanent' && c.objectId === 'spell');
  assert.ok(cmd, 'silnik legalnie oferuje rzut za {4}{B}');
  return { session, cmd, registry };
}

function context(session, registry = createCardRegistry()) {
  let rendered; let handlers;
  const ctx = createContext({ session, HUMAN_ID, manaWizardParents: [], manaWizardDescriptor: null,
    els: { manaWizardBody: {} }, registry, MANA_COSTS, parseManaCost,
    effectiveSpellManaCost, paymentDescriptorOf, shouldOpenManaWizard, manaSourcesOf, wizardProgress,
    getSourceForObject, manaAbilityProductionOf, isSingleManualTapColorAbility, activatableAbilities,
    expandManaPool, producibleMana, canPayColoredCost,
    renderManaWizard: (_host, model, h) => { rendered = model; handlers = h; }, wizardSourceName: (s) => s.id,
    finishWizardPayment, autosave: () => {}, rerender: () => {}, showBotMoves: () => {},
    showNotice: () => {}, showModal: () => {}, hideModal: () => {},
  });
  runInContext(['restrictedSpellBlockedFor', 'selfTapExclusionFor', 'manaSourcesForPlayer', 'manaWizardFor',
    'refreshManaWizard', 'playDirect', 'manaSourceTapPlan', 'openNestedManaWizard',
    'returnToParentManaWizard', 'closeManaWizard'].map(localFunction).join('\n'), ctx);
  return { ctx, rendered: () => rendered, handlers: () => handlers };
}

/** Argumenty bramki dokładnie tak, jak liczy je router main.js. */
function gateArgs(session, cmd) {
  const { ctx } = context(session);
  const view = session.view();
  const descriptor = paymentDescriptorOf(cmd, view);
  const sources = ctx.manaSourcesForPlayer(null);
  return {
    sources,
    poolMana: 0,
    totalNeeded: descriptor.totalNeeded,
    requirements: descriptor.requirements,
    poolUnits: [],
    autoPayableMana: producibleMana(session.state, HUMAN_ID, null, {}, []),
    autoPayableColors: canPayColoredCost(session.state, HUMAN_ID, descriptor.requirements, null, {}),
  };
}

// --- KV/1: diagnoza — Kishla NIE jest zgubionym źródłem ---------------------

test('KV/1: Kishla Village jest pełnoprawnym źródłem {G} w widoku i na liście kreatora', () => {
  const { session } = fixture();
  const kishla = session.state.objects.get('k1');
  assert.deepEqual(getSourceForObject(kishla, session.state), { id: 'k1', cardId: 'kishla-village', colors: ['G'], amount: 1 });
  const view = session.view();
  assert.deepEqual(view.zones.battlefield.find((o) => o.id === 'k1').manaSource, { colors: ['G'], amount: 1 });
  const { ctx } = context(session);
  const row = ctx.manaSourcesForPlayer(null).find((s) => s.id === 'k1');
  assert.ok(row, 'wiersz Kishli musi być na liście źródeł');
  assert.deepEqual(row.colors, ['G']);
  assert.equal(row.amount, 1);
  assert.equal(row.command.type, 'tap_for_mana');
});

// --- KV/2–KV/4: wybór istnieje, więc kreator musi się otworzyć --------------

test('KV/2: {4}{B} przy 1 Swamp + 4 Foresty + Kishla to DWA kształty płatności', () => {
  const { session, cmd } = fixture();
  const args = gateArgs(session, cmd);
  assert.equal(args.totalNeeded, 5);
  assert.deepEqual(args.requirements, [['B']]);
  assert.equal(args.sources.length, 6);
  assert.equal(countPaymentVariants(args.sources, 0, args.totalNeeded, args.requirements, 10, []), 2,
    'Swamp + 4 Foresty vs Swamp + 3 Foresty + Kishla to dwie różne decyzje gracza');
});

test('KV/3: bramka shouldOpenManaWizard otwiera kreator w scenie właściciela', () => {
  const { session, cmd } = fixture();
  const args = gateArgs(session, cmd);
  assert.equal(args.autoPayableMana, 6, 'silnik pokryje koszt sam — bramka nie może na tym poprzestać');
  assert.equal(args.autoPayableColors, true);
  assert.equal(shouldOpenManaWizard(args), true);
});

test('KV/4: router stołu (manaWizardFor) zwraca deskryptor, nie auto-płatność', () => {
  const { session, cmd, registry } = fixture();
  const { ctx } = context(session, registry);
  const descriptor = ctx.manaWizardFor(cmd);
  assert.ok(descriptor, 'rzut za {4}{B} musi wejść do kreatora many — wybór źródeł należy do gracza (CR 601.2g)');
  assert.equal(descriptor.totalNeeded, 5);
  assert.equal(descriptor.cmd.objectId, 'spell');
});

test('KV/5: gracz może zapłacić Kishlą — czar rzucony, jeden Forest zostaje nietapnięty', () => {
  const { session, cmd, registry } = fixture();
  const { ctx, rendered, handlers } = context(session, registry);
  ctx.manaWizardDescriptor = ctx.manaWizardFor(cmd);
  assert.ok(ctx.manaWizardDescriptor, 'kreator otwarty');
  ctx.refreshManaWizard();
  assert.ok(rendered().untappedSources.some((s) => s.id === 'k1'), 'kreator pokazuje wiersz Kishli');
  for (const id of ['swamp', 'f1', 'f2', 'f3', 'k1']) handlers().onTapSource(id);
  assert.equal(session.state.objects.get('k1').tapped, true, 'Kishla tapnięta zgodnie z wyborem gracza');
  assert.equal(session.state.objects.get('f4').tapped, false, 'czwarty Forest zostaje nietapnięty');
  assert.notEqual(session.state.objects.get('spell')?.zone, 'hand', 'czar naprawdę rzucony');
});

// --- KV/6, KV/13: nośnik informacji (sygnatura kosztu alternatywnego) -------

test('KV/6: wiersz źródła niesie sygnaturę alternatywnego użycia {T}', () => {
  const { session } = fixture();
  const { ctx } = context(session);
  const rows = ctx.manaSourcesForPlayer(null);
  assert.ok(rows.find((s) => s.id === 'k1').altTap, 'Kishla ma konkurencyjne użycie {T} (surveil 2)');
  assert.ok(!rows.find((s) => s.id === 'f1').altTap, 'Forest nie ma żadnego alternatywnego użycia {T}');
  assert.ok(!rows.find((s) => s.id === 'swamp').altTap, 'Bagno też nie');
});

test('KV/13: sygnatura liczona z deskryptorów, nie z nazwy karty', () => {
  const { session } = fixture();
  const state = session.state;
  const kishla = alternativeTapCostSignature(state.objects.get('k1'));
  const forest = alternativeTapCostSignature(state.objects.get('f1'));
  assert.ok(kishla, 'surveil 2 za {3}{G},{T} jest alternatywnym użyciem tapnięcia');
  assert.equal(forest, '', 'Forest: brak');
  // Ten sam obiekt widziany przez playerView (activatableAbilities) daje tę
  // samą sygnaturę — jedno źródło prawdy dla listy i dla bramki (L41/L48).
  const viewObject = session.view().zones.battlefield.find((o) => o.id === 'k1');
  assert.equal(alternativeTapCostSignature(viewObject), kishla);
});

// --- KV/7–KV/9: anty-over-fix ----------------------------------------------

test('KV/7 (anty-over-fix): bez Kishli wybór nie istnieje — kreator zamknięty', () => {
  const { session, cmd, registry } = fixture({ forests: 5, kishlas: 0 });
  const args = gateArgs(session, cmd);
  assert.equal(countPaymentVariants(args.sources, 0, args.totalNeeded, args.requirements, 10, []), 1,
    'pięć zamiennych Forestów to jeden kształt płatności');
  assert.equal(shouldOpenManaWizard(args), false);
  const { ctx } = context(session, registry);
  assert.equal(ctx.manaWizardFor(cmd), null, "Identyczne lądy nie są wyborem (A/2, M202/O)");
});

test('KV/8 (anty-over-fix): dwie identyczne Kishle nie mnożą kształtów', () => {
  // 1 Swamp + 4 Kishle, koszt {4}{B}: trzeba tapnąć WSZYSTKIE pięć.
  const { session, cmd } = fixture({ forests: 0, kishlas: 4 });
  const args = gateArgs(session, cmd);
  assert.equal(countPaymentVariants(args.sources, 0, args.totalNeeded, args.requirements, 10, []), 1);
  assert.equal(shouldOpenManaWizard(args), false, 'jedyna możliwa płatność to tapnięcie wszystkiego');
});

test('KV/9 (anty-over-fix): sygnatura jest kanoniczna i odporna na kolejność zdolności', () => {
  const { session } = fixture({ forests: 4, kishlas: 2 });
  const state = session.state;
  const a = alternativeTapCostSignature(state.objects.get('k1'));
  const b = alternativeTapCostSignature(state.objects.get('k2'));
  assert.equal(a, b, 'dwie kopie tej samej karty mają tę samą sygnaturę');
  const reversed = { ...state.objects.get('k1'), abilities: [...state.objects.get('k1').abilities].reverse() };
  assert.equal(alternativeTapCostSignature(reversed), a, 'kolejność zdolności w danych nie zmienia decyzji (ADR 0005)');
});

// --- KV/10–KV/11: zakres sygnatury (co NIE jest alternatywą) ----------------

test('KV/10: własna zdolność many nie podnosi sygnatury', () => {
  const land = { id: 'x', abilities: [
    { type: 'activated', cost: { tap: true }, effect: { type: 'add_mana', amount: 1, colors: ['G'] } },
  ] };
  assert.equal(alternativeTapCostSignature(land), '', 'to jest ten sam wiersz źródła, nie alternatywa');
  const dual = { id: 'y', abilities: [
    { type: 'activated', cost: { tap: true }, effect: { type: 'add_mana', amount: 1, colors: ['U', 'B'] } },
  ] };
  assert.equal(alternativeTapCostSignature(dual), '');
});

test('KV/11: zdolność bez {T} w koszcie nie konkuruje o tapnięcie', () => {
  const land = { id: 'x', abilities: [
    { type: 'activated', cost: { tap: true }, effect: { type: 'add_mana', amount: 1, colors: ['G'] } },
    { type: 'activated', cost: { mana: 1 }, effect: { type: 'surveil', amount: 2 } },
    { type: 'triggered', cost: null, effect: { type: 'gain_life', amount: 1 } },
  ] };
  assert.equal(alternativeTapCostSignature(land), '', 'tapnięcie nie zabiera zdolności za samo {1} ani triggera');
  const withTap = { id: 'z', abilities: [
    { type: 'activated', cost: { tap: true }, effect: { type: 'add_mana', amount: 1, colors: ['G'] } },
    { type: 'activated', cost: { mana: 4, colors: ['G'], tap: true }, effect: { type: 'surveil', amount: 2 } },
  ] };
  assert.ok(alternativeTapCostSignature(withTap), '{T} w koszcie surveil konkuruje o ten permanent');
  assert.equal(alternativeTapCostSignature({ id: 'none' }), '', 'obiekt bez zdolności (stary widok/stub) — bez zmiany');
});

// --- KV/14–KV/15: różne alternatywy to różne decyzje; kolejność bez znaczenia

test('KV/14: dwa lądy o tym samym {G}, ale RÓŻNYM alternatywnym użyciu {T} to dwa kształty', () => {
  const { session } = fixture();
  const kishla = alternativeTapCostSignature(session.state.objects.get('k1'));
  // Syntetyczny nośnik (ADR 0029 — bez nowej karty katalogu): ląd {T}: Add {G}
  // z innym konkurencyjnym użyciem tapnięcia niż surveil.
  const other = { id: 'syn', abilities: [
    { type: 'activated', cost: { tap: true }, effect: { type: 'add_mana', amount: 1, colors: ['G'] } },
    { type: 'activated', cost: { mana: 2, tap: true }, effect: { type: 'draw_cards', amount: 1 } },
  ] };
  const otherSig = alternativeTapCostSignature(other);
  assert.ok(otherSig, 'dobór karty za {2},{T} też jest alternatywnym użyciem tapnięcia');
  assert.notEqual(otherSig, kishla, 'surveil 2 i dobranie karty to NIE ta sama strata — inna decyzja gracza');
  const base = { colors: ['G'], amount: 1, kind: 'land' };
  const rows = [{ id: 'a', ...base, altTap: kishla }, { id: 'b', ...base, altTap: otherSig }];
  assert.equal(countPaymentVariants(rows, 0, 1, [['G']], 10, []), 2,
    'zamiana jednego lądu na drugi zmienia koszt alternatywny → osobny kształt');
  const twin = [{ id: 'a', ...base, altTap: kishla }, { id: 'b', ...base, altTap: kishla }];
  assert.equal(countPaymentVariants(twin, 0, 1, [['G']], 10, []), 1,
    'ta sama alternatywa = ten sam kształt (anty-over-fix)');
});

test('KV/15: kolejność WIELU alternatywnych zdolności nie zmienia sygnatury (ADR 0005)', () => {
  const surveil = { type: 'activated', cost: { mana: 4, colors: ['G'], tap: true }, effect: { type: 'surveil', amount: 2 } };
  const draw = { type: 'activated', cost: { mana: 2, tap: true }, effect: { type: 'draw_cards', amount: 1 } };
  const mana = { type: 'activated', cost: { tap: true }, effect: { type: 'add_mana', amount: 1, colors: ['G'] } };
  const a = alternativeTapCostSignature({ id: 'a', abilities: [mana, surveil, draw] });
  const b = alternativeTapCostSignature({ id: 'b', abilities: [draw, mana, surveil] });
  assert.ok(a.includes('|'), 'dwie alternatywy muszą być obie w sygnaturze');
  assert.equal(a, b, 'kanoniczna kolejność — dane karty nie decydują o kształcie płatności');
});

test('KV/12: naprawa jest generyczna — kod nie zna nazwy ani ID karty (ADR 0002)', () => {
  const wizardSource = readFileSync(new URL('../src/table/mana-wizard.js', import.meta.url), 'utf8');
  const code = wizardSource
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').map((line) => line.replace(/(^|[^:])\/\/.*$/, '$1')).join('\n');
  assert.doesNotMatch(code, /kishla/i, 'zachowanie czytane z deskryptorów, nie z nazwy karty');
});
