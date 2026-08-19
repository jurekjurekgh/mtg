import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BOT_ID, HUMAN_ID, createSession } from '../src/table/session.js';
import { createCardRegistry } from '../src/cards/card-data.js';
import { parseDeckText } from '../src/cards/deck-text.js';
import { stateFingerprint } from '../src/engine/fingerprint.js';

/**
 * Warstwa sesji stołu (M5): człowiek gra z botem heurystycznym wyłącznie
 * przez protokół. Sesja sama przewija okna, w których człowiek ma do wyboru
 * wyłącznie pass, i rozgrywa ruchy bota; do człowieka zatrzymuje się dopiero
 * w oknie z prawdziwą decyzją. Testy są headless — bez DOM-u.
 */

function buildDecks(humanFile = 'green.txt', botFile = 'red.txt') {
  const registry = createCardRegistry();
  const decks = new Map([
    [HUMAN_ID, parseDeckText(fs.readFileSync(`decks/${humanFile}`, 'utf8'), registry).cardIds],
    [BOT_ID, parseDeckText(fs.readFileSync(`decks/${botFile}`, 'utf8'), registry).cardIds],
  ]);
  return { registry, decks };
}

/** Prosta polityka człowieka: preferuje rozwój planszy, czary celuje w przeciwnika. */
function chooseHumanCommand(view) {
  const ofType = (type) => view.legalCommands.filter((cmd) => cmd.type === type);
  const first = (type) => ofType(type)[0] ?? null;
  return first('draw_card')
    ?? first('play_land')
    ?? first('tap_for_mana')
    ?? first('cast_permanent')
    ?? (() => {
      const casts = ofType('cast_spell');
      const hostile = casts.find((cmd) => {
        const target = view.zones.battlefield.find((o) => o.id === cmd.targets?.[0]);
        return target && target.controllerId !== view.playerId;
      });
      return hostile ?? null;
    })()
    ?? (() => {
      const attacks = ofType('declare_attackers');
      if (!attacks.length) return null;
      return attacks.reduce((best, cmd) => (cmd.attackerIds.length > best.attackerIds.length ? cmd : best));
    })()
    ?? first('declare_blockers')
    ?? first('resolve_combat')
    ?? view.legalCommands.find((c) => c.type.startsWith('resolve_')) ?? null
    ?? first('pass_priority');
}

function playOut(session, maxMoves = 600) {
  for (let i = 0; i < maxMoves; i += 1) {
    if (session.state.status !== 'active') return i;
    const view = session.view();
    assert.equal(view.turn.priorityPlayerId, HUMAN_ID, 'sesja zatrzymała się poza oknem człowieka');
    const cmd = chooseHumanCommand(view);
    assert.ok(cmd, 'brak legalnej komendy w oknie decyzyjnym człowieka');
    const result = session.apply(cmd);
    assert.ok(result.ok, `komenda człowieka odrzucona: ${result.reason}`);
  }
  throw new Error('partia nie zakończyła się w limicie ruchów');
}

test('sesja wymaga poprawnego zestawu dwóch talii', () => {
  const { registry, decks } = buildDecks();
  assert.throws(() => createSession({ seed: 1, registry, decks: [] }), TypeError);
  assert.throws(() => createSession({ seed: 1, registry, decks: new Map([[HUMAN_ID, decks.get(HUMAN_ID)]]) }), TypeError);
});

test('świeża sesja przewija puste okna do pierwszej decyzji człowieka', () => {
  const { registry, decks } = buildDecks();
  // Seed 3 po Batch 27 (zmiana talii green/red — przelosowane hunterem).
  const session = createSession({ seed: 3, registry, decks });
  const view = session.view();
  assert.equal(view.playerId, HUMAN_ID);
  assert.equal(view.status, 'active');
  // T4 (mulligan londyński): pierwsza decyzja człowieka to ręka startowa —
  // sesja staje w untap z ofertą keep/mulligan.
  assert.equal(view.turn.phase, 'beginning');
  assert.ok(view.legalCommands.some((cmd) => cmd.type === 'resolve_mulligan_choice'), 'mulligan to pierwsza decyzja');
  assert.ok(session.apply(view.legalCommands.find((cmd) => cmd.type === 'resolve_mulligan_choice')).ok, 'keep');
  // Po zatrzymaniu ręki: untap/upkeep/draw mają wyłącznie pass (CR 103.7a —
  // pierwsza tura nie dobiera) — sesja staje w main na pierwszej decyzji.
  const view2 = session.view();
  assert.equal(view2.turn.phase, 'precombat_main');
  assert.ok(!view2.legalCommands.some((cmd) => cmd.type === 'draw_card'), 'pierwsza tura gry pomija draw step');
  const ownHand = view.zones.hand.filter((o) => !o.hidden);
  assert.equal(ownHand.length, 7, 'ręka otwarcia człowieka jest w pełni jawna dla właściciela');
  assert.ok(ownHand.every((o) => o.cardId && o.kind), 'karty własnej ręki niosą pełne dane do planowania');
});

test('odrzucona komenda nie zmienia stanu i trafia do logu', () => {
  const { registry, decks } = buildDecks();
  const session = createSession({ seed: 7, registry, decks });
  // T4: najpierw zatrzymaj rękę otwarcia (mulligan keep).
  assert.ok(session.apply(session.view().legalCommands.find((c) => c.type === 'resolve_mulligan_choice')).ok);
  const before = session.state.commands.length;
  const bogus = { type: 'play_land', playerId: HUMAN_ID, objectId: 'nie-istnieje' };
  const result = session.apply(bogus);
  assert.equal(result.ok, false);
  assert.match(result.reason, /illegal_land/);
  assert.equal(session.state.commands.length, before, 'odrzucona komenda nie wchodzi do logu replayu');
  assert.ok(session.log.some((entry) => entry.kind === 'rejection' && entry.text.includes('illegal_land')));
});

test('pełna partia człowiek–bot kończy się rozstrzygnięciem w engine', () => {
  const { registry, decks } = buildDecks();
  const session = createSession({ seed: 11, registry, decks });
  const humanMoves = playOut(session);
  assert.ok(humanMoves > 0, 'człowiek nie wykonał żadnego ruchu');
  assert.equal(session.state.status, 'finished');
  assert.ok(session.state.winnerId, 'brak zwycięzcy');
  // Bot faktycznie grał: jego komendy leżą w logu replayu.
  assert.ok(session.state.commands.some((cmd) => cmd.playerId === BOT_ID));
  // Log stołu opisuje zdarzenia po polsku, bez technicznych typów.
  const texts = session.log.map((entry) => entry.text);
  assert.ok(texts.some((t) => t.includes('dobiera')), 'log nie opisuje dobierania');
  assert.ok(texts.some((t) => t.includes('Tura gracza')), 'log nie opisuje tur');
});

test('eksport i import replayu odtwarzają partię bez odrzuceń', () => {
  const { registry, decks } = buildDecks();
  const session = createSession({ seed: 11, registry, decks });
  playOut(session);
  const text = session.exportReplayText();
  assert.match(text, /^\{"version":1,/);
  // Import na świeżej sesji w tym samym składzie talii.
  const reloader = createSession({ seed: 11, registry, decks });
  const summary = reloader.importReplayText(text);
  assert.equal(summary.steps, session.state.commands.length);
  assert.equal(summary.rejected, 0, 'replay zawiera odrzucone komendy');
  assert.equal(summary.status, 'finished');
  assert.ok(summary.winner, 'brak zwycięzcy w podsumowaniu importu');
  // Odtworzony replay doprowadza do dokładnie tego samego stanu gry.
  assert.equal(summary.fingerprint, stateFingerprint(session.state));
});

test('sesje z tym samym seedem przebiegają identycznie (bez Math.random)', () => {
  const one = buildDecks();
  const two = buildDecks();
  const a = createSession({ seed: 23, registry: one.registry, decks: one.decks });
  const b = createSession({ seed: 23, registry: two.registry, decks: two.decks });
  const moves = [];
  for (let i = 0; i < 40 && a.state.status === 'active'; i += 1) {
    const view = a.view();
    const cmd = chooseHumanCommand(view);
    moves.push(cmd);
    assert.equal(a.apply(cmd).ok, true);
  }
  for (const cmd of moves) assert.equal(b.apply(cmd).ok, true, `rozbieżność przy ${cmd.type}`);
  assert.equal(b.exportReplayText(), a.exportReplayText());
});

test('partia z czarami przechodzi przez stos i event log to opisuje', () => {
  const { registry, decks } = buildDecks('green.txt', 'red.txt');
  // Seed 4 po Batch 35 E3 (green +Trade Route Envoy, red bez zmian) —
  // przelosowane hunterem (kolejne trafienia: 17, 32).
  const session = createSession({ seed: 4, registry, decks });
  playOut(session);
  // W obu taliach są instants — w długiej partii któryś musiał zostać rzucony.
  assert.ok(
    session.state.events.some((e) => e.type === 'spell_cast'),
    'żaden czar nie został rzucony w całej partii',
  );
});

// --- Etykiety logu dla zdarzeń Batchu 18 (2026-08-06) -----------------------
// Seedy/kombinacje zamrożone pomiarem (dokument w duchu ADR 0005): przy
// zmianie talii lub przepływu gry należy je przelosować tym samym hunterem.

function logEventTexts(session) {
  return session.log.filter((entry) => entry.kind === 'event').map((entry) => entry.text);
}

test('log opisuje decyzję devour (Gorger Wurm) — wymaganie i poświęcenie', () => {
  const { registry, decks } = buildDecks('green.txt', 'innistrad.txt');
  // Seed 4 po Batchu 21 (zmiana talii green/innistrad — przelosowane hunterem).
  // Seed 28 po dodaniu Batch 22/23 do talii green/innistrad (przelosowane hunterem).
  // Seed 3 po Batchu 33 (innistrad +2 karty: Somberwald Spider, Murder of
  // Crows) — poprzedni seed przestał odtwarzać scenariusz devour.
  // Seed 16 po transzy 2 batcha 33 (green +2, innistrad +1) — przelosowane hunterem.
  // Seed 28 po batchu 34 (green +1, innistrad +1) — przelosowane hunterem.
  // Seed 81 po Batch 35 E2 (innistrad +Wolfkin Bond +Mark of the Vampire) —
  // przelosowane hunterem (kolejne trafienia: 108, 166).
  // Seed 1 po Batch 35 E3 (innistrad +Blazing Torch) — przelosowane hunterem.
  const session = createSession({ seed: 1, registry, decks });
  playOut(session);
  const texts = logEventTexts(session);
  assert.ok(texts.some((t) => /^Devour \(Gorger Wurm\): .* może poświęcać inne swoje stwory \(po 1× \+1\/\+1 za każdego\)$/.test(t)),
    `brak etykiety wymagania devour: ${texts.filter((t) => t.includes('Devour')).join(' | ')}`);
  assert.ok(texts.some((t) => /^Devour \(Gorger Wurm\): .+ poświęcony — 1× licznik \+1\/\+1 na źródle/.test(t)),
    'brak etykiety poświęcenia devour');
});

test('log opisuje decyzję endure (Kin-Tree Nurturer) — wybór i tryb', () => {
  const { registry, decks } = buildDecks('green.txt', 'black.txt');
  // Seed 4 do Batch 28; po Batch 29 (black +4 karty) seed 4 przestał odtwarzać
  // scenariusz → przelosowane hunterem na seed 31 (deterministyczny przebieg).
  // Seed 2 po transzy 2 batcha 33, 9 po batchu 34, 5 po Krumar Initiate,
  // 4 po Cuombajj Witches (black +1) — przelosowane hunterem.
  // Seed 3 po M132 (dosypanie lądów wg reguły 2:1 — green +6, black +3):
  // zmiana składu talii zmienia rozdanie, więc scenariusz trzeba przelosować.
  // Seed 1 po Batch 35 E3 (black +Mindstab) — przelosowane hunterem.
  // Seed 6 po Batchu 36 (green +Feral Invocation +Grizzled Leotau +1 Forest).
  // Seed 1 po Batchu 36 E3 (black +Wretched Banquet +1 Swamp).
  const session = createSession({ seed: 10, registry, decks });
  playOut(session);
  const texts = logEventTexts(session);
  assert.ok(texts.some((t) => /^Endure \(Kin-Tree Nurturer\): Nieprzyjaciel wybiera — 1× licznik \+1\/\+1 albo token Spirit 1\/1$/.test(t)),
    `brak etykiety wymagania endure: ${texts.filter((t) => t.includes('Endure')).join(' | ')}`);
  assert.ok(texts.some((t) => /^Endure \(Kin-Tree Nurturer\): Nieprzyjaciel wybiera (token Spirit 1\/1|1× licznik \+1\/\+1 na źródle)$/.test(t)),
    'brak etykiety wyboru endure');
});

test('log opisuje cel delirium (Fear of Burning Alive) — obrażenia w stwora', () => {
  const { registry, decks } = buildDecks('green.txt', 'red.txt');
  // Seed 48 → 53 po Batch 29; po Batch 30 (red +2 karty) przelosowane na 14.
  // Seed 38 po transzy 2 batcha 33 (green +2), 12 po dołożeniu Spreading
  // Insurrection do talii red, 50 po M111 (bot wycenia tryby modalne, więc
  // gra inaczej) — przelosowane hunterem.
  // Seed 145 po batchu 34 (green +1) — scenariusz delirium jest rzadki,
  // hunter przeszedł 200 seedów.
  // Seed 22 po M122/#2: dedup ofert szukania w bibliotece zmienia liczbę
  // legalnych komend w oknie, więc polityka testu wybiera inaczej i partia
  // rozchodzi się od pierwszego szukania — przelosowane hunterem.
  // Seed 112 po M132 (green +6 lądów, red +3) — scenariusz delirium jest
  // rzadki, hunter przeszedł 400 seedów (kolejne trafienia: 136, 206).
  // Seed 18 po Batch 35 E2 (red +Titan's Strength +1 Mountain) — przelosowane
  // hunterem (kolejne trafienia: 81, 133).
  // Seed 81 po Batch 35 E3 (green +Trade Route Envoy) — przelosowane hunterem.
  // Seed 43 po Batchu 36 (green +Feral Invocation +Grizzled Leotau +1 Forest).
  // Seed 48 po Batchu 36 E4 (red +Molten Nursery).
  // Seed 87 — dokładna polityka tego pliku (hunter z chooseHumanCommand).
  // Seed 26 po Batchu 37 (green +Satyr Wayfinder) — przelosowane hunterem.
  const session = createSession({ seed: 26, registry, decks });
  playOut(session);
  const texts = logEventTexts(session);
  assert.ok(texts.some((t) => /^Delirium \(Fear of Burning Alive\):.+otrzymuje 4 obrażenia$/.test(t)),
    `brak etykiety rozstrzygnięcia delirium: ${texts.filter((t) => t.includes('Delirium')).join(' | ')}`);
});

test('log opisuje wybór kart z grobu na wierzch biblioteki (Forever Young)', () => {
  const { registry, decks } = buildDecks('green.txt', 'black.txt');
  // Seed 2 po Batch 24, seed 5 po Batch 26, seed 4 po Batch 27,
  // seed 12 po Batch 28; seed 2 po Batch 32; seed 4 po transzy 2 batcha 33;
  // seed 11 po batchu 34, 5 po Krumar Initiate, 1 po Cuombajj Witches.
  // Seed 14 po M132 (green +6 lądów, black +3) — przelosowane hunterem.
  // Seed 1 po Batch 35 E3 (green +Trade Route Envoy) — przelosowane hunterem.
  // Seed 3 po Batch 35 E3b (black +Mindstab) — przelosowane hunterem.
  // Seed 12 po Batchu 36 E3 (black +Wretched Banquet +1 Swamp).
  // Seed 6 po Batchu 37 transza A (green +Thornhide Wolves, black +Returned Centaur +Liliana's Triumph) — przelosowane hunterem.
  const session = createSession({ seed: 6, registry, decks });
  playOut(session);
  const texts = logEventTexts(session);
  assert.ok(texts.some((t) => /wybiera karty-stwory z grobu na wierzch biblioteki \(Forever Young\)/.test(t)),
    `brak etykiety wymagania graveyard-top: ${texts.filter((t) => t.includes('wierzch')).join(' | ')}`);
  assert.ok(texts.some((t) => /kończy wybieranie kart na wierzch biblioteki/.test(t))
    || texts.some((t) => /wraca z grobu na wierzch biblioteki/.test(t)),
    'brak etykiety rozstrzygnięcia graveyard-top');
});
